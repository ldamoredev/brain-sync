import { TranscriptionProvider } from '../providers/TranscriptionProvider';

export class TranscriptionService {
    constructor(private transcriptionProvider: TranscriptionProvider) {
    }

    async transcribe(filePath: string): Promise<string> {
        return await this.transcriptionProvider.generateForAudio(filePath);
    }
}
