# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Fault Condition** - State Persistence Before Resume
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test implementation details from Fault Condition in design
  - The test assertions should match the Expected Behavior Properties from design
  - Create integration test file `apps/api/test/AgentApprovalFlow.test.ts`
  - Test routine approval flow: create execution → pause at awaitingApproval → call resume(approved=true) → assert status='completed' and currentNode='saveRoutine'
  - Test daily audit approval flow: create execution → pause at awaitingApproval → call resume(approved=true) → assert status='completed' and currentNode='saveSummary'
  - Test routine rejection flow: create execution → pause at awaitingApproval → call resume(approved=false) → assert status='completed' and currentNode='end'
  - Test daily audit rejection flow: create execution → pause at awaitingApproval → call resume(approved=false) → assert status='completed' and currentNode='end'
  - Verify checkpoint persistence: after resume(), load checkpoint from database and assert it reflects the updated state
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: execution returns status='paused' instead of 'completed', currentNode remains 'awaitingApproval'
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Resume Execution Flows
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Test initial execution flow: create new routine/daily audit execution without threadId → observe checkpoint creation, node transitions, final status
  - Test normal node transitions: verify checkpoints are saved after each node during normal execution (not during resume)
  - Test error handling: verify timeout and error scenarios create appropriate checkpoints and return correct status
  - Test concurrent executions: verify multiple executions with different threadIds maintain isolation
  - Generate random execution scenarios (different dates, retry counts) and capture observed behavior
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for agent approval flow state persistence

  - [x] 3.1 Implement the fix in RoutineGeneratorGraph.resume()
    - Open `apps/api/src/application/agents/RoutineGeneratorGraph.ts`
    - Locate the `resume()` method
    - After all state updates (state.approved, state.status, state.currentNode, state.updatedAt) and BEFORE `return this.execute()`, add:
      ```typescript
      await this.checkpointer.save(threadId, state, state.currentNode, 'routine_generator');
      ```
    - Ensure the save call uses the updated `state.currentNode` value ('saveRoutine' for approved, 'end' for rejected)
    - No changes to method signature, return type, or error handling
    - _Bug_Condition: isBugCondition(input) where input.threadId exists, checkpoint.state.status='paused', checkpoint.state.currentNode='awaitingApproval', and resume() is called_
    - _Expected_Behavior: State updates (approved, status, currentNode) are persisted to database checkpoint BEFORE execute() is called, ensuring execute() loads correct updated state_
    - _Preservation: Initial execution flow, normal node transitions, error handling, and all other graph nodes remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Implement the fix in DailyAuditorGraph.resume()
    - Open `apps/api/src/application/agents/DailyAuditorGraph.ts`
    - Locate the `resume()` method
    - After all state updates (state.approved, state.status, state.currentNode, state.updatedAt) and BEFORE `return this.execute()`, add:
      ```typescript
      await this.checkpointer.save(threadId, state, state.currentNode, 'daily_auditor');
      ```
    - Ensure the save call uses the updated `state.currentNode` value ('saveSummary' for approved, 'end' for rejected)
    - No changes to method signature, return type, or error handling
    - _Bug_Condition: isBugCondition(input) where input.threadId exists, checkpoint.state.status='paused', checkpoint.state.currentNode='awaitingApproval', and resume() is called_
    - _Expected_Behavior: State updates (approved, status, currentNode) are persisted to database checkpoint BEFORE execute() is called, ensuring execute() loads correct updated state_
    - _Preservation: Initial execution flow, normal node transitions, error handling, and all other graph nodes remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - State Persistence Before Resume
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1: `pnpm test AgentApprovalFlow`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify all approval/rejection flows complete with status='completed'
    - Verify checkpoint persistence: loaded checkpoint reflects updated state
    - Verify currentNode transitions correctly ('saveRoutine', 'saveSummary', or 'end')
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Resume Execution Flows
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm initial execution flow unchanged
    - Confirm normal node transitions and checkpoint saving unchanged
    - Confirm error handling unchanged
    - Confirm concurrent execution isolation maintained
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `pnpm test`
  - Verify AgentApprovalFlow.test.ts passes (bug is fixed)
  - Verify preservation tests pass (no regressions)
  - Verify all existing tests still pass
  - If any issues arise, document them and ask the user for guidance
