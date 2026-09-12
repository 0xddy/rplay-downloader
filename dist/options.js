(() => {
  // src/errors.js
  var ErrorKind = Object.freeze({
    SOURCE: "source",
    COMPATIBILITY: "compatibility",
    UNSUPPORTED: "unsupported",
    CANCELED: "canceled",
    INTERNAL: "internal"
  });
  var RPlayError = class extends Error {
    constructor(message2, code, options = {}) {
      super(message2, options);
      this.name = this.constructor.name;
      this.code = code;
      this.kind = options.kind || ErrorKind.INTERNAL;
    }
  };
  var SourceError = class extends RPlayError {
    constructor(message2, code = "SOURCE_ERROR", options) {
      super(message2, code, { ...options, kind: ErrorKind.SOURCE });
      this.isSourceError = true;
    }
  };

  // src/cdm-protobuf.js
  var concatBytes = (...parts) => {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  };
  var hexBytes = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  function parseFields(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > 512 * 1024) throw new Error("Invalid protobuf size");
    const fields = /* @__PURE__ */ new Map();
    let offset = 0, count = 0;
    const readInteger = () => {
      let value = 0n;
      for (let index = 0; index < 10; index++) {
        if (offset >= bytes.length) throw new Error("Truncated protobuf");
        const byte = bytes[offset++];
        if (index === 9 && byte > 1) throw new Error("Invalid protobuf integer");
        value |= BigInt(byte & 127) << BigInt(index * 7);
        if (!(byte & 128)) return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
      }
      throw new Error("Invalid protobuf varint");
    };
    while (offset < bytes.length) {
      if (++count > 8192) throw new Error("Too many protobuf fields");
      const tag = readInteger();
      if (typeof tag !== "number" || tag < 8 || tag > 4294967295) throw new Error("Invalid protobuf tag");
      const id = Math.floor(tag / 8), wire = tag % 8;
      let value;
      if (wire === 0) value = readInteger();
      else {
        const length = wire === 1 ? 8 : wire === 5 ? 4 : wire === 2 ? readInteger() : -1;
        if (typeof length !== "number" || length < 0 || length > bytes.length - offset) throw new Error("Invalid protobuf length");
        value = bytes.subarray(offset, offset + length);
        offset += length;
      }
      if (!fields.has(id)) fields.set(id, []);
      fields.get(id).push({ wire, value });
    }
    return fields;
  }
  function oneField(fields, id, wire, fallback) {
    const entries = fields.get(id);
    if (!entries) {
      if (fallback !== void 0) return fallback;
      throw new Error("Missing protobuf field");
    }
    if (entries.length !== 1 || entries[0].wire !== wire) throw new Error("Ambiguous protobuf field");
    return entries[0].value;
  }

  // src/cdm-crypto.js
  var zeroBlock = new Uint8Array(16);
  function der(tag, value) {
    const length = [];
    if (value.length < 128) length.push(value.length);
    else {
      let remaining = value.length;
      while (remaining) {
        length.unshift(remaining % 256);
        remaining = Math.floor(remaining / 256);
      }
      length.unshift(128 | length.length);
    }
    return concatBytes(new Uint8Array([tag, ...length]), value);
  }
  var rsaAlgorithm = new Uint8Array([48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0]);
  var wrapPrivateKey = (pkcs1) => der(48, concatBytes(new Uint8Array([2, 1, 0]), rsaAlgorithm, der(4, pkcs1)));
  var wrapPublicKey = (pkcs1) => der(48, concatBytes(rsaAlgorithm, der(3, concatBytes(new Uint8Array([0]), pkcs1))));

  // src/cdm-browser.js
  var MAX_DEVICE_BYTES = 256 * 1024;
  var pss = { name: "RSA-PSS", saltLength: 20 };
  var readBytes = (message2, id, fallback) => oneField(message2, id, 2, fallback);
  var readNumber = (message2, id, fallback) => oneField(message2, id, 0, fallback);
  async function importWvd(source) {
    const bytes = new Uint8Array(source);
    let pkcs8;
    try {
      if (bytes.length < 12 || bytes.length > MAX_DEVICE_BYTES || hexBytes(bytes.subarray(0, 3)) !== "575644") {
        throw new Error("Invalid WVD");
      }
      if (bytes[3] !== 2) throw new SourceError("\u5F53\u524D\u652F\u6301 WVD v2 \u8BBE\u5907\u6587\u4EF6", "WVD_VERSION_UNSUPPORTED");
      const type = bytes[4], securityLevel = bytes[5];
      if (![1, 2].includes(type) || securityLevel < 1 || securityLevel > 3 || bytes[6] !== 0) throw new Error("Invalid WVD header");
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const privateSize = view.getUint16(7);
      const clientOffset = 9 + privateSize;
      if (privateSize < 128 || clientOffset + 2 > bytes.length) throw new Error("Invalid WVD key");
      const clientSize = view.getUint16(clientOffset);
      if (!clientSize || clientOffset + 2 + clientSize !== bytes.length) throw new Error("Invalid WVD client");
      const clientId = bytes.slice(clientOffset + 2);
      const certificate = parseFields(readBytes(parseFields(readBytes(parseFields(clientId), 2)), 1));
      const publicBytes = readBytes(certificate, 4);
      const systemId = readNumber(certificate, 5);
      if (!Number.isInteger(systemId) || systemId <= 0) throw new Error("Invalid device certificate");
      pkcs8 = wrapPrivateKey(bytes.subarray(9, clientOffset));
      const [signKey, decryptKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-PSS", hash: "SHA-1" }, false, ["sign"]),
        crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-1" }, false, ["decrypt"]),
        crypto.subtle.importKey("spki", wrapPublicKey(publicBytes), { name: "RSA-PSS", hash: "SHA-1" }, false, ["verify"])
      ]);
      if (signKey.algorithm.modulusLength < 2048) throw new Error("Invalid RSA size");
      const proof = crypto.getRandomValues(new Uint8Array(32));
      const signature = await crypto.subtle.sign(pss, signKey, proof);
      if (!await crypto.subtle.verify(pss, publicKey, signature, proof)) throw new Error("Device key mismatch");
      return { schema: 1, type, securityLevel, systemId, clientId, signKey, decryptKey, importedAt: Date.now() };
    } catch (error) {
      if (error instanceof SourceError) throw error;
      throw new SourceError("\u8BBE\u5907\u6587\u4EF6\u65E0\u6548\uFF0C\u6216\u8BBE\u5907\u79C1\u94A5\u4E0E\u8BC1\u4E66\u4E0D\u5339\u914D", "WVD_INVALID");
    } finally {
      bytes.fill(0);
      pkcs8?.fill(0);
    }
  }

  // src/cdm-device-store.js
  async function deviceTransaction(mode, action) {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("rplay-cdm", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("devices");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database blocked"));
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction("devices", mode);
        const request = action(transaction.objectStore("devices"));
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }
  async function loadDevice() {
    let device;
    try {
      device = await deviceTransaction("readonly", (store) => store.get("active"));
    } catch {
      throw new SourceError("\u65E0\u6CD5\u8BFB\u53D6 DRM \u8BBE\u5907\uFF0C\u8BF7\u91CD\u65B0\u5BFC\u5165", "CDM_STORAGE_ERROR");
    }
    if (device) return device;
    const bundled = await readBundledDevice();
    const existing = await deviceTransaction("readwrite", (store) => {
      const request = store.get("active");
      request.onsuccess = () => {
        if (!request.result) store.put(bundled, "active");
      };
      return request;
    });
    return existing || bundled;
  }
  async function saveDevice(device) {
    try {
      await deviceTransaction("readwrite", (store) => store.put(device, "active"));
    } catch {
      throw new SourceError("\u8BBE\u5907\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u672C\u5730\u5B58\u50A8", "CDM_STORAGE_ERROR");
    }
  }
  async function readBundledDevice() {
    let response;
    try {
      response = await fetch(chrome.runtime.getURL("private/device.wvd"));
    } catch {
      throw new SourceError("\u672A\u627E\u5230\u5185\u7F6E\u8BBE\u5907\uFF0C\u8BF7\u5BFC\u5165 .wvd \u6587\u4EF6", "CDM_NOT_CONFIGURED");
    }
    if (!response.ok) throw new SourceError("\u672A\u627E\u5230\u5185\u7F6E\u8BBE\u5907\uFF0C\u8BF7\u5BFC\u5165 .wvd \u6587\u4EF6", "CDM_NOT_CONFIGURED");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_DEVICE_BYTES) throw new SourceError("\u8BBE\u5907\u6587\u4EF6\u8FC7\u5927", "WVD_INVALID");
    return { ...await importWvd(buffer), bundled: true };
  }
  async function restoreBundledDevice() {
    const device = await readBundledDevice();
    await saveDevice(device);
    return device;
  }

  // src/options.js
  var field = (id) => document.getElementById(id);
  var message = (key) => chrome.i18n.getMessage(key);
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = message(element.dataset.i18n) || element.textContent;
  }
  for (const element of document.querySelectorAll("[data-i18n-aria]")) {
    element.setAttribute("aria-label", message(element.dataset.i18nAria) || element.getAttribute("aria-label"));
  }
  document.documentElement.lang = chrome.i18n.getUILanguage?.().replaceAll("_", "-") || "zh-CN";
  document.title = `RPlay \xB7 ${message("drmSettings")}`;
  var isBusy = false;
  function showDevice(device) {
    field("deviceCard").dataset.state = "ready";
    field("deviceStatus").textContent = message(device.bundled ? "drmBundledReady" : "drmDeviceReady");
    field("deviceHint").textContent = message(device.bundled ? "drmBundledHint" : "drmCustomHint");
    field("restore").hidden = Boolean(device.bundled);
  }
  function showStatus(key, kind = "progress") {
    field("status").dataset.kind = kind;
    field("status").textContent = key ? message(key) : "";
  }
  function busy(value) {
    isBusy = value;
    field("save").disabled = value || !field("device").files.length;
    field("restore").disabled = value;
    field("device").disabled = value;
    field("settings").setAttribute("aria-busy", String(value));
  }
  function showSelection() {
    const file = field("device").files[0];
    field("selectedFile").hidden = !file;
    field("fileName").textContent = file?.name || "";
    field("fileSize").textContent = file ? `${(file.size / 1024).toFixed(1)} KB` : "";
    busy(isBusy);
  }
  busy(true);
  loadDevice().then(showDevice).catch(() => {
    field("deviceCard").dataset.state = "error";
    field("deviceStatus").textContent = message("drmMissingTitle");
    field("deviceHint").textContent = message("drmDeviceMissing");
    field("restore").hidden = false;
  }).finally(() => busy(false));
  field("device").addEventListener("change", () => {
    showSelection();
    showStatus("");
  });
  field("settings").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = field("device").files[0];
    if (!file || isBusy) return;
    busy(true);
    showStatus("drmChecking");
    let bytes;
    try {
      if (file.size > MAX_DEVICE_BYTES) throw new Error("Invalid file size");
      bytes = new Uint8Array(await file.arrayBuffer());
      const device = await importWvd(bytes);
      await saveDevice(device);
      showDevice(device);
      field("device").value = "";
      showSelection();
      showStatus("drmSaved", "success");
    } catch {
      showStatus("drmInvalidDevice", "error");
    } finally {
      bytes?.fill(0);
      busy(false);
    }
  });
  field("restore").addEventListener("click", async () => {
    if (isBusy) return;
    busy(true);
    showStatus("drmRestoring");
    try {
      showDevice(await restoreBundledDevice());
      field("device").value = "";
      showSelection();
      showStatus("drmRestored", "success");
    } catch {
      showStatus("drmRestoreFailed", "error");
    } finally {
      busy(false);
    }
  });
})();
