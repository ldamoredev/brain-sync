# Bugfix Requirements Document

## Introduction

This document describes the requirements for fixing a critical bug in the agent approval flow where approving a routine or daily audit execution fails to complete. The execution remains stuck in "waitingForApproval" status with a "paused" state instead of transitioning to completion. This prevents users from successfully approving and completing agent-generated routines and daily audits.

The root cause is a state synchronization issue: the `resume()` method in both DailyAuditorGraph and RoutineGeneratorGraph updates the state in memory but does not persist the checkpoint before calling `execute()`. When `execute()` loads the checkpoint from storage, it retrieves the old state (before the resume updates), causing the execution to remain paused.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user approves a routine or daily audit execution through the API THEN the system updates the state in memory but does not persist the checkpoint before resuming execution

1.2 WHEN the `execute()` method loads the checkpoint after approval THEN the system loads the old state from storage (before resume updates) instead of the updated state

1.3 WHEN the execution completes with the old state THEN the system returns status "paused" and the execution remains in "waitingForApproval" status instead of completing

1.4 WHEN the API responds to the approval request THEN the system returns `{"status": "paused"}` with message "Ejecución aprobada y completada" which contradicts the actual paused state

### Expected Behavior (Correct)

2.1 WHEN a user approves a routine or daily audit execution through the API THEN the system SHALL persist the updated checkpoint to storage before calling `execute()`

2.2 WHEN the `execute()` method loads the checkpoint after approval THEN the system SHALL load the updated state that reflects the approval

2.3 WHEN the execution completes after approval THEN the system SHALL transition to a completed status and exit the "waitingForApproval" state

2.4 WHEN the API responds to the approval request THEN the system SHALL return a status that accurately reflects the execution state (completed, not paused)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a routine or daily audit execution reaches the approval checkpoint for the first time THEN the system SHALL CONTINUE TO pause and wait for user approval

3.2 WHEN a user rejects an execution THEN the system SHALL CONTINUE TO handle the rejection appropriately

3.3 WHEN an execution does not require approval THEN the system SHALL CONTINUE TO complete without pausing

3.4 WHEN the checkpoint is saved during normal execution flow (not during resume) THEN the system SHALL CONTINUE TO persist state correctly

3.5 WHEN multiple thread executions are running concurrently THEN the system SHALL CONTINUE TO maintain isolation between different execution contexts
