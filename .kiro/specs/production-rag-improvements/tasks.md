# Implementation Plan: Production RAG Improvements

## Overview

This plan enhances Brain Sync's RAG system from ~60% to 85%+ retrieval accuracy through hybrid search, re-ranking, intelligent chunking, query transformation, sentence-window retrieval, contextual embeddings, GraphRAG enhancement, and comprehensive evaluation. The implementation follows a 3-week roadmap maintaining Clean Architecture principles while adding advanced retrieval capabilities. All components integrate with existing PostgreSQL + pgvector infrastructure and Ollama LLM provider.

## Tasks

### Week 1: Advanced Retrieval

- [x] 1. Set up database schema for chunks and full-text search
  - [x] 1.1 Create chunks table schema
    - Add `chunks` table with columns: id (uuid), note_id (uuid FK), content (text), chunk_index (integer), start_char (integer), end_char (integer), embedding (vector), contextual_embedding (vector), tsvector (tsvector), created_at (timestamp)
    - Add foreign key constraint to notes table
    - Add index on note_id for fast lookups
    - Update `apps/api/src/infrastructure/db/schema.ts`
    - _Requirements: Integration Points - Database Schema Changes, Requirement 5_
  
  - [x] 1.2 Create full-text search indexes
    - Add GIN index on chunks.tsvector for full-text search performance
    - Add vector index on chunks.embedding using HNSW algorithm
    - Add vector index on chunks.contextual_embedding using HNSW algorithm
    - Configure Spanish language for tsvector generation
    - _Requirements: Requirement 2.2, Requirement 2.9_
  
  - [x] 1.3 Create golden dataset table schema
    - Add `golden_dataset` table with columns: id (uuid), query (text), relevant_note_ids (text[]), expected_answer (text), category (text), difficulty (integer), created_at (timestamp), updated_at (timestamp)
    - Add index on category for filtering
    - Add unique constraint on query to prevent duplicates
    - _Requirements: Requirement 10, Integration Points - Database Schema Changes_

  - [x] 1.4 Create evaluation results table schema
    - Add `evaluation_results` table with columns: id (uuid), config_hash (text), hit_rate_k1 (float), hit_rate_k3 (float), hit_rate_k5 (float), hit_rate_k10 (float), mrr (float), faithfulness (float), answer_relevance (float), latency_p50 (integer), latency_p95 (integer), latency_p99 (integer), created_at (timestamp)
    - Add index on config_hash for comparison queries
    - Add index on created_at for trend analysis
    - _Requirements: Requirement 9, Integration Points - Database Schema Changes_
  
  - [x] 1.5 Run database migration
    - Execute `pnpm db:push` from apps/api directory
    - Verify all tables and indexes created successfully
    - Test Spanish language configuration for tsvector
    - _Requirements: Requirement 2.5_

- [x] 2. Implement ChunkingService with sentence-boundary segmentation
  - [x] 2.1 Create ChunkingService class and configuration interface
    - Create `apps/api/src/application/services/ChunkingService.ts`
    - Define ChunkingConfig interface with maxChunkSize (512), overlapSize (50), minChunkSize (100)
    - Inject VectorProvider and LLMProvider dependencies
    - _Requirements: Requirement 5, Design Section "ChunkingService"_
  
  - [x] 2.2 Implement Spanish sentence segmentation
    - Create segmentBySentences() method using Spanish sentence boundaries
    - Handle common Spanish abbreviations (Sr., Sra., Dr., etc.)
    - Respect sentence-ending punctuation (. ! ? ... ¿ ¡)
    - Return array of sentences with character positions
    - _Requirements: Requirement 5.4, Requirement 5.9_
  
  - [x] 2.3 Implement chunk boundary creation with overlap
    - Create createChunkBoundaries() method
    - Group sentences into chunks respecting maxChunkSize token limit
    - Add overlap between adjacent chunks (default 50 tokens)
    - Ensure no mid-sentence splits
    - Handle edge case where single sentence exceeds chunk size
    - Return array of ChunkBoundary objects with start/end positions
    - _Requirements: Requirement 5.2, Requirement 5.3, Requirement 5.5_

  - [x] 2.4 Implement contextual information generation
    - Create generateContextualInfo() method
    - Build LLM prompt with chunk content, full note, chunk position
    - Request: note summary, chunk position context, surrounding topics
    - Parse LLM response and format as contextual prefix
    - Implement caching to avoid redundant LLM calls for same note
    - _Requirements: Requirement 7.2, Requirement 7.3, Requirement 7.4_
  
  - [x] 2.5 Implement chunkNote() main method
    - Segment note into sentences
    - Create chunk boundaries with overlap
    - For each chunk: generate contextual info, create embeddings
    - Generate both standard and contextual embeddings in parallel
    - Create Chunk entity instances with all metadata
    - Return array of Chunk entities
    - _Requirements: Requirement 5, Requirement 7, Design Section "ChunkingService.chunkNote()"_
  
  - [x] 2.6 Write unit tests for ChunkingService
    - Test segmentBySentences handles Spanish punctuation correctly
    - Test createChunkBoundaries respects maxChunkSize limit
    - Test createChunkBoundaries creates proper overlap
    - Test createChunkBoundaries handles single long sentence
    - Test chunkNote produces at least one chunk for any note
    - Test contextual info generation includes note summary
    - _Requirements: Requirement 17.1_
  
  - [x] 2.7 Write property test for chunk boundary consistency
    - **Property 3: Chunk Boundary Consistency**
    - **Validates: Requirements 5.10, Property 3**
    - Verify chunks are non-overlapping in core content
    - Verify union of chunks covers entire note content

