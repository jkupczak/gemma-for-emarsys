// campaign-tab-guard-common.js
// Shared helpers, settings, coordinator, and debug logging for campaign tab guards.
(function () {
  'use strict';

  const GEM_DUPLICATE_TAB_GUARD_KEY = 'gemDuplicateTabGuardEnabled';
  const GEM_STALE_TAB_GUARD_KEY = 'gemStaleTabGuardEnabled';

  const settings = {
    duplicateTabGuardEnabled: true,
    staleTabGuardEnabled: true,
  };

  const coordinator = {
    staleModalOpen: false,
    staleContinueRisky: false,
    pendingDuplicateActivation: null,
  };

  function isCampaignEditorPage() {
    try {
      return (
        /contentBlocks(?:\/|%2F)campaign/i.test(window.location.href)
        && !/gemStripped=true/i.test(window.location.href)
      );
    } catch (_) {
      return false;
    }
  }

  function getCampaignIdFromUrl() {
    try {
      const match = window.location.search.match(/[?&]id=(\d+)/);
      return match ? match[1] : '';
    } catch (_) {
      return '';
    }
  }

  function getSessionIdFromUrl() {
    try {
      return (new URL(window.location.href).searchParams.get('session_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function readLocalUnsaved() {
    try {
      if (typeof window.gemIsDraftSaveUnsaved === 'function') {
        return window.gemIsDraftSaveUnsaved();
      }
      const saveButton = document.querySelector(
        'cb-draft-save-button button, gem-cb-draft-save-button button'
      );
      if (!saveButton) return false;
      if (saveButton.disabled) return false;
      if (saveButton.hasAttribute('disabled')) return false;
      if (saveButton.getAttribute('aria-disabled') === 'true') return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function tabGuardLog(feature, message, data) {
    const debugOn =
      typeof window.gemIsDebugLoggingEnabled === 'function' && window.gemIsDebugLoggingEnabled();
    if (!debugOn) return;
    if (data !== undefined) {
      console.log(`[Gem][${feature}] ${message}`, data);
    } else {
      console.log(`[Gem][${feature}] ${message}`);
    }
  }

  function loadTabGuardSettings(callback) {
    try {
      chrome.storage.sync.get(
        {
          [GEM_DUPLICATE_TAB_GUARD_KEY]: true,
          [GEM_STALE_TAB_GUARD_KEY]: true,
        },
        (result) => {
          settings.duplicateTabGuardEnabled = result[GEM_DUPLICATE_TAB_GUARD_KEY] !== false;
          settings.staleTabGuardEnabled = result[GEM_STALE_TAB_GUARD_KEY] !== false;
          if (typeof callback === 'function') callback({ ...settings });
        }
      );
    } catch (_) {
      if (typeof callback === 'function') callback({ ...settings });
    }
  }

  function isDuplicateTabGuardEnabled() {
    return settings.duplicateTabGuardEnabled !== false;
  }

  function isStaleTabGuardEnabled() {
    return settings.staleTabGuardEnabled !== false;
  }

  function notifyStaleModalShown() {
    coordinator.staleModalOpen = true;
    tabGuardLog('TabGuardCoord', 'Stale modal shown — deferring duplicate activation');
  }

  function notifyStaleModalHidden(options) {
    const dismissedContinue = !!(options && options.continueRisky);
    coordinator.staleModalOpen = false;
    coordinator.staleContinueRisky = dismissedContinue;
    tabGuardLog('TabGuardCoord', 'Stale modal hidden', {
      continueRisky: dismissedContinue,
      hasPendingDuplicateActivation: !!coordinator.pendingDuplicateActivation,
    });
    if (coordinator.pendingDuplicateActivation) {
      const showFn = coordinator.pendingDuplicateActivation;
      coordinator.pendingDuplicateActivation = null;
      showFn();
    }
  }

  function requestDuplicateActivation(showFn) {
    if (!isDuplicateTabGuardEnabled()) return false;
    if (coordinator.staleModalOpen) {
      coordinator.pendingDuplicateActivation = showFn;
      tabGuardLog('TabGuardCoord', 'Duplicate activation deferred until stale modal closes');
      return false;
    }
    showFn();
    return true;
  }

  function shouldDeferDuplicateActivation() {
    return coordinator.staleModalOpen;
  }

  function isStaleContinueRisky() {
    return coordinator.staleContinueRisky;
  }

  function clearStaleContinueRisky() {
    coordinator.staleContinueRisky = false;
    tabGuardLog('TabGuardCoord', 'Stale continue-risky cleared');
  }

  function forceCloseStaleModalState() {
    coordinator.staleModalOpen = false;
    coordinator.pendingDuplicateActivation = null;
    tabGuardLog('TabGuardCoord', 'Stale modal state force-closed');
  }

  function checkCampaignTabClosedReopen(campaignId) {
    return new Promise((resolve) => {
      if (!campaignId || !chrome?.runtime?.sendMessage) {
        resolve(false);
        return;
      }
      chrome.runtime.sendMessage(
        { action: 'checkCampaignTabClosedReopen', campaignId },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            resolve(false);
            return;
          }
          resolve(!!res.wasClosedReopen);
        }
      );
    });
  }

  function formatDuplicateTabIndexLabel(index) {
    const n = Number(index);
    if (!Number.isFinite(n) || n < 1) return '';
    return `(${n})`;
  }

  function buildDuplicateTabIndexChipHtml(index) {
    const n = Number(index);
    if (!Number.isFinite(n) || n < 1) return '';
    const label = String(n);
    const wideClass = label.length > 1 ? ' gem-duplicate-tab-table__index-chip--wide' : '';
    return (
      '<span class="gem-duplicate-tab-table__index-chip' + wideClass + '" aria-label="Tab ' + escapeHtml(label) + '">' +
        escapeHtml(label) +
      '</span>'
    );
  }

  function sortTabsForDuplicateIndex(tabs) {
    return (Array.isArray(tabs) ? tabs : []).slice().sort((a, b) => {
      const aOpen = Number(a && a.openedAt) || 0;
      const bOpen = Number(b && b.openedAt) || 0;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return (Number(a && a.tabId) || 0) - (Number(b && b.tabId) || 0);
    });
  }

  function annotateDuplicateTabIndices(allTabs) {
    const sorted = sortTabsForDuplicateIndex(allTabs);
    const indexByTabId = new Map();
    sorted.forEach((tab, index) => {
      if (tab && tab.tabId != null) indexByTabId.set(tab.tabId, index + 1);
    });
    return (Array.isArray(allTabs) ? allTabs : []).map((tab) => ({
      ...tab,
      duplicateTabIndex: tab && tab.tabId != null ? indexByTabId.get(tab.tabId) || null : null,
    }));
  }

  function getDuplicateTabIndexForTab(allTabs, tabId) {
    if (tabId == null) return null;
    const annotated = annotateDuplicateTabIndices(allTabs);
    const match = annotated.find((tab) => tab.tabId === tabId);
    return match && match.duplicateTabIndex != null ? match.duplicateTabIndex : null;
  }

  function formatOtherTabLabel(tabInfo, index) {
    const duplicateIndex =
      tabInfo && tabInfo.duplicateTabIndex != null ? tabInfo.duplicateTabIndex : null;
    if (duplicateIndex != null) {
      const label = formatDuplicateTabIndexLabel(duplicateIndex);
      const unsaved = !!(tabInfo && tabInfo.unsaved);
      return unsaved ? `${label} (unsaved)` : label;
    }
    const title = String((tabInfo && tabInfo.title) || '').trim() || `Tab ${index + 1}`;
    const unsaved = !!(tabInfo && tabInfo.unsaved);
    const short = title.length > 48 ? `${title.slice(0, 45)}…` : title;
    return unsaved ? `${short} (unsaved)` : short;
  }

  function formatRelativeTime(ts) {
    const n = Number.parseInt(String(ts), 10) || 0;
    if (!n) return '';
    const diffMs = Date.now() - n;
    if (diffMs < 45000) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatTabSaveStatus(tabInfo) {
    if (!tabInfo) return '—';
    const savedAt = Number(tabInfo.lastSavedAt) || 0;
    const refreshedAt = Number(tabInfo.lastRefreshedAt) || 0;

    if (savedAt && refreshedAt) {
      if (refreshedAt > savedAt) {
        const relative = formatRelativeTime(refreshedAt);
        return relative ? `Refreshed ${relative}` : '—';
      }
      const relative = formatRelativeTime(savedAt);
      return relative ? `Saved ${relative}` : '—';
    }
    if (savedAt) {
      const relative = formatRelativeTime(savedAt);
      return relative ? `Saved ${relative}` : '—';
    }
    if (refreshedAt) {
      const relative = formatRelativeTime(refreshedAt);
      return relative ? `Refreshed ${relative}` : '—';
    }
    return '—';
  }

  function formatTabUnsavedStatus(tabInfo) {
    if (!tabInfo) return '—';
    return tabInfo.unsaved ? 'Unsaved' : 'None';
  }

  function formatTabAge(tabInfo) {
    if (!tabInfo) return '—';
    const n = Number.parseInt(String(tabInfo.openedAt), 10) || 0;
    if (!n) return '—';
    const diffMs = Date.now() - n;
    if (diffMs < 45000) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function sortTabsByLastSaved(tabs) {
    return (Array.isArray(tabs) ? tabs : []).slice().sort((a, b) => {
      const aTs = Math.max(Number(a && a.lastSavedAt) || 0, Number(a && a.lastRefreshedAt) || 0);
      const bTs = Math.max(Number(b && b.lastSavedAt) || 0, Number(b && b.lastRefreshedAt) || 0);
      return bTs - aTs;
    });
  }

  function buildDuplicateTabTableHtml(allTabs) {
    const annotated = annotateDuplicateTabIndices(allTabs);
    const tabs = sortTabsByLastSaved(annotated);
    if (!tabs.length) return '';

    const rows = tabs
      .map((tab) => {
        const title = buildDuplicateTabIndexChipHtml(tab.duplicateTabIndex)
          || escapeHtml(`Tab ${tab.duplicateTabIndex || '?'}`);
        const status = escapeHtml(formatTabSaveStatus(tab));
        const age = escapeHtml(formatTabAge(tab));
        const unsavedStatus = escapeHtml(formatTabUnsavedStatus(tab));
        const unsavedClass = tab.unsaved ? ' gem-duplicate-tab-table__cell--unsaved-yes' : '';
        const activeChip = tab.isActive
          ? '<span class="gem-duplicate-tab-table__chip gem-duplicate-tab-table__chip--active">Active</span>'
          : '';
        const rowClass = tab.isActive ? ' gem-duplicate-tab-table__row--active' : '';
        const switchable = tab.isActive ? '' : ' data-action="focus-tab" data-tab-id="' + tab.tabId + '" tabindex="0" role="button"';
        return (
          '<tr class="gem-duplicate-tab-table__row' + rowClass + '"' + switchable + '>' +
            '<td class="gem-duplicate-tab-table__cell gem-duplicate-tab-table__cell--title">' +
              '<span class="gem-duplicate-tab-table__title">' + title + '</span>' +
              activeChip +
            '</td>' +
            '<td class="gem-duplicate-tab-table__cell gem-duplicate-tab-table__cell--age">' + age + '</td>' +
            '<td class="gem-duplicate-tab-table__cell gem-duplicate-tab-table__cell--status">' + status + '</td>' +
            '<td class="gem-duplicate-tab-table__cell gem-duplicate-tab-table__cell--unsaved' + unsavedClass + '">' + unsavedStatus + '</td>' +
            '<td class="gem-duplicate-tab-table__cell gem-duplicate-tab-table__cell--close">' +
              '<button type="button" class="e-btn gem-duplicate-tab-table__close" data-action="close-tab" data-tab-id="' + tab.tabId + '">Close</button>' +
            '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="gem-duplicate-tab-table-wrap">' +
        '<table class="gem-duplicate-tab-table">' +
          '<thead><tr>' +
            '<th scope="col">Tab</th>' +
            '<th scope="col">Age</th>' +
            '<th scope="col">Status</th>' +
            '<th scope="col">Unsaved</th>' +
            '<th scope="col" class="gem-duplicate-tab-table__head-close"><span class="gem-duplicate-tab-table__sr-only">Close</span></th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<p class="gem-duplicate-tab-table__hint">Click a row to switch to that tab.</p>' +
      '</div>'
    );
  }

  function bindDuplicateTabTable(root, focusTabFn, closeTabFn) {
    if (!root) return;

    root.querySelectorAll('[data-action="close-tab"][data-tab-id]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tabId = Number(btn.getAttribute('data-tab-id'));
        if (Number.isFinite(tabId) && typeof closeTabFn === 'function') {
          closeTabFn(tabId);
        }
      });
    });

    if (typeof focusTabFn !== 'function') return;

    root.querySelectorAll('[data-action="focus-tab"][data-tab-id]').forEach((row) => {
      const activate = () => {
        const tabId = Number(row.getAttribute('data-tab-id'));
        if (Number.isFinite(tabId)) focusTabFn(tabId);
      };
      row.addEventListener('click', activate);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildTabSwitchControlsHtml(otherTabs, actionPrefix, allTabsForIndex) {
    const tabs = Array.isArray(otherTabs) ? otherTabs : [];
    if (!tabs.length) return '';

    const indexSource = Array.isArray(allTabsForIndex) && allTabsForIndex.length
      ? allTabsForIndex
      : tabs;
    const indexByTabId = new Map(
      annotateDuplicateTabIndices(indexSource).map((tab) => [tab.tabId, tab.duplicateTabIndex])
    );
    const tabWithIndex = (tab) => ({
      ...tab,
      duplicateTabIndex: indexByTabId.get(tab.tabId) ?? null,
    });

    if (tabs.length === 1) {
      const tab = tabWithIndex(tabs[0]);
      const label = escapeHtml(formatOtherTabLabel(tab, 0));
      return (
        `<button type="button" class="e-btn e-btn-primary ${actionPrefix}__switch" data-action="switch" data-tab-id="${tab.tabId}">` +
          `Switch to ${label}` +
        '</button>'
      );
    }

    const items = tabs
      .map((tab, index) => {
        const label = escapeHtml(formatOtherTabLabel(tabWithIndex(tab), index));
        return (
          `<button type="button" class="gem-duplicate-tab-switch-option" data-action="switch" data-tab-id="${tab.tabId}">${label}</button>`
        );
      })
      .join('');

    return (
      '<div class="gem-duplicate-tab-switch-menu">' +
        `<button type="button" class="e-btn e-btn-primary ${actionPrefix}__switch" data-action="switch-menu" aria-haspopup="true" aria-expanded="false">` +
          `Switch to tab (${tabs.length}) ▾` +
        '</button>' +
        `<div class="gem-duplicate-tab-switch-dropdown" hidden>${items}</div>` +
      '</div>'
    );
  }

  function bindTabSwitchControls(root, focusTabFn) {
    if (!root || typeof focusTabFn !== 'function') return;

    root.querySelectorAll('[data-action="switch"][data-tab-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = Number(btn.getAttribute('data-tab-id'));
        if (Number.isFinite(tabId)) focusTabFn(tabId);
      });
    });

    const menuBtn = root.querySelector('[data-action="switch-menu"]');
    const dropdown = root.querySelector('.gem-duplicate-tab-switch-dropdown');
    if (!menuBtn || !dropdown) return;

    const closeDropdown = () => {
      dropdown.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    };

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const nextOpen = dropdown.hidden;
      dropdown.hidden = !nextOpen;
      menuBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    });

    dropdown.querySelectorAll('[data-action="switch"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = Number(btn.getAttribute('data-tab-id'));
        closeDropdown();
        if (Number.isFinite(tabId)) focusTabFn(tabId);
      });
    });

    if (!root._gemTabSwitchOutsideBound) {
      root._gemTabSwitchOutsideBound = true;
      document.addEventListener('click', (event) => {
        if (!root.contains(event.target)) closeDropdown();
      });
    }
  }

  function initTabGuardSettingsListener(onChange) {
    loadTabGuardSettings(onChange);
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        let changed = false;
        if (changes[GEM_DUPLICATE_TAB_GUARD_KEY]) {
          settings.duplicateTabGuardEnabled = changes[GEM_DUPLICATE_TAB_GUARD_KEY].newValue !== false;
          changed = true;
        }
        if (changes[GEM_STALE_TAB_GUARD_KEY]) {
          settings.staleTabGuardEnabled = changes[GEM_STALE_TAB_GUARD_KEY].newValue !== false;
          changed = true;
        }
        if (changed && typeof onChange === 'function') onChange({ ...settings });
      });
    } catch (_) {}
  }

  window.GEM_DUPLICATE_TAB_GUARD_KEY = GEM_DUPLICATE_TAB_GUARD_KEY;
  window.GEM_STALE_TAB_GUARD_KEY = GEM_STALE_TAB_GUARD_KEY;
  window.gemCampaignTabGuard = {
    isCampaignEditorPage,
    getCampaignIdFromUrl,
    getSessionIdFromUrl,
    readLocalUnsaved,
    tabGuardLog,
    loadTabGuardSettings,
    initTabGuardSettingsListener,
    isDuplicateTabGuardEnabled,
    isStaleTabGuardEnabled,
    notifyStaleModalShown,
    notifyStaleModalHidden,
    requestDuplicateActivation,
    shouldDeferDuplicateActivation,
    isStaleContinueRisky,
    clearStaleContinueRisky,
    forceCloseStaleModalState,
    checkCampaignTabClosedReopen,
    buildTabSwitchControlsHtml,
    bindTabSwitchControls,
    formatOtherTabLabel,
    formatDuplicateTabIndexLabel,
    buildDuplicateTabIndexChipHtml,
    sortTabsForDuplicateIndex,
    annotateDuplicateTabIndices,
    getDuplicateTabIndexForTab,
    formatRelativeTime,
    formatTabSaveStatus,
    formatTabUnsavedStatus,
    formatTabAge,
    sortTabsByLastSaved,
    buildDuplicateTabTableHtml,
    bindDuplicateTabTable,
  };
})();
