console.log("[Gem] content-block-toolbar.js loaded");

// Content Block Toolbar management - CSS-only approach
function initializeContentBlockToolbar() {
  console.log("[Gem] Initializing content block toolbar management");

  // Apply initial settings as CSS classes on body
  applyToolbarSettingsAsClasses();

  // Watch for setting changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    // Check if chrome APIs are still available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    // Check if any toolbar settings changed
    const toolbarSettings = [
      'manageOptionalContent',
      'predictRecommendationSettings',
      'productFinder',
      'productSource',
      'saveToReuse',
      'resetBlock',
      'convertEslToTokens',
      'swapKeywords',
      'contentComposer'
    ];

    const hasToolbarChange = toolbarSettings.some(setting =>
      changes.hasOwnProperty(setting)
    );

    if (hasToolbarChange) {
      console.log("[Gem] Toolbar settings changed, reapplying CSS classes");
      applyToolbarSettingsAsClasses();
    }
  });

  // Inject extra toolbar actions when the toolbar appears
  setupToolbarInjectionObserver();

  // Handle double-clicks on editable images in preview iframe
  setupEditableImageDoubleClickHandler();

  // Handle double-clicks on ESL tokens in desktop preview iframe
  setupEslTokenDoubleClickHandler();

  // Handle double-clicks on personalization tokens in desktop preview iframe
  setupPersonalizationTokenDoubleClickHandler();

  // Handle Enter key presses in Image Properties dialog
  setupImagePropertiesEnterKeyHandler();

  // Handle CMD+D / CTRL+D shortcut for toggling desktop/mobile tabs
  setupImagePropertiesTabToggleShortcut();

  setupResetBlockConfirm();
}

function setupResetBlockConfirm() {
  if (document.documentElement.dataset.gemResetBlockConfirmInstalled) return;
  document.documentElement.dataset.gemResetBlockConfirmInstalled = "1";

  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest?.('e-tooltip[e-button-id="clear-block"] .e-btn, e-tooltip[e-button-id="clear-block"] button');
      if (!btn) return;
      if (
        !confirm(
          "Reset this block to its default content? This cannot be undone."
        )
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );
}

function applyToolbarSettingsAsClasses() {
  chrome.storage.sync.get({
    manageOptionalContent: "hide-if-disabled",
    predictRecommendationSettings: "hide-if-disabled",
    productFinder: "always-show",
    productSource: "hide-if-disabled",
    saveToReuse: "always-show",
    resetBlock: "always-show",
    convertEslToTokens: "always-show",
    swapKeywords: "always-show",
    contentComposer: "always-hide"
  }, (settings) => {
    console.log("[Gem] Applying toolbar settings as CSS classes:", settings);

    // Remove all existing toolbar classes
    document.body.classList.forEach(className => {
      if (className.startsWith('gem-toolbar-')) {
        document.body.classList.remove(className);
      }
    });

    // Add classes based on settings
    Object.entries(settings).forEach(([setting, value]) => {
      document.body.classList.add(`gem-toolbar-${setting}-${value}`);
    });
  });
}

// ------------------------------------------------------------
// Convert ESL → Tokens toolbar button
// ------------------------------------------------------------

const GEM_TOOLBAR_SELECTOR = '.toolbar.e-contentblocks-toolbar';
const GEM_TOOLBAR_ACTIONS_SELECTOR = '.toolbar.e-contentblocks-toolbar .e-contentblocks-toolbar__actions';
const GEM_REORDER_BTN_SELECTOR = '[e-button-id="reorder-block"] > .e-btn';
const GEM_TARGET_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe';

const GEM_CONVERT_BTN_ID = 'gem-convert-esl-to-tokens';
const GEM_CONVERT_BTN_CLASS = 'gemConvertESLToTokens';

// Text Swap toolbar button
const GEM_TEXT_SWAP_BTN_ID = 'gem-swap-keywords';
const GEM_TEXT_SWAP_BTN_CLASS = 'gemSwapKeywords';
// Swap configuration is stored on snippets themselves
const GEM_SNIPPETS_STORAGE_KEY = 'gemSnippets';

function gemNormalizeSwapMode(mode) { return mode === 'plain' ? 'plain' : 'token'; }
function gemNormalizeSwapInitiateFrom(v) { return (v === 'panel' || v === 'toolbar') ? v : 'anywhere'; }
function gemNormalizeSwapKeywordsFromSnippet(snippet) {
  if (!snippet) return [];
  if (Array.isArray(snippet.swapKeywords)) {
    const cleaned = snippet.swapKeywords
      .map((k) => ({
        keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
        mode: gemNormalizeSwapMode(k && k.mode),
        initiateFrom: gemNormalizeSwapInitiateFrom(k && k.initiateFrom)
      }))
      .filter((k) => !!k.keyword);
    const seen = new Set();
    const out = [];
    cleaned.forEach((k) => {
      if (seen.has(k.keyword)) return;
      seen.add(k.keyword);
      out.push(k);
    });
    return out;
  }
  const legacyKeyword = (snippet.swapKeyword && typeof snippet.swapKeyword === 'string') ? snippet.swapKeyword.trim() : '';
  if (!legacyKeyword) return [];
  return [{ keyword: legacyKeyword, mode: gemNormalizeSwapMode(snippet.swapMode), initiateFrom: 'anywhere' }];
}

