console.log("color-swatch-manager.js loaded");

// Global variables
let customColors = [];
let userColorSwatches = [];
const DEFAULT_CUSTOM_COLOR = "#FE4D01";

// Load custom colors and user color swatches from storage
function loadCustomColors() {
  chrome.storage.sync.get({
    customColors: [DEFAULT_CUSTOM_COLOR], // Start with our default color
    colorSwatches: ["#FE4D01", "", "", "", "", "", "", ""] // 8 user-defined color swatches
  }, (settings) => {
    customColors = settings.customColors;
    userColorSwatches = settings.colorSwatches;
    console.log("[Gem] Loaded custom colors:", customColors);
    console.log("[Gem] Loaded user color swatches:", userColorSwatches);

    // Apply colors to any existing color pickers
    applyCustomColorsToPickers();
  });
}

// Save custom colors to storage
function saveCustomColors() {
  chrome.storage.sync.set({ customColors: customColors }, () => {
    console.log("[Gem] Saved custom colors:", customColors);
  });
}

// Add a color to the custom colors list (if not already present)
function addCustomColor(color) {
  // Convert to uppercase for consistency
  color = color.toUpperCase();

  // Don't add if already exists
  if (customColors.includes(color)) {
    return;
  }

  // Add to the beginning of the array (most recently used first)
  customColors.unshift(color);

  // Limit to 8 custom colors (the number of slots available)
  if (customColors.length > 8) {
    customColors = customColors.slice(0, 8);
  }

  saveCustomColors();
  applyCustomColorsToPickers();
}

// Apply custom colors to all visible color pickers
function applyCustomColorsToPickers() {
  const colorPickers = document.querySelectorAll('.mce-colorbutton-grid');
  console.log("[Gem] Found", colorPickers.length, "color pickers to update");

  colorPickers.forEach(picker => {
    // Use setTimeout to ensure the picker is fully rendered
    setTimeout(() => {
      applyCustomColorsToPicker(picker);
    }, 100);
  });
}

// Apply custom colors to a specific color picker
function applyCustomColorsToPicker(picker) {
  console.log("[Gem] Applying custom colors to picker:", picker);

  // Remove height restriction from the color picker modal
  removeColorPickerHeightRestriction(picker);

  // First, add the user color swatches row at the top
  addUserColorSwatchesRow(picker);

  // Then handle the existing custom colors row at the bottom
  applyBottomCustomColors(picker);
}

// Remove height attribute from color picker modal to allow dynamic sizing
function removeColorPickerHeightRestriction(picker) {
  // Find the color picker modal (the fixed positioned container)
  const modal = picker.closest('.mce-container.mce-panel.mce-floatpanel.mce-popover');
  if (modal) {
    console.log("[Gem] Found color picker modal, removing height restriction");
    modal.style.removeProperty('height');
    // Also remove any max-height if present
    modal.style.removeProperty('max-height');
  }
}

// Add a row of user-selected color swatches at the top
function addUserColorSwatchesRow(picker) {
  const tbody = picker.querySelector('tbody');
  if (!tbody) return;

  // Remove any existing user color swatches row
  const existingUserRow = tbody.querySelector('.gem-user-swatches');
  if (existingUserRow) {
    existingUserRow.remove();
  }

  // Create new row for user swatches
  const userRow = document.createElement('tr');
  userRow.className = 'gem-user-swatches';

  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('td');
    cell.className = 'mce-grid-cell';

    const colorDiv = document.createElement('div');
    const color = userColorSwatches[i];

    if (color && color.trim()) {
      // Set the color
      colorDiv.style.background = color;
      colorDiv.setAttribute('data-mce-color', color);
      colorDiv.setAttribute('title', `User swatch ${i + 1}: ${color}`);
    } else {
      // Empty cell - make it transparent or with a subtle indicator
      colorDiv.style.background = 'transparent';
      colorDiv.style.border = '1px dashed #ccc';
      colorDiv.setAttribute('data-mce-color', '');
      colorDiv.setAttribute('title', 'Empty swatch');
    }

    colorDiv.setAttribute('role', 'option');
    colorDiv.setAttribute('tabindex', '-1');

    cell.appendChild(colorDiv);
    userRow.appendChild(cell);
  }

  // Insert at the beginning of tbody
  if (tbody.firstChild) {
    tbody.insertBefore(userRow, tbody.firstChild);
  } else {
    tbody.appendChild(userRow);
  }

  console.log("[Gem] Added user color swatches row");
}

