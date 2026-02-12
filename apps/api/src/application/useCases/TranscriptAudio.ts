import { TranscriptionProvider } from '../providers/TranscriptionProvider';

export class TranscriptAudio {
    constructor(private transcriptionProvider: TranscriptionProvider) {
    }

    async execute(filePath: string): Promise<string> {
        return await this.transcriptionProvider.generateForAudio(filePath);
    }
}
