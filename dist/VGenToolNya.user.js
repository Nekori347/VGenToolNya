// ==UserScript==
// @name         VGenToolNya
// @namespace    https://vgen.co/
// @version      0.1.0
// @description  VGen 创作者工具箱：统一设置、生命周期与安全的旧数据兼容基础。
// @author       @Nekori_Net
// @license      MIT
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==
(() => {
  // src/core/clipboard.js
  var Clipboard = class {
    constructor({ gmSetClipboard, navigatorObject = globalThis.navigator, documentObject = globalThis.document } = {}) {
      this.gmSetClipboard = gmSetClipboard;
      this.navigatorObject = navigatorObject;
      this.documentObject = documentObject;
    }
    async writeText(value) {
      const text = String(value ?? "");
      if (typeof this.gmSetClipboard === "function") {
        await this.gmSetClipboard(text, "text");
        return;
      }
      if (typeof this.navigatorObject?.clipboard?.writeText === "function") {
        await this.navigatorObject.clipboard.writeText(text);
        return;
      }
      this.#writeWithTextarea(text);
    }
    #writeWithTextarea(text) {
      const documentObject = this.documentObject;
      if (!documentObject?.body || typeof documentObject.execCommand !== "function") {
        throw new Error("Clipboard is unavailable");
      }
      const textarea = documentObject.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      documentObject.body.append(textarea);
      try {
        textarea.select();
        if (!documentObject.execCommand("copy")) throw new Error("Clipboard copy was rejected");
      } finally {
        textarea.remove();
      }
    }
  };

  // src/core/value-utils.js
  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function cloneStorageValue(value) {
    if (value === void 0 || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }
  function parseStoredValue(value, label = "stored value") {
    if (typeof value !== "string") return cloneStorageValue(value);
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new TypeError(`${label} is not valid JSON`, { cause: error });
    }
  }
  function stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(",")}]`;
    }
    if (isPlainObject(value)) {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  function storageValuesEqual(left, right) {
    return stableStringify(left) === stableStringify(right);
  }

  // src/core/config-store.js
  var MISSING = Object.freeze({ missing: true });
  var ConfigStore = class {
    constructor(driver) {
      if (!driver || typeof driver.getValue !== "function" || typeof driver.setValue !== "function") {
        throw new TypeError("ConfigStore requires getValue and setValue functions");
      }
      this.driver = driver;
    }
    has(key) {
      if (typeof this.driver.hasValue === "function") return Boolean(this.driver.hasValue(key));
      return this.driver.getValue(key, MISSING) !== MISSING;
    }
    read(key, fallback = void 0) {
      const value = this.driver.getValue(key, MISSING);
      return value === MISSING ? cloneStorageValue(fallback) : cloneStorageValue(value);
    }
    write(key, value) {
      this.driver.setValue(key, cloneStorageValue(value));
      return cloneStorageValue(value);
    }
    writeVerified(key, value, validate = () => true) {
      if (!validate(value)) throw new TypeError(`Refusing invalid value for ${key}`);
      this.write(key, value);
      const stored = this.read(key, MISSING);
      if (stored === MISSING || !validate(stored) || !storageValuesEqual(stored, value)) {
        throw new Error(`Write verification failed for ${key}`);
      }
      return stored;
    }
    delete(key) {
      if (typeof this.driver.deleteValue !== "function") {
        throw new Error(`Storage driver cannot delete ${key}`);
      }
      this.driver.deleteValue(key);
    }
    deleteVerified(key) {
      this.delete(key);
      if (this.has(key)) throw new Error(`Delete verification failed for ${key}`);
    }
  };
  function createGMStorageDriver(gm = globalThis) {
    if (typeof gm.GM_getValue !== "function" || typeof gm.GM_setValue !== "function") {
      throw new TypeError("GM_getValue and GM_setValue are required");
    }
    return {
      getValue(key, fallback) {
        return gm.GM_getValue(key, fallback);
      },
      setValue(key, value) {
        gm.GM_setValue(key, value);
      },
      deleteValue(key) {
        if (typeof gm.GM_deleteValue !== "function") {
          throw new Error("GM_deleteValue is required for transactional migration import");
        }
        gm.GM_deleteValue(key);
      }
    };
  }

  // src/core/lifecycle.js
  function callCleanup(cleanup, reason) {
    if (typeof cleanup === "function") return cleanup(reason);
    if (cleanup && typeof cleanup.dispose === "function") return cleanup.dispose(reason);
    if (cleanup && typeof cleanup.disconnect === "function") return cleanup.disconnect();
    if (cleanup && typeof cleanup.abort === "function") return cleanup.abort(reason);
    throw new TypeError("Lifecycle cleanup must be a function or disposable resource");
  }
  var ResourceScope = class {
    #cleanups = [];
    #closed = false;
    get closed() {
      return this.#closed;
    }
    use(cleanup) {
      if (this.#closed) {
        callCleanup(cleanup, "scope-already-closed");
        return () => {
        };
      }
      const entry = { cleanup, active: true };
      this.#cleanups.push(entry);
      return (reason = "released") => {
        if (!entry.active) return;
        entry.active = false;
        callCleanup(entry.cleanup, reason);
      };
    }
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      return this.use(() => target.removeEventListener(type, listener, options));
    }
    observe(observer, target, options) {
      observer.observe(target, options);
      this.use(() => observer.disconnect());
      return observer;
    }
    timeout(callback, delay, clock = globalThis) {
      const id = clock.setTimeout(callback, delay);
      this.use(() => clock.clearTimeout(id));
      return id;
    }
    interval(callback, delay, clock = globalThis) {
      const id = clock.setInterval(callback, delay);
      this.use(() => clock.clearInterval(id));
      return id;
    }
    animationFrame(callback, clock = globalThis) {
      const id = clock.requestAnimationFrame(callback);
      this.use(() => clock.cancelAnimationFrame(id));
      return id;
    }
    abortController() {
      const controller = new AbortController();
      this.use((reason) => controller.abort(reason));
      return controller;
    }
    cleanup(reason = "unmount") {
      if (this.#closed) return [];
      this.#closed = true;
      const errors = [];
      for (const entry of this.#cleanups.reverse()) {
        if (!entry.active) continue;
        entry.active = false;
        try {
          callCleanup(entry.cleanup, reason);
        } catch (error) {
          errors.push(error);
        }
      }
      this.#cleanups = [];
      return errors;
    }
  };
  var LifecycleController = class {
    #scope = null;
    #state = "unmounted";
    get state() {
      return this.#state;
    }
    get scope() {
      return this.#scope;
    }
    mount(setup) {
      if (this.#state === "disposed") throw new Error("Cannot mount a disposed lifecycle");
      if (this.#state === "mounted" || this.#state === "active") return false;
      const scope = new ResourceScope();
      try {
        setup?.(scope);
        this.#scope = scope;
        this.#state = "mounted";
        return true;
      } catch (error) {
        scope.cleanup("mount-failed");
        throw error;
      }
    }
    activate(activate) {
      if (this.#state === "active") return false;
      if (this.#state !== "mounted") throw new Error("Lifecycle must be mounted before activation");
      activate?.(this.#scope);
      this.#state = "active";
      return true;
    }
    unmount(teardown) {
      if (this.#state === "unmounted") return false;
      if (this.#state === "disposed") return false;
      const scope = this.#scope;
      let teardownError;
      try {
        teardown?.(scope);
      } catch (error) {
        teardownError = error;
      } finally {
        const cleanupErrors = scope?.cleanup("unmount") || [];
        this.#scope = null;
        this.#state = "unmounted";
        if (teardownError) throw teardownError;
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Lifecycle cleanup failed");
      }
      return true;
    }
    dispose(dispose) {
      if (this.#state === "disposed") return false;
      if (this.#state !== "unmounted") this.unmount();
      dispose?.();
      this.#state = "disposed";
      return true;
    }
  };

  // src/core/module-manager.js
  var ModuleManager = class {
    #modules = /* @__PURE__ */ new Map();
    register(id, module) {
      if (!id || typeof id !== "string") throw new TypeError("Module id must be a string");
      if (this.#modules.has(id)) throw new Error(`Module already registered: ${id}`);
      this.#modules.set(id, { module, lifecycle: new LifecycleController(), context: null });
      return this;
    }
    has(id) {
      return this.#modules.has(id);
    }
    state(id) {
      return this.#record(id).lifecycle.state;
    }
    mount(id, context = {}) {
      const record = this.#record(id);
      record.context = context;
      return record.lifecycle.mount((scope) => {
        record.module.mount?.({ ...context, scope });
      });
    }
    activate(id) {
      const record = this.#record(id);
      return record.lifecycle.activate((scope) => {
        record.module.activate?.({ ...record.context, scope });
      });
    }
    unmount(id) {
      const record = this.#record(id);
      const changed = record.lifecycle.unmount((scope) => {
        record.module.unmount?.({ ...record.context, scope });
      });
      if (changed) record.context = null;
      return changed;
    }
    dispose(id) {
      const record = this.#record(id);
      if (record.lifecycle.state !== "unmounted" && record.lifecycle.state !== "disposed") {
        this.unmount(id);
      }
      const changed = record.lifecycle.dispose(() => record.module.dispose?.());
      if (changed) record.context = null;
      return changed;
    }
    disposeAll() {
      for (const id of [...this.#modules.keys()].reverse()) this.dispose(id);
    }
    #record(id) {
      const record = this.#modules.get(id);
      if (!record) throw new Error(`Unknown module: ${id}`);
      return record;
    }
  };

  // src/migration/legacy-migration.js
  var LEGACY_KEYS = Object.freeze({
    searchTagGroups: "vgen-tag-presets-v1",
    copyPresets: "vgen-copy-presets-v1",
    discoveryPresets: "vgen-discovery-presets-v1",
    combinationPresets: "vgen-global-presets-v1",
    uploadSettings: "vgen-tag-quick-v3-settings",
    clients: "vgen-toolkit-frequent-clients-v1",
    toolkitSettings: "vgen-toolkit-settings-v2"
  });
  var CONFIG_KEYS = Object.freeze({
    searchTagGroups: "vgen-nya.search-tag-groups.v1",
    titlePresets: "vgen-nya.title-presets.v1",
    descriptionPresets: "vgen-nya.description-presets.v1",
    discoveryPresets: "vgen-nya.discovery-presets.v1",
    combinationPresets: "vgen-nya.global-presets.v1",
    uploadSettings: "vgen-nya.upload-settings.v1",
    uiSettings: "vgen-nya.ui-settings.v1",
    clients: "vgen-nya.clients.v1",
    chatSettings: "vgen-nya.chat-settings.v1",
    clientsSettings: "vgen-nya.clients-settings.v1"
  });
  var isArray = Array.isArray;
  function requireArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    return cloneStorageValue(value);
  }
  function requireObject(value, label) {
    if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
    return cloneStorageValue(value);
  }
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }
  function transformUploadSettings(value) {
    const raw = requireObject(value, LEGACY_KEYS.uploadSettings);
    return {
      [CONFIG_KEYS.uploadSettings]: {
        collapsed: Boolean(raw.collapsed),
        groupExpanded: isPlainObject(raw.groupExpanded) ? cloneStorageValue(raw.groupExpanded) : {},
        modules: {
          global: raw.modules?.global !== false,
          title: raw.modules?.title !== false,
          description: raw.modules?.description !== false,
          discovery: raw.modules?.discovery !== false,
          tags: raw.modules?.tags !== false
        },
        autoCollapseDiscovery: raw.autoCollapseDiscovery !== false
      },
      [CONFIG_KEYS.uiSettings]: {
        theme: raw.theme === "dark" ? "dark" : "light"
      }
    };
  }
  function transformToolkitSettings(value) {
    const raw = requireObject(value, LEGACY_KEYS.toolkitSettings);
    return {
      [CONFIG_KEYS.clientsSettings]: {
        minHeight: clamp(Number(raw.minHeight) || 220, 120, 520),
        rowHeight: clamp(Number(raw.rowHeight) || 52, 42, 88),
        collapsed: Boolean(raw.collapsed)
      },
      [CONFIG_KEYS.chatSettings]: {
        keepUnread: Boolean(raw.keepUnread),
        reactionMarkRead: Boolean(raw.reactionMarkRead)
      }
    };
  }
  var LEGACY_MIGRATION_DEFINITIONS = Object.freeze([
    {
      legacyKey: LEGACY_KEYS.searchTagGroups,
      transform: (value) => ({
        [CONFIG_KEYS.searchTagGroups]: requireArray(value, LEGACY_KEYS.searchTagGroups)
      }),
      validators: { [CONFIG_KEYS.searchTagGroups]: isArray }
    },
    {
      legacyKey: LEGACY_KEYS.copyPresets,
      transform(value) {
        const raw = requireObject(value, LEGACY_KEYS.copyPresets);
        return {
          [CONFIG_KEYS.titlePresets]: requireArray(raw.title, `${LEGACY_KEYS.copyPresets}.title`),
          [CONFIG_KEYS.descriptionPresets]: requireArray(raw.description, `${LEGACY_KEYS.copyPresets}.description`)
        };
      },
      validators: {
        [CONFIG_KEYS.titlePresets]: isArray,
        [CONFIG_KEYS.descriptionPresets]: isArray
      }
    },
    {
      legacyKey: LEGACY_KEYS.discoveryPresets,
      transform: (value) => ({
        [CONFIG_KEYS.discoveryPresets]: requireArray(value, LEGACY_KEYS.discoveryPresets)
      }),
      validators: { [CONFIG_KEYS.discoveryPresets]: isArray }
    },
    {
      legacyKey: LEGACY_KEYS.combinationPresets,
      transform: (value) => ({
        [CONFIG_KEYS.combinationPresets]: requireArray(value, LEGACY_KEYS.combinationPresets)
      }),
      validators: { [CONFIG_KEYS.combinationPresets]: isArray }
    },
    {
      legacyKey: LEGACY_KEYS.uploadSettings,
      transform: transformUploadSettings,
      validators: {
        [CONFIG_KEYS.uploadSettings]: isPlainObject,
        [CONFIG_KEYS.uiSettings]: isPlainObject
      }
    },
    {
      legacyKey: LEGACY_KEYS.clients,
      transform: (value) => ({
        [CONFIG_KEYS.clients]: requireArray(value, LEGACY_KEYS.clients)
      }),
      validators: { [CONFIG_KEYS.clients]: isArray }
    },
    {
      legacyKey: LEGACY_KEYS.toolkitSettings,
      transform: transformToolkitSettings,
      validators: {
        [CONFIG_KEYS.clientsSettings]: isPlainObject,
        [CONFIG_KEYS.chatSettings]: isPlainObject
      }
    }
  ]);
  var resolverByNewKey = /* @__PURE__ */ new Map();
  for (const definition of LEGACY_MIGRATION_DEFINITIONS) {
    for (const newKey of Object.keys(definition.validators)) {
      resolverByNewKey.set(newKey, definition);
    }
  }
  function prepareDefinition(store, definition) {
    if (!store.has(definition.legacyKey)) {
      return { legacyKey: definition.legacyKey, status: "legacy-absent", targets: [] };
    }
    const raw = store.read(definition.legacyKey);
    const parsed = parseStoredValue(raw, definition.legacyKey);
    const outputs = definition.transform(parsed);
    const targets = Object.entries(outputs).map(([key, value]) => {
      const validate = definition.validators[key];
      if (!validate?.(value)) throw new TypeError(`Migration produced invalid value for ${key}`);
      if (!store.has(key)) return { key, value, validate, status: "pending" };
      const existing = store.read(key);
      if (!validate(existing)) throw new TypeError(`Existing new value is invalid: ${key}`);
      return { key, value: existing, validate, status: "existing-new" };
    });
    return { legacyKey: definition.legacyKey, status: "prepared", targets };
  }
  function migrateLegacyData(store) {
    const result = { ok: true, writes: [], sources: [], preservedLegacyKeys: [] };
    for (const definition of LEGACY_MIGRATION_DEFINITIONS) {
      let source;
      try {
        source = prepareDefinition(store, definition);
        if (source.status === "legacy-absent") {
          result.sources.push(source);
          continue;
        }
        result.preservedLegacyKeys.push(definition.legacyKey);
        for (const target of source.targets) {
          if (target.status === "existing-new") continue;
          store.writeVerified(target.key, target.value, target.validate);
          target.status = "migrated";
          result.writes.push(target.key);
        }
        source.status = source.targets.some((target) => target.status === "migrated") ? "migrated" : "already-migrated";
        result.sources.push(source);
      } catch (error) {
        result.ok = false;
        result.sources.push({
          legacyKey: definition.legacyKey,
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return result;
  }
  function getLegacyMigrationDefinition(legacyKey) {
    return LEGACY_MIGRATION_DEFINITIONS.find((definition) => definition.legacyKey === legacyKey) || null;
  }
  function convertLegacyValue(legacyKey, rawValue) {
    const definition = getLegacyMigrationDefinition(legacyKey);
    if (!definition) throw new TypeError(`Unsupported legacy key: ${legacyKey}`);
    const parsed = parseStoredValue(rawValue, legacyKey);
    const outputs = definition.transform(parsed);
    for (const [key, value] of Object.entries(outputs)) {
      const validate = definition.validators[key];
      if (!validate?.(value)) throw new TypeError(`Migration produced invalid value for ${key}`);
    }
    return {
      legacyKey,
      outputs: cloneStorageValue(outputs),
      validators: definition.validators
    };
  }
  function readCompatibleConfig(store, key, fallback = void 0) {
    if (store.has(key)) return { value: store.read(key), source: "new", persisted: true };
    const definition = resolverByNewKey.get(key);
    if (!definition || !store.has(definition.legacyKey)) {
      return { value: cloneStorageValue(fallback), source: "fallback", persisted: false };
    }
    const parsed = parseStoredValue(store.read(definition.legacyKey), definition.legacyKey);
    const outputs = definition.transform(parsed);
    const value = outputs[key];
    const validate = definition.validators[key];
    if (!validate?.(value)) throw new TypeError(`Legacy conversion produced invalid value for ${key}`);
    store.writeVerified(key, value, validate);
    return { value: cloneStorageValue(value), source: "legacy", persisted: true };
  }

  // src/migration/legacy-export-schema.js
  var LEGACY_EXPORT_FORMAT = "vgen-nya.legacy-export";
  var LEGACY_EXPORT_SCHEMA_VERSION = 1;
  var MAX_LEGACY_EXPORT_BYTES = 10 * 1024 * 1024;
  var LEGACY_SOURCES = Object.freeze({
    "vgen-tag-quick": Object.freeze({
      id: "vgen-tag-quick",
      name: "VGen 快速标签",
      namespace: "https://vgen.co/",
      version: "0.9.12",
      bridgeVersion: "0.9.13",
      keys: Object.freeze([
        LEGACY_KEYS.searchTagGroups,
        LEGACY_KEYS.copyPresets,
        LEGACY_KEYS.discoveryPresets,
        LEGACY_KEYS.combinationPresets,
        LEGACY_KEYS.uploadSettings
      ])
    }),
    "vgen-toolkit": Object.freeze({
      id: "vgen-toolkit",
      name: "VGen小工具",
      namespace: "https://vgen.co/",
      version: "0.6.0",
      bridgeVersion: "0.6.1",
      keys: Object.freeze([
        LEGACY_KEYS.clients,
        LEGACY_KEYS.toolkitSettings
      ])
    })
  });
  function parsedShape(value, key) {
    return parseStoredValue(value, key);
  }
  function validateLegacyValue(key, value) {
    const parsed = parsedShape(value, key);
    if ([
      LEGACY_KEYS.searchTagGroups,
      LEGACY_KEYS.discoveryPresets,
      LEGACY_KEYS.combinationPresets,
      LEGACY_KEYS.clients
    ].includes(key)) return Array.isArray(parsed);
    if (key === LEGACY_KEYS.copyPresets) {
      return isPlainObject(parsed) && Array.isArray(parsed.title) && Array.isArray(parsed.description);
    }
    if ([LEGACY_KEYS.uploadSettings, LEGACY_KEYS.toolkitSettings].includes(key)) {
      return isPlainObject(parsed);
    }
    return false;
  }
  function validateLegacyPayload(sourceDefinition, payload) {
    if (!isPlainObject(payload)) throw new TypeError("Legacy export payload must be an object");
    const keys = Object.keys(payload);
    if (!keys.length) throw new TypeError("Legacy export payload is empty");
    for (const key of keys) {
      if (!sourceDefinition.keys.includes(key)) {
        throw new TypeError(`Unexpected legacy key for ${sourceDefinition.id}: ${key}`);
      }
      if (!validateLegacyValue(key, payload[key])) {
        throw new TypeError(`Invalid legacy value shape: ${key}`);
      }
    }
    return true;
  }
  async function sha256Hex(text, cryptoObject = globalThis.crypto) {
    if (!cryptoObject?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
    const bytes = new TextEncoder().encode(text);
    const digest = await cryptoObject.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function unsignedEnvelope(envelope) {
    return {
      format: envelope.format,
      schemaVersion: envelope.schemaVersion,
      source: envelope.source,
      bridgeVersion: envelope.bridgeVersion,
      exportedAt: envelope.exportedAt,
      payload: envelope.payload
    };
  }
  async function parseLegacyExport(input, { cryptoObject } = {}) {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    if (new TextEncoder().encode(text).byteLength > MAX_LEGACY_EXPORT_BYTES) {
      throw new TypeError("Legacy export exceeds the 10 MiB safety limit");
    }
    let envelope;
    try {
      envelope = typeof input === "string" ? JSON.parse(input) : cloneStorageValue(input);
    } catch (error) {
      throw new TypeError("Legacy export is not valid JSON", { cause: error });
    }
    if (!isPlainObject(envelope)) throw new TypeError("Legacy export must be an object");
    if (envelope.format !== LEGACY_EXPORT_FORMAT) throw new TypeError("Unknown legacy export format");
    if (envelope.schemaVersion !== LEGACY_EXPORT_SCHEMA_VERSION) throw new TypeError("Unsupported legacy export schema version");
    if (!isPlainObject(envelope.source)) throw new TypeError("Legacy export source is missing");
    const definition = LEGACY_SOURCES[envelope.source.id];
    if (!definition) throw new TypeError("Unknown legacy export source");
    for (const field of ["name", "namespace", "version"]) {
      if (envelope.source[field] !== definition[field]) {
        throw new TypeError(`Legacy export source ${field} does not match`);
      }
    }
    if (envelope.bridgeVersion !== definition.bridgeVersion) throw new TypeError("Unsupported legacy bridge version");
    if (Number.isNaN(new Date(envelope.exportedAt).valueOf())) throw new TypeError("Invalid legacy export timestamp");
    validateLegacyPayload(definition, envelope.payload);
    if (!isPlainObject(envelope.integrity) || envelope.integrity.algorithm !== "SHA-256") {
      throw new TypeError("Legacy export integrity metadata is invalid");
    }
    if (!/^[a-f0-9]{64}$/.test(envelope.integrity.digest || "")) {
      throw new TypeError("Legacy export integrity digest is invalid");
    }
    const expected = await sha256Hex(stableStringify(unsignedEnvelope(envelope)), cryptoObject);
    if (expected !== envelope.integrity.digest) throw new TypeError("Legacy export integrity check failed");
    return cloneStorageValue(envelope);
  }

  // src/migration/legacy-importer.js
  var MIGRATION_STAGING_KEY = "vgen-nya.migration-staging.v1";
  var JOURNAL_VERSION = 1;
  var targetLabels = Object.freeze({
    [CONFIG_KEYS.searchTagGroups]: "Search Tag Preset groups",
    [CONFIG_KEYS.titlePresets]: "Title Preset",
    [CONFIG_KEYS.descriptionPresets]: "Description Preset",
    [CONFIG_KEYS.discoveryPresets]: "Discovery Preset",
    [CONFIG_KEYS.combinationPresets]: "Combination / Global Preset",
    [CONFIG_KEYS.uploadSettings]: "Upload settings",
    [CONFIG_KEYS.uiSettings]: "UI settings",
    [CONFIG_KEYS.clients]: "Frequent clients",
    [CONFIG_KEYS.chatSettings]: "Chat settings",
    [CONFIG_KEYS.clientsSettings]: "Frequent clients settings"
  });
  function countEntries(value) {
    return Array.isArray(value) ? value.length : 1;
  }
  function transactionId() {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `migration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function statusForTarget(store, key, value, validate) {
    if (!store.has(key)) return { status: "ready", conflict: false, alreadyMigrated: false };
    const existing = store.read(key);
    if (validate(existing) && storageValuesEqual(existing, value)) {
      return { status: "already-migrated", conflict: false, alreadyMigrated: true };
    }
    return {
      status: "conflict",
      conflict: true,
      alreadyMigrated: false,
      reason: validate(existing) ? "different-new-value" : "invalid-existing-new-value"
    };
  }
  function planEnvelope(envelope, store) {
    const definition = LEGACY_SOURCES[envelope.source.id];
    const targets = [];
    for (const legacyKey of definition.keys) {
      if (!Object.hasOwn(envelope.payload, legacyKey)) continue;
      const converted = convertLegacyValue(legacyKey, envelope.payload[legacyKey]);
      for (const [key, value] of Object.entries(converted.outputs)) {
        const validate = converted.validators[key];
        targets.push({
          sourceId: envelope.source.id,
          legacyKey,
          key,
          label: targetLabels[key] || key,
          count: countEntries(value),
          value: cloneStorageValue(value),
          ...statusForTarget(store, key, value, validate)
        });
      }
    }
    return {
      source: cloneStorageValue(envelope.source),
      bridgeVersion: envelope.bridgeVersion,
      exportedAt: envelope.exportedAt,
      digest: envelope.integrity.digest,
      targets,
      alreadyMigrated: targets.length > 0 && targets.every((target) => target.alreadyMigrated),
      hasConflicts: targets.some((target) => target.conflict)
    };
  }
  async function prepareLegacyImport(inputs, store, options = {}) {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2) {
      throw new TypeError("Select one or two legacy export files");
    }
    const envelopes = await Promise.all(inputs.map((input) => parseLegacyExport(input, options)));
    const unique = /* @__PURE__ */ new Map();
    let duplicateFilesIgnored = 0;
    for (const envelope of envelopes) {
      const previous = unique.get(envelope.source.id);
      if (!previous) {
        unique.set(envelope.source.id, envelope);
        continue;
      }
      if (previous.integrity.digest !== envelope.integrity.digest) {
        throw new TypeError(`Two different exports were selected for ${envelope.source.name}`);
      }
      duplicateFilesIgnored += 1;
    }
    const sources = [...unique.values()].map((envelope) => planEnvelope(envelope, store));
    const targets = sources.flatMap((source) => source.targets);
    return {
      kind: "vgen-nya.legacy-import-plan",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      sources,
      targets,
      duplicateFilesIgnored,
      hasConflicts: targets.some((target) => target.conflict),
      alreadyMigrated: targets.length > 0 && targets.every((target) => target.alreadyMigrated),
      requiresConfirmation: true
    };
  }
  function validateJournal(value) {
    return Boolean(
      value && value.kind === "vgen-nya.legacy-import-journal" && value.version === JOURNAL_VERSION && typeof value.transactionId === "string" && Array.isArray(value.targets) && value.targets.every((target) => target && typeof target.key === "string" && Object.values(CONFIG_KEYS).includes(target.key) && target.before && typeof target.before.exists === "boolean")
    );
  }
  function restoreTarget(store, target) {
    if (target.before.exists) {
      store.write(target.key, target.before.value);
      const restored = store.read(target.key);
      if (!storageValuesEqual(restored, target.before.value)) {
        throw new Error(`Rollback verification failed for ${target.key}`);
      }
    } else {
      store.deleteVerified(target.key);
    }
  }
  function recoverPendingLegacyImport(store) {
    if (!store.has(MIGRATION_STAGING_KEY)) return { recovered: false, targets: [] };
    const journal = store.read(MIGRATION_STAGING_KEY);
    if (!validateJournal(journal)) {
      throw new Error("Unrecognized migration staging journal; refusing automatic changes");
    }
    const restored = [];
    for (const target of [...journal.targets].reverse()) {
      restoreTarget(store, target);
      restored.push(target.key);
    }
    store.deleteVerified(MIGRATION_STAGING_KEY);
    return { recovered: true, transactionId: journal.transactionId, targets: restored };
  }
  var LegacyImportTransactionError = class extends Error {
    constructor(message, { cause, rollbackSucceeded, transactionId: transactionId2 } = {}) {
      super(message, { cause });
      this.name = "LegacyImportTransactionError";
      this.rollbackSucceeded = rollbackSucceeded;
      this.transactionId = transactionId2;
    }
  };
  function commitLegacyImport(plan, store, { confirmed = false } = {}) {
    if (!confirmed) throw new Error("Legacy import requires explicit confirmation");
    if (!plan || plan.kind !== "vgen-nya.legacy-import-plan" || !Array.isArray(plan.targets)) {
      throw new TypeError("Invalid legacy import plan");
    }
    const recovery = recoverPendingLegacyImport(store);
    const ready = [];
    const skippedConflicts = [];
    const skippedExisting = [];
    for (const target of plan.targets) {
      const definition = getLegacyMigrationDefinition(target.legacyKey);
      const validate = definition?.validators[target.key];
      if (!validate?.(target.value)) throw new TypeError(`Invalid planned target: ${target.key}`);
      const current = statusForTarget(store, target.key, target.value, validate);
      if (current.status === "already-migrated") {
        skippedExisting.push(target.key);
        continue;
      }
      if (current.status === "conflict") {
        if (target.status === "ready") {
          throw new Error(`Configuration changed after preview: ${target.key}`);
        }
        skippedConflicts.push({ key: target.key, reason: current.reason });
        continue;
      }
      if (target.status === "conflict") {
        skippedConflicts.push({ key: target.key, reason: target.reason });
        continue;
      }
      ready.push({ ...target, validate });
    }
    if (!ready.length) {
      return { committed: false, writes: [], skippedExisting, skippedConflicts, recovery };
    }
    const id = transactionId();
    const journal = {
      kind: "vgen-nya.legacy-import-journal",
      version: JOURNAL_VERSION,
      transactionId: id,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      targets: ready.map((target) => ({
        key: target.key,
        before: store.has(target.key) ? { exists: true, value: store.read(target.key) } : { exists: false }
      }))
    };
    const written = [];
    try {
      store.writeVerified(MIGRATION_STAGING_KEY, journal, validateJournal);
      for (const target of ready) {
        store.writeVerified(target.key, target.value, target.validate);
        written.push(target.key);
      }
      for (const target of ready) {
        if (!storageValuesEqual(store.read(target.key), target.value)) {
          throw new Error(`Final verification failed for ${target.key}`);
        }
      }
      store.deleteVerified(MIGRATION_STAGING_KEY);
      return {
        committed: true,
        transactionId: id,
        writes: written,
        skippedExisting,
        skippedConflicts,
        recovery
      };
    } catch (cause) {
      let rollbackSucceeded = true;
      try {
        for (const target of [...journal.targets].reverse()) restoreTarget(store, target);
        if (store.has(MIGRATION_STAGING_KEY)) store.deleteVerified(MIGRATION_STAGING_KEY);
      } catch {
        rollbackSucceeded = false;
      }
      throw new LegacyImportTransactionError(
        rollbackSucceeded ? "Legacy import failed and all writes were rolled back" : "Legacy import failed; recovery journal was retained for the next run",
        { cause, rollbackSucceeded, transactionId: id }
      );
    }
  }

  // src/settings/navigation.js
  var plannedSection = (title) => ({
    id: "planned",
    title,
    description: "本 Iteration 仅提供设置结构，功能将在对应后续 Iteration 实现。"
  });
  var SETTINGS_NAVIGATION = Object.freeze([
    {
      id: "basic",
      label: "基础",
      tabs: [
        { id: "general", label: "常规", sections: [plannedSection("Core 状态")] },
        { id: "appearance", label: "外观", sections: [plannedSection("主题")] },
        { id: "data", label: "数据", sections: [plannedSection("数据兼容")] }
      ]
    },
    {
      id: "upload",
      label: "上传助手",
      tabs: [
        { id: "combination", label: "组合预设", sections: [plannedSection("Combination Preset")] },
        { id: "text", label: "标题 / 描述", sections: [plannedSection("Title / Description Preset")] },
        { id: "discovery", label: "发现标签", sections: [plannedSection("Discovery Preset")] },
        { id: "search-tags", label: "搜索标签", sections: [plannedSection("Search Tag Preset")] },
        { id: "interface", label: "界面设置", sections: [plannedSection("上传界面")] }
      ]
    },
    { id: "orders", label: "订单助手", tabs: [{ id: "overview", label: "概览", sections: [plannedSection("订单助手")] }] },
    { id: "chat", label: "聊天助手", tabs: [{ id: "overview", label: "概览", sections: [plannedSection("聊天助手")] }] },
    { id: "reviews", label: "评价助手", tabs: [{ id: "overview", label: "概览", sections: [plannedSection("评价助手")] }] },
    { id: "clients", label: "常用访问", tabs: [{ id: "overview", label: "概览", sections: [plannedSection("常用访问")] }] },
    { id: "developer", label: "开发者", tabs: [{ id: "overview", label: "概览", sections: [plannedSection("Diagnostics")] }] }
  ]);

  // src/settings/settings-shell.js
  var SHELL_CSS = `
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
  function element(documentObject, tagName, attributes = {}, text = "") {
    const node = documentObject.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "className") node.className = value;
      else if (name.startsWith("data-")) {
        const datasetName = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        node.dataset[datasetName] = value;
      } else node.setAttribute(name, value);
    }
    if (text) node.textContent = text;
    return node;
  }
  function createSettingsShell({ navigation = SETTINGS_NAVIGATION } = {}) {
    let root = null;
    let navContainer = null;
    let heading = null;
    let tabsContainer = null;
    let panelsContainer = null;
    let activeNavigation = navigation[0]?.id || "";
    const activeTabByNavigation = /* @__PURE__ */ new Map();
    const expandedSections = /* @__PURE__ */ new Set();
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
        const button = element(documentObject, "button", {
          type: "button",
          "data-action": "navigation",
          "data-id": item.id,
          "aria-current": item.id === activeNavigation ? "page" : "false"
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
        const button = element(documentObject, "button", {
          type: "button",
          role: "tab",
          "data-action": "tab",
          "data-id": item.id,
          "aria-selected": String(item.id === tab.id)
        }, item.label);
        tabsContainer.append(button);
      }
      panelsContainer.replaceChildren();
      const panel = element(documentObject, "div", { role: "tabpanel" });
      for (const section of tab.sections) {
        const sectionKey = `${navigationItem.id}:${tab.id}:${section.id}`;
        const expanded = expandedSections.has(sectionKey);
        const wrapper = element(documentObject, "section", { className: "vgen-nya-settings__section" });
        const toggle = element(documentObject, "button", {
          type: "button",
          className: "vgen-nya-settings__section-toggle",
          "data-action": "section",
          "data-id": sectionKey,
          "aria-expanded": String(expanded)
        });
        toggle.append(
          element(documentObject, "span", {}, section.title),
          element(documentObject, "span", { "aria-hidden": "true" }, expanded ? "−" : "+")
        );
        const body = element(documentObject, "div", { className: "vgen-nya-settings__section-body" }, section.description);
        body.hidden = !expanded;
        if (expanded && typeof section.render === "function") {
          body.textContent = "";
          section.render({
            documentObject,
            body,
            use(cleanup) {
              if (typeof cleanup === "function") renderCleanups.push(cleanup);
            }
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
      const button = event.target?.closest?.("button[data-action]");
      if (!button || !root.contains(button)) return;
      const { action, id } = button.dataset;
      if (action === "navigation") selectNavigation(id);
      else if (action === "tab") selectTab(id);
      else if (action === "section") toggleSection(id);
    }
    return {
      mount({ host, scope }) {
        if (!host?.ownerDocument) throw new TypeError("Settings shell requires a DOM host");
        const documentObject = host.ownerDocument;
        root = element(documentObject, "section", {
          className: "vgen-nya-settings notranslate",
          "data-vgen-nya-ui": "settings",
          translate: "no"
        });
        const style = element(documentObject, "style");
        style.textContent = SHELL_CSS;
        const sidebar = element(documentObject, "aside", { className: "vgen-nya-settings__nav" });
        sidebar.append(element(documentObject, "h2", { className: "vgen-nya-settings__nav-title" }, "VGenToolNya"));
        navContainer = element(documentObject, "nav", { "aria-label": "功能设置" });
        sidebar.append(navContainer);
        const main = element(documentObject, "main", { className: "vgen-nya-settings__main" });
        heading = element(documentObject, "h1", { className: "vgen-nya-settings__heading" });
        tabsContainer = element(documentObject, "div", { className: "vgen-nya-settings__tabs", role: "tablist" });
        panelsContainer = element(documentObject, "div", { className: "vgen-nya-settings__panels" });
        main.append(heading, tabsContainer, panelsContainer);
        root.append(style, sidebar, main);
        renderNavigation(documentObject);
        renderContent(documentObject);
        host.append(root);
        scope.listen(root, "click", onClick);
        scope.use(() => root?.remove());
      },
      activate() {
        root?.setAttribute("data-state", "active");
      },
      unmount() {
        cleanupRenderedSections();
        root?.setAttribute("data-state", "unmounting");
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
      }
    };
  }

  // src/settings/upload-settings.js
  var DOMAIN_LABELS = Object.freeze({
    combinationPresets: "组合预设",
    titlePresets: "标题预设",
    descriptionPresets: "描述预设",
    discoveryPresets: "发现标签预设",
    searchTagGroups: "搜索标签分类"
  });
  function make(documentObject, tag, attributes = {}, text = "") {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "className") node.className = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }
  function renderPresetManager(repository, domain) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        const data = repository.read()[domain];
        body.replaceChildren();
        const toolbar = make(documentObject, "div", { className: "vgen-nya-settings__toolbar" });
        toolbar.append(make(documentObject, "span", {}, `${data.length} 项；顺序即 Upload Assistant 显示顺序。`));
        body.append(toolbar);
        data.forEach((preset, index) => {
          const row = make(documentObject, "div", { className: "vgen-nya-settings__preset-row" });
          row.append(
            make(documentObject, "span", {}, preset.name || preset.tag || `未命名 ${index + 1}`),
            make(documentObject, "button", { type: "button", dataset: { action: "up", index }, disabled: index === 0 }, "↑"),
            make(documentObject, "button", { type: "button", dataset: { action: "down", index }, disabled: index === data.length - 1 }, "↓"),
            make(documentObject, "button", { type: "button", dataset: { action: "delete", index } }, "删除")
          );
          body.append(row);
        });
        const editor = make(documentObject, "details");
        const summary = make(documentObject, "summary", {}, "高级 JSON 编辑（保留原字段）");
        const textarea = make(documentObject, "textarea", { rows: 10, value: JSON.stringify(data, null, 2), dataset: { role: "json" } });
        textarea.style.width = "100%";
        const save = make(documentObject, "button", { type: "button", dataset: { action: "save-json" } }, "校验并保存");
        editor.append(summary, textarea, save);
        body.append(editor);
      };
      const onClick = (event) => {
        const button = event.target?.closest?.("button[data-action]");
        if (!button) return;
        const data = repository.read()[domain];
        if (button.dataset.action === "save-json") {
          const parsed = JSON.parse(body.querySelector("textarea[data-role]")?.value || "[]");
          repository.writeDomain(domain, parsed);
          render();
          return;
        }
        const index = Number(button.dataset.index);
        if (button.dataset.action === "delete") data.splice(index, 1);
        else {
          const other = button.dataset.action === "up" ? index - 1 : index + 1;
          if (other < 0 || other >= data.length) return;
          [data[index], data[other]] = [data[other], data[index]];
        }
        repository.writeDomain(domain, data);
        render();
      };
      body.addEventListener("click", onClick);
      use(() => body.removeEventListener("click", onClick));
      render();
    };
  }
  function renderInterface(repository) {
    return ({ documentObject, body, use }) => {
      const snapshot = repository.read();
      const settings = snapshot.uploadSettings;
      body.replaceChildren();
      const labels = { global: "组合预设", title: "标题", description: "描述", discovery: "发现标签", tags: "搜索标签" };
      for (const [key, label] of Object.entries(labels)) {
        const row = make(documentObject, "label", { className: "vgen-nya-settings__check" });
        row.append(make(documentObject, "input", { type: "checkbox", checked: settings.modules[key], dataset: { module: key } }), documentObject.createTextNode(` ${label}`));
        body.append(row);
      }
      const collapse = make(documentObject, "label", { className: "vgen-nya-settings__check" });
      collapse.append(make(documentObject, "input", { type: "checkbox", checked: settings.autoCollapseDiscovery, dataset: { setting: "autoCollapseDiscovery" } }), documentObject.createTextNode(" 应用后自动折叠发现标签"));
      const theme = make(documentObject, "select", { dataset: { setting: "theme" } });
      theme.append(make(documentObject, "option", { value: "light", selected: snapshot.uiSettings.theme === "light" }, "浅色"), make(documentObject, "option", { value: "dark", selected: snapshot.uiSettings.theme === "dark" }, "深色"));
      const refresh = make(documentObject, "button", { type: "button", dataset: { action: "refresh" } }, "刷新 Upload 配置");
      const exportButton = make(documentObject, "button", { type: "button", dataset: { action: "export" } }, "导出日常预设");
      const importInput = make(documentObject, "input", { type: "file", accept: "application/json,.json", dataset: { action: "import" } });
      body.append(collapse, make(documentObject, "div", {}, "主题："), theme, refresh, exportButton, importInput);
      const onChange = async (event) => {
        if (event.target.dataset.module) {
          const next = repository.read().uploadSettings;
          next.modules[event.target.dataset.module] = event.target.checked;
          repository.writeSettings(next);
        } else if (event.target.dataset.setting === "autoCollapseDiscovery") {
          const next = repository.read().uploadSettings;
          next.autoCollapseDiscovery = event.target.checked;
          repository.writeSettings(next);
        } else if (event.target.dataset.setting === "theme") repository.writeUiSettings({ theme: event.target.value });
        else if (event.target.dataset.action === "import" && event.target.files?.[0]) {
          const plan = repository.prepareDailyImport(await event.target.files[0].text());
          const summary = Object.entries(plan.counts).map(([key, count]) => `${key}: ${count}`).join("\n");
          if (documentObject.defaultView?.confirm?.(`将覆盖当前 Upload 预设：
