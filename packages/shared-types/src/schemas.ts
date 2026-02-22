import { z } from 'zod';

export const createNoteSchema = z.object({
  content: z.string().min(5, 'Note content must be at least 5 characters long'),
});

export const askQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
});

export const executeDailyAuditSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in ISO format (YYYY-MM-DD)'),
});

export const approveExecutionSchema = z.object({
  approved: z.boolean(),
});

export const generateRoutineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in ISO format (YYYY-MM-DD)'),
});
