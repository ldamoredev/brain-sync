# AGENTS.md - Brain Sync Development Guide

## Project Overview

Brain Sync is a monorepo using pnpm workspaces and Turbo. It consists of:
- **apps/api**: Express.js API with TypeScript
- **packages/shared-types**: Shared Zod schemas and types (@brain-sync/types)
- **packages/typescript-config**: Shared TypeScript configuration

---

## Build, Lint & Test Commands

### Root Commands (from project root)
```bash
pnpm dev          # Run all apps in dev mode
pnpm build        # Build all apps
pnpm lint         # Lint all apps
pnpm clean        # Remove node_modules, dist, and build artifacts
```

### API Commands (from apps/api)
```bash
pnpm dev          # Run API with ts-node-dev (hot reload)
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled production build
pnpm test         # Run all tests with Vitest
pnpm test:watch   # Run tests in watch mode
pnpm db:push      # Push Drizzle schema to database
pnpm db:reset     # Reset and re-seed database
```

### Running a Single Test
```bash
# By test name (partial match)
pnpm test -- IndexNote

# By file path
pnpm test apps/api/test/IndexNote.test.ts

# With vitest filter
pnpm vitest run -t "should index a note"
```

---

## Code Style Guidelines

### General Conventions

- **Language**: TypeScript (English) with Spanish user-facing messages
- **Indentation**: 4 spaces (no tabs)
- **Line endings**: Unix-style (LF)
- **Max line length**: 200 characters (soft limit)
- **Semicolons**: Required
- **Quotes**: Single quotes for strings

### TypeScript Configuration

The API uses relaxed TypeScript settings in `apps/api/tsconfig.json`:
- `strict: false`
- `strictNullChecks: false`
- `noImplicitAny: false`
- `exactOptionalPropertyTypes: false`

However, new code should prefer explicit types where reasonable.

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `IndexNote`, `NoteController` |
| Functions/methods | camelCase | `execute()`, `createNote()` |
| Variables | camelCase | `mockRepositories`, `noteContent` |
| Interfaces | PascalCase | `VectorProvider`, `Controller` |
| File names | PascalCase (classes) / kebab-case (utilities) | `IndexNote.ts`, `json-parser.ts` |
| Constants | UPPER_SNAKE_CASE | `PORT`, `MAX_RETRIES` |
| Database columns | snake_case | `created_at`, `note_id` |

### Import Order

1. Node.js built-ins (`crypto`, `fs`, etc.)
2. External packages (`express`, `vitest`, etc.)
3. Workspace packages (`@brain-sync/types`)
4. Relative imports (internal modules)

```typescript
import { randomUUID } from 'crypto';
import express from 'express';
import { z } from 'zod';
import { Note } from '../../domain/entities/Note';
import { createNoteSchema } from '@brain-sync/types';
```

### Project Structure

```
apps/api/src/
├── application/
│   ├── providers/       # External service interfaces (VectorProvider, LLMProvider)
│   ├── useCases/        # Business logic (IndexNote, Chat, GenerateDailyAudit)
│   └── utils/           # Utility functions
├── domain/
│   ├── entities/        # Domain models (Note, Behavior, Graph)
│   ├── services/        # Domain services (JournalAnalysisService)
│   └── errors/          # Custom errors (AppError)
└── infrastructure/
    ├── http/
    │   ├── controllers/ # HTTP handlers (NoteController, ChatController)
    │   ├── middleware/  # Express middleware (errorHandler, validateRequest)
    │   └── interfaces/  # Controller interface
    ├── db/              # Database schema (Drizzle)
    ├── logger.ts       # Winston logger setup
    └── repositories/    # Repository implementations
```

### Class Patterns

**Use Cases (Application Layer)**
```typescript
export class IndexNote {
    constructor(
        private repositories: RepositoryProvider,
        private vectorProvider: VectorProvider,
    ) {}

    async execute(content: string): Promise<Note> {
        // Implementation
    }
}
```

**Controllers**
```typescript
export class NoteController implements Controller {
    public path = '/notes';
    public router = Router();

    constructor(private indexNoteUseCase: IndexNote) {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.post(`${this.path}`, this.create.bind(this));
    }

    async create(req: Request, res: Response) {
        // Implementation
    }
}
```

**Entities**
```typescript
export class Note {
    constructor(
        public readonly id: string,
        public readonly content: string,
        public readonly embedding: number[],
        public readonly createdAt: Date
    ) {}
}
```

### Error Handling

Use the custom `AppError` class for operational errors:
```typescript
throw new AppError('Note not found', 404);
```

Global error handler in `src/infrastructure/http/middleware/errorHandler.ts` handles:
- `AppError` instances (returns statusCode)
- `ZodError` instances (validation errors, returns 400)
- Unhandled errors (returns 500)

### Validation

Use Zod schemas defined in `packages/shared-types/src/schemas.ts`:
```typescript
import { createNoteSchema } from '@brain-sync/types';
import { validateRequest } from '../middleware/validateRequest';

this.router.post(`${this.path}`, validateRequest(createNoteSchema), this.create.bind(this));
```

### Testing Conventions

Tests are in `apps/api/test/*.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('IndexNote Service', () => {
    it('should index a note successfully', async () => {
        // Arrange
        const mockRepository = { save: vi.fn().mockResolvedValue(undefined) };
        
        // Act
        const result = await indexNote.execute('test content');
        
        // Assert
        expect(result).toBeInstanceOf(Note);
    });
});
```

Use `vi.fn()` for mocks and `as unknown as Type` for partial mocks.

### Database

- ORM: Drizzle ORM
- Migrations: Drizzle Kit (`drizzle-kit push`)
- Schema: `src/infrastructure/db/schema.ts`

### Logging

Use Winston logger from `src/infrastructure/logger.ts`:
```typescript
import logger from '../logger';
logger.error('Message', { metadata });
```

---

## Environment Variables

Required variables in `apps/api/.env`:
- `PORT` - Server port (default: 6060)
- `CORS_ORIGIN` - Allowed CORS origins
- Database connection variables
- LLM provider API keys

Copy `.env.example` to `.env` for local development.

---

## Common Tasks

### Adding a New Use Case
1. Create file in `src/application/useCases/`
2. Implement class with `execute()` method
3. Register in `src/infrastructure/Core.ts`
4. Add controller route in appropriate controller

### Adding a New Entity
1. Define entity class in `src/domain/entities/`
2. Define repository interface in same location
3. Implement repository in `src/infrastructure/repositories/`
4. Add Drizzle schema in `src/infrastructure/db/schema.ts`

### Adding a New API Endpoint
1. Create or update controller in `src/infrastructure/http/controllers/`
2. Implement route handlers
3. Add validation schema in `packages/shared-types/src/schemas.ts`
