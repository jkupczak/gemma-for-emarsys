console.log('[Gem] magic-fill-dom-utils.js loaded');

// Shared parsing/matching helpers for the Magic Fill panel. Reuses the
// scanning primitives in find-replace-dom-utils.js (buildMatcher,
// processHtmlOrTextContent, scanEmailBody, markEmailBodyDirty) so replacement
// behavior — HTML-vs-text detection, skipping existing personalization
// tokens, Emarsys dirty-state nudging — stays consistent with Find and
// Replace instead of being reimplemented here.
(function () {
  'use strict';

  const PLACEHOLDER_REGEX = /\[\[([A-Za-z0-9_]+)\]\]/g;

  function parseMagicFillJson(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return { ok: false, error: 'Paste a JSON object to continue.' };

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${e.message}` };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'The JSON must be an object, e.g. {"subject": "..."}.' };
    }
    if (!Object.keys(parsed).length) {
      return { ok: false, error: 'The JSON object is empty.' };
    }

    return { ok: true, data: parsed };
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  // Nested-by-language only when every top-level value is itself an object,
  // e.g. { "en-US": { "subject": "..." }, "pt-BR": { "subject": "..." } }.
  function isLanguageNested(data) {
    const values = Object.values(data || {});
    return values.length > 0 && values.every(isPlainObject);
  }

  function normalizeLanguageKey(key) {
    return String(key ?? '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');
  }

  // Merge field values must be primitives that can be inserted as text.
  function stringifyFieldValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }

  function normalizeFieldMap(fields) {
    const out = {};
    const byLower = new Map();
    const skipped = [];
    const duplicateKeys = [];

    Object.keys(fields || {}).forEach((key) => {
      const str = stringifyFieldValue(fields[key]);
      if (str === null) {
        skipped.push(key);
        return;
      }
      const lower = String(key).toLowerCase();
      if (byLower.has(lower)) {
        duplicateKeys.push(key);
        return;
      }
      byLower.set(lower, key);
      out[key] = str;
    });

    return { fields: out, byLower, skipped, duplicateKeys };
  }

  function extractPlaceholderKeysInto(text, into) {
    if (!text) return;
    const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
    let match;
    while ((match = re.exec(text)) !== null) {
      const lower = match[1].toLowerCase();
      if (!into.has(lower)) into.set(lower, match[1]);
    }
  }

  function extractPlaceholdersFromPreviewDoc(previewDoc, into) {
    const fr = window.gemFindReplaceDom;
    if (!previewDoc || !fr) return;

    const roots = new Set();
    try {
      previewDoc.querySelectorAll('[contenteditable="true"]').forEach((el) => roots.add(el));
      previewDoc.querySelectorAll('[e-editable]').forEach((el) => {
        if (el.tagName !== 'IMG') roots.add(el);
      });
    } catch (_) {
      return;
    }

    roots.forEach((root) => {
      try {
        const walker = previewDoc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            if (fr.isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        let node;
        while ((node = walker.nextNode())) {
          extractPlaceholderKeysInto(node.nodeValue, into);
        }
      } catch (_) {}
    });
  }

  // Returns a Map of lowercased key -> first-seen display casing, for every
  // [[key]]-shaped placeholder found in the given scopes.
  function collectPlaceholdersInScopes({ subjectText, previewText, previewDoc } = {}) {
    const found = new Map();
    extractPlaceholderKeysInto(subjectText, found);
    extractPlaceholderKeysInto(previewText, found);
    extractPlaceholdersFromPreviewDoc(previewDoc, found);
    return found;
  }

  function buildMagicFillMatcher(key) {
    const dom = window.gemFindReplaceDom;
    if (!dom || typeof dom.buildMatcher !== 'function') return null;
    return dom.buildMatcher({
      findText: `[[${key}]]`,
      isRegex: false,
      matchCase: false,
      wholeWord: false,
    });
  }

  function getSelectedLanguageValue() {
    if (typeof window.gemGetSelectedLanguageValue === 'function') {
      return window.gemGetSelectedLanguageValue();
    }
    try {
      const selector = document.querySelector('vce-languages-selector');
      if (!selector) return null;
      const selected = selector.querySelector(
        'e-select-option[selected="true"], e-select-option[selected="selected"]'
      );
      if (selected) return selected.getAttribute('value') || selected.id || null;
      const hidden = selector.querySelector('input[type="hidden"]');
      if (hidden && hidden.value) return hidden.value;
      return null;
    } catch (_) {
      return null;
    }
  }

  function getCampaignLanguages() {
    if (typeof window.gemGetCampaignLanguages === 'function') {
      return window.gemGetCampaignLanguages() || [];
    }
    try {
      const selector = document.querySelector('vce-languages-selector');
      if (!selector) return [];
      return Array.from(selector.querySelectorAll('e-select-option'))
        .map((opt) => {
          const value = String(opt.getAttribute('value') || opt.id || '').trim();
          return value ? { value, label: value } : null;
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function findCampaignLanguageForJsonKey(jsonKey, campaignLanguages) {
    const norm = normalizeLanguageKey(jsonKey);
    if (!norm) return null;
    return (
      (campaignLanguages || []).find((lang) => normalizeLanguageKey(lang.value) === norm) || null
    );
  }

  // Builds the list of language jobs to scan/apply. Flat JSON → one job for the
  // current editor. Nested JSON → one job per JSON language key that matches a
  // campaign language; unmatched JSON language keys are returned separately.
  function resolvePayload(rawJson) {
    const parsed = parseMagicFillJson(rawJson);
    if (!parsed.ok) return parsed;

    const languageValue = getSelectedLanguageValue();
    const campaignLanguages = getCampaignLanguages();

    if (!isLanguageNested(parsed.data)) {
      const normalized = normalizeFieldMap(parsed.data);
      if (!Object.keys(normalized.fields).length) {
        return {
          ok: false,
          error: 'No usable string/number/boolean values found in the JSON object.',
          skipped: normalized.skipped,
          duplicateKeys: normalized.duplicateKeys,
        };
      }
      return {
        ok: true,
        isNested: false,
        languageValue,
        unmatchedJsonLanguages: [],
        jobs: [
          {
            jsonKey: null,
            campaignValue: languageValue,
            label: languageValue || 'Current language',
            fields: normalized.fields,
            byLower: normalized.byLower,
            skipped: normalized.skipped,
            duplicateKeys: normalized.duplicateKeys,
          },
        ],
      };
    }

    const jobs = [];
    const unmatchedJsonLanguages = [];

    Object.keys(parsed.data).forEach((jsonKey) => {
      const campaignLang = findCampaignLanguageForJsonKey(jsonKey, campaignLanguages);
      if (!campaignLang) {
        unmatchedJsonLanguages.push(jsonKey);
        return;
      }

      const normalized = normalizeFieldMap(parsed.data[jsonKey]);
      jobs.push({
        jsonKey,
        campaignValue: campaignLang.value,
        label: campaignLang.label || campaignLang.value,
        fields: normalized.fields,
        byLower: normalized.byLower,
        skipped: normalized.skipped,
        duplicateKeys: normalized.duplicateKeys,
      });
    });

    if (!jobs.length) {
      return {
        ok: false,
        isNested: true,
        unmatchedJsonLanguages,
        error: languageValue
          ? `This JSON is organized by language, but none of its keys match a language on this campaign. Current language: "${languageValue}".`
          : 'This JSON is organized by language, but none of its keys match a language on this campaign.',
      };
    }

    // Prefer scanning/applying the currently open language first, then the rest
    // in campaign-selector order.
    const currentNorm = normalizeLanguageKey(languageValue);
    jobs.sort((a, b) => {
      const aCurrent = normalizeLanguageKey(a.campaignValue) === currentNorm ? 0 : 1;
      const bCurrent = normalizeLanguageKey(b.campaignValue) === currentNorm ? 0 : 1;
      if (aCurrent !== bCurrent) return aCurrent - bCurrent;
      const aIdx = campaignLanguages.findIndex((l) => l.value === a.campaignValue);
      const bIdx = campaignLanguages.findIndex((l) => l.value === b.campaignValue);
      return (aIdx < 0 ? 999 : aIdx) - (bIdx < 0 ? 999 : bIdx);
    });

    return {
      ok: true,
      isNested: true,
      languageValue,
      unmatchedJsonLanguages,
      jobs,
    };
  }

  window.gemMagicFillDom = {
    PLACEHOLDER_REGEX,
    parseMagicFillJson,
    isLanguageNested,
    normalizeLanguageKey,
    normalizeFieldMap,
    collectPlaceholdersInScopes,
    buildMagicFillMatcher,
    getSelectedLanguageValue,
    getCampaignLanguages,
    findCampaignLanguageForJsonKey,
    resolvePayload,
    // Back-compat aliases used during rename; safe to remove later.
    parseMergeFieldsJson: parseMagicFillJson,
    buildMergeFieldMatcher: buildMagicFillMatcher,
  };
})();
