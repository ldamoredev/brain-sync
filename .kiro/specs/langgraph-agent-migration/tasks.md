# Implementation Plan: LangGraph Agent Migration

## Overview

This plan transforms the existing Daily Auditor and Routine Generator agents from simple LangChain demos into production-grade, stateful agents using LangGraph. The implementation follows a 3-week roadmap focusing on state management, PostgreSQL checkpointing, human-in-the-loop approval flows, and comprehensive error recovery. The architecture maintains Clean Architecture principles while adding infrastructure for state persistence and graph execution.

## Tasks

### Week 1: Fundamentals

- [x] 1. Set up database schema and infrastructure
  - [x] 1.1 Create database schema for agent checkpoints
    - Add `agent_checkpoints` table with fields: id, threadId, state (jsonb), nodeId, agentType, createdAt
    - Add index on (thread_id, created_at DESC) for fast lookups
    - Update `apps/api/src/infrastructure/db/schema.ts`
    - _Requirements: Design Section "Checkpoint Table Schema"_
  
  - [x] 1.2 Create database schema for execution logs
    - Add `agent_execution_logs` table with fields: id, threadId, agentType, status, input, output, error, durationMs, retryCount, startedAt, completedAt
    - Add indexes on (status, started_at DESC) and (agent_type, started_at DESC)
    - _Requirements: Design Section "Agent Execution Log Schema"_
  
  - [x] 1.3 Create database schema for agent metrics
    - Add `agent_metrics` table with fields: id, agentType, date, totalExecutions, successfulExecutions, failedExecutions, avgDurationMs, p95DurationMs, totalRetries, createdAt
    - Add unique index on (agent_type, date)
    - _Requirements: Design Section "Agent Metrics Schema"_
  
  - [x] 1.4 Run database migration
    - Execute `pnpm db:push` from apps/api directory
    - Verify all tables created successfully
    - _Requirements: Design Section "Database Migrations"_

- [x] 2. Implement PostgreSQL Checkpointer
  - [x] 2.1 Create CheckpointerProvider interface
    - Define interface in `apps/api/src/application/providers/CheckpointerProvider.ts`
    - Include methods: save(), load(), list(), delete()
    - Define Checkpoint type with id, threadId, state, nodeId, createdAt
    - _Requirements: Design Section "Checkpointer Interface"_
  
  - [x] 2.2 Implement PostgreSQLCheckpointer class
    - Create `apps/api/src/infrastructure/checkpointer/PostgreSQLCheckpointer.ts`
    - Implement save() method with JSON serialization
    - Implement load() method with optional checkpointId parameter
    - Implement list() and delete() methods
    - Use Drizzle ORM for database operations
    - _Requirements: Design Section "PostgreSQLCheckpointer.save()", "PostgreSQLCheckpointer.load()"_
  
  - [x] 2.3 Write unit tests for PostgreSQLCheckpointer
    - Test save() returns UUID and persists to database
    - Test load() returns most recent checkpoint when checkpointId not provided
    - Test load() returns specific checkpoint when checkpointId provided
    - Test load() returns null for non-existent threadId
    - Test list() returns checkpoints in chronological order
    - Test delete() removes all checkpoints for threadId
    - _Requirements: Design Section "Unit Testing Approach - Checkpointer Tests"_
  
  - [x] 2.4 Write property test for checkpoint consistency
    - **Property 1: Checkpoint Consistency**
    - **Validates: Design Property "Checkpoint Consistency"**
    - Use fast-check to verify saved checkpoint can be loaded with identical state
    - Test with various state shapes and threadIds

