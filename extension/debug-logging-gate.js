// debug-logging-gate.js
// Global Gemma logging gate:
// - default OFF
// - suppresses Gemma-prefixed console.log/info/debug/warn
// - leaves console.error untouched
// - exposes gemSetDebugLogging(enabled, persist)
(function initGemDebugLoggingGate() {
  const root = (typeof globalThis !== 'undefined') ? globalThis : this;
  const GEM_DEBUG_STORAGE_KEY = 'gemDebugLogging';
  const GEM_DEBUG_LOCAL_KEY = 'gemDebugLogging';
  const setGlobal = (name, value) => {
    try { root[name] = value; } catch (_) {}
    try {
      if (typeof window !== 'undefined') {
        window[name] = value;
      }
    } catch (_) {}
  };

  try {
    if (root.__gemDebugGateInstalled) return;
    root.__gemDebugGateInstalled = true;

    const state = { enabled: false };
    const prefixRegex = /^\[(?:Gem(?:ma)?|gem(?:ma)?)(?:\]|-|\s)/;
    const methods = ['log', 'info', 'debug', 'warn'];
    const canUsePageBridge = typeof window !== 'undefined' && typeof document !== 'undefined';

    const emitStateToPage = () => {
      if (!canUsePageBridge) return;
      try {
        window.dispatchEvent(new CustomEvent('gem:debug-logging:state', {
          detail: { enabled: !!state.enabled }
        }));
      } catch (_) {}
    };

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
      setGlobal('GEM_DEBUG', state.enabled);
      emitStateToPage();
    };

    const persistLocal = (enabled) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(GEM_DEBUG_LOCAL_KEY, enabled ? 'true' : 'false');
        }
      } catch (_) {}
    };

    const readLocal = () => {
      try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(GEM_DEBUG_LOCAL_KEY);
        if (raw === 'true') return true;
        if (raw === 'false') return false;
      } catch (_) {}
      return null;
    };

    setGlobal('gemIsDebugLoggingEnabled', () => !!state.enabled);
    setGlobal('gemSetDebugLogging', (enabled, persist = false) => {
      applyDebugFlag(enabled);
      if (!persist) return;
      persistLocal(!!enabled);
      try {
        if (chrome && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.set({ [GEM_DEBUG_STORAGE_KEY]: !!enabled });
        }
      } catch (_) {}
    });

    if (canUsePageBridge) {
      try {
        window.addEventListener('gem:debug-logging:request-set', (event) => {
          const detail = event && event.detail ? event.detail : {};
          root.gemSetDebugLogging(!!detail.enabled, !!detail.persist);
        });
      } catch (_) {}

      try {
        window.addEventListener('gem:debug-logging:request-get', () => {
          emitStateToPage();
        });
      } catch (_) {}

      try {
        const existing = document.getElementById('gem-debug-logging-page-bridge');
        if (!existing && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          const script = document.createElement('script');
          script.id = 'gem-debug-logging-page-bridge';
          script.src = chrome.runtime.getURL('debug-logging-page-bridge.js');
          script.async = false;
          script.addEventListener('load', () => emitStateToPage(), { once: true });
          (document.documentElement || document.head || document.body).appendChild(script);
        } else {
          emitStateToPage();
        }
      } catch (_) {}
    }

    const localValue = readLocal();
    if (localValue == null) {
      applyDebugFlag(false);
    } else {
      applyDebugFlag(localValue);
    }

    try {
      if (!root.__gemDebugHelpLogged) {
        root.__gemDebugHelpLogged = true;
        console.log(
          `Gemma debug logging is available. Suppresses Gemma console.log/info/debug/warn by default; errors remain. Enable: gemSetDebugLogging(true, true). Disable: gemSetDebugLogging(false, true).`
        );
      }
    } catch (_) {}

    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get({ [GEM_DEBUG_STORAGE_KEY]: false }, (res) => {
          const persisted = !!(res && res[GEM_DEBUG_STORAGE_KEY]);
          applyDebugFlag(persisted);
          persistLocal(persisted);
          try {
            console.log(`[Gem] Debug logging restored from storage: ${persisted ? 'ON' : 'OFF'}.`);
          } catch (_) {}
        });
      }
    } catch (_) {}

    try {
      if (chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
          if (namespace !== 'sync' || !changes || !changes[GEM_DEBUG_STORAGE_KEY]) return;
          const next = !!changes[GEM_DEBUG_STORAGE_KEY].newValue;
          applyDebugFlag(next);
          persistLocal(next);
        });
      }
    } catch (_) {}
  } catch (_) {
    setGlobal('GEM_DEBUG', false);
  }
})();
