console.log("[Gem] page-title-updater.js loaded");

const GEM_PAGE_TITLE_CAMPAIGN_REGEX_KEY = "gemCampaignTabTitleRegex";
const GEM_PAGE_TITLE_CAMPAIGN_FORMAT_KEY = "gemCampaignTabTitleFormat";

// Global variables
let currentCampaignName = null;
let campaignNameObserver = null;
let saveButtonDomUnsub = null;
let saveButtonAttributeUnsub = null;
/** @type {Element | null} */
let saveButtonAttributeTarget = null;
let hasUnsavedChanges = false;
let draftLastSavedAt = null;
let titleAnimationInterval = null;
let animationState = 0; // 0 for 🔴, 1 for ⚫
/** @type {number | null} 1-based duplicate-tab index while duplicates exist */
let duplicateTabIndex = null;
let campaignTabTitleRegexSource = "";
let campaignTabTitleFormatSource = "";

function getDuplicateTabPrefix(index) {
  const n = Number(index);
  if (!Number.isFinite(n) || n < 1) return '';
  return `(${n}) `;
}

function compileCampaignTabTitleRegex(source) {
  const trimmed = String(source || "").trim();
  if (!trimmed) return null;
  const wrapped = trimmed.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
  if (wrapped) {
    const flags = String(wrapped[2] || "").replace(/g/g, "");
    return new RegExp(wrapped[1], flags);
  }
  return new RegExp(trimmed);
}

function applyCampaignTabTitleFormat(match, format) {
  return String(format || "").replace(/\$(\$|&|0|[1-9]\d?)|\$<([^>]+)>/g, (_whole, token, named) => {
    if (named) {
      const groups = match.groups || {};
      return groups[named] != null ? String(groups[named]) : "";
    }
    if (token === "$") return "$";
    if (token === "&" || token === "0") return match[0] || "";
    const index = Number(token);
    if (index > 0 && index < match.length && match[index] != null) return String(match[index]);
    return "";
  });
}

function extractCampaignTabTitle(campaignName, patternSource, formatSource) {
  const name = String(campaignName || "").trim();
  if (!name) return "";
  const trimmedPattern = String(patternSource || "").trim();
  if (!trimmedPattern) return name;

  let regex = null;
  try {
    regex = compileCampaignTabTitleRegex(trimmedPattern);
  } catch (_) {
    return name;
  }
  if (!regex) return name;

  regex.lastIndex = 0;
  const match = regex.exec(name);
  if (!match) return name;

  const format = String(formatSource || "");
  if (format) {
    const formatted = applyCampaignTabTitleFormat(match, format).trim();
    return formatted || name;
  }

  for (let i = 1; i < match.length; i += 1) {
    const group = match[i];
    if (group != null && String(group).trim()) return String(group).trim();
  }

  const full = match[0];
  if (full != null && String(full).trim()) return String(full).trim();
  return name;
}

// Function to update the page title with campaign name and unsaved changes indicator
function updatePageTitle(campaignName) {
  if (!campaignName || campaignName.trim() === '') {
    console.log("[Gem] No campaign name found, keeping default title");
    return;
  }

  // Clean up the campaign name (trim whitespace)
  const cleanName = campaignName.trim();
  currentCampaignName = cleanName;

  // Create base title
  let newTitle = extractCampaignTabTitle(
    cleanName,
    campaignTabTitleRegexSource,
    campaignTabTitleFormatSource
  );

  let prefix = '';
  if (hasUnsavedChanges) {
    const emoji = animationState === 0 ? '🔴' : '⚫';
    prefix += `${emoji} `;
  }
  if (duplicateTabIndex != null) {
    prefix += getDuplicateTabPrefix(duplicateTabIndex);
  }
  if (prefix) {
    newTitle = `${prefix}${newTitle}`;
  }

  // Only update if the title would actually change
  if (document.title !== newTitle) {
    document.title = newTitle;
  }
}

// Function to start the title animation
function startTitleAnimation() {
  if (titleAnimationInterval) {
    clearInterval(titleAnimationInterval);
  }

  console.log("[Gem] Starting title animation for unsaved changes");

  titleAnimationInterval = setInterval(() => {
    // Toggle animation state
    animationState = 1 - animationState;

    // Update title with new animation state
    if (currentCampaignName) {
      updatePageTitle(currentCampaignName);
    }
  }, 800); // Change every 800ms for a nice blink effect
}

