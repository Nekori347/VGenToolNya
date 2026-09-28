function textFromSlate(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(textFromSlate).join('');
    if (value && typeof value === 'object') {
        if (typeof value.text === 'string') return value.text;
        return Object.values(value).map(textFromSlate).join('');
    }
    return '';
}

export class UploadDescriptionPresetAdapter {
    serialize(payload, base = {}) {
        this.#parse(payload);
        return { ...base, value: payload };
    }

    deserialize(preset) {
        const payload = typeof preset?.value === 'string' ? preset.value : String(preset?.description || '');
        this.#parse(payload);
        return payload;
    }

    preview(payload, maximum = 120) {
        return textFromSlate(this.#parse(payload)).replace(/\s+/g, ' ').trim().slice(0, maximum);
    }

    validate(payload) {
        try { this.#parse(payload); return true; } catch { return false; }
    }

    async fill(payload, target) {
        this.#parse(payload);
        if (typeof target?.applyText !== 'function') throw new TypeError('Description target requires applyText()');
        return target.applyText('description', payload);
    }

    #parse(payload) {
        if (typeof payload !== 'string') throw new TypeError('Description preset must preserve serialized Slate JSON');
        let value;
        try { value = JSON.parse(payload); } catch (error) { throw new TypeError('Description preset contains invalid Slate JSON', { cause: error }); }
        if (!Array.isArray(value)) throw new TypeError('Description preset Slate root must be an array');
        return value;
    }
}
