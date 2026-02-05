# Brain Sync

Brain Sync is a full-stack application designed to be a "Second Brain" or personal knowledge assistant. It leverages local LLMs and Retrieval-Augmented Generation (RAG) to provide context-aware answers based on your personal notes.

## Tech Stack

- **Monorepo**: pnpm Workspaces + Turbo
- **Backend**: Node.js, Express, TypeScript, Drizzle ORM
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Database**: PostgreSQL with pgvector
- **AI**: Ollama, LangChain

For a detailed architectural overview, see [project_analysis.md](project_analysis.md).

## Getting Started with Docker

This project is fully containerized, allowing you to run the entire stack with a single command.

### Prerequisites

- [Docker](https://www.docker.com/get-started) installed and running.
- [Ollama](https://ollama.ai/) installed locally (for the initial model setup).

### 1. Initial Model Setup

Before launching the Docker containers, you need to pull the required Ollama models on your local machine. The Docker container for Ollama will then pick them up from the shared volume.

Run the following commands in your terminal:

```bash
ollama pull phi3:mini
ollama pull nomic-embed-text
```

### 2. Running the Application

Once the models are downloaded, you can start the entire application stack using Docker Compose:

```bash
docker-compose up --build
```

This command will:
- Build the Docker images for the `api` and `web` services.
- Start the `postgres`, `ollama`, `api`, and `web` containers.
- The `api` service will be available at `http://localhost:6060`.
- The `web` application will be available at `http://localhost:3000`.

To stop the services, press `Ctrl+C` in the terminal where `docker-compose` is running, and then run:

```bash
docker-compose down
```

## Local Development (Without Docker)

If you prefer to run the services manually:

1.  **Install Dependencies**: `pnpm install`
2.  **Run Services**:
    - Start the backend API: `pnpm --filter @brain-sync/api dev`
    - Start the frontend web app: `pnpm --filter web dev`
3.  Ensure you have PostgreSQL and Ollama running locally and have configured your `.env` files correctly.
