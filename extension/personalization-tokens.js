console.log('[Gem] personalization-tokens.js loaded');

(function () {
  'use strict';

  const PINNED_STORAGE_KEY = 'gemPinnedPersTokens';
  const RECENT_CACHE_KEY = 'gemPersTokenRecentCache';
  const MAX_RECENT_CACHE = 50;
  const PREDEFINED_CONTACT_CATEGORIES = ['general', 'personal', 'company', 'other'];

  let sessionTokens = null;
  let sessionRdsPresetMap = null;
  let sessionFetchPromise = null;

  function escapeHtmlAttribute(value) {
    return String(value)
      .replace(/%/g, '%25')
      .replace(/&/g, '&amp;')
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

  function getSessionId() {
    try {
      return (new URL(window.location.href).searchParams.get('session_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getCustomerIdFromPageConfig() {
    try {
      if (window.e && window.e.config && window.e.config.customerId != null) {
        return String(window.e.config.customerId).trim();
      }
      if (window.e && window.e.utils && typeof window.e.utils.getCurrentConfig === 'function') {
        const cfg = window.e.utils.getCurrentConfig();
        if (cfg && cfg.customerId != null) {
          return String(cfg.customerId).trim();
        }
      }
      if (window.contentBlocks && window.contentBlocks.config && window.contentBlocks.config.customerId != null) {
        return String(window.contentBlocks.config.customerId).trim();
      }
    } catch (_) {}
    return '';
  }

  function getCustomerIdFromDom() {
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes('customerId')) continue;

        const contentBlocksMatch = text.match(
          /contentBlocks\.config\s*=\s*\{[\s\S]*?customerId\s*:\s*['"]?(\d+)['"]?/
        );
        if (contentBlocksMatch) {
          return contentBlocksMatch[1];
        }

        const eConfigMatch = text.match(
          /window\.e\.config\s*=\s*\{[\s\S]*?"customerId"\s*:\s*(\d+)/
        );
        if (eConfigMatch) {
          return eConfigMatch[1];
        }

        const jwtUrlMatch = text.match(
          /personalization-editor\.gservice\.emarsys\.net[^"']*customer_id=(\d+)/
        );
        if (jwtUrlMatch) {
          return jwtUrlMatch[1];
        }

        const twigValidateMatch = text.match(
          /personalization-editor\.gservice\.emarsys\.net\/customer\/(\d+)\/validate/
        );
        if (twigValidateMatch) {
          return twigValidateMatch[1];
        }
      }
    } catch (_) {}
    return '';
  }

  function decodeJwtPayload(token) {
    const parts = String(token || '').trim().split('.');
    if (parts.length < 2) return null;
    try {
      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = payload.length % 4;
      if (pad) payload += '='.repeat(4 - pad);
      return JSON.parse(atob(payload));
    } catch (_) {
      return null;
    }
  }

  function getCustomerIdFromJwt(token) {
    const payload = decodeJwtPayload(token);
    if (!payload) return '';
    if (payload.customerId != null) {
      return String(payload.customerId).trim();
    }
    return '';
  }

  function getCustomerId() {
    return getCustomerIdFromPageConfig() || getCustomerIdFromDom();
  }

  function resolveCustomerId(sessionId) {
    const cached = getCustomerId();
    if (cached) {
      return Promise.resolve({ customerId: cached, authToken: null, source: 'page' });
    }

    if (!sessionId || typeof window.gemFetchGserviceToken !== 'function') {
      return Promise.resolve({ customerId: '', authToken: null, source: 'none' });
    }

    return window.gemFetchGserviceToken(sessionId, 'personalization-editor').then((token) => {
      if (!token) {
        return { customerId: '', authToken: null, source: 'none' };
      }
      const fromJwt = getCustomerIdFromJwt(token);
      if (fromJwt) {
        return { customerId: fromJwt, authToken: token, source: 'jwt' };
      }
      return { customerId: '', authToken: token, source: 'none' };
    });
  }

  function normalizeRdsPreset(preset) {
    if (!preset || typeof preset !== 'object') return null;
    const id = String(preset._id || '').trim();
    if (!id) return null;
    return {
      _id: id,
      name: String(preset.name || '').trim(),
      connection: String(preset.connection || '').trim(),
      connection_id: preset.connection_id != null ? String(preset.connection_id) : '',
      view: String(preset.view || '').trim(),
      parameters: Array.isArray(preset.parameters) ? preset.parameters : [],
    };
  }

  function buildPresetDataFromRdsPreset(preset) {
    const normalized = normalizeRdsPreset(preset);
    if (!normalized) return null;
    return {
      name: normalized.name,
      connection: normalized.connection,
      connection_id: normalized.connection_id,
      view: normalized.view,
      parameters: normalized.parameters.map((p) => ({ ...p })),
    };
  }

  function buildRdsPresetMap(presets) {
    const map = new Map();
    (Array.isArray(presets) ? presets : []).forEach((preset) => {
      const normalized = normalizeRdsPreset(preset);
      if (normalized) {
        map.set(normalized._id, normalized);
      }
    });
    return map;
  }

  function getSessionRdsPresetMap() {
    return sessionRdsPresetMap || new Map();
  }

  function enrichTokenWithRdsPresets(token, presetMap) {
    const normalized = normalizePersToken(token);
    if (!normalized) return null;
    if (String(normalized.source || '').toLowerCase() !== 'rds') {
      return normalized;
    }

    const content = normalized.content || {};
    if (content.preset_data) {
      return normalized;
    }

    const presetId = String(content.preset_id || '').trim();
    if (!presetId) {
      return normalized;
    }

    const preset = (presetMap || getSessionRdsPresetMap()).get(presetId);
    if (!preset) {
      return normalized;
    }

    const presetData = buildPresetDataFromRdsPreset(preset);
    if (!presetData) {
      return normalized;
    }

    normalized.content = {
      ...content,
      preset_data: presetData,
    };
    return normalized;
  }

  function mergePersTokenWithSources(token, sources) {
    const normalized = normalizePersToken(token);
    if (!normalized) return null;
    const id = normalized._id;
    const candidates = [];

    (Array.isArray(sources) ? sources : []).forEach((entry) => {
      if (!entry) return;
      if (Array.isArray(entry)) {
        const hit = entry.find((t) => t && String(t._id) === id);
        if (hit) candidates.push(hit);
        return;
      }
      if (typeof entry !== 'object') return;
      if (String(entry._id) === id) {
        candidates.push(entry);
        return;
      }
      if (entry[id]) {
        candidates.push(entry[id]);
      }
    });

    for (const candidate of candidates) {
      const cached = normalizePersToken(candidate);
      if (!cached) continue;
      if (cached.content?.preset_data && !normalized.content?.preset_data) {
        normalized.content = { ...normalized.content, ...cached.content };
      }
      if (!normalized.code && cached.code) {
        normalized.code = cached.code;
      }
    }
    return enrichTokenWithRdsPresets(normalized, getSessionRdsPresetMap());
  }

  function normalizePersToken(token) {
    if (!token || typeof token !== 'object') return null;
    const id = String(token._id || '').trim();
    if (!id) return null;
    const normalized = {
      _id: id,
      name: String(token.name || '').trim() || id,
      source: token.source || '',
      content: token.content && typeof token.content === 'object' ? token.content : {},
      code: token.code != null ? String(token.code) : '',
      filters:
        token.filters && typeof token.filters === 'object'
          ? token.filters
          : { fallback: '', modifier: '', required: false, index: 0 },
      use_cases: Array.isArray(token.use_cases) ? token.use_cases : [],
      created_at: token.created_at || '',
      updated_at: token.updated_at || '',
    };
    if (token.predefined === true) {
      normalized.predefined = true;
    }
    if (token.displayName != null && String(token.displayName).trim()) {
      normalized.displayName = String(token.displayName).trim();
    }
    if (token.contactCategory != null && String(token.contactCategory).trim()) {
      normalized.contactCategory = String(token.contactCategory).trim();
    }
    if (token.string_id != null && String(token.string_id).trim()) {
      normalized.string_id = String(token.string_id).trim();
    }
    if (token.application_type != null && String(token.application_type).trim()) {
      normalized.application_type = String(token.application_type).trim();
    }
    return normalized;
  }

  function titleCaseCategory(key) {
    return String(key || '')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function normalizePredefinedContactField(categoryKey, field) {
    if (!field || typeof field !== 'object') return null;
    const fieldId = field.id;
    if (fieldId == null || fieldId === '') return null;
    const category = String(categoryKey || '').trim().toLowerCase();
    const name = String(field.name || '').trim();
    if (!name) return null;
    const categoryLabel = titleCaseCategory(category);
    const id = `predefined:${category}:${fieldId}`;
    return normalizePersToken({
      _id: id,
      name,
      displayName: `${categoryLabel} > ${name}`,
      predefined: true,
      source: 'contact',
      content: { field: fieldId },
      code: `{{ contact.${fieldId} }}`,
      filters: { fallback: '', modifier: '', required: false, index: 0 },
      contactCategory: category,
      string_id: field.string_id,
      application_type: field.application_type,
    });
  }

  function flattenContactSources(sources) {
    if (!sources || typeof sources !== 'object') return [];
    const tokens = [];
    PREDEFINED_CONTACT_CATEGORIES.forEach((categoryKey) => {
      const fields = sources[categoryKey];
      if (!Array.isArray(fields)) return;
      fields.forEach((field) => {
        const normalized = normalizePredefinedContactField(categoryKey, field);
        if (normalized) tokens.push(normalized);
      });
    });
    return tokens;
  }

  function appendDefaultFilter(preview, filters) {
    const fallback = filters && filters.fallback != null ? String(filters.fallback) : '';
    if (!fallback) return preview;
    const escaped = fallback.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `${preview} | default('${escaped}')`;
  }

  function formatRdsParameters(parameters) {
    if (!Array.isArray(parameters) || !parameters.length) return '';
    return parameters
      .map((p) => {
        if (!p || p.value == null) return '';
        return String(p.value).trim();
      })
      .filter(Boolean)
      .join(', ');
  }

  function buildRdsPreview(token) {
    const enriched = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!enriched) return null;
    const content = enriched.content || {};
    const presetData = content.preset_data;
    const fieldName = content.field_name || enriched.name;
    if (!presetData || !presetData.connection || !presetData.view) {
      return null;
    }
    const connection = presetData.connection;
    const view = presetData.view;
    const params = formatRdsParameters(presetData.parameters);
    let preview = `{{ rds.${connection}.${view}(${params})[0].${fieldName} }}`;
    return appendDefaultFilter(preview, enriched.filters);
  }

  function buildEventPreview(token) {
    const content = token.content || {};
    const variable = content.variable;
    if (!variable) return null;
    let preview = `{{ ${variable} }}`;
    return appendDefaultFilter(preview, token.filters);
  }

  function buildContactPreview(token) {
    const content = token.content || {};
    const fieldId = content.field_id || content.fieldId || content.field;
    if (fieldId == null || fieldId === '') return null;
    let preview = `{{ contact.${fieldId} }}`;
    return appendDefaultFilter(preview, token.filters);
  }

  function buildCodePreview(token) {
    const code = token.code != null ? String(token.code).trim() : '';
    if (!code) return null;
    if (code.startsWith('{{') && code.endsWith('}}')) {
      return appendDefaultFilter(code, token.filters);
    }
    return appendDefaultFilter(`{{ ${code} }}`, token.filters);
  }

  function buildPersonalizationPreview(token) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized) return null;

    const source = String(normalized.source || '').toLowerCase();
    let preview = null;

    if (source === 'rds') {
      preview = buildRdsPreview(normalized);
    } else if (source === 'event') {
      preview = buildEventPreview(normalized);
    } else if (source === 'contact') {
      preview = buildContactPreview(normalized);
    }

    if (!preview) {
      preview = buildCodePreview(normalized);
    }

    return preview;
  }

  function buildTokenMeta(token, preview) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized) return null;
    return {
      tokenName: normalized.name,
      type: 'personalization',
      token: normalized,
      preview: preview || '',
    };
  }

  function encodeBase64Utf8(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (_) {
      try {
        const bytes = new TextEncoder().encode(String(str));
        let binary = '';
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        return btoa(binary);
      } catch (err) {
        console.warn('[Gem] Personalization token base64 encode failed:', err);
        return null;
      }
    }
  }

  function buildPersonalizationCodeMirrorToken(token) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized) return null;

    const preview = buildPersonalizationPreview(normalized);
    if (!preview) return null;

    const meta = buildTokenMeta(normalized, preview);
    if (!meta) return null;

    const metaJson = JSON.stringify(meta);
    const metaB64 = encodeBase64Utf8(metaJson);
    if (!metaB64) return null;

    return `{# pers-token:1 ${metaB64} #}${preview}{# pers-token:1 #}`;
  }

  function generatePersonalizationTokenHTML(token) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized) return null;

    const preview = buildPersonalizationPreview(normalized);
    if (!preview) return null;

    const meta = buildTokenMeta(normalized, preview);
    if (!meta) return null;

    const metaJson = JSON.stringify(meta);
    const wrappedContent = buildPersonalizationCodeMirrorToken(token);
    if (!wrappedContent) return null;

    const tokenContentObj = { a: wrappedContent };
    const encodedTokenContent = escapeHtmlAttribute(JSON.stringify(tokenContentObj));
    const encodedTokenTemplate = '%22%3C%25=%20a%20%25%3E%22';
    const encodedTokenMeta = escapeHtmlAttribute(metaJson);
    const displayName = normalized.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<span e-token="personalization" token-template="${encodedTokenTemplate}" token-content="${encodedTokenContent}" token-meta="${encodedTokenMeta}" class="cbNonEditable cb-token" contenteditable="false">${displayName}</span>`;
  }

  function toMenuItem(token, pinnedIds) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized) return null;
    const id = normalized._id;
    return {
      kind: 'personalization',
      persOrigin: normalized.predefined ? 'predefined' : 'custom',
      id,
      name: normalized.displayName || normalized.name,
      token: normalized,
      pinned: pinnedIds.has(id),
      content: buildPersonalizationPreview(normalized) || '',
    };
  }

  function ensurePersonalizationTokensLoaded() {
    if (sessionTokens !== null) {
      return Promise.resolve(sessionTokens);
    }
    if (sessionFetchPromise) {
      return sessionFetchPromise;
    }

    const sessionId = getSessionId();
    if (!sessionId || typeof window.gemFetchPersonalizationTokenList !== 'function') {
      if (!sessionId) {
        console.warn('[Gem] Personalization tokens: missing session_id in URL');
      }
      sessionTokens = [];
      return Promise.resolve(sessionTokens);
    }

    sessionFetchPromise = resolveCustomerId(sessionId)
      .then(({ customerId, authToken, source }) => {
        if (!customerId) {
          console.warn(
            '[Gem] Personalization tokens: could not resolve customerId (session_id present:',
            !!sessionId,
            ')'
          );
          sessionTokens = [];
          sessionFetchPromise = null;
          return sessionTokens;
        }

        console.log(
          '[Gem] Personalization tokens: fetching lists for customer',
          customerId,
          '(source:',
          source + ')'
        );

        const fetchPresets =
          typeof window.gemFetchRdsPresetList === 'function'
            ? window.gemFetchRdsPresetList(customerId, sessionId, authToken)
            : Promise.resolve({ ok: false, results: [] });

        const fetchContactSources =
          typeof window.gemFetchContactSourceList === 'function'
            ? window.gemFetchContactSourceList(customerId, sessionId, authToken)
            : Promise.resolve({ ok: false, sources: null });

        return Promise.all([
          window.gemFetchPersonalizationTokenList(customerId, sessionId, authToken),
          fetchPresets,
          fetchContactSources,
        ]).then(([tokenRes, presetRes, contactRes]) => {
          if (presetRes && presetRes.ok && Array.isArray(presetRes.results)) {
            sessionRdsPresetMap = buildRdsPresetMap(presetRes.results);
            console.log('[Gem] Personalization RDS presets: loaded', sessionRdsPresetMap.size, 'presets');
          } else {
            sessionRdsPresetMap = new Map();
            if (presetRes && presetRes.reason) {
              console.warn('[Gem] Personalization RDS preset list fetch failed:', presetRes.reason, presetRes);
            }
          }

          let predefinedTokens = [];
          if (contactRes && contactRes.ok && contactRes.sources) {
            predefinedTokens = flattenContactSources(contactRes.sources);
            console.log(
              '[Gem] Predefined contact tokens: loaded',
              predefinedTokens.length,
              'fields'
            );
          } else if (contactRes && contactRes.reason) {
            console.warn(
              '[Gem] Predefined contact source list fetch failed:',
              contactRes.reason,
              contactRes
            );
          }

          let customTokens = [];
          if (tokenRes && tokenRes.ok && Array.isArray(tokenRes.results)) {
            customTokens = tokenRes.results
              .map((raw) => enrichTokenWithRdsPresets(normalizePersToken(raw), sessionRdsPresetMap))
              .filter(Boolean);
            console.log('[Gem] Custom personalization tokens: loaded', customTokens.length, 'tokens');
          } else {
            console.warn('[Gem] Personalization token list fetch failed:', tokenRes?.reason || 'unknown', tokenRes);
          }

          sessionTokens = [...predefinedTokens, ...customTokens];
          console.log(
            '[Gem] Personalization tokens: loaded',
            predefinedTokens.length,
            'predefined,',
            customTokens.length,
            'custom'
          );
          sessionFetchPromise = null;
          return sessionTokens;
        });
      })
      .catch((err) => {
        console.warn('[Gem] Personalization token list fetch error:', err);
        sessionTokens = [];
        sessionFetchPromise = null;
        return sessionTokens;
      });

    return sessionFetchPromise;
  }

  function loadPinnedPersTokens(callback) {
    if (!chrome?.storage?.sync) {
      callback([]);
      return;
    }
    chrome.storage.sync.get({ [PINNED_STORAGE_KEY]: [] }, (res) => {
      const raw = res[PINNED_STORAGE_KEY];
      const list = Array.isArray(raw)
        ? raw.map(normalizePersToken).filter(Boolean)
        : [];
      callback(list);
    });
  }

  function savePinnedPersTokens(tokens, callback) {
    if (!chrome?.storage?.sync) {
      if (callback) callback();
      return;
    }
    const normalized = (Array.isArray(tokens) ? tokens : [])
      .map(normalizePersToken)
      .filter(Boolean);
    chrome.storage.sync.set({ [PINNED_STORAGE_KEY]: normalized }, () => {
      if (callback) callback(normalized);
    });
  }

  function togglePersTokenPinned(token, callback) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized) {
      if (callback) callback([]);
      return;
    }
    loadPinnedPersTokens((pinned) => {
      const id = normalized._id;
      const exists = pinned.some((t) => t._id === id);
      const next = exists
        ? pinned.filter((t) => t._id !== id)
        : [...pinned.filter((t) => t._id !== id), normalized];
      savePinnedPersTokens(next, callback);
    });
  }

  function cacheRecentPersToken(token, callback) {
    const normalized = enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
    if (!normalized || !chrome?.storage?.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get({ [RECENT_CACHE_KEY]: {} }, (res) => {
      const cache =
        res[RECENT_CACHE_KEY] && typeof res[RECENT_CACHE_KEY] === 'object'
          ? { ...res[RECENT_CACHE_KEY] }
          : {};
      cache[normalized._id] = normalized;
      const ids = Object.keys(cache);
      if (ids.length > MAX_RECENT_CACHE) {
        ids.slice(0, ids.length - MAX_RECENT_CACHE).forEach((key) => {
          delete cache[key];
        });
      }
      chrome.storage.local.set({ [RECENT_CACHE_KEY]: cache }, () => {
        if (callback) callback();
      });
    });
  }

  function loadRecentPersTokenCache(callback) {
    if (!chrome?.storage?.local) {
      callback({});
      return;
    }
    chrome.storage.local.get({ [RECENT_CACHE_KEY]: {} }, (res) => {
      const raw = res[RECENT_CACHE_KEY];
      const cache = raw && typeof raw === 'object' ? raw : {};
      callback(cache);
    });
  }

  function gemmaPrefixedId(id) {
    return `g:${String(id || '').trim()}`;
  }

  function persPrefixedId(id) {
    return `p:${String(id || '').trim()}`;
  }

  function parseRecentEntryId(entry) {
    const raw = String(entry || '').trim();
    if (!raw) return null;
    if (raw.startsWith('g:')) {
      return { kind: 'gemma', id: raw.slice(2) };
    }
    if (raw.startsWith('p:')) {
      return { kind: 'personalization', id: raw.slice(2) };
    }
    return { kind: 'gemma', id: raw };
  }

  window.gemMergePersTokenWithSources = mergePersTokenWithSources;
  window.gemEnrichPersTokenWithRdsPresets = function (token) {
    return enrichTokenWithRdsPresets(token, getSessionRdsPresetMap());
  };
  window.gemEnsurePersonalizationTokensLoaded = ensurePersonalizationTokensLoaded;
  window.gemGetPersonalizationSessionTokens = function () {
    return sessionTokens ? sessionTokens.slice() : [];
  };
  window.gemBuildPersonalizationPreview = buildPersonalizationPreview;
  window.gemBuildPersonalizationCodeMirrorToken = buildPersonalizationCodeMirrorToken;
  window.gemGeneratePersonalizationTokenHTML = generatePersonalizationTokenHTML;
  window.gemNormalizePersToken = normalizePersToken;
  window.gemLoadPinnedPersTokens = loadPinnedPersTokens;
  window.gemTogglePersTokenPinned = togglePersTokenPinned;
  window.gemCacheRecentPersToken = cacheRecentPersToken;
  window.gemLoadRecentPersTokenCache = loadRecentPersTokenCache;
  window.gemPersPrefixedId = persPrefixedId;
  window.gemGemmaPrefixedId = gemmaPrefixedId;
  window.gemParseRecentEntryId = parseRecentEntryId;
  window.gemToPersMenuItem = toMenuItem;
})();
