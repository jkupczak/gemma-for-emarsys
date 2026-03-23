// campaign-block-targeting.js
// Content script that marks e-block elements in the preview iframe with
// targeting attributes when the campaign draft data includes targeting info.
// Runs on page load (from storage) and on each draft save (from postMessage).
// Re-applies automatically when Emarsys re-renders blocks.
// Also reacts to user edits in the Block targeting dialog.
(function () {
  const IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';
  const DRAFT_KEY_PREFIX = 'gemDraft_';
  const STYLE_ID = 'gem-block-targeting-styles';
  const SETTINGS_STYLE_ID = 'gem-block-targeting-settings-styles';
  const BUTTON_GROUP_SELECTOR = 'cb-campaign-preview .e-buttongroup';
  const ANCHOR_SELECTOR = 'cb-highlight-editables-switch';

  const STORAGE_PREVIEW_ENABLED = 'gemBlockTargetingPreviewEnabled';
  const STORAGE_VISIBILITY = 'gemBlockTargetingVisibility';

  let previewEnabled = true;
  let visibilityMode = 'always-show';
  let toolbarButtonEl = null;

  const TARGETING_CSS = `
[e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block] {
    position: relative;
}

[e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:before,
[e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:after {
    position: absolute;
    z-index: 999;
    pointer-events: none;
}
[e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:before {
    content: "";

    left: 0;
    top: 0;

    display: block;

    width: 100%;
    height: 100%;
    border-radius: 6px;
    box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--token-primary-200) 40%, transparent);
}
[e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:after {
    content: attr(data-gem-block-targeting-visibility);

    left: 4px;
    top: 4px;

    font-size: 12px;
    padding: 4px 6px 6px 4px;
    font-family: sans-serif;
    font-weight: bold;
    letter-spacing: 0.5px;
    border-radius: 0 0 6px 0;
    text-transform: uppercase;
    background: color-mix(in srgb, var(--token-primary-200) 40%, transparent);

}
[e-blocks-container="true"] > [data-gem-block-targeting-visibility="show"][e-block]:before {
    box-shadow: inset 0 0 0 4px color-mix(in srgb, #44ab6d 40%, transparent);
}
[e-blocks-container="true"] > [data-gem-block-targeting-visibility="show"][e-block]:after {
    background: color-mix(in srgb, #44ab6d 40%, transparent);
}
[e-blocks-container="true"] > [data-gem-block-targeting-visibility="hide"][e-block]:before {
    box-shadow: inset 0 0 0 4px color-mix(in srgb, #ab4458 40%, transparent);
}
[e-blocks-container="true"] > [data-gem-block-targeting-visibility="hide"][e-block]:after {
    background: color-mix(in srgb, #ab4458 40%, transparent);
}
    `;

  const SETTINGS_OVERRIDE_CSS = `
html[data-gem-bt-preview="off"] [e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:before,
html[data-gem-bt-preview="off"] [e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:after {
    display: none !important;
}
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] [e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:before,
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] [e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:after {
    opacity: 0;
    transition: opacity 0.15s ease;
}
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] [e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:hover:before,
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] [e-blocks-container="true"] > [data-gem-has-block-targeting="true"][e-block]:hover:after {
    opacity: 1;
}
    `;

  let lastBlocks = null;
  let containerObserver = null;
  let reapplyTimer = null;
  let isApplying = false;
  let pendingBlockId = null;

  function getCampaignIdFromUrl() {
    try {
      const match = window.location.search.match(/[?&]id=(\d+)/);
      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function getSelectedLanguage() {
    try {
      const selector = document.querySelector('vce-languages-selector');
      if (!selector) return null;
      const selected = selector.querySelector('e-select-option[selected="true"]');
      return selected ? selected.getAttribute('value') : null;
    } catch (_) {
      return null;
    }
  }

  // Capture the block ID when the user clicks the block-targeting toolbar button.
  // This fires before the dialog appears, so we stash it in pendingBlockId.
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[block-toolbar-button="block-targeting"]');
    if (!btn) return;
    pendingBlockId = btn.getAttribute('e-block-id') || null;
    if (pendingBlockId) {
      console.log('[Gem][BlockTargeting] Toolbar button clicked for block:', pendingBlockId);
    }
  }, true);

  function injectCSS(iframeDoc) {
    if (!iframeDoc.getElementById(STYLE_ID)) {
      const style = iframeDoc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = TARGETING_CSS;
      (iframeDoc.head || iframeDoc.documentElement).appendChild(style);
    }
    if (!iframeDoc.getElementById(SETTINGS_STYLE_ID)) {
      const settingsStyle = iframeDoc.createElement('style');
      settingsStyle.id = SETTINGS_STYLE_ID;
      settingsStyle.textContent = SETTINGS_OVERRIDE_CSS;
      (iframeDoc.head || iframeDoc.documentElement).appendChild(settingsStyle);
    }
    syncPreviewSettingsToIframeDoc(iframeDoc);
  }

  function syncPreviewSettingsToIframeDoc(iframeDoc) {
    try {
      const html = iframeDoc && iframeDoc.documentElement;
      if (!html) return;
      html.setAttribute('data-gem-bt-preview', previewEnabled ? 'on' : 'off');
      html.setAttribute(
        'data-gem-bt-visibility',
        visibilityMode === 'show-on-hover' ? 'show-on-hover' : 'always-show'
      );
    } catch (_) {}
  }

  function refreshPreviewSettingsInPreviewIframe() {
    const iframeDoc = getIframeDoc();
    if (iframeDoc) syncPreviewSettingsToIframeDoc(iframeDoc);
  }

  function loadBlockTargetingSettings(callback) {
    try {
      chrome.storage.sync.get(
        {
          [STORAGE_PREVIEW_ENABLED]: true,
          [STORAGE_VISIBILITY]: 'always-show'
        },
        (result) => {
          previewEnabled = result[STORAGE_PREVIEW_ENABLED] !== false;
          visibilityMode = result[STORAGE_VISIBILITY] || 'always-show';
          if (callback) callback();
        }
      );
    } catch (_) {
      if (callback) callback();
    }
  }

  function updateToolbarButtonState() {
    if (!toolbarButtonEl) return;
    toolbarButtonEl.classList.toggle('e-btn-active', previewEnabled);
  }

  try {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;
      let changed = false;
      if (changes[STORAGE_PREVIEW_ENABLED]) {
        previewEnabled = changes[STORAGE_PREVIEW_ENABLED].newValue !== false;
        changed = true;
      }
      if (changes[STORAGE_VISIBILITY]) {
        visibilityMode = changes[STORAGE_VISIBILITY].newValue || 'always-show';
        changed = true;
      }
      if (!changed) return;
      updateToolbarButtonState();
      refreshPreviewSettingsInPreviewIframe();
      if (changes[STORAGE_PREVIEW_ENABLED] && previewEnabled) {
        applyFromStorage();
      }
    });
  } catch (_) {}

  function injectToolbarButton() {
    if (document.getElementById('blockTargetingPreviewButton')) return;

    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (!anchor) return;

    const wrapper = document.createElement('e-tooltip');
    wrapper.setAttribute('placement', 'bottom');
    wrapper.setAttribute('content', 'Block Targeting Preview');
    wrapper.innerHTML =
      '<button id="blockTargetingPreviewButton" type="button" class="e-btn e-btn-onlyicon e-svgclickfix" aria-description="" aria-label="Block Targeting Preview">' +
        '<e-icon icon="radio-checked"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF15E;</div></div></e-icon>' +
      '</button>';

    const altBtn = document.getElementById('altTextPreviewButton');
    if (altBtn && altBtn.closest('e-tooltip')) {
      altBtn.closest('e-tooltip').insertAdjacentElement('afterend', wrapper);
    } else {
      anchor.insertAdjacentElement('afterend', wrapper);
    }

    toolbarButtonEl = wrapper.querySelector('#blockTargetingPreviewButton');
    toolbarButtonEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        chrome.storage.sync.get({ [STORAGE_PREVIEW_ENABLED]: true }, (r) => {
          const cur = r[STORAGE_PREVIEW_ENABLED] !== false;
          chrome.storage.sync.set({ [STORAGE_PREVIEW_ENABLED]: !cur });
        });
      } catch (_) {}
    });

    updateToolbarButtonState();
  }

  function waitForToolbarButtonSlot() {
    if (document.querySelector(BUTTON_GROUP_SELECTOR) && document.querySelector(ANCHOR_SELECTOR)) {
      injectToolbarButton();
      return;
    }

    const obs = new MutationObserver(() => {
      if (document.querySelector(BUTTON_GROUP_SELECTOR) && document.querySelector(ANCHOR_SELECTOR)) {
        obs.disconnect();
        injectToolbarButton();
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function attachPreviewIframeLoadListener() {
    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (!iframe || iframe._gemBtPreviewLoadBound) return;
    iframe._gemBtPreviewLoadBound = true;
    iframe.addEventListener('load', () => {
      applyFromStorage();
    });
  }

  function clearTargetingAttributes(container) {
    const marked = container.querySelectorAll('[data-gem-has-block-targeting]');
    marked.forEach((el) => {
      el.removeAttribute('data-gem-has-block-targeting');
      el.removeAttribute('data-gem-block-targeting-visibility');
    });
  }

  function applyTargeting(blocks) {
    if (!blocks) return;
    lastBlocks = blocks;

    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (!iframe) return;

    let iframeDoc;
    try {
      iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    } catch (_) {
      return;
    }

    injectCSS(iframeDoc);

    const container = iframeDoc.querySelector('[e-blocks-container]');
    if (!container) return;

    isApplying = true;

    clearTargetingAttributes(container);

    const blockMap = new Map();
    for (const block of blocks) {
      if (block && block._id) {
        blockMap.set(block._id, block);
      }
    }

    const eBlocks = container.querySelectorAll('[e-block]');
    let targetedCount = 0;

    eBlocks.forEach((el) => {
      const blockId = el.getAttribute('e-block-id');
      if (!blockId) return;

      const block = blockMap.get(blockId);
      if (!block || !block.targeting) return;

      el.setAttribute('data-gem-has-block-targeting', 'true');

      const visibility = block.targeting.content && block.targeting.content.visibility
        ? block.targeting.content.visibility
        : '';
      el.setAttribute('data-gem-block-targeting-visibility', visibility);
      targetedCount++;
    });

    isApplying = false;

    console.log('[Gem][BlockTargeting] Applied targeting to', targetedCount, 'of', eBlocks.length, 'blocks.');

    watchContainer(container);
  }

  // --- MutationObserver on e-blocks-container to re-apply after Emarsys re-renders ---

  function scheduleReapply() {
    if (reapplyTimer) clearTimeout(reapplyTimer);
    reapplyTimer = setTimeout(() => {
      reapplyTimer = null;
      if (lastBlocks) {
        applyTargeting(lastBlocks);
      }
    }, 150);
  }

  function watchContainer(container) {
    if (containerObserver) {
      containerObserver.disconnect();
    }

    containerObserver = new MutationObserver(() => {
      if (isApplying) return;
      scheduleReapply();
    });

    containerObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-gem-has-block-targeting', 'data-gem-block-targeting-visibility']
    });
  }

  // --- Update a single block's targeting in memory only ---
  // Storage is intentionally NOT updated here. The next draft save will
  // write the canonical data from Emarsys. If the user reloads without
  // saving, the on-load path reads from storage and unsaved edits are
  // naturally discarded.

  function updateBlockTargeting(blockId, targeting) {
    if (!lastBlocks) return;

    const block = lastBlocks.find((b) => b && b._id === blockId);
    if (block) {
      if (targeting) {
        block.targeting = targeting;
      } else {
        delete block.targeting;
      }
    }

    applyTargeting(lastBlocks);
  }

  // --- Watch for the Block targeting dialog ---

  function isBlockTargetingDialog(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const title = el.querySelector && el.querySelector('span.e-dialog__title');
    return title && title.textContent.trim() === 'Block targeting';
  }

  function wireBlockTargetingDialog(dialog) {
    if (dialog._gemBlockTargetingListener) return;

    dialog._gemBlockTargetingListener = (e) => {
      const btn = e.target && e.target.closest && e.target.closest('button.e-btn');
      if (!btn) return;

      const blockId = pendingBlockId;
      if (!blockId) return;

      const text = btn.textContent.trim();

      if (text === 'Remove Block Targeting') {
        console.log('[Gem][BlockTargeting] Remove Block Targeting clicked for block:', blockId);
        updateBlockTargeting(blockId, null);
        return;
      }

      if (text === 'OK' && btn.classList.contains('e-btn-primary')) {
        const selectEl = dialog.querySelector('div[role="button"][aria-haspopup="listbox"]');
        const ariaLabel = selectEl ? selectEl.getAttribute('aria-label') : '';

        let visibility = '';
        if (ariaLabel === 'Show this block') {
          visibility = 'show';
        } else if (ariaLabel === 'Hide this block') {
          visibility = 'hide';
        }

        console.log('[Gem][BlockTargeting] OK clicked for block:', blockId, '| visibility:', visibility);

        updateBlockTargeting(blockId, {
          content: { visibility }
        });
      }
    };

    dialog.addEventListener('click', dialog._gemBlockTargetingListener, true);
    console.log('[Gem][BlockTargeting] Delegated click handler attached to dialog.');
  }

  // Watch for Block targeting dialogs appearing in the DOM
  function watchForBlockTargetingDialog() {
    const dialogObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (isBlockTargetingDialog(node)) {
            wireBlockTargetingDialog(node);
            continue;
          }

          if (node.querySelector) {
            const nested = node.querySelector('e-float-container e-dialog-visible, .e-dialog__container');
            if (nested) {
              const container = nested.closest('e-float-container') || nested.closest('.e-float-container-default') || nested;
              if (isBlockTargetingDialog(container)) {
                wireBlockTargetingDialog(container);
              }
            }

            const titles = node.querySelectorAll('span.e-dialog__title');
            titles.forEach((title) => {
              if (title.textContent.trim() !== 'Block targeting') return;
              const container = title.closest('e-float-container') || title.closest('.e-float-container-default') || title.closest('.e-dialog__container');
              if (container) wireBlockTargetingDialog(container);
            });
          }
        }
      }
    });

    dialogObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // --- On-load: read from storage, or fall back to toolbar hints ---

  function applyFromStorage() {
    const campaignId = getCampaignIdFromUrl();
    const lang = getSelectedLanguage();

    if (!campaignId || !lang) {
      applyFromToolbarHints();
      return;
    }

    const storageKey = DRAFT_KEY_PREFIX + campaignId;
    chrome.storage.local.get(storageKey, (result) => {
      const entry = result[storageKey];
      if (entry && entry.contents && Array.isArray(entry.contents[lang])) {
        applyTargeting(entry.contents[lang]);
      } else {
        applyFromToolbarHints();
      }
    });
  }

  let toolbarHintsObserver = null;
  let toolbarHintsTimer = null;

  function getIframeDoc() {
    try {
      const iframe = document.querySelector(IFRAME_SELECTOR);
      if (!iframe) return null;
      return iframe.contentDocument || iframe.contentWindow.document;
    } catch (_) {
      return null;
    }
  }

  function findToolbarButtons() {
    const iframeDoc = getIframeDoc();
    if (iframeDoc) {
      const inIframe = iframeDoc.querySelectorAll('[block-toolbar-button="block-targeting"]');
      if (inIframe.length) return inIframe;
    }
    const inMain = document.querySelectorAll('[block-toolbar-button="block-targeting"]');
    if (inMain.length) return inMain;
    return null;
  }

  function applyFromToolbarHints() {
    console.log('[Gem][BlockTargeting][Debug] applyFromToolbarHints called.');

    const immediate = findToolbarButtons();
    console.log('[Gem][BlockTargeting][Debug] Immediate toolbar button count:', immediate ? immediate.length : 0);

    if (immediate) {
      scheduleToolbarBuild();
      return;
    }

    if (toolbarHintsObserver) return;

    console.log('[Gem][BlockTargeting][Debug] No toolbar buttons yet, setting up MutationObserver.');

    // Observe both main document and iframe document for toolbar buttons
    const iframeDoc = getIframeDoc();

    toolbarHintsObserver = new MutationObserver(() => {
      if (findToolbarButtons()) {
        scheduleToolbarBuild();
      }
    });

    toolbarHintsObserver.observe(document.documentElement, { childList: true, subtree: true });
    if (iframeDoc) {
      toolbarHintsObserver.observe(iframeDoc.documentElement, { childList: true, subtree: true });
      console.log('[Gem][BlockTargeting][Debug] Also observing iframe document.');
    }
  }

  function scheduleToolbarBuild() {
    if (toolbarHintsTimer) clearTimeout(toolbarHintsTimer);
    toolbarHintsTimer = setTimeout(() => {
      toolbarHintsTimer = null;
      buildFromToolbar();
    }, 500);
  }

  function buildFromToolbar() {
    if (toolbarHintsObserver) {
      toolbarHintsObserver.disconnect();
      toolbarHintsObserver = null;
    }

    const toolbarBtns = findToolbarButtons();
    console.log('[Gem][BlockTargeting][Debug] buildFromToolbar — toolbar button count:', toolbarBtns ? toolbarBtns.length : 0);

    if (!toolbarBtns) return;

    const syntheticBlocks = [];

    toolbarBtns.forEach((btn) => {
      const blockId = btn.getAttribute('e-block-id');
      if (!blockId) return;

      const hasTargeting = btn.classList.contains('background-color-info');
      console.log('[Gem][BlockTargeting][Debug]   block:', blockId, '| background-color-info:', hasTargeting, '| classes:', btn.className);

      const block = { _id: blockId };
      if (hasTargeting) {
        block.targeting = { content: { visibility: '\u2026' } };
      }
      syntheticBlocks.push(block);
    });

    const targetedCount = syntheticBlocks.filter((b) => b.targeting).length;
    console.log('[Gem][BlockTargeting][Debug] Synthetic blocks built:', syntheticBlocks.length, 'total,', targetedCount, 'with targeting.');

    if (syntheticBlocks.length) {
      applyTargeting(syntheticBlocks);
    }
  }

  function waitForIframeBlocks() {
    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (iframe) {
      tryApplyWhenReady(iframe);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const found = (node.matches && node.matches(IFRAME_SELECTOR) && node)
            || (node.querySelector && node.querySelector(IFRAME_SELECTOR));
          if (found) {
            observer.disconnect();
            tryApplyWhenReady(found);
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function tryApplyWhenReady(iframe) {
    let attempts = 0;
    const maxAttempts = 40;

    const check = () => {
      attempts++;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const container = doc && doc.querySelector('[e-blocks-container]');
        const hasBlocks = container && container.querySelector('[e-block]');
        const hasLang = getSelectedLanguage();

        if (container && hasBlocks && hasLang) {
          applyFromStorage();
          return;
        }
      } catch (_) {}

      if (attempts < maxAttempts) {
        setTimeout(check, 250);
      }
    };

    check();
  }

  // Kick off the on-load path
  if (getCampaignIdFromUrl()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForIframeBlocks);
    } else {
      waitForIframeBlocks();
    }
  }

  // --- Draft-save path: use data directly from the postMessage ---

  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'gem-draft-saved') return;

    try {
      const { selectedLanguage, blocksByLanguage } = e.data;
      if (!selectedLanguage || !blocksByLanguage) return;

      const blocks = blocksByLanguage[selectedLanguage];
      if (!Array.isArray(blocks)) return;

      // Real data arrived; stop watching for toolbar hints
      if (toolbarHintsObserver) {
        toolbarHintsObserver.disconnect();
        toolbarHintsObserver = null;
      }

      applyTargeting(blocks);
    } catch (_) {}
  });

  // --- Watch for Block targeting dialog interactions ---

  watchForBlockTargetingDialog();

  loadBlockTargetingSettings(() => {
    waitForToolbarButtonSlot();
  });

  attachPreviewIframeLoadListener();
  const iframeForLoadObs = new MutationObserver(() => {
    attachPreviewIframeLoadListener();
  });
  iframeForLoadObs.observe(document.documentElement, { childList: true, subtree: true });

  console.log('[Gem][BlockTargeting] Initialized.');
})();
