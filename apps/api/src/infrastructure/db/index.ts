import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// En un entorno real, esto iría en un .env
const connectionString = "postgres://postgres:password@localhost:5432/brain_sync";
const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
