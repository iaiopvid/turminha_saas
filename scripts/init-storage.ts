import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
if (process.env.NODE_ENV === "production") throw new Error("Bucket initialization is restricted to local/test environments.");
const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required to validate the environment.");
const databaseUrl = new URL(rawDatabaseUrl);
const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
if (databaseUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !/(?:_dev|_test)$/.test(database)) {
  throw new Error("Storage initialization requires a loopback *_dev or *_test environment.");
}

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw new Error("S3_ENDPOINT, S3_REGION, S3_BUCKET and S3 credentials are required.");
const endpointUrl = new URL(endpoint);
if (!["localhost", "127.0.0.1", "::1"].includes(endpointUrl.hostname)) throw new Error("This initialization script only accepts loopback storage endpoints.");

const s3 = new S3Client({ endpoint: endpointUrl.toString().replace(/\/$/, ""), region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
try {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`Private bucket ${bucket} is already available.`);
} catch (error) {
  const statusCode = error && typeof error === "object" && "$metadata" in error
    ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
    : undefined;
  if (statusCode !== 404) {
    await s3.destroy();
    throw error;
  }
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Created private bucket ${bucket}.`);
}
await s3.destroy();
