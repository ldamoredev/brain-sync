## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies and consolidations:

**Redundancy Analysis:**
1. Properties about score normalization (2.8, 3.9) can be combined into one comprehensive property about all scores being in [0, 1]
2. Properties about metadata preservation (1.10, 3.8, 6.5, 6.8, 6.9) can be consolidated into properties about result structure completeness
3. Properties about chunk-note relationships (5.6, 5.7, 5.10) are related and can be combined into chunk integrity properties
4. Properties about configuration validation (12.7, 12.9) and error handling (16.1-16.5) overlap in testing system resilience
5. Hit Rate and MRR computation properties (9.2, 9.3, 11.1, 11.2) are redundant - the algorithm definition subsumes the computation requirement

**Consolidated Properties:**
- Combined all score normalization into Property 1
- Combined metadata completeness into Property 2
- Combined chunk integrity into Property 3
- Separated RRF algorithm correctness from hybrid search behavior
- Focused on unique validation aspects for each component

### Property 1: Score Normalization

*For any* retrieval result from semantic search, full-text search, hybrid search, or re-ranking, the score SHALL be in the range [0, 1].

**Validates: Requirements 2.8, 3.9**

### Property 2: RRF Score Computation

*For any* two result lists and RRF parameters (k, weights), the RRF score for each document SHALL equal the sum of (weight_i / (k + rank_i)) across all lists where the document appears.

**Validates: Requirements 1.4**

### Property 3: Result Ordering Monotonicity

*For any* ranked result list (from hybrid search, re-ranking, or graph traversal), if document A appears before document B in the list, then A's score SHALL be greater than or equal to B's score.

**Validates: Requirements 1.5, 3.3**

### Property 4: Hybrid Search Result Inclusion

*For any* hybrid search operation, if either semantic search OR full-text search returns results, then hybrid search SHALL return at least one result.

**Validates: Requirements 1.8, 1.9**

### Property 5: Metadata Completeness

*For any* retrieval result returned by the system, it SHALL contain all required fields: chunkId, noteId, content, expandedContent, score, and metadata with chunkIndex and matchedChunkBounds.

**Validates: Requirements 1.10, 6.8, 18.2**

### Property 6: Chunk-Note Relationship Integrity

*For any* chunk in the database, it SHALL reference exactly one parent note that exists in the notes table, and the chunk's startChar and endChar SHALL define a valid substring of the parent note's content.

**Validates: Requirements 5.6, 6.3**

### Property 7: Chunk Index Sequentiality

*For any* note with N chunks, the chunks SHALL have indices 0, 1, 2, ..., N-1 with no gaps or duplicates.

**Validates: Requirements 5.7**

### Property 8: Chunk Boundary Validity

*For any* chunk, the boundaries SHALL satisfy: 0 <= startChar < endChar <= length(parent note content), and the substring defined by these boundaries SHALL equal the chunk's content.

**Validates: Requirements 5.10**

### Property 9: Minimum Chunk Production

*For any* note processed by the chunking service, at least one chunk SHALL be produced.

**Validates: Requirements 5.8**

### Property 10: Chunk Size Constraint

*For any* chunk produced by the chunking service (excluding edge cases of single very long sentences), the token count SHALL not exceed the configured maxChunkSize.

**Validates: Requirements 5.2**

### Property 11: Chunk Overlap Preservation

*For any* two adjacent chunks (chunk_i and chunk_{i+1}) from the same note, there SHALL exist an overlap region of approximately overlapSize tokens at the boundary.

**Validates: Requirements 5.3**

### Property 12: Sentence Boundary Respect

*For any* chunk boundary (excluding very long single sentences), the boundary SHALL align with a sentence boundary in the original text.

**Validates: Requirements 5.4**

### Property 13: Context Expansion Containment

*For any* expanded context returned for a chunk, the expanded content SHALL be a substring of the parent note's content.

**Validates: Requirements 6.3, 6.6**

### Property 14: Context Expansion Inclusion

*For any* chunk with expanded context, the original chunk content SHALL be a substring of the expanded content.

**Validates: Requirements 6.2**

### Property 15: Query Transformation Preservation

*For any* query transformation, the result SHALL contain the original query unchanged in the originalQuery field.

**Validates: Requirements 4.7**

### Property 16: Transformation Result Completeness

*For any* query transformation, the result SHALL contain all required fields: originalQuery, intent, subQueries, hydeAnswer (or null), and timestamp.

**Validates: Requirements 4.10**

### Property 17: Intent Classification Completeness

*For any* query, the query transformer SHALL assign exactly one intent from the set {factual, causal, temporal, comparative, abstract}.

**Validates: Requirements 4.1, 4.3**

### Property 18: Multi-Question Decomposition

*For any* query containing multiple distinct questions (identified by multiple question marks or conjunctions like "y también"), the query transformer SHALL produce at least two sub-queries.

**Validates: Requirements 4.2**

### Property 19: Contextual Embedding Dual Storage

*For any* chunk with contextual embeddings enabled, both the standard embedding and contextual embedding SHALL be stored in the database.

**Validates: Requirements 7.6**

### Property 20: Contextual Information Structure

*For any* contextual information generated for a chunk, it SHALL include references to the parent note summary and the chunk's position within the note.

**Validates: Requirements 7.3**

### Property 21: Graph Traversal Depth Limit

*For any* graph traversal operation, the maximum path depth SHALL not exceed the configured maxDepth parameter.

**Validates: Requirements 8.5**

### Property 22: Causal Relationship Type Filtering

*For any* graph traversal for causal queries, only relationships of types CAUSES, TRIGGERS, or LEADS_TO SHALL be followed.

**Validates: Requirements 8.2**

### Property 23: Graph Result Metadata Inclusion

*For any* retrieval result obtained through graph traversal, the metadata SHALL include the causal path (list of entity IDs) that led to the result.

**Validates: Requirements 8.9**