- [-] 3. Implement ChunkRepository with semantic and full-text search
  - [x] 3.1 Create Chunk domain entity
    - Create `apps/api/src/domain/entities/Chunk.ts`
    - Define Chunk class with id, noteId, content, chunkIndex, startChar, endChar, embedding, contextualEmbedding, createdAt
    - _Requirements: Design Section "Domain Entities - Chunk"_

  - [x] 3.2 Create ChunkRepository abstract class
    - Create `apps/api/src/domain/repositories/ChunkRepository.ts`
    - Define abstract methods: save(), saveBatch(), findById(), findByNoteId()
    - Define abstract methods: semanticSearch(), fullTextSearch(), findExpandedContext(), deleteByNoteId()
    - Define ChunkSearchResult interface with chunk, score, rank
    - _Requirements: Design Section "Repository Interfaces - ChunkRepository"_
  
  - [x] 3.3 Implement DrizzleChunkRepository
    - Create `apps/api/src/infrastructure/repositories/DrizzleChunkRepository.ts`
    - Implement save() and saveBatch() with Drizzle ORM
    - Auto-update tsvector column on insert using PostgreSQL trigger or computed column
    - _Requirements: Requirement 2.3, Integration Points - New Components_
  
  - [x] 3.4 Implement semanticSearch() method
    - Use pgvector cosine similarity on contextual_embedding column
    - Accept queryVector, limit, and threshold parameters
    - Return results ordered by similarity score descending
    - Include chunk entity and normalized score [0, 1]
    - _Requirements: Requirement 1.6, Requirement 7.9, Property 7_
  
  - [x] 3.5 Implement fullTextSearch() method
    - Use PostgreSQL ts_rank_cd for relevance scoring
    - Configure Spanish language stemming and stop words
    - Handle special characters and quoted phrases
    - Return results with normalized scores [0, 1]
    - _Requirements: Requirement 2.4, Requirement 2.5, Requirement 2.6, Requirement 2.8_
  
  - [x] 3.6 Implement findExpandedContext() method
    - Accept chunkId, sentencesBefore, sentencesAfter parameters
    - Load chunk and parent note from database
    - Extract expanded context using chunk boundaries
    - Expand by N sentences before/after using Spanish sentence detection
    - Return expanded content as string
    - _Requirements: Requirement 6.2, Requirement 6.3, Property 6_
  
  - [x] 3.7 Write unit tests for ChunkRepository
    - Test save() persists chunk with all fields
    - Test saveBatch() handles multiple chunks atomically
    - Test semanticSearch() returns results ordered by similarity
    - Test fullTextSearch() handles Spanish text correctly
    - Test findExpandedContext() respects note boundaries
    - Test deleteByNoteId() removes all chunks for note
    - _Requirements: Requirement 17.2_

- [x] 4. Checkpoint - Verify database schema and chunking infrastructure
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 5. Implement HybridSearchService with RRF algorithm
  
  - [x] 5.1 Create HybridSearchService class and configuration
    - Create `apps/api/src/application/services/HybridSearchService.ts`
    - Define HybridSearchConfig interface with threshold, rrfK, semanticWeight, fulltextWeight
    - Inject ChunkRepository and VectorProvider dependencies
    - _Requirements: Requirement 1, Design Section "HybridSearchService"_
  
  - [x] 5.2 Implement RRF fusion algorithm
    - Create fuseWithRRF() private method
    - Accept semanticResults and ftResults arrays with ranks
    - Compute RRF score: sum(1 / (k + rank_i)) for each document
    - Apply configurable weights to semantic vs full-text scores
    - Combine and sort by final RRF score descending
    - Return top-k results
    - _Requirements: Requirement 1.4, Design Section "HybridSearchService.fuseWithRRF()"_
  
  - [x] 5.3 Implement search() main method
    - Generate embedding for query using VectorProvider
    - Execute semanticSearch() and fullTextSearch() in parallel using Promise.all
    - Call fuseWithRRF() to combine results
    - Handle empty result sets gracefully
    - Return RetrievalResult entities with metadata
    - _Requirements: Requirement 1.1, Requirement 1.2, Requirement 1.5, Requirement 1.8, Requirement 1.9_
  
  - [x] 5.4 Implement performance optimization
    - Ensure parallel execution completes within 500ms for top-10 results
    - Add timeout handling for slow queries
    - Log search latency for monitoring
    - _Requirements: Requirement 1.6, Requirement 14.1_
  
  - [x] 5.5 Write unit tests for HybridSearchService
    - Test fuseWithRRF() combines results correctly
    - Test fuseWithRRF() handles empty semantic results
    - Test fuseWithRRF() handles empty full-text results
    - Test search() executes both searches in parallel
    - Test search() returns results within latency budget
    - Test search() preserves metadata in results
    - _Requirements: Requirement 17.2_
  
  - [x] 5.6 Write property test for RRF score monotonicity
    - **Property 1: RRF Score Monotonicity**
    - **Validates: Requirements 1.5, Property 1**
    - Verify if document A ranks higher than B, then A's score >= B's score

- [ ] 6. Implement QueryTransformationService with intent detection
  - [x] 6.1 Create QueryTransformationService class
    - Create `apps/api/src/application/services/QueryTransformationService.ts`
    - Define TransformedQuery interface with originalQuery, intent, subQueries, hydeAnswer, timestamp
    - Define QueryIntent type: 'factual' | 'causal' | 'temporal' | 'comparative' | 'abstract'
    - Inject LLMProvider dependency
    - _Requirements: Requirement 4, Design Section "QueryTransformationService"_

  - [x] 6.2 Implement detectIntent() method
    - Build LLM prompt asking to classify query intent
    - Support Spanish language queries
    - Parse LLM response to extract intent category
    - Default to 'factual' if classification fails
    - Complete within 300ms timeout
    - _Requirements: Requirement 4.1, Requirement 4.3, Requirement 4.8, Requirement 4.9_
  
  - [x] 6.3 Implement decomposeQuery() method
    - Detect if query contains multiple questions
    - Use LLM to split complex queries into sub-queries
    - Return array of sub-queries (empty if query is simple)
    - Preserve original query structure
    - _Requirements: Requirement 4.2, Requirement 4.7_
  
  - [x] 6.4 Implement generateHyDE() method
    - Build LLM prompt asking for hypothetical answer
    - Generate answer for abstract or complex queries
    - Return hypothetical answer text
    - Skip HyDE for simple factual queries
    - _Requirements: Requirement 4.5, Requirement 4.6_
  
  - [x] 6.5 Implement transform() main method
    - Call detectIntent(), decomposeQuery(), and generateHyDE() as needed
    - Return TransformedQuery with all fields populated
    - Ensure originalQuery is always preserved
    - Complete within 300ms total
    - _Requirements: Requirement 4.10, Property 8_
  
  - [x] 6.6 Write unit tests for QueryTransformationService
    - Test detectIntent() identifies causal queries
    - Test detectIntent() handles Spanish queries
    - Test decomposeQuery() splits multi-part questions
    - Test generateHyDE() creates hypothetical answers
    - Test transform() preserves original query
    - Test transform() completes within timeout
    - _Requirements: Requirement 17.2_
  
  - [x] 6.7 Write property test for query transformation preservation
    - **Property 8: Query Transformation Preservation**
    - **Validates: Requirements 4.7, Property 8**
    - Verify original query is always preserved in transformation result