// Function to stop the title animation
function stopTitleAnimation() {
  if (titleAnimationInterval) {
    console.log("[Gem] Stopping title animation - changes saved");
    clearInterval(titleAnimationInterval);
    titleAnimationInterval = null;
    animationState = 0; // Reset to 🔴 for next time

    // Update title one final time to show saved state
    if (currentCampaignName) {
      updatePageTitle(currentCampaignName);
    }
  }
}

// Function to check if there are unsaved changes (save button not disabled)
function reportUnsavedDraftToBackground(unsaved, lastSavedAt) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: "gemReportUnsavedDraft",
        unsaved: !!unsaved,
        lastSavedAt: lastSavedAt != null ? lastSavedAt : undefined,
      });
    }
  } catch (_) {}
}

const DRAFT_SAVE_BUTTON_SELECTORS = 'cb-draft-save-button button, gem-cb-draft-save-button button';

function getDraftSaveButton() {
  return document.querySelector(DRAFT_SAVE_BUTTON_SELECTORS);
}

function isDraftSaveButtonDisabled(saveButton) {
  if (!saveButton) return true;
  if (saveButton.disabled) return true;
  if (saveButton.hasAttribute('disabled')) return true;
  if (saveButton.getAttribute('aria-disabled') === 'true') return true;
  return false;
}

function isDraftSaveUnsaved() {
  const saveButton = getDraftSaveButton();
  if (!saveButton) return false;
  return !isDraftSaveButtonDisabled(saveButton);
}

window.gemIsDraftSaveUnsaved = isDraftSaveUnsaved;
window.gemGetDraftLastSavedAt = () => draftLastSavedAt;

function getTabLastRefreshedAt() {
  try {
    const ts = Math.round(performance.timeOrigin || 0);
    return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
  } catch (_) {
    return Date.now();
  }
}

window.gemGetTabLastRefreshedAt = getTabLastRefreshedAt;

window.gemSetDuplicateTabIndex = function setDuplicateTabIndex(index) {
  const next =
    index != null && Number.isFinite(Number(index)) && Number(index) >= 1
      ? Number(index)
      : null;
  if (next === duplicateTabIndex) return;
  duplicateTabIndex = next;
  if (currentCampaignName) updatePageTitle(currentCampaignName);
};

function checkUnsavedChanges(options) {
  const newHasUnsavedChanges = isDraftSaveUnsaved();
  const forceReport = !!(options && options.forceReport);

  if (!newHasUnsavedChanges && hasUnsavedChanges) {
    draftLastSavedAt = Date.now();
  }

  if (newHasUnsavedChanges !== hasUnsavedChanges || forceReport) {
    console.log(`[Gem] Unsaved changes state changed: ${hasUnsavedChanges} → ${newHasUnsavedChanges}`);
    hasUnsavedChanges = newHasUnsavedChanges;
    reportUnsavedDraftToBackground(newHasUnsavedChanges, draftLastSavedAt);

    // Start or stop animation based on unsaved changes state
    if (newHasUnsavedChanges) {
      startTitleAnimation();
    } else {
      stopTitleAnimation();
    }

    // Update title if we have a campaign name
    if (currentCampaignName) {
      updatePageTitle(currentCampaignName);
    }
  }
}

// Function to find and monitor campaign name element
function monitorCampaignName() {
  // First, try to find the element immediately
  const campaignElement = document.querySelector('cb-campaign-name');

  if (campaignElement) {
    console.log("[Gem] Found cb-campaign-name element:", campaignElement);
    const campaignName = campaignElement.textContent;
    updatePageTitle(campaignName);
    monitorCampaignNameChanges(campaignElement);
  }

  // Set up a mutation observer to watch for the element appearing
  if (campaignNameObserver) {
    if (typeof campaignNameObserver === 'function') {
      campaignNameObserver();
    } else {
      campaignNameObserver.disconnect();
    }
    campaignNameObserver = null;
  }

  const onCampaignNameFound = (campaignElement) => {
    console.log("[Gem] cb-campaign-name element appeared in DOM:", campaignElement);
    const campaignName = campaignElement.textContent;
    updatePageTitle(campaignName);
    monitorCampaignNameChanges(campaignElement);
  };

  if (typeof gemDomWatchWaitFor === 'function') {
    campaignNameObserver = gemDomWatchWaitFor('cb-campaign-name', onCampaignNameFound);
  } else {
    campaignNameObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            let campaignElement = null;

            if (node.tagName === 'CB-CAMPAIGN-NAME') {
              campaignElement = node;
            } else if (node.querySelector) {
              campaignElement = node.querySelector('cb-campaign-name');
            }

            if (campaignElement) {
              onCampaignNameFound(campaignElement);
            }
          }
        });
      });
    });

    campaignNameObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  console.log("[Gem] Started monitoring for cb-campaign-name element");
}

