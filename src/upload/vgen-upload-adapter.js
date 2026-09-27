const MODAL_SELECTOR = '.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]';
const TAG_INPUT_SELECTOR = 'input[placeholder*="tag" i], input[placeholder*="标签"], input[aria-label*="tag" i], input[aria-label*="标签"]';

function ownReactValue(element, prefix) {
    if (!element) return null;
    const key = Object.getOwnPropertyNames(element).find((name) => name.startsWith(prefix));
    return key ? element[key] : null;
}

function fiberCandidates(fiber) {
    return fiber?.alternate ? [fiber, fiber.alternate] : fiber ? [fiber] : [];
}

function reactProps(element) {
    return ownReactValue(element, '__reactProps$');
}

function expandableDisclosure(control, surface) {
    const content = control.closest?.('[aria-hidden]');
    const root = content?.parentElement;
    if (!root || !surface.contains(root)) return null;
    let node = control;
    for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1,
        node = node.parentElement || node.getRootNode?.()?.host || null) {
        let fiber = ownReactValue(node, '__reactFiber$') || ownReactValue(node, '__reactInternalInstance$');
        for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
            for (const candidate of fiberCandidates(fiber)) {
                const props = candidate.memoizedProps || candidate.pendingProps;
                if (!Object.hasOwn(props || {}, 'isDefaultHidden') || typeof props?.onClickExpand !== 'function') continue;
                let openHook = candidate.memoizedState;
                while (openHook && !(typeof openHook.memoizedState === 'boolean' && typeof openHook.queue?.dispatch === 'function')) openHook = openHook.next;
                if (!openHook) continue;
                return {
                    root,
                    collapse() {
                        if (openHook.memoizedState !== true && ![...root.children].some((child) => child.getAttribute?.('aria-hidden') === 'false')) return;
                        const onClick = reactProps(root)?.onClick;
                        if (typeof onClick === 'function') onClick();
                        else { openHook.queue.dispatch(false); props.onClickExpand(false); }
                    },
                };
            }
        }
    }
    return null;
}

function deepQueryAll(root, selector) {
    const matches = [];
    const queue = [root].filter(Boolean);
    const visited = new Set();
    while (queue.length) {
        const current = queue.shift();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        matches.push(...current.querySelectorAll(selector));
        const documentObject = current.ownerDocument || current.host?.ownerDocument;
        if (!documentObject?.createTreeWalker) continue;
        const walker = documentObject.createTreeWalker(current, globalThis.NodeFilter?.SHOW_ELEMENT || 1);
        for (let element = walker.nextNode(); element; element = walker.nextNode()) {
            if (element.shadowRoot) queue.push(element.shadowRoot);
        }
    }
    return [...new Set(matches)];
}

function tagBridgeFromInput(input) {
    let node = input;
    for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1, node = node.parentElement) {
        let fiber = ownReactValue(node, '__reactFiber$') || ownReactValue(node, '__reactInternalInstance$');
        for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
            for (const candidate of fiberCandidates(fiber)) {
                for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                    if (Array.isArray(props?.initialTags) && typeof props?.onChange === 'function') {
                        const tagLimit = Number.isFinite(Number(props.tagLimit)) ? Number(props.tagLimit) : 20;
                        if (tagLimit === 5 || props.isDisplayOnly === true || props.showSelectedTags === false) continue;
                        return { props, onChange: props.onChange, tags: [...props.initialTags], tagLimit, fiber: candidate };
                    }
                }
            }
        }
    }
    return null;
}

function findStore(bridge) {
    let fiber = bridge?.fiber;
    for (let depth = 0; fiber && depth < 80; depth += 1, fiber = fiber.return) {
        for (const candidate of fiberCandidates(fiber)) {
            const values = [candidate.memoizedProps, candidate.pendingProps, candidate.memoizedState, candidate.stateNode];
            let dependency = candidate.dependencies?.firstContext;
            for (let index = 0; dependency && index < 20; index += 1, dependency = dependency.next) values.push(dependency.memoizedValue);
            for (const value of values) {
                for (const store of [value, value?.store, value?.value, value?.value?.store, value?.contextValue, value?.contextValue?.store]) {
                    if (store && typeof store.getState === 'function' && typeof store.dispatch === 'function' && showcaseBody(store)) return store;
                }
            }
        }
    }
    return null;
}

