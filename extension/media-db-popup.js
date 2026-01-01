console.log("[Gem] media-db-popup.js loaded");

// MediaDB table column visibility functionality
function initializeMediaDBColumnVisibility() {
  console.log("[Gem] Initializing MediaDB column visibility");

  // Storage keys for column visibility
  const STORAGE_KEY = 'gemMediaDBColumnVisibility';

  // Load settings from storage and apply them
  function loadAndApplySettings() {
    console.log("[Gem] Loading MediaDB settings from storage key:", STORAGE_KEY);
    chrome.storage.sync.get({ [STORAGE_KEY]: {
      showCreated: true,
      showSize: true,
      showUser: true,
      showFileIcon: true
    } }, (result) => {
      console.log("[Gem] MediaDB settings loaded from storage:", result);
      const settings = result[STORAGE_KEY];
      console.log("[Gem] Applying loaded settings:", settings);
      applyColumnVisibility(settings);
    });
  }

  // Apply column visibility using current stored settings
  function applyColumnVisibilityFromStorage() {
    chrome.storage.sync.get({ [STORAGE_KEY]: {
      showCreated: true,
      showSize: true,
      showUser: true,
      showFileIcon: true
    } }, (result) => {
      const settings = result[STORAGE_KEY];
      applyColumnVisibility(settings);
    });
  }

  // Apply column visibility
  function applyColumnVisibility(settings) {
    console.log("[Gem] Applying column visibility:", settings);

    // Find the data table
    const dataTable = document.querySelector('table.e-table.e-table-modal.e-table-condensed');
    console.log("[Gem] Found data table:", dataTable);

    // Find the header table
    const headerTable = document.querySelector('table.e-table.e-table-modal:not(.e-table-condensed)');
    console.log("[Gem] Found header table:", headerTable);

    if (!dataTable) {
      console.log("[Gem] No data table found, skipping column visibility application");
      return;
    }

    // Handle colgroup in data table
    const colgroup = dataTable.querySelector('colgroup');
    if (colgroup) {
      const cols = colgroup.querySelectorAll('col');
      console.log("[Gem] Found", cols.length, "col elements");

      // Column indices in colgroup:
      // 0: File name
      // 1: Created date
      // 2: Size
      // 3: User
      // 4: Actions

      if (cols[1]) { // Created column
        cols[1].style.setProperty('display', settings.showCreated ? '' : 'none', 'important');
        console.log(`[Gem] Setting Created col display to: ${settings.showCreated ? '' : 'none'}`);
      }

      if (cols[2]) { // Size column
        cols[2].style.setProperty('display', settings.showSize ? '' : 'none', 'important');
        console.log(`[Gem] Setting Size col display to: ${settings.showSize ? '' : 'none'}`);
      }

      if (cols[3]) { // User column
        cols[3].style.setProperty('display', settings.showUser ? '' : 'none', 'important');
        console.log(`[Gem] Setting User col display to: ${settings.showUser ? '' : 'none'}`);
      }
    }

    // Handle header table th elements
    if (headerTable) {
      const headerCells = headerTable.querySelectorAll('th');
      console.log("[Gem] Found", headerCells.length, "header cells");

      // Column indices in header:
      // 0: Name
      // 1: Created date
      // 2: Size
      // 3: User
      // 4: Actions

      if (headerCells[1]) { // Created header
        headerCells[1].style.setProperty('display', settings.showCreated ? '' : 'none', 'important');
        console.log(`[Gem] Setting Created header display to: ${settings.showCreated ? '' : 'none'}`);
      }

      if (headerCells[2]) { // Size header
        headerCells[2].style.setProperty('display', settings.showSize ? '' : 'none', 'important');
        console.log(`[Gem] Setting Size header display to: ${settings.showSize ? '' : 'none'}`);
      }

      if (headerCells[3]) { // User header
        headerCells[3].style.setProperty('display', settings.showUser ? '' : 'none', 'important');
        console.log(`[Gem] Setting User header display to: ${settings.showUser ? '' : 'none'}`);
      }
    }

    // Get table rows from data table
    const rows = dataTable.querySelectorAll('tr');
    console.log("[Gem] Found", rows.length, "data table rows");

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td');
      console.log(`[Gem] Row ${rowIndex} has ${cells.length} cells, class: ${row.className}`);

      // Skip rows that are headers or special rows (colspan rows, loading rows, etc.)
      // Only process actual file data rows
      if (!row.classList.contains('file-table-row') || cells.length !== 5) {
        console.log(`[Gem] Skipping row ${rowIndex} - not a file data row`);
        return;
      }

      console.log(`[Gem] Processing file data row ${rowIndex}`);

      // Column indices:
      // 0: File name (with icon) - always visible for file name, but can hide icon
      // 1: Created date
      // 2: Size
      // 3: User
      // 4: Actions - always visible

      // Toggle Created column (index 1)
      if (cells[1]) {
        const newDisplay = settings.showCreated ? '' : 'none !important';
        console.log(`[Gem] Setting Created column (cell 1) display to: ${newDisplay}`);
        cells[1].style.setProperty('display', settings.showCreated ? '' : 'none', 'important');
      }

      // Toggle Size column (index 2)
      if (cells[2]) {
        const newDisplay = settings.showSize ? '' : 'none !important';
        console.log(`[Gem] Setting Size column (cell 2) display to: ${newDisplay}`);
        cells[2].style.setProperty('display', settings.showSize ? '' : 'none', 'important');
      }

      // Toggle User column (index 3)
      if (cells[3]) {
        const newDisplay = settings.showUser ? '' : 'none !important';
        console.log(`[Gem] Setting User column (cell 3) display to: ${newDisplay}`);
        cells[3].style.setProperty('display', settings.showUser ? '' : 'none', 'important');
      }

      // Toggle File Icon (within column 0)
      if (cells[0]) {
        const icons = cells[0].querySelectorAll('e-icon[type="inline"]');
        console.log(`[Gem] Found ${icons.length} file icons in cell 0`);
        if (!settings.showFileIcon) {
          icons.forEach(icon => {
            console.log("[Gem] Hiding file icon");
            icon.style.setProperty('display', 'none', 'important');
          });
        } else {
          icons.forEach(icon => {
            console.log("[Gem] Showing file icon");
            icon.style.setProperty('display', '', 'important');
          });
        }
      }
    });
  }

  // Listen for settings changes from the settings panel
  chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log("[Gem] Storage change detected:", changes, "namespace:", namespace);
    if (namespace === 'sync' && changes[STORAGE_KEY]) {
      console.log("[Gem] MediaDB settings changed, applying new visibility:", changes[STORAGE_KEY].newValue);
      applyColumnVisibility(changes[STORAGE_KEY].newValue);
    } else {
      console.log("[Gem] Storage change ignored - not MediaDB settings");
    }
  });

  // Apply initial settings
  loadAndApplySettings();

  // Watch for file data rows being added to the table
  const tableObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        let hasNewFileRows = false;

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this node is a file data row
            if (node.classList && node.classList.contains('file-table-row')) {
              hasNewFileRows = true;
            }
            // Also check within subtrees for file rows
            else if (node.querySelectorAll) {
              const fileRows = node.querySelectorAll('.file-table-row');
              if (fileRows.length > 0) {
                hasNewFileRows = true;
              }
            }
          }
        });

        if (hasNewFileRows) {
          console.log("[Gem] New file data rows detected, applying column visibility");
          // Small delay to ensure rows are fully rendered
          setTimeout(() => applyColumnVisibilityFromStorage(), 100);
        }
      }
    });
  });

  tableObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log("[Gem] MediaDB column visibility initialized");
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMediaDBColumnVisibility);
} else {
  initializeMediaDBColumnVisibility();
}
