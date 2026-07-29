// debug-logging-page-bridge.js
// Runs in page (MAIN) context so:
// - DevTools can call gemSetDebugLogging / gemIsDebugLoggingEnabled
// - MAIN-world scripts' Gemma-prefixed console.log/info/debug/warn are gated
// Safe to load multiple times (script-tag inject into srcdoc iframes, etc.).
(function initGemDebugLoggingPageBridge() {
  try {
    const GEM_DEBUG_LOCAL_KEY = 'gemDebugLogging';
    const prefixRegex = /^\[gem/i;

    const readLocalEnabled = () => {
      try {
        return localStorage.getItem(GEM_DEBUG_LOCAL_KEY) === 'true';
      } catch (_) {
        return false;
      }
    };

    if (!window.__gemDebugConsoleState) {
      window.__gemDebugConsoleState = { enabled: readLocalEnabled() };
    }
    const state = window.__gemDebugConsoleState;

    if (!window.__gemDebugConsolePatched) {
      window.__gemDebugConsolePatched = true;
      try { window.GEM_DEBUG = !!state.enabled; } catch (_) {}

      ['log', 'info', 'debug', 'warn', 'group', 'groupCollapsed'].forEach((methodName) => {
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
    }

    const applyEnabled = (enabled) => {
      state.enabled = !!enabled;
      try { window.GEM_DEBUG = state.enabled; } catch (_) {}
    };

    if (!window.__gemDebugPageBridgeInstalled) {
      window.__gemDebugPageBridgeInstalled = true;

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
        applyEnabled(enabled);
        emitSetRequest(enabled, persist);
        return state.enabled;
      };

      window.gemIsDebugLoggingEnabled = () => !!state.enabled;

      window.addEventListener('gem:debug-logging:state', (event) => {
        const detail = event && event.detail ? event.detail : {};
        applyEnabled(!!detail.enabled);
      });

      try {
        window.addEventListener('storage', (event) => {
          if (!event || event.key !== GEM_DEBUG_LOCAL_KEY) return;
          applyEnabled(event.newValue === 'true');
        });
      } catch (_) {}

      emitGetRequest();
    } else {
      // Console may have been patched by an earlier partial install; refresh flag.
      applyEnabled(typeof window.gemIsDebugLoggingEnabled === 'function'
        ? window.gemIsDebugLoggingEnabled()
        : readLocalEnabled());
    }
  } catch (_) {}
})();
