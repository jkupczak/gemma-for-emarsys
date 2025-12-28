console.log("[Gem] snippets-tab.js loaded");

// Snippets storage and management
const SNIPPETS_STORAGE_KEY = 'gemSnippets';

// Default snippets to initialize with
const DEFAULT_SNIPPETS = [
  {
    id: 'sample-esl',
    name: 'ESL snippet',
    content: 'This is a sample snippet!'
  }
];

// Function to get snippets from storage
function getSnippets(callback) {
  chrome.storage.sync.get({ [SNIPPETS_STORAGE_KEY]: DEFAULT_SNIPPETS }, (result) => {
    const snippets = result[SNIPPETS_STORAGE_KEY] || DEFAULT_SNIPPETS;
    // Ensure each snippet has an ID
    const snippetsWithIds = snippets.map((snippet, index) => ({
      ...snippet,
      id: snippet.id || `snippet-${Date.now()}-${index}`
    }));
    callback(snippetsWithIds);
  });
}

// Function to save snippets to storage
function saveSnippets(snippets, callback) {
  chrome.storage.sync.set({ [SNIPPETS_STORAGE_KEY]: snippets }, () => {
    if (callback) callback();
  });
}

// Function to generate the full snippet HTML
function generateSnippetHTML(name, content) {
  const tokenContent = JSON.stringify({ script: content });
  // Custom encoding that preserves ':' characters
  const encodedTokenContent = encodeURIComponent(tokenContent).replace(/%3A/g, ':');
  // Use the exact token-template from the working sample
  const encodedTokenTemplate = '%22%3C%25=%20script%20%25%3E%22';
  // token-meta should be encoded as well
  const encodedTokenMeta = '%7B%7D';

  return `<span e-token="cust_esl" token-template="${encodedTokenTemplate}" token-content="${encodedTokenContent}" token-meta="${encodedTokenMeta}" style="background-color: #6597cf; border-radius: .3em; box-shadow: 0 0 0 0.2em #6597cf; color: #fff;" class="cbNonEditable" contenteditable="false">${name}</span>`;
}

// Function to create the snippet modal HTML
function createSnippetModalHTML(isEditing = false) {
  return `
<div id="gem-snippet-modal" style="position: fixed; top: 0; left: 0; z-index: 614; display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;">
  <div class="e-dialog__container" tabindex="-1" style="width: 100%; max-width: 650px; height: auto; min-height: auto;">
  <header class="e-dialog__header">
    <span class="e-dialog__title">
      ${isEditing ? 'Edit' : 'Add'} Emarsys Scripting Language snippet
    </span>
    <e-tooltip class="e-dialog__close_tooltip" content="Close Dialog">
      <button type="button" id="gem-modal-close-btn" class="e-btn e-btn-borderless e-btn-onlyicon e-dialog__close e-dialog__header_actions">
        <e-icon icon="close" color="inherit">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon text-color-inherit" style="margin: 0;">×</div>
          </div>
        </e-icon>
      </button>
    </e-tooltip>
  </header>
  <div class="e-dialog__content" style="max-width: none;">
    <div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-name-input">Snippet name</label>
        <input class="e-input" id="gem-snippet-name-input" type="text" placeholder="Enter snippet name">
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline">Code snippet</label>
        <textarea class="e-input gem-scrollable" id="gem-snippet-code-input" placeholder="Enter your ESL code snippet" style="background:var(--token-input-default-background); font-family: var(--token-font-monospace, monospace); width: 100%; min-height: 300px; resize: vertical; padding: 10px 12px;"></textarea>
      </div>
    </div>
  </div>
  <div class="e-dialog__footer">
    <div class="e-buttongroup">
      <button class="e-btn" id="gem-modal-cancel-btn" type="button">Cancel</button>
      ${isEditing ? '<button class="e-btn e-btn-danger" id="gem-modal-delete-btn" type="button">Delete</button>' : ''}
      <button class="e-btn e-btn-primary" id="gem-modal-ok-btn" type="button">OK</button>
    </div>
  </div>
</div>
</div>
<div id="gem-modal-backdrop" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 613;"></div>
  `.trim();
}

