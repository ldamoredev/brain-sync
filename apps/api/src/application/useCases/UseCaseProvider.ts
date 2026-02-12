export type SConstructor<T> = new (...args: any[]) => T;

export class UseCaseProvider {
    private cache = new Map<SConstructor<any>, any>();
    private factories = new Map<SConstructor<any>, () => any>();

    register<T>(
        serviceType: SConstructor<T>,
        factory: () => T
    ): void {
        this.factories.set(serviceType, factory);
    }

    get<T>(serviceType: SConstructor<T>): T {
        if (!this.cache.has(serviceType)) {
            const factory = this.factories.get(serviceType);

            if (!factory) {
                throw new Error(
                    `Service ${serviceType.name} not registered`
                );
            }

            this.cache.set(serviceType, factory());
        }

        return this.cache.get(serviceType);
    }
}