### Property 24: Path Relevance Ordering

*For any* set of causal paths, shorter paths (fewer hops) SHALL have higher relevance scores than longer paths.

**Validates: Requirements 8.4, 8.7**

### Property 25: Hit Rate Formula Correctness

*For any* evaluation run, Hit_Rate@k SHALL equal (number of queries with at least one relevant document in top-k) / (total number of queries).

**Validates: Requirements 11.1**

### Property 26: MRR Formula Correctness

*For any* evaluation run, MRR SHALL equal the average of (1 / rank of first relevant document) across all queries, where rank starts at 1.

**Validates: Requirements 11.2**

### Property 27: Percentile Ordering Invariant

*For any* set of latency measurements, the computed percentiles SHALL satisfy: p50 <= p95 <= p99.

**Validates: Requirements 11.6**

### Property 28: Metric Bounds

*For any* computed evaluation metrics, Hit_Rate SHALL be in [0, 1], MRR SHALL be in [0, 1], Faithfulness SHALL be in [0, 1], and Answer_Relevance SHALL be in [0, 1].

**Validates: Requirements 9.2, 9.3, 9.4, 9.5**

### Property 29: Evaluation Result Persistence

*For any* completed evaluation run, the result SHALL be stored in the database with a timestamp and configuration hash.

**Validates: Requirements 9.8**

### Property 30: Golden Dataset Entry Completeness

*For any* golden dataset entry, it SHALL contain all required fields: query, relevantNoteIds (non-empty array), expectedAnswer, category, and difficulty.

**Validates: Requirements 10.1, 10.4, 10.5**

### Property 31: Golden Dataset Note Reference Validity

*For any* golden dataset entry, all note IDs in relevantNoteIds SHALL reference existing notes in the database.

**Validates: Requirements 10.3**

### Property 32: Golden Dataset Query Uniqueness

*For any* golden dataset, no two entries SHALL have the same query text.

**Validates: Requirements 10.7**

### Property 33: Golden Dataset Round Trip

*For any* golden dataset exported to JSON and then imported, the resulting dataset SHALL be equivalent to the original (same entries with same field values).

**Validates: Requirements 10.6**

### Property 34: Configuration Validation Rejection

*For any* invalid retrieval configuration (e.g., negative chunk size, topK < 1, weights outside [0, 1]), the validation SHALL fail and reject the configuration.

**Validates: Requirements 12.7**

### Property 35: Fallback Result Non-Empty

*For any* retrieval operation where at least one component succeeds (semantic search, full-text search, or graph traversal), the system SHALL return at least one result despite other component failures.

**Validates: Requirements 16.7**

### Property 36: Error Message Language

*For any* error returned to the user, the error message SHALL be in Spanish.

**Validates: Requirements 16.10**

### Property 37: API Response Structure

*For any* successful retrieval API response, it SHALL contain an array of results where each result has all required fields: chunk_id, note_id, content, score, and metadata.

**Validates: Requirements 18.2**

### Property 38: Request Validation Failure

*For any* API request with invalid parameters (e.g., missing query, invalid topK), the validation SHALL fail with a 400 status code and Spanish error message.

**Validates: Requirements 18.5, 18.6**

### Property 39: Migration Backward Compatibility

*For any* query during the migration period, the system SHALL successfully retrieve results from both chunked notes and non-chunked notes.

**Validates: Requirements 15.3**

### Property 40: Migration ID Preservation

*For any* note migrated to chunked format, the note's ID and createdAt timestamp SHALL remain unchanged.

**Validates: Requirements 15.5**



## Error Handling

### Error Handling Strategy

The RAG system implements a multi-layered error handling approach with graceful degradation:

1. **Component-Level Fallbacks**: Each component has fallback behavior for failures
2. **Partial Results**: Return available results even if some components fail
3. **Circuit Breakers**: Prevent cascading failures from external services
4. **User-Friendly Messages**: All errors returned to users are in Spanish

### Error Scenarios and Handling

**Scenario 1: Vector Provider Failure**
```
Error: Embedding generation fails
Fallback: Use full-text search only
Impact: Reduced semantic understanding, but keyword matching still works
User Message: "Búsqueda semántica no disponible, usando búsqueda por palabras clave"
```

**Scenario 2: Full-Text Search Failure**
```
Error: PostgreSQL full-text search fails
Fallback: Use semantic search only
Impact: Reduced keyword matching precision, but semantic search still works
User Message: "Búsqueda por palabras clave no disponible, usando búsqueda semántica"
```

**Scenario 3: Re-Ranking Failure**
```
Error: LLM-based re-ranking fails or times out
Fallback: Return original retrieval order
Impact: Potentially less relevant ordering, but results still returned
User Message: No user-facing message (transparent fallback)
```

**Scenario 4: Query Transformation Failure**
```
Error: Query transformation service fails
Fallback: Use original query without transformation
Impact: No HyDE or decomposition, but basic retrieval still works
User Message: No user-facing message (transparent fallback)
```

**Scenario 5: Context Expansion Failure**
```
Error: Cannot fetch expanded context for a chunk
Fallback: Return original chunk content only
Impact: Less context, but core content still available
User Message: No user-facing message (transparent fallback)
```

**Scenario 6: Graph Traversal Failure**
```
Error: Graph database query fails
Fallback: Skip graph-based results, use vector search only
Impact: No causal path results, but standard retrieval works
User Message: No user-facing message (transparent fallback)
```

**Scenario 7: Complete Retrieval Failure**
```
Error: All retrieval methods fail
Fallback: Return empty result set with error
Impact: No results available
User Message: "No se pudieron recuperar resultados. Por favor, intenta de nuevo."
```

**Scenario 8: Database Connection Failure**
```
Error: Cannot connect to PostgreSQL
Fallback: Retry with exponential backoff (3 attempts)
Impact: Increased latency or complete failure
User Message: "Error de conexión. Por favor, intenta de nuevo más tarde."
```

