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
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
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
    clientsSettings: "vgen-nya.clients-settings.v1",
    chatQuickReplyPresets: "vgen-nya.text-presets.chat-quick-reply.v1",
    privateNotePresets: "vgen-nya.text-presets.private-note.v1",
    finalDeliveryPresets: "vgen-nya.text-presets.final-delivery.v1",
    orderSettings: "vgen-nya.order-settings.v1",
    reviewProvider: "vgen-nya.review-provider.v1",
    reviewSettings: "vgen-nya.review-settings.v1"
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
.vgen-nya-settings__nav button, .vgen-nya-settings__tabs button, .vgen-nya-settings__section-toggle { color: #242424; font: inherit; }
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
.vgen-nya-settings__preset-row button,.vgen-nya-settings__preset-editor button,.vgen-nya-settings__preset-add button{padding:5px 8px;border:1px solid #cbd5e1;border-radius:7px;background:#f3f4f6;color:#242424;cursor:pointer;font:inherit}.vgen-nya-settings__preset-row button:disabled,.vgen-nya-settings__preset-editor button:disabled{opacity:.45;cursor:default}
.vgen-nya-settings__check { display:block;margin:7px 0; }
.vgen-nya-settings__toolbar { margin-bottom:8px; }
.vgen-nya-settings__hint{margin:0 0 10px;color:inherit;opacity:.72}.vgen-nya-settings__preset-editor{display:grid;grid-template-columns:minmax(110px,.7fr) minmax(180px,1.4fr) minmax(100px,1fr) repeat(4,auto);gap:7px;align-items:center;padding:8px 0;border-bottom:1px solid #e5e7eb}.vgen-nya-settings__preset-editor input,.vgen-nya-settings__preset-editor textarea,.vgen-nya-settings__preset-add input,.vgen-nya-settings__preset-add textarea{width:100%;min-width:0;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;background:inherit;color:inherit;font:inherit}.vgen-nya-settings__preset-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72}.vgen-nya-settings__preset-add{display:grid;grid-template-columns:minmax(120px,.7fr) minmax(220px,1.8fr) auto;gap:7px;align-items:center;margin-top:12px}.vgen-nya-settings__preset-status{min-height:1.4em;margin:8px 0 0}.vgen-nya-settings__preset-status[data-error="true"]{color:#c62828}
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

  // src/presets/context-registry.js
  var TEXT_PRESET_CONTEXTS = Object.freeze({
    uploadTitle: "upload-title",
    uploadDescription: "upload-description",
    finalDelivery: "final-delivery",
    privateNote: "private-note",
    chatQuickReply: "chat-quick-reply"
  });
  var TextPresetContextRegistry = class {
    constructor(entries = []) {
      this.contexts = new Map(entries);
    }
    register(id, adapter) {
      if (!Object.values(TEXT_PRESET_CONTEXTS).includes(id)) throw new TypeError(`Unknown text preset context: ${id}`);
      for (const method of ["serialize", "deserialize", "preview", "fill", "validate"]) {
        if (typeof adapter?.[method] !== "function") throw new TypeError(`${id} adapter requires ${method}()`);
      }
      this.contexts.set(id, adapter);
      return adapter;
    }
    get(id) {
      const adapter = this.contexts.get(id);
      if (!adapter) throw new TypeError(`Text preset context is not registered: ${id}`);
      return adapter;
    }
    has(id) {
      return this.contexts.has(id);
    }
  };

  // src/settings/text-preset-settings.js
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
  function renderTextPresetManager(engine, context, { contentLabel = "内容" } = {}) {
    return ({ documentObject, body, use }) => {
      let dragIndex = null;
      const status = make(documentObject, "p", { className: "vgen-nya-settings__preset-status", dataset: { role: "status" } });
      const render = () => {
        const items = engine.list(context);
        body.replaceChildren(make(documentObject, "p", { className: "vgen-nya-settings__hint" }, `${items.length} 项 · 可拖动或使用箭头排序；点击业务页面预设只填入，不提交。`));
        for (const [index, preset] of items.entries()) {
          const row = make(documentObject, "div", { className: "vgen-nya-settings__preset-editor", dataset: { index }, draggable: true });
          const name = make(documentObject, "input", { value: preset.name, dataset: { role: "name" }, "aria-label": "预设名称" });
          name.value = preset.name;
          const content = make(documentObject, "textarea", { rows: 2, dataset: { role: "content" }, "aria-label": contentLabel });
          content.value = engine.registry.get(context).deserialize(preset);
          const preview = make(documentObject, "span", { className: "vgen-nya-settings__preset-preview", title: engine.preview(context, preset.id, 500) }, engine.preview(context, preset.id, 100) || "（空内容）");
          row.append(
            name,
            content,
            preview,
            make(documentObject, "button", { type: "button", dataset: { action: "save", id: preset.id } }, "保存"),
            make(documentObject, "button", { type: "button", dataset: { action: "up", index }, disabled: index === 0 }, "↑"),
            make(documentObject, "button", { type: "button", dataset: { action: "down", index }, disabled: index === items.length - 1 }, "↓"),
            make(documentObject, "button", { type: "button", dataset: { action: "delete", id: preset.id } }, "删除")
          );
          body.append(row);
        }
        const add = make(documentObject, "div", { className: "vgen-nya-settings__preset-add" });
        const newName = make(documentObject, "input", { placeholder: "新预设名称", dataset: { role: "new-name" } });
        const newContent = make(documentObject, "textarea", { rows: 2, placeholder: contentLabel, dataset: { role: "new-content" } });
        add.append(newName, newContent, make(documentObject, "button", { type: "button", dataset: { action: "add" } }, "新建"));
        body.append(add, status);
      };
      const show = (message, error = false) => {
        const node = body.querySelector('[data-role="status"]');
        if (node) {
          node.textContent = message;
          node.dataset.error = String(error);
        }
      };
      const onClick = (event) => {
        const button = event.target?.closest?.("button[data-action]");
        if (!button || !body.contains(button)) return;
        try {
          const action = button.dataset.action;
          if (action === "add") {
            const name = body.querySelector('[data-role="new-name"]')?.value || "";
            const payload = body.querySelector('[data-role="new-content"]')?.value || "";
            engine.create(context, { name, payload });
          } else if (action === "save") {
            const row = button.closest(".vgen-nya-settings__preset-editor");
            engine.update(context, button.dataset.id, { name: row.querySelector('[data-role="name"]')?.value, payload: row.querySelector('[data-role="content"]')?.value });
          } else if (action === "delete") engine.delete(context, button.dataset.id);
          else {
            const from = Number(button.dataset.index);
            engine.reorder(context, from, action === "up" ? from - 1 : from + 1);
          }
          render();
          show("已保存");
        } catch (error) {
          show(error.message || "保存失败", true);
        }
      };
      const onDragStart = (event) => {
        dragIndex = Number(event.target?.closest?.("[data-index]")?.dataset.index);
      };
      const onDragOver = (event) => {
        if (event.target?.closest?.("[data-index]")) event.preventDefault();
      };
      const onDrop = (event) => {
        const to = Number(event.target?.closest?.("[data-index]")?.dataset.index);
        if (Number.isInteger(dragIndex) && Number.isInteger(to) && dragIndex !== to) {
          engine.reorder(context, dragIndex, to);
          render();
        }
        dragIndex = null;
      };
      body.addEventListener("click", onClick);
      body.addEventListener("dragstart", onDragStart);
      body.addEventListener("dragover", onDragOver);
      body.addEventListener("drop", onDrop);
      use(() => body.removeEventListener("click", onClick));
      use(() => body.removeEventListener("dragstart", onDragStart));
      use(() => body.removeEventListener("dragover", onDragOver));
      use(() => body.removeEventListener("drop", onDrop));
      render();
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
  function make2(documentObject, tag, attributes = {}, text = "") {
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
        const toolbar = make2(documentObject, "div", { className: "vgen-nya-settings__toolbar" });
        toolbar.append(make2(documentObject, "span", {}, `${data.length} 项；顺序即 Upload Assistant 显示顺序。`));
        body.append(toolbar);
        data.forEach((preset, index) => {
          const row = make2(documentObject, "div", { className: "vgen-nya-settings__preset-row" });
          row.append(
            make2(documentObject, "span", {}, preset.name || preset.tag || `未命名 ${index + 1}`),
            make2(documentObject, "button", { type: "button", dataset: { action: "up", index }, disabled: index === 0 }, "↑"),
            make2(documentObject, "button", { type: "button", dataset: { action: "down", index }, disabled: index === data.length - 1 }, "↓"),
            make2(documentObject, "button", { type: "button", dataset: { action: "delete", index } }, "删除")
          );
          body.append(row);
        });
        const editor = make2(documentObject, "details");
        const summary = make2(documentObject, "summary", {}, "高级 JSON 编辑（保留原字段）");
        const textarea = make2(documentObject, "textarea", { rows: 10, value: JSON.stringify(data, null, 2), dataset: { role: "json" } });
        textarea.style.width = "100%";
        const save = make2(documentObject, "button", { type: "button", dataset: { action: "save-json" } }, "校验并保存");
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
        const row = make2(documentObject, "label", { className: "vgen-nya-settings__check" });
        row.append(make2(documentObject, "input", { type: "checkbox", checked: settings.modules[key], dataset: { module: key } }), documentObject.createTextNode(` ${label}`));
        body.append(row);
      }
      const collapse = make2(documentObject, "label", { className: "vgen-nya-settings__check" });
      collapse.append(make2(documentObject, "input", { type: "checkbox", checked: settings.autoCollapseDiscovery, dataset: { setting: "autoCollapseDiscovery" } }), documentObject.createTextNode(" 应用后自动折叠发现标签"));
      const theme = make2(documentObject, "select", { dataset: { setting: "theme" } });
      theme.append(make2(documentObject, "option", { value: "light", selected: snapshot.uiSettings.theme === "light" }, "浅色"), make2(documentObject, "option", { value: "dark", selected: snapshot.uiSettings.theme === "dark" }, "深色"));
      const refresh = make2(documentObject, "button", { type: "button", dataset: { action: "refresh" } }, "刷新 Upload 配置");
      const exportButton = make2(documentObject, "button", { type: "button", dataset: { action: "export" } }, "导出日常预设");
      const importInput = make2(documentObject, "input", { type: "file", accept: "application/json,.json", dataset: { action: "import" } });
      body.append(collapse, make2(documentObject, "div", {}, "主题："), theme, refresh, exportButton, importInput);
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
          const anchor = make2(documentObject, "a", { href: url, download: `vgen-nya-upload-presets-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json` });
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
  function createUploadSettingsNavigation(repository, baseNavigation, textPresetEngine = null) {
    return baseNavigation.map((item) => item.id !== "upload" ? item : {
      ...item,
      tabs: [
        { id: "combination", label: "组合预设", sections: [{ id: "combination", title: DOMAIN_LABELS.combinationPresets, render: renderPresetManager(repository, "combinationPresets") }] },
        { id: "text", label: "标题 / 描述", sections: [
          { id: "title", title: DOMAIN_LABELS.titlePresets, render: textPresetEngine ? renderTextPresetManager(textPresetEngine, TEXT_PRESET_CONTEXTS.uploadTitle, { contentLabel: "标题内容" }) : renderPresetManager(repository, "titlePresets") },
          { id: "description", title: DOMAIN_LABELS.descriptionPresets, render: textPresetEngine ? renderTextPresetManager(textPresetEngine, TEXT_PRESET_CONTEXTS.uploadDescription, { contentLabel: "Slate JSON" }) : renderPresetManager(repository, "descriptionPresets") }
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
  function expandableDisclosure(control3, surface) {
    const content = control3.closest?.("[aria-hidden]");
    const root = content?.parentElement;
    if (!root || !surface.contains(root)) return null;
    let node = control3;
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
    for (const control3 of controls) {
      const bridge = walkAncestorProps(control3, (props) => {
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
    for (const control3 of controls) {
      walkAncestorProps(control3, (props) => {
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
    for (const control3 of controls) {
      const editor = walkAncestorProps(control3, (_props, fiber) => {
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
    for (const control3 of deepQueryAll(surface, selector)) {
      const commit = walkAncestorProps(control3, (props) => {
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
      for (const control3 of this.surface.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
        const disclosure = expandableDisclosure(control3, this.surface);
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
  function make3(documentObject, tag, attributes = {}, text = "") {
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
      this.root = make3(documentObject, "section", {
        className: "vgen-nya-upload notranslate",
        dataset: { vgenNyaUi: "upload-assistant" },
        translate: false
      });
      this.root.addEventListener("click", (event) => this.onClick(event));
      this.root.addEventListener("change", (event) => this.onChange(event));
      const style = make3(documentObject, "style");
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
      const head = make3(documentObject, "div", { className: "vgen-nya-upload__head" });
      head.append(
        make3(documentObject, "strong", {}, `Upload Assistant · ${native.tags.length}/${native.tagLimit}`),
        make3(documentObject, "button", { type: "button", dataset: { action: "refresh" }, title: "仅刷新 Upload Assistant 配置" }, "↻"),
        make3(documentObject, "button", { type: "button", dataset: { action: "collapse" }, "aria-expanded": String(!collapsed) }, collapsed ? "展开" : "折叠")
      );
      this.root.append(head);
      if (collapsed) return;
      const modules = make3(documentObject, "div", { className: "vgen-nya-upload__modules" });
      const settings = snapshot.uploadSettings.modules;
      if (settings.global) modules.append(this.presetRow(documentObject, "组合预设", "combination", snapshot.combinationPresets));
      if (settings.title) modules.append(this.presetRow(documentObject, "标题", "title", snapshot.titlePresets, native.title));
      if (settings.description) modules.append(this.presetRow(documentObject, "描述", "description", snapshot.descriptionPresets, native.description));
      if (settings.discovery) modules.append(this.presetRow(documentObject, "发现标签", "discovery", snapshot.discoveryPresets));
      if (settings.tags) {
        const groups = make3(documentObject, "div", { className: "vgen-nya-upload__groups" });
        for (const [index, group] of snapshot.searchTagGroups.entries()) {
          const details = make3(documentObject, "details", { className: "vgen-nya-upload__group", open: snapshot.uploadSettings.groupExpanded?.[group.id] ?? index === 0 });
          const tags = Array.isArray(group.tags) ? group.tags : [];
          const count = tags.filter((tag) => selected.has(keyOfTag(tag))).length;
          const summary = make3(documentObject, "summary", {}, `${group.name || "未命名"} ${count}/${tags.length}`);
          const list = make3(documentObject, "div", { className: "vgen-nya-upload__tags" });
          list.append(
            make3(documentObject, "button", { type: "button", dataset: { action: "group-add", groupId: group.id } }, "全部添加"),
            make3(documentObject, "button", { type: "button", dataset: { action: "group-remove", groupId: group.id } }, "全部删除")
          );
          for (const item of tags) {
            const value = typeof item === "string" ? item : item.tag;
            list.append(make3(documentObject, "button", {
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
      modules.append(make3(documentObject, "div", { className: "vgen-nya-upload__status", dataset: { role: "status" } }));
      this.root.append(modules);
    }
    presetRow(documentObject, label, kind, presets, currentValue = void 0) {
      const row = make3(documentObject, "div", { className: "vgen-nya-upload__row" });
      const select = make3(documentObject, "select", { dataset: { kind }, "aria-label": label });
      select.append(make3(documentObject, "option", { value: "" }, `选择${label}`));
      for (const preset of presets) select.append(make3(documentObject, "option", { value: preset.id }, preset.name || "未命名"));
      if (currentValue !== void 0) select.value = String(presets.find((preset) => presetValue(preset, kind) === currentValue)?.id || "");
      row.append(
        make3(documentObject, "label", {}, label),
        select,
        make3(documentObject, "button", { type: "button", dataset: { action: "save-current", kind } }, "保存当前")
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
        } else if (this.textPresetEngine) {
          const context = select.dataset.kind === "title" ? TEXT_PRESET_CONTEXTS.uploadTitle : TEXT_PRESET_CONTEXTS.uploadDescription;
          await this.textPresetEngine.select(context, preset.id, this.adapter);
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
        else if (this.textPresetEngine) {
          const context = button.dataset.kind === "title" ? TEXT_PRESET_CONTEXTS.uploadTitle : TEXT_PRESET_CONTEXTS.uploadDescription;
          this.textPresetEngine.create(context, { id, name: name.trim(), payload: native[button.dataset.kind] });
        } else values.push({ id, name: name.trim(), value: native[button.dataset.kind] });
        if (button.dataset.kind === "combination" || button.dataset.kind === "discovery" || !this.textPresetEngine) this.repository.writeDomain(domain, values);
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
    constructor({ repository, textPresetEngine, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapterFactory = (surface) => new VGenUploadAdapter(surface) }) {
      this.repository = repository;
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
      this.adapterFactory = adapterFactory;
      this.textPresetEngine = textPresetEngine;
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
          textPresetEngine: this.textPresetEngine,
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

  // src/chat/chat-config.js
  var CHAT_DEFAULTS = Object.freeze({
    enabled: true,
    keepUnread: false,
    reactionMarkRead: false,
    showSeen: true,
    showTimestamps: true,
    showStatusBar: true,
    compactReactions: true,
    searchEnabled: true
  });
  var CLIENTS_DEFAULTS = Object.freeze({
    enabled: true,
    minHeight: 220,
    rowHeight: 52,
    collapsed: false
  });
  var clamp2 = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  var string = (value, maximum = Infinity) => typeof value === "string" ? value.slice(0, maximum) : "";
  function normalizeChatSettings(value = {}) {
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
      searchEnabled: raw.searchEnabled !== false
    };
  }
  function normalizeClientsSettings(value = {}) {
    const raw = isPlainObject(value) ? value : {};
    return {
      ...cloneStorageValue(raw),
      enabled: raw.enabled !== false,
      minHeight: clamp2(Number(raw.minHeight) || CLIENTS_DEFAULTS.minHeight, 120, 520),
      rowHeight: clamp2(Number(raw.rowHeight) || CLIENTS_DEFAULTS.rowHeight, 42, 88),
      collapsed: Boolean(raw.collapsed)
    };
  }
  function normalizeClient(item, index = 0) {
    if (!isPlainObject(item)) throw new TypeError(`Frequent Client ${index + 1} must be an object`);
    const username = string(item.username).trim().replace(/^@/, "");
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
      createdAt: Number(item.createdAt) || Date.now()
    };
  }
  function normalizeClients(value = []) {
    if (!Array.isArray(value)) throw new TypeError("Frequent Clients must be an array");
    const seen = /* @__PURE__ */ new Set();
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
  var ChatConfigRepository = class {
    constructor(store) {
      this.store = store;
      this.listeners = /* @__PURE__ */ new Set();
    }
    read() {
      return {
        chatSettings: normalizeChatSettings(readCompatibleConfig(this.store, CONFIG_KEYS.chatSettings, CHAT_DEFAULTS).value),
        clientsSettings: normalizeClientsSettings(readCompatibleConfig(this.store, CONFIG_KEYS.clientsSettings, CLIENTS_DEFAULTS).value),
        clients: normalizeClients(readCompatibleConfig(this.store, CONFIG_KEYS.clients, []).value)
      };
    }
    writeChatSettings(value) {
      return this.#write(CONFIG_KEYS.chatSettings, normalizeChatSettings(value), "chat-settings");
    }
    writeClientsSettings(value) {
      return this.#write(CONFIG_KEYS.clientsSettings, normalizeClientsSettings(value), "clients-settings");
    }
    writeClients(value) {
      return this.#write(CONFIG_KEYS.clients, normalizeClients(value), "clients");
    }
    reorderClient(from, to) {
      const clients = this.read().clients;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= clients.length || to >= clients.length) {
        throw new RangeError("Invalid Frequent Client order");
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
  };

  // src/chat/read-gate.js
  function parseJSON(value) {
    if (!value) return null;
    if (typeof value === "object" && !(value instanceof ArrayBuffer)) return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  }
  function channelIdFromURL(value, base = "https://vgen.co/") {
    try {
      const pathname = new URL(String(value || ""), base).pathname;
      const match = pathname.match(/\/channels\/([^/]+)\/([^/]+)(?:\/|$)/i);
      return match ? `${decodeURIComponent(match[1])}:${decodeURIComponent(match[2])}` : null;
    } catch {
      return null;
    }
  }
  function classifyStreamRequest(method, value, base = "https://vgen.co/") {
    try {
      const parsed = new URL(String(value || ""), base);
      if (!/(^|\.)stream-io-api\.com$/i.test(parsed.hostname)) return { kind: "other", cid: null };
      const upper = String(method || "GET").toUpperCase();
      const cid = channelIdFromURL(parsed.href, base);
      if (upper === "POST" && /\/channels\/(?:[^/]+\/[^/]+\/read|read)$/i.test(parsed.pathname)) return { kind: "read", cid };
      if (upper === "POST" && /\/channels\/[^/]+\/[^/]+\/message$/i.test(parsed.pathname)) return { kind: "message", cid };
      const reaction = parsed.pathname.match(/\/messages\/([^/]+)\/reaction(?:\/[^/]+)?$/i);
      if (reaction && /^(POST|DELETE)$/.test(upper)) return { kind: "reaction", cid, messageId: decodeURIComponent(reaction[1]) };
      return { kind: "other", cid };
    } catch {
      return { kind: "other", cid: null };
    }
  }
  var ReadGate = class {
    constructor({ enabled = false, reactionMarkRead = false } = {}) {
      this.enabled = Boolean(enabled);
      this.reactionMarkRead = Boolean(reactionMarkRead);
      this.latest = /* @__PURE__ */ new Map();
      this.pending = /* @__PURE__ */ new Map();
      this.manualPermits = /* @__PURE__ */ new Map();
      this.replyBoundaries = /* @__PURE__ */ new Map();
      this.confirmations = /* @__PURE__ */ new Set();
    }
    configure({ enabled = this.enabled, reactionMarkRead = this.reactionMarkRead } = {}) {
      const wasEnabled = this.enabled;
      this.enabled = Boolean(enabled);
      this.reactionMarkRead = Boolean(reactionMarkRead);
      if (wasEnabled && !this.enabled) this.cancelAll("read-control-disabled");
    }
    channelForMessage(messageId) {
      const wanted = String(messageId || "");
      if (!wanted) return null;
      for (const [cid, message] of this.latest) if (message.id === wanted) return cid;
      return null;
    }
    observeLatest(cid, message) {
      if (!cid || !message?.id) return;
      const current = this.latest.get(cid);
      this.latest.set(cid, { id: String(message.id), createdAt: message.created_at || message.createdAt || null, senderId: message.user?.id || message.senderId || null });
      if (current?.id && current.id !== message.id) this.replyBoundaries.delete(cid);
    }
    interceptRead({ cid, body, perform, cancel }) {
      if (!this.enabled || !cid) return perform("native");
      const requestedId = parseJSON(body)?.message_id;
      const latest = this.latest.get(cid);
      const manual = this.manualPermits.get(cid);
      if (manual && latest?.id === manual.targetId && (!requestedId || requestedId === manual.targetId)) {
        this.manualPermits.delete(cid);
        return perform(manual.reason);
      }
      const reply = this.replyBoundaries.get(cid);
      if (reply && latest?.id === reply.targetId && (!requestedId || requestedId === reply.targetId)) return perform("confirmed-reply-boundary");
      return new Promise((resolve, reject) => {
        const entry = {
          release: (reason) => Promise.resolve().then(() => perform(reason)).then(resolve, reject),
          cancel: (reason) => {
            cancel?.(reason);
            const error = new Error(`Read request cancelled: ${reason}`);
            error.name = "AbortError";
            reject(error);
          }
        };
        const entries = this.pending.get(cid) || [];
        if (entries.length >= 4) entries.shift().cancel("superseded");
        entries.push(entry);
        this.pending.set(cid, entries);
      });
    }
    manualRelease(cid, nativeMarkRead) {
      const target = this.latest.get(cid);
      if (!this.enabled || !cid || !target?.id || this.confirmations.has(cid)) return { released: 0, reason: "boundary-unavailable" };
      this.confirmations.add(cid);
      const entries = this.pending.get(cid) || [];
      this.pending.delete(cid);
      if (entries.length) {
        entries.forEach((entry) => entry.release("manual-click"));
        return { released: entries.length };
      }
      this.manualPermits.set(cid, { targetId: target.id, reason: "manual-click" });
      return { released: 0, operation: nativeMarkRead?.({ message_id: target.id }) };
    }
    confirmServerRead(cid) {
      this.confirmations.delete(cid);
      this.manualPermits.delete(cid);
    }
    confirmReply(cid, message) {
      if (!this.enabled || !cid || !message?.id) return 0;
      this.observeLatest(cid, message);
      this.replyBoundaries.set(cid, { targetId: String(message.id), createdAt: message.created_at || null });
      return this.#release(cid, "confirmed-reply-boundary");
    }
    confirmReaction(cid, boundaryId) {
      if (!this.enabled || !this.reactionMarkRead || this.latest.get(cid)?.id !== boundaryId) return 0;
      return this.#release(cid, "confirmed-reaction");
    }
    cancelAll(reason = "cleanup") {
      for (const entries of this.pending.values()) entries.forEach((entry) => entry.cancel(reason));
      this.pending.clear();
      this.manualPermits.clear();
      this.replyBoundaries.clear();
      this.confirmations.clear();
    }
    #release(cid, reason) {
      const entries = this.pending.get(cid) || [];
      this.pending.delete(cid);
      entries.forEach((entry) => entry.release(reason));
      return entries.length;
    }
  };

  // src/chat/network-hooks.js
  async function responseJSON(response) {
    try {
      return await response?.clone?.().json?.();
    } catch {
      return null;
    }
  }
  var ChatNetworkHooks = class {
    constructor({ windowObject = globalThis, readGate, onDiagnosticEvent = () => {
    } } = {}) {
      this.window = windowObject;
      this.readGate = readGate;
      this.onDiagnosticEvent = onDiagnosticEvent;
      this.readEnabled = false;
      this.diagnosticsEnabled = false;
      this.httpNatives = null;
      this.realtimeNatives = null;
      this.xhrMeta = /* @__PURE__ */ new WeakMap();
    }
    configureRead(enabled) {
      this.readEnabled = Boolean(enabled);
      this.#sync();
    }
    configureDiagnostics(enabled) {
      this.diagnosticsEnabled = Boolean(enabled);
      this.#sync();
    }
    #sync() {
      if (this.readEnabled || this.diagnosticsEnabled) this.#installHTTP();
      else this.#restoreHTTP();
      if (this.diagnosticsEnabled) this.#installRealtime();
      else this.#restoreRealtime();
    }
    #installHTTP() {
      if (this.httpNatives) return;
      const windowObject = this.window;
      const nativeFetch = windowObject.fetch;
      const XHR = windowObject.XMLHttpRequest;
      this.httpNatives = {
        fetch: nativeFetch,
        XHR,
        open: XHR?.prototype?.open,
        send: XHR?.prototype?.send,
        abort: XHR?.prototype?.abort
      };
      if (typeof nativeFetch === "function") {
        const runtime = this;
        windowObject.fetch = function vgenNyaFetch(input, init = {}) {
          const rawURL = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
          const method = init.method || input?.method || "GET";
          const classification = classifyStreamRequest(method, rawURL, windowObject.location?.href);
          if (classification.kind === "reaction" && !classification.cid) classification.cid = runtime.readGate?.channelForMessage(classification.messageId);
          const boundary = classification.kind === "reaction" ? runtime.readGate?.latest.get(classification.cid)?.id : null;
          const perform = (reason = "native") => {
            runtime.#event("http.request", { method: String(method).toUpperCase(), kind: classification.kind, cid: classification.cid, reason });
            const result = nativeFetch.apply(this, arguments);
            Promise.resolve(result).then(async (response) => {
              const raw = classification.kind === "message" ? await responseJSON(response) : null;
              runtime.#finish(classification, response?.ok, raw, boundary);
              runtime.#event("http.response", { status: response?.status, kind: classification.kind, cid: classification.cid });
            }, (error) => runtime.#event("http.error", { kind: classification.kind, name: error?.name || "Error" }));
            return result;
          };
          if (runtime.readEnabled && classification.kind === "read") {
            return runtime.readGate.interceptRead({ cid: classification.cid, body: init.body, perform });
          }
          return perform();
        };
        Object.setPrototypeOf(windowObject.fetch, nativeFetch);
      }
      if (XHR?.prototype && typeof this.httpNatives.open === "function" && typeof this.httpNatives.send === "function") {
        const runtime = this;
        XHR.prototype.open = function vgenNyaOpen(method, url) {
          runtime.xhrMeta.set(this, { method, url });
          return runtime.httpNatives.open.apply(this, arguments);
        };
        XHR.prototype.send = function vgenNyaSend(body) {
          const xhr = this;
          const meta = runtime.xhrMeta.get(xhr) || {};
          const classification = classifyStreamRequest(meta.method, meta.url, windowObject.location?.href);
          if (classification.kind === "reaction" && !classification.cid) classification.cid = runtime.readGate?.channelForMessage(classification.messageId);
          const boundary = classification.kind === "reaction" ? runtime.readGate?.latest.get(classification.cid)?.id : null;
          const perform = (reason = "native") => {
            runtime.#event("http.request", { method: String(meta.method || "GET").toUpperCase(), kind: classification.kind, cid: classification.cid, reason });
            const onLoad = () => {
              let raw = null;
              if (classification.kind === "message") {
                try {
                  raw = xhr.responseType === "json" ? xhr.response : JSON.parse(xhr.responseText || "null");
                } catch {
                }
              }
              runtime.#finish(classification, xhr.status >= 200 && xhr.status < 300, raw, boundary);
              runtime.#event("http.response", { status: xhr.status, kind: classification.kind, cid: classification.cid });
              xhr.removeEventListener?.("load", onLoad);
            };
            xhr.addEventListener?.("load", onLoad);
            return runtime.httpNatives.send.call(xhr, body);
          };
          if (runtime.readEnabled && classification.kind === "read") {
            void runtime.readGate.interceptRead({
              cid: classification.cid,
              body,
              perform,
              cancel: () => runtime.httpNatives.abort?.call(xhr)
            }).catch(() => {
            });
            return void 0;
          }
          return perform();
        };
      }
    }
    #finish(classification, ok, raw, boundary) {
      if (!ok || !this.readGate) return;
      if (classification.kind === "message") {
        const message = raw?.message || raw?.event?.message;
        if (message?.id) this.readGate.confirmReply(classification.cid, message);
      }
      if (classification.kind === "reaction") this.readGate.confirmReaction(classification.cid, boundary);
      if (classification.kind === "read") this.readGate.confirmServerRead(classification.cid);
    }
    #restoreHTTP() {
      if (!this.httpNatives) return;
      const { fetch, XHR, open, send, abort } = this.httpNatives;
      if (fetch) this.window.fetch = fetch;
      if (XHR?.prototype) {
        if (open) XHR.prototype.open = open;
        if (send) XHR.prototype.send = send;
        if (abort) XHR.prototype.abort = abort;
      }
      this.httpNatives = null;
      this.xhrMeta = /* @__PURE__ */ new WeakMap();
    }
    #installRealtime() {
      if (this.realtimeNatives) return;
      const NativeWebSocket = this.window.WebSocket;
      const NativeEventSource = this.window.EventSource;
      this.realtimeNatives = { WebSocket: NativeWebSocket, EventSource: NativeEventSource };
      const runtime = this;
      if (typeof NativeWebSocket === "function") {
        let DiagnosticWebSocket = function(url, protocols) {
          const socket = protocols === void 0 ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
          socket.addEventListener?.("open", () => runtime.#event("websocket.connect", {}));
          socket.addEventListener?.("close", (event) => runtime.#event("websocket.disconnect", { code: event.code }));
          socket.addEventListener?.("message", () => runtime.#event("websocket.message", {}));
          return socket;
        };
        DiagnosticWebSocket.prototype = NativeWebSocket.prototype;
        Object.setPrototypeOf(DiagnosticWebSocket, NativeWebSocket);
        for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
          if (key in NativeWebSocket) Object.defineProperty(DiagnosticWebSocket, key, { value: NativeWebSocket[key] });
        }
        this.window.WebSocket = DiagnosticWebSocket;
      }
      if (typeof NativeEventSource === "function") {
        let DiagnosticEventSource = function(url, options) {
          const source = new NativeEventSource(url, options);
          source.addEventListener?.("open", () => runtime.#event("sse.connect", {}));
          source.addEventListener?.("error", () => runtime.#event("sse.error", {}));
          return source;
        };
        DiagnosticEventSource.prototype = NativeEventSource.prototype;
        Object.setPrototypeOf(DiagnosticEventSource, NativeEventSource);
        this.window.EventSource = DiagnosticEventSource;
      }
    }
    #restoreRealtime() {
      if (!this.realtimeNatives) return;
      if (this.realtimeNatives.WebSocket) this.window.WebSocket = this.realtimeNatives.WebSocket;
      if (this.realtimeNatives.EventSource) this.window.EventSource = this.realtimeNatives.EventSource;
      this.realtimeNatives = null;
    }
    #event(type, data) {
      if (this.diagnosticsEnabled) this.onDiagnosticEvent({ type, at: (/* @__PURE__ */ new Date()).toISOString(), ...data });
    }
    dispose() {
      this.readEnabled = false;
      this.diagnosticsEnabled = false;
      this.#restoreRealtime();
      this.#restoreHTTP();
      this.readGate?.cancelAll("network-hooks-disposed");
    }
  };

  // src/chat/diagnostics.js
  var ChatDiagnostics = class {
    constructor({ networkHooks, maximumEvents = 1e3 } = {}) {
      this.networkHooks = networkHooks;
      this.maximumEvents = maximumEvents;
      this.active = false;
      this.startedAt = null;
      this.events = [];
      this.dropped = 0;
    }
    record(event) {
      if (!this.active) return;
      if (this.events.length >= this.maximumEvents) {
        this.events.shift();
        this.dropped += 1;
      }
      this.events.push(event);
    }
    start() {
      if (this.active) return false;
      this.active = true;
      this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.events = [];
      this.dropped = 0;
      this.networkHooks.configureDiagnostics(true);
      return true;
    }
    stop() {
      if (!this.active) return false;
      this.active = false;
      this.networkHooks.configureDiagnostics(false);
      return true;
    }
    snapshot() {
      return {
        schema: "vgen-nya.chat-diagnostics",
        version: 1,
        active: this.active,
        startedAt: this.startedAt,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        dropped: this.dropped,
        privacy: { headers: false, bodies: false, tokens: false, cookies: false },
        events: this.events.slice()
      };
    }
    dispose() {
      this.stop();
      this.events = [];
    }
  };

  // src/presets/native-text-target.js
  function reactHandler(element2, name) {
    let node = element2;
    for (let nodeDepth = 0; node && nodeDepth < 6; nodeDepth += 1, node = node.parentElement) {
      const propsKey = Object.getOwnPropertyNames(node).find((key) => key.startsWith("__reactProps$"));
      const handler = propsKey ? node[propsKey]?.[name] : null;
      if (typeof handler === "function") return handler;
    }
    return null;
  }
  function nativeValueSetter(element2) {
    let prototype = element2;
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (typeof descriptor?.set === "function") return descriptor.set;
      prototype = Object.getPrototypeOf(prototype);
    }
    return null;
  }
  var NativeTextTarget = class {
    constructor(element2) {
      if (!element2) throw new TypeError("Native text target requires an element");
      this.element = element2;
    }
    read() {
      return typeof this.element.value === "string" ? this.element.value : String(this.element.textContent || "");
    }
    async fillText(text, { replace = false } = {}) {
      const value = String(text ?? "");
      const current = this.read();
      if (current && current !== value && !replace) return { status: "requires-confirmation", current };
      const handler = reactHandler(this.element, "onChange") || reactHandler(this.element, "onInput");
      if ("value" in this.element) {
        const setter = nativeValueSetter(this.element);
        if (setter) setter.call(this.element, value);
        else this.element.value = value;
      } else this.element.textContent = value;
      const view = this.element.ownerDocument?.defaultView || globalThis;
      const EventClass = view.Event || globalThis.Event;
      if (handler) await handler({ target: this.element, currentTarget: this.element, type: "change" });
      else this.element.dispatchEvent?.(new EventClass("input", { bubbles: true }));
      return { status: "filled", value };
    }
  };

  // src/chat/stream-chat-adapter.js
  var CHAT_SESSION_SELECTOR = ".str-chat__channel";
  var MESSAGES_SURFACE_SELECTOR = ".str-chat__channel-list, .str-chat__channel";
  var CHAT_PORTAL_SELECTOR = '.ReactModalPortal, [data-radix-portal], [data-portal], [class*="ChatLauncher__OuterContainer"], [class*="ChatModal__Container"]';
  var MESSAGE_SELECTOR = ".str-chat__message, .str-chat__message-simple";
  var PREVIEW_SELECTOR = '.str-chat__channel-preview, [data-testid*="channel-preview"], [class*="ChatChannelListPreview"]';
  var COMPOSER_SELECTOR = 'textarea.str-chat__textarea__textarea, textarea.str-chat__message-textarea, .str-chat__message-textarea textarea, .str-chat__message-textarea [contenteditable="true"], textarea[data-testid="message-input"], [contenteditable="true"][data-testid*="message-input"], [class*="MessageInput"] textarea, [class*="MessageInput"] [contenteditable="true"]';
  function ownReactValue2(element2, prefix) {
    const key = Object.getOwnPropertyNames(element2 || {}).find((name) => name.startsWith(prefix));
    return key ? element2[key] : null;
  }
  function reactValue(element2, wanted) {
    let node = element2;
    for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1, node = node.parentElement) {
      let fiber = ownReactValue2(node, "__reactFiber$") || ownReactValue2(node, "__reactInternalInstance$");
      const direct = ownReactValue2(node, "__reactProps$");
      if (direct?.[wanted] !== void 0) return direct[wanted];
      for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
        for (const candidate of fiber.alternate ? [fiber, fiber.alternate] : [fiber]) {
          const value = candidate.memoizedProps?.[wanted] ?? candidate.pendingProps?.[wanted];
          if (value !== void 0) return value;
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
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : null;
  }
  function readStatus(channel, message) {
    const client = channel?.getClient?.() || channel?._client || channel?.client;
    const selfId = client?.userID || client?.user?.id;
    const senderId = message?.user?.id || message?.user_id;
    const createdAt = messageTime(message);
    if (!selfId || !senderId || createdAt === null) return { direction: "unknown", status: "unknown" };
    const reads = Object.values(channel?.state?.read || {});
    const reached = (entry) => {
      if (entry?.last_read_message_id === message.id) return true;
      const lastRead = Date.parse(entry?.last_read || entry?.last_read_at || "");
      return Number.isFinite(lastRead) && lastRead >= createdAt;
    };
    if (senderId !== selfId) {
      const own = reads.find((entry) => (entry.user?.id || entry.user_id) === selfId);
      return { direction: "incoming", status: reached(own) ? "read" : "unread" };
    }
    const seen = reads.some((entry) => (entry.user?.id || entry.user_id) !== selfId && reached(entry));
    return { direction: "outgoing", status: seen ? "read" : "unread" };
  }
  function messageFromElement(element2, channel) {
    let message = reactValue(element2, "message");
    if (message?.id) return message;
    const id = element2.getAttribute?.("data-message-id") || element2.id;
    if (id) message = channel?.state?.messages?.find?.((item) => item.id === id);
    return message?.id ? message : null;
  }
  function memberIds(channel) {
    const members = channel?.state?.members || channel?.data?.members || {};
    return Array.isArray(members) ? members.map((item) => item.user?.id || item.user_id || item.id).filter(Boolean) : Object.keys(members);
  }
  function findChatTrigger(documentObject) {
    const icons = documentObject.querySelectorAll?.('svg.chatIcon, [class*="chatIcon"]') || [];
    for (const icon of icons) {
      const button = icon.closest?.('button, [role="button"]');
      if (button) return button;
    }
    return null;
  }
  function jumpButtons(surface) {
    const roots = surface?.querySelectorAll?.('[class*="JumpToPresent"]') || [];
    return [...new Set([...roots].map((root) => root.matches?.("button") ? root : root.closest?.("button") || root.querySelector?.("button")).filter(Boolean))];
  }
  function surfaceScore(node) {
    if (!node || node.isConnected === false || node.hidden === true || node.getAttribute?.("aria-hidden") === "true") return -1;
    const view = node.ownerDocument?.defaultView;
    const style = view?.getComputedStyle?.(node);
    if (style?.display === "none" || style?.visibility === "hidden") return -1;
    const previews = node.querySelectorAll?.(PREVIEW_SELECTOR)?.length || 0;
    const active = node.matches?.(CHAT_SESSION_SELECTOR) ? 1 : 0;
    return previews * 100 + active + 1;
  }
  function findMessagesSurface(root) {
    const candidates = [];
    if (root?.matches?.(MESSAGES_SURFACE_SELECTOR)) candidates.push(root);
    for (const node of root?.querySelectorAll?.(MESSAGES_SURFACE_SELECTOR) || []) candidates.push(node);
    return [...new Set(candidates)].reduce((best, node) => surfaceScore(node) > surfaceScore(best) ? node : best, null);
  }
  function waitForOverlay(documentObject, MutationObserverClass, timeout = 8e3) {
    const existing = findMessagesSurface(documentObject);
    if (existing) return Promise.resolve(existing);
    if (!MutationObserverClass || !documentObject.body) return Promise.reject(new Error("messages-overlay-unavailable"));
    return new Promise((resolve, reject) => {
      const probes = /* @__PURE__ */ new Map();
      const releaseProbes = () => {
        for (const observer2 of probes.values()) observer2.disconnect();
        probes.clear();
      };
      const probe = (root) => {
        if (!root?.querySelector || probes.has(root)) return;
        const likelyPortal = root.matches?.(CHAT_PORTAL_SELECTOR) || root.querySelector?.(CHAT_PORTAL_SELECTOR);
        if (!likelyPortal) return;
        const local = new MutationObserverClass(() => {
          const overlay2 = findMessagesSurface(root);
          if (overlay2) finish(resolve, overlay2);
        });
        local.observe(root, { childList: true, subtree: true });
        probes.set(root, local);
      };
      const observer = new MutationObserverClass((records) => {
        const overlay2 = findMessagesSurface(documentObject);
        if (overlay2) finish(resolve, overlay2);
        else for (const record of records || []) for (const node of record.addedNodes || []) probe(node);
      });
      const timer = globalThis.setTimeout(() => finish(reject, new Error("messages-overlay-timeout")), timeout);
      const finish = (callback, value) => {
        observer.disconnect();
        releaseProbes();
        globalThis.clearTimeout(timer);
        callback(value);
      };
      observer.observe(documentObject.body, { childList: true });
      for (const root of documentObject.querySelectorAll?.(CHAT_PORTAL_SELECTOR) || []) probe(root);
    });
  }
  var StreamChatAdapter = class {
    static overlaySelector = CHAT_SESSION_SELECTOR;
    constructor(surface, { documentObject = surface?.ownerDocument || globalThis.document, MutationObserverClass = globalThis.MutationObserver } = {}) {
      this.surface = surface;
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
    }
    findChannel() {
      const roots = [this.surface, ...this.surface?.querySelectorAll?.('.str-chat__channel, .str-chat, [class*="channelContainer"]') || []];
      for (const root of roots.slice(0, 60)) {
        const channel = reactValue(root, "channel");
        if (channel && channelCid(channel)) return channel;
      }
      return null;
    }
    conversationId() {
      return channelCid(this.findChannel());
    }
    findComposer() {
      return this.surface?.querySelector?.(COMPOSER_SELECTOR) || null;
    }
    readComposer() {
      const composer = this.findComposer();
      return composer ? new NativeTextTarget(composer).read() : "";
    }
    fillComposer(payload, options) {
      const composer = this.findComposer();
      if (!composer) throw new Error("VGen Chat composer is not ready");
      return new NativeTextTarget(composer).fillText(payload, options);
    }
    refresh({ settings, readGate, onManualRead } = {}) {
      const channel = this.findChannel();
      const cid = channelCid(channel);
      if (!channel || !cid) return { cid: null, messages: 0 };
      const messages = this.surface.querySelectorAll?.(MESSAGE_SELECTOR) || [];
      let decorated = 0;
      for (const element2 of [...messages].slice(-500)) {
        const message = messageFromElement(element2, channel);
        if (!message) continue;
        readGate?.observeLatest(cid, message);
        this.#decorateMessage(element2, channel, message, settings, () => onManualRead?.(cid, channel));
        decorated += 1;
      }
      this.#decorateReactions(settings);
      this.#markLatestActions();
      return { cid, messages: decorated };
    }
    #decorateMessage(element2, channel, message, settings, manualRead) {
      const bubble = element2.querySelector?.(".str-chat__message-bubble") || element2;
      const group = bubble.closest?.(".str-chat__message-bubble-group") || bubble.parentElement || element2;
      const state = readStatus(channel, message);
      const signature = JSON.stringify([message.id, message.created_at, state.direction, state.status, settings.keepUnread, settings.showSeen, settings.showTimestamps, settings.showStatusBar]);
      if (element2.dataset.vgenNyaChatSignature === signature) return;
      element2.dataset.vgenNyaChatSignature = signature;
      let row = group.querySelector?.(":scope > .vgen-nya-chat-meta");
      if (!row) {
        row = this.documentObject.createElement("div");
        row.className = "vgen-nya-chat-meta notranslate";
        row.dataset.vgenNyaUi = "chat-meta";
        row.translate = false;
        const seen2 = this.documentObject.createElement("span");
        seen2.className = "vgen-nya-chat-seen";
        const time2 = this.documentObject.createElement("time");
        time2.className = "vgen-nya-chat-time";
        row.append(seen2, time2);
        group.append(row);
      }
      const seen = row.querySelector(".vgen-nya-chat-seen");
      if (seen) seen.textContent = settings.showSeen && state.direction === "outgoing" && state.status === "read" ? "[seen]" : "";
      const time = row.querySelector("time");
      const rawTime = message.created_at || message.createdAt;
      if (time) {
        time.textContent = settings.showTimestamps && rawTime ? new Date(rawTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        if (rawTime) time.setAttribute("datetime", rawTime);
      }
      const hasStatus = state.status === "unread" || state.status === "read";
      let bar = bubble.querySelector?.(":scope > .vgen-nya-state-bar");
      if (settings.showStatusBar !== false && hasStatus && !bar) {
        bar = this.documentObject.createElement("span");
        bar.className = "vgen-nya-state-bar notranslate";
        bar.dataset.vgenNyaUi = "chat-status-bar";
        bar.translate = false;
        bar.setAttribute("aria-hidden", "true");
        bubble.append(bar);
      }
      if (bar && settings.showStatusBar !== false && hasStatus) {
        bar.dataset.status = state.status;
        bar.dataset.direction = state.direction;
      } else bar?.remove();
      let marker = bubble.querySelector?.(":scope > .vgen-nya-read-marker");
      const canManualRead = settings.keepUnread && state.direction === "incoming" && state.status === "unread";
      if (hasStatus && !marker) {
        marker = this.documentObject.createElement("button");
        marker.type = "button";
        marker.className = "vgen-nya-read-marker notranslate";
        marker.dataset.vgenNyaUi = "read-marker";
        marker.addEventListener("pointerdown", (event) => event.stopPropagation());
        marker.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (marker.dataset.manual === "true") manualRead();
        });
        bubble.append(marker);
      }
      if (marker && hasStatus) {
        marker.dataset.status = state.status;
        marker.dataset.direction = state.direction;
        marker.dataset.manual = String(canManualRead);
        marker.textContent = state.status === "unread" ? "●" : "✓";
        marker.disabled = !canManualRead;
        marker.title = canManualRead ? "未读 · 点击标记为已读" : state.direction === "outgoing" ? state.status === "read" ? "对方已读" : "对方未读" : state.status === "read" ? "我已读" : "未读";
      } else marker?.remove();
    }
    #decorateReactions(settings) {
      for (const reactions of this.surface.querySelectorAll?.('[data-testid="reaction-list"], .str-chat__message-reactions') || []) {
        if (settings.compactReactions) reactions.dataset.vgenNyaCompactReactions = "true";
        else delete reactions.dataset.vgenNyaCompactReactions;
      }
    }
    #markLatestActions() {
      for (const button of jumpButtons(this.surface)) button.dataset.vgenNyaNativeLatest = "true";
    }
    jumpToPresent() {
      const button = jumpButtons(this.surface)[0];
      if (!button) return false;
      const handler = reactValue(button, "onClick");
      if (typeof handler === "function") handler({ currentTarget: button, target: button });
      else button.click?.();
      return true;
    }
    cleanup() {
      for (const selector of [".vgen-nya-chat-meta", ".vgen-nya-read-marker", ".vgen-nya-state-bar"]) {
        for (const node of this.surface?.querySelectorAll?.(selector) || []) node.remove();
      }
      for (const node of this.surface?.querySelectorAll?.("[data-vgen-nya-compact-reactions]") || []) delete node.dataset.vgenNyaCompactReactions;
    }
    static async openUser(target, { documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver } = {}) {
      const userID = String(target?.userID || target?.userId || "").trim();
      if (!userID) throw new Error(target?.username ? "user-id-mapping-unavailable" : "invalid-user");
      let overlay2 = findMessagesSurface(documentObject);
      if (!overlay2) {
        const trigger = findChatTrigger(documentObject);
        if (!trigger) throw new Error("native-messages-trigger-unavailable");
        trigger.click();
        overlay2 = await waitForOverlay(documentObject, MutationObserverClass);
      }
      const previews = overlay2.querySelectorAll?.(PREVIEW_SELECTOR) || [];
      for (const preview of previews) {
        const channel2 = reactValue(preview, "channel");
        if (!memberIds(channel2).includes(userID)) continue;
        const nativeTarget = preview.matches?.('[class*="ChatChannelListPreview__Container"]') ? preview : preview.querySelector?.('[class*="ChatChannelListPreview__Container"]');
        const select2 = reactValue(preview, "setActiveChannel") || reactValue(preview, "onSelect");
        if (nativeTarget) nativeTarget.click?.();
        else if (typeof select2 === "function") await select2(channel2);
        else preview.click?.();
        return { opened: true, cid: channelCid(channel2), existing: true };
      }
      const root = overlay2.querySelector?.(".str-chat") || overlay2;
      const activeChannel = reactValue(root, "channel");
      if (memberIds(activeChannel).includes(userID)) {
        return { opened: true, cid: channelCid(activeChannel), existing: true };
      }
      const client = reactValue(root, "client") || activeChannel?.getClient?.();
      if (typeof client?.queryChannels !== "function") throw new Error("stream-client-unavailable");
      const selfId = String(client.userID || client.user?.id || "").trim();
      const members = selfId ? { $eq: [selfId, userID] } : { $in: [userID] };
      const channels = await client.queryChannels({ type: "messaging", members }, [{ last_message_at: -1 }], { state: true, watch: true });
      const channel = channels.find((item) => memberIds(item).includes(userID));
      if (!channel) throw new Error("existing-conversation-unavailable");
      const select = reactValue(root, "setActiveChannel") || reactValue(root, "onSelect");
      if (typeof select !== "function") throw new Error("native-channel-selector-unavailable");
      await select(channel);
      return { opened: true, cid: channelCid(channel), existing: true };
    }
  };

  // src/chat/quick-reply.js
  var CONTEXT = TEXT_PRESET_CONTEXTS.chatQuickReply;
  function make4(documentObject, tag, attributes = {}, text = "") {
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
  var QuickReplyController = class {
    constructor({ engine, adapter } = {}) {
      this.engine = engine;
      this.adapter = adapter;
      this.root = null;
      this.composer = null;
      this.onInput = () => {
        this.engine.clearSelection(CONTEXT);
        this.render();
      };
      this.onClick = (event) => this.#click(event);
      this.unsubscribe = null;
    }
    refresh() {
      if (!this.engine) return false;
      const composer = this.adapter.findComposer?.();
      if (!composer) {
        this.cleanup();
        return false;
      }
      if (composer !== this.composer) {
        this.cleanup();
        this.composer = composer;
        const documentObject = composer.ownerDocument;
        this.root = make4(documentObject, "div", {
          className: "vgen-nya-quick-replies notranslate",
          dataset: { vgenNyaUi: "quick-replies" },
          translate: false
        });
        this.root.addEventListener("click", this.onClick);
        this.composer.addEventListener("input", this.onInput);
        this.unsubscribe = this.engine.subscribe(({ context }) => {
          if (context === CONTEXT) this.render();
        });
        const anchor = composer.closest?.('.str-chat__message-input, [class*="MessageInput"]') || composer.parentElement;
        (anchor || composer).append(this.root);
      }
      this.render();
      return true;
    }
    render() {
      if (!this.root) return;
      const documentObject = this.root.ownerDocument;
      const selected = this.engine.selectedId(CONTEXT);
      const items = this.engine.list(CONTEXT);
      this.root.replaceChildren();
      if (!items.length) {
        this.root.append(make4(documentObject, "span", { className: "vgen-nya-preset-empty" }, "暂无快捷回复"));
        return;
      }
      for (const preset of items) {
        this.root.append(make4(documentObject, "button", {
          type: "button",
          className: "vgen-nya-preset-chip",
          dataset: { presetId: preset.id },
          title: this.engine.preview(CONTEXT, preset.id, 180),
          "aria-pressed": String(selected === String(preset.id))
        }, preset.name));
      }
    }
    ownsMutation(record) {
      return Boolean(this.root && (record.target === this.root || this.root.contains?.(record.target)));
    }
    async #click(event) {
      const button = event.target?.closest?.("button[data-preset-id]");
      if (!button || !this.root?.contains(button)) return;
      let result = await this.engine.select(CONTEXT, button.dataset.presetId, this.adapter);
      if (result.status === "requires-confirmation") {
        const confirmed = this.root.ownerDocument.defaultView?.confirm?.("Composer 已有内容。确认替换为该快捷回复吗？") === true;
        if (!confirmed) return;
        result = await this.engine.select(CONTEXT, button.dataset.presetId, this.adapter, { replace: true });
      }
      if (result.status === "filled") this.render();
    }
    cleanup() {
      this.composer?.removeEventListener("input", this.onInput);
      this.root?.removeEventListener("click", this.onClick);
      this.root?.remove();
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.root = null;
      this.composer = null;
    }
  };

  // src/chat/chat-history-adapter.js
  function normalizeChatMessage(message, cid) {
    if (!message || typeof message !== "object") return null;
    const id = message.id || message.messageId || message.message_id;
    if (!id) return null;
    const createdAt = message.created_at || message.createdAt || message.created || null;
    return {
      messageId: String(id),
      cid: cid || null,
      authorId: message.user?.id || message.user_id || message.senderId || null,
      authorName: message.user?.name || message.user?.username || null,
      text: typeof message.text === "string" ? message.text : typeof message.body === "string" ? message.body : "",
      createdAt: createdAt == null ? null : createdAt instanceof Date ? createdAt.toISOString() : String(createdAt)
    };
  }
  function channelCid2(channel) {
    return channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null);
  }
  var ChatHistoryAdapter = class {
    constructor({ channel, client, fetchImpl = globalThis.fetch } = {}) {
      this.channel = channel || null;
      this.client = client || channel?.getClient?.() || channel?.client || channel?._client || null;
      this.fetchImpl = fetchImpl;
    }
    cid() {
      return channelCid2(this.channel);
    }
    // Already-loaded messages from the SDK channel state. Always read-only.
    loadedMessages() {
      const list = this.channel?.state?.messages || this.channel?.state?.messagePagination?.messages || [];
      return list.map((message) => normalizeChatMessage(message, this.cid())).filter(Boolean);
    }
    supportsServerSearch() {
      return typeof this.channel?.search === "function" || typeof this.client?.search === "function";
    }
    // Server-side search when the SDK exposes it. Returns normalized messages or
    // null when the path is unavailable so the caller can fall back to pagination.
    async searchServer(query, { signal } = {}) {
      const cid = this.cid();
      try {
        if (typeof this.channel?.search === "function") {
          const response = await this.channel.search({ query, text: query }, { limit: 50 }, { signal });
          return this.#messagesFromSearchResponse(response, cid);
        }
        if (typeof this.client?.search === "function") {
          const response = await this.client.search({ query }, { cid }, { limit: 50 }, { signal });
          return this.#messagesFromSearchResponse(response, cid);
        }
      } catch {
        return null;
      }
      return null;
    }
    #messagesFromSearchResponse(response, cid) {
      const results = response?.results || [];
      const messages = results.map((item) => item?.message || item).filter(Boolean);
      const normalized = messages.map((message) => normalizeChatMessage(message, cid)).filter(Boolean);
      return normalized.length ? normalized : null;
    }
    // Fetches one page of history. The SDK returns pages in ascending (oldest
    // first) order; `before` is the id of the oldest message seen so far and is
    // passed as id_lt. Returns { available, messages, hasMore }.
    async fetchHistoryPage({ before = null, limit = 100, signal } = {}) {
      const channel = this.channel;
      if (!channel) return { available: false, messages: [], hasMore: false };
      if (typeof channel.query !== "function") return { available: false, messages: [], hasMore: false };
      try {
        const messageQuery = before ? { limit, id_lt: before } : { limit };
        const response = await channel.query({ messages: messageQuery }, { signal });
        const list = Array.isArray(response?.messages) ? response.messages : Array.isArray(response) ? response : null;
        if (!Array.isArray(list)) return { available: false, messages: [], hasMore: false };
        const messages = list.map((message) => normalizeChatMessage(message, this.cid())).filter(Boolean);
        const hasMore = messages.length >= limit;
        return { available: true, messages, hasMore };
      } catch {
        return { available: false, messages: [], hasMore: false };
      }
    }
    // Loads the region around a single message id into the channel state so a
    // not-yet-rendered result can be resolved. Returns whether the target id is
    // now present in the SDK state (it may still not be mounted in the DOM, which
    // is the caller's responsibility to report honestly).
    async loadAround(messageId, { limit = 50, signal } = {}) {
      const channel = this.channel;
      const target = String(messageId || "");
      if (!channel || !target || typeof channel.query !== "function") return { loaded: false };
      try {
        await channel.query({ messages: { limit, id_around: target } }, { signal });
        const present = (channel.state?.messages || []).some((message) => String(message?.id) === target);
        return { loaded: present };
      } catch {
        return { loaded: false };
      }
    }
  };

  // src/chat/chat-search-engine.js
  var SEARCH_STATES = Object.freeze({
    idle: "idle",
    searching: "searching",
    results: "results",
    empty: "empty",
    error: "error"
  });
  var SEARCH_SOURCES = Object.freeze({
    server: "server",
    history: "history",
    loaded: "loaded"
  });
  function normalizeSearchText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function matchesQuery(text, query) {
    const needle = normalizeSearchText(query).toLowerCase();
    if (!needle) return false;
    return normalizeSearchText(text).toLowerCase().includes(needle);
  }
  function makeSnippet(text, maximum = 160) {
    const plain = normalizeSearchText(text);
    return plain.length > maximum ? `${plain.slice(0, maximum)}…` : plain;
  }
  function sortNewestFirst(messages) {
    return [...messages].sort((left, right) => {
      const a = Number(Date.parse(left?.createdAt || "")) || 0;
      const b = Number(Date.parse(right?.createdAt || "")) || 0;
      return b - a;
    });
  }
  var DEFAULT_MAX_CHANNELS = 5;
  var DEFAULT_MAX_MESSAGES_PER_CHANNEL = 500;
  var ChatSearchCache = class {
    constructor({ maxChannels = DEFAULT_MAX_CHANNELS, maxMessages = DEFAULT_MAX_MESSAGES_PER_CHANNEL } = {}) {
      this.maxChannels = maxChannels;
      this.maxMessages = maxMessages;
      this.channels = /* @__PURE__ */ new Map();
    }
    get(cid) {
      const entry = this.channels.get(cid);
      if (!entry) return null;
      this.channels.delete(cid);
      this.channels.set(cid, entry);
      return entry;
    }
    // Merges a fetched page into the channel entry and returns the entry. The SDK
    // returns each page in ascending (oldest-first) order, so the first message of
    // a page is its oldest and becomes the next id_lt cursor.
    record(cid, messages, { complete = false } = {}) {
      const entry = this.get(cid) || { messages: [], ids: /* @__PURE__ */ new Set(), complete: false, oldestId: null };
      let firstNewId = null;
      for (const message of messages) {
        if (!message?.messageId || entry.ids.has(message.messageId)) continue;
        entry.ids.add(message.messageId);
        entry.messages.push(message);
        if (firstNewId === null) firstNewId = message.messageId;
      }
      if (firstNewId !== null) entry.oldestId = firstNewId;
      entry.complete = Boolean(entry.complete || complete);
      if (entry.messages.length > this.maxMessages) {
        const overflow = entry.messages.length - this.maxMessages;
        const dropped = entry.messages.splice(0, overflow);
        for (const message of dropped) entry.ids.delete(message.messageId);
        entry.complete = false;
      }
      this.channels.delete(cid);
      this.channels.set(cid, entry);
      while (this.channels.size > this.maxChannels) {
        const oldestCid = this.channels.keys().next().value;
        this.channels.delete(oldestCid);
      }
      return entry;
    }
    oldestId(entry) {
      return entry?.oldestId || null;
    }
    clear() {
      this.channels.clear();
    }
    get size() {
      return this.channels.size;
    }
  };
  var ChatSearchEngine = class {
    constructor({ cache = new ChatSearchCache(), maxPagesPerSearch = 5, pageSize = 100 } = {}) {
      this.cache = cache;
      this.maxPagesPerSearch = maxPagesPerSearch;
      this.pageSize = pageSize;
      this.operation = 0;
      this.listeners = /* @__PURE__ */ new Set();
      this.state = SEARCH_STATES.idle;
      this.results = [];
      this.source = null;
      this.partial = false;
      this.error = null;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    get snapshot() {
      return { state: this.state, results: this.results, source: this.source, partial: this.partial, error: this.error };
    }
    cancel(reason = "superseded") {
      this.operation += 1;
    }
    async search({ query, history, cid }) {
      const operation = ++this.operation;
      const normalized = normalizeSearchText(query);
      if (!normalized) {
        this.#set({ state: SEARCH_STATES.idle, results: [], source: null, partial: false, error: null });
        return this.snapshot;
      }
      this.#set({ state: SEARCH_STATES.searching, results: [], source: null, partial: false, error: null });
      try {
        if (history?.supportsServerSearch?.()) {
          const server = await history.searchServer(normalized);
          if (operation !== this.operation) return this.snapshot;
          if (server && server.length) {
            this.#set({ state: SEARCH_STATES.results, results: sortNewestFirst(server), source: SEARCH_SOURCES.server, partial: false, error: null });
            return this.snapshot;
          }
        }
        const result = await this.#searchHistory(normalized, history, cid, operation);
        if (operation !== this.operation) return this.snapshot;
        this.#set(result);
        return this.snapshot;
      } catch (error) {
        if (operation !== this.operation) return this.snapshot;
        this.#set({ state: SEARCH_STATES.error, results: [], source: null, partial: false, error: String(error?.message || error) });
        return this.snapshot;
      }
    }
    async #searchHistory(normalized, history, cid, operation) {
      let entry = this.cache.get(cid) || this.cache.record(cid, [], { complete: false });
      let pagesFetched = 0;
      let available = true;
      while (!entry.complete && pagesFetched < this.maxPagesPerSearch && available) {
        const before = this.cache.oldestId(entry);
        const page = await history.fetchHistoryPage({ before, limit: this.pageSize });
        if (operation !== this.operation) return this.snapshot;
        if (!page?.available) {
          available = false;
          break;
        }
        const messages2 = page.messages || [];
        if (!messages2.length) {
          entry = this.cache.record(cid, [], { complete: true });
          break;
        }
        const complete = messages2.length < this.pageSize;
        entry = this.cache.record(cid, messages2, { complete });
        pagesFetched += 1;
      }
      const { messages } = entry;
      const matches = sortNewestFirst(messages.filter((message) => matchesQuery(message.text, normalized)));
      const partial = !entry.complete && available === true;
      const source = available ? SEARCH_SOURCES.history : SEARCH_SOURCES.loaded;
      if (!available) {
        const loaded = history.loadedMessages?.() || [];
        const loadedMatches = sortNewestFirst(loaded.filter((message) => matchesQuery(message.text, normalized)));
        return {
          state: loadedMatches.length ? SEARCH_STATES.results : SEARCH_STATES.empty,
          results: loadedMatches,
          source: SEARCH_SOURCES.loaded,
          partial: true,
          error: null
        };
      }
      return {
        state: matches.length ? SEARCH_STATES.results : SEARCH_STATES.empty,
        results: matches,
        source,
        partial,
        error: null
      };
    }
    #set({ state, results, source, partial, error }) {
      this.state = state;
      this.results = results;
      this.source = source;
      this.partial = partial;
      this.error = error;
      for (const listener of this.listeners) listener(this.snapshot);
    }
  };

  // src/chat/chat-search-locator.js
  var MESSAGE_ID_SELECTOR = "[data-message-id]";
  var HIGHLIGHT_CLASS = "vgen-nya-search-highlight";
  var HIGHLIGHT_MS = 2e3;
  var ChatSearchLocator = class {
    constructor({ surface, documentObject = surface?.ownerDocument || globalThis.document } = {}) {
      this.surface = surface;
      this.documentObject = documentObject;
      this.highlightTimers = /* @__PURE__ */ new Set();
    }
    findElement(messageId) {
      if (!this.surface?.querySelectorAll || !messageId) return null;
      const wanted = String(messageId);
      const candidates = this.surface.querySelectorAll(MESSAGE_ID_SELECTOR) || [];
      for (const element2 of candidates) {
        if (element2.dataset?.messageId === wanted || element2.getAttribute?.("data-message-id") === wanted || element2.id === wanted) return element2;
      }
      return null;
    }
    scrollTo(element2) {
      element2?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    highlight(element2) {
      if (!element2) return;
      element2.classList?.add?.(HIGHLIGHT_CLASS);
      const timer = this.documentObject?.defaultView?.setTimeout?.(() => element2.classList?.remove?.(HIGHLIGHT_CLASS), HIGHLIGHT_MS) || globalThis.setTimeout(() => element2.classList?.remove?.(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
      this.highlightTimers.add(timer);
    }
    // Locate a message that may not be in the DOM yet. When it is not rendered,
    // `load` (e.g. channel.query with id_around) loads its region into SDK state
    // and we re-check the DOM. The reverse-infinite-scroll list may still not
    // mount it, so the caller reports that honestly instead of faking a message.
    async locateOrLoad(messageId, { load, signal } = {}) {
      const element2 = this.findElement(messageId);
      if (element2) {
        this.scrollTo(element2);
        this.highlight(element2);
        return { found: true, loads: 0 };
      }
      if (typeof load !== "function") return { found: false, loads: 0 };
      if (signal?.aborted) return { found: false, loads: 0, aborted: true };
      try {
        await load(messageId);
      } catch {
        return { found: false, loads: 0 };
      }
      const loaded = this.findElement(messageId);
      if (loaded) {
        this.scrollTo(loaded);
        this.highlight(loaded);
        return { found: true, loads: 1 };
      }
      return { found: false, loads: 1 };
    }
    clearHighlights() {
      for (const timer of this.highlightTimers) {
        try {
          globalThis.clearTimeout(timer);
        } catch {
        }
      }
      this.highlightTimers.clear();
      for (const node of this.surface?.querySelectorAll?.(`.${HIGHLIGHT_CLASS}`) || []) node.classList?.remove?.(HIGHLIGHT_CLASS);
    }
  };

  // src/chat/chat-search-ui.js
  var CHAT_SEARCH_CSS = `
.vgen-nya-chat-search{margin:0;padding:6px 8px;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent);display:flex;flex-direction:column;gap:6px;font:12px/1.4 system-ui,sans-serif;color:inherit;max-width:100%}
.vgen-nya-chat-search__bar{display:flex;align-items:center;gap:6px}
.vgen-nya-chat-search input{flex:1;min-width:0;padding:5px 8px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;background:Canvas;color:CanvasText;font:inherit}
.vgen-nya-chat-search button{border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;padding:5px 9px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font:inherit;cursor:pointer}
.vgen-nya-chat-search button:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
.vgen-nya-chat-search button:disabled{opacity:.5;cursor:default}
.vgen-nya-chat-search__status{margin:0;opacity:.75}
.vgen-nya-chat-search__status[data-error="true"]{color:#b42318}
.vgen-nya-chat-search__results{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:220px;overflow:auto}
.vgen-nya-chat-search__result{display:block;width:100%;text-align:left;padding:6px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;cursor:pointer}
.vgen-nya-chat-search__result-snippet{display:block;white-space:pre-wrap;overflow-wrap:anywhere}
.vgen-nya-chat-search__result-meta{display:block;margin-top:3px;font-size:11px;opacity:.72}
`;
  function make5(documentObject, tagName, className = "", text = "") {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function mountAtTop(surface, node) {
    if (typeof surface?.prepend === "function") surface.prepend(node);
    else if (typeof surface?.insertBefore === "function" && surface.firstChild) surface.insertBefore(node, surface.firstChild);
    else surface?.append?.(node);
  }
  var ChatSearchController = class {
    constructor({ surface, adapter, documentObject = surface?.ownerDocument || globalThis.document, historyAdapterFactory, locatorFactory, debounceMs = 300 } = {}) {
      this.surface = surface;
      this.adapter = adapter;
      this.documentObject = documentObject;
      this.historyAdapterFactory = historyAdapterFactory || ((channel) => new ChatHistoryAdapter({ channel }));
      this.locatorFactory = locatorFactory || (() => new ChatSearchLocator({ surface, documentObject }));
      this.debounceMs = debounceMs;
      this.engine = new ChatSearchEngine({ cache: new ChatSearchCache() });
      this.locator = this.locatorFactory();
      this.cid = null;
      this.root = null;
      this.input = null;
      this.statusNode = null;
      this.listNode = null;
      this.debounceTimer = null;
      this.mounted = false;
      this.unsubscribe = this.engine.subscribe(() => this.#renderResults());
      this.onInput = () => this.#scheduleSearch();
      this.onKeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault?.();
          this.#runNow();
        }
      };
    }
    mount() {
      if (this.mounted || !this.documentObject?.createElement) return false;
      this.mounted = true;
      this.root = make5(this.documentObject, "div", "vgen-nya-chat-search notranslate");
      this.root.dataset.vgenNyaUi = "chat-search";
      this.root.translate = false;
      this.#build();
      mountAtTop(this.surface, this.root);
      this.refresh();
      return true;
    }
    #build() {
      const documentObject = this.documentObject;
      const bar = make5(documentObject, "div", "vgen-nya-chat-search__bar");
      this.input = make5(documentObject, "input", "");
      this.input.type = "text";
      this.input.placeholder = "搜索当前会话…";
      this.input.setAttribute("aria-label", "搜索聊天历史");
      this.input.addEventListener("input", this.onInput);
      this.input.addEventListener("keydown", this.onKeydown);
      const run = make5(documentObject, "button", "notranslate", "搜索");
      run.type = "button";
      run.translate = false;
      run.dataset.action = "search";
      run.addEventListener("click", () => void this.#runNow());
      bar.append(this.input, run);
      this.statusNode = make5(documentObject, "p", "vgen-nya-chat-search__status notranslate");
      this.statusNode.translate = false;
      this.listNode = make5(documentObject, "ul", "vgen-nya-chat-search__results");
      this.root.append(bar, this.statusNode, this.listNode);
    }
    ownsMutation(record) {
      return Boolean(this.root && (record?.target === this.root || this.root.contains?.(record?.target)));
    }
    refresh() {
      const channel = this.adapter?.findChannel?.();
      const cid = channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null) || null;
      if (cid !== this.cid) {
        this.cid = cid;
        this.engine.cancel("channel-change");
        if (this.input) this.input.value = "";
        this.#renderResults();
      }
    }
    #channel() {
      return this.adapter?.findChannel?.() || null;
    }
    #historyAdapter() {
      return this.historyAdapterFactory(this.#channel());
    }
    #scheduleSearch() {
      if (this.debounceTimer !== null) globalThis.clearTimeout(this.debounceTimer);
      this.debounceTimer = globalThis.setTimeout(() => {
        this.debounceTimer = null;
        void this.#run();
      }, this.debounceMs);
    }
    #runNow() {
      if (this.debounceTimer !== null) {
        globalThis.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      void this.#run();
    }
    async #run() {
      if (!this.input) return;
      const query = this.input.value || "";
      const channel = this.#channel();
      const cid = channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null);
      if (!cid || !channel) {
        this.#setStatus("无法读取当前会话", true);
        return;
      }
      await this.engine.search({ query, history: this.#historyAdapter(), cid });
    }
    async #locate(messageId) {
      if (!messageId) return;
      const history = this.#historyAdapter();
      await this.locator.locateOrLoad(messageId, { load: (id) => history.loadAround(id) });
    }
    #renderResults() {
      const snapshot = this.engine.snapshot;
      if (!this.root) return;
      const documentObject = this.documentObject;
      this.listNode.replaceChildren();
      const resultNodes = [];
      for (const message of snapshot.results) {
        const button = make5(documentObject, "button", "vgen-nya-chat-search__result");
        button.type = "button";
        button.dataset.action = "locate";
        button.dataset.messageId = message.messageId;
        const snippet = make5(documentObject, "span", "vgen-nya-chat-search__result-snippet", makeSnippet(message.text));
        snippet.translate = true;
        const meta = make5(documentObject, "span", "vgen-nya-chat-search__result-meta notranslate", this.#meta(message));
        meta.translate = false;
        button.append(snippet, meta);
        button.addEventListener("click", () => void this.#locate(message.messageId));
        resultNodes.push(button);
      }
      this.listNode.append(...resultNodes);
      if (snapshot.state === SEARCH_STATES.searching) this.#setStatus("搜索中…", false);
      else if (snapshot.state === SEARCH_STATES.error) this.#setStatus(`搜索失败：${snapshot.error || "未知错误"}`, true);
      else if (snapshot.state === SEARCH_STATES.results) this.#setStatus(`${snapshot.results.length} 条结果${snapshot.partial ? " · 仅搜索已获取的部分历史" : ""}${snapshot.source === "loaded" ? " · 仅当前已加载消息" : ""}`, false);
      else if (snapshot.state === SEARCH_STATES.empty) this.#setStatus(snapshot.source === "loaded" ? "无结果（仅当前已加载消息）" : "无结果", false);
      else this.#setStatus("", false);
    }
    #meta(message) {
      const author = message.authorName || message.authorId || "";
      const time = message.createdAt ? new Date(message.createdAt).toLocaleString?.() || message.createdAt : "";
      return [author, time].filter(Boolean).join(" · ");
    }
    #setStatus(text, error) {
      if (!this.statusNode) return;
      this.statusNode.textContent = text;
      this.statusNode.dataset.error = error ? "true" : "false";
    }
    unmount() {
      if (!this.mounted) return false;
      this.mounted = false;
      if (this.debounceTimer !== null) globalThis.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.engine.cancel("session-closed");
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.locator.clearHighlights();
      this.input?.removeEventListener("input", this.onInput);
      this.input?.removeEventListener("keydown", this.onKeydown);
      this.root?.remove();
      this.root = null;
      this.input = null;
      this.statusNode = null;
      this.listNode = null;
      return true;
    }
  };

  // src/chat/chat-assistant.js
  var CHAT_PORTAL_SELECTOR2 = '.ReactModalPortal, [data-radix-portal], [data-portal], [class*="ChatLauncher__OuterContainer"], [class*="ChatModal__Container"]';
  var CHAT_CSS = `
.vgen-nya-chat-meta{display:flex!important;align-items:center;justify-content:space-between;gap:20px;width:100%;padding-top:3px;font:11px/18px system-ui,sans-serif;opacity:.72;user-select:text;pointer-events:auto}
.vgen-nya-chat-time{margin-left:auto;white-space:nowrap}
.str-chat__message-bubble:has(>.vgen-nya-read-marker),.str-chat__message-bubble:has(>.vgen-nya-state-bar){position:relative!important;overflow:visible!important}
.str-chat__message-bubble:has(>.vgen-nya-state-bar){display:flex!important;flex-direction:column!important;height:auto!important}
.vgen-nya-state-bar{position:static!important;display:block!important;flex:0 0 2px!important;width:38px!important;height:2px!important;min-height:2px!important;margin-left:auto!important;border-radius:999px;background:#3bdfbc;opacity:.82;pointer-events:none}
.vgen-nya-state-bar[data-status="unread"]{background:#ff6476}.vgen-nya-state-bar[data-direction="outgoing"]{order:-1;margin-top:1px;margin-bottom:4px}.vgen-nya-state-bar[data-direction="incoming"]{order:2147483647;margin-top:4px;margin-bottom:1px}
.vgen-nya-read-marker{position:absolute!important;right:-8px;z-index:30;width:20px;height:20px;border:0;border-radius:50%;padding:0;background:transparent;color:#3bdfbc;font:bold 16px/20px system-ui;filter:drop-shadow(0 1px 1px #0007)}
.vgen-nya-read-marker[data-direction="outgoing"]{top:-8px}.vgen-nya-read-marker[data-direction="incoming"]{bottom:-8px}.vgen-nya-read-marker[data-status="unread"]{color:#ff6476}.vgen-nya-read-marker[data-manual="true"]{cursor:pointer}.vgen-nya-read-marker[data-manual="true"]:hover,.vgen-nya-read-marker[data-manual="true"]:focus-visible{transform:scale(1.12);outline:2px solid currentColor;outline-offset:1px}
[data-vgen-nya-compact-reactions="true"]{position:static!important;display:flex!important;flex-wrap:wrap!important;gap:3px!important;width:fit-content!important;min-height:0!important;margin:0!important;padding:4px 0 0!important;background:transparent!important;border:0!important;box-shadow:none!important}
[data-vgen-nya-compact-reactions="true"] button[data-reaction-type],[data-vgen-nya-compact-reactions="true"] button[data-testid^="reactions-list-button-"]{min-width:12px!important;height:18px!important;padding:1px 3px!important;border-radius:5px!important;font-size:12px!important}
.vgen-nya-quick-replies,.vgen-nya-order-presets{display:flex;align-items:center;gap:6px;max-width:100%;padding:6px 2px;overflow-x:auto}.vgen-nya-preset-chip{flex:0 0 auto;max-width:220px;padding:5px 9px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 7%,transparent);color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.vgen-nya-preset-chip:hover{background:color-mix(in srgb,currentColor 13%,transparent)}.vgen-nya-preset-chip[aria-pressed="true"]{border-color:#3b82f6;background:#dbeafe;color:#174b8a}.vgen-nya-preset-empty{font:12px/1.4 system-ui,sans-serif;opacity:.62}
${CHAT_SEARCH_CSS}
.vgen-nya-search-highlight{outline:2px solid #f59e0b!important;outline-offset:1px;border-radius:8px}
`;
  var ChatAssistantSession = class {
    constructor({ surface, repository, readGate, adapter, textPresetEngine, MutationObserverClass = globalThis.MutationObserver } = {}) {
      this.surface = surface;
      this.repository = repository;
      this.readGate = readGate;
      this.adapter = adapter;
      this.MutationObserverClass = MutationObserverClass;
      this.observer = null;
      this.cid = null;
      this.mounted = false;
      this.quickReplies = textPresetEngine ? new QuickReplyController({ engine: textPresetEngine, adapter }) : null;
      this.search = new ChatSearchController({ surface, adapter, documentObject: surface?.ownerDocument || globalThis.document });
    }
    mount() {
      if (this.mounted) return false;
      this.mounted = true;
      this.refresh();
      if (this.MutationObserverClass) {
        this.observer = new this.MutationObserverClass((records) => {
          const onlyOwnInsertions = records.length > 0 && records.every((record) => (record.addedNodes?.length || 0) > 0 && [...record.addedNodes].every((node) => node.dataset?.vgenNyaUi));
          if (onlyOwnInsertions || records.every((record) => this.quickReplies?.ownsMutation(record) || this.search?.ownsMutation(record))) return;
          this.refresh();
        });
        this.observer.observe(this.surface, { childList: true, subtree: true });
      }
      return true;
    }
    refresh() {
      if (!this.mounted) return null;
      const settings = this.repository.read().chatSettings;
      const result = this.adapter.refresh({
        settings,
        readGate: this.readGate,
        onManualRead: (cid, channel) => this.readGate.manualRelease(cid, (body) => channel.markRead?.(body))
      });
      this.cid = result?.cid || null;
      this.quickReplies?.refresh();
      this.#syncSearch(settings);
      return result;
    }
    #syncSearch(settings) {
      if (settings.searchEnabled !== false) {
        this.search.mount();
        this.search.refresh();
      } else {
        this.search.unmount();
      }
    }
    unmount() {
      if (!this.mounted) return false;
      this.observer?.disconnect();
      this.observer = null;
      this.adapter.cleanup?.();
      this.quickReplies?.cleanup();
      this.search.unmount();
      this.cid = null;
      this.mounted = false;
      return true;
    }
  };
  var ChatAssistantRuntime = class {
    constructor({ repository, readGate, networkHooks, textPresetEngine, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapterFactory } = {}) {
      this.repository = repository;
      this.readGate = readGate;
      this.networkHooks = networkHooks;
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
      this.adapterFactory = adapterFactory || ((surface) => new StreamChatAdapter(surface, { documentObject, MutationObserverClass }));
      this.textPresetEngine = textPresetEngine;
      this.sessions = /* @__PURE__ */ new Map();
      this.probes = /* @__PURE__ */ new Map();
      this.portalObserver = null;
      this.unsubscribe = null;
      this.style = null;
      this.mounted = false;
    }
    mount() {
      if (this.mounted) return false;
      this.mounted = true;
      this.unsubscribe = this.repository.subscribe(() => this.#sync());
      this.#sync();
      return true;
    }
    #sync() {
      const settings = this.repository.read().chatSettings;
      this.readGate.configure(settings);
      this.networkHooks.configureRead(settings.enabled && settings.keepUnread);
      if (settings.enabled) this.#start();
      else this.#stop();
      for (const session of this.sessions.values()) session.refresh();
    }
    #start() {
      if (this.portalObserver || !this.documentObject?.body) return;
      this.#installStyle();
      this.scan(this.documentObject);
      if (this.MutationObserverClass) {
        this.portalObserver = new this.MutationObserverClass((records) => {
          for (const record of records) {
            for (const node of record.addedNodes || []) if (!this.scan(node)) this.#probe(node);
            for (const node of record.removedNodes || []) this.#releaseRemoved(node);
          }
        });
        this.portalObserver.observe(this.documentObject.body, { childList: true });
      }
    }
    #stop() {
      this.portalObserver?.disconnect();
      this.portalObserver = null;
      for (const root of [...this.probes.keys()]) this.#releaseProbe(root);
      for (const session of this.sessions.values()) session.unmount();
      this.sessions.clear();
      this.style?.remove();
      this.style = null;
    }
    #installStyle() {
      if (this.style || !this.documentObject?.createElement) return;
      this.style = this.documentObject.createElement("style");
      this.style.dataset.vgenNyaUi = "chat-style";
      this.style.textContent = CHAT_CSS;
      (this.documentObject.head || this.documentObject.body).append(this.style);
    }
    scan(root) {
      const selector = StreamChatAdapter.overlaySelector;
      const candidates = [.../* @__PURE__ */ new Set([
        ...root?.matches?.(selector) ? [root] : [],
        ...root?.querySelectorAll?.(selector) || []
      ])];
      const surfaces = [...new Set(candidates.map((candidate) => this.#sessionSurface(candidate)))];
      let mounted = 0;
      for (const surface of surfaces) {
        if (this.sessions.has(surface) || !surface.isConnected) continue;
        if ([...this.sessions.keys()].some((existing) => existing.contains?.(surface))) continue;
        const adapter = this.adapterFactory(surface);
        const session = new ChatAssistantSession({ surface, repository: this.repository, readGate: this.readGate, adapter, textPresetEngine: this.textPresetEngine, MutationObserverClass: this.MutationObserverClass });
        session.mount();
        this.sessions.set(surface, session);
        mounted += 1;
      }
      return mounted;
    }
    #sessionSurface(channelRoot) {
      let node = channelRoot;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        if (String(node.className || "").includes("ChatModal__Container")) return node;
      }
      return channelRoot;
    }
    #probe(root) {
      if (!this.MutationObserverClass || !root?.querySelectorAll || this.probes.has(root)) return;
      const likelyPortal = root.matches?.(CHAT_PORTAL_SELECTOR2) || root.querySelector?.(CHAT_PORTAL_SELECTOR2);
      if (!likelyPortal) return;
      const observer = new this.MutationObserverClass(() => {
        if (!root.isConnected || this.scan(root)) this.#releaseProbe(root);
      });
      observer.observe(root, { childList: true, subtree: true });
      const timer = globalThis.setTimeout(() => this.#releaseProbe(root), 1e4);
      this.probes.set(root, { observer, timer });
    }
    #releaseProbe(root) {
      const probe = this.probes.get(root);
      if (!probe) return;
      probe.observer.disconnect();
      globalThis.clearTimeout(probe.timer);
      this.probes.delete(root);
    }
    #releaseRemoved(root) {
      for (const probeRoot of [...this.probes.keys()]) if (probeRoot === root || root.contains?.(probeRoot) || !probeRoot.isConnected) this.#releaseProbe(probeRoot);
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
      if (!this.mounted) return false;
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.#stop();
      this.networkHooks.configureRead(false);
      this.readGate.cancelAll("chat-runtime-unmounted");
      this.mounted = false;
      return true;
    }
    dispose() {
      this.unmount();
    }
  };
  var ChatService = class {
    constructor({ documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, openUser = StreamChatAdapter.openUser } = {}) {
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
      this.openUserAdapter = openUser;
    }
    openUser(target) {
      return this.openUserAdapter(target, { documentObject: this.documentObject, MutationObserverClass: this.MutationObserverClass });
    }
  };

  // src/clients/frequent-clients.js
  var PROFILE_CACHE_MS = 6 * 60 * 60 * 1e3;
  var LEGACY_FOOTER_SELECTOR = '[class*="CreatorSidebar__SidebarFooter"]';
  var MODERN_SIDEBAR_SELECTOR = '[class*="DesktopSidebar__Sidebar"]';
  var CLIENTS_CSS = `
.vgen-nya-clients{--nya-clients-bg:#13252bee;--nya-clients-fg:#eef8f7;--nya-clients-border:#6f8588;--nya-clients-divider:#ffffff22;--nya-clients-control:#ffffff18;margin:10px 8px;border:1px solid var(--nya-clients-border);border-radius:10px;overflow:hidden;background:var(--nya-clients-bg);color:var(--nya-clients-fg);font:12px/1.35 system-ui,sans-serif;min-height:var(--vgen-nya-clients-min-height)}
.vgen-nya-clients[data-collapsed="true"]{min-height:0}
.vgen-nya-clients__header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--nya-clients-divider)}.vgen-nya-clients__header strong{margin-right:auto}.vgen-nya-clients__header button{border:0;border-radius:5px;background:var(--nya-clients-control);color:inherit;cursor:pointer}
.vgen-nya-clients__list{max-height:calc(var(--vgen-nya-clients-row-height) * 7);overflow:auto}.vgen-nya-clients__row{display:flex;align-items:center;min-height:var(--vgen-nya-clients-row-height);padding:5px 8px;background-color:var(--nya-clients-bg);background-size:cover;background-position:center;border-bottom:1px solid var(--nya-clients-divider)}.vgen-nya-clients__row[style*="background-image"]{color:#fff;text-shadow:0 1px 2px #000;background-blend-mode:multiply}
.vgen-nya-clients__avatar{position:relative;flex:0 0 34px;width:34px;height:34px;padding:0;border:0;border-radius:9px;cursor:pointer;background:#30434a}.vgen-nya-clients__avatar img{width:100%;height:100%;border-radius:inherit;object-fit:cover}.vgen-nya-clients__chat-badge{position:absolute;right:-5px;bottom:-5px;display:flex;width:17px;height:17px;align-items:center;justify-content:center;border-radius:50%;background:#fff;color:#263238;font-size:10px;pointer-events:none}
.vgen-nya-clients__link{display:flex;flex:1;min-width:0;flex-direction:column;margin-left:10px;color:inherit;text-decoration:none}.vgen-nya-clients__primary{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vgen-nya-clients__secondary,.vgen-nya-clients__updates{opacity:.7;font-size:10px}.vgen-nya-clients__notice{margin-left:5px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 5px;border-radius:5px;background:#ffcf5a;color:#392d00;font-size:9px;font-weight:700}.vgen-nya-clients__empty{padding:10px;opacity:.75}
@media (prefers-color-scheme:light){.vgen-nya-clients{--nya-clients-bg:#f5faf9f2;--nya-clients-fg:#1f2b2c;--nya-clients-border:#9ab0b2;--nya-clients-divider:#17393f20;--nya-clients-control:#17393f12}.vgen-nya-clients__row[style*="background-image"]{background-color:#52666b}}
`;
  var latestDate = (items, fields) => (items || []).reduce((latest, item) => {
    const value = fields.map((field) => item?.[field]).find(Boolean);
    return value && (!latest || Date.parse(value) > Date.parse(latest)) ? value : latest;
  }, "");
  var make6 = (documentObject, tag, className = "", text = "") => {
    const node = documentObject.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  var abortError = () => Object.assign(new Error("Frequent Client refresh aborted"), { name: "AbortError" });
  var FrequentClientsRuntime = class {
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
        const modernFooter = modernSidebar?.querySelector?.(":scope > .sidebarFooter");
        return modernSidebar ? { parent: modernSidebar, before: modernFooter || null } : null;
      });
      this.panel = null;
      this.host = null;
      this.observer = null;
      this.hostObserver = null;
      this.probes = /* @__PURE__ */ new Map();
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
      this.style = this.documentObject.createElement?.("style") || null;
      if (this.style) {
        this.style.dataset.vgenNyaUi = "frequent-clients-style";
        this.style.textContent = CLIENTS_CSS;
        (this.documentObject.head || this.documentObject.body)?.append(this.style);
      }
      this.unsubscribe = this.repository.subscribe(({ domain }) => {
        if (domain.startsWith("clients")) this.sync();
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
    activate() {
    }
    sync() {
      const settings = this.repository.read().clientsSettings;
      if (!settings.enabled) {
        this.#removePanel();
        return;
      }
      if (this.panel?.isConnected === false || this.host?.isConnected === false || this.host && !this.host.parentElement) this.#removePanel();
      if (!this.panel) this.#mountIn(this.documentObject);
      if (this.panel) this.render();
    }
    #mountIn(root) {
      const mount = this.hostResolver(root);
      if (!mount || this.panel) return false;
      const host = mount.parent || mount;
      const before = mount.before || null;
      this.host = host;
      this.panel = make6(this.documentObject, "section", "vgen-nya-clients notranslate");
      this.panel.dataset.vgenNyaUi = "frequent-clients";
      this.panel.translate = false;
      this.panel.setAttribute("aria-label", "常用访问");
      this.panel.addEventListener("click", this.#onClick);
      this.panel.addEventListener("dragstart", this.#onDragStart);
      this.panel.addEventListener("dragover", this.#onDragOver);
      this.panel.addEventListener("drop", this.#onDrop);
      if (before && typeof host.insertBefore === "function") host.insertBefore(this.panel, before);
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
      const timer = globalThis.setTimeout(() => this.#releaseProbe(root), 8e3);
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
      this.panel.replaceChildren();
      const header = make6(this.documentObject, "header", "vgen-nya-clients__header");
      header.append(
        make6(this.documentObject, "strong", "", "常用访问"),
        this.#button("refresh", "↻", "刷新资料"),
        this.#button("collapse", clientsSettings.collapsed ? "＋" : "－", clientsSettings.collapsed ? "展开" : "折叠")
      );
      this.panel.append(header);
      const list = make6(this.documentObject, "div", "vgen-nya-clients__list");
      list.hidden = clientsSettings.collapsed;
      if (!clients.length) list.append(make6(this.documentObject, "p", "vgen-nya-clients__empty", "在设置 → 常用访问中添加客户"));
      clients.forEach((client, index) => list.append(this.#row(client, index)));
      this.panel.append(list);
    }
    #button(action, text, title) {
      const button = make6(this.documentObject, "button", "", text);
      button.type = "button";
      button.dataset.action = action;
      button.title = title;
      return button;
    }
    #row(client, index) {
      const row = make6(this.documentObject, "div", "vgen-nya-clients__row");
      row.dataset.clientId = client.id;
      row.dataset.index = String(index);
      row.draggable = true;
      if (client.bannerURL) row.style.backgroundImage = `url(${JSON.stringify(client.bannerURL)})`;
      const quick = this.#button("quick-chat", "", `私信 @${client.username}`);
      quick.className = "vgen-nya-clients__avatar";
      quick.dataset.clientId = client.id;
      const avatar = make6(this.documentObject, "img");
      avatar.alt = "";
      avatar.src = client.avatarURL || "";
      const badge = make6(this.documentObject, "span", "vgen-nya-clients__chat-badge", "💬");
      badge.setAttribute("aria-hidden", "true");
      quick.append(avatar, badge);
      quick.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.#openQuickChat(client.id, quick);
      });
      const text = make6(this.documentObject, "a", "vgen-nya-clients__link");
      text.href = client.url;
      text.target = "_blank";
      text.rel = "noopener noreferrer";
      const primary = make6(this.documentObject, "span", "vgen-nya-clients__primary", client.note || client.displayName || `@${client.username}`);
      const secondary = make6(this.documentObject, "span", "vgen-nya-clients__secondary", `@${client.username}`);
      const updates = [client.lastServiceUpdate && `服务 ${this.#date(client.lastServiceUpdate)}`, client.lastPortfolioUpdate && `作品 ${this.#date(client.lastPortfolioUpdate)}`].filter(Boolean).join(" · ");
      const detail = make6(this.documentObject, "span", "vgen-nya-clients__updates", updates);
      text.append(primary, secondary, detail);
      if (client.announcementMessage) {
        const notice = make6(this.documentObject, "span", "vgen-nya-clients__notice", `通知：${client.announcementMessage}`);
        notice.title = client.announcementMessage;
        row.append(quick, text, notice);
      } else row.append(quick, text);
      return row;
    }
    #date(value) {
      const date = new Date(value);
      return Number.isFinite(+date) ? date.toLocaleDateString([], { month: "numeric", day: "numeric" }) : "—";
    }
    #onClick = async (event) => {
      const button = event.target?.closest?.("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "collapse") {
        const next = this.repository.read().clientsSettings;
        next.collapsed = !next.collapsed;
        this.repository.writeClientsSettings(next);
      }
      if (button.dataset.action === "refresh") await this.refreshStale(true);
    };
    async #openQuickChat(clientId, button) {
      if (button.disabled) return;
      button.disabled = true;
      const originalTitle = button.title;
      button.dataset.vgenNyaQuickChatStatus = "loading";
      delete button.dataset.vgenNyaQuickChatError;
      try {
        let client = this.repository.read().clients.find((item) => item.id === clientId);
        if (!client?.userID) {
          await this.refreshClient(client?.id, true);
          client = this.repository.read().clients.find((item) => item.id === clientId);
        }
        await this.chat.openUser(client);
        button.dataset.vgenNyaQuickChatStatus = "opened";
      } catch (error) {
        button.dataset.vgenNyaQuickChatStatus = "error";
        button.dataset.vgenNyaQuickChatError = String(error?.message || error || "quick-chat-failed").slice(0, 120);
        button.title = `${originalTitle} · 无法打开：${button.dataset.vgenNyaQuickChatError}`;
      } finally {
        button.disabled = false;
      }
    }
    #onDragStart = (event) => {
      const row = event.target?.closest?.("[data-client-id]");
      if (row) event.dataTransfer?.setData("text/plain", row.dataset.clientId);
    };
    #onDragOver = (event) => {
      if (event.target?.closest?.("[data-client-id]")) event.preventDefault();
    };
    #onDrop = (event) => {
      const target = event.target?.closest?.("[data-client-id]");
      const sourceId = event.dataTransfer?.getData("text/plain");
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
      if (!client || !force && Date.now() - client.profileFetchedAt < PROFILE_CACHE_MS) return client;
      const api = async (path) => {
        if (signal?.aborted) throw abortError();
        const response = await this.fetchImpl(`https://api.vgen.co${path}`, { headers: { "v-client-id": "vgen-web" }, signal });
        if (!response.ok) throw new Error(`VGen API ${response.status}`);
        return response.json();
      };
      const profile = await api(`/user/${encodeURIComponent(client.username)}`);
      if (signal?.aborted) throw abortError();
      if (!profile?.userID) throw new Error("user-profile-unavailable");
      const [services, showcases] = await Promise.allSettled([
        api(`/commission/services/${encodeURIComponent(profile.userID)}`),
        api(`/discoverability/portfolio/showcases/${encodeURIComponent(profile.userID)}?limit=1&verifyAge=true`)
      ]);
      if (signal?.aborted) throw abortError();
      Object.assign(client, {
        userID: String(profile.userID),
        username: String(profile.username || client.username),
        url: `https://vgen.co/${encodeURIComponent(profile.username || client.username)}`,
        displayName: String(profile.displayName || ""),
        avatarURL: String(profile.avatarURL || ""),
        bannerURL: String(profile.bannerURL || ""),
        announcementMessage: String(profile.announcement?.message || "").slice(0, 500),
        announcementModified: String(profile.announcement?.modified || ""),
        lastServiceUpdate: services.status === "fulfilled" ? latestDate(services.value, ["modified", "created"]) : client.lastServiceUpdate,
        lastPortfolioUpdate: showcases.status === "fulfilled" ? String(showcases.value?.showcases?.[0]?.modified || showcases.value?.showcases?.[0]?.created || "") : client.lastPortfolioUpdate,
        serviceFetchFailed: services.status === "rejected",
        portfolioFetchFailed: showcases.status === "rejected",
        profileFetchedAt: Date.now()
      });
      this.repository.writeClients(clients);
      return client;
    }
    #removePanel() {
      if (!this.panel) return;
      this.hostObserver?.disconnect();
      this.hostObserver = null;
      this.panel.removeEventListener("click", this.#onClick);
      this.panel.removeEventListener("dragstart", this.#onDragStart);
      this.panel.removeEventListener("dragover", this.#onDragOver);
      this.panel.removeEventListener("drop", this.#onDrop);
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
    dispose() {
      this.unmount();
    }
  };

  // src/settings/chat-settings.js
  function make7(documentObject, tag, attributes = {}, text = "") {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }
  function check(documentObject, label, checked, setting) {
    const row = make7(documentObject, "label", { className: "vgen-nya-settings__check" });
    row.append(make7(documentObject, "input", { type: "checkbox", checked, dataset: { setting } }), documentObject.createTextNode(` ${label}`));
    return row;
  }
  function renderChat(repository, fields) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        const settings = repository.read().chatSettings;
        body.replaceChildren(...fields.map(([key, label]) => check(documentObject, label, settings[key], key)));
      };
      const onChange = (event) => {
        const key = event.target?.dataset?.setting;
        if (!key) return;
        const settings = repository.read().chatSettings;
        settings[key] = event.target.checked;
        repository.writeChatSettings(settings);
      };
      body.addEventListener("change", onChange);
      use(() => body.removeEventListener("change", onChange));
      render();
    };
  }
  function renderClientPanel(repository) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        const settings = repository.read().clientsSettings;
        body.replaceChildren(
          check(documentObject, "启用常用访问面板", settings.enabled, "enabled"),
          check(documentObject, "默认折叠", settings.collapsed, "collapsed"),
          make7(documentObject, "label", {}, "面板最小高度 "),
          make7(documentObject, "input", { type: "number", min: 120, max: 520, value: settings.minHeight, dataset: { setting: "minHeight" } }),
          make7(documentObject, "label", {}, " 行高 "),
          make7(documentObject, "input", { type: "number", min: 42, max: 88, value: settings.rowHeight, dataset: { setting: "rowHeight" } })
        );
      };
      const onChange = (event) => {
        const key = event.target?.dataset?.setting;
        if (!key) return;
        const settings = repository.read().clientsSettings;
        settings[key] = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
        repository.writeClientsSettings(settings);
      };
      body.addEventListener("change", onChange);
      use(() => body.removeEventListener("change", onChange));
      render();
    };
  }
  function renderClientManager(repository) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        body.replaceChildren();
        repository.read().clients.forEach((client, index, clients) => {
          const row = make7(documentObject, "div", { className: "vgen-nya-settings__preset-row" });
          const note = make7(documentObject, "input", { value: client.note, placeholder: `@${client.username}`, dataset: { role: "note", id: client.id } });
          row.append(
            note,
            make7(documentObject, "button", { type: "button", disabled: index === 0, dataset: { action: "up", index } }, "↑"),
            make7(documentObject, "button", { type: "button", disabled: index === clients.length - 1, dataset: { action: "down", index } }, "↓"),
            make7(documentObject, "button", { type: "button", dataset: { action: "delete", id: client.id } }, "删除")
          );
          body.append(row);
        });
        const add = make7(documentObject, "div", { className: "vgen-nya-settings__toolbar" });
        add.append(
          make7(documentObject, "input", { placeholder: "VGen username", dataset: { role: "username" } }),
          make7(documentObject, "input", { placeholder: "备注（可选）", dataset: { role: "new-note" } }),
          make7(documentObject, "button", { type: "button", dataset: { action: "add" } }, "添加")
        );
        body.append(add);
      };
      const onChange = (event) => {
        if (event.target?.dataset?.role !== "note") return;
        const clients = repository.read().clients;
        const client = clients.find((item) => item.id === event.target.dataset.id);
        if (client) {
          client.note = event.target.value;
          repository.writeClients(clients);
        }
      };
      const onClick = (event) => {
        const button = event.target?.closest?.("button[data-action]");
        if (!button) return;
        if (button.dataset.action === "delete") repository.removeClient(button.dataset.id);
        if (button.dataset.action === "up" || button.dataset.action === "down") {
          const index = Number(button.dataset.index);
          repository.reorderClient(index, button.dataset.action === "up" ? index - 1 : index + 1);
        }
        if (button.dataset.action === "add") {
          const username = String(body.querySelector('[data-role="username"]')?.value || "").trim().replace(/^@/, "");
          const note = String(body.querySelector('[data-role="new-note"]')?.value || "").trim();
          if (!/^[A-Za-z0-9_.-]+$/.test(username)) throw new TypeError("Invalid VGen username");
          const clients = repository.read().clients;
          clients.push({ id: globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`, username, note, createdAt: Date.now() });
          repository.writeClients(clients);
        }
        render();
      };
      body.addEventListener("change", onChange);
      body.addEventListener("click", onClick);
      use(() => body.removeEventListener("change", onChange));
      use(() => body.removeEventListener("click", onClick));
      render();
    };
  }
  function renderDiagnostics(diagnostics) {
    return ({ documentObject, body, use }) => {
      const status = make7(documentObject, "p");
      const render = () => {
        status.textContent = diagnostics.active ? `运行中 · ${diagnostics.events.length} events` : "已停止；无诊断网络 hook";
      };
      const start2 = make7(documentObject, "button", { type: "button", dataset: { action: "start" } }, "启动诊断");
      const stop = make7(documentObject, "button", { type: "button", dataset: { action: "stop" } }, "停止诊断");
      const exportButton = make7(documentObject, "button", { type: "button", dataset: { action: "export" } }, "导出报告");
      body.replaceChildren(status, start2, stop, exportButton);
      const onClick = (event) => {
        const action = event.target?.dataset?.action;
        if (action === "start") diagnostics.start();
        if (action === "stop") diagnostics.stop();
        if (action === "export") {
          const blob = new Blob([JSON.stringify(diagnostics.snapshot(), null, 2)], { type: "application/json;charset=utf-8" });
          const view = documentObject.defaultView || globalThis;
          const url = view.URL.createObjectURL(blob);
          const anchor = make7(documentObject, "a", { href: url, download: `vgen-nya-chat-diagnostics-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json` });
          body.append(anchor);
          anchor.click();
          anchor.remove();
          view.setTimeout(() => view.URL.revokeObjectURL(url), 1e3);
        }
        render();
      };
      body.addEventListener("click", onClick);
      use(() => body.removeEventListener("click", onClick));
      render();
    };
  }
  function createChatSettingsNavigation(repository, diagnostics, baseNavigation, textPresetEngine = null) {
    return baseNavigation.map((item) => {
      if (item.id === "chat") return {
        ...item,
        tabs: [
          { id: "display", label: "聊天显示", sections: [{ id: "display", title: "Seen / 时间戳 / Reaction / 搜索", render: renderChat(repository, [
            ["enabled", "启用 Chat Assistant"],
            ["showSeen", "显示 seen"],
            ["showTimestamps", "显示时间戳"],
            ["showStatusBar", "显示气泡状态长条"],
            ["compactReactions", "紧凑 Reaction"],
            ["searchEnabled", "启用聊天全文搜索"]
          ]) }] },
          { id: "read-control", label: "已读控制", sections: [{ id: "read-control", title: "服务器已读边界", render: renderChat(repository, [
            ["keepUnread", "保持服务器未读，手动释放"],
            ["reactionMarkRead", "Reaction 成功后标记已读"]
          ]) }] },
          ...textPresetEngine ? [{ id: "quick-reply", label: "快捷回复", sections: [{ id: "quick-reply", title: "Chat Quick Reply", render: renderTextPresetManager(textPresetEngine, TEXT_PRESET_CONTEXTS.chatQuickReply, { contentLabel: "回复内容" }) }] }] : []
        ]
      };
      if (item.id === "clients") return {
        ...item,
        tabs: [
          { id: "panel", label: "面板设置", sections: [{ id: "panel", title: "显示与尺寸", render: renderClientPanel(repository) }] },
          { id: "management", label: "客户管理", sections: [{ id: "management", title: "新增 / 备注 / 排序 / 删除", render: renderClientManager(repository) }] }
        ]
      };
      if (item.id === "developer") return {
        ...item,
        tabs: [{ id: "diagnostics", label: "Diagnostics", sections: [{ id: "diagnostics", title: "Chat 网络诊断", render: renderDiagnostics(diagnostics) }] }]
      };
      return item;
    });
  }

  // src/settings/order-settings.js
  function make8(documentObject, tag, attributes = {}, text = "") {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.textContent = text;
    return node;
  }
  function renderOrderTools(repository) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        const settings = repository.read();
        const copy = make8(documentObject, "label", { className: "vgen-nya-settings__check" });
        copy.append(make8(documentObject, "input", { type: "checkbox", checked: settings.copyButtons, dataset: { setting: "copyButtons" } }), documentObject.createTextNode(" 启用 Copy ID / Profile URL"));
        const background = make8(documentObject, "label", { className: "vgen-nya-settings__check" });
        background.append(make8(documentObject, "input", { type: "checkbox", checked: settings.clientBackground, dataset: { setting: "clientBackground" } }), documentObject.createTextNode(" 启用 Client Background"));
        body.replaceChildren(copy, background);
      };
      const onChange = (event) => {
        const key = event.target?.dataset?.setting;
        if (!key) return;
        repository.write({ ...repository.read(), [key]: event.target.checked });
      };
      body.addEventListener("change", onChange);
      use(() => body.removeEventListener("change", onChange));
      render();
    };
  }
  function createOrderSettingsNavigation({ engine, repository }, baseNavigation) {
    return baseNavigation.map((item) => item.id !== "orders" ? item : {
      ...item,
      tabs: [
        {
          id: "order-tools",
          label: "订单工具",
          sections: [
            { id: "client-background", title: "Client Background", description: "公开客户身份、评价上下文与复制工具。", render: renderOrderTools(repository) }
          ]
        },
        {
          id: "text-presets",
          label: "文本预设",
          sections: [
            { id: "final-delivery", title: "Final Delivery", description: "只填入，不交付。真实输入区等待安全订单状态验证。", render: renderTextPresetManager(engine, TEXT_PRESET_CONTEXTS.finalDelivery, { contentLabel: "交付文本" }) },
            { id: "private-note", title: "Private Note", description: "只填入 Note to self，不调用保存。", render: renderTextPresetManager(engine, TEXT_PRESET_CONTEXTS.privateNote, { contentLabel: "Private Note" }) }
          ]
        }
      ]
    });
  }

  // src/presets/text-preset-store.js
  var TEXT_PRESET_KEYS = Object.freeze({
    [TEXT_PRESET_CONTEXTS.chatQuickReply]: CONFIG_KEYS.chatQuickReplyPresets,
    [TEXT_PRESET_CONTEXTS.privateNote]: CONFIG_KEYS.privateNotePresets,
    [TEXT_PRESET_CONTEXTS.finalDelivery]: CONFIG_KEYS.finalDeliveryPresets
  });
  var TextPresetStore = class {
    constructor({ store, uploadRepository } = {}) {
      this.store = store;
      this.uploadRepository = uploadRepository;
      this.listeners = /* @__PURE__ */ new Set();
      this.unsubscribeUpload = uploadRepository?.subscribe?.(() => this.#emit("upload")) || null;
    }
    read(context) {
      if (context === TEXT_PRESET_CONTEXTS.uploadTitle) return this.#upload("titlePresets");
      if (context === TEXT_PRESET_CONTEXTS.uploadDescription) return this.#upload("descriptionPresets");
      const key = TEXT_PRESET_KEYS[context];
      if (!key) throw new TypeError(`Unknown text preset context: ${context}`);
      const value = this.store.read(key, []);
      return cloneStorageValue(value);
    }
    write(context, value) {
      if (!Array.isArray(value)) throw new TypeError("Text preset collection must be an array");
      const next = cloneStorageValue(value);
      if (context === TEXT_PRESET_CONTEXTS.uploadTitle) return this.uploadRepository.writeDomain("titlePresets", next).titlePresets;
      if (context === TEXT_PRESET_CONTEXTS.uploadDescription) return this.uploadRepository.writeDomain("descriptionPresets", next).descriptionPresets;
      const key = TEXT_PRESET_KEYS[context];
      if (!key) throw new TypeError(`Unknown text preset context: ${context}`);
      const stored = this.store.writeVerified(key, next, Array.isArray);
      this.#emit(context);
      return cloneStorageValue(stored);
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    dispose() {
      this.unsubscribeUpload?.();
      this.unsubscribeUpload = null;
      this.listeners.clear();
    }
    #upload(domain) {
      const value = this.uploadRepository?.read?.()[domain];
      return Array.isArray(value) ? cloneStorageValue(value) : [];
    }
    #emit(context) {
      for (const listener of this.listeners) listener({ context });
    }
  };

  // src/presets/text-preset-engine.js
  var TEXT_PRESET_EXPORT_SCHEMA = "vgen-nya.text-presets";
  var TEXT_PRESET_EXPORT_VERSION = 1;
  function defaultId() {
    return globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  var TextPresetEngine = class {
    constructor({ store, registry, idFactory = defaultId } = {}) {
      this.store = store;
      this.registry = registry;
      this.idFactory = idFactory;
      this.selected = /* @__PURE__ */ new Map();
    }
    list(context) {
      return this.#inspect(context).valid;
    }
    #inspect(context) {
      const adapter = this.registry.get(context);
      const raw = this.store.read(context);
      if (!Array.isArray(raw)) return { raw, valid: [], hasInvalid: true };
      const result = [];
      const ids = /* @__PURE__ */ new Set();
      for (const item of raw) {
        const id = String(item?.id || "").trim();
        if (!id || ids.has(id) || typeof item?.name !== "string") continue;
        try {
          const payload = adapter.deserialize(item);
          if (!adapter.validate(payload)) continue;
        } catch {
          continue;
        }
        ids.add(id);
        result.push(cloneStorageValue(item));
      }
      return { raw, valid: result, hasInvalid: result.length !== raw.length };
    }
    #writableList(context) {
      const inspected = this.#inspect(context);
      if (inspected.hasInvalid) throw new Error("Text preset collection contains invalid or duplicate data; source was left unchanged");
      return inspected.valid;
    }
    get(context, id) {
      return this.list(context).find((item) => String(item.id) === String(id)) || null;
    }
    create(context, { id = this.idFactory(), name, payload } = {}) {
      const items = this.#writableList(context);
      const normalizedId = String(id || "").trim();
      const normalizedName = String(name || "").trim();
      if (!normalizedId || items.some((item) => String(item.id) === normalizedId)) throw new Error("Text preset id must be unique");
      if (!normalizedName) throw new Error("Text preset name is required");
      const preset = this.registry.get(context).serialize(payload, { id: normalizedId, name: normalizedName });
      this.store.write(context, [...items, preset]);
      return cloneStorageValue(preset);
    }
    update(context, id, changes = {}) {
      const items = this.#writableList(context);
      const index = items.findIndex((item) => String(item.id) === String(id));
      if (index < 0) throw new Error("Text preset was not found");
      const current = items[index];
      const name = changes.name === void 0 ? current.name : String(changes.name).trim();
      if (!name) throw new Error("Text preset name is required");
      const adapter = this.registry.get(context);
      const payload = changes.payload === void 0 ? adapter.deserialize(current) : changes.payload;
      items[index] = adapter.serialize(payload, { ...current, id: current.id, name });
      this.store.write(context, items);
      return cloneStorageValue(items[index]);
    }
    delete(context, id) {
      const items = this.#writableList(context);
      const next = items.filter((item) => String(item.id) !== String(id));
      if (next.length === items.length) return false;
      this.store.write(context, next);
      if (this.selected.get(context) === String(id)) this.selected.delete(context);
      return true;
    }
    reorder(context, from, to) {
      const items = this.#writableList(context);
      if (![from, to].every(Number.isInteger) || from < 0 || to < 0 || from >= items.length || to >= items.length) throw new RangeError("Invalid text preset order");
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      this.store.write(context, items);
      return items;
    }
    preview(context, id, maximum) {
      const preset = this.get(context, id);
      if (!preset) return "";
      const adapter = this.registry.get(context);
      return adapter.preview(adapter.deserialize(preset), maximum);
    }
    async select(context, id, target, options = {}) {
      const preset = this.get(context, id);
      if (!preset) throw new Error("Text preset was not found");
      const adapter = this.registry.get(context);
      const payload = adapter.deserialize(preset);
      if (!adapter.validate(payload)) throw new TypeError("Text preset payload is invalid");
      const result = await adapter.fill(payload, target, options);
      if (result?.status === "requires-confirmation") return { ...result, preset: cloneStorageValue(preset) };
      this.selected.set(context, String(id));
      return { status: "filled", preset: cloneStorageValue(preset), result };
    }
    clearSelection(context) {
      this.selected.delete(context);
    }
    selectedId(context) {
      return this.selected.get(context) || null;
    }
    exportCollection(context) {
      return cloneStorageValue(this.list(context));
    }
    exportDocument(context, exportedAt = (/* @__PURE__ */ new Date()).toISOString()) {
      this.registry.get(context);
      return { schema: TEXT_PRESET_EXPORT_SCHEMA, version: TEXT_PRESET_EXPORT_VERSION, context, exportedAt, presets: this.exportCollection(context) };
    }
    prepareImport(input) {
      let document2;
      try {
        document2 = typeof input === "string" ? JSON.parse(input) : cloneStorageValue(input);
      } catch (error) {
        throw new TypeError("Text preset import is not valid JSON", { cause: error });
      }
      if (document2?.schema !== TEXT_PRESET_EXPORT_SCHEMA || document2?.version !== TEXT_PRESET_EXPORT_VERSION) throw new TypeError("Unsupported text preset export schema");
      const adapter = this.registry.get(document2.context);
      if (!Array.isArray(document2.presets)) throw new TypeError("Text preset export has no preset array");
      const ids = /* @__PURE__ */ new Set();
      for (const preset of document2.presets) {
        const id = String(preset?.id || "").trim();
        if (!id || ids.has(id) || typeof preset?.name !== "string") throw new TypeError("Text preset export contains invalid or duplicate entries");
        const payload = adapter.deserialize(preset);
        if (!adapter.validate(payload)) throw new TypeError("Text preset export contains invalid payload");
        ids.add(id);
      }
      return { kind: "vgen-nya.text-preset-import-plan", context: document2.context, presets: cloneStorageValue(document2.presets), count: document2.presets.length };
    }
    commitImport(plan, { confirmed = false } = {}) {
      if (!confirmed) throw new Error("Text preset import requires explicit confirmation");
      if (plan?.kind !== "vgen-nya.text-preset-import-plan") throw new TypeError("Invalid text preset import plan");
      this.registry.get(plan.context);
      this.#writableList(plan.context);
      const previous = this.store.read(plan.context);
      try {
        this.store.write(plan.context, plan.presets);
        const written = this.store.read(plan.context);
        if (JSON.stringify(written) !== JSON.stringify(plan.presets)) throw new Error("Text preset import verification failed");
      } catch (error) {
        this.store.write(plan.context, previous);
        throw new Error("Text preset import failed and previous values were restored", { cause: error });
      }
      return this.list(plan.context);
    }
    subscribe(listener) {
      return this.store.subscribe(listener);
    }
  };

  // src/presets/adapters/plain-text.js
  function valueFromPreset(preset) {
    if (typeof preset?.value === "string") return preset.value;
    return "";
  }
  var PlainTextPresetAdapter = class {
    constructor({ fill } = {}) {
      this.fillTarget = fill;
    }
    serialize(payload, base = {}) {
      if (typeof payload !== "string") throw new TypeError("Text preset content must be a string");
      return { ...base, value: payload };
    }
    deserialize(preset) {
      return valueFromPreset(preset);
    }
    preview(payload, maximum = 120) {
      return String(payload).replace(/\s+/g, " ").trim().slice(0, maximum);
    }
    validate(payload) {
      return typeof payload === "string";
    }
    async fill(payload, target, options = {}) {
      if (!this.validate(payload)) throw new TypeError("Text preset content must be a string");
      if (this.fillTarget) return this.fillTarget(payload, target, options);
      if (typeof target?.fillText !== "function") throw new TypeError("Text preset target requires fillText()");
      return target.fillText(payload, options);
    }
  };

  // src/presets/adapters/upload-title.js
  var UploadTitlePresetAdapter = class extends PlainTextPresetAdapter {
    constructor() {
      super({ fill: (payload, target) => target.applyText("title", payload) });
    }
    deserialize(preset) {
      return typeof preset?.value === "string" ? preset.value : String(preset?.title || "");
    }
  };

  // src/presets/adapters/upload-description.js
  function textFromSlate(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(textFromSlate).join("");
    if (value && typeof value === "object") {
      if (typeof value.text === "string") return value.text;
      return Object.values(value).map(textFromSlate).join("");
    }
    return "";
  }
  var UploadDescriptionPresetAdapter = class {
    serialize(payload, base = {}) {
      this.#parse(payload);
      return { ...base, value: payload };
    }
    deserialize(preset) {
      const payload = typeof preset?.value === "string" ? preset.value : String(preset?.description || "");
      this.#parse(payload);
      return payload;
    }
    preview(payload, maximum = 120) {
      return textFromSlate(this.#parse(payload)).replace(/\s+/g, " ").trim().slice(0, maximum);
    }
    validate(payload) {
      try {
        this.#parse(payload);
        return true;
      } catch {
        return false;
      }
    }
    async fill(payload, target) {
      this.#parse(payload);
      if (typeof target?.applyText !== "function") throw new TypeError("Description target requires applyText()");
      return target.applyText("description", payload);
    }
    #parse(payload) {
      if (typeof payload !== "string") throw new TypeError("Description preset must preserve serialized Slate JSON");
      let value;
      try {
        value = JSON.parse(payload);
      } catch (error) {
        throw new TypeError("Description preset contains invalid Slate JSON", { cause: error });
      }
      if (!Array.isArray(value)) throw new TypeError("Description preset Slate root must be an array");
      return value;
    }
  };

  // src/presets/adapters/chat-quick-reply.js
  var ChatQuickReplyPresetAdapter = class extends PlainTextPresetAdapter {
    constructor() {
      super({ fill: (payload, target, options) => target.fillComposer(payload, options) });
    }
  };

  // src/presets/adapters/private-note.js
  var PrivateNotePresetAdapter = class extends PlainTextPresetAdapter {
    constructor() {
      super({ fill: (payload, target, options) => target.fillPrivateNote(payload, options) });
    }
  };

  // src/presets/adapters/final-delivery.js
  var FinalDeliveryPresetAdapter = class extends PlainTextPresetAdapter {
    constructor() {
      super({ fill: (payload, target, options) => target.fillFinalDelivery(payload, options) });
    }
  };

  // src/order/order-text-presets.js
  var NOTE_CONTEXT = TEXT_PRESET_CONTEXTS.privateNote;
  var NOTE_SELECTOR = 'textarea[aria-label="Note to self"], input[aria-label="Note to self"], textarea[placeholder="Note to self"], input[placeholder="Note to self"]';
  var ORDER_PRESET_CSS = ".vgen-nya-order-presets{display:flex;align-items:center;gap:6px;max-width:100%;padding:6px 2px;overflow-x:auto}.vgen-nya-order-presets .vgen-nya-preset-chip{flex:0 0 auto;max-width:220px;padding:5px 9px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 7%,transparent);color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.vgen-nya-order-presets .vgen-nya-preset-chip:hover{background:color-mix(in srgb,currentColor 13%,transparent)}.vgen-nya-order-presets .vgen-nya-preset-empty{font:12px/1.4 system-ui,sans-serif;opacity:.62}";
  function privateNoteInputs(root) {
    const inputs = [
      ...root?.matches?.(NOTE_SELECTOR) ? [root] : [],
      ...root?.querySelectorAll?.(NOTE_SELECTOR) || []
    ];
    for (const label of root?.querySelectorAll?.("label") || []) {
      if (!/\bnote\s+to\s+self\b/i.test(String(label.textContent || ""))) continue;
      const id = label.getAttribute?.("for") || label.htmlFor;
      const input = id && label.ownerDocument?.getElementById?.(id) || label.querySelector?.("textarea, input") || label.parentElement?.querySelector?.("textarea, input");
      if (input) inputs.push(input);
    }
    return [...new Set(inputs)];
  }
  var PrivateNoteTarget = class {
    constructor(element2) {
      this.native = new NativeTextTarget(element2);
    }
    fillPrivateNote(payload, options) {
      return this.native.fillText(payload, options);
    }
  };
  var PrivateNoteSession = class {
    constructor({ input, engine } = {}) {
      this.input = input;
      this.engine = engine;
      this.root = null;
      this.target = new PrivateNoteTarget(input);
      this.onClick = (event) => this.#click(event);
      this.onInput = () => {
        this.engine.clearSelection(NOTE_CONTEXT);
        this.render();
      };
    }
    mount() {
      if (this.root?.isConnected) return false;
      const documentObject = this.input.ownerDocument;
      this.root = documentObject.createElement("div");
      this.root.className = "vgen-nya-order-presets notranslate";
      this.root.dataset.vgenNyaUi = "private-note-presets";
      this.root.translate = false;
      this.root.addEventListener("click", this.onClick);
      this.input.addEventListener("input", this.onInput);
      (this.input.parentElement || this.input).append(this.root);
      this.render();
      return true;
    }
    render() {
      const documentObject = this.input.ownerDocument;
      this.root.replaceChildren();
      const items = this.engine.list(NOTE_CONTEXT);
      if (!items.length) {
        const empty = documentObject.createElement("span");
        empty.className = "vgen-nya-preset-empty";
        empty.textContent = "暂无 Private Note 预设";
        this.root.append(empty);
        return;
      }
      for (const preset of items) {
        const button = documentObject.createElement("button");
        button.type = "button";
        button.className = "vgen-nya-preset-chip";
        button.dataset.presetId = preset.id;
        button.title = this.engine.preview(NOTE_CONTEXT, preset.id, 180);
        button.textContent = preset.name;
        button.setAttribute("aria-pressed", String(this.engine.selectedId(NOTE_CONTEXT) === String(preset.id)));
        this.root.append(button);
      }
    }
    async #click(event) {
      const button = event.target?.closest?.("button[data-preset-id]");
      if (!button || !this.root.contains(button)) return;
      let result = await this.engine.select(NOTE_CONTEXT, button.dataset.presetId, this.target);
      if (result.status === "requires-confirmation") {
        if (this.root.ownerDocument.defaultView?.confirm?.("Note 已有内容。确认替换吗？") !== true) return;
        result = await this.engine.select(NOTE_CONTEXT, button.dataset.presetId, this.target, { replace: true });
      }
      if (result.status === "filled") this.render();
    }
    unmount() {
      this.root?.removeEventListener("click", this.onClick);
      this.input?.removeEventListener("input", this.onInput);
      this.root?.remove();
      this.root = null;
    }
  };
  var OrderTextPresetRuntime = class {
    constructor({ engine, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, noteResolver = privateNoteInputs } = {}) {
      this.engine = engine;
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
      this.noteResolver = noteResolver;
      this.sessions = /* @__PURE__ */ new Map();
      this.observer = null;
      this.unsubscribe = null;
      this.style = null;
      this.mounted = false;
    }
    mount() {
      if (this.mounted || !this.documentObject?.body) return false;
      this.mounted = true;
      this.style = this.documentObject.createElement("style");
      this.style.dataset.vgenNyaUi = "order-preset-style";
      this.style.textContent = ORDER_PRESET_CSS;
      (this.documentObject.head || this.documentObject.body).append(this.style);
      this.scan(this.documentObject);
      this.unsubscribe = this.engine.subscribe(({ context }) => {
        if (context === NOTE_CONTEXT) for (const session of this.sessions.values()) session.render();
      });
      if (this.MutationObserverClass) {
        this.observer = new this.MutationObserverClass((records) => {
          for (const record of records) {
            for (const node of record.addedNodes || []) this.scan(node);
            for (const node of record.removedNodes || []) this.releaseRemoved(node);
          }
        });
        this.observer.observe(this.documentObject.body, { childList: true });
      }
      return true;
    }
    scan(root) {
      let mounted = 0;
      for (const input of this.noteResolver(root)) {
        if (this.sessions.has(input) || input.isConnected === false) continue;
        const session = new PrivateNoteSession({ input, engine: this.engine });
        session.mount();
        this.sessions.set(input, session);
        mounted += 1;
      }
      return mounted;
    }
    releaseRemoved(root) {
      for (const [input, session] of this.sessions) {
        if (input === root || root.contains?.(input) || !input.isConnected) {
          session.unmount();
          this.sessions.delete(input);
        }
      }
    }
    activate() {
    }
    unmount() {
      if (!this.mounted) return false;
      this.observer?.disconnect();
      this.observer = null;
      this.unsubscribe?.();
      this.unsubscribe = null;
      for (const session of this.sessions.values()) session.unmount();
      this.sessions.clear();
      this.style?.remove();
      this.style = null;
      this.mounted = false;
      return true;
    }
    dispose() {
      this.unmount();
    }
  };

  // src/order/order-config.js
  var DEFAULT_ORDER_SETTINGS = Object.freeze({
    copyButtons: true,
    clientBackground: true
  });
  function normalizeOrderSettings(value = {}) {
    const source = isPlainObject(value) ? value : {};
    return {
      copyButtons: source.copyButtons !== false,
      clientBackground: source.clientBackground !== false
    };
  }
  var OrderConfigRepository = class {
    #listeners = /* @__PURE__ */ new Set();
    constructor(store) {
      this.store = store;
    }
    read() {
      return normalizeOrderSettings(this.store.read(CONFIG_KEYS.orderSettings, DEFAULT_ORDER_SETTINGS));
    }
    write(value) {
      const next = normalizeOrderSettings(value);
      this.store.writeVerified(CONFIG_KEYS.orderSettings, next, isPlainObject);
      for (const listener of this.#listeners) listener({ domain: "order-settings", value: next });
      return next;
    }
    subscribe(listener) {
      this.#listeners.add(listener);
      return () => this.#listeners.delete(listener);
    }
  };

  // src/order/client-review-adapter.js
  var RESERVED_HANDLES = /* @__PURE__ */ new Set([
    "",
    "about",
    "artists",
    "authorize",
    "cart",
    "catalogue",
    "category",
    "challenge",
    "commission",
    "creator",
    "export",
    "for-artists",
    "login",
    "messages",
    "profile",
    "reviews",
    "settings",
    "signup",
    "support"
  ]);
  var REVIEW_SOURCE_STATES = Object.freeze({
    success: "SUCCESS",
    empty: "EMPTY",
    error: "ERROR",
    unavailable: "UNAVAILABLE"
  });
  var CLIENT_REVIEW_PAGE_LIMIT = 20;
  var CLIENT_REVIEW_MAX_PAGES = 5;
  var CLIENT_REVIEW_ENTRIES_ORIGIN = "https://api.vgen.co";
  function clientReviewEntriesUrl(clientUserId) {
    const id = String(clientUserId || "").trim();
    if (!/^[A-Za-z0-9-]{8,}$/.test(id)) return "";
    return `${CLIENT_REVIEW_ENTRIES_ORIGIN}/discoverability/reviews/client/${encodeURIComponent(id)}`;
  }
  function compact(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function normalizePublicHandle(value) {
    const handle = compact(value).replace(/^@/, "");
    if (!/^[A-Za-z0-9_-]+$/.test(handle) || RESERVED_HANDLES.has(handle.toLowerCase())) return "";
    return handle;
  }
  function canonicalProfileUrl(handle) {
    const normalized = normalizePublicHandle(handle);
    return normalized ? `https://vgen.co/${encodeURIComponent(normalized)}` : "";
  }
  function handleFromHref(href, baseUrl = "https://vgen.co/") {
    try {
      const url = new URL(href, baseUrl);
      if (url.origin !== "https://vgen.co") return "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return "";
      return normalizePublicHandle(decodeURIComponent(parts[0]));
    } catch {
      return "";
    }
  }
  function resolvePublicClientIdentity(panel) {
    if (!panel?.querySelectorAll) return null;
    for (const anchor of panel.querySelectorAll("a[href]")) {
      const href = anchor.href || anchor.getAttribute?.("href") || "";
      const handle = handleFromHref(href, panel.ownerDocument?.location?.href);
      if (!handle) continue;
      const label = compact(anchor.textContent);
      if (!label.startsWith("@") && !anchor.closest?.('[data-client], [class*="Client"], [class*="client"]')) continue;
      return {
        clientId: `@${handle}`,
        handle,
        profileUrl: canonicalProfileUrl(handle),
        mountTarget: anchor.closest?.('[data-client], [class*="Client"], [class*="client"]') || anchor.parentElement || panel
      };
    }
    return null;
  }
  function pickText(value, names) {
    for (const name of names) {
      const text = compact(value?.[name]);
      if (text) return text;
    }
    return "";
  }
  function normalizePublicReview(value) {
    const body = pickText(value, ["reviewText", "body", "text", "review", "comment", "content", "message"]);
    if (!body) return null;
    const reviewer = pickText(value, ["reviewer", "reviewerUsername", "username", "displayName"]);
    const date = pickText(value, ["date", "createdAt", "created", "submittedAt"]);
    const context = pickText(value, ["service", "serviceName", "context", "productName"]);
    let negative = null;
    let rating = null;
    let wouldRecommend = null;
    const recommend = value?.wouldRecommend ?? value?.recommend ?? value?.would_recommend;
    if (typeof recommend === "boolean") {
      wouldRecommend = recommend;
      negative = !recommend;
    } else {
      rating = Number(value?.rating ?? value?.score ?? value?.stars);
      if (Number.isFinite(rating) && rating >= 1 && rating <= 5) negative = rating < 5;
    }
    if (negative === null) return null;
    const review = { body, negative };
    if (rating !== null) review.rating = rating;
    if (wouldRecommend !== null) review.wouldRecommend = wouldRecommend;
    if (reviewer) review.reviewer = reviewer;
    if (date) review.date = date;
    if (context) review.context = context;
    return review;
  }
  function reviewCollections(root) {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 18 || seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (/^(?:reviews?|reviewItems|feedback)$/i.test(key) && Array.isArray(child)) found.push(child);
        else walk(child, depth + 1);
      }
    };
    walk(root);
    return found;
  }
  function normalizeReviewContext(raw, identity, now = Date.now()) {
    const collections = Array.isArray(raw) ? [raw] : reviewCollections(raw);
    if (!collections.length) return {
      state: REVIEW_SOURCE_STATES.unavailable,
      clientId: identity.clientId,
      profileUrl: identity.profileUrl,
      reviews: [],
      negativeReviews: [],
      fetchedAt: now
    };
    const sourceItems = collections.flat();
    const reviews = sourceItems.map(normalizePublicReview).filter(Boolean);
    if (sourceItems.length && reviews.length !== sourceItems.length) return {
      state: REVIEW_SOURCE_STATES.unavailable,
      clientId: identity.clientId,
      profileUrl: identity.profileUrl,
      reviews: [],
      negativeReviews: [],
      fetchedAt: now
    };
    const negativeReviews = reviews.filter((review) => review.negative);
    return {
      state: reviews.length ? REVIEW_SOURCE_STATES.success : REVIEW_SOURCE_STATES.empty,
      clientId: identity.clientId,
      profileUrl: identity.profileUrl,
      reviews,
      negativeReviews,
      negativeCount: negativeReviews.length,
      fetchedAt: now
    };
  }
  function scriptPayloads(documentObject) {
    const scripts = documentObject?.querySelectorAll?.('script[type="application/json"], script#__NEXT_DATA__') || [];
    const values = [];
    for (const script of scripts) {
      try {
        const value = JSON.parse(script.textContent || "");
        if (value && typeof value === "object") values.push(value);
      } catch {
      }
    }
    return values;
  }
  function extractReviewPayload(documentObject) {
    for (const value of scriptPayloads(documentObject)) {
      if (reviewCollections(value).length) return value;
    }
    return null;
  }
  function extractPagePayload(documentObject) {
    for (const value of scriptPayloads(documentObject)) {
      if (value?.props?.pageProps) return value;
    }
    return null;
  }
  function extractClientReviewSource(payload) {
    const user = payload?.props?.pageProps?.user;
    if (!user || typeof user !== "object") return null;
    const clientUserId = typeof user.userID === "string" ? user.userID.trim() : "";
    if (!clientUserId) return null;
    const clientReviewStats = user.clientReviewStats && typeof user.clientReviewStats === "object" ? user.clientReviewStats : null;
    return { clientUserId, clientReviewStats };
  }
  function normalizeReviewEntries(entries, identity, now = Date.now(), stats = null) {
    const list = Array.isArray(entries) ? entries : [];
    const reviews = list.map(normalizePublicReview).filter(Boolean);
    const totalReviews = Number(stats?.totalReviews);
    if (list.length && !reviews.length || !list.length && Number.isFinite(totalReviews) && totalReviews > 0) {
      return {
        state: REVIEW_SOURCE_STATES.unavailable,
        clientId: identity.clientId,
        profileUrl: identity.profileUrl,
        reviews: [],
        negativeReviews: [],
        negativeCount: 0,
        clientReviewStats: stats && typeof stats === "object" ? stats : null,
        fetchedAt: now
      };
    }
    const negativeReviews = reviews.filter((review) => review.negative);
    const totalNegative = Number(stats?.totalNegativeReviews);
    return {
      state: reviews.length ? REVIEW_SOURCE_STATES.success : REVIEW_SOURCE_STATES.empty,
      clientId: identity.clientId,
      profileUrl: identity.profileUrl,
      reviews,
      negativeReviews,
      negativeCount: Number.isFinite(totalNegative) ? totalNegative : negativeReviews.length,
      clientReviewStats: stats && typeof stats === "object" ? stats : null,
      fetchedAt: now
    };
  }
  var ClientReviewAdapter = class {
    constructor({ fetchImpl = globalThis.fetch, DOMParserClass = globalThis.DOMParser, now = () => Date.now() } = {}) {
      this.fetchImpl = fetchImpl;
      this.DOMParserClass = DOMParserClass;
      this.now = now;
    }
    resolveClient(panel) {
      return resolvePublicClientIdentity(panel);
    }
    async fetch(identity, { signal } = {}) {
      if (!identity?.clientId || !identity?.profileUrl) return normalizeReviewContext(null, identity || {}, this.now());
      if (typeof this.fetchImpl !== "function" || typeof this.DOMParserClass !== "function") {
        return normalizeReviewContext(null, identity, this.now());
      }
      const response = await this.fetchImpl(identity.profileUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "text/html" },
        signal
      });
      if (!response?.ok) throw new Error(`Public profile request failed (${response?.status || "unknown"})`);
      const documentObject = new this.DOMParserClass().parseFromString(await response.text(), "text/html");
      const source = extractClientReviewSource(extractPagePayload(documentObject));
      if (source?.clientUserId) {
        const entries = await this.#fetchReviewEntries(source.clientUserId, { signal });
        return normalizeReviewEntries(entries, { ...identity, clientUserId: source.clientUserId }, this.now(), source.clientReviewStats);
      }
      return normalizeReviewContext(extractReviewPayload(documentObject), identity, this.now());
    }
    async #fetchReviewEntries(clientUserId, { signal }) {
      const limit = CLIENT_REVIEW_PAGE_LIMIT;
      const entries = [];
      let offset = 0;
      for (let page = 0; page < CLIENT_REVIEW_MAX_PAGES; page += 1) {
        const url = `${clientReviewEntriesUrl(clientUserId)}?offset=${offset}&limit=${limit}`;
        const response = await this.fetchImpl(url, {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json", "v-client-id": "vgen-web" },
          signal
        });
        if (!response?.ok) throw new Error(`Public review entries request failed (${response?.status || "unknown"})`);
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error("Public review entries response was malformed");
        if (!items.length) break;
        entries.push(...items);
        if (items.length < limit) break;
        offset += limit;
      }
      return entries;
    }
  };

  // src/order/client-background-cache.js
  var CLIENT_BACKGROUND_TTL_MS = 6 * 60 * 60 * 1e3;
  var CLIENT_BACKGROUND_ERROR_TTL_MS = 2 * 60 * 1e3;
  var CLIENT_BACKGROUND_UNAVAILABLE_TTL_MS = 15 * 60 * 1e3;
  var ttlFor = (state) => state === REVIEW_SOURCE_STATES.error ? CLIENT_BACKGROUND_ERROR_TTL_MS : state === REVIEW_SOURCE_STATES.unavailable ? CLIENT_BACKGROUND_UNAVAILABLE_TTL_MS : CLIENT_BACKGROUND_TTL_MS;
  var ClientBackgroundCache = class {
    constructor({ now = () => Date.now() } = {}) {
      this.now = now;
      this.entries = /* @__PURE__ */ new Map();
      this.pending = /* @__PURE__ */ new Map();
    }
    key(identity) {
      return String(identity?.clientId || identity?.handle || "").trim().toLowerCase();
    }
    peek(identity) {
      const key = this.key(identity);
      const entry = this.entries.get(key);
      if (!entry || this.now() - entry.fetchedAt >= ttlFor(entry.state)) {
        if (entry) this.entries.delete(key);
        return null;
      }
      return { ...entry, fromCache: true };
    }
    async load(identity, loader) {
      const key = this.key(identity);
      if (!key) return {
        state: REVIEW_SOURCE_STATES.unavailable,
        clientId: "",
        profileUrl: "",
        reviews: [],
        negativeReviews: [],
        fetchedAt: this.now(),
        fromCache: false
      };
      const cached = this.peek(identity);
      if (cached) return cached;
      if (this.pending.has(key)) return this.pending.get(key);
      const operation = (async () => {
        try {
          const result = await loader();
          const entry = { ...result, fetchedAt: this.now(), fromCache: false };
          this.entries.set(key, entry);
          return { ...entry };
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          const entry = {
            state: REVIEW_SOURCE_STATES.error,
            clientId: identity.clientId,
            profileUrl: identity.profileUrl,
            reviews: [],
            negativeReviews: [],
            fetchedAt: this.now(),
            fromCache: false,
            error: String(error?.message || "Public review request failed")
          };
          this.entries.set(key, entry);
          return { ...entry };
        } finally {
          this.pending.delete(key);
        }
      })();
      this.pending.set(key, operation);
      return operation;
    }
    clear() {
      this.entries.clear();
      this.pending.clear();
    }
  };

  // src/order/order-detail-lifecycle.js
  var COMMISSION_ID = /\bCOMM#\s*[A-Z0-9]{8,16}\b/i;
  var COMMISSION_MODAL_SELECTOR = '[class*="CommissionModal__Container"]';
  var COMMISSION_CARD_SELECTOR = '[class*="commissionCardContainer"], [class*="CommissionCard"], a[href*="commission"]';
  function defaultOrderPanelResolver(root) {
    if (!root?.querySelectorAll) return null;
    const modal = root.matches?.(COMMISSION_MODAL_SELECTOR) ? root : root.querySelector?.(COMMISSION_MODAL_SELECTOR) || root.querySelector?.("#commissionSideColumn")?.closest?.(COMMISSION_MODAL_SELECTOR);
    const candidate = modal || (COMMISSION_ID.test(String(root.textContent || "")) ? root : null);
    return candidate && resolvePublicClientIdentity(candidate) ? candidate : null;
  }
  var OrderDetailLifecycle = class {
    constructor({ documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, panelResolver = defaultOrderPanelResolver, identityResolver = resolvePublicClientIdentity, clock = globalThis } = {}) {
      this.documentObject = documentObject;
      this.MutationObserverClass = MutationObserverClass;
      this.panelResolver = panelResolver;
      this.identityResolver = identityResolver;
      this.clock = clock;
      this.listeners = /* @__PURE__ */ new Set();
      this.observer = null;
      this.panelObserver = null;
      this.panel = null;
      this.identity = null;
      this.probes = /* @__PURE__ */ new Map();
      this.scanTimers = /* @__PURE__ */ new Set();
      this.onDocumentClick = (event) => {
        if (event.target?.closest?.(COMMISSION_CARD_SELECTOR)) this.#schedulePortalScan();
      };
      this.mounted = false;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      if (this.panel && this.identity) listener({ type: "open", panel: this.panel, identity: this.identity });
      return () => this.listeners.delete(listener);
    }
    mount() {
      if (this.mounted || !this.documentObject?.body) return false;
      this.mounted = true;
      for (const child of this.documentObject.body.children || []) if (this.#consider(child)) break;
      if (this.MutationObserverClass) {
        this.observer = new this.MutationObserverClass((records) => {
          for (const record of records) {
            for (const node of record.removedNodes || []) {
              this.#releaseProbe(node);
              if (node === this.panel || node.contains?.(this.panel) || this.panel?.isConnected === false) this.#close();
            }
            for (const node of record.addedNodes || []) if (!this.#consider(node)) this.#probe(node);
          }
        });
        this.observer.observe(this.documentObject.body, { childList: true });
      }
      this.documentObject.addEventListener?.("click", this.onDocumentClick, true);
      return true;
    }
    #schedulePortalScan() {
      this.#releaseScanTimers();
      for (const delay of [0, 80, 250, 700, 1500]) {
        const timer = this.clock.setTimeout(() => {
          this.scanTimers.delete(timer);
          if (this.panel || this.#scanPortals()) this.#releaseScanTimers();
        }, delay);
        this.scanTimers.add(timer);
      }
    }
    #scanPortals() {
      for (const child of this.documentObject.body.children || []) {
        if (!child.matches?.(".ReactModalPortal") && !child.matches?.(COMMISSION_MODAL_SELECTOR)) continue;
        if (this.#consider(child)) return true;
      }
      return false;
    }
    #releaseScanTimers() {
      for (const timer of this.scanTimers) this.clock.clearTimeout(timer);
      this.scanTimers.clear();
    }
    #consider(root) {
      const panel = this.panelResolver(root);
      if (!panel) return false;
      const identity = this.identityResolver(panel);
      if (!identity) return false;
      if (panel !== this.panel) {
        this.#close();
        this.panel = panel;
        this.identity = identity;
        this.#observePanel();
        this.#releaseProbes();
        this.#releaseScanTimers();
        this.#emit("open");
      } else if (identity.clientId !== this.identity?.clientId || identity.mountTarget !== this.identity?.mountTarget) {
        this.identity = identity;
        this.#emit("change");
      }
      return true;
    }
    #observePanel() {
      if (!this.MutationObserverClass || !this.panel) return;
      this.panelObserver = new this.MutationObserverClass(() => {
        if (!this.panel || this.panel.isConnected === false) {
          this.#close();
          if (this.mounted) this.#schedulePortalScan();
          return;
        }
        const identity = this.identityResolver(this.panel);
        if (identity && (identity.clientId !== this.identity?.clientId || identity.mountTarget !== this.identity?.mountTarget)) {
          this.identity = identity;
          this.#emit("change");
        }
      });
      this.panelObserver.observe(this.panel, { childList: true, subtree: true });
    }
    #emit(type) {
      const event = { type, panel: this.panel, identity: this.identity };
      for (const listener of this.listeners) listener(event);
    }
    #probe(root) {
      if (!root?.querySelector || !this.MutationObserverClass || this.probes.has(root) || this.probes.size >= 12) return false;
      const observer = new this.MutationObserverClass(() => {
        if (root.isConnected === false) this.#releaseProbe(root);
        else if (this.#consider(root)) this.#releaseProbes();
      });
      observer.observe(root, { childList: true, subtree: true });
      const timer = globalThis.setTimeout(() => this.#releaseProbe(root), 8e3);
      this.probes.set(root, { observer, timer });
      return true;
    }
    #releaseProbe(root) {
      for (const [candidate, entry] of this.probes) {
        if (candidate !== root && !root?.contains?.(candidate)) continue;
        entry.observer.disconnect();
        globalThis.clearTimeout(entry.timer);
        this.probes.delete(candidate);
      }
    }
    #releaseProbes() {
      for (const [root, entry] of this.probes) {
        entry.observer.disconnect();
        globalThis.clearTimeout(entry.timer);
        this.probes.delete(root);
      }
    }
    #close() {
      if (!this.panel) return false;
      const previous = { panel: this.panel, identity: this.identity };
      this.panelObserver?.disconnect();
      this.panelObserver = null;
      this.panel = null;
      this.identity = null;
      for (const listener of this.listeners) listener({ type: "close", ...previous });
      return true;
    }
    activate() {
    }
    unmount() {
      if (!this.mounted) return false;
      this.observer?.disconnect();
      this.observer = null;
      this.documentObject.removeEventListener?.("click", this.onDocumentClick, true);
      this.#releaseProbes();
      this.#releaseScanTimers();
      this.#close();
      this.mounted = false;
      return true;
    }
    dispose() {
      this.unmount();
      this.listeners.clear();
    }
  };

  // src/order/order-assistant.js
  var ORDER_ASSISTANT_CSS = `
.vgen-nya-order-assistant{margin:8px 0;padding:8px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:9px;background:color-mix(in srgb,currentColor 5%,transparent);color:inherit;font:12px/1.45 system-ui,sans-serif;max-width:100%;position:relative}
.vgen-nya-order-assistant__tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.vgen-nya-order-assistant button{border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;padding:5px 8px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font:inherit;cursor:pointer}.vgen-nya-order-assistant button:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
.vgen-nya-order-assistant__status{opacity:.72}.vgen-nya-order-assistant__warning{border-color:#d97706!important;background:#f59e0b22!important;color:inherit;font-weight:650}.vgen-nya-order-assistant__error{color:#b42318}
.vgen-nya-order-assistant__popover{margin-top:8px;padding:9px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:8px;background:Canvas;color:CanvasText;box-shadow:0 8px 24px #0003;max-height:320px;overflow:auto}.vgen-nya-order-assistant__popover[hidden]{display:none}.vgen-nya-order-assistant__popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.vgen-nya-order-assistant__review{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent)}.vgen-nya-order-assistant__review:first-of-type{border-top:0}.vgen-nya-order-assistant__review-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;opacity:.75}.vgen-nya-order-assistant__review-body{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;cursor:text}
`;
  function make9(documentObject, tagName, className = "", text = "") {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function control(documentObject, text, action) {
    const button = make9(documentObject, "button", "notranslate", text);
    button.type = "button";
    button.translate = false;
    button.dataset.action = action;
    return button;
  }
  function reviewLabel(review) {
    if (review.wouldRecommend === false) return "不推荐";
    if (review.wouldRecommend === true) return "推荐";
    if (Number.isFinite(review.rating)) return `${review.rating}★${review.rating < 5 ? " · 不推荐" : ""}`;
    return "不推荐";
  }
  var OrderAssistantSession = class {
    constructor({ panel, identity, settings, adapter, cache, clipboard, AbortControllerClass = globalThis.AbortController } = {}) {
      this.panel = panel;
      this.identity = identity;
      this.settings = settings;
      this.adapter = adapter;
      this.cache = cache;
      this.clipboard = clipboard;
      this.AbortControllerClass = AbortControllerClass;
      this.root = null;
      this.popover = null;
      this.result = null;
      this.abortController = null;
      this.operation = 0;
      this.feedbackTimers = /* @__PURE__ */ new Set();
      this.mounted = false;
    }
    mount() {
      if (this.mounted) return false;
      this.mounted = true;
      const documentObject = this.panel.ownerDocument;
      this.root = make9(documentObject, "section", "vgen-nya-order-assistant");
      this.root.dataset.vgenNyaUi = "order-assistant";
      this.root.setAttribute("aria-label", "Client Background");
      (this.identity.mountTarget || this.panel).append(this.root);
      this.render();
      if (this.settings.clientBackground) void this.loadBackground();
      return true;
    }
    render() {
      if (!this.root) return;
      const documentObject = this.root.ownerDocument;
      this.root.replaceChildren();
      const tools = make9(documentObject, "div", "vgen-nya-order-assistant__tools");
      if (this.settings.copyButtons) {
        const copyId = control(documentObject, "Copy ID", "copy-id");
        const copyUrl = control(documentObject, "Copy Profile URL", "copy-url");
        copyId.addEventListener("click", () => void this.copy(this.identity.clientId, copyId));
        copyUrl.addEventListener("click", () => void this.copy(this.identity.profileUrl, copyUrl));
        tools.append(copyId, copyUrl);
      }
      if (this.settings.clientBackground) this.#renderBackgroundControl(tools);
      this.root.append(tools);
      if (this.result && [REVIEW_SOURCE_STATES.success, REVIEW_SOURCE_STATES.empty].includes(this.result.state)) {
        this.popover = this.#createPopover();
        this.root.append(this.popover);
      } else this.popover = null;
    }
    #renderBackgroundControl(tools) {
      const documentObject = tools.ownerDocument;
      if (!this.result) {
        tools.append(make9(documentObject, "span", "vgen-nya-order-assistant__status notranslate", "Client Background: loading…"));
        return;
      }
      if (this.result.state === REVIEW_SOURCE_STATES.error) {
        tools.append(make9(documentObject, "span", "vgen-nya-order-assistant__status vgen-nya-order-assistant__error notranslate", "公开评价加载失败"));
        return;
      }
      if (this.result.state === REVIEW_SOURCE_STATES.unavailable) {
        tools.append(make9(documentObject, "span", "vgen-nya-order-assistant__status notranslate", "公开评价不可用"));
        return;
      }
      if (this.result.state === REVIEW_SOURCE_STATES.empty) {
        tools.append(make9(documentObject, "span", "vgen-nya-order-assistant__status notranslate", "暂无公开评价"));
        return;
      }
      const negativeCount = Number.isFinite(this.result.negativeCount) ? this.result.negativeCount : this.result.negativeReviews.length;
      const trigger = control(documentObject, negativeCount ? `存在 ${negativeCount} 条不推荐的公开评价` : `查看公开评价 (${this.result.reviews.length})`, "toggle-reviews");
      if (negativeCount) trigger.classList.add("vgen-nya-order-assistant__warning");
      trigger.addEventListener("click", () => {
        if (this.popover) this.popover.hidden = !this.popover.hidden;
      });
      tools.append(trigger);
    }
    #createPopover() {
      const documentObject = this.root.ownerDocument;
      const popover = make9(documentObject, "div", "vgen-nya-order-assistant__popover");
      popover.hidden = true;
      const header = make9(documentObject, "div", "vgen-nya-order-assistant__popover-head");
      const title = make9(documentObject, "strong", "notranslate", this.result.negativeReviews.length ? "不推荐的公开评价" : "公开评价");
      title.translate = false;
      const close = control(documentObject, "Close", "close-reviews");
      close.addEventListener("click", () => {
        popover.hidden = true;
      });
      header.append(title, close);
      popover.append(header);
      const reviews = this.result.negativeReviews.length ? this.result.negativeReviews : this.result.reviews;
      for (const review of reviews) {
        const article = make9(documentObject, "article", "vgen-nya-order-assistant__review");
        const meta = make9(documentObject, "div", "vgen-nya-order-assistant__review-meta");
        const label = make9(documentObject, "strong", "notranslate", reviewLabel(review));
        label.translate = false;
        meta.append(label);
        for (const value of [review.reviewer, review.date, review.context].filter(Boolean)) meta.append(make9(documentObject, "span", "", value));
        const body = make9(documentObject, "p", "vgen-nya-order-assistant__review-body", review.body);
        body.translate = true;
        const copy = control(documentObject, "Copy", "copy-review");
        copy.addEventListener("click", () => void this.copy(review.body, copy));
        article.append(meta, body, copy);
        popover.append(article);
      }
      return popover;
    }
    async copy(value, button) {
      if (!value) return false;
      const original = button.textContent;
      try {
        await this.clipboard.writeText(value);
        button.textContent = "Copied";
        return true;
      } catch {
        button.textContent = "Copy failed";
        return false;
      } finally {
        const expected = button.textContent;
        const timer = globalThis.setTimeout(() => {
          this.feedbackTimers.delete(timer);
          if (button.isConnected !== false && button.textContent === expected) button.textContent = original;
        }, 1200);
        this.feedbackTimers.add(timer);
      }
    }
    async loadBackground() {
      const operation = ++this.operation;
      this.abortController?.abort("superseded");
      this.abortController = this.AbortControllerClass ? new this.AbortControllerClass() : null;
      try {
        const result = await this.cache.load(this.identity, () => this.adapter.fetch(this.identity, { signal: this.abortController?.signal }));
        if (!this.mounted || operation !== this.operation) return;
        this.result = result;
        this.render();
      } catch (error) {
        if (error?.name !== "AbortError" && this.mounted && operation === this.operation) {
          this.result = { state: REVIEW_SOURCE_STATES.error, reviews: [], negativeReviews: [], error: String(error?.message || error) };
          this.render();
        }
      }
    }
    unmount() {
      if (!this.mounted) return false;
      this.mounted = false;
      this.operation += 1;
      this.abortController?.abort("order-session-closed");
      this.abortController = null;
      for (const timer of this.feedbackTimers) globalThis.clearTimeout(timer);
      this.feedbackTimers.clear();
      this.root?.remove();
      this.root = null;
      this.popover = null;
      this.result = null;
      return true;
    }
  };
  var OrderAssistantRuntime = class {
    constructor({ repository, clipboard, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapter, cache, detailLifecycle, AbortControllerClass = globalThis.AbortController } = {}) {
      this.repository = repository;
      this.clipboard = clipboard;
      this.documentObject = documentObject;
      this.adapter = adapter || new ClientReviewAdapter({ fetchImpl: globalThis.fetch?.bind(globalThis), DOMParserClass: documentObject?.defaultView?.DOMParser || globalThis.DOMParser });
      this.cache = cache || new ClientBackgroundCache();
      this.detailLifecycle = detailLifecycle || new OrderDetailLifecycle({ documentObject, MutationObserverClass, identityResolver: (panel) => this.adapter.resolveClient(panel) });
      this.AbortControllerClass = AbortControllerClass;
      this.current = null;
      this.session = null;
      this.unsubscribeDetail = null;
      this.unsubscribeSettings = null;
      this.style = null;
      this.mounted = false;
    }
    mount() {
      if (this.mounted || !this.documentObject?.body) return false;
      this.mounted = true;
      this.style = this.documentObject.createElement("style");
      this.style.dataset.vgenNyaUi = "order-assistant-style";
      this.style.textContent = ORDER_ASSISTANT_CSS;
      (this.documentObject.head || this.documentObject.body).append(this.style);
      this.unsubscribeDetail = this.detailLifecycle.subscribe((event) => this.#onDetail(event));
      this.unsubscribeSettings = this.repository.subscribe(() => this.#sync());
      this.detailLifecycle.mount();
      return true;
    }
    #onDetail(event) {
      if (event.type === "close") {
        this.current = null;
        this.#releaseSession();
        return;
      }
      this.current = { panel: event.panel, identity: event.identity };
      this.#sync();
    }
    #sync() {
      this.#releaseSession();
      if (!this.current) return;
      const settings = this.repository.read();
      if (!settings.copyButtons && !settings.clientBackground) return;
      this.session = new OrderAssistantSession({
        ...this.current,
        settings,
        adapter: this.adapter,
        cache: this.cache,
        clipboard: this.clipboard,
        AbortControllerClass: this.AbortControllerClass
      });
      this.session.mount();
    }
    #releaseSession() {
      this.session?.unmount();
      this.session = null;
    }
    activate() {
    }
    unmount() {
      if (!this.mounted) return false;
      this.unsubscribeDetail?.();
      this.unsubscribeDetail = null;
      this.unsubscribeSettings?.();
      this.unsubscribeSettings = null;
      this.detailLifecycle.unmount();
      this.#releaseSession();
      this.current = null;
      this.style?.remove();
      this.style = null;
      this.mounted = false;
      return true;
    }
    dispose() {
      this.unmount();
      this.detailLifecycle.dispose();
      this.cache.clear();
    }
  };

  // src/review/default-system-prompt.js
  var DEFAULT_SYSTEM_PROMPT = [
    "You are a professional review-writing assistant for VGen, a commission marketplace.",
    "",
    "Write a natural, concise commission review that matches the requested sentiment degree.",
    "",
    "Rules:",
    '- Respond with a single JSON object of the shape {"english": "...", "chinese": "..."} and nothing else.',
    '- "english" is the final submit-ready English review.',
    `- "chinese" is a faithful Chinese translation for the user's reference only; it is never submitted.`,
    "- Keep every degree professional and submit-ready. Degrees 1-2 stay respectful, constructive and fair; never abusive, insulting, or overly emotional.",
    "- Degree 3 is neutral and balanced (mixed feedback). Degrees 4-5 are increasingly positive.",
    "- Do not invent facts, names, project details, or specifics beyond the supplied context.",
    "- Use only the supplied keywords/notes as the review's basis.",
    "- No markdown formatting unless explicitly required."
  ].join("\n");

  // src/review/review-config.js
  var REVIEW_LENGTHS = Object.freeze(["Short", "Medium", "Long"]);
  var REVIEW_STAR_DEGREES = Object.freeze([1, 2, 3, 4, 5]);
  var DEFAULT_REVIEW_PROVIDER = Object.freeze({
    baseUrl: "",
    apiKey: "",
    model: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });
  var DEFAULT_REVIEW_SETTINGS = Object.freeze({
    defaultLength: "Medium",
    defaultStarDegree: 3
  });
  var string2 = (value, maximum = Infinity) => typeof value === "string" ? value.slice(0, maximum) : "";
  var clampDegree = (value) => {
    const degree = Number(value);
    return Number.isInteger(degree) && degree >= 1 && degree <= 5 ? degree : DEFAULT_REVIEW_SETTINGS.defaultStarDegree;
  };
  function normalizeReviewProviderConfig(value = {}) {
    const source = isPlainObject(value) ? value : {};
    return {
      baseUrl: string2(source.baseUrl, 2048).trim(),
      apiKey: string2(source.apiKey, 4096).trim(),
      model: string2(source.model, 512).trim(),
      systemPrompt: string2(source.systemPrompt, 16e3).trim() || DEFAULT_SYSTEM_PROMPT
    };
  }
  function normalizeReviewSettings(value = {}) {
    const source = isPlainObject(value) ? value : {};
    const defaultLength = REVIEW_LENGTHS.includes(source.defaultLength) ? source.defaultLength : DEFAULT_REVIEW_SETTINGS.defaultLength;
    return {
      defaultLength,
      defaultStarDegree: clampDegree(source.defaultStarDegree)
    };
  }
  function isReviewProviderConfigured(provider) {
    return Boolean(provider?.baseUrl && provider?.apiKey && provider?.model);
  }
  function maskApiKey(apiKey) {
    const key = String(apiKey ?? "");
    if (!key) return "";
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  }
  var ReviewConfigRepository = class {
    constructor(store) {
      this.store = store;
      this.listeners = /* @__PURE__ */ new Set();
    }
    read() {
      return {
        provider: normalizeReviewProviderConfig(this.store.read(CONFIG_KEYS.reviewProvider, DEFAULT_REVIEW_PROVIDER)),
        settings: normalizeReviewSettings(this.store.read(CONFIG_KEYS.reviewSettings, DEFAULT_REVIEW_SETTINGS))
      };
    }
    writeProvider(value) {
      return this.#write(CONFIG_KEYS.reviewProvider, normalizeReviewProviderConfig(value), "review-provider");
    }
    writeSettings(value) {
      return this.#write(CONFIG_KEYS.reviewSettings, normalizeReviewSettings(value), "review-settings");
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    #write(key, value, domain) {
      const stored = this.store.writeVerified(key, value, isPlainObject);
      for (const listener of this.listeners) listener({ domain, value: cloneStorageValue(stored) });
      return stored;
    }
  };

  // src/review/provider-transport.js
  function requestError(message) {
    return Object.assign(new Error(message), { name: "Error" });
  }
  function abortError2() {
    return Object.assign(new Error("Provider request aborted"), { name: "AbortError" });
  }
  function timeoutError() {
    return Object.assign(new Error("Provider request timed out"), { name: "TimeoutError" });
  }
  function responseFromGm(response) {
    const status = Number(response?.status) || 0;
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return JSON.parse(String(response?.responseText ?? "null"));
      },
      async text() {
        return String(response?.responseText ?? "");
      }
    };
  }
  var FetchProviderTransport = class {
    constructor({ fetchImpl = globalThis.fetch } = {}) {
      this.fetchImpl = fetchImpl;
    }
    request(url, options) {
      if (typeof this.fetchImpl !== "function") return Promise.reject(requestError("Fetch is unavailable"));
      return this.fetchImpl(url, options);
    }
  };
  var GMProviderTransport = class {
    constructor({ gmRequest } = {}) {
      if (typeof gmRequest !== "function") throw new TypeError("GMProviderTransport requires GM_xmlhttpRequest");
      this.gmRequest = gmRequest;
    }
    request(url, options = {}) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn, value) => {
          if (settled) return;
          settled = true;
          fn(value);
        };
        const request = this.gmRequest({
          method: options.method || "POST",
          url,
          headers: options.headers || {},
          data: options.body,
          onload: (response) => settle(resolve, responseFromGm(response)),
          onerror: (error) => settle(reject, requestError(`Provider request failed: ${String(error?.error || error || "network error")}`)),
          ontimeout: () => settle(reject, timeoutError()),
          onabort: () => settle(reject, abortError2())
        });
        const signal = options.signal;
        const abort = () => request?.abort?.();
        if (signal?.aborted) abort();
        else if (signal) signal.addEventListener?.("abort", abort, { once: true });
      });
    }
  };
  function createProviderTransport({ gm = globalThis, fetchImpl = globalThis.fetch } = {}) {
    const gmRequest = gm?.GM_xmlhttpRequest;
    if (typeof gmRequest === "function") return new GMProviderTransport({ gmRequest });
    return new FetchProviderTransport({ fetchImpl });
  }

  // src/review/review-provider-adapter.js
  var REVIEW_PROVIDER_ERRORS = Object.freeze({
    notConfigured: "PROVIDER_NOT_CONFIGURED",
    network: "NETWORK_ERROR",
    timeout: "TIMEOUT",
    aborted: "ABORTED",
    auth: "AUTH_ERROR",
    rateLimit: "RATE_LIMIT",
    http: "HTTP_ERROR",
    invalidJson: "INVALID_JSON",
    malformed: "MALFORMED_OUTPUT"
  });
  var ReviewProviderError = class extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "ReviewProviderError";
      this.code = code;
      this.details = details;
    }
  };
  var LENGTH_GUIDE = Object.freeze({
    Short: "one to two sentences",
    Medium: "a short paragraph (three to four sentences)",
    Long: "a detailed paragraph (five or more sentences)"
  });
  var STAR_DEGREE_GUIDE = Object.freeze({
    1: "mildly critical but respectful, constructive and fair",
    2: "slightly critical, noting minor issues fairly",
    3: "neutral and balanced, mixed feedback",
    4: "positive and appreciative",
    5: "strongly positive and enthusiastic"
  });
  var LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
  function normalizeProviderBaseUrl(value) {
    const base = String(value ?? "").trim();
    if (!base) return "";
    let url;
    try {
      url = new URL(base);
    } catch {
      return "";
    }
    const protocol = url.protocol.toLowerCase();
    if (protocol !== "https:" && !(protocol === "http:" && LOCAL_HOSTS.test(url.hostname))) return "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
  function buildChatCompletionsUrl(baseUrl) {
    const base = normalizeProviderBaseUrl(baseUrl);
    return base ? `${base}/chat/completions` : "";
  }
  function buildReviewUserPrompt({ keywords = [], length = "Medium", starDegree = 3, distinctFromRecent = false } = {}) {
    const lines = [
      "Write a commission review with these parameters:",
      `- Length: ${length} (${LENGTH_GUIDE[length] || LENGTH_GUIDE.Medium})`,
      `- Sentiment degree: ${starDegree} of 5 (${STAR_DEGREE_GUIDE[starDegree] || STAR_DEGREE_GUIDE[3]})`
    ];
    const list = Array.isArray(keywords) ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean) : [];
    if (list.length) lines.push(`- Keywords/notes to incorporate: ${list.join(", ")}`);
    if (distinctFromRecent) lines.push("- Phrase this differently from any wording you have produced before for this session.");
    lines.push('Return only the JSON object {"english": "...", "chinese": "..."}.');
    return lines.join("\n");
  }
  function stripCodeFence(text) {
    const trimmed = String(text ?? "").trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : trimmed;
  }
  function parseReviewPayload(content) {
    const text = stripCodeFence(content);
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, code: REVIEW_PROVIDER_ERRORS.invalidJson, reason: "invalid-json" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, code: REVIEW_PROVIDER_ERRORS.malformed, reason: "not-an-object" };
    }
    const english = typeof value.english === "string" ? value.english.trim() : "";
    const chinese = typeof value.chinese === "string" ? value.chinese.trim() : "";
    if (!english) return { ok: false, code: REVIEW_PROVIDER_ERRORS.malformed, reason: "missing-english" };
    if (!chinese) return { ok: false, code: REVIEW_PROVIDER_ERRORS.malformed, reason: "missing-chinese" };
    return { ok: true, english, chinese };
  }
  function errorFromStatus(status) {
    if (status === 401 || status === 403) return REVIEW_PROVIDER_ERRORS.auth;
    if (status === 429) return REVIEW_PROVIDER_ERRORS.rateLimit;
    if (status >= 500) return REVIEW_PROVIDER_ERRORS.http;
    return REVIEW_PROVIDER_ERRORS.http;
  }
  var ReviewProviderAdapter = class {
    constructor({ transport, fetchImpl, AbortControllerClass = globalThis.AbortController, timeoutMs = 3e4, now = () => Date.now() } = {}) {
      this.transport = transport || new FetchProviderTransport({ fetchImpl: fetchImpl || globalThis.fetch });
      this.AbortControllerClass = AbortControllerClass;
      this.timeoutMs = timeoutMs;
      this.now = now;
    }
    async generate({ config, keywords = [], length = "Medium", starDegree = 3, distinctFromRecent = false, signal } = {}) {
      if (!config || !isReviewProviderConfigured(config)) {
        throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.notConfigured, "Provider not configured");
      }
      const url = buildChatCompletionsUrl(config.baseUrl);
      if (!url) throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.notConfigured, "Provider base URL is invalid");
      const body = {
        model: config.model,
        messages: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: buildReviewUserPrompt({ keywords, length, starDegree, distinctFromRecent }) }
        ],
        temperature: 0.9,
        response_format: { type: "json_object" }
      };
      const response = await this.#fetchJson(url, config, body, signal);
      const content = response?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.malformed, "Provider returned no message content");
      }
      const parsed = parseReviewPayload(content);
      if (!parsed.ok) {
        throw new ReviewProviderError(parsed.code, `Provider output was not a valid review (${parsed.reason})`, { reason: parsed.reason });
      }
      return { english: parsed.english, chinese: parsed.chinese };
    }
    async #fetchJson(url, config, body, signal) {
      const controller = this.AbortControllerClass ? new this.AbortControllerClass() : null;
      const onAbort = () => controller?.abort(signal?.reason ?? "review-generation-cancelled");
      if (signal?.aborted) controller?.abort(signal.reason);
      else if (signal) signal.addEventListener?.("abort", onAbort, { once: true });
      const timer = typeof setTimeout === "function" ? setTimeout(() => controller?.abort("timeout"), this.timeoutMs) : null;
      let response;
      try {
        response = await this.transport.request(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller?.signal
        });
      } catch (error) {
        if (error?.name === "AbortError" || error?.name === "TimeoutError") {
          throw new ReviewProviderError(
            signal?.aborted ? REVIEW_PROVIDER_ERRORS.aborted : REVIEW_PROVIDER_ERRORS.timeout,
            signal?.aborted ? "Generation was cancelled" : "Provider request timed out"
          );
        }
        throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.network, "Provider request failed", { cause: String(error?.message || error) });
      } finally {
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
      }
      if (!response?.ok) {
        const status = Number(response.status) || 0;
        throw new ReviewProviderError(errorFromStatus(status), `Provider request failed (HTTP ${status})`, { status });
      }
      try {
        return await response.json();
      } catch {
        throw new ReviewProviderError(REVIEW_PROVIDER_ERRORS.malformed, "Provider returned an invalid JSON body");
      }
    }
  };

  // src/review/review-candidate.js
  var FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  var FNV_PRIME = 0x100001b3n;
  function normalizeEnglishForHash(english) {
    return String(english ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function reviewEnglishHash(english) {
    const normalized = normalizeEnglishForHash(english);
    let hash = FNV_OFFSET_BASIS;
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= BigInt(normalized.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * FNV_PRIME);
    }
    return hash.toString(16).padStart(16, "0");
  }
  function normalizeReviewCandidate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const english = typeof value.english === "string" ? value.english.trim() : "";
    if (!english) return null;
    const candidate = {
      english,
      chinese: typeof value.chinese === "string" ? value.chinese.trim() : "",
      keywords: Array.isArray(value.keywords) ? value.keywords.map((keyword) => String(keyword)).filter(Boolean) : typeof value.keywords === "string" && value.keywords.trim() ? [value.keywords.trim()] : []
    };
    if (value.length) candidate.length = value.length;
    if (Number.isFinite(value.starDegree)) candidate.starDegree = value.starDegree;
    if (value.generatedAt) candidate.generatedAt = value.generatedAt;
    if (value.duplicate) candidate.duplicate = true;
    candidate.hash = reviewEnglishHash(english);
    return candidate;
  }

  // src/review/review-session.js
  var REVIEW_SESSION_STATES = Object.freeze({
    idle: "idle",
    generating: "generating",
    ready: "ready",
    error: "error"
  });
  var MAX_DEDUPE_RETRIES = 1;
  var ReviewSession = class {
    constructor({ sessionId, adapter, history, providerRepository, AbortControllerClass = globalThis.AbortController, now = () => Date.now() } = {}) {
      this.sessionId = sessionId;
      this.adapter = adapter;
      this.history = history;
      this.providerRepository = providerRepository;
      this.AbortControllerClass = AbortControllerClass;
      this.now = now;
      this.state = REVIEW_SESSION_STATES.idle;
      this.candidate = null;
      this.error = null;
      this.lock = false;
      this.generated = false;
      this.operation = 0;
      this.abortController = null;
      this.listeners = /* @__PURE__ */ new Set();
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    get snapshot() {
      return {
        sessionId: this.sessionId,
        state: this.state,
        candidate: this.candidate,
        error: this.error,
        generated: this.generated,
        generating: this.lock
      };
    }
    isGenerating() {
      return this.lock;
    }
    async generate({ keywords = [], length = "Medium", starDegree = 3 } = {}) {
      if (this.lock) return false;
      const config = this.providerRepository.read().provider;
      if (!isReviewProviderConfigured(config)) {
        this.state = REVIEW_SESSION_STATES.error;
        this.error = { code: "PROVIDER_NOT_CONFIGURED", message: "Provider not configured" };
        this.#emit();
        return false;
      }
      this.lock = true;
      this.state = REVIEW_SESSION_STATES.generating;
      this.error = null;
      this.#emit();
      const operation = ++this.operation;
      const controller = this.AbortControllerClass ? new this.AbortControllerClass() : null;
      this.abortController = controller;
      try {
        let result = await this.adapter.generate({ config, keywords, length, starDegree, signal: controller?.signal });
        if (operation !== this.operation) return false;
        for (let attempt = 0; attempt < MAX_DEDUPE_RETRIES && this.history.has(result.english); attempt += 1) {
          result = await this.adapter.generate({ config, keywords, length, starDegree, distinctFromRecent: true, signal: controller?.signal });
          if (operation !== this.operation) return false;
        }
        const candidate = normalizeReviewCandidate({
          ...result,
          keywords,
          length,
          starDegree,
          generatedAt: this.now(),
          duplicate: this.history.has(result.english)
        });
        if (!candidate) throw Object.assign(new Error("Provider produced an empty review"), { code: "MALFORMED_OUTPUT" });
        this.history.record(candidate.english);
        this.candidate = candidate;
        this.generated = true;
        this.state = REVIEW_SESSION_STATES.ready;
        this.#emit();
        return true;
      } catch (error) {
        if (operation !== this.operation) return false;
        this.lock = false;
        this.abortController = null;
        this.state = REVIEW_SESSION_STATES.error;
        this.error = { code: error?.code || "UNKNOWN", message: error?.message || String(error) };
        this.#emit();
        return false;
      } finally {
        if (operation === this.operation) {
          this.lock = false;
          this.abortController = null;
        }
      }
    }
    async regenerate(params = {}) {
      return this.generate(params);
    }
    dispose(reason = "review-session-closed") {
      this.operation += 1;
      this.abortController?.abort(reason);
      this.abortController = null;
      this.lock = false;
      this.listeners.clear();
    }
    #emit() {
      const snapshot = this.snapshot;
      for (const listener of this.listeners) listener(snapshot);
    }
  };

  // src/review/review-editor-adapter.js
  var ReviewEditorTarget = class {
    constructor(element2) {
      if (!element2) throw new TypeError("Review editor target requires an element");
      this.element = element2;
      this.native = new NativeTextTarget(element2);
    }
    read() {
      return this.native.read();
    }
    async fill(text, { replace = false } = {}) {
      return this.native.fillText(text, { replace });
    }
  };
  function defaultReviewEditorDetect(root) {
    if (!root?.querySelectorAll) return null;
    if (root.matches?.("textarea")) return root;
    const textarea = root.querySelector("textarea");
    if (textarea) return textarea;
    const editable = root.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
    if (editable) return editable;
    return null;
  }
  var ReviewEditorAdapter = class {
    constructor({ detect = defaultReviewEditorDetect } = {}) {
      this.detect = detect;
    }
    resolve(root) {
      const element2 = this.detect(root);
      return element2 ? new ReviewEditorTarget(element2) : null;
    }
  };

  // src/review/review-history.js
  var REVIEW_HISTORY_LIMIT = 12;
  var RecentReviewHistory = class {
    constructor({ limit = REVIEW_HISTORY_LIMIT } = {}) {
      this.limit = Math.max(1, Number(limit) || REVIEW_HISTORY_LIMIT);
      this.hashes = [];
    }
    has(english) {
      return this.hashes.includes(reviewEnglishHash(english));
    }
    record(english) {
      const hash = reviewEnglishHash(english);
      const existing = this.hashes.indexOf(hash);
      if (existing >= 0) this.hashes.splice(existing, 1);
      this.hashes.push(hash);
      if (this.hashes.length > this.limit) this.hashes.splice(0, this.hashes.length - this.limit);
      return hash;
    }
    clear() {
      this.hashes = [];
    }
    get size() {
      return this.hashes.length;
    }
    snapshot() {
      return [...this.hashes];
    }
  };

  // src/review/review-assistant.js
  var REVIEW_ASSISTANT_CSS = `
.vgen-nya-review-assistant{margin:8px 0;padding:10px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:9px;background:color-mix(in srgb,currentColor 5%,transparent);color:inherit;font:12px/1.5 system-ui,sans-serif;max-width:100%;position:relative}
.vgen-nya-review-assistant__controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.vgen-nya-review-assistant input,.vgen-nya-review-assistant select{border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;padding:5px 7px;background:Canvas;color:CanvasText;font:inherit;min-width:0}
.vgen-nya-review-assistant__keywords{flex:1 1 180px}
.vgen-nya-review-assistant button{border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;padding:5px 9px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font:inherit;cursor:pointer}
.vgen-nya-review-assistant button:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
.vgen-nya-review-assistant button:disabled{opacity:.5;cursor:default}
.vgen-nya-review-assistant__status{margin:7px 0 0;opacity:.78}
.vgen-nya-review-assistant__status[data-error="true"]{color:#b42318}
.vgen-nya-review-assistant__result{margin-top:8px;display:grid;gap:8px}
.vgen-nya-review-assistant__block{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;padding:8px;background:color-mix(in srgb,currentColor 4%,transparent)}
.vgen-nya-review-assistant__label{display:block;margin-bottom:4px;font-weight:650;opacity:.82}
.vgen-nya-review-assistant__body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;cursor:text}
.vgen-nya-review-assistant__actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
`;
  function make10(documentObject, tagName, className = "", text = "") {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function control2(documentObject, text, action) {
    const button = make10(documentObject, "button", "notranslate", text);
    button.type = "button";
    button.translate = false;
    button.dataset.action = action;
    return button;
  }
  var ERROR_LABELS = Object.freeze({
    PROVIDER_NOT_CONFIGURED: "Provider 未配置",
    AUTH_ERROR: "认证失败（401 / 403）",
    RATE_LIMIT: "请求过于频繁（429），请稍后重试",
    HTTP_ERROR: "Provider 服务错误",
    NETWORK_ERROR: "网络错误",
    TIMEOUT: "请求超时",
    INVALID_JSON: "Provider 输出不是有效 JSON",
    MALFORMED_OUTPUT: "Provider 输出格式不正确",
    ABORTED: "生成已取消"
  });
  function errorLabel(code) {
    return ERROR_LABELS[code] || "生成失败";
  }
  function splitKeywords(value) {
    return String(value ?? "").split(/[,，]/).map((keyword) => keyword.trim()).filter(Boolean);
  }
  var ReviewAssistantSession = class {
    constructor({ surface, providerRepository, adapter, history, clipboard, AbortControllerClass = globalThis.AbortController, sessionId = "review-session", now = () => Date.now() } = {}) {
      this.surface = surface;
      this.providerRepository = providerRepository;
      this.clipboard = clipboard;
      this.model = new ReviewSession({ sessionId, adapter, history, providerRepository, AbortControllerClass, now });
      this.unsubscribe = this.model.subscribe(() => this.#render());
      this.root = null;
      this.feedbackTimers = /* @__PURE__ */ new Set();
      this.mounted = false;
      this.autoGenerated = false;
      const settings = providerRepository.read().settings;
      this.keywordsText = "";
      this.length = settings.defaultLength;
      this.starDegree = settings.defaultStarDegree;
    }
    mount() {
      if (this.mounted) return false;
      const documentObject = this.surface?.mountTarget?.ownerDocument || this.surface?.editor?.element?.ownerDocument;
      if (!documentObject) return false;
      this.mounted = true;
      this.root = make10(documentObject, "section", "vgen-nya-review-assistant");
      this.root.dataset.vgenNyaUi = "review-assistant";
      this.root.setAttribute("aria-label", "Review Assistant");
      const mountPoint = this.surface.mountTarget || this.surface.editor?.element?.parentElement || documentObject.body;
      mountPoint.append(this.root);
      this.#render();
      if (isReviewProviderConfigured(this.providerRepository.read().provider)) this.#autoGenerateOnce();
      return true;
    }
    #autoGenerateOnce() {
      if (this.autoGenerated || this.model.isGenerating()) return;
      this.autoGenerated = true;
      void this.model.generate({ length: this.length, starDegree: this.starDegree });
    }
    #render() {
      if (!this.root) return;
      const documentObject = this.root.ownerDocument;
      this.root.replaceChildren();
      const snapshot = this.model.snapshot;
      this.root.append(this.#controls(documentObject, snapshot), this.#status(documentObject, snapshot));
      if (snapshot.candidate) this.root.append(this.#result(documentObject, snapshot));
    }
    #controls(documentObject, snapshot) {
      const wrap = make10(documentObject, "div", "vgen-nya-review-assistant__controls");
      const keywords = make10(documentObject, "input", "vgen-nya-review-assistant__keywords");
      keywords.value = this.keywordsText;
      keywords.placeholder = "关键词 / 要点（逗号分隔，可选）";
      keywords.dataset.role = "keywords";
      const length = make10(documentObject, "select");
      for (const option of REVIEW_LENGTHS) {
        const node = make10(documentObject, "option", "", option);
        node.value = option;
        length.append(node);
      }
      length.value = this.length;
      length.dataset.role = "length";
      const star = make10(documentObject, "select");
      for (const degree of REVIEW_STAR_DEGREES) {
        const node = make10(documentObject, "option", "", `${degree} 星`);
        node.value = String(degree);
        star.append(node);
      }
      star.value = String(this.starDegree);
      star.dataset.role = "star";
      const generate = control2(documentObject, snapshot.candidate ? "Regenerate" : "Generate", "generate");
      generate.disabled = snapshot.generating;
      generate.addEventListener("click", () => void this.#generate());
      wrap.append(keywords, length, star, generate);
      return wrap;
    }
    #status(documentObject, snapshot) {
      const status = make10(documentObject, "p", "vgen-nya-review-assistant__status notranslate");
      status.translate = false;
      if (snapshot.generating) {
        status.textContent = "生成中…";
        return status;
      }
      if (snapshot.error) {
        status.textContent = errorLabel(snapshot.error.code);
        status.dataset.error = "true";
        return status;
      }
      const provider = this.providerRepository.read().provider;
      if (!isReviewProviderConfigured(provider)) {
        status.textContent = "Provider not configured — 请在「设置 → 评价助手 → Provider」中配置";
        status.dataset.error = "true";
        return status;
      }
      return status;
    }
    #result(documentObject, snapshot) {
      const result = make10(documentObject, "div", "vgen-nya-review-assistant__result");
      result.append(this.#block(documentObject, "English（最终提交文本）", snapshot.candidate.english));
      result.append(this.#block(documentObject, "中文对照（仅参考，不写入）", snapshot.candidate.chinese));
      const actions = make10(documentObject, "div", "vgen-nya-review-assistant__actions");
      const copyEnglish = control2(documentObject, "Copy English", "copy-english");
      const copyChinese = control2(documentObject, "Copy Chinese", "copy-chinese");
      const fill = control2(documentObject, "Fill Review", "fill");
      copyEnglish.addEventListener("click", () => void this.#copy(this.model.candidate?.english, copyEnglish));
      copyChinese.addEventListener("click", () => void this.#copy(this.model.candidate?.chinese, copyChinese));
      fill.addEventListener("click", () => void this.#fill());
      actions.append(copyEnglish, copyChinese, fill);
      result.append(actions);
      return result;
    }
    #block(documentObject, label, text) {
      const block = make10(documentObject, "div", "vgen-nya-review-assistant__block");
      const head = make10(documentObject, "span", "vgen-nya-review-assistant__label notranslate", label);
      head.translate = false;
      const body = make10(documentObject, "p", "vgen-nya-review-assistant__body", text);
      body.translate = true;
      block.append(head, body);
      return block;
    }
    async #generate() {
      const { keywords, length, starDegree } = this.#readControls();
      await this.model.generate({ keywords, length, starDegree });
    }
    #readControls() {
      const root = this.root;
      const keywords = splitKeywords(root.querySelector?.('[data-role="keywords"]')?.value);
      const length = root.querySelector?.('[data-role="length"]')?.value || "Medium";
      const starDegree = Number(root.querySelector?.('[data-role="star"]')?.value) || 3;
      return { keywords, length, starDegree };
    }
    async #copy(value, button) {
      if (!value) return;
      const original = button.textContent;
      try {
        await this.clipboard.writeText(value);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy failed";
      } finally {
        const expected = button.textContent;
        const timer = globalThis.setTimeout(() => {
          this.feedbackTimers.delete(timer);
          if (button.isConnected !== false && button.textContent === expected) button.textContent = original;
        }, 1200);
        this.feedbackTimers.add(timer);
      }
    }
    async #fill() {
      const english = this.model.candidate?.english;
      const editor = this.surface?.editor;
      if (!english || !editor) return;
      const current = editor.read();
      try {
        if (current && current !== english) {
          const view = this.root?.ownerDocument?.defaultView || globalThis;
          if (view.confirm?.("评价框已有内容。确认替换为生成的英文评价吗？") !== true) return;
          await editor.fill(english, { replace: true });
        } else {
          await editor.fill(english);
        }
      } catch {
      }
    }
    unmount() {
      if (!this.mounted) return false;
      this.mounted = false;
      this.unsubscribe?.();
      this.unsubscribe = null;
      for (const timer of this.feedbackTimers) globalThis.clearTimeout(timer);
      this.feedbackTimers.clear();
      this.model.dispose("review-session-closed");
      this.root?.remove();
      this.root = null;
      return true;
    }
  };
  var ReviewAssistantRuntime = class {
    constructor({ repository, adapter, history, clipboard, editorAdapter, documentObject = globalThis.document, AbortControllerClass = globalThis.AbortController, sessionIdFactory, now = () => Date.now() } = {}) {
      this.repository = repository;
      this.adapter = adapter || new ReviewProviderAdapter({ fetchImpl: globalThis.fetch?.bind(globalThis), AbortControllerClass });
      this.history = history || new RecentReviewHistory();
      this.clipboard = clipboard;
      this.editorAdapter = editorAdapter || new ReviewEditorAdapter();
      this.documentObject = documentObject;
      this.AbortControllerClass = AbortControllerClass;
      this.now = now;
      this.sequence = 0;
      this.sessionIdFactory = sessionIdFactory || (() => {
        this.sequence += 1;
        return `review-${this.sequence}`;
      });
      this.current = null;
      this.style = null;
      this.mounted = false;
    }
    // REVIEW-LIVE-01 is blocked: the real VGen review surface is not verified,
    // so this runtime installs no observers or timers. openSurface is the only
    // entry point and is exercised by tests/future live integration.
    mount() {
      if (this.mounted || !this.documentObject?.body) return false;
      this.mounted = true;
      this.style = this.documentObject.createElement("style");
      this.style.dataset.vgenNyaUi = "review-assistant-style";
      this.style.textContent = REVIEW_ASSISTANT_CSS;
      (this.documentObject.head || this.documentObject.body).append(this.style);
      return true;
    }
    openSurface(surface) {
      this.#release();
      const editor = surface?.editor || (surface?.root ? this.editorAdapter.resolve(surface.root) : null);
      if (!editor) return false;
      const mountTarget = surface?.mountTarget || editor.element?.parentElement || surface?.root || this.documentObject.body;
      const session = new ReviewAssistantSession({
        surface: { editor, mountTarget },
        providerRepository: this.repository,
        adapter: this.adapter,
        history: this.history,
        clipboard: this.clipboard,
        AbortControllerClass: this.AbortControllerClass,
        sessionId: this.sessionIdFactory(),
        now: this.now
      });
      if (!session.mount()) return false;
      this.current = { surface: { editor, mountTarget }, session };
      return true;
    }
    closeSurface() {
      this.#release();
    }
    #release() {
      this.current?.session?.unmount();
      this.current = null;
    }
    activate() {
    }
    unmount() {
      if (!this.mounted) return false;
      this.#release();
      this.style?.remove();
      this.style = null;
      this.mounted = false;
      return true;
    }
    dispose() {
      this.unmount();
      this.history.clear();
    }
  };

  // src/settings/review-settings.js
  function make11(documentObject, tag, attributes = {}, text = "") {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }
  function renderGeneration(repository) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        const settings = repository.read().settings;
        const length = make11(documentObject, "select", { dataset: { setting: "defaultLength" } });
        for (const option of REVIEW_LENGTHS) length.append(make11(documentObject, "option", { value: option }, option));
        length.value = settings.defaultLength;
        const star = make11(documentObject, "select", { dataset: { setting: "defaultStarDegree" } });
        for (const degree of REVIEW_STAR_DEGREES) star.append(make11(documentObject, "option", { value: String(degree) }, `${degree} 星`));
        star.value = String(settings.defaultStarDegree);
        const row = make11(documentObject, "div", { className: "vgen-nya-settings__check" });
        row.append(
          make11(documentObject, "label", {}, "默认长度 "),
          length,
          make11(documentObject, "label", {}, " 默认星级倾向 "),
          star
        );
        body.replaceChildren(
          make11(documentObject, "p", { className: "vgen-nya-settings__hint" }, "生成评价时的默认参数。星级 1～5 表示「希望生成的评价倾向程度」，不是改写 VGen 的真实评分。"),
          row
        );
      };
      const onChange = (event) => {
        const key = event.target?.dataset?.setting;
        if (!key) return;
        const settings = repository.read().settings;
        settings[key] = key === "defaultStarDegree" ? Number(event.target.value) : event.target.value;
        repository.writeSettings(settings);
      };
      body.addEventListener("change", onChange);
      use(() => body.removeEventListener("change", onChange));
      render();
    };
  }
  function renderProvider(repository) {
    return ({ documentObject, body, use }) => {
      const render = () => {
        const provider = repository.read().provider;
        const configured = isReviewProviderConfigured(provider);
        const status = make11(
          documentObject,
          "p",
          { className: "vgen-nya-settings__hint" },
          configured ? `已配置 Provider（API Key ${maskApiKey(provider.apiKey)}）` : "尚未配置 Provider。"
        );
        const baseUrl = make11(documentObject, "input", { type: "text", value: provider.baseUrl, placeholder: "https://api.openai.com/v1", dataset: { setting: "baseUrl" }, "aria-label": "Base URL" });
        const apiKey = make11(documentObject, "input", { type: "password", value: provider.apiKey, placeholder: "sk-…", dataset: { setting: "apiKey" }, autocomplete: "off", "aria-label": "API Key" });
        const model = make11(documentObject, "input", { type: "text", value: provider.model, placeholder: "gpt-4o-mini", dataset: { setting: "model" }, "aria-label": "Model" });
        const systemPrompt = make11(documentObject, "textarea", { rows: 8, dataset: { setting: "systemPrompt" }, "aria-label": "System Prompt" });
        systemPrompt.value = provider.systemPrompt;
        const field = (label, input) => {
          const row = make11(documentObject, "label", { className: "vgen-nya-settings__check" });
          row.append(make11(documentObject, "span", {}, label), input);
          return row;
        };
        body.replaceChildren(
          status,
          field("Base URL（OpenAI Compatible）", baseUrl),
          field("API Key（仅本地保存，不明文常显）", apiKey),
          field("Model", model),
          field("System Prompt", systemPrompt)
        );
      };
      const onChange = (event) => {
        const key = event.target?.dataset?.setting;
        if (!key) return;
        const provider = repository.read().provider;
        provider[key] = event.target.value;
        repository.writeProvider(provider);
      };
      body.addEventListener("change", onChange);
      use(() => body.removeEventListener("change", onChange));
      render();
    };
  }
  function createReviewSettingsNavigation({ repository }, baseNavigation) {
    return baseNavigation.map((item) => item.id !== "reviews" ? item : {
      ...item,
      tabs: [
        { id: "generate", label: "生成", sections: [
          { id: "generation", title: "生成参数", description: "关键词由业务页面按 session 输入；这里只设置默认长度与星级倾向。", render: renderGeneration(repository) }
        ] },
        { id: "provider", label: "Provider", sections: [
          { id: "provider-config", title: "Provider 配置（OpenAI Compatible）", description: "API Key 仅本地保存，不硬编码、不进入日志或诊断报告。", render: renderProvider(repository) }
        ] }
      ]
    });
  }

  // src/index.js
  function createVGenNyaCore({ storageDriver, gm = globalThis, pageWindow: pageWindow2 = gm } = {}) {
    const store = new ConfigStore(storageDriver || createGMStorageDriver(gm));
    const modules = new ModuleManager();
    const uploadRepository = new UploadConfigRepository(store);
    const chatRepository = new ChatConfigRepository(store);
    const orderRepository = new OrderConfigRepository(store);
    const reviewRepository = new ReviewConfigRepository(store);
    const textPresetStore = new TextPresetStore({ store, uploadRepository });
    const textPresetRegistry = new TextPresetContextRegistry();
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.uploadTitle, new UploadTitlePresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.uploadDescription, new UploadDescriptionPresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.chatQuickReply, new ChatQuickReplyPresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.privateNote, new PrivateNotePresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.finalDelivery, new FinalDeliveryPresetAdapter());
    const textPresetEngine = new TextPresetEngine({ store: textPresetStore, registry: textPresetRegistry });
    const readGate = new ReadGate(chatRepository.read().chatSettings);
    let diagnostics;
    const networkHooks = new ChatNetworkHooks({ windowObject: pageWindow2, readGate, onDiagnosticEvent: (event) => diagnostics?.record(event) });
    diagnostics = new ChatDiagnostics({ networkHooks });
    const navigation = createReviewSettingsNavigation({ repository: reviewRepository }, createOrderSettingsNavigation({ engine: textPresetEngine, repository: orderRepository }, createChatSettingsNavigation(chatRepository, diagnostics, createUploadSettingsNavigation(uploadRepository, SETTINGS_NAVIGATION, textPresetEngine), textPresetEngine)));
    const settingsShell = createSettingsShell({ navigation });
    const uploadAssistant = new UploadAssistantRuntime({ repository: uploadRepository, textPresetEngine, documentObject: pageWindow2.document, MutationObserverClass: pageWindow2.MutationObserver });
    const chat = new ChatService({ documentObject: pageWindow2.document, MutationObserverClass: pageWindow2.MutationObserver });
    const chatAssistant = new ChatAssistantRuntime({ repository: chatRepository, readGate, networkHooks, textPresetEngine, documentObject: pageWindow2.document, MutationObserverClass: pageWindow2.MutationObserver });
    const frequentClients = new FrequentClientsRuntime({ repository: chatRepository, chat, documentObject: pageWindow2.document, MutationObserverClass: pageWindow2.MutationObserver, fetchImpl: pageWindow2.fetch?.bind(pageWindow2) });
    const orderTextPresets = new OrderTextPresetRuntime({ engine: textPresetEngine, documentObject: pageWindow2.document, MutationObserverClass: pageWindow2.MutationObserver });
    const clipboard = new Clipboard({ gmSetClipboard: gm.GM_setClipboard });
    const clientReviewAdapter = new ClientReviewAdapter({ fetchImpl: pageWindow2.fetch?.bind(pageWindow2), DOMParserClass: pageWindow2.DOMParser });
    const orderAssistant = new OrderAssistantRuntime({ repository: orderRepository, clipboard, adapter: clientReviewAdapter, documentObject: pageWindow2.document, MutationObserverClass: pageWindow2.MutationObserver, AbortControllerClass: pageWindow2.AbortController });
    const reviewTransport = createProviderTransport({ gm, fetchImpl: pageWindow2.fetch?.bind(pageWindow2) });
    const reviewAdapter = new ReviewProviderAdapter({ transport: reviewTransport, AbortControllerClass: pageWindow2.AbortController });
    const reviewAssistant = new ReviewAssistantRuntime({ repository: reviewRepository, adapter: reviewAdapter, clipboard, documentObject: pageWindow2.document, AbortControllerClass: pageWindow2.AbortController });
    modules.register("settings", settingsShell);
    modules.register("upload-assistant", uploadAssistant);
    modules.register("chat-assistant", chatAssistant);
    modules.register("frequent-clients", frequentClients);
    modules.register("order-text-presets", orderTextPresets);
    modules.register("order-assistant", orderAssistant);
    modules.register("review-assistant", reviewAssistant);
    return {
      store,
      modules,
      clipboard,
      settingsShell,
      uploadAssistant,
      uploadRepository,
      chatRepository,
      textPresetEngine,
      textPresetStore,
      chatAssistant,
      frequentClients,
      orderTextPresets,
      orderAssistant,
      orderRepository,
      clientReviewAdapter,
      reviewRepository,
      reviewAssistant,
      chat,
      diagnostics,
      networkHooks,
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
      mountChatAssistant() {
        modules.mount("chat-assistant");
        modules.activate("chat-assistant");
      },
      unmountChatAssistant() {
        modules.unmount("chat-assistant");
      },
      mountFrequentClients() {
        modules.mount("frequent-clients");
        modules.activate("frequent-clients");
      },
      unmountFrequentClients() {
        modules.unmount("frequent-clients");
      },
      mountOrderTextPresets() {
        modules.mount("order-text-presets");
        modules.activate("order-text-presets");
      },
      unmountOrderTextPresets() {
        modules.unmount("order-text-presets");
      },
      mountOrderAssistant() {
        modules.mount("order-assistant");
        modules.activate("order-assistant");
      },
      unmountOrderAssistant() {
        modules.unmount("order-assistant");
      },
      mountReviewAssistant() {
        modules.mount("review-assistant");
        modules.activate("review-assistant");
      },
      unmountReviewAssistant() {
        modules.unmount("review-assistant");
      },
      dispose() {
        modules.disposeAll();
        textPresetStore.dispose();
        diagnostics.dispose();
        networkHooks.dispose();
      }
    };
  }

  // src/userscript-entry.js
  var APP_VERSION = "0.1.0";
  var pageWindow = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : globalThis;
  var core = createVGenNyaCore({ gm: globalThis, pageWindow });
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
    core.mountChatAssistant();
    core.mountFrequentClients();
    core.mountOrderAssistant();
    core.mountReviewAssistant();
  }
  start();
})();
