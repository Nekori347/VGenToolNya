const OVERLAY_SELECTOR = '[class*="ChatLauncher__OuterContainer"], [class*="ExpandedNavOverlay__Overlay"], .str-chat';
const MESSAGE_SELECTOR = '.str-chat__message, .str-chat__message-simple';
const PREVIEW_SELECTOR = '.str-chat__channel-preview, [data-testid*="channel-preview"], [class*="ChatChannelListPreview"]';

function ownReactValue(element, prefix) {
    const key = Object.getOwnPropertyNames(element || {}).find((name) => name.startsWith(prefix));
    return key ? element[key] : null;
}

function reactValue(element, wanted) {
    let node = element;
    for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1, node = node.parentElement) {
        let fiber = ownReactValue(node, '__reactFiber$') || ownReactValue(node, '__reactInternalInstance$');
        const direct = ownReactValue(node, '__reactProps$');
        if (direct?.[wanted] !== undefined) return direct[wanted];
        for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
            for (const candidate of fiber.alternate ? [fiber, fiber.alternate] : [fiber]) {
                const value = candidate.memoizedProps?.[wanted] ?? candidate.pendingProps?.[wanted];
                if (value !== undefined) return value;
            }
        }
    }
    return null;
}

function channelCid(channel) {
    return channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null);
}

function messageTime(message) {
    const value = message?.created_at || message?.createdAt;
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : null;
}

function readStatus(channel, message) {
    const client = channel?.getClient?.() || channel?._client || channel?.client;
    const selfId = client?.userID || client?.user?.id;
    const senderId = message?.user?.id || message?.user_id;
    const createdAt = messageTime(message);
    if (!selfId || !senderId || createdAt === null) return { direction: 'unknown', status: 'unknown' };
    const reads = Object.values(channel?.state?.read || {});
    const reached = (entry) => {
        if (entry?.last_read_message_id === message.id) return true;
        const lastRead = Date.parse(entry?.last_read || entry?.last_read_at || '');
        return Number.isFinite(lastRead) && lastRead >= createdAt;
    };
    if (senderId !== selfId) {
        const own = reads.find((entry) => (entry.user?.id || entry.user_id) === selfId);
        return { direction: 'incoming', status: reached(own) ? 'read' : 'unread' };
    }
    const seen = reads.some((entry) => (entry.user?.id || entry.user_id) !== selfId && reached(entry));
    return { direction: 'outgoing', status: seen ? 'read' : 'unread' };
}

function messageFromElement(element, channel) {
    let message = reactValue(element, 'message');
    if (message?.id) return message;
    const id = element.getAttribute?.('data-message-id') || element.id;
    if (id) message = channel?.state?.messages?.find?.((item) => item.id === id);
    return message?.id ? message : null;
}

function memberIds(channel) {
    const members = channel?.state?.members || channel?.data?.members || {};
    return Array.isArray(members)
        ? members.map((item) => item.user?.id || item.user_id || item.id).filter(Boolean)
        : Object.keys(members);
}

function findChatTrigger(documentObject) {
    const icons = documentObject.querySelectorAll?.('svg.chatIcon, [class*="chatIcon"]') || [];
    for (const icon of icons) {
        const button = icon.closest?.('button, [role="button"]');
        if (button) return button;
    }
    return null;
}

