import assert from 'node:assert/strict';
import test from 'node:test';

import { LifecycleController, ResourceScope } from '../src/core/lifecycle.js';
import { ModuleManager } from '../src/core/module-manager.js';

class CountingTarget extends EventTarget {
    adds = 0;
    removes = 0;

    addEventListener(...args) {
        this.adds += 1;
        super.addEventListener(...args);
    }

    removeEventListener(...args) {
        this.removes += 1;
        super.removeEventListener(...args);
    }
}

test('L2: ResourceScope releases listener, timer, observer, pending task and temporary reference', () => {
    const scope = new ResourceScope();
    const target = new CountingTarget();
    const clock = {
        cleared: [],
        cancelled: [],
        setTimeout: () => 11,
        clearTimeout(id) { this.cleared.push(['timeout', id]); },
        setInterval: () => 12,
        clearInterval(id) { this.cleared.push(['interval', id]); },
        requestAnimationFrame: () => 13,
        cancelAnimationFrame(id) { this.cancelled.push(id); },
    };
    const observer = { observed: 0, disconnected: 0, observe() { this.observed += 1; }, disconnect() { this.disconnected += 1; } };
    let temporaryReference = { alive: true };
    const controller = scope.abortController();

    scope.listen(target, 'change', () => {});
    scope.timeout(() => {}, 10, clock);
    scope.interval(() => {}, 10, clock);
    scope.animationFrame(() => {}, clock);
    scope.observe(observer, {}, { childList: true });
    scope.use(() => { temporaryReference = null; });

    const errors = scope.cleanup('test');

    assert.deepEqual(errors, []);
    assert.equal(target.adds, 1);
    assert.equal(target.removes, 1);
    assert.equal(observer.observed, 1);
    assert.equal(observer.disconnected, 1);
    assert.deepEqual(clock.cleared.sort(), [['interval', 12], ['timeout', 11]]);
    assert.deepEqual(clock.cancelled, [13]);
    assert.equal(controller.signal.aborted, true);
    assert.equal(temporaryReference, null);
});

test('L2: ModuleManager mount/active/unmount/remount does not duplicate registration', () => {
    const target = new CountingTarget();
    const calls = [];
    const manager = new ModuleManager();
    manager.register('sample', {
        mount({ scope }) {
            calls.push('mount');
            scope.listen(target, 'ping', () => {});
        },
        activate() { calls.push('active'); },
        unmount() { calls.push('unmount'); },
        dispose() { calls.push('dispose'); },
    });

    assert.equal(manager.mount('sample'), true);
    assert.equal(manager.mount('sample'), false);
    assert.equal(manager.activate('sample'), true);
    assert.equal(manager.activate('sample'), false);
    assert.equal(manager.state('sample'), 'active');
    assert.equal(target.adds, 1);

    assert.equal(manager.unmount('sample'), true);
    assert.equal(manager.unmount('sample'), false);
    assert.equal(target.removes, 1);
    assert.equal(manager.state('sample'), 'unmounted');

    manager.mount('sample');
    manager.activate('sample');
    assert.equal(target.adds, 2);
    manager.dispose('sample');
    assert.equal(target.removes, 2);
    assert.equal(manager.state('sample'), 'disposed');
    assert.deepEqual(calls, ['mount', 'active', 'unmount', 'mount', 'active', 'unmount', 'dispose']);
});

test('L2: LifecycleController exposes the required four-stage state path', () => {
    const lifecycle = new LifecycleController();
    assert.equal(lifecycle.state, 'unmounted');
    lifecycle.mount();
    assert.equal(lifecycle.state, 'mounted');
    lifecycle.activate();
    assert.equal(lifecycle.state, 'active');
    lifecycle.unmount();
    assert.equal(lifecycle.state, 'unmounted');
    lifecycle.dispose();
    assert.equal(lifecycle.state, 'disposed');
});