// Function to monitor save button state for unsaved changes indicator
const SAVE_BUTTON_SELECTOR = 'cb-draft-save-button button';

function bindSaveButtonDisabledWatch(saveButton) {
  if (!saveButton || saveButton.nodeType !== Node.ELEMENT_NODE) return;
  if (saveButtonAttributeTarget === saveButton && saveButtonAttributeUnsub) return;

  if (saveButtonAttributeUnsub) {
    saveButtonAttributeUnsub();
    saveButtonAttributeUnsub = null;
  }
  saveButtonAttributeTarget = saveButton;

  if (typeof gemDomWatchObserveAttributes === 'function') {
    saveButtonAttributeUnsub = gemDomWatchObserveAttributes(
      saveButton,
      () => checkUnsavedChanges(),
      ['disabled']
    );
    return;
  }

  const attrObserver = new MutationObserver(() => checkUnsavedChanges());
  attrObserver.observe(saveButton, {
    attributes: true,
    attributeFilter: ['disabled']
  });
  saveButtonAttributeUnsub = () => {
    attrObserver.disconnect();
    saveButtonAttributeTarget = null;
  };
}

function attachSaveButtonWatchIfPresent() {
  const saveButton = getDraftSaveButton();
  if (!saveButton) return;
  bindSaveButtonDisabledWatch(saveButton);
  checkUnsavedChanges({ forceReport: true });
}

function onSaveButtonFound(saveButton) {
  console.log("[Gem] Save button appeared in DOM, monitoring state");
  bindSaveButtonDisabledWatch(saveButton);
  checkUnsavedChanges({ forceReport: true });
}

function monitorSaveButton() {
  checkUnsavedChanges();
  reportUnsavedDraftToBackground(hasUnsavedChanges, draftLastSavedAt);
  attachSaveButtonWatchIfPresent();

  if (saveButtonDomUnsub) {
    saveButtonDomUnsub();
    saveButtonDomUnsub = null;
  }

  if (typeof gemDomWatchWaitFor === 'function') {
    saveButtonDomUnsub = gemDomWatchWaitFor(SAVE_BUTTON_SELECTOR, onSaveButtonFound);
  }

  const domUnsub = typeof gemDomWatchSubscribe === 'function'
    ? gemDomWatchSubscribe(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            let saveButton = null;
            if (node.matches && node.matches(SAVE_BUTTON_SELECTOR)) {
              saveButton = node;
            } else if (node.querySelector) {
              saveButton = node.querySelector(SAVE_BUTTON_SELECTOR);
            }
            if (saveButton) onSaveButtonFound(saveButton);
          });
        });
      })
    : null;

  if (domUnsub) {
    const waitForUnsub = saveButtonDomUnsub;
    saveButtonDomUnsub = function () {
      if (typeof waitForUnsub === 'function') waitForUnsub();
      domUnsub();
    };
  }

  console.log("[Gem] Started monitoring save button for unsaved changes");
}

// Function to monitor changes to the campaign name element's text content
function monitorCampaignNameChanges(campaignElement) {
  const textObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        const newCampaignName = campaignElement.textContent;
        if (newCampaignName !== currentCampaignName) {
          console.log("[Gem] Campaign name changed from DOM mutation");
          updatePageTitle(newCampaignName);
        }
      }
    });
  });

  textObserver.observe(campaignElement, {
    childList: true,
    characterData: true,
    subtree: true
  });

  console.log("[Gem] Started monitoring for changes to campaign name content");
}

// Function to clean up animation on page unload
function cleanupTitleAnimation() {
  if (titleAnimationInterval) {
    clearInterval(titleAnimationInterval);
    titleAnimationInterval = null;
  }
  if (saveButtonDomUnsub) {
    saveButtonDomUnsub();
    saveButtonDomUnsub = null;
  }
  if (saveButtonAttributeUnsub) {
    saveButtonAttributeUnsub();
    saveButtonAttributeUnsub = null;
  }
  saveButtonAttributeTarget = null;
}

function loadCampaignTabTitleRegex(callback) {
  const done = () => {
    if (typeof callback === "function") callback();
  };

  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync) {
    campaignTabTitleRegexSource = "";
    campaignTabTitleFormatSource = "";
    done();
    return;
  }

  chrome.storage.sync.get(
    {
      [GEM_PAGE_TITLE_CAMPAIGN_REGEX_KEY]: "",
      [GEM_PAGE_TITLE_CAMPAIGN_FORMAT_KEY]: "",
    },
    (result) => {
      campaignTabTitleRegexSource = String((result && result[GEM_PAGE_TITLE_CAMPAIGN_REGEX_KEY]) || "");
      campaignTabTitleFormatSource = String((result && result[GEM_PAGE_TITLE_CAMPAIGN_FORMAT_KEY]) || "");
      done();
    }
  );
}

