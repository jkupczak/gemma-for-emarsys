// platform.js - lightweight platform helpers shared across Gemma scripts
// Exposes:
// - window.GEM_IS_MAC (boolean)
// - window.GEM_MOD_KEY (string) => "⌘" on macOS, "CTRL" otherwise
// - window.gemModCombo(key) => "⌘+X" / "CTRL+X"
// - window.gemScrollIntoViewIfNeeded(el, { scrollRoot, padding })
(function () {
  function isElementVisibleInScrollRoot(el, scrollRoot, padding) {
    const pad = Number.isFinite(padding) ? padding : 8;
    const elRect = el.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    return (
      elRect.top >= rootRect.top + pad &&
      elRect.bottom <= rootRect.bottom - pad &&
      elRect.left >= rootRect.left + pad &&
      elRect.right <= rootRect.right - pad
    );
  }

  window.gemScrollIntoViewIfNeeded = function gemScrollIntoViewIfNeeded(el, options) {
    if (!el || !el.isConnected) return false;
    const opts = options && typeof options === "object" ? options : {};
    const scrollRoot = opts.scrollRoot;
    if (!scrollRoot || !scrollRoot.isConnected) return false;

    const padding = Number.isFinite(opts.padding) ? opts.padding : 8;
    if (isElementVisibleInScrollRoot(el, scrollRoot, padding)) return false;

    const elRect = el.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();

    if (elRect.top < rootRect.top + padding) {
      scrollRoot.scrollTop += elRect.top - rootRect.top - padding;
    } else if (elRect.bottom > rootRect.bottom - padding) {
      scrollRoot.scrollTop += elRect.bottom - rootRect.bottom + padding;
    }

    return true;
  };

  try {
    const platform =
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      '';

    const isMac = /mac/i.test(String(platform));
    window.GEM_IS_MAC = isMac;
    window.GEM_MOD_KEY = isMac ? '⌘' : 'CTRL';
    window.gemModCombo = function gemModCombo(key) {
      return `${window.GEM_MOD_KEY}+${String(key || '').toUpperCase()}`;
    };
    window.gemPanelShortcutLabel = function gemPanelShortcutLabel(key) {
      return window.gemModCombo(key);
    };
  } catch (_) {
    window.GEM_IS_MAC = false;
    window.GEM_MOD_KEY = 'CTRL';
    window.gemModCombo = function gemModCombo(key) {
      return `CTRL+${String(key || '').toUpperCase()}`;
    };
    window.gemPanelShortcutLabel = function gemPanelShortcutLabel(key) {
      return window.gemModCombo(key);
    };
  }

  function gemIsGemStrippedCampaignUrl(href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.searchParams.get('gemStripped') !== 'true') return false;
      const route = decodeURIComponent(url.searchParams.get('r') || '');
      return route.includes('contentBlocks/campaign');
    } catch (_) {
      return false;
    }
  }

  /**
   * URLSearchParams serializes `/` as %2F. Emarsys routes such as
   * r=emailCampaignList/index and r=contentBlocks/campaign must stay literal
   * so Chrome match patterns and Gemma URL checks still work.
   */
  function gemHrefPreserveQuerySlashes(urlOrHref) {
    let href = '';
    if (typeof urlOrHref === 'string') {
      href = urlOrHref;
    } else if (urlOrHref && typeof urlOrHref.href === 'string') {
      href = urlOrHref.href;
    } else if (urlOrHref && typeof urlOrHref.toString === 'function') {
      href = urlOrHref.toString();
    }
    if (!href) return href;

    const hashIdx = href.indexOf('#');
    const hash = hashIdx === -1 ? '' : href.slice(hashIdx);
    const withoutHash = hashIdx === -1 ? href : href.slice(0, hashIdx);
    const queryIdx = withoutHash.indexOf('?');
    if (queryIdx === -1) return href;
    return withoutHash.slice(0, queryIdx)
      + withoutHash.slice(queryIdx).replace(/%2F/gi, '/')
      + hash;
  }

  window.gemHrefPreserveQuerySlashes = gemHrefPreserveQuerySlashes;
  window.gemIsGemStrippedCampaignUrl = gemIsGemStrippedCampaignUrl;

  window.gemIsGemStrippedEmbedIframe = function gemIsGemStrippedEmbedIframe(iframe) {
    if (!iframe) return false;
    try {
      const win = iframe.contentWindow;
      if (win && win.location && win.location.href) {
        return gemIsGemStrippedCampaignUrl(win.location.href);
      }
    } catch (_) {}
    try {
      const src = iframe.getAttribute('src') || iframe.src || '';
      if (src && src !== 'about:blank') {
        return gemIsGemStrippedCampaignUrl(src);
      }
    } catch (_) {}
    return false;
  };
})();
