import { LifecycleController } from './lifecycle.js';

export class ModuleManager {
    #modules = new Map();

    register(id, module) {
        if (!id || typeof id !== 'string') throw new TypeError('Module id must be a string');
        if (this.#modules.has(id)) throw new Error(`Module already registered: ${id}`);
        this.#modules.set(id, { module, lifecycle: new LifecycleController(), context: null });
        return this;
    }

    has(id) {
        return this.#modules.has(id);
    }

    state(id) {
        return this.#record(id).lifecycle.state;
    }

    mount(id, context = {}) {
        const record = this.#record(id);
        record.context = context;
        return record.lifecycle.mount((scope) => {
            record.module.mount?.({ ...context, scope });
        });
    }

    activate(id) {
        const record = this.#record(id);
        return record.lifecycle.activate((scope) => {
            record.module.activate?.({ ...record.context, scope });
        });
    }

    unmount(id) {
        const record = this.#record(id);
        const changed = record.lifecycle.unmount((scope) => {
            record.module.unmount?.({ ...record.context, scope });
        });
        if (changed) record.context = null;
        return changed;
    }

    dispose(id) {
        const record = this.#record(id);
        if (record.lifecycle.state !== 'unmounted' && record.lifecycle.state !== 'disposed') {
            this.unmount(id);
        }
        const changed = record.lifecycle.dispose(() => record.module.dispose?.());
        if (changed) record.context = null;
        return changed;
    }

    disposeAll() {
        for (const id of [...this.#modules.keys()].reverse()) this.dispose(id);
    }

    #record(id) {
        const record = this.#modules.get(id);
        if (!record) throw new Error(`Unknown module: ${id}`);
        return record;
    }
}
