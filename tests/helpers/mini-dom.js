class MiniClassList {
    constructor(element) {
        this.element = element;
    }

    contains(name) {
        return this.element.className.split(/\s+/).filter(Boolean).includes(name);
    }

    add(...names) {
        const current = new Set(this.element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => current.add(name));
        this.element.className = [...current].join(' ');
    }

    remove(...names) {
        const removed = new Set(names);
        this.element.className = this.element.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' ');
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

    get isConnected() {
        let node = this;
        while (node.parentElement) node = node.parentElement;
        return node === this.ownerDocument.body;
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

    matches(selector) {
        return selector.split(',').some((part) => {
            const value = part.trim();
            if (value === '[role="dialog"]' || value === '[role=dialog]') return this.getAttribute('role') === 'dialog';
            if (value === '[role="dialog"][aria-modal="true"]') return this.getAttribute('role') === 'dialog' && this.getAttribute('aria-modal') === 'true';
            const classContains = value.match(/^([a-z]+)?\[class\*="([^"]+)"\]$/i);
            if (classContains) return (!classContains[1] || this.tagName === classContains[1].toUpperCase()) && this.className.includes(classContains[2]);
            const tagClass = value.match(/^([a-z]+)\.([A-Za-z0-9_-]+)$/i);
            if (tagClass) return this.tagName === tagClass[1].toUpperCase() && this.classList.contains(tagClass[2]);
            if (value.startsWith('.')) return this.classList.contains(value.slice(1).split('[')[0]);
            const match = value.match(/^([a-z]+)(?:\[data-([a-z-]+)(?:="([^"]+)")?\])?$/i);
            if (!match || this.tagName !== match[1].toUpperCase()) return false;
            if (!match[2]) return true;
            const key = match[2].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            return match[3] === undefined ? key in this.dataset : this.dataset[key] === match[3];
        });
    }

    querySelectorAll(selector) {
        if (selector.startsWith(':scope > ')) {
            const childSelector = selector.slice(9);
            return this.children.filter((element) => element.matches(childSelector));
        }
        return descendants(this).filter((element) => element.matches(selector));
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    contains(candidate) {
        if (candidate === this) return true;
        return this.children.some((child) => child.contains(candidate));
    }

    closest(selector) {
        let current = this;
        while (current) {
            if (current.matches(selector)) return current;
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

    createTextNode(text) {
        const node = this.createElement('#text');
        node.textContent = String(text);
        return node;
    }

    querySelectorAll(selector) {
        return [this.body, ...descendants(this.body)].filter((element) => element.matches(selector));
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    getElementById(id) {
        return [this.body, ...descendants(this.body)].find((element) => element.getAttribute('id') === id) || null;
    }
}

export function descendants(root) {
    return root.children.flatMap((child) => [child, ...descendants(child)]);
}
