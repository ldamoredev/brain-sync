# Requirements Document: Production RAG Improvements

## Introduction

This document specifies requirements for Phase 2 of Brain Sync: Production RAG (Retrieval-Augmented Generation) improvements. The goal is to enhance retrieval accuracy from ~60% to 85%+ through hybrid search, re-ranking, intelligent chunking, and comprehensive evaluation metrics. This phase builds on the existing LangGraph agent infrastructure and maintains Clean Architecture principles.

## Glossary

- **RAG_System**: The Retrieval-Augmented Generation system that retrieves relevant notes and generates context-aware answers
- **Hybrid_Search**: A search strategy combining semantic vector search with full-text keyword search
- **Re_Ranker**: A component that refines search results by scoring and reordering them based on relevance
- **Semantic_Search**: Vector similarity search using embeddings stored in pgvector
- **Full_Text_Search**: PostgreSQL full-text search using tsvector and tsquery
- **RRF**: Reciprocal Rank Fusion algorithm for combining multiple ranked result lists
- **Chunk**: A segment of a note's content used for embedding and retrieval
- **Sentence_Window**: A retrieval strategy that searches small chunks but returns expanded context
- **Contextual_Embedding**: An embedding generated from chunk content enriched with surrounding context
- **HyDE**: Hypothetical Document Embeddings - generating hypothetical answers to improve retrieval
- **Query_Transformer**: A component that analyzes and transforms user queries for better retrieval
- **Cross_Encoder**: A neural model that scores query-document pairs for re-ranking
- **Hit_Rate**: The percentage of queries where at least one relevant document appears in top-k results
- **MRR**: Mean Reciprocal Rank - the average of reciprocal ranks of the first relevant result
- **Faithfulness**: A metric measuring whether the generated answer is grounded in retrieved context
- **Answer_Relevance**: A metric measuring whether the answer addresses the user's question
- **Golden_Dataset**: A curated set of test queries with known relevant documents and expected answers
- **GraphRAG**: Graph-based RAG that traverses causal relationships between entities
- **Evaluation_Framework**: The system for measuring and tracking retrieval quality metrics
- **Chunk_Strategy**: The algorithm determining how notes are segmented into chunks
- **Vector_Provider**: The interface for generating embeddings (currently Ollama)
- **Note_Repository**: The repository managing note persistence and retrieval

## Requirements

### Requirement 1: Hybrid Search Implementation

**User Story:** As a user, I want the system to combine semantic and keyword search, so that I get relevant results even when my query uses different terminology than my notes.

#### Acceptance Criteria

1. THE Hybrid_Search SHALL combine results from Semantic_Search and Full_Text_Search using the RRF algorithm
2. WHEN a user query is received, THE Hybrid_Search SHALL execute both Semantic_Search and Full_Text_Search in parallel
3. THE Hybrid_Search SHALL accept a configurable weight parameter for balancing semantic vs full-text results
4. THE RRF algorithm SHALL compute combined scores using the formula: score = sum(1 / (k + rank_i)) where k is a constant (default 60)
5. THE Hybrid_Search SHALL return the top-k results ordered by combined RRF score
6. FOR ALL queries, THE Hybrid_Search SHALL complete within 500ms for top-10 results
7. THE Full_Text_Search SHALL use PostgreSQL tsvector with Spanish language configuration
8. THE Hybrid_Search SHALL handle empty result sets from either search method gracefully
9. WHEN both search methods return no results, THE Hybrid_Search SHALL return an empty result set
10. THE Hybrid_Search SHALL preserve note metadata (id, created_at, chunk_index) in results

### Requirement 2: Full-Text Search Infrastructure

**User Story:** As a user, I want keyword-based search on my notes, so that I can find notes containing specific terms even if semantic meaning differs.

#### Acceptance Criteria

