console.log("[Gem] snippets-tab.js loaded");

// Snippets storage and management
const SNIPPETS_STORAGE_KEY = 'gemSnippets';
const SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY = 'gemSnippetCategoryCollapseState';
const UNCATEGORIZED_LABEL = 'Uncategorized';
const snippetExportSelectionState = {
  active: false,
  mode: null,
  selectedIds: new Set()
};

// ------------------------------------------------------------
// Toast notifications
// ------------------------------------------------------------

function gemToast(message, opts = {}) {
  if (window.gemShowToast) window.gemShowToast(message, opts);
}

if (!window.gemShowToast) {
  window.gemShowToast = function gemShowToast(message, opts = {}) {
    try {
      const type = opts.type || 'info'; // info | success | warn | error
      const baseDurationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 2400;
      const durationMs = baseDurationMs * 2;

      let container = document.getElementById('gem-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'gem-toast-container';
        container.style.position = 'fixed';
        container.style.right = '16px';
        container.style.bottom = '16px';
        container.style.zIndex = '100000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = 'gem-toast';
      toast.style.pointerEvents = 'auto';
      toast.style.userSelect = 'text';
      toast.style.webkitUserSelect = 'text';
      toast.style.cursor = 'text';
      toast.style.padding = '10px 12px';
      toast.style.borderRadius = '10px';
      toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.20)';
      toast.style.border = '1px solid var(--token-box-default-border, rgba(0,0,0,0.12))';
      toast.style.background = 'var(--token-box-default-background, #fff)';
      toast.style.color = 'var(--token-font-default, #111)';
      toast.style.fontSize = '13px';
      toast.style.maxWidth = '420px';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'opacity 140ms ease, transform 140ms ease';

      const accent =
        type === 'success' ? 'var(--token-green-600, #16a34a)' :
        type === 'warn' ? 'var(--token-orange-600, #ea580c)' :
        type === 'error' ? 'var(--token-red-600, #dc2626)' :
        'var(--token-blue-600, #2563eb)';
      toast.style.borderLeft = `4px solid ${accent}`;

      toast.textContent = String(message || '');
      container.appendChild(toast);

      // animate in
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      let dismissTimer = null;
      let removeTimer = null;

      const dismissToast = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        removeTimer = setTimeout(() => toast.remove(), 180);
      };

      const scheduleDismiss = (delayMs) => {
        if (dismissTimer) clearTimeout(dismissTimer);
        if (removeTimer) clearTimeout(removeTimer);
        dismissTimer = setTimeout(dismissToast, delayMs);
      };

      scheduleDismiss(durationMs);

      toast.addEventListener('mouseenter', () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        if (removeTimer) clearTimeout(removeTimer);
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      toast.addEventListener('mouseleave', () => {
        scheduleDismiss(1200);
      });
    } catch (_) {}
  };
}

// Default snippets to initialize with
const DEFAULT_SNIPPETS = [
  {
    id: 'sample-esl',
    favorite: false,
    category: '',
    name: 'ESL snippet',
    description: '',
    swapKeywords: [],
    content: 'This is a sample snippet!'
  }
];

// Function to get snippets from storage (uses snippet-storage module when available)
function getSnippets(callback) {
  if (typeof window.gemLoadSnippets === 'function') {
    window.gemLoadSnippets(callback);
    return;
  }
  chrome.storage.sync.get({ [SNIPPETS_STORAGE_KEY]: DEFAULT_SNIPPETS }, (result) => {
    const snippets = result[SNIPPETS_STORAGE_KEY] || DEFAULT_SNIPPETS;
    const snippetsWithIds = snippets.map((snippet, index) => ({
      ...snippet,
      id: snippet.id || `snippet-${Date.now()}-${index}`
    }));
    callback(snippetsWithIds);
  });
}

// Function to save snippets to storage (uses snippet-storage module when available)
function saveSnippets(snippets, callback) {
  if (typeof window.gemSaveSnippets === 'function') {
    window.gemSaveSnippets(snippets, callback);
    return;
  }
  chrome.storage.sync.set({ [SNIPPETS_STORAGE_KEY]: snippets }, () => {
    if (callback) callback();
  });
}

// Function to generate the full snippet HTML
function generateSnippetHTML(name, content) {
  function escapeHtmlAttribute(value) {
    // Keep the attribute HTML-safe, but use percent-encoding for the most dangerous characters
    // inside the snippet payload (per request): <, >, ", ', space, %, {, }.
    //
    // NOTE: We still HTML-escape '&' so the attribute remains valid HTML; otherwise entity parsing
    // could mutate the payload before Emarsys reads it.
    return String(value)
      // IMPORTANT: encode '%' first so we don't accidentally re-encode the '%' we introduce below.
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

  const tokenContent = JSON.stringify({ script: content });
  // IMPORTANT:
  // We do NOT percent-encode the snippet code anymore. Percent-encoding changes characters like '=' and others,
  // which can invalidate ESL. Instead, we HTML-escape the JSON so it can live safely in an HTML attribute;
  // when parsed/inserted, the browser will decode entities back to the original characters.
  const encodedTokenContent = escapeHtmlAttribute(tokenContent);
  // Use the exact token-template from the working sample
  const encodedTokenTemplate = '%22%3C%25=%20script%20%25%3E%22';
  // token-meta should be encoded as well
  const encodedTokenMeta = '%7B%7D';

  return `<span e-token="cust_esl" token-template="${encodedTokenTemplate}" token-content="${encodedTokenContent}" token-meta="${encodedTokenMeta}" class="cbNonEditable" contenteditable="false">${name}</span>`;
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
      console.warn('[Gem] Gemma CodeMirror token base64 encode failed:', err);
      return null;
    }
  }
}

function buildGemmaCodeMirrorToken(name, content) {
  const tokenName = String(name || '').trim();
  const script = String(content ?? '');
  if (!tokenName || !script) return null;

  const meta = {
    tokenName,
    type: 'cust_esl',
    token: {
      name: tokenName,
      type: 'cust_esl',
      content: { script },
      template: '<%= script %>',
      meta: {},
    },
    preview: script,
  };

  const metaB64 = encodeBase64Utf8(JSON.stringify(meta));
  if (!metaB64) return null;

  return `{# pers-token:1 ${metaB64} #}${script}{# pers-token:1 #}`;
}

const GEM_PERS_TOKEN_RE = /\{# pers-token:1 ([^#]+) #}([\s\S]*?)\{# pers-token:1 #\}/g;
const GEM_CM_TOKEN_BLOCK_RE =
  /\{# (?:pers-token:1|cond-token:1) ([^#]+) #\}([\s\S]*?)\{# (?:pers-token:1|cond-token:1) #\}/g;

function parseCodeMirrorHtmlSegments(html) {
  const source = String(html ?? '');
  const segments = [];
  const re = new RegExp(GEM_CM_TOKEN_BLOCK_RE.source, 'g');
  let last = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', text: source.slice(last, match.index) });
    }
    segments.push({ type: 'token', text: match[0], preview: match[2] });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    segments.push({ type: 'text', text: source.slice(last) });
  }
  return segments;
}

function createDocHtmlIndexMapper(html, cmValue) {
  const htmlSource = String(html ?? '');
  const docSource = String(cmValue ?? '');

  if (!htmlSource || htmlSource === docSource) {
    const clamp = (index) => Math.max(0, Math.min(Number(index) || 0, htmlSource.length));
    return {
      docToHtml: clamp,
      htmlToDoc: clamp,
      docLength: htmlSource.length,
      htmlLength: htmlSource.length,
    };
  }

  const segments = parseCodeMirrorHtmlSegments(htmlSource);
  const plainDocChars = segments
    .filter((segment) => segment.type === 'text')
    .reduce((sum, segment) => sum + segment.text.length, 0);
  const tokenCount = segments.filter((segment) => segment.type === 'token').length;
  const remainingDocChars = Math.max(0, docSource.length - plainDocChars);
  let tokenDocLen = 1;
  if (tokenCount > 0) {
    const even = remainingDocChars / tokenCount;
    if (Number.isFinite(even) && even >= 1) {
      tokenDocLen = Math.round(even);
    }
  }

  const docEnds = [0];
  const htmlEnds = [0];
  let docPos = 0;
  let htmlPos = 0;

  segments.forEach((segment) => {
    if (segment.type === 'text') {
      docPos += segment.text.length;
      htmlPos += segment.text.length;
    } else {
      docPos += tokenDocLen;
      htmlPos += segment.text.length;
    }
    docEnds.push(docPos);
    htmlEnds.push(htmlPos);
  });

  function docToHtml(index) {
    const target = Math.max(0, Math.min(Number(index) || 0, docPos));
    for (let i = 0; i < segments.length; i += 1) {
      const segDocEnd = docEnds[i + 1];
      if (target <= segDocEnd) {
        const segDocStart = docEnds[i];
        const segHtmlStart = htmlEnds[i];
        const segment = segments[i];
        if (segment.type === 'text') {
          return segHtmlStart + (target - segDocStart);
        }
        return htmlEnds[i + 1];
      }
    }
    return htmlPos;
  }

  function htmlToDoc(index) {
    const target = Math.max(0, Math.min(Number(index) || 0, htmlPos));
    for (let i = 0; i < segments.length; i += 1) {
      const segHtmlEnd = htmlEnds[i + 1];
      if (target <= segHtmlEnd) {
        const segHtmlStart = htmlEnds[i];
        const segDocStart = docEnds[i];
        const segment = segments[i];
        if (segment.type === 'text') {
          return segDocStart + (target - segHtmlStart);
        }
        return docEnds[i + 1];
      }
    }
    return docPos;
  }

  return { docToHtml, htmlToDoc, docLength: docPos, htmlLength: htmlPos, tokenDocLen };
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

function parsePersTokensInHtml(html) {
  const source = String(html ?? '');
  const tokens = [];
  const re = new RegExp(GEM_PERS_TOKEN_RE.source, 'g');
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

function findPersTokenAtIndex(html, index) {
  const idx = Number(index);
  if (!Number.isFinite(idx)) return null;
  return (
    parsePersTokensInHtml(html).find((token) => idx >= token.start && idx < token.end) || null
  );
}

function findPersTokenByRange(html, start, end) {
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return (
    parsePersTokensInHtml(html).find((token) => token.start === s && token.end === e) ||
    parsePersTokensInHtml(html).find((token) => token.start === s) ||
    null
  );
}

function replacePersonalizableCodeMirrorTokenRange(vceCm, cmEl, start, end, wrapped, caretAfter) {
  if (!vceCm || !wrapped) return false;
  const cmInstance = resolveCodeMirrorInstance(cmEl, vceCm, null);
  const currentHtml = getCodeMirrorHtmlValue(vceCm, cmInstance);
  const safeStart = Math.max(0, Math.min(start, currentHtml.length));
  const safeEnd = Math.max(safeStart, Math.min(end, currentHtml.length));
  const newHtml = currentHtml.slice(0, safeStart) + wrapped + currentHtml.slice(safeEnd);
  const caret =
    typeof caretAfter === 'number' ? caretAfter : safeStart + String(wrapped).length;
  return refreshPersonalizableCodeMirrorFromHtml(vceCm, cmEl, cmInstance, newHtml, caret);
}

let dropEventCounter = 0;
let insertionCounter = 0;

function rangeFromDocumentPoint(doc, x, y) {
  if (!doc || typeof x !== 'number' || typeof y !== 'number') return null;
  try {
    if (typeof doc.caretRangeFromPoint === 'function') {
      return doc.caretRangeFromPoint(x, y);
    }
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos && pos.offsetNode) {
        const range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        return range;
      }
    }
  } catch (_) {}
  return null;
}

function isRangeInsideEditable(range, element) {
  if (!range || !element) return false;
  try {
    const node = range.startContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!(el && element.contains(el));
  } catch (_) {
    return false;
  }
}

function isNonCollapsedRange(range) {
  if (!range) return false;
  try {
    return !range.collapsed;
  } catch (_) {
    return false;
  }
}

// Gated by debug-logging-gate.js when "Enable debug logging" is off.
const GEM_TR_LOG = '[Gem][TokenReplace]';

function gemTrDescribeNode(node) {
  if (!node) return 'null';
  try {
    if (node.nodeType === Node.TEXT_NODE) {
      return `#text("${(node.textContent || '').slice(0, 40)}")`;
    }
    const attrs = [];
    if (node.getAttribute?.('e-token')) attrs.push(`e-token=${node.getAttribute('e-token')}`);
    if (node.hasAttribute?.('data-mce-selected')) attrs.push('data-mce-selected');
    if (node.hasAttribute?.('data-mce-bogus')) attrs.push('data-mce-bogus');
    return `<${(node.nodeName || '?').toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}> text="${(node.textContent || '').slice(0, 40)}" connected=${node.isConnected}`;
  } catch (e) {
    return `describe-error: ${e.message}`;
  }
}

function gemTrDescribeRange(range) {
  if (!range) return 'null';
  try {
    return `collapsed=${range.collapsed} | start=${gemTrDescribeNode(range.startContainer)} @${range.startOffset} | end=${gemTrDescribeNode(range.endContainer)} @${range.endOffset}`;
  } catch (e) {
    return `describe-error: ${e.message}`;
  }
}

// Emarsys re-renders the editable content on blur after our raw DOM insert,
// replacing every node with a fresh copy. Node references and live ranges die
// in that swap, so the replace target is described by identity (index among
// the editable's [e-token] nodes + attribute/text signature) and re-located
// in the current DOM when the remembered reference is disconnected.
window.gemBuildEmarsysTokenDescriptor = function (node, element) {
  if (!node || !element) return null;
  try {
    const all = Array.from(element.querySelectorAll('[e-token]'));
    const index = all.indexOf(node);
    if (index === -1) return null;
    return {
      index,
      eToken: node.getAttribute('e-token') || '',
      tokenContent: node.getAttribute('token-content') || '',
      tokenTemplate: node.getAttribute('token-template') || '',
      text: node.textContent || '',
    };
  } catch (_) {
    return null;
  }
};

window.gemRelocateEmarsysTokenNode = function (descriptor, element) {
  if (!descriptor || !element) return null;
  try {
    const all = Array.from(element.querySelectorAll('[e-token]'));
    const matches = (n) =>
      (n.getAttribute('e-token') || '') === descriptor.eToken &&
      (n.getAttribute('token-content') || '') === descriptor.tokenContent &&
      (n.getAttribute('token-template') || '') === descriptor.tokenTemplate &&
      (n.textContent || '') === descriptor.text;

    const atIndex = all[descriptor.index];
    if (atIndex && matches(atIndex)) {
      console.log(GEM_TR_LOG, 'gemRelocateEmarsysTokenNode: matched by index', descriptor.index, gemTrDescribeNode(atIndex));
      return atIndex;
    }
    const bySignature = all.filter(matches);
    if (bySignature.length) {
      console.log(GEM_TR_LOG, 'gemRelocateEmarsysTokenNode: matched by signature (candidates:', bySignature.length + ')', gemTrDescribeNode(bySignature[0]));
      return bySignature[0];
    }
    console.log(GEM_TR_LOG, 'gemRelocateEmarsysTokenNode: no match for descriptor:', descriptor, 'tokens in element:', all.length);
    return null;
  } catch (e) {
    console.log(GEM_TR_LOG, 'gemRelocateEmarsysTokenNode: error:', e.message);
    return null;
  }
};

// When the user has an Emarsys token selected (data-mce-selected), the context
// menu stores the token node itself on the ctx. Live ranges captured earlier can
// be invalidated when TinyMCE blurs (it strips the selected flag and removes its
// off-screen selection helpers), so rebuild the replace range from the node at
// the moment of insertion — re-locating a fresh copy if the node was swapped
// out by a re-render.
function resolveTokenReplaceRange(ctx) {
  let node = ctx && ctx.replaceTokenNode;
  const doc = ctx && ctx.doc;
  const element = ctx && ctx.element;
  if (!node || !doc || !element) return null;
  try {
    if (!node.isConnected || !element.contains(node)) {
      const relocated = window.gemRelocateEmarsysTokenNode(ctx.replaceTokenDescriptor, element);
      if (!relocated) {
        console.log(GEM_TR_LOG, 'resolveTokenReplaceRange: node unusable and not relocatable:', gemTrDescribeNode(node));
        return null;
      }
      console.log(GEM_TR_LOG, 'resolveTokenReplaceRange: relocated stale node to:', gemTrDescribeNode(relocated));
      node = relocated;
      ctx.replaceTokenNode = relocated;
    }
    const range = doc.createRange();
    range.selectNode(node);
    console.log(GEM_TR_LOG, 'resolveTokenReplaceRange: rebuilt range:', gemTrDescribeRange(range));
    return range;
  } catch (e) {
    console.log(GEM_TR_LOG, 'resolveTokenReplaceRange: failed:', e.message);
    return null;
  }
}

function resolveContentEditableInsertRange(ctx) {
  const doc = ctx.doc;
  const element = ctx.element;
  if (!doc || !element) return null;

  let range = resolveTokenReplaceRange(ctx);

  if (!range && ctx.savedRange && isNonCollapsedRange(ctx.savedRange) && isRangeInsideEditable(ctx.savedRange, element)) {
    range = ctx.savedRange;
  }

  if (!range && ctx.caretPoint) {
    range = rangeFromDocumentPoint(doc, ctx.caretPoint.x, ctx.caretPoint.y);
    if (range && !isRangeInsideEditable(range, element)) {
      range = null;
    }
  }

  if (!range && ctx.savedRange && isRangeInsideEditable(ctx.savedRange, element)) {
    range = ctx.savedRange;
  }

  if (!range) {
    try {
      range = doc.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
    } catch (_) {
      range = null;
    }
  }

  return range;
}

function findTinyMCEEditorForCtx(ctx) {
  const doc = ctx && ctx.doc;
  const element = ctx && ctx.element;
  if (!doc || !element) return null;

  if (ctx.tinymceEditorId && typeof window.gemFindTinyMCEEditorForElement === 'function') {
    try {
      const tm = doc.defaultView && (doc.defaultView.tinymce || doc.defaultView.tinyMCE);
      if (tm && Array.isArray(tm.editors)) {
        const byId = tm.editors.find((ed) => ed && ed.id === ctx.tinymceEditorId);
        if (byId) return byId;
      }
    } catch (_) {}
  }

  if (typeof window.gemFindTinyMCEEditorForElement === 'function') {
    return window.gemFindTinyMCEEditorForElement(doc, element);
  }
  return null;
}