- [x] 3. Checkpoint - Verify database schema and checkpointer
  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. Implement base agent graph infrastructure
  - [x] 4.1 Create base state interfaces
    - Define BaseAgentState interface in `apps/api/src/application/agents/types.ts`
    - Include fields: threadId, status, currentNode, error, retryCount, createdAt, updatedAt
    - Define GraphConfig and GraphExecutionResult interfaces
    - _Requirements: Design Section "LangGraph State Interfaces", "Graph Configuration Interface"_
  
  - [x] 4.2 Create AgentGraph base interface
    - Define AgentGraph interface with execute(), resume(), getStatus(), cancel() methods
    - Create in `apps/api/src/application/agents/AgentGraph.ts`
    - _Requirements: Design Section "Agent Graph Interface"_
  
  - [x] 4.3 Install LangGraph dependencies
    - Run `pnpm add @langchain/langgraph @langchain/core` from project root
    - Run `pnpm add -D fast-check` for property-based testing
    - Verify installation successful
    - _Requirements: Design Section "Dependencies"_

- [x] 5. Implement Daily Auditor Graph
  - [x] 5.1 Create DailyAuditorState interface
    - Extend BaseAgentState with Daily Auditor specific fields
    - Add fields: date, notes, analysis, requiresApproval, approved
    - Create in `apps/api/src/application/agents/types.ts`
    - _Requirements: Design Section "LangGraph State Interfaces - Daily Auditor State"_
  
  - [x] 5.2 Implement fetchNotes node
    - Create node function in `apps/api/src/application/agents/DailyAuditorGraph.ts`
    - Fetch notes for given date from repository
    - Return empty array if no notes found
    - Update state with notes and set currentNode to "analyzeNotes"
    - _Requirements: Design Section "Daily Auditor Graph Algorithm - Node 1"_
  
  - [x] 5.3 Implement analyzeNotes node with retry logic
    - Call LLM provider with concatenated notes context
    - Parse JSON response into analysis object
    - Implement exponential backoff retry on LLM errors
    - Increment retryCount on each retry
    - Fail execution if retryCount exceeds maxRetries
    - Update state with analysis and set currentNode to "checkApproval"
    - _Requirements: Design Section "Daily Auditor Graph Algorithm - Node 2"_
  
  - [x] 5.4 Implement checkApproval node
    - Check if requiresHumanApproval config is true and riskLevel >= 7
    - If approval required: set status to "paused", currentNode to "awaitingApproval"
    - If approval not required: set currentNode to "saveSummary"
    - _Requirements: Design Section "Daily Auditor Graph Algorithm - Node 3"_
  
  - [x] 5.5 Implement saveSummary node
    - Save daily summary to database via repository
    - Set status to "completed", currentNode to "end"
    - Log execution success
    - _Requirements: Design Section "Daily Auditor Graph Algorithm - Node 5"_
  
  - [x] 5.6 Wire DailyAuditorGraph execute() method
    - Initialize or restore state from checkpoint
    - Execute nodes in sequence based on currentNode
    - Save checkpoint after each node execution
    - Return GraphExecutionResult with final state
    - _Requirements: Design Section "DailyAuditorGraph.execute()"_
  
  - [x] 5.7 Implement DailyAuditorGraph resume() method
    - Load checkpoint by threadId
    - Validate state is paused and at awaitingApproval node
    - Update state.approved field from input
    - Continue execution from current node
    - _Requirements: Design Section "DailyAuditorGraph.resume()"_
  
  - [x] 5.8 Write unit tests for Daily Auditor nodes
    - Test fetchNotes returns notes for valid date
    - Test fetchNotes returns empty array for date with no notes
    - Test analyzeNotes calls LLM with correct prompt
    - Test analyzeNotes parses JSON response correctly
    - Test analyzeNotes retries on LLM error
    - Test checkApproval routes to pause when riskLevel >= 7
    - Test checkApproval routes to save when riskLevel < 7
    - Test saveSummary persists to database
    - _Requirements: Design Section "Unit Testing Approach - Node Function Tests"_
  
  - [x] 5.9 Write property test for retry bound
    - **Property 5: Retry Bound**
    - **Validates: Design Property "Retry Bound"**
    - Verify retryCount never exceeds maxRetries during execution

- [x] 6. Checkpoint - Verify Daily Auditor Graph implementation
  - Ensure all tests pass, ask the user if questions arise.