**Scenario 9: Timeout Exceeded**
```
Error: Retrieval exceeds 2000ms timeout
Fallback: Return partial results if any are available
Impact: Incomplete result set
User Message: "Búsqueda parcial completada (tiempo límite excedido)"
```

**Scenario 10: Invalid Configuration**
```
Error: Invalid retrieval configuration provided
Fallback: Use default configuration
Impact: User's custom config ignored
User Message: "Configuración inválida, usando valores predeterminados"
```

### Error Logging

All errors are logged with structured context:

```typescript
logger.error('Retrieval component failed', {
    component: 'HybridSearchService',
    error: error.message,
    stack: error.stack,
    query: query,
    config: config,
    timestamp: new Date().toISOString()
});
```

### Circuit Breaker Configuration

```typescript
interface CircuitBreakerConfig {
    failureThreshold: number;      // default: 5 failures
    resetTimeout: number;          // default: 60000ms (1 minute)
    monitoringPeriod: number;      // default: 10000ms (10 seconds)
}
```

When a circuit breaker opens:
1. Subsequent requests fail fast without attempting the operation
2. After resetTimeout, the circuit enters half-open state
3. One test request is allowed through
4. If successful, circuit closes; if failed, circuit reopens



## Testing Strategy

### Testing Approach

The RAG improvements require a dual testing approach combining traditional unit/integration tests with property-based testing:

**Unit Tests**: Verify specific examples, edge cases, and error conditions
**Property Tests**: Verify universal properties across randomized inputs

Both approaches are complementary and necessary for comprehensive coverage.

### Unit Testing Strategy

**Component-Level Unit Tests**

1. **HybridSearchService**
   - Test RRF fusion with known result sets
   - Test empty result handling from one or both searches
   - Test weight configuration effects
   - Test score normalization

2. **ReRankingService**
   - Test batch processing logic
   - Test fallback when LLM fails
   - Test score ordering after re-ranking
   - Test timeout handling

3. **QueryTransformationService**
   - Test intent detection for each category
   - Test query decomposition for multi-part queries
   - Test HyDE generation
   - Test original query preservation

4. **ChunkingService**
   - Test sentence boundary detection
   - Test chunk size limits
   - Test overlap creation
   - Test contextual embedding generation
   - Test Spanish sentence segmentation

5. **ContextExpansionService**
   - Test sentence window expansion
   - Test boundary constraints
   - Test overlapping context merging

6. **EvaluationService**
   - Test Hit_Rate computation with known datasets
   - Test MRR computation with known datasets
   - Test percentile calculation
   - Test metric aggregation

**Integration Tests**

1. **End-to-End Retrieval Flow**
   - Test complete pipeline from query to results
   - Test different retrieval strategies
   - Test configuration overrides
   - Test latency requirements

2. **Database Integration**
   - Test chunk storage and retrieval
   - Test full-text search with Spanish content
   - Test vector search with pgvector
   - Test golden dataset CRUD operations

3. **API Endpoint Tests**
   - Test /api/retrieve endpoint with various queries
   - Test /api/retrieve/evaluate endpoint
   - Test request validation
   - Test error responses

4. **Migration Tests**
   - Test backward compatibility with non-chunked notes
   - Test incremental migration
   - Test ID and timestamp preservation

### Property-Based Testing Strategy

Property-based tests use randomized inputs to verify universal properties. Each test runs a minimum of 100 iterations.

**Test Library**: Use `fast-check` for TypeScript property-based testing

```bash
pnpm add -D fast-check
```

**Property Test Examples**

**Property 1: RRF Score Monotonicity**
```typescript
import { describe, it } from 'vitest';
import * as fc from 'fast-check';

describe('HybridSearchService Properties', () => {
    it('Property 1: RRF scores are monotonically decreasing', () => {
        fc.assert(
            fc.property(
                fc.array(fc.record({ id: fc.uuid(), rank: fc.nat(100) })),
                fc.array(fc.record({ id: fc.uuid(), rank: fc.nat(100) })),
                fc.nat({ max: 100 }),
                (semanticResults, ftResults, k) => {
                    const service = new HybridSearchService(mockRepo, mockVector, { rrfK: k });
                    const results = service.fuseWithRRF(semanticResults, ftResults, 10);
                    
                    // Verify monotonicity
                    for (let i = 0; i < results.length - 1; i++) {
                        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

// Feature: production-rag-improvements, Property 3: Result Ordering Monotonicity
```

**Property 2: Chunk Boundary Validity**
```typescript
it('Property 8: Chunk boundaries define valid substrings', () => {
    fc.assert(
        fc.property(
            fc.string({ minLength: 100, maxLength: 5000 }),
            (noteContent) => {
                const note = new Note(randomUUID(), noteContent, [], new Date());
                const chunks = chunkingService.chunkNote(note);
                
                for (const chunk of chunks) {
                    // Verify boundaries are valid
                    expect(chunk.startChar).toBeGreaterThanOrEqual(0);
                    expect(chunk.endChar).toBeLessThanOrEqual(noteContent.length);
                    expect(chunk.startChar).toBeLessThan(chunk.endChar);
                    
                    // Verify substring matches
                    const substring = noteContent.substring(chunk.startChar, chunk.endChar);
                    expect(chunk.content).toBe(substring);
                }
            }
        ),
        { numRuns: 100 }
    );
});

// Feature: production-rag-improvements, Property 8: Chunk Boundary Validity
```

**Property 3: Score Normalization**
```typescript
it('Property 1: All scores are normalized to [0, 1]', () => {
    fc.assert(
        fc.property(
            fc.string({ minLength: 5, maxLength: 200 }),
            async (query) => {
                const results = await retrieveUseCase.execute(query, defaultConfig);
                
                for (const result of results) {
                    expect(result.score).toBeGreaterThanOrEqual(0);
                    expect(result.score).toBeLessThanOrEqual(1);
                }
            }
        ),
        { numRuns: 100 }
    );
});

// Feature: production-rag-improvements, Property 1: Score Normalization
```

