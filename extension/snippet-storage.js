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
  // Per sync item ~8190 UTF-8 bytes (key+value); keys like s512 ≤4 chars; margin for safety.
  const CHUNK_SIZE = 8180;
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

  // Where a keyword swap may run. Rules saved before this existed (no locations) allow all.
  const SWAP_LOCATIONS = ['subject', 'preheader', 'body', 'conditions', 'alt'];
  function normalizeSwapLocations(v) {
    if (!Array.isArray(v)) return SWAP_LOCATIONS.slice();
    return SWAP_LOCATIONS.filter((loc) => v.includes(loc));
  }
  function swapRuleAllowsLocation(rule, location) {
    return normalizeSwapLocations(rule && rule.locations).includes(location);
  }
  // Stored as a bitmask in row[4]; omitted when every location is allowed.
  function packSwapLocations(v) {
    const locations = normalizeSwapLocations(v);
    if (locations.length === SWAP_LOCATIONS.length) return null;
    return SWAP_LOCATIONS.reduce((bits, loc, i) => (locations.includes(loc) ? bits | (1 << i) : bits), 0);
  }
  function unpackSwapLocations(bits) {
    if (typeof bits !== 'number') return SWAP_LOCATIONS.slice();
    return SWAP_LOCATIONS.filter((_, i) => bits & (1 << i));
  }
  function unpackSwapKeywordRow(row) {
    if (!Array.isArray(row) || row.length < 4) return null;
    return {
      initiateFrom: denormInitiateFrom(row[0]),
      keyword: String(row[1] ?? ''),
      matchRule: denormMatchRule(row[2]),
      mode: denormMode(row[3]),
      locations: unpackSwapLocations(row[4])
    };
  }

  // Content variants: alternate code used instead of `content` in specific locations.
  // Unlike swap locations, a variant with no locations applies nowhere.
  function normalizeVariantLocations(v) {
    return Array.isArray(v) ? SWAP_LOCATIONS.filter((loc) => v.includes(loc)) : [];
  }
  function normalizeContentSource(v) {
    return v === 'personalization' ? 'personalization' : 'code';
  }

  function normalizeSnippetVariantEntry(variant) {
    if (!variant || typeof variant !== 'object') return null;
    const locations = normalizeVariantLocations(variant.locations);
    if (!locations.length) return null;
    const contentSource = normalizeContentSource(variant.contentSource);
    const persTokenId = String(variant.persTokenId || '').trim();
    const content = trimBoth(String(variant.content ?? ''));
    if (contentSource === 'personalization') {
      if (!persTokenId) return null;
      return { locations, contentSource, persTokenId, content: '' };
    }
    if (!content) return null;
    return { locations, contentSource: 'code', persTokenId: '', content };
  }

  function normalizeSnippetVariants(v) {
    if (!Array.isArray(v)) return [];
    return v.map(normalizeSnippetVariantEntry).filter(Boolean);
  }

  function normalizeSnippetRootFields(snippet) {
    if (!snippet || typeof snippet !== 'object') {
      return { contentSource: 'code', content: '', persTokenId: '' };
    }
    const contentSource = normalizeContentSource(snippet.contentSource);
    const persTokenId = String(snippet.persTokenId || '').trim();
    if (contentSource === 'personalization') {
      return { contentSource, content: '', persTokenId };
    }
    return { contentSource: 'code', content: trimBoth(String(snippet.content ?? '')), persTokenId: '' };
  }

  function snippetSlotForLocation(snippet, location) {
    if (!snippet) return { contentSource: 'code', content: '', persTokenId: '' };
    const root = normalizeSnippetRootFields(snippet);
    if (location) {
      const variant = normalizeSnippetVariants(snippet.variants).find((v) => v.locations.includes(location));
      if (variant) {
        return {
          contentSource: variant.contentSource,
          content: variant.content,
          persTokenId: variant.persTokenId,
        };
      }
    }
    return root;
  }

  function findPersTokenById(id) {
    const tokenId = String(id || '').trim();
    if (!tokenId || typeof window.gemGetPersonalizationSessionTokens !== 'function') return null;
    const tokens = window.gemGetPersonalizationSessionTokens() || [];
    return tokens.find((t) => t && String(t._id) === tokenId) || null;
  }

  function persTokenDisplayName(id) {
    const token = findPersTokenById(id);
    if (token) return String(token.displayName || token.name || '').trim() || String(id || '').trim();
    return String(id || '').trim();
  }

  function snippetContentForLocation(snippet, location) {
    const slot = snippetSlotForLocation(snippet, location);
    if (slot.contentSource === 'personalization') {
      const token = findPersTokenById(slot.persTokenId);
      if (token && typeof window.gemBuildPersonalizationPreview === 'function') {
        return window.gemBuildPersonalizationPreview(token) || '';
      }
      return '';
    }
    return slot.content;
  }

  function snippetPersTokenIds(snippet) {
    const ids = new Set();
    if (!snippet) return [];
    const root = normalizeSnippetRootFields(snippet);
    if (root.contentSource === 'personalization' && root.persTokenId) ids.add(root.persTokenId);
    normalizeSnippetVariants(snippet.variants).forEach((v) => {
      if (v.contentSource === 'personalization' && v.persTokenId) ids.add(v.persTokenId);
    });
    return Array.from(ids);
  }

  function createBodySwapReplacement(doc, snippet, location, mode) {
    const ownerDoc = doc || document;
    const swapMode = mode === 'plain' ? 'plain' : 'token';
    const slot = snippetSlotForLocation(snippet, location);
    if (slot.contentSource === 'personalization') {
      const token = findPersTokenById(slot.persTokenId);
      if (!token) return null;
      if (swapMode === 'token') {
        const html =
          typeof window.gemGeneratePersonalizationTokenHTML === 'function'
            ? window.gemGeneratePersonalizationTokenHTML(token)
            : null;
        if (!html) return null;
        const tpl = ownerDoc.createElement('div');
        tpl.innerHTML = html;
        return tpl.firstElementChild;
      }
      const plain =
        typeof window.gemBuildPersonalizationPreview === 'function'
          ? window.gemBuildPersonalizationPreview(token)
          : '';
      return ownerDoc.createTextNode(plain || '');
    }
    const content = slot.content;
    if (swapMode === 'token') {
      return createCustEslTokenSpan(ownerDoc, snippet.name || 'ESL snippet', content);
    }
    return ownerDoc.createTextNode(content);
  }
  function packLocationBits(locations) {
    return SWAP_LOCATIONS.reduce((bits, loc, i) => (locations.includes(loc) ? bits | (1 << i) : bits), 0);
  }
  function unpackSnippetVariantRow(row) {
    if (!Array.isArray(row) || typeof row[0] !== 'number') return null;
    const locations = SWAP_LOCATIONS.filter((_, i) => row[0] & (1 << i));
    if (row[2] === 'p' || row[2] === 'personalization') {
      const persTokenId = String(row[3] || '').trim();
      if (!persTokenId) return null;
      return { locations, contentSource: 'personalization', persTokenId, content: '' };
    }
    return {
      locations,
      contentSource: 'code',
      persTokenId: '',
      content: String(row[1] ?? ''),
    };
  }

  function unpackSnippetVariants(rows) {
    if (!Array.isArray(rows)) return [];
    return normalizeSnippetVariants(rows.map(unpackSnippetVariantRow));
  }

  function packSnippetVariantRow(variant) {
    const bits = packLocationBits(variant.locations);
    if (variant.contentSource === 'personalization') {
      return [bits, '', 'p', String(variant.persTokenId || '').trim()];
    }
    return [bits, variant.content];
  }

  function isPackedMainPersSource(row) {
    return (
      Array.isArray(row) &&
      row.length === 2 &&
      (row[0] === 'p' || row[0] === 'personalization') &&
      typeof row[1] === 'string'
    );
  }

  function unpackSnippetMainSource(arr) {
    const raw = isPackedMainPersSource(arr[8]) ? arr[8] : isPackedMainPersSource(arr[7]) ? arr[7] : null;
    if (raw) {
      const persTokenId = String(raw[1] || '').trim();
      if (persTokenId) {
        return { contentSource: 'personalization', persTokenId, content: '' };
      }
    }
    return {
      contentSource: 'code',
      persTokenId: '',
      content: String(arr[1] ?? ''),
    };
  }

  function unpackSnippetVariantRows(arr) {
    if (!Array.isArray(arr[7]) || isPackedMainPersSource(arr[7])) return [];
    return arr[7];
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
          .map((k) => {
            const row = [
              normInitiateFrom(k.initiateFrom),
              String(k.keyword).trim(),
              normMatchRule(k.matchRule),
              normMode(k.mode)
            ];
            const locationBits = packSwapLocations(k.locations);
            if (locationBits !== null) row.push(locationBits);
            return row;
          })
      : [];
    const descRaw = trimBoth(String(s.description ?? '')).slice(0, 200);
    const desc = descRaw === '' ? 0 : descRaw;
    const name = String(s.name ?? '').slice(0, 100);
    const root = normalizeSnippetRootFields(s);
    const row = [
      categoryIndex,
      root.content,
      desc,
      s.favorite ? 1 : 0,
      String(s.id ?? ''),
      name,
      swapKeywords
    ];
    const variants = normalizeSnippetVariants(s.variants);
    if (variants.length) row.push(variants.map(packSnippetVariantRow));
    if (root.contentSource === 'personalization' && root.persTokenId) {
      row.push(['p', root.persTokenId]);
    }
    return row;
  }

  function unpackSnippetV1(arr) {
    if (!Array.isArray(arr) || arr.length < 7) return null;
    const swapKeywords = Array.isArray(arr[6])
      ? arr[6].map(unpackSwapKeywordRow).filter(Boolean)
      : [];
    const descVal = arr[2];
    const description = (descVal === 0 || descVal === '0') ? '' : String(descVal ?? '');
    const main = unpackSnippetMainSource(arr);
    return {
      category: String(arr[0] ?? ''),
      content: main.content,
      contentSource: main.contentSource,
      persTokenId: main.persTokenId,
      description,
      favorite: arr[3] === 1,
      id: String(arr[4] ?? ''),
      name: String(arr[5] ?? ''),
      swapKeywords,
      variants: unpackSnippetVariants(unpackSnippetVariantRows(arr))
    };
  }

  function unpackSnippetV2(arr, categories) {
    if (!Array.isArray(arr) || arr.length < 7 || !Array.isArray(categories)) return null;
    const categoryIdx = typeof arr[0] === 'number' ? arr[0] : 0;
    const category = categories[categoryIdx] ?? '';
    const swapKeywords = Array.isArray(arr[6])
      ? arr[6].map(unpackSwapKeywordRow).filter(Boolean)
      : [];
    const descVal = arr[2];
    const description = (descVal === 0 || descVal === '0') ? '' : String(descVal ?? '');
    const main = unpackSnippetMainSource(arr);
    return {
      category,
      content: main.content,
      contentSource: main.contentSource,
      persTokenId: main.persTokenId,
      description,
      favorite: arr[3] === 1,
      id: String(arr[4] ?? ''),
      name: String(arr[5] ?? ''),
      swapKeywords,
      variants: unpackSnippetVariants(unpackSnippetVariantRows(arr))
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
        ? LZString.compressToBase64(json)
        : json;
      const chunks = chunk(compressed || json, CHUNK_SIZE);
      if (chunks.length === 0) chunks.push('');
      if (chunks.length > MAX_CHUNKS) {
        const err = new Error('Snippets storage full');
        if (callback) callback(err);
        return;
      }
      const meta = { v: FORMAT_VERSION, c: chunks.length };
      if (typeof LZString !== 'undefined') meta.enc = 'b64';
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
        let decompressed;
        if (typeof LZString !== 'undefined') {
          decompressed = meta.enc === 'b64'
            ? LZString.decompressFromBase64(combined)
            : LZString.decompressFromUTF16(combined);
        } else {
          decompressed = combined;
        }
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

  // Emarsys cust_esl tokens store Unicode in script (e.g. U+00A0), not HTML entity names like &nbsp;.
  const CUST_ESL_TOKEN_TEMPLATE = '%22%3C%25=%20script%20%25%3E%22';
  const CUST_ESL_TOKEN_META = '%7B%7D';

  function decodeHtmlEntitiesInEslScript(script) {
    const source = String(script ?? '');
    if (!source.includes('&')) return source;
    return source.replace(/&(#(?:x[0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]*);/g, (entity, body) => {
      if (body.charCodeAt(0) === 35) {
        const isHex = body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88;
        const num = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!Number.isFinite(num) || num < 0) return entity;
        try {
          return String.fromCodePoint(num);
        } catch (_) {
          return entity;
        }
      }
      const name = body.toLowerCase();
      const map = {
        nbsp: '\u00A0',
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      };
      return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : entity;
    });
  }

  function encodeCustEslTokenContentJson(json) {
    return String(json)
      .replace(/%/g, '%25')
      .replace(/ /g, '%20')
      .replace(/\{/g, '%7B')
      .replace(/\|/g, '%7C')
      .replace(/\}/g, '%7D')
      .replace(/\\/g, '%5C')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/"/g, '%22');
  }

  function buildCustEslTokenContentAttribute(script) {
    const normalized = decodeHtmlEntitiesInEslScript(script);
    return encodeCustEslTokenContentJson(JSON.stringify({ script: normalized }));
  }

  function generateCustEslTokenHtml(name, script) {
    const encodedTokenContent = buildCustEslTokenContentAttribute(script);
    const label = String(name ?? '');
    return `<span e-token="cust_esl" token-template="${CUST_ESL_TOKEN_TEMPLATE}" token-content="${encodedTokenContent}" token-meta="${CUST_ESL_TOKEN_META}" class="cbNonEditable" contenteditable="false">${label}</span>`;
  }

  function createCustEslTokenSpan(doc, name, script) {
    const ownerDoc = doc || document;
    const encodedTokenContent = buildCustEslTokenContentAttribute(script);
    const span = ownerDoc.createElement('span');
    span.setAttribute('e-token', 'cust_esl');
    span.setAttribute('token-template', CUST_ESL_TOKEN_TEMPLATE);
    span.setAttribute('token-content', encodedTokenContent);
    span.setAttribute('token-meta', CUST_ESL_TOKEN_META);
    span.setAttribute('contenteditable', 'false');
    span.className = 'cbNonEditable';
    span.textContent = String(name ?? '');
    return span;
  }

  window.gemSwapLocations = {
    ALL: SWAP_LOCATIONS.slice(),
    normalize: normalizeSwapLocations,
    allows: swapRuleAllowsLocation
  };
  window.gemCustEslToken = {
    normalizeScript: decodeHtmlEntitiesInEslScript,
    buildTokenContentAttribute: buildCustEslTokenContentAttribute,
    generateSnippetHTML: generateCustEslTokenHtml,
    createSpan: createCustEslTokenSpan,
    TOKEN_TEMPLATE: CUST_ESL_TOKEN_TEMPLATE,
    TOKEN_META: CUST_ESL_TOKEN_META,
  };
  window.gemSnippetVariants = {
    normalize: normalizeSnippetVariants,
    contentFor: snippetContentForLocation,
    slotForLocation: snippetSlotForLocation,
  };
  window.gemSnippetSource = {
    normalizeContentSource,
    normalizeRoot: normalizeSnippetRootFields,
    slotForLocation: snippetSlotForLocation,
    plainForLocation: snippetContentForLocation,
    persTokenIds: snippetPersTokenIds,
    persTokenDisplayName,
    findPersTokenById,
    createBodySwapReplacement,
  };
  window.gemLoadSnippets = loadSnippets;
  window.gemSaveSnippets = saveSnippets;
  window.gemNeedsMigration = needsMigration;
  window.gemGenerateSnippetId = generateSnippetId;
})();