function waitForOverlay(documentObject, MutationObserverClass, timeout = 8000) {
    const existing = documentObject.querySelector?.(OVERLAY_SELECTOR);
    if (existing) return Promise.resolve(existing);
    if (!MutationObserverClass || !documentObject.body) return Promise.reject(new Error('messages-overlay-unavailable'));
    return new Promise((resolve, reject) => {
        const probes = new Map();
        const releaseProbes = () => {
            for (const observer of probes.values()) observer.disconnect();
            probes.clear();
        };
        const probe = (root) => {
            if (!root?.querySelector || probes.has(root)) return;
            const likelyPortal = root.matches?.('.ReactModalPortal, [data-radix-portal], [data-portal]')
                || root.querySelector?.('.ReactModalPortal, [data-radix-portal], [data-portal]');
            if (!likelyPortal) return;
            const local = new MutationObserverClass(() => {
                const overlay = root.matches?.(OVERLAY_SELECTOR) ? root : root.querySelector?.(OVERLAY_SELECTOR);
                if (overlay) finish(resolve, overlay);
            });
            local.observe(root, { childList: true, subtree: true });
            probes.set(root, local);
        };
        const observer = new MutationObserverClass((records) => {
            const overlay = documentObject.querySelector?.(OVERLAY_SELECTOR);
            if (overlay) finish(resolve, overlay);
            else for (const record of records || []) for (const node of record.addedNodes || []) probe(node);
        });
        const timer = globalThis.setTimeout(() => finish(reject, new Error('messages-overlay-timeout')), timeout);
        const finish = (callback, value) => {
            observer.disconnect();
            releaseProbes();
            globalThis.clearTimeout(timer);
            callback(value);
        };
        observer.observe(documentObject.body, { childList: true });
        for (const root of documentObject.querySelectorAll?.('.ReactModalPortal, [data-radix-portal], [data-portal]') || []) probe(root);
    });
}

export class StreamChatAdapter {
    static overlaySelector = OVERLAY_SELECTOR;

    constructor(surface, { documentObject = surface?.ownerDocument || globalThis.document, MutationObserverClass = globalThis.MutationObserver } = {}) {
        this.surface = surface;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
    }

    findChannel() {
        const roots = [this.surface, ...(this.surface?.querySelectorAll?.('.str-chat__channel, .str-chat, [class*="channelContainer"]') || [])];
        for (const root of roots.slice(0, 60)) {
            const channel = reactValue(root, 'channel');
            if (channel && channelCid(channel)) return channel;
        }
        return null;
    }

    conversationId() {
        return channelCid(this.findChannel());
    }

    refresh({ settings, readGate, onManualRead } = {}) {
        const channel = this.findChannel();
        const cid = channelCid(channel);
        if (!channel || !cid) return { cid: null, messages: 0 };
        const messages = this.surface.querySelectorAll?.(MESSAGE_SELECTOR) || [];
        let decorated = 0;
        for (const element of [...messages].slice(-500)) {
            const message = messageFromElement(element, channel);
            if (!message) continue;
            readGate?.observeLatest(cid, message);
            this.#decorateMessage(element, channel, message, settings, () => onManualRead?.(cid, channel));
            decorated += 1;
        }
        this.#decorateReactions(settings);
        this.#markLatestActions();
        return { cid, messages: decorated };
    }

