import { pgTable, uuid, text, timestamp, vector, integer, jsonb, date } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emotionsLog = pgTable("emotions_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id").references(() => notes.id),
    emotion: text("emotion").notNull(), // e.g., "Anxiety", "Joy"
    intensity: integer("intensity").notNull(), // 1-10
    confidence: integer("confidence"), // AI confidence score
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const triggers = pgTable("triggers", {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id").references(() => notes.id),
    description: text("description").notNull(), // e.g., "Conflict at work"
    category: text("category"), // e.g., "Social", "Work", "Internal"
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const behaviorOutcomes = pgTable("behavior_outcomes", {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id").references(() => notes.id),
    action: text("action").notNull(), // e.g., "Went for a run", "Relapsed"
    outcomeType: text("outcome_type").notNull(), // "Positive", "Negative", "Neutral"
    metrics: jsonb("metrics"), // e.g., { "duration_minutes": 30, "cost": 0 }
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailySummaries = pgTable("daily_summaries", {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().unique(),
    summary: text("summary").notNull(),
    riskLevel: integer("risk_level").notNull(), // 1-10
    keyInsights: jsonb("key_insights"), // Array of strings
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routines = pgTable("routines", {
    id: uuid("id").primaryKey().defaultRandom(),
    targetDate: date("target_date").notNull().unique(),
    activities: jsonb("activities").notNull(), // Array of { time: string, activity: string, expectedBenefit: string, completed?: boolean }
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const relationships = pgTable("relationships", {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").notNull(), // Can be Trigger ID, Emotion ID, etc.
    targetId: uuid("target_id").notNull(), // Can be Trigger ID, Emotion ID, etc.
    type: text("type").notNull(), // "CAUSES", "MITIGATES", "OCCURRED_WITH"
    weight: integer("weight").default(1), // 1-10 strength
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
