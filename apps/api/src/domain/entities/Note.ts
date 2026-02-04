export class Note {
    constructor(
        public readonly id: string,
        public readonly content: string,
        public readonly embedding: number[], // El vector generado por la IA
        public readonly createdAt: Date
    ) {}
}