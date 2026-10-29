import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export class StorageUnavailableError extends Error {
  constructor(message = "Armazenamento privado não está configurado.") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

type StorageConfig = { bucket: string; client: S3Client };

let client: S3Client | undefined;
let config: StorageConfig | undefined;

function storageConfig(): StorageConfig {
  if (config) return config;
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw new StorageUnavailableError();

  let endpointUrl: URL;
  try { endpointUrl = new URL(endpoint); }
  catch { throw new StorageUnavailableError("Endpoint S3 inválido."); }
  if (!["http:", "https:"].includes(endpointUrl.protocol)) throw new StorageUnavailableError("Protocolo do endpoint S3 inválido.");
  if (process.env.NODE_ENV === "production" && endpointUrl.protocol !== "https:") throw new StorageUnavailableError("Endpoint S3 de produção exige HTTPS.");

  client ??= new S3Client({
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  config = { bucket, client };
  return config;
}

type StorageDriver = "auto" | "local" | "s3";
function driver(): StorageDriver {
  const value = process.env.PRIVATE_STORAGE_DRIVER || "auto";
  if (value === "auto" || value === "local" || value === "s3") return value;
  throw new StorageUnavailableError("PRIVATE_STORAGE_DRIVER deve ser auto, local ou s3.");
}

function localRoot() {
  const configured = process.env.PRIVATE_STORAGE_LOCAL_DIR || "private-storage";
  const segments = configured.replace(/\\/g, "/").split("/");
  if (!configured || path.isAbsolute(configured) || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new StorageUnavailableError("PRIVATE_STORAGE_LOCAL_DIR deve apontar para uma subpasta relativa segura de var/.");
  return path.join(process.cwd(), "var", ...segments);
}

function localPath(key: string) {
  if (!/^local\/[A-Za-z0-9_-]{1,30}\/[A-Za-z0-9_-]{1,80}$/.test(key)) throw new StorageUnavailableError("Chave de arquivo local inválida.");
  const root = localRoot();
  const target = path.join(root, ...key.slice("local/".length).split("/"));
  if (!target.startsWith(`${root}${path.sep}`)) throw new StorageUnavailableError("Caminho de arquivo local inválido.");
  return target;
}

function hasS3Configuration() {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_REGION && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

async function putLocal(input: { key: string; bytes: Buffer }) {
  const key = `local/${input.key}`;
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try { await writeFile(target, input.bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
    const existing = await readFile(target);
    if (!existing.equals(input.bytes)) throw new StorageUnavailableError("Já existe um arquivo diferente para esta chave local.");
  }
  return key;
}

export async function storePrivateObjectLocally(input: { key: string; bytes: Buffer }) {
  const logicalKey = input.key.startsWith("local/") ? input.key.slice("local/".length) : input.key;
  if (!/^[A-Za-z0-9_-]{1,30}\/[A-Za-z0-9_-]{1,80}$/.test(logicalKey)) throw new StorageUnavailableError("Chave de arquivo inválida.");
  const localKey = `local/${logicalKey}`;
  if (input.key === localKey) return localKey;
  return putLocal({ key: logicalKey, bytes: input.bytes });
}

export function isTenantStorageKey(key: string, tenantId: string) {
  const safeTenant = tenantId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:local/)?${safeTenant}/[A-Za-z0-9_-]{1,80}$`).test(key);
}

export function isTenantObjectKey(key: string, tenantId: string, objectId: string) {
  return key === `${tenantId}/${objectId}` || key === `local/${tenantId}/${objectId}`;
}

export function isPrivateStorageConfigured() {
  try {
    const selected = driver();
    if (selected === "local" || selected === "auto") return true;
    storageConfig();
    return true;
  }
  catch { return false; }
}

export async function putPrivateObject(input: { key: string; bytes: Buffer; contentType: string; checksumSha256: string }) {
  if (!/^[A-Za-z0-9_-]{1,30}\/[A-Za-z0-9_-]{1,80}$/.test(input.key)) throw new StorageUnavailableError("Chave de arquivo inválida.");
  const selected = driver();
  if (selected === "local") return putLocal(input);
  try {
    const { bucket, client: s3 } = storageConfig();
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      Metadata: { "sha256": input.checksumSha256 },
    }));
    return input.key;
  } catch (error) {
    if (selected === "s3") throw error;
    return putLocal(input);
  }
}

export async function getPrivateObject(key: string) {
  if (key.startsWith("local/")) {
    const bytes = await readFile(localPath(key));
    return { bytes, contentLength: bytes.length };
  }
  const { bucket, client: s3 } = storageConfig();
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error("O objeto não tem conteúdo.");
  return { bytes: await object.Body.transformToByteArray(), contentLength: object.ContentLength };
}

export async function deletePrivateObject(key: string) {
  if (key.startsWith("local/")) {
    await rm(localPath(key), { force: true });
    return;
  }
  const { bucket, client: s3 } = storageConfig();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
