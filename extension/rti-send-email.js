(function () {
  'use strict';

  const INPUT_SELECTOR = 'e-select div[role="button"] input[type="hidden"]';
  let lastValue = null;

  function getInput() {
    return document.querySelector(INPUT_SELECTOR);
  }

  function checkValue() {
    const input = getInput();
    if (!input) return;
    const val = String(input.value || input.getAttribute('value') || '').trim();
    if (!val || val === lastValue) return;
    lastValue = val;
    try {
      chrome.runtime.sendMessage({ action: 'ecPreviewCampaignChanged', campaignId: val });
    } catch (_) {}
  }

  // MutationObserver catches attribute-based value changes inside e-select
  function startSelectObserver() {
    const eSelect = document.querySelector('e-select');
    if (!eSelect) return false;
    const obs = new MutationObserver(checkValue);
    obs.observe(eSelect, { attributes: true, subtree: true, attributeFilter: ['value'] });
    return true;
  }

  // Interval fallback catches JS property assignments that don't reflect to the attribute
  setInterval(checkValue, 300);

  if (!startSelectObserver()) {
    if (typeof gemDomWatchWaitFor === 'function') {
      gemDomWatchWaitFor('e-select', () => startSelectObserver());
    } else {
      const domObs = new MutationObserver(() => {
        if (startSelectObserver()) domObs.disconnect();
      });
      domObs.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
})();
