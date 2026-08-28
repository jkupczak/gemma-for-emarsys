// block-targeting-panel.js — Gemma Block Targeting vertical nav panel
(function () {
  'use strict';

  const TAB_ID = 'gem-block-targeting-tab';
  const PANEL_TAG = 'gem-block-targeting';
  const PIP_CLASS = 'gem-nav-count-pip';
  const TARGETING_ICON_HTML =
    '<e-icon icon="radio-checked"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF15E;</div></div></e-icon>';

  let dataChangeUnsub = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hideNonRouterOutletChildren(navContent) {
    Array.from(navContent.children).forEach((child) => {
      if (child.tagName === 'ROUTER-OUTLET') return;
      if (child.tagName === PANEL_TAG.toUpperCase()) return;
      if (child.dataset && child.dataset.gemHiddenByBlockTargeting === 'true') return;
      if (child.dataset) {
        child.dataset.gemHiddenByBlockTargeting = 'true';
        child.dataset.gemBlockTargetingPrevDisplay = child.style.display || '';
      }
      child.style.display = 'none';
    });
  }

  function restoreHiddenNavChildren(navContent) {
    navContent.querySelectorAll('[data-gem-hidden-by-block-targeting="true"]').forEach((el) => {
      const prev = el.dataset ? (el.dataset.gemBlockTargetingPrevDisplay || '') : '';
      el.style.display = prev;
      if (el.dataset) {
        delete el.dataset.gemHiddenByBlockTargeting;
        delete el.dataset.gemBlockTargetingPrevDisplay;
      }
    });
  }

  function isBlockTargetingPanelActive() {
    return !!document.querySelector(PANEL_TAG);
  }

  function getNavItemEl() {
    const tab = document.querySelector(`#${TAB_ID}`);
    return tab ? tab.querySelector('.e-verticalnavitem') : null;
  }

  function ensureNavPip() {
    const item = getNavItemEl();
    if (!item) return null;
    let pip = item.querySelector(`.${PIP_CLASS}`);
    if (pip) return pip;
    pip = document.createElement('span');
    pip.className = PIP_CLASS;
    pip.setAttribute('aria-hidden', 'true');
    pip.style.display = 'none';
    pip.textContent = '0';
    item.appendChild(pip);
    return pip;
  }

  function setNavPipCount(count) {
    const pip = ensureNavPip();
    if (!pip) return;
    const safe = Math.max(0, Number.parseInt(String(count), 10) || 0);
    if (safe <= 0) {
      pip.textContent = '0';
      pip.style.display = 'none';
      return;
    }
    pip.textContent = String(Math.min(99, safe));
    pip.style.display = '';
  }

  window.gemSetBlockTargetingNavPipCount = setNavPipCount;

  function syncPanelOverlayToggle() {
    const panel = document.querySelector(PANEL_TAG);
    if (!panel) return;
    const toggleBtn = panel.querySelector('[data-role="overlayToggleBtn"]');
    if (!toggleBtn) return;
    const enabled = typeof window.gemIsBlockTargetingPreviewEnabled === 'function'
      ? window.gemIsBlockTargetingPreviewEnabled()
      : true;
    toggleBtn.classList.toggle('e-btn-active', enabled);
    toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  window.gemSyncBlockTargetingPanelToggle = syncPanelOverlayToggle;

  function visibilityChipClass(visibility) {
    if (visibility === 'show') return 'gem-bt-card-chip--show';
    if (visibility === 'hide') return 'gem-bt-card-chip--hide';
    return 'gem-bt-card-chip--unknown';
  }

  function visibilityChipLabel(visibility) {
    if (visibility === 'show') return 'Show';
    if (visibility === 'hide') return 'Hide';
    if (visibility === '\u2026') return 'Unknown';
    if (visibility) return visibility;
    return 'Targeted';
  }

  function renderRuleRows(rules) {
    if (!Array.isArray(rules) || !rules.length) {
      return '<div class="gem-bt-card-rule gem-bt-card-rule--empty">No additional targeting details.</div>';
    }
    return rules.map((rule) => (
      '<div class="gem-bt-card-rule">' +
        `<span class="gem-bt-card-rule-label">${escapeHtml(rule.label)}</span>` +
        `<span class="gem-bt-card-rule-value">${escapeHtml(rule.value)}</span>` +
      '</div>'
    )).join('');
  }

  function renderCards() {
    const listEl = document.querySelector(`${PANEL_TAG} [data-role="cardList"]`);
    const emptyEl = document.querySelector(`${PANEL_TAG} [data-role="emptyState"]`);
    const actionsEl = document.querySelector(`${PANEL_TAG} .e-section__actions`);
    if (!listEl || !emptyEl) return;

    const blocks = typeof window.gemGetTargetedBlocks === 'function'
      ? window.gemGetTargetedBlocks()
      : [];

    if (actionsEl) {
      actionsEl.hidden = !blocks.length;
    }

    if (!blocks.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = blocks.map((block) => (
      `<button type="button" class="gem-bt-card" data-block-id="${escapeHtml(block._id)}" aria-label="Scroll to ${escapeHtml(block.name)}">` +
        '<div class="gem-bt-card-header">' +
          `<span class="gem-bt-card-name">${escapeHtml(block.name)}</span>` +
          `<span class="gem-bt-card-chip ${visibilityChipClass(block.visibility)}">${escapeHtml(visibilityChipLabel(block.visibility))}</span>` +
        '</div>' +
        `<div class="gem-bt-card-rules">${renderRuleRows(block.rules)}</div>` +
      '</button>'
    )).join('');
  }

  function bindPanelHandlers() {
    const panel = document.querySelector(PANEL_TAG);
    if (!panel || panel._gemBlockTargetingPanelBound) return;
    panel._gemBlockTargetingPanelBound = true;

    const toggleBtn = panel.querySelector('[data-role="overlayToggleBtn"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.gemToggleBlockTargetingPreview === 'function') {
          window.gemToggleBlockTargetingPreview();
        }
      });
    }

    panel.addEventListener('click', (e) => {
      const card = e.target.closest('.gem-bt-card[data-block-id]');
      if (!card) return;
      const blockId = card.getAttribute('data-block-id');
      if (!blockId) return;
      if (typeof window.gemScrollPreviewToBlock === 'function') {
        window.gemScrollPreviewToBlock(blockId);
      }
    });

    syncPanelOverlayToggle();
  }

  function subscribeToDataChanges() {
    if (dataChangeUnsub) return;
    if (typeof window.gemOnBlockTargetingDataChange !== 'function') return;
    dataChangeUnsub = window.gemOnBlockTargetingDataChange((payload) => {
      setNavPipCount(payload && payload.targetedCount);
      if (isBlockTargetingPanelActive()) {
        renderCards();
      }
    });
  }

  function createBlockTargetingTabHTML() {
    return `
<cb-vertical-tab id="${TAB_ID}" value="tooltips.blockTargeting" icon="radio-checked">
  <div style="
      text-transform: uppercase;
      text-align: center;
      font-size: 10px;
      letter-spacing: 1px;
  ">Gemma</div>
  <e-verticalnav-item class="gem-e-verticalnav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Gemma Block Targeting" role="tooltip" aria-description="Gemma Block Targeting">
        <div class="e-verticalnavitem__icon e-svgclickfix">
          ${TARGETING_ICON_HTML}
        </div>
      </e-tooltip>
      <div class="e-verticalnavitem__value">Gemma Block Targeting</div>
    </div>
  </e-verticalnav-item>
</cb-vertical-tab>
    `.trim();
  }

  function createBlockTargetingPanelHTML() {
    return `
<${PANEL_TAG} class="scrollable gem-block-targeting-panel">
  <div class="e-section">
    <div class="e-section__header">
      <div class="e-section__title">Gemma Block Targeting</div>
      <div class="e-section__actions">
        <button type="button" class="e-btn e-section__action" data-role="overlayToggleBtn" aria-pressed="true">Highlight Blocks</button>
      </div>
    </div>
    <div class="e-section__content">
      <p class="gem-bt-panel-help">Blocks in the active language with block targeting applied. Click a card to scroll to it in the preview.</p>
      <div class="gem-bt-card-list" data-role="cardList"></div>
      <div class="gem-bt-empty" data-role="emptyState" hidden>
        No blocks with block targeting in this language.
      </div>
    </div>
  </div>
</${PANEL_TAG}>
    `.trim();
  }

  function deactivateOtherGemmaPanels() {
    if (typeof window.gemDeactivateFindReplacePanel === 'function' && window.gemIsFindReplaceActive?.()) {
      window.gemDeactivateFindReplacePanel();
    }
    if (typeof window.gemDeactivateMagicFillPanel === 'function' && window.gemIsMagicFillActive?.()) {
      window.gemDeactivateMagicFillPanel();
    }
    if (typeof window.gemDeactivatePreflightPanel === 'function' && window.gemIsPreflightActive?.()) {
      window.gemDeactivatePreflightPanel();
    }
  }

  function deactivateSnippetsPanelIfActive() {
    const snippetsNavItem = document.querySelector('#gem-snippets-tab e-verticalnav-item');
    if (!snippetsNavItem || snippetsNavItem.getAttribute('status') !== 'active') return;

    snippetsNavItem.removeAttribute('status');
    const navItemDiv = snippetsNavItem.querySelector('.e-verticalnavitem');
    if (navItemDiv) navItemDiv.classList.remove('e-verticalnavitem-active');

    const snippetList = document.querySelector('gem-snippets');
    if (snippetList) snippetList.remove();

    const navContent = document.querySelector('.e-verticalnav__content');
    if (navContent) {
      navContent.querySelectorAll('[data-gem-hidden-by-snippets="true"]').forEach((el) => {
        const prev = el.dataset ? (el.dataset.gemPrevDisplay || '') : '';
        el.style.display = prev;
        if (el.dataset) {
          delete el.dataset.gemHiddenBySnippets;
          delete el.dataset.gemPrevDisplay;
        }
      });
    }
  }

  function activateBlockTargetingPanel() {
    const navContent = document.querySelector('.e-verticalnav__content');
    const navItem = document.querySelector(`#${TAB_ID} e-verticalnav-item`);
    if (!navContent || !navItem) return;

    deactivateOtherGemmaPanels();
    deactivateSnippetsPanelIfActive();

    navItem.setAttribute('status', 'active');
    const navItemDiv = navItem.querySelector('.e-verticalnavitem');
    if (navItemDiv) navItemDiv.classList.add('e-verticalnavitem-active');

    hideNonRouterOutletChildren(navContent);

    const existing = navContent.querySelector(PANEL_TAG);
    if (existing) existing.remove();

    navContent.insertAdjacentHTML('afterbegin', createBlockTargetingPanelHTML());
    bindPanelHandlers();
    renderCards();
  }

  function deactivateBlockTargetingPanel() {
    const navItem = document.querySelector(`#${TAB_ID} e-verticalnav-item`);
    if (navItem) {
      navItem.removeAttribute('status');
      const navItemDiv = navItem.querySelector('.e-verticalnavitem');
      if (navItemDiv) navItemDiv.classList.remove('e-verticalnavitem-active');
    }

    const panel = document.querySelector(PANEL_TAG);
    if (panel) panel.remove();

    const navContent = document.querySelector('.e-verticalnav__content');
    if (navContent) restoreHiddenNavChildren(navContent);
  }

  function handleBlockTargetingTabClick() {
    activateBlockTargetingPanel();
  }

  function setupGlobalTabClickHandler() {
    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (!verticalNav || verticalNav._gemBlockTargetingNavBound) return;
    verticalNav._gemBlockTargetingNavBound = true;

    verticalNav.addEventListener('click', (event) => {
      const clickedTab = event.target.closest('cb-vertical-tab');
      if (!clickedTab) return;
      if (clickedTab.id === TAB_ID) return;
      if (isBlockTargetingPanelActive()) {
        deactivateBlockTargetingPanel();
      }
    });
  }

  function addBlockTargetingTab() {
    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (!snippetsTab) return false;

    let tab = document.querySelector(`#${TAB_ID}`);
    if (tab) {
      if (snippetsTab.previousElementSibling !== tab) {
        snippetsTab.insertAdjacentElement('beforebegin', tab);
      }
      return true;
    }

    snippetsTab.insertAdjacentHTML('beforebegin', createBlockTargetingTabHTML());
    tab = document.querySelector(`#${TAB_ID}`);
    if (!tab) return false;

    const navItem = tab.querySelector('e-verticalnav-item');
    if (navItem) navItem.addEventListener('click', handleBlockTargetingTabClick);

    ensureNavPip();
    setNavPipCount(typeof window.gemGetBlockTargetingCount === 'function' ? window.gemGetBlockTargetingCount() : 0);
    setupGlobalTabClickHandler();
    return true;
  }

  function waitForVerticalNav() {
    if (addBlockTargetingTab()) return;

    if (typeof window.gemDomWatchSubscribe === 'function') {
      const unsub = window.gemDomWatchSubscribe(() => {
        if (addBlockTargetingTab()) unsub();
      });
    } else {
      const observer = new MutationObserver(() => {
        if (addBlockTargetingTab()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function initBlockTargetingPanel() {
    subscribeToDataChanges();
    waitForVerticalNav();
  }

  window.gemDeactivateBlockTargetingPanel = deactivateBlockTargetingPanel;
  window.gemActivateBlockTargetingPanel = activateBlockTargetingPanel;
  window.gemIsBlockTargetingActive = isBlockTargetingPanelActive;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlockTargetingPanel);
  } else {
    initBlockTargetingPanel();
  }

  console.log('[Gem][BlockTargetingPanel] Initialized.');
})();
