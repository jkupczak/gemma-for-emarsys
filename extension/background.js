// background.js
// ------------------------------------------------------------
// Simple background service worker for Gemma
// ------------------------------------------------------------

console.log("[Gem] Background script loading...");

function bgLog(...args) {
  try { console.log("[Gem] BG]", ...args); } catch (e) {}
}

// Send a message to content scripts in a tab
function sendToTab(tabId, msg) {
  console.log("[Gem] BG: Sending to tab:", tabId, "msg:", msg);
  chrome.tabs.sendMessage(tabId, msg, (response) => {
    console.log("[Gem] BG: tabs.sendMessage response:", response);
    if (chrome.runtime.lastError) {
      console.log("[Gem] BG: tabs.sendMessage error:", chrome.runtime.lastError.message);
    }
  });
}

bgLog("Setting up message listener...");
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  bgLog("MESSAGE RECEIVED:", msg, "from:", sender ? sender.url : 'unknown');

  const { action } = msg;

  // Handle settings panel requests
  if (action === "openSettings" || action === "openSettingsRequest") {
    if (sender.tab && sender.tab.id != null) {
      sendToTab(sender.tab.id, { action: "openSettings" });
    }
    return;
  }

  bgLog("Unknown action:", action);
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log("[Gem] Extension icon clicked");

  try {
    // Check if we're on an Emarsys page
    if (tab.url && tab.url.includes('emarsys.net')) {
      console.log("[Gem] On Emarsys page, toggling settings panel");

      // Send message to content script to toggle settings panel
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleSettingsPanel'
      }).catch((error) => {
        console.log("[Gem] Could not communicate with content script:", error);
      });
    } else {
      console.log("[Gem] Not on Emarsys page, no action taken");
    }
  } catch (error) {
    console.log("[Gem] Error handling extension click:", error);
  }
});

bgLog("Background service worker initialized");