- [ ] 7. Implement ReRankingService with LLM-based scoring
  - [x] 7.1 Create ReRankingService class and configuration
    - Create `apps/api/src/application/services/ReRankingService.ts`
    - Define ReRankingConfig interface with enabled, batchSize, timeout
    - Inject LLMProvider dependency
    - _Requirements: Requirement 3, Design Section "ReRankingService"_

  - [x] 7.2 Extend LLMProvider interface with scoring methods
    - Update `apps/api/src/application/providers/LLMProvider.ts`
    - Add scoreRelevance(query: string, document: string): Promise<number>
    - Add evaluateFaithfulness(context: string, answer: string): Promise<number>
    - Add evaluateAnswerRelevance(query: string, answer: string, expectedAnswer: string): Promise<number>
    - _Requirements: Design Section "Extended LLMProvider Interface"_
  
  - [x] 7.3 Implement scoring methods in OllamaLLMProvider
    - Update `apps/api/src/infrastructure/providers/OllamaLLMProvider.ts`
    - Implement scoreRelevance() with LLM prompt requesting 0-1 score
    - Implement evaluateFaithfulness() checking if answer is grounded in context
    - Implement evaluateAnswerRelevance() comparing answer to expected answer
    - Parse numeric scores from LLM responses
    - Return normalized scores in [0, 1] range
    - _Requirements: Requirement 3.2, Requirement 3.9, Property 7_
  
  - [x] 7.4 Implement batch scoring with efficiency
    - Create batchScore() private method
    - Split results into batches of configurable size (default 5)
    - Process batches in parallel using Promise.all
    - Implement timeout per batch (default 1000ms)
    - _Requirements: Requirement 3.6, Requirement 3.7_
  
  - [x] 7.5 Implement rerank() main method
    - Check if re-ranking is enabled in config
    - If disabled, return original results sliced to topK
    - If enabled, call batchScore() for all results
    - Sort by relevance score descending
    - Preserve original scores in metadata
    - Return top-k reranked results
    - _Requirements: Requirement 3.1, Requirement 3.3, Requirement 3.8, Requirement 3.10_
  
  - [x] 7.6 Write unit tests for ReRankingService
    - Test rerank() returns original order when disabled
    - Test rerank() reorders by relevance score
    - Test batchScore() processes in batches
    - Test rerank() completes within 1000ms for 10 chunks
    - Test rerank() preserves original scores in metadata
    - Test rerank() handles LLM scoring failures gracefully
    - _Requirements: Requirement 17.2_

- [x] 8. Checkpoint - Verify advanced retrieval services
  - Ensure all tests pass, ask the user if questions arise.


### Week 2: Intelligent Chunking & Context

- [ ] 9. Implement ContextExpansionService for sentence-window retrieval
  - [ ] 9.1 Create ContextExpansionService class and configuration
    - Create `apps/api/src/application/services/ContextExpansionService.ts`
    - Define ContextExpansionConfig interface with sentencesBefore, sentencesAfter (default 2)
    - Inject ChunkRepository dependency
    - _Requirements: Requirement 6, Design Section "ContextExpansionService"_
  
  - [ ] 9.2 Implement expand() method
    - Accept array of RetrievalResult entities
    - For each result, call chunkRepository.findExpandedContext()
    - Update result with expandedContent field
    - Mark original matched chunk boundaries in metadata
    - Handle expansion at note boundaries (no cross-note expansion)
    - Complete within 100ms per chunk
    - _Requirements: Requirement 6.2, Requirement 6.3, Requirement 6.6, Requirement 6.7, Requirement 6.8_
  
  - [ ] 9.3 Implement context merging for adjacent chunks
    - Detect when multiple retrieved chunks are from same note
    - Merge overlapping expanded contexts
    - Preserve all matched chunk boundaries in metadata
    - Avoid duplicate content in merged contexts
    - _Requirements: Requirement 6.4, Requirement 6.9_
  
  - [ ]* 9.4 Write unit tests for ContextExpansionService
    - Test expand() retrieves expanded context for each chunk
    - Test expand() marks matched chunk boundaries
    - Test expand() respects note boundaries
    - Test expand() completes within latency budget
    - Test context merging removes duplicates
    - Test context merging preserves all chunk boundaries
    - _Requirements: Requirement 17.2_

- [ ] 10. Integrate chunking into note indexing workflow
  - [ ] 10.1 Update IndexNote use case to support chunking
    - Update `apps/api/src/application/useCases/IndexNote.ts`
    - After saving note, call chunkingService.chunkNote()
    - Save all chunks using chunkRepository.saveBatch()
    - Maintain backward compatibility with existing note embedding
    - _Requirements: Requirement 15.1, Requirement 15.6_
  
  - [ ] 10.2 Create MigrateNotesToChunks use case
    - Create `apps/api/src/application/useCases/MigrateNotesToChunks.ts`
    - Fetch all existing notes from repository
    - For each note: chunk and save chunks
    - Track migration progress and errors
    - Support incremental migration (skip already-chunked notes)
    - Log migration statistics
    - _Requirements: Requirement 15.2, Requirement 15.4, Requirement 15.5, Requirement 15.8_

  - [ ] 10.3 Add migration endpoint to NoteController
    - Update `apps/api/src/infrastructure/http/controllers/NoteController.ts`
    - Add POST /notes/migrate-chunks endpoint
    - Call migrateNotesToChunks.execute()
    - Return migration statistics (total, successful, failed)
    - Protect endpoint with admin authentication (if available)
    - _Requirements: Requirement 15.4_
  
  - [ ]* 10.4 Write integration test for note indexing with chunks
    - Create note via IndexNote use case
    - Verify note saved to database
    - Verify chunks created and saved
    - Verify chunks have embeddings and contextual embeddings
    - Verify chunks can be retrieved via ChunkRepository
    - _Requirements: Requirement 17.3_
  
  - [ ]* 10.5 Write integration test for migration
    - Create several notes without chunks
    - Run MigrateNotesToChunks use case
    - Verify all notes have chunks created
    - Verify original notes preserved
    - Verify migration is idempotent (can run multiple times)
    - _Requirements: Requirement 17.3_

