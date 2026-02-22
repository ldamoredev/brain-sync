/**
 * Agent configuration from environment variables
 */

export const agentConfig = {
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3', 10),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10),
    requireApproval: process.env.AGENT_REQUIRE_APPROVAL === 'true',
    checkpointEncryptionKey: process.env.CHECKPOINT_ENCRYPTION_KEY || undefined,
};

/**
 * Validates agent configuration
 * Throws error if configuration is invalid
 */
export function validateAgentConfig(): void {
    // Read fresh values from environment
    const maxRetries = parseInt(process.env.AGENT_MAX_RETRIES || '3', 10);
    const timeoutMs = parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10);
    const checkpointEncryptionKey = process.env.CHECKPOINT_ENCRYPTION_KEY;

    if (maxRetries < 1 || maxRetries > 10) {
        throw new Error('AGENT_MAX_RETRIES must be between 1 and 10');
    }

    if (timeoutMs < 1000 || timeoutMs > 600000) {
        throw new Error('AGENT_TIMEOUT_MS must be between 1000 and 600000 (10 minutes)');
    }

    // Encryption key is optional for MVP
    if (checkpointEncryptionKey && checkpointEncryptionKey.length < 32) {
        console.warn('Warning: CHECKPOINT_ENCRYPTION_KEY should be at least 32 characters for security');
    }
}
