import { DrizzleNoteRepository } from "./infrastructure/repositories/DrizzleNoteRepository";
import { ChatService } from "./application/services/ChatService";

async function main() {
    const repo = new DrizzleNoteRepository();
    const chat = new ChatService(repo);

    const query = "¿Un perro es una mascota??"; // Algo relacionado a lo que guardamos antes

    console.log(`🤔 Preguntando: "${query}"...`);

    const response = await chat.ask(query);

    console.log("\n🤖 Respuesta de la IA:");
    console.log(response);
    process.exit(0);
}

main().catch(console.error);