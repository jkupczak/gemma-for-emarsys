// compare-esl-usage.js — ESL / token usage matrix for compare dialog
(function () {
  'use strict';

  const common = window.gemComparePreviewCommon;
  if (!common) return;

  const PLAIN_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M560-160v-80h120q17 0 28.5-11.5T720-280v-80q0-38 22-69t58-44v-14q-36-13-58-44t-22-69v-80q0-17-11.5-28.5T680-720H560v-80h120q50 0 85 35t35 85v80q0 17 11.5 28.5T840-560h40v160h-40q-17 0-28.5 11.5T800-360v80q0 50-35 85t-85 35H560Zm-280 0q-50 0-85-35t-35-85v-80q0-17-11.5-28.5T120-400H80v-160h40q17 0 28.5-11.5T160-600v-80q0-50 35-85t85-35h120v80H280q-17 0-28.5 11.5T240-680v80q0 38-22 69t-58 44v14q36 13 58 44t22 69v80q0 17 11.5 28.5T280-240h120v80H280Z"/></svg>';

  const GEMMA_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M480-80 120-436l200-244h320l200 244L480-80ZM183-680l-85-85 57-56 85 85-57 56Zm257-80v-120h80v120h-80Zm335 80-57-57 85-85 57 57-85 85ZM480-192l210-208H270l210 208ZM358-600l-99 120h442l-99-120H358Z"/></svg>';

  const PREDEFINED_PERS_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M234-276q51-39 114-61.5T480-360q69 0 132 22.5T726-276q35-41 54.5-93T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 59 19.5 111t54.5 93Zm146.5-204.5Q340-521 340-580t40.5-99.5Q421-720 480-720t99.5 40.5Q620-639 620-580t-40.5 99.5Q539-440 480-440t-99.5-40.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm100-95.5q47-15.5 86-44.5-39-29-86-44.5T480-280q-53 0-100 15.5T294-220q39 29 86 44.5T480-160q53 0 100-15.5ZM523-537q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm-43-43Zm0 360Z"/></svg>';

  const CUSTOM_PERS_TYPE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M410-120v-238L204-239l-70-121 206-120-206-119 70-121 206 119v-239h140v239l206-119 70 121-206 119 206 120-70 121-206-119v238H410Z"/></svg>';

  const PRESENTATION_ORDER = ['plain', 'gemma', 'pers_predefined', 'pers_custom'];
  const EDITABILITY_FILTER_KEY = 'gemCompareEslEditabilityFilter';
  const GROUPING_VIEW_KEY = 'gemCompareEslGroupingView';
  const HIDDEN_SCRIPTS_KEY = 'gemCompareEslHiddenScripts';
  const DEFAULT_EDITABILITY_FILTER = 'editable';
  const DEFAULT_GROUPING_VIEW = 'by-location';
  const ROW_MENU_WRAP_CLASS = 'gem-overflow-menu-wrap gem-compare-esl-usage__row-menu-wrap';
  const LOCATION_ORDER = ['subject', 'preview', 'body', 'alt'];
  const LOCATION_LABELS = {
    subject: 'Subject Line',
    preview: 'Preview Text',
    body: 'Body',
    alt: 'Image ALT Text',
  };

  let editabilityFilter = DEFAULT_EDITABILITY_FILTER;
  let groupingView = DEFAULT_GROUPING_VIEW;
  let hiddenScriptKeys = new Set();
  let editabilityStorageListenerBound = false;
  let groupingStorageListenerBound = false;
  let hiddenScriptsStorageListenerBound = false;
  let eslTableRefreshTimer = null;
  let eslTableRefreshModal = null;

  function normalizeScriptKey(script) {
    const normalize = typeof window.gemNormalizeEslScriptKey === 'function'
      ? window.gemNormalizeEslScriptKey
      : (value) => String(value ?? '');
    return normalize(script);
  }

  function isScriptHidden(normKey) {
    return hiddenScriptKeys.has(String(normKey || ''));
  }

  function isShowingHiddenTemporarily(modal) {
    return modal?.dataset?.gemEslShowHidden === 'true';
  }

  function setShowingHiddenTemporarily(modal, show) {
    if (!modal) return;
    if (show) {
      modal.dataset.gemEslShowHidden = 'true';
    } else {
      delete modal.dataset.gemEslShowHidden;
    }
  }

  function loadHiddenScripts(callback) {
    if (!chrome?.storage?.sync) {
      hiddenScriptKeys = new Set();
      if (callback) callback();
      return;
    }
    chrome.storage.sync.get({ [HIDDEN_SCRIPTS_KEY]: [] }, (res) => {
      const raw = Array.isArray(res[HIDDEN_SCRIPTS_KEY]) ? res[HIDDEN_SCRIPTS_KEY] : [];
      hiddenScriptKeys = new Set(raw.map((value) => String(value ?? '')).filter(Boolean));
      if (callback) callback();
    });
  }

  function persistHiddenScripts() {
    if (!chrome?.storage?.sync) return;
    chrome.storage.sync.set({ [HIDDEN_SCRIPTS_KEY]: [...hiddenScriptKeys] });
  }

  function hideScript(normKey) {
    const key = String(normKey || '').trim();
    if (!key || hiddenScriptKeys.has(key)) return;
    hiddenScriptKeys.add(key);
    persistHiddenScripts();
    refreshCompareEslUsageTable();
  }

  function unhideScript(normKey) {
    const key = String(normKey || '').trim();
    if (!key || !hiddenScriptKeys.has(key)) return;
    hiddenScriptKeys.delete(key);
    persistHiddenScripts();
    refreshCompareEslUsageTable();
  }

  function ensureHiddenScriptsStorageListener() {
    if (hiddenScriptsStorageListenerBound || !chrome?.storage?.onChanged) return;
    hiddenScriptsStorageListenerBound = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[HIDDEN_SCRIPTS_KEY]) return;
      const raw = Array.isArray(changes[HIDDEN_SCRIPTS_KEY].newValue)
        ? changes[HIDDEN_SCRIPTS_KEY].newValue
        : [];
      hiddenScriptKeys = new Set(raw.map((value) => String(value ?? '')).filter(Boolean));
      refreshCompareEslUsageTable();
    });
  }

  function countHiddenScriptsInMatrix(matrix) {
    return matrix.rows.reduce((count, row) => (
      isScriptHidden(row.normKey) ? count + 1 : count
    ), 0);
  }

  function filterMatrixRows(matrix, modal) {
    if (isShowingHiddenTemporarily(modal)) return matrix;
    return {
      ...matrix,
      rows: matrix.rows.filter((row) => !isScriptHidden(row.normKey)),
    };
  }

  function renderHiddenScriptsBanner(hiddenCount, modal) {
    if (!hiddenCount) return '';

    const showingHidden = isShowingHiddenTemporarily(modal);
    const label = showingHidden
      ? (hiddenCount === 1
        ? '1 hidden script is being shown'
        : `${hiddenCount} hidden scripts are being shown`)
      : (hiddenCount === 1
        ? '1 script is being hidden'
        : `${hiddenCount} scripts are being hidden`);
    const buttonLabel = showingHidden ? 'Hide Scripts' : 'Show All';
    const bannerClass = showingHidden
      ? 'gem-compare-esl-usage__hidden-banner gem-compare-esl-usage__hidden-banner--showing-hidden'
      : 'gem-compare-esl-usage__hidden-banner';

    return `
      <div class="${bannerClass}">
        <span class="gem-compare-esl-usage__hidden-banner-text">${escapeHtml(label)}</span>
        <button type="button" class="e-btn gem-compare-esl-usage__hidden-banner-toggle">${escapeHtml(buttonLabel)}</button>
      </div>
    `.trim();
  }

  function bindEslRowOverflowMenus(tableWrap, modal) {
    if (!tableWrap || !common.createColumnOverflowMenu) return;

    tableWrap.querySelectorAll('[data-gem-esl-script-key]').forEach((cell) => {
      cell.textContent = '';
      const normKey = cell.getAttribute('data-gem-esl-script-key') || '';
      if (!normKey) return;

      const showingHidden = isShowingHiddenTemporarily(modal);
      const isHidden = isScriptHidden(normKey);
      const menuItems = isHidden && showingHidden
        ? [{ label: 'Unhide', onClick: () => unhideScript(normKey) }]
        : [{ label: 'Hide', onClick: () => hideScript(normKey) }];

      const menu = common.createColumnOverflowMenu('Script options', menuItems, {
        wrapClassName: ROW_MENU_WRAP_CLASS,
      });
      cell.appendChild(menu);
    });
  }

  function bindEslTableInteractions(tableWrap, modal) {
    if (!tableWrap) return;

    bindEslRowOverflowMenus(tableWrap, modal);

    const toggleBtn = tableWrap.querySelector('.gem-compare-esl-usage__hidden-banner-toggle');
    if (toggleBtn && !toggleBtn.dataset.gemBound) {
      toggleBtn.dataset.gemBound = 'true';
      toggleBtn.addEventListener('click', () => {
        setShowingHiddenTemporarily(modal, !isShowingHiddenTemporarily(modal));
        refreshCompareEslUsageTable(modal);
      });
    }
  }

  function normalizeGroupingView(value) {
    if (value === 'none' || value === 'by-location' || value === 'cell-breakdown') return value;
    return DEFAULT_GROUPING_VIEW;
  }

  function syncEslGroupingToggleUi(modal) {
    const target = modal || common.getCompareModal();
    if (!target) return;
    target.querySelectorAll('[data-gem-compare-esl-grouping]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-esl-grouping') === groupingView;
      btn.classList.toggle('gem-compare-languages-modal__esl-grouping-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setGroupingView(nextView, { persist = true, refresh = true } = {}) {
    const next = normalizeGroupingView(nextView);
    const changed = next !== groupingView;
    groupingView = next;
    syncEslGroupingToggleUi();
    if (persist && changed && chrome?.storage?.local) {
      chrome.storage.local.set({ [GROUPING_VIEW_KEY]: next });
    }
    if (refresh && changed) {
      refreshCompareEslUsageTable();
    }
  }

  function loadGroupingView(callback) {
    if (!chrome?.storage?.local) {
      groupingView = DEFAULT_GROUPING_VIEW;
      if (callback) callback();
      return;
    }
    chrome.storage.local.get({ [GROUPING_VIEW_KEY]: DEFAULT_GROUPING_VIEW }, (res) => {
      groupingView = normalizeGroupingView(res[GROUPING_VIEW_KEY]);
      if (callback) callback();
    });
  }

  function bindEslGroupingToggle(modal) {
    if (!modal || modal.dataset.gemCompareEslGroupingToggleBound === 'true') return;
    const toggle = modal.querySelector('.gem-compare-languages-modal__esl-grouping-toggle');
    if (!toggle) return;
    modal.dataset.gemCompareEslGroupingToggleBound = 'true';
    toggle.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest('[data-gem-compare-esl-grouping]');
      if (!btn || !toggle.contains(btn)) return;
      setGroupingView(btn.getAttribute('data-gem-compare-esl-grouping'));
    });
  }

  function ensureGroupingStorageListener() {
    if (groupingStorageListenerBound || !chrome?.storage?.onChanged) return;
    groupingStorageListenerBound = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[GROUPING_VIEW_KEY]) return;
      const next = normalizeGroupingView(changes[GROUPING_VIEW_KEY].newValue);
      if (next === groupingView) {
        syncEslGroupingToggleUi();
        return;
      }
      groupingView = next;
      syncEslGroupingToggleUi();
      refreshCompareEslUsageTable();
    });
  }

  function normalizeEditabilityFilter(value) {
    if (value === 'all' || value === 'editable' || value === 'non-editable') return value;
    return DEFAULT_EDITABILITY_FILTER;
  }

  function occurrenceMatchesEditabilityFilter(editable) {
    if (editabilityFilter === 'editable') return editable === true;
    if (editabilityFilter === 'non-editable') return editable !== true;
    return true;
  }

  function syncEslEditabilityToggleUi(modal) {
    const target = modal || common.getCompareModal();
    if (!target) return;
    target.querySelectorAll('[data-gem-compare-esl-editability]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-esl-editability') === editabilityFilter;
      btn.classList.toggle('gem-compare-languages-modal__esl-editability-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setEditabilityFilter(nextFilter, { persist = true, refresh = true } = {}) {
    const next = normalizeEditabilityFilter(nextFilter);
    const changed = next !== editabilityFilter;
    editabilityFilter = next;
    syncEslEditabilityToggleUi();
    if (persist && changed && chrome?.storage?.local) {
      chrome.storage.local.set({ [EDITABILITY_FILTER_KEY]: next });
    }
    if (refresh && changed) {
      refreshCompareEslUsageTable();
    }
  }

  function loadEditabilityFilter(callback) {
    if (!chrome?.storage?.local) {
      editabilityFilter = DEFAULT_EDITABILITY_FILTER;
      if (callback) callback();
      return;
    }
    chrome.storage.local.get({ [EDITABILITY_FILTER_KEY]: DEFAULT_EDITABILITY_FILTER }, (res) => {
      editabilityFilter = normalizeEditabilityFilter(res[EDITABILITY_FILTER_KEY]);
      if (callback) callback();
    });
  }

  function bindEslEditabilityToggle(modal) {
    if (!modal || modal.dataset.gemCompareEslEditabilityToggleBound === 'true') return;
    const toggle = modal.querySelector('.gem-compare-languages-modal__esl-editability-toggle');
    if (!toggle) return;
    modal.dataset.gemCompareEslEditabilityToggleBound = 'true';
    toggle.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest('[data-gem-compare-esl-editability]');
      if (!btn || !toggle.contains(btn)) return;
      setEditabilityFilter(btn.getAttribute('data-gem-compare-esl-editability'));
    });
  }

  function ensureEditabilityStorageListener() {
    if (editabilityStorageListenerBound || !chrome?.storage?.onChanged) return;
    editabilityStorageListenerBound = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[EDITABILITY_FILTER_KEY]) return;
      const next = normalizeEditabilityFilter(changes[EDITABILITY_FILTER_KEY].newValue);
      if (next === editabilityFilter) {
        syncEslEditabilityToggleUi();
        return;
      }
      editabilityFilter = next;
      syncEslEditabilityToggleUi();
      refreshCompareEslUsageTable();
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncateScript(script, maxLen) {
    const value = String(script || '');
    if (value.length <= maxLen) return value;
    return `${value.slice(0, maxLen - 1)}…`;
  }

  function createEmptyLocationCounts() {
    return {
      total: 0,
      plain: 0,
      gemma: 0,
      pers_predefined: 0,
      pers_custom: 0,
    };
  }

  function createEmptyCellCounts() {
    return {
      total: 0,
      plain: 0,
      gemma: 0,
      pers_predefined: 0,
      pers_custom: 0,
      byLocation: {
        subject: createEmptyLocationCounts(),
        preview: createEmptyLocationCounts(),
        body: createEmptyLocationCounts(),
        alt: createEmptyLocationCounts(),
      },
    };
  }

  function incrementCellCount(cell, presentation, location) {
    const presKey = PRESENTATION_ORDER.includes(presentation) ? presentation : 'plain';
    cell.total += 1;
    cell[presKey] += 1;
    const locKey = LOCATION_ORDER.includes(location) ? location : 'body';
    const locCell = cell.byLocation[locKey];
    if (locCell) {
      locCell.total += 1;
      locCell[presKey] += 1;
    }
  }

  function cloneCountSnapshot(counts) {
    const src = counts || createEmptyLocationCounts();
    return {
      total: src.total || 0,
      plain: src.plain || 0,
      gemma: src.gemma || 0,
      pers_predefined: src.pers_predefined || 0,
      pers_custom: src.pers_custom || 0,
    };
  }

  function getCellCountsForView(cell, locationKey) {
    if (!cell) return createEmptyLocationCounts();
    if (groupingView === 'by-location' && locationKey) {
      return cloneCountSnapshot(cell.byLocation?.[locationKey]);
    }
    return cloneCountSnapshot(cell);
  }

  function rowHasCountsInLocation(row, locationKey, columns) {
    return columns.some((col) => {
      const cell = row.columns.get(col.key);
      const counts = getCellCountsForView(cell, locationKey);
      return counts.total > 0;
    });
  }

  function getEntrySources(entry) {
    if (entry.eslSources) {
      return {
        bodyHtml: entry.eslSources.bodyHtml || '',
        subjectHtml: entry.eslSources.subjectHtml || '',
        preheaderText: entry.eslSources.preheaderText || '',
      };
    }
    return {
      bodyHtml: entry.bodyHtml || entry.html || '',
      subjectHtml: entry.subjectHtml || '',
      preheaderText: entry.preheaderText || '',
    };
  }

  function isEntryLoading(entry) {
    if (entry.pending) return true;
    if (entry.eslPending) return true;
    return false;
  }

  function extractOccurrencesForEntry(entry) {
    if (typeof window.gemExtractEslUsageFromEmail !== 'function') return [];
    return window.gemExtractEslUsageFromEmail(getEntrySources(entry));
  }

  function buildEslUsageMatrix(entries, { getEntryKey, getEntryLabel }) {
    const columns = entries.map((entry) => ({
      key: String(getEntryKey(entry) || '').trim(),
      label: String(getEntryLabel(entry) || '').trim(),
      loading: isEntryLoading(entry),
    }));

    const rowMap = new Map();

    entries.forEach((entry) => {
      const colKey = String(getEntryKey(entry) || '').trim();
      if (!colKey || isEntryLoading(entry)) return;

      extractOccurrencesForEntry(entry).forEach(({ script, presentation, editable, location }) => {
        if (!occurrenceMatchesEditabilityFilter(editable)) return;

        const normKey = normalizeScriptKey(script);
        if (!normKey) return;

        if (!rowMap.has(normKey)) {
          rowMap.set(normKey, { script: String(script ?? ''), normKey, columns: new Map() });
        }

        const row = rowMap.get(normKey);
        if (!row.columns.has(colKey)) {
          row.columns.set(colKey, createEmptyCellCounts());
        }

        incrementCellCount(row.columns.get(colKey), presentation, location);
      });
    });

    const rows = [...rowMap.values()]
      .filter((row) => {
        for (const cell of row.columns.values()) {
          if (cell && cell.total > 0) return true;
        }
        return false;
      })
      .sort((a, b) => (
        a.script.localeCompare(b.script, undefined, { sensitivity: 'base' })
      ));

    return { columns, rows };
  }

  function renderBreakdownChip(type, count) {
    if (!count) return '';

    let icon = PLAIN_TYPE_SVG;
    let label = 'Plain text script';
    if (type === 'gemma') {
      icon = GEMMA_TYPE_SVG;
      label = 'Gemma token';
    } else if (type === 'pers_predefined') {
      icon = PREDEFINED_PERS_TYPE_SVG;
      label = 'Predefined personalization token';
    } else if (type === 'pers_custom') {
      icon = CUSTOM_PERS_TYPE_SVG;
      label = 'Custom personalization token';
    }

    return `
      <span class="gem-compare-esl-usage__breakdown-chip" title="${escapeHtml(label)}">
        <span class="gem-compare-esl-usage__breakdown-icon gem-snippet-ctx-type-icon">${icon}</span>
        <span class="gem-compare-esl-usage__breakdown-count">${count}</span>
      </span>
    `.trim();
  }

  function renderLocationBreakdownTable(cell) {
    if (!cell?.byLocation) return '';

    const rows = LOCATION_ORDER.map((locationKey) => {
      const counts = cell.byLocation[locationKey] || createEmptyLocationCounts();
      return `
        <tr>
          <th scope="row" class="gem-compare-esl-usage__location-breakdown-label">${escapeHtml(LOCATION_LABELS[locationKey])}</th>
          <td class="gem-compare-esl-usage__location-breakdown-value">${counts.total}</td>
        </tr>
      `.trim();
    }).join('');

    return `
      <table class="gem-compare-esl-usage__location-breakdown">
        <tbody>${rows}</tbody>
      </table>
    `.trim();
  }

  function renderCellContent(cell, loading, { showLocationBreakdown = false } = {}) {
    if (loading) {
      return '<span class="gem-compare-esl-usage__cell-loading">—</span>';
    }
    if (!cell || !cell.total) {
      return '<span class="gem-compare-esl-usage__cell-empty">0</span>';
    }

    const breakdown = PRESENTATION_ORDER
      .map((type) => renderBreakdownChip(type, cell[type]))
      .filter(Boolean)
      .join('');

    const locationBreakdown = showLocationBreakdown ? renderLocationBreakdownTable(cell) : '';

    return `
      <div class="gem-compare-esl-usage__cell-total">${cell.total}</div>
      <div class="gem-compare-esl-usage__cell-breakdown">${breakdown}</div>
      ${locationBreakdown}
    `.trim();
  }

  function buildDiffRowForCounts(row, columns, locationKey) {
    const diffSource = {
      columns: new Map(
        columns.map((col) => {
          const cell = row.columns.get(col.key);
          return [col.key, { total: getCellCountsForView(cell, locationKey).total }];
        })
      ),
    };
    return getRowCellDiffClasses(diffSource, columns);
  }

  function renderScriptRow(row, columns, locationKey, modal) {
    const scriptLabel = truncateScript(row.script, 120);
    const diffClasses = buildDiffRowForCounts(row, columns, locationKey);
    const isTemporarilyShownHidden = isShowingHiddenTemporarily(modal) && isScriptHidden(row.normKey);
    const rowClass = isTemporarilyShownHidden
      ? 'gem-compare-esl-usage__row gem-compare-esl-usage__row--shown-hidden'
      : 'gem-compare-esl-usage__row';

    const dataCells = columns.map((col) => {
      const cell = row.columns.get(col.key) || createEmptyCellCounts();
      const viewCell = getCellCountsForView(cell, locationKey);
      const diffClass = diffClasses.get(col.key) || '';
      const displayCell = groupingView === 'cell-breakdown' ? cell : viewCell;
      const showLocationBreakdown = groupingView === 'cell-breakdown';
      return `<td class="gem-compare-esl-usage__cell${diffClass ? ` ${diffClass}` : ''}">${renderCellContent(displayCell, col.loading, { showLocationBreakdown: showLocationBreakdown && !col.loading })}</td>`;
    }).join('');

    return `
      <tr class="${rowClass}">
        <th scope="row" class="gem-compare-esl-usage__script-cell" title="${escapeHtml(row.script)}">
          <div class="gem-compare-esl-usage__script-cell-inner">
            <div class="gem-compare-esl-usage__script-cell-menu" data-gem-esl-script-key="${escapeHtml(row.normKey || '')}"></div>
            <div class="gem-compare-esl-usage__script-cell-label">${escapeHtml(scriptLabel)}</div>
          </div>
        </th>
        ${dataCells}
      </tr>
    `.trim();
  }

  function renderBodyRows(matrix, modal) {
    if (groupingView === 'by-location') {
      const colSpan = matrix.columns.length + 1;
      return LOCATION_ORDER.map((locationKey) => {
        const locationRows = matrix.rows.filter((row) => rowHasCountsInLocation(row, locationKey, matrix.columns));
        if (!locationRows.length) return '';

        const groupHeader = `
          <tr class="gem-compare-esl-usage__group-row">
            <th scope="colgroup" class="gem-compare-esl-usage__group-cell" colspan="${colSpan}">${escapeHtml(LOCATION_LABELS[locationKey])}</th>
          </tr>
        `.trim();

        const scriptRows = locationRows
          .map((row) => renderScriptRow(row, matrix.columns, locationKey, modal))
          .join('');

        return `${groupHeader}${scriptRows}`;
      }).join('');
    }

    return matrix.rows.map((row) => renderScriptRow(row, matrix.columns, null, modal)).join('');
  }

  function getRowCellDiffClasses(row, columns) {
    const loadedColumns = columns.filter((col) => !col.loading);
    if (loadedColumns.length < 2) return new Map();

    const totalsByKey = new Map();
    loadedColumns.forEach((col) => {
      const cell = row.columns.get(col.key);
      const total = cell && typeof cell.total === 'number' ? cell.total : 0;
      totalsByKey.set(col.key, total);
    });

    const totals = [...totalsByKey.values()];
    const allSame = totals.every((total) => total === totals[0]);
    if (allSame) return new Map();

    const frequency = new Map();
    totals.forEach((total) => {
      frequency.set(total, (frequency.get(total) || 0) + 1);
    });

    const minFrequency = Math.min(...frequency.values());
    const maxFrequency = Math.max(...frequency.values());
    // When every distinct total is equally common (e.g. 2/2 split), don't mark all cells.
    if (minFrequency >= maxFrequency) return new Map();

    const leastCommonValues = new Set(
      [...frequency.entries()]
        .filter(([, count]) => count === minFrequency)
        .map(([value]) => value)
    );

    const diffClasses = new Map();
    loadedColumns.forEach((col) => {
      const total = totalsByKey.get(col.key);
      if (leastCommonValues.has(total)) {
        diffClasses.set(col.key, 'gem-compare-esl-usage__cell--diff');
      }
    });
    return diffClasses;
  }

  function renderCompareEslUsageTable(modal, panel, entries, options = {}) {
    if (!panel) return;

    const getEntryKey = options.getEntryKey || ((entry) => entry.key);
    const getEntryLabel = options.getEntryLabel || ((entry) => entry.label);
    const fullMatrix = buildEslUsageMatrix(entries, { getEntryKey, getEntryLabel });
    const hiddenCount = countHiddenScriptsInMatrix(fullMatrix);
    const matrix = filterMatrixRows(fullMatrix, modal);

    let tableWrap = panel.querySelector('.gem-compare-esl-usage');
    if (!tableWrap) {
      tableWrap = document.createElement('div');
      tableWrap.className = 'gem-compare-esl-usage gem-scrollable';
      tableWrap.hidden = true;
      panel.appendChild(tableWrap);
    }

    if (!fullMatrix.rows.length && !fullMatrix.columns.some((col) => col.loading)) {
      tableWrap.innerHTML = '<div class="gem-compare-esl-usage__empty">No ESL scripts or tokens found.</div>';
      common.syncPanelContentView(modal);
      return;
    }

    if (!fullMatrix.rows.length && fullMatrix.columns.some((col) => col.loading)) {
      tableWrap.innerHTML = '<div class="gem-compare-esl-usage__empty">Loading email content…</div>';
      common.syncPanelContentView(modal);
      return;
    }

    const hiddenBanner = renderHiddenScriptsBanner(hiddenCount, modal);
    const headerCells = matrix.columns.map((col) => (
      `<th scope="col" class="gem-compare-esl-usage__col-header">${escapeHtml(col.loading ? `${col.label}…` : col.label)}</th>`
    )).join('');

    const bodyRows = renderBodyRows(matrix, modal);
    const colgroup = `
      <colgroup>
        <col class="gem-compare-esl-usage__col-script">
        ${matrix.columns.map(() => '<col class="gem-compare-esl-usage__col-data">').join('')}
      </colgroup>
    `.trim();

    const emptyVisibleMessage = !matrix.rows.length
      ? '<div class="gem-compare-esl-usage__empty gem-compare-esl-usage__empty--inline">No visible scripts. Use Show All to reveal hidden scripts.</div>'
      : '';

    tableWrap.innerHTML = `
      ${hiddenBanner}
      ${emptyVisibleMessage}
      <table class="gem-compare-esl-usage__table">
        ${colgroup}
        <thead>
          <tr>
            <th scope="col" class="gem-compare-esl-usage__script-header">Scripts</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    `.trim();

    bindEslTableInteractions(tableWrap, modal);
    common.syncPanelContentView(modal);
  }

  function getActiveCompareEntries(modal) {
    const mode = String(modal?.dataset?.gemCompareMode || '').trim();
    if (mode === 'languages' && typeof window.gemGetCompareLanguageCaptures === 'function') {
      return {
        mode,
        entries: window.gemGetCompareLanguageCaptures(),
        getEntryKey: (entry) => entry.value,
        getEntryLabel: (entry) => {
          const label = String(entry.label || '').trim();
          return entry.isMaster ? `${label} (master)` : label;
        },
      };
    }
    if (mode === 'versions' && typeof window.gemGetCompareVersionEntries === 'function') {
      return {
        mode,
        entries: window.gemGetCompareVersionEntries(),
        getEntryKey: (entry) => entry.id,
        getEntryLabel: (entry) => entry.label || entry.letter || entry.id,
      };
    }
    return null;
  }

  function refreshCompareEslUsageTable(modal) {
    const targetModal = modal || common.getCompareModal();
    if (!targetModal) return;
    bindEslEditabilityToggle(targetModal);
    bindEslGroupingToggle(targetModal);
    syncEslEditabilityToggleUi(targetModal);
    syncEslGroupingToggleUi(targetModal);
    if (typeof common.getContentView === 'function' && common.getContentView() !== 'esl-usage') {
      setShowingHiddenTemporarily(targetModal, false);
      common.syncPanelContentView(targetModal);
      return;
    }

    const active = getActiveCompareEntries(targetModal);
    if (!active || !active.entries.length) return;

    const panel = common.getCompareModePanel(targetModal, active.mode);
    if (!panel) return;

    renderCompareEslUsageTable(targetModal, panel, active.entries, {
      getEntryKey: active.getEntryKey,
      getEntryLabel: active.getEntryLabel,
    });
  }

  function scheduleRefreshCompareEslUsageTable(modal) {
    eslTableRefreshModal = modal || common.getCompareModal() || eslTableRefreshModal;
    if (eslTableRefreshTimer) clearTimeout(eslTableRefreshTimer);
    eslTableRefreshTimer = setTimeout(() => {
      eslTableRefreshTimer = null;
      const targetModal = eslTableRefreshModal;
      eslTableRefreshModal = null;
      refreshCompareEslUsageTable(targetModal);
    }, 48);
  }

  function initCompareEslUsage() {
    if (window.__gemCompareEslUsageInitialized) return;
    window.__gemCompareEslUsageInitialized = true;

    ensureEditabilityStorageListener();
    ensureGroupingStorageListener();
    ensureHiddenScriptsStorageListener();
    loadEditabilityFilter(() => {
      syncEslEditabilityToggleUi();
    });
    loadGroupingView(() => {
      syncEslGroupingToggleUi();
    });
    loadHiddenScripts();
    common.registerLayoutRefreshHandler((modal) => {
      if (typeof common.getContentView === 'function' && common.getContentView() !== 'esl-usage') return;
      refreshCompareEslUsageTable(modal);
    });
  }

  function openReviewScriptsModal() {
    const opts = { contentView: 'esl-usage', allowSingle: true };

    if (typeof window.gemOpenCompareModal === 'function') {
      if (window.gemOpenCompareModal(opts)) return true;
    }

    if (window.gemShowToast) {
      window.gemShowToast('Unable to open Review Scripts for this campaign.', { type: 'error' });
    }
    return false;
  }

  window.gemRefreshCompareEslUsageTable = scheduleRefreshCompareEslUsageTable;
  window.gemRefreshCompareEslUsageTableNow = refreshCompareEslUsageTable;
  window.gemOpenReviewScriptsModal = openReviewScriptsModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareEslUsage);
  } else {
    initCompareEslUsage();
  }
})();
