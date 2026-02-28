// platform.js - lightweight platform helpers shared across Gemma scripts
// Exposes:
// - window.GEM_IS_MAC (boolean)
// - window.GEM_MOD_KEY (string) => "⌘" on macOS, "CTRL" otherwise
// - window.gemModCombo(key) => "⌘+X" / "CTRL+X"
// - window.GEM_DEBUG (boolean)
// - window.gemSetDebugLogging(enabled, persist?)
(function () {
  const GEM_DEBUG_STORAGE_KEY = 'gemDebugLogging';

  function initGemDebugLoggingGate() {
    try {
      if (window.__gemDebugGateInstalled) return;
      window.__gemDebugGateInstalled = true;

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

      function applyDebugFlag(enabled) {
        state.enabled = !!enabled;
        window.GEM_DEBUG = state.enabled;
      }

      window.gemIsDebugLoggingEnabled = () => !!state.enabled;
      window.gemSetDebugLogging = (enabled, persist = false) => {
        applyDebugFlag(enabled);
        if (!persist) return;
        try {
          chrome.storage.sync.set({ [GEM_DEBUG_STORAGE_KEY]: !!enabled });
        } catch (_) {}
      };

      function logGemDebugHelpOnce() {
        try {
          if (window.__gemDebugHelpLogged) return;
          window.__gemDebugHelpLogged = true;
          console.log(
            `Gemma debug logging is available. Default: OFF (suppresses Gemma console.log/info/debug/warn; errors remain). Enable: window.gemSetDebugLogging(true, true). Disable: window.gemSetDebugLogging(false, true). Current: ${state.enabled ? 'ON' : 'OFF'}.`
          );
        } catch (_) {}
      }

      applyDebugFlag(false);
      logGemDebugHelpOnce();

      try {
        chrome.storage.sync.get({ [GEM_DEBUG_STORAGE_KEY]: false }, (res) => {
          const enabled = !!(res && res[GEM_DEBUG_STORAGE_KEY]);
          applyDebugFlag(enabled);
        });
      } catch (_) {}

      try {
        chrome.storage.onChanged.addListener((changes, namespace) => {
          if (namespace !== 'sync' || !changes || !changes[GEM_DEBUG_STORAGE_KEY]) return;
          applyDebugFlag(!!changes[GEM_DEBUG_STORAGE_KEY].newValue);
        });
      } catch (_) {}
    } catch (_) {
      window.GEM_DEBUG = false;
    }
  }

  initGemDebugLoggingGate();

  try {
    const platform =
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      '';

    const isMac = /mac/i.test(String(platform));
    window.GEM_IS_MAC = isMac;
    window.GEM_MOD_KEY = isMac ? '⌘' : 'CTRL';
    window.gemModCombo = function gemModCombo(key) {
      return `${window.GEM_MOD_KEY}+${String(key || '').toUpperCase()}`;
    };
  } catch (_) {
    window.GEM_IS_MAC = false;
    window.GEM_MOD_KEY = 'CTRL';
    window.gemModCombo = function gemModCombo(key) {
      return `CTRL+${String(key || '').toUpperCase()}`;
    };
  }
})();
