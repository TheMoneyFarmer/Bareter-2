import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

// drizzle-kit runs as its own CLI process, so the dev script's --env-file
// flag does not apply here. Load .env.local manually if it exists so
// `npm run db:push` works on a developer laptop. On Replit there is no
// .env.local (Secrets are injected directly), so this is a no-op.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (m && process.env[m[1]] === undefined) {
      const v = m[2];
      process.env[m[1]] =
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
          ? v.slice(1, -1)
          : v;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
