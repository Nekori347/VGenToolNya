const PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;
const LEGACY_FOOTER_SELECTOR = '[class*="CreatorSidebar__SidebarFooter"]';
const MODERN_SIDEBAR_SELECTOR = '[class*="DesktopSidebar__Sidebar"]';
const CLIENTS_CSS = `
.vgen-nya-clients{margin:10px 8px;border:1px solid #6f8588;border-radius:10px;overflow:hidden;background:#13252bdd;color:#eef8f7;font:12px/1.35 system-ui,sans-serif;min-height:var(--vgen-nya-clients-min-height)}
.vgen-nya-clients[data-collapsed="true"]{min-height:0}
.vgen-nya-clients__header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #ffffff22}.vgen-nya-clients__header strong{margin-right:auto}.vgen-nya-clients__header button{border:0;border-radius:5px;background:#ffffff18;color:inherit;cursor:pointer}
.vgen-nya-clients__list{max-height:calc(var(--vgen-nya-clients-row-height) * 7);overflow:auto}.vgen-nya-clients__row{display:flex;align-items:center;min-height:var(--vgen-nya-clients-row-height);padding:5px 8px;background-size:cover;background-position:center;border-bottom:1px solid #ffffff18}
.vgen-nya-clients__avatar{position:relative;flex:0 0 34px;width:34px;height:34px;padding:0;border:0;border-radius:9px;cursor:pointer;background:#30434a}.vgen-nya-clients__avatar img{width:100%;height:100%;border-radius:inherit;object-fit:cover}.vgen-nya-clients__chat-badge{position:absolute;right:-5px;bottom:-5px;display:flex;width:17px;height:17px;align-items:center;justify-content:center;border-radius:50%;background:#fff;color:#263238;font-size:10px;pointer-events:none}
.vgen-nya-clients__link{display:flex;flex:1;min-width:0;flex-direction:column;margin-left:10px;color:inherit;text-decoration:none}.vgen-nya-clients__primary{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vgen-nya-clients__secondary,.vgen-nya-clients__updates{opacity:.7;font-size:10px}.vgen-nya-clients__notice{margin-left:5px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 5px;border-radius:5px;background:#ffcf5a;color:#392d00;font-size:9px;font-weight:700}.vgen-nya-clients__empty{padding:10px;opacity:.75}
`;

const latestDate = (items, fields) => (items || []).reduce((latest, item) => {
    const value = fields.map((field) => item?.[field]).find(Boolean);
    return value && (!latest || Date.parse(value) > Date.parse(latest)) ? value : latest;
}, '');

const make = (documentObject, tag, className = '', text = '') => {
    const node = documentObject.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
};

export class FrequentClientsRuntime {
    constructor({ repository, chat, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, fetchImpl = globalThis.fetch, hostResolver } = {}) {
        this.repository = repository;
        this.chat = chat;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.fetchImpl = fetchImpl;
        this.hostResolver = hostResolver || ((root) => {
            const legacyFooter = root?.matches?.(LEGACY_FOOTER_SELECTOR) ? root : root?.querySelector?.(LEGACY_FOOTER_SELECTOR);
            if (legacyFooter?.parentElement) return { parent: legacyFooter.parentElement, before: legacyFooter };
            const modernSidebar = root?.matches?.(MODERN_SIDEBAR_SELECTOR) ? root : root?.querySelector?.(MODERN_SIDEBAR_SELECTOR);
            const modernFooter = modernSidebar?.querySelector?.(':scope > .sidebarFooter');
            return modernSidebar ? { parent: modernSidebar, before: modernFooter || null } : null;
        });
        this.panel = null;
        this.host = null;
        this.observer = null;
        this.unsubscribe = null;
        this.refreshing = false;
        this.mounted = false;
        this.style = null;
    }