**Property 4: Context Expansion Containment**
```typescript
it('Property 13: Expanded context is substring of parent note', () => {
    fc.assert(
        fc.property(
            fc.string({ minLength: 200, maxLength: 5000 }),
            fc.nat({ max: 5 }),
            async (noteContent, sentencesBeforeAfter) => {
                const note = new Note(randomUUID(), noteContent, [], new Date());
                await noteRepo.save(note);
                
                const chunks = await chunkingService.chunkNote(note);
                await Promise.all(chunks.map(c => chunkRepo.save(c)));
                
                for (const chunk of chunks) {
                    const expanded = await contextExpansionService.expand([
                        new RetrievalResult(chunk.id, note.id, chunk.content, chunk.content, 1.0, {})
                    ]);
                    
                    // Verify expanded content is substring of note
                    expect(noteContent).toContain(expanded[0].expandedContent);
                }
            }
        ),
        { numRuns: 100 }
    );
});

// Feature: production-rag-improvements, Property 13: Context Expansion Containment
```

**Property 5: Hit Rate Formula Correctness**
```typescript
it('Property 25: Hit Rate formula is correctly applied', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    query: fc.string(),
                    retrievedIds: fc.array(fc.uuid()),
                    relevantIds: fc.array(fc.uuid())
                }),
                { minLength: 10, maxLength: 100 }
            ),
            fc.nat({ min: 1, max: 10 }),
            (testCases, k) => {
                let hitsAtK = 0;
                
                for (const testCase of testCases) {
                    const topK = testCase.retrievedIds.slice(0, k);
                    const hasHit = topK.some(id => testCase.relevantIds.includes(id));
                    if (hasHit) hitsAtK++;
                }
                
                const expectedHitRate = hitsAtK / testCases.length;
                const computedHitRate = evaluationService.computeHitRate(testCases, k);
                
                expect(computedHitRate).toBeCloseTo(expectedHitRate, 5);
            }
        ),
        { numRuns: 100 }
    );
});

// Feature: production-rag-improvements, Property 25: Hit Rate Formula Correctness
```

**Property 6: Golden Dataset Round Trip**
```typescript
it('Property 33: Golden dataset export/import preserves data', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    query: fc.string({ minLength: 5 }),
                    relevantNoteIds: fc.array(fc.uuid(), { minLength: 1 }),
                    expectedAnswer: fc.string({ minLength: 10 }),
                    category: fc.constantFrom('factual', 'causal', 'temporal', 'comparative', 'multi-part'),
                    difficulty: fc.nat({ min: 1, max: 5 })
                }),
                { minLength: 5, maxLength: 50 }
            ),
            async (entries) => {
                // Save entries
                for (const entry of entries) {
                    await goldenDatasetRepo.save(new GoldenDatasetEntry(
                        randomUUID(),
                        entry.query,
                        entry.relevantNoteIds,
                        entry.expectedAnswer,
                        entry.category,
                        entry.difficulty,
                        new Date()
                    ));
                }
                
                // Export
                const exported = await goldenDatasetRepo.exportToJson();
                
                // Clear database
                await goldenDatasetRepo.deleteAll();
                
                // Import
                await goldenDatasetRepo.importFromJson(exported);
                
                // Verify
                const imported = await goldenDatasetRepo.findAll();
                expect(imported.length).toBe(entries.length);
                
                for (const entry of entries) {
                    const found = imported.find(e => e.query === entry.query);
                    expect(found).toBeDefined();
                    expect(found.relevantNoteIds).toEqual(entry.relevantNoteIds);
                    expect(found.expectedAnswer).toBe(entry.expectedAnswer);
                }
            }
        ),
        { numRuns: 100 }
    );
});

// Feature: production-rag-improvements, Property 33: Golden Dataset Round Trip
```

### Test Coverage Goals

- Overall code coverage: >= 90%
- Critical path coverage: 100% (retrieval pipeline, RRF, chunking)
- Error handling coverage: >= 85%
- Property test coverage: All 40 correctness properties

### Performance Testing

Performance tests validate latency requirements:

```typescript
describe('Performance Requirements', () => {
    it('should complete hybrid search within 500ms', async () => {
        const start = Date.now();
        await hybridSearchService.search(query, 10);
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(500);
    });
    
    it('should complete end-to-end retrieval within 2000ms for p95', async () => {
        const latencies: number[] = [];
        
        for (let i = 0; i < 100; i++) {
            const start = Date.now();
            await retrieveUseCase.execute(randomQuery(), defaultConfig);
            latencies.push(Date.now() - start);
        }
        
        latencies.sort((a, b) => a - b);
        const p95 = latencies[Math.floor(0.95 * latencies.length)];
        
        expect(p95).toBeLessThan(2000);
    });
});
```

### Test Data Management

**Test Fixtures**
- Create reusable test notes in Spanish
- Create golden dataset samples for each query category
- Create mock embeddings for deterministic tests

**Test Database**
- Use separate test database
- Reset database before each test suite
- Seed with minimal required data

**Mock Services**
- Mock VectorProvider for deterministic embeddings
- Mock LLMProvider for predictable responses
- Mock external services to avoid network calls



## API Specifications

### Retrieval Endpoint

**POST /api/retrieve**

Retrieves relevant documents for a given query using the configured retrieval strategy.

