console.log("[gem] settings-panel.js LOADED in frame:", window.location.href);

// ------------------------------------------------------------
// Theme mode (Gemma vs Original) - applied as early as possible
// ------------------------------------------------------------
const GEM_THEME_MODE_STORAGE_KEY = "gemThemeMode";
const GEM_THEME_MODE_LOCAL_KEY = "gemThemeMode";
const GEM_RECENT_IMAGES_STORAGE_KEY = 'gemRecentImages';
const GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY = 'gemRecentlySeenImages';
const GEM_RECENTLY_SEEN_IMAGES_MAX_KEY = 'gemRecentlySeenImagesMax';
const GEM_CUSTOM_PASTE_ENABLED_KEY = "gemCustomPasteEnabled";
const GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY = "gemCustomPasteAllowBold";
const GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY = "gemCustomPasteAllowItalic";
const GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY = "gemCustomPasteAllowStrikethrough";
const GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY = "gemCustomPasteAllowUnderline";
const GEM_CUSTOM_PASTE_ALLOW_SUP_KEY = "gemCustomPasteAllowSuperscript";
const GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY = "gemCustomPasteAllowAnchor";
const GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY = "gemEmailCampaignListLoadAll";
const GEM_EXPANDED_MODE_STORAGE_KEY = "fullscreenActive";

function normalizeGemThemeMode(value) {
  if (value === "original") return "original";
  if (value === "gemma-amethyst") return "gemma-amethyst";
  if (value === "gemma-ruby") return "gemma-ruby";
  if (value === "gemma-turquoise") return "gemma-turquoise";
  if (value === "gemma-topaz") return "gemma-topaz";
  return "gemma-amethyst"; // default
}

function applyGemThemeMode(mode, { persistLocal = false } = {}) {
  const normalized = normalizeGemThemeMode(mode);
  const html = document.documentElement;
  if (!html) return;

  // Remove all theme classes first
  html.classList.remove("gem--retheme-inactive", "gem-theme-active", "gem-theme-amethyst", "gem-theme-ruby", "gem-theme-turquoise", "gem-theme-topaz");

  if (normalized === "original") {
    html.classList.add("gem--retheme-inactive");
  } else {
    // Apply gem theme active class for all gemma themes
    html.classList.add("gem-theme-active");

    // Apply specific theme class
    if (normalized === "gemma-amethyst") {
      html.classList.add("gem-theme-amethyst");
    } else if (normalized === "gemma-ruby") {
      html.classList.add("gem-theme-ruby");
    } else if (normalized === "gemma-topaz") {
      html.classList.add("gem-theme-topaz");
    } else if (normalized === "gemma-turquoise") {
      html.classList.add("gem-theme-turquoise");
    }
  }

  if (persistLocal) {
    try {
      localStorage.setItem(GEM_THEME_MODE_LOCAL_KEY, normalized);
    } catch (e) {
      // ignore
    }
  }
}

function applyExpandedMode(enabled) {
  try {
    const body = document.body;
    if (!body) return;
    body.classList.toggle("gem-expanded", !!enabled);
  } catch (_) {
    // ignore
  }
}

// Apply from synchronous local cache first (minimize flash)
try {
  const cachedMode = localStorage.getItem(GEM_THEME_MODE_LOCAL_KEY);
  applyGemThemeMode(cachedMode, { persistLocal: false });
} catch (e) {
  // ignore
}

// Then reconcile with chrome.storage.sync (source of truth)
try {
  if (chrome?.storage?.sync) {
    chrome.storage.sync.get({ [GEM_THEME_MODE_STORAGE_KEY]: "gemma" }, (settings) => {
      applyGemThemeMode(settings[GEM_THEME_MODE_STORAGE_KEY], { persistLocal: true });
    });
  }
} catch (e) {
  // ignore (prevents rare "extension context invalidated" crashes)
}


// ------------------------------------------------------------
// settings-panel.js
// Slide-out settings panel for your Chrome extension UI
// ------------------------------------------------------------

// Default color swatches - globally available
window.DEFAULT_COLOR_SWATCHES = ["#FE4D01", "", "", "", "", "", "", ""];

// Default highlight terms - globally available for text-highlighting.js
window.DEFAULT_HIGHLIGHT_TERMS = {
  "\((price|prezzo|precio|preis|prix)\)": { color: "rgba(245, 46, 132, 0.40)", isRegex: true },
  "\{\{[^”“‘’}]+\}\}": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
  "((\$|£|€)(\s|\\xA0)?(\d|X)+|(\d|X)+(\s|\\xA0)?€)": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
  "(name)": { color: "rgba(0, 180, 255, 0.40)", isRegex: false },
  "(LearnLangAll)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_a_ENG)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_l_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_d_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_d_l_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(Lernsprache_a_FRA)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(Lernsprache_fem_FRA)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_d_l_ITA)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(LearnLangAll)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_for_SWE)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_nominative)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_locative)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_genitive)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_adjective)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_locative_po)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false }
};

