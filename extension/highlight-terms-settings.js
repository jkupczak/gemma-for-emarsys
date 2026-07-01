(function () {

  function rgbaToHex(rgba) {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (!match) return "#ffff00";

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);

    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function hexToRgba(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "rgba(255, 255, 0, 0.40)";

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

    return `rgba(${r}, ${g}, ${b}, 0.40)`;
  }

  function normalizeHighlightTermData(termData) {
    if (typeof termData === 'string') {
      return {
        color: termData,
        isRegex: false,
        mode: 'highlight'
      };
    }
    const data = termData && typeof termData === 'object' ? termData : {};
    return {
      color: typeof data.color === 'string' ? data.color : 'rgba(255, 255, 0, 0.40)',
      isRegex: !!data.isRegex,
      mode: data.mode === 'notify' ? 'notify' : 'highlight'
    };
  }

  function updateHighlightTerm(oldTerm, newTerm, newColor, newIsRegex, newMode) {
    chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
      const updatedTerms = { ...settings.highlightTerms };

      if (oldTerm !== newTerm) {
        delete updatedTerms[oldTerm];
      }

      updatedTerms[newTerm] = {
        color: newColor,
        isRegex: newIsRegex,
        mode: newMode === 'notify' ? 'notify' : 'highlight'
      };
      chrome.storage.sync.set({ highlightTerms: updatedTerms });
    });
  }

  function removeHighlightTerm(term) {
    chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
      const updatedTerms = { ...settings.highlightTerms };
      delete updatedTerms[term];
      chrome.storage.sync.set({ highlightTerms: updatedTerms });
    });
  }

  function createTermItem(term, termData) {
    const normalizedTermData = normalizeHighlightTermData(termData);
    const color = normalizedTermData.color;
    const isRegex = normalizedTermData.isRegex;
    const mode = normalizedTermData.mode;

    const item = document.createElement("div");
    item.className = "highlight-term-item";

    item.innerHTML = `
      <div class="gem-settings-input-wrap">
        <input type="text" class="highlight-term-text" value="${term}" />
        <button type="button" class="gem-settings-regex-toggle ${isRegex ? 'gem-settings-regex-toggle--active' : ''}" title="Use regular expression" aria-pressed="${isRegex ? 'true' : 'false'}">.*</button>
      </div>
      <div class="highlight-term-controls">
        <input type="color" data-highlight-term-color class="color-swatch-color" value="${rgbaToHex(color)}" />
        <select class="gem-highlight-term-mode" title="Choose term behavior">
          <option value="highlight" ${mode === 'highlight' ? 'selected' : ''}>Highlight</option>
          <option value="notify" ${mode === 'notify' ? 'selected' : ''}>Notify</option>
        </select>
      </div>
      <button class="highlight-term-remove">×</button>
    `;

    const textInput = item.querySelector(".highlight-term-text");
    const colorInput = item.querySelector("[data-highlight-term-color]");
    const modeSelect = item.querySelector(".gem-highlight-term-mode");
    const regexBtn = item.querySelector(".gem-settings-regex-toggle");
    const removeBtn = item.querySelector(".highlight-term-remove");

    const updateTerm = () => {
      const newTerm = textInput.value.trim();
      const newColor = colorInput.value;
      const newIsRegex = regexBtn.classList.contains('gem-settings-regex-toggle--active');
      const newMode = modeSelect && modeSelect.value === 'notify' ? 'notify' : 'highlight';
      if (newTerm) {
        updateHighlightTerm(term, newTerm, hexToRgba(newColor), newIsRegex, newMode);
        term = newTerm;
      }
    };

    regexBtn.addEventListener("click", () => {
      const nowActive = !regexBtn.classList.contains('gem-settings-regex-toggle--active');
      regexBtn.classList.toggle('gem-settings-regex-toggle--active', nowActive);
      regexBtn.setAttribute('aria-pressed', String(nowActive));
      updateTerm();
    });

    textInput.addEventListener("change", updateTerm);
    colorInput.addEventListener("change", updateTerm);
    if (modeSelect) modeSelect.addEventListener("change", updateTerm);

    removeBtn.addEventListener("click", () => {
      removeHighlightTerm(term);
      item.remove();
    });

    return item;
  }

  function loadHighlightTerms(terms) {
    const container = document.getElementById("highlight-terms-list");
    if (!container) return;

    container.innerHTML = "";

    Object.entries(terms).forEach(([term, termData]) => {
      const termItem = createTermItem(term, termData);
      container.appendChild(termItem);
    });
  }

  function addNewTerm() {
    const textInput = document.getElementById("new-term-text");
    const colorInput = document.getElementById("new-term-color");
    const regexBtn = document.getElementById("new-term-regex-toggle");
    const modeSelect = document.getElementById("new-term-mode");

    if (!textInput || !colorInput || !regexBtn || !modeSelect) return;

    const newTerm = textInput.value.trim();
    const newColor = hexToRgba(colorInput.value);
    const newIsRegex = regexBtn.classList.contains('gem-settings-regex-toggle--active');
    const newMode = modeSelect.value === 'notify' ? 'notify' : 'highlight';

    if (newTerm) {
      chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
        const updatedTerms = { ...settings.highlightTerms };
        updatedTerms[newTerm] = { color: newColor, isRegex: newIsRegex, mode: newMode };

        chrome.storage.sync.set({ highlightTerms: updatedTerms }, () => {
          const container = document.getElementById("highlight-terms-list");
          const termItem = createTermItem(newTerm, { color: newColor, isRegex: newIsRegex, mode: newMode });
          container.appendChild(termItem);

          textInput.value = "";
          regexBtn.classList.remove('gem-settings-regex-toggle--active');
          regexBtn.setAttribute('aria-pressed', 'false');
        });
      });
    }
  }

  function bindNewTermControls() {
    const regexBtn = document.getElementById("new-term-regex-toggle");
    if (!regexBtn || regexBtn.dataset.gemBound === 'true') return;
    regexBtn.dataset.gemBound = 'true';
    regexBtn.addEventListener("click", () => {
      const nowActive = !regexBtn.classList.contains('gem-settings-regex-toggle--active');
      regexBtn.classList.toggle('gem-settings-regex-toggle--active', nowActive);
      regexBtn.setAttribute('aria-pressed', String(nowActive));
    });
  }

  window.GemHighlightTerms = {
    load: loadHighlightTerms,
    addNew: addNewTerm,
    bindNewTermControls,
  };

})();
