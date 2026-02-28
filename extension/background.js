// background.js
// ------------------------------------------------------------
// Simple background service worker for Gemma
// ------------------------------------------------------------

(function initGemDebugLoggingGate() {
  const GEM_DEBUG_STORAGE_KEY = 'gemDebugLogging';
  const root = globalThis;

  try {
    if (root.__gemDebugGateInstalled) return;
    root.__gemDebugGateInstalled = true;

    const state = { enabled: false };
    const prefixRegex = /^\[(?:Gem(?:ma)?|gem(?:ma)?)(?:\]|-|\s)/;
    const methods = ['log', 'info', 'debug', 'warn'];

    methods.forEach((methodName) => {
      const original = console[methodName];
      if (typeof original !== 'function') return;
      const bound = original.bind(console);
      console[methodName] = (...args) => {
        const first = args && args.length ? args[0] : null;
        const isGemLog = typeof first === 'string' && prefixRegex.test(first);
        if (!state.enabled && isGemLog) return;
        bound(...args);
      };
    });

    const applyDebugFlag = (enabled) => {
      state.enabled = !!enabled;
      root.GEM_DEBUG = state.enabled;
    };

    root.gemIsDebugLoggingEnabled = () => !!state.enabled;
    root.gemSetDebugLogging = (enabled, persist = false) => {
      applyDebugFlag(enabled);
      if (!persist) return;
      try {
        chrome.storage.sync.set({ [GEM_DEBUG_STORAGE_KEY]: !!enabled });
      } catch (_) {}
    };

    const logGemDebugHelpOnce = () => {
      try {
        if (root.__gemDebugHelpLogged) return;
        root.__gemDebugHelpLogged = true;
        console.log(
          `Gemma debug logging is available. Default: OFF (suppresses Gemma console.log/info/debug/warn; errors remain). Enable: gemSetDebugLogging(true, true). Disable: gemSetDebugLogging(false, true). Current: ${state.enabled ? 'ON' : 'OFF'}.`
        );
      } catch (_) {}
    };

    applyDebugFlag(false);
    logGemDebugHelpOnce();

    try {
      chrome.storage.sync.get({ [GEM_DEBUG_STORAGE_KEY]: false }, (res) => {
        applyDebugFlag(!!(res && res[GEM_DEBUG_STORAGE_KEY]));
      });
    } catch (_) {}

    try {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'sync' || !changes || !changes[GEM_DEBUG_STORAGE_KEY]) return;
        applyDebugFlag(!!changes[GEM_DEBUG_STORAGE_KEY].newValue);
      });
    } catch (_) {}
  } catch (_) {
    root.GEM_DEBUG = false;
  }
})();

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
