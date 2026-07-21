console.log('[Gem] find-replace-dom-utils.js loaded');

(function () {
  'use strict';

  const PREVIEW_IFRAME_SELECTORS = [
    'iframe.e-contentblocks-preview__iframe-desktop',
    'vce-iframe iframe.e-contentblocks-preview__iframe',
  ];

  const MAX_LOCATION_DEFAULT = 40;
  const SNIPPET_RADIUS = 36;

  function isInsideExistingToken(node) {
    let cur = node;
    while (cur) {
      if (cur.nodeType === 1) {
        const el = cur;
        if (el.matches && (el.matches('span[e-token="cust_esl"]') || el.matches('span[e-token="personalization"]') || el.classList.contains('cbNonEditable'))) {
          return true;
        }
      }
      cur = cur.parentNode;
    }
    return false;
  }

  function escapeRegexLiteral(find) {
    let escaped = '';
    for (let i = 0; i < find.length; i += 1) {
      const ch = find[i];
      if (/[.*+?^${}()|[\]\\]/.test(ch)) escaped += `\\${ch}`;
      else escaped += ch;
    }
    return escaped;
  }

  function buildMatcher({ findText, isRegex, matchCase, wholeWord }) {
    const find = String(findText ?? '').trim();
    if (!find) return null;

    let flags = 'g';
    if (!matchCase) flags += 'i';

    if (isRegex) {
      try {
        return { regex: new RegExp(find, flags), isRegex: true };
      } catch (_) {
        return { error: 'Invalid regular expression.' };
      }
    }

    let pattern = escapeRegexLiteral(find);
    if (wholeWord) pattern = `\\b${pattern}\\b`;
    return { regex: new RegExp(pattern, flags), isRegex: false };
  }

  function freshRegex(matcher) {
    return new RegExp(matcher.regex.source, matcher.regex.flags);
  }

  function expandReplacement(replacement, match, captures) {
    return String(replacement ?? '').replace(/\$\$|\$&|\$(\d+)/g, (token, num) => {
      if (token === '$$') return '$';
      if (token === '$&') return match;
      const idx = Number(num);
      if (idx === 0) return match;
      return captures[idx - 1] ?? '';
    });
  }

  function makeSnippet(text, index, length) {
    const source = String(text ?? '');
    const start = Math.max(0, index - SNIPPET_RADIUS);
    const end = Math.min(source.length, index + length + SNIPPET_RADIUS);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < source.length ? '…' : '';
    const sliceStart = start > 0 ? start + 1 : start;
    return {
      before: prefix + source.slice(start, index),
      match: source.slice(index, index + length),
      after: source.slice(index + length, end) + suffix,
    };
  }

  function countMatchesInString(text, matcher) {
    const source = String(text ?? '');
    if (!matcher?.regex || !source) return 0;

    const regex = freshRegex(matcher);
    if (matcher.isRegex) {
      const matches = source.match(regex);
      return matches ? matches.length : 0;
    }

    let count = 0;
    let match;
    while ((match = regex.exec(source)) !== null) {
      count += 1;
      if (match[0] === '') regex.lastIndex += 1;
    }
    return count;
  }

  function findMatchesInString(text, matcher, { max = MAX_LOCATION_DEFAULT, context = '' } = {}) {
    const source = String(text ?? '');
    const locations = [];
    if (!matcher?.regex || !source) return locations;

    const regex = freshRegex(matcher);
    let match;
    while ((match = regex.exec(source)) !== null && locations.length < max) {
      const snippet = makeSnippet(source, match.index, match[0].length);
      locations.push({
        context,
        matchText: match[0],
        snippet,
      });
      if (match[0] === '') regex.lastIndex += 1;
    }
    return locations;
  }

  function replaceInString(text, matcher, replacement) {
    const source = String(text ?? '');
    if (!matcher?.regex || !source) return { text: source, count: 0, changes: [] };

    const regex = freshRegex(matcher);
    let count = 0;
    const changes = [];

    const next = source.replace(regex, (...args) => {
      count += 1;
      const match = args[0];
      const captures = args.slice(1, -2);
      const index = args[args.length - 2];
      const snippet = makeSnippet(source, index, match.length);
      const afterMatch = expandReplacement(replacement, match, captures);
      changes.push({
        context: '',
        before: snippet.before + snippet.match + snippet.after,
        after: snippet.before + afterMatch + snippet.after,
        matchText: match,
      });
      return afterMatch;
    });

    return { text: next, count, changes };
  }

  function looksLikeHtml(value) {
    return /<[a-z][\s\S]*>/i.test(String(value ?? ''));
  }

  function forEachSearchableTextNode(root, callback) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) callback(node);
  }

  function processHtmlOrTextContent(content, matcher, options = {}) {
    const {
      replacement = undefined,
      maxLocations = MAX_LOCATION_DEFAULT,
      context = '',
      collectChanges = false,
      simulateOnly = false,
    } = options;
    const value = String(content ?? '');
    const hasReplacement = replacement !== undefined;

    if (!looksLikeHtml(value)) {
      if (hasReplacement) {
        const result = replaceInString(value, matcher, replacement);
        return {
          count: result.count,
          locations: collectChanges
            ? result.changes.map((item) => ({ context, matchText: item.matchText, snippet: makeSnippetFromChange(item) }))
            : findMatchesInString(value, matcher, { max: maxLocations, context }),
          changes: result.changes.map((item) => ({ ...item, context: context || item.context })),
          text: simulateOnly ? value : result.text,
        };
      }

      const locations = findMatchesInString(value, matcher, { max: maxLocations, context });
      return {
        count: countMatchesInString(value, matcher),
        locations,
        changes: [],
        text: value,
      };
    }

    const container = document.createElement('div');
    container.innerHTML = value;

    let count = 0;
    const locations = [];
    const changes = [];

    forEachSearchableTextNode(container, (textNode) => {
      const text = textNode.nodeValue;
      if (hasReplacement && simulateOnly) {
        const result = replaceInString(text, matcher, replacement);
        if (result.count > 0) {
          count += result.count;
          if (collectChanges) {
            result.changes.forEach((item) => {
              changes.push({ ...item, context: context || item.context });
            });
          }
        }
      } else if (hasReplacement) {
        const result = replaceInString(text, matcher, replacement);
        if (result.count > 0) {
          textNode.nodeValue = result.text;
          count += result.count;
          if (collectChanges) {
            result.changes.forEach((item) => {
              changes.push({ ...item, context: context || item.context });
            });
          }
        }
      } else {
        const nodeCount = countMatchesInString(text, matcher);
        count += nodeCount;
        if (nodeCount > 0) {
          const nodeLocations = findMatchesInString(text, matcher, {
            max: maxLocations - locations.length,
            context,
          });
          locations.push(...nodeLocations);
        }
      }
    });

    return {
      count,
      locations,
      changes,
      text: simulateOnly ? value : container.innerHTML,
    };
  }

  function makeSnippetFromChange(change) {
    const before = String(change.before || '');
    const matchText = String(change.matchText || '');
    const idx = before.indexOf(matchText);
    if (idx < 0) {
      return { before: '', match: matchText, after: '' };
    }
    return {
      before: before.slice(0, idx),
      match: matchText,
      after: before.slice(idx + matchText.length),
    };
  }

  function collectEditableRoots(doc) {
    const roots = new Set();
    doc.querySelectorAll('[contenteditable="true"]').forEach((el) => roots.add(el));
    doc.querySelectorAll('[e-editable]').forEach((el) => {
      if (el.tagName !== 'IMG') roots.add(el);
    });
    return roots;
  }

  function getBlockContextLabel(node, doc) {
    if (!node || !doc) return 'Email body';
    const block = node.nodeType === 1 ? node.closest('[e-block-id]') : node.parentElement?.closest('[e-block-id]');
    if (!block) return 'Email body';
    const blockId = block.getAttribute('e-block-id') || '';
    const nameEl = block.querySelector('[e-block-name], .e-blockname, .e-block-name');
    const blockName = nameEl ? String(nameEl.textContent || '').trim() : '';
    if (blockName) return `Block: ${blockName}`;
    if (blockId) return `Block ${blockId.slice(0, 8)}`;
    return 'Email body';
  }

  function scanEmailBody(doc, matcher, options = {}) {
    const {
      replacement = undefined,
      maxLocations = MAX_LOCATION_DEFAULT,
      collectChanges = false,
      simulateOnly = false,
    } = options;
    let count = 0;
    const locations = [];
    const changes = [];
    const touched = new Set();
    const hasReplacement = replacement !== undefined;

    collectEditableRoots(doc).forEach((root) => {
      const context = getBlockContextLabel(root, doc);
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
          const regex = freshRegex(matcher);
          return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });

      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      nodes.forEach((textNode) => {
        if (hasReplacement && simulateOnly) {
          const result = replaceInString(textNode.nodeValue, matcher, replacement);
          if (result.count > 0) {
            count += result.count;
            if (collectChanges) {
              result.changes.forEach((item) => changes.push({ ...item, context }));
            }
          }
        } else if (hasReplacement) {
          const result = replaceInString(textNode.nodeValue, matcher, replacement);
          if (result.count > 0) {
            textNode.nodeValue = result.text;
            count += result.count;
            touched.add(root);
            if (collectChanges) {
              result.changes.forEach((item) => changes.push({ ...item, context }));
            }
          }
        } else {
          const nodeCount = countMatchesInString(textNode.nodeValue, matcher);
          count += nodeCount;
          if (nodeCount > 0 && locations.length < maxLocations) {
            locations.push(
              ...findMatchesInString(textNode.nodeValue, matcher, {
                max: maxLocations - locations.length,
                context,
              })
            );
          }
        }
      });
    });

    return { count, locations, changes, touched: Array.from(touched) };
  }

  function scanImageAlts(doc, matcher, options = {}) {
    const {
      replacement = undefined,
      maxLocations = MAX_LOCATION_DEFAULT,
      collectChanges = false,
      simulateOnly = false,
    } = options;
    let count = 0;
    const locations = [];
    const changes = [];
    const touched = [];
    const hasReplacement = replacement !== undefined;

    doc.querySelectorAll('img[e-editable]').forEach((img, index) => {
      const alt = String(img.getAttribute('alt') || '');
      const context = `Image ALT ${index + 1}`;
      if (hasReplacement && simulateOnly) {
        const result = replaceInString(alt, matcher, replacement);
        if (result.count > 0) {
          count += result.count;
          if (collectChanges) {
            result.changes.forEach((item) => changes.push({ ...item, context }));
          }
        }
      } else if (hasReplacement) {
        const result = replaceInString(alt, matcher, replacement);
        if (result.count > 0) {
          img.setAttribute('alt', result.text);
          count += result.count;
          touched.push(img);
          if (collectChanges) {
            result.changes.forEach((item) => changes.push({ ...item, context }));
          }
        }
      } else {
        const altCount = countMatchesInString(alt, matcher);
        count += altCount;
        if (altCount > 0 && locations.length < maxLocations) {
          locations.push(
            ...findMatchesInString(alt, matcher, {
              max: maxLocations - locations.length,
              context,
            })
          );
        }
      }
    });

    return { count, locations, changes, touched };
  }

  function markEmailBodyDirty(doc, editables) {
    editables.forEach((editable) => {
      try {
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        editable.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    });

    if (editables.length && typeof window.gemMarkEmarsysDraftDirty === 'function') {
      window.gemMarkEmarsysDraftDirty(doc, editables);
    }
    if (editables.length && typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function') {
      window.gemNudgeEmarsysDirtyDetectionViaFocus(doc, editables);
    }
  }

  function markImageAltsDirty(images) {
    images.forEach((img) => {
      try {
        img.dispatchEvent(new Event('input', { bubbles: true }));
        img.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    });
  }

  function getPreviewIframe(selectors = PREVIEW_IFRAME_SELECTORS) {
    for (const selector of selectors) {
      const iframe = document.querySelector(selector);
      if (!iframe) continue;
      if (iframe.classList.contains('iframe-duplicate')) continue;
      if (iframe.closest('.gem-iframe-wrapper')) continue;
      return iframe;
    }
    return null;
  }

  function getPreviewDocument(selectors = PREVIEW_IFRAME_SELECTORS) {
    const iframe = getPreviewIframe(selectors);
    if (!iframe) return null;
    try {
      return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch (_) {
      return null;
    }
  }

  window.gemFindReplaceDom = {
    PREVIEW_IFRAME_SELECTORS,
    MAX_LOCATION_DEFAULT,
    isInsideExistingToken,
    buildMatcher,
    countMatchesInString,
    findMatchesInString,
    replaceInString,
    expandReplacement,
    processHtmlOrTextContent,
    scanEmailBody,
    scanImageAlts,
    markEmailBodyDirty,
    markImageAltsDirty,
    getPreviewIframe,
    getPreviewDocument,
    looksLikeHtml,
  };
})();
