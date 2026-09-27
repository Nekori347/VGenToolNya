export class Clipboard {
    constructor({ gmSetClipboard, navigatorObject = globalThis.navigator, documentObject = globalThis.document } = {}) {
        this.gmSetClipboard = gmSetClipboard;
        this.navigatorObject = navigatorObject;
        this.documentObject = documentObject;
    }

    async writeText(value) {
        const text = String(value ?? '');
        if (typeof this.gmSetClipboard === 'function') {
            await this.gmSetClipboard(text, 'text');
            return;
        }
        if (typeof this.navigatorObject?.clipboard?.writeText === 'function') {
            await this.navigatorObject.clipboard.writeText(text);
            return;
        }
        this.#writeWithTextarea(text);
    }

    #writeWithTextarea(text) {
        const documentObject = this.documentObject;
        if (!documentObject?.body || typeof documentObject.execCommand !== 'function') {
            throw new Error('Clipboard is unavailable');
        }
        const textarea = documentObject.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        documentObject.body.append(textarea);
        try {
            textarea.select();
            if (!documentObject.execCommand('copy')) throw new Error('Clipboard copy was rejected');
        } finally {
            textarea.remove();
        }
    }
}
