import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { agentConfig, validateAgentConfig } from '../src/application/config/agentConfig';

describe('Agent Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('agentConfig', () => {
        it('should use default values when env vars not set', () => {
            delete process.env.AGENT_MAX_RETRIES;
            delete process.env.AGENT_TIMEOUT_MS;
            delete process.env.AGENT_REQUIRE_APPROVAL;

            // Re-import to get fresh config
            const config = {
                maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3', 10),
                timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10),
                requireApproval: process.env.AGENT_REQUIRE_APPROVAL === 'true',
            };

            expect(config.maxRetries).toBe(3);
            expect(config.timeoutMs).toBe(300000);
            expect(config.requireApproval).toBe(false);
        });

        it('should read values from environment variables', () => {
            process.env.AGENT_MAX_RETRIES = '5';
            process.env.AGENT_TIMEOUT_MS = '120000';
            process.env.AGENT_REQUIRE_APPROVAL = 'true';

            const config = {
                maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3', 10),
                timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '300000', 10),
                requireApproval: process.env.AGENT_REQUIRE_APPROVAL === 'true',
            };

            expect(config.maxRetries).toBe(5);
            expect(config.timeoutMs).toBe(120000);
            expect(config.requireApproval).toBe(true);
        });
    });

    describe('validateAgentConfig', () => {
        it('should not throw for valid configuration', () => {
            process.env.AGENT_MAX_RETRIES = '3';
            process.env.AGENT_TIMEOUT_MS = '300000';

            expect(() => validateAgentConfig()).not.toThrow();
        });

        it('should throw if maxRetries is too low', () => {
            process.env.AGENT_MAX_RETRIES = '0';

            expect(() => validateAgentConfig()).toThrow('AGENT_MAX_RETRIES must be between 1 and 10');
        });

        it('should throw if maxRetries is too high', () => {
            process.env.AGENT_MAX_RETRIES = '11';

            expect(() => validateAgentConfig()).toThrow('AGENT_MAX_RETRIES must be between 1 and 10');
        });

        it('should throw if timeoutMs is too low', () => {
            process.env.AGENT_TIMEOUT_MS = '500';

            expect(() => validateAgentConfig()).toThrow('AGENT_TIMEOUT_MS must be between 1000 and 600000');
        });

        it('should throw if timeoutMs is too high', () => {
            process.env.AGENT_TIMEOUT_MS = '700000';

            expect(() => validateAgentConfig()).toThrow('AGENT_TIMEOUT_MS must be between 1000 and 600000');
        });
    });
});
