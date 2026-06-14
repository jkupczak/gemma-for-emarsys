(function () {
  "use strict";

  const GEM_THEME_MODE_STORAGE_KEY = "gemThemeMode";
  const GEM_THEME_MODE_LOCAL_KEY = "gemThemeMode";

  function normalizeGemThemeMode(value) {
    if (value === "original") return "original";
    if (value === "gemma-amethyst") return "gemma-amethyst";
    if (value === "gemma-ruby") return "gemma-ruby";
    if (value === "gemma-turquoise") return "gemma-turquoise";
    if (value === "gemma-topaz") return "gemma-topaz";
    if (value === "gemma-carnelian") return "gemma-carnelian";
    return "gemma-amethyst";
  }

  function applyGemThemeMode(mode, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const normalized = normalizeGemThemeMode(mode);
    const html = document.documentElement;
    if (!html) return;

    html.classList.remove(
      "gem-theme-sapphire",
      "gem-theme-active",
      "gem-theme-amethyst",
      "gem-theme-ruby",
      "gem-theme-turquoise",
      "gem-theme-topaz",
      "gem-theme-carnelian"
    );

    if (normalized === "original") {
      html.classList.add("gem-theme-sapphire");
    } else {
      html.classList.add("gem-theme-active");
      if (normalized === "gemma-amethyst") html.classList.add("gem-theme-amethyst");
      else if (normalized === "gemma-ruby") html.classList.add("gem-theme-ruby");
      else if (normalized === "gemma-topaz") html.classList.add("gem-theme-topaz");
      else if (normalized === "gemma-turquoise") html.classList.add("gem-theme-turquoise");
      else if (normalized === "gemma-carnelian") html.classList.add("gem-theme-carnelian");
    }

    if (options.persistLocal) {
      try {
        localStorage.setItem(GEM_THEME_MODE_LOCAL_KEY, normalized);
      } catch (_) {}
    }
  }

  function initGemThemeApplier() {
    try {
      const cachedMode = localStorage.getItem(GEM_THEME_MODE_LOCAL_KEY);
      applyGemThemeMode(cachedMode, { persistLocal: false });
    } catch (_) {}

    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get({ [GEM_THEME_MODE_STORAGE_KEY]: "gemma" }, (settings) => {
          applyGemThemeMode(settings[GEM_THEME_MODE_STORAGE_KEY], { persistLocal: true });
        });
      }
    } catch (_) {}

    try {
      if (chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "sync" || !changes[GEM_THEME_MODE_STORAGE_KEY]) return;
          applyGemThemeMode(changes[GEM_THEME_MODE_STORAGE_KEY].newValue, { persistLocal: true });
        });
      }
    } catch (_) {}
  }

  window.gemNormalizeThemeMode = normalizeGemThemeMode;
  window.gemApplyThemeMode = applyGemThemeMode;
  window.gemInitThemeApplier = initGemThemeApplier;

  initGemThemeApplier();
})();
