export interface TranscriptionProvider {
    generateForAudio(filePath: string): Promise<string|null>
}