const GEM_ESL_TOKEN_NAME = 'ESL snippet';
// Match ESL variable-ish strings like {{ something }} but avoid curly-quote noise.
const GEM_ESL_REGEX = /\{\{[^”“‘’}]+\}\}/g;
const GEM_ESL_RDS_PREFIX_REGEX = /^\{\{\s*rds\./;
const GEM_ESL_RDS_NAME_REGEX = /\]\.[^\s\|]+/;
const GEM_ESL_CONTACT_NAME_REGEX = /contact\.\d+/;
// Note: GEM_SNIPPETS_STORAGE_KEY is shared between features

let gemToolbarUnsub = null;

// ------------------------------------------------------------
// Debug logging for toolbar icon injection
// ------------------------------------------------------------
const GEM_TOOLBAR_INJECTION_DEBUG = true;
const _gemToolbarInjectionDebugState = new WeakMap();

function gemGetToolbarDebugState(toolbarEl) {
  let state = _gemToolbarInjectionDebugState.get(toolbarEl);
  if (!state) {
    state = { convert: null, swap: null };
    _gemToolbarInjectionDebugState.set(toolbarEl, state);
  }
  return state;
}

function gemLogToolbarInjection(toolbarEl, which, result) {
  if (!GEM_TOOLBAR_INJECTION_DEBUG) return;
  if (!toolbarEl) return;

  const safeResult = (result && typeof result === 'object') ? result : { status: 'skipped', reason: 'no-result' };
  const state = gemGetToolbarDebugState(toolbarEl);
  const sig = `${safeResult.status}|${safeResult.reason || ''}|${safeResult.blockId || ''}|${safeResult.blockPosition || ''}|${safeResult.blockTemplateName || ''}`;
  if (state[which] === sig) return;
  state[which] = sig;

  const label = which === 'convert' ? 'Convert ESL → Tokens' : 'Swap Keywords';
  const ctx = {
    status: safeResult.status,
    reason: safeResult.reason || '',
    blockId: safeResult.blockId || '',
    blockPosition: safeResult.blockPosition || '',
    blockTemplateName: safeResult.blockTemplateName || ''
  };

  if (safeResult.status === 'added') {
    console.log(`[Gem][Toolbar] ${label}: ADDED`, ctx);
  } else {
    console.log(`[Gem][Toolbar] ${label}: SKIPPED`, ctx);
  }
}

function setupToolbarInjectionObserver() {
  if (gemToolbarUnsub) return;

  const injectIfPresent = () => {
    const toolbar = document.querySelector(GEM_TOOLBAR_SELECTOR);
    if (!toolbar) return;
    const convertResult = injectConvertButtonIntoToolbar(toolbar);
    const swapResult = injectTextSwapButtonIntoToolbar(toolbar);
    gemLogToolbarInjection(toolbar, 'convert', convertResult);
    gemLogToolbarInjection(toolbar, 'swap', swapResult);
  };

  gemToolbarUnsub = window.gemDomWatchSubscribe(function () {
    injectIfPresent();
  });

  // Also try once immediately
  injectIfPresent();
}

function injectConvertButtonIntoToolbar(toolbarEl) {
  const actions = toolbarEl.querySelector(GEM_TOOLBAR_ACTIONS_SELECTOR);
  if (!actions) return { status: 'skipped', reason: 'no-actions-container' };

  const reorderBtn = toolbarEl.querySelector(GEM_REORDER_BTN_SELECTOR);
  if (!reorderBtn) return { status: 'skipped', reason: 'no-reorder-button' };

  const eBlockId = reorderBtn.getAttribute('e-block-id') || '';
  const blockTemplateName = reorderBtn.getAttribute('blocktemplatename') || '';
  const blockPosition = reorderBtn.getAttribute('blockposition') || '';

  // Avoid duplicates per toolbar instance
  const existingBtn = actions.querySelector(`[block-toolbar-button="${GEM_CONVERT_BTN_ID}"]`);
  if (existingBtn) {
    if (eBlockId) existingBtn.setAttribute('e-block-id', eBlockId);
    else existingBtn.removeAttribute('e-block-id');
    if (blockTemplateName) existingBtn.setAttribute('blocktemplatename', blockTemplateName);
    else existingBtn.removeAttribute('blocktemplatename');
    if (blockPosition) existingBtn.setAttribute('blockposition', blockPosition);
    else existingBtn.removeAttribute('blockposition');
    return {
      status: 'skipped',
      reason: 'already-present',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }

  // Only show this action if the target block contains contenteditable areas.
  // The toolbar is per-block and appears/disappears on hover, so we can gate injection here.
  if (eBlockId && !blockHasEditableInPreviewIframe(eBlockId)) {
    return {
      status: 'skipped',
      reason: 'no-editable-in-preview-iframe',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }

  const tooltip = document.createElement('e-tooltip');
  tooltip.setAttribute('content', 'Convert ESL to Tokens');
  tooltip.setAttribute('e-button-id', GEM_CONVERT_BTN_ID);
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-description', 'Convert ESL to Tokens');

  // Inner button (matches Emarsys structure closely)
  const btn = document.createElement('div');
  btn.className = `e-btn e-btn-onlyicon e-btn-on_overlay e-svgclickfix ${GEM_CONVERT_BTN_CLASS}`;
  btn.setAttribute('block-toolbar-button', GEM_CONVERT_BTN_ID);
  if (eBlockId) btn.setAttribute('e-block-id', eBlockId);
  if (blockTemplateName) btn.setAttribute('blocktemplatename', blockTemplateName);
  if (blockPosition) btn.setAttribute('blockposition', blockPosition);

  btn.innerHTML = `
    <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon">&#xF199;</div>
      </div>
    </gem-e-icon>
  `.trim();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const id = btn.getAttribute('e-block-id');
    if (!id) return;
    convertEslToTokensForBlock(id);
  });

  tooltip.appendChild(btn);
  // Insert as the second child (index 1). If there is no second child, append.
  const secondChild = actions.children && actions.children.length > 1 ? actions.children[1] : null;
  if (secondChild) {
    actions.insertBefore(tooltip, secondChild);
  } else {
    actions.appendChild(tooltip);
  }

  const inserted = !!actions.querySelector(`[block-toolbar-button="${GEM_CONVERT_BTN_ID}"]`);
  return {
    status: inserted ? 'added' : 'skipped',
    reason: inserted ? '' : 'insert-failed',
    blockId: eBlockId,
    blockTemplateName,
    blockPosition
  };
}

function injectTextSwapButtonIntoToolbar(toolbarEl) {
  // Assign a short stable ID to this toolbar element so we can track it across calls.
  if (!toolbarEl._gemDbgId) toolbarEl._gemDbgId = Math.random().toString(36).slice(2, 7);
  const tid = toolbarEl._gemDbgId;

  const actions = toolbarEl.querySelector(GEM_TOOLBAR_ACTIONS_SELECTOR);
  if (!actions) {
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ no actions container (selector: ${GEM_TOOLBAR_ACTIONS_SELECTOR})`);
    return { status: 'skipped', reason: 'no-actions-container' };
  }

  const reorderBtn = toolbarEl.querySelector(GEM_REORDER_BTN_SELECTOR);
  if (!reorderBtn) {
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ no reorder button (selector: ${GEM_REORDER_BTN_SELECTOR})`);
    return { status: 'skipped', reason: 'no-reorder-button' };
  }

  const eBlockId = reorderBtn.getAttribute('e-block-id') || '';
  const blockTemplateName = reorderBtn.getAttribute('blocktemplatename') || '';
  const blockPosition = reorderBtn.getAttribute('blockposition') || '';

  console.debug(`[Gem][SwapDebug] toolbar#${tid}: inject called — blockId="${eBlockId}", inDoc=${toolbarEl.isConnected}, checked=${!!actions._gemSwapKeywordChecked}, hasAny=${actions._gemSwapKeywordHasAny}`);

  // Respect settings: allow user to always hide this icon
  if (document.body.classList.contains('gem-toolbar-swapKeywords-always-hide')) {
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ skipped — always-hide-setting`);
    return { status: 'skipped', reason: 'always-hide-setting' };
  }

  // Avoid duplicates per toolbar instance
  const existingBtn = actions.querySelector(`[block-toolbar-button="${GEM_TEXT_SWAP_BTN_ID}"]`);
  if (existingBtn) {
    if (eBlockId) existingBtn.setAttribute('e-block-id', eBlockId);
    else existingBtn.removeAttribute('e-block-id');
    if (blockTemplateName) existingBtn.setAttribute('blocktemplatename', blockTemplateName);
    else existingBtn.removeAttribute('blocktemplatename');
    if (blockPosition) existingBtn.setAttribute('blockposition', blockPosition);
    else existingBtn.removeAttribute('blockposition');
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: already-present, attrs updated`);
    return {
      status: 'skipped',
      reason: 'already-present',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }

  // Only show this action if the target block contains contenteditable areas.
  if (eBlockId && !blockHasEditableInPreviewIframe(eBlockId)) {
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ skipped — blockHasEditableInPreviewIframe returned false for "${eBlockId}"`);
    return {
      status: 'skipped',
      reason: 'no-editable-in-preview-iframe',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }

  // Only show this action if the user has at least one snippet with a swap keyword configured.
  // This requires an async storage read; gate injection with a one-time async check per toolbar instance.
  if (!actions._gemSwapKeywordChecked) {
    actions._gemSwapKeywordChecked = true;
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: starting async hasAnySwapKeywordConfigured (blockId="${eBlockId}")`);
    hasAnySwapKeywordConfigured((hasAny) => {
      actions._gemSwapKeywordHasAny = !!hasAny;
      const stillInDoc = toolbarEl.isConnected;
      console.debug(`[Gem][SwapDebug] toolbar#${tid}: async resolved → hasAny=${hasAny}, stillInDoc=${stillInDoc} (blockId="${eBlockId}")`);
      if (!hasAny) {
        console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ no swap keywords configured — button will not be shown`);
        gemLogToolbarInjection(toolbarEl, 'swap', {
          status: 'skipped',
          reason: 'no-swap-keywords-configured',
          blockId: eBlockId,
          blockTemplateName,
          blockPosition
        });
        return;
      }
      // Toolbar might already be gone by the time storage returns.
      if (!stillInDoc) {
        console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ toolbar detached before async completed — skipping inject`);
        gemLogToolbarInjection(toolbarEl, 'swap', {
          status: 'skipped',
          reason: 'toolbar-detached-before-async',
          blockId: eBlockId,
          blockTemplateName,
          blockPosition
        });
        return;
      }
      console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✓ async passed — calling inject again to place button`);
      injectTextSwapButtonIntoToolbar(toolbarEl);
    });
    return {
      status: 'skipped',
      reason: 'async-check-started',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }
  if (actions._gemSwapKeywordHasAny === false) {
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✗ skipped — no-swap-keywords-configured (cached)`);
    return {
      status: 'skipped',
      reason: 'no-swap-keywords-configured',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }

  const tooltip = document.createElement('e-tooltip');
  tooltip.setAttribute('content', 'Swap Keywords');
  tooltip.setAttribute('e-button-id', GEM_TEXT_SWAP_BTN_ID);
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-description', 'Swap Keywords');

  const btn = document.createElement('div');
  btn.className = `e-btn e-btn-onlyicon e-btn-on_overlay e-svgclickfix ${GEM_TEXT_SWAP_BTN_CLASS}`;
  btn.setAttribute('block-toolbar-button', GEM_TEXT_SWAP_BTN_ID);
  if (eBlockId) btn.setAttribute('e-block-id', eBlockId);
  if (blockTemplateName) btn.setAttribute('blocktemplatename', blockTemplateName);
  if (blockPosition) btn.setAttribute('blockposition', blockPosition);

  // Icon font glyph (U+F0DE)
  btn.innerHTML = `
    <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon">&#xF0DE;</div>
      </div>
    </gem-e-icon>
  `.trim();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const id = btn.getAttribute('e-block-id');
    if (!id) return;
    applyTextSwapForBlock(id);
  });

  tooltip.appendChild(btn);

  console.debug(`[Gem][SwapDebug] toolbar#${tid}: ✓ all checks passed — inserting button for blockId="${eBlockId}"`);

  // Insert right after the token converter icon (if present). Otherwise, fall back to being after the first icon.
  const convertBtn = actions.querySelector(`[block-toolbar-button="${GEM_CONVERT_BTN_ID}"]`);
  const convertTooltip = convertBtn && convertBtn.closest && convertBtn.closest('e-tooltip');
  if (convertTooltip && convertTooltip.parentElement === actions) {
    convertTooltip.insertAdjacentElement('afterend', tooltip);
    const inserted = !!actions.querySelector(`[block-toolbar-button="${GEM_TEXT_SWAP_BTN_ID}"]`);
    console.debug(`[Gem][SwapDebug] toolbar#${tid}: inserted=${inserted} (after convertBtn)`);
    return {
      status: inserted ? 'added' : 'skipped',
      reason: inserted ? '' : 'insert-failed',
      blockId: eBlockId,
      blockTemplateName,
      blockPosition
    };
  }

  // Fallback: try to be the third child (index 2). If there isn't one, append.
  const thirdChild = actions.children && actions.children.length > 2 ? actions.children[2] : null;
  if (thirdChild) {
    actions.insertBefore(tooltip, thirdChild);
  } else {
    actions.appendChild(tooltip);
  }

  const inserted = !!actions.querySelector(`[block-toolbar-button="${GEM_TEXT_SWAP_BTN_ID}"]`);
  console.debug(`[Gem][SwapDebug] toolbar#${tid}: inserted=${inserted} (fallback position)`);
  return {
    status: inserted ? 'added' : 'skipped',
    reason: inserted ? '' : 'insert-failed',
    blockId: eBlockId,
    blockTemplateName,
    blockPosition
  };
}

