// campaign-stale-tab-guard.js
// Warns when a reopened campaign editor tab may show stale content.
(function () {
  'use strict';

  const guard = window.gemCampaignTabGuard;
  if (!guard) return;

  const MODAL_ID = 'gem-stale-tab-modal';
  const BACKDROP_ID = 'gem-stale-tab-backdrop';
  const SESSION_REVISION_PREFIX = 'gemTabCampaignRevision_';
  const DRAFT_KEY_PREFIX = 'gemDraft_';
  const DISMISSED_FLAG = '__gemStaleTabGuardDismissed';
  let staleCheckScheduled = false;
  let guardEnabled = true;

  function isBackForwardNavigation() {
    try {
      const entry = performance.getEntriesByType('navigation')[0];
      return !!(entry && entry.type === 'back_forward');
    } catch (_) {
      return false;
    }
  }

  function normalizeRevision(value) {
    const revision = String(value || '').trim();
    return revision || null;
  }

  function isRevisionNewer(candidate, baseline) {
    const next = normalizeRevision(candidate);
    const prev = normalizeRevision(baseline);
    if (!next || !prev || next === prev) return false;

    const dateNext = Date.parse(next);
    const datePrev = Date.parse(prev);
    if (Number.isFinite(dateNext) && Number.isFinite(datePrev)) {
      return dateNext > datePrev;
    }

    return next > prev;
  }

  function extractUpdatedAt(snapshot) {
    try {
      const campaign = snapshot && (snapshot.campaign || snapshot);
      return normalizeRevision(campaign && campaign.updated_at);
    } catch (_) {
      return null;
    }
  }

  function rememberTabRevision(campaignId, updatedAt) {
    const id = String(campaignId || '').trim();
    const revision = normalizeRevision(updatedAt);
    if (!id || !revision) return;
    try {
      sessionStorage.setItem(SESSION_REVISION_PREFIX + id, revision);
    } catch (_) {}
  }

  function readSessionTabRevision(campaignId) {
    try {
      return normalizeRevision(sessionStorage.getItem(SESSION_REVISION_PREFIX + campaignId));
    } catch (_) {
      return null;
    }
  }

  function readTabRevisionFromCache(campaignId) {
    if (typeof window.gemGetCachedContentBlocksSnapshot !== 'function') return null;
    return extractUpdatedAt(window.gemGetCachedContentBlocksSnapshot(campaignId));
  }

  function readStoredDraftRevision(suiteCampaignId) {
    return new Promise((resolve) => {
      const storageKey = DRAFT_KEY_PREFIX + suiteCampaignId;
      try {
        chrome.storage.local.get(storageKey, (result) => {
          const entry = result && result[storageKey];
          resolve(normalizeRevision(entry && entry.updated_at));
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function subscribeRevisionTracking() {
    window.addEventListener('message', (event) => {
      if (!event.data) return;

      const campaignId = guard.getCampaignIdFromUrl();
      if (!campaignId) return;

      if (event.data.type === 'gem-draft-saved') {
        if (event.data.updatedAt) {
          rememberTabRevision(campaignId, event.data.updatedAt);
        }
        guard.clearStaleContinueRisky();
        return;
      }

      if (event.data.source !== 'gem-content-blocks-snapshot-cached') return;

      const cachedId = String(event.data.campaignId || '').trim();
      if (cachedId && cachedId !== campaignId) return;

      const updatedAt = extractUpdatedAt(event.data.snapshot);
      if (updatedAt) rememberTabRevision(campaignId, updatedAt);
    });
  }

  function removeModal(notifyOptions) {
    const modal = document.getElementById(MODAL_ID);
    const backdrop = document.getElementById(BACKDROP_ID);
    const wasOpen = !!modal;
    if (modal && typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(modal);
    }
    if (backdrop && typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(backdrop);
    }
    modal?.remove();
    backdrop?.remove();
    if (wasOpen && notifyOptions) {
      guard.notifyStaleModalHidden(notifyOptions);
    }
  }

  function showStaleTabModal(options) {
    if (!guardEnabled) return;
    if (document.getElementById(MODAL_ID)) return;

    const opts = options || {};
    const restoredFromMemory = !!opts.restoredFromMemory;
    const bodyText = restoredFromMemory
      ? 'This tab was restored after being closed and may not reflect the latest saved content. Refresh before making changes.'
      : 'You saved a newer version recently. Refresh to load the latest saved content before making changes.';

    const backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.className = 'gem-stale-tab-backdrop';

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'gem-stale-tab-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'gem-stale-tab-modal-title');
    modal.innerHTML =
      '<h2 id="gem-stale-tab-modal-title" class="gem-stale-tab-modal__title">' +
        'This tab may be showing an older version of the campaign.' +
      '</h2>' +
      '<p class="gem-stale-tab-modal__body">' +
        bodyText +
      '</p>' +
      '<div class="gem-stale-tab-modal__actions">' +
        '<button type="button" class="e-btn gem-stale-tab-modal__continue" data-action="continue">' +
          'Continue anyway — risky' +
        '</button>' +
        '<button type="button" class="e-btn e-btn-primary gem-stale-tab-modal__refresh" data-action="refresh">' +
          'Refresh now' +
        '</button>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(backdrop, { tier: 'modal' });
      window.gemLayerRaise(modal, { tier: 'modal' });
    }

    guard.notifyStaleModalShown();
    guard.tabGuardLog('StaleTabGuard', 'Modal shown', { reason: opts.reason || 'unknown', restoredFromMemory });

    modal.querySelector('[data-action="refresh"]').addEventListener('click', () => {
      window[DISMISSED_FLAG] = false;
      guard.forceCloseStaleModalState();
      removeModal();
      window.location.reload();
    });

    modal.querySelector('[data-action="continue"]').addEventListener('click', () => {
      window[DISMISSED_FLAG] = true;
      removeModal({ continueRisky: true });
      guard.tabGuardLog('StaleTabGuard', 'User continued with risky stale tab — save guard active');
    });
  }

  function scheduleStaleTabCheck(options) {
    if (!guardEnabled) return;
    if (staleCheckScheduled) return;
    staleCheckScheduled = true;
    void evaluateStaleTabRestore(options || {});
  }

  async function evaluateStaleTabRestore(options) {
    const opts = options || {};
    if (window[DISMISSED_FLAG]) return;
    if (!guardEnabled) return;
    if (!guard.isCampaignEditorPage()) return;

    const campaignId = guard.getCampaignIdFromUrl();
    const sessionId = guard.getSessionIdFromUrl();
    if (!campaignId || !sessionId) return;

    if (opts.restoredFromMemory) {
      showStaleTabModal({
        restoredFromMemory: true,
        reason: opts.reason || 'tab_closed_reopen',
      });
      return;
    }

    const tabRevision = readTabRevisionFromCache(campaignId) || readSessionTabRevision(campaignId);

    if (typeof window.gemFetchContentBlocksSnapshot !== 'function') {
      showStaleTabModal({ reason: 'fetch_unavailable' });
      return;
    }

    const result = await window.gemFetchContentBlocksSnapshot(
      campaignId,
      sessionId,
      null,
      [],
      { forceRefresh: true }
    );

    if (!result || !result.ok) {
      showStaleTabModal({ reason: 'fetch_failed' });
      return;
    }

    const serverRevision = normalizeRevision(result.campaign && result.campaign.updated_at);
    const suiteCampaignId =
      result.campaign && result.campaign.suite_campaign_id != null
        ? String(result.campaign.suite_campaign_id)
        : null;

    let storedRevision = null;
    if (suiteCampaignId) {
      storedRevision = await readStoredDraftRevision(suiteCampaignId);
    }

    guard.tabGuardLog('StaleTabGuard', 'Revision compare', {
      tabRevision,
      serverRevision,
      storedRevision,
    });

    if (!tabRevision) {
      showStaleTabModal({ reason: 'missing_tab_revision' });
      return;
    }

    const staleFromServer = isRevisionNewer(serverRevision, tabRevision);
    const staleFromStorage = isRevisionNewer(storedRevision, tabRevision);

    if (staleFromServer || staleFromStorage) {
      showStaleTabModal({
        reason: staleFromServer ? 'server_revision_newer' : 'storage_revision_newer',
      });
    }
  }

  async function checkClosedTabReopen() {
    if (!guardEnabled) return;
    if (window[DISMISSED_FLAG]) return;
    if (!isBackForwardNavigation()) return;

    const campaignId = guard.getCampaignIdFromUrl();
    if (!campaignId) return;

    const wasClosedReopen = await guard.checkCampaignTabClosedReopen(campaignId);
    guard.tabGuardLog('StaleTabGuard', 'Closed-tab reopen check', {
      campaignId,
      wasClosedReopen,
      navigationType: performance.getEntriesByType('navigation')[0]?.type,
    });

    if (wasClosedReopen) {
      scheduleStaleTabCheck({
        restoredFromMemory: true,
        reason: 'tab_closed_reopen',
      });
    }
  }

  function applyGuardSettings(nextSettings) {
    guardEnabled = !!(nextSettings && nextSettings.staleTabGuardEnabled);
    if (!guardEnabled) {
      removeModal();
    }
  }

  function init() {
    if (!guard.isCampaignEditorPage()) return;

    guard.initTabGuardSettingsListener((nextSettings) => {
      applyGuardSettings(nextSettings);
      if (guardEnabled) void checkClosedTabReopen();
    });

    subscribeRevisionTracking();
    void checkClosedTabReopen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  guard.tabGuardLog('StaleTabGuard', 'Initialized');
})();
