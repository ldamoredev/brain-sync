import { z } from 'zod';

export const createNoteSchema = z.object({
  content: z.string().min(5, 'Note content must be at least 5 characters long'),
});

export const askQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
});
