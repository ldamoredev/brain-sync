export class JsonParser {
    static clean(text: string): string {
        let clean = text.trim();
        
        // Remove markdown code blocks if present
        if (clean.startsWith('```json')) {
            clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (clean.startsWith('```')) {
            clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // Find the first { and last }
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            clean = clean.substring(firstBrace, lastBrace + 1);
        }

        // Fix common JSON errors if it looks truncated or has trailing commas
        clean = clean.replace(/,\s*([\]}])/g, '$1');

        // If it's missing the closing brace but we found a first one, try to close it
        if (firstBrace !== -1 && lastBrace === -1) {
            clean += '}';
        }

        return clean;
    }

    static parseSafe<T>(text: string, fallback: T): T {
        try {
            const cleaned = this.clean(text);
            return JSON.parse(cleaned) as T;
        } catch (e) {
            console.error('[JsonParser] Failed to parse JSON:', e);
            return fallback;
        }
    }
}
