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

  /** Opens the Email Basics panel on campaign editor load. Replaces any existing hash. */
  function gemWithEmailBasicsHash(href) {
    const raw = String(href || '').trim();
    if (!raw) return raw;
    const hashIdx = raw.indexOf('#');
    const withoutHash = hashIdx === -1 ? raw : raw.slice(0, hashIdx);
    return `${withoutHash}#/email-basics`;
  }

  const GEM_RELOGIN_NAV_HASH_KEY = 'gemReloginNavHashV1';

  function reloginUrlQuerySignature(url) {
    const params = [...url.searchParams.entries()]
      .filter(([key]) => key !== 'session_id')
      .sort(([a], [b]) => a.localeCompare(b));
    return params.map(([key, value]) => `${key}=${value}`).join('&');
  }

  function normalizeReloginPathname(pathname) {
    return String(pathname || '').replace(/\/{2,}/g, '/');
  }

  function isReloginRouteUrl(url) {
    try {
      const route = decodeURIComponent(url.searchParams.get('r') || '').trim();
      return route.toLowerCase() === 'customer/login/relogin';
    } catch (_) {
      return false;
    }
  }

  function hrefWithoutHash(url) {
    const href = String(url && url.href ? url.href : url || '');
    const idx = href.indexOf('#');
    return idx === -1 ? href : href.slice(0, idx);
  }

  function isTopFrame() {
    try {
      return window.top === window;
    } catch (_) {
      return false;
    }
  }

  /** The page the relogin interstitial will continue to, from its `uri=` param. */
  function reloginTargetUrl(page) {
    try {
      const uri = page.searchParams.get('uri');
      return uri ? new URL(uri, page.origin) : null;
    } catch (_) {
      return null;
    }
  }

  const RELOGIN_HASH_MAX_AGE_MS = 10 * 60 * 1000;

  function storedReloginTargetMatches(stored, url) {
    if (!stored || !stored.relogin || !stored.targetQuerySig || !url) return false;
    return (
      normalizeReloginPathname(stored.targetPathname) === normalizeReloginPathname(url.pathname)
      && stored.targetQuerySig === reloginUrlQuerySignature(url)
    );
  }

  /** Remember SPA hash before Emarsys relogin redirect drops it from the address bar. */
  function gemCaptureReloginNavHash() {
    try {
      if (!isTopFrame()) return;
      const hash = String(window.location.hash || '').trim();
      if (!hash) return;
      const page = new URL(window.location.href);
      const relogin = isReloginRouteUrl(page);
      const target = relogin ? reloginTargetUrl(page) : null;
      sessionStorage.setItem(
        GEM_RELOGIN_NAV_HASH_KEY,
        JSON.stringify({
          hash,
          querySig: reloginUrlQuerySignature(page),
          pathname: normalizeReloginPathname(page.pathname),
          // An expired-session link is server-redirected straight to the relogin page, and the
          // browser carries the original fragment onto it. That hash belongs to the destination.
          relogin,
          reloginHref: relogin ? hrefWithoutHash(page) : '',
          targetPathname: target ? normalizeReloginPathname(target.pathname) : '',
          targetQuerySig: target ? reloginUrlQuerySignature(target) : '',
          ts: Date.now(),
        })
      );
    } catch (_) {}
  }

  /**
   * On the page the relogin continued to, put the saved hash back before Emarsys's SPA boots.
   * Covers redirects Gemma doesn't perform (Emarsys's own continue, or the button-click fallback).
   */
  function gemRestoreReloginNavHashOnLanding() {
    try {
      if (!isTopFrame()) return;
      if (String(window.location.hash || '').length > 1) return;
      const raw = sessionStorage.getItem(GEM_RELOGIN_NAV_HASH_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      const hash = String(stored.hash || '').trim();
      if (!hash.startsWith('#')) return;
      if (!(Date.now() - Number(stored.ts || 0) <= RELOGIN_HASH_MAX_AGE_MS)) return;
      const here = new URL(window.location.href);
      if (isReloginRouteUrl(here) || !storedReloginTargetMatches(stored, here)) return;
      sessionStorage.removeItem(GEM_RELOGIN_NAV_HASH_KEY);
      history.replaceState(history.state, '', hrefWithoutHash(here) + hash);
    } catch (_) {}
  }

  /** Reattach a preserved hash when Gemma navigates off the relogin interstitial. */
  function gemApplyReloginNavHash(destUrl) {
    const dest = String(destUrl || '').trim();
    if (!dest) return dest;
    const hashIdx = dest.indexOf('#');
    if (hashIdx !== -1) return dest;

    let hash = '';
    let here = null;
    try {
      here = new URL(window.location.href);
      if (isReloginRouteUrl(here) && String(here.hash || '').startsWith('#')) {
        hash = here.hash;
      }
    } catch (_) {}

    try {
      const raw = sessionStorage.getItem(GEM_RELOGIN_NAV_HASH_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        const candidate = String(stored.hash || '').trim();
        if (!hash && candidate.startsWith('#')) {
          const destUrlObj = new URL(dest, window.location.origin);
          const capturedOnThisReloginPage =
            !!stored.relogin && !!here && stored.reloginHref === hrefWithoutHash(here);
          const capturedOnDestinationPage =
            normalizeReloginPathname(stored.pathname) === normalizeReloginPathname(destUrlObj.pathname)
            && String(stored.querySig || '') === reloginUrlQuerySignature(destUrlObj);
          if (
            capturedOnThisReloginPage
            || capturedOnDestinationPage
            || storedReloginTargetMatches(stored, destUrlObj)
          ) {
            hash = candidate;
          }
        }
        if (hash) sessionStorage.removeItem(GEM_RELOGIN_NAV_HASH_KEY);
      }
    } catch (_) {}

    if (!hash) return dest;
    const withHash = dest + hash;
    return typeof gemHrefPreserveQuerySlashes === 'function'
      ? gemHrefPreserveQuerySlashes(withHash)
      : withHash;
  }

  gemRestoreReloginNavHashOnLanding();
  gemCaptureReloginNavHash();

  /** True when bootstrap.php route is emailCampaignList/index (handles encoded r=). */
  function gemIsEmailCampaignListRoute(href) {
    try {
      const url = new URL(String(href != null ? href : window.location.href), window.location.href);
      const route = decodeURIComponent(url.searchParams.get('r') || '').trim();
      return route.toLowerCase() === 'emailcampaignlist/index';
    } catch (_) {
      return /emailcampaignlist/i.test(String(href != null ? href : window.location.href || ''));
    }
  }

  window.gemHrefPreserveQuerySlashes = gemHrefPreserveQuerySlashes;
  window.gemWithEmailBasicsHash = gemWithEmailBasicsHash;
  window.gemApplyReloginNavHash = gemApplyReloginNavHash;
  window.gemIsGemStrippedCampaignUrl = gemIsGemStrippedCampaignUrl;
  window.gemIsEmailCampaignListRoute = gemIsEmailCampaignListRoute;

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