- [ ] 11. Enhance GraphRAG with causal chain traversal
  - [ ] 11.1 Update existing graph traversal logic
    - Locate existing GraphRAG implementation in codebase
    - Add support for causal intent queries
    - Implement traversal of CAUSES, TRIGGERS, LEADS_TO relationships
    - Limit traversal depth to configurable max (default 3)
    - _Requirements: Requirement 8.1, Requirement 8.2, Requirement 8.5_
  
  - [ ] 11.2 Implement causal path ranking
    - Score causal paths by relevance to query
    - Prioritize direct relationships over indirect
    - Combine graph results with vector search results
    - Return causal paths as structured metadata
    - _Requirements: Requirement 8.4, Requirement 8.6, Requirement 8.7, Requirement 8.9_
  
  - [ ] 11.3 Integrate with QueryTransformationService
    - When query intent is 'causal', trigger graph traversal
    - Retrieve notes associated with entities in causal path
    - Merge graph-based results with hybrid search results
    - Fall back to standard retrieval if no causal relationships exist
    - Complete within 500ms
    - _Requirements: Requirement 4.4, Requirement 8.3, Requirement 8.8, Requirement 8.10_
  
  - [ ]* 11.4 Write unit tests for GraphRAG enhancement
    - Test causal path traversal finds connected entities
    - Test traversal respects depth limit
    - Test causal path ranking prioritizes direct relationships
    - Test integration with query transformation
    - Test fallback when no causal relationships exist
    - _Requirements: Requirement 17.2_

- [ ] 12. Checkpoint - Verify intelligent chunking and context expansion
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 13. Implement RetrieveDocuments use case with full pipeline
  - [ ] 13.1 Create RetrievalResult domain entity
    - Create `apps/api/src/domain/entities/RetrievalResult.ts`
    - Define RetrievalResult class with chunkId, noteId, content, expandedContent, score, metadata
    - Define RetrievalMetadata interface with originalScore, rerankScore, chunkIndex, matchedChunkBounds, retrievalMethod
    - _Requirements: Design Section "Domain Entities - RetrievalResult"_
  
  - [ ] 13.2 Create RetrievalConfig interface
    - Create `apps/api/src/application/useCases/types.ts`
    - Define RetrievalConfig with strategy, topK, enableRerank, enableQueryTransform, enableContextualEmbeddings
    - Define default configuration values
    - _Requirements: Requirement 12_
  
  - [ ] 13.3 Create RetrieveDocuments use case
    - Create `apps/api/src/application/useCases/RetrieveDocuments.ts`
    - Inject all retrieval services: QueryTransformationService, HybridSearchService, ReRankingService, ContextExpansionService
    - Define execute(query: string, config: RetrievalConfig): Promise<RetrievalResult[]>
    - _Requirements: Integration Points - New Components_
  
  - [ ] 13.4 Implement retrieval pipeline orchestration
    - Step 1: Transform query using QueryTransformationService
    - Step 2: Execute hybrid search using HybridSearchService (retrieve top-20)
    - Step 3: Re-rank results using ReRankingService (narrow to top-10)
    - Step 4: Expand context using ContextExpansionService
    - Log latency for each stage
    - Return final RetrievalResult array
    - _Requirements: Design Section "Retrieval Pipeline Flow", Requirement 13.1_
  
  - [ ] 13.5 Implement configuration-based strategy selection
    - Support 'semantic-only', 'hybrid', 'hybrid+rerank' strategies
    - Skip re-ranking if enableRerank is false
    - Skip query transformation if enableQueryTransform is false
    - Use contextual embeddings if enableContextualEmbeddings is true
    - Validate configuration on startup
    - _Requirements: Requirement 12.1, Requirement 12.2, Requirement 12.5, Requirement 12.6, Requirement 12.7_
  
  - [ ] 13.6 Implement end-to-end latency optimization
    - Ensure total pipeline completes within 2000ms for 95% of queries
    - Use parallel execution where possible
    - Add timeout handling for slow stages
    - Log warnings when latency exceeds thresholds
    - _Requirements: Requirement 14.1, Requirement 14.2, Requirement 18.4_
  
  - [ ]* 13.7 Write integration test for complete retrieval pipeline
    - Create test notes and chunks in database
    - Execute RetrieveDocuments with various configurations
    - Verify query transformation applied
    - Verify hybrid search combines semantic and full-text
    - Verify re-ranking reorders results
    - Verify context expansion includes surrounding sentences
    - Verify end-to-end latency within budget
    - _Requirements: Requirement 17.3_


- [ ] 14. Implement error handling and resilience
  - [ ] 14.1 Add fallback for VectorProvider failures
    - Wrap vector embedding calls in try-catch
    - On failure, fall back to full-text search only
    - Log fallback operations with error details
    - Return partial results rather than failing completely
    - _Requirements: Requirement 16.1, Requirement 16.7_
  
  - [ ] 14.2 Add fallback for full-text search failures
    - Wrap full-text search calls in try-catch
    - On failure, fall back to semantic search only
    - Log fallback operations
    - _Requirements: Requirement 16.2, Requirement 16.7_
  
  - [ ] 14.3 Add fallback for re-ranking failures
    - Wrap re-ranking calls in try-catch
    - On failure, return original retrieval results
    - Log fallback operations
    - _Requirements: Requirement 16.3, Requirement 16.6_
  
  - [ ] 14.4 Add fallback for query transformation failures
    - Wrap query transformation in try-catch
    - On failure, use original query without transformation
    - Log fallback operations
    - _Requirements: Requirement 16.4, Requirement 16.6_
  
  - [ ] 14.5 Add fallback for context expansion failures
    - Wrap context expansion in try-catch
    - On failure, return original chunk without expansion
    - Log fallback operations
    - _Requirements: Requirement 16.5, Requirement 16.6_
  
  - [ ] 14.6 Implement circuit breaker for LLM calls
    - Track LLM failure rate
    - Open circuit after threshold failures (e.g., 5 in 1 minute)
    - Skip LLM-dependent features when circuit is open
    - Auto-reset circuit after cooldown period
    - _Requirements: Requirement 16.8_
  
  - [ ] 14.7 Implement retry with exponential backoff
    - Retry transient failures (network errors, timeouts)
    - Use exponential backoff with jitter
    - Cap maximum retry attempts (default 3)
    - _Requirements: Requirement 16.9_
  
  - [ ] 14.8 Add Spanish error messages
    - Create error message constants in Spanish
    - Return user-friendly messages for all error scenarios
    - Include error codes for debugging
    - _Requirements: Requirement 16.10_
  
  - [ ]* 14.9 Write integration test for error recovery
    - Simulate VectorProvider failure, verify full-text fallback
    - Simulate LLM failure, verify circuit breaker activation
    - Simulate transient error, verify retry with backoff
    - Verify partial results returned on component failures
    - _Requirements: Requirement 17.7_

- [ ] 15. Checkpoint - Verify retrieval pipeline and error handling
  - Ensure all tests pass, ask the user if questions arise.


### Week 3: Evaluation & Optimization