1. THE Note_Repository SHALL maintain a tsvector column for full-text search on note content
2. THE Note_Repository SHALL create a GIN index on the tsvector column for performance
3. WHEN a note is created or updated, THE Note_Repository SHALL automatically update the tsvector column
4. THE Full_Text_Search SHALL use PostgreSQL ts_rank_cd for relevance scoring
5. THE Full_Text_Search SHALL support Spanish language stemming and stop words
6. THE Full_Text_Search SHALL handle special characters and punctuation in queries
7. THE Full_Text_Search SHALL support phrase queries using quoted strings
8. THE Full_Text_Search SHALL return results with relevance scores normalized to [0, 1]
9. FOR ALL queries with matching documents, THE Full_Text_Search SHALL return results within 200ms

### Requirement 3: Re-Ranking System

**User Story:** As a user, I want the most relevant results to appear first, so that I don't have to sift through less relevant information.

#### Acceptance Criteria

1. THE Re_Ranker SHALL accept a list of retrieved chunks and a user query as input
2. THE Re_Ranker SHALL score each chunk-query pair for relevance
3. THE Re_Ranker SHALL reorder chunks by relevance score in descending order
4. THE Re_Ranker SHALL support cross-encoder models for scoring
5. WHEN a cross-encoder model is unavailable, THE Re_Ranker SHALL fall back to LLM-based scoring
6. THE Re_Ranker SHALL batch score requests for efficiency when processing multiple chunks
7. FOR ALL re-ranking operations with 10 chunks, THE Re_Ranker SHALL complete within 1000ms
8. THE Re_Ranker SHALL preserve original retrieval scores as metadata
9. THE Re_Ranker SHALL return normalized relevance scores in range [0, 1]
10. WHERE re-ranking is disabled in configuration, THE RAG_System SHALL use original retrieval order

### Requirement 4: Query Transformation

**User Story:** As a user, I want the system to understand complex questions, so that I get comprehensive answers even for multi-part queries.

#### Acceptance Criteria

1. THE Query_Transformer SHALL detect whether a query is simple or complex
2. WHEN a query contains multiple questions, THE Query_Transformer SHALL decompose it into sub-queries
3. THE Query_Transformer SHALL identify query intent (factual, causal, temporal, comparative)
4. WHEN query intent is causal, THE Query_Transformer SHALL prioritize GraphRAG traversal
5. THE Query_Transformer SHALL generate hypothetical answers using HyDE for abstract queries
6. WHEN HyDE is applied, THE Query_Transformer SHALL embed the hypothetical answer for retrieval
7. THE Query_Transformer SHALL preserve the original query alongside transformed versions
8. THE Query_Transformer SHALL handle Spanish language queries with proper linguistic analysis
9. FOR ALL query transformations, THE Query_Transformer SHALL complete within 300ms
10. THE Query_Transformer SHALL return a structured transformation result with original query, sub-queries, intent, and HyDE answer

### Requirement 5: Intelligent Chunking Strategy

**User Story:** As a developer, I want notes to be chunked intelligently, so that retrieval accuracy improves without losing context.

#### Acceptance Criteria

1. THE Chunk_Strategy SHALL segment notes by semantic boundaries (sentences, paragraphs)
2. THE Chunk_Strategy SHALL maintain configurable chunk size limits (default 512 tokens)
3. THE Chunk_Strategy SHALL ensure chunk overlap (default 50 tokens) to preserve context
4. THE Chunk_Strategy SHALL respect sentence boundaries and avoid mid-sentence splits
5. WHEN a single sentence exceeds chunk size, THE Chunk_Strategy SHALL split at clause boundaries
6. THE Chunk_Strategy SHALL preserve metadata linking chunks to parent notes
7. THE Chunk_Strategy SHALL assign sequential chunk indices within each note
8. FOR ALL notes, THE Chunk_Strategy SHALL produce at least one chunk
9. THE Chunk_Strategy SHALL handle notes in Spanish with proper sentence detection
10. THE Chunk_Strategy SHALL store chunk boundaries (start_char, end_char) for context expansion

### Requirement 6: Sentence-Window Retrieval

**User Story:** As a user, I want to see relevant context around search results, so that I understand the full meaning of retrieved information.

#### Acceptance Criteria

