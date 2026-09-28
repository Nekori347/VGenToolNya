import { PlainTextPresetAdapter } from './plain-text.js';

export class ChatQuickReplyPresetAdapter extends PlainTextPresetAdapter {
    constructor() {
        super({ fill: (payload, target, options) => target.fillComposer(payload, options) });
    }
}