function showcaseBody(store) {
    const state = store?.getState?.();
    const slices = [state?.showcase, state?.showcaseReducer, state?.showcaseModal, state?.showcaseForm, ...Object.values(state || {})];
    const candidates = [state?.body, ...slices.map((slice) => slice?.body)];
    return candidates.find((value) => value && typeof value === 'object' && ('tags' in value || 'title' in value)) || null;
}

function walkAncestorProps(element, visitor) {
    let node = element;
    for (let nodeDepth = 0; node && nodeDepth < 12; nodeDepth += 1,
        node = node.parentElement || node.getRootNode?.()?.host || null) {
        let fiber = ownReactValue(node, '__reactFiber$') || ownReactValue(node, '__reactInternalInstance$');
        for (let depth = 0; fiber && depth < 35; depth += 1, fiber = fiber.return) {
            for (const candidate of fiberCandidates(fiber)) {
                for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                    const result = visitor(props, candidate);
                    if (result) return result;
                }
            }
        }
    }
    return null;
}

function findDiscoveryBridge(surface) {
    const controls = surface.querySelectorAll('button, [role="button"], input[type="radio"], input[type="checkbox"]');
    for (const control of controls) {
        const bridge = walkAncestorProps(control, (props) => {
            if (props?.formValues && typeof props.formValues === 'object' && typeof props.onFormValueChange === 'function') {
                return { values: props.formValues, commit: props.onFormValueChange };
            }
            return null;
        });
        if (bridge) return bridge;
    }
    return null;
}

function findDiscoverySchema(surface) {
    const options = new Map();
    const controls = surface.querySelectorAll('button, [role="button"], input[type="radio"], input[type="checkbox"]');
    for (const control of controls) {
        walkAncestorProps(control, (props) => {
            const option = props?.option;
            const id = String(option?.optionID || '').trim();
            if (id && Array.isArray(option?.variants) && !options.has(id)) options.set(id, structuredClone(option));
            return null;
        });
    }
    return [...options.values()];
}

function findSlateEditor(surface) {
    const controls = deepQueryAll(surface, '.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"]');
    for (const control of controls) {
        const editor = walkAncestorProps(control, (_props, fiber) => {
            for (const candidate of fiberCandidates(fiber)) {
                let hook = candidate.memoizedState;
                for (let index = 0; hook && index < 40; index += 1, hook = hook.next) {
                    const value = hook.memoizedState;
                    if (Array.isArray(value?.children) && typeof value.apply === 'function') return value;
                }
            }
            return null;
        });
        if (editor) return editor;
    }
    return null;
}

function replaceSlateValue(editor, serialized) {
    const nodes = JSON.parse(String(serialized || '[]'));
    if (!Array.isArray(nodes)) throw new TypeError('Description preset must contain Slate JSON');
    const apply = () => {
        for (let index = editor.children.length - 1; index >= 0; index -= 1) editor.apply({ type: 'remove_node', path: [index], node: editor.children[index] });
        nodes.forEach((node, index) => editor.apply({ type: 'insert_node', path: [index], node }));
    };
    if (typeof editor.withoutNormalizing === 'function') editor.withoutNormalizing(apply);
    else apply();
}

function findTextCommit(surface, kind) {
    const selector = kind === 'title'
        ? 'input:not([type]), input[type="text"]'
        : '.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"], textarea';
    for (const control of deepQueryAll(surface, selector)) {
        const commit = walkAncestorProps(control, (props) => {
            if (kind === 'title' && typeof props?.onChange === 'function' && typeof props?.value === 'string') return props.onChange;
            if (kind === 'description') return props?.onEditCallback || props?.onValueChange || (typeof props?.onChange === 'function' ? props.onChange : null);
            return null;
        });
        if (commit) return commit;
    }
    return null;
}

function tagKey(value) {
    return String(typeof value === 'string' ? value : value?.tag || '').trim().toLocaleLowerCase();
}

export class VGenUploadAdapter {
    constructor(surface) {
        this.surface = surface;
    }

    static modalSelector = MODAL_SELECTOR;

