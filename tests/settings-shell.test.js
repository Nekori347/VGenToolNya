import assert from 'node:assert/strict';
import test from 'node:test';

import { ModuleManager } from '../src/core/module-manager.js';
import { createVGenNyaCore } from '../src/index.js';
import { CONFIG_KEYS, LEGACY_KEYS } from '../src/migration/legacy-migration.js';
import { SETTINGS_NAVIGATION } from '../src/settings/navigation.js';
import { createSettingsShell } from '../src/settings/settings-shell.js';
import { MiniDocument, descendants } from './helpers/mini-dom.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';

function buttons(root) {
    return descendants(root).filter((node) => node.tagName === 'BUTTON');
}

test('L2: settings shell mounts with primary navigation, tabs and collapsible sections', () => {
    const documentObject = new MiniDocument();
    const host = documentObject.createElement('div');
    const shell = createSettingsShell();
    const manager = new ModuleManager().register('settings', shell);

    manager.mount('settings', { host });
    manager.activate('settings');

    assert.equal(host.children.length, 1);
    assert.equal(shell.element.dataset.vgenNyaUi, 'settings');
    assert.equal(shell.element.getAttribute('data-state'), 'active');
    const navigationButtons = buttons(shell.element).filter((button) => button.dataset.action === 'navigation');
    assert.deepEqual(navigationButtons.map((button) => button.textContent), SETTINGS_NAVIGATION.map((item) => item.label));

    shell.selectNavigation('upload');
    const tabButtons = buttons(shell.element).filter((button) => button.dataset.action === 'tab');
    assert.deepEqual(tabButtons.map((button) => button.textContent), [
        '组合预设', '标题 / 描述', '发现标签', '搜索标签', '界面设置',
    ]);
    assert.equal(new Set(tabButtons.map((button) => button.textContent)).size, 5);

    shell.selectTab('text');
    assert.equal(shell.toggleSection('upload:text:planned'), true);
    const sectionBody = descendants(shell.element).find((node) => node.className === 'vgen-nya-settings__section-body');
    assert.equal(sectionBody.hidden, false);
});

test('L2: unmount/remount removes the old root and its listener before creating one new registration', () => {
    const documentObject = new MiniDocument();
    const host = documentObject.createElement('div');
    const shell = createSettingsShell();
    const manager = new ModuleManager().register('settings', shell);

    manager.mount('settings', { host });
    manager.activate('settings');
    const firstRoot = shell.element;
    assert.equal(firstRoot.listenerAdds.get('click'), 1);

    manager.unmount('settings');
    assert.equal(host.children.length, 0);
    assert.equal(firstRoot.listenerRemoves.get('click'), 1);

    manager.mount('settings', { host });
    manager.activate('settings');
    const secondRoot = shell.element;
    assert.notEqual(secondRoot, firstRoot);
    assert.equal(secondRoot.listenerAdds.get('click'), 1);
    assert.equal(host.children.length, 1);

    manager.dispose('settings');
    assert.equal(host.children.length, 0);
    assert.equal(secondRoot.listenerRemoves.get('click'), 1);
});

test('L2: preset semantics remain separate in the shell information model', () => {
    const upload = SETTINGS_NAVIGATION.find((item) => item.id === 'upload');
    const ids = upload.tabs.map((tab) => tab.id);
    assert.deepEqual(ids, ['combination', 'text', 'discovery', 'search-tags', 'interface']);
    assert.equal(new Set(ids).size, ids.length);
});

test('L2: core opens the shell while legacy settings remain compatibly readable', () => {
    const driver = new MemoryStorageDriver({
        [LEGACY_KEYS.uploadSettings]: {
            collapsed: true,
            groupExpanded: { sample: true },
            modules: { global: true, title: false, description: true, discovery: true, tags: true },
            autoCollapseDiscovery: true,
            theme: 'dark',
        },
    });
    const core = createVGenNyaCore({ storageDriver: driver, gm: {} });
    const documentObject = new MiniDocument();
    const host = documentObject.createElement('div');

    const migration = core.migrateLegacyData();
    core.mountSettings(host);

    assert.equal(migration.ok, true);
    assert.equal(host.children.length, 1);
    assert.equal(core.modules.state('settings'), 'active');
    assert.equal(core.readConfig(CONFIG_KEYS.uploadSettings).value.modules.title, false);
    assert.equal(core.readConfig(CONFIG_KEYS.uiSettings).value.theme, 'dark');
    assert.equal(driver.hasValue(LEGACY_KEYS.uploadSettings), true);

    core.dispose();
    assert.equal(host.children.length, 0);
});

test('Iteration 4 L2: Settings keeps three levels while adding Quick Reply and two Order text sections', () => {
    const core = createVGenNyaCore({ storageDriver: new MemoryStorageDriver(), gm: {} });
    const documentObject = new MiniDocument();
    const host = documentObject.createElement('div');
    core.mountSettings(host);

    core.settingsShell.selectNavigation('chat');
    let tabs = buttons(core.settingsShell.element).filter((button) => button.dataset.action === 'tab').map((button) => button.textContent);
    assert.deepEqual(tabs, ['外观', '已读', '快捷回复', '搜索']);
    core.settingsShell.selectTab('quick-reply');
    assert.equal(core.settingsShell.toggleSection('chat:quick-reply:quick-reply'), true);

    core.settingsShell.selectNavigation('orders');
    tabs = buttons(core.settingsShell.element).filter((button) => button.dataset.action === 'tab').map((button) => button.textContent);
    assert.deepEqual(tabs, ['订单工具', '文本预设']);
    core.settingsShell.selectTab('text-presets');
    const sectionToggles = buttons(core.settingsShell.element).filter((button) => button.dataset.action === 'section');
    assert.deepEqual(sectionToggles.map((button) => button.children[0]?.textContent), ['Final Delivery', 'Private Note']);
    core.dispose();
});
