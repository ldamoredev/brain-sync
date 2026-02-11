import OpenAI from 'openai';
import fs from 'fs';
import fsPromises from 'fs/promises';

export class TranscriptionService {
    private openai: OpenAI;

    constructor() {
        // Point to the Faster-Whisper container
        this.openai = new OpenAI({
            baseURL: 'http://localhost:8000/v1',
            apiKey: 'cant-be-empty',
            timeout: 10 * 60 * 1000, // 10 minutes timeout
        });
    }

    async transcribe(filePath: string): Promise<string> {
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                model: 'base', // small, base, or medium
                file: fs.createReadStream(filePath),
            });
            return transcription.text;
        } catch (error) {
            console.error("Error during transcription:", error);
            throw new Error("Failed to transcribe audio.");
        } finally {
            // Clean up the temporary file safely
            try {
                await fsPromises.unlink(filePath);
            } catch (unlinkError) {
                console.error("Error deleting temporary file:", unlinkError);
            }
        }
    }
}