**Request Schema**
```typescript
interface RetrieveRequest {
    query: string;                          // Required: User query
    config?: Partial<RetrievalConfig>;      // Optional: Override default config
    topK?: number;                          // Optional: Number of results (default: 5)
    strategy?: 'semantic' | 'fulltext' | 'hybrid' | 'hybrid+rerank';  // Optional
}

// Zod schema for validation
const retrieveRequestSchema = z.object({
    query: z.string().min(1, 'La consulta no puede estar vacía'),
    config: z.object({
        strategy: z.enum(['semantic', 'fulltext', 'hybrid', 'hybrid+rerank']).optional(),
        topK: z.object({
            retrieval: z.number().int().positive().optional(),
            reranking: z.number().int().positive().optional(),
            final: z.number().int().positive().optional()
        }).optional(),
        hybridSearch: z.object({
            enabled: z.boolean().optional(),
            rrfK: z.number().int().positive().optional(),
            semanticWeight: z.number().min(0).max(1).optional(),
            fulltextWeight: z.number().min(0).max(1).optional()
        }).optional(),
        reranking: z.object({
            enabled: z.boolean().optional()
        }).optional(),
        queryTransformation: z.object({
            enabled: z.boolean().optional(),
            enableHyDE: z.boolean().optional()
        }).optional()
    }).optional(),
    topK: z.number().int().positive().max(50).optional()
});
```

**Response Schema**
```typescript
interface RetrieveResponse {
    results: RetrievalResultDTO[];
    metadata: RetrievalMetadataDTO;
}

interface RetrievalResultDTO {
    chunkId: string;
    noteId: string;
    content: string;
    expandedContent: string;
    score: number;
    metadata: {
        chunkIndex: number;
        matchedChunkBounds: { start: number; end: number };
        retrievalMethod: 'semantic' | 'fulltext' | 'hybrid' | 'graph';
        originalScore?: number;
        rerankScore?: number;
        causalPath?: string[];
    };
}

interface RetrievalMetadataDTO {
    query: string;
    transformedQuery?: {
        intent: string;
        subQueries: string[];
        hydeAnswer?: string;
    };
    strategy: string;
    latencyMs: number;
    stages: {
        queryTransformation?: number;
        retrieval: number;
        reranking?: number;
        contextExpansion?: number;
    };
}
```

**Example Request**
```json
{
    "query": "¿Por qué me siento ansioso cuando tengo conflictos en el trabajo?",
    "config": {
        "strategy": "hybrid+rerank",
        "topK": {
            "final": 5
        }
    }
}
```

**Example Response**
```json
{
    "results": [
        {
            "chunkId": "550e8400-e29b-41d4-a716-446655440000",
            "noteId": "660e8400-e29b-41d4-a716-446655440001",
            "content": "Hoy tuve un conflicto con mi jefe y me sentí muy ansioso...",
            "expandedContent": "Esta mañana llegué temprano. Hoy tuve un conflicto con mi jefe y me sentí muy ansioso. Después fui a caminar para calmarme.",
            "score": 0.92,
            "metadata": {
                "chunkIndex": 2,
                "matchedChunkBounds": { "start": 25, "end": 95 },
                "retrievalMethod": "hybrid",
                "originalScore": 0.85,
                "rerankScore": 0.92
            }
        }
    ],
    "metadata": {
        "query": "¿Por qué me siento ansioso cuando tengo conflictos en el trabajo?",
        "transformedQuery": {
            "intent": "causal",
            "subQueries": ["¿Por qué me siento ansioso?", "¿Qué pasa con conflictos en el trabajo?"],
            "hydeAnswer": null
        },
        "strategy": "hybrid+rerank",
        "latencyMs": 1250,
        "stages": {
            "queryTransformation": 150,
            "retrieval": 450,
            "reranking": 500,
            "contextExpansion": 150
        }
    }
}
```

**Error Responses**

400 Bad Request - Invalid parameters
```json
{
    "error": "Parámetros inválidos",
    "details": "La consulta no puede estar vacía"
}
```

504 Gateway Timeout - Retrieval timeout
```json
{
    "error": "Tiempo de espera agotado",
    "details": "La búsqueda excedió el tiempo límite de 2000ms"
}
```

500 Internal Server Error - System failure
```json
{
    "error": "Error interno del servidor",
    "details": "No se pudieron recuperar resultados. Por favor, intenta de nuevo."
}
```

### Evaluation Endpoint

**POST /api/retrieve/evaluate**

Runs evaluation on the golden dataset with specified configuration.

**Request Schema**
```typescript
interface EvaluateRequest {
    config?: Partial<RetrievalConfig>;      // Optional: Config to evaluate
    category?: QueryCategory;                // Optional: Filter by category
}

const evaluateRequestSchema = z.object({
    config: z.object({
        // Same as RetrieveRequest config
    }).optional(),
    category: z.enum(['factual', 'causal', 'temporal', 'comparative', 'multi-part']).optional()
});
```

**Response Schema**
```typescript
interface EvaluateResponse {
    evaluationId: string;
    configHash: string;
    metrics: {
        hitRateK1: number;
        hitRateK3: number;
        hitRateK5: number;
        hitRateK10: number;
        mrr: number;
        faithfulness: number;
        answerRelevance: number;
        latencyP50: number;
        latencyP95: number;
        latencyP99: number;
    };
    totalQueries: number;
    timestamp: string;
}
```

**Example Response**
```json
{
    "evaluationId": "770e8400-e29b-41d4-a716-446655440002",
    "configHash": "a1b2c3d4e5f6g7h8",
    "metrics": {
        "hitRateK1": 0.65,
        "hitRateK3": 0.78,
        "hitRateK5": 0.83,
        "hitRateK10": 0.87,
        "mrr": 0.72,
        "faithfulness": 0.88,
        "answerRelevance": 0.82,
        "latencyP50": 850,
        "latencyP95": 1650,
        "latencyP99": 1950
    },
    "totalQueries": 100,
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### Metrics Endpoint

**GET /api/retrieve/metrics**

Retrieves recent evaluation results for comparison.

**Query Parameters**
- `limit`: Number of recent results (default: 10, max: 50)
- `configHash`: Filter by specific configuration

**Response Schema**
```typescript
interface MetricsResponse {
    evaluations: EvaluationResultDTO[];
}