- [ ] 16. Implement Golden Dataset management
  - [ ] 16.1 Create GoldenDatasetEntry domain entity
    - Create `apps/api/src/domain/entities/GoldenDatasetEntry.ts`
    - Define GoldenDatasetEntry class with id, query, relevantNoteIds, expectedAnswer, category, difficulty, createdAt
    - Define QueryCategory type: 'factual' | 'causal' | 'temporal' | 'comparative' | 'multi-part'
    - _Requirements: Design Section "Domain Entities - GoldenDatasetEntry"_
  
  - [ ] 16.2 Create GoldenDatasetRepository abstract class
    - Create `apps/api/src/domain/repositories/GoldenDatasetRepository.ts`
    - Define abstract methods: save(), findById(), findAll(), findByCategory(), update(), delete()
    - Define abstract methods: exportToJson(), importFromJson()
    - _Requirements: Design Section "Repository Interfaces - GoldenDatasetRepository"_
  
  - [ ] 16.3 Implement DrizzleGoldenDatasetRepository
    - Create `apps/api/src/infrastructure/repositories/DrizzleGoldenDatasetRepository.ts`
    - Implement all CRUD operations using Drizzle ORM
    - Implement validation that referenced note_ids exist
    - Prevent duplicate queries with unique constraint
    - _Requirements: Requirement 10.1, Requirement 10.2, Requirement 10.3, Requirement 10.7_
  
  - [ ] 16.4 Implement JSON export/import
    - Implement exportToJson() serializing all entries
    - Implement importFromJson() with validation
    - Support versioning of golden dataset
    - _Requirements: Requirement 10.6, Requirement 10.9_
  
  - [ ] 16.5 Create ManageGoldenDataset use case
    - Create `apps/api/src/application/useCases/ManageGoldenDataset.ts`
    - Implement methods: addEntry(), updateEntry(), deleteEntry(), listEntries()
    - Validate query categories and difficulty levels
    - Track when each test case was last validated
    - _Requirements: Requirement 10.4, Requirement 10.5, Requirement 10.8_
  
  - [ ]* 16.6 Write unit tests for GoldenDatasetRepository
    - Test save() creates entry with all fields
    - Test findByCategory() filters correctly
    - Test update() modifies existing entry
    - Test delete() removes entry
    - Test exportToJson() produces valid JSON
    - Test importFromJson() validates and creates entries
    - Test duplicate query prevention
    - _Requirements: Requirement 17.2_

- [ ] 17. Implement EvaluationService with metrics computation
  - [ ] 17.1 Create EvaluationResult domain entity
    - Create `apps/api/src/domain/entities/EvaluationResult.ts`
    - Define EvaluationResult class with all metric fields
    - Define ComparisonReport interface for config comparison
    - _Requirements: Design Section "Domain Entities - EvaluationResult"_

  - [ ] 17.2 Create EvaluationResultRepository abstract class
    - Create `apps/api/src/domain/repositories/EvaluationResultRepository.ts`
    - Define abstract methods: save(), findById(), findByConfigHash(), findRecent(), compareConfigs()
    - _Requirements: Design Section "Repository Interfaces - EvaluationResultRepository"_
  
  - [ ] 17.3 Implement DrizzleEvaluationResultRepository
    - Create `apps/api/src/infrastructure/repositories/DrizzleEvaluationResultRepository.ts`
    - Implement all methods using Drizzle ORM
    - Implement compareConfigs() computing improvement deltas
    - Calculate statistical significance for comparisons
    - _Requirements: Design Section "Repository Interfaces - EvaluationResultRepository"_
  
  - [ ] 17.4 Create EvaluationService class
    - Create `apps/api/src/application/services/EvaluationService.ts`
    - Inject GoldenDatasetRepository, EvaluationResultRepository, RetrieveDocuments, LLMProvider
    - Define QueryEvaluationResult and AggregatedMetrics interfaces
    - _Requirements: Design Section "EvaluationService"_
  
  - [ ] 17.5 Implement Hit Rate computation
    - Create computeHitAtK() method
    - Check if any relevant document appears in top-k results
    - Compute for k=1, 3, 5, 10
    - Return boolean for each k value
    - _Requirements: Requirement 9.2, Requirement 11.1_
  
  - [ ] 17.6 Implement MRR computation
    - Create computeReciprocalRank() method
    - Find rank of first relevant document in results
    - Compute 1 / rank (or 0 if no relevant doc found)
    - Average across all queries for final MRR
    - _Requirements: Requirement 9.3, Requirement 11.2_
  
  - [ ] 17.7 Implement Faithfulness evaluation
    - Use LLM to check if answer statements are supported by context
    - Build prompt with context and answer
    - Parse LLM response for faithfulness score [0, 1]
    - Handle edge cases (empty context, empty answer)
    - _Requirements: Requirement 9.4, Requirement 11.3, Requirement 11.9_
  
  - [ ] 17.8 Implement Answer Relevance evaluation
    - Use LLM to compare generated answer to expected answer
    - Build prompt with query, answer, and expected answer
    - Parse LLM response for relevance score [0, 1]
    - _Requirements: Requirement 9.5, Requirement 11.4_
  
  - [ ] 17.9 Implement latency metrics computation
    - Track retrieval latency for each query
    - Compute p50, p95, p99 percentiles
    - Verify p50 <= p95 <= p99 invariant
    - _Requirements: Requirement 11.6, Property 10_
  
  - [ ] 17.10 Implement runEvaluation() main method
    - Load all test cases from GoldenDatasetRepository
    - For each test case: execute retrieval, compute metrics, generate answer
    - Aggregate metrics across all queries
    - Compute category-specific metrics
    - Save EvaluationResult to repository
    - Complete within 5 minutes for 100 test queries
    - _Requirements: Requirement 9.7, Requirement 9.9, Requirement 9.11, Requirement 11.7_

  - [ ] 17.11 Implement configuration hashing
    - Create hashConfig() method
    - Generate deterministic hash from RetrievalConfig
    - Use for comparing evaluation runs with same configuration
    - _Requirements: Requirement 9.9_
  
  - [ ]* 17.12 Write unit tests for EvaluationService
    - Test computeHitAtK() identifies relevant documents correctly
    - Test computeReciprocalRank() calculates correct rank
    - Test aggregateResults() computes averages correctly
    - Test runEvaluation() processes all test cases
    - Test runEvaluation() saves results to repository
    - Test latency metrics satisfy p50 <= p95 <= p99
    - _Requirements: Requirement 17.2_
  
  - [ ]* 17.13 Write property test for metrics bounds
    - **Property 10: Metric Bounds**
    - **Validates: Requirements 9.2, 9.3, Property 10**
    - Verify Hit_Rate in [0, 1], MRR in [0, 1], latency percentiles ordered

