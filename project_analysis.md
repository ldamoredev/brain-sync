# Project Analysis: Brain-Sync

## Overview
`brain-sync` is a full-stack monorepo application designed to act as a "Second Brain" or personal knowledge assistant. It leverages **Local LLMs** (via Ollama) and **RAG (Retrieval-Augmented Generation)** to provide context-aware answers based on the user's personal notes.

The project is managed by `pnpm` and `turbo`, ensuring efficient builds and dependency management across the workspace.

## Architecture

The system follows a **Clean Architecture** approach in the backend and a modern **Component-Based Architecture** in the frontend, connected via RESTful APIs.

### 1. Backend (`apps/api`)
The backend is the core intelligence of the system. It handles data persistence, vector generation, and LLM orchestration.

*   **Framework**: Express.js with TypeScript.
*   **Architecture Pattern**: Hexagonal / Clean Architecture.
    *   **Domain**: Core business logic and interfaces (e.g., `Note`, `Chat`, `BehaviorRepository`).
    *   **Application**: Use cases and service implementations (`IndexNote`, `Chat`, `AgenticService`).
    *   **Infrastructure**: External adapters (Database, LLM Providers, HTTP Controllers).
*   **Database**: PostgreSQL accessed via **Drizzle ORM**.
    *   Stores raw notes and their vector embeddings (using `pgvector`).
    *   Stores behavioral data: `emotions_log`, `triggers`, `behavior_outcomes`.
    *   Stores agentic outputs: `daily_summaries`, `routines`.
    *   Stores graph relationships: `relationships` (GraphRAG).

#### RAG Pipeline (Retrieval-Augmented Generation)
The RAG implementation allows the AI to "chat" with your notes.
1.  **Ingestion**: When a note is saved, it is processed to generate a vector embedding.
2.  **Retrieval**: When a user asks a question:
    *   The question is converted into a vector using `nomic-embed-text`.
    *   The database is queried for the most similar notes (Semantic Search).
3.  **Augmentation**: The retrieved notes are injected into the system prompt as "Context".
4.  **Generation**: The LLM (`phi3:mini`) generates an answer based *only* on that context.

#### Behavioral Intelligence & Agents (Phase 1 & 2)
The system now includes proactive agents and structured analysis:
*   **Journal Analysis**: When a note is saved, `JournalAnalysisService` extracts structured data (Emotions, Triggers, Actions) and saves it to the DB.
*   **Daily Auditor**: An agent (`AgenticService`) that analyzes all notes from a specific day to generate a summary and risk assessment.
*   **Routine Generator**: An agent that creates a daily schedule based on the previous day's risk level and summary.

#### Multimodality (Phase 3)
The system can now process audio inputs:
*   **Voice Journaling**: Users can record audio notes which are transcribed locally using **Faster-Whisper** (via a dedicated Docker container) and saved as text notes.

#### GraphRAG (Phase 4)
The system implements a Graph-Relational approach to find hidden connections:
*   **Graph Construction**: When a note is analyzed, the system extracts relationships (e.g., "Argument" -> CAUSES -> "Anxiety") and saves them to the `relationships` table.
*   **Graph Retrieval**: When answering questions, the `Chat` queries this graph to find contextual links related to the retrieved notes, providing deeper insights into cause-and-effect patterns.

#### Evaluation & Observability (Phase 5)
The system includes a dedicated layer to ensure response quality and system resilience:
*   **Faithfulness Evaluation**: `EvaluationService` uses a specialized LLM prompt to verify if responses are grounded in the retrieved context, automatically correcting hallucinations when detected.
*   **Quantitative Metrics**: Implementation of RAGas-style metrics (`faithfulness`, `answer relevance`) to measure system performance objectively.
*   **JSON Hardening**: `JournalAnalysisService` features a robust JSON repair mechanism that handles truncated or malformed LLM outputs, ensuring stable operation even with smaller local models.
*   **Benchmarking**: A dedicated benchmark suite (`scripts/benchmark.ts`) allows for automated testing of retrieval accuracy and evaluation metrics using the `Chat` use case.

#### Local AI & Ollama Integration
The project relies entirely on local inference, ensuring privacy and offline capability.
*   **Provider**: **Ollama** running locally (usually port `11434`).
*   **LLM Model**: `phi3:mini` (optimized for speed and low resource usage).
*   **Embedding Model**: `nomic-embed-text` (high-quality text embeddings).
*   **Speech-to-Text**: **Faster-Whisper** running in a Docker container (port `8000`).
*   **Orchestration**: **LangChain** (`@langchain/ollama`) is used to interface with Ollama and manage prompts.

