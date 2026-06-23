(function () {
  'use strict';

  const GEM_PREVIEW_IFRAME_ID = 'gem-ec-preview-iframe';

  function getSessionId() {
    try {
      return new URL(window.location.href).searchParams.get('session_id') || '';
    } catch (_) {
      return '';
    }
  }

  function extractResourceId(src) {
    try {
      const match = String(src || '').match(/[?&]resource_id=([^&]+)/i);
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function isSendEmailModal(floatContainer) {
    const titleEl = floatContainer.querySelector('.e-dialog__title');
    return !!titleEl && String(titleEl.textContent || '').trim() === 'Send Email';
  }

  function updateSendEmailClass(floatContainer) {
    if (!floatContainer.matches('e-float-container.js-rti-notification-container')) return;
    const dialogEl = floatContainer.querySelector('.js-rti-node-dialog');
    if (!dialogEl) return;
    const titleEl = floatContainer.querySelector('.e-dialog__title');
    const isSendEmail = !!titleEl && String(titleEl.textContent || '').includes('Send Email');
    dialogEl.classList.toggle('gem-event-modal--send-email', isSendEmail);
  }

  function tryInjectPreviewIframe(floatContainer) {
    if (!isSendEmailModal(floatContainer)) return;
    if (floatContainer.querySelector('#' + GEM_PREVIEW_IFRAME_ID)) return;

    const sourceIframe = floatContainer.querySelector('#integration-rti-node-dialog');
    if (!sourceIframe) return;

    const src = sourceIframe.getAttribute('src') || '';
    const resourceId = extractResourceId(src);
    if (!resourceId) {
      // src not yet set — watch for the attribute to be populated
      watchSourceIframeSrc(floatContainer, sourceIframe);
      return;
    }

    const sessionId = getSessionId();
    const previewUrl =
      `https://suite8.emarsys.net/preview_fs.php` +
      `?session_id=${encodeURIComponent(sessionId)}` +
      `&camp_id=${encodeURIComponent(resourceId)}`;

    const iframe = document.createElement('iframe');
    iframe.id = GEM_PREVIEW_IFRAME_ID;
    iframe.src = previewUrl;
    sourceIframe.insertAdjacentElement('afterend', iframe);
  }

  function watchSourceIframeSrc(floatContainer, sourceIframe) {
    const attrObserver = new MutationObserver(() => {
      const src = sourceIframe.getAttribute('src') || '';
      if (!extractResourceId(src)) return;
      attrObserver.disconnect();
      tryInjectPreviewIframe(floatContainer);
    });
    attrObserver.observe(sourceIframe, { attributes: true, attributeFilter: ['src'] });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.action !== 'ecPreviewCampaignChanged') return;
    const campaignId = String(msg.campaignId || '').trim();
    if (!campaignId) return;
    const iframe = document.getElementById(GEM_PREVIEW_IFRAME_ID);
    if (!iframe) return;
    try {
      const url = new URL(iframe.src);
      url.searchParams.set('camp_id', campaignId);
      iframe.src = url.toString();
    } catch (_) {}
  });

  function processFloatContainer(floatContainer) {
    updateSendEmailClass(floatContainer);
    tryInjectPreviewIframe(floatContainer);
  }

  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe(() => {
      document.querySelectorAll('e-float-container').forEach(processFloatContainer);
    });
  } else {
    const domObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (node.matches('e-float-container')) {
            processFloatContainer(node);
          } else {
            node.querySelectorAll('e-float-container').forEach(processFloatContainer);
          }

          const parentFloat = node.closest && node.closest('e-float-container');
          if (parentFloat) processFloatContainer(parentFloat);
        }
      }
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Handle any float containers already in the DOM when the script loads
  document.querySelectorAll('e-float-container').forEach(processFloatContainer);
})();
