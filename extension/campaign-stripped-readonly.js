// campaign-stripped-readonly.js
// Read-only lock for live campaign previews loaded with gemStripped=true (Compare Versions,
// and future Email Campaign List / Recent Campaigns drawer embeds).
(function initGemStrippedPreviewReadonly() {
  'use strict';

  const PREVIEW_IFRAME_SELECTOR =
    'iframe.e-contentblocks-preview__iframe.e-contentblocks-preview__iframe-desktop';

  const READONLY_STYLE_ID = 'gem-stripped-preview-readonly-styles';
  const READONLY_STYLE = [
    '#gem-text-highlight-container, e-vce-borderer-element, e-vce-borderer, .two_click_insert_dropzone, div.two_click_insert_dropzone, e-vce-dropline, .vce-drag-and-drop-auto-scroll-layer, e-vce-positioner-editable, .dnd_reorder_dropzone, .dnd_insert_dropzone, div.dnd_insert_dropzone, .e-contentblocks-dragview, e-vce-positioner-block {',
    '  display: none !important;',
    '  visibility: hidden !important;',
    '  pointer-events: none !important;',
    '}',
    '[contenteditable="true"] {',
    '  -webkit-user-modify: read-only;',
    '  caret-color: transparent;',
    '}',
  ].join('\n');

  const NAV_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'PageUp',
    'PageDown',
    'Home',
    'End',
    'Escape',
    'Tab',
  ]);

  const EDIT_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Insert']);

  function isGemStrippedCampaignPage() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('gemStripped') !== 'true') return false;
      const route = decodeURIComponent(url.searchParams.get('r') || '');
      return route.includes('contentBlocks/campaign');
    } catch (_) {
      return false;
    }
  }

  function stripContentEditable(root, snapshots) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      snapshots.push({ el, value: el.getAttribute('contenteditable') || 'true' });
      el.setAttribute('contenteditable', 'false');
    });
  }

  function restoreContentEditable(snapshots) {
    snapshots.forEach(({ el, value }) => {
      if (!el.isConnected) return;
      if (value == null) el.removeAttribute('contenteditable');
      else el.setAttribute('contenteditable', value);
    });
  }

  function injectReadonlyStyles(doc) {
    if (!doc || doc.getElementById(READONLY_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = READONLY_STYLE_ID;
    style.textContent = READONLY_STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function removeReadonlyStyles(doc) {
    doc?.getElementById(READONLY_STYLE_ID)?.remove();
  }

  function shouldBlockEditKey(event) {
    if (NAV_KEYS.has(event.key)) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (EDIT_KEYS.has(event.key)) return true;
    return event.key.length === 1;
  }

  function attachPreviewDocumentLock(doc, options) {
    const state = {
      lockCount: 1,
      permanent: !!(options && options.permanent),
      contentEditableSnapshots: [],
      handlers: {},
      observer: null,
    };

    injectReadonlyStyles(doc);
    stripContentEditable(doc, state.contentEditableSnapshots);

    if (doc.body) {
      state.observer = new MutationObserver(() => {
        stripContentEditable(doc, state.contentEditableSnapshots);
      });
      state.observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['contenteditable'],
      });
    }

    const blockDefault = (event) => {
      event.preventDefault();
    };

    const blockEditKeys = (event) => {
      if (shouldBlockEditKey(event)) {
        event.preventDefault();
      }
    };

    state.handlers.blockDefault = blockDefault;
    state.handlers.blockEditKeys = blockEditKeys;

    doc.addEventListener('beforeinput', blockDefault, true);
    doc.addEventListener('paste', blockDefault, true);
    doc.addEventListener('drop', blockDefault, true);
    doc.addEventListener('cut', blockDefault, true);
    doc.addEventListener('keydown', blockEditKeys, true);

    doc._gemPreviewReadonlyState = state;
    doc._gemStrippedPreviewReadonlyLocked = true;
    return state;
  }

  function lockPreviewDocument(doc, options) {
    if (!doc) return false;

    const existing = doc._gemPreviewReadonlyState;
    if (existing) {
      existing.lockCount += 1;
      injectReadonlyStyles(doc);
      stripContentEditable(doc, existing.contentEditableSnapshots);
      return true;
    }

    attachPreviewDocumentLock(doc, options);
    return true;
  }

  function unlockPreviewDocument(doc) {
    const state = doc && doc._gemPreviewReadonlyState;
    if (!state || state.permanent) return false;

    state.lockCount -= 1;
    if (state.lockCount > 0) return true;

    removeReadonlyStyles(doc);
    restoreContentEditable(state.contentEditableSnapshots);

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    if (state.handlers.blockDefault) {
      doc.removeEventListener('beforeinput', state.handlers.blockDefault, true);
      doc.removeEventListener('paste', state.handlers.blockDefault, true);
      doc.removeEventListener('drop', state.handlers.blockDefault, true);
      doc.removeEventListener('cut', state.handlers.blockDefault, true);
    }
    if (state.handlers.blockEditKeys) {
      doc.removeEventListener('keydown', state.handlers.blockEditKeys, true);
    }

    delete doc._gemPreviewReadonlyState;
    delete doc._gemStrippedPreviewReadonlyLocked;
    delete doc._gemStrippedPreviewReadonlyObserver;
    return true;
  }

  function tryLockPreviewIframe(previewIframe) {
    if (!previewIframe) return;

    const run = () => {
      try {
        const doc = previewIframe.contentDocument;
        if (!doc || !doc.documentElement) return;
        lockPreviewDocument(doc, { permanent: true });
      } catch (_) {}
    };

    if (!previewIframe._gemStrippedReadonlyLoadBound) {
      previewIframe._gemStrippedReadonlyLoadBound = true;
      previewIframe.addEventListener('load', run);
    }

    run();
  }

  function bindPreviewIframe(previewIframe) {
    if (!previewIframe) return;
    tryLockPreviewIframe(previewIframe);
  }

  function scanForPreviewIframe(root) {
    const scope = root && root.querySelector ? root : document;
    scope.querySelectorAll(PREVIEW_IFRAME_SELECTOR).forEach(bindPreviewIframe);
  }

  function startPreviewIframeWatcher() {
    scanForPreviewIframe(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches && node.matches(PREVIEW_IFRAME_SELECTOR)) {
            bindPreviewIframe(node);
            continue;
          }
          if (node.querySelectorAll) {
            scanForPreviewIframe(node);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function start() {
    if (!isGemStrippedCampaignPage()) return;
    startPreviewIframeWatcher();
  }

  window.gemStrippedPreviewReadonly = {
    PREVIEW_IFRAME_SELECTOR,
    READONLY_STYLE,
    lockPreviewDocument,
    unlockPreviewDocument,
    bindPreviewIframe,
    scanForPreviewIframe,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
