import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import mariadb from "mariadb";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const url = new URL(connectionString);
if (url.protocol !== "mysql:") throw new Error("Expected a MySQL URL");
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
});

try {
  await connection.query("SET SESSION TRANSACTION READ ONLY");
  const [server] = await connection.query(
    "SELECT VERSION() AS version, DATABASE() AS databaseName, @@default_storage_engine AS defaultEngine",
  );
  const tables = await connection.query(
    "SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_ROWS AS estimatedRows FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
    [database],
  );
  console.log(JSON.stringify({ server, tables }, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
} finally {
  await connection.end();
}
