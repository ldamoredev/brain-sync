import { AppError } from '../../domain/errors/AppError';
import { CheckpointerProvider } from '../providers/CheckpointerProvider';

/**
 * Validates that a user owns a specific thread
 * 
 * @param checkpointer - The checkpointer to load thread data
 * @param threadId - The thread ID to validate
 * @param userId - The user ID to validate against (optional for MVP)
 * @throws AppError with 404 if thread not found
 * @throws AppError with 403 if user doesn't own the thread
 */
export async function validateThreadOwnership(
    checkpointer: CheckpointerProvider,
    threadId: string,
    userId?: string
): Promise<void> {
    const checkpoint = await checkpointer.load(threadId);

    if (!checkpoint) {
        throw new AppError('Thread no encontrado', 404);
    }

    // If userId is provided and checkpoint has userId, validate ownership
    if (userId && (checkpoint as any).userId) {
        if ((checkpoint as any).userId !== userId) {
            throw new AppError('No tienes permiso para acceder a este thread', 403);
        }
    }

    // For MVP without auth, we allow access if no userId is set
    // In production with auth, this should always validate
}