- [-] 7.
 Create AgentController with basic endpoints
  - [x] 7.1 Create AgentController class
    - Create `apps/api/src/infrastructure/http/controllers/AgentController.ts`
    - Implement Controller interface with path = "/agents"
    - Initialize router and bind routes
    - _Requirements: Design Section "Controller Integration"_
  
  - [x] 7.2 Implement POST /agents/daily-audit endpoint
    - Accept date in request body
    - Validate request with Zod schema
    - Call dailyAuditorGraph.execute()
    - Return 202 if paused (awaiting approval) with threadId
    - Return 200 if completed with summary
    - Return 500 if failed with error message
    - _Requirements: Design Section "Controller Integration - executeDailyAudit"_
  
  - [x] 7.3 Create Zod validation schemas
    - Add schemas to `packages/shared-types/src/schemas.ts`
    - Create executeDailyAuditSchema with date field
    - Create approveExecutionSchema with approved boolean field
    
    - _Requirements: Design Section "Validation"_
  
  - [x] 7.4 Register AgentController in Core.ts
    - Import and instantiate AgentController with dependencies
    - Add to controllers array in `apps/api/src/infrastructure/Core.ts`
    - _Requirements: Design Section "Basic Integration"_
  
  - [x] 7.5 Write integration test for Daily Auditor complete flow
    - Start execution with valid date
    - Verify notes fetched from database
    - Verify LLM called with correct context
    - Verify checkpoint saved after each node
    - Verify summary saved to database
    - Verify execution log created
    - _Requirements: Design Section "Integration Testing Approach - Daily Auditor Complete Flow"_

### Week 2: Advanced Patterns

- [-] 8. Implement Routine Generator Graph
  - [x] 8.1 Create RoutineGeneratorState interface
    - Extend BaseAgentState with Routine Generator specific fields
    - Add fields: date, yesterdayContext, analysisResult, rawSchedule, validatedSchedule, formattedRoutine, validationAttempts, requiresApproval, approved
    - Create in `apps/api/src/application/agents/types.ts`
    - _Requirements: Design Section "LangGraph State Interfaces - Routine Generator State"_
  
  - [x] 8.2 Implement Analyzer node
    - Calculate yesterday's date from input date
    - Fetch daily summary for yesterday from repository
    - Format context and extract recommendations
    - Handle case where no previous summary exists
    - Update state with yesterdayContext and analysisResult
    - Set currentNode to "scheduler"
    - _Requirements: Design Section "Routine Generator Multi-Agent Graph Algorithm - Node 1"_
  
  - [x] 8.3 Implement Scheduler node with retry logic
    - Build scheduler prompt with date and analysisResult
    - Call LLM provider to generate schedule
    - Parse JSON response into rawSchedule
    - Implement exponential backoff retry on errors
    - Update state with rawSchedule and set currentNode to "validator"
    - _Requirements: Design Section "Routine Generator Multi-Agent Graph Algorithm - Node 2"_
  
  - [x] 8.4 Implement schedule validation logic
    - Create validateSchedule() function
    - Check for required "activities" array
    - Validate each activity has time, activity, expectedBenefit fields
    - Validate time format (HH:MM)
    - Check chronological order of activities
    - Ensure minimum 3 activities
    - Return validation result with feedback
    - _Requirements: Design Section "Schedule Validation Algorithm"_
  
  - [x] 8.5 Implement Validator node with feedback loop
    - Call validateSchedule() on rawSchedule
    - Increment validationAttempts
    - If valid: set validatedSchedule and currentNode to "formatter"
    - If invalid and attempts < 3: add feedback to recommendations, set currentNode to "scheduler"
    - If invalid and attempts >= 3: set status to "failed" with error
    - _Requirements: Design Section "Routine Generator Multi-Agent Graph Algorithm - Node 3"_
  
  - [x] 8.6 Implement Formatter node
    - Normalize activities from validatedSchedule
    - Create formattedRoutine with activities array
    - Set currentNode to "checkApproval"
    - _Requirements: Design Section "Routine Generator Multi-Agent Graph Algorithm - Node 4"_
  
  - [x] 8.7 Implement checkApproval and saveRoutine nodes
    - checkApproval: pause if requiresHumanApproval is true
    - saveRoutine: persist routine to database, set status to "completed"
    - _Requirements: Design Section "Routine Generator Multi-Agent Graph Algorithm - Nodes 5-7"_
  
  - [x] 8.8 Wire RoutineGeneratorGraph execute() and resume() methods
    - Implement execute() with node sequencing and checkpoint saves
    - Implement resume() for approval workflow
    - _Requirements: Design Section "RoutineGeneratorGraph.execute()"_
  
  - [x] xd Write unit tests for Routine Generator nodes
    - Test Analyzer fetches and formats yesterday's context
    - Test Scheduler generates schedule with required fields
    - Test Validator detects missing fields
    - Test Validator detects invalid time format
    - Test Validator accepts valid schedule
    - Test Validator routes back to Scheduler on failure
    - Test Formatter normalizes activities
    - _Requirements: Design Section "Unit Testing Approach - Node Function Tests"_
  
  - [x] 8.10 Write property test for validation feedback loop
    - **Property 6: Validation Feedback Loop**
    - **Validates: Design Property "Validation Feedback Loop"**
    - Verify recommendations grow with each validation retry

