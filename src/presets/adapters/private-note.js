import { PlainTextPresetAdapter } from './plain-text.js';

export class PrivateNotePresetAdapter extends PlainTextPresetAdapter {
    constructor() {
        super({ fill: (payload, target, options) => target.fillPrivateNote(payload, options) });
    }
}
