import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for agent endpoints
 * Limits to 10 requests per minute per IP address
 */
export const agentRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Demasiadas solicitudes a los agentes, intenta de nuevo más tarde',
    standardHeaders: true,
    legacyHeaders: false,
});
