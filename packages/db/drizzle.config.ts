import { defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env.DATABASE_URL ?? "file:local.db";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
