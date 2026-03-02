// platform.js - lightweight platform helpers shared across Gemma scripts
// Exposes:
// - window.GEM_IS_MAC (boolean)
// - window.GEM_MOD_KEY (string) => "⌘" on macOS, "CTRL" otherwise
// - window.gemModCombo(key) => "⌘+X" / "CTRL+X"
(function () {
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
