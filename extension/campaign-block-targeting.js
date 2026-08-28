// campaign-block-targeting.js
// Content script that marks e-block elements in the preview iframe with
// targeting attributes when the campaign draft/handshake data includes targeting info.
// Runs on page load (handshake cache first), on each draft save (postMessage),
// and re-applies automatically when Emarsys re-renders blocks.
// Also reacts to user edits in the Block targeting dialog.
(function () {
  const IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';
  const DRAFT_KEY_PREFIX = 'gemDraft_';
  const STYLE_ID = 'gem-block-targeting-styles';
  const SETTINGS_STYLE_ID = 'gem-block-targeting-settings-styles';
  const SCROLL_HIGHLIGHT_STYLE_ID = 'gem-block-targeting-scroll-highlight';
  const BUTTON_GROUP_SELECTOR = 'cb-campaign-preview .e-buttongroup';
  const ANCHOR_SELECTOR = 'cb-highlight-editables-switch';
  const SNAPSHOT_CACHED_SOURCE = 'gem-content-blocks-snapshot-cached';

  const STORAGE_PREVIEW_ENABLED = 'gemBlockTargetingPreviewEnabled';
  const STORAGE_VISIBILITY = 'gemBlockTargetingVisibility';

  let previewEnabled = true;
  let visibilityMode = 'always-show';
  let toolbarButtonEl = null;
  let lastCampaignSnapshot = null;
  let lastSelectedLanguage = null;
  let dataChangeListeners = [];

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
[e-blocks-container="true"] > [data-gem-block-targeting-scroll-highlight="true"][e-block] {
    outline: 3px solid color-mix(in srgb, var(--token-primary-400, #6366f1) 70%, transparent);
    outline-offset: 2px;
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
  let languageWatchUnsub = null;
  let lastLanguageValue = null;
  const blockDisplayNameCache = new Map();

  function getCampaignIdFromUrl() {
    try {
      const match = window.location.search.match(/[?&]id=(\d+)/);
      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function getSessionIdFromUrl() {
    try {
      return (new URL(window.location.href).searchParams.get('session_id') || '').trim();
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

  function isIdFallbackBlockName(name) {
    return /^Block [0-9a-f]{8}$/i.test(String(name || '').trim());
  }

  function rememberBlockDisplayName(blockId, name) {
    const id = String(blockId || '').trim();
    const label = String(name || '').trim();
    if (!id || !label || isIdFallbackBlockName(label)) return;
    blockDisplayNameCache.set(id, label);
  }

  function getCachedSnapshot(campaignIds) {
    if (typeof window.gemGetCachedContentBlocksSnapshot !== 'function') return null;
    const ids = (Array.isArray(campaignIds) ? campaignIds : [campaignIds])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const seen = new Set();
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      if (seen.has(id)) continue;
      seen.add(id);
      const snapshot = window.gemGetCachedContentBlocksSnapshot(id);
      if (snapshot) return snapshot;
    }
    return null;
  }

  function isVisibilityOnlyTargeting(targeting) {
    if (!targeting || typeof targeting !== 'object') return false;
    const keys = Object.keys(targeting);
    if (keys.length !== 1 || keys[0] !== 'content') return false;
    const content = targeting.content;
    if (!content || typeof content !== 'object') return false;
    return Object.keys(content).every((key) => key === 'visibility');
  }

  function mergeBlockRecord(incoming, existing) {
    if (!incoming) return existing || null;
    if (!existing) return incoming;

    const merged = Object.assign({}, incoming);
    if (!merged.template && existing.template) {
      merged.template = existing.template;
    }

    if (
      isVisibilityOnlyTargeting(incoming.targeting)
      && existing.targeting
      && !isVisibilityOnlyTargeting(existing.targeting)
    ) {
      merged.targeting = JSON.parse(JSON.stringify(existing.targeting));
      const visibility = incoming.targeting
        && incoming.targeting.content
        && incoming.targeting.content.visibility;
      if (visibility != null) {
        merged.targeting.content = merged.targeting.content || {};
        merged.targeting.content.visibility = visibility;
      }
    }

    return merged;
  }

  function mergeBlocksWithExisting(incomingBlocks) {
    if (!Array.isArray(incomingBlocks)) return incomingBlocks;
    if (!Array.isArray(lastBlocks) || !lastBlocks.length) return incomingBlocks;

    const existingById = new Map();
    lastBlocks.forEach((block) => {
      if (block && block._id != null) existingById.set(String(block._id), block);
    });

    return incomingBlocks.map((block) => {
      if (!block || block._id == null) return block;
      return mergeBlockRecord(block, existingById.get(String(block._id)));
    });
  }

  function snapshotMatchesCampaignPage(snapshot, urlCampaignId) {
    const urlId = String(urlCampaignId || '').trim();
    if (!urlId || !snapshot) return !!urlId;
    const campaign = snapshot.campaign || snapshot;
    if (!campaign || typeof campaign !== 'object') return false;
    const candidates = [
      campaign.suite_campaign_id,
      campaign.id,
      campaign.campaign_id,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return candidates.includes(urlId);
  }

  function getBlockVisibility(targeting) {
    if (!targeting || !targeting.content) return '';
    const visibility = targeting.content.visibility;
    return visibility != null ? String(visibility) : '';
  }

  function countTargetedBlocks(blocks) {
    if (!Array.isArray(blocks)) return 0;
    return blocks.filter((block) => block && block.targeting).length;
  }

  function notifyDataChange() {
    const payload = {
      blocks: lastBlocks,
      targetedCount: countTargetedBlocks(lastBlocks),
      language: lastSelectedLanguage,
    };
    dataChangeListeners.forEach((cb) => {
      try {
        cb(payload);
      } catch (_) {}
    });
    updateNavPipCount(payload.targetedCount);
  }

  function updateNavPipCount(count) {
    if (typeof window.gemSetBlockTargetingNavPipCount === 'function') {
      window.gemSetBlockTargetingNavPipCount(count);
    }
  }

  function buildBlockTemplateIndex(snapshot) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const templates = campaign
      && campaign.template_resources
      && campaign.template_resources.available_block_templates;
    const index = new Map();
    if (!Array.isArray(templates)) return index;
    templates.forEach((template) => {
      const id = String(template && template._id || '').trim();
      if (id) index.set(id, template);
    });
    return index;
  }

  function getPreviewBlockName(blockId) {
    const iframeDoc = getIframeDoc();
    if (!iframeDoc || !blockId) return '';
    const blockEl = iframeDoc.querySelector(`[e-block-id="${CSS.escape(blockId)}"]`);
    if (!blockEl) return '';
    const nameEl = blockEl.querySelector('[e-block-name], .e-blockname, .e-block-name');
    return nameEl ? String(nameEl.textContent || '').trim() : '';
  }

  function resolveBlockName(block, templateIndex) {
    const blockId = block && block._id ? String(block._id) : '';
    const previewName = getPreviewBlockName(blockId);
    if (previewName) {
      rememberBlockDisplayName(blockId, previewName);
      return previewName;
    }

    const cachedName = blockDisplayNameCache.get(blockId);
    if (cachedName) return cachedName;

    const templateId = String(block && block.template || '').trim();
    if (templateId && templateIndex) {
      const template = templateIndex.get(templateId);
      const templateName = template && (template.name || template.title || template.label);
      if (templateName) {
        const label = String(templateName).trim();
        rememberBlockDisplayName(blockId, label);
        return label;
      }
    }

    if (blockId) return `Block ${blockId.slice(0, 8)}`;
    return 'Block';
  }

  function toTitleCase(text) {
    const value = String(text || '').trim();
    if (!value) return value;
    return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
  }

  function formatTargetingRuleRow(key, label, value) {
    if (String(key || '').toLowerCase() === 'type') {
      return {
        label: toTitleCase(label),
        value: toTitleCase(value),
      };
    }
    return { label, value };
  }

  function formatTargetingValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => formatTargetingValue(item)).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
      const preferred = value.name || value.label || value.title || value.id || value._id;
      if (preferred != null && preferred !== value) {
        return String(preferred);
      }
      const parts = [];
      Object.keys(value).forEach((key) => {
        if (key === 'content' || key === 'visibility') return;
        const formatted = formatTargetingValue(value[key]);
        if (formatted) parts.push(`${key}: ${formatted}`);
      });
      return parts.join('; ');
    }
    return '';
  }

  function collectTargetingRuleRows(targeting, prefix) {
    const rows = [];
    if (!targeting || typeof targeting !== 'object') return rows;

    Object.keys(targeting).forEach((key) => {
      if (key === 'content') return;
      const value = targeting[key];
      const label = prefix ? `${prefix} ${key}` : key;
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        const nested = collectTargetingRuleRows(value, label);
        if (nested.length) {
          nested.forEach((row) => rows.push(row));
        } else {
          const formatted = formatTargetingValue(value);
          if (formatted) rows.push(formatTargetingRuleRow(key, label, formatted));
        }
      } else {
        const formatted = formatTargetingValue(value);
        if (formatted) rows.push(formatTargetingRuleRow(key, label, formatted));
      }
    });

    return rows;
  }

  function formatTargetingRules(targeting) {
    const rows = [];
    const visibility = getBlockVisibility(targeting);
    if (visibility && visibility !== '\u2026') {
      rows.push({
        label: 'Visibility',
        value: visibility === 'show' ? 'Show this block' : visibility === 'hide' ? 'Hide this block' : visibility,
      });
    } else if (visibility === '\u2026') {
      rows.push({ label: 'Visibility', value: 'Unknown (pending save)' });
    }
    collectTargetingRuleRows(targeting).forEach((row) => rows.push(row));
    return rows;
  }

  function getTargetedBlocksForPanel() {
    if (!Array.isArray(lastBlocks)) return [];
    const templateIndex = buildBlockTemplateIndex(lastCampaignSnapshot);
    const iframeDoc = getIframeDoc();
    let canvasOrder = [];
    if (iframeDoc) {
      canvasOrder = Array.from(iframeDoc.querySelectorAll('[e-block-id]'))
        .map((el) => el.getAttribute('e-block-id'))
        .filter(Boolean);
    }

    const targeted = lastBlocks
      .map((block, modelIndex) => ({ block, modelIndex }))
      .filter(({ block }) => block && block.targeting);

    targeted.sort((a, b) => {
      const aIdx = canvasOrder.indexOf(a.block._id);
      const bIdx = canvasOrder.indexOf(b.block._id);
      const aRank = aIdx >= 0 ? aIdx : 100000 + a.modelIndex;
      const bRank = bIdx >= 0 ? bIdx : 100000 + b.modelIndex;
      return aRank - bRank;
    });

    return targeted.map(({ block, modelIndex }, index) => {
      const visibility = getBlockVisibility(block.targeting);
      return {
        _id: block._id,
        name: resolveBlockName(block, templateIndex),
        visibility,
        targeting: block.targeting,
        rules: formatTargetingRules(block.targeting),
        index: canvasOrder.indexOf(block._id) >= 0 ? canvasOrder.indexOf(block._id) : modelIndex,
        displayIndex: index + 1,
      };
    });
  }

  function extractBlocksFromSnapshot(snapshot, lang) {
    if (!snapshot || !lang) return null;
    const campaign = snapshot.campaign || snapshot;
    const contents = campaign && campaign.contents;
    if (!contents || !contents[lang]) return null;
    const langEntry = contents[lang];
    const blocks = langEntry.blocks || (Array.isArray(langEntry) ? langEntry : null);
    if (!Array.isArray(blocks)) return null;
    return blocks.map((block) => {
      if (!block || block._id == null) return null;
      const copy = { _id: block._id, template: block.template };
      if (block.targeting) {
        copy.targeting = JSON.parse(JSON.stringify(block.targeting));
      }
      return copy;
    }).filter(Boolean);
  }

  function applyBlocksFromSource(blocks, snapshot, lang) {
    if (!Array.isArray(blocks)) return false;
    lastCampaignSnapshot = snapshot || lastCampaignSnapshot;
    lastSelectedLanguage = lang || getSelectedLanguage();
    applyTargeting(mergeBlocksWithExisting(blocks));
    return true;
  }

  // Capture the block ID when the user clicks the block-targeting toolbar button.
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
    if (typeof window.gemSyncCompactEmailToolsFeatureMenuItems === 'function') {
      window.gemSyncCompactEmailToolsFeatureMenuItems();
    }
    if (typeof window.gemSyncBlockTargetingPanelToggle === 'function') {
      window.gemSyncBlockTargetingPanelToggle();
    }
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
        applyTargetingData();
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

    const linkBtn = document.getElementById('linkHighlightPreviewButton');
    if (linkBtn && linkBtn.closest('e-tooltip')) {
      linkBtn.closest('e-tooltip').insertAdjacentElement('afterend', wrapper);
    } else {
      const altBtn = document.getElementById('altTextPreviewButton');
      if (altBtn && altBtn.closest('e-tooltip')) {
        altBtn.closest('e-tooltip').insertAdjacentElement('afterend', wrapper);
      } else {
        anchor.insertAdjacentElement('afterend', wrapper);
      }
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
    updateNavPipCount(countTargetedBlocks(lastBlocks));
  }

  function waitForToolbarButtonSlot() {
    if (document.querySelector(BUTTON_GROUP_SELECTOR) && document.querySelector(ANCHOR_SELECTOR)) {
      injectToolbarButton();
      return;
    }

    window.gemDomWatchSubscribe(function () {
      if (document.querySelector(BUTTON_GROUP_SELECTOR) && document.querySelector(ANCHOR_SELECTOR)) {
        injectToolbarButton();
      }
    });
  }

  function attachPreviewIframeLoadListener() {
    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (!iframe || iframe._gemBtPreviewLoadBound) return;
    iframe._gemBtPreviewLoadBound = true;
    iframe.addEventListener('load', () => {
      applyTargetingData();
      setTimeout(refreshPanelAfterPreviewNames, 300);
    });
  }

  function clearTargetingAttributes(container) {
    const marked = container.querySelectorAll('[data-gem-has-block-targeting]');
    marked.forEach((el) => {
      el.removeAttribute('data-gem-has-block-targeting');
      el.removeAttribute('data-gem-block-targeting-visibility');
      el.removeAttribute('data-gem-block-targeting-scroll-highlight');
    });
  }

  function applyTargeting(blocks) {
    if (!blocks) return;
    lastBlocks = blocks;

    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (!iframe) {
      notifyDataChange();
      return;
    }

    let iframeDoc;
    try {
      iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    } catch (_) {
      notifyDataChange();
      return;
    }

    injectCSS(iframeDoc);

    const container = iframeDoc.querySelector('[e-blocks-container]');
    if (!container) {
      notifyDataChange();
      return;
    }

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

      const visibility = getBlockVisibility(block.targeting);
      el.setAttribute('data-gem-block-targeting-visibility', visibility);
      targetedCount++;
    });

    isApplying = false;

    console.log('[Gem][BlockTargeting] Applied targeting to', targetedCount, 'of', eBlocks.length, 'blocks.');

    watchContainer(container);
    notifyDataChange();
  }

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

  function watchForBlockTargetingDialog() {
    window.gemDomWatchSubscribe(function (mutations) {
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
  }

  function readDraftStorage(campaignId, lang) {
    return new Promise((resolve) => {
      const storageKey = DRAFT_KEY_PREFIX + campaignId;
      try {
        chrome.storage.local.get(storageKey, (result) => {
          const entry = result[storageKey];
          if (entry && entry.contents && Array.isArray(entry.contents[lang])) {
            resolve(entry.contents[lang]);
          } else {
            resolve(null);
          }
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function resolveBlocksFromHandshake(campaignId, suiteCampaignId) {
    if (!campaignId && !suiteCampaignId) return { blocks: null, snapshot: null };

    let snapshot = getCachedSnapshot([campaignId, suiteCampaignId]);
    if (!snapshot && campaignId && typeof window.gemWaitForContentBlocksSnapshot === 'function') {
      snapshot = await window.gemWaitForContentBlocksSnapshot(campaignId, 2000);
    }
    if (!snapshot && typeof window.gemFetchContentBlocksSnapshot === 'function') {
      const sessionId = getSessionIdFromUrl();
      const fetchId = campaignId || suiteCampaignId;
      if (sessionId && fetchId) {
        const fetchResult = await window.gemFetchContentBlocksSnapshot(fetchId, sessionId);
        if (fetchResult && fetchResult.ok) {
          snapshot = fetchResult.campaign
            ? { campaign: fetchResult.campaign }
            : fetchResult.snapshot || null;
        }
      }
    }

    const lang = getSelectedLanguage();
    const blocks = snapshot ? extractBlocksFromSnapshot(snapshot, lang) : null;
    return { blocks, snapshot, lang };
  }

  async function applyTargetingDataAfterDraftSave(draftData) {
    const campaignId = getCampaignIdFromUrl();
    const suiteCampaignId = draftData && draftData.suiteCampaignId;
    const lang = (draftData && draftData.selectedLanguage) || getSelectedLanguage();

    if (lang && (campaignId || suiteCampaignId)) {
      const snapshot = getCachedSnapshot([campaignId, suiteCampaignId]);
      if (snapshot) {
        lastCampaignSnapshot = snapshot;
        const blocks = extractBlocksFromSnapshot(snapshot, lang);
        if (blocks) {
          applyBlocksFromSource(blocks, snapshot, lang);
          return;
        }
      }
    }

    await applyTargetingData();
  }

  async function applyTargetingData() {
    const campaignId = getCampaignIdFromUrl();
    const lang = getSelectedLanguage();

    if (!campaignId || !lang) {
      applyFromToolbarHints();
      return;
    }

    try {
      const handshakeResult = await resolveBlocksFromHandshake(campaignId);
      if (handshakeResult.blocks) {
        clearToolbarHintsObservers();
        applyBlocksFromSource(handshakeResult.blocks, handshakeResult.snapshot, handshakeResult.lang);
        return;
      }
    } catch (_) {}

    const draftBlocks = await readDraftStorage(campaignId, lang);
    if (draftBlocks) {
      clearToolbarHintsObservers();
      applyBlocksFromSource(draftBlocks, lastCampaignSnapshot, lang);
      return;
    }

    applyFromToolbarHints();
  }

  function refreshPanelAfterPreviewNames() {
    if (!Array.isArray(lastBlocks) || !lastBlocks.length) return;
    let changed = false;
    lastBlocks.forEach((block) => {
      if (!block || block._id == null) return;
      const previewName = getPreviewBlockName(String(block._id));
      if (previewName) {
        const prev = blockDisplayNameCache.get(String(block._id));
        rememberBlockDisplayName(String(block._id), previewName);
        if (prev !== previewName) changed = true;
      }
    });
    if (changed) notifyDataChange();
  }

  let toolbarHintsUnsub = null;
  let toolbarHintsIframeObs = null;
  let toolbarHintsTimer = null;

  function clearToolbarHintsObservers() {
    if (toolbarHintsUnsub) {
      toolbarHintsUnsub();
      toolbarHintsUnsub = null;
    }
    if (toolbarHintsIframeObs) {
      toolbarHintsIframeObs.disconnect();
      toolbarHintsIframeObs = null;
    }
  }

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

    if (toolbarHintsUnsub || toolbarHintsIframeObs) return;

    console.log('[Gem][BlockTargeting][Debug] No toolbar buttons yet, setting up MutationObserver.');

    const iframeDoc = getIframeDoc();

    toolbarHintsUnsub = window.gemDomWatchSubscribe(function () {
      if (findToolbarButtons()) {
        scheduleToolbarBuild();
      }
    });

    if (iframeDoc) {
      toolbarHintsIframeObs = new MutationObserver(function () {
        if (findToolbarButtons()) {
          scheduleToolbarBuild();
        }
      });
      toolbarHintsIframeObs.observe(iframeDoc.documentElement, { childList: true, subtree: true });
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
    clearToolbarHintsObservers();

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
    } else {
      notifyDataChange();
    }
  }

  function watchLanguageSelector() {
    if (languageWatchUnsub) return;
    lastLanguageValue = getSelectedLanguage();
    languageWatchUnsub = window.gemDomWatchSubscribe(function () {
      const current = getSelectedLanguage();
      if (!current || current === lastLanguageValue) return;
      lastLanguageValue = current;
      applyTargetingData();
    });
  }

  function waitForIframeBlocks() {
    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (iframe) {
      tryApplyWhenReady(iframe);
      return;
    }

    window.gemDomWatchWaitFor(IFRAME_SELECTOR, function (found) {
      tryApplyWhenReady(found);
    });
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
          applyTargetingData();
          return;
        }
      } catch (_) {}

      if (attempts < maxAttempts) {
        setTimeout(check, 250);
      }
    };

    check();
  }

  window.addEventListener('message', (e) => {
    if (!e.data) return;

    if (e.data.type === 'gem-draft-saved') {
      try {
        clearToolbarHintsObservers();
        void applyTargetingDataAfterDraftSave(e.data);
        setTimeout(refreshPanelAfterPreviewNames, 400);
      } catch (_) {}
      return;
    }

    if (e.data.source === SNAPSHOT_CACHED_SOURCE) {
      const campaignId = getCampaignIdFromUrl();
      const cachedId = String(e.data.campaignId || '').trim();
      if (!cachedId) return;
      if (campaignId && cachedId !== String(campaignId) && !snapshotMatchesCampaignPage(e.data.snapshot, campaignId)) {
        return;
      }
      if (e.data.snapshot) {
        lastCampaignSnapshot = e.data.snapshot;
      }
      applyTargetingData();
      return;
    }
  });

  watchForBlockTargetingDialog();
  watchLanguageSelector();

  loadBlockTargetingSettings(() => {
    waitForToolbarButtonSlot();
  });

  attachPreviewIframeLoadListener();
  window.gemDomWatchSubscribe(function () {
    attachPreviewIframeLoadListener();
  });

  if (getCampaignIdFromUrl()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForIframeBlocks);
    } else {
      waitForIframeBlocks();
    }
  }

  window.gemToggleBlockTargetingPreview = function gemToggleBlockTargetingPreview() {
    try {
      chrome.storage.sync.set({ [STORAGE_PREVIEW_ENABLED]: !previewEnabled });
    } catch (_) {}
  };

  window.gemIsBlockTargetingPreviewEnabled = function gemIsBlockTargetingPreviewEnabled() {
    return previewEnabled;
  };

  window.gemGetTargetedBlocks = function gemGetTargetedBlocks() {
    return getTargetedBlocksForPanel();
  };

  window.gemGetBlockTargetingCount = function gemGetBlockTargetingCount() {
    return countTargetedBlocks(lastBlocks);
  };

  window.gemOnBlockTargetingDataChange = function gemOnBlockTargetingDataChange(callback) {
    if (typeof callback !== 'function') return function () {};
    dataChangeListeners.push(callback);
    try {
      callback({
        blocks: lastBlocks,
        targetedCount: countTargetedBlocks(lastBlocks),
        language: lastSelectedLanguage,
      });
    } catch (_) {}
    return function unsubscribe() {
      dataChangeListeners = dataChangeListeners.filter((cb) => cb !== callback);
    };
  };

  window.gemScrollPreviewToBlock = function gemScrollPreviewToBlock(blockId) {
    const id = String(blockId || '').trim();
    if (!id) return false;

    const iframeDoc = getIframeDoc();
    if (!iframeDoc) return false;

    const blockEl = iframeDoc.querySelector(`[e-block-id="${CSS.escape(id)}"]`);
    if (!blockEl) return false;

    try {
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (_) {
      blockEl.scrollIntoView(true);
    }

    blockEl.setAttribute('data-gem-block-targeting-scroll-highlight', 'true');
    setTimeout(() => {
      blockEl.removeAttribute('data-gem-block-targeting-scroll-highlight');
    }, 1800);

    return true;
  };

  window.gemFormatBlockTargetingRules = function gemFormatBlockTargetingRules(targeting) {
    return formatTargetingRules(targeting);
  };

  console.log('[Gem][BlockTargeting] Initialized.');
})();
