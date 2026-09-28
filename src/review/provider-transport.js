// ProviderTransport abstracts the network layer for the Review Assistant so
// the adapter never depends on browser fetch directly.
//
//   ReviewProviderAdapter
//        ↓
//   ProviderTransport (request abstraction)
//        ↓
//   GM_xmlhttpRequest (userscript, bypasses CORS, @connect-scoped)
//        | or
//   browser fetch (fallback / tests / non-userscript environments)
//
// Both transports return a fetch-like response { ok, status, json(), text() }
// and reject with an Error whose `name` is 'AbortError' / 'TimeoutError' for
// cancellation and timeouts, so the adapter can map them to user-facing codes.

function requestError(message) {
    return Object.assign(new Error(message), { name: 'Error' });
}

function abortError() {
    return Object.assign(new Error('Provider request aborted'), { name: 'AbortError' });
}

function timeoutError() {
    return Object.assign(new Error('Provider request timed out'), { name: 'TimeoutError' });
}

function responseFromGm(response) {
    const status = Number(response?.status) || 0;
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return JSON.parse(String(response?.responseText ?? 'null'));
        },
        async text() {
            return String(response?.responseText ?? '');
        },
    };
}

export class FetchProviderTransport {
    constructor({ fetchImpl = globalThis.fetch } = {}) {
        this.fetchImpl = fetchImpl;
    }

    request(url, options) {
        if (typeof this.fetchImpl !== 'function') return Promise.reject(requestError('Fetch is unavailable'));
        return this.fetchImpl(url, options);
    }
}

export class GMProviderTransport {
    constructor({ gmRequest } = {}) {
        if (typeof gmRequest !== 'function') throw new TypeError('GMProviderTransport requires GM_xmlhttpRequest');
        this.gmRequest = gmRequest;
    }

    request(url, options = {}) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const settle = (fn, value) => { if (settled) return; settled = true; fn(value); };
            const request = this.gmRequest({
                method: options.method || 'POST',
                url,
                headers: options.headers || {},
                data: options.body,
                onload: (response) => settle(resolve, responseFromGm(response)),
                onerror: (error) => settle(reject, requestError(`Provider request failed: ${String(error?.error || error || 'network error')}`)),
                ontimeout: () => settle(reject, timeoutError()),
                onabort: () => settle(reject, abortError()),
            });
            const signal = options.signal;
            const abort = () => request?.abort?.();
            if (signal?.aborted) abort();
            else if (signal) signal.addEventListener?.('abort', abort, { once: true });
        });
    }
}

// Chooses the userscript cross-origin transport when available and otherwise
// falls back to browser fetch. The GM path is scoped by the @connect policy to
// the user-configured Provider Base URL; it never uses page or model input to
// pick the request target.
export function createProviderTransport({ gm = globalThis, fetchImpl = globalThis.fetch } = {}) {
    const gmRequest = gm?.GM_xmlhttpRequest;
    if (typeof gmRequest === 'function') return new GMProviderTransport({ gmRequest });
    return new FetchProviderTransport({ fetchImpl });
}
