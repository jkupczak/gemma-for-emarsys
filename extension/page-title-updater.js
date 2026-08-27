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
let titleAnimationInterval = null;
let animationState = 0; // 0 for 🔴, 1 for ⚫
let campaignTabTitleRegexSource = "";
let campaignTabTitleFormatSource = "";

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

  // Add unsaved changes indicator if there are unsaved changes
  if (hasUnsavedChanges) {
    const emoji = animationState === 0 ? '🔴' : '⚫';
    newTitle = `${emoji} ${newTitle}`;
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
function reportUnsavedDraftToBackground(unsaved) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: "gemReportUnsavedDraft", unsaved: !!unsaved });
    }
  } catch (_) {}
}

function checkUnsavedChanges() {
  const saveButton = document.querySelector('cb-draft-save-button button');
  const isDisabled = saveButton && saveButton.hasAttribute('disabled');

  const newHasUnsavedChanges = !isDisabled; // If not disabled, there are unsaved changes

  if (newHasUnsavedChanges !== hasUnsavedChanges) {
    console.log(`[Gem] Unsaved changes state changed: ${hasUnsavedChanges} → ${newHasUnsavedChanges}`);
    hasUnsavedChanges = newHasUnsavedChanges;
    reportUnsavedDraftToBackground(newHasUnsavedChanges);

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
  const saveButton = document.querySelector(SAVE_BUTTON_SELECTOR);
  if (!saveButton) return;
  bindSaveButtonDisabledWatch(saveButton);
  checkUnsavedChanges();
}

function onSaveButtonFound(saveButton) {
  console.log("[Gem] Save button appeared in DOM, monitoring state");
  bindSaveButtonDisabledWatch(saveButton);
  checkUnsavedChanges();
}

function monitorSaveButton() {
  checkUnsavedChanges();
  reportUnsavedDraftToBackground(hasUnsavedChanges);
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

// Initialize the page title updater
function initializePageTitleUpdater() {
  console.log("[Gem] Initializing page title updater");

  // Clean up any existing animation
  cleanupTitleAnimation();

  bindCampaignTabTitleRegexWatcher();
  loadCampaignTabTitleRegex(() => {
    monitorCampaignName();
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
    const saveButton = document.querySelector("cb-draft-save-button button");
    const isDisabled = saveButton && saveButton.hasAttribute("disabled");
    sendResponse({ ok: true, unsaved: !isDisabled });
  });
}
