// background.js
// ------------------------------------------------------------
// Simple, non-looping background worker
// ------------------------------------------------------------

function bgLog(...args) {
  try { console.log("[Gem] BG]", ...args); } catch (e) {}
}

const DEFAULT_SETTINGS = {
  enableHighlighting: true,
  enableMobilePreview: true,
  showFinishEditingBtn: true, // Finish editing button visible by default
  enableDarkTheme: false,
  enableCondensedBlocksPanel: true,
  colorSwatches: ["#FE4D01", "", "", "", "", "", "", ""], // 8 color swatches, first one is default
  customColors: ["#FE4D01"], // Default custom color (for backward compatibility)
  mobileViewVisible: true // Mobile view visible by default
};

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      const merged = { ...DEFAULT_SETTINGS, ...settings };
      bgLog("Loaded settings:", merged);
      resolve(merged);
    });
  });
}

function saveSettings(newSettings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(newSettings, () => {
      bgLog("Saved settings:", newSettings);
      resolve();
    });
  });
}

// Send a message to all content scripts in this tab (top frame is enough for you)
function sendToTab(tabId, msg) {
  bgLog("Sending to tab:", tabId, "msg:", msg);
  chrome.tabs.sendMessage(tabId, msg, () => {
    if (chrome.runtime.lastError) {
      // Often: "No receiving end" in tabs without your scripts – safe to ignore
      bgLog("tabs.sendMessage error:", chrome.runtime.lastError.message);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  bgLog("Received message:", msg, "from:", sender);

  const { action } = msg;

  // 1) Gear requested settings panel
  if (action === "openSettingsRequest") {
    if (sender.tab && sender.tab.id != null) {
      sendToTab(sender.tab.id, { action: "openSettings" });
    }
    // No async response needed
    return;
  }

  // 2) Optional: settings helpers if you want them
  if (action === "getSettings") {
    (async () => {
      const settings = await loadSettings();
      sendResponse(settings);
    })();
    return true; // async
  }

  if (action === "updateSettings") {
    (async () => {
      await saveSettings(msg.settings);
      if (sender.tab && sender.tab.id != null) {
        sendToTab(sender.tab.id, {
          action: "settingsUpdated",
          settings: msg.settings
        });
      }
      sendResponse({ success: true });
    })();
    return true; // async
  }

  bgLog("Unknown action:", action);
});