- [x] 9. Checkpoint - Verify Routine Generator Graph implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement human-in-the-loop approval workflow
  - [x] 10.1 Implement POST /agents/approve/:threadId endpoint
    - Accept threadId as URL parameter
    - Accept approved boolean in request body
    - Validate request with Zod schema
    - Determine agent type from checkpoint
    - Call appropriate graph's resume() method
    - Return 200 with updated status
    - Return 404 if threadId not found
    - _Requirements: Design Section "Controller Integration - approveExecution"_
  
  - [x] 10.2 Implement GET /agents/status/:threadId endpoint
    - Accept threadId as URL parameter
    - Load checkpoint from database
    - Return current status, currentNode, and relevant state fields
    - Return 404 if threadId not found
    - _Requirements: Design Section "Checking Execution Status"_
  
  - [x] 10.3 Implement POST /agents/generate-routine endpoint
    - Accept date in request body
    - Validate request with Zod schema
    - Call routineGraph.execute()
    - Return 202 if paused with threadId
    - Return 200 if completed with routine
    - Return 500 if failed with error
    - _Requirements: Design Section "Controller Integration"_
  
  - [x] 10.4 Write integration test for pause and resume flow
    - Start Daily Auditor execution with high-risk scenario
    - Verify execution pauses at approval node
    - Resume with approval = true
    - Verify execution completes and saves summary
    - Test resume with approval = false
    - Verify execution completes without saving
    - _Requirements: Design Section "Integration Testing Approach - Pause and Resume Flow"_
  
  - [x] 10.5 Write integration test for validation retry flow
    - Start Routine Generator execution
    - Mock LLM to return invalid schedule first time
    - Verify validator detects errors
    - Verify scheduler called again with feedback
    - Mock LLM to return valid schedule second time
    - Verify execution completes successfully
    - _Requirements: Design Section "Integration Testing Approach - Validation Retry Flow"_
  
  - [x] 10.6 Write property test for idempotent resume
    - **Property 7: Idempotent Resume**
    - **Validates: Design Property "Idempotent Resume"**
    - Verify resuming with same input produces same result