function bindCampaignTabTitleRegexWatcher() {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
  if (bindCampaignTabTitleRegexWatcher.bound) return;
  bindCampaignTabTitleRegexWatcher.bound = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes) return;
    let changed = false;
    if (changes[GEM_PAGE_TITLE_CAMPAIGN_REGEX_KEY]) {
      campaignTabTitleRegexSource = String(changes[GEM_PAGE_TITLE_CAMPAIGN_REGEX_KEY].newValue || "");
      changed = true;
    }
    if (changes[GEM_PAGE_TITLE_CAMPAIGN_FORMAT_KEY]) {
      campaignTabTitleFormatSource = String(changes[GEM_PAGE_TITLE_CAMPAIGN_FORMAT_KEY].newValue || "");
      changed = true;
    }
    if (changed && currentCampaignName) updatePageTitle(currentCampaignName);
  });
}

const GEM_DRAFT_STORAGE_PREFIX = 'gemDraft_';

function getCampaignIdFromPageUrl() {
  try {
    const match = window.location.search.match(/[?&]id=(\d+)/);
    return match ? match[1] : '';
  } catch (_) {
    return '';
  }
}

function seedDraftLastSavedFromStorage(extraSuiteCampaignId) {
  if (!/contentBlocks(?:\/|%2F)campaign/i.test(window.location.href)) return;
  const campaignId = getCampaignIdFromPageUrl();
  if (!campaignId && !extraSuiteCampaignId) return;
  if (!chrome?.storage?.local) return;

  const keys = [];
  if (campaignId) keys.push(`${GEM_DRAFT_STORAGE_PREFIX}${campaignId}`);
  const suiteId = String(extraSuiteCampaignId || '').trim();
  if (suiteId && !keys.includes(`${GEM_DRAFT_STORAGE_PREFIX}${suiteId}`)) {
    keys.push(`${GEM_DRAFT_STORAGE_PREFIX}${suiteId}`);
  }
  if (!keys.length) return;

  chrome.storage.local.get(keys, (res) => {
    if (draftLastSavedAt) return;
    for (let i = 0; i < keys.length; i += 1) {
      const entry = res && res[keys[i]];
      const ts = entry && (entry.saved_at || 0);
      if (ts) {
        draftLastSavedAt = ts;
        reportUnsavedDraftToBackground(hasUnsavedChanges, draftLastSavedAt);
        return;
      }
    }
  });
}

// Initialize the page title updater
function initializePageTitleUpdater() {
  console.log("[Gem] Initializing page title updater");

  // Clean up any existing animation
  cleanupTitleAnimation();

  bindCampaignTabTitleRegexWatcher();
  loadCampaignTabTitleRegex(() => {
    monitorCampaignName();
  });

  seedDraftLastSavedFromStorage();
  window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'gem-draft-saved') {
      draftLastSavedAt = Date.now();
      hasUnsavedChanges = false;
      reportUnsavedDraftToBackground(false, draftLastSavedAt);
      stopTitleAnimation();
      if (currentCampaignName) updatePageTitle(currentCampaignName);
      return;
    }
    if (event.data.source === 'gem-content-blocks-snapshot-cached') {
      const snapshot = event.data.snapshot;
      const campaign = snapshot && (snapshot.campaign || snapshot);
      const suiteId = campaign && campaign.suite_campaign_id != null
        ? String(campaign.suite_campaign_id)
        : '';
      seedDraftLastSavedFromStorage(suiteId);
    }
  });

  // Start monitoring save button for unsaved changes indicator
  monitorSaveButton();

  // Clean up animation when page unloads
  window.addEventListener('beforeunload', cleanupTitleAnimation);
}

// Wait for page load before starting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePageTitleUpdater);
} else {
  // Page already loaded
  initializePageTitleUpdater();
}

// Recent Campaigns panel: background asks whether this tab has unsaved draft changes (same rule as checkUnsavedChanges).
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.action !== "gemQueryUnsavedDraft") return;
    sendResponse({
      ok: true,
      unsaved: isDraftSaveUnsaved(),
      lastSavedAt: draftLastSavedAt,
      lastRefreshedAt: getTabLastRefreshedAt(),
    });
    return true;
  });
}
