// Watches for the re-login interstitial and auto-continues to the intended page.
// Prefers navigating to e-actionlist-item[value] (final URL with session_id).
// Falls back to clicking the account button if the value attribute is missing.

const BUTTON_SELECTOR = 'e-actionlist-wrapper .e-actionlist__itemscontainer button:first-child';
const ACTION_LIST_ITEM_SELECTOR = 'e-actionlist-item[value]';
const RELOGIN_DESTINATION_PATHS = ['bootstrap.php', 'campaignmanager.php'];
const OVERLAY_DISMISS_MS = 7000;
const BUTTON_WATCH_MS = 10000;

const log  = (...args) => console.log('[Gem] relogin-auto-select:', ...args);
const warn = (...args) => console.warn('[Gem] relogin-auto-select:', ...args);

log('Script loaded. URL:', window.location.href);

// --- Visibility-aware timers (only count time while tab is visible) ---

function createVisibilityAwareTimeout(callback, delayMs) {
  let remainingMs = delayMs;
  let timerId = null;
  let startedAt = null;
  let done = false;

  function clearTimer() {
    if (timerId != null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function pause() {
    if (startedAt == null) return;
    remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    startedAt = null;
    clearTimer();
  }

  function finish() {
    if (done) return;
    done = true;
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    callback();
  }

  function resume() {
    if (done || document.hidden) return;
    if (remainingMs <= 0) {
      finish();
      return;
    }
    startedAt = Date.now();
    timerId = setTimeout(onTimerFire, remainingMs);
  }

  function onTimerFire() {
    timerId = null;
    if (done) return;
    if (document.hidden) {
      if (startedAt != null) {
        remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
        startedAt = null;
      }
      return;
    }
    if (startedAt != null) {
      remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
      startedAt = null;
    }
    if (remainingMs <= 0) finish();
    else resume();
  }

  function onVisibilityChange() {
    if (done) return;
    if (document.hidden) pause();
    else resume();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  if (!document.hidden) resume();

  return {
    cancel() {
      done = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

// --- Overlay (visible tabs only) ---

let overlayEl = null;
let spinnerStyleEl = null;
/** @type {{ cancel: () => void } | null} */
let dismissTimerControl = null;

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

  if (dismissTimerControl) dismissTimerControl.cancel();
  dismissTimerControl = createVisibilityAwareTimeout(() => {
    warn('7-second visible-time safety timer fired — dismissing overlay so user can access the page.');
    dismissOverlay();
  }, OVERLAY_DISMISS_MS);

  log('Overlay injected.');
}

function dismissOverlay() {
  if (dismissTimerControl) {
    dismissTimerControl.cancel();
    dismissTimerControl = null;
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

// --- Relogin detection: navigate via value URL or click fallback ---

let mutationCount = 0;
let observer = null;
/** @type {{ cancel: () => void } | null} */
let buttonWatchTimer = null;
let visibilityRetryInstalled = false;
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

function getReloginDestinationUrl() {
  const btn =
    document.querySelector(`${BUTTON_SELECTOR}.e-actionlist__item-active`) ||
    document.querySelector(BUTTON_SELECTOR);
  if (btn) {
    const list = btn.closest('e-actionlist');
    if (list) {
      const item = list.querySelector(ACTION_LIST_ITEM_SELECTOR);
      const url = normalizeReloginDestinationUrl(item?.getAttribute('value'));
      if (url) return url;
    }
  }

  const firstItem = document.querySelector(ACTION_LIST_ITEM_SELECTOR);
  return normalizeReloginDestinationUrl(firstItem?.getAttribute('value'));
}

function reloginInterstitialPresent() {
  return !!(getReloginDestinationUrl() || document.querySelector(BUTTON_SELECTOR));
}

function tryReloginContinue() {
  if (redirectStarted) return true;

  const destUrl = getReloginDestinationUrl();
  if (destUrl) {
    redirectStarted = true;
    maybeShowReloginOverlay();
    log('Navigating to e-actionlist-item value:', destUrl);
    window.location.replace(destUrl);
    return true;
  }

  const btn = document.querySelector(BUTTON_SELECTOR);
  if (!btn) return false;

  redirectStarted = true;
  log(
    'Button found (no value URL). Text:',
    btn.textContent.trim(),
    '| disabled:',
    btn.disabled,
    '| visible:',
    btn.offsetParent !== null
  );
  maybeShowReloginOverlay();
  btn.click();
  log('Click dispatched.');
  return true;
}

function stopButtonWatch() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (buttonWatchTimer) {
    buttonWatchTimer.cancel();
    buttonWatchTimer = null;
  }
  if (visibilityRetryInstalled) {
    document.removeEventListener('visibilitychange', onReloginTabVisible);
    visibilityRetryInstalled = false;
  }
}

function onReloginTabVisible() {
  if (document.hidden) return;
  if (!tryReloginContinue()) return;
  log('Relogin interstitial handled on tab focus.');
  stopButtonWatch();
}

function installVisibilityRetry() {
  if (visibilityRetryInstalled) return;
  visibilityRetryInstalled = true;
  document.addEventListener('visibilitychange', onReloginTabVisible);
}

function startButtonWatch() {
  installVisibilityRetry();

  if (tryReloginContinue()) {
    log('Relogin interstitial was already in DOM at watch start.');
    stopButtonWatch();
    return;
  }

  if (!observer) {
    observer = new MutationObserver(() => {
      mutationCount++;
      if (tryReloginContinue()) {
        log('Relogin interstitial found after', mutationCount, 'mutation batch(es). Observer disconnected.');
        stopButtonWatch();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (!buttonWatchTimer) {
    buttonWatchTimer = createVisibilityAwareTimeout(() => {
      if (reloginInterstitialPresent()) return;
      warn(
        'Relogin interstitial not found after 10 visible seconds — this may be the logged-out page. Mutation batches:',
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
    BUTTON_SELECTOR
  );
  startButtonWatch();
});