### 2. Frontend (`apps/web`)
The frontend is a modern React application built with Next.js.

*   **Framework**: **Next.js 16** (App Router).
*   **UI Library**: **React 19**.
*   **Styling**: **Tailwind CSS v4** with `clsx` and `tailwind-merge`.
*   **Animations**: `framer-motion` for smooth message transitions.

#### Chat Interface
*   **State Management**: Uses React `useState` and `useRef` to manage chat history and auto-scrolling.
*   **API Communication**: Uses standard `fetch` to communicate with the backend REST API.

### 3. MCP Servers (`apps/mcp-servers`)
This new section of the monorepo houses isolated microservices that implement the Model Context Protocol (MCP). These servers extend Brain-Sync's capabilities by connecting it to real-world applications like Telegram and Google Calendar, allowing the AI to interact proactively with the user's daily life.

*   **Architecture**: Each MCP server is a self-contained microservice, designed to run as a subprocess and communicate with the main API via standard I/O. This ensures a clean separation of concerns and scalability for future integrations.
*   **Components**:
    *   **Telegram MCP Server**:
        *   Acts as a Telegram bot, enabling multimodal input (e.g., voice notes transcribed locally via `faster-whisper-server`).
        *   Exposes a `send_telegram_alert` tool, allowing agents like the "Daily Auditor" to send proactive notifications for high-risk emotional patterns.
    *   **Google Calendar MCP Server**:
        *   Integrates with Google Calendar to read user availability (`calendar://today/freebusy` resource).
        *   Exposes a `schedule_recovery_block` tool, enabling the "Routine Generator" agent to dynamically insert recovery activities (e.g., meditation, walks) into free slots based on detected triggers.

### 4. Shared Infrastructure
*   **Monorepo Tools**:
    *   **Turbo**: Orchestrates tasks (build, dev, lint) across packages.
    *   **PNPM**: Efficient package manager with workspace support.
*   **Shared Packages**:
    *   `@brain-sync/types`: Contains shared TypeScript interfaces (e.g., `ChatResponse`, `Note`) and Zod schemas to ensure the frontend and backend stay in sync.
    *   `@brain-sync/typescript-config`: strict TS configurations.

## Key Features & Flows

1.  **Ask with Context**:
    *   User types a question -> Frontend sends a request to the Express Backend.
    *   Backend embeds question -> Finds relevant notes -> Calls Ollama with context.
    *   Ollama generates a response -> Backend sends the full response to the frontend -> Frontend renders the response.

2.  **Privacy First**:
    *   All data stays local.
    *   No API keys required for external services (OpenAI, Anthropic, etc.).

3.  **Modular AI**:
    *   The `LLMProvider` and `VectorProvider` interfaces allow for easy swapping of models (e.g., upgrading to Llama 3 or Mistral) without changing the core logic.

4.  **Proactive & Context-Aware Intervention (via MCP)**:
    *   Agents (e.g., Daily Auditor, Routine Generator) can leverage MCP tools to interact with external services.
    *   Example: Daily Auditor detects high-risk -> calls `send_telegram_alert` via MCP -> user receives a proactive message.
    *   Example: Routine Generator detects a trigger -> checks `calendar://today/freebusy` -> calls `schedule_recovery_block` via MCP -> a meditation session is added to the user's calendar.

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
5.  **Analysis (Phase 1 & 4)**:
    *   `JournalAnalysisService` analyzes the content to extract emotions, triggers, actions, AND relationships.
    *   Entities are saved to `emotions_log`, `triggers`, and `behavior_outcomes`.
    *   Relationships are saved to the `relationships` table, building the knowledge graph.

### 2. Retrieval (RAG + GraphRAG)
When a user asks a question, the system performs a hybrid search:

1.  **Query Vectorization**:
    *   The user's question is sent to the `VectorProvider` to generate a query vector.
2.  **Similarity Search**:
    *   The `DrizzleNoteRepository` finds the top `N` most similar notes using `pgvector`.
3.  **Graph Context**:
    *   The `GraphRepository` takes the IDs of the retrieved notes and finds related entities in the `relationships` table.
    *   It retrieves connections like "Argument CAUSES Anxiety" relevant to the context.
4.  **Context Construction**:
    *   The content of the notes + the graph relationships are concatenated to form the final context.
    *   This rich context is passed to the LLM to generate a comprehensive answer.
ext Protocol to enable proactive interactions with external services like Telegram and Google Calendar, allowing the AI to read user availability and schedule recovery activities. This involves creating isolated microservices within `apps/mcp-servers` for each integration.