// Add a Snippets tab to the vertical navigation
function initializeSnippetsTab() {
  console.log("[Gem] Initializing snippets tab");

  // Function to create the snippets tab HTML
  function createSnippetsTabHTML() {
    return `
<cb-vertical-tab id="gem-snippets-tab" value="tooltips.snippets" icon="snippets">
  <e-verticalnav-item class="gem-e-verticalnav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Snippets" role="tooltip" aria-description="Snippets">
      <div class="e-verticalnavitem__icon e-svgclickfix">
        <gem-e-icon icon="gem-snippets">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon">
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--token-icon-default-text)"><path d="M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z"/></svg>
            </div>
          </div>
        </e-icon>
      </div>
      </e-tooltip>

      <div class="e-verticalnavitem__value">Snippets</div>
    </div>
  </e-verticalnav-item>
</cb-vertical-tab>
    `.trim();
  }

  // Function to create the snippets content HTML
  function createSnippetsContentHTML(callback) {
    // Load snippets and generate the HTML
    getSnippets((snippets) => {
      const snippetRows = snippets.map(snippet => {
        const fullSnippetHTML = generateSnippetHTML(snippet.name, snippet.content);
        return `
<tr>
  <td style="vertical-align:middle">
    <div>
      <vce-token name="${snippet.name}" data="${fullSnippetHTML.replace(/"/g, '&quot;')}">
        <span class="e-label e-label-primary" draggable="true" style="cursor: move;">${snippet.name}</span>
      </vce-token>
    </div>
  </td>
  <td style="text-align: right; vertical-align:middle; padding: 8px">
    <button class="e-btn e-btn-sm gem-edit-snippet-btn" type="button" data-snippet-id="${snippet.id}" title="Edit snippet" style="min-width: unset; padding: 0 2px 0 10px;">
      <e-icon icon="edit" color="inherit">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon text-color-inherit" style="margin: 0;">✏️</div>
        </div>
      </e-icon>
    </button>
  </td>
</tr>
        `;
      }).join('');

      const tableHTML = snippets.length > 0 ? `
      <table data-e-version="2" class="e-table e-table-hover e-table-bordered" style="margin-bottom: 15px;">
        <tbody>
          ${snippetRows}
        </tbody>
      </table>` : '';

      const html = `
<div id="gem-available-snippet-list">
  <div class="e-section">
    <div class="e-section__header">
        <div class="e-section__title">Snippets</div>
    </div>
    <div class="e-section__content">
      ${tableHTML}
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <button class="e-btn gem-import-snippets-btn" type="button" style="flex: 1;">
          Import
        </button>
        <button class="e-btn gem-export-snippets-btn" type="button" style="flex: 1;">
          Export
        </button>
      </div>
      <div>
        <button class="e-btn e-btn-primary gem-add-snippet-btn" type="button" style="width: 100%;">
          Add a Snippet
        </button>
      </div>
    </div>
  </div>
</div>
      `.trim();

      callback(html);
    });
  }

  // ------------------------------------------------------------
  // Snippet Import / Export
  // ------------------------------------------------------------

  function parseImportedSnippetsJSON(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      throw new Error('Please paste JSON to import.');
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new Error('Invalid JSON. Please paste a valid JSON string.');
    }

    // Accept either an array, or an object with { snippets: [...] }
    const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.snippets) ? parsed.snippets : null);
    if (!arr) {
      throw new Error('JSON must be an array of snippets, or an object like {"snippets":[...]}');
    }

    return arr;
  }

  function makeUniqueSnippetName(baseName, existingNamesLower) {
    const base = baseName.trim();
    if (!existingNamesLower.has(base.toLowerCase())) return base;

    let i = 1;
    while (existingNamesLower.has(`${base} ${i}`.toLowerCase())) {
      i++;
    }
    return `${base} ${i}`;
  }

  function showSnippetsExportModal() {
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
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 700px; width: 92%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 12px 0; color: var(--token-font-default, #333333);">Export Snippets</h3>
        <p style="margin: 0 0 12px 0; color: var(--token-font-default, #666666); font-size: 14px;">Copy the JSON below to backup or share your snippets:</p>
        <textarea id="gem-snippets-export-json" class="gem-scrollable" readonly style="background:var(--token-input-default-background); width: 100%; height: 260px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="gem-snippets-copy-export-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy</button>
          <button id="gem-snippets-close-export-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    getSnippets((snippets) => {
      const exportTextarea = modal.querySelector('#gem-snippets-export-json');
      // Export only the data users care about (name/content). IDs are regenerated on import.
      const exportPayload = snippets.map(s => ({ name: s.name, content: s.content }));
      exportTextarea.value = JSON.stringify(exportPayload, null, 2);
    });

    const close = () => modal.remove();
    modal.querySelector('#gem-snippets-close-export-btn').addEventListener('click', close);

    modal.querySelector('#gem-snippets-copy-export-btn').addEventListener('click', async () => {
      const exportTextarea = modal.querySelector('#gem-snippets-export-json');
      const btn = modal.querySelector('#gem-snippets-copy-export-btn');
      try {
        await navigator.clipboard.writeText(exportTextarea.value);
        btn.textContent = 'Copied!';
        btn.style.background = '#059669';
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.style.background = '#10b981';
        }, 1500);
      } catch (err) {
        // Fallback: select and copy
        exportTextarea.focus();
        exportTextarea.select();
        try {
          document.execCommand('copy');
          btn.textContent = 'Copied!';
          btn.style.background = '#059669';
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.background = '#10b981';
          }, 1500);
        } catch (e) {
          alert('Failed to copy to clipboard. Please select and copy manually.');
        }
      }
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  function showSnippetsImportModal() {
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
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 700px; width: 92%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 12px 0; color: var(--token-font-default, #333333);">Import Snippets</h3>
        <p style="margin: 0 0 12px 0; color: var(--token-font-default, #666666); font-size: 14px;">Paste exported snippet JSON below. Conflicts are handled safely: identical name+code is skipped; same name with different code is imported as “name 1”, “name 2”, etc.</p>
        <textarea id="gem-snippets-import-json" class="gem-scrollable" placeholder="Paste your JSON here..." style="background:var(--token-input-default-background); width: 100%; height: 260px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="gem-snippets-import-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Import</button>
          <button id="gem-snippets-cancel-import-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#gem-snippets-cancel-import-btn').addEventListener('click', close);

    modal.querySelector('#gem-snippets-import-btn').addEventListener('click', () => {
      const textarea = modal.querySelector('#gem-snippets-import-json');
      let imported;

      try {
        imported = parseImportedSnippetsJSON(textarea.value);
      } catch (e) {
        alert(e.message);
        textarea.focus();
        return;
      }

      getSnippets((existingSnippets) => {
        const updated = [...existingSnippets];
        const existingNamesLower = new Set(updated.map(s => (s.name || '').toLowerCase()));

        let added = 0;
        let skipped = 0;
        let renamed = 0;
        let invalid = 0;

        imported.forEach((item) => {
          const name = (item && typeof item.name === 'string') ? item.name.trim() : '';
          const content = (item && typeof item.content === 'string') ? item.content.trim() : '';

          if (!name || !content) {
            invalid++;
            return;
          }

          const existingSameName = updated.find(s => (s.name || '').toLowerCase() === name.toLowerCase());
          if (existingSameName) {
            const existingContent = (existingSameName.content || '').trim();
            if (existingContent === content) {
              skipped++;
              return;
            }

            const newName = makeUniqueSnippetName(name, existingNamesLower);
            if (newName !== name) renamed++;

            updated.push({
              id: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: newName,
              content: content
            });
            existingNamesLower.add(newName.toLowerCase());
            added++;
            return;
          }

          updated.push({
            id: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            content: content
          });
          existingNamesLower.add(name.toLowerCase());
          added++;
        });

        saveSnippets(updated, () => {
          close();
          refreshSnippetsDisplay();
          alert(`Import complete.\n\nAdded: ${added}\nRenamed: ${renamed}\nSkipped (identical): ${skipped}\nInvalid: ${invalid}`);
        });
      });
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  function setupSnippetsImportExportButtons() {
    const importBtn = document.querySelector('#gem-available-snippet-list .gem-import-snippets-btn');
    const exportBtn = document.querySelector('#gem-available-snippet-list .gem-export-snippets-btn');

    if (importBtn && !importBtn._gemImportBound) {
      importBtn._gemImportBound = true;
      importBtn.addEventListener('click', showSnippetsImportModal);
    }

    if (exportBtn && !exportBtn._gemExportBound) {
      exportBtn._gemExportBound = true;
      exportBtn.addEventListener('click', showSnippetsExportModal);
    }
  }

  // Function to add the snippets tab after the links tab
  function addSnippetsTab() {
    const linksTab = document.querySelector('cb-vertical-tab#linksTab');
    if (!linksTab) {
      console.log("[Gem] Links tab not found, cannot add snippets tab");
      return false;
    }

    // Check if snippets tab already exists
    if (document.querySelector('#gem-snippets-tab')) {
      console.log("[Gem] Snippets tab already exists");
      return true;
    }

    // Insert the snippets tab after the links tab
    linksTab.insertAdjacentHTML('afterend', createSnippetsTabHTML());

    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (snippetsTab) {
      console.log("[Gem] Snippets tab added successfully");

      // Add click handler
      const navItem = snippetsTab.querySelector('e-verticalnav-item');
      if (navItem) {
        navItem.addEventListener('click', handleSnippetsTabClick);
        console.log("[Gem] Snippets tab click handler added");
      }

      // Add global click handler to manage active states
      setupGlobalTabClickHandler();

      return true;
    }

    console.log("[Gem] Failed to add snippets tab");
    return false;
  }

  // Function to handle snippets tab click
  function handleSnippetsTabClick(event) {
    console.log("[Gem] Snippets tab clicked");

    // Set status="active" on the snippets tab's e-verticalnav-item
    const snippetsNavItem = document.querySelector('#gem-snippets-tab e-verticalnav-item');
    if (snippetsNavItem) {
      snippetsNavItem.setAttribute('status', 'active');
      console.log("[Gem] Added status='active' to snippets tab");
    }

    // Find the vertical nav content area
    const navContent = document.querySelector('.e-verticalnav__content');
    if (!navContent) {
      console.log("[Gem] Vertical nav content not found");
      return;
    }

    // Remove all existing children except router-outlet
    const children = Array.from(navContent.children);
    children.forEach(child => {
      if (child.tagName !== 'ROUTER-OUTLET') {
        child.remove();
      }
    });

    // Add the snippets content (async with callback)
    createSnippetsContentHTML((snippetsHTML) => {
      navContent.insertAdjacentHTML('afterbegin', snippetsHTML);
      console.log("[Gem] Snippets content loaded");

      // Set up drag and drop functionality after content is added
      setupSnippetDragAndDrop();

      // Set up add snippet button functionality
      setupAddSnippetButton();

      // Set up edit snippet button functionality
      setupEditSnippetButtons();

      // Set up import/export buttons
      setupSnippetsImportExportButtons();
    });

    // Update active states - remove active from other tabs, add to snippets tab
    // First, remove active state from all tabs
    document.querySelectorAll('cb-vertical-tab').forEach(tab => {
      const navItem = tab.querySelector('e-verticalnav-item');
      if (navItem) {
        const navItemDiv = navItem.querySelector('.e-verticalnavitem');
        if (navItemDiv) {
          navItemDiv.classList.remove('e-verticalnavitem-active');
        }
      }
    });

    // Add active state to snippets tab
    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (snippetsTab) {
      const navItem = snippetsTab.querySelector('e-verticalnav-item');
      if (navItem) {
        const navItemDiv = navItem.querySelector('.e-verticalnavitem');
        if (navItemDiv) {
          navItemDiv.classList.add('e-verticalnavitem-active');
        }
      }
    }
  }

  // Function to set up global click handler for tab management
  function setupGlobalTabClickHandler() {
    // Listen for clicks on any direct child of e-verticalnav-menu
    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (!verticalNav) {
      console.log("[Gem] Vertical nav not found for global click handler");
      return;
    }

    verticalNav.addEventListener('click', (event) => {
      // Find the clicked cb-vertical-tab element
      const clickedTab = event.target.closest('cb-vertical-tab');
      if (!clickedTab) {
        return; // Not a tab click
      }

      const clickedTabId = clickedTab.id;
      console.log("[Gem] Tab clicked:", clickedTabId);

      // If the clicked tab is NOT our snippets tab, check if snippets tab has active status
      if (clickedTabId !== 'gem-snippets-tab') {
        const snippetsNavItem = document.querySelector('#gem-snippets-tab e-verticalnav-item');
        if (snippetsNavItem && snippetsNavItem.hasAttribute('status') && snippetsNavItem.getAttribute('status') === 'active') {
          // Remove the status="active" attribute
          snippetsNavItem.removeAttribute('status');
          console.log("[Gem] Removed status='active' from snippets tab");

          // Also remove the e-verticalnavitem-active class
          const snippetsNavItemDiv = snippetsNavItem.querySelector('.e-verticalnavitem');
          if (snippetsNavItemDiv) {
            snippetsNavItemDiv.classList.remove('e-verticalnavitem-active');
            console.log("[Gem] Removed e-verticalnavitem-active class from snippets tab");
          }

          // Remove the gem-available-snippet-list element from the DOM
          const snippetList = document.querySelector('#gem-available-snippet-list');
          if (snippetList) {
            snippetList.remove();
            console.log("[Gem] Removed #gem-available-snippet-list from DOM");
          }
        }
      }
    });

    console.log("[Gem] Global tab click handler set up");
  }

  // Function to set up the add snippet button
  function setupAddSnippetButton() {
    const addButton = document.querySelector('.gem-add-snippet-btn');
    if (addButton) {
      addButton.addEventListener('click', () => openSnippetModal());
      console.log("[Gem] Add snippet button handler attached");
    }
  }

  // Function to set up edit snippet buttons
  function setupEditSnippetButtons() {
    const editButtons = document.querySelectorAll('.gem-edit-snippet-btn');
    editButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        const snippetId = event.currentTarget.getAttribute('data-snippet-id');
        if (snippetId) {
          openSnippetModal(snippetId);
        }
      });
    });
    console.log("[Gem] Edit snippet button handlers attached");
  }

  // Function to open the snippet modal
  function openSnippetModal(snippetId = null) {
    // Remove any existing modal
    closeSnippetModal();

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', createSnippetModalHTML(!!snippetId));

    // Set up modal event handlers after a brief delay to ensure DOM is ready
    setTimeout(() => {
      setupModalEventHandlers(snippetId);
    }, 10);

    // If editing, pre-populate the form
    if (snippetId) {
      getSnippets((snippets) => {
        const snippet = snippets.find(s => s.id === snippetId);
        if (snippet) {
          setTimeout(() => {
            const nameInput = document.getElementById('gem-snippet-name-input');
            const codeInput = document.getElementById('gem-snippet-code-input');

            if (nameInput) {
              nameInput.value = snippet.name;
              nameInput.focus();
              nameInput.select();
            }
            if (codeInput) {
              codeInput.value = snippet.content;
            }
          }, 100);
        }
      });
    } else {
      // Focus on name input for new snippets
      setTimeout(() => {
        const nameInput = document.getElementById('gem-snippet-name-input');
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
      }, 100);
    }

    console.log("[Gem] Snippet modal opened", snippetId ? `(editing ${snippetId})` : '(creating new)');
  }

  // Function to close the snippet modal
  function closeSnippetModal() {
    const modal = document.getElementById('gem-snippet-modal');
    const backdrop = document.getElementById('gem-modal-backdrop');

    if (modal) modal.remove();
    if (backdrop) backdrop.remove();

    console.log("[Gem] Snippet modal closed");
  }

  // Function to set up modal event handlers
  function setupModalEventHandlers(snippetId = null) {
    // Close button
    const closeBtn = document.getElementById('gem-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSnippetModal);
    }

    // Cancel button
    const cancelBtn = document.getElementById('gem-modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeSnippetModal);
    }

    // OK button
    const okBtn = document.getElementById('gem-modal-ok-btn');
    if (okBtn) {
      okBtn.addEventListener('click', () => handleSnippetSave(snippetId));
    }

    // Delete button (only when editing)
    const deleteBtn = document.getElementById('gem-modal-delete-btn');
    if (deleteBtn && snippetId) {
      deleteBtn.addEventListener('click', () => handleSnippetDelete(snippetId));
    }

    // Backdrop click to close
    const backdrop = document.getElementById('gem-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeSnippetModal);
    }

    // ESC key to close
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeSnippetModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Enter key on form to submit
    const handleEnter = (event) => {
      if (event.key === 'Enter' && event.ctrlKey) {
        handleSnippetSave(snippetId);
      }
    };
    document.addEventListener('keydown', handleEnter);
  }

  // Function to handle saving a snippet (create or update)
  function handleSnippetSave(editingSnippetId = null) {
    const nameInput = document.getElementById('gem-snippet-name-input');
    const codeInput = document.getElementById('gem-snippet-code-input');

    if (!nameInput || !codeInput) {
      console.log("[Gem] Modal inputs not found");
      return;
    }

    const name = nameInput.value.trim();
    const code = codeInput.value.trim();

    if (!name) {
      alert('Please enter a snippet name.');
      nameInput.focus();
      return;
    }

    if (!code) {
      alert('Please enter snippet code.');
      codeInput.focus();
      return;
    }

    // Check for duplicate names
    getSnippets((snippets) => {
      const existingSnippet = snippets.find(snippet => snippet.name.toLowerCase() === name.toLowerCase());

      // When editing, allow keeping the same name as the current snippet
      if (existingSnippet && (!editingSnippetId || existingSnippet.id !== editingSnippetId)) {
        alert(`A snippet with the name "${name}" already exists. Please choose a different name.`);
        nameInput.focus();
        nameInput.select();
        return;
      }

      if (editingSnippetId) {
        // Update existing snippet
        const updatedSnippets = snippets.map(snippet =>
          snippet.id === editingSnippetId
            ? { ...snippet, name: name, content: code }
            : snippet
        );

        // Save to storage
        saveSnippets(updatedSnippets, () => {
          console.log("[Gem] Snippet updated:", editingSnippetId);

          // Close modal
          closeSnippetModal();

          // Refresh the snippets display
          refreshSnippetsDisplay();
        });
      } else {
        // Create new snippet
        const newSnippet = {
          id: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: name,
          content: code
        };

        // Add to existing snippets
        const updatedSnippets = [...snippets, newSnippet];

        // Save to storage
        saveSnippets(updatedSnippets, () => {
          console.log("[Gem] New snippet saved:", newSnippet);

          // Close modal
          closeSnippetModal();

          // Refresh the snippets display
          refreshSnippetsDisplay();
        });
      }
    });
  }

  // Function to handle deleting a snippet
  function handleSnippetDelete(snippetId) {
    // Show confirmation dialog
    const confirmed = confirm('Are you sure you want to delete this snippet? This action cannot be undone.');

    if (!confirmed) {
      return; // User cancelled
    }

    // Get current snippets and remove the one with the given ID
    getSnippets((snippets) => {
      const updatedSnippets = snippets.filter(snippet => snippet.id !== snippetId);

      // Save to storage
      saveSnippets(updatedSnippets, () => {
        console.log("[Gem] Snippet deleted:", snippetId);

        // Close modal
        closeSnippetModal();

        // Refresh the snippets display
        refreshSnippetsDisplay();
      });
    });
  }

  // Function to refresh the snippets display
  function refreshSnippetsDisplay() {
    const navContent = document.querySelector('.e-verticalnav__content');
    if (!navContent) return;

    // Find the snippets content area
    const snippetsContent = navContent.querySelector('#gem-available-snippet-list .e-section__content');
    if (!snippetsContent) return;

    // Re-render the snippets table
    getSnippets((snippets) => {
      const snippetRows = snippets.map(snippet => `
<tr>
  <td style="vertical-align:middle">
    <div>
      <vce-token name="${snippet.name}" data="${generateSnippetHTML(snippet.name, snippet.content).replace(/"/g, '&quot;')}">
        <span class="e-label e-label-primary" draggable="true" style="cursor: move;">${snippet.name}</span>
      </vce-token>
    </div>
  </td>
  <td style="text-align: right; vertical-align:middle;padding: 8px;">
    <button class="e-btn e-btn-sm gem-edit-snippet-btn" type="button" data-snippet-id="${snippet.id}" title="Edit snippet" style="min-width: unset; padding: 0 2px 0 10px;">
      <e-icon icon="edit" color="inherit">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon text-color-inherit" style="margin: 0;">✏️</div>
        </div>
      </e-icon>
    </button>
  </td>
</tr>
      `).join('');

      const existingTable = snippetsContent.querySelector('table');

      if (snippets.length > 0) {
        // There are snippets - create or update the table
        if (existingTable) {
          // Update existing table
          existingTable.innerHTML = `
<tbody>
  ${snippetRows}
</tbody>
          `;
        } else {
          // Create new table
          const tableHTML = `
<table data-e-version="2" class="e-table e-table-hover e-table-bordered" style="margin-bottom: 15px;">
  <tbody>
    ${snippetRows}
  </tbody>
</table>`;
          // Insert table before the "Add a Snippet" button
          const addButton = snippetsContent.querySelector('.gem-add-snippet-btn');
          if (addButton) {
            addButton.insertAdjacentHTML('beforebegin', tableHTML);
          }
        }

        // Re-setup drag and drop and edit buttons for the new snippets
        setupSnippetDragAndDrop();
        setupEditSnippetButtons();
      } else {
        // No snippets - remove the table if it exists
        if (existingTable) {
          existingTable.remove();
        }
      }
    });
  }

  // Function to set up drag and drop for snippets
  function setupSnippetDragAndDrop() {
    console.log("[Gem] Setting up snippet drag and drop");

    // Find all draggable snippet elements
    const snippetElements = document.querySelectorAll('#gem-available-snippet-list [draggable="true"]');

    snippetElements.forEach(snippetElement => {
      const vceToken = snippetElement.closest('vce-token');
      if (!vceToken) return;

      const snippetHTML = vceToken.getAttribute('data');
      if (!snippetHTML) return;

      // Skip if already set up
      if (snippetElement._gemDragStartHandler) {
        return;
      }

      const newDragStartHandler = (event) => {
        console.log("[Gem] Snippet drag started:", snippetElement.textContent);

        // Store the snippet HTML in the drag data
        event.dataTransfer.setData('text/html', snippetHTML);
        event.dataTransfer.effectAllowed = 'copy';

        // Add visual feedback
        snippetElement.style.opacity = '0.5';
      };

      const newDragEndHandler = (event) => {
        snippetElement.style.opacity = '1';
      };

      // Store references to the handlers so we can check if already set up
      snippetElement._gemDragStartHandler = newDragStartHandler;
      snippetElement._gemDragEndHandler = newDragEndHandler;

      // Set up drag start
      snippetElement.addEventListener('dragstart', newDragStartHandler);

      // Reset visual feedback when drag ends
      snippetElement.addEventListener('dragend', newDragEndHandler);
    });

    // Set up drop zones in the iframe
    setupIframeDropZones();
  }

  // ------------------------------------------------------------
  // Iframe targeting + DnD wiring
  // We only allow drops into: vce-iframe iframe.e-contentblocks-preview__iframe
  // and explicitly NOT into the mobile preview clone (.gem-iframe-wrapper iframe.iframe-duplicate)
  // ------------------------------------------------------------

  let gemSnippetTargetIframeEl = null;
  let gemSnippetTargetIframeDoc = null;
  let gemLastHandledDrop = { at: 0, signature: "" };

  function getGemSnippetTargetIframe() {
    const iframe = document.querySelector('vce-iframe iframe.e-contentblocks-preview__iframe');
    if (!iframe) return null;

    // Never allow the mobile preview clone to become a target
    if (iframe.classList.contains('iframe-duplicate')) return null;
    if (iframe.closest('.gem-iframe-wrapper')) return null;

    return iframe;
  }

  function cleanupLegacyGemSnippetListenersInDoc(doc) {
    // Remove legacy per-element handlers we previously attached (_gemDropHandler etc.)
    try {
      const editables = doc.querySelectorAll('[contenteditable="true"]');
      editables.forEach((el) => {
        if (el._gemDragOverHandler) {
          el.removeEventListener('dragover', el._gemDragOverHandler);
          delete el._gemDragOverHandler;
        }
        if (el._gemDragEnterHandler) {
          el.removeEventListener('dragenter', el._gemDragEnterHandler);
          delete el._gemDragEnterHandler;
        }
        if (el._gemDragLeaveHandler) {
          el.removeEventListener('dragleave', el._gemDragLeaveHandler);
          delete el._gemDragLeaveHandler;
        }
        if (el._gemDropHandler) {
          el.removeEventListener('drop', el._gemDropHandler);
          delete el._gemDropHandler;
        }
      });

      if (doc._gemDocDragOverHandler) {
        doc.removeEventListener('dragover', doc._gemDocDragOverHandler);
        delete doc._gemDocDragOverHandler;
      }
    } catch (e) {
      // ignore
    }
  }

  function cleanupLegacyGemSnippetListenersEverywhere() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) cleanupLegacyGemSnippetListenersInDoc(doc);
      } catch (e) {
        // ignore cross-origin / transient access errors
      }
    });
  }

  function teardownGemSnippetDropZones() {
    if (!gemSnippetTargetIframeDoc) return;
    const handlers = gemSnippetTargetIframeDoc._gemSnippetDndHandlers;
    if (handlers) {
      gemSnippetTargetIframeDoc.removeEventListener('dragover', handlers.onDragOver, true);
      gemSnippetTargetIframeDoc.removeEventListener('drop', handlers.onDrop, true);
      delete gemSnippetTargetIframeDoc._gemSnippetDndHandlers;
    }
    gemSnippetTargetIframeDoc = null;
    gemSnippetTargetIframeEl = null;
  }

  // Function to set up drop zones in the iframe
  function setupIframeDropZones() {
    const iframe = getGemSnippetTargetIframe();
    if (!iframe) {
      // If the target iframe disappeared, tear down old handlers
      teardownGemSnippetDropZones();
      return;
    }

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // Always remove any old/legacy handlers (especially important for the cloned iframe case)
      cleanupLegacyGemSnippetListenersEverywhere();

      // If we're already wired to this exact doc, do nothing
      if (gemSnippetTargetIframeDoc === iframeDoc && iframeDoc._gemSnippetDndHandlers) {
        return;
      }

      // Switching target iframe/doc -> remove handlers from previous target doc
      teardownGemSnippetDropZones();

      gemSnippetTargetIframeEl = iframe;
      gemSnippetTargetIframeDoc = iframeDoc;

      const onDragOver = (event) => {
        const targetEl = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
        if (!targetEl) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      };

      const onDrop = (event) => {
        // Must still be the current target iframe + doc
        if (gemSnippetTargetIframeDoc !== iframeDoc) return;
        if (getGemSnippetTargetIframe() !== iframe) return;

        const targetEl = event.target instanceof Element ? event.target.closest('[contenteditable="true"]') : null;
        if (!targetEl) return;

        // Mark handled + prevent any editor-native drop handlers from also inserting content.
        // (TinyMCE / Emarsys can programmatically insert on drop even if default is prevented.)
        if (event._gemSnippetHandled) return;
        event._gemSnippetHandled = true;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const snippetHTML = event.dataTransfer.getData('text/html');
        if (!snippetHTML) return;

        dropEventCounter++;
        const dropId = `drop-${dropEventCounter}-${Date.now()}`;

        // Defensive dedupe: some environments fire multiple drop-like flows
        // (or we can see multiple drops very close together on re-render).
        const sig = `${targetEl.id || 'no-id'}|${event.clientX},${event.clientY}|${snippetHTML.length}`;
        const now = Date.now();
        if (gemLastHandledDrop.signature === sig && now - gemLastHandledDrop.at < 250) {
          console.log(`[Gem] DROP deduped (${dropId})`, { sig });
          return;
        }
        gemLastHandledDrop = { at: now, signature: sig };

        insertSnippetAtCaret(targetEl, snippetHTML, iframeDoc, dropId, event);
      };

      iframeDoc._gemSnippetDndHandlers = { onDragOver, onDrop };

      // Capture listeners at document level (no per-element wiring; no listener duplication)
      iframeDoc.addEventListener('dragover', onDragOver, true);
      iframeDoc.addEventListener('drop', onDrop, true);

    } catch (error) {
      // If we can't access the iframe (transient/cross-origin), don't crash
      console.log("[Gem] Error setting up target iframe drop zones:", error.message);
    }
  }

  // Global counters for tracking events