// Apply colors to the bottom custom row (existing functionality)
function applyBottomCustomColors(picker) {
  // Find all rows in the color picker
  const allRows = picker.querySelectorAll('tr');
  if (allRows.length === 0) {
    console.log("[Gem] No rows found in picker");
    return;
  }

  // Skip our user swatches row and find the actual last row
  const rows = Array.from(allRows).filter(row => !row.classList.contains('gem-user-swatches'));
  const lastRow = rows[rows.length - 1];

  if (!lastRow) {
    console.log("[Gem] No custom row found");
    return;
  }

  console.log("[Gem] Custom row:", lastRow);

  // Get all cells in the last row
  const cellsInLastRow = lastRow.querySelectorAll('td.mce-grid-cell');
  console.log("[Gem] Cells in custom row:", cellsInLastRow.length);

  // Skip the "Custom..." button cell if it exists
  const customCells = Array.from(cellsInLastRow).filter(cell =>
    !cell.classList.contains('mce-custom-color-btn')
  );

  console.log("[Gem] Filtered custom cells:", customCells.length);

  customCells.forEach((cell, index) => {
    const colorDiv = cell.querySelector('div');
    console.log("[Gem] Cell", index, "- element:", cell, "- colorDiv:", colorDiv, "- customColors[index]:", customColors[index]);

    if (colorDiv && customColors[index]) {
      const color = customColors[index];
      console.log("[Gem] Setting color:", color, "on element:", colorDiv);

      // Clear any existing styles first
      colorDiv.style.backgroundColor = '';
      colorDiv.style.background = '';

      // Set the background style to match TinyMCE format
      colorDiv.style.background = color;
      colorDiv.setAttribute('data-mce-color', color);
      colorDiv.setAttribute('title', `Custom color: ${color}`);

      console.log("[Gem] Applied color. Final element:", colorDiv);
    } else if (colorDiv && !customColors[index]) {
      // Clear the cell if we don't have a color for this slot
      console.log("[Gem] Clearing cell", index, "- no color available");
      colorDiv.style.background = '';
      colorDiv.setAttribute('data-mce-color', '');
      colorDiv.setAttribute('title', 'Custom color');
    }
  });
}

// Monitor for color selection events
function monitorColorSelections() {
  // Use event delegation to catch clicks on color swatches
  document.addEventListener('click', (event) => {
    const target = event.target;

    // Check if clicked element is a color swatch
    if (target.hasAttribute('data-mce-color')) {
      const selectedColor = target.getAttribute('data-mce-color');

      // Only track non-empty colors (ignore transparent and empty custom slots)
      if (selectedColor && selectedColor !== 'transparent' && selectedColor.trim() !== '') {
        console.log("[Gem] Color selected:", selectedColor);
        addCustomColor(selectedColor);
      }
    }
  });
}

// Monitor for new color pickers being added to the DOM
function monitorForColorPickers() {
  const observer = new MutationObserver((mutations) => {
    let foundNewPicker = false;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this is a color picker or contains one
          const colorPickers = node.querySelectorAll ?
            node.querySelectorAll('.mce-colorbutton-grid') :
            [];

          if (node.classList && node.classList.contains('mce-colorbutton-grid')) {
            // This element itself is a color picker
            console.log("[Gem] New color picker detected");
            foundNewPicker = true;
            applyCustomColorsToPickerWithDelay(node);
          } else if (colorPickers.length > 0) {
            // This element contains color pickers
            console.log("[Gem] New color pickers detected:", colorPickers.length);
            foundNewPicker = true;
            colorPickers.forEach(picker => applyCustomColorsToPickerWithDelay(picker));
          }
        }
      });
    });

    // If we found new pickers, also check for any existing ones that might need updating
    if (foundNewPicker) {
      setTimeout(() => {
        applyCustomColorsToPickers();
      }, 200);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Apply colors to a picker with multiple attempts (for timing issues)
function applyCustomColorsToPickerWithDelay(picker) {
  console.log("[Gem] Applying colors with delay to picker");

  // Try immediately
  applyCustomColorsToPicker(picker);

  // Try again after a short delay
  setTimeout(() => {
    applyCustomColorsToPicker(picker);
  }, 100);

  // Try once more after a longer delay
  setTimeout(() => {
    applyCustomColorsToPicker(picker);
  }, 500);
}

// Initialize the color swatch manager
function initializeColorSwatchManager() {
  console.log("[Gem] Initializing color swatch manager");

  // Load saved colors
  loadCustomColors();

  // Start monitoring
  monitorColorSelections();
  monitorForColorPickers();

  // Listen for storage changes (in case colors are updated from other tabs)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      if (changes.customColors) {
        customColors = changes.customColors.newValue;
        console.log("[Gem] Custom colors updated from storage:", customColors);
        applyCustomColorsToPickers();
      }
      if (changes.colorSwatches) {
        userColorSwatches = changes.colorSwatches.newValue;
        console.log("[Gem] User color swatches updated from storage:", userColorSwatches);
        applyCustomColorsToPickers();
      }
    }
  });
}

// Force refresh all color pickers (can be called from console for debugging)
window.refreshColorPickers = function() {
  console.log("[Gem] Manual refresh triggered");
  applyCustomColorsToPickers();
};

// Wait for page load before starting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeColorSwatchManager);
} else {
  // Page already loaded
  initializeColorSwatchManager();
}
