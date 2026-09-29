import { iconSvg, setButtonIcon } from '../ui/icons.js';
import { UI_TOKENS_CSS } from '../ui/tokens.js';

const PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;
const LEGACY_FOOTER_SELECTOR = '[class*="CreatorSidebar__SidebarFooter"]';
const MODERN_SIDEBAR_SELECTOR = '[class*="DesktopSidebar__Sidebar"]';
const CLIENTS_CSS = `
.vgen-nya-clients{--nya-shell:#ffffff;--nya-soft:#f3f5f9;--nya-hover:rgba(79,124,255,.11);--nya-text:#252a37;--nya-muted:#737b8e;--nya-border:rgba(32,45,69,.15);--nya-blue:#4f7cff;--nya-green:#20cda7;display:flex;flex-direction:column;margin:4px 8px 8px 6px;border:1px solid var(--nya-border);border-radius:10px;overflow:hidden;background:var(--nya-shell);color:var(--nya-text);font:12px/1.35 system-ui,sans-serif;min-height:var(--vgen-nya-clients-min-height)}
.vgen-nya-clients[data-theme="dark"]{--nya-shell:#272834;--nya-soft:#323440;--nya-hover:rgba(113,149,255,.14);--nya-text:#f2f4f8;--nya-muted:#b7bdca;--nya-border:rgba(255,255,255,.11);--nya-blue:#7195ff;--nya-green:#3bdfbc}
.vgen-nya-clients[data-collapsed="true"]{min-height:0}
.vgen-nya-clients__accent{height:1px;flex:0 0 auto;background:linear-gradient(90deg,var(--nya-blue),var(--nya-green))}
.vgen-nya-clients[data-collapsed="true"] .vgen-nya-clients__accent,.vgen-nya-clients[data-collapsed="true"] .vgen-nya-clients__list{display:none}
.vgen-nya-clients__header{display:flex;align-items:center;justify-content:space-between;min-height:20px;height:20px;flex:0 0 20px;padding:1px 3px 1px 8px;border-bottom:1px solid var(--nya-border);background:var(--nya-soft)}
.vgen-nya-clients__header strong{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700}.vgen-nya-clients__header strong::before{content:"";width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,var(--nya-blue),var(--nya-green))}
.vgen-nya-clients__header-actions{display:flex;align-items:center;gap:3px}
.vgen-nya-clients__header button{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:1px solid var(--nya-border);border-radius:5px;background:transparent;color:var(--nya-muted);cursor:pointer}
.vgen-nya-clients__header button:hover{background:var(--nya-hover);color:var(--nya-text)}
.vgen-nya-clients__header svg{width:11px;height:11px}
.vgen-nya-clients__list{max-height:calc(var(--vgen-nya-clients-row-height) * 7);overflow:auto;padding:3px 3px 0}
.vgen-nya-clients__row{position:relative;display:flex;align-items:center;min-height:var(--vgen-nya-clients-row-height);height:var(--vgen-nya-clients-row-height);min-width:0;margin-bottom:3px;border:1px solid var(--nya-border);border-radius:8px;background-color:var(--nya-soft);background-position:center 42%;background-size:cover;overflow:hidden}
.vgen-nya-clients__row::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,color-mix(in srgb,var(--nya-shell) 94%,transparent) 0%,color-mix(in srgb,var(--nya-shell) 84%,transparent) 62%,color-mix(in srgb,var(--nya-shell) 54%,transparent) 100%);pointer-events:none}
.vgen-nya-clients__row:hover::before{background:linear-gradient(90deg,color-mix(in srgb,var(--nya-hover) 86%,var(--nya-shell)) 0%,color-mix(in srgb,var(--nya-hover) 66%,transparent) 100%)}
.vgen-nya-clients__avatar{position:relative;z-index:1;flex:0 0 29px;width:29px;height:29px;align-self:center;margin:0 7px 0 6px;padding:0;border:0;border-radius:8px;background:transparent;cursor:pointer}.vgen-nya-clients__avatar:hover{box-shadow:0 0 0 2px var(--nya-green)}.vgen-nya-clients__avatar:focus-visible{outline:2px solid var(--nya-green);outline-offset:3px}.vgen-nya-clients__avatar:disabled{opacity:.65;cursor:wait}.vgen-nya-clients__avatar img{display:block;width:29px;height:29px;border:1px solid color-mix(in srgb,var(--nya-green) 45%,var(--nya-border));border-radius:8px;background:var(--nya-soft);object-fit:cover}.vgen-nya-clients__chat-badge{position:absolute;right:-5px;bottom:-5px;z-index:3;display:flex;width:16px;height:16px;align-items:center;justify-content:center;border-radius:50%;background:var(--nya-shell);color:var(--nya-text);box-shadow:0 0 0 1px var(--nya-border);pointer-events:none}.vgen-nya-clients__chat-badge svg{width:12px;height:12px;fill:currentColor;stroke:none}
.vgen-nya-clients__link{display:flex;flex:1;min-width:0;flex-direction:column;position:relative;z-index:1;color:var(--nya-text);text-decoration:none}.vgen-nya-clients__primary{min-width:0;overflow:hidden;font-size:10.5px;font-weight:700;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.vgen-nya-clients__secondary,.vgen-nya-clients__updates{min-width:0;overflow:hidden;color:var(--nya-muted);text-overflow:ellipsis;white-space:nowrap}.vgen-nya-clients__secondary{font-size:8.5px;line-height:1.2}.vgen-nya-clients__updates{font-size:7.8px;line-height:1.2}.vgen-nya-clients__notice{margin-left:auto;flex:0 0 auto;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 5px;border-radius:5px;background:#ffcf5a;color:#392d00;font-size:9px;font-weight:700;position:relative;z-index:1}.vgen-nya-clients__empty{padding:18px 8px;color:var(--nya-muted);text-align:center;font-size:11px}
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

const abortError = () => Object.assign(new Error('Frequent Client refresh aborted'), { name: 'AbortError' });

function parseRGB(value) {
    const match = String(value || '').match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 };
}

function backgroundColor(node) {
    const view = node?.ownerDocument?.defaultView || globalThis;
    const computed = typeof view.getComputedStyle === 'function' ? view.getComputedStyle(node) : null;
    return computed?.backgroundColor || node?.style?.backgroundColor || '';
}

// Mirrors the legacy VGen小工具 surface detection so the panel theme always
// matches the actual VGen sidebar instead of the OS preference.
function detectDarkSurface(start) {
    let node = start;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
        const rgb = parseRGB(backgroundColor(node));
        if (rgb && rgb.a >= 0.08) return (rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722) < 128;
    }
    return true;
}

export class FrequentClientsRuntime {
    constructor({ repository, chat, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, AbortControllerClass = documentObject?.defaultView?.AbortController || globalThis.AbortController, fetchImpl = globalThis.fetch, hostResolver } = {}) {
        this.repository = repository;
        this.chat = chat;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.AbortControllerClass = AbortControllerClass;
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
        this.hostObserver = null;
        this.probes = new Map();
        this.settleTimer = null;
        this.unsubscribe = null;
        this.refreshing = false;
        this.refreshOperation = 0;
        this.abortController = null;
        this.mounted = false;
        this.style = null;
    }

    mount() {
        if (this.mounted) return false;
        this.mounted = true;
        this.abortController = this.AbortControllerClass ? new this.AbortControllerClass() : null;
        this.style = this.documentObject.createElement?.('style') || null;
        if (this.style) {
            this.style.dataset.vgenNyaUi = 'frequent-clients-style';
            this.style.textContent = UI_TOKENS_CSS + CLIENTS_CSS;
            (this.documentObject.head || this.documentObject.body)?.append(this.style);
        }
        this.unsubscribe = this.repository.subscribe(({ domain }) => {
            if (domain.startsWith('clients')) this.sync();
        });
        this.sync();
        if (this.MutationObserverClass && this.documentObject?.body) {
            this.observer = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.removedNodes || []) {
                        if (node === this.host || node.contains?.(this.host)) this.#removePanel();
                        for (const root of this.probes.keys()) if (node === root || node.contains?.(root)) this.#releaseProbe(root);
                    }
                    for (const node of record.addedNodes || []) if (!this.panel) this.#probe(node);
                }
            });
            this.observer.observe(this.documentObject.body, { childList: true });
            for (const node of this.documentObject.body.children || []) if (!this.panel) this.#probe(node);
            if (!this.panel) this.settleTimer = globalThis.setTimeout(() => {
                this.settleTimer = null;
                this.sync();
            }, 1500);
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
        if (this.panel?.isConnected === false || this.host?.isConnected === false || (this.host && !this.host.parentElement)) this.#removePanel();
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
        const lifecycleRoot = host.parentElement || host;
        if (this.MutationObserverClass && lifecycleRoot) {
            this.hostObserver = new this.MutationObserverClass(() => {
                if (this.panel?.isConnected !== false && this.host?.isConnected !== false && this.host?.parentElement) return;
                this.#removePanel();
                this.sync();
            });
            this.hostObserver.observe(lifecycleRoot, { childList: true });
        }
        if (this.settleTimer !== null) globalThis.clearTimeout(this.settleTimer);
        this.settleTimer = null;
        this.#releaseProbes();
        this.render();
        void this.refreshStale();
        return true;
    }

    #probe(root) {
        if (!root?.querySelector || this.panel || this.probes.has(root)) return false;
        if (this.#mountIn(root)) return true;
        if (!this.MutationObserverClass || this.probes.size >= 12) return false;
        const observer = new this.MutationObserverClass(() => {
            if (root.isConnected === false) this.#releaseProbe(root);
            else if (this.#mountIn(root)) this.#releaseProbes();
        });
        observer.observe(root, { childList: true, subtree: true });
        const timer = globalThis.setTimeout(() => this.#releaseProbe(root), 8000);
        this.probes.set(root, { observer, timer });
        return false;
    }

    #releaseProbe(root) {
        const entry = this.probes.get(root);
        if (!entry) return;
        entry.observer.disconnect();
        globalThis.clearTimeout(entry.timer);
        this.probes.delete(root);
    }

    #releaseProbes() {
        for (const root of [...this.probes.keys()]) this.#releaseProbe(root);
    }

    render() {
        if (!this.panel) return;
        const { clients, clientsSettings } = this.repository.read();
        this.panel.dataset.collapsed = String(clientsSettings.collapsed);
        this.panel.style.cssText = `--vgen-nya-clients-min-height:${clientsSettings.minHeight}px;--vgen-nya-clients-row-height:${clientsSettings.rowHeight}px`;
        this.panel.dataset.theme = detectDarkSurface(this.host) ? 'dark' : 'light';
        this.panel.replaceChildren();
        const accent = make(this.documentObject, 'div', 'vgen-nya-clients__accent');
        const header = make(this.documentObject, 'header', 'vgen-nya-clients__header');
        const actions = make(this.documentObject, 'div', 'vgen-nya-clients__header-actions');
        const refresh = this.#button('refresh', '', '刷新全部用户资料');
        setButtonIcon(refresh, 'refresh', { size: 11 });
        const collapse = this.#button('collapse', '', clientsSettings.collapsed ? '展开常用访问' : '折叠常用访问');
        setButtonIcon(collapse, clientsSettings.collapsed ? 'chevronDown' : 'chevronUp', { size: 11 });
        actions.append(refresh, collapse);
        header.append(
            make(this.documentObject, 'strong', '', '常用访问'),
            actions,
        );
        this.panel.append(accent, header);
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
        const badge = make(this.documentObject, 'span', 'vgen-nya-clients__chat-badge');
        badge.innerHTML = iconSvg('chat', 12);
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
        const originalTitle = button.title;
        button.dataset.vgenNyaQuickChatStatus = 'loading';
        delete button.dataset.vgenNyaQuickChatError;
        try {
            let client = this.repository.read().clients.find((item) => item.id === clientId);
            if (!client?.userID) {
                await this.refreshClient(client?.id, true);
                client = this.repository.read().clients.find((item) => item.id === clientId);
            }
            await this.chat.openUser(client);
            button.dataset.vgenNyaQuickChatStatus = 'opened';
        } catch (error) {
            button.dataset.vgenNyaQuickChatStatus = 'error';
            button.dataset.vgenNyaQuickChatError = String(error?.message || error || 'quick-chat-failed').slice(0, 120);
            button.title = `${originalTitle} · 无法打开：${button.dataset.vgenNyaQuickChatError}`;
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
        if (this.refreshing || !this.mounted) return;
        const operation = ++this.refreshOperation;
        const signal = this.abortController?.signal;
        const clients = this.repository.read().clients;
        const pending = clients.filter((client) => force || Date.now() - client.profileFetchedAt >= PROFILE_CACHE_MS);
        this.refreshing = true;
        try {
            for (let index = 0; index < pending.length; index += 3) {
                if (signal?.aborted) break;
                await Promise.allSettled(pending.slice(index, index + 3).map((client) => this.refreshClient(client.id, force, { signal })));
            }
        } finally {
            if (this.refreshOperation === operation) this.refreshing = false;
        }
    }

    async refreshClient(id, force = false, { signal = this.abortController?.signal } = {}) {
        const clients = this.repository.read().clients;
        const client = clients.find((item) => item.id === id);
        if (!client || (!force && Date.now() - client.profileFetchedAt < PROFILE_CACHE_MS)) return client;
        const api = async (path) => {
            if (signal?.aborted) throw abortError();
            const response = await this.fetchImpl(`https://api.vgen.co${path}`, { headers: { 'v-client-id': 'vgen-web' }, signal });
            if (!response.ok) throw new Error(`VGen API ${response.status}`);
            return response.json();
        };
        const profile = await api(`/user/${encodeURIComponent(client.username)}`);
        if (signal?.aborted) throw abortError();
        if (!profile?.userID) throw new Error('user-profile-unavailable');
        const [services, showcases] = await Promise.allSettled([
            api(`/commission/services/${encodeURIComponent(profile.userID)}`),
            api(`/discoverability/portfolio/showcases/${encodeURIComponent(profile.userID)}?limit=1&verifyAge=true`),
        ]);
        if (signal?.aborted) throw abortError();
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
        this.hostObserver?.disconnect();
        this.hostObserver = null;
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
        this.refreshOperation += 1;
        this.refreshing = false;
        this.abortController?.abort();
        this.abortController = null;
        this.observer?.disconnect();
        this.observer = null;
        this.hostObserver?.disconnect();
        this.hostObserver = null;
        if (this.settleTimer !== null) globalThis.clearTimeout(this.settleTimer);
        this.settleTimer = null;
        this.#releaseProbes();
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