let dropEventCounter = 0;
let insertionCounter = 0;

// Function to insert snippet HTML at the current caret position
  function insertSnippetAtCaret(element, snippetHTML, doc, dropId = null, dropEvent = null) {
    insertionCounter++;
    const insertionId = `insert-${insertionCounter}-${Date.now()}`;

    console.log(`[Gem] INSERT #${insertionCounter} (${insertionId}): insertSnippetAtCaret called for element ${element.id || 'unknown'}`);
    console.log(`[Gem] INSERT #${insertionCounter}: From drop: ${dropId || 'unknown'}`);
    try {
      const selection = doc.getSelection();
      let range = null;

      // Prefer a range derived from the drop coordinates (more accurate than current selection)
      if (dropEvent && typeof dropEvent.clientX === 'number' && typeof dropEvent.clientY === 'number') {
        if (typeof doc.caretRangeFromPoint === 'function') {
          range = doc.caretRangeFromPoint(dropEvent.clientX, dropEvent.clientY);
        } else if (typeof doc.caretPositionFromPoint === 'function') {
          const pos = doc.caretPositionFromPoint(dropEvent.clientX, dropEvent.clientY);
          if (pos && pos.offsetNode) {
            range = doc.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        }
      }

      // Fall back to the current selection if it exists and is inside the target element
      if (!range && selection && selection.rangeCount) {
        const candidate = selection.getRangeAt(0);
        const container = candidate.commonAncestorContainer;
        const containerEl = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
        if (containerEl && element.contains(containerEl)) {
          range = candidate;
        }
      }

      // Final fallback: insert at the end of the target contenteditable
      if (!range) {
        range = doc.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
      }

      // Create a temporary element to hold the HTML
      const tempDiv = doc.createElement('div');
      tempDiv.innerHTML = snippetHTML;

      // Insert the content, but filter out meta tags that browsers add automatically
      const fragment = doc.createDocumentFragment();
      const nodes = Array.from(tempDiv.childNodes).filter((n) => {
        return !(n.nodeType === Node.ELEMENT_NODE && n.tagName === 'META');
      });
      nodes.forEach((n) => fragment.appendChild(n));
      const lastInserted = fragment.lastChild;

      // Delete any selected content
      range.deleteContents();

      // Insert the snippet
      range.insertNode(fragment);

      // Move cursor after the inserted content
      if (selection) {
        if (lastInserted && lastInserted.parentNode) {
          range.setStartAfter(lastInserted);
          range.setEndAfter(lastInserted);
        } else {
          // If we can't reliably place after the inserted node, collapse to end of element
          range.selectNodeContents(element);
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }

    } catch (error) {
      console.log(`[Gem] INSERT #${insertionCounter} (${insertionId}): Error inserting snippet:`, error?.message || error);
    }
  }

  // Function to set up iframe drop zone observer
  function setupIframeObserver() {
    // Watch for the target iframe entering/leaving the DOM.
    // When it appears, (re)wire drop zones to that *one* iframe doc.
    if (window._gemSnippetIframeObserver) return;

    const observer = new MutationObserver(() => {
      setupIframeDropZones();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window._gemSnippetIframeObserver = observer;

    // One-time cleanup of any legacy handlers that might already exist (including in the mobile clone)
    cleanupLegacyGemSnippetListenersEverywhere();

    // Initial wiring attempt
    setupIframeDropZones();
  }

  // Function to wait for and initialize the vertical nav
  function waitForVerticalNav() {
    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (verticalNav) {
      console.log("[Gem] Vertical nav found, adding snippets tab");
      addSnippetsTab();
      setupIframeObserver();
      return;
    }

    console.log("[Gem] Vertical nav not found, waiting...");

    // Watch for the vertical nav to be added
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this node is the vertical nav
            if (node.matches && node.matches('e-verticalnav-menu')) {
              console.log("[Gem] Vertical nav added to DOM");
              observer.disconnect();
              addSnippetsTab();
              setupIframeObserver();
              return;
            }

            // Check if vertical nav is in descendants
            const verticalNav = node.querySelector && node.querySelector('e-verticalnav-menu');
            if (verticalNav) {
              console.log("[Gem] Vertical nav found in added node");
              observer.disconnect();
              addSnippetsTab();
              setupIframeObserver();
              return;
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Start the initialization
  waitForVerticalNav();
}

// Add a global debugging function
window.debugSnippets = function() {
  console.log("[Gem] DEBUG: Snippets debug check");
  console.log("[Gem] DEBUG: Total drop events:", dropEventCounter);
  console.log("[Gem] DEBUG: Total insertions:", insertionCounter);
  console.log("[Gem] DEBUG: Snippets tab:", document.querySelector('#gem-snippets-tab'));
  console.log("[Gem] DEBUG: Snippets content:", document.querySelector('#gem-available-snippet-list'));
  console.log("[Gem] DEBUG: Add snippet button:", document.querySelector('.gem-add-snippet-btn'));
  console.log("[Gem] DEBUG: Modal:", document.querySelector('#gem-snippet-modal'));
  console.log("[Gem] DEBUG: Iframe:", document.querySelector('.e-contentblocks-preview__iframe-desktop'));

  // Count current snippets in DOM
  const currentSnippets = document.querySelectorAll('#gem-available-snippet-list span[e-token="cust_esl"]');
  console.log("[Gem] DEBUG: Current snippets in DOM:", currentSnippets.length);

  // Check stored snippets
  getSnippets((snippets) => {
    console.log("[Gem] DEBUG: Snippets in storage:", snippets.length);
    snippets.forEach((snippet, index) => {
      console.log(`[Gem] DEBUG: Snippet ${index}: ${snippet.name} (${snippet.content.length} chars)`);
    });
  });

  // Reset counters for next test
  dropEventCounter = 0;
  insertionCounter = 0;
  console.log("[Gem] DEBUG: Counters reset to 0");
};

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSnippetsTab);
} else {
  initializeSnippetsTab();
}