# LangGraph Agent API Documentation

## Overview

This document provides comprehensive documentation for the LangGraph Agent API endpoints. The API enables stateful agent execution with PostgreSQL checkpointing, human-in-the-loop approval workflows, and comprehensive observability.

**Base URL**: `http://localhost:6060/agents`

**Authentication**: Not implemented in MVP (add authentication headers in production)

**Rate Limiting**: 10 requests per minute per IP address

---

## Table of Contents

1. [Daily Auditor Endpoints](#daily-auditor-endpoints)
2. [Routine Generator Endpoints](#routine-generator-endpoints)
3. [Execution Management Endpoints](#execution-management-endpoints)
4. [Observability Endpoints](#observability-endpoints)
5. [Error Codes](#error-codes)
6. [Common Patterns](#common-patterns)

---

## Daily Auditor Endpoints

### POST /agents/daily-audit

Executes the Daily Auditor agent to analyze notes for a specific date and generate a mental health summary.

**Request Body**:
```json
{
  "date": "2024-01-15"
}
```

**Request Schema**:
- `date` (string, required): ISO date string in format YYYY-MM-DD

**Success Response (200 OK)** - Execution completed:
```json
{
  "message": "Auditoría diaria completada",
  "summary": {
    "summary": "El usuario mostró un día productivo con buen equilibrio emocional...",
    "riskLevel": 3,
    "keyInsights": [
      "Buena gestión del tiempo",
      "Actividad física regular",
      "Interacciones sociales positivas"
    ]
  }
}
```

**Paused Response (202 Accepted)** - Awaiting approval:
```json
{
  "message": "Análisis completado, esperando aprobación",
  "threadId": "550e8400-e29b-41d4-a716-446655440000",
  "analysis": {
    "summary": "Se detectaron patrones de riesgo que requieren atención...",
    "riskLevel": 8,
    "keyInsights": [
      "Indicadores de ansiedad elevada",
      "Patrones de sueño irregulares",
      "Aislamiento social"
    ]
  }
}
```

**Error Response (500 Internal Server Error)**:
```json
{
  "message": "Error al ejecutar auditoría diaria",
  "error": "LLM provider unavailable after 3 retries"
}
```

**Validation Error (400 Bad Request)**:
```json
{
  "message": "Validation error",
  "errors": [
    {
      "field": "date",
      "message": "Invalid date format. Expected YYYY-MM-DD"
    }
  ]
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:6060/agents/daily-audit \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-01-15"}'
```

**Behavior**:
1. Fetches all notes for the specified date
2. Analyzes notes using LLM to generate mental health insights
3. If `riskLevel >= 7` and `requiresHumanApproval=true`, execution pauses
4. Saves checkpoint after each node execution
5. Returns summary or pauses for approval

**Retry Logic**:
- Maximum 3 retries on LLM failures
- Exponential backoff: 2^retryCount * 1000ms (capped at 10s)
- Jitter added to prevent thundering herd

---

## Routine Generator Endpoints

### POST /agents/generate-routine

Executes the Routine Generator agent to create a personalized daily routine based on yesterday's analysis.

**Request Body**:
```json
{
  "date": "2024-01-16"
}
```

**Request Schema**:
- `date` (string, required): ISO date string for the routine (YYYY-MM-DD)

**Success Response (200 OK)** - Routine generated:
```json
{
  "message": "Rutina generada exitosamente",
  "routine": {
    "activities": [
      {
        "time": "07:00",
        "activity": "Meditación matutina",
        "expectedBenefit": "Reducir ansiedad y mejorar enfoque"
      },
      {
        "time": "08:30",
        "activity": "Desayuno saludable",
        "expectedBenefit": "Energía sostenida durante la mañana"
      },
      {
        "time": "12:00",
        "activity": "Caminata al aire libre",
        "expectedBenefit": "Actividad física y exposición solar"
      },
      {
        "time": "18:00",
        "activity": "Llamada con amigo/familiar",
        "expectedBenefit": "Conexión social y apoyo emocional"
      },
      {
        "time": "22:00",
        "activity": "Rutina de sueño",
        "expectedBenefit": "Mejorar calidad del descanso"
      }
    ]
  }
}
```

**Paused Response (202 Accepted)** - Awaiting approval:
```json
{
  "message": "Rutina generada, esperando aprobación",
  "threadId": "660e8400-e29b-41d4-a716-446655440001",
  "routine": {
    "activities": [
      {
        "time": "07:00",
        "activity": "Meditación matutina",
        "expectedBenefit": "Reducir ansiedad y mejorar enfoque"
      }
    ]
  }
}
```

**Error Response (500 Internal Server Error)**:
```json
{
  "message": "Error al generar rutina",
  "error": "Schedule validation failed after 3 attempts"
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:6060/agents/generate-routine \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-01-16"}'
```

**Behavior**:
1. **Analyzer Node**: Fetches yesterday's daily summary for context
2. **Scheduler Node**: Generates routine using LLM with retry logic
3. **Validator Node**: Validates schedule structure and content
   - Checks for required fields (time, activity, expectedBenefit)
   - Validates time format (HH:MM)
   - Ensures chronological order
   - Requires minimum 3 activities
4. **Feedback Loop**: If validation fails, returns to Scheduler with feedback (max 3 attempts)
5. **Formatter Node**: Normalizes activities to consistent format
6. **Approval Check**: Pauses if `requiresHumanApproval=true`
7. **Save**: Persists routine to database

**Validation Rules**:
- Activities must have `time`, `activity`, and `expectedBenefit` fields
- Time format must be HH:MM (24-hour format)
- Activities must be in chronological order
- Minimum 3 activities required
- Activity descriptions must be at least 3 characters

---

## Execution Management Endpoints

### POST /agents/approve/:threadId

Approves or rejects a paused agent execution.

**URL Parameters**:
- `threadId` (string, required): UUID of the execution thread

**Request Body**:
```json
{
  "approved": true
}
```

**Request Schema**:
- `approved` (boolean, required): `true` to approve and continue, `false` to reject and cancel

**Success Response (200 OK)** - Approved:
```json
{
  "message": "Ejecución aprobada y completada",
  "status": "completed"
}
```

**Success Response (200 OK)** - Rejected:
```json
{
  "message": "Ejecución cancelada",
  "status": "completed"
}
```

**Error Response (404 Not Found)**:
```json
{
  "message": "Thread de ejecución no encontrado"
}
```

**Error Response (403 Forbidden)** - Thread ownership validation:
```json
{
  "message": "No autorizado para acceder a este thread"
}
```

**Example cURL** - Approve:
```bash
curl -X POST http://localhost:6060/agents/approve/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

**Example cURL** - Reject:
```bash
curl -X POST http://localhost:6060/agents/approve/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"approved": false}'
```

**Behavior**:
1. Loads checkpoint for the specified threadId
2. Determines agent type (daily_auditor or routine_generator)
3. Calls appropriate graph's `resume()` method with approval decision
4. If approved: continues execution from paused node
5. If rejected: completes execution without saving results

---

### GET /agents/status/:threadId

Retrieves the current status of an agent execution.

**URL Parameters**:
- `threadId` (string, required): UUID of the execution thread

**Success Response (200 OK)** - Daily Auditor:
```json
{
  "threadId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "currentNode": "analyzeNotes",
  "retryCount": 1,
  "agentType": "daily_auditor"
}
```

**Success Response (200 OK)** - Routine Generator:
```json
{
  "threadId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "paused",
  "currentNode": "awaitingApproval",
  "validationAttempts": 2,
  "agentType": "routine_generator"
}
```

**Error Response (404 Not Found)**:
```json
{
  "message": "Thread de ejecución no encontrado"
}
```

**Example cURL**:
```bash
curl -X GET http://localhost:6060/agents/status/550e8400-e29b-41d4-a716-446655440000
```

**Status Values**:
- `running`: Execution in progress
- `paused`: Awaiting human approval
- `completed`: Execution finished successfully
- `failed`: Execution failed after retries

**Current Node Values** (Daily Auditor):
- `start`: Initial state
- `analyzeNotes`: Analyzing notes with LLM
- `checkApproval`: Checking if approval required
- `awaitingApproval`: Paused for approval
- `saveSummary`: Saving results to database
- `end`: Execution complete

**Current Node Values** (Routine Generator):
- `start`: Initial state
- `scheduler`: Generating schedule with LLM
- `validator`: Validating schedule structure
- `formatter`: Formatting activities
- `checkApproval`: Checking if approval required
- `awaitingApproval`: Paused for approval
- `saveRoutine`: Saving routine to database
- `end`: Execution complete

---

## Observability Endpoints

### GET /agents/metrics

Retrieves aggregated metrics for agent executions.

**Query Parameters**:
- `agentType` (string, optional): Filter by agent type (`daily_auditor` or `routine_generator`)
- `startDate` (string, optional): Start date for metrics range (YYYY-MM-DD)
- `endDate` (string, optional): End date for metrics range (YYYY-MM-DD)

**Success Response (200 OK)**:
```json
{
  "metrics": [
    {
      "agentType": "daily_auditor",
      "date": "2024-01-15",
      "totalExecutions": 10,
      "successfulExecutions": 9,
      "failedExecutions": 1,
      "avgDurationMs": 3500,
      "p95DurationMs": 5200,
      "totalRetries": 3
    },
    {
      "agentType": "routine_generator",
      "date": "2024-01-15",
      "totalExecutions": 8,
      "successfulExecutions": 7,
      "failedExecutions": 1,
      "avgDurationMs": 8200,
      "p95DurationMs": 12000,
      "totalRetries": 5
    }
  ]
}
```

**Example cURL** - All metrics:
```bash
curl -X GET "http://localhost:6060/agents/metrics?startDate=2024-01-01&endDate=2024-01-31"
```

**Example cURL** - Specific agent:
```bash
curl -X GET "http://localhost:6060/agents/metrics?agentType=daily_auditor&startDate=2024-01-01&endDate=2024-01-31"
```

**Metrics Fields**:
- `totalExecutions`: Total number of executions
- `successfulExecutions`: Executions that completed successfully
- `failedExecutions`: Executions that failed after retries
- `avgDurationMs`: Average execution duration in milliseconds
- `p95DurationMs`: 95th percentile execution duration
- `totalRetries`: Total number of retries across all executions

---

### GET /agents/health

Health check endpoint for monitoring agent system status.

**Success Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection successful"
    },
    "llm": {
      "status": "available",
      "message": "LLM provider is configured"
    }
  }
}
```

**Degraded Response (200 OK)** - Partial failure:
```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection successful"
    },
    "llm": {
      "status": "unavailable",
      "message": "LLM provider connection failed"
    }
  }
}
```

**Example cURL**:
```bash
curl -X GET http://localhost:6060/agents/health
```

**Use Cases**:
- Kubernetes liveness/readiness probes
- Load balancer health checks
- Monitoring system integration
- Operational dashboards

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | When It Occurs |
|------|---------|----------------|
| 200 | OK | Request successful, execution completed |
| 202 | Accepted | Execution paused, awaiting approval |
| 400 | Bad Request | Invalid request body or parameters |
| 403 | Forbidden | Unauthorized access to thread (ownership validation failed) |
| 404 | Not Found | Thread ID not found in checkpoints |
| 429 | Too Many Requests | Rate limit exceeded (10 req/min) |
| 500 | Internal Server Error | Execution failed after retries or unexpected error |

### Error Response Format

All error responses follow this structure:

```json
{
  "message": "Human-readable error message in Spanish",
  "error": "Technical error details (optional)",
  "code": "ERROR_CODE (optional)"
}
```

### Common Error Messages

**Validation Errors** (400):
- `"Validation error"` - Request body validation failed
- `"Invalid date format. Expected YYYY-MM-DD"` - Date parameter malformed
- `"Missing required field: date"` - Required field not provided

**Authentication/Authorization Errors** (403):
- `"No autorizado para acceder a este thread"` - Thread ownership validation failed
- `"Token de autenticación inválido"` - Invalid authentication token (production)

**Not Found Errors** (404):
- `"Thread de ejecución no encontrado"` - Thread ID doesn't exist or expired
- `"No se encontraron notas para la fecha especificada"` - No notes for date

**Rate Limiting Errors** (429):
- `"Demasiadas solicitudes, intenta de nuevo más tarde"` - Rate limit exceeded

**Server Errors** (500):
- `"Error al ejecutar auditoría diaria"` - Daily auditor execution failed
- `"Error al generar rutina"` - Routine generator execution failed
- `"LLM provider unavailable after 3 retries"` - LLM connection failed
- `"Database temporarily unavailable"` - Database connection lost
- `"Schedule validation failed after 3 attempts"` - Validation loop exhausted
- `"Execution timeout exceeded"` - Execution took longer than 5 minutes

---

## Common Patterns

### Synchronous Execution Pattern

For executions that complete immediately (no approval required):

```javascript
// 1. Start execution
const response = await fetch('http://localhost:6060/agents/daily-audit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ date: '2024-01-15' })
});

const result = await response.json();

if (response.status === 200) {
  // Execution completed
  console.log('Summary:', result.summary);
} else if (response.status === 500) {
  // Execution failed
  console.error('Error:', result.error);
}
```

### Asynchronous Execution with Approval Pattern

For executions that require human approval:

```javascript
// 1. Start execution
const startResponse = await fetch('http://localhost:6060/agents/daily-audit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ date: '2024-01-15' })
});

const startResult = await startResponse.json();

if (startResponse.status === 202) {
  // Execution paused, awaiting approval
  const threadId = startResult.threadId;
  console.log('Analysis:', startResult.analysis);
  
  // 2. User reviews and decides
  const userApproved = await getUserDecision(startResult.analysis);
  
  // 3. Submit approval decision
  const approveResponse = await fetch(`http://localhost:6060/agents/approve/${threadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: userApproved })
  });
  
  const approveResult = await approveResponse.json();
  console.log('Final status:', approveResult.status);
}
```

### Polling Status Pattern

For monitoring long-running executions:

```javascript
async function pollStatus(threadId, maxAttempts = 60, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`http://localhost:6060/agents/status/${threadId}`);
    const status = await response.json();
    
    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }
    
    if (status.status === 'paused') {
      // Handle approval workflow
      return status;
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('Polling timeout exceeded');
}
```

### Error Handling Pattern

Robust error handling with retries:

```javascript
async function executeWithRetry(endpoint, body, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        await new Promise(resolve => setTimeout(resolve, 60000));
        continue;
      }
      
      if (response.status >= 500) {
        // Server error, retry with backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
      
      return await response.json();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

---

## Security Considerations

### Rate Limiting

- **Limit**: 10 requests per minute per IP address
- **Response**: 429 Too Many Requests
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Input Sanitization

All user inputs are sanitized to prevent:
- HTML injection
- Prompt injection attacks
- SQL injection (via parameterized queries)
- Content length limits (10,000 characters max)

### Thread Ownership

- Thread IDs are cryptographically secure UUIDs
- Thread ownership validation prevents unauthorized access
- Threads expire after 7 days of inactivity

### Data Encryption

- Checkpoint data encrypted at rest (AES-256-GCM)
- HTTPS required in production
- Sensitive data sanitized before logging

---

## Performance Characteristics

### Expected Response Times

| Endpoint | Typical | P95 | P99 |
|----------|---------|-----|-----|
| POST /agents/daily-audit | 3-5s | 8s | 12s |
| POST /agents/generate-routine | 8-12s | 15s | 20s |
| POST /agents/approve/:threadId | 100-200ms | 500ms | 1s |
| GET /agents/status/:threadId | 50-100ms | 200ms | 500ms |
| GET /agents/metrics | 100-300ms | 500ms | 1s |
| GET /agents/health | 50ms | 100ms | 200ms |

### Timeout Configuration

- **Execution Timeout**: 5 minutes (300,000ms)
- **LLM Request Timeout**: 30 seconds
- **Database Query Timeout**: 10 seconds

### Concurrency Limits

- **Max Concurrent Executions per User**: 5
- **Max Concurrent Executions System-Wide**: 100
- **Checkpoint Save Queue**: 1000 operations

---

## Changelog

### Version 1.0.0 (2024-01-15)

- Initial release of LangGraph Agent API
- Daily Auditor agent with approval workflow
- Routine Generator agent with validation loop
- PostgreSQL checkpointing for state persistence
- Metrics and health check endpoints
- Rate limiting and security measures

---

## Support

For issues, questions, or feature requests:
- **GitHub Issues**: [brain-sync/issues](https://github.com/brain-sync/issues)
- **Documentation**: [brain-sync/docs](https://github.com/brain-sync/docs)
- **Email**: support@brain-sync.com

---

## License

Copyright © 2024 Brain Sync. All rights reserved.
