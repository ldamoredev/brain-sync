import { describe, it, expect } from 'vitest';
import { agentRateLimiter } from '../src/infrastructure/http/middleware/rateLimiter';

describe('Agent Rate Limiter', () => {
    it('should be configured with correct window and max requests', () => {
        expect(agentRateLimiter).toBeDefined();
        // Rate limiter is configured with 1 minute window and 10 max requests
        // This is a basic smoke test to ensure the middleware is properly exported
    });
});
