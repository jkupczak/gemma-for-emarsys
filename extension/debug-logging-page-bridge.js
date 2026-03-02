// debug-logging-page-bridge.js
// Runs in page context so DevTools console can call:
// - gemSetDebugLogging(enabled, persist?)
// - gemIsDebugLoggingEnabled()
(function initGemDebugLoggingPageBridge() {
  try {
    if (window.__gemDebugPageBridgeInstalled) return;
    window.__gemDebugPageBridgeInstalled = true;

    const state = { enabled: false };

    const emitSetRequest = (enabled, persist) => {
      try {
        window.dispatchEvent(new CustomEvent('gem:debug-logging:request-set', {
          detail: { enabled: !!enabled, persist: !!persist }
        }));
      } catch (_) {}
    };

    const emitGetRequest = () => {
      try {
        window.dispatchEvent(new CustomEvent('gem:debug-logging:request-get'));
      } catch (_) {}
    };

    window.gemSetDebugLogging = (enabled, persist = false) => {
      state.enabled = !!enabled;
      try { window.GEM_DEBUG = state.enabled; } catch (_) {}
      emitSetRequest(enabled, persist);
      return state.enabled;
    };

    window.gemIsDebugLoggingEnabled = () => !!state.enabled;

    window.addEventListener('gem:debug-logging:state', (event) => {
      const detail = event && event.detail ? event.detail : {};
      state.enabled = !!detail.enabled;
      try { window.GEM_DEBUG = state.enabled; } catch (_) {}
    });

    emitGetRequest();
  } catch (_) {}
})();
