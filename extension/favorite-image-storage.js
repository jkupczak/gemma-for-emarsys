/**
 * Favorite-image storage module for Chrome Sync Storage.
 * Uses LZ-string compression and chunking to fit within sync quota.
 * Mirrors the strategy used by snippet-storage.js.
 *
 * Format v2 packed structure:
 *   { p: [urlPrefix, ...], t: [str, ...], i: [[url, ts, catIdx, langIdx, altText, transIdx, width], ...] }
 *   - p: URL prefix dedup table (prefixes shared by 2+ URLs)
 *   - t: string dedup table for category/language/translation (index 0 = empty string)
 *   - i: packed items; url is either a full string or [prefixIdx, suffix]
 *   - trailing default values (0 or '') are truncated from each item
 *
 * Format v1 (legacy, read-only):
 *   [[url, ts, category, language, altText, translation, width], ...]
 *
 * Sync keys: fm (meta), f0-f15 (chunks)
 */
(function () {
  'use strict';

  const LOCAL_KEY = 'gemFavoriteImagesConsolidated';
  const META_KEY = 'fm';
  const CHUNK_PREFIX = 'f';
  const CHUNK_SIZE = 7000;
  const MAX_CHUNKS = 16;
  const FORMAT_VERSION = 2;

  // -- v1 unpack (legacy, read-only) ----------------------------------------

  function unpackV1Item(arr) {
    if (!Array.isArray(arr) || arr.length < 2 || !arr[0]) return null;
    const width = (typeof arr[6] === 'number' && arr[6] > 0) ? arr[6] : '';
    return {
      url: String(arr[0]),
      ts: (typeof arr[1] === 'number') ? arr[1] : 0,
      meta: {
        category: String(arr[2] ?? ''),
        language: String(arr[3] ?? ''),
        altText: String(arr[4] ?? ''),
        translation: String(arr[5] ?? ''),
        width: width
      }
    };
  }

  function unpackV1(packed) {
    if (!Array.isArray(packed)) return [];
    return packed.map(unpackV1Item).filter(Boolean);
  }

  // -- v2 pack / unpack -----------------------------------------------------

  function pack(items) {
    if (!Array.isArray(items)) return { p: [], t: [''], i: [] };

    // URL prefix table: everything up to and including the last '/'
    const prefixCounts = new Map();
    for (const item of items) {
      if (!item || !item.url) continue;
      const url = String(item.url);
      const lastSlash = url.lastIndexOf('/');
      if (lastSlash > 0) {
        const prefix = url.slice(0, lastSlash + 1);
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
    }
    const prefixes = [];
    const prefixMap = new Map();
    for (const [prefix, count] of prefixCounts) {
      if (count >= 2) {
        prefixMap.set(prefix, prefixes.length);
        prefixes.push(prefix);
      }
    }

    // String dedup table for category, language, translation
    const strings = [''];
    const stringMap = new Map([['', 0]]);
    const ensureString = (s) => {
      const str = (typeof s === 'string') ? s : '';
      if (!stringMap.has(str)) {
        stringMap.set(str, strings.length);
        strings.push(str);
      }
      return stringMap.get(str);
    };

    const packed = [];
    for (const item of items) {
      if (!item || !item.url) continue;
      const url = String(item.url);
      const m = (item.meta && typeof item.meta === 'object') ? item.meta : {};

      // URL: use prefix dedup when possible
      let urlVal;
      const lastSlash = url.lastIndexOf('/');
      const prefix = lastSlash > 0 ? url.slice(0, lastSlash + 1) : null;
      if (prefix && prefixMap.has(prefix)) {
        urlVal = [prefixMap.get(prefix), url.slice(lastSlash + 1)];
      } else {
        urlVal = url;
      }

      const ts = (typeof item.ts === 'number') ? item.ts : 0;
      const catIdx = ensureString((typeof m.category === 'string') ? m.category : '');
      const langIdx = ensureString((typeof m.language === 'string') ? m.language : '');
      const altText = (typeof m.altText === 'string') ? m.altText : '';
      const transIdx = ensureString((typeof m.translation === 'string') ? m.translation : '');
      const width = (typeof m.width === 'number' && m.width > 0) ? m.width : '';

      const row = [urlVal, ts, catIdx, langIdx, altText, transIdx, width];

      // Truncate trailing defaults (0 for indices, '' for strings)
      while (row.length > 2) {
        const last = row[row.length - 1];
        if (last === 0 || last === '') {
          row.pop();
        } else {
          break;
        }
      }

      packed.push(row);
    }

    return { p: prefixes, t: strings, i: packed };
  }

  function unpackV2(packed) {
    if (!packed || typeof packed !== 'object') return [];
    const prefixes = Array.isArray(packed.p) ? packed.p : [];
    const strings = Array.isArray(packed.t) ? packed.t : [''];
    const items = Array.isArray(packed.i) ? packed.i : [];

    return items.map((arr) => {
      if (!Array.isArray(arr) || arr.length < 1) return null;

      // Reconstruct URL
      let url;
      if (Array.isArray(arr[0])) {
        const pidx = arr[0][0];
        const suffix = arr[0][1];
        url = (prefixes[pidx] || '') + String(suffix ?? '');
      } else {
        url = String(arr[0] || '');
      }
      if (!url) return null;

      const ts = (typeof arr[1] === 'number') ? arr[1] : 0;
      const catIdx = (typeof arr[2] === 'number') ? arr[2] : 0;
      const langIdx = (typeof arr[3] === 'number') ? arr[3] : 0;
      const altText = (typeof arr[4] === 'string') ? arr[4] : '';
      const transIdx = (typeof arr[5] === 'number') ? arr[5] : 0;
      const widthRaw = arr[6];
      const width = (typeof widthRaw === 'number' && widthRaw > 0) ? widthRaw : '';

      return {
        url,
        ts,
        meta: {
          category: String(strings[catIdx] ?? ''),
          language: String(strings[langIdx] ?? ''),
          altText: altText,
          translation: String(strings[transIdx] ?? ''),
          width: width
        }
      };
    }).filter(Boolean);
  }

  function unpack(packed, version) {
    if (version >= 2 && packed && typeof packed === 'object' && !Array.isArray(packed)) {
      return unpackV2(packed);
    }
    return unpackV1(packed);
  }

  // -- Chunk helpers --------------------------------------------------------

  function chunkString(str, size) {
    const result = [];
    for (let i = 0; i < str.length; i += size) {
      result.push(str.slice(i, i + size));
    }
    return result;
  }

  function chunkKey(i) {
    return CHUNK_PREFIX + i;
  }

  // -- Write ----------------------------------------------------------------

  function writeToStorage(items, callback) {
    try {
      const packed = pack(items);
      const json = JSON.stringify(packed);
      const compressed = typeof LZString !== 'undefined'
        ? LZString.compressToUTF16(json)
        : json;
      const chunks = chunkString(compressed || json, CHUNK_SIZE);
      if (chunks.length === 0) chunks.push('');
      if (chunks.length > MAX_CHUNKS) {
        const err = new Error('Favorite images storage full');
        if (callback) callback(err);
        return;
      }
      const meta = { v: FORMAT_VERSION, c: chunks.length };
      const toSet = { [META_KEY]: meta };
      chunks.forEach((ch, i) => {
        toSet[chunkKey(i)] = ch;
      });
      const keysToRemove = [];
      for (let i = chunks.length; i < MAX_CHUNKS; i++) {
        keysToRemove.push(chunkKey(i));
      }
      const onDone = () => {
        if (chrome.runtime.lastError) {
          if (callback) callback(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (callback) callback(null);
      };
      if (keysToRemove.length) {
        chrome.storage.sync.remove(keysToRemove, () => {
          chrome.storage.sync.set(toSet, onDone);
        });
      } else {
        chrome.storage.sync.set(toSet, onDone);
      }
    } catch (e) {
      if (callback) callback(e);
    }
  }

  // -- Read -----------------------------------------------------------------

  function readFromStorage(callback) {
    const keys = [META_KEY];
    for (let i = 0; i < MAX_CHUNKS; i++) keys.push(chunkKey(i));
    chrome.storage.sync.get(keys, (res) => {
      try {
        const meta = res && res[META_KEY];
        if (!meta || typeof meta.c !== 'number' || meta.c < 1) {
          callback([]);
          return;
        }
        let combined = '';
        for (let i = 0; i < meta.c; i++) {
          const ch = res[chunkKey(i)];
          if (ch == null || typeof ch !== 'string') {
            callback([]);
            return;
          }
          combined += ch;
        }
        const decompressed = typeof LZString !== 'undefined'
          ? LZString.decompressFromUTF16(combined)
          : combined;
        if (!decompressed) {
          callback([]);
          return;
        }
        let packed;
        try {
          packed = JSON.parse(decompressed);
        } catch (e) {
          callback([]);
          return;
        }
        callback(unpack(packed, meta.v || 1));
      } catch (e) {
        callback([]);
      }
    });
  }

  // -- Migration (local -> sync) --------------------------------------------

  function needsMigration(callback) {
    chrome.storage.sync.get([META_KEY], (syncRes) => {
      const hasSyncData = syncRes && syncRes[META_KEY] && typeof syncRes[META_KEY].c === 'number';
      if (hasSyncData) {
        callback(false);
        return;
      }
      chrome.storage.local.get({ [LOCAL_KEY]: [] }, (localRes) => {
        const localData = localRes && localRes[LOCAL_KEY];
        callback(Array.isArray(localData) && localData.length > 0);
      });
    });
  }

  function runMigration(callback) {
    chrome.storage.local.get({ [LOCAL_KEY]: [] }, (localRes) => {
      const localData = localRes && localRes[LOCAL_KEY];
      if (!Array.isArray(localData) || localData.length === 0) {
        if (callback) callback(null);
        return;
      }
      writeToStorage(localData, (err) => {
        if (err) {
          if (callback) callback(err);
          return;
        }
        chrome.storage.local.remove(LOCAL_KEY, () => {
          if (callback) callback(null);
        });
      });
    });
  }

  // -- Public API -----------------------------------------------------------

  function read(callback) {
    needsMigration((needMigrate) => {
      if (needMigrate) {
        runMigration((err) => {
          if (err) {
            window.gemShowToast && window.gemShowToast('Failed to migrate favorite images.', { type: 'error' });
            callback([]);
            return;
          }
          readFromStorage(callback);
        });
      } else {
        readFromStorage(callback);
      }
    });
  }

  function write(items, callback) {
    const safe = Array.isArray(items) ? items : [];
    writeToStorage(safe, (err) => {
      if (err) {
        window.gemShowToast && window.gemShowToast('Favorite images storage full. Could not save.', { type: 'error' });
      }
      if (callback) callback(err || null);
    });
  }

  window.gemFavImages = {
    read: read,
    write: write,
    needsMigration: needsMigration
  };
})();
