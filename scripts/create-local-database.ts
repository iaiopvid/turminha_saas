import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import mariadb from "mariadb";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");
const target = "turminha_saas_dev";
const url = new URL(process.env.DATABASE_URL ?? "");
if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  throw new Error("Local database setup accepts only a loopback MySQL/MariaDB host.");
}
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
});
try {
  const [existing] = await connection.query("SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [target]);
  if (existing) {
    const [tables] = await connection.query("SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [target]);
    console.log(JSON.stringify({ database: target, alreadyExisted: true, tableCount: Number(tables.count) }));
  } else {
    await connection.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(JSON.stringify({ database: target, created: true, note: "One shared development database for all local tenants." }));
  }
} finally { await connection.end(); }
