console.log("page-title-updater.js loaded");

// Global variables
let currentCampaignName = null;
let campaignNameObserver = null;
let saveButtonObserver = null;
let hasUnsavedChanges = false;
let titleAnimationInterval = null;
let animationState = 0; // 0 for 🔴, 1 for ⚫

// Function to update the page title with campaign name and unsaved changes indicator
function updatePageTitle(campaignName) {
  if (!campaignName || campaignName.trim() === '') {
    console.log("[Gem] No campaign name found, keeping default title");
    return;
  }

  // Clean up the campaign name (trim whitespace)
  const cleanName = campaignName.trim();

  // Create base title
  let newTitle = cleanName;

  // Add unsaved changes indicator if there are unsaved changes
  if (hasUnsavedChanges) {
    const emoji = animationState === 0 ? '🔴' : '⚫';
    newTitle = `${emoji} ${newTitle}`;
  }

  // Only update if the title would actually change
  if (document.title !== newTitle) {
    const oldTitle = document.title;
    document.title = newTitle;
    currentCampaignName = cleanName;
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
function checkUnsavedChanges() {
  const saveButton = document.querySelector('cb-draft-save-button button');
  const isDisabled = saveButton && saveButton.hasAttribute('disabled');

  const newHasUnsavedChanges = !isDisabled; // If not disabled, there are unsaved changes

  if (newHasUnsavedChanges !== hasUnsavedChanges) {
    console.log(`[Gem] Unsaved changes state changed: ${hasUnsavedChanges} → ${newHasUnsavedChanges}`);
    hasUnsavedChanges = newHasUnsavedChanges;

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
  }

  // Set up a mutation observer to watch for the element appearing
  if (campaignNameObserver) {
    campaignNameObserver.disconnect();
  }

  campaignNameObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this is the campaign name element
          let campaignElement = null;

          if (node.tagName === 'CB-CAMPAIGN-NAME') {
            campaignElement = node;
          } else if (node.querySelector) {
            campaignElement = node.querySelector('cb-campaign-name');
          }

          if (campaignElement) {
            console.log("[Gem] cb-campaign-name element appeared in DOM:", campaignElement);
            const campaignName = campaignElement.textContent;
            updatePageTitle(campaignName);

            // Also monitor for changes to the campaign name text
            monitorCampaignNameChanges(campaignElement);
          }
        }
      });
    });
  });

  campaignNameObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log("[Gem] Started monitoring for cb-campaign-name element");
}

// Function to monitor save button state for unsaved changes indicator
function monitorSaveButton() {
  // Check initial state
  checkUnsavedChanges();

  // Set up mutation observer for save button changes
  if (saveButtonObserver) {
    saveButtonObserver.disconnect();
  }

  saveButtonObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Check if this mutation affects the save button
      if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
        const target = mutation.target;
        if (target.matches && target.matches('cb-draft-save-button button')) {
          console.log("[Gem] Save button disabled state changed");
          checkUnsavedChanges();
        }
      }

      // Also check for newly added save buttons
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          let saveButton = null;

          if (node.matches && node.matches('cb-draft-save-button button')) {
            saveButton = node;
          } else if (node.querySelector) {
            saveButton = node.querySelector('cb-draft-save-button button');
          }

          if (saveButton) {
            console.log("[Gem] Save button appeared in DOM, monitoring state");
            checkUnsavedChanges();
          }
        }
      });
    });
  });

  saveButtonObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled']
  });

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
}

// Initialize the page title updater
function initializePageTitleUpdater() {
  console.log("[Gem] Initializing page title updater");

  // Clean up any existing animation
  cleanupTitleAnimation();

  // Start monitoring for the campaign name element
  monitorCampaignName();

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
