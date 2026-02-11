export type RConstructor<T> = abstract new (...args: any[]) => T;

export abstract class RepositoryProvider {
    abstract get<T>(repositoryType: RConstructor<T>): T;
}

export class DrizzleRepositoryProvider extends RepositoryProvider {
    private cache = new Map<RConstructor<any>, any>();
    private factories = new Map<RConstructor<any>, () => any>();

    register<T>(
        abstraction: RConstructor<T>,
        factory: () => T
    ): void {
        this.factories.set(abstraction, factory);
    }

    get<T>(repositoryType: RConstructor<T>): T {
        if (!this.cache.has(repositoryType)) {
            const factory = this.factories.get(repositoryType);

            if (!factory) {
                throw new Error(
                    `InMemory${repositoryType.name} not registered`
                );
            }

            this.cache.set(repositoryType, factory());
        }

        return this.cache.get(repositoryType);
    }
}
