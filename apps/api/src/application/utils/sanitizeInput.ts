/**
 * Sanitizes user input before sending to LLM to prevent prompt injection attacks
 * 
 * Security measures:
 * - Strips HTML tags
 * - Blocks prompt injection patterns
 * - Limits content length to 10,000 characters
 */

const MAX_CONTENT_LENGTH = 10000;

// Patterns that could be used for prompt injection
const DANGEROUS_PATTERNS = [
    /system:/gi,
    /assistant:/gi,
    /ignore previous/gi,
    /ignore all previous/gi,
    /disregard previous/gi,
    /forget previous/gi,
    /new instructions:/gi,
    /override instructions/gi,
];

export interface SanitizeOptions {
    maxLength?: number;
    stripHtml?: boolean;
    blockPatterns?: RegExp[];
}

export function sanitizeInput(
    content: string,
    options: SanitizeOptions = {}
): string {
    const {
        maxLength = MAX_CONTENT_LENGTH,
        stripHtml = true,
        blockPatterns = DANGEROUS_PATTERNS,
    } = options;

    if (!content || typeof content !== 'string') {
        return '';
    }

    let sanitized = content;

    // Strip HTML tags if enabled
    if (stripHtml) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Check for dangerous patterns
    for (const pattern of blockPatterns) {
        if (pattern.test(sanitized)) {
            // Replace dangerous patterns with safe placeholder
            sanitized = sanitized.replace(pattern, '[CONTENIDO BLOQUEADO]');
        }
    }

    // Limit content length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
}
