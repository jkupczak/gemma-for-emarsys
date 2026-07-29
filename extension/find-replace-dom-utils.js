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

  const ALLOWLISTED_HTML_TAGS = new Set([
    'b',
    'strong',
    'em',
    'i',
    'u',
    'sup',
    'a',
    'strike',
    'br',
    'del',
    'ins',
    'span',
  ]);

  const UNSAFE_INLINE_STYLE_PATTERNS = [
    /expression\s*\(/gi,
    /url\s*\(\s*['"]?\s*javascript:/gi,
    /-moz-binding/gi,
    /@import/gi,
    /behavior\s*:/gi,
  ];

  function sanitizeInlineStyle(style) {
    let cleaned = String(style || '');
    UNSAFE_INLINE_STYLE_PATTERNS.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, '');
    });
    return cleaned.trim();
  }

  function sanitizeAllowlistedHtml(html) {
    const input = String(html ?? '');
    if (!looksLikeHtml(input)) {
      return { ok: false, hasElements: false, html: input, reason: 'not-html' };
    }

    const template = document.createElement('template');
    template.innerHTML = input;
    let hasElements = false;

    const walk = (parent) => {
      const children = Array.from(parent.childNodes);
      children.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) {
          try {
            node.remove();
          } catch (_) {}
          return;
        }

        const tag = node.tagName.toLowerCase();
        if (!ALLOWLISTED_HTML_TAGS.has(tag)) {
          while (node.firstChild) {
            parent.insertBefore(node.firstChild, node);
          }
          node.remove();
          return;
        }

        hasElements = true;
        Array.from(node.attributes || []).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name === 'style') return;
          if (tag === 'a' && name === 'href') return;
          try {
            node.removeAttribute(attr.name);
          } catch (_) {}
        });

        if (node.hasAttribute('style')) {
          const cleanedStyle = sanitizeInlineStyle(node.getAttribute('style'));
          if (cleanedStyle) node.setAttribute('style', cleanedStyle);
          else node.removeAttribute('style');
        }

        if (tag === 'a') {
          const href = node.getAttribute('href');
          if (href == null || href === '') {
            while (node.firstChild) {
              parent.insertBefore(node.firstChild, node);
            }
            node.remove();
            return;
          }
        }

        if (tag !== 'br') walk(node);
      });
    };

    walk(template.content);

    return {
      ok: hasElements,
      hasElements,
      html: template.innerHTML,
      reason: hasElements ? 'sanitized' : 'no-elements',
    };
  }

  function createFragmentFromSanitizedHtml(doc, sanitizedHtml) {
    const template = doc.createElement('template');
    template.innerHTML = String(sanitizedHtml ?? '');
    const frag = doc.createDocumentFragment();
    while (template.content.firstChild) {
      frag.appendChild(template.content.firstChild);
    }
    return frag;
  }

  function createSearchableTextWalkerFilter() {
    return {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    };
  }

  function findTextNodeAtCharacterOffset(root, charOffset) {
    if (!root || charOffset < 0) return null;
    let walked = 0;
    const walker = root.ownerDocument.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      createSearchableTextWalkerFilter()
    );
    let node;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      if (charOffset < walked + len) {
        return { node, offsetInNode: charOffset - walked };
      }
      walked += len;
    }
    return null;
  }

  function collectTextMatchJobsInRoot(root, matcher) {
    const jobs = [];
    if (!root || !matcher?.regex) return jobs;

    let globalOffset = 0;
    const walker = root.ownerDocument.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      createSearchableTextWalkerFilter()
    );
    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.nodeValue;
      const regex = freshRegex(matcher);
      let match;
      while ((match = regex.exec(text)) !== null) {
        jobs.push({
          globalOffset: globalOffset + match.index,
          length: match[0].length,
          match: match[0],
          captures: match.slice(1),
        });
        if (match[0] === '') regex.lastIndex += 1;
      }
      globalOffset += text.length;
    }
    return jobs;
  }

  function applyTextReplacementsInEditableRoot(root, matcher, replacement, context) {
    const jobs = collectTextMatchJobsInRoot(root, matcher);
    if (!jobs.length) return { count: 0, changes: [] };

    jobs.sort((a, b) => b.globalOffset - a.globalOffset);

    const doc = root.ownerDocument;
    let count = 0;
    const changes = [];

    jobs.forEach((job) => {
      const located = findTextNodeAtCharacterOffset(root, job.globalOffset);
      if (!located) return;

      const expanded = expandReplacement(replacement, job.match, job.captures);
      const snippet = makeSnippet(
        located.node.nodeValue,
        located.offsetInNode,
        job.length
      );

      const sanitized = looksLikeHtml(expanded) ? sanitizeAllowlistedHtml(expanded) : null;
      const useHtml = !!(sanitized && sanitized.hasElements);

      const range = doc.createRange();
      range.setStart(located.node, located.offsetInNode);
      range.setEnd(located.node, located.offsetInNode + job.length);
      range.deleteContents();

      if (useHtml) {
        range.insertNode(createFragmentFromSanitizedHtml(doc, sanitized.html));
        changes.unshift({
          context,
          before: snippet.before + snippet.match + snippet.after,
          after: snippet.before + sanitized.html + snippet.after,
          matchText: job.match,
        });
      } else {
        range.insertNode(doc.createTextNode(expanded));
        changes.unshift({
          context,
          before: snippet.before + snippet.match + snippet.after,
          after: snippet.before + expanded + snippet.after,
          matchText: job.match,
        });
      }
      count += 1;
    });

    return { count, changes };
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

  // Emarsys lazily initializes TinyMCE on [e-editable] only after hover/focus.
  // Mutating dormant nodes updates the preview DOM but does not stick in Emarsys's
  // durable model (language A→B→A reverts). Prime those fields first.
  function isEmarsysEditableActivated(el) {
    if (!el || el.nodeType !== 1) return false;
    // Require the host itself to be an editing host. Do NOT use el.isContentEditable:
    // that is true when an ancestor is editable, which wrongly skips dormant [e-editable]s.
    try {
      if (el.classList && el.classList.contains('mce-content-body')) return true;
    } catch (_) {}
    try {
      if (el.getAttribute('contenteditable') === 'true') return true;
    } catch (_) {}
    return false;
  }

  function collectDormantEmarsysEditables(doc) {
    if (!doc || !doc.querySelectorAll) return [];
    return Array.from(doc.querySelectorAll('[e-editable]')).filter((el) => {
      if (el.tagName === 'IMG') return false;
      return !isEmarsysEditableActivated(el);
    });
  }

  function dispatchEmarsysEditablePrimeEvents(el, doc, phase = 'hover') {
    if (!el || !doc) return;
    const win = doc.defaultView || window;
    const mouseOpts = { bubbles: true, cancelable: true, view: win };
    const fireMouse = (type) => {
      try {
        el.dispatchEvent(new MouseEvent(type, mouseOpts));
      } catch (_) {}
    };
    const firePointer = (type) => {
      try {
        if (typeof PointerEvent === 'function') {
          el.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              view: win,
              pointerType: 'mouse',
            })
          );
        } else {
          fireMouse(type === 'pointerdown' ? 'mousedown' : type === 'pointerup' ? 'mouseup' : 'mousemove');
        }
      } catch (_) {}
    };

    // Phase 1: hover/focus — matches the user "hover the field" path Emarsys uses.
    fireMouse('mouseenter');
    fireMouse('mouseover');
    fireMouse('mousemove');
    firePointer('pointerover');
    firePointer('pointerenter');
    firePointer('pointermove');

    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      try {
        el.focus();
      } catch (_) {}
    }

    // Make priming visible / help Emarsys lazy-init (same “jump between blocks”
    // behavior Magic Fill exhibits when waking many fields).
    try {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    } catch (_) {}

    // Phase 2: click only if hover alone didn't wake TinyMCE.
    if (phase === 'click') {
      firePointer('pointerdown');
      fireMouse('mousedown');
      fireMouse('mouseup');
      firePointer('pointerup');
      fireMouse('click');
    }
  }

  function waitForEmarsysEditableActivated(el, timeoutMs = 900) {
    return new Promise((resolve) => {
      if (isEmarsysEditableActivated(el)) {
        resolve(true);
        return;
      }

      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        try {
          if (observer) observer.disconnect();
        } catch (_) {}
        try {
          clearTimeout(timer);
        } catch (_) {}
        try {
          clearInterval(poll);
        } catch (_) {}
        resolve(!!ok);
      };

      let observer = null;
      try {
        if (typeof MutationObserver === 'function') {
          observer = new MutationObserver(() => {
            if (isEmarsysEditableActivated(el)) finish(true);
          });
          observer.observe(el, {
            attributes: true,
            attributeFilter: ['contenteditable', 'class', 'id'],
          });
        }
      } catch (_) {
        observer = null;
      }

      const poll = setInterval(() => {
        if (isEmarsysEditableActivated(el)) finish(true);
      }, 30);

      const timer = setTimeout(() => {
        finish(isEmarsysEditableActivated(el));
      }, Math.max(100, timeoutMs));
    });
  }

  /**
   * Activate dormant Emarsys [e-editable] fields (lazy TinyMCE) before mutating body text.
   * @param {Document} doc
   * @param {{ filter?: (el: Element) => boolean, timeoutMs?: number, root?: Element|null }} [options]
   */
  async function primeEmarsysEditablesInDoc(doc, options = {}) {
    const {
      filter = null,
      timeoutMs = 900,
      root = null,
      release = true,
    } = options;

    if (!doc) {
      bodySyncLog('prime: no doc');
      return { attempted: 0, primed: 0, failed: 0 };
    }

    let candidates = collectDormantEmarsysEditables(doc);
    if (root && typeof root.contains === 'function') {
      candidates = candidates.filter((el) => root === el || root.contains(el));
    }
    if (typeof filter === 'function') {
      candidates = candidates.filter((el) => {
        try {
          return !!filter(el);
        } catch (_) {
          return false;
        }
      });
    }

    bodySyncLog('prime: start', {
      dormantTotal: collectDormantEmarsysEditables(doc).length,
      candidates: candidates.length,
      timeoutMs,
    });
    captureEditorInteractionProbe(doc, 'prime:before');

    let primed = 0;
    let failed = 0;

    for (const el of candidates) {
      const label = (() => {
        try {
          const tag = (el.tagName || '?').toLowerCase();
          const name = el.getAttribute('e-editable');
          return `<${tag}${name != null ? ` e-editable=${name}` : ''}>`;
        } catch (_) {
          return '?';
        }
      })();

      // Hover the surrounding block first — Emarsys often wires editors at block level.
      try {
        const block = el.closest && el.closest('[e-block-id]');
        if (block && block !== el) dispatchEmarsysEditablePrimeEvents(block, doc, 'hover');
      } catch (_) {}

      dispatchEmarsysEditablePrimeEvents(el, doc, 'hover');
      let ok = await waitForEmarsysEditableActivated(el, Math.min(350, timeoutMs));

      if (!ok) {
        bodySyncLog('prime: hover insufficient, trying click', label);
        try {
          const block = el.closest && el.closest('[e-block-id]');
          if (block && block !== el) dispatchEmarsysEditablePrimeEvents(block, doc, 'click');
        } catch (_) {}
        dispatchEmarsysEditablePrimeEvents(el, doc, 'click');
        ok = await waitForEmarsysEditableActivated(el, timeoutMs);
      }

      if (ok) {
        primed += 1;
        bodySyncLog('prime: activated', label);
      } else {
        failed += 1;
        bodySyncLog('prime: timed out', label);
      }

      // Leave TinyMCE initialized but don't keep focus in the field.
      try {
        el.blur();
      } catch (_) {}
    }

    bodySyncLog('prime: done', { attempted: candidates.length, primed, failed, release });
    captureEditorInteractionProbe(doc, 'prime:after-activate');

    // Drop focus/highlight chrome left by waking fields — unless the caller
    // still needs the editors "hot" for an immediate focused commit.
    if (release) {
      try {
        releaseEmarsysEditorSession(doc);
      } catch (_) {}
      captureEditorInteractionProbe(doc, 'prime:after-release');
    } else {
      bodySyncLog('prime: skipping release (caller will commit while focused)');
    }

    return { attempted: candidates.length, primed, failed };
  }

  /**
   * Leave Emarsys/TinyMCE in a neutral state after programmatic edits.
   * Without this, priming + dirty-nudge can leave `.mce-edit-focus` and
   * `e-vce-borderer[highlight]` active, which blocks the TinyMCE toolbar and
   * the content-block hover toolbar.
   */
  function releaseEmarsysEditorSession(doc) {
    if (!doc) {
      bodySyncLog('release: no doc');
      return { ok: false, reason: 'no-doc' };
    }

    const beforeFocus = (() => {
      try {
        return doc.querySelectorAll('.mce-edit-focus').length;
      } catch (_) {
        return -1;
      }
    })();
    const beforeBorderers = (() => {
      try {
        return doc.querySelectorAll(
          'e-vce-borderer[highlight="true"], e-vce-borderer-element'
        ).length;
      } catch (_) {
        return -1;
      }
    })();

    bodySyncLog('release: start', {
      mceEditFocus: beforeFocus,
      highlightChrome: beforeBorderers,
    });
    captureEditorInteractionProbe(doc, 'release:before');

    // Ask TinyMCE to blur before we strip DOM residue.
    try {
      const win = doc.defaultView;
      const tm = win && (win.tinymce || win.tinyMCE);
      const editors = tm && Array.isArray(tm.editors) ? tm.editors.slice() : [];
      if (tm && tm.activeEditor && editors.indexOf(tm.activeEditor) === -1) {
        editors.push(tm.activeEditor);
      }
      editors.forEach((editor) => {
        if (!editor) return;
        try {
          if (editor.selection && typeof editor.selection.collapse === 'function') {
            editor.selection.collapse(false);
          }
        } catch (_) {}
        try {
          if (typeof editor.fire === 'function') {
            editor.fire('blur');
            editor.fire('focusout');
          }
        } catch (_) {}
        try {
          if (typeof editor.nodeChanged === 'function') editor.nodeChanged();
        } catch (_) {}
      });
    } catch (_) {}

    // Clear iframe selection.
    try {
      const sel = doc.getSelection && doc.getSelection();
      if (sel && typeof sel.removeAllRanges === 'function') sel.removeAllRanges();
    } catch (_) {}

    // Strip TinyMCE focus class residue.
    try {
      doc.querySelectorAll('.mce-edit-focus').forEach((el) => {
        try {
          el.classList.remove('mce-edit-focus');
        } catch (_) {}
        try {
          el.blur();
        } catch (_) {}
      });
    } catch (_) {}

    // Blur whatever still has DOM focus inside the iframe.
    try {
      const ae = doc.activeElement;
      if (ae && ae !== doc.body && ae !== doc.documentElement && typeof ae.blur === 'function') {
        ae.blur();
      }
    } catch (_) {}

    // Remove transient Emarsys editable-highlight chrome (keep the idle default borderer).
    try {
      doc.querySelectorAll('e-vce-borderer[highlight="true"]').forEach((el) => {
        try {
          el.remove();
        } catch (_) {}
      });
      doc.querySelectorAll('e-vce-borderer-element').forEach((el) => {
        try {
          el.remove();
        } catch (_) {}
      });
    } catch (_) {}

    // Park focus on the body so hover/click handlers can take over again.
    try {
      if (doc.body) {
        if (!doc.body.hasAttribute('tabindex')) {
          doc.body.setAttribute('tabindex', '-1');
        }
        try {
          doc.body.focus({ preventScroll: true });
        } catch (_) {
          try {
            doc.body.focus();
          } catch (_) {}
        }
      }
    } catch (_) {}

    const afterFocus = (() => {
      try {
        return doc.querySelectorAll('.mce-edit-focus').length;
      } catch (_) {
        return -1;
      }
    })();
    const afterBorderers = (() => {
      try {
        return doc.querySelectorAll(
          'e-vce-borderer[highlight="true"], e-vce-borderer-element'
        ).length;
      } catch (_) {
        return -1;
      }
    })();

    bodySyncLog('release: done', {
      mceEditFocus: afterFocus,
      highlightChrome: afterBorderers,
    });
    captureEditorInteractionProbe(doc, 'release:after');

    return {
      ok: true,
      mceEditFocusBefore: beforeFocus,
      mceEditFocusAfter: afterFocus,
      highlightChromeBefore: beforeBorderers,
      highlightChromeAfter: afterBorderers,
    };
  }

  function serializeIframeDocumentHtml(iframeDoc) {
    if (!iframeDoc || !iframeDoc.documentElement) return '';
    let doctype = '';
    try {
      const dt = iframeDoc.doctype;
      if (dt && dt.name) {
        doctype = `<!DOCTYPE ${dt.name}>`;
      }
    } catch (_) {}
    let html = '';
    try {
      html = String(iframeDoc.documentElement.outerHTML || '').trim();
    } catch (_) {
      html = '';
    }
    if (!html) return '';
    return doctype ? `${doctype}${html}` : html;
  }

  // Strip TinyMCE runtime attrs from editable inner HTML before writing into
  // Emarsys's clean content snapshot.
  function sanitizeEditableInnerHtml(html) {
    try {
      const template = document.createElement('template');
      template.innerHTML = String(html || '');
      template.content.querySelectorAll('*').forEach((el) => {
        try {
          Array.from(el.attributes || []).forEach((attr) => {
            if (/^data-mce-/i.test(attr.name)) el.removeAttribute(attr.name);
          });
        } catch (_) {}
        try {
          if (el.classList) {
            Array.from(el.classList).forEach((cls) => {
              if (String(cls).indexOf('mce-') === 0) el.classList.remove(cls);
            });
          }
        } catch (_) {}
      });
      return template.innerHTML;
    } catch (_) {
      return String(html || '');
    }
  }

  function resolveLiveEditableBlockId(liveEl) {
    try {
      const own = liveEl.getAttribute && liveEl.getAttribute('e-block-id');
      if (own) return own;
    } catch (_) {}
    try {
      const block = liveEl.closest && liveEl.closest('[e-block-id]');
      return block ? block.getAttribute('e-block-id') : null;
    } catch (_) {
      return null;
    }
  }

  function findMatchingEditableInSnapshot(snapshotDoc, liveEl) {
    if (!snapshotDoc || !liveEl) return null;
    let eEditable = null;
    try {
      eEditable = liveEl.getAttribute('e-editable');
    } catch (_) {
      return null;
    }
    if (eEditable == null || eEditable === '') return null;

    let candidates = [];
    try {
      candidates = Array.from(
        snapshotDoc.querySelectorAll(`[e-editable="${CSS.escape(String(eEditable))}"]`)
      );
    } catch (_) {
      candidates = Array.from(snapshotDoc.querySelectorAll('[e-editable]')).filter(
        (el) => el.getAttribute('e-editable') === eEditable
      );
    }
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];

    const blockId = resolveLiveEditableBlockId(liveEl);
    if (blockId) {
      const filtered = candidates.filter((el) => {
        try {
          if (el.getAttribute('e-block-id') === blockId) return true;
          const block = el.closest && el.closest('[e-block-id]');
          return !!(block && block.getAttribute('e-block-id') === blockId);
        } catch (_) {
          return false;
        }
      });
      if (filtered.length) return filtered[0];
    }
    return candidates[0];
  }

  function serializeSnapshotDocumentHtml(snapshotDoc, originalHtml) {
    let doctype = '';
    try {
      if (snapshotDoc.doctype && snapshotDoc.doctype.name) {
        doctype = `<!DOCTYPE ${snapshotDoc.doctype.name}>`;
      } else if (String(originalHtml || '').startsWith('<!DOCTYPE')) {
        doctype = '<!DOCTYPE html>';
      }
    } catch (_) {}
    let html = '';
    try {
      html = String(snapshotDoc.documentElement.outerHTML || '').trim();
    } catch (_) {
      return '';
    }
    if (!html) return '';
    return doctype ? `${doctype}${html}` : html;
  }

  // Replace one [e-editable] element's innerHTML inside a raw HTML string without
  // DOMParser renormalization (Twig comments / attribute quoting must stay intact
  // or Emarsys ignores the snapshot on language reload).
  function replaceEditableInnerInHtmlString(html, eEditable, newInner, blockId) {
    const source = String(html || '');
    const name = String(eEditable || '');
    if (!source || !name) {
      return { ok: false, reason: 'missing-args' };
    }

    const marker = `e-editable="${name}"`;
    const altMarker = `e-editable='${name}'`;
    let searchFrom = 0;
    while (searchFrom < source.length) {
      let markerIdx = source.indexOf(marker, searchFrom);
      let markerLen = marker.length;
      if (markerIdx === -1) {
        markerIdx = source.indexOf(altMarker, searchFrom);
        markerLen = altMarker.length;
      }
      if (markerIdx === -1) break;

      const tagStart = source.lastIndexOf('<', markerIdx);
      if (tagStart === -1 || tagStart < searchFrom) {
        searchFrom = markerIdx + markerLen;
        continue;
      }

      const tagEnd = source.indexOf('>', markerIdx);
      if (tagEnd === -1) break;

      const openTag = source.slice(tagStart, tagEnd + 1);
      if (/\/\s*>$/.test(openTag)) {
        searchFrom = tagEnd + 1;
        continue;
      }

      const tagNameMatch = openTag.match(/^<\s*([a-zA-Z0-9:-]+)/);
      if (!tagNameMatch) {
        searchFrom = tagEnd + 1;
        continue;
      }
      const tagName = tagNameMatch[1];

      if (blockId) {
        const openHasBlock =
          openTag.indexOf(`e-block-id="${blockId}"`) !== -1 ||
          openTag.indexOf(`e-block-id='${blockId}'`) !== -1;
        if (!openHasBlock) {
          // Allow match when block id is only on an ancestor in the live DOM;
          // prefer block-scoped opens when present, otherwise accept first name match.
          // If ANY later open tag for this e-editable includes the block id, skip this one.
          const rest = source.slice(tagEnd + 1);
          const laterWithBlock =
            rest.indexOf(`e-editable="${name}"`) !== -1 &&
            (rest.indexOf(`e-block-id="${blockId}"`) !== -1 ||
              rest.indexOf(`e-block-id='${blockId}'`) !== -1);
          // Heuristic: if this open doesn't have block id, still use it when it's
          // the only practical match (common for clean snapshots).
          if (laterWithBlock) {
            searchFrom = tagEnd + 1;
            continue;
          }
        }
      }

      const closeTag = `</${tagName}>`;
      const closeIdx = source.indexOf(closeTag, tagEnd + 1);
      if (closeIdx === -1) {
        searchFrom = tagEnd + 1;
        continue;
      }

      const prevInner = source.slice(tagEnd + 1, closeIdx);
      if (prevInner === newInner) {
        return {
          ok: true,
          changed: false,
          html: source,
          tagName,
          prevInner,
          nextInner: newInner,
        };
      }

      const next =
        source.slice(0, tagEnd + 1) + String(newInner || '') + source.slice(closeIdx);
      return {
        ok: true,
        changed: true,
        html: next,
        tagName,
        prevInner,
        nextInner: String(newInner || ''),
      };
    }

    return { ok: false, reason: 'no-match' };
  }

  function capturePreviewScrollFromContainer(container) {
    try {
      const iframe =
        (container && container.querySelector && container.querySelector('iframe')) ||
        document.querySelector(PREVIEW_IFRAME_SELECTORS[0] || 'iframe');
      if (!iframe) return null;
      let doc = null;
      try {
        doc = iframe.contentDocument || iframe.contentWindow?.document || null;
      } catch (_) {
        return null;
      }
      if (!doc) return null;
      const win = doc.defaultView;
      const root = doc.scrollingElement || doc.documentElement || doc.body;
      const x =
        (win && (win.scrollX || win.pageXOffset)) ||
        (root && root.scrollLeft) ||
        (doc.body && doc.body.scrollLeft) ||
        0;
      const y =
        (win && (win.scrollY || win.pageYOffset)) ||
        (root && root.scrollTop) ||
        (doc.body && doc.body.scrollTop) ||
        0;
      return { iframe, x: Number(x) || 0, y: Number(y) || 0 };
    } catch (_) {
      return null;
    }
  }

  function restorePreviewScroll(scrollState) {
    if (!scrollState || (!scrollState.x && !scrollState.y)) return;
    const apply = () => {
      try {
        const iframe = scrollState.iframe;
        if (!iframe || !iframe.isConnected) return false;
        let doc = null;
        try {
          doc = iframe.contentDocument || iframe.contentWindow?.document || null;
        } catch (_) {
          return false;
        }
        if (!doc || !doc.body) return false;
        const win = doc.defaultView;
        const root = doc.scrollingElement || doc.documentElement;
        if (win && typeof win.scrollTo === 'function') {
          win.scrollTo(scrollState.x, scrollState.y);
        }
        if (root) {
          root.scrollLeft = scrollState.x;
          root.scrollTop = scrollState.y;
        }
        if (doc.body) {
          doc.body.scrollLeft = scrollState.x;
          doc.body.scrollTop = scrollState.y;
        }
        return true;
      } catch (_) {
        return false;
      }
    };

    // Emarsys may document.write / rehydrate the iframe after content writes.
    apply();
    try {
      requestAnimationFrame(() => {
        apply();
        setTimeout(apply, 0);
        setTimeout(apply, 50);
        setTimeout(apply, 150);
        setTimeout(apply, 350);
      });
    } catch (_) {
      setTimeout(apply, 0);
      setTimeout(apply, 150);
    }
  }

  function writeContainerContent(container, html) {
    const next = String(html || '');
    const beforeAttr = String(container.getAttribute('content') || '');
    let beforeProp = null;
    let hasContentProp = false;
    const savedScroll = capturePreviewScrollFromContainer(container);
    try {
      hasContentProp = 'content' in container;
      if (hasContentProp && container.content != null) {
        beforeProp = String(container.content);
      }
    } catch (_) {}

    // Prefer property setter when present (Angular/custom-element bindings).
    let propWrite = 'skipped';
    try {
      if (hasContentProp) {
        container.content = next;
        propWrite = 'set';
      }
    } catch (e) {
      propWrite = e && e.message ? e.message : 'prop-failed';
    }

    try {
      container.setAttribute('content', next);
    } catch (e) {
      return {
        ok: false,
        reason: 'setAttribute-failed',
        error: e && e.message ? e.message : String(e),
        propWrite,
      };
    }

    const afterAttr = String(container.getAttribute('content') || '');
    let afterProp = null;
    try {
      if (hasContentProp && container.content != null) {
        afterProp = String(container.content);
      }
    } catch (_) {}

    bodySyncLog('container-write', {
      hasContentProp,
      propWrite,
      beforeAttrLen: beforeAttr.length,
      afterAttrLen: afterAttr.length,
      beforePropLen: beforeProp != null ? beforeProp.length : null,
      afterPropLen: afterProp != null ? afterProp.length : null,
      attrMatchesWrite: afterAttr === next,
      propMatchesWrite: afterProp == null ? null : afterProp === next,
      attrChanged: beforeAttr !== afterAttr,
      propChanged: beforeProp != null && afterProp != null ? beforeProp !== afterProp : null,
      restoredScroll: savedScroll ? { x: savedScroll.x, y: savedScroll.y } : null,
    });

    try {
      container.dispatchEvent(new Event('input', { bubbles: true }));
      container.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
    try {
      if (typeof CustomEvent === 'function') {
        container.dispatchEvent(
          new CustomEvent('gem:preview-content-synced', {
            bubbles: true,
            detail: { mode: 'surgical-string', length: next.length },
          })
        );
      }
    } catch (_) {}

    restorePreviewScroll(savedScroll);

    return {
      ok: afterAttr === next,
      reason: afterAttr === next ? 'written' : 'attr-mismatch',
      propWrite,
      hasContentProp,
    };
  }

  /**
   * Persist body text edits without dumping the live TinyMCE iframe into
   * Emarsys's content snapshot. String-replaces only touched [e-editable]
   * innerHTML inside the existing clean container HTML (no DOMParser).
   */
  function syncTouchedEditablesIntoContainerContent(iframeDoc, editables) {
    const container = resolvePreviewContainerForIframeDoc(iframeDoc);
    if (!container) {
      bodySyncLog('surgical-sync: no container');
      return { ok: false, reason: 'no-container', updated: 0 };
    }

    const prev = String(container.getAttribute('content') || '');
    if (!prev) {
      bodySyncLog('surgical-sync: empty container content');
      return { ok: false, reason: 'empty-content', updated: 0 };
    }

    const list = (editables || []).filter(Boolean);
    if (!list.length) {
      return { ok: true, changed: false, reason: 'no-editables', updated: 0 };
    }

    let next = prev;
    const updates = [];
    let updated = 0;

    list.forEach((liveEl) => {
      const eEditable = (() => {
        try {
          return liveEl.getAttribute('e-editable');
        } catch (_) {
          return null;
        }
      })();
      if (!eEditable) {
        updates.push({ eEditable: null, ok: false, reason: 'no-e-editable' });
        return;
      }

      const blockId = resolveLiveEditableBlockId(liveEl);
      let nextInner = '';
      try {
        nextInner = sanitizeEditableInnerHtml(liveEl.innerHTML);
      } catch (_) {
        nextInner = String(liveEl.innerHTML || '');
      }

      const liveText = String(liveEl.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);

      const replaced = replaceEditableInnerInHtmlString(next, eEditable, nextInner, blockId);
      if (!replaced.ok) {
        updates.push({ eEditable, blockId, ok: false, reason: replaced.reason || 'no-match', liveText });
        return;
      }

      const beforeText = String(replaced.prevInner || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);

      if (!replaced.changed) {
        updates.push({ eEditable, blockId, ok: true, changed: false, beforeText, liveText });
        return;
      }

      next = replaced.html;
      updated += 1;
      updates.push({
        eEditable,
        blockId,
        ok: true,
        changed: true,
        tagName: replaced.tagName,
        beforeText,
        liveText,
        prevInnerLen: String(replaced.prevInner || '').length,
        nextInnerLen: String(replaced.nextInner || '').length,
        needleInNext: next.indexOf(liveText.slice(0, Math.min(12, liveText.length))) !== -1,
      });
    });

    bodySyncLog('surgical-sync: updates', updates);

    if (!updated) {
      bodySyncLog('surgical-sync: no innerHTML changes', { updates });
      return { ok: true, changed: false, reason: 'no-content-change', updated: 0, updates };
    }

    const prevSignals = bodySyncSummarizeHtmlSignals(prev);
    const nextSignals = bodySyncSummarizeHtmlSignals(next);
    bodySyncLog(
      'surgical-sync-flat:prev',
      `len=${prevSignals.len} mceBody=${prevSignals.mceContentBody} ce=${prevSignals.contentEditableTrue} mceIds=${(prevSignals.mceIds || []).join(',')}`
    );
    bodySyncLog(
      'surgical-sync-flat:next',
      `len=${nextSignals.len} mceBody=${nextSignals.mceContentBody} ce=${nextSignals.contentEditableTrue} mceIds=${(nextSignals.mceIds || []).join(',')}`
    );
    bodySyncLog(
      'surgical-sync-flat:delta',
      `len=${nextSignals.len - prevSignals.len} mceBody=${nextSignals.mceContentBody - prevSignals.mceContentBody} ce=${nextSignals.contentEditableTrue - prevSignals.contentEditableTrue} updated=${updated} mode=string-preserve`
    );

    if (prev === next) {
      return { ok: true, changed: false, reason: 'serialize-identical', updated, updates };
    }

    const writeResult = writeContainerContent(container, next);
    bodySyncLog('surgical-sync: write result', {
      ...writeResult,
      updated,
      verifyLen: String(container.getAttribute('content') || '').length,
      nextLen: next.length,
    });

    return {
      ok: !!writeResult.ok,
      changed: true,
      verified: !!writeResult.ok,
      reason: writeResult.ok ? 'synced-surgical-string' : writeResult.reason,
      updated,
      updates,
      prevSignals,
      nextSignals,
      writeResult,
    };
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

      if (hasReplacement && !simulateOnly) {
        const result = applyTextReplacementsInEditableRoot(root, matcher, replacement, context);
        if (result.count > 0) {
          count += result.count;
          touched.add(root);
          if (collectChanges) {
            result.changes.forEach((item) => changes.push(item));
          }
        }
        return;
      }

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

  // Gated by debug-logging-gate.js when "Enable debug logging" is off.
  const BODY_SYNC_LOG = '[Gem][BodySync]';

  function bodySyncLog(...args) {
    try {
      console.log(BODY_SYNC_LOG, ...args);
    } catch (_) {}
  }

  function bodySyncDescribeNode(el) {
    if (!el || el.nodeType !== 1) return null;
    try {
      const tag = (el.tagName || '?').toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const eEditable = el.getAttribute('e-editable');
      const eBlockId = el.getAttribute('e-block-id');
      const ce = el.getAttribute('contenteditable');
      const cls = String(el.className || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter((c) => /^(mce-|h1|m-fs-)/.test(c) || c === 'mce-content-body' || c === 'mce-edit-focus')
        .slice(0, 8)
        .join('.');
      return {
        tag: `<${tag}${id}${eEditable != null ? ` e-editable=${eEditable}` : ''}${eBlockId ? ` e-block-id=${String(eBlockId).slice(0, 8)}` : ''}${ce != null ? ` contenteditable=${ce}` : ''}${cls ? ` .${cls}` : ''}>`,
        textSnippet: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      };
    } catch (_) {
      return { tag: '?', textSnippet: '' };
    }
  }

  function bodySyncCountInHtml(html, needle) {
    if (!html || !needle) return 0;
    let count = 0;
    let from = 0;
    while (true) {
      const idx = html.indexOf(needle, from);
      if (idx === -1) break;
      count += 1;
      from = idx + needle.length;
    }
    return count;
  }

  function bodySyncSummarizeHtmlSignals(html) {
    const source = String(html || '');
    return {
      len: source.length,
      hasDoctype: source.startsWith('<!DOCTYPE'),
      mceEditFocus: bodySyncCountInHtml(source, 'mce-edit-focus'),
      mceContentBody: bodySyncCountInHtml(source, 'mce-content-body'),
      contentEditableTrue: bodySyncCountInHtml(source, 'contenteditable="true"'),
      highlightBorderer: bodySyncCountInHtml(source, 'highlight="true"'),
      bordererElement: bodySyncCountInHtml(source, 'e-vce-borderer-element'),
      bridgeScript: bodySyncCountInHtml(source, 'gem-snippet-iframe-bridge'),
      bridgeInHead: /<script[^>]*gem-snippet-iframe-bridge[\s\S]*?<\/script>\s*<\/head>/i.test(source),
      gemHighlightContainers: bodySyncCountInHtml(source, 'gem-text-highlight-container'),
      mceIds: (source.match(/\bid="mce_\d+"/g) || []).slice(0, 8),
    };
  }

  function captureEditorInteractionProbe(doc, label = 'probe') {
    const probe = {
      label,
      at: Date.now(),
      iframe: {},
      tinymce: {},
      parent: {},
    };

    try {
      const ae = doc && doc.activeElement;
      probe.iframe.activeElement = bodySyncDescribeNode(ae);
      probe.iframe.activeIsBody = !!(ae && doc && ae === doc.body);
      probe.iframe.hasDoctype = !!(doc && doc.doctype);
      probe.iframe.eEditable = doc ? doc.querySelectorAll('[e-editable]').length : -1;
      probe.iframe.contentEditable = doc
        ? doc.querySelectorAll('[contenteditable="true"]').length
        : -1;
      probe.iframe.mceContentBody = doc ? doc.querySelectorAll('.mce-content-body').length : -1;
      probe.iframe.mceEditFocus = doc ? doc.querySelectorAll('.mce-edit-focus').length : -1;
      probe.iframe.highlightBorderer = doc
        ? doc.querySelectorAll('e-vce-borderer[highlight="true"]').length
        : -1;
      probe.iframe.bordererElement = doc
        ? doc.querySelectorAll('e-vce-borderer-element').length
        : -1;
      probe.iframe.defaultBorderer = doc
        ? doc.querySelectorAll('e-vce-borderer#editable-borderer-default').length
        : -1;
      probe.iframe.positionerBlocks = doc
        ? doc.querySelectorAll('e-vce-positioner-block').length
        : -1;
      probe.iframe.visibleDropzones = doc
        ? Array.from(
            doc.querySelectorAll(
              '.dnd_insert_dropzone, .dnd_reorder_dropzone, .two_click_insert_dropzone'
            )
          ).filter((el) => {
            try {
              return el.style && el.style.display !== 'none';
            } catch (_) {
              return false;
            }
          }).length
        : -1;
      probe.iframe.gemHighlightContainers = doc
        ? doc.querySelectorAll('#gem-text-highlight-container, [id="gem-text-highlight-container"]').length
        : -1;

      const focusedEditables = doc
        ? Array.from(doc.querySelectorAll('.mce-edit-focus, .mce-content-body'))
            .slice(0, 5)
            .map(bodySyncDescribeNode)
        : [];
      probe.iframe.sampleEditables = focusedEditables;

      try {
        const sel = doc && doc.getSelection && doc.getSelection();
        probe.iframe.selection = sel
          ? {
              rangeCount: sel.rangeCount,
              isCollapsed: sel.isCollapsed,
              type: sel.type || null,
            }
          : null;
      } catch (_) {
        probe.iframe.selection = { error: true };
      }
    } catch (e) {
      probe.iframe.error = e && e.message ? e.message : String(e);
    }

    try {
      const win = doc && doc.defaultView;
      const tm = win && (win.tinymce || win.tinyMCE);
      if (!tm) {
        probe.tinymce.available = false;
      } else {
        const editors = Array.isArray(tm.editors) ? tm.editors : [];
        probe.tinymce.available = true;
        probe.tinymce.editorCount = editors.length;
        probe.tinymce.activeEditorId = tm.activeEditor ? tm.activeEditor.id || null : null;
        probe.tinymce.editors = editors.slice(0, 8).map((editor) => {
          const info = {
            id: editor && editor.id ? editor.id : null,
            removed: !!(editor && editor.removed),
          };
          try {
            info.hasFocus =
              typeof editor.hasFocus === 'function' ? editor.hasFocus() : null;
          } catch (_) {
            info.hasFocus = 'error';
          }
          try {
            info.isDirty =
              typeof editor.isDirty === 'function' ? editor.isDirty() : editor?.isDirty;
          } catch (_) {
            info.isDirty = 'error';
          }
          try {
            const body = editor && editor.getBody && editor.getBody();
            info.body = bodySyncDescribeNode(body);
          } catch (_) {}
          try {
            info.target = bodySyncDescribeNode(editor && editor.targetElm);
          } catch (_) {}
          return info;
        });
      }
    } catch (e) {
      probe.tinymce.error = e && e.message ? e.message : String(e);
    }

    try {
      const container = resolvePreviewContainerForIframeDoc(doc);
      const content = container ? String(container.getAttribute('content') || '') : '';
      probe.parent.hasContainer = !!container;
      probe.parent.containerContent = bodySyncSummarizeHtmlSignals(content);

      // Parent-frame toolbar / overlay clues (outside the preview iframe).
      probe.parent.mceToolbars = document.querySelectorAll('.mce-toolbar, .tox-toolbar, .tox-editor-header').length;
      probe.parent.visibleMceToolbars = Array.from(
        document.querySelectorAll('.mce-toolbar, .tox-toolbar, .tox-editor-header')
      ).filter((el) => {
        try {
          const style = window.getComputedStyle(el);
          return style && style.display !== 'none' && style.visibility !== 'hidden';
        } catch (_) {
          return false;
        }
      }).length;
      probe.parent.blockToolbars = document.querySelectorAll(
        'e-vce-positioner-block, .e-contentblocks-block_toolbar, [block-toolbar-button]'
      ).length;
      probe.parent.activeElement = bodySyncDescribeNode(document.activeElement);
    } catch (e) {
      probe.parent.error = e && e.message ? e.message : String(e);
    }

    bodySyncLog(`probe:${label}`, probe);

    // Flat one-liners so console copy/paste is readable without expanding objects.
    const aeTag =
      (probe.iframe.activeElement && probe.iframe.activeElement.tag) ||
      (probe.iframe.activeIsBody ? 'BODY' : '?');
    const editors = (probe.tinymce && probe.tinymce.editors) || [];
    const editorFocus = editors
      .map((e) => `${e.id || '?'}:focus=${e.hasFocus}:dirty=${e.isDirty}:removed=${e.removed}`)
      .join(' | ');
    const samples = ((probe.iframe && probe.iframe.sampleEditables) || [])
      .map((s) => (s && s.tag) || '?')
      .join(' ;; ');
    const pc = (probe.parent && probe.parent.containerContent) || {};

    bodySyncLog(
      `probe-flat:${label}`,
      `iframe[eEditable=${probe.iframe.eEditable} ce=${probe.iframe.contentEditable} mceBody=${probe.iframe.mceContentBody} mceFocus=${probe.iframe.mceEditFocus} hlBorderer=${probe.iframe.highlightBorderer} bordererEl=${probe.iframe.bordererElement} defaultBorderer=${probe.iframe.defaultBorderer} positioners=${probe.iframe.positionerBlocks} visibleDropzones=${probe.iframe.visibleDropzones} gemHL=${probe.iframe.gemHighlightContainers} doctype=${probe.iframe.hasDoctype} active=${aeTag}]`
    );
    bodySyncLog(
      `probe-flat:${label}`,
      `tinymce[available=${probe.tinymce.available} count=${probe.tinymce.editorCount} active=${probe.tinymce.activeEditorId} editors=${editorFocus || 'none'}]`
    );
    bodySyncLog(
      `probe-flat:${label}`,
      `parent[toolbars=${probe.parent.mceToolbars} visibleToolbars=${probe.parent.visibleMceToolbars} blockToolbarNodes=${probe.parent.blockToolbars} containerLen=${pc.len} containerMceBody=${pc.mceContentBody} containerMceFocus=${pc.mceEditFocus} containerCE=${pc.contentEditableTrue} containerHL=${pc.highlightBorderer} containerBridgeInHead=${pc.bridgeInHead}]`
    );
    if (samples) {
      bodySyncLog(`probe-flat:${label}`, `samples[${samples}]`);
    }

    return probe;
  }

  function schedulePostApplyProbes(doc, reason = 'post-apply') {
    const win = (doc && doc.defaultView) || window;
    const delays = [0, 200, 500, 1000, 2000];
    delays.forEach((ms) => {
      try {
        win.setTimeout(() => {
          captureEditorInteractionProbe(doc, `${reason}+${ms}ms`);
        }, ms);
      } catch (_) {
        setTimeout(() => {
          captureEditorInteractionProbe(doc, `${reason}+${ms}ms`);
        }, ms);
      }
    });

    // Watch for Emarsys re-injecting focus/highlight chrome after we settle.
    try {
      if (!doc || typeof MutationObserver !== 'function') return;
      const interesting = [];
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes') {
            const name = mutation.attributeName || '';
            const el = mutation.target;
            if (!(el && el.nodeType === 1)) return;
            if (name === 'class') {
              const cls = String(el.className || '');
              if (cls.includes('mce-edit-focus') || cls.includes('mce-content-body')) {
                interesting.push({
                  at: Date.now(),
                  kind: 'attr-class',
                  node: bodySyncDescribeNode(el),
                  className: cls.slice(0, 120),
                });
              }
            }
            if (name === 'highlight' || name === 'contenteditable') {
              interesting.push({
                at: Date.now(),
                kind: `attr-${name}`,
                node: bodySyncDescribeNode(el),
                value: el.getAttribute(name),
              });
            }
          }
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (!node || node.nodeType !== 1) return;
              const tag = (node.tagName || '').toLowerCase();
              if (
                tag === 'e-vce-borderer' ||
                tag === 'e-vce-borderer-element' ||
                (node.id && String(node.id).includes('gem-text-highlight'))
              ) {
                interesting.push({
                  at: Date.now(),
                  kind: 'added',
                  node: bodySyncDescribeNode(node),
                  highlight: node.getAttribute && node.getAttribute('highlight'),
                });
              }
            });
          }
        });
      });
      observer.observe(doc.documentElement || doc.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'contenteditable', 'highlight', 'id'],
      });
      win.setTimeout(() => {
        try {
          observer.disconnect();
        } catch (_) {}
        bodySyncLog(`probe:${reason}+mutation-summary`, {
          eventCount: interesting.length,
          events: interesting.slice(0, 40),
        });
        bodySyncLog(
          `probe-flat:${reason}+mutation-summary`,
          `eventCount=${interesting.length} events=${interesting
            .slice(0, 20)
            .map((ev) => {
              const nodeTag = (ev.node && ev.node.tag) || '?';
              return `${ev.kind}@${nodeTag}${ev.className ? `{${ev.className}}` : ''}${ev.value != null ? `=${ev.value}` : ''}${ev.highlight != null ? ` hl=${ev.highlight}` : ''}`;
            })
            .join(' || ') || 'none'}`
        );
      }, 2200);
    } catch (e) {
      bodySyncLog('probe: mutation-observer failed', e && e.message ? e.message : e);
    }
  }

  function resolvePreviewContainerForIframeDoc(iframeDoc) {
    if (!iframeDoc) return null;
    try {
      const win = iframeDoc.defaultView;
      const frameEl = win && win.frameElement ? win.frameElement : null;
      if (frameEl && typeof frameEl.closest === 'function') {
        const fromFrame = frameEl.closest('vce-iframes-container');
        if (fromFrame) return fromFrame;
      }
      const parentDoc = frameEl && frameEl.ownerDocument ? frameEl.ownerDocument : document;
      return parentDoc.querySelector('vce-iframes-container');
    } catch (_) {
      try {
        return document.querySelector('vce-iframes-container');
      } catch (_) {
        return null;
      }
    }
  }

  // Emarsys rebuilds the preview from vce-iframes-container[content] when
  // switching languages. DOM-only edits inside the iframe are lost unless that
  // attribute (Emarsys's rendered snapshot) is updated too.
  function syncPreviewContainerContentFromIframeDoc(iframeDoc) {
    const container = resolvePreviewContainerForIframeDoc(iframeDoc);
    if (!container) {
      bodySyncLog('sync: no vce-iframes-container found');
      return { ok: false, reason: 'no-container' };
    }
    if (!iframeDoc.documentElement) {
      bodySyncLog('sync: iframe documentElement missing');
      return { ok: false, reason: 'no-documentElement' };
    }

    const html = serializeIframeDocumentHtml(iframeDoc);
    if (!html) {
      bodySyncLog('sync: empty iframe HTML');
      return { ok: false, reason: 'empty-html' };
    }

    const prev = String(container.getAttribute('content') || '');
    const changed = prev !== html;
    const prevSignals = bodySyncSummarizeHtmlSignals(prev);
    const nextSignals = bodySyncSummarizeHtmlSignals(html);
    bodySyncLog('sync: preparing container content write', {
      prevLen: prev.length,
      nextLen: html.length,
      changed,
      containerTag: container.tagName,
      hasDoctype: html.startsWith('<!DOCTYPE'),
      prevSignals,
      nextSignals,
      signalDelta: {
        mceEditFocus: nextSignals.mceEditFocus - prevSignals.mceEditFocus,
        mceContentBody: nextSignals.mceContentBody - prevSignals.mceContentBody,
        contentEditableTrue:
          nextSignals.contentEditableTrue - prevSignals.contentEditableTrue,
        highlightBorderer: nextSignals.highlightBorderer - prevSignals.highlightBorderer,
        bordererElement: nextSignals.bordererElement - prevSignals.bordererElement,
        gemHighlightContainers:
          nextSignals.gemHighlightContainers - prevSignals.gemHighlightContainers,
        bridgeInHead: {
          before: prevSignals.bridgeInHead,
          after: nextSignals.bridgeInHead,
        },
      },
    });
    bodySyncLog(
      'sync-flat:prev',
      `len=${prevSignals.len} doctype=${prevSignals.hasDoctype} mceBody=${prevSignals.mceContentBody} mceFocus=${prevSignals.mceEditFocus} ce=${prevSignals.contentEditableTrue} hl=${prevSignals.highlightBorderer} bordererEl=${prevSignals.bordererElement} bridge=${prevSignals.bridgeScript} bridgeInHead=${prevSignals.bridgeInHead} gemHL=${prevSignals.gemHighlightContainers} mceIds=${(prevSignals.mceIds || []).join(',')}`
    );
    bodySyncLog(
      'sync-flat:next',
      `len=${nextSignals.len} doctype=${nextSignals.hasDoctype} mceBody=${nextSignals.mceContentBody} mceFocus=${nextSignals.mceEditFocus} ce=${nextSignals.contentEditableTrue} hl=${nextSignals.highlightBorderer} bordererEl=${nextSignals.bordererElement} bridge=${nextSignals.bridgeScript} bridgeInHead=${nextSignals.bridgeInHead} gemHL=${nextSignals.gemHighlightContainers} mceIds=${(nextSignals.mceIds || []).join(',')}`
    );
    bodySyncLog(
      'sync-flat:delta',
      `len=${nextSignals.len - prevSignals.len} mceBody=${nextSignals.mceContentBody - prevSignals.mceContentBody} mceFocus=${nextSignals.mceEditFocus - prevSignals.mceEditFocus} ce=${nextSignals.contentEditableTrue - prevSignals.contentEditableTrue} hl=${nextSignals.highlightBorderer - prevSignals.highlightBorderer} bordererEl=${nextSignals.bordererElement - prevSignals.bordererElement} gemHL=${nextSignals.gemHighlightContainers - prevSignals.gemHighlightContainers} bridgeInHead ${prevSignals.bridgeInHead}->${nextSignals.bridgeInHead}`
    );

    if (!changed) {
      return { ok: true, changed: false, reason: 'already-in-sync' };
    }

    try {
      container.setAttribute('content', html);
    } catch (e) {
      bodySyncLog('sync: setAttribute failed', e && e.message ? e.message : e);
      return { ok: false, reason: 'setAttribute-failed' };
    }

    // Nudge host listeners that watch the container / Angular bindings.
    try {
      container.dispatchEvent(new Event('input', { bubbles: true }));
      container.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
    try {
      if (typeof CustomEvent === 'function') {
        container.dispatchEvent(
          new CustomEvent('gem:preview-content-synced', {
            bubbles: true,
            detail: { length: html.length },
          })
        );
      }
    } catch (_) {}

    const verify = String(container.getAttribute('content') || '');
    const verified = verify === html;
    bodySyncLog('sync: write result', {
      verified,
      verifyLen: verify.length,
      nextLen: html.length,
    });

    return { ok: verified, changed: true, verified, reason: verified ? 'synced' : 'verify-mismatch' };
  }

  /**
   * Emarsys VCE commits editable text through vce-plugin-editable-text
   * (change / continuousChange), not via a public TinyMCE global and not via
   * patching vce-iframes-container[content] alone. Notify those plugins after
   * a focused DOM rewrite.
   */
  function discoverVceEditableHosts() {
    const hosts = [];
    const selectors = [
      'vce-plugin-editable-text',
      'vce-preview',
      'vce-iframes-container',
      'cb-content-renderer',
      'cb-desktop-preview',
      'cb-content-preview',
    ];
    selectors.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el, idx) => {
          const proto = Object.getPrototypeOf(el);
          const methods = [];
          try {
            let obj = el;
            for (let i = 0; i < 4 && obj; i += 1) {
              Object.getOwnPropertyNames(obj).forEach((name) => {
                try {
                  if (typeof el[name] === 'function' && !methods.includes(name)) {
                    if (/change|update|content|editable|save|commit|set/i.test(name)) {
                      methods.push(name);
                    }
                  }
                } catch (_) {}
              });
              obj = Object.getPrototypeOf(obj);
            }
          } catch (_) {}
          hosts.push({
            sel,
            idx,
            tag: (el.tagName || '').toLowerCase(),
            id: el.id || null,
            editableSelector: el.getAttribute && el.getAttribute('editable-selector'),
            methods: methods.slice(0, 20),
          });
        });
      } catch (_) {}
    });
    bodySyncLog('vce-host-discovery', { count: hosts.length, hosts });
    bodySyncLog(
      'vce-host-flat',
      hosts
        .map(
          (h) =>
            `${h.tag}${h.editableSelector ? `(sel=${h.editableSelector})` : ''}:methods=${(h.methods || []).join(',') || 'none'}`
        )
        .join(' | ') || 'none'
    );
    return hosts;
  }

  function buildEditableChangeDetail(doc, editableEl) {
    const eEditable = (() => {
      try {
        return editableEl.getAttribute('e-editable');
      } catch (_) {
        return null;
      }
    })();
    const blockId = resolveLiveEditableBlockId(editableEl);
    const html = (() => {
      try {
        return sanitizeEditableInnerHtml(editableEl.innerHTML);
      } catch (_) {
        return String(editableEl.innerHTML || '');
      }
    })();
    const text = (() => {
      try {
        return String(editableEl.textContent || '');
      } catch (_) {
        return '';
      }
    })();

    // Emarsys editable ids are often blockId + editable name.
    const editableIdCandidates = [];
    if (eEditable != null) editableIdCandidates.push(String(eEditable));
    if (blockId && eEditable != null) {
      editableIdCandidates.push(`${blockId}:${eEditable}`);
      editableIdCandidates.push(`${blockId}/${eEditable}`);
      editableIdCandidates.push(`${eEditable}:${blockId}`);
    }
    try {
      if (editableEl.id) editableIdCandidates.push(editableEl.id);
    } catch (_) {}

    return {
      eEditable,
      blockId,
      html,
      text,
      editableIdCandidates,
      window: doc && doc.defaultView ? doc.defaultView : null,
    };
  }

  function notifyVceEditablePlugins(doc, editableEl) {
    const built = buildEditableChangeDetail(doc, editableEl);
    const plugins = Array.from(document.querySelectorAll('vce-plugin-editable-text'));
    const bubbles = [
      ...plugins,
      document.querySelector('vce-preview'),
      document.querySelector('vce-iframes-container'),
      document.querySelector('cb-content-renderer'),
    ].filter(Boolean);

    const fired = [];
    const uniqueIds = Array.from(new Set(built.editableIdCandidates.filter(Boolean)));
    if (!uniqueIds.length) uniqueIds.push(built.eEditable || 'unknown');

    uniqueIds.forEach((editableId) => {
      const detail = {
        editableId,
        data: built.html,
        content: built.html,
        value: built.html,
        text: built.text,
        window: built.window,
        blockId: built.blockId,
        eEditable: built.eEditable,
      };

      bubbles.forEach((target) => {
        ['change', 'continuousChange', 'update', 'input'].forEach((type) => {
          try {
            target.dispatchEvent(
              new CustomEvent(type, {
                bubbles: true,
                composed: true,
                detail,
              })
            );
            fired.push(`${(target.tagName || '?').toLowerCase()}:${type}:${editableId}`);
          } catch (_) {}
        });

        // Call likely setters/methods if present on the custom element.
        ['setContent', 'updateContent', 'updateEditable', 'change', 'onChange'].forEach((fnName) => {
          try {
            if (typeof target[fnName] === 'function') {
              target[fnName](detail);
              fired.push(`${(target.tagName || '?').toLowerCase()}:call:${fnName}`);
            }
          } catch (_) {}
        });
      });
    });

    // Bridge iframe -> parent the way many VCE plugins listen.
    try {
      const win = doc && doc.defaultView;
      if (win && win.parent && win.parent !== win) {
        uniqueIds.forEach((editableId) => {
          try {
            win.parent.postMessage(
              {
                source: 'gem-emarsys-body-sync',
                type: 'editable-change',
                editableId,
                data: built.html,
                blockId: built.blockId,
                eEditable: built.eEditable,
              },
              '*'
            );
            fired.push(`postMessage:${editableId}`);
          } catch (_) {}
        });
      }
    } catch (_) {}

    bodySyncLog('vce-notify', {
      eEditable: built.eEditable,
      blockId: built.blockId,
      pluginCount: plugins.length,
      htmlLen: built.html.length,
      textSnippet: built.text.replace(/\s+/g, ' ').trim().slice(0, 48),
      firedCount: fired.length,
      fired: fired.slice(0, 40),
    });
    bodySyncLog(
      'vce-notify-flat',
      `eEditable=${built.eEditable} block=${built.blockId || '-'} plugins=${plugins.length} fired=${fired.length} text=${built.text.replace(/\s+/g, ' ').trim().slice(0, 40)}`
    );

    return { built, plugins: plugins.length, fired };
  }

  const GEM_BODY_SYNC_MSG_EXT = 'gem-snippet-extension';
  const GEM_BODY_SYNC_MSG_BRIDGE = 'gem-snippet-iframe-bridge';
  const GEM_BODY_SYNC_BRIDGE_SCRIPT_ID = 'gem-snippet-iframe-bridge-script';

  function ensureBodySyncBridgeInjected(doc) {
    // Parent campaign page already gets gem-snippet-iframe-bridge.js via
    // manifest MAIN-world content_script. Only script-tag inject into the
    // preview iframe (often srcdoc/blob, so not matched by manifest).
    if (!doc || doc === document) return;
    try {
      if (doc.getElementById(GEM_BODY_SYNC_BRIDGE_SCRIPT_ID)) return;
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return;
      if (!doc.getElementById('gem-debug-logging-page-bridge')) {
        const gate = doc.createElement('script');
        gate.id = 'gem-debug-logging-page-bridge';
        gate.src = chrome.runtime.getURL('debug-logging-page-bridge.js');
        gate.async = false;
        (doc.documentElement || doc.head || doc.body).appendChild(gate);
      }
      const script = doc.createElement('script');
      script.id = GEM_BODY_SYNC_BRIDGE_SCRIPT_ID;
      script.src = chrome.runtime.getURL('gem-snippet-iframe-bridge.js');
      script.async = false;
      (doc.documentElement || doc.head || doc.body).appendChild(script);
      bodySyncLog('bridge-inject', { where: 'iframe' });
    } catch (e) {
      bodySyncLog('bridge-inject-failed', e && e.message ? e.message : e);
    }
  }

  function buildBridgeCommitTargets(editables) {
    return (editables || []).filter(Boolean).map((el) => {
      let html = '';
      try {
        html = sanitizeEditableInnerHtml(el.innerHTML);
      } catch (_) {
        try {
          html = String(el.innerHTML || '');
        } catch (_) {
          html = '';
        }
      }
      let eEditable = null;
      let elementId = null;
      try {
        eEditable = el.getAttribute('e-editable');
      } catch (_) {}
      try {
        elementId = el.id || null;
      } catch (_) {}
      return {
        eEditable,
        elementId,
        blockId: resolveLiveEditableBlockId(el),
        html,
      };
    });
  }

  function postMessageToBodySyncBridge(contentWindow, type, payload = {}, timeoutMs = 900) {
    return new Promise((resolve) => {
      if (!contentWindow) {
        resolve(null);
        return;
      }

      const requestId = `gem-body-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        resolve(value);
      };

      const onMessage = (event) => {
        const data = event.data;
        if (!data || data.source !== GEM_BODY_SYNC_MSG_BRIDGE || data.requestId !== requestId) {
          return;
        }
        finish(data);
      };

      window.addEventListener('message', onMessage);

      try {
        contentWindow.postMessage(
          {
            source: GEM_BODY_SYNC_MSG_EXT,
            type,
            requestId,
            ...payload,
          },
          '*'
        );
      } catch (_) {
        finish(null);
        return;
      }

      setTimeout(() => finish(null), timeoutMs);
    });
  }

  async function commitViaMainWorldBridge(doc, editables) {
    ensureBodySyncBridgeInjected(doc);
    const targets = buildBridgeCommitTargets(editables);
    if (!targets.length) {
      return { ok: false, reason: 'no-targets' };
    }

    // Give primed TinyMCE / injected bridge a beat to register editors.
    await new Promise((resolve) => setTimeout(resolve, 80));

    const iframeWin = doc && doc.defaultView;
    const attempts = [];

    // 1) Parent MAIN-world bridge (manifest injects it on the campaign page).
    try {
      const parentResult = await postMessageToBodySyncBridge(
        window,
        'commit-editable',
        { targets },
        1000
      );
      attempts.push({ where: 'parent', result: parentResult });
      if (parentResult && parentResult.ok) {
        bodySyncLog('bridge-commit: parent ok', parentResult);
        return { ok: true, where: 'parent', result: parentResult, attempts };
      }
    } catch (e) {
      attempts.push({ where: 'parent', error: e && e.message ? e.message : String(e) });
    }

    // 2) Preview iframe MAIN-world bridge (script-tag inject for srcdoc/blob frames).
    if (iframeWin && iframeWin !== window) {
      try {
        const iframeResult = await postMessageToBodySyncBridge(
          iframeWin,
          'commit-editable',
          { targets },
          1000
        );
        attempts.push({ where: 'iframe', result: iframeResult });
        if (iframeResult && iframeResult.ok) {
          bodySyncLog('bridge-commit: iframe ok', iframeResult);
          return { ok: true, where: 'iframe', result: iframeResult, attempts };
        }
      } catch (e) {
        attempts.push({ where: 'iframe', error: e && e.message ? e.message : String(e) });
      }
    }

    // 3) CustomEvent fallback on parent window (crosses isolated -> page world).
    try {
      const requestId = `gem-body-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const eventResult = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('gem-body-sync-result', onResult);
          window.removeEventListener('message', onMessage);
          resolve(value);
        };
        const onResult = (event) => {
          const detail = event && event.detail;
          if (!detail || detail.requestId !== requestId) return;
          finish(detail);
        };
        const onMessage = (event) => {
          const data = event.data;
          if (!data || data.source !== GEM_BODY_SYNC_MSG_BRIDGE || data.requestId !== requestId) {
            return;
          }
          finish(data);
        };
        window.addEventListener('gem-body-sync-result', onResult);
        window.addEventListener('message', onMessage);
        try {
          window.dispatchEvent(
            new CustomEvent('gem-body-sync-commit', {
              detail: {
                requestId,
                targets,
              },
            })
          );
        } catch (_) {
          finish(null);
          return;
        }
        setTimeout(() => finish(null), 1000);
      });
      attempts.push({ where: 'custom-event', result: eventResult });
      if (eventResult && eventResult.ok) {
        bodySyncLog('bridge-commit: custom-event ok', eventResult);
        return { ok: true, where: 'custom-event', result: eventResult, attempts };
      }
    } catch (e) {
      attempts.push({ where: 'custom-event', error: e && e.message ? e.message : String(e) });
    }

    bodySyncLog('bridge-commit: failed', { attempts });
    return { ok: false, reason: 'no-editor', attempts };
  }

  function commitEmarsysEditableChanges(doc, editables) {
    const list = (editables || []).filter(Boolean);
    const results = [];
    discoverVceEditableHosts();

    list.forEach((el, index) => {
      const info = {
        index,
        eEditable: null,
        focused: false,
        rewritten: false,
        editorFound: false,
        editorId: null,
        vceNotified: false,
      };
      try {
        info.eEditable = el.getAttribute('e-editable');
      } catch (_) {}

      try {
        el.focus({ preventScroll: true });
        info.focused = true;
      } catch (_) {
        try {
          el.focus();
          info.focused = true;
        } catch (_) {}
      }

      // Re-assign current HTML while focused so Emarsys mutation/input observers
      // see a write in an active editing session.
      try {
        const html = el.innerHTML;
        el.innerHTML = html;
        info.rewritten = true;
      } catch (_) {}

      try {
        el.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertReplacementText',
            data: null,
          })
        );
      } catch (_) {
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {}
      }
      try {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      try {
        const findEditor =
          typeof window.gemFindTinyMCEEditorForElement === 'function'
            ? window.gemFindTinyMCEEditorForElement
            : null;
        const editor = findEditor ? findEditor(doc, el) : null;
        if (editor) {
          info.editorFound = true;
          info.editorId = editor.id || null;
          try {
            if (typeof editor.setDirty === 'function') editor.setDirty(true);
          } catch (_) {}
          try {
            if (editor.undoManager && typeof editor.undoManager.add === 'function') {
              editor.undoManager.add();
            }
          } catch (_) {}
          try {
            if (typeof editor.nodeChanged === 'function') editor.nodeChanged();
          } catch (_) {}
          try {
            if (typeof editor.fire === 'function') {
              editor.fire('input');
              editor.fire('change');
              editor.fire('NodeChange');
            }
          } catch (_) {}
          try {
            if (typeof editor.save === 'function') editor.save();
          } catch (_) {}
        }
      } catch (_) {}

      try {
        const notified = notifyVceEditablePlugins(doc, el);
        info.vceNotified = !!(notified && notified.fired && notified.fired.length);
        info.vcePluginCount = notified ? notified.plugins : 0;
      } catch (e) {
        info.vceError = e && e.message ? e.message : String(e);
      }

      results.push(info);
    });

    bodySyncLog('commit: focused rewrite', {
      count: list.length,
      results,
    });
    bodySyncLog(
      'commit-flat',
      results
        .map(
          (r) =>
            `${r.eEditable || '?'}:focused=${r.focused}:rewritten=${r.rewritten}:editor=${r.editorFound ? r.editorId || 'yes' : 'no'}:vce=${r.vceNotified ? 'yes' : 'no'}(plugins=${r.vcePluginCount || 0})`
        )
        .join(' | ') || 'none'
    );

    return results;
  }

  function blurEmarsysEditables(doc, editables) {
    const list = (editables || []).filter(Boolean);
    list.forEach((el) => {
      try {
        if (typeof FocusEvent === 'function') {
          el.dispatchEvent(
            new FocusEvent('focusout', { bubbles: true, cancelable: false, relatedTarget: null })
          );
          el.dispatchEvent(
            new FocusEvent('blur', { bubbles: false, cancelable: false, relatedTarget: null })
          );
        }
      } catch (_) {}
      try {
        el.blur();
      } catch (_) {}
    });
    try {
      if (doc.body && typeof doc.body.focus === 'function') {
        doc.body.focus({ preventScroll: true });
      }
    } catch (_) {
      try {
        if (doc.body) doc.body.focus();
      } catch (_) {}
    }
  }

  function markEmailBodyDirty(doc, editables) {
    bodySyncLog('markEmailBodyDirty: start', {
      editableCount: (editables || []).length,
      editables: (editables || []).map((el) => {
        try {
          const tag = (el.tagName || '?').toLowerCase();
          const eEditable = el.getAttribute?.('e-editable');
          return `<${tag}${eEditable != null ? ` e-editable=${eEditable}` : ''}>`;
        } catch (_) {
          return '?';
        }
      }),
      hasMarkDraftDirty: typeof window.gemMarkEmarsysDraftDirty === 'function',
      hasNudgeFocus: typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function',
    });
    captureEditorInteractionProbe(doc, 'dirty:start');
    if (typeof window.gemProbeDraftSaveState === 'function') {
      window.gemProbeDraftSaveState('markEmailBodyDirty:start', {
        editableCount: (editables || []).length,
      });
    }

    // Keep legacy dirty helpers as extra signals.
    // Emarsys enables campaign Save after an enter+leave on the edited field;
    // gemNudgeEmarsysDirtyDetectionViaFocus is what historically unlocked Save.
    if (editables.length && typeof window.gemMarkEmarsysDraftDirty === 'function') {
      window.gemMarkEmarsysDraftDirty(doc, editables);
      bodySyncLog('markEmailBodyDirty: called gemMarkEmarsysDraftDirty');
    }
    if (editables.length && typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function') {
      window.gemNudgeEmarsysDirtyDetectionViaFocus(doc, editables);
      bodySyncLog('markEmailBodyDirty: called gemNudgeEmarsysDirtyDetectionViaFocus');
    }
    if (typeof window.gemScheduleDraftSaveProbes === 'function') {
      window.gemScheduleDraftSaveProbes('markEmailBodyDirty');
    }

    // Focused commit path: rewrite while focused, MAIN-world TinyMCE commit,
    // then blur / release / surgical sync.
    const win = (doc && doc.defaultView) || window;
    const delay = (ms, fn) => {
      try {
        win.setTimeout(fn, ms);
      } catch (_) {
        setTimeout(fn, ms);
      }
    };

    commitEmarsysEditableChanges(doc, editables);
    captureEditorInteractionProbe(doc, 'dirty:after-focused-rewrite');

    Promise.resolve()
      .then(() => commitViaMainWorldBridge(doc, editables))
      .then((bridgeResult) => {
        bodySyncLog('markEmailBodyDirty: bridge commit', bridgeResult);
        bodySyncLog(
          'bridge-commit-flat',
          bridgeResult
            ? `ok=${bridgeResult.ok} where=${bridgeResult.where || '-'} reason=${bridgeResult.reason || '-'} tinymce=${
                (bridgeResult.result && bridgeResult.result.tinymceWhere) ||
                (bridgeResult.attempts &&
                  bridgeResult.attempts
                    .map((a) => (a.result && a.result.tinymceWhere) || a.where)
                    .join(' || ')) ||
                '-'
              }`
            : 'no-result'
        );
        captureEditorInteractionProbe(doc, 'dirty:after-bridge-commit');

        // Give Emarsys VCE change handlers time to absorb TinyMCE dirty/change
        // before we blur/release the primed editor session.
        delay(250, () => {
          if (typeof window.gemProbeDraftSaveState === 'function') {
            window.gemProbeDraftSaveState('markEmailBodyDirty:before-deferred-blur');
          }
          blurEmarsysEditables(doc, editables);
          captureEditorInteractionProbe(doc, 'dirty:after-commit-blur');

          delay(120, () => {
            if (typeof window.gemProbeDraftSaveState === 'function') {
              window.gemProbeDraftSaveState('markEmailBodyDirty:before-release-sync');
            }
            let releaseResult = null;
            try {
              releaseResult = releaseEmarsysEditorSession(doc);
            } catch (e) {
              bodySyncLog('markEmailBodyDirty: release failed', e && e.message ? e.message : e);
            }
            captureEditorInteractionProbe(doc, 'dirty:after-deferred-release');

            let syncResult = null;
            // Keep surgical sync as a secondary snapshot write even when TinyMCE
            // commit succeeded — historically needed for language reloads.
            if (editables && editables.length) {
              try {
                syncResult = syncTouchedEditablesIntoContainerContent(doc, editables);
              } catch (e) {
                syncResult = {
                  ok: false,
                  reason: e && e.message ? e.message : 'surgical-sync-threw',
                };
                bodySyncLog('markEmailBodyDirty: surgical sync failed', syncResult.reason);
              }
            }

            bodySyncLog('markEmailBodyDirty: surgical container sync', {
              release: releaseResult,
              sync: syncResult,
              bridgeOk: !!(bridgeResult && bridgeResult.ok),
            });
            bodySyncLog(
              'sync-flat:surgical',
              syncResult
                ? `ok=${syncResult.ok} reason=${syncResult.reason} updated=${syncResult.updated || 0} changed=${!!syncResult.changed}`
                : 'no-sync'
            );

            captureEditorInteractionProbe(doc, 'dirty:after-surgical-sync');
            schedulePostApplyProbes(doc, 'dirty:post-surgical-sync');
            if (typeof window.gemProbeDraftSaveState === 'function') {
              window.gemProbeDraftSaveState('markEmailBodyDirty:after-release-sync', {
                bridgeOk: !!(bridgeResult && bridgeResult.ok),
                syncOk: !!(syncResult && syncResult.ok),
                syncChanged: !!(syncResult && syncResult.changed),
              });
            }
          });
        });
      })
      .catch((e) => {
        bodySyncLog('markEmailBodyDirty: bridge commit threw', e && e.message ? e.message : e);
        if (typeof window.gemProbeDraftSaveState === 'function') {
          window.gemProbeDraftSaveState('markEmailBodyDirty:bridge-threw', {
            error: e && e.message ? e.message : String(e),
          });
        }
        delay(60, () => {
          blurEmarsysEditables(doc, editables);
          delay(60, () => {
            try {
              releaseEmarsysEditorSession(doc);
            } catch (_) {}
            try {
              if (editables && editables.length) {
                syncTouchedEditablesIntoContainerContent(doc, editables);
              }
            } catch (_) {}
          });
        });
      });
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
    syncPreviewContainerContentFromIframeDoc,
    syncTouchedEditablesIntoContainerContent,
    releaseEmarsysEditorSession,
    commitEmarsysEditableChanges,
    isEmarsysEditableActivated,
    collectDormantEmarsysEditables,
    primeEmarsysEditablesInDoc,
    getPreviewIframe,
    getPreviewDocument,
    looksLikeHtml,
    sanitizeAllowlistedHtml,
  };
})();
