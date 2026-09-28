import { cloneStorageValue, isPlainObject } from '../core/value-utils.js';
import { CONFIG_KEYS } from '../migration/legacy-migration.js';
import { DEFAULT_SYSTEM_PROMPT } from './default-system-prompt.js';

export { DEFAULT_SYSTEM_PROMPT };

export const REVIEW_LENGTHS = Object.freeze(['Short', 'Medium', 'Long']);
export const REVIEW_STAR_DEGREES = Object.freeze([1, 2, 3, 4, 5]);

export const DEFAULT_REVIEW_PROVIDER = Object.freeze({
    baseUrl: '',
    apiKey: '',
    model: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
});

export const DEFAULT_REVIEW_SETTINGS = Object.freeze({
    defaultLength: 'Medium',
    defaultStarDegree: 3,
});

const string = (value, maximum = Infinity) => (typeof value === 'string' ? value.slice(0, maximum) : '');
const clampDegree = (value) => {
    const degree = Number(value);
    return Number.isInteger(degree) && degree >= 1 && degree <= 5 ? degree : DEFAULT_REVIEW_SETTINGS.defaultStarDegree;
};

export function normalizeReviewProviderConfig(value = {}) {
    const source = isPlainObject(value) ? value : {};
    return {
        baseUrl: string(source.baseUrl, 2048).trim(),
        apiKey: string(source.apiKey, 4096).trim(),
        model: string(source.model, 512).trim(),
        systemPrompt: string(source.systemPrompt, 16000).trim() || DEFAULT_SYSTEM_PROMPT,
    };
}

export function normalizeReviewSettings(value = {}) {
    const source = isPlainObject(value) ? value : {};
    const defaultLength = REVIEW_LENGTHS.includes(source.defaultLength) ? source.defaultLength : DEFAULT_REVIEW_SETTINGS.defaultLength;
    return {
        defaultLength,
        defaultStarDegree: clampDegree(source.defaultStarDegree),
    };
}

export function isReviewProviderConfigured(provider) {
    return Boolean(provider?.baseUrl && provider?.apiKey && provider?.model);
}

// The API key is only ever displayed masked. The full key is stored locally in
// the config store and used only when a request is built; it is never logged.
export function maskApiKey(apiKey) {
    const key = String(apiKey ?? '');
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export class ReviewConfigRepository {
    constructor(store) {
        this.store = store;
        this.listeners = new Set();
    }

    read() {
        return {
            provider: normalizeReviewProviderConfig(this.store.read(CONFIG_KEYS.reviewProvider, DEFAULT_REVIEW_PROVIDER)),
            settings: normalizeReviewSettings(this.store.read(CONFIG_KEYS.reviewSettings, DEFAULT_REVIEW_SETTINGS)),
        };
    }

    writeProvider(value) {
        return this.#write(CONFIG_KEYS.reviewProvider, normalizeReviewProviderConfig(value), 'review-provider');
    }

    writeSettings(value) {
        return this.#write(CONFIG_KEYS.reviewSettings, normalizeReviewSettings(value), 'review-settings');
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    #write(key, value, domain) {
        const stored = this.store.writeVerified(key, value, isPlainObject);
        for (const listener of this.listeners) listener({ domain, value: cloneStorageValue(stored) });
        return stored;
    }
}
