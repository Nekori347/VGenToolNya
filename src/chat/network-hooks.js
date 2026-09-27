import { classifyStreamRequest } from './read-gate.js';

async function responseJSON(response) {
    try { return await response?.clone?.().json?.(); } catch { return null; }
}

export class ChatNetworkHooks {
    constructor({ windowObject = globalThis, readGate, onDiagnosticEvent = () => {} } = {}) {
        this.window = windowObject;
        this.readGate = readGate;
        this.onDiagnosticEvent = onDiagnosticEvent;
        this.readEnabled = false;
        this.diagnosticsEnabled = false;
        this.httpNatives = null;
        this.realtimeNatives = null;
        this.xhrMeta = new WeakMap();
    }

    configureRead(enabled) {
        this.readEnabled = Boolean(enabled);
        this.#sync();
    }

    configureDiagnostics(enabled) {
        this.diagnosticsEnabled = Boolean(enabled);
        this.#sync();
    }

    #sync() {
        if (this.readEnabled || this.diagnosticsEnabled) this.#installHTTP();
        else this.#restoreHTTP();
        if (this.diagnosticsEnabled) this.#installRealtime();
        else this.#restoreRealtime();
    }

    #installHTTP() {
        if (this.httpNatives) return;
        const windowObject = this.window;
        const nativeFetch = windowObject.fetch;
        const XHR = windowObject.XMLHttpRequest;
        this.httpNatives = {
            fetch: nativeFetch,
            XHR,
            open: XHR?.prototype?.open,
            send: XHR?.prototype?.send,
            abort: XHR?.prototype?.abort,
        };
        if (typeof nativeFetch === 'function') {
            const runtime = this;
            windowObject.fetch = function vgenNyaFetch(input, init = {}) {
                const rawURL = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
                const method = init.method || input?.method || 'GET';
                const classification = classifyStreamRequest(method, rawURL, windowObject.location?.href);
                if (classification.kind === 'reaction' && !classification.cid) classification.cid = runtime.readGate?.channelForMessage(classification.messageId);
                const boundary = classification.kind === 'reaction' ? runtime.readGate?.latest.get(classification.cid)?.id : null;
                const perform = (reason = 'native') => {
                    runtime.#event('http.request', { method: String(method).toUpperCase(), kind: classification.kind, cid: classification.cid, reason });
                    const result = nativeFetch.apply(this, arguments);
                    Promise.resolve(result).then(async (response) => {
                        const raw = await responseJSON(response);
                        runtime.#finish(classification, response?.ok, raw, boundary);
                        runtime.#event('http.response', { status: response?.status, kind: classification.kind, cid: classification.cid });
                    }, (error) => runtime.#event('http.error', { kind: classification.kind, name: error?.name || 'Error' }));
                    return result;
                };
                if (runtime.readEnabled && classification.kind === 'read') {
                    return runtime.readGate.interceptRead({ cid: classification.cid, body: init.body, perform });
                }
                return perform();
            };
            Object.setPrototypeOf(windowObject.fetch, nativeFetch);
        }
        if (XHR?.prototype && typeof this.httpNatives.open === 'function' && typeof this.httpNatives.send === 'function') {
            const runtime = this;
            XHR.prototype.open = function vgenNyaOpen(method, url) {
                runtime.xhrMeta.set(this, { method, url });
                return runtime.httpNatives.open.apply(this, arguments);
            };
            XHR.prototype.send = function vgenNyaSend(body) {
                const xhr = this;
                const meta = runtime.xhrMeta.get(xhr) || {};
                const classification = classifyStreamRequest(meta.method, meta.url, windowObject.location?.href);
                if (classification.kind === 'reaction' && !classification.cid) classification.cid = runtime.readGate?.channelForMessage(classification.messageId);
                const boundary = classification.kind === 'reaction' ? runtime.readGate?.latest.get(classification.cid)?.id : null;
                const perform = (reason = 'native') => {
                    runtime.#event('http.request', { method: String(meta.method || 'GET').toUpperCase(), kind: classification.kind, cid: classification.cid, reason });
                    const onLoad = () => {
                        let raw = null;
                        try { raw = xhr.responseType === 'json' ? xhr.response : JSON.parse(xhr.responseText || 'null'); } catch { /* metadata only */ }
                        runtime.#finish(classification, xhr.status >= 200 && xhr.status < 300, raw, boundary);
                        runtime.#event('http.response', { status: xhr.status, kind: classification.kind, cid: classification.cid });
                        xhr.removeEventListener?.('load', onLoad);
                    };
                    xhr.addEventListener?.('load', onLoad);
                    return runtime.httpNatives.send.call(xhr, body);
                };
                if (runtime.readEnabled && classification.kind === 'read') {
                    void runtime.readGate.interceptRead({
                        cid: classification.cid,
                        body,
                        perform,
                        cancel: () => runtime.httpNatives.abort?.call(xhr),
                    }).catch(() => {});
                    return undefined;
                }
                return perform();
            };
        }
    }

    #finish(classification, ok, raw, boundary) {
        if (!ok || !this.readGate) return;
        if (classification.kind === 'message') {
            const message = raw?.message || raw?.event?.message;
            if (message?.id) this.readGate.confirmReply(classification.cid, message);
        }
        if (classification.kind === 'reaction') this.readGate.confirmReaction(classification.cid, boundary);
        if (classification.kind === 'read') this.readGate.confirmServerRead(classification.cid);
    }

    #restoreHTTP() {
        if (!this.httpNatives) return;
        const { fetch, XHR, open, send, abort } = this.httpNatives;
        if (fetch) this.window.fetch = fetch;
        if (XHR?.prototype) {
            if (open) XHR.prototype.open = open;
            if (send) XHR.prototype.send = send;
            if (abort) XHR.prototype.abort = abort;
        }
        this.httpNatives = null;
        this.xhrMeta = new WeakMap();
    }

    #installRealtime() {
        if (this.realtimeNatives) return;
        const NativeWebSocket = this.window.WebSocket;
        const NativeEventSource = this.window.EventSource;
        this.realtimeNatives = { WebSocket: NativeWebSocket, EventSource: NativeEventSource };
        const runtime = this;
        if (typeof NativeWebSocket === 'function') {
            function DiagnosticWebSocket(url, protocols) {
                const socket = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
                socket.addEventListener?.('open', () => runtime.#event('websocket.connect', {}));
                socket.addEventListener?.('close', (event) => runtime.#event('websocket.disconnect', { code: event.code }));
                socket.addEventListener?.('message', () => runtime.#event('websocket.message', {}));
                return socket;
            }
            DiagnosticWebSocket.prototype = NativeWebSocket.prototype;
            Object.setPrototypeOf(DiagnosticWebSocket, NativeWebSocket);
            for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
                if (key in NativeWebSocket) Object.defineProperty(DiagnosticWebSocket, key, { value: NativeWebSocket[key] });
            }
            this.window.WebSocket = DiagnosticWebSocket;
        }
        if (typeof NativeEventSource === 'function') {
            function DiagnosticEventSource(url, options) {
                const source = new NativeEventSource(url, options);
                source.addEventListener?.('open', () => runtime.#event('sse.connect', {}));
                source.addEventListener?.('error', () => runtime.#event('sse.error', {}));
                return source;
            }
            DiagnosticEventSource.prototype = NativeEventSource.prototype;
            Object.setPrototypeOf(DiagnosticEventSource, NativeEventSource);
            this.window.EventSource = DiagnosticEventSource;
        }
    }

    #restoreRealtime() {
        if (!this.realtimeNatives) return;
        if (this.realtimeNatives.WebSocket) this.window.WebSocket = this.realtimeNatives.WebSocket;
        if (this.realtimeNatives.EventSource) this.window.EventSource = this.realtimeNatives.EventSource;
        this.realtimeNatives = null;
    }

    #event(type, data) {
        if (this.diagnosticsEnabled) this.onDiagnosticEvent({ type, at: new Date().toISOString(), ...data });
    }

    dispose() {
        this.readEnabled = false;
        this.diagnosticsEnabled = false;
        this.#restoreRealtime();
        this.#restoreHTTP();
        this.readGate?.cancelAll('network-hooks-disposed');
    }
}
