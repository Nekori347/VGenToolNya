function reactHandler(element, name) {
    let node = element;
    for (let nodeDepth = 0; node && nodeDepth < 6; nodeDepth += 1, node = node.parentElement) {
        const propsKey = Object.getOwnPropertyNames(node).find((key) => key.startsWith('__reactProps$'));
        const handler = propsKey ? node[propsKey]?.[name] : null;
        if (typeof handler === 'function') return handler;
    }
    return null;
}

function nativeValueSetter(element) {
    let prototype = element;
    while (prototype) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        if (typeof descriptor?.set === 'function') return descriptor.set;
        prototype = Object.getPrototypeOf(prototype);
    }
    return null;
}

export class NativeTextTarget {
    constructor(element) {
        if (!element) throw new TypeError('Native text target requires an element');
        this.element = element;
    }

    read() {
        return typeof this.element.value === 'string' ? this.element.value : String(this.element.textContent || '');
    }

    async fillText(text, { replace = false } = {}) {
        const value = String(text ?? '');
        const current = this.read();
        if (current && current !== value && !replace) return { status: 'requires-confirmation', current };
        const handler = reactHandler(this.element, 'onChange') || reactHandler(this.element, 'onInput');
        if ('value' in this.element) {
            const setter = nativeValueSetter(this.element);
            if (setter) setter.call(this.element, value);
            else this.element.value = value;
        } else this.element.textContent = value;
        const view = this.element.ownerDocument?.defaultView || globalThis;
        const EventClass = view.Event || globalThis.Event;
        if (handler) await handler({ target: this.element, currentTarget: this.element, type: 'change' });
        else this.element.dispatchEvent?.(new EventClass('input', { bubbles: true }));
        return { status: 'filled', value };
    }
}
