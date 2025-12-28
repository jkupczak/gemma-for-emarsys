console.log("[Gem] link-status-tracker.js loaded");

// Link issue counters (global in this content script)
let linkIssues = 0;
let linkIssueDisabled = 0;

const LINK_SWITCH_SELECTOR = 'cb-links .e-switch input.e-switch__input:not([disabled])';
const HEADER_SELECTOR = 'cb-links .e-section__header';
const BADGE_ID = 'gem-link-issue-disabled-badge';
const LINKS_TAB_SELECTOR = '#linksTab > e-verticalnav-item';
const LINKS_TAB_DOT_ID = 'gem-links-tab-notification-dot';

function getPageId() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getSessionKey() {
  return `gem:linkIssues:campaign:${getPageId()}`;
}

function loadPersistedCounts() {
  try {
    const raw = sessionStorage.getItem(getSessionKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.linkIssues === 'number') linkIssues = parsed.linkIssues;
    if (typeof parsed.linkIssueDisabled === 'number') linkIssueDisabled = parsed.linkIssueDisabled;
  } catch (e) {
    // Ignore storage parse issues
  }
}

function persistCounts() {
  try {
    sessionStorage.setItem(
      getSessionKey(),
      JSON.stringify({
        linkIssues,
        linkIssueDisabled,
        updatedAt: Date.now(),
      })
    );
  } catch (e) {
    // Ignore storage write issues
  }
}

function updateBadge() {
  const header = document.querySelector(HEADER_SELECTOR);
  if (!header) return;

  const existing = document.getElementById(BADGE_ID);

  if (linkIssueDisabled > 0) {
    const badge = existing || document.createElement('div');
    badge.id = BADGE_ID;
    badge.textContent = `${linkIssueDisabled} Untracked`;

    // Style inspired by block-pinning.js (toggle button)
    badge.style.cssText = `
      margin-left: auto;
      padding: 4px 8px;
      background: red;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
    `;

    if (!existing) header.appendChild(badge);
  } else if (existing) {
    existing.remove();
  }
}

function updateLinksTabDot() {
  const tabItem = document.querySelector(LINKS_TAB_SELECTOR);
  if (!tabItem) return;

  const existing = document.getElementById(LINKS_TAB_DOT_ID);
  const value = typeof linkIssues === 'number' ? linkIssues : 0;

  if (value > 0) {
    const dot = existing || document.createElement('div');
    dot.id = LINKS_TAB_DOT_ID;
    dot.textContent = String(value);

    // Ensure the dot can position relative to the nav item
    const currentPos = window.getComputedStyle(tabItem).position;
    if (!currentPos || currentPos === 'static') {
      tabItem.style.position = 'relative';
    }

    dot.style.cssText = `
      position: absolute;
      top: -3px;
      left: 5px;
      border-radius: 100px;
      background: red;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: #fff;
      font-size: 11px;
      font-family: sans-serif;
      pointer-events: none;
    `;

    if (!existing) tabItem.appendChild(dot);
  } else if (existing) {
    existing.remove();
  }
}

function computeLinkIssues() {
  const inputs = document.querySelectorAll(LINK_SWITCH_SELECTOR);
  let disabledCount = 0;

  inputs.forEach((input) => {
    if (input.checked === false) disabledCount += 1;
  });

  linkIssueDisabled = disabledCount;
  linkIssues = disabledCount; // for now, linkIssues tracks only disabled links

  console.log("[Gem] Link issues updated:", {
    linkIssues,
    linkIssueDisabled,
    totalTrackableLinks: inputs.length,
    pageId: getPageId(),
  });

  persistCounts();
  updateBadge();
  updateLinksTabDot();
}

function onAnyEnabledLinkToggleAdded(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = /** @type {Element} */ (node);

  if (el.matches?.(LINK_SWITCH_SELECTOR)) return true;
  if (el.querySelector?.(LINK_SWITCH_SELECTOR)) return true;
  return false;
}

function onLinksTabAdded(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = /** @type {Element} */ (node);

  if (el.matches?.(LINKS_TAB_SELECTOR)) return true;
  if (el.querySelector?.(LINKS_TAB_SELECTOR)) return true;
  return false;
}

function initializeLinkStatusTracker() {
  loadPersistedCounts();
  updateBadge();
  updateLinksTabDot();

  // Initial compute in case DOM is already present
  computeLinkIssues();

  // Recompute on changes to any of the inputs
  document.addEventListener(
    'change',
    (e) => {
      const target = e.target;
      if (target && target.matches?.(LINK_SWITCH_SELECTOR)) {
        computeLinkIssues();
      }
    },
    true
  );

  // Observe DOM for the switches appearing (and re-appearing)
  const observer = new MutationObserver((mutations) => {
    let sawSwitch = false;
    let sawLinksTab = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (onAnyEnabledLinkToggleAdded(node)) {
          sawSwitch = true;
        }
        if (onLinksTabAdded(node)) {
          sawLinksTab = true;
        }
        if (sawSwitch && sawLinksTab) break;
      }
      if (sawSwitch && sawLinksTab) break;
    }
    if (sawSwitch) {
      computeLinkIssues();
    }
    if (sawLinksTab) {
      updateLinksTabDot();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also compute once shortly after load in case the panel renders async
  setTimeout(computeLinkIssues, 500);
  setTimeout(computeLinkIssues, 1500);
  setTimeout(updateLinksTabDot, 500);
  setTimeout(updateLinksTabDot, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLinkStatusTracker);
} else {
  initializeLinkStatusTracker();
}

