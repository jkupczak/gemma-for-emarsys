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
  const MOBILE_BADGE_CLASS = 'gem-bv-mobile-badge';
  const MOBILE_BADGE_ARIA_LABEL = 'Hidden on Mobile';
  const MOBILE_BADGE_ICON = '\uF132';
  const OVERLAY_LAYER_CLASS = 'gem-bv-overlay-layer';
  const OVERLAY_ROOT_ATTR = 'data-gem-bv-overlay-root';
  const TOOLBAR_BTN_BLOCK_TARGETING = 'block-targeting';
  const TOOLBAR_BTN_HIDE_ON_MOBILE = 'hide-block-on-mobile';
  const HIDE_ON_MOBILE_CLICK_BOUND_KEY = '_gemHideOnMobileClickBound';

  const BLOCK_VISIBILITY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M240-40H120q-33 0-56.5-23.5T40-120v-120h80v120h120v80Zm480 0v-80h120v-120h80v120q0 33-23.5 56.5T840-40H720ZM480-220q-120 0-217.5-71T120-480q45-118 142.5-189T480-740q120 0 217.5 71T840-480q-45 118-142.5 189T480-220Zm0-80q88 0 161-48t112-132q-39-84-112-132t-161-48q-88 0-161 48T207-480q39 84 112 132t161 48Zm0-40q58 0 99-41t41-99q0-58-41-99t-99-41q-58 0-99 41t-41 99q0 58 41 99t99 41Zm0-80q-25 0-42.5-17.5T420-480q0-25 17.5-42.5T480-540q25 0 42.5 17.5T540-480q0 25-17.5 42.5T480-420ZM40-720v-120q0-33 23.5-56.5T120-920h120v80H120v120H40Zm800 0v-120H720v-80h120q33 0 56.5 23.5T920-840v120h-80ZM480-480Z"/></svg>';

  let previewEnabled = true;
  let visibilityMode = 'always-show';
  let toolbarButtonEl = null;
  let lastCampaignSnapshot = null;
  let lastSelectedLanguage = null;
  let dataChangeListeners = [];

  const OVERLAY_ROOT_SELECTOR = '[' + OVERLAY_ROOT_ATTR + '="true"]';

  const VISIBILITY_OVERLAY_SELECTOR = OVERLAY_ROOT_SELECTOR;

  const VISIBILITY_OVERLAY_BEFORE = OVERLAY_ROOT_SELECTOR + ':before';

  const VISIBILITY_OVERLAY_AFTER = OVERLAY_ROOT_SELECTOR + ':after';

  const VISIBILITY_OVERLAY_HOVER_BEFORE =
    OVERLAY_ROOT_SELECTOR + ':hover:before, ' +
    '[e-block]:hover > .' + OVERLAY_LAYER_CLASS + OVERLAY_ROOT_SELECTOR + ':before';

  const VISIBILITY_OVERLAY_HOVER_AFTER =
    OVERLAY_ROOT_SELECTOR + ':hover:after, ' +
    '[e-block]:hover > .' + OVERLAY_LAYER_CLASS + OVERLAY_ROOT_SELECTOR + ':after';

  const VISIBILITY_OVERLAY_MOBILE_BADGE = OVERLAY_ROOT_SELECTOR + ' .' + MOBILE_BADGE_CLASS;

  const VISIBILITY_OVERLAY_HOVER_MOBILE_BADGE =
    OVERLAY_ROOT_SELECTOR + ':hover .' + MOBILE_BADGE_CLASS + ', ' +
    '[e-block]:hover > .' + OVERLAY_LAYER_CLASS + OVERLAY_ROOT_SELECTOR + ' .' + MOBILE_BADGE_CLASS;

  const TARGETING_CSS = `
[e-blocks-container] > [e-block][data-gem-hide-on-mobile="true"] {
    position: relative;
    overflow: visible;
}

html[data-gem-bt-preview="on"] [e-blocks-container] > [e-block][data-gem-hide-on-mobile="true"] > table.vce-hide-on-mobile,
html[data-gem-bt-preview="on"] [e-blocks-container] > [e-block][data-gem-hide-on-mobile="true"] > table[e-block-id] {
    display: table !important;
    visibility: visible !important;
    max-height: none !important;
}

.${OVERLAY_LAYER_CLASS} {
    position: absolute;
    pointer-events: none;
    z-index: 999;
}

${OVERLAY_ROOT_SELECTOR}:not(.${OVERLAY_LAYER_CLASS}) {
    position: relative;
}

${VISIBILITY_OVERLAY_BEFORE},
${VISIBILITY_OVERLAY_AFTER},
.${MOBILE_BADGE_CLASS} {
    position: absolute;
    z-index: 999;
    pointer-events: none;
}

${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility]:before {
    content: "";
    left: 0;
    top: 0;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--token-primary-200) 40%, transparent);
}

${OVERLAY_ROOT_SELECTOR}[data-gem-hide-on-mobile="true"]:not([data-gem-block-targeting-visibility]):before {
    content: "";
    left: 0;
    top: 0;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    box-shadow: inset 0 0 0 4px color-mix(in srgb, #ab4458 40%, transparent);
}

${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility]:after {
    content: attr(data-gem-block-targeting-visibility);
    left: 4px;
    top: 4px;
    font-size: 10px;
    padding: 4px 6px 6px 4px;
    font-family: sans-serif;
    font-weight: bold;
    letter-spacing: 0.5px;
    border-radius: 0 0 6px 0;
    text-transform: uppercase;
    background: color-mix(in srgb, var(--token-primary-200) 40%, transparent);
}

.${MOBILE_BADGE_CLASS} {
    left: 4px;
    top: 4px;
    right: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 16px;
    padding: 4px 6px 6px 4px;
    font-family: sans-serif;
    font-weight: bold;
    letter-spacing: 0.5px;
    border-radius: 0 0 6px 0;
    background: color-mix(in srgb, #ab4458 40%, transparent);
}

${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility] .${MOBILE_BADGE_CLASS} {
    top: 28px;
}

.${MOBILE_BADGE_CLASS} .gem-bv-mobile-badge-icon {
    font-family: var(--token-icon-default-fontFamily);
    font-size: 16px;
    font-weight: 400;
    line-height: 1;
    color: #000;
}

${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility="show"]:before {
    box-shadow: inset 0 0 0 4px color-mix(in srgb, #44ab6d 40%, transparent);
}
${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility="show"]:after {
    background: color-mix(in srgb, #44ab6d 40%, transparent);
}
${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility="hide"]:before {
    box-shadow: inset 0 0 0 4px color-mix(in srgb, #ab4458 40%, transparent);
}
${OVERLAY_ROOT_SELECTOR}[data-gem-block-targeting-visibility="hide"]:after {
    background: color-mix(in srgb, #ab4458 40%, transparent);
}
[e-blocks-container] > [data-gem-block-targeting-scroll-highlight="true"][e-block],
[e-blocks-container] > [e-block][data-gem-block-targeting-scroll-highlight="true"] > .${OVERLAY_LAYER_CLASS} {
    outline: 3px solid color-mix(in srgb, var(--token-primary-400, #6366f1) 70%, transparent);
    outline-offset: 2px;
}
    `;

  const SETTINGS_OVERRIDE_CSS = `
html[data-gem-bt-preview="off"] ${VISIBILITY_OVERLAY_BEFORE},
html[data-gem-bt-preview="off"] ${VISIBILITY_OVERLAY_AFTER},
html[data-gem-bt-preview="off"] ${VISIBILITY_OVERLAY_MOBILE_BADGE} {
    display: none !important;
}
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] ${VISIBILITY_OVERLAY_BEFORE},
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] ${VISIBILITY_OVERLAY_AFTER},
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] ${VISIBILITY_OVERLAY_MOBILE_BADGE} {
    opacity: 0;
    transition: opacity 0.15s ease;
}
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] ${VISIBILITY_OVERLAY_HOVER_BEFORE},
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] ${VISIBILITY_OVERLAY_HOVER_AFTER},
html[data-gem-bt-preview="on"][data-gem-bt-visibility="show-on-hover"] ${VISIBILITY_OVERLAY_HOVER_MOBILE_BADGE} {
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
  let boundPreviewIframe = null;
  let previewContainerObserver = null;
  let previewContainerObserved = null;
  let previewRebuildApplyTimer = null;
  let applyWhenReadyTimer = null;
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

    if (incoming.hide_on_mobile === true) {
      merged.hide_on_mobile = true;
    } else if (incoming.hide_on_mobile === false) {
      delete merged.hide_on_mobile;
    }

    if (Array.isArray(incoming.mobileHiddenFields)) {
      if (incoming.mobileHiddenFields.length) {
        merged.mobileHiddenFields = incoming.mobileHiddenFields.slice();
      } else {
        delete merged.mobileHiddenFields;
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

  function getHideOnMobileFlags(block) {
    const flags = [];
    if (!block || typeof block !== 'object') return flags;

    if (block.hide_on_mobile === true) {
      flags.push({ level: 'block', fieldKey: null });
    }

    if (Array.isArray(block.mobileHiddenFields)) {
      block.mobileHiddenFields.forEach((fieldKey) => {
        const key = String(fieldKey || '').trim();
        if (key && !flags.some((flag) => flag.fieldKey === key)) {
          flags.push({ level: 'field', fieldKey: key });
        }
      });
    }

    const content = block.content;
    if (content && typeof content === 'object') {
      Object.keys(content).forEach((fieldKey) => {
        const fieldVal = content[fieldKey];
        if (fieldVal && typeof fieldVal === 'object' && fieldVal.hide_on_mobile === true) {
          if (!flags.some((flag) => flag.fieldKey === fieldKey)) {
            flags.push({ level: 'field', fieldKey });
          }
        }
      });
    }

    return flags;
  }

  function blockHasMobileHide(block) {
    return getHideOnMobileFlags(block).length > 0;
  }

  function copyMobileVisibilityFields(copy, block) {
    const flags = getHideOnMobileFlags(block);
    if (!flags.length) return copy;
    if (flags.some((flag) => flag.level === 'block')) {
      copy.hide_on_mobile = true;
    }
    const fieldKeys = flags
      .filter((flag) => flag.fieldKey)
      .map((flag) => flag.fieldKey);
    if (fieldKeys.length) {
      copy.mobileHiddenFields = fieldKeys;
    }
    return copy;
  }

  function getBlockVisibility(targeting) {
    if (!targeting || !targeting.content) return '';
    const visibility = targeting.content.visibility;
    return visibility != null ? String(visibility) : '';
  }

  function countVisibilityBlocks(blocks) {
    if (!Array.isArray(blocks)) return 0;
    return blocks.filter((block) => block && (block.targeting || blockHasMobileHide(block))).length;
  }

  function countTargetedBlocks(blocks) {
    return countVisibilityBlocks(blocks);
  }

  function formatMobileHideRules(block) {
    const flags = getHideOnMobileFlags(block);
    const rows = [];
    if (flags.some((flag) => flag.level === 'block')) {
      rows.push({ label: 'Mobile', value: 'Entire block' });
    }
    flags
      .filter((flag) => flag.fieldKey)
      .forEach((flag) => {
        rows.push({ label: 'Mobile field', value: flag.fieldKey });
      });
    return rows;
  }

  function notifyDataChange() {
    const payload = {
      blocks: lastBlocks,
      targetedCount: countVisibilityBlocks(lastBlocks),
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

  function getPreviewBlockOrder() {
    const iframeDoc = getIframeDoc();
    if (!iframeDoc) return [];

    const container = iframeDoc.querySelector('[e-blocks-container]');
    if (!container) return [];

    const seen = new Set();
    const order = [];
    container.querySelectorAll(':scope > [e-block]').forEach((el) => {
      const id = String(el.getAttribute('e-block-id') || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      order.push(id);
    });
    return order;
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

  function getBlockVisibilityBlocksForPanel() {
    if (!Array.isArray(lastBlocks)) return [];
    const templateIndex = buildBlockTemplateIndex(lastCampaignSnapshot);
    const canvasOrder = getPreviewBlockOrder();
    const canvasRank = new Map();
    canvasOrder.forEach((blockId, index) => {
      canvasRank.set(String(blockId), index);
    });

    const visibleBlocks = lastBlocks
      .map((block, modelIndex) => ({ block, modelIndex }))
      .filter(({ block }) => block && (block.targeting || blockHasMobileHide(block)));

    visibleBlocks.sort((a, b) => {
      const aId = String(a.block._id);
      const bId = String(b.block._id);
      const aRank = canvasRank.has(aId) ? canvasRank.get(aId) : 100000 + a.modelIndex;
      const bRank = canvasRank.has(bId) ? canvasRank.get(bId) : 100000 + b.modelIndex;
      return aRank - bRank;
    });

    return visibleBlocks.map(({ block, modelIndex }, index) => {
      const blockId = String(block._id);
      const visibility = block.targeting ? getBlockVisibility(block.targeting) : null;
      const mobileHiddenFields = getHideOnMobileFlags(block)
        .filter((flag) => flag.fieldKey)
        .map((flag) => flag.fieldKey);
      const rules = block.targeting ? formatTargetingRules(block.targeting) : [];
      formatMobileHideRules(block).forEach((row) => rules.push(row));
      return {
        _id: block._id,
        name: resolveBlockName(block, templateIndex),
        visibility,
        hasMobileHide: blockHasMobileHide(block),
        mobileHiddenFields,
        targeting: block.targeting,
        rules,
        index: canvasRank.has(blockId) ? canvasRank.get(blockId) : modelIndex,
        displayIndex: index + 1,
      };
    });
  }

  function getTargetedBlocksForPanel() {
    return getBlockVisibilityBlocksForPanel();
  }

  function getRawBlocksFromSnapshot(snapshot, lang) {
    if (!snapshot || !lang) return null;
    const campaign = snapshot.campaign || snapshot;
    const contents = campaign && campaign.contents;
    if (!contents || !contents[lang]) return null;
    const langEntry = contents[lang];
    return langEntry.blocks || (Array.isArray(langEntry) ? langEntry : null);
  }

  function enrichBlocksMobileVisibility(blocks, snapshot, lang) {
    if (!Array.isArray(blocks)) return blocks;
    const rawBlocks = getRawBlocksFromSnapshot(snapshot, lang);
    if (!Array.isArray(rawBlocks)) return blocks;

    const rawById = new Map();
    rawBlocks.forEach((block) => {
      if (block && block._id != null) rawById.set(String(block._id), block);
    });

    return blocks.map((block) => {
      if (!block || block._id == null) return block;
      const raw = rawById.get(String(block._id));
      if (!raw) return block;
      const copy = Object.assign({}, block);
      return copyMobileVisibilityFields(copy, raw);
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
      return copyMobileVisibilityFields(copy, block);
    }).filter(Boolean);
  }

  function applyBlocksFromSource(blocks, snapshot, lang) {
    if (!Array.isArray(blocks)) return false;
    lastCampaignSnapshot = snapshot || lastCampaignSnapshot;
    lastSelectedLanguage = lang || getSelectedLanguage();
    const merged = mergeBlocksWithExisting(blocks);
    const enriched = enrichBlocksMobileVisibility(
      merged,
      snapshot || lastCampaignSnapshot,
      lang || lastSelectedLanguage
    );
    applyTargeting(enriched);
    return true;
  }

  // Capture the block ID when the user clicks the block-targeting toolbar button.
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[block-toolbar-button="' + TOOLBAR_BTN_BLOCK_TARGETING + '"]');
    if (!btn) return;
    pendingBlockId = btn.getAttribute('e-block-id') || null;
    if (pendingBlockId) {
      console.log('[Gem][BlockTargeting] Toolbar button clicked for block:', pendingBlockId);
    }
  }, true);

  function isToolbarButtonActive(btn) {
    return !!(btn && btn.classList && btn.classList.contains('background-color-info'));
  }

  function ensureBlockRecord(blockId) {
    const id = String(blockId || '').trim();
    if (!id) return null;
    if (!Array.isArray(lastBlocks)) lastBlocks = [];
    let block = lastBlocks.find((entry) => entry && String(entry._id) === id);
    if (!block) {
      block = { _id: id };
      lastBlocks.push(block);
    }
    return block;
  }

  function readMobileHideFromPreview(blockId) {
    const iframeDoc = getIframeDoc();
    if (!iframeDoc) return false;
    const blockEl = iframeDoc.querySelector('[e-block-id="' + CSS.escape(String(blockId)) + '"][e-block]');
    const table = findBlockContentTable(blockEl, blockId);
    return !!(table && table.classList.contains('vce-hide-on-mobile'));
  }

  function readMobileHideState(blockId, btn) {
    if (btn && btn.isConnected) {
      return isToolbarButtonActive(btn);
    }
    return readMobileHideFromPreview(blockId);
  }

  function updateBlockMobileHide(blockId, hideOnMobile) {
    const block = ensureBlockRecord(blockId);
    if (!block) return;

    if (hideOnMobile) {
      block.hide_on_mobile = true;
    } else {
      delete block.hide_on_mobile;
    }

    console.log('[Gem][BlockVisibility] Updated hide_on_mobile for block:', blockId, '| active:', hideOnMobile);
    applyTargeting(lastBlocks);
  }

  function scheduleMobileHideStateSync(blockId, btn) {
    const sync = () => updateBlockMobileHide(blockId, readMobileHideState(blockId, btn));
    requestAnimationFrame(sync);
    setTimeout(sync, 150);
  }

  function handleHideOnMobileToolbarClick(e) {
    const btn = e.target && e.target.closest && e.target.closest('[block-toolbar-button="' + TOOLBAR_BTN_HIDE_ON_MOBILE + '"]');
    if (!btn) return;
    const blockId = btn.getAttribute('e-block-id');
    if (!blockId) return;
    console.log('[Gem][BlockVisibility] Hide on mobile toolbar clicked for block:', blockId);
    scheduleMobileHideStateSync(blockId, btn);
  }

  function wireHideOnMobileToolbarListener(doc) {
    if (!doc || doc[HIDE_ON_MOBILE_CLICK_BOUND_KEY]) return;
    doc[HIDE_ON_MOBILE_CLICK_BOUND_KEY] = true;
    doc.addEventListener('click', handleHideOnMobileToolbarClick, true);
  }

  function wireAllHideOnMobileToolbarListeners() {
    wireHideOnMobileToolbarListener(document);
    const iframeDoc = getIframeDoc();
    if (iframeDoc) wireHideOnMobileToolbarListener(iframeDoc);
  }

  function injectCSS(iframeDoc) {
    let style = iframeDoc.getElementById(STYLE_ID);
    if (!style) {
      style = iframeDoc.createElement('style');
      style.id = STYLE_ID;
      (iframeDoc.head || iframeDoc.documentElement).appendChild(style);
    }
    style.textContent = TARGETING_CSS;

    let settingsStyle = iframeDoc.getElementById(SETTINGS_STYLE_ID);
    if (!settingsStyle) {
      settingsStyle = iframeDoc.createElement('style');
      settingsStyle.id = SETTINGS_STYLE_ID;
      (iframeDoc.head || iframeDoc.documentElement).appendChild(settingsStyle);
    }
    settingsStyle.textContent = SETTINGS_OVERRIDE_CSS;

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
    wrapper.setAttribute('content', 'Block Visibility');
    wrapper.innerHTML =
      '<button id="blockTargetingPreviewButton" type="button" class="e-btn e-btn-onlyicon e-svgclickfix" aria-description="" aria-label="Block Visibility">' +
        '<e-icon icon="eye"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF0DD;</div></div></e-icon>' +
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
    updateNavPipCount(countVisibilityBlocks(lastBlocks));
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

  function resetContainerObserver() {
    if (containerObserver) {
      containerObserver.disconnect();
      containerObserver = null;
    }
  }

  function scheduleTryApplyWhenReady(iframe) {
    const target = iframe || document.querySelector(IFRAME_SELECTOR);
    if (!target) {
      applyTargetingData();
      return;
    }
    if (applyWhenReadyTimer) clearTimeout(applyWhenReadyTimer);
    applyWhenReadyTimer = setTimeout(() => {
      applyWhenReadyTimer = null;
      tryApplyWhenReady(target);
    }, 50);
  }

  function onPreviewLanguageOrContentChange() {
    clearToolbarHintsObservers();
    resetContainerObserver();
    scheduleTryApplyWhenReady();
  }

  function bindPreviewContainerObserver() {
    const container = document.querySelector('vce-iframes-container');
    if (!container) return;
    if (previewContainerObserved === container && previewContainerObserver) return;

    if (previewContainerObserver) {
      previewContainerObserver.disconnect();
      previewContainerObserver = null;
    }

    previewContainerObserved = container;
    previewContainerObserver = new MutationObserver((mutations) => {
      const contentChanged = mutations.some(
        (mutation) => mutation.type === 'attributes' && mutation.attributeName === 'content'
      );
      if (!contentChanged) return;

      if (previewRebuildApplyTimer) clearTimeout(previewRebuildApplyTimer);
      previewRebuildApplyTimer = setTimeout(() => {
        previewRebuildApplyTimer = null;
        onPreviewLanguageOrContentChange();
      }, 100);
    });

    previewContainerObserver.observe(container, {
      attributes: true,
      attributeFilter: ['content'],
    });
  }

  function attachPreviewIframeLoadListener() {
    const iframe = document.querySelector(IFRAME_SELECTOR);
    if (!iframe) return;

    if (boundPreviewIframe && boundPreviewIframe !== iframe) {
      boundPreviewIframe._gemBtPreviewLoadBound = false;
    }

    if (iframe._gemBtPreviewLoadBound) {
      boundPreviewIframe = iframe;
      return;
    }

    iframe._gemBtPreviewLoadBound = true;
    boundPreviewIframe = iframe;
    iframe.addEventListener('load', () => {
      scheduleTryApplyWhenReady(iframe);
      wireHideOnMobileToolbarListener(iframe.contentDocument || iframe.contentWindow.document);
      setTimeout(refreshPanelAfterPreviewNames, 300);
    });
  }

  function ensureMobileBadge(blockEl) {
    let badge = blockEl.querySelector('.' + MOBILE_BADGE_CLASS);
    if (!badge) {
      badge = blockEl.ownerDocument.createElement('span');
      badge.className = MOBILE_BADGE_CLASS;
      blockEl.appendChild(badge);
    }
    badge.setAttribute('aria-label', MOBILE_BADGE_ARIA_LABEL);
    badge.innerHTML =
      '<span class="gem-bv-mobile-badge-icon" aria-hidden="true">' +
      MOBILE_BADGE_ICON +
      '</span>';
  }

  function removeMobileBadge(blockEl) {
    blockEl.querySelectorAll('.' + MOBILE_BADGE_CLASS).forEach((badge) => badge.remove());
  }

  function findBlockContentTable(blockEl, blockId) {
    if (!blockEl) return null;
    const id = String(blockId || '').trim();
    if (id) {
      const byId = blockEl.querySelector('table[e-block-id="' + CSS.escape(id) + '"]');
      if (byId) return byId;
    }
    return blockEl.querySelector('table.vce-hide-on-mobile') || blockEl.querySelector('table[e-block-id]');
  }

  function disconnectOverlayGeometryObserver(blockEl) {
    if (!blockEl || !blockEl._gemBvGeometryObs) return;
    try {
      blockEl._gemBvGeometryObs.disconnect();
    } catch (_) {}
    blockEl._gemBvGeometryObs = null;
  }

  function syncOverlayLayerGeometry(blockEl, layer, contentTable) {
    if (!blockEl || !layer) return;

    if (!contentTable) {
      layer.style.display = 'none';
      return;
    }

    const blockRect = blockEl.getBoundingClientRect();
    const tableRect = contentTable.getBoundingClientRect();
    if (tableRect.width <= 0 && tableRect.height <= 0) {
      layer.style.display = 'none';
      return;
    }

    layer.style.display = 'block';
    layer.style.top = (tableRect.top - blockRect.top) + 'px';
    layer.style.left = (tableRect.left - blockRect.left) + 'px';
    layer.style.width = Math.max(tableRect.width, 1) + 'px';
    layer.style.height = Math.max(tableRect.height, 1) + 'px';
  }

  function ensureOverlayLayer(blockEl, blockId) {
    let layer = blockEl.querySelector(':scope > .' + OVERLAY_LAYER_CLASS);
    if (!layer) {
      layer = blockEl.ownerDocument.createElement('div');
      layer.className = OVERLAY_LAYER_CLASS;
      layer.setAttribute('aria-hidden', 'true');
      blockEl.appendChild(layer);
    }
    return layer;
  }

  function removeOverlayLayer(blockEl) {
    disconnectOverlayGeometryObserver(blockEl);
    blockEl.querySelectorAll(':scope > .' + OVERLAY_LAYER_CLASS).forEach((layer) => {
      clearOverlayRootAttributes(layer);
      layer.remove();
    });
  }

  function observeOverlayLayerGeometry(blockEl, blockId, layer) {
    disconnectOverlayGeometryObserver(blockEl);
    const contentTable = findBlockContentTable(blockEl, blockId);
    if (!layer || !contentTable || typeof ResizeObserver !== 'function') {
      syncOverlayLayerGeometry(blockEl, layer, contentTable);
      return;
    }

    const sync = () => syncOverlayLayerGeometry(blockEl, layer, contentTable);
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(contentTable);
    observer.observe(blockEl);
    blockEl._gemBvGeometryObs = observer;
  }

  function clearOverlayRootAttributes(el) {
    if (!el) return;
    el.removeAttribute(OVERLAY_ROOT_ATTR);
    el.removeAttribute('data-gem-has-block-targeting');
    el.removeAttribute('data-gem-block-targeting-visibility');
    el.removeAttribute('data-gem-hide-on-mobile');
    el.removeAttribute('data-gem-block-targeting-scroll-highlight');
    removeMobileBadge(el);
  }

  function applyOverlayRootAttributes(overlayEl, { hasTargeting, hasMobileHide, visibility }) {
    overlayEl.setAttribute(OVERLAY_ROOT_ATTR, 'true');

    if (hasTargeting) {
      overlayEl.setAttribute('data-gem-has-block-targeting', 'true');
    } else {
      overlayEl.removeAttribute('data-gem-has-block-targeting');
    }

    const normalizedVisibility = visibility === 'show' || visibility === 'hide' ? visibility : '';
    if (hasTargeting && normalizedVisibility) {
      overlayEl.setAttribute('data-gem-block-targeting-visibility', normalizedVisibility);
    } else {
      overlayEl.removeAttribute('data-gem-block-targeting-visibility');
    }

    if (hasMobileHide) {
      overlayEl.setAttribute('data-gem-hide-on-mobile', 'true');
      ensureMobileBadge(overlayEl);
    } else {
      overlayEl.removeAttribute('data-gem-hide-on-mobile');
      removeMobileBadge(overlayEl);
    }
  }

  function clearVisibilityAttributes(container) {
    container.querySelectorAll('[e-block]').forEach((el) => {
      el.removeAttribute('data-gem-hide-on-mobile');
      el.removeAttribute('data-gem-block-targeting-scroll-highlight');
      removeOverlayLayer(el);
      clearOverlayRootAttributes(el);
    });
    container.querySelectorAll('[' + OVERLAY_ROOT_ATTR + '="true"]').forEach(clearOverlayRootAttributes);
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

    clearVisibilityAttributes(container);

    const blockMap = new Map();
    for (const block of blocks) {
      if (block && block._id != null) {
        blockMap.set(String(block._id), block);
      }
    }

    const eBlocks = container.querySelectorAll('[e-block]');
    let visibilityCount = 0;

    eBlocks.forEach((el) => {
      const blockId = el.getAttribute('e-block-id');
      if (!blockId) return;

      const block = blockMap.get(String(blockId));
      const contentTable = findBlockContentTable(el, blockId);
      const liveMobileHide = !!(contentTable && contentTable.classList.contains('vce-hide-on-mobile'));
      const hasTargeting = !!(block && block.targeting);
      const hasMobileHide = (block && blockHasMobileHide(block)) || liveMobileHide;
      if (!hasTargeting && !hasMobileHide) return;

      const visibility = hasTargeting ? getBlockVisibility(block.targeting) : '';

      if (hasMobileHide) {
        el.setAttribute('data-gem-hide-on-mobile', 'true');
        const layer = ensureOverlayLayer(el, blockId);
        applyOverlayRootAttributes(layer, { hasTargeting, hasMobileHide, visibility });
        observeOverlayLayerGeometry(el, blockId, layer);
      } else {
        applyOverlayRootAttributes(el, { hasTargeting, hasMobileHide, visibility });
      }

      visibilityCount++;
    });

    isApplying = false;

    console.log('[Gem][BlockVisibility] Applied visibility to', visibilityCount, 'of', eBlocks.length, 'blocks.');

    if (visibilityCount > 0) {
      const resyncLayers = () => {
        container.querySelectorAll('[e-block][data-gem-hide-on-mobile="true"]').forEach((blockEl) => {
          const blockId = blockEl.getAttribute('e-block-id');
          const layer = blockEl.querySelector(':scope > .' + OVERLAY_LAYER_CLASS);
          if (!layer || !blockId) return;
          syncOverlayLayerGeometry(blockEl, layer, findBlockContentTable(blockEl, blockId));
        });
      };
      requestAnimationFrame(resyncLayers);
      setTimeout(resyncLayers, 150);
    }

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
      attributeFilter: [
        'data-gem-has-block-targeting',
        'data-gem-block-targeting-visibility',
        'data-gem-hide-on-mobile',
        OVERLAY_ROOT_ATTR,
      ]
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

    if (lang && draftData && draftData.blocksByLanguage && Array.isArray(draftData.blocksByLanguage[lang])) {
      const snapshot = getCachedSnapshot([campaignId, suiteCampaignId]) || lastCampaignSnapshot;
      applyBlocksFromSource(draftData.blocksByLanguage[lang], snapshot, lang);
      return;
    }

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
      const snapshot = getCachedSnapshot(campaignId) || lastCampaignSnapshot;
      if (snapshot) lastCampaignSnapshot = snapshot;
      applyBlocksFromSource(draftBlocks, snapshot, lang);
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

  function findToolbarButtonsByType(buttonType) {
    const selector = '[block-toolbar-button="' + buttonType + '"]';
    const iframeDoc = getIframeDoc();
    if (iframeDoc) {
      const inIframe = iframeDoc.querySelectorAll(selector);
      if (inIframe.length) return inIframe;
    }
    const inMain = document.querySelectorAll(selector);
    if (inMain.length) return inMain;
    return null;
  }

  function findToolbarButtons() {
    return findToolbarButtonsByType(TOOLBAR_BTN_BLOCK_TARGETING);
  }

  function hasToolbarVisibilityButtons() {
    return !!(findToolbarButtonsByType(TOOLBAR_BTN_BLOCK_TARGETING)
      || findToolbarButtonsByType(TOOLBAR_BTN_HIDE_ON_MOBILE));
  }

  function applyFromToolbarHints() {
    console.log('[Gem][BlockTargeting][Debug] applyFromToolbarHints called.');

    const immediate = hasToolbarVisibilityButtons();
    console.log('[Gem][BlockTargeting][Debug] Immediate toolbar visibility buttons found:', immediate);

    if (immediate) {
      scheduleToolbarBuild();
      return;
    }

    if (toolbarHintsUnsub || toolbarHintsIframeObs) return;

    console.log('[Gem][BlockTargeting][Debug] No toolbar buttons yet, setting up MutationObserver.');

    const iframeDoc = getIframeDoc();

    toolbarHintsUnsub = window.gemDomWatchSubscribe(function () {
      if (hasToolbarVisibilityButtons()) {
        scheduleToolbarBuild();
      }
    });

    if (iframeDoc) {
      toolbarHintsIframeObs = new MutationObserver(function () {
        if (hasToolbarVisibilityButtons()) {
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

    const targetingBtns = findToolbarButtonsByType(TOOLBAR_BTN_BLOCK_TARGETING);
    const mobileHideBtns = findToolbarButtonsByType(TOOLBAR_BTN_HIDE_ON_MOBILE);
    console.log('[Gem][BlockTargeting][Debug] buildFromToolbar — targeting buttons:',
      targetingBtns ? targetingBtns.length : 0,
      '| mobile-hide buttons:',
      mobileHideBtns ? mobileHideBtns.length : 0);

    if (!targetingBtns && !mobileHideBtns) return;

    const blockById = new Map();

    if (Array.isArray(lastBlocks)) {
      lastBlocks.forEach((block) => {
        if (block && block._id != null) {
          blockById.set(String(block._id), Object.assign({}, block));
        }
      });
    }

    function ensureSyntheticBlock(blockId) {
      const id = String(blockId);
      if (!blockById.has(id)) blockById.set(id, { _id: id });
      return blockById.get(id);
    }

    if (targetingBtns) {
      targetingBtns.forEach((btn) => {
        const blockId = btn.getAttribute('e-block-id');
        if (!blockId) return;

        const hasTargeting = isToolbarButtonActive(btn);
        console.log('[Gem][BlockTargeting][Debug]   block:', blockId, '| targeting active:', hasTargeting);

        const block = ensureSyntheticBlock(blockId);
        if (hasTargeting) {
          block.targeting = block.targeting || { content: { visibility: '\u2026' } };
        } else {
          delete block.targeting;
        }
      });
    }

    if (mobileHideBtns) {
      mobileHideBtns.forEach((btn) => {
        const blockId = btn.getAttribute('e-block-id');
        if (!blockId) return;

        const hideOnMobile = isToolbarButtonActive(btn);
        console.log('[Gem][BlockVisibility][Debug]   block:', blockId, '| hide on mobile active:', hideOnMobile);

        const block = ensureSyntheticBlock(blockId);
        if (hideOnMobile) {
          block.hide_on_mobile = true;
        } else {
          delete block.hide_on_mobile;
        }
      });
    }

    const mergedBlocks = Array.from(blockById.values());
    const visibilityCount = mergedBlocks.filter((block) => block.targeting || blockHasMobileHide(block)).length;
    console.log('[Gem][BlockTargeting][Debug] Toolbar merge built:', mergedBlocks.length, 'total,', visibilityCount, 'with visibility flags.');

    if (mergedBlocks.length) {
      applyTargeting(mergedBlocks);
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
      onPreviewLanguageOrContentChange();
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
          if (previewEnabled) {
            refreshPreviewSettingsInPreviewIframe();
          }
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
  wireAllHideOnMobileToolbarListeners();

  loadBlockTargetingSettings(() => {
    waitForToolbarButtonSlot();
  });

  attachPreviewIframeLoadListener();
  bindPreviewContainerObserver();
  window.gemDomWatchSubscribe(function () {
    attachPreviewIframeLoadListener();
    bindPreviewContainerObserver();
    wireAllHideOnMobileToolbarListeners();
  });

  if (getCampaignIdFromUrl()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', waitForIframeBlocks);
    } else {
      waitForIframeBlocks();
    }
  }

  window.gemToggleBlockTargetingPreview = function gemToggleBlockTargetingPreview() {
    window.gemSetBlockTargetingPreviewEnabled(!previewEnabled);
  };

  window.gemSetBlockTargetingPreviewEnabled = function gemSetBlockTargetingPreviewEnabled(enabled) {
    const next = enabled !== false;
    if (previewEnabled === next) return;
    previewEnabled = next;
    updateToolbarButtonState();
    refreshPreviewSettingsInPreviewIframe();
    if (next) applyTargetingData();
    try {
      chrome.storage.sync.set({ [STORAGE_PREVIEW_ENABLED]: next });
    } catch (_) {}
  };

  window.gemIsBlockTargetingPreviewEnabled = function gemIsBlockTargetingPreviewEnabled() {
    return previewEnabled;
  };

  window.gemGetTargetedBlocks = function gemGetTargetedBlocks() {
    return getBlockVisibilityBlocksForPanel();
  };

  window.gemGetBlockVisibilityBlocks = function gemGetBlockVisibilityBlocks() {
    return getBlockVisibilityBlocksForPanel();
  };

  window.gemGetBlockTargetingCount = function gemGetBlockTargetingCount() {
    return countVisibilityBlocks(lastBlocks);
  };

  window.gemBlockVisibilityIconSvg = BLOCK_VISIBILITY_ICON_SVG;

  window.gemOnBlockTargetingDataChange = function gemOnBlockTargetingDataChange(callback) {
    if (typeof callback !== 'function') return function () {};
    dataChangeListeners.push(callback);
    try {
      callback({
        blocks: lastBlocks,
        targetedCount: countVisibilityBlocks(lastBlocks),
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

    const wrapper =
      iframeDoc.querySelector('[e-block-id="' + CSS.escape(id) + '"][e-block]') ||
      iframeDoc.querySelector('[e-block-id="' + CSS.escape(id) + '"]');
    if (!wrapper) return false;

    const contentTable = findBlockContentTable(wrapper, id);
    const scrollTarget = contentTable || wrapper;

    try {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (_) {
      scrollTarget.scrollIntoView(true);
    }

    wrapper.setAttribute('data-gem-block-targeting-scroll-highlight', 'true');
    const layer = wrapper.querySelector(':scope > .' + OVERLAY_LAYER_CLASS);
    if (layer) {
      layer.setAttribute('data-gem-block-targeting-scroll-highlight', 'true');
    }

    setTimeout(() => {
      wrapper.removeAttribute('data-gem-block-targeting-scroll-highlight');
      if (layer) {
        layer.removeAttribute('data-gem-block-targeting-scroll-highlight');
      }
    }, 1800);

    return true;
  };

  window.gemFormatBlockTargetingRules = function gemFormatBlockTargetingRules(targeting) {
    return formatTargetingRules(targeting);
  };

  console.log('[Gem][BlockVisibility] Initialized.');
})();