interface EvaluationResultDTO {
    id: string;
    configHash: string;
    config: RetrievalConfig;
    metrics: {
        hitRateK10: number;
        mrr: number;
        faithfulness: number;
        answerRelevance: number;
        latencyP95: number;
    };
    timestamp: string;
}
```

### Golden Dataset Management Endpoints

**POST /api/golden-dataset**

Adds a new test case to the golden dataset.

**Request Schema**
```typescript
interface AddGoldenDatasetRequest {
    query: string;
    relevantNoteIds: string[];
    expectedAnswer: string;
    category: QueryCategory;
    difficulty: number;  // 1-5
}
```

**GET /api/golden-dataset**

Retrieves all golden dataset entries.

**DELETE /api/golden-dataset/:id**

Removes a test case from the golden dataset.

**POST /api/golden-dataset/export**

Exports golden dataset to JSON.

**POST /api/golden-dataset/import**

Imports golden dataset from JSON.



## Migration Strategy

### Overview

The migration strategy enables incremental rollout of the chunking system without downtime or data loss. The system supports both chunked and non-chunked notes during the transition period.

### Migration Phases

**Phase 1: Schema Migration (Day 0)**
1. Add new tables: `chunks`, `golden_dataset`, `evaluation_results`
2. Add tsvector column to existing `notes` table
3. Create all indexes
4. Deploy new code with backward compatibility

**Phase 2: Baseline Evaluation (Day 1-2)**
1. Create initial golden dataset (50-100 test queries)
2. Run baseline evaluation with current system
3. Record baseline metrics (Hit_Rate@10, MRR, latency)

**Phase 3: Incremental Note Migration (Day 3-14)**
1. Migrate notes in batches (100 notes per batch)
2. Prioritize recent notes first
3. Run evaluation after each batch
4. Monitor for regressions

**Phase 4: New Note Chunking (Day 3+)**
1. All new notes are automatically chunked on creation
2. Existing notes remain non-chunked until migrated
3. Retrieval works across both types

**Phase 5: Validation (Day 15-21)**
1. Verify all notes are migrated
2. Run comprehensive evaluation
3. Compare metrics to baseline
4. Validate Hit_Rate@10 >= 85%

**Phase 6: Cleanup (Day 22+)**
1. Remove backward compatibility code
2. Archive baseline evaluation data
3. Document final metrics

### Migration Script

**MigrateNotesToChunks Use Case**

```typescript
export class MigrateNotesToChunks {
    constructor(
        private noteRepository: NoteRepository,
        private chunkRepository: ChunkRepository,
        private chunkingService: ChunkingService,
        private logger: Logger
    ) {}
    
    async execute(batchSize: number = 100): Promise<MigrationResult> {
        const startTime = Date.now();
        let migratedCount = 0;
        let errorCount = 0;
        const errors: MigrationError[] = [];
        
        try {
            // Find notes without chunks
            const notesToMigrate = await this.findNotesWithoutChunks(batchSize);
            
            this.logger.info(`Starting migration of ${notesToMigrate.length} notes`);
            
            for (const note of notesToMigrate) {
                try {
                    await this.migrateNote(note);
                    migratedCount++;
                    
                    if (migratedCount % 10 === 0) {
                        this.logger.info(`Migrated ${migratedCount}/${notesToMigrate.length} notes`);
                    }
                } catch (error) {
                    errorCount++;
                    errors.push({
                        noteId: note.id,
                        error: error.message
                    });
                    this.logger.error(`Failed to migrate note ${note.id}`, { error });
                }
            }
            
            const duration = Date.now() - startTime;
            
            this.logger.info('Migration completed', {
                migratedCount,
                errorCount,
                durationMs: duration
            });
            
            return {
                success: true,
                migratedCount,
                errorCount,
                errors,
                durationMs: duration
            };
        } catch (error) {
            this.logger.error('Migration failed', { error });
            throw new AppError('Error durante la migración de notas', 500);
        }
    }
    
    private async findNotesWithoutChunks(limit: number): Promise<Note[]> {
        // Query notes that don't have corresponding chunks
        const query = `
            SELECT n.id, n.content, n.embedding, n.created_at
            FROM notes n
            LEFT JOIN chunks c ON n.id = c.note_id
            WHERE c.id IS NULL
            ORDER BY n.created_at DESC
            LIMIT $1
        `;
        
        const result = await db.execute(query, [limit]);
        return result.rows.map(row => new Note(
            row.id,
            row.content,
            row.embedding,
            row.created_at
        ));
    }
    
    private async migrateNote(note: Note): Promise<void> {
        // Generate chunks
        const chunks = await this.chunkingService.chunkNote(note);
        
        // Save chunks
        await this.chunkRepository.saveBatch(chunks);
        
        // Verify migration
        const savedChunks = await this.chunkRepository.findByNoteId(note.id);
        if (savedChunks.length !== chunks.length) {
            throw new Error(`Chunk count mismatch: expected ${chunks.length}, got ${savedChunks.length}`);
        }
    }
}

interface MigrationResult {
    success: boolean;
    migratedCount: number;
    errorCount: number;
    errors: MigrationError[];
    durationMs: number;
}

interface MigrationError {
    noteId: string;
    error: string;
}
```

### Backward Compatibility Implementation

**Hybrid Retrieval During Migration**

```typescript
export class HybridSearchService {
    async search(query: TransformedQuery, topK: number): Promise<RetrievalResult[]> {
        const embedding = await this.vectorProvider.generateEmbedding(
            query.hydeAnswer || query.originalQuery
        );
        
        // Search both chunks and non-chunked notes
        const [chunkResults, noteResults, ftChunkResults, ftNoteResults] = await Promise.all([
            this.chunkRepository.semanticSearch(embedding, topK, this.config.threshold),
            this.searchNonChunkedNotes(embedding, topK, this.config.threshold),
            this.chunkRepository.fullTextSearch(query.originalQuery, topK),
            this.searchNonChunkedNotesFullText(query.originalQuery, topK)
        ]);
        
        // Combine all results
        const allSemanticResults = [...chunkResults, ...noteResults];
        const allFtResults = [...ftChunkResults, ...ftNoteResults];
        
        // Apply RRF fusion
        const fusedResults = this.fuseWithRRF(allSemanticResults, allFtResults, topK);
        
        return fusedResults;
    }
    
