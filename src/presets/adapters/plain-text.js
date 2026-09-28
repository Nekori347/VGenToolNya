function valueFromPreset(preset) {
    if (typeof preset?.value === 'string') return preset.value;
    return '';
}

export class PlainTextPresetAdapter {
    constructor({ fill } = {}) {
        this.fillTarget = fill;
    }

    serialize(payload, base = {}) {
        if (typeof payload !== 'string') throw new TypeError('Text preset content must be a string');
        return { ...base, value: payload };
    }

    deserialize(preset) { return valueFromPreset(preset); }
    preview(payload, maximum = 120) { return String(payload).replace(/\s+/g, ' ').trim().slice(0, maximum); }
    validate(payload) { return typeof payload === 'string'; }

    async fill(payload, target, options = {}) {
        if (!this.validate(payload)) throw new TypeError('Text preset content must be a string');
        if (this.fillTarget) return this.fillTarget(payload, target, options);
        if (typeof target?.fillText !== 'function') throw new TypeError('Text preset target requires fillText()');
        return target.fillText(payload, options);
    }
}
