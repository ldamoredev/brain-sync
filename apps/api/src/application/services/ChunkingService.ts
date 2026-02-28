import { randomUUID } from 'crypto';
import { VectorProvider } from '../providers/VectorProvider';
import { LLMProvider } from '../providers/LLMProvider';
import { Note } from '../../domain/entities/Note';
import { Chunk } from '../../domain/entities/Chunk';

export interface ChunkingConfig {
    maxChunkSize: number;    // default 512 tokens
    overlapSize: number;     // default 50 tokens
    minChunkSize: number;    // default 100 tokens
}

export interface ChunkBoundary {
    start: number;
    end: number;
}

// Common Spanish abbreviations that should not trigger sentence splits
const SPANISH_ABBREVIATIONS = new Set([
    'dr', 'dra', 'sr', 'sra', 'srta', 'prof', 'ing', 'lic', 'arq',
    'etc', 'fig', 'pág', 'vol', 'núm', 'art', 'cap', 'ed', 'col',
    'av', 'apdo', 'esq', 'dpto', 'núm', 'tel', 'fax', 'ref',
    'ej', 'p', 'pp', 'vs', 'aprox', 'máx', 'mín', 'núm'
]);

export class ChunkingService {
    private contextCache: Map<string, string> = new Map();

    constructor(
        private vectorProvider: VectorProvider,
        private llmProvider: LLMProvider,
        private config: ChunkingConfig
    ) {}

    /**
     * Generates contextual information for a chunk within a note
     * Provides summary, position context, and surrounding topics
     */
    private async generateContextualInfo(
        chunk: string,
        fullNote: string,
        index: number,
        totalChunks: number
    ): Promise<string> {
        // Check cache first
        const cacheKey = this.generateCacheKey(fullNote, index);
        if (this.contextCache.has(cacheKey)) {
            return this.contextCache.get(cacheKey)!;
        }

        // Generate or retrieve cached summary
        const summary = fullNote.length > 200
            ? fullNote.substring(0, 200) + '...'
            : fullNote;

        const contextParts: string[] = [
            `Parte ${index + 1} de ${totalChunks} de una nota sobre: ${summary}`
        ];

        // Add position context
        if (index === 0) {
            contextParts.push('Esta es la sección inicial.');
        } else if (index === totalChunks - 1) {
            contextParts.push('Esta es la sección final.');
        } else {
            contextParts.push('Esta es una sección intermedia.');
        }

        const contextualInfo = contextParts.join(' ');

        // Cache the result
        this.contextCache.set(cacheKey, contextualInfo);

        return contextualInfo;
    }

