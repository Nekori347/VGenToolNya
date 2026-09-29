import { VGenUploadAdapter } from './vgen-upload-adapter.js';
import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';
import { iconSvg, setButtonIcon } from '../ui/icons.js';
import { UI_TOKENS_CSS } from '../ui/tokens.js';

const PLUGIN_VERSION = '0.1.0';

const CSS = `
.vgen-nya-upload{--vtq-bg:#ffffff;--vtq-soft:#f3f6fb;--vtq-hover:#e9eef8;--vtq-text:#252a37;--vtq-muted:#737b8e;--vtq-border:rgba(32,45,69,.15);--vtq-blue:#4f7cff;--vtq-green:#20cda7;--vtq-danger:#d84f67;--vtq-warn:#d68b27;--vtq-blue-soft:rgba(79,124,255,.13);--vtq-green-soft:rgba(32,205,167,.13);margin:10px 0;width:100%;color:var(--vtq-text);font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
.vgen-nya-upload[data-theme=dark]{--vtq-bg:#30313f;--vtq-soft:#3a3c4a;--vtq-hover:#454857;--vtq-text:#f2f4f8;--vtq-muted:#b7bdca;--vtq-border:rgba(255,255,255,.13);--vtq-blue:#7195ff;--vtq-green:#3bdfbc;--vtq-danger:#ff7286;--vtq-warn:#f2ad50;--vtq-blue-soft:rgba(113,149,255,.17);--vtq-green-soft:rgba(59,223,188,.15)}
.vgen-nya-upload *{box-sizing:border-box}
.vgen-nya-upload__head{display:flex;align-items:center;gap:8px;min-height:30px}.vgen-nya-upload__head strong{flex:1;font-size:12px;font-weight:750}.vgen-nya-upload__head button{cursor:pointer;border:1px solid var(--vtq-border);border-radius:7px;background:var(--vtq-soft);color:var(--vtq-text);font:inherit}
.vgen-nya-upload__head button:hover{background:var(--vtq-hover)}
.vgen-nya-upload__head .vgen-nya-upload__icon{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;padding:0}
.vgen-nya-upload__modules{display:grid;gap:8px;margin-top:6px}
.vgen-nya-upload__strip{position:relative;overflow:hidden;border:1px solid var(--vtq-border);border-radius:8px;background:var(--vtq-soft)}
.vgen-nya-upload__strip::before{position:absolute;top:0;right:0;left:0;z-index:1;height:2px;background:linear-gradient(90deg,var(--vtq-blue),var(--vtq-green));content:""}
.vgen-nya-upload__strip-row{display:flex;align-items:center;gap:5px;min-height:30px;padding:4px 6px 2px 8px}
.vgen-nya-upload__strip-label{flex:0 0 auto;font-weight:700;font-size:11px;color:var(--vtq-text)}
.vgen-nya-upload__strip select{min-width:0;height:23px;flex:1;padding:1px 24px 1px 7px;overflow:hidden;border:1px solid var(--vtq-border);border-radius:6px;color:var(--vtq-text);background:var(--vtq-bg);cursor:pointer;font:inherit;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.vgen-nya-upload__strip select:focus{border-color:var(--vtq-blue);outline:none;box-shadow:0 0 0 2px var(--vtq-blue-soft)}
.vgen-nya-upload__strip-action{display:inline-flex;align-items:center;justify-content:center;height:21px;min-width:21px;padding:0 5px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--vtq-muted);cursor:pointer;font-size:11px}
.vgen-nya-upload__strip-action:hover{border-color:var(--vtq-border);color:var(--vtq-blue);background:var(--vtq-hover)}
.vgen-nya-upload__strip--global .vgen-nya-upload__strip-row{flex-wrap:wrap;min-height:56px;padding:8px;gap:6px}
.vgen-nya-upload__brand{display:flex;align-items:baseline;justify-content:space-between;gap:8px;width:100%;padding:2px 1px 0}
.vgen-nya-upload__brand-name{min-width:0;overflow:hidden;font-size:13px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.vgen-nya-upload__brand-meta{flex:0 0 auto;color:var(--vtq-muted);font-size:10px;white-space:nowrap}
.vgen-nya-upload__strip--global select{width:100%;height:30px;flex-basis:100%}
.vgen-nya-upload__group{overflow:hidden;margin-bottom:8px;border:1px solid var(--vtq-border);border-radius:11px;background:var(--vtq-soft)}
.vgen-nya-upload__group:last-child{margin-bottom:0}
.vgen-nya-upload__group-heading{position:relative;display:flex;align-items:center;gap:8px;min-height:40px;padding:7px 9px 9px}
.vgen-nya-upload__group-toggle{display:inline-flex;min-width:0;min-height:28px;flex:1;align-items:center;gap:8px;padding:0;border:0;color:var(--vtq-text);background:transparent;cursor:pointer;text-align:left}
.vgen-nya-upload__group-chevron{display:inline-flex;color:var(--vtq-muted);transition:transform .15s ease}
.vgen-nya-upload__group[data-expanded="true"] .vgen-nya-upload__group-chevron{transform:rotate(90deg)}
.vgen-nya-upload__group-name{min-width:0;flex:1;overflow:hidden;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.vgen-nya-upload__group-count{color:var(--vtq-muted);font-size:11px}
.vgen-nya-upload__group-mini-actions{display:flex;align-items:center;gap:4px}
.vgen-nya-upload__group[data-expanded="true"] .vgen-nya-upload__group-mini-actions{display:none}
.vgen-nya-upload__group-mini-action{display:inline-flex;min-width:25px;width:25px;height:25px;padding:0;border-radius:7px;align-items:center;justify-content:center;color:var(--vtq-muted);background:transparent;border:1px solid transparent;cursor:pointer;font-weight:750}
.vgen-nya-upload__group-mini-action:hover{border-color:var(--vtq-border);color:var(--vtq-blue);background:var(--vtq-hover)}
.vgen-nya-upload__group-progress{position:absolute;right:9px;bottom:3px;left:9px;height:2px;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--vtq-border) 75%,transparent)}
.vgen-nya-upload__group-progress-fill{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--vtq-blue),var(--vtq-green));transition:width .18s ease}
.vgen-nya-upload__tags{display:flex;flex-wrap:wrap;gap:7px;padding:0 10px 10px}
.vgen-nya-upload__group-toolbar{display:flex;justify-content:flex-end;gap:6px;padding:0 10px 8px}
.vgen-nya-upload__group-action{min-height:28px;padding:3px 9px;font-size:11px;border:1px solid var(--vtq-border);border-radius:8px;background:var(--vtq-soft);color:var(--vtq-text);cursor:pointer}
.vgen-nya-upload__group-action:hover{background:var(--vtq-hover)}
.vgen-nya-upload__tag{display:inline-flex;align-items:center;gap:3px;position:relative;max-width:100%;min-height:44px;padding:9px 17px;overflow:hidden;border:1px solid color-mix(in srgb,var(--vtq-blue) 44%,var(--vtq-border));border-radius:999px;color:var(--vtq-text);background:var(--vtq-bg);cursor:pointer;text-overflow:ellipsis;white-space:nowrap}
.vgen-nya-upload__tag:hover{border-color:color-mix(in srgb,var(--vtq-green) 72%,var(--vtq-blue));color:var(--vtq-blue);background:linear-gradient(135deg,var(--vtq-blue-soft),var(--vtq-green-soft))}
.vgen-nya-upload__tag[data-state="running"]{border-color:var(--vtq-green);color:#fff;background:var(--vtq-green);box-shadow:0 0 0 3px var(--vtq-green-soft)}
.vgen-nya-upload__tag[data-state="selected"]{border-color:transparent;color:#fff;background:linear-gradient(135deg,var(--vtq-blue),var(--vtq-green));box-shadow:0 0 0 2px var(--vtq-green-soft)}
.vgen-nya-upload__tag[data-state="removing"]{border-color:var(--vtq-blue);color:#fff;background:var(--vtq-blue);box-shadow:0 0 0 3px var(--vtq-blue-soft)}
.vgen-nya-upload__tag[data-state="failed"]{border-color:var(--vtq-warn);color:var(--vtq-warn);background:color-mix(in srgb,var(--vtq-warn) 12%,transparent)}
.vgen-nya-upload__status{min-height:1.3em;color:var(--vtq-muted)}
`;