1. THE RAG_System SHALL search using small chunks (256 tokens) for precision
2. WHEN a chunk is retrieved, THE RAG_System SHALL expand context by N sentences before and after (default N=2)
3. THE RAG_System SHALL retrieve expanded context from the parent note using stored chunk boundaries
4. THE RAG_System SHALL merge overlapping expanded contexts from adjacent chunks
5. THE RAG_System SHALL preserve chunk boundaries in metadata for debugging
6. THE RAG_System SHALL limit expanded context to note boundaries (no cross-note expansion)
7. FOR ALL retrieved chunks, THE RAG_System SHALL return expanded context within 100ms
8. THE RAG_System SHALL include both original chunk and expanded context in results
9. THE RAG_System SHALL mark the original matched chunk within expanded context

### Requirement 7: Contextual Embeddings

**User Story:** As a developer, I want chunk embeddings to include surrounding context, so that retrieval captures semantic relationships better.

#### Acceptance Criteria

1. WHEN generating embeddings for a chunk, THE RAG_System SHALL prepend contextual information
2. THE RAG_System SHALL generate contextual information using the LLM with a prompt template
3. THE contextual information SHALL include: parent note summary, chunk position, and surrounding topics
4. THE RAG_System SHALL cache contextual information to avoid redundant LLM calls
5. THE RAG_System SHALL embed the concatenation of contextual information and chunk content
6. THE RAG_System SHALL store both contextualized and original embeddings for comparison
7. WHERE contextual embedding fails, THE RAG_System SHALL fall back to standard chunk embedding
8. FOR ALL chunks, THE RAG_System SHALL generate contextual embeddings within 2000ms
9. THE RAG_System SHALL use the Vector_Provider interface for embedding generation

### Requirement 8: GraphRAG Enhancement

**User Story:** As a user, I want the system to follow causal chains in my notes, so that I understand how different concepts and behaviors are connected.

#### Acceptance Criteria

1. WHEN query intent is causal, THE RAG_System SHALL traverse the existing graph structure
2. THE RAG_System SHALL identify causal paths between entities (CAUSES, TRIGGERS, LEADS_TO relationships)
3. THE RAG_System SHALL retrieve notes associated with entities in the causal path
4. THE RAG_System SHALL rank causal paths by relevance to the query
5. THE RAG_System SHALL limit graph traversal depth (default max depth 3)
6. THE RAG_System SHALL combine graph-based results with vector search results
7. THE RAG_System SHALL prioritize direct causal relationships over indirect ones
8. FOR ALL graph traversals, THE RAG_System SHALL complete within 500ms
9. THE RAG_System SHALL return causal paths as structured metadata with results
10. WHEN no causal relationships exist, THE RAG_System SHALL fall back to standard retrieval

### Requirement 9: Evaluation Framework

**User Story:** As a developer, I want to measure retrieval quality objectively, so that I can track improvements and identify regressions.

#### Acceptance Criteria

1. THE Evaluation_Framework SHALL maintain a Golden_Dataset of test queries with expected results
2. THE Evaluation_Framework SHALL compute Hit_Rate at k values (k=1, 3, 5, 10)
3. THE Evaluation_Framework SHALL compute MRR across all test queries
4. THE Evaluation_Framework SHALL compute Faithfulness by checking if answers are grounded in retrieved context
5. THE Evaluation_Framework SHALL compute Answer_Relevance by comparing answers to expected answers
6. THE Evaluation_Framework SHALL support adding new test cases to the Golden_Dataset
7. THE Evaluation_Framework SHALL run evaluations on-demand and on a schedule
8. THE Evaluation_Framework SHALL store evaluation results with timestamps for trend analysis
9. THE Evaluation_Framework SHALL generate comparison reports between different retrieval configurations
10. THE Evaluation_Framework SHALL export metrics in JSON format for external analysis
11. FOR ALL evaluation runs, THE Evaluation_Framework SHALL complete within 5 minutes for 100 test queries

### Requirement 10: Golden Dataset Management