    private async searchNonChunkedNotes(
        embedding: number[],
        limit: number,
        threshold: number
    ): Promise<ChunkSearchResult[]> {
        // Search notes that don't have chunks
        const query = `
            SELECT n.id, n.content, n.created_at,
                   1 - (n.embedding <=> $1::vector) as similarity
            FROM notes n
            LEFT JOIN chunks c ON n.id = c.note_id
            WHERE c.id IS NULL
              AND 1 - (n.embedding <=> $1::vector) > $2
            ORDER BY similarity DESC
            LIMIT $3
        `;
        
        const result = await db.execute(query, [embedding, threshold, limit]);
        
        // Convert notes to pseudo-chunks
        return result.rows.map((row, index) => ({
            chunk: new Chunk(
                row.id,  // Use note ID as chunk ID
                row.id,  // Note ID
                row.content,
                0,  // Single chunk index
                0,  // Start char
                row.content.length,  // End char
                [],  // Embedding not needed
                [],  // Contextual embedding not needed
                row.created_at
            ),
            score: row.similarity,
            rank: index + 1
        }));
    }
    
    private async searchNonChunkedNotesFullText(
        query: string,
        limit: number
    ): Promise<ChunkSearchResult[]> {
        // Full-text search on non-chunked notes
        const sqlQuery = `
            SELECT n.id, n.content, n.created_at,
                   ts_rank_cd(n.tsvector, plainto_tsquery('spanish', $1)) as rank
            FROM notes n
            LEFT JOIN chunks c ON n.id = c.note_id
            WHERE c.id IS NULL
              AND n.tsvector @@ plainto_tsquery('spanish', $1)
            ORDER BY rank DESC
            LIMIT $2
        `;
        
        const result = await db.execute(sqlQuery, [query, limit]);
        
        // Convert to pseudo-chunks
        return result.rows.map((row, index) => ({
            chunk: new Chunk(
                row.id,
                row.id,
                row.content,
                0,
                0,
                row.content.length,
                [],
                [],
                row.created_at
            ),
            score: this.normalizeFullTextScore(row.rank),
            rank: index + 1
        }));
    }
}
```

### Migration Monitoring

**Metrics to Track**
1. Migration progress (notes migrated / total notes)
2. Migration errors (count and types)
3. Retrieval latency (before/after migration)
4. Hit_Rate@10 (per batch)
5. Database size growth (chunks table)

**Monitoring Dashboard**
```typescript
interface MigrationStatus {
    totalNotes: number;
    migratedNotes: number;
    remainingNotes: number;
    progressPercentage: number;
    errorCount: number;
    lastBatchTimestamp: Date;
    estimatedCompletionTime: Date;
    currentMetrics: {
        hitRateK10: number;
        avgLatencyMs: number;
    };
}
```

### Rollback Plan

If migration causes issues:

1. **Immediate Rollback**
   - Disable chunking for new notes
   - Revert to non-chunked retrieval only
   - Delete chunks table data

2. **Partial Rollback**
   - Keep migrated chunks
   - Stop further migration
   - Investigate and fix issues
   - Resume migration

3. **Data Preservation**
   - All original notes remain unchanged
   - Chunks are additive (can be deleted without data loss)
   - Rollback does not affect note IDs or timestamps



## Performance Optimization

### Optimization Strategies

**1. Parallel Execution**

Execute independent operations concurrently to reduce latency:

```typescript
// Parallel search execution
const [semanticResults, ftResults] = await Promise.all([
    this.chunkRepository.semanticSearch(embedding, topK * 2, threshold),
    this.chunkRepository.fullTextSearch(query, topK * 2)
]);

// Parallel embedding generation
const [embedding, contextualEmbedding] = await Promise.all([
    this.vectorProvider.generateEmbedding(chunkContent),
    this.vectorProvider.generateEmbedding(`${contextualInfo}\n\n${chunkContent}`)
]);
```

**2. Batch Processing**

Batch operations to reduce overhead:

```typescript
// Batch embedding generation
const texts = chunks.map(c => c.content);
const embeddings = await this.vectorProvider.generateEmbeddings(texts);

// Batch chunk storage
await this.chunkRepository.saveBatch(chunks);

// Batch re-ranking
const batches = this.createBatches(results, batchSize);
const scoredBatches = await Promise.all(
    batches.map(batch => this.scoreBatch(batch, query))
);
```

**3. Caching Strategy**

Implement multi-level caching:

```typescript
interface CacheConfig {
    // Query result cache
    queryCache: {
        enabled: boolean;
        ttl: number;           // default: 300000ms (5 minutes)
        maxSize: number;       // default: 1000 entries
    };
    
    // Embedding cache
    embeddingCache: {
        enabled: boolean;
        ttl: number;           // default: 3600000ms (1 hour)
        maxSize: number;       // default: 10000 entries
    };
    
    // Contextual info cache
    contextCache: {
        enabled: boolean;
        ttl: number;           // default: 7200000ms (2 hours)
        maxSize: number;       // default: 5000 entries
    };
}

class CacheService {
    private queryCache: LRUCache<string, RetrievalResult[]>;
    private embeddingCache: LRUCache<string, number[]>;
    private contextCache: LRUCache<string, string>;
    
    constructor(config: CacheConfig) {
        this.queryCache = new LRUCache({
            max: config.queryCache.maxSize,
            ttl: config.queryCache.ttl
        });
        
        this.embeddingCache = new LRUCache({
            max: config.embeddingCache.maxSize,
            ttl: config.embeddingCache.ttl
        });
        
        this.contextCache = new LRUCache({
            max: config.contextCache.maxSize,
            ttl: config.contextCache.ttl
        });
    }
    