function applyContentEditableInsertRange(editor, element, range) {
  if (!editor || !range || !isRangeInsideEditable(range, element)) {
    return range;
  }

  const editorDoc = editor.getDoc && editor.getDoc();
  try {
    editor.focus();
  } catch (_) {}

  if (editor.selection) {
    try {
      if (typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(range);
      }
      if (typeof editor.selection.getRng === 'function') {
        const synced = editor.selection.getRng();
        if (synced) {
          range = synced.cloneRange ? synced.cloneRange() : synced;
        }
      }
    } catch (_) {}
  }

  if (editorDoc) {
    try {
      const sel = editorDoc.getSelection && editorDoc.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (_) {}
  }

  return range;
}

function restoreContentEditableCaret(ctx) {
  const doc = ctx && ctx.doc;
  const element = ctx && ctx.element;
  if (!doc || !element) return { editor: null, range: null };

  const editor = findTinyMCEEditorForCtx(ctx);
  let range = resolveTokenReplaceRange(ctx);

  if (!range && ctx.savedRange && isNonCollapsedRange(ctx.savedRange) && isRangeInsideEditable(ctx.savedRange, element)) {
    range = ctx.savedRange;
  }

  if (!range && ctx.caretPoint) {
    range = rangeFromDocumentPoint(doc, ctx.caretPoint.x, ctx.caretPoint.y);
    if (range && !isRangeInsideEditable(range, element)) {
      range = null;
    }
  }

  if (!range && ctx.savedRange && isRangeInsideEditable(ctx.savedRange, element)) {
    range = ctx.savedRange;
  }

  if (editor) {
    if (!range && ctx.tinymceBookmark && editor.selection && typeof editor.selection.moveToBookmark === 'function') {
      try {
        editor.focus();
        editor.selection.moveToBookmark(ctx.tinymceBookmark);
        if (typeof editor.selection.getRng === 'function') {
          const tmRng = editor.selection.getRng();
          if (tmRng && isRangeInsideEditable(tmRng, element)) {
            range = tmRng.cloneRange ? tmRng.cloneRange() : tmRng;
          }
        }
      } catch (_) {
        range = null;
      }
    }

    if (range) {
      range = applyContentEditableInsertRange(editor, element, range);
    } else {
      range = resolveContentEditableInsertRange(ctx);
      if (range) {
        range = applyContentEditableInsertRange(editor, element, range);
      }
    }

    return { editor, range };
  }

  if (!range) {
    range = resolveContentEditableInsertRange(ctx);
  }

  restoreContentEditableInsertContext(doc, element, range);
  return { editor: null, range };
}

function restoreContentEditableInsertContext(doc, element, savedRange) {
  if (!doc || !element) return;
  try {
    element.focus({ preventScroll: true });
  } catch (_) {
    try { element.focus(); } catch (_) {}
  }
  if (!savedRange) return;
  try {
    const sel = doc.getSelection && doc.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  } catch (_) {}
}

const GEM_SNIPPET_MSG_EXT = 'gem-snippet-extension';
const GEM_SNIPPET_MSG_BRIDGE = 'gem-snippet-iframe-bridge';
const GEM_CARET_MARKER_ATTR = 'data-gem-caret-marker';

function appendContentEditableCaretMarker(html) {
  return `${String(html ?? '')}<span ${GEM_CARET_MARKER_ATTR}="1">\u200b</span>`;
}

function placeContentEditableCaretAfterMarker(doc, editor, element, options = {}) {
  if (!doc) return false;
  const shouldFocus = options.focus !== false;

  const marker = doc.querySelector(`[${GEM_CARET_MARKER_ATTR}]`);
  if (!marker) return false;

  try {
    const range = doc.createRange();
    range.setStartAfter(marker);
    range.collapse(true);
    marker.remove();

    if (editor && editor.selection) {
      if (shouldFocus) {
        try {
          editor.focus();
        } catch (_) {}
      }
      if (typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(range);
        if (typeof editor.nodeChanged === 'function') {
          editor.nodeChanged();
        }
        return true;
      }
    }

    if (shouldFocus && element) {
      try {
        element.focus({ preventScroll: true });
      } catch (_) {
        try {
          element.focus();
        } catch (_) {}
      }
    }

    const sel = doc.getSelection && doc.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
  } catch (_) {
    try {
      marker.remove();
    } catch (_) {}
  }

  return false;
}

function postMessageToSnippetBridge(contentWindow, type, payload = {}, timeoutMs = 600) {
  return new Promise((resolve) => {
    if (!contentWindow) {
      resolve(null);
      return;
    }

    const requestId = `gem-snippet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve(value);
    };

    const onMessage = (event) => {
      const data = event.data;
      if (!data || data.source !== GEM_SNIPPET_MSG_BRIDGE || data.requestId !== requestId) {
        return;
      }
      finish(data);
    };

    window.addEventListener('message', onMessage);

    try {
      contentWindow.postMessage(
        {
          source: GEM_SNIPPET_MSG_EXT,
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

function getNodePathInDoc(node, doc) {
  const path = [];
  let current = node;
  while (current && current !== doc) {
    const parent = current.parentNode;
    if (!parent) break;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return path;
}

function serializeRangeForBridge(range, doc) {
  if (!range || !doc) return null;
  try {
    return {
      startPath: getNodePathInDoc(range.startContainer, doc),
      startOffset: range.startOffset,
      endPath: getNodePathInDoc(range.endContainer, doc),
      endOffset: range.endOffset,
    };
  } catch (_) {
    return null;
  }
}

const GEM_REPLACE_TARGET_ATTR = 'data-gem-replace-target';

async function tryInsertViaIframeBridge(ctx, html, timeoutMs = 600) {
  const doc = ctx && ctx.doc;
  const element = ctx && ctx.element;
  if (!doc || !element || doc.defaultView === window) return false;

  const contentWindow = doc.defaultView;
  const payload = {
    editorId: ctx.tinymceEditorId || null,
    elementId: element.id || null,
    html,
    caret: ctx.bridgeCaret || null,
  };

  const caretResponse = await postMessageToSnippetBridge(
    contentWindow,
    'get-caret',
    {
      editorId: payload.editorId,
      elementId: payload.elementId,
    },
    300
  );
  if (caretResponse && caretResponse.ok && caretResponse.caret) {
    payload.caret = caretResponse.caret;
  }

  // Serialized index paths go stale when TinyMCE mutates the DOM between our
  // postMessage and the bridge's editor.focus() (fake-caret containers,
  // off-screen selection helpers). For token replacement, tag the node with an
  // attribute so the bridge can find and select it at the moment of insertion.
  // resolveTokenReplaceRange re-locates a stale node and updates
  // ctx.replaceTokenNode, so run it before tagging the node for the bridge.
  const tokenReplaceRange = resolveTokenReplaceRange(ctx);
  const tokenNode = tokenReplaceRange ? ctx.replaceTokenNode : null;
  console.log(GEM_TR_LOG, 'tryInsertViaIframeBridge: replaceTokenNode on ctx:', gemTrDescribeNode(ctx.replaceTokenNode), '-> usable:', !!tokenNode);
  if (tokenNode) {
    try {
      tokenNode.setAttribute(GEM_REPLACE_TARGET_ATTR, '1');
      payload.replaceTargetAttr = GEM_REPLACE_TARGET_ATTR;
      console.log(GEM_TR_LOG, 'tryInsertViaIframeBridge: tagged token node:', tokenNode.outerHTML.slice(0, 200));
    } catch (e) {
      console.log(GEM_TR_LOG, 'tryInsertViaIframeBridge: tagging failed:', e.message);
    }
  }

  if (tokenReplaceRange) {
    payload.selectionRange = serializeRangeForBridge(tokenReplaceRange, doc);
  } else if (
    ctx.savedRange &&
    isNonCollapsedRange(ctx.savedRange) &&
    isRangeInsideEditable(ctx.savedRange, element)
  ) {
    payload.selectionRange = serializeRangeForBridge(ctx.savedRange, doc);
  } else if (ctx.caretPoint) {
    payload.point = ctx.caretPoint;
  }

  console.log(GEM_TR_LOG, 'tryInsertViaIframeBridge: payload:', {
    editorId: payload.editorId,
    elementId: payload.elementId,
    replaceTargetAttr: payload.replaceTargetAttr || null,
    selectionRange: payload.selectionRange || null,
    point: payload.point || null,
    hasCaret: !!payload.caret,
  });

  let response = null;
  try {
    response = await postMessageToSnippetBridge(contentWindow, 'insert', payload, timeoutMs);
    console.log(GEM_TR_LOG, 'tryInsertViaIframeBridge: bridge response:', response);
  } finally {
    // The bridge strips the marker before inserting; clean up any leftovers
    // (e.g. bridge missing or insert failed) so it never reaches saved content.
    if (tokenNode) {
      try {
        doc
          .querySelectorAll(`[${GEM_REPLACE_TARGET_ATTR}]`)
          .forEach((node) => node.removeAttribute(GEM_REPLACE_TARGET_ATTR));
      } catch (_) {}
    }
  }

  return !!(response && response.ok);
}

async function insertHtmlIntoContentEditable(ctx, html, options = {}) {
  const doc = ctx && ctx.doc;
  const element = ctx && ctx.element;
  if (!doc || !element) return false;

  const bridgeTimeoutMs = options.bridgeTimeoutMs || 2500;
  const placeCaretAfter = options.placeCaretAfter === true;
  const insertHtml = placeCaretAfter ? appendContentEditableCaretMarker(html) : html;
  const isIframeDoc = doc.defaultView && doc.defaultView !== window;
  let insertedViaTinyMCE = false;

  console.log(GEM_TR_LOG, 'insertHtmlIntoContentEditable: start', {
    isIframeDoc: !!isIframeDoc,
    placeCaretAfter,
    savedRange: gemTrDescribeRange(ctx.savedRange),
    replaceTokenNode: gemTrDescribeNode(ctx.replaceTokenNode),
  });

  if (isIframeDoc) {
    insertedViaTinyMCE = await tryInsertViaIframeBridge(ctx, insertHtml, bridgeTimeoutMs);
    console.log(GEM_TR_LOG, 'insertHtmlIntoContentEditable: bridge insert ok =', insertedViaTinyMCE);
  }

  if (!insertedViaTinyMCE) {
    console.log(GEM_TR_LOG, 'insertHtmlIntoContentEditable: falling back to direct insert path');
    let { range } = restoreContentEditableCaret(ctx);
    if (!range) {
      range = resolveContentEditableInsertRange(ctx);
    }
    console.log(GEM_TR_LOG, 'insertHtmlIntoContentEditable: direct insert range:', gemTrDescribeRange(range));
    if (!range) return false;

    insertedViaTinyMCE = tryInsertContentEditableViaTinyMCE(doc, element, insertHtml, ctx);
    if (!insertedViaTinyMCE) {
      insertSnippetAtCaret(element, insertHtml, doc, null, null, range, { notifyDirty: false });
    }
  }

  // After TinyMCE/bridge insert:
  // - Never surgical-sync the preview container (Emarsys rebuilds the iframe).
  // - Never fire TinyMCE 'change' from the bridge (Emarsys throws on it).
  // - Do run the same enter/leave nudge the toolbar uses to unlock Save.
  //   (Natural blur alone is unreliable after a parent-page context-menu click.)
  if (placeCaretAfter) {
    const editor = findTinyMCEEditorForCtx(ctx);
    placeContentEditableCaretAfterMarker(doc, editor, element);
  }

  if (!insertedViaTinyMCE) {
    notifyEmarsysAfterContentEditableInsert(doc, element, {
      nudgeFocus: !placeCaretAfter,
    });
    if (placeCaretAfter) {
      const editor = findTinyMCEEditorForCtx(ctx);
      placeContentEditableCaretAfterMarker(doc, editor, element);
    }
    try {
      console.log('[Gem][DraftDirty]', 'insertHtml: dom-fallback notify', {
        placeCaretAfter,
        nudgeFocus: !placeCaretAfter,
      });
    } catch (_) {}
  } else {
    notifyEmarsysAfterContentEditableInsert(doc, element, { nudgeFocus: true });
    try {
      console.log('[Gem][DraftDirty]', 'insertHtml: tinymce-insert + toolbar-style nudge', {
        placeCaretAfter,
        elementId: element.id || null,
        eEditable: element.getAttribute?.('e-editable'),
        className: String(element.className || '').slice(0, 120),
        docHasFocus: (() => {
          try {
            return !!doc.hasFocus?.();
          } catch (_) {
            return null;
          }
        })(),
        note: 'nudgeFocus=true (cold-start if already focused); no container sync',
      });
      if (typeof window.gemProbeDraftSaveState === 'function') {
        window.gemProbeDraftSaveState('insertHtml:after-nudge-request');
      }
      if (typeof window.gemScheduleDraftSaveProbes === 'function') {
        window.gemScheduleDraftSaveProbes('insertHtml:tinymce');
      }
    } catch (_) {}
  }
  return true;
}

function tryInsertContentEditableViaTinyMCE(doc, element, html, ctx) {
  const { editor, range } = restoreContentEditableCaret(ctx);
  if (!editor) return false;

  const canInsert =
    typeof editor.execCommand === 'function' ||
    typeof editor.insertContent === 'function';
  if (!canInsert) return false;

  try {
    if (range) {
      applyContentEditableInsertRange(editor, element, range);
    }

    const insert = () => {
      if (typeof editor.execCommand === 'function') {
        editor.execCommand('mceInsertContent', false, html);
      } else {
        editor.insertContent(html);
      }
      if (typeof editor.nodeChanged === 'function') {
        editor.nodeChanged();
      }
    };

    if (editor.undoManager && typeof editor.undoManager.transact === 'function') {
      editor.undoManager.transact(insert);
    } else {
      insert();
      if (editor.undoManager && typeof editor.undoManager.add === 'function') {
        editor.undoManager.add();
      }
    }
    placeContentEditableCaretAfterMarker(doc, editor, element);
    // Match bridge handleInsert: assert dirty AFTER caret placement.
    if (typeof editor.setDirty === 'function') editor.setDirty(true);
    if (typeof editor.fire === 'function') {
      try { editor.fire('input'); } catch (_) {}
      try { editor.fire('change'); } catch (_) {}
    }
    try {
      if (editor.startContent != null) {
        const now =
          typeof editor.getContent === 'function' ? String(editor.getContent({ format: 'raw' }) || '') : '';
        editor.startContent = `${now}<!--gem-stale-start-->`;
      }
      editor.isNotDirty = false;
      if (typeof editor.setDirty === 'function') editor.setDirty(true);
    } catch (_) {}
    return true;
  } catch (e) {
    console.warn('[Gem] TinyMCE insert failed, falling back to DOM insert:', e);
    return false;
  }
}

function notifyEmarsysAfterContentEditableInsert(doc, element, { nudgeFocus = false } = {}) {
  if (!doc || !element) return;
  if (typeof window.gemMarkEmarsysDraftDirty === 'function') {
    window.gemMarkEmarsysDraftDirty(doc, [element]);
  } else {
    try {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
  }
  if (nudgeFocus && typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function') {
    window.gemNudgeEmarsysDirtyDetectionViaFocus(doc, [element]);
  }
}

function insertSnippetAtCaret(element, snippetHTML, doc, dropId = null, dropEvent = null, savedRange = null, options = {}) {
  insertionCounter++;
  const insertionId = `insert-${insertionCounter}-${Date.now()}`;
  const notifyDirty = options.notifyDirty !== false;

  console.log(`[Gem] INSERT #${insertionCounter} (${insertionId}): insertSnippetAtCaret called for element ${element.id || 'unknown'}`);
  console.log(`[Gem] INSERT #${insertionCounter}: From drop: ${dropId || 'unknown'}`);
  try {
    if (!doc || typeof doc.getSelection !== 'function') {
      console.warn('[Gem] INSERT #' + insertionCounter + ': Document getSelection not available, using fallback');
    }

    const selection = doc.getSelection();
    let range = null;

    if (savedRange) {
      range = savedRange;
    } else if (dropEvent && typeof dropEvent.clientX === 'number' && typeof dropEvent.clientY === 'number') {
      if (typeof doc.caretRangeFromPoint === 'function') {
        range = doc.caretRangeFromPoint(dropEvent.clientX, dropEvent.clientY);
      } else if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(dropEvent.clientX, dropEvent.clientY);
        if (pos && pos.offsetNode) {
          range = doc.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
    }

    if (!range && selection && typeof selection.rangeCount === 'number' && selection.rangeCount > 0) {
      try {
        const candidate = selection.getRangeAt(0);
        const container = candidate.commonAncestorContainer;
        const containerEl = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
        if (containerEl && element.contains(containerEl)) {
          range = candidate;
        }
      } catch (e) {
        console.warn('[Gem] Error accessing selection range:', e);
      }
    }

    if (!range) {
      range = doc.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
    }

    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = snippetHTML;

    const fragment = doc.createDocumentFragment();
    const nodes = Array.from(tempDiv.childNodes).filter((n) => {
      return !(n.nodeType === Node.ELEMENT_NODE && n.tagName === 'META');
    });
    nodes.forEach((n) => fragment.appendChild(n));
    const lastInserted = fragment.lastChild;

    range.deleteContents();
    range.insertNode(fragment);

    const marker = doc.querySelector(`[${GEM_CARET_MARKER_ATTR}]`);
    if (marker && selection) {
      try {
        range.setStartAfter(marker);
        range.collapse(true);
        marker.remove();
        selection.removeAllRanges();
        selection.addRange(range);
        if (notifyDirty) {
          notifyEmarsysAfterContentEditableInsert(doc, element, { nudgeFocus: true });
        }
        return;
      } catch (_) {
        try {
          marker.remove();
        } catch (_) {}
      }
    }

    if (selection) {
      if (lastInserted && lastInserted.parentNode) {
        range.setStartAfter(lastInserted);
        range.setEndAfter(lastInserted);
      } else {
        range.selectNodeContents(element);
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (notifyDirty) {
      notifyEmarsysAfterContentEditableInsert(doc, element, { nudgeFocus: true });
    }
  } catch (error) {
    console.log(`[Gem] INSERT #${insertionCounter} (${insertionId}): Error inserting snippet:`, error?.message || error);
  }
}

function insertPlainTextAtSavedRange(doc, range, text, selection) {
  if (!doc || !range) return;
  try {
    range.deleteContents();
    const textNode = doc.createTextNode(String(text ?? ''));
    range.insertNode(textNode);
    if (selection) {
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch (e) {
    console.warn('[Gem] insertPlainTextAtSavedRange failed:', e);
  }
}

function dispatchTextControlChange(el) {
  if (!el) return;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function restoreTextControlInsertContext(el, selectionStart, selectionEnd) {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch (_) {
    try { el.focus(); } catch (_) {}
  }
  try {
    const start = typeof selectionStart === 'number' ? selectionStart : el.selectionStart;
    const end = typeof selectionEnd === 'number' ? selectionEnd : el.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && el.setSelectionRange) {
      el.setSelectionRange(start, end);
    }
  } catch (_) {}
}

function tryInsertIntoTextControlViaExecCommand(el, text, selectionStart, selectionEnd) {
  if (!el) return false;
  const doc = el.ownerDocument || document;
  restoreTextControlInsertContext(el, selectionStart, selectionEnd);
  const insert = String(text ?? '');
  try {
    if (typeof doc.execCommand === 'function') {
      const ok = doc.execCommand('insertText', false, insert);
      if (ok) return true;
    }
  } catch (_) {}
  return false;
}

function notifyEmarsysAfterTextControlInsert(el, { nudgeFocus = false } = {}) {
  if (!el) return;
  const doc = el.ownerDocument || document;
  if (typeof window.gemMarkEmarsysTextControlDirty === 'function') {
    window.gemMarkEmarsysTextControlDirty(el);
  } else if (typeof window.gemMarkEmarsysDraftDirty === 'function') {
    window.gemMarkEmarsysDraftDirty(doc, [el]);
  } else {
    dispatchTextControlChange(el);
  }
  if (nudgeFocus && typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function') {
    window.gemNudgeEmarsysDirtyDetectionViaFocus(doc, [el]);
  }
}

function restoreCodeMirrorInsertContext(ctx) {
  if (!ctx) return;
  const cmEl = ctx.cmEl;
  const vceCm = cmEl ? cmEl.closest('vce-codemirror') : null;
  const cmInstance = resolveCodeMirrorInstance(cmEl, vceCm, ctx);
  const { cmFrom, cmTo, selectionStart, selectionEnd } = ctx;
  if (cmInstance) {
    try {
      cmInstance.focus && cmInstance.focus();
    } catch (_) {}
    try {
      const from = normalizeCodeMirrorPos(cmFrom);
      const to = normalizeCodeMirrorPos(cmTo) || from;
      if (from && to && typeof cmInstance.setSelection === 'function') {
        cmInstance.setSelection(from, to);
      }
    } catch (_) {}
    return;
  }
  const textarea = cmEl && cmEl.querySelector('textarea');
  if (textarea) {
    restoreTextControlInsertContext(textarea, selectionStart, selectionEnd);
  }
}

function setTextControlValue(el, value) {
  if (!el) return;
  const next = String(value ?? '');
  try {
    const proto =
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(el, next);
      return;
    }
  } catch (_) {}
  el.value = next;
}

function insertIntoTextControl(el, text, selectionStart, selectionEnd) {
  if (!el) return false;
  const start = typeof selectionStart === 'number' ? selectionStart : el.selectionStart;
  const end = typeof selectionEnd === 'number' ? selectionEnd : el.selectionEnd;
  // Always notify after insert: execCommand updates the DOM, but Emarsys only
  // commits per-language field values after its dirty/focus-out path runs.
  if (tryInsertIntoTextControlViaExecCommand(el, text, start, end)) {
    notifyEmarsysAfterTextControlInsert(el, { nudgeFocus: true });
    return true;
  }

  const value = String(el.value ?? '');
  const insert = String(text ?? '');
  restoreTextControlInsertContext(el, start, end);
  setTextControlValue(el, value.slice(0, start) + insert + value.slice(end));
  const pos = start + insert.length;
  try {
    el.selectionStart = pos;
    el.selectionEnd = pos;
  } catch (_) {}
  notifyEmarsysAfterTextControlInsert(el, { nudgeFocus: true });
  return true;
}

function syncCodeMirrorHostAttributes(cmEl, text) {
  const vceCm = cmEl ? cmEl.closest('vce-codemirror') : null;
  if (vceCm) {
    try {
      vceCm.setAttribute('html', text);
    } catch (_) {}
  }
  const htmlEditor = vceCm ? vceCm.closest('vce-html-editor') : null;
  if (htmlEditor) {
    try {
      htmlEditor.setAttribute('html', text);
    } catch (_) {}
  }
}

function extractPersonalizableCodeMirrorTokenPreview(tokenPayload) {
  const payload = String(tokenPayload ?? '');
  const metaEnd = payload.indexOf('#}');
  if (metaEnd < 0) return '';
  const tailStart = payload.indexOf('{#', metaEnd + 2);
  const preview = tailStart >= 0 ? payload.slice(metaEnd + 2, tailStart) : payload.slice(metaEnd + 2);
  return preview.trim();
}

function extractPersonalizableCodeMirrorTokenName(tokenPayload) {
  const match = String(tokenPayload ?? '').match(/\{# pers-token:1 ([^#]+?) #\}/);
  if (!match) return '';
  const meta = decodePersTokenMetaB64(match[1].trim());
  return meta?.tokenName || meta?.name || '';
}

function countCodeMirrorWidgets(cmEl) {
  if (!cmEl) return 0;
  return cmEl.querySelectorAll('.CodeMirror-widget').length;
}

function buildPersonalizableCodeMirrorCaretHints(tokenPayload, ctx, cmEl) {
  const payload = String(tokenPayload ?? '');
  return {
    tokenPayload: payload,
    preview: extractPersonalizableCodeMirrorTokenPreview(payload),
    tokenName: extractPersonalizableCodeMirrorTokenName(payload),
    trailingText: ctx?.cmTrailingText || '',
    widgetCountBefore: countCodeMirrorWidgets(cmEl),
  };
}

function resolveInsertedCodeMirrorWidget(cmEl, caretHints) {
  const widgets = cmEl ? Array.from(cmEl.querySelectorAll('.CodeMirror-widget')) : [];
  if (!widgets.length) return null;

  const tokenName = caretHints?.tokenName;
  if (tokenName) {
    const labeled = widgets.filter((node) => String(node.textContent || '').trim() === tokenName);
    if (labeled.length === 1) return labeled[0];
    if (labeled.length > 1) return labeled[labeled.length - 1];
  }

  const before = typeof caretHints?.widgetCountBefore === 'number' ? caretHints.widgetCountBefore : 0;
  if (widgets.length > before) {
    return widgets[before];
  }

  return widgets[widgets.length - 1];
}

function resolveDocIndexAfterCodeMirrorWidget(cmInstance, widget, html, cmValue, caretHints) {
  if (!cmInstance || !widget) return null;

  const htmlStr = String(html ?? '');
  const docStr = String(cmValue ?? '');
  if (!htmlStr || !docStr) return null;

  const cmRoot = widget.closest?.('.CodeMirror');
  const widgets = cmRoot ? Array.from(cmRoot.querySelectorAll('.CodeMirror-widget')) : [];
  const widgetIndex = widgets.indexOf(widget);

  const tokens = parsePersTokensInHtml(htmlStr);
  if (widgetIndex >= 0 && widgetIndex < tokens.length) {
    const htmlAfterToken = tokens[widgetIndex].end;
    if (htmlStr === docStr) {
      return htmlAfterToken;
    }
    try {
      return createDocHtmlIndexMapper(htmlStr, docStr).htmlToDoc(htmlAfterToken);
    } catch (_) {}
  }

  if (typeof cmInstance.posAtDOM !== 'function') return null;

  try {
    const pos = cmInstance.posAtDOM(widget, 0, widget);
    if (!pos || typeof cmInstance.indexFromPos !== 'function') return null;

    const startIndex = cmInstance.indexFromPos(pos);
    if (htmlStr === docStr) {
      return Math.max(0, Math.min(startIndex + 1, docStr.length));
    }

    const mapper = createDocHtmlIndexMapper(htmlStr, docStr);
    const tokenName = caretHints?.tokenName;
    if (tokenName) {
      for (const token of tokens) {
        if (token.meta?.tokenName === tokenName || token.meta?.name === tokenName) {
          return mapper.htmlToDoc(token.end);
        }
      }
    }

    return Math.max(0, Math.min(startIndex + (mapper.tokenDocLen || 1), docStr.length));
  } catch (_) {
    return null;
  }
}

function resolveDocCaretAfterTokenInsert(cmEl, cmInstance, newHtml, caretAfterHtml, caretHints = {}) {
  let cmValue = '';
  try {
    cmValue = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
  } catch (_) {}
  if (!cmValue) return null;

  const html = String(newHtml ?? '');
  const widget = resolveInsertedCodeMirrorWidget(cmEl, caretHints);
  if (widget) {
    const afterWidget = resolveDocIndexAfterCodeMirrorWidget(
      cmInstance,
      widget,
      html,
      cmValue,
      caretHints
    );
    if (typeof afterWidget === 'number' && !(afterWidget === 0 && caretAfterHtml > 5)) {
      return afterWidget;
    }
  }

  const trailing = caretHints.trailingText;
  if (trailing) {
    const idx = cmValue.indexOf(trailing);
    if (idx > 0) return idx;
    if (cmValue.endsWith(trailing)) {
      return cmValue.length - trailing.length;
    }
  }

  const preview =
    caretHints.preview ||
    extractPersonalizableCodeMirrorTokenPreview(caretHints.tokenPayload);
  if (preview) {
    const previewIndex = cmValue.indexOf(preview);
    if (previewIndex >= 0) return previewIndex + preview.length;
  }

  if (typeof caretAfterHtml === 'number' && html) {
    if (html === cmValue) {
      const docCaret = Math.max(0, Math.min(caretAfterHtml, cmValue.length));
      if (docCaret > 0 || caretAfterHtml === 0) return docCaret;
    } else {
      try {
        const docCaret = createDocHtmlIndexMapper(html, cmValue).htmlToDoc(caretAfterHtml);
        if (typeof docCaret === 'number' && !(docCaret === 0 && caretAfterHtml > 5)) {
          return Math.max(0, Math.min(docCaret, cmValue.length));
        }
      } catch (_) {}
    }
  }

  return null;
}

function setCodeMirrorDocCaret(cmEl, cmInstance, docCaret) {
  const freshCm = (cmEl && cmEl.CodeMirror) || cmInstance;
  if (!freshCm || typeof docCaret !== 'number') return false;

  try {
    if (typeof freshCm.posFromIndex === 'function' && typeof freshCm.setSelection === 'function') {
      const pos = freshCm.posFromIndex(Math.max(0, docCaret));
      freshCm.setSelection(pos, pos);
    }
    if (typeof freshCm.focus === 'function') {
      freshCm.focus();
    }
    if (typeof freshCm.save === 'function') {
      freshCm.save();
    }
    const inputField = typeof freshCm.getInputField === 'function' ? freshCm.getInputField() : null;
    if (inputField?.setSelectionRange) {
      let taIndex = docCaret;
      try {
        if (typeof freshCm.getCursor === 'function' && typeof freshCm.indexFromPos === 'function') {
          taIndex = freshCm.indexFromPos(freshCm.getCursor('from'));
        }
      } catch (_) {}
      inputField.setSelectionRange(taIndex, taIndex);
    }
    return true;
  } catch (_) {
    return false;
  }
}

function applyCodeMirrorCaretAfterInsert(cmEl, cmInstance, newHtml, caretAfterHtml, caretHints = {}) {
  const docCaret = resolveDocCaretAfterTokenInsert(
    cmEl,
    cmInstance,
    newHtml,
    caretAfterHtml,
    caretHints
  );
  if (docCaret == null) return false;
  return setCodeMirrorDocCaret(cmEl, cmInstance, docCaret);
}

function personalizableCodeMirrorContentReady(cmEl, cmInstance, newHtml, cmValue, caretHints) {
  const html = String(newHtml ?? '');
  if (!html) return true;

  const vceCm = cmEl?.closest?.('vce-codemirror');
  const attrHtml = vceCm?.getAttribute?.('html') ?? '';
  if (!cmValue || attrHtml !== html) return false;

  const widgetCount = countCodeMirrorWidgets(cmEl);
  const before = typeof caretHints?.widgetCountBefore === 'number' ? caretHints.widgetCountBefore : 0;
  if (html.includes('pers-token:1')) {
    if (widgetCount > before) return true;
    const preview =
      caretHints?.preview ||
      extractPersonalizableCodeMirrorTokenPreview(caretHints?.tokenPayload);
    if (preview && cmValue.includes(preview)) return true;
    return false;
  }

  return true;
}

function finishCodeMirrorCaretPlacement(cmEl, cmInstance, newHtml, caretAfterHtml, caretHints = {}) {
  if (typeof caretAfterHtml !== 'number' && !caretHints.preview && !caretHints.tokenPayload) {
    return;
  }

  let attempts = 0;
  const maxAttempts = 40;

  const apply = () =>
    applyCodeMirrorCaretAfterInsert(cmEl, cmInstance, newHtml, caretAfterHtml, caretHints);

  const tick = () => {
    const freshCm = (cmEl && cmEl.CodeMirror) || cmInstance;
    if (!freshCm) return;

    let cmValue = '';
    try {
      cmValue = typeof freshCm.getValue === 'function' ? freshCm.getValue() : '';
    } catch (_) {}

    if (!personalizableCodeMirrorContentReady(cmEl, freshCm, newHtml, cmValue, caretHints)) {
      if (attempts < maxAttempts) {
        attempts += 1;
        requestAnimationFrame(tick);
      }
      return;
    }

    const applied = apply();
    if (applied) {
      apply();
      setTimeout(apply, 50);
      setTimeout(apply, 150);
      setTimeout(() => {
        apply();
        const inputField =
          typeof freshCm.getInputField === 'function' ? freshCm.getInputField() : null;
        if (inputField) {
          notifyEmarsysAfterTextControlInsert(inputField, { nudgeFocus: false });
        }
        apply();
      }, 250);
      return;
    }

    if (attempts < maxAttempts) {
      attempts += 1;
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

function getCodeMirrorHtmlValue(vceCm, cmInstance) {
  if (vceCm) {
    const attrHtml = vceCm.getAttribute('html');
    if (attrHtml != null) return attrHtml;
  }
  try {
    return typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
  } catch (_) {
    return '';
  }
}

function resolveCodeMirrorInstanceFromAngular(vceCm, cmEl) {
  try {
    const ngApi = typeof ng !== 'undefined' ? ng : null;
    if (!ngApi || typeof ngApi.getComponent !== 'function') return null;

    const targets = [
      vceCm,
      vceCm?.closest?.('vce-html-editor'),
      vceCm?.closest?.('vce-code-editor'),
      cmEl,
    ].filter(Boolean);

    for (const target of targets) {
      const comp = ngApi.getComponent(target);
      if (!comp) continue;
      const candidates = [
        comp.codeMirror,
        comp.codemirror,
        comp.CodeMirror,
        comp.editor,
        comp._editor,
        comp._codemirror,
        comp.cm,
      ];
      for (const candidate of candidates) {
        if (candidate && typeof candidate.getValue === 'function') {
          return candidate;
        }
      }
    }
  } catch (_) {}
  return null;
}

function resolveCodeMirrorInstance(cmEl, vceCm, ctx) {
  if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getValue === 'function') {
    return cmEl.CodeMirror;
  }

  const host = vceCm || (cmEl && cmEl.closest && cmEl.closest('vce-codemirror'));
  if (host) {
    const candidates = [
      host.CodeMirror,
      host.codemirror,
      host.codeMirror,
      host.editor,
      host._editor,
      host._codemirror,
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate.getValue === 'function') {
        return candidate;
      }
    }
  }

  const fromAngular = resolveCodeMirrorInstanceFromAngular(vceCm, cmEl);
  if (fromAngular) return fromAngular;

  const fromCtx = ctx && ctx.cmInstance;
  if (fromCtx && typeof fromCtx.getValue === 'function') {
    return fromCtx;
  }

  return null;
}

function getCodeMirrorInsertOffsets(cmInstance, ctx) {
  if (!cmInstance) return { start: 0, end: 0 };
  try {
    const from = (ctx && ctx.cmFrom) || cmInstance.getCursor('from');
    const to = (ctx && ctx.cmTo) || cmInstance.getCursor('to');
    return {
      start: cmInstance.indexFromPos(from),
      end: cmInstance.indexFromPos(to),
    };
  } catch (_) {
    return { start: 0, end: 0 };
  }
}

function getCodeMirrorDocumentValue(cmInstance, vceCm) {
  try {
    const value = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
    if (value) return value;
  } catch (_) {}
  return getCodeMirrorHtmlValue(vceCm, cmInstance);
}

function normalizeCodeMirrorPos(pos) {
  if (!pos || typeof pos.line !== 'number' || typeof pos.ch !== 'number') return null;
  return { line: pos.line, ch: pos.ch };
}

function syncCodeMirrorContextSelection(ctx, cmInstance, cmEl) {
  if (!ctx || !cmEl) return ctx;

  const instance =
    cmInstance ||
    resolveCodeMirrorInstance(cmEl, cmEl.closest?.('vce-codemirror'), ctx) ||
    ctx.cmInstance;
  if (!instance) return ctx;

  try {
    if (typeof instance.save === 'function') instance.save();
  } catch (_) {}

  try {
    ctx.cmFrom = normalizeCodeMirrorPos(instance.getCursor('from'));
    ctx.cmTo = normalizeCodeMirrorPos(instance.getCursor('to')) || ctx.cmFrom;
    if (typeof instance.getSelection === 'function') {
      const selected = instance.getSelection();
      if (selected) ctx.cmSelectedText = selected;
    }
    if (ctx.cmFrom && typeof instance.indexFromPos === 'function') {
      ctx.selectionStart = instance.indexFromPos(ctx.cmFrom);
      ctx.selectionEnd = instance.indexFromPos(ctx.cmTo || ctx.cmFrom);
    }
    if (typeof ctx.selectionEnd === 'number') {
      try {
        const value = typeof instance.getValue === 'function' ? instance.getValue() : '';
        if (value) {
          ctx.cmTrailingText = value.slice(ctx.selectionEnd, ctx.selectionEnd + 24);
        }
      } catch (_) {}
    }
  } catch (_) {}

  const textarea = cmEl.querySelector('textarea');
  if (
    textarea &&
    typeof textarea.selectionStart === 'number' &&
    typeof textarea.selectionEnd === 'number' &&
    textarea.selectionStart !== textarea.selectionEnd &&
    typeof instance.posFromIndex === 'function'
  ) {
    const taStart = textarea.selectionStart;
    const taEnd = textarea.selectionEnd;
    if (ctx.selectionStart !== taStart || ctx.selectionEnd !== taEnd) {
      ctx.selectionStart = taStart;
      ctx.selectionEnd = taEnd;
      try {
        ctx.cmFrom = normalizeCodeMirrorPos(instance.posFromIndex(taStart));
        ctx.cmTo = normalizeCodeMirrorPos(instance.posFromIndex(taEnd));
      } catch (_) {}
      try {
        if (typeof instance.getSelection === 'function') {
          const selected = instance.getSelection();
          if (selected) ctx.cmSelectedText = selected;
        }
      } catch (_) {}
    }
  }

  return ctx;
}

function codeMirrorContextHasSelectionSpan(ctx, cmInstance) {
  if (typeof ctx?.selectionStart === 'number' && typeof ctx?.selectionEnd === 'number') {
    if (ctx.selectionStart !== ctx.selectionEnd) return true;
  }
  const from = normalizeCodeMirrorPos(ctx?.cmFrom);
  const to = normalizeCodeMirrorPos(ctx?.cmTo) || from;
  if (from && to && (from.line !== to.line || from.ch !== to.ch)) return true;
  if (ctx?.cmSelectedText) return true;
  if (cmInstance && typeof cmInstance.somethingSelected === 'function') {
    try {
      return cmInstance.somethingSelected();
    } catch (_) {}
  }
  return false;
}

function resolveCodeMirrorCaretPositions(cmInstance, cmEl, ctx) {
  if (cmInstance) {
    try {
      const from = normalizeCodeMirrorPos(cmInstance.getCursor('from'));
      const to = normalizeCodeMirrorPos(cmInstance.getCursor('to')) || from;
      if (from && to) {
        return { from, to };
      }
    } catch (_) {}
  }

  const fromCtx = normalizeCodeMirrorPos(ctx?.cmFrom);
  const toCtx = normalizeCodeMirrorPos(ctx?.cmTo) || fromCtx;
  if (fromCtx && toCtx) {
    return { from: fromCtx, to: toCtx };
  }

  const point = ctx?.cmClickPoint;
  if (cmInstance && point && typeof point.clientX === 'number' && typeof point.clientY === 'number') {
    try {
      const pos = cmInstance.coordsChar({ left: point.clientX, top: point.clientY });
      if (pos && typeof pos.line === 'number') {
        return { from: pos, to: pos };
      }
    } catch (_) {}
  }

  return null;
}

function resolveCodeMirrorTextInsertOffsets(ctx, cmInstance, cmEl, sourceText) {
  const max = String(sourceText ?? '').length;
  const clamp = (index) => Math.max(0, Math.min(typeof index === 'number' ? index : max, max));

  if (cmInstance && ctx) {
    restoreCodeMirrorSelectionOnInstance(cmInstance, ctx);
  }

  const caret = resolveCodeMirrorCaretPositions(cmInstance, cmEl, ctx);
  if (caret && cmInstance && typeof cmInstance.indexFromPos === 'function') {
    try {
      const start = clamp(cmInstance.indexFromPos(caret.from));
      const end = clamp(cmInstance.indexFromPos(caret.to));
      const hasStoredSpan =
        typeof ctx?.selectionStart === 'number' &&
        typeof ctx?.selectionEnd === 'number' &&
        ctx.selectionStart !== ctx.selectionEnd;
      const liveCollapsed = start === end;
      if (!hasStoredSpan || !liveCollapsed || (start === ctx.selectionStart && end === ctx.selectionEnd)) {
        return { start, end };
      }
    } catch (_) {}
  }

  if (typeof ctx?.selectionStart === 'number' && typeof ctx?.selectionEnd === 'number') {
    const caretPos = normalizeCodeMirrorPos(ctx?.cmFrom);
    const selectionLooksStale =
      caretPos && caretPos.ch > 0 && ctx.selectionStart === 0 && ctx.selectionEnd === 0;
    if (!selectionLooksStale) {
      return {
        start: clamp(ctx.selectionStart),
        end: clamp(ctx.selectionEnd),
      };
    }
  }

  const textarea = ctx?.cmEl?.querySelector?.('textarea');
  if (textarea) {
    const start =
      typeof textarea.selectionStart === 'number'
        ? textarea.selectionStart
        : typeof ctx?.selectionStart === 'number'
          ? ctx.selectionStart
          : null;
    const end =
      typeof textarea.selectionEnd === 'number'
        ? textarea.selectionEnd
        : typeof ctx?.selectionEnd === 'number'
          ? ctx.selectionEnd
          : null;
    if (typeof start === 'number' && typeof end === 'number') {
      return { start: clamp(start), end: clamp(end) };
    }
  }

  return { start: max, end: max };
}

function restoreCodeMirrorSelectionOnInstance(cmInstance, ctx) {
  if (!cmInstance) return;
  try {
    cmInstance.focus && cmInstance.focus();
  } catch (_) {}

  const textarea = ctx?.cmEl?.querySelector?.('textarea');
  if (
    textarea &&
    typeof textarea.selectionStart === 'number' &&
    typeof textarea.selectionEnd === 'number' &&
    textarea.selectionStart !== textarea.selectionEnd &&
    typeof cmInstance.posFromIndex === 'function'
  ) {
    const taStart = textarea.selectionStart;
    const taEnd = textarea.selectionEnd;
    if (ctx.selectionStart !== taStart || ctx.selectionEnd !== taEnd) {
      ctx.selectionStart = taStart;
      ctx.selectionEnd = taEnd;
      try {
        ctx.cmFrom = normalizeCodeMirrorPos(cmInstance.posFromIndex(taStart));
        ctx.cmTo = normalizeCodeMirrorPos(cmInstance.posFromIndex(taEnd));
      } catch (_) {}
    }
  }

  let from = normalizeCodeMirrorPos(ctx?.cmFrom);
  let to = normalizeCodeMirrorPos(ctx?.cmTo) || from;

  if (
    typeof ctx?.selectionStart === 'number' &&
    typeof ctx?.selectionEnd === 'number' &&
    ctx.selectionStart !== ctx.selectionEnd &&
    typeof cmInstance.posFromIndex === 'function' &&
    typeof cmInstance.indexFromPos === 'function'
  ) {
    try {
      const fromIndex = from ? cmInstance.indexFromPos(from) : null;
      const toIndex = to ? cmInstance.indexFromPos(to) : null;
      const indicesMatch =
        fromIndex === ctx.selectionStart && toIndex === ctx.selectionEnd;
      if (!indicesMatch) {
        from = normalizeCodeMirrorPos(cmInstance.posFromIndex(ctx.selectionStart));
        to = normalizeCodeMirrorPos(cmInstance.posFromIndex(ctx.selectionEnd));
        if (ctx) {
          ctx.cmFrom = from;
          ctx.cmTo = to;
        }
      }
    } catch (_) {}
  }

  if (from && to && typeof cmInstance.setSelection === 'function') {
    try {
      cmInstance.setSelection(from, to);
      return;
    } catch (_) {}
  }

  const point = ctx?.cmClickPoint;
  if (
    point &&
    typeof point.clientX === 'number' &&
    typeof point.clientY === 'number' &&
    typeof cmInstance.coordsChar === 'function'
  ) {
    try {
      const pos = normalizeCodeMirrorPos(
        cmInstance.coordsChar({ left: point.clientX, top: point.clientY })
      );
      if (pos && typeof cmInstance.setSelection === 'function') {
        cmInstance.setSelection(pos, pos);
      }
    } catch (_) {}
  }
}

function resolveCodeMirrorCaretForInsert(cmInstance, ctx) {
  restoreCodeMirrorSelectionOnInstance(cmInstance, ctx);
  if (cmInstance) {
    try {
      const from = normalizeCodeMirrorPos(cmInstance.getCursor('from'));
      const to = normalizeCodeMirrorPos(cmInstance.getCursor('to')) || from;
      if (from && to) return { from, to };
    } catch (_) {}
  }
  return resolveCodeMirrorCaretPositions(cmInstance, null, ctx);
}

function canUseDirectPersonalizableAttrHtmlInsert(ctx, cmInstance) {
  if (codeMirrorContextHasSelectionSpan(ctx, cmInstance)) return false;
  if (ctx?.cmFrom) return true;
  if (cmInstance && ctx?.cmClickPoint && typeof cmInstance.coordsChar === 'function') {
    return true;
  }
  if (typeof ctx?.selectionStart !== 'number' || typeof ctx?.selectionEnd !== 'number') {
    return false;
  }

  const caretPos = normalizeCodeMirrorPos(ctx?.cmFrom);
  const selectionLooksStale =
    caretPos && caretPos.ch > 0 && ctx.selectionStart === 0 && ctx.selectionEnd === 0;
  if (selectionLooksStale) return false;

  if (ctx.selectionStart > 0 || ctx.selectionEnd > 0 || ctx.selectionStart !== ctx.selectionEnd) {
    return true;
  }

  return !ctx?.cmClickPoint;
}

function tryDirectPersonalizableAttrHtmlInsert(ctx, cmEl, vceCm, cmInstance, insert) {
  const attrHtml = getCodeMirrorHtmlValue(vceCm, cmInstance);
  if (attrHtml == null) return null;
  if (!canUseDirectPersonalizableAttrHtmlInsert(ctx, cmInstance)) return null;

  let cmValue = '';
  try {
    cmValue = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
  } catch (_) {}
  if (!cmValue) cmValue = attrHtml;

  const resolved = resolveCodeMirrorTextInsertOffsets(ctx, cmInstance, cmEl, cmValue);
  let htmlStart = resolved.start;
  let htmlEnd = resolved.end;

  if (attrHtml !== cmValue) {
    const mapper = createDocHtmlIndexMapper(attrHtml, cmValue);
    htmlStart = mapper.docToHtml(resolved.start);
    htmlEnd = mapper.docToHtml(resolved.end);
  }

  const newHtml = attrHtml.slice(0, htmlStart) + insert + attrHtml.slice(htmlEnd);
  return {
    newHtml,
    insertIndex: htmlStart,
    insertEnd: htmlEnd,
    caretAfter: htmlStart + insert.length,
    path: 'direct-attrHtml',
  };
}

function locateMarkerInPersonalizableSource(vceCm, cmEl, cmInstance, marker, attrHtmlBefore, ctx) {
  const attrHtmlAfter = getCodeMirrorHtmlValue(vceCm, cmInstance);
  const textarea = cmEl?.querySelector?.('textarea');
  const candidates = [];

  if (attrHtmlAfter != null && attrHtmlAfter !== '') {
    candidates.push(attrHtmlAfter);
  }
  if (attrHtmlBefore != null && attrHtmlBefore !== '' && attrHtmlBefore !== attrHtmlAfter) {
    candidates.push(attrHtmlBefore);
  }
  if (textarea?.value) {
    const taValue = textarea.value;
    const attrLen = attrHtmlAfter != null ? attrHtmlAfter.length : attrHtmlBefore?.length || 0;
    if (taValue.length >= attrLen || taValue.indexOf(marker) >= 0) {
      candidates.push(taValue);
    }
  }

  for (const text of candidates) {
    const insertIndex = text.indexOf(marker);
    if (insertIndex >= 0) {
      return { sourceText: text, insertIndex, markerLength: marker.length };
    }
  }

  const baseHtml = attrHtmlBefore != null ? attrHtmlBefore : attrHtmlAfter;
  if (baseHtml != null && ctx) {
    const resolved = resolveCodeMirrorTextInsertOffsets(ctx, cmInstance, cmEl, baseHtml);
    return { sourceText: baseHtml, insertIndex: resolved.start, markerLength: 0 };
  }

  return null;
}

function readPersonalizableCodeMirrorSourceText(vceCm, cmEl, cmInstance) {
  const attrHtml = getCodeMirrorHtmlValue(vceCm, cmInstance);
  if (attrHtml != null && attrHtml !== '') return attrHtml;

  const textarea = cmEl?.querySelector?.('textarea');
  if (textarea && textarea.value != null && textarea.value !== '') {
    return textarea.value;
  }

  try {
    const value = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
    if (value) return value;
  } catch (_) {}

  return attrHtml != null ? attrHtml : '';
}

function focusCodeMirrorForMarkerInsert(ctx, cmEl, vceCm, cmInstance) {
  const instance = cmInstance || resolveCodeMirrorInstance(cmEl, vceCm, ctx) || ctx?.cmInstance;
  if (instance) {
    restoreCodeMirrorSelectionOnInstance(instance, ctx);
    return instance;
  }

  const textarea = cmEl?.querySelector?.('textarea');
  if (textarea) {
    try {
      textarea.focus({ preventScroll: true });
    } catch (_) {
      try {
        textarea.focus();
      } catch (_) {}
    }
    if (
      typeof ctx?.selectionStart === 'number' &&
      typeof ctx?.selectionEnd === 'number' &&
      ctx.selectionStart !== ctx.selectionEnd &&
      textarea.setSelectionRange
    ) {
      try {
        textarea.setSelectionRange(ctx.selectionStart, ctx.selectionEnd);
      } catch (_) {}
    }
  }
  return null;
}

function tryInsertMarkerViaReplaceSelection(cmInstance, marker) {
  if (!cmInstance || typeof cmInstance.replaceSelection !== 'function') return false;
  try {
    cmInstance.replaceSelection(marker);
    if (typeof cmInstance.save === 'function') {
      cmInstance.save();
    }
    return true;
  } catch (_) {}
  return false;
}

function tryInsertMarkerViaTextareaExecCommand(cmEl, marker, ctx) {
  const textarea = cmEl?.querySelector?.('textarea');
  if (!textarea) return false;

  const doc = textarea.ownerDocument || document;
  try {
    textarea.focus({ preventScroll: true });
  } catch (_) {
    try {
      textarea.focus();
    } catch (_) {}
  }

  if (
    ctx &&
    typeof ctx.selectionStart === 'number' &&
    typeof ctx.selectionEnd === 'number' &&
    typeof textarea.setSelectionRange === 'function'
  ) {
    try {
      textarea.setSelectionRange(ctx.selectionStart, ctx.selectionEnd);
    } catch (_) {}
  }

  try {
    return typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, marker);
  } catch (_) {}

  return false;
}

function insertTokenViaExecCommandMarker(ctx, cmEl, vceCm, cmInstance, insert) {
  const attrHtmlBefore = getCodeMirrorHtmlValue(vceCm, cmInstance);
  const marker = `§GEM§${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}§GEM§`;
  const resolvedInstance = focusCodeMirrorForMarkerInsert(ctx, cmEl, vceCm, cmInstance);
  const preferTextareaInsert = codeMirrorContextHasSelectionSpan(ctx, cmInstance);

  let inserted = false;
  let insertMethod = null;
  if (preferTextareaInsert) {
    inserted = tryInsertMarkerViaTextareaExecCommand(cmEl, marker, ctx);
    if (inserted) insertMethod = 'execCommand';
  }
  if (!inserted && resolvedInstance) {
    inserted = tryInsertMarkerViaReplaceSelection(resolvedInstance, marker);
    if (inserted) insertMethod = 'replaceSelection';
  }
  if (!inserted) {
    inserted = tryInsertMarkerViaTextareaExecCommand(cmEl, marker, ctx);
    if (inserted) insertMethod = 'execCommand';
  }
  if (!inserted) {
    return null;
  }

  if (resolvedInstance && typeof resolvedInstance.save === 'function') {
    try {
      resolvedInstance.save();
    } catch (_) {}
  }

  const located = locateMarkerInPersonalizableSource(
    vceCm,
    cmEl,
    resolvedInstance || cmInstance,
    marker,
    attrHtmlBefore,
    ctx
  );
  if (!located) {
    return null;
  }

  const { sourceText, insertIndex, markerLength } = located;
  const newValue =
    sourceText.slice(0, insertIndex) + insert + sourceText.slice(insertIndex + markerLength);

  return {
    newValue,
    insertIndex,
    caretAfter: insertIndex + insert.length,
    markerLength,
    insertMethod,
  };
}

function findInsertIndexViaCodeMirrorMarker(cmInstance, caret) {
  const marker = `§GEM§${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}§GEM§`;
  try {
    cmInstance.replaceRange(marker, caret.from, caret.to);
    if (typeof cmInstance.save === 'function') cmInstance.save();
  } catch (_) {
    return null;
  }

  let sourceText = '';
  try {
    sourceText = typeof cmInstance.getValue === 'function' ? cmInstance.getValue() : '';
  } catch (_) {
    return null;
  }

  let insertIndex = sourceText.indexOf(marker);
  if (insertIndex < 0 && typeof cmInstance.indexFromPos === 'function') {
    try {
      const idx = cmInstance.indexFromPos(caret.from);
      if (sourceText.slice(idx, idx + marker.length) === marker) {
        insertIndex = idx;
      }
    } catch (_) {}
  }

  if (insertIndex < 0) {
    try {
      const found = sourceText.indexOf(marker);
      if (found >= 0) {
        const end = cmInstance.posFromIndex(found + marker.length);
        cmInstance.replaceRange('', cmInstance.posFromIndex(found), end);
      }
    } catch (_) {}
    return null;
  }

  return {
    sourceText,
    insertIndex,
    markerLength: marker.length,
  };
}

function isGemDebugLoggingEnabled() {
  try {
    if (typeof window.gemIsDebugLoggingEnabled === 'function') {
      return window.gemIsDebugLoggingEnabled();
    }
  } catch (_) {}
  return false;
}

function buildPersonalizableCodeMirrorInsertDebugSnapshot(ctx, cmEl, vceCm, cmInstance, extra) {
  const attrHtml = vceCm ? vceCm.getAttribute('html') : null;
  let cmValue = '';
  try {
    cmValue = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
  } catch (_) {}
  const ta = cmEl?.querySelector?.('textarea');
  const liveFromDom = cmEl?.CodeMirror || null;
  const ctxInstance = ctx?.cmInstance || null;
  let liveIndexFromPos = null;
  try {
    if (cmInstance?.getCursor && cmInstance?.indexFromPos) {
      liveIndexFromPos = cmInstance.indexFromPos(cmInstance.getCursor('from'));
    }
  } catch (_) {}

  return {
    ...(extra || {}),
    attrHtmlLength: attrHtml != null ? attrHtml.length : null,
    getValueLength: cmValue.length,
    stringsEqual: attrHtml != null ? attrHtml === cmValue : null,
    tokenAtHtmlStart: attrHtml ? attrHtml.slice(0, 40) : null,
    getValuePreview: cmValue ? cmValue.slice(0, 40) : null,
    textareaSelection: ta ? { start: ta.selectionStart, end: ta.selectionEnd } : null,
    ctxCmFrom: ctx?.cmFrom ?? null,
    ctxCmTo: ctx?.cmTo ?? null,
    ctxSelectionStart: ctx?.selectionStart ?? null,
    ctxSelectionEnd: ctx?.selectionEnd ?? null,
    ctxCmClickPoint: ctx?.cmClickPoint ?? null,
    liveCursor: cmInstance?.getCursor?.() ?? null,
    liveIndexFromPos,
    instanceIdentity: {
      liveEqualsCmElCodeMirror: !!(cmInstance && liveFromDom && cmInstance === liveFromDom),
      liveEqualsCtxInstance: !!(cmInstance && ctxInstance && cmInstance === ctxInstance),
      ctxInstanceEqualsCmElCodeMirror: !!(
        ctxInstance &&
        liveFromDom &&
        ctxInstance === liveFromDom
      ),
    },
  };
}

function logPersonalizableCodeMirrorInsertDebug(phase, ctx, cmEl, vceCm, cmInstance, extra) {
  const snapshot = buildPersonalizableCodeMirrorInsertDebugSnapshot(ctx, cmEl, vceCm, cmInstance, {
    phase,
    ...(extra || {}),
  });

  const insertIndex = typeof extra?.insertIndex === 'number' ? extra.insertIndex : null;
  const htmlStart = typeof extra?.htmlStart === 'number' ? extra.htmlStart : insertIndex;
  const caretCh =
    typeof snapshot.ctxCmFrom?.ch === 'number'
      ? snapshot.ctxCmFrom.ch
      : snapshot.liveCursor?.ch;
  const suspiciousZero =
    phase === 'complete' &&
    (insertIndex === 0 || htmlStart === 0) &&
    typeof caretCh === 'number' &&
    caretCh > 0;

  if (suspiciousZero) {
    console.error(
      '[Gem][CmTokenInsert] Suspicious insert at index 0 while caret ch > 0. Enable Gemma debug logging for the full trace.',
      snapshot
    );
  }

  if (!isGemDebugLoggingEnabled()) return;

  console.log('[Gem][CmTokenInsert]', phase, snapshot);
}

function gemDebugPersonalizableCodeMirrorInsertState(ctx) {
  const cmEl =
    ctx?.cmEl ||
    document.querySelector('#subject-line-input .CodeMirror') ||
    document.querySelector('.CodeMirror');
  const vceCm =
    cmEl?.closest?.('vce-codemirror') ||
    document.querySelector('#subject-line-input vce-codemirror');
  const cmInstance = resolveCodeMirrorInstance(cmEl, vceCm, ctx || null);
  const snapshot = buildPersonalizableCodeMirrorInsertDebugSnapshot(
    ctx || null,
    cmEl,
    vceCm,
    cmInstance,
    { phase: 'manual' }
  );
  console.log('[Gem][CmTokenInsert] manual snapshot', snapshot);
  return snapshot;
}

function insertPersonalizationTokenIntoPersonalizableCodeMirror(ctx, tokenPayload) {
  const cmEl = ctx && ctx.cmEl;
  const vceCm = cmEl ? cmEl.closest('vce-codemirror') : null;
  const insert = String(tokenPayload ?? '');
  if (!vceCm || !insert) return false;

  const cmInstance =
    resolveCodeMirrorInstance(cmEl, vceCm, ctx) || (ctx && ctx.cmInstance) || null;

  syncCodeMirrorContextSelection(ctx, cmInstance, cmEl);

  logPersonalizableCodeMirrorInsertDebug('start', ctx, cmEl, vceCm, cmInstance, null);

  const caretHints = buildPersonalizableCodeMirrorCaretHints(insert, ctx, cmEl);
  const hasSelectionSpan = codeMirrorContextHasSelectionSpan(ctx, cmInstance);

  if (hasSelectionSpan) {
    const execResult = insertTokenViaExecCommandMarker(ctx, cmEl, vceCm, cmInstance, insert);
    if (execResult) {
      logPersonalizableCodeMirrorInsertDebug('complete', ctx, cmEl, vceCm, cmInstance, {
        path: 'execCommand-marker',
        insertMethod: execResult.insertMethod,
        insertIndex: execResult.insertIndex,
        htmlStart: execResult.insertIndex,
        caretAfter: execResult.caretAfter,
        newValueLength: execResult.newValue.length,
        markerLength: execResult.markerLength,
      });
      return refreshPersonalizableCodeMirrorFromHtml(
        vceCm,
        cmEl,
        cmInstance,
        execResult.newValue,
        execResult.caretAfter,
        caretHints
      );
    }

    logPersonalizableCodeMirrorInsertDebug(
      'execCommand-marker-missed-with-selection',
      ctx,
      cmEl,
      vceCm,
      cmInstance,
      null
    );
  }

  const directResult = tryDirectPersonalizableAttrHtmlInsert(ctx, cmEl, vceCm, cmInstance, insert);
  if (directResult) {
    logPersonalizableCodeMirrorInsertDebug('complete', ctx, cmEl, vceCm, cmInstance, {
      path: directResult.path,
      insertIndex: directResult.insertIndex,
      htmlStart: directResult.insertIndex,
      insertEnd: directResult.insertEnd,
      caretAfter: directResult.caretAfter,
      newValueLength: directResult.newHtml.length,
    });
    return refreshPersonalizableCodeMirrorFromHtml(
      vceCm,
      cmEl,
      cmInstance,
      directResult.newHtml,
      directResult.caretAfter,
      caretHints
    );
  }

  const execResult = insertTokenViaExecCommandMarker(ctx, cmEl, vceCm, cmInstance, insert);
  if (execResult) {
    logPersonalizableCodeMirrorInsertDebug('complete', ctx, cmEl, vceCm, cmInstance, {
      path: 'execCommand-marker',
      insertMethod: execResult.insertMethod,
      insertIndex: execResult.insertIndex,
      htmlStart: execResult.insertIndex,
      caretAfter: execResult.caretAfter,
      newValueLength: execResult.newValue.length,
      markerLength: execResult.markerLength,
    });
    return refreshPersonalizableCodeMirrorFromHtml(
      vceCm,
      cmEl,
      cmInstance,
      execResult.newValue,
      execResult.caretAfter,
      caretHints
    );
  }

  logPersonalizableCodeMirrorInsertDebug('execCommand-marker-missed', ctx, cmEl, vceCm, cmInstance, null);

  const caret = resolveCodeMirrorCaretForInsert(cmInstance, ctx);

  if (cmInstance && caret && typeof cmInstance.replaceRange === 'function') {
    const located = findInsertIndexViaCodeMirrorMarker(cmInstance, caret);
    if (located) {
      const { sourceText, insertIndex, markerLength } = located;
      const newValue =
        sourceText.slice(0, insertIndex) +
        insert +
        sourceText.slice(insertIndex + markerLength);
      const caretAfter = insertIndex + insert.length;
      logPersonalizableCodeMirrorInsertDebug('complete', ctx, cmEl, vceCm, cmInstance, {
        path: 'marker',
        insertIndex,
        htmlStart: insertIndex,
        caretAfter,
        newValueLength: newValue.length,
        markerLength,
      });
      return refreshPersonalizableCodeMirrorFromHtml(
        vceCm,
        cmEl,
        cmInstance,
        newValue,
        caretAfter,
        caretHints
      );
    }

    logPersonalizableCodeMirrorInsertDebug('marker-missed', ctx, cmEl, vceCm, cmInstance, { caret });

    if (typeof cmInstance.indexFromPos === 'function') {
      try {
        const sourceText =
          typeof cmInstance.getValue === 'function'
            ? cmInstance.getValue()
            : getCodeMirrorHtmlValue(vceCm, cmInstance);
        const insertIndex = cmInstance.indexFromPos(caret.from);
        const insertEnd = cmInstance.indexFromPos(caret.to);
        const newValue =
          sourceText.slice(0, insertIndex) + insert + sourceText.slice(insertEnd);
        const caretAfter = insertIndex + insert.length;
        logPersonalizableCodeMirrorInsertDebug('complete', ctx, cmEl, vceCm, cmInstance, {
          path: 'indexFromPos',
          insertIndex,
          htmlStart: insertIndex,
          insertEnd,
          caretAfter,
          newValueLength: newValue.length,
        });
        return refreshPersonalizableCodeMirrorFromHtml(
        vceCm,
        cmEl,
        cmInstance,
        newValue,
        caretAfter,
        caretHints
      );
      } catch (err) {
        logPersonalizableCodeMirrorInsertDebug('indexFromPos-error', ctx, cmEl, vceCm, cmInstance, {
          caret,
          error: err?.message || String(err),
        });
      }
    }
  }

  const attrHtml = getCodeMirrorHtmlValue(vceCm, cmInstance);
  let cmValue = '';
  try {
    cmValue = typeof cmInstance?.getValue === 'function' ? cmInstance.getValue() : '';
  } catch (_) {}
  if (!cmValue) cmValue = attrHtml;

  const resolved = resolveCodeMirrorTextInsertOffsets(ctx, cmInstance, cmEl, cmValue);
  let htmlStart = resolved.start;
  let htmlEnd = resolved.end;

  if (attrHtml !== cmValue) {
    const mapper = createDocHtmlIndexMapper(attrHtml, cmValue);
    htmlStart = mapper.docToHtml(resolved.start);
    htmlEnd = mapper.docToHtml(resolved.end);
  }

  const newHtml = attrHtml.slice(0, htmlStart) + insert + attrHtml.slice(htmlEnd);
  logPersonalizableCodeMirrorInsertDebug('complete', ctx, cmEl, vceCm, cmInstance, {
    path: 'fallback',
    htmlStart,
    htmlEnd,
    insertIndex: htmlStart,
    caretAfter: htmlStart + insert.length,
    attrHtmlLength: attrHtml.length,
    cmValueLength: cmValue.length,
    resolvedStart: resolved.start,
    resolvedEnd: resolved.end,
    newHtmlLength: newHtml.length,
  });
  return refreshPersonalizableCodeMirrorFromHtml(
    vceCm,
    cmEl,
    cmInstance,
    newHtml,
    htmlStart + insert.length,
    caretHints
  );
}

function tryInvokeAngularCodeMirrorRefresh(vceCm, newHtml) {
  try {
    const ngApi = typeof ng !== 'undefined' ? ng : null;
    if (!ngApi || typeof ngApi.getComponent !== 'function') return false;

    const targets = [
      vceCm,
      vceCm?.closest?.('vce-html-editor'),
      vceCm?.closest?.('vce-code-editor'),
      vceCm?.closest?.('vce-code-editor')?.querySelector?.('pe-code-editor-token-plugin'),
    ].filter(Boolean);

    for (const target of targets) {
      const comp = ngApi.getComponent(target);
      if (!comp) continue;

      if (typeof comp.writeValue === 'function') {
        comp.writeValue(newHtml);
        return true;
      }
      if (typeof comp.setHtml === 'function') {
        comp.setHtml(newHtml);
        return true;
      }
      if ('html' in comp) {
        const previous = comp.html;
        comp.html = newHtml;
        if (typeof comp.ngOnChanges === 'function') {
          comp.ngOnChanges({
            html: {
              currentValue: newHtml,
              previousValue: previous,
              firstChange: false,
              isFirstChange: () => false,
            },
          });
        }
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function refreshPersonalizableCodeMirrorFromHtml(
  vceCm,
  cmEl,
  cmInstance,
  newHtml,
  caretAfterHtml,
  caretHints = {}
) {
  syncCodeMirrorHostAttributes(cmEl, newHtml);

  const finish = () => {
    finishCodeMirrorCaretPlacement(cmEl, cmInstance, newHtml, caretAfterHtml, caretHints);
  };

  // Always use the attr rebuild path so Emarsys renders token widgets reliably.
  let hadAutoRefresh = null;
  try {
    hadAutoRefresh = vceCm.getAttribute('auto-refresh');
    vceCm.setAttribute('auto-refresh', 'false');
    vceCm.setAttribute('html', '');
    const htmlEditor = vceCm.closest('vce-html-editor');
    if (htmlEditor) htmlEditor.setAttribute('html', '');
  } catch (_) {}

  requestAnimationFrame(() => {
    try {
      syncCodeMirrorHostAttributes(cmEl, newHtml);
      if (hadAutoRefresh != null) {
        vceCm.setAttribute('auto-refresh', hadAutoRefresh);
      } else {
        vceCm.setAttribute('auto-refresh', 'true');
      }
    } catch (_) {}

    try {
      vceCm.dispatchEvent(new Event('input', { bubbles: true }));
      vceCm.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}

    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  });

  return true;
}

function insertIntoCodeMirror(ctx, text) {
  const cmEl = ctx && ctx.cmEl;
  const vceCm = cmEl ? cmEl.closest('vce-codemirror') : null;
  const cmInstance = resolveCodeMirrorInstance(cmEl, vceCm, ctx) || (ctx && ctx.cmInstance);
  const insert = String(text ?? '');
  if (!cmInstance && !cmEl) return false;

  restoreCodeMirrorInsertContext(ctx);

  if (cmInstance) {
    const inputField = typeof cmInstance.getInputField === 'function' ? cmInstance.getInputField() : null;
    if (inputField) {
      const start = typeof ctx.selectionStart === 'number' ? ctx.selectionStart : inputField.selectionStart;
      const end = typeof ctx.selectionEnd === 'number' ? ctx.selectionEnd : inputField.selectionEnd;
      if (tryInsertIntoTextControlViaExecCommand(inputField, insert, start, end)) {
        try {
          if (typeof cmInstance.save === 'function') cmInstance.save();
        } catch (_) {}
        const val = typeof cmInstance.getValue === 'function' ? cmInstance.getValue() : inputField.value;
        syncCodeMirrorHostAttributes(cmEl, val);
        notifyEmarsysAfterTextControlInsert(inputField, { nudgeFocus: true });
        return true;
      }
    }

    let usedCmApi = false;
    if (ctx.cmFrom && ctx.cmTo && typeof cmInstance.replaceRange === 'function') {
      cmInstance.replaceRange(insert, ctx.cmFrom, ctx.cmTo);
      usedCmApi = true;
    } else if (typeof cmInstance.replaceSelection === 'function') {
      cmInstance.replaceSelection(insert);
      usedCmApi = true;
    } else if (typeof cmInstance.setValue === 'function') {
      cmInstance.setValue(insert);
    }

    const val = typeof cmInstance.getValue === 'function' ? cmInstance.getValue() : insert;
    syncCodeMirrorHostAttributes(cmEl, val);
    if (inputField) {
      notifyEmarsysAfterTextControlInsert(inputField, { nudgeFocus: true });
    }
    return usedCmApi || typeof cmInstance.setValue === 'function';
  }

  const textarea = cmEl ? cmEl.querySelector('textarea') : null;
  if (textarea) {
    return insertIntoTextControl(textarea, insert, ctx.selectionStart, ctx.selectionEnd);
  }
  return false;
}

async function gemInsertSnippetIntoTarget(ctx, snippet, options = {}) {
  if (!ctx || !snippet) return false;
  const mode = options.mode === 'plain' ? 'plain' : 'token';

  if (snippet.kind === 'personalization') {
    const rawToken = snippet.token;
    if (!rawToken) return false;

    const token =
      typeof window.gemEnrichPersTokenWithRdsPresets === 'function'
        ? window.gemEnrichPersTokenWithRdsPresets(rawToken) || rawToken
        : rawToken;

    const preview =
      typeof window.gemBuildPersonalizationPreview === 'function'
        ? window.gemBuildPersonalizationPreview(token)
        : snippet.content || '';
    if (!preview) return false;

    if (ctx.type === 'contenteditable' && mode === 'token') {
      const html =
        typeof window.gemGeneratePersonalizationTokenHTML === 'function'
          ? window.gemGeneratePersonalizationTokenHTML(token)
          : null;
      if (!html) return false;
      return insertHtmlIntoContentEditable(ctx, html, {
        bridgeTimeoutMs: 3000,
        placeCaretAfter: true,
      });
    }

    const plainContent = preview;
    if (ctx.type === 'contenteditable') {
      const doc = ctx.doc;
      const element = ctx.element;
      if (!doc || !element) return false;
      const escaped = String(plainContent ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return insertHtmlIntoContentEditable(ctx, escaped);
    }

    if (ctx.type === 'textarea' || ctx.type === 'input') {
      return insertIntoTextControl(ctx.element, plainContent, ctx.selectionStart, ctx.selectionEnd);
    }

    if (ctx.type === 'codemirror') {
      if (mode === 'token' && ctx.personalizable) {
        const wrapped =
          typeof window.gemBuildPersonalizationCodeMirrorToken === 'function'
            ? window.gemBuildPersonalizationCodeMirrorToken(token)
            : null;
        if (!wrapped) {
          console.warn('[Gem] Personalization CodeMirror token payload generation failed');
          return false;
        }
        try {
          return insertPersonalizationTokenIntoPersonalizableCodeMirror(ctx, wrapped);
        } catch (err) {
          console.warn('[Gem] Personalization CodeMirror insert failed:', err);
          return false;
        }
      }
      return insertIntoCodeMirror(ctx, plainContent);
    }

    return false;
  }

  const content = snippet.content != null ? snippet.content : (snippet.name || '');

  if (ctx.type === 'contenteditable') {
    const doc = ctx.doc;
    const element = ctx.element;
    if (!doc || !element) return false;

    if (mode === 'token') {
      const html = generateSnippetHTML(snippet.name, content);
      return insertHtmlIntoContentEditable(ctx, html, { placeCaretAfter: true });
    }

    const escaped = String(content ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return insertHtmlIntoContentEditable(ctx, escaped);
  }

  if (ctx.type === 'textarea' || ctx.type === 'input') {
    return insertIntoTextControl(ctx.element, content, ctx.selectionStart, ctx.selectionEnd);
  }

  if (ctx.type === 'codemirror') {
    if (mode === 'token' && ctx.personalizable) {
      const wrapped = buildGemmaCodeMirrorToken(snippet.name, content);
      if (!wrapped) {
        console.warn('[Gem] Gemma CodeMirror token payload generation failed');
        return false;
      }
      try {
        return insertPersonalizationTokenIntoPersonalizableCodeMirror(ctx, wrapped);
      } catch (err) {
        console.warn('[Gem] Gemma CodeMirror insert failed:', err);
        return false;
      }
    }
    return insertIntoCodeMirror(ctx, content);
  }

  return false;
}

// Function to create the snippet modal HTML
function createSnippetModalHTML(isEditing = false) {
  return `
<div id="gem-snippet-modal" style="position: fixed; top: 0; left: 0; z-index: 614; display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;">
  <div class="e-dialog__container" tabindex="-1" style="width: 100%; max-width: 650px; height: auto; min-height: auto;">
  <header class="e-dialog__header">
    <span class="e-dialog__title">
      ${isEditing ? 'Edit' : 'Add'} Emarsys Scripting Language snippet
    </span>
    <e-tooltip class="e-dialog__close_tooltip" content="Close Dialog">
      <button type="button" id="gem-modal-close-btn" class="e-btn e-btn-borderless e-btn-onlyicon e-dialog__close e-dialog__header_actions">
        <e-icon icon="close" color="inherit">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon text-color-inherit" style="margin: 0;">×</div>
          </div>
        </e-icon>
      </button>
    </e-tooltip>
  </header>
  <div class="e-dialog__content" style="max-width: none;">
    <div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-category-input">Category</label>
        <input class="e-input" id="gem-snippet-category-input" type="text" placeholder="Optional category">
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-name-input">Snippet name</label>
        <input class="e-input" id="gem-snippet-name-input" type="text" placeholder="Enter snippet name (max 100 characters)" maxlength="100">
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline">Code snippet</label>
        <textarea class="e-input gem-scrollable" id="gem-snippet-code-input" placeholder="Enter your ESL code snippet" style="background-color:var(--token-input-default-background); font-family: var(--token-font-monospace, monospace); width: 100%; min-height: 200px; resize: vertical; padding: 10px 12px;"></textarea>
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-description-input">Description</label>
        <textarea class="e-input gem-scrollable" id="gem-snippet-description-input" placeholder="Optional description (max 200 characters)" maxlength="200" style="background-color:var(--token-input-default-background); width: 100%; min-height: 100px; resize: vertical; padding: 10px 12px;"></textarea>
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-shortcut-select">Quick-insert shortcut</label>
        <select class="e-input" id="gem-snippet-shortcut-select"><option value="0">Not assigned</option></select>
        <div class="sub-label" style="font-size:12px; opacity:0.75; margin-top:4px;">Lets you insert this snippet from the Gemma Token menu by pressing this number.</div>
      </div>
      <div style="margin-top: 6px;">
        <div style="display:flex; gap:10px; align-items:flex-end; margin-bottom:4px;">
          <div style="width:100%;">Optional Keyword for Swapping</div>
          <div style="min-width:120px;">Swap Method</div>
           <div style="min-width:140px;">Initiate From</div>
          <div style="min-width:40px;"></div>
        </div>
        <div id="gem-swap-keywords-rows"></div>
        <button class="e-btn" id="gem-add-swap-keyword-btn" type="button" style="width: 100%;">+ Add a Keyword for Swapping</button>
      </div>
    </div>
  </div>
  <div class="e-dialog__footer">
    <div class="e-buttongroup" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="e-btn e-btn-borderless e-btn-onlyicon" id="gem-modal-favorite-btn" type="button" title="Toggle favorite" aria-label="Toggle favorite" style="min-width: unset; padding: 0 8px;">
          <span id="gem-modal-favorite-icon" style="font-size: 16px; line-height: 1;">☆</span>
        </button>
        ${isEditing ? '<button class="e-btn e-btn-danger" id="gem-modal-delete-btn" type="button">Delete</button>' : ''}
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
        <button class="e-btn" id="gem-modal-cancel-btn" type="button">Cancel</button>
        <button class="e-btn e-btn-primary" id="gem-modal-ok-btn" type="button">Save</button>
      </div>
    </div>
  </div>
</div>
</div>
<div id="gem-modal-backdrop" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 613;"></div>
  `.trim();
}

// Add a Snippets tab to the vertical navigation
function initializeSnippetsTab() {
  console.log("[Gem] Initializing snippets tab");

  // Always ensure Emarsys ESL submit is disabled while validation is busy (native + Gem-patched dialogs)
  ensureEmarsysEslValidationDisableObserver();

  // When we open the Snippets tab, we hide the existing Emarsys panel(s) rather than removing them.
  // Emarsys sometimes assumes those nodes still exist and won't re-create them, which can break
  // certain tab switching sequences (Snippets -> X -> Snippets -> X).
  function hideNonRouterOutletChildren(navContent) {
    const children = Array.from(navContent.children);
    children.forEach((child) => {
      if (child.tagName === 'ROUTER-OUTLET') return;
      if (child.tagName === 'GEM-SNIPPETS') return;
      if (child.dataset && child.dataset.gemHiddenBySnippets === 'true') return;
      if (child.dataset) {
        child.dataset.gemHiddenBySnippets = 'true';
        child.dataset.gemPrevDisplay = child.style.display || '';
      }
      child.style.display = 'none';
    });
  }

  function restoreHiddenNavChildren(navContent) {
    const hidden = navContent.querySelectorAll('[data-gem-hidden-by-snippets="true"]');
    hidden.forEach((el) => {
      const prev = el.dataset ? (el.dataset.gemPrevDisplay || '') : '';
      el.style.display = prev;
      if (el.dataset) {
        delete el.dataset.gemHiddenBySnippets;
        delete el.dataset.gemPrevDisplay;
      }
    });
  }

  // Function to create the snippets tab HTML
  function createSnippetsTabHTML() {
    return `
<cb-vertical-tab id="gem-snippets-tab" value="tooltips.snippets" icon="snippets">
  <e-verticalnav-item class="gem-e-verticalnav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Snippets" role="tooltip" aria-description="Snippets">
      <div class="e-verticalnavitem__icon e-svgclickfix">
        <gem-e-icon icon="gem-snippets">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--token-icon-default-text)" aria-hidden="true"><path d="M480-80 120-436l200-244h320l200 244L480-80ZM183-680l-85-85 57-56 85 85-57 56Zm257-80v-120h80v120h-80Zm335 80-57-57 85-85 57 57-85 85ZM480-192l210-208H270l210 208ZM358-600l-99 120h442l-99-120H358Z"/></svg>
            </div>
          </div>
        </gem-e-icon>
      </div>
      </e-tooltip>

      <div class="e-verticalnavitem__value">Snippets</div>
    </div>
  </e-verticalnav-item>
</cb-vertical-tab>
    `.trim();
  }

  // Function to create the snippets content HTML
  function createSnippetsContentHTML(callback) {
    // Load snippets and generate the HTML
    getSnippets((snippets) => {
      getSnippetCategoryCollapseState((collapseState) => {
        const tablesHTML = renderSnippetsTablesHTML(snippets, collapseState);

        const html = `
<gem-snippets class="scrollable">
  <div class="e-section">
    <div class="e-section__header">
        <div class="e-section__title">Gemma Snippets</div>
    </div>
    <div class="e-section__content">
      <div class="e-margin-bottom-s">
        <input id="gem-snippet-search-input" class="e-input e-input-search" placeholder="Search" type="search">
      </div>
      <div class="e-margin-bottom-s">
        <select id="gem-snippet-filter-select" class="e-input" style="width: 100%;">
          <option value="showAll" selected>Show All</option>
          <option value="favorites">Show Favorite Snippets Only</option>
          <option value="swaps">Show Snippets with Keyword Swaps</option>
        </select>
      </div>
      <div class="gem-snippets-export-selection-controls" style="display: none;
    position: sticky; z-index: 10;    
    top: -24px;">
    <div style="display:flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: nowrap;   background: var(--token-box-default-background);
    border-bottom: 1px solid var(--token-border-default); position: relative; margin-left: -24px; margin-right: -24px; width: calc(100% + 48px);  padding: 22px 24px;">
        <div style="display:flex; flex-direction:column; align-items:flex-start;">
          <label style="display:flex; align-items:center; font-weight:bold; gap:6px; font-size:14px; line-height: 16px; cursor:pointer;">
            <input class="gem-export-select-all-checkbox" type="checkbox">
            <span class="gem-export-select-all-label">Check all</span>
          </label>
          <span class="gem-export-selected-count" style="font-size: 11px; line-height: 16px; opacity: 0.75; margin-left: 20px; margin-top: 2px;">0 selected</span>
        </div>
        <div style="margin-left: auto; display:flex; gap:10px; align-items:center;">
          <button class="e-btn e-btn-primary gem-open-selected-export-modal-btn" type="button" disabled>
            Export Selected
          </button>
          <button class="e-btn gem-cancel-snippet-export-btn" type="button">
            Cancel
          </button>
        </div>
        </div>
      </div>
      <div class="gem-snippets-tables">
        ${tablesHTML}
      </div>
      <div class="gem-add-snippet-action">
        <button class="e-btn e-btn-primary gem-add-snippet-btn" type="button" style="width: 100%;">
          Add a Snippet
        </button>
      </div>
      <div class="gem-snippet-import-export-actions" style="display: flex; gap: 10px; margin-top: 10px;">
        <button class="e-btn gem-import-snippets-btn" type="button" style="flex: 1;">
          Import
        </button>
        <button class="e-btn gem-export-snippets-btn" type="button" style="flex: 1;">
          Export
        </button>
        <button class="e-btn gem-delete-snippets-btn" type="button" style="flex: 1;">
          Delete
        </button>
      </div>
    </div>
  </div>
</gem-snippets>
        `.trim();

        callback(html);
      });
    });
  }

  function normalizeSnippetCategory(category) {
    const c = (category || '').trim();
    return c ? c : UNCATEGORIZED_LABEL;
  }

  function escapeHtmlText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------
  // Swap Keywords (multiple per snippet; backward-compatible with legacy fields)
  // ------------------------------------------------------------

  function normalizeSwapMode(mode) {
    return mode === 'plain' ? 'plain' : 'token';
  }

  function normalizeSwapMatchRule(v) {
    // partial | whole
    if (v === 'whole') return 'whole';
    return 'partial';
  }

  function normalizeSwapInitiateFrom(v) {
    // anywhere | panel | toolbar
    if (v === 'panel' || v === 'toolbar') return v;
    return 'anywhere';
  }

  function normalizeSwapKeywordsFromSnippet(snippet) {
    if (!snippet) return [];

    // New format: [{ keyword, mode }]
    if (Array.isArray(snippet.swapKeywords)) {
      const cleaned = snippet.swapKeywords
        .map((k) => ({
          keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
          mode: normalizeSwapMode(k && k.mode),
          matchRule: normalizeSwapMatchRule(k && k.matchRule),
          initiateFrom: normalizeSwapInitiateFrom(k && k.initiateFrom)
        }))
        .filter((k) => !!k.keyword);

      // Deduplicate within snippet (case-sensitive)
      const seen = new Set();
      const unique = [];
      cleaned.forEach((k) => {
        if (seen.has(k.keyword)) return;
        seen.add(k.keyword);
        unique.push(k);
      });
      return unique;
    }

    // Legacy format: swapKeyword/swapMode
    const legacyKeyword = (snippet.swapKeyword && typeof snippet.swapKeyword === 'string') ? snippet.swapKeyword.trim() : '';
    if (!legacyKeyword) return [];
    return [{ keyword: legacyKeyword, mode: normalizeSwapMode(snippet.swapMode), matchRule: 'partial', initiateFrom: 'anywhere' }];
  }

  function snippetHasAnySwapKeyword(snippet) {
    return normalizeSwapKeywordsFromSnippet(snippet).length > 0;
  }

  function renderSnippetsTablesHTML(snippets, collapseState = {}) {
    if (!snippets || snippets.length === 0) return '';

    // Group by category
    const groups = new Map();
    snippets.forEach((snippet) => {
      const category = normalizeSnippetCategory(snippet.category);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(snippet);
    });

    // Sort categories alphabetically (case-insensitive)
    const categories = Array.from(groups.keys()).sort((a, b) => {
      // Uncategorized should always appear last
      if (a === UNCATEGORIZED_LABEL && b !== UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL && a !== UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    return categories.map((category) => {
      const list = groups.get(category) || [];

      // Sort snippets within category:
      // 1) favorited first
      // 2) then name alphabetically (case-insensitive)
      list.sort((a, b) => {
        const af = !!a.favorite;
        const bf = !!b.favorite;
        if (af !== bf) return af ? -1 : 1;
        return (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });
      });

      const categoryKey = category.toLowerCase();
      const isCollapsed = !!collapseState[categoryKey];
      const toggleIcon = isCollapsed ? '▸' : '▾';
      const categoryExportCheckbox = snippetExportSelectionState.active
        ? `<input class="gem-export-category-checkbox" type="checkbox" aria-label="Select all snippets in ${escapeHtmlText(category)}" style="cursor:pointer;">`
        : '';

      const rows = list.map((snippet) => {
        const fullSnippetHTML = generateSnippetHTML(snippet.name, snippet.content);
        const snippetNameLower = (snippet.name || '').toLowerCase();
        const snippetId = String(snippet.id || '');
        const snippetIdAttr = escapeHtmlText(snippetId);
        const isSelectedForExport = snippetExportSelectionState.active && snippetExportSelectionState.selectedIds.has(snippetId);
        const exportSelectCell = snippetExportSelectionState.active
          ? `
  <td style="width: 30px; vertical-align:top; padding: 9px 2px 6px 10px;">
    <input class="gem-export-snippet-checkbox" type="checkbox" data-snippet-id="${snippetIdAttr}" ${isSelectedForExport ? 'checked' : ''} style="cursor:pointer;">
  </td>
          `.trim()
          : '';
        const favoriteStar = snippet.favorite
          ? '<span title="Favorite" aria-label="Favorite" style="margin-right: 6px; font-size: 14px; line-height: 1;">★</span>'
          : '';
        const isFav = !!snippet.favorite;
        const hasSwap = snippetHasAnySwapKeyword(snippet);
        const swapRules = normalizeSwapKeywordsFromSnippet(snippet);
        const canRunFromPanel = swapRules.some((r) => r && r.keyword && r.initiateFrom !== 'toolbar');
        const swapBtn = hasSwap
          ? `
    <e-tooltip width="200" content="Swap Keywords" permission="false">
          <button class="e-datagrid__item_action gem-swap-snippet-btn" type="button" data-snippet-id="${snippetIdAttr}" title="${canRunFromPanel ? 'Swap Keywords' : 'Swap Keywords (available from Block Toolbar only)'}" ${canRunFromPanel ? '' : 'disabled'} style="min-width: unset; padding: 2px; ${canRunFromPanel ? '' : 'opacity:0.35; cursor:not-allowed;'}">
      <gem-e-icon icon="style" color="inherit">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon e-icon-table text-color-inherit" style="/*color: var(--token-blue-600);*/">&#xF0DE;</div>
        </div>
      </gem-e-icon>
    </button>
    </e-tooltip>
          `.trim()
          : '';
        return `
<tr data-snippet-id="${snippetIdAttr}" data-snippet-name="${escapeHtmlText(snippetNameLower)}" data-gem-favorite="${isFav ? 'true' : 'false'}" data-gem-has-swap="${hasSwap ? 'true' : 'false'}">
  ${exportSelectCell}
  <td style="vertical-align:middle;padding:8px 2px 8px ${snippetExportSelectionState.active ? '4px' : '10px'}">
    <div style="display:flex; align-items:center;">
      ${favoriteStar}
      <vce-token name="${snippet.name}" data="${fullSnippetHTML.replace(/"/g, '&quot;')}">
        <span class="e-label e-label-primary" draggable="true" style="cursor: move;">${snippet.name}</span>
      </vce-token>
    </div>
  ${snippet.description ? `<div style="
        font-size: 11px;
        color: var(--token-text-default);
          line-height: 16px;
          padding-top: 5px;
          opacity: 0.6;
      ">
      ${snippet.description || ''}
      </div>
    ` : ''}
  </td>
  <td style="text-align: right; vertical-align:top; padding: 6px 6px 6px 2px;">
    <div class="gem-snippet-row-actions" style="display:flex; justify-content:flex-end; align-items:center">
      ${swapBtn}
      <e-tooltip width="200" content="Copy" permission="false">
      <button class="e-datagrid__item_action gem-borderless-btn gem-copy-snippet-btn" type="button" data-snippet-id="${snippetIdAttr}" title="Copy snippet" style="min-width: unset; padding: 2px;">
        <gem-e-icon icon="edit" color="inherit">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon e-icon-table text-color-inherit">&#xF0C9;</div>
          </div>
        </gem-e-icon>
      </button>
      </e-tooltip>
      <e-tooltip width="200" content="Edit" permission="false">
      <button class="e-datagrid__item_action gem-borderless-btn gem-edit-snippet-btn" type="button" data-snippet-id="${snippetIdAttr}" title="Edit snippet" style="min-width: unset; padding: 2px;">
        <gem-e-icon icon="edit" color="inherit">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon e-icon-table text-color-inherit">&#xF0CE;</div>
          </div>
        </gem-e-icon>
      </button>
      </e-tooltip>
    </div>
  </td>
</tr>
        `;
      }).join('');

      return `
<div class="gem-snippets-category-block" style="margin-bottom: 15px;">
  <div class="gem-snippets-category-title" style="display:flex; align-items:center; justify-content:space-between; font-weight: 600; margin: 6px 0;">
    <span style="display:flex; align-items:center; gap:6px;">
      ${categoryExportCheckbox}
      <span>${escapeHtmlText(category)}</span>
      <span class="gem-snippets-category-count" style="font-size: 10px;
    display: inline-block;
    border-radius: 4px;
    box-shadow: 0 0 0 1px;
    min-width: 16px;
    padding: 0 2px;
    height: 16px;
    line-height: 16px;
    opacity: 0.3;
    text-align: center;
    font-weight: bold;">${list.length}</span>
    </span>
    <span style="display:flex; align-items:center; gap:6px;">
      <button class="e-btn e-btn-borderless e-btn-onlyicon gem-snippets-category-rename"
              type="button"
              title="Rename category"
              aria-label="Rename category"
              data-category-key="${escapeHtmlText(categoryKey)}"
              data-category-name="${escapeHtmlText(category)}"
              style="min-width: unset; padding: 0 6px;">
        <span style="font-size: 14px; line-height: 1;">✎</span>
      </button>
      <button class="e-btn e-btn-borderless e-btn-onlyicon gem-snippets-category-toggle"
              type="button"
              title="${isCollapsed ? 'Expand' : 'Collapse'}"
              aria-label="${isCollapsed ? 'Expand category' : 'Collapse category'}"
              data-category-key="${escapeHtmlText(categoryKey)}"
              style="min-width: unset; padding: 0 6px;">
        <span style="font-size: 14px; line-height: 1;">${toggleIcon}</span>
      </button>
    </span>
  </div>
  <div class="gem-snippets-category-table-wrapper" data-category-key="${escapeHtmlText(categoryKey)}" style="${isCollapsed ? 'display:none;' : ''}">
    <table data-e-version="2" class="e-table e-table-hover e-table-bordered" style="margin-bottom: 0;">
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</div>
      `.trim();
    }).join('\n');
  }

  function getSnippetCategoryCollapseState(callback) {
    chrome.storage.local.get({ [SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY]: {} }, (result) => {
      callback(result[SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY] || {});
    });
  }

  function setSnippetCategoryCollapsed(categoryKey, collapsed, callback) {
    getSnippetCategoryCollapseState((state) => {
      const next = { ...state, [categoryKey]: !!collapsed };
      chrome.storage.local.set({ [SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY]: next }, () => {
        if (callback) callback(next);
      });
    });
  }

  function setupSnippetCategoryCollapseToggles() {
    const root = document.querySelector('gem-snippets');
    if (!root || root._gemCategoryToggleBound) return;
    root._gemCategoryToggleBound = true;

    root.addEventListener('click', (e) => {
      const renameBtn = e.target.closest && e.target.closest('.gem-snippets-category-rename');
      if (renameBtn) {
        const categoryKey = renameBtn.getAttribute('data-category-key');
        const categoryName = renameBtn.getAttribute('data-category-name') || '';
        if (!categoryKey) return;

        // Disallow renaming the synthetic Uncategorized bucket (it represents empty categories)
        if (categoryName === UNCATEGORIZED_LABEL) {
          gemToast(`"${UNCATEGORIZED_LABEL}" cannot be renamed.`, { type: 'warn', durationMs: 2400 });
          return;
        }

        const nextName = prompt('Rename category:', categoryName);
        if (nextName === null) return; // cancelled
        const trimmed = nextName.trim();
        if (!trimmed) {
          gemToast('Category name cannot be empty.', { type: 'warn', durationMs: 2200 });
          return;
        }

        renameSnippetCategory(categoryName, trimmed);
        return;
      }

      const btn = e.target.closest && e.target.closest('.gem-snippets-category-toggle');
      if (!btn) return;

      const categoryKey = btn.getAttribute('data-category-key');
      if (!categoryKey) return;

      const wrapper = root.querySelector(`.gem-snippets-category-table-wrapper[data-category-key="${CSS.escape(categoryKey)}"]`);
      if (!wrapper) return;

      const willCollapse = wrapper.style.display !== 'none';
      wrapper.style.display = willCollapse ? 'none' : '';

      // Update icon + title
      const iconSpan = btn.querySelector('span');
      if (iconSpan) iconSpan.textContent = willCollapse ? '▸' : '▾';
      btn.title = willCollapse ? 'Expand' : 'Collapse';
      btn.setAttribute('aria-label', willCollapse ? 'Expand category' : 'Collapse category');

      // Persist
      setSnippetCategoryCollapsed(categoryKey, willCollapse);
    });
  }

  function renameSnippetCategory(oldCategoryName, newCategoryName) {
    const oldName = (oldCategoryName || '').trim();
    const newName = (newCategoryName || '').trim();
    if (!oldName || !newName) return;

    // Normalize: prevent renaming into the synthetic label (would be confusing)
    if (newName === UNCATEGORIZED_LABEL) {
      gemToast(`"${UNCATEGORIZED_LABEL}" is reserved. Choose a different category name.`, { type: 'warn', durationMs: 2600 });
      return;
    }

    getSnippets((snippets) => {
      const updatedSnippets = snippets.map((s) => {
        const currentCat = normalizeSnippetCategory(s.category);
        if (currentCat.toLowerCase() === oldName.toLowerCase()) {
          return { ...s, category: newName };
        }
        return s;
      });

      // Migrate collapse-state key (old -> new) so user preference persists
      getSnippetCategoryCollapseState((state) => {
        const nextState = { ...state };
        const oldKey = oldName.toLowerCase();
        const newKey = newName.toLowerCase();

        if (Object.prototype.hasOwnProperty.call(nextState, oldKey)) {
          nextState[newKey] = nextState[oldKey];
          delete nextState[oldKey];
        }

        chrome.storage.local.set({ [SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY]: nextState });
        chrome.storage.sync.set(
          { [SNIPPETS_STORAGE_KEY]: updatedSnippets },
          () => {
            refreshSnippetsDisplay();
          }
        );
      });
    });
  }

  // ------------------------------------------------------------
  // Snippet search (filters by snippet name only)
  // ------------------------------------------------------------

  function setupSnippetsSearch() {
    const root = document.querySelector('gem-snippets');
    if (!root) return;

    const input = root.querySelector('#gem-snippet-search-input');
    if (!input) return;

    if (input._gemBound) return;
    input._gemBound = true;

    const apply = () => applySnippetSearchFilter(root, input.value || '');
    input.addEventListener('input', apply);

    // If we have a prior value stored on the root (from refresh), re-apply
    if (root.dataset.gemSnippetSearch) {
      input.value = root.dataset.gemSnippetSearch;
      apply();
    }
  }

  function getSnippetsPanelFilterMode(root) {
    // Source of truth is the dataset; fallback to native select.
    const mode = root?.dataset?.gemSnippetFilterMode;
    if (mode) return mode;
    const select = root?.querySelector('#gem-snippet-filter-select');
    return select?.value || 'showAll';
  }

  function applySnippetSearchFilter(root, rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();
    root.dataset.gemSnippetSearch = rawQuery || '';
    const filterMode = getSnippetsPanelFilterMode(root);

    const categoryBlocks = root.querySelectorAll('.gem-snippets-category-block');

    categoryBlocks.forEach((block) => {
      const wrapper = block.querySelector('.gem-snippets-category-table-wrapper');
      const rows = block.querySelectorAll('tr[data-snippet-name]');

      // Determine matches (even if collapsed)
      let anyMatch = false;
      rows.forEach((row) => {
        const nameLower = row.getAttribute('data-snippet-name') || '';
        const matchesSearch = !query || nameLower.includes(query);
        const isFav = row.getAttribute('data-gem-favorite') === 'true';
        const hasSwap = row.getAttribute('data-gem-has-swap') === 'true';
        const matchesFilter =
          filterMode === 'favorites' ? isFav :
          filterMode === 'swaps' ? hasSwap :
          true;
        const matches = matchesSearch && matchesFilter;
        row.style.display = matches ? '' : 'none';
        if (matches) anyMatch = true;
      });

      // Hide entire category if nothing matches
      block.style.display = anyMatch ? '' : 'none';

      if (!wrapper) return;

      // When filtering (search OR dropdown), temporarily expand categories that have matches (don’t persist state)
      const isFiltering = !!query || filterMode !== 'showAll';
      if (isFiltering) {
        if (wrapper.dataset.gemPrevDisplay === undefined) {
          wrapper.dataset.gemPrevDisplay = wrapper.style.display || '';
        }
        if (anyMatch) {
          wrapper.style.display = '';
          // update icon for UX (non-persistent)
          const btn = block.querySelector('.gem-snippets-category-toggle');
          const iconSpan = btn && btn.querySelector('span');
          if (iconSpan) iconSpan.textContent = '▾';
        }
      } else {
        // restore collapse state visuals when query cleared
        if (wrapper.dataset.gemPrevDisplay !== undefined) {
          wrapper.style.display = wrapper.dataset.gemPrevDisplay;
          delete wrapper.dataset.gemPrevDisplay;
        }
      }
    });
  }

  // ------------------------------------------------------------
  // Snippets filter (native <select>)
  // ------------------------------------------------------------

  function setupSnippetsFilterSelect() {
    const root = document.querySelector('gem-snippets');
    if (!root) return;

    const select = root.querySelector('#gem-snippet-filter-select');
    if (!select) return;

    if (select._gemBound) return;
    select._gemBound = true;

    // Restore prior mode if present
    const mode = root.dataset.gemSnippetFilterMode || select.value || 'showAll';
    select.value = mode;
    root.dataset.gemSnippetFilterMode = mode;

    select.addEventListener('change', () => {
      root.dataset.gemSnippetFilterMode = select.value || 'showAll';
      const searchVal = root.querySelector('#gem-snippet-search-input')?.value || '';
      applySnippetSearchFilter(root, searchVal);
    });
  }

  // ------------------------------------------------------------
  // Snippet Import / Export / Delete
  // ------------------------------------------------------------

  function parseImportedSnippetsJSON(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      throw new Error('Please paste JSON to import.');
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new Error('Invalid JSON. Please paste a valid JSON string.');
    }

    // Accept either an array, or an object with { snippets: [...] }
    const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.snippets) ? parsed.snippets : null);
    if (!arr) {
      throw new Error('JSON must be an array of snippets, or an object like {"snippets":[...]}');
    }

    return arr;
  }

  function makeUniqueSnippetName(baseName, existingNamesLower) {
    const base = baseName.trim();
    if (!existingNamesLower.has(base.toLowerCase())) return base;

    let i = 1;
    while (existingNamesLower.has(`${base} ${i}`.toLowerCase())) {
      i++;
    }
    return `${base} ${i}`;
  }

  function createSnippetsExportPayload(snippets) {
    return (snippets || []).map((s) => ({
      category: s.category || '',
      name: s.name,
      content: s.content,
      description: s.description || '',
      favorite: !!s.favorite,
      swapKeywords: normalizeSwapKeywordsFromSnippet(s)
    }));
  }

  function resetSnippetExportSelectionState() {
    snippetExportSelectionState.active = false;
    snippetExportSelectionState.mode = null;
    snippetExportSelectionState.selectedIds.clear();
  }

  function getSnippetSelectionActionLabel(mode = snippetExportSelectionState.mode) {
    return mode === 'delete' ? 'Delete Selected' : 'Export Selected';
  }

  function getSelectedSnippetIds() {
    return Array.from(snippetExportSelectionState.selectedIds);
  }

  function syncSnippetExportSelectionRows(root) {
    if (!root) return { total: 0, selected: 0 };

    const rowCheckboxes = Array.from(root.querySelectorAll('.gem-export-snippet-checkbox'));
    if (!snippetExportSelectionState.active) {
      rowCheckboxes.forEach((cb) => {
        cb.checked = false;
      });
      return { total: rowCheckboxes.length, selected: 0 };
    }

    const validIds = new Set();
    rowCheckboxes.forEach((cb) => {
      const id = (cb.getAttribute('data-snippet-id') || '').trim();
      if (id) validIds.add(id);
    });

    Array.from(snippetExportSelectionState.selectedIds).forEach((id) => {
      if (!validIds.has(id)) {
        snippetExportSelectionState.selectedIds.delete(id);
      }
    });

    let selected = 0;
    rowCheckboxes.forEach((cb) => {
      const id = (cb.getAttribute('data-snippet-id') || '').trim();
      const checked = !!id && snippetExportSelectionState.selectedIds.has(id);
      cb.checked = checked;
      if (checked) selected++;
    });

    return { total: rowCheckboxes.length, selected };
  }

  function syncSnippetExportCategoryCheckboxes(root) {
    if (!root) return;

    const categoryBlocks = root.querySelectorAll('.gem-snippets-category-block');
    categoryBlocks.forEach((block) => {
      const categoryCheckbox = block.querySelector('.gem-export-category-checkbox');
      if (!categoryCheckbox) return;

      const rowCheckboxes = Array.from(block.querySelectorAll('.gem-export-snippet-checkbox'));
      const total = rowCheckboxes.length;
      if (!snippetExportSelectionState.active || total === 0) {
        categoryCheckbox.disabled = true;
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = false;
        return;
      }

      const selected = rowCheckboxes.reduce((count, cb) => count + (cb.checked ? 1 : 0), 0);
      categoryCheckbox.disabled = false;
      categoryCheckbox.checked = selected === total;
      categoryCheckbox.indeterminate = selected > 0 && selected < total;
    });
  }

  function updateSnippetExportSelectionUI(root = document.querySelector('gem-snippets')) {
    if (!root) return;

    const ioActions = root.querySelector('.gem-snippet-import-export-actions');
    const selectionControls = root.querySelector('.gem-snippets-export-selection-controls');
    const addSnippetAction = root.querySelector('.gem-add-snippet-action');
    if (ioActions) {
      ioActions.style.display = snippetExportSelectionState.active ? 'none' : 'flex';
    }
    if (selectionControls) {
      selectionControls.style.display = snippetExportSelectionState.active ? 'flex' : 'none';
    }
    if (addSnippetAction) {
      addSnippetAction.style.display = snippetExportSelectionState.active ? 'none' : '';
    }

    const { total, selected } = syncSnippetExportSelectionRows(root);
    syncSnippetExportCategoryCheckboxes(root);

    const countEl = root.querySelector('.gem-export-selected-count');
    if (countEl) {
      countEl.textContent = `${selected} selected`;
    }

    const selectAllCheckbox = root.querySelector('.gem-export-select-all-checkbox');
    const selectAllLabel = root.querySelector('.gem-export-select-all-label');
    if (selectAllCheckbox) {
      selectAllCheckbox.disabled = !snippetExportSelectionState.active || total === 0;
      selectAllCheckbox.checked = snippetExportSelectionState.active && total > 0 && selected === total;
      selectAllCheckbox.indeterminate = snippetExportSelectionState.active && selected > 0 && selected < total;

      const selectAllActionLabel = (snippetExportSelectionState.active && total > 0 && selected === total)
        ? 'Uncheck all'
        : 'Check all';
      if (selectAllLabel) {
        selectAllLabel.textContent = selectAllActionLabel;
      }
      selectAllCheckbox.setAttribute('aria-label', selectAllActionLabel);
    }

    const exportSelectedBtn = root.querySelector('.gem-open-selected-export-modal-btn');
    if (exportSelectedBtn) {
      const isDeleteMode = snippetExportSelectionState.mode === 'delete';
      exportSelectedBtn.textContent = getSnippetSelectionActionLabel();
      exportSelectedBtn.classList.toggle('e-btn-danger', isDeleteMode);
      exportSelectedBtn.classList.toggle('e-btn-primary', !isDeleteMode);
      exportSelectedBtn.disabled = !snippetExportSelectionState.active || selected === 0;
    }
  }

  function enableSnippetSelectionMode(mode = 'export') {
    const normalizedMode = mode === 'delete' ? 'delete' : 'export';
    getSnippets((snippets) => {
      if (!Array.isArray(snippets) || snippets.length === 0) {
        const actionText = normalizedMode === 'delete' ? 'delete' : 'export';
        window.gemShowToast && window.gemShowToast(`No snippets available to ${actionText}.`, { type: 'warn', durationMs: 1800 });
        return;
      }

      snippetExportSelectionState.active = true;
      snippetExportSelectionState.mode = normalizedMode;
      snippetExportSelectionState.selectedIds.clear();
      refreshSnippetsDisplay();
    });
  }

  function enableSnippetExportSelectionMode() {
    enableSnippetSelectionMode('export');
  }

  function enableSnippetDeleteSelectionMode() {
    enableSnippetSelectionMode('delete');
  }

  function disableSnippetExportSelectionMode(refresh = true) {
    resetSnippetExportSelectionState();
    if (refresh) refreshSnippetsDisplay();
  }

  function setAllSnippetExportSelections(root, shouldSelect) {
    if (!root || !snippetExportSelectionState.active) return;
    const rowCheckboxes = root.querySelectorAll('.gem-export-snippet-checkbox');
    rowCheckboxes.forEach((cb) => {
      const id = (cb.getAttribute('data-snippet-id') || '').trim();
      if (!id) return;
      cb.checked = !!shouldSelect;
      if (shouldSelect) {
        snippetExportSelectionState.selectedIds.add(id);
      } else {
        snippetExportSelectionState.selectedIds.delete(id);
      }
    });
  }

  function setCategorySnippetExportSelections(categoryBlock, shouldSelect) {
    if (!categoryBlock || !snippetExportSelectionState.active) return;

    const rowCheckboxes = categoryBlock.querySelectorAll('.gem-export-snippet-checkbox');
    rowCheckboxes.forEach((cb) => {
      const id = (cb.getAttribute('data-snippet-id') || '').trim();
      if (!id) return;
      cb.checked = !!shouldSelect;
      if (shouldSelect) {
        snippetExportSelectionState.selectedIds.add(id);
      } else {
        snippetExportSelectionState.selectedIds.delete(id);
      }
    });
  }

  function openSelectedSnippetsExportModal() {
    const selectedIds = getSelectedSnippetIds();
    if (!selectedIds.length) {
      window.gemShowToast && window.gemShowToast('Select at least one snippet to export.', { type: 'warn', durationMs: 1800 });
      return;
    }

    getSnippets((snippets) => {
      const selectedLookup = new Set(selectedIds);
      const selectedSnippets = (snippets || []).filter((s) => selectedLookup.has(String((s && s.id) || '')));
      if (!selectedSnippets.length) {
        window.gemShowToast && window.gemShowToast('No selected snippets were found. Please try again.', { type: 'warn', durationMs: 2000 });
        return;
      }
      showSnippetsExportModal(selectedSnippets);
      disableSnippetExportSelectionMode(true);
    });
  }

  function deleteSelectedSnippets() {
    const selectedIds = getSelectedSnippetIds();
    if (!selectedIds.length) {
      window.gemShowToast && window.gemShowToast('Select at least one snippet to delete.', { type: 'warn', durationMs: 1800 });
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete ${selectedIds.length} selected snippet${selectedIds.length === 1 ? '' : 's'}? This action cannot be undone.`);
    if (!confirmed) return;

    getSnippets((snippets) => {
      const source = Array.isArray(snippets) ? snippets : [];
      const selectedLookup = new Set(selectedIds);
      const updated = source.filter((s) => !selectedLookup.has(String((s && s.id) || '')));
      const removedCount = source.length - updated.length;
      if (removedCount <= 0) {
        window.gemShowToast && window.gemShowToast('No selected snippets were found. Please try again.', { type: 'warn', durationMs: 2000 });
        return;
      }

      saveSnippets(updated, () => {
        disableSnippetExportSelectionMode(true);
        window.gemShowToast && window.gemShowToast(`Deleted ${removedCount} snippet${removedCount === 1 ? '' : 's'}.`, { type: 'success', durationMs: 1800 });
      });
    });
  }

  function runSnippetSelectionPrimaryAction() {
    if (snippetExportSelectionState.mode === 'delete') {
      deleteSelectedSnippets();
      return;
    }
    openSelectedSnippetsExportModal();
  }

  function setupSnippetExportSelectionHandlers(root) {
    if (!root || root._gemExportSelectionBound) return;
    root._gemExportSelectionBound = true;

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const rowCheckbox = target.closest('.gem-export-snippet-checkbox');
      if (rowCheckbox) {
        const snippetId = (rowCheckbox.getAttribute('data-snippet-id') || '').trim();
        if (snippetId) {
          if (rowCheckbox.checked) {
            snippetExportSelectionState.selectedIds.add(snippetId);
          } else {
            snippetExportSelectionState.selectedIds.delete(snippetId);
          }
        }
        updateSnippetExportSelectionUI(root);
        return;
      }

      const categoryCheckbox = target.closest('.gem-export-category-checkbox');
      if (categoryCheckbox) {
        const categoryBlock = categoryCheckbox.closest('.gem-snippets-category-block');
        setCategorySnippetExportSelections(categoryBlock, !!categoryCheckbox.checked);
        updateSnippetExportSelectionUI(root);
        return;
      }

      const selectAllCheckbox = target.closest('.gem-export-select-all-checkbox');
      if (selectAllCheckbox) {
        setAllSnippetExportSelections(root, !!selectAllCheckbox.checked);
        updateSnippetExportSelectionUI(root);
      }
    });

    root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const exportSelectedBtn = target.closest('.gem-open-selected-export-modal-btn');
      if (exportSelectedBtn) {
        if (exportSelectedBtn.hasAttribute('disabled')) return;
        runSnippetSelectionPrimaryAction();
        return;
      }

      const cancelBtn = target.closest('.gem-cancel-snippet-export-btn');
      if (cancelBtn) {
        disableSnippetExportSelectionMode(true);
      }
    });
  }

  function showSnippetsExportModal(snippetsToExport = null) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const explicitSelectionCount = Array.isArray(snippetsToExport) ? snippetsToExport.length : null;
    const subtitle = explicitSelectionCount === null
      ? 'Copy the JSON below to backup or share your snippets:'
      : `Copy the JSON below to backup or share ${explicitSelectionCount} selected snippet${explicitSelectionCount === 1 ? '' : 's'}:`;

    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 700px; width: 92%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 12px 0; color: var(--token-font-default, #333333);">Export Snippets</h3>
        <p style="margin: 0 0 12px 0; color: var(--token-font-default, #666666); font-size: 14px;">${subtitle}</p>
        <textarea id="gem-snippets-export-json" class="gem-scrollable" readonly style="background:var(--token-input-default-background); width: 100%; height: 260px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="gem-snippets-copy-export-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy</button>
          <button id="gem-snippets-close-export-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const setExportPayload = (snippets) => {
      const exportTextarea = modal.querySelector('#gem-snippets-export-json');
      const exportPayload = createSnippetsExportPayload(snippets);
      exportTextarea.value = JSON.stringify(exportPayload, null, 2);
    };

    if (Array.isArray(snippetsToExport)) {
      setExportPayload(snippetsToExport);
    } else {
      getSnippets((snippets) => {
        setExportPayload(snippets);
      });
    }

    const close = () => {
      document.removeEventListener('keydown', handleEscape);
      modal.remove();
    };
    modal.querySelector('#gem-snippets-close-export-btn').addEventListener('click', close);

    modal.querySelector('#gem-snippets-copy-export-btn').addEventListener('click', async () => {
      const exportTextarea = modal.querySelector('#gem-snippets-export-json');
      const btn = modal.querySelector('#gem-snippets-copy-export-btn');
      try {
        await navigator.clipboard.writeText(exportTextarea.value);
        btn.textContent = 'Copied!';
        btn.style.background = '#059669';
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.style.background = '#10b981';
        }, 1500);
      } catch (err) {
        // Fallback: select and copy
        exportTextarea.focus();
        exportTextarea.select();
        try {
          document.execCommand('copy');
          btn.textContent = 'Copied!';
          btn.style.background = '#059669';
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.background = '#10b981';
          }, 1500);
        } catch (e) {
          gemToast('Failed to copy to clipboard. Please select and copy manually.', { type: 'error', durationMs: 3200 });
        }
      }
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  function showSnippetsImportModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 700px; width: 92%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 12px 0; color: var(--token-font-default, #333333);">Import Snippets</h3>
        <p style="margin: 0 0 12px 0; color: var(--token-font-default, #666666); font-size: 14px;">Paste exported snippet JSON below. Conflicts are handled safely: identical name+code is skipped; same name with different code is imported as “name 1”, “name 2”, etc.</p>
        <textarea id="gem-snippets-import-json" class="gem-scrollable" placeholder="Paste your JSON here..." style="background:var(--token-input-default-background); width: 100%; height: 260px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="gem-snippets-import-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Import</button>
          <button id="gem-snippets-cancel-import-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#gem-snippets-cancel-import-btn').addEventListener('click', close);

    modal.querySelector('#gem-snippets-import-btn').addEventListener('click', () => {
      const textarea = modal.querySelector('#gem-snippets-import-json');
      let imported;

      try {
        imported = parseImportedSnippetsJSON(textarea.value);
      } catch (e) {
        gemToast(e.message, { type: 'error', durationMs: 4000 });
        textarea.focus();
        return;
      }

      getSnippets((existingSnippets) => {
        const updated = [...existingSnippets];
        const existingNamesLower = new Set(updated.map(s => (s.name || '').toLowerCase()));
        const existingSwapKeywords = new Set();
        updated.forEach((s) => {
          normalizeSwapKeywordsFromSnippet(s).forEach((k) => {
            if (k && k.keyword) existingSwapKeywords.add(k.keyword);
          });
        });

        let added = 0;
        let skipped = 0;
        let invalid = 0;
        let swapKeywordsRemoved = 0;

        imported.forEach((item) => {
          const category = (item && typeof item.category === 'string') ? item.category.trim() : '';
          const name = (item && typeof item.name === 'string') ? item.name.trim() : '';
          const content = (item && typeof item.content === 'string') ? item.content.trim() : '';
          const description = (item && typeof item.description === 'string') ? item.description.trim() : '';
          const favorite = !!(item && item.favorite);
          let swapKeywords = [];
          if (item && Array.isArray(item.swapKeywords)) {
            swapKeywords = item.swapKeywords
              .map((k) => ({
                keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
                mode: normalizeSwapMode(k && k.mode),
                initiateFrom: normalizeSwapInitiateFrom(k && k.initiateFrom)
              }))
              .filter((k) => !!k.keyword);
          } else {
            // Backward-compatible import (legacy single keyword)
            const legacyKeyword = (item && typeof item.swapKeyword === 'string') ? item.swapKeyword.trim() : '';
            if (legacyKeyword) {
              swapKeywords = [{ keyword: legacyKeyword, mode: normalizeSwapMode(item && item.swapMode), initiateFrom: 'anywhere' }];
            }
          }

          if (!name || !content) {
            invalid++;
            return;
          }

          // Allow duplicate snippet names. Only skip if the import contains an identical entry
          // (same name + same code) that already exists in storage.
          const existingIdentical = updated.find(s =>
            (s.name || '').toLowerCase() === name.toLowerCase() &&
            ((s.content || '').trim() === content)
          );
          if (existingIdentical) {
            skipped++;
            return;
          }

          // If this snippet's swap keywords conflict with existing snippet keywords, remove them.
          // Uniqueness is case-sensitive (exact match after trim).
          if (swapKeywords.length) {
            const dedup = new Set();
            const cleaned = [];
            swapKeywords.forEach((k) => {
              if (!k.keyword) return;
              if (dedup.has(k.keyword)) return;
              dedup.add(k.keyword);
              cleaned.push(k);
            });
            swapKeywords = cleaned.filter((k) => {
              if (existingSwapKeywords.has(k.keyword)) {
                swapKeywordsRemoved++;
                return false;
              }
              existingSwapKeywords.add(k.keyword);
              return true;
            });
          }

          updated.push({
            id: (window.gemGenerateSnippetId && window.gemGenerateSnippetId()) || `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            favorite,
            category: category,
            name: name,
            content: content,
            description: description,
            swapKeywords
          });
          existingNamesLower.add(name.toLowerCase());
          added++;
        });

        saveSnippets(updated, () => {
          close();
          refreshSnippetsDisplay();
          gemToast(`Import complete. Added: ${added}. Skipped (identical): ${skipped}. Invalid: ${invalid}. Keywords removed (conflict): ${swapKeywordsRemoved}.`, {
            type: invalid > 0 || swapKeywordsRemoved > 0 ? 'warn' : 'success',
            durationMs: 4000
          });
        });
      });
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  function setupSnippetsImportExportButtons() {
    const root = document.querySelector('gem-snippets');
    if (!root) return;

    const importBtn = root.querySelector('.gem-import-snippets-btn');
    const exportBtn = root.querySelector('.gem-export-snippets-btn');
    const deleteBtn = root.querySelector('.gem-delete-snippets-btn');

    setupSnippetExportSelectionHandlers(root);

    if (importBtn && !importBtn._gemImportBound) {
      importBtn._gemImportBound = true;
      importBtn.addEventListener('click', showSnippetsImportModal);
    }

    if (exportBtn && !exportBtn._gemExportBound) {
      exportBtn._gemExportBound = true;
      exportBtn.addEventListener('click', enableSnippetExportSelectionMode);
    }

    if (deleteBtn && !deleteBtn._gemDeleteBound) {
      deleteBtn._gemDeleteBound = true;
      deleteBtn.addEventListener('click', enableSnippetDeleteSelectionMode);
    }

    updateSnippetExportSelectionUI(root);
  }

  function findSnippetsTabInsertAnchor() {
    const menu = document.querySelector('e-verticalnav-menu');
    if (!menu) return null;

    const personalizationSpan = menu.querySelector('span:has(#customTab_personaliztation)');
    if (personalizationSpan) return personalizationSpan;

    const personalizationTab = menu.querySelector('#customTab_personaliztation');
    if (personalizationTab) {
      return personalizationTab.closest('span') || personalizationTab;
    }

    return null;
  }

  // Function to add the snippets tab after the Personalization tab
  function addSnippetsTab() {
    const anchor = findSnippetsTabInsertAnchor();
    if (!anchor) {
      console.log("[Gem] Personalization tab not found, cannot add snippets tab yet");
      return false;
    }

    const existing = document.querySelector('#gem-snippets-tab');
    if (existing) {
      if (anchor.nextElementSibling !== existing) {
        anchor.insertAdjacentElement('afterend', existing);
        console.log("[Gem] Snippets tab repositioned after Personalization tab");
      } else {
        console.log("[Gem] Snippets tab already exists");
      }
      return true;
    }

    anchor.insertAdjacentHTML('afterend', createSnippetsTabHTML());

    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (snippetsTab) {
      console.log("[Gem] Snippets tab added successfully");

      // Add click handler
      const navItem = snippetsTab.querySelector('e-verticalnav-item');
      if (navItem) {
        navItem.addEventListener('click', handleSnippetsTabClick);
        console.log("[Gem] Snippets tab click handler added");
      }

      // Add global click handler to manage active states
      setupGlobalTabClickHandler();

      return true;
    }

    console.log("[Gem] Failed to add snippets tab");
    return false;
  }

  // Function to handle snippets tab click
  function handleSnippetsTabClick(event) {
    console.log("[Gem] Snippets tab clicked");

    // Set status="active" on the snippets tab's e-verticalnav-item
    const snippetsNavItem = document.querySelector('#gem-snippets-tab e-verticalnav-item');
    if (snippetsNavItem) {
      snippetsNavItem.setAttribute('status', 'active');
      console.log("[Gem] Added status='active' to snippets tab");
    }

    // Find the vertical nav content area
    const navContent = document.querySelector('.e-verticalnav__content');
    if (!navContent) {
      console.log("[Gem] Vertical nav content not found");
      return;
    }

    // Hide all existing children except router-outlet (keep in DOM so Emarsys can restore properly)
    hideNonRouterOutletChildren(navContent);

    // Add the snippets content (async with callback)
    createSnippetsContentHTML((snippetsHTML) => {
      navContent.insertAdjacentHTML('afterbegin', snippetsHTML);
      console.log("[Gem] Snippets content loaded");

      // Set up drag and drop functionality after content is added
      setupSnippetDragAndDrop();

      // Set up per-snippet swap keyword buttons
      setupSwapSnippetButtons();

      // Set up add snippet button functionality
      setupAddSnippetButton();

      // Set up edit snippet button functionality
      setupEditSnippetButtons();

      // Set up copy snippet button functionality
      setupCopySnippetButtons();

      // Set up import/export buttons
      setupSnippetsImportExportButtons();

      // Set up category collapse/expand toggles
      setupSnippetCategoryCollapseToggles();

      // Set up search box filtering
      setupSnippetsSearch();

      // Set up dropdown filter
      setupSnippetsFilterSelect();
    });

    // Update active states - remove active from other tabs, add to snippets tab
    // (We leave the Emarsys DOM panels intact; this is just visual state)
    // document.querySelectorAll('cb-vertical-tab').forEach(tab => {
    //   const navItem = tab.querySelector('e-verticalnav-item');
    //   if (navItem) {
    //     const navItemDiv = navItem.querySelector('.e-verticalnavitem');
    //     if (navItemDiv) {
    //       navItemDiv.classList.remove('e-verticalnavitem-active');
    //     }
    //   }
    // });

    // Add active state to snippets tab
    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (snippetsTab) {
      const navItem = snippetsTab.querySelector('e-verticalnav-item');
      if (navItem) {
        const navItemDiv = navItem.querySelector('.e-verticalnavitem');
        if (navItemDiv) {
          navItemDiv.classList.add('e-verticalnavitem-active');
        }
      }
    }
  }

  // Function to set up global click handler for tab management
  function setupGlobalTabClickHandler() {
    // Listen for clicks on any direct child of e-verticalnav-menu
    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (!verticalNav) {
      console.log("[Gem] Vertical nav not found for global click handler");
      return;
    }

    verticalNav.addEventListener('click', (event) => {
      // Find the clicked cb-vertical-tab element
      const clickedTab = event.target.closest('cb-vertical-tab');
      if (!clickedTab) {
        return; // Not a tab click
      }

      const clickedTabId = clickedTab.id;
      console.log("[Gem] Tab clicked:", clickedTabId);

      // If the clicked tab is NOT our snippets tab, check if snippets tab has active status
      if (clickedTabId !== 'gem-snippets-tab') {
        const snippetsNavItem = document.querySelector('#gem-snippets-tab e-verticalnav-item');
        if (snippetsNavItem && snippetsNavItem.hasAttribute('status') && snippetsNavItem.getAttribute('status') === 'active') {
          // Remove the status="active" attribute
          snippetsNavItem.removeAttribute('status');
          console.log("[Gem] Removed status='active' from snippets tab");

          // Also remove the e-verticalnavitem-active class
          const snippetsNavItemDiv = snippetsNavItem.querySelector('.e-verticalnavitem');
          if (snippetsNavItemDiv) {
            snippetsNavItemDiv.classList.remove('e-verticalnavitem-active');
            console.log("[Gem] Removed e-verticalnavitem-active class from snippets tab");
          }

          // Remove the gem-snippets element from the DOM
          const snippetList = document.querySelector('gem-snippets');
          if (snippetList) {
            disableSnippetExportSelectionMode(false);
            snippetList.remove();
            console.log("[Gem] Removed gem-snippets from DOM");
          }

          // Restore Emarsys' previously-hidden nav content panels
          const navContent = document.querySelector('.e-verticalnav__content');
          if (navContent) {
            restoreHiddenNavChildren(navContent);
          }
        }
      }
    });

    console.log("[Gem] Global tab click handler set up");
  }

  // Function to set up the add snippet button
  function setupAddSnippetButton() {
    const addButton = document.querySelector('.gem-add-snippet-btn');
    if (addButton && !addButton.hasAttribute('data-gem-handler-attached')) {
      addButton.addEventListener('click', () => openSnippetEditor(null));
      addButton.setAttribute('data-gem-handler-attached', 'true');
      console.log("[Gem] Add snippet button handler attached");
    }
  }

  // Function to set up edit snippet buttons
  function setupEditSnippetButtons() {
    const editButtons = document.querySelectorAll('.gem-edit-snippet-btn');
    editButtons.forEach(button => {
      if (!button.hasAttribute('data-gem-handler-attached')) {
        button.addEventListener('click', (event) => {
          const snippetId = event.currentTarget.getAttribute('data-snippet-id');
          if (snippetId) {
            openSnippetEditor(snippetId);
          }
        });
        button.setAttribute('data-gem-handler-attached', 'true');
      }
    });
    console.log("[Gem] Edit snippet button handlers attached");
  }

  async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      // Fallback for restricted clipboard contexts
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
      } catch (_) {
        return false;
      }
    }
  }

  // Function to set up copy snippet buttons
  function setupCopySnippetButtons() {
    const copyButtons = document.querySelectorAll('.gem-copy-snippet-btn');
    copyButtons.forEach((button) => {
      if (button.hasAttribute('data-gem-handler-attached')) return;

      button.addEventListener('click', (event) => {
        const snippetId = event.currentTarget.getAttribute('data-snippet-id');
        if (!snippetId) return;

        getSnippets(async (snippets) => {
          const snippet = snippets.find((s) => s && s.id === snippetId);
          const code = (snippet && typeof snippet.content === 'string') ? snippet.content : '';

          if (!code || !code.trim()) {
            window.gemShowToast && window.gemShowToast('No snippet code to copy.', { type: 'warn', durationMs: 1800 });
            return;
          }

          const ok = await copyTextToClipboard(code);
          if (ok) {
            window.gemShowToast && window.gemShowToast('Snippet code copied to clipboard.', { type: 'success', durationMs: 1400 });
          } else {
            gemToast('Failed to copy snippet code to clipboard.', { type: 'error', durationMs: 2800 });
          }
        });
      });

      button.setAttribute('data-gem-handler-attached', 'true');
    });
  }

  // ------------------------------------------------------------
  // Swap Keywords button (per snippet, from Snippets table)
  // ------------------------------------------------------------

  function setupSwapSnippetButtons() {
    const buttons = document.querySelectorAll('.gem-swap-snippet-btn');
    buttons.forEach((button) => {
      if (button._gemSwapBound) return;
      button._gemSwapBound = true;
      button.addEventListener('click', (event) => {
        const snippetId = event.currentTarget.getAttribute('data-snippet-id');
        if (!snippetId) return;
        runSwapForSnippetId(snippetId);
      });
    });
  }

  function escapeTokenContentForAttribute(value) {
    // Must match generateSnippetHTML() encoding for token-content
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

  function createEslTokenSpan(doc, name, script) {
    const tokenContent = JSON.stringify({ script });
    const encodedTokenContent = escapeTokenContentForAttribute(tokenContent);
    const encodedTokenTemplate = '%22%3C%25=%20script%20%25%3E%22';
    const encodedTokenMeta = '%7B%7D';

    const span = doc.createElement('span');
    span.setAttribute('e-token', 'cust_esl');
    span.setAttribute('token-template', encodedTokenTemplate);
    span.setAttribute('token-content', encodedTokenContent);
    span.setAttribute('token-meta', encodedTokenMeta);
    span.setAttribute('contenteditable', 'false');
    span.className = 'cbNonEditable';
    // Match the toolbar token styling for consistent visibility
    span.style.backgroundColor = '#6597cf';
    span.style.borderRadius = '.3em';
    span.style.boxShadow = '0 0 0 0.2em #6597cf';
    span.style.color = '#fff';
    span.textContent = name;
    return span;
  }

  function markEmarsysDraftDirty(doc, editables = []) {
    if (typeof window.gemMarkEmarsysDraftDirty === 'function') {
      window.gemMarkEmarsysDraftDirty(doc, editables);
      return;
    }
    try {
      editables.forEach((el) => {
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      });
    } catch (_) {}
  }

  function nudgeEmarsysDirtyDetectionViaFocus(doc, editables = []) {
    if (typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function') {
      window.gemNudgeEmarsysDirtyDetectionViaFocus(doc, editables);
    }
  }

  function runSwapForSnippetId(snippetId) {
    getSnippets((snippets) => {
      const snippet = snippets.find((s) => s.id === snippetId);
      if (!snippet) return;
      applySwapForSingleSnippet(snippet);
    });
  }

  async function applySwapForSingleSnippet(snippet) {
    const iframe = getGemSnippetTargetIframe();
    if (!iframe) return;

    let doc;
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document;
    } catch (e) {
      return;
    }
    if (!doc) return;

    // Snippets Panel initiated: skip "Block Toolbar Only" rules
    const rules = normalizeSwapKeywordsFromSnippet(snippet).filter((r) => r && r.keyword && r.initiateFrom !== 'toolbar');
    if (!rules.length) {
      window.gemShowToast && window.gemShowToast('No panel-eligible keyword swaps for this snippet.', { type: 'info' });
      return;
    }

    // Wake lazy TinyMCE on dormant [e-editable] fields before swapping.
    // Prefer the shared preview doc helper (same iframe Magic Fill / F&R use).
    const frDom = window.gemFindReplaceDom;
    const primeFn = frDom && frDom.primeEmarsysEditablesInDoc;
    const previewDocFromFr =
      frDom && typeof frDom.getPreviewDocument === 'function'
        ? frDom.getPreviewDocument()
        : null;
    const targetDoc = previewDocFromFr || doc;

    if (typeof primeFn === 'function') {
      try {
        const primeResult = await primeFn(targetDoc, {
          // Broad prime like Magic Fill / F&R so cold-loaded drafts wake TinyMCE.
          filter: (el) => String(el.textContent || '').trim().length > 0,
          release: false,
        });
        try {
          console.log('[Gem][KeywordSwap] primed editables', primeResult);
        } catch (_) {}
      } catch (e) {
        try {
          console.warn('[Gem][KeywordSwap] prime failed', e && e.message ? e.message : e);
        } catch (_) {}
      }
    } else {
      try {
        console.warn('[Gem][KeywordSwap] primeEmarsysEditablesInDoc unavailable');
      } catch (_) {}
    }

    // Re-resolve doc after prime in case the shared helper pointed at desktop iframe.
    doc = targetDoc;

    const isInsideExistingToken = (node) => {
      let cur = node;
      while (cur) {
        if (cur.nodeType === 1) {
          const el = cur;
          if (el.matches && (el.matches('span[e-token="cust_esl"]') || el.classList.contains('cbNonEditable'))) {
            return true;
          }
        }
        cur = cur.parentNode;
      }
      return false;
    };

    let didChange = false;
    let swapCount = 0;
    const touched = new Set();

    // After priming, prefer live contenteditable hosts; also include [e-editable]
    // that still lack contenteditable (prime timed out) so we don't miss swaps.
    const editableSet = new Set();
    Array.from(doc.querySelectorAll('[contenteditable="true"]')).forEach((el) => editableSet.add(el));
    Array.from(doc.querySelectorAll('[e-editable]')).forEach((el) => {
      if (el.tagName !== 'IMG') editableSet.add(el);
    });
    const editables = Array.from(editableSet);
    try {
      console.log('[Gem][KeywordSwap] scanning editables', {
        contentEditable: doc.querySelectorAll('[contenteditable="true"]').length,
        eEditable: doc.querySelectorAll('[e-editable]').length,
        combined: editables.length,
      });
    } catch (_) {}
    editables.forEach((editable) => {
      const walker = doc.createTreeWalker(
        editable,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
            const text = node.nodeValue;
            const hasAny = rules.some((r) => text.indexOf(r.keyword) !== -1);
            return hasAny ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );

      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      nodes.forEach((textNode) => {
        const text = textNode.nodeValue;
        const matches = [];

        rules.forEach((rule) => {
          const needle = rule.keyword;
          const matchRule = (rule && rule.matchRule) ? rule.matchRule : 'partial';
          const isWordChar = (ch) => !!ch && /\w/.test(ch);
          let from = 0;
          while (true) {
            const idx = text.indexOf(needle, from);
            if (idx === -1) break;
            const endIdx = idx + needle.length;
            if (matchRule === 'whole') {
              const prev = idx > 0 ? text[idx - 1] : '';
              const next = endIdx < text.length ? text[endIdx] : '';
              // Whole Word: emulate \b boundaries (no \b => partial match)
              if (isWordChar(prev) || isWordChar(next)) {
                from = endIdx;
                continue;
              }
            }
            matches.push({ start: idx, end: endIdx, rule });
            from = idx + needle.length;
          }
        });

        if (!matches.length) return;
        matches.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));

        const frag = doc.createDocumentFragment();
        let cursor = 0;
        let replacedAny = false;

        matches.forEach((m) => {
          if (m.start < cursor) return;
          if (m.start > cursor) frag.appendChild(doc.createTextNode(text.slice(cursor, m.start)));

          const mode = normalizeSwapMode(m.rule.mode);
          if (mode === 'token') {
            frag.appendChild(createEslTokenSpan(doc, snippet.name || 'ESL snippet', snippet.content || ''));
          } else {
            frag.appendChild(doc.createTextNode(snippet.content || ''));
          }

          replacedAny = true;
          swapCount += 1;
          cursor = m.end;
        });

        if (cursor < text.length) frag.appendChild(doc.createTextNode(text.slice(cursor)));

        if (replacedAny && textNode.parentNode) {
          textNode.parentNode.replaceChild(frag, textNode);
          didChange = true;
          touched.add(editable);
        }
      });

      if (touched.has(editable)) {
        try {
          editable.dispatchEvent(new Event('input', { bubbles: true }));
          editable.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      }
    });

    if (didChange) {
      if (frDom && typeof frDom.markEmailBodyDirty === 'function') {
        frDom.markEmailBodyDirty(doc, Array.from(touched));
      } else {
        markEmarsysDraftDirty(doc, Array.from(touched));
        nudgeEmarsysDirtyDetectionViaFocus(doc, Array.from(touched));
      }
    }

    const msg =
      swapCount > 0
        ? `Swapped ${swapCount} keyword${swapCount === 1 ? '' : 's'}.`
        : 'No keywords swapped.';
    window.gemShowToast && window.gemShowToast(msg, { type: swapCount > 0 ? 'success' : 'info' });
  }

  // ------------------------------------------------------------
  // Prefer Emarsys' ESL modal (if available) for Add/Edit
  // ------------------------------------------------------------

  const GEM_EMARSYS_ESL_TRIGGER_SELECTOR = '[aria-label="Insert Emarsys Scripting Language snippet"] button';
  const GEM_EMARSYS_ESL_NAME_INPUT_ID = 'cbp-esl-token-dialog-input-name';
  const GEM_EMARSYS_CATEGORY_INPUT_ID = 'gem-esl-category-input';
  const GEM_EMARSYS_DESCRIPTION_INPUT_ID = 'gem-esl-description-input';
  const GEM_EMARSYS_SHORTCUT_SELECT_ID = 'gem-esl-shortcut-select';
  const GEM_EMARSYS_SWAP_KEYWORDS_ROWS_ID = 'gem-esl-swap-keywords-rows';
  const GEM_EMARSYS_ADD_SWAP_KEYWORD_BTN_ID = 'gem-esl-add-swap-keyword-btn';

  // Tracks whether a currently-opening Emarsys modal was initiated by our Snippets panel
  let gemPendingEmarsysEslContext = null;
  let gemEmarsysEslObserver = null;

  function openSnippetEditor(snippetId = null) {
    // Try Emarsys modal first; fallback to our modal.
    if (snippetId) {
      getSnippets((snippets) => {
        const snippet = snippets.find(s => s.id === snippetId);
        if (!snippet) return openSnippetModal(snippetId);

        const opened = tryOpenEmarsysEslModal({
          mode: 'edit',
          snippetId,
          favorite: !!snippet.favorite,
          category: snippet.category || '',
          name: snippet.name,
          content: snippet.content,
          description: snippet.description || '',
          swapKeywords: normalizeSwapKeywordsFromSnippet(snippet)
        });
        if (!opened) openSnippetModal(snippetId);
      });
      return;
    }

    const opened = tryOpenEmarsysEslModal({
      mode: 'add',
      snippetId: null,
      pendingId:
        (window.gemGenerateSnippetId && window.gemGenerateSnippetId()) ||
        `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      favorite: false,
      category: '',
      name: '',
      content: '',
      description: '',
      swapKeywords: []
    });
    if (!opened) openSnippetModal(null);
  }

  function tryOpenEmarsysEslModal(context) {
    const triggerBtn = document.querySelector(GEM_EMARSYS_ESL_TRIGGER_SELECTOR);
    if (!triggerBtn) return false;

    gemPendingEmarsysEslContext = {
      ...context,
      startedAt: Date.now()
    };

    // Watch for Emarsys dialog nodes to appear *after* our click
    ensureEmarsysEslObserver();

    // IMPORTANT:
    // If the user currently has focus on an existing snippet/token in the editor,
    // Emarsys may pre-populate the dialog from that focused context.
    //
    // However, fully "clearing" selection can sometimes cause TinyMCE to hit a null-selection path.
    // So we keep the selection valid by focusing the iframe and collapsing the caret to the end.
    try {
      const iframe = getGemSnippetTargetIframe();
      const iframeWin = iframe?.contentWindow;
      const iframeDoc = iframe?.contentDocument || iframeWin?.document;

      if (iframe) iframe.focus();
      if (iframeWin && iframeWin.focus) iframeWin.focus();

      if (iframeDoc && iframeDoc.body && iframeDoc.getSelection) {
        const sel = iframeDoc.getSelection();
        if (sel && typeof sel.removeAllRanges === 'function' && typeof sel.addRange === 'function') {
          const range = iframeDoc.createRange();
          range.selectNodeContents(iframeDoc.body);
          range.collapse(false); // end of body
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    } catch (_) {}

    try {
      triggerBtn.click();
      return true;
    } catch (err) {
      console.warn('[Gem] Failed to open Emarsys ESL modal, falling back to Gem modal:', err);
      gemPendingEmarsysEslContext = null;
      return false;
    }
  }

  function ensureEmarsysEslObserver() {
    if (gemEmarsysEslObserver) return;

    const onDomChange = () => {
      if (!gemPendingEmarsysEslContext) return;
      if (Date.now() - gemPendingEmarsysEslContext.startedAt > 8000) {
        gemPendingEmarsysEslContext = null;
        return;
      }

      const nameInput = document.getElementById(GEM_EMARSYS_ESL_NAME_INPUT_ID);
      if (!nameInput) return;

      patchEmarsysEslDialog(nameInput, gemPendingEmarsysEslContext);
      gemPendingEmarsysEslContext = null;
    };

    if (typeof gemDomWatchSubscribe === 'function') {
      gemEmarsysEslObserver = gemDomWatchSubscribe(onDomChange);
    } else {
      gemEmarsysEslObserver = new MutationObserver(onDomChange);
      gemEmarsysEslObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ------------------------------------------------------------
  // Emarsys ESL dialog: disable submit while validation is busy
  // (works for BOTH Gem-patched dialogs and native Emarsys dialogs)
  // ------------------------------------------------------------
  // NOTE: this runs inside initializeSnippetsTab(), so we must avoid TDZ issues.
  // Use a function-scoped var and initialize lazily inside the ensure* function.
  var gemEslValidationDisable;

  function ensureEmarsysEslValidationDisableObserver() {
    if (!gemEslValidationDisable) {
      gemEslValidationDisable = { observer: null, wired: new WeakSet() };
    }
    if (gemEslValidationDisable.observer) return;

    const wireDialog = (dialogRoot) => {
      if (!dialogRoot || gemEslValidationDisable.wired.has(dialogRoot)) return;

      // IMPORTANT: Only attach this behavior to the Emarsys ESL snippet dialog.
      // This reduces the risk of interfering with other Emarsys dialogs that may also
      // use submit buttons or busy indicators.
      const isEslDialog =
        !!dialogRoot.querySelector(`#${GEM_EMARSYS_ESL_NAME_INPUT_ID}`) ||
        !!dialogRoot.querySelector('.CodeMirror') ||
        !!dialogRoot.querySelector('vce-codemirror');
      if (!isEslDialog) return;

      gemEslValidationDisable.wired.add(dialogRoot);

      const sync = () => {
        const isBusy = !!dialogRoot.querySelector('e-busy-indicator');

        // Native Emarsys submit targets can be either <button> or <e-btn>
        const submitTargets = dialogRoot.querySelectorAll(
          'button[type="submit"], button.e-btn-primary[type="submit"], e-btn[type="submit"]'
        );

        submitTargets.forEach((el) => {
          if (!el) return;
          if (isBusy) {
            el.setAttribute('disabled', '');
            el.dataset.gemDisabledByValidation = 'true';
          } else {
            // Only remove if we set it
            if (el.dataset.gemDisabledByValidation === 'true') {
              el.removeAttribute('disabled');
              delete el.dataset.gemDisabledByValidation;
            }
          }
        });

        // If our injected Save button exists, keep it in sync too
        const gemOkBtn = dialogRoot.querySelector('button.gem-esl-save-btn');
        if (gemOkBtn) {
          if (isBusy) gemOkBtn.dataset.gemValidating = 'true';
          else delete gemOkBtn.dataset.gemValidating;
          const isReading = gemOkBtn.dataset.gemReading === 'true';
          const isValidating = gemOkBtn.dataset.gemValidating === 'true';
          gemOkBtn.disabled = isReading || isValidating;
        }
      };

      // Initial + observe within dialog for busy indicator changes
      sync();
      const localObs = new MutationObserver(sync);
      localObs.observe(dialogRoot, { childList: true, subtree: true });
      dialogRoot._gemEslValidationDisableLocalObs = localObs;
    };

    const scanAndWire = () => {
      const dialogs = Array.from(document.querySelectorAll('e-float-container .e-dialog__container, .e-dialog__container'));
      dialogs.forEach((d) => wireDialog(d));
    };

    // Observe DOM for new dialogs
    if (typeof gemDomWatchSubscribe === 'function') {
      gemEslValidationDisable.observer = gemDomWatchSubscribe(scanAndWire);
    } else {
      gemEslValidationDisable.observer = new MutationObserver(scanAndWire);
      gemEslValidationDisable.observer.observe(document.body, { childList: true, subtree: true });
    }
    scanAndWire();
  }

  function patchEmarsysEslDialog(nameInputEl, context) {
    // Find the dialog container scope so we only touch this specific dialog instance.
    const dialogRoot =
      nameInputEl.closest('.e-dialog__container') ||
      nameInputEl.closest('.e-dialog') ||
      nameInputEl.closest('[role="dialog"]') ||
      document.body;

    // Guard: only patch once
    if (dialogRoot.dataset && dialogRoot.dataset.gemPatchedEslDialog === 'true') return;
    if (dialogRoot.dataset) dialogRoot.dataset.gemPatchedEslDialog = 'true';

    // Inject name (if editing)
    if (typeof context.name === 'string') {
      nameInputEl.value = context.name;
      nameInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      nameInputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Inject/ensure our extra fields (Category above Name, Description below Code)
    ensureGemFieldsInEmarsysDialog(dialogRoot, context);

    // Inject code into CodeMirror, but do it AFTER Emarsys finishes its own initialization.
    // Otherwise the dialog can end up with "focused token code" + our injected code appended.
    if (typeof context.content === 'string') {
      setEmarsysDialogCode(dialogRoot, context.content);
    }

    // Replace the footer buttons ONLY for the dialog we opened via our Snippets panel.
    // We look for the specific Emarsys footer structure and then swap its buttons.
    const buttonGroup = Array.from(dialogRoot.querySelectorAll('.e-buttongroup')).find((bg) => {
      const cancel = bg.querySelector('button.cancel-btn[type="reset"]');
      const ok = bg.querySelector('button.e-btn-primary[type="submit"]');
      return !!cancel && !!ok;
    });

    if (!buttonGroup) return;

    // Disable submit while Emarsys validation widget is busy (e-busy-indicator present)
    const setupValidationBusyDisable = () => {
      if (dialogRoot._gemValidationBusyObserver) return;

      const sync = () => {
        const isBusy = !!dialogRoot.querySelector('e-busy-indicator');

        // If Emarsys submit button exists in this dialog, disable it while busy.
        const emarsysSubmit =
          dialogRoot.querySelector('button.e-btn-primary[type="submit"]') ||
          dialogRoot.querySelector('button.e-btn[type="submit"]') ||
          dialogRoot.querySelector('button[type="submit"]');
        if (emarsysSubmit) {
          if (isBusy) emarsysSubmit.setAttribute('disabled', '');
          else emarsysSubmit.removeAttribute('disabled');
        }

        // Also disable our injected Save button while busy (if present).
        const gemOkBtn = dialogRoot.querySelector('button.gem-esl-save-btn');
        if (gemOkBtn) {
          if (isBusy) gemOkBtn.dataset.gemValidating = 'true';
          else delete gemOkBtn.dataset.gemValidating;
          const isReading = gemOkBtn.dataset.gemReading === 'true';
          const isValidating = gemOkBtn.dataset.gemValidating === 'true';
          gemOkBtn.disabled = isReading || isValidating;
        }
      };

      // Initial sync + observe for indicator appearing/disappearing
      sync();
      const obs = new MutationObserver(sync);
      obs.observe(dialogRoot, { childList: true, subtree: true });
      dialogRoot._gemValidationBusyObserver = obs;
    };

    // Remove Emarsys Cancel/OK buttons in this specific dialog instance
    const emarsysCancel = buttonGroup.querySelector('button.cancel-btn[type="reset"]');
    const emarsysOk = buttonGroup.querySelector('button.e-btn-primary[type="submit"]');
    if (emarsysCancel) emarsysCancel.remove();
    if (emarsysOk) emarsysOk.remove();

    // Add our Cancel/Save (+ Delete when editing) + Favorite toggle
    const gemCancel = document.createElement('button');
    gemCancel.className = 'e-btn';
    gemCancel.type = 'button';
    gemCancel.textContent = 'Cancel';

    const gemFavBtn = document.createElement('button');
    gemFavBtn.className = 'e-btn e-btn-borderless e-btn-onlyicon';
    gemFavBtn.type = 'button';
    gemFavBtn.title = 'Toggle favorite';
    gemFavBtn.setAttribute('aria-label', 'Toggle favorite');
    gemFavBtn.style.minWidth = 'unset';
    gemFavBtn.style.padding = '0 8px';

    const favIcon = document.createElement('span');
    favIcon.style.fontSize = '16px';
    favIcon.style.lineHeight = '1';
    favIcon.textContent = context?.favorite ? '★' : '☆';
    gemFavBtn.appendChild(favIcon);

    gemFavBtn.addEventListener('click', () => {
      const isFav = dialogRoot.dataset.gemFavorite === 'true';
      const next = !isFav;
      dialogRoot.dataset.gemFavorite = next ? 'true' : 'false';
      favIcon.textContent = next ? '★' : '☆';
    });

    let gemDelete = null;
    if (context && context.mode === 'edit' && context.snippetId) {
      gemDelete = document.createElement('button');
      gemDelete.className = 'e-btn e-btn-danger';
      gemDelete.type = 'button';
      gemDelete.textContent = 'Delete';
      gemDelete.addEventListener('click', () => {
        handleSnippetDeleteFromEmarsysDialog(context.snippetId, dialogRoot);
      });
    }

    const gemOk = document.createElement('button');
    gemOk.className = 'e-btn e-btn-primary';
    gemOk.type = 'button';
    gemOk.textContent = 'Save';
    gemOk.classList.add('gem-esl-save-btn');

    gemCancel.addEventListener('click', () => {
      closeEmarsysDialog(dialogRoot);
    });

    gemOk.addEventListener('click', () => {
      const currentNameInput = dialogRoot.querySelector(`#${GEM_EMARSYS_ESL_NAME_INPUT_ID}`);
      const name = currentNameInput ? currentNameInput.value.trim() : '';
      const category = (dialogRoot.querySelector(`#${GEM_EMARSYS_CATEGORY_INPUT_ID}`)?.value || '').trim();
      const description = (dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)?.value || '').trim();
      const favorite = dialogRoot.dataset.gemFavorite === 'true';
      const shortcutSlot = Number(dialogRoot.querySelector(`#${GEM_EMARSYS_SHORTCUT_SELECT_ID}`)?.value || 0);
      const rowsContainer = dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_KEYWORDS_ROWS_ID}`);
      let swapKeywords = [];
      if (rowsContainer) {
        const read = readSwapKeywordRowsUI(rowsContainer);
        if (!read.ok) {
          gemToast(read.error, { type: 'error', durationMs: 3200 });
          read.focusEl && read.focusEl.focus && read.focusEl.focus();
          return;
        }
        swapKeywords = read.swapKeywords;
      }

      // Read code from CodeMirror robustly. The hidden textarea inside CodeMirror
      // does NOT reliably contain the editor value, so we retry and fall back.
      gemOk.dataset.gemReading = 'true';
      gemOk.disabled = true;
      readEmarsysDialogCode(dialogRoot)
        .then((code) => {
          delete gemOk.dataset.gemReading;
          // Respect validation busy state
          gemOk.disabled = gemOk.dataset.gemValidating === 'true';
          handleSnippetSaveFromValues({ favorite, category, name, code: code.trim(), description, swapKeywords, shortcutSlot }, context.snippetId, dialogRoot, context.pendingId);
        })
        .catch(() => {
          delete gemOk.dataset.gemReading;
          gemOk.disabled = gemOk.dataset.gemValidating === 'true';
          handleSnippetSaveFromValues({ favorite, category, name, code: '', description, swapKeywords, shortcutSlot }, context.snippetId, dialogRoot, context.pendingId);
        });
    });

    // Initialize favorite state from context
    dialogRoot.dataset.gemFavorite = context?.favorite ? 'true' : 'false';

    // Layout: Favorite/Delete on the left, Cancel/Save on the right (to avoid accidental clicks)
    buttonGroup.style.display = 'flex';
    buttonGroup.style.alignItems = 'center';
    buttonGroup.style.width = '100%';
    buttonGroup.style.justifyContent = 'space-between';

    const leftActions = document.createElement('div');
    leftActions.style.display = 'flex';
    leftActions.style.gap = '10px';

    const rightActions = document.createElement('div');
    rightActions.style.display = 'flex';
    rightActions.style.gap = '10px';
    rightActions.style.marginLeft = 'auto';

    // Clear any remaining nodes (we already removed Emarsys buttons, but this is defensive)
    buttonGroup.innerHTML = '';

    leftActions.appendChild(gemFavBtn);
    if (gemDelete) leftActions.appendChild(gemDelete);
    rightActions.appendChild(gemCancel);
    rightActions.appendChild(gemOk);

    buttonGroup.appendChild(leftActions);
    buttonGroup.appendChild(rightActions);

    // Start watching for Emarsys validation busy indicator once our buttons exist.
    setupValidationBusyDisable();
  }

  function ensureGemFieldsInEmarsysDialog(dialogRoot, context) {
    // Category field (above the name input), and name length limit
    const nameInput = dialogRoot.querySelector(`#${GEM_EMARSYS_ESL_NAME_INPUT_ID}`);
    if (nameInput) nameInput.maxLength = 100;
    if (nameInput && !dialogRoot.querySelector(`#${GEM_EMARSYS_CATEGORY_INPUT_ID}`)) {
      const categoryField = document.createElement('div');
      categoryField.className = 'e-field';
      categoryField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_CATEGORY_INPUT_ID}">Category</label>
        <input class="e-input" id="${GEM_EMARSYS_CATEGORY_INPUT_ID}" type="text" placeholder="Optional category">
      `.trim();

      const nameField = nameInput.closest('.e-field') || nameInput.parentElement;
      if (nameField && nameField.parentElement) {
        nameField.parentElement.insertBefore(categoryField, nameField);
      }
    }

    // Description field (below the code editor)
    if (!dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)) {
      const descriptionField = document.createElement('div');
      descriptionField.className = 'e-field';
      descriptionField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_DESCRIPTION_INPUT_ID}">Description</label>
        <textarea class="e-input gem-scrollable" id="${GEM_EMARSYS_DESCRIPTION_INPUT_ID}" placeholder="Optional description (max 200 characters)" maxlength="200" style="background-color:var(--token-input-default-background); width: 100%; min-height: 100px; resize: vertical; padding: 10px 12px;"></textarea>
      `.trim();

      // Place right after the html editor / codemirror container if present
      const editorContainer =
        dialogRoot.querySelector('vce-html-editor') ||
        dialogRoot.querySelector('vce-codemirror') ||
        dialogRoot.querySelector('.CodeMirror')?.closest('.e-field') ||
        dialogRoot.querySelector('.CodeMirror') ||
        null;

      if (editorContainer && editorContainer.parentElement) {
        editorContainer.insertAdjacentElement('afterend', descriptionField);
      } else {
        // Fallback: append near end of dialog content
        const content = dialogRoot.querySelector('.e-dialog__content') || dialogRoot;
        content.appendChild(descriptionField);
      }
    }

    // Quick-insert shortcut field (below Description)
    if (!dialogRoot.querySelector(`#${GEM_EMARSYS_SHORTCUT_SELECT_ID}`)) {
      const shortcutField = document.createElement('div');
      shortcutField.className = 'e-field';
      shortcutField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_SHORTCUT_SELECT_ID}">Quick-insert shortcut</label>
        <select class="e-input" id="${GEM_EMARSYS_SHORTCUT_SELECT_ID}"><option value="0">Not assigned</option></select>
        <div class="sub-label" style="font-size:12px; opacity:0.75; margin-top:4px;">Lets you insert this snippet from the Gemma Token menu by pressing this number.</div>
      `.trim();

      const descField = dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)?.closest('.e-field');
      if (descField && descField.parentElement) {
        descField.insertAdjacentElement('afterend', shortcutField);
      } else {
        const content = dialogRoot.querySelector('.e-dialog__content') || dialogRoot;
        content.appendChild(shortcutField);
      }
    }

    // Swap Keywords (multiple per snippet), injected below Description
    let swapSection = dialogRoot.querySelector('#gem-esl-swap-keywords-section');
    if (!swapSection) {
      swapSection = document.createElement('div');
      swapSection.id = 'gem-esl-swap-keywords-section';
      swapSection.style.marginTop = '6px';
      swapSection.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start; margin-bottom:4px;">
          <div style="width:100%;">Optional Keyword for Swapping</div>
          <div style="min-width:120px;">Swap Method</div>
          <div style="min-width:140px;">Match Rules</div>
          <div style="min-width:140px;">Initiate From</div>
          <div style="min-width:40px;"></div>
        </div>
        <div id="${GEM_EMARSYS_SWAP_KEYWORDS_ROWS_ID}"></div>
        <button class="e-btn" id="${GEM_EMARSYS_ADD_SWAP_KEYWORD_BTN_ID}" type="button" style="width: 100%;">+ Add a Keyword for Swapping</button>
      `.trim();

      const anchorField =
        dialogRoot.querySelector(`#${GEM_EMARSYS_SHORTCUT_SELECT_ID}`)?.closest('.e-field') ||
        dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)?.closest('.e-field');
      if (anchorField && anchorField.parentElement) {
        anchorField.insertAdjacentElement('afterend', swapSection);
      } else {
        const content = dialogRoot.querySelector('.e-dialog__content') || dialogRoot;
        content.appendChild(swapSection);
      }
    }

    // Populate values (for edit mode)
    const categoryInput = dialogRoot.querySelector(`#${GEM_EMARSYS_CATEGORY_INPUT_ID}`);
    if (categoryInput && typeof context.category === 'string') {
      categoryInput.value = context.category;
      categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
      categoryInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const descInput = dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`);
    if (descInput && typeof context.description === 'string') {
      descInput.value = context.description;
      descInput.dispatchEvent(new Event('input', { bubbles: true }));
      descInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const shortcutSelect = dialogRoot.querySelector(`#${GEM_EMARSYS_SHORTCUT_SELECT_ID}`);
    if (shortcutSelect) {
      const shortcutKey = context.snippetId || context.pendingId;
      populateShortcutSelect(
        shortcutSelect,
        window.gemGemmaPrefixedId && shortcutKey ? window.gemGemmaPrefixedId(shortcutKey) : (shortcutKey ? `g:${shortcutKey}` : null)
      );
    }

    const rowsContainer = dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_KEYWORDS_ROWS_ID}`);
    const addBtn = dialogRoot.querySelector(`#${GEM_EMARSYS_ADD_SWAP_KEYWORD_BTN_ID}`);
    if (rowsContainer) {
      bindSwapKeywordRowsHandlers(dialogRoot, rowsContainer, addBtn);
      resetSwapKeywordRowsUI(rowsContainer, Array.isArray(context?.swapKeywords) ? context.swapKeywords : []);
    }
  }

  function setEmarsysDialogCode(dialogRoot, desiredCode) {
    const maxAttempts = 12; // ~1.2s total
    let attempt = 0;

    const apply = () => {
      attempt++;

      const cmEl = dialogRoot.querySelector('.CodeMirror');
      const cmInstance = cmEl && cmEl.CodeMirror;
      if (cmInstance && typeof cmInstance.setValue === 'function' && typeof cmInstance.getValue === 'function') {
        // Hard replace to guarantee no concatenation.
        cmInstance.setValue('');
        cmInstance.setValue(desiredCode);

        // If Emarsys runs another async setValue shortly after, we may need one more pass.
        if (cmInstance.getValue() === desiredCode) {
          return;
        }
      } else {
        // Fallback: underlying textarea (may exist before CodeMirror fully binds)
        const cmTextarea = dialogRoot.querySelector('.CodeMirror textarea');
        if (cmTextarea) {
          cmTextarea.value = '';
          cmTextarea.value = desiredCode;
          cmTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          cmTextarea.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }

      if (attempt < maxAttempts) {
        setTimeout(apply, 100);
      }
    };

    // Start shortly after patching so Emarsys has time to populate its defaults/context.
    setTimeout(apply, 50);
  }

  function tryExtractEmarsysDialogCodeOnce(dialogRoot) {
    // 1) Direct CodeMirror instance on wrapper
    const cmEl = dialogRoot.querySelector('.CodeMirror');
    const cmInstance = cmEl && cmEl.CodeMirror;
    if (cmInstance && typeof cmInstance.getValue === 'function') {
      return cmInstance.getValue();
    }

    // 2) vce-codemirror element sometimes stores the instance
    const vceCm = dialogRoot.querySelector('vce-codemirror');
    if (vceCm) {
      const candidates = [
        vceCm.CodeMirror,
        vceCm.codemirror,
        vceCm.codeMirror,
        vceCm.editor,
        vceCm._editor,
        vceCm._codemirror
      ];
      for (const c of candidates) {
        if (c && typeof c.getValue === 'function') {
          return c.getValue();
        }
      }
    }

    // 3) DOM fallback: read rendered lines
    if (cmEl) {
      const pres = cmEl.querySelectorAll('pre.CodeMirror-line');
      if (pres && pres.length) {
        const lines = Array.from(pres).map((pre) => (pre.textContent || '').replace(/\u200B/g, ''));
        const joined = lines.join('\n');
        return joined;
      }
      const codeContainer = cmEl.querySelector('.CodeMirror-code');
      if (codeContainer) {
        return (codeContainer.textContent || '').replace(/\u200B/g, '');
      }
    }

    return '';
  }

  function readEmarsysDialogCode(dialogRoot) {
    // Emarsys can still be mid-initialization; retry briefly so we don't treat
    // a non-empty editor as empty and throw "Please enter snippet code."
    const maxAttempts = 10;
    let attempt = 0;

    return new Promise((resolve) => {
      const tick = () => {
        attempt++;
        const code = tryExtractEmarsysDialogCodeOnce(dialogRoot);
        if (code && code.trim().length > 0) {
          resolve(code);
          return;
        }
        if (attempt >= maxAttempts) {
          resolve(code || '');
          return;
        }
        setTimeout(tick, 75);
      };
      tick();
    });
  }

  function closeEmarsysDialog(dialogRoot) {
    // Try common close button patterns
    const closeBtn =
      dialogRoot.querySelector('button.e-dialog__close') ||
      dialogRoot.querySelector('[aria-label="Close Dialog"] button') ||
      dialogRoot.querySelector('button[aria-label="Close"]');

    if (closeBtn) {
      closeBtn.click();
      return;
    }

    // Fallback: ESC key
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function applyShortcutSlotFromValues(shortcutSlot, snippetId, snippetName) {
    if (typeof window.gemAssignShortcutSlot !== 'function' || typeof window.gemUnassignShortcutSlotByKey !== 'function') return;
    const key = window.gemGemmaPrefixedId ? window.gemGemmaPrefixedId(snippetId) : `g:${snippetId}`;
    const slot = Number(shortcutSlot || 0);
    if (!slot) {
      window.gemUnassignShortcutSlotByKey(key, () => {});
      return;
    }
    window.gemAssignShortcutSlot(slot, { key, name: snippetName, kind: 'gemma' }, (result) => {
      if (result && result.ok && result.displaced && window.gemShowToast) {
        window.gemShowToast(
          `Shortcut ${slot} moved from "${result.displaced.name}" to "${snippetName}".`,
          { type: 'info', durationMs: 2800 }
        );
      }
    });
  }

  function handleSnippetSaveFromValues(values, editingSnippetId = null, dialogRoot = null, pendingId = null) {
    const category = (values?.category || '').trim();
    const name = (values?.name || '').trim();
    const code = (values?.code || '').trim();
    const description = (values?.description || '').trim();
    const favorite = !!values?.favorite;
    const shortcutSlot = Number(values?.shortcutSlot || 0);
    const swapKeywords = Array.isArray(values?.swapKeywords)
      ? values.swapKeywords
          .map((k) => ({
            keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
            mode: normalizeSwapMode(k && k.mode),
            initiateFrom: normalizeSwapInitiateFrom(k && k.initiateFrom)
          }))
          .filter((k) => !!k.keyword)
      : [];

    if (!name) {
      gemToast('Please enter a snippet name.', { type: 'warn', durationMs: 2200 });
      return;
    }
    if (!code) {
      gemToast('Please enter snippet code.', { type: 'warn', durationMs: 2200 });
      return;
    }

    getSnippets((snippets) => {
      // Enforce unique swap keywords (case-sensitive) across other snippets.
      if (swapKeywords.length) {
        const used = new Set();
        snippets.forEach((s) => {
          if (editingSnippetId && s.id === editingSnippetId) return;
          normalizeSwapKeywordsFromSnippet(s).forEach((k) => {
            if (k && k.keyword) used.add(k.keyword);
          });
        });
        const conflictKeyword = swapKeywords.find((k) => used.has(k.keyword))?.keyword;
        if (conflictKeyword) {
          gemToast(`The swap keyword "${conflictKeyword}" is already used by another snippet. Please choose a unique keyword.`, { type: 'warn', durationMs: 3600 });
          return;
        }
      }

      if (editingSnippetId) {
        const updatedSnippets = snippets.map((snippet) => {
          if (snippet.id !== editingSnippetId) return snippet;
          const next = { ...snippet, favorite, category, name: name, content: code, description, swapKeywords };
          // Clean up legacy fields if present
          delete next.swapKeyword;
          delete next.swapMode;
          delete next.swapCaseSensitive;
          return next;
        });
        saveSnippets(updatedSnippets, () => {
          applyShortcutSlotFromValues(shortcutSlot, editingSnippetId, name);
          refreshSnippetsDisplay();
          if (dialogRoot) closeEmarsysDialog(dialogRoot);
        });
      } else {
        const newSnippet = {
          id: pendingId || (window.gemGenerateSnippetId && window.gemGenerateSnippetId()) || `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          favorite,
          category,
          name,
          content: code,
          description,
          swapKeywords
        };
        saveSnippets([...snippets, newSnippet], () => {
          applyShortcutSlotFromValues(shortcutSlot, newSnippet.id, name);
          refreshSnippetsDisplay();
          if (dialogRoot) closeEmarsysDialog(dialogRoot);
        });
      }
    });
  }

  function handleSnippetDeleteFromEmarsysDialog(snippetId, dialogRoot) {
    const confirmed = confirm('Are you sure you want to delete this snippet? This action cannot be undone.');
    if (!confirmed) return;

    getSnippets((snippets) => {
      const updatedSnippets = snippets.filter(snippet => snippet.id !== snippetId);
      saveSnippets(updatedSnippets, () => {
        if (typeof window.gemUnassignShortcutSlotByKey === 'function') {
          const key = window.gemGemmaPrefixedId ? window.gemGemmaPrefixedId(snippetId) : `g:${snippetId}`;
          window.gemUnassignShortcutSlotByKey(key, () => {});
        }
        refreshSnippetsDisplay();
        if (dialogRoot) closeEmarsysDialog(dialogRoot);
      });
    });
  }

  // ------------------------------------------------------------
  // Swap keyword rows UI (shared between Gem modal + Emarsys modal injection)
  // ------------------------------------------------------------

  function addSwapKeywordRowEl(rowsContainer, keyword = '', mode = 'token', matchRule = 'partial', initiateFrom = 'anywhere') {
    const row = document.createElement('div');
    row.className = 'gem-swap-keyword-row';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'flex-start';
    row.style.marginBottom = '8px';

    const keywordField = document.createElement('div');
    keywordField.className = 'e-field';
    keywordField.style.width = '100%';
    keywordField.style.marginBottom = '0';
    keywordField.innerHTML = `
      <input class="e-input gem-swap-keyword-input" type="text" placeholder="Optional keyword (must be unique)" aria-label="Optional Keyword for Swapping">
    `.trim();

    const modeField = document.createElement('div');
    modeField.className = 'e-field';
    modeField.style.minWidth = '120px';
    modeField.style.marginBottom = '0';
    modeField.innerHTML = `
      <select class="e-input gem-swap-mode-select" aria-label="Swap Method">
        <option value="token">ESL Token</option>
        <option value="plain">Plain Text</option>
      </select>
    `.trim();

    const matchField = document.createElement('div');
    matchField.className = 'e-field';
    matchField.style.minWidth = '140px';
    matchField.style.marginBottom = '0';
    matchField.innerHTML = `
      <select class="e-input gem-swap-match-select" aria-label="Match Rules">
        <option value="partial">Partial Word</option>
        <option value="whole">Whole Word</option>
      </select>
    `.trim();

    const initiateField = document.createElement('div');
    initiateField.className = 'e-field';
    initiateField.style.minWidth = '140px';
    initiateField.style.marginBottom = '0';
    initiateField.innerHTML = `
      <select class="e-input gem-swap-initiate-select" aria-label="Initiate From">
        <option value="anywhere">Anywhere</option>
        <option value="panel">Snippets Panel</option>
        <option value="toolbar">Block Toolbar</option>
      </select>
    `.trim();

    const removeWrap = document.createElement('div');
    removeWrap.style.paddingBottom = '4px';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'e-btn e-btn-borderless e-btn-onlyicon gem-remove-swap-keyword-btn';
    removeBtn.type = 'button';
    removeBtn.title = 'Remove keyword';
    removeBtn.setAttribute('aria-label', 'Remove keyword');
    removeBtn.style.minWidth = 'unset';
    removeBtn.style.padding = '0 6px';
    removeBtn.textContent = '×';
    removeWrap.appendChild(removeBtn);

    row.appendChild(keywordField);
    row.appendChild(modeField);
    row.appendChild(matchField);
    row.appendChild(initiateField);
    row.appendChild(removeWrap);
    rowsContainer.appendChild(row);

    const input = row.querySelector('.gem-swap-keyword-input');
    const select = row.querySelector('.gem-swap-mode-select');
    const matchSelect = row.querySelector('.gem-swap-match-select');
    const initiateSelect = row.querySelector('.gem-swap-initiate-select');
    if (input) input.value = keyword || '';
    if (select) select.value = normalizeSwapMode(mode);
    if (matchSelect) matchSelect.value = normalizeSwapMatchRule(matchRule);
    if (initiateSelect) initiateSelect.value = normalizeSwapInitiateFrom(initiateFrom);
  }

  function resetSwapKeywordRowsUI(rowsContainer, swapKeywords) {
    if (!rowsContainer) return;
    rowsContainer.innerHTML = '';
    const list = Array.isArray(swapKeywords) ? swapKeywords : [];
    const cleaned = list
      .map((k) => ({
        keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
        mode: normalizeSwapMode(k && k.mode),
        matchRule: normalizeSwapMatchRule(k && k.matchRule),
        initiateFrom: normalizeSwapInitiateFrom(k && k.initiateFrom)
      }))
      .filter((k) => !!k.keyword);

    if (cleaned.length === 0) {
      addSwapKeywordRowEl(rowsContainer, '', 'token', 'partial', 'anywhere');
    } else {
      cleaned.forEach((k) => addSwapKeywordRowEl(rowsContainer, k.keyword, k.mode, k.matchRule, k.initiateFrom));
    }
  }

  function readSwapKeywordRowsUI(rowsContainer) {
    const rows = Array.from(rowsContainer?.querySelectorAll('.gem-swap-keyword-row') || []);
    const out = [];
    const seen = new Set();

    for (const row of rows) {
      const keyword = (row.querySelector('.gem-swap-keyword-input')?.value || '').trim();
      if (!keyword) continue;
      if (seen.has(keyword)) {
        return { ok: false, error: `Duplicate keyword "${keyword}" in this snippet. Each keyword can only appear once per snippet (case-sensitive).`, focusEl: row.querySelector('.gem-swap-keyword-input') };
      }
      seen.add(keyword);
      const mode = normalizeSwapMode(row.querySelector('.gem-swap-mode-select')?.value);
      const matchRule = normalizeSwapMatchRule(row.querySelector('.gem-swap-match-select')?.value);
      const initiateFrom = normalizeSwapInitiateFrom(row.querySelector('.gem-swap-initiate-select')?.value);
      out.push({ keyword, mode, matchRule, initiateFrom });
    }

    return { ok: true, swapKeywords: out };
  }

  function bindSwapKeywordRowsHandlers(rootEl, rowsContainer, addBtn) {
    if (!rootEl || rootEl._gemSwapKeywordsBound) return;
    rootEl._gemSwapKeywordsBound = true;

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addSwapKeywordRowEl(rowsContainer, '', 'token', 'partial', 'anywhere');
      });
    }

    // Remove keyword (delegated)
    rootEl.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.gem-remove-swap-keyword-btn');
      if (!btn) return;
      const row = btn.closest('.gem-swap-keyword-row');
      if (!row) return;

      const allRows = Array.from(rowsContainer.querySelectorAll('.gem-swap-keyword-row'));
      if (allRows.length <= 1) {
        // Keep at least one row; just clear it
        const input = row.querySelector('.gem-swap-keyword-input');
        const select = row.querySelector('.gem-swap-mode-select');
        const matchSelect = row.querySelector('.gem-swap-match-select');
        const initiateSelect = row.querySelector('.gem-swap-initiate-select');
        if (input) input.value = '';
        if (select) select.value = 'token';
        if (matchSelect) matchSelect.value = 'partial';
        if (initiateSelect) initiateSelect.value = 'anywhere';
        return;
      }
      row.remove();
    });
  }

  // ------------------------------------------------------------
  // Quick-insert shortcut (1-9) field shared between the Gem modal + the
  // Emarsys-patched ESL dialog. Backed by shortcut-slots.js.
  // ------------------------------------------------------------

  function populateShortcutSelectOptions(selectEl, currentKey, map) {
    if (!selectEl) return;
    let html = '<option value="0">Not assigned</option>';
    for (let slot = 1; slot <= 9; slot++) {
      const entry = map[String(slot)];
      let label = String(slot);
      if (entry && entry.key && entry.key !== currentKey) {
        label += ` \u2014 currently: ${escapeHtmlText(entry.name)}`;
      } else if (entry && entry.key === currentKey) {
        label += ' (current)';
      }
      html += `<option value="${slot}">${label}</option>`;
    }
    selectEl.innerHTML = html;
    const currentSlot = (window.gemGetShortcutSlotForKey && currentKey)
      ? window.gemGetShortcutSlotForKey(map, currentKey)
      : 0;
    selectEl.value = String(currentSlot || 0);
  }

  function populateShortcutSelect(selectEl, currentKey) {
    if (!selectEl) return;
    if (typeof window.gemLoadShortcutSlots !== 'function') {
      populateShortcutSelectOptions(selectEl, currentKey, {});
      return;
    }
    window.gemLoadShortcutSlots((map) => {
      populateShortcutSelectOptions(selectEl, currentKey, map || {});
    });
  }

  function applyShortcutSelectValue(selectEl, snippetId, snippetName) {
    if (!selectEl) return;
    applyShortcutSlotFromValues(selectEl.value, snippetId, snippetName);
  }

  // Function to open the snippet modal
  function openSnippetModal(snippetId = null) {
    // Remove any existing modal
    closeSnippetModal();

    // New snippets get a stable id up front so the quick-insert shortcut picker
    // has something to assign to before the snippet is actually saved.
    const pendingId =
      snippetId ||
      (window.gemGenerateSnippetId && window.gemGenerateSnippetId()) ||
      `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', createSnippetModalHTML(!!snippetId));
    const rootEl = document.getElementById('gem-snippet-modal');
    if (rootEl) rootEl.dataset.gemPendingSnippetId = pendingId;

    // Set up modal event handlers after a brief delay to ensure DOM is ready
    setTimeout(() => {
      setupModalEventHandlers(snippetId);
    }, 10);

    // If editing, pre-populate the form
    if (snippetId) {
      getSnippets((snippets) => {
        const snippet = snippets.find(s => s.id === snippetId);
        if (snippet) {
          setTimeout(() => {
            const categoryInput = document.getElementById('gem-snippet-category-input');
            const nameInput = document.getElementById('gem-snippet-name-input');
            const codeInput = document.getElementById('gem-snippet-code-input');
            const descInput = document.getElementById('gem-snippet-description-input');
            const modalRoot = document.getElementById('gem-snippet-modal');
            const rowsContainer = document.getElementById('gem-swap-keywords-rows');
            const addBtn = document.getElementById('gem-add-swap-keyword-btn');
            const favBtn = document.getElementById('gem-modal-favorite-btn');
            const shortcutSelect = document.getElementById('gem-snippet-shortcut-select');

            if (categoryInput) categoryInput.value = snippet.category || '';
            if (nameInput) {
              nameInput.value = snippet.name;
              nameInput.focus();
              nameInput.select();
            }
            if (codeInput) {
              codeInput.value = snippet.content;
            }
            if (descInput) descInput.value = snippet.description || '';
            if (modalRoot && rowsContainer) {
              bindSwapKeywordRowsHandlers(modalRoot, rowsContainer, addBtn);
              resetSwapKeywordRowsUI(rowsContainer, normalizeSwapKeywordsFromSnippet(snippet));
            }
            if (favBtn) setGemModalFavoriteState(!!snippet.favorite);
            if (shortcutSelect) {
              populateShortcutSelect(
                shortcutSelect,
                window.gemGemmaPrefixedId ? window.gemGemmaPrefixedId(snippetId) : `g:${snippetId}`
              );
            }
          }, 100);
        }
      });
    } else {
      // Focus on name input for new snippets
      setTimeout(() => {
        const nameInput = document.getElementById('gem-snippet-name-input');
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
        const modalRoot = document.getElementById('gem-snippet-modal');
        const rowsContainer = document.getElementById('gem-swap-keywords-rows');
        const addBtn = document.getElementById('gem-add-swap-keyword-btn');
        const shortcutSelect = document.getElementById('gem-snippet-shortcut-select');
        if (shortcutSelect) {
          populateShortcutSelect(
            shortcutSelect,
            window.gemGemmaPrefixedId ? window.gemGemmaPrefixedId(pendingId) : `g:${pendingId}`
          );
        }
        if (modalRoot && rowsContainer) {
          bindSwapKeywordRowsHandlers(modalRoot, rowsContainer, addBtn);
          resetSwapKeywordRowsUI(rowsContainer, []);
        }
        setGemModalFavoriteState(false);
      }, 100);
    }

    console.log("[Gem] Snippet modal opened", snippetId ? `(editing ${snippetId})` : '(creating new)');
  }

  // Function to close the snippet modal
  function closeSnippetModal() {
    const modal = document.getElementById('gem-snippet-modal');
    const backdrop = document.getElementById('gem-modal-backdrop');

    if (modal) modal.remove();
    if (backdrop) backdrop.remove();

    console.log("[Gem] Snippet modal closed");
  }

  // Function to set up modal event handlers
  function setupModalEventHandlers(snippetId = null) {
    // Close button
    const closeBtn = document.getElementById('gem-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSnippetModal);
    }

    // Cancel button
    const cancelBtn = document.getElementById('gem-modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeSnippetModal);
    }

    // OK button
    const okBtn = document.getElementById('gem-modal-ok-btn');
    if (okBtn) {
      okBtn.addEventListener('click', () => handleSnippetSave(snippetId));
    }

    // Delete button (only when editing)
    const deleteBtn = document.getElementById('gem-modal-delete-btn');
    if (deleteBtn && snippetId) {
      deleteBtn.addEventListener('click', () => handleSnippetDelete(snippetId));
    }

    // Favorite button
    const favBtn = document.getElementById('gem-modal-favorite-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        setGemModalFavoriteState(!getGemModalFavoriteState());
      });
    }

    // Backdrop click to close
    const backdrop = document.getElementById('gem-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeSnippetModal);
    }

    // ESC key to close
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeSnippetModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Enter key on form to submit
    const handleEnter = (event) => {
      if (event.key === 'Enter' && event.ctrlKey) {
        handleSnippetSave(snippetId);
      }
    };
    document.addEventListener('keydown', handleEnter);
  }

  function getGemModalFavoriteState() {
    const modal = document.getElementById('gem-snippet-modal');
    return modal?.dataset?.gemFavorite === 'true';
  }

  function setGemModalFavoriteState(isFav) {
    const modal = document.getElementById('gem-snippet-modal');
    const icon = document.getElementById('gem-modal-favorite-icon');
    if (modal && modal.dataset) modal.dataset.gemFavorite = isFav ? 'true' : 'false';
    if (icon) icon.textContent = isFav ? '★' : '☆';
  }

  // Function to handle saving a snippet (create or update)
  function handleSnippetSave(editingSnippetId = null) {
    const categoryInput = document.getElementById('gem-snippet-category-input');
    const nameInput = document.getElementById('gem-snippet-name-input');
    const codeInput = document.getElementById('gem-snippet-code-input');
    const descInput = document.getElementById('gem-snippet-description-input');
    const rowsContainer = document.getElementById('gem-swap-keywords-rows');
    const shortcutSelect = document.getElementById('gem-snippet-shortcut-select');
    const modalRoot = document.getElementById('gem-snippet-modal');
    const pendingId = modalRoot?.dataset?.gemPendingSnippetId || null;

    if (!nameInput || !codeInput) {
      console.log("[Gem] Modal inputs not found");
      return;
    }

    const category = categoryInput ? categoryInput.value.trim() : '';
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    const description = descInput ? descInput.value.trim() : '';
    const favorite = getGemModalFavoriteState();
    const read = readSwapKeywordRowsUI(rowsContainer);
    if (!read.ok) {
      gemToast(read.error, { type: 'error', durationMs: 3200 });
      read.focusEl && read.focusEl.focus && read.focusEl.focus();
      return;
    }
    const swapKeywords = read.swapKeywords;

    if (!name) {
      gemToast('Please enter a snippet name.', { type: 'warn', durationMs: 2200 });
      nameInput.focus();
      return;
    }

    if (!code) {
      gemToast('Please enter snippet code.', { type: 'warn', durationMs: 2200 });
      codeInput.focus();
      return;
    }

    getSnippets((snippets) => {
      // Enforce unique swap keywords (case-sensitive) across other snippets.
      if (swapKeywords.length) {
        const used = new Set();
        snippets.forEach((s) => {
          if (editingSnippetId && s.id === editingSnippetId) return;
          normalizeSwapKeywordsFromSnippet(s).forEach((k) => {
            if (k && k.keyword) used.add(k.keyword);
          });
        });
        const conflictKeyword = swapKeywords.find((k) => used.has(k.keyword))?.keyword;
        if (conflictKeyword) {
          gemToast(`The swap keyword "${conflictKeyword}" is already used by another snippet. Please choose a unique keyword.`, { type: 'warn', durationMs: 3600 });
          // Focus the row that contains this keyword if possible
          const input = rowsContainer && Array.from(rowsContainer.querySelectorAll('.gem-swap-keyword-input')).find((el) => (el.value || '').trim() === conflictKeyword);
          input && input.focus && input.focus();
          input && input.select && input.select();
          return;
        }
      }

      if (editingSnippetId) {
        // Update existing snippet
        const updatedSnippets = snippets.map((snippet) => {
          if (snippet.id !== editingSnippetId) return snippet;
          const next = { ...snippet, favorite, category: category, name: name, content: code, description: description, swapKeywords };
          // Clean up legacy fields if present
          delete next.swapKeyword;
          delete next.swapMode;
          delete next.swapCaseSensitive;
          return next;
        });

        // Save to storage
        saveSnippets(updatedSnippets, () => {
          console.log("[Gem] Snippet updated:", editingSnippetId);
          applyShortcutSelectValue(shortcutSelect, editingSnippetId, name);

          // Close modal
          closeSnippetModal();

          // Refresh the snippets display
          refreshSnippetsDisplay();
        });
      } else {
        // Create new snippet (reuse the pending id so it matches whatever the
        // quick-insert shortcut select was populated/assigned against).
        const newSnippet = {
          id: pendingId || (window.gemGenerateSnippetId && window.gemGenerateSnippetId()) || `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          favorite,
          category: category,
          name: name,
          content: code,
          description: description,
          swapKeywords
        };

        // Add to existing snippets
        const updatedSnippets = [...snippets, newSnippet];

        // Save to storage
        saveSnippets(updatedSnippets, () => {
          console.log("[Gem] New snippet saved:", newSnippet);
          applyShortcutSelectValue(shortcutSelect, newSnippet.id, name);

          // Close modal
          closeSnippetModal();

          // Refresh the snippets display
          refreshSnippetsDisplay();
        });
      }
    });
  }

  // Function to handle deleting a snippet
  function handleSnippetDelete(snippetId) {
    // Show confirmation dialog
    const confirmed = confirm('Are you sure you want to delete this snippet? This action cannot be undone.');

    if (!confirmed) {
      return; // User cancelled
    }

    // Get current snippets and remove the one with the given ID
    getSnippets((snippets) => {
      const updatedSnippets = snippets.filter(snippet => snippet.id !== snippetId);

      // Save to storage
      saveSnippets(updatedSnippets, () => {
        console.log("[Gem] Snippet deleted:", snippetId);
        if (typeof window.gemUnassignShortcutSlotByKey === 'function') {
          const key = window.gemGemmaPrefixedId ? window.gemGemmaPrefixedId(snippetId) : `g:${snippetId}`;
          window.gemUnassignShortcutSlotByKey(key, () => {});
        }

        // Close modal
        closeSnippetModal();

        // Refresh the snippets display
        refreshSnippetsDisplay();
      });
    });
  }

  // Function to refresh the snippets display
  function refreshSnippetsDisplay() {
    const navContent = document.querySelector('.e-verticalnav__content');
    if (!navContent) return;

    // Find the snippets content area
    const snippetsContent = navContent.querySelector('gem-snippets .e-section__content');
    if (!snippetsContent) return;

    // Re-render the snippets tables (grouped by category)
    getSnippets((snippets) => {
      getSnippetCategoryCollapseState((collapseState) => {
        const root = navContent.querySelector('gem-snippets');
        const currentSearch = root?.querySelector('#gem-snippet-search-input')?.value || '';
        const currentFilterMode = root?.dataset?.gemSnippetFilterMode || root?.querySelector('#gem-snippet-filter-select')?.value || 'showAll';
        let tablesContainer = snippetsContent.querySelector('.gem-snippets-tables');
        if (!tablesContainer) {
          tablesContainer = document.createElement('div');
          tablesContainer.className = 'gem-snippets-tables';
          // Insert at the top of the content area
          snippetsContent.insertAdjacentElement('afterbegin', tablesContainer);
        }

        tablesContainer.innerHTML = renderSnippetsTablesHTML(snippets, collapseState);

        // Re-setup drag and drop and edit buttons for the new snippets
        setupSnippetDragAndDrop();
        setupSwapSnippetButtons();
        setupEditSnippetButtons();
        setupCopySnippetButtons();
        setupSnippetCategoryCollapseToggles();
        setupSnippetsSearch();
        setupSnippetsFilterSelect();
        setupSnippetsImportExportButtons();

        // Re-apply current search after re-render
        if (root && currentSearch) {
          const input = root.querySelector('#gem-snippet-search-input');
          if (input) input.value = currentSearch;
        }

        // Re-apply filter mode after re-render
        if (root) {
          root.dataset.gemSnippetFilterMode = currentFilterMode;
        }

        // Apply combined filters (search + dropdown)
        if (root) {
          applySnippetSearchFilter(root, currentSearch);
        }
      });
    });
  }

  // Function to set up drag and drop for snippets
  function setupSnippetDragAndDrop() {
    console.log("[Gem] Setting up snippet drag and drop");

    // Find all draggable snippet elements
    const snippetElements = document.querySelectorAll('gem-snippets [draggable="true"]');

    snippetElements.forEach(snippetElement => {
      const vceToken = snippetElement.closest('vce-token');
      if (!vceToken) return;

      const snippetHTML = vceToken.getAttribute('data');
      if (!snippetHTML) return;

      // Skip if already set up
      if (snippetElement._gemDragStartHandler) {
        return;
      }

      const newDragStartHandler = (event) => {
        console.log("[Gem] Snippet drag started:", snippetElement.textContent);

        // Store the snippet HTML in the drag data
        event.dataTransfer.setData('text/html', snippetHTML);
        event.dataTransfer.effectAllowed = 'copy';

        // Add visual feedback
        snippetElement.style.opacity = '0.5';
      };

      const newDragEndHandler = (event) => {
        snippetElement.style.opacity = '1';
      };

      // Store references to the handlers so we can check if already set up
      snippetElement._gemDragStartHandler = newDragStartHandler;
      snippetElement._gemDragEndHandler = newDragEndHandler;

      // Set up drag start
      snippetElement.addEventListener('dragstart', newDragStartHandler);

      // Reset visual feedback when drag ends
      snippetElement.addEventListener('dragend', newDragEndHandler);
    });

    // Set up drop zones in the iframe
    setupIframeDropZones();
  }

  // ------------------------------------------------------------
  // Iframe targeting + DnD wiring
  // We only allow drops into: vce-iframe iframe.e-contentblocks-preview__iframe
  // and explicitly NOT into the mobile preview clone (.gem-iframe-wrapper iframe.iframe-duplicate)
  // ------------------------------------------------------------

  let gemSnippetTargetIframeEl = null;
  let gemSnippetTargetIframeDoc = null;
  let gemLastHandledDrop = { at: 0, signature: "" };

  function getGemSnippetTargetIframe() {
    const iframe = document.querySelector('vce-iframe iframe.e-contentblocks-preview__iframe');
    if (!iframe) return null;

    // Never allow the mobile preview clone to become a target
    if (iframe.classList.contains('iframe-duplicate')) return null;
    if (iframe.closest('.gem-iframe-wrapper')) return null;

    return iframe;
  }

  function cleanupLegacyGemSnippetListenersInDoc(doc) {
    // Remove legacy per-element handlers we previously attached (_gemDropHandler etc.)
    try {
      const editables = doc.querySelectorAll('[contenteditable="true"]');
      editables.forEach((el) => {
        if (el._gemDragOverHandler) {
          el.removeEventListener('dragover', el._gemDragOverHandler);
          delete el._gemDragOverHandler;
        }
        if (el._gemDragEnterHandler) {
          el.removeEventListener('dragenter', el._gemDragEnterHandler);
          delete el._gemDragEnterHandler;
        }
        if (el._gemDragLeaveHandler) {
          el.removeEventListener('dragleave', el._gemDragLeaveHandler);
          delete el._gemDragLeaveHandler;
        }
        if (el._gemDropHandler) {
          el.removeEventListener('drop', el._gemDropHandler);
          delete el._gemDropHandler;
        }
      });

      if (doc._gemDocDragOverHandler) {
        doc.removeEventListener('dragover', doc._gemDocDragOverHandler);
        delete doc._gemDocDragOverHandler;
      }
    } catch (e) {
      // ignore
    }
  }

  function cleanupLegacyGemSnippetListenersEverywhere() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) cleanupLegacyGemSnippetListenersInDoc(doc);
      } catch (e) {
        // ignore cross-origin / transient access errors
      }
    });
  }

  function teardownGemSnippetDropZones() {
    if (!gemSnippetTargetIframeDoc) return;
    const handlers = gemSnippetTargetIframeDoc._gemSnippetDndHandlers;
    if (handlers) {
      gemSnippetTargetIframeDoc.removeEventListener('dragover', handlers.onDragOver, true);
      gemSnippetTargetIframeDoc.removeEventListener('drop', handlers.onDrop, true);
      delete gemSnippetTargetIframeDoc._gemSnippetDndHandlers;
    }
    gemSnippetTargetIframeDoc = null;
    gemSnippetTargetIframeEl = null;
  }

  // Function to set up drop zones in the iframe
  function setupIframeDropZones() {
    const iframe = getGemSnippetTargetIframe();
    if (!iframe) {
      // If the target iframe disappeared, tear down old handlers
      teardownGemSnippetDropZones();
      return;
    }

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // Always remove any old/legacy handlers (especially important for the cloned iframe case)
      cleanupLegacyGemSnippetListenersEverywhere();

      // If we're already wired to this exact doc, do nothing
      if (gemSnippetTargetIframeDoc === iframeDoc && iframeDoc._gemSnippetDndHandlers) {
        return;
      }

      // Switching target iframe/doc -> remove handlers from previous target doc
      teardownGemSnippetDropZones();

      gemSnippetTargetIframeEl = iframe;
      gemSnippetTargetIframeDoc = iframeDoc;

      const onDragOver = (event) => {
        const targetEl = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
        if (!targetEl) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      };

      const onDrop = (event) => {
        // Must still be the current target iframe + doc
        if (gemSnippetTargetIframeDoc !== iframeDoc) return;
        if (getGemSnippetTargetIframe() !== iframe) return;

        const targetEl = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
        if (!targetEl) return;

        // Mark handled + prevent any editor-native drop handlers from also inserting content.
        // (TinyMCE / Emarsys can programmatically insert on drop even if default is prevented.)
        if (event._gemSnippetHandled) return;
        event._gemSnippetHandled = true;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const snippetHTML = event.dataTransfer.getData('text/html');
        if (!snippetHTML) return;

        dropEventCounter++;
        const dropId = `drop-${dropEventCounter}-${Date.now()}`;

        // Defensive dedupe: some environments fire multiple drop-like flows
        // (or we can see multiple drops very close together on re-render).
        const sig = `${targetEl.id || 'no-id'}|${event.clientX},${event.clientY}|${snippetHTML.length}`;
        const now = Date.now();
        if (gemLastHandledDrop.signature === sig && now - gemLastHandledDrop.at < 250) {
          console.log(`[Gem] DROP deduped (${dropId})`, { sig });
          return;
        }
        gemLastHandledDrop = { at: now, signature: sig };

        insertSnippetAtCaret(targetEl, snippetHTML, iframeDoc, dropId, event);
      };

      iframeDoc._gemSnippetDndHandlers = { onDragOver, onDrop };

      // Capture listeners at document level (no per-element wiring; no listener duplication)
      iframeDoc.addEventListener('dragover', onDragOver, true);
      iframeDoc.addEventListener('drop', onDrop, true);

    } catch (error) {
      // If we can't access the iframe (transient/cross-origin), don't crash
      console.log("[Gem] Error setting up target iframe drop zones:", error.message);
    }
  }

  // Function to set up iframe drop zone observer
  function setupIframeObserver() {
    if (window._gemSnippetIframeObserver) return;

    if (typeof gemDomWatchSubscribe === 'function') {
      window._gemSnippetIframeObserver = gemDomWatchSubscribe(() => {
        setupIframeDropZones();
      });
    } else {
      const observer = new MutationObserver(() => {
        setupIframeDropZones();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window._gemSnippetIframeObserver = observer;
    }

    cleanupLegacyGemSnippetListenersEverywhere();
    setupIframeDropZones();
  }

  // Function to wait for and initialize the vertical nav
  function waitForVerticalNav() {
    const tryAddSnippetsTab = () => {
      if (addSnippetsTab()) {
        setupIframeObserver();
        return true;
      }
      return false;
    };

    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (verticalNav && tryAddSnippetsTab()) {
      console.log("[Gem] Vertical nav found, snippets tab added after Personalization");
      return;
    }

    console.log("[Gem] Vertical nav or Personalization tab not found, waiting...");

    const onReady = () => {
      if (tryAddSnippetsTab()) {
        console.log("[Gem] Snippets tab added after Personalization tab");
      }
    };

    if (typeof gemDomWatchWaitFor === 'function') {
      gemDomWatchWaitFor('e-verticalnav-menu', () => {
        if (!tryAddSnippetsTab()) {
          gemDomWatchWaitFor('#customTab_personaliztation', onReady);
        }
      });
      return;
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const menu =
            (node.matches && node.matches('e-verticalnav-menu') && node) ||
            (node.querySelector && node.querySelector('e-verticalnav-menu'));
          const personalization =
            (node.matches && node.id === 'customTab_personaliztation' && node) ||
            (node.querySelector && node.querySelector('#customTab_personaliztation'));

          if (menu || personalization) {
            if (tryAddSnippetsTab()) {
              observer.disconnect();
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Start the initialization
  waitForVerticalNav();

  document.addEventListener('gem-snippets-changed', () => {
    try {
      refreshSnippetsDisplay();
    } catch (_) {}
  });
}

// Add a global debugging function
window.debugSnippets = function() {
  console.log("[Gem] DEBUG: Snippets debug check");
  console.log("[Gem] DEBUG: Total drop events:", dropEventCounter);
  console.log("[Gem] DEBUG: Total insertions:", insertionCounter);
  console.log("[Gem] DEBUG: Snippets tab:", document.querySelector('#gem-snippets-tab'));
  console.log("[Gem] DEBUG: Snippets content:", document.querySelector('gem-snippets'));
  console.log("[Gem] DEBUG: Add snippet button:", document.querySelector('.gem-add-snippet-btn'));
  console.log("[Gem] DEBUG: Modal:", document.querySelector('#gem-snippet-modal'));
  console.log("[Gem] DEBUG: Iframe:", document.querySelector('.e-contentblocks-preview__iframe-desktop'));

  // Count current snippets in DOM
  const currentSnippets = document.querySelectorAll('gem-snippets span[e-token="cust_esl"]');
  console.log("[Gem] DEBUG: Current snippets in DOM:", currentSnippets.length);

  // Check stored snippets
  getSnippets((snippets) => {
    console.log("[Gem] DEBUG: Snippets in storage:", snippets.length);
    snippets.forEach((snippet, index) => {
      console.log(`[Gem] DEBUG: Snippet ${index}: ${snippet.name} (${snippet.content.length} chars)`);
    });
  });

  // Reset counters for next test
  dropEventCounter = 0;
  insertionCounter = 0;
  console.log("[Gem] DEBUG: Counters reset to 0");
};

// Expose snippet helpers globally for use by other modules
window.getSnippets = getSnippets;
window.gemGenerateSnippetHTML = generateSnippetHTML;
window.gemBuildGemmaCodeMirrorToken = buildGemmaCodeMirrorToken;
window.gemParsePersTokensInHtml = parsePersTokensInHtml;
window.gemFindPersTokenAtIndex = findPersTokenAtIndex;
window.gemFindPersTokenByRange = findPersTokenByRange;
window.gemReplacePersonalizableCodeMirrorTokenRange = replacePersonalizableCodeMirrorTokenRange;
window.gemResolveCodeMirrorInstance = resolveCodeMirrorInstance;
window.gemSyncCodeMirrorContextSelection = syncCodeMirrorContextSelection;
window.gemDebugPersonalizableCodeMirrorInsertState = gemDebugPersonalizableCodeMirrorInsertState;
window.gemInsertSnippetAtCaret = insertSnippetAtCaret;
window.gemInsertSnippetIntoTarget = gemInsertSnippetIntoTarget;

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSnippetsTab);
} else {
  initializeSnippetsTab();
}
