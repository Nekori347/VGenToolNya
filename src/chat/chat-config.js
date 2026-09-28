import { cloneStorageValue, isPlainObject } from '../core/value-utils.js';
import { CONFIG_KEYS, readCompatibleConfig } from '../migration/legacy-migration.js';

export const CHAT_DEFAULTS = Object.freeze({
    enabled: true,
    keepUnread: false,
    reactionMarkRead: false,
    showSeen: true,
    showTimestamps: true,
    showStatusBar: true,
    compactReactions: true,
});

export const CLIENTS_DEFAULTS = Object.freeze({
    enabled: true,
    minHeight: 220,
    rowHeight: 52,
    collapsed: false,
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const string = (value, maximum = Infinity) => typeof value === 'string' ? value.slice(0, maximum) : '';

export function normalizeChatSettings(value = {}) {
    const raw = isPlainObject(value) ? value : {};
    return {
        ...cloneStorageValue(raw),
        enabled: raw.enabled !== false,
        keepUnread: Boolean(raw.keepUnread),
        reactionMarkRead: Boolean(raw.reactionMarkRead),
        showSeen: raw.showSeen !== false,
        showTimestamps: raw.showTimestamps !== false,
        showStatusBar: raw.showStatusBar !== false,
        compactReactions: raw.compactReactions !== false,
    };
}

export function normalizeClientsSettings(value = {}) {
    const raw = isPlainObject(value) ? value : {};
    return {
        ...cloneStorageValue(raw),
        enabled: raw.enabled !== false,
        minHeight: clamp(Number(raw.minHeight) || CLIENTS_DEFAULTS.minHeight, 120, 520),
        rowHeight: clamp(Number(raw.rowHeight) || CLIENTS_DEFAULTS.rowHeight, 42, 88),
        collapsed: Boolean(raw.collapsed),
    };
}

export function normalizeClient(item, index = 0) {
    if (!isPlainObject(item)) throw new TypeError(`Frequent Client ${index + 1} must be an object`);
    const username = string(item.username).trim().replace(/^@/, '');
    if (!username) throw new TypeError(`Frequent Client ${index + 1} requires username`);
    return {
        ...cloneStorageValue(item),
        id: string(item.id) || `client-${index + 1}`,
        username,
        url: string(item.url) || `https://vgen.co/${encodeURIComponent(username)}`,
        note: string(item.note, 80),
        userID: string(item.userID),
        displayName: string(item.displayName),
        avatarURL: string(item.avatarURL),
        bannerURL: string(item.bannerURL),
        announcementMessage: string(item.announcementMessage, 500),
        announcementModified: string(item.announcementModified),
        lastServiceUpdate: string(item.lastServiceUpdate),
        lastPortfolioUpdate: string(item.lastPortfolioUpdate),
        serviceFetchFailed: Boolean(item.serviceFetchFailed),
        portfolioFetchFailed: Boolean(item.portfolioFetchFailed),
        profileFetchedAt: Number(item.profileFetchedAt) || 0,
        createdAt: Number(item.createdAt) || Date.now(),
    };
}

export function normalizeClients(value = []) {
    if (!Array.isArray(value)) throw new TypeError('Frequent Clients must be an array');
    const seen = new Set();
    const result = [];
    value.forEach((item, index) => {
        const client = normalizeClient(item, index);
        const key = client.username.toLocaleLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(client);
    });
    return result;
}

export class ChatConfigRepository {
    constructor(store) {
        this.store = store;
        this.listeners = new Set();
    }

    read() {
        return {
            chatSettings: normalizeChatSettings(readCompatibleConfig(this.store, CONFIG_KEYS.chatSettings, CHAT_DEFAULTS).value),
            clientsSettings: normalizeClientsSettings(readCompatibleConfig(this.store, CONFIG_KEYS.clientsSettings, CLIENTS_DEFAULTS).value),
            clients: normalizeClients(readCompatibleConfig(this.store, CONFIG_KEYS.clients, []).value),
        };
    }

    writeChatSettings(value) {
        return this.#write(CONFIG_KEYS.chatSettings, normalizeChatSettings(value), 'chat-settings');
    }

    writeClientsSettings(value) {
        return this.#write(CONFIG_KEYS.clientsSettings, normalizeClientsSettings(value), 'clients-settings');
    }

    writeClients(value) {
        return this.#write(CONFIG_KEYS.clients, normalizeClients(value), 'clients');
    }

    reorderClient(from, to) {
        const clients = this.read().clients;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= clients.length || to >= clients.length) {
            throw new RangeError('Invalid Frequent Client order');
        }
        const [client] = clients.splice(from, 1);
        clients.splice(to, 0, client);
        return this.writeClients(clients);
    }

    removeClient(id) {
        return this.writeClients(this.read().clients.filter((client) => client.id !== id));
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    #write(key, value, domain) {
        const stored = this.store.writeVerified(key, value, (candidate) => key === CONFIG_KEYS.clients ? Array.isArray(candidate) : isPlainObject(candidate));
        for (const listener of this.listeners) listener({ domain, value: cloneStorageValue(stored) });
        return stored;
    }
}