**User Story:** As a developer, I want to curate test cases for evaluation, so that I can ensure the system handles diverse query types.

#### Acceptance Criteria

1. THE Evaluation_Framework SHALL store Golden_Dataset entries with query, relevant_note_ids, and expected_answer
2. THE Evaluation_Framework SHALL support CRUD operations on Golden_Dataset entries
3. THE Evaluation_Framework SHALL validate that referenced note_ids exist in the database
4. THE Evaluation_Framework SHALL categorize test queries by type (factual, causal, temporal, multi-part)
5. THE Evaluation_Framework SHALL support tagging test queries with difficulty levels
6. THE Evaluation_Framework SHALL export and import Golden_Dataset in JSON format
7. THE Evaluation_Framework SHALL prevent duplicate queries in the Golden_Dataset
8. THE Evaluation_Framework SHALL track when each test case was last validated
9. THE Evaluation_Framework SHALL support versioning of the Golden_Dataset

### Requirement 11: Metrics Computation

**User Story:** As a developer, I want automated metric calculation, so that I can objectively compare different retrieval strategies.

#### Acceptance Criteria

1. THE Evaluation_Framework SHALL compute Hit_Rate as: (queries with relevant doc in top-k) / (total queries)
2. THE Evaluation_Framework SHALL compute MRR as: average(1 / rank of first relevant doc)
3. THE Evaluation_Framework SHALL use an LLM to evaluate Faithfulness by checking if answer statements are supported by context
4. THE Evaluation_Framework SHALL use an LLM to evaluate Answer_Relevance by comparing answer to expected answer
5. THE Evaluation_Framework SHALL compute precision and recall for retrieved document sets
6. THE Evaluation_Framework SHALL compute latency metrics (p50, p95, p99) for retrieval operations
7. THE Evaluation_Framework SHALL aggregate metrics by query category and difficulty
8. THE Evaluation_Framework SHALL detect statistically significant changes in metrics
9. FOR ALL metric computations, THE Evaluation_Framework SHALL handle edge cases (no relevant docs, empty results)

### Requirement 12: Retrieval Configuration Management

**User Story:** As a developer, I want to experiment with different retrieval configurations, so that I can optimize for accuracy and performance.

#### Acceptance Criteria

1. THE RAG_System SHALL support configurable retrieval strategies (semantic-only, hybrid, hybrid+rerank)
2. THE RAG_System SHALL accept configuration for chunk size, overlap, and window size
3. THE RAG_System SHALL accept configuration for top-k values at each stage (retrieval, re-ranking)
4. THE RAG_System SHALL accept configuration for RRF weights and constants
5. THE RAG_System SHALL accept configuration for enabling/disabling query transformation
6. THE RAG_System SHALL accept configuration for enabling/disabling contextual embeddings
7. THE RAG_System SHALL validate configuration parameters on startup
8. THE RAG_System SHALL log the active configuration on each retrieval request
9. WHERE invalid configuration is provided, THE RAG_System SHALL use default values and log a warning
10. THE RAG_System SHALL support A/B testing by accepting configuration overrides per request

### Requirement 13: Observability and Monitoring

**User Story:** As a developer, I want detailed observability into retrieval operations, so that I can debug issues and optimize performance.

#### Acceptance Criteria

1. THE RAG_System SHALL log retrieval latency for each stage (search, re-rank, context expansion)
2. THE RAG_System SHALL log the number of results at each stage of the pipeline
3. THE RAG_System SHALL log query transformations and their impact on results
4. THE RAG_System SHALL emit metrics for retrieval success rate, latency, and result counts
5. THE RAG_System SHALL trace individual requests through the retrieval pipeline
6. THE RAG_System SHALL log warnings when retrieval latency exceeds thresholds
7. THE RAG_System SHALL log errors with sufficient context for debugging
8. THE RAG_System SHALL expose health check endpoints for monitoring
9. THE RAG_System SHALL track and log cache hit rates for embeddings and contextual information
10. THE RAG_System SHALL provide debug endpoints that return detailed retrieval pipeline information

