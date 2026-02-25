/**
 * Snippet storage module for Chrome Sync Storage.
 * Uses normalized array format, LZ-string compression, and chunking to maximize capacity.
 * Format v2: category dedup, trimBoth, empty desc as 0, name limit, shorter meta key, shorter IDs.
 */
(function () {
  'use strict';

  const LEGACY_KEY = 'gemSnippets';
  const META_KEY = 'sm';
  const META_KEY_LEGACY = 's_meta';
  const CHUNK_SIZE = 7000;
  const MAX_CHUNKS = 16;
  const FORMAT_VERSION = 2;

  const DEFAULT_SNIPPETS = [
    { id: 'sample-esl', favorite: false, category: '', name: 'ESL snippet', description: '', swapKeywords: [], content: 'This is a sample snippet!' }
  ];

  // Normalize for storage (shorter values)
  function normInitiateFrom(v) {
    if (v === 'panel') return 'p';
    if (v === 'toolbar') return 't';
    return 'a'; // anywhere
  }
  function normMatchRule(v) {
    return v === 'whole' ? 'w' : 'p';
  }
  function normMode(v) {
    return v === 'plain' ? 'p' : 't';
  }

  // Denormalize from storage (full values)
  function denormInitiateFrom(v) {
    if (v === 'p') return 'panel';
    if (v === 't') return 'toolbar';
    return 'anywhere';
  }
  function denormMatchRule(v) {
    return v === 'w' ? 'whole' : 'partial';
  }
  function denormMode(v) {
    return v === 'p' ? 'plain' : 'token';
  }

  function trimBoth(s) {
    return typeof s === 'string' ? s.replace(/^\s+/, '').replace(/\s+$/, '') : (s || '');
  }

  function generateSnippetId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  }

  function packSnippet(s, categoryIndex) {
    if (!s || typeof s !== 'object') return null;
    const swapKeywords = Array.isArray(s.swapKeywords)
      ? s.swapKeywords
          .filter((k) => k && typeof k.keyword === 'string' && k.keyword.trim())
          .map((k) => [
            normInitiateFrom(k.initiateFrom),
            String(k.keyword).trim(),
            normMatchRule(k.matchRule),
            normMode(k.mode)
          ])
      : [];
    const descRaw = trimBoth(String(s.description ?? '')).slice(0, 200);
    const desc = descRaw === '' ? 0 : descRaw;
    const name = String(s.name ?? '').slice(0, 100);
    return [
      categoryIndex,
      trimBoth(String(s.content ?? '')),
      desc,
      s.favorite ? 1 : 0,
      String(s.id ?? ''),
      name,
      swapKeywords
    ];
  }

  function unpackSnippetV1(arr) {
    if (!Array.isArray(arr) || arr.length < 7) return null;
    const swapKeywords = Array.isArray(arr[6])
      ? arr[6].map((row) => {
          if (!Array.isArray(row) || row.length < 4) return null;
          return {
            initiateFrom: denormInitiateFrom(row[0]),
            keyword: String(row[1] ?? ''),
            matchRule: denormMatchRule(row[2]),
            mode: denormMode(row[3])
          };
        }).filter(Boolean)
      : [];
    const descVal = arr[2];
    const description = (descVal === 0 || descVal === '0') ? '' : String(descVal ?? '');
    return {
      category: String(arr[0] ?? ''),
      content: String(arr[1] ?? ''),
      description,
      favorite: arr[3] === 1,
      id: String(arr[4] ?? ''),
      name: String(arr[5] ?? ''),
      swapKeywords
    };
  }

  function unpackSnippetV2(arr, categories) {
    if (!Array.isArray(arr) || arr.length < 7 || !Array.isArray(categories)) return null;
    const categoryIdx = typeof arr[0] === 'number' ? arr[0] : 0;
    const category = categories[categoryIdx] ?? '';
    const swapKeywords = Array.isArray(arr[6])
      ? arr[6].map((row) => {
          if (!Array.isArray(row) || row.length < 4) return null;
          return {
            initiateFrom: denormInitiateFrom(row[0]),
            keyword: String(row[1] ?? ''),
            matchRule: denormMatchRule(row[2]),
            mode: denormMode(row[3])
          };
        }).filter(Boolean)
      : [];
    const descVal = arr[2];
    const description = (descVal === 0 || descVal === '0') ? '' : String(descVal ?? '');
    return {
      category,
      content: String(arr[1] ?? ''),
      description,
      favorite: arr[3] === 1,
      id: String(arr[4] ?? ''),
      name: String(arr[5] ?? ''),
      swapKeywords
    };
  }

  function pack(snippets) {
    if (!Array.isArray(snippets)) return [];
    const categories = [];
    const categoryMap = new Map();
    const ensureCategory = (cat) => {
      const key = String(cat ?? '');
      if (!categoryMap.has(key)) {
        categoryMap.set(key, categories.length);
        categories.push(key);
      }
      return categoryMap.get(key);
    };
    const packed = [];
    for (const s of snippets) {
      const catIdx = ensureCategory(s.category);
      const row = packSnippet(s, catIdx);
      if (row) packed.push(row);
    }
    return { c: categories, s: packed };
  }

  function unpack(packed) {
    if (!packed) return [];
    if (Array.isArray(packed)) {
      return packed.map(unpackSnippetV1).filter(Boolean);
    }
    if (packed && typeof packed === 'object' && Array.isArray(packed.c) && Array.isArray(packed.s)) {
      const categories = packed.c;
      return packed.s.map((row) => unpackSnippetV2(row, categories)).filter(Boolean);
    }
    return [];
  }

  function ensureIds(snippets) {
    return snippets.map((s, i) => ({
      ...s,
      id: s.id && String(s.id).trim() ? s.id : generateSnippetId()
    }));
  }

  function chunk(str, size) {
    const result = [];
    for (let i = 0; i < str.length; i += size) {
      result.push(str.slice(i, i + size));
    }
    return result;
  }

  function runMigration(callback) {
    chrome.storage.sync.get([LEGACY_KEY], (res) => {
      const legacy = res && res[LEGACY_KEY];
      if (!Array.isArray(legacy)) {
        if (callback) callback(null);
        return;
      }
      const normalized = ensureIds(legacy);
      writeToStorage(normalized, (err) => {
        if (err) {
          if (callback) callback(err);
          return;
        }
        chrome.storage.sync.remove(LEGACY_KEY, () => {
          if (callback) callback(null);
        });
      });
    });
  }

  function writeToStorage(snippets, callback) {
    try {
      const packed = pack(snippets);
      const json = JSON.stringify(packed);
      const compressed = typeof LZString !== 'undefined'
        ? LZString.compressToUTF16(json)
        : json;
      const chunks = chunk(compressed || json, CHUNK_SIZE);
      if (chunks.length === 0) chunks.push('');
      if (chunks.length > MAX_CHUNKS) {
        const err = new Error('Snippets storage full');
        if (callback) callback(err);
        return;
      }
      const meta = { v: FORMAT_VERSION, c: chunks.length };
      const toSet = { [META_KEY]: meta };
      chunks.forEach((ch, i) => {
        toSet[`s${i}`] = ch;
      });
      const keysToRemove = [META_KEY_LEGACY];
      for (let i = chunks.length; i < MAX_CHUNKS; i++) {
        keysToRemove.push(`s${i}`);
      }
      const onDone = () => {
        if (chrome.runtime.lastError) {
          if (callback) callback(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (callback) callback(null);
      };
      chrome.storage.sync.remove(keysToRemove, () => {
        chrome.storage.sync.set(toSet, onDone);
      });
    } catch (e) {
      if (callback) callback(e);
    }
  }

  function getMetaFromResult(res) {
    return res && (res[META_KEY] || res[META_KEY_LEGACY]);
  }

  function readFromStorage(callback) {
    const chunkKeys = [];
    for (let i = 0; i < MAX_CHUNKS; i++) chunkKeys.push(`s${i}`);
    chrome.storage.sync.get([META_KEY, META_KEY_LEGACY, ...chunkKeys], (res) => {
      try {
        const meta = getMetaFromResult(res);
        if (!meta || typeof meta.c !== 'number' || meta.c < 1) {
          callback([]);
          return;
        }
        let combined = '';
        for (let i = 0; i < meta.c; i++) {
          const ch = res[`s${i}`];
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
        const snippets = unpack(packed);
        callback(ensureIds(snippets));
      } catch (e) {
        callback([]);
      }
    });
  }

  function needsMigration(callback) {
    chrome.storage.sync.get([LEGACY_KEY, META_KEY, META_KEY_LEGACY], (res) => {
      const hasLegacy = res && Array.isArray(res[LEGACY_KEY]);
      const meta = getMetaFromResult(res);
      const hasNew = meta && typeof meta.c === 'number';
      callback(hasLegacy && !hasNew);
    });
  }

  function loadSnippets(callback) {
    needsMigration((needMigrate) => {
      if (needMigrate) {
        runMigration((err) => {
          if (err) {
            window.gemShowToast && window.gemShowToast('Failed to migrate snippets.', { type: 'error' });
            callback(DEFAULT_SNIPPETS);
            return;
          }
          readFromStorage((snippets) => callback(snippets));
        });
      } else {
        readFromStorage((snippets) => {
          if (snippets.length) {
            callback(snippets);
          } else {
            chrome.storage.sync.get([META_KEY, META_KEY_LEGACY], (res) => {
              const hasNew = !!getMetaFromResult(res);
              callback(hasNew ? [] : DEFAULT_SNIPPETS);
            });
          }
        });
      }
    });
  }

  function saveSnippets(snippets, callback) {
    const safe = Array.isArray(snippets) ? ensureIds(snippets) : [];
    writeToStorage(safe, (err) => {
      if (err) {
        window.gemShowToast && window.gemShowToast('Snippets storage full. Could not save.', { type: 'error' });
      }
      if (callback) callback();
    });
  }

  window.gemLoadSnippets = loadSnippets;
  window.gemSaveSnippets = saveSnippets;
  window.gemNeedsMigration = needsMigration;
  window.gemGenerateSnippetId = generateSnippetId;
})();
