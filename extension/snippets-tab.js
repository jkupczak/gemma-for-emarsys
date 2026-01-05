console.log("[Gem] snippets-tab.js loaded");

// Snippets storage and management
const SNIPPETS_STORAGE_KEY = 'gemSnippets';
const SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY = 'gemSnippetCategoryCollapseState';
const UNCATEGORIZED_LABEL = 'Uncategorized';

// Default snippets to initialize with
const DEFAULT_SNIPPETS = [
  {
    id: 'sample-esl',
    favorite: false,
    category: '',
    name: 'ESL snippet',
    description: '',
    swapKeyword: '',
    swapMode: 'token',
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
  function escapeHtmlAttribute(value) {
    // Keep the attribute HTML-safe, but use percent-encoding for the most dangerous characters
    // inside the snippet payload (per request): <, >, ", ', space, %, {, }.
    //
    // NOTE: We still HTML-escape '&' so the attribute remains valid HTML; otherwise entity parsing
    // could mutate the payload before Emarsys reads it.
    return String(value)
      // IMPORTANT: encode '%' first so we don't accidentally re-encode the '%' we introduce below.
      .replace(/%/g, '%25')
      .replace(/&/g, '&amp;')
      .replace(/ /g, '%20')
      .replace(/\{/g, '%7B')
      .replace(/\|/g, '%7C')
      .replace(/\}/g, '%7D')
      .replace(/\\/g, '%5C')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/"/g, '%22');
  }

  const tokenContent = JSON.stringify({ script: content });
  // IMPORTANT:
  // We do NOT percent-encode the snippet code anymore. Percent-encoding changes characters like '=' and others,
  // which can invalidate ESL. Instead, we HTML-escape the JSON so it can live safely in an HTML attribute;
  // when parsed/inserted, the browser will decode entities back to the original characters.
  const encodedTokenContent = escapeHtmlAttribute(tokenContent);
  // Use the exact token-template from the working sample
  const encodedTokenTemplate = '%22%3C%25=%20script%20%25%3E%22';
  // token-meta should be encoded as well
  const encodedTokenMeta = '%7B%7D';

  return `<span e-token="cust_esl" token-template="${encodedTokenTemplate}" token-content="${encodedTokenContent}" token-meta="${encodedTokenMeta}" class="cbNonEditable" contenteditable="false">${name}</span>`;
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
        <label class="e-field__label e-field__label-inline" for="gem-snippet-category-input">Category</label>
        <input class="e-input" id="gem-snippet-category-input" type="text" placeholder="Optional category">
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-name-input">Snippet name</label>
        <input class="e-input" id="gem-snippet-name-input" type="text" placeholder="Enter snippet name">
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline">Code snippet</label>
        <textarea class="e-input gem-scrollable" id="gem-snippet-code-input" placeholder="Enter your ESL code snippet" style="background:var(--token-input-default-background); font-family: var(--token-font-monospace, monospace); width: 100%; min-height: 200px; resize: vertical; padding: 10px 12px;"></textarea>
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-description-input">Description</label>
        <textarea class="e-input gem-scrollable" id="gem-snippet-description-input" placeholder="Optional description" style="background:var(--token-input-default-background); width: 100%; min-height: 100px; resize: vertical; padding: 10px 12px;"></textarea>
      </div>
      <div style="display:flex; gap:10px">
      <div class="e-field" style="width:100%">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-swap-keyword-input">Optional Keyword for Swapping</label>
        <input class="e-input" id="gem-snippet-swap-keyword-input" type="text" placeholder="Optional keyword (must be unique)">
      </div>
      <div class="e-field">
        <label class="e-field__label e-field__label-inline" for="gem-snippet-swap-mode-select">Swap Method</label>
        <select class="e-input" id="gem-snippet-swap-mode-select">
          <option value="token" selected>Swap as ESL Token</option>
          <option value="plain">Swap as Plain Text</option>
        </select>
      </div>
      </div>
    </div>
  </div>
  <div class="e-dialog__footer">
    <div class="e-buttongroup" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="e-btn e-btn-borderless e-btn-onlyicon" id="gem-modal-favorite-btn" type="button" title="Toggle favorite" aria-label="Toggle favorite" style="min-width: unset; padding: 0 8px;">
          <span id="gem-modal-favorite-icon" style="font-size: 16px; line-height: 1;">☆</span>
        </button>
        ${isEditing ? '<button class="e-btn e-btn-danger" id="gem-modal-delete-btn" type="button">Delete</button>' : ''}
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
        <button class="e-btn" id="gem-modal-cancel-btn" type="button">Cancel</button>
        <button class="e-btn e-btn-primary" id="gem-modal-ok-btn" type="button">Save</button>
      </div>
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
      getSnippetCategoryCollapseState((collapseState) => {
        const tablesHTML = renderSnippetsTablesHTML(snippets, collapseState);

        const html = `
<gem-snippets class="scrollable">
  <div class="e-section">
    <div class="e-section__header">
        <div class="e-section__title">Snippets</div>
    </div>
    <div class="e-section__content">
      <div class="e-margin-bottom-s">
        <input id="gem-snippet-search-input" class="e-input e-input-search" placeholder="Search" type="search">
      </div>
      <div class="e-margin-bottom-s">
        <select id="gem-snippet-filter-select" class="e-input" style="width: 100%;">
          <option value="showAll" selected>Show All</option>
          <option value="favorites">Show Favorite Snippets Only</option>
          <option value="swaps">Show Snippets with Keyword Swaps</option>
        </select>
      </div>
      <div class="gem-snippets-tables">
        ${tablesHTML}
      </div>
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
</gem-snippets>
        `.trim();

        callback(html);
      });
    });
  }

  function normalizeSnippetCategory(category) {
    const c = (category || '').trim();
    return c ? c : UNCATEGORIZED_LABEL;
  }

  function escapeHtmlText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSnippetsTablesHTML(snippets, collapseState = {}) {
    if (!snippets || snippets.length === 0) return '';

    // Group by category
    const groups = new Map();
    snippets.forEach((snippet) => {
      const category = normalizeSnippetCategory(snippet.category);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(snippet);
    });

    // Sort categories alphabetically (case-insensitive)
    const categories = Array.from(groups.keys()).sort((a, b) => {
      // Uncategorized should always appear last
      if (a === UNCATEGORIZED_LABEL && b !== UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL && a !== UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    return categories.map((category) => {
      const list = groups.get(category) || [];

      // Sort snippets within category:
      // 1) favorited first
      // 2) then name alphabetically (case-insensitive)
      list.sort((a, b) => {
        const af = !!a.favorite;
        const bf = !!b.favorite;
        if (af !== bf) return af ? -1 : 1;
        return (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });
      });

      const categoryKey = category.toLowerCase();
      const isCollapsed = !!collapseState[categoryKey];
      const toggleIcon = isCollapsed ? '▸' : '▾';

      const rows = list.map((snippet) => {
        const fullSnippetHTML = generateSnippetHTML(snippet.name, snippet.content);
        const snippetNameLower = (snippet.name || '').toLowerCase();
        const favoriteStar = snippet.favorite
          ? '<span title="Favorite" aria-label="Favorite" style="margin-right: 6px; font-size: 14px; line-height: 1;">★</span>'
          : '';
        const isFav = !!snippet.favorite;
        const hasSwap = !!(snippet.swapKeyword && String(snippet.swapKeyword).trim());
        const swapGlyph = hasSwap
          ? '<div class="e-icon" title="Has keyword swap" aria-label="Has keyword swap" style="margin-bottom: 3px; opacity: 0.3; font-size: 20px">&#xF0DE;</div>'
          : '';
        return `
<tr data-snippet-name="${escapeHtmlText(snippetNameLower)}" data-gem-favorite="${isFav ? 'true' : 'false'}" data-gem-has-swap="${hasSwap ? 'true' : 'false'}">
  <td style="vertical-align:middle;padding:8px 2px 8px 10px">
    <div style="display:flex; align-items:center;">
      ${favoriteStar}
      <vce-token name="${snippet.name}" data="${fullSnippetHTML.replace(/"/g, '&quot;')}">
        <span class="e-label e-label-primary" draggable="true" style="cursor: move;">${snippet.name}</span>
      </vce-token>
      ${swapGlyph}
    </div>
  </td>
  <td style="text-align: right; vertical-align:middle; padding: 6px 6px 6px 2px;">
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

      return `
<div class="gem-snippets-category-block" style="margin-bottom: 15px;">
  <div class="gem-snippets-category-title" style="display:flex; align-items:center; justify-content:space-between; font-weight: 600; margin: 6px 0;">
    <span>${escapeHtmlText(category)}</span>
    <span style="display:flex; align-items:center; gap:6px;">
      <button class="e-btn e-btn-borderless e-btn-onlyicon gem-snippets-category-rename"
              type="button"
              title="Rename category"
              aria-label="Rename category"
              data-category-key="${escapeHtmlText(categoryKey)}"
              data-category-name="${escapeHtmlText(category)}"
              style="min-width: unset; padding: 0 6px;">
        <span style="font-size: 14px; line-height: 1;">✎</span>
      </button>
      <button class="e-btn e-btn-borderless e-btn-onlyicon gem-snippets-category-toggle"
              type="button"
              title="${isCollapsed ? 'Expand' : 'Collapse'}"
              aria-label="${isCollapsed ? 'Expand category' : 'Collapse category'}"
              data-category-key="${escapeHtmlText(categoryKey)}"
              style="min-width: unset; padding: 0 6px;">
        <span style="font-size: 14px; line-height: 1;">${toggleIcon}</span>
      </button>
    </span>
  </div>
  <div class="gem-snippets-category-table-wrapper" data-category-key="${escapeHtmlText(categoryKey)}" style="${isCollapsed ? 'display:none;' : ''}">
    <table data-e-version="2" class="e-table e-table-hover e-table-bordered" style="margin-bottom: 0;">
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</div>
      `.trim();
    }).join('\n');
  }

  function getSnippetCategoryCollapseState(callback) {
    chrome.storage.sync.get({ [SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY]: {} }, (result) => {
      callback(result[SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY] || {});
    });
  }

  function setSnippetCategoryCollapsed(categoryKey, collapsed, callback) {
    getSnippetCategoryCollapseState((state) => {
      const next = { ...state, [categoryKey]: !!collapsed };
      chrome.storage.sync.set({ [SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY]: next }, () => {
        if (callback) callback(next);
      });
    });
  }

  function setupSnippetCategoryCollapseToggles() {
    const root = document.querySelector('gem-snippets');
    if (!root || root._gemCategoryToggleBound) return;
    root._gemCategoryToggleBound = true;

    root.addEventListener('click', (e) => {
      const renameBtn = e.target.closest && e.target.closest('.gem-snippets-category-rename');
      if (renameBtn) {
        const categoryKey = renameBtn.getAttribute('data-category-key');
        const categoryName = renameBtn.getAttribute('data-category-name') || '';
        if (!categoryKey) return;

        // Disallow renaming the synthetic Uncategorized bucket (it represents empty categories)
        if (categoryName === UNCATEGORIZED_LABEL) {
          alert(`"${UNCATEGORIZED_LABEL}" cannot be renamed.`);
          return;
        }

        const nextName = prompt('Rename category:', categoryName);
        if (nextName === null) return; // cancelled
        const trimmed = nextName.trim();
        if (!trimmed) {
          alert('Category name cannot be empty.');
          return;
        }

        renameSnippetCategory(categoryName, trimmed);
        return;
      }

      const btn = e.target.closest && e.target.closest('.gem-snippets-category-toggle');
      if (!btn) return;

      const categoryKey = btn.getAttribute('data-category-key');
      if (!categoryKey) return;

      const wrapper = root.querySelector(`.gem-snippets-category-table-wrapper[data-category-key="${CSS.escape(categoryKey)}"]`);
      if (!wrapper) return;

      const willCollapse = wrapper.style.display !== 'none';
      wrapper.style.display = willCollapse ? 'none' : '';

      // Update icon + title
      const iconSpan = btn.querySelector('span');
      if (iconSpan) iconSpan.textContent = willCollapse ? '▸' : '▾';
      btn.title = willCollapse ? 'Expand' : 'Collapse';
      btn.setAttribute('aria-label', willCollapse ? 'Expand category' : 'Collapse category');

      // Persist
      setSnippetCategoryCollapsed(categoryKey, willCollapse);
    });
  }

  function renameSnippetCategory(oldCategoryName, newCategoryName) {
    const oldName = (oldCategoryName || '').trim();
    const newName = (newCategoryName || '').trim();
    if (!oldName || !newName) return;

    // Normalize: prevent renaming into the synthetic label (would be confusing)
    if (newName === UNCATEGORIZED_LABEL) {
      alert(`"${UNCATEGORIZED_LABEL}" is reserved. Choose a different category name.`);
      return;
    }

    getSnippets((snippets) => {
      const updatedSnippets = snippets.map((s) => {
        const currentCat = normalizeSnippetCategory(s.category);
        if (currentCat.toLowerCase() === oldName.toLowerCase()) {
          return { ...s, category: newName };
        }
        return s;
      });

      // Migrate collapse-state key (old -> new) so user preference persists
      getSnippetCategoryCollapseState((state) => {
        const nextState = { ...state };
        const oldKey = oldName.toLowerCase();
        const newKey = newName.toLowerCase();

        if (Object.prototype.hasOwnProperty.call(nextState, oldKey)) {
          nextState[newKey] = nextState[oldKey];
          delete nextState[oldKey];
        }

        chrome.storage.sync.set(
          {
            [SNIPPETS_STORAGE_KEY]: updatedSnippets,
            [SNIPPET_CATEGORY_COLLAPSE_STORAGE_KEY]: nextState
          },
          () => {
            refreshSnippetsDisplay();
          }
        );
      });
    });
  }

  // ------------------------------------------------------------
  // Snippet search (filters by snippet name only)
  // ------------------------------------------------------------

  function setupSnippetsSearch() {
    const root = document.querySelector('gem-snippets');
    if (!root) return;

    const input = root.querySelector('#gem-snippet-search-input');
    if (!input) return;

    if (input._gemBound) return;
    input._gemBound = true;

    const apply = () => applySnippetSearchFilter(root, input.value || '');
    input.addEventListener('input', apply);

    // If we have a prior value stored on the root (from refresh), re-apply
    if (root.dataset.gemSnippetSearch) {
      input.value = root.dataset.gemSnippetSearch;
      apply();
    }
  }

  function getSnippetsPanelFilterMode(root) {
    // Source of truth is the dataset; fallback to native select.
    const mode = root?.dataset?.gemSnippetFilterMode;
    if (mode) return mode;
    const select = root?.querySelector('#gem-snippet-filter-select');
    return select?.value || 'showAll';
  }

  function applySnippetSearchFilter(root, rawQuery) {
    const query = (rawQuery || '').trim().toLowerCase();
    root.dataset.gemSnippetSearch = rawQuery || '';
    const filterMode = getSnippetsPanelFilterMode(root);

    const categoryBlocks = root.querySelectorAll('.gem-snippets-category-block');

    categoryBlocks.forEach((block) => {
      const wrapper = block.querySelector('.gem-snippets-category-table-wrapper');
      const rows = block.querySelectorAll('tr[data-snippet-name]');

      // Determine matches (even if collapsed)
      let anyMatch = false;
      rows.forEach((row) => {
        const nameLower = row.getAttribute('data-snippet-name') || '';
        const matchesSearch = !query || nameLower.includes(query);
        const isFav = row.getAttribute('data-gem-favorite') === 'true';
        const hasSwap = row.getAttribute('data-gem-has-swap') === 'true';
        const matchesFilter =
          filterMode === 'favorites' ? isFav :
          filterMode === 'swaps' ? hasSwap :
          true;
        const matches = matchesSearch && matchesFilter;
        row.style.display = matches ? '' : 'none';
        if (matches) anyMatch = true;
      });

      // Hide entire category if nothing matches
      block.style.display = anyMatch ? '' : 'none';

      if (!wrapper) return;

      // When filtering (search OR dropdown), temporarily expand categories that have matches (don’t persist state)
      const isFiltering = !!query || filterMode !== 'showAll';
      if (isFiltering) {
        if (wrapper.dataset.gemPrevDisplay === undefined) {
          wrapper.dataset.gemPrevDisplay = wrapper.style.display || '';
        }
        if (anyMatch) {
          wrapper.style.display = '';
          // update icon for UX (non-persistent)
          const btn = block.querySelector('.gem-snippets-category-toggle');
          const iconSpan = btn && btn.querySelector('span');
          if (iconSpan) iconSpan.textContent = '▾';
        }
      } else {
        // restore collapse state visuals when query cleared
        if (wrapper.dataset.gemPrevDisplay !== undefined) {
          wrapper.style.display = wrapper.dataset.gemPrevDisplay;
          delete wrapper.dataset.gemPrevDisplay;
        }
      }
    });
  }

  // ------------------------------------------------------------
  // Snippets filter (native <select>)
  // ------------------------------------------------------------

  function setupSnippetsFilterSelect() {
    const root = document.querySelector('gem-snippets');
    if (!root) return;

    const select = root.querySelector('#gem-snippet-filter-select');
    if (!select) return;

    if (select._gemBound) return;
    select._gemBound = true;

    // Restore prior mode if present
    const mode = root.dataset.gemSnippetFilterMode || select.value || 'showAll';
    select.value = mode;
    root.dataset.gemSnippetFilterMode = mode;

    select.addEventListener('change', () => {
      root.dataset.gemSnippetFilterMode = select.value || 'showAll';
      const searchVal = root.querySelector('#gem-snippet-search-input')?.value || '';
      applySnippetSearchFilter(root, searchVal);
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
      // Export user-facing fields (IDs are regenerated on import).
      const exportPayload = snippets.map(s => ({
        category: s.category || '',
        name: s.name,
        content: s.content,
        description: s.description || '',
        favorite: !!s.favorite,
        swapKeyword: (s.swapKeyword || ''),
        swapMode: (s.swapMode === 'plain' ? 'plain' : (s.swapKeyword ? 'token' : 'token'))
      }));
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
        const existingSwapKeywordsLower = new Set(
          updated
            .map(s => (s.swapKeyword || '').trim().toLowerCase())
            .filter(Boolean)
        );

        let added = 0;
        let skipped = 0;
        let invalid = 0;
        let swapKeywordRemoved = 0;

        imported.forEach((item) => {
          const category = (item && typeof item.category === 'string') ? item.category.trim() : '';
          const name = (item && typeof item.name === 'string') ? item.name.trim() : '';
          const content = (item && typeof item.content === 'string') ? item.content.trim() : '';
          const description = (item && typeof item.description === 'string') ? item.description.trim() : '';
          const favorite = !!(item && item.favorite);
          let swapKeyword = (item && typeof item.swapKeyword === 'string') ? item.swapKeyword.trim() : '';
          const swapMode = (item && item.swapMode === 'plain') ? 'plain' : 'token';

          if (!name || !content) {
            invalid++;
            return;
          }

          // Allow duplicate snippet names. Only skip if the import contains an identical entry
          // (same name + same code) that already exists in storage.
          const existingIdentical = updated.find(s =>
            (s.name || '').toLowerCase() === name.toLowerCase() &&
            ((s.content || '').trim() === content)
          );
          if (existingIdentical) {
            skipped++;
            return;
          }

          // If this snippet's swap keyword conflicts with an existing snippet's keyword, remove it.
          if (swapKeyword) {
            const keyLower = swapKeyword.toLowerCase();
            if (existingSwapKeywordsLower.has(keyLower)) {
              swapKeywordRemoved++;
              swapKeyword = '';
            } else {
              existingSwapKeywordsLower.add(keyLower);
            }
          }

          updated.push({
            id: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            favorite,
            category: category,
            name: name,
            content: content,
            description: description,
            swapKeyword: swapKeyword,
            swapMode: swapKeyword ? swapMode : 'token'
          });
          existingNamesLower.add(name.toLowerCase());
          added++;
        });

        saveSnippets(updated, () => {
          close();
          refreshSnippetsDisplay();
          alert(`Import complete.\n\nAdded: ${added}\nSkipped (identical): ${skipped}\nInvalid: ${invalid}\nKeyword removed (conflict): ${swapKeywordRemoved}`);
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
    const importBtn = document.querySelector('gem-snippets .gem-import-snippets-btn');
    const exportBtn = document.querySelector('gem-snippets .gem-export-snippets-btn');

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

      // Set up category collapse/expand toggles
      setupSnippetCategoryCollapseToggles();

      // Set up search box filtering
      setupSnippetsSearch();

      // Set up dropdown filter
      setupSnippetsFilterSelect();
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

          // Remove the gem-snippets element from the DOM
          const snippetList = document.querySelector('gem-snippets');
          if (snippetList) {
            snippetList.remove();
            console.log("[Gem] Removed gem-snippets from DOM");
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
      addButton.addEventListener('click', () => openSnippetEditor(null));
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
          openSnippetEditor(snippetId);
        }
      });
    });
    console.log("[Gem] Edit snippet button handlers attached");
  }

  // ------------------------------------------------------------
  // Prefer Emarsys' ESL modal (if available) for Add/Edit
  // ------------------------------------------------------------

  const GEM_EMARSYS_ESL_TRIGGER_SELECTOR = '[aria-label="Insert Emarsys Scripting Language snippet"] button';
  const GEM_EMARSYS_ESL_NAME_INPUT_ID = 'cbp-esl-token-dialog-input-name';
  const GEM_EMARSYS_CATEGORY_INPUT_ID = 'gem-esl-category-input';
  const GEM_EMARSYS_DESCRIPTION_INPUT_ID = 'gem-esl-description-input';
  const GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID = 'gem-esl-swap-keyword-input';
  const GEM_EMARSYS_SWAP_MODE_SELECT_ID = 'gem-esl-swap-mode-select';

  // Tracks whether a currently-opening Emarsys modal was initiated by our Snippets panel
  let gemPendingEmarsysEslContext = null;
  let gemEmarsysEslObserver = null;

  function openSnippetEditor(snippetId = null) {
    // Try Emarsys modal first; fallback to our modal.
    if (snippetId) {
      getSnippets((snippets) => {
        const snippet = snippets.find(s => s.id === snippetId);
        if (!snippet) return openSnippetModal(snippetId);

        const opened = tryOpenEmarsysEslModal({
          mode: 'edit',
          snippetId,
          favorite: !!snippet.favorite,
          category: snippet.category || '',
          name: snippet.name,
          content: snippet.content,
          description: snippet.description || '',
          swapKeyword: snippet.swapKeyword || '',
          swapMode: snippet.swapMode === 'plain' ? 'plain' : 'token'
        });
        if (!opened) openSnippetModal(snippetId);
      });
      return;
    }

    const opened = tryOpenEmarsysEslModal({
      mode: 'add',
      snippetId: null,
      favorite: false,
      category: '',
      name: '',
      content: '',
      description: '',
      swapKeyword: '',
      swapMode: 'token'
    });
    if (!opened) openSnippetModal(null);
  }

  function tryOpenEmarsysEslModal(context) {
    const triggerBtn = document.querySelector(GEM_EMARSYS_ESL_TRIGGER_SELECTOR);
    if (!triggerBtn) return false;

    gemPendingEmarsysEslContext = {
      ...context,
      startedAt: Date.now()
    };

    // Watch for Emarsys dialog nodes to appear *after* our click
    ensureEmarsysEslObserver();

    // IMPORTANT:
    // If the user currently has focus on an existing snippet/token in the editor,
    // Emarsys may pre-populate the dialog from that focused context.
    //
    // However, fully "clearing" selection can sometimes cause TinyMCE to hit a null-selection path.
    // So we keep the selection valid by focusing the iframe and collapsing the caret to the end.
    try {
      const iframe = getGemSnippetTargetIframe();
      const iframeWin = iframe?.contentWindow;
      const iframeDoc = iframe?.contentDocument || iframeWin?.document;

      if (iframe) iframe.focus();
      if (iframeWin && iframeWin.focus) iframeWin.focus();

      if (iframeDoc && iframeDoc.body && iframeDoc.getSelection) {
        const sel = iframeDoc.getSelection();
        if (sel && typeof sel.removeAllRanges === 'function' && typeof sel.addRange === 'function') {
          const range = iframeDoc.createRange();
          range.selectNodeContents(iframeDoc.body);
          range.collapse(false); // end of body
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    } catch (_) {}

    try {
      triggerBtn.click();
      return true;
    } catch (err) {
      console.warn('[Gem] Failed to open Emarsys ESL modal, falling back to Gem modal:', err);
      gemPendingEmarsysEslContext = null;
      return false;
    }
  }

  function ensureEmarsysEslObserver() {
    if (gemEmarsysEslObserver) return;

    gemEmarsysEslObserver = new MutationObserver(() => {
      // Only act if we initiated the dialog recently
      if (!gemPendingEmarsysEslContext) return;
      if (Date.now() - gemPendingEmarsysEslContext.startedAt > 8000) {
        gemPendingEmarsysEslContext = null;
        return;
      }

      const nameInput = document.getElementById(GEM_EMARSYS_ESL_NAME_INPUT_ID);
      if (!nameInput) return;

      // Found the Emarsys ESL dialog - patch it once
      patchEmarsysEslDialog(nameInput, gemPendingEmarsysEslContext);
      gemPendingEmarsysEslContext = null;
    });

    gemEmarsysEslObserver.observe(document.body, { childList: true, subtree: true });
  }

  function patchEmarsysEslDialog(nameInputEl, context) {
    // Find the dialog container scope so we only touch this specific dialog instance.
    const dialogRoot =
      nameInputEl.closest('.e-dialog__container') ||
      nameInputEl.closest('.e-dialog') ||
      nameInputEl.closest('[role="dialog"]') ||
      document.body;

    // Guard: only patch once
    if (dialogRoot.dataset && dialogRoot.dataset.gemPatchedEslDialog === 'true') return;
    if (dialogRoot.dataset) dialogRoot.dataset.gemPatchedEslDialog = 'true';

    // Inject name (if editing)
    if (typeof context.name === 'string') {
      nameInputEl.value = context.name;
      nameInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      nameInputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Inject/ensure our extra fields (Category above Name, Description below Code)
    ensureGemFieldsInEmarsysDialog(dialogRoot, context);

    // Inject code into CodeMirror, but do it AFTER Emarsys finishes its own initialization.
    // Otherwise the dialog can end up with "focused token code" + our injected code appended.
    if (typeof context.content === 'string') {
      setEmarsysDialogCode(dialogRoot, context.content);
    }

    // Replace the footer buttons ONLY for the dialog we opened via our Snippets panel.
    // We look for the specific Emarsys footer structure and then swap its buttons.
    const buttonGroup = Array.from(dialogRoot.querySelectorAll('.e-buttongroup')).find((bg) => {
      const cancel = bg.querySelector('button.cancel-btn[type="reset"]');
      const ok = bg.querySelector('button.e-btn-primary[type="submit"]');
      return !!cancel && !!ok;
    });

    if (!buttonGroup) return;

    // Remove Emarsys Cancel/OK buttons in this specific dialog instance
    const emarsysCancel = buttonGroup.querySelector('button.cancel-btn[type="reset"]');
    const emarsysOk = buttonGroup.querySelector('button.e-btn-primary[type="submit"]');
    if (emarsysCancel) emarsysCancel.remove();
    if (emarsysOk) emarsysOk.remove();

    // Add our Cancel/Save (+ Delete when editing) + Favorite toggle
    const gemCancel = document.createElement('button');
    gemCancel.className = 'e-btn';
    gemCancel.type = 'button';
    gemCancel.textContent = 'Cancel';

    const gemFavBtn = document.createElement('button');
    gemFavBtn.className = 'e-btn e-btn-borderless e-btn-onlyicon';
    gemFavBtn.type = 'button';
    gemFavBtn.title = 'Toggle favorite';
    gemFavBtn.setAttribute('aria-label', 'Toggle favorite');
    gemFavBtn.style.minWidth = 'unset';
    gemFavBtn.style.padding = '0 8px';

    const favIcon = document.createElement('span');
    favIcon.style.fontSize = '16px';
    favIcon.style.lineHeight = '1';
    favIcon.textContent = context?.favorite ? '★' : '☆';
    gemFavBtn.appendChild(favIcon);

    gemFavBtn.addEventListener('click', () => {
      const isFav = dialogRoot.dataset.gemFavorite === 'true';
      const next = !isFav;
      dialogRoot.dataset.gemFavorite = next ? 'true' : 'false';
      favIcon.textContent = next ? '★' : '☆';
    });

    let gemDelete = null;
    if (context && context.mode === 'edit' && context.snippetId) {
      gemDelete = document.createElement('button');
      gemDelete.className = 'e-btn e-btn-danger';
      gemDelete.type = 'button';
      gemDelete.textContent = 'Delete';
      gemDelete.addEventListener('click', () => {
        handleSnippetDeleteFromEmarsysDialog(context.snippetId, dialogRoot);
      });
    }

    const gemOk = document.createElement('button');
    gemOk.className = 'e-btn e-btn-primary';
    gemOk.type = 'button';
    gemOk.textContent = 'Save';

    gemCancel.addEventListener('click', () => {
      closeEmarsysDialog(dialogRoot);
    });

    gemOk.addEventListener('click', () => {
      const currentNameInput = dialogRoot.querySelector(`#${GEM_EMARSYS_ESL_NAME_INPUT_ID}`);
      const name = currentNameInput ? currentNameInput.value.trim() : '';
      const category = (dialogRoot.querySelector(`#${GEM_EMARSYS_CATEGORY_INPUT_ID}`)?.value || '').trim();
      const description = (dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)?.value || '').trim();
      const favorite = dialogRoot.dataset.gemFavorite === 'true';
      const swapKeyword = (dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID}`)?.value || '').trim();
      const swapMode = (dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_MODE_SELECT_ID}`)?.value === 'plain') ? 'plain' : 'token';

      // Read code from CodeMirror robustly. The hidden textarea inside CodeMirror
      // does NOT reliably contain the editor value, so we retry and fall back.
      gemOk.disabled = true;
      readEmarsysDialogCode(dialogRoot)
        .then((code) => {
          gemOk.disabled = false;
          handleSnippetSaveFromValues({ favorite, category, name, code: code.trim(), description, swapKeyword, swapMode }, context.snippetId, dialogRoot);
        })
        .catch(() => {
          gemOk.disabled = false;
          handleSnippetSaveFromValues({ favorite, category, name, code: '', description, swapKeyword, swapMode }, context.snippetId, dialogRoot);
        });
    });

    // Initialize favorite state from context
    dialogRoot.dataset.gemFavorite = context?.favorite ? 'true' : 'false';

    // Layout: Favorite/Delete on the left, Cancel/Save on the right (to avoid accidental clicks)
    buttonGroup.style.display = 'flex';
    buttonGroup.style.alignItems = 'center';
    buttonGroup.style.width = '100%';
    buttonGroup.style.justifyContent = 'space-between';

    const leftActions = document.createElement('div');
    leftActions.style.display = 'flex';
    leftActions.style.gap = '10px';

    const rightActions = document.createElement('div');
    rightActions.style.display = 'flex';
    rightActions.style.gap = '10px';
    rightActions.style.marginLeft = 'auto';

    // Clear any remaining nodes (we already removed Emarsys buttons, but this is defensive)
    buttonGroup.innerHTML = '';

    leftActions.appendChild(gemFavBtn);
    if (gemDelete) leftActions.appendChild(gemDelete);
    rightActions.appendChild(gemCancel);
    rightActions.appendChild(gemOk);

    buttonGroup.appendChild(leftActions);
    buttonGroup.appendChild(rightActions);
  }

  function ensureGemFieldsInEmarsysDialog(dialogRoot, context) {
    // Category field (above the name input)
    const nameInput = dialogRoot.querySelector(`#${GEM_EMARSYS_ESL_NAME_INPUT_ID}`);
    if (nameInput && !dialogRoot.querySelector(`#${GEM_EMARSYS_CATEGORY_INPUT_ID}`)) {
      const categoryField = document.createElement('div');
      categoryField.className = 'e-field';
      categoryField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_CATEGORY_INPUT_ID}">Category</label>
        <input class="e-input" id="${GEM_EMARSYS_CATEGORY_INPUT_ID}" type="text" placeholder="Optional category">
      `.trim();

      const nameField = nameInput.closest('.e-field') || nameInput.parentElement;
      if (nameField && nameField.parentElement) {
        nameField.parentElement.insertBefore(categoryField, nameField);
      }
    }

    // Description field (below the code editor)
    if (!dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)) {
      const descriptionField = document.createElement('div');
      descriptionField.className = 'e-field';
      descriptionField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_DESCRIPTION_INPUT_ID}">Description</label>
        <textarea class="e-input gem-scrollable" id="${GEM_EMARSYS_DESCRIPTION_INPUT_ID}" placeholder="Optional description" style="background:var(--token-input-default-background); width: 100%; min-height: 100px; resize: vertical; padding: 10px 12px;"></textarea>
      `.trim();

      // Place right after the html editor / codemirror container if present
      const editorContainer =
        dialogRoot.querySelector('vce-html-editor') ||
        dialogRoot.querySelector('vce-codemirror') ||
        dialogRoot.querySelector('.CodeMirror')?.closest('.e-field') ||
        dialogRoot.querySelector('.CodeMirror') ||
        null;

      if (editorContainer && editorContainer.parentElement) {
        editorContainer.insertAdjacentElement('afterend', descriptionField);
      } else {
        // Fallback: append near end of dialog content
        const content = dialogRoot.querySelector('.e-dialog__content') || dialogRoot;
        content.appendChild(descriptionField);
      }
    }

    // Swap Keyword + Mode fields (below Description)
    if (!dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID}`)) {
      const swapKeywordField = document.createElement('div');
      swapKeywordField.className = 'e-field';
      swapKeywordField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID}">Optional Keyword for Swapping</label>
        <input class="e-input" id="${GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID}" type="text" placeholder="Optional keyword (must be unique)">
      `.trim();

      const descField = dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`)?.closest('.e-field');
      if (descField && descField.parentElement) {
        descField.insertAdjacentElement('afterend', swapKeywordField);
      } else {
        const content = dialogRoot.querySelector('.e-dialog__content') || dialogRoot;
        content.appendChild(swapKeywordField);
      }
    }

    if (!dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_MODE_SELECT_ID}`)) {
      const swapModeField = document.createElement('div');
      swapModeField.className = 'e-field';
      swapModeField.innerHTML = `
        <label class="e-field__label e-field__label-inline" for="${GEM_EMARSYS_SWAP_MODE_SELECT_ID}">Swap Snippet As</label>
        <select class="e-input" id="${GEM_EMARSYS_SWAP_MODE_SELECT_ID}">
          <option value="token">Swap as ESL Token</option>
          <option value="plain">Swap as Plain Text</option>
        </select>
      `.trim();

      const swapKeywordField = dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID}`)?.closest('.e-field');
      if (swapKeywordField && swapKeywordField.parentElement) {
        swapKeywordField.insertAdjacentElement('afterend', swapModeField);
      } else {
        const content = dialogRoot.querySelector('.e-dialog__content') || dialogRoot;
        content.appendChild(swapModeField);
      }
    }

    // Populate values (for edit mode)
    const categoryInput = dialogRoot.querySelector(`#${GEM_EMARSYS_CATEGORY_INPUT_ID}`);
    if (categoryInput && typeof context.category === 'string') {
      categoryInput.value = context.category;
      categoryInput.dispatchEvent(new Event('input', { bubbles: true }));
      categoryInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const descInput = dialogRoot.querySelector(`#${GEM_EMARSYS_DESCRIPTION_INPUT_ID}`);
    if (descInput && typeof context.description === 'string') {
      descInput.value = context.description;
      descInput.dispatchEvent(new Event('input', { bubbles: true }));
      descInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const swapKeywordInput = dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_KEYWORD_INPUT_ID}`);
    if (swapKeywordInput && typeof context.swapKeyword === 'string') {
      swapKeywordInput.value = context.swapKeyword;
      swapKeywordInput.dispatchEvent(new Event('input', { bubbles: true }));
      swapKeywordInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const swapModeSelect = dialogRoot.querySelector(`#${GEM_EMARSYS_SWAP_MODE_SELECT_ID}`);
    if (swapModeSelect) {
      swapModeSelect.value = (context.swapMode === 'plain' ? 'plain' : 'token');
      swapModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function setEmarsysDialogCode(dialogRoot, desiredCode) {
    const maxAttempts = 12; // ~1.2s total
    let attempt = 0;

    const apply = () => {
      attempt++;

      const cmEl = dialogRoot.querySelector('.CodeMirror');
      const cmInstance = cmEl && cmEl.CodeMirror;
      if (cmInstance && typeof cmInstance.setValue === 'function' && typeof cmInstance.getValue === 'function') {
        // Hard replace to guarantee no concatenation.
        cmInstance.setValue('');
        cmInstance.setValue(desiredCode);

        // If Emarsys runs another async setValue shortly after, we may need one more pass.
        if (cmInstance.getValue() === desiredCode) {
          return;
        }
      } else {
        // Fallback: underlying textarea (may exist before CodeMirror fully binds)
        const cmTextarea = dialogRoot.querySelector('.CodeMirror textarea');
        if (cmTextarea) {
          cmTextarea.value = '';
          cmTextarea.value = desiredCode;
          cmTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          cmTextarea.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }

      if (attempt < maxAttempts) {
        setTimeout(apply, 100);
      }
    };

    // Start shortly after patching so Emarsys has time to populate its defaults/context.
    setTimeout(apply, 50);
  }

  function tryExtractEmarsysDialogCodeOnce(dialogRoot) {
    // 1) Direct CodeMirror instance on wrapper
    const cmEl = dialogRoot.querySelector('.CodeMirror');
    const cmInstance = cmEl && cmEl.CodeMirror;
    if (cmInstance && typeof cmInstance.getValue === 'function') {
      return cmInstance.getValue();
    }

    // 2) vce-codemirror element sometimes stores the instance
    const vceCm = dialogRoot.querySelector('vce-codemirror');
    if (vceCm) {
      const candidates = [
        vceCm.CodeMirror,
        vceCm.codemirror,
        vceCm.codeMirror,
        vceCm.editor,
        vceCm._editor,
        vceCm._codemirror
      ];
      for (const c of candidates) {
        if (c && typeof c.getValue === 'function') {
          return c.getValue();
        }
      }
    }

    // 3) DOM fallback: read rendered lines
    if (cmEl) {
      const pres = cmEl.querySelectorAll('pre.CodeMirror-line');
      if (pres && pres.length) {
        const lines = Array.from(pres).map((pre) => (pre.textContent || '').replace(/\u200B/g, ''));
        const joined = lines.join('\n');
        return joined;
      }
      const codeContainer = cmEl.querySelector('.CodeMirror-code');
      if (codeContainer) {
        return (codeContainer.textContent || '').replace(/\u200B/g, '');
      }
    }

    return '';
  }

  function readEmarsysDialogCode(dialogRoot) {
    // Emarsys can still be mid-initialization; retry briefly so we don't treat
    // a non-empty editor as empty and throw "Please enter snippet code."
    const maxAttempts = 10;
    let attempt = 0;

    return new Promise((resolve) => {
      const tick = () => {
        attempt++;
        const code = tryExtractEmarsysDialogCodeOnce(dialogRoot);
        if (code && code.trim().length > 0) {
          resolve(code);
          return;
        }
        if (attempt >= maxAttempts) {
          resolve(code || '');
          return;
        }
        setTimeout(tick, 75);
      };
      tick();
    });
  }

  function closeEmarsysDialog(dialogRoot) {
    // Try common close button patterns
    const closeBtn =
      dialogRoot.querySelector('button.e-dialog__close') ||
      dialogRoot.querySelector('[aria-label="Close Dialog"] button') ||
      dialogRoot.querySelector('button[aria-label="Close"]');

    if (closeBtn) {
      closeBtn.click();
      return;
    }

    // Fallback: ESC key
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function handleSnippetSaveFromValues(values, editingSnippetId = null, dialogRoot = null) {
    const category = (values?.category || '').trim();
    const name = (values?.name || '').trim();
    const code = (values?.code || '').trim();
    const description = (values?.description || '').trim();
    const favorite = !!values?.favorite;
    const swapKeywordRaw = (values?.swapKeyword || '').trim();
    const swapMode = (values?.swapMode === 'plain') ? 'plain' : 'token';

    if (!name) {
      alert('Please enter a snippet name.');
      return;
    }
    if (!code) {
      alert('Please enter snippet code.');
      return;
    }

    getSnippets((snippets) => {
      // Enforce unique swap keyword (case-insensitive) across all snippets.
      if (swapKeywordRaw) {
        const keyLower = swapKeywordRaw.toLowerCase();
        const conflict = snippets.find(s =>
          (s.swapKeyword || '').trim().toLowerCase() === keyLower &&
          (!editingSnippetId || s.id !== editingSnippetId)
        );
        if (conflict) {
          alert(`The swap keyword "${swapKeywordRaw}" is already used by another snippet. Please choose a unique keyword.`);
          return;
        }
      }

      if (editingSnippetId) {
        const updatedSnippets = snippets.map(snippet =>
          snippet.id === editingSnippetId
            ? { ...snippet, favorite, category, name: name, content: code, description, swapKeyword: swapKeywordRaw, swapMode: swapKeywordRaw ? swapMode : 'token' }
            : snippet
        );
        saveSnippets(updatedSnippets, () => {
          refreshSnippetsDisplay();
          if (dialogRoot) closeEmarsysDialog(dialogRoot);
        });
      } else {
        const newSnippet = {
          id: `snippet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          favorite,
          category,
          name,
          content: code,
          description,
          swapKeyword: swapKeywordRaw,
          swapMode: swapKeywordRaw ? swapMode : 'token'
        };
        saveSnippets([...snippets, newSnippet], () => {
          refreshSnippetsDisplay();
          if (dialogRoot) closeEmarsysDialog(dialogRoot);
        });
      }
    });
  }

  function handleSnippetDeleteFromEmarsysDialog(snippetId, dialogRoot) {
    const confirmed = confirm('Are you sure you want to delete this snippet? This action cannot be undone.');
    if (!confirmed) return;

    getSnippets((snippets) => {
      const updatedSnippets = snippets.filter(snippet => snippet.id !== snippetId);
      saveSnippets(updatedSnippets, () => {
        refreshSnippetsDisplay();
        if (dialogRoot) closeEmarsysDialog(dialogRoot);
      });
    });
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
            const categoryInput = document.getElementById('gem-snippet-category-input');
            const nameInput = document.getElementById('gem-snippet-name-input');
            const codeInput = document.getElementById('gem-snippet-code-input');
            const descInput = document.getElementById('gem-snippet-description-input');
            const swapKeywordInput = document.getElementById('gem-snippet-swap-keyword-input');
            const swapModeSelect = document.getElementById('gem-snippet-swap-mode-select');
            const favBtn = document.getElementById('gem-modal-favorite-btn');

            if (categoryInput) categoryInput.value = snippet.category || '';
            if (nameInput) {
              nameInput.value = snippet.name;
              nameInput.focus();
              nameInput.select();
            }
            if (codeInput) {
              codeInput.value = snippet.content;
            }
            if (descInput) descInput.value = snippet.description || '';
            if (swapKeywordInput) swapKeywordInput.value = snippet.swapKeyword || '';
            if (swapModeSelect) swapModeSelect.value = (snippet.swapMode === 'plain' ? 'plain' : 'token');
            if (favBtn) setGemModalFavoriteState(!!snippet.favorite);
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
        const swapKeywordInput = document.getElementById('gem-snippet-swap-keyword-input');
        const swapModeSelect = document.getElementById('gem-snippet-swap-mode-select');
        if (swapKeywordInput) swapKeywordInput.value = '';
        if (swapModeSelect) swapModeSelect.value = 'token';
        setGemModalFavoriteState(false);
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

    // Favorite button
    const favBtn = document.getElementById('gem-modal-favorite-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        setGemModalFavoriteState(!getGemModalFavoriteState());
      });
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

  function getGemModalFavoriteState() {
    const modal = document.getElementById('gem-snippet-modal');
    return modal?.dataset?.gemFavorite === 'true';
  }

  function setGemModalFavoriteState(isFav) {
    const modal = document.getElementById('gem-snippet-modal');
    const icon = document.getElementById('gem-modal-favorite-icon');
    if (modal && modal.dataset) modal.dataset.gemFavorite = isFav ? 'true' : 'false';
    if (icon) icon.textContent = isFav ? '★' : '☆';
  }

  // Function to handle saving a snippet (create or update)
  function handleSnippetSave(editingSnippetId = null) {
    const categoryInput = document.getElementById('gem-snippet-category-input');
    const nameInput = document.getElementById('gem-snippet-name-input');
    const codeInput = document.getElementById('gem-snippet-code-input');
    const descInput = document.getElementById('gem-snippet-description-input');
    const swapKeywordInput = document.getElementById('gem-snippet-swap-keyword-input');
    const swapModeSelect = document.getElementById('gem-snippet-swap-mode-select');

    if (!nameInput || !codeInput) {
      console.log("[Gem] Modal inputs not found");
      return;
    }

    const category = categoryInput ? categoryInput.value.trim() : '';
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    const description = descInput ? descInput.value.trim() : '';
    const favorite = getGemModalFavoriteState();
    const swapKeywordRaw = swapKeywordInput ? swapKeywordInput.value.trim() : '';
    const swapMode = swapModeSelect && swapModeSelect.value === 'plain' ? 'plain' : 'token';

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

    getSnippets((snippets) => {
      // Enforce unique swap keyword (case-insensitive) across all snippets.
      if (swapKeywordRaw) {
        const keyLower = swapKeywordRaw.toLowerCase();
        const conflict = snippets.find(s =>
          (s.swapKeyword || '').trim().toLowerCase() === keyLower &&
          (!editingSnippetId || s.id !== editingSnippetId)
        );
        if (conflict) {
          alert(`The swap keyword "${swapKeywordRaw}" is already used by another snippet. Please choose a unique keyword.`);
          swapKeywordInput && swapKeywordInput.focus();
          swapKeywordInput && swapKeywordInput.select && swapKeywordInput.select();
          return;
        }
      }

      if (editingSnippetId) {
        // Update existing snippet
        const updatedSnippets = snippets.map(snippet =>
          snippet.id === editingSnippetId
            ? { ...snippet, favorite, category: category, name: name, content: code, description: description, swapKeyword: swapKeywordRaw, swapMode: swapKeywordRaw ? swapMode : 'token' }
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
          favorite,
          category: category,
          name: name,
          content: code,
          description: description,
          swapKeyword: swapKeywordRaw,
          swapMode: swapKeywordRaw ? swapMode : 'token'
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
    const snippetsContent = navContent.querySelector('gem-snippets .e-section__content');
    if (!snippetsContent) return;

    // Re-render the snippets tables (grouped by category)
    getSnippets((snippets) => {
      getSnippetCategoryCollapseState((collapseState) => {
        const root = navContent.querySelector('gem-snippets');
        const currentSearch = root?.querySelector('#gem-snippet-search-input')?.value || '';
        const currentFilterMode = root?.dataset?.gemSnippetFilterMode || root?.querySelector('#gem-snippet-filter-select')?.value || 'showAll';
        let tablesContainer = snippetsContent.querySelector('.gem-snippets-tables');
        if (!tablesContainer) {
          tablesContainer = document.createElement('div');
          tablesContainer.className = 'gem-snippets-tables';
          // Insert at the top of the content area
          snippetsContent.insertAdjacentElement('afterbegin', tablesContainer);
        }

        tablesContainer.innerHTML = renderSnippetsTablesHTML(snippets, collapseState);

        // Re-setup drag and drop and edit buttons for the new snippets
        setupSnippetDragAndDrop();
        setupEditSnippetButtons();
        setupSnippetCategoryCollapseToggles();
        setupSnippetsSearch();
        setupSnippetsFilterSelect();

        // Re-apply current search after re-render
        if (root && currentSearch) {
          const input = root.querySelector('#gem-snippet-search-input');
          if (input) input.value = currentSearch;
        }

        // Re-apply filter mode after re-render
        if (root) {
          root.dataset.gemSnippetFilterMode = currentFilterMode;
        }

        // Apply combined filters (search + dropdown)
        if (root) {
          applySnippetSearchFilter(root, currentSearch);
        }
      });
    });
  }

  // Function to set up drag and drop for snippets
  function setupSnippetDragAndDrop() {
    console.log("[Gem] Setting up snippet drag and drop");

    // Find all draggable snippet elements
    const snippetElements = document.querySelectorAll('gem-snippets [draggable="true"]');

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
  console.log("[Gem] DEBUG: Snippets content:", document.querySelector('gem-snippets'));
  console.log("[Gem] DEBUG: Add snippet button:", document.querySelector('.gem-add-snippet-btn'));
  console.log("[Gem] DEBUG: Modal:", document.querySelector('#gem-snippet-modal'));
  console.log("[Gem] DEBUG: Iframe:", document.querySelector('.e-contentblocks-preview__iframe-desktop'));

  // Count current snippets in DOM
  const currentSnippets = document.querySelectorAll('gem-snippets span[e-token="cust_esl"]');
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