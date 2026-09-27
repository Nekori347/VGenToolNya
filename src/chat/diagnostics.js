export class ChatDiagnostics {
    constructor({ networkHooks, maximumEvents = 1000 } = {}) {
        this.networkHooks = networkHooks;
        this.maximumEvents = maximumEvents;
        this.active = false;
        this.startedAt = null;
        this.events = [];
        this.dropped = 0;
    }

    record(event) {
        if (!this.active) return;
        if (this.events.length >= this.maximumEvents) {
            this.events.shift();
            this.dropped += 1;
        }
        this.events.push(event);
    }

    start() {
        if (this.active) return false;
        this.active = true;
        this.startedAt = new Date().toISOString();
        this.events = [];
        this.dropped = 0;
        this.networkHooks.configureDiagnostics(true);
        return true;
    }

    stop() {
        if (!this.active) return false;
        this.active = false;
        this.networkHooks.configureDiagnostics(false);
        return true;
    }

    snapshot() {
        return {
            schema: 'vgen-nya.chat-diagnostics',
            version: 1,
            active: this.active,
            startedAt: this.startedAt,
            generatedAt: new Date().toISOString(),
            dropped: this.dropped,
            privacy: { headers: false, bodies: false, tokens: false, cookies: false },
            events: this.events.slice(),
        };
    }

    dispose() {
        this.stop();
        this.events = [];
    }
}