- [ ] 18. Create evaluation and retrieval API endpoints
  - [ ] 18.1 Create RetrievalController
    - Create `apps/api/src/infrastructure/http/controllers/RetrievalController.ts`
    - Implement Controller interface with path = "/retrieve"
    - Inject RetrieveDocuments use case
    - Initialize router and bind routes
    - _Requirements: Requirement 18, Integration Points - Controller Integration_
  
  - [ ] 18.2 Implement POST /retrieve endpoint
    - Accept query and optional config in request body
    - Validate request with Zod schema (retrieveSchema)
    - Call retrieveDocuments.execute()
    - Return results with chunk_id, note_id, content, score, metadata
    - Return 504 if timeout exceeds 2000ms
    - Return Spanish error messages on failure
    - _Requirements: Requirement 18.1, Requirement 18.2, Requirement 18.4, Requirement 18.6_
  
  - [ ] 18.3 Implement GET /retrieve/metrics endpoint
    - Accept optional date range query parameters
    - Query evaluation results from repository
    - Return aggregated metrics
    - _Requirements: Requirement 18.7_
  
  - [ ] 18.4 Create EvaluationController
    - Create `apps/api/src/infrastructure/http/controllers/EvaluationController.ts`
    - Implement Controller interface with path = "/evaluation"
    - Inject EvaluationService and ManageGoldenDataset use cases
    - _Requirements: Requirement 18.8_
  
  - [ ] 18.5 Implement POST /evaluation/run endpoint
    - Accept retrieval configuration in request body
    - Validate request with Zod schema
    - Call evaluationService.runEvaluation()
    - Return evaluation results with all metrics
    - _Requirements: Requirement 18.8_

  - [ ] 18.6 Implement golden dataset CRUD endpoints
    - POST /evaluation/golden - Add new test case
    - GET /evaluation/golden - List all test cases
    - GET /evaluation/golden/:id - Get specific test case
    - PUT /evaluation/golden/:id - Update test case
    - DELETE /evaluation/golden/:id - Delete test case
    - POST /evaluation/golden/import - Import from JSON
    - GET /evaluation/golden/export - Export to JSON
    - _Requirements: Requirement 10.2_
  
  - [ ] 18.7 Create Zod validation schemas
    - Add schemas to `packages/shared-types/src/schemas.ts`
    - Create retrieveSchema with query, topK, strategy, enableRerank fields
    - Create goldenDatasetEntrySchema with query, relevantNoteIds, expectedAnswer, category, difficulty
    - Create evaluationConfigSchema for evaluation runs
    - _Requirements: Requirement 18.5_
  
  - [ ] 18.8 Register controllers in Core.ts
    - Import RetrievalController and EvaluationController
    - Instantiate with dependencies
    - Add to controllers array in `apps/api/src/infrastructure/Core.ts`
    - _Requirements: Integration Points - Controller Integration_
  
  - [ ]* 18.9 Write integration test for retrieval endpoint
    - Create test notes and chunks
    - POST to /retrieve with query
    - Verify response contains results with correct structure
    - Verify results include chunk_id, note_id, content, score
    - Verify response time within 2000ms
    - _Requirements: Requirement 17.3_
  
  - [ ]* 18.10 Write integration test for evaluation endpoint
    - Create golden dataset entries
    - POST to /evaluation/run with config
    - Verify evaluation completes successfully
    - Verify metrics returned (hit_rate, mrr, faithfulness, answer_relevance)
    - _Requirements: Requirement 17.3_

- [ ] 19. Implement observability and monitoring
  - [ ] 19.1 Add structured logging throughout retrieval pipeline
    - Log retrieval start with query and config
    - Log latency for each stage (transform, search, rerank, expand)
    - Log result counts at each stage
    - Log query transformations and their impact
    - Include threadId or requestId in all log statements
    - Use Winston logger with appropriate log levels
    - _Requirements: Requirement 13.1, Requirement 13.2, Requirement 13.3, Requirement 13.9_
  
  - [ ] 19.2 Add performance monitoring
    - Log warnings when retrieval latency exceeds 2000ms threshold
    - Track and log cache hit rates for embeddings
    - Emit metrics for retrieval success rate
    - _Requirements: Requirement 13.6, Requirement 13.9_

  - [ ] 19.3 Create debug endpoint for retrieval pipeline
    - Implement GET /retrieve/debug/:query endpoint
    - Return detailed pipeline information: transformed query, search results at each stage, scores, latencies
    - Include intermediate results from each pipeline stage
    - Protect endpoint with admin authentication (if available)
    - _Requirements: Requirement 13.10_
  
  - [ ] 19.4 Create health check endpoint
    - Implement GET /retrieve/health endpoint
    - Check database connection
    - Check LLM provider availability
    - Check vector provider availability
    - Return health status with component details
    - _Requirements: Requirement 13.8_
  
  - [ ] 19.5 Add request tracing
    - Generate unique requestId for each retrieval request
    - Include requestId in all log statements
    - Track execution through entire pipeline
    - Log execution start and end with timestamps
    - _Requirements: Requirement 13.5_

- [ ] 20. Implement performance optimizations
  - [ ] 20.1 Add embedding cache
    - Implement in-memory cache for frequently accessed chunk embeddings
    - Use LRU eviction policy
    - Configure cache size limit (default 1000 embeddings)
    - Track and log cache hit rates
    - _Requirements: Requirement 14.3, Requirement 14.9_
  
  - [ ] 20.2 Implement batch embedding generation
    - Update VectorProvider interface with generateEmbeddings() method
    - Implement in OllamaVectorProvider
    - Batch multiple embedding requests together
    - Use during note migration and bulk operations
    - _Requirements: Requirement 14.4, Design Section "Extended VectorProvider Interface"_
  
  - [ ] 20.3 Configure database connection pooling
    - Set minimum 5, maximum 20 connections in pool
    - Configure idle timeout and connection lifetime
    - Tune pool settings for concurrent queries
    - _Requirements: Requirement 14.5_
  
  - [ ] 20.4 Implement query result caching
    - Cache retrieval results for identical queries
    - Use TTL of 5 minutes for cache entries
    - Include config hash in cache key
    - Invalidate cache on note updates
    - _Requirements: Requirement 14.6_
  
  - [ ] 20.5 Add rate limiting for LLM requests
    - Limit concurrent LLM requests to prevent resource exhaustion
    - Use semaphore or queue for request throttling
    - Configure max concurrent requests (default 10)
    - _Requirements: Requirement 14.7_

  - [ ] 20.6 Optimize contextual embedding generation
    - Pre-compute and cache contextual embeddings during note indexing
    - Avoid regenerating contextual info for same note
    - Store contextual info in database for reuse
    - _Requirements: Requirement 7.4, Requirement 14.9_
  
  - [ ] 20.7 Add performance degradation fallback
    - Monitor retrieval latency in real-time
    - Fall back to simpler strategies when performance degrades
    - Skip re-ranking if latency budget exceeded
    - Skip query transformation if latency budget exceeded
    - _Requirements: Requirement 14.8_
  
  - [ ]* 20.8 Write performance test for retrieval latency
    - Create test dataset with 100 notes
    - Execute 50 retrieval queries
    - Measure p95 latency
    - Verify p95 < 2000ms
    - _Requirements: Requirement 17.6_

