export interface Relationship {
    sourceId: string;
    targetId: string;
    type: string;
    weight: number;
}

export interface GraphContext {
    source: string;
    target: string;
    type: string;
}

export interface GraphRepository {
    createRelationship(rel: Relationship): Promise<void>;
    findRelated(nodeId: string, type?: string): Promise<Relationship[]>;
    findContextualRelationships(noteIds: string[]): Promise<GraphContext[]>;
}
