export * from './schemas';

/**
 * Entidad de Nota principal compartida entre API y Web
 */
export interface Note {
  id: string;
  content: string;
  embedding?: number[]; // Opcional en el front para ahorrar ancho de banda
  createdAt: string;    // ISO String para facilitar la serialización JSON
}

/**
 * Estructura de respuesta del motor RAG
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  isFaithful: boolean;
  metrics?: {
    faithfulness: number;
    answerRelevance: number;
  };
  contextUsed: { id: string; content: string }[];
}

export type ChatStreamEvent =
    | { type: 'meta'; sources: { id: string; content: string }[] }
    | { type: 'token'; content: string }
    | { type: 'eval'; isFaithful: boolean; reasoning?: string }
    | { type: 'done' };