function blockHasEditableInPreviewIframe(eBlockId) {
  const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
  if (!iframe) {
    console.debug(`[Gem][SwapDebug] blockHasEditable("${eBlockId}"): ✗ no iframe matched selector "${GEM_TARGET_IFRAME_SELECTOR}"`);
    return false;
  }

  let doc;
  try {
    doc = iframe.contentDocument || iframe.contentWindow?.document;
  } catch (e) {
    console.debug(`[Gem][SwapDebug] blockHasEditable("${eBlockId}"): ✗ cross-origin error accessing iframe.contentDocument`, e);
    return false;
  }
  if (!doc) {
    console.debug(`[Gem][SwapDebug] blockHasEditable("${eBlockId}"): ✗ iframe.contentDocument is null/undefined`);
    return false;
  }

  try {
    const blockEls = Array.from(doc.querySelectorAll(`[e-block-id="${CSS.escape(eBlockId)}"]`));
    if (!blockEls.length) {
      console.debug(`[Gem][SwapDebug] blockHasEditable("${eBlockId}"): block not in iframe → returning TRUE (allow)`);
      return true;
    }

    const diagnostics = blockEls.map((block, idx) => {
      if (!block || block.nodeType !== Node.ELEMENT_NODE) return { idx, editable: false, reason: 'not-element-node' };
      const selfCE    = !!(block.matches && block.matches('[contenteditable="true"]'));
      const selfEE    = !!(block.matches && block.matches('[e-editable]'));
      const childCE   = !!(block.querySelector && block.querySelector('[contenteditable="true"]'));
      const childEE   = !!(block.querySelector && block.querySelector('[e-editable]'));
      return { idx, editable: selfCE || selfEE || childCE || childEE, selfCE, selfEE, childCE, childEE };
    });

    const result = diagnostics.some((d) => d.editable);
    console.debug(
      `[Gem][SwapDebug] blockHasEditable("${eBlockId}"): found ${blockEls.length} block(s), editable=${result}`,
      diagnostics
    );
    return result;
  } catch (e) {
    console.debug(`[Gem][SwapDebug] blockHasEditable("${eBlockId}"): ✗ querySelectorAll threw`, e);
    return false;
  }
}

