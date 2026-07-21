// Watches for the re-login interstitial and auto-continues to the intended page.
// Prefers navigating to e-actionlist-item[value] (final URL with session_id).
// Falls back to clicking the account button if the value attribute is missing.
// Must work in background tabs (no focus / not active).

const BUTTON_SELECTOR = 'e-actionlist .e-actionlist div:first-child > button';
const BUTTON_SELECTOR_FALLBACK =
  'e-actionlist-wrapper .e-actionlist__itemscontainer button:first-child';
const ACTION_LIST_ITEM_SELECTOR = 'e-actionlist e-actionlist-item[value]';
const ACTION_LIST_ITEM_FALLBACK = 'e-actionlist-item[value]';
const RELOGIN_DESTINATION_PATHS = ['bootstrap.php', 'campaignmanager.php'];
const OVERLAY_DISMISS_MS = 7000;
const BUTTON_WATCH_MS = 30000;
const POLL_MS = 250;

const log = (...args) => console.log('[Gem] relogin-auto-select:', ...args);
const warn = (...args) => console.warn('[Gem] relogin-auto-select:', ...args);

log('Script loaded. URL:', window.location.href);

// --- Overlay (visible tabs only; never gates redirect logic) ---

let overlayEl = null;
let spinnerStyleEl = null;
let overlayDismissTimer = null;

function maybeShowReloginOverlay() {
  if (document.hidden) return;
  buildAndShowOverlay();
}

