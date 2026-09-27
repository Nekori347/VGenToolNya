import { SETTINGS_NAVIGATION } from './navigation.js';

const SHELL_CSS = `
.vgen-nya-settings { color: #242424; background: #fff; border: 1px solid #ddd; border-radius: 12px; display: grid; grid-template-columns: 180px minmax(0, 1fr); min-height: 420px; overflow: hidden; font: 14px/1.45 system-ui, sans-serif; }
.vgen-nya-settings * { box-sizing: border-box; }
.vgen-nya-settings__nav { padding: 14px 10px; background: #f6f7f8; border-right: 1px solid #e4e5e7; }
.vgen-nya-settings__nav-title { margin: 0 8px 12px; font-size: 16px; }
.vgen-nya-settings__nav button, .vgen-nya-settings__tabs button, .vgen-nya-settings__section-toggle { font: inherit; }
.vgen-nya-settings__nav button { width: 100%; padding: 8px 10px; border: 0; border-radius: 7px; text-align: left; background: transparent; cursor: pointer; }
.vgen-nya-settings__nav button[aria-current="page"] { background: #e6f1ff; color: #145dab; font-weight: 650; }
.vgen-nya-settings__main { min-width: 0; padding: 18px; }
.vgen-nya-settings__heading { margin: 0 0 12px; font-size: 20px; }
.vgen-nya-settings__tabs { display: flex; gap: 6px; overflow-x: auto; border-bottom: 1px solid #ddd; }
.vgen-nya-settings__tabs button { border: 0; border-bottom: 2px solid transparent; padding: 8px 10px; background: transparent; white-space: nowrap; cursor: pointer; }
.vgen-nya-settings__tabs button[aria-selected="true"] { border-bottom-color: #1976d2; color: #145dab; font-weight: 650; }
.vgen-nya-settings__panels { padding-top: 14px; }
.vgen-nya-settings__section { border: 1px solid #e1e1e1; border-radius: 9px; margin-bottom: 10px; overflow: hidden; }
.vgen-nya-settings__section-toggle { display: flex; justify-content: space-between; width: 100%; padding: 11px 13px; border: 0; background: #fafafa; cursor: pointer; font-weight: 650; }
.vgen-nya-settings__section-body { padding: 12px 13px; color: #666; }
.vgen-nya-settings__preset-row { display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #eee; }
.vgen-nya-settings__check { display:block;margin:7px 0; }
.vgen-nya-settings__toolbar { margin-bottom:8px; }
@media (max-width: 680px) { .vgen-nya-settings { grid-template-columns: 1fr; } .vgen-nya-settings__nav { border-right: 0; border-bottom: 1px solid #e4e5e7; } }
`;

function element(documentObject, tagName, attributes = {}, text = '') {
    const node = documentObject.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
        if (name === 'className') node.className = value;
        else if (name.startsWith('data-')) {
            const datasetName = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            node.dataset[datasetName] = value;
        }
        else node.setAttribute(name, value);
    }
    if (text) node.textContent = text;
    return node;
}