function getEditableElementsForBlockEl(blockEl) {
  if (!blockEl || blockEl.nodeType !== Node.ELEMENT_NODE) return [];
  const out = [];
  const seen = new Set();
  const add = (el) => {
    if (!el || seen.has(el)) return;
    if (el.tagName === 'IMG') return;
    seen.add(el);
    out.push(el);
  };
  if (blockEl.matches && blockEl.matches('[contenteditable="true"]')) {
    add(blockEl);
  }
  if (blockEl.matches && blockEl.matches('[e-editable]')) {
    add(blockEl);
  }
  if (blockEl.querySelectorAll) {
    Array.from(blockEl.querySelectorAll('[contenteditable="true"]')).forEach(add);
    Array.from(blockEl.querySelectorAll('[e-editable]')).forEach(add);
  }
  return out;
}

function hasAnySwapKeywordConfigured(callback) {
  getSavedSnippets((snippets) => {
    const list = Array.isArray(snippets) ? snippets : [];
    const hasAny = list.some((s) => gemNormalizeSwapKeywordsFromSnippet(s).length > 0);
    callback(hasAny);
  });
}

function applyTextSwapForBlock(eBlockId) {
  // Load snippets and derive swap rules from snippet.swapKeywords (case-sensitive matching).
  getSavedSnippets((snippets) => {
    const list = Array.isArray(snippets) ? snippets : [];

    // Build rules from all snippets/keywords. Keywords are unique across snippets (case-sensitive),
    // but keep first defensively.
    const rules = [];
    const seenKeyword = new Set();
    list.forEach((s) => {
      gemNormalizeSwapKeywordsFromSnippet(s).forEach((k) => {
        if (!k.keyword) return;
        // Block Toolbar initiated: skip "Snippets Panel Only" rules
        if (k.initiateFrom === 'panel') return;
        if (seenKeyword.has(k.keyword)) return;
        seenKeyword.add(k.keyword);
        rules.push({
          keyword: k.keyword,
          mode: k.mode,
          snippet: s
        });
      });
    });

    if (rules.length === 0) return;

    // Prefer longer keywords to avoid partial matches eating longer ones
    rules.sort((a, b) => b.keyword.length - a.keyword.length);

    const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
    if (!iframe) return;

    let doc;
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document;
    } catch (e) {
      return;
    }
    if (!doc) return;

    const blockEls = Array.from(doc.querySelectorAll(`[e-block-id="${CSS.escape(eBlockId)}"]`));
    if (!blockEls.length) return;

    // No programmatic priming: the block toolbar only appears after the user
    // hovers the content block, which is already Emarsys's wake path for it.

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
    const touchedEditables = new Set();
    const processedEditables = new Set();

    blockEls.forEach((blockEl) => {
      const editables = getEditableElementsForBlockEl(blockEl);
      editables.forEach((editable) => {
        if (!editable || processedEditables.has(editable)) return;
        processedEditables.add(editable);

        const walker = doc.createTreeWalker(
          editable,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
              const text = node.nodeValue;
              const hasAny = rules.some((r) => {
                return text.indexOf(r.keyword) !== -1;
              });
              if (!hasAny) return NodeFilter.FILTER_REJECT;
              if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);

        nodes.forEach((textNode) => {
          const text = textNode.nodeValue;

          const frag = doc.createDocumentFragment();
          const matches = [];

          // Collect all matches for all rules
          rules.forEach((rule) => {
            const hay = text;
            const needle = rule.keyword;
            let from = 0;
            while (true) {
              const idx = hay.indexOf(needle, from);
              if (idx === -1) break;
              matches.push({
                start: idx,
                end: idx + rule.keyword.length,
                rule
              });
              from = idx + rule.keyword.length;
            }
          });

          if (matches.length === 0) return;

          // Sort by start asc, then longest match first to resolve overlaps
          matches.sort((a, b) => (a.start - b.start) || ((b.end - b.start) - (a.end - a.start)));

          let cursor = 0;
          matches.forEach((m) => {
            if (m.start < cursor) return; // overlap, skip
            const { rule } = m;
            const snippet = rule.snippet;
            if (!snippet || typeof snippet.content !== 'string') return;

            // text before
            if (m.start > cursor) {
              frag.appendChild(doc.createTextNode(text.slice(cursor, m.start)));
            }

            if (rule.mode === 'token') {
              frag.appendChild(createEslTokenSpan(doc, snippet.name || GEM_ESL_TOKEN_NAME, snippet.content));
            } else {
              frag.appendChild(doc.createTextNode(snippet.content));
            }

            didChange = true;
            swapCount += 1;
            touchedEditables.add(editable);
            cursor = m.end;
          });

          // trailing text
          if (cursor < text.length) {
            frag.appendChild(doc.createTextNode(text.slice(cursor)));
          }

          if (didChange && textNode.parentNode) {
            textNode.parentNode.replaceChild(frag, textNode);
          }
        });

        if (didChange) {
          editable.dispatchEvent(new Event('input', { bubbles: true }));
          editable.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    if (didChange) {
      // Match 14.0.0: light dirty nudge only. Do NOT call markEmailBodyDirty —
      // its surgical container rewrite rebuilds the preview iframe and jumps
      // scroll back to the top.
      markEmarsysDraftDirty(doc, Array.from(touchedEditables));
      nudgeEmarsysDirtyDetectionViaFocus(doc, Array.from(touchedEditables));
    }

    // Toast feedback (global helper defined in snippets-tab.js; no-op if missing)
    const msg =
      swapCount > 0
        ? `Swapped ${swapCount} keyword${swapCount === 1 ? '' : 's'}.`
        : 'No keywords swapped.';
    try {
      window.gemShowToast && window.gemShowToast(msg, { type: swapCount > 0 ? 'success' : 'info' });
    } catch (_) {}
  });
}

function escapeTokenContentForAttribute(value) {
  // Must match snippets-tab.js "escapeHtmlAttribute" behavior used for token-content.
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
  span.style.backgroundColor = '#6597cf';
  span.style.borderRadius = '.3em';
  span.style.boxShadow = '0 0 0 0.2em #6597cf';
  span.style.color = '#fff';
  span.textContent = name;
  return span;
}

function getSavedSnippets(callback) {
  try {
    if (typeof window.gemLoadSnippets === 'function') {
      window.gemLoadSnippets((snippets) => callback(Array.isArray(snippets) ? snippets : []));
      return;
    }
    chrome.storage.sync.get({ [GEM_SNIPPETS_STORAGE_KEY]: [] }, (result) => {
      const snippets = result && result[GEM_SNIPPETS_STORAGE_KEY];
      callback(Array.isArray(snippets) ? snippets : []);
    });
  } catch (e) {
    callback([]);
  }
}

function deriveTokenNameFromMatch(raw, savedSnippets = []) {
  const s = String(raw || '');

  // Step 1 (new): match against user's saved snippets by exact code match
  // Use the first match's snippet name.
  if (Array.isArray(savedSnippets) && savedSnippets.length) {
    const found = savedSnippets.find((snip) => {
      if (!snip) return false;
      const code = typeof snip.content === 'string' ? snip.content : '';
      return code === s;
    });
    if (found && typeof found.name === 'string' && found.name.trim()) {
      return found.name.trim();
    }
  }

  // If starts with {{ rds.
  if (GEM_ESL_RDS_PREFIX_REGEX.test(s)) {
    const m = s.match(GEM_ESL_RDS_NAME_REGEX);
    if (m && m[0]) {
      // Strip leading "]."
      return m[0].startsWith('].') ? m[0].slice(2) : m[0];
    }
    return GEM_ESL_TOKEN_NAME;
  }

  // Else, if contains contact.<digits>
  const c = s.match(GEM_ESL_CONTACT_NAME_REGEX);
  if (c && c[0]) return c[0];

  return GEM_ESL_TOKEN_NAME;
}

function convertEslToTokensForBlock(eBlockId) {
  getSavedSnippets((savedSnippets) => {
    const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
    if (!iframe) return;

    let doc;
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document;
    } catch (e) {
      return;
    }
    if (!doc) return;

    const blockEls = Array.from(doc.querySelectorAll(`[e-block-id="${CSS.escape(eBlockId)}"]`));
    if (!blockEls.length) return;

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
  const touchedEditables = new Set();
  const processedEditables = new Set();

    blockEls.forEach((blockEl) => {
      const editables = getEditableElementsForBlockEl(blockEl);
      editables.forEach((editable) => {
        if (!editable || processedEditables.has(editable)) return;
        processedEditables.add(editable);

        const walker = doc.createTreeWalker(
          editable,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
              // reset regex state due to global flag usage
              GEM_ESL_REGEX.lastIndex = 0;
              if (!GEM_ESL_REGEX.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
              GEM_ESL_REGEX.lastIndex = 0;
              if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);

        nodes.forEach((textNode) => {
          const text = textNode.nodeValue;
          GEM_ESL_REGEX.lastIndex = 0;

          const frag = doc.createDocumentFragment();
          let lastIdx = 0;
          let match;

          while ((match = GEM_ESL_REGEX.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            // text before
            if (start > lastIdx) {
              frag.appendChild(doc.createTextNode(text.slice(lastIdx, start)));
            }

            // token
            frag.appendChild(createEslTokenSpan(doc, deriveTokenNameFromMatch(match[0], savedSnippets), match[0]));
            didChange = true;
            touchedEditables.add(editable);

            lastIdx = end;
          }

          // trailing text
          if (lastIdx < text.length) {
            frag.appendChild(doc.createTextNode(text.slice(lastIdx)));
          }

          if (textNode.parentNode) {
            textNode.parentNode.replaceChild(frag, textNode);
          }
        });

        if (didChange) {
          // Notify editor (basic)
          editable.dispatchEvent(new Event('input', { bubbles: true }));
          editable.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // Ensure Emarsys recognizes the draft as modified (dirty)
    if (didChange) {
      markEmarsysDraftDirty(doc, Array.from(touchedEditables));
      // Emarsys appears to only detect dirty state after the user "enters" the block (focus/click).
      // Nudge the edited block through a lightweight focus + click path so the draft becomes dirty
      // without requiring manual user interaction.
      nudgeEmarsysDirtyDetectionViaFocus(doc, Array.from(touchedEditables));
    }
  });
}

function findTinyMCEEditorForElement(doc, el) {
  try {
    const wins = [];
    try {
      if (doc && doc.defaultView) wins.push(doc.defaultView);
    } catch (_) {}
    try {
      wins.push(window);
    } catch (_) {}
    try {
      if (doc && doc.defaultView && doc.defaultView.parent) wins.push(doc.defaultView.parent);
    } catch (_) {}
    try {
      if (doc && doc.defaultView && doc.defaultView.top) wins.push(doc.defaultView.top);
    } catch (_) {}

    let tm = null;
    for (const win of wins) {
      try {
        if (win && (win.tinymce || win.tinyMCE)) {
          tm = win.tinymce || win.tinyMCE;
          break;
        }
      } catch (_) {}
    }
    if (!tm) return null;

    if (el && Array.isArray(tm.editors)) {
      for (const editor of tm.editors) {
        if (!editor) continue;
        try {
          const target = editor.targetElm;
          if (target && (target === el || target.contains(el) || el.contains(target))) {
            return editor;
          }
          const body = editor.getBody && editor.getBody();
          if (body && (body === el || body.contains(el) || el.contains(body))) {
            return editor;
          }
        } catch (_) {}
      }
      // Fall through: editor may be keyed by element id (mce_0) even if targetElm differs.
      try {
        const id = el && el.id;
        if (id && typeof tm.get === 'function') {
          const byId = tm.get(id);
          if (byId) return byId;
        }
      } catch (_) {}
      return null;
    }

    return tm.activeEditor || (Array.isArray(tm.editors) ? tm.editors[0] : null) || null;
  } catch (_) {
    return null;
  }
}

function markEmarsysDraftDirty(doc, editables = []) {
  // 1) Dispatch richer input-ish events from the edited nodes
  editables.forEach((el) => {
    try {
      // InputEvent is often what editors hook for dirty tracking.
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: '' }));
    } catch (_) {
      // ignore if InputEvent constructor isn't available
    }
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('keyup', { bubbles: true }));
    } catch (_) {}
  });

  // 2) If TinyMCE is present in the iframe, explicitly mark dirty + fire change
  try {
    const editor = findTinyMCEEditorForElement(doc, editables && editables[0]);
    if (editor) {
      if (typeof editor.setDirty === 'function') editor.setDirty(true);
      if (editor.undoManager && typeof editor.undoManager.add === 'function') editor.undoManager.add();
      if (typeof editor.fire === 'function') editor.fire('change');
    }
  } catch (_) {}

  // 3) Also bubble an input event off the document body as a last-resort signal
  try {
    if (doc.body) doc.body.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_) {}
}

function nudgeEmarsysDirtyDetectionViaFocus(doc, editables = []) {
  const target = editables && editables.find((el) => el && typeof el.focus === 'function');
  if (!target) {
    try {
      console.log('[Gem][DraftDirty]', 'nudge:skip-no-target', { count: (editables || []).length });
    } catch (_) {}
    return;
  }

  const win = doc.defaultView || window;
  const delay = (ms, fn) => {
    try {
      (win.setTimeout || setTimeout)(fn, ms);
    } catch (_) {
      setTimeout(fn, ms);
    }
  };

  const isAlreadyInField = () => {
    try {
      const ae = doc.activeElement;
      if (ae === target) return true;
      if (ae && target.contains && target.contains(ae)) return true;
      if (target.classList && target.classList.contains('mce-edit-focus')) return true;
    } catch (_) {}
    return false;
  };

  const parkFocusOutside = (reason) => {
    try {
      console.log('[Gem][DraftDirty]', 'nudge:park-outside', { reason: reason || null });
    } catch (_) {}
    try {
      if (typeof FocusEvent === 'function') {
        target.dispatchEvent(
          new FocusEvent('focusout', { bubbles: true, cancelable: false, relatedTarget: null })
        );
        target.dispatchEvent(
          new FocusEvent('blur', { bubbles: false, cancelable: false, relatedTarget: null })
        );
      } else {
        target.dispatchEvent(new Event('focusout', { bubbles: true }));
        target.dispatchEvent(new Event('blur'));
      }
    } catch (_) {}
    try {
      target.blur();
    } catch (_) {}
    try {
      if (doc.body) {
        if (!doc.body.hasAttribute('tabindex')) doc.body.setAttribute('tabindex', '-1');
        try {
          doc.body.focus({ preventScroll: true });
        } catch (_) {
          doc.body.focus();
        }
      }
    } catch (_) {}
  };

  // Emarsys enables Save after a real enter then leave. If TinyMCE is already
  // focused (token context menu path), a no-op re-focus + blur does not unlock Save.
  const runEnterLeave = (opts = {}) => {
    const restoreFocusEl = opts.restoreFocusEl || null;
    const coldStart = !!opts.coldStart;

    try {
      console.log('[Gem][DraftDirty]', 'nudge:enter', {
        coldStart,
        targetTag: (target.tagName || '').toLowerCase(),
        targetId: target.id || null,
        eEditable: target.getAttribute?.('e-editable'),
        contentEditable: target.getAttribute?.('contenteditable'),
        activeTag: doc.activeElement && doc.activeElement.tagName
          ? doc.activeElement.tagName.toLowerCase()
          : null,
        saveBefore: (() => {
          const btn = document.querySelector('cb-draft-save-button button');
          return btn ? { disabled: !!btn.disabled } : null;
        })(),
      });
    } catch (_) {}

    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      try {
        target.focus();
      } catch (_) {}
    }

    try {
      const sel = doc.getSelection && doc.getSelection();
      if (sel && typeof sel.removeAllRanges === 'function' && typeof sel.addRange === 'function') {
        const range = doc.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        try {
          doc.dispatchEvent(new Event('selectionchange', { bubbles: true }));
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const mkPointer = (type) => {
        if (typeof PointerEvent === 'function') {
          return new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            view: win,
            pointerType: 'mouse',
          });
        }
        return new MouseEvent(type, { bubbles: true, cancelable: true, view: win });
      };
      const mkMouse = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, view: win });

      target.dispatchEvent(mkPointer('pointerdown'));
      target.dispatchEvent(mkMouse('mousedown'));
      target.dispatchEvent(mkMouse('mouseup'));
      target.dispatchEvent(mkMouse('click'));
    } catch (_) {}

    delay(0, () => {
      try {
        console.log('[Gem][DraftDirty]', 'nudge:blur-tick', {
          activeTag: doc.activeElement && doc.activeElement.tagName
            ? doc.activeElement.tagName.toLowerCase()
            : null,
          activeIsTarget: doc.activeElement === target,
          coldStart,
        });
      } catch (_) {}

      try {
        if (typeof FocusEvent === 'function') {
          target.dispatchEvent(
            new FocusEvent('focusout', { bubbles: true, cancelable: false, relatedTarget: null })
          );
          target.dispatchEvent(
            new FocusEvent('blur', { bubbles: false, cancelable: false, relatedTarget: null })
          );
        } else {
          target.dispatchEvent(new Event('focusout', { bubbles: true }));
          target.dispatchEvent(new Event('blur'));
        }
      } catch (_) {}
      try {
        target.blur();
      } catch (_) {}

      if (restoreFocusEl && restoreFocusEl !== target && typeof restoreFocusEl.focus === 'function') {
        try {
          restoreFocusEl.focus({ preventScroll: true });
        } catch (_) {
          try {
            restoreFocusEl.focus();
          } catch (_) {}
        }
      } else {
        parkFocusOutside('after-leave');
      }

      try {
        if (typeof window.gemProbeDraftSaveState === 'function') {
          window.gemProbeDraftSaveState('nudge:after-blur', { coldStart });
        }
      } catch (_) {}
    });
  };

  if (isAlreadyInField()) {
    try {
      console.log('[Gem][DraftDirty]', 'nudge:force-cold-start', {
        targetTag: (target.tagName || '').toLowerCase(),
        targetId: target.id || null,
        activeTag: doc.activeElement && doc.activeElement.tagName
          ? doc.activeElement.tagName.toLowerCase()
          : null,
        hasMceEditFocus: !!(target.classList && target.classList.contains('mce-edit-focus')),
      });
    } catch (_) {}
    parkFocusOutside('cold-start');
    // Give Emarsys a beat to leave edit mode before a fresh enter+leave.
    delay(20, () => runEnterLeave({ coldStart: true, restoreFocusEl: null }));
    return;
  }

  const prevActive = doc.activeElement;
  runEnterLeave({
    coldStart: false,
    restoreFocusEl: prevActive && prevActive !== target ? prevActive : null,
  });
}

function markEmarsysTextControlDirty(el) {
  if (!el) return;
  const doc = el.ownerDocument || document;
  try {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: '' }));
  } catch (_) {}
  try {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
  } catch (_) {}
  try {
    const host = el.closest(
      'cb-preheader, cb-personalizable-input-with-context, vce-codemirror, vce-html-editor, vce-code-editor'
    );
    if (host && host !== el) {
      host.dispatchEvent(new Event('input', { bubbles: true }));
      host.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (_) {}
  try {
    if (doc.body && doc.body !== el) {
      doc.body.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (_) {}
}

// Gated by debug-logging-gate.js when "Enable debug logging" is off.
const GEM_DRAFT_DIRTY_LOG = '[Gem][DraftDirty]';

function gemProbeDraftSaveState(label, extra) {
  const btn = document.querySelector('cb-draft-save-button button');
  const gemBtn = document.querySelector('gem-cb-draft-save-button button');
  const info = {
    label: String(label || ''),
    t: Date.now(),
    emarsysSave: btn
      ? { disabled: !!btn.disabled, hasDisabledAttr: btn.hasAttribute('disabled') }
      : null,
    gemSave: gemBtn
      ? { disabled: !!gemBtn.disabled, hasDisabledAttr: gemBtn.hasAttribute('disabled') }
      : null,
  };
  if (extra && typeof extra === 'object') Object.assign(info, extra);
  try {
    console.log(GEM_DRAFT_DIRTY_LOG, info);
  } catch (_) {}
  return info;
}

function gemScheduleDraftSaveProbes(baseLabel, delaysMs) {
  const delays = Array.isArray(delaysMs) && delaysMs.length
    ? delaysMs
    : [0, 50, 120, 280, 400, 600, 900, 1300];
  delays.forEach((ms) => {
    setTimeout(() => {
      gemProbeDraftSaveState(`${baseLabel}+${ms}ms`);
    }, ms);
  });
}

window.gemFindTinyMCEEditorForElement = findTinyMCEEditorForElement;
window.gemMarkEmarsysDraftDirty = markEmarsysDraftDirty;
window.gemMarkEmarsysTextControlDirty = markEmarsysTextControlDirty;
window.gemNudgeEmarsysDirtyDetectionViaFocus = nudgeEmarsysDirtyDetectionViaFocus;
window.gemProbeDraftSaveState = gemProbeDraftSaveState;
window.gemScheduleDraftSaveProbes = gemScheduleDraftSaveProbes;

function setupEditableImageDoubleClickHandler() {
  console.log("[Gem] Setting up editable image double-click handler");

  // Function to handle double-clicks on editable images within the preview iframe
  function handleImageDoubleClick(event) {
    const target = event.target;

    // Check if the target is an image with [e-editable] attribute
    if (target.tagName === 'IMG' && target.hasAttribute('e-editable')) {
      console.log("[Gem] Double-click detected on editable image:", target);

      // Find the image properties button
      const imagePropsButton = document.querySelector('button[image-toolbar-button="image-properties-plugin"]');

      if (imagePropsButton) {
        console.log("[Gem] Triggering click on image properties button");
        // Simulate a click on the button
        imagePropsButton.click();
      } else {
        console.log("[Gem] Image properties button not found in DOM");
      }
    }
  }

  // Set up a mutation observer to watch for the preview iframe
  window.gemDomWatchSubscribe(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const iframe = node.classList && node.classList.contains('e-contentblocks-preview__iframe') ?
            node : node.querySelector && node.querySelector('.e-contentblocks-preview__iframe');

          if (iframe) {
            console.log("[Gem] Preview iframe found, attaching double-click handler");

            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              if (iframeDoc && !iframeDoc._gemImageDblClickAttached) {
                iframeDoc._gemImageDblClickAttached = true;
                iframeDoc.addEventListener('dblclick', handleImageDoubleClick, true);
                console.log("[Gem] Double-click handler attached to iframe");
              }
            } catch (error) {
              console.warn("[Gem] Could not attach handler to iframe:", error);
            }
          }
        }
      });
    });
  });

  const existingIframe = document.querySelector('.e-contentblocks-preview__iframe');
  if (existingIframe) {
    console.log("[Gem] Existing preview iframe found, attaching double-click handler");

    try {
      const iframeDoc = existingIframe.contentDocument || existingIframe.contentWindow.document;

      // Add the double-click event listener to the iframe's document
      if (iframeDoc && !iframeDoc._gemImageDblClickAttached) {
        iframeDoc._gemImageDblClickAttached = true;
        iframeDoc.addEventListener('dblclick', handleImageDoubleClick, true);
      }

      console.log("[Gem] Double-click handler attached to existing iframe");
    } catch (error) {
      console.warn("[Gem] Could not attach handler to existing iframe:", error);
    }
  }
}