${summary}
继续吗？`)) {
            repository.commitDailyImport(plan, { confirmed: true });
          }
          event.target.value = "";
        }
      };
      const onClick = (event) => {
        if (event.target.dataset.action === "refresh") repository.refresh();
        if (event.target.dataset.action === "export") {
          const blob = new Blob([JSON.stringify(repository.exportDaily(), null, 2)], { type: "application/json;charset=utf-8" });
          const view = documentObject.defaultView || globalThis;
          const url = view.URL.createObjectURL(blob);
          const anchor = make(documentObject, "a", { href: url, download: `vgen-nya-upload-presets-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json` });
          body.append(anchor);
          anchor.click();
          anchor.remove();
          view.setTimeout(() => view.URL.revokeObjectURL(url), 1e3);
        }
      };
      body.addEventListener("change", onChange);
      body.addEventListener("click", onClick);
      use(() => body.removeEventListener("change", onChange));
      use(() => body.removeEventListener("click", onClick));
    };
  }
  function createUploadSettingsNavigation(repository, baseNavigation) {
    return baseNavigation.map((item) => item.id !== "upload" ? item : {
      ...item,
      tabs: [
        { id: "combination", label: "组合预设", sections: [{ id: "combination", title: DOMAIN_LABELS.combinationPresets, render: renderPresetManager(repository, "combinationPresets") }] },
        { id: "text", label: "标题 / 描述", sections: [
          { id: "title", title: DOMAIN_LABELS.titlePresets, render: renderPresetManager(repository, "titlePresets") },
          { id: "description", title: DOMAIN_LABELS.descriptionPresets, render: renderPresetManager(repository, "descriptionPresets") }
        ] },
        { id: "discovery", label: "发现标签", sections: [{ id: "discovery", title: DOMAIN_LABELS.discoveryPresets, render: renderPresetManager(repository, "discoveryPresets") }] },
        { id: "search-tags", label: "搜索标签", sections: [{ id: "search-tags", title: DOMAIN_LABELS.searchTagGroups, render: renderPresetManager(repository, "searchTagGroups") }] },
        { id: "interface", label: "界面设置", sections: [{ id: "interface", title: "模块与显示", render: renderInterface(repository) }] }
      ]
    });
  }

  // src/upload/upload-config.js
  var UPLOAD_CONFIG_KEYS = Object.freeze([
    CONFIG_KEYS.combinationPresets,
    CONFIG_KEYS.titlePresets,
    CONFIG_KEYS.descriptionPresets,
    CONFIG_KEYS.discoveryPresets,
    CONFIG_KEYS.searchTagGroups,
    CONFIG_KEYS.uploadSettings,
    CONFIG_KEYS.uiSettings
  ]);
  var DAILY_PRESET_FORMAT = "vgen-nya.upload-presets";
  var DAILY_PRESET_VERSION = 1;
  var DEFAULT_UPLOAD_SETTINGS = Object.freeze({
    collapsed: false,
    groupExpanded: {},
    modules: { global: true, title: true, description: true, discovery: true, tags: true },
    autoCollapseDiscovery: true
  });
  var DEFAULT_UI_SETTINGS = Object.freeze({ theme: "light" });
  var ARRAY_DOMAINS = Object.freeze({
    combinationPresets: CONFIG_KEYS.combinationPresets,
    titlePresets: CONFIG_KEYS.titlePresets,
    descriptionPresets: CONFIG_KEYS.descriptionPresets,
    discoveryPresets: CONFIG_KEYS.discoveryPresets,
    searchTagGroups: CONFIG_KEYS.searchTagGroups
  });
  function requireArray2(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    return cloneStorageValue(value);
  }
  function normalizeSettings(value) {
    const raw = isPlainObject(value) ? value : {};
    return {
      collapsed: Boolean(raw.collapsed),
      groupExpanded: isPlainObject(raw.groupExpanded) ? cloneStorageValue(raw.groupExpanded) : {},
      modules: {
        global: raw.modules?.global !== false,
        title: raw.modules?.title !== false,
        description: raw.modules?.description !== false,
        discovery: raw.modules?.discovery !== false,
        tags: raw.modules?.tags !== false
      },
      autoCollapseDiscovery: raw.autoCollapseDiscovery !== false
    };
  }
  function normalizeUiSettings(value) {
    return { theme: value?.theme === "dark" ? "dark" : "light" };
  }
  function validateDailyPresetDocument(document2) {
    if (!isPlainObject(document2)) throw new TypeError("Preset import must be an object");
    if (document2.format !== DAILY_PRESET_FORMAT) throw new TypeError("Unknown preset import format");
    if (document2.version !== DAILY_PRESET_VERSION) throw new TypeError("Unsupported preset import version");
    if (!isPlainObject(document2.payload)) throw new TypeError("Preset import payload is missing");
    const payload = {};
    for (const domain of Object.keys(ARRAY_DOMAINS)) {
      payload[domain] = requireArray2(document2.payload[domain], domain);
    }
    payload.uploadSettings = normalizeSettings(document2.payload.uploadSettings);
    payload.uiSettings = normalizeUiSettings(document2.payload.uiSettings);
    return payload;
  }
  var UploadConfigRepository = class {
    constructor(store) {
      this.store = store;
      this.snapshot = null;
      this.listeners = /* @__PURE__ */ new Set();
    }
    read() {
      const snapshot = {};
      for (const [domain, key] of Object.entries(ARRAY_DOMAINS)) {
        snapshot[domain] = requireArray2(readCompatibleConfig(this.store, key, []).value, domain);
      }
      snapshot.uploadSettings = normalizeSettings(
        readCompatibleConfig(this.store, CONFIG_KEYS.uploadSettings, DEFAULT_UPLOAD_SETTINGS).value
      );
      snapshot.uiSettings = normalizeUiSettings(
        readCompatibleConfig(this.store, CONFIG_KEYS.uiSettings, DEFAULT_UI_SETTINGS).value
      );
      this.snapshot = snapshot;
      return cloneStorageValue(snapshot);
    }
    refresh() {
      const value = this.read();
      for (const listener of this.listeners) listener(cloneStorageValue(value));
      return value;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    writeDomain(domain, value) {
      const key = ARRAY_DOMAINS[domain];
      if (!key) throw new TypeError(`Unknown upload preset domain: ${domain}`);
      const next = requireArray2(value, domain);
      this.store.writeVerified(key, next, Array.isArray);
      return this.refresh();
    }
    writeSettings(value) {
      const next = normalizeSettings(value);
      this.store.writeVerified(CONFIG_KEYS.uploadSettings, next, isPlainObject);
      return this.refresh();
    }
    writeUiSettings(value) {
      const next = normalizeUiSettings(value);
      this.store.writeVerified(CONFIG_KEYS.uiSettings, next, isPlainObject);
      return this.refresh();
    }
    exportDaily(exportedAt = (/* @__PURE__ */ new Date()).toISOString()) {
      return {
        format: DAILY_PRESET_FORMAT,
        version: DAILY_PRESET_VERSION,
        exportedAt,
        payload: this.read()
      };
    }
    prepareDailyImport(input) {
      let document2;
      try {
        document2 = typeof input === "string" ? JSON.parse(input) : cloneStorageValue(input);
      } catch (error) {
        throw new TypeError("Preset import is not valid JSON", { cause: error });
      }
      let payload;
      if (Array.isArray(document2) || document2?.type === "vgen-quick-presets") {
        const current = this.read();
        const legacy = Array.isArray(document2) ? { groups: document2 } : document2;
        if (!Array.isArray(legacy.groups)) throw new TypeError("Legacy preset import has no valid groups");
        payload = {
          ...current,
          searchTagGroups: cloneStorageValue(legacy.groups),
          titlePresets: legacy.copyPresets?.title ? requireArray2(legacy.copyPresets.title, "copyPresets.title") : current.titlePresets,
          descriptionPresets: legacy.copyPresets?.description ? requireArray2(legacy.copyPresets.description, "copyPresets.description") : current.descriptionPresets,
          discoveryPresets: legacy.discoveryPresets ? requireArray2(legacy.discoveryPresets, "discoveryPresets") : current.discoveryPresets,
          combinationPresets: legacy.globalPresets ? requireArray2(legacy.globalPresets, "globalPresets") : current.combinationPresets,
          uploadSettings: normalizeSettings({ ...current.uploadSettings, ...legacy.settings || {} })
        };
        document2 = { format: "vgen-quick-presets", version: legacy.version ?? "legacy-array", exportedAt: legacy.exportedAt };
      } else {
        payload = validateDailyPresetDocument(document2);
      }
      return {
        kind: "vgen-nya.upload-preset-import-plan",
        source: { format: document2.format, version: document2.version, exportedAt: document2.exportedAt },
        payload,
        counts: Object.fromEntries(Object.keys(ARRAY_DOMAINS).map((key) => [key, payload[key].length]))
      };
    }
    commitDailyImport(plan, { confirmed = false } = {}) {
      if (!confirmed) throw new Error("Preset import requires explicit confirmation");
      if (plan?.kind !== "vgen-nya.upload-preset-import-plan") throw new TypeError("Invalid preset import plan");
      const previous = this.read();
      const writes = [
        ...Object.entries(ARRAY_DOMAINS).map(([domain, key]) => [key, plan.payload[domain], Array.isArray]),
        [CONFIG_KEYS.uploadSettings, plan.payload.uploadSettings, isPlainObject],
        [CONFIG_KEYS.uiSettings, plan.payload.uiSettings, isPlainObject]
      ];
      try {
        for (const [key, value, validate] of writes) this.store.writeVerified(key, value, validate);
      } catch (error) {
        for (const [domain, key] of Object.entries(ARRAY_DOMAINS)) this.store.writeVerified(key, previous[domain], Array.isArray);
        this.store.writeVerified(CONFIG_KEYS.uploadSettings, previous.uploadSettings, isPlainObject);
        this.store.writeVerified(CONFIG_KEYS.uiSettings, previous.uiSettings, isPlainObject);
        throw new Error("Preset import failed and previous values were restored", { cause: error });
      }
      return this.refresh();
    }
  };

  // src/upload/vgen-upload-adapter.js
  var MODAL_SELECTOR = '.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]';
  var TAG_INPUT_SELECTOR = 'input[placeholder*="tag" i], input[placeholder*="标签"], input[aria-label*="tag" i], input[aria-label*="标签"]';
  function ownReactValue(element2, prefix) {
    if (!element2) return null;
    const key = Object.getOwnPropertyNames(element2).find((name) => name.startsWith(prefix));
    return key ? element2[key] : null;
  }
  function fiberCandidates(fiber) {
    return fiber?.alternate ? [fiber, fiber.alternate] : fiber ? [fiber] : [];
  }
  function reactProps(element2) {
    return ownReactValue(element2, "__reactProps$");
  }
  function expandableDisclosure(control, surface) {
    const content = control.closest?.("[aria-hidden]");
    const root = content?.parentElement;
    if (!root || !surface.contains(root)) return null;
    let node = control;
    for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1, node = node.parentElement || node.getRootNode?.()?.host || null) {
      let fiber = ownReactValue(node, "__reactFiber$") || ownReactValue(node, "__reactInternalInstance$");
      for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
        for (const candidate of fiberCandidates(fiber)) {
          const props = candidate.memoizedProps || candidate.pendingProps;
          if (!Object.hasOwn(props || {}, "isDefaultHidden") || typeof props?.onClickExpand !== "function") continue;
          let openHook = candidate.memoizedState;
          while (openHook && !(typeof openHook.memoizedState === "boolean" && typeof openHook.queue?.dispatch === "function")) openHook = openHook.next;
          if (!openHook) continue;
          return {
            root,
            collapse() {
              if (openHook.memoizedState !== true && ![...root.children].some((child) => child.getAttribute?.("aria-hidden") === "false")) return;
              const onClick = reactProps(root)?.onClick;
              if (typeof onClick === "function") onClick();
              else {
                openHook.queue.dispatch(false);
                props.onClickExpand(false);
              }
            }
          };
        }
      }
    }
    return null;
  }
  function deepQueryAll(root, selector) {
    const matches = [];
    const queue = [root].filter(Boolean);
    const visited = /* @__PURE__ */ new Set();
    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      matches.push(...current.querySelectorAll(selector));
      const documentObject = current.ownerDocument || current.host?.ownerDocument;
      if (!documentObject?.createTreeWalker) continue;
      const walker = documentObject.createTreeWalker(current, globalThis.NodeFilter?.SHOW_ELEMENT || 1);
      for (let element2 = walker.nextNode(); element2; element2 = walker.nextNode()) {
        if (element2.shadowRoot) queue.push(element2.shadowRoot);
      }
    }
    return [...new Set(matches)];
  }
  function tagBridgeFromInput(input) {
    let node = input;
    for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1, node = node.parentElement) {
      let fiber = ownReactValue(node, "__reactFiber$") || ownReactValue(node, "__reactInternalInstance$");
      for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
        for (const candidate of fiberCandidates(fiber)) {
          for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
            if (Array.isArray(props?.initialTags) && typeof props?.onChange === "function") {
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
            if (store && typeof store.getState === "function" && typeof store.dispatch === "function" && showcaseBody(store)) return store;
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
    return candidates.find((value) => value && typeof value === "object" && ("tags" in value || "title" in value)) || null;
  }
  function walkAncestorProps(element2, visitor) {
    let node = element2;
    for (let nodeDepth = 0; node && nodeDepth < 12; nodeDepth += 1, node = node.parentElement || node.getRootNode?.()?.host || null) {
      let fiber = ownReactValue(node, "__reactFiber$") || ownReactValue(node, "__reactInternalInstance$");
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
        if (props?.formValues && typeof props.formValues === "object" && typeof props.onFormValueChange === "function") {
          return { values: props.formValues, commit: props.onFormValueChange };
        }
        return null;
      });
      if (bridge) return bridge;
    }
    return null;
  }
  function findDiscoverySchema(surface) {
    const options = /* @__PURE__ */ new Map();
    const controls = surface.querySelectorAll('button, [role="button"], input[type="radio"], input[type="checkbox"]');
    for (const control of controls) {
      walkAncestorProps(control, (props) => {
        const option = props?.option;
        const id = String(option?.optionID || "").trim();
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
            if (Array.isArray(value?.children) && typeof value.apply === "function") return value;
          }
        }
        return null;
      });
      if (editor) return editor;
    }
    return null;
  }
  function replaceSlateValue(editor, serialized) {
    const nodes = JSON.parse(String(serialized || "[]"));
    if (!Array.isArray(nodes)) throw new TypeError("Description preset must contain Slate JSON");
    const apply = () => {
      for (let index = editor.children.length - 1; index >= 0; index -= 1) editor.apply({ type: "remove_node", path: [index], node: editor.children[index] });
      nodes.forEach((node, index) => editor.apply({ type: "insert_node", path: [index], node }));
    };
    if (typeof editor.withoutNormalizing === "function") editor.withoutNormalizing(apply);
    else apply();
  }
  function findTextCommit(surface, kind) {
    const selector = kind === "title" ? 'input:not([type]), input[type="text"]' : '.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"], textarea';
    for (const control of deepQueryAll(surface, selector)) {
      const commit = walkAncestorProps(control, (props) => {
        if (kind === "title" && typeof props?.onChange === "function" && typeof props?.value === "string") return props.onChange;
        if (kind === "description") return props?.onEditCallback || props?.onValueChange || (typeof props?.onChange === "function" ? props.onChange : null);
        return null;
      });
      if (commit) return commit;
    }
    return null;
  }
  function tagKey(value) {
    return String(typeof value === "string" ? value : value?.tag || "").trim().toLocaleLowerCase();
  }
  var VGenUploadAdapter = class {
    constructor(surface) {
      this.surface = surface;
    }
    static modalSelector = MODAL_SELECTOR;
    isOpen() {
      return Boolean(this.surface?.isConnected && !this.surface.hidden && this.surface.getAttribute?.("aria-hidden") !== "true");
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
        title: String(body?.title || ""),
        description: String(body?.description || ""),
        discoveryValues: discovery?.values ? structuredClone(discovery.values) : body?.searchCategoryVariantKeys ? [...body.searchCategoryVariantKeys] : [],
        discoverySchema: includeDiscoverySchema ? findDiscoverySchema(this.surface) : [],
        tags: [...body?.tags || bridge?.tags || []],
        tagLimit: bridge?.tagLimit || 20
      };
    }
    async setTags(tags) {
      const bridge = this.bridge();
      if (!bridge) throw new Error("VGen Search Tags component is not ready");
      const unique = [];
      const seen = /* @__PURE__ */ new Set();
      for (const tag of tags) {
        const value = String(typeof tag === "string" ? tag : tag?.tag || "").trim().replace(/ {2,}/g, " ").toLocaleLowerCase();
        if (!/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(value) || value.length > 50) throw new Error(`Invalid VGen Search Tag: ${value}`);
        const key = tagKey(value);
        if (value && !seen.has(key)) {
          seen.add(key);
          unique.push(value);
        }
      }
      if (unique.length > bridge.tagLimit) throw new Error(`Search Tags exceed the ${bridge.tagLimit} tag limit`);
      await bridge.onChange(unique);
      return unique;
    }
    async applyText(kind, value) {
      const bridge = this.bridge();
      const store = findStore(bridge);
      if (kind === "title") {
        const text = String(value || "");
        if (store) store.dispatch({ type: "SHOWCASE/UPDATE-TITLE", title: text });
        else {
          const commit = findTextCommit(this.surface, kind);
          if (!commit) throw new Error("VGen Title field is not ready");
          await commit({ target: { value: text }, currentTarget: { value: text } });
        }
      } else {
        const serialized = String(value || "");
        const editor = findSlateEditor(this.surface);
        if (editor) replaceSlateValue(editor, serialized);
        if (store) store.dispatch({ type: "SHOWCASE/UPDATE-DESCRIPTION", description: serialized });
        else {
          const commit = findTextCommit(this.surface, kind);
          if (!commit) throw new Error("VGen Description field is not ready");
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
      if (!store) throw new Error("VGen Discovery form is not ready");
      const keys = Array.isArray(values) ? values : Object.values(values).flat().filter(Boolean);
      store.dispatch({
        type: "SHOWCASE/SET-SEARCH-CATEGORY-VARIANT-KEYS",
        payload: { searchCategoryVariantKeys: keys }
      });
    }
    collapseDiscovery() {
      const disclosures = /* @__PURE__ */ new Map();
      for (const control of this.surface.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
        const disclosure = expandableDisclosure(control, this.surface);
        if (disclosure) disclosures.set(disclosure.root, disclosure);
      }
      for (const disclosure of disclosures.values()) disclosure.collapse();
    }
    async applyCombination(preset) {
      await this.applyText("title", preset?.title || "");
      await this.applyText("description", preset?.description || "");
      await this.applyDiscovery({ values: preset?.discoveryValues || {} });
      await this.setTags(preset?.tags || []);
    }
  };

  // src/upload/upload-assistant.js
  var CSS = `
