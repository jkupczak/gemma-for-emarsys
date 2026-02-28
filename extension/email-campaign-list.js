(function initGemDebugLoggingGate() {
  const GEM_DEBUG_STORAGE_KEY = 'gemDebugLogging';
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

    const applyDebugFlag = (enabled) => {
      state.enabled = !!enabled;
      window.GEM_DEBUG = state.enabled;
    };

    window.gemIsDebugLoggingEnabled = () => !!state.enabled;
    window.gemSetDebugLogging = (enabled, persist = false) => {
      applyDebugFlag(enabled);
      if (!persist) return;
      try {
        chrome.storage.sync.set({ [GEM_DEBUG_STORAGE_KEY]: !!enabled });
      } catch (_) {}
    };

    const logGemDebugHelpOnce = () => {
      try {
        if (window.__gemDebugHelpLogged) return;
        window.__gemDebugHelpLogged = true;
        console.log(
          `Gemma debug logging is available. Default: OFF (suppresses Gemma console.log/info/debug/warn; errors remain). Enable: window.gemSetDebugLogging(true, true). Disable: window.gemSetDebugLogging(false, true). Current: ${state.enabled ? 'ON' : 'OFF'}.`
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
    window.GEM_DEBUG = false;
  }
})();

(function() {
  const LOG_PREFIX = '[Gemma email-campaign-list]';
  const STORAGE_KEY = 'gemEmailCampaignListLoadAll';
  const FILTER_BUTTON_SELECTOR = 'e-datagrid-wrapper .e-datagrid__header_left .e-datagrid__filter_button button';
  const DATETIME_CLEAR_SELECTOR = '.e-datagrid__advanced_filters .e-datagrid__filter:first-child button.e-datetime__clear';

  function querySelectorIncludingShadow(selector, root = document) {
    const el = root.querySelector(selector);
    if (el) return el;
    for (const node of root.querySelectorAll('*')) {
      if (node.shadowRoot) {
        const found = querySelectorIncludingShadow(selector, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function waitForElement(selector, callback, options = {}) {
    const useShadow = options.pierceShadow ?? false;
    const query = useShadow ? (r) => querySelectorIncludingShadow(selector, r) : (r) => r.querySelector(selector);

    const element = query(document);
    if (element) {
      console.log(LOG_PREFIX, 'Element found immediately:', selector, useShadow ? '(shadow)' : '');
      callback(element);
      return;
    }

    console.log(LOG_PREFIX, 'Waiting for element:', selector, useShadow ? '(including shadow DOM)' : '');
    const root = document.body || document.documentElement;
    const observer = new MutationObserver(() => {
      const el = query(document);
      if (el) {
        console.log(LOG_PREFIX, 'Element appeared in DOM:', selector);
        observer.disconnect();
        callback(el);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  function waitForEnabled(selector, callback) {
    function isEnabled(el) {
      return el && !el.hasAttribute('disabled') && !el.disabled;
    }

    const el = document.querySelector(selector);
    if (isEnabled(el)) {
      console.log(LOG_PREFIX, 'Element already enabled, no wait needed');
      callback(el);
      return;
    }

    console.log(LOG_PREFIX, 'Element is disabled, polling until enabled...');
    const interval = setInterval(() => {
      const current = document.querySelector(selector);
      if (isEnabled(current)) {
        console.log(LOG_PREFIX, 'Element is now enabled');
        clearInterval(interval);
        callback(current);
      }
    }, 100);
  }

  function gemRunEmailCampaignListLoadAll() {
    console.log(LOG_PREFIX, 'Running, document.readyState:', document.readyState);
    waitForElement(FILTER_BUTTON_SELECTOR, (el) => {
      console.log(LOG_PREFIX, 'Filter button found, disabled:', el.hasAttribute('disabled'), 'el.disabled:', el.disabled);
      waitForEnabled(FILTER_BUTTON_SELECTOR, (btn) => {
        console.log(LOG_PREFIX, 'Clicking filter button');
        btn.click();
        waitForElement(DATETIME_CLEAR_SELECTOR, (clearEl) => {
          console.log(LOG_PREFIX, 'DateTime clear button found, clicking');
          clearEl.click();
          console.log(LOG_PREFIX, 'Done');
        }, { pierceShadow: true });
      });
    });
  }

  function init() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
      return;
    }
    chrome.storage.sync.get({ [STORAGE_KEY]: false }, (res) => {
      if (res && res[STORAGE_KEY] === true) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', gemRunEmailCampaignListLoadAll);
        } else {
          gemRunEmailCampaignListLoadAll();
        }
      }
    });
  }

  window.gemRunEmailCampaignListLoadAll = gemRunEmailCampaignListLoadAll;
  init();
})();