- [ ] 11. Implement metrics collection and logging
  - [ ] 11.1 Create MetricsCollector class
    - Create `apps/api/src/infrastructure/metrics/MetricsCollector.ts`
    - Implement recordExecution() method
    - Insert execution log into agent_execution_logs table
    - Upsert daily metrics into agent_metrics table
    - Calculate rolling averages for avgDurationMs
    - Use database transaction for atomicity
    - _Requirements: Design Section "MetricsCollector.recordExecution()"_
  
  - [ ] 11.2 Integrate metrics collection into graphs
    - Call metricsCollector.recordExecution() at end of execute()
    - Record agentType, status, durationMs, retryCount
    - Make metrics collection asynchronous (fire-and-forget)
    - _Requirements: Design Section "Metrics Collection Performance"_
  
  - [ ] 11.3 Add structured logging with Winston
    - Add log statements at key execution points
    - Log node transitions with threadId and currentNode
    - Log errors with full context
    - Log checkpoint saves and loads
    - _Requirements: Design Section "Observability - Structured Logging"_
  
  - [ ]* 11.4 Write unit tests for MetricsCollector
    - Test recordExecution creates execution log
    - Test recordExecution updates daily metrics
    - Test totalExecutions = successfulExecutions + failedExecutions
    - Test avgDurationMs calculation
    - _Requirements: Design Section "Unit Testing Approach"_
  
  - [ ]* 11.5 Write property test for metrics accuracy
    - **Property 8: Metrics Accuracy**
    - **Validates: Design Property "Metrics Accuracy"**
    - Verify total executions equals sum of successful and failed

### Week 3: Production Hardening

- [ ] 12. Implement advanced error handling and recovery
  - [ ] 12.1 Add error handling for LLM provider unavailable
    - Implement retry with exponential backoff
    - Cap maximum wait time at 10 seconds
    - Add jitter to prevent thundering herd
    - Log execution failure after max retries
    - _Requirements: Design Section "Error Handling - LLM Provider Unavailable"_
  
  - [ ] 12.2 Add error handling for database connection lost
    - Throw error immediately (no retry at graph level)
    - Preserve in-memory state
    - Return 500 error to client
    - _Requirements: Design Section "Error Handling - Database Connection Lost"_
  
  - [ ] 12.3 Add error handling for checkpoint not found
    - Throw AppError with 404 status code
    - Return clear error message
    - _Requirements: Design Section "Error Handling - Checkpoint Not Found"_
  
  - [ ] 12.4 Add error handling for JSON parsing failure
    - Treat as LLM error and apply retry logic
    - Include parsing error in retry context
    - Enhance prompt on retry to emphasize JSON format
    - _Requirements: Design Section "Error Handling - JSON Parsing Failure"_
  
  - [ ] 12.5 Implement execution timeout
    - Add timeout configuration (default 5 minutes)
    - Cancel execution if timeout exceeded
    - Set status to "failed" with timeout error
    - _Requirements: Design Section "API Rate Limiting - Execution Timeout"_
  
  - [ ]* 12.6 Write integration test for error recovery flow
    - Start execution
    - Simulate LLM failure
    - Verify retry with exponential backoff
    - Verify checkpoint saved before retry
    - Simulate success on retry
    - Verify execution completes
    - _Requirements: Design Section "Integration Testing Approach - Error Recovery Flow"_
  
  - [ ]* 12.7 Write property test for state monotonicity
    - **Property 2: State Monotonicity**
    - **Validates: Design Property "State Monotonicity"**
    - Verify retry counters never decrease during execution

