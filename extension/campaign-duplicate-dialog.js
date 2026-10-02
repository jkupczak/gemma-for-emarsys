(function () {
  'use strict';

  const DIALOG_ID = 'gem-campaign-duplicate-dialog';
  let duplicateRequestSeq = 0;
  let escapeHandler = null;
  let dialogCloseCallback = null;

  function duplicateFailureMessage(reason) {
    if (reason === 'no_auth_token') {
      return 'Could not obtain auth token. Try refreshing the page.';
    }
    return `Duplicate failed (${reason || 'unknown'}).`;
  }

  function buildDefaultOpenUrl(newCampaignId, sessionId, includeCamp3Step) {
    const url = new URL('/campaignmanager.php', window.location.origin);
    if (sessionId) url.searchParams.set('session_id', sessionId);
    url.searchParams.set('action', 'details');
    url.searchParams.set('camp_id', String(newCampaignId));
    if (includeCamp3Step) {
      url.searchParams.set('step', 'camp3');
      url.searchParams.set('sec', String(Date.now()));
    }
    return url.toString();
  }

  window.gemBuildDuplicatedCampaignUrl = function gemBuildDuplicatedCampaignUrl(
    newCampaignId,
    sessionId,
    includeCamp3Step
  ) {
    return buildDefaultOpenUrl(newCampaignId, sessionId, !!includeCamp3Step);
  };

  function detachEscapeHandler() {
    if (!escapeHandler) return;
    document.removeEventListener('keydown', escapeHandler, true);
    escapeHandler = null;
  }

  function raiseDuplicateDialogLayer(overlay) {
    if (!overlay) return;
    if (document.body && overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(overlay, { tier: 'modal' });
      return;
    }
    overlay.style.zIndex = '2147483000';
  }

  function releaseDuplicateDialogLayer(overlay) {
    if (!overlay) return;
    if (typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(overlay);
    }
    overlay.style.removeProperty('z-index');
  }

  function hideDialog() {
    const overlay = document.getElementById(DIALOG_ID);
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    releaseDuplicateDialogLayer(overlay);
    detachEscapeHandler();
    if (dialogCloseCallback) {
      const cb = dialogCloseCallback;
      dialogCloseCallback = null;
      cb();
    }
  }

  function ensureDialog() {
    let overlay = document.getElementById(DIALOG_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = DIALOG_ID;
    overlay.className = 'gem-campaign-duplicate-dialog';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="gem-campaign-duplicate-dialog__scrim" aria-hidden="true"></div>' +
      '<div class="gem-campaign-duplicate-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="gem-campaign-duplicate-dialog-title">' +
      '<button type="button" class="gem-campaign-duplicate-dialog__close e-btn e-btn-borderless e-btn-onlyicon" aria-label="Close">✕</button>' +
      '<div class="gem-campaign-duplicate-dialog__body">' +
      '<div class="gem-campaign-duplicate-dialog__status">' +
      '<span class="gem-recent-campaign-duplicate-spinner gem-campaign-duplicate-dialog__status-spinner" aria-hidden="true"></span>' +
      '<p id="gem-campaign-duplicate-dialog-title" class="gem-campaign-duplicate-dialog__message"></p>' +
      '</div>' +
      '<div class="gem-campaign-duplicate-dialog__actions" hidden>' +
      '<a class="e-btn e-btn-primary gem-campaign-duplicate-dialog__open-link" href="#">Open duplicated campaign</a>' +
      '</div>' +
      '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('.gem-campaign-duplicate-dialog__scrim')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    overlay.querySelector('.gem-campaign-duplicate-dialog__close')?.addEventListener('click', () => {
      hideDialog();
    });

    return overlay;
  }

  function setLoadingState(overlay) {
    overlay.classList.remove(
      'gem-campaign-duplicate-dialog--success',
      'gem-campaign-duplicate-dialog--error'
    );
    const spinner = overlay.querySelector('.gem-campaign-duplicate-dialog__status-spinner');
    if (spinner) spinner.hidden = false;
    const message = overlay.querySelector('.gem-campaign-duplicate-dialog__message');
    if (message) {
      message.textContent =
        'We’re working on duplicating this email campaign. This may take a moment.';
    }
    const actions = overlay.querySelector('.gem-campaign-duplicate-dialog__actions');
    if (actions) actions.hidden = true;
  }

  function setSuccessState(overlay, openUrl) {
    overlay.classList.remove('gem-campaign-duplicate-dialog--error');
    overlay.classList.add('gem-campaign-duplicate-dialog--success');
    const spinner = overlay.querySelector('.gem-campaign-duplicate-dialog__status-spinner');
    if (spinner) spinner.hidden = true;
    const message = overlay.querySelector('.gem-campaign-duplicate-dialog__message');
    if (message) {
      message.textContent = 'Your duplicated email campaign is ready.';
    }
    const link = overlay.querySelector('.gem-campaign-duplicate-dialog__open-link');
    if (link) link.href = openUrl;
    const actions = overlay.querySelector('.gem-campaign-duplicate-dialog__actions');
    if (actions) actions.hidden = false;
  }

  function setErrorState(overlay, message) {
    overlay.classList.remove('gem-campaign-duplicate-dialog--success');
    overlay.classList.add('gem-campaign-duplicate-dialog--error');
    const spinner = overlay.querySelector('.gem-campaign-duplicate-dialog__status-spinner');
    if (spinner) spinner.hidden = true;
    const messageEl = overlay.querySelector('.gem-campaign-duplicate-dialog__message');
    if (messageEl) messageEl.textContent = message;
    const actions = overlay.querySelector('.gem-campaign-duplicate-dialog__actions');
    if (actions) actions.hidden = true;
  }

  window.gemRunCampaignDuplicateWithDialog = function gemRunCampaignDuplicateWithDialog(options) {
    options = options || {};
    const campaignId = String(options.campaignId || '').trim();
    const sessionId = options.sessionId != null ? String(options.sessionId) : '';

    if (!campaignId) {
      if (window.gemShowToast) {
        window.gemShowToast('Missing campaign ID — cannot duplicate.', { type: 'error' });
      }
      return false;
    }
    if (typeof window.gemDuplicateCampaign !== 'function') {
      if (window.gemShowToast) {
        window.gemShowToast('Duplicate is unavailable on this page.', { type: 'error' });
      }
      return false;
    }

    const requestSeq = ++duplicateRequestSeq;
    const onSettled = typeof options.onSettled === 'function' ? options.onSettled : null;
    let triggerResetDone = false;

    function resetTriggerOnce() {
      if (triggerResetDone) return;
      triggerResetDone = true;
      if (onSettled) onSettled();
    }

    if (typeof options.onBeforeStart === 'function') {
      options.onBeforeStart();
    }

    const overlay = ensureDialog();
    dialogCloseCallback = () => {
      resetTriggerOnce();
      if (typeof options.onDialogClose === 'function') options.onDialogClose();
    };

    setLoadingState(overlay);
    overlay.hidden = false;
    overlay.removeAttribute('aria-hidden');
    raiseDuplicateDialogLayer(overlay);

    detachEscapeHandler();
    escapeHandler = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      hideDialog();
    };
    document.addEventListener('keydown', escapeHandler, true);

    const buildOpenUrl =
      typeof options.buildOpenUrl === 'function'
        ? options.buildOpenUrl
        : (newId) => buildDefaultOpenUrl(newId, sessionId, !!options.includeCamp3Step);

    window.gemDuplicateCampaign(campaignId, sessionId).then((res) => {
      if (requestSeq !== duplicateRequestSeq) return;

      const dialogOpen = overlay.isConnected && !overlay.hidden;

      if (!res || !res.ok || res.newCampaignId == null) {
        const msg = duplicateFailureMessage(res && res.reason);
        if (dialogOpen) {
          setErrorState(overlay, msg);
        }
        if (window.gemShowToast) {
          window.gemShowToast(msg, { type: 'error' });
        }
        resetTriggerOnce();
        return;
      }

      let openUrl;
      try {
        openUrl = buildOpenUrl(res.newCampaignId);
      } catch (_) {
        openUrl = buildDefaultOpenUrl(res.newCampaignId, sessionId, !!options.includeCamp3Step);
      }

      if (dialogOpen) {
        setSuccessState(overlay, openUrl);
      }
      resetTriggerOnce();
    });

    return true;
  };
})();
