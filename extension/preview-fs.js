(function () {
  'use strict';

  function getUrlParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch (_) {
      return '';
    }
  }

  function duplicateCampaign(campaignId, sessionId) {
    if (typeof window.gemDuplicateCampaign === 'function') {
      return window.gemDuplicateCampaign(campaignId, sessionId);
    }
    return Promise.resolve({ ok: false, reason: 'no_auth_helper' });
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
    window.gemDomWatchWaitFor('#functionButtonGroup', function () {
      tryInject();
    });
  }
})();