.vgen-nya-upload{margin:10px 0;padding:10px;border:1px solid #cfd8e3;border-radius:10px;background:#f8fbff;color:#253247;font:13px/1.4 system-ui,sans-serif}.vgen-nya-upload *{box-sizing:border-box}.vgen-nya-upload__head{display:flex;align-items:center;gap:8px}.vgen-nya-upload__head strong{flex:1}.vgen-nya-upload button,.vgen-nya-upload select{font:inherit}.vgen-nya-upload button{cursor:pointer}.vgen-nya-upload__modules{display:grid;gap:8px;margin-top:9px}.vgen-nya-upload__row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.vgen-nya-upload__row>label{min-width:72px;font-weight:600}.vgen-nya-upload__row select{min-width:160px;max-width:360px}.vgen-nya-upload__groups{display:grid;gap:6px}.vgen-nya-upload__group{border:1px solid #d9e1ea;border-radius:8px;overflow:hidden}.vgen-nya-upload__group summary{padding:6px 8px;cursor:pointer}.vgen-nya-upload__tags{display:flex;flex-wrap:wrap;gap:5px;padding:7px}.vgen-nya-upload__tag[aria-pressed=true]{background:#1e78ca;color:#fff}.vgen-nya-upload__status{min-height:1.3em;color:#55657a}.vgen-nya-upload[data-theme=dark]{background:#1f2935;color:#eef5ff;border-color:#4b5b6d}.vgen-nya-upload[data-theme=dark] .vgen-nya-upload__group{border-color:#4b5b6d}
`;
  function make2(documentObject, tag, attributes = {}, text = "") {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "className") node.className = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node && key !== "style") node[key] = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }
  function presetValue(preset, kind) {
    if (kind === "title") return preset?.value ?? preset?.title ?? "";
    if (kind === "description") return preset?.value ?? preset?.description ?? "";
    return preset;
  }
  function keyOfTag(value) {
    return String(typeof value === "string" ? value : value?.tag || "").trim().toLocaleLowerCase();
  }
  var UploadAssistantSession = class {
    constructor({ surface, repository, adapter = new VGenUploadAdapter(surface), MutationObserverClass = globalThis.MutationObserver, onInactive = null }) {
      this.surface = surface;
      this.repository = repository;
      this.adapter = adapter;
      this.MutationObserverClass = MutationObserverClass;
      this.root = null;
      this.observer = null;
      this.unsubscribe = null;
      this.renderQueued = false;
      this.onInactive = onInactive;
    }
    mount() {
      if (this.root?.isConnected) return false;
      const documentObject = this.surface.ownerDocument;
      this.root = make2(documentObject, "section", {
        className: "vgen-nya-upload notranslate",
        dataset: { vgenNyaUi: "upload-assistant" },
        translate: false
      });
      this.root.addEventListener("click", (event) => this.onClick(event));
      this.root.addEventListener("change", (event) => this.onChange(event));
      const style = make2(documentObject, "style");
      style.textContent = CSS;
      this.root.append(style);
      const anchor = this.adapter.findTagInput?.()?.parentElement;
      (anchor?.parentElement || this.surface).append(this.root);
      this.unsubscribe = this.repository.subscribe(() => this.render());
      if (this.MutationObserverClass) {
        this.observer = new this.MutationObserverClass((records) => {
          if (typeof this.adapter.isOpen === "function" && !this.adapter.isOpen()) {
            this.onInactive?.();
            return;
          }
          if (records.some((record) => !this.root?.contains(record.target))) this.queueRender();
        });
        this.observer.observe(this.surface, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "data-state"] });
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
      this.root.replaceChildren(this.root.querySelector("style"));
      const head = make2(documentObject, "div", { className: "vgen-nya-upload__head" });
      head.append(
        make2(documentObject, "strong", {}, `Upload Assistant · ${native.tags.length}/${native.tagLimit}`),
        make2(documentObject, "button", { type: "button", dataset: { action: "refresh" }, title: "仅刷新 Upload Assistant 配置" }, "↻"),
        make2(documentObject, "button", { type: "button", dataset: { action: "collapse" }, "aria-expanded": String(!collapsed) }, collapsed ? "展开" : "折叠")
      );
      this.root.append(head);
      if (collapsed) return;
      const modules = make2(documentObject, "div", { className: "vgen-nya-upload__modules" });
      const settings = snapshot.uploadSettings.modules;
      if (settings.global) modules.append(this.presetRow(documentObject, "组合预设", "combination", snapshot.combinationPresets));
      if (settings.title) modules.append(this.presetRow(documentObject, "标题", "title", snapshot.titlePresets));
      if (settings.description) modules.append(this.presetRow(documentObject, "描述", "description", snapshot.descriptionPresets));
      if (settings.discovery) modules.append(this.presetRow(documentObject, "发现标签", "discovery", snapshot.discoveryPresets));
      if (settings.tags) {
        const groups = make2(documentObject, "div", { className: "vgen-nya-upload__groups" });
        for (const [index, group] of snapshot.searchTagGroups.entries()) {
          const details = make2(documentObject, "details", { className: "vgen-nya-upload__group", open: snapshot.uploadSettings.groupExpanded?.[group.id] ?? index === 0 });
          const tags = Array.isArray(group.tags) ? group.tags : [];
          const count = tags.filter((tag) => selected.has(keyOfTag(tag))).length;
          const summary = make2(documentObject, "summary", {}, `${group.name || "未命名"} ${count}/${tags.length}`);
          const list = make2(documentObject, "div", { className: "vgen-nya-upload__tags" });
          list.append(
            make2(documentObject, "button", { type: "button", dataset: { action: "group-add", groupId: group.id } }, "全部添加"),
            make2(documentObject, "button", { type: "button", dataset: { action: "group-remove", groupId: group.id } }, "全部删除")
          );
          for (const item of tags) {
            const value = typeof item === "string" ? item : item.tag;
            list.append(make2(documentObject, "button", {
              type: "button",
              className: "vgen-nya-upload__tag",
              dataset: { action: "tag", tag: value },
              title: item?.note ? `${value}（${item.note}）` : value,
              "aria-pressed": String(selected.has(keyOfTag(value)))
            }, item?.note ? `${value}【${item.note}】` : value));
          }
          details.addEventListener("toggle", () => {
            const next = this.repository.read().uploadSettings;
            next.groupExpanded[group.id] = details.open;
            this.repository.writeSettings(next);
          }, { once: true });
          details.append(summary, list);
          groups.append(details);
        }
        modules.append(groups);
      }
      modules.append(make2(documentObject, "div", { className: "vgen-nya-upload__status", dataset: { role: "status" } }));
      this.root.append(modules);
    }
    presetRow(documentObject, label, kind, presets) {
      const row = make2(documentObject, "div", { className: "vgen-nya-upload__row" });
      const select = make2(documentObject, "select", { dataset: { kind }, "aria-label": label });
      select.append(make2(documentObject, "option", { value: "" }, `选择${label}`));
      for (const preset of presets) select.append(make2(documentObject, "option", { value: preset.id }, preset.name || "未命名"));
      row.append(
        make2(documentObject, "label", {}, label),
        select,
        make2(documentObject, "button", { type: "button", dataset: { action: "save-current", kind } }, "保存当前")
      );
      return row;
    }
    setStatus(message) {
      const status = this.root?.querySelector('[data-role="status"]');
      if (status) status.textContent = message;
    }
    async onChange(event) {
      const select = event.target?.closest?.("select[data-kind]");
      if (!select?.value) return;
      const snapshot = this.repository.snapshot || this.repository.read();
      const map = { combination: "combinationPresets", title: "titlePresets", description: "descriptionPresets", discovery: "discoveryPresets" };
      const preset = snapshot[map[select.dataset.kind]]?.find((item) => String(item.id) === select.value);
      if (!preset) return;
      let message;
      try {
        if (select.dataset.kind === "combination") await this.adapter.applyCombination(preset);
        else if (select.dataset.kind === "discovery") {
          await this.adapter.applyDiscovery(preset);
          if (snapshot.uploadSettings.autoCollapseDiscovery) this.adapter.collapseDiscovery?.();
        } else await this.adapter.applyText(select.dataset.kind, presetValue(preset, select.dataset.kind));
        message = `已应用“${preset.name || "未命名"}”`;
      } catch (error) {
        message = error.message || "应用失败";
      } finally {
        select.value = "";
        this.render();
        this.setStatus(message);
      }
    }
    async onClick(event) {
      const button = event.target?.closest?.("button[data-action]");
      if (!button || !this.root.contains(button)) return;
      const snapshot = this.repository.snapshot || this.repository.read();
      if (button.dataset.action === "refresh") {
        this.repository.refresh();
        this.setStatus("已刷新 Upload Assistant 配置");
        return;
      }
      if (button.dataset.action === "collapse") {
        const next2 = snapshot.uploadSettings;
        next2.collapsed = !next2.collapsed;
        this.repository.writeSettings(next2);
        return;
      }
      if (button.dataset.action === "save-current") {
        const name = this.root.ownerDocument.defaultView?.prompt?.("预设名称");
        if (!name?.trim()) return;
        const native = this.adapter.read({ includeDiscovery: true, includeDiscoverySchema: true });
        const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const domainByKind = { combination: "combinationPresets", title: "titlePresets", description: "descriptionPresets", discovery: "discoveryPresets" };
        const domain = domainByKind[button.dataset.kind];
        const values = snapshot[domain];
        if (button.dataset.kind === "combination") values.push({ id, name: name.trim(), title: native.title, description: native.description, discoverySchema: native.discoverySchema || [], discoveryValues: native.discoveryValues, tags: native.tags });
        else if (button.dataset.kind === "discovery") values.push({ id, name: name.trim(), schema: native.discoverySchema || [], values: native.discoveryValues });
        else values.push({ id, name: name.trim(), value: native[button.dataset.kind] });
        this.repository.writeDomain(domain, values);
        this.setStatus(`已保存“${name.trim()}”`);
        return;
      }
      const current = this.adapter.read().tags;
      if (button.dataset.action === "tag") {
        const key = keyOfTag(button.dataset.tag);
        const next2 = current.some((tag) => keyOfTag(tag) === key) ? current.filter((tag) => keyOfTag(tag) !== key) : [...current, button.dataset.tag];
        await this.adapter.setTags(next2);
        this.render();
        return;
      }
      const group = snapshot.searchTagGroups.find((item) => String(item.id) === button.dataset.groupId);
      if (!group) return;
      const groupTags = (group.tags || []).map((item) => typeof item === "string" ? item : item.tag);
      const keys = new Set(groupTags.map(keyOfTag));
      const next = button.dataset.action === "group-remove" ? current.filter((tag) => !keys.has(keyOfTag(tag))) : [...current, ...groupTags.filter((tag) => !current.some((item) => keyOfTag(item) === keyOfTag(tag)))].slice(0, this.adapter.read().tagLimit);
      await this.adapter.setTags(next);
      this.render();
    }
    unmount() {
      this.observer?.disconnect();
      this.observer = null;
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.root?.remove();
      this.root = null;
    }
  };
  var UploadAssistantRuntime = class {
    constructor({ repository, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapterFactory = (surface) => new VGenUploadAdapter(surface) }) {
      this.repository = repository;
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
      this.adapterFactory = adapterFactory;
      this.sessions = /* @__PURE__ */ new Map();
      this.portalObserver = null;
      this.probes = /* @__PURE__ */ new Map();
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
        ...root.matches?.(selector) ? [root] : [],
        ...root.querySelectorAll?.(selector) || []
      ];
      let mounted = 0;
      for (const surface of candidates) {
        if (this.sessions.has(surface)) continue;
        const adapter = this.adapterFactory(surface);
        if (!adapter.findTagInput?.()) continue;
        const session = new UploadAssistantSession({
          surface,
          repository: this.repository,
          adapter,
          MutationObserverClass: this.MutationObserverClass,
          onInactive: () => {
            session.unmount();
            this.sessions.delete(surface);
          }
        });
        session.mount();
        this.sessions.set(surface, session);
        mounted += 1;
      }
      return mounted;
    }
    probeAddedRoot(root) {
      if (!this.MutationObserverClass || !root?.querySelectorAll || this.probes.has(root)) return;
      const likelyPortal = root.matches?.(`${VGenUploadAdapter.modalSelector}, .ReactModalPortal, [data-radix-portal], [data-portal]`) || root.querySelector?.(".ReactModalPortal, [data-radix-portal], [data-portal]");
      if (!likelyPortal) return;
      const observer = new this.MutationObserverClass(() => {
        if (this.scanKnownModals(root)) this.releaseProbe(root);
      });
      observer.observe(root, { childList: true, subtree: true });
      const timer = globalThis.setTimeout(() => this.releaseProbe(root), 1e4);
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
      for (const [surface, session] of this.sessions) {
        if (surface === root || root.contains?.(surface) || !surface.isConnected) {
          session.unmount();
          this.sessions.delete(surface);
        }
      }
    }
    activate() {
    }
    unmount() {
      this.portalObserver?.disconnect();
      this.portalObserver = null;
      for (const root of [...this.probes.keys()]) this.releaseProbe(root);
      for (const session of this.sessions.values()) session.unmount();
      this.sessions.clear();
    }
    dispose() {
      this.unmount();
    }
  };

  // src/index.js
  function createVGenNyaCore({ storageDriver, gm = globalThis } = {}) {
    const store = new ConfigStore(storageDriver || createGMStorageDriver(gm));
    const modules = new ModuleManager();
    const uploadRepository = new UploadConfigRepository(store);
    const settingsShell = createSettingsShell({ navigation: createUploadSettingsNavigation(uploadRepository, SETTINGS_NAVIGATION) });
    const uploadAssistant = new UploadAssistantRuntime({ repository: uploadRepository, documentObject: gm.document, MutationObserverClass: gm.MutationObserver });
    const clipboard = new Clipboard({ gmSetClipboard: gm.GM_setClipboard });
    modules.register("settings", settingsShell);
    modules.register("upload-assistant", uploadAssistant);
    return {
      store,
      modules,
      clipboard,
      settingsShell,
      uploadAssistant,
      uploadRepository,
      migrateLegacyData: () => migrateLegacyData(store),
      prepareLegacyImport: (inputs, options) => prepareLegacyImport(inputs, store, options),
      commitLegacyImport: (plan, options) => commitLegacyImport(plan, store, options),
      recoverPendingLegacyImport: () => recoverPendingLegacyImport(store),
      readConfig: (key, fallback) => readCompatibleConfig(store, key, fallback),
      mountSettings(host) {
        modules.mount("settings", { host });
        modules.activate("settings");
      },
      unmountSettings() {
        modules.unmount("settings");
      },
      mountUploadAssistant() {
        modules.mount("upload-assistant");
        modules.activate("upload-assistant");
      },
      unmountUploadAssistant() {
        modules.unmount("upload-assistant");
      },
      dispose() {
        modules.disposeAll();
      }
    };
  }

  // src/userscript-entry.js
  var APP_VERSION = "0.1.0";
  var core = createVGenNyaCore({ gm: globalThis });
  var overlay = null;
  var keydownHandler = null;
  function closeSettings() {
    if (!overlay) return;
    core.unmountSettings();
    if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
    overlay.remove();
    overlay = null;
    keydownHandler = null;
  }
  function openSettings() {
    if (overlay) {
      overlay.hidden = false;
      return;
    }
    const documentObject = globalThis.document;
    if (!documentObject?.body) throw new Error("Document body is unavailable");
    overlay = documentObject.createElement("div");
    overlay.id = "vgen-nya-settings-overlay";
    overlay.className = "notranslate";
    overlay.dataset.vgenNyaUi = "settings-overlay";
    overlay.translate = false;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "overflow:auto",
      "padding:24px",
      "background:rgba(0,0,0,.52)",
      "box-sizing:border-box"
    ].join(";");
    const frame = documentObject.createElement("div");
    frame.style.cssText = "position:relative;max-width:1040px;margin:0 auto";
    const closeButton = documentObject.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "关闭";
    closeButton.title = `VGenToolNya ${APP_VERSION}`;
    closeButton.style.cssText = [
      "display:block",
      "margin:0 0 8px auto",
      "padding:7px 12px",
      "border:1px solid #bbb",
      "border-radius:8px",
      "background:#fff",
      "cursor:pointer"
    ].join(";");
    const host = documentObject.createElement("div");
    frame.append(closeButton, host);
    overlay.append(frame);
    documentObject.body.append(overlay);
    closeButton.addEventListener("click", closeSettings, { once: true });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeSettings();
    });
    keydownHandler = (event) => {
      if (event.key === "Escape") closeSettings();
    };
    documentObject.addEventListener("keydown", keydownHandler);
    core.mountSettings(host);
  }
  function start() {
    GM_registerMenuCommand(`VGenToolNya ${APP_VERSION}：设置`, openSettings);
    core.mountUploadAssistant();
  }
  start();
})();