function setupEslTokenDoubleClickHandler() {
  console.log("[Gem] Setting up ESL token double-click handler (desktop preview iframe)");

  const DESKTOP_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';

  function handleEslTokenDoubleClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    // Match the ESL token wrapper (or anything inside it)
    const tokenEl = target.closest('[e-token="cust_esl"]');
    if (!tokenEl) return;

    console.log("[Gem] Double-click detected on ESL token:", tokenEl);

    const insertEslBtn = document.querySelector('.mce-active[aria-label="Insert Emarsys Scripting Language snippet"] button');
    if (insertEslBtn) {
      console.log("[Gem] Triggering click on Insert ESL snippet button");
      insertEslBtn.click();
    } else {
      console.log("[Gem] Insert ESL snippet button not found in DOM");
    }
  }

  function attachToIframe(iframe) {
    if (!iframe) return;
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;
      if (iframeDoc._gemEslTokenDblClickAttached) return;
      iframeDoc._gemEslTokenDblClickAttached = true;
      iframeDoc.addEventListener('dblclick', handleEslTokenDoubleClick, true);
      console.log("[Gem] ESL token double-click handler attached to desktop iframe");
    } catch (error) {
      console.warn("[Gem] Could not attach ESL token handler to desktop iframe:", error);
    }
  }

  // Watch for the desktop preview iframe to appear
  window.gemDomWatchSubscribe(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const iframe =
          (node.matches && node.matches(DESKTOP_IFRAME_SELECTOR) && node) ||
          (node.querySelector && node.querySelector(DESKTOP_IFRAME_SELECTOR));
        if (iframe) attachToIframe(iframe);
      });
    });
  });

  attachToIframe(document.querySelector(DESKTOP_IFRAME_SELECTOR));
}