    /**
     * Generates a cache key from note content and chunk index
     */
    private generateCacheKey(noteContent: string, chunkIndex: number): string {
        let hash = 0;
        for (let i = 0; i < noteContent.length; i++) {
            const char = noteContent.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `${hash}_${chunkIndex}`;
    }

    /**
     * Checks if a word is a known Spanish abbreviation
     */
    private isAbbreviation(word: string): boolean {
        return SPANISH_ABBREVIATIONS.has(word.toLowerCase().replace(/\.$/, ''));
    }

    /**
     * Segments text into sentences with Spanish language support
     * Handles Spanish punctuation (¿¡) and common abbreviations
     * Returns sentences with their start positions in the original text
     */
    private segmentBySentences(text: string): Array<{ text: string; start: number; end: number }> {
        if (!text || text.trim().length === 0) {
            return [];
        }

        const sentences: Array<{ text: string; start: number; end: number }> = [];

        // Split at sentence boundaries: period/!/? followed by whitespace + uppercase or end,
        // BUT not if the word before the period is a known abbreviation.
        // We'll scan character by character to find boundaries.
        let sentenceStart = 0;
        let i = 0;

        while (i < text.length) {
            const char = text[i];

            if (char === '!' || char === '?') {
                // Exclamation and question marks (including Spanish ¡¿) always end a sentence
                // Consume consecutive punctuation
                let end = i + 1;
                while (end < text.length && /[!?.]/.test(text[end])) {
                    end++;
                }

                const sentenceText = text.substring(sentenceStart, end).trim();
                if (sentenceText.length > 0) {
                    const actualStart = text.indexOf(sentenceText, sentenceStart);
                    sentences.push({
                        text: sentenceText,
                        start: actualStart >= 0 ? actualStart : sentenceStart,
                        end: actualStart >= 0 ? actualStart + sentenceText.length : end
                    });
                }

                // Skip whitespace and opening punctuation for next sentence
                sentenceStart = end;
                while (sentenceStart < text.length && /[\s¿¡]/.test(text[sentenceStart])) {
                    sentenceStart++;
                }
                i = sentenceStart;
                continue;
            }

            if (char === '.') {
                // Check if this is an abbreviation
                // Find the word before this period
                let wordEnd = i;
                let wordStart = i - 1;
                while (wordStart >= sentenceStart && /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(text[wordStart])) {
                    wordStart--;
                }
                wordStart++;
                const wordBefore = text.substring(wordStart, wordEnd);

                // Check what comes after the period
                const afterPeriod = text.substring(i + 1);
                const nextNonSpace = afterPeriod.match(/^\s*(\S)/);

                if (this.isAbbreviation(wordBefore)) {
                    // Abbreviation - don't split
                    i++;
                    continue;
                }

                // Check for ellipsis (multiple dots)
                let dotCount = 1;
                while (i + dotCount < text.length && text[i + dotCount] === '.') {
                    dotCount++;
                }

                if (dotCount >= 2) {
                    // Ellipsis - treat as potential sentence end only if followed by uppercase
                    const end = i + dotCount;
                    const afterEllipsis = text.substring(end).trimStart();
                    if (afterEllipsis.length === 0 || /^[A-ZÁÉÍÓÚÜÑ¿¡]/.test(afterEllipsis)) {
                        const sentenceText = text.substring(sentenceStart, end).trim();
                        if (sentenceText.length > 0) {
                            const actualStart = text.indexOf(sentenceText, sentenceStart);
                            sentences.push({
                                text: sentenceText,
                                start: actualStart >= 0 ? actualStart : sentenceStart,
                                end: actualStart >= 0 ? actualStart + sentenceText.length : end
                            });
                        }
                        sentenceStart = end;
                        while (sentenceStart < text.length && /[\s¿¡]/.test(text[sentenceStart])) {
                            sentenceStart++;
                        }
                        i = sentenceStart;
                        continue;
                    }
                    i = end;
                    continue;
                }

                // Regular period - split if followed by whitespace+uppercase or end of string
                if (!nextNonSpace || /^[A-ZÁÉÍÓÚÜÑ¿¡]/.test(nextNonSpace[1])) {
                    const end = i + 1;
                    const sentenceText = text.substring(sentenceStart, end).trim();
                    if (sentenceText.length > 0) {
                        const actualStart = text.indexOf(sentenceText, sentenceStart);
                        sentences.push({
                            text: sentenceText,
                            start: actualStart >= 0 ? actualStart : sentenceStart,
                            end: actualStart >= 0 ? actualStart + sentenceText.length : end
                        });
                    }

                    sentenceStart = end;
                    while (sentenceStart < text.length && /[\s¿¡]/.test(text[sentenceStart])) {
                        sentenceStart++;
                    }
                    i = sentenceStart;
                    continue;
                }
            }

            i++;
        }

        // Handle remaining text (no trailing punctuation)
        if (sentenceStart < text.length) {
            const remaining = text.substring(sentenceStart).trim();
            if (remaining.length > 0) {
                // If sentenceStart is 0, this is the first/only sentence, so start at 0
                // Otherwise, find where the trimmed content actually starts
                let actualStart: number;
                if (sentenceStart === 0) {
                    actualStart = 0;
                } else {
                    actualStart = text.indexOf(remaining, sentenceStart);
                    if (actualStart < 0) {
                        actualStart = sentenceStart;
                    }
                }
                
                sentences.push({
                    text: remaining,
                    start: actualStart,
                    end: text.length  // Always end at the full text length to include trailing whitespace
                });
            }
        }

        // Fallback: if no sentences found, treat entire text as one sentence
        if (sentences.length === 0) {
            const trimmed = text.trim();
            if (trimmed.length > 0) {
                sentences.push({
                    text: trimmed,
                    start: 0,  // Always start at 0 for the first/only chunk
                    end: text.length  // Use full text length to include any leading/trailing whitespace
                });
            } else if (text.length > 0) {
                // Handle whitespace-only text - create a chunk with the whitespace
                sentences.push({
                    text: text,
                    start: 0,
                    end: text.length
                });
            }
        }

        return sentences;
    }

    /**
     * Creates chunk boundaries with overlap from an array of sentences
     * Groups sentences into chunks respecting maxChunkSize token limit
     * Adds overlap between adjacent chunks for better context preservation
     */
    private createChunkBoundaries(sentences: Array<{ text: string; start: number; end: number }>): ChunkBoundary[] {
        if (sentences.length === 0) {
            return [];
        }

        const boundaries: ChunkBoundary[] = [];
        let currentSentences: Array<{ text: string; start: number; end: number }> = [];
        let currentTokens = 0;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            const tokenCount = this.estimateTokenCount(sentence.text);

            // Handle edge case where single sentence exceeds chunk size
            if (tokenCount > this.config.maxChunkSize && currentSentences.length === 0) {
                boundaries.push({
                    start: sentence.start,
                    end: sentence.end
                });
                continue;
            }

            if (currentTokens + tokenCount <= this.config.maxChunkSize) {
                currentSentences.push(sentence);
                currentTokens += tokenCount;
            } else {
                // Save current chunk if it meets minimum size
                if (currentTokens >= this.config.minChunkSize) {
                    const start = currentSentences[0].start;
                    const end = currentSentences[currentSentences.length - 1].end;
                    boundaries.push({ start, end });

                    // Create overlap for next chunk
                    const overlapSentences = this.getOverlapSentencesWithPositions(
                        currentSentences,
                        this.config.overlapSize
                    );

                    // Start new chunk with overlap + current sentence
                    currentSentences = [...overlapSentences, sentence];
                    currentTokens = this.estimateTokenCount(currentSentences.map(s => s.text).join(' '));
                } else {
                    // Chunk too small, add sentence anyway
                    currentSentences.push(sentence);
                    currentTokens += tokenCount;
                }
            }
        }

        // Save final chunk
        if (currentSentences.length > 0) {
            const start = currentSentences[0].start;
            const end = currentSentences[currentSentences.length - 1].end;
            boundaries.push({ start, end });
        }

        return boundaries;
    }