- [ ] 13. Checkpoint - Verify error handling and recovery
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement security measures
  - [ ] 14.1 Add rate limiting to agent endpoints
    - Install express-rate-limit package
    - Configure 10 requests per minute per user/IP
    - Apply to all /agents/* endpoints
    - _Requirements: Design Section "API Rate Limiting"_
  
  - [ ] 14.2 Add input sanitization for LLM prompts
    - Create sanitizeInput() utility function
    - Strip HTML tags
    - Block prompt injection patterns
    - Limit content length to 10,000 characters
    - Apply to all user content before LLM calls
    - _Requirements: Design Section "LLM Prompt Injection"_
  
  - [ ] 14.3 Add thread ownership validation
    - Associate threadId with userId in checkpoints
    - Validate user owns thread before resume/status operations
    - Return 403 if unauthorized
    - _Requirements: Design Section "Thread ID Security"_
  
  - [ ] 14.4 Add environment variables for security configuration
    - Add AGENT_MAX_RETRIES, AGENT_TIMEOUT_MS, AGENT_REQUIRE_APPROVAL
    - Add CHECKPOINT_ENCRYPTION_KEY (optional for MVP)
    - Update .env.example with new variables
    - _Requirements: Design Section "Environment Variables"_

- [ ] 15. Implement performance optimizations
  - [ ] 15.1 Add database indexes for performance
    - Verify index on agent_checkpoints(thread_id, created_at DESC)
    - Verify index on agent_execution_logs(status, started_at DESC)
    - Verify index on agent_execution_logs(agent_type, started_at DESC)
    - Verify unique index on agent_metrics(agent_type, date)
    - _Requirements: Design Section "Database Query Optimization"_
  
  - [ ] 15.2 Optimize checkpoint storage
    - Implement state pruning to remove unnecessary fields
    - Consider checkpoint compression for large states (optional)
    - _Requirements: Design Section "Checkpoint Storage Optimization"_
  
  - [ ] 15.3 Configure connection pooling
    - Set minimum 5, maximum 20 connections in database pool
    - Tune pool settings for optimal performance
    - _Requirements: Design Section "Checkpoint Storage Optimization"_
  
  - [ ] 15.4 Make metrics collection asynchronous
    - Ensure recordExecution() is fire-and-forget
    - Don't block API response on metrics recording
    - _Requirements: Design Section "Metrics Collection Performance"_

- [ ] 16. Add observability and monitoring
  - [ ] 16.1 Create GET /agents/metrics endpoint
    - Accept agentType and date range as query parameters
    - Query agent_metrics table
    - Return aggregated metrics
    - _Requirements: Design Section "Metrics and Logging"_
  
  - [ ] 16.2 Create GET /agents/health endpoint
    - Check database connection
    - Check LLM provider availability
    - Return health status
    - _Requirements: Design Section "Observability - Health Check"_
  
  - [ ] 16.3 Add execution tracing
    - Log execution start and end with timestamps
    - Log each node transition with duration
    - Include threadId in all log statements
    - _Requirements: Design Section "Observability - Tracing"_

- [ ] 17. Complete testing and documentation
  - [ ]* 17.1 Write integration test for concurrent executions
    - Start multiple executions with different threadIds
    - Verify each maintains separate state
    - Verify checkpoints don't interfere
    - Verify all complete successfully
    - _Requirements: Design Section "Integration Testing Approach - Concurrent Execution Flow"_
  
  - [ ]* 17.2 Write property test for terminal state guarantee
    - **Property 3: Terminal State Guarantee**
    - **Validates: Design Property "Terminal State Guarantee"**
    - Verify completed/failed executions reach end state or have error
  
  - [ ]* 17.3 Write property test for approval flow correctness
    - **Property 4: Approval Flow Correctness**
    - **Validates: Design Property "Approval Flow Correctness"**
    - Verify executions requiring approval must pause
  
  - [ ]* 17.4 Write property test for checkpoint recoverability
    - **Property 9: Checkpoint Recoverability**
    - **Validates: Design Property "Checkpoint Recoverability"**
    - Verify any loadable checkpoint enables resumption
  
  - [ ]* 17.5 Write property test for state transition validity
    - **Property 10: State Transition Validity**
    - **Validates: Design Property "State Transition Validity"**
    - Verify all transitions follow valid graph edges
  
  - [ ] 17.6 Achieve 90%+ code coverage
    - Run `pnpm test -- --coverage` from apps/api
    - Identify and fill coverage gaps
    - _Requirements: Design Section "Testing and Documentation"_
  
  - [ ] 17.7 Create API documentation
    - Document all /agents/* endpoints
    - Include request/response examples
    - Document error codes and messages
    - _Requirements: Design Section "Testing and Documentation"_

- [ ] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific design sections for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- The implementation follows the 3-week roadmap from the design document
- All code should follow the Brain Sync coding conventions in AGENTS.md
