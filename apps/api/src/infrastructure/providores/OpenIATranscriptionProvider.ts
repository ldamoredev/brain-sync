import { TranscriptionProvider } from '../../application/providers/TranscriptionProvider';
import OpenAI from 'openai';
import fsPromises from 'fs/promises';
import fs from 'fs';

export class OpenIATranscriptionProvider implements TranscriptionProvider {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            baseURL: process.env.AUDIO_TRANSCRIPTION_BASE_URL || 'http://localhost:8000/v1',
            apiKey: 'cant-be-empty',
            timeout: 10 * 60 * 1000, // 10 minutes timeout
        });
    }

    async generateForAudio(filePath: string): Promise<string | null> {
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                model: 'base',
                file: fs.createReadStream(filePath),
            });
            return transcription.text;
        } catch (error) {
            console.error("Error during transcription:", error);
            throw new Error("Failed to transcribe audio.");
        } finally {
            try {
                await fsPromises.unlink(filePath);
            } catch (unlinkError) {
                console.error("Error deleting temporary file:", unlinkError);
            }
        }
    }

}