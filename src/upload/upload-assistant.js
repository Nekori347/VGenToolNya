import { VGenUploadAdapter } from './vgen-upload-adapter.js';
import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';

const CSS = `
.vgen-nya-upload{margin:10px 0;padding:10px;border:1px solid #cfd8e3;border-radius:10px;background:#f8fbff;color:#253247;font:13px/1.4 system-ui,sans-serif}.vgen-nya-upload *{box-sizing:border-box}.vgen-nya-upload__head{display:flex;align-items:center;gap:8px}.vgen-nya-upload__head strong{flex:1}.vgen-nya-upload button,.vgen-nya-upload select{font:inherit}.vgen-nya-upload button{cursor:pointer}.vgen-nya-upload__modules{display:grid;gap:8px;margin-top:9px}.vgen-nya-upload__row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.vgen-nya-upload__row>label{min-width:72px;font-weight:600}.vgen-nya-upload__row select{min-width:160px;max-width:360px}.vgen-nya-upload__groups{display:grid;gap:6px}.vgen-nya-upload__group{border:1px solid #d9e1ea;border-radius:8px;overflow:hidden}.vgen-nya-upload__group summary{padding:6px 8px;cursor:pointer}.vgen-nya-upload__tags{display:flex;flex-wrap:wrap;gap:5px;padding:7px}.vgen-nya-upload__tag[aria-pressed=true]{background:#1e78ca;color:#fff}.vgen-nya-upload__status{min-height:1.3em;color:#55657a}.vgen-nya-upload[data-theme=dark]{background:#1f2935;color:#eef5ff;border-color:#4b5b6d}.vgen-nya-upload[data-theme=dark] .vgen-nya-upload__group{border-color:#4b5b6d}
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
        style.textContent = CSS;
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
        head.append(
            make(documentObject, 'strong', {}, `Upload Assistant · ${native.tags.length}/${native.tagLimit}`),
            make(documentObject, 'button', { type: 'button', dataset: { action: 'refresh' }, title: '仅刷新 Upload Assistant 配置' }, '↻'),
            make(documentObject, 'button', { type: 'button', dataset: { action: 'collapse' }, 'aria-expanded': String(!collapsed) }, collapsed ? '展开' : '折叠'),
        );
        this.root.append(head);
        if (collapsed) return;
        const modules = make(documentObject, 'div', { className: 'vgen-nya-upload__modules' });
        const settings = snapshot.uploadSettings.modules;
        if (settings.global) modules.append(this.presetRow(documentObject, '组合预设', 'combination', snapshot.combinationPresets));
        if (settings.title) modules.append(this.presetRow(documentObject, '标题', 'title', snapshot.titlePresets, native.title));
        if (settings.description) modules.append(this.presetRow(documentObject, '描述', 'description', snapshot.descriptionPresets, native.description));
        if (settings.discovery) modules.append(this.presetRow(documentObject, '发现标签', 'discovery', snapshot.discoveryPresets));
        if (settings.tags) {
            const groups = make(documentObject, 'div', { className: 'vgen-nya-upload__groups' });
            for (const [index, group] of snapshot.searchTagGroups.entries()) {
                const details = make(documentObject, 'details', { className: 'vgen-nya-upload__group', open: snapshot.uploadSettings.groupExpanded?.[group.id] ?? index === 0 });
                const tags = Array.isArray(group.tags) ? group.tags : [];
                const count = tags.filter((tag) => selected.has(keyOfTag(tag))).length;
                const summary = make(documentObject, 'summary', {}, `${group.name || '未命名'} ${count}/${tags.length}`);
                const list = make(documentObject, 'div', { className: 'vgen-nya-upload__tags' });
                list.append(
                    make(documentObject, 'button', { type: 'button', dataset: { action: 'group-add', groupId: group.id } }, '全部添加'),
                    make(documentObject, 'button', { type: 'button', dataset: { action: 'group-remove', groupId: group.id } }, '全部删除'),
                );
                for (const item of tags) {
                    const value = typeof item === 'string' ? item : item.tag;
                    list.append(make(documentObject, 'button', {
                        type: 'button', className: 'vgen-nya-upload__tag', dataset: { action: 'tag', tag: value },
                        title: item?.note ? `${value}（${item.note}）` : value,
                        'aria-pressed': String(selected.has(keyOfTag(value))),
                    }, item?.note ? `${value}【${item.note}】` : value));
                }
                details.addEventListener('toggle', () => {
                    const next = this.repository.read().uploadSettings;
                    next.groupExpanded[group.id] = details.open;
                    this.repository.writeSettings(next);
                }, { once: true });
                details.append(summary, list);
                groups.append(details);
            }
            modules.append(groups);
        }
        modules.append(make(documentObject, 'div', { className: 'vgen-nya-upload__status', dataset: { role: 'status' } }));
        this.root.append(modules);
    }

    presetRow(documentObject, label, kind, presets, currentValue = undefined) {
        const row = make(documentObject, 'div', { className: 'vgen-nya-upload__row' });
        const select = make(documentObject, 'select', { dataset: { kind }, 'aria-label': label });
        select.append(make(documentObject, 'option', { value: '' }, `选择${label}`));
        for (const preset of presets) select.append(make(documentObject, 'option', { value: preset.id }, preset.name || '未命名'));
        if (currentValue !== undefined) select.value = String(presets.find((preset) => presetValue(preset, kind) === currentValue)?.id || '');
        row.append(
            make(documentObject, 'label', {}, label),
            select,
            make(documentObject, 'button', { type: 'button', dataset: { action: 'save-current', kind } }, '保存当前'),
        );
        return row;
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
            const next = current.some((tag) => keyOfTag(tag) === key)
                ? current.filter((tag) => keyOfTag(tag) !== key) : [...current, button.dataset.tag];
            await this.adapter.setTags(next); this.render(); return;
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