function buildAndShowOverlay() {
  if (overlayEl) return;

  spinnerStyleEl = document.createElement('style');
  spinnerStyleEl.textContent = `
    @keyframes gem-spin {
      to { transform: rotate(360deg); }
    }
    #gem-relogin-overlay {
      transition: opacity 0.6s ease;
    }
  `;
  document.documentElement.appendChild(spinnerStyleEl);

  overlayEl = document.createElement('div');
  overlayEl.id = 'gem-relogin-overlay';
  overlayEl.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background-color: color-mix(in srgb, var(--token-background-faint, #f4f4f4) 95%, transparent);
    color: var(--token-text-default, #222);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: sans-serif;
    text-align: center;
    padding: 32px;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--token-primary-default, #523ae6) 20%, transparent);
    border-top-color: var(--token-primary-default, #523ae6);
    animation: gem-spin 0.8s linear infinite;
    margin-bottom: 20px;
    flex-shrink: 0;
  `;

  const headline = document.createElement('p');
  headline.textContent = 'Gemma is automatically redirecting you\u2026';
  headline.style.cssText = `
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
  `;

  const subtext = document.createElement('p');
  subtext.textContent = 'Toggle this on or off from the Gemma settings panel.';
  subtext.style.cssText = `
    margin: 0;
    font-size: 14px;
    opacity: 0.65;
  `;

  overlayEl.appendChild(spinner);
  overlayEl.appendChild(headline);
  overlayEl.appendChild(subtext);
  document.documentElement.appendChild(overlayEl);

  if (overlayDismissTimer) clearTimeout(overlayDismissTimer);
  overlayDismissTimer = setTimeout(() => {
    warn('7-second safety timer fired — dismissing overlay so user can access the page.');
    dismissOverlay();
  }, OVERLAY_DISMISS_MS);

  log('Overlay injected.');
}

function dismissOverlay() {
  if (overlayDismissTimer) {
    clearTimeout(overlayDismissTimer);
    overlayDismissTimer = null;
  }
  if (!overlayEl) return;
  overlayEl.style.opacity = '0';
  setTimeout(() => {
    if (overlayEl) overlayEl.remove();
    if (spinnerStyleEl) spinnerStyleEl.remove();
    overlayEl = null;
    spinnerStyleEl = null;
  }, 650);
}

// Show overlay once the background tab becomes visible mid-redirect.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && redirectStarted) maybeShowReloginOverlay();
});

// --- Relogin detection: navigate via value URL or click fallback ---

let mutationCount = 0;
let observerUnsub = null;
let pollTimer = null;
let buttonWatchTimer = null;
let redirectStarted = false;

function isAllowedReloginDestinationUrl(url) {
  if (!/\.emarsys\.net$/i.test(url.hostname)) return false;
  const path = String(url.pathname || '').toLowerCase();
  return RELOGIN_DESTINATION_PATHS.some((segment) => path.includes(segment));
}

function normalizeReloginDestinationUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    if (!isAllowedReloginDestinationUrl(url)) return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function queryReloginButton() {
  return document.querySelector(BUTTON_SELECTOR) || document.querySelector(BUTTON_SELECTOR_FALLBACK);
}

function queryReloginActionItems() {
  const primary = document.querySelectorAll(ACTION_LIST_ITEM_SELECTOR);
  if (primary.length) return primary;
  return document.querySelectorAll(ACTION_LIST_ITEM_FALLBACK);
}

function getReloginDestinationUrl() {
  const btn = queryReloginButton();
  if (btn) {
    const list = btn.closest('e-actionlist');
    if (list) {
      const item = list.querySelector('e-actionlist-item[value]');
      const url = normalizeReloginDestinationUrl(item?.getAttribute('value'));
      if (url) return url;
    }
  }

  const items = queryReloginActionItems();
  for (let i = 0; i < items.length; i++) {
    const url = normalizeReloginDestinationUrl(items[i].getAttribute('value'));
    if (url) return url;
  }
  return '';
}

function reloginInterstitialPresent() {
  return !!(getReloginDestinationUrl() || queryReloginButton());
}

function tryReloginContinue() {
  if (redirectStarted) return true;

  // Prefer hard navigation — works even when the tab is backgrounded / unfocused.
  const destUrl = getReloginDestinationUrl();
  if (destUrl) {
    redirectStarted = true;
    maybeShowReloginOverlay();
    log(
      'Navigating to e-actionlist-item value',
      document.hidden ? '(background tab)' : '(visible tab)',
      destUrl
    );
    window.location.replace(destUrl);
    return true;
  }

  const btn = queryReloginButton();
  if (!btn) return false;

  redirectStarted = true;
  log(
    'Button found (no value URL). Text:',
    (btn.textContent || '').trim(),
    '| disabled:',
    btn.disabled,
    '| hidden tab:',
    document.hidden
  );
  maybeShowReloginOverlay();
  try {
    btn.click();
    log('Click dispatched.');
  } catch (err) {
    warn('Click failed:', err);
    redirectStarted = false;
    return false;
  }
  return true;
}

function stopButtonWatch() {
  if (observerUnsub) {
    observerUnsub();
    observerUnsub = null;
  }
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (buttonWatchTimer != null) {
    clearTimeout(buttonWatchTimer);
    buttonWatchTimer = null;
  }
}

function onWatchTick(source) {
  if (tryReloginContinue()) {
    log('Relogin interstitial handled via', source + '.');
    stopButtonWatch();
  }
}

function startButtonWatch() {
  if (tryReloginContinue()) {
    log('Relogin interstitial was already in DOM at watch start.');
    stopButtonWatch();
    return;
  }

  // Native MutationObserver (not rAF-batched) so background tabs still get callbacks.
  if (!observerUnsub) {
    const observer = new MutationObserver(() => {
      mutationCount++;
      onWatchTick('mutation (' + mutationCount + ')');
    });
    const root = document.documentElement || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true, attributes: true });
      observerUnsub = () => observer.disconnect();
    }
  }

  // Polling backup: Emarsys injects the action list asynchronously; timers still
  // run (throttled) in background tabs, unlike requestAnimationFrame.
  if (pollTimer == null) {
    pollTimer = setInterval(() => onWatchTick('poll'), POLL_MS);
  }

  if (buttonWatchTimer == null) {
    buttonWatchTimer = setTimeout(() => {
      if (redirectStarted || reloginInterstitialPresent()) return;
      warn(
        'Relogin interstitial not found after',
        BUTTON_WATCH_MS / 1000,
        's — this may be the logged-out page. Mutation batches:',
        mutationCount
      );
      stopButtonWatch();
    }, BUTTON_WATCH_MS);
  }
}

chrome.storage.sync.get({ gemSharedLinkAutoSelect: true }, (settings) => {
  const enabled = settings.gemSharedLinkAutoSelect !== false;
  log('gemSharedLinkAutoSelect =', enabled);

  if (!enabled) {
    log('Feature is off — exiting without overlay.');
    return;
  }

  log(
    'Feature is on. Watching for',
    ACTION_LIST_ITEM_SELECTOR,
    'or button:',
    BUTTON_SELECTOR,
    document.hidden ? '(background tab)' : '(visible tab)'
  );
  startButtonWatch();
});
