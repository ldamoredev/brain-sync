# Project Analysis: Brain-Sync

## Overview
`brain-sync` is a full-stack monorepo application designed to act as a "Second Brain" or personal knowledge assistant. It leverages **Local LLMs** (via Ollama) and **RAG (Retrieval-Augmented Generation)** to provide context-aware answers based on the user's personal notes.

The project is managed by `pnpm` and `turbo`, ensuring efficient builds and dependency management across the workspace.

## Architecture

The system follows a **Clean Architecture** approach in the backend and a modern **Component-Based Architecture** in the frontend, connected via RESTful APIs and Server-Sent Events (SSE) for real-time streaming.

### 1. Backend (`apps/api`)
The backend is the core intelligence of the system. It handles data persistence, vector generation, and LLM orchestration.

*   **Framework**: Express.js with TypeScript.
*   **Architecture Pattern**: Hexagonal / Clean Architecture.
    *   **Domain**: Core business logic and interfaces (e.g., `Note`, `ChatService`).
    *   **Application**: Use cases and service implementations.
    *   **Infrastructure**: External adapters (Database, LLM Providers, HTTP Controllers).
*   **Database**: PostgreSQL accessed via **Drizzle ORM**.
    *   Stores raw notes and their vector embeddings (using `pgvector`).

#### RAG Pipeline (Retrieval-Augmented Generation)
The RAG implementation allows the AI to "chat" with your notes.
1.  **Ingestion**: When a note is saved, it is processed to generate a vector embedding.
2.  **Retrieval**: When a user asks a question:
    *   The question is converted into a vector using `nomic-embed-text`.
    *   The database is queried for the most similar notes (Semantic Search).
3.  **Augmentation**: The retrieved notes are injected into the system prompt as "Context".
4.  **Generation**: The LLM (`phi3:mini`) generates an answer based *only* on that context.

#### Local AI & Ollama Integration
The project relies entirely on local inference, ensuring privacy and offline capability.
*   **Provider**: **Ollama** running locally (usually port `11434`).
*   **LLM Model**: `phi3:mini` (optimized for speed and low resource usage).
*   **Embedding Model**: `nomic-embed-text` (high-quality text embeddings).
*   **Orchestration**: **LangChain** (`@langchain/ollama`) is used to interface with Ollama, manage prompts, and handle streaming responses.

#### Streaming with SSE (Server-Sent Events)
To provide a ChatGPT-like experience, the backend streams the LLM's response token-by-token.
*   **Protocol**: Server-Sent Events (SSE).
*   **Endpoint**: `GET /api/chat/stream`.
*   **Events**:
    *   `meta`: Sends the retrieved sources (notes used for the answer) before the text starts.
    *   `token`: Sends a chunk of the generated text.
    *   `done`: Signals the end of the stream.
    *   `error`: Handles failures or aborts.

### 2. Frontend (`apps/web`)
The frontend is a modern React application built with Next.js.

*   **Framework**: **Next.js 16** (App Router).
*   **UI Library**: **React 19**.
*   **Styling**: **Tailwind CSS v4** with `clsx` and `tailwind-merge`.
*   **Animations**: `framer-motion` for smooth message transitions.

#### Chat Interface
*   **State Management**: Uses React `useState` and `useRef` to manage chat history and auto-scrolling.
*   **Streaming Client**: Uses the native `EventSource` API to consume the backend SSE stream.
    *   Listens for `token` events to append text in real-time.
    *   Listens for `meta` events to display "Contexto Recuperado" (citations).
*   **Proxying**: Next.js API Routes (`app/api/chat/stream/route.ts`) act as a proxy to the Express backend, handling CORS and potentially adding an extra layer of security or transformation.

### 3. Shared Infrastructure
*   **Monorepo Tools**:
    *   **Turbo**: Orchestrates tasks (build, dev, lint) across packages.
    *   **PNPM**: Efficient package manager with workspace support.
*   **Shared Packages**:
    *   `@brain-sync/types`: Contains shared TypeScript interfaces (e.g., `ChatResponse`, `Note`) and Zod schemas to ensure the frontend and backend stay in sync.
    *   `@brain-sync/typescript-config`: strict TS configurations.

## Key Features & Flows

1.  **Ask with Context**:
    *   User types a question -> Frontend sends to Next.js Proxy -> Proxy forwards to Express Backend.
    *   Backend embeds question -> Finds relevant notes -> Calls Ollama with context.
    *   Ollama streams response -> Backend forwards chunks via SSE -> Frontend renders text live.

2.  **Privacy First**:
    *   All data stays local.
    *   No API keys required for external services (OpenAI, Anthropic, etc.).

3.  **Modular AI**:
    *   The `LLMProvider` and `VectorProvider` interfaces allow for easy swapping of models (e.g., upgrading to Llama 3 or Mistral) without changing the core logic.

## Data Flow: Note Ingestion & Retrieval

This section details how data moves through the system, from creation to retrieval.

### 1. Note Ingestion (Indexing)
When a user creates a new note, the following process occurs:

1.  **Request**: The frontend sends a `POST /notes` request with the note content.
2.  **Validation**: The `IndexNote` service validates the content (e.g., minimum length).
3.  **Vectorization**:
    *   The service calls `VectorProvider.generateEmbedding(content)`.
    *   The `OllamaVectorProvider` sends the text to the local Ollama instance (using `nomic-embed-text`).
    *   Ollama returns a high-dimensional vector (array of numbers) representing the semantic meaning of the text.
4.  **Persistence**:
    *   The `DrizzleNoteRepository` saves the note to the PostgreSQL database.
    *   It stores the `id`, `content`, `createdAt`, and the generated `embedding`.

### 2. Retrieval (RAG)
When a user asks a question, the system performs a similarity search:

1.  **Query Vectorization**:
    *   The user's question is sent to the `VectorProvider` to generate a query vector (using the same model as ingestion).
2.  **Similarity Search**:
    *   The `DrizzleNoteRepository` executes a SQL query using `pgvector` functions.
    *   It calculates the **Cosine Distance** (`1 - cosine_distance`) between the query vector and all note vectors in the database.
    *   It selects the top `N` notes (e.g., top 5) with the highest similarity score.
3.  **Context Construction**:
    *   The content of these "similar notes" is concatenated to form the context.
    *   This context is passed to the LLM to ground its response in the user's data.

## Project Status & Next Steps

The project has reached a "feature complete" state for its initial scope. The core user journey is fully implemented, and the underlying infrastructure has been hardened for stability and scalability.

### Recent Improvements
*   **Note Management**: Full CRUD functionality for notes (Create, Read, List).
*   **Production Hardening**:
    *   **Environment Variables**: Replaced hardcoded values with `.env` files.
    *   **Security**: Added `helmet`, rate limiting, and security headers.
    *   **Error Handling**: Implemented global error handling and validation middleware.
*   **Developer Experience**:
    *   **Dockerization**: The entire stack (Postgres, Ollama, API, Web) is containerized with Docker Compose for one-command setup.
    *   **Logging**: Integrated `winston` for structured backend logging.
    *   **Testing**: Set up `vitest` and wrote initial unit tests for core services.

### Future Roadmap
While the current version is a robust MVP, several avenues exist for future development:
*   **User Authentication**: Implement user accounts to support multiple users in a deployed environment.
*   **Advanced Note Management**: Add features like note editing, deletion, and tagging/organization.
*   **Scalable Vector Search**: For larger datasets, migrate from `pgvector` to a dedicated vector database like Weaviate or Pinecone.
*   **CI/CD Pipeline**: Set up a GitHub Actions workflow to automate testing and deployment.
