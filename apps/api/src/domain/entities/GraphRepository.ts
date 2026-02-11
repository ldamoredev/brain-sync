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

export abstract class GraphRepository {
    abstract createRelationship(rel: Relationship): Promise<void>;
    abstract findRelated(nodeId: string, type?: string): Promise<Relationship[]>;
    abstract findContextualRelationships(noteIds: string[]): Promise<GraphContext[]>;
}