function make(documentObject, tag, attributes = {}, text = '') {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key in node && key !== 'style') node[key] = value;
        else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
}

function presetValue(preset, kind) {
    if (kind === 'title') return preset?.value ?? preset?.title ?? '';
    if (kind === 'description') return preset?.value ?? preset?.description ?? '';
    return preset;
}

function keyOfTag(value) {
    return String(typeof value === 'string' ? value : value?.tag || '').trim().toLocaleLowerCase();
}

export class UploadAssistantSession {
    constructor({ surface, repository, textPresetEngine, adapter = new VGenUploadAdapter(surface), MutationObserverClass = globalThis.MutationObserver, onInactive = null }) {
        this.surface = surface;
        this.repository = repository;
        this.adapter = adapter;
        this.MutationObserverClass = MutationObserverClass;
        this.root = null;
        this.observer = null;
        this.unsubscribe = null;
        this.renderQueued = false;
        this.onInactive = onInactive;
        this.textPresetEngine = textPresetEngine;
    }

    mount() {
        if (this.root?.isConnected) return false;
        const documentObject = this.surface.ownerDocument;
        this.root = make(documentObject, 'section', {
            className: 'vgen-nya-upload notranslate',
            dataset: { vgenNyaUi: 'upload-assistant' },
            translate: false,
        });
        this.root.addEventListener('click', (event) => this.onClick(event));
        this.root.addEventListener('change', (event) => this.onChange(event));
        const style = make(documentObject, 'style');
        style.textContent = UI_TOKENS_CSS + CSS;
        this.root.append(style);
        const anchor = this.adapter.findTagInput?.()?.parentElement;
        (anchor?.parentElement || this.surface).append(this.root);
        this.unsubscribe = this.repository.subscribe(() => this.render());
        if (this.MutationObserverClass) {
            this.observer = new this.MutationObserverClass((records) => {
                if (typeof this.adapter.isOpen === 'function' && !this.adapter.isOpen()) {
                    this.onInactive?.();
                    return;
                }
                if (records.some((record) => !this.root?.contains(record.target))) this.queueRender();
            });
            this.observer.observe(this.surface, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'data-state'] });
        }
        this.render();
        return true;
    }

    queueRender() {
        if (this.renderQueued || !this.root?.isConnected) return;
        this.renderQueued = true;
        queueMicrotask(() => {
            this.renderQueued = false;
            if (this.root?.isConnected) this.render();
        });
    }

    render() {
        if (!this.root) return;
        const documentObject = this.root.ownerDocument;
        const snapshot = this.repository.snapshot || this.repository.read();
        const native = this.adapter.read();
        const selected = new Set(native.tags.map(keyOfTag));
        const collapsed = snapshot.uploadSettings.collapsed;
        this.root.dataset.theme = snapshot.uiSettings.theme;
        this.root.replaceChildren(this.root.querySelector('style'));
        const head = make(documentObject, 'div', { className: 'vgen-nya-upload__head' });
        const refresh = make(documentObject, 'button', { type: 'button', className: 'vgen-nya-upload__icon', dataset: { action: 'refresh' }, title: '仅刷新 Upload Assistant 配置' });
        setButtonIcon(refresh, 'refresh', { size: 13 });
        head.append(
            make(documentObject, 'strong', {}, `Upload Assistant · ${native.tags.length}/${native.tagLimit}`),
            refresh,
            make(documentObject, 'button', { type: 'button', dataset: { action: 'collapse' }, 'aria-expanded': String(!collapsed) }, collapsed ? '展开' : '折叠'),
        );
        this.root.append(head);
        if (collapsed) return;
        const modules = make(documentObject, 'div', { className: 'vgen-nya-upload__modules' });
        const settings = snapshot.uploadSettings.modules;
        if (settings.global) modules.append(this.globalStrip(documentObject, snapshot));
        if (settings.title) modules.append(this.strip(documentObject, '标题', 'title', snapshot.titlePresets, native.title));
        if (settings.description) modules.append(this.strip(documentObject, '描述', 'description', snapshot.descriptionPresets, native.description));
        if (settings.discovery) modules.append(this.strip(documentObject, '发现标签', 'discovery', snapshot.discoveryPresets));
        if (settings.tags) this.#renderTagGroups(documentObject, modules, snapshot, selected);
        modules.append(make(documentObject, 'div', { className: 'vgen-nya-upload__status', dataset: { role: 'status' } }));
        this.root.append(modules);
    }

    globalStrip(documentObject, snapshot) {
        const strip = make(documentObject, 'div', { className: 'vgen-nya-upload__strip vgen-nya-upload__strip--global' });
        const row = make(documentObject, 'div', { className: 'vgen-nya-upload__strip-row' });
        const brand = make(documentObject, 'div', { className: 'vgen-nya-upload__brand' });
        brand.append(
            make(documentObject, 'span', { className: 'vgen-nya-upload__brand-name' }, 'VGenToolNya'),
            make(documentObject, 'span', { className: 'vgen-nya-upload__brand-meta' }, `by @Nekori_Net · v${PLUGIN_VERSION}`),
        );
        row.append(brand, this.#presetSelect(documentObject, 'combination', snapshot.combinationPresets));
        strip.append(row);
        return strip;
    }

    strip(documentObject, label, kind, presets, currentValue = undefined) {
        const strip = make(documentObject, 'div', { className: 'vgen-nya-upload__strip' });
        const row = make(documentObject, 'div', { className: 'vgen-nya-upload__strip-row' });
        row.append(
            make(documentObject, 'span', { className: 'vgen-nya-upload__strip-label' }, label),
            this.#presetSelect(documentObject, kind, presets, currentValue),
            this.#saveCurrentButton(documentObject, kind),
        );
        strip.append(row);
        return strip;
    }

    #presetSelect(documentObject, kind, presets, currentValue = undefined) {
        const select = make(documentObject, 'select', { dataset: { kind }, 'aria-label': '选择预设' });
        select.append(make(documentObject, 'option', { value: '' }, '选择预设'));
        for (const preset of presets) select.append(make(documentObject, 'option', { value: preset.id }, preset.name || '未命名'));
        if (currentValue !== undefined) select.value = String(presets.find((preset) => presetValue(preset, kind) === currentValue)?.id || '');
        return select;
    }

    #saveCurrentButton(documentObject, kind) {
        const button = make(documentObject, 'button', { type: 'button', className: 'vgen-nya-upload__strip-action', dataset: { action: 'save-current', kind }, title: '保存当前为预设' });
        setButtonIcon(button, 'plus', { size: 12, label: '保存当前' });
        return button;
    }

    #renderTagGroups(documentObject, modules, snapshot, selected) {
        for (const [index, group] of snapshot.searchTagGroups.entries()) {
            const tags = Array.isArray(group.tags) ? group.tags : [];
            const count = tags.filter((tag) => selected.has(keyOfTag(tag))).length;
            const expanded = snapshot.uploadSettings.groupExpanded?.[group.id] ?? index === 0;
            const groupEl = make(documentObject, 'div', { className: 'vgen-nya-upload__group', dataset: { expanded: String(expanded) } });
            const heading = make(documentObject, 'div', { className: 'vgen-nya-upload__group-heading' });
            const toggle = make(documentObject, 'button', { type: 'button', className: 'vgen-nya-upload__group-toggle', 'aria-expanded': String(expanded) });
            const chevron = make(documentObject, 'span', { className: 'vgen-nya-upload__group-chevron' });
            chevron.innerHTML = iconSvg('chevronRight', 14);
            toggle.append(chevron, make(documentObject, 'span', { className: 'vgen-nya-upload__group-name' }, group.name || '未命名'));
            toggle.addEventListener('click', () => {
                const next = this.repository.read().uploadSettings;
                next.groupExpanded[group.id] = !expanded;
                this.repository.writeSettings(next);
            });
            const mini = make(documentObject, 'div', { className: 'vgen-nya-upload__group-mini-actions' });
            mini.append(this.#miniGroupAction(documentObject, 'group-add', group.id, 'plus', '全部添加'), this.#miniGroupAction(documentObject, 'group-remove', group.id, 'minus', '全部删除'));
            const progress = make(documentObject, 'div', { className: 'vgen-nya-upload__group-progress', 'aria-hidden': 'true' });
            const progressFill = make(documentObject, 'span', { className: 'vgen-nya-upload__group-progress-fill' });
            progressFill.style.width = tags.length ? `${Math.round((count / tags.length) * 100)}%` : '0%';
            progress.append(progressFill);
            heading.append(toggle, make(documentObject, 'span', { className: 'vgen-nya-upload__group-count' }, `${count}/${tags.length}`), mini, progress);
            groupEl.append(heading);
            if (expanded) {
                const list = make(documentObject, 'div', { className: 'vgen-nya-upload__tags' });
                for (const item of tags) list.append(this.#tagButton(documentObject, item, selected));
                const toolbar = make(documentObject, 'div', { className: 'vgen-nya-upload__group-toolbar' });
                toolbar.append(
                    make(documentObject, 'button', { type: 'button', className: 'vgen-nya-upload__group-action', dataset: { action: 'group-add', groupId: group.id } }, '全部添加'),
                    make(documentObject, 'button', { type: 'button', className: 'vgen-nya-upload__group-action', dataset: { action: 'group-remove', groupId: group.id } }, '全部删除'),
                );
                groupEl.append(list, toolbar);
            }
            modules.append(groupEl);
        }
    }

    #miniGroupAction(documentObject, action, groupId, icon, label) {
        const button = make(documentObject, 'button', { type: 'button', className: 'vgen-nya-upload__group-mini-action', dataset: { action, groupId }, title: label });
        button.innerHTML = iconSvg(icon, 13);
        return button;
    }

    #tagButton(documentObject, item, selected) {
        const value = typeof item === 'string' ? item : item.tag;
        const key = keyOfTag(value);
        const button = make(documentObject, 'button', {
            type: 'button', className: 'vgen-nya-upload__tag', dataset: { action: 'tag', tag: value, state: selected.has(key) ? 'selected' : 'normal' },
            title: item?.note ? `${value}（${item.note}）` : value,
            'aria-pressed': String(selected.has(key)),
        }, item?.note ? `${value}【${item.note}】` : value);
        return button;
    }

    setStatus(message) {
        const status = this.root?.querySelector('[data-role="status"]');
        if (status) status.textContent = message;
    }

    async onChange(event) {
        const select = event.target?.closest?.('select[data-kind]');
        if (!select?.value) return;
        const snapshot = this.repository.snapshot || this.repository.read();
        const map = { combination: 'combinationPresets', title: 'titlePresets', description: 'descriptionPresets', discovery: 'discoveryPresets' };
        const preset = snapshot[map[select.dataset.kind]]?.find((item) => String(item.id) === select.value);
        if (!preset) return;
        let message;
        try {
            if (select.dataset.kind === 'combination') await this.adapter.applyCombination(preset);
            else if (select.dataset.kind === 'discovery') {
                await this.adapter.applyDiscovery(preset);
                if (snapshot.uploadSettings.autoCollapseDiscovery) this.adapter.collapseDiscovery?.();
            }
            else if (this.textPresetEngine) {
                const context = select.dataset.kind === 'title' ? TEXT_PRESET_CONTEXTS.uploadTitle : TEXT_PRESET_CONTEXTS.uploadDescription;
                await this.textPresetEngine.select(context, preset.id, this.adapter);
            }
            else await this.adapter.applyText(select.dataset.kind, presetValue(preset, select.dataset.kind));
            message = `已应用“${preset.name || '未命名'}”`;
        } catch (error) {
            message = error.message || '应用失败';
        } finally {
            select.value = '';
            this.render();
            this.setStatus(message);
        }
    }

    async onClick(event) {
        const button = event.target?.closest?.('button[data-action]');
        if (!button || !this.root.contains(button)) return;
        const snapshot = this.repository.snapshot || this.repository.read();
        if (button.dataset.action === 'refresh') { this.repository.refresh(); this.setStatus('已刷新 Upload Assistant 配置'); return; }
        if (button.dataset.action === 'collapse') { const next = snapshot.uploadSettings; next.collapsed = !next.collapsed; this.repository.writeSettings(next); return; }
        if (button.dataset.action === 'save-current') {
            const name = this.root.ownerDocument.defaultView?.prompt?.('预设名称');
            if (!name?.trim()) return;
            const native = this.adapter.read({ includeDiscovery: true, includeDiscoverySchema: true });
            const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const domainByKind = { combination: 'combinationPresets', title: 'titlePresets', description: 'descriptionPresets', discovery: 'discoveryPresets' };
            const domain = domainByKind[button.dataset.kind];
            const values = snapshot[domain];
            if (button.dataset.kind === 'combination') values.push({ id, name: name.trim(), title: native.title, description: native.description, discoverySchema: native.discoverySchema || [], discoveryValues: native.discoveryValues, tags: native.tags });
            else if (button.dataset.kind === 'discovery') values.push({ id, name: name.trim(), schema: native.discoverySchema || [], values: native.discoveryValues });
            else if (this.textPresetEngine) {
                const context = button.dataset.kind === 'title' ? TEXT_PRESET_CONTEXTS.uploadTitle : TEXT_PRESET_CONTEXTS.uploadDescription;
                this.textPresetEngine.create(context, { id, name: name.trim(), payload: native[button.dataset.kind] });
            }
            else values.push({ id, name: name.trim(), value: native[button.dataset.kind] });
            if (button.dataset.kind === 'combination' || button.dataset.kind === 'discovery' || !this.textPresetEngine) this.repository.writeDomain(domain, values);
            this.setStatus(`已保存“${name.trim()}”`);
            return;
        }
        const current = this.adapter.read().tags;
        if (button.dataset.action === 'tag') {
            const key = keyOfTag(button.dataset.tag);
            const removing = current.some((tag) => keyOfTag(tag) === key);
            const next = removing ? current.filter((tag) => keyOfTag(tag) !== key) : [...current, button.dataset.tag];
            button.dataset.state = removing ? 'removing' : 'running';
            try {
                await this.adapter.setTags(next);
            } catch {
                button.dataset.state = 'failed';
            }
            this.render();
            return;
        }
        const group = snapshot.searchTagGroups.find((item) => String(item.id) === button.dataset.groupId);
        if (!group) return;
        const groupTags = (group.tags || []).map((item) => typeof item === 'string' ? item : item.tag);
        const keys = new Set(groupTags.map(keyOfTag));
        const next = button.dataset.action === 'group-remove'
            ? current.filter((tag) => !keys.has(keyOfTag(tag)))
            : [...current, ...groupTags.filter((tag) => !current.some((item) => keyOfTag(item) === keyOfTag(tag)))].slice(0, this.adapter.read().tagLimit);
        await this.adapter.setTags(next); this.render();
    }

    unmount() {
        this.observer?.disconnect();
        this.observer = null;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.root?.remove();
        this.root = null;
    }
}

