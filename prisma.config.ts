import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

loadEnvFile(existsSync(".env.local") ? ".env.local" : ".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
