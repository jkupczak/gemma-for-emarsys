// campaign-stripped-readonly.js
// Read-only lock for live campaign previews loaded with gemStripped=true (Compare Versions,
// and future Email Campaign List / Recent Campaigns drawer embeds).
(function initGemStrippedPreviewReadonly() {
  'use strict';

  const PREVIEW_IFRAME_SELECTOR =
    'iframe.e-contentblocks-preview__iframe.e-contentblocks-preview__iframe-desktop';

  const READONLY_STYLE_ID = 'gem-stripped-preview-readonly-styles';
  const READONLY_STYLE = [
    'e-vce-borderer-element, e-vce-borderer, .two_click_insert_dropzone, e-vce-dropline, .vce-drag-and-drop-auto-scroll-layer, e-vce-positioner-editable, .dnd_reorder_dropzone, .e-contentblocks-dragview, e-vce-positioner-block {',
    '  display: none !important;',
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

  function stripContentEditable(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      el.setAttribute('contenteditable', 'false');
    });
  }

  function injectReadonlyStyles(doc) {
    if (!doc || doc.getElementById(READONLY_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = READONLY_STYLE_ID;
    style.textContent = READONLY_STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function shouldBlockEditKey(event) {
    if (NAV_KEYS.has(event.key)) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (EDIT_KEYS.has(event.key)) return true;
    return event.key.length === 1;
  }

  function lockPreviewDocument(doc) {
    if (!doc || doc._gemStrippedPreviewReadonlyLocked) return;
    doc._gemStrippedPreviewReadonlyLocked = true;

    injectReadonlyStyles(doc);
    stripContentEditable(doc);

    if (doc.body && !doc._gemStrippedPreviewReadonlyObserver) {
      doc._gemStrippedPreviewReadonlyObserver = new MutationObserver(() => {
        stripContentEditable(doc);
      });
      doc._gemStrippedPreviewReadonlyObserver.observe(doc.body, {
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

    doc.addEventListener('beforeinput', blockDefault, true);
    doc.addEventListener('paste', blockDefault, true);
    doc.addEventListener('drop', blockDefault, true);
    doc.addEventListener('cut', blockDefault, true);
    doc.addEventListener('keydown', blockEditKeys, true);
  }

  function tryLockPreviewIframe(previewIframe) {
    if (!previewIframe) return;

    const run = () => {
      try {
        const doc = previewIframe.contentDocument;
        if (!doc || !doc.documentElement) return;
        lockPreviewDocument(doc);
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
    lockPreviewDocument,
    bindPreviewIframe,
    scanForPreviewIframe,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