    mount() {
        if (this.mounted) return false;
        this.mounted = true;
        this.style = this.documentObject.createElement?.('style') || null;
        if (this.style) {
            this.style.dataset.vgenNyaUi = 'frequent-clients-style';
            this.style.textContent = CLIENTS_CSS;
            (this.documentObject.head || this.documentObject.body)?.append(this.style);
        }
        this.unsubscribe = this.repository.subscribe(({ domain }) => {
            if (domain.startsWith('clients')) this.sync();
        });
        this.sync();
        if (this.MutationObserverClass && this.documentObject?.body) {
            this.observer = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.removedNodes || []) if (node === this.host || node.contains?.(this.host)) this.#removePanel();
                    for (const node of record.addedNodes || []) if (!this.panel) this.#mountIn(node);
                }
            });
            this.observer.observe(this.documentObject.body, { childList: true });
        }
        return true;
    }

    activate() {}

    sync() {
        const settings = this.repository.read().clientsSettings;
        if (!settings.enabled) {
            this.#removePanel();
            return;
        }
        if (!this.panel) this.#mountIn(this.documentObject);
        if (this.panel) this.render();
    }

    #mountIn(root) {
        const mount = this.hostResolver(root);
        if (!mount || this.panel) return false;
        const host = mount.parent || mount;
        const before = mount.before || null;
        this.host = host;
        this.panel = make(this.documentObject, 'section', 'vgen-nya-clients notranslate');
        this.panel.dataset.vgenNyaUi = 'frequent-clients';
        this.panel.translate = false;
        this.panel.setAttribute('aria-label', '常用访问');
        this.panel.addEventListener('click', this.#onClick);
        this.panel.addEventListener('dragstart', this.#onDragStart);
        this.panel.addEventListener('dragover', this.#onDragOver);
        this.panel.addEventListener('drop', this.#onDrop);
        if (before && typeof host.insertBefore === 'function') host.insertBefore(this.panel, before);
        else host.append(this.panel);
        this.render();
        void this.refreshStale();
        return true;
    }

    render() {
        if (!this.panel) return;
        const { clients, clientsSettings } = this.repository.read();
        this.panel.dataset.collapsed = String(clientsSettings.collapsed);
        this.panel.style.cssText = `--vgen-nya-clients-min-height:${clientsSettings.minHeight}px;--vgen-nya-clients-row-height:${clientsSettings.rowHeight}px`;
        this.panel.replaceChildren();
        const header = make(this.documentObject, 'header', 'vgen-nya-clients__header');
        header.append(
            make(this.documentObject, 'strong', '', '常用访问'),
            this.#button('refresh', '↻', '刷新资料'),
            this.#button('collapse', clientsSettings.collapsed ? '＋' : '－', clientsSettings.collapsed ? '展开' : '折叠'),
        );
        this.panel.append(header);
        const list = make(this.documentObject, 'div', 'vgen-nya-clients__list');
        list.hidden = clientsSettings.collapsed;
        if (!clients.length) list.append(make(this.documentObject, 'p', 'vgen-nya-clients__empty', '在设置 → 常用访问中添加客户'));
        clients.forEach((client, index) => list.append(this.#row(client, index)));
        this.panel.append(list);
    }

    #button(action, text, title) {
        const button = make(this.documentObject, 'button', '', text);
        button.type = 'button';
        button.dataset.action = action;
        button.title = title;
        return button;
    }

    #row(client, index) {
        const row = make(this.documentObject, 'div', 'vgen-nya-clients__row');
        row.dataset.clientId = client.id;
        row.dataset.index = String(index);
        row.draggable = true;
        if (client.bannerURL) row.style.backgroundImage = `url(${JSON.stringify(client.bannerURL)})`;
        const quick = this.#button('quick-chat', '', `私信 @${client.username}`);
        quick.className = 'vgen-nya-clients__avatar';
        quick.dataset.clientId = client.id;
        const avatar = make(this.documentObject, 'img');
        avatar.alt = '';
        avatar.src = client.avatarURL || '';
        const badge = make(this.documentObject, 'span', 'vgen-nya-clients__chat-badge', '💬');
        badge.setAttribute('aria-hidden', 'true');
        quick.append(avatar, badge);
        quick.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.#openQuickChat(client.id, quick);
        });
        const text = make(this.documentObject, 'a', 'vgen-nya-clients__link');
        text.href = client.url;
        text.target = '_blank';
        text.rel = 'noopener noreferrer';
        const primary = make(this.documentObject, 'span', 'vgen-nya-clients__primary', client.note || client.displayName || `@${client.username}`);
        const secondary = make(this.documentObject, 'span', 'vgen-nya-clients__secondary', `@${client.username}`);
        const updates = [client.lastServiceUpdate && `服务 ${this.#date(client.lastServiceUpdate)}`, client.lastPortfolioUpdate && `作品 ${this.#date(client.lastPortfolioUpdate)}`].filter(Boolean).join(' · ');
        const detail = make(this.documentObject, 'span', 'vgen-nya-clients__updates', updates);
        text.append(primary, secondary, detail);
        if (client.announcementMessage) {
            const notice = make(this.documentObject, 'span', 'vgen-nya-clients__notice', `通知：${client.announcementMessage}`);
            notice.title = client.announcementMessage;
            row.append(quick, text, notice);
        } else row.append(quick, text);
        return row;
    }

    #date(value) {
        const date = new Date(value);
        return Number.isFinite(+date) ? date.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) : '—';
    }

    #onClick = async (event) => {
        const button = event.target?.closest?.('button[data-action]');
        if (!button) return;
        if (button.dataset.action === 'collapse') {
            const next = this.repository.read().clientsSettings;
            next.collapsed = !next.collapsed;
            this.repository.writeClientsSettings(next);
        }
        if (button.dataset.action === 'refresh') await this.refreshStale(true);
    };

    async #openQuickChat(clientId, button) {
        if (button.disabled) return;
        button.disabled = true;
        try {
            let client = this.repository.read().clients.find((item) => item.id === clientId);
            if (!client?.userID) {
                await this.refreshClient(client?.id, true);
                client = this.repository.read().clients.find((item) => item.id === clientId);
            }
            await this.chat.openUser(client);
        } finally { button.disabled = false; }
    }

    #onDragStart = (event) => {
        const row = event.target?.closest?.('[data-client-id]');
        if (row) event.dataTransfer?.setData('text/plain', row.dataset.clientId);
    };

    #onDragOver = (event) => {
        if (event.target?.closest?.('[data-client-id]')) event.preventDefault();
    };

    #onDrop = (event) => {
        const target = event.target?.closest?.('[data-client-id]');
        const sourceId = event.dataTransfer?.getData('text/plain');
        if (!target || !sourceId || sourceId === target.dataset.clientId) return;
        event.preventDefault();
        const clients = this.repository.read().clients;
        const from = clients.findIndex((client) => client.id === sourceId);
        const to = clients.findIndex((client) => client.id === target.dataset.clientId);
        if (from >= 0 && to >= 0) this.repository.reorderClient(from, to);
    };

    async refreshStale(force = false) {
        if (this.refreshing) return;
        const clients = this.repository.read().clients;
        const pending = clients.filter((client) => force || Date.now() - client.profileFetchedAt >= PROFILE_CACHE_MS);
        this.refreshing = true;
        try {
            for (let index = 0; index < pending.length; index += 3) {
                await Promise.allSettled(pending.slice(index, index + 3).map((client) => this.refreshClient(client.id, force)));
            }
        } finally { this.refreshing = false; }
    }

    async refreshClient(id, force = false) {
        const clients = this.repository.read().clients;
        const client = clients.find((item) => item.id === id);
        if (!client || (!force && Date.now() - client.profileFetchedAt < PROFILE_CACHE_MS)) return client;
        const api = async (path) => {
            const response = await this.fetchImpl(`https://api.vgen.co${path}`, { headers: { 'v-client-id': 'vgen-web' } });
            if (!response.ok) throw new Error(`VGen API ${response.status}`);
            return response.json();
        };
        const profile = await api(`/user/${encodeURIComponent(client.username)}`);
        if (!profile?.userID) throw new Error('user-profile-unavailable');
        const [services, showcases] = await Promise.allSettled([
            api(`/commission/services/${encodeURIComponent(profile.userID)}`),
            api(`/discoverability/portfolio/showcases/${encodeURIComponent(profile.userID)}?limit=1&verifyAge=true`),
        ]);
        Object.assign(client, {
            userID: String(profile.userID),
            username: String(profile.username || client.username),
            url: `https://vgen.co/${encodeURIComponent(profile.username || client.username)}`,
            displayName: String(profile.displayName || ''),
            avatarURL: String(profile.avatarURL || ''),
            bannerURL: String(profile.bannerURL || ''),
            announcementMessage: String(profile.announcement?.message || '').slice(0, 500),
            announcementModified: String(profile.announcement?.modified || ''),
            lastServiceUpdate: services.status === 'fulfilled' ? latestDate(services.value, ['modified', 'created']) : client.lastServiceUpdate,
            lastPortfolioUpdate: showcases.status === 'fulfilled' ? String(showcases.value?.showcases?.[0]?.modified || showcases.value?.showcases?.[0]?.created || '') : client.lastPortfolioUpdate,
            serviceFetchFailed: services.status === 'rejected',
            portfolioFetchFailed: showcases.status === 'rejected',
            profileFetchedAt: Date.now(),
        });
        this.repository.writeClients(clients);
        return client;
    }

    #removePanel() {
        if (!this.panel) return;
        this.panel.removeEventListener('click', this.#onClick);
        this.panel.removeEventListener('dragstart', this.#onDragStart);
        this.panel.removeEventListener('dragover', this.#onDragOver);
        this.panel.removeEventListener('drop', this.#onDrop);
        this.panel.remove();
        this.panel = null;
        this.host = null;
    }

    unmount() {
        if (!this.mounted) return false;
        this.observer?.disconnect();
        this.observer = null;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.#removePanel();
        this.style?.remove();
        this.style = null;
        this.mounted = false;
        return true;
    }

    dispose() { this.unmount(); }
}