function setupPersonalizationTokenDoubleClickHandler() {
  console.log("[Gem] Setting up personalization token double-click handler (desktop preview iframe)");

  const DESKTOP_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';

  function findPersonalizationToolbarButton() {
    return (
      document.querySelector('.mce-active[aria-label="Personalization"] button') ||
      document.querySelector('[aria-label="Personalization"] button') ||
      document.querySelector('.mce-i-personalization')?.closest('button')
    );
  }

  function handlePersonalizationTokenDoubleClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    const tokenEl = target.closest('[e-token="personalization"]');
    if (!tokenEl) return;

    console.log("[Gem] Double-click detected on personalization token:", tokenEl);

    const personalizationBtn = findPersonalizationToolbarButton();
    if (personalizationBtn) {
      console.log("[Gem] Triggering click on Personalization toolbar button");
      personalizationBtn.click();
    } else {
      console.log("[Gem] Personalization toolbar button not found in DOM");
    }
  }

  function attachToIframe(iframe) {
    if (!iframe) return;
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;
      if (iframeDoc._gemPersTokenDblClickAttached) return;
      iframeDoc._gemPersTokenDblClickAttached = true;
      iframeDoc.addEventListener('dblclick', handlePersonalizationTokenDoubleClick, true);
      console.log("[Gem] Personalization token double-click handler attached to desktop iframe");
    } catch (error) {
      console.warn("[Gem] Could not attach personalization token handler to desktop iframe:", error);
    }
  }

  window.gemDomWatchSubscribe(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const iframe =
          (node.matches && node.matches(DESKTOP_IFRAME_SELECTOR) && node) ||
          (node.querySelector && node.querySelector(DESKTOP_IFRAME_SELECTOR));
        if (iframe) attachToIframe(iframe);
      });
    });
  });

  attachToIframe(document.querySelector(DESKTOP_IFRAME_SELECTOR));
}

