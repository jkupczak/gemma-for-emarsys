(function () {
  'use strict';

  function getUrlParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch (_) {
      return '';
    }
  }

  function fetchGserviceToken(sessionId) {
    const url =
      `${window.location.origin}/bootstrap.php` +
      `?r=frontendAuthentication/getToken` +
      `&session_id=${encodeURIComponent(sessionId)}` +
      `&integration=email-campaign-list`;
    return fetch(url, { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return null;
        if (data.data && typeof data.data.token === 'string') return data.data.token.trim() || null;
        if (typeof data.token === 'string') return data.token.trim() || null;
        return null;
      })
      .catch(function () { return null; });
  }

  function duplicateCampaign(campaignId, sessionId) {
    return fetchGserviceToken(sessionId).then(function (token) {
      if (!token) return { ok: false, reason: 'no_auth_token' };
      return new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            { action: 'duplicateEmarsysCampaign', campaignId: String(campaignId), token: token },
            function (res) {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, reason: 'runtime_error' });
                return;
              }
              resolve(res && typeof res === 'object' ? res : { ok: false, reason: 'empty_response' });
            }
          );
        } catch (_) {
          resolve({ ok: false, reason: 'send_message_error' });
        }
      });
    });
  }

  function buildCampaignDetailsUrl(newCampaignId, sessionId) {
    var url = new URL('/campaignmanager.php', window.location.origin);
    if (sessionId) url.searchParams.set('session_id', sessionId);
    url.searchParams.set('action', 'details');
    url.searchParams.set('camp_id', String(newCampaignId));
    url.searchParams.set('step', 'camp3');
    url.searchParams.set('sec', String(Date.now()));
    return url.toString();
  }

  function injectDuplicateButton(buttonGroup) {
    if (buttonGroup.querySelector('.gem-pfs-duplicate-btn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'e-btn e-btn-primary gem-pfs-duplicate-btn';

    var label = document.createElement('span');
    label.textContent = 'Duplicate';

    var spinner = document.createElement('span');
    spinner.className = 'gem-pfs-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    spinner.hidden = true;

    btn.appendChild(label);
    btn.appendChild(spinner);

    btn.addEventListener('click', function () {
      if (btn.disabled || btn.dataset.gemState === 'busy') return;

      var campId = getUrlParam('camp_id');
      var sessionId = getUrlParam('session_id');
      if (!campId) return;

      btn.disabled = true;
      btn.dataset.gemState = 'busy';
      spinner.hidden = false;

      duplicateCampaign(campId, sessionId).then(function (res) {
        if (!res || !res.ok || res.newCampaignId == null) {
          btn.disabled = false;
          delete btn.dataset.gemState;
          spinner.hidden = true;
          return;
        }

        var newUrl = buildCampaignDetailsUrl(res.newCampaignId, sessionId);
        chrome.runtime.sendMessage({ action: 'openInNewTab', url: newUrl });

        btn.disabled = false;
        delete btn.dataset.gemState;
        spinner.hidden = true;
      });
    });

    buttonGroup.appendChild(btn);
  }

  function tryInject() {
    var group = document.querySelector('#functionButtonGroup');
    if (group) {
      injectDuplicateButton(group);
      return true;
    }
    return false;
  }

  if (!tryInject()) {
    var observer = new MutationObserver(function () {
      if (tryInject()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
