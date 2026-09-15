(() => {
  // src/media.js
  var ESTIMATED_PAYLOAD_RATIO = 0.68;
  function estimateMediaBytes(bandwidth, duration) {
    const bitsPerSecond = Number(bandwidth);
    const seconds = Number(duration);
    if (!(bitsPerSecond > 0) || !(seconds > 0)) return null;
    return Math.round(bitsPerSecond * seconds * ESTIMATED_PAYLOAD_RATIO / 8);
  }
  function createSourceId(masterUrl, streamUrl) {
    const value = `${masterUrl || ""}
${streamUrl || ""}`;
    let first = 3735928559 ^ value.length;
    let second = 1103547991 ^ value.length;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 2654435761);
      second = Math.imul(second ^ code, 1597334677);
    }
    first = Math.imul(first ^ first >>> 16, 2246822507) ^ Math.imul(second ^ second >>> 13, 3266489909);
    second = Math.imul(second ^ second >>> 16, 2246822507) ^ Math.imul(first ^ first >>> 13, 3266489909);
    return `${(second >>> 0).toString(36)}${(first >>> 0).toString(36)}`;
  }

  // src/errors.js
  var ErrorKind = Object.freeze({
    SOURCE: "source",
    COMPATIBILITY: "compatibility",
    UNSUPPORTED: "unsupported",
    CANCELED: "canceled",
    INTERNAL: "internal"
  });

  // src/cdm-crypto.js
  var zeroBlock = new Uint8Array(16);
  var rsaAlgorithm = new Uint8Array([48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0]);

  // src/cdm-browser.js
  var MAX_DEVICE_BYTES = 256 * 1024;

  // src/cdm-client.js
  var LICENSE_STORAGE_PREFIX = "rplayWidevine:";
  function isWidevineLicenseUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && url.hostname === "widevine-dash.ezdrm.com" && !url.port && url.pathname === "/widevine-php/widevine-foreignkey.php";
    } catch {
      return false;
    }
  }

  // src/naming.js
  function normalizeVideoTitle(value) {
    const normalized = String(value || "").normalize("NFC").replace(/\s+/g, " ").replace(/\s*[|｜]\s*RPLAY\s*$/i, "").trim();
    return /^(?:rplay|rplay\.live)$/i.test(normalized) ? "" : normalized;
  }
  function sanitizeFilename(value) {
    const cleaned = normalizeVideoTitle(value || "rplay").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
    return [...cleaned || "rplay"].slice(0, 100).join("");
  }
  function makeDownloadFilename(task, extension) {
    const title = sanitizeFilename(task.title || "rplay");
    const resolution = sanitizeFilename(task.resolution || "video");
    const timestamp = new Date(task.createdAt).toISOString().replace(/[:.]/g, "-");
    return `${title}_${resolution}_${timestamp}.${extension}`;
  }

  // src/protocol.js
  var TaskPhase = Object.freeze({
    QUEUED: "queued",
    PREPARING: "preparing",
    REMUXING: "remuxing",
    FALLBACK_TS: "fallback_ts",
    SAVING: "saving",
    COMPLETED: "completed",
    ERROR: "error"
  });
  var ACTIVE_TASK_PHASES = /* @__PURE__ */ new Set([
    TaskPhase.QUEUED,
    TaskPhase.PREPARING,
    TaskPhase.REMUXING,
    TaskPhase.FALLBACK_TS,
    TaskPhase.SAVING
  ]);
  var TERMINAL_TASK_PHASES = /* @__PURE__ */ new Set([
    TaskPhase.COMPLETED,
    TaskPhase.ERROR
  ]);
  var TASK_TRANSITIONS = /* @__PURE__ */ new Map([
    [TaskPhase.QUEUED, /* @__PURE__ */ new Set([TaskPhase.PREPARING, TaskPhase.ERROR])],
    [TaskPhase.PREPARING, /* @__PURE__ */ new Set([
      TaskPhase.REMUXING,
      TaskPhase.FALLBACK_TS,
      TaskPhase.SAVING,
      TaskPhase.ERROR
    ])],
    [TaskPhase.REMUXING, /* @__PURE__ */ new Set([TaskPhase.FALLBACK_TS, TaskPhase.SAVING, TaskPhase.ERROR])],
    [TaskPhase.FALLBACK_TS, /* @__PURE__ */ new Set([TaskPhase.SAVING, TaskPhase.ERROR])],
    [TaskPhase.SAVING, /* @__PURE__ */ new Set([TaskPhase.COMPLETED, TaskPhase.ERROR])]
  ]);
  function canTransitionTask(from, to) {
    return from === to || TASK_TRANSITIONS.get(from)?.has(to) === true;
  }
  var MessageType = Object.freeze({
    GET_VIDEO_INFO: "GET_VIDEO_INFO",
    GET_TASKS: "GET_TASKS",
    GET_DOWNLOAD_STATE: "GET_DOWNLOAD_STATE",
    DOWNLOAD_VIDEO: "DOWNLOAD_VIDEO",
    CANCEL_TASK: "CANCEL_TASK",
    OPEN_POPUP: "OPEN_POPUP",
    VIDEO_DETECTED: "VIDEO_DETECTED",
    VIDEO_INFO_CLEARED: "VIDEO_INFO_CLEARED",
    GET_PAGE_VIDEO_TITLE: "GET_PAGE_VIDEO_TITLE",
    TASK_CREATED: "TASK_CREATED",
    TASK_UPDATED: "TASK_UPDATED",
    TASK_COMPLETED: "TASK_COMPLETED",
    TASK_ERROR: "TASK_ERROR",
    OFFSCREEN_START: "OFFSCREEN_START",
    OFFSCREEN_CANCEL: "OFFSCREEN_CANCEL",
    OFFSCREEN_STATUS: "OFFSCREEN_STATUS",
    OFFSCREEN_RELEASE_FILE: "OFFSCREEN_RELEASE_FILE",
    OFFSCREEN_PROGRESS: "OFFSCREEN_PROGRESS",
    OFFSCREEN_FILE_READY: "OFFSCREEN_FILE_READY",
    OFFSCREEN_ERROR: "OFFSCREEN_ERROR",
    OFFSCREEN_CANCELED: "OFFSCREEN_CANCELED"
  });
  var BACKGROUND_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    MessageType.GET_VIDEO_INFO,
    MessageType.GET_TASKS,
    MessageType.GET_DOWNLOAD_STATE,
    MessageType.DOWNLOAD_VIDEO,
    MessageType.CANCEL_TASK,
    MessageType.OPEN_POPUP,
    MessageType.OFFSCREEN_PROGRESS,
    MessageType.OFFSCREEN_FILE_READY,
    MessageType.OFFSCREEN_ERROR,
    MessageType.OFFSCREEN_CANCELED
  ]);
  var OFFSCREEN_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    MessageType.OFFSCREEN_START,
    MessageType.OFFSCREEN_CANCEL,
    MessageType.OFFSCREEN_STATUS,
    MessageType.OFFSCREEN_RELEASE_FILE
  ]);
  var TASK_EVENT_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    MessageType.TASK_CREATED,
    MessageType.TASK_UPDATED,
    MessageType.TASK_COMPLETED,
    MessageType.TASK_ERROR
  ]);

  // src/task-store.js
  var PRIVATE_TASK_FIELDS = /* @__PURE__ */ new Set([
    "masterUrl",
    "streamUrl",
    "audioUrl",
    "objectUrl",
    "tempName",
    "sessionKeys",
    "licenseUrl",
    "cdmSettings"
  ]);
  function toPublicTask(task) {
    if (!task) return null;
    return Object.fromEntries(
      Object.entries(task).filter(([key]) => !PRIVATE_TASK_FIELDS.has(key))
    );
  }
  var TaskStore = class {
    constructor({ storageArea, storageKey, terminalPhases, onEvent = () => {
    }, now = Date.now }) {
      this.storageArea = storageArea;
      this.storageKey = storageKey;
      this.terminalPhases = terminalPhases;
      this.onEvent = onEvent;
      this.now = now;
      this.tasks = /* @__PURE__ */ new Map();
    }
    async restore() {
      const stored = await this.storageArea.get(this.storageKey);
      this.tasks.clear();
      for (const task of stored[this.storageKey] || []) this.tasks.set(task.taskId, task);
      return this.tasks;
    }
    get(taskId) {
      return this.tasks.get(taskId) || null;
    }
    values() {
      return this.tasks.values();
    }
    async add(task, eventType) {
      this.tasks.set(task.taskId, task);
      await this.persist();
      if (eventType) this.onEvent(eventType, task);
      return task;
    }
    async update(taskId, updates, {
      eventType,
      persist = true,
      validateTransition = true
    } = {}) {
      const task = this.get(taskId);
      if (!task) return null;
      if (validateTransition && updates.phase && !canTransitionTask(task.phase, updates.phase)) {
        throw new Error(`\u975E\u6CD5\u4EFB\u52A1\u72B6\u6001\u6D41\u8F6C\uFF1A${task.phase} \u2192 ${updates.phase}`);
      }
      Object.assign(task, updates, { updatedAt: this.now() });
      if (persist) await this.persist();
      if (eventType) this.onEvent(eventType, task);
      return task;
    }
    async persist() {
      const ordered = [...this.tasks.values()].sort((left, right) => right.createdAt - left.createdAt);
      const active = ordered.filter((task) => !this.terminalPhases.has(task.phase));
      const terminalLimit = Math.min(20, Math.max(0, 50 - active.length));
      const terminal = ordered.filter((task) => this.terminalPhases.has(task.phase)).slice(0, terminalLimit);
      const retained = [...active, ...terminal].sort((left, right) => right.createdAt - left.createdAt);
      const retainedIds = new Set(retained.map((task) => task.taskId));
      for (const taskId of this.tasks.keys()) {
        if (!retainedIds.has(taskId)) this.tasks.delete(taskId);
      }
      await this.storageArea.set({ [this.storageKey]: retained });
    }
  };

  // src/hls.js
  function resolveUrl(value, baseUrl) {
    if (!value) return null;
    try {
      return new URL(value, baseUrl).href;
    } catch {
      return value;
    }
  }
  function parseAttributeList(value) {
    const attributes = {};
    let index = 0;
    while (index < value.length) {
      while (value[index] === "," || /\s/.test(value[index] || "")) index++;
      const keyStart = index;
      while (index < value.length && value[index] !== "=") index++;
      if (index >= value.length) break;
      const key = value.slice(keyStart, index).trim().toUpperCase();
      index++;
      let parsedValue = "";
      if (value[index] === '"') {
        index++;
        const valueStart = index;
        while (index < value.length && value[index] !== '"') index++;
        parsedValue = value.slice(valueStart, index);
        index++;
      } else {
        const valueStart = index;
        while (index < value.length && value[index] !== ",") index++;
        parsedValue = value.slice(valueStart, index).trim();
      }
      if (key) attributes[key] = parsedValue;
      while (index < value.length && value[index] !== ",") index++;
      if (value[index] === ",") index++;
    }
    return attributes;
  }
  function parseMasterPlaylist(content, baseUrl) {
    const lines = content.split(/\r?\n/).map((line) => line.trim());
    const audioGroups = /* @__PURE__ */ new Map();
    const sessionKeys = [];
    for (const line of lines) {
      if (line.startsWith("#EXT-X-SESSION-KEY:")) {
        const attributes2 = parseAttributeList(line.slice(line.indexOf(":") + 1));
        sessionKeys.push({
          method: (attributes2.METHOD || "").toUpperCase(),
          uri: resolveUrl(attributes2.URI, baseUrl),
          iv: attributes2.IV || null,
          keyFormat: attributes2.KEYFORMAT || "identity"
        });
        continue;
      }
      if (!line.startsWith("#EXT-X-MEDIA:")) continue;
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      if (attributes.TYPE !== "AUDIO" || !attributes["GROUP-ID"]) continue;
      const group = audioGroups.get(attributes["GROUP-ID"]) || [];
      group.push({
        uri: resolveUrl(attributes.URI, baseUrl),
        language: attributes.LANGUAGE || null,
        name: attributes.NAME || null,
        isDefault: attributes.DEFAULT === "YES"
      });
      audioGroups.set(attributes["GROUP-ID"], group);
    }
    const streams = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      let uri = null;
      for (let next = index + 1; next < lines.length; next++) {
        if (!lines[next]) continue;
        if (!lines[next].startsWith("#")) uri = lines[next];
        break;
      }
      if (!uri) continue;
      const resolution = attributes.RESOLUTION || null;
      const [width, height] = resolution ? resolution.split("x").map((item) => Number.parseInt(item, 10)) : [null, null];
      const audioGroup = attributes.AUDIO || null;
      const externalAudioTracks = audioGroup ? (audioGroups.get(audioGroup) || []).filter((track) => Boolean(track.uri)) : [];
      const preferredAudio = externalAudioTracks.find((track) => track.isDefault) || externalAudioTracks[0] || null;
      streams.push({
        url: resolveUrl(uri, baseUrl),
        resolution,
        width,
        height,
        bandwidth: Number.parseInt(attributes.BANDWIDTH || attributes["AVERAGE-BANDWIDTH"] || "0", 10) || null,
        averageBandwidth: Number.parseInt(attributes["AVERAGE-BANDWIDTH"] || "0", 10) || null,
        codecs: attributes.CODECS || null,
        audioGroup,
        hasExternalAudio: externalAudioTracks.length > 0,
        audioUrl: preferredAudio?.uri || null
      });
    }
    return { streams, audioGroups, sessionKeys };
  }
  function getPlaylistDuration(content) {
    let duration = 0;
    for (const match of content.matchAll(/#EXTINF:([\d.]+)/g)) {
      duration += Number.parseFloat(match[1]);
    }
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }
  function getUnsupportedHlsEncryption(content) {
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!/^#EXT-X-(?:SESSION-)?KEY:/.test(line)) continue;
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      const method = (attributes.METHOD || "").toUpperCase();
      if (method === "NONE") continue;
      if (method !== "AES-128" || attributes.KEYFORMAT && attributes.KEYFORMAT !== "identity") {
        return { method: method || "UNKNOWN", keyFormat: attributes.KEYFORMAT || "identity" };
      }
    }
    return null;
  }

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/util.js
  var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
  var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
  var regexName = new RegExp("^" + nameRegexp + "$");
  function getAllMatches(string, regex) {
    const matches = [];
    let match = regex.exec(string);
    while (match) {
      const allmatches = [];
      allmatches.startIndex = regex.lastIndex - match[0].length;
      const len = match.length;
      for (let index = 0; index < len; index++) {
        allmatches.push(match[index]);
      }
      matches.push(allmatches);
      match = regex.exec(string);
    }
    return matches;
  }
  var isName = function(string) {
    const match = regexName.exec(string);
    return !(match === null || typeof match === "undefined");
  };
  function isExist(v) {
    return typeof v !== "undefined";
  }
  var DANGEROUS_PROPERTY_NAMES = ["hasOwnProperty", "toString", "valueOf", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"];
  var criticalProperties = ["__proto__", "constructor", "prototype"];

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/validator.js
  var defaultOptions = { allowBooleanAttributes: false, unpairedTags: [] };
  function validate(xmlData, options) {
    options = Object.assign({}, defaultOptions, options);
    const tags = [];
    let tagFound = false;
    let reachedRoot = false;
    if (xmlData[0] === "\uFEFF") {
      xmlData = xmlData.substr(1);
    }
    for (let i = 0; i < xmlData.length; i++) {
      if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
        i += 2;
        i = readPI(xmlData, i);
        if (i.err) return i;
      } else if (xmlData[i] === "<") {
        let tagStartPos = i;
        i++;
        if (xmlData[i] === "!") {
          i = readCommentAndCDATA(xmlData, i);
          continue;
        } else {
          let closingTag = false;
          if (xmlData[i] === "/") {
            closingTag = true;
            i++;
          }
          let tagName = "";
          for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
            tagName += xmlData[i];
          }
          tagName = tagName.trim();
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substring(0, tagName.length - 1);
            i--;
          }
          if (!validateTagName(tagName)) {
            let msg;
            if (tagName.trim().length === 0) {
              msg = "Invalid space after '<'.";
            } else {
              msg = "Tag '" + tagName + "' is an invalid name.";
            }
            return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
          }
          const result = readAttributeStr(xmlData, i);
          if (result === false) {
            return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
          }
          let attrStr = result.value;
          i = result.index;
          if (attrStr[attrStr.length - 1] === "/") {
            const attrStrStart = i - attrStr.length;
            attrStr = attrStr.substring(0, attrStr.length - 1);
            const isValid = validateAttributeString(attrStr, options);
            if (isValid === true) {
              tagFound = true;
            } else {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
            }
          } else if (closingTag) {
            if (!result.tagClosed) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
            } else if (attrStr.trim().length > 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
            } else if (tags.length === 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
            } else {
              const otg = tags.pop();
              if (tagName !== otg.tagName) {
                let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
                return getErrorObject("InvalidTag", "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.", getLineNumberForPosition(xmlData, tagStartPos));
              }
              if (tags.length == 0) {
                reachedRoot = true;
              }
            }
          } else {
            const isValid = validateAttributeString(attrStr, options);
            if (isValid !== true) {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
            }
            if (reachedRoot === true) {
              return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
            } else if (options.unpairedTags.indexOf(tagName) !== -1) {
            } else {
              tags.push({ tagName, tagStartPos });
            }
            tagFound = true;
          }
          for (i++; i < xmlData.length; i++) {
            if (xmlData[i] === "<") {
              if (xmlData[i + 1] === "!") {
                i++;
                i = readCommentAndCDATA(xmlData, i);
                continue;
              } else if (xmlData[i + 1] === "?") {
                i = readPI(xmlData, ++i);
                if (i.err) return i;
              } else {
                break;
              }
            } else if (xmlData[i] === "&") {
              const afterAmp = validateAmpersand(xmlData, i);
              if (afterAmp == -1) return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
              i = afterAmp;
            } else {
              if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
                return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
              }
            }
          }
          if (xmlData[i] === "<") {
            i--;
          }
        }
      } else {
        if (isWhiteSpace(xmlData[i])) {
          continue;
        }
        return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
      }
    }
    if (!tagFound) {
      return getErrorObject("InvalidXml", "Start tag expected.", 1);
    } else if (tags.length == 1) {
      return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
    } else if (tags.length > 0) {
      return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
    }
    return true;
  }
  function isWhiteSpace(char) {
    return char === " " || char === "	" || char === "\n" || char === "\r";
  }
  function readPI(xmlData, i) {
    const start = i;
    for (; i < xmlData.length; i++) {
      if (xmlData[i] == "?" || xmlData[i] == " ") {
        const tagname = xmlData.substr(start, i - start);
        if (i > 5 && tagname === "xml") {
          return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
        } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
          i++;
          break;
        } else {
          continue;
        }
      }
    }
    return i;
  }
  function readCommentAndCDATA(xmlData, i) {
    if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
      for (i += 3; i < xmlData.length; i++) {
        if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
      let angleBracketsCount = 1;
      for (i += 8; i < xmlData.length; i++) {
        if (xmlData[i] === "<") {
          angleBracketsCount++;
        } else if (xmlData[i] === ">") {
          angleBracketsCount--;
          if (angleBracketsCount === 0) {
            break;
          }
        }
      }
    } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
      for (i += 8; i < xmlData.length; i++) {
        if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    }
    return i;
  }
  var doubleQuote = '"';
  var singleQuote = "'";
  function readAttributeStr(xmlData, i) {
    let attrStr = "";
    let startChar = "";
    let tagClosed = false;
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
        if (startChar === "") {
          startChar = xmlData[i];
        } else if (startChar !== xmlData[i]) {
        } else {
          startChar = "";
        }
      } else if (xmlData[i] === ">") {
        if (startChar === "") {
          tagClosed = true;
          break;
        }
      }
      attrStr += xmlData[i];
    }
    if (startChar !== "") {
      return false;
    }
    return { value: attrStr, index: i, tagClosed };
  }
  function scanAttributeTokens(attrStr) {
    const tokens = [];
    const len = attrStr.length;
    let i = 0;
    while (i < len) {
      const tokenStart = i;
      while (i < len && isWhiteSpace(attrStr[i])) i++;
      if (i >= len) break;
      if (attrStr[i] === "=") {
        i = tokenStart + 1;
        continue;
      }
      const leadingWs = attrStr.slice(tokenStart, i);
      const nameStart = i;
      while (i < len && !isWhiteSpace(attrStr[i]) && attrStr[i] !== "=") i++;
      const name = attrStr.slice(nameStart, i);
      let equalsGroup;
      let j = i;
      while (j < len && isWhiteSpace(attrStr[j])) j++;
      if (j < len && attrStr[j] === "=") {
        equalsGroup = attrStr.slice(i, j + 1);
        i = j + 1;
      }
      let quoteChar;
      let value;
      let k = i;
      while (k < len && isWhiteSpace(attrStr[k])) k++;
      if (k < len && (attrStr[k] === '"' || attrStr[k] === "'")) {
        const valueStart = k + 1;
        const closeIdx = attrStr.indexOf(attrStr[k], valueStart);
        if (closeIdx !== -1) {
          quoteChar = attrStr[k];
          value = attrStr.slice(valueStart, closeIdx);
          i = closeIdx + 1;
        }
      }
      const token = { startIndex: tokenStart };
      token[1] = leadingWs;
      token[2] = name;
      token[3] = equalsGroup;
      token[4] = quoteChar !== void 0 ? true : void 0;
      token[5] = quoteChar;
      token[6] = value;
      tokens.push(token);
    }
    return tokens;
  }
  function validateAttributeString(attrStr, options) {
    const matches = scanAttributeTokens(attrStr);
    const attrNames = {};
    for (let i = 0; i < matches.length; i++) {
      if (matches[i][1].length === 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
        return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
      }
      const attrName = matches[i][2];
      if (!validateAttrName(attrName)) {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
      }
      if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
        attrNames[attrName] = 1;
      } else {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
      }
    }
    return true;
  }
  function validateNumberAmpersand(xmlData, i) {
    let re = /\d/;
    if (xmlData[i] === "x") {
      i++;
      re = /[\da-fA-F]/;
    }
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === ";") return i;
      if (!xmlData[i].match(re)) break;
    }
    return -1;
  }
  function validateAmpersand(xmlData, i) {
    i++;
    if (xmlData[i] === ";") return -1;
    if (xmlData[i] === "#") {
      i++;
      return validateNumberAmpersand(xmlData, i);
    }
    let count = 0;
    for (; i < xmlData.length; i++, count++) {
      if (xmlData[i].match(/\w/) && count < 20) continue;
      if (xmlData[i] === ";") break;
      return -1;
    }
    return i;
  }
  function getErrorObject(code, message, lineNumber) {
    return { err: { code, msg: message, line: lineNumber.line || lineNumber, col: lineNumber.col } };
  }
  function validateAttrName(attrName) {
    return isName(attrName);
  }
  function validateTagName(tagname) {
    return isName(tagname);
  }
  function getLineNumberForPosition(xmlData, index) {
    const lines = xmlData.substring(0, index).split(/\r?\n/);
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  }
  function getPositionFromMatch(match) {
    return match.startIndex + match[1].length;
  }

  // node_modules/.pnpm/@nodable+entities@3.0.0/node_modules/@nodable/entities/src/entities.js
  var CURRENCY = {
    cent: "\xA2",
    pound: "\xA3",
    curren: "\xA4",
    yen: "\xA5",
    euro: "\u20AC",
    dollar: "$",
    fnof: "\u0192",
    inr: "\u20B9",
    af: "\u060B",
    birr: "\u1265\u122D",
    peso: "\u20B1",
    rub: "\u20BD",
    won: "\u20A9",
    yuan: "\xA5",
    cedil: "\xB8"
  };
  var XML = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"'
  };
  var COMMON_HTML = {
    nbsp: "\xA0",
    copy: "\xA9",
    reg: "\xAE",
    trade: "\u2122",
    mdash: "\u2014",
    ndash: "\u2013",
    hellip: "\u2026",
    laquo: "\xAB",
    raquo: "\xBB",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201C",
    rdquo: "\u201D",
    bull: "\u2022",
    para: "\xB6",
    sect: "\xA7",
    deg: "\xB0",
    frac12: "\xBD",
    frac14: "\xBC",
    frac34: "\xBE"
  };

  // node_modules/.pnpm/@nodable+entities@3.0.0/node_modules/@nodable/entities/src/EntityDecoder.js
  var ENTITY_ACTION = Object.freeze({
    /** Resolve and expand the entity normally. */
    ALLOW: "allow",
    /** Silently skip this entity — it will not be registered. */
    BLOCK: "block",
    /** Throw an error, aborting entity registration entirely. */
    THROW: "throw"
  });
  var SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
  function validateEntityName(name) {
    if (name[0] === "#") {
      throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
    }
    for (const ch of name) {
      if (SPECIAL_CHARS.has(ch)) {
        throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
      }
    }
    return name;
  }
  function mergeEntityMaps(...maps) {
    const out = /* @__PURE__ */ Object.create(null);
    for (const map of maps) {
      if (!map) continue;
      for (const key of Object.keys(map)) {
        const raw = map[key];
        if (typeof raw === "string") {
          out[key] = raw;
        } else if (raw && typeof raw === "object" && raw.val !== void 0) {
          const val = raw.val;
          if (typeof val === "string") {
            out[key] = val;
          }
        }
      }
    }
    return out;
  }
  var LIMIT_TIER_EXTERNAL = "external";
  var LIMIT_TIER_BASE = "base";
  var LIMIT_TIER_ALL = "all";
  function parseLimitTiers(raw) {
    if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
    if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
    if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
    if (Array.isArray(raw)) return new Set(raw);
    return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  }
  var NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
  var XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
  function parseNCRConfig(ncr) {
    if (!ncr) {
      return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
    }
    const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
    const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
    const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
    const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
    return { xmlVersion, onLevel, nullLevel: clampedNull };
  }
  var EntityDecoder = class {
    /**
     * @param {object} [options]
     * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
     * @param {object}  [options.limit]                 — security limits
     * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
     * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
     * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
     *   Which entity tiers count against the security limits:
     *   - 'external' (default) — only input/runtime + persistent external entities
     *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
     *   - 'all'                — every entity regardless of tier
     *   - string[]             — explicit combination, e.g. ['external', 'base']
     * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
     * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
     * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
     * @param {object}   [options.ncr]       — Numeric Character Reference controls
     * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
     *   XML version governing which codepoint ranges are restricted:
     *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
     *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
     * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
     *   Base action for numeric references. Severity order: allow < leave < remove < throw.
     *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
     *   the effective action is max(onNCR, rangeMinimum).
     * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
     *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
     *   Hook called when an external entity is registered via `setExternalEntities()` or
     *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
     *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
     *   Hook called when an input entity is registered via `addInputEntities()`. Return
     *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
     *   `ENTITY_ACTION.THROW` to abort with an error.
     */
    constructor(options = {}) {
      this._limit = options.limit || {};
      this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
      this._maxExpandedLength = this._limit.maxExpandedLength || 0;
      this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r) => r;
      this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
      this._numericAllowed = options.numericAllowed ?? true;
      this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
      this._externalMap = /* @__PURE__ */ Object.create(null);
      this._inputMap = /* @__PURE__ */ Object.create(null);
      this._totalExpansions = 0;
      this._expandedLength = 0;
      this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
      this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
      const ncrCfg = parseNCRConfig(options.ncr);
      this._ncrXmlVersion = ncrCfg.xmlVersion;
      this._ncrOnLevel = ncrCfg.onLevel;
      this._ncrNullLevel = ncrCfg.nullLevel;
      this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
      this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
    }
    // -------------------------------------------------------------------------
    // Private: registration hook dispatch
    // -------------------------------------------------------------------------
    /**
     * Invoke a registration hook for a single entity name/value pair.
     * Returns true when the entity should be accepted, false when it should be
     * silently skipped (BLOCK), and throws when the hook returns THROW.
     *
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
     * @param {string} name
     * @param {string} value
     * @param {string} context  — used in error messages ('external' | 'input')
     * @returns {boolean}  true = accept, false = skip
     */
    _applyRegistrationHook(hook, name, value, context) {
      if (!hook) return true;
      const action = hook(name, value);
      if (action === ENTITY_ACTION.BLOCK) return false;
      if (action === ENTITY_ACTION.THROW) {
        throw new Error(
          `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
        );
      }
      return true;
    }
    // -------------------------------------------------------------------------
    // Persistent external entity registration
    // -------------------------------------------------------------------------
    /**
     * Replace the full set of persistent external entities.
     * All keys are validated — throws on invalid characters.
     * If `onExternalEntity` is set, it is called once per entry; entries that
     * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
     * aborts the whole call.
     * @param {Record<string, string | { regex?: RegExp, val: string }>} map
     */
    setExternalEntities(map) {
      if (map) {
        for (const key of Object.keys(map)) {
          validateEntityName(key);
        }
      }
      if (!this._onExternalEntity) {
        this._externalMap = mergeEntityMaps(map);
        return;
      }
      const flat = mergeEntityMaps(map);
      const filtered = /* @__PURE__ */ Object.create(null);
      for (const [name, value] of Object.entries(flat)) {
        if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
          filtered[name] = value;
        }
      }
      this._externalMap = filtered;
    }
    /**
     * Add a single persistent external entity.
     * If `onExternalEntity` is set it is called before the entity is stored;
     * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
     * @param {string} key
     * @param {string} value
     */
    addExternalEntity(key, value) {
      validateEntityName(key);
      if (typeof value === "string" && value.indexOf("&") === -1) {
        if (this._applyRegistrationHook(this._onExternalEntity, key, value, "external")) {
          this._externalMap[key] = value;
        }
      }
    }
    // -------------------------------------------------------------------------
    // Input / runtime entity registration (per document)
    // -------------------------------------------------------------------------
    /**
     * Inject DOCTYPE entities for the current document.
     * Also resets per-document expansion counters.
     * If `onInputEntity` is set it is called once per entry; entries returning
     * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
     * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
     */
    addInputEntities(map) {
      this._totalExpansions = 0;
      this._expandedLength = 0;
      if (!this._onInputEntity) {
        this._inputMap = mergeEntityMaps(map);
        return;
      }
      const flat = mergeEntityMaps(map);
      const filtered = /* @__PURE__ */ Object.create(null);
      for (const [name, value] of Object.entries(flat)) {
        if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
          filtered[name] = value;
        }
      }
      this._inputMap = filtered;
    }
    // -------------------------------------------------------------------------
    // Per-document reset
    // -------------------------------------------------------------------------
    /**
     * Wipe input/runtime entities and reset counters.
     * Call this before processing each new document.
     * @returns {this}
     */
    reset() {
      this._inputMap = /* @__PURE__ */ Object.create(null);
      this._totalExpansions = 0;
      this._expandedLength = 0;
      return this;
    }
    // -------------------------------------------------------------------------
    // XML version (can be set after construction, e.g. once parser reads <?xml?>)
    // -------------------------------------------------------------------------
    /**
     * Update the XML version used for NCR classification.
     * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
     * @param {1.0|1.1|number} version
     */
    setXmlVersion(version) {
      this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
    }
    // -------------------------------------------------------------------------
    // Primary API
    // -------------------------------------------------------------------------
    /**
     * Replace all entity references in `str` in a single pass.
     *
     * @param {string} str
     * @returns {string}
     */
    decode(str) {
      if (typeof str !== "string" || str.length === 0) return str;
      if (str.indexOf("&") === -1) return str;
      const original = str;
      const chunks = [];
      const len = str.length;
      let last = 0;
      let i = 0;
      const limitExpansions = this._maxTotalExpansions > 0;
      const limitLength = this._maxExpandedLength > 0;
      const checkLimits = limitExpansions || limitLength;
      while (i < len) {
        if (str.charCodeAt(i) !== 38) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
        if (j >= len || str.charCodeAt(j) !== 59) {
          i++;
          continue;
        }
        const token = str.slice(i + 1, j);
        if (token.length === 0) {
          i++;
          continue;
        }
        let replacement;
        let tier;
        if (this._removeSet.has(token)) {
          replacement = "";
          if (tier === void 0) {
            tier = LIMIT_TIER_EXTERNAL;
          }
        } else if (this._leaveSet.has(token)) {
          i++;
          continue;
        } else if (token.charCodeAt(0) === 35) {
          const ncrResult = this._resolveNCR(token);
          if (ncrResult === void 0) {
            i++;
            continue;
          }
          replacement = ncrResult;
          tier = LIMIT_TIER_BASE;
        } else {
          const resolved = this._resolveName(token);
          replacement = resolved?.value;
          tier = resolved?.tier;
        }
        if (replacement === void 0) {
          i++;
          continue;
        }
        if (i > last) chunks.push(str.slice(last, i));
        chunks.push(replacement);
        last = j + 1;
        i = last;
        if (checkLimits && this._tierCounts(tier)) {
          if (limitExpansions) {
            this._totalExpansions++;
            if (this._totalExpansions > this._maxTotalExpansions) {
              throw new Error(
                `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
              );
            }
          }
          if (limitLength) {
            const delta = replacement.length - (token.length + 2);
            if (delta > 0) {
              this._expandedLength += delta;
              if (this._expandedLength > this._maxExpandedLength) {
                throw new Error(
                  `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
                );
              }
            }
          }
        }
      }
      if (last < len) chunks.push(str.slice(last));
      const result = chunks.length === 0 ? str : chunks.join("");
      return this._postCheck(result, original);
    }
    // -------------------------------------------------------------------------
    // Private: limit tier check
    // -------------------------------------------------------------------------
    /**
     * Returns true if a resolved entity of the given tier should count
     * against the expansion/length limits.
     * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
     * @returns {boolean}
     */
    _tierCounts(tier) {
      if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
      return this._limitTiers.has(tier);
    }
    // -------------------------------------------------------------------------
    // Private: entity resolution
    // -------------------------------------------------------------------------
    /**
     * Resolve a named entity token (without & and ;).
     * Priority: inputMap > externalMap > baseMap
     * Returns the resolved value tagged with its limit tier.
     *
     * @param {string} name
     * @returns {{ value: string, tier: string }|undefined}
     */
    _resolveName(name) {
      if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
      if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
      if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
      return void 0;
    }
    /**
     * Classify a codepoint and return the minimum action level that must be applied.
     * Returns -1 when no minimum is imposed (normal allow path).
     *
     * Ranges checked (in priority order):
     *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
     *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
     *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
     *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
     *
     * @param {number} cp  — codepoint
     * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
     */
    _classifyNCR(cp) {
      if (cp === 0) return this._ncrNullLevel;
      if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
      if (this._ncrXmlVersion === 1) {
        if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
      }
      return -1;
    }
    /**
     * Execute a resolved NCR action.
     *
     * @param {number} action   — NCR_LEVEL value
     * @param {string} token    — raw token (e.g. '#38') for error messages
     * @param {number} cp       — codepoint, used only for error messages
     * @returns {string|undefined}
     *   - decoded character string  → 'allow'
     *   - ''                        → 'remove'
     *   - undefined                 → 'leave' (caller must skip past '&' only)
     *   - throws Error              → 'throw'
     */
    _applyNCRAction(action, token, cp) {
      switch (action) {
        case NCR_LEVEL.allow:
          return String.fromCodePoint(cp);
        case NCR_LEVEL.remove:
          return "";
        case NCR_LEVEL.leave:
          return void 0;
        // signal: keep literal
        case NCR_LEVEL.throw:
          throw new Error(
            `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
          );
        default:
          return String.fromCodePoint(cp);
      }
    }
    /**
     * Full NCR resolution pipeline for a numeric token.
     *
     * Steps:
     *   1. Parse the codepoint (decimal or hex).
     *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
     *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
     *   4. Classify the codepoint to find the minimum required action level.
     *   5. Resolve effective action = max(onNCR, minimum).
     *   6. Apply and return.
     *
     * @param {string} token  — e.g. '#38', '#x26', '#X26'
     * @returns {string|undefined}
     *   - string (incl. '')  — replacement ('' = remove)
     *   - undefined          — leave original &token; as-is
     */
    _resolveNCR(token) {
      const second = token.charCodeAt(1);
      let cp;
      if (second === 120 || second === 88) {
        cp = parseInt(token.slice(2), 16);
      } else {
        cp = parseInt(token.slice(1), 10);
      }
      if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
      const minimum = this._classifyNCR(cp);
      if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
      const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
      return this._applyNCRAction(effective, token, cp);
    }
  };

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
  var defaultOnDangerousProperty = (name) => {
    if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return "__" + name;
    }
    return name;
  };
  var defaultOptions2 = { preserveOrder: false, attributeNamePrefix: "@_", attributesGroupName: false, textNodeName: "#text", ignoreAttributes: true, removeNSPrefix: false, allowBooleanAttributes: false, parseTagValue: true, parseAttributeValue: false, trimValues: true, cdataPropName: false, numberParseOptions: { hex: true, leadingZeros: true, eNotation: true, unicode: false }, tagValueProcessor: function(tagName, val) {
    return val;
  }, attributeValueProcessor: function(attrName, val) {
    return val;
  }, stopNodes: [], alwaysCreateTextNode: false, isArray: () => false, commentPropName: false, unpairedTags: [], processEntities: true, htmlEntities: false, entityDecoder: null, ignoreDeclaration: false, ignorePiTags: false, transformTagName: false, transformAttributeName: false, updateTag: function(tagName, jPath, attrs) {
    return tagName;
  }, captureMetaData: false, maxNestedTags: 100, strictReservedNames: true, jPath: true, onDangerousProperty: defaultOnDangerousProperty };
  function validatePropertyName(propertyName, optionName) {
    if (typeof propertyName !== "string") {
      return;
    }
    const normalized = propertyName.toLowerCase();
    if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(`[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`);
    }
    if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(`[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`);
    }
  }
  function normalizeProcessEntities(value, htmlEntities) {
    if (typeof value === "boolean") {
      return { enabled: value, maxEntitySize: 1e4, maxExpansionDepth: 1e4, maxTotalExpansions: Infinity, maxExpandedLength: 1e5, maxEntityCount: 1e3, allowedTags: null, tagFilter: null, appliesTo: "all" };
    }
    if (typeof value === "object" && value !== null) {
      return { enabled: value.enabled !== false, maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4), maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4), maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity), maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5), maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3), allowedTags: value.allowedTags ?? null, tagFilter: value.tagFilter ?? null, appliesTo: value.appliesTo ?? "all" };
    }
    return normalizeProcessEntities(true);
  }
  var buildOptions = function(options) {
    const built = Object.assign({}, defaultOptions2, options);
    const propertyNameOptions = [{ value: built.attributeNamePrefix, name: "attributeNamePrefix" }, { value: built.attributesGroupName, name: "attributesGroupName" }, { value: built.textNodeName, name: "textNodeName" }, { value: built.cdataPropName, name: "cdataPropName" }, { value: built.commentPropName, name: "commentPropName" }];
    for (const { value, name } of propertyNameOptions) {
      if (value) {
        validatePropertyName(value, name);
      }
    }
    if (built.onDangerousProperty === null) {
      built.onDangerousProperty = defaultOnDangerousProperty;
    }
    built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
    built.unpairedTagsSet = new Set(built.unpairedTags);
    if (built.stopNodes && Array.isArray(built.stopNodes)) {
      built.stopNodes = built.stopNodes.map((node) => {
        if (typeof node === "string" && node.startsWith("*.")) {
          return ".." + node.substring(2);
        }
        return node;
      });
    }
    return built;
  };

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
  var METADATA_SYMBOL;
  if (typeof Symbol !== "function") {
    METADATA_SYMBOL = "@@xmlMetadata";
  } else {
    METADATA_SYMBOL = Symbol("XML Node Metadata");
  }
  var XmlNode = class {
    constructor(tagname) {
      this.tagname = tagname;
      this.child = [];
      this[":@"] = /* @__PURE__ */ Object.create(null);
    }
    add(key, val) {
      if (key === "__proto__") key = "#__proto__";
      this.child.push({ [key]: val });
    }
    addChild(node, startIndex) {
      if (node.tagname === "__proto__") node.tagname = "#__proto__";
      if (node[":@"] && Object.keys(node[":@"]).length > 0) {
        this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
      } else {
        this.child.push({ [node.tagname]: node.child });
      }
      this.addStartIndex(startIndex);
    }
    addStartIndex(startIndex) {
      if (startIndex !== void 0) {
        this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
      }
    }
    addEndIndex(endIndex) {
      const lastChild = this.child[this.child.length - 1];
      if (lastChild !== void 0 && lastChild[METADATA_SYMBOL] !== void 0 && lastChild[METADATA_SYMBOL].endIndex === void 0) {
        lastChild[METADATA_SYMBOL].endIndex = endIndex;
      }
    }
    static getMetaDataSymbol() {
      return METADATA_SYMBOL;
    }
  };

  // node_modules/.pnpm/xml-naming@0.3.0/node_modules/xml-naming/src/index.js
  var nameStartChar10 = ":A-Za-z_\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
  var nameChar10 = nameStartChar10 + "\\-\\.\\d\xB7\u0300-\u036F\u203F-\u2040";
  var nameStartChar11 = ":A-Za-z_\xC0-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
  var nameChar11 = nameStartChar11 + "\\-\\.\\d\xB7\u0300-\u036F\u0487\u203F-\u2040";
  var buildRegexes = (startChar, char, flags = "") => {
    const ncStart = startChar.replace(":", "");
    const ncChar = char.replace(":", "");
    const ncNamePat = `[${ncStart}][${ncChar}]*`;
    return {
      name: new RegExp(`^[${startChar}][${char}]*$`, flags),
      ncName: new RegExp(`^${ncNamePat}$`, flags),
      qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
      nmToken: new RegExp(`^[${char}]+$`, flags),
      nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
    };
  };
  var regexes10 = buildRegexes(nameStartChar10, nameChar10);
  var regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
  var nameStartCharAscii = ":A-Za-z_";
  var nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
  var regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
  var getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
    if (asciiOnly) return regexesAscii;
    return xmlVersion === "1.1" ? regexes11 : regexes10;
  };
  var qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
  var DocTypeReader = class {
    constructor(options, xmlVersion) {
      this.suppressValidationErr = !options;
      this.options = options;
      this.xmlVersion = xmlVersion || 1;
    }
    setXmlVersion(xmlVersion = 1) {
      this.xmlVersion = xmlVersion;
    }
    readDocType(xmlData, i) {
      const entities = /* @__PURE__ */ Object.create(null);
      let entityCount = 0;
      if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
        i = i + 9;
        let angleBracketsCount = 1;
        let hasBody = false, comment = false;
        let quoteChar = null;
        let exp = "";
        for (; i < xmlData.length; i++) {
          if (quoteChar !== null) {
            if (xmlData[i] === quoteChar) quoteChar = null;
            exp += xmlData[i];
            continue;
          }
          if (!hasBody && !comment && (xmlData[i] === '"' || xmlData[i] === "'")) {
            quoteChar = xmlData[i];
            exp += xmlData[i];
            continue;
          }
          if (xmlData[i] === "<" && !comment) {
            if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
              i += 7;
              let entityName, val;
              [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
              if (val.indexOf("&") === -1) {
                if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                  throw new Error(`Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`);
                }
                entities[entityName] = val;
                entityCount++;
              }
            } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
              i += 8;
              const { index } = this.readElementExp(xmlData, i + 1);
              i = index;
            } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
              i += 8;
            } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
              i += 9;
              const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
              i = index;
            } else if (hasSeq(xmlData, "!--", i)) comment = true;
            else throw new Error(`Invalid DOCTYPE`);
            angleBracketsCount++;
            exp = "";
          } else if (xmlData[i] === ">") {
            if (comment) {
              if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                comment = false;
                angleBracketsCount--;
              }
            } else {
              angleBracketsCount--;
            }
            if (angleBracketsCount === 0) {
              break;
            }
          } else if (xmlData[i] === "[") {
            hasBody = true;
          } else {
            exp += xmlData[i];
          }
        }
        if (quoteChar !== null || angleBracketsCount !== 0) {
          throw new Error(`Unclosed DOCTYPE`);
        }
      } else {
        throw new Error(`Invalid Tag instead of DOCTYPE`);
      }
      return { entities, i };
    }
    readEntityExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
        i++;
      }
      let entityName = xmlData.substring(startIndex, i);
      validateEntityName2(entityName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      if (!this.suppressValidationErr) {
        if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
          throw new Error("External entities are not supported");
        } else if (xmlData[i] === "%") {
          throw new Error("Parameter entities are not supported");
        }
      }
      let entityValue = "";
      [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
      if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
        throw new Error(`Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`);
      }
      i--;
      return [entityName, entityValue, i];
    }
    readNotationExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let notationName = xmlData.substring(startIndex, i);
      !this.suppressValidationErr && validateEntityName2(notationName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      const identifierType = xmlData.substring(i, i + 6).toUpperCase();
      if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
        throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
      }
      i += identifierType.length;
      i = skipWhitespace(xmlData, i);
      let publicIdentifier = null;
      let systemIdentifier = null;
      if (identifierType === "PUBLIC") {
        [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] === '"' || xmlData[i] === "'") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        }
      } else if (identifierType === "SYSTEM") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        if (!this.suppressValidationErr && !systemIdentifier) {
          throw new Error("Missing mandatory system identifier for SYSTEM notation");
        }
      }
      return { notationName, publicIdentifier, systemIdentifier, index: --i };
    }
    readIdentifierVal(xmlData, i, type) {
      let identifierVal = "";
      const startChar = xmlData[i];
      if (startChar !== '"' && startChar !== "'") {
        throw new Error(`Expected quoted string, found "${startChar}"`);
      }
      i++;
      const startIndex = i;
      while (i < xmlData.length && xmlData[i] !== startChar) {
        i++;
      }
      identifierVal = xmlData.substring(startIndex, i);
      if (xmlData[i] !== startChar) {
        throw new Error(`Unterminated ${type} value`);
      }
      i++;
      return [i, identifierVal];
    }
    readElementExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let elementName = xmlData.substring(startIndex, i);
      if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
        throw new Error(`Invalid element name: "${elementName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let contentModel = "";
      if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
      else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
      else if (xmlData[i] === "(") {
        i++;
        const startIndex2 = i;
        while (i < xmlData.length && xmlData[i] !== ")") {
          i++;
        }
        contentModel = xmlData.substring(startIndex2, i);
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated content model");
        }
      } else if (!this.suppressValidationErr) {
        throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
      }
      return { elementName, contentModel: contentModel.trim(), index: i };
    }
    readAttlistExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let elementName = xmlData.substring(startIndex, i);
      validateEntityName2(elementName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let attributeName = xmlData.substring(startIndex, i);
      if (!validateEntityName2(attributeName, { xmlVersion: this.xmlVersion })) {
        throw new Error(`Invalid attribute name: "${attributeName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let attributeType = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
        attributeType = "NOTATION";
        i += 8;
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] !== "(") {
          throw new Error(`Expected '(', found "${xmlData[i]}"`);
        }
        i++;
        let allowedNotations = [];
        while (i < xmlData.length && xmlData[i] !== ")") {
          const startIndex2 = i;
          while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
            i++;
          }
          let notation = xmlData.substring(startIndex2, i);
          notation = notation.trim();
          if (!validateEntityName2(notation, { xmlVersion: this.xmlVersion })) {
            throw new Error(`Invalid notation name: "${notation}"`);
          }
          allowedNotations.push(notation);
          if (xmlData[i] === "|") {
            i++;
            i = skipWhitespace(xmlData, i);
          }
        }
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated list of notations");
        }
        i++;
        attributeType += " (" + allowedNotations.join("|") + ")";
      } else {
        const startIndex2 = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        attributeType += xmlData.substring(startIndex2, i);
        const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
        if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
          throw new Error(`Invalid attribute type: "${attributeType}"`);
        }
      }
      i = skipWhitespace(xmlData, i);
      let defaultValue = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
        defaultValue = "#REQUIRED";
        i += 8;
      } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
        defaultValue = "#IMPLIED";
        i += 7;
      } else {
        [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
      }
      return { elementName, attributeName, attributeType, defaultValue, index: i };
    }
  };
  var skipWhitespace = (data, index) => {
    while (index < data.length && /\s/.test(data[index])) {
      index++;
    }
    return index;
  };
  function hasSeq(data, seq, i) {
    for (let j = 0; j < seq.length; j++) {
      if (seq[j] !== data[i + j + 1]) return false;
    }
    return true;
  }
  function validateEntityName2(name, xmlVersion) {
    if (qName(name, { xmlVersion })) return name;
    else throw new Error(`Invalid entity name ${name}`);
  }

  // node_modules/.pnpm/anynum@1.0.1/node_modules/anynum/digitTable.js
  var SCRIPT_ZEROS = [
    // Basic Latin (ASCII) — included for completeness / pass-through
    48,
    // 0-9
    // Arabic scripts
    1632,
    // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
    1776,
    // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
    // Indic scripts
    2406,
    // Devanagari ०१२३४५६७८९
    2534,
    // Bengali ০১২৩৪৫৬৭৮৯
    2662,
    // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
    2790,
    // Gujarati ૦૧૨૩૪૫૬૭૮૯
    2918,
    // Odia ୦୧୨୩୪୫୬୭୮୯
    3046,
    // Tamil ௦௧௨௩௪௫௬௭௮௯
    3174,
    // Telugu ౦౧౨౩౪౫౬౭౮౯
    3302,
    // Kannada ೦೧೨೩೪೫೬೭೮೯
    3430,
    // Malayalam ൦൧൨൩൪൫൬൭൮൯
    3558,
    // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
    // Southeast Asian scripts
    3664,
    // Thai ๐๑๒๓๔๕๖๗๘๙
    3792,
    // Lao ໐໑໒໓໔໕໖໗໘໙
    3872,
    // Tibetan ༠༡༢༣༤༥༦༧༨༩
    4160,
    // Myanmar ၀၁၂၃၄၅၆၇၈၉
    4240,
    // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
    6112,
    // Khmer ០១២៣៤៥៦៧៨៩
    6160,
    // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
    6470,
    // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
    6608,
    // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
    6784,
    // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
    6800,
    // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
    6992,
    // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
    7088,
    // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
    7232,
    // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
    7248,
    // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
    // Fullwidth (CJK context)
    65296,
    // Fullwidth ０１２３４５６７８９
    // Mathematical digit variants (Unicode math block)
    120782,
    // Mathematical Bold
    120792,
    // Mathematical Double-Struck
    120802,
    // Mathematical Sans-Serif
    120812,
    // Mathematical Sans-Serif Bold
    120822,
    // Mathematical Monospace
    // Other scripts
    66720,
    // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
    68912,
    // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
    69734,
    // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
    69872,
    // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
    69942,
    // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
    70096,
    // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
    70384,
    // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
    70736,
    // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
    70864,
    // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
    71248,
    // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
    71360,
    // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
    71472,
    // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
    71904,
    // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
    72016,
    // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
    72688,
    // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
    72784,
    // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
    73040,
    // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
    73120,
    // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
    73552,
    // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
    92768,
    // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
    92864,
    // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
    93008,
    // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
    123200,
    // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
    123632,
    // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
    124144,
    // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
    125264,
    // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
    130032
    // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
  ];
  var NOT_DIGIT = 255;
  var HIGH_MAP = /* @__PURE__ */ new Map();
  var LOW_MAX = 65535;
  var LOW_MIN = 1632;
  var TABLE_OFFSET = LOW_MIN;
  var TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
  var TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
  for (const zero of SCRIPT_ZEROS) {
    for (let d = 0; d < 10; d++) {
      const cp = zero + d;
      if (cp <= LOW_MAX) {
        TABLE[cp - TABLE_OFFSET] = d;
      } else {
        HIGH_MAP.set(cp, d);
      }
    }
  }

  // node_modules/.pnpm/anynum@1.0.1/node_modules/anynum/anynum.js
  var CHAR_0 = 48;
  var CHAR_9 = 57;
  var CHAR_MINUS = 45;
  var MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
  function anynum(str) {
    if (typeof str !== "string") return str;
    const len = str.length;
    if (len === 0) return str;
    let firstHit = -1;
    for (let i = 0; i < len; i++) {
      const cc = str.charCodeAt(i);
      if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
      if (cc < TABLE_OFFSET) {
        if (MINUS_SET.has(cc)) {
          firstHit = i;
          break;
        }
        continue;
      }
      if (cc >= 55296 && cc <= 56319) {
        if (i + 1 < len) {
          const low = str.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
            if (HIGH_MAP.has(cp)) {
              firstHit = i;
              break;
            }
          }
        }
        continue;
      }
      if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
    }
    if (firstHit === -1) return str;
    const chars = [];
    if (firstHit > 0) chars.push(str.slice(0, firstHit));
    for (let i = firstHit; i < len; i++) {
      const cc = str.charCodeAt(i);
      if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
        chars.push(str[i]);
        continue;
      }
      if (cc < TABLE_OFFSET) {
        chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
        continue;
      }
      if (cc >= 55296 && cc <= 56319) {
        if (i + 1 < len) {
          const low = str.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
            const d2 = HIGH_MAP.get(cp);
            if (d2 !== void 0) {
              chars.push(String.fromCharCode(d2 + 48));
              i++;
              continue;
            }
          }
        }
        chars.push(str[i]);
        continue;
      }
      if (MINUS_SET.has(cc)) {
        chars.push("-");
        continue;
      }
      const d = TABLE[cc - TABLE_OFFSET];
      chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
    }
    return chars.join("");
  }
  var anynum_default = anynum;

  // node_modules/.pnpm/strnum@2.4.2/node_modules/strnum/strnum.js
  var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
  var binRegex = /^0b[01]+$/;
  var octRegex = /^0o[0-7]+$/;
  var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
  var consider = {
    hex: true,
    binary: false,
    octal: false,
    leadingZeros: true,
    decimalPoint: ".",
    eNotation: true,
    //skipLike: /regex/,
    infinity: "original",
    // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
    unicode: false
  };
  function toNumber(str, options = {}) {
    options = Object.assign({}, consider, options);
    if (!str || typeof str !== "string") return str;
    let trimmedStr = str.trim();
    if (trimmedStr.length === 0) return str;
    else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
    else if (trimmedStr === "0") return 0;
    if (options.unicode) {
      trimmedStr = anynum_default(trimmedStr);
      if (trimmedStr === "0") return 0;
    }
    if (options.hex && hexRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 16);
    } else if (options.binary && binRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 2);
    } else if (options.octal && octRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 8);
    } else if (!isFinite(trimmedStr)) {
      return handleInfinity(str, Number(trimmedStr), options);
    } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
      return resolveEnotation(str, trimmedStr, options);
    } else {
      const match = numRegex.exec(trimmedStr);
      if (match) {
        const sign = match[1] || "";
        const leadingZeros = match[2];
        let numTrimmedByZeros = trimZeros(match[3]);
        const decimalAdjacentToLeadingZeros = sign ? (
          // 0., -00., 000.
          str[leadingZeros.length + 1] === "."
        ) : str[leadingZeros.length] === ".";
        if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
          return str;
        } else {
          const num = Number(trimmedStr);
          const parsedStr = String(num);
          if (num === 0) return num;
          if (parsedStr.search(/[eE]/) !== -1) {
            if (options.eNotation) return num;
            else return str;
          } else if (trimmedStr.indexOf(".") !== -1) {
            if (parsedStr === "0") return num;
            else if (parsedStr === numTrimmedByZeros) return num;
            else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
            else return str;
          }
          let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
          if (leadingZeros) {
            return n === parsedStr || sign + n === parsedStr ? num : str;
          } else {
            return n === parsedStr || n === sign + parsedStr ? num : str;
          }
        }
      } else {
        return str;
      }
    }
  }
  var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
  function resolveEnotation(str, trimmedStr, options) {
    if (!options.eNotation) return str;
    const notation = trimmedStr.match(eNotationRegx);
    if (notation) {
      let sign = notation[1] || "";
      const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
      const leadingZeros = notation[2];
      const eAdjacentToLeadingZeros = sign ? (
        // 0E.
        str[leadingZeros.length + 1] === eChar
      ) : str[leadingZeros.length] === eChar;
      if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
      else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
        return Number(trimmedStr);
      } else if (leadingZeros.length > 0) {
        if (options.leadingZeros && !eAdjacentToLeadingZeros) {
          trimmedStr = (notation[1] || "") + notation[3];
          return Number(trimmedStr);
        } else return str;
      } else {
        return Number(trimmedStr);
      }
    } else {
      return str;
    }
  }
  function trimZeros(numStr) {
    if (numStr && numStr.indexOf(".") !== -1) {
      let end = numStr.length;
      while (end > 0 && numStr.charCodeAt(end - 1) === 48) end--;
      numStr = numStr.slice(0, end);
      if (numStr === ".") numStr = "0";
      else if (numStr[0] === ".") numStr = "0" + numStr;
      else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
      return numStr;
    }
    return numStr;
  }
  function parse_int(numStr, base) {
    const str = numStr.trim();
    if (base === 2 || base === 8) numStr = str.substring(2);
    if (parseInt) return parseInt(numStr, base);
    else if (Number.parseInt) return Number.parseInt(numStr, base);
    else if (window && window.parseInt) return window.parseInt(numStr, base);
    else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
  }
  function handleInfinity(str, num, options) {
    const isPositive = num === Infinity;
    switch (options.infinity.toLowerCase()) {
      case "null":
        return null;
      case "infinity":
        return num;
      // Return Infinity or -Infinity
      case "string":
        return isPositive ? "Infinity" : "-Infinity";
      case "original":
      default:
        return str;
    }
  }

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/ignoreAttributes.js
  function getIgnoreAttributesFn(ignoreAttributes) {
    if (typeof ignoreAttributes === "function") {
      return ignoreAttributes;
    }
    if (Array.isArray(ignoreAttributes)) {
      return (attrName) => {
        for (const pattern of ignoreAttributes) {
          if (typeof pattern === "string" && attrName === pattern) {
            return true;
          }
          if (pattern instanceof RegExp && pattern.test(attrName)) {
            return true;
          }
        }
      };
    }
    return () => false;
  }

  // node_modules/.pnpm/path-expression-matcher@1.6.2/node_modules/path-expression-matcher/src/Expression.js
  var Expression = class {
    /**
     * Create a new Expression
     * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
     * @param {Object} options - Configuration options
     * @param {string} options.separator - Path separator (default: '.')
     */
    constructor(pattern, options = {}, data) {
      this.pattern = pattern;
      this.separator = options.separator || ".";
      this.segments = this._parse(pattern);
      this.data = data;
      this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
      this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
      this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
    }
    /**
     * Parse pattern string into segments
     * @private
     * @param {string} pattern - Pattern to parse
     * @returns {Array} Array of segment objects
     */
    _parse(pattern) {
      const segments = [];
      let i = 0;
      let currentPart = "";
      while (i < pattern.length) {
        if (pattern[i] === this.separator) {
          if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
            if (currentPart.trim()) {
              segments.push(this._parseSegment(currentPart.trim()));
              currentPart = "";
            }
            segments.push({ type: "deep-wildcard" });
            i += 2;
          } else {
            if (currentPart.trim()) {
              segments.push(this._parseSegment(currentPart.trim()));
            }
            currentPart = "";
            i++;
          }
        } else {
          currentPart += pattern[i];
          i++;
        }
      }
      if (currentPart.trim()) {
        segments.push(this._parseSegment(currentPart.trim()));
      }
      return segments;
    }
    /**
     * Parse a single segment
     * @private
     * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
     * @returns {Object} Segment object
     */
    _parseSegment(part) {
      const segment = { type: "tag" };
      let bracketContent = null;
      let withoutBrackets = part;
      const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
      if (bracketMatch) {
        withoutBrackets = bracketMatch[1] + bracketMatch[3];
        if (bracketMatch[2]) {
          const content = bracketMatch[2].slice(1, -1);
          if (content) {
            bracketContent = content;
          }
        }
      }
      let namespace = void 0;
      let tagAndPosition = withoutBrackets;
      if (withoutBrackets.includes("::")) {
        const nsIndex = withoutBrackets.indexOf("::");
        namespace = withoutBrackets.substring(0, nsIndex).trim();
        tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
        if (!namespace) {
          throw new Error(`Invalid namespace in pattern: ${part}`);
        }
      }
      let tag = void 0;
      let positionMatch = null;
      if (tagAndPosition.includes(":")) {
        const colonIndex = tagAndPosition.lastIndexOf(":");
        const tagPart = tagAndPosition.substring(0, colonIndex).trim();
        const posPart = tagAndPosition.substring(colonIndex + 1).trim();
        const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
        if (isPositionKeyword) {
          tag = tagPart;
          positionMatch = posPart;
        } else {
          tag = tagAndPosition;
        }
      } else {
        tag = tagAndPosition;
      }
      if (!tag) {
        throw new Error(`Invalid segment pattern: ${part}`);
      }
      segment.tag = tag;
      if (namespace) {
        segment.namespace = namespace;
      }
      if (bracketContent) {
        if (bracketContent.includes("=")) {
          const eqIndex = bracketContent.indexOf("=");
          segment.attrName = bracketContent.substring(0, eqIndex).trim();
          segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
        } else {
          segment.attrName = bracketContent.trim();
        }
      }
      if (positionMatch) {
        const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
        if (nthMatch) {
          segment.position = "nth";
          segment.positionValue = parseInt(nthMatch[1], 10);
        } else {
          segment.position = positionMatch;
        }
      }
      return segment;
    }
    /**
     * Get the number of segments
     * @returns {number}
     */
    get length() {
      return this.segments.length;
    }
    /**
     * Check if expression contains deep wildcard
     * @returns {boolean}
     */
    hasDeepWildcard() {
      return this._hasDeepWildcard;
    }
    /**
     * Check if expression has attribute conditions
     * @returns {boolean}
     */
    hasAttributeCondition() {
      return this._hasAttributeCondition;
    }
    /**
     * Check if expression has position selectors
     * @returns {boolean}
     */
    hasPositionSelector() {
      return this._hasPositionSelector;
    }
    /**
     * Get string representation
     * @returns {string}
     */
    toString() {
      return this.pattern;
    }
  };

  // node_modules/.pnpm/path-expression-matcher@1.6.2/node_modules/path-expression-matcher/src/ExpressionSet.js
  var ExpressionSet = class {
    constructor() {
      this._byDepthAndTag = /* @__PURE__ */ new Map();
      this._wildcardByDepth = /* @__PURE__ */ new Map();
      this._deepWildcards = [];
      this._deepByTerminalTag = /* @__PURE__ */ new Map();
      this._patterns = /* @__PURE__ */ new Set();
      this._sealed = false;
    }
    /**
     * Add an Expression to the set.
     * Duplicate patterns (same pattern string) are silently ignored.
     *
     * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
     * @returns {this} for chaining
     * @throws {TypeError} if called after seal()
     *
     * @example
     * set.add(new Expression('root.users.user'));
     * set.add(new Expression('..script'));
     */
    add(expression) {
      if (this._sealed) {
        throw new TypeError(
          "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
        );
      }
      if (this._patterns.has(expression.pattern)) return this;
      this._patterns.add(expression.pattern);
      if (expression.hasDeepWildcard()) {
        const lastSeg2 = expression.segments[expression.segments.length - 1];
        if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
          const tag2 = lastSeg2.tag;
          if (!this._deepByTerminalTag.has(tag2)) this._deepByTerminalTag.set(tag2, []);
          this._deepByTerminalTag.get(tag2).push(expression);
        } else {
          this._deepWildcards.push(expression);
        }
        return this;
      }
      const depth = expression.length;
      const lastSeg = expression.segments[expression.segments.length - 1];
      const tag = lastSeg?.tag;
      if (!tag || tag === "*") {
        if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
        this._wildcardByDepth.get(depth).push(expression);
      } else {
        const key = `${depth}:${tag}`;
        if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
        this._byDepthAndTag.get(key).push(expression);
      }
      return this;
    }
    /**
     * Add multiple expressions at once.
     *
     * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
     * @returns {this} for chaining
     *
     * @example
     * set.addAll([
     *   new Expression('root.users.user'),
     *   new Expression('root.config.setting'),
     * ]);
     */
    addAll(expressions) {
      for (const expr of expressions) this.add(expr);
      return this;
    }
    /**
     * Check whether a pattern string is already present in the set.
     *
     * @param {import('./Expression.js').default} expression
     * @returns {boolean}
     */
    has(expression) {
      return this._patterns.has(expression.pattern);
    }
    /**
     * Number of expressions in the set.
     * @type {number}
     */
    get size() {
      return this._patterns.size;
    }
    /**
     * Seal the set against further modifications.
     * Useful to prevent accidental mutations after config is built.
     * Calling add() or addAll() on a sealed set throws a TypeError.
     *
     * @returns {this}
     */
    seal() {
      this._sealed = true;
      return this;
    }
    /**
     * Whether the set has been sealed.
     * @type {boolean}
     */
    get isSealed() {
      return this._sealed;
    }
    /**
     * Test whether the matcher's current path matches any expression in the set.
     *
     * Evaluation order (cheapest → most expensive):
     *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
     *  2. Depth-only wildcard bucket — O(1) lookup, rare
     *  3. Deep-wildcard list         — always checked, but usually small
     *
     * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
     * @returns {boolean} true if any expression matches the current path
     *
     * @example
     * if (stopNodes.matchesAny(matcher)) {
     *   // handle stop node
     * }
     */
    matchesAny(matcher) {
      return this.findMatch(matcher) !== null;
    }
    /**
    * Find and return the first Expression that matches the matcher's current path.
    *
    * Uses the same evaluation order as matchesAny (cheapest → most expensive):
    *  1. Exact depth + tag bucket
    *  2. Depth-only wildcard bucket
    *  3. Deep-wildcard list
    *
    * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
    * @returns {import('./Expression.js').default | null} the first matching Expression, or null
    *
    * @example
    * const expr = stopNodes.findMatch(matcher);
    * if (expr) {
    *   // access expr.config, expr.pattern, etc.
    * }
    */
    findMatch(matcher) {
      const depth = matcher.getDepth();
      const tag = matcher.getCurrentTag();
      const exactKey = `${depth}:${tag}`;
      const exactBucket = this._byDepthAndTag.get(exactKey);
      if (exactBucket) {
        for (let i = 0; i < exactBucket.length; i++) {
          if (matcher.matches(exactBucket[i])) return exactBucket[i];
        }
      }
      const wildcardBucket = this._wildcardByDepth.get(depth);
      if (wildcardBucket) {
        for (let i = 0; i < wildcardBucket.length; i++) {
          if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
        }
      }
      const deepBucket = this._deepByTerminalTag.get(tag);
      if (deepBucket) {
        for (let i = 0; i < deepBucket.length; i++) {
          if (matcher.matches(deepBucket[i])) return deepBucket[i];
        }
      }
      for (let i = 0; i < this._deepWildcards.length; i++) {
        if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
      }
      return null;
    }
  };

  // node_modules/.pnpm/path-expression-matcher@1.6.2/node_modules/path-expression-matcher/src/Matcher.js
  var MatcherView = class {
    /**
     * @param {Matcher} matcher - The parent Matcher instance to read from.
     */
    constructor(matcher) {
      this._matcher = matcher;
    }
    /**
     * Get the path separator used by the parent matcher.
     * @returns {string}
     */
    get separator() {
      return this._matcher.separator;
    }
    /**
     * Get current tag name.
     * @returns {string|undefined}
     */
    getCurrentTag() {
      const path = this._matcher.path;
      return path.length > 0 ? path[path.length - 1].tag : void 0;
    }
    /**
     * Get current namespace.
     * @returns {string|undefined}
     */
    getCurrentNamespace() {
      const path = this._matcher.path;
      return path.length > 0 ? path[path.length - 1].namespace : void 0;
    }
    /**
     * Get current node's attribute value.
     * @param {string} attrName
     * @returns {*}
     */
    getAttrValue(attrName) {
      const path = this._matcher.path;
      if (path.length === 0) return void 0;
      return path[path.length - 1].values?.[attrName];
    }
    /**
     * Check if current node has an attribute.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAttr(attrName) {
      const path = this._matcher.path;
      if (path.length === 0) return false;
      const current = path[path.length - 1];
      return current.values !== void 0 && attrName in current.values;
    }
    /**
     * Get the value of a "kept" attribute from the nearest ancestor (or
     * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {*}
     */
    getAnyParentAttr(attrName) {
      return this._matcher.getAnyParentAttr(attrName);
    }
    /**
     * Check whether any ancestor (or the current node) kept the given
     * attribute via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAnyParentAttr(attrName) {
      return this._matcher.hasAnyParentAttr(attrName);
    }
    /**
     * Get current node's sibling position (child index in parent).
     * @returns {number}
     */
    getPosition() {
      const path = this._matcher.path;
      if (path.length === 0) return -1;
      return path[path.length - 1].position ?? 0;
    }
    /**
     * Get current node's repeat counter (occurrence count of this tag name).
     * @returns {number}
     */
    getCounter() {
      const path = this._matcher.path;
      if (path.length === 0) return -1;
      return path[path.length - 1].counter ?? 0;
    }
    /**
     * Get current node's sibling index (alias for getPosition).
     * @returns {number}
     * @deprecated Use getPosition() or getCounter() instead
     */
    getIndex() {
      return this.getPosition();
    }
    /**
     * Get current path depth.
     * @returns {number}
     */
    getDepth() {
      return this._matcher.path.length;
    }
    /**
     * Get path as string.
     * @param {string} [separator] - Optional separator (uses default if not provided)
     * @param {boolean} [includeNamespace=true]
     * @returns {string}
     */
    toString(separator, includeNamespace = true) {
      return this._matcher.toString(separator, includeNamespace);
    }
    /**
     * Get path as array of tag names.
     * @returns {string[]}
     */
    toArray() {
      return this._matcher.path.map((n) => n.tag);
    }
    /**
     * Match current path against an Expression.
     * @param {Expression} expression
     * @returns {boolean}
     */
    matches(expression) {
      return this._matcher.matches(expression);
    }
    /**
     * Match any expression in the given set against the current path.
     * @param {ExpressionSet} exprSet
     * @returns {boolean}
     */
    matchesAny(exprSet) {
      return exprSet.matchesAny(this._matcher);
    }
  };
  var Matcher = class {
    /**
     * Create a new Matcher.
     * @param {Object} [options={}]
     * @param {string} [options.separator='.'] - Default path separator
     */
    constructor(options = {}) {
      this.separator = options.separator || ".";
      this.path = [];
      this.siblingStacks = [];
      this._pathStringCache = null;
      this._view = new MatcherView(this);
      this._keptAttrs = [];
    }
    /**
     * Push a new tag onto the path.
     * @param {string} tagName
     * @param {Object|null} [attrValues=null]
     * @param {string|null} [namespace=null]
     * @param {Object|null} [options=null]
     * @param {string[]} [options.keep] - Names of attributes (from attrValues)
     */
    push(tagName, attrValues = null, namespace = null, options = null) {
      this._pathStringCache = null;
      if (this.path.length > 0) {
        this.path[this.path.length - 1].values = void 0;
      }
      const currentLevel = this.path.length;
      let level = this.siblingStacks[currentLevel];
      if (!level) {
        level = { counts: /* @__PURE__ */ new Map(), total: 0 };
        this.siblingStacks[currentLevel] = level;
      }
      const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
      const counter = level.counts.get(siblingKey) || 0;
      const position = level.total;
      level.counts.set(siblingKey, counter + 1);
      level.total++;
      const node = {
        tag: tagName,
        position,
        counter
      };
      if (namespace !== null && namespace !== void 0) {
        node.namespace = namespace;
      }
      if (attrValues !== null && attrValues !== void 0) {
        node.values = attrValues;
      }
      this.path.push(node);
      const depth = this.path.length;
      const keep = options !== null ? options.keep : null;
      if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
        for (let i = 0; i < keep.length; i++) {
          const name = keep[i];
          if (attrValues[name] !== void 0) {
            this._keptAttrs.push({ depth, name, value: attrValues[name] });
          }
        }
      }
    }
    /**
     * Pop the last tag from the path.
     * @returns {Object|undefined} The popped node
     */
    pop() {
      if (this.path.length === 0) return void 0;
      this._pathStringCache = null;
      const node = this.path.pop();
      if (this.siblingStacks.length > this.path.length + 1) {
        this.siblingStacks.length = this.path.length + 1;
      }
      const poppedDepth = this.path.length + 1;
      while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
        this._keptAttrs.pop();
      }
      return node;
    }
    /**
     * Update current node's attribute values.
     * Useful when attributes are parsed after push.
     * @param {Object} attrValues
     */
    updateCurrent(attrValues) {
      if (this.path.length > 0) {
        const current = this.path[this.path.length - 1];
        if (attrValues !== null && attrValues !== void 0) {
          current.values = attrValues;
        }
      }
    }
    /**
     * Get current tag name.
     * @returns {string|undefined}
     */
    getCurrentTag() {
      return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
    }
    /**
     * Get current namespace.
     * @returns {string|undefined}
     */
    getCurrentNamespace() {
      return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
    }
    /**
     * Get current node's attribute value.
     * @param {string} attrName
     * @returns {*}
     */
    getAttrValue(attrName) {
      if (this.path.length === 0) return void 0;
      return this.path[this.path.length - 1].values?.[attrName];
    }
    /**
     * Check if current node has an attribute.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAttr(attrName) {
      if (this.path.length === 0) return false;
      const current = this.path[this.path.length - 1];
      return current.values !== void 0 && attrName in current.values;
    }
    /**
     * Get the value of a "kept" attribute from the nearest ancestor (or
     * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
     * Unlike getAttrValue(), this works regardless of how deep the path has
     * gone since the attribute was pushed — but only for attribute names that
     * were explicitly marked with `keep` at push time. Cost is proportional to
     * the number of currently-kept attributes (typically 0-3), not path depth.
     * @param {string} attrName
     * @returns {*} the value, or undefined if no ancestor kept this attribute
     */
    getAnyParentAttr(attrName) {
      const kept = this._keptAttrs;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].name === attrName) return kept[i].value;
      }
      return void 0;
    }
    /**
     * Check whether any ancestor (or the current node) kept the given
     * attribute via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAnyParentAttr(attrName) {
      const kept = this._keptAttrs;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].name === attrName) return true;
      }
      return false;
    }
    /**
     * Get current node's sibling position (child index in parent).
     * @returns {number}
     */
    getPosition() {
      if (this.path.length === 0) return -1;
      return this.path[this.path.length - 1].position ?? 0;
    }
    /**
     * Get current node's repeat counter (occurrence count of this tag name).
     * @returns {number}
     */
    getCounter() {
      if (this.path.length === 0) return -1;
      return this.path[this.path.length - 1].counter ?? 0;
    }
    /**
     * Get current node's sibling index (alias for getPosition).
     * @returns {number}
     * @deprecated Use getPosition() or getCounter() instead
     */
    getIndex() {
      return this.getPosition();
    }
    /**
     * Get current path depth.
     * @returns {number}
     */
    getDepth() {
      return this.path.length;
    }
    /**
     * Get path as string.
     * @param {string} [separator] - Optional separator (uses default if not provided)
     * @param {boolean} [includeNamespace=true]
     * @returns {string}
     */
    toString(separator, includeNamespace = true) {
      const sep2 = separator || this.separator;
      const isDefault = sep2 === this.separator && includeNamespace === true;
      if (isDefault) {
        if (this._pathStringCache !== null) {
          return this._pathStringCache;
        }
        const result = this.path.map(
          (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
        ).join(sep2);
        this._pathStringCache = result;
        return result;
      }
      return this.path.map(
        (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep2);
    }
    /**
     * Get path as array of tag names.
     * @returns {string[]}
     */
    toArray() {
      return this.path.map((n) => n.tag);
    }
    /**
     * Reset the path to empty.
     */
    reset() {
      this._pathStringCache = null;
      this.path = [];
      this.siblingStacks = [];
      this._keptAttrs = [];
    }
    /**
     * Match current path against an Expression.
     * @param {Expression} expression
     * @returns {boolean}
     */
    matches(expression) {
      const segments = expression.segments;
      if (segments.length === 0) {
        return false;
      }
      if (expression.hasDeepWildcard()) {
        return this._matchWithDeepWildcard(segments);
      }
      return this._matchSimple(segments);
    }
    /**
     * @private
     */
    _matchSimple(segments) {
      if (this.path.length !== segments.length) {
        return false;
      }
      for (let i = 0; i < segments.length; i++) {
        if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
          return false;
        }
      }
      return true;
    }
    /**
     * @private
     */
    _matchWithDeepWildcard(segments) {
      let pathIdx = this.path.length - 1;
      let segIdx = segments.length - 1;
      while (segIdx >= 0 && pathIdx >= 0) {
        const segment = segments[segIdx];
        if (segment.type === "deep-wildcard") {
          segIdx--;
          if (segIdx < 0) {
            return true;
          }
          const nextSeg = segments[segIdx];
          let found = false;
          for (let i = pathIdx; i >= 0; i--) {
            if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
              pathIdx = i - 1;
              segIdx--;
              found = true;
              break;
            }
          }
          if (!found) {
            return false;
          }
        } else {
          if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
            return false;
          }
          pathIdx--;
          segIdx--;
        }
      }
      return segIdx < 0;
    }
    /**
     * @private
     */
    _matchSegment(segment, node, isCurrentNode) {
      if (segment.tag !== "*" && segment.tag !== node.tag) {
        return false;
      }
      if (segment.namespace !== void 0) {
        if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
          return false;
        }
      }
      if (segment.attrName !== void 0) {
        if (!isCurrentNode) {
          return false;
        }
        if (!node.values || !(segment.attrName in node.values)) {
          return false;
        }
        if (segment.attrValue !== void 0) {
          if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
            return false;
          }
        }
      }
      if (segment.position !== void 0) {
        if (!isCurrentNode) {
          return false;
        }
        const counter = node.counter ?? 0;
        if (segment.position === "first" && counter !== 0) {
          return false;
        } else if (segment.position === "odd" && counter % 2 !== 1) {
          return false;
        } else if (segment.position === "even" && counter % 2 !== 0) {
          return false;
        } else if (segment.position === "nth" && counter !== segment.positionValue) {
          return false;
        }
      }
      return true;
    }
    /**
     * Match any expression in the given set against the current path.
     * @param {ExpressionSet} exprSet
     * @returns {boolean}
     */
    matchesAny(exprSet) {
      return exprSet.matchesAny(this);
    }
    /**
     * Create a snapshot of current state.
     * @returns {Object}
     */
    snapshot() {
      return {
        path: this.path.map((node) => ({ ...node })),
        siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
        keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
      };
    }
    /**
     * Restore state from snapshot.
     * @param {Object} snapshot
     */
    restore(snapshot) {
      this._pathStringCache = null;
      this.path = snapshot.path.map((node) => ({ ...node }));
      this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
      this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
    }
    /**
     * Return the read-only {@link MatcherView} for this matcher.
     *
     * The same instance is returned on every call — no allocation occurs.
     * It always reflects the current parser state and is safe to pass to
     * user callbacks without risk of accidental mutation.
     *
     * @returns {MatcherView}
     *
     * @example
     * const view = matcher.readOnly();
     * // pass view to callbacks — it stays in sync automatically
     * view.matches(expr);       // ✓
     * view.getCurrentTag();     // ✓
     * // view.push(...)         // ✗ method does not exist — caught by TypeScript
     */
    readOnly() {
      return this._view;
    }
  };

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/html.js
  var HTML_PATTERNS = [
    {
      id: "html-script-open",
      description: "<script opening tag",
      pattern: /<script[\s>/]/i
    },
    {
      id: "html-script-close",
      description: "<\/script closing tag",
      pattern: /<\/script[\s>]/i
    },
    {
      id: "html-javascript-protocol",
      description: "javascript: URI scheme (with optional whitespace/encoding)",
      // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
      pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
    },
    {
      id: "html-vbscript-protocol",
      description: "vbscript: URI scheme",
      pattern: /vbscript[\t\n\r ]*:/i
    },
    {
      id: "html-data-html",
      description: "data:text/html URI \u2014 can execute scripts in browsers",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
    },
    {
      id: "html-data-xhtml",
      description: "data:application/xhtml+xml URI",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
    },
    {
      id: "html-data-svg",
      description: "data:image/svg+xml URI \u2014 can execute scripts",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
    },
    {
      id: "html-inline-event-handler",
      description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
      // \bon ensures we match a word boundary so "phonetic=" is not caught
      pattern: /\bon\w{1,30}\s*=/i
    },
    {
      id: "html-entity-obfuscated-script",
      description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
      // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
      pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
    },
    {
      id: "html-entity-obfuscated-javascript",
      description: 'HTML-entity-encoded javascript: (partial \u2014 catches common &#106; or &#x6a; for "j")',
      pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
    },
    {
      id: "html-style-expression",
      description: "CSS expression() \u2014 IE-era code execution in style attributes",
      pattern: /style[\s\S]{0,20}expression\s*\(/i
    },
    {
      id: "html-object-embed",
      description: "<object or <embed tags that can load active content",
      pattern: /<(?:object|embed)[\s>/]/i
    },
    {
      id: "html-base-tag",
      description: "<base href= \u2014 can hijack all relative URLs on a page",
      pattern: /<base[\s>]/i
    },
    {
      id: "html-meta-refresh",
      description: '<meta http-equiv="refresh" \u2014 can redirect users',
      pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
    },
    {
      id: "html-srcdoc",
      description: "srcdoc= attribute on iframes \u2014 embeds HTML that can run scripts",
      pattern: /srcdoc\s*=/i
    },
    {
      id: "html-iframe",
      description: "<iframe tag",
      pattern: /<iframe[\s>/]/i
    },
    {
      id: "html-form",
      description: "<form tag \u2014 can be used for phishing / credential harvesting injection",
      pattern: /<form[\s>/]/i
    }
  ];
  var html_default = HTML_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/xml.js
  var XML_PATTERNS = [
    {
      id: "xml-cdata-injection",
      description: "CDATA section injection: <![CDATA[ breaks out of text node context",
      pattern: /<!\[CDATA\[/i
    },
    {
      id: "xml-cdata-close",
      description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
      pattern: /\]\]>/
    },
    {
      id: "xml-processing-instruction",
      description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
      pattern: /<\?(?:xml[\- ]|php|asp)/i
    },
    {
      id: "xml-doctype-injection",
      description: "DOCTYPE declaration embedded in content \u2014 can define entities",
      // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
      pattern: /<!DOCTYPE(?:[\s[]|$)/i
    },
    {
      id: "xml-entity-system",
      description: "SYSTEM keyword \u2014 used in external entity declarations (XXE)",
      pattern: /\bSYSTEM\s+["']/i
    },
    {
      id: "xml-entity-public",
      description: "PUBLIC keyword \u2014 used in external entity declarations (XXE)",
      pattern: /\bPUBLIC\s+["']/i
    },
    {
      id: "xml-entity-declaration",
      description: "<!ENTITY declaration \u2014 defines entities, potential XXE or entity expansion",
      pattern: /<!ENTITY[\s%]/i
    },
    {
      id: "xml-billion-laughs",
      description: "Entity reference chaining / billion laughs: repeated &eX; style references",
      // Heuristic: 3+ consecutive entity refs suggests expansion attack
      pattern: /(?:&\w{1,20};){3,}/
    },
    {
      id: "xml-namespace-confusion",
      description: "xmlns: attribute injection \u2014 can redefine namespaces to confuse parsers",
      // pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i,
      pattern: /\bxmlns(?::\w{1,40})?\s*=/i
    },
    {
      id: "xml-comment-injection",
      description: "<!-- comment injection \u2014 can hide content from some parsers",
      pattern: /<!--/
    },
    {
      id: "xml-comment-close",
      description: "--> closes an enclosing XML comment",
      pattern: /-->/
    },
    {
      id: "xml-pi-close",
      description: "?> closes an enclosing processing instruction",
      pattern: /\?>/
    }
  ];
  var xml_default = XML_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/svg.js
  var SVG_PATTERNS = [
    {
      id: "svg-script-element",
      description: "<script element inside SVG executes JavaScript",
      pattern: /<script[\s>/]/i
    },
    {
      id: "svg-xlink-href-javascript",
      description: "xlink:href with javascript: \u2014 classic SVG XSS via <a> or <use>",
      pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-href-javascript",
      description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
      pattern: /href\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-foreignobject",
      description: "<foreignObject embeds HTML inside SVG \u2014 can execute scripts",
      pattern: /<foreignObject[\s>/]/i
    },
    {
      id: "svg-use-external",
      description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
      // Match <use with href= where the value starts with a non-# character (external URL)
      // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
      pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
    },
    {
      id: "svg-animate-href",
      description: '<animate attributeName="href" \u2014 can dynamically change href to javascript:',
      pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
    },
    {
      id: "svg-animate-xlinkhref",
      description: '<animate attributeName="xlink:href"',
      pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
    },
    {
      id: "svg-set-javascript",
      description: '<set to="javascript:..." \u2014 sets an attribute to a javascript: URI',
      pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-event-handler",
      description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
      pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
    },
    {
      id: "svg-handler-generic",
      description: "Generic on* handler catch-all for SVG attributes",
      pattern: /\bon\w{1,30}\s*=/i
    },
    {
      id: "svg-filter-feimage",
      description: "<feImage href= \u2014 filter primitive that can load external resources",
      pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
    },
    {
      id: "svg-image-external",
      description: "<image xlink:href with http/https or javascript protocol",
      pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
    },
    {
      id: "svg-style-javascript",
      description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
      pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
    }
  ];
  var svg_default = SVG_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/sql.js
  var SQL_PATTERNS = [
    {
      id: "sql-block-comment-open",
      description: "SQL block comment open: /* ... */ \u2014 unusual in legitimate user text",
      pattern: /\/\*/
    },
    {
      id: "sql-union-select",
      description: "UNION SELECT \u2014 most common SQL injection aggregation attack",
      pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
    },
    {
      id: "sql-drop-table",
      description: "DROP TABLE \u2014 destructive DDL injection",
      pattern: /\bDROP\s{1,20}TABLE\b/i
    },
    {
      id: "sql-drop-database",
      description: "DROP DATABASE \u2014 destructive DDL injection",
      pattern: /\bDROP\s{1,20}DATABASE\b/i
    },
    {
      id: "sql-insert-into",
      description: "INSERT INTO \u2014 data injection",
      pattern: /\bINSERT\s{1,20}INTO\b/i
    },
    {
      id: "sql-delete-from",
      description: "DELETE FROM \u2014 data deletion injection",
      pattern: /\bDELETE\s{1,20}FROM\b/i
    },
    {
      id: "sql-update-set",
      description: "UPDATE ... SET \u2014 data modification injection",
      // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
      pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
    },
    {
      id: "sql-exec-xp",
      description: "EXEC xp_ \u2014 MSSQL extended stored procedure execution",
      pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
    },
    {
      id: "sql-tautology-string",
      description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
      // Last quote is optional — injection may truncate it: ' OR '1'='1--
      pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
    },
    {
      id: "sql-tautology-numeric",
      description: "Numeric tautology: OR 1=1",
      pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
    },
    {
      id: "sql-always-true-zero",
      description: "Numeric tautology: OR 0=0",
      pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
    },
    {
      id: "sql-sleep-benchmark",
      description: "Time-based blind injection: SLEEP() or BENCHMARK()",
      pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
    },
    {
      id: "sql-waitfor-delay",
      description: "MSSQL time-based blind injection: WAITFOR DELAY",
      pattern: /\bWAITFOR\s{1,20}DELAY\b/i
    },
    {
      id: "sql-char-function",
      description: "CHAR() function \u2014 used to obfuscate injected strings",
      pattern: /\bCHAR\s*\(\s*\d{1,3}/i
    },
    {
      id: "sql-information-schema",
      description: "INFORMATION_SCHEMA \u2014 reconnaissance query for table/column enumeration",
      pattern: /\bINFORMATION_SCHEMA\b/i
    }
  ];
  var sql_default = SQL_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/shell.js
  var SHELL_PATTERNS = [
    {
      id: "shell-path-traversal-unix",
      description: "Unix path traversal: ../  \u2014 climbing the directory tree",
      pattern: /\.\.\//
    },
    {
      id: "shell-path-traversal-windows",
      description: "Windows path traversal: ..\\ \u2014 climbing the directory tree",
      pattern: /\.\.\\/
    },
    {
      id: "shell-path-traversal-encoded",
      description: "URL-encoded path traversal: %2e%2e or %2f variants",
      pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
    },
    {
      id: "shell-null-byte",
      description: "Null byte injection: \\x00 or %00 \u2014 truncates strings in C-backed functions",
      pattern: /\x00|%00/
    },
    {
      id: "shell-semicolon",
      description: "Semicolon command separator: cmd1; cmd2",
      pattern: /;/
    },
    {
      id: "shell-pipe",
      description: "Pipe operator: cmd1 | cmd2",
      pattern: /\|/
    },
    {
      id: "shell-and-operator",
      description: "AND operator: cmd1 && cmd2",
      pattern: /&&/
    },
    {
      id: "shell-or-operator",
      description: "OR operator: cmd1 || cmd2",
      pattern: /\|\|/
    },
    {
      id: "shell-backtick",
      description: "Backtick command substitution: `cmd`",
      pattern: /`/
    },
    {
      id: "shell-dollar-paren",
      description: "Dollar-paren command substitution: $(cmd)",
      pattern: /\$\(/
    },
    {
      id: "shell-dollar-brace",
      description: "Dollar-brace variable expansion: ${var} \u2014 can be abused for injection",
      pattern: /\$\{/
    },
    {
      id: "shell-redirect-out",
      description: "Output redirection: cmd > file or cmd >> file",
      pattern: />{1,2}/
    },
    {
      id: "shell-redirect-in",
      description: "Input redirection: cmd < file",
      pattern: /</
    },
    {
      id: "shell-newline-injection",
      description: "Newline injection: \\n or \\r \u2014 can inject new shell commands",
      pattern: /[\n\r]/
    },
    {
      id: "shell-glob-star",
      description: "Glob expansion: * or ? \u2014 can expand to unintended files",
      // Only flag when combined with path separators to reduce false positives
      pattern: /[/\\][*?]/
    },
    {
      id: "shell-absolute-root",
      description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
      pattern: /^(?:\/|\\\\)/
    },
    {
      id: "shell-windows-drive",
      description: "Windows drive letter path injection: C:\\ or D:/",
      pattern: /^[a-zA-Z]:[/\\]/
    },
    {
      id: "shell-curl-wget",
      description: "curl/wget with URL or flags \u2014 can exfiltrate data or download payloads",
      // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
      // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
      pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
    }
  ];
  var shell_default = SHELL_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/redos.js
  var REDOS_PATTERNS = [
    {
      id: "redos-nested-quantifier-plus",
      description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
      // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
      pattern: /\([^)]*\+[^)]*\)[+*]/
    },
    {
      id: "redos-nested-quantifier-star",
      description: "Nested * quantifier: (a*)* or (a*)+ \u2014 catastrophic backtracking",
      pattern: /\([^)]*\*[^)]*\)[*+]/
    },
    {
      id: "redos-nested-groups",
      description: "Doubly nested quantified groups: ((a+)+) \u2014 guaranteed catastrophic",
      pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
    },
    {
      id: "redos-alternation-overlap",
      description: "Overlapping alternation under quantifier: (a|a)+ \u2014 ambiguous NFA paths",
      // Detect repeated identical alternatives under a quantifier
      pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
    },
    {
      id: "redos-star-plus-concat",
      description: "(x*x)+ pattern \u2014 triggers super-linear backtracking",
      pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
    },
    {
      id: "redos-dot-star-greedy",
      description: "(.*){n,} or (.+){n,} \u2014 repeated greedy dot quantifiers",
      pattern: /\(\.[*+]\)\{?\d/
    },
    {
      id: "redos-large-repetition",
      description: "Very large fixed or range repetition count {1000,} or {1000,n} \u2014 denial of service via backtracking",
      // Matches { followed by 4+ digits (≥1000), then optional ,digits }
      pattern: /\{\d{4,}(?:,\d*)?\}/
    },
    {
      id: "redos-catastrophic-alternation",
      description: "Long alternation with many similar branches \u2014 polynomial backtracking risk",
      // Heuristic: 10+ pipe-separated alternatives in a single group
      pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
    }
  ];
  var redos_default = REDOS_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/nosql.js
  var sep = `["'\\s]*:`;
  var NOSQL_PATTERNS = [
    // ─── MongoDB $ operator injection ────────────────────────────────────────
    {
      id: "nosql-where-operator",
      description: "$where \u2014 executes arbitrary JavaScript server-side in MongoDB",
      pattern: new RegExp(`\\$where${sep}`, "i")
    },
    {
      id: "nosql-ne-operator",
      description: '$ne \u2014 "not equal" operator used to bypass equality checks',
      pattern: new RegExp(`\\$ne${sep}`, "i")
    },
    {
      id: "nosql-gt-operator",
      description: '$gt \u2014 "greater than" used to bypass password/value checks',
      pattern: new RegExp(`\\$gte?${sep}`, "i")
    },
    {
      id: "nosql-lt-operator",
      description: '$lt / $lte \u2014 "less than" bypass variants',
      pattern: new RegExp(`\\$lte?${sep}`, "i")
    },
    {
      id: "nosql-regex-operator",
      description: "$regex \u2014 can be used to extract data character by character (blind injection)",
      pattern: new RegExp(`\\$regex${sep}`, "i")
    },
    {
      id: "nosql-or-operator",
      description: "$or \u2014 logical OR; used to create always-true conditions",
      pattern: new RegExp(`\\$or${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-and-operator",
      description: "$and \u2014 logical AND operator injection",
      pattern: new RegExp(`\\$and${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-nor-operator",
      description: "$nor \u2014 logical NOR operator injection",
      pattern: new RegExp(`\\$nor${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-exists-operator",
      description: "$exists \u2014 can enumerate fields to determine schema",
      pattern: new RegExp(`\\$exists${sep}`, "i")
    },
    {
      id: "nosql-in-operator",
      description: "$in \u2014 matches any value in a list; can enumerate values",
      pattern: new RegExp(`\\$in${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-expr-operator",
      description: "$expr \u2014 allows aggregation expressions in queries (MongoDB 3.6+)",
      pattern: new RegExp(`\\$expr${sep}`, "i")
    },
    {
      id: "nosql-function-operator",
      description: "$function \u2014 executes arbitrary JavaScript in MongoDB 4.4+",
      pattern: new RegExp(`\\$function${sep}`, "i")
    },
    {
      id: "nosql-accumulator-operator",
      description: "$accumulator \u2014 custom aggregation with arbitrary JS execution",
      pattern: new RegExp(`\\$accumulator${sep}`, "i")
    },
    // ─── Prototype pollution ─────────────────────────────────────────────────
    {
      id: "nosql-proto-pollution",
      description: "__proto__ \u2014 prototype pollution via object key injection",
      pattern: /__proto__/
    },
    {
      id: "nosql-constructor-prototype",
      description: "constructor.prototype \u2014 alternative prototype pollution vector (dot notation or JSON key)",
      // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
      // ("constructor": {"prototype": ...})
      pattern: /constructor[\s"':.,{\[]*prototype/i
    },
    {
      id: "nosql-proto-bracket",
      description: '["__proto__"] \u2014 bracket-notation prototype pollution',
      pattern: /\[["']__proto__["']\]/
    }
  ];
  var nosql_default = NOSQL_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/log.js
  var LOG_PATTERNS = [
    // ─── CRLF / newline injection ─────────────────────────────────────────────
    {
      id: "log-crlf-injection",
      description: "CRLF injection: literal \\r or \\n embeds fake log lines",
      pattern: /[\r\n]/
    },
    {
      id: "log-url-encoded-crlf",
      description: "URL-encoded CRLF: %0d, %0a, %0D, %0A \u2014 decoded by some log parsers",
      pattern: /%0[dDaA]/
    },
    {
      id: "log-unicode-newline",
      description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
      pattern: /[\u2028\u2029]/
    },
    // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
    {
      id: "log-log4shell-jndi",
      description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
      pattern: /\$\{jndi\s*:/i
    },
    {
      id: "log-log4shell-obfuscated",
      description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
      // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
      pattern: /\$\{::-/
    },
    {
      id: "log-log4j-lookup",
      description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} \u2014 data exfiltration",
      pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
    },
    // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
    {
      id: "log-ssti-double-brace",
      description: "SSTI double-brace: {{expression}} \u2014 Jinja2, Twig, Handlebars, etc.",
      pattern: /\{\{[\s\S]{0,80}\}\}/
    },
    {
      id: "log-ssti-hash-brace",
      description: "SSTI hash-brace: #{expression} \u2014 Thymeleaf, Velocity, Ruby ERB",
      pattern: /#\{[\s\S]{0,80}\}/
    },
    {
      id: "log-ssti-dollar-brace",
      description: "SSTI/EL injection: ${expression with operators or method calls} \u2014 JSP EL, Freemarker, SpEL",
      // Require that the ${...} content looks like an expression, not a plain variable name.
      // Flags if the content contains: . ( * + operators, or known SSTI keywords.
      // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
      pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
    },
    {
      id: "log-ssti-percent-tag",
      description: "SSTI ERB/ASP tag: <%= expression %> \u2014 Ruby ERB, ASP",
      pattern: /<%=[\s\S]{0,80}%>/
    },
    // ─── Null byte ────────────────────────────────────────────────────────────
    {
      id: "log-null-byte",
      description: "Null byte: \\x00 or %00 \u2014 can truncate log entries in C-backed loggers",
      pattern: /\x00|%00/
    },
    // ─── ANSI escape injection ────────────────────────────────────────────────
    {
      id: "log-ansi-escape",
      description: "ANSI escape sequence: ESC[ \u2014 can manipulate terminal output when logs are tailed",
      pattern: /\x1b\[/
    }
  ];
  var log_default = LOG_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/contexts/sql-strict.js
  var SQL_STRICT_EXTRA = [
    {
      id: "sql-line-comment",
      description: "SQL line comment: -- followed by whitespace or end of string",
      pattern: /--(?:\s|$)/
    },
    {
      id: "sql-stacked-query",
      description: "Stacked queries: semicolon immediately followed by a SQL keyword",
      pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
    },
    {
      id: "sql-hex-encoding",
      description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
      pattern: /\b0x[0-9a-f]{4,}/i
    }
  ];
  var SQL_STRICT_PATTERNS = [...sql_default, ...SQL_STRICT_EXTRA];
  var sql_strict_default = SQL_STRICT_PATTERNS;

  // node_modules/.pnpm/is-unsafe@2.0.2/node_modules/is-unsafe/src/index.js
  html_default.label = "HTML";
  xml_default.label = "XML";
  svg_default.label = "SVG";
  sql_default.label = "SQL";
  sql_strict_default.label = "SQL-STRICT";
  shell_default.label = "SHELL";
  redos_default.label = "REDOS";
  nosql_default.label = "NOSQL";
  log_default.label = "LOG";
  var VALID_CONTEXTS = Object.freeze({
    HTML: html_default,
    XML: xml_default,
    SVG: svg_default,
    SQL: sql_default,
    "SQL-STRICT": sql_strict_default,
    SHELL: shell_default,
    REDOS: redos_default,
    NOSQL: nosql_default,
    LOG: log_default
  });
  function assertString(value) {
    if (typeof value !== "string") {
      throw new TypeError(
        `is-unsafe: first argument must be a string, got ${typeof value}`
      );
    }
  }
  function assertContext(context) {
    if (context instanceof RegExp) return;
    if (Array.isArray(context)) {
      if (context.length === 0) {
        throw new TypeError("is-unsafe: context must not be an empty array");
      }
      if (Array.isArray(context[0])) {
        for (const list of context) {
          if (!Array.isArray(list) || list.length === 0) {
            throw new TypeError(
              "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
            );
          }
        }
      }
      return;
    }
    throw new TypeError(
      `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
    );
  }
  function normalise(context) {
    if (context instanceof RegExp) return { lists: null, regex: context };
    if (Array.isArray(context[0])) return { lists: context, regex: null };
    return { lists: [context], regex: null };
  }
  function matchList(value, list) {
    const label = list.label ?? "CUSTOM";
    for (const rule of list) {
      if (rule.pattern.test(value)) {
        return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
      }
    }
    return null;
  }
  function isUnsafe(value, context) {
    assertString(value);
    assertContext(context);
    const { lists, regex } = normalise(context);
    if (regex) return regex.test(value);
    for (const list of lists) {
      if (matchList(value, list) !== null) return true;
    }
    return false;
  }

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
  function extractRawAttributes(prefixedAttrs, options) {
    if (!prefixedAttrs) return {};
    const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
    if (!attrs) return {};
    const rawAttrs = {};
    for (const key in attrs) {
      if (key.startsWith(options.attributeNamePrefix)) {
        const rawName = key.substring(options.attributeNamePrefix.length);
        rawAttrs[rawName] = attrs[key];
      } else {
        rawAttrs[key] = attrs[key];
      }
    }
    return rawAttrs;
  }
  function extractNamespace(rawTagName) {
    if (!rawTagName || typeof rawTagName !== "string") return void 0;
    const colonIndex = rawTagName.indexOf(":");
    if (colonIndex !== -1 && colonIndex > 0) {
      const ns = rawTagName.substring(0, colonIndex);
      if (ns !== "xmlns") {
        return ns;
      }
    }
    return void 0;
  }
  var OrderedObjParser = class {
    constructor(options, externalEntities) {
      this.options = options;
      this.currentNode = null;
      this.tagsNodeStack = [];
      this.parseXml = parseXml;
      this.parseTextData = parseTextData;
      this.resolveNameSpace = resolveNameSpace;
      this.buildAttributesMap = buildAttributesMap;
      this.isItStopNode = isItStopNode;
      this.replaceEntitiesValue = replaceEntitiesValue;
      this.readStopNodeData = readStopNodeData;
      this.saveTextToParentTag = saveTextToParentTag;
      this.addChild = addChild;
      this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      this.doctypefound = false;
      let namedEntities = { ...XML };
      if (this.options.entityDecoder) {
        this.entityDecoder = this.options.entityDecoder;
      } else {
        if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
        else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
        this.entityDecoder = new EntityDecoder({ namedEntities: { ...namedEntities, ...externalEntities }, numericAllowed: this.options.htmlEntities, limit: { maxTotalExpansions: this.options.processEntities.maxTotalExpansions, maxExpandedLength: this.options.processEntities.maxExpandedLength, applyLimitsTo: this.options.processEntities.appliesTo }, onInputEntity: (name, value) => isUnsafe(value, [html_default, xml_default]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW });
      }
      this.matcher = new Matcher();
      this.readonlyMatcher = this.matcher.readOnly();
      this.isCurrentNodeStopNode = false;
      this.stopNodeExpressionsSet = new ExpressionSet();
      const stopNodesOpts = this.options.stopNodes;
      if (stopNodesOpts && stopNodesOpts.length > 0) {
        for (let i = 0; i < stopNodesOpts.length; i++) {
          const stopNodeExp = stopNodesOpts[i];
          if (typeof stopNodeExp === "string") {
            this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
          } else if (stopNodeExp instanceof Expression) {
            this.stopNodeExpressionsSet.add(stopNodeExp);
          }
        }
        this.stopNodeExpressionsSet.seal();
      }
    }
  };
  function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
    const options = this.options;
    if (val !== void 0) {
      if (options.trimValues && !dontTrim) {
        val = val.trim();
      }
      if (val.length > 0) {
        if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
        const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
        const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
        if (newval === null || newval === void 0) {
          return val;
        } else if (typeof newval !== typeof val || newval !== val) {
          return newval;
        } else if (options.trimValues) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          const trimmedVal = val.trim();
          if (trimmedVal === val) {
            return parseValue(val, options.parseTagValue, options.numberParseOptions);
          } else {
            return val;
          }
        }
      }
    }
  }
  function resolveNameSpace(tagname) {
    if (this.options.removeNSPrefix) {
      const tags = tagname.split(":");
      const prefix = tagname.charAt(0) === "/" ? "/" : "";
      if (tags[0] === "xmlns") {
        return "";
      }
      if (tags.length === 2) {
        tagname = prefix + tags[1];
      }
    }
    return tagname;
  }
  var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
  function buildAttributesMap(attrStr, jPath, tagName, force = false) {
    const options = this.options;
    if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
      const matches = getAllMatches(attrStr, attrsRegx);
      const len = matches.length;
      const attrs = {};
      const processedVals = new Array(len);
      let hasRawAttrs = false;
      const rawAttrsForMatcher = {};
      for (let i = 0; i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        const oldVal = matches[i][4];
        if (attrName.length && oldVal !== void 0) {
          let val = oldVal;
          if (options.trimValues) val = val.trim();
          val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
          processedVals[i] = val;
          rawAttrsForMatcher[attrName] = val;
          hasRawAttrs = true;
        }
      }
      if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
        jPath.updateCurrent(rawAttrsForMatcher);
      }
      const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
      let hasAttrs = false;
      for (let i = 0; i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
        let aName = options.attributeNamePrefix + attrName;
        if (attrName.length) {
          if (options.transformAttributeName) {
            aName = options.transformAttributeName(aName);
          }
          aName = sanitizeName(aName, options);
          if (matches[i][4] !== void 0) {
            const oldVal = processedVals[i];
            const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
            if (newVal === null || newVal === void 0) {
              attrs[aName] = oldVal;
            } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
              attrs[aName] = newVal;
            } else {
              attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
            }
            hasAttrs = true;
          } else if (options.allowBooleanAttributes) {
            attrs[aName] = true;
            hasAttrs = true;
          }
        }
      }
      if (!hasAttrs) return;
      if (options.attributesGroupName && !options.preserveOrder) {
        const attrCollection = {};
        attrCollection[options.attributesGroupName] = attrs;
        return attrCollection;
      }
      return attrs;
    }
  }
  var parseXml = function(xmlData) {
    xmlData = xmlData.replace(/\r\n?/g, "\n");
    const xmlObj = new XmlNode("!xml");
    let currentNode = xmlObj;
    let textData = "";
    this.matcher.reset();
    this.entityDecoder.reset();
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    this.doctypefound = false;
    const options = this.options;
    const docTypeReader = new DocTypeReader(options.processEntities);
    const xmlLen = xmlData.length;
    for (let i = 0; i < xmlLen; i++) {
      const ch = xmlData[i];
      if (ch === "<") {
        const c1 = xmlData.charCodeAt(i + 1);
        if (c1 === 47) {
          const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
          let tagName = xmlData.substring(i + 2, closeIndex).trim();
          if (options.removeNSPrefix) {
            const colonIndex = tagName.indexOf(":");
            if (colonIndex !== -1) {
              tagName = tagName.substr(colonIndex + 1);
            }
          }
          tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
          if (currentNode) {
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          }
          const lastTagName = this.matcher.getCurrentTag();
          if (tagName && options.unpairedTagsSet.has(tagName)) {
            throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
          }
          if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
            this.matcher.pop();
            this.tagsNodeStack.pop();
          }
          this.matcher.pop();
          this.isCurrentNodeStopNode = false;
          currentNode = this.tagsNodeStack.pop() || xmlObj;
          if (options.captureMetaData && currentNode) {
            currentNode.addEndIndex(closeIndex + 1);
          }
          textData = "";
          i = closeIndex;
        } else if (c1 === 63) {
          let tagData = readTagExp(xmlData, i, false, "?>");
          if (!tagData) throw new Error("Pi Tag is not closed.");
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
          if (attsMap) {
            const ver = attsMap[this.options.attributeNamePrefix + "version"];
            this.entityDecoder.setXmlVersion(Number(ver) || 1);
            docTypeReader.setXmlVersion(Number(ver) || 1);
          }
          if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) {
          } else {
            const childNode = new XmlNode(tagData.tagName);
            childNode.add(options.textNodeName, "");
            if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
              childNode[":@"] = attsMap;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, i);
            if (options.captureMetaData) {
              currentNode.addEndIndex(tagData.closeIndex + 2);
            }
          }
          i = tagData.closeIndex + 1;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
          const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
          if (options.commentPropName) {
            const comment = xmlData.substring(i + 4, endIndex - 2);
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
          }
          i = endIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
          if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
          this.doctypefound = true;
          const result = docTypeReader.readDocType(xmlData, i);
          this.entityDecoder.addInputEntities(result.entities);
          i = result.i;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
          const tagExp = xmlData.substring(i + 9, closeIndex);
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
          if (val == void 0) val = "";
          if (options.cdataPropName) {
            currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
          } else {
            currentNode.add(options.textNodeName, val);
          }
          i = closeIndex + 2;
        } else {
          let result = readTagExp(xmlData, i, options.removeNSPrefix);
          if (!result) {
            const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
            throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
          }
          let tagName = result.tagName;
          const rawTagName = result.rawTagName;
          let tagExp = result.tagExp;
          let attrExpPresent = result.attrExpPresent;
          let closeIndex = result.closeIndex;
          ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
          if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
            throw new Error(`Invalid tag name: ${tagName}`);
          }
          if (currentNode && textData) {
            if (currentNode.tagname !== "!xml") {
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
            }
          }
          const lastTag = currentNode;
          if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
            currentNode = this.tagsNodeStack.pop();
            this.matcher.pop();
          }
          let isSelfClosing = false;
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            isSelfClosing = true;
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            attrExpPresent = tagName !== tagExp;
          }
          let prefixedAttrs = null;
          let rawAttrs = {};
          let namespace = void 0;
          namespace = extractNamespace(rawTagName);
          if (tagName !== xmlObj.tagname) {
            this.matcher.push(tagName, {}, namespace);
          }
          if (tagName !== tagExp && attrExpPresent) {
            prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
            if (prefixedAttrs) {
              rawAttrs = extractRawAttributes(prefixedAttrs, options);
            }
          }
          if (tagName !== xmlObj.tagname) {
            this.isCurrentNodeStopNode = this.isItStopNode();
          }
          const startIndex = i;
          if (this.isCurrentNodeStopNode) {
            let tagContent = "";
            if (isSelfClosing) {
              i = result.closeIndex;
            } else if (options.unpairedTagsSet.has(tagName)) {
              i = result.closeIndex;
            } else {
              const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
              if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
              i = result2.i;
              tagContent = result2.tagContent;
            }
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            childNode.add(options.textNodeName, tagContent);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            if (options.captureMetaData) {
              currentNode.addEndIndex(i + 1);
            }
          } else {
            if (isSelfClosing) {
              ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              if (options.captureMetaData) {
                currentNode.addEndIndex(closeIndex + 1);
              }
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
            } else if (options.unpairedTagsSet.has(tagName)) {
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              if (options.captureMetaData) {
                currentNode.addEndIndex(result.closeIndex + 1);
              }
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
              i = result.closeIndex;
              continue;
            } else {
              const childNode = new XmlNode(tagName);
              if (this.tagsNodeStack.length > options.maxNestedTags) {
                throw new Error("Maximum nested tags exceeded");
              }
              this.tagsNodeStack.push(currentNode);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              currentNode = childNode;
            }
            textData = "";
            i = closeIndex;
          }
        }
      } else {
        textData += xmlData[i];
      }
    }
    return xmlObj.child;
  };
  function addChild(currentNode, childNode, matcher, startIndex) {
    if (!this.options.captureMetaData) startIndex = void 0;
    const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
    const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
    if (result === false) {
    } else if (typeof result === "string") {
      childNode.tagname = result;
      currentNode.addChild(childNode, startIndex);
    } else {
      currentNode.addChild(childNode, startIndex);
    }
  }
  function replaceEntitiesValue(val, tagName, jPath) {
    const entityConfig = this.options.processEntities;
    if (!entityConfig || !entityConfig.enabled) {
      return val;
    }
    if (entityConfig.allowedTags) {
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
      if (!allowed) {
        return val;
      }
    }
    if (entityConfig.tagFilter) {
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
        return val;
      }
    }
    return this.entityDecoder.decode(val);
  }
  function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
    if (textData) {
      if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
      textData = this.parseTextData(textData, parentNode.tagname, matcher, false, parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false, isLeafNode);
      if (textData !== void 0 && textData !== "") parentNode.add(this.options.textNodeName, textData);
      textData = "";
    }
    return textData;
  }
  function isItStopNode() {
    if (this.stopNodeExpressionsSet.size === 0) return false;
    return this.matcher.matchesAny(this.stopNodeExpressionsSet);
  }
  function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
    let attrBoundary = 0;
    const len = xmlData.length;
    const closeCode0 = closingChar.charCodeAt(0);
    const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
    let result = "";
    let segmentStart = i;
    for (let index = i; index < len; index++) {
      const code = xmlData.charCodeAt(index);
      if (attrBoundary) {
        if (code === attrBoundary) attrBoundary = 0;
      } else if (code === 34 || code === 39) {
        attrBoundary = code;
      } else if (code === closeCode0) {
        if (closeCode1 !== -1) {
          if (xmlData.charCodeAt(index + 1) === closeCode1) {
            result += xmlData.substring(segmentStart, index);
            return { data: result, index };
          }
        } else {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else if (code === 9 && !attrBoundary) {
        result += xmlData.substring(segmentStart, index) + " ";
        segmentStart = index + 1;
      }
    }
  }
  function findClosingIndex(xmlData, str, i, errMsg) {
    const closingIndex = xmlData.indexOf(str, i);
    if (closingIndex === -1) {
      throw new Error(errMsg);
    } else {
      return closingIndex + str.length - 1;
    }
  }
  function findClosingChar(xmlData, char, i, errMsg) {
    const closingIndex = xmlData.indexOf(char, i);
    if (closingIndex === -1) throw new Error(errMsg);
    return closingIndex;
  }
  function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
    const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
    if (!result) return;
    let tagExp = result.data;
    const closeIndex = result.index;
    const separatorIndex = tagExp.search(/\s/);
    let tagName = tagExp;
    let attrExpPresent = true;
    if (separatorIndex !== -1) {
      tagName = tagExp.substring(0, separatorIndex);
      tagExp = tagExp.substring(separatorIndex + 1).trimStart();
    }
    const rawTagName = tagName;
    if (removeNSPrefix) {
      const colonIndex = tagName.indexOf(":");
      if (colonIndex !== -1) {
        tagName = tagName.substr(colonIndex + 1);
        attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
      }
    }
    return { tagName, tagExp, closeIndex, attrExpPresent, rawTagName };
  }
  function readStopNodeData(xmlData, tagName, i) {
    const startIndex = i;
    let openTagCount = 1;
    const xmllen = xmlData.length;
    for (; i < xmllen; i++) {
      if (xmlData[i] === "<") {
        const c1 = xmlData.charCodeAt(i + 1);
        if (c1 === 47) {
          const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
          let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
          if (closeTagName === tagName) {
            openTagCount--;
            if (openTagCount === 0) {
              return { tagContent: xmlData.substring(startIndex, i), i: closeIndex };
            }
          }
          i = closeIndex;
        } else if (c1 === 63) {
          const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
          i = closeIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
          const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
          i = closeIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
          i = closeIndex;
        } else {
          const tagData = readTagExp(xmlData, i, false);
          if (tagData) {
            const openTagName = tagData && tagData.tagName;
            if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
              openTagCount++;
            }
            i = tagData.closeIndex;
          }
        }
      }
    }
  }
  function parseValue(val, shouldParse, options) {
    if (shouldParse && typeof val === "string") {
      const newval = val.trim();
      if (newval === "true") return true;
      else if (newval === "false") return false;
      else return toNumber(val, options);
    } else {
      if (isExist(val)) {
        return val;
      } else {
        return "";
      }
    }
  }
  function transformTagName(fn, tagName, tagExp, options) {
    if (fn) {
      const newTagName = fn(tagName);
      if (tagExp === tagName) {
        tagExp = newTagName;
      }
      tagName = newTagName;
    }
    tagName = sanitizeName(tagName, options);
    return { tagName, tagExp };
  }
  function sanitizeName(name, options) {
    if (criticalProperties.includes(name)) {
      throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
    } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return options.onDangerousProperty(name);
    }
    return name;
  }

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/xmlparser/node2json.js
  var METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
  function stripAttributePrefix(attrs, prefix) {
    if (!attrs || typeof attrs !== "object") return {};
    if (!prefix) return attrs;
    const rawAttrs = {};
    for (const key in attrs) {
      if (key.startsWith(prefix)) {
        const rawName = key.substring(prefix.length);
        rawAttrs[rawName] = attrs[key];
      } else {
        rawAttrs[key] = attrs[key];
      }
    }
    return rawAttrs;
  }
  function prettify(node, options, matcher, readonlyMatcher) {
    return compress(node, options, matcher, readonlyMatcher);
  }
  function compress(arr, options, matcher, readonlyMatcher) {
    let text;
    const compressedObj = {};
    for (let i = 0; i < arr.length; i++) {
      const tagObj = arr[i];
      const property = propName(tagObj);
      if (property !== void 0 && property !== options.textNodeName) {
        const rawAttrs = stripAttributePrefix(tagObj[":@"] || {}, options.attributeNamePrefix);
        matcher.push(property, rawAttrs);
      }
      if (property === options.textNodeName) {
        if (text === void 0) text = tagObj[property];
        else text += "" + tagObj[property];
      } else if (property === void 0) {
        continue;
      } else if (tagObj[property]) {
        let val = compress(tagObj[property], options, matcher, readonlyMatcher);
        const isLeaf = isLeafTag(val, options);
        if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
          val[options.textNodeName] = "";
        }
        if (tagObj[":@"]) {
          assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
        } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
          val = val[options.textNodeName];
        } else if (Object.keys(val).length === 0) {
          if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
          else val = "";
        }
        if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
          val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
        }
        if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
          if (!Array.isArray(compressedObj[property])) {
            compressedObj[property] = [compressedObj[property]];
          }
          compressedObj[property].push(val);
        } else {
          const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
          if (options.isArray(property, jPathOrMatcher, isLeaf)) {
            compressedObj[property] = [val];
          } else {
            compressedObj[property] = val;
          }
        }
        if (property !== void 0 && property !== options.textNodeName) {
          matcher.pop();
        }
      }
    }
    if (typeof text === "string") {
      if (text.length > 0) compressedObj[options.textNodeName] = text;
    } else if (text !== void 0) compressedObj[options.textNodeName] = text;
    return compressedObj;
  }
  function propName(obj) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key !== ":@") return key;
    }
  }
  function assignAttributes(obj, attrMap, readonlyMatcher, options) {
    if (attrMap) {
      const keys = Object.keys(attrMap);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        const atrrName = keys[i];
        const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
        if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
          obj[atrrName] = [attrMap[atrrName]];
        } else {
          obj[atrrName] = attrMap[atrrName];
        }
      }
    }
  }
  function isLeafTag(obj, options) {
    const { textNodeName } = options;
    const propCount = Object.keys(obj).length;
    if (propCount === 0) {
      return true;
    }
    if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
      return true;
    }
    return false;
  }

  // node_modules/.pnpm/fast-xml-parser@5.11.1/node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
  var XMLParser = class {
    constructor(options) {
      this.externalEntities = {};
      this.options = buildOptions(options);
    }
    parse(xmlData, validationOption) {
      if (typeof xmlData !== "string" && xmlData.toString) {
        xmlData = xmlData.toString();
      } else if (typeof xmlData !== "string") {
        throw new Error("XML data is accepted in String or Bytes[] form.");
      }
      if (validationOption) {
        if (validationOption === true) validationOption = {};
        const result = validate(xmlData, validationOption);
        if (result !== true) {
          throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
        }
      }
      const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
      const orderedResult = orderedObjParser.parseXml(xmlData);
      if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
      else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
    }
    addEntity(key, value) {
      if (value.indexOf("&") !== -1) {
        throw new Error("Entity value can't have '&'");
      } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
        throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
      } else if (value === "&") {
        throw new Error("An entity with value '&' is not permitted");
      } else {
        this.externalEntities[key] = value;
      }
    }
    static getMetaDataSymbol() {
      return XmlNode.getMetaDataSymbol();
    }
  };

  // src/dash-segments.js
  var MAX_TRACK_SEGMENTS = 1e4;
  var MAX_TEMPLATE_PADDING = 16;
  var MAX_URL_CHARACTERS = 8192;
  var DEFAULT_URL_CHARACTER_LIMIT = 4 * 1024 * 1024;
  function unsignedInteger(value, fallback = null) {
    if (value === void 0) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }
  function templateUrl(template, base, values) {
    if (typeof template !== "string" || !template.trim()) return null;
    let result = "";
    let cursor = 0;
    while (cursor < template.length) {
      const opening = template.indexOf("$", cursor);
      if (opening < 0) {
        result += template.slice(cursor);
        break;
      }
      result += template.slice(cursor, opening);
      if (template[opening + 1] === "$") {
        result += "$";
        cursor = opening + 2;
        continue;
      }
      const closing = template.indexOf("$", opening + 1);
      if (closing < 0) return null;
      const token = template.slice(opening + 1, closing);
      const match = /^(RepresentationID|Number|Bandwidth|Time)(?:%0([1-9]\d?)d)?$/.exec(token);
      if (!match || match[1] === "RepresentationID" && match[2]) return null;
      const value = values[match[1]];
      const padding = Number(match[2] || 0);
      if (value === null || value === void 0 || padding > MAX_TEMPLATE_PADDING) return null;
      if (match[1] !== "RepresentationID" && (!Number.isSafeInteger(value) || value < 0)) return null;
      result += String(value).padStart(padding, "0");
      cursor = closing + 1;
    }
    if (result.length > MAX_URL_CHARACTERS) return null;
    try {
      const url = new URL(result.trim(), base);
      return ["http:", "https:"].includes(url.protocol) && url.href.length <= MAX_URL_CHARACTERS ? url.href : null;
    } catch {
      return null;
    }
  }
  function expandDashSegmentTemplate(template, base, representation, segmentLimit = MAX_TRACK_SEGMENTS, urlCharacterLimit = DEFAULT_URL_CHARACTER_LIMIT) {
    if (!template || typeof template !== "object" || Array.isArray(template)) return null;
    const timescale = unsignedInteger(template["@_timescale"], 1);
    const startNumber = unsignedInteger(template["@_startNumber"], 1);
    const offset = unsignedInteger(template["@_presentationTimeOffset"], 0);
    const timeline = template.SegmentTimeline;
    if (!timescale || startNumber === null || offset !== 0 || !timeline || typeof timeline !== "object" || Array.isArray(timeline)) return null;
    const entries = Array.isArray(timeline.S) ? timeline.S : timeline.S ? [timeline.S] : [];
    if (entries.length === 0 || entries.length > MAX_TRACK_SEGMENTS) return null;
    const values = {
      RepresentationID: representation.id,
      Bandwidth: representation.bandwidth,
      Number: startNumber,
      Time: 0
    };
    const initializationUrl = templateUrl(template["@_initialization"], base, values);
    if (!initializationUrl || initializationUrl.length > urlCharacterLimit) return null;
    let urlCharacters = initializationUrl.length;
    const segments = [];
    const segmentUrls = /* @__PURE__ */ new Set();
    let nextTimestamp = 0;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const duration = unsignedInteger(entry["@_d"]);
      const timestamp = unsignedInteger(entry["@_t"], nextTimestamp);
      const repeat = unsignedInteger(entry["@_r"], 0);
      if (!duration || timestamp !== nextTimestamp || repeat === null || repeat >= MAX_TRACK_SEGMENTS || segments.length + repeat + 1 > Math.min(MAX_TRACK_SEGMENTS, segmentLimit)) return null;
      const end = timestamp + duration * (repeat + 1);
      if (!Number.isSafeInteger(end) || !Number.isSafeInteger(startNumber + segments.length + repeat)) return null;
      for (let index = 0; index <= repeat; index += 1) {
        const time = timestamp + duration * index;
        const url = templateUrl(template["@_media"], base, {
          ...values,
          Number: startNumber + segments.length,
          Time: time
        });
        if (!url || segmentUrls.has(url) || urlCharacters + url.length > urlCharacterLimit) return null;
        urlCharacters += url.length;
        segmentUrls.add(url);
        segments.push({ url, duration: duration / timescale, timestamp: time / timescale });
      }
      nextTimestamp = end;
    }
    return { initializationUrl, segments, timescale };
  }

  // src/dash-metadata.js
  var MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
  var MAX_MANIFEST_SEGMENTS = 2e4;
  var MAX_EXPANDED_URL_CHARACTERS = 4 * 1024 * 1024;
  var parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
    maxNestedTags: 40
  });
  function asArray(value) {
    return value === void 0 || value === null ? [] : Array.isArray(value) ? value : [value];
  }
  function resolveHttpUrl(value, base) {
    try {
      const url = new URL(value, base);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }
  function durationSeconds(value) {
    const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value || "");
    if (!match) return null;
    const total = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
    return Number.isFinite(total) && total > 0 ? total : null;
  }
  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  function representationUrl(manifestUrl, id) {
    const url = new URL(manifestUrl);
    url.hash = `representation=${encodeURIComponent(id)}`;
    return url.href;
  }
  function mediaType(attributes, bases) {
    const declared = attributes.contentType || attributes.mimeType?.split("/")[0];
    if (declared === "video" || declared === "audio") return declared;
    if (/^(avc|hev|hvc|av01|vp0[89])/.test(attributes.codecs || "") || positiveNumber(attributes.width)) return "video";
    if (/^(mp4a|ac-3|ec-3|opus)/.test(attributes.codecs || "")) return "audio";
    if (bases.some((url) => /\.cmfv$/i.test(new URL(url).pathname))) return "video";
    if (bases.some((url) => /\.(?:cmfa|m4a)$/i.test(new URL(url).pathname))) return "audio";
    return null;
  }
  function parseDashMetadata(content, manifestUrl) {
    if (content.length > MAX_MANIFEST_BYTES || /<!DOCTYPE\b|<!ENTITY\b/i.test(content)) {
      throw new Error("Unsupported MPD document");
    }
    const document = parser.parse(content, true);
    if (!document.MPD || typeof document.MPD !== "object" || Array.isArray(document.MPD)) {
      throw new Error("Invalid DASH manifest");
    }
    const relatedUrls = /* @__PURE__ */ new Set([manifestUrl]);
    const representations = [];
    let expandedSegmentCount = 0;
    let expandedUrlCharacters = 0;
    let hasContentProtection = false;
    const periods = asArray(document.MPD.Period);
    const presentationUnsupported = document.MPD["@_type"] === "dynamic" || periods.length !== 1 || Boolean(durationSeconds(periods[0]?.["@_start"]));
    function visit(node, inheritedBases, inherited = {}, tag = "MPD") {
      if (!node || typeof node !== "object") return;
      if (Object.hasOwn(node, "ContentProtection")) hasContentProtection = true;
      const declaredBases = asArray(node.BaseURL).map((base) => typeof base === "string" ? base : base?.["#text"]).filter((base) => typeof base === "string" && base.trim());
      if (declaredBases.length > 64) throw new Error("Too many MPD BaseURL alternatives");
      const bases = declaredBases.length > 0 ? [...new Set(inheritedBases.flatMap((base) => declaredBases.map((value) => resolveHttpUrl(value.trim(), base)).filter(Boolean)))] : inheritedBases;
      if (bases.length > 64) throw new Error("Too many MPD BaseURL combinations");
      const attributes = { ...inherited.attributes };
      for (const name of ["contentType", "mimeType", "codecs", "width", "height", "bandwidth", "lang"]) {
        if (node[`@_${name}`] !== void 0) attributes[name] = node[`@_${name}`];
      }
      const protection = inherited.protection || Object.hasOwn(node, "ContentProtection");
      const ownSegmentMode = ["SegmentBase", "SegmentList", "SegmentTemplate"].find((name) => Object.hasOwn(node, name));
      const segmentMode = ownSegmentMode || inherited.segmentMode;
      const segmentBase = ownSegmentMode === "SegmentBase" ? { ...inherited.segmentBase, ...node.SegmentBase } : inherited.segmentBase;
      const segmentTemplate = ownSegmentMode === "SegmentTemplate" ? Array.isArray(node.SegmentTemplate) ? null : {
        ...inherited.segmentMode === "SegmentTemplate" ? inherited.segmentTemplate : {},
        ...node.SegmentTemplate
      } : inherited.segmentTemplate;
      const hasBase = Boolean(inherited.hasBase || declaredBases.length);
      const main = inherited.main || asArray(node.Role).some((role) => role?.["@_value"] === "main");
      for (const base of bases) {
        if (/\.(?:cmfv|cmfa|mp4|m4s)$/i.test(new URL(base).pathname)) relatedUrls.add(base);
      }
      for (const segmentInfo of [...asArray(node.SegmentBase), ...asArray(node.SegmentList)]) {
        for (const initialization of asArray(segmentInfo?.Initialization)) {
          for (const base of bases) {
            const url = initialization?.["@_sourceURL"] && resolveHttpUrl(initialization["@_sourceURL"], base);
            if (url) relatedUrls.add(url);
          }
        }
        for (const segment of asArray(segmentInfo?.SegmentURL)) {
          for (const base of bases) {
            const url = segment?.["@_media"] && resolveHttpUrl(segment["@_media"], base);
            if (url) relatedUrls.add(url);
          }
        }
      }
      if (tag === "Representation") {
        const type = mediaType(attributes, bases);
        if (type) {
          const id = String(node["@_id"] ?? representations.length);
          const templates = [];
          if (!presentationUnsupported && segmentMode === "SegmentTemplate") {
            const segmentLimit = Math.floor((MAX_MANIFEST_SEGMENTS - expandedSegmentCount) / (bases.length || 1));
            const characterLimit = Math.floor((MAX_EXPANDED_URL_CHARACTERS - expandedUrlCharacters) / (bases.length || 1));
            for (const base of bases) {
              const expanded = expandDashSegmentTemplate(segmentTemplate, base, {
                id,
                bandwidth: positiveNumber(attributes.bandwidth)
              }, segmentLimit, characterLimit);
              if (expanded) templates.push(expanded);
            }
            expandedSegmentCount += templates.reduce((total, item) => total + item.segments.length, 0);
            expandedUrlCharacters += templates.reduce((total, item) => total + item.initializationUrl.length + item.segments.reduce((sum, segment) => sum + segment.url.length, 0), 0);
          }
          const segments = templates[0] || null;
          for (const template of templates) {
            relatedUrls.add(template.initializationUrl);
            for (const segment of template.segments) relatedUrls.add(segment.url);
          }
          const url = segments ? representationUrl(manifestUrl, id) : hasBase ? bases.find((base) => {
            const path = new URL(base).pathname;
            return !path.endsWith("/") && (/\.(?:cmfv|cmfa|mp4|m4a|m4v)$/i.test(path) || segmentMode === "SegmentBase" && attributes.mimeType?.endsWith("/mp4"));
          }) : null;
          const initialization = segmentBase?.Initialization;
          const externalInit = initialization?.["@_sourceURL"] && resolveHttpUrl(initialization["@_sourceURL"], url || manifestUrl) !== url;
          const timeOffset = Number(segmentBase?.["@_presentationTimeOffset"] || 0);
          representations.push({
            id,
            type,
            url: url || null,
            segments,
            width: positiveNumber(attributes.width),
            height: positiveNumber(attributes.height),
            bandwidth: positiveNumber(attributes.bandwidth),
            codecs: attributes.codecs || null,
            language: attributes.lang || null,
            main,
            hasContentProtection: Boolean(protection),
            unavailableReason: segments ? null : presentationUnsupported || !url || externalInit || timeOffset !== 0 || segmentMode && segmentMode !== "SegmentBase" ? "dashLayoutUnsupported" : null
          });
        }
      }
      for (const key of ["Period", "AdaptationSet", "Representation"]) {
        for (const child of asArray(node[key])) {
          visit(child, bases, { attributes, protection, segmentMode, segmentBase, segmentTemplate, hasBase, main }, key);
        }
      }
    }
    visit(document.MPD, [manifestUrl]);
    const audioTracks = representations.filter((track) => track.type === "audio");
    const preferredAudio = [...audioTracks].sort((left, right) => Number(Boolean(left.unavailableReason)) - Number(Boolean(right.unavailableReason)) || Number(left.hasContentProtection) - Number(right.hasContentProtection) || Number(Boolean(right.main)) - Number(Boolean(left.main)) || (right.bandwidth || 0) - (left.bandwidth || 0))[0] || null;
    const streams = representations.filter((track) => track.type === "video").map((track) => ({
      // Unsupported layouts still need a stable selection identity in the UI.
      url: track.url || representationUrl(manifestUrl, track.id),
      representationId: track.id,
      resolution: track.width && track.height ? `${track.width}x${track.height}` : null,
      width: track.width,
      height: track.height,
      bandwidth: (track.bandwidth || 0) + (preferredAudio?.bandwidth || 0) || null,
      codecs: track.codecs,
      videoSegments: track.segments,
      hasExternalAudio: audioTracks.length > 0,
      audioUrl: preferredAudio?.url || null,
      audioRepresentationId: preferredAudio?.id || null,
      audioLanguage: preferredAudio?.language || null,
      audioSegments: preferredAudio?.segments || null,
      hasContentProtection: track.hasContentProtection || Boolean(preferredAudio?.hasContentProtection),
      unavailableReason: track.unavailableReason || preferredAudio?.unavailableReason || null
    }));
    return {
      relatedUrls: [...relatedUrls],
      hasContentProtection,
      streams,
      duration: durationSeconds(document.MPD["@_mediaPresentationDuration"]) || (periods.length === 1 ? durationSeconds(periods[0]?.["@_duration"]) : null)
    };
  }
  async function inspectDashManifest(url, fetchFn) {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(8e3) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("Empty DASH manifest");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let content = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_MANIFEST_BYTES) throw new Error("DASH manifest too large");
        content += decoder.decode(value, { stream: true });
      }
      content += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {
      });
      reader.releaseLock();
    }
    return parseDashMetadata(content, response.url || url);
  }

  // src/video-detector.js
  function getRPlaySourceType(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!["rplay.live", "rplay-cdn.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    if (/\.m3u8$/i.test(url.pathname)) return "hls";
    if (url.pathname === "/content/hlsstream") return "hls";
    if (/\.mpd$/i.test(url.pathname)) return "dash";
    if (/\.cmfv$/i.test(url.pathname)) return "cmaf";
    return null;
  }
  function shouldInspectMediaRequest({ url, tabId, type, method = "GET" }) {
    return Number.isInteger(tabId) && tabId >= 0 && method === "GET" && ["xmlhttprequest", "media", "other"].includes(type) && getRPlaySourceType(url) !== null;
  }
  function isKnownVideoSource(videos, url) {
    return videos.some((video) => video.baseUrl === url || video.relatedUrls?.includes(url) || video.observedUrls?.includes(url));
  }
  function isCmafTrackOnlySource(video) {
    return video?.sourceType === "cmaf" && Array.isArray(video.streams) && video.streams.length === 0 && video.unavailableReason === "cmafNeedsPlaylist";
  }
  function cmafObservationUrls(video) {
    return [.../* @__PURE__ */ new Set([video.baseUrl, ...video.observedUrls || [], ...video.relatedUrls || []])].filter((url) => getRPlaySourceType(url) === "cmaf");
  }
  function withCmafObservations(video, urls) {
    return { ...video, baseUrl: urls[0], relatedUrls: urls, observedUrls: urls };
  }
  function coalesceCmafObservations(videos) {
    const notices = videos.filter(isCmafTrackOnlySource);
    if (notices.length === 0) return videos;
    const observed = [...new Set(notices.flatMap(cmafObservationUrls))];
    if (observed.length === 0) return videos;
    const manifests = videos.filter((video) => !isCmafTrackOnlySource(video));
    const urls = observed.filter((url) => !isKnownVideoSource(manifests, url));
    if (notices.length === 1 && urls.length === observed.length) return videos;
    const representative = notices.find((video) => cmafObservationUrls(video).some((url) => !isKnownVideoSource(manifests, url)));
    const combined = representative ? withCmafObservations(representative, urls) : null;
    let inserted = false;
    return videos.flatMap((video) => {
      if (!isCmafTrackOnlySource(video)) return [video];
      if (inserted || video !== representative || !combined) return [];
      inserted = true;
      return [combined];
    });
  }
  function mergeVideoSources(videos, detected) {
    videos = coalesceCmafObservations(videos);
    if (isCmafTrackOnlySource(detected)) {
      const incoming = cmafObservationUrls(detected);
      const unknown = incoming.filter((url) => !isKnownVideoSource(videos, url));
      if (unknown.length === 0) return videos;
      const notice = videos.find(isCmafTrackOnlySource);
      if (!notice) return [...videos, unknown.length === incoming.length ? detected : withCmafObservations(detected, unknown)];
      const urls = [.../* @__PURE__ */ new Set([...cmafObservationUrls(notice), ...unknown])];
      return videos.map((video) => video === notice ? withCmafObservations(notice, urls) : video);
    }
    if (isKnownVideoSource(videos, detected.baseUrl)) return videos;
    const related = new Set(detected.relatedUrls || []);
    return [...videos.flatMap((video) => {
      if (isCmafTrackOnlySource(video)) {
        const observed = cmafObservationUrls(video);
        const remaining = observed.filter((url) => !related.has(url));
        if (remaining.length === 0) return [];
        return [remaining.length === observed.length ? video : withCmafObservations(video, remaining)];
      }
      return related.has(video.baseUrl) ? [] : [video];
    }), detected];
  }
  function playlistResourceUrls(content, playlistUrl) {
    return content.split(/\r?\n/).flatMap((raw) => {
      const line = raw.trim();
      if (line.startsWith("#EXT-X-MAP:")) {
        const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
        return attributes.URI ? [resolveUrl(attributes.URI, playlistUrl)] : [];
      }
      return line && !line.startsWith("#") ? [resolveUrl(line, playlistUrl)] : [];
    });
  }
  async function inspectVideoSource(masterUrl, {
    fetchFn,
    resolveTitle = async () => "",
    now = Date.now
  }) {
    const sourceType = getRPlaySourceType(masterUrl);
    if (!sourceType) return null;
    const metadata = async () => {
      let title = "";
      try {
        title = normalizeVideoTitle(await resolveTitle());
      } catch {
      }
      return { title: title || "rplay", timestamp: now() };
    };
    if (sourceType !== "hls") {
      let dashMetadata = null;
      if (sourceType === "dash") {
        try {
          dashMetadata = await inspectDashManifest(masterUrl, fetchFn);
        } catch {
        }
      }
      const streams2 = (dashMetadata?.streams || []).map(({ videoSegments, audioSegments, ...stream }) => stream);
      return {
        ...await metadata(),
        sourceType,
        baseUrl: masterUrl,
        relatedUrls: [.../* @__PURE__ */ new Set([masterUrl, ...dashMetadata?.relatedUrls || []])],
        streams: streams2,
        sessionKeys: [],
        duration: dashMetadata?.duration || null,
        hasContentProtection: dashMetadata?.hasContentProtection ?? null,
        unavailableReason: sourceType === "cmaf" ? "cmafNeedsPlaylist" : streams2.length > 0 ? streams2.every((stream) => stream.unavailableReason) ? streams2[0].unavailableReason : null : "dashUnsupported"
      };
    }
    const response = await fetchFn(masterUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();
    if (!/^\s*#EXTM3U(?:\s|$)/.test(content)) return null;
    const playlistUrl = response.url || masterUrl;
    const { streams, audioGroups, sessionKeys } = parseMasterPlaylist(content, playlistUrl);
    if (streams.length === 0) return null;
    const masterProtection = getUnsupportedHlsEncryption(content);
    const relatedUrls = /* @__PURE__ */ new Set([
      playlistUrl,
      ...streams.map((stream) => stream.url),
      ...[...audioGroups.values()].flat().map((track) => track.uri).filter(Boolean)
    ]);
    const playlistCache = /* @__PURE__ */ new Map();
    const inspectPlaylist = (url) => {
      if (!url) return Promise.resolve(null);
      if (!playlistCache.has(url)) {
        playlistCache.set(url, (async () => {
          try {
            const mediaResponse = await fetchFn(url);
            if (!mediaResponse.ok) return null;
            const media = await mediaResponse.text();
            if (!/^\s*#EXTM3U(?:\s|$)/.test(media)) return null;
            const finalUrl = mediaResponse.url || url;
            relatedUrls.add(finalUrl);
            for (const resource of playlistResourceUrls(media, finalUrl)) relatedUrls.add(resource);
            return { duration: getPlaylistDuration(media), protection: getUnsupportedHlsEncryption(media) };
          } catch {
            return null;
          }
        })());
      }
      return playlistCache.get(url);
    };
    for (let index = 0; index < streams.length; index += 3) {
      await Promise.all(streams.slice(index, index + 3).map(async (stream) => {
        const [media, audio] = await Promise.all([inspectPlaylist(stream.url), inspectPlaylist(stream.audioUrl)]);
        stream.duration = media?.duration || null;
        stream.unavailableReason = masterProtection || media?.protection || audio?.protection ? "drmUnsupported" : null;
      }));
    }
    return {
      ...await metadata(),
      sourceType,
      streams,
      sessionKeys,
      baseUrl: masterUrl,
      relatedUrls: [...relatedUrls],
      duration: streams.find((stream) => stream.duration)?.duration || null
    };
  }

  // src/background.js
  var URL_CACHE_DURATION = 3e3;
  var CANCEL_CLEANUP_TIMEOUT = 8e3;
  var TASKS_STORAGE_KEY = "rplayDownloadTasksV2";
  var VIDEO_STORAGE_PREFIX = "rplayVideos:";
  var videoInfo = /* @__PURE__ */ new Map();
  var processedUrls = /* @__PURE__ */ new Map();
  var detectionContexts = /* @__PURE__ */ new Map();
  var detectionStorageWrites = /* @__PURE__ */ new Map();
  var cmafTitleRequests = /* @__PURE__ */ new Map();
  var queue = [];
  var pendingDownloads = /* @__PURE__ */ new Map();
  var pendingFilenamesByUrl = /* @__PURE__ */ new Map();
  var activeTaskId = null;
  var offscreenCreation = null;
  var processingQueue = false;
  var taskStore = new TaskStore({
    storageArea: chrome.storage.session,
    storageKey: TASKS_STORAGE_KEY,
    terminalPhases: TERMINAL_TASK_PHASES,
    onEvent(eventType, task) {
      broadcast({ type: eventType, task: toPublicTask(task), tabId: task.tabId });
    }
  });
  var { tasks } = taskStore;
  var bootstrapPromise = bootstrap();
  function shouldProcessUrl(tabId, url) {
    const key = `${tabId}:${url}`;
    const now = Date.now();
    const previous = processedUrls.get(key);
    if (previous && now - previous < URL_CACHE_DURATION) return false;
    processedUrls.set(key, now);
    return true;
  }
  function getDetectionContext(tabId) {
    if (!detectionContexts.has(tabId)) detectionContexts.set(tabId, Symbol());
    return detectionContexts.get(tabId);
  }
  function getDetectedVideos(tabId) {
    const videos = videoInfo.get(tabId) || [];
    const normalized = coalesceCmafObservations(videos);
    if (normalized !== videos) videoInfo.set(tabId, normalized);
    return normalized;
  }
  function resolveCmafPageTitle(tabId, context) {
    const notice = getDetectedVideos(tabId).find(isCmafTrackOnlySource);
    if (notice) return Promise.resolve(notice.title);
    const pending = cmafTitleRequests.get(tabId);
    if (pending?.context === context) return pending.promise;
    const promise = resolvePageTitle(tabId);
    cmafTitleRequests.set(tabId, { context, promise });
    return promise;
  }
  function writeDetectionStorage(tabId, write) {
    const previous = detectionStorageWrites.get(tabId);
    const pending = previous ? previous.catch(() => {
    }).then(write) : Promise.resolve(write());
    detectionStorageWrites.set(tabId, pending);
    pending.finally(() => {
      if (detectionStorageWrites.get(tabId) === pending) detectionStorageWrites.delete(tabId);
    }).catch(() => {
    });
    return pending;
  }
  function createTaskId() {
    return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  }
  async function persistTasks() {
    await taskStore.persist();
  }
  async function updateTask(taskId, updates, eventType = MessageType.TASK_UPDATED, options = {}) {
    return taskStore.update(taskId, updates, { eventType, ...options });
  }
  function broadcast(message) {
    chrome.runtime.sendMessage(message).catch(() => {
    });
    if (Number.isInteger(message.tabId) && message.tabId >= 0) {
      chrome.tabs.sendMessage(message.tabId, message).catch(() => {
      });
    }
  }
  async function updateBadge(text, color, tabId) {
    const options = Number.isInteger(tabId) && tabId >= 0 ? { tabId } : {};
    await Promise.all([
      chrome.action.setBadgeText({ ...options, text }).catch(() => {
      }),
      chrome.action.setBadgeBackgroundColor({ ...options, color }).catch(() => {
      })
    ]);
  }
  async function resolvePageTitle(tabId) {
    try {
      const page = await chrome.tabs.sendMessage(tabId, { type: MessageType.GET_PAGE_VIDEO_TITLE });
      const title = normalizeVideoTitle(page?.title);
      if (title) return title;
    } catch {
    }
    try {
      return normalizeVideoTitle((await chrome.tabs.get(tabId)).title);
    } catch {
      return "";
    }
  }
  async function bootstrap() {
    await taskStore.restore();
    let migrated = false;
    for (const task of tasks.values()) {
      if (!task.sourceId && task.masterUrl && task.streamUrl) {
        task.sourceId = createSourceId(task.masterUrl, task.streamUrl);
        delete task.selectionId;
        migrated = true;
      }
    }
    if (migrated) await persistTasks();
    const nonTerminal = [...tasks.values()].filter((task) => !TERMINAL_TASK_PHASES.has(task.phase));
    if (nonTerminal.length === 0) return;
    const saving = nonTerminal.find((task) => task.phase === TaskPhase.SAVING && Number.isInteger(task.browserDownloadId));
    if (saving) {
      const [download] = await chrome.downloads.search({ id: saving.browserDownloadId }).catch(() => []);
      if (download?.state === "in_progress") {
        activeTaskId = saving.taskId;
        pendingDownloads.set(saving.browserDownloadId, saving.taskId);
        return;
      }
      if (download?.state === "complete") {
        await finishTask(saving.taskId);
        return;
      }
      if (download?.state === "interrupted") {
        await failTask(saving.taskId, "\u6D4F\u89C8\u5668\u4FDD\u5B58\u5DF2\u4E2D\u65AD");
        return;
      }
    }
    const context = await getOffscreenContext();
    if (context) {
      const status = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_STATUS }).catch(() => null);
      if (status?.activeTaskId && tasks.has(status.activeTaskId)) {
        activeTaskId = status.activeTaskId;
        if (status.fileReady) void beginBrowserDownload(status.activeTaskId, status.fileReady);
        return;
      }
    }
    for (const task of nonTerminal) {
      task.phase = TaskPhase.QUEUED;
      task.message = "\u6269\u5C55\u540E\u53F0\u5DF2\u6062\u590D\uFF0C\u7B49\u5F85\u91CD\u65B0\u5F00\u59CB";
      task.progress = 0;
      task.browserDownloadId = null;
      task.objectUrl = null;
      task.tempName = null;
      queue.push(task.taskId);
    }
    queue.sort((left, right) => tasks.get(left).createdAt - tasks.get(right).createdAt);
    await persistTasks();
    void processQueue();
  }
  async function getOffscreenContext() {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    return contexts[0] || null;
  }
  async function ensureOffscreen() {
    if (await getOffscreenContext()) return;
    if (!offscreenCreation) {
      offscreenCreation = chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["BLOBS"],
        justification: "\u5728\u9875\u9762\u5173\u95ED\u540E\u7EE7\u7EED HLS \u4E0B\u8F7D\u3001\u5199\u5165 OPFS\uFF0C\u5E76\u4E3A\u6D4F\u89C8\u5668\u4E0B\u8F7D\u521B\u5EFA\u4E34\u65F6 Blob URL\u3002"
      }).finally(() => {
        offscreenCreation = null;
      });
    }
    await offscreenCreation;
  }
  async function sendToOffscreen(message) {
    await ensureOffscreen();
    let response = await chrome.runtime.sendMessage(message).catch(() => null);
    if (!response) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      response = await chrome.runtime.sendMessage(message);
    }
    return response;
  }
  async function createDownloadTask(request) {
    await bootstrapPromise;
    const data = request.data || {};
    const detectedVideo = (videoInfo.get(request.tabId) || []).find((video) => video.baseUrl === data.masterUrl);
    const detectedStream = detectedVideo?.streams.find((stream) => stream.url === data.streamUrl);
    if (detectedVideo?.unavailableReason && !detectedStream) {
      throw new Error("\u5DF2\u8BC6\u522B\u5230\u5A92\u4F53\uFF0C\u4F46\u5F53\u524D\u6269\u5C55\u4E0D\u652F\u6301\u4E0B\u8F7D\u6B64\u6765\u6E90");
    }
    if (!data.masterUrl || !data.streamUrl || !data.resolution) {
      throw new Error("\u4E0B\u8F7D\u53C2\u6570\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5");
    }
    let title = normalizeVideoTitle(data.title);
    if (!title) {
      try {
        const tab = await chrome.tabs.get(request.tabId);
        title = normalizeVideoTitle(tab.title);
      } catch {
      }
    }
    title ||= "rplay";
    const taskId = createTaskId();
    const now = Date.now();
    const bandwidth = Number(data.bandwidth) || null;
    const duration = Number(data.duration) || null;
    const estimatedBytes = estimateMediaBytes(bandwidth, duration);
    const sourceId = createSourceId(data.masterUrl, data.streamUrl);
    const duplicate = [...tasks.values()].find((task2) => task2.tabId === request.tabId && task2.sourceId === sourceId && ACTIVE_TASK_PHASES.has(task2.phase));
    if (duplicate) return toPublicTask(duplicate);
    const licenseKey = `${LICENSE_STORAGE_PREFIX}${request.tabId}`;
    await detectionStorageWrites.get(request.tabId)?.catch(() => {
    });
    const licenseUrl = (await chrome.storage.session.get(licenseKey))[licenseKey];
    const task = {
      taskId,
      tabId: request.tabId,
      sourceId,
      // Filename sanitizing is applied later, only at the download boundary.
      title,
      resolution: data.resolution,
      width: Number(data.width) || Number.parseInt(data.resolution.split("x")[0], 10) || null,
      height: Number(data.height) || Number.parseInt(data.resolution.split("x")[1], 10) || null,
      bandwidth,
      duration,
      estimatedBytes,
      sourceType: detectedVideo?.sourceType || data.sourceType || "hls",
      licenseUrl: isWidevineLicenseUrl(licenseUrl) ? licenseUrl : null,
      representationId: detectedStream?.representationId || data.representationId || null,
      audioRepresentationId: detectedStream?.audioRepresentationId || data.audioRepresentationId || null,
      masterUrl: data.masterUrl,
      streamUrl: data.streamUrl,
      audioUrl: data.audioUrl || null,
      hasExternalAudio: Boolean(data.hasExternalAudio),
      sessionKeys: Array.isArray(data.sessionKeys) ? data.sessionKeys : [],
      requestedFormat: "mp4",
      actualFormat: null,
      phase: TaskPhase.QUEUED,
      downloadedBytes: 0,
      totalBytes: estimatedBytes,
      speed: 0,
      progress: 0,
      fallbackReason: null,
      error: null,
      message: "\u7B49\u5F85\u540E\u53F0\u4E0B\u8F7D",
      filename: null,
      browserDownloadId: null,
      objectUrl: null,
      tempName: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null
    };
    queue.push(taskId);
    await taskStore.add(task, MessageType.TASK_CREATED);
    void processQueue();
    return toPublicTask(task);
  }
  async function processQueue() {
    await bootstrapPromise;
    if (processingQueue || activeTaskId) return;
    processingQueue = true;
    try {
      while (!activeTaskId && queue.length > 0) {
        const taskId = queue.shift();
        const task = tasks.get(taskId);
        if (!task || task.phase !== TaskPhase.QUEUED) continue;
        activeTaskId = taskId;
        await updateTask(taskId, {
          phase: TaskPhase.PREPARING,
          message: "\u6B63\u5728\u51C6\u5907\u540E\u53F0\u4E0B\u8F7D\u2026",
          startedAt: task.startedAt || Date.now(),
          error: null
        });
        await updateBadge("\u2193", "#007bff", task.tabId);
        try {
          const response = await sendToOffscreen({ type: MessageType.OFFSCREEN_START, task });
          if (!response?.accepted) throw new Error(response?.error || "Offscreen \u4E0B\u8F7D\u5668\u672A\u63A5\u53D7\u4EFB\u52A1");
        } catch (error) {
          await failTask(taskId, error?.message || String(error));
        }
      }
    } finally {
      processingQueue = false;
    }
  }
  async function beginBrowserDownload(taskId, fileReady) {
    const task = tasks.get(taskId);
    if (!task || TERMINAL_TASK_PHASES.has(task.phase) || task.browserDownloadId) return;
    const filename = makeDownloadFilename(task, fileReady.actualFormat);
    await updateTask(taskId, {
      phase: TaskPhase.SAVING,
      actualFormat: fileReady.actualFormat,
      filename,
      downloadedBytes: fileReady.size || task.downloadedBytes,
      totalBytes: fileReady.size || task.totalBytes,
      progress: 98,
      message: fileReady.actualFormat === "ts" ? "MP4 \u5C01\u88C5\u5931\u8D25\uFF0C\u6B63\u5728\u4FDD\u5B58\u539F\u59CB TS\u2026" : "\u6B63\u5728\u4FDD\u5B58 MP4\u2026",
      objectUrl: fileReady.objectUrl,
      tempName: fileReady.tempName,
      fallbackReason: fileReady.fallbackReason || task.fallbackReason
    });
    pendingFilenamesByUrl.set(fileReady.objectUrl, filename);
    try {
      const downloadId = await chrome.downloads.download({
        url: fileReady.objectUrl,
        filename,
        saveAs: true,
        conflictAction: "uniquify"
      });
      const current = tasks.get(taskId);
      if (!current || current.phase !== TaskPhase.SAVING) {
        await chrome.downloads.cancel(downloadId).catch(() => {
        });
        return;
      }
      pendingDownloads.set(downloadId, taskId);
      await updateTask(taskId, { browserDownloadId: downloadId });
    } catch (error) {
      pendingFilenamesByUrl.delete(fileReady.objectUrl);
      await failTask(taskId, error?.message || "\u7528\u6237\u53D6\u6D88\u4FDD\u5B58");
    }
  }
  async function releaseTaskFile(task) {
    if (!task?.objectUrl && !task?.tempName) return;
    await sendToOffscreen({
      type: MessageType.OFFSCREEN_RELEASE_FILE,
      taskId: task.taskId,
      objectUrl: task.objectUrl,
      tempName: task.tempName
    }).catch(() => {
    });
  }
  async function finishTask(taskId) {
    const task = tasks.get(taskId);
    if (!task || task.phase === TaskPhase.COMPLETED) return;
    if (task.browserDownloadId) pendingDownloads.delete(task.browserDownloadId);
    await releaseTaskFile(task);
    const completedAt = Date.now();
    const elapsedSeconds = Math.max(1e-3, (completedAt - (task.startedAt || task.createdAt)) / 1e3);
    await updateTask(taskId, {
      phase: TaskPhase.COMPLETED,
      progress: 100,
      speed: 0,
      message: task.actualFormat === "ts" ? "\u539F\u59CB TS \u4E0B\u8F7D\u5B8C\u6210" : "MP4 \u4E0B\u8F7D\u5B8C\u6210",
      completedAt,
      totalTime: elapsedSeconds,
      avgSpeed: task.downloadedBytes / elapsedSeconds,
      licenseUrl: null,
      objectUrl: null,
      tempName: null
    }, MessageType.TASK_COMPLETED);
    await updateBadge("\u2713", "#28a745", task.tabId);
    activeTaskId = null;
    setTimeout(() => updateBadge(String(videoInfo.get(task.tabId)?.length || ""), "#666666", task.tabId), 3e3);
    void processQueue();
  }
  function releaseTaskSlot(taskId) {
    if (activeTaskId !== taskId) return;
    activeTaskId = null;
    void processQueue();
  }
  function scheduleCanceledTaskCleanup(taskId) {
    setTimeout(async () => {
      if (activeTaskId !== taskId) return;
      await chrome.offscreen.closeDocument().catch(() => {
      });
      releaseTaskSlot(taskId);
    }, CANCEL_CLEANUP_TIMEOUT);
  }
  async function failTask(taskId, message, { releaseSlot = true } = {}) {
    const task = tasks.get(taskId);
    if (!task) return;
    if (TERMINAL_TASK_PHASES.has(task.phase)) {
      if (releaseSlot) releaseTaskSlot(taskId);
      return;
    }
    if (task.browserDownloadId) pendingDownloads.delete(task.browserDownloadId);
    await releaseTaskFile(task);
    await updateTask(taskId, {
      phase: TaskPhase.ERROR,
      error: message || "\u4E0B\u8F7D\u5931\u8D25",
      licenseUrl: null,
      message: message || "\u4E0B\u8F7D\u5931\u8D25",
      speed: 0,
      completedAt: Date.now(),
      objectUrl: null,
      tempName: null
    }, MessageType.TASK_ERROR);
    await updateBadge("\u2717", "#dc3545", task.tabId);
    if (releaseSlot) releaseTaskSlot(taskId);
    setTimeout(() => updateBadge(String(videoInfo.get(task.tabId)?.length || ""), "#666666", task.tabId), 3e3);
  }
  async function cancelTask(taskId) {
    await bootstrapPromise;
    const task = tasks.get(taskId);
    if (!task || TERMINAL_TASK_PHASES.has(task.phase)) return false;
    if (task.phase === TaskPhase.QUEUED) {
      const index = queue.indexOf(taskId);
      if (index >= 0) queue.splice(index, 1);
      await failTask(taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88");
      return true;
    }
    if (task.phase === TaskPhase.SAVING) {
      if (task.browserDownloadId) await chrome.downloads.cancel(task.browserDownloadId).catch(() => {
      });
      await sendToOffscreen({ type: MessageType.OFFSCREEN_CANCEL, taskId }).catch(() => {
      });
      await failTask(taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88");
      return true;
    }
    await failTask(taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88", { releaseSlot: false });
    const response = await sendToOffscreen({
      type: MessageType.OFFSCREEN_CANCEL,
      taskId
    }).catch(() => null);
    if (!response?.success) releaseTaskSlot(taskId);
    else scheduleCanceledTaskCleanup(taskId);
    return true;
  }
  async function handleMessage(request) {
    await bootstrapPromise;
    switch (request.type) {
      case MessageType.GET_VIDEO_INFO: {
        const tabId = request.tabId;
        if (videoInfo.has(tabId)) return { videos: getDetectedVideos(tabId) };
        const context = getDetectionContext(tabId);
        const key = `${VIDEO_STORAGE_PREFIX}${tabId}`;
        const stored = await chrome.storage.local.get(key);
        if (detectionContexts.get(tabId) !== context || videoInfo.has(tabId)) {
          return { videos: getDetectedVideos(tabId) };
        }
        const videos = coalesceCmafObservations(stored[key] || []);
        videoInfo.set(tabId, videos);
        return { videos };
      }
      case MessageType.GET_TASKS:
        return {
          tasks: [...tasks.values()].sort((left, right) => right.createdAt - left.createdAt).map(toPublicTask),
          activeTaskId
        };
      case MessageType.GET_DOWNLOAD_STATE: {
        const state = [...tasks.values()].filter((task) => task.tabId === request.tabId && !TERMINAL_TASK_PHASES.has(task.phase)).sort((left, right) => right.createdAt - left.createdAt)[0];
        return { state: toPublicTask(state) };
      }
      case MessageType.DOWNLOAD_VIDEO:
        return { success: true, task: await createDownloadTask(request) };
      case MessageType.CANCEL_TASK:
        return { success: await cancelTask(request.taskId) };
      case MessageType.OPEN_POPUP:
        if (chrome.action.openPopup) await chrome.action.openPopup().catch(() => {
        });
        return { success: true };
      case MessageType.OFFSCREEN_PROGRESS: {
        const task = tasks.get(request.taskId);
        if (!task || TERMINAL_TASK_PHASES.has(task.phase)) return { accepted: false };
        const allowed = request.updates || {};
        const nextPhase = allowed.phase || task.phase;
        const phaseChanged = nextPhase !== task.phase;
        await updateTask(request.taskId, {
          phase: nextPhase,
          actualFormat: allowed.actualFormat ?? task.actualFormat,
          downloadedBytes: Number.isFinite(allowed.downloadedBytes) ? allowed.downloadedBytes : task.downloadedBytes,
          totalBytes: Number.isFinite(allowed.totalBytes) ? allowed.totalBytes : task.totalBytes,
          speed: Number.isFinite(allowed.speed) ? allowed.speed : task.speed,
          progress: Number.isFinite(allowed.progress) ? Math.max(0, Math.min(99, allowed.progress)) : task.progress,
          fallbackReason: allowed.fallbackReason ?? task.fallbackReason,
          message: allowed.message || task.message
        }, MessageType.TASK_UPDATED, { persist: phaseChanged });
        return { accepted: true };
      }
      case MessageType.OFFSCREEN_FILE_READY:
        void beginBrowserDownload(request.taskId, request.file);
        return { accepted: true };
      case MessageType.OFFSCREEN_ERROR:
        await failTask(request.taskId, request.error || "\u540E\u53F0\u4E0B\u8F7D\u5931\u8D25");
        return { accepted: true };
      case MessageType.OFFSCREEN_CANCELED:
        await failTask(request.taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88");
        return { accepted: true };
      default:
        return null;
    }
  }
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!BACKGROUND_MESSAGE_TYPES.has(request?.type)) return false;
    handleMessage(request).then((response) => sendResponse(response)).catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  });
  chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    const url = downloadItem.finalUrl || downloadItem.url;
    const filename = pendingFilenamesByUrl.get(url) || pendingFilenamesByUrl.get(downloadItem.url);
    if (!filename) {
      suggest();
      return;
    }
    pendingFilenamesByUrl.delete(url);
    pendingFilenamesByUrl.delete(downloadItem.url);
    suggest({ filename, conflictAction: "uniquify" });
  });
  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta.state) return;
    const taskId = pendingDownloads.get(delta.id) || [...tasks.values()].find((task) => task.browserDownloadId === delta.id)?.taskId;
    if (!taskId) return;
    if (delta.state.current === "complete") void finishTask(taskId);
    if (delta.state.current === "interrupted") void failTask(taskId, "\u6D4F\u89C8\u5668\u4FDD\u5B58\u5DF2\u53D6\u6D88\u6216\u4E2D\u65AD");
  });
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const { url, tabId } = details;
      if (isWidevineLicenseUrl(url)) {
        if (tabId >= 0 && details.method === "POST" && /^https:\/\/([\w-]+\.)*rplay\.live$/.test(details.initiator || "")) {
          const context2 = getDetectionContext(tabId);
          void writeDetectionStorage(tabId, () => {
            if (detectionContexts.get(tabId) !== context2) return;
            return chrome.storage.session.set({ [`${LICENSE_STORAGE_PREFIX}${tabId}`]: url });
          }).catch(() => {
          });
        }
        return;
      }
      if (!shouldInspectMediaRequest(details)) return;
      if (isKnownVideoSource(getDetectedVideos(tabId), url) || !shouldProcessUrl(tabId, url)) return;
      const context = getDetectionContext(tabId);
      setTimeout(async () => {
        try {
          if (detectionContexts.get(tabId) !== context || isKnownVideoSource(getDetectedVideos(tabId), url)) return;
          const detected = await inspectVideoSource(url, {
            fetchFn: (input, init = {}) => fetch(input, { ...init, credentials: "include" }),
            resolveTitle: () => getRPlaySourceType(url) === "cmaf" ? resolveCmafPageTitle(tabId, context) : resolvePageTitle(tabId),
            now: Date.now
          });
          if (!detected || detectionContexts.get(tabId) !== context) return;
          const previous = getDetectedVideos(tabId);
          const list = mergeVideoSources(previous, detected);
          if (list === previous) return;
          videoInfo.set(tabId, list);
          await writeDetectionStorage(tabId, () => {
            if (detectionContexts.get(tabId) !== context) return;
            return chrome.storage.local.set({ [`${VIDEO_STORAGE_PREFIX}${tabId}`]: list });
          });
          if (detectionContexts.get(tabId) !== context) return;
          if (list.length !== previous.length) await updateBadge(String(list.length), "#666666", tabId);
          if (detectionContexts.get(tabId) !== context) return;
          if (isCmafTrackOnlySource(detected) && previous.some(isCmafTrackOnlySource)) return;
          broadcast({ type: MessageType.VIDEO_DETECTED, tabId, data: detected });
        } catch (error) {
          console.error("[RPlay] \u68C0\u6D4B\u5A92\u4F53\u5931\u8D25:", error);
        }
      }, 500);
    },
    { urls: ["*://*.rplay-cdn.com/*", "*://*.rplay.live/*", "https://widevine-dash.ezdrm.com/*"] }
  );
  function clearTabDetection(tabId, { removed = false } = {}) {
    cmafTitleRequests.delete(tabId);
    if (removed) {
      detectionContexts.delete(tabId);
      videoInfo.delete(tabId);
    } else {
      detectionContexts.set(tabId, Symbol());
      videoInfo.set(tabId, []);
    }
    for (const key of processedUrls.keys()) {
      if (key.startsWith(`${tabId}:`)) processedUrls.delete(key);
    }
    void writeDetectionStorage(tabId, () => Promise.all([
      chrome.storage.local.remove(`${VIDEO_STORAGE_PREFIX}${tabId}`),
      chrome.storage.session.remove(`${LICENSE_STORAGE_PREFIX}${tabId}`)
    ])).catch(() => {
    });
    if (!removed) broadcast({ type: MessageType.VIDEO_INFO_CLEARED, tabId });
  }
  chrome.tabs.onRemoved.addListener((tabId) => clearTabDetection(tabId, { removed: true }));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url && changeInfo.status !== "loading") return;
    clearTabDetection(tabId);
    if (tasks.get(activeTaskId)?.tabId !== tabId) void updateBadge("", "#666666", tabId);
  });
  setInterval(() => {
    const cutoff = Date.now() - 6e4;
    for (const [key, timestamp] of processedUrls) {
      if (timestamp < cutoff) processedUrls.delete(key);
    }
  }, 6e4);
  console.log("RPlay Video Downloader background v2 loaded");
})();