    isOpen() {
        return Boolean(this.surface?.isConnected && !this.surface.hidden && this.surface.getAttribute?.('aria-hidden') !== 'true');
    }

    findTagInput() {
        for (const input of this.surface.querySelectorAll(TAG_INPUT_SELECTOR)) {
            if (tagBridgeFromInput(input)) return input;
        }
        return null;
    }

    bridge() {
        const input = this.findTagInput();
        return input ? tagBridgeFromInput(input) : null;
    }

    read({ includeDiscovery = false, includeDiscoverySchema = false } = {}) {
        const bridge = this.bridge();
        const store = findStore(bridge);
        const body = showcaseBody(store);
        const discovery = includeDiscovery ? findDiscoveryBridge(this.surface) : null;
        return {
            title: String(body?.title || ''),
            description: String(body?.description || ''),
            discoveryValues: discovery?.values ? structuredClone(discovery.values) : body?.searchCategoryVariantKeys ? [...body.searchCategoryVariantKeys] : [],
            discoverySchema: includeDiscoverySchema ? findDiscoverySchema(this.surface) : [],
            tags: [...(body?.tags || bridge?.tags || [])],
            tagLimit: bridge?.tagLimit || 20,
        };
    }

    async setTags(tags) {
        const bridge = this.bridge();
        if (!bridge) throw new Error('VGen Search Tags component is not ready');
        const unique = [];
        const seen = new Set();
        for (const tag of tags) {
            const value = String(typeof tag === 'string' ? tag : tag?.tag || '').trim().replace(/ {2,}/g, ' ').toLocaleLowerCase();
            if (!/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(value) || value.length > 50) throw new Error(`Invalid VGen Search Tag: ${value}`);
            const key = tagKey(value);
            if (value && !seen.has(key)) { seen.add(key); unique.push(value); }
        }
        if (unique.length > bridge.tagLimit) throw new Error(`Search Tags exceed the ${bridge.tagLimit} tag limit`);
        await bridge.onChange(unique);
        return unique;
    }

    async applyText(kind, value) {
        const bridge = this.bridge();
        const store = findStore(bridge);
        if (kind === 'title') {
            const text = String(value || '');
            if (store) store.dispatch({ type: 'SHOWCASE/UPDATE-TITLE', title: text });
            else {
                const commit = findTextCommit(this.surface, kind);
                if (!commit) throw new Error('VGen Title field is not ready');
                await commit({ target: { value: text }, currentTarget: { value: text } });
            }
        }
        else {
            const serialized = String(value || '');
            const editor = findSlateEditor(this.surface);
            if (editor) replaceSlateValue(editor, serialized);
            if (store) store.dispatch({ type: 'SHOWCASE/UPDATE-DESCRIPTION', description: serialized });
            else {
                const commit = findTextCommit(this.surface, kind);
                if (!commit) throw new Error('VGen Description field is not ready');
                await commit(serialized);
            }
        }
    }

    async applyDiscovery(preset) {
        const values = preset?.values || {};
        const form = findDiscoveryBridge(this.surface);
        if (form) {
            for (const [optionId, value] of Object.entries(values)) await form.commit(optionId, structuredClone(value));
            return;
        }
        const bridge = this.bridge();
        const store = findStore(bridge);
        if (!store) throw new Error('VGen Discovery form is not ready');
        const keys = Array.isArray(values) ? values : Object.values(values).flat().filter(Boolean);
        store.dispatch({
            type: 'SHOWCASE/SET-SEARCH-CATEGORY-VARIANT-KEYS',
            payload: { searchCategoryVariantKeys: keys },
        });
    }

    collapseDiscovery() {
        const disclosures = new Map();
        for (const control of this.surface.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
            const disclosure = expandableDisclosure(control, this.surface);
            if (disclosure) disclosures.set(disclosure.root, disclosure);
        }
        for (const disclosure of disclosures.values()) disclosure.collapse();
    }

    async applyCombination(preset) {
        await this.applyText('title', preset?.title || '');
        await this.applyText('description', preset?.description || '');
        await this.applyDiscovery({ values: preset?.discoveryValues || {} });
        await this.setTags(preset?.tags || []);
    }
}