    /**
     * Estimates token count for text using rough approximation
     * Uses 1 token ≈ 4 characters for Spanish text
     */
    private estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Gets sentences from the end of a chunk to create overlap
     * Selects sentences that fit within the overlap token limit
     */
    private getOverlapSentences(sentences: string[], overlapTokens: number): string[] {
        const overlap: string[] = [];
        let tokenCount = 0;

        for (let i = sentences.length - 1; i >= 0; i--) {
            const sentence = sentences[i];
            const tokens = this.estimateTokenCount(sentence);

            if (tokenCount + tokens <= overlapTokens) {
                overlap.unshift(sentence);
                tokenCount += tokens;
            } else {
                break;
            }
        }

        return overlap;
    }

    /**
     * Gets sentences from the end of a chunk to create overlap
     * Selects sentences that fit within the overlap token limit
     */
    private getOverlapSentencesWithPositions(
        sentences: Array<{ text: string; start: number; end: number }>,
        overlapTokens: number
    ): Array<{ text: string; start: number; end: number }> {
        const overlap: Array<{ text: string; start: number; end: number }> = [];
        let tokenCount = 0;

        for (let i = sentences.length - 1; i >= 0; i--) {
            const sentence = sentences[i];
            const tokens = this.estimateTokenCount(sentence.text);

            if (tokenCount + tokens <= overlapTokens) {
                overlap.unshift(sentence);
                tokenCount += tokens;
            } else {
                break;
            }
        }

        return overlap;
    }

    /**
     * Chunks a note into smaller segments with contextual embeddings
     * Returns array of Chunk entities with both standard and contextual embeddings
     */
    async chunkNote(note: Note): Promise<Chunk[]> {
        // Segment note into sentences
        const sentences = this.segmentBySentences(note.content);

        // Create chunk boundaries with overlap
        const boundaries = this.createChunkBoundaries(sentences);

        const chunks: Chunk[] = [];

        // Process each chunk
        for (let i = 0; i < boundaries.length; i++) {
            const boundary = boundaries[i];
            const chunkContent = note.content.substring(boundary.start, boundary.end);

            // Generate contextual info
            const contextualInfo = await this.generateContextualInfo(
                chunkContent,
                note.content,
                i,
                boundaries.length
            );

            // Generate both embeddings in parallel
            const [embedding, contextualEmbedding] = await Promise.all([
                this.vectorProvider.generateEmbedding(chunkContent),
                this.vectorProvider.generateEmbedding(`${contextualInfo}\n\n${chunkContent}`)
            ]);

            // Create Chunk entity
            chunks.push(new Chunk(
                randomUUID(),
                note.id,
                chunkContent,
                i,
                boundary.start,
                boundary.end,
                embedding,
                contextualEmbedding,
                new Date()
            ));
        }

        return chunks;
    }
}