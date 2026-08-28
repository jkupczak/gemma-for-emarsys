console.log('[Gem] campaign-nav-count-pips.js loaded');

(function () {
  const PREVIEW_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';
  const PIP_CLASS = 'gem-nav-count-pip';
  const TAB_IDS = {
    links: 'linksTab',
    locales: 'localesTab',
    versions: 'versionsTab',
  };

  let linksRefreshTimer = null;
  let boundPreviewIframe = null;
  let boundPreviewDocObserver = null;
  let boundPreviewLoadHandler = null;

  let boundLocaleHost = null;
  let localeObserver = null;
  let lastLocaleCount = null;

  let boundVersionSelect = null;
  let versionObserver = null;
  let lastVersionCount = null;

  function getTabItem(tabId) {
    const tab = document.getElementById(tabId);
    if (!tab) return null;
    return tab.querySelector('.e-verticalnavitem');
  }

  function ensurePip(tabId) {
    const item = getTabItem(tabId);
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

  function setPipCount(tabId, count, hideAtOrBelow) {
    const pip = ensurePip(tabId);
    if (!pip) return false;
    const safe = Math.max(0, Number.parseInt(String(count), 10) || 0);
    const hideBelow = hideAtOrBelow == null ? 0 : hideAtOrBelow;
    if (safe <= hideBelow) {
      pip.textContent = '0';
      pip.style.display = 'none';
      return true;
    }
    pip.textContent = String(Math.min(99, safe));
    pip.style.display = '';
    return true;
  }

  function getPreviewDocument() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    if (!iframe) return null;
    try {
      return iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document) || null;
    } catch (_) {
      return null;
    }
  }

  function isEditableAnchor(anchor) {
    if (!anchor) return false;
    try {
      if (anchor.closest('[e-editable]')) return true;
      if (anchor.querySelector('[e-editable]')) return true;
    } catch (_) {}
    return false;
  }

  function countEditableAnchors() {
    const doc = getPreviewDocument();
    if (!doc || !doc.body) return 0;
    let count = 0;
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      if (isEditableAnchor(anchor)) count += 1;
    });
    return count;
  }

  function countLanguageOptions() {
    const selector = document.querySelector('vce-languages-selector');
    if (!selector) return 0;
    return selector.querySelectorAll('e-select-option').length;
  }

  function countVersionOptions() {
    const select = document.querySelector('cb-version-selector select');
    if (!select) return 0;
    return Array.from(select.options).filter((opt) => String(opt.value || '').trim()).length;
  }

  function refreshLinksPip() {
    setPipCount(TAB_IDS.links, countEditableAnchors(), 0);
  }

  function refreshLocalesPip() {
    const count = countLanguageOptions();
    const item = getTabItem(TAB_IDS.locales);
    if (!item) return;
    if (count === lastLocaleCount && item.querySelector(`.${PIP_CLASS}`)) return;
    if (!setPipCount(TAB_IDS.locales, count, 1)) return;
    lastLocaleCount = count;
  }

  function refreshVersionsPip() {
    const count = countVersionOptions();
    const item = getTabItem(TAB_IDS.versions);
    if (!item) return;
    if (count === lastVersionCount && item.querySelector(`.${PIP_CLASS}`)) return;
    if (!setPipCount(TAB_IDS.versions, count, 1)) return;
    lastVersionCount = count;
  }

  function scheduleLinksRefresh() {
    if (linksRefreshTimer) clearTimeout(linksRefreshTimer);
    linksRefreshTimer = setTimeout(() => {
      linksRefreshTimer = null;
      refreshLinksPip();
    }, 80);
  }

  function disconnectPreviewDocObserver() {
    if (boundPreviewDocObserver) {
      try {
        boundPreviewDocObserver.disconnect();
      } catch (_) {}
      boundPreviewDocObserver = null;
    }
  }

  function observePreviewDocument(iframe) {
    disconnectPreviewDocObserver();
    try {
      const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!doc) return;
      boundPreviewDocObserver = new MutationObserver(() => scheduleLinksRefresh());
      boundPreviewDocObserver.observe(doc.documentElement || doc, {
        childList: true,
        subtree: true,
      });
    } catch (_) {}
  }

  function bindPreviewIframe() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    if (!iframe) {
      if (boundPreviewIframe && boundPreviewLoadHandler) {
        try {
          boundPreviewIframe.removeEventListener('load', boundPreviewLoadHandler, true);
        } catch (_) {}
      }
      boundPreviewIframe = null;
      boundPreviewLoadHandler = null;
      disconnectPreviewDocObserver();
      return false;
    }

    if (boundPreviewIframe === iframe && boundPreviewLoadHandler) {
      observePreviewDocument(iframe);
      return true;
    }

    if (boundPreviewIframe && boundPreviewLoadHandler) {
      try {
        boundPreviewIframe.removeEventListener('load', boundPreviewLoadHandler, true);
      } catch (_) {}
    }

    boundPreviewLoadHandler = () => {
      observePreviewDocument(iframe);
      scheduleLinksRefresh();
    };
    iframe.addEventListener('load', boundPreviewLoadHandler, true);
    boundPreviewIframe = iframe;
    observePreviewDocument(iframe);
    return true;
  }

  function disconnectLocaleObserver() {
    if (localeObserver) {
      try {
        localeObserver.disconnect();
      } catch (_) {}
      localeObserver = null;
    }
    boundLocaleHost = null;
  }

  function bindLocaleHost() {
    const host = document.querySelector('vce-languages-selector');
    if (!host) {
      disconnectLocaleObserver();
      lastLocaleCount = null;
      refreshLocalesPip();
      return false;
    }
    if (boundLocaleHost === host && localeObserver) return true;

    disconnectLocaleObserver();
    boundLocaleHost = host;
    lastLocaleCount = null;
    localeObserver = new MutationObserver(() => refreshLocalesPip());
    localeObserver.observe(host, { childList: true, subtree: true });
    refreshLocalesPip();
    return true;
  }

  function disconnectVersionObserver() {
    if (versionObserver) {
      try {
        versionObserver.disconnect();
      } catch (_) {}
      versionObserver = null;
    }
    boundVersionSelect = null;
  }

  function bindVersionSelect() {
    const select = document.querySelector('cb-version-selector select');
    if (!select) {
      disconnectVersionObserver();
      lastVersionCount = null;
      refreshVersionsPip();
      return false;
    }
    if (boundVersionSelect === select && versionObserver) return true;

    disconnectVersionObserver();
    boundVersionSelect = select;
    lastVersionCount = null;
    versionObserver = new MutationObserver(() => refreshVersionsPip());
    versionObserver.observe(select, { childList: true });
    refreshVersionsPip();
    return true;
  }

  function hostNeedsRebind(boundEl, currentEl) {
    if (!currentEl) return !!boundEl;
    if (boundEl !== currentEl) return true;
    return !!(boundEl && !boundEl.isConnected);
  }

  function ensureHostBindings() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    if (hostNeedsRebind(boundPreviewIframe, iframe)) {
      bindPreviewIframe();
      refreshLinksPip();
    }

    const localeHost = document.querySelector('vce-languages-selector');
    if (hostNeedsRebind(boundLocaleHost, localeHost)) bindLocaleHost();

    const versionSelect = document.querySelector('cb-version-selector select');
    if (hostNeedsRebind(boundVersionSelect, versionSelect)) bindVersionSelect();

    if (lastLocaleCount == null) refreshLocalesPip();
    if (lastVersionCount == null) refreshVersionsPip();
  }

  function start() {
    bindPreviewIframe();
    refreshLinksPip();
    bindLocaleHost();
    bindVersionSelect();

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => ensureHostBindings());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
