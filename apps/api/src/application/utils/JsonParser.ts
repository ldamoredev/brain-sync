export class JsonParser {
    static clean(text: string): string {
        let clean = text.trim();

        // Remove markdown code blocks
        if (clean.startsWith('```json')) {
            clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (clean.startsWith('```')) {
            clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // Isolate the JSON object — everything from first { to last }
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            clean = clean.substring(firstBrace, lastBrace + 1);
        } else if (firstBrace !== -1 && lastBrace === -1) {
            clean = clean.substring(firstBrace);
        }

        // Remove trailing commas before ] or }
        clean = clean.replace(/,\s*([\]}])/g, '$1');

        return clean;
    }

    // Walks the string character by character tracking parser state.
    private static walk(s: string): {
        stack: ('{' | '[')[];
        inString: boolean;
        lastStringEndPos: number;
        lastSafeStructuralPos: number;
        bareTextStart: number | null;
    } {
        const stack: ('{' | '[')[] = [];
        let inString = false;
        let escape = false;
        let lastStringEndPos = -1;
        let lastSafeStructuralPos = -1;
        let bareTextStart: number | null = null;

        for (let i = 0; i < s.length; i++) {
            const ch = s[i];

            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }

            if (ch === '"') {
                inString = !inString;
                if (!inString) lastStringEndPos = i;
                bareTextStart = null;
                continue;
            }

            if (inString) continue;

            if (ch === '{') { stack.push('{'); bareTextStart = null; continue; }
            if (ch === '[') { stack.push('['); bareTextStart = null; continue; }
            if (ch === '}') { stack.pop(); lastSafeStructuralPos = i; bareTextStart = null; continue; }
            if (ch === ']') { stack.pop(); lastSafeStructuralPos = i; bareTextStart = null; continue; }
            if (ch === ',' || ch === ':') { bareTextStart = null; continue; }
            if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;

            // Allowed bare JSON literals: true, false, null
            const slice = s.substring(i);
            if (slice.startsWith('true') || slice.startsWith('false') || slice.startsWith('null')) {
                bareTextStart = null;
                continue;
            }
            // Numbers
            if ((ch >= '0' && ch <= '9') || ch === '-') {
                bareTextStart = null;
                continue;
            }

            // Anything else outside a string is bare garbage injected by the LLM
            if (bareTextStart === null) {
                bareTextStart = i;
            }
        }

        return { stack, inString, lastStringEndPos, lastSafeStructuralPos, bareTextStart };
    }

    static repair(text: string): string {
        let s = this.clean(text);

        // Fast path — already valid
        try { JSON.parse(s); return s; } catch {}

        const state = this.walk(s);

        // ── Case 1: Bare non-JSON text injected mid-structure ───────────────
        // phi3:mini sometimes appends conversational text like "end of summary."
        // directly inside the JSON array/object after the last valid value.
        // Fix: cut at the last valid string close or structural character,
        // strip the dangling comma, then close open structures.
        if (state.bareTextStart !== null) {
            const cutAt = Math.max(state.lastStringEndPos, state.lastSafeStructuralPos);
            if (cutAt > 0) {
                s = s.substring(0, cutAt + 1);
                s = s.replace(/,\s*$/, '');
            }
        }

            // ── Case 2: Truncated mid-string ────────────────────────────────────
            // The LLM hit its token limit while writing a string value.
        // Fix: rewind to the last closed string, strip the partial key before it.
        else if (state.inString) {
            s = s.substring(0, state.lastStringEndPos + 1);
            s = s.replace(/,\s*"[^"]*$/, '');
            s = s.replace(/,\s*$/, '');
        }

        // Re-walk after cuts to get the updated open stack
        const finalState = this.walk(s);

        // Close all open structures in reverse order
        for (let i = finalState.stack.length - 1; i >= 0; i--) {
            s += finalState.stack[i] === '{' ? '}' : ']';
        }

        return s;
    }

    static parseSafe<T>(text: string, fallback: T): T {
        // Attempt 1: clean only (fast path for well-formed responses)
        try {
            return JSON.parse(this.clean(text)) as T;
        } catch {}

        // Attempt 2: full structural repair
        try {
            const repaired = this.repair(text);
            const result = JSON.parse(repaired) as T;
            console.log('[JsonParser] Repaired malformed JSON successfully');
            return result;
        } catch (e) {
            console.error('[JsonParser] Failed to parse JSON even after repair:', e);
            return fallback;
        }
    }
}