    #decorateMessage(element, channel, message, settings, manualRead) {
        const bubble = element.querySelector?.('.str-chat__message-bubble') || element;
        const group = bubble.closest?.('.str-chat__message-bubble-group') || bubble.parentElement || element;
        const state = readStatus(channel, message);
        const signature = JSON.stringify([message.id, message.created_at, state.direction, state.status, settings.keepUnread, settings.showSeen, settings.showTimestamps]);
        if (element.dataset.vgenNyaChatSignature === signature) return;
        element.dataset.vgenNyaChatSignature = signature;
        let row = group.querySelector?.(':scope > .vgen-nya-chat-meta');
        if (!row) {
            row = this.documentObject.createElement('div');
            row.className = 'vgen-nya-chat-meta notranslate';
            row.dataset.vgenNyaUi = 'chat-meta';
            row.translate = false;
            const seen = this.documentObject.createElement('span');
            seen.className = 'vgen-nya-chat-seen';
            const time = this.documentObject.createElement('time');
            time.className = 'vgen-nya-chat-time';
            row.append(seen, time);
            group.append(row);
        }
        const seen = row.querySelector('.vgen-nya-chat-seen');
        if (seen) seen.textContent = settings.showSeen && state.direction === 'outgoing' && state.status === 'read' ? '[seen]' : '';
        const time = row.querySelector('time');
        const rawTime = message.created_at || message.createdAt;
        if (time) {
            time.textContent = settings.showTimestamps && rawTime ? new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            if (rawTime) time.setAttribute('datetime', rawTime);
        }
        let marker = bubble.querySelector?.(':scope > .vgen-nya-read-marker');
        const unread = settings.keepUnread && state.direction === 'incoming' && state.status === 'unread';
        const read = state.status === 'read';
        if ((unread || read) && !marker) {
            marker = this.documentObject.createElement('button');
            marker.type = 'button';
            marker.className = 'vgen-nya-read-marker notranslate';
            marker.dataset.vgenNyaUi = 'read-marker';
            marker.addEventListener('pointerdown', (event) => event.stopPropagation());
            marker.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (marker.dataset.status === 'unread') manualRead();
            });
            bubble.append(marker);
        }
        if (marker && (unread || read)) {
            marker.dataset.status = unread ? 'unread' : 'read';
            marker.dataset.direction = state.direction;
            marker.textContent = unread ? '●' : '✓';
            marker.disabled = !unread;
            marker.title = unread ? '未读 · 点击标记为已读' : state.direction === 'outgoing' ? '对方已读' : '我已读';
        } else marker?.remove();
    }

    #decorateReactions(settings) {
        for (const reactions of this.surface.querySelectorAll?.('[data-testid="reaction-list"], .str-chat__message-reactions') || []) {
            if (settings.compactReactions) reactions.dataset.vgenNyaCompactReactions = 'true';
            else delete reactions.dataset.vgenNyaCompactReactions;
        }
    }

    #markLatestActions() {
        const buttons = this.surface.querySelectorAll?.('button[class*="JumpToPresentButton__Anchor"]') || [];
        for (const button of buttons) button.dataset.vgenNyaNativeLatest = 'true';
    }

    jumpToPresent() {
        const button = this.surface.querySelector?.('button[class*="JumpToPresentButton__Anchor"]');
        if (!button) return false;
        const handler = reactValue(button, 'onClick');
        if (typeof handler === 'function') handler({ currentTarget: button, target: button });
        else button.click?.();
        return true;
    }

    cleanup() {
        for (const node of this.surface?.querySelectorAll?.('[data-vgen-nya-ui="chat-meta"], [data-vgen-nya-ui="read-marker"]') || []) node.remove();
        for (const node of this.surface?.querySelectorAll?.('[data-vgen-nya-compact-reactions]') || []) delete node.dataset.vgenNyaCompactReactions;
    }

    static async openUser(target, { documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver } = {}) {
        const userID = String(target?.userID || target?.userId || '').trim();
        if (!userID) throw new Error(target?.username ? 'user-id-mapping-unavailable' : 'invalid-user');
        let overlay = documentObject.querySelector?.(OVERLAY_SELECTOR);
        if (!overlay) {
            const trigger = findChatTrigger(documentObject);
            if (!trigger) throw new Error('native-messages-trigger-unavailable');
            trigger.click();
            overlay = await waitForOverlay(documentObject, MutationObserverClass);
        }
        const previews = overlay.querySelectorAll?.(PREVIEW_SELECTOR) || [];
        for (const preview of previews) {
            const channel = reactValue(preview, 'channel');
            if (!memberIds(channel).includes(userID)) continue;
            const select = reactValue(preview, 'setActiveChannel') || reactValue(preview, 'onSelect');
            if (typeof select === 'function') await select(channel);
            else preview.click?.();
            return { opened: true, cid: channelCid(channel), existing: true };
        }
        const root = overlay.querySelector?.('.str-chat') || overlay;
        const activeChannel = reactValue(root, 'channel');
        const client = reactValue(root, 'client') || activeChannel?.getClient?.();
        if (typeof client?.queryChannels !== 'function') throw new Error('stream-client-unavailable');
        const channels = await client.queryChannels({ type: 'messaging', members: { $in: [userID] } }, [{ last_message_at: -1 }], { state: true, watch: true });
        const channel = channels.find((item) => memberIds(item).includes(userID));
        if (!channel) throw new Error('existing-conversation-unavailable');
        const select = reactValue(root, 'setActiveChannel') || reactValue(root, 'onSelect');
        if (typeof select !== 'function') throw new Error('native-channel-selector-unavailable');
        await select(channel);
        return { opened: true, cid: channelCid(channel), existing: true };
    }
}
