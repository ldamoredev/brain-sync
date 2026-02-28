# Production RAG Improvements - Design Documentation

## Document Structure

The complete design document is split across multiple files due to size:

1. **design.md** - Main design document containing:
   - Overview and goals
   - Architecture diagrams and component responsibilities
   - Components and interfaces
   - Data models and database schema
   - Detailed algorithms (RRF, chunking, HyDE, evaluation metrics, etc.)

2. **design-part2.md** - Extended design sections containing:
   - Correctness Properties (40 properties with validation mappings)
   - Error Handling strategy and scenarios
   - Testing Strategy (unit tests, property-based tests, integration tests)
   - API Specifications (endpoints, schemas, examples)
   - Migration Strategy (phases, scripts, backward compatibility)
   - Performance Optimization (caching, batching, profiling)

3. **design-final.md** - Implementation guidance containing:
   - Implementation Roadmap (10-phase plan over 12 weeks)
   - Success Criteria (functional, performance, quality, operational)
   - Risks and Mitigations
   - Configuration Examples
   - References and Appendix

## Quick Navigation

### For Developers Starting Implementation
- Read: design.md (Architecture + Components) → design-final.md (Roadmap)
- Focus on: Phase 1-2 tasks in Implementation Roadmap

### For Understanding Correctness Requirements
- Read: design-part2.md (Correctness Properties section)
- Reference: 40 properties mapped to requirements

### For API Integration
- Read: design-part2.md (API Specifications section)
- Reference: Request/response schemas and examples

### For Testing
- Read: design-part2.md (Testing Strategy section)
- Reference: Property-based test examples with fast-check

### For Migration Planning
- Read: design-part2.md (Migration Strategy section)
- Reference: Phase-by-phase migration plan

## Key Metrics

**Target Improvements:**
- Hit_Rate@10: 60% → 85%+
- MRR: +20% improvement
- End-to-end latency p95: < 2000ms

**Test Coverage:**
- Overall: >= 90%
- Property tests: 40 properties
- Integration tests: End-to-end flows

## Implementation Timeline

- **Weeks 1-2**: Foundation (schema, repositories)
- **Weeks 3-4**: Chunking + Hybrid Search
- **Weeks 5-6**: Query Transformation + Re-ranking
- **Week 7**: GraphRAG Enhancement
- **Week 8**: Evaluation Framework
- **Week 9**: API Integration
- **Week 10**: Migration + Optimization
- **Weeks 11-12**: Validation + Launch

## Architecture Summary

```
User Query
    ↓
QueryTransformationService (intent, HyDE, decomposition)
    ↓
HybridSearchService (semantic + full-text + RRF)
    ↓
ReRankingService (LLM-based scoring)
    ↓
ContextExpansionService (sentence-window)
    ↓
Results with expanded context
```

## Database Schema

New tables:
- `chunks` - Chunked note segments with embeddings
- `golden_dataset` - Test queries for evaluation
- `evaluation_results` - Metrics tracking

Extended tables:
- `notes` - Added tsvector for full-text search

## Technology Stack

- **Language**: TypeScript
- **Database**: PostgreSQL + pgvector
- **ORM**: Drizzle
- **Testing**: Vitest + fast-check (property-based)
- **LLM**: Ollama (existing)
- **Embeddings**: Ollama (existing)

## Next Steps

1. Review complete design across all three files
2. Set up development environment
3. Begin Phase 1: Foundation (database schema)
4. Create initial golden dataset
5. Run baseline evaluation

---

For questions or clarifications, refer to the detailed sections in the design documents.