(function () {
  let panelEl = null;
  let isOpen = false;
  let _gemPasteUiSyncing = false;
  let _gemPasteLastAllowState = null;
  let _gemSettingsListenersAttached = false;
  let _gemSettingsBoundHandlers = null;
  const _gemColorSwatchPendingWrites = new Map();
  let _gemColorSwatchFlushTimer = null;
  let _gemColorSwatchReloadAfterFlush = false;

  // ------------------------------------------------------------
  // Inject styles into page
  // ------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("gem-settings-style")) return;

    const style = document.createElement("style");
    style.id = "gem-settings-style";
    style.textContent = `
      #gem-settings-panel {
        position: fixed;
        top: 0;
        right: -500px;
        width: 500px;
        height: 100vh;
        background: var(--token-background-faint);
        box-shadow: -4px 0 20px rgba(0,0,0,0.15);
        z-index: 9999;
        transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        display: flex;
        flex-direction: column;
        border-radius: 8px 0 0 8px;
      }

      #gem-settings-panel input, #gem-settings-panel select {
        background: var(--token-input-default-background);
        border: 2px solid var(--token-box-default-border);
        padding: 8px 2px 8px 12px;
        border-radius:6px;
      }

      #gem-settings-header {
        padding: 20px 24px;
        font-size: 18px;
        font-weight: 700;
        background: var(--token-box-default-border);
        color: var(--token-text-default);
        border-radius: 8px 0 0 0;
      }

      #gem-settings-body {
        padding: 20px 10px 0 20px;
        overflow-y: auto;
        flex-grow: 1;
      }

      #gem-settings-panel input[type="color"] {
        padding: 5px !important;
      }

      .gem-setting-info {
        margin: 20px;
        font-size: 16px;
      }

      .gem-setting-section .gem-setting {
        margin: 20px;
      }
      .gem-setting {
        margin-bottom:20px;
        background: var(--token-box-default-background);
        padding: 16px;
        border-radius: 8px;
        border: 1px solid var(--token-box-default-border);
        transition: all 0.2s ease;
      }

      .gem-setting-section > .gem-setting-condensed {
        border: none;
        padding: 0;
        border-radius: 0;
        margin: 20px;
      }
        .gem-setting-section > .gem-setting-condensed:hover {
          box-shadow: none;
        }

      .gem-setting label + label { padding: 12px 0 0 }
      [data-gem-paste-allow-disabled] { display: none; }
      p:has(+ [data-gem-paste-allow-disabled]) { margin-bottom: 0 !important; }
      .gem-setting:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-color: var(--token-blue-700);
      }

      .gem-setting label {
        display: flex;
        align-items: center;
        margin-bottom: 0;
        font-weight: 600;
        font-size: 16px;
        color: var(--token-font-default);
        cursor: pointer;
      }

      .gem-setting input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin-right: 12px;
        cursor: pointer;
        accent-color: var(--token-primary-600);
        border-radius: 4px;
      }

      #gem-settings-close {
        position: absolute;
        top: 16px;
        right: 16px;
        font-size: 20px;
        cursor: pointer;
        color: white;
        opacity: 0.8;
        transition: opacity 0.2s ease;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: rgba(255,255,255,0.1);
      }

      #gem-settings-close:hover {
        opacity: 1;
        background: rgba(255,255,255,0.2);
      }

      .gem-setting-section {
        margin: 15px 0 30px;
        background: var(--token-box-default-background);
        border-radius: 12px;
        border: 1px solid var(--token-box-default-border);
        overflow: hidden;
      }

      .gem-setting-section h3 {
        margin: 0;
        padding: 16px 20px;
        font-size: 16px;
        font-weight: 700;
        color: var(--token-text-default);
        background: var(--token-box-default-border);
        border-bottom: 1px solid var(--token-box-default-border);
      }

      .gem-setting-section > div {
        margin: 20px;
      }

      .highlight-term-item {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
        padding: 12px 16px;
        background: var(--token-background-faint);
        border: 1px solid var(--token-box-default-border);
        border-radius: 8px;
        transition: all 0.2s ease;
      }

      .highlight-term-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .highlight-term-regex {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: #6b7280;
      }

      .highlight-term-regex input[type="checkbox"] {
        width: 14px;
        height: 14px;
        margin: 0;
      }

      .highlight-term-item:last-child {
        margin-bottom: 0;
      }

      .highlight-term-text {
        flex: 1;
        padding: 8px 12px;
        border: 2px solid var(--token-box-default-border);
        border-radius: 6px;
        font-size: 13px;
        font-family: inherit;
        transition: border-color 0.2s ease;
      }

      .highlight-term-text:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .highlight-term-remove,
      .color-swatch-clear {
        border: none;
        background: var(--token-box-default-border);
        color: #6b7280;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .highlight-term-remove:hover,
      .color-swatch-clear:hover {
        background: #e5e7eb;
        border-color: #9ca3af;
        color: var(--token-font-default);
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .gem-add-term {
        display: flex;
        gap: 12px;
        align-items: center;
        margin: 0 20px 20px;
        padding: 16px;
        border: 2px dashed var(--token-box-default-border);
        border-radius: 8px;
        transition: all 0.2s ease;
      }

      .gem-add-term input[type="text"] {
        flex: 1;
        padding: 10px 14px;
        border: 2px solid var(--token-box-default-border);
        border-radius: 6px;
        font-size: 13px;
        font-family: inherit;
        transition: border-color 0.2s ease;
      }

      .gem-add-term input[type="text"]:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .gem-add-term input[type="color"] {
        width: 56px;
        height: 40px;
        border: 2px solid var(--token-box-default-border);
        border-radius: 6px;
        cursor: pointer;
        transition: border-color 0.2s ease;
      }

      .gem-add-term input[type="color"]:hover {
        border-color: #667eea;
      }

      .gem-setting-section-content-block-toolbar e-icon, 
      .gem-setting-section-content-block-toolbar gem-e-icon {
        margin-right: 4px;
        transform: scale(0.9);
      }

      .gem-add-term button {
        padding: 10px 16px;
        background: var(--token-button-highlight-background);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
      }

      .gem-add-term button:hover {
        background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
      }

      .color-swatch-item {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
        padding: 12px 16px;
        background: var(--token-background-faint);
        border: 1px solid var(--token-box-default-border);
        border-radius: 8px;
        transition: all 0.2s ease;
      }

      .color-swatch-number {
        font-weight: 600;
        color: var(--token-font-default);
        min-width: 60px;
      }

      .gem-setting-section .sub-label {
          font-size: 16px;
          font-weight: normal;
          margin-top:8px;
          opacity: 0.8;
      }
          .gem-setting-section .sub-label:last-child {
            margin-bottom: 0;
          }

      .color-swatch-input {
        flex: 1;
        padding: 8px 12px;
        border: 2px solid var(--token-box-default-border);
        border-radius: 6px;
        font-size: 13px;
        font-family: inherit;
        transition: border-color 0.2s ease;
      }

      .color-swatch-input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      #gem-settings-body h2 { 
        margin-top: 30px;
        margin-bottom: 10px;
        border-top: 2px solid var(--token-box-default-background);
        padding-top: 24px;
      }

      .color-swatch-color {
        min-width:36px;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
        transition: border-color 0.2s ease;
        background: none;
        padding: 0;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
      }

      .color-swatch-color:hover {
        border-color: #667eea;
      }

      /* Ensure color input displays as a box on all browsers */
      .color-swatch-color::-webkit-color-swatch-wrapper {
        padding: 0;
      }

      .color-swatch-color::-webkit-color-swatch {
        border: none;
        border-radius: 4px;
      }

      .color-swatch-color::-moz-color-swatch {
        border: none;
        border-radius: 4px;
      }


      .gem-info {
      padding-bottom:0;
      }

      .gem-info small {
        font-size: 12px;
        line-height: 1.2;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeRecentlySeenMax(value) {
    const n = (typeof value === 'number') ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n)) return 300;
    return Math.min(2000, Math.max(50, Math.trunc(n)));
  }

  function pruneRecentlySeenToMax(max) {
    const limit = normalizeRecentlySeenMax(max);
    try {
      chrome.storage.local.get({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: [] }, (res) => {
        try {
          const list = Array.isArray(res && res[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]) ? res[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY] : [];
          if (list.length <= limit) return;
          const cleaned = list
            .map((x) => {
              const url = x && x.url;
              if (!url) return null;
              const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
              const path = (x && typeof x.path === 'string') ? x.path : '';
              const friendlyFilename = (x && typeof x.friendlyFilename === 'string') ? x.friendlyFilename : '';
              return { url, ts, path, friendlyFilename };
            })
            .filter(Boolean);
          cleaned.sort((a, b) => (a.ts || 0) - (b.ts || 0));
          while (cleaned.length > limit) cleaned.shift();
          chrome.storage.local.set({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: cleaned });
        } catch (_) { }
      });
    } catch (_) { }
  }

  // ------------------------------------------------------------
  // Create panel structure
  // ------------------------------------------------------------
  function createPanel() {
    if (panelEl) return panelEl;

    injectStyles();

    panelEl = document.createElement("div");
    panelEl.id = "gem-settings-panel";
    panelEl.innerHTML = `
      <div id="gem-settings-header">
        Gemma Settings
        <div id="gem-settings-close">✕</div>
      </div>
      <div id="gem-settings-body" class="gem-scrollable">

        <div style="display: flex; flex-direction: row; gap: 12px;">
          <div class="gem-welcome-link gem-border-hover-primary-600" style="border-radius: 8px; align-content: center; flex: 1; color: var(--token-text-default); text-align: center; cursor: pointer; border: 1px solid var(--token-box-default-border);">
            <div style="font-size: 16px; font-weight: 600">
              ✨&nbsp;&nbsp;Feature List
            </div>
          </div>

          <div style="flex: 1;">
            <button class="e-btn gem-keyboard-shortcuts-btn gem-border-hover-primary-600" type="button" style="border: 1px solid var(--token-box-default-border); background:transparent; color: var(--token-text-default); border-radius: 8px; width: 100%; text-align:center; height:auto; padding: 12px;">
              <div style="font-size: 16px; font-weight: 600">
                ⌨️&nbsp;&nbsp;Keyboard Shortcuts
              </div>
            </button>
          </div>
        </div>

        <h2>General Settings</h2>

        <div class="gem-setting-section">
          <h3>Theme</h3>
          <div class="gem-setting">
            <div style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-theme-mode" style="flex: 1;">Theme</label>
              <select id="opt-theme-mode" style="width: 220px;">
                <option value="gemma-amethyst" selected>Gemma Amethyst</option>
                <option value="gemma-ruby">Gemma Ruby</option>
                <option value="gemma-turquoise">Gemma Turquoise</option>
                <option value="gemma-topaz">Gemma Topaz</option>
                <option value="original">Original Emarsys Theme</option>
              </select>
            </div>
            <div class="sub-label">
              Choose from different Gemma color themes or use the original Emarsys UI.
            </div>
          </div>
        </div>

        <h2>Email Editor Settings</h2>

        <div class="gem-setting-section">
          <h3>Layout</h3>
          <div class="gem-setting">
            <label>
            <input type="checkbox" id="opt-enable-expanded-mode" />
            Toggle expanded mode
            </label>
            <p class="sub-label">
              An alternative layout that increases the total viewable area of your email by over 40%. You can turn it on here, via the <span class="gem-e-icon">&#61658;</span> icon next to your email, or use the keyboard shortcut CMD+/ or CTRL+/ at any time.
            </p>
          </div>
          <div class="gem-setting">
            <label>
            <input type="checkbox" id="opt-enable-mobile-preview" />
            Toggle mobile preview pane
            </label>
            <p class="sub-label">
              Keep a mobile preview of your email visible next to your desktop view while you make edits. You can turn it on here, via the <span class="gem-e-icon">&#61747;</span> icon next to your email, or use the keyboard shortcut CMD+SHIFT+F or CTRL+SHIFT+F at any time.
            </p>
            <div class="gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-mobile-preview-width" style="flex: 1;">Width (px)</label>
              <input type="number" id="opt-mobile-preview-width" min="200" max="800" step="1" style="width: 120px;" />
            </div>
            <div class="gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-mobile-preview-scale" style="flex: 1;">Scale</label>
              <select id="opt-mobile-preview-scale" style="width: 120px;">
                <option value="1">100%</option>
                <option value="0.5">50%</option>
              </select>
            </div>
          </div>

          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-show-finish-editing-btn" checked />
              Show "Finish Editing" Button
            </label>
          </div>
        </div>

        <div class="gem-setting-section gem-setting-section-content-block-toolbar">
          <h3>Content Block Toolbar</h3>
          <p class="gem-setting-info">The content block toolbar is visible when hovering over a block in your email. Most of the icons can be toggled on or off based on the preferences you set here.</p>
          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-manage-optional-content" style="flex: 1;">
            <e-icon icon="click-rate-over-time"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Manage optional content</label>
            <select id="opt-manage-optional-content" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-predict-recommendation" style="flex: 1;">
            <e-icon icon="feature-predict"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
              Predict Recommendation
            </label>
            <select id="opt-predict-recommendation" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-product-finder" style="flex: 1;">
            <e-icon icon="search"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Product Finder</label>
            <select id="opt-product-finder" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-product-source" style="flex: 1;">
            <e-icon icon="product"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Product Source</label>
            <select id="opt-product-source" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-save-to-reuse" style="flex: 1;">
            <e-icon icon="save"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Save to reuse</label>
            <select id="opt-save-to-reuse" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-reset-block" style="flex: 1;">
            <e-icon icon="reset"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Reset block</label>
            <select id="opt-reset-block" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-convert-esl-to-tokens" style="flex: 1;">
            <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon"></div>
      </div>
    </gem-e-icon>
            Convert ESL to Tokens</label>
            <select id="opt-convert-esl-to-tokens" style="width: 150px;">
              <option value="always-show" selected>Show if Available</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-swap-keywords" style="flex: 1;">
            <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon"></div>
      </div>
    </gem-e-icon>
            Swap Keywords</label>
            <select id="opt-swap-keywords" style="width: 150px;">
              <option value="always-show" selected>Show if Available</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Color Swatch Management</h3>
          <p class="gem-setting-info">These colors will appear as the first row in the color picker. Add or remove any color you want (up to 8 total).</p>
          <div id="color-swatches-list">
            <!-- Color swatches will be dynamically added here -->
          </div>
        </div>

<div class="gem-setting-section">
          <h3>Blocks Panel</h3>

          <div class="gem-setting">
            <div style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-blocks-panel-layout" style="flex: 1;">Layout</label>
              <select id="opt-blocks-panel-layout" style="width: 150px;">
                <option value="1">1 per Row</option>
                <option value="2" selected>2 per Row</option>
                <option value="3">3 per Row</option>
              </select>
            </div>
            <div class="sub-label">Choose how many blocks to display per row in the blocks panel.</div>
          </div>

          <div class="gem-setting">
            <button id="unhide-all-blocks-btn" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;">
              Unhide All Blocks
            </button>
            <div class="sub-label">Permanently unhide all blocks that have been hidden. This action cannot be undone.</div>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Text Highlighting Configuration</h3>
        <div class="gem-setting">
          <label>
            <input type="checkbox" id="opt-enable-highlighting" />
            Enable text highlighting overlays
          </label>
          <p class="sub-label">
            Creates overlays to help you quickly identify and highlight specific text in your email.
          </p>
        </div>
          <div id="highlight-terms-list">
            <!-- Terms will be dynamically added here -->
          </div>
          <div class="gem-add-term">
            <input type="text" id="new-term-text" placeholder="New term to highlight" />
            <input type="color" id="new-term-color" class="color-swatch-color" value="#ffff00" />
            <button id="add-term-btn">Add</button>
          </div>
          <div class="gem-highlight-actions" style="display: flex; gap: 10px; justify-content: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--token-box-default-border, #e0e0e0);">
            <button id="export-highlight-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Export Rules</button>
            <button id="import-highlight-btn" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Import Rules</button>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Rich Paste</h3>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-custom-paste-enabled" checked />
              Enable Gemma's Rich Paste behavior
            </label>
            <p class="sub-label">Emarsys's normal plain text formatting is replaced with behavior that supports pasting common styles like bold and italic.</p>
            <div class="gem-setting-group">
              <label>
                <input type="checkbox" id="opt-custom-paste-bold" checked />
                Allow bold formatting to be pasted
              </label>
              <label>
                <input type="checkbox" id="opt-custom-paste-italic" checked />
                Allow italic formatting to be pasted
              </label>
              <label>
                <input type="checkbox" id="opt-custom-paste-strike" checked />
                Allow strikethrough formatting to be pasted
              </label>
              <label>
                <input type="checkbox" id="opt-custom-paste-underline" checked />
                Allow underline formatting to be pasted
              </label>
              <label>
                <input type="checkbox" id="opt-custom-paste-sup" checked />
                Allow superscript formatting to be pasted
              </label>
              <label>
                <input type="checkbox" id="opt-custom-paste-anchor" checked />
                Allow links to be pasted
              </label>
            </div>
          </div>
        </div>


        <h2>Media Picker Settings</h2>

        <div class="gem-setting-section">
          <h3>General</h3>
          <div class="gem-setting">
            <label style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <span>Recently Seen limit</span>
              <input type="number" id="opt-recently-seen-max" min="50" max="2000" step="1" value="300" style="width:120px;" />
            </label>
            <div class="sub-label">
              Max number of images to keep in the Recently Seen list (50–2000).
            </div>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <label>
              <input type="checkbox" id="opt-show-file-icon" checked />
              Show filetype icons in media picker
            </label>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <label>
              <input type="checkbox" id="opt-show-created-column" checked />
              Show 'Created' column in media picker
            </label>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <label>
              <input type="checkbox" id="opt-show-size-column" checked />
              Show 'Size' column in media picker
            </label>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <label>
              <input type="checkbox" id="opt-show-user-column" checked />
              Show 'User' column in media picker
            </label>
          </div>
        </div>


        <h2>Email Campaign List Settings</h2>

        <div class="gem-setting-section">
          <h3>Filters</h3>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-email-campaign-list-load-all" style="align-self: self-start; margin-top: 4px" />
                Load all emails by default
            </label>
            <p class="sub-label">
              The default 'Created' date filter is cleared automatically. Warning: This increases page load time.
            </p>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(panelEl);

    // Close button
    panelEl.querySelector("#gem-settings-close")
      .addEventListener("click", closePanel);

    // Welcome modal link
    const welcomeLink = panelEl.querySelector(".gem-welcome-link");
    if (welcomeLink) {
      welcomeLink.addEventListener("click", () => {
        if (window.showWelcomeModal) {
          window.showWelcomeModal();
        }
      });
    }

    // Keyboard shortcuts button
    const shortcutsBtn = panelEl.querySelector(".gem-keyboard-shortcuts-btn");
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener("click", showKeyboardShortcutsModal);
    }

    return panelEl;
  }

  // ------------------------------------------------------------
  // Load settings into UI
  // ------------------------------------------------------------
  function loadSettings() {
    // First check if highlightTerms exists to determine if user has customized
    chrome.storage.sync.get(['highlightTerms'], (result) => {
      let highlightTerms;

      if (result.highlightTerms === undefined) {
        // First-time user: use defaults from text-highlighting.js
        console.log("[gem] Settings panel: First-time user, using default highlight terms");
        highlightTerms = window.DEFAULT_HIGHLIGHT_TERMS || {};
      } else {
        // Existing user: use their stored terms
        console.log("[gem] Settings panel: Using existing user highlight terms");
        highlightTerms = result.highlightTerms;
      }

      // Now get the other settings
      chrome.storage.sync.get({
        [GEM_THEME_MODE_STORAGE_KEY]: "gemma",
        enableHighlighting: true,
        enableMobilePreview: true,
        showFinishEditingBtn: true,
        colorSwatches: window.DEFAULT_COLOR_SWATCHES,
        blocksPanelLayout: "2",
        manageOptionalContent: "hide-if-disabled",
        predictRecommendationSettings: "hide-if-disabled",
        productFinder: "always-show",
        productSource: "hide-if-disabled",
        saveToReuse: "always-show",
        resetBlock: "always-show",
        convertEslToTokens: "always-show",
        swapKeywords: "always-show",
        mobilePreviewWidth: 414,
        mobilePreviewScale: 0.5,
        mobileViewVisible: true,
        showFileIcon: true,
        showCreatedColumn: true,
        showSizeColumn: true,
        showUserColumn: true,
        [GEM_CUSTOM_PASTE_ENABLED_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_SUP_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY]: true,
        [GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]: 300,
        [GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY]: false,
        [GEM_EXPANDED_MODE_STORAGE_KEY]: false
      }, (settings) => {
        const themeSelect = document.getElementById("opt-theme-mode");
        if (themeSelect) {
          themeSelect.value = normalizeGemThemeMode(settings[GEM_THEME_MODE_STORAGE_KEY]);
        }

        document.getElementById("opt-blocks-panel-layout").value =
          settings.blocksPanelLayout;

        // Content Block Toolbar settings
        document.getElementById("opt-manage-optional-content").value =
          settings.manageOptionalContent;
        document.getElementById("opt-predict-recommendation").value =
          settings.predictRecommendationSettings;
        document.getElementById("opt-product-finder").value =
          settings.productFinder;
        document.getElementById("opt-product-source").value =
          settings.productSource;
        document.getElementById("opt-save-to-reuse").value =
          settings.saveToReuse;
        document.getElementById("opt-reset-block").value =
          settings.resetBlock;
        document.getElementById("opt-convert-esl-to-tokens").value =
          settings.convertEslToTokens;
        const swapKeywordsSelect = document.getElementById("opt-swap-keywords");
        if (swapKeywordsSelect) swapKeywordsSelect.value = settings.swapKeywords || "always-show";

        document.getElementById("opt-custom-paste-enabled").checked =
          settings[GEM_CUSTOM_PASTE_ENABLED_KEY] !== false;
        document.getElementById("opt-custom-paste-bold").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY] !== false;
        document.getElementById("opt-custom-paste-italic").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY] !== false;
        document.getElementById("opt-custom-paste-strike").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY] !== false;
        document.getElementById("opt-custom-paste-underline").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY] !== false;
        document.getElementById("opt-custom-paste-sup").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_SUP_KEY] !== false;
        document.getElementById("opt-custom-paste-anchor").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY] !== false;

        // Apply enable/disable state for Paste Behavior controls after values are loaded
        syncPasteBehaviorUI({ fromLoad: true });

        document.getElementById("opt-enable-highlighting").checked =
          settings.enableHighlighting;

        document.getElementById("opt-enable-mobile-preview").checked =
          settings.mobileViewVisible !== undefined
            ? settings.mobileViewVisible
            : settings.enableMobilePreview;

        const expandedModeToggle = document.getElementById("opt-enable-expanded-mode");
        if (expandedModeToggle) {
          expandedModeToggle.checked = settings[GEM_EXPANDED_MODE_STORAGE_KEY] === true;
        }

        applyExpandedMode(settings[GEM_EXPANDED_MODE_STORAGE_KEY] === true);

        const widthInput = document.getElementById("opt-mobile-preview-width");
        if (widthInput) widthInput.value = settings.mobilePreviewWidth || 414;

        const scaleSelect = document.getElementById("opt-mobile-preview-scale");
        if (scaleSelect) scaleSelect.value = String(settings.mobilePreviewScale || 0.5);

        document.getElementById("opt-show-finish-editing-btn").checked =
          settings.showFinishEditingBtn;

        const emailCampaignListLoadAll = document.getElementById("opt-email-campaign-list-load-all");
        if (emailCampaignListLoadAll) {
          emailCampaignListLoadAll.checked = settings[GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY] === true;
        }

        const recentlySeenMaxInput = document.getElementById("opt-recently-seen-max");
        if (recentlySeenMaxInput) {
          recentlySeenMaxInput.value = String(normalizeRecentlySeenMax(settings[GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]));
        }

        // Load MediaDB settings
        chrome.storage.sync.get({
          gemMediaDBColumnVisibility: {
            showFileIcon: true,
            showCreated: true,
            showSize: true,
            showUser: true
          }
        }, (mediaDBResult) => {
          const mediaDBSettings = mediaDBResult.gemMediaDBColumnVisibility;
          document.getElementById("opt-show-file-icon").checked = mediaDBSettings.showFileIcon;
          document.getElementById("opt-show-created-column").checked = mediaDBSettings.showCreated;
          document.getElementById("opt-show-size-column").checked = mediaDBSettings.showSize;
          document.getElementById("opt-show-user-column").checked = mediaDBSettings.showUser;
        });

        // Load color swatches
        loadColorSwatches(settings.colorSwatches);

        // Load highlight terms (using the resolved highlightTerms)
        loadHighlightTerms(highlightTerms);
      });
    });
  }

  // ------------------------------------------------------------
  // Save settings when toggled
  // ------------------------------------------------------------
  function attachListeners() {
    if (_gemSettingsListenersAttached) return;

    if (!_gemSettingsBoundHandlers) {
      _gemSettingsBoundHandlers = {
        saveSettingsHandler() {
          // Keep Paste Behavior UI consistent before saving (and avoid invalid state)
          syncPasteBehaviorUI();
          const widthVal = parseInt(document.getElementById("opt-mobile-preview-width")?.value, 10);
          const safeWidth = Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 414;

          const scaleVal = parseFloat(document.getElementById("opt-mobile-preview-scale")?.value);
          const safeScale = scaleVal === 1 ? 1 : 0.5;

          const mobileVisible =
            document.getElementById("opt-enable-mobile-preview")?.checked ?? true;
          const expandedModeEnabled =
            document.getElementById("opt-enable-expanded-mode")?.checked ?? false;

          const settingsToSave = {
            [GEM_THEME_MODE_STORAGE_KEY]:
              normalizeGemThemeMode(document.getElementById("opt-theme-mode")?.value),
            blocksPanelLayout:
              document.getElementById("opt-blocks-panel-layout")?.value ?? "2",
            manageOptionalContent:
              document.getElementById("opt-manage-optional-content")?.value ?? "hide-if-disabled",
            predictRecommendationSettings:
              document.getElementById("opt-predict-recommendation")?.value ?? "hide-if-disabled",
            productFinder:
              document.getElementById("opt-product-finder")?.value ?? "always-show",
            productSource:
              document.getElementById("opt-product-source")?.value ?? "hide-if-disabled",
            saveToReuse:
              document.getElementById("opt-save-to-reuse")?.value ?? "always-show",
            resetBlock:
              document.getElementById("opt-reset-block")?.value ?? "always-show",
            convertEslToTokens:
              document.getElementById("opt-convert-esl-to-tokens")?.value ?? "always-show",
            swapKeywords:
              document.getElementById("opt-swap-keywords")?.value ?? "always-show",
            [GEM_CUSTOM_PASTE_ENABLED_KEY]:
              document.getElementById("opt-custom-paste-enabled")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY]:
              document.getElementById("opt-custom-paste-bold")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY]:
              document.getElementById("opt-custom-paste-italic")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY]:
              document.getElementById("opt-custom-paste-strike")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY]:
              document.getElementById("opt-custom-paste-underline")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_SUP_KEY]:
              document.getElementById("opt-custom-paste-sup")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY]:
              document.getElementById("opt-custom-paste-anchor")?.checked ?? true,
            [GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]:
              normalizeRecentlySeenMax(document.getElementById("opt-recently-seen-max")?.value),
            enableHighlighting:
              document.getElementById("opt-enable-highlighting")?.checked ?? true,
            enableMobilePreview: mobileVisible,
            mobileViewVisible: mobileVisible,
            showFinishEditingBtn:
              document.getElementById("opt-show-finish-editing-btn")?.checked ?? true,
            [GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY]:
              document.getElementById("opt-email-campaign-list-load-all")?.checked ?? false,
            [GEM_EXPANDED_MODE_STORAGE_KEY]: expandedModeEnabled,
            mobilePreviewWidth: safeWidth,
            mobilePreviewScale: safeScale
          };

          // Apply immediately + cache synchronously for next page load
          applyGemThemeMode(settingsToSave[GEM_THEME_MODE_STORAGE_KEY], { persistLocal: true });
          applyExpandedMode(settingsToSave[GEM_EXPANDED_MODE_STORAGE_KEY]);

          chrome.storage.sync.set(settingsToSave);

          // If the limit was reduced, prune local recently seen immediately
          try { pruneRecentlySeenToMax(settingsToSave[GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]); } catch (_) { }

          // Save MediaDB settings separately
          const mediaDBSettings = {
            showFileIcon: document.getElementById("opt-show-file-icon")?.checked ?? true,
            showCreated: document.getElementById("opt-show-created-column")?.checked ?? true,
            showSize: document.getElementById("opt-show-size-column")?.checked ?? true,
            showUser: document.getElementById("opt-show-user-column")?.checked ?? true
          };
          chrome.storage.sync.set({ gemMediaDBColumnVisibility: mediaDBSettings });
        },
        syncPasteBehaviorHandler() {
          syncPasteBehaviorUI();
        },
        exportHandler() {
          showExportModal();
        },
        importHandler() {
          showImportModal();
        },
        unhideAllBlocksHandler() {
          if (!confirm("Are you sure you want to unhide all blocks? This will permanently show all blocks that were previously hidden.")) return;
          chrome.storage.sync.set({ hiddenBlocks: [], showHiddenBlocks: false }, () => {
            if (chrome.runtime.lastError) {
              console.error("[Gem] Error clearing hidden blocks:", chrome.runtime.lastError);
              alert("Failed to unhide blocks. Please try again.");
            } else {
              console.log("[Gem] All blocks have been unhidden");
              alert("All blocks have been unhidden successfully!");
            }
          });
        }
      };
    }

    const handlers = _gemSettingsBoundHandlers;

    // Settings elements that trigger save
    const settingsIds = [
      "opt-theme-mode",
      "opt-blocks-panel-layout",
      "opt-manage-optional-content",
      "opt-predict-recommendation",
      "opt-product-finder",
      "opt-product-source",
      "opt-save-to-reuse",
      "opt-reset-block",
      "opt-convert-esl-to-tokens",
      "opt-swap-keywords",
      "opt-enable-highlighting",
      "opt-enable-expanded-mode",
      "opt-enable-mobile-preview",
      "opt-show-finish-editing-btn",
      "opt-email-campaign-list-load-all",
      "opt-mobile-preview-width",
      "opt-mobile-preview-scale",
      "opt-show-file-icon",
      "opt-show-created-column",
      "opt-show-size-column",
      "opt-show-user-column",
      "opt-recently-seen-max",
      "opt-custom-paste-enabled",
      "opt-custom-paste-bold",
      "opt-custom-paste-italic",
      "opt-custom-paste-strike",
      "opt-custom-paste-underline",
      "opt-custom-paste-sup",
      "opt-custom-paste-anchor"
    ];

    settingsIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", handlers.saveSettingsHandler);
    });

    // Paste Behavior UI rules (enable/disable + auto-toggle)
    const pasteIds = [
      "opt-custom-paste-enabled",
      "opt-custom-paste-bold",
      "opt-custom-paste-italic",
      "opt-custom-paste-strike",
      "opt-custom-paste-underline",
      "opt-custom-paste-sup",
      "opt-custom-paste-anchor"
    ];
    pasteIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", handlers.syncPasteBehaviorHandler);
    });

    const addBtn = document.getElementById("add-term-btn");
    if (addBtn) {
      addBtn.addEventListener("click", addNewTerm);
    }

    const exportBtn = document.getElementById("export-highlight-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", handlers.exportHandler);
    }

    const importBtn = document.getElementById("import-highlight-btn");
    if (importBtn) {
      importBtn.addEventListener("click", handlers.importHandler);
    }

    const unhideBtn = document.getElementById("unhide-all-blocks-btn");
    if (unhideBtn) {
      unhideBtn.addEventListener("click", handlers.unhideAllBlocksHandler);
    }

    _gemSettingsListenersAttached = true;
  }

  function syncPasteBehaviorUI({ fromLoad = false } = {}) {
    if (_gemPasteUiSyncing) return;
    _gemPasteUiSyncing = true;
    try {
      const enabledEl = document.getElementById('opt-custom-paste-enabled');
      const allowEls = [
        document.getElementById('opt-custom-paste-bold'),
        document.getElementById('opt-custom-paste-italic'),
        document.getElementById('opt-custom-paste-strike'),
        document.getElementById('opt-custom-paste-underline'),
        document.getElementById('opt-custom-paste-sup'),
        document.getElementById('opt-custom-paste-anchor')
      ].filter(Boolean);

      if (!enabledEl || allowEls.length === 0) return;

      const prevEnabled = enabledEl.dataset.gemPrevEnabled === 'true';
      const isEnabled = !!enabledEl.checked;
      const allowGroup = allowEls[0] && allowEls[0].closest ? allowEls[0].closest('.gem-setting-group') : null;

      // If enabling, re-enable allow options first and ensure at least one is checked.
      if (isEnabled && !prevEnabled) {
        allowEls.forEach((el) => { el.disabled = false; });
        if (allowGroup) delete allowGroup.dataset.gemPasteAllowDisabled;

        const anyNow = allowEls.some((el) => !!el.checked);
        if (!anyNow) {
          if (_gemPasteLastAllowState && _gemPasteLastAllowState.length === allowEls.length) {
            allowEls.forEach((el, idx) => { el.checked = !!_gemPasteLastAllowState[idx]; });
          } else {
            // Default: enable all allow options
            allowEls.forEach((el) => { el.checked = true; });
          }
        }
        _gemPasteLastAllowState = null;
      }

      const anyAllowChecked = allowEls.some((el) => !!el.checked);

      // Rule 1: If user unchecks all "Allow…" options while enabled, disable custom paste as well.
      // (But do NOT prevent enabling; enabling restores defaults above.)
      if (isEnabled && prevEnabled && !anyAllowChecked) {
        enabledEl.checked = false;
      }

      // Rule 2: If custom paste disabled, disable/gray out allow options.
      const isEnabledFinal = !!enabledEl.checked;

      if (!isEnabledFinal) {
        // Remember state so re-enabling can restore it
        if (!fromLoad && _gemPasteLastAllowState == null) {
          _gemPasteLastAllowState = allowEls.map((el) => !!el.checked);
        }
        allowEls.forEach((el) => {
          el.disabled = true;
        });
        if (allowGroup) allowGroup.dataset.gemPasteAllowDisabled = 'true';
      } else {
        allowEls.forEach((el) => {
          el.disabled = false;
        });
        if (allowGroup) delete allowGroup.dataset.gemPasteAllowDisabled;

        // If enabling while all allow options are unchecked, restore previous state or defaults.
        const anyNow = allowEls.some((el) => !!el.checked);
        if (!anyNow) {
          if (_gemPasteLastAllowState && _gemPasteLastAllowState.length === allowEls.length) {
            allowEls.forEach((el, idx) => { el.checked = !!_gemPasteLastAllowState[idx]; });
          } else {
            // Default: enable all allow options
            allowEls.forEach((el) => { el.checked = true; });
          }
        }
        _gemPasteLastAllowState = null;
      }

      enabledEl.dataset.gemPrevEnabled = (enabledEl.checked ? 'true' : 'false');
    } finally {
      _gemPasteUiSyncing = false;
    }
  }

  // Load highlight terms into the UI
  function loadHighlightTerms(terms) {
    const container = document.getElementById("highlight-terms-list");
    if (!container) return;

    container.innerHTML = "";

    Object.entries(terms).forEach(([term, termData]) => {
      const termItem = createTermItem(term, termData);
      container.appendChild(termItem);
    });
  }

  // Create a term item element
  function createTermItem(term, termData) {
    // Handle both old format (string) and new format (object)
    const color = typeof termData === 'string' ? termData : termData.color;
    const isRegex = typeof termData === 'object' ? termData.isRegex : false;

    const item = document.createElement("div");
    item.className = "highlight-term-item";

    item.innerHTML = `
      <input type="text" class="highlight-term-text" value="${term}" />
      <div class="highlight-term-controls">
        <input type="color" data-highlight-term-color class="color-swatch-color" value="${rgbaToHex(color)}" />
        <label class="highlight-term-regex">
          <input type="checkbox" ${isRegex ? 'checked' : ''} />
          Regex
        </label>
      </div>
      <button class="highlight-term-remove">×</button>
    `;

    // Add event listeners
    const textInput = item.querySelector(".highlight-term-text");
    const colorInput = item.querySelector("[data-highlight-term-color]");
    const regexCheckbox = item.querySelector(".highlight-term-regex input");
    const removeBtn = item.querySelector(".highlight-term-remove");

    const updateTerm = () => {
      const newTerm = textInput.value.trim();
      const newColor = colorInput.value;
      const newIsRegex = regexCheckbox.checked;
      if (newTerm) {
        updateHighlightTerm(term, newTerm, hexToRgba(newColor), newIsRegex);
        term = newTerm; // Update the current term reference
      }
    };

    textInput.addEventListener("change", updateTerm);
    colorInput.addEventListener("change", updateTerm);
    regexCheckbox.addEventListener("change", updateTerm);

    removeBtn.addEventListener("click", () => {
      removeHighlightTerm(term);
      item.remove();
    });

    return item;
  }

  // ------------------------------------------------------------
  // Show export modal
  // ------------------------------------------------------------
  function showExportModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 15px 0; color: var(--token-font-default, #333333);">Export Highlight Rules</h3>
        <p style="margin: 0 0 15px 0; color: var(--token-font-default, #666666); font-size: 14px;">Copy the JSON below to backup or share your text highlighting rules:</p>
        <textarea id="export-json" readonly style="width: 100%; height: 200px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="copy-export-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy to Clipboard</button>
          <button id="close-export-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Get current highlight terms
    chrome.storage.sync.get(['highlightTerms'], (result) => {
      const highlightTerms = result.highlightTerms || {};
      const exportTextarea = modal.querySelector('#export-json');
      exportTextarea.value = JSON.stringify(highlightTerms, null, 2);
    });

    // Copy button
    modal.querySelector('#copy-export-btn').addEventListener('click', async () => {
      const exportTextarea = modal.querySelector('#export-json');
      try {
        await navigator.clipboard.writeText(exportTextarea.value);
        const btn = modal.querySelector('#copy-export-btn');
        btn.textContent = 'Copied!';
        btn.style.background = '#059669';
        setTimeout(() => {
          btn.textContent = 'Copy to Clipboard';
          btn.style.background = '#10b981';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please select and copy manually.');
      }
    });

    // Close button
    modal.querySelector('#close-export-btn').addEventListener('click', () => {
      modal.remove();
    });

    // ESC key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // ------------------------------------------------------------
  // Show import modal
  // ------------------------------------------------------------
  function showImportModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 15px 0; color: var(--token-font-default, #333333);">Import Highlight Rules</h3>
        <p style="margin: 0 0 15px 0; color: var(--token-font-default, #666666); font-size: 14px;">Paste JSON from an exported rules file below. New rules will be added and duplicates will be replaced:</p>
        <textarea id="import-json" placeholder="Paste your JSON here..." style="width: 100%; height: 200px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="import-rules-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Import Rules</button>
          <button id="close-import-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Import button
    modal.querySelector('#import-rules-btn').addEventListener('click', () => {
      const importTextarea = modal.querySelector('#import-json');
      const jsonText = importTextarea.value.trim();

      if (!jsonText) {
        alert('Please paste some JSON to import.');
        return;
      }

      try {
        const importedRules = JSON.parse(jsonText);

        // Validate that it's an object
        if (typeof importedRules !== 'object' || importedRules === null) {
          throw new Error('Invalid format: must be a JSON object');
        }

        // Get current rules and merge
        chrome.storage.sync.get(['highlightTerms'], (result) => {
          const currentRules = result.highlightTerms || {};

          // Merge imported rules (imported rules override duplicates)
          const mergedRules = { ...currentRules, ...importedRules };

          // Save merged rules
          chrome.storage.sync.set({ highlightTerms: mergedRules }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error saving imported rules:', chrome.runtime.lastError);
              alert('Error saving imported rules.');
              return;
            }

            // Refresh the UI
            loadSettings();

            // Close modal
            modal.remove();

            // Show success message
            alert(`Successfully imported ${Object.keys(importedRules).length} highlight rules!`);
          });
        });

      } catch (err) {
        console.error('Error parsing JSON:', err);
        alert('Invalid JSON format. Please check your input and try again.');
      }
    });

    // Cancel button
    modal.querySelector('#close-import-btn').addEventListener('click', () => {
      modal.remove();
    });

    // ESC key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // Add a new term
  function addNewTerm() {
    const textInput = document.getElementById("new-term-text");
    const colorInput = document.getElementById("new-term-color");

    if (!textInput || !colorInput) return;

    const newTerm = textInput.value.trim();
    const newColor = hexToRgba(colorInput.value);
    const newIsRegex = false; // Default to false for new terms

    if (newTerm) {
      // Get current terms and add the new one
      chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
        const updatedTerms = { ...settings.highlightTerms };
        updatedTerms[newTerm] = { color: newColor, isRegex: newIsRegex };

        chrome.storage.sync.set({ highlightTerms: updatedTerms }, () => {
          // Add to UI
          const container = document.getElementById("highlight-terms-list");
          const termItem = createTermItem(newTerm, { color: newColor, isRegex: newIsRegex });
          container.appendChild(termItem);

          // Clear inputs
          textInput.value = "";
        });
      });
    }
  }

  // Update an existing term
  function updateHighlightTerm(oldTerm, newTerm, newColor, newIsRegex) {
    chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
      const updatedTerms = { ...settings.highlightTerms };

      // Remove old term if key changed
      if (oldTerm !== newTerm) {
        delete updatedTerms[oldTerm];
      }

      // Handle both old format (string) and new format (object)
      const existingTermData = updatedTerms[newTerm];
      if (typeof existingTermData === 'string') {
        // Convert old format to new format
        updatedTerms[newTerm] = { color: existingTermData, isRegex: false };
      }

      // Update with new data
      updatedTerms[newTerm] = { color: newColor, isRegex: newIsRegex };
      chrome.storage.sync.set({ highlightTerms: updatedTerms });
    });
  }

  // Remove a term
  function removeHighlightTerm(term) {
    chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
      const updatedTerms = { ...settings.highlightTerms };
      delete updatedTerms[term];
      chrome.storage.sync.set({ highlightTerms: updatedTerms });
    });
  }

  // Convert RGBA to hex color
  function rgbaToHex(rgba) {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (!match) return "#ffff00"; // Default yellow

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);

    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Convert hex to RGBA (keeping alpha at 0.4 for consistency)
  function hexToRgba(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "rgba(255, 255, 0, 0.40)"; // Default yellow

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

    return `rgba(${r}, ${g}, ${b}, 0.40)`;
  }

  // Load color swatches into the UI
  function loadColorSwatches(swatches) {
    const container = document.getElementById("color-swatches-list");
    if (!container) return;

    container.innerHTML = "";

    // Count how many colors are set (non-empty)
    const setColors = swatches.filter(color => color && color.trim() !== "");

    // Show all set colors
    swatches.forEach((color, index) => {
      if (color && color.trim() !== "") {
        const swatchItem = createColorSwatchItem(index + 1, color);
        container.appendChild(swatchItem);
      }
    });

    // Add one blank option if we haven't reached 8 total colors
    if (setColors.length < 8) {
      // Find the next available slot (first empty one)
      const nextIndex = swatches.findIndex(color => !color || color.trim() === "");
      const displayNumber = nextIndex >= 0 ? nextIndex + 1 : setColors.length + 1;
      const blankItem = createColorSwatchItem(displayNumber, "");
      container.appendChild(blankItem);
    }
  }

  // Create a color swatch item
  function createColorSwatchItem(number, color) {
    const item = document.createElement("div");
    item.className = "color-swatch-item";

    item.innerHTML = `
      <div class="color-swatch-number">Color ${number}:</div>
      <input type="text" class="color-swatch-input" value="${color}" placeholder="Enter hex color (e.g. #FF0000)" />
      <input type="color" data-color-swatch-color class="color-swatch-color" value="${color || '#ffffff'}" />
      <button class="color-swatch-clear">×</button>
    `;

    // Add event listeners
    const textInput = item.querySelector(".color-swatch-input");
    const colorInput = item.querySelector("[data-color-swatch-color]");
    const clearBtn = item.querySelector(".color-swatch-clear");

    const readColor = () => {
      let v = textInput.value.trim().toUpperCase();
      if (/^[0-9A-F]{6}$/.test(v)) v = `#${v}`;
      return v;
    };

    const syncColorPickerFromText = () => {
      const newColor = readColor();
      if (!newColor) {
        colorInput.value = "#ffffff";
        return;
      }
      // Only push valid hex values into the native color input.
      if (/^#([0-9A-F]{6})$/.test(newColor)) {
        colorInput.value = newColor;
      }
    };

    const commitSwatch = (delayMs = 250) => {
      const newColor = readColor();
      if (newColor && !/^#([0-9A-F]{6})$/.test(newColor)) return;
      syncColorPickerFromText();
      updateColorSwatch(number - 1, newColor, { delayMs, reload: true });
    };

    textInput.addEventListener("input", () => {
      syncColorPickerFromText();
      // Persist after typing pauses; avoids per-keystroke sync writes.
      commitSwatch(350);
    });
    textInput.addEventListener("change", () => commitSwatch(0));
    textInput.addEventListener("blur", () => commitSwatch(0));

    colorInput.addEventListener("input", () => {
      textInput.value = colorInput.value.toUpperCase();
    });
    colorInput.addEventListener("change", () => {
      textInput.value = colorInput.value.toUpperCase();
      commitSwatch(0);
    });

    clearBtn.addEventListener("click", () => {
      textInput.value = "";
      colorInput.value = "#ffffff";
      updateColorSwatch(number - 1, "", { delayMs: 0, reload: true });
    });

    return item;
  }

  function flushPendingColorSwatchUpdates() {
    const pendingEntries = Array.from(_gemColorSwatchPendingWrites.entries());
    _gemColorSwatchPendingWrites.clear();
    _gemColorSwatchFlushTimer = null;
    const shouldReload = _gemColorSwatchReloadAfterFlush;
    _gemColorSwatchReloadAfterFlush = false;
    if (pendingEntries.length === 0) return;

    chrome.storage.sync.get({ colorSwatches: window.DEFAULT_COLOR_SWATCHES }, (settings) => {
      const current = Array.isArray(settings.colorSwatches)
        ? [...settings.colorSwatches]
        : [...window.DEFAULT_COLOR_SWATCHES];

      pendingEntries.forEach(([index, color]) => {
        if (index < 0) return;
        if (index >= current.length) return;
        current[index] = color;
      });

      chrome.storage.sync.set({ colorSwatches: current }, () => {
        if (shouldReload) {
          loadColorSwatches(current);
        }
      });
    });
  }

  function queueColorSwatchUpdate(index, color, { delayMs = 250, reload = true } = {}) {
    _gemColorSwatchPendingWrites.set(index, color);
    if (reload) _gemColorSwatchReloadAfterFlush = true;
    if (_gemColorSwatchFlushTimer) {
      clearTimeout(_gemColorSwatchFlushTimer);
      _gemColorSwatchFlushTimer = null;
    }
    if (delayMs <= 0) {
      flushPendingColorSwatchUpdates();
      return;
    }
    _gemColorSwatchFlushTimer = setTimeout(flushPendingColorSwatchUpdates, delayMs);
  }

  // Update a color swatch
  function updateColorSwatch(index, color, options = {}) {
    const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 250;
    const reload = options.reload !== false;
    queueColorSwatchUpdate(index, color, { delayMs, reload });
  }

  // ------------------------------------------------------------
  // Panel open/close logic
  // ------------------------------------------------------------
  function openPanel() {
    console.log("[gem] openPanel called, isOpen was:", isOpen);
    createPanel();
    loadSettings();
    attachListeners();

    // Check if this is the first time settings panel is opened
    chrome.storage.sync.get(['settingsPanelOpened'], (result) => {
      const hasBeenOpened = result.settingsPanelOpened;

      if (!hasBeenOpened) {
        // First time opening - hide welcome link
        const welcomeLink = panelEl.querySelector(".gem-welcome-link");
        if (welcomeLink) {
          welcomeLink.style.display = "none";
        }

        // Mark as opened
        chrome.storage.sync.set({ settingsPanelOpened: true });
        console.log("[gem] First time opening settings panel - welcome link hidden");
      } else {
        // Subsequent opens - ensure welcome link is visible
        const welcomeLink = panelEl.querySelector(".gem-welcome-link");
        if (welcomeLink) {
          welcomeLink.style.display = "";
        }
        console.log("[gem] Settings panel opened before - welcome link visible");
      }
    });

    requestAnimationFrame(() => {
      panelEl.style.right = "0";
      isOpen = true;
      console.log("[gem] Panel opened, isOpen now:", isOpen);
    });
  }

  function closePanel() {
    console.log("[gem] closePanel called, isOpen was:", isOpen);
    if (!panelEl) return;
    panelEl.style.right = "-500px";
    isOpen = false;
    console.log("[gem] Panel closed, isOpen now:", isOpen);
  }

  // ------------------------------------------------------------
  // Expose function to open settings panel (for welcome modal)
  // ------------------------------------------------------------
  window.openGemmaSettings = function () {
    if (!isOpen) {
      openPanel();
    }
  };

  // ------------------------------------------------------------
  // Keyboard shortcut: ⌘+G / Ctrl+G opens the settings panel
  // ------------------------------------------------------------
  function setupOpenSettingsPanelShortcut() {
    function handleKeyDown(e) {
      // ⌘+G (macOS) / Ctrl+G (Win/Linux)
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if ((e.key || '').toLowerCase() !== 'g') return;

      // Don't trigger while typing
      const ae = e && e.target && e.target.ownerDocument
        ? e.target.ownerDocument.activeElement
        : document.activeElement;
      if (ae) {
        const tag = (ae.tagName || '').toLowerCase();
        const isTypingTarget =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select';
        if (isTypingTarget) return;
      }

      // Toggle the panel
      if (isOpen) {
        closePanel();
      } else {
        openPanel();
      }

      // Prevent browser default (and any editor bindings)
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation && e.stopImmediatePropagation();
      return false;
    }

    // Main document
    document.addEventListener('keydown', handleKeyDown, true);

    // Also attach into iframes so the shortcut works when focus is inside them
    function injectIntoIframe(iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) return;
        if (iframeDoc._gemSettingsShortcutHandler) return;
        iframeDoc.addEventListener('keydown', handleKeyDown, true);
        iframeDoc._gemSettingsShortcutHandler = true;
      } catch (_) {
        // Cross-origin iframe; ignore
      }
    }

    function waitForIframeReady(iframe) {
      try {
        // If we can access the iframe document at all, attach immediately.
        if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
          injectIntoIframe(iframe);
          return;
        }

        // Otherwise wait for load
        {
          iframe.addEventListener('load', () => setTimeout(() => injectIntoIframe(iframe), 50));
          // Also retry briefly in case load doesn't fire (SPA behaviors)
          let attempts = 0;
          const tick = () => {
            attempts++;
            try {
              if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
                injectIntoIframe(iframe);
                return;
              }
            } catch (_) { }
            if (attempts < 40) setTimeout(tick, 100);
          };
          setTimeout(tick, 100);
        }
      } catch (_) { }
    }

    // Existing iframes
    document.querySelectorAll('iframe').forEach(waitForIframeReady);

    // New iframes
    const iframeObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === 'IFRAME') {
            waitForIframeReady(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('iframe').forEach(waitForIframeReady);
          }
        });
      });
    });
    // body may not exist at document_start; observe documentElement to be safe
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  setupOpenSettingsPanelShortcut();

  // ------------------------------------------------------------
  // Keep dark theme in sync with storage changes
  // ------------------------------------------------------------
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    if (changes[GEM_THEME_MODE_STORAGE_KEY]) {
      const themeSelect = document.getElementById("opt-theme-mode");
      const newMode = normalizeGemThemeMode(changes[GEM_THEME_MODE_STORAGE_KEY].newValue);
      if (themeSelect) themeSelect.value = newMode;
      applyGemThemeMode(newMode, { persistLocal: true });
    }

    if (changes.blocksPanelLayout) {
      const layoutSelect = document.getElementById("opt-blocks-panel-layout");
      if (layoutSelect) {
        layoutSelect.value = changes.blocksPanelLayout.newValue;
      }
    }

    // Content Block Toolbar settings
    if (changes.manageOptionalContent) {
      const select = document.getElementById("opt-manage-optional-content");
      if (select) select.value = changes.manageOptionalContent.newValue;
    }
    if (changes.predictRecommendationSettings) {
      const select = document.getElementById("opt-predict-recommendation");
      if (select) select.value = changes.predictRecommendationSettings.newValue;
    }
    if (changes.productFinder) {
      const select = document.getElementById("opt-product-finder");
      if (select) select.value = changes.productFinder.newValue;
    }
    if (changes.productSource) {
      const select = document.getElementById("opt-product-source");
      if (select) select.value = changes.productSource.newValue;
    }
    if (changes.saveToReuse) {
      const select = document.getElementById("opt-save-to-reuse");
      if (select) select.value = changes.saveToReuse.newValue;
    }
    if (changes.resetBlock) {
      const select = document.getElementById("opt-reset-block");
      if (select) select.value = changes.resetBlock.newValue;
    }

    if (changes.convertEslToTokens) {
      const select = document.getElementById("opt-convert-esl-to-tokens");
      if (select) select.value = changes.convertEslToTokens.newValue;
    }
    if (changes.swapKeywords) {
      const select = document.getElementById("opt-swap-keywords");
      if (select) select.value = changes.swapKeywords.newValue;
    }

    // Paste behavior settings (just keep UI in sync; loader reacts via its own onChanged)
    if (changes[GEM_CUSTOM_PASTE_ENABLED_KEY]) {
      const el = document.getElementById("opt-custom-paste-enabled");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ENABLED_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY]) {
      const el = document.getElementById("opt-custom-paste-bold");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY]) {
      const el = document.getElementById("opt-custom-paste-italic");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY]) {
      const el = document.getElementById("opt-custom-paste-strike");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY]) {
      const el = document.getElementById("opt-custom-paste-underline");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_SUP_KEY]) {
      const el = document.getElementById("opt-custom-paste-sup");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_SUP_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY]) {
      const el = document.getElementById("opt-custom-paste-anchor");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY].newValue !== false;
    }

    if (changes.mobilePreviewWidth) {
      const widthInput = document.getElementById("opt-mobile-preview-width");
      if (widthInput) {
        widthInput.value = changes.mobilePreviewWidth.newValue;
      }
    }

    if (changes.mobilePreviewScale) {
      const scaleSelect = document.getElementById("opt-mobile-preview-scale");
      if (scaleSelect) {
        scaleSelect.value = String(changes.mobilePreviewScale.newValue);
      }
    }

    if (changes.mobileViewVisible) {
      const mobileToggle = document.getElementById("opt-enable-mobile-preview");
      if (mobileToggle) {
        mobileToggle.checked = changes.mobileViewVisible.newValue;
      }
    }
  });

  // ------------------------------------------------------------
  // Listen for messages from background script or gear icon
  // ------------------------------------------------------------
  console.log("[gem] settings-panel.js: setting up message listener");
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[gem] settings-panel.js: RECEIVED MESSAGE:", msg, "from:", sender);
    console.log("[gem] Current isOpen state:", isOpen);

    if (msg.action === "openSettings") {
      // Toggle the panel: close if open, open if closed (from gear icon)
      console.log("[gem] Processing openSettings toggle from gear icon");
      if (isOpen) {
        console.log("[gem] Panel is open, closing it");
        closePanel();
      } else {
        console.log("[gem] Panel is closed, opening it");
        openPanel();
      }
    } else if (msg.action === "toggleSettingsPanel") {
      // Toggle the panel: close if open, open if closed (from extension icon click)
      console.log("[gem] Processing toggleSettingsPanel from extension icon");
      if (isOpen) {
        console.log("[gem] Panel is open, closing it");
        closePanel();
      } else {
        console.log("[gem] Panel is closed, opening it");
        openPanel();
      }
      sendResponse({ success: true });
    }
  });

  function showKeyboardShortcutsModal() {
    // Remove any existing modal
    const existing = document.getElementById('gem-keyboard-shortcuts-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gem-keyboard-shortcuts-modal';
    modal.className = 'gem-welcome-modal';
    modal.innerHTML = `
    <div class="gem-welcome-modal__panel" role="dialog" aria-modal="true">
      <div class="gem-welcome-modal__header">
        <div style="font-weight:600;">Gemma Keyboard Shortcuts</div>
        <button class="e-btn e-btn-borderless e-btn-onlyicon gem-welcome-modal__close" type="button" aria-label="Close">
          ✕
        </button>
      </div>
      <div class="gem-welcome-modal__body gem-scrollable" style="max-height: 60vh; overflow-y: auto;">
        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">General Shortcuts</h3>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+G</kbd>
            <span>Open/Close Gemma Settings Panel</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+SHIFT+F</kbd>
            <span>Toggle Expanded View Mode</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+S</kbd>
            <span>Save the current email</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+/</kbd>
            <span>Toggle the mobile email preview pane on and off</span>
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">Image Properties Dialog</h3>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Enter</kbd>
            <span>Accept changes (clicks the OK button)</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+D</kbd>
            <span>Toggle between Desktop and Mobile tabs</span>
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">Block Editing</h3>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+SHIFT+V</kbd>
            <span>Paste plain text from the clipboard (without Rich Paste formatting)</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Double-click</kbd>
            <span>on an editable image to open the Image Properties dialog</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Double-click</kbd>
            <span>on an ESL token to open the ESL snippet dialog</span>
          </div>
        </div>

      </div>
      <div class="gem-welcome-modal__footer">
        <button class="e-btn e-btn-primary gem-keyboard-shortcuts-close" type="button">Close</button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    // Event handlers
    const closeModal = () => modal.remove();

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('gem-welcome-modal__close') || e.target.classList.contains('gem-keyboard-shortcuts-close')) {
        closeModal();
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

})();
