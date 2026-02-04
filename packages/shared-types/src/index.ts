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
export interface ChatResponse {
  answer: string;
  contextUsed: Pick<Note, 'id' | 'content'>[]; // Referencias a las notas que alimentaron la respuesta
}

/**
 * Payload para la creación de nuevas notas
 */
export interface CreateNoteRequest {
  content: string;
}

/**
 * Tipado para la búsqueda semántica
 */
export interface SearchQueryRequest {
  question: string;
  limit?: number;
}
