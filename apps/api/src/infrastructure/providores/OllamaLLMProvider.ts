// apps/api/src/infrastructure/providers/OllamaLLMProvider.ts
import { ChatMessage, LLMProvider } from '../../application/providers/LLMProvider';
import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export class OllamaLLMProvider implements LLMProvider {
    private model: ChatOllama;

    constructor(private modelName: string = "phi3:mini") {
        this.model = new ChatOllama({
            model: modelName, // La versión mini es extremadamente eficiente
            baseUrl: "http://127.0.0.1:11434",
            temperature: 0, // Senior Tip: 0 para RAG (respuestas deterministas)
        });
    }

    async generateResponse(messages: ChatMessage[]): Promise<string> {
        // Mapeamos nuestros mensajes genéricos a los tipos de LangChain
        const langChainMessages = messages.map((m) => {
            if (m.role === "system") return new SystemMessage(m.content);
            if (m.role === "assistant") return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        // En LangChain v0.2+ se usa invoke
        const response = await this.model.invoke(langChainMessages);

        return response.content as string;
    }

    async *generateStream(messages: ChatMessage[]): AsyncIterable<string> {
        const langChainMessages = messages.map(m => {
            if (m.role === "system") return new SystemMessage(m.content);
            if (m.role === "assistant") return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        const stream = await this.model.stream(langChainMessages);

        for await (const chunk of stream) {
            // Si usas ChatOllama, el contenido viene en .content
            yield chunk.content as string;
        }
    }
}