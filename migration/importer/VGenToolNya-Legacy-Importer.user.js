// ==UserScript==
// @name         VGenToolNya Legacy Import
// @namespace    https://vgen.co/
// @version      0.1.0
// @description  VGenToolNya Iteration 1：预览、确认并安全导入两个旧脚本的本地迁移 JSON。
// @author       @Nekori_Net
// @license      MIT
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==
(() => {
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

  // src/migration/legacy-export-schema.js
  var LEGACY_EXPORT_FORMAT = "vgen-nya.legacy-export";
  var LEGACY_EXPORT_SCHEMA_VERSION = 1;
  var MAX_LEGACY_EXPORT_BYTES = 10 * 1024 * 1024;
  var LEGACY_SOURCES = Object.freeze({
    "vgen-tag-quick": Object.freeze({
      id: "vgen-tag-quick",
      name: "VGen \u5FEB\u901F\u6807\u7B7E",
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
      name: "VGen\u5C0F\u5DE5\u5177",
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
  function statusForTarget(store2, key, value, validate) {
    if (!store2.has(key)) return { status: "ready", conflict: false, alreadyMigrated: false };
    const existing = store2.read(key);
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
  function planEnvelope(envelope, store2) {
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
          ...statusForTarget(store2, key, value, validate)
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
  async function prepareLegacyImport(inputs, store2, options = {}) {
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
    const sources = [...unique.values()].map((envelope) => planEnvelope(envelope, store2));
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
  function restoreTarget(store2, target) {
    if (target.before.exists) {
      store2.write(target.key, target.before.value);
      const restored = store2.read(target.key);
      if (!storageValuesEqual(restored, target.before.value)) {
        throw new Error(`Rollback verification failed for ${target.key}`);
      }
    } else {
      store2.deleteVerified(target.key);
    }
  }
  function recoverPendingLegacyImport(store2) {
    if (!store2.has(MIGRATION_STAGING_KEY)) return { recovered: false, targets: [] };
    const journal = store2.read(MIGRATION_STAGING_KEY);
    if (!validateJournal(journal)) {
      throw new Error("Unrecognized migration staging journal; refusing automatic changes");
    }
    const restored = [];
    for (const target of [...journal.targets].reverse()) {
      restoreTarget(store2, target);
      restored.push(target.key);
    }
    store2.deleteVerified(MIGRATION_STAGING_KEY);
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
  function commitLegacyImport(plan, store2, { confirmed = false } = {}) {
    if (!confirmed) throw new Error("Legacy import requires explicit confirmation");
    if (!plan || plan.kind !== "vgen-nya.legacy-import-plan" || !Array.isArray(plan.targets)) {
      throw new TypeError("Invalid legacy import plan");
    }
    const recovery = recoverPendingLegacyImport(store2);
    const ready = [];
    const skippedConflicts = [];
    const skippedExisting = [];
    for (const target of plan.targets) {
      const definition = getLegacyMigrationDefinition(target.legacyKey);
      const validate = definition?.validators[target.key];
      if (!validate?.(target.value)) throw new TypeError(`Invalid planned target: ${target.key}`);
      const current = statusForTarget(store2, target.key, target.value, validate);
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
        before: store2.has(target.key) ? { exists: true, value: store2.read(target.key) } : { exists: false }
      }))
    };
    const written = [];
    try {
      store2.writeVerified(MIGRATION_STAGING_KEY, journal, validateJournal);
      for (const target of ready) {
        store2.writeVerified(target.key, target.value, target.validate);
        written.push(target.key);
      }
      for (const target of ready) {
        if (!storageValuesEqual(store2.read(target.key), target.value)) {
          throw new Error(`Final verification failed for ${target.key}`);
        }
      }
      store2.deleteVerified(MIGRATION_STAGING_KEY);
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
        for (const target of [...journal.targets].reverse()) restoreTarget(store2, target);
        if (store2.has(MIGRATION_STAGING_KEY)) store2.deleteVerified(MIGRATION_STAGING_KEY);
      } catch {
        rollbackSucceeded = false;
      }
      throw new LegacyImportTransactionError(
        rollbackSucceeded ? "Legacy import failed and all writes were rolled back" : "Legacy import failed; recovery journal was retained for the next run",
        { cause, rollbackSucceeded, transactionId: id }
      );
    }
  }

  // src/migration/legacy-import-ui.js
  function node(documentObject, tagName, attributes = {}, text = "") {
    const element = documentObject.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "className") element.className = value;
      else element.setAttribute(name, value);
    }
    if (text) element.textContent = text;
    return element;
  }
  function statusText(target) {
    if (target.status === "already-migrated") return "\u5DF2\u8FC1\u79FB\uFF1B\u4E0D\u4F1A\u91CD\u590D\u5199\u5165";
    if (target.status === "conflict") return `\u51B2\u7A81\uFF1B\u4FDD\u7559\u73B0\u6709\u65B0\u503C\uFF08${target.reason}\uFF09`;
    return "\u5F85\u8FC1\u79FB";
  }
  function createLegacyImportUI({ store: store2, documentObject = globalThis.document } = {}) {
    let root = null;
    let fileInput = null;
    let preview = null;
    let status = null;
    let confirmButton = null;
    let pendingPlan = null;
    let recoveryResult = null;
    function setStatus(message, kind = "info") {
      status.textContent = message;
      status.setAttribute("data-kind", kind);
    }
    function renderPlan(plan) {
      preview.replaceChildren();
      for (const source of plan.sources) {
        const section = node(documentObject, "section", { className: "vgen-nya-import-source" });
        section.append(node(
          documentObject,
          "h3",
          {},
          `${source.source.name} ${source.source.version} \xB7 Bridge ${source.bridgeVersion}`
        ));
        section.append(node(documentObject, "p", {}, `\u5BFC\u51FA\u65F6\u95F4\uFF1A${source.exportedAt}`));
        const table = node(documentObject, "table");
        const head = node(documentObject, "tr");
        for (const label of ["\u6570\u636E\u7C7B\u522B", "\u6761\u76EE\u6570\u91CF", "\u76EE\u6807 key", "\u5206\u6790"]) {
          head.append(node(documentObject, "th", {}, label));
        }
        const thead = node(documentObject, "thead");
        thead.append(head);
        const tbody = node(documentObject, "tbody");
        for (const target of source.targets) {
          const row = node(documentObject, "tr", { "data-status": target.status });
          row.append(
            node(documentObject, "td", {}, target.label),
            node(documentObject, "td", {}, String(target.count)),
            node(documentObject, "td", {}, target.key),
            node(documentObject, "td", {}, statusText(target))
          );
          tbody.append(row);
        }
        table.append(thead, tbody);
        section.append(table);
        preview.append(section);
      }
      if (plan.duplicateFilesIgnored) {
        preview.append(node(documentObject, "p", {}, `\u5DF2\u5FFD\u7565 ${plan.duplicateFilesIgnored} \u4E2A\u5B8C\u5168\u76F8\u540C\u7684\u91CD\u590D\u6587\u4EF6\u3002`));
      }
      if (plan.hasConflicts) {
        setStatus("\u53D1\u73B0\u51B2\u7A81\uFF1A\u786E\u8BA4\u540E\u4EC5\u8FC1\u79FB\u65E0\u51B2\u7A81\u4E14\u7F3A\u5931\u7684\u65B0\u952E\uFF1B\u73B0\u6709\u65B0\u503C\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002", "warning");
      } else if (plan.alreadyMigrated) {
        setStatus("\u6240\u9009\u6570\u636E\u5DF2\u7ECF\u8FC1\u79FB\u8FC7\uFF1B\u786E\u8BA4\u4E0D\u4F1A\u4EA7\u751F\u91CD\u590D\u5185\u5BB9\u3002", "success");
      } else {
        setStatus("\u9884\u89C8\u5B8C\u6210\u3002\u8BF7\u6838\u5BF9\u6765\u6E90\u3001\u6570\u91CF\u3001\u76EE\u6807 key \u540E\u518D\u786E\u8BA4\u8FC1\u79FB\u3002", "success");
      }
      confirmButton.disabled = false;
    }
    async function prepareFiles(files) {
      pendingPlan = null;
      confirmButton.disabled = true;
      preview.replaceChildren();
      const selected = [...files];
      if (selected.length < 1 || selected.length > 2) {
        setStatus("\u8BF7\u9009\u62E9\u4E00\u4E2A\u6216\u4E24\u4E2A Legacy Export JSON \u6587\u4EF6\u3002", "error");
        return null;
      }
      try {
        const texts = await Promise.all(selected.map((file) => file.text()));
        pendingPlan = await prepareLegacyImport(texts, store2);
        renderPlan(pendingPlan);
        return pendingPlan;
      } catch (error) {
        setStatus(`\u62D2\u7EDD\u5BFC\u5165\uFF1A${error.message || error}`, "error");
        return null;
      }
    }
    function confirmImport() {
      if (!pendingPlan) throw new Error("\u8BF7\u5148\u9009\u62E9\u5E76\u9884\u89C8 Legacy Export \u6587\u4EF6");
      confirmButton.disabled = true;
      try {
        const result = commitLegacyImport(pendingPlan, store2, { confirmed: true });
        pendingPlan = null;
        fileInput.value = "";
        setStatus(
          result.committed ? `\u8FC1\u79FB\u5B8C\u6210\uFF1A\u5199\u5165 ${result.writes.length} \u4E2A\u65B0\u952E\uFF1B\u8DF3\u8FC7 ${result.skippedExisting.length} \u4E2A\u5DF2\u8FC1\u79FB\u952E\u548C ${result.skippedConflicts.length} \u4E2A\u51B2\u7A81\u952E\u3002` : `\u65E0\u9700\u5199\u5165\uFF1A\u8DF3\u8FC7 ${result.skippedExisting.length} \u4E2A\u5DF2\u8FC1\u79FB\u952E\u548C ${result.skippedConflicts.length} \u4E2A\u51B2\u7A81\u952E\u3002`,
          "success"
        );
        return result;
      } catch (error) {
        setStatus(`\u8FC1\u79FB\u5931\u8D25\uFF1A${error.message || error}`, "error");
        throw error;
      }
    }
    function open() {
      if (!root) throw new Error("Legacy Import UI is not mounted");
      root.hidden = false;
    }
    function close() {
      if (root) root.hidden = true;
    }
    function mount() {
      if (!documentObject?.body || root) return false;
      recoveryResult = recoverPendingLegacyImport(store2);
      const style = node(documentObject, "style");
      style.textContent = `
#vgen-nya-legacy-import { position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);padding:5vh 5vw;overflow:auto;font:14px/1.45 system-ui;color:#222; }
#vgen-nya-legacy-import * { box-sizing:border-box; }
#vgen-nya-legacy-import .panel { max-width:980px;margin:auto;background:#fff;border-radius:12px;padding:20px;box-shadow:0 16px 60px #0005; }
#vgen-nya-legacy-import header { display:flex;justify-content:space-between;gap:16px;align-items:center; }
#vgen-nya-legacy-import table { width:100%;border-collapse:collapse;margin:8px 0 16px; }
#vgen-nya-legacy-import th,#vgen-nya-legacy-import td { padding:7px;border:1px solid #ddd;text-align:left;vertical-align:top; }
#vgen-nya-legacy-import tr[data-status="conflict"] { background:#fff0f0; }
#vgen-nya-legacy-import tr[data-status="already-migrated"] { background:#f1f8f1; }
#vgen-nya-legacy-import [data-kind="error"] { color:#a40000; }
#vgen-nya-legacy-import [data-kind="warning"] { color:#8a5200; }
#vgen-nya-legacy-import [data-kind="success"] { color:#176b2c; }
#vgen-nya-legacy-import .actions { display:flex;gap:8px;justify-content:flex-end;margin-top:16px; }
#vgen-nya-legacy-import button,#vgen-nya-legacy-import input { font:inherit; }
#vgen-nya-open-legacy-import { position:fixed;right:16px;bottom:108px;z-index:2147483646;padding:8px 12px;border:1px solid #246;border-radius:8px;background:#eaf3ff;color:#123;font:13px system-ui;cursor:pointer; }
`;
      root = node(documentObject, "div", { id: "vgen-nya-legacy-import", className: "notranslate", translate: "no" });
      root.hidden = true;
      const panel = node(documentObject, "div", { className: "panel" });
      const header = node(documentObject, "header");
      header.append(
        node(documentObject, "h2", {}, "VGenToolNya \u65E7\u914D\u7F6E\u5BFC\u5165"),
        node(documentObject, "button", { type: "button", id: "vgen-nya-import-close" }, "\u5173\u95ED")
      );
      panel.append(header);
      panel.append(node(documentObject, "p", {}, "\u9009\u62E9\u4E00\u4E2A\u6216\u4E24\u4E2A Bridge \u5BFC\u51FA\u7684 JSON\u3002\u9009\u62E9\u6587\u4EF6\u53EA\u751F\u6210\u9884\u89C8\uFF0C\u4E0D\u4F1A\u7ACB\u5373\u5199\u5165\u3002"));
      fileInput = node(documentObject, "input", {
        id: "vgen-nya-legacy-files",
        type: "file",
        accept: "application/json,.json",
        multiple: ""
      });
      status = node(documentObject, "p", { id: "vgen-nya-import-status" });
      preview = node(documentObject, "div", { id: "vgen-nya-import-preview" });
      const actions = node(documentObject, "div", { className: "actions" });
      confirmButton = node(documentObject, "button", { type: "button", id: "vgen-nya-import-confirm" }, "\u786E\u8BA4\u8FC1\u79FB");
      confirmButton.disabled = true;
      actions.append(confirmButton);
      panel.append(fileInput, status, preview, actions);
      root.append(style, panel);
      const opener = node(documentObject, "button", { type: "button", id: "vgen-nya-open-legacy-import" }, "\u5BFC\u5165\u65E7\u914D\u7F6E");
      documentObject.body.append(root, opener);
      opener.addEventListener("click", open);
      header.querySelector?.("#vgen-nya-import-close")?.addEventListener("click", close);
      root.addEventListener("click", (event) => {
        if (event.target === root) close();
      });
      fileInput.addEventListener("change", () => void prepareFiles(fileInput.files));
      confirmButton.addEventListener("click", () => {
        try {
          confirmImport();
        } catch (error) {
          console.error("[VGenToolNya Legacy Import]", error);
        }
      });
      if (recoveryResult.recovered) {
        setStatus(`\u5DF2\u6062\u590D\u4E0A\u6B21\u4E2D\u65AD\u7684\u8FC1\u79FB\u4E8B\u52A1\uFF08${recoveryResult.targets.length} \u4E2A\u76EE\u6807\u952E\uFF09\u3002`, "warning");
      } else {
        setStatus("\u5C1A\u672A\u9009\u62E9\u5BFC\u51FA\u6587\u4EF6\u3002", "info");
      }
      return true;
    }
    function dispose() {
      documentObject.getElementById?.("vgen-nya-open-legacy-import")?.remove();
      root?.remove();
      root = null;
      pendingPlan = null;
    }
    return {
      mount,
      dispose,
      open,
      close,
      prepareFiles,
      confirmImport,
      get pendingPlan() {
        return pendingPlan;
      },
      get recoveryResult() {
        return recoveryResult;
      }
    };
  }

  // src/migration/importer-userscript-entry.js
  var store = new ConfigStore(createGMStorageDriver(globalThis));
  var ui = createLegacyImportUI({ store });
  function start() {
    try {
      ui.mount();
      GM_registerMenuCommand("VGenToolNya\uFF1A\u5BFC\u5165\u65E7\u914D\u7F6E", () => ui.open());
    } catch (error) {
      console.error("[VGenToolNya Legacy Import]", error);
      window.alert(`\u65E7\u914D\u7F6E\u5BFC\u5165\u5668\u542F\u52A8\u5931\u8D25\uFF1A${error.message || error}`);
    }
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