    getCachedQuery(query: string, configHash: string): RetrievalResult[] | undefined {
        const key = `${query}:${configHash}`;
        return this.queryCache.get(key);
    }
    
    setCachedQuery(query: string, configHash: string, results: RetrievalResult[]): void {
        const key = `${query}:${configHash}`;
        this.queryCache.set(key, results);
    }
    
    getCachedEmbedding(text: string): number[] | undefined {
        const hash = this.hashText(text);
        return this.embeddingCache.get(hash);
    }
    
    setCachedEmbedding(text: string, embedding: number[]): void {
        const hash = this.hashText(text);
        this.embeddingCache.set(hash, embedding);
    }
    
    private hashText(text: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
    }
}
```

**4. Database Optimization**

Optimize database queries and indexes:

```sql
-- Optimize vector search with IVFFlat index
CREATE INDEX idx_chunks_embedding ON chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Optimize full-text search with GIN index
CREATE INDEX idx_chunks_tsvector ON chunks USING GIN(tsvector);

-- Composite index for note-chunk lookups
CREATE INDEX idx_chunks_note_id_index ON chunks(note_id, chunk_index);

-- Partial index for non-migrated notes
CREATE INDEX idx_notes_without_chunks ON notes(id) 
WHERE NOT EXISTS (SELECT 1 FROM chunks WHERE chunks.note_id = notes.id);

-- Analyze tables for query planner
ANALYZE chunks;
ANALYZE notes;
```

**5. Connection Pooling**

Configure database connection pool:

```typescript
const poolConfig = {
    max: 20,                    // Maximum connections
    min: 5,                     // Minimum connections
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 2000,  // Timeout for acquiring connection
};
```

**6. Lazy Loading**

Load expensive data only when needed:

```typescript
class RetrievalResult {
    private _expandedContent?: string;
    
    async getExpandedContent(): Promise<string> {
        if (!this._expandedContent) {
            this._expandedContent = await this.contextExpansionService.expand(this);
        }
        return this._expandedContent;
    }
}
```

**7. Request Throttling**

Limit concurrent expensive operations:

```typescript
class ThrottledLLMProvider implements LLMProvider {
    private semaphore: Semaphore;
    
    constructor(
        private baseProvider: LLMProvider,
        maxConcurrent: number = 5
    ) {
        this.semaphore = new Semaphore(maxConcurrent);
    }
    
    async generateResponse(messages: ChatMessage[]): Promise<string> {
        await this.semaphore.acquire();
        try {
            return await this.baseProvider.generateResponse(messages);
        } finally {
            this.semaphore.release();
        }
    }
}
```

**8. Pre-computation**

Pre-compute expensive operations during indexing:

```typescript
// Pre-compute contextual embeddings during note indexing
async execute(content: string): Promise<Note> {
    const note = await this.createNote(content);
    
    // Generate chunks with contextual embeddings immediately
    const chunks = await this.chunkingService.chunkNote(note);
    await this.chunkRepository.saveBatch(chunks);
    
    return note;
}
```

### Performance Targets

| Operation | Target Latency | Optimization Strategy |
|-----------|---------------|----------------------|
| Semantic Search | < 200ms | IVFFlat index, connection pooling |
| Full-Text Search | < 200ms | GIN index, query optimization |
| Hybrid Search (RRF) | < 500ms | Parallel execution, caching |
| Re-ranking (10 docs) | < 1000ms | Batch processing, throttling |
| Context Expansion | < 100ms | Lazy loading, caching |
| Query Transformation | < 300ms | Caching, simple intent detection |
| End-to-End Retrieval | < 2000ms (p95) | All strategies combined |

### Monitoring and Profiling

**Performance Metrics to Track**

```typescript
interface PerformanceMetrics {
    // Latency metrics
    latency: {
        queryTransformation: number;
        semanticSearch: number;
        fullTextSearch: number;
        hybridFusion: number;
        reranking: number;
        contextExpansion: number;
        total: number;
    };
    
    // Cache metrics
    cache: {
        queryHitRate: number;
        embeddingHitRate: number;
        contextHitRate: number;
    };
    
    // Database metrics
    database: {
        connectionPoolSize: number;
        activeConnections: number;
        queryCount: number;
        avgQueryTime: number;
    };
    
    // Resource metrics
    resources: {
        memoryUsageMB: number;
        cpuUsagePercent: number;
    };
}
```

**Profiling Instrumentation**

```typescript
class PerformanceProfiler {
    private metrics: Map<string, number[]> = new Map();
    
    async profile<T>(operation: string, fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            return await fn();
        } finally {
            const duration = Date.now() - start;
            this.recordMetric(operation, duration);
        }
    }
    
    private recordMetric(operation: string, duration: number): void {
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }
        this.metrics.get(operation)!.push(duration);
    }
    
    getStats(operation: string): OperationStats {
        const durations = this.metrics.get(operation) || [];
        if (durations.length === 0) {
            return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
        }
        
        const sorted = [...durations].sort((a, b) => a - b);
        return {
            count: durations.length,
            avg: durations.reduce((a, b) => a + b, 0) / durations.length,
            p50: sorted[Math.floor(0.50 * sorted.length)],
            p95: sorted[Math.floor(0.95 * sorted.length)],
            p99: sorted[Math.floor(0.99 * sorted.length)]
        };
    }
}
```

### Scalability Considerations

**Horizontal Scaling**
- API servers: Stateless, can scale horizontally
- Database: Use read replicas for retrieval queries
- Cache: Use Redis for distributed caching

**Vertical Scaling**
- Increase database resources for vector operations
- Increase API server memory for caching
- Use GPU-accelerated embeddings if available

**Data Growth**
- Partition chunks table by note creation date
- Archive old evaluation results
- Implement chunk pruning for very old notes

