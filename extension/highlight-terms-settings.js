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

  function updateHighlightTerm(oldTerm, newTerm, newColor, newIsRegex) {
    chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
      const updatedTerms = { ...settings.highlightTerms };

      if (oldTerm !== newTerm) {
        delete updatedTerms[oldTerm];
      }

      const existingTermData = updatedTerms[newTerm];
      if (typeof existingTermData === 'string') {
        updatedTerms[newTerm] = { color: existingTermData, isRegex: false };
      }

      updatedTerms[newTerm] = { color: newColor, isRegex: newIsRegex };
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
    const color = typeof termData === 'string' ? termData : termData.color;
    const isRegex = typeof termData === 'object' ? termData.isRegex : false;

    const item = document.createElement("div");
    item.className = "highlight-term-item";

    item.innerHTML = `
      <div class="gem-settings-input-wrap">
        <input type="text" class="highlight-term-text" value="${term}" />
        <button type="button" class="gem-settings-regex-toggle ${isRegex ? 'gem-settings-regex-toggle--active' : ''}" title="Use regular expression" aria-pressed="${isRegex ? 'true' : 'false'}">.*</button>
      </div>
      <div class="highlight-term-controls">
        <input type="color" data-highlight-term-color class="color-swatch-color" value="${rgbaToHex(color)}" />
      </div>
      <button class="highlight-term-remove">×</button>
    `;

    const textInput = item.querySelector(".highlight-term-text");
    const colorInput = item.querySelector("[data-highlight-term-color]");
    const regexBtn = item.querySelector(".gem-settings-regex-toggle");
    const removeBtn = item.querySelector(".highlight-term-remove");

    const updateTerm = () => {
      const newTerm = textInput.value.trim();
      const newColor = colorInput.value;
      const newIsRegex = regexBtn.classList.contains('gem-settings-regex-toggle--active');
      if (newTerm) {
        updateHighlightTerm(term, newTerm, hexToRgba(newColor), newIsRegex);
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

    if (!textInput || !colorInput) return;

    const newTerm = textInput.value.trim();
    const newColor = hexToRgba(colorInput.value);
    const newIsRegex = false;

    if (newTerm) {
      chrome.storage.sync.get({ highlightTerms: {} }, (settings) => {
        const updatedTerms = { ...settings.highlightTerms };
        updatedTerms[newTerm] = { color: newColor, isRegex: newIsRegex };

        chrome.storage.sync.set({ highlightTerms: updatedTerms }, () => {
          const container = document.getElementById("highlight-terms-list");
          const termItem = createTermItem(newTerm, { color: newColor, isRegex: newIsRegex });
          container.appendChild(termItem);

          textInput.value = "";
        });
      });
    }
  }

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

    chrome.storage.sync.get(['highlightTerms'], (result) => {
      const highlightTerms = result.highlightTerms || {};
      const exportTextarea = modal.querySelector('#export-json');
      exportTextarea.value = JSON.stringify(highlightTerms, null, 2);
    });

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

    modal.querySelector('#close-export-btn').addEventListener('click', () => {
      modal.remove();
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

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

    modal.querySelector('#import-rules-btn').addEventListener('click', () => {
      const importTextarea = modal.querySelector('#import-json');
      const jsonText = importTextarea.value.trim();

      if (!jsonText) {
        alert('Please paste some JSON to import.');
        return;
      }

      try {
        const importedRules = JSON.parse(jsonText);

        if (typeof importedRules !== 'object' || importedRules === null) {
          throw new Error('Invalid format: must be a JSON object');
        }

        chrome.storage.sync.get(['highlightTerms'], (result) => {
          const currentRules = result.highlightTerms || {};
          const mergedRules = { ...currentRules, ...importedRules };

          chrome.storage.sync.set({ highlightTerms: mergedRules }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error saving imported rules:', chrome.runtime.lastError);
              alert('Error saving imported rules.');
              return;
            }

            loadHighlightTerms(mergedRules);
            modal.remove();
            alert(`Successfully imported ${Object.keys(importedRules).length} highlight rules!`);
          });
        });

      } catch (err) {
        console.error('Error parsing JSON:', err);
        alert('Invalid JSON format. Please check your input and try again.');
      }
    });

    modal.querySelector('#close-import-btn').addEventListener('click', () => {
      modal.remove();
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  window.GemHighlightTerms = {
    load: loadHighlightTerms,
    addNew: addNewTerm,
    showExportModal: showExportModal,
    showImportModal: showImportModal
  };

})();
