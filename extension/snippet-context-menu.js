console.log('[Gem] snippet-context-menu.js loaded');

(function () {
  'use strict';

  const CAMPAIGN_ROUTE = 'contentBlocks/campaign';
  const MENU_ID = 'gem-snippet-context-menu';
  const RECENT_STORAGE_KEY = 'gemSnippetContextRecent';
  const SETTING_KEY = 'gemSnippetContextMenuEnabled';
  const PREVIEW_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';
  const MAX_RECENT = 10;
  const MAX_SEARCH_RESULTS = 20;

  const PIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f" aria-hidden="true"><path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z"/></svg>';

  const GEMMA_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f" aria-hidden="true"><path d="M480-80 120-436l200-244h320l200 244L480-80ZM183-680l-85-85 57-56 85 85-57 56Zm257-80v-120h80v120h-80Zm335 80-57-57 85-85 57 57-85 85ZM480-192l210-208H270l210 208ZM358-600l-99 120h442l-99-120H358Z"/></svg>';

  const PREDEFINED_PERS_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f" aria-hidden="true"><path d="M234-276q51-39 114-61.5T480-360q69 0 132 22.5T726-276q35-41 54.5-93T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 59 19.5 111t54.5 93Zm146.5-204.5Q340-521 340-580t40.5-99.5Q421-720 480-720t99.5 40.5Q620-639 620-580t-40.5 99.5Q539-440 480-440t-99.5-40.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm100-95.5q47-15.5 86-44.5-39-29-86-44.5T480-280q-53 0-100 15.5T294-220q39 29 86 44.5T480-160q53 0 100-15.5ZM523-537q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm-43-43Zm0 360Z"/></svg>';

  const CUSTOM_PERS_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f" aria-hidden="true"><path d="M410-120v-238L204-239l-70-121 206-120-206-119 70-121 206 119v-239h140v239l206-119 70 121-206 119 206 120-70 121-206-119v238H410Z"/></svg>';

  let menuEl = null;
  let menuOpen = false;
  let insertMode = 'token';
  let activeCtx = null;
  let menuSnippets = [];
  let menuPersTokens = [];
  let pinnedPersTokens = [];
  let recentPersCache = {};
  let menuTokens = [];
  let persTokensLoading = false;
  let recentIds = [];
  let menuEnabled = true;
  let escapeUnsub = null;
  let outsideDismissHandler = null;
  let outsideDismissDocs = [];
  let boundDocs = new WeakSet();
  let menuAnchor = { x: 0, y: 0 };
  let menuPlacement = null;
  let menuResizeObserver = null;
  const caretTrackByElement = new WeakMap();
  const caretByEditorId = new Map();
  const patchedEditorIds = new Set();
  const IFRAME_BRIDGE_SCRIPT_ID = 'gem-snippet-iframe-bridge-script';

  function isCampaignPage() {
    try {
      const url = new URL(window.location.href);
      if (!(url.pathname || '').includes('bootstrap.php')) return false;
      return (url.searchParams.get('r') || '').trim() === CAMPAIGN_ROUTE;
    } catch (_) {
      return false;
    }
  }

  function loadSetting(callback) {
    if (!chrome?.storage?.sync) {
      menuEnabled = true;
      callback(menuEnabled);
      return;
    }
    chrome.storage.sync.get({ [SETTING_KEY]: true }, (res) => {
      menuEnabled = res[SETTING_KEY] !== false;
      callback(menuEnabled);
    });
  }

  function loadRecentIds(callback) {
    if (!chrome?.storage?.local) {
      recentIds = [];
      callback(recentIds);
      return;
    }
    chrome.storage.local.get({ [RECENT_STORAGE_KEY]: [] }, (res) => {
      const raw = res[RECENT_STORAGE_KEY];
      recentIds = Array.isArray(raw)
        ? raw.map((id) => String(id || '').trim()).filter(Boolean).slice(0, MAX_RECENT)
        : [];
      callback(recentIds);
    });
  }

  function pushRecentTokenId(prefixedId) {
    const id = String(prefixedId || '').trim();
    if (!id || !chrome?.storage?.local) return;
    const next = [id, ...recentIds.filter((x) => x !== id)].slice(0, MAX_RECENT);
    recentIds = next;
    chrome.storage.local.set({ [RECENT_STORAGE_KEY]: next });
  }

  function gemmaToMenuItem(snippet) {
    return {
      kind: 'gemma',
      id: String(snippet.id || ''),
      name: snippet.name || '',
      category: snippet.category || '',
      content: snippet.content || '',
      favorite: !!snippet.favorite,
      snippet,
    };
  }

  function rebuildMenuTokens() {
    const pinnedIds = new Set(pinnedPersTokens.map((t) => String(t._id)));
    const persItems = menuPersTokens
      .map((token) => {
        if (typeof window.gemToPersMenuItem === 'function') {
          return window.gemToPersMenuItem(token, pinnedIds);
        }
        return null;
      })
      .filter(Boolean);
    const gemmaItems = menuSnippets.map(gemmaToMenuItem);
    menuTokens = [...gemmaItems, ...persItems];
  }

  function getTokenRowKey(item) {
    if (!item) return '';
    if (item.kind === 'personalization') {
      return typeof window.gemPersPrefixedId === 'function'
        ? window.gemPersPrefixedId(item.id)
        : `p:${item.id}`;
    }
    return typeof window.gemGemmaPrefixedId === 'function'
      ? window.gemGemmaPrefixedId(item.id)
      : `g:${item.id}`;
  }

  function resolveMenuTokenByRowKey(rowKey) {
    return menuTokens.find((item) => getTokenRowKey(item) === rowKey) || null;
  }

  function resolveMenuToken(rowKey) {
    return resolveMenuTokenByRowKey(rowKey) || resolveRecentToken(rowKey);
  }

  function isTokenPinned(item) {
    if (!item) return false;
    return item.kind === 'personalization' ? !!item.pinned : !!item.favorite;
  }

  function getDesktopPreviewIframe() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    if (!iframe) return null;
    if (iframe.classList.contains('iframe-duplicate')) return null;
    if (iframe.closest('.gem-iframe-wrapper')) return null;
    return iframe;
  }

  function resolveCodeMirrorFromTarget(target) {
    if (!target || !target.closest) return null;
    const cmEl = target.closest('.CodeMirror');
    if (!cmEl) return null;
    const editableHit =
      target.closest('.CodeMirror-code') ||
      target.closest('.CodeMirror-lines') ||
      (target.tagName === 'TEXTAREA' && target.closest('.CodeMirror') === cmEl);
    if (!editableHit) return null;
    const cmInstance = cmEl.CodeMirror || null;
    return { cmEl, cmInstance };
  }

  function resolveEditableTarget(target, eventDoc, point = null) {
    if (!target || !target.closest) return null;

    const tag = (target.tagName || '').toLowerCase();

    if (tag === 'textarea') {
      const cmWrap = target.closest('.CodeMirror');
      if (cmWrap) {
        const cm = resolveCodeMirrorFromTarget(target);
        if (!cm) return null;
        return captureCodeMirrorContext(cm.cmEl, cm.cmInstance, point);
      }
      return captureTextControlContext(target);
    }

    if (tag === 'input') {
      const type = (target.getAttribute('type') || 'text').toLowerCase();
      if (type !== 'text' && type !== 'search' && type !== 'url' && type !== 'email') {
        return null;
      }
      return captureTextControlContext(target);
    }

    const cm = resolveCodeMirrorFromTarget(target);
    if (cm) {
      return captureCodeMirrorContext(cm.cmEl, cm.cmInstance, point);
    }

    const editable = target.closest('[contenteditable="true"]');
    if (editable && eventDoc) {
      const iframe = getDesktopPreviewIframe();
      if (!iframe) return null;
      let iframeDoc = null;
      try {
        iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      } catch (_) {
        return null;
      }
      if (iframeDoc !== eventDoc) return null;
      return captureContentEditableContext(editable, iframeDoc, point);
    }

    return null;
  }

  function captureTextControlContext(el) {
    return {
      type: el.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'input',
      element: el,
      doc: el.ownerDocument,
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd,
    };
  }

  function isPersonalizableCodeMirror(cmEl) {
    const host = cmEl?.closest?.('cb-personalizable-input-with-context, cb-personalizable-input');
    if (!host) return false;
    const codeEditor = cmEl.closest('vce-code-editor');
    return !!(codeEditor && codeEditor.querySelector('pe-code-editor-token-plugin'));
  }

  function supportsInsertMode(ctx) {
    if (!ctx) return false;
    if (ctx.type === 'contenteditable') return true;
    return ctx.type === 'codemirror' && !!ctx.personalizable;
  }

  function normalizeCodeMirrorPos(pos) {
    if (!pos || typeof pos.line !== 'number' || typeof pos.ch !== 'number') return null;
    return { line: pos.line, ch: pos.ch };
  }

  function captureCodeMirrorContext(cmEl, cmInstance, point) {
    const vceCm = cmEl?.closest?.('vce-codemirror') || null;
    const resolvedInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null) ||
      cmInstance ||
      cmEl?.CodeMirror ||
      null;
    const ctx = {
      type: 'codemirror',
      cmEl,
      cmInstance: resolvedInstance,
      doc: cmEl.ownerDocument,
      personalizable: isPersonalizableCodeMirror(cmEl),
    };

    if (point && typeof point.clientX === 'number' && typeof point.clientY === 'number') {
      ctx.cmClickPoint = { clientX: point.clientX, clientY: point.clientY };
    }

    if (
      resolvedInstance &&
      point &&
      typeof point.clientX === 'number' &&
      typeof point.clientY === 'number'
    ) {
      try {
        const pos = resolvedInstance.coordsChar({
          left: point.clientX,
          top: point.clientY,
        });
        const normalized = normalizeCodeMirrorPos(pos);
        if (normalized) {
          ctx.cmFrom = normalized;
          ctx.cmTo = normalized;
        }
      } catch (_) {}
    }

    if (resolvedInstance && !ctx.cmFrom) {
      try {
        ctx.cmFrom = normalizeCodeMirrorPos(resolvedInstance.getCursor('from'));
        ctx.cmTo = normalizeCodeMirrorPos(resolvedInstance.getCursor('to')) || ctx.cmFrom;
      } catch (_) {}
    }

    if (resolvedInstance && ctx.cmFrom && typeof resolvedInstance.indexFromPos === 'function') {
      try {
        ctx.selectionStart = resolvedInstance.indexFromPos(ctx.cmFrom);
        ctx.selectionEnd = resolvedInstance.indexFromPos(ctx.cmTo || ctx.cmFrom);
      } catch (_) {}
    }

    if (typeof ctx.selectionStart !== 'number' || typeof ctx.selectionEnd !== 'number') {
      const textarea = cmEl.querySelector('textarea');
      if (textarea) {
        ctx.selectionStart = textarea.selectionStart;
        ctx.selectionEnd = textarea.selectionEnd;
      }
    }

    return ctx;
  }

  function findTinyMCEEditor(doc, element) {
    if (typeof window.gemFindTinyMCEEditorForElement === 'function') {
      return window.gemFindTinyMCEEditorForElement(doc, element);
    }
    return null;
  }

  function cloneNativeRange(range) {
    if (!range) return null;
    try {
      return range.cloneRange();
    } catch (_) {
      return range;
    }
  }

  function rangeFromPoint(doc, x, y) {
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

  function findTinyMCEEditorById(doc, editorId) {
    if (!doc || !editorId) return null;
    try {
      const tm = doc.defaultView && (doc.defaultView.tinymce || doc.defaultView.tinyMCE);
      if (!tm || !Array.isArray(tm.editors)) return null;
      return tm.editors.find((ed) => ed && ed.id === editorId) || null;
    } catch (_) {
      return null;
    }
  }

  function rememberCaretState(element, state) {
    if (!element || !state) return;
    caretTrackByElement.set(element, state);
    try {
      let parent = element.parentElement;
      while (parent) {
        if (parent.getAttribute && parent.getAttribute('contenteditable') === 'true') {
          caretTrackByElement.set(parent, state);
        }
        parent = parent.parentElement;
      }
    } catch (_) {}
  }

  function saveCaretFromEditor(editor) {
    if (!editor || !editor.initialized) return;
    const body = editor.getBody && editor.getBody();
    const editorDoc = editor.getDoc && editor.getDoc();
    if (!body || !editorDoc) return;

    const state = {
      at: Date.now(),
      editorId: editor.id,
      body,
    };

    try {
      const sel = editorDoc.getSelection && editorDoc.getSelection();
      if (sel && sel.rangeCount > 0) {
        state.savedRange = sel.getRangeAt(0).cloneRange();
      }
    } catch (_) {}

    if (editor.selection) {
      try {
        if (typeof editor.selection.getRng === 'function') {
          const tmRng = editor.selection.getRng();
          if (tmRng) {
            state.tinymceRange = cloneNativeRange(tmRng);
            if (!state.savedRange) {
              state.savedRange = cloneNativeRange(tmRng);
            }
          }
        }
        if (typeof editor.selection.getBookmark === 'function') {
          state.tinymceBookmark = editor.selection.getBookmark(2, true);
        }
      } catch (_) {}
    }

    if (!state.savedRange && !state.tinymceBookmark) return;

    caretByEditorId.set(editor.id, state);
    rememberCaretState(body, state);
  }

  function patchTinyMCEEditor(editor) {
    if (!editor || !editor.id || patchedEditorIds.has(editor.id)) return;

    const attach = () => {
      if (!editor.initialized) return;
      const body = editor.getBody && editor.getBody();
      if (!body) return;

      patchedEditorIds.add(editor.id);
      const save = () => saveCaretFromEditor(editor);

      body.addEventListener('keyup', save, false);
      body.addEventListener('mouseup', save, false);
      body.addEventListener('input', save, false);
      body.addEventListener('focus', save, false);

      if (typeof editor.on === 'function') {
        editor.on('keyup', save);
        editor.on('mouseup', save);
        editor.on('NodeChange', save);
        editor.on('SetContent', save);
      }

      save();
    };

    if (editor.initialized) {
      attach();
    } else if (typeof editor.on === 'function') {
      editor.on('init', attach);
    }
  }

  function isIframeDocument(doc) {
    try {
      return !!(doc && doc.defaultView && doc.defaultView !== window);
    } catch (_) {
      return false;
    }
  }

  function injectIframeBridge(doc) {
    if (!doc || doc._gemSnippetBridgeInjected) return;
    doc._gemSnippetBridgeInjected = true;
    try {
      if (doc.getElementById(IFRAME_BRIDGE_SCRIPT_ID)) return;
      const script = doc.createElement('script');
      script.id = IFRAME_BRIDGE_SCRIPT_ID;
      script.src = chrome.runtime.getURL('gem-snippet-iframe-bridge.js');
      script.async = false;
      (doc.documentElement || doc.head || doc.body).appendChild(script);
    } catch (_) {}
  }

  function syncTinyMCEEditors(doc) {
    if (!doc) return;
    try {
      const tm = doc.defaultView && (doc.defaultView.tinymce || doc.defaultView.tinyMCE);
      if (!tm || !Array.isArray(tm.editors)) return;
      tm.editors.forEach((editor) => patchTinyMCEEditor(editor));
    } catch (_) {}
  }

  function saveCaretForElement(element, doc) {
    if (!element || !doc) return;
    const editor = findTinyMCEEditor(doc, element);
    if (editor) {
      saveCaretFromEditor(editor);
      return;
    }

    const state = { at: Date.now() };
    const selection = doc.getSelection && doc.getSelection();
    if (selection && selection.rangeCount > 0) {
      try {
        state.savedRange = selection.getRangeAt(0).cloneRange();
      } catch (_) {}
    }
    if (state.savedRange) {
      rememberCaretState(element, state);
    }
  }

  function setupCaretTracking(doc) {
    if (!doc || doc._gemSnippetCtxCaretBound) return;
    doc._gemSnippetCtxCaretBound = true;

    const saveFromEvent = (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      const el = target.closest('[contenteditable="true"]');
      if (!el) return;
      saveCaretForElement(el, doc);
    };

    doc.addEventListener('keyup', saveFromEvent, false);
    doc.addEventListener('mouseup', saveFromEvent, false);
    doc.addEventListener('focusin', saveFromEvent, false);
    doc.addEventListener('input', saveFromEvent, false);

    let selectionChangeTimer = null;
    doc.addEventListener('selectionchange', () => {
      if (selectionChangeTimer) {
        clearTimeout(selectionChangeTimer);
      }
      selectionChangeTimer = setTimeout(() => {
        selectionChangeTimer = null;
        const active = doc.activeElement;
        const el =
          active && active.closest
            ? active.closest('[contenteditable="true"]')
            : null;
        if (el) {
          saveCaretForElement(el, doc);
        }
      }, 0);
    });

    syncTinyMCEEditors(doc);
  }

  function isRangeInsideElement(range, element) {
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

  function captureContentEditableContext(element, doc, point = null) {
    syncTinyMCEEditors(doc);
    const editor = findTinyMCEEditor(doc, element);
    const editorCaret = editor && editor.id ? caretByEditorId.get(editor.id) : null;
    const tracked = caretTrackByElement.get(element) || null;

    let tinymceBookmark = null;
    let savedRange = null;
    let tinymceEditorId = editor && editor.id ? editor.id : null;

    const selection = doc.getSelection && doc.getSelection();
    if (selection && selection.rangeCount > 0) {
      try {
        const selectionRange = selection.getRangeAt(0);
        if (isNonCollapsedRange(selectionRange) && isRangeInsideElement(selectionRange, element)) {
          savedRange = selectionRange.cloneRange();
          if (editor && editor.selection && typeof editor.selection.getBookmark === 'function') {
            try {
              tinymceBookmark = editor.selection.getBookmark(2, true);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    if (!savedRange && point && typeof point.clientX === 'number' && typeof point.clientY === 'number') {
      savedRange = rangeFromPoint(doc, point.clientX, point.clientY);
      if (savedRange && !isRangeInsideElement(savedRange, element)) {
        savedRange = null;
      }
    }

    if (!savedRange && editorCaret?.savedRange && isRangeInsideElement(editorCaret.savedRange, element)) {
      savedRange = cloneNativeRange(editorCaret.savedRange);
      tinymceBookmark = editorCaret.tinymceBookmark || null;
      tinymceEditorId = editorCaret.editorId || tinymceEditorId;
    } else if (!savedRange && editorCaret?.tinymceRange && isRangeInsideElement(editorCaret.tinymceRange, element)) {
      savedRange = cloneNativeRange(editorCaret.tinymceRange);
      tinymceBookmark = editorCaret.tinymceBookmark || null;
      tinymceEditorId = editorCaret.editorId || tinymceEditorId;
    } else if (!savedRange && tracked?.savedRange && isRangeInsideElement(tracked.savedRange, element)) {
      savedRange = cloneNativeRange(tracked.savedRange);
      tinymceBookmark = tracked.tinymceBookmark || null;
      tinymceEditorId = tracked.editorId || tinymceEditorId;
    } else if (!savedRange && tracked?.tinymceRange && isRangeInsideElement(tracked.tinymceRange, element)) {
      savedRange = cloneNativeRange(tracked.tinymceRange);
      tinymceBookmark = tracked.tinymceBookmark || null;
      tinymceEditorId = tracked.editorId || tinymceEditorId;
    }

    if (!savedRange && editor && editor.selection) {
      try {
        const tmRng = typeof editor.selection.getRng === 'function' ? editor.selection.getRng() : null;
        if (tmRng && isRangeInsideElement(tmRng, element)) {
          savedRange = cloneNativeRange(tmRng);
        }
        if (!tinymceBookmark && typeof editor.selection.getBookmark === 'function') {
          tinymceBookmark = editor.selection.getBookmark(2, true);
        }
      } catch (_) {}
    }

    if (!savedRange) {
      const selection = doc.getSelection && doc.getSelection();
      if (selection && selection.rangeCount > 0) {
        try {
          const contextRange = selection.getRangeAt(0);
          if (isRangeInsideElement(contextRange, element)) {
            savedRange = contextRange.cloneRange();
          }
        } catch (_) {}
      }
      if (!tinymceBookmark && editor && editor.selection && typeof editor.selection.getBookmark === 'function') {
        try {
          tinymceBookmark = editor.selection.getBookmark(2, true);
        } catch (_) {}
      }
    }

    if (!savedRange) {
      try {
        savedRange = doc.createRange();
        savedRange.selectNodeContents(element);
        savedRange.collapse(false);
      } catch (_) {
        return null;
      }
    }

    if (isIframeDocument(doc)) {
      injectIframeBridge(doc);
    }

    return {
      type: 'contenteditable',
      element,
      doc,
      savedRange,
      tinymceBookmark,
      tinymceEditorId,
      caretPoint:
        point && typeof point.clientX === 'number' && typeof point.clientY === 'number'
          ? { x: point.clientX, y: point.clientY }
          : null,
    };
  }

  function restoreSelectionForClipboard(ctx) {
    if (!ctx) return;
    if (ctx.type === 'contenteditable' && ctx.savedRange && ctx.doc) {
      const sel = ctx.doc.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(ctx.savedRange);
      }
      try {
        ctx.element.focus();
      } catch (_) {}
    } else if ((ctx.type === 'textarea' || ctx.type === 'input') && ctx.element) {
      try {
        ctx.element.focus();
        ctx.element.selectionStart = ctx.selectionStart;
        ctx.element.selectionEnd = ctx.selectionEnd;
      } catch (_) {}
    } else if (ctx.type === 'codemirror' && ctx.cmEl) {
      const vceCm = ctx.cmEl.closest('vce-codemirror');
      const cmInstance =
        (typeof window.gemResolveCodeMirrorInstance === 'function'
          ? window.gemResolveCodeMirrorInstance(ctx.cmEl, vceCm, ctx)
          : ctx.cmInstance) || ctx.cmInstance;
      try {
        cmInstance?.focus?.();
        if (cmInstance && ctx.cmFrom && ctx.cmTo) {
          const from = normalizeCodeMirrorPos(ctx.cmFrom);
          const to = normalizeCodeMirrorPos(ctx.cmTo) || from;
          if (from && to) cmInstance.setSelection(from, to);
        }
      } catch (_) {}
      const textarea = ctx.cmEl.querySelector('textarea');
      if (textarea) {
        try {
          textarea.focus({ preventScroll: true });
          if (typeof ctx.selectionStart === 'number' && typeof ctx.selectionEnd === 'number') {
            const hasExplicitSelection =
              ctx.selectionStart > 0 ||
              ctx.selectionEnd > 0 ||
              ctx.selectionStart !== ctx.selectionEnd;
            if (hasExplicitSelection) {
              textarea.selectionStart = ctx.selectionStart;
              textarea.selectionEnd = ctx.selectionEnd;
            }
          }
        } catch (_) {}
      }
    }
  }

  function runClipboardCommand(ctx, command) {
    restoreSelectionForClipboard(ctx);
    const doc = ctx.doc || document;

    if (command === 'selectAll' && ctx.type === 'codemirror' && ctx.cmInstance) {
      try {
        if (typeof ctx.cmInstance.execCommand === 'function') {
          ctx.cmInstance.execCommand('selectAll');
        }
      } catch (_) {}
      return;
    }

    try {
      if (command === 'paste' && navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then((text) => {
          if (ctx.type === 'contenteditable' && ctx.savedRange && ctx.doc) {
            insertPlainViaRange(ctx, text);
          } else if (ctx.type === 'textarea' || ctx.type === 'input') {
            replaceTextControlSelection(ctx.element, text, ctx.selectionStart, ctx.selectionEnd);
          } else if (ctx.type === 'codemirror') {
            window.gemInsertSnippetIntoTarget(ctx, { content: text, name: text }, { mode: 'plain' });
          }
        }).catch(() => {
          doc.execCommand('paste');
        });
        return;
      }
      doc.execCommand(command);
    } catch (e) {
      console.warn('[Gem] Clipboard command failed:', command, e);
    }
  }

  function insertPlainViaRange(ctx, text) {
    if (!ctx.savedRange || !ctx.doc) return;
    try {
      const range = ctx.savedRange;
      range.deleteContents();
      range.insertNode(ctx.doc.createTextNode(String(text ?? '')));
      const sel = ctx.doc.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      ctx.element.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
  }

  function replaceTextControlSelection(el, text, start, end) {
    const s = typeof start === 'number' ? start : el.selectionStart;
    const e = typeof end === 'number' ? end : el.selectionEnd;
    const val = String(el.value ?? '');
    el.value = val.slice(0, s) + String(text ?? '') + val.slice(e);
    const pos = s + String(text ?? '').length;
    el.selectionStart = pos;
    el.selectionEnd = pos;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.id = MENU_ID;
    menuEl.className = 'gem-snippet-context-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = `
      <div class="gem-snippet-ctx-section gem-snippet-ctx-clipboard"></div>
      <div class="gem-snippet-ctx-section">
        <div class="gem-snippet-ctx-search-wrap">
          <input type="search" class="gem-snippet-ctx-search" placeholder="Search tokens" aria-label="Search tokens" />
        </div>
      </div>
      <div class="gem-snippet-ctx-list gem-scrollable"></div>
      <div class="gem-snippet-ctx-section gem-snippet-ctx-insert-as-wrap" hidden>
        <div class="gem-snippet-ctx-insert-as">
          <span class="gem-snippet-ctx-insert-as-label">Insert as:</span>
          <div class="gem-snippet-ctx-insert-as-toggle">
            <button type="button" class="gem-snippet-ctx-mode-btn gem-snippet-ctx-mode-btn--active" data-mode="token">Token</button>
            <button type="button" class="gem-snippet-ctx-mode-btn" data-mode="plain">Plain text</button>
          </div>
        </div>
      </div>
    `;

    menuEl.querySelector('.gem-snippet-ctx-search').addEventListener('input', () => {
      renderMenuLists();
    });

    menuEl.querySelectorAll('.gem-snippet-ctx-mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertMode = btn.dataset.mode === 'plain' ? 'plain' : 'token';
        menuEl.querySelectorAll('.gem-snippet-ctx-mode-btn').forEach((b) => {
          b.classList.toggle('gem-snippet-ctx-mode-btn--active', b === btn);
        });
      });
    });

    document.body.appendChild(menuEl);
    return menuEl;
  }

  function collectDismissDocs() {
    const docs = [document];
    try {
      document.querySelectorAll('iframe').forEach((iframe) => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc && !docs.includes(iframeDoc)) {
            docs.push(iframeDoc);
          }
        } catch (_) {}
      });
    } catch (_) {}
    return docs;
  }

  function detachOutsideDismiss() {
    if (!outsideDismissHandler) return;
    outsideDismissDocs.forEach((doc) => {
      doc.removeEventListener('mousedown', outsideDismissHandler, true);
      doc.removeEventListener('contextmenu', outsideDismissHandler, true);
    });
    outsideDismissDocs = [];
    outsideDismissHandler = null;
  }

  function attachOutsideDismiss() {
    detachOutsideDismiss();
    outsideDismissHandler = (e) => {
      if (!menuOpen || !menuEl) return;
      if (menuEl.contains(e.target)) return;
      closeMenu();
    };
    outsideDismissDocs = collectDismissDocs();
    setTimeout(() => {
      if (!outsideDismissHandler) return;
      outsideDismissDocs.forEach((doc) => {
        doc.addEventListener('mousedown', outsideDismissHandler, true);
        doc.addEventListener('contextmenu', outsideDismissHandler, true);
      });
    }, 0);
  }

  function closeMenu() {
    if (!menuEl) return;
    menuOpen = false;
    menuEl.classList.remove('gem-snippet-context-menu--open');
    activeCtx = null;
    menuPlacement = null;
    detachMenuResizeObserver();
    if (typeof escapeUnsub === 'function') {
      escapeUnsub();
      escapeUnsub = null;
    }
    detachOutsideDismiss();
    if (typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(menuEl);
    }
  }

  function resolveMenuPlacement(x, y, menuW, menuH) {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fitsBelow = y + menuH <= vh - pad;
    const fitsAbove = y - menuH >= pad;
    let vertical = 'below';
    if (!fitsBelow && fitsAbove) {
      vertical = 'above';
    } else if (!fitsBelow && !fitsAbove) {
      const roomBelow = vh - pad - y;
      const roomAbove = y - pad;
      vertical = roomBelow >= roomAbove ? 'below' : 'above';
    }

    const fitsRight = x + menuW <= vw - pad;
    const fitsLeftAlign = x - menuW >= pad;
    let horizontal = 'left';
    if (!fitsRight && fitsLeftAlign) {
      horizontal = 'right';
    }

    return { vertical, horizontal };
  }

  function positionMenu(x, y, { resetPlacement = false } = {}) {
    if (!menuEl) return;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = menuEl.getBoundingClientRect();
    const menuW = rect.width;
    const menuH = rect.height;

    if (resetPlacement || !menuPlacement) {
      menuPlacement = resolveMenuPlacement(x, y, menuW, menuH);
    }

    let left = menuPlacement.horizontal === 'left' ? x : x - menuW;
    let top = menuPlacement.vertical === 'below' ? y : y - menuH;

    if (left < pad) {
      left = pad;
    }
    if (left + menuW > vw - pad) {
      left = Math.max(pad, vw - menuW - pad);
    }
    if (top < pad) {
      top = pad;
    }
    if (top + menuH > vh - pad) {
      top = Math.max(pad, vh - menuH - pad);
    }

    menuEl.style.left = `${Math.round(left)}px`;
    menuEl.style.top = `${Math.round(top)}px`;
  }

  function scheduleMenuPosition(options = {}) {
    if (!menuOpen || !menuEl) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (menuOpen && menuEl) {
          positionMenu(menuAnchor.x, menuAnchor.y, options);
        }
      });
    });
  }

  function attachMenuResizeObserver() {
    detachMenuResizeObserver();
    if (!menuEl || typeof ResizeObserver === 'undefined') return;
    menuResizeObserver = new ResizeObserver(() => {
      scheduleMenuPosition();
    });
    menuResizeObserver.observe(menuEl);
  }

  function detachMenuResizeObserver() {
    if (menuResizeObserver) {
      menuResizeObserver.disconnect();
      menuResizeObserver = null;
    }
  }

  function renderClipboardSection() {
    const section = menuEl.querySelector('.gem-snippet-ctx-clipboard');
    const items = [
      ['cut', 'Cut'],
      ['copy', 'Copy'],
      ['paste', 'Paste'],
      ['selectAll', 'Select All'],
    ];
    section.innerHTML = items
      .map(
        ([cmd, label]) =>
          `<button type="button" class="gem-snippet-ctx-clipboard-item" data-cmd="${cmd}">${label}</button>`
      )
      .join('');
    section.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ctx = activeCtx;
        runClipboardCommand(ctx, btn.dataset.cmd);
        closeMenu();
      });
    });
  }

  function tokenMatchesQuery(item, q) {
    if (!q || !item) return false;
    const hay =
      item.kind === 'gemma'
        ? `${item.name || ''} ${item.category || ''}`.toLowerCase()
        : String(item.name || '').toLowerCase();
    return hay.includes(q);
  }

  function sortByName(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base',
    });
  }

  function renderTokenRow(item, options = {}) {
    const rowKey = getTokenRowKey(item);
    const isPinned = isTokenPinned(item);
    const pinLabel = isPinned ? 'Unpin token' : 'Pin token';
    const rowClass = options.searchResult ? ' gem-snippet-ctx-row--search' : '';
    const typeIcon =
      item.kind === 'personalization'
        ? item.persOrigin === 'predefined'
          ? PREDEFINED_PERS_TYPE_SVG
          : CUSTOM_PERS_TYPE_SVG
        : GEMMA_TYPE_SVG;
    const kind = item.kind === 'personalization' ? 'personalization' : 'gemma';
    return `
      <div class="gem-snippet-ctx-row${rowClass}" data-token-key="${escapeHtml(rowKey)}" data-token-kind="${kind}">
        <button type="button" class="gem-snippet-ctx-item" data-action="insert">
          <span class="gem-snippet-ctx-row-name">
            <span class="gem-snippet-ctx-type-icon">${typeIcon}</span>
            <span class="gem-snippet-ctx-row-label">${escapeHtml(item.name || 'Untitled')}</span>
          </span>
        </button>
        <button type="button" class="gem-snippet-ctx-pin${isPinned ? ' gem-snippet-ctx-pin--active' : ''}" data-action="pin" aria-label="${pinLabel}" title="${pinLabel}">
          ${PIN_SVG}
        </button>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveRecentToken(entryId) {
    const parsed =
      typeof window.gemParseRecentEntryId === 'function'
        ? window.gemParseRecentEntryId(entryId)
        : { kind: 'gemma', id: entryId };
    if (!parsed || !parsed.id) return null;

    if (parsed.kind === 'personalization') {
      const fromSession = menuPersTokens.find((t) => String(t._id) === parsed.id);
      if (fromSession) {
        const pinnedIds = new Set(pinnedPersTokens.map((t) => String(t._id)));
        return typeof window.gemToPersMenuItem === 'function'
          ? window.gemToPersMenuItem(fromSession, pinnedIds)
          : null;
      }
      const fromPinned = pinnedPersTokens.find((t) => String(t._id) === parsed.id);
      if (fromPinned) {
        const pinnedIds = new Set(pinnedPersTokens.map((t) => String(t._id)));
        return typeof window.gemToPersMenuItem === 'function'
          ? window.gemToPersMenuItem(fromPinned, pinnedIds)
          : null;
      }
      const cached = recentPersCache[parsed.id];
      if (cached) {
        const pinnedIds = new Set(pinnedPersTokens.map((t) => String(t._id)));
        return typeof window.gemToPersMenuItem === 'function'
          ? window.gemToPersMenuItem(cached, pinnedIds)
          : null;
      }
      return null;
    }

    const snippet = menuSnippets.find((s) => String(s.id) === parsed.id);
    return snippet ? gemmaToMenuItem(snippet) : null;
  }

  function renderMenuLists() {
    const listEl = menuEl.querySelector('.gem-snippet-ctx-list');
    const q = (menuEl.querySelector('.gem-snippet-ctx-search').value || '').trim().toLowerCase();
    rebuildMenuTokens();

    let html = '';

    if (persTokensLoading && !q) {
      html += `<div class="gem-snippet-ctx-empty">Loading personalization tokens…</div>`;
    }

    if (q) {
      const matches = menuTokens.filter((item) => tokenMatchesQuery(item, q)).sort(sortByName);
      const capped = matches.slice(0, MAX_SEARCH_RESULTS);
      if (!capped.length) {
        html += `<div class="gem-snippet-ctx-empty">No tokens match your search.</div>`;
      } else {
        html += `<div class="gem-snippet-ctx-section-title">Results</div>`;
        html += capped.map((item) => renderTokenRow(item, { searchResult: true })).join('');
        if (matches.length > MAX_SEARCH_RESULTS) {
          html += `<div class="gem-snippet-ctx-empty">Showing ${MAX_SEARCH_RESULTS} of ${matches.length} matches. Refine your search.</div>`;
        }
      }
    } else if (!persTokensLoading || menuTokens.length) {
      const pinnedGemma = menuTokens.filter((item) => item.kind === 'gemma' && item.favorite);
      const pinnedPers = pinnedPersTokens
        .map((token) => {
          const pinnedIds = new Set(pinnedPersTokens.map((t) => String(t._id)));
          return typeof window.gemToPersMenuItem === 'function'
            ? window.gemToPersMenuItem(token, pinnedIds)
            : null;
        })
        .filter(Boolean);
      const pinned = [...pinnedGemma, ...pinnedPers].sort(sortByName);
      const pinnedKeys = new Set(pinned.map((item) => getTokenRowKey(item)));

      const recent = recentIds
        .map((entryId) => resolveRecentToken(entryId))
        .filter(Boolean)
        .filter((item) => !pinnedKeys.has(getTokenRowKey(item)));

      if (pinned.length) {
        html += `<div class="gem-snippet-ctx-section-title">Pinned Tokens</div>`;
        html += pinned.map((item) => renderTokenRow(item)).join('');
      }
      if (recent.length) {
        html += `<div class="gem-snippet-ctx-section-title">Recent Tokens</div>`;
        html += recent.map((item) => renderTokenRow(item)).join('');
      }
      if (!pinned.length && !recent.length && !persTokensLoading) {
        html += `<div class="gem-snippet-ctx-empty">Pin tokens or search to insert.</div>`;
      }
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.gem-snippet-ctx-row').forEach((row) => {
      const rowKey = row.getAttribute('data-token-key');
      const item = resolveMenuToken(rowKey);
      if (!item) return;

      row.querySelector('[data-action="insert"]').addEventListener('click', (e) => {
        e.stopPropagation();
        insertMenuToken(item);
      });

      row.querySelector('[data-action="pin"]').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTokenPin(item);
      });
    });

    scheduleMenuPosition();
  }

  function toggleTokenPin(item) {
    if (!item) return;
    if (item.kind === 'personalization') {
      if (typeof window.gemTogglePersTokenPinned !== 'function') return;
      window.gemTogglePersTokenPinned(item.token, (nextPinned) => {
        pinnedPersTokens = Array.isArray(nextPinned) ? nextPinned : [];
        rebuildMenuTokens();
        renderMenuLists();
      });
      return;
    }

    if (typeof window.getSnippets !== 'function' || typeof window.gemSaveSnippets !== 'function') {
      return;
    }
    window.getSnippets((snippets) => {
      const updated = snippets.map((s) =>
        String(s.id) === String(item.id) ? { ...s, favorite: !s.favorite } : s
      );
      window.gemSaveSnippets(updated, () => {
        menuSnippets = updated;
        rebuildMenuTokens();
        document.dispatchEvent(new CustomEvent('gem-snippets-changed', { bubbles: true }));
        renderMenuLists();
      });
    });
  }

  async function insertMenuToken(item) {
    const ctx = activeCtx;
    if (!ctx || !item) {
      closeMenu();
      return;
    }
    restoreSelectionForClipboard(ctx);
    const mode = supportsInsertMode(ctx) ? insertMode : 'plain';
    let insertItem = item;
    if (item.kind === 'personalization') {
      let enriched = item.token;
      if (typeof window.gemMergePersTokenWithSources === 'function') {
        enriched = window.gemMergePersTokenWithSources(item.token, [
          recentPersCache,
          pinnedPersTokens,
        ]);
      } else if (typeof window.gemEnrichPersTokenWithRdsPresets === 'function') {
        enriched = window.gemEnrichPersTokenWithRdsPresets(item.token);
      }
      if (enriched) {
        insertItem = {
          ...item,
          token: enriched,
          content: window.gemBuildPersonalizationPreview?.(enriched) || '',
        };
      }
    }
    let ok = false;
    if (typeof window.gemInsertSnippetIntoTarget === 'function') {
      ok = await window.gemInsertSnippetIntoTarget(ctx, insertItem, { mode });
    }
    if (ok) {
      pushRecentTokenId(getTokenRowKey(item));
      if (item.kind === 'personalization' && typeof window.gemCacheRecentPersToken === 'function') {
        window.gemCacheRecentPersToken(insertItem.token || item.token);
      }
    } else if (window.gemShowToast) {
      const msg =
        item.kind === 'personalization'
          ? 'Could not insert personalization token.'
          : 'Could not insert snippet.';
      window.gemShowToast(msg, { type: 'warn', durationMs: 2200 });
    }
    closeMenu();
  }

  function loadMenuData(callback) {
    const maybeRender = () => {
      rebuildMenuTokens();
      renderMenuLists();
    };

    const finish = () => {
      rebuildMenuTokens();
      if (callback) callback();
      else renderMenuLists();
    };

    const loadPers = () => {
      if (typeof window.gemEnsurePersonalizationTokensLoaded !== 'function') {
        finish();
        return;
      }
      persTokensLoading = true;
      maybeRender();
      window.gemEnsurePersonalizationTokensLoaded().then((tokens) => {
        menuPersTokens = (Array.isArray(tokens) ? tokens : []).map((token) => {
          if (typeof window.gemMergePersTokenWithSources === 'function') {
            return window.gemMergePersTokenWithSources(token, [
              recentPersCache,
              pinnedPersTokens,
            ]);
          }
          return token;
        }).filter(Boolean);
        persTokensLoading = false;
        finish();
      });
    };

    const loadPinnedAndCache = () => {
      let pending = 2;
      const done = () => {
        pending -= 1;
        if (pending <= 0) {
          maybeRender();
          loadPers();
        }
      };
      if (typeof window.gemLoadPinnedPersTokens === 'function') {
        window.gemLoadPinnedPersTokens((pinned) => {
          pinnedPersTokens = Array.isArray(pinned) ? pinned : [];
          done();
        });
      } else {
        done();
      }
      if (typeof window.gemLoadRecentPersTokenCache === 'function') {
        window.gemLoadRecentPersTokenCache((cache) => {
          recentPersCache = cache && typeof cache === 'object' ? cache : {};
          done();
        });
      } else {
        done();
      }
    };

    loadRecentIds(() => {
      if (typeof window.getSnippets !== 'function') {
        menuSnippets = [];
        loadPinnedAndCache();
        return;
      }
      window.getSnippets((snippets) => {
        menuSnippets = Array.isArray(snippets) ? snippets : [];
        loadPinnedAndCache();
      });
    });
  }

  function openMenu(x, y, ctx) {
    ensureMenu();
    activeCtx = ctx;
    insertMode = 'token';
    menuAnchor = { x, y };
    menuPlacement = null;

    const insertAsWrap = menuEl.querySelector('.gem-snippet-ctx-insert-as-wrap');
    if (insertAsWrap) {
      insertAsWrap.hidden = !supportsInsertMode(ctx);
    }
    menuEl.querySelectorAll('.gem-snippet-ctx-mode-btn').forEach((btn) => {
      btn.classList.toggle('gem-snippet-ctx-mode-btn--active', btn.dataset.mode === 'token');
    });
    menuEl.querySelector('.gem-snippet-ctx-search').value = '';

    renderClipboardSection();

    loadMenuData(() => {
      renderMenuLists();
    });

    menuEl.classList.add('gem-snippet-context-menu--open');
    menuOpen = true;

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(menuEl, { tier: 'modal' });
    }

    attachMenuResizeObserver();
    scheduleMenuPosition({ resetPlacement: true });

    requestAnimationFrame(() => {
      const search = menuEl.querySelector('.gem-snippet-ctx-search');
      if (search) search.focus();
    });

    if (typeof window.gemLayerBindEscape === 'function') {
      escapeUnsub = window.gemLayerBindEscape(closeMenu, {
        whileConnected: () => menuOpen,
      });
    }

    attachOutsideDismiss();
  }

  function onContextMenu(event) {
    if (!isCampaignPage()) return;
    if (event.metaKey || event.ctrlKey) return;
    if (!menuEnabled) return;
    if (menuOpen && menuEl && menuEl.contains(event.target)) return;

    const eventDoc = event.target && event.target.ownerDocument ? event.target.ownerDocument : document;
    const editableTarget =
      event.target && event.target.closest
        ? event.target.closest('[contenteditable="true"]')
        : null;
    if (editableTarget && eventDoc) {
      syncTinyMCEEditors(eventDoc);
      saveCaretForElement(editableTarget, eventDoc);
    }
    const ctx = resolveEditableTarget(event.target, eventDoc, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (!ctx) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    if (menuOpen) closeMenu();

    let clientX = event.clientX;
    let clientY = event.clientY;
    if (eventDoc !== document) {
      const iframe = getDesktopPreviewIframe();
      if (iframe) {
        const rect = iframe.getBoundingClientRect();
        clientX += rect.left;
        clientY += rect.top;
      }
    }
    openMenu(clientX, clientY, ctx);
  }

  function bindContextMenuToDoc(doc) {
    if (!doc || boundDocs.has(doc)) return;
    doc.addEventListener('contextmenu', onContextMenu, true);
    setupCaretTracking(doc);
    if (isIframeDocument(doc)) {
      injectIframeBridge(doc);
    } else {
      syncTinyMCEEditors(doc);
    }
    boundDocs.add(doc);
  }

  function bindPreviewIframe() {
    const iframe = getDesktopPreviewIframe();
    if (!iframe) return;
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        bindContextMenuToDoc(iframeDoc);
        injectIframeBridge(iframeDoc);
      }
    } catch (_) {}
  }

  function setupIframeWatcher() {
    bindPreviewIframe();
    const tick = () => bindPreviewIframe();
    if (typeof gemDomWatchSubscribe === 'function') {
      gemDomWatchSubscribe(tick);
    } else {
      const observer = new MutationObserver(tick);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    document.querySelectorAll('iframe').forEach((iframe) => {
      if (!iframe._gemSnippetCtxLoadBound) {
        iframe._gemSnippetCtxLoadBound = true;
        iframe.addEventListener('load', () => bindPreviewIframe());
      }
    });
  }

  function init() {
    if (!isCampaignPage()) return;

    loadSetting((enabled) => {
      menuEnabled = enabled;
    });

    bindContextMenuToDoc(document);
    setupIframeWatcher();

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[SETTING_KEY]) {
          menuEnabled = changes[SETTING_KEY].newValue !== false;
          if (!menuEnabled) closeMenu();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
