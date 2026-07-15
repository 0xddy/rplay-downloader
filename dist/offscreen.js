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
    constructor(message, code, options = {}) {
      super(message, options);
      this.name = this.constructor.name;
      this.code = code;
      this.kind = options.kind || ErrorKind.INTERNAL;
    }
  };
  var SourceError = class extends RPlayError {
    constructor(message, code = "SOURCE_ERROR", options) {
      super(message, code, { ...options, kind: ErrorKind.SOURCE });
      this.isSourceError = true;
    }
  };
  var RemuxCompatibilityError = class extends RPlayError {
    constructor(message, options) {
      super(message, "REMUX_INCOMPATIBLE", { ...options, kind: ErrorKind.COMPATIBILITY });
      this.canFallbackToTs = true;
    }
  };
  var UnsupportedFallbackError = class extends RPlayError {
    constructor(message, code = "TS_FALLBACK_UNSUPPORTED", options) {
      super(message, code, { ...options, kind: ErrorKind.UNSUPPORTED });
    }
  };
  var TaskCanceledError = class extends RPlayError {
    constructor(message = "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
      super(message, "TASK_CANCELED", { kind: ErrorKind.CANCELED });
    }
  };
  function isAbortError(error) {
    return error?.name === "AbortError" || error?.code === "TASK_CANCELED";
  }
  function isSourceFailure(error) {
    if (error?.kind) return error.kind === ErrorKind.SOURCE;
    if (error?.isSourceError) return true;
    const text = `${error?.name || ""} ${error?.message || error || ""}`.toLowerCase();
    return /network|fetch|http\s*\d+|manifest|playlist|m3u8|密钥|解密|decrypt|cors|unauthori[sz]ed|forbidden|not found/.test(text);
  }
  function shouldFallbackToTs(error) {
    return error?.kind === ErrorKind.COMPATIBILITY && error?.canFallbackToTs === true;
  }

  // src/download-session.js
  function abortDownloadContext(context) {
    context.controller.abort();
    context.prefetcher?.dispose();
    context.input?.dispose();
    if (context.output && !["canceled", "finalized"].includes(context.output.state)) {
      try {
        void Promise.resolve(context.output.cancel()).catch(() => {
        });
      } catch {
      }
    }
    return true;
  }

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/misc.js
  function assert(x) {
    if (!x) {
      throw new Error("Assertion failed.");
    }
  }
  var normalizeRotation = (rotation) => {
    const mappedRotation = (rotation % 360 + 360) % 360;
    if (mappedRotation === 0 || mappedRotation === 90 || mappedRotation === 180 || mappedRotation === 270) {
      return mappedRotation;
    } else {
      throw new Error(`Invalid rotation ${rotation}.`);
    }
  };
  var last = (arr) => {
    return arr && arr[arr.length - 1];
  };
  var isU32 = (value) => {
    return value >= 0 && value < 2 ** 32;
  };
  var readExpGolomb = (bitstream) => {
    let leadingZeroBits = 0;
    while (bitstream.readBits(1) === 0 && leadingZeroBits < 32) {
      leadingZeroBits++;
    }
    if (leadingZeroBits >= 32) {
      throw new Error("Invalid exponential-Golomb code.");
    }
    const result = (1 << leadingZeroBits) - 1 + bitstream.readBits(leadingZeroBits);
    return result;
  };
  var readSignedExpGolomb = (bitstream) => {
    const codeNum = readExpGolomb(bitstream);
    return (codeNum & 1) === 0 ? -(codeNum >> 1) : codeNum + 1 >> 1;
  };
  var toUint8Array = (source) => {
    if (source.constructor === Uint8Array) {
      return source;
    } else if (ArrayBuffer.isView(source)) {
      return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    } else {
      return new Uint8Array(source);
    }
  };
  var toDataView = (source) => {
    if (source.constructor === DataView) {
      return source;
    } else if (ArrayBuffer.isView(source)) {
      return new DataView(source.buffer, source.byteOffset, source.byteLength);
    } else {
      return new DataView(source);
    }
  };
  var textDecoder = /* @__PURE__ */ new TextDecoder();
  var textEncoder = /* @__PURE__ */ new TextEncoder();
  var invertObject = (object) => {
    return Object.fromEntries(Object.entries(object).map(([key, value]) => [value, key]));
  };
  var COLOR_PRIMARIES_MAP = {
    bt709: 1,
    // ITU-R BT.709
    bt470bg: 5,
    // ITU-R BT.470BG
    smpte170m: 6,
    // ITU-R BT.601 525 - SMPTE 170M
    bt2020: 9,
    // ITU-R BT.202
    smpte432: 12
    // SMPTE EG 432-1
  };
  var COLOR_PRIMARIES_MAP_INVERSE = /* @__PURE__ */ invertObject(COLOR_PRIMARIES_MAP);
  var TRANSFER_CHARACTERISTICS_MAP = {
    "bt709": 1,
    // ITU-R BT.709
    "smpte170m": 6,
    // SMPTE 170M
    "linear": 8,
    // Linear transfer characteristics
    "iec61966-2-1": 13,
    // IEC 61966-2-1
    "pq": 16,
    // Rec. ITU-R BT.2100-2 perceptual quantization (PQ) system
    "hlg": 18
    // Rec. ITU-R BT.2100-2 hybrid loggamma (HLG) system
  };
  var TRANSFER_CHARACTERISTICS_MAP_INVERSE = /* @__PURE__ */ invertObject(TRANSFER_CHARACTERISTICS_MAP);
  var MATRIX_COEFFICIENTS_MAP = {
    "rgb": 0,
    // Identity
    "bt709": 1,
    // ITU-R BT.709
    "bt470bg": 5,
    // ITU-R BT.470BG
    "smpte170m": 6,
    // SMPTE 170M
    "bt2020-ncl": 9
    // ITU-R BT.2020-2 (non-constant luminance)
  };
  var MATRIX_COEFFICIENTS_MAP_INVERSE = /* @__PURE__ */ invertObject(MATRIX_COEFFICIENTS_MAP);
  var colorSpaceIsComplete = (colorSpace) => {
    return !!colorSpace && !!colorSpace.primaries && !!colorSpace.transfer && !!colorSpace.matrix && colorSpace.fullRange !== void 0;
  };
  var isAllowSharedBufferSource = (x) => {
    return x instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer || ArrayBuffer.isView(x);
  };
  var AsyncMutex = class {
    constructor() {
      this.currentPromise = Promise.resolve();
      this.pending = 0;
    }
    async acquire() {
      let resolver;
      const nextPromise = new Promise((resolve) => {
        let resolved = false;
        resolver = () => {
          if (resolved) {
            return;
          }
          resolve();
          this.pending--;
          resolved = true;
        };
      });
      const currentPromiseAlias = this.currentPromise;
      this.currentPromise = nextPromise;
      this.pending++;
      await currentPromiseAlias;
      return resolver;
    }
  };
  var HEX_STRING_REGEX = /^[0-9a-fA-F]+$/;
  var bytesToHexString = (bytes2) => {
    return [...bytes2].map((x) => x.toString(16).padStart(2, "0")).join("");
  };
  var hexStringToBytes = (hexString) => {
    assert(hexString.length % 2 === 0);
    const bytes2 = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      bytes2[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
    }
    return bytes2;
  };
  var reverseBitsU32 = (x) => {
    x = x >> 1 & 1431655765 | (x & 1431655765) << 1;
    x = x >> 2 & 858993459 | (x & 858993459) << 2;
    x = x >> 4 & 252645135 | (x & 252645135) << 4;
    x = x >> 8 & 16711935 | (x & 16711935) << 8;
    x = x >> 16 & 65535 | (x & 65535) << 16;
    return x >>> 0;
  };
  var binarySearchExact = (arr, key, valueGetter) => {
    let low = 0;
    let high = arr.length - 1;
    let ans = -1;
    while (low <= high) {
      const mid = low + high >> 1;
      const midVal = valueGetter(arr[mid]);
      if (midVal === key) {
        ans = mid;
        high = mid - 1;
      } else if (midVal < key) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  };
  var binarySearchLessOrEqual = (arr, key, valueGetter) => {
    let low = 0;
    let high = arr.length - 1;
    let ans = -1;
    while (low <= high) {
      const mid = low + (high - low + 1) / 2 | 0;
      const midVal = valueGetter(arr[mid]);
      if (midVal <= key) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  };
  var promiseWithResolvers = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  var removeItem = (arr, item) => {
    const index = arr.indexOf(item);
    if (index !== -1) {
      arr.splice(index, 1);
    }
  };
  var findLastIndex = (arr, predicate) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (predicate(arr[i])) {
        return i;
      }
    }
    return -1;
  };
  var assertNever = (x) => {
    throw new Error(`Unexpected value: ${x}`);
  };
  var getUint24 = (view2, byteOffset, littleEndian) => {
    const byte1 = view2.getUint8(byteOffset);
    const byte2 = view2.getUint8(byteOffset + 1);
    const byte3 = view2.getUint8(byteOffset + 2);
    if (littleEndian) {
      return byte1 | byte2 << 8 | byte3 << 16;
    } else {
      return byte1 << 16 | byte2 << 8 | byte3;
    }
  };
  var setUint24 = (view2, byteOffset, value, littleEndian) => {
    value = value >>> 0;
    value = value & 16777215;
    if (littleEndian) {
      view2.setUint8(byteOffset, value & 255);
      view2.setUint8(byteOffset + 1, value >>> 8 & 255);
      view2.setUint8(byteOffset + 2, value >>> 16 & 255);
    } else {
      view2.setUint8(byteOffset, value >>> 16 & 255);
      view2.setUint8(byteOffset + 1, value >>> 8 & 255);
      view2.setUint8(byteOffset + 2, value & 255);
    }
  };
  var clamp = (value, min, max) => {
    return Math.max(min, Math.min(max, value));
  };
  var UNDETERMINED_LANGUAGE = "und";
  var roundIfAlmostInteger = (value) => {
    const rounded = Math.round(value);
    if (Math.abs(value / rounded - 1) < 10 * Number.EPSILON) {
      return rounded;
    } else {
      return value;
    }
  };
  var roundToMultiple = (value, multiple) => {
    return Math.round(value / multiple) * multiple;
  };
  var roundToDivisor = (value, multiple) => {
    return Math.round(value * multiple) / multiple;
  };
  var floorToMultiple = (value, multiple) => {
    return Math.floor(value / multiple) * multiple;
  };
  var ISO_639_2_REGEX = /^[a-z]{3}$/;
  var isIso639Dash2LanguageCode = (x) => {
    return ISO_639_2_REGEX.test(x);
  };
  var SECOND_TO_MICROSECOND_FACTOR = 1e6 * (1 + Number.EPSILON);
  var mergeRequestInit = (init1, init2) => {
    const merged = { ...init1, ...init2 };
    if (init1.headers || init2.headers) {
      const headers1 = init1.headers ? normalizeHeaders(init1.headers) : {};
      const headers2 = init2.headers ? normalizeHeaders(init2.headers) : {};
      const mergedHeaders = { ...headers1 };
      Object.entries(headers2).forEach(([key2, value2]) => {
        const existingKey = Object.keys(mergedHeaders).find((key1) => key1.toLowerCase() === key2.toLowerCase());
        if (existingKey) {
          delete mergedHeaders[existingKey];
        }
        mergedHeaders[key2] = value2;
      });
      merged.headers = mergedHeaders;
    }
    return merged;
  };
  var normalizeHeaders = (headers) => {
    if (headers instanceof Headers) {
      const result = {};
      headers.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    if (Array.isArray(headers)) {
      const result = {};
      headers.forEach(([key, value]) => {
        result[key] = value;
      });
      return result;
    }
    return headers;
  };
  var retriedFetch = async (fetchFn, url2, requestInit, getRetryDelay, shouldStop) => {
    let attempts = 0;
    while (true) {
      try {
        return await fetchFn(url2, requestInit);
      } catch (error) {
        if (shouldStop()) {
          throw error;
        }
        attempts++;
        const retryDelayInSeconds = getRetryDelay(attempts, error, url2);
        if (retryDelayInSeconds === null) {
          throw error;
        }
        Logging._error("Retrying failed fetch. Error:", error);
        if (!Number.isFinite(retryDelayInSeconds) || retryDelayInSeconds < 0) {
          throw new TypeError("Retry delay must be a non-negative finite number.");
        }
        if (retryDelayInSeconds > 0) {
          await wait(1e3 * retryDelayInSeconds);
        }
        if (shouldStop()) {
          throw error;
        }
      }
    }
  };
  var computeRationalApproximation = (x, maxDenominator) => {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    let prevNumerator = 0, prevDenominator = 1;
    let currNumerator = 1, currDenominator = 0;
    let remainder = x;
    while (true) {
      const integer = Math.floor(remainder);
      const nextNumerator = integer * currNumerator + prevNumerator;
      const nextDenominator = integer * currDenominator + prevDenominator;
      if (nextDenominator > maxDenominator) {
        return {
          num: sign * currNumerator,
          den: currDenominator
        };
      }
      prevNumerator = currNumerator;
      prevDenominator = currDenominator;
      currNumerator = nextNumerator;
      currDenominator = nextDenominator;
      remainder = 1 / (remainder - integer);
      if (!isFinite(remainder)) {
        break;
      }
    }
    return {
      num: sign * currNumerator,
      den: currDenominator
    };
  };
  var isChromiumCache = null;
  var isChromium = () => {
    if (isChromiumCache !== null) {
      return isChromiumCache;
    }
    return isChromiumCache = !!(typeof navigator !== "undefined" && (navigator.vendor?.includes("Google Inc") || /Chrome/.test(navigator.userAgent)));
  };
  var chromiumVersionCache = null;
  var getChromiumVersion = () => {
    if (chromiumVersionCache !== null) {
      return chromiumVersionCache;
    }
    if (typeof navigator === "undefined") {
      return null;
    }
    const match = /\bChrome\/(\d+)/.exec(navigator.userAgent);
    if (!match) {
      return null;
    }
    return chromiumVersionCache = Number(match[1]);
  };
  var coalesceIndex = (a, b) => {
    return a !== -1 ? a : b;
  };
  var closedIntervalsOverlap = (startA, endA, startB, endB) => {
    return startA <= endB && startB <= endA;
  };
  var keyValueIterator = function* (object) {
    for (const key in object) {
      const value = object[key];
      if (value === void 0) {
        continue;
      }
      yield { key, value };
    }
  };
  var base64ToBytes = (base64) => {
    const decoded = atob(base64);
    const bytes2 = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes2[i] = decoded.charCodeAt(i);
    }
    return bytes2;
  };
  var uint8ArraysAreEqual = (a, b) => {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  };
  var polyfillSymbolDispose = () => {
    Symbol.dispose ??= Symbol("Symbol.dispose");
  };
  var isNumber = (x) => {
    return typeof x === "number" && !Number.isNaN(x);
  };
  var joinPaths = (basePath, relativePath) => {
    if (relativePath.includes("://")) {
      return relativePath;
    }
    if (basePath.includes("://")) {
      const queryIndex = basePath.indexOf("?");
      if (queryIndex !== -1) {
        basePath = basePath.slice(0, queryIndex);
      }
    }
    let result;
    if (relativePath.startsWith("/")) {
      const protocolIndex2 = basePath.indexOf("://");
      if (protocolIndex2 === -1) {
        result = relativePath;
      } else {
        const pathStart = basePath.indexOf("/", protocolIndex2 + 3);
        if (pathStart === -1) {
          result = basePath + relativePath;
        } else {
          result = basePath.slice(0, pathStart) + relativePath;
        }
      }
    } else {
      const lastSlash = basePath.lastIndexOf("/");
      if (lastSlash === -1) {
        result = relativePath;
      } else {
        result = basePath.slice(0, lastSlash + 1) + relativePath;
      }
    }
    let prefix = "";
    const protocolIndex = result.indexOf("://");
    if (protocolIndex !== -1) {
      const pathStart = result.indexOf("/", protocolIndex + 3);
      if (pathStart !== -1) {
        prefix = result.slice(0, pathStart);
        result = result.slice(pathStart);
      }
    }
    const segments = result.split("/");
    const normalized = [];
    for (const segment of segments) {
      if (segment === "..") {
        normalized.pop();
      } else if (segment !== ".") {
        normalized.push(segment);
      }
    }
    return prefix + normalized.join("/");
  };
  var arrayCount = (array, predicate) => {
    let count = 0;
    for (let i = 0; i < array.length; i++) {
      if (predicate(array[i])) {
        count++;
      }
    }
    return count;
  };
  var arrayArgmin = (array, getValue) => {
    let minIndex = -1;
    let minValue = Infinity;
    for (let i = 0; i < array.length; i++) {
      const value = getValue(array[i]);
      if (value < minValue) {
        minValue = value;
        minIndex = i;
      }
    }
    return minIndex;
  };
  var simplifyRational = (rational) => {
    assert(Number.isInteger(rational.num));
    assert(Number.isInteger(rational.den));
    assert(rational.den !== 0);
    let a = Math.abs(rational.num);
    let b = Math.abs(rational.den);
    while (b !== 0) {
      const t = a % b;
      a = b;
      b = t;
    }
    const gcd = a || 1;
    return {
      num: rational.num / gcd,
      den: rational.den / gcd
    };
  };
  var wait = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };
  var toArray = (x) => {
    if (Array.isArray(x)) {
      return x;
    } else {
      return [x];
    }
  };
  var EventEmitter = class {
    constructor() {
      this._listeners = /* @__PURE__ */ new Map();
    }
    /** Registers a listener for the given event. Returns a function that, when called, removes the listener again. */
    on(event, listener, options) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, /* @__PURE__ */ new Set());
      }
      const entry = { fn: listener, once: options?.once ?? false };
      this._listeners.get(event).add(entry);
      return () => {
        this._listeners.get(event)?.delete(entry);
      };
    }
    /** @internal */
    _emit(...args) {
      const [event, data] = args;
      const listeners = this._listeners.get(event);
      if (!listeners) {
        return;
      }
      for (const entry of listeners) {
        try {
          entry.fn(data);
        } catch (error) {
          console.error(error);
        }
        if (entry.once) {
          listeners.delete(entry);
        }
      }
    }
  };
  var isRecordStringString = (value) => {
    return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every((x) => typeof x === "string");
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/logging.js
  var LogLevel;
  (function(LogLevel2) {
    LogLevel2[LogLevel2["Silent"] = 0] = "Silent";
    LogLevel2[LogLevel2["Errors"] = 1] = "Errors";
    LogLevel2[LogLevel2["Warnings"] = 2] = "Warnings";
    LogLevel2[LogLevel2["Info"] = 3] = "Info";
  })(LogLevel || (LogLevel = {}));
  var Logging = class _Logging {
    constructor() {
    }
    /** The current log level. Defaults to {@link LogLevel.Info}. */
    static get level() {
      return _Logging._level;
    }
    static set level(value) {
      if (value !== LogLevel.Silent && value !== LogLevel.Errors && value !== LogLevel.Warnings && value !== LogLevel.Info) {
        throw new TypeError("Invalid log level. Use one of the values of the LogLevel enum.");
      }
      _Logging._level = value;
    }
    /** @internal */
    static get _emitter() {
      return _Logging._emitterInstance ??= new EventEmitter();
    }
    /** Registers a listener for a log event. Returns a function that, when called, removes the listener again. */
    static on(event, listener, options) {
      return _Logging._emitter.on(event, listener, options);
    }
    /** @internal */
    static _error(...args) {
      _Logging._emitter._emit("error", args);
      if (_Logging._level >= LogLevel.Errors) {
        console.error(...args);
      }
    }
    /** @internal */
    static _warn(...args) {
      _Logging._emitter._emit("warn", args);
      if (_Logging._level >= LogLevel.Warnings) {
        console.warn(...args);
      }
    }
    /** @internal */
    static _info(...args) {
      _Logging._emitter._emit("info", args);
      if (_Logging._level >= LogLevel.Info) {
        console.info(...args);
      }
    }
  };
  Logging._level = LogLevel.Info;
  Logging._emitterInstance = null;

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/metadata.js
  var RichImageData = class {
    /** Creates a new {@link RichImageData}. */
    constructor(data, mimeType) {
      this.data = data;
      this.mimeType = mimeType;
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("data must be a Uint8Array.");
      }
      if (typeof mimeType !== "string") {
        throw new TypeError("mimeType must be a string.");
      }
    }
  };
  var AttachedFile = class {
    /** Creates a new {@link AttachedFile}. */
    constructor(data, mimeType, name, description) {
      this.data = data;
      this.mimeType = mimeType;
      this.name = name;
      this.description = description;
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("data must be a Uint8Array.");
      }
      if (mimeType !== void 0 && typeof mimeType !== "string") {
        throw new TypeError("mimeType, when provided, must be a string.");
      }
      if (name !== void 0 && typeof name !== "string") {
        throw new TypeError("name, when provided, must be a string.");
      }
      if (description !== void 0 && typeof description !== "string") {
        throw new TypeError("description, when provided, must be a string.");
      }
    }
  };
  var validateMetadataTags = (tags) => {
    if (!tags || typeof tags !== "object") {
      throw new TypeError("tags must be an object.");
    }
    if (tags.title !== void 0 && typeof tags.title !== "string") {
      throw new TypeError("tags.title, when provided, must be a string.");
    }
    if (tags.description !== void 0 && typeof tags.description !== "string") {
      throw new TypeError("tags.description, when provided, must be a string.");
    }
    if (tags.artist !== void 0 && typeof tags.artist !== "string") {
      throw new TypeError("tags.artist, when provided, must be a string.");
    }
    if (tags.album !== void 0 && typeof tags.album !== "string") {
      throw new TypeError("tags.album, when provided, must be a string.");
    }
    if (tags.albumArtist !== void 0 && typeof tags.albumArtist !== "string") {
      throw new TypeError("tags.albumArtist, when provided, must be a string.");
    }
    if (tags.trackNumber !== void 0 && (!Number.isInteger(tags.trackNumber) || tags.trackNumber <= 0)) {
      throw new TypeError("tags.trackNumber, when provided, must be a positive integer.");
    }
    if (tags.tracksTotal !== void 0 && (!Number.isInteger(tags.tracksTotal) || tags.tracksTotal <= 0)) {
      throw new TypeError("tags.tracksTotal, when provided, must be a positive integer.");
    }
    if (tags.discNumber !== void 0 && (!Number.isInteger(tags.discNumber) || tags.discNumber <= 0)) {
      throw new TypeError("tags.discNumber, when provided, must be a positive integer.");
    }
    if (tags.discsTotal !== void 0 && (!Number.isInteger(tags.discsTotal) || tags.discsTotal <= 0)) {
      throw new TypeError("tags.discsTotal, when provided, must be a positive integer.");
    }
    if (tags.genre !== void 0 && typeof tags.genre !== "string") {
      throw new TypeError("tags.genre, when provided, must be a string.");
    }
    if (tags.date !== void 0 && (!(tags.date instanceof Date) || Number.isNaN(tags.date.getTime()))) {
      throw new TypeError("tags.date, when provided, must be a valid Date.");
    }
    if (tags.lyrics !== void 0 && typeof tags.lyrics !== "string") {
      throw new TypeError("tags.lyrics, when provided, must be a string.");
    }
    if (tags.images !== void 0) {
      if (!Array.isArray(tags.images)) {
        throw new TypeError("tags.images, when provided, must be an array.");
      }
      for (const image of tags.images) {
        if (!image || typeof image !== "object") {
          throw new TypeError("Each image in tags.images must be an object.");
        }
        if (!(image.data instanceof Uint8Array)) {
          throw new TypeError("Each image.data must be a Uint8Array.");
        }
        if (typeof image.mimeType !== "string") {
          throw new TypeError("Each image.mimeType must be a string.");
        }
        if (!["coverFront", "coverBack", "unknown"].includes(image.kind)) {
          throw new TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
        }
      }
    }
    if (tags.comment !== void 0 && typeof tags.comment !== "string") {
      throw new TypeError("tags.comment, when provided, must be a string.");
    }
    if (tags.raw !== void 0) {
      if (!tags.raw || typeof tags.raw !== "object") {
        throw new TypeError("tags.raw, when provided, must be an object.");
      }
      for (const value of Object.values(tags.raw)) {
        if (value !== null && typeof value !== "string" && !(value instanceof Uint8Array) && !(value instanceof RichImageData) && !(value instanceof AttachedFile) && !isRecordStringString(value)) {
          throw new TypeError("Each value in tags.raw must be a string, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.");
        }
      }
    }
  };
  var DEFAULT_TRACK_DISPOSITION = {
    default: true,
    primary: true,
    forced: false,
    original: false,
    commentary: false,
    hearingImpaired: false,
    visuallyImpaired: false
  };
  var validateTrackDisposition = (disposition) => {
    if (!disposition || typeof disposition !== "object") {
      throw new TypeError("disposition must be an object.");
    }
    if (disposition.default !== void 0 && typeof disposition.default !== "boolean") {
      throw new TypeError("disposition.default must be a boolean.");
    }
    if (disposition.primary !== void 0 && typeof disposition.primary !== "boolean") {
      throw new TypeError("disposition.primary must be a boolean.");
    }
    if (disposition.forced !== void 0 && typeof disposition.forced !== "boolean") {
      throw new TypeError("disposition.forced must be a boolean.");
    }
    if (disposition.original !== void 0 && typeof disposition.original !== "boolean") {
      throw new TypeError("disposition.original must be a boolean.");
    }
    if (disposition.commentary !== void 0 && typeof disposition.commentary !== "boolean") {
      throw new TypeError("disposition.commentary must be a boolean.");
    }
    if (disposition.hearingImpaired !== void 0 && typeof disposition.hearingImpaired !== "boolean") {
      throw new TypeError("disposition.hearingImpaired must be a boolean.");
    }
    if (disposition.visuallyImpaired !== void 0 && typeof disposition.visuallyImpaired !== "boolean") {
      throw new TypeError("disposition.visuallyImpaired must be a boolean.");
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/shared/bitstream.js
  var Bitstream = class _Bitstream {
    constructor(bytes2) {
      this.bytes = bytes2;
      this.pos = 0;
    }
    seekToByte(byteOffset) {
      this.pos = 8 * byteOffset;
    }
    readBit() {
      const byteIndex = Math.floor(this.pos / 8);
      const byte = this.bytes[byteIndex] ?? 0;
      const bitIndex = 7 - (this.pos & 7);
      const bit = (byte & 1 << bitIndex) >> bitIndex;
      this.pos++;
      return bit;
    }
    readBits(n) {
      if (n === 1) {
        return this.readBit();
      }
      let result = 0;
      for (let i = 0; i < n; i++) {
        result <<= 1;
        result |= this.readBit();
      }
      return result;
    }
    writeBits(n, value) {
      const end = this.pos + n;
      for (let i = this.pos; i < end; i++) {
        const byteIndex = Math.floor(i / 8);
        let byte = this.bytes[byteIndex];
        const bitIndex = 7 - (i & 7);
        byte &= ~(1 << bitIndex);
        byte |= (value & 1 << end - i - 1) >> end - i - 1 << bitIndex;
        this.bytes[byteIndex] = byte;
      }
      this.pos = end;
    }
    readAlignedByte() {
      if (this.pos % 8 !== 0) {
        throw new Error("Bitstream is not byte-aligned.");
      }
      const byteIndex = this.pos / 8;
      const byte = this.bytes[byteIndex] ?? 0;
      this.pos += 8;
      return byte;
    }
    skipBits(n) {
      this.pos += n;
    }
    getBitsLeft() {
      return this.bytes.length * 8 - this.pos;
    }
    clone() {
      const clone = new _Bitstream(this.bytes);
      clone.pos = this.pos;
      return clone;
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/shared/aac-misc.js
  var aacFrequencyTable = [
    96e3,
    88200,
    64e3,
    48e3,
    44100,
    32e3,
    24e3,
    22050,
    16e3,
    12e3,
    11025,
    8e3,
    7350
  ];
  var aacChannelMap = [-1, 1, 2, 3, 4, 5, 6, 8];
  var parseAacAudioSpecificConfig = (bytes2) => {
    if (!bytes2 || bytes2.byteLength < 2) {
      throw new TypeError("AAC description must be at least 2 bytes long.");
    }
    const bitstream = new Bitstream(bytes2);
    let objectType = bitstream.readBits(5);
    if (objectType === 31) {
      objectType = 32 + bitstream.readBits(6);
    }
    const frequencyIndex = bitstream.readBits(4);
    let sampleRate = null;
    if (frequencyIndex === 15) {
      sampleRate = bitstream.readBits(24);
    } else {
      if (frequencyIndex < aacFrequencyTable.length) {
        sampleRate = aacFrequencyTable[frequencyIndex];
      }
    }
    const channelConfiguration = bitstream.readBits(4);
    let numberOfChannels = null;
    if (channelConfiguration >= 1 && channelConfiguration <= 7) {
      numberOfChannels = aacChannelMap[channelConfiguration];
    }
    return {
      objectType,
      frequencyIndex,
      sampleRate,
      channelConfiguration,
      numberOfChannels
    };
  };
  var buildAacAudioSpecificConfig = (config) => {
    let frequencyIndex = aacFrequencyTable.indexOf(config.sampleRate);
    let customSampleRate = null;
    if (frequencyIndex === -1) {
      frequencyIndex = 15;
      customSampleRate = config.sampleRate;
    }
    const channelConfiguration = aacChannelMap.indexOf(config.numberOfChannels);
    if (channelConfiguration === -1) {
      throw new TypeError(`Unsupported number of channels: ${config.numberOfChannels}`);
    }
    let bitCount = 5 + 4 + 4;
    if (config.objectType >= 32) {
      bitCount += 6;
    }
    if (frequencyIndex === 15) {
      bitCount += 24;
    }
    const byteCount = Math.ceil(bitCount / 8);
    const bytes2 = new Uint8Array(byteCount);
    const bitstream = new Bitstream(bytes2);
    if (config.objectType < 32) {
      bitstream.writeBits(5, config.objectType);
    } else {
      bitstream.writeBits(5, 31);
      bitstream.writeBits(6, config.objectType - 32);
    }
    bitstream.writeBits(4, frequencyIndex);
    if (frequencyIndex === 15) {
      bitstream.writeBits(24, customSampleRate);
    }
    bitstream.writeBits(4, channelConfiguration);
    return bytes2;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/codec.js
  var VIDEO_CODECS = [
    "avc",
    "hevc",
    "vp9",
    "av1",
    "vp8",
    "prores"
  ];
  var PCM_AUDIO_CODECS = [
    "pcm-s16",
    // We don't prefix 'le' so we're compatible with the WebCodecs-registered PCM codec strings
    "pcm-s16be",
    "pcm-s24",
    "pcm-s24be",
    "pcm-s32",
    "pcm-s32be",
    "pcm-f32",
    "pcm-f32be",
    "pcm-f64",
    "pcm-f64be",
    "pcm-u8",
    "pcm-s8",
    "ulaw",
    "alaw"
  ];
  var NON_PCM_AUDIO_CODECS = [
    "aac",
    "opus",
    "mp3",
    "vorbis",
    "flac",
    "ac3",
    "eac3"
  ];
  var AUDIO_CODECS = [
    ...NON_PCM_AUDIO_CODECS,
    ...PCM_AUDIO_CODECS
  ];
  var SUBTITLE_CODECS = [
    "webvtt"
  ];
  var AVC_LEVEL_TABLE = [
    { maxMacroblocks: 99, maxBitrate: 64e3, maxDpbMbs: 396, level: 10 },
    // Level 1
    { maxMacroblocks: 396, maxBitrate: 192e3, maxDpbMbs: 900, level: 11 },
    // Level 1.1
    { maxMacroblocks: 396, maxBitrate: 384e3, maxDpbMbs: 2376, level: 12 },
    // Level 1.2
    { maxMacroblocks: 396, maxBitrate: 768e3, maxDpbMbs: 2376, level: 13 },
    // Level 1.3
    { maxMacroblocks: 396, maxBitrate: 2e6, maxDpbMbs: 2376, level: 20 },
    // Level 2
    { maxMacroblocks: 792, maxBitrate: 4e6, maxDpbMbs: 4752, level: 21 },
    // Level 2.1
    { maxMacroblocks: 1620, maxBitrate: 4e6, maxDpbMbs: 8100, level: 22 },
    // Level 2.2
    { maxMacroblocks: 1620, maxBitrate: 1e7, maxDpbMbs: 8100, level: 30 },
    // Level 3
    { maxMacroblocks: 3600, maxBitrate: 14e6, maxDpbMbs: 18e3, level: 31 },
    // Level 3.1
    { maxMacroblocks: 5120, maxBitrate: 2e7, maxDpbMbs: 20480, level: 32 },
    // Level 3.2
    { maxMacroblocks: 8192, maxBitrate: 2e7, maxDpbMbs: 32768, level: 40 },
    // Level 4
    { maxMacroblocks: 8192, maxBitrate: 5e7, maxDpbMbs: 32768, level: 41 },
    // Level 4.1
    { maxMacroblocks: 8704, maxBitrate: 5e7, maxDpbMbs: 34816, level: 42 },
    // Level 4.2
    { maxMacroblocks: 22080, maxBitrate: 135e6, maxDpbMbs: 110400, level: 50 },
    // Level 5
    { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 51 },
    // Level 5.1
    { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 52 },
    // Level 5.2
    { maxMacroblocks: 139264, maxBitrate: 24e7, maxDpbMbs: 696320, level: 60 },
    // Level 6
    { maxMacroblocks: 139264, maxBitrate: 48e7, maxDpbMbs: 696320, level: 61 },
    // Level 6.1
    { maxMacroblocks: 139264, maxBitrate: 8e8, maxDpbMbs: 696320, level: 62 }
    // Level 6.2
  ];
  var VP9_LEVEL_TABLE = [
    { maxPictureSize: 36864, maxBitrate: 2e5, level: 10 },
    // Level 1
    { maxPictureSize: 73728, maxBitrate: 8e5, level: 11 },
    // Level 1.1
    { maxPictureSize: 122880, maxBitrate: 18e5, level: 20 },
    // Level 2
    { maxPictureSize: 245760, maxBitrate: 36e5, level: 21 },
    // Level 2.1
    { maxPictureSize: 552960, maxBitrate: 72e5, level: 30 },
    // Level 3
    { maxPictureSize: 983040, maxBitrate: 12e6, level: 31 },
    // Level 3.1
    { maxPictureSize: 2228224, maxBitrate: 18e6, level: 40 },
    // Level 4
    { maxPictureSize: 2228224, maxBitrate: 3e7, level: 41 },
    // Level 4.1
    { maxPictureSize: 8912896, maxBitrate: 6e7, level: 50 },
    // Level 5
    { maxPictureSize: 8912896, maxBitrate: 12e7, level: 51 },
    // Level 5.1
    { maxPictureSize: 8912896, maxBitrate: 18e7, level: 52 },
    // Level 5.2
    { maxPictureSize: 35651584, maxBitrate: 18e7, level: 60 },
    // Level 6
    { maxPictureSize: 35651584, maxBitrate: 24e7, level: 61 },
    // Level 6.1
    { maxPictureSize: 35651584, maxBitrate: 48e7, level: 62 }
    // Level 6.2
  ];
  var VP9_DEFAULT_SUFFIX = ".01.01.01.01.00";
  var AV1_DEFAULT_SUFFIX = ".0.110.01.01.01.0";
  var PRORES_FOURCCS = [
    "ap4x",
    // ProRes 4444 XQ
    "ap4h",
    // ProRes 4444
    "apch",
    // ProRes 422 High Quality
    "apcn",
    // ProRes 422 Standard Definition
    "apcs",
    // ProRes 422 LT
    "apco"
    // ProRes 422 Proxy
  ];
  var generateAv1CodecConfigurationFromCodecString = (codecString) => {
    const parts = codecString.split(".");
    const marker = 1;
    const version = 1;
    const firstByte = (marker << 7) + version;
    const profile = Number(parts[1]);
    const levelAndTier = parts[2];
    const level = Number(levelAndTier.slice(0, -1));
    const secondByte = (profile << 5) + level;
    const tier = levelAndTier.slice(-1) === "H" ? 1 : 0;
    const bitDepth = Number(parts[3]);
    const highBitDepth = bitDepth === 8 ? 0 : 1;
    const twelveBit = 0;
    const monochrome = parts[4] ? Number(parts[4]) : 0;
    const chromaSubsamplingX = parts[5] ? Number(parts[5][0]) : 1;
    const chromaSubsamplingY = parts[5] ? Number(parts[5][1]) : 1;
    const chromaSamplePosition = parts[5] ? Number(parts[5][2]) : 0;
    const thirdByte = (tier << 7) + (highBitDepth << 6) + (twelveBit << 5) + (monochrome << 4) + (chromaSubsamplingX << 3) + (chromaSubsamplingY << 2) + chromaSamplePosition;
    const initialPresentationDelayPresent = 0;
    const fourthByte = initialPresentationDelayPresent;
    return [firstByte, secondByte, thirdByte, fourthByte];
  };
  var extractVideoCodecString = (trackInfo) => {
    const { codec, codecDescription, colorSpace, avcCodecInfo, hevcCodecInfo, vp9CodecInfo, av1CodecInfo, proresFormat } = trackInfo;
    if (codec === "avc") {
      assert(trackInfo.avcType !== null);
      if (avcCodecInfo) {
        const bytes2 = new Uint8Array([
          avcCodecInfo.avcProfileIndication,
          avcCodecInfo.profileCompatibility,
          avcCodecInfo.avcLevelIndication
        ]);
        return `avc${trackInfo.avcType}.${bytesToHexString(bytes2)}`;
      }
      if (!codecDescription || codecDescription.byteLength < 4) {
        throw new TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
      }
      return `avc${trackInfo.avcType}.${bytesToHexString(codecDescription.subarray(1, 4))}`;
    } else if (codec === "hevc") {
      let generalProfileSpace;
      let generalProfileIdc;
      let compatibilityFlags;
      let generalTierFlag;
      let generalLevelIdc;
      let constraintFlags;
      if (hevcCodecInfo) {
        generalProfileSpace = hevcCodecInfo.generalProfileSpace;
        generalProfileIdc = hevcCodecInfo.generalProfileIdc;
        compatibilityFlags = reverseBitsU32(hevcCodecInfo.generalProfileCompatibilityFlags);
        generalTierFlag = hevcCodecInfo.generalTierFlag;
        generalLevelIdc = hevcCodecInfo.generalLevelIdc;
        constraintFlags = [...hevcCodecInfo.generalConstraintIndicatorFlags];
      } else {
        if (!codecDescription || codecDescription.byteLength < 23) {
          throw new TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
        }
        const view2 = toDataView(codecDescription);
        const profileByte = view2.getUint8(1);
        generalProfileSpace = profileByte >> 6 & 3;
        generalProfileIdc = profileByte & 31;
        compatibilityFlags = reverseBitsU32(view2.getUint32(2));
        generalTierFlag = profileByte >> 5 & 1;
        generalLevelIdc = view2.getUint8(12);
        constraintFlags = [];
        for (let i = 0; i < 6; i++) {
          constraintFlags.push(view2.getUint8(6 + i));
        }
      }
      let codecString = "hev1.";
      codecString += ["", "A", "B", "C"][generalProfileSpace] + generalProfileIdc;
      codecString += ".";
      codecString += compatibilityFlags.toString(16).toUpperCase();
      codecString += ".";
      codecString += generalTierFlag === 0 ? "L" : "H";
      codecString += generalLevelIdc;
      while (constraintFlags.length > 0 && constraintFlags[constraintFlags.length - 1] === 0) {
        constraintFlags.pop();
      }
      if (constraintFlags.length > 0) {
        codecString += ".";
        codecString += constraintFlags.map((x) => x.toString(16).toUpperCase()).join(".");
      }
      return codecString;
    } else if (codec === "vp8") {
      return "vp8";
    } else if (codec === "vp9") {
      if (!vp9CodecInfo) {
        const pictureSize = trackInfo.width * trackInfo.height;
        let level2 = last(VP9_LEVEL_TABLE).level;
        for (const entry of VP9_LEVEL_TABLE) {
          if (pictureSize <= entry.maxPictureSize) {
            level2 = entry.level;
            break;
          }
        }
        return `vp09.00.${level2.toString().padStart(2, "0")}.08`;
      }
      const profile = vp9CodecInfo.profile.toString().padStart(2, "0");
      const level = vp9CodecInfo.level.toString().padStart(2, "0");
      const bitDepth = vp9CodecInfo.bitDepth.toString().padStart(2, "0");
      const chromaSubsampling = vp9CodecInfo.chromaSubsampling.toString().padStart(2, "0");
      const colourPrimaries = vp9CodecInfo.colourPrimaries.toString().padStart(2, "0");
      const transferCharacteristics = vp9CodecInfo.transferCharacteristics.toString().padStart(2, "0");
      const matrixCoefficients = vp9CodecInfo.matrixCoefficients.toString().padStart(2, "0");
      const videoFullRangeFlag = vp9CodecInfo.videoFullRangeFlag.toString().padStart(2, "0");
      let string = `vp09.${profile}.${level}.${bitDepth}.${chromaSubsampling}`;
      string += `.${colourPrimaries}.${transferCharacteristics}.${matrixCoefficients}.${videoFullRangeFlag}`;
      if (string.endsWith(VP9_DEFAULT_SUFFIX)) {
        string = string.slice(0, -VP9_DEFAULT_SUFFIX.length);
      }
      return string;
    } else if (codec === "av1") {
      if (!av1CodecInfo) {
        const pictureSize = trackInfo.width * trackInfo.height;
        let level2 = last(VP9_LEVEL_TABLE).level;
        for (const entry of VP9_LEVEL_TABLE) {
          if (pictureSize <= entry.maxPictureSize) {
            level2 = entry.level;
            break;
          }
        }
        return `av01.0.${level2.toString().padStart(2, "0")}M.08`;
      }
      const profile = av1CodecInfo.profile;
      const level = av1CodecInfo.level.toString().padStart(2, "0");
      const tier = av1CodecInfo.tier ? "H" : "M";
      const bitDepth = av1CodecInfo.bitDepth.toString().padStart(2, "0");
      const monochrome = av1CodecInfo.monochrome ? "1" : "0";
      const chromaSubsampling = 100 * av1CodecInfo.chromaSubsamplingX + 10 * av1CodecInfo.chromaSubsamplingY + 1 * (av1CodecInfo.chromaSubsamplingX && av1CodecInfo.chromaSubsamplingY ? av1CodecInfo.chromaSamplePosition : 0);
      const colorPrimaries = colorSpace?.primaries ? COLOR_PRIMARIES_MAP[colorSpace.primaries] : 1;
      const transferCharacteristics = colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer] : 1;
      const matrixCoefficients = colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[colorSpace.matrix] : 1;
      const videoFullRangeFlag = colorSpace?.fullRange ? 1 : 0;
      let string = `av01.${profile}.${level}${tier}.${bitDepth}`;
      string += `.${monochrome}.${chromaSubsampling.toString().padStart(3, "0")}`;
      string += `.${colorPrimaries.toString().padStart(2, "0")}`;
      string += `.${transferCharacteristics.toString().padStart(2, "0")}`;
      string += `.${matrixCoefficients.toString().padStart(2, "0")}`;
      string += `.${videoFullRangeFlag}`;
      if (string.endsWith(AV1_DEFAULT_SUFFIX)) {
        string = string.slice(0, -AV1_DEFAULT_SUFFIX.length);
      }
      return string;
    } else if (codec === "prores") {
      return proresFormat ?? "apch";
    } else if (codec !== null) {
      assertNever(codec);
    }
    throw new TypeError(`Unhandled codec '${codec}'.`);
  };
  var extractAudioCodecString = (trackInfo) => {
    const { codec, codecDescription, aacCodecInfo } = trackInfo;
    if (codec === "aac") {
      if (!aacCodecInfo) {
        throw new TypeError("AAC codec info must be provided.");
      }
      if (aacCodecInfo.isMpeg2) {
        return "mp4a.67";
      } else {
        let objectType;
        if (aacCodecInfo.objectType !== null) {
          objectType = aacCodecInfo.objectType;
        } else {
          const audioSpecificConfig = parseAacAudioSpecificConfig(codecDescription);
          objectType = audioSpecificConfig.objectType;
        }
        return `mp4a.40.${objectType}`;
      }
    } else if (codec === "mp3") {
      return "mp3";
    } else if (codec === "opus") {
      return "opus";
    } else if (codec === "vorbis") {
      return "vorbis";
    } else if (codec === "flac") {
      return "flac";
    } else if (codec === "ac3") {
      return "ac-3";
    } else if (codec === "eac3") {
      return "ec-3";
    } else if (codec && PCM_AUDIO_CODECS.includes(codec)) {
      return codec;
    }
    throw new TypeError(`Unhandled codec '${codec}'.`);
  };
  var OPUS_SAMPLE_RATE = 48e3;
  var PCM_CODEC_REGEX = /^pcm-([usf])(\d+)(be)?$/;
  var parsePcmCodec = (codec) => {
    assert(PCM_AUDIO_CODECS.includes(codec));
    if (codec === "ulaw") {
      return { dataType: "ulaw", sampleSize: 1, littleEndian: true, silentValue: 255 };
    } else if (codec === "alaw") {
      return { dataType: "alaw", sampleSize: 1, littleEndian: true, silentValue: 213 };
    }
    const match = PCM_CODEC_REGEX.exec(codec);
    assert(match);
    let dataType;
    if (match[1] === "u") {
      dataType = "unsigned";
    } else if (match[1] === "s") {
      dataType = "signed";
    } else {
      dataType = "float";
    }
    const sampleSize = Number(match[2]) / 8;
    const littleEndian = match[3] !== "be";
    const silentValue = codec === "pcm-u8" ? 2 ** 7 : 0;
    return { dataType, sampleSize, littleEndian, silentValue };
  };
  var inferCodecFromCodecString = (codecString) => {
    if (codecString.startsWith("avc1") || codecString.startsWith("avc3")) {
      return "avc";
    } else if (codecString.startsWith("hev1") || codecString.startsWith("hvc1")) {
      return "hevc";
    } else if (codecString === "vp8") {
      return "vp8";
    } else if (codecString.startsWith("vp09")) {
      return "vp9";
    } else if (codecString.startsWith("av01")) {
      return "av1";
    } else if (PRORES_FOURCCS.includes(codecString)) {
      return "prores";
    }
    if (codecString === "mp3" || codecString === "mp4a.69" || codecString === "mp4a.6B" || codecString === "mp4a.6b" || codecString === "mp4a.40.34") {
      return "mp3";
    } else if (codecString.startsWith("mp4a.40.") || codecString === "mp4a.67") {
      return "aac";
    } else if (codecString === "opus") {
      return "opus";
    } else if (codecString === "vorbis") {
      return "vorbis";
    } else if (codecString === "flac") {
      return "flac";
    } else if (codecString === "ac-3" || codecString === "ac3") {
      return "ac3";
    } else if (codecString === "ec-3" || codecString === "eac3") {
      return "eac3";
    } else if (codecString === "ulaw") {
      return "ulaw";
    } else if (codecString === "alaw") {
      return "alaw";
    } else if (PCM_CODEC_REGEX.test(codecString)) {
      return codecString;
    }
    if (codecString === "webvtt") {
      return "webvtt";
    }
    return null;
  };
  var VALID_VIDEO_CODEC_STRING_PREFIXES = ["avc1", "avc3", "hev1", "hvc1", "vp8", "vp09", "av01", ...PRORES_FOURCCS];
  var AVC_CODEC_STRING_REGEX = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/;
  var HEVC_CODEC_STRING_REGEX = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/;
  var VP9_CODEC_STRING_REGEX = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/;
  var AV1_CODEC_STRING_REGEX = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/;
  var validateVideoChunkMetadata = (metadata) => {
    if (!metadata) {
      throw new TypeError("Video chunk metadata must be provided.");
    }
    if (typeof metadata !== "object") {
      throw new TypeError("Video chunk metadata must be an object.");
    }
    if (!metadata.decoderConfig) {
      throw new TypeError("Video chunk metadata must include a decoder configuration.");
    }
    if (typeof metadata.decoderConfig !== "object") {
      throw new TypeError("Video chunk metadata decoder configuration must be an object.");
    }
    if (typeof metadata.decoderConfig.codec !== "string") {
      throw new TypeError("Video chunk metadata decoder configuration must specify a codec string.");
    }
    if (!VALID_VIDEO_CODEC_STRING_PREFIXES.some((prefix) => metadata.decoderConfig.codec.startsWith(prefix))) {
      throw new TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");
    }
    if (!Number.isInteger(metadata.decoderConfig.codedWidth) || metadata.decoderConfig.codedWidth <= 0) {
      throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
    }
    if (!Number.isInteger(metadata.decoderConfig.codedHeight) || metadata.decoderConfig.codedHeight <= 0) {
      throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
    }
    if (metadata.decoderConfig.displayAspectWidth !== void 0 && (!Number.isInteger(metadata.decoderConfig.displayAspectWidth) || metadata.decoderConfig.displayAspectWidth <= 0)) {
      throw new TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");
    }
    if (metadata.decoderConfig.displayAspectHeight !== void 0 && (!Number.isInteger(metadata.decoderConfig.displayAspectHeight) || metadata.decoderConfig.displayAspectHeight <= 0)) {
      throw new TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");
    }
    if (metadata.decoderConfig.displayAspectWidth !== void 0 !== (metadata.decoderConfig.displayAspectHeight !== void 0)) {
      throw new TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");
    }
    if (metadata.decoderConfig.description !== void 0) {
      if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
        throw new TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
      }
    }
    if (metadata.decoderConfig.colorSpace !== void 0) {
      const { colorSpace } = metadata.decoderConfig;
      if (typeof colorSpace !== "object") {
        throw new TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
      }
      const primariesValues = Object.keys(COLOR_PRIMARIES_MAP);
      if (colorSpace.primaries != null && !primariesValues.includes(colorSpace.primaries)) {
        throw new TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${primariesValues.join(", ")}.`);
      }
      const transferValues = Object.keys(TRANSFER_CHARACTERISTICS_MAP);
      if (colorSpace.transfer != null && !transferValues.includes(colorSpace.transfer)) {
        throw new TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${transferValues.join(", ")}.`);
      }
      const matrixValues = Object.keys(MATRIX_COEFFICIENTS_MAP);
      if (colorSpace.matrix != null && !matrixValues.includes(colorSpace.matrix)) {
        throw new TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${matrixValues.join(", ")}.`);
      }
      if (colorSpace.fullRange != null && typeof colorSpace.fullRange !== "boolean") {
        throw new TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
      }
    }
    if (metadata.decoderConfig.codec.startsWith("avc1") || metadata.decoderConfig.codec.startsWith("avc3")) {
      if (!AVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
        throw new TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.");
      }
    } else if (metadata.decoderConfig.codec.startsWith("hev1") || metadata.decoderConfig.codec.startsWith("hvc1")) {
      if (!HEVC_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
        throw new TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.");
      }
    } else if (metadata.decoderConfig.codec.startsWith("vp8")) {
      if (metadata.decoderConfig.codec !== "vp8") {
        throw new TypeError('Video chunk metadata decoder configuration codec string for VP8 must be "vp8".');
      }
    } else if (metadata.decoderConfig.codec.startsWith("vp09")) {
      if (!VP9_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
        throw new TypeError('Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section "Codecs Parameter String" of https://www.webmproject.org/vp9/mp4/.');
      }
    } else if (metadata.decoderConfig.codec.startsWith("av01")) {
      if (!AV1_CODEC_STRING_REGEX.test(metadata.decoderConfig.codec)) {
        throw new TypeError('Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section "Codecs Parameter String" of https://aomediacodec.github.io/av1-isobmff/.');
      }
    } else if (PRORES_FOURCCS.some((x) => metadata.decoderConfig.codec.startsWith(x))) {
      if (!PRORES_FOURCCS.some((x) => metadata.decoderConfig.codec === x)) {
        throw new TypeError(`Video chunk metadata decoder configuration codec string for ProRes must be one of the valid ProRes four-character codes: ${PRORES_FOURCCS.join(", ")}.`);
      }
    }
  };
  var VALID_AUDIO_CODEC_STRING_PREFIXES = [
    "mp4a",
    "mp3",
    "opus",
    "vorbis",
    "flac",
    "ulaw",
    "alaw",
    "pcm",
    "ac-3",
    "ec-3"
  ];
  var validateAudioChunkMetadata = (metadata) => {
    if (!metadata) {
      throw new TypeError("Audio chunk metadata must be provided.");
    }
    if (typeof metadata !== "object") {
      throw new TypeError("Audio chunk metadata must be an object.");
    }
    if (!metadata.decoderConfig) {
      throw new TypeError("Audio chunk metadata must include a decoder configuration.");
    }
    if (typeof metadata.decoderConfig !== "object") {
      throw new TypeError("Audio chunk metadata decoder configuration must be an object.");
    }
    if (typeof metadata.decoderConfig.codec !== "string") {
      throw new TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
    }
    if (!VALID_AUDIO_CODEC_STRING_PREFIXES.some((prefix) => metadata.decoderConfig.codec.startsWith(prefix))) {
      throw new TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");
    }
    if (!Number.isInteger(metadata.decoderConfig.sampleRate) || metadata.decoderConfig.sampleRate <= 0) {
      throw new TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
    }
    if (!Number.isInteger(metadata.decoderConfig.numberOfChannels) || metadata.decoderConfig.numberOfChannels <= 0) {
      throw new TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
    }
    if (metadata.decoderConfig.description !== void 0) {
      if (!isAllowSharedBufferSource(metadata.decoderConfig.description)) {
        throw new TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
      }
    }
    if (metadata.decoderConfig.codec.startsWith("mp4a") && metadata.decoderConfig.codec !== "mp4a.69" && metadata.decoderConfig.codec !== "mp4a.6B" && metadata.decoderConfig.codec !== "mp4a.6b") {
      const validStrings = ["mp4a.40.2", "mp4a.40.02", "mp4a.40.5", "mp4a.40.05", "mp4a.40.29", "mp4a.67"];
      if (!validStrings.includes(metadata.decoderConfig.codec)) {
        throw new TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.");
      }
    } else if (metadata.decoderConfig.codec.startsWith("mp3") || metadata.decoderConfig.codec.startsWith("mp4a")) {
      if (metadata.decoderConfig.codec !== "mp3" && metadata.decoderConfig.codec !== "mp4a.69" && metadata.decoderConfig.codec !== "mp4a.6B" && metadata.decoderConfig.codec !== "mp4a.6b") {
        throw new TypeError('Audio chunk metadata decoder configuration codec string for MP3 must be "mp3", "mp4a.69" or "mp4a.6B".');
      }
    } else if (metadata.decoderConfig.codec.startsWith("opus")) {
      if (metadata.decoderConfig.codec !== "opus") {
        throw new TypeError('Audio chunk metadata decoder configuration codec string for Opus must be "opus".');
      }
      if (metadata.decoderConfig.description && metadata.decoderConfig.description.byteLength < 18) {
        throw new TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.");
      }
    } else if (metadata.decoderConfig.codec.startsWith("vorbis")) {
      if (metadata.decoderConfig.codec !== "vorbis") {
        throw new TypeError('Audio chunk metadata decoder configuration codec string for Vorbis must be "vorbis".');
      }
      if (!metadata.decoderConfig.description) {
        throw new TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.");
      }
    } else if (metadata.decoderConfig.codec.startsWith("flac")) {
      if (metadata.decoderConfig.codec !== "flac") {
        throw new TypeError('Audio chunk metadata decoder configuration codec string for FLAC must be "flac".');
      }
      const minDescriptionSize = 4 + 4 + 34;
      if (!metadata.decoderConfig.description || metadata.decoderConfig.description.byteLength < minDescriptionSize) {
        throw new TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.");
      }
    } else if (metadata.decoderConfig.codec.startsWith("ac-3") || metadata.decoderConfig.codec.startsWith("ac3")) {
      if (metadata.decoderConfig.codec !== "ac-3") {
        throw new TypeError('Audio chunk metadata decoder configuration codec string for AC-3 must be "ac-3".');
      }
    } else if (metadata.decoderConfig.codec.startsWith("ec-3") || metadata.decoderConfig.codec.startsWith("eac3")) {
      if (metadata.decoderConfig.codec !== "ec-3") {
        throw new TypeError('Audio chunk metadata decoder configuration codec string for EC-3 must be "ec-3".');
      }
    } else if (metadata.decoderConfig.codec.startsWith("pcm") || metadata.decoderConfig.codec.startsWith("ulaw") || metadata.decoderConfig.codec.startsWith("alaw")) {
      if (!PCM_AUDIO_CODECS.includes(metadata.decoderConfig.codec)) {
        throw new TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${PCM_AUDIO_CODECS.join(", ")}).`);
      }
    }
  };
  var validateSubtitleMetadata = (metadata) => {
    if (!metadata) {
      throw new TypeError("Subtitle metadata must be provided.");
    }
    if (typeof metadata !== "object") {
      throw new TypeError("Subtitle metadata must be an object.");
    }
    if (!metadata.config) {
      throw new TypeError("Subtitle metadata must include a config object.");
    }
    if (typeof metadata.config !== "object") {
      throw new TypeError("Subtitle metadata config must be an object.");
    }
    if (typeof metadata.config.description !== "string") {
      throw new TypeError("Subtitle metadata config description must be a string.");
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/shared/mp3-misc.js
  var MP3_FRAME_HEADER_SIZE = 4;
  var SAMPLING_RATES = [44100, 48e3, 32e3];
  var KILOBIT_RATES = [
    // lowSamplingFrequency === 0
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // layer = 0
    -1,
    32,
    40,
    48,
    56,
    64,
    80,
    96,
    112,
    128,
    160,
    192,
    224,
    256,
    320,
    -1,
    // layer 1
    -1,
    32,
    48,
    56,
    64,
    80,
    96,
    112,
    128,
    160,
    192,
    224,
    256,
    320,
    384,
    -1,
    // layer = 2
    -1,
    32,
    64,
    96,
    128,
    160,
    192,
    224,
    256,
    288,
    320,
    352,
    384,
    416,
    448,
    -1,
    // layer = 3
    // lowSamplingFrequency === 1
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // layer = 0
    -1,
    8,
    16,
    24,
    32,
    40,
    48,
    56,
    64,
    80,
    96,
    112,
    128,
    144,
    160,
    -1,
    // layer = 1
    -1,
    8,
    16,
    24,
    32,
    40,
    48,
    56,
    64,
    80,
    96,
    112,
    128,
    144,
    160,
    -1,
    // layer = 2
    -1,
    32,
    48,
    56,
    64,
    80,
    96,
    112,
    128,
    144,
    160,
    176,
    192,
    224,
    256,
    -1
    // layer = 3
  ];
  var XING = 1483304551;
  var INFO = 1231971951;
  var computeMp3FrameSize = (lowSamplingFrequency, layer, bitrate, sampleRate, padding) => {
    if (layer === 0) {
      return 0;
    } else if (layer === 1) {
      return Math.floor(144 * bitrate / (sampleRate << lowSamplingFrequency)) + padding;
    } else if (layer === 2) {
      return Math.floor(144 * bitrate / sampleRate) + padding;
    } else {
      return (Math.floor(12 * bitrate / sampleRate) + padding) * 4;
    }
  };
  var computeAverageMp3FrameSize = (lowSamplingFrequency, layer, bitrate, sampleRate) => {
    if (layer === 0) {
      return 0;
    } else if (layer === 1) {
      return 144 * bitrate / (sampleRate << lowSamplingFrequency);
    } else if (layer === 2) {
      return 144 * bitrate / sampleRate;
    } else {
      return 12 * bitrate / sampleRate * 4;
    }
  };
  var getXingOffset = (mpegVersionId, channel) => {
    return mpegVersionId === 3 ? channel === 3 ? 21 : 36 : channel === 3 ? 13 : 21;
  };
  var readMp3FrameHeader = (word, remainingBytes) => {
    const firstByte = word >>> 24;
    const secondByte = word >>> 16 & 255;
    const thirdByte = word >>> 8 & 255;
    const fourthByte = word & 255;
    if (firstByte !== 255 && secondByte !== 255 && thirdByte !== 255 && fourthByte !== 255) {
      return {
        header: null,
        bytesAdvanced: 4
      };
    }
    if (firstByte !== 255) {
      return { header: null, bytesAdvanced: 1 };
    }
    if ((secondByte & 224) !== 224) {
      return { header: null, bytesAdvanced: 1 };
    }
    let lowSamplingFrequency = 0;
    let mpeg25 = 0;
    if (secondByte & 1 << 4) {
      lowSamplingFrequency = secondByte & 1 << 3 ? 0 : 1;
    } else {
      lowSamplingFrequency = 1;
      mpeg25 = 1;
    }
    const mpegVersionId = secondByte >> 3 & 3;
    const layer = secondByte >> 1 & 3;
    const bitrateIndex = thirdByte >> 4 & 15;
    const frequencyIndex = (thirdByte >> 2 & 3) % 3;
    const padding = thirdByte >> 1 & 1;
    const channel = fourthByte >> 6 & 3;
    const modeExtension = fourthByte >> 4 & 3;
    const copyright = fourthByte >> 3 & 1;
    const original = fourthByte >> 2 & 1;
    const emphasis = fourthByte & 3;
    const kilobitRate = KILOBIT_RATES[lowSamplingFrequency * 16 * 4 + layer * 16 + bitrateIndex];
    if (kilobitRate === -1) {
      return { header: null, bytesAdvanced: 1 };
    }
    const bitrate = kilobitRate * 1e3;
    const sampleRate = SAMPLING_RATES[frequencyIndex] >> lowSamplingFrequency + mpeg25;
    const frameLength = computeMp3FrameSize(lowSamplingFrequency, layer, bitrate, sampleRate, padding);
    if (remainingBytes !== null && remainingBytes < frameLength) {
      return { header: null, bytesAdvanced: 1 };
    }
    let audioSamplesInFrame;
    if (mpegVersionId === 3) {
      audioSamplesInFrame = layer === 3 ? 384 : 1152;
    } else {
      if (layer === 3) {
        audioSamplesInFrame = 384;
      } else if (layer === 2) {
        audioSamplesInFrame = 1152;
      } else {
        audioSamplesInFrame = 576;
      }
    }
    return {
      header: {
        totalSize: frameLength,
        mpegVersionId,
        lowSamplingFrequency,
        layer,
        bitrate,
        frequencyIndex,
        sampleRate,
        channel,
        modeExtension,
        copyright,
        original,
        emphasis,
        audioSamplesInFrame
      },
      bytesAdvanced: 1
    };
  };
  var decodeSynchsafe = (synchsafed) => {
    let mask = 2130706432;
    let unsynchsafed = 0;
    while (mask !== 0) {
      unsynchsafed >>= 1;
      unsynchsafed |= synchsafed & mask;
      mask >>= 8;
    }
    return unsynchsafed;
  };
  var XingFlags;
  (function(XingFlags2) {
    XingFlags2[XingFlags2["FrameCount"] = 1] = "FrameCount";
    XingFlags2[XingFlags2["FileSize"] = 2] = "FileSize";
    XingFlags2[XingFlags2["Toc"] = 4] = "Toc";
  })(XingFlags || (XingFlags = {}));
  var getMp3ChannelCount = (channel) => {
    return channel === 3 ? 1 : 2;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/shared/ac3-misc.js
  var AC3_SAMPLE_RATES = [48e3, 44100, 32e3];
  var EAC3_REDUCED_SAMPLE_RATES = [24e3, 22050, 16e3];

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/codec-data.js
  var AvcNalUnitType;
  (function(AvcNalUnitType2) {
    AvcNalUnitType2[AvcNalUnitType2["NON_IDR_SLICE"] = 1] = "NON_IDR_SLICE";
    AvcNalUnitType2[AvcNalUnitType2["SLICE_DPA"] = 2] = "SLICE_DPA";
    AvcNalUnitType2[AvcNalUnitType2["SLICE_DPB"] = 3] = "SLICE_DPB";
    AvcNalUnitType2[AvcNalUnitType2["SLICE_DPC"] = 4] = "SLICE_DPC";
    AvcNalUnitType2[AvcNalUnitType2["IDR"] = 5] = "IDR";
    AvcNalUnitType2[AvcNalUnitType2["SEI"] = 6] = "SEI";
    AvcNalUnitType2[AvcNalUnitType2["SPS"] = 7] = "SPS";
    AvcNalUnitType2[AvcNalUnitType2["PPS"] = 8] = "PPS";
    AvcNalUnitType2[AvcNalUnitType2["AUD"] = 9] = "AUD";
    AvcNalUnitType2[AvcNalUnitType2["SPS_EXT"] = 13] = "SPS_EXT";
  })(AvcNalUnitType || (AvcNalUnitType = {}));
  var HevcNalUnitType;
  (function(HevcNalUnitType2) {
    HevcNalUnitType2[HevcNalUnitType2["RASL_N"] = 8] = "RASL_N";
    HevcNalUnitType2[HevcNalUnitType2["RASL_R"] = 9] = "RASL_R";
    HevcNalUnitType2[HevcNalUnitType2["BLA_W_LP"] = 16] = "BLA_W_LP";
    HevcNalUnitType2[HevcNalUnitType2["RSV_IRAP_VCL23"] = 23] = "RSV_IRAP_VCL23";
    HevcNalUnitType2[HevcNalUnitType2["VPS_NUT"] = 32] = "VPS_NUT";
    HevcNalUnitType2[HevcNalUnitType2["SPS_NUT"] = 33] = "SPS_NUT";
    HevcNalUnitType2[HevcNalUnitType2["PPS_NUT"] = 34] = "PPS_NUT";
    HevcNalUnitType2[HevcNalUnitType2["AUD_NUT"] = 35] = "AUD_NUT";
    HevcNalUnitType2[HevcNalUnitType2["PREFIX_SEI_NUT"] = 39] = "PREFIX_SEI_NUT";
    HevcNalUnitType2[HevcNalUnitType2["SUFFIX_SEI_NUT"] = 40] = "SUFFIX_SEI_NUT";
  })(HevcNalUnitType || (HevcNalUnitType = {}));
  var iterateNalUnitsInAnnexB = function* (packetData) {
    let i = 0;
    let nalStart = -1;
    while (i < packetData.length - 2) {
      const zeroIndex = packetData.indexOf(0, i);
      if (zeroIndex === -1 || zeroIndex >= packetData.length - 2) {
        break;
      }
      i = zeroIndex;
      let startCodeLength = 0;
      if (i + 3 < packetData.length && packetData[i + 1] === 0 && packetData[i + 2] === 0 && packetData[i + 3] === 1) {
        startCodeLength = 4;
      } else if (packetData[i + 1] === 0 && packetData[i + 2] === 1) {
        startCodeLength = 3;
      }
      if (startCodeLength === 0) {
        i++;
        continue;
      }
      if (nalStart !== -1 && i > nalStart) {
        yield {
          offset: nalStart,
          length: i - nalStart
        };
      }
      nalStart = i + startCodeLength;
      i = nalStart;
    }
    if (nalStart !== -1 && nalStart < packetData.length) {
      yield {
        offset: nalStart,
        length: packetData.length - nalStart
      };
    }
  };
  var iterateNalUnitsInLengthPrefixed = function* (packetData, lengthSize) {
    let offset = 0;
    const dataView = new DataView(packetData.buffer, packetData.byteOffset, packetData.byteLength);
    while (offset + lengthSize <= packetData.length) {
      let nalUnitLength;
      if (lengthSize === 1) {
        nalUnitLength = dataView.getUint8(offset);
      } else if (lengthSize === 2) {
        nalUnitLength = dataView.getUint16(offset, false);
      } else if (lengthSize === 3) {
        nalUnitLength = getUint24(dataView, offset, false);
      } else {
        assert(lengthSize === 4);
        nalUnitLength = dataView.getUint32(offset, false);
      }
      offset += lengthSize;
      yield {
        offset,
        length: nalUnitLength
      };
      offset += nalUnitLength;
    }
  };
  var iterateAvcNalUnits = (packetData, decoderConfig) => {
    if (decoderConfig.description) {
      const bytes2 = toUint8Array(decoderConfig.description);
      const lengthSizeMinusOne = bytes2[4] & 3;
      const lengthSize = lengthSizeMinusOne + 1;
      return iterateNalUnitsInLengthPrefixed(packetData, lengthSize);
    } else {
      return iterateNalUnitsInAnnexB(packetData);
    }
  };
  var extractNalUnitTypeForAvc = (byte) => {
    return byte & 31;
  };
  var removeEmulationPreventionBytes = (data) => {
    const result = [];
    const len = data.length;
    for (let i = 0; i < len; i++) {
      if (i + 2 < len && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 3) {
        result.push(0, 0);
        i += 2;
      } else {
        result.push(data[i]);
      }
    }
    return new Uint8Array(result);
  };
  var ANNEX_B_START_CODE = new Uint8Array([0, 0, 0, 1]);
  var concatNalUnitsInLengthPrefixed = (nalUnits, lengthSize) => {
    const totalLength = nalUnits.reduce((a, b) => a + lengthSize + b.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const nalUnit of nalUnits) {
      const dataView = new DataView(result.buffer, result.byteOffset, result.byteLength);
      switch (lengthSize) {
        case 1:
          dataView.setUint8(offset, nalUnit.byteLength);
          break;
        case 2:
          dataView.setUint16(offset, nalUnit.byteLength, false);
          break;
        case 3:
          setUint24(dataView, offset, nalUnit.byteLength, false);
          break;
        case 4:
          dataView.setUint32(offset, nalUnit.byteLength, false);
          break;
      }
      offset += lengthSize;
      result.set(nalUnit, offset);
      offset += nalUnit.byteLength;
    }
    return result;
  };
  var extractAvcDecoderConfigurationRecord = (packetData) => {
    try {
      const spsUnits = [];
      const ppsUnits = [];
      const spsExtUnits = [];
      for (const loc of iterateNalUnitsInAnnexB(packetData)) {
        const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
        const type = extractNalUnitTypeForAvc(nalUnit[0]);
        if (type === AvcNalUnitType.SPS) {
          spsUnits.push(nalUnit);
        } else if (type === AvcNalUnitType.PPS) {
          ppsUnits.push(nalUnit);
        } else if (type === AvcNalUnitType.SPS_EXT) {
          spsExtUnits.push(nalUnit);
        }
      }
      if (spsUnits.length === 0) {
        return null;
      }
      if (ppsUnits.length === 0) {
        return null;
      }
      const spsData = spsUnits[0];
      const spsInfo = parseAvcSps(spsData);
      assert(spsInfo !== null);
      const hasExtendedData = spsInfo.profileIdc === 100 || spsInfo.profileIdc === 110 || spsInfo.profileIdc === 122 || spsInfo.profileIdc === 144;
      return {
        configurationVersion: 1,
        avcProfileIndication: spsInfo.profileIdc,
        profileCompatibility: spsInfo.constraintFlags,
        avcLevelIndication: spsInfo.levelIdc,
        lengthSizeMinusOne: 3,
        // Typically 4 bytes for length field
        sequenceParameterSets: spsUnits,
        pictureParameterSets: ppsUnits,
        chromaFormat: hasExtendedData ? spsInfo.chromaFormatIdc : null,
        bitDepthLumaMinus8: hasExtendedData ? spsInfo.bitDepthLumaMinus8 : null,
        bitDepthChromaMinus8: hasExtendedData ? spsInfo.bitDepthChromaMinus8 : null,
        sequenceParameterSetExt: hasExtendedData ? spsExtUnits : null
      };
    } catch (error) {
      Logging._error("Error building AVC Decoder Configuration Record:", error);
      return null;
    }
  };
  var serializeAvcDecoderConfigurationRecord = (record) => {
    const bytes2 = [];
    bytes2.push(record.configurationVersion);
    bytes2.push(record.avcProfileIndication);
    bytes2.push(record.profileCompatibility);
    bytes2.push(record.avcLevelIndication);
    bytes2.push(252 | record.lengthSizeMinusOne & 3);
    bytes2.push(224 | record.sequenceParameterSets.length & 31);
    for (const sps of record.sequenceParameterSets) {
      const length = sps.byteLength;
      bytes2.push(length >> 8);
      bytes2.push(length & 255);
      for (let i = 0; i < length; i++) {
        bytes2.push(sps[i]);
      }
    }
    bytes2.push(record.pictureParameterSets.length);
    for (const pps of record.pictureParameterSets) {
      const length = pps.byteLength;
      bytes2.push(length >> 8);
      bytes2.push(length & 255);
      for (let i = 0; i < length; i++) {
        bytes2.push(pps[i]);
      }
    }
    if (record.avcProfileIndication === 100 || record.avcProfileIndication === 110 || record.avcProfileIndication === 122 || record.avcProfileIndication === 144) {
      assert(record.chromaFormat !== null);
      assert(record.bitDepthLumaMinus8 !== null);
      assert(record.bitDepthChromaMinus8 !== null);
      assert(record.sequenceParameterSetExt !== null);
      bytes2.push(252 | record.chromaFormat & 3);
      bytes2.push(248 | record.bitDepthLumaMinus8 & 7);
      bytes2.push(248 | record.bitDepthChromaMinus8 & 7);
      bytes2.push(record.sequenceParameterSetExt.length);
      for (const spsExt of record.sequenceParameterSetExt) {
        const length = spsExt.byteLength;
        bytes2.push(length >> 8);
        bytes2.push(length & 255);
        for (let i = 0; i < length; i++) {
          bytes2.push(spsExt[i]);
        }
      }
    }
    return new Uint8Array(bytes2);
  };
  var AVC_HEVC_ASPECT_RATIO_IDC_TABLE = {
    1: { num: 1, den: 1 },
    2: { num: 12, den: 11 },
    3: { num: 10, den: 11 },
    4: { num: 16, den: 11 },
    5: { num: 40, den: 33 },
    6: { num: 24, den: 11 },
    7: { num: 20, den: 11 },
    8: { num: 32, den: 11 },
    9: { num: 80, den: 33 },
    10: { num: 18, den: 11 },
    11: { num: 15, den: 11 },
    12: { num: 64, den: 33 },
    13: { num: 160, den: 99 },
    14: { num: 4, den: 3 },
    15: { num: 3, den: 2 },
    16: { num: 2, den: 1 }
  };
  var parseAvcSps = (sps) => {
    try {
      const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
      bitstream.skipBits(1);
      bitstream.skipBits(2);
      const nalUnitType = bitstream.readBits(5);
      if (nalUnitType !== 7) {
        return null;
      }
      const profileIdc = bitstream.readAlignedByte();
      const constraintFlags = bitstream.readAlignedByte();
      const levelIdc = bitstream.readAlignedByte();
      readExpGolomb(bitstream);
      let chromaFormatIdc = 1;
      let bitDepthLumaMinus8 = 0;
      let bitDepthChromaMinus8 = 0;
      let separateColourPlaneFlag = 0;
      if (profileIdc === 100 || profileIdc === 110 || profileIdc === 122 || profileIdc === 244 || profileIdc === 44 || profileIdc === 83 || profileIdc === 86 || profileIdc === 118 || profileIdc === 128) {
        chromaFormatIdc = readExpGolomb(bitstream);
        if (chromaFormatIdc === 3) {
          separateColourPlaneFlag = bitstream.readBits(1);
        }
        bitDepthLumaMinus8 = readExpGolomb(bitstream);
        bitDepthChromaMinus8 = readExpGolomb(bitstream);
        bitstream.skipBits(1);
        const seqScalingMatrixPresentFlag = bitstream.readBits(1);
        if (seqScalingMatrixPresentFlag) {
          for (let i = 0; i < (chromaFormatIdc !== 3 ? 8 : 12); i++) {
            const seqScalingListPresentFlag = bitstream.readBits(1);
            if (seqScalingListPresentFlag) {
              const sizeOfScalingList = i < 6 ? 16 : 64;
              let lastScale = 8;
              let nextScale = 8;
              for (let j = 0; j < sizeOfScalingList; j++) {
                if (nextScale !== 0) {
                  const deltaScale = readSignedExpGolomb(bitstream);
                  nextScale = (lastScale + deltaScale + 256) % 256;
                }
                lastScale = nextScale === 0 ? lastScale : nextScale;
              }
            }
          }
        }
      }
      readExpGolomb(bitstream);
      const picOrderCntType = readExpGolomb(bitstream);
      if (picOrderCntType === 0) {
        readExpGolomb(bitstream);
      } else if (picOrderCntType === 1) {
        bitstream.skipBits(1);
        readSignedExpGolomb(bitstream);
        readSignedExpGolomb(bitstream);
        const numRefFramesInPicOrderCntCycle = readExpGolomb(bitstream);
        for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
          readSignedExpGolomb(bitstream);
        }
      }
      readExpGolomb(bitstream);
      bitstream.skipBits(1);
      const picWidthInMbsMinus1 = readExpGolomb(bitstream);
      const picHeightInMapUnitsMinus1 = readExpGolomb(bitstream);
      const codedWidth = 16 * (picWidthInMbsMinus1 + 1);
      const codedHeight = 16 * (picHeightInMapUnitsMinus1 + 1);
      let displayWidth = codedWidth;
      let displayHeight = codedHeight;
      const frameMbsOnlyFlag = bitstream.readBits(1);
      if (!frameMbsOnlyFlag) {
        bitstream.skipBits(1);
      }
      bitstream.skipBits(1);
      const frameCroppingFlag = bitstream.readBits(1);
      if (frameCroppingFlag) {
        const frameCropLeftOffset = readExpGolomb(bitstream);
        const frameCropRightOffset = readExpGolomb(bitstream);
        const frameCropTopOffset = readExpGolomb(bitstream);
        const frameCropBottomOffset = readExpGolomb(bitstream);
        let cropUnitX;
        let cropUnitY;
        const chromaArrayType = separateColourPlaneFlag === 0 ? chromaFormatIdc : 0;
        if (chromaArrayType === 0) {
          cropUnitX = 1;
          cropUnitY = 2 - frameMbsOnlyFlag;
        } else {
          const subWidthC = chromaFormatIdc === 3 ? 1 : 2;
          const subHeightC = chromaFormatIdc === 1 ? 2 : 1;
          cropUnitX = subWidthC;
          cropUnitY = subHeightC * (2 - frameMbsOnlyFlag);
        }
        displayWidth -= cropUnitX * (frameCropLeftOffset + frameCropRightOffset);
        displayHeight -= cropUnitY * (frameCropTopOffset + frameCropBottomOffset);
      }
      let colourPrimaries = 2;
      let transferCharacteristics = 2;
      let matrixCoefficients = 2;
      let fullRangeFlag = 0;
      let pixelAspectRatio = { num: 1, den: 1 };
      let numReorderFrames = null;
      let maxDecFrameBuffering = null;
      const vuiParametersPresentFlag = bitstream.readBits(1);
      if (vuiParametersPresentFlag) {
        const aspectRatioInfoPresentFlag = bitstream.readBits(1);
        if (aspectRatioInfoPresentFlag) {
          const aspectRatioIdc = bitstream.readBits(8);
          if (aspectRatioIdc === 255) {
            pixelAspectRatio = {
              num: bitstream.readBits(16),
              den: bitstream.readBits(16)
            };
          } else {
            const aspectRatio = AVC_HEVC_ASPECT_RATIO_IDC_TABLE[aspectRatioIdc];
            if (aspectRatio) {
              pixelAspectRatio = aspectRatio;
            }
          }
        }
        const overscanInfoPresentFlag = bitstream.readBits(1);
        if (overscanInfoPresentFlag) {
          bitstream.skipBits(1);
        }
        const videoSignalTypePresentFlag = bitstream.readBits(1);
        if (videoSignalTypePresentFlag) {
          bitstream.skipBits(3);
          fullRangeFlag = bitstream.readBits(1);
          const colourDescriptionPresentFlag = bitstream.readBits(1);
          if (colourDescriptionPresentFlag) {
            colourPrimaries = bitstream.readBits(8);
            transferCharacteristics = bitstream.readBits(8);
            matrixCoefficients = bitstream.readBits(8);
          }
        }
        const chromaLocInfoPresentFlag = bitstream.readBits(1);
        if (chromaLocInfoPresentFlag) {
          readExpGolomb(bitstream);
          readExpGolomb(bitstream);
        }
        const timingInfoPresentFlag = bitstream.readBits(1);
        if (timingInfoPresentFlag) {
          bitstream.skipBits(32);
          bitstream.skipBits(32);
          bitstream.skipBits(1);
        }
        const nalHrdParametersPresentFlag = bitstream.readBits(1);
        if (nalHrdParametersPresentFlag) {
          skipAvcHrdParameters(bitstream);
        }
        const vclHrdParametersPresentFlag = bitstream.readBits(1);
        if (vclHrdParametersPresentFlag) {
          skipAvcHrdParameters(bitstream);
        }
        if (nalHrdParametersPresentFlag || vclHrdParametersPresentFlag) {
          bitstream.skipBits(1);
        }
        bitstream.skipBits(1);
        const bitstreamRestrictionFlag = bitstream.readBits(1);
        if (bitstreamRestrictionFlag) {
          bitstream.skipBits(1);
          readExpGolomb(bitstream);
          readExpGolomb(bitstream);
          readExpGolomb(bitstream);
          readExpGolomb(bitstream);
          numReorderFrames = readExpGolomb(bitstream);
          maxDecFrameBuffering = readExpGolomb(bitstream);
        }
      }
      if (numReorderFrames === null) {
        assert(maxDecFrameBuffering === null);
        const constraintSet3Flag = constraintFlags & 16;
        if ((profileIdc === 44 || profileIdc === 86 || profileIdc === 100 || profileIdc === 110 || profileIdc === 122 || profileIdc === 244) && constraintSet3Flag) {
          numReorderFrames = 0;
          maxDecFrameBuffering = 0;
        } else {
          const picWidthInMbs = picWidthInMbsMinus1 + 1;
          const picHeightInMapUnits = picHeightInMapUnitsMinus1 + 1;
          const frameHeightInMbs = (2 - frameMbsOnlyFlag) * picHeightInMapUnits;
          const levelInfo = AVC_LEVEL_TABLE.find((x) => x.level >= levelIdc) ?? last(AVC_LEVEL_TABLE);
          const maxDpbFrames = Math.min(Math.floor(levelInfo.maxDpbMbs / (picWidthInMbs * frameHeightInMbs)), 16);
          numReorderFrames = maxDpbFrames;
          maxDecFrameBuffering = maxDpbFrames;
        }
      }
      assert(maxDecFrameBuffering !== null);
      return {
        profileIdc,
        constraintFlags,
        levelIdc,
        frameMbsOnlyFlag,
        chromaFormatIdc,
        bitDepthLumaMinus8,
        bitDepthChromaMinus8,
        codedWidth,
        codedHeight,
        displayWidth,
        displayHeight,
        pixelAspectRatio,
        colourPrimaries,
        matrixCoefficients,
        transferCharacteristics,
        fullRangeFlag,
        numReorderFrames,
        maxDecFrameBuffering
      };
    } catch (error) {
      Logging._error("Error parsing AVC SPS:", error);
      return null;
    }
  };
  var skipAvcHrdParameters = (bitstream) => {
    const cpb_cnt_minus1 = readExpGolomb(bitstream);
    bitstream.skipBits(4);
    bitstream.skipBits(4);
    for (let i = 0; i <= cpb_cnt_minus1; i++) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      bitstream.skipBits(1);
    }
    bitstream.skipBits(5);
    bitstream.skipBits(5);
    bitstream.skipBits(5);
    bitstream.skipBits(5);
  };
  var iterateHevcNalUnits = (packetData, decoderConfig) => {
    if (decoderConfig.description) {
      const bytes2 = toUint8Array(decoderConfig.description);
      const lengthSizeMinusOne = bytes2[21] & 3;
      const lengthSize = lengthSizeMinusOne + 1;
      return iterateNalUnitsInLengthPrefixed(packetData, lengthSize);
    } else {
      return iterateNalUnitsInAnnexB(packetData);
    }
  };
  var extractNalUnitTypeForHevc = (byte) => {
    return byte >> 1 & 63;
  };
  var parseHevcSps = (sps) => {
    try {
      const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
      bitstream.skipBits(16);
      bitstream.readBits(4);
      const spsMaxSubLayersMinus1 = bitstream.readBits(3);
      const spsTemporalIdNestingFlag = bitstream.readBits(1);
      const { general_profile_space, general_tier_flag, general_profile_idc, general_profile_compatibility_flags, general_constraint_indicator_flags, general_level_idc } = parseProfileTierLevel(bitstream, spsMaxSubLayersMinus1);
      readExpGolomb(bitstream);
      const chromaFormatIdc = readExpGolomb(bitstream);
      let separateColourPlaneFlag = 0;
      if (chromaFormatIdc === 3) {
        separateColourPlaneFlag = bitstream.readBits(1);
      }
      const picWidthInLumaSamples = readExpGolomb(bitstream);
      const picHeightInLumaSamples = readExpGolomb(bitstream);
      let displayWidth = picWidthInLumaSamples;
      let displayHeight = picHeightInLumaSamples;
      if (bitstream.readBits(1)) {
        const confWinLeftOffset = readExpGolomb(bitstream);
        const confWinRightOffset = readExpGolomb(bitstream);
        const confWinTopOffset = readExpGolomb(bitstream);
        const confWinBottomOffset = readExpGolomb(bitstream);
        let subWidthC = 1;
        let subHeightC = 1;
        const chromaArrayType = separateColourPlaneFlag === 0 ? chromaFormatIdc : 0;
        if (chromaArrayType === 1) {
          subWidthC = 2;
          subHeightC = 2;
        } else if (chromaArrayType === 2) {
          subWidthC = 2;
          subHeightC = 1;
        }
        displayWidth -= (confWinLeftOffset + confWinRightOffset) * subWidthC;
        displayHeight -= (confWinTopOffset + confWinBottomOffset) * subHeightC;
      }
      const bitDepthLumaMinus8 = readExpGolomb(bitstream);
      const bitDepthChromaMinus8 = readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      const spsSubLayerOrderingInfoPresentFlag = bitstream.readBits(1);
      const startI = spsSubLayerOrderingInfoPresentFlag ? 0 : spsMaxSubLayersMinus1;
      let spsMaxNumReorderPics = 0;
      for (let i = startI; i <= spsMaxSubLayersMinus1; i++) {
        readExpGolomb(bitstream);
        spsMaxNumReorderPics = readExpGolomb(bitstream);
        readExpGolomb(bitstream);
      }
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      if (bitstream.readBits(1)) {
        if (bitstream.readBits(1)) {
          skipScalingListData(bitstream);
        }
      }
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      if (bitstream.readBits(1)) {
        bitstream.skipBits(4);
        bitstream.skipBits(4);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        bitstream.skipBits(1);
      }
      const numShortTermRefPicSets = readExpGolomb(bitstream);
      skipAllStRefPicSets(bitstream, numShortTermRefPicSets);
      if (bitstream.readBits(1)) {
        const numLongTermRefPicsSps = readExpGolomb(bitstream);
        for (let i = 0; i < numLongTermRefPicsSps; i++) {
          readExpGolomb(bitstream);
          bitstream.skipBits(1);
        }
      }
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      let colourPrimaries = 2;
      let transferCharacteristics = 2;
      let matrixCoefficients = 2;
      let fullRangeFlag = 0;
      let minSpatialSegmentationIdc = 0;
      let pixelAspectRatio = { num: 1, den: 1 };
      if (bitstream.readBits(1)) {
        const vui = parseHevcVui(bitstream, spsMaxSubLayersMinus1);
        pixelAspectRatio = vui.pixelAspectRatio;
        colourPrimaries = vui.colourPrimaries;
        transferCharacteristics = vui.transferCharacteristics;
        matrixCoefficients = vui.matrixCoefficients;
        fullRangeFlag = vui.fullRangeFlag;
        minSpatialSegmentationIdc = vui.minSpatialSegmentationIdc;
      }
      return {
        displayWidth,
        displayHeight,
        pixelAspectRatio,
        colourPrimaries,
        transferCharacteristics,
        matrixCoefficients,
        fullRangeFlag,
        maxDecFrameBuffering: spsMaxNumReorderPics + 1,
        spsMaxSubLayersMinus1,
        spsTemporalIdNestingFlag,
        generalProfileSpace: general_profile_space,
        generalTierFlag: general_tier_flag,
        generalProfileIdc: general_profile_idc,
        generalProfileCompatibilityFlags: general_profile_compatibility_flags,
        generalConstraintIndicatorFlags: general_constraint_indicator_flags,
        generalLevelIdc: general_level_idc,
        chromaFormatIdc,
        bitDepthLumaMinus8,
        bitDepthChromaMinus8,
        minSpatialSegmentationIdc
      };
    } catch (error) {
      Logging._error("Error parsing HEVC SPS:", error);
      return null;
    }
  };
  var extractHevcDecoderConfigurationRecord = (packetData) => {
    try {
      const vpsUnits = [];
      const spsUnits = [];
      const ppsUnits = [];
      const seiUnits = [];
      for (const loc of iterateNalUnitsInAnnexB(packetData)) {
        const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
        const type = extractNalUnitTypeForHevc(nalUnit[0]);
        if (type === HevcNalUnitType.VPS_NUT) {
          vpsUnits.push(nalUnit);
        } else if (type === HevcNalUnitType.SPS_NUT) {
          spsUnits.push(nalUnit);
        } else if (type === HevcNalUnitType.PPS_NUT) {
          ppsUnits.push(nalUnit);
        } else if (type === HevcNalUnitType.PREFIX_SEI_NUT || type === HevcNalUnitType.SUFFIX_SEI_NUT) {
          seiUnits.push(nalUnit);
        }
      }
      if (spsUnits.length === 0 || ppsUnits.length === 0)
        return null;
      const spsInfo = parseHevcSps(spsUnits[0]);
      if (!spsInfo)
        return null;
      let parallelismType = 0;
      if (ppsUnits.length > 0) {
        const pps = ppsUnits[0];
        const ppsBitstream = new Bitstream(removeEmulationPreventionBytes(pps));
        ppsBitstream.skipBits(16);
        readExpGolomb(ppsBitstream);
        readExpGolomb(ppsBitstream);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(3);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(1);
        readExpGolomb(ppsBitstream);
        readExpGolomb(ppsBitstream);
        readSignedExpGolomb(ppsBitstream);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(1);
        if (ppsBitstream.readBits(1)) {
          readExpGolomb(ppsBitstream);
        }
        readSignedExpGolomb(ppsBitstream);
        readSignedExpGolomb(ppsBitstream);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(1);
        ppsBitstream.skipBits(1);
        const tiles_enabled_flag = ppsBitstream.readBits(1);
        const entropy_coding_sync_enabled_flag = ppsBitstream.readBits(1);
        if (!tiles_enabled_flag && !entropy_coding_sync_enabled_flag)
          parallelismType = 0;
        else if (tiles_enabled_flag && !entropy_coding_sync_enabled_flag)
          parallelismType = 2;
        else if (!tiles_enabled_flag && entropy_coding_sync_enabled_flag)
          parallelismType = 3;
        else
          parallelismType = 0;
      }
      const arrays = [
        ...vpsUnits.length ? [
          {
            arrayCompleteness: 1,
            nalUnitType: HevcNalUnitType.VPS_NUT,
            nalUnits: vpsUnits
          }
        ] : [],
        ...spsUnits.length ? [
          {
            arrayCompleteness: 1,
            nalUnitType: HevcNalUnitType.SPS_NUT,
            nalUnits: spsUnits
          }
        ] : [],
        ...ppsUnits.length ? [
          {
            arrayCompleteness: 1,
            nalUnitType: HevcNalUnitType.PPS_NUT,
            nalUnits: ppsUnits
          }
        ] : [],
        ...seiUnits.length ? [
          {
            arrayCompleteness: 1,
            nalUnitType: extractNalUnitTypeForHevc(seiUnits[0][0]),
            nalUnits: seiUnits
          }
        ] : []
      ];
      const record = {
        configurationVersion: 1,
        generalProfileSpace: spsInfo.generalProfileSpace,
        generalTierFlag: spsInfo.generalTierFlag,
        generalProfileIdc: spsInfo.generalProfileIdc,
        generalProfileCompatibilityFlags: spsInfo.generalProfileCompatibilityFlags,
        generalConstraintIndicatorFlags: spsInfo.generalConstraintIndicatorFlags,
        generalLevelIdc: spsInfo.generalLevelIdc,
        minSpatialSegmentationIdc: spsInfo.minSpatialSegmentationIdc,
        parallelismType,
        chromaFormatIdc: spsInfo.chromaFormatIdc,
        bitDepthLumaMinus8: spsInfo.bitDepthLumaMinus8,
        bitDepthChromaMinus8: spsInfo.bitDepthChromaMinus8,
        avgFrameRate: 0,
        constantFrameRate: 0,
        numTemporalLayers: spsInfo.spsMaxSubLayersMinus1 + 1,
        temporalIdNested: spsInfo.spsTemporalIdNestingFlag,
        lengthSizeMinusOne: 3,
        arrays
      };
      return record;
    } catch (error) {
      Logging._error("Error building HEVC Decoder Configuration Record:", error);
      return null;
    }
  };
  var parseProfileTierLevel = (bitstream, maxNumSubLayersMinus1) => {
    const general_profile_space = bitstream.readBits(2);
    const general_tier_flag = bitstream.readBits(1);
    const general_profile_idc = bitstream.readBits(5);
    let general_profile_compatibility_flags = 0;
    for (let i = 0; i < 32; i++) {
      general_profile_compatibility_flags = general_profile_compatibility_flags << 1 | bitstream.readBits(1);
    }
    const general_constraint_indicator_flags = new Uint8Array(6);
    for (let i = 0; i < 6; i++) {
      general_constraint_indicator_flags[i] = bitstream.readBits(8);
    }
    const general_level_idc = bitstream.readBits(8);
    const sub_layer_profile_present_flag = [];
    const sub_layer_level_present_flag = [];
    for (let i = 0; i < maxNumSubLayersMinus1; i++) {
      sub_layer_profile_present_flag.push(bitstream.readBits(1));
      sub_layer_level_present_flag.push(bitstream.readBits(1));
    }
    if (maxNumSubLayersMinus1 > 0) {
      for (let i = maxNumSubLayersMinus1; i < 8; i++) {
        bitstream.skipBits(2);
      }
    }
    for (let i = 0; i < maxNumSubLayersMinus1; i++) {
      if (sub_layer_profile_present_flag[i])
        bitstream.skipBits(88);
      if (sub_layer_level_present_flag[i])
        bitstream.skipBits(8);
    }
    return {
      general_profile_space,
      general_tier_flag,
      general_profile_idc,
      general_profile_compatibility_flags,
      general_constraint_indicator_flags,
      general_level_idc
    };
  };
  var skipScalingListData = (bitstream) => {
    for (let sizeId = 0; sizeId < 4; sizeId++) {
      for (let matrixId = 0; matrixId < (sizeId === 3 ? 2 : 6); matrixId++) {
        const scaling_list_pred_mode_flag = bitstream.readBits(1);
        if (!scaling_list_pred_mode_flag) {
          readExpGolomb(bitstream);
        } else {
          const coefNum = Math.min(64, 1 << 4 + (sizeId << 1));
          if (sizeId > 1) {
            readSignedExpGolomb(bitstream);
          }
          for (let i = 0; i < coefNum; i++) {
            readSignedExpGolomb(bitstream);
          }
        }
      }
    }
  };
  var skipAllStRefPicSets = (bitstream, num_short_term_ref_pic_sets) => {
    const NumDeltaPocs = [];
    for (let stRpsIdx = 0; stRpsIdx < num_short_term_ref_pic_sets; stRpsIdx++) {
      NumDeltaPocs[stRpsIdx] = skipStRefPicSet(bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs);
    }
  };
  var skipStRefPicSet = (bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs) => {
    let NumDeltaPocsThis = 0;
    let inter_ref_pic_set_prediction_flag = 0;
    let RefRpsIdx = 0;
    if (stRpsIdx !== 0) {
      inter_ref_pic_set_prediction_flag = bitstream.readBits(1);
    }
    if (inter_ref_pic_set_prediction_flag) {
      if (stRpsIdx === num_short_term_ref_pic_sets) {
        const delta_idx_minus1 = readExpGolomb(bitstream);
        RefRpsIdx = stRpsIdx - (delta_idx_minus1 + 1);
      } else {
        RefRpsIdx = stRpsIdx - 1;
      }
      bitstream.readBits(1);
      readExpGolomb(bitstream);
      const numDelta = NumDeltaPocs[RefRpsIdx] ?? 0;
      for (let j = 0; j <= numDelta; j++) {
        const used_by_curr_pic_flag = bitstream.readBits(1);
        if (!used_by_curr_pic_flag) {
          bitstream.readBits(1);
        }
      }
      NumDeltaPocsThis = NumDeltaPocs[RefRpsIdx];
    } else {
      const num_negative_pics = readExpGolomb(bitstream);
      const num_positive_pics = readExpGolomb(bitstream);
      for (let i = 0; i < num_negative_pics; i++) {
        readExpGolomb(bitstream);
        bitstream.readBits(1);
      }
      for (let i = 0; i < num_positive_pics; i++) {
        readExpGolomb(bitstream);
        bitstream.readBits(1);
      }
      NumDeltaPocsThis = num_negative_pics + num_positive_pics;
    }
    return NumDeltaPocsThis;
  };
  var parseHevcVui = (bitstream, sps_max_sub_layers_minus1) => {
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    let fullRangeFlag = 0;
    let minSpatialSegmentationIdc = 0;
    let pixelAspectRatio = { num: 1, den: 1 };
    if (bitstream.readBits(1)) {
      const aspect_ratio_idc = bitstream.readBits(8);
      if (aspect_ratio_idc === 255) {
        pixelAspectRatio = {
          num: bitstream.readBits(16),
          den: bitstream.readBits(16)
        };
      } else {
        const aspectRatio = AVC_HEVC_ASPECT_RATIO_IDC_TABLE[aspect_ratio_idc];
        if (aspectRatio) {
          pixelAspectRatio = aspectRatio;
        }
      }
    }
    if (bitstream.readBits(1)) {
      bitstream.readBits(1);
    }
    if (bitstream.readBits(1)) {
      bitstream.readBits(3);
      fullRangeFlag = bitstream.readBits(1);
      if (bitstream.readBits(1)) {
        colourPrimaries = bitstream.readBits(8);
        transferCharacteristics = bitstream.readBits(8);
        matrixCoefficients = bitstream.readBits(8);
      }
    }
    if (bitstream.readBits(1)) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    bitstream.readBits(1);
    bitstream.readBits(1);
    bitstream.readBits(1);
    if (bitstream.readBits(1)) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    if (bitstream.readBits(1)) {
      bitstream.readBits(32);
      bitstream.readBits(32);
      if (bitstream.readBits(1)) {
        readExpGolomb(bitstream);
      }
      if (bitstream.readBits(1)) {
        skipHevcHrdParameters(bitstream, true, sps_max_sub_layers_minus1);
      }
    }
    if (bitstream.readBits(1)) {
      bitstream.readBits(1);
      bitstream.readBits(1);
      bitstream.readBits(1);
      minSpatialSegmentationIdc = readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    return {
      pixelAspectRatio,
      colourPrimaries,
      transferCharacteristics,
      matrixCoefficients,
      fullRangeFlag,
      minSpatialSegmentationIdc
    };
  };
  var skipHevcHrdParameters = (bitstream, commonInfPresentFlag, maxNumSubLayersMinus1) => {
    let nal_hrd_parameters_present_flag = false;
    let vcl_hrd_parameters_present_flag = false;
    let sub_pic_hrd_params_present_flag = false;
    if (commonInfPresentFlag) {
      nal_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
      vcl_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
      if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
        sub_pic_hrd_params_present_flag = bitstream.readBits(1) === 1;
        if (sub_pic_hrd_params_present_flag) {
          bitstream.readBits(8);
          bitstream.readBits(5);
          bitstream.readBits(1);
          bitstream.readBits(5);
        }
        bitstream.readBits(4);
        bitstream.readBits(4);
        if (sub_pic_hrd_params_present_flag) {
          bitstream.readBits(4);
        }
        bitstream.readBits(5);
        bitstream.readBits(5);
        bitstream.readBits(5);
      }
    }
    for (let i = 0; i <= maxNumSubLayersMinus1; i++) {
      const fixed_pic_rate_general_flag = bitstream.readBits(1) === 1;
      let fixed_pic_rate_within_cvs_flag = true;
      if (!fixed_pic_rate_general_flag) {
        fixed_pic_rate_within_cvs_flag = bitstream.readBits(1) === 1;
      }
      let low_delay_hrd_flag = false;
      if (fixed_pic_rate_within_cvs_flag) {
        readExpGolomb(bitstream);
      } else {
        low_delay_hrd_flag = bitstream.readBits(1) === 1;
      }
      let CpbCnt = 1;
      if (!low_delay_hrd_flag) {
        const cpb_cnt_minus1 = readExpGolomb(bitstream);
        CpbCnt = cpb_cnt_minus1 + 1;
      }
      if (nal_hrd_parameters_present_flag) {
        skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
      }
      if (vcl_hrd_parameters_present_flag) {
        skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
      }
    }
  };
  var skipSubLayerHrdParameters = (bitstream, CpbCnt, sub_pic_hrd_params_present_flag) => {
    for (let i = 0; i < CpbCnt; i++) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      if (sub_pic_hrd_params_present_flag) {
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
      }
      bitstream.readBits(1);
    }
  };
  var serializeHevcDecoderConfigurationRecord = (record) => {
    const bytes2 = [];
    bytes2.push(record.configurationVersion);
    bytes2.push((record.generalProfileSpace & 3) << 6 | (record.generalTierFlag & 1) << 5 | record.generalProfileIdc & 31);
    bytes2.push(record.generalProfileCompatibilityFlags >>> 24 & 255);
    bytes2.push(record.generalProfileCompatibilityFlags >>> 16 & 255);
    bytes2.push(record.generalProfileCompatibilityFlags >>> 8 & 255);
    bytes2.push(record.generalProfileCompatibilityFlags & 255);
    bytes2.push(...record.generalConstraintIndicatorFlags);
    bytes2.push(record.generalLevelIdc & 255);
    bytes2.push(240 | record.minSpatialSegmentationIdc >> 8 & 15);
    bytes2.push(record.minSpatialSegmentationIdc & 255);
    bytes2.push(252 | record.parallelismType & 3);
    bytes2.push(252 | record.chromaFormatIdc & 3);
    bytes2.push(248 | record.bitDepthLumaMinus8 & 7);
    bytes2.push(248 | record.bitDepthChromaMinus8 & 7);
    bytes2.push(record.avgFrameRate >> 8 & 255);
    bytes2.push(record.avgFrameRate & 255);
    bytes2.push((record.constantFrameRate & 3) << 6 | (record.numTemporalLayers & 7) << 3 | (record.temporalIdNested & 1) << 2 | record.lengthSizeMinusOne & 3);
    bytes2.push(record.arrays.length & 255);
    for (const arr of record.arrays) {
      bytes2.push((arr.arrayCompleteness & 1) << 7 | 0 << 6 | arr.nalUnitType & 63);
      bytes2.push(arr.nalUnits.length >> 8 & 255);
      bytes2.push(arr.nalUnits.length & 255);
      for (const nal of arr.nalUnits) {
        bytes2.push(nal.length >> 8 & 255);
        bytes2.push(nal.length & 255);
        for (let i = 0; i < nal.length; i++) {
          bytes2.push(nal[i]);
        }
      }
    }
    return new Uint8Array(bytes2);
  };
  var HevcNaluOrderState;
  (function(HevcNaluOrderState2) {
    HevcNaluOrderState2[HevcNaluOrderState2["audAllowed"] = 0] = "audAllowed";
    HevcNaluOrderState2[HevcNaluOrderState2["beforeFirstVcl"] = 1] = "beforeFirstVcl";
    HevcNaluOrderState2[HevcNaluOrderState2["afterFirstVcl"] = 2] = "afterFirstVcl";
    HevcNaluOrderState2[HevcNaluOrderState2["eoBitstreamAllowed"] = 3] = "eoBitstreamAllowed";
    HevcNaluOrderState2[HevcNaluOrderState2["noMoreDataAllowed"] = 4] = "noMoreDataAllowed";
  })(HevcNaluOrderState || (HevcNaluOrderState = {}));
  var extractVp9CodecInfoFromPacket = (packet) => {
    const bitstream = new Bitstream(packet);
    const frameMarker = bitstream.readBits(2);
    if (frameMarker !== 2) {
      return null;
    }
    const profileLowBit = bitstream.readBits(1);
    const profileHighBit = bitstream.readBits(1);
    const profile = (profileHighBit << 1) + profileLowBit;
    if (profile === 3) {
      bitstream.skipBits(1);
    }
    const showExistingFrame = bitstream.readBits(1);
    if (showExistingFrame === 1) {
      return null;
    }
    const frameType = bitstream.readBits(1);
    if (frameType !== 0) {
      return null;
    }
    bitstream.skipBits(2);
    const syncCode = bitstream.readBits(24);
    if (syncCode !== 4817730) {
      return null;
    }
    let bitDepth = 8;
    if (profile >= 2) {
      const tenOrTwelveBit = bitstream.readBits(1);
      bitDepth = tenOrTwelveBit ? 12 : 10;
    }
    const colorSpace = bitstream.readBits(3);
    let chromaSubsampling = 0;
    let videoFullRangeFlag = 0;
    if (colorSpace !== 7) {
      const colorRange = bitstream.readBits(1);
      videoFullRangeFlag = colorRange;
      if (profile === 1 || profile === 3) {
        const subsamplingX = bitstream.readBits(1);
        const subsamplingY = bitstream.readBits(1);
        chromaSubsampling = !subsamplingX && !subsamplingY ? 3 : subsamplingX && !subsamplingY ? 2 : 1;
        bitstream.skipBits(1);
      } else {
        chromaSubsampling = 1;
      }
    } else {
      chromaSubsampling = 3;
      videoFullRangeFlag = 1;
    }
    const widthMinusOne = bitstream.readBits(16);
    const heightMinusOne = bitstream.readBits(16);
    const width = widthMinusOne + 1;
    const height = heightMinusOne + 1;
    const pictureSize = width * height;
    let level = last(VP9_LEVEL_TABLE).level;
    for (const entry of VP9_LEVEL_TABLE) {
      if (pictureSize <= entry.maxPictureSize) {
        level = entry.level;
        break;
      }
    }
    const matrixCoefficients = colorSpace === 7 ? 0 : colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
    const colourPrimaries = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
    const transferCharacteristics = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
    return {
      profile,
      level,
      bitDepth,
      chromaSubsampling,
      videoFullRangeFlag,
      colourPrimaries,
      transferCharacteristics,
      matrixCoefficients
    };
  };
  var iterateAv1PacketObus = function* (packet) {
    const bitstream = new Bitstream(packet);
    const readLeb128 = () => {
      let value = 0;
      for (let i = 0; i < 8; i++) {
        const byte = bitstream.readAlignedByte();
        value |= (byte & 127) << i * 7;
        if (!(byte & 128)) {
          break;
        }
        if (i === 7 && byte & 128) {
          return null;
        }
      }
      if (value >= 2 ** 32 - 1) {
        return null;
      }
      return value;
    };
    while (bitstream.getBitsLeft() >= 8) {
      bitstream.skipBits(1);
      const obuType = bitstream.readBits(4);
      const obuExtension = bitstream.readBits(1);
      const obuHasSizeField = bitstream.readBits(1);
      bitstream.skipBits(1);
      if (obuExtension) {
        bitstream.skipBits(8);
      }
      let obuSize;
      if (obuHasSizeField) {
        const obuSizeValue = readLeb128();
        if (obuSizeValue === null)
          return;
        obuSize = obuSizeValue;
      } else {
        obuSize = Math.floor(bitstream.getBitsLeft() / 8);
      }
      assert(bitstream.pos % 8 === 0);
      yield {
        type: obuType,
        data: packet.subarray(bitstream.pos / 8, bitstream.pos / 8 + obuSize)
      };
      bitstream.skipBits(obuSize * 8);
    }
  };
  var extractAv1CodecInfoFromPacket = (packet) => {
    for (const { type, data } of iterateAv1PacketObus(packet)) {
      if (type !== 1) {
        continue;
      }
      const bitstream = new Bitstream(data);
      const seqProfile = bitstream.readBits(3);
      const stillPicture = bitstream.readBits(1);
      const reducedStillPictureHeader = bitstream.readBits(1);
      let seqLevel = 0;
      let seqTier = 0;
      let bufferDelayLengthMinus1 = 0;
      if (reducedStillPictureHeader) {
        seqLevel = bitstream.readBits(5);
      } else {
        const timingInfoPresentFlag = bitstream.readBits(1);
        if (timingInfoPresentFlag) {
          bitstream.skipBits(32);
          bitstream.skipBits(32);
          const equalPictureInterval = bitstream.readBits(1);
          if (equalPictureInterval) {
            return null;
          }
        }
        const decoderModelInfoPresentFlag = bitstream.readBits(1);
        if (decoderModelInfoPresentFlag) {
          bufferDelayLengthMinus1 = bitstream.readBits(5);
          bitstream.skipBits(32);
          bitstream.skipBits(5);
          bitstream.skipBits(5);
        }
        const operatingPointsCntMinus1 = bitstream.readBits(5);
        for (let i = 0; i <= operatingPointsCntMinus1; i++) {
          bitstream.skipBits(12);
          const seqLevelIdx = bitstream.readBits(5);
          if (i === 0) {
            seqLevel = seqLevelIdx;
          }
          if (seqLevelIdx > 7) {
            const seqTierTemp = bitstream.readBits(1);
            if (i === 0) {
              seqTier = seqTierTemp;
            }
          }
          if (decoderModelInfoPresentFlag) {
            const decoderModelPresentForThisOp = bitstream.readBits(1);
            if (decoderModelPresentForThisOp) {
              const n = bufferDelayLengthMinus1 + 1;
              bitstream.skipBits(n);
              bitstream.skipBits(n);
              bitstream.skipBits(1);
            }
          }
          const initialDisplayDelayPresentFlag = bitstream.readBits(1);
          if (initialDisplayDelayPresentFlag) {
            bitstream.skipBits(4);
          }
        }
      }
      const frameWidthBitsMinus1 = bitstream.readBits(4);
      const frameHeightBitsMinus1 = bitstream.readBits(4);
      const n1 = frameWidthBitsMinus1 + 1;
      bitstream.skipBits(n1);
      const n2 = frameHeightBitsMinus1 + 1;
      bitstream.skipBits(n2);
      let frameIdNumbersPresentFlag = 0;
      if (reducedStillPictureHeader) {
        frameIdNumbersPresentFlag = 0;
      } else {
        frameIdNumbersPresentFlag = bitstream.readBits(1);
      }
      if (frameIdNumbersPresentFlag) {
        bitstream.skipBits(4);
        bitstream.skipBits(3);
      }
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      if (!reducedStillPictureHeader) {
        bitstream.skipBits(1);
        bitstream.skipBits(1);
        bitstream.skipBits(1);
        bitstream.skipBits(1);
        const enableOrderHint = bitstream.readBits(1);
        if (enableOrderHint) {
          bitstream.skipBits(1);
          bitstream.skipBits(1);
        }
        const seqChooseScreenContentTools = bitstream.readBits(1);
        let seqForceScreenContentTools = 0;
        if (seqChooseScreenContentTools) {
          seqForceScreenContentTools = 2;
        } else {
          seqForceScreenContentTools = bitstream.readBits(1);
        }
        if (seqForceScreenContentTools > 0) {
          const seqChooseIntegerMv = bitstream.readBits(1);
          if (!seqChooseIntegerMv) {
            bitstream.skipBits(1);
          }
        }
        if (enableOrderHint) {
          bitstream.skipBits(3);
        }
      }
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      const highBitdepth = bitstream.readBits(1);
      let bitDepth = 8;
      if (seqProfile === 2 && highBitdepth) {
        const twelveBit = bitstream.readBits(1);
        bitDepth = twelveBit ? 12 : 10;
      } else if (seqProfile <= 2) {
        bitDepth = highBitdepth ? 10 : 8;
      }
      let monochrome = 0;
      if (seqProfile !== 1) {
        monochrome = bitstream.readBits(1);
      }
      let chromaSubsamplingX = 1;
      let chromaSubsamplingY = 1;
      let chromaSamplePosition = 0;
      if (!monochrome) {
        if (seqProfile === 0) {
          chromaSubsamplingX = 1;
          chromaSubsamplingY = 1;
        } else if (seqProfile === 1) {
          chromaSubsamplingX = 0;
          chromaSubsamplingY = 0;
        } else {
          if (bitDepth === 12) {
            chromaSubsamplingX = bitstream.readBits(1);
            if (chromaSubsamplingX) {
              chromaSubsamplingY = bitstream.readBits(1);
            }
          }
        }
        if (chromaSubsamplingX && chromaSubsamplingY) {
          chromaSamplePosition = bitstream.readBits(2);
        }
      }
      return {
        profile: seqProfile,
        level: seqLevel,
        tier: seqTier,
        bitDepth,
        monochrome,
        chromaSubsamplingX,
        chromaSubsamplingY,
        chromaSamplePosition
      };
    }
    return null;
  };
  var parseOpusIdentificationHeader = (bytes2) => {
    const view2 = toDataView(bytes2);
    const outputChannelCount = view2.getUint8(9);
    const preSkip = view2.getUint16(10, true);
    const inputSampleRate = view2.getUint32(12, true);
    const outputGain = view2.getInt16(16, true);
    const channelMappingFamily = view2.getUint8(18);
    let channelMappingTable = null;
    if (channelMappingFamily) {
      channelMappingTable = bytes2.subarray(19, 19 + 2 + outputChannelCount);
    }
    return {
      outputChannelCount,
      preSkip,
      inputSampleRate,
      outputGain,
      channelMappingFamily,
      channelMappingTable
    };
  };
  var determineVideoPacketType = (codec, decoderConfig, packetData) => {
    switch (codec) {
      case "avc":
        {
          for (const loc of iterateAvcNalUnits(packetData, decoderConfig)) {
            const nalTypeByte = packetData[loc.offset];
            const type = extractNalUnitTypeForAvc(nalTypeByte);
            if (type >= AvcNalUnitType.NON_IDR_SLICE && type <= AvcNalUnitType.SLICE_DPC) {
              return "delta";
            }
            if (type === AvcNalUnitType.IDR) {
              return "key";
            }
            if (type === AvcNalUnitType.SEI && (!isChromium() || getChromiumVersion() >= 144)) {
              const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
              const bytes2 = removeEmulationPreventionBytes(nalUnit);
              let pos = 1;
              do {
                let payloadType = 0;
                while (true) {
                  const nextByte = bytes2[pos++];
                  if (nextByte === void 0)
                    break;
                  payloadType += nextByte;
                  if (nextByte < 255) {
                    break;
                  }
                }
                let payloadSize = 0;
                while (true) {
                  const nextByte = bytes2[pos++];
                  if (nextByte === void 0)
                    break;
                  payloadSize += nextByte;
                  if (nextByte < 255) {
                    break;
                  }
                }
                const PAYLOAD_TYPE_RECOVERY_POINT = 6;
                if (payloadType === PAYLOAD_TYPE_RECOVERY_POINT) {
                  const bitstream = new Bitstream(bytes2);
                  bitstream.pos = 8 * pos;
                  const recoveryFrameCount = readExpGolomb(bitstream);
                  const exactMatchFlag = bitstream.readBits(1);
                  if (recoveryFrameCount === 0 && exactMatchFlag === 1) {
                    return "key";
                  }
                }
                pos += payloadSize;
              } while (pos < bytes2.length - 1);
            }
          }
          return "delta";
        }
        ;
      case "hevc":
        {
          for (const loc of iterateHevcNalUnits(packetData, decoderConfig)) {
            const type = extractNalUnitTypeForHevc(packetData[loc.offset]);
            if (type < HevcNalUnitType.BLA_W_LP) {
              return "delta";
            }
            if (type <= HevcNalUnitType.RSV_IRAP_VCL23) {
              return "key";
            }
          }
          return "delta";
        }
        ;
      case "vp8":
        {
          const frameType = packetData[0] & 1;
          return frameType === 0 ? "key" : "delta";
        }
        ;
      case "vp9":
        {
          const bitstream = new Bitstream(packetData);
          if (bitstream.readBits(2) !== 2) {
            return null;
          }
          ;
          const profileLowBit = bitstream.readBits(1);
          const profileHighBit = bitstream.readBits(1);
          const profile = (profileHighBit << 1) + profileLowBit;
          if (profile === 3) {
            bitstream.skipBits(1);
          }
          const showExistingFrame = bitstream.readBits(1);
          if (showExistingFrame) {
            return null;
          }
          const frameType = bitstream.readBits(1);
          return frameType === 0 ? "key" : "delta";
        }
        ;
      case "av1":
        {
          let reducedStillPictureHeader = false;
          for (const { type, data } of iterateAv1PacketObus(packetData)) {
            if (type === 1) {
              const bitstream = new Bitstream(data);
              bitstream.skipBits(4);
              reducedStillPictureHeader = !!bitstream.readBits(1);
            } else if (type === 3 || type === 6 || type === 7) {
              if (reducedStillPictureHeader) {
                return "key";
              }
              const bitstream = new Bitstream(data);
              const showExistingFrame = bitstream.readBits(1);
              if (showExistingFrame) {
                return null;
              }
              const frameType = bitstream.readBits(2);
              return frameType === 0 ? "key" : "delta";
            }
          }
          return null;
        }
        ;
      case "prores":
        {
          return "key";
        }
        ;
      default:
        {
          assertNever(codec);
          assert(false);
        }
        ;
    }
  };
  var FlacBlockType;
  (function(FlacBlockType2) {
    FlacBlockType2[FlacBlockType2["STREAMINFO"] = 0] = "STREAMINFO";
    FlacBlockType2[FlacBlockType2["VORBIS_COMMENT"] = 4] = "VORBIS_COMMENT";
    FlacBlockType2[FlacBlockType2["PICTURE"] = 6] = "PICTURE";
  })(FlacBlockType || (FlacBlockType = {}));
  var AC3_ACMOD_CHANNEL_COUNTS = [2, 1, 2, 3, 3, 4, 4, 5];
  var parseAc3SyncFrame = (data) => {
    if (data.length < 7) {
      return null;
    }
    if (data[0] !== 11 || data[1] !== 119) {
      return null;
    }
    const bitstream = new Bitstream(data);
    bitstream.skipBits(16);
    bitstream.skipBits(16);
    const fscod = bitstream.readBits(2);
    if (fscod === 3) {
      return null;
    }
    const frmsizecod = bitstream.readBits(6);
    const bsid = bitstream.readBits(5);
    if (bsid > 8) {
      return null;
    }
    const bsmod = bitstream.readBits(3);
    const acmod = bitstream.readBits(3);
    if ((acmod & 1) !== 0 && acmod !== 1) {
      bitstream.skipBits(2);
    }
    if ((acmod & 4) !== 0) {
      bitstream.skipBits(2);
    }
    if (acmod === 2) {
      bitstream.skipBits(2);
    }
    const lfeon = bitstream.readBits(1);
    const bitRateCode = Math.floor(frmsizecod / 2);
    return { fscod, bsid, bsmod, acmod, lfeon, bitRateCode };
  };
  var AC3_FRAME_SIZES = [
    // frmsizecod, [48kHz, 44.1kHz, 32kHz] in bytes
    64 * 2,
    69 * 2,
    96 * 2,
    64 * 2,
    70 * 2,
    96 * 2,
    80 * 2,
    87 * 2,
    120 * 2,
    80 * 2,
    88 * 2,
    120 * 2,
    96 * 2,
    104 * 2,
    144 * 2,
    96 * 2,
    105 * 2,
    144 * 2,
    112 * 2,
    121 * 2,
    168 * 2,
    112 * 2,
    122 * 2,
    168 * 2,
    128 * 2,
    139 * 2,
    192 * 2,
    128 * 2,
    140 * 2,
    192 * 2,
    160 * 2,
    174 * 2,
    240 * 2,
    160 * 2,
    175 * 2,
    240 * 2,
    192 * 2,
    208 * 2,
    288 * 2,
    192 * 2,
    209 * 2,
    288 * 2,
    224 * 2,
    243 * 2,
    336 * 2,
    224 * 2,
    244 * 2,
    336 * 2,
    256 * 2,
    278 * 2,
    384 * 2,
    256 * 2,
    279 * 2,
    384 * 2,
    320 * 2,
    348 * 2,
    480 * 2,
    320 * 2,
    349 * 2,
    480 * 2,
    384 * 2,
    417 * 2,
    576 * 2,
    384 * 2,
    418 * 2,
    576 * 2,
    448 * 2,
    487 * 2,
    672 * 2,
    448 * 2,
    488 * 2,
    672 * 2,
    512 * 2,
    557 * 2,
    768 * 2,
    512 * 2,
    558 * 2,
    768 * 2,
    640 * 2,
    696 * 2,
    960 * 2,
    640 * 2,
    697 * 2,
    960 * 2,
    768 * 2,
    835 * 2,
    1152 * 2,
    768 * 2,
    836 * 2,
    1152 * 2,
    896 * 2,
    975 * 2,
    1344 * 2,
    896 * 2,
    976 * 2,
    1344 * 2,
    1024 * 2,
    1114 * 2,
    1536 * 2,
    1024 * 2,
    1115 * 2,
    1536 * 2,
    1152 * 2,
    1253 * 2,
    1728 * 2,
    1152 * 2,
    1254 * 2,
    1728 * 2,
    1280 * 2,
    1393 * 2,
    1920 * 2,
    1280 * 2,
    1394 * 2,
    1920 * 2
  ];
  var AC3_SAMPLES_PER_FRAME = 1536;
  var AC3_REGISTRATION_DESCRIPTOR = new Uint8Array([5, 4, 65, 67, 45, 51]);
  var EAC3_REGISTRATION_DESCRIPTOR = new Uint8Array([5, 4, 69, 65, 67, 51]);
  var EAC3_NUMBLKS_TABLE = [1, 2, 3, 6];
  var parseEac3SyncFrame = (data) => {
    if (data.length < 6) {
      return null;
    }
    if (data[0] !== 11 || data[1] !== 119) {
      return null;
    }
    const bitstream = new Bitstream(data);
    bitstream.skipBits(16);
    const strmtyp = bitstream.readBits(2);
    bitstream.skipBits(3);
    if (strmtyp !== 0 && strmtyp !== 2) {
      return null;
    }
    const frmsiz = bitstream.readBits(11);
    const fscod = bitstream.readBits(2);
    let fscod2 = 0;
    let numblkscod;
    if (fscod === 3) {
      fscod2 = bitstream.readBits(2);
      numblkscod = 3;
    } else {
      numblkscod = bitstream.readBits(2);
    }
    const acmod = bitstream.readBits(3);
    const lfeon = bitstream.readBits(1);
    const bsid = bitstream.readBits(5);
    if (bsid < 11 || bsid > 16) {
      return null;
    }
    const numblks = EAC3_NUMBLKS_TABLE[numblkscod];
    let fs;
    if (fscod < 3) {
      fs = AC3_SAMPLE_RATES[fscod] / 1e3;
    } else {
      fs = EAC3_REDUCED_SAMPLE_RATES[fscod2] / 1e3;
    }
    const dataRate = Math.round((frmsiz + 1) * fs / (numblks * 16));
    const bsmod = 0;
    const numDepSub = 0;
    const chanLoc = 0;
    const substream = {
      fscod,
      fscod2,
      bsid,
      bsmod,
      acmod,
      lfeon,
      numDepSub,
      chanLoc
    };
    return {
      dataRate,
      substreams: [substream]
    };
  };
  var parseEac3Config = (data) => {
    if (data.length < 2) {
      return null;
    }
    const bitstream = new Bitstream(data);
    const dataRate = bitstream.readBits(13);
    const numIndSub = bitstream.readBits(3);
    const substreams = [];
    for (let i = 0; i <= numIndSub; i++) {
      if (Math.ceil(bitstream.pos / 8) + 3 > data.length) {
        break;
      }
      const fscod = bitstream.readBits(2);
      const bsid = bitstream.readBits(5);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      const bsmod = bitstream.readBits(3);
      const acmod = bitstream.readBits(3);
      const lfeon = bitstream.readBits(1);
      bitstream.skipBits(3);
      const numDepSub = bitstream.readBits(4);
      let chanLoc = 0;
      if (numDepSub > 0) {
        chanLoc = bitstream.readBits(9);
      } else {
        bitstream.skipBits(1);
      }
      substreams.push({
        fscod,
        fscod2: null,
        bsid,
        bsmod,
        acmod,
        lfeon,
        numDepSub,
        chanLoc
      });
    }
    if (substreams.length === 0) {
      return null;
    }
    return { dataRate, substreams };
  };
  var getEac3SampleRate = (config) => {
    const sub = config.substreams[0];
    assert(sub);
    if (sub.fscod < 3) {
      return AC3_SAMPLE_RATES[sub.fscod];
    } else if (sub.fscod2 !== null && sub.fscod2 < 3) {
      return EAC3_REDUCED_SAMPLE_RATES[sub.fscod2];
    }
    return null;
  };
  var getEac3ChannelCount = (config) => {
    const sub = config.substreams[0];
    assert(sub);
    let channels = AC3_ACMOD_CHANNEL_COUNTS[sub.acmod] + sub.lfeon;
    if (sub.numDepSub > 0) {
      const CHAN_LOC_COUNTS = [2, 2, 1, 1, 2, 2, 2, 1, 1];
      for (let bit = 0; bit < 9; bit++) {
        if (sub.chanLoc & 1 << 8 - bit) {
          channels += CHAN_LOC_COUNTS[bit];
        }
      }
    }
    return channels;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/demuxer.js
  var Demuxer = class {
    constructor(input) {
      this.input = input;
    }
    dispose() {
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/packet.js
  var PLACEHOLDER_DATA = /* @__PURE__ */ new Uint8Array(0);
  var EncodedPacket = class _EncodedPacket {
    /** Creates a new {@link EncodedPacket} from raw bytes and timing information. */
    constructor(data, type, timestamp, duration, sequenceNumber = -1, byteLength, sideData) {
      this.data = data;
      this.type = type;
      this.timestamp = timestamp;
      this.duration = duration;
      this.sequenceNumber = sequenceNumber;
      if (data === PLACEHOLDER_DATA && byteLength === void 0) {
        throw new Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
      }
      if (byteLength === void 0) {
        byteLength = data.byteLength;
      }
      if (!(data instanceof Uint8Array)) {
        throw new TypeError("data must be a Uint8Array.");
      }
      if (type !== "key" && type !== "delta") {
        throw new TypeError('type must be either "key" or "delta".');
      }
      if (!Number.isFinite(timestamp)) {
        throw new TypeError("timestamp must be a number.");
      }
      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("duration must be a non-negative number.");
      }
      if (!Number.isFinite(sequenceNumber)) {
        throw new TypeError("sequenceNumber must be a number.");
      }
      if (!Number.isInteger(byteLength) || byteLength < 0) {
        throw new TypeError("byteLength must be a non-negative integer.");
      }
      if (sideData !== void 0 && (typeof sideData !== "object" || !sideData)) {
        throw new TypeError("sideData, when provided, must be an object.");
      }
      if (sideData?.alpha !== void 0 && !(sideData.alpha instanceof Uint8Array)) {
        throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");
      }
      if (sideData?.alphaByteLength !== void 0 && (!Number.isInteger(sideData.alphaByteLength) || sideData.alphaByteLength < 0)) {
        throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
      }
      this.byteLength = byteLength;
      this.sideData = sideData ?? {};
      if (this.sideData.alpha && this.sideData.alphaByteLength === void 0) {
        this.sideData.alphaByteLength = this.sideData.alpha.byteLength;
      }
    }
    /**
     * If this packet is a metadata-only packet. Metadata-only packets don't contain their packet data. They are the
     * result of retrieving packets with {@link PacketRetrievalOptions.metadataOnly} set to `true`.
     */
    get isMetadataOnly() {
      return this.data === PLACEHOLDER_DATA;
    }
    /** The timestamp of this packet in microseconds. */
    get microsecondTimestamp() {
      return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
    }
    /** The duration of this packet in microseconds. */
    get microsecondDuration() {
      return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
    }
    /** Converts this packet to an
     * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
     * WebCodecs API. */
    toEncodedVideoChunk() {
      if (this.isMetadataOnly) {
        throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
      }
      if (typeof EncodedVideoChunk === "undefined") {
        throw new Error("Your browser does not support EncodedVideoChunk.");
      }
      return new EncodedVideoChunk({
        data: this.data,
        type: this.type,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration
      });
    }
    /**
     * Converts this packet to an
     * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
     * WebCodecs API, using the alpha side data instead of the color data. Throws if no alpha side data is defined.
     */
    alphaToEncodedVideoChunk(type = this.type) {
      if (!this.sideData.alpha) {
        throw new TypeError("This packet does not contain alpha side data.");
      }
      if (this.isMetadataOnly) {
        throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
      }
      if (typeof EncodedVideoChunk === "undefined") {
        throw new Error("Your browser does not support EncodedVideoChunk.");
      }
      return new EncodedVideoChunk({
        data: this.sideData.alpha,
        type,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration
      });
    }
    /** Converts this packet to an
     * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk) for use with the
     * WebCodecs API. */
    toEncodedAudioChunk() {
      if (this.isMetadataOnly) {
        throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");
      }
      if (typeof EncodedAudioChunk === "undefined") {
        throw new Error("Your browser does not support EncodedAudioChunk.");
      }
      return new EncodedAudioChunk({
        data: this.data,
        type: this.type,
        timestamp: this.microsecondTimestamp,
        duration: this.microsecondDuration
      });
    }
    /**
     * Creates an {@link EncodedPacket} from an
     * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) or
     * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk). This method is useful
     * for converting chunks from the WebCodecs API to `EncodedPacket` instances.
     */
    static fromEncodedChunk(chunk, sideData) {
      if (!(chunk instanceof EncodedVideoChunk || chunk instanceof EncodedAudioChunk)) {
        throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      return new _EncodedPacket(data, chunk.type, chunk.timestamp / 1e6, (chunk.duration ?? 0) / 1e6, void 0, void 0, sideData);
    }
    /** Clones this packet while optionally modifying the new packet's data. */
    clone(options) {
      if (options !== void 0 && (typeof options !== "object" || options === null)) {
        throw new TypeError("options, when provided, must be an object.");
      }
      if (options?.data !== void 0 && !(options.data instanceof Uint8Array)) {
        throw new TypeError("options.data, when provided, must be a Uint8Array.");
      }
      if (options?.type !== void 0 && options.type !== "key" && options.type !== "delta") {
        throw new TypeError('options.type, when provided, must be either "key" or "delta".');
      }
      if (options?.timestamp !== void 0 && !Number.isFinite(options.timestamp)) {
        throw new TypeError("options.timestamp, when provided, must be a number.");
      }
      if (options?.duration !== void 0 && !Number.isFinite(options.duration)) {
        throw new TypeError("options.duration, when provided, must be a number.");
      }
      if (options?.sequenceNumber !== void 0 && !Number.isFinite(options.sequenceNumber)) {
        throw new TypeError("options.sequenceNumber, when provided, must be a number.");
      }
      if (options?.sideData !== void 0 && (typeof options.sideData !== "object" || options.sideData === null)) {
        throw new TypeError("options.sideData, when provided, must be an object.");
      }
      return new _EncodedPacket(options?.data ?? this.data, options?.type ?? this.type, options?.timestamp ?? this.timestamp, options?.duration ?? this.duration, options?.sequenceNumber ?? this.sequenceNumber, this.byteLength, options?.sideData ?? this.sideData);
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-misc.js
  var buildIsobmffMimeType = (info) => {
    const base = info.hasVideo ? "video/" : info.hasAudio ? "audio/" : "application/";
    let string = base + (info.isQuickTime ? "quicktime" : "mp4");
    if (info.codecStrings.length > 0) {
      const uniqueCodecMimeTypes = [...new Set(info.codecStrings)];
      string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
    }
    return string;
  };
  var parsePsshBoxContents = (contents) => {
    const view2 = toDataView(contents);
    let pos = 0;
    const version = view2.getUint8(pos);
    pos += 1;
    pos += 3;
    const systemId = bytesToHexString(contents.subarray(pos, pos + 16));
    pos += 16;
    let keyIds = null;
    if (version > 0) {
      const kidCount = view2.getUint32(pos);
      pos += 4;
      if (kidCount > 0) {
        keyIds = [];
        for (let i = 0; i < kidCount; i++) {
          keyIds.push(bytesToHexString(contents.subarray(pos, pos + 16)));
          pos += 16;
        }
      }
    }
    const dataSize = view2.getUint32(pos);
    pos += 4;
    return {
      systemId,
      keyIds,
      data: contents.slice(pos, pos + dataSize)
    };
  };
  var psshBoxesAreEqual = (a, b) => a.systemId === b.systemId && uint8ArraysAreEqual(a.data, b.data);

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-reader.js
  var MIN_BOX_HEADER_SIZE = 8;
  var MAX_BOX_HEADER_SIZE = 16;
  var readBoxHeader = (slice) => {
    let totalSize = readU32Be(slice);
    const name = readAscii(slice, 4);
    let headerSize = 8;
    const hasLargeSize = totalSize === 1;
    if (hasLargeSize) {
      totalSize = readU64Be(slice);
      headerSize = 16;
    }
    const contentSize = totalSize - headerSize;
    if (contentSize < 0) {
      return null;
    }
    return { name, totalSize, headerSize, contentSize };
  };
  var readFixed_16_16 = (slice) => {
    return readI32Be(slice) / 65536;
  };
  var readFixed_2_30 = (slice) => {
    return readI32Be(slice) / 1073741824;
  };
  var readIsomVariableInteger = (slice) => {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      result <<= 7;
      const nextByte = readU8(slice);
      result |= nextByte & 127;
      if ((nextByte & 128) === 0) {
        break;
      }
    }
    return result;
  };
  var readMetadataStringShort = (slice) => {
    let stringLength = readU16Be(slice);
    slice.skip(2);
    stringLength = Math.min(stringLength, slice.remainingLength);
    return textDecoder.decode(readBytes(slice, stringLength));
  };
  var readDataBox = (slice) => {
    const header = readBoxHeader(slice);
    if (!header || header.name !== "data") {
      return null;
    }
    if (slice.remainingLength < 8) {
      return null;
    }
    const typeIndicator = readU32Be(slice);
    slice.skip(4);
    const data = readBytes(slice, header.contentSize - 8);
    switch (typeIndicator) {
      case 1:
        return textDecoder.decode(data);
      // UTF-8
      case 2:
        return new TextDecoder("utf-16be").decode(data);
      // UTF-16-BE
      case 13:
        return new RichImageData(data, "image/jpeg");
      case 14:
        return new RichImageData(data, "image/png");
      case 27:
        return new RichImageData(data, "image/bmp");
      default:
        return data;
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/aes.js
  var AES_128_BLOCK_SIZE = 16;
  var Te4 = new Uint32Array(256);
  var Td0 = new Uint32Array(256);
  var Td1 = new Uint32Array(256);
  var Td2 = new Uint32Array(256);
  var Td3 = new Uint32Array(256);
  var Td4 = new Uint32Array(256);
  var rcon = new Uint32Array(10);
  var tablesGenerated = false;
  var generateAesTables = () => {
    const sbox = new Uint8Array(256);
    const log = new Uint8Array(256);
    const pow = new Uint8Array(256);
    for (let i = 0, p = 1; i < 256; i++) {
      pow[i] = p;
      log[p] = i;
      p = p ^ p << 1 ^ (p & 128 ? 283 : 0);
    }
    const mul = (a, b) => a && b ? pow[(log[a] + log[b]) % 255] : 0;
    sbox[0] = 99;
    for (let i = 1; i < 256; i++) {
      const x = pow[255 - log[i]];
      let s = x ^ x << 1 ^ x << 2 ^ x << 3 ^ x << 4;
      s = s >>> 8 ^ s & 255 ^ 99;
      sbox[i] = s;
    }
    for (let i = 0; i < 256; i++) {
      const s = sbox[i];
      const is = sbox.indexOf(i);
      Te4[i] = s << 24 | s << 16 | s << 8 | s;
      Td4[i] = is << 24 | is << 16 | is << 8 | is;
      const b0 = mul(is, 14);
      const b1 = mul(is, 9);
      const b2 = mul(is, 13);
      const b3 = mul(is, 11);
      const w = b0 << 24 | b1 << 16 | b2 << 8 | b3;
      Td0[i] = w;
      Td1[i] = w >>> 8 | w << 24;
      Td2[i] = w >>> 16 | w << 16;
      Td3[i] = w >>> 24 | w << 8;
    }
    let r = 1;
    for (let i = 0; i < 10; i++) {
      rcon[i] = r << 24;
      r = r << 1 ^ (r & 128 ? 283 : 0);
    }
    tablesGenerated = true;
  };
  var Aes128CbcContext = class {
    constructor() {
      this.roundkey = new Uint32Array(44);
      this.iv = new Uint32Array(AES_128_BLOCK_SIZE / Uint32Array.BYTES_PER_ELEMENT);
      this.in = new Uint8Array(AES_128_BLOCK_SIZE);
      this.out = new Uint8Array(AES_128_BLOCK_SIZE);
      this.inView = new DataView(this.in.buffer);
      this.outView = new DataView(this.out.buffer);
    }
    init({ key, iv }) {
      assert(key.byteLength === 16);
      assert(iv.byteLength === 16);
      if (!tablesGenerated) {
        generateAesTables();
      }
      const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
      const ivView = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);
      this.roundkey[0] = keyView.getUint32(0, false);
      this.roundkey[1] = keyView.getUint32(4, false);
      this.roundkey[2] = keyView.getUint32(8, false);
      this.roundkey[3] = keyView.getUint32(12, false);
      this.iv[0] = ivView.getUint32(0, false);
      this.iv[1] = ivView.getUint32(4, false);
      this.iv[2] = ivView.getUint32(8, false);
      this.iv[3] = ivView.getUint32(12, false);
      for (let index = 4; index < 44; index += 4) {
        const temp = this.roundkey[index - 1];
        this.roundkey[index] = this.roundkey[index - 4] ^ Te4[temp >>> 16 & 255] & 4278190080 ^ Te4[temp >>> 8 & 255] & 16711680 ^ Te4[temp >>> 0 & 255] & 65280 ^ Te4[temp >>> 24 & 255] & 255 ^ rcon[index / 4 - 1];
        this.roundkey[index + 1] = this.roundkey[index - 3] ^ this.roundkey[index];
        this.roundkey[index + 2] = this.roundkey[index - 2] ^ this.roundkey[index + 1];
        this.roundkey[index + 3] = this.roundkey[index - 1] ^ this.roundkey[index + 2];
      }
      for (let i = 0, j = 40; i < j; i += 4, j -= 4) {
        for (let k = 0; k < 4; k++) {
          const temp = this.roundkey[i + k];
          this.roundkey[i + k] = this.roundkey[j + k];
          this.roundkey[j + k] = temp;
        }
      }
      for (let index = 4; index < 40; index += 4) {
        for (let k = 0; k < 4; k++) {
          const rk = this.roundkey[index + k];
          this.roundkey[index + k] = Td0[Te4[rk >>> 24 & 255] & 255] ^ Td1[Te4[rk >>> 16 & 255] & 255] ^ Td2[Te4[rk >>> 8 & 255] & 255] ^ Td3[Te4[rk >>> 0 & 255] & 255];
        }
      }
    }
    decrypt() {
      let s0 = this.inView.getUint32(0, false) ^ this.roundkey[0];
      let s1 = this.inView.getUint32(4, false) ^ this.roundkey[1];
      let s2 = this.inView.getUint32(8, false) ^ this.roundkey[2];
      let s3 = this.inView.getUint32(12, false) ^ this.roundkey[3];
      const temp0 = this.inView.getUint32(0, false);
      const temp1 = this.inView.getUint32(4, false);
      const temp2 = this.inView.getUint32(8, false);
      const temp3 = this.inView.getUint32(12, false);
      let t0, t1, t2, t3;
      for (let round = 1; round < 10; round++) {
        const offset = round * 4;
        t0 = Td0[s0 >>> 24] ^ Td1[s3 >>> 16 & 255] ^ Td2[s2 >>> 8 & 255] ^ Td3[s1 & 255] ^ this.roundkey[offset];
        t1 = Td0[s1 >>> 24] ^ Td1[s0 >>> 16 & 255] ^ Td2[s3 >>> 8 & 255] ^ Td3[s2 & 255] ^ this.roundkey[offset + 1];
        t2 = Td0[s2 >>> 24] ^ Td1[s1 >>> 16 & 255] ^ Td2[s0 >>> 8 & 255] ^ Td3[s3 & 255] ^ this.roundkey[offset + 2];
        t3 = Td0[s3 >>> 24] ^ Td1[s2 >>> 16 & 255] ^ Td2[s1 >>> 8 & 255] ^ Td3[s0 & 255] ^ this.roundkey[offset + 3];
        s0 = t0;
        s1 = t1;
        s2 = t2;
        s3 = t3;
      }
      const f0 = Td4[s0 >>> 24 & 255] & 4278190080 ^ Td4[s3 >>> 16 & 255] & 16711680 ^ Td4[s2 >>> 8 & 255] & 65280 ^ Td4[s1 >>> 0 & 255] & 255 ^ this.roundkey[40];
      const f1 = Td4[s1 >>> 24 & 255] & 4278190080 ^ Td4[s0 >>> 16 & 255] & 16711680 ^ Td4[s3 >>> 8 & 255] & 65280 ^ Td4[s2 >>> 0 & 255] & 255 ^ this.roundkey[41];
      const f2 = Td4[s2 >>> 24 & 255] & 4278190080 ^ Td4[s1 >>> 16 & 255] & 16711680 ^ Td4[s0 >>> 8 & 255] & 65280 ^ Td4[s3 >>> 0 & 255] & 255 ^ this.roundkey[42];
      const f3 = Td4[s3 >>> 24 & 255] & 4278190080 ^ Td4[s2 >>> 16 & 255] & 16711680 ^ Td4[s1 >>> 8 & 255] & 65280 ^ Td4[s0 >>> 0 & 255] & 255 ^ this.roundkey[43];
      this.outView.setUint32(0, f0 ^ this.iv[0], false);
      this.outView.setUint32(4, f1 ^ this.iv[1], false);
      this.outView.setUint32(8, f2 ^ this.iv[2], false);
      this.outView.setUint32(12, f3 ^ this.iv[3], false);
      this.iv[0] = temp0;
      this.iv[1] = temp1;
      this.iv[2] = temp2;
      this.iv[3] = temp3;
    }
  };
  var createAes128CbcDecryptStream = (reader, getInit, close) => {
    let initted = false;
    let pos = 0;
    const CHUNK_SIZE = 2 ** 16;
    const BLOCK_SIZE = 16;
    const aesContext = new Aes128CbcContext();
    return new ReadableStream({
      pull: async (controller) => {
        if (!initted) {
          aesContext.init(await getInit());
          initted = true;
        }
        const requestedLength = CHUNK_SIZE + BLOCK_SIZE;
        let nextSlice = reader.requestSliceRange(pos, 0, requestedLength);
        if (nextSlice instanceof Promise)
          nextSlice = await nextSlice;
        if (!nextSlice || nextSlice.length === 0) {
          throw new Error("Invalid ciphertext.");
        }
        const sliceLength = nextSlice.length;
        if (sliceLength % 16 !== 0) {
          throw new Error("Invalid ciphertext.");
        }
        const bytesToRead = sliceLength === requestedLength ? sliceLength - BLOCK_SIZE : sliceLength;
        const input = readBytes(nextSlice, bytesToRead);
        const output = new Uint8Array(bytesToRead);
        for (let i = 0; i < bytesToRead; i += 16) {
          aesContext.in.set(input.subarray(i, i + 16));
          aesContext.decrypt();
          output.set(aesContext.out, i);
        }
        if (bytesToRead < sliceLength) {
          controller.enqueue(output);
          pos += bytesToRead;
        } else {
          const paddingLength = output[bytesToRead - 1];
          if (paddingLength === 0 || paddingLength > 16) {
            throw new Error("Invalid PKCS#7 padding. Incorrect key or corrupted data.");
          }
          const trimmedOutput = output.subarray(0, bytesToRead - paddingLength);
          controller.enqueue(trimmedOutput);
          controller.close();
          close();
        }
      },
      cancel: () => {
        close();
      }
    });
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js
  var IsobmffDemuxer = class _IsobmffDemuxer extends Demuxer {
    constructor(input) {
      super(input);
      this.moovSlice = null;
      this.currentTrack = null;
      this.tracks = [];
      this.metadataPromise = null;
      this.movieTimescale = -1;
      this.movieDurationInTimescale = -1;
      this.isQuickTime = false;
      this.metadataTags = {};
      this.currentMetadataKeys = null;
      this.isFragmented = false;
      this.fragmentTrackDefaults = [];
      this.psshBoxes = [];
      this.currentFragment = null;
      this.lastReadFragment = null;
      this.decryptionKeyCache = /* @__PURE__ */ new Map();
      this.reader = input._reader;
    }
    async getTrackBackings() {
      await this.readMetadata();
      return this.tracks.map((track) => track.trackBacking);
    }
    async getMimeType() {
      await this.readMetadata();
      const backings = await this.getTrackBackings();
      const codecStrings = await Promise.all(backings.map((x) => x.getDecoderConfig().then((c) => c?.codec ?? null)));
      return buildIsobmffMimeType({
        isQuickTime: this.isQuickTime,
        hasVideo: this.tracks.some((x) => x.info?.type === "video"),
        hasAudio: this.tracks.some((x) => x.info?.type === "audio"),
        codecStrings: codecStrings.filter(Boolean)
      });
    }
    async getMetadataTags() {
      await this.readMetadata();
      return this.metadataTags;
    }
    readMetadata() {
      return this.metadataPromise ??= (async () => {
        let currentPos = 0;
        let lookForMfraBox = false;
        while (true) {
          let slice = this.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
          if (slice instanceof Promise)
            slice = await slice;
          if (!slice)
            break;
          const startPos = currentPos;
          const boxInfo = readBoxHeader(slice);
          if (!boxInfo) {
            break;
          }
          if (boxInfo.name === "ftyp" || boxInfo.name === "styp") {
            const majorBrand = readAscii(slice, 4);
            this.isQuickTime = majorBrand === "qt  ";
          } else if (boxInfo.name === "moov") {
            let moovSlice = this.reader.requestSlice(slice.filePos, boxInfo.contentSize);
            if (moovSlice instanceof Promise)
              moovSlice = await moovSlice;
            if (!moovSlice)
              break;
            this.moovSlice = moovSlice;
            this.readContiguousBoxes(this.moovSlice);
            for (const track of this.tracks) {
              const previousSegmentDurationsInSeconds = track.editListPreviousSegmentDurations / this.movieTimescale;
              track.editListOffset -= Math.round(previousSegmentDurationsInSeconds * track.timescale);
            }
            lookForMfraBox = this.isFragmented && this.reader.fileSize !== null && this.reader.fileSize > startPos + boxInfo.totalSize;
            break;
          } else if (boxInfo.name === "moof") {
            if (!this.input._initInput) {
              throw new Error('"moof" box encountered with no "moov" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a "moov" box is required to read this file, please provide it using InputOptions.initInput.');
            }
            const initDemuxer = await this.input._initInput._getDemuxer();
            if (initDemuxer.constructor !== _IsobmffDemuxer) {
              throw new Error("Init input must match the input's format.");
            }
            await initDemuxer.readMetadata();
            this.movieTimescale = initDemuxer.movieTimescale;
            this.movieDurationInTimescale = initDemuxer.movieDurationInTimescale;
            this.metadataTags = initDemuxer.metadataTags;
            this.isFragmented = true;
            this.fragmentTrackDefaults = initDemuxer.fragmentTrackDefaults;
            this.psshBoxes = initDemuxer.psshBoxes;
            for (const foreignTrack of initDemuxer.tracks) {
              const track = {
                id: foreignTrack.id,
                demuxer: this,
                trackBacking: null,
                disposition: foreignTrack.disposition,
                timescale: foreignTrack.timescale,
                durationInMediaTimescale: foreignTrack.durationInMediaTimescale,
                durationInMovieTimescale: foreignTrack.durationInMovieTimescale,
                rotation: foreignTrack.rotation,
                internalCodecId: foreignTrack.internalCodecId,
                name: foreignTrack.name,
                languageCode: foreignTrack.languageCode,
                sampleTableByteOffset: null,
                sampleTable: null,
                fragmentLookupTable: [],
                currentFragmentState: null,
                fragmentPositionCache: [],
                editListPreviousSegmentDurations: foreignTrack.editListPreviousSegmentDurations,
                editListOffset: foreignTrack.editListOffset,
                encryptionInfo: foreignTrack.encryptionInfo,
                encryptionAuxInfo: null,
                frmaCodecString: null,
                info: foreignTrack.info
              };
              if (foreignTrack.trackBacking) {
                assert(track.info);
                if (track.info.type === "video" && track.info.width !== -1) {
                  const videoTrack = track;
                  track.trackBacking = new IsobmffVideoTrackBacking(videoTrack);
                  this.tracks.push(track);
                } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
                  const audioTrack = track;
                  track.trackBacking = new IsobmffAudioTrackBacking(audioTrack);
                  this.tracks.push(track);
                }
              } else {
              }
            }
            lookForMfraBox = false;
            break;
          }
          currentPos = startPos + boxInfo.totalSize;
        }
        if (lookForMfraBox) {
          assert(this.reader.fileSize !== null);
          let lastWordSlice = this.reader.requestSlice(this.reader.fileSize - 4, 4);
          if (lastWordSlice instanceof Promise)
            lastWordSlice = await lastWordSlice;
          assert(lastWordSlice);
          const lastWord = readU32Be(lastWordSlice);
          const potentialMfraPos = this.reader.fileSize - lastWord;
          if (potentialMfraPos >= 0 && potentialMfraPos <= this.reader.fileSize - MAX_BOX_HEADER_SIZE) {
            let mfraHeaderSlice = this.reader.requestSliceRange(potentialMfraPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
            if (mfraHeaderSlice instanceof Promise)
              mfraHeaderSlice = await mfraHeaderSlice;
            if (mfraHeaderSlice) {
              const boxInfo = readBoxHeader(mfraHeaderSlice);
              if (boxInfo && boxInfo.name === "mfra") {
                let mfraSlice = this.reader.requestSlice(mfraHeaderSlice.filePos, boxInfo.contentSize);
                if (mfraSlice instanceof Promise)
                  mfraSlice = await mfraSlice;
                if (mfraSlice) {
                  this.readContiguousBoxes(mfraSlice);
                }
              }
            }
          }
        }
      })();
    }
    getSampleTableForTrack(internalTrack) {
      if (internalTrack.sampleTable) {
        return internalTrack.sampleTable;
      }
      const sampleTable = {
        sampleTimingEntries: [],
        sampleCompositionTimeOffsets: [],
        sampleSizes: [],
        keySampleIndices: null,
        chunkOffsets: [],
        sampleToChunk: [],
        presentationTimestamps: null,
        presentationTimestampIndexMap: null
      };
      internalTrack.sampleTable = sampleTable;
      if (internalTrack.sampleTableByteOffset === null) {
        return sampleTable;
      }
      assert(this.moovSlice);
      const stblContainerSlice = this.moovSlice.slice(internalTrack.sampleTableByteOffset);
      this.currentTrack = internalTrack;
      this.traverseBox(stblContainerSlice);
      this.currentTrack = null;
      const isPcmCodec = internalTrack.info?.type === "audio" && internalTrack.info.codec && PCM_AUDIO_CODECS.includes(internalTrack.info.codec);
      if (isPcmCodec && sampleTable.sampleCompositionTimeOffsets.length === 0) {
        assert(internalTrack.info?.type === "audio");
        const pcmInfo = parsePcmCodec(internalTrack.info.codec);
        const newSampleTimingEntries = [];
        const newSampleSizes = [];
        for (let i = 0; i < sampleTable.sampleToChunk.length; i++) {
          const chunkEntry = sampleTable.sampleToChunk[i];
          const nextEntry = sampleTable.sampleToChunk[i + 1];
          const chunkCount = (nextEntry ? nextEntry.startChunkIndex : sampleTable.chunkOffsets.length) - chunkEntry.startChunkIndex;
          for (let j = 0; j < chunkCount; j++) {
            const startSampleIndex = chunkEntry.startSampleIndex + j * chunkEntry.samplesPerChunk;
            const endSampleIndex = startSampleIndex + chunkEntry.samplesPerChunk;
            const startTimingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, startSampleIndex, (x) => x.startIndex);
            const startTimingEntry = sampleTable.sampleTimingEntries[startTimingEntryIndex];
            const endTimingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, endSampleIndex, (x) => x.startIndex);
            const endTimingEntry = sampleTable.sampleTimingEntries[endTimingEntryIndex];
            const firstSampleTimestamp = startTimingEntry.startDecodeTimestamp + (startSampleIndex - startTimingEntry.startIndex) * startTimingEntry.delta;
            const lastSampleTimestamp = endTimingEntry.startDecodeTimestamp + (endSampleIndex - endTimingEntry.startIndex) * endTimingEntry.delta;
            const delta = lastSampleTimestamp - firstSampleTimestamp;
            const lastSampleTimingEntry = last(newSampleTimingEntries);
            if (lastSampleTimingEntry && lastSampleTimingEntry.delta === delta) {
              lastSampleTimingEntry.count++;
            } else {
              newSampleTimingEntries.push({
                startIndex: chunkEntry.startChunkIndex + j,
                startDecodeTimestamp: firstSampleTimestamp,
                count: 1,
                delta
              });
            }
            const chunkSize = chunkEntry.samplesPerChunk * pcmInfo.sampleSize * internalTrack.info.numberOfChannels;
            newSampleSizes.push(chunkSize);
          }
          chunkEntry.startSampleIndex = chunkEntry.startChunkIndex;
          chunkEntry.samplesPerChunk = 1;
        }
        sampleTable.sampleTimingEntries = newSampleTimingEntries;
        sampleTable.sampleSizes = newSampleSizes;
      }
      if (sampleTable.sampleCompositionTimeOffsets.length > 0) {
        sampleTable.presentationTimestamps = [];
        for (const entry of sampleTable.sampleTimingEntries) {
          for (let i = 0; i < entry.count; i++) {
            sampleTable.presentationTimestamps.push({
              presentationTimestamp: entry.startDecodeTimestamp + i * entry.delta,
              sampleIndex: entry.startIndex + i
            });
          }
        }
        for (const entry of sampleTable.sampleCompositionTimeOffsets) {
          for (let i = 0; i < entry.count; i++) {
            const sampleIndex = entry.startIndex + i;
            const sample = sampleTable.presentationTimestamps[sampleIndex];
            if (!sample) {
              continue;
            }
            sample.presentationTimestamp += entry.offset;
          }
        }
        sampleTable.presentationTimestamps.sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
        sampleTable.presentationTimestampIndexMap = Array(sampleTable.presentationTimestamps.length).fill(-1);
        for (let i = 0; i < sampleTable.presentationTimestamps.length; i++) {
          sampleTable.presentationTimestampIndexMap[sampleTable.presentationTimestamps[i].sampleIndex] = i;
        }
      } else {
      }
      return sampleTable;
    }
    async readFragment(startPos) {
      if (this.lastReadFragment?.moofOffset === startPos) {
        return this.lastReadFragment;
      }
      let headerSlice = this.reader.requestSliceRange(startPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
      if (headerSlice instanceof Promise)
        headerSlice = await headerSlice;
      assert(headerSlice);
      const moofBoxInfo = readBoxHeader(headerSlice);
      assert(moofBoxInfo?.name === "moof");
      let entireSlice = this.reader.requestSlice(startPos, moofBoxInfo.totalSize);
      if (entireSlice instanceof Promise)
        entireSlice = await entireSlice;
      assert(entireSlice);
      this.traverseBox(entireSlice);
      const fragment = this.lastReadFragment;
      assert(fragment && fragment.moofOffset === startPos);
      for (const [, trackData] of fragment.trackData) {
        const track = trackData.track;
        const { fragmentPositionCache } = track;
        if (!trackData.startTimestampIsFinal) {
          const lookupEntry = track.fragmentLookupTable.find((x) => x.moofOffset === fragment.moofOffset);
          if (lookupEntry) {
            offsetFragmentTrackDataByTimestamp(trackData, lookupEntry.timestamp);
          } else {
            const lastCacheIndex = binarySearchLessOrEqual(fragmentPositionCache, fragment.moofOffset - 1, (x) => x.moofOffset);
            if (lastCacheIndex !== -1) {
              const lastCache = fragmentPositionCache[lastCacheIndex];
              offsetFragmentTrackDataByTimestamp(trackData, lastCache.endTimestamp);
            } else {
            }
          }
          trackData.startTimestampIsFinal = true;
        }
        const insertionIndex = binarySearchLessOrEqual(fragmentPositionCache, trackData.startTimestamp, (x) => x.startTimestamp);
        if (insertionIndex === -1 || fragmentPositionCache[insertionIndex].moofOffset !== fragment.moofOffset) {
          fragmentPositionCache.splice(insertionIndex + 1, 0, {
            moofOffset: fragment.moofOffset,
            startTimestamp: trackData.startTimestamp,
            endTimestamp: trackData.endTimestamp
          });
        }
        if (trackData.encryptionAuxInfo && track.encryptionInfo) {
          const entries = await resolveEncryptionAuxInfo(this.reader, track.encryptionInfo, trackData.encryptionAuxInfo);
          for (let i = 0; i < Math.min(trackData.samples.length, entries.length); i++) {
            const entry = entries[i];
            trackData.samples[i].encryption = entry;
          }
        }
      }
      return fragment;
    }
    readContiguousBoxes(slice) {
      const startIndex = slice.filePos;
      while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
        const foundBox = this.traverseBox(slice);
        if (!foundBox) {
          break;
        }
      }
    }
    // eslint-disable-next-line @stylistic/generator-star-spacing
    *iterateContiguousBoxes(slice) {
      const startIndex = slice.filePos;
      while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
        const startPos = slice.filePos;
        const boxInfo = readBoxHeader(slice);
        if (!boxInfo) {
          break;
        }
        yield { boxInfo, slice };
        slice.filePos = startPos + boxInfo.totalSize;
      }
    }
    traverseBox(slice) {
      const startPos = slice.filePos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        return false;
      }
      const contentStartPos = slice.filePos;
      const boxEndPos = startPos + boxInfo.totalSize;
      switch (boxInfo.name) {
        case "mdia":
        case "minf":
        case "dinf":
        case "mfra":
        case "edts":
        case "sinf":
        case "schi":
          {
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          }
          ;
          break;
        case "mvhd":
          {
            const version = readU8(slice);
            slice.skip(3);
            if (version === 1) {
              slice.skip(8 + 8);
              this.movieTimescale = readU32Be(slice);
              this.movieDurationInTimescale = readU64Be(slice);
            } else {
              slice.skip(4 + 4);
              this.movieTimescale = readU32Be(slice);
              this.movieDurationInTimescale = readU32Be(slice);
            }
          }
          ;
          break;
        case "trak":
          {
            const track = {
              id: -1,
              demuxer: this,
              trackBacking: null,
              disposition: {
                ...DEFAULT_TRACK_DISPOSITION,
                primary: false
              },
              info: null,
              timescale: -1,
              durationInMovieTimescale: -1,
              durationInMediaTimescale: -1,
              rotation: 0,
              internalCodecId: null,
              name: null,
              languageCode: UNDETERMINED_LANGUAGE,
              sampleTableByteOffset: -1,
              sampleTable: null,
              fragmentLookupTable: [],
              currentFragmentState: null,
              fragmentPositionCache: [],
              editListPreviousSegmentDurations: 0,
              editListOffset: 0,
              encryptionInfo: null,
              encryptionAuxInfo: null,
              frmaCodecString: null
            };
            this.currentTrack = track;
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
            if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
              if (track.info.type === "video" && track.info.width !== -1) {
                const videoTrack = track;
                track.trackBacking = new IsobmffVideoTrackBacking(videoTrack);
                this.tracks.push(track);
              } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
                const audioTrack = track;
                track.trackBacking = new IsobmffAudioTrackBacking(audioTrack);
                this.tracks.push(track);
              }
            }
            this.currentTrack = null;
          }
          ;
          break;
        case "tkhd":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            const version = readU8(slice);
            const flags = readU24Be(slice);
            const trackEnabled = !!(flags & 1);
            track.disposition.default = trackEnabled;
            if (version === 0) {
              slice.skip(8);
              track.id = readU32Be(slice);
              slice.skip(4);
              track.durationInMovieTimescale = readU32Be(slice);
            } else if (version === 1) {
              slice.skip(16);
              track.id = readU32Be(slice);
              slice.skip(4);
              track.durationInMovieTimescale = readU64Be(slice);
            } else {
              throw new Error(`Incorrect track header version ${version}.`);
            }
            slice.skip(2 * 4 + 2 + 2 + 2 + 2);
            const matrix = [
              readFixed_16_16(slice),
              readFixed_16_16(slice),
              readFixed_2_30(slice),
              readFixed_16_16(slice),
              readFixed_16_16(slice),
              readFixed_2_30(slice),
              readFixed_16_16(slice),
              readFixed_16_16(slice),
              readFixed_2_30(slice)
            ];
            const rotation = normalizeRotation(roundToMultiple(extractRotationFromMatrix(matrix), 90));
            assert(rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270);
            track.rotation = rotation;
          }
          ;
          break;
        case "elst":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            const version = readU8(slice);
            slice.skip(3);
            let relevantEntryFound = false;
            let previousSegmentDurations = 0;
            const entryCount = readU32Be(slice);
            for (let i = 0; i < entryCount; i++) {
              const segmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
              const mediaTime = version === 1 ? readI64Be(slice) : readI32Be(slice);
              const mediaRate = readFixed_16_16(slice);
              if (segmentDuration === 0) {
                continue;
              }
              if (relevantEntryFound) {
                Logging._warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");
                break;
              }
              if (mediaTime === -1) {
                previousSegmentDurations += segmentDuration;
                continue;
              }
              if (mediaRate !== 1) {
                Logging._warn("Unsupported edit list entry: media rate must be 1.");
                break;
              }
              track.editListPreviousSegmentDurations = previousSegmentDurations;
              track.editListOffset = mediaTime;
              relevantEntryFound = true;
            }
          }
          ;
          break;
        case "mdhd":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            const version = readU8(slice);
            slice.skip(3);
            if (version === 0) {
              slice.skip(8);
              track.timescale = readU32Be(slice);
              track.durationInMediaTimescale = readU32Be(slice);
            } else if (version === 1) {
              slice.skip(16);
              track.timescale = readU32Be(slice);
              track.durationInMediaTimescale = readU64Be(slice);
            }
            let language = readU16Be(slice);
            if (language > 0) {
              track.languageCode = "";
              for (let i = 0; i < 3; i++) {
                track.languageCode = String.fromCharCode(96 + (language & 31)) + track.languageCode;
                language >>= 5;
              }
              if (!isIso639Dash2LanguageCode(track.languageCode)) {
                track.languageCode = UNDETERMINED_LANGUAGE;
              }
            }
          }
          ;
          break;
        case "hdlr":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            slice.skip(8);
            const handlerType = readAscii(slice, 4);
            if (handlerType === "vide") {
              track.info = {
                type: "video",
                width: -1,
                height: -1,
                squarePixelWidth: -1,
                squarePixelHeight: -1,
                codec: null,
                codecDescription: null,
                colorSpace: null,
                avcType: null,
                avcCodecInfo: null,
                hevcCodecInfo: null,
                vp9CodecInfo: null,
                av1CodecInfo: null,
                proresFormat: null
              };
            } else if (handlerType === "soun") {
              track.info = {
                type: "audio",
                numberOfChannels: -1,
                sampleRate: -1,
                codec: null,
                codecDescription: null,
                aacCodecInfo: null,
                pcmLittleEndian: false,
                pcmSampleSize: null
              };
            }
          }
          ;
          break;
        case "stbl":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            track.sampleTableByteOffset = startPos;
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          }
          ;
          break;
        case "stsd":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (track.info === null || track.sampleTable) {
              break;
            }
            const stsdVersion = readU8(slice);
            slice.skip(3);
            const entries = readU32Be(slice);
            for (let i = 0; i < entries; i++) {
              const sampleBoxStartPos = slice.filePos;
              const sampleBoxInfo = readBoxHeader(slice);
              if (!sampleBoxInfo) {
                break;
              }
              track.internalCodecId = sampleBoxInfo.name;
              const lowercaseBoxName = sampleBoxInfo.name.toLowerCase();
              if (track.info.type === "video") {
                slice.skip(6 * 1 + 2 + 2 + 2 + 3 * 4);
                track.info.width = readU16Be(slice);
                track.info.height = readU16Be(slice);
                track.info.squarePixelWidth = track.info.width;
                track.info.squarePixelHeight = track.info.height;
                slice.skip(4 + 4 + 4 + 2 + 32 + 2 + 2);
                track.frmaCodecString = null;
                this.readContiguousBoxes(slice.slice(slice.filePos, sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos));
                const codecName = lowercaseBoxName === "encv" ? track.frmaCodecString : lowercaseBoxName;
                track.frmaCodecString = null;
                if (codecName === "avc1" || codecName === "avc3") {
                  track.info.codec = "avc";
                  track.info.avcType = codecName === "avc1" ? 1 : 3;
                } else if (codecName === "hvc1" || codecName === "hev1") {
                  track.info.codec = "hevc";
                } else if (codecName === "vp08") {
                  track.info.codec = "vp8";
                } else if (codecName === "vp09") {
                  track.info.codec = "vp9";
                } else if (codecName === "av01") {
                  track.info.codec = "av1";
                } else if (PRORES_FOURCCS.includes(lowercaseBoxName)) {
                  track.info.codec = "prores";
                  track.info.proresFormat = lowercaseBoxName;
                } else if (codecName === null) {
                  Logging._warn(`Unknown encrypted video codec due to missing frma box.`);
                } else {
                  Logging._warn(`Unsupported video codec (sample entry type '${sampleBoxInfo.name}').`);
                }
              } else {
                slice.skip(6 * 1 + 2);
                const version = readU16Be(slice);
                slice.skip(3 * 2);
                let channelCount = readU16Be(slice);
                let sampleSize = readU16Be(slice);
                slice.skip(2 * 2);
                let sampleRate = readU32Be(slice) / 65536;
                let lpcmFlags = null;
                if (stsdVersion === 0 && version > 0) {
                  if (version === 1) {
                    slice.skip(4);
                    sampleSize = 8 * readU32Be(slice);
                    slice.skip(2 * 4);
                  } else if (version === 2) {
                    slice.skip(4);
                    sampleRate = readF64Be(slice);
                    channelCount = readU32Be(slice);
                    slice.skip(4);
                    sampleSize = readU32Be(slice);
                    lpcmFlags = readU32Be(slice);
                    slice.skip(2 * 4);
                  }
                }
                track.info.numberOfChannels = channelCount;
                track.info.sampleRate = sampleRate;
                track.frmaCodecString = null;
                this.readContiguousBoxes(slice.slice(slice.filePos, sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos));
                const codecName = lowercaseBoxName === "enca" ? track.frmaCodecString : lowercaseBoxName;
                track.frmaCodecString = null;
                if (codecName === "mp4a") {
                } else if (codecName === "opus") {
                  track.info.codec = "opus";
                  track.info.sampleRate = OPUS_SAMPLE_RATE;
                } else if (codecName === "flac") {
                  track.info.codec = "flac";
                } else if (codecName === "ulaw") {
                  track.info.codec = "ulaw";
                } else if (codecName === "alaw") {
                  track.info.codec = "alaw";
                } else if (codecName === "ac-3") {
                  track.info.codec = "ac3";
                } else if (codecName === "ec-3") {
                  track.info.codec = "eac3";
                } else if (codecName === "twos") {
                  if (sampleSize === 8) {
                    track.info.codec = "pcm-s8";
                  } else if (sampleSize === 16) {
                    track.info.codec = track.info.pcmLittleEndian ? "pcm-s16" : "pcm-s16be";
                  } else {
                    Logging._warn(`Unsupported sample size ${sampleSize} for codec 'twos'.`);
                    track.info.codec = null;
                  }
                } else if (codecName === "sowt") {
                  if (sampleSize === 8) {
                    track.info.codec = "pcm-s8";
                  } else if (sampleSize === 16) {
                    track.info.codec = "pcm-s16";
                  } else {
                    Logging._warn(`Unsupported sample size ${sampleSize} for codec 'sowt'.`);
                    track.info.codec = null;
                  }
                } else if (codecName === "raw ") {
                  track.info.codec = "pcm-u8";
                } else if (codecName === "in24") {
                  track.info.codec = track.info.pcmLittleEndian ? "pcm-s24" : "pcm-s24be";
                } else if (codecName === "in32") {
                  track.info.codec = track.info.pcmLittleEndian ? "pcm-s32" : "pcm-s32be";
                } else if (codecName === "fl32") {
                  track.info.codec = track.info.pcmLittleEndian ? "pcm-f32" : "pcm-f32be";
                } else if (codecName === "fl64") {
                  track.info.codec = track.info.pcmLittleEndian ? "pcm-f64" : "pcm-f64be";
                } else if (codecName === "ipcm") {
                  const pcmSampleSize = track.info.pcmSampleSize;
                  if (track.info.pcmLittleEndian) {
                    if (pcmSampleSize === 16) {
                      track.info.codec = "pcm-s16";
                    } else if (pcmSampleSize === 24) {
                      track.info.codec = "pcm-s24";
                    } else if (pcmSampleSize === 32) {
                      track.info.codec = "pcm-s32";
                    } else {
                      Logging._warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                      track.info.codec = null;
                    }
                  } else {
                    if (pcmSampleSize === 16) {
                      track.info.codec = "pcm-s16be";
                    } else if (pcmSampleSize === 24) {
                      track.info.codec = "pcm-s24be";
                    } else if (pcmSampleSize === 32) {
                      track.info.codec = "pcm-s32be";
                    } else {
                      Logging._warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                      track.info.codec = null;
                    }
                  }
                } else if (codecName === "fpcm") {
                  const pcmSampleSize = track.info.pcmSampleSize;
                  if (track.info.pcmLittleEndian) {
                    if (pcmSampleSize === 32) {
                      track.info.codec = "pcm-f32";
                    } else if (pcmSampleSize === 64) {
                      track.info.codec = "pcm-f64";
                    } else {
                      Logging._warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                      track.info.codec = null;
                    }
                  } else {
                    if (pcmSampleSize === 32) {
                      track.info.codec = "pcm-f32be";
                    } else if (pcmSampleSize === 64) {
                      track.info.codec = "pcm-f64be";
                    } else {
                      Logging._warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                      track.info.codec = null;
                    }
                  }
                } else if (codecName === "lpcm" && lpcmFlags !== null) {
                  const bytesPerSample = sampleSize + 7 >> 3;
                  const isFloat = Boolean(lpcmFlags & 1);
                  const isBigEndian = Boolean(lpcmFlags & 2);
                  const sFlags = lpcmFlags & 4 ? -1 : 0;
                  if (sampleSize > 0 && sampleSize <= 64) {
                    if (isFloat) {
                      if (sampleSize === 32) {
                        track.info.codec = isBigEndian ? "pcm-f32be" : "pcm-f32";
                      }
                    } else {
                      if (sFlags & 1 << bytesPerSample - 1) {
                        if (bytesPerSample === 1) {
                          track.info.codec = "pcm-s8";
                        } else if (bytesPerSample === 2) {
                          track.info.codec = isBigEndian ? "pcm-s16be" : "pcm-s16";
                        } else if (bytesPerSample === 3) {
                          track.info.codec = isBigEndian ? "pcm-s24be" : "pcm-s24";
                        } else if (bytesPerSample === 4) {
                          track.info.codec = isBigEndian ? "pcm-s32be" : "pcm-s32";
                        }
                      } else {
                        if (bytesPerSample === 1) {
                          track.info.codec = "pcm-u8";
                        }
                      }
                    }
                  }
                  if (track.info.codec === null) {
                    Logging._warn("Unsupported PCM format.");
                  }
                } else if (codecName === null) {
                  Logging._warn(`Unknown encrypted audio codec due to missing frma box.`);
                } else {
                  Logging._warn(`Unsupported audio codec (sample entry type '${sampleBoxInfo.name}').`);
                }
              }
              slice.filePos = sampleBoxStartPos + sampleBoxInfo.totalSize;
            }
          }
          ;
          break;
        case "frma":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            const format = readAscii(slice, 4);
            const lowercase = format.toLowerCase();
            track.frmaCodecString = lowercase;
          }
          ;
          break;
        case "schm":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            slice.skip(4);
            const schemeType = readAscii(slice, 4);
            if (schemeType === "cenc" || schemeType === "cens" || schemeType === "cbcs") {
              track.encryptionInfo = {
                scheme: schemeType,
                defaultKid: null,
                defaultIsProtected: null,
                defaultPerSampleIvSize: null,
                defaultConstantIv: null,
                defaultCryptByteBlock: null,
                defaultSkipByteBlock: null
              };
            } else {
              Logging._warn(`Unsupported encryption scheme '${schemeType}'.`);
            }
          }
          ;
          break;
        case "tenc":
          {
            const track = this.currentTrack;
            if (!track || !track.encryptionInfo) {
              break;
            }
            const version = readU8(slice);
            slice.skip(3);
            slice.skip(1);
            const patternByte = readU8(slice);
            if (version > 0) {
              track.encryptionInfo.defaultCryptByteBlock = patternByte >> 4;
              track.encryptionInfo.defaultSkipByteBlock = patternByte & 15;
            } else {
              track.encryptionInfo.defaultCryptByteBlock = 0;
              track.encryptionInfo.defaultSkipByteBlock = 0;
            }
            track.encryptionInfo.defaultIsProtected = readU8(slice) !== 0;
            track.encryptionInfo.defaultPerSampleIvSize = readU8(slice);
            track.encryptionInfo.defaultKid = bytesToHexString(readBytes(slice, 16));
            if (track.encryptionInfo.defaultIsProtected && track.encryptionInfo.defaultPerSampleIvSize === 0) {
              const constantIvSize = readU8(slice);
              const constantIv = new Uint8Array(16);
              constantIv.set(readBytes(slice, constantIvSize), 0);
              track.encryptionInfo.defaultConstantIv = constantIv;
            }
          }
          ;
          break;
        case "avcC":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info);
            track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
          }
          ;
          break;
        case "hvcC":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info);
            track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
          }
          ;
          break;
        case "vpcC":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "video");
            slice.skip(4);
            const profile = readU8(slice);
            const level = readU8(slice);
            const thirdByte = readU8(slice);
            const bitDepth = thirdByte >> 4;
            const chromaSubsampling = thirdByte >> 1 & 7;
            const videoFullRangeFlag = thirdByte & 1;
            const colourPrimaries = readU8(slice);
            const transferCharacteristics = readU8(slice);
            const matrixCoefficients = readU8(slice);
            track.info.vp9CodecInfo = {
              profile,
              level,
              bitDepth,
              chromaSubsampling,
              videoFullRangeFlag,
              colourPrimaries,
              transferCharacteristics,
              matrixCoefficients
            };
          }
          ;
          break;
        case "av1C":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "video");
            slice.skip(1);
            const secondByte = readU8(slice);
            const profile = secondByte >> 5;
            const level = secondByte & 31;
            const thirdByte = readU8(slice);
            const tier = thirdByte >> 7;
            const highBitDepth = thirdByte >> 6 & 1;
            const twelveBit = thirdByte >> 5 & 1;
            const monochrome = thirdByte >> 4 & 1;
            const chromaSubsamplingX = thirdByte >> 3 & 1;
            const chromaSubsamplingY = thirdByte >> 2 & 1;
            const chromaSamplePosition = thirdByte & 3;
            const bitDepth = profile === 2 && highBitDepth ? twelveBit ? 12 : 10 : highBitDepth ? 10 : 8;
            track.info.av1CodecInfo = {
              profile,
              level,
              tier,
              bitDepth,
              monochrome,
              chromaSubsamplingX,
              chromaSubsamplingY,
              chromaSamplePosition
            };
          }
          ;
          break;
        case "colr":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "video");
            const colourType = readAscii(slice, 4);
            if (colourType !== "nclx" && colourType !== "nclc") {
              break;
            }
            const colourPrimaries = readU16Be(slice);
            const transferCharacteristics = readU16Be(slice);
            const matrixCoefficients = readU16Be(slice);
            let fullRange = void 0;
            if (colourType === "nclx") {
              fullRange = Boolean(readU8(slice) & 128);
            }
            track.info.colorSpace = {
              primaries: COLOR_PRIMARIES_MAP_INVERSE[colourPrimaries],
              transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics],
              matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients],
              fullRange
            };
          }
          ;
          break;
        case "pasp":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "video");
            const num = readU32Be(slice);
            const den = readU32Be(slice);
            if (num > 0 && den > 0) {
              if (num > den) {
                track.info.squarePixelWidth = Math.round(track.info.width * num / den);
              } else {
                track.info.squarePixelHeight = Math.round(track.info.height * den / num);
              }
            }
          }
          ;
          break;
        case "wave":
          {
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          }
          ;
          break;
        case "esds":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            slice.skip(4);
            const tag = readU8(slice);
            assert(tag === 3);
            readIsomVariableInteger(slice);
            slice.skip(2);
            const mixed = readU8(slice);
            const streamDependenceFlag = (mixed & 128) !== 0;
            const urlFlag = (mixed & 64) !== 0;
            const ocrStreamFlag = (mixed & 32) !== 0;
            if (streamDependenceFlag) {
              slice.skip(2);
            }
            if (urlFlag) {
              const urlLength = readU8(slice);
              slice.skip(urlLength);
            }
            if (ocrStreamFlag) {
              slice.skip(2);
            }
            const decoderConfigTag = readU8(slice);
            assert(decoderConfigTag === 4);
            const decoderConfigDescriptorLength = readIsomVariableInteger(slice);
            const payloadStart = slice.filePos;
            const objectTypeIndication = readU8(slice);
            if (objectTypeIndication === 64 || objectTypeIndication === 103) {
              track.info.codec = "aac";
              track.info.aacCodecInfo = {
                isMpeg2: objectTypeIndication === 103,
                objectType: null
              };
            } else if (objectTypeIndication === 105 || objectTypeIndication === 107) {
              track.info.codec = "mp3";
            } else if (objectTypeIndication === 221) {
              track.info.codec = "vorbis";
            } else {
              Logging._warn(`Unsupported audio codec (objectTypeIndication ${objectTypeIndication}) - discarding track.`);
            }
            slice.skip(1 + 3 + 4 + 4);
            if (decoderConfigDescriptorLength > slice.filePos - payloadStart) {
              const decoderSpecificInfoTag = readU8(slice);
              assert(decoderSpecificInfoTag === 5);
              const decoderSpecificInfoLength = readIsomVariableInteger(slice);
              track.info.codecDescription = readBytes(slice, decoderSpecificInfoLength);
              if (track.info.codec === "aac") {
                const audioSpecificConfig = parseAacAudioSpecificConfig(track.info.codecDescription);
                if (audioSpecificConfig.numberOfChannels !== null) {
                  track.info.numberOfChannels = audioSpecificConfig.numberOfChannels;
                }
                if (audioSpecificConfig.sampleRate !== null) {
                  track.info.sampleRate = audioSpecificConfig.sampleRate;
                }
              }
            }
          }
          ;
          break;
        case "enda":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            track.info.pcmLittleEndian = !!(readU16Be(slice) & 255);
          }
          ;
          break;
        case "pcmC":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            slice.skip(1 + 3);
            const formatFlags = readU8(slice);
            track.info.pcmLittleEndian = Boolean(formatFlags & 1);
            track.info.pcmSampleSize = readU8(slice);
          }
          ;
          break;
        case "dOps":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            slice.skip(1);
            const outputChannelCount = readU8(slice);
            const preSkip = readU16Be(slice);
            const inputSampleRate = readU32Be(slice);
            const outputGain = readI16Be(slice);
            const channelMappingFamily = readU8(slice);
            let channelMappingTable;
            if (channelMappingFamily !== 0) {
              channelMappingTable = readBytes(slice, 2 + outputChannelCount);
            } else {
              channelMappingTable = new Uint8Array(0);
            }
            const description = new Uint8Array(8 + 1 + 1 + 2 + 4 + 2 + 1 + channelMappingTable.byteLength);
            const view2 = new DataView(description.buffer);
            view2.setUint32(0, 1332770163, false);
            view2.setUint32(4, 1214603620, false);
            view2.setUint8(8, 1);
            view2.setUint8(9, outputChannelCount);
            view2.setUint16(10, preSkip, true);
            view2.setUint32(12, inputSampleRate, true);
            view2.setInt16(16, outputGain, true);
            view2.setUint8(18, channelMappingFamily);
            description.set(channelMappingTable, 19);
            track.info.codecDescription = description;
            track.info.numberOfChannels = outputChannelCount;
          }
          ;
          break;
        case "dfLa":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            slice.skip(4);
            const BLOCK_TYPE_MASK = 127;
            const LAST_METADATA_BLOCK_FLAG_MASK = 128;
            const startPos2 = slice.filePos;
            while (slice.filePos < boxEndPos) {
              const flagAndType = readU8(slice);
              const metadataBlockLength = readU24Be(slice);
              const type = flagAndType & BLOCK_TYPE_MASK;
              if (type === FlacBlockType.STREAMINFO) {
                slice.skip(10);
                const word = readU32Be(slice);
                const sampleRate = word >>> 12;
                const numberOfChannels = (word >> 9 & 7) + 1;
                track.info.sampleRate = sampleRate;
                track.info.numberOfChannels = numberOfChannels;
                slice.skip(20);
              } else {
                slice.skip(metadataBlockLength);
              }
              if (flagAndType & LAST_METADATA_BLOCK_FLAG_MASK) {
                break;
              }
            }
            const endPos = slice.filePos;
            slice.filePos = startPos2;
            const bytes2 = readBytes(slice, endPos - startPos2);
            const description = new Uint8Array(4 + bytes2.byteLength);
            const view2 = new DataView(description.buffer);
            view2.setUint32(0, 1716281667, false);
            description.set(bytes2, 4);
            track.info.codecDescription = description;
          }
          ;
          break;
        case "dac3":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            const bytes2 = readBytes(slice, 3);
            const bitstream = new Bitstream(bytes2);
            const fscod = bitstream.readBits(2);
            bitstream.skipBits(5 + 3);
            const acmod = bitstream.readBits(3);
            const lfeon = bitstream.readBits(1);
            if (fscod < 3) {
              track.info.sampleRate = AC3_SAMPLE_RATES[fscod];
            }
            track.info.numberOfChannels = AC3_ACMOD_CHANNEL_COUNTS[acmod] + lfeon;
          }
          ;
          break;
        case "dec3":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.info?.type === "audio");
            const bytes2 = readBytes(slice, boxInfo.contentSize);
            const config = parseEac3Config(bytes2);
            if (!config) {
              Logging._warn("Invalid dec3 box contents, ignoring.");
              break;
            }
            const sampleRate = getEac3SampleRate(config);
            if (sampleRate !== null) {
              track.info.sampleRate = sampleRate;
            }
            track.info.numberOfChannels = getEac3ChannelCount(config);
          }
          ;
          break;
        case "stts":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            const entryCount = readU32Be(slice);
            let currentIndex = 0;
            let currentTimestamp = 0;
            for (let i = 0; i < entryCount; i++) {
              const sampleCount = readU32Be(slice);
              const sampleDelta = readU32Be(slice);
              track.sampleTable.sampleTimingEntries.push({
                startIndex: currentIndex,
                startDecodeTimestamp: currentTimestamp,
                count: sampleCount,
                delta: sampleDelta
              });
              currentIndex += sampleCount;
              currentTimestamp += sampleCount * sampleDelta;
            }
          }
          ;
          break;
        case "ctts":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(1 + 3);
            const entryCount = readU32Be(slice);
            let sampleIndex = 0;
            for (let i = 0; i < entryCount; i++) {
              const sampleCount = readU32Be(slice);
              const sampleOffset = readI32Be(slice);
              track.sampleTable.sampleCompositionTimeOffsets.push({
                startIndex: sampleIndex,
                count: sampleCount,
                offset: sampleOffset
              });
              sampleIndex += sampleCount;
            }
          }
          ;
          break;
        case "stsz":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            const sampleSize = readU32Be(slice);
            const sampleCount = readU32Be(slice);
            if (sampleSize === 0) {
              for (let i = 0; i < sampleCount; i++) {
                const sampleSize2 = readU32Be(slice);
                track.sampleTable.sampleSizes.push(sampleSize2);
              }
            } else {
              track.sampleTable.sampleSizes.push(sampleSize);
            }
          }
          ;
          break;
        case "stz2":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            slice.skip(3);
            const fieldSize = readU8(slice);
            const sampleCount = readU32Be(slice);
            const bytes2 = readBytes(slice, Math.ceil(sampleCount * fieldSize / 8));
            const bitstream = new Bitstream(bytes2);
            for (let i = 0; i < sampleCount; i++) {
              const sampleSize = bitstream.readBits(fieldSize);
              track.sampleTable.sampleSizes.push(sampleSize);
            }
          }
          ;
          break;
        case "stss":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            track.sampleTable.keySampleIndices = [];
            const entryCount = readU32Be(slice);
            for (let i = 0; i < entryCount; i++) {
              const sampleIndex = readU32Be(slice) - 1;
              track.sampleTable.keySampleIndices.push(sampleIndex);
            }
            if (track.sampleTable.keySampleIndices[0] !== 0) {
              track.sampleTable.keySampleIndices.unshift(0);
            }
          }
          ;
          break;
        case "stsc":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            const entryCount = readU32Be(slice);
            for (let i = 0; i < entryCount; i++) {
              const startChunkIndex = readU32Be(slice) - 1;
              const samplesPerChunk = readU32Be(slice);
              const sampleDescriptionIndex = readU32Be(slice);
              track.sampleTable.sampleToChunk.push({
                startSampleIndex: -1,
                startChunkIndex,
                samplesPerChunk,
                sampleDescriptionIndex
              });
            }
            let startSampleIndex = 0;
            for (let i = 0; i < track.sampleTable.sampleToChunk.length; i++) {
              track.sampleTable.sampleToChunk[i].startSampleIndex = startSampleIndex;
              if (i < track.sampleTable.sampleToChunk.length - 1) {
                const nextChunk = track.sampleTable.sampleToChunk[i + 1];
                const chunkCount = nextChunk.startChunkIndex - track.sampleTable.sampleToChunk[i].startChunkIndex;
                startSampleIndex += chunkCount * track.sampleTable.sampleToChunk[i].samplesPerChunk;
              }
            }
          }
          ;
          break;
        case "stco":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            const entryCount = readU32Be(slice);
            for (let i = 0; i < entryCount; i++) {
              const chunkOffset = readU32Be(slice);
              track.sampleTable.chunkOffsets.push(chunkOffset);
            }
          }
          ;
          break;
        case "co64":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            if (!track.sampleTable) {
              break;
            }
            slice.skip(4);
            const entryCount = readU32Be(slice);
            for (let i = 0; i < entryCount; i++) {
              const chunkOffset = readU64Be(slice);
              track.sampleTable.chunkOffsets.push(chunkOffset);
            }
          }
          ;
          break;
        case "mvex":
          {
            this.isFragmented = true;
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          }
          ;
          break;
        case "mehd":
          {
            const version = readU8(slice);
            slice.skip(3);
            const fragmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
            this.movieDurationInTimescale = fragmentDuration;
          }
          ;
          break;
        case "trex":
          {
            slice.skip(4);
            const trackId = readU32Be(slice);
            const defaultSampleDescriptionIndex = readU32Be(slice);
            const defaultSampleDuration = readU32Be(slice);
            const defaultSampleSize = readU32Be(slice);
            const defaultSampleFlags = readU32Be(slice);
            this.fragmentTrackDefaults.push({
              trackId,
              defaultSampleDescriptionIndex,
              defaultSampleDuration,
              defaultSampleSize,
              defaultSampleFlags
            });
          }
          ;
          break;
        case "tfra":
          {
            const version = readU8(slice);
            slice.skip(3);
            const trackId = readU32Be(slice);
            const track = this.tracks.find((x) => x.id === trackId);
            if (!track) {
              break;
            }
            const word = readU32Be(slice);
            const lengthSizeOfTrafNum = (word & 48) >> 4;
            const lengthSizeOfTrunNum = (word & 12) >> 2;
            const lengthSizeOfSampleNum = word & 3;
            const functions = [readU8, readU16Be, readU24Be, readU32Be];
            const readTrafNum = functions[lengthSizeOfTrafNum];
            const readTrunNum = functions[lengthSizeOfTrunNum];
            const readSampleNum = functions[lengthSizeOfSampleNum];
            const numberOfEntries = readU32Be(slice);
            for (let i = 0; i < numberOfEntries; i++) {
              const time = version === 1 ? readU64Be(slice) : readU32Be(slice);
              const moofOffset = version === 1 ? readU64Be(slice) : readU32Be(slice);
              readTrafNum(slice);
              readTrunNum(slice);
              readSampleNum(slice);
              track.fragmentLookupTable.push({
                timestamp: time,
                moofOffset
              });
            }
            track.fragmentLookupTable.sort((a, b) => a.timestamp - b.timestamp);
            for (let i = 0; i < track.fragmentLookupTable.length - 1; i++) {
              const entry1 = track.fragmentLookupTable[i];
              const entry2 = track.fragmentLookupTable[i + 1];
              if (entry1.timestamp === entry2.timestamp) {
                track.fragmentLookupTable.splice(i + 1, 1);
                i--;
              }
            }
          }
          ;
          break;
        case "moof":
          {
            this.currentFragment = {
              moofOffset: startPos,
              moofSize: boxInfo.totalSize,
              implicitBaseDataOffset: startPos,
              trackData: /* @__PURE__ */ new Map(),
              psshBoxes: []
            };
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
            this.lastReadFragment = this.currentFragment;
            this.currentFragment = null;
          }
          ;
          break;
        case "traf":
          {
            assert(this.currentFragment);
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
            if (this.currentTrack) {
              const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
              cond: if (trackData) {
                if (trackData.samples.length === 0) {
                  this.currentFragment.trackData.delete(this.currentTrack.id);
                  break cond;
                }
                trackData.presentationTimestamps = trackData.samples.map((x, i) => ({ presentationTimestamp: x.presentationTimestamp, sampleIndex: i })).sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
                for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
                  const currentEntry = trackData.presentationTimestamps[i];
                  const currentSample = trackData.samples[currentEntry.sampleIndex];
                  if (trackData.firstKeyFrameTimestamp === null && currentSample.isKeyFrame) {
                    trackData.firstKeyFrameTimestamp = currentSample.presentationTimestamp;
                  }
                  if (i < trackData.presentationTimestamps.length - 1) {
                    const nextEntry = trackData.presentationTimestamps[i + 1];
                    const duration = nextEntry.presentationTimestamp - currentEntry.presentationTimestamp;
                    currentSample.duration = duration;
                  }
                }
                const firstSample = trackData.samples[trackData.presentationTimestamps[0].sampleIndex];
                const lastSample = trackData.samples[last(trackData.presentationTimestamps).sampleIndex];
                trackData.startTimestamp = firstSample.presentationTimestamp;
                trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;
                const { currentFragmentState } = this.currentTrack;
                assert(currentFragmentState);
                if (currentFragmentState.startTimestamp !== null) {
                  offsetFragmentTrackDataByTimestamp(trackData, currentFragmentState.startTimestamp);
                  trackData.startTimestampIsFinal = true;
                }
                if (currentFragmentState.encryptionAuxInfo && !trackData.samples[0].encryption) {
                  trackData.encryptionAuxInfo = currentFragmentState.encryptionAuxInfo;
                }
              }
              this.currentTrack.currentFragmentState = null;
              this.currentTrack = null;
            }
          }
          ;
          break;
        case "pssh":
          {
            if (this.input._formatOptions.isobmff?._suppressPsshParsing) {
              break;
            }
            const psshBox = parsePsshBoxContents(readBytes(slice, boxInfo.contentSize));
            if (this.currentFragment) {
              this.currentFragment.psshBoxes.push(psshBox);
            } else if (!this.currentTrack) {
              this.psshBoxes.push(psshBox);
            }
          }
          ;
          break;
        case "tfhd":
          {
            assert(this.currentFragment);
            slice.skip(1);
            const flags = readU24Be(slice);
            const baseDataOffsetPresent = Boolean(flags & 1);
            const sampleDescriptionIndexPresent = Boolean(flags & 2);
            const defaultSampleDurationPresent = Boolean(flags & 8);
            const defaultSampleSizePresent = Boolean(flags & 16);
            const defaultSampleFlagsPresent = Boolean(flags & 32);
            const durationIsEmpty = Boolean(flags & 65536);
            const defaultBaseIsMoof = Boolean(flags & 131072);
            const trackId = readU32Be(slice);
            const track = this.tracks.find((x) => x.id === trackId);
            if (!track) {
              break;
            }
            const defaults = this.fragmentTrackDefaults.find((x) => x.trackId === trackId);
            this.currentTrack = track;
            track.currentFragmentState = {
              baseDataOffset: this.currentFragment.implicitBaseDataOffset,
              sampleDescriptionIndex: defaults?.defaultSampleDescriptionIndex ?? null,
              defaultSampleDuration: defaults?.defaultSampleDuration ?? null,
              defaultSampleSize: defaults?.defaultSampleSize ?? null,
              defaultSampleFlags: defaults?.defaultSampleFlags ?? null,
              startTimestamp: null,
              encryptionAuxInfo: null
            };
            if (baseDataOffsetPresent) {
              track.currentFragmentState.baseDataOffset = readU64Be(slice);
            } else if (defaultBaseIsMoof) {
              track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
            }
            if (sampleDescriptionIndexPresent) {
              track.currentFragmentState.sampleDescriptionIndex = readU32Be(slice);
            }
            if (defaultSampleDurationPresent) {
              track.currentFragmentState.defaultSampleDuration = readU32Be(slice);
            }
            if (defaultSampleSizePresent) {
              track.currentFragmentState.defaultSampleSize = readU32Be(slice);
            }
            if (defaultSampleFlagsPresent) {
              track.currentFragmentState.defaultSampleFlags = readU32Be(slice);
            }
            if (durationIsEmpty) {
              track.currentFragmentState.defaultSampleDuration = 0;
            }
          }
          ;
          break;
        case "tfdt":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(track.currentFragmentState);
            const version = readU8(slice);
            slice.skip(3);
            const baseMediaDecodeTime = version === 0 ? readU32Be(slice) : readU64Be(slice);
            track.currentFragmentState.startTimestamp = baseMediaDecodeTime;
          }
          ;
          break;
        case "trun":
          {
            const track = this.currentTrack;
            if (!track) {
              break;
            }
            assert(this.currentFragment);
            assert(track.currentFragmentState);
            const version = readU8(slice);
            const flags = readU24Be(slice);
            const dataOffsetPresent = Boolean(flags & 1);
            const firstSampleFlagsPresent = Boolean(flags & 4);
            const sampleDurationPresent = Boolean(flags & 256);
            const sampleSizePresent = Boolean(flags & 512);
            const sampleFlagsPresent = Boolean(flags & 1024);
            const sampleCompositionTimeOffsetsPresent = Boolean(flags & 2048);
            const sampleCount = readU32Be(slice);
            let dataOffset = null;
            if (dataOffsetPresent) {
              dataOffset = readI32Be(slice);
            }
            let firstSampleFlags = null;
            if (firstSampleFlagsPresent) {
              firstSampleFlags = readU32Be(slice);
            }
            let trackData;
            if (this.currentFragment.trackData.has(track.id)) {
              trackData = this.currentFragment.trackData.get(track.id);
              if (dataOffset !== null) {
                trackData.currentOffset = track.currentFragmentState.baseDataOffset + dataOffset;
              } else {
              }
            } else {
              trackData = {
                track,
                currentTimestamp: 0,
                currentOffset: track.currentFragmentState.baseDataOffset + (dataOffset ?? 0),
                startTimestamp: 0,
                endTimestamp: 0,
                firstKeyFrameTimestamp: null,
                samples: [],
                presentationTimestamps: [],
                startTimestampIsFinal: false,
                encryptionAuxInfo: null
              };
              this.currentFragment.trackData.set(track.id, trackData);
            }
            for (let i = 0; i < sampleCount; i++) {
              let sampleDuration;
              if (sampleDurationPresent) {
                sampleDuration = readU32Be(slice);
              } else {
                assert(track.currentFragmentState.defaultSampleDuration !== null);
                sampleDuration = track.currentFragmentState.defaultSampleDuration;
              }
              let sampleSize;
              if (sampleSizePresent) {
                sampleSize = readU32Be(slice);
              } else {
                assert(track.currentFragmentState.defaultSampleSize !== null);
                sampleSize = track.currentFragmentState.defaultSampleSize;
              }
              let sampleFlags;
              if (sampleFlagsPresent) {
                sampleFlags = readU32Be(slice);
              } else {
                assert(track.currentFragmentState.defaultSampleFlags !== null);
                sampleFlags = track.currentFragmentState.defaultSampleFlags;
              }
              if (i === 0 && firstSampleFlags !== null) {
                sampleFlags = firstSampleFlags;
              }
              let sampleCompositionTimeOffset = 0;
              if (sampleCompositionTimeOffsetsPresent) {
                if (version === 0) {
                  sampleCompositionTimeOffset = readU32Be(slice);
                } else {
                  sampleCompositionTimeOffset = readI32Be(slice);
                }
              }
              const isKeyFrame = !(sampleFlags & 65536);
              trackData.samples.push({
                presentationTimestamp: trackData.currentTimestamp + sampleCompositionTimeOffset,
                duration: sampleDuration,
                byteOffset: trackData.currentOffset,
                byteSize: sampleSize,
                isKeyFrame,
                encryption: null
              });
              trackData.currentOffset += sampleSize;
              trackData.currentTimestamp += sampleDuration;
            }
            this.currentFragment.implicitBaseDataOffset = trackData.currentOffset;
          }
          ;
          break;
        case "saiz":
          {
            const track = this.currentTrack;
            if (!track || !track.encryptionInfo) {
              break;
            }
            slice.skip(1);
            const flags = readU24Be(slice);
            if (flags & 1) {
              const auxInfoType = readAscii(slice, 4);
              const auxInfoTypeParam = readU32Be(slice);
              if (auxInfoType !== track.encryptionInfo.scheme || auxInfoTypeParam !== 0) {
                break;
              }
            }
            const defaultSampleInfoSize = readU8(slice);
            const sampleCount = readU32Be(slice);
            let sampleSizes = null;
            if (defaultSampleInfoSize === 0 && sampleCount > 0) {
              sampleSizes = readBytes(slice, sampleCount);
            }
            const aux = getOrCreateEncryptionAuxInfo(track);
            aux.defaultSampleInfoSize = defaultSampleInfoSize;
            aux.sampleSizes = sampleSizes;
            aux.sampleCount = sampleCount;
          }
          ;
          break;
        case "saio":
          {
            const track = this.currentTrack;
            if (!track || !track.encryptionInfo) {
              break;
            }
            const version = readU8(slice);
            const flags = readU24Be(slice);
            if (flags & 1) {
              const auxInfoType = readAscii(slice, 4);
              const auxInfoTypeParam = readU32Be(slice);
              if (auxInfoType !== track.encryptionInfo.scheme || auxInfoTypeParam !== 0) {
                break;
              }
            }
            const entryCount = readU32Be(slice);
            if (entryCount === 0) {
              break;
            }
            if (entryCount > 1) {
              Logging._warn("Multiple saio entries are not supported; using the first offset only.");
            }
            let offset = version === 0 ? readU32Be(slice) : Number(readU64Be(slice));
            if (this.currentFragment) {
              offset += this.currentFragment.moofOffset;
            }
            const aux = getOrCreateEncryptionAuxInfo(track);
            aux.offset = offset;
          }
          ;
          break;
        case "senc":
          {
            const track = this.currentTrack;
            if (!track || !track.encryptionInfo) {
              break;
            }
            assert(this.currentFragment);
            const trackData = this.currentFragment.trackData.get(track.id);
            if (!trackData) {
              break;
            }
            slice.skip(1);
            const flags = readU24Be(slice);
            const useSubsamples = Boolean(flags & 2);
            const sampleCount = readU32Be(slice);
            const ivSize = track.encryptionInfo.defaultPerSampleIvSize;
            assert(ivSize !== null);
            for (let i = 0; i < Math.min(sampleCount, trackData.samples.length); i++) {
              const iv = new Uint8Array(16);
              if (ivSize > 0) {
                iv.set(readBytes(slice, ivSize), 0);
              } else {
                iv.set(track.encryptionInfo.defaultConstantIv, 0);
              }
              let subsamples = null;
              if (useSubsamples) {
                const subsampleCount = readU16Be(slice);
                subsamples = [];
                for (let j = 0; j < subsampleCount; j++) {
                  const clearLen = readU16Be(slice);
                  const protectedLen = readU32Be(slice);
                  subsamples.push({ clearLen, protectedLen });
                }
              }
              const sample = trackData.samples[i];
              sample.encryption = { iv, subsamples };
            }
          }
          ;
          break;
        // Metadata section
        // https://exiftool.org/TagNames/QuickTime.html
        // https://mp4workshop.com/about
        case "udta":
          {
            const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
            for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
              if (boxInfo2.name !== "meta" && !this.currentTrack) {
                const startPos2 = slice2.filePos;
                this.metadataTags.raw ??= {};
                if (boxInfo2.name[0] === "\xA9") {
                  this.metadataTags.raw[boxInfo2.name] ??= readMetadataStringShort(slice2);
                } else {
                  this.metadataTags.raw[boxInfo2.name] ??= readBytes(slice2, boxInfo2.contentSize);
                }
                slice2.filePos = startPos2;
              }
              switch (boxInfo2.name) {
                case "meta":
                  {
                    slice2.skip(-boxInfo2.headerSize);
                    this.traverseBox(slice2);
                  }
                  ;
                  break;
                case "\xA9nam":
                case "name":
                  {
                    if (this.currentTrack) {
                      this.currentTrack.name = textDecoder.decode(readBytes(slice2, boxInfo2.contentSize));
                    } else {
                      this.metadataTags.title ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "\xA9des":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.description ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "\xA9ART":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.artist ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "\xA9alb":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.album ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "albr":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.albumArtist ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "\xA9gen":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.genre ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "\xA9day":
                  {
                    if (!this.currentTrack) {
                      const date = new Date(readMetadataStringShort(slice2));
                      if (!Number.isNaN(date.getTime())) {
                        this.metadataTags.date ??= date;
                      }
                    }
                  }
                  ;
                  break;
                case "\xA9cmt":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.comment ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
                case "\xA9lyr":
                  {
                    if (!this.currentTrack) {
                      this.metadataTags.lyrics ??= readMetadataStringShort(slice2);
                    }
                  }
                  ;
                  break;
              }
            }
          }
          ;
          break;
        case "meta":
          {
            if (this.currentTrack) {
              break;
            }
            const word = readU32Be(slice);
            const isQuickTime = word !== 0;
            this.currentMetadataKeys = /* @__PURE__ */ new Map();
            if (isQuickTime) {
              this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
            } else {
              this.readContiguousBoxes(slice.slice(contentStartPos + 4, boxInfo.contentSize - 4));
            }
            this.currentMetadataKeys = null;
          }
          ;
          break;
        case "keys":
          {
            if (!this.currentMetadataKeys) {
              break;
            }
            slice.skip(4);
            const entryCount = readU32Be(slice);
            for (let i = 0; i < entryCount; i++) {
              const keySize = readU32Be(slice);
              slice.skip(4);
              const keyName = textDecoder.decode(readBytes(slice, keySize - 8));
              this.currentMetadataKeys.set(i + 1, keyName);
            }
          }
          ;
          break;
        case "ilst":
          {
            if (!this.currentMetadataKeys) {
              break;
            }
            const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
            for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
              let metadataKey = boxInfo2.name;
              const nameAsNumber = (metadataKey.charCodeAt(0) << 24) + (metadataKey.charCodeAt(1) << 16) + (metadataKey.charCodeAt(2) << 8) + metadataKey.charCodeAt(3);
              if (this.currentMetadataKeys.has(nameAsNumber)) {
                metadataKey = this.currentMetadataKeys.get(nameAsNumber);
              }
              const data = readDataBox(slice2);
              this.metadataTags.raw ??= {};
              this.metadataTags.raw[metadataKey] ??= data;
              switch (metadataKey) {
                case "\xA9nam":
                case "titl":
                case "com.apple.quicktime.title":
                case "title":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.title ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9des":
                case "desc":
                case "dscp":
                case "com.apple.quicktime.description":
                case "description":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.description ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9ART":
                case "com.apple.quicktime.artist":
                case "artist":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.artist ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9alb":
                case "albm":
                case "com.apple.quicktime.album":
                case "album":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.album ??= data;
                    }
                  }
                  ;
                  break;
                case "aART":
                case "album_artist":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.albumArtist ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9cmt":
                case "com.apple.quicktime.comment":
                case "comment":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.comment ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9gen":
                case "gnre":
                case "com.apple.quicktime.genre":
                case "genre":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.genre ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9lyr":
                case "lyrics":
                  {
                    if (typeof data === "string") {
                      this.metadataTags.lyrics ??= data;
                    }
                  }
                  ;
                  break;
                case "\xA9day":
                case "rldt":
                case "com.apple.quicktime.creationdate":
                case "date":
                  {
                    if (typeof data === "string") {
                      const date = new Date(data);
                      if (!Number.isNaN(date.getTime())) {
                        this.metadataTags.date ??= date;
                      }
                    }
                  }
                  ;
                  break;
                case "covr":
                case "com.apple.quicktime.artwork":
                  {
                    if (data instanceof RichImageData) {
                      this.metadataTags.images ??= [];
                      this.metadataTags.images.push({
                        data: data.data,
                        kind: "coverFront",
                        mimeType: data.mimeType
                      });
                    } else if (data instanceof Uint8Array) {
                      this.metadataTags.images ??= [];
                      this.metadataTags.images.push({
                        data,
                        kind: "coverFront",
                        mimeType: "image/*"
                      });
                    }
                  }
                  ;
                  break;
                case "track":
                  {
                    if (typeof data === "string") {
                      const parts = data.split("/");
                      const trackNum = Number.parseInt(parts[0], 10);
                      const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
                      if (Number.isInteger(trackNum) && trackNum > 0) {
                        this.metadataTags.trackNumber ??= trackNum;
                      }
                      if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
                        this.metadataTags.tracksTotal ??= tracksTotal;
                      }
                    }
                  }
                  ;
                  break;
                case "trkn":
                  {
                    if (data instanceof Uint8Array && data.length >= 6) {
                      const view2 = toDataView(data);
                      const trackNumber = view2.getUint16(2, false);
                      const tracksTotal = view2.getUint16(4, false);
                      if (trackNumber > 0) {
                        this.metadataTags.trackNumber ??= trackNumber;
                      }
                      if (tracksTotal > 0) {
                        this.metadataTags.tracksTotal ??= tracksTotal;
                      }
                    }
                  }
                  ;
                  break;
                case "disc":
                case "disk":
                  {
                    if (data instanceof Uint8Array && data.length >= 6) {
                      const view2 = toDataView(data);
                      const discNumber = view2.getUint16(2, false);
                      const discNumberMax = view2.getUint16(4, false);
                      if (discNumber > 0) {
                        this.metadataTags.discNumber ??= discNumber;
                      }
                      if (discNumberMax > 0) {
                        this.metadataTags.discsTotal ??= discNumberMax;
                      }
                    }
                  }
                  ;
                  break;
              }
            }
          }
          ;
          break;
      }
      slice.filePos = boxEndPos;
      return true;
    }
  };
  var IsobmffTrackBacking = class {
    constructor(internalTrack) {
      this.internalTrack = internalTrack;
      this.packetToSampleIndex = /* @__PURE__ */ new WeakMap();
      this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
    }
    getId() {
      return this.internalTrack.id;
    }
    getNumber() {
      const demuxer = this.internalTrack.demuxer;
      const trackType = this.internalTrack.trackBacking.getType();
      let number = 0;
      for (const track of demuxer.tracks) {
        if (track.trackBacking.getType() === trackType) {
          number++;
        }
        if (track === this.internalTrack) {
          break;
        }
      }
      return number;
    }
    getCodec() {
      throw new Error("Not implemented on base class.");
    }
    getInternalCodecId() {
      return this.internalTrack.internalCodecId;
    }
    getName() {
      return this.internalTrack.name;
    }
    getLanguageCode() {
      return this.internalTrack.languageCode;
    }
    getTimeResolution() {
      return this.internalTrack.timescale;
    }
    isRelativeToUnixEpoch() {
      return false;
    }
    getUnixTimeForTimestamp() {
      return null;
    }
    getDisposition() {
      return this.internalTrack.disposition;
    }
    getPairingMask() {
      return 1n;
    }
    getBitrate() {
      return null;
    }
    getAverageBitrate() {
      return null;
    }
    async getDurationFromMetadata() {
      const track = this.internalTrack;
      if (track.durationInMediaTimescale <= 0) {
        return null;
      }
      assert(track.trackBacking);
      const firstPacket = await track.trackBacking.getFirstPacket({ metadataOnly: true });
      return (firstPacket?.timestamp ?? 0) + track.durationInMediaTimescale / track.timescale;
    }
    async getLiveRefreshInterval() {
      return null;
    }
    async getFirstPacket(options) {
      const regularPacket = await this.fetchPacketForSampleIndex(0, options);
      if (regularPacket || !this.internalTrack.demuxer.isFragmented) {
        return regularPacket;
      }
      return this.performFragmentedLookup(
        null,
        (fragment) => {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData) {
            return {
              sampleIndex: 0,
              correctSampleFound: true
            };
          }
          return {
            sampleIndex: -1,
            correctSampleFound: false
          };
        },
        -Infinity,
        // Use -Infinity as a search timestamp to avoid using the lookup entries
        Infinity,
        options
      );
    }
    mapTimestampIntoTimescale(timestamp) {
      return roundIfAlmostInteger(timestamp * this.internalTrack.timescale) + this.internalTrack.editListOffset;
    }
    async getPacket(timestamp, options) {
      const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
      const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
      if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
        return regularPacket;
      }
      return this.performFragmentedLookup(null, (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (!trackData) {
          return { sampleIndex: -1, correctSampleFound: false };
        }
        const index = binarySearchLessOrEqual(trackData.presentationTimestamps, timestampInTimescale, (x) => x.presentationTimestamp);
        const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
        const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
        return { sampleIndex: sampleIndex2, correctSampleFound };
      }, timestampInTimescale, timestampInTimescale, options);
    }
    async getNextPacket(packet, options) {
      const regularSampleIndex = this.packetToSampleIndex.get(packet);
      if (regularSampleIndex !== void 0) {
        return this.fetchPacketForSampleIndex(regularSampleIndex + 1, options);
      }
      const locationInFragment = this.packetToFragmentLocation.get(packet);
      if (locationInFragment === void 0) {
        throw new Error("Packet was not created from this track.");
      }
      return this.performFragmentedLookup(
        locationInFragment.fragment,
        (fragment) => {
          if (fragment === locationInFragment.fragment) {
            const trackData = fragment.trackData.get(this.internalTrack.id);
            if (locationInFragment.sampleIndex + 1 < trackData.samples.length) {
              return {
                sampleIndex: locationInFragment.sampleIndex + 1,
                correctSampleFound: true
              };
            }
          } else {
            const trackData = fragment.trackData.get(this.internalTrack.id);
            if (trackData) {
              return {
                sampleIndex: 0,
                correctSampleFound: true
              };
            }
          }
          return {
            sampleIndex: -1,
            correctSampleFound: false
          };
        },
        -Infinity,
        // Use -Infinity as a search timestamp to avoid using the lookup entries
        Infinity,
        options
      );
    }
    async getKeyPacket(timestamp, options) {
      const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const sampleIndex = getKeyframeSampleIndexForTimestamp(sampleTable, timestampInTimescale);
      const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
      if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
        return regularPacket;
      }
      return this.performFragmentedLookup(null, (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (!trackData) {
          return { sampleIndex: -1, correctSampleFound: false };
        }
        const index = findLastIndex(trackData.presentationTimestamps, (x) => {
          const sample = trackData.samples[x.sampleIndex];
          return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
        });
        const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
        const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
        return { sampleIndex: sampleIndex2, correctSampleFound };
      }, timestampInTimescale, timestampInTimescale, options);
    }
    async getNextKeyPacket(packet, options) {
      const regularSampleIndex = this.packetToSampleIndex.get(packet);
      if (regularSampleIndex !== void 0) {
        const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
        const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, regularSampleIndex);
        return this.fetchPacketForSampleIndex(nextKeyFrameSampleIndex, options);
      }
      const locationInFragment = this.packetToFragmentLocation.get(packet);
      if (locationInFragment === void 0) {
        throw new Error("Packet was not created from this track.");
      }
      return this.performFragmentedLookup(
        locationInFragment.fragment,
        (fragment) => {
          if (fragment === locationInFragment.fragment) {
            const trackData = fragment.trackData.get(this.internalTrack.id);
            const nextKeyFrameIndex = trackData.samples.findIndex((x, i) => x.isKeyFrame && i > locationInFragment.sampleIndex);
            if (nextKeyFrameIndex !== -1) {
              return {
                sampleIndex: nextKeyFrameIndex,
                correctSampleFound: true
              };
            }
          } else {
            const trackData = fragment.trackData.get(this.internalTrack.id);
            if (trackData && trackData.firstKeyFrameTimestamp !== null) {
              const keyFrameIndex = trackData.samples.findIndex((x) => x.isKeyFrame);
              assert(keyFrameIndex !== -1);
              return {
                sampleIndex: keyFrameIndex,
                correctSampleFound: true
              };
            }
          }
          return {
            sampleIndex: -1,
            correctSampleFound: false
          };
        },
        -Infinity,
        // Use -Infinity as a search timestamp to avoid using the lookup entries
        Infinity,
        options
      );
    }
    async fetchPacketForSampleIndex(sampleIndex, options) {
      if (sampleIndex === -1) {
        return null;
      }
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const sampleInfo = getSampleInfo(sampleTable, sampleIndex);
      if (!sampleInfo) {
        return null;
      }
      let data;
      if (options.metadataOnly) {
        data = PLACEHOLDER_DATA;
      } else {
        let slice = this.internalTrack.demuxer.reader.requestSlice(sampleInfo.sampleOffset, sampleInfo.sampleSize);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice) {
          return null;
        }
        data = readBytes(slice, sampleInfo.sampleSize);
        if (this.internalTrack.encryptionAuxInfo) {
          assert(this.internalTrack.encryptionInfo);
          const entries = await resolveEncryptionAuxInfo(this.internalTrack.demuxer.reader, this.internalTrack.encryptionInfo, this.internalTrack.encryptionAuxInfo);
          if (sampleIndex < entries.length) {
            data = await decryptSample(this.internalTrack, entries[sampleIndex], data, null);
          }
        }
      }
      const timestamp = (sampleInfo.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
      const duration = sampleInfo.duration / this.internalTrack.timescale;
      const packet = new EncodedPacket(data, sampleInfo.isKeyFrame ? "key" : "delta", timestamp, duration, sampleIndex, sampleInfo.sampleSize);
      this.packetToSampleIndex.set(packet, sampleIndex);
      return packet;
    }
    async fetchPacketInFragment(fragment, sampleIndex, options) {
      if (sampleIndex === -1) {
        return null;
      }
      const trackData = fragment.trackData.get(this.internalTrack.id);
      const fragmentSample = trackData.samples[sampleIndex];
      assert(fragmentSample);
      let data;
      if (options.metadataOnly) {
        data = PLACEHOLDER_DATA;
      } else {
        let slice = this.internalTrack.demuxer.reader.requestSlice(fragmentSample.byteOffset, fragmentSample.byteSize);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice) {
          return null;
        }
        data = readBytes(slice, fragmentSample.byteSize);
        if (fragmentSample.encryption) {
          data = await decryptSample(this.internalTrack, fragmentSample.encryption, data, fragment);
        }
      }
      const timestamp = (fragmentSample.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
      const duration = fragmentSample.duration / this.internalTrack.timescale;
      const packet = new EncodedPacket(data, fragmentSample.isKeyFrame ? "key" : "delta", timestamp, duration, fragment.moofOffset + sampleIndex, fragmentSample.byteSize);
      this.packetToFragmentLocation.set(packet, { fragment, sampleIndex });
      return packet;
    }
    /** Looks for a packet in the fragments while trying to load as few fragments as possible to retrieve it. */
    async performFragmentedLookup(startFragment, getMatchInFragment, searchTimestamp, latestTimestamp, options) {
      const demuxer = this.internalTrack.demuxer;
      let currentFragment = null;
      let bestFragment = null;
      let bestSampleIndex = -1;
      if (startFragment) {
        const { sampleIndex, correctSampleFound } = getMatchInFragment(startFragment);
        if (correctSampleFound) {
          return this.fetchPacketInFragment(startFragment, sampleIndex, options);
        }
        if (sampleIndex !== -1) {
          bestFragment = startFragment;
          bestSampleIndex = sampleIndex;
        }
      }
      const lookupEntryIndex = binarySearchLessOrEqual(this.internalTrack.fragmentLookupTable, searchTimestamp, (x) => x.timestamp);
      const lookupEntry = lookupEntryIndex !== -1 ? this.internalTrack.fragmentLookupTable[lookupEntryIndex] : null;
      const positionCacheIndex = binarySearchLessOrEqual(this.internalTrack.fragmentPositionCache, searchTimestamp, (x) => x.startTimestamp);
      const positionCacheEntry = positionCacheIndex !== -1 ? this.internalTrack.fragmentPositionCache[positionCacheIndex] : null;
      const lookupEntryPosition = Math.max(lookupEntry?.moofOffset ?? 0, positionCacheEntry?.moofOffset ?? 0) || null;
      let currentPos;
      if (!startFragment) {
        currentPos = lookupEntryPosition ?? 0;
      } else {
        if (lookupEntryPosition === null || startFragment.moofOffset >= lookupEntryPosition) {
          currentPos = startFragment.moofOffset + startFragment.moofSize;
          currentFragment = startFragment;
        } else {
          currentPos = lookupEntryPosition;
        }
      }
      while (true) {
        if (currentFragment) {
          const trackData = currentFragment.trackData.get(this.internalTrack.id);
          if (trackData && trackData.startTimestamp > latestTimestamp) {
            break;
          }
        }
        let slice = demuxer.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice)
          break;
        const boxStartPos = currentPos;
        const boxInfo = readBoxHeader(slice);
        if (!boxInfo) {
          break;
        }
        if (boxInfo.name === "moof") {
          currentFragment = await demuxer.readFragment(boxStartPos);
          const { sampleIndex, correctSampleFound } = getMatchInFragment(currentFragment);
          if (correctSampleFound) {
            return this.fetchPacketInFragment(currentFragment, sampleIndex, options);
          }
          if (sampleIndex !== -1) {
            bestFragment = currentFragment;
            bestSampleIndex = sampleIndex;
          }
        }
        currentPos = boxStartPos + boxInfo.totalSize;
      }
      if (lookupEntry && (!bestFragment || bestFragment.moofOffset < lookupEntry.moofOffset)) {
        const previousLookupEntry = this.internalTrack.fragmentLookupTable[lookupEntryIndex - 1];
        assert(!previousLookupEntry || previousLookupEntry.timestamp < lookupEntry.timestamp);
        const newSearchTimestamp = previousLookupEntry?.timestamp ?? -Infinity;
        return this.performFragmentedLookup(null, getMatchInFragment, newSearchTimestamp, latestTimestamp, options);
      }
      if (bestFragment) {
        return this.fetchPacketInFragment(bestFragment, bestSampleIndex, options);
      }
      return null;
    }
  };
  var IsobmffVideoTrackBacking = class extends IsobmffTrackBacking {
    constructor(internalTrack) {
      super(internalTrack);
      this.decoderConfigPromise = null;
      this.internalTrack = internalTrack;
    }
    getType() {
      return "video";
    }
    getCodec() {
      return this.internalTrack.info.codec;
    }
    getCodedWidth() {
      return this.internalTrack.info.width;
    }
    getCodedHeight() {
      return this.internalTrack.info.height;
    }
    getSquarePixelWidth() {
      return this.internalTrack.info.squarePixelWidth;
    }
    getSquarePixelHeight() {
      return this.internalTrack.info.squarePixelHeight;
    }
    getRotation() {
      return this.internalTrack.rotation;
    }
    async getColorSpace() {
      return {
        primaries: this.internalTrack.info.colorSpace?.primaries,
        transfer: this.internalTrack.info.colorSpace?.transfer,
        matrix: this.internalTrack.info.colorSpace?.matrix,
        fullRange: this.internalTrack.info.colorSpace?.fullRange
      };
    }
    async canBeTransparent() {
      return this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
    }
    async getDecoderConfig() {
      if (!this.internalTrack.info.codec) {
        return null;
      }
      return this.decoderConfigPromise ??= (async () => {
        if (this.internalTrack.info.codec === "vp9" && !this.internalTrack.info.vp9CodecInfo) {
          const firstPacket = await this.getFirstPacket({});
          this.internalTrack.info.vp9CodecInfo = firstPacket && extractVp9CodecInfoFromPacket(firstPacket.data);
        } else if (this.internalTrack.info.codec === "av1" && !this.internalTrack.info.av1CodecInfo) {
          const firstPacket = await this.getFirstPacket({});
          this.internalTrack.info.av1CodecInfo = firstPacket && extractAv1CodecInfoFromPacket(firstPacket.data);
        }
        const config = {
          codec: extractVideoCodecString(this.internalTrack.info),
          codedWidth: this.internalTrack.info.width,
          codedHeight: this.internalTrack.info.height,
          description: this.internalTrack.info.codecDescription ?? void 0,
          colorSpace: this.internalTrack.info.colorSpace ?? void 0
        };
        if (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) {
          config.displayAspectWidth = this.internalTrack.info.squarePixelWidth;
          config.displayAspectHeight = this.internalTrack.info.squarePixelHeight;
        }
        return config;
      })();
    }
  };
  var IsobmffAudioTrackBacking = class extends IsobmffTrackBacking {
    constructor(internalTrack) {
      super(internalTrack);
      this.decoderConfig = null;
      this.internalTrack = internalTrack;
    }
    getType() {
      return "audio";
    }
    getCodec() {
      return this.internalTrack.info.codec;
    }
    getNumberOfChannels() {
      return this.internalTrack.info.numberOfChannels;
    }
    getSampleRate() {
      return this.internalTrack.info.sampleRate;
    }
    async getDecoderConfig() {
      if (!this.internalTrack.info.codec) {
        return null;
      }
      return this.decoderConfig ??= {
        codec: extractAudioCodecString(this.internalTrack.info),
        numberOfChannels: this.internalTrack.info.numberOfChannels,
        sampleRate: this.internalTrack.info.sampleRate,
        description: this.internalTrack.info.codecDescription ?? void 0
      };
    }
  };
  var getSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
    if (sampleTable.presentationTimestamps) {
      const index = binarySearchLessOrEqual(sampleTable.presentationTimestamps, timescaleUnits, (x) => x.presentationTimestamp);
      if (index === -1) {
        return -1;
      }
      return sampleTable.presentationTimestamps[index].sampleIndex;
    } else {
      const index = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, timescaleUnits, (x) => x.startDecodeTimestamp);
      if (index === -1) {
        return -1;
      }
      const entry = sampleTable.sampleTimingEntries[index];
      return entry.startIndex + Math.min(Math.floor((timescaleUnits - entry.startDecodeTimestamp) / entry.delta), entry.count - 1);
    }
  };
  var getKeyframeSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
    if (!sampleTable.keySampleIndices) {
      return getSampleIndexForTimestamp(sampleTable, timescaleUnits);
    }
    if (sampleTable.presentationTimestamps) {
      const index = binarySearchLessOrEqual(sampleTable.presentationTimestamps, timescaleUnits, (x) => x.presentationTimestamp);
      if (index === -1) {
        return -1;
      }
      for (let i = index; i >= 0; i--) {
        const sampleIndex = sampleTable.presentationTimestamps[i].sampleIndex;
        const isKeyFrame = binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1;
        if (isKeyFrame) {
          return sampleIndex;
        }
      }
      return -1;
    } else {
      const sampleIndex = getSampleIndexForTimestamp(sampleTable, timescaleUnits);
      const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
      return sampleTable.keySampleIndices[index] ?? -1;
    }
  };
  var getSampleInfo = (sampleTable, sampleIndex) => {
    const timingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, sampleIndex, (x) => x.startIndex);
    const timingEntry = sampleTable.sampleTimingEntries[timingEntryIndex];
    if (!timingEntry || timingEntry.startIndex + timingEntry.count <= sampleIndex) {
      return null;
    }
    const decodeTimestamp = timingEntry.startDecodeTimestamp + (sampleIndex - timingEntry.startIndex) * timingEntry.delta;
    let presentationTimestamp = decodeTimestamp;
    const offsetEntryIndex = binarySearchLessOrEqual(sampleTable.sampleCompositionTimeOffsets, sampleIndex, (x) => x.startIndex);
    const offsetEntry = sampleTable.sampleCompositionTimeOffsets[offsetEntryIndex];
    if (offsetEntry && sampleIndex - offsetEntry.startIndex < offsetEntry.count) {
      presentationTimestamp += offsetEntry.offset;
    }
    const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)];
    const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, (x) => x.startSampleIndex);
    const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
    assert(chunkEntry);
    const chunkIndex = chunkEntry.startChunkIndex + Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
    const chunkOffset = sampleTable.chunkOffsets[chunkIndex];
    const startSampleIndexOfChunk = chunkEntry.startSampleIndex + (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;
    let chunkSize = 0;
    let sampleOffset = chunkOffset;
    if (sampleTable.sampleSizes.length === 1) {
      sampleOffset += sampleSize * (sampleIndex - startSampleIndexOfChunk);
      chunkSize += sampleSize * chunkEntry.samplesPerChunk;
    } else {
      for (let i = startSampleIndexOfChunk; i < startSampleIndexOfChunk + chunkEntry.samplesPerChunk; i++) {
        const sampleSize2 = sampleTable.sampleSizes[i];
        if (i < sampleIndex) {
          sampleOffset += sampleSize2;
        }
        chunkSize += sampleSize2;
      }
    }
    let duration = timingEntry.delta;
    if (sampleTable.presentationTimestamps) {
      const presentationIndex = sampleTable.presentationTimestampIndexMap[sampleIndex];
      assert(presentationIndex !== void 0);
      if (presentationIndex < sampleTable.presentationTimestamps.length - 1) {
        const nextEntry = sampleTable.presentationTimestamps[presentationIndex + 1];
        const nextPresentationTimestamp = nextEntry.presentationTimestamp;
        duration = nextPresentationTimestamp - presentationTimestamp;
      }
    }
    return {
      presentationTimestamp,
      duration,
      sampleOffset,
      sampleSize,
      chunkOffset,
      chunkSize,
      isKeyFrame: sampleTable.keySampleIndices ? binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1 : true
    };
  };
  var getNextKeyframeIndexForSample = (sampleTable, sampleIndex) => {
    if (!sampleTable.keySampleIndices) {
      return sampleIndex + 1;
    }
    const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
    return sampleTable.keySampleIndices[index + 1] ?? -1;
  };
  var offsetFragmentTrackDataByTimestamp = (trackData, timestamp) => {
    trackData.startTimestamp += timestamp;
    trackData.endTimestamp += timestamp;
    for (const sample of trackData.samples) {
      sample.presentationTimestamp += timestamp;
    }
    for (const entry of trackData.presentationTimestamps) {
      entry.presentationTimestamp += timestamp;
    }
  };
  var extractRotationFromMatrix = (matrix) => {
    const [a, b] = matrix;
    const radians = Math.atan2(b, a);
    if (!Number.isFinite(radians)) {
      return 0;
    }
    return radians * (180 / Math.PI);
  };
  var sampleTableIsEmpty = (sampleTable) => {
    return sampleTable.sampleSizes.length === 0;
  };
  var getOrCreateEncryptionAuxInfo = (track) => {
    if (track.currentFragmentState) {
      return track.currentFragmentState.encryptionAuxInfo ??= {
        defaultSampleInfoSize: 0,
        sampleSizes: null,
        sampleCount: 0,
        offset: null,
        resolved: null
      };
    } else {
      return track.encryptionAuxInfo ??= {
        defaultSampleInfoSize: 0,
        sampleSizes: null,
        sampleCount: 0,
        offset: null,
        resolved: null
      };
    }
  };
  var resolveEncryptionAuxInfo = async (reader, encryptionInfo, aux) => {
    if (aux.resolved) {
      return aux.resolved;
    }
    if (aux.offset === null || aux.sampleCount === 0) {
      throw new Error("Incomplete saiz/saio info; cannot resolve encryption data.");
    }
    let totalSize = 0;
    if (aux.defaultSampleInfoSize > 0) {
      totalSize = aux.defaultSampleInfoSize * aux.sampleCount;
    } else {
      assert(aux.sampleSizes);
      for (let i = 0; i < aux.sampleCount; i++) {
        totalSize += aux.sampleSizes[i];
      }
    }
    let slice = reader.requestSlice(aux.offset, totalSize);
    if (slice instanceof Promise)
      slice = await slice;
    if (!slice) {
      throw new Error("Failed to read auxiliary encryption info.");
    }
    const ivSize = encryptionInfo.defaultPerSampleIvSize;
    assert(ivSize !== null);
    const entries = [];
    for (let i = 0; i < aux.sampleCount; i++) {
      const entrySize = aux.defaultSampleInfoSize > 0 ? aux.defaultSampleInfoSize : aux.sampleSizes[i];
      const iv = new Uint8Array(16);
      if (ivSize > 0) {
        iv.set(readBytes(slice, ivSize), 0);
      } else {
        iv.set(encryptionInfo.defaultConstantIv, 0);
      }
      let subsamples = null;
      if (entrySize > ivSize) {
        const subsampleCount = readU16Be(slice);
        subsamples = [];
        for (let j = 0; j < subsampleCount; j++) {
          const clearLen = readU16Be(slice);
          const protectedLen = readU32Be(slice);
          subsamples.push({ clearLen, protectedLen });
        }
      }
      entries.push({ iv, subsamples });
    }
    aux.resolved = entries;
    return entries;
  };
  var decryptSample = async (track, sampleEncryption, data, fragment) => {
    assert(track.encryptionInfo);
    const encryptionInfo = track.encryptionInfo;
    assert(encryptionInfo.defaultKid !== null);
    const keyId = encryptionInfo.defaultKid;
    let keyBytes;
    const cacheEntry = track.demuxer.decryptionKeyCache.get(keyId);
    if (cacheEntry) {
      keyBytes = await cacheEntry;
    } else {
      if (!track.demuxer.input._formatOptions.isobmff?.resolveKeyId) {
        throw new Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");
      }
      const promise = (async () => {
        let psshBoxes = track.demuxer.psshBoxes;
        if (fragment) {
          psshBoxes = [
            ...psshBoxes,
            ...fragment.psshBoxes
          ].filter((x) => x.keyIds === null || x.keyIds.includes(keyId));
          for (let i = 0; i < psshBoxes.length - 1; i++) {
            for (let j = i + 1; j < psshBoxes.length; j++) {
              if (psshBoxesAreEqual(psshBoxes[i], psshBoxes[j])) {
                psshBoxes.splice(j, 1);
                j--;
              }
            }
          }
        }
        const keyResult = await track.demuxer.input._formatOptions.isobmff.resolveKeyId({ keyId, psshBoxes });
        if (!(typeof keyResult === "string" && keyResult.length === 32 && HEX_STRING_REGEX.test(keyResult) || keyResult instanceof Uint8Array && keyResult.byteLength === 16)) {
          throw new TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");
        }
        return keyResult instanceof Uint8Array ? keyResult : hexStringToBytes(keyResult);
      })();
      track.demuxer.decryptionKeyCache.set(keyId, promise);
      keyBytes = await promise;
    }
    if (encryptionInfo.scheme === "cenc" || encryptionInfo.scheme === "cens") {
      return decryptCtr(keyBytes, encryptionInfo, sampleEncryption, data);
    } else {
      return decryptCbcs(keyBytes, encryptionInfo, sampleEncryption, data);
    }
  };
  var decryptCtr = async (key, encryptionInfo, sampleEncryption, data) => {
    const counter = new Uint8Array(16);
    counter.set(sampleEncryption.iv, 0);
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-CTR" }, false, ["decrypt"]);
    const cryptApply = async (input) => {
      const plaintext = await crypto.subtle.decrypt({ name: "AES-CTR", counter, length: 64 }, cryptoKey, input);
      return new Uint8Array(plaintext);
    };
    if (!sampleEncryption.subsamples) {
      return cryptApply(data);
    }
    assert(encryptionInfo.defaultCryptByteBlock !== null && encryptionInfo.defaultSkipByteBlock !== null);
    const cryptRanges = collectCryptRanges(sampleEncryption.subsamples, encryptionInfo.defaultCryptByteBlock, encryptionInfo.defaultSkipByteBlock);
    let totalCryptLen = 0;
    for (const range of cryptRanges) {
      for (const seg of range.perSubsample) {
        totalCryptLen += seg.length;
      }
    }
    const cryptBuffer = new Uint8Array(totalCryptLen);
    let writePos = 0;
    for (const range of cryptRanges) {
      for (const seg of range.perSubsample) {
        cryptBuffer.set(data.subarray(seg.offset, seg.offset + seg.length), writePos);
        writePos += seg.length;
      }
    }
    const plain = await cryptApply(cryptBuffer);
    const output = new Uint8Array(data);
    let readPos = 0;
    for (const range of cryptRanges) {
      for (const seg of range.perSubsample) {
        output.set(plain.subarray(readPos, readPos + seg.length), seg.offset);
        readPos += seg.length;
      }
    }
    return output;
  };
  var decryptCbcs = (key, encryptionInfo, sampleEncryption, data) => {
    const ctx = new Aes128CbcContext();
    ctx.init({ key, iv: sampleEncryption.iv });
    const cryptByteBlock = encryptionInfo.defaultCryptByteBlock;
    const skipByteBlock = encryptionInfo.defaultSkipByteBlock;
    assert(cryptByteBlock !== null && skipByteBlock !== null);
    if (!sampleEncryption.subsamples) {
      const output2 = new Uint8Array(data);
      const numBlocks = Math.floor(data.length / 16);
      for (let b = 0; b < numBlocks; b++) {
        const off = b * 16;
        ctx.in.set(data.subarray(off, off + 16));
        ctx.decrypt();
        output2.set(ctx.out, off);
      }
      return output2;
    }
    if (cryptByteBlock === 0 && skipByteBlock === 0) {
      throw new Error("cbcs with subsamples requires pattern encryption.");
    }
    const output = new Uint8Array(data);
    const cryptRanges = collectCryptRanges(sampleEncryption.subsamples, cryptByteBlock, skipByteBlock);
    const ivView = new DataView(sampleEncryption.iv.buffer, sampleEncryption.iv.byteOffset, 16);
    for (const range of cryptRanges) {
      ctx.iv[0] = ivView.getUint32(0, false);
      ctx.iv[1] = ivView.getUint32(4, false);
      ctx.iv[2] = ivView.getUint32(8, false);
      ctx.iv[3] = ivView.getUint32(12, false);
      for (const seg of range.perSubsample) {
        const numBlocks = seg.length / 16;
        for (let b = 0; b < numBlocks; b++) {
          const offset = seg.offset + b * 16;
          ctx.in.set(data.subarray(offset, offset + 16));
          ctx.decrypt();
          output.set(ctx.out, offset);
        }
      }
    }
    return output;
  };
  var collectCryptRanges = (subsamples, cryptByteBlock, skipByteBlock) => {
    const ranges = [];
    const hasPattern = cryptByteBlock !== 0 || skipByteBlock !== 0;
    let cursor = 0;
    for (const subsample of subsamples) {
      cursor += subsample.clearLen;
      const perSubsample = [];
      if (!hasPattern) {
        if (subsample.protectedLen > 0) {
          perSubsample.push({ offset: cursor, length: subsample.protectedLen });
        }
        cursor += subsample.protectedLen;
      } else {
        let remaining = subsample.protectedLen;
        let pos = cursor;
        while (remaining > 0) {
          if (remaining < 16 * cryptByteBlock) {
            break;
          }
          const cryptBytes = 16 * cryptByteBlock;
          perSubsample.push({ offset: pos, length: cryptBytes });
          pos += cryptBytes;
          remaining -= cryptBytes;
          const skipBytes = Math.min(16 * skipByteBlock, remaining);
          pos += skipBytes;
          remaining -= skipBytes;
        }
        cursor += subsample.protectedLen;
      }
      ranges.push({ perSubsample });
    }
    return ranges;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/mp3/mp3-reader.js
  var readNextMp3FrameHeader = async (reader, startPos, until, ref = null) => {
    const CHUNK_SIZE = 2 ** 16;
    let currentPos = startPos;
    while (until === null || currentPos < until) {
      const maxLength = until !== null ? Math.min(CHUNK_SIZE, until - currentPos) : CHUNK_SIZE;
      let slice = reader.requestSliceRange(currentPos, MP3_FRAME_HEADER_SIZE, maxLength);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice || slice.length < MP3_FRAME_HEADER_SIZE)
        break;
      while (slice.remainingLength >= MP3_FRAME_HEADER_SIZE) {
        const posBeforeRead = slice.filePos;
        const word = readU32Be(slice);
        const remainingBytes = reader.fileSize !== null ? reader.fileSize - currentPos : null;
        const result = readMp3FrameHeader(word, remainingBytes);
        if (result.header && (!ref || // This condition helps us recover malformed streams
        // https://stackoverflow.com/a/20884944
        result.header.sampleRate === ref.sampleRate && result.header.mpegVersionId === ref.mpegVersionId && result.header.layer === ref.layer && getMp3ChannelCount(result.header.channel) === getMp3ChannelCount(ref.channel))) {
          return { header: result.header, startPos: currentPos };
        }
        slice.filePos = posBeforeRead + result.bytesAdvanced;
        currentPos = slice.filePos;
      }
    }
    return null;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/mp3/mp3-demuxer.js
  var Mp3Demuxer = class extends Demuxer {
    constructor(input) {
      super(input);
      this.metadataPromise = null;
      this.firstFrameHeader = null;
      this.firstFrameHeaderPos = null;
      this.loadedSamples = [];
      this.metadataTags = null;
      this.xingData = null;
      this.trackBackings = [];
      this.readingMutex = new AsyncMutex();
      this.lastSampleLoaded = false;
      this.lastLoadedPos = 0;
      this.nextTimestampInSamples = 0;
      this.reader = input._reader;
    }
    async readMetadata() {
      return this.metadataPromise ??= (async () => {
        while (!this.firstFrameHeader && !this.lastSampleLoaded) {
          await this.advanceReader();
        }
        if (!this.firstFrameHeader) {
          throw new Error("No valid MP3 frame found.");
        }
        this.trackBackings = [new Mp3AudioTrackBacking(this)];
      })();
    }
    async advanceReader() {
      if (this.lastLoadedPos === 0) {
        while (true) {
          let slice2 = this.reader.requestSlice(this.lastLoadedPos, ID3_V2_HEADER_SIZE);
          if (slice2 instanceof Promise)
            slice2 = await slice2;
          if (!slice2) {
            this.lastSampleLoaded = true;
            return;
          }
          const id3V2Header = readId3V2Header(slice2);
          if (!id3V2Header) {
            break;
          }
          this.lastLoadedPos = slice2.filePos + id3V2Header.size;
        }
      }
      const result = await readNextMp3FrameHeader(this.reader, this.lastLoadedPos, this.reader.fileSize, this.firstFrameHeader);
      if (!result) {
        this.lastSampleLoaded = true;
        return;
      }
      const header = result.header;
      this.lastLoadedPos = result.startPos + header.totalSize - 1;
      const xingOffset = getXingOffset(header.mpegVersionId, header.channel);
      let slice = this.reader.requestSlice(result.startPos + xingOffset, 4);
      if (slice instanceof Promise)
        slice = await slice;
      if (slice) {
        const word = readU32Be(slice);
        const isXing = word === XING || word === INFO;
        if (isXing) {
          if (!this.xingData) {
            let xingDataSlice = this.reader.requestSlice(result.startPos + xingOffset + 4, 12);
            if (xingDataSlice instanceof Promise)
              xingDataSlice = await xingDataSlice;
            if (xingDataSlice) {
              const xingData = readBytes(xingDataSlice, 12);
              const view2 = toDataView(xingData);
              const flags = view2.getUint32(0, false);
              this.xingData = {
                frameCount: flags & XingFlags.FrameCount ? view2.getUint32(4, false) : null,
                fileSize: flags & XingFlags.FileSize ? view2.getUint32(8, false) : null
              };
            }
          }
          return;
        }
      }
      if (!this.firstFrameHeader) {
        this.firstFrameHeader = header;
        this.firstFrameHeaderPos = result.startPos;
      }
      const sampleDuration = header.audioSamplesInFrame / this.firstFrameHeader.sampleRate;
      const sample = {
        timestamp: this.nextTimestampInSamples / this.firstFrameHeader.sampleRate,
        duration: sampleDuration,
        dataStart: result.startPos,
        dataSize: header.totalSize
      };
      this.loadedSamples.push(sample);
      this.nextTimestampInSamples += header.audioSamplesInFrame;
      return;
    }
    async getMimeType() {
      return "audio/mpeg";
    }
    async getTrackBackings() {
      await this.readMetadata();
      return this.trackBackings;
    }
    async getMetadataTags() {
      const release = await this.readingMutex.acquire();
      try {
        await this.readMetadata();
        if (this.metadataTags) {
          return this.metadataTags;
        }
        this.metadataTags = {};
        let currentPos = 0;
        let id3V2HeaderFound = false;
        while (true) {
          let headerSlice = this.reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
          if (headerSlice instanceof Promise)
            headerSlice = await headerSlice;
          if (!headerSlice)
            break;
          const id3V2Header = readId3V2Header(headerSlice);
          if (!id3V2Header) {
            break;
          }
          id3V2HeaderFound = true;
          let contentSlice = this.reader.requestSlice(headerSlice.filePos, id3V2Header.size);
          if (contentSlice instanceof Promise)
            contentSlice = await contentSlice;
          if (!contentSlice)
            break;
          parseId3V2Tag(contentSlice, id3V2Header, this.metadataTags);
          currentPos = headerSlice.filePos + id3V2Header.size;
        }
        if (!id3V2HeaderFound && this.reader.fileSize !== null && this.reader.fileSize >= ID3_V1_TAG_SIZE) {
          let slice = this.reader.requestSlice(this.reader.fileSize - ID3_V1_TAG_SIZE, ID3_V1_TAG_SIZE);
          if (slice instanceof Promise)
            slice = await slice;
          assert(slice);
          const tag = readAscii(slice, 3);
          if (tag === "TAG") {
            parseId3V1Tag(slice, this.metadataTags);
          }
        }
        return this.metadataTags;
      } finally {
        release();
      }
    }
  };
  var Mp3AudioTrackBacking = class {
    constructor(demuxer) {
      this.demuxer = demuxer;
    }
    getType() {
      return "audio";
    }
    getId() {
      return 1;
    }
    getNumber() {
      return 1;
    }
    getTimeResolution() {
      assert(this.demuxer.firstFrameHeader);
      return this.demuxer.firstFrameHeader.sampleRate / this.demuxer.firstFrameHeader.audioSamplesInFrame;
    }
    isRelativeToUnixEpoch() {
      return false;
    }
    getUnixTimeForTimestamp() {
      return null;
    }
    getPairingMask() {
      return 1n;
    }
    getBitrate() {
      return null;
    }
    getAverageBitrate() {
      return null;
    }
    async getDurationFromMetadata() {
      const demuxer = this.demuxer;
      assert(demuxer.firstFrameHeader !== null);
      assert(demuxer.firstFrameHeaderPos !== null);
      if (demuxer.xingData) {
        if (demuxer.xingData.frameCount !== null) {
          return demuxer.xingData.frameCount * demuxer.firstFrameHeader.audioSamplesInFrame / demuxer.firstFrameHeader.sampleRate;
        }
      } else {
        if (demuxer.reader.fileSize !== null) {
          const averageFrameSize = computeAverageMp3FrameSize(demuxer.firstFrameHeader.lowSamplingFrequency, demuxer.firstFrameHeader.layer, demuxer.firstFrameHeader.bitrate, demuxer.firstFrameHeader.sampleRate);
          const frameCount = (demuxer.reader.fileSize - demuxer.firstFrameHeaderPos) / averageFrameSize;
          return Math.round(frameCount) * demuxer.firstFrameHeader.audioSamplesInFrame / demuxer.firstFrameHeader.sampleRate;
        }
      }
      return null;
    }
    async getLiveRefreshInterval() {
      return null;
    }
    getName() {
      return null;
    }
    getLanguageCode() {
      return UNDETERMINED_LANGUAGE;
    }
    getCodec() {
      return "mp3";
    }
    getInternalCodecId() {
      return null;
    }
    getNumberOfChannels() {
      assert(this.demuxer.firstFrameHeader);
      return getMp3ChannelCount(this.demuxer.firstFrameHeader.channel);
    }
    getSampleRate() {
      assert(this.demuxer.firstFrameHeader);
      return this.demuxer.firstFrameHeader.sampleRate;
    }
    getDisposition() {
      return {
        ...DEFAULT_TRACK_DISPOSITION
      };
    }
    async getDecoderConfig() {
      assert(this.demuxer.firstFrameHeader);
      return {
        codec: "mp3",
        numberOfChannels: getMp3ChannelCount(this.demuxer.firstFrameHeader.channel),
        sampleRate: this.demuxer.firstFrameHeader.sampleRate
      };
    }
    async getPacketAtIndex(sampleIndex, options) {
      if (sampleIndex === -1) {
        return null;
      }
      const rawSample = this.demuxer.loadedSamples[sampleIndex];
      if (!rawSample) {
        return null;
      }
      let data;
      if (options.metadataOnly) {
        data = PLACEHOLDER_DATA;
      } else {
        let slice = this.demuxer.reader.requestSlice(rawSample.dataStart, rawSample.dataSize);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice) {
          return null;
        }
        data = readBytes(slice, rawSample.dataSize);
      }
      return new EncodedPacket(data, "key", rawSample.timestamp, rawSample.duration, sampleIndex, rawSample.dataSize);
    }
    getFirstPacket(options) {
      return this.getPacketAtIndex(0, options);
    }
    async getNextPacket(packet, options) {
      const release = await this.demuxer.readingMutex.acquire();
      try {
        const sampleIndex = binarySearchExact(this.demuxer.loadedSamples, packet.timestamp, (x) => x.timestamp);
        if (sampleIndex === -1) {
          throw new Error("Packet was not created from this track.");
        }
        const nextIndex = sampleIndex + 1;
        while (nextIndex >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded) {
          await this.demuxer.advanceReader();
        }
        return this.getPacketAtIndex(nextIndex, options);
      } finally {
        release();
      }
    }
    async getPacket(timestamp, options) {
      const release = await this.demuxer.readingMutex.acquire();
      try {
        while (true) {
          const index = binarySearchLessOrEqual(this.demuxer.loadedSamples, timestamp, (x) => x.timestamp);
          if (index === -1 && this.demuxer.loadedSamples.length > 0) {
            return null;
          }
          if (this.demuxer.lastSampleLoaded) {
            return this.getPacketAtIndex(index, options);
          }
          if (index >= 0 && index + 1 < this.demuxer.loadedSamples.length) {
            return this.getPacketAtIndex(index, options);
          }
          await this.demuxer.advanceReader();
        }
      } finally {
        release();
      }
    }
    getKeyPacket(timestamp, options) {
      return this.getPacket(timestamp, options);
    }
    getNextKeyPacket(packet, options) {
      return this.getNextPacket(packet, options);
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/adts/adts-reader.js
  var MIN_ADTS_FRAME_HEADER_SIZE = 7;
  var MAX_ADTS_FRAME_HEADER_SIZE = 9;
  var readAdtsFrameHeader = (slice) => {
    const startPos = slice.filePos;
    const bytes2 = readBytes(slice, 9);
    const bitstream = new Bitstream(bytes2);
    const syncword = bitstream.readBits(12);
    if (syncword !== 4095) {
      return null;
    }
    bitstream.skipBits(1);
    const layer = bitstream.readBits(2);
    if (layer !== 0) {
      return null;
    }
    const protectionAbsence = bitstream.readBits(1);
    const objectType = bitstream.readBits(2) + 1;
    const samplingFrequencyIndex = bitstream.readBits(4);
    if (samplingFrequencyIndex === 15) {
      return null;
    }
    bitstream.skipBits(1);
    const channelConfiguration = bitstream.readBits(3);
    if (channelConfiguration === 0) {
      throw new Error("ADTS frames with channel configuration 0 are not supported.");
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    const frameLength = bitstream.readBits(13);
    bitstream.skipBits(11);
    const numberOfAacFrames = bitstream.readBits(2) + 1;
    if (numberOfAacFrames !== 1) {
      throw new Error("ADTS frames with more than one AAC frame are not supported.");
    }
    let crcCheck = null;
    if (protectionAbsence === 1) {
      slice.filePos -= 2;
    } else {
      crcCheck = bitstream.readBits(16);
    }
    return {
      objectType,
      samplingFrequencyIndex,
      channelConfiguration,
      frameLength,
      numberOfAacFrames,
      crcCheck,
      startPos
    };
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/adts/adts-demuxer.js
  var SAMPLES_PER_AAC_FRAME = 1024;
  var AdtsDemuxer = class extends Demuxer {
    constructor(input) {
      super(input);
      this.metadataPromise = null;
      this.firstFrameHeader = null;
      this.loadedSamples = [];
      this.metadataTags = null;
      this.trackBackings = [];
      this.readingMutex = new AsyncMutex();
      this.lastSampleLoaded = false;
      this.lastLoadedPos = 0;
      this.nextTimestampInSamples = 0;
      this.reader = input._reader;
    }
    async readMetadata() {
      return this.metadataPromise ??= (async () => {
        while (!this.firstFrameHeader && !this.lastSampleLoaded) {
          await this.advanceReader();
        }
        assert(this.firstFrameHeader);
        this.trackBackings = [new AdtsAudioTrackBacking(this)];
      })();
    }
    async advanceReader() {
      if (this.lastLoadedPos === 0) {
        while (true) {
          let slice2 = this.reader.requestSlice(this.lastLoadedPos, ID3_V2_HEADER_SIZE);
          if (slice2 instanceof Promise)
            slice2 = await slice2;
          if (!slice2) {
            this.lastSampleLoaded = true;
            return;
          }
          const id3V2Header = readId3V2Header(slice2);
          if (!id3V2Header) {
            break;
          }
          this.lastLoadedPos = slice2.filePos + id3V2Header.size;
        }
      }
      let slice = this.reader.requestSliceRange(this.lastLoadedPos, MIN_ADTS_FRAME_HEADER_SIZE, MAX_ADTS_FRAME_HEADER_SIZE);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice) {
        this.lastSampleLoaded = true;
        return;
      }
      const header = readAdtsFrameHeader(slice);
      if (!header) {
        this.lastSampleLoaded = true;
        return;
      }
      if (this.reader.fileSize !== null && header.startPos + header.frameLength > this.reader.fileSize) {
        this.lastSampleLoaded = true;
        return;
      }
      if (!this.firstFrameHeader) {
        this.firstFrameHeader = header;
      }
      const sampleRate = aacFrequencyTable[header.samplingFrequencyIndex];
      assert(sampleRate !== void 0);
      const sampleDuration = SAMPLES_PER_AAC_FRAME / sampleRate;
      const sample = {
        timestamp: this.nextTimestampInSamples / sampleRate,
        duration: sampleDuration,
        dataStart: header.startPos,
        dataSize: header.frameLength
      };
      this.loadedSamples.push(sample);
      this.nextTimestampInSamples += SAMPLES_PER_AAC_FRAME;
      this.lastLoadedPos = header.startPos + header.frameLength;
    }
    async getMimeType() {
      return "audio/aac";
    }
    async getTrackBackings() {
      await this.readMetadata();
      return this.trackBackings;
    }
    async getMetadataTags() {
      const release = await this.readingMutex.acquire();
      try {
        await this.readMetadata();
        if (this.metadataTags) {
          return this.metadataTags;
        }
        this.metadataTags = {};
        let currentPos = 0;
        while (true) {
          let headerSlice = this.reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
          if (headerSlice instanceof Promise)
            headerSlice = await headerSlice;
          if (!headerSlice)
            break;
          const id3V2Header = readId3V2Header(headerSlice);
          if (!id3V2Header) {
            break;
          }
          let contentSlice = this.reader.requestSlice(headerSlice.filePos, id3V2Header.size);
          if (contentSlice instanceof Promise)
            contentSlice = await contentSlice;
          if (!contentSlice)
            break;
          parseId3V2Tag(contentSlice, id3V2Header, this.metadataTags);
          currentPos = headerSlice.filePos + id3V2Header.size;
        }
        return this.metadataTags;
      } finally {
        release();
      }
    }
  };
  var AdtsAudioTrackBacking = class {
    constructor(demuxer) {
      this.demuxer = demuxer;
    }
    getType() {
      return "audio";
    }
    getId() {
      return 1;
    }
    getNumber() {
      return 1;
    }
    getTimeResolution() {
      const sampleRate = this.getSampleRate();
      return sampleRate / SAMPLES_PER_AAC_FRAME;
    }
    isRelativeToUnixEpoch() {
      return false;
    }
    getUnixTimeForTimestamp() {
      return null;
    }
    getPairingMask() {
      return 1n;
    }
    getBitrate() {
      return null;
    }
    getAverageBitrate() {
      return null;
    }
    async getDurationFromMetadata() {
      return null;
    }
    async getLiveRefreshInterval() {
      return null;
    }
    getName() {
      return null;
    }
    getLanguageCode() {
      return UNDETERMINED_LANGUAGE;
    }
    getCodec() {
      return "aac";
    }
    getInternalCodecId() {
      assert(this.demuxer.firstFrameHeader);
      return this.demuxer.firstFrameHeader.objectType;
    }
    getNumberOfChannels() {
      assert(this.demuxer.firstFrameHeader);
      const numberOfChannels = aacChannelMap[this.demuxer.firstFrameHeader.channelConfiguration];
      assert(numberOfChannels !== void 0);
      return numberOfChannels;
    }
    getSampleRate() {
      assert(this.demuxer.firstFrameHeader);
      const sampleRate = aacFrequencyTable[this.demuxer.firstFrameHeader.samplingFrequencyIndex];
      assert(sampleRate !== void 0);
      return sampleRate;
    }
    getDisposition() {
      return {
        ...DEFAULT_TRACK_DISPOSITION
      };
    }
    async getDecoderConfig() {
      assert(this.demuxer.firstFrameHeader);
      return {
        codec: `mp4a.40.${this.demuxer.firstFrameHeader.objectType}`,
        numberOfChannels: this.getNumberOfChannels(),
        sampleRate: this.getSampleRate()
      };
    }
    async getPacketAtIndex(sampleIndex, options) {
      if (sampleIndex === -1) {
        return null;
      }
      const rawSample = this.demuxer.loadedSamples[sampleIndex];
      if (!rawSample) {
        return null;
      }
      let data;
      if (options.metadataOnly) {
        data = PLACEHOLDER_DATA;
      } else {
        let slice = this.demuxer.reader.requestSlice(rawSample.dataStart, rawSample.dataSize);
        if (slice instanceof Promise)
          slice = await slice;
        if (!slice) {
          return null;
        }
        data = readBytes(slice, rawSample.dataSize);
      }
      return new EncodedPacket(data, "key", rawSample.timestamp, rawSample.duration, sampleIndex, rawSample.dataSize);
    }
    getFirstPacket(options) {
      return this.getPacketAtIndex(0, options);
    }
    async getNextPacket(packet, options) {
      const release = await this.demuxer.readingMutex.acquire();
      try {
        const sampleIndex = binarySearchExact(this.demuxer.loadedSamples, packet.timestamp, (x) => x.timestamp);
        if (sampleIndex === -1) {
          throw new Error("Packet was not created from this track.");
        }
        const nextIndex = sampleIndex + 1;
        while (nextIndex >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded) {
          await this.demuxer.advanceReader();
        }
        return this.getPacketAtIndex(nextIndex, options);
      } finally {
        release();
      }
    }
    async getPacket(timestamp, options) {
      const release = await this.demuxer.readingMutex.acquire();
      try {
        while (true) {
          const index = binarySearchLessOrEqual(this.demuxer.loadedSamples, timestamp, (x) => x.timestamp);
          if (index === -1 && this.demuxer.loadedSamples.length > 0) {
            return null;
          }
          if (this.demuxer.lastSampleLoaded) {
            return this.getPacketAtIndex(index, options);
          }
          if (index >= 0 && index + 1 < this.demuxer.loadedSamples.length) {
            return this.getPacketAtIndex(index, options);
          }
          await this.demuxer.advanceReader();
        }
      } finally {
        release();
      }
    }
    getKeyPacket(timestamp, options) {
      return this.getPacket(timestamp, options);
    }
    getNextKeyPacket(packet, options) {
      return this.getNextPacket(packet, options);
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-misc.js
  var TIMESCALE = 9e4;
  var TS_PACKET_SIZE = 188;
  var buildMpegTsMimeType = (codecStrings) => {
    let string = "video/MP2T";
    const uniqueCodecStrings = [...new Set(codecStrings.filter(Boolean))];
    if (uniqueCodecStrings.length > 0) {
      string += `; codecs="${uniqueCodecStrings.join(", ")}"`;
    }
    return string;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-demuxer.js
  var MISSING_PTS_ERROR_MESSAGE = "PES packet is missing PTS where it was expected. PES packets without PTS are not currently supported. If you think this file should be supported, please report it.";
  var ignoredStreamTypes = /* @__PURE__ */ new Set();
  var MpegTsDemuxer = class extends Demuxer {
    constructor(input) {
      super(input);
      this.metadataPromise = null;
      this.elementaryStreams = [];
      this.trackBackingEntries = [];
      this.packetOffset = 0;
      this.packetStride = -1;
      this.sectionEndPositions = [];
      this.seekChunkSize = 5 * 1024 * 1024;
      this.minReferencePointByteDistance = -1;
      this.reader = input._reader;
    }
    async readMetadata() {
      return this.metadataPromise ??= (async () => {
        const lengthToCheck = TS_PACKET_SIZE + 16 + 1;
        let startingSlice = this.reader.requestSlice(0, lengthToCheck);
        if (startingSlice instanceof Promise)
          startingSlice = await startingSlice;
        assert(startingSlice);
        const startingBytes = readBytes(startingSlice, lengthToCheck);
        if (startingBytes[0] === 71 && startingBytes[TS_PACKET_SIZE] === 71) {
          this.packetOffset = 0;
          this.packetStride = TS_PACKET_SIZE;
        } else if (startingBytes[0] === 71 && startingBytes[TS_PACKET_SIZE + 16] === 71) {
          this.packetOffset = 0;
          this.packetStride = TS_PACKET_SIZE + 16;
        } else if (startingBytes[4] === 71 && startingBytes[4 + TS_PACKET_SIZE + 4] === 71) {
          this.packetOffset = 4;
          this.packetStride = TS_PACKET_SIZE + 4;
        } else {
          throw new Error("Unreachable.");
        }
        const MIN_REFERENCE_POINT_PACKET_DISTANCE = 256;
        this.minReferencePointByteDistance = MIN_REFERENCE_POINT_PACKET_DISTANCE * this.packetStride;
        let currentPos = this.packetOffset;
        let programMapPid = null;
        let hasProgramAssociationTable = false;
        let hasProgramMap = false;
        while (true) {
          const packetHeader = await this.readPacketHeader(currentPos);
          if (!packetHeader) {
            break;
          }
          if (packetHeader.payloadUnitStartIndicator === 0) {
            currentPos += this.packetStride;
            continue;
          }
          if (hasProgramMap && !this.elementaryStreams.some((x) => x.pid === packetHeader.pid)) {
            currentPos += this.packetStride;
            continue;
          }
          const section = await this.readSection(currentPos, true, !hasProgramMap);
          if (!section) {
            break;
          }
          const BYTES_BEFORE_SECTION_LENGTH = 3;
          const BITS_IN_CRC_32 = 32;
          let isProbablyProgramMap = false;
          if (!hasProgramMap && section.pid !== 0) {
            const isPesPacket = section.payload[0] === 0 && section.payload[1] === 0 && section.payload[2] === 1;
            if (!isPesPacket) {
              const bitstream = new Bitstream(section.payload);
              const pointerField = bitstream.readAlignedByte();
              bitstream.skipBits(8 * pointerField);
              const tableId = bitstream.readBits(8);
              isProbablyProgramMap = tableId === 2;
            }
          }
          if (section.pid === 0 && !hasProgramAssociationTable) {
            const bitstream = new Bitstream(section.payload);
            const pointerField = bitstream.readAlignedByte();
            bitstream.skipBits(8 * pointerField);
            bitstream.skipBits(14);
            const sectionLength = bitstream.readBits(10);
            bitstream.skipBits(40);
            while (8 * (sectionLength + BYTES_BEFORE_SECTION_LENGTH) - bitstream.pos > BITS_IN_CRC_32) {
              const programNumber = bitstream.readBits(16);
              bitstream.skipBits(3);
              const id = bitstream.readBits(13);
              if (programNumber !== 0) {
                if (programMapPid !== null) {
                  throw new Error("Only files with a single program are supported.");
                } else {
                  programMapPid = id;
                }
              }
            }
            if (programMapPid === null) {
              throw new Error("Program Association Table must link to a Program Map Table.");
            }
            hasProgramAssociationTable = true;
          } else if ((section.pid === programMapPid || isProbablyProgramMap) && !hasProgramMap) {
            const bitstream = new Bitstream(section.payload);
            const pointerField = bitstream.readAlignedByte();
            bitstream.skipBits(8 * pointerField);
            bitstream.skipBits(12);
            const sectionLength = bitstream.readBits(12);
            bitstream.skipBits(43);
            const pcrPid = bitstream.readBits(13);
            bitstream.skipBits(6);
            const programInfoLength = bitstream.readBits(10);
            bitstream.skipBits(8 * programInfoLength);
            while (8 * (sectionLength + BYTES_BEFORE_SECTION_LENGTH) - bitstream.pos > BITS_IN_CRC_32) {
              const streamType = bitstream.readBits(8);
              bitstream.skipBits(3);
              const elementaryPid = bitstream.readBits(13);
              bitstream.skipBits(6);
              const esInfoLength = bitstream.readBits(10);
              const esInfoEndPos = bitstream.pos + 8 * esInfoLength;
              let hasAc3Descriptor = false;
              let hasEac3Descriptor = false;
              while (bitstream.pos < esInfoEndPos) {
                const descriptorTag = bitstream.readBits(8);
                const descriptorLength = bitstream.readBits(8);
                if (descriptorTag === 106) {
                  hasAc3Descriptor = true;
                } else if (descriptorTag === 122 || descriptorTag === 204) {
                  hasEac3Descriptor = true;
                }
                bitstream.skipBits(8 * descriptorLength);
              }
              let info = null;
              switch (streamType) {
                case 27:
                case 36:
                  {
                    const codec = streamType === 27 ? "avc" : "hevc";
                    info = {
                      type: "video",
                      codec,
                      decoderConfig: null,
                      avcCodecInfo: null,
                      hevcCodecInfo: null,
                      colorSpace: {
                        primaries: null,
                        transfer: null,
                        matrix: null,
                        fullRange: null
                      },
                      width: -1,
                      height: -1,
                      squarePixelWidth: -1,
                      squarePixelHeight: -1,
                      reorderSize: -1
                    };
                  }
                  ;
                  break;
                case 3:
                case 4:
                case 15:
                case 129:
                case 135:
                  {
                    let codec;
                    if (streamType === 3 || streamType === 4) {
                      codec = "mp3";
                    } else if (streamType === 15) {
                      codec = "aac";
                    } else if (streamType === 129) {
                      codec = "ac3";
                    } else if (streamType === 135) {
                      codec = "eac3";
                    } else {
                      throw new Error("Unreachable.");
                    }
                    info = {
                      type: "audio",
                      codec,
                      decoderConfig: null,
                      aacCodecInfo: null,
                      numberOfChannels: -1,
                      sampleRate: -1
                    };
                  }
                  ;
                  break;
                case 6:
                  {
                    if (hasEac3Descriptor) {
                      info = {
                        type: "audio",
                        codec: "eac3",
                        decoderConfig: null,
                        aacCodecInfo: null,
                        numberOfChannels: -1,
                        sampleRate: -1
                      };
                    } else if (hasAc3Descriptor) {
                      info = {
                        type: "audio",
                        codec: "ac3",
                        decoderConfig: null,
                        aacCodecInfo: null,
                        numberOfChannels: -1,
                        sampleRate: -1
                      };
                    }
                  }
                  ;
                  break;
                default: {
                  if (!ignoredStreamTypes.has(streamType)) {
                    Logging._warn(`Note: MPEG-TS streams with stream_type 0x${streamType.toString(16)} are not currently supported.`);
                    ignoredStreamTypes.add(streamType);
                  }
                }
              }
              if (info) {
                this.elementaryStreams.push({
                  demuxer: this,
                  pid: elementaryPid,
                  streamType,
                  initialized: false,
                  firstSection: null,
                  canBeTrustedWithKeyPackets: false,
                  info,
                  referencePesPackets: []
                });
              }
            }
            hasProgramMap = true;
          } else {
            const elementaryStream = this.elementaryStreams.find((x) => x.pid === section.pid);
            outer: if (elementaryStream && !elementaryStream.initialized) {
              const pesPacket = readPesPacket(section, true);
              if (!pesPacket) {
                throw new Error(`Couldn't read first PES packet for Elementary Stream with PID ${elementaryStream.pid}`);
              }
              elementaryStream.firstSection = section;
              elementaryStream.canBeTrustedWithKeyPackets = section.randomAccessIndicator === 1;
              if (this.input._initInput) {
                const initDemuxer = await this.input._initInput._getDemuxer();
                const matchingStream = initDemuxer.elementaryStreams.find((x) => x.pid === section.pid && x.info.codec === elementaryStream.info.codec);
                if (matchingStream) {
                  elementaryStream.info = matchingStream.info;
                  elementaryStream.initialized = true;
                  break outer;
                }
              }
              const context = new PacketReadingContext(elementaryStream, pesPacket);
              if (elementaryStream.info.type === "video") {
                while (true) {
                  const contextAlias = context;
                  contextAlias.suppliedPacket = null;
                  await context.markNextPacket();
                  if (elementaryStream.info.codec === "avc") {
                    if (!context.suppliedPacket) {
                      throw new Error("Invalid AVC video stream; could not extract AVCDecoderConfigurationRecord from any packet.");
                    }
                    elementaryStream.info.avcCodecInfo = extractAvcDecoderConfigurationRecord(context.suppliedPacket.data);
                    if (!elementaryStream.info.avcCodecInfo) {
                      continue;
                    }
                    const spsUnit = elementaryStream.info.avcCodecInfo.sequenceParameterSets[0];
                    assert(spsUnit);
                    const spsInfo = parseAvcSps(spsUnit);
                    elementaryStream.info.width = spsInfo.displayWidth;
                    elementaryStream.info.height = spsInfo.displayHeight;
                    const num = spsInfo.pixelAspectRatio.num;
                    const den = spsInfo.pixelAspectRatio.den;
                    if (num > 0 && den > 0) {
                      if (num > den) {
                        elementaryStream.info.squarePixelWidth = Math.round(elementaryStream.info.width * num / den);
                        elementaryStream.info.squarePixelHeight = elementaryStream.info.height;
                      } else {
                        elementaryStream.info.squarePixelWidth = elementaryStream.info.width;
                        elementaryStream.info.squarePixelHeight = Math.round(elementaryStream.info.height * den / num);
                      }
                    }
                    elementaryStream.info.colorSpace = {
                      primaries: COLOR_PRIMARIES_MAP_INVERSE[spsInfo.colourPrimaries],
                      transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[spsInfo.transferCharacteristics],
                      matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[spsInfo.matrixCoefficients],
                      fullRange: !!spsInfo.fullRangeFlag
                    };
                    elementaryStream.info.reorderSize = spsInfo.maxDecFrameBuffering;
                    break;
                  } else if (elementaryStream.info.codec === "hevc") {
                    if (!context.suppliedPacket) {
                      throw new Error("Invalid HEVC video stream; could not extract HVCDecoderConfigurationRecord from first packet.");
                    }
                    elementaryStream.info.hevcCodecInfo = extractHevcDecoderConfigurationRecord(context.suppliedPacket.data);
                    if (!elementaryStream.info.hevcCodecInfo) {
                      continue;
                    }
                    const spsArray = elementaryStream.info.hevcCodecInfo.arrays.find((a) => a.nalUnitType === HevcNalUnitType.SPS_NUT);
                    const spsUnit = spsArray.nalUnits[0];
                    assert(spsUnit);
                    const spsInfo = parseHevcSps(spsUnit);
                    elementaryStream.info.width = spsInfo.displayWidth;
                    elementaryStream.info.height = spsInfo.displayHeight;
                    if (spsInfo.pixelAspectRatio.num > spsInfo.pixelAspectRatio.den) {
                      elementaryStream.info.squarePixelWidth = Math.round(elementaryStream.info.width * spsInfo.pixelAspectRatio.num / spsInfo.pixelAspectRatio.den);
                      elementaryStream.info.squarePixelHeight = elementaryStream.info.height;
                    } else {
                      elementaryStream.info.squarePixelWidth = elementaryStream.info.width;
                      elementaryStream.info.squarePixelHeight = Math.round(elementaryStream.info.height * spsInfo.pixelAspectRatio.den / spsInfo.pixelAspectRatio.num);
                    }
                    elementaryStream.info.colorSpace = {
                      primaries: COLOR_PRIMARIES_MAP_INVERSE[spsInfo.colourPrimaries],
                      transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[spsInfo.transferCharacteristics],
                      matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[spsInfo.matrixCoefficients],
                      fullRange: !!spsInfo.fullRangeFlag
                    };
                    elementaryStream.info.reorderSize = spsInfo.maxDecFrameBuffering;
                    break;
                  } else {
                    throw new Error("Unhandled.");
                  }
                }
                elementaryStream.info.decoderConfig = {
                  codec: extractVideoCodecString({
                    width: elementaryStream.info.width,
                    height: elementaryStream.info.height,
                    codec: elementaryStream.info.codec,
                    codecDescription: null,
                    colorSpace: elementaryStream.info.colorSpace,
                    avcType: 1,
                    avcCodecInfo: elementaryStream.info.avcCodecInfo,
                    hevcCodecInfo: elementaryStream.info.hevcCodecInfo,
                    vp9CodecInfo: null,
                    av1CodecInfo: null,
                    proresFormat: null
                  }),
                  codedWidth: elementaryStream.info.width,
                  codedHeight: elementaryStream.info.height,
                  colorSpace: elementaryStream.info.colorSpace
                };
                if (elementaryStream.info.width !== elementaryStream.info.squarePixelWidth || elementaryStream.info.height !== elementaryStream.info.squarePixelHeight) {
                  elementaryStream.info.decoderConfig.displayAspectWidth = elementaryStream.info.squarePixelWidth;
                  elementaryStream.info.decoderConfig.displayAspectHeight = elementaryStream.info.squarePixelHeight;
                }
                elementaryStream.initialized = true;
              } else {
                await context.markNextPacket();
                if (!context.suppliedPacket) {
                  throw new Error(`Couldn't parse first media packet for Elementary Stream with PID ${elementaryStream.pid}`);
                }
                if (elementaryStream.info.codec === "aac") {
                  const slice = FileSlice.tempFromBytes(context.suppliedPacket.data);
                  const header = readAdtsFrameHeader(slice);
                  if (!header) {
                    throw new Error("Invalid AAC audio stream; could not read ADTS frame header from first packet.");
                  }
                  elementaryStream.info.aacCodecInfo = {
                    isMpeg2: false,
                    objectType: header.objectType
                  };
                  elementaryStream.info.numberOfChannels = aacChannelMap[header.channelConfiguration];
                  elementaryStream.info.sampleRate = aacFrequencyTable[header.samplingFrequencyIndex];
                } else if (elementaryStream.info.codec === "mp3") {
                  const word = readU32Be(FileSlice.tempFromBytes(context.suppliedPacket.data));
                  const result = readMp3FrameHeader(word, context.suppliedPacket.data.byteLength);
                  if (!result.header) {
                    throw new Error("Invalid MP3 audio stream; could not read frame header from first packet.");
                  }
                  elementaryStream.info.numberOfChannels = getMp3ChannelCount(result.header.channel);
                  elementaryStream.info.sampleRate = result.header.sampleRate;
                } else if (elementaryStream.info.codec === "ac3") {
                  const frameInfo = parseAc3SyncFrame(context.suppliedPacket.data);
                  if (!frameInfo) {
                    throw new Error("Invalid AC-3 audio stream; could not read sync frame from first packet.");
                  }
                  if (frameInfo.fscod === 3) {
                    throw new Error("Invalid AC-3 audio stream; reserved sample rate code found in first packet.");
                  }
                  elementaryStream.info.numberOfChannels = AC3_ACMOD_CHANNEL_COUNTS[frameInfo.acmod] + frameInfo.lfeon;
                  elementaryStream.info.sampleRate = AC3_SAMPLE_RATES[frameInfo.fscod];
                } else if (elementaryStream.info.codec === "eac3") {
                  const frameInfo = parseEac3SyncFrame(context.suppliedPacket.data);
                  if (!frameInfo) {
                    throw new Error("Invalid E-AC-3 audio stream; could not read sync frame from first packet.");
                  }
                  const sampleRate = getEac3SampleRate(frameInfo);
                  if (sampleRate === null) {
                    throw new Error("Invalid E-AC-3 audio stream; reserved sample rate code found in first packet.");
                  }
                  elementaryStream.info.numberOfChannels = getEac3ChannelCount(frameInfo);
                  elementaryStream.info.sampleRate = sampleRate;
                } else {
                  throw new Error("Unhandled.");
                }
                elementaryStream.info.decoderConfig = {
                  codec: extractAudioCodecString({
                    codec: elementaryStream.info.codec,
                    codecDescription: null,
                    aacCodecInfo: elementaryStream.info.aacCodecInfo
                  }),
                  numberOfChannels: elementaryStream.info.numberOfChannels,
                  sampleRate: elementaryStream.info.sampleRate
                };
                elementaryStream.initialized = true;
              }
            }
          }
          const isDone = hasProgramMap && this.elementaryStreams.every((x) => x.initialized);
          if (isDone) {
            break;
          }
          currentPos += this.packetStride;
        }
        if (!hasProgramMap) {
          if (!hasProgramAssociationTable) {
            throw new Error("No Program Association Table found in the file.");
          }
          throw new Error("No Program Map Table found in the file.");
        }
        for (const stream of this.elementaryStreams) {
          if (stream.info.type === "video") {
            this.trackBackingEntries.push(new MpegTsVideoTrackBacking(stream));
          } else {
            this.trackBackingEntries.push(new MpegTsAudioTrackBacking(stream));
          }
        }
      })();
    }
    async getTrackBackings() {
      await this.readMetadata();
      return this.trackBackingEntries;
    }
    async getMetadataTags() {
      return {};
    }
    async getMimeType() {
      await this.readMetadata();
      const codecStrings = await Promise.all(this.trackBackingEntries.map((x) => x.getDecoderConfig().then((c) => c?.codec ?? null)));
      return buildMpegTsMimeType(codecStrings);
    }
    async readSection(startPos, full, contiguous = false) {
      let endPos = startPos;
      let currentPos = startPos;
      const chunks = [];
      let chunksByteLength = 0;
      let firstPacket = null;
      let mustAddSectionEnd = true;
      let randomAccessIndicator = 0;
      while (true) {
        const packet = await this.readPacket(currentPos);
        currentPos += this.packetStride;
        if (!packet) {
          break;
        }
        if (!firstPacket) {
          if (packet.payloadUnitStartIndicator === 0) {
            break;
          }
          firstPacket = packet;
        } else {
          if (packet.pid !== firstPacket.pid) {
            if (contiguous) {
              break;
            } else {
              continue;
            }
          }
          if (packet.payloadUnitStartIndicator === 1) {
            break;
          }
        }
        const hasAdaptationField = !!(packet.adaptationFieldControl & 2);
        const hasPayload = !!(packet.adaptationFieldControl & 1);
        let adaptationFieldLength = 0;
        if (hasAdaptationField) {
          adaptationFieldLength = 1 + packet.body[0];
          if (packet === firstPacket && adaptationFieldLength > 1) {
            randomAccessIndicator = packet.body[1] >> 6 & 1;
          }
        }
        if (hasPayload) {
          if (adaptationFieldLength === 0) {
            chunks.push(packet.body);
            chunksByteLength += packet.body.byteLength;
          } else {
            chunks.push(packet.body.subarray(adaptationFieldLength));
            chunksByteLength += packet.body.byteLength - adaptationFieldLength;
          }
        }
        endPos = currentPos;
        if (!full && chunksByteLength >= 64) {
          mustAddSectionEnd = false;
          break;
        }
        const isKnownSectionEnd = binarySearchExact(this.sectionEndPositions, endPos, (x) => x) !== -1;
        if (isKnownSectionEnd) {
          mustAddSectionEnd = false;
          break;
        }
      }
      if (mustAddSectionEnd) {
        const index = binarySearchLessOrEqual(this.sectionEndPositions, endPos, (x) => x);
        this.sectionEndPositions.splice(index + 1, 0, endPos);
      }
      if (!firstPacket) {
        return null;
      }
      let merged;
      if (chunks.length === 1) {
        merged = chunks[0];
      } else {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
      }
      return {
        startPos,
        endPos: full ? endPos : null,
        pid: firstPacket.pid,
        payload: merged,
        randomAccessIndicator
      };
    }
    async readPacketHeader(pos) {
      let slice = this.reader.requestSlice(pos, 4);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice) {
        return null;
      }
      const syncByte = readU8(slice);
      if (syncByte !== 71) {
        throw new Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
      }
      const nextTwoBytes = readU16Be(slice);
      const transportErrorIndicator = nextTwoBytes >> 15;
      const payloadUnitStartIndicator = nextTwoBytes >> 14 & 1;
      const transportPriority = nextTwoBytes >> 13 & 1;
      const pid = nextTwoBytes & 8191;
      const nextByte = readU8(slice);
      const transportScramblingControl = nextByte >> 6;
      const adaptationFieldControl = nextByte >> 4 & 3;
      const continuityCounter = nextByte & 15;
      return {
        payloadUnitStartIndicator,
        pid,
        adaptationFieldControl
      };
    }
    async readPacket(pos) {
      let slice = this.reader.requestSlice(pos, TS_PACKET_SIZE);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice) {
        return null;
      }
      const bytes2 = readBytes(slice, TS_PACKET_SIZE);
      const syncByte = bytes2[0];
      if (syncByte !== 71) {
        throw new Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
      }
      const nextTwoBytes = (bytes2[1] << 8) + bytes2[2];
      const transportErrorIndicator = nextTwoBytes >> 15;
      const payloadUnitStartIndicator = nextTwoBytes >> 14 & 1;
      const transportPriority = nextTwoBytes >> 13 & 1;
      const pid = nextTwoBytes & 8191;
      const nextByte = bytes2[3];
      const transportScramblingControl = nextByte >> 6;
      const adaptationFieldControl = nextByte >> 4 & 3;
      const continuityCounter = nextByte & 15;
      return {
        payloadUnitStartIndicator,
        pid,
        adaptationFieldControl,
        body: bytes2.subarray(4)
      };
    }
  };
  var readPesPacketHeader = (section, expectPts) => {
    if (section.payload.byteLength < 3) {
      return null;
    }
    const bitstream = new Bitstream(section.payload);
    const startCodePrefix = bitstream.readBits(24);
    if (startCodePrefix !== 1) {
      return null;
    }
    const streamId = bitstream.readBits(8);
    bitstream.skipBits(16);
    if (streamId === 188 || streamId === 190 || streamId === 191 || streamId === 240 || streamId === 241 || streamId === 255 || streamId === 242 || streamId === 248) {
      return null;
    }
    bitstream.skipBits(8);
    const ptsDtsFlags = bitstream.readBits(2);
    bitstream.skipBits(14);
    let pts = null;
    if (ptsDtsFlags === 2 || ptsDtsFlags === 3) {
      pts = 0;
      bitstream.skipBits(4);
      pts += bitstream.readBits(3) * (1 << 30);
      bitstream.skipBits(1);
      pts += bitstream.readBits(15) * (1 << 15);
      bitstream.skipBits(1);
      pts += bitstream.readBits(15);
    } else {
      if (expectPts) {
        throw new Error(MISSING_PTS_ERROR_MESSAGE);
      }
    }
    return {
      sectionStartPos: section.startPos,
      sectionEndPos: section.endPos,
      pts,
      randomAccessIndicator: section.randomAccessIndicator
    };
  };
  var readPesPacket = (section, expectPts) => {
    assert(section.endPos !== null);
    const header = readPesPacketHeader(section, expectPts);
    if (!header) {
      return null;
    }
    const bitstream = new Bitstream(section.payload);
    bitstream.skipBits(32);
    const pesPacketLength = bitstream.readBits(16);
    const BYTES_UNTIL_END_OF_PES_PACKET_LENGTH = 6;
    bitstream.skipBits(16);
    const pesHeaderDataLength = bitstream.readBits(8);
    const pesHeaderEndPos = bitstream.pos + 8 * pesHeaderDataLength;
    bitstream.pos = pesHeaderEndPos;
    const bytePos = pesHeaderEndPos / 8;
    assert(Number.isInteger(bytePos));
    const data = section.payload.subarray(
      bytePos,
      // "A value of 0 indicates that the PES packet length is neither specified nor bounded and is allowed only in
      // PES packets whose payload consists of bytes from a video elementary stream contained in
      // transport stream packets."
      pesPacketLength > 0 ? BYTES_UNTIL_END_OF_PES_PACKET_LENGTH + pesPacketLength : section.payload.byteLength
    );
    return {
      ...header,
      data
    };
  };
  var MpegTsTrackBacking = class _MpegTsTrackBacking {
    constructor(elementaryStream) {
      this.elementaryStream = elementaryStream;
      this.packetBuffers = /* @__PURE__ */ new WeakMap();
      this.packetSectionStarts = /* @__PURE__ */ new WeakMap();
    }
    getId() {
      return this.elementaryStream.pid;
    }
    getNumber() {
      const demuxer = this.elementaryStream.demuxer;
      const trackType = this.elementaryStream.info.type;
      let number = 0;
      for (const backing of demuxer.trackBackingEntries) {
        if (backing.getType() === trackType) {
          number++;
        }
        assert(backing instanceof _MpegTsTrackBacking);
        if (backing.elementaryStream === this.elementaryStream) {
          break;
        }
      }
      return number;
    }
    getCodec() {
      throw new Error("Not implemented on base class.");
    }
    getInternalCodecId() {
      return this.elementaryStream.streamType;
    }
    getName() {
      return null;
    }
    getLanguageCode() {
      return UNDETERMINED_LANGUAGE;
    }
    getDisposition() {
      return {
        ...DEFAULT_TRACK_DISPOSITION,
        primary: false
      };
    }
    getTimeResolution() {
      return TIMESCALE;
    }
    isRelativeToUnixEpoch() {
      return false;
    }
    getUnixTimeForTimestamp() {
      return null;
    }
    getPairingMask() {
      return 1n;
    }
    getBitrate() {
      return null;
    }
    getAverageBitrate() {
      return null;
    }
    async getDurationFromMetadata() {
      return null;
    }
    async getLiveRefreshInterval() {
      return null;
    }
    createEncodedPacket(suppliedPacket, duration, options) {
      let packetType;
      if (this.allPacketsAreKeyPackets()) {
        packetType = "key";
      } else {
        packetType = suppliedPacket.randomAccessIndicator === 1 ? "key" : "delta";
      }
      return new EncodedPacket(options.metadataOnly ? PLACEHOLDER_DATA : suppliedPacket.data, packetType, suppliedPacket.pts / TIMESCALE, Math.max(duration / TIMESCALE, 0), suppliedPacket.sequenceNumber, suppliedPacket.data.byteLength);
    }
    async getFirstPacket(options) {
      const section = this.elementaryStream.firstSection;
      assert(section);
      const pesPacket = readPesPacket(section, true);
      assert(pesPacket);
      const context = new PacketReadingContext(this.elementaryStream, pesPacket);
      const buffer = new PacketBuffer(this, context);
      const result = await buffer.readNext();
      if (!result) {
        return null;
      }
      const packet = this.createEncodedPacket(result.packet, result.duration, options);
      this.packetBuffers.set(packet, buffer);
      this.packetSectionStarts.set(packet, result.packet.sectionStartPos);
      return packet;
    }
    async getNextPacket(packet, options) {
      let buffer = this.packetBuffers.get(packet);
      if (buffer) {
        const result = await buffer.readNext();
        if (!result) {
          return null;
        }
        this.packetBuffers.delete(packet);
        const newPacket = this.createEncodedPacket(result.packet, result.duration, options);
        this.packetBuffers.set(newPacket, buffer);
        this.packetSectionStarts.set(newPacket, result.packet.sectionStartPos);
        return newPacket;
      }
      const sectionStartPos = this.packetSectionStarts.get(packet);
      if (sectionStartPos === void 0) {
        throw new Error("Packet was not created from this track.");
      }
      const demuxer = this.elementaryStream.demuxer;
      const section = await demuxer.readSection(sectionStartPos, true);
      assert(section);
      const pesPacket = readPesPacket(section, true);
      assert(pesPacket);
      const context = new PacketReadingContext(this.elementaryStream, pesPacket);
      buffer = new PacketBuffer(this, context);
      const targetSequenceNumber = packet.sequenceNumber;
      while (true) {
        const result = await buffer.readNext();
        if (!result) {
          return null;
        }
        if (result.packet.sequenceNumber > targetSequenceNumber) {
          const newPacket = this.createEncodedPacket(result.packet, result.duration, options);
          this.packetBuffers.set(newPacket, buffer);
          this.packetSectionStarts.set(newPacket, result.packet.sectionStartPos);
          return newPacket;
        }
      }
    }
    async getNextKeyPacket(packet, options) {
      let currentPacket = packet;
      while (true) {
        currentPacket = await this.getNextPacket(currentPacket, options);
        if (!currentPacket) {
          return null;
        }
        if (currentPacket.type === "key") {
          return currentPacket;
        }
      }
    }
    getPacket(timestamp, options) {
      return this.doPacketLookup(timestamp, false, options);
    }
    getKeyPacket(timestamp, options) {
      return this.doPacketLookup(timestamp, true, options);
    }
    /**
     * Searches for the packet with the largest timestamp not larger than `timestamp` in the file, using a combination
     * of chunk-based binary search and linear refinement. The reason the coarse search is done in large chunks is to
     * make it more performant for small files and over high-latency readers such as the network.
     */
    async doPacketLookup(timestamp, keyframesOnly, options) {
      const searchPts = roundIfAlmostInteger(timestamp * TIMESCALE);
      const demuxer = this.elementaryStream.demuxer;
      const { reader, seekChunkSize } = demuxer;
      const pid = this.elementaryStream.pid;
      const findFirstPesPacketHeaderInChunk = async (startPos, endPos, readSectionInFull) => {
        let currentPos = startPos;
        while (currentPos < endPos) {
          const packetHeader = await demuxer.readPacketHeader(currentPos);
          if (!packetHeader) {
            return null;
          }
          if (packetHeader.pid === pid && packetHeader.payloadUnitStartIndicator === 1) {
            const section = await demuxer.readSection(currentPos, readSectionInFull);
            if (!section) {
              return null;
            }
            const pesPacketHeader = readPesPacketHeader(section, false);
            if (pesPacketHeader && pesPacketHeader.pts !== null) {
              return {
                pesPacketHeader,
                section
              };
            }
          }
          currentPos += demuxer.packetStride;
        }
        return null;
      };
      const firstSection = this.elementaryStream.firstSection;
      assert(firstSection);
      const firstPesPacketHeader = readPesPacketHeader(firstSection, true);
      assert(firstPesPacketHeader);
      if (searchPts < firstPesPacketHeader.pts) {
        return null;
      }
      let scanStartPos;
      const referencePesPackets = this.elementaryStream.referencePesPackets;
      const referencePointIndex = binarySearchLessOrEqual(referencePesPackets, searchPts, (x) => x.pts);
      const referencePoint = referencePointIndex !== -1 ? referencePesPackets[referencePointIndex] : null;
      if (referencePoint && searchPts - referencePoint.pts < TIMESCALE / 2) {
        scanStartPos = referencePoint.sectionStartPos;
      } else {
        let startChunkIndex = 0;
        if (reader.fileSize !== null) {
          const numChunks = Math.ceil(reader.fileSize / seekChunkSize);
          if (numChunks > 1) {
            let low = 0;
            let high = numChunks - 1;
            startChunkIndex = low;
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const chunkStartPos = floorToMultiple(mid * seekChunkSize, demuxer.packetStride) + firstPesPacketHeader.sectionStartPos;
              const chunkEndPos = chunkStartPos + seekChunkSize;
              const result2 = await findFirstPesPacketHeaderInChunk(chunkStartPos, chunkEndPos, false);
              if (!result2) {
                high = mid - 1;
                continue;
              }
              if (result2.pesPacketHeader.pts <= searchPts) {
                startChunkIndex = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
          }
        }
        scanStartPos = floorToMultiple(startChunkIndex * seekChunkSize, demuxer.packetStride) + firstPesPacketHeader.sectionStartPos;
      }
      const result = await findFirstPesPacketHeaderInChunk(scanStartPos, reader.fileSize ?? Infinity, false);
      let currentPesHeader = result?.pesPacketHeader ?? null;
      if (!currentPesHeader) {
        currentPesHeader = firstPesPacketHeader;
      }
      const reorderSize = this.getReorderSize();
      const retrieveEncodedPacket = async (sectionStartPos, predicate) => {
        const section = await demuxer.readSection(sectionStartPos, true);
        assert(section);
        const pesPacket = readPesPacket(section, true);
        assert(pesPacket);
        const context = new PacketReadingContext(this.elementaryStream, pesPacket);
        const buffer = new PacketBuffer(this, context);
        while (true) {
          const topPts = last(buffer.presentationOrderPackets)?.pts ?? -Infinity;
          if (topPts >= searchPts) {
            break;
          }
          const didRead = await buffer.readNextPacket();
          if (!didRead) {
            break;
          }
        }
        const targetIndex = findLastIndex(buffer.presentationOrderPackets, predicate);
        if (targetIndex === -1) {
          return null;
        }
        const targetPacket = buffer.presentationOrderPackets[targetIndex];
        const lastDuration = targetIndex === 0 ? 0 : targetPacket.pts - buffer.presentationOrderPackets[targetIndex - 1].pts;
        while (buffer.decodeOrderPackets[0] !== targetPacket) {
          buffer.decodeOrderPackets.shift();
        }
        buffer.lastDuration = lastDuration;
        const result2 = await buffer.readNext();
        assert(result2);
        const packet = this.createEncodedPacket(result2.packet, result2.duration, options);
        this.packetBuffers.set(packet, buffer);
        this.packetSectionStarts.set(packet, result2.packet.sectionStartPos);
        return packet;
      };
      if (!keyframesOnly || this.allPacketsAreKeyPackets()) {
        outer: while (true) {
          let currentPos = currentPesHeader.sectionStartPos + demuxer.packetStride;
          while (true) {
            const packetHeader = await demuxer.readPacketHeader(currentPos);
            if (!packetHeader) {
              break outer;
            }
            if (packetHeader.pid === pid && packetHeader.payloadUnitStartIndicator === 1) {
              const section = await demuxer.readSection(currentPos, false);
              if (section) {
                const nextPesHeader = readPesPacketHeader(section, false);
                if (nextPesHeader && nextPesHeader.pts !== null) {
                  if (nextPesHeader.pts > searchPts) {
                    break outer;
                  }
                  currentPesHeader = nextPesHeader;
                  maybeInsertReferencePacket(this.elementaryStream, currentPesHeader);
                  break;
                }
              }
            }
            currentPos += demuxer.packetStride;
          }
        }
        outer: for (let i = 0; i < reorderSize + 1; i++) {
          let pos = currentPesHeader.sectionStartPos - demuxer.packetStride;
          while (pos >= demuxer.packetOffset) {
            const packetHeader = await demuxer.readPacketHeader(pos);
            if (!packetHeader) {
              break outer;
            }
            if (packetHeader.pid === pid && packetHeader.payloadUnitStartIndicator === 1) {
              const section = await demuxer.readSection(pos, false);
              if (section) {
                const header = readPesPacketHeader(section, false);
                if (header && header.pts !== null) {
                  currentPesHeader = header;
                  break;
                }
              }
            }
            pos -= demuxer.packetStride;
          }
        }
        return retrieveEncodedPacket(currentPesHeader.sectionStartPos, (p) => p.pts <= searchPts);
      } else {
        let currentChunkStartPos = scanStartPos;
        let nextChunkStartPos = null;
        const readSectionsInFull = !this.elementaryStream.canBeTrustedWithKeyPackets;
        while (true) {
          let bestKeyPesHeader = null;
          const isFirstChunk = currentChunkStartPos <= firstPesPacketHeader.sectionStartPos;
          let pesHeader;
          let pesHeaderSection = null;
          if (isFirstChunk) {
            pesHeader = firstPesPacketHeader;
            pesHeaderSection = firstSection;
          } else {
            const result2 = await findFirstPesPacketHeaderInChunk(currentChunkStartPos, reader.fileSize ?? Infinity, readSectionsInFull);
            pesHeader = result2?.pesPacketHeader ?? null;
            pesHeaderSection = result2?.section ?? null;
          }
          let passedSearchPts = false;
          let lookaheadCount = 0;
          outer: while (pesHeader) {
            if (nextChunkStartPos !== null && pesHeader.sectionStartPos >= nextChunkStartPos) {
              break;
            }
            if (pesHeader.pts <= searchPts) {
              let isKeyPacket;
              if (this.elementaryStream.canBeTrustedWithKeyPackets) {
                isKeyPacket = pesHeader.randomAccessIndicator === 1;
              } else {
                assert(pesHeaderSection);
                const pesPacket = readPesPacket(pesHeaderSection, true);
                assert(pesPacket);
                const context = new PacketReadingContext(this.elementaryStream, pesPacket);
                await context.markNextPacket();
                isKeyPacket = context.suppliedPacket?.randomAccessIndicator === 1;
              }
              if (isKeyPacket) {
                bestKeyPesHeader = pesHeader;
              }
            }
            if (pesHeader.pts > searchPts) {
              passedSearchPts = true;
            }
            if (passedSearchPts) {
              lookaheadCount++;
              if (lookaheadCount > reorderSize) {
                break;
              }
            }
            let currentPos = pesHeader.sectionStartPos + demuxer.packetStride;
            while (true) {
              const packetHeader = await demuxer.readPacketHeader(currentPos);
              if (!packetHeader) {
                break outer;
              }
              if (packetHeader.pid === pid && packetHeader.payloadUnitStartIndicator === 1) {
                const section = await demuxer.readSection(currentPos, readSectionsInFull);
                if (section) {
                  const nextPesHeader = readPesPacketHeader(section, false);
                  if (nextPesHeader && nextPesHeader.pts !== null) {
                    pesHeader = nextPesHeader;
                    pesHeaderSection = section;
                    maybeInsertReferencePacket(this.elementaryStream, pesHeader);
                    break;
                  }
                }
              }
              currentPos += demuxer.packetStride;
            }
          }
          if (bestKeyPesHeader) {
            let startPesHeader = bestKeyPesHeader;
            if (lookaheadCount === 0) {
              outer: for (let i = 0; i < reorderSize; i++) {
                let pos = startPesHeader.sectionStartPos - demuxer.packetStride;
                while (pos >= demuxer.packetOffset) {
                  const packetHeader = await demuxer.readPacketHeader(pos);
                  if (!packetHeader) {
                    break outer;
                  }
                  if (packetHeader.pid === pid && packetHeader.payloadUnitStartIndicator === 1) {
                    const section = await demuxer.readSection(pos, readSectionsInFull);
                    if (section) {
                      const header = readPesPacketHeader(section, false);
                      if (header && header.pts !== null) {
                        startPesHeader = header;
                        break;
                      }
                    }
                  }
                  pos -= demuxer.packetStride;
                }
              }
            }
            const encodedPacket = await retrieveEncodedPacket(startPesHeader.sectionStartPos, (p) => p.pts <= searchPts && p.randomAccessIndicator === 1);
            assert(encodedPacket);
            return encodedPacket;
          }
          if (isFirstChunk) {
            return null;
          }
          nextChunkStartPos = currentChunkStartPos;
          currentChunkStartPos = Math.max(floorToMultiple(currentChunkStartPos - firstPesPacketHeader.sectionStartPos - seekChunkSize, demuxer.packetStride) + firstPesPacketHeader.sectionStartPos, firstPesPacketHeader.sectionStartPos);
        }
      }
    }
  };
  var MpegTsVideoTrackBacking = class extends MpegTsTrackBacking {
    getType() {
      return "video";
    }
    getCodec() {
      return this.elementaryStream.info.codec;
    }
    getCodedWidth() {
      return this.elementaryStream.info.width;
    }
    getCodedHeight() {
      return this.elementaryStream.info.height;
    }
    getSquarePixelWidth() {
      return this.elementaryStream.info.squarePixelWidth;
    }
    getSquarePixelHeight() {
      return this.elementaryStream.info.squarePixelHeight;
    }
    getRotation() {
      return 0;
    }
    async getColorSpace() {
      return this.elementaryStream.info.colorSpace;
    }
    async canBeTransparent() {
      return false;
    }
    async getDecoderConfig() {
      assert(this.elementaryStream.info.decoderConfig);
      return this.elementaryStream.info.decoderConfig;
    }
    allPacketsAreKeyPackets() {
      return false;
    }
    getReorderSize() {
      return this.elementaryStream.info.reorderSize;
    }
  };
  var MpegTsAudioTrackBacking = class extends MpegTsTrackBacking {
    getType() {
      return "audio";
    }
    getCodec() {
      return this.elementaryStream.info.codec;
    }
    getNumberOfChannels() {
      return this.elementaryStream.info.numberOfChannels;
    }
    getSampleRate() {
      return this.elementaryStream.info.sampleRate;
    }
    async getDecoderConfig() {
      assert(this.elementaryStream.info.decoderConfig);
      return this.elementaryStream.info.decoderConfig;
    }
    allPacketsAreKeyPackets() {
      return true;
    }
    getReorderSize() {
      return 0;
    }
  };
  var maybeInsertReferencePacket = (elementaryStream, pesPacketHeader) => {
    const referencePesPackets = elementaryStream.referencePesPackets;
    const index = binarySearchLessOrEqual(referencePesPackets, pesPacketHeader.sectionStartPos, (x) => x.sectionStartPos);
    if (index >= 0) {
      const entry = referencePesPackets[index];
      if (pesPacketHeader.pts <= entry.pts) {
        return false;
      }
      const minByteDistance = elementaryStream.demuxer.minReferencePointByteDistance;
      if (pesPacketHeader.sectionStartPos - entry.sectionStartPos < minByteDistance) {
        return false;
      }
      if (index < referencePesPackets.length - 1) {
        const nextEntry = referencePesPackets[index + 1];
        if (nextEntry.pts < pesPacketHeader.pts) {
          return false;
        }
        if (nextEntry.sectionStartPos - pesPacketHeader.sectionStartPos < minByteDistance) {
          return false;
        }
      }
    }
    referencePesPackets.splice(index + 1, 0, pesPacketHeader);
    return true;
  };
  var PacketReadingContext = class {
    constructor(elementaryStream, startingPesPacket) {
      this.currentPos = 0;
      this.pesPackets = [];
      this.currentPesPacketIndex = 0;
      this.currentPesPacketPos = 0;
      this.endPos = 0;
      this.lastSuppliedPesPacket = null;
      this.nextPts = null;
      this.suppliedPacket = null;
      this.elementaryStream = elementaryStream;
      this.pid = elementaryStream.pid;
      this.demuxer = elementaryStream.demuxer;
      this.startingPesPacket = startingPesPacket;
    }
    ensureBuffered(length) {
      const remaining = this.endPos - this.currentPos;
      if (remaining >= length) {
        return length;
      }
      return this.bufferData(length - remaining).then(() => Math.min(this.endPos - this.currentPos, length));
    }
    getCurrentPesPacket() {
      const packet = this.pesPackets[this.currentPesPacketIndex];
      assert(packet);
      return packet;
    }
    async bufferData(length) {
      const targetEndPos = this.endPos + length;
      while (this.endPos < targetEndPos) {
        let pesPacket;
        if (this.pesPackets.length === 0) {
          pesPacket = this.startingPesPacket;
        } else {
          let currentPos = last(this.pesPackets).sectionEndPos;
          assert(currentPos !== null);
          while (true) {
            const packetHeader = await this.demuxer.readPacketHeader(currentPos);
            if (!packetHeader) {
              return;
            }
            if (packetHeader.pid === this.pid) {
              const nextSection = await this.demuxer.readSection(currentPos, true);
              if (!nextSection) {
                return;
              }
              const nextPesPacket = readPesPacket(nextSection, false);
              if (nextPesPacket) {
                pesPacket = nextPesPacket;
                break;
              }
            }
            currentPos += this.demuxer.packetStride;
          }
        }
        this.pesPackets.push(pesPacket);
        this.endPos += pesPacket.data.byteLength;
      }
    }
    readBytes(length) {
      const currentPesPacket = this.getCurrentPesPacket();
      const relativeStartOffset = this.currentPos - this.currentPesPacketPos;
      const relativeEndOffset = relativeStartOffset + length;
      this.currentPos += length;
      if (relativeEndOffset <= currentPesPacket.data.byteLength) {
        return currentPesPacket.data.subarray(relativeStartOffset, relativeEndOffset);
      }
      const result = new Uint8Array(length);
      result.set(currentPesPacket.data.subarray(relativeStartOffset));
      let offset = currentPesPacket.data.byteLength - relativeStartOffset;
      while (true) {
        this.advanceCurrentPacket();
        const currentPesPacket2 = this.getCurrentPesPacket();
        const relativeEndOffset2 = length - offset;
        if (relativeEndOffset2 <= currentPesPacket2.data.byteLength) {
          result.set(currentPesPacket2.data.subarray(0, relativeEndOffset2), offset);
          break;
        }
        result.set(currentPesPacket2.data, offset);
        offset += currentPesPacket2.data.byteLength;
      }
      return result;
    }
    readU8() {
      let currentPesPacket = this.getCurrentPesPacket();
      const relativeOffset = this.currentPos - this.currentPesPacketPos;
      this.currentPos++;
      if (relativeOffset < currentPesPacket.data.byteLength) {
        return currentPesPacket.data[relativeOffset];
      }
      this.advanceCurrentPacket();
      currentPesPacket = this.getCurrentPesPacket();
      return currentPesPacket.data[0];
    }
    seekTo(pos) {
      if (pos === this.currentPos) {
        return;
      }
      if (pos < this.currentPos) {
        while (pos < this.currentPesPacketPos) {
          this.currentPesPacketIndex--;
          const currentPacket = this.getCurrentPesPacket();
          this.currentPesPacketPos -= currentPacket.data.byteLength;
        }
      } else {
        while (true) {
          const currentPesPacket = this.getCurrentPesPacket();
          const currentEndPos = this.currentPesPacketPos + currentPesPacket.data.byteLength;
          if (pos < currentEndPos) {
            break;
          }
          this.currentPesPacketPos += currentPesPacket.data.byteLength;
          this.currentPesPacketIndex++;
        }
      }
      this.currentPos = pos;
    }
    skip(n) {
      this.seekTo(this.currentPos + n);
    }
    advanceCurrentPacket() {
      this.currentPesPacketPos += this.getCurrentPesPacket().data.byteLength;
      this.currentPesPacketIndex++;
    }
    async markNextPacket() {
      assert(!this.suppliedPacket);
      const elementaryStream = this.elementaryStream;
      if (elementaryStream.info.type === "video") {
        const codec = elementaryStream.info.codec;
        const CHUNK_SIZE = 1024;
        if (codec !== "avc" && codec !== "hevc") {
          throw new Error("Unhandled.");
        }
        const nalHeaderSize = codec === "avc" ? 1 : 2;
        let packetStartPos = null;
        let frameStartFound = false;
        let lastFirstMacroblockInSlice = 0;
        while (true) {
          let remaining = this.ensureBuffered(CHUNK_SIZE);
          if (remaining instanceof Promise)
            remaining = await remaining;
          if (remaining === 0) {
            break;
          }
          const chunkStartPos = this.currentPos;
          const chunk = this.readBytes(remaining);
          const length = chunk.byteLength;
          let i = 0;
          while (i < length) {
            const zeroIndex = chunk.indexOf(0, i);
            if (zeroIndex === -1 || zeroIndex >= length) {
              break;
            }
            i = zeroIndex;
            const posBeforeZero = chunkStartPos + i;
            if (i + 3 >= length) {
              this.seekTo(posBeforeZero);
              break;
            }
            const b1 = chunk[i + 1];
            const b2 = chunk[i + 2];
            const b3 = chunk[i + 3];
            let startCodeLength = 0;
            if (b1 === 0 && b2 === 0 && b3 === 1) {
              startCodeLength = 4;
            } else if (b1 === 0 && b2 === 1) {
              startCodeLength = 3;
            }
            if (startCodeLength === 0) {
              i++;
              continue;
            }
            const startCodePos = posBeforeZero;
            packetStartPos ??= startCodePos;
            const nalHeaderStart = i + startCodeLength;
            const payloadStart = nalHeaderStart + nalHeaderSize;
            const AVC_SLICE_HEADER_PEEK_SIZE = 6;
            const bytesNeeded = payloadStart + (codec === "avc" ? AVC_SLICE_HEADER_PEEK_SIZE : 1);
            if (bytesNeeded > length) {
              this.seekTo(posBeforeZero);
              break;
            }
            const headerByte0 = chunk[nalHeaderStart];
            let nalUnitType;
            let isSlice;
            let isAccessUnitStart;
            if (codec === "avc") {
              nalUnitType = extractNalUnitTypeForAvc(headerByte0);
              isSlice = nalUnitType === AvcNalUnitType.NON_IDR_SLICE || nalUnitType === AvcNalUnitType.SLICE_DPA || nalUnitType === AvcNalUnitType.IDR;
              isAccessUnitStart = nalUnitType === AvcNalUnitType.SEI || nalUnitType === AvcNalUnitType.SPS || nalUnitType === AvcNalUnitType.PPS || nalUnitType === AvcNalUnitType.AUD;
            } else {
              nalUnitType = extractNalUnitTypeForHevc(headerByte0);
              const layerId = (headerByte0 & 1) << 5 | chunk[nalHeaderStart + 1] >> 3;
              if (layerId > 0) {
                i += startCodeLength;
                continue;
              }
              isSlice = nalUnitType <= HevcNalUnitType.RASL_R || nalUnitType >= HevcNalUnitType.BLA_W_LP && nalUnitType <= 21;
              isAccessUnitStart = nalUnitType >= HevcNalUnitType.VPS_NUT && nalUnitType <= 37 || nalUnitType === HevcNalUnitType.PREFIX_SEI_NUT || nalUnitType >= 41 && nalUnitType <= 44 || nalUnitType >= 48 && nalUnitType <= 55;
            }
            let isFrameBoundary = false;
            if (isSlice) {
              let startsNewPicture;
              if (codec === "avc") {
                const headerBytes = chunk.subarray(payloadStart, payloadStart + AVC_SLICE_HEADER_PEEK_SIZE);
                const firstMacroblockInSlice = readExpGolomb(new Bitstream(headerBytes));
                startsNewPicture = !frameStartFound || firstMacroblockInSlice <= lastFirstMacroblockInSlice;
                lastFirstMacroblockInSlice = firstMacroblockInSlice;
              } else {
                startsNewPicture = chunk[payloadStart] >> 7 === 1;
              }
              if (startsNewPicture) {
                if (frameStartFound) {
                  isFrameBoundary = true;
                } else {
                  frameStartFound = true;
                }
              }
            } else if (isAccessUnitStart && frameStartFound) {
              isFrameBoundary = true;
            }
            if (isFrameBoundary) {
              const packetLength = startCodePos - packetStartPos;
              this.seekTo(packetStartPos);
              return this.supplyPacket(packetLength, 0);
            }
            i += startCodeLength;
          }
          if (remaining < CHUNK_SIZE) {
            break;
          }
        }
        if (packetStartPos !== null && this.endPos > packetStartPos) {
          const packetLength = this.endPos - packetStartPos;
          this.seekTo(packetStartPos);
          return this.supplyPacket(packetLength, 0);
        }
      } else {
        const codec = elementaryStream.info.codec;
        const CHUNK_SIZE = 128;
        while (true) {
          let remaining = this.ensureBuffered(CHUNK_SIZE);
          if (remaining instanceof Promise)
            remaining = await remaining;
          const startPos = this.currentPos;
          while (this.currentPos - startPos < remaining) {
            const byte = this.readU8();
            if (codec === "aac") {
              if (byte !== 255) {
                continue;
              }
              this.skip(-1);
              const possibleHeaderStartPos = this.currentPos;
              let remaining2 = this.ensureBuffered(MAX_ADTS_FRAME_HEADER_SIZE);
              if (remaining2 instanceof Promise)
                remaining2 = await remaining2;
              if (remaining2 < MAX_ADTS_FRAME_HEADER_SIZE) {
                return;
              }
              const headerBytes = this.readBytes(MAX_ADTS_FRAME_HEADER_SIZE);
              const header = readAdtsFrameHeader(FileSlice.tempFromBytes(headerBytes));
              if (header) {
                this.seekTo(possibleHeaderStartPos);
                let remaining3 = this.ensureBuffered(header.frameLength);
                if (remaining3 instanceof Promise)
                  remaining3 = await remaining3;
                return this.supplyPacket(remaining3, Math.round(SAMPLES_PER_AAC_FRAME * TIMESCALE / elementaryStream.info.sampleRate));
              } else {
                this.seekTo(possibleHeaderStartPos + 1);
              }
            } else if (codec === "mp3") {
              if (byte !== 255) {
                continue;
              }
              this.skip(-1);
              const possibleHeaderStartPos = this.currentPos;
              let remaining2 = this.ensureBuffered(MP3_FRAME_HEADER_SIZE);
              if (remaining2 instanceof Promise)
                remaining2 = await remaining2;
              if (remaining2 < MP3_FRAME_HEADER_SIZE) {
                return;
              }
              const headerBytes = this.readBytes(MP3_FRAME_HEADER_SIZE);
              const word = toDataView(headerBytes).getUint32(0);
              const result = readMp3FrameHeader(word, null);
              if (result.header) {
                this.seekTo(possibleHeaderStartPos);
                let remaining3 = this.ensureBuffered(result.header.totalSize);
                if (remaining3 instanceof Promise)
                  remaining3 = await remaining3;
                const duration = result.header.audioSamplesInFrame * TIMESCALE / elementaryStream.info.sampleRate;
                return this.supplyPacket(remaining3, Math.round(duration));
              } else {
                this.seekTo(possibleHeaderStartPos + 1);
              }
            } else if (codec === "ac3") {
              if (byte !== 11) {
                continue;
              }
              this.skip(-1);
              const possibleSyncPos = this.currentPos;
              let remaining2 = this.ensureBuffered(5);
              if (remaining2 instanceof Promise)
                remaining2 = await remaining2;
              if (remaining2 < 5) {
                return;
              }
              const headerBytes = this.readBytes(5);
              if (headerBytes[0] !== 11 || headerBytes[1] !== 119) {
                this.seekTo(possibleSyncPos + 1);
                continue;
              }
              const fscod = headerBytes[4] >> 6;
              const frmsizecod = headerBytes[4] & 63;
              if (fscod === 3 || frmsizecod > 37) {
                this.seekTo(possibleSyncPos + 1);
                continue;
              }
              const frameSize = AC3_FRAME_SIZES[3 * frmsizecod + fscod];
              assert(frameSize !== void 0);
              this.seekTo(possibleSyncPos);
              remaining2 = this.ensureBuffered(frameSize);
              if (remaining2 instanceof Promise)
                remaining2 = await remaining2;
              const duration = Math.round(AC3_SAMPLES_PER_FRAME * TIMESCALE / elementaryStream.info.sampleRate);
              return this.supplyPacket(remaining2, duration);
            } else if (codec === "eac3") {
              if (byte !== 11) {
                continue;
              }
              this.skip(-1);
              const possibleSyncPos = this.currentPos;
              let remaining2 = this.ensureBuffered(5);
              if (remaining2 instanceof Promise)
                remaining2 = await remaining2;
              if (remaining2 < 5) {
                return;
              }
              const headerBytes = this.readBytes(5);
              if (headerBytes[0] !== 11 || headerBytes[1] !== 119) {
                this.seekTo(possibleSyncPos + 1);
                continue;
              }
              const frmsiz = (headerBytes[2] & 7) << 8 | headerBytes[3];
              const frameSize = (frmsiz + 1) * 2;
              const fscod = headerBytes[4] >> 6;
              const numblkscod = fscod === 3 ? 3 : headerBytes[4] >> 4 & 3;
              const numblks = EAC3_NUMBLKS_TABLE[numblkscod];
              this.seekTo(possibleSyncPos);
              remaining2 = this.ensureBuffered(frameSize);
              if (remaining2 instanceof Promise)
                remaining2 = await remaining2;
              const samplesPerFrame = numblks * 256;
              const duration = Math.round(samplesPerFrame * TIMESCALE / elementaryStream.info.sampleRate);
              return this.supplyPacket(remaining2, duration);
            } else {
              throw new Error("Unhandled.");
            }
          }
          if (remaining < CHUNK_SIZE) {
            break;
          }
        }
      }
    }
    /** Supplies the context with a new encoded packet, beginning at the current position. */
    supplyPacket(packetLength, intrinsicDuration) {
      const currentPesPacket = this.getCurrentPesPacket();
      let pts;
      if (this.lastSuppliedPesPacket === currentPesPacket) {
        assert(this.nextPts !== null);
        pts = this.nextPts;
      } else {
        if (currentPesPacket.pts === null) {
          throw new Error(MISSING_PTS_ERROR_MESSAGE);
        }
        pts = currentPesPacket.pts;
        maybeInsertReferencePacket(this.elementaryStream, currentPesPacket);
      }
      this.lastSuppliedPesPacket = currentPesPacket;
      this.nextPts = pts + intrinsicDuration;
      const sectionStartPos = currentPesPacket.sectionStartPos;
      const sequenceNumber = sectionStartPos + (this.currentPos - this.currentPesPacketPos);
      const data = this.readBytes(packetLength);
      let randomAccessIndicator = currentPesPacket.randomAccessIndicator;
      if (randomAccessIndicator === 0 && !this.elementaryStream.canBeTrustedWithKeyPackets) {
        if (this.elementaryStream.info.type === "audio") {
          randomAccessIndicator = 1;
        } else {
          if (this.elementaryStream.info.decoderConfig) {
            const isKey = determineVideoPacketType(this.elementaryStream.info.codec, this.elementaryStream.info.decoderConfig, data) === "key";
            randomAccessIndicator = Number(isKey);
          } else {
          }
        }
      }
      this.suppliedPacket = {
        pts,
        data,
        sequenceNumber,
        sectionStartPos,
        randomAccessIndicator
      };
      this.pesPackets.splice(0, this.currentPesPacketIndex);
      this.currentPesPacketIndex = 0;
    }
  };
  var PacketBuffer = class {
    constructor(backing, context) {
      this.decodeOrderPackets = [];
      this.reorderBuffer = [];
      this.presentationOrderPackets = [];
      this.reachedEnd = false;
      this.lastDuration = 0;
      this.backing = backing;
      this.context = context;
      this.reorderSize = backing.getReorderSize();
      assert(this.reorderSize >= 0);
    }
    async readNext() {
      if (this.decodeOrderPackets.length === 0) {
        const didRead = await this.readNextPacket();
        if (!didRead) {
          return null;
        }
      }
      await this.ensureCurrentPacketHasNext();
      const packet = this.decodeOrderPackets[0];
      const presentationIndex = this.presentationOrderPackets.indexOf(packet);
      assert(presentationIndex !== -1);
      let duration;
      if (presentationIndex === this.presentationOrderPackets.length - 1) {
        duration = this.lastDuration;
      } else {
        const nextPacket = this.presentationOrderPackets[presentationIndex + 1];
        duration = nextPacket.pts - packet.pts;
        this.lastDuration = duration;
      }
      this.decodeOrderPackets.shift();
      while (this.presentationOrderPackets.length > 0) {
        const first = this.presentationOrderPackets[0];
        if (this.decodeOrderPackets.includes(first)) {
          break;
        }
        this.presentationOrderPackets.shift();
      }
      return { packet, duration };
    }
    async readNextPacket() {
      if (this.reachedEnd) {
        return false;
      }
      let suppliedPacket;
      if (this.context.suppliedPacket) {
        suppliedPacket = this.context.suppliedPacket;
      } else {
        await this.context.markNextPacket();
        suppliedPacket = this.context.suppliedPacket;
      }
      this.context.suppliedPacket = null;
      if (!suppliedPacket) {
        this.reachedEnd = true;
        this.flushReorderBuffer();
        return false;
      }
      this.decodeOrderPackets.push(suppliedPacket);
      this.processPacketThroughReorderBuffer(suppliedPacket);
      return true;
    }
    async ensureCurrentPacketHasNext() {
      const current = this.decodeOrderPackets[0];
      assert(current);
      while (true) {
        const presentationIndex = this.presentationOrderPackets.indexOf(current);
        if (presentationIndex !== -1 && presentationIndex <= this.presentationOrderPackets.length - 2) {
          break;
        }
        const didRead = await this.readNextPacket();
        if (!didRead) {
          break;
        }
      }
    }
    processPacketThroughReorderBuffer(packet) {
      this.reorderBuffer.push(packet);
      if (this.reorderBuffer.length > this.reorderSize) {
        let minIndex = 0;
        for (let i = 1; i < this.reorderBuffer.length; i++) {
          if (this.reorderBuffer[i].pts < this.reorderBuffer[minIndex].pts) {
            minIndex = i;
          }
        }
        const packet2 = this.reorderBuffer[minIndex];
        this.presentationOrderPackets.push(packet2);
        this.reorderBuffer.splice(minIndex, 1);
      }
    }
    flushReorderBuffer() {
      this.reorderBuffer.sort((a, b) => a.pts - b.pts);
      this.presentationOrderPackets.push(...this.reorderBuffer);
      this.reorderBuffer.length = 0;
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/hls/hls-misc.js
  var HLS_MIME_TYPE = "application/vnd.apple.mpegurl";
  var TAG_STREAM_INF = "#EXT-X-STREAM-INF:";
  var TAG_I_FRAME_STREAM_INF = "#EXT-X-I-FRAME-STREAM-INF:";
  var TAG_MEDIA = "#EXT-X-MEDIA:";
  var TAG_EXTINF = "#EXTINF:";
  var TAG_MAP = "#EXT-X-MAP:";
  var TAG_KEY = "#EXT-X-KEY:";
  var TAG_MEDIA_SEQUENCE = "#EXT-X-MEDIA-SEQUENCE:";
  var TAG_BYTERANGE = "#EXT-X-BYTERANGE:";
  var TAG_PROGRAM_DATE_TIME = "#EXT-X-PROGRAM-DATE-TIME:";
  var TAG_DISCONTINUITY = "#EXT-X-DISCONTINUITY";
  var TAG_TARGETDURATION = "#EXT-X-TARGETDURATION:";
  var TAG_ENDLIST = "#EXT-X-ENDLIST";
  var TAG_PLAYLIST_TYPE = "#EXT-X-PLAYLIST-TYPE:";
  var TAG_I_FRAMES_ONLY = "#EXT-X-I-FRAMES-ONLY";
  var canIgnoreLine = (line) => line.length === 0 || line.startsWith("#") && !line.startsWith("#EXT");
  var AttributeList = class {
    constructor(str) {
      this._attributes = {};
      let key = "";
      let value = "";
      let inValue = false;
      let inQuotes = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "=" && !inValue && !inQuotes) {
          inValue = true;
        } else if (char === "," && !inQuotes) {
          if (key) {
            this._attributes[key.trim().toLowerCase()] = value;
          }
          key = "";
          value = "";
          inValue = false;
        } else if (inValue) {
          value += char;
        } else {
          key += char;
        }
      }
      if (key) {
        this._attributes[key.trim().toLowerCase()] = value;
      }
    }
    get(name) {
      return this._attributes[name.toLowerCase()] ?? null;
    }
    getAsNumber(name) {
      const value = this.get(name);
      if (value === null) {
        return null;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }
    merge(other) {
      Object.assign(this._attributes, other._attributes);
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/segmented-input.js
  var SegmentedInput = class {
    constructor(input, path, trackDeclarations) {
      this.nextInputCacheAge = 0;
      this.inputCache = [];
      this.trackBackingsPromise = null;
      this.firstSegment = null;
      this.firstSegmentFirstTimestamps = /* @__PURE__ */ new WeakMap();
      this.firstTimestampCache = /* @__PURE__ */ new WeakMap();
      this.input = input;
      this.path = path;
      this.trackDeclarations = trackDeclarations;
    }
    async getDurationFromMetadata(options) {
      const lastSegment = await this.getSegmentAt(Infinity, {
        skipLiveWait: options.skipLiveWait
      });
      if (!lastSegment) {
        return null;
      }
      return lastSegment.timestamp + lastSegment.duration;
    }
    async getUnixTimeForTimestamp(timestamp) {
      let segment = await this.getSegmentAt(timestamp, {});
      segment ??= await this.getFirstSegment({});
      if (!segment || segment.unixEpochTimestamp === null) {
        return null;
      }
      const elapsed = timestamp - segment.timestamp;
      return segment.unixEpochTimestamp + elapsed;
    }
    async getTrackBackings() {
      return this.trackBackingsPromise ??= (async () => {
        const backings = [];
        if (this.trackDeclarations) {
          for (const decl of this.trackDeclarations) {
            if (decl.type === "video") {
              const number = arrayCount(backings, (x) => x.getType() === "video") + 1;
              backings.push(new SegmentedInputInputVideoTrackBacking(this, decl, number));
            } else if (decl.type === "audio") {
              const number = arrayCount(backings, (x) => x.getType() === "audio") + 1;
              backings.push(new SegmentedInputInputAudioTrackBacking(this, decl, number));
            }
          }
        } else {
          this.firstSegment = await this.getFirstSegment({});
          if (!this.firstSegment) {
            return [];
          }
          const input = this.getInputForSegment(this.firstSegment);
          const inputTracks = await input.getTracks();
          for (const track of inputTracks) {
            if (track.type === "video") {
              const number = arrayCount(backings, (x) => x.getType() === "video") + 1;
              backings.push(new SegmentedInputInputVideoTrackBacking(this, {
                id: backings.length + 1,
                type: "video"
              }, number));
            } else if (track.type === "audio") {
              const number = arrayCount(backings, (x) => x.getType() === "audio") + 1;
              backings.push(new SegmentedInputInputAudioTrackBacking(this, {
                id: backings.length + 1,
                type: "audio"
              }, number));
            }
          }
        }
        return backings;
      })();
    }
    // This operation is done a lot and can be semi-expensive, so it's good to have a cache for it
    async getFirstTimestampForInput(input) {
      const existing = this.firstTimestampCache.get(input);
      if (existing !== void 0) {
        return existing;
      }
      const firstTimestamp = await input.getFirstTimestamp();
      this.firstTimestampCache.set(input, firstTimestamp);
      return firstTimestamp;
    }
    async getMediaOffset(segment, input) {
      const firstSegment = segment.firstSegment ?? segment;
      let firstSegmentFirstTimestamp;
      if (this.firstSegmentFirstTimestamps.has(firstSegment)) {
        firstSegmentFirstTimestamp = this.firstSegmentFirstTimestamps.get(firstSegment);
      } else {
        const firstInput = this.getInputForSegment(firstSegment);
        firstSegmentFirstTimestamp = await this.getFirstTimestampForInput(firstInput);
        this.firstSegmentFirstTimestamps.set(firstSegment, firstSegmentFirstTimestamp);
      }
      if (firstSegment === segment) {
        return firstSegment.timestamp - firstSegmentFirstTimestamp;
      }
      const segmentFirstTimestamp = await this.getFirstTimestampForInput(input);
      const segmentElapsed = segment.timestamp - firstSegment.timestamp;
      const inputElapsed = segmentFirstTimestamp - firstSegmentFirstTimestamp;
      const difference = inputElapsed - segmentElapsed;
      if (Math.abs(difference) <= Math.min(0.25, segmentElapsed)) {
        return firstSegment.timestamp - firstSegmentFirstTimestamp;
      } else {
        return segment.timestamp - segmentFirstTimestamp;
      }
    }
    dispose() {
      for (const entry of this.inputCache) {
        entry.input.dispose();
      }
      this.inputCache.length = 0;
    }
  };
  var SegmentedInputInputTrackBacking = class {
    constructor(segmentedInput, decl, number) {
      this.packetInfos = /* @__PURE__ */ new WeakMap();
      this.hydrationPromise = null;
      this.firstInputTrack = null;
      this.segmentedInput = segmentedInput;
      this.decl = decl;
      this.number = number;
    }
    hydrate() {
      return this.hydrationPromise ??= (async () => {
        this.segmentedInput.firstSegment ??= await this.segmentedInput.getFirstSegment({});
        if (!this.segmentedInput.firstSegment) {
          throw new Error("Missing first segment, can't retrieve track.");
        }
        const input = this.segmentedInput.getInputForSegment(this.segmentedInput.firstSegment);
        const inputTracks = await input.getTracks();
        const track = inputTracks.find((x) => x.type === this.decl.type && x.number === this.number);
        if (!track) {
          throw new Error("No matching track found in underlying media data.");
        }
        this.firstInputTrack = track;
      })();
    }
    getId() {
      return this.decl.id;
    }
    getType() {
      return this.decl.type;
    }
    getNumber() {
      return this.number;
    }
    /** If the backing track is already present, delegate synchronously; otherwise, hydrate first. */
    delegate(fn) {
      if (this.firstInputTrack) {
        return fn();
      }
      return this.hydrate().then(fn);
    }
    async getDecoderConfig() {
      return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
    }
    getHasOnlyKeyPackets() {
      return this.delegate(() => this.firstInputTrack._backing.getHasOnlyKeyPackets?.() ?? null);
    }
    getPairingMask() {
      return 1n;
    }
    getCodec() {
      return this.delegate(() => this.firstInputTrack._backing.getCodec());
    }
    getInternalCodecId() {
      return this.delegate(() => this.firstInputTrack._backing.getInternalCodecId());
    }
    getDisposition() {
      return this.delegate(() => this.firstInputTrack._backing.getDisposition());
    }
    getLanguageCode() {
      return this.delegate(() => this.firstInputTrack._backing.getLanguageCode());
    }
    getName() {
      return this.delegate(() => this.firstInputTrack._backing.getName());
    }
    getTimeResolution() {
      return this.delegate(() => this.firstInputTrack._backing.getTimeResolution());
    }
    async isRelativeToUnixEpoch() {
      await this.hydrate();
      assert(this.segmentedInput.firstSegment);
      return this.segmentedInput.firstSegment.unixEpochTimestamp === this.segmentedInput.firstSegment.timestamp;
    }
    getUnixTimeForTimestamp(timestamp) {
      return this.segmentedInput.getUnixTimeForTimestamp(timestamp);
    }
    getBitrate() {
      return this.delegate(() => this.firstInputTrack._backing.getBitrate());
    }
    getAverageBitrate() {
      return this.delegate(() => this.firstInputTrack._backing.getAverageBitrate());
    }
    getDurationFromMetadata(options) {
      return this.segmentedInput.getDurationFromMetadata(options);
    }
    getLiveRefreshInterval() {
      return this.segmentedInput.getLiveRefreshInterval();
    }
    async createAdjustedPacket(packet, segment, track) {
      assert(packet.sequenceNumber >= 0);
      assert(this.segmentedInput.firstSegment);
      const mediaOffset = await this.segmentedInput.getMediaOffset(segment, track.input);
      const segmentTimestampRelativeToFirst = segment.timestamp - this.segmentedInput.firstSegment.timestamp;
      const modified = packet.clone({
        timestamp: roundToDivisor(packet.timestamp + mediaOffset, await track.getTimeResolution()),
        // The 1e8 assumes a max of 100 MB per second, highly unlikely to be hit, so this should guarantee
        // monotonically increasing sequence numbers across segments.
        sequenceNumber: Math.floor(1e8 * segmentTimestampRelativeToFirst) + packet.sequenceNumber
      });
      this.packetInfos.set(modified, {
        segment,
        track,
        sourcePacket: packet
      });
      return modified;
    }
    async getFirstPacket(options) {
      await this.hydrate();
      assert(this.segmentedInput.firstSegment);
      assert(this.firstInputTrack);
      const packet = await this.firstInputTrack._backing.getFirstPacket(options);
      if (!packet) {
        return null;
      }
      return this.createAdjustedPacket(packet, this.segmentedInput.firstSegment, this.firstInputTrack);
    }
    getNextPacket(packet, options) {
      return this._getNextInternal(packet, options, false);
    }
    getNextKeyPacket(packet, options) {
      return this._getNextInternal(packet, options, true);
    }
    async _getNextInternal(packet, options, keyframesOnly) {
      const info = this.packetInfos.get(packet);
      if (!info) {
        throw new Error("Packet was not created from this track.");
      }
      const nextPacket = keyframesOnly ? await info.track._backing.getNextKeyPacket(info.sourcePacket, options) : await info.track._backing.getNextPacket(info.sourcePacket, options);
      if (nextPacket) {
        return this.createAdjustedPacket(nextPacket, info.segment, info.track);
      }
      let currentSegment = info.segment;
      while (true) {
        const nextSegment = await this.segmentedInput.getNextSegment(currentSegment, {
          skipLiveWait: options.skipLiveWait
        });
        if (!nextSegment) {
          return null;
        }
        const nextInput = this.segmentedInput.getInputForSegment(nextSegment);
        const nextTracks = await nextInput.getTracks();
        const nextTrack = nextTracks.find((t) => t.type === info.track.type && t.number === info.track.number);
        if (!nextTrack) {
          currentSegment = nextSegment;
          continue;
        }
        const firstPacket = await nextTrack._backing.getFirstPacket(options);
        if (!firstPacket) {
          return null;
        }
        return this.createAdjustedPacket(firstPacket, nextSegment, nextTrack);
      }
    }
    getPacket(timestamp, options) {
      return this._getPacketInternal(timestamp, options, false);
    }
    getKeyPacket(timestamp, options) {
      return this._getPacketInternal(timestamp, options, true);
    }
    async _getPacketInternal(timestamp, options, keyframesOnly) {
      let currentSegment = await this.segmentedInput.getSegmentAt(timestamp, {
        skipLiveWait: options.skipLiveWait
      });
      if (!currentSegment) {
        return null;
      }
      await this.hydrate();
      while (currentSegment) {
        const input = this.segmentedInput.getInputForSegment(currentSegment);
        const tracks = await input.getTracks();
        const track = tracks.find((t) => t.type === this.firstInputTrack.type && t.number === this.firstInputTrack.number);
        if (!track) {
          currentSegment = await this.segmentedInput.getPreviousSegment(currentSegment, {
            skipLiveWait: options.skipLiveWait
          });
          continue;
        }
        const mediaOffset = await this.segmentedInput.getMediaOffset(currentSegment, input);
        const offsetTimestamp = timestamp - mediaOffset;
        const packet = keyframesOnly ? await track._backing.getKeyPacket(offsetTimestamp, options) : await track._backing.getPacket(offsetTimestamp, options);
        if (!packet) {
          currentSegment = await this.segmentedInput.getPreviousSegment(currentSegment, {
            skipLiveWait: options.skipLiveWait
          });
          continue;
        }
        return this.createAdjustedPacket(packet, currentSegment, track);
      }
      return null;
    }
  };
  var SegmentedInputInputVideoTrackBacking = class extends SegmentedInputInputTrackBacking {
    getType() {
      return "video";
    }
    getCodec() {
      return this.delegate(() => this.firstInputTrack._backing.getCodec());
    }
    getCodedWidth() {
      return this.delegate(() => this.firstInputTrack._backing.getCodedWidth());
    }
    getCodedHeight() {
      return this.delegate(() => this.firstInputTrack._backing.getCodedHeight());
    }
    getSquarePixelWidth() {
      return this.delegate(() => this.firstInputTrack._backing.getSquarePixelWidth());
    }
    getSquarePixelHeight() {
      return this.delegate(() => this.firstInputTrack._backing.getSquarePixelHeight());
    }
    getRotation() {
      return this.delegate(() => this.firstInputTrack._backing.getRotation());
    }
    async getColorSpace() {
      return this.delegate(() => this.firstInputTrack._backing.getColorSpace());
    }
    async canBeTransparent() {
      return this.delegate(() => this.firstInputTrack._backing.canBeTransparent());
    }
    async getDecoderConfig() {
      return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
    }
  };
  var SegmentedInputInputAudioTrackBacking = class extends SegmentedInputInputTrackBacking {
    getType() {
      return "audio";
    }
    getCodec() {
      return this.delegate(() => this.firstInputTrack._backing.getCodec());
    }
    getNumberOfChannels() {
      return this.delegate(() => this.firstInputTrack._backing.getNumberOfChannels());
    }
    getSampleRate() {
      return this.delegate(() => this.firstInputTrack._backing.getSampleRate());
    }
    async getDecoderConfig() {
      return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/source.js
  polyfillSymbolDispose();
  var DEFAULT_MIN_READ_POSITION = 0;
  var DEFAULT_MAX_READ_POSITION = Infinity;
  var sourceFinalizationRegistry = null;
  if (typeof FinalizationRegistry !== "undefined") {
    sourceFinalizationRegistry = new FinalizationRegistry((cleanup) => {
      cleanup();
    });
  }
  var Source = class extends EventEmitter {
    constructor() {
      super();
      this._disposed = false;
      this._refCount = 0;
      this._usedForHls = false;
      this._refFinalizationRegistry = null;
      this._sizePromise = null;
      this.onread = null;
      if (typeof FinalizationRegistry !== "undefined") {
        this._refFinalizationRegistry = new FinalizationRegistry((source) => {
          source._decrementRefCount();
        });
      }
    }
    /**
     * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
     * will retrieve the size.
     *
     * Returns null if the source is unsized.
     */
    async getSizeOrNull() {
      if (this._disposed) {
        throw new InputDisposedError();
      }
      return this._sizePromise ??= (async () => {
        let size = this._getFileSize();
        if (size !== void 0) {
          return size;
        }
        await this._read(0, 1, DEFAULT_MIN_READ_POSITION, DEFAULT_MAX_READ_POSITION);
        size = this._getFileSize();
        assert(size !== void 0);
        return size;
      })();
    }
    /**
     * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
     * will retrieve the size.
     *
     * Throws an error if the source is unsized.
     */
    async getSize() {
      if (this._disposed) {
        throw new InputDisposedError();
      }
      const result = await this.getSizeOrNull();
      if (result === null) {
        throw new Error("Cannot determine the size of an unsized source.");
      }
      return result;
    }
    /**
     * Returns a new {@link RangedSource} that maps data onto this source using the given offset and length. If a length
     * is not provided, the ranged source spans until the end of this source's data.
     *
     * Useful for reading files that are embedded within larger files.
     */
    slice(offset, length) {
      if (!Number.isInteger(offset) || offset < 0) {
        throw new TypeError("offset must be a non-negative integer.");
      }
      if (length !== void 0 && (!Number.isInteger(length) || length < 0)) {
        throw new TypeError("length, when provided, must be a non-negative integer.");
      }
      return new RangedSource(this, offset, length);
    }
    /** @internal */
    _dispatchRead(start, end) {
      this.onread?.(start, end);
      this._emit("read", { start, end });
    }
    /**
     * Creates a new `SourceRef` pointing to this source. You are expected to call `.free()` on said `SourceRef` when
     * you're done with it.
     */
    ref() {
      return new SourceRef(this);
    }
    /** @internal */
    _incrementRefCount() {
      this._refCount++;
    }
    /** @internal */
    _decrementRefCount() {
      this._refCount--;
      if (this._refCount === 0) {
        this._dispose();
        this._disposed = true;
      }
    }
  };
  var SourceRef = class {
    /** @internal */
    constructor(source) {
      this._freed = false;
      if (source._disposed) {
        throw new Error("Cannot ref a disposed source.");
      }
      source._incrementRefCount();
      source._refFinalizationRegistry?.register(this, source, this);
      this._source = source;
    }
    /** The {@link Source} this ref references. Accessing this field throws an error after having freed the ref. */
    get source() {
      if (!this._source) {
        throw new Error("Can't get source; ref has already been freed.");
      }
      return this._source;
    }
    /** Whether or not this reference has been freed via {@link SourceRef.free}. */
    get freed() {
      return this._freed;
    }
    /**
     * Frees the ref, decrementing the source's internal reference count. If the source's internal reference count
     * reaches zero, it gets disposed. To catch bugs, this method throws if the ref is already freed.
     */
    free() {
      if (this._freed) {
        throw new Error("Illegal operation: double free on SourceRef.");
      }
      const source = this.source;
      assert(source._refCount > 0);
      source._decrementRefCount();
      source._refFinalizationRegistry?.unregister(this);
      this._freed = true;
      this._source = null;
    }
    /**
     * Calls {@link SourceRef.free}.
     */
    [Symbol.dispose]() {
      if (!this.freed) {
        this.free();
      }
    }
  };
  var PathedSource = class extends Source {
    constructor(rootPath, requestHandler) {
      if (typeof rootPath !== "string") {
        throw new TypeError("rootPath must be a string.");
      }
      if (typeof requestHandler !== "function") {
        throw new TypeError("requestHandler must be a function.");
      }
      super();
      this.rootPath = rootPath;
      this.requestHandler = requestHandler;
    }
    /** @internal */
    _resolveRequest(request) {
      const result = this.requestHandler(request);
      const handle = (result2) => {
        if (!(result2 instanceof Source || result2 instanceof SourceRef)) {
          throw new TypeError("requestHandler must return or resolve to a Source or SourceRef.");
        }
        const ref = result2 instanceof Source ? result2.ref() : result2;
        ref.source._usedForHls ||= this._usedForHls;
        return ref;
      };
      if (result instanceof Promise) {
        return result.then(handle);
      } else {
        return handle(result);
      }
    }
  };
  var sourceRequestsAreEqual = (a, b) => {
    return a.path === b.path;
  };
  var CustomPathedSource = class extends PathedSource {
    constructor() {
      super(...arguments);
      this._root = null;
      this._rootRequest = null;
    }
    /** @internal */
    _read(start, end, minReadPosition, maxReadPosition) {
      if (!this._root) {
        if (!this._rootRequest) {
          const result = this._resolveRequest({ path: this.rootPath, isRoot: true });
          const handle = (result2) => {
            const ref = result2 instanceof Source ? result2.ref() : result2;
            this._root = ref;
            this._rootRequest = null;
            return ref;
          };
          if (result instanceof Promise) {
            this._rootRequest = result.then(handle);
          } else {
            handle(result);
            assert(this._root);
          }
        }
        if (this._rootRequest) {
          return this._rootRequest.then((ref) => ref.source._read(start, end, minReadPosition, maxReadPosition));
        }
      }
      return this._root.source._read(start, end, minReadPosition, maxReadPosition);
    }
    /** @internal */
    _getFileSize() {
      if (this._root) {
        return this._root.source._getFileSize();
      }
      return void 0;
    }
    /** @internal */
    _dispose() {
      if (this._root) {
        this._root.free();
      } else if (this._rootRequest) {
        void this._rootRequest.then((ref) => ref.free());
      }
    }
  };
  var URL_SOURCE_MIN_LOAD_AMOUNT = 0.5 * 2 ** 20;
  var DEFAULT_RETRY_DELAY = (previousAttempts, error, src) => {
    const couldBeCorsError = error instanceof Error && (error.message.includes("Failed to fetch") || error.message.includes("Load failed") || error.message.includes("NetworkError when attempting to fetch resource")) && typeof window !== "undefined";
    if (couldBeCorsError) {
      let originOfSrc = null;
      try {
        if (typeof window !== "undefined" && typeof window.location !== "undefined") {
          originOfSrc = new URL(src instanceof Request ? src.url : src, window.location.href).origin;
        }
      } catch {
      }
      const isOnline = typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : true;
      if (isOnline && originOfSrc !== null && originOfSrc !== window.location.origin) {
        Logging._warn(`Request will not be retried because a CORS error was suspected due to different origins. You can modify this behavior by providing your own function for the 'getRetryDelay' option.`);
        return null;
      }
    }
    return Math.min(2 ** (previousAttempts - 2), 16);
  };
  var warnedOrigins = /* @__PURE__ */ new Set();
  var UrlSource = class _UrlSource extends PathedSource {
    /**
     * Creates a new {@link UrlSource} backed by the resource at the specified URL.
     *
     * When passing a `Request` instance, note that its `signal` will be overridden by Mediabunny; if you want to cancel
     * ongoing requests, use {@link Input.dispose}.
     */
    constructor(url2, options = {}) {
      if (typeof url2 !== "string" && !(url2 instanceof URL) && !(typeof Request !== "undefined" && url2 instanceof Request)) {
        throw new TypeError("url must be a string, URL or Request.");
      }
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (options.requestInit !== void 0 && (!options.requestInit || typeof options.requestInit !== "object")) {
        throw new TypeError("options.requestInit, when provided, must be an object.");
      }
      if (options.getRetryDelay !== void 0 && typeof options.getRetryDelay !== "function") {
        throw new TypeError("options.getRetryDelay, when provided, must be a function.");
      }
      if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
        throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
      }
      if (options.parallelism !== void 0 && (!Number.isInteger(options.parallelism) || options.parallelism < 1)) {
        throw new TypeError("options.parallelism, when provided, must be a positive number.");
      }
      if (options.fetchFn !== void 0 && typeof options.fetchFn !== "function") {
        throw new TypeError("options.fetchFn, when provided, must be a function.");
      }
      const urlString = url2 instanceof Request ? url2.url : url2 instanceof URL ? url2.href : url2;
      super(urlString, (request) => new _UrlSource(request.path, this._options));
      this._offset = 0;
      this._length = null;
      this._fileSizeDetermined = false;
      this._url = url2;
      this._options = options;
      this._getRetryDelay = options.getRetryDelay ?? DEFAULT_RETRY_DELAY;
      this._requestInit = { ...options.requestInit };
      let rangeHeaderValue = null;
      if (options.requestInit?.headers) {
        const headers = { ...normalizeHeaders(options.requestInit.headers) };
        const rangeKey = Object.keys(headers).find((key) => key.toLowerCase() === "range");
        if (rangeKey !== void 0) {
          rangeHeaderValue = headers[rangeKey];
          delete headers[rangeKey];
          this._requestInit.headers = headers;
        }
      }
      if (url2 instanceof Request) {
        const requestRange = url2.headers.get("Range");
        if (requestRange !== null) {
          rangeHeaderValue ??= requestRange;
          const strippedRequest = new Request(url2);
          strippedRequest.headers.delete("Range");
          this._url = strippedRequest;
        }
      }
      if (rangeHeaderValue !== null) {
        const parsed = parseByteRangeHeader(rangeHeaderValue);
        if (parsed) {
          this._offset = parsed.offset;
          this._length = parsed.length;
        }
      }
      const DEFAULT_PARALLELISM = 2;
      this._orchestrator = new ReadOrchestrator({
        maxCacheSize: options.maxCacheSize ?? 64 * 2 ** 20,
        maxWorkerCount: options.parallelism ?? DEFAULT_PARALLELISM,
        runWorker: this._runWorker.bind(this),
        prefetchProfile: PREFETCH_PROFILES.network
      });
    }
    /** @internal */
    _getFileSize() {
      if (!this._fileSizeDetermined) {
        return this._length !== null ? this._length : void 0;
      }
      const baseSize = this._orchestrator.fileSize;
      if (baseSize === null) {
        return this._length !== null ? this._length : null;
      }
      return clamp(baseSize - this._offset, 0, this._length ?? Infinity);
    }
    /** @internal */
    _read(start, end, minReadPosition, maxReadPosition) {
      if (this._length !== null && end > this._length) {
        return null;
      }
      const offset = this._offset;
      const result = this._orchestrator.read(offset + start, offset + end, Math.max(offset + minReadPosition, offset), offset + Math.min(maxReadPosition, this._length ?? Infinity));
      const processResult = (result2) => {
        if (!result2) {
          return null;
        }
        result2.offset -= this._offset;
        return result2;
      };
      if (result instanceof Promise) {
        return result.then(processResult);
      } else {
        return processResult(result);
      }
    }
    /** @internal */
    async _runWorker(worker) {
      while (true) {
        const abortController = new AbortController();
        const response = await retriedFetch(this._options.fetchFn ?? fetch, this._url, mergeRequestInit(this._requestInit, {
          headers: {
            // Always sending a range request is a good way to probe if the server supports them
            Range: `bytes=${worker.currentPos}-`
          },
          signal: abortController.signal
        }), this._getRetryDelay, () => this._disposed);
        if (!response.ok) {
          throw new Error(`Error fetching ${String(this._url)}: ${response.status} ${response.statusText}`);
        }
        if (response.redirected) {
          this.rootPath = response.url;
        }
        outer: if (this._orchestrator.fileSize === null) {
          const contentRange = response.headers.get("Content-Range");
          if (contentRange) {
            const match = /\/(\d+)/.exec(contentRange);
            if (match) {
              this._orchestrator.supplyFileSize(Number(match[1]));
              break outer;
            }
          }
          const contentLength = response.headers.get("Content-Length");
          if (contentLength) {
            this._orchestrator.supplyFileSize(worker.currentPos + Number(contentLength));
          }
        }
        this._fileSizeDetermined = true;
        if (response.status !== 206) {
          if (!this._usedForHls) {
            const url2 = new URL(this._url instanceof Request ? this._url.url : this._url, typeof window !== "undefined" ? window.location.href : void 0);
            if (url2.origin !== "null" && !(url2.pathname.endsWith(".m3u8") || url2.pathname.endsWith(".m3u"))) {
              if (!warnedOrigins.has(url2.origin)) {
                Logging._warn(`HTTP server (origin ${url2.origin}) did not respond to a range request with 206 Partial Content, meaning the entire resource will now be downloaded. To enable efficient media file streaming across a network, please make sure your server supports range requests.`);
                warnedOrigins.add(url2.origin);
              }
            }
          }
          worker.currentPos = 0;
          this._orchestrator.options.maxCacheSize = Infinity;
          if (this._orchestrator.fileSize !== null) {
            worker.targetPos = this._orchestrator.fileSize;
          } else {
            worker.targetPos = Infinity;
            worker.strictTarget = false;
          }
          this._orchestrator.consolidateEverythingIntoOneWorker(worker);
        }
        if (!response.body) {
          throw new Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");
        }
        const reader = response.body.getReader();
        while (true) {
          if (worker.currentPos >= worker.targetPos || worker.aborted) {
            abortController.abort();
            this._orchestrator.signalWorkerStoppedRunning(worker);
            return;
          }
          let readResult;
          try {
            readResult = await reader.read();
          } catch (error) {
            if (this._disposed) {
              throw error;
            }
            const retryDelayInSeconds = this._getRetryDelay(1, error, this._url);
            if (retryDelayInSeconds !== null) {
              Logging._error("Error while reading response stream. Attempting to resume.", error);
              await wait(1e3 * retryDelayInSeconds);
              break;
            } else {
              throw error;
            }
          }
          if (worker.aborted) {
            continue;
          }
          const { done, value } = readResult;
          if (done) {
            if (worker.currentPos >= worker.targetPos) {
              this._orchestrator.onWorkerFinished(worker);
              return;
            }
            if (worker.strictTarget) {
              break;
            } else {
              this._orchestrator.onWorkerFinished(worker);
              return;
            }
          }
          this._dispatchRead(worker.currentPos, worker.currentPos + value.length);
          this._orchestrator.supplyWorkerData(worker, value);
        }
      }
    }
    /** @internal */
    _dispose() {
      this._orchestrator.dispose();
    }
  };
  var BYTE_RANGE_REGEX = /^bytes=(\d+)-(\d*)$/;
  var parseByteRangeHeader = (value) => {
    const match = BYTE_RANGE_REGEX.exec(value.trim());
    if (!match) {
      return null;
    }
    const offset = Number(match[1]);
    const end = match[2] === "" ? null : Number(match[2]);
    if (end !== null && end < offset) {
      return null;
    }
    return {
      offset,
      length: end !== null ? end - offset + 1 : null
    };
  };
  var ReadableStreamSource = class extends Source {
    /** Creates a new {@link ReadableStreamSource} backed by the specified `ReadableStream<Uint8Array>`. */
    constructor(stream, options = {}) {
      if (!(stream instanceof ReadableStream)) {
        throw new TypeError("stream must be a ReadableStream.");
      }
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (options.maxCacheSize !== void 0 && (!isNumber(options.maxCacheSize) || options.maxCacheSize < 0)) {
        throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
      }
      super();
      this._reader = null;
      this._cache = [];
      this._pendingSlices = [];
      this._currentIndex = 0;
      this._targetIndex = 0;
      this._maxRequestedIndex = 0;
      this._endIndex = null;
      this._pulling = false;
      this._stream = stream;
      this._maxCacheSize = options.maxCacheSize ?? 32 * 2 ** 20;
    }
    /** @internal */
    _getFileSize() {
      return this._endIndex;
    }
    /** @internal */
    _read(start, end) {
      if (this._endIndex !== null && end > this._endIndex) {
        return null;
      }
      this._maxRequestedIndex = Math.max(this._maxRequestedIndex, end);
      const cacheStartIndex = binarySearchLessOrEqual(this._cache, start, (x) => x.start);
      const cacheStartEntry = cacheStartIndex !== -1 ? this._cache[cacheStartIndex] : null;
      if (cacheStartEntry && cacheStartEntry.start <= start && end <= cacheStartEntry.end) {
        return {
          bytes: cacheStartEntry.bytes,
          view: cacheStartEntry.view,
          offset: cacheStartEntry.start
        };
      }
      let lastEnd = start;
      const bytes2 = new Uint8Array(end - start);
      if (cacheStartIndex !== -1) {
        for (let i = cacheStartIndex; i < this._cache.length; i++) {
          const cacheEntry = this._cache[i];
          if (cacheEntry.start >= end) {
            break;
          }
          const cappedStart = Math.max(start, cacheEntry.start);
          if (cappedStart > lastEnd) {
            this._throwDueToCacheMiss();
          }
          const cappedEnd = Math.min(end, cacheEntry.end);
          if (cappedStart < cappedEnd) {
            bytes2.set(cacheEntry.bytes.subarray(cappedStart - cacheEntry.start, cappedEnd - cacheEntry.start), cappedStart - start);
            lastEnd = cappedEnd;
          }
        }
      }
      if (lastEnd === end) {
        return {
          bytes: bytes2,
          view: toDataView(bytes2),
          offset: start
        };
      }
      if (this._currentIndex > lastEnd) {
        this._throwDueToCacheMiss();
      }
      const { promise, resolve, reject } = promiseWithResolvers();
      this._pendingSlices.push({
        start,
        end,
        bytes: bytes2,
        resolve,
        reject
      });
      this._targetIndex = Math.max(this._targetIndex, end);
      if (!this._pulling) {
        this._pulling = true;
        void this._pull().catch((error) => {
          this._pulling = false;
          if (this._pendingSlices.length > 0) {
            this._pendingSlices.forEach((x) => x.reject(error));
            this._pendingSlices.length = 0;
          } else {
            throw error;
          }
        });
      }
      return promise;
    }
    /** @internal */
    _throwDueToCacheMiss() {
      throw new Error("Read is before the cached region. With ReadableStreamSource, you must access the data more sequentially or increase the size of its cache.");
    }
    /** @internal */
    async _pull() {
      this._reader ??= this._stream.getReader();
      while (this._currentIndex < this._targetIndex && !this._disposed) {
        const { done, value } = await this._reader.read();
        if (done) {
          for (const pendingSlice of this._pendingSlices) {
            pendingSlice.resolve(null);
          }
          this._pendingSlices.length = 0;
          this._endIndex = this._currentIndex;
          break;
        }
        const startIndex = this._currentIndex;
        const endIndex = this._currentIndex + value.byteLength;
        this._dispatchRead(startIndex, endIndex);
        for (let i = 0; i < this._pendingSlices.length; i++) {
          const pendingSlice = this._pendingSlices[i];
          const cappedStart = Math.max(startIndex, pendingSlice.start);
          const cappedEnd = Math.min(endIndex, pendingSlice.end);
          if (cappedStart < cappedEnd) {
            pendingSlice.bytes.set(value.subarray(cappedStart - startIndex, cappedEnd - startIndex), cappedStart - pendingSlice.start);
            if (cappedEnd === pendingSlice.end) {
              pendingSlice.resolve({
                bytes: pendingSlice.bytes,
                view: toDataView(pendingSlice.bytes),
                offset: pendingSlice.start
              });
              this._pendingSlices.splice(i, 1);
              i--;
            }
          }
        }
        this._cache.push({
          start: startIndex,
          end: endIndex,
          bytes: value,
          view: toDataView(value),
          age: 0
          // Unused
        });
        while (this._cache.length > 0) {
          const firstEntry = this._cache[0];
          const distance = this._maxRequestedIndex - firstEntry.end;
          if (distance <= this._maxCacheSize) {
            break;
          }
          this._cache.shift();
        }
        this._currentIndex += value.byteLength;
      }
      this._pulling = false;
    }
    /** @internal */
    _dispose() {
      this._pendingSlices.length = 0;
      this._cache.length = 0;
      void this._reader?.cancel();
    }
  };
  var PREFETCH_PROFILES = {
    none: (start, end) => ({ start, end }),
    fileSystem: (start, end) => {
      const padding = 2 ** 16;
      start = Math.floor((start - padding) / padding) * padding;
      end = Math.ceil((end + padding) / padding) * padding;
      return { start, end };
    },
    network: (start, end, workers) => {
      const paddingStart = 2 ** 16;
      start = Math.max(0, Math.floor((start - paddingStart) / paddingStart) * paddingStart);
      for (const worker of workers) {
        const maxExtensionAmount = 8 * 2 ** 20;
        const thresholdPoint = Math.max((worker.startPos + worker.targetPos) / 2, worker.targetPos - maxExtensionAmount);
        if (closedIntervalsOverlap(start, end, thresholdPoint, worker.targetPos)) {
          const size = worker.targetPos - worker.startPos;
          const a = Math.ceil((size + 1) / maxExtensionAmount) * maxExtensionAmount;
          const b = 2 ** Math.ceil(Math.log2(size + 1));
          const extent = Math.min(b, a);
          end = Math.max(end, worker.startPos + extent);
        }
      }
      end = Math.max(end, start + URL_SOURCE_MIN_LOAD_AMOUNT);
      return {
        start,
        end
      };
    }
  };
  var ReadOrchestrator = class {
    constructor(options) {
      this.options = options;
      this.fileSize = null;
      this.nextAge = 0;
      this.workers = [];
      this.cache = [];
      this.currentCacheSize = 0;
      this.disposed = false;
      this.queuedReads = [];
    }
    read(innerStart, innerEnd, minReadPosition, maxReadPosition) {
      assert(!this.disposed);
      const prefetchRange = this.options.prefetchProfile(innerStart, innerEnd, this.workers);
      const outerStart = Math.max(prefetchRange.start, minReadPosition);
      const outerEnd = Math.min(prefetchRange.end, this.fileSize ?? Infinity, maxReadPosition);
      assert(outerStart <= innerStart && innerEnd <= outerEnd);
      let result = null;
      const innerCacheStartIndex = binarySearchLessOrEqual(this.cache, innerStart, (x) => x.start);
      const innerStartEntry = innerCacheStartIndex !== -1 ? this.cache[innerCacheStartIndex] : null;
      if (innerStartEntry && innerStartEntry.start <= innerStart && innerEnd <= innerStartEntry.end) {
        innerStartEntry.age = this.nextAge++;
        result = {
          bytes: innerStartEntry.bytes,
          view: innerStartEntry.view,
          offset: innerStartEntry.start
        };
      }
      const outerCacheStartIndex = binarySearchLessOrEqual(this.cache, outerStart, (x) => x.start);
      const bytes2 = result ? null : new Uint8Array(innerEnd - innerStart);
      let contiguousBytesWriteEnd = 0;
      let lastEnd = outerStart;
      const outerHoles = [];
      if (outerCacheStartIndex !== -1) {
        for (let i = outerCacheStartIndex; i < this.cache.length; i++) {
          const entry = this.cache[i];
          if (entry.start >= outerEnd) {
            break;
          }
          if (entry.end <= outerStart) {
            continue;
          }
          const cappedOuterStart = Math.max(outerStart, entry.start);
          const cappedOuterEnd = Math.min(outerEnd, entry.end);
          assert(cappedOuterStart <= cappedOuterEnd);
          if (lastEnd < cappedOuterStart) {
            outerHoles.push({ start: lastEnd, end: cappedOuterStart });
          }
          lastEnd = cappedOuterEnd;
          if (bytes2) {
            const cappedInnerStart = Math.max(innerStart, entry.start);
            const cappedInnerEnd = Math.min(innerEnd, entry.end);
            if (cappedInnerStart < cappedInnerEnd) {
              const relativeOffset = cappedInnerStart - innerStart;
              bytes2.set(entry.bytes.subarray(cappedInnerStart - entry.start, cappedInnerEnd - entry.start), relativeOffset);
              if (relativeOffset === contiguousBytesWriteEnd) {
                contiguousBytesWriteEnd = cappedInnerEnd - innerStart;
              }
            }
          }
          entry.age = this.nextAge++;
        }
        if (lastEnd < outerEnd) {
          outerHoles.push({ start: lastEnd, end: outerEnd });
        }
      } else {
        outerHoles.push({ start: outerStart, end: outerEnd });
      }
      if (bytes2 && contiguousBytesWriteEnd >= bytes2.length) {
        result = {
          bytes: bytes2,
          view: toDataView(bytes2),
          offset: innerStart
        };
      }
      if (outerHoles.length === 0) {
        assert(result);
        return result;
      }
      const { promise, resolve, reject } = promiseWithResolvers();
      const innerHoles = [];
      for (const outerHole of outerHoles) {
        const cappedStart = Math.max(innerStart, outerHole.start);
        const cappedEnd = Math.min(innerEnd, outerHole.end);
        if (cappedStart === outerHole.start && cappedEnd === outerHole.end) {
          innerHoles.push(outerHole);
        } else if (cappedStart < cappedEnd) {
          innerHoles.push({ start: cappedStart, end: cappedEnd });
        }
      }
      const pendingSlice = bytes2 && {
        start: innerStart,
        bytes: bytes2,
        holes: innerHoles,
        resolve,
        reject
      };
      outer: for (const outerHole of outerHoles) {
        for (const worker of this.workers) {
          const addedToWorker = this.checkHoleAgainstWorker(worker, outerHole, pendingSlice ? [pendingSlice] : []);
          if (addedToWorker) {
            this.checkQueuedReadsAgainstWorker(worker);
            continue outer;
          }
        }
        const strictTarget = outerHole.end < outerEnd || this.fileSize !== null;
        const newWorker = this.createWorker(outerHole.start, outerHole.end, strictTarget);
        if (newWorker) {
          if (pendingSlice) {
            newWorker.pendingSlices = [pendingSlice];
          }
          this.runWorker(newWorker);
        } else {
          let index = binarySearchLessOrEqual(this.queuedReads, outerHole.start, (x) => x.hole.start);
          let entry = index !== -1 ? this.queuedReads[index] : null;
          if (entry && outerHole.start <= entry.hole.end) {
            entry.hole.end = Math.max(entry.hole.end, outerHole.end);
            entry.strictTarget &&= strictTarget;
            if (pendingSlice) {
              entry.pendingSlices.push(pendingSlice);
            }
          } else {
            index++;
            entry = {
              hole: {
                // Clone the hole because it might be mutated later
                start: outerHole.start,
                end: outerHole.end
              },
              strictTarget,
              pendingSlices: pendingSlice ? [pendingSlice] : [],
              age: this.nextAge++
            };
            this.queuedReads.splice(index, 0, entry);
          }
          while (index + 1 < this.queuedReads.length) {
            const nextEntry = this.queuedReads[index + 1];
            if (nextEntry.hole.start > entry.hole.end) {
              break;
            }
            entry.hole.end = Math.max(entry.hole.end, nextEntry.hole.end);
            entry.pendingSlices.push(...nextEntry.pendingSlices);
            entry.strictTarget &&= nextEntry.strictTarget;
            entry.age = Math.min(entry.age, nextEntry.age);
            this.queuedReads.splice(index + 1, 1);
          }
        }
      }
      if (!result) {
        assert(bytes2);
        result = promise.then((bytes3) => bytes3 && {
          bytes: bytes3,
          view: toDataView(bytes3),
          offset: innerStart
        });
      } else {
        promise.catch((error) => {
          if (this.disposed) {
            return;
          }
          throw error;
        });
      }
      return result;
    }
    checkHoleAgainstWorker(worker, hole, pendingSlices) {
      const gapTolerance = 2 ** 17;
      if (closedIntervalsOverlap(hole.start - gapTolerance, hole.start, worker.currentPos, worker.targetPos)) {
        worker.targetPos = Math.max(worker.targetPos, hole.end);
        for (let i = 0; i < pendingSlices.length; i++) {
          const pendingSlice = pendingSlices[i];
          if (!worker.pendingSlices.includes(pendingSlice)) {
            worker.pendingSlices.push(pendingSlice);
          }
        }
        if (!worker.running) {
          this.runWorker(worker);
        }
        return true;
      }
      return false;
    }
    checkQueuedReadsAgainstWorker(worker) {
      let wasTrueOnce = false;
      for (let i = 0; i < this.queuedReads.length; i++) {
        const queuedRead = this.queuedReads[i];
        const result = this.checkHoleAgainstWorker(worker, queuedRead.hole, queuedRead.pendingSlices);
        if (result) {
          this.queuedReads.splice(i, 1);
          i--;
          wasTrueOnce = true;
        } else if (wasTrueOnce) {
          break;
        }
      }
    }
    createWorker(startPos, targetPos, strictTarget) {
      if (this.workers.length >= this.options.maxWorkerCount) {
        let oldestWorker = null;
        let oldestIndex = null;
        for (let i = 0; i < this.workers.length; i++) {
          const worker2 = this.workers[i];
          if (!worker2.running && worker2.pendingSlices.length === 0 && (!oldestWorker || worker2.age < oldestWorker.age)) {
            oldestIndex = i;
            oldestWorker = worker2;
          }
        }
        if (oldestWorker) {
          assert(oldestIndex !== null);
          assert(oldestWorker.pendingSlices.length === 0);
          this.workers.splice(oldestIndex, 1);
        } else {
          return null;
        }
      }
      const worker = {
        startPos,
        currentPos: startPos,
        targetPos,
        strictTarget,
        running: false,
        // Due to async shenanigans, it can happen that workers are started after disposal. In this case, instead of
        // simply not creating the worker, we allow it to run but immediately label it as aborted, so it can then
        // shut itself down.
        aborted: this.disposed,
        pendingSlices: [],
        age: this.nextAge++
      };
      this.workers.push(worker);
      return worker;
    }
    runWorker(worker) {
      assert(!worker.running);
      assert(worker.currentPos < worker.targetPos);
      worker.running = true;
      worker.age = this.nextAge++;
      void this.options.runWorker(worker).catch((error) => {
        worker.running = false;
        if (worker.pendingSlices.length > 0) {
          worker.pendingSlices.forEach((x) => x.reject(error));
          worker.pendingSlices.length = 0;
        } else if (!worker.aborted && !this.disposed) {
          throw error;
        }
      }).finally(() => {
        if (worker.running) {
          return;
        }
        if (this.queuedReads.length > 0) {
          let oldestIndex = 0;
          for (let i = 1; i < this.queuedReads.length; i++) {
            const queuedRead2 = this.queuedReads[i];
            if (queuedRead2.age < this.queuedReads[oldestIndex].age) {
              oldestIndex = i;
            }
          }
          const queuedRead = this.queuedReads[oldestIndex];
          const newWorker = this.createWorker(queuedRead.hole.start, queuedRead.hole.end, queuedRead.strictTarget);
          if (!newWorker) {
            return;
          }
          this.queuedReads.splice(oldestIndex, 1);
          newWorker.pendingSlices = queuedRead.pendingSlices;
          this.runWorker(newWorker);
        }
      });
    }
    consolidateEverythingIntoOneWorker(worker) {
      const uniqueSlices = new Set(worker.pendingSlices);
      for (let i = 0; i < this.workers.length; i++) {
        const otherWorker = this.workers[i];
        if (otherWorker === worker) {
          continue;
        }
        for (const slice of otherWorker.pendingSlices) {
          uniqueSlices.add(slice);
        }
        otherWorker.aborted = true;
        otherWorker.pendingSlices.length = 0;
        this.workers.splice(i, 1);
        i--;
      }
      for (let i = 0; i < this.queuedReads.length; i++) {
        const queuedRead = this.queuedReads[i];
        for (const slice of queuedRead.pendingSlices) {
          uniqueSlices.add(slice);
        }
      }
      worker.pendingSlices = [...uniqueSlices];
      this.queuedReads.length = 0;
    }
    /** Called by a worker when it has read some data. */
    supplyWorkerData(worker, bytes2) {
      assert(!worker.aborted);
      const start = worker.currentPos;
      const end = start + bytes2.length;
      this.insertIntoCache({
        start,
        end,
        bytes: bytes2,
        view: toDataView(bytes2),
        age: this.nextAge++
      });
      worker.currentPos += bytes2.length;
      if (worker.currentPos > worker.targetPos) {
        worker.targetPos = worker.currentPos;
        this.checkQueuedReadsAgainstWorker(worker);
      }
      for (let i = 0; i < worker.pendingSlices.length; i++) {
        const pendingSlice = worker.pendingSlices[i];
        const clampedStart = Math.max(start, pendingSlice.start);
        const clampedEnd = Math.min(end, pendingSlice.start + pendingSlice.bytes.length);
        if (clampedStart < clampedEnd) {
          pendingSlice.bytes.set(bytes2.subarray(clampedStart - start, clampedEnd - start), clampedStart - pendingSlice.start);
        }
        for (let j = 0; j < pendingSlice.holes.length; j++) {
          const hole = pendingSlice.holes[j];
          if (start <= hole.start && end > hole.start) {
            hole.start = end;
          }
          if (hole.end <= hole.start) {
            pendingSlice.holes.splice(j, 1);
            j--;
          }
        }
        if (pendingSlice.holes.length === 0) {
          pendingSlice.resolve(pendingSlice.bytes);
          worker.pendingSlices.splice(i, 1);
          i--;
        }
      }
      for (let i = 0; i < this.workers.length; i++) {
        const otherWorker = this.workers[i];
        if (worker === otherWorker || otherWorker.running) {
          continue;
        }
        if (closedIntervalsOverlap(start, end, otherWorker.currentPos, otherWorker.targetPos)) {
          this.workers.splice(i, 1);
          i--;
        }
      }
    }
    supplyFileSize(size) {
      assert(this.fileSize === null);
      this.fileSize = size;
      for (const worker of this.workers) {
        worker.targetPos = Math.min(worker.targetPos, size);
        worker.strictTarget = true;
        for (let i = 0; i < worker.pendingSlices.length; i++) {
          const pendingSlice = worker.pendingSlices[i];
          for (const hole of pendingSlice.holes) {
            if (hole.end > size) {
              pendingSlice.resolve(null);
              worker.pendingSlices.splice(i, 1);
              i--;
              break;
            }
          }
        }
      }
      for (let i = 0; i < this.queuedReads.length; i++) {
        const queuedRead = this.queuedReads[i];
        if (queuedRead.hole.start >= size) {
          for (const slice of queuedRead.pendingSlices)
            slice.resolve(null);
          this.queuedReads.splice(i, 1);
          i--;
        } else if (queuedRead.hole.end > size) {
          queuedRead.hole.end = size;
          queuedRead.strictTarget = true;
          for (let j = 0; j < queuedRead.pendingSlices.length; j++) {
            const slice = queuedRead.pendingSlices[j];
            if (slice.start >= size) {
              slice.resolve(null);
              queuedRead.pendingSlices.splice(j, 1);
              j--;
            }
          }
        }
      }
    }
    signalWorkerStoppedRunning(worker) {
      worker.running = false;
      worker.pendingSlices.length = 0;
    }
    /** Called when a worker reaches the end of the underlying data and must be cleaned up. */
    onWorkerFinished(worker) {
      const index = this.workers.indexOf(worker);
      assert(index !== -1);
      worker.running = false;
      this.workers.splice(index, 1);
      if (this.fileSize === null) {
        this.supplyFileSize(worker.currentPos);
      }
      for (const pendingSlice of worker.pendingSlices) {
        pendingSlice.resolve(null);
      }
    }
    insertIntoCache(entry) {
      if (this.options.maxCacheSize === 0) {
        return;
      }
      let insertionIndex = binarySearchLessOrEqual(this.cache, entry.start, (x) => x.start) + 1;
      if (insertionIndex > 0) {
        const previous = this.cache[insertionIndex - 1];
        if (previous.end >= entry.end) {
          return;
        }
        if (previous.end > entry.start) {
          const joined = new Uint8Array(entry.end - previous.start);
          joined.set(previous.bytes, 0);
          joined.set(entry.bytes, entry.start - previous.start);
          this.currentCacheSize += entry.end - previous.end;
          previous.bytes = joined;
          previous.view = toDataView(joined);
          previous.end = entry.end;
          insertionIndex--;
          entry = previous;
        } else {
          this.cache.splice(insertionIndex, 0, entry);
          this.currentCacheSize += entry.bytes.length;
        }
      } else {
        this.cache.splice(insertionIndex, 0, entry);
        this.currentCacheSize += entry.bytes.length;
      }
      for (let i = insertionIndex + 1; i < this.cache.length; i++) {
        const next = this.cache[i];
        if (entry.end <= next.start) {
          break;
        }
        if (entry.end >= next.end) {
          this.cache.splice(i, 1);
          this.currentCacheSize -= next.bytes.length;
          i--;
          continue;
        }
        const joined = new Uint8Array(next.end - entry.start);
        joined.set(entry.bytes, 0);
        joined.set(next.bytes, next.start - entry.start);
        this.currentCacheSize -= entry.end - next.start;
        entry.bytes = joined;
        entry.view = toDataView(joined);
        entry.end = next.end;
        this.cache.splice(i, 1);
        break;
      }
      while (this.currentCacheSize > this.options.maxCacheSize) {
        let oldestIndex = 0;
        let oldestEntry = this.cache[0];
        for (let i = 1; i < this.cache.length; i++) {
          const entry2 = this.cache[i];
          if (entry2.age < oldestEntry.age) {
            oldestIndex = i;
            oldestEntry = entry2;
          }
        }
        if (this.currentCacheSize - oldestEntry.bytes.length <= this.options.maxCacheSize) {
          break;
        }
        this.cache.splice(oldestIndex, 1);
        this.currentCacheSize -= oldestEntry.bytes.length;
      }
    }
    dispose() {
      for (const worker of this.workers) {
        worker.aborted = true;
      }
      this.workers.length = 0;
      this.cache.length = 0;
      this.disposed = true;
    }
  };
  var RangedSource = class extends Source {
    /** @internal */
    constructor(baseSource, offset, length) {
      super();
      this._ref = null;
      if (baseSource._disposed) {
        throw new Error("Cannot create a slice of a disposed source.");
      }
      this._baseSource = baseSource;
      this._offset = offset;
      this._length = length ?? null;
    }
    /** @internal */
    _getFileSize() {
      const baseSize = this._baseSource._getFileSize();
      if (baseSize === void 0) {
        return this._length !== null ? this._length : void 0;
      }
      if (baseSize === null) {
        if (this._length !== null) {
          return this._length;
        } else {
          return null;
        }
      }
      return clamp(baseSize - this._offset, 0, this._length ?? Infinity);
    }
    /** @internal */
    _read(start, end, minReadPosition, maxReadPosition) {
      if (this._length !== null && end > this._length) {
        return null;
      }
      const result = this._baseSource._read(this._offset + start, this._offset + end, this._offset + minReadPosition, this._offset + maxReadPosition);
      const processResult = (result2) => {
        if (!result2) {
          return null;
        }
        result2.offset -= this._offset;
        return result2;
      };
      if (result instanceof Promise) {
        return result.then(processResult);
      } else {
        return processResult(result);
      }
    }
    /** @internal */
    _dispose() {
      this._ref?.free();
    }
    ref() {
      this._ref ??= this._baseSource.ref();
      return super.ref();
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/hls/hls-segmented-input.js
  var __addDisposableResource = function(env, value, async) {
    if (value !== null && value !== void 0) {
      if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
      var dispose, inner;
      if (async) {
        if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
        dispose = value[Symbol.asyncDispose];
      }
      if (dispose === void 0) {
        if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
        dispose = value[Symbol.dispose];
        if (async) inner = dispose;
      }
      if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
      if (inner) dispose = function() {
        try {
          inner.call(this);
        } catch (e) {
          return Promise.reject(e);
        }
      };
      env.stack.push({ value, dispose, async });
    } else if (async) {
      env.stack.push({ async: true });
    }
    return value;
  };
  var __disposeResources = /* @__PURE__ */ function(SuppressedError2) {
    return function(env) {
      function fail(e) {
        env.error = env.hasError ? new SuppressedError2(e, env.error, "An error was suppressed during disposal.") : e;
        env.hasError = true;
      }
      var r, s = 0;
      function next() {
        while (r = env.stack.pop()) {
          try {
            if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
            if (r.dispose) {
              var result = r.dispose.call(r.value);
              if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
                fail(e);
                return next();
              });
            } else s |= 1;
          } catch (e) {
            fail(e);
          }
        }
        if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
        if (env.hasError) throw env.error;
      }
      return next();
    };
  }(typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
  });
  var IV_STRING_REGEX = /^0[xX][0-9a-fA-F]+$/;
  var BASE64_DATA_URI_REGEX = /^data:.*;base64,/i;
  var HlsSegmentedInput = class extends SegmentedInput {
    constructor(demuxer, path, trackDeclarations, lines) {
      super(demuxer.input, path, trackDeclarations);
      this.segments = [];
      this.nextLines = null;
      this.currentUpdateSegmentsPromise = null;
      this.streamHasEnded = false;
      this.lastSegmentUpdateTime = -Infinity;
      this.refreshInterval = 5;
      this.rootPath = path;
      this.demuxer = demuxer;
      this.nextLines = lines;
    }
    runUpdateSegments() {
      return this.currentUpdateSegmentsPromise ??= (async () => {
        try {
          const remainingWaitTimeMs = this.getRemainingWaitTimeMs();
          if (remainingWaitTimeMs > 0) {
            await wait(remainingWaitTimeMs);
          }
          this.lastSegmentUpdateTime = performance.now();
          await this.updateSegments();
        } finally {
          this.currentUpdateSegmentsPromise = null;
        }
      })();
    }
    getRemainingWaitTimeMs() {
      const elapsed = performance.now() - this.lastSegmentUpdateTime;
      const result = Math.max(0, 1e3 * this.refreshInterval - elapsed);
      if (result <= 50) {
        return 0;
      }
      return result;
    }
    /**
     * Reads and parses the segment info from the playlist file. When called more than one, it updates the existing
     * segments by appending the new ones. Existing segments are never removed.
     */
    async updateSegments() {
      let lines = this.nextLines;
      this.nextLines = null;
      if (!lines) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
          const ref = __addDisposableResource(env_1, await this.demuxer.input._getSourceUncached({ path: this.rootPath, isRoot: false }), false);
          const reader = new Reader(ref.source);
          const slice = await reader.requestEntireFile();
          assert(slice);
          lines = readAllLines(slice, slice.length, { ignore: canIgnoreLine });
          if (ref.source instanceof PathedSource) {
            this.rootPath = ref.source.rootPath;
          }
        } catch (e_1) {
          env_1.error = e_1;
          env_1.hasError = true;
        } finally {
          __disposeResources(env_1);
        }
      }
      const offsetTimestampsByDateTime = this.input._formatOptions.hls?.offsetTimestampsByDateTime !== false;
      let headerRead = false;
      let accumulatedTime = 0;
      let accumulatedUnixTime = null;
      let nextSegmentDuration = null;
      let currentKey = null;
      let nextSequenceNumber = 0;
      let currentFirstSegment = null;
      let currentInitSegment = null;
      let lastByteRangeEnd = null;
      let nextByteRange = null;
      let lastProgramDateTimeSeconds = null;
      let targetDuration = null;
      let segmentSeen = false;
      let prevLastSegment = last(this.segments) ?? null;
      const parseByteRange = (content) => {
        const atIndex = content.indexOf("@");
        const length = Number(atIndex === -1 ? content : content.slice(0, atIndex));
        if (!Number.isInteger(length) || length < 0) {
          throw new Error(`Invalid #EXT-X-BYTERANGE length '${content}'.`);
        }
        let offset = null;
        if (atIndex !== -1) {
          offset = Number(content.slice(atIndex + 1));
          if (!Number.isInteger(offset) || offset < 0) {
            throw new Error(`Invalid #EXT-X-BYTERANGE offset '${content}'.`);
          }
        }
        return { length, offset };
      };
      const setNextSequenceNumber = (number) => {
        nextSequenceNumber = number;
        if (prevLastSegment) {
          assert(prevLastSegment.sequenceNumber !== null);
          if (prevLastSegment.sequenceNumber < number) {
            accumulatedTime = prevLastSegment.timestamp + prevLastSegment.duration;
            currentFirstSegment = prevLastSegment.firstSegment;
            currentInitSegment = prevLastSegment.initSegment;
            lastProgramDateTimeSeconds = prevLastSegment.lastProgramDateTimeSeconds;
            accumulatedUnixTime = prevLastSegment.unixEpochTimestamp !== null ? prevLastSegment.unixEpochTimestamp + prevLastSegment.duration : null;
            prevLastSegment = null;
          }
        }
      };
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!headerRead) {
          if (line !== "#EXTM3U") {
            throw new Error("Invalid M3U8 file; expected first line to be #EXTM3U.");
          }
          headerRead = true;
          continue;
        }
        if (!line.startsWith("#")) {
          if (!prevLastSegment) {
            if (nextSegmentDuration === null) {
              throw new Error("Invalid M3U8 file; a segment must be preceded by an #EXTINF tag.");
            }
            let key = currentKey;
            if (key && key.method === "AES-128" && !key.iv) {
              const iv = new Uint8Array(AES_128_BLOCK_SIZE);
              const view2 = toDataView(iv);
              view2.setUint32(8, Math.floor(nextSequenceNumber / 2 ** 32));
              view2.setUint32(12, nextSequenceNumber);
              key = { ...key, iv };
            }
            const fullPath = joinPaths(this.rootPath, line);
            const location = {
              path: fullPath,
              offset: nextByteRange?.offset ?? 0,
              length: nextByteRange?.length ?? null
            };
            const segment = {
              timestamp: accumulatedTime,
              unixEpochTimestamp: accumulatedUnixTime,
              firstSegment: currentFirstSegment,
              sequenceNumber: nextSequenceNumber,
              location,
              duration: nextSegmentDuration,
              encryption: key,
              initSegment: currentInitSegment,
              lastProgramDateTimeSeconds
            };
            currentFirstSegment ??= segment;
            accumulatedTime += nextSegmentDuration;
            if (accumulatedUnixTime !== null) {
              accumulatedUnixTime += nextSegmentDuration;
            }
            this.segments.push(segment);
          } else {
          }
          nextSegmentDuration = null;
          if (nextByteRange === null) {
            lastByteRangeEnd = null;
          } else {
            nextByteRange = null;
          }
          setNextSequenceNumber(nextSequenceNumber + 1);
        }
        if (line.startsWith(TAG_EXTINF)) {
          if (prevLastSegment) {
            segmentSeen = true;
            continue;
          }
          if (!segmentSeen) {
            if (lastProgramDateTimeSeconds === null && nextSequenceNumber > 0 && targetDuration !== null) {
              accumulatedTime = nextSequenceNumber * targetDuration;
            }
            segmentSeen = true;
          }
          const extinfContent = line.slice(TAG_EXTINF.length);
          const commaIndex = extinfContent.indexOf(",");
          const durationStr = commaIndex === -1 ? extinfContent : extinfContent.slice(0, commaIndex);
          const duration = Number(durationStr);
          if (!Number.isFinite(duration) || duration < 0) {
            throw new Error(`Invalid #EXTINF tag duration '${durationStr}'.`);
          }
          nextSegmentDuration = duration;
        } else if (line.startsWith(TAG_MAP)) {
          const attributes = new AttributeList(line.slice(TAG_MAP.length));
          const uri = attributes.get("uri");
          if (!uri) {
            throw new Error("Invalid #EXT-X-MAP tag; missing URI attribute.");
          }
          const byteRange = attributes.get("byterange");
          let parsedByteRange = null;
          if (byteRange !== null) {
            parsedByteRange = parseByteRange(byteRange);
          }
          if (parsedByteRange && parsedByteRange.offset === null) {
            throw new Error("Invalid #EXT-X-MAP tag; BYTERANGE attribute must have a specified offset.");
          }
          if (!prevLastSegment) {
            const fullPath = joinPaths(this.rootPath, uri);
            const location = {
              path: fullPath,
              offset: parsedByteRange?.offset ?? 0,
              length: parsedByteRange?.length ?? null
            };
            if (currentKey?.method === "AES-128" && !currentKey.iv) {
              throw new Error("IV attribute must be set on #EXT-X-KEY tag preceding the #EXT-X-MAP tag.");
            }
            const segment = {
              timestamp: accumulatedTime,
              unixEpochTimestamp: accumulatedUnixTime,
              firstSegment: null,
              sequenceNumber: null,
              location,
              duration: 0,
              encryption: currentKey,
              initSegment: null,
              lastProgramDateTimeSeconds
            };
            currentInitSegment = segment;
          } else {
          }
          nextSegmentDuration = null;
          if (nextByteRange === null) {
            lastByteRangeEnd = null;
          } else {
            nextByteRange = null;
          }
        } else if (line.startsWith(TAG_KEY)) {
          const attributes = new AttributeList(line.slice(TAG_KEY.length));
          const method = attributes.get("method");
          if (method === "NONE") {
            currentKey = null;
          } else if (method === "AES-128") {
            const uri = attributes.get("uri");
            if (!uri) {
              throw new Error("Invalid #EXT-X-KEY: AES-128 requires a URI attribute.");
            }
            let iv = null;
            const ivString = attributes.get("iv");
            if (ivString) {
              if (!IV_STRING_REGEX.test(ivString)) {
                throw new Error(`Unsupported IV format '${ivString}'.`);
              }
              let hex = ivString.slice(2);
              hex = hex.padStart(AES_128_BLOCK_SIZE * 2, "0");
              iv = new Uint8Array(AES_128_BLOCK_SIZE);
              for (let i2 = 0; i2 < AES_128_BLOCK_SIZE; i2++) {
                const startIndex = -AES_128_BLOCK_SIZE * 2 + i2;
                iv[i2] = parseInt(hex.slice(startIndex, startIndex + 2), 16);
              }
            }
            const keyFormat = attributes.get("keyformat") ?? "identity";
            if (keyFormat !== "identity") {
              throw new Error("For AES-128 encryption, only the 'identity' KEYFORMAT is currently supported. If you think other formats should be supported, please raise an issue.");
            }
            currentKey = {
              method: "AES-128",
              keyUri: joinPaths(this.rootPath, uri),
              iv,
              keyFormat
            };
          } else if (method === "SAMPLE-AES" || method === "SAMPLE-AES-CTR") {
            const uri = attributes.get("uri");
            if (!uri) {
              throw new Error(`Invalid #EXT-X-KEY: ${method} requires a URI attribute.`);
            }
            const keyFormat = attributes.get("keyformat") ?? "identity";
            if (keyFormat === "identity") {
              throw new Error("For SAMPLE-AES and SAMPLE-AES-CTR encryption, the 'identity' KEYFORMAT is not supported. If you think this format should be supported, please raise an issue.");
            }
            let psshBox = null;
            if (BASE64_DATA_URI_REGEX.test(uri)) {
              const commaIndex = uri.indexOf(",");
              const bytes2 = base64ToBytes(uri.slice(commaIndex + 1));
              if (bytes2.length >= 8 && bytes2[4] === 112 && bytes2[5] === 115 && bytes2[6] === 115 && bytes2[7] === 104) {
                const size = toDataView(bytes2).getUint32(0);
                psshBox = parsePsshBoxContents(bytes2.subarray(8, Math.min(size, bytes2.length)));
              }
            }
            currentKey = {
              method,
              psshBox
            };
          } else {
            throw new Error(`Unsupported encryption method '${method}'. If you think this method should be supported, please raise an issue.`);
          }
        } else if (line.startsWith(TAG_MEDIA_SEQUENCE)) {
          const value = line.slice(TAG_MEDIA_SEQUENCE.length);
          const number = Number(value);
          if (!Number.isInteger(number) || number < 0) {
            throw new Error(`Invalid EXT-X-MEDIA-SEQUENCE value '${value}'.`);
          }
          setNextSequenceNumber(number);
        } else if (line.startsWith(TAG_BYTERANGE)) {
          const parsed = parseByteRange(line.slice(TAG_BYTERANGE.length));
          if (parsed.offset === null) {
            if (lastByteRangeEnd === null) {
              throw new Error("Invalid M3U8 file; #EXT-X-BYTERANGE without offset requires a previous byte range.");
            }
            parsed.offset = lastByteRangeEnd;
          }
          nextByteRange = parsed;
          lastByteRangeEnd = parsed.offset + parsed.length;
        } else if (line.startsWith(TAG_PROGRAM_DATE_TIME)) {
          if (prevLastSegment) {
            continue;
          }
          const dateTime = line.slice(TAG_PROGRAM_DATE_TIME.length);
          const dateTimeMs = Date.parse(dateTime);
          if (!Number.isFinite(dateTimeMs)) {
            continue;
          }
          const dateTimeSeconds = dateTimeMs / 1e3;
          if (lastProgramDateTimeSeconds === dateTimeSeconds) {
            continue;
          }
          if (lastProgramDateTimeSeconds === null && this.segments.length > 0) {
            const lastSegment = last(this.segments);
            const lastSegmentEnd = lastSegment.timestamp + lastSegment.duration;
            const offset = dateTimeSeconds - lastSegmentEnd;
            for (const segment of this.segments) {
              segment.unixEpochTimestamp = segment.timestamp + offset;
              if (offsetTimestampsByDateTime) {
                segment.timestamp = segment.unixEpochTimestamp;
              }
            }
          }
          lastProgramDateTimeSeconds = dateTimeSeconds;
          accumulatedUnixTime = dateTimeSeconds;
          if (offsetTimestampsByDateTime) {
            accumulatedTime = dateTimeSeconds;
          }
        } else if (line === TAG_DISCONTINUITY) {
          currentFirstSegment = null;
        } else if (line.startsWith(TAG_TARGETDURATION)) {
          const value = line.slice(TAG_TARGETDURATION.length);
          const duration = Number(value);
          if (!Number.isFinite(duration) || duration < 0) {
            throw new Error(`Invalid EXT-X-TARGETDURATION value '${value}'.`);
          }
          this.refreshInterval = duration;
          targetDuration = duration;
        } else if (line === TAG_ENDLIST) {
          this.streamHasEnded = true;
          break;
        } else if (line.startsWith(TAG_PLAYLIST_TYPE)) {
          const type = line.slice(TAG_PLAYLIST_TYPE.length);
          if (type.toLowerCase() === "vod") {
            this.streamHasEnded = true;
          }
        }
      }
      if (!headerRead) {
        throw new Error("Invalid M3U8 file; no #EXTM3U header.");
      }
    }
    async getFirstSegment() {
      if (this.segments.length === 0) {
        await this.runUpdateSegments();
      }
      return this.segments[0] ?? null;
    }
    async getSegmentAt(timestamp, options) {
      if (this.segments.length === 0) {
        await this.runUpdateSegments();
      }
      let isLazy = !!options.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
      while (true) {
        const index = binarySearchLessOrEqual(this.segments, timestamp, (x) => x.timestamp);
        if (index === -1) {
          return null;
        }
        if (index < this.segments.length - 1 || this.streamHasEnded || isLazy) {
          return this.segments[index];
        }
        const segment = this.segments[index];
        if (timestamp < segment.timestamp + segment.duration) {
          return segment;
        }
        await this.runUpdateSegments();
        if (options.skipLiveWait) {
          isLazy = true;
        }
      }
    }
    async getNextSegment(segment, options) {
      const index = this.segments.indexOf(segment);
      assert(index !== -1);
      const nextIndex = index + 1;
      let isLazy = !!options.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
      while (true) {
        if (nextIndex < this.segments.length) {
          return this.segments[nextIndex];
        }
        if (this.streamHasEnded || isLazy) {
          return null;
        }
        await this.runUpdateSegments();
        if (options.skipLiveWait) {
          isLazy = true;
        }
      }
    }
    async getPreviousSegment(segment) {
      const index = this.segments.indexOf(segment);
      assert(index !== -1);
      return this.segments[index - 1] ?? null;
    }
    getInputForSegment(segment) {
      const hlsSegment = segment;
      const cacheEntry = this.inputCache.find((x) => x.segment === hlsSegment);
      if (cacheEntry) {
        cacheEntry.age = this.nextInputCacheAge++;
        return cacheEntry.input;
      }
      let initInput = null;
      if (hlsSegment.initSegment || hlsSegment.firstSegment) {
        initInput = this.getInputForSegment(hlsSegment.initSegment ?? hlsSegment.firstSegment);
      }
      const formatOptions = {
        ...this.input._formatOptions,
        isobmff: {
          ...this.input._formatOptions.isobmff,
          // Intercept calls to resolveKeyId to inject our psshBox knowledge into it
          resolveKeyId: this.input._formatOptions.isobmff?.resolveKeyId && ((options) => {
            if (!hlsSegment.encryption || !(hlsSegment.encryption.method === "SAMPLE-AES" || hlsSegment.encryption.method === "SAMPLE-AES-CTR") || !hlsSegment.encryption.psshBox) {
              return this.input._formatOptions.isobmff.resolveKeyId(options);
            }
            let psshBoxes = options.psshBoxes;
            const { psshBox } = hlsSegment.encryption;
            if ((psshBox.keyIds === null || psshBox.keyIds.includes(options.keyId)) && !psshBoxes.some((x) => psshBoxesAreEqual(x, psshBox))) {
              psshBoxes = [...psshBoxes, psshBox];
            }
            return this.input._formatOptions.isobmff.resolveKeyId({ ...options, psshBoxes });
          })
        }
      };
      const input = new Input({
        source: new CustomPathedSource(hlsSegment.location.path, async (request) => {
          assert(request.isRoot);
          const proxiedRequest = {
            ...request,
            isRoot: false
          };
          let ref;
          const needsSlice = hlsSegment.location.offset > 0 || hlsSegment.location.length !== null;
          if (!hlsSegment.encryption || hlsSegment.encryption.method === "SAMPLE-AES" || hlsSegment.encryption.method === "SAMPLE-AES-CTR") {
            ref = await this.input._getSourceCached(proxiedRequest);
            if (needsSlice) {
              const slice = ref.source.slice(hlsSegment.location.offset, hlsSegment.location.length ?? void 0);
              const sliceRef = slice.ref();
              ref.free();
              ref = sliceRef;
            }
          } else if (hlsSegment.encryption.method === "AES-128") {
            const encryption = hlsSegment.encryption;
            assert(encryption.iv);
            let ciphertextRef = await this.input._getSourceCached(proxiedRequest);
            if (needsSlice) {
              const slice = ciphertextRef.source.slice(hlsSegment.location.offset, hlsSegment.location.length ?? void 0);
              const sliceRef = slice.ref();
              ciphertextRef.free();
              ciphertextRef = sliceRef;
            }
            const ciphertextReader = new Reader(ciphertextRef.source);
            const stream = createAes128CbcDecryptStream(ciphertextReader, async () => {
              const env_2 = { stack: [], error: void 0, hasError: false };
              try {
                const keyRef = __addDisposableResource(env_2, await this.input._getSourceCached({ path: encryption.keyUri, isRoot: false }, ENCRYPTION_KEY_CACHE_GROUP), false);
                const keyReader = new Reader(keyRef.source);
                const keySlice = await keyReader.requestSlice(0, AES_128_BLOCK_SIZE);
                if (!keySlice) {
                  throw new Error("Invalid AES-128 key; expected at least 16 bytes of data.");
                }
                const key = readBytes(keySlice, AES_128_BLOCK_SIZE);
                return { key, iv: encryption.iv };
              } catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
              } finally {
                __disposeResources(env_2);
              }
            }, () => {
              ciphertextRef.free();
            });
            ref = new ReadableStreamSource(stream).ref();
          } else {
            assert(false);
          }
          return ref;
        }),
        // Do not allow recursive HLS. Cool on paper, but allows for nasty infinite-depth request trees.
        formats: this.input._formats.filter((x) => !(x instanceof HlsInputFormat)),
        initInput: initInput ?? void 0,
        formatOptions
      });
      input._onFormatDetermined = (format) => {
        if ((hlsSegment.encryption?.method === "SAMPLE-AES" || hlsSegment.encryption?.method === "SAMPLE-AES-CTR") && !format._isIsobmff) {
          throw new Error("The SAMPLE-AES and SAMPLE-AES-CTR encryption methods are currently only supported for ISOBMFF files.");
        }
      };
      this.inputCache.push({
        segment: hlsSegment,
        input,
        age: this.nextInputCacheAge++
      });
      const MAX_INPUT_CACHE_SIZE = 4;
      if (this.inputCache.length > MAX_INPUT_CACHE_SIZE) {
        const minAgeIndex = arrayArgmin(this.inputCache, (x) => x.age);
        assert(minAgeIndex !== -1);
        this.inputCache.splice(minAgeIndex, 1);
      }
      return input;
    }
    async getLiveRefreshInterval() {
      if (this.getRemainingWaitTimeMs() === 0) {
        await this.runUpdateSegments();
      }
      return this.streamHasEnded ? null : this.refreshInterval;
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/hls/hls-demuxer.js
  var HlsDemuxer = class extends Demuxer {
    constructor(input) {
      super(input);
      this.metadataPromise = null;
      this.trackBackings = null;
      this.internalTracks = null;
      this.segmentedInputs = [];
      this.hasMasterPlaylist = true;
    }
    readMetadata() {
      return this.metadataPromise ??= (async () => {
        assert(this.input._rootSource instanceof PathedSource);
        const slice = await this.input._reader.requestEntireFile();
        assert(slice);
        const lines = readAllLines(slice, slice.length, { ignore: canIgnoreLine });
        const { rootPath } = this.input._rootSource;
        const variantStreams = [];
        const mediaTags = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith(TAG_STREAM_INF)) {
            const streamInfLineNumber = i;
            const playlistPath = lines[++i];
            if (playlistPath === void 0) {
              throw new Error("Incorrect M3U8 file; a line must follow the #EXT-X-STREAM-INF tag.");
            }
            const fullPath = joinPaths(rootPath, playlistPath);
            const attributes = new AttributeList(line.slice(TAG_STREAM_INF.length));
            const bandwidth = attributes.getAsNumber("bandwidth");
            if (bandwidth === null) {
              throw new Error("Invalid M3U8 file; #EXT-X-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
            }
            variantStreams.push({
              fullPath,
              attributes,
              lineNumber: streamInfLineNumber,
              hasOnlyKeyPackets: false
            });
          } else if (line.startsWith(TAG_I_FRAME_STREAM_INF)) {
            const attributes = new AttributeList(line.slice(TAG_I_FRAME_STREAM_INF.length));
            const playlistPath = attributes.get("uri");
            if (playlistPath === null) {
              throw new Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a URI attribute.");
            }
            const bandwidth = attributes.getAsNumber("bandwidth");
            if (bandwidth === null) {
              throw new Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
            }
            const fullPath = joinPaths(rootPath, playlistPath);
            variantStreams.push({
              fullPath,
              attributes,
              lineNumber: i,
              hasOnlyKeyPackets: true
            });
          } else if (line.startsWith(TAG_MEDIA)) {
            const attributes = new AttributeList(line.slice(TAG_MEDIA.length));
            const type = attributes.get("type");
            if (type === null) {
              throw new Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a TYPE attribute.");
            }
            const groupId = attributes.get("group-id");
            if (groupId === null) {
              throw new Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a GROUP-ID attribute.");
            }
            let fullPath = null;
            const uri = attributes.get("uri");
            if (uri !== null) {
              fullPath = joinPaths(rootPath, uri);
            }
            mediaTags.push({ fullPath, attributes, lineNumber: i });
          } else if (line === TAG_I_FRAMES_ONLY) {
          } else if (line.startsWith(TAG_EXTINF)) {
            const segmentedInput = new HlsSegmentedInput(this, rootPath, null, lines);
            this.segmentedInputs = [segmentedInput];
            this.hasMasterPlaylist = false;
            this.trackBackings = await segmentedInput.getTrackBackings();
            return;
          }
        }
        const videoGroupIds = [
          ...new Set(mediaTags.filter((tag) => tag.attributes.get("type").toLowerCase() === "video").map((tag) => tag.attributes.get("group-id")))
        ];
        const audioGroupIds = [
          ...new Set(mediaTags.filter((tag) => tag.attributes.get("type").toLowerCase() === "audio").map((tag) => tag.attributes.get("group-id")))
        ];
        const internalTracksByVariant = await Promise.all(variantStreams.map(async (variantStream, i) => {
          const result = [];
          const codecsList = variantStream.attributes.get("codecs");
          let codecStrings;
          if (codecsList) {
            codecStrings = codecsList.split(",").map((x) => x.trim());
          } else {
            const segmentedInput = this.getSegmentedInputForPath(variantStream.fullPath);
            const trackBackings = await segmentedInput.getTrackBackings();
            const tracksWithCodec = await Promise.all(trackBackings.map(async (t) => ({ track: t, codec: await t.getCodec() })));
            codecStrings = await Promise.all(tracksWithCodec.filter((x) => x.codec !== null).map((x) => x.track.getDecoderConfig().then((x2) => x2.codec)));
          }
          const videoGroupId = variantStream.attributes.get("video");
          const audioGroupId = variantStream.attributes.get("audio");
          const containsVideoCodecs = codecStrings.some((x) => VIDEO_CODECS.includes(inferCodecFromCodecString(x)));
          const containsAudioCodecs = codecStrings.some((x) => AUDIO_CODECS.includes(inferCodecFromCodecString(x)));
          if (videoGroupId !== null && !containsVideoCodecs) {
            if (!videoGroupIds.includes(videoGroupId)) {
              throw new Error(`Invalid M3U8 file; variant stream references video group "${videoGroupId}" which is not defined in any #EXT-X-MEDIA tags.`);
            }
            const matchingVideoMediaTag = mediaTags.find((mediaTag) => {
              const groupId = mediaTag.attributes.get("group-id");
              const type = mediaTag.attributes.get("type");
              return groupId === videoGroupId && type.toLowerCase() === "video";
            });
            outer: if (matchingVideoMediaTag) {
              const uri = matchingVideoMediaTag.attributes.get("uri");
              if (uri === null) {
                break outer;
              }
              const fullPath = joinPaths(rootPath, uri);
              const segmentedInput = this.getSegmentedInputForPath(fullPath);
              const trackBackings = await segmentedInput.getTrackBackings();
              const videoTrack = trackBackings.find((x) => x.getType() === "video");
              if (!videoTrack || await videoTrack.getCodec() === null) {
                break outer;
              }
              const additionalCodecString = await videoTrack.getDecoderConfig().then((x) => x?.codec ?? null);
              assert(additionalCodecString !== null);
              codecStrings.push(additionalCodecString);
            }
          }
          if (audioGroupId !== null && !containsAudioCodecs) {
            if (!audioGroupIds.includes(audioGroupId)) {
              throw new Error(`Invalid M3U8 file; variant stream references audio group "${audioGroupId}" which is not defined in any #EXT-X-MEDIA tags.`);
            }
            const matchingAudioMediaTag = mediaTags.find((tag) => {
              const groupId = tag.attributes.get("group-id");
              const type = tag.attributes.get("type");
              return groupId === audioGroupId && type.toLowerCase() === "audio";
            });
            outer: if (matchingAudioMediaTag) {
              const uri = matchingAudioMediaTag.attributes.get("uri");
              if (uri === null) {
                break outer;
              }
              const fullPath = joinPaths(rootPath, uri);
              const segmentedInput = this.getSegmentedInputForPath(fullPath);
              const trackBackings = await segmentedInput.getTrackBackings();
              const audioTrack = trackBackings.find((x) => x.getType() === "audio");
              if (!audioTrack || await audioTrack.getCodec() === null) {
                break outer;
              }
              const additionalCodecString = await audioTrack.getDecoderConfig().then((x) => x?.codec ?? null);
              assert(additionalCodecString !== null);
              codecStrings.push(additionalCodecString);
            }
          }
          codecStrings = [...new Set(codecStrings)];
          let videoCodecString = null;
          let audioCodecString = null;
          const bandwidth = variantStream.attributes.getAsNumber("bandwidth");
          assert(bandwidth !== null);
          const averageBandwidth = variantStream.attributes.getAsNumber("average-bandwidth");
          const name = variantStream.attributes.get("name");
          for (const codecString of codecStrings) {
            const inferredCodec = inferCodecFromCodecString(codecString);
            if (inferredCodec === null) {
              continue;
            }
            if (VIDEO_CODECS.includes(inferredCodec)) {
              if (videoCodecString !== null) {
                throw new Error("Unsupported M3U8 file; multiple video codecs found in the CODECS attribute of a variant stream.");
              }
              videoCodecString = codecString;
              const videoGroupId2 = variantStream.attributes.get("video");
              if (videoGroupId2 === null) {
                const resolution = variantStream.attributes.get("resolution");
                let width = null;
                let height = null;
                if (resolution) {
                  const match = resolution.match(/^(\d+)x(\d+)$/);
                  if (match) {
                    width = Number(match[1]);
                    height = Number(match[2]);
                  }
                }
                result.push({
                  id: -1,
                  demuxer: this,
                  backingTrack: null,
                  default: true,
                  autoselect: true,
                  languageCode: UNDETERMINED_LANGUAGE,
                  lineNumber: variantStream.lineNumber,
                  fullPath: variantStream.fullPath,
                  fullCodecString: videoCodecString,
                  pairingMask: 1n << BigInt(i),
                  peakBitrate: bandwidth,
                  averageBitrate: averageBandwidth,
                  name,
                  hasOnlyKeyPackets: variantStream.hasOnlyKeyPackets,
                  info: {
                    type: "video",
                    width,
                    height
                  }
                });
              } else {
                if (!videoGroupIds.includes(videoGroupId2)) {
                  throw new Error(`Invalid M3U8 file; variant stream references video group "${videoGroupId2}" which is not defined in any #EXT-X-MEDIA tags.`);
                }
                for (const mediaTag of mediaTags) {
                  const groupId = mediaTag.attributes.get("group-id");
                  const type = mediaTag.attributes.get("type");
                  if (groupId !== videoGroupId2 || type.toLowerCase() !== "video") {
                    continue;
                  }
                  const resolution = mediaTag.attributes.get("resolution") ?? variantStream.attributes.get("resolution");
                  let width = null;
                  let height = null;
                  if (resolution) {
                    const match = resolution.match(/^(\d+)x(\d+)$/);
                    if (match) {
                      width = Number(match[1]);
                      height = Number(match[2]);
                    }
                  }
                  result.push({
                    id: -1,
                    demuxer: this,
                    backingTrack: null,
                    default: getMediaTagDefault(mediaTag.attributes),
                    // Autoselect is inferred to be true if the default is true
                    autoselect: getMediaTagDefault(mediaTag.attributes) || getMediaTagAutoselect(mediaTag.attributes),
                    languageCode: preprocessLanguageCode(mediaTag.attributes.get("language")),
                    lineNumber: mediaTag.lineNumber,
                    fullPath: mediaTag.fullPath ?? variantStream.fullPath,
                    fullCodecString: videoCodecString,
                    pairingMask: 1n << BigInt(i),
                    peakBitrate: null,
                    averageBitrate: null,
                    name: mediaTag.attributes.get("name"),
                    hasOnlyKeyPackets: variantStream.hasOnlyKeyPackets,
                    info: {
                      type: "video",
                      width,
                      height
                    }
                  });
                }
              }
            } else if (AUDIO_CODECS.includes(inferredCodec)) {
              if (audioCodecString !== null) {
                throw new Error("Unsupported M3U8 file; multiple audio codecs found in the CODECS attribute of a variant stream.");
              }
              audioCodecString = codecString;
              const audioGroupId2 = variantStream.attributes.get("audio");
              if (audioGroupId2 === null) {
                const channels = variantStream.attributes.get("channels");
                const parsedChannels = channels !== null ? Number(channels.split("/")[0]) : null;
                result.push({
                  id: -1,
                  demuxer: this,
                  backingTrack: null,
                  default: true,
                  autoselect: true,
                  languageCode: UNDETERMINED_LANGUAGE,
                  lineNumber: variantStream.lineNumber,
                  fullPath: variantStream.fullPath,
                  fullCodecString: audioCodecString,
                  pairingMask: 1n << BigInt(i),
                  peakBitrate: bandwidth,
                  averageBitrate: averageBandwidth,
                  name,
                  hasOnlyKeyPackets: variantStream.hasOnlyKeyPackets,
                  info: {
                    type: "audio",
                    numberOfChannels: parsedChannels !== null && Number.isInteger(parsedChannels) && parsedChannels > 0 ? parsedChannels : null
                  }
                });
              } else {
                if (!audioGroupIds.includes(audioGroupId2)) {
                  throw new Error(`Invalid M3U8 file; variant stream references audio group "${audioGroupId2}" which is not defined in any #EXT-X-MEDIA tags.`);
                }
                for (const mediaTag of mediaTags) {
                  const groupId = mediaTag.attributes.get("group-id");
                  const type = mediaTag.attributes.get("type");
                  if (groupId !== audioGroupId2 || type.toLowerCase() !== "audio") {
                    continue;
                  }
                  const channels = mediaTag.attributes.get("channels") ?? variantStream.attributes.get("channels");
                  const parsedChannels = channels !== null ? Number(channels.split("/")[0]) : null;
                  result.push({
                    id: -1,
                    demuxer: this,
                    backingTrack: null,
                    default: getMediaTagDefault(mediaTag.attributes),
                    // Autoselect is inferred to be true if the default is true
                    autoselect: getMediaTagDefault(mediaTag.attributes) || getMediaTagAutoselect(mediaTag.attributes),
                    languageCode: preprocessLanguageCode(mediaTag.attributes.get("language")),
                    lineNumber: mediaTag.lineNumber,
                    fullPath: mediaTag.fullPath ?? variantStream.fullPath,
                    fullCodecString: audioCodecString,
                    pairingMask: 1n << BigInt(i),
                    peakBitrate: null,
                    averageBitrate: null,
                    name: mediaTag.attributes.get("name"),
                    hasOnlyKeyPackets: variantStream.hasOnlyKeyPackets,
                    info: {
                      type: "audio",
                      numberOfChannels: parsedChannels !== null && Number.isInteger(parsedChannels) && parsedChannels > 0 ? parsedChannels : null
                    }
                  });
                }
              }
            }
          }
          return result;
        }));
        const internalTracks = [];
        const addInternalTrack = (track) => {
          const existingTrack = internalTracks.find((x) => x.fullPath === track.fullPath && x.info.type === track.info.type);
          if (existingTrack) {
            existingTrack.pairingMask |= track.pairingMask;
            existingTrack.default ||= track.default;
            existingTrack.autoselect ||= track.autoselect;
            existingTrack.lineNumber = Math.min(existingTrack.lineNumber, track.lineNumber);
            if (track.peakBitrate !== null) {
              existingTrack.peakBitrate = Math.max(existingTrack.peakBitrate ?? -Infinity, track.peakBitrate);
            }
            if (track.averageBitrate !== null) {
              existingTrack.averageBitrate = Math.max(existingTrack.averageBitrate ?? -Infinity, track.averageBitrate);
            }
            if (existingTrack.languageCode === UNDETERMINED_LANGUAGE) {
              existingTrack.languageCode = track.languageCode;
            }
          } else {
            track.id = internalTracks.length + 1;
            internalTracks.push(track);
          }
        };
        for (const variantInternalTracks of internalTracksByVariant) {
          for (const trackEntry of variantInternalTracks) {
            addInternalTrack(trackEntry);
          }
        }
        internalTracks.sort((a, b) => a.lineNumber - b.lineNumber);
        this.trackBackings = [];
        for (const internalTrack of internalTracks) {
          if (internalTrack.info.type === "video") {
            this.trackBackings.push(new HlsInputVideoTrackBacking(internalTrack));
          } else {
            this.trackBackings.push(new HlsInputAudioTrackBacking(internalTrack));
          }
        }
        this.internalTracks = internalTracks;
      })();
    }
    async getTrackBackings() {
      await this.readMetadata();
      assert(this.trackBackings);
      return this.trackBackings;
    }
    getSegmentedInputForPath(path) {
      let segmentedInput = this.segmentedInputs.find((x) => x.path === path);
      if (segmentedInput) {
        return segmentedInput;
      }
      let decls = null;
      if (this.internalTracks) {
        const tracks = this.internalTracks.filter((x) => x.fullPath === path);
        decls = tracks.map((x) => ({
          id: x.id,
          type: x.info.type
        }));
      }
      segmentedInput = new HlsSegmentedInput(this, path, decls, null);
      this.segmentedInputs.push(segmentedInput);
      return segmentedInput;
    }
    async getMetadataTags() {
      return {};
    }
    async getMimeType() {
      return HLS_MIME_TYPE;
    }
    dispose() {
      if (this.segmentedInputs) {
        for (const segInput of this.segmentedInputs) {
          segInput.dispose();
        }
        this.segmentedInputs.length = 0;
      }
    }
  };
  var HlsInputTrackBacking = class {
    constructor(internalTrack) {
      this.internalTrack = internalTrack;
      this.hydrationPromise = null;
    }
    hydrate() {
      return this.hydrationPromise ??= (async () => {
        const segmentedInput = this.internalTrack.demuxer.getSegmentedInputForPath(this.internalTrack.fullPath);
        let trackBacking = null;
        const trackBackings = await segmentedInput.getTrackBackings();
        const matchingType = trackBackings.filter((x) => x.getType() === this.getType());
        if (matchingType.length === 1) {
          trackBacking = matchingType[0];
        } else {
          if (this instanceof HlsInputVideoTrackBacking) {
            for (const backing of matchingType) {
              if (await backing.getCodec() === this.getCodec()) {
                trackBacking = backing;
                break;
              }
            }
          } else {
            assert(this instanceof HlsInputAudioTrackBacking);
            for (const backing of matchingType) {
              if (await backing.getCodec() === this.getCodec()) {
                trackBacking = backing;
                break;
              }
            }
          }
        }
        if (!trackBacking) {
          throw new Error("Could not find matching track in underlying media data.");
        }
        this.internalTrack.backingTrack = trackBacking;
      })();
    }
    /** If the backing track is already present, delegate synchronously; otherwise, hydrate first. */
    delegate(fn) {
      if (this.internalTrack.backingTrack) {
        return fn();
      }
      return this.hydrate().then(fn);
    }
    getCodec() {
      throw new Error("Not implemented on base class.");
    }
    getDisposition() {
      return {
        ...DEFAULT_TRACK_DISPOSITION,
        // Meanings are swapped in HLS: "Default" means that a track is the primary track.
        default: this.internalTrack.autoselect,
        primary: this.internalTrack.default
      };
    }
    getId() {
      return this.internalTrack.id;
    }
    getPairingMask() {
      return this.internalTrack.pairingMask;
    }
    getInternalCodecId() {
      return null;
    }
    getLanguageCode() {
      return this.internalTrack.languageCode;
    }
    getName() {
      return this.internalTrack.name;
    }
    getNumber() {
      assert(this.internalTrack.demuxer.internalTracks);
      const trackType = this.internalTrack.info.type;
      let number = 0;
      for (const track of this.internalTrack.demuxer.internalTracks) {
        if (track.info.type === trackType) {
          number++;
        }
        if (track === this.internalTrack) {
          break;
        }
      }
      return number;
    }
    getTimeResolution() {
      return this.delegate(() => this.internalTrack.backingTrack.getTimeResolution());
    }
    isRelativeToUnixEpoch() {
      return this.delegate(() => this.internalTrack.backingTrack.isRelativeToUnixEpoch());
    }
    getUnixTimeForTimestamp(timestamp) {
      return this.delegate(() => this.internalTrack.backingTrack.getUnixTimeForTimestamp(timestamp));
    }
    getBitrate() {
      return this.internalTrack.peakBitrate;
    }
    getAverageBitrate() {
      return this.internalTrack.averageBitrate;
    }
    async getDurationFromMetadata(options) {
      await this.hydrate();
      return this.internalTrack.backingTrack.getDurationFromMetadata(options);
    }
    async getLiveRefreshInterval() {
      await this.hydrate();
      return this.internalTrack.backingTrack.getLiveRefreshInterval();
    }
    getHasOnlyKeyPackets() {
      return this.internalTrack.hasOnlyKeyPackets || null;
    }
    async getFirstPacket(options) {
      await this.hydrate();
      return this.internalTrack.backingTrack.getFirstPacket(options);
    }
    async getPacket(timestamp, options) {
      await this.hydrate();
      return this.internalTrack.backingTrack.getPacket(timestamp, options);
    }
    async getKeyPacket(timestamp, options) {
      await this.hydrate();
      return this.internalTrack.backingTrack.getKeyPacket(timestamp, options);
    }
    async getNextPacket(packet, options) {
      await this.hydrate();
      return this.internalTrack.backingTrack.getNextPacket(packet, options);
    }
    async getNextKeyPacket(packet, options) {
      await this.hydrate();
      return this.internalTrack.backingTrack.getNextKeyPacket(packet, options);
    }
  };
  var HlsInputVideoTrackBacking = class extends HlsInputTrackBacking {
    constructor(internalTrack) {
      super(internalTrack);
    }
    get backingVideoTrack() {
      return this.internalTrack.backingTrack;
    }
    getType() {
      return "video";
    }
    getCodec() {
      const inferredCodec = inferCodecFromCodecString(this.internalTrack.fullCodecString);
      return inferredCodec;
    }
    getCodedWidth() {
      return this.delegate(() => this.backingVideoTrack.getCodedWidth());
    }
    getCodedHeight() {
      return this.delegate(() => this.backingVideoTrack.getCodedHeight());
    }
    getSquarePixelWidth() {
      return this.delegate(() => this.backingVideoTrack.getSquarePixelWidth());
    }
    getSquarePixelHeight() {
      return this.delegate(() => this.backingVideoTrack.getSquarePixelHeight());
    }
    getMetadataDisplayWidth() {
      if (this.backingVideoTrack) {
        return null;
      }
      return this.internalTrack.info.width;
    }
    getMetadataDisplayHeight() {
      if (this.backingVideoTrack) {
        return null;
      }
      return this.internalTrack.info.height;
    }
    getRotation() {
      return this.delegate(() => this.backingVideoTrack.getRotation());
    }
    async getColorSpace() {
      await this.hydrate();
      return this.backingVideoTrack.getColorSpace();
    }
    async canBeTransparent() {
      await this.hydrate();
      return this.backingVideoTrack.canBeTransparent();
    }
    getMetadataCodecParameterString() {
      if (this.backingVideoTrack) {
        return null;
      }
      return this.internalTrack.fullCodecString;
    }
    async getDecoderConfig() {
      await this.hydrate();
      return this.backingVideoTrack.getDecoderConfig();
    }
  };
  var HlsInputAudioTrackBacking = class extends HlsInputTrackBacking {
    constructor(internalTrack) {
      super(internalTrack);
    }
    get backingAudioTrack() {
      return this.internalTrack.backingTrack;
    }
    getType() {
      return "audio";
    }
    getCodec() {
      const inferredCodec = inferCodecFromCodecString(this.internalTrack.fullCodecString);
      return inferredCodec;
    }
    getNumberOfChannels() {
      if (this.internalTrack.info.numberOfChannels !== null) {
        return this.internalTrack.info.numberOfChannels;
      }
      return this.delegate(() => this.backingAudioTrack.getNumberOfChannels());
    }
    getSampleRate() {
      return this.delegate(() => this.backingAudioTrack.getSampleRate());
    }
    getMetadataCodecParameterString() {
      if (this.backingAudioTrack) {
        return null;
      }
      return this.internalTrack.fullCodecString;
    }
    async getDecoderConfig() {
      await this.hydrate();
      return this.backingAudioTrack.getDecoderConfig();
    }
  };
  var getMediaTagDefault = (attributes) => {
    const value = attributes.get("default");
    if (value === null) {
      return false;
    }
    const normalized = value.toUpperCase();
    if (normalized === "YES") {
      return true;
    }
    if (normalized === "NO") {
      return false;
    }
    throw new Error(`Invalid M3U8 file; #EXT-X-MEDIA DEFAULT attribute must be YES or NO, got "${value}".`);
  };
  var getMediaTagAutoselect = (attributes) => {
    const value = attributes.get("autoselect");
    if (value === null) {
      return false;
    }
    const normalized = value.toUpperCase();
    if (normalized === "YES") {
      return true;
    }
    if (normalized === "NO") {
      return false;
    }
    throw new Error(`Invalid M3U8 file; #EXT-X-MEDIA AUTOSELECT attribute must be YES or NO, got "${value}".`);
  };
  var preprocessLanguageCode = (code) => {
    if (code === null) {
      return UNDETERMINED_LANGUAGE;
    }
    const languageSubtag = code.split("-")[0];
    if (!languageSubtag) {
      return UNDETERMINED_LANGUAGE;
    }
    return languageSubtag;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/input-format.js
  var InputFormat = class {
    constructor() {
      this._isIsobmff = false;
    }
  };
  var IsobmffInputFormat = class extends InputFormat {
    constructor() {
      super(...arguments);
      this._isIsobmff = true;
    }
    /** @internal */
    async _getMajorBrand(input) {
      let slice = input._reader.requestSlice(0, 12);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return null;
      slice.skip(4);
      const fourCc = readAscii(slice, 4);
      if (fourCc !== "ftyp" && fourCc !== "styp") {
        return null;
      }
      return readAscii(slice, 4);
    }
    /** @internal */
    _createDemuxer(input) {
      return new IsobmffDemuxer(input);
    }
  };
  var Mp4InputFormat = class extends IsobmffInputFormat {
    /** @internal */
    async _canReadInput(input) {
      const majorBrand = await this._getMajorBrand(input);
      if (majorBrand !== null) {
        return majorBrand !== "qt  ";
      }
      let slice = input._reader.requestSlice(4, 4);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return false;
      const fourCc = readAscii(slice, 4);
      return fourCc === "moof" || fourCc === "sidx";
    }
    get name() {
      return "MP4";
    }
    get mimeType() {
      return "video/mp4";
    }
  };
  var QuickTimeInputFormat = class extends IsobmffInputFormat {
    /** @internal */
    async _canReadInput(input) {
      const majorBrand = await this._getMajorBrand(input);
      return majorBrand === "qt  ";
    }
    get name() {
      return "QuickTime File Format";
    }
    get mimeType() {
      return "video/quicktime";
    }
  };
  var Mp3InputFormat = class extends InputFormat {
    /** @internal */
    async _canReadInput(input) {
      let currentPos = 0;
      while (true) {
        let slice2 = input._reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
        if (slice2 instanceof Promise)
          slice2 = await slice2;
        if (!slice2)
          break;
        const id3V2Header = readId3V2Header(slice2);
        if (!id3V2Header) {
          break;
        }
        currentPos = slice2.filePos + id3V2Header.size;
      }
      const firstResult = await readNextMp3FrameHeader(input._reader, currentPos, currentPos + 4096);
      if (!firstResult) {
        return false;
      }
      const firstHeader = firstResult.header;
      const xingOffset = getXingOffset(firstHeader.mpegVersionId, firstHeader.channel);
      let slice = input._reader.requestSlice(firstResult.startPos + xingOffset, 4);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return false;
      const word = readU32Be(slice);
      const isXing = word === XING || word === INFO;
      if (isXing) {
        return true;
      }
      currentPos = firstResult.startPos + firstResult.header.totalSize;
      const secondResult = await readNextMp3FrameHeader(input._reader, currentPos, currentPos + MP3_FRAME_HEADER_SIZE);
      if (!secondResult) {
        return false;
      }
      const secondHeader = secondResult.header;
      if (firstHeader.channel !== secondHeader.channel || firstHeader.sampleRate !== secondHeader.sampleRate) {
        return false;
      }
      return true;
    }
    /** @internal */
    _createDemuxer(input) {
      return new Mp3Demuxer(input);
    }
    get name() {
      return "MP3";
    }
    get mimeType() {
      return "audio/mpeg";
    }
  };
  var AdtsInputFormat = class extends InputFormat {
    /** @internal */
    async _canReadInput(input) {
      let currentPos = 0;
      while (true) {
        let slice2 = input._reader.requestSlice(currentPos, ID3_V2_HEADER_SIZE);
        if (slice2 instanceof Promise)
          slice2 = await slice2;
        if (!slice2)
          break;
        const id3V2Header = readId3V2Header(slice2);
        if (!id3V2Header) {
          break;
        }
        currentPos = slice2.filePos + id3V2Header.size;
      }
      let slice = input._reader.requestSliceRange(currentPos, MIN_ADTS_FRAME_HEADER_SIZE, MAX_ADTS_FRAME_HEADER_SIZE);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return false;
      const firstHeader = readAdtsFrameHeader(slice);
      if (!firstHeader) {
        return false;
      }
      currentPos += firstHeader.frameLength;
      slice = input._reader.requestSliceRange(currentPos, MIN_ADTS_FRAME_HEADER_SIZE, MAX_ADTS_FRAME_HEADER_SIZE);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return false;
      const secondHeader = readAdtsFrameHeader(slice);
      if (!secondHeader) {
        return false;
      }
      return firstHeader.objectType === secondHeader.objectType && firstHeader.samplingFrequencyIndex === secondHeader.samplingFrequencyIndex && firstHeader.channelConfiguration === secondHeader.channelConfiguration;
    }
    /** @internal */
    _createDemuxer(input) {
      return new AdtsDemuxer(input);
    }
    get name() {
      return "ADTS";
    }
    get mimeType() {
      return "audio/aac";
    }
  };
  var MpegTsInputFormat = class extends InputFormat {
    /** @internal */
    async _canReadInput(input) {
      const lengthToCheck = TS_PACKET_SIZE + 16 + 1;
      let slice = input._reader.requestSlice(0, lengthToCheck);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return false;
      const bytes2 = readBytes(slice, lengthToCheck);
      if (bytes2[0] === 71 && bytes2[TS_PACKET_SIZE] === 71) {
        return true;
      } else if (bytes2[0] === 71 && bytes2[TS_PACKET_SIZE + 16] === 71) {
        return true;
      } else if (bytes2[4] === 71 && bytes2[4 + TS_PACKET_SIZE + 4] === 71) {
        return true;
      }
      return false;
    }
    /** @internal */
    _createDemuxer(input) {
      return new MpegTsDemuxer(input);
    }
    get name() {
      return "MPEG Transport Stream";
    }
    get mimeType() {
      return "video/MP2T";
    }
  };
  var HlsInputFormat = class extends InputFormat {
    /** @internal */
    async _canReadInput(input) {
      let slice = input._reader.requestSlice(0, 7);
      if (slice instanceof Promise)
        slice = await slice;
      if (!slice)
        return false;
      const isM3u8 = readAscii(slice, 7) === "#EXTM3U";
      if (!isM3u8) {
        return false;
      }
      if (!(input._rootSource instanceof PathedSource)) {
        throw new TypeError("HLS inputs require `InputOptions.source` to be a PathedSource or a ref to one.");
      }
      input._rootSource._usedForHls = true;
      return true;
    }
    /** @internal */
    _createDemuxer(input) {
      return new HlsDemuxer(input);
    }
    get name() {
      return "HTTP Live Streaming (HLS)";
    }
    get mimeType() {
      return HLS_MIME_TYPE;
    }
  };
  var MP4 = /* @__PURE__ */ new Mp4InputFormat();
  var QTFF = /* @__PURE__ */ new QuickTimeInputFormat();
  var MP3 = /* @__PURE__ */ new Mp3InputFormat();
  var ADTS = /* @__PURE__ */ new AdtsInputFormat();
  var MPEG_TS = /* @__PURE__ */ new MpegTsInputFormat();
  var HLS = /* @__PURE__ */ new HlsInputFormat();
  var HLS_FORMATS = [HLS, MP4, QTFF, MP3, ADTS, MPEG_TS];
  var validateInputFormatOptions = (options, prefix) => {
    if (!options || typeof options !== "object") {
      throw new TypeError(`${prefix}, when provided, must be an object.`);
    }
    if (options.isobmff !== void 0) {
      if (!options.isobmff || typeof options.isobmff !== "object") {
        throw new TypeError(`${prefix}.isobmff, when provided, must be an object.`);
      }
      if (options.isobmff.resolveKeyId !== void 0 && typeof options.isobmff.resolveKeyId !== "function") {
        throw new TypeError(`${prefix}.isobmff.resolveKeyId, when provided, must be a function.`);
      }
    }
    if (options.hls !== void 0) {
      if (!options.hls || typeof options.hls !== "object") {
        throw new TypeError(`${prefix}.hls, when provided, must be an object.`);
      }
      if (options.hls.offsetTimestampsByDateTime !== void 0 && typeof options.hls.offsetTimestampsByDateTime !== "boolean") {
        throw new TypeError(`${prefix}.hls.offsetTimestampsByDateTime, when provided, must be a boolean.`);
      }
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/custom-coder.js
  var customVideoDecoders = [];
  var customAudioDecoders = [];

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/media-sink.js
  var validatePacketRetrievalOptions = (options) => {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.metadataOnly !== void 0 && typeof options.metadataOnly !== "boolean") {
      throw new TypeError("options.metadataOnly, when defined, must be a boolean.");
    }
    if (options.verifyKeyPackets !== void 0 && typeof options.verifyKeyPackets !== "boolean") {
      throw new TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
    }
    if (options.verifyKeyPackets && options.metadataOnly) {
      throw new TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
    }
    if (options.skipLiveWait !== void 0 && typeof options.skipLiveWait !== "boolean") {
      throw new TypeError("options.skipLiveWait, when defined, must be a boolean.");
    }
  };
  var validateTimestamp = (timestamp) => {
    if (!isNumber(timestamp)) {
      throw new TypeError("timestamp must be a number.");
    }
  };
  var maybeFixPacketType = (track, promise, options) => {
    if (options.verifyKeyPackets) {
      return promise.then(async (packet) => {
        if (!packet || packet.type === "delta") {
          return packet;
        }
        const determinedType = await track.determinePacketType(packet);
        if (determinedType) {
          packet.type = determinedType;
        }
        return packet;
      });
    } else {
      return promise;
    }
  };
  var EncodedPacketSink = class {
    /** Creates a new {@link EncodedPacketSink} for the given {@link InputTrack}. */
    constructor(track) {
      if (!(track instanceof InputTrack)) {
        throw new TypeError("track must be an InputTrack.");
      }
      this._track = track;
    }
    /**
     * Retrieves the track's first packet (in decode order), or null if it has no packets. The first packet is very
     * likely to be a key packet, but it doesn't have to be.
     */
    async getFirstPacket(options = {}) {
      validatePacketRetrievalOptions(options);
      if (this._track.input._disposed) {
        throw new InputDisposedError();
      }
      return maybeFixPacketType(this._track, this._track._backing.getFirstPacket(options), options);
    }
    /** Retrieves the track's first key packet (in decode order), or null if it has no key packets. */
    async getFirstKeyPacket(options = {}) {
      validatePacketRetrievalOptions(options);
      const firstPacket = await this.getFirstPacket(options);
      if (!firstPacket) {
        return null;
      }
      if (firstPacket.type === "key") {
        return firstPacket;
      }
      return this.getNextKeyPacket(firstPacket, options);
    }
    /**
     * Retrieves the packet corresponding to the given timestamp, in seconds. More specifically, returns the last packet
     * (in presentation order) with a start timestamp less than or equal to the given timestamp. This method can be
     * used to retrieve a track's last packet using `getPacket(Infinity)`. The method returns null if the timestamp
     * is before the first packet in the track.
     *
     * @param timestamp - The timestamp used for retrieval, in seconds.
     */
    async getPacket(timestamp, options = {}) {
      validateTimestamp(timestamp);
      validatePacketRetrievalOptions(options);
      if (this._track.input._disposed) {
        throw new InputDisposedError();
      }
      return maybeFixPacketType(this._track, this._track._backing.getPacket(timestamp, options), options);
    }
    /**
     * Retrieves the packet following the given packet (in decode order), or null if the given packet is the
     * last packet.
     */
    async getNextPacket(packet, options = {}) {
      if (!(packet instanceof EncodedPacket)) {
        throw new TypeError("packet must be an EncodedPacket.");
      }
      validatePacketRetrievalOptions(options);
      if (this._track.input._disposed) {
        throw new InputDisposedError();
      }
      return maybeFixPacketType(this._track, this._track._backing.getNextPacket(packet, options), options);
    }
    /**
     * Retrieves the key packet corresponding to the given timestamp, in seconds. More specifically, returns the last
     * key packet (in presentation order) with a start timestamp less than or equal to the given timestamp. A key packet
     * is a packet that doesn't require previous packets to be decoded. This method can be used to retrieve a track's
     * last key packet using `getKeyPacket(Infinity)`. The method returns null if the timestamp is before the first
     * key packet in the track.
     *
     * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
     *
     * @param timestamp - The timestamp used for retrieval, in seconds.
     */
    async getKeyPacket(timestamp, options = {}) {
      validateTimestamp(timestamp);
      validatePacketRetrievalOptions(options);
      if (this._track.input._disposed) {
        throw new InputDisposedError();
      }
      if (!options.verifyKeyPackets) {
        return this._track._backing.getKeyPacket(timestamp, options);
      }
      const packet = await this._track._backing.getKeyPacket(timestamp, options);
      if (!packet) {
        return packet;
      }
      assert(packet.type === "key");
      const determinedType = await this._track.determinePacketType(packet);
      if (determinedType === "delta") {
        return this.getKeyPacket(packet.timestamp - 1 / await this._track.getTimeResolution(), options);
      }
      return packet;
    }
    /**
     * Retrieves the key packet following the given packet (in decode order), or null if the given packet is the last
     * key packet.
     *
     * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
     */
    async getNextKeyPacket(packet, options = {}) {
      if (!(packet instanceof EncodedPacket)) {
        throw new TypeError("packet must be an EncodedPacket.");
      }
      validatePacketRetrievalOptions(options);
      if (this._track.input._disposed) {
        throw new InputDisposedError();
      }
      if (!options.verifyKeyPackets) {
        return this._track._backing.getNextKeyPacket(packet, options);
      }
      const nextPacket = await this._track._backing.getNextKeyPacket(packet, options);
      if (!nextPacket) {
        return nextPacket;
      }
      assert(nextPacket.type === "key");
      const determinedType = await this._track.determinePacketType(nextPacket);
      if (determinedType === "delta") {
        return this.getNextKeyPacket(nextPacket, options);
      }
      return nextPacket;
    }
    /**
     * Creates an async iterator that yields the packets in this track in decode order. To enable fast iteration, this
     * method will intelligently preload packets based on the speed of the consumer.
     *
     * @param startPacket - (optional) The packet from which iteration should begin. This packet will also be yielded.
     * @param endPacket - (optional) The packet at which iteration should end. This packet will _not_ be yielded.
     */
    packets(startPacket, endPacket, options = {}) {
      if (startPacket !== void 0 && !(startPacket instanceof EncodedPacket)) {
        throw new TypeError("startPacket must be an EncodedPacket.");
      }
      if (startPacket !== void 0 && startPacket.isMetadataOnly && !options?.metadataOnly) {
        throw new TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
      }
      if (endPacket !== void 0 && !(endPacket instanceof EncodedPacket)) {
        throw new TypeError("endPacket must be an EncodedPacket.");
      }
      validatePacketRetrievalOptions(options);
      if (this._track.input._disposed) {
        throw new InputDisposedError();
      }
      const packetQueue = [];
      let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
      let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
      let ended = false;
      let terminated = false;
      let outOfBandError = null;
      let hasOutOfBandError = false;
      const timestamps = [];
      const maxQueueSize = () => Math.max(2, timestamps.length);
      (async () => {
        let packet = startPacket ?? await this.getFirstPacket(options);
        while (packet && !terminated && !this._track.input._disposed) {
          if (endPacket && packet.sequenceNumber >= endPacket?.sequenceNumber) {
            break;
          }
          if (packetQueue.length > maxQueueSize()) {
            ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
            await queueDequeue;
            continue;
          }
          packetQueue.push(packet);
          onQueueNotEmpty();
          ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
          packet = await this.getNextPacket(packet, options);
        }
        ended = true;
        onQueueNotEmpty();
      })().catch((error) => {
        if (!hasOutOfBandError) {
          outOfBandError = error;
          hasOutOfBandError = true;
          onQueueNotEmpty();
        }
      });
      const track = this._track;
      return {
        async next() {
          while (true) {
            if (track.input._disposed) {
              throw new InputDisposedError();
            } else if (terminated) {
              return { value: void 0, done: true };
            } else if (hasOutOfBandError) {
              throw outOfBandError;
            } else if (packetQueue.length > 0) {
              const value = packetQueue.shift();
              const now = performance.now();
              timestamps.push(now);
              while (timestamps.length > 0 && now - timestamps[0] >= 1e3) {
                timestamps.shift();
              }
              onQueueDequeue();
              return { value, done: false };
            } else if (ended) {
              return { value: void 0, done: true };
            } else {
              await queueNotEmpty;
            }
          }
        },
        async return() {
          terminated = true;
          onQueueDequeue();
          onQueueNotEmpty();
          return { value: void 0, done: true };
        },
        async throw(error) {
          throw error;
        },
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/input-track.js
  var InputTrack = class _InputTrack {
    /** @internal */
    constructor(input, backing) {
      this.input = input;
      this._backing = backing;
    }
    /** Returns true if and only if this track is a video track. */
    isVideoTrack() {
      return this instanceof InputVideoTrack;
    }
    /** Returns true if and only if this track is an audio track. */
    isAudioTrack() {
      return this instanceof InputAudioTrack;
    }
    /** The unique ID of this track in the input file. */
    get id() {
      return this._backing.getId();
    }
    /**
     * The 1-based index of this track among all tracks of the same type in the input file. For example, the first
     * video track has number 1, the second video track has number 2, and so on. The index refers to the order in
     * which the tracks are returned by {@link Input.getTracks}.
     */
    get number() {
      return this._backing.getNumber();
    }
    /**
     * Returns the identifier of the codec used internally by the container. It is not homogenized by Mediabunny
     * and depends entirely on the container format.
     *
     * This method can be used to determine the codec of a track in case Mediabunny doesn't know that codec.
     *
     * - For ISOBMFF files, this resolves to the name of the Sample Description Box (e.g. `'avc1'`).
     * - For Matroska files, this resolves to the value of the `CodecID` element.
     * - For WAVE files, this resolves to the value of the format tag in the `'fmt '` chunk.
     * - For ADTS files, this resolves to the `MPEG-4 Audio Object Type`.
     * - For MPEG-TS files, this resolves to the `streamType` value from the Program Map Table.
     * - In all other cases, this resolves to `null`.
     */
    async getInternalCodecId() {
      return this._backing.getInternalCodecId();
    }
    /**
     * See {@link InputTrack.getInternalCodecId}.
     * @deprecated Use {@link InputTrack.getInternalCodecId} instead.
     */
    get internalCodecId() {
      return requireSync(this._backing.getInternalCodecId(), "internalCodecId", "getInternalCodecId");
    }
    /**
     * Returns the ISO 639-2/T language code for this track. If the language is unknown, this resolves to `'und'`
     * (undetermined).
     */
    async getLanguageCode() {
      return this._backing.getLanguageCode();
    }
    /**
     * The ISO 639-2/T language code for this track. If the language is unknown, this field is `'und'` (undetermined).
     * @deprecated Use {@link InputTrack.getLanguageCode} instead.
     */
    get languageCode() {
      return requireSync(this._backing.getLanguageCode(), "languageCode", "getLanguageCode");
    }
    /** Returns the user-defined name for this track. */
    async getName() {
      return this._backing.getName();
    }
    /**
     * A user-defined name for this track.
     * @deprecated Use {@link InputTrack.getName} instead.
     */
    get name() {
      return requireSync(this._backing.getName(), "name", "getName");
    }
    /**
     * Returns a positive number x such that all timestamps and durations of all packets of this track are
     * integer multiples of 1/x.
     */
    async getTimeResolution() {
      return this._backing.getTimeResolution();
    }
    /**
     * A positive number x such that all timestamps and durations of all packets of this track are
     * integer multiples of 1/x.
     * @deprecated Use {@link InputTrack.getTimeResolution} instead.
     */
    get timeResolution() {
      return requireSync(this._backing.getTimeResolution(), "timeResolution", "getTimeResolution");
    }
    /**
     * Returns whether the timestamps of this track are relative to the Unix epoch (January 1, 1970 00:00:00 UTC).
     * When `true`, each timestamp maps to a definitive point in time.
     */
    async isRelativeToUnixEpoch() {
      return this._backing.isRelativeToUnixEpoch();
    }
    /**
     * Returns the Unix time (in seconds since January 1, 1970 00:00:00 UTC) that the given track timestamp (in seconds)
     * maps to, or `null` if there is no such mapping. This provides a piecewise-continuous mapping from this track's
     * timestamp space into wall-clock time. Such mapping exists, for example, for HLS playlists with
     * `#EXT-X-PROGRAM-DATE-TIME` tags present.
     *
     * This mapping can be available even when {@link InputTrack.isRelativeToUnixEpoch} is `false`, for example for HLS
     * streams with program date time information but with {@link HlsInputFormatOptions.offsetTimestampsByDateTime}
     * set to `false`.
     */
    async getUnixTimeForTimestamp(timestamp) {
      return this._backing.getUnixTimeForTimestamp(timestamp);
    }
    /**
     * Whether the track's timestamps can be mapped to Unix wall clock time via
     * {@link InputTrack.getUnixTimeForTimestamp}.
     */
    async hasUnixTimeMapping() {
      return await this._backing.getUnixTimeForTimestamp(await this.getFirstTimestamp()) !== null;
    }
    /** Returns the track's disposition, i.e. information about its intended usage. */
    async getDisposition() {
      return this._backing.getDisposition();
    }
    /**
     * The track's disposition, i.e. information about its intended usage.
     * @deprecated Use {@link InputTrack.getDisposition} instead.
     */
    get disposition() {
      return requireSync(this._backing.getDisposition(), "disposition", "getDisposition");
    }
    /**
     * Returns the peak bitrate of the track in bits per second, as specified in the track's metadata. This might not
     * match the actual media data's bitrate.
     */
    async getBitrate() {
      return this._backing.getBitrate();
    }
    /**
     * Returns the average bitrate of the track in bits per second, as specified in the track's metadata. This might
     * not match the actual media data's bitrate.
     */
    async getAverageBitrate() {
      return this._backing.getAverageBitrate();
    }
    /**
     * Returns the start timestamp of the first packet of this track, in seconds. While often near zero, this value
     * may be positive or even negative. A negative starting timestamp means the track's timing has been offset. Samples
     * with a negative timestamp should not be presented.
     */
    async getFirstTimestamp() {
      const firstPacket = await this._backing.getFirstPacket({ metadataOnly: true });
      return firstPacket?.timestamp ?? 0;
    }
    /**
     * Returns the end timestamp of the last packet of this track, in seconds.
     *
     * By default, when the underlying media is live, this method will only resolve once the live stream ends. If you
     * want to query the current end timestamp of the stream, set {@link PacketRetrievalOptions.skipLiveWait} to `true`
     * in the options.
     */
    async computeDuration(options) {
      const lastPacket = await this._backing.getPacket(Infinity, { metadataOnly: true, ...options });
      const result = (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
      return roundToDivisor(result, await this.getTimeResolution());
    }
    /**
     * Gets the duration (end timestamp) in seconds of this track from metadata stored in the file. This value may be
     * approximate or diverge from the actual, precise duration returned by `.computeDuration()`, but compared to that
     * method, this method is cheaper. When the duration cannot be determined from the file metadata, `null`
     * is returned.
     *
     * By default, when the underlying media is live, this method will only resolve once the live stream
     * ends. If you want to query the current duration of the media, set
     * {@link DurationMetadataRequestOptions.skipLiveWait} to `true` in the options.
     */
    async getDurationFromMetadata(options = {}) {
      return this._backing.getDurationFromMetadata(options);
    }
    /**
     * Computes aggregate packet statistics for this track, such as average packet rate or bitrate.
     *
     * @param targetPacketCount - This optional parameter sets a target for how many packets this method must have
     * looked at before it can return early; this means, you can use it to aggregate only a subset (prefix) of all
     * packets. This is very useful for getting a great estimate of video frame rate without having to scan through the
     * entire file.
     *
     * By default, when the underlying media is live and `targetPacketCount` is not set, this method will only resolve
     * once the live stream ends. If you want to query the current packet statistics of the stream, set
     * {@link PacketRetrievalOptions.skipLiveWait} to `true` in the options.
     */
    async computePacketStats(targetPacketCount = Infinity, options) {
      const sink = new EncodedPacketSink(this);
      let startTimestamp = Infinity;
      let endTimestamp = -Infinity;
      let packetCount = 0;
      let totalPacketBytes = 0;
      for await (const packet of sink.packets(void 0, void 0, { metadataOnly: true, ...options })) {
        if (packetCount >= targetPacketCount && packet.timestamp >= endTimestamp) {
          break;
        }
        startTimestamp = Math.min(startTimestamp, packet.timestamp);
        endTimestamp = Math.max(endTimestamp, packet.timestamp + packet.duration);
        packetCount++;
        totalPacketBytes += packet.byteLength;
      }
      return {
        packetCount,
        averagePacketRate: packetCount ? Number((packetCount / (endTimestamp - startTimestamp)).toPrecision(16)) : 0,
        averageBitrate: packetCount ? Number((8 * totalPacketBytes / (endTimestamp - startTimestamp)).toPrecision(16)) : 0
      };
    }
    /**
     * Whether or not this track is currently live, meaning the media's end is still unknown.
     *
     * The value returned by this method may change over time as the track stops being live. To keep track of the
     * track's live status, poll this method at the track's refresh interval
     * via {@link InputTrack.getLiveRefreshInterval}.
     */
    async isLive() {
      return await this._backing.getLiveRefreshInterval() !== null;
    }
    /**
     * Returns the track's live refresh interval in seconds, or `null` if the track is not live. This interval describes
     * the time it takes, on average, for new live media data to become available.
     */
    async getLiveRefreshInterval() {
      return this._backing.getLiveRefreshInterval();
    }
    /**
     * Returns `true` if this track can be paired with the given track. Two tracks being pairable means they can be
     * presented (displayed) together.
     *
     * Returns `false` if `other` equals `this`.
     */
    canBePairedWith(other) {
      if (!(other instanceof _InputTrack)) {
        throw new TypeError("other must be an InputTrack.");
      }
      if (this.input !== other.input || this === other) {
        return false;
      }
      return (this._backing.getPairingMask() & other._backing.getPairingMask()) !== 0n;
    }
    /**
     * Gets the list of other tracks that can be paired with this track. An optional query can be provided to narrow
     * down the results.
     */
    async getPairableTracks(query) {
      return this.input.getTracks(mergeInputTrackQueries({
        filter: (t) => t.canBePairedWith(this)
      }, query));
    }
    /**
     * Gets the list of other video tracks that can be paired with this track. An optional query can be provided to
     * narrow down the results.
     */
    async getPairableVideoTracks(query) {
      return this.input.getVideoTracks(mergeInputTrackQueries({
        filter: (t) => t.canBePairedWith(this)
      }, query));
    }
    /**
     * Gets the list of other audio tracks that can be paired with this track. An optional query can be provided to
     * narrow down the results.
     */
    async getPairableAudioTracks(query) {
      return this.input.getAudioTracks(mergeInputTrackQueries({
        filter: (t) => t.canBePairedWith(this)
      }, query));
    }
    /** Returns the primary track that can be paired with this track, optionally steered by the provided query. */
    async getPrimaryPairableVideoTrack(query) {
      return this.input.getPrimaryVideoTrack(mergeInputTrackQueries({
        filter: (t) => t.canBePairedWith(this)
      }, query));
    }
    /** Returns the primary track that can be paired with this track, optionally steered by the provided query. */
    async getPrimaryPairableAudioTrack(query) {
      return this.input.getPrimaryAudioTrack(mergeInputTrackQueries({
        filter: (t) => t.canBePairedWith(this)
      }, query));
    }
    /** Returns `true` if there is another track that can be paired with this track. */
    async hasPairableTrack(predicate) {
      predicate &&= toValidatedPredicate(predicate);
      const tracks = await this.input.getTracks();
      for (const track of tracks) {
        if (!this.canBePairedWith(track)) {
          continue;
        }
        if (!predicate || await predicate(track)) {
          return true;
        }
      }
      return false;
    }
    /** Returns `true` if there is a video track that can be paired with this track. */
    hasPairableVideoTrack(predicate) {
      predicate &&= toValidatedPredicate(predicate);
      return this.hasPairableTrack(async (x) => x.isVideoTrack() && (!predicate || await predicate(x)));
    }
    /** Returns `true` if there is an audio track that can be paired with this track. */
    hasPairableAudioTrack(predicate) {
      predicate &&= toValidatedPredicate(predicate);
      return this.hasPairableTrack(async (x) => x.isAudioTrack() && (!predicate || await predicate(x)));
    }
  };
  var requireSync = (value, getterName, asyncName) => {
    if (value instanceof Promise) {
      throw new Error(`'${getterName}' is deprecated and not available synchronously for this track. Use the preferred '${asyncName}()' instead.`);
    }
    return value;
  };
  var toValidatedPredicate = (predicate) => {
    if (predicate !== void 0 && typeof predicate !== "function") {
      throw new TypeError("predicate, when provided, must be a function.");
    }
    return predicate ? (track) => {
      const handle = (result2) => {
        if (typeof result2 !== "boolean") {
          throw new TypeError("predicate must return or resolve to a boolean value.");
        }
        return result2;
      };
      const result = predicate(track);
      if (result instanceof Promise) {
        return result.then(handle);
      }
      return handle(result);
    } : void 0;
  };
  var InputVideoTrack = class extends InputTrack {
    /** @internal */
    constructor(input, backing) {
      super(input, backing);
      this._pixelAspectRatioCache = null;
      this._backing = backing;
    }
    get type() {
      return "video";
    }
    /** The codec of the track's packets. */
    async getCodec() {
      return this._backing.getCodec();
    }
    /**
     * The codec of the track's packets.
     * @deprecated Use {@link InputVideoTrack.getCodec} instead.
     */
    get codec() {
      return requireSync(this._backing.getCodec(), "codec", "getCodec");
    }
    async hasOnlyKeyPackets() {
      return await this._backing.getHasOnlyKeyPackets?.() ?? await this._backing.getCodec() === "prores";
    }
    /** Returns the width in pixels of the track's coded samples, before any transformations or rotations. */
    async getCodedWidth() {
      return this._backing.getCodedWidth();
    }
    /**
     * The width in pixels of the track's coded samples, before any transformations or rotations.
     * @deprecated Use {@link InputVideoTrack.getCodedWidth} instead.
     */
    get codedWidth() {
      return requireSync(this._backing.getCodedWidth(), "codedWidth", "getCodedWidth");
    }
    /** Returns the height in pixels of the track's coded samples, before any transformations or rotations. */
    async getCodedHeight() {
      return this._backing.getCodedHeight();
    }
    /**
     * The height in pixels of the track's coded samples, before any transformations or rotations.
     * @deprecated Use {@link InputVideoTrack.getCodedHeight} instead.
     */
    get codedHeight() {
      return requireSync(this._backing.getCodedHeight(), "codedHeight", "getCodedHeight");
    }
    /** Returns the angle in degrees by which the track's frames should be rotated (clockwise). */
    async getRotation() {
      return this._backing.getRotation();
    }
    /**
     * The angle in degrees by which the track's frames should be rotated (clockwise).
     * @deprecated Use {@link InputVideoTrack.getRotation} instead.
     */
    get rotation() {
      return requireSync(this._backing.getRotation(), "rotation", "getRotation");
    }
    /**
     * Returns the width of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
     */
    async getSquarePixelWidth() {
      return this._backing.getSquarePixelWidth();
    }
    /**
     * The width of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
     * @deprecated Use {@link InputVideoTrack.getSquarePixelWidth} instead.
     */
    get squarePixelWidth() {
      return requireSync(this._backing.getSquarePixelWidth(), "squarePixelWidth", "getSquarePixelWidth");
    }
    /**
     * Returns the height of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
     */
    async getSquarePixelHeight() {
      return this._backing.getSquarePixelHeight();
    }
    /**
     * The height of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
     * @deprecated Use {@link InputVideoTrack.getSquarePixelHeight} instead.
     */
    get squarePixelHeight() {
      return requireSync(this._backing.getSquarePixelHeight(), "squarePixelHeight", "getSquarePixelHeight");
    }
    /**
     * Returns the pixel aspect ratio of the track's frames as a rational number in its reduced form. Most videos use
     * square pixels (1:1).
     */
    async getPixelAspectRatio() {
      return this._pixelAspectRatioCache ??= simplifyRational({
        num: await this.getSquarePixelWidth() * await this.getCodedHeight(),
        den: await this.getSquarePixelHeight() * await this.getCodedWidth()
      });
    }
    /**
     * The pixel aspect ratio of the track's frames, as a rational number in its reduced form. Most videos use
     * square pixels (1:1).
     * @deprecated Use {@link InputVideoTrack.getPixelAspectRatio} instead.
     */
    get pixelAspectRatio() {
      return this._pixelAspectRatioCache ??= simplifyRational({
        num: requireSync(this._backing.getSquarePixelWidth(), "pixelAspectRatio", "getPixelAspectRatio") * requireSync(this._backing.getCodedHeight(), "pixelAspectRatio", "getPixelAspectRatio"),
        den: requireSync(this._backing.getSquarePixelHeight(), "pixelAspectRatio", "getPixelAspectRatio") * requireSync(this._backing.getCodedWidth(), "pixelAspectRatio", "getPixelAspectRatio")
      });
    }
    /** Returns the display width of the track's frames in pixels, after aspect ratio adjustment and rotation. */
    async getDisplayWidth() {
      const metadata = await this._backing.getMetadataDisplayWidth?.();
      if (metadata != null) {
        return metadata;
      }
      const rotation = await this.getRotation();
      return rotation % 180 === 0 ? this.getSquarePixelWidth() : this.getSquarePixelHeight();
    }
    /**
     * The display width of the track's frames in pixels, after aspect ratio adjustment and rotation.
     * @deprecated Use {@link InputVideoTrack.getDisplayWidth} instead.
     */
    get displayWidth() {
      const metadataRaw = this._backing.getMetadataDisplayWidth?.();
      if (metadataRaw !== void 0) {
        const metadata = requireSync(metadataRaw, "displayWidth", "getDisplayWidth");
        if (metadata !== null) {
          return metadata;
        }
      }
      const rotation = requireSync(this._backing.getRotation(), "displayWidth", "getDisplayWidth");
      const value = rotation % 180 === 0 ? this._backing.getSquarePixelWidth() : this._backing.getSquarePixelHeight();
      return requireSync(value, "displayWidth", "getDisplayWidth");
    }
    /** Returns the display height of the track's frames in pixels, after aspect ratio adjustment and rotation. */
    async getDisplayHeight() {
      const metadata = await this._backing.getMetadataDisplayHeight?.();
      if (metadata != null) {
        return metadata;
      }
      const rotation = await this.getRotation();
      return rotation % 180 === 0 ? this.getSquarePixelHeight() : this.getSquarePixelWidth();
    }
    /**
     * The display height of the track's frames in pixels, after aspect ratio adjustment and rotation.
     * @deprecated Use {@link InputVideoTrack.getDisplayHeight} instead.
     */
    get displayHeight() {
      const metadataRaw = this._backing.getMetadataDisplayHeight?.();
      if (metadataRaw !== void 0) {
        const metadata = requireSync(metadataRaw, "displayHeight", "getDisplayHeight");
        if (metadata !== null) {
          return metadata;
        }
      }
      const rotation = requireSync(this._backing.getRotation(), "displayHeight", "getDisplayHeight");
      const value = rotation % 180 === 0 ? this._backing.getSquarePixelHeight() : this._backing.getSquarePixelWidth();
      return requireSync(value, "displayHeight", "getDisplayHeight");
    }
    /** Returns the color space of the track's samples. */
    async getColorSpace() {
      return this._backing.getColorSpace();
    }
    /** If this method returns true, the track's samples use a high dynamic range (HDR). */
    async hasHighDynamicRange() {
      const colorSpace = await this._backing.getColorSpace();
      return colorSpace.primaries === "bt2020" || colorSpace.primaries === "smpte432" || colorSpace.transfer === "pq" || colorSpace.transfer === "hlg" || colorSpace.matrix === "bt2020-ncl";
    }
    /** Checks if this track may contain transparent samples with alpha data. */
    async canBeTransparent() {
      return this._backing.canBeTransparent();
    }
    /**
     * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#video-decoder-config) for decoding the
     * track's packets using a [`VideoDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder). Returns
     * null if the track's codec is unknown.
     */
    async getDecoderConfig() {
      return this._backing.getDecoderConfig();
    }
    async getCodecParameterString() {
      const fromMetadata = await this._backing.getMetadataCodecParameterString?.();
      if (fromMetadata != null) {
        return fromMetadata;
      }
      const decoderConfig = await this._backing.getDecoderConfig();
      return decoderConfig?.codec ?? null;
    }
    async canDecode() {
      try {
        const decoderConfig = await this._backing.getDecoderConfig();
        if (!decoderConfig) {
          return false;
        }
        const codec = await this._backing.getCodec();
        assert(codec !== null);
        if (customVideoDecoders.some((x) => x.supports(codec, decoderConfig))) {
          return true;
        }
        if (typeof VideoDecoder === "undefined") {
          return false;
        }
        const support = await VideoDecoder.isConfigSupported(decoderConfig);
        return support.supported === true;
      } catch (error) {
        Logging._error("Error during decodability check:", error);
        return false;
      }
    }
    async determinePacketType(packet) {
      if (!(packet instanceof EncodedPacket)) {
        throw new TypeError("packet must be an EncodedPacket.");
      }
      if (packet.isMetadataOnly) {
        throw new TypeError("packet must not be metadata-only to determine its type.");
      }
      const codec = await this.getCodec();
      if (codec === null) {
        return null;
      }
      const decoderConfig = await this.getDecoderConfig();
      assert(decoderConfig);
      return determineVideoPacketType(codec, decoderConfig, packet.data);
    }
  };
  var InputAudioTrack = class extends InputTrack {
    /** @internal */
    constructor(input, backing) {
      super(input, backing);
      this._backing = backing;
    }
    get type() {
      return "audio";
    }
    /** The codec of the track's packets. */
    async getCodec() {
      return this._backing.getCodec();
    }
    /**
     * The codec of the track's packets.
     * @deprecated Use {@link InputAudioTrack.getCodec} instead.
     */
    get codec() {
      return requireSync(this._backing.getCodec(), "codec", "getCodec");
    }
    async hasOnlyKeyPackets() {
      return await this._backing.getHasOnlyKeyPackets?.() ?? true;
    }
    /** Returns the number of audio channels in the track. */
    async getNumberOfChannels() {
      return this._backing.getNumberOfChannels();
    }
    /**
     * The number of audio channels in the track.
     * @deprecated Use {@link InputAudioTrack.getNumberOfChannels} instead.
     */
    get numberOfChannels() {
      return requireSync(this._backing.getNumberOfChannels(), "numberOfChannels", "getNumberOfChannels");
    }
    /** Returns the track's audio sample rate in hertz. */
    async getSampleRate() {
      return this._backing.getSampleRate();
    }
    /**
     * The track's audio sample rate in hertz.
     * @deprecated Use {@link InputAudioTrack.getSampleRate} instead.
     */
    get sampleRate() {
      return requireSync(this._backing.getSampleRate(), "sampleRate", "getSampleRate");
    }
    /**
     * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#audio-decoder-config) for decoding the
     * track's packets using an [`AudioDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder). Returns
     * null if the track's codec is unknown.
     */
    async getDecoderConfig() {
      return this._backing.getDecoderConfig();
    }
    async getCodecParameterString() {
      const fromMetadata = await this._backing.getMetadataCodecParameterString?.();
      if (fromMetadata != null) {
        return fromMetadata;
      }
      const decoderConfig = await this._backing.getDecoderConfig();
      return decoderConfig?.codec ?? null;
    }
    async canDecode() {
      try {
        const decoderConfig = await this._backing.getDecoderConfig();
        if (!decoderConfig) {
          return false;
        }
        const codec = await this._backing.getCodec();
        assert(codec !== null);
        if (customAudioDecoders.some((x) => x.supports(codec, decoderConfig))) {
          return true;
        }
        if (decoderConfig.codec.startsWith("pcm-")) {
          return true;
        } else {
          if (typeof AudioDecoder === "undefined") {
            return false;
          }
          const support = await AudioDecoder.isConfigSupported(decoderConfig);
          return support.supported === true;
        }
      } catch (error) {
        Logging._error("Error during decodability check:", error);
        return false;
      }
    }
    async determinePacketType(packet) {
      if (!(packet instanceof EncodedPacket)) {
        throw new TypeError("packet must be an EncodedPacket.");
      }
      if (await this.getCodec() === null) {
        return null;
      }
      return "key";
    }
  };
  var desc = (value) => {
    return -(value ?? -Infinity);
  };
  var prefer = (value) => {
    return -value;
  };
  var toValidatedInputTrackQuery = (query) => {
    if (typeof query !== "object" || !query) {
      throw new TypeError("query must be an object.");
    }
    if (query.filter !== void 0 && typeof query.filter !== "function") {
      throw new TypeError("query.filter, when provided, must be a function.");
    }
    if (query.sortBy !== void 0 && typeof query.sortBy !== "function") {
      throw new TypeError("query.sortBy, when provided, must be a function.");
    }
    return {
      filter: query.filter ? (track) => {
        const handle = (bool) => {
          if (typeof bool !== "boolean") {
            throw new TypeError("query.filter must return or resolve to a boolean.");
          }
          return bool;
        };
        const result = query.filter(track);
        if (result instanceof Promise) {
          return result.then(handle);
        } else {
          return handle(result);
        }
      } : void 0,
      sortBy: query.sortBy ? (track) => {
        const handle = (value) => {
          if (typeof value !== "number" && (!Array.isArray(value) || !value.every((x) => typeof x === "number"))) {
            throw new TypeError("query.sortBy must return or resolve to a number or an array of numbers.");
          }
          return value;
        };
        const result = query.sortBy(track);
        if (result instanceof Promise) {
          return result.then(handle);
        } else {
          return handle(result);
        }
      } : void 0
    };
  };
  var mergeInputTrackQueries = (queryA, queryB) => {
    return {
      filter: queryA?.filter || queryB?.filter ? (track) => {
        const resultA = queryA?.filter?.(track) ?? true;
        const handleResultA = (resultA2) => {
          if (resultA2 === false) {
            return false;
          }
          return queryB?.filter?.(track) ?? true;
        };
        if (resultA instanceof Promise) {
          return resultA.then(handleResultA);
        } else {
          return handleResultA(resultA);
        }
      } : void 0,
      sortBy: queryA?.sortBy || queryB?.sortBy ? (track) => {
        const resultA = queryA?.sortBy?.(track) ?? [];
        const resultB = queryB?.sortBy?.(track) ?? [];
        const join = (resultA2, resultB2) => {
          return [
            ...Array.isArray(resultA2) ? resultA2 : [resultA2],
            ...Array.isArray(resultB2) ? resultB2 : [resultB2]
          ];
        };
        if (resultA instanceof Promise || resultB instanceof Promise) {
          return Promise.all([resultA, resultB]).then(([resultA2, resultB2]) => {
            return join(resultA2, resultB2);
          });
        } else {
          return join(resultA, resultB);
        }
      } : void 0
    };
  };
  var queryInputTracks = async (tracks, query) => {
    let matched = tracks;
    if (query?.filter) {
      const filterMatches = tracks.map((t) => query.filter(t));
      const hasAsyncFilter = filterMatches.some((x) => x instanceof Promise);
      if (hasAsyncFilter) {
        const resolvedFilterMatches = await Promise.all(filterMatches);
        matched = tracks.filter((_, i) => resolvedFilterMatches[i]);
      } else {
        matched = tracks.filter((_, i) => filterMatches[i]);
      }
    }
    if (!query?.sortBy) {
      return matched;
    }
    const sortValues = matched.map((t) => query.sortBy(t));
    const hasAsyncSort = sortValues.some((x) => x instanceof Promise);
    const resolvedSortValues = hasAsyncSort ? await Promise.all(sortValues) : sortValues;
    return matched.map((track, i) => ({ track, sortValue: resolvedSortValues[i] })).sort((a, b) => {
      const aValues = Array.isArray(a.sortValue) ? a.sortValue : [a.sortValue];
      const bValues = Array.isArray(b.sortValue) ? b.sortValue : [b.sortValue];
      const maxLength = Math.max(aValues.length, bValues.length);
      for (let i = 0; i < maxLength; i++) {
        const aValue = aValues[i] ?? 0;
        const bValue = bValues[i] ?? 0;
        if (aValue === bValue) {
          continue;
        }
        return aValue - bValue;
      }
      return 0;
    }).map((x) => x.track);
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/input.js
  polyfillSymbolDispose();
  var DEFAULT_SOURCE_CACHE_GROUP = 1;
  var ENCRYPTION_KEY_CACHE_GROUP = 2;
  var Input = class _Input extends EventEmitter {
    /** True if the input has been disposed. */
    get disposed() {
      return this._disposed;
    }
    /**
     * Creates a new input file from the specified options. No reading operations will be performed until methods are
     * called on this instance.
     */
    constructor(options) {
      super();
      this._demuxerPromise = null;
      this._format = null;
      this._trackBackingsCache = null;
      this._backingToTrack = /* @__PURE__ */ new Map();
      this._disposed = false;
      this._nextSourceCacheAge = 0;
      this._sourceRefs = [];
      this._sourceCache = [];
      this._sourceCachePromises = [];
      this._onFormatDetermined = null;
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (!Array.isArray(options.formats) || options.formats.some((x) => !(x instanceof InputFormat))) {
        throw new TypeError("options.formats must be an array of InputFormat.");
      }
      if (!(options.source instanceof Source || options.source instanceof SourceRef)) {
        throw new TypeError("options.source must be a Source or SourceRef.");
      }
      if (options.source instanceof Source && options.source._disposed) {
        throw new TypeError("options.source must not be a disposed Source.");
      }
      if (options.initInput !== void 0 && !(options.initInput instanceof _Input)) {
        throw new TypeError("options.initInput, when provided, must be an Input.");
      }
      if (options.formatOptions !== void 0) {
        validateInputFormatOptions(options.formatOptions, "formatOptions");
      }
      this._formats = options.formats;
      this._initInput = options.initInput ?? null;
      this._formatOptions = options.formatOptions ?? {};
      if (options.source instanceof Source) {
        this._rootRef = options.source.ref();
      } else {
        this._rootRef = options.source;
      }
      this._sourceRefs.push(this._rootRef);
    }
    /** @internal */
    get _rootSource() {
      return this._rootRef.source;
    }
    /** @internal */
    async _getSourceUncached(request) {
      assert(this._rootSource instanceof PathedSource);
      const ref = await this._rootSource._resolveRequest(request);
      this._emit("source", { source: ref.source, request, isRoot: request.isRoot });
      return ref;
    }
    /** @internal */
    _getSourceCached(request, cacheGroup = DEFAULT_SOURCE_CACHE_GROUP) {
      const cachedEntry = this._sourceCache.find((x) => x.cacheGroup === cacheGroup && sourceRequestsAreEqual(x.request, request));
      if (cachedEntry) {
        cachedEntry.age++;
        return Promise.resolve(cachedEntry.sourceRef.source.ref());
      }
      const cachedPromiseEntry = this._sourceCachePromises.find((x) => x.cacheGroup === cacheGroup && sourceRequestsAreEqual(x.request, request));
      if (cachedPromiseEntry) {
        return cachedPromiseEntry.promise.then((x) => x.sourceRef.source.ref());
      }
      const promise = (async () => {
        const sourceRef = await this._getSourceUncached(request);
        const MAX_SOURCE_CACHE_SIZE = 4;
        const count = arrayCount(this._sourceCache, (x) => x.cacheGroup === cacheGroup && x.sourceRef.source._refCount === 1);
        if (count >= MAX_SOURCE_CACHE_SIZE) {
          const minAgeIndex = arrayArgmin(this._sourceCache, (x) => x.cacheGroup === cacheGroup && x.sourceRef.source._refCount === 1 ? x.age : Infinity);
          assert(minAgeIndex !== -1);
          const entry = this._sourceCache[minAgeIndex];
          this._sourceCache.splice(minAgeIndex, 1);
          entry.sourceRef.free();
          removeItem(this._sourceRefs, entry.sourceRef);
        }
        this._sourceRefs.push(sourceRef);
        const promiseIndex = this._sourceCachePromises.findIndex((x) => x.request === request);
        assert(promiseIndex !== -1);
        this._sourceCachePromises.splice(promiseIndex, 1);
        const cacheEntry = {
          request,
          sourceRef,
          age: this._nextSourceCacheAge++,
          cacheGroup
        };
        return cacheEntry;
      })();
      this._sourceCachePromises.push({
        request,
        cacheGroup,
        promise
      });
      return promise.then((entry) => {
        const ref = entry.sourceRef.source.ref();
        this._sourceCache.push(entry);
        return ref;
      });
    }
    /** @internal */
    _getDemuxer() {
      return this._demuxerPromise ??= (async () => {
        this._reader = new Reader(this._rootSource);
        this._emit("source", { source: this._rootSource, request: null, isRoot: true });
        for (const format of this._formats) {
          const canRead = await format._canReadInput(this);
          if (canRead) {
            this._format = format;
            this._onFormatDetermined?.(format);
            return format._createDemuxer(this);
          }
        }
        throw new UnsupportedInputFormatError();
      })();
    }
    /**
     * Returns the source from which this input file reads data for the root path.
     */
    get source() {
      return this._rootSource;
    }
    /**
     * Returns the format of the input file. You can compare this result directly to the {@link InputFormat} singletons
     * or use `instanceof` checks for subset-aware logic (for example, `format instanceof MatroskaInputFormat` is true
     * for both MKV and WebM).
     */
    async getFormat() {
      await this._getDemuxer();
      assert(this._format);
      return this._format;
    }
    /** Returns `true` if the format of the input file is known and the file can be read, `false` otherwise. */
    async canRead() {
      try {
        await this._getDemuxer();
        return true;
      } catch (error) {
        if (error instanceof UnsupportedInputFormatError) {
          return false;
        }
        throw error;
      }
    }
    /**
     * Returns the timestamp at which the input file starts. More precisely, returns the smallest starting timestamp
     * among all tracks.
     *
     * Optionally, you can pass in the list of tracks for which you want to compute the starting timestamp.
     *
     * Note that this method is potentially expensive for inputs with many tracks (such as HLS manifests), since it
     * probes every track.
     */
    async getFirstTimestamp(tracks) {
      tracks ??= await this.getTracks();
      const filtered = tracks.filter((x) => x !== null);
      if (filtered.length === 0) {
        return 0;
      }
      const firstTimestamps = await Promise.all(filtered.map((x) => x.getFirstTimestamp()));
      return Math.min(...firstTimestamps);
    }
    /**
     * Computes the duration of the input file, in seconds. More precisely, returns the largest end timestamp among
     * all tracks.
     *
     * Optionally, you can pass in the list of tracks for which you want to compute the duration.
     *
     * This method can be potentially expensive depending on the underlying file format, because it returns the most
     * accurate duration possible and must check all tracks. Use {@link Input.getDurationFromMetadata} for a faster but
     * less accurate estimate of duration.
     *
     * By default, when any track in the underlying media is live, this method will only resolve once the live stream
     * ends. If you want to query the current duration of the media, set {@link PacketRetrievalOptions.skipLiveWait}
     * to `true` in the options.
     */
    async computeDuration(tracks, options) {
      tracks ??= await this.getTracks();
      const filtered = tracks.filter((x) => x !== null);
      if (filtered.length === 0) {
        return 0;
      }
      const tracksDurations = await Promise.all(filtered.map((x) => x.computeDuration(options)));
      return Math.max(...tracksDurations);
    }
    /**
     * Gets the duration (end timestamp) in seconds of the input file from metadata stored in the file. This value may
     * be approximate or diverge from the actual, precise duration returned by `.computeDuration()`, but compared to
     * that method, this method is cheaper. When the duration cannot be determined from the file metadata, `null`
     * is returned.
     *
     * Optionally, you can pass in the list of tracks for which you want to get the duration from metadata.
     *
     * By default, when the underlying media is live, this method will only resolve once the live stream
     * ends. If you want to query the current duration of the media, set
     * {@link DurationMetadataRequestOptions.skipLiveWait} to `true` in the options.
     */
    async getDurationFromMetadata(tracks, options) {
      tracks ??= await this.getTracks();
      const filtered = tracks.filter((x) => x !== null);
      const tracksDurations = await Promise.all(filtered.map((x) => x.getDurationFromMetadata(options)));
      const nonNullDurations = tracksDurations.filter((x) => x !== null);
      if (nonNullDurations.length === 0) {
        return null;
      }
      return Math.max(...nonNullDurations);
    }
    /**
     * Returns the list of all tracks of this input file in the order in which they appear in the file. An optional
     * query can be provided.
     */
    async getTracks(query) {
      query &&= toValidatedInputTrackQuery(query);
      const backings = await this._getTrackBackings();
      const tracks = backings.map((backing) => this._wrapBackingAsTrack(backing));
      return queryInputTracks(tracks, query);
    }
    /** Returns the list of all video tracks of this input file. An optional query can be provided. */
    async getVideoTracks(query) {
      query &&= toValidatedInputTrackQuery(query);
      const tracks = await this.getTracks();
      const videoTracks = tracks.filter((x) => x.isVideoTrack());
      return queryInputTracks(videoTracks, query);
    }
    /** Returns the list of all audio tracks of this input file. An optional query can be provided. */
    async getAudioTracks(query) {
      query &&= toValidatedInputTrackQuery(query);
      const tracks = await this.getTracks();
      const audioTracks = tracks.filter((x) => x.isAudioTrack());
      return queryInputTracks(audioTracks, query);
    }
    /**
     * Returns the primary video track of this input file, or null if there are no video tracks.
     *
     * Multiple factors determine which track is considered primary, including its position in the file, disposition,
     * bitrate (higher bitrate is preferred), and if it can be paired with an audio track.
     */
    async getPrimaryVideoTrack(query) {
      query &&= toValidatedInputTrackQuery(query);
      const merged = mergeInputTrackQueries(query, {
        sortBy: async (t) => [
          prefer((await t.getDisposition()).default),
          prefer(await t.hasPairableAudioTrack()),
          prefer(!await t.hasOnlyKeyPackets()),
          desc(await t.getBitrate())
        ]
      });
      const sorted = await this.getVideoTracks(merged);
      return sorted[0] ?? null;
    }
    /**
     * Returns the primary audio track of this input file, or null if there are no audio tracks.
     *
     * Multiple factors determine which track is considered primary, including its position in the file, disposition,
     * bitrate (higher bitrate is preferred), and if it can be paired with the primary video track.
     */
    async getPrimaryAudioTrack(query) {
      query &&= toValidatedInputTrackQuery(query);
      const primaryVideoTrack = await this.getPrimaryVideoTrack();
      const merged = mergeInputTrackQueries(query, {
        sortBy: async (t) => [
          prefer(!primaryVideoTrack || t.canBePairedWith(primaryVideoTrack)),
          prefer((await t.getDisposition()).default),
          desc(await t.getBitrate())
        ]
      });
      const sorted = await this.getAudioTracks(merged);
      return sorted[0] ?? null;
    }
    /** @internal */
    async _getTrackBackings() {
      const demuxer = await this._getDemuxer();
      return this._trackBackingsCache ??= await demuxer.getTrackBackings();
    }
    /** @internal */
    _wrapBackingAsTrack(backing) {
      const existing = this._backingToTrack.get(backing);
      if (existing) {
        return existing;
      }
      const type = backing.getType();
      const track = type === "video" ? new InputVideoTrack(this, backing) : new InputAudioTrack(this, backing);
      this._backingToTrack.set(backing, track);
      return track;
    }
    /** Returns the full MIME type of this input file, including track codecs. */
    async getMimeType() {
      const demuxer = await this._getDemuxer();
      return demuxer.getMimeType();
    }
    /**
     * Returns descriptive metadata tags about the media file, such as title, author, date, cover art, or other
     * attached files.
     */
    async getMetadataTags() {
      const demuxer = await this._getDemuxer();
      return demuxer.getMetadataTags();
    }
    /**
     * Disposes this input and frees connected resources. When an input is disposed, ongoing read operations will be
     * canceled, all future read operations will fail, any open decoders will be closed, and all ongoing media sink
     * operations will be canceled. Disallowed and canceled operations will throw an {@link InputDisposedError}.
     *
     * You are expected not to use an input after disposing it. While some operations may still work, it is not
     * specified and may change in any future update.
     */
    dispose() {
      if (this._disposed) {
        return;
      }
      this._disposed = true;
      for (const ref of this._sourceRefs) {
        ref.free();
      }
      this._sourceRefs.length = 0;
      if (this._demuxerPromise) {
        void this._demuxerPromise.then((demuxer) => demuxer.dispose()).catch(() => {
        });
      }
    }
    /**
     * Calls `.dispose()` on the input, implementing the `Disposable` interface for use with
     * JavaScript Explicit Resource Management features.
     */
    [Symbol.dispose]() {
      this.dispose();
    }
  };
  var UnsupportedInputFormatError = class extends Error {
    /** Creates a new {@link UnsupportedInputFormatError}. */
    constructor(message = "Input has an unsupported or unrecognizable format.") {
      super(message);
      this.name = "UnsupportedInputFormatError";
    }
  };
  var InputDisposedError = class extends Error {
    /** Creates a new {@link InputDisposedError}. */
    constructor(message = "Input has been disposed.") {
      super(message);
      this.name = "InputDisposedError";
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/reader.js
  var Reader = class {
    constructor(source) {
      this.source = source;
    }
    get fileSize() {
      const size = this.source._getFileSize();
      if (size === void 0) {
        throw new Error("Reading file size too early; read required first.");
      }
      return size;
    }
    get fileSizeNonStrict() {
      return this.source._getFileSize() ?? null;
    }
    requestSlice(start, length) {
      if (this.source._disposed) {
        throw new InputDisposedError();
      }
      if (start < 0) {
        return null;
      }
      if (this.fileSizeNonStrict !== null && start + length > this.fileSizeNonStrict) {
        return null;
      }
      if (length === 0) {
        const buffer = new Uint8Array(0);
        return new FileSlice(buffer, toDataView(buffer), 0, start, start);
      }
      const end = start + length;
      const result = this.source._read(start, end, DEFAULT_MIN_READ_POSITION, DEFAULT_MAX_READ_POSITION);
      if (result instanceof Promise) {
        return result.then((x) => {
          if (!x) {
            return null;
          }
          return new FileSlice(x.bytes, x.view, x.offset, start, end);
        });
      } else {
        if (!result) {
          return null;
        }
        return new FileSlice(result.bytes, result.view, result.offset, start, end);
      }
    }
    requestSliceRange(start, minLength, maxLength) {
      if (this.source._disposed) {
        throw new InputDisposedError();
      }
      if (start < 0) {
        return null;
      }
      if (this.fileSizeNonStrict !== null) {
        return this.requestSlice(start, clamp(this.fileSizeNonStrict - start, minLength, maxLength));
      } else {
        const promisedAttempt = this.requestSlice(start, maxLength);
        const handleAttempt = (attempt) => {
          if (attempt) {
            return attempt;
          }
          assert(this.fileSizeNonStrict !== null);
          return this.requestSlice(start, clamp(this.fileSizeNonStrict - start, minLength, maxLength));
        };
        if (promisedAttempt instanceof Promise) {
          return promisedAttempt.then(handleAttempt);
        } else {
          return handleAttempt(promisedAttempt);
        }
      }
    }
    requestEntireFile() {
      if (this.fileSizeNonStrict !== null) {
        return this.requestSlice(0, this.fileSizeNonStrict);
      }
      const CHUNK_SIZE = 1024;
      return (async () => {
        const chunks = [];
        let currentSize = 0;
        while (true) {
          if (chunks.length === 1 && this.fileSizeNonStrict !== null) {
            return this.requestSlice(0, this.fileSizeNonStrict);
          }
          let slice = this.requestSliceRange(currentSize, 0, CHUNK_SIZE);
          if (slice instanceof Promise)
            slice = await slice;
          if (!slice || slice.length === 0) {
            break;
          }
          const chunk = readBytes(slice, slice.length);
          chunks.push(chunk);
          currentSize += slice.length;
        }
        const joined = new Uint8Array(currentSize);
        let offset = 0;
        for (const chunk of chunks) {
          joined.set(chunk, offset);
          offset += chunk.length;
        }
        return new FileSlice(joined, toDataView(joined), 0, 0, currentSize);
      })();
    }
  };
  var FileSlice = class _FileSlice {
    constructor(bytes2, view2, offset, start, end) {
      this.bytes = bytes2;
      this.view = view2;
      this.offset = offset;
      this.start = start;
      this.end = end;
      this.bufferPos = start - offset;
    }
    static tempFromBytes(bytes2) {
      return new _FileSlice(bytes2, toDataView(bytes2), 0, 0, bytes2.length);
    }
    get length() {
      return this.end - this.start;
    }
    get filePos() {
      return this.offset + this.bufferPos;
    }
    set filePos(value) {
      this.bufferPos = value - this.offset;
    }
    /** The number of bytes left from the current pos to the end of the slice. */
    get remainingLength() {
      return Math.max(this.end - this.filePos, 0);
    }
    skip(byteCount) {
      this.bufferPos += byteCount;
    }
    /** Creates a new subslice of this slice whose byte range must be contained within this slice. */
    slice(filePos, length = this.end - filePos) {
      if (filePos < this.start || filePos + length > this.end) {
        throw new RangeError("Slicing outside of original slice.");
      }
      return new _FileSlice(this.bytes, this.view, this.offset, filePos, filePos + length);
    }
  };
  var checkIsInRange = (slice, bytesToRead) => {
    if (slice.filePos < slice.start || slice.filePos + bytesToRead > slice.end) {
      throw new RangeError(`Tried reading [${slice.filePos}, ${slice.filePos + bytesToRead}), but slice is [${slice.start}, ${slice.end}). This is likely an internal error, please report it alongside the file that caused it.`);
    }
  };
  var readBytes = (slice, length) => {
    checkIsInRange(slice, length);
    const bytes2 = slice.bytes.subarray(slice.bufferPos, slice.bufferPos + length);
    slice.bufferPos += length;
    return bytes2;
  };
  var readU8 = (slice) => {
    checkIsInRange(slice, 1);
    return slice.view.getUint8(slice.bufferPos++);
  };
  var readU16Be = (slice) => {
    checkIsInRange(slice, 2);
    const value = slice.view.getUint16(slice.bufferPos, false);
    slice.bufferPos += 2;
    return value;
  };
  var readU24Be = (slice) => {
    checkIsInRange(slice, 3);
    const value = getUint24(slice.view, slice.bufferPos, false);
    slice.bufferPos += 3;
    return value;
  };
  var readI16Be = (slice) => {
    checkIsInRange(slice, 2);
    const value = slice.view.getInt16(slice.bufferPos, false);
    slice.bufferPos += 2;
    return value;
  };
  var readU32Be = (slice) => {
    checkIsInRange(slice, 4);
    const value = slice.view.getUint32(slice.bufferPos, false);
    slice.bufferPos += 4;
    return value;
  };
  var readI32Be = (slice) => {
    checkIsInRange(slice, 4);
    const value = slice.view.getInt32(slice.bufferPos, false);
    slice.bufferPos += 4;
    return value;
  };
  var readU64Be = (slice) => {
    const high = readU32Be(slice);
    const low = readU32Be(slice);
    return high * 4294967296 + low;
  };
  var readI64Be = (slice) => {
    const high = readI32Be(slice);
    const low = readU32Be(slice);
    return high * 4294967296 + low;
  };
  var readF64Be = (slice) => {
    checkIsInRange(slice, 8);
    const value = slice.view.getFloat64(slice.bufferPos, false);
    slice.bufferPos += 8;
    return value;
  };
  var readAscii = (slice, length) => {
    checkIsInRange(slice, length);
    let str = "";
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(slice.bytes[slice.bufferPos++]);
    }
    return str;
  };
  var readAllLines = (slice, length, options) => {
    const text = textDecoder.decode(readBytes(slice, length));
    const lines = text.split("\n").map((x) => x.trim()).filter((x) => x.length > 0 && !options?.ignore?.(x));
    return lines;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/id3.js
  var Id3V2HeaderFlags;
  (function(Id3V2HeaderFlags2) {
    Id3V2HeaderFlags2[Id3V2HeaderFlags2["Unsynchronisation"] = 128] = "Unsynchronisation";
    Id3V2HeaderFlags2[Id3V2HeaderFlags2["ExtendedHeader"] = 64] = "ExtendedHeader";
    Id3V2HeaderFlags2[Id3V2HeaderFlags2["ExperimentalIndicator"] = 32] = "ExperimentalIndicator";
    Id3V2HeaderFlags2[Id3V2HeaderFlags2["Footer"] = 16] = "Footer";
  })(Id3V2HeaderFlags || (Id3V2HeaderFlags = {}));
  var Id3V2TextEncoding;
  (function(Id3V2TextEncoding2) {
    Id3V2TextEncoding2[Id3V2TextEncoding2["ISO_8859_1"] = 0] = "ISO_8859_1";
    Id3V2TextEncoding2[Id3V2TextEncoding2["UTF_16_WITH_BOM"] = 1] = "UTF_16_WITH_BOM";
    Id3V2TextEncoding2[Id3V2TextEncoding2["UTF_16_BE_NO_BOM"] = 2] = "UTF_16_BE_NO_BOM";
    Id3V2TextEncoding2[Id3V2TextEncoding2["UTF_8"] = 3] = "UTF_8";
  })(Id3V2TextEncoding || (Id3V2TextEncoding = {}));
  var ID3_V1_TAG_SIZE = 128;
  var ID3_V2_HEADER_SIZE = 10;
  var ID3_V1_GENRES = [
    "Blues",
    "Classic rock",
    "Country",
    "Dance",
    "Disco",
    "Funk",
    "Grunge",
    "Hip-hop",
    "Jazz",
    "Metal",
    "New age",
    "Oldies",
    "Other",
    "Pop",
    "Rhythm and blues",
    "Rap",
    "Reggae",
    "Rock",
    "Techno",
    "Industrial",
    "Alternative",
    "Ska",
    "Death metal",
    "Pranks",
    "Soundtrack",
    "Euro-techno",
    "Ambient",
    "Trip-hop",
    "Vocal",
    "Jazz & funk",
    "Fusion",
    "Trance",
    "Classical",
    "Instrumental",
    "Acid",
    "House",
    "Game",
    "Sound clip",
    "Gospel",
    "Noise",
    "Alternative rock",
    "Bass",
    "Soul",
    "Punk",
    "Space",
    "Meditative",
    "Instrumental pop",
    "Instrumental rock",
    "Ethnic",
    "Gothic",
    "Darkwave",
    "Techno-industrial",
    "Electronic",
    "Pop-folk",
    "Eurodance",
    "Dream",
    "Southern rock",
    "Comedy",
    "Cult",
    "Gangsta",
    "Top 40",
    "Christian rap",
    "Pop/funk",
    "Jungle music",
    "Native US",
    "Cabaret",
    "New wave",
    "Psychedelic",
    "Rave",
    "Showtunes",
    "Trailer",
    "Lo-fi",
    "Tribal",
    "Acid punk",
    "Acid jazz",
    "Polka",
    "Retro",
    "Musical",
    "Rock 'n' roll",
    "Hard rock",
    "Folk",
    "Folk rock",
    "National folk",
    "Swing",
    "Fast fusion",
    "Bebop",
    "Latin",
    "Revival",
    "Celtic",
    "Bluegrass",
    "Avantgarde",
    "Gothic rock",
    "Progressive rock",
    "Psychedelic rock",
    "Symphonic rock",
    "Slow rock",
    "Big band",
    "Chorus",
    "Easy listening",
    "Acoustic",
    "Humour",
    "Speech",
    "Chanson",
    "Opera",
    "Chamber music",
    "Sonata",
    "Symphony",
    "Booty bass",
    "Primus",
    "Porn groove",
    "Satire",
    "Slow jam",
    "Club",
    "Tango",
    "Samba",
    "Folklore",
    "Ballad",
    "Power ballad",
    "Rhythmic Soul",
    "Freestyle",
    "Duet",
    "Punk rock",
    "Drum solo",
    "A cappella",
    "Euro-house",
    "Dance hall",
    "Goa music",
    "Drum & bass",
    "Club-house",
    "Hardcore techno",
    "Terror",
    "Indie",
    "Britpop",
    "Negerpunk",
    "Polsk punk",
    "Beat",
    "Christian gangsta rap",
    "Heavy metal",
    "Black metal",
    "Crossover",
    "Contemporary Christian",
    "Christian rock",
    "Merengue",
    "Salsa",
    "Thrash metal",
    "Anime",
    "Jpop",
    "Synthpop",
    "Christmas",
    "Art rock",
    "Baroque",
    "Bhangra",
    "Big beat",
    "Breakbeat",
    "Chillout",
    "Downtempo",
    "Dub",
    "EBM",
    "Eclectic",
    "Electro",
    "Electroclash",
    "Emo",
    "Experimental",
    "Garage",
    "Global",
    "IDM",
    "Illbient",
    "Industro-Goth",
    "Jam Band",
    "Krautrock",
    "Leftfield",
    "Lounge",
    "Math rock",
    "New romantic",
    "Nu-breakz",
    "Post-punk",
    "Post-rock",
    "Psytrance",
    "Shoegaze",
    "Space rock",
    "Trop rock",
    "World music",
    "Neoclassical",
    "Audiobook",
    "Audio theatre",
    "Neue Deutsche Welle",
    "Podcast",
    "Indie rock",
    "G-Funk",
    "Dubstep",
    "Garage rock",
    "Psybient"
  ];
  var parseId3V1Tag = (slice, tags) => {
    const startPos = slice.filePos;
    tags.raw ??= {};
    tags.raw["TAG"] ??= readBytes(slice, ID3_V1_TAG_SIZE - 3);
    slice.filePos = startPos;
    const title = readId3V1String(slice, 30);
    if (title)
      tags.title ??= title;
    const artist = readId3V1String(slice, 30);
    if (artist)
      tags.artist ??= artist;
    const album = readId3V1String(slice, 30);
    if (album)
      tags.album ??= album;
    const yearText = readId3V1String(slice, 4);
    const year = Number.parseInt(yearText, 10);
    if (Number.isInteger(year) && year > 0) {
      tags.date ??= new Date(String(year));
    }
    const commentBytes = readBytes(slice, 30);
    let comment;
    if (commentBytes[28] === 0 && commentBytes[29] !== 0) {
      const trackNum = commentBytes[29];
      if (trackNum > 0) {
        tags.trackNumber ??= trackNum;
      }
      slice.skip(-30);
      comment = readId3V1String(slice, 28);
      slice.skip(2);
    } else {
      slice.skip(-30);
      comment = readId3V1String(slice, 30);
    }
    if (comment)
      tags.comment ??= comment;
    const genreIndex = readU8(slice);
    if (genreIndex < ID3_V1_GENRES.length) {
      tags.genre ??= ID3_V1_GENRES[genreIndex];
    }
  };
  var readId3V1String = (slice, length) => {
    const bytes2 = readBytes(slice, length);
    const endIndex = coalesceIndex(bytes2.indexOf(0), bytes2.length);
    const relevantBytes = bytes2.subarray(0, endIndex);
    let str = "";
    for (let i = 0; i < relevantBytes.length; i++) {
      str += String.fromCharCode(relevantBytes[i]);
    }
    return str.trimEnd();
  };
  var readId3V2Header = (slice) => {
    const startPos = slice.filePos;
    const tag = readAscii(slice, 3);
    const majorVersion = readU8(slice);
    const revision = readU8(slice);
    const flags = readU8(slice);
    const sizeRaw = readU32Be(slice);
    if (tag !== "ID3" || majorVersion === 255 || revision === 255 || (sizeRaw & 2155905152) !== 0) {
      slice.filePos = startPos;
      return null;
    }
    let size = decodeSynchsafe(sizeRaw);
    if (flags & Id3V2HeaderFlags.Footer) {
      size += ID3_V2_HEADER_SIZE;
    }
    return { majorVersion, revision, flags, size };
  };
  var parseId3V2Tag = (slice, header, tags) => {
    if (![2, 3, 4].includes(header.majorVersion)) {
      Logging._warn(`Unsupported ID3v2 major version: ${header.majorVersion}`);
      return;
    }
    const dataSize = header.flags & Id3V2HeaderFlags.Footer ? header.size - ID3_V2_HEADER_SIZE : header.size;
    const bytes2 = readBytes(slice, dataSize);
    const reader = new Id3V2Reader(header, bytes2);
    if (header.flags & Id3V2HeaderFlags.Unsynchronisation && header.majorVersion === 3) {
      reader.ununsynchronizeAll();
    }
    if (header.flags & Id3V2HeaderFlags.ExtendedHeader) {
      const extendedHeaderSize = reader.readU32();
      if (header.majorVersion === 3) {
        reader.pos += extendedHeaderSize;
      } else {
        reader.pos += extendedHeaderSize - 4;
      }
    }
    while (reader.pos <= reader.bytes.length - reader.frameHeaderSize()) {
      const frame = reader.readId3V2Frame();
      if (!frame) {
        break;
      }
      const frameStartPos = reader.pos;
      const frameEndPos = reader.pos + frame.size;
      let frameEncrypted = false;
      let frameCompressed = false;
      let frameUnsynchronized = false;
      if (header.majorVersion === 3) {
        frameEncrypted = !!(frame.flags & 1 << 6);
        frameCompressed = !!(frame.flags & 1 << 7);
      } else if (header.majorVersion === 4) {
        frameEncrypted = !!(frame.flags & 1 << 2);
        frameCompressed = !!(frame.flags & 1 << 3);
        frameUnsynchronized = !!(frame.flags & 1 << 1) || !!(header.flags & Id3V2HeaderFlags.Unsynchronisation);
      }
      if (frameEncrypted) {
        Logging._warn(`Skipping encrypted ID3v2 frame ${frame.id}`);
        reader.pos = frameEndPos;
        continue;
      }
      if (frameCompressed) {
        Logging._warn(`Skipping compressed ID3v2 frame ${frame.id}`);
        reader.pos = frameEndPos;
        continue;
      }
      if (frameUnsynchronized) {
        reader.ununsynchronizeRegion(reader.pos, frameEndPos);
      }
      tags.raw ??= {};
      if (frame.id === "TXXX") {
        const txxx = tags.raw["TXXX"] ??= {};
        const encoding = reader.readId3V2TextEncoding();
        const description = reader.readId3V2Text(encoding, frameEndPos);
        const value = reader.readId3V2Text(encoding, frameEndPos);
        txxx[description] ??= value;
      } else if (frame.id[0] === "T") {
        tags.raw[frame.id] ??= reader.readId3V2EncodingAndText(frameEndPos);
      } else {
        tags.raw[frame.id] ??= reader.readBytes(frame.size);
      }
      reader.pos = frameStartPos;
      switch (frame.id) {
        case "TIT2":
        case "TT2":
          {
            tags.title ??= reader.readId3V2EncodingAndText(frameEndPos);
          }
          ;
          break;
        case "TIT3":
        case "TT3":
          {
            tags.description ??= reader.readId3V2EncodingAndText(frameEndPos);
          }
          ;
          break;
        case "TPE1":
        case "TP1":
          {
            tags.artist ??= reader.readId3V2EncodingAndText(frameEndPos);
          }
          ;
          break;
        case "TALB":
        case "TAL":
          {
            tags.album ??= reader.readId3V2EncodingAndText(frameEndPos);
          }
          ;
          break;
        case "TPE2":
        case "TP2":
          {
            tags.albumArtist ??= reader.readId3V2EncodingAndText(frameEndPos);
          }
          ;
          break;
        case "TRCK":
        case "TRK":
          {
            const trackText = reader.readId3V2EncodingAndText(frameEndPos);
            const parts = trackText.split("/");
            const trackNum = Number.parseInt(parts[0], 10);
            const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
            if (Number.isInteger(trackNum) && trackNum > 0) {
              tags.trackNumber ??= trackNum;
            }
            if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
              tags.tracksTotal ??= tracksTotal;
            }
          }
          ;
          break;
        case "TPOS":
        case "TPA":
          {
            const discText = reader.readId3V2EncodingAndText(frameEndPos);
            const parts = discText.split("/");
            const discNum = Number.parseInt(parts[0], 10);
            const discsTotal = parts[1] && Number.parseInt(parts[1], 10);
            if (Number.isInteger(discNum) && discNum > 0) {
              tags.discNumber ??= discNum;
            }
            if (discsTotal && Number.isInteger(discsTotal) && discsTotal > 0) {
              tags.discsTotal ??= discsTotal;
            }
          }
          ;
          break;
        case "TCON":
        case "TCO":
          {
            const genreText = reader.readId3V2EncodingAndText(frameEndPos);
            let match = /^\((\d+)\)/.exec(genreText);
            if (match) {
              const genreNumber = Number.parseInt(match[1]);
              if (ID3_V1_GENRES[genreNumber] !== void 0) {
                tags.genre ??= ID3_V1_GENRES[genreNumber];
                break;
              }
            }
            match = /^\d+$/.exec(genreText);
            if (match) {
              const genreNumber = Number.parseInt(match[0]);
              if (ID3_V1_GENRES[genreNumber] !== void 0) {
                tags.genre ??= ID3_V1_GENRES[genreNumber];
                break;
              }
            }
            tags.genre ??= genreText;
          }
          ;
          break;
        case "TDRC":
        case "TDAT":
          {
            const dateText = reader.readId3V2EncodingAndText(frameEndPos);
            const date = new Date(dateText);
            if (!Number.isNaN(date.getTime())) {
              tags.date ??= date;
            }
          }
          ;
          break;
        case "TYER":
        case "TYE":
          {
            const yearText = reader.readId3V2EncodingAndText(frameEndPos);
            const year = Number.parseInt(yearText, 10);
            if (Number.isInteger(year)) {
              tags.date ??= new Date(String(year));
            }
          }
          ;
          break;
        case "USLT":
        case "ULT":
          {
            const encoding = reader.readU8();
            reader.pos += 3;
            reader.readId3V2Text(encoding, frameEndPos);
            tags.lyrics ??= reader.readId3V2Text(encoding, frameEndPos);
          }
          ;
          break;
        case "COMM":
        case "COM":
          {
            const encoding = reader.readU8();
            reader.pos += 3;
            reader.readId3V2Text(encoding, frameEndPos);
            tags.comment ??= reader.readId3V2Text(encoding, frameEndPos);
          }
          ;
          break;
        case "APIC":
        case "PIC":
          {
            const encoding = reader.readId3V2TextEncoding();
            let mimeType;
            if (header.majorVersion === 2) {
              const imageFormat = reader.readAscii(3);
              mimeType = imageFormat === "PNG" ? "image/png" : imageFormat === "JPG" ? "image/jpeg" : "image/*";
            } else {
              mimeType = reader.readId3V2Text(encoding, frameEndPos);
            }
            const pictureType = reader.readU8();
            const description = reader.readId3V2Text(encoding, frameEndPos).trimEnd();
            const imageDataSize = frameEndPos - reader.pos;
            if (imageDataSize >= 0) {
              const imageData = reader.readBytes(imageDataSize);
              if (!tags.images)
                tags.images = [];
              tags.images.push({
                data: imageData,
                mimeType,
                kind: pictureType === 3 ? "coverFront" : pictureType === 4 ? "coverBack" : "unknown",
                description
              });
            }
          }
          ;
          break;
        default:
          {
            reader.pos += frame.size;
          }
          ;
          break;
      }
      reader.pos = frameEndPos;
    }
  };
  var Id3V2Reader = class {
    constructor(header, bytes2) {
      this.header = header;
      this.bytes = bytes2;
      this.pos = 0;
      this.view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
    }
    frameHeaderSize() {
      return this.header.majorVersion === 2 ? 6 : 10;
    }
    ununsynchronizeAll() {
      const newBytes = [];
      for (let i = 0; i < this.bytes.length; i++) {
        const value1 = this.bytes[i];
        newBytes.push(value1);
        if (value1 === 255 && i !== this.bytes.length - 1) {
          const value2 = this.bytes[i];
          if (value2 === 0) {
            i++;
          }
        }
      }
      this.bytes = new Uint8Array(newBytes);
      this.view = new DataView(this.bytes.buffer);
    }
    ununsynchronizeRegion(start, end) {
      const newBytes = [];
      for (let i = start; i < end; i++) {
        const value1 = this.bytes[i];
        newBytes.push(value1);
        if (value1 === 255 && i !== end - 1) {
          const value2 = this.bytes[i + 1];
          if (value2 === 0) {
            i++;
          }
        }
      }
      const before = this.bytes.subarray(0, start);
      const after = this.bytes.subarray(end);
      this.bytes = new Uint8Array(before.length + newBytes.length + after.length);
      this.bytes.set(before, 0);
      this.bytes.set(newBytes, before.length);
      this.bytes.set(after, before.length + newBytes.length);
      this.view = new DataView(this.bytes.buffer);
    }
    readBytes(length) {
      const slice = this.bytes.subarray(this.pos, this.pos + length);
      this.pos += length;
      return slice;
    }
    readU8() {
      const value = this.view.getUint8(this.pos);
      this.pos += 1;
      return value;
    }
    readU16() {
      const value = this.view.getUint16(this.pos, false);
      this.pos += 2;
      return value;
    }
    readU24() {
      const high = this.view.getUint16(this.pos, false);
      const low = this.view.getUint8(this.pos + 2);
      this.pos += 3;
      return high * 256 + low;
    }
    readU32() {
      const value = this.view.getUint32(this.pos, false);
      this.pos += 4;
      return value;
    }
    readAscii(length) {
      let str = "";
      for (let i = 0; i < length; i++) {
        str += String.fromCharCode(this.view.getUint8(this.pos + i));
      }
      this.pos += length;
      return str;
    }
    readId3V2Frame() {
      if (this.header.majorVersion === 2) {
        const id = this.readAscii(3);
        if (id === "\0\0\0") {
          return null;
        }
        const size = this.readU24();
        return { id, size, flags: 0 };
      } else {
        const id = this.readAscii(4);
        if (id === "\0\0\0\0") {
          return null;
        }
        const sizeRaw = this.readU32();
        let size = this.header.majorVersion === 4 ? decodeSynchsafe(sizeRaw) : sizeRaw;
        const flags = this.readU16();
        const headerEndPos = this.pos;
        const isSizeValid = (size2) => {
          const nextPos = this.pos + size2;
          if (nextPos > this.bytes.length) {
            return false;
          }
          if (nextPos <= this.bytes.length - this.frameHeaderSize()) {
            this.pos += size2;
            const nextId = this.readAscii(4);
            if (nextId !== "\0\0\0\0" && !/[0-9A-Z]{4}/.test(nextId)) {
              return false;
            }
          }
          return true;
        };
        if (!isSizeValid(size)) {
          const otherSize = this.header.majorVersion === 4 ? sizeRaw : decodeSynchsafe(sizeRaw);
          if (isSizeValid(otherSize)) {
            size = otherSize;
          }
        }
        this.pos = headerEndPos;
        return { id, size, flags };
      }
    }
    readId3V2TextEncoding() {
      const number = this.readU8();
      if (number > 3) {
        throw new Error(`Unsupported text encoding: ${number}`);
      }
      return number;
    }
    readId3V2Text(encoding, until) {
      const startPos = this.pos;
      const data = this.readBytes(until - this.pos);
      switch (encoding) {
        case Id3V2TextEncoding.ISO_8859_1: {
          let str = "";
          for (let i = 0; i < data.length; i++) {
            const value = data[i];
            if (value === 0) {
              this.pos = startPos + i + 1;
              break;
            }
            str += String.fromCharCode(value);
          }
          return str;
        }
        case Id3V2TextEncoding.UTF_16_WITH_BOM: {
          if (data[0] === 255 && data[1] === 254) {
            const decoder = new TextDecoder("utf-16le");
            const endIndex = coalesceIndex(data.findIndex((x, i) => x === 0 && data[i + 1] === 0 && i % 2 === 0), data.length);
            this.pos = startPos + Math.min(endIndex + 2, data.length);
            return decoder.decode(data.subarray(2, endIndex));
          } else if (data[0] === 254 && data[1] === 255) {
            const decoder = new TextDecoder("utf-16be");
            const endIndex = coalesceIndex(data.findIndex((x, i) => x === 0 && data[i + 1] === 0 && i % 2 === 0), data.length);
            this.pos = startPos + Math.min(endIndex + 2, data.length);
            return decoder.decode(data.subarray(2, endIndex));
          } else {
            const endIndex = coalesceIndex(data.findIndex((x) => x === 0), data.length);
            this.pos = startPos + Math.min(endIndex + 1, data.length);
            return textDecoder.decode(data.subarray(0, endIndex));
          }
        }
        case Id3V2TextEncoding.UTF_16_BE_NO_BOM: {
          const decoder = new TextDecoder("utf-16be");
          const endIndex = coalesceIndex(data.findIndex((x, i) => x === 0 && data[i + 1] === 0 && i % 2 === 0), data.length);
          this.pos = startPos + Math.min(endIndex + 2, data.length);
          return decoder.decode(data.subarray(0, endIndex));
        }
        case Id3V2TextEncoding.UTF_8: {
          const endIndex = coalesceIndex(data.findIndex((x) => x === 0), data.length);
          this.pos = startPos + Math.min(endIndex + 1, data.length);
          return textDecoder.decode(data.subarray(0, endIndex));
        }
      }
    }
    readId3V2EncodingAndText(until) {
      if (this.pos >= until) {
        return "";
      }
      const encoding = this.readId3V2TextEncoding();
      return this.readId3V2Text(encoding, until);
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/muxer.js
  var Muxer = class {
    constructor(output) {
      this.mutex = new AsyncMutex();
      this.trackTimestampInfo = /* @__PURE__ */ new WeakMap();
      this.output = output;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onTrackClose(track) {
    }
    validateTimestamp(track, timestampInSeconds, isKeyPacket) {
      if (timestampInSeconds < 0) {
        throw new Error(`Timestamps must be non-negative (got ${timestampInSeconds}s).`);
      }
      let timestampInfo = this.trackTimestampInfo.get(track);
      if (!timestampInfo) {
        if (!isKeyPacket) {
          throw new Error("First packet must be a key packet.");
        }
        timestampInfo = {
          maxTimestamp: timestampInSeconds,
          maxTimestampBeforeLastKeyPacket: null
        };
        this.trackTimestampInfo.set(track, timestampInfo);
      } else {
        if (isKeyPacket) {
          timestampInfo.maxTimestampBeforeLastKeyPacket = timestampInfo.maxTimestamp;
        }
        if (timestampInfo.maxTimestampBeforeLastKeyPacket !== null && timestampInSeconds < timestampInfo.maxTimestampBeforeLastKeyPacket) {
          throw new Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${timestampInSeconds}s, but largest timestamp is ${timestampInfo.maxTimestampBeforeLastKeyPacket}s.`);
        }
        timestampInfo.maxTimestamp = Math.max(timestampInfo.maxTimestamp, timestampInSeconds);
      }
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/subtitles.js
  var inlineTimestampRegex = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g;
  var formatSubtitleTimestamp = (timestamp) => {
    const hours = Math.floor(timestamp / (60 * 60 * 1e3));
    const minutes = Math.floor(timestamp % (60 * 60 * 1e3) / (60 * 1e3));
    const seconds = Math.floor(timestamp % (60 * 1e3) / 1e3);
    const milliseconds = timestamp % 1e3;
    return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0") + "." + milliseconds.toString().padStart(3, "0");
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-boxes.js
  var IsobmffBoxWriter = class {
    constructor(writer) {
      this.writer = writer;
      this.helper = new Uint8Array(8);
      this.helperView = new DataView(this.helper.buffer);
      this.offsets = /* @__PURE__ */ new WeakMap();
    }
    writeU32(value) {
      this.helperView.setUint32(0, value, false);
      this.writer.write(this.helper.subarray(0, 4));
    }
    writeU64(value) {
      this.helperView.setUint32(0, Math.floor(value / 2 ** 32), false);
      this.helperView.setUint32(4, value, false);
      this.writer.write(this.helper.subarray(0, 8));
    }
    writeAscii(text) {
      for (let i = 0; i < text.length; i++) {
        this.helperView.setUint8(i % 8, text.charCodeAt(i));
        if (i % 8 === 7)
          this.writer.write(this.helper);
      }
      if (text.length % 8 !== 0) {
        this.writer.write(this.helper.subarray(0, text.length % 8));
      }
    }
    writeBox(box2) {
      this.offsets.set(box2, this.writer.getPos());
      if (box2.contents && !box2.children) {
        this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
        this.writer.write(box2.contents);
      } else {
        const startPos = this.writer.getPos();
        this.writeBoxHeader(box2, 0);
        if (box2.contents)
          this.writer.write(box2.contents);
        if (box2.children) {
          for (const child of box2.children)
            if (child)
              this.writeBox(child);
        }
        const endPos = this.writer.getPos();
        const size = box2.size ?? endPos - startPos;
        this.writer.seek(startPos);
        this.writeBoxHeader(box2, size);
        this.writer.seek(endPos);
      }
    }
    writeBoxHeader(box2, size) {
      this.writeU32(box2.largeSize ? 1 : size);
      this.writeAscii(box2.type);
      if (box2.largeSize)
        this.writeU64(size);
    }
    measureBoxHeader(box2) {
      return 8 + (box2.largeSize ? 8 : 0);
    }
    patchBox(box2) {
      const boxOffset = this.offsets.get(box2);
      assert(boxOffset !== void 0);
      const endPos = this.writer.getPos();
      this.writer.seek(boxOffset);
      this.writeBox(box2);
      this.writer.seek(endPos);
    }
    measureBox(box2) {
      if (box2.contents && !box2.children) {
        const headerSize = this.measureBoxHeader(box2);
        return headerSize + box2.contents.byteLength;
      } else {
        let result = this.measureBoxHeader(box2);
        if (box2.contents)
          result += box2.contents.byteLength;
        if (box2.children) {
          for (const child of box2.children)
            if (child)
              result += this.measureBox(child);
        }
        return result;
      }
    }
  };
  var bytes = /* @__PURE__ */ new Uint8Array(8);
  var view = /* @__PURE__ */ new DataView(bytes.buffer);
  var u8 = (value) => {
    return [(value % 256 + 256) % 256];
  };
  var u16 = (value) => {
    view.setUint16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var i16 = (value) => {
    view.setInt16(0, value, false);
    return [bytes[0], bytes[1]];
  };
  var u24 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[1], bytes[2], bytes[3]];
  };
  var u32 = (value) => {
    view.setUint32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var i32 = (value) => {
    view.setInt32(0, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var u64 = (value) => {
    view.setUint32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var i64 = (value) => {
    view.setInt32(0, Math.floor(value / 2 ** 32), false);
    view.setUint32(4, value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
  };
  var fixed_8_8 = (value) => {
    view.setInt16(0, 2 ** 8 * value, false);
    return [bytes[0], bytes[1]];
  };
  var fixed_16_16 = (value) => {
    view.setInt32(0, 2 ** 16 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var fixed_2_30 = (value) => {
    view.setInt32(0, 2 ** 30 * value, false);
    return [bytes[0], bytes[1], bytes[2], bytes[3]];
  };
  var variableUnsignedInt = (value, byteLength) => {
    const bytes2 = [];
    let remaining = value;
    do {
      let byte = remaining & 127;
      remaining >>= 7;
      if (bytes2.length > 0) {
        byte |= 128;
      }
      bytes2.push(byte);
      if (byteLength !== void 0) {
        byteLength--;
      }
    } while (remaining > 0 || byteLength);
    return bytes2.reverse();
  };
  var ascii = (text, nullTerminated = false) => {
    const bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
    if (nullTerminated)
      bytes2.push(0);
    return bytes2;
  };
  var rotationMatrix = (rotationInDegrees) => {
    const theta = rotationInDegrees * (Math.PI / 180);
    const cosTheta = Math.round(Math.cos(theta));
    const sinTheta = Math.round(Math.sin(theta));
    return [
      cosTheta,
      sinTheta,
      0,
      -sinTheta,
      cosTheta,
      0,
      0,
      0,
      1
    ];
  };
  var IDENTITY_MATRIX = /* @__PURE__ */ rotationMatrix(0);
  var matrixToBytes = (matrix) => {
    return [
      fixed_16_16(matrix[0]),
      fixed_16_16(matrix[1]),
      fixed_2_30(matrix[2]),
      fixed_16_16(matrix[3]),
      fixed_16_16(matrix[4]),
      fixed_2_30(matrix[5]),
      fixed_16_16(matrix[6]),
      fixed_16_16(matrix[7]),
      fixed_2_30(matrix[8])
    ];
  };
  var box = (type, contents, children) => ({
    type,
    contents: contents && new Uint8Array(contents.flat(10)),
    children
  });
  var fullBox = (type, version, flags, contents, children) => box(type, [u8(version), u24(flags), contents ?? []], children);
  var ftyp = (details) => {
    const minorVersion = 512;
    if (details.isQuickTime) {
      return box("ftyp", [
        ascii("qt  "),
        // Major brand
        u32(minorVersion),
        // Minor version
        // Compatible brands
        ascii("qt  ")
      ]);
    }
    if (details.fragmented) {
      if (details.cmaf) {
        return box("ftyp", [
          ascii("iso5"),
          // Major brand
          u32(minorVersion),
          // Minor version
          // Compatible brands
          ascii("iso5"),
          ascii("iso6"),
          ascii("mp41"),
          ascii("cmfc"),
          ascii("dash")
        ]);
      } else {
        return box("ftyp", [
          ascii("iso5"),
          // Major brand
          u32(minorVersion),
          // Minor version
          // Compatible brands
          ascii("iso5"),
          ascii("iso6"),
          ascii("mp41")
        ]);
      }
    }
    return box("ftyp", [
      ascii("isom"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("isom"),
      details.holdsAvc ? ascii("avc1") : [],
      ascii("mp41")
    ]);
  };
  var styp = () => box("styp", [
    ascii("iso5"),
    // Major brand
    u32(0),
    // Minor version
    // Compatible brands
    ascii("iso5"),
    ascii("iso6"),
    ascii("mp41"),
    ascii("cmfc"),
    ascii("dash")
  ]);
  var sidx = (muxer, referencedSize) => {
    let duration = muxer.maxWrittenEndTimestamp - muxer.minWrittenTimestamp;
    if (!Number.isFinite(duration)) {
      duration = 0;
    }
    return fullBox("sidx", 1, 0, [
      u32(1),
      // Reference ID
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u64(intoTimescale(muxer.minWrittenTimestamp, GLOBAL_TIMESCALE)),
      // Earliest presentation time
      u64(0),
      // First offset
      u16(0),
      // Reserved
      u16(1),
      // Reference count
      u32(referencedSize & 2147483647),
      // Reference type (0) + referenced size
      u32(intoTimescale(duration, GLOBAL_TIMESCALE)),
      // Subsegment duration
      u32(0)
      // Starts with SAP + SAP type + SAP delta time (no information provided)
    ]);
  };
  var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
  var free = (size) => ({ type: "free", size });
  var moov = (muxer) => {
    return box("moov", void 0, [
      mvhd(muxer.creationTime, muxer.trackDatas),
      ...muxer.trackDatas.map((x) => trak(x, muxer.creationTime)),
      muxer.isFragmented ? mvex(muxer.trackDatas) : null,
      udta(muxer)
    ]);
  };
  var mvhd = (creationTime, trackDatas) => {
    const duration = Math.max(0, ...trackDatas.map((trackData) => intoTimescale(presentationSpan(trackData), GLOBAL_TIMESCALE) + intoTimescale(trackData.startTimestampOffset ?? 0, GLOBAL_TIMESCALE)));
    const nextTrackId = Math.max(0, ...trackDatas.map((x) => x.track.id)) + 1;
    const needsU64 = !isU32(creationTime) || !isU32(duration);
    const u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mvhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(GLOBAL_TIMESCALE),
      // Timescale
      u32OrU64(duration),
      // Duration
      fixed_16_16(1),
      // Preferred rate
      fixed_8_8(1),
      // Preferred volume
      Array(10).fill(0),
      // Reserved
      matrixToBytes(IDENTITY_MATRIX),
      // Matrix
      Array(24).fill(0),
      // Pre-defined
      u32(nextTrackId)
      // Next track ID
    ]);
  };
  var presentationSpan = (trackData) => {
    if (trackData.samples.length === 0) {
      return 0;
    }
    let minTimestamp = Infinity;
    let maxEndTimestamp = -Infinity;
    for (let i = 0; i < trackData.samples.length; i++) {
      const sample = trackData.samples[i];
      if (sample.timestamp < minTimestamp) {
        minTimestamp = sample.timestamp;
      }
      if (sample.timestamp + sample.duration > maxEndTimestamp) {
        maxEndTimestamp = sample.timestamp + sample.duration;
      }
    }
    if (minTimestamp === Infinity) {
      return 0;
    }
    return maxEndTimestamp - minTimestamp;
  };
  var trak = (trackData, creationTime) => {
    const trackMetadata = getTrackMetadata(trackData);
    const needsEditList = trackData.startTimestampOffset !== null && trackData.startTimestampOffset > 0;
    return box("trak", void 0, [
      tkhd(trackData, creationTime),
      needsEditList ? edts(trackData, trackData.startTimestampOffset) : null,
      mdia(trackData, creationTime),
      trackMetadata.name !== void 0 ? box("udta", void 0, [
        box("name", [
          ...textEncoder.encode(trackMetadata.name)
        ])
      ]) : null
    ]);
  };
  var tkhd = (trackData, creationTime) => {
    const durationInGlobalTimescale = intoTimescale(presentationSpan(trackData), GLOBAL_TIMESCALE) + intoTimescale(trackData.startTimestampOffset ?? 0, GLOBAL_TIMESCALE);
    const needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
    const u32OrU64 = needsU64 ? u64 : u32;
    let matrix;
    if (trackData.type === "video") {
      const rotation = trackData.track.metadata.rotation;
      matrix = rotationMatrix(rotation ?? 0);
    } else {
      matrix = IDENTITY_MATRIX;
    }
    let flags = 2;
    if (trackData.track.metadata.disposition?.default !== false) {
      flags |= 1;
    }
    return fullBox("tkhd", +needsU64, flags, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(trackData.track.id),
      // Track ID
      u32(0),
      // Reserved
      u32OrU64(durationInGlobalTimescale),
      // Duration
      Array(8).fill(0),
      // Reserved
      u16(0),
      // Layer
      u16(trackData.track.id),
      // Alternate group
      fixed_8_8(trackData.type === "audio" ? 1 : 0),
      // Volume
      u16(0),
      // Reserved
      matrixToBytes(matrix),
      // Matrix
      fixed_16_16(trackData.type === "video" ? trackData.info.width : 0),
      // Track width
      fixed_16_16(trackData.type === "video" ? trackData.info.height : 0)
      // Track height
    ]);
  };
  var edts = (trackData, offset) => {
    const startOffset = intoTimescale(offset, GLOBAL_TIMESCALE);
    const mediaDuration = intoTimescale(presentationSpan(trackData), GLOBAL_TIMESCALE);
    const needs64Bits = !isU32(startOffset) || !isU32(mediaDuration);
    const u32OrU64 = needs64Bits ? u64 : u32;
    const i32OrI64 = needs64Bits ? i64 : i32;
    return box("edts", void 0, [
      fullBox("elst", needs64Bits ? 1 : 0, 0, [
        u32(2),
        // Entry count
        // #1
        u32OrU64(startOffset),
        // Segment duration
        i32OrI64(-1),
        // Media time
        fixed_16_16(1),
        // Media rate
        // #2
        u32OrU64(mediaDuration),
        // Segment duration
        i32OrI64(0),
        // Media time
        fixed_16_16(1)
        // Media rate
      ])
    ]);
  };
  var mdia = (trackData, creationTime) => box("mdia", void 0, [
    mdhd(trackData, creationTime),
    hdlr(true, TRACK_TYPE_TO_COMPONENT_SUBTYPE[trackData.type], TRACK_TYPE_TO_HANDLER_NAME[trackData.type]),
    minf(trackData)
  ]);
  var mdhd = (trackData, creationTime) => {
    const localDuration = intoTimescale(presentationSpan(trackData), trackData.timescale);
    const needsU64 = !isU32(creationTime) || !isU32(localDuration);
    const u32OrU64 = needsU64 ? u64 : u32;
    return fullBox("mdhd", +needsU64, 0, [
      u32OrU64(creationTime),
      // Creation time
      u32OrU64(creationTime),
      // Modification time
      u32(trackData.timescale),
      // Timescale
      u32OrU64(localDuration),
      // Duration
      u16(getLanguageCodeInt(trackData.track.metadata.languageCode ?? UNDETERMINED_LANGUAGE)),
      // Language
      u16(0)
      // Quality
    ]);
  };
  var TRACK_TYPE_TO_COMPONENT_SUBTYPE = {
    video: "vide",
    audio: "soun",
    subtitle: "text"
  };
  var TRACK_TYPE_TO_HANDLER_NAME = {
    video: "MediabunnyVideoHandler",
    audio: "MediabunnySoundHandler",
    subtitle: "MediabunnyTextHandler"
  };
  var hdlr = (hasComponentType, handlerType, name, manufacturer = "\0\0\0\0") => fullBox("hdlr", 0, 0, [
    hasComponentType ? ascii("mhlr") : u32(0),
    // Component type
    ascii(handlerType),
    // Component subtype
    ascii(manufacturer),
    // Component manufacturer
    u32(0),
    // Component flags
    u32(0),
    // Component flags mask
    ascii(name, true)
    // Component name
  ]);
  var minf = (trackData) => box("minf", void 0, [
    TRACK_TYPE_TO_HEADER_BOX[trackData.type](),
    dinf(),
    stbl(trackData)
  ]);
  var vmhd = () => fullBox("vmhd", 0, 1, [
    u16(0),
    // Graphics mode
    u16(0),
    // Opcolor R
    u16(0),
    // Opcolor G
    u16(0)
    // Opcolor B
  ]);
  var smhd = () => fullBox("smhd", 0, 0, [
    u16(0),
    // Balance
    u16(0)
    // Reserved
  ]);
  var nmhd = () => fullBox("nmhd", 0, 0);
  var TRACK_TYPE_TO_HEADER_BOX = {
    video: vmhd,
    audio: smhd,
    subtitle: nmhd
  };
  var dinf = () => box("dinf", void 0, [
    dref()
  ]);
  var dref = () => fullBox("dref", 0, 0, [
    u32(1)
    // Entry count
  ], [
    url()
  ]);
  var url = () => fullBox("url ", 0, 1);
  var stbl = (trackData) => {
    const needsCtts = trackData.compositionTimeOffsetTable.length > 1 || trackData.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
    return box("stbl", void 0, [
      stsd(trackData),
      stts(trackData),
      needsCtts ? ctts(trackData) : null,
      needsCtts ? cslg(trackData) : null,
      stsc(trackData),
      stsz(trackData),
      stco(trackData),
      stss(trackData)
    ]);
  };
  var stsd = (trackData) => {
    let sampleDescription;
    if (trackData.type === "video") {
      sampleDescription = videoSampleDescription(videoCodecToBoxName(trackData.track.source._codec, trackData.info.decoderConfig.codec), trackData);
    } else if (trackData.type === "audio") {
      const boxName = audioCodecToBoxName(trackData.track.source._codec, trackData.muxer.isQuickTime);
      assert(boxName);
      sampleDescription = soundSampleDescription(boxName, trackData);
    } else if (trackData.type === "subtitle") {
      sampleDescription = subtitleSampleDescription(SUBTITLE_CODEC_TO_BOX_NAME[trackData.track.source._codec], trackData);
    }
    assert(sampleDescription);
    return fullBox("stsd", 0, 0, [
      u32(1)
      // Entry count
    ], [
      sampleDescription
    ]);
  };
  var videoSampleDescription = (compressionType, trackData) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1),
    // Data reference index
    u16(0),
    // Pre-defined
    u16(0),
    // Reserved
    Array(12).fill(0),
    // Pre-defined
    u16(trackData.info.width),
    // Width
    u16(trackData.info.height),
    // Height
    u32(4718592),
    // Horizontal resolution
    u32(4718592),
    // Vertical resolution
    u32(0),
    // Reserved
    u16(1),
    // Frame count
    Array(32).fill(0),
    // Compressor name
    u16(24),
    // Depth
    i16(65535)
    // Pre-defined
  ], [
    VIDEO_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec]?.(trackData) ?? null,
    pasp(trackData),
    colorSpaceIsComplete(trackData.info.decoderConfig.colorSpace) ? colr(trackData) : null
  ]);
  var pasp = (trackData) => {
    if (trackData.info.pixelAspectRatio.num === trackData.info.pixelAspectRatio.den) {
      return null;
    }
    return box("pasp", [
      u32(trackData.info.pixelAspectRatio.num),
      u32(trackData.info.pixelAspectRatio.den)
    ]);
  };
  var colr = (trackData) => box("colr", [
    ascii(trackData.muxer.isQuickTime ? "nclc" : "nclx"),
    // Colour type
    u16(COLOR_PRIMARIES_MAP[trackData.info.decoderConfig.colorSpace.primaries]),
    // Colour primaries
    u16(TRANSFER_CHARACTERISTICS_MAP[trackData.info.decoderConfig.colorSpace.transfer]),
    // Transfer characteristics
    u16(MATRIX_COEFFICIENTS_MAP[trackData.info.decoderConfig.colorSpace.matrix]),
    // Matrix coefficients
    trackData.muxer.isQuickTime ? [] : u8((trackData.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
    // Full range flag
  ]);
  var avcC = (trackData) => trackData.info.decoderConfig && box("avcC", [
    // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
    ...toUint8Array(trackData.info.decoderConfig.description)
  ]);
  var hvcC = (trackData) => trackData.info.decoderConfig && box("hvcC", [
    // For HEVC, description is an HEVCDecoderConfigurationRecord, so nothing else to do here
    ...toUint8Array(trackData.info.decoderConfig.description)
  ]);
  var vpcC = (trackData) => {
    if (!trackData.info.decoderConfig) {
      return null;
    }
    const decoderConfig = trackData.info.decoderConfig;
    const parts = decoderConfig.codec.split(".");
    const profile = Number(parts[1]);
    const level = Number(parts[2]);
    const bitDepth = Number(parts[3]);
    const chromaSubsampling = parts[4] ? Number(parts[4]) : 1;
    const videoFullRangeFlag = parts[8] ? Number(parts[8]) : Number(decoderConfig.colorSpace?.fullRange ?? 0);
    const thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + videoFullRangeFlag;
    const colourPrimaries = parts[5] ? Number(parts[5]) : decoderConfig.colorSpace?.primaries ? COLOR_PRIMARIES_MAP[decoderConfig.colorSpace.primaries] : 2;
    const transferCharacteristics = parts[6] ? Number(parts[6]) : decoderConfig.colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[decoderConfig.colorSpace.transfer] : 2;
    const matrixCoefficients = parts[7] ? Number(parts[7]) : decoderConfig.colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[decoderConfig.colorSpace.matrix] : 2;
    return fullBox("vpcC", 1, 0, [
      u8(profile),
      // Profile
      u8(level),
      // Level
      u8(thirdByte),
      // Bit depth, chroma subsampling, full range
      u8(colourPrimaries),
      // Colour primaries
      u8(transferCharacteristics),
      // Transfer characteristics
      u8(matrixCoefficients),
      // Matrix coefficients
      u16(0)
      // Codec initialization data size
    ]);
  };
  var av1C = (trackData) => {
    return box("av1C", generateAv1CodecConfigurationFromCodecString(trackData.info.decoderConfig.codec));
  };
  var soundSampleDescription = (compressionType, trackData) => {
    let version = 0;
    let contents;
    let sampleSizeInBits = 16;
    const isPcmCodec = PCM_AUDIO_CODECS.includes(trackData.track.source._codec);
    if (isPcmCodec) {
      const codec = trackData.track.source._codec;
      const { sampleSize } = parsePcmCodec(codec);
      sampleSizeInBits = 8 * sampleSize;
      if (sampleSizeInBits > 16) {
        version = 1;
      }
    }
    if (trackData.muxer.isQuickTime) {
      version = 1;
    }
    if (version === 0) {
      contents = [
        Array(6).fill(0),
        // Reserved
        u16(1),
        // Data reference index
        u16(version),
        // Version
        u16(0),
        // Revision level
        u32(0),
        // Vendor
        u16(trackData.info.numberOfChannels),
        // Number of channels
        u16(sampleSizeInBits),
        // Sample size (bits)
        u16(0),
        // Compression ID
        u16(0),
        // Packet size
        u16(trackData.info.sampleRate < 2 ** 16 ? trackData.info.sampleRate : 0),
        // Sample rate (upper)
        u16(0)
        // Sample rate (lower)
      ];
    } else {
      const compressionId = isPcmCodec ? 0 : -2;
      contents = [
        Array(6).fill(0),
        // Reserved
        u16(1),
        // Data reference index
        u16(version),
        // Version
        u16(0),
        // Revision level
        u32(0),
        // Vendor
        u16(trackData.info.numberOfChannels),
        // Number of channels
        u16(Math.min(sampleSizeInBits, 16)),
        // Sample size (bits)
        i16(compressionId),
        // Compression ID
        u16(0),
        // Packet size
        u16(trackData.info.sampleRate < 2 ** 16 ? trackData.info.sampleRate : 0),
        // Sample rate (upper)
        u16(0),
        // Sample rate (lower)
        isPcmCodec ? [
          u32(1),
          // Samples per packet (must be 1 for uncompressed formats)
          u32(sampleSizeInBits / 8),
          // Bytes per packet
          u32(trackData.info.numberOfChannels * sampleSizeInBits / 8)
          // Bytes per frame
        ] : [
          u32(0),
          // Samples per packet (don't bother, still works with 0)
          u32(0),
          // Bytes per packet (variable)
          u32(0)
          // Bytes per frame (variable)
        ],
        u32(2)
        // Bytes per sample (constant in FFmpeg)
      ];
    }
    return box(compressionType, contents, [
      audioCodecToConfigurationBox(trackData.track.source._codec, trackData.muxer.isQuickTime)?.(trackData) ?? null
    ]);
  };
  var esds = (trackData) => {
    let objectTypeIndication;
    switch (trackData.track.source._codec) {
      case "aac":
        {
          objectTypeIndication = 64;
        }
        ;
        break;
      case "mp3":
        {
          objectTypeIndication = 107;
        }
        ;
        break;
      case "vorbis":
        {
          objectTypeIndication = 221;
        }
        ;
        break;
      default:
        throw new Error(`Unhandled audio codec: ${trackData.track.source._codec}`);
    }
    let bytes2 = [
      ...u8(objectTypeIndication),
      // Object type indication
      ...u8(21),
      // stream type(6bits)=5 audio, flags(2bits)=1
      ...u24(0),
      // 24bit buffer size
      ...u32(0),
      // max bitrate
      ...u32(0)
      // avg bitrate
    ];
    if (trackData.info.decoderConfig.description) {
      const description = toUint8Array(trackData.info.decoderConfig.description);
      bytes2 = [
        ...bytes2,
        ...u8(5),
        // TAG(5) = DecoderSpecificInfo
        ...variableUnsignedInt(description.byteLength),
        ...description
      ];
    }
    bytes2 = [
      ...u16(1),
      // ES_ID = 1
      ...u8(0),
      // flags etc = 0
      ...u8(4),
      // TAG(4) = ES Descriptor
      ...variableUnsignedInt(bytes2.length),
      ...bytes2,
      ...u8(6),
      // TAG(6)
      ...u8(1),
      // length
      ...u8(2)
      // data
    ];
    bytes2 = [
      ...u8(3),
      // TAG(3) = Object Descriptor
      ...variableUnsignedInt(bytes2.length),
      ...bytes2
    ];
    return fullBox("esds", 0, 0, bytes2);
  };
  var wave = (trackData) => {
    return box("wave", void 0, [
      frma(trackData),
      enda(trackData),
      box("\0\0\0\0")
      // NULL tag at the end
    ]);
  };
  var frma = (trackData) => {
    return box("frma", [
      ascii(audioCodecToBoxName(trackData.track.source._codec, trackData.muxer.isQuickTime))
    ]);
  };
  var enda = (trackData) => {
    const { littleEndian } = parsePcmCodec(trackData.track.source._codec);
    return box("enda", [
      u16(+littleEndian)
    ]);
  };
  var dOps = (trackData) => {
    let outputChannelCount = trackData.info.numberOfChannels;
    let preSkip = 3840;
    let inputSampleRate = trackData.info.sampleRate;
    let outputGain = 0;
    let channelMappingFamily = 0;
    let channelMappingTable = new Uint8Array(0);
    const description = trackData.info.decoderConfig?.description;
    if (description) {
      assert(description.byteLength >= 18);
      const bytes2 = toUint8Array(description);
      const header = parseOpusIdentificationHeader(bytes2);
      outputChannelCount = header.outputChannelCount;
      preSkip = header.preSkip;
      inputSampleRate = header.inputSampleRate;
      outputGain = header.outputGain;
      channelMappingFamily = header.channelMappingFamily;
      if (header.channelMappingTable) {
        channelMappingTable = header.channelMappingTable;
      }
    }
    return box("dOps", [
      u8(0),
      // Version
      u8(outputChannelCount),
      // OutputChannelCount
      u16(preSkip),
      // PreSkip
      u32(inputSampleRate),
      // InputSampleRate
      i16(outputGain),
      // OutputGain
      u8(channelMappingFamily),
      // ChannelMappingFamily
      ...channelMappingTable
    ]);
  };
  var dfLa = (trackData) => {
    const description = trackData.info.decoderConfig?.description;
    assert(description);
    const bytes2 = toUint8Array(description);
    return fullBox("dfLa", 0, 0, [
      ...bytes2.subarray(4)
    ]);
  };
  var pcmC = (trackData) => {
    const { littleEndian, sampleSize } = parsePcmCodec(trackData.track.source._codec);
    const formatFlags = +littleEndian;
    return fullBox("pcmC", 0, 0, [
      u8(formatFlags),
      u8(8 * sampleSize)
    ]);
  };
  var dac3 = (trackData) => {
    const frameInfo = parseAc3SyncFrame(trackData.info.firstPacket.data);
    if (!frameInfo) {
      throw new Error("Couldn't extract AC-3 frame info from the audio packet. Ensure the packets contain valid AC-3 sync frames (as specified in ETSI TS 102 366).");
    }
    const bytes2 = new Uint8Array(3);
    const bitstream = new Bitstream(bytes2);
    bitstream.writeBits(2, frameInfo.fscod);
    bitstream.writeBits(5, frameInfo.bsid);
    bitstream.writeBits(3, frameInfo.bsmod);
    bitstream.writeBits(3, frameInfo.acmod);
    bitstream.writeBits(1, frameInfo.lfeon);
    bitstream.writeBits(5, frameInfo.bitRateCode);
    bitstream.writeBits(5, 0);
    return box("dac3", [...bytes2]);
  };
  var dec3 = (trackData) => {
    const frameInfo = parseEac3SyncFrame(trackData.info.firstPacket.data);
    if (!frameInfo) {
      throw new Error("Couldn't extract E-AC-3 frame info from the audio packet. Ensure the packets contain valid E-AC-3 sync frames (as specified in ETSI TS 102 366).");
    }
    let totalBits = 16;
    for (const sub of frameInfo.substreams) {
      totalBits += 23;
      if (sub.numDepSub > 0) {
        totalBits += 9;
      } else {
        totalBits += 1;
      }
    }
    const size = Math.ceil(totalBits / 8);
    const bytes2 = new Uint8Array(size);
    const bitstream = new Bitstream(bytes2);
    bitstream.writeBits(13, frameInfo.dataRate);
    bitstream.writeBits(3, frameInfo.substreams.length - 1);
    for (const sub of frameInfo.substreams) {
      bitstream.writeBits(2, sub.fscod);
      bitstream.writeBits(5, sub.bsid);
      bitstream.writeBits(1, 0);
      bitstream.writeBits(1, 0);
      bitstream.writeBits(3, sub.bsmod);
      bitstream.writeBits(3, sub.acmod);
      bitstream.writeBits(1, sub.lfeon);
      bitstream.writeBits(3, 0);
      bitstream.writeBits(4, sub.numDepSub);
      if (sub.numDepSub > 0) {
        bitstream.writeBits(9, sub.chanLoc);
      } else {
        bitstream.writeBits(1, 0);
      }
    }
    return box("dec3", [...bytes2]);
  };
  var subtitleSampleDescription = (compressionType, trackData) => box(compressionType, [
    Array(6).fill(0),
    // Reserved
    u16(1)
    // Data reference index
  ], [
    SUBTITLE_CODEC_TO_CONFIGURATION_BOX[trackData.track.source._codec](trackData)
  ]);
  var vttC = (trackData) => box("vttC", [
    ...textEncoder.encode(trackData.info.config.description)
  ]);
  var stts = (trackData) => {
    return fullBox("stts", 0, 0, [
      u32(trackData.timeToSampleTable.length),
      // Number of entries
      trackData.timeToSampleTable.map((x) => [
        u32(x.sampleCount),
        // Sample count
        u32(x.sampleDelta)
        // Sample duration
      ])
    ]);
  };
  var stss = (trackData) => {
    if (trackData.samples.every((x) => x.type === "key"))
      return null;
    const keySamples = [...trackData.samples.entries()].filter(([, sample]) => sample.type === "key");
    return fullBox("stss", 0, 0, [
      u32(keySamples.length),
      // Number of entries
      keySamples.map(([index]) => u32(index + 1))
      // Sync sample table
    ]);
  };
  var stsc = (trackData) => {
    return fullBox("stsc", 0, 0, [
      u32(trackData.compactlyCodedChunkTable.length),
      // Number of entries
      trackData.compactlyCodedChunkTable.map((x) => [
        u32(x.firstChunk),
        // First chunk
        u32(x.samplesPerChunk),
        // Samples per chunk
        u32(1)
        // Sample description index
      ])
    ]);
  };
  var stsz = (trackData) => {
    if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
      const { sampleSize } = parsePcmCodec(trackData.track.source._codec);
      return fullBox("stsz", 0, 0, [
        u32(sampleSize * trackData.info.numberOfChannels),
        // Sample size
        u32(trackData.samples.reduce((acc, x) => acc + intoTimescale(x.duration, trackData.timescale), 0))
      ]);
    }
    return fullBox("stsz", 0, 0, [
      u32(0),
      // Sample size (0 means non-constant size)
      u32(trackData.samples.length),
      // Number of entries
      trackData.samples.map((x) => u32(x.size))
      // Sample size table
    ]);
  };
  var stco = (trackData) => {
    if (trackData.finalizedChunks.length > 0 && last(trackData.finalizedChunks).offset >= 2 ** 32) {
      return fullBox("co64", 0, 0, [
        u32(trackData.finalizedChunks.length),
        // Number of entries
        trackData.finalizedChunks.map((x) => u64(x.offset))
        // Chunk offset table
      ]);
    }
    return fullBox("stco", 0, 0, [
      u32(trackData.finalizedChunks.length),
      // Number of entries
      trackData.finalizedChunks.map((x) => u32(x.offset))
      // Chunk offset table
    ]);
  };
  var ctts = (trackData) => {
    return fullBox("ctts", 1, 0, [
      u32(trackData.compositionTimeOffsetTable.length),
      // Number of entries
      trackData.compositionTimeOffsetTable.map((x) => [
        u32(x.sampleCount),
        // Sample count
        i32(x.sampleCompositionTimeOffset)
        // Sample offset
      ])
    ]);
  };
  var cslg = (trackData) => {
    let leastDecodeToDisplayDelta = Infinity;
    let greatestDecodeToDisplayDelta = -Infinity;
    let compositionStartTime = Infinity;
    let compositionEndTime = -Infinity;
    assert(trackData.compositionTimeOffsetTable.length > 0);
    assert(trackData.samples.length > 0);
    for (let i = 0; i < trackData.compositionTimeOffsetTable.length; i++) {
      const entry = trackData.compositionTimeOffsetTable[i];
      leastDecodeToDisplayDelta = Math.min(leastDecodeToDisplayDelta, entry.sampleCompositionTimeOffset);
      greatestDecodeToDisplayDelta = Math.max(greatestDecodeToDisplayDelta, entry.sampleCompositionTimeOffset);
    }
    for (let i = 0; i < trackData.samples.length; i++) {
      const sample = trackData.samples[i];
      compositionStartTime = Math.min(compositionStartTime, intoTimescale(sample.timestamp, trackData.timescale));
      compositionEndTime = Math.max(compositionEndTime, intoTimescale(sample.timestamp + sample.duration, trackData.timescale));
    }
    const compositionToDtsShift = Math.max(-leastDecodeToDisplayDelta, 0);
    if (compositionEndTime >= 2 ** 31) {
      return null;
    }
    return fullBox("cslg", 0, 0, [
      i32(compositionToDtsShift),
      // Composition to DTS shift
      i32(leastDecodeToDisplayDelta),
      // Least decode to display delta
      i32(greatestDecodeToDisplayDelta),
      // Greatest decode to display delta
      i32(compositionStartTime),
      // Composition start time
      i32(compositionEndTime)
      // Composition end time
    ]);
  };
  var mvex = (trackDatas) => {
    return box("mvex", void 0, trackDatas.map(trex));
  };
  var trex = (trackData) => {
    return fullBox("trex", 0, 0, [
      u32(trackData.track.id),
      // Track ID
      u32(1),
      // Default sample description index
      u32(0),
      // Default sample duration
      u32(0),
      // Default sample size
      u32(0)
      // Default sample flags
    ]);
  };
  var moof = (sequenceNumber, trackDatas) => {
    return box("moof", void 0, [
      mfhd(sequenceNumber),
      ...trackDatas.map(traf)
    ]);
  };
  var mfhd = (sequenceNumber) => {
    return fullBox("mfhd", 0, 0, [
      u32(sequenceNumber)
      // Sequence number
    ]);
  };
  var fragmentSampleFlags = (sample) => {
    let byte1 = 0;
    let byte2 = 0;
    const byte3 = 0;
    const byte4 = 0;
    const sampleIsDifferenceSample = sample.type === "delta";
    byte2 |= +sampleIsDifferenceSample;
    if (sampleIsDifferenceSample) {
      byte1 |= 1;
    } else {
      byte1 |= 2;
    }
    return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
  };
  var traf = (trackData) => {
    return box("traf", void 0, [
      tfhd(trackData),
      tfdt(trackData),
      trun(trackData)
    ]);
  };
  var tfhd = (trackData) => {
    assert(trackData.currentChunk);
    let tfFlags = 0;
    tfFlags |= 8;
    tfFlags |= 16;
    tfFlags |= 32;
    tfFlags |= 131072;
    const referenceSample = trackData.currentChunk.samples[1] ?? trackData.currentChunk.samples[0];
    const referenceSampleInfo = {
      duration: referenceSample.timescaleUnitsToNextSample,
      size: referenceSample.size,
      flags: fragmentSampleFlags(referenceSample)
    };
    return fullBox("tfhd", 0, tfFlags, [
      u32(trackData.track.id),
      // Track ID
      u32(referenceSampleInfo.duration),
      // Default sample duration
      u32(referenceSampleInfo.size),
      // Default sample size
      u32(referenceSampleInfo.flags)
      // Default sample flags
    ]);
  };
  var tfdt = (trackData) => {
    assert(trackData.currentChunk);
    return fullBox("tfdt", 1, 0, [
      u64(intoTimescale(trackData.currentChunk.startTimestamp, trackData.timescale))
      // Base Media Decode Time
    ]);
  };
  var trun = (trackData) => {
    assert(trackData.currentChunk);
    const allSampleDurations = trackData.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
    const allSampleSizes = trackData.currentChunk.samples.map((x) => x.size);
    const allSampleFlags = trackData.currentChunk.samples.map(fragmentSampleFlags);
    const allSampleCompositionTimeOffsets = trackData.currentChunk.samples.map((x) => intoTimescale(x.timestamp - x.decodeTimestamp, trackData.timescale));
    const uniqueSampleDurations = new Set(allSampleDurations);
    const uniqueSampleSizes = new Set(allSampleSizes);
    const uniqueSampleFlags = new Set(allSampleFlags);
    const uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
    const firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
    const sampleDurationPresent = uniqueSampleDurations.size > 1;
    const sampleSizePresent = uniqueSampleSizes.size > 1;
    const sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
    const sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
    let flags = 0;
    flags |= 1;
    flags |= 4 * +firstSampleFlagsPresent;
    flags |= 256 * +sampleDurationPresent;
    flags |= 512 * +sampleSizePresent;
    flags |= 1024 * +sampleFlagsPresent;
    flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
    return fullBox("trun", 1, flags, [
      u32(trackData.currentChunk.samples.length),
      // Sample count
      u32(trackData.currentChunk.offset - trackData.currentChunk.moofOffset || 0),
      // Data offset
      firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
      trackData.currentChunk.samples.map((_, i) => [
        sampleDurationPresent ? u32(allSampleDurations[i]) : [],
        // Sample duration
        sampleSizePresent ? u32(allSampleSizes[i]) : [],
        // Sample size
        sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
        // Sample flags
        // Sample composition time offsets
        sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
      ])
    ]);
  };
  var mfra = (trackDatas) => {
    return box("mfra", void 0, [
      ...trackDatas.map(tfra),
      mfro()
    ]);
  };
  var tfra = (trackData, trackIndex) => {
    const version = 1;
    return fullBox("tfra", version, 0, [
      u32(trackData.track.id),
      // Track ID
      u32(63),
      // This specifies that traf number, trun number and sample number are 32-bit ints
      u32(trackData.finalizedChunks.length),
      // Number of entries
      trackData.finalizedChunks.map((chunk) => [
        u64(intoTimescale(chunk.samples[0].timestamp, trackData.timescale)),
        // Time (in presentation time)
        u64(chunk.moofOffset),
        // moof offset
        u32(trackIndex + 1),
        // traf number
        u32(1),
        // trun number
        u32(1)
        // Sample number
      ])
    ]);
  };
  var mfro = () => {
    return fullBox("mfro", 0, 0, [
      // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
      // is known
      u32(0)
      // Size
    ]);
  };
  var vtte = () => box("vtte");
  var vttc = (payload, timestamp, identifier, settings, sourceId) => box("vttc", void 0, [
    sourceId !== null ? box("vsid", [i32(sourceId)]) : null,
    identifier !== null ? box("iden", [...textEncoder.encode(identifier)]) : null,
    timestamp !== null ? box("ctim", [...textEncoder.encode(formatSubtitleTimestamp(timestamp))]) : null,
    settings !== null ? box("sttg", [...textEncoder.encode(settings)]) : null,
    box("payl", [...textEncoder.encode(payload)])
  ]);
  var vtta = (notes) => box("vtta", [...textEncoder.encode(notes)]);
  var udta = (muxer) => {
    const boxes = [];
    const metadataFormat = muxer.format._options.metadataFormat ?? "auto";
    const metadataTags = muxer.output._metadataTags;
    if (metadataFormat === "mdir" || metadataFormat === "auto" && !muxer.isQuickTime) {
      const metaBox = metaMdir(metadataTags);
      if (metaBox)
        boxes.push(metaBox);
    } else if (metadataFormat === "mdta") {
      const metaBox = metaMdta(metadataTags);
      if (metaBox)
        boxes.push(metaBox);
    } else if (metadataFormat === "udta" || metadataFormat === "auto" && muxer.isQuickTime) {
      addQuickTimeMetadataTagBoxes(boxes, muxer.output._metadataTags);
    }
    if (boxes.length === 0) {
      return null;
    }
    return box("udta", void 0, boxes);
  };
  var addQuickTimeMetadataTagBoxes = (boxes, tags) => {
    for (const { key, value } of keyValueIterator(tags)) {
      switch (key) {
        case "title":
          {
            boxes.push(metadataTagStringBoxShort("\xA9nam", value));
          }
          ;
          break;
        case "description":
          {
            boxes.push(metadataTagStringBoxShort("\xA9des", value));
          }
          ;
          break;
        case "artist":
          {
            boxes.push(metadataTagStringBoxShort("\xA9ART", value));
          }
          ;
          break;
        case "album":
          {
            boxes.push(metadataTagStringBoxShort("\xA9alb", value));
          }
          ;
          break;
        case "albumArtist":
          {
            boxes.push(metadataTagStringBoxShort("albr", value));
          }
          ;
          break;
        case "genre":
          {
            boxes.push(metadataTagStringBoxShort("\xA9gen", value));
          }
          ;
          break;
        case "date":
          {
            boxes.push(metadataTagStringBoxShort("\xA9day", value.toISOString().slice(0, 10)));
          }
          ;
          break;
        case "comment":
          {
            boxes.push(metadataTagStringBoxShort("\xA9cmt", value));
          }
          ;
          break;
        case "lyrics":
          {
            boxes.push(metadataTagStringBoxShort("\xA9lyr", value));
          }
          ;
          break;
        case "raw":
          {
          }
          ;
          break;
        case "discNumber":
        case "discsTotal":
        case "trackNumber":
        case "tracksTotal":
        case "images":
          {
          }
          ;
          break;
        default:
          assertNever(key);
      }
    }
    if (tags.raw) {
      for (const key in tags.raw) {
        const value = tags.raw[key];
        if (value == null || key.length !== 4 || boxes.some((x) => x.type === key)) {
          continue;
        }
        if (typeof value === "string") {
          boxes.push(metadataTagStringBoxShort(key, value));
        } else if (value instanceof Uint8Array) {
          boxes.push(box(key, Array.from(value)));
        }
      }
    }
  };
  var metadataTagStringBoxShort = (name, value) => {
    const encoded = textEncoder.encode(value);
    return box(name, [
      u16(encoded.length),
      u16(getLanguageCodeInt("und")),
      Array.from(encoded)
    ]);
  };
  var DATA_BOX_MIME_TYPE_MAP = {
    "image/jpeg": 13,
    "image/png": 14,
    "image/bmp": 27
  };
  var generateMetadataPairs = (tags, isMdta) => {
    const pairs = [];
    for (const { key, value } of keyValueIterator(tags)) {
      switch (key) {
        case "title":
          {
            pairs.push({ key: isMdta ? "title" : "\xA9nam", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "description":
          {
            pairs.push({ key: isMdta ? "description" : "\xA9des", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "artist":
          {
            pairs.push({ key: isMdta ? "artist" : "\xA9ART", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "album":
          {
            pairs.push({ key: isMdta ? "album" : "\xA9alb", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "albumArtist":
          {
            pairs.push({ key: isMdta ? "album_artist" : "aART", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "comment":
          {
            pairs.push({ key: isMdta ? "comment" : "\xA9cmt", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "genre":
          {
            pairs.push({ key: isMdta ? "genre" : "\xA9gen", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "lyrics":
          {
            pairs.push({ key: isMdta ? "lyrics" : "\xA9lyr", value: dataStringBoxLong(value) });
          }
          ;
          break;
        case "date":
          {
            pairs.push({
              key: isMdta ? "date" : "\xA9day",
              value: dataStringBoxLong(value.toISOString().slice(0, 10))
            });
          }
          ;
          break;
        case "images":
          {
            for (const image of value) {
              if (image.kind !== "coverFront") {
                continue;
              }
              pairs.push({ key: "covr", value: box("data", [
                u32(DATA_BOX_MIME_TYPE_MAP[image.mimeType] ?? 0),
                // Type indicator
                u32(0),
                // Locale indicator
                Array.from(image.data)
                // Kinda slow, hopefully temp
              ]) });
            }
          }
          ;
          break;
        case "trackNumber":
          {
            if (isMdta) {
              const string = tags.tracksTotal !== void 0 ? `${value}/${tags.tracksTotal}` : value.toString();
              pairs.push({ key: "track", value: dataStringBoxLong(string) });
            } else {
              pairs.push({ key: "trkn", value: box("data", [
                u32(0),
                // 8 bytes empty
                u32(0),
                u16(0),
                // Empty
                u16(value),
                u16(tags.tracksTotal ?? 0),
                u16(0)
                // Empty
              ]) });
            }
          }
          ;
          break;
        case "discNumber":
          {
            if (!isMdta) {
              pairs.push({ key: "disc", value: box("data", [
                u32(0),
                // 8 bytes empty
                u32(0),
                u16(0),
                // Empty
                u16(value),
                u16(tags.discsTotal ?? 0),
                u16(0)
                // Empty
              ]) });
            }
          }
          ;
          break;
        case "tracksTotal":
        case "discsTotal":
          {
          }
          ;
          break;
        case "raw":
          {
          }
          ;
          break;
        default:
          assertNever(key);
      }
    }
    if (tags.raw) {
      for (const key in tags.raw) {
        const value = tags.raw[key];
        if (value == null || !isMdta && key.length !== 4 || pairs.some((x) => x.key === key)) {
          continue;
        }
        if (typeof value === "string") {
          pairs.push({ key, value: dataStringBoxLong(value) });
        } else if (value instanceof Uint8Array) {
          pairs.push({ key, value: box("data", [
            u32(0),
            // Type indicator
            u32(0),
            // Locale indicator
            Array.from(value)
          ]) });
        } else if (value instanceof RichImageData) {
          pairs.push({ key, value: box("data", [
            u32(DATA_BOX_MIME_TYPE_MAP[value.mimeType] ?? 0),
            // Type indicator
            u32(0),
            // Locale indicator
            Array.from(value.data)
            // Kinda slow, hopefully temp
          ]) });
        }
      }
    }
    return pairs;
  };
  var metaMdir = (tags) => {
    const pairs = generateMetadataPairs(tags, false);
    if (pairs.length === 0) {
      return null;
    }
    return fullBox("meta", 0, 0, void 0, [
      hdlr(false, "mdir", "", "appl"),
      // mdir handler
      box("ilst", void 0, pairs.map((pair) => box(pair.key, void 0, [pair.value])))
      // Item list without keys box
    ]);
  };
  var metaMdta = (tags) => {
    const pairs = generateMetadataPairs(tags, true);
    if (pairs.length === 0) {
      return null;
    }
    return box("meta", void 0, [
      hdlr(false, "mdta", ""),
      // mdta handler
      fullBox("keys", 0, 0, [
        u32(pairs.length)
      ], pairs.map((pair) => box("mdta", [
        ...textEncoder.encode(pair.key)
      ]))),
      box("ilst", void 0, pairs.map((pair, i) => {
        const boxName = String.fromCharCode(...u32(i + 1));
        return box(boxName, void 0, [pair.value]);
      }))
    ]);
  };
  var dataStringBoxLong = (value) => {
    return box("data", [
      u32(1),
      // Type indicator (UTF-8)
      u32(0),
      // Locale indicator
      ...textEncoder.encode(value)
    ]);
  };
  var videoCodecToBoxName = (codec, fullCodecString) => {
    switch (codec) {
      case "avc":
        return fullCodecString.startsWith("avc3") ? "avc3" : "avc1";
      case "hevc":
        return "hvc1";
      case "vp8":
        return "vp08";
      case "vp9":
        return "vp09";
      case "av1":
        return "av01";
      case "prores":
        return fullCodecString;
    }
  };
  var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
    avc: avcC,
    hevc: hvcC,
    vp8: vpcC,
    vp9: vpcC,
    av1: av1C,
    prores: null
  };
  var audioCodecToBoxName = (codec, isQuickTime) => {
    switch (codec) {
      case "aac":
        return "mp4a";
      case "mp3":
        return "mp4a";
      case "opus":
        return "Opus";
      case "vorbis":
        return "mp4a";
      case "flac":
        return "fLaC";
      case "ulaw":
        return "ulaw";
      case "alaw":
        return "alaw";
      case "pcm-u8":
        return "raw ";
      case "pcm-s8":
        return "sowt";
      case "ac3":
        return "ac-3";
      case "eac3":
        return "ec-3";
    }
    if (isQuickTime) {
      switch (codec) {
        case "pcm-s16":
          return "sowt";
        case "pcm-s16be":
          return "twos";
        case "pcm-s24":
          return "in24";
        case "pcm-s24be":
          return "in24";
        case "pcm-s32":
          return "in32";
        case "pcm-s32be":
          return "in32";
        case "pcm-f32":
          return "fl32";
        case "pcm-f32be":
          return "fl32";
        case "pcm-f64":
          return "fl64";
        case "pcm-f64be":
          return "fl64";
      }
    } else {
      switch (codec) {
        case "pcm-s16":
          return "ipcm";
        case "pcm-s16be":
          return "ipcm";
        case "pcm-s24":
          return "ipcm";
        case "pcm-s24be":
          return "ipcm";
        case "pcm-s32":
          return "ipcm";
        case "pcm-s32be":
          return "ipcm";
        case "pcm-f32":
          return "fpcm";
        case "pcm-f32be":
          return "fpcm";
        case "pcm-f64":
          return "fpcm";
        case "pcm-f64be":
          return "fpcm";
      }
    }
  };
  var audioCodecToConfigurationBox = (codec, isQuickTime) => {
    switch (codec) {
      case "aac":
        return esds;
      case "mp3":
        return esds;
      case "opus":
        return dOps;
      case "vorbis":
        return esds;
      case "flac":
        return dfLa;
      case "ac3":
        return dac3;
      case "eac3":
        return dec3;
    }
    if (isQuickTime) {
      switch (codec) {
        case "pcm-s24":
          return wave;
        case "pcm-s24be":
          return wave;
        case "pcm-s32":
          return wave;
        case "pcm-s32be":
          return wave;
        case "pcm-f32":
          return wave;
        case "pcm-f32be":
          return wave;
        case "pcm-f64":
          return wave;
        case "pcm-f64be":
          return wave;
      }
    } else {
      switch (codec) {
        case "pcm-s16":
          return pcmC;
        case "pcm-s16be":
          return pcmC;
        case "pcm-s24":
          return pcmC;
        case "pcm-s24be":
          return pcmC;
        case "pcm-s32":
          return pcmC;
        case "pcm-s32be":
          return pcmC;
        case "pcm-f32":
          return pcmC;
        case "pcm-f32be":
          return pcmC;
        case "pcm-f64":
          return pcmC;
        case "pcm-f64be":
          return pcmC;
      }
    }
    return null;
  };
  var SUBTITLE_CODEC_TO_BOX_NAME = {
    webvtt: "wvtt"
  };
  var SUBTITLE_CODEC_TO_CONFIGURATION_BOX = {
    webvtt: vttC
  };
  var getLanguageCodeInt = (code) => {
    assert(code.length === 3);
    ;
    let language = 0;
    for (let i = 0; i < 3; i++) {
      language <<= 5;
      language += code.charCodeAt(i) - 96;
    }
    return language;
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/writer.js
  var Writer = class {
    constructor(target, isMonotonic) {
      this.finalized = false;
      this.started = false;
      this.pos = 0;
      this.trackedWrites = null;
      this.trackedStart = -1;
      this.trackedEnd = -1;
      if (target._writerAcquired) {
        throw new Error("Can't have multiple Writers for the same Target.");
      }
      this.target = target;
      target._setMonotonicity(isMonotonic);
      target._writerAcquired = true;
    }
    start() {
      assert(!this.started);
      this.target._start();
      this.started = true;
    }
    /** Writes the given data to the target, at the current position. */
    write(data) {
      assert(this.started && !this.finalized);
      this.maybeTrackWrites(data);
      this.target._write(data, this.pos);
      this.pos += data.byteLength;
    }
    /** Sets the current position for future writes to a new one. */
    seek(newPos) {
      this.pos = newPos;
    }
    /** Returns the current position. */
    getPos() {
      return this.pos;
    }
    /** Signals to the writer that it may be time to flush. */
    async flush() {
      assert(this.started && !this.finalized);
      return this.target._flush();
    }
    /** Called after muxing has finished. */
    async finalize() {
      assert(this.started && !this.finalized);
      await this.target._finalize();
      this.finalized = true;
    }
    maybeTrackWrites(data) {
      if (!this.trackedWrites) {
        return;
      }
      let pos = this.getPos();
      if (pos < this.trackedStart) {
        if (pos + data.byteLength <= this.trackedStart) {
          return;
        }
        data = data.subarray(this.trackedStart - pos);
        pos = 0;
      }
      const neededSize = pos + data.byteLength - this.trackedStart;
      let newLength = this.trackedWrites.byteLength;
      while (newLength < neededSize) {
        newLength *= 2;
      }
      if (newLength !== this.trackedWrites.byteLength) {
        const copy = new Uint8Array(newLength);
        copy.set(this.trackedWrites, 0);
        this.trackedWrites = copy;
      }
      this.trackedWrites.set(data, pos - this.trackedStart);
      this.trackedEnd = Math.max(this.trackedEnd, pos + data.byteLength);
    }
    startTrackingWrites() {
      this.trackedWrites = new Uint8Array(2 ** 10);
      this.trackedStart = this.getPos();
      this.trackedEnd = this.trackedStart;
    }
    stopTrackingWrites() {
      if (!this.trackedWrites) {
        throw new Error("Internal error: Can't get tracked writes since nothing was tracked.");
      }
      const slice = this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart);
      const result = {
        data: slice,
        start: this.trackedStart,
        end: this.trackedEnd
      };
      this.trackedWrites = null;
      return result;
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/target.js
  var Target = class extends EventEmitter {
    constructor() {
      super(...arguments);
      this._writerAcquired = false;
      this._monotonicity = null;
      this.onwrite = null;
    }
    /** @internal */
    _setMonotonicity(monotonicity) {
      if (this._monotonicity !== false) {
        this._monotonicity = monotonicity;
      } else {
      }
    }
    /** @internal */
    _dispatchWrite(start, end) {
      this.onwrite?.(start, end);
      this._emit("write", { start, end });
    }
    /**
     * Returns a new {@link RangedTarget} that writes data to this target using the given offset.
     *
     * Useful for writing a file into a section of a larger file.
     */
    slice(offset) {
      if (!Number.isInteger(offset) || offset < 0) {
        throw new TypeError("offset must be a non-negative integer.");
      }
      return new RangedTarget(this, offset);
    }
  };
  var ARRAY_BUFFER_INITIAL_SIZE = 2 ** 16;
  var ARRAY_BUFFER_MAX_SIZE = 2 ** 32;
  var BufferTarget = class extends Target {
    /** Creates a new {@link BufferTarget}. The buffer holding the data will be created and managed internally. */
    constructor(options = {}) {
      super();
      this.buffer = null;
      this._maxPos = 0;
      if (!options || typeof options !== "object") {
        throw new TypeError("BufferTarget options, when provided, must be an object.");
      }
      if (options.onFinalize !== void 0 && typeof options.onFinalize !== "function") {
        throw new TypeError("options.onFinalize, when provided, must be a function.");
      }
      this._options = options;
      this._supportsResize = "resize" in new ArrayBuffer(0);
      if (this._supportsResize) {
        try {
          this._buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE, { maxByteLength: ARRAY_BUFFER_MAX_SIZE });
        } catch {
          this._buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE);
          this._supportsResize = false;
        }
      } else {
        this._buffer = new ArrayBuffer(ARRAY_BUFFER_INITIAL_SIZE);
      }
      this._bytes = new Uint8Array(this._buffer);
    }
    /** @internal */
    _ensureSize(size) {
      let newLength = this._buffer.byteLength;
      while (newLength < size)
        newLength *= 2;
      if (newLength === this._buffer.byteLength)
        return;
      if (newLength > ARRAY_BUFFER_MAX_SIZE) {
        throw new Error(`ArrayBuffer exceeded maximum size of ${ARRAY_BUFFER_MAX_SIZE} bytes. Please consider using another target.`);
      }
      if (this._supportsResize) {
        this._buffer.resize(newLength);
      } else {
        const newBuffer = new ArrayBuffer(newLength);
        const newBytes = new Uint8Array(newBuffer);
        newBytes.set(this._bytes, 0);
        this._buffer = newBuffer;
        this._bytes = newBytes;
      }
    }
    /** @internal */
    _start() {
    }
    /** @internal */
    _write(data, pos) {
      this._ensureSize(pos + data.byteLength);
      this._bytes.set(data, pos);
      this._maxPos = Math.max(this._maxPos, pos + data.byteLength);
      this._dispatchWrite(pos, pos + data.byteLength);
    }
    /** @internal */
    async _flush() {
    }
    /** @internal */
    async _finalize() {
      this.buffer = this._buffer.slice(0, this._maxPos);
      if (this._options.onFinalize) {
        await this._options.onFinalize(this.buffer);
      }
      this._emit("finalized");
    }
    /** @internal */
    async _close() {
    }
    /** @internal */
    _getSlice(start, end) {
      return this._bytes.slice(start, end);
    }
  };
  var DEFAULT_CHUNK_SIZE = 2 ** 24;
  var MAX_CHUNKS_AT_ONCE = 2;
  var StreamTarget = class extends Target {
    /** Creates a new {@link StreamTarget} which writes to the specified `writable`. */
    constructor(writable, options = {}) {
      super();
      this._sections = [];
      this._lastWriteEnd = 0;
      this._lastFlushEnd = 0;
      this._streamWriter = null;
      this._writeError = null;
      this._chunks = [];
      if (!(writable instanceof WritableStream)) {
        throw new TypeError("StreamTarget requires a WritableStream instance.");
      }
      if (options != null && typeof options !== "object") {
        throw new TypeError("StreamTarget options, when provided, must be an object.");
      }
      if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
        throw new TypeError("options.chunked, when provided, must be a boolean.");
      }
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
        throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
      }
      this._writable = writable;
      this._options = options;
      this._chunked = options.chunked ?? false;
      this._chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    }
    /** @internal */
    _start() {
      this._streamWriter = this._writable.getWriter();
    }
    /** @internal */
    _write(data, pos) {
      if (pos > this._lastWriteEnd) {
        const paddingBytesNeeded = pos - this._lastWriteEnd;
        this._write(new Uint8Array(paddingBytesNeeded), this._lastWriteEnd);
      }
      this._sections.push({
        data: data.slice(),
        start: pos
      });
      this._lastWriteEnd = Math.max(this._lastWriteEnd, pos + data.byteLength);
      this._dispatchWrite(pos, pos + data.byteLength);
    }
    /** @internal */
    async _flush() {
      if (this._writeError !== null) {
        throw this._writeError;
      }
      assert(this._streamWriter);
      if (this._sections.length === 0) {
        return;
      }
      const chunks = [];
      const sorted = [...this._sections].sort((a, b) => a.start - b.start);
      chunks.push({
        start: sorted[0].start,
        size: sorted[0].data.byteLength
      });
      for (let i = 1; i < sorted.length; i++) {
        const lastChunk = chunks[chunks.length - 1];
        const section = sorted[i];
        if (section.start <= lastChunk.start + lastChunk.size) {
          lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
        } else {
          chunks.push({
            start: section.start,
            size: section.data.byteLength
          });
        }
      }
      for (const chunk of chunks) {
        chunk.data = new Uint8Array(chunk.size);
        for (const section of this._sections) {
          if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
            chunk.data.set(section.data, section.start - chunk.start);
          }
        }
        if (this._streamWriter.desiredSize !== null && this._streamWriter.desiredSize <= 0) {
          await this._streamWriter.ready;
        }
        if (this._chunked) {
          this._writeDataIntoChunks(chunk.data, chunk.start);
          this._tryToFlushChunks();
        } else {
          if (this._monotonicity === true && chunk.start !== this._lastFlushEnd) {
            throw new Error("Internal error: Monotonicity violation.");
          }
          void this._streamWriter.write({
            type: "write",
            data: chunk.data,
            position: chunk.start
          }).catch((error) => {
            this._writeError ??= error;
          });
          this._lastFlushEnd = chunk.start + chunk.data.byteLength;
        }
      }
      this._sections.length = 0;
    }
    /** @internal */
    _writeDataIntoChunks(data, position) {
      let chunkIndex = this._chunks.findIndex((x) => x.start <= position && position < x.start + this._chunkSize);
      if (chunkIndex === -1)
        chunkIndex = this._createChunk(position);
      const chunk = this._chunks[chunkIndex];
      const relativePosition = position - chunk.start;
      const toWrite = data.subarray(0, Math.min(this._chunkSize - relativePosition, data.byteLength));
      chunk.data.set(toWrite, relativePosition);
      const section = {
        start: relativePosition,
        end: relativePosition + toWrite.byteLength
      };
      this._insertSectionIntoChunk(chunk, section);
      if (chunk.written[0].start === 0 && chunk.written[0].end === this._chunkSize) {
        chunk.shouldFlush = true;
      }
      if (this._chunks.length > MAX_CHUNKS_AT_ONCE) {
        for (let i = 0; i < this._chunks.length - 1; i++) {
          this._chunks[i].shouldFlush = true;
        }
        this._tryToFlushChunks();
      }
      if (toWrite.byteLength < data.byteLength) {
        this._writeDataIntoChunks(data.subarray(toWrite.byteLength), position + toWrite.byteLength);
      }
    }
    /** @internal */
    _insertSectionIntoChunk(chunk, section) {
      let low = 0;
      let high = chunk.written.length - 1;
      let index = -1;
      while (low <= high) {
        const mid = Math.floor(low + (high - low + 1) / 2);
        if (chunk.written[mid].start <= section.start) {
          low = mid + 1;
          index = mid;
        } else {
          high = mid - 1;
        }
      }
      chunk.written.splice(index + 1, 0, section);
      if (index === -1 || chunk.written[index].end < section.start)
        index++;
      while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
        chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
        chunk.written.splice(index + 1, 1);
      }
    }
    /** @internal */
    _createChunk(includesPosition) {
      const start = Math.floor(includesPosition / this._chunkSize) * this._chunkSize;
      const chunk = {
        start,
        data: new Uint8Array(this._chunkSize),
        written: [],
        shouldFlush: false
      };
      this._chunks.push(chunk);
      this._chunks.sort((a, b) => a.start - b.start);
      return this._chunks.indexOf(chunk);
    }
    /** @internal */
    _tryToFlushChunks(force = false) {
      assert(this._streamWriter);
      for (let i = 0; i < this._chunks.length; i++) {
        const chunk = this._chunks[i];
        if (!chunk.shouldFlush && !force)
          continue;
        for (const section of chunk.written) {
          const position = chunk.start + section.start;
          if (this._monotonicity === true && position !== this._lastFlushEnd) {
            throw new Error("Internal error: Monotonicity violation.");
          }
          void this._streamWriter.write({
            type: "write",
            data: chunk.data.subarray(section.start, section.end),
            position
          }).catch((error) => {
            this._writeError ??= error;
          });
          this._lastFlushEnd = chunk.start + section.end;
        }
        this._chunks.splice(i--, 1);
      }
    }
    /** @internal */
    async _finalize() {
      if (this._chunked) {
        this._tryToFlushChunks(true);
      }
      if (this._writeError !== null) {
        throw this._writeError;
      }
      assert(this._streamWriter);
      await this._streamWriter.ready;
      await this._streamWriter.close();
      this._emit("finalized");
    }
    /** @internal */
    async _close() {
      return this._streamWriter?.close();
    }
  };
  var RangedTarget = class extends Target {
    /** @internal */
    constructor(baseTarget, offset) {
      super();
      this._baseTarget = baseTarget;
      this._offset = offset;
    }
    /** @internal */
    _start() {
    }
    /** @internal */
    _write(data, pos) {
      this._baseTarget._write(data, this._offset + pos);
      this._dispatchWrite(pos, pos + data.byteLength);
    }
    /** @internal */
    _flush() {
      return this._baseTarget._flush();
    }
    /** @internal */
    async _finalize() {
      this._emit("finalized");
    }
    /** @internal */
    async _close() {
    }
    /** @internal */
    _setMonotonicity(monotonicity) {
      super._setMonotonicity(monotonicity);
      this._baseTarget._setMonotonicity(monotonicity);
    }
  };
  var PathedTarget = class {
    /** Creates a new {@link PathedTarget} from a root path and a callback. */
    constructor(rootPath, getTarget) {
      this.rootPath = rootPath;
      this.getTarget = getTarget;
      if (typeof rootPath !== "string") {
        throw new TypeError("rootPath must be a string.");
      }
      if (typeof getTarget !== "function") {
        throw new TypeError("getTarget must be a function.");
      }
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-muxer.js
  var GLOBAL_TIMESCALE = 57600;
  var TIMESTAMP_OFFSET = 2082844800;
  var getTrackMetadata = (trackData) => {
    const metadata = {};
    const track = trackData.track;
    if (track.metadata.name !== void 0) {
      metadata.name = track.metadata.name;
    }
    return metadata;
  };
  var intoTimescale = (timeInSeconds, timescale, round = true) => {
    const value = timeInSeconds * timescale;
    return round ? Math.round(value) : value;
  };
  var IsobmffMuxer = class extends Muxer {
    constructor(output, format) {
      super(output);
      this.writer = null;
      this.boxWriter = null;
      this.initWriter = null;
      this.initBoxWriter = null;
      this.auxTarget = new BufferTarget();
      this.auxWriter = new Writer(this.auxTarget, false);
      this.auxBoxWriter = new IsobmffBoxWriter(this.auxWriter);
      this.mdat = null;
      this.ftypSize = null;
      this.trackDatas = [];
      this.allTracksKnown = promiseWithResolvers();
      this.creationTime = Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET;
      this.finalizedChunks = [];
      this.nextFragmentNumber = 1;
      this.maxWrittenTimestamp = -Infinity;
      this.minWrittenTimestamp = Infinity;
      this.maxWrittenEndTimestamp = -Infinity;
      this.segmentHeaderSize = null;
      this.format = format;
      this.isQuickTime = format instanceof MovOutputFormat;
      this.isCmaf = format instanceof CmafOutputFormat;
      this.minimumFragmentDuration = format._options.minimumFragmentDuration ?? (format instanceof CmafOutputFormat ? Infinity : 1);
    }
    async start() {
      const release = await this.mutex.acquire();
      if (!this.isCmaf) {
        this.writer = await this.output._getRootWriter((target) => this.format._options.fastStart !== void 0 ? this.format._options.fastStart === "fragmented" : target instanceof BufferTarget);
        this.boxWriter = new IsobmffBoxWriter(this.writer);
        this.fastStart = this.format._options.fastStart ?? (this.writer.target instanceof BufferTarget ? "in-memory" : false);
        this.isFragmented = this.fastStart === "fragmented";
      } else {
        this.fastStart = "fragmented";
        this.isFragmented = true;
      }
      if (this.isCmaf) {
        if (!this.output._hasInitTarget()) {
          throw new Error(`CMAF outputs require the initTarget field in OutputOptions to be set; the init segment will be written to it.`);
        }
        const initTarget = await this.output._getInitTarget();
        const initWriter = new Writer(initTarget, true);
        initWriter.start();
        this.initWriter = initWriter;
        this.initBoxWriter = new IsobmffBoxWriter(initWriter);
      }
      const holdsAvc = this.output._tracks.some((x) => x.isVideoTrack() && x.source._codec === "avc");
      {
        const boxWriter = this.initBoxWriter ?? this.boxWriter;
        assert(boxWriter);
        if (this.format._options.onFtyp) {
          boxWriter.writer.startTrackingWrites();
        }
        boxWriter.writeBox(ftyp({
          isQuickTime: this.isQuickTime,
          holdsAvc,
          fragmented: this.isFragmented,
          cmaf: this.isCmaf
        }));
        if (this.format._options.onFtyp) {
          const { data, start } = boxWriter.writer.stopTrackingWrites();
          this.format._options.onFtyp(data, start);
        }
        this.ftypSize = boxWriter.writer.getPos();
        if (this.isCmaf) {
          await this.initWriter.flush();
        }
      }
      if (this.fastStart === "in-memory") {
      } else if (this.fastStart === "reserve") {
        for (const track of this.output._tracks) {
          if (track.metadata.maximumPacketCount === void 0) {
            throw new Error("All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.");
          }
        }
      } else if (this.isFragmented) {
      } else {
        assert(this.writer);
        assert(this.boxWriter);
        if (this.format._options.onMdat) {
          this.writer.startTrackingWrites();
        }
        this.mdat = mdat(true);
        this.boxWriter.writeBox(this.mdat);
      }
      await this.writer?.flush();
      release();
    }
    allTracksAreKnown() {
      for (const track of this.output._tracks) {
        if (!track.source._closed && !this.trackDatas.some((x) => x.track === track)) {
          return false;
        }
      }
      return true;
    }
    async getMimeType() {
      await this.allTracksKnown.promise;
      const codecStrings = this.trackDatas.map((trackData) => {
        if (trackData.type === "video") {
          return trackData.info.decoderConfig.codec;
        } else if (trackData.type === "audio") {
          return trackData.info.decoderConfig.codec;
        } else {
          const map = {
            webvtt: "wvtt"
          };
          return map[trackData.track.source._codec];
        }
      });
      return buildIsobmffMimeType({
        isQuickTime: this.isQuickTime,
        hasVideo: this.trackDatas.some((x) => x.type === "video"),
        hasAudio: this.trackDatas.some((x) => x.type === "audio"),
        codecStrings
      });
    }
    getVideoTrackData(track, packet, meta) {
      const existingTrackData = this.trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateVideoChunkMetadata(meta);
      assert(meta);
      assert(meta.decoderConfig);
      const decoderConfig = { ...meta.decoderConfig };
      assert(decoderConfig.codedWidth !== void 0);
      assert(decoderConfig.codedHeight !== void 0);
      let requiresAnnexBTransformation = false;
      if (track.source._codec === "avc" && !decoderConfig.description) {
        const decoderConfigurationRecord = extractAvcDecoderConfigurationRecord(packet.data);
        if (!decoderConfigurationRecord) {
          throw new Error("Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format.");
        }
        decoderConfig.description = serializeAvcDecoderConfigurationRecord(decoderConfigurationRecord);
        requiresAnnexBTransformation = true;
      } else if (track.source._codec === "hevc" && !decoderConfig.description) {
        const decoderConfigurationRecord = extractHevcDecoderConfigurationRecord(packet.data);
        if (!decoderConfigurationRecord) {
          throw new Error("Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format.");
        }
        decoderConfig.description = serializeHevcDecoderConfigurationRecord(decoderConfigurationRecord);
        requiresAnnexBTransformation = true;
      }
      const timescale = computeRationalApproximation(1 / (track.metadata.frameRate ?? GLOBAL_TIMESCALE), 1e6).den;
      const displayAspectWidth = decoderConfig.displayAspectWidth;
      const displayAspectHeight = decoderConfig.displayAspectHeight;
      const pixelAspectRatio = displayAspectWidth === void 0 || displayAspectHeight === void 0 ? { num: 1, den: 1 } : simplifyRational({
        num: displayAspectWidth * decoderConfig.codedHeight,
        den: displayAspectHeight * decoderConfig.codedWidth
      });
      const newTrackData = {
        muxer: this,
        track,
        type: "video",
        info: {
          width: decoderConfig.codedWidth,
          height: decoderConfig.codedHeight,
          pixelAspectRatio,
          decoderConfig,
          requiresAnnexBTransformation
        },
        timescale,
        samples: [],
        sampleQueue: [],
        timestampProcessingQueue: [],
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        startTimestampOffset: null,
        finalizedChunks: [],
        currentChunk: null,
        compactlyCodedChunkTable: [],
        closed: false
      };
      this.trackDatas.push(newTrackData);
      this.trackDatas.sort((a, b) => a.track.id - b.track.id);
      if (this.allTracksAreKnown()) {
        this.allTracksKnown.resolve();
      }
      return newTrackData;
    }
    getAudioTrackData(track, packet, meta) {
      const existingTrackData = this.trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateAudioChunkMetadata(meta);
      assert(meta);
      assert(meta.decoderConfig);
      const decoderConfig = { ...meta.decoderConfig };
      let requiresAdtsStripping = false;
      if (track.source._codec === "aac" && !decoderConfig.description) {
        const adtsFrame = readAdtsFrameHeader(FileSlice.tempFromBytes(packet.data));
        if (!adtsFrame) {
          throw new Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");
        }
        const sampleRate = aacFrequencyTable[adtsFrame.samplingFrequencyIndex];
        const numberOfChannels = aacChannelMap[adtsFrame.channelConfiguration];
        if (sampleRate === void 0 || numberOfChannels === void 0) {
          throw new Error("Invalid ADTS frame header.");
        }
        decoderConfig.description = buildAacAudioSpecificConfig({
          objectType: adtsFrame.objectType,
          sampleRate,
          numberOfChannels
        });
        requiresAdtsStripping = true;
      }
      const newTrackData = {
        muxer: this,
        track,
        type: "audio",
        info: {
          numberOfChannels: meta.decoderConfig.numberOfChannels,
          sampleRate: meta.decoderConfig.sampleRate,
          decoderConfig,
          requiresPcmTransformation: !this.isFragmented && PCM_AUDIO_CODECS.includes(track.source._codec),
          expectedNextPcmPacketTimestamp: null,
          requiresAdtsStripping,
          firstPacket: packet
        },
        timescale: decoderConfig.sampleRate,
        samples: [],
        sampleQueue: [],
        timestampProcessingQueue: [],
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        startTimestampOffset: null,
        finalizedChunks: [],
        currentChunk: null,
        compactlyCodedChunkTable: [],
        closed: false
      };
      this.trackDatas.push(newTrackData);
      this.trackDatas.sort((a, b) => a.track.id - b.track.id);
      if (this.allTracksAreKnown()) {
        this.allTracksKnown.resolve();
      }
      return newTrackData;
    }
    getSubtitleTrackData(track, meta) {
      const existingTrackData = this.trackDatas.find((x) => x.track === track);
      if (existingTrackData) {
        return existingTrackData;
      }
      validateSubtitleMetadata(meta);
      assert(meta);
      assert(meta.config);
      const newTrackData = {
        muxer: this,
        track,
        type: "subtitle",
        info: {
          config: meta.config
        },
        timescale: 1e3,
        // Reasonable
        samples: [],
        sampleQueue: [],
        timestampProcessingQueue: [],
        timeToSampleTable: [],
        compositionTimeOffsetTable: [],
        lastTimescaleUnits: null,
        lastSample: null,
        startTimestampOffset: null,
        finalizedChunks: [],
        currentChunk: null,
        compactlyCodedChunkTable: [],
        closed: false,
        lastCueEndTimestamp: 0,
        cueQueue: [],
        nextSourceId: 0,
        cueToSourceId: /* @__PURE__ */ new WeakMap()
      };
      this.trackDatas.push(newTrackData);
      this.trackDatas.sort((a, b) => a.track.id - b.track.id);
      if (this.allTracksAreKnown()) {
        this.allTracksKnown.resolve();
      }
      return newTrackData;
    }
    async addEncodedVideoPacket(track, packet, meta) {
      const release = await this.mutex.acquire();
      try {
        const trackData = this.getVideoTrackData(track, packet, meta);
        let packetData = packet.data;
        if (trackData.info.requiresAnnexBTransformation) {
          const nalUnits = [...iterateNalUnitsInAnnexB(packetData)].map((loc) => packetData.subarray(loc.offset, loc.offset + loc.length));
          if (nalUnits.length === 0) {
            throw new Error("Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265.");
          }
          packetData = concatNalUnitsInLengthPrefixed(nalUnits, 4);
        }
        this.validateTimestamp(trackData.track, packet.timestamp, packet.type === "key");
        const internalSample = this.createSampleForTrack(trackData, packetData, packet.timestamp, packet.duration, packet.type);
        await this.registerSample(trackData, internalSample);
      } finally {
        release();
      }
    }
    async addEncodedAudioPacket(track, packet, meta) {
      const release = await this.mutex.acquire();
      try {
        const trackData = this.getAudioTrackData(track, packet, meta);
        let packetData = packet.data;
        if (trackData.info.requiresAdtsStripping) {
          const adtsFrame = readAdtsFrameHeader(FileSlice.tempFromBytes(packetData));
          if (!adtsFrame) {
            throw new Error("Expected ADTS frame, didn't get one.");
          }
          const headerLength = adtsFrame.crcCheck === null ? MIN_ADTS_FRAME_HEADER_SIZE : MAX_ADTS_FRAME_HEADER_SIZE;
          packetData = packetData.subarray(headerLength);
        }
        this.validateTimestamp(trackData.track, packet.timestamp, packet.type === "key");
        let timestamp = packet.timestamp;
        let duration = packet.duration;
        if (trackData.info.requiresPcmTransformation) {
          const pcmInfo = parsePcmCodec(trackData.info.decoderConfig.codec);
          const frameSize = pcmInfo.sampleSize * trackData.info.numberOfChannels;
          duration = packetData.byteLength / frameSize / trackData.info.sampleRate;
          if (trackData.info.expectedNextPcmPacketTimestamp !== null) {
            const diff = timestamp - trackData.info.expectedNextPcmPacketTimestamp;
            if (diff < 0.01) {
              timestamp = trackData.info.expectedNextPcmPacketTimestamp;
            } else {
              const paddedDuration = await this.padWithSilence(trackData, trackData.info.expectedNextPcmPacketTimestamp, diff);
              timestamp = trackData.info.expectedNextPcmPacketTimestamp + paddedDuration;
            }
          }
          trackData.info.expectedNextPcmPacketTimestamp = timestamp + duration;
        }
        const internalSample = this.createSampleForTrack(trackData, packetData, timestamp, duration, packet.type);
        await this.registerSample(trackData, internalSample);
      } finally {
        release();
      }
    }
    async padWithSilence(trackData, timestamp, duration) {
      const deltaInTimescale = intoTimescale(duration, trackData.timescale);
      duration = deltaInTimescale / trackData.timescale;
      if (deltaInTimescale > 0) {
        const { sampleSize, silentValue } = parsePcmCodec(trackData.info.decoderConfig.codec);
        const samplesNeeded = deltaInTimescale * trackData.info.numberOfChannels;
        const data = new Uint8Array(sampleSize * samplesNeeded).fill(silentValue);
        const paddingSample = this.createSampleForTrack(trackData, new Uint8Array(data.buffer), timestamp, duration, "key");
        await this.registerSample(trackData, paddingSample);
      }
      return duration;
    }
    async addSubtitleCue(track, cue, meta) {
      const release = await this.mutex.acquire();
      try {
        const trackData = this.getSubtitleTrackData(track, meta);
        this.validateTimestamp(trackData.track, cue.timestamp, true);
        if (track.source._codec === "webvtt") {
          trackData.cueQueue.push(cue);
          await this.processWebVTTCues(trackData, cue.timestamp);
        } else {
        }
      } finally {
        release();
      }
    }
    async processWebVTTCues(trackData, until) {
      while (trackData.cueQueue.length > 0) {
        const timestamps = /* @__PURE__ */ new Set([]);
        for (const cue of trackData.cueQueue) {
          assert(cue.timestamp <= until);
          assert(trackData.lastCueEndTimestamp <= cue.timestamp + cue.duration);
          timestamps.add(Math.max(cue.timestamp, trackData.lastCueEndTimestamp));
          timestamps.add(cue.timestamp + cue.duration);
        }
        const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
        const sampleStart = sortedTimestamps[0];
        const sampleEnd = sortedTimestamps[1] ?? sampleStart;
        if (until < sampleEnd) {
          break;
        }
        if (trackData.lastCueEndTimestamp < sampleStart) {
          this.auxWriter.seek(0);
          const box2 = vtte();
          this.auxBoxWriter.writeBox(box2);
          const body2 = this.auxTarget._getSlice(0, this.auxWriter.getPos());
          const sample2 = this.createSampleForTrack(trackData, body2, trackData.lastCueEndTimestamp, sampleStart - trackData.lastCueEndTimestamp, "key");
          await this.registerSample(trackData, sample2);
          trackData.lastCueEndTimestamp = sampleStart;
        }
        this.auxWriter.seek(0);
        for (let i = 0; i < trackData.cueQueue.length; i++) {
          const cue = trackData.cueQueue[i];
          if (cue.timestamp >= sampleEnd) {
            break;
          }
          inlineTimestampRegex.lastIndex = 0;
          const containsTimestamp = inlineTimestampRegex.test(cue.text);
          const endTimestamp = cue.timestamp + cue.duration;
          let sourceId = trackData.cueToSourceId.get(cue);
          if (sourceId === void 0 && sampleEnd < endTimestamp) {
            sourceId = trackData.nextSourceId++;
            trackData.cueToSourceId.set(cue, sourceId);
          }
          if (cue.notes) {
            const box3 = vtta(cue.notes);
            this.auxBoxWriter.writeBox(box3);
          }
          const box2 = vttc(cue.text, containsTimestamp ? sampleStart : null, cue.identifier ?? null, cue.settings ?? null, sourceId ?? null);
          this.auxBoxWriter.writeBox(box2);
          if (endTimestamp === sampleEnd) {
            trackData.cueQueue.splice(i--, 1);
          }
        }
        const body = this.auxTarget._getSlice(0, this.auxWriter.getPos());
        const sample = this.createSampleForTrack(trackData, body, sampleStart, sampleEnd - sampleStart, "key");
        await this.registerSample(trackData, sample);
        trackData.lastCueEndTimestamp = sampleEnd;
      }
    }
    createSampleForTrack(trackData, data, timestamp, duration, type) {
      const sample = {
        timestamp,
        decodeTimestamp: timestamp,
        // This may be refined later
        duration,
        data,
        size: data.byteLength,
        type,
        timescaleUnitsToNextSample: intoTimescale(duration, trackData.timescale)
        // Will be refined
      };
      return sample;
    }
    processTimestamps(trackData, nextSample) {
      if (trackData.timestampProcessingQueue.length === 0) {
        return;
      }
      if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
        if (!this.isFragmented) {
          trackData.startTimestampOffset ??= trackData.timestampProcessingQueue[0].timestamp;
        }
        let totalDuration = 0;
        for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
          const sample = trackData.timestampProcessingQueue[i];
          const duration = intoTimescale(sample.duration, trackData.timescale);
          totalDuration += duration;
        }
        if (trackData.timeToSampleTable.length === 0) {
          trackData.timeToSampleTable.push({
            sampleCount: totalDuration,
            sampleDelta: 1
          });
        } else {
          const lastEntry = last(trackData.timeToSampleTable);
          lastEntry.sampleCount += totalDuration;
        }
        trackData.timestampProcessingQueue.length = 0;
        return;
      }
      const sortedTimestamps = trackData.timestampProcessingQueue.map((x) => x.timestamp).sort((a, b) => a - b);
      if (!this.isFragmented) {
        trackData.startTimestampOffset ??= sortedTimestamps[0];
      }
      for (let i = 0; i < trackData.timestampProcessingQueue.length; i++) {
        const sample = trackData.timestampProcessingQueue[i];
        sample.decodeTimestamp = sortedTimestamps[i];
        const sampleCompositionTimeOffset = intoTimescale(sample.timestamp - sample.decodeTimestamp, trackData.timescale);
        const durationInTimescale = intoTimescale(sample.duration, trackData.timescale);
        if (trackData.lastTimescaleUnits !== null) {
          assert(trackData.lastSample);
          const timescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
          const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
          assert(delta >= 0);
          trackData.lastTimescaleUnits += delta;
          trackData.lastSample.timescaleUnitsToNextSample = delta;
          if (!this.isFragmented) {
            let lastTableEntry = last(trackData.timeToSampleTable);
            assert(lastTableEntry);
            if (lastTableEntry.sampleCount === 1) {
              lastTableEntry.sampleDelta = delta;
              const entryBefore = trackData.timeToSampleTable[trackData.timeToSampleTable.length - 2];
              if (entryBefore && entryBefore.sampleDelta === delta) {
                entryBefore.sampleCount++;
                trackData.timeToSampleTable.pop();
                lastTableEntry = entryBefore;
              }
            } else if (lastTableEntry.sampleDelta !== delta) {
              lastTableEntry.sampleCount--;
              trackData.timeToSampleTable.push(lastTableEntry = {
                sampleCount: 1,
                sampleDelta: delta
              });
            }
            if (lastTableEntry.sampleDelta === durationInTimescale) {
              lastTableEntry.sampleCount++;
            } else {
              trackData.timeToSampleTable.push({
                sampleCount: 1,
                sampleDelta: durationInTimescale
              });
            }
            const lastCompositionTimeOffsetTableEntry = last(trackData.compositionTimeOffsetTable);
            assert(lastCompositionTimeOffsetTableEntry);
            if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
              lastCompositionTimeOffsetTableEntry.sampleCount++;
            } else {
              trackData.compositionTimeOffsetTable.push({
                sampleCount: 1,
                sampleCompositionTimeOffset
              });
            }
          }
        } else {
          trackData.lastTimescaleUnits = intoTimescale(sample.decodeTimestamp, trackData.timescale, false);
          if (!this.isFragmented) {
            trackData.timeToSampleTable.push({
              sampleCount: 1,
              sampleDelta: durationInTimescale
            });
            trackData.compositionTimeOffsetTable.push({
              sampleCount: 1,
              sampleCompositionTimeOffset
            });
          }
        }
        trackData.lastSample = sample;
      }
      trackData.timestampProcessingQueue.length = 0;
      assert(trackData.lastSample);
      assert(trackData.lastTimescaleUnits !== null);
      if (nextSample !== void 0 && trackData.lastSample.timescaleUnitsToNextSample === 0) {
        assert(nextSample.type === "key");
        const timescaleUnits = intoTimescale(nextSample.timestamp, trackData.timescale, false);
        const delta = Math.round(timescaleUnits - trackData.lastTimescaleUnits);
        trackData.lastSample.timescaleUnitsToNextSample = delta;
      }
    }
    async registerSample(trackData, sample) {
      if (sample.type === "key") {
        this.processTimestamps(trackData, sample);
      }
      trackData.timestampProcessingQueue.push(sample);
      if (this.isFragmented) {
        trackData.sampleQueue.push(sample);
        await this.interleaveSamples();
      } else if (this.fastStart === "reserve") {
        await this.registerSampleFastStartReserve(trackData, sample);
      } else {
        await this.addSampleToTrack(trackData, sample);
      }
    }
    async addSampleToTrack(trackData, sample) {
      if (!this.isFragmented) {
        trackData.samples.push(sample);
        if (this.fastStart === "reserve") {
          const maximumPacketCount = trackData.track.metadata.maximumPacketCount;
          assert(maximumPacketCount !== void 0);
          if (trackData.samples.length > maximumPacketCount) {
            throw new Error(`Track #${trackData.track.id} has already reached the maximum packet count (${maximumPacketCount}). Either add less packets or increase the maximum packet count.`);
          }
        }
      }
      let beginNewChunk = false;
      if (!trackData.currentChunk) {
        beginNewChunk = true;
      } else {
        trackData.currentChunk.startTimestamp = Math.min(trackData.currentChunk.startTimestamp, sample.timestamp);
        const currentChunkDuration = sample.timestamp - trackData.currentChunk.startTimestamp;
        if (this.isFragmented) {
          const keyFrameQueuedEverywhere = this.trackDatas.every((otherTrackData) => {
            if (trackData === otherTrackData) {
              return sample.type === "key";
            }
            const firstQueuedSample = otherTrackData.sampleQueue[0];
            if (firstQueuedSample) {
              return firstQueuedSample.type === "key";
            }
            return otherTrackData.closed;
          });
          if (currentChunkDuration >= this.minimumFragmentDuration && keyFrameQueuedEverywhere && sample.timestamp > this.maxWrittenTimestamp) {
            beginNewChunk = true;
            await this.finalizeFragment();
          }
        } else {
          beginNewChunk = currentChunkDuration >= 0.5;
        }
      }
      if (beginNewChunk) {
        if (trackData.currentChunk) {
          await this.finalizeCurrentChunk(trackData);
        }
        trackData.currentChunk = {
          startTimestamp: sample.timestamp,
          samples: [],
          offset: null,
          moofOffset: null
        };
      }
      assert(trackData.currentChunk);
      trackData.currentChunk.samples.push(sample);
      if (this.isFragmented) {
        this.maxWrittenTimestamp = Math.max(this.maxWrittenTimestamp, sample.timestamp);
        this.maxWrittenEndTimestamp = Math.max(this.maxWrittenEndTimestamp, sample.timestamp + sample.duration);
        this.minWrittenTimestamp = Math.min(this.minWrittenTimestamp, sample.timestamp);
      }
    }
    async finalizeCurrentChunk(trackData) {
      assert(!this.isFragmented);
      assert(this.writer);
      if (!trackData.currentChunk)
        return;
      trackData.finalizedChunks.push(trackData.currentChunk);
      this.finalizedChunks.push(trackData.currentChunk);
      let sampleCount = trackData.currentChunk.samples.length;
      if (trackData.type === "audio" && trackData.info.requiresPcmTransformation) {
        sampleCount = trackData.currentChunk.samples.reduce((acc, sample) => acc + intoTimescale(sample.duration, trackData.timescale), 0);
      }
      if (trackData.compactlyCodedChunkTable.length === 0 || last(trackData.compactlyCodedChunkTable).samplesPerChunk !== sampleCount) {
        trackData.compactlyCodedChunkTable.push({
          firstChunk: trackData.finalizedChunks.length,
          // 1-indexed
          samplesPerChunk: sampleCount
        });
      }
      if (this.fastStart === "in-memory") {
        trackData.currentChunk.offset = 0;
        return;
      }
      trackData.currentChunk.offset = this.writer.getPos();
      for (const sample of trackData.currentChunk.samples) {
        assert(sample.data);
        this.writer.write(sample.data);
        sample.data = null;
      }
      await this.writer.flush();
    }
    async interleaveSamples(isFinalCall = false) {
      assert(this.isFragmented);
      if (!isFinalCall && !this.allTracksAreKnown()) {
        return;
      }
      outer: while (true) {
        let trackWithMinTimestamp = null;
        let minTimestamp = Infinity;
        for (const trackData of this.trackDatas) {
          if (!isFinalCall && trackData.sampleQueue.length === 0 && !trackData.closed) {
            break outer;
          }
          if (trackData.sampleQueue.length > 0 && trackData.sampleQueue[0].timestamp < minTimestamp) {
            trackWithMinTimestamp = trackData;
            minTimestamp = trackData.sampleQueue[0].timestamp;
          }
        }
        if (!trackWithMinTimestamp) {
          break;
        }
        const sample = trackWithMinTimestamp.sampleQueue.shift();
        await this.addSampleToTrack(trackWithMinTimestamp, sample);
      }
    }
    async finalizeFragment(flushWriter = !this.isCmaf) {
      assert(this.isFragmented);
      const fragmentNumber = this.nextFragmentNumber++;
      if (fragmentNumber === 1) {
        const boxWriter = this.initBoxWriter ?? this.boxWriter;
        assert(boxWriter);
        if (this.format._options.onMoov) {
          boxWriter.writer.startTrackingWrites();
        }
        this.ensureOneEnabledTrack();
        const movieBox = moov(this);
        boxWriter.writeBox(movieBox);
        if (this.format._options.onMoov) {
          const { data, start } = boxWriter.writer.stopTrackingWrites();
          this.format._options.onMoov(data, start);
        }
        if (this.isCmaf) {
          assert(this.initWriter);
          await this.initWriter.flush();
          await this.initWriter.finalize();
          this.writer = await this.output._getRootWriter(true);
          this.boxWriter = new IsobmffBoxWriter(this.writer);
          const stypSize = this.boxWriter.measureBox(styp());
          const sidxSize = this.boxWriter.measureBox(sidx(this, 0));
          this.segmentHeaderSize = stypSize + sidxSize;
          this.writer.seek(this.segmentHeaderSize);
        }
      }
      assert(this.writer);
      assert(this.boxWriter);
      const tracksInFragment = this.trackDatas.filter((x) => x.currentChunk);
      const moofBox = moof(fragmentNumber, tracksInFragment);
      const moofOffset = this.writer.getPos();
      const mdatStartPos = moofOffset + this.boxWriter.measureBox(moofBox);
      let currentPos = mdatStartPos + MIN_BOX_HEADER_SIZE;
      let fragmentStartTimestamp = Infinity;
      for (const trackData of tracksInFragment) {
        trackData.currentChunk.offset = currentPos;
        trackData.currentChunk.moofOffset = moofOffset;
        for (const sample of trackData.currentChunk.samples) {
          currentPos += sample.size;
        }
        fragmentStartTimestamp = Math.min(fragmentStartTimestamp, trackData.currentChunk.startTimestamp);
      }
      const mdatSize = currentPos - mdatStartPos;
      const needsLargeMdatSize = mdatSize >= 2 ** 32;
      if (needsLargeMdatSize) {
        for (const trackData of tracksInFragment) {
          trackData.currentChunk.offset += MAX_BOX_HEADER_SIZE - MIN_BOX_HEADER_SIZE;
        }
      }
      if (this.format._options.onMoof) {
        this.writer.startTrackingWrites();
      }
      const newMoofBox = moof(fragmentNumber, tracksInFragment);
      this.boxWriter.writeBox(newMoofBox);
      if (this.format._options.onMoof) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMoof(data, start, fragmentStartTimestamp);
      }
      assert(this.writer.getPos() === mdatStartPos);
      if (this.format._options.onMdat) {
        this.writer.startTrackingWrites();
      }
      const mdatBox = mdat(needsLargeMdatSize);
      mdatBox.size = mdatSize;
      this.boxWriter.writeBox(mdatBox);
      this.writer.seek(mdatStartPos + (needsLargeMdatSize ? MAX_BOX_HEADER_SIZE : MIN_BOX_HEADER_SIZE));
      for (const trackData of tracksInFragment) {
        for (const sample of trackData.currentChunk.samples) {
          this.writer.write(sample.data);
          sample.data = null;
        }
      }
      if (this.format._options.onMdat) {
        const { data, start } = this.writer.stopTrackingWrites();
        this.format._options.onMdat(data, start);
      }
      for (const trackData of tracksInFragment) {
        trackData.finalizedChunks.push(trackData.currentChunk);
        this.finalizedChunks.push(trackData.currentChunk);
        trackData.currentChunk = null;
      }
      if (flushWriter) {
        await this.writer.flush();
      }
    }
    async registerSampleFastStartReserve(trackData, sample) {
      assert(this.writer);
      assert(this.boxWriter);
      if (this.allTracksAreKnown()) {
        if (!this.mdat) {
          this.ensureOneEnabledTrack();
          const moovBox = moov(this);
          const moovSize = this.boxWriter.measureBox(moovBox);
          const reservedSize = moovSize + this.computeSampleTableSizeUpperBound() + 4096;
          assert(this.ftypSize !== null);
          this.writer.seek(this.ftypSize + reservedSize);
          if (this.format._options.onMdat) {
            this.writer.startTrackingWrites();
          }
          this.mdat = mdat(true);
          this.boxWriter.writeBox(this.mdat);
          for (const trackData2 of this.trackDatas) {
            for (const sample2 of trackData2.sampleQueue) {
              await this.addSampleToTrack(trackData2, sample2);
            }
            trackData2.sampleQueue.length = 0;
          }
        }
        await this.addSampleToTrack(trackData, sample);
      } else {
        trackData.sampleQueue.push(sample);
      }
    }
    computeSampleTableSizeUpperBound() {
      assert(this.fastStart === "reserve");
      let upperBound = 0;
      for (const trackData of this.trackDatas) {
        const n = trackData.track.metadata.maximumPacketCount;
        assert(n !== void 0);
        upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
        upperBound += 4 * n;
        upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
        upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
        upperBound += 4 * n;
        upperBound += 8 * n;
      }
      return upperBound;
    }
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async onTrackClose(track) {
      const release = await this.mutex.acquire();
      const trackData = this.trackDatas.find((x) => x.track === track);
      if (trackData) {
        trackData.closed = true;
        if (trackData.type === "subtitle" && track.source._codec === "webvtt") {
          await this.processWebVTTCues(trackData, Infinity);
        }
        this.processTimestamps(trackData);
      }
      if (this.allTracksAreKnown()) {
        this.allTracksKnown.resolve();
      }
      if (this.isFragmented) {
        await this.interleaveSamples();
      }
      release();
    }
    ensureOneEnabledTrack() {
      for (const type of ["video", "audio", "subtitle"]) {
        const tracks = this.trackDatas.filter((t) => t.type === type);
        if (tracks.length === 0) {
          continue;
        }
        const hasEnabled = tracks.some((t) => t.track.metadata.disposition?.default !== false);
        if (!hasEnabled) {
          const firstTrack = tracks[0];
          firstTrack.track.metadata.disposition = {
            ...firstTrack.track.metadata.disposition,
            default: true
          };
        }
      }
    }
    /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
    async finalize() {
      const release = await this.mutex.acquire();
      this.allTracksKnown.resolve();
      this.ensureOneEnabledTrack();
      for (const trackData of this.trackDatas) {
        trackData.closed = true;
        if (trackData.type === "subtitle" && trackData.track.source._codec === "webvtt") {
          await this.processWebVTTCues(trackData, Infinity);
        }
        this.processTimestamps(trackData);
      }
      if (this.isFragmented) {
        await this.interleaveSamples(true);
        await this.finalizeFragment(false);
      } else {
        for (const trackData of this.trackDatas) {
          await this.finalizeCurrentChunk(trackData);
          assert(trackData.startTimestampOffset !== null);
          for (let i = 0; i < trackData.samples.length; i++) {
            const sample = trackData.samples[i];
            sample.timestamp -= trackData.startTimestampOffset;
            sample.decodeTimestamp -= trackData.startTimestampOffset;
          }
        }
      }
      assert(this.writer);
      assert(this.boxWriter);
      if (this.fastStart === "in-memory") {
        this.mdat = mdat(false);
        let mdatSize;
        for (let i = 0; i < 2; i++) {
          const movieBox2 = moov(this);
          const movieBoxSize = this.boxWriter.measureBox(movieBox2);
          mdatSize = this.boxWriter.measureBox(this.mdat);
          let currentChunkPos = this.writer.getPos() + movieBoxSize + mdatSize;
          for (const chunk of this.finalizedChunks) {
            chunk.offset = currentChunkPos;
            for (const { data } of chunk.samples) {
              assert(data);
              currentChunkPos += data.byteLength;
              mdatSize += data.byteLength;
            }
          }
          if (currentChunkPos < 2 ** 32)
            break;
          if (mdatSize >= 2 ** 32)
            this.mdat.largeSize = true;
        }
        if (this.format._options.onMoov) {
          this.writer.startTrackingWrites();
        }
        const movieBox = moov(this);
        this.boxWriter.writeBox(movieBox);
        if (this.format._options.onMoov) {
          const { data, start } = this.writer.stopTrackingWrites();
          this.format._options.onMoov(data, start);
        }
        if (this.format._options.onMdat) {
          this.writer.startTrackingWrites();
        }
        this.mdat.size = mdatSize;
        this.boxWriter.writeBox(this.mdat);
        for (const chunk of this.finalizedChunks) {
          for (const sample of chunk.samples) {
            assert(sample.data);
            this.writer.write(sample.data);
            sample.data = null;
          }
        }
        if (this.format._options.onMdat) {
          const { data, start } = this.writer.stopTrackingWrites();
          this.format._options.onMdat(data, start);
        }
      } else if (this.isFragmented) {
        if (this.isCmaf) {
          const contentSize = this.segmentHeaderSize !== null ? this.writer.getPos() - this.segmentHeaderSize : 0;
          this.writer.seek(0);
          this.boxWriter.writeBox(styp());
          this.boxWriter.writeBox(sidx(this, contentSize));
        } else {
          const startPos = this.writer.getPos();
          const mfraBox = mfra(this.trackDatas);
          this.boxWriter.writeBox(mfraBox);
          const mfraBoxSize = this.writer.getPos() - startPos;
          this.writer.seek(this.writer.getPos() - 4);
          this.boxWriter.writeU32(mfraBoxSize);
        }
      } else {
        assert(this.mdat);
        const mdatPos = this.boxWriter.offsets.get(this.mdat);
        assert(mdatPos !== void 0);
        const mdatSize = this.writer.getPos() - mdatPos;
        this.mdat.size = mdatSize;
        this.mdat.largeSize = mdatSize >= 2 ** 32;
        this.boxWriter.patchBox(this.mdat);
        if (this.format._options.onMdat) {
          const { data, start } = this.writer.stopTrackingWrites();
          this.format._options.onMdat(data, start);
        }
        const movieBox = moov(this);
        if (this.fastStart === "reserve") {
          assert(this.ftypSize !== null);
          this.writer.seek(this.ftypSize);
          if (this.format._options.onMoov) {
            this.writer.startTrackingWrites();
          }
          this.boxWriter.writeBox(movieBox);
          const remainingSpace = this.boxWriter.offsets.get(this.mdat) - this.writer.getPos();
          this.boxWriter.writeBox(free(remainingSpace));
        } else {
          if (this.format._options.onMoov) {
            this.writer.startTrackingWrites();
          }
          this.boxWriter.writeBox(movieBox);
        }
        if (this.format._options.onMoov) {
          const { data, start } = this.writer.stopTrackingWrites();
          this.format._options.onMoov(data, start);
        }
      }
      release();
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/media-source.js
  var MediaSource = class {
    constructor() {
      this._connectedTrack = null;
      this._closingPromise = null;
      this._closed = false;
    }
    /** @internal */
    _ensureValidAdd() {
      if (!this._connectedTrack) {
        throw new Error("Source is not connected to an output track.");
      }
      if (this._connectedTrack.output.state === "canceled") {
        throw new Error("Output has been canceled.");
      }
      if (this._connectedTrack.output.state === "finalizing" || this._connectedTrack.output.state === "finalized") {
        throw new Error("Output has been finalized.");
      }
      if (this._connectedTrack.output.state === "pending") {
        throw new Error("Output has not started.");
      }
      if (this._closed) {
        throw new Error("Source is closed.");
      }
    }
    /** @internal */
    async _start() {
    }
    /** @internal */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async _flushAndClose(forceClose) {
    }
    /**
     * Closes this source. This prevents future samples from being added and signals to the output file that no further
     * samples will come in for this track. Calling `.close()` is optional but recommended after adding the
     * last sample - for improved performance and reduced memory usage.
     */
    close() {
      if (this._closingPromise) {
        return;
      }
      const connectedTrack = this._connectedTrack;
      if (!connectedTrack) {
        throw new Error("Cannot call close without connecting the source to an output track.");
      }
      if (connectedTrack.output.state === "pending") {
        throw new Error("Cannot call close before output has been started.");
      }
      this._closingPromise = (async () => {
        await this._flushAndClose(false);
        this._closed = true;
        if (connectedTrack.output.state === "finalizing" || connectedTrack.output.state === "finalized") {
          return;
        }
        connectedTrack.output._muxer.onTrackClose(connectedTrack);
      })();
    }
    /** @internal */
    async _flushOrWaitForOngoingClose(forceClose) {
      return this._closingPromise ??= (async () => {
        await this._flushAndClose(forceClose);
        this._closed = true;
      })();
    }
  };
  var VideoSource = class extends MediaSource {
    /** Internal constructor. */
    constructor(codec) {
      super();
      this._connectedTrack = null;
      if (!VIDEO_CODECS.includes(codec)) {
        throw new TypeError(`Invalid video codec '${codec}'. Must be one of: ${VIDEO_CODECS.join(", ")}.`);
      }
      this._codec = codec;
    }
  };
  var maybeEnsureIsKeyPacket = (track, packet) => {
    if (track.metadata.hasOnlyKeyPackets && packet.type !== "key") {
      throw new Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.");
    }
  };
  var EncodedVideoPacketSource = class extends VideoSource {
    /** Creates a new {@link EncodedVideoPacketSource} whose packets are encoded using `codec`. */
    constructor(codec) {
      super(codec);
    }
    /**
     * Adds an encoded packet to the output video track. Packets must be added in *decode order*, while a packet's
     * timestamp must be its *presentation timestamp*. B-frames are handled automatically.
     *
     * @param meta - Additional metadata from the encoder. You should pass this for the first call, including a valid
     * decoder config.
     *
     * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
     * to respect writer and encoder backpressure.
     */
    add(packet, meta) {
      if (!(packet instanceof EncodedPacket)) {
        throw new TypeError("packet must be an EncodedPacket.");
      }
      if (packet.isMetadataOnly) {
        throw new TypeError("Metadata-only packets cannot be added.");
      }
      if (meta !== void 0 && (!meta || typeof meta !== "object")) {
        throw new TypeError("meta, when provided, must be an object.");
      }
      this._ensureValidAdd();
      maybeEnsureIsKeyPacket(this._connectedTrack, packet);
      return this._connectedTrack.output._muxer.addEncodedVideoPacket(this._connectedTrack, packet, meta);
    }
  };
  var AudioSource = class extends MediaSource {
    /** Internal constructor. */
    constructor(codec) {
      super();
      this._connectedTrack = null;
      if (!AUDIO_CODECS.includes(codec)) {
        throw new TypeError(`Invalid audio codec '${codec}'. Must be one of: ${AUDIO_CODECS.join(", ")}.`);
      }
      this._codec = codec;
    }
  };
  var EncodedAudioPacketSource = class extends AudioSource {
    /** Creates a new {@link EncodedAudioPacketSource} whose packets are encoded using `codec`. */
    constructor(codec) {
      super(codec);
    }
    /**
     * Adds an encoded packet to the output audio track. Packets must be added in *decode order*.
     *
     * @param meta - Additional metadata from the encoder. You should pass this for the first call, including a valid
     * decoder config.
     *
     * @returns A Promise that resolves once the output is ready to receive more samples. You should await this Promise
     * to respect writer and encoder backpressure.
     */
    add(packet, meta) {
      if (!(packet instanceof EncodedPacket)) {
        throw new TypeError("packet must be an EncodedPacket.");
      }
      if (packet.isMetadataOnly) {
        throw new TypeError("Metadata-only packets cannot be added.");
      }
      if (meta !== void 0 && (!meta || typeof meta !== "object")) {
        throw new TypeError("meta, when provided, must be an object.");
      }
      this._ensureValidAdd();
      return this._connectedTrack.output._muxer.addEncodedAudioPacket(this._connectedTrack, packet, meta);
    }
  };
  var SubtitleSource = class extends MediaSource {
    /** Internal constructor. */
    constructor(codec) {
      super();
      this._connectedTrack = null;
      if (!SUBTITLE_CODECS.includes(codec)) {
        throw new TypeError(`Invalid subtitle codec '${codec}'. Must be one of: ${SUBTITLE_CODECS.join(", ")}.`);
      }
      this._codec = codec;
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/output-format.js
  var OutputFormat = class {
    /** Returns a list of video codecs that this output format can contain. */
    getSupportedVideoCodecs() {
      return this.getSupportedCodecs().filter((codec) => VIDEO_CODECS.includes(codec));
    }
    /** Returns a list of audio codecs that this output format can contain. */
    getSupportedAudioCodecs() {
      return this.getSupportedCodecs().filter((codec) => AUDIO_CODECS.includes(codec));
    }
    /** Returns a list of subtitle codecs that this output format can contain. */
    getSupportedSubtitleCodecs() {
      return this.getSupportedCodecs().filter((codec) => SUBTITLE_CODECS.includes(codec));
    }
    /** @internal */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _codecUnsupportedHint(codec) {
      return "";
    }
  };
  var IsobmffOutputFormat = class extends OutputFormat {
    /** Internal constructor. */
    constructor(options = {}) {
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (options.fastStart !== void 0 && ![false, "in-memory", "reserve", "fragmented"].includes(options.fastStart)) {
        throw new TypeError("options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'.");
      }
      if (options.minimumFragmentDuration !== void 0 && (!Number.isFinite(options.minimumFragmentDuration) || options.minimumFragmentDuration < 0)) {
        throw new TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");
      }
      if (options.onFtyp !== void 0 && typeof options.onFtyp !== "function") {
        throw new TypeError("options.onFtyp, when provided, must be a function.");
      }
      if (options.onMoov !== void 0 && typeof options.onMoov !== "function") {
        throw new TypeError("options.onMoov, when provided, must be a function.");
      }
      if (options.onMdat !== void 0 && typeof options.onMdat !== "function") {
        throw new TypeError("options.onMdat, when provided, must be a function.");
      }
      if (options.onMoof !== void 0 && typeof options.onMoof !== "function") {
        throw new TypeError("options.onMoof, when provided, must be a function.");
      }
      if (options.metadataFormat !== void 0 && !["mdir", "mdta", "udta", "auto"].includes(options.metadataFormat)) {
        throw new TypeError("options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'.");
      }
      super();
      this._options = options;
    }
    getSupportedTrackCounts() {
      const max = 2 ** 32 - 1;
      return {
        video: { min: 0, max },
        audio: { min: 0, max },
        subtitle: { min: 0, max },
        total: { min: 1, max }
      };
    }
    get supportsVideoRotationMetadata() {
      return true;
    }
    get supportsTimestampedMediaData() {
      return true;
    }
    /** @internal */
    _createMuxer(output) {
      return new IsobmffMuxer(output, this);
    }
  };
  var Mp4OutputFormat = class extends IsobmffOutputFormat {
    /** Creates a new {@link Mp4OutputFormat} configured with the specified `options`. */
    constructor(options) {
      super(options);
    }
    /** @internal */
    get _name() {
      return "MP4";
    }
    get fileExtension() {
      return ".mp4";
    }
    get mimeType() {
      return "video/mp4";
    }
    getSupportedCodecs() {
      return [
        ...VIDEO_CODECS,
        ...NON_PCM_AUDIO_CODECS,
        // These are supported via ISO/IEC 23003-5:
        "pcm-s16",
        "pcm-s16be",
        "pcm-s24",
        "pcm-s24be",
        "pcm-s32",
        "pcm-s32be",
        "pcm-f32",
        "pcm-f32be",
        "pcm-f64",
        "pcm-f64be",
        ...SUBTITLE_CODECS
      ];
    }
    /** @internal */
    _codecUnsupportedHint(codec) {
      if (new MovOutputFormat().getSupportedCodecs().includes(codec)) {
        return " Switching to MOV will grant support for this codec.";
      }
      return "";
    }
  };
  var CmafOutputFormat = class extends IsobmffOutputFormat {
    /** Creates a new {@link CmafOutputFormat} configured with the specified `options`. */
    constructor(options) {
      super(options);
    }
    /** @internal */
    get _name() {
      return "CMAF";
    }
    get fileExtension() {
      return ".m4s";
    }
    get mimeType() {
      return "video/mp4";
    }
    getSupportedCodecs() {
      return [
        ...VIDEO_CODECS,
        ...NON_PCM_AUDIO_CODECS,
        // These are supported via ISO/IEC 23003-5:
        "pcm-s16",
        "pcm-s16be",
        "pcm-s24",
        "pcm-s24be",
        "pcm-s32",
        "pcm-s32be",
        "pcm-f32",
        "pcm-f32be",
        "pcm-f64",
        "pcm-f64be",
        ...SUBTITLE_CODECS
      ];
    }
  };
  var MovOutputFormat = class extends IsobmffOutputFormat {
    /** Creates a new {@link MovOutputFormat} configured with the specified `options`. */
    constructor(options) {
      super(options);
    }
    /** @internal */
    get _name() {
      return "MOV";
    }
    get fileExtension() {
      return ".mov";
    }
    get mimeType() {
      return "video/quicktime";
    }
    getSupportedCodecs() {
      return [
        ...VIDEO_CODECS,
        ...AUDIO_CODECS
      ];
    }
    /** @internal */
    _codecUnsupportedHint(codec) {
      if (new Mp4OutputFormat().getSupportedCodecs().includes(codec)) {
        return " Switching to MP4 will grant support for this codec.";
      }
      return "";
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/output.js
  var ALL_TRACK_TYPES = ["video", "audio", "subtitle"];
  var OutputTrack = class _OutputTrack {
    /** @internal */
    constructor(id, output, type, source, metadata) {
      this.id = id;
      this.output = output;
      this.type = type;
      this.source = source;
      this.metadata = metadata;
    }
    /** Returns true if and only if this track is a video track. */
    isVideoTrack() {
      return this.type === "video";
    }
    /** Returns true if and only if this track is an audio track. */
    isAudioTrack() {
      return this.type === "audio";
    }
    /** Returns true if and only if this track is a subtitle track. */
    isSubtitleTrack() {
      return this.type === "subtitle";
    }
    /**
     * Returns true if and only if this track can be paired with the given other track. Pairability can be set using
     * the {@link BaseTrackMetadata.group} option.
     */
    canBePairedWith(other) {
      if (!(other instanceof _OutputTrack)) {
        throw new TypeError("other must be an OutputTrack.");
      }
      if (this === other) {
        return false;
      }
      const thisGroups = toArray(this.metadata.group);
      const otherGroups = toArray(other.metadata.group);
      for (const aGroup of thisGroups) {
        const pairableInSameGroup = this.type !== other.type && otherGroups.some((bGroup) => aGroup === bGroup);
        if (pairableInSameGroup) {
          return true;
        }
        const pairableAcrossGroups = otherGroups.some((bGroup) => aGroup._pairedGroups.has(bGroup));
        if (pairableAcrossGroups) {
          return true;
        }
      }
      return false;
    }
  };
  var OutputVideoTrack = class extends OutputTrack {
    /** @internal */
    constructor(id, output, source, metadata) {
      super(id, output, "video", source, metadata);
    }
  };
  var OutputAudioTrack = class extends OutputTrack {
    /** @internal */
    constructor(id, output, source, metadata) {
      super(id, output, "audio", source, metadata);
    }
  };
  var OutputSubtitleTrack = class extends OutputTrack {
    /** @internal */
    constructor(id, output, source, metadata) {
      super(id, output, "subtitle", source, metadata);
    }
  };
  var OutputTrackGroup = class _OutputTrackGroup {
    /** Creates a new {@link OutputTrackGroup}. */
    constructor() {
      this._pairedGroups = /* @__PURE__ */ new Set();
    }
    /**
     * Marks this group as being pairable with another group, symmetrically. Output tracks where each track is assigned
     * to one half of a group pairing are then considered pairable.
     *
     * You cannot pair a group with itself.
     */
    pairWith(other) {
      if (!(other instanceof _OutputTrackGroup)) {
        throw new TypeError("other must be an OutputTrackGroup.");
      }
      if (this === other) {
        throw new TypeError("Cannot pair a group with itself.");
      }
      this._pairedGroups.add(other);
      other._pairedGroups.add(this);
    }
  };
  var validateBaseTrackMetadata = (metadata) => {
    if (!metadata || typeof metadata !== "object") {
      throw new TypeError("metadata must be an object.");
    }
    if (metadata.languageCode !== void 0 && !isIso639Dash2LanguageCode(metadata.languageCode)) {
      throw new TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
    }
    if (metadata.name !== void 0 && typeof metadata.name !== "string") {
      throw new TypeError("metadata.name, when provided, must be a string.");
    }
    if (metadata.disposition !== void 0) {
      validateTrackDisposition(metadata.disposition);
    }
    if (metadata.maximumPacketCount !== void 0 && (!Number.isInteger(metadata.maximumPacketCount) || metadata.maximumPacketCount < 0)) {
      throw new TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
    }
    if (metadata.group !== void 0 && !(metadata.group instanceof OutputTrackGroup) && (!Array.isArray(metadata.group) || metadata.group.some((group) => !(group instanceof OutputTrackGroup)))) {
      throw new TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.");
    }
  };
  var Output = class extends EventEmitter {
    /**
     * The target to which the root file will be written. Throws when using {@link PathedTarget} with an async callback;
     * prefer the `'target'` event for those cases.
     */
    get target() {
      const errorMessage = "Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";
      if (this._rootTargetPromise) {
        throw new TypeError(errorMessage);
      }
      const rootTargetResult = this._getRootTarget();
      if (rootTargetResult instanceof Promise) {
        throw new TypeError(errorMessage);
      }
      return rootTargetResult;
    }
    /**
     * Creates a new instance of {@link Output} which can then be used to create a new media file according to the
     * specified {@link OutputOptions}.
     */
    constructor(options) {
      super();
      this.state = "pending";
      this.defaultTrackGroup = new OutputTrackGroup();
      this._onFinalize = null;
      this._unfinalizedTargets = /* @__PURE__ */ new Set();
      this._rootWriterPromise = null;
      this._tracks = [];
      this._startPromise = null;
      this._cancelPromise = null;
      this._finalizePromise = null;
      this._mutex = new AsyncMutex();
      this._metadataTags = {};
      this._rootTarget = null;
      this._rootTargetPromise = null;
      this._firstMediaStreamTimestamp = null;
      if (!options || typeof options !== "object") {
        throw new TypeError("options must be an object.");
      }
      if (!(options.format instanceof OutputFormat)) {
        throw new TypeError("options.format must be an OutputFormat.");
      }
      if (!(options.target instanceof Target || options.target instanceof PathedTarget)) {
        throw new TypeError("options.target must be a Target or a PathedTarget.");
      }
      if (options.target instanceof Target) {
        this._rememberTarget(options.target);
      }
      if (options.initTarget !== void 0 && !(options.initTarget instanceof Target) && typeof options.initTarget !== "function") {
        throw new Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");
      }
      if (options.onFinalize !== void 0 && typeof options.onFinalize !== "function") {
        throw new TypeError("options.onFinalize, when provided, must be a function.");
      }
      this.format = options.format;
      this._target = options.target;
      this._onFinalize = options.onFinalize ?? null;
      this._initTarget = options.initTarget ?? null;
      if (this._initTarget instanceof Target) {
        this._rememberTarget(this._initTarget);
      }
      this._muxer = options.format._createMuxer(this);
    }
    /** @internal */
    _getTargetValidated(request) {
      assert(this._target instanceof PathedTarget);
      const result = this._target.getTarget(request);
      const handleResult = (result2) => {
        if (!(result2 instanceof Target)) {
          throw new TypeError("getTarget must return a Target.");
        }
        return result2;
      };
      if (result instanceof Promise) {
        return result.then(handleResult);
      } else {
        return handleResult(result);
      }
    }
    /** @internal */
    async _getTarget(request) {
      assert(this._target instanceof PathedTarget);
      const target = await this._getTargetValidated(request);
      this._emit("target", { target, request, isRoot: request.isRoot });
      if (this.state === "canceled") {
        await target._close();
      } else {
        this._rememberTarget(target);
      }
      return target;
    }
    /** @internal */
    _rememberTarget(target) {
      this._unfinalizedTargets.add(target);
      target.on("finalized", () => this._unfinalizedTargets.delete(target), { once: true });
    }
    /** @internal */
    async _getInitTarget() {
      assert(this._initTarget !== null);
      if (this._initTarget instanceof Target) {
        return this._initTarget;
      }
      const target = await this._initTarget();
      if (this.state === "canceled") {
        await target._close();
      } else {
        this._rememberTarget(target);
      }
      return target;
    }
    /** @internal */
    _hasInitTarget() {
      return this._initTarget !== null;
    }
    /** @internal */
    _getRootTarget() {
      if (this._rootTarget) {
        return this._rootTarget;
      }
      if (this._rootTargetPromise) {
        return this._rootTargetPromise;
      }
      if (this._target instanceof Target) {
        this._emit("target", { target: this._target, request: null, isRoot: true });
        this._rootTarget = this._target;
        return this._target;
      }
      const request = {
        path: this._target.rootPath,
        isRoot: true,
        mimeType: this.format.mimeType
      };
      const result = this._getTargetValidated(request);
      const handleResult = (target) => {
        if (this.state === "canceled") {
          void target._close();
        } else {
          this._rememberTarget(target);
        }
        this._emit("target", { target, request, isRoot: true });
        this._rootTarget = target;
        return target;
      };
      if (result instanceof Promise) {
        return this._rootTargetPromise = result.then(handleResult);
      } else {
        return handleResult(result);
      }
    }
    /** @internal */
    _getRootWriter(isMonotonic) {
      return this._rootWriterPromise ??= (async () => {
        const target = await this._getRootTarget();
        const writer = new Writer(target, typeof isMonotonic === "boolean" ? isMonotonic : isMonotonic(target));
        writer.start();
        return writer;
      })();
    }
    /** Adds a video track to the output with the given source. Can only be called before the output is started. */
    addVideoTrack(source, metadata = {}) {
      if (!(source instanceof VideoSource)) {
        throw new TypeError("source must be a VideoSource.");
      }
      validateBaseTrackMetadata(metadata);
      if (metadata.rotation !== void 0 && ![0, 90, 180, 270].includes(metadata.rotation)) {
        throw new TypeError(`Invalid video rotation: ${metadata.rotation}. Has to be 0, 90, 180 or 270.`);
      }
      if (!this.format.supportsVideoRotationMetadata && metadata.rotation) {
        throw new Error(`${this.format._name} does not support video rotation metadata.`);
      }
      if (metadata.frameRate !== void 0 && (!Number.isFinite(metadata.frameRate) || metadata.frameRate <= 0)) {
        throw new TypeError(`Invalid video frame rate: ${metadata.frameRate}. Must be a positive number.`);
      }
      const metadataCopy = { ...metadata };
      metadataCopy.group ??= this.defaultTrackGroup;
      return this._addTrack(new OutputVideoTrack(this._tracks.length + 1, this, source, metadataCopy));
    }
    /** Adds an audio track to the output with the given source. Can only be called before the output is started. */
    addAudioTrack(source, metadata = {}) {
      if (!(source instanceof AudioSource)) {
        throw new TypeError("source must be an AudioSource.");
      }
      validateBaseTrackMetadata(metadata);
      const metadataCopy = { ...metadata };
      metadataCopy.group ??= this.defaultTrackGroup;
      return this._addTrack(new OutputAudioTrack(this._tracks.length + 1, this, source, metadataCopy));
    }
    /** Adds a subtitle track to the output with the given source. Can only be called before the output is started. */
    addSubtitleTrack(source, metadata = {}) {
      if (!(source instanceof SubtitleSource)) {
        throw new TypeError("source must be a SubtitleSource.");
      }
      validateBaseTrackMetadata(metadata);
      const metadataCopy = { ...metadata };
      metadataCopy.group ??= this.defaultTrackGroup;
      return this._addTrack(new OutputSubtitleTrack(this._tracks.length + 1, this, source, metadataCopy));
    }
    /**
     * Sets descriptive metadata tags about the media file, such as title, author, date, or cover art. When called
     * multiple times, only the metadata from the last call will be used.
     *
     * Can only be called before the output is started.
     */
    setMetadataTags(tags) {
      validateMetadataTags(tags);
      if (this.state !== "pending") {
        throw new Error("Cannot set metadata tags after output has been started or canceled.");
      }
      this._metadataTags = tags;
    }
    /** @internal */
    _addTrack(track) {
      if (this.state !== "pending") {
        throw new Error("Cannot add track after output has been started or canceled.");
      }
      if (track.source._connectedTrack) {
        throw new Error("Source is already used for a track.");
      }
      const supportedTrackCounts = this.format.getSupportedTrackCounts();
      const presentTracksOfThisType = this._tracks.reduce((count, t) => count + (t.type === track.type ? 1 : 0), 0);
      const maxCount = supportedTrackCounts[track.type].max;
      if (presentTracksOfThisType === maxCount) {
        throw new Error(maxCount === 0 ? `${this.format._name} does not support ${track.type} tracks.` : `${this.format._name} does not support more than ${maxCount} ${track.type} track${maxCount === 1 ? "" : "s"}.`);
      }
      const maxTotalCount = supportedTrackCounts.total.max;
      if (this._tracks.length === maxTotalCount) {
        throw new Error(`${this.format._name} does not support more than ${maxTotalCount} tracks${maxTotalCount === 1 ? "" : "s"} in total.`);
      }
      if (track.isVideoTrack()) {
        const supportedVideoCodecs = this.format.getSupportedVideoCodecs();
        if (supportedVideoCodecs.length === 0) {
          throw new Error(`${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(track.source._codec));
        } else if (!supportedVideoCodecs.includes(track.source._codec)) {
          throw new Error(`Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${supportedVideoCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec));
        }
      } else if (track.isAudioTrack()) {
        const supportedAudioCodecs = this.format.getSupportedAudioCodecs();
        if (supportedAudioCodecs.length === 0) {
          throw new Error(`${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(track.source._codec));
        } else if (!supportedAudioCodecs.includes(track.source._codec)) {
          throw new Error(`Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${supportedAudioCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec));
        }
      } else if (track.isSubtitleTrack()) {
        const supportedSubtitleCodecs = this.format.getSupportedSubtitleCodecs();
        if (supportedSubtitleCodecs.length === 0) {
          throw new Error(`${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(track.source._codec));
        } else if (!supportedSubtitleCodecs.includes(track.source._codec)) {
          throw new Error(`Codec '${track.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${supportedSubtitleCodecs.map((codec) => `'${codec}'`).join(", ")}.` + this.format._codecUnsupportedHint(track.source._codec));
        }
      }
      this._tracks.push(track);
      track.source._connectedTrack = track;
      return track;
    }
    /**
     * Starts the creation of the output file. This method should be called after all tracks have been added. Only after
     * the output has started can media samples be added to the tracks.
     *
     * @returns A promise that resolves when the output has successfully started and is ready to receive media samples.
     */
    async start() {
      const supportedTrackCounts = this.format.getSupportedTrackCounts();
      for (const trackType of ALL_TRACK_TYPES) {
        const presentTracksOfThisType = this._tracks.reduce((count, track) => count + (track.type === trackType ? 1 : 0), 0);
        const minCount = supportedTrackCounts[trackType].min;
        if (presentTracksOfThisType < minCount) {
          throw new Error(minCount === supportedTrackCounts[trackType].max ? `${this.format._name} requires exactly ${minCount} ${trackType} track${minCount === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${minCount} ${trackType} track${minCount === 1 ? "" : "s"}.`);
        }
      }
      const totalMinCount = supportedTrackCounts.total.min;
      if (this._tracks.length < totalMinCount) {
        throw new Error(totalMinCount === supportedTrackCounts.total.max ? `${this.format._name} requires exactly ${totalMinCount} track${totalMinCount === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${totalMinCount} track${totalMinCount === 1 ? "" : "s"}.`);
      }
      if (this.state === "canceled") {
        throw new Error("Output has been canceled.");
      }
      if (this._startPromise) {
        Logging._warn("Output has already been started.");
        return this._startPromise;
      }
      return this._startPromise = (async () => {
        this.state = "started";
        const release = await this._mutex.acquire();
        try {
          await this._muxer.start();
          const promises = this._tracks.map((track) => track.source._start());
          await Promise.all(promises);
        } finally {
          release();
        }
      })();
    }
    /**
     * Resolves with the full MIME type of the output file, including track codecs.
     *
     * The returned promise will resolve only once the precise codec strings of all tracks are known.
     */
    getMimeType() {
      return this._muxer.getMimeType();
    }
    /**
     * Cancels the creation of the output file, releasing internal resources like encoders and preventing further
     * samples from being added.
     *
     * @returns A promise that resolves once all internal resources have been released.
     */
    async cancel() {
      if (this._cancelPromise) {
        Logging._warn("Output has already been canceled.");
        return this._cancelPromise;
      } else if (this.state === "finalizing" || this.state === "finalized") {
        if (this.state === "finalized") {
          Logging._warn("Output has already been finalized.");
        }
        return;
      }
      return this._cancelPromise = (async () => {
        this.state = "canceled";
        const release = await this._mutex.acquire();
        try {
          const promises = this._tracks.map((x) => x.source._flushOrWaitForOngoingClose(true));
          await Promise.all(promises);
          await Promise.all([...this._unfinalizedTargets].map((target) => target._close()));
          this._unfinalizedTargets.clear();
        } finally {
          release();
        }
      })();
    }
    /**
     * Finalizes the output file. This method must be called after all media samples across all tracks have been added.
     * Once the Promise returned by this method completes, the output file is ready.
     */
    async finalize() {
      if (this.state === "pending") {
        throw new Error("Cannot finalize before starting.");
      }
      if (this.state === "canceled") {
        throw new Error("Cannot finalize after canceling.");
      }
      if (this._finalizePromise) {
        Logging._warn("Output has already been finalized.");
        return this._finalizePromise;
      }
      return this._finalizePromise = (async () => {
        this.state = "finalizing";
        const release = await this._mutex.acquire();
        try {
          const promises = this._tracks.map((x) => x.source._flushOrWaitForOngoingClose(false));
          await Promise.all(promises);
          await this._muxer.finalize();
          if (this._rootWriterPromise) {
            const rootWriter = await this._rootWriterPromise;
            if (!rootWriter.finalized) {
              await rootWriter.flush();
              await rootWriter.finalize();
            }
          }
          if (this._onFinalize) {
            await this._onFinalize();
          }
          this.state = "finalized";
        } finally {
          release();
        }
      })();
    }
  };

  // node_modules/.pnpm/mediabunny@1.50.8/node_modules/mediabunny/dist/modules/src/index.js
  var MEDIABUNNY_LOADED_SYMBOL = Symbol.for("mediabunny loaded");
  if (globalThis[MEDIABUNNY_LOADED_SYMBOL]) {
    Logging._error("[WARNING]\nMediabunny was loaded twice. This will likely cause Mediabunny not to work correctly. Check if multiple dependencies are importing different versions of Mediabunny, or if something is being bundled incorrectly.");
  }
  globalThis[MEDIABUNNY_LOADED_SYMBOL] = true;

  // src/download-config.js
  var FETCH_PARALLELISM = 5;
  var PREFETCH_MAX_BYTES = 64 * 1024 * 1024;
  var SOURCE_CACHE_SIZE = 64 * 1024 * 1024;
  var TARGET_CHUNK_SIZE = 4 * 1024 * 1024;

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
  function getPrefetchableSegmentUrls(content, playlistUrl) {
    const lines = content.split(/\r?\n/).map((line) => line.trim());
    if (!lines.includes("#EXT-X-ENDLIST")) return [];
    if (lines.some((line) => line.startsWith("#EXT-X-BYTERANGE:"))) return [];
    const urls = [];
    let expectsSegment = false;
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("#EXTINF:")) {
        expectsSegment = true;
        continue;
      }
      if (line.startsWith("#")) continue;
      if (!expectsSegment) continue;
      const url2 = resolveUrl(line, playlistUrl);
      if (url2) urls.push(url2);
      expectsSegment = false;
    }
    return urls;
  }
  function resolveOutputRotation(requestedWidth, requestedHeight, codedWidth, codedHeight, inputRotation) {
    if (![90, 270].includes(inputRotation)) return inputRotation || 0;
    if (![requestedWidth, requestedHeight, codedWidth, codedHeight].every((value) => value > 0)) {
      return inputRotation;
    }
    const targetAspect = requestedWidth / requestedHeight;
    const unrotatedAspect = codedWidth / codedHeight;
    const rotatedAspect = codedHeight / codedWidth;
    const unrotatedDistance = Math.abs(Math.log(unrotatedAspect / targetAspect));
    const rotatedDistance = Math.abs(Math.log(rotatedAspect / targetAspect));
    return unrotatedDistance + 0.01 < rotatedDistance ? 0 : inputRotation;
  }
  function parseMediaPlaylist(content, playlistUrl, defaultKey = null) {
    const lines = content.split(/\r?\n/).map((line) => line.trim());
    const sequenceLine = lines.find((line) => line.startsWith("#EXT-X-MEDIA-SEQUENCE:"));
    const mediaSequence = sequenceLine ? Number.parseInt(sequenceLine.slice(sequenceLine.indexOf(":") + 1), 10) : 0;
    const hasEndList = lines.includes("#EXT-X-ENDLIST");
    const hasMediaKey = lines.some((line) => line.startsWith("#EXT-X-KEY:"));
    let activeKey = hasMediaKey || !defaultKey ? null : { ...defaultKey };
    let pendingDuration = null;
    let sawMap = false;
    let sawByteRange = false;
    const segments = [];
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("#EXT-X-MAP:")) {
        sawMap = true;
        continue;
      }
      if (line.startsWith("#EXT-X-BYTERANGE:")) {
        sawByteRange = true;
        continue;
      }
      if (line.startsWith("#EXTINF:")) {
        pendingDuration = Number.parseFloat(line.slice(8).split(",")[0]);
        continue;
      }
      if (line.startsWith("#EXT-X-KEY:")) {
        const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
        const method = (attributes.METHOD || "").toUpperCase();
        if (method === "NONE") {
          activeKey = null;
          continue;
        }
        if (method !== "AES-128") {
          throw new UnsupportedFallbackError(`TS \u56DE\u9000\u4E0D\u652F\u6301\u52A0\u5BC6\u65B9\u5F0F ${method || "UNKNOWN"}`, "UNSUPPORTED_ENCRYPTION");
        }
        if (attributes.KEYFORMAT && attributes.KEYFORMAT !== "identity") {
          throw new UnsupportedFallbackError("TS \u56DE\u9000\u4E0D\u652F\u6301 DRM/\u975E identity KEYFORMAT", "DRM_UNSUPPORTED");
        }
        if (!attributes.URI) {
          throw new SourceError("AES-128 \u5BC6\u94A5\u7F3A\u5C11 URI", "INVALID_KEY");
        }
        activeKey = {
          method,
          uri: resolveUrl(attributes.URI, playlistUrl),
          iv: attributes.IV || null
        };
        continue;
      }
      if (line.startsWith("#")) continue;
      segments.push({
        url: resolveUrl(line, playlistUrl),
        sequence: mediaSequence + segments.length,
        duration: Number.isFinite(pendingDuration) ? pendingDuration : null,
        key: activeKey ? { ...activeKey } : null
      });
      pendingDuration = null;
    }
    if (sawMap) {
      throw new UnsupportedFallbackError("TS \u56DE\u9000\u4E0D\u652F\u6301 fMP4/CMAF \u64AD\u653E\u5217\u8868", "FMP4_FALLBACK_UNSUPPORTED");
    }
    if (sawByteRange) {
      throw new UnsupportedFallbackError("TS \u56DE\u9000\u6682\u4E0D\u652F\u6301 EXT-X-BYTERANGE", "BYTERANGE_UNSUPPORTED");
    }
    if (!hasEndList) {
      throw new UnsupportedFallbackError("\u5F53\u524D\u7248\u672C\u53EA\u652F\u6301 VOD/\u56DE\u653E\uFF0C\u4E0D\u652F\u6301\u6301\u7EED\u76F4\u64AD\u5F55\u5236", "LIVE_UNSUPPORTED");
    }
    if (segments.length === 0) {
      throw new SourceError("\u5A92\u4F53\u64AD\u653E\u5217\u8868\u4E2D\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u7247\u6BB5", "EMPTY_PLAYLIST");
    }
    return { mediaSequence, segments, hasEndList };
  }
  function parseIv(ivValue) {
    const normalized = String(ivValue || "").replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length > 32) {
      throw new SourceError("HLS IV \u683C\u5F0F\u65E0\u6548", "INVALID_IV");
    }
    const padded = normalized.padStart(32, "0");
    return Uint8Array.from(padded.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  }
  function generateSequenceIv(sequence) {
    let value = BigInt(sequence);
    const iv = new Uint8Array(16);
    for (let index = 15; index >= 0 && value > 0n; index--) {
      iv[index] = Number(value & 0xffn);
      value >>= 8n;
    }
    return iv;
  }
  async function decryptAes128(data, cryptoKey, iv) {
    return crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, data);
  }
  function looksLikeTransportStream(data) {
    const bytes2 = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes2.length < 188) return false;
    for (let offset = 0; offset < Math.min(376, bytes2.length); offset++) {
      if (bytes2[offset] !== 71) continue;
      if (offset + 188 >= bytes2.length || bytes2[offset + 188] === 71) return true;
    }
    return false;
  }
  async function processInOrderedBatches(items, concurrency, loader, writer) {
    const limit = Math.max(1, Math.floor(concurrency));
    const inFlight = /* @__PURE__ */ new Map();
    let nextLoad = 0;
    const fill = () => {
      while (nextLoad < items.length && inFlight.size < limit) {
        const index = nextLoad++;
        const promise = Promise.resolve().then(() => loader(items[index], index));
        void promise.catch(() => {
        });
        inFlight.set(index, promise);
      }
    };
    fill();
    for (let index = 0; index < items.length; index++) {
      const loaded = await inFlight.get(index);
      inFlight.delete(index);
      fill();
      await writer(loaded, items[index], index);
    }
  }

  // src/hls-prefetch.js
  function inputUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    return String(input);
  }
  function requestHeaders(input, init) {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    return headers;
  }
  function parseRange(value, size) {
    const match = /^bytes=(\d+)-(\d*)$/i.exec(value || "");
    if (!match) return null;
    const start = Number.parseInt(match[1], 10);
    const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (!Number.isFinite(start) || start < 0 || start >= size) return null;
    return { start, end: Math.min(size - 1, requestedEnd) };
  }
  function responseFromRecord(record, input, init) {
    const range = parseRange(requestHeaders(input, init).get("Range"), record.bytes.byteLength);
    const start = range?.start || 0;
    const end = range?.end ?? record.bytes.byteLength - 1;
    const body = record.bytes.subarray(start, end + 1);
    const headers = new Headers(record.headers);
    headers.delete("Content-Encoding");
    headers.delete("Transfer-Encoding");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", String(body.byteLength));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${record.bytes.byteLength}`);
    else headers.delete("Content-Range");
    const response = new Response(body, {
      status: range ? 206 : 200,
      statusText: range ? "Partial Content" : "OK",
      headers
    });
    try {
      Object.defineProperties(response, {
        url: { value: record.finalUrl },
        redirected: { value: record.redirected },
        type: { value: "basic" }
      });
    } catch {
    }
    return response;
  }
  async function wait2(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  var HlsSegmentPrefetcher = class {
    constructor(fetchFn, {
      concurrency = 5,
      windowSize = 6,
      retries = 3,
      maxBufferedBytes = Number.POSITIVE_INFINITY
    } = {}) {
      this.fetchFn = fetchFn;
      this.concurrency = Math.max(1, Math.floor(concurrency));
      this.windowSize = Math.max(this.concurrency, Math.floor(windowSize));
      this.retries = Math.max(1, Math.floor(retries));
      this.maxBufferedBytes = Number.isFinite(maxBufferedBytes) && maxBufferedBytes > 0 ? Math.floor(maxBufferedBytes) : Number.POSITIVE_INFINITY;
      this.bufferedBytes = 0;
      this.controller = new AbortController();
      this.playlists = /* @__PURE__ */ new Map();
      this.segmentLocations = /* @__PURE__ */ new Map();
      this.jobs = /* @__PURE__ */ new Map();
      this.queue = [];
      this.active = 0;
      this.disposed = false;
      this.fetch = this.fetch.bind(this);
    }
    async prepare(playlistUrls) {
      const urls = [...new Set(playlistUrls.filter(Boolean))];
      const prepared = await Promise.all(urls.map(async (url2) => {
        const record = await this.loadRecord(url2);
        const text = new TextDecoder().decode(record.bytes);
        const segments = getPrefetchableSegmentUrls(text, record.finalUrl || url2);
        return { requestUrl: url2, record, segments };
      }));
      for (const playlist of prepared) {
        this.playlists.set(playlist.requestUrl, playlist.record);
        this.playlists.set(playlist.record.finalUrl, playlist.record);
        playlist.segments.forEach((url2, index) => {
          if (!this.segmentLocations.has(url2)) {
            this.segmentLocations.set(url2, { segments: playlist.segments, index });
          }
        });
      }
      for (let offset = 0; offset < this.windowSize; offset++) {
        for (const playlist of prepared) {
          const url2 = playlist.segments[offset];
          if (url2) this.enqueue(url2, false, false);
        }
      }
      this.pump();
    }
    async fetch(input, init = {}) {
      if (this.disposed) return this.fetchFn(input, init);
      const url2 = inputUrl(input);
      const playlist = this.playlists.get(url2);
      if (playlist) return responseFromRecord(playlist, input, init);
      const location = this.segmentLocations.get(url2);
      if (!location) return this.fetchFn(input, init);
      this.scheduleWindow(location.segments, location.index);
      const job = this.enqueue(url2, true);
      try {
        const record = await job.promise;
        return responseFromRecord(record, input, init);
      } finally {
        if (this.jobs.get(url2) === job) this.releaseJob(job);
      }
    }
    scheduleWindow(segments, start) {
      for (let index = start; index < Math.min(segments.length, start + this.windowSize); index++) {
        this.enqueue(segments[index], index === start);
      }
    }
    enqueue(url2, priority = false, startPump = true) {
      let job = this.jobs.get(url2);
      if (job) {
        if (priority) job.priority = true;
        if (priority && job.state === "queued") {
          const index = this.queue.indexOf(job);
          if (index > 0) {
            this.queue.splice(index, 1);
            this.queue.unshift(job);
          }
        }
        if (startPump) this.pump();
        return job;
      }
      let resolve;
      let reject;
      const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      void promise.catch(() => {
      });
      job = {
        url: url2,
        promise,
        resolve,
        reject,
        state: "queued",
        priority,
        byteLength: 0
      };
      this.jobs.set(url2, job);
      if (priority) this.queue.unshift(job);
      else this.queue.push(job);
      if (startPump) this.pump();
      return job;
    }
    pump() {
      while (!this.disposed && this.active < this.concurrency && this.queue.length > 0) {
        const next = this.queue[0];
        if (this.bufferedBytes >= this.maxBufferedBytes && !next.priority) break;
        const job = this.queue.shift();
        if (job.state !== "queued") continue;
        job.state = "loading";
        this.active++;
        void this.loadRecord(job.url).then((record) => {
          if (this.disposed) throw new DOMException("Aborted", "AbortError");
          job.state = "ready";
          job.byteLength = record.bytes.byteLength;
          this.bufferedBytes += job.byteLength;
          job.resolve(record);
        }).catch((error) => {
          job.state = "error";
          job.reject(error);
        }).finally(() => {
          this.active--;
          this.pump();
        });
      }
    }
    releaseJob(job) {
      this.jobs.delete(job.url);
      this.bufferedBytes = Math.max(0, this.bufferedBytes - job.byteLength);
      job.byteLength = 0;
      this.pump();
    }
    async loadRecord(url2) {
      let lastError;
      for (let attempt = 0; attempt < this.retries; attempt++) {
        if (this.controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        try {
          const response = await this.fetchFn(url2, { signal: this.controller.signal });
          const bytes2 = new Uint8Array(await response.arrayBuffer());
          return {
            bytes: bytes2,
            headers: response.headers,
            finalUrl: response.url || url2,
            redirected: response.redirected
          };
        } catch (error) {
          lastError = error;
          if (this.controller.signal.aborted || attempt === this.retries - 1) throw error;
          await wait2(400 * 2 ** attempt);
        }
      }
      throw lastError;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.controller.abort();
      this.queue.length = 0;
      this.playlists.clear();
      this.segmentLocations.clear();
      this.jobs.clear();
      this.bufferedBytes = 0;
    }
  };

  // src/network.js
  function combineSignals(...signals) {
    const available = signals.filter(Boolean);
    if (available.length === 0) return void 0;
    if (available.length === 1) return available[0];
    if (typeof AbortSignal.any === "function") return AbortSignal.any(available);
    const controller = new AbortController();
    const abort = () => controller.abort();
    for (const signal of available) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener("abort", abort, { once: true });
    }
    return controller.signal;
  }
  function createTrackedFetch(reporter, taskController) {
    return async (input, init = {}) => {
      if (taskController.signal.aborted) throw new TaskCanceledError();
      const signal = combineSignals(taskController.signal, init.signal);
      let response;
      try {
        response = await fetch(input, { ...init, credentials: "include", signal });
      } catch (error) {
        if (taskController.signal.aborted || isAbortError(error)) throw new TaskCanceledError();
        throw new SourceError(`\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A${error?.message || error}`, "NETWORK_ERROR", { cause: error });
      }
      if (!response.ok) {
        throw new SourceError(`\u8D44\u6E90\u8BF7\u6C42\u5931\u8D25\uFF1AHTTP ${response.status}`, `HTTP_${response.status}`);
      }
      if (!response.body) return response;
      const stream = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          reporter.addBytes(chunk.byteLength);
          controller.enqueue(chunk);
        }
      }));
      const tracked = new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      try {
        Object.defineProperties(tracked, {
          url: { value: response.url },
          redirected: { value: response.redirected },
          type: { value: response.type }
        });
      } catch {
      }
      return tracked;
    };
  }
  async function fetchWithRetry(fetchFn, url2, init = {}, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await fetchFn(url2, init);
      } catch (error) {
        lastError = error;
        if (isAbortError(error) || attempt === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  // src/opfs.js
  var TEMP_PREFIX = "rplay-download-";
  async function createTempFile(taskId, extension) {
    const root = await navigator.storage.getDirectory();
    const tempName = `${TEMP_PREFIX}${taskId}.${extension}.part`;
    await root.removeEntry(tempName).catch(() => {
    });
    const handle = await root.getFileHandle(tempName, { create: true });
    return { root, tempName, handle };
  }
  async function removeTempFile(temp) {
    if (!temp?.tempName) return;
    const root = temp.root || await navigator.storage.getDirectory();
    await root.removeEntry(temp.tempName).catch(() => {
    });
  }
  async function cleanupStaleFiles() {
    try {
      const root = await navigator.storage.getDirectory();
      for await (const [name] of root.entries()) {
        if (name.startsWith(TEMP_PREFIX)) await root.removeEntry(name).catch(() => {
        });
      }
    } catch (error) {
      console.warn("[RPlay] \u6E05\u7406 OPFS \u4E34\u65F6\u6587\u4EF6\u5931\u8D25:", error);
    }
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
  var MessageType = Object.freeze({
    GET_VIDEO_INFO: "GET_VIDEO_INFO",
    GET_TASKS: "GET_TASKS",
    GET_DOWNLOAD_STATE: "GET_DOWNLOAD_STATE",
    DOWNLOAD_VIDEO: "DOWNLOAD_VIDEO",
    CANCEL_TASK: "CANCEL_TASK",
    OPEN_POPUP: "OPEN_POPUP",
    VIDEO_DETECTED: "VIDEO_DETECTED",
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

  // src/mp4-remux.js
  async function selectTracks(input, task) {
    let videoTracks;
    try {
      if (!await input.canRead()) throw new SourceError("\u65E0\u6CD5\u8BFB\u53D6 HLS \u64AD\u653E\u5217\u8868", "UNREADABLE_HLS");
      videoTracks = await input.getVideoTracks();
    } catch (error) {
      if (error instanceof SourceError || isSourceFailure(error)) throw error;
      throw new SourceError(`HLS \u6E05\u5355\u89E3\u6790\u5931\u8D25\uFF1A${error?.message || error}`, "INVALID_HLS", { cause: error });
    }
    if (videoTracks.length === 0) throw new SourceError("HLS \u4E2D\u6CA1\u6709\u89C6\u9891\u8F68\u9053", "NO_VIDEO_TRACK");
    const candidates = await Promise.all(videoTracks.map(async (track) => ({
      track,
      width: await track.getCodedWidth(),
      height: await track.getCodedHeight(),
      bitrate: await track.getBitrate()
    })));
    const exact = candidates.filter((candidate) => candidate.width === task.width && candidate.height === task.height);
    if (exact.length === 0) {
      throw new RemuxCompatibilityError(`\u672A\u627E\u5230\u6240\u9009\u5206\u8FA8\u7387 ${task.resolution} \u5BF9\u5E94\u7684 HLS \u89C6\u9891\u8F68\u9053`);
    }
    exact.sort((left, right) => {
      if (!task.bandwidth) return (right.bitrate || 0) - (left.bitrate || 0);
      return Math.abs((left.bitrate || 0) - task.bandwidth) - Math.abs((right.bitrate || 0) - task.bandwidth);
    });
    const videoTrack = exact[0].track;
    let audioTrack = await videoTrack.getPrimaryPairableAudioTrack().catch(() => null);
    if (!audioTrack) {
      const audioTracks = await input.getAudioTracks();
      if (audioTracks.length === 1) audioTrack = audioTracks[0];
    }
    return { videoTrack, audioTrack };
  }
  async function pipeTracks(tracks, baseTimestamp, duration, reporter, context) {
    const states = tracks.map((track) => ({
      ...track,
      iterator: track.sink.packets(
        track.firstPacket,
        void 0,
        track.verifyKeyPackets ? { verifyKeyPackets: true } : void 0
      )[Symbol.asyncIterator](),
      next: null,
      closed: false
    }));
    await Promise.all(states.map(async (state) => {
      state.next = await state.iterator.next();
    }));
    while (states.some((state) => !state.next.done)) {
      if (context.controller.signal.aborted) throw new TaskCanceledError();
      const available = states.filter((state2) => !state2.next.done);
      available.sort((left, right) => left.next.value.timestamp - right.next.value.timestamp);
      const state = available[0];
      const packet = state.next.value;
      const normalized = packet.clone({ timestamp: packet.timestamp - baseTimestamp });
      await state.source.add(normalized, { decoderConfig: state.decoderConfig });
      reporter.notePacket(normalized.timestamp + normalized.duration, duration);
      state.next = await state.iterator.next();
      if (state.next.done && !state.closed) {
        state.source.close();
        state.closed = true;
      }
    }
  }
  async function remuxToMp4(task, reporter, context) {
    const temp = await createTempFile(task.taskId, "mp4");
    const trackedFetch = createTrackedFetch(reporter, context.controller);
    const prefetcher = new HlsSegmentPrefetcher(trackedFetch, {
      concurrency: FETCH_PARALLELISM,
      windowSize: FETCH_PARALLELISM + 1,
      maxBufferedBytes: PREFETCH_MAX_BYTES
    });
    context.prefetcher = prefetcher;
    let input = null;
    try {
      await prefetcher.prepare([task.masterUrl, task.streamUrl, task.audioUrl]);
      input = new Input({
        formats: HLS_FORMATS,
        source: new UrlSource(task.masterUrl, {
          requestInit: { credentials: "include" },
          parallelism: FETCH_PARALLELISM,
          maxCacheSize: SOURCE_CACHE_SIZE,
          fetchFn: prefetcher.fetch,
          getRetryDelay: (previousAttempts) => previousAttempts < 2 ? 0.5 * 2 ** previousAttempts : null
        }),
        formatOptions: { hls: { offsetTimestampsByDateTime: false } }
      });
      context.input = input;
      const { videoTrack, audioTrack } = await selectTracks(input, task);
      if (await videoTrack.isLive()) {
        throw new SourceError("\u5F53\u524D\u7248\u672C\u53EA\u652F\u6301 VOD/\u56DE\u653E\uFF0C\u4E0D\u652F\u6301\u6301\u7EED\u76F4\u64AD\u5F55\u5236", "LIVE_UNSUPPORTED");
      }
      const videoCodec = await videoTrack.getCodec();
      const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
      const format = new Mp4OutputFormat({ fastStart: false });
      const supportedCodecs = format.getSupportedCodecs();
      if (!videoCodec || !supportedCodecs.includes(videoCodec)) {
        throw new RemuxCompatibilityError(`MP4 \u4E0D\u652F\u6301\u89C6\u9891\u7F16\u7801 ${videoCodec || "UNKNOWN"}`);
      }
      if (audioTrack && (!audioCodec || !supportedCodecs.includes(audioCodec))) {
        throw new RemuxCompatibilityError(`MP4 \u4E0D\u652F\u6301\u97F3\u9891\u7F16\u7801 ${audioCodec || "UNKNOWN"}`);
      }
      const videoSink = new EncodedPacketSink(videoTrack);
      const audioSink = audioTrack ? new EncodedPacketSink(audioTrack) : null;
      const [videoFirst, audioFirst, videoConfig, audioConfig] = await Promise.all([
        videoSink.getFirstPacket({ verifyKeyPackets: true }),
        audioSink?.getFirstPacket() || null,
        videoTrack.getDecoderConfig(),
        audioTrack?.getDecoderConfig() || null
      ]);
      if (!videoFirst) throw new SourceError("\u89C6\u9891\u8F68\u9053\u6CA1\u6709\u53EF\u7528 packet", "EMPTY_VIDEO_TRACK");
      if (!videoConfig) throw new RemuxCompatibilityError("\u65E0\u6CD5\u83B7\u53D6\u89C6\u9891\u8F68\u9053\u521D\u59CB\u5316\u53C2\u6570");
      if (audioTrack && audioFirst && !audioConfig) {
        throw new RemuxCompatibilityError("\u65E0\u6CD5\u83B7\u53D6\u97F3\u9891\u8F68\u9053\u521D\u59CB\u5316\u53C2\u6570");
      }
      const firstTimestamps = [videoFirst.timestamp];
      if (audioFirst) firstTimestamps.push(audioFirst.timestamp);
      const baseTimestamp = Math.min(...firstTimestamps);
      let duration = task.duration || null;
      if (!duration) {
        duration = await input.getDurationFromMetadata([videoTrack, ...audioTrack ? [audioTrack] : []]);
      }
      const writable = await temp.handle.createWritable({ keepExistingData: false });
      const target = new StreamTarget(writable, { chunked: true, chunkSize: TARGET_CHUNK_SIZE });
      const output = new Output({ format, target });
      context.output = output;
      const videoSource = new EncodedVideoPacketSource(videoCodec);
      const audioSource = audioTrack && audioFirst ? new EncodedAudioPacketSource(audioCodec) : null;
      const [codedWidth, codedHeight, inputRotation] = await Promise.all([
        videoTrack.getCodedWidth(),
        videoTrack.getCodedHeight(),
        videoTrack.getRotation()
      ]);
      const outputRotation = resolveOutputRotation(
        task.width,
        task.height,
        codedWidth,
        codedHeight,
        inputRotation
      );
      output.addVideoTrack(videoSource, { rotation: outputRotation });
      if (audioSource) {
        output.addAudioTrack(audioSource, { languageCode: await audioTrack.getLanguageCode() });
      }
      output.setMetadataTags({ title: task.title });
      reporter.setPhase(TaskPhase.REMUXING, "\u6B63\u5728\u65E0\u8F6C\u7801\u5C01\u88C5 MP4\u2026");
      await output.start();
      await pipeTracks([
        {
          sink: videoSink,
          source: videoSource,
          firstPacket: videoFirst,
          decoderConfig: videoConfig,
          verifyKeyPackets: true
        },
        ...audioSource ? [{
          sink: audioSink,
          source: audioSource,
          firstPacket: audioFirst,
          decoderConfig: audioConfig,
          verifyKeyPackets: false
        }] : []
      ], baseTimestamp, duration, reporter, context);
      await output.finalize();
      context.output = null;
      const file = await temp.handle.getFile();
      if (file.size === 0) throw new RemuxCompatibilityError("MP4 \u8F93\u51FA\u6587\u4EF6\u4E3A\u7A7A");
      return { ...temp, size: file.size };
    } catch (error) {
      if (context.output && !["canceled", "finalized"].includes(context.output.state)) {
        await context.output.cancel().catch(() => {
        });
      }
      await removeTempFile(temp);
      if (isAbortError(error) || context.controller.signal.aborted) throw new TaskCanceledError();
      if (error instanceof SourceError || error instanceof RemuxCompatibilityError || isSourceFailure(error)) throw error;
      throw new RemuxCompatibilityError(`MP4 \u6362\u5C01\u88C5\u5931\u8D25\uFF1A${error?.message || error}`, { cause: error });
    } finally {
      input?.dispose();
      prefetcher.dispose();
      context.input = null;
      context.prefetcher = null;
      context.output = null;
    }
  }

  // src/naming.js
  function normalizeVideoTitle(value) {
    return String(value || "").normalize("NFC").replace(/\s+/g, " ").replace(/\s*[|｜]\s*RPLAY\s*$/i, "").trim();
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

  // src/progress.js
  var ProgressReporter = class {
    constructor(task) {
      this.task = task;
      this.phase = TaskPhase.PREPARING;
      this.message = "\u6B63\u5728\u8BFB\u53D6 HLS \u4FE1\u606F\u2026";
      this.downloadedBytes = 0;
      this.totalBytes = task.estimatedBytes || null;
      this.mediaProgress = 0;
      this.lastReportAt = performance.now();
      this.lastReportBytes = 0;
      this.speed = 0;
    }
    setPhase(phase, message, extras = {}) {
      this.phase = phase;
      this.message = message;
      if (extras.totalBytes !== void 0) this.totalBytes = extras.totalBytes;
      if (extras.mediaProgress !== void 0) this.mediaProgress = extras.mediaProgress;
      this.report(true, extras);
    }
    addBytes(byteLength) {
      this.downloadedBytes += byteLength;
      this.report(false);
    }
    notePacket(timestamp, duration) {
      if (Number.isFinite(duration) && duration > 0) {
        this.mediaProgress = Math.max(this.mediaProgress, Math.max(0, timestamp) / duration);
      }
      this.report(false);
    }
    noteFallbackSegment(completed, total) {
      this.mediaProgress = total > 0 ? completed / total : 0;
      this.message = `\u6B63\u5728\u56DE\u9000\u4E0B\u8F7D\u539F\u59CB TS\uFF08${completed}/${total}\uFF09`;
      this.report(false);
    }
    report(force, extras = {}) {
      const now = performance.now();
      const elapsed = (now - this.lastReportAt) / 1e3;
      if (!force && elapsed < 1) return;
      if (elapsed > 0) {
        this.speed = (this.downloadedBytes - this.lastReportBytes) / elapsed;
      }
      this.lastReportAt = now;
      this.lastReportBytes = this.downloadedBytes;
      const byteProgress = this.totalBytes ? Math.min(1, this.downloadedBytes / this.totalBytes) : 0;
      const effectiveProgress = this.phase === TaskPhase.FALLBACK_TS ? this.mediaProgress : Math.max(byteProgress, this.mediaProgress);
      const progress = this.phase === TaskPhase.PREPARING ? Math.min(5, Math.round(byteProgress * 5)) : Math.min(95, Math.round(effectiveProgress * 95));
      chrome.runtime.sendMessage({
        type: MessageType.OFFSCREEN_PROGRESS,
        taskId: this.task.taskId,
        updates: {
          phase: this.phase,
          message: this.message,
          downloadedBytes: this.downloadedBytes,
          totalBytes: this.totalBytes,
          speed: this.speed,
          progress,
          ...extras
        }
      }).catch(() => {
      });
    }
  };

  // src/ts-fallback.js
  async function importAesKey(segmentKey, keyCache, fetchFn) {
    if (!segmentKey) return null;
    if (!keyCache.has(segmentKey.uri)) {
      keyCache.set(segmentKey.uri, (async () => {
        const response = await fetchWithRetry(fetchFn, segmentKey.uri);
        const raw = await response.arrayBuffer();
        if (raw.byteLength !== 16) throw new SourceError("AES-128 \u5BC6\u94A5\u957F\u5EA6\u4E0D\u662F 16 \u5B57\u8282", "INVALID_KEY_LENGTH");
        return crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["decrypt"]);
      })());
    }
    return keyCache.get(segmentKey.uri);
  }
  async function downloadFallbackTs(task, reporter, context, fallbackReason) {
    if (task.hasExternalAudio) {
      throw new UnsupportedFallbackError("\u8BE5\u6E05\u6670\u5EA6\u4F7F\u7528\u72EC\u7ACB\u97F3\u9891\u8F68\u9053\uFF0C\u65E0\u6CD5\u5B89\u5168\u56DE\u9000\u4E3A\u5355\u4E2A TS \u6587\u4EF6");
    }
    const temp = await createTempFile(task.taskId, "ts");
    const trackedFetch = createTrackedFetch(reporter, context.controller);
    let writable = null;
    try {
      const playlistResponse = await fetchWithRetry(trackedFetch, task.streamUrl);
      const sessionKey = (task.sessionKeys || []).find((key) => key.method === "AES-128" && key.uri && (!key.keyFormat || key.keyFormat === "identity"));
      const playlist = parseMediaPlaylist(await playlistResponse.text(), task.streamUrl, sessionKey || null);
      writable = await temp.handle.createWritable({ keepExistingData: false });
      const keyCache = /* @__PURE__ */ new Map();
      reporter.setPhase(TaskPhase.FALLBACK_TS, "MP4 \u5C01\u88C5\u5931\u8D25\uFF0C\u6B63\u5728\u56DE\u9000\u4E0B\u8F7D\u539F\u59CB TS\u2026", {
        actualFormat: "ts",
        fallbackReason,
        mediaProgress: 0
      });
      await processInOrderedBatches(
        playlist.segments,
        FETCH_PARALLELISM,
        async (segment) => {
          if (context.controller.signal.aborted) throw new TaskCanceledError();
          const response = await fetchWithRetry(trackedFetch, segment.url);
          let data = await response.arrayBuffer();
          if (segment.key) {
            const key = await importAesKey(segment.key, keyCache, trackedFetch);
            const iv = segment.key.iv ? parseIv(segment.key.iv) : generateSequenceIv(segment.sequence);
            try {
              data = await decryptAes128(data, key, iv);
            } catch (error) {
              throw new SourceError(`\u7247\u6BB5 ${segment.sequence} \u89E3\u5BC6\u5931\u8D25`, "DECRYPT_FAILED", { cause: error });
            }
          }
          return new Uint8Array(data);
        },
        async (data, _segment, index) => {
          if (index === 0 && !looksLikeTransportStream(data)) {
            throw new UnsupportedFallbackError("\u5A92\u4F53\u7247\u6BB5\u4E0D\u662F MPEG-TS\uFF0C\u65E0\u6CD5\u6267\u884C TS \u56DE\u9000");
          }
          await writable.write(data);
          reporter.noteFallbackSegment(index + 1, playlist.segments.length);
        }
      );
      await writable.close();
      writable = null;
      const file = await temp.handle.getFile();
      if (file.size === 0) throw new SourceError("TS \u8F93\u51FA\u6587\u4EF6\u4E3A\u7A7A", "EMPTY_TS_OUTPUT");
      return { ...temp, size: file.size };
    } catch (error) {
      if (writable) await writable.abort().catch(() => {
      });
      await removeTempFile(temp);
      throw error;
    }
  }

  // src/offscreen.js
  var activeContext = null;
  var readyFiles = /* @__PURE__ */ new Map();
  var cleanupPromise = cleanupStaleFiles();
  async function exposeReadyFile(task, temp, actualFormat, fallbackReason, context) {
    const file = await temp.handle.getFile();
    const mimeType = actualFormat === "mp4" ? "video/mp4" : "video/mp2t";
    const filename = makeDownloadFilename(task, actualFormat);
    const namedFile = new File([file], filename, {
      type: mimeType,
      lastModified: Date.now()
    });
    const objectUrl = URL.createObjectURL(namedFile);
    const ready = {
      objectUrl,
      tempName: temp.tempName,
      filename,
      actualFormat,
      size: file.size,
      fallbackReason
    };
    readyFiles.set(task.taskId, ready);
    context.fileReady = ready;
    await chrome.runtime.sendMessage({
      type: MessageType.OFFSCREEN_FILE_READY,
      taskId: task.taskId,
      file: ready
    });
  }
  async function executeTask(task) {
    await cleanupPromise;
    const context = {
      taskId: task.taskId,
      controller: new AbortController(),
      input: null,
      output: null,
      prefetcher: null,
      fileReady: null
    };
    context.done = new Promise((resolve) => {
      context.resolveDone = resolve;
    });
    activeContext = context;
    const reporter = new ProgressReporter(task);
    reporter.setPhase(TaskPhase.PREPARING, "\u6B63\u5728\u5206\u6790 HLS \u8F68\u9053\u2026");
    try {
      let temp;
      let actualFormat = "mp4";
      let fallbackReason = null;
      try {
        temp = await remuxToMp4(task, reporter, context);
      } catch (error) {
        if (isAbortError(error) || context.controller.signal.aborted) throw new TaskCanceledError();
        if (!shouldFallbackToTs(error)) throw error;
        fallbackReason = error?.message || "MP4 \u6362\u5C01\u88C5\u4E0D\u517C\u5BB9";
        actualFormat = "ts";
        try {
          temp = await downloadFallbackTs(task, reporter, context, fallbackReason);
        } catch (fallbackError) {
          throw new Error(`${fallbackReason}\uFF1BTS \u56DE\u9000\u5931\u8D25\uFF1A${fallbackError?.message || fallbackError}`);
        }
      }
      reporter.setPhase(
        TaskPhase.SAVING,
        actualFormat === "mp4" ? "MP4 \u5DF2\u751F\u6210\uFF0C\u7B49\u5F85\u4FDD\u5B58\u2026" : "TS \u56DE\u9000\u5DF2\u5B8C\u6210\uFF0C\u7B49\u5F85\u4FDD\u5B58\u2026",
        { actualFormat, fallbackReason }
      );
      await exposeReadyFile(task, temp, actualFormat, fallbackReason, context);
    } catch (error) {
      if (activeContext === context) activeContext = null;
      if (isAbortError(error) || context.controller.signal.aborted) {
        await chrome.runtime.sendMessage({
          type: MessageType.OFFSCREEN_CANCELED,
          taskId: task.taskId
        }).catch(() => {
        });
      } else {
        await chrome.runtime.sendMessage({
          type: MessageType.OFFSCREEN_ERROR,
          taskId: task.taskId,
          error: error?.message || String(error)
        }).catch(() => {
        });
      }
    } finally {
      context.resolveDone();
    }
  }
  function cancelActiveTask(taskId) {
    if (!activeContext || activeContext.taskId !== taskId) return false;
    return abortDownloadContext(activeContext);
  }
  async function releaseFile(request) {
    const ready = readyFiles.get(request.taskId);
    const objectUrl = ready?.objectUrl || request.objectUrl;
    const tempName = ready?.tempName || request.tempName;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (tempName) await removeTempFile({ tempName });
    readyFiles.delete(request.taskId);
    if (activeContext?.taskId === request.taskId) activeContext = null;
    return true;
  }
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!OFFSCREEN_MESSAGE_TYPES.has(request?.type)) return false;
    if (request.type === MessageType.OFFSCREEN_START) {
      if (activeContext) {
        sendResponse({ accepted: false, error: "\u5DF2\u6709\u540E\u53F0\u4EFB\u52A1\u6B63\u5728\u6267\u884C" });
        return false;
      }
      void executeTask(request.task);
      sendResponse({ accepted: true });
      return false;
    }
    if (request.type === MessageType.OFFSCREEN_STATUS) {
      sendResponse({
        activeTaskId: activeContext?.taskId || null,
        fileReady: activeContext?.fileReady || null
      });
      return false;
    }
    const action = request.type === MessageType.OFFSCREEN_CANCEL ? Promise.resolve(cancelActiveTask(request.taskId)) : releaseFile(request);
    action.then((success) => sendResponse({ success })).catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  });
  console.log("RPlay Video Downloader offscreen v2 loaded");
})();
/*! Bundled license information:

mediabunny/dist/modules/src/misc.js:
mediabunny/dist/modules/src/logging.js:
mediabunny/dist/modules/src/metadata.js:
mediabunny/dist/modules/shared/bitstream.js:
mediabunny/dist/modules/shared/aac-misc.js:
mediabunny/dist/modules/src/codec.js:
mediabunny/dist/modules/shared/mp3-misc.js:
mediabunny/dist/modules/shared/ac3-misc.js:
mediabunny/dist/modules/src/codec-data.js:
mediabunny/dist/modules/src/demuxer.js:
mediabunny/dist/modules/src/packet.js:
mediabunny/dist/modules/src/isobmff/isobmff-misc.js:
mediabunny/dist/modules/src/isobmff/isobmff-reader.js:
mediabunny/dist/modules/src/aes.js:
mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js:
mediabunny/dist/modules/src/mp3/mp3-reader.js:
mediabunny/dist/modules/src/mp3/mp3-demuxer.js:
mediabunny/dist/modules/src/adts/adts-reader.js:
mediabunny/dist/modules/src/adts/adts-demuxer.js:
mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-misc.js:
mediabunny/dist/modules/src/mpeg-ts/mpeg-ts-demuxer.js:
mediabunny/dist/modules/src/hls/hls-misc.js:
mediabunny/dist/modules/src/segmented-input.js:
mediabunny/dist/modules/src/source.js:
mediabunny/dist/modules/src/hls/hls-segmented-input.js:
mediabunny/dist/modules/src/hls/hls-demuxer.js:
mediabunny/dist/modules/src/input-format.js:
mediabunny/dist/modules/src/custom-coder.js:
mediabunny/dist/modules/src/media-sink.js:
mediabunny/dist/modules/src/input-track.js:
mediabunny/dist/modules/src/input.js:
mediabunny/dist/modules/src/reader.js:
mediabunny/dist/modules/src/id3.js:
mediabunny/dist/modules/src/muxer.js:
mediabunny/dist/modules/src/subtitles.js:
mediabunny/dist/modules/src/isobmff/isobmff-boxes.js:
mediabunny/dist/modules/src/writer.js:
mediabunny/dist/modules/src/target.js:
mediabunny/dist/modules/src/isobmff/isobmff-muxer.js:
mediabunny/dist/modules/src/media-source.js:
mediabunny/dist/modules/src/output-format.js:
mediabunny/dist/modules/src/output.js:
mediabunny/dist/modules/src/index.js:
  (*!
   * Copyright (c) 2026-present, Vanilagy and contributors
   *
   * This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/.
   *)
*/