- [ ] 21. Checkpoint - Verify evaluation framework and optimizations
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Run baseline evaluation and benchmarking
  - [ ] 22.1 Create initial golden dataset
    - Manually curate 20-30 test queries covering different categories
    - Include factual, causal, temporal, comparative, multi-part queries
    - Assign difficulty levels (1-5)
    - Identify relevant note IDs for each query
    - Write expected answers
    - _Requirements: Requirement 10.4, Requirement 10.5_
  
  - [ ] 22.2 Run baseline evaluation (semantic-only)
    - Configure retrieval with strategy='semantic-only'
    - Run evaluation on golden dataset
    - Record Hit_Rate@10, MRR, latency metrics
    - Save baseline results for comparison
    - _Requirements: Success Metrics - Baseline Measurement_
  
  - [ ] 22.3 Run hybrid search evaluation
    - Configure retrieval with strategy='hybrid'
    - Run evaluation on golden dataset
    - Compare Hit_Rate@10 to baseline
    - Verify improvement >= 20%
    - _Requirements: Requirement 9.9, Property 5_
  
  - [ ] 22.4 Run hybrid + re-ranking evaluation
    - Configure retrieval with strategy='hybrid+rerank'
    - Run evaluation on golden dataset
    - Compare all metrics to baseline and hybrid-only
    - Verify Hit_Rate@10 >= 85%
    - _Requirements: Success Metrics - Target Achievement_
  
  - [ ] 22.5 Generate comparison report
    - Use evaluationResultRepo.compareConfigs()
    - Generate report showing improvements across configurations
    - Include statistical significance analysis
    - Document findings
    - _Requirements: Requirement 9.9_


- [ ] 23. Integrate with existing Chat agent
  - [ ] 23.1 Update Chat use case to use RetrieveDocuments
    - Locate existing Chat use case in codebase
    - Replace existing retrieval logic with RetrieveDocuments.execute()
    - Use hybrid+rerank strategy by default
    - Pass retrieved results to LLM for answer generation
    - _Requirements: Integration Points - Existing Component Integration_
  
  - [ ] 23.2 Update AgentGraph to use enhanced retrieval
    - Update existing AgentGraph implementation
    - Integrate RetrieveDocuments into agent workflow
    - Maintain backward compatibility with existing agent state
    - _Requirements: Integration Points - Existing Component Integration_
  
  - [ ] 23.3 Test end-to-end chat with enhanced retrieval
    - Create test conversation with multiple turns
    - Verify retrieval returns relevant context
    - Verify LLM generates accurate answers
    - Verify faithfulness and answer relevance scores
    - _Requirements: Success Metrics - Faithfulness and Answer Relevance_

- [ ] 24. Complete testing and achieve coverage goals
  - [ ]* 24.1 Write property test for retrieval determinism
    - **Property 4: Retrieval Determinism**
    - **Validates: Requirements 12.8, Property 4**
    - Verify identical queries with same config return identical results
  
  - [ ]* 24.2 Write property test for hit rate improvement
    - **Property 5: Hit Rate Improvement**
    - **Validates: Requirements 9.2, Property 5**
    - Verify hybrid search Hit_Rate@10 >= baseline semantic search
  
  - [ ]* 24.3 Write property test for chunk-note relationship integrity
    - **Property 2: Chunk-Note Relationship Integrity**
    - **Validates: Requirements 5.6, Property 2**
    - Verify each chunk references exactly one parent note that exists
  
  - [ ]* 24.4 Write property test for parallel search consistency
    - **Property 9: Parallel Search Consistency**
    - **Validates: Requirements 1.8, Property 9**
    - Verify if either search returns results, hybrid search returns results
  
  - [ ]* 24.5 Write property test for score normalization
    - **Property 7: Score Normalization**
    - **Validates: Requirements 2.8, 3.9, Property 7**
    - Verify all retrieval and re-ranking scores in [0, 1]
  
  - [ ] 24.6 Run full test suite and measure coverage
    - Execute `pnpm test -- --coverage` from apps/api
    - Verify coverage >= 90% for all new components
    - Identify and fill any coverage gaps
    - _Requirements: Requirement 17.1, Success Metrics - Test Coverage_
  
  - [ ] 24.7 Verify all correctness properties tested
    - Confirm property tests exist for all 10 correctness properties
    - Verify all property tests pass
    - Document any properties not testable with explanation
    - _Requirements: Requirement 17.4_

