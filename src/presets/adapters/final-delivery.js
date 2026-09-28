import { PlainTextPresetAdapter } from './plain-text.js';

export class FinalDeliveryPresetAdapter extends PlainTextPresetAdapter {
    constructor() {
        super({ fill: (payload, target, options) => target.fillFinalDelivery(payload, options) });
    }
}
