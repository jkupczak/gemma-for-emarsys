// custom-paste-loader.js
// Loads (and configures) Gemma's custom TinyMCE paste behavior based on settings.
(function () {
  const KEY_ENABLED = 'gemCustomPasteEnabled';
  const KEY_BOLD = 'gemCustomPasteAllowBold';
  const KEY_ITALIC = 'gemCustomPasteAllowItalic';
  const KEY_STRIKE = 'gemCustomPasteAllowStrikethrough';
  const KEY_UNDERLINE = 'gemCustomPasteAllowUnderline';
  const KEY_SUP = 'gemCustomPasteAllowSuperscript';
  const KEY_ANCHOR = 'gemCustomPasteAllowAnchor';

  function readConfig(cb) {
    chrome.storage.sync.get({
      [KEY_ENABLED]: true,
      [KEY_BOLD]: true,
      [KEY_ITALIC]: true,
      [KEY_STRIKE]: true,
      [KEY_UNDERLINE]: true,
      [KEY_SUP]: true,
      [KEY_ANCHOR]: true
    }, (res) => {
      cb({
        enabled: res[KEY_ENABLED] !== false,
        allowBold: res[KEY_BOLD] !== false,
        allowItalic: res[KEY_ITALIC] !== false,
        allowStrikethrough: res[KEY_STRIKE] !== false,
        allowUnderline: res[KEY_UNDERLINE] !== false,
        allowSuperscript: res[KEY_SUP] !== false,
        allowAnchor: res[KEY_ANCHOR] !== false
      });
    });
  }

  function applyConfigToPage(config) {
    // Content scripts run in an isolated world, but DOM events cross that boundary.
    // We use a CustomEvent on window as a CSP-safe bridge (no inline scripts).
    const dispatchConfig = () => {
      try {
        window.dispatchEvent(new CustomEvent('gem-custom-paste-config', { detail: config }));
      } catch (_) {}
    };

    // Load page script only when enabled
    if (!config.enabled) {
      // If the page script is present, tell it to disable + tear down patches.
      dispatchConfig();
      return;
    }

    // Avoid double-injecting
    const existing = document.getElementById('gem-custom-paste-script');
    if (existing) {
      dispatchConfig();
      return;
    }

    const s = document.createElement('script');
    s.id = 'gem-custom-paste-script';
    s.src = chrome.runtime.getURL('custom-paste.js');
    s.async = false;
    s.addEventListener('load', () => dispatchConfig(), { once: true });
    (document.documentElement || document.head || document.body).appendChild(s);

    // Also dispatch immediately; if the script is already cached/fast, this may still land.
    dispatchConfig();
  }

  function refresh() {
    readConfig(applyConfigToPage);
  }

  // Initial
  refresh();

  // React to changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;
    if (
      changes[KEY_ENABLED] ||
      changes[KEY_BOLD] ||
      changes[KEY_ITALIC] ||
      changes[KEY_STRIKE] ||
      changes[KEY_UNDERLINE] ||
      changes[KEY_SUP] ||
      changes[KEY_ANCHOR]
    ) {
      refresh();
    }
  });
})();

