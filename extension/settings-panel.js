console.log("[gem] settings-panel.js LOADED in frame:", window.location.href);


// ------------------------------------------------------------
// settings-panel.js
// Slide-out settings panel for your Chrome extension UI
// ------------------------------------------------------------

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
        z-index: 9999999999;
        transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        display: flex;
        flex-direction: column;
        border-radius: 8px 0 0 8px;
      }

      #gem-settings-panel input {
        background: var(--token-input-default-background);
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
        accent-color: #667eea;
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
        margin: 0 20px 20px;
        padding: 12px;
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 6px;
        color: #0369a1;
      }

      .gem-info small {
        font-size: 12px;
        line-height: 1.4;
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
        
        <div class="gem-setting">
          <label>
            <input type="checkbox" id="opt-enable-condensed-blocks" checked />
            Enable Condensed Blocks Panel
          </label>
        </div>

        <div class="gem-setting">
          <label>
            <input type="checkbox" id="opt-enable-highlighting" />
            Enable text highlighting overlays
          </label>
        </div>

        <div class="gem-setting">
          <label>
            <input type="checkbox" id="opt-enable-mobile-preview" />
            Enable mobile preview pane by default
          </label>
        </div>

        <div class="gem-setting-section">
          <h3>Color Swatch Management</h3>
          <div id="color-swatches-list">
            <!-- Color swatches will be dynamically added here -->
          </div>
          <div class="gem-info">
            <small>These colors will appear as the first row in the color picker. Add or remove any color you want (up to 8 total).</small>
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
          <div id="highlight-terms-list">
            <!-- Terms will be dynamically added here -->
          </div>
          <div class="gem-add-term">
            <input type="text" id="new-term-text" placeholder="New term to highlight" />
            <input type="color" id="new-term-color" class="color-swatch-color" value="#ffff00" />
            <button id="add-term-btn">Add</button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(panelEl);

    // Close button
    panelEl.querySelector("#gem-settings-close")
      .addEventListener("click", closePanel);

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
        // First-time user: use defaults
        console.log("[gem] Settings panel: First-time user, using default highlight terms");
        highlightTerms = {
          "(price)": { color: "rgba(245, 46, 132, 0.40)", isRegex: false },
          "\{\{.+?\}\}": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
          "((\$|£)( |\xA0)?\d+|\d+( |\xA0)?€)": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
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
          "(learnlang_locative_po)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
          "(wow)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false }
        };
      } else {
        // Existing user: use their stored terms
        console.log("[gem] Settings panel: Using existing user highlight terms");
        highlightTerms = result.highlightTerms;
      }

      // Now get the other settings
      chrome.storage.sync.get({
        enableHighlighting: true,
        enableMobilePreview: true,
        showFinishEditingBtn: true,
        colorSwatches: ["#FE4D01", "#151515", "", "", "", "", "", ""],
        enableCondensedBlocksPanel: true
      }, (settings) => {
        document.getElementById("opt-enable-condensed-blocks").checked =
          settings.enableCondensedBlocksPanel;
        document.getElementById("opt-enable-highlighting").checked =
          settings.enableHighlighting;

        document.getElementById("opt-enable-mobile-preview").checked =
          settings.enableMobilePreview;

        document.getElementById("opt-show-finish-editing-btn").checked =
          settings.showFinishEditingBtn;

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
    const ids = [
      "opt-enable-condensed-blocks",
      "opt-enable-highlighting",
      "opt-enable-mobile-preview",
      "opt-show-finish-editing-btn"
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener("change", () => {
        const settingsToSave = {
          enableCondensedBlocksPanel:
            document.getElementById("opt-enable-condensed-blocks")?.checked ?? true,
          enableHighlighting:
            document.getElementById("opt-enable-highlighting")?.checked ?? true,
          enableMobilePreview:
            document.getElementById("opt-enable-mobile-preview")?.checked ?? true,
          showFinishEditingBtn:
            document.getElementById("opt-show-finish-editing-btn")?.checked ?? true
        };

        chrome.storage.sync.set(settingsToSave);
      });
    });

    // Add term button listener
    const addBtn = document.getElementById("add-term-btn");
    if (addBtn) {
      addBtn.addEventListener("click", addNewTerm);
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
    chrome.storage.sync.get({ colorSwatches: ["#FE4D01", "", "", "", "", "", "", ""] }, (settings) => {
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
    createPanel();
    loadSettings();
    attachListeners();

    requestAnimationFrame(() => {
      panelEl.style.right = "0";
      isOpen = true;
    });
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.style.right = "-500px";
    isOpen = false;
  }

  // ------------------------------------------------------------
  // Keep dark theme in sync with storage changes
  // ------------------------------------------------------------
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    if (changes.enableCondensedBlocksPanel) {
      const condensedToggle = document.getElementById("opt-enable-condensed-blocks");
      if (condensedToggle) {
        condensedToggle.checked = changes.enableCondensedBlocksPanel.newValue;
      }
    }
  });

  // ------------------------------------------------------------
  // Listen for openSettings command from gear icon
  // ------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg) => {
    console.log("[gem] settings-panel.js: received message:", msg);

    if (msg.action === "openSettings") {
      // Toggle the panel: close if open, open if closed
      if (isOpen) {
        console.log("[gem] Panel is open, closing it");
        closePanel();
      } else {
        console.log("[gem] Panel is closed, opening it");
        openPanel();
      }
    }
  });

})();
