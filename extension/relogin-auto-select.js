// Watches for the re-login interstitial button and, if found, covers the page
// with an overlay and auto-clicks it. If the button never appears (e.g. the
// standard logged-out page), neither the overlay nor any click ever fires.

const SELECTOR = 'e-actionlist-wrapper .e-actionlist__itemscontainer button:first-child';

const log  = (...args) => console.log('[Gem] relogin-auto-select:', ...args);
const warn = (...args) => console.warn('[Gem] relogin-auto-select:', ...args);

log('Script loaded. URL:', window.location.href);

// --- Overlay (created only when the target button is confirmed present) ---

let overlayEl      = null;
let spinnerStyleEl = null;
let dismissTimer   = null;

function buildAndShowOverlay() {
  if (overlayEl) return; // already shown

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

  // Safety net: if the redirect hasn't happened within 7 seconds, fade out so
  // the user can still interact with the page.
  dismissTimer = setTimeout(() => {
    warn('7-second safety timer fired — dismissing overlay so user can access the page.');
    dismissOverlay();
  }, 7000);

  log('Overlay injected.');
}

function dismissOverlay() {
  if (!overlayEl) return;
  overlayEl.style.opacity = '0';
  setTimeout(() => {
    if (overlayEl) overlayEl.remove();
    if (spinnerStyleEl) spinnerStyleEl.remove();
  }, 650);
}

// --- Button detection and click ---

let mutationCount = 0;
let observer      = null;

function tryClick() {
  const btn = document.querySelector(SELECTOR);
  if (!btn) return false;

  log('Button found. Text:', btn.textContent.trim(), '| disabled:', btn.disabled, '| visible:', btn.offsetParent !== null);
  buildAndShowOverlay();
  btn.click();
  log('Click dispatched.');
  return true;
}

chrome.storage.sync.get({ gemSharedLinkAutoSelect: true }, (settings) => {
  const enabled = settings.gemSharedLinkAutoSelect !== false;
  log('gemSharedLinkAutoSelect =', enabled);

  if (!enabled) {
    log('Feature is off — exiting without overlay.');
    return;
  }

  log('Feature is on. Watching for button:', SELECTOR);

  if (tryClick()) {
    log('Button was already in DOM at storage-read time.');
    return;
  }

  observer = new MutationObserver(() => {
    mutationCount++;
    if (tryClick()) {
      log('Button found after', mutationCount, 'mutation batch(es). Observer disconnected.');
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Warn if the button never appears — but do NOT show an overlay in this case.
  setTimeout(() => {
    if (document.querySelector(SELECTOR)) return;
    warn('Button not found after 10 seconds — this may be the logged-out page, not the relogin interstitial. Mutation batches:', mutationCount);
    if (observer) observer.disconnect();
  }, 10000);
});