function setupImagePropertiesEnterKeyHandler() {
  console.log("[Gem] Setting up Image Properties Enter key handler");

  /** Topmost `.e-dialog__container` when its title is Image Properties, else null. */
  function getTopmostImagePropertiesDialog() {
    const dialogs = document.querySelectorAll('.e-dialog__container');
    if (dialogs.length === 0) return null;

    const topmostDialog = dialogs[dialogs.length - 1];
    const titleElement = topmostDialog.querySelector('.e-dialog__title, h2, .dialog-title');
    if (!titleElement) return null;

    const titleText = titleElement.textContent || titleElement.innerText || '';
    if (!titleText.trim().toLowerCase().includes('image properties')) return null;
    return topmostDialog;
  }

  // Function to check if current focus is on a disallowed input
  function isFocusOnDisallowedInput() {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    // Allow focus in "Image alternative text" input
    if (activeElement.placeholder === 'Image alternative text') {
      return false;
    }

    // Check if focused element is a search input (disallowed)
    const isSearchInput = activeElement.matches('input[type="search"]') ||
                         activeElement.classList.contains('e-input-search') ||
                         activeElement.classList.contains('gem-favorite-images-search') ||
                         activeElement.classList.contains('gem-seen-images-search');

    return isSearchInput;
  }

  /** Emarsys often commits dimension fields only on blur; skip search inputs we use for Gem pickers. */
  function shouldCommitImagePropertyField(el) {
    if (!el || !el.matches) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
    if (el.matches('input[type="search"]')) return false;
    if (
      el.classList.contains('e-input-search') ||
      el.classList.contains('gem-favorite-images-search') ||
      el.classList.contains('gem-seen-images-search')
    ) {
      return false;
    }
    return true;
  }

  function blurAndCommitImagePropertyField(el) {
    if (!el) return;
    try {
      el.blur();
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
  }

  // Handle Enter key presses
  function handleEnterKey(event) {
    if (event.key !== 'Enter') return;

    const addFavModal = document.getElementById('gem-favorite-image-meta-modal');
    if (addFavModal && document.body.contains(addFavModal)) {
      const saveBtn = addFavModal.querySelector('.gem-favorite-image-meta-save');
      if (saveBtn) {
        saveBtn.click();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const imagePropsDialog = getTopmostImagePropertiesDialog();
    if (!imagePropsDialog) return;

    // Check if focus is on a disallowed input
    if (isFocusOnDisallowedInput()) return;

    // Emarsys often does not commit field values (alt text, width/height, etc.) until blur.
    try {
      const ae = document.activeElement;
      if (ae && imagePropsDialog.contains(ae) && shouldCommitImagePropertyField(ae)) {
        blurAndCommitImagePropertyField(ae);
      }
    } catch (_) {}

    // OK on the same dialog we validated (not an older `.e-dialog__container` in the tree)
    const okButton = imagePropsDialog.querySelector('button.ok-btn');
    if (okButton) {
      console.log("[Gem] Enter key pressed in Image Properties dialog, clicking OK button");
      okButton.click();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // Add the keydown event listener to the document
  document.addEventListener('keydown', handleEnterKey, true);

  console.log("[Gem] Image Properties Enter key handler attached");
}

function setupImagePropertiesTabToggleShortcut() {
  console.log("[Gem] Setting up Image Properties tab toggle shortcut (CMD+D / CTRL+D)");

  // Function to check if Image Properties dialog is open
  function isImagePropertiesDialogOpen() {
    const dialogs = document.querySelectorAll('.e-dialog__container');
    if (dialogs.length === 0) return false;

    // Check if any dialog contains "Image Properties" in the title
    for (const dialog of dialogs) {
      const titleElement = dialog.querySelector('.e-dialog__title, h2, .dialog-title');
      if (titleElement) {
        const titleText = titleElement.textContent || titleElement.innerText || '';
        if (titleText.trim().toLowerCase().includes('image properties')) {
          return true;
        }
      }
    }
    return false;
  }

  // Handle CMD+D / CTRL+D key presses
  function handleTabToggleShortcut(event) {
    // Check if CMD+D (Mac) or CTRL+D (Windows/Linux)
    const isCmdOrCtrlD = (event.metaKey || event.ctrlKey) && event.key === 'd';
    if (!isCmdOrCtrlD) return;

    // Check if Image Properties dialog is open
    if (!isImagePropertiesDialogOpen()) return;

    // Find the desktop and mobile tabs
    const desktopTab = document.querySelector('.e-tabs-dialogheader [data-tab="desktop"]');
    const mobileTab = document.querySelector('.e-tabs-dialogheader [data-tab="mobile"]');

    if (!desktopTab || !mobileTab) {
      console.log("[Gem] Desktop or mobile tab not found");
      return;
    }

    // Check which tab is currently active and toggle to the other one
    if (desktopTab.classList.contains('e-tabs__title-active')) {
      console.log("[Gem] Toggling from Desktop to Mobile tab");
      mobileTab.click();
    } else if (mobileTab.classList.contains('e-tabs__title-active')) {
      console.log("[Gem] Toggling from Mobile to Desktop tab");
      desktopTab.click();
    } else {
      console.log("[Gem] No active tab found, defaulting to Desktop");
      desktopTab.click();
    }

    // Prevent default browser behavior (bookmark dialog on Ctrl+D)
    event.preventDefault();
    event.stopPropagation();
  }

  // Add the keydown event listener to the document
  document.addEventListener('keydown', handleTabToggleShortcut, true);

  console.log("[Gem] Image Properties tab toggle shortcut handler attached");
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentBlockToolbar);
} else {
  initializeContentBlockToolbar();
}
