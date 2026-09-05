// campaign-duplicate-tab-guard.js
// Warns when the same campaign is open in multiple browser tabs.
(function () {
  'use strict';

  const guard = window.gemCampaignTabGuard;
  if (!guard) return;

  const BANNER_ID = 'gem-duplicate-tab-banner';
  const ACTIVATION_MODAL_ID = 'gem-duplicate-tab-activation-modal';
  const SAVE_MODAL_ID = 'gem-duplicate-tab-save-modal';
  const STALE_SAVE_MODAL_ID = 'gem-stale-tab-save-modal';
  const BACKDROP_CLASS = 'gem-duplicate-tab-backdrop';

  let duplicateState = null;
  let bannerDismissed = false;
  let activationModalDismissed = false;
  let saveBypassPending = false;
  let refreshTimer = null;
  let guardEnabled = true;
  let bannerRenderKey = '';

  function getDuplicateSetKey(state) {
    if (!state || !state.hasDuplicates) return '';
    const otherIds = (state.otherTabIds || []).slice().sort().join(',');
    return `${state.totalTabs || 0}:${otherIds}`;
  }

  function getBannerRenderKey(state) {
    const otherTabs = getOtherTabs(state);
    const tabIds = otherTabs.map((tab) => tab.tabId).join(',');
    return `${getDuplicateSetKey(state)}:${tabIds}`;
  }

  function queryDuplicateState(callback) {
    const campaignId = guard.getCampaignIdFromUrl();
    if (!campaignId || !chrome?.runtime?.sendMessage) {
      callback(null);
      return;
    }
    chrome.runtime.sendMessage(
      { action: 'getDuplicateCampaignTabs', campaignId },
      (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          callback(null);
          return;
        }
        callback(res);
      }
    );
  }

  function focusOtherTab(preferredTabId) {
    const campaignId = guard.getCampaignIdFromUrl();
    if (!campaignId || !chrome?.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({
      action: 'focusCampaignTab',
      campaignId,
      preferredTabId: preferredTabId != null ? preferredTabId : undefined,
    });
  }

  function closeCampaignTab(tabId) {
    const campaignId = guard.getCampaignIdFromUrl();
    if (!campaignId || !chrome?.runtime?.sendMessage || tabId == null) return;
    chrome.runtime.sendMessage(
      { action: 'closeCampaignTab', campaignId, tabId },
      (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) return;
        scheduleRefreshDuplicateState();
      }
    );
  }

  function closeThisTab() {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'closeSenderTab' });
      return;
    }
    window.close();
  }

  function getOtherTabs(state) {
    if (!state) return [];
    if (Array.isArray(state.otherTabs) && state.otherTabs.length) return state.otherTabs;
    return (state.otherTabIds || []).map((tabId, index) => ({
      tabId,
      title: `Tab ${index + 1}`,
      unsaved: !!(state.tabUnsaved && state.tabUnsaved[String(tabId)]),
      lastSavedAt: null,
      lastRefreshedAt: null,
      openedAt: null,
    }));
  }

  function getTabLastRefreshedAtLocal() {
    if (typeof window.gemGetTabLastRefreshedAt === 'function') {
      return window.gemGetTabLastRefreshedAt();
    }
    try {
      const ts = Math.round(performance.timeOrigin || 0);
      return Number.isFinite(ts) && ts > 0 ? ts : null;
    } catch (_) {
      return null;
    }
  }

  function updateDuplicateTabTitle(state) {
    if (typeof window.gemSetDuplicateTabIndex !== 'function') return;
    if (!guardEnabled || !state || !state.hasDuplicates) {
      window.gemSetDuplicateTabIndex(null);
      return;
    }
    const allTabs = getAllTabs(state);
    const index = guard.getDuplicateTabIndexForTab(allTabs, state.currentTabId);
    window.gemSetDuplicateTabIndex(index);
  }

  function getAllTabs(state) {
    if (!state) return [];
    if (Array.isArray(state.allTabs) && state.allTabs.length) {
      return guard.sortTabsByLastSaved(state.allTabs);
    }
    const currentTabId = state.currentTabId;
    const otherTabs = getOtherTabs(state);
    const combined = otherTabs.slice();
    if (currentTabId != null) {
      combined.push({
        tabId: currentTabId,
        title: document.title || 'This tab',
        unsaved: guard.readLocalUnsaved(),
        lastSavedAt:
          typeof window.gemGetDraftLastSavedAt === 'function' ? window.gemGetDraftLastSavedAt() : null,
        lastRefreshedAt: getTabLastRefreshedAtLocal(),
        openedAt: null,
        isActive: true,
      });
    }
    return guard.sortTabsByLastSaved(combined);
  }

  function buildUnsavedDetail(state) {
    if (!state || !state.hasDuplicates) return '';
    const tabUnsaved = state.tabUnsaved || {};
    const localUnsaved = guard.readLocalUnsaved();
    const otherUnsaved = (state.otherTabIds || []).some((tid) => !!tabUnsaved[String(tid)]);
    if (localUnsaved && otherUnsaved) {
      return ' Both tabs have unsaved changes.';
    }
    if (localUnsaved) {
      return ' This tab has unsaved changes.';
    }
    if (otherUnsaved) {
      return ' The other tab has unsaved changes.';
    }
    return '';
  }

  function removeModal(modalId) {
    const modal = document.getElementById(modalId);
    const backdrop = modal && modal.nextElementSibling;
    const backdropEl =
      backdrop && backdrop.classList && backdrop.classList.contains(BACKDROP_CLASS)
        ? backdrop
        : document.querySelector(`.${BACKDROP_CLASS}[data-for="${modalId}"]`);
    if (modal && typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(modal);
    }
    if (backdropEl && typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(backdropEl);
    }
    modal?.remove();
    backdropEl?.remove();
  }

  function showModal({
    modalId,
    title,
    body,
    primaryLabel,
    primaryAction,
    secondaryLabel,
    secondaryAction,
    tertiaryLabel,
    tertiaryAction,
    switchTabs,
    switchTabsIndexSource,
    switchActionPrefix,
  }) {
    removeModal(modalId);

    const backdrop = document.createElement('div');
    backdrop.className = BACKDROP_CLASS;
    backdrop.dataset.for = modalId;

    const switchHtml = guard.buildTabSwitchControlsHtml(
      switchTabs,
      switchActionPrefix || 'gem-duplicate-tab-modal',
      switchTabsIndexSource
    );

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'gem-stale-tab-modal gem-duplicate-tab-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      `<h2 class="gem-stale-tab-modal__title">${title}</h2>` +
      `<p class="gem-stale-tab-modal__body">${body}</p>` +
      '<div class="gem-stale-tab-modal__actions">' +
        (tertiaryLabel
          ? `<button type="button" class="e-btn gem-stale-tab-modal__continue" data-action="tertiary">${tertiaryLabel}</button>`
          : '') +
        (secondaryLabel
          ? `<button type="button" class="e-btn" data-action="secondary">${secondaryLabel}</button>`
          : '') +
        (switchHtml || '') +
        (primaryLabel
          ? `<button type="button" class="e-btn e-btn-primary gem-stale-tab-modal__refresh" data-action="primary">${primaryLabel}</button>`
          : '') +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(backdrop, { tier: 'modal' });
      window.gemLayerRaise(modal, { tier: 'modal' });
    }

    guard.bindTabSwitchControls(modal, focusOtherTab);

    const tertiaryBtn = modal.querySelector('[data-action="tertiary"]');
    const secondaryBtn = modal.querySelector('[data-action="secondary"]');
    const primaryBtn = modal.querySelector('[data-action="primary"]');
    if (tertiaryBtn && tertiaryAction) {
      tertiaryBtn.addEventListener('click', () => {
        tertiaryAction();
        removeModal(modalId);
      });
    }
    if (secondaryBtn && secondaryAction) {
      secondaryBtn.addEventListener('click', () => {
        secondaryAction();
        removeModal(modalId);
      });
    }
    if (primaryBtn && primaryAction) {
      primaryBtn.addEventListener('click', () => {
        primaryAction();
        removeModal(modalId);
      });
    }
  }

  function showActivationModal(state) {
    if (document.getElementById(ACTIVATION_MODAL_ID)) return;
    const detail = buildUnsavedDetail(state);
    const allTabs = getAllTabs(state);
    const body = detail
      ? 'If you edit and save here, you may overwrite changes from the other tab. Switch to the tab you were working in, or refresh to load the latest saved version.'
        + detail
      : 'You now have this campaign open in more than one tab. Edits saved in either tab can overwrite each other. Switch to the other tab if you were working there, or continue here carefully.';
    const tableHtml = guard.buildDuplicateTabTableHtml(allTabs);

    guard.tabGuardLog('DuplicateTabGuard', 'Activation modal shown', {
      totalTabs: state.totalTabs,
      tabCount: allTabs.length,
      anyUnsaved: state.anyUnsaved,
      unsavedDetail: detail || null,
    });

    removeModal(ACTIVATION_MODAL_ID);

    const backdrop = document.createElement('div');
    backdrop.className = BACKDROP_CLASS;
    backdrop.dataset.for = ACTIVATION_MODAL_ID;

    const modal = document.createElement('div');
    modal.id = ACTIVATION_MODAL_ID;
    modal.className = 'gem-stale-tab-modal gem-duplicate-tab-modal gem-duplicate-tab-modal--with-table';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<h2 class="gem-stale-tab-modal__title">This campaign is open in another tab.</h2>' +
      `<p class="gem-stale-tab-modal__body">${body}</p>` +
      tableHtml +
      '<div class="gem-stale-tab-modal__actions">' +
        '<button type="button" class="e-btn gem-stale-tab-modal__continue" data-action="tertiary">Continue in this tab — risky</button>' +
        '<button type="button" class="e-btn" data-action="secondary">Refresh this tab</button>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(backdrop, { tier: 'modal' });
      window.gemLayerRaise(modal, { tier: 'modal' });
    }

    guard.bindDuplicateTabTable(modal, focusOtherTab, closeCampaignTab);

    modal.querySelector('[data-action="tertiary"]').addEventListener('click', () => {
      activationModalDismissed = true;
      removeModal(ACTIVATION_MODAL_ID);
    });
    modal.querySelector('[data-action="secondary"]').addEventListener('click', () => {
      window.location.reload();
    });
  }

  function showDuplicateSaveGuardModal(onSaveAnyway) {
    if (document.getElementById(SAVE_MODAL_ID)) return;
    const detail = buildUnsavedDetail(duplicateState);
    const otherTabs = getOtherTabs(duplicateState);
    const allTabs = getAllTabs(duplicateState);
    showModal({
      modalId: SAVE_MODAL_ID,
      title: 'Another tab has this campaign open.',
      body: 'Saving now may overwrite work in the other tab.' + detail,
      tertiaryLabel: 'Cancel',
      tertiaryAction: () => {},
      switchTabs: otherTabs,
      switchTabsIndexSource: allTabs,
      switchActionPrefix: 'gem-duplicate-tab-save-modal',
      primaryLabel: 'Save anyway',
      primaryAction: () => {
        if (typeof onSaveAnyway === 'function') onSaveAnyway();
      },
    });
  }

  function showStaleSaveGuardModal(onSaveAnyway) {
    if (document.getElementById(STALE_SAVE_MODAL_ID)) return;
    guard.tabGuardLog('DuplicateTabGuard', 'Stale save guard modal shown');
    showModal({
      modalId: STALE_SAVE_MODAL_ID,
      title: 'This tab may still show older content.',
      body: 'Saving now may overwrite the latest saved version. Refresh first to load the current campaign.',
      tertiaryLabel: 'Cancel',
      tertiaryAction: () => {},
      secondaryLabel: 'Refresh now',
      secondaryAction: () => {
        window.location.reload();
      },
      primaryLabel: 'Save anyway',
      primaryAction: () => {
        if (typeof onSaveAnyway === 'function') onSaveAnyway();
      },
    });
  }

  function removeBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
    bannerRenderKey = '';
    document.documentElement.classList.remove('gem-duplicate-tab-banner-visible');
  }

  function ensureBannerElement() {
    let banner = document.getElementById(BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'gem-duplicate-tab-banner gem-campaign-urgent-notice';
    banner.setAttribute('role', 'status');
    banner.addEventListener('click', (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl || !banner.contains(actionEl)) return;

      const action = actionEl.getAttribute('data-action');
      if (action === 'dismiss') {
        event.preventDefault();
        event.stopPropagation();
        bannerDismissed = true;
        removeBanner();
        guard.tabGuardLog('DuplicateTabGuard', 'Banner dismissed');
        return;
      }
      if (action === 'close') {
        event.preventDefault();
        event.stopPropagation();
        closeThisTab();
      }
    });
    document.body.appendChild(banner);
    return banner;
  }

  function updateBannerDetail(state) {
    const banner = document.getElementById(BANNER_ID);
    if (!banner) return;
    const detail = buildUnsavedDetail(state);
    const detailEl = banner.querySelector('.gem-duplicate-tab-banner__detail');
    if (detail) {
      if (detailEl) {
        detailEl.textContent = detail;
      } else {
        const textEl = banner.querySelector('.gem-duplicate-tab-banner__text');
        if (textEl) {
          const span = document.createElement('span');
          span.className = 'gem-duplicate-tab-banner__detail';
          span.textContent = detail;
          textEl.appendChild(span);
        }
      }
    } else if (detailEl) {
      detailEl.remove();
    }
  }

  function renderBanner(state) {
    if (!guardEnabled) {
      removeBanner();
      return;
    }
    if (!state || !state.hasDuplicates || bannerDismissed) {
      removeBanner();
      return;
    }

    const nextRenderKey = getBannerRenderKey(state);
    const banner = ensureBannerElement();

    if (bannerRenderKey === nextRenderKey && banner.querySelector('.gem-duplicate-tab-banner__inner')) {
      updateBannerDetail(state);
      document.documentElement.classList.add('gem-duplicate-tab-banner-visible');
      return;
    }

    bannerRenderKey = nextRenderKey;

    const tabCount = Math.max(2, Number(state.totalTabs) || 2);
    const detail = buildUnsavedDetail(state);
    const allTabs = getAllTabs(state);
    const otherTabs = getOtherTabs(state);
    const switchHtml = guard.buildTabSwitchControlsHtml(otherTabs, 'gem-duplicate-tab-banner', allTabs);

    banner.innerHTML =
      '<div class="gem-duplicate-tab-banner__inner">' +
        '<p class="gem-duplicate-tab-banner__text">' +
          `<strong>This campaign is open in ${tabCount} tabs.</strong> ` +
          'Editing in more than one tab can cause you to overwrite your own saved changes.' +
          (detail ? `<span class="gem-duplicate-tab-banner__detail">${detail}</span>` : '') +
        '</p>' +
        '<div class="gem-duplicate-tab-banner__actions">' +
          '<button type="button" class="e-btn e-btn-borderless gem-duplicate-tab-banner__dismiss" data-action="dismiss">Dismiss</button>' +
          '<button type="button" class="e-btn gem-duplicate-tab-banner__close-tab" data-action="close">Close this tab</button>' +
          switchHtml +
        '</div>' +
      '</div>';

    guard.bindTabSwitchControls(banner, focusOtherTab);

    document.documentElement.classList.add('gem-duplicate-tab-banner-visible');
  }

  function maybeShowActivationModal(state) {
    if (!guardEnabled) return;
    if (!state || !state.hasDuplicates) return;
    if (activationModalDismissed) return;
    if (document.hidden) return;
    if (guard.shouldDeferDuplicateActivation()) return;

    guard.requestDuplicateActivation(() => {
      showActivationModal(state);
    });
  }

  function applyDuplicateState(state) {
    const prevSetKey = getDuplicateSetKey(duplicateState);
    const nextSetKey = getDuplicateSetKey(state);

    if (prevSetKey !== nextSetKey) {
      bannerDismissed = false;
      bannerRenderKey = '';
      activationModalDismissed = false;
    }

    duplicateState = state && state.hasDuplicates ? state : null;

    guard.tabGuardLog('DuplicateTabGuard', 'Duplicate state updated', {
      hasDuplicates: !!(duplicateState && duplicateState.hasDuplicates),
      totalTabs: duplicateState && duplicateState.totalTabs,
      anyUnsaved: duplicateState && duplicateState.anyUnsaved,
    });

    if (!duplicateState || !guardEnabled) {
      updateDuplicateTabTitle(null);
      removeBanner();
      removeModal(ACTIVATION_MODAL_ID);
      removeModal(SAVE_MODAL_ID);
      return;
    }

    updateDuplicateTabTitle(duplicateState);
    renderBanner(duplicateState);

    const activationModalOpen = document.getElementById(ACTIVATION_MODAL_ID);
    if (activationModalOpen) {
      if (prevSetKey !== nextSetKey) {
        removeModal(ACTIVATION_MODAL_ID);
        showActivationModal(duplicateState);
      }
    } else {
      maybeShowActivationModal(duplicateState);
    }
  }

  function refreshDuplicateState() {
    if (!guardEnabled) {
      applyDuplicateState(null);
      return;
    }
    queryDuplicateState(applyDuplicateState);
  }

  function scheduleRefreshDuplicateState() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshDuplicateState();
    }, 120);
  }

  function handleSaveClick(event) {
    const button = event.target.closest(
      'cb-draft-save-button button, gem-cb-draft-save-button button'
    );
    if (!button || button.hasAttribute('disabled')) return;

    if (saveBypassPending) {
      saveBypassPending = false;
      return;
    }

    const duplicateActive = guardEnabled && duplicateState && duplicateState.hasDuplicates;
    const staleRisky = guard.isStaleContinueRisky();

    if (!duplicateActive && !staleRisky) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (duplicateActive) {
      showDuplicateSaveGuardModal(() => {
        saveBypassPending = true;
        button.click();
      });
      return;
    }

    showStaleSaveGuardModal(() => {
      saveBypassPending = true;
      guard.clearStaleContinueRisky();
      button.click();
    });
  }

  function initSaveGuard() {
    document.addEventListener('click', handleSaveClick, true);
  }

  function initUnsavedWatcher() {
    let lastLocalUnsaved = guard.readLocalUnsaved();
    const observeSaveButton = () => {
      const saveButton = document.querySelector('cb-draft-save-button button');
      if (!saveButton || saveButton._gemDuplicateTabGuardObserved) return;
      saveButton._gemDuplicateTabGuardObserved = true;
      const observer = new MutationObserver(() => {
        const next = guard.readLocalUnsaved();
        if (next === lastLocalUnsaved) return;
        lastLocalUnsaved = next;
        scheduleRefreshDuplicateState();
      });
      observer.observe(saveButton, { attributes: true, attributeFilter: ['disabled'] });
    };

    observeSaveButton();
    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        observeSaveButton();
      });
    }
  }

  function initListeners() {
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === 'recentCampaignOpenTabsUpdated') {
          scheduleRefreshDuplicateState();
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      scheduleRefreshDuplicateState();
      if (duplicateState) {
        maybeShowActivationModal(duplicateState);
      }
    });

    window.addEventListener('pageshow', () => {
      scheduleRefreshDuplicateState();
    });

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        if (!duplicateState || bannerDismissed) return;
        updateBannerDetail(duplicateState);
      });
    }
  }

  function applyGuardSettings(nextSettings) {
    guardEnabled = !!(nextSettings && nextSettings.duplicateTabGuardEnabled);
    if (!guardEnabled) {
      removeBanner();
      removeModal(ACTIVATION_MODAL_ID);
      removeModal(SAVE_MODAL_ID);
      duplicateState = null;
      updateDuplicateTabTitle(null);
    } else {
      refreshDuplicateState();
    }
  }

  function init() {
    if (!guard.isCampaignEditorPage()) return;

    guard.initTabGuardSettingsListener((nextSettings) => {
      applyGuardSettings(nextSettings);
    });

    initSaveGuard();
    initUnsavedWatcher();
    initListeners();
    refreshDuplicateState();
    setInterval(refreshDuplicateState, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  guard.tabGuardLog('DuplicateTabGuard', 'Initialized');
})();
