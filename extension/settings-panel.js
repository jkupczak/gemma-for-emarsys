console.log("[gem] settings-panel.js LOADED in frame:", window.location.href);

// ------------------------------------------------------------
// Theme mode (Gemma vs Original) - applied as early as possible
// ------------------------------------------------------------
const GEM_THEME_MODE_STORAGE_KEY = "gemThemeMode";
const GEM_THEME_MODE_LOCAL_KEY = "gemThemeMode";

function normalizeGemThemeMode(value) {
  return value === "original" ? "original" : "gemma";
}

function applyGemThemeMode(mode, { persistLocal = false } = {}) {
  const normalized = normalizeGemThemeMode(mode);
  const html = document.documentElement;
  if (!html) return;

  if (normalized === "original") {
    html.classList.add("gem--retheme-inactive");
  } else {
    html.classList.remove("gem--retheme-inactive");
  }

  if (persistLocal) {
    try {
      localStorage.setItem(GEM_THEME_MODE_LOCAL_KEY, normalized);
    } catch (e) {
      // ignore
    }
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
  "((\$|£|€)( |\\xA0)?(\d|X)+|(\d|X)+( |\\xA0)?€)": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
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
        background: #ffffff;
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
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 8px 0 0 0;
      }

      #gem-settings-body {
        padding: 24px;
        overflow-y: auto;
        flex-grow: 1;
        background: var(--token-background-faint);
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

      .gem-setting:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-color: #667eea;
      }

      .gem-setting label {
        display: flex;
        align-items: center;
        margin-bottom: 0;
        font-weight: 600;
        font-size: 14px;
        color: var(--token-font-default);
        cursor: pointer;
      }

      .gem-setting input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin-right: 12px;
        cursor: pointer;
        accent-color: var(--gemma-primary-default);
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
        margin-top: 24px;
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
        padding: 20px;
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

      .gem-add-term button {
        padding: 10px 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

        <div class="gem-setting gem-welcome-link" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; cursor: pointer; border: none;">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">🎉 See what's new in Gemma!</div>
          <div style="font-size: 14px; opacity: 0.9;">Click here to view all features and updates</div>
        </div>

        <div class="gem-setting-section">
          <h3>Theme</h3>
          <div class="gem-setting">
            <div style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-theme-mode" style="flex: 1;">Theme</label>
              <select id="opt-theme-mode" style="width: 220px;">
                <option value="gemma" selected>Gemma Theme</option>
                <option value="original">Original Emarsys Theme</option>
              </select>
            </div>
            <div style="font-size: 14px; color: var(--token-font-default); margin-top: 8px;">
              Switch between the Gemma color scheme and the original Emarsys UI.
            </div>
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
            <div style="font-size: 14px; color: var(--token-font-default); margin-top: 8px;">Choose how many blocks to display per row in the blocks panel.</div>
          </div>

          <div class="gem-setting">
            <button id="unhide-all-blocks-btn" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;">
              Unhide All Blocks
            </button>
            <div style="font-size: 14px; color: var(--token-font-default); margin-top: 8px;">Permanently unhide all blocks that have been hidden. This action cannot be undone.</div>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Content Block Toolbar</h3>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-manage-optional-content" style="flex: 1;">Manage optional content</label>
            <select id="opt-manage-optional-content" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-predict-recommendation" style="flex: 1;">Predict Recommendation Settings</label>
            <select id="opt-predict-recommendation" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-product-finder" style="flex: 1;">Product Finder</label>
            <select id="opt-product-finder" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-product-source" style="flex: 1;">Product Source</label>
            <select id="opt-product-source" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-save-to-reuse" style="flex: 1;">Save to reuse</label>
            <select id="opt-save-to-reuse" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-reset-block" style="flex: 1;">Reset block</label>
            <select id="opt-reset-block" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-convert-esl-to-tokens" style="flex: 1;">Convert ESL to Tokens</label>
            <select id="opt-convert-esl-to-tokens" style="width: 150px;">
              <option value="always-show" selected>Show if Available</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-swap-keywords" style="flex: 1;">Swap Keywords</label>
            <select id="opt-swap-keywords" style="width: 150px;">
              <option value="always-show" selected>Show if Available</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Mobile Preview Frame</h3>
          <div class="gem-setting">
            <label>
            <input type="checkbox" id="opt-enable-mobile-preview" />
            Toggle mobile preview pane
            </label>
          </div>
          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-mobile-preview-width" style="flex: 1;">Width (px)</label>
            <input type="number" id="opt-mobile-preview-width" min="200" max="800" step="1" style="width: 120px;" />
          </div>
          <div class="gem-setting" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-mobile-preview-scale" style="flex: 1;">Scale</label>
            <select id="opt-mobile-preview-scale" style="width: 120px;">
              <option value="1">100%</option>
              <option value="0.5">50%</option>
            </select>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Color Swatch Management</h3>
          <div class="gem-info">
            <small>These colors will appear as the first row in the color picker. Add or remove any color you want (up to 8 total).</small>
          </div>
          <div id="color-swatches-list">
            <!-- Color swatches will be dynamically added here -->
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Toggle Page Elements</h3>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-show-finish-editing-btn" checked />
              Show Finish Editing Button
            </label>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Text Highlighting Configuration</h3>
        <div class="gem-setting">
          <label>
            <input type="checkbox" id="opt-enable-highlighting" />
            Enable text highlighting overlays
          </label>
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
          <h3>Media Picker Settings</h3>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-show-file-icon" checked />
              Show filetype icons in media picker
            </label>
          </div>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-show-created-column" checked />
              Show 'Created' column in media picker
            </label>
          </div>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-show-size-column" checked />
              Show 'Size' column in media picker
            </label>
          </div>
          <div class="gem-setting">
            <label>
              <input type="checkbox" id="opt-show-user-column" checked />
              Show 'User' column in media picker
            </label>
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
        showUserColumn: true
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

        document.getElementById("opt-enable-highlighting").checked =
          settings.enableHighlighting;

        document.getElementById("opt-enable-mobile-preview").checked =
          settings.mobileViewVisible !== undefined
            ? settings.mobileViewVisible
            : settings.enableMobilePreview;

        const widthInput = document.getElementById("opt-mobile-preview-width");
        if (widthInput) widthInput.value = settings.mobilePreviewWidth || 414;

        const scaleSelect = document.getElementById("opt-mobile-preview-scale");
        if (scaleSelect) scaleSelect.value = String(settings.mobilePreviewScale || 0.5);

        document.getElementById("opt-show-finish-editing-btn").checked =
          settings.showFinishEditingBtn;

        // Load MediaDB settings
        chrome.storage.sync.get({ gemMediaDBColumnVisibility: {
          showFileIcon: true,
          showCreated: true,
          showSize: true,
          showUser: true
        } }, (mediaDBResult) => {
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
    // Define handler functions
    function saveSettingsHandler() {
      const widthVal = parseInt(document.getElementById("opt-mobile-preview-width")?.value, 10);
      const safeWidth = Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 414;

      const scaleVal = parseFloat(document.getElementById("opt-mobile-preview-scale")?.value);
      const safeScale = scaleVal === 1 ? 1 : 0.5;

      const mobileVisible =
        document.getElementById("opt-enable-mobile-preview")?.checked ?? true;

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
        enableHighlighting:
          document.getElementById("opt-enable-highlighting")?.checked ?? true,
        enableMobilePreview: mobileVisible,
        mobileViewVisible: mobileVisible,
        showFinishEditingBtn:
          document.getElementById("opt-show-finish-editing-btn")?.checked ?? true,
        mobilePreviewWidth: safeWidth,
        mobilePreviewScale: safeScale
      };

      // Apply immediately + cache synchronously for next page load
      applyGemThemeMode(settingsToSave[GEM_THEME_MODE_STORAGE_KEY], { persistLocal: true });

      chrome.storage.sync.set(settingsToSave);

      // Save MediaDB settings separately
      const mediaDBSettings = {
        showFileIcon: document.getElementById("opt-show-file-icon")?.checked ?? true,
        showCreated: document.getElementById("opt-show-created-column")?.checked ?? true,
        showSize: document.getElementById("opt-show-size-column")?.checked ?? true,
        showUser: document.getElementById("opt-show-user-column")?.checked ?? true
      };
      chrome.storage.sync.set({ gemMediaDBColumnVisibility: mediaDBSettings });
    }

    function exportHandler() {
      showExportModal();
    }

    function importHandler() {
      showImportModal();
    }

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
      "opt-enable-mobile-preview",
      "opt-show-finish-editing-btn",
      "opt-mobile-preview-width",
      "opt-mobile-preview-scale",
      "opt-show-file-icon",
      "opt-show-created-column",
      "opt-show-size-column",
      "opt-show-user-column"
    ];

    // Remove existing listeners and add new ones
    settingsIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.removeEventListener("change", saveSettingsHandler);
        el.addEventListener("change", saveSettingsHandler);
      }
    });

    // Add term button listener
    const addBtn = document.getElementById("add-term-btn");
    if (addBtn) {
      addBtn.addEventListener("click", addNewTerm);
    }

    // Export highlight rules button listener - remove existing first
    const exportBtn = document.getElementById("export-highlight-btn");
    if (exportBtn) {
      exportBtn.removeEventListener("click", exportHandler);
      exportBtn.addEventListener("click", exportHandler);
    }

    // Import highlight rules button listener - remove existing first
    const importBtn = document.getElementById("import-highlight-btn");
    if (importBtn) {
      importBtn.removeEventListener("click", importHandler);
      importBtn.addEventListener("click", importHandler);
    }

    // Unhide all blocks button listener
    const unhideBtn = document.getElementById("unhide-all-blocks-btn");
    if (unhideBtn) {
      unhideBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to unhide all blocks? This will permanently show all blocks that were previously hidden.")) {
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
      });
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

    const updateSwatch = () => {
      const newColor = textInput.value.trim().toUpperCase();
      colorInput.value = newColor || '#ffffff';
      updateColorSwatch(number - 1, newColor);
    };

    // For blank items, also trigger update when user starts typing
    if (!color) {
      textInput.addEventListener("input", () => {
        if (textInput.value.trim()) {
          updateSwatch();
        }
      });
    }

    textInput.addEventListener("input", updateSwatch);
    colorInput.addEventListener("input", () => {
      textInput.value = colorInput.value.toUpperCase();
      updateSwatch();
    });

    clearBtn.addEventListener("click", () => {
      textInput.value = "";
      colorInput.value = "#ffffff";
      updateColorSwatch(number - 1, "");
    });

    return item;
  }

  // Update a color swatch
  function updateColorSwatch(index, color) {
    chrome.storage.sync.get({ colorSwatches: window.DEFAULT_COLOR_SWATCHES }, (settings) => {
      const updatedSwatches = [...settings.colorSwatches];
      updatedSwatches[index] = color;
      chrome.storage.sync.set({ colorSwatches: updatedSwatches }, () => {
        // Reload the color swatches to update the UI
        loadColorSwatches(updatedSwatches);
      });
    });
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
  window.openGemmaSettings = function() {
    if (!isOpen) {
      openPanel();
    }
  };

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
      sendResponse({success: true});
    }
  });

})();