### Requirement 14: Performance Optimization

**User Story:** As a user, I want fast responses to my queries, so that I can have a smooth conversational experience.

#### Acceptance Criteria

1. THE RAG_System SHALL complete end-to-end retrieval within 2000ms for 95% of queries
2. THE RAG_System SHALL execute parallel operations (semantic search, full-text search) concurrently
3. THE RAG_System SHALL cache embeddings for frequently accessed chunks
4. THE RAG_System SHALL batch embedding generation requests when processing multiple chunks
5. THE RAG_System SHALL use database connection pooling for concurrent queries
6. THE RAG_System SHALL implement query result caching with TTL (default 5 minutes)
7. THE RAG_System SHALL limit concurrent LLM requests to prevent resource exhaustion
8. WHERE performance degrades, THE RAG_System SHALL fall back to simpler retrieval strategies
9. THE RAG_System SHALL pre-compute and cache contextual embeddings during note indexing

### Requirement 15: Backward Compatibility

**User Story:** As a developer, I want the new RAG system to work with existing data, so that I don't need to re-index all notes.

#### Acceptance Criteria

1. THE RAG_System SHALL support existing note schema without breaking changes
2. THE RAG_System SHALL migrate existing notes to chunked format incrementally
3. THE RAG_System SHALL support querying both chunked and non-chunked notes during migration
4. THE RAG_System SHALL provide a migration script for re-chunking existing notes
5. THE RAG_System SHALL preserve existing note IDs and timestamps during migration
6. THE RAG_System SHALL maintain backward compatibility with existing API endpoints
7. WHERE chunks do not exist for a note, THE RAG_System SHALL treat the entire note as a single chunk
8. THE RAG_System SHALL log migration progress and errors

### Requirement 16: Error Handling and Resilience

**User Story:** As a user, I want the system to handle errors gracefully, so that I still get useful results even when some components fail.

#### Acceptance Criteria

1. WHEN Vector_Provider fails, THE RAG_System SHALL fall back to Full_Text_Search only
2. WHEN Full_Text_Search fails, THE RAG_System SHALL fall back to Semantic_Search only
3. WHEN Re_Ranker fails, THE RAG_System SHALL return original retrieval results
4. WHEN Query_Transformer fails, THE RAG_System SHALL use the original query
5. WHEN context expansion fails, THE RAG_System SHALL return the original chunk
6. THE RAG_System SHALL log all fallback operations with error details
7. THE RAG_System SHALL return partial results rather than failing completely
8. THE RAG_System SHALL implement circuit breakers for external service calls
9. THE RAG_System SHALL retry transient failures with exponential backoff
10. THE RAG_System SHALL return user-friendly error messages in Spanish

### Requirement 17: Testing and Quality Assurance

**User Story:** As a developer, I want comprehensive test coverage, so that I can confidently deploy changes to production.

#### Acceptance Criteria

1. THE RAG_System SHALL achieve 90%+ code coverage for all new components
2. THE RAG_System SHALL include unit tests for each retrieval component
3. THE RAG_System SHALL include integration tests for end-to-end retrieval flows
4. THE RAG_System SHALL include property-based tests for RRF algorithm correctness
5. THE RAG_System SHALL include property-based tests for chunking invariants
6. THE RAG_System SHALL include performance tests validating latency requirements
7. THE RAG_System SHALL include tests for error handling and fallback scenarios
8. THE RAG_System SHALL include tests for Spanish language processing
9. THE RAG_System SHALL validate that Hit_Rate improves from baseline in automated tests

### Requirement 18: API Contract

**User Story:** As a frontend developer, I want a stable API for retrieval, so that I can build reliable user interfaces.

#### Acceptance Criteria

