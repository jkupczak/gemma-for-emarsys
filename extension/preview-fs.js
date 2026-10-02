(function () {
  'use strict';

  function getUrlParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch (_) {
      return '';
    }
  }

  function injectDuplicateButton(buttonGroup) {
    if (buttonGroup.querySelector('.gem-pfs-duplicate-btn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'e-btn e-btn-primary gem-pfs-duplicate-btn';

    var label = document.createElement('span');
    label.textContent = 'Duplicate';

    var spinner = document.createElement('span');
    spinner.className = 'gem-recent-campaign-duplicate-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    spinner.hidden = true;

    btn.appendChild(label);
    btn.appendChild(spinner);

    btn.addEventListener('click', function () {
      if (btn.disabled || btn.dataset.gemState === 'busy') return;
      if (typeof window.gemRunCampaignDuplicateWithDialog !== 'function') return;

      var campId = getUrlParam('camp_id');
      var sessionId = getUrlParam('session_id');
      if (!campId) return;

      function resetBtn() {
        btn.disabled = false;
        delete btn.dataset.gemState;
        spinner.hidden = true;
      }

      window.gemRunCampaignDuplicateWithDialog({
        campaignId: campId,
        sessionId: sessionId,
        includeCamp3Step: true,
        onBeforeStart: function () {
          btn.disabled = true;
          btn.dataset.gemState = 'busy';
          spinner.hidden = false;
        },
        onSettled: resetBtn,
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
