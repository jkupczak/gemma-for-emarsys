// esl-token-extractor.js — scan email fields for ESL scripts and token presentations
(function () {
  'use strict';

  const GEM_ESL_REGEX = /\{\{[^”“‘’}]+\}\}/g;
  const GEM_CM_TOKEN_BLOCK_RE =
    /\{# (?:pers-token:1|cond-token:1) ([^#]+) #\}([\s\S]*?)\{# (?:pers-token:1|cond-token:1) #\}/g;

  function normalizeEslScriptKey(script) {
    // Preserve exact script text (including trailing newlines in token payloads).
    return String(script ?? '');
  }

  function decodePersTokenMetaB64(encoded) {
    const raw = String(encoded || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch (_) {
      try {
        return JSON.parse(atob(raw));
      } catch (err) {
        return null;
      }
    }
  }

  function parseCodeMirrorTokensInHtml(html) {
    const source = String(html ?? '');
    const tokens = [];
    const re = new RegExp(GEM_CM_TOKEN_BLOCK_RE.source, 'g');
    let match;
    while ((match = re.exec(source)) !== null) {
      const encoded = match[1].trim();
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        encoded,
        preview: match[2],
        meta: decodePersTokenMetaB64(encoded),
        full: match[0],
      });
    }
    return tokens;
  }

  function parsePersTokensInHtml(html) {
    if (typeof window.gemParsePersTokensInHtml === 'function') {
      return window.gemParsePersTokensInHtml(html);
    }
    return parseCodeMirrorTokensInHtml(html);
  }

  function isGemmaMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.type === 'cust_esl') return true;
    if (meta.token && meta.token.type === 'cust_esl') return true;
    return false;
  }

  function isPersonalizationMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.type === 'personalization') return true;
    if (meta.token && meta.token.type === 'personalization') return true;
    return false;
  }

  function isPredefinedPersMeta(meta) {
    const token = meta && (meta.token || meta);
    if (!token || typeof token !== 'object') return false;
    if (token.predefined === true) return true;
    if (token.isPredefined === true) return true;
    if (String(token.source || '').toLowerCase() === 'contact') return true;
    return false;
  }

  function classifyPersMeta(meta) {
    if (isGemmaMeta(meta)) return 'gemma';
    if (isPersonalizationMeta(meta)) {
      return isPredefinedPersMeta(meta) ? 'pers_predefined' : 'pers_custom';
    }
    return 'plain';
  }

  function getScriptFromPersToken(token) {
    if (!token) return '';
    const script = token.meta?.token?.content?.script;
    if (script != null && String(script) !== '') {
      // Do not trim — trailing whitespace (e.g. "\n") is meaningful for uniqueness.
      return String(script);
    }
    return String(token.meta?.preview || token.preview || '').trim();
  }

  function decodeTokenContentAttribute(raw) {
    let value = String(raw || '').trim();
    if (!value) return null;

    if (value.includes('%')) {
      try {
        value = decodeURIComponent(value);
      } catch (_) {}
    }

    if (value.includes('&')) {
      const el = document.createElement('textarea');
      el.innerHTML = value;
      value = el.value;
    }

    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function decodeTokenContentJson(raw) {
    return decodeTokenContentAttribute(raw);
  }

  function extractBodyTokensFromRawHtml(rawHtml) {
    const out = [];
    const source = String(rawHtml || '');
    if (!source) return out;

    const patterns = [
      /\be-token=["'](cust_esl|personalization)["'][^>]*\btoken-content=["']([^"']+)["']/gi,
      /\btoken-content=["']([^"']+)["'][^>]*\be-token=["'](cust_esl|personalization)["']/gi,
    ];

    patterns.forEach((pattern, index) => {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(source)) !== null) {
        const tokenType = index === 0 ? match[1] : match[2];
        const contentRaw = index === 0 ? match[2] : match[1];
        const parsed = decodeTokenContentAttribute(contentRaw);
        if (!parsed || typeof parsed !== 'object') continue;

        let script = '';
        let presentation = tokenType === 'cust_esl' ? 'gemma' : 'pers_custom';

        if (tokenType === 'cust_esl') {
          script = parsed.script != null ? String(parsed.script) : '';
        } else {
          const wrappedRaw = parsed.a != null ? parsed.a : parsed.script;
          const wrapped = wrappedRaw != null ? String(wrappedRaw) : '';
          const innerTokens = wrapped ? parsePersTokensInHtml(wrapped) : [];
          if (innerTokens.length) {
            script = getScriptFromPersToken(innerTokens[0]);
            presentation = classifyPersMeta(innerTokens[0].meta);
          } else {
            script = wrapped;
          }
        }

        pushOccurrence(out, script, presentation, true, 'body');
      }
    });

    return out;
  }

  function getScriptFromBodyTokenSpan(span) {
    const tokenType = String(span.getAttribute('e-token') || '').trim();
    const contentRaw = span.getAttribute('token-content') || '';
    const parsed = decodeTokenContentAttribute(contentRaw);
    if (!parsed || typeof parsed !== 'object') return '';

    if (tokenType === 'cust_esl') {
      return parsed.script != null ? String(parsed.script) : '';
    }

    if (tokenType === 'personalization') {
      const wrappedRaw = parsed.a != null ? parsed.a : parsed.script;
      const wrapped = wrappedRaw != null ? String(wrappedRaw) : '';
      if (!wrapped) return '';
      const innerTokens = parsePersTokensInHtml(wrapped);
      if (innerTokens.length) {
        return getScriptFromPersToken(innerTokens[0]);
      }
      return wrapped;
    }

    return '';
  }

  function classifyBodyTokenSpan(span) {
    const tokenType = String(span.getAttribute('e-token') || '').trim();
    if (tokenType === 'cust_esl') return 'gemma';

    if (tokenType === 'personalization') {
      const contentRaw = span.getAttribute('token-content') || '';
      const parsed = decodeTokenContentAttribute(contentRaw);
      const wrapped = parsed && typeof parsed === 'object' ? String(parsed.a || '') : '';
      const innerTokens = wrapped ? parsePersTokensInHtml(wrapped) : [];
      if (innerTokens.length && innerTokens[0].meta) {
        return classifyPersMeta(innerTokens[0].meta);
      }
      const metaRaw = span.getAttribute('token-meta') || '';
      const meta = decodeTokenContentAttribute(metaRaw);
      if (meta) return classifyPersMeta(meta);
      return 'pers_custom';
    }

    return 'plain';
  }

  function isInEditableContext(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return !!el.closest('[e-editable]');
  }

  function pushOccurrence(out, script, presentation, editable, location) {
    if (script == null) return;
    const value = String(script);
    if (!value) return;
    out.push({
      script: value,
      presentation,
      editable: editable === true,
      location: location || 'body',
    });
  }

  function scanPlainEslInText(text, excludedRanges, editable, location) {
    const occurrences = [];
    const source = String(text || '');
    if (!source) return occurrences;

    const ranges = Array.isArray(excludedRanges) ? excludedRanges : [];
    const re = new RegExp(GEM_ESL_REGEX.source, 'g');
    let match;
    while ((match = re.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const insideExcluded = ranges.some(([rs, reEnd]) => start >= rs && end <= reEnd);
      if (insideExcluded) continue;
      pushOccurrence(occurrences, match[0], 'plain', editable, location);
    }
    return occurrences;
  }

  function isPreheaderElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('ems:preheader')) return true;
    if (el.hasAttribute('ems-preheader')) return true;
    return false;
  }

  function isInsidePreheader(node) {
    let cur = node;
    while (cur) {
      if (cur.nodeType === 1 && isPreheaderElement(cur)) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  function stripPreheaderBlocksFromRawHtml(rawHtml) {
    return String(rawHtml || '').replace(/<div\b[^>]*\bems:preheader\b[^>]*>[\s\S]*?<\/div>/gi, '');
  }

  function extractFromSubjectHtml(subjectHtml) {
    const out = [];
    const source = String(subjectHtml || '');
    if (!source) return out;

    const tokens = parseCodeMirrorTokensInHtml(source);
    tokens.forEach((token) => {
      const script = getScriptFromPersToken(token);
      const presentation = classifyPersMeta(token.meta);
      pushOccurrence(out, script, presentation, true, 'subject');
    });

    const tokenRanges = tokens.map((token) => [token.start, token.end]);
    const plainSegments = [];
    let last = 0;
    tokens.forEach((token) => {
      if (token.start > last) plainSegments.push(source.slice(last, token.start));
      last = token.end;
    });
    if (last < source.length) plainSegments.push(source.slice(last));

    plainSegments.forEach((segment) => {
      scanPlainEslInText(segment, null, true, 'subject').forEach((item) => out.push(item));
    });

    if (!tokens.length) {
      scanPlainEslInText(source, tokenRanges, true, 'subject').forEach((item) => out.push(item));
    }

    return out;
  }

  function extractFromPreheaderText(preheaderText) {
    return scanPlainEslInText(preheaderText, null, true, 'preview');
  }

  function extractFromBodyHtml(bodyHtml) {
    const out = [];
    const raw = String(bodyHtml || '').trim();
    if (!raw) return out;

    let doc;
    try {
      doc = new DOMParser().parseFromString(raw, 'text/html');
    } catch (_) {
      const stripped = stripPreheaderBlocksFromRawHtml(raw);
      extractBodyTokensFromRawHtml(stripped).forEach((item) => {
        pushOccurrence(out, item.script, item.presentation, item.editable, 'body');
      });
      if (!out.length) scanPlainEslInText(stripped, null, false, 'body').forEach((item) => out.push(item));
      return out;
    }

    doc.querySelectorAll('[e-token="cust_esl"], [e-token="personalization"]').forEach((el) => {
      if (isInsidePreheader(el)) return;
      const script = getScriptFromBodyTokenSpan(el);
      const presentation = classifyBodyTokenSpan(el);
      pushOccurrence(out, script, presentation, isInEditableContext(el), 'body');
    });

    if (!out.length && /\be-token=["'](?:cust_esl|personalization)["']/i.test(raw)) {
      extractBodyTokensFromRawHtml(stripPreheaderBlocksFromRawHtml(raw)).forEach((item) => {
        pushOccurrence(out, item.script, item.presentation, item.editable, 'body');
      });
    }

    const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('[e-token="cust_esl"], [e-token="personalization"]')) continue;
      if (parent.closest('script, style, noscript')) continue;
      if (isInsidePreheader(parent)) continue;
      const text = String(node.textContent || '');
      if (!text.includes('{{')) continue;
      scanPlainEslInText(text, null, isInEditableContext(parent), 'body').forEach((item) => out.push(item));
    }

    doc.querySelectorAll('img[alt]').forEach((img) => {
      if (isInsidePreheader(img)) return;
      const alt = String(img.getAttribute('alt') || '').trim();
      if (!alt || !alt.includes('{{')) return;
      scanPlainEslInText(alt, null, isInEditableContext(img), 'alt').forEach((item) => out.push(item));
    });

    return out;
  }

  function extractEslUsageFromEmail({ bodyHtml, subjectHtml, preheaderText } = {}) {
    const out = [];
    extractFromBodyHtml(bodyHtml).forEach((item) => out.push(item));
    extractFromSubjectHtml(subjectHtml).forEach((item) => out.push(item));
    extractFromPreheaderText(preheaderText).forEach((item) => out.push(item));
    return out;
  }

  window.gemNormalizeEslScriptKey = normalizeEslScriptKey;
  window.gemExtractEslUsageFromEmail = extractEslUsageFromEmail;
})();
