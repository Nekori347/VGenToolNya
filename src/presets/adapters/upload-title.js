import { PlainTextPresetAdapter } from './plain-text.js';

export class UploadTitlePresetAdapter extends PlainTextPresetAdapter {
    constructor() {
        super({ fill: (payload, target) => target.applyText('title', payload) });
    }

    deserialize(preset) {
        return typeof preset?.value === 'string' ? preset.value : String(preset?.title || '');
    }
}