export class UploadAssistantRuntime {
    constructor({ repository, textPresetEngine, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapterFactory = (surface) => new VGenUploadAdapter(surface) }) {
        this.repository = repository;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.adapterFactory = adapterFactory;
        this.textPresetEngine = textPresetEngine;
        this.sessions = new Map();
        this.portalObserver = null;
        this.probes = new Map();
    }

    mount() {
        if (this.portalObserver || !this.documentObject?.body) return false;
        this.repository.read();
        this.scanKnownModals(this.documentObject);
        if (this.MutationObserverClass) {
            this.portalObserver = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) {
                        if (!this.scanKnownModals(node)) this.probeAddedRoot(node);
                    }
                    for (const node of record.removedNodes || []) this.releaseRemoved(node);
                }
            });
            this.portalObserver.observe(this.documentObject.body, { childList: true });
        }
        return true;
    }

    scanKnownModals(root) {
        const selector = VGenUploadAdapter.modalSelector;
        const candidates = [
            ...(root.matches?.(selector) ? [root] : []),
            ...(root.querySelectorAll?.(selector) || []),
        ];
        let mounted = 0;
        for (const surface of candidates) {
            if (this.sessions.has(surface)) continue;
            const adapter = this.adapterFactory(surface);
            if (!adapter.findTagInput?.()) continue;
            const session = new UploadAssistantSession({
                surface, repository: this.repository, textPresetEngine: this.textPresetEngine, adapter, MutationObserverClass: this.MutationObserverClass,
                onInactive: () => { session.unmount(); this.sessions.delete(surface); },
            });
            session.mount();
            this.sessions.set(surface, session);
            mounted += 1;
        }
        return mounted;
    }

    probeAddedRoot(root) {
        if (!this.MutationObserverClass || !root?.querySelectorAll || this.probes.has(root)) return;
        const likelyPortal = root.matches?.(`${VGenUploadAdapter.modalSelector}, .ReactModalPortal, [data-radix-portal], [data-portal]`)
            || root.querySelector?.('.ReactModalPortal, [data-radix-portal], [data-portal]');
        if (!likelyPortal) return;
        const observer = new this.MutationObserverClass(() => {
            if (this.scanKnownModals(root)) this.releaseProbe(root);
        });
        observer.observe(root, { childList: true, subtree: true });
        const timer = globalThis.setTimeout(() => this.releaseProbe(root), 10000);
        this.probes.set(root, { observer, timer });
    }

    releaseProbe(root) {
        const probe = this.probes.get(root);
        if (!probe) return;
        probe.observer.disconnect();
        globalThis.clearTimeout(probe.timer);
        this.probes.delete(root);
    }

    releaseRemoved(root) {
        for (const probeRoot of [...this.probes.keys()]) {
            if (probeRoot === root || root.contains?.(probeRoot) || !probeRoot.isConnected) {
                this.releaseProbe(probeRoot);
            }
        }
        for (const [surface, session] of this.sessions) {
            if (surface === root || root.contains?.(surface) || !surface.isConnected) {
                session.unmount();
                this.sessions.delete(surface);
            }
        }
    }

    activate() {}

    unmount() {
        this.portalObserver?.disconnect();
        this.portalObserver = null;
        for (const root of [...this.probes.keys()]) this.releaseProbe(root);
        for (const session of this.sessions.values()) session.unmount();
        this.sessions.clear();
    }

    dispose() { this.unmount(); }
}