- [ ] 25. Final checkpoint - Ensure all tests pass and metrics achieved
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 26. Production deployment preparation
  - [ ] 26.1 Update environment variables
    - Add RAG configuration variables to .env.example
    - Document: CHUNK_SIZE, CHUNK_OVERLAP, RERANK_ENABLED, QUERY_TRANSFORM_ENABLED
    - Document: EMBEDDING_CACHE_SIZE, MAX_CONCURRENT_LLM_REQUESTS
    - Document: RETRIEVAL_TIMEOUT_MS, EVALUATION_ENABLED
    - _Requirements: Requirement 12.8_
  
  - [ ] 26.2 Create migration script for existing notes
    - Create standalone script for production migration
    - Add progress reporting and error handling
    - Support resumable migration (track progress)
    - Add dry-run mode for testing
    - Document migration procedure
    - _Requirements: Requirement 15.2, Requirement 15.4, Requirement 15.8_
  
  - [ ] 26.3 Create API documentation
    - Document all /retrieve/* endpoints with examples
    - Document all /evaluation/* endpoints with examples
    - Include request/response schemas
    - Document error codes and Spanish messages
    - Create OpenAPI/Swagger specification
    - _Requirements: Requirement 18.9, Success Metrics - Documentation_
  
  - [ ] 26.4 Create deployment checklist
    - Database migration steps
    - Environment variable configuration
    - Note migration procedure
    - Rollback procedure
    - Monitoring and alerting setup
    - Performance baseline verification
  
  - [ ] 26.5 Verify backward compatibility
    - Test existing API endpoints still work
    - Verify existing notes can be retrieved
    - Verify existing chat functionality works
    - Confirm zero breaking changes
    - _Requirements: Requirement 15.6, Requirement 15.7, Success Metrics - Zero Breaking Changes_
  
  - [ ] 26.6 Run production migration on staging
    - Execute migration script on staging environment
    - Verify all notes migrated successfully
    - Run evaluation on staging data
    - Verify Hit_Rate@10 >= 85%
    - Verify p95 latency < 2000ms
    - _Requirements: Success Metrics - All Metrics_

- [ ] 27. Final validation and handoff
  - [ ] 27.1 Verify all success criteria met
    - Hit_Rate@10 >= 85% on golden dataset ✓
    - MRR improvement >= 20% from baseline ✓
    - End-to-end retrieval p95 < 2000ms ✓
    - Test coverage >= 90% ✓
    - Zero breaking changes ✓
    - Successful migration of existing notes ✓
    - Faithfulness score >= 0.85 ✓
    - Answer_Relevance score >= 0.80 ✓
    - _Requirements: Success Metrics - All Criteria_
  
  - [ ] 27.2 Create handoff documentation
    - Architecture overview with diagrams
    - Component responsibilities and interactions
    - Configuration guide
    - Troubleshooting guide
    - Performance tuning guide
    - Future enhancement recommendations
  
  - [ ] 27.3 Production deployment
    - Deploy to production environment
    - Run migration script
    - Monitor metrics and logs
    - Verify all endpoints responding correctly
    - Confirm evaluation framework operational

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements and design sections for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- The implementation follows the 3-week roadmap from the requirements document
- All code follows Brain Sync coding conventions in AGENTS.md
- Services go in `application/services/`, not `application/providers/`
- Use Drizzle ORM for all database operations
- Use Winston logger for all logging
- Use Zod schemas from `@brain-sync/types` for validation
- Follow Clean Architecture: domain → application → infrastructure


## Implementation Summary

### Week 1: Advanced Retrieval (Tasks 1-8)
- Database schema for chunks, full-text search, golden dataset, evaluation results
- ChunkingService with Spanish sentence segmentation and contextual embeddings
- ChunkRepository with semantic and full-text search
- HybridSearchService with RRF algorithm
- QueryTransformationService with intent detection and HyDE
- ReRankingService with LLM-based scoring
- All core retrieval infrastructure

### Week 2: Intelligent Chunking & Context (Tasks 9-15)
- ContextExpansionService for sentence-window retrieval
- Integration of chunking into note indexing workflow
- MigrateNotesToChunks use case for existing notes
- GraphRAG enhancement with causal chain traversal
- RetrieveDocuments use case orchestrating full pipeline
- Comprehensive error handling and resilience
- Fallback strategies for all components

### Week 3: Evaluation & Optimization (Tasks 16-27)
- Golden dataset management with CRUD operations
- EvaluationService with Hit Rate, MRR, Faithfulness, Answer Relevance
- RetrievalController and EvaluationController with API endpoints
- Observability with structured logging and monitoring
- Performance optimizations (caching, batching, connection pooling)
- Baseline evaluation and benchmarking
- Integration with existing Chat agent
- Property-based testing for all correctness properties
- Production deployment preparation and migration
- Final validation of all success criteria

### Files to Create/Modify

```
apps/api/src/
├── application/
│   ├── services/
│   │   ├── ChunkingService.ts (new)
│   │   ├── HybridSearchService.ts (new)
│   │   ├── QueryTransformationService.ts (new)
│   │   ├── ReRankingService.ts (new)
│   │   ├── ContextExpansionService.ts (new)
│   │   └── EvaluationService.ts (new)
│   ├── useCases/
│   │   ├── RetrieveDocuments.ts (new)
│   │   ├── MigrateNotesToChunks.ts (new)
│   │   ├── ManageGoldenDataset.ts (new)
│   │   ├── IndexNote.ts (modify)
│   │   └── Chat.ts (modify)
│   └── providers/
│       ├── LLMProvider.ts (modify - add scoring methods)
│       └── VectorProvider.ts (modify - add batch methods)
├── domain/
│   ├── entities/
│   │   ├── Chunk.ts (new)
│   │   ├── RetrievalResult.ts (new)
│   │   ├── GoldenDatasetEntry.ts (new)
│   │   └── EvaluationResult.ts (new)
│   └── repositories/
│       ├── ChunkRepository.ts (new)
│       ├── GoldenDatasetRepository.ts (new)
│       └── EvaluationResultRepository.ts (new)
└── infrastructure/
    ├── repositories/
    │   ├── DrizzleChunkRepository.ts (new)
    │   ├── DrizzleGoldenDatasetRepository.ts (new)
    │   └── DrizzleEvaluationResultRepository.ts (new)
    ├── providers/
    │   └── OllamaLLMProvider.ts (modify - implement scoring)
    ├── http/
    │   └── controllers/
    │       ├── RetrievalController.ts (new)
    │       ├── EvaluationController.ts (new)
    │       └── NoteController.ts (modify)
    └── db/
        └── schema.ts (modify - add new tables)

apps/api/test/
├── ChunkingService.test.ts (new)
├── ChunkRepository.test.ts (new)
├── HybridSearchService.test.ts (new)
├── QueryTransformationService.test.ts (new)
├── ReRankingService.test.ts (new)
├── ContextExpansionService.test.ts (new)
├── EvaluationService.test.ts (new)
├── RetrieveDocuments.integration.test.ts (new)
├── ChunkBoundaryConsistency.property.test.ts (new)
├── RRFMonotonicity.property.test.ts (new)
├── RetrievalDeterminism.property.test.ts (new)
└── ... (additional property tests)

packages/shared-types/src/
└── schemas.ts (modify - add retrieval and evaluation schemas)
```

### Key Dependencies
- Existing: Drizzle ORM, pgvector, Ollama, Winston, Zod, Vitest
- New: fast-check (for property-based testing)

### Success Metrics Tracking
- Hit_Rate@10: Target >= 85% (baseline ~60%)
- MRR: Target >= 20% improvement
- Latency p95: Target < 2000ms
- Test coverage: Target >= 90%
- Faithfulness: Target >= 0.85
- Answer_Relevance: Target >= 0.80
