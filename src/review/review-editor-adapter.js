import { NativeTextTarget } from '../presets/native-text-target.js';

// A verified write target for one native review editor. It reuses the same
// fill-only contract as the Text Preset Engine: fill never submits.
export class ReviewEditorTarget {
    constructor(element) {
        if (!element) throw new TypeError('Review editor target requires an element');
        this.element = element;
        this.native = new NativeTextTarget(element);
    }

    read() {
        return this.native.read();
    }

    async fill(text, { replace = false } = {}) {
        return this.native.fillText(text, { replace });
    }
}

// Default heuristic detector. This is a fixture/synthetic-surface convenience
// only: REVIEW-LIVE-01 has not verified the real VGen review editor, so this
// detector must never be trusted against the live site until it is re-verified.
export function defaultReviewEditorDetect(root) {
    if (!root?.querySelectorAll) return null;
    if (root.matches?.('textarea')) return root;
    const textarea = root.querySelector('textarea');
    if (textarea) return textarea;
    const editable = root.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
    if (editable) return editable;
    return null;
}

export class ReviewEditorAdapter {
    constructor({ detect = defaultReviewEditorDetect } = {}) {
        this.detect = detect;
    }

    resolve(root) {
        const element = this.detect(root);
        return element ? new ReviewEditorTarget(element) : null;
    }
}
