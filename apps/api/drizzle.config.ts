import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/infrastructure/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: "postgres://postgres:password@localhost:5432/brain_sync",
    },
});