1. THE RAG_System SHALL expose a POST /api/retrieve endpoint accepting query and configuration
2. THE retrieve endpoint SHALL return results with: chunk_id, note_id, content, score, metadata
3. THE retrieve endpoint SHALL accept optional parameters: top_k, strategy, enable_rerank
4. THE retrieve endpoint SHALL return results within 2000ms or return 504 timeout
5. THE retrieve endpoint SHALL validate request parameters using Zod schemas
6. THE retrieve endpoint SHALL return errors in consistent format with Spanish messages
7. THE RAG_System SHALL expose a GET /api/retrieve/metrics endpoint for evaluation metrics
8. THE RAG_System SHALL expose a POST /api/retrieve/evaluate endpoint for running evaluations
9. THE RAG_System SHALL version API endpoints to support future changes
10. THE RAG_System SHALL document API contracts in OpenAPI format

## Correctness Properties

### Property 1: RRF Score Monotonicity
FOR ALL result lists, IF document A ranks higher than document B in RRF output, THEN A's RRF score SHALL be greater than or equal to B's RRF score.

### Property 2: Chunk-Note Relationship Integrity
FOR ALL chunks, THE chunk SHALL reference exactly one parent note, AND the parent note SHALL exist in the database.

### Property 3: Chunk Boundary Consistency
FOR ALL chunks within a note, chunks SHALL be non-overlapping in their core content (excluding overlap regions), AND the union of all chunks SHALL cover the entire note content.

### Property 4: Retrieval Determinism
FOR ALL queries with identical parameters and database state, THE RAG_System SHALL return identical results in identical order.

### Property 5: Hit Rate Improvement
FOR ALL evaluation runs on the Golden_Dataset, THE hybrid search Hit_Rate@10 SHALL be >= baseline semantic search Hit_Rate@10.

### Property 6: Context Expansion Containment
FOR ALL expanded contexts, THE expanded content SHALL be a substring of the parent note content.

### Property 7: Score Normalization
FOR ALL retrieval and re-ranking scores, scores SHALL be in the range [0, 1].

### Property 8: Query Transformation Preservation
FOR ALL query transformations, THE original query SHALL be preserved in the transformation result.

### Property 9: Parallel Search Consistency
FOR ALL hybrid searches, IF either Semantic_Search OR Full_Text_Search returns results, THEN Hybrid_Search SHALL return results.

### Property 10: Metric Bounds
FOR ALL computed metrics, Hit_Rate SHALL be in [0, 1], MRR SHALL be in [0, 1], AND latency percentiles SHALL satisfy p50 <= p95 <= p99.

## Integration Points

### Database Schema Changes
- Add `chunks` table with columns: id, note_id, content, embedding, chunk_index, start_char, end_char, contextual_embedding, tsvector
- Add `golden_dataset` table with columns: id, query, relevant_note_ids, expected_answer, category, difficulty, created_at
- Add `evaluation_results` table with columns: id, config_hash, hit_rate_k1, hit_rate_k3, hit_rate_k5, hit_rate_k10, mrr, faithfulness, answer_relevance, latency_p50, latency_p95, latency_p99, created_at
- Add GIN index on chunks.tsvector
- Add vector index on chunks.embedding and chunks.contextual_embedding

### Existing Component Integration
- Extend Vector_Provider interface to support batch embedding generation
- Integrate with existing Note_Repository for note retrieval
- Use existing LLM_Provider for query transformation and contextual embedding generation
- Integrate with existing AgentGraph for RAG-enhanced chat responses
- Use existing logger for observability
- Use existing error handling middleware

### New Components
- HybridSearchService (application layer)
- ReRankingService (application layer)
- QueryTransformationService (application layer)
- ChunkingService (application layer)
- EvaluationService (application layer)
- ChunkRepository (infrastructure layer)
- GoldenDatasetRepository (infrastructure layer)
- EvaluationResultRepository (infrastructure layer)

## Success Metrics

1. Hit_Rate@10 improves from ~60% to 85%+ on Golden_Dataset
2. MRR improves by at least 20% from baseline
3. End-to-end retrieval latency p95 < 2000ms
4. Test coverage >= 90% for new components
5. Zero breaking changes to existing API contracts
6. Successful migration of all existing notes to chunked format
7. Faithfulness score >= 0.85 for generated answers
8. Answer_Relevance score >= 0.80 for generated answers

