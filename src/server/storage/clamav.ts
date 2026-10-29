import "server-only";
import { createConnection } from "node:net";

export type ScanResult = "CLEAN" | "INFECTED" | "UNAVAILABLE";

const CHUNK_SIZE = 64 * 1024;
const SCAN_TIMEOUT_MS = 12_000;

export async function scanWithClamAv(bytes: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  const port = Number(process.env.CLAMAV_PORT || 3310);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return "UNAVAILABLE";

  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let response = "";
    let settled = false;
    const finish = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(SCAN_TIMEOUT_MS, () => finish("UNAVAILABLE"));
    socket.on("error", () => finish("UNAVAILABLE"));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (response.includes("FOUND")) return finish("INFECTED");
      if (response.includes("OK")) return finish("CLEAN");
      if (response.includes("ERROR")) return finish("UNAVAILABLE");
    });
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "ascii"));
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
  });
}
