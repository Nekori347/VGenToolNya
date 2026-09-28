import { isReviewProviderConfigured } from './review-config.js';

export const REVIEW_PROVIDER_ERRORS = Object.freeze({
    notConfigured: 'PROVIDER_NOT_CONFIGURED',
    network: 'NETWORK_ERROR',
    timeout: 'TIMEOUT',
    aborted: 'ABORTED',
    auth: 'AUTH_ERROR',
    rateLimit: 'RATE_LIMIT',
    http: 'HTTP_ERROR',
    invalidJson: 'INVALID_JSON',
    malformed: 'MALFORMED_OUTPUT',
});

export class ReviewProviderError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'ReviewProviderError';
        this.code = code;
        this.details = details;
    }
}

const LENGTH_GUIDE = Object.freeze({
    Short: 'one to two sentences',
    Medium: 'a short paragraph (three to four sentences)',
    Long: 'a detailed paragraph (five or more sentences)',
});

const STAR_DEGREE_GUIDE = Object.freeze({
    1: 'mildly critical but respectful, constructive and fair',
    2: 'slightly critical, noting minor issues fairly',
    3: 'neutral and balanced, mixed feedback',
    4: 'positive and appreciative',
    5: 'strongly positive and enthusiastic',
});

export function buildChatCompletionsUrl(baseUrl) {
    const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
    return base ? `${base}/chat/completions` : '';
}

export function buildReviewUserPrompt({ keywords = [], length = 'Medium', starDegree = 3, distinctFromRecent = false } = {}) {
    const lines = [
        'Write a commission review with these parameters:',
        `- Length: ${length} (${LENGTH_GUIDE[length] || LENGTH_GUIDE.Medium})`,
        `- Sentiment degree: ${starDegree} of 5 (${STAR_DEGREE_GUIDE[starDegree] || STAR_DEGREE_GUIDE[3]})`,
    ];
    const list = Array.isArray(keywords) ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean) : [];
    if (list.length) lines.push(`- Keywords/notes to incorporate: ${list.join(', ')}`);
    if (distinctFromRecent) lines.push('- Phrase this differently from any wording you have produced before for this session.');
    lines.push('Return only the JSON object {"english": "...", "chinese": "..."}.');
    return lines.join('\n');
}

function stripCodeFence(text) {
    const trimmed = String(text ?? '').trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : trimmed;
}

export function parseReviewPayload(content) {
    const text = stripCodeFence(content);
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        return { ok: false, code: REVIEW_PROVIDER_ERRORS.invalidJson, reason: 'invalid-json' };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, code: REVIEW_PROVIDER_ERRORS.malformed, reason: 'not-an-object' };
    }
    const english = typeof value.english === 'string' ? value.english.trim() : '';
    const chinese = typeof value.chinese === 'string' ? value.chinese.trim() : '';
    if (!english) return { ok: false, code: REVIEW_PROVIDER_ERRORS.malformed, reason: 'missing-english' };
    if (!chinese) return { ok: false, code: REVIEW_PROVIDER_ERRORS.malformed, reason: 'missing-chinese' };
    return { ok: true, english, chinese };
}

function errorFromStatus(status) {
    if (status === 401 || status === 403) return REVIEW_PROVIDER_ERRORS.auth;
    if (status === 429) return REVIEW_PROVIDER_ERRORS.rateLimit;
    if (status >= 500) return REVIEW_PROVIDER_ERRORS.http;
    return REVIEW_PROVIDER_ERRORS.http;
}

export class ReviewProviderAdapter {
    constructor({ fetchImpl = globalThis.fetch, AbortControllerClass = globalThis.AbortController, timeoutMs = 30000, now = () => Date.now() } = {}) {
        this.fetchImpl = fetchImpl;
        this.AbortControllerClass = AbortControllerClass;
        this.timeoutMs = timeoutMs;
        this.now = now;
    }

    async generate({ config, keywords = [], length = 'Medium', starDegree = 3, distinctFromRecent = false, signal } = {}) {
        if (!config || !isReviewProviderConfigured(config)) {
            throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.notConfigured, 'Provider not configured');
        }
        const url = buildChatCompletionsUrl(config.baseUrl);
        if (!url) throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.notConfigured, 'Provider base URL is invalid');
        if (typeof this.fetchImpl !== 'function') {
            throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.network, 'Fetch is unavailable');
        }
        const body = {
            model: config.model,
            messages: [
                { role: 'system', content: config.systemPrompt },
                { role: 'user', content: buildReviewUserPrompt({ keywords, length, starDegree, distinctFromRecent }) },
            ],
            temperature: 0.9,
            response_format: { type: 'json_object' },
        };
        const response = await this.#fetchJson(url, config, body, signal);
        const content = response?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.malformed, 'Provider returned no message content');
        }
        const parsed = parseReviewPayload(content);
        if (!parsed.ok) {
            throw new ReviewProviderError(parsed.code, `Provider output was not a valid review (${parsed.reason})`, { reason: parsed.reason });
        }
        return { english: parsed.english, chinese: parsed.chinese };
    }

    async #fetchJson(url, config, body, signal) {
        const controller = this.AbortControllerClass ? new this.AbortControllerClass() : null;
        const onAbort = () => controller?.abort(signal?.reason ?? 'review-generation-cancelled');
        if (signal?.aborted) controller?.abort(signal.reason);
        else if (signal) signal.addEventListener?.('abort', onAbort, { once: true });
        const timer = typeof setTimeout === 'function' ? setTimeout(() => controller?.abort('timeout'), this.timeoutMs) : null;
        let response;
        try {
            response = await this.fetchImpl(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller?.signal,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
                throw new ReviewProviderError(
                    signal?.aborted ? REVIEW_PROVIDER_ERRORS.aborted : REVIEW_PROVIDER_ERRORS.timeout,
                    signal?.aborted ? 'Generation was cancelled' : 'Provider request timed out',
                );
            }
            throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.network, 'Provider request failed', { cause: String(error?.message || error) });
        } finally {
            if (timer !== null) clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
        }
        if (!response?.ok) {
            const status = Number(response.status) || 0;
            throw new ReviewProviderError(errorFromStatus(status), `Provider request failed (HTTP ${status})`, { status });
        }
        try {
            return await response.json();
        } catch {
            throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.malformed, 'Provider returned an invalid JSON body');
        }
    }
}
