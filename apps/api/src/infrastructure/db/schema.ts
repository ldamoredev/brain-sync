import { pgTable, uuid, text, timestamp, vector } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});