function callCleanup(cleanup, reason) {
    if (typeof cleanup === 'function') return cleanup(reason);
    if (cleanup && typeof cleanup.dispose === 'function') return cleanup.dispose(reason);
    if (cleanup && typeof cleanup.disconnect === 'function') return cleanup.disconnect();
    if (cleanup && typeof cleanup.abort === 'function') return cleanup.abort(reason);
    throw new TypeError('Lifecycle cleanup must be a function or disposable resource');
}

export class ResourceScope {
    #cleanups = [];
    #closed = false;

    get closed() {
        return this.#closed;
    }

    use(cleanup) {
        if (this.#closed) {
            callCleanup(cleanup, 'scope-already-closed');
            return () => {};
        }
        const entry = { cleanup, active: true };
        this.#cleanups.push(entry);
        return (reason = 'released') => {
            if (!entry.active) return;
            entry.active = false;
            callCleanup(entry.cleanup, reason);
        };
    }

    listen(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        return this.use(() => target.removeEventListener(type, listener, options));
    }

    observe(observer, target, options) {
        observer.observe(target, options);
        this.use(() => observer.disconnect());
        return observer;
    }

    timeout(callback, delay, clock = globalThis) {
        const id = clock.setTimeout(callback, delay);
        this.use(() => clock.clearTimeout(id));
        return id;
    }

    interval(callback, delay, clock = globalThis) {
        const id = clock.setInterval(callback, delay);
        this.use(() => clock.clearInterval(id));
        return id;
    }

    animationFrame(callback, clock = globalThis) {
        const id = clock.requestAnimationFrame(callback);
        this.use(() => clock.cancelAnimationFrame(id));
        return id;
    }

    abortController() {
        const controller = new AbortController();
        this.use((reason) => controller.abort(reason));
        return controller;
    }

    cleanup(reason = 'unmount') {
        if (this.#closed) return [];
        this.#closed = true;
        const errors = [];
        for (const entry of this.#cleanups.reverse()) {
            if (!entry.active) continue;
            entry.active = false;
            try {
                callCleanup(entry.cleanup, reason);
            } catch (error) {
                errors.push(error);
            }
        }
        this.#cleanups = [];
        return errors;
    }
}

export class LifecycleController {
    #scope = null;
    #state = 'unmounted';

    get state() {
        return this.#state;
    }

    get scope() {
        return this.#scope;
    }

    mount(setup) {
        if (this.#state === 'disposed') throw new Error('Cannot mount a disposed lifecycle');
        if (this.#state === 'mounted' || this.#state === 'active') return false;
        const scope = new ResourceScope();
        try {
            setup?.(scope);
            this.#scope = scope;
            this.#state = 'mounted';
            return true;
        } catch (error) {
            scope.cleanup('mount-failed');
            throw error;
        }
    }

    activate(activate) {
        if (this.#state === 'active') return false;
        if (this.#state !== 'mounted') throw new Error('Lifecycle must be mounted before activation');
        activate?.(this.#scope);
        this.#state = 'active';
        return true;
    }

    unmount(teardown) {
        if (this.#state === 'unmounted') return false;
        if (this.#state === 'disposed') return false;
        const scope = this.#scope;
        let teardownError;
        try {
            teardown?.(scope);
        } catch (error) {
            teardownError = error;
        } finally {
            const cleanupErrors = scope?.cleanup('unmount') || [];
            this.#scope = null;
            this.#state = 'unmounted';
            if (teardownError) throw teardownError;
            if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Lifecycle cleanup failed');
        }
        return true;
    }

    dispose(dispose) {
        if (this.#state === 'disposed') return false;
        if (this.#state !== 'unmounted') this.unmount();
        dispose?.();
        this.#state = 'disposed';
        return true;
    }
}
