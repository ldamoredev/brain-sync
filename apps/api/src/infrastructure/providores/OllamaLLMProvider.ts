import 'dotenv/config';
import { LLMProvider } from '../../application/providers/LLMProvider';
import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatMessage } from '@brain-sync/types';

export class OllamaLLMProvider implements LLMProvider {
    private model: ChatOllama;

    constructor() {
        this.model = new ChatOllama({
            model: process.env.OLLAMA_MODEL || "phi3:mini",
            baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
            temperature: 0,
        });
    }

    async generateResponse(messages: ChatMessage[]): Promise<string> {
        const langChainMessages = messages.map((m) => {
            if (m.role === "system") return new SystemMessage(m.content);
            if (m.role === "assistant") return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        const response = await this.model.invoke(langChainMessages);

        return response.content as string;
    }

    async *generateStream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
        const langChainMessages = messages.map(m => {
            if (m.role === 'system') return new SystemMessage(m.content);
            if (m.role === 'assistant') return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        const stream = await this.model.stream(langChainMessages, { signal });

        for await (const chunk of stream) {
            if (signal?.aborted) return;
            yield chunk.content as string;
        }
    }
}
