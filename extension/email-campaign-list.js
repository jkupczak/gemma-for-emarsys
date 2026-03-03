(function() {
  const LOG_PREFIX = '[Gemma email-campaign-list]';
  const STORAGE_KEY = 'gemEmailCampaignListLoadAll';
  const FILTER_BUTTON_SELECTOR = 'e-datagrid-wrapper .e-datagrid__header_left .e-datagrid__filter_button button';
  const DATETIME_CLEAR_SELECTOR = '.e-datagrid__advanced_filters .e-datagrid__filter:first-child button.e-datetime__clear';
  const LOAD_ALL_TOAST_MESSAGE = 'All emails loaded by Gemma. Adjust this in settings.';
  const LOAD_ALL_TOAST_DURATION_MS = 8400;

  function showLoadAllToast() {
    if (typeof window.gemShowToast === 'function') {
      window.gemShowToast(LOAD_ALL_TOAST_MESSAGE, { type: 'info', durationMs: LOAD_ALL_TOAST_DURATION_MS / 2 });
      return;
    }

    try {
      let container = document.getElementById('gem-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'gem-toast-container';
        container.style.position = 'fixed';
        container.style.right = '16px';
        container.style.bottom = '16px';
        container.style.zIndex = '100000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.style.pointerEvents = 'none';
      toast.style.padding = '10px 12px';
      toast.style.borderRadius = '10px';
      toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.20)';
      toast.style.border = '1px solid var(--token-box-default-border, rgba(0,0,0,0.12))';
      toast.style.borderLeft = '4px solid var(--token-blue-600, #2563eb)';
      toast.style.background = 'var(--token-box-default-background, #fff)';
      toast.style.color = 'var(--token-font-default, #111)';
      toast.style.fontSize = '13px';
      toast.style.maxWidth = '420px';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'opacity 140ms ease, transform 140ms ease';
      toast.textContent = LOAD_ALL_TOAST_MESSAGE;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => toast.remove(), 180);
      }, LOAD_ALL_TOAST_DURATION_MS);
    } catch (_) {}
  }

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

  function waitForEnabled(selector, callback, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;

    function isEnabled(el) {
      return el && !el.hasAttribute('disabled') && !el.disabled;
    }

    const el = document.querySelector(selector);
    if (isEnabled(el)) {
      console.log(LOG_PREFIX, 'Element already enabled, no wait needed');
      callback(el);
      return;
    }

    console.log(LOG_PREFIX, 'Element is disabled, observing until enabled...');

    let settled = false;
    let timeoutId = null;
    const root = document.body || document.documentElement;

    const cleanup = () => {
      observer.disconnect();
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = (enabledEl, reason) => {
      if (settled) return;
      settled = true;
      cleanup();
      console.log(LOG_PREFIX, `Element is now enabled (${reason})`);
      callback(enabledEl);
    };

    const observer = new MutationObserver(() => {
      const current = document.querySelector(selector);
      if (isEnabled(current)) {
        finish(current, 'mutation');
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class']
    });

    timeoutId = setTimeout(() => {
      cleanup();
      console.log(LOG_PREFIX, `Timed out waiting for enabled element: ${selector}`);
    }, timeoutMs);
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
          showLoadAllToast();
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