export function createSettingsShell({ navigation = SETTINGS_NAVIGATION } = {}) {
    let root = null;
    let navContainer = null;
    let heading = null;
    let tabsContainer = null;
    let panelsContainer = null;
    let activeNavigation = navigation[0]?.id || '';
    const activeTabByNavigation = new Map();
    const expandedSections = new Set();
    let renderCleanups = [];

    function cleanupRenderedSections() {
        for (const cleanup of renderCleanups.splice(0).reverse()) cleanup();
    }

    const findNavigation = (id) => navigation.find((item) => item.id === id);
    const currentNavigation = () => findNavigation(activeNavigation) || navigation[0];
    const currentTab = () => {
        const item = currentNavigation();
        const activeId = activeTabByNavigation.get(item.id) || item.tabs[0]?.id;
        return item.tabs.find((tab) => tab.id === activeId) || item.tabs[0];
    };

    function renderNavigation(documentObject) {
        navContainer.replaceChildren();
        for (const item of navigation) {
            const button = element(documentObject, 'button', {
                type: 'button',
                'data-action': 'navigation',
                'data-id': item.id,
                'aria-current': item.id === activeNavigation ? 'page' : 'false',
            }, item.label);
            navContainer.append(button);
        }
    }

    function renderContent(documentObject) {
        cleanupRenderedSections();
        const navigationItem = currentNavigation();
        const tab = currentTab();
        heading.textContent = navigationItem.label;
        tabsContainer.replaceChildren();
        for (const item of navigationItem.tabs) {
            const button = element(documentObject, 'button', {
                type: 'button',
                role: 'tab',
                'data-action': 'tab',
                'data-id': item.id,
                'aria-selected': String(item.id === tab.id),
            }, item.label);
            tabsContainer.append(button);
        }
        panelsContainer.replaceChildren();
        const panel = element(documentObject, 'div', { role: 'tabpanel' });
        for (const section of tab.sections) {
            const sectionKey = `${navigationItem.id}:${tab.id}:${section.id}`;
            const expanded = expandedSections.has(sectionKey);
            const wrapper = element(documentObject, 'section', { className: 'vgen-nya-settings__section' });
            const toggle = element(documentObject, 'button', {
                type: 'button',
                className: 'vgen-nya-settings__section-toggle',
                'data-action': 'section',
                'data-id': sectionKey,
                'aria-expanded': String(expanded),
            });
            toggle.append(
                element(documentObject, 'span', {}, section.title),
                element(documentObject, 'span', { 'aria-hidden': 'true' }, expanded ? '−' : '+'),
            );
            const body = element(documentObject, 'div', { className: 'vgen-nya-settings__section-body' }, section.description);
            body.hidden = !expanded;
            if (expanded && typeof section.render === 'function') {
                body.textContent = '';
                section.render({
                    documentObject,
                    body,
                    use(cleanup) { if (typeof cleanup === 'function') renderCleanups.push(cleanup); },
                });
            }
            wrapper.append(toggle, body);
            panel.append(wrapper);
        }
        panelsContainer.append(panel);
    }

    function selectNavigation(id) {
        if (!findNavigation(id) || id === activeNavigation) return false;
        activeNavigation = id;
        renderNavigation(root.ownerDocument);
        renderContent(root.ownerDocument);
        return true;
    }

    function selectTab(id) {
        const navigationItem = currentNavigation();
        if (!navigationItem.tabs.some((tab) => tab.id === id) || currentTab()?.id === id) return false;
        activeTabByNavigation.set(navigationItem.id, id);
        renderContent(root.ownerDocument);
        return true;
    }

    function toggleSection(id) {
        if (expandedSections.has(id)) expandedSections.delete(id);
        else expandedSections.add(id);
        renderContent(root.ownerDocument);
        return expandedSections.has(id);
    }

    function onClick(event) {
        const button = event.target?.closest?.('button[data-action]');
        if (!button || !root.contains(button)) return;
        const { action, id } = button.dataset;
        if (action === 'navigation') selectNavigation(id);
        else if (action === 'tab') selectTab(id);
        else if (action === 'section') toggleSection(id);
    }

    return {
        mount({ host, scope }) {
            if (!host?.ownerDocument) throw new TypeError('Settings shell requires a DOM host');
            const documentObject = host.ownerDocument;
            root = element(documentObject, 'section', {
                className: 'vgen-nya-settings notranslate',
                'data-vgen-nya-ui': 'settings',
                translate: 'no',
            });
            const style = element(documentObject, 'style');
            style.textContent = SHELL_CSS;
            const sidebar = element(documentObject, 'aside', { className: 'vgen-nya-settings__nav' });
            sidebar.append(element(documentObject, 'h2', { className: 'vgen-nya-settings__nav-title' }, 'VGenToolNya'));
            navContainer = element(documentObject, 'nav', { 'aria-label': '功能设置' });
            sidebar.append(navContainer);
            const main = element(documentObject, 'main', { className: 'vgen-nya-settings__main' });
            heading = element(documentObject, 'h1', { className: 'vgen-nya-settings__heading' });
            tabsContainer = element(documentObject, 'div', { className: 'vgen-nya-settings__tabs', role: 'tablist' });
            panelsContainer = element(documentObject, 'div', { className: 'vgen-nya-settings__panels' });
            main.append(heading, tabsContainer, panelsContainer);
            root.append(style, sidebar, main);
            renderNavigation(documentObject);
            renderContent(documentObject);
            host.append(root);
            scope.listen(root, 'click', onClick);
            scope.use(() => root?.remove());
        },
        activate() {
            root?.setAttribute('data-state', 'active');
        },
        unmount() {
            cleanupRenderedSections();
            root?.setAttribute('data-state', 'unmounting');
        },
        dispose() {
            root = null;
            navContainer = null;
            heading = null;
            tabsContainer = null;
            panelsContainer = null;
            activeTabByNavigation.clear();
            expandedSections.clear();
            cleanupRenderedSections();
        },
        selectNavigation,
        selectTab,
        toggleSection,
        get element() {
            return root;
        },
    };
}
