import { OllamaEmbeddings } from "@langchain/ollama";
import { db } from "./infrastructure/db/index";
import { notes } from "./infrastructure/db/schema";

async function main() {
    console.log("🤖 Generando embedding con Ollama...");

    const ollama = new OllamaEmbeddings({
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
    });

    const text = "Aprender Clean Architecture en 2026 es vital para un Senior.";
    const embedding = await ollama.embedQuery(text);

    console.log("✅ Embedding generado. Guardando en Postgres...");

    await db.insert(notes).values({
        content: text,
        embedding: embedding,
    });

    console.log("🚀 ¡Éxito! Nota guardada con su vector.");
    process.exit(0);
}

main().catch(console.error);