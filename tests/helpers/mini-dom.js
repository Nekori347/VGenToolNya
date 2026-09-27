class MiniClassList {
    constructor(element) {
        this.element = element;
    }

    contains(name) {
        return this.element.className.split(/\s+/).filter(Boolean).includes(name);
    }
}

export class MiniElement extends EventTarget {
    constructor(ownerDocument, tagName) {
        super();
        this.ownerDocument = ownerDocument;
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.attributes = new Map();
        this.className = '';
        this.textContent = '';
        this.hidden = false;
        this.style = {};
        this.listenerAdds = new Map();
        this.listenerRemoves = new Map();
        this.classList = new MiniClassList(this);
    }

    append(...nodes) {
        for (const node of nodes) {
            node.parentElement = this;
            this.children.push(node);
        }
    }

    appendChild(node) {
        this.append(node);
        return node;
    }

    replaceChildren(...nodes) {
        for (const child of this.children) child.parentElement = null;
        this.children = [];
        this.append(...nodes);
    }

    remove() {
        if (!this.parentElement) return;
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
        this.parentElement = null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    contains(candidate) {
        if (candidate === this) return true;
        return this.children.some((child) => child.contains(candidate));
    }

    closest(selector) {
        if (selector !== 'button[data-action]') return null;
        let current = this;
        while (current) {
            if (current.tagName === 'BUTTON' && current.dataset.action) return current;
            current = current.parentElement;
        }
        return null;
    }

    click() {
        this.dispatchEvent(new Event('click'));
    }

    addEventListener(type, listener, options) {
        this.listenerAdds.set(type, (this.listenerAdds.get(type) || 0) + 1);
        super.addEventListener(type, listener, options);
    }

    removeEventListener(type, listener, options) {
        this.listenerRemoves.set(type, (this.listenerRemoves.get(type) || 0) + 1);
        super.removeEventListener(type, listener, options);
    }
}

export class MiniDocument {
    constructor() {
        this.body = this.createElement('body');
    }

    createElement(tagName) {
        return new MiniElement(this, tagName);
    }

    getElementById(id) {
        return [this.body, ...descendants(this.body)].find((element) => element.getAttribute('id') === id) || null;
    }
}

export function descendants(root) {
    return root.children.flatMap((child) => [child, ...descendants(child)]);
}
