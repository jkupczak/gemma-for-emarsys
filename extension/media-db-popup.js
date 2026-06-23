// NOTE: Keep this file quiet by default to avoid perf issues in the MediaDB popup.

// ------------------------------------------------------------
// Recently Seen Images logger (for Image Properties picker)
// ------------------------------------------------------------

function initializeRecentlySeenLogger() {
  const STORAGE_KEY = 'gemRecentlySeenImages';
  const RECENTLY_SEEN_MAX_SETTING_KEY = 'gemRecentlySeenImagesMax';
  const LAST_USED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  let recentlySeenMax = 300;
  const isDebugEnabled = () => {
    try {
      if (window.gemIsDebugLoggingEnabled) return !!window.gemIsDebugLoggingEnabled();
      if (typeof window.GEM_DEBUG === 'boolean') return window.GEM_DEBUG;
    } catch (_) {}
    return false;
  };
  const dbg = (...args) => {
    try {
      if (!isDebugEnabled()) return;
      console.log('[Gem-Recently-Seen]', ...args);
    } catch (_) {}
  };
  const loggedSkips = new Set();
  // Use local storage for this high-churn list to avoid chrome.storage.sync quota/throttling.
  const STORE = chrome.storage.local;
  // Batch writes to avoid chrome.storage race conditions (last-write-wins).
  const pendingMap = new Map(); // url -> { url, ts, path, friendlyFilename }
  let flushT = null;
  let flushInFlight = false;
  let lastCopyActionCount = null;
  let countLogT = null;

  function normalizeRecentlySeenMax(value) {
    const n = (typeof value === 'number') ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n)) return 300;
    return Math.min(2000, Math.max(50, Math.trunc(n)));
  }

  function pruneRecentlySeenImagesToLimit(list, limit, nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (!Array.isArray(list) || list.length <= limit) return list;
    const next = [...list];
    function isProtectedEntry(x) {
      const lu = x && typeof x.lastUsed === 'number' ? x.lastUsed : null;
      return lu != null && (now - lu) <= LAST_USED_RETENTION_MS;
    }
    function removeOneSmallestTsUnprotected() {
      let bestIdx = -1;
      let bestTs = Infinity;
      for (let i = 0; i < next.length; i++) {
        const x = next[i];
        if (isProtectedEntry(x)) continue;
        const t = (x && typeof x.ts === 'number') ? x.ts : 0;
        if (t < bestTs) {
          bestTs = t;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        next.splice(bestIdx, 1);
        return true;
      }
      return false;
    }
    function removeOneSmallestTsAny() {
      let bestIdx = -1;
      let bestTs = Infinity;
      for (let i = 0; i < next.length; i++) {
        const x = next[i];
        const t = (x && typeof x.ts === 'number') ? x.ts : 0;
        if (t < bestTs) {
          bestTs = t;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        next.splice(bestIdx, 1);
        return true;
      }
      return false;
    }
    while (next.length > limit) {
      if (!removeOneSmallestTsUnprotected()) {
        if (!removeOneSmallestTsAny()) break;
      }
    }
    return next;
  }

  // Load + live-update the max from sync settings
  try {
    chrome.storage.sync.get({ [RECENTLY_SEEN_MAX_SETTING_KEY]: recentlySeenMax }, (res) => {
      recentlySeenMax = normalizeRecentlySeenMax(res && res[RECENTLY_SEEN_MAX_SETTING_KEY]);
    });
    chrome.storage.onChanged.addListener((changes, namespace) => {
      try {
        if (namespace !== 'sync') return;
        if (!changes || !changes[RECENTLY_SEEN_MAX_SETTING_KEY]) return;
        recentlySeenMax = normalizeRecentlySeenMax(changes[RECENTLY_SEEN_MAX_SETTING_KEY].newValue);
      } catch (_) {}
    });
  } catch (_) {}

  function normalizeUrlCandidate(raw) {
    let s = String(raw || '');
    s = s
      .replace(/&ZeroWidthSpace;/gi, '')
      .replace(/&#8203;/g, '')
      .replace(/&#x200B;/gi, '')
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .trim();
    if (!s) return '';
    if (s === 'http://example.com/image.png') return '';
    if (/\s/.test(s)) return '';
    if (/[<>]/.test(s)) return '';
    const looksLikeUrl =
      /^https?:\/\/.+/i.test(s) ||
      /^\/\/.+/i.test(s) ||
      /^data:image\/.+/i.test(s);
    return looksLikeUrl ? s : '';
  }

  function looksLikeImageUrl(url) {
    const s = String(url || '');
    if (!s) return false;
    if (/^data:image\//i.test(s)) return true;
    return /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)(\?|#|$)/i.test(s);
  }

  function getCurrentBreadcrumbPath() {
    const el = document.querySelector('.e-mediadb-breadcrumb');
    const title = el && el.getAttribute && el.getAttribute('title');
    return (title || '').trim();
  }

  function isInSearchResultsMode() {
    const headings = document.querySelectorAll('h3.ng-binding');
    return Array.from(headings).some((h) => (h.textContent || '').trim().includes('Search results'));
  }

  function getSearchResultPath() {
    const input = document.querySelector('input.mediadb-search__input');
    const searchText = (input && input.value) ? String(input.value).trim() : '';
    return searchText ? `Search result for '${searchText.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : 'Search result';
  }

  function scheduleFlush() {
    if (flushT) return;
    flushT = setTimeout(() => {
      flushT = null;
      flushNow();
    }, 40);
  }

  function flushNow() {
    if (flushInFlight) {
      // Another flush is currently writing; wait until it completes.
      scheduleFlush();
      return;
    }
    if (!pendingMap.size) return;
    flushInFlight = true;
    const pending = Array.from(pendingMap.values());
    pendingMap.clear();

    dbg(`Flush: merging ${pending.length} queued item(s) into storage...`);

    try {
      STORE.get({ [STORAGE_KEY]: [] }, (result) => {
        const list = Array.isArray(result && result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        const cleaned = list
          .map((x) => {
            const uu = normalizeUrlCandidate(x && x.url);
            const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
            const pp = (x && typeof x.path === 'string') ? x.path : '';
            const ffp = (x && typeof x.friendlyFilename === 'string') ? x.friendlyFilename : '';
            const lastUsed = (x && typeof x.lastUsed === 'number') ? x.lastUsed : undefined;
            if (!uu || !looksLikeImageUrl(uu)) return null;
            const row = { url: uu, ts, path: pp, friendlyFilename: ffp };
            if (lastUsed != null) row.lastUsed = lastUsed;
            return row;
          })
          .filter(Boolean);

        const byUrl = new Map(cleaned.map((x) => [x.url, x]));
        let added = 0;
        let updated = 0;

        dbg(`Flush merge: base=${cleaned.length}, pending=${pending.length}`);

        pending.forEach((p) => {
          const cur = byUrl.get(p.url);
          if (cur) {
            updated += 1;
            const row = {
              url: p.url,
              ts: p.ts || Date.now(),
              path: p.path || cur.path || '',
              friendlyFilename: p.friendlyFilename || cur.friendlyFilename || ''
            };
            if (typeof cur.lastUsed === 'number') row.lastUsed = cur.lastUsed;
            byUrl.set(p.url, row);
          } else {
            added += 1;
            byUrl.set(p.url, {
              url: p.url,
              ts: p.ts || Date.now(),
              path: p.path || '',
              friendlyFilename: p.friendlyFilename || ''
            });
          }
        });

        let next = Array.from(byUrl.values());
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        next = pruneRecentlySeenImagesToLimit(next, recentlySeenMax, Date.now());

        STORE.set({ [STORAGE_KEY]: next }, () => {
          dbg(`Flush complete: added=${added}, updated=${updated}, stored=${next.length}`);
          flushInFlight = false;
          if (pendingMap.size) scheduleFlush();
        });
      });
    } catch (e) {
      dbg('Flush error:', e);
      flushInFlight = false;
    }
  }

  function enqueueRecentlySeen(url, path, friendlyFilename) {
    const u = normalizeUrlCandidate(url);
    if (!u) {
      const key = `bad:${String(url || '').slice(0, 180)}`;
      if (!loggedSkips.has(key)) {
        loggedSkips.add(key);
        dbg('Skip: invalid URL candidate', url);
      }
      return;
    }
    if (!looksLikeImageUrl(u)) {
      const key = `nonimg:${u}`;
      if (!loggedSkips.has(key)) {
        loggedSkips.add(key);
        dbg('Skip: not an image URL', u);
      }
      return;
    }
    const p = (path || '').trim();
    const ff = (friendlyFilename || '').trim();
    const now = Date.now();
    pendingMap.set(u, { url: u, ts: now, path: p || '', friendlyFilename: ff || '' });
    scheduleFlush();
  }

  function scanAndUpsert(root) {
    const scope = root && root.querySelectorAll ? root : document;
    // Active search (input has value) => use "Search result for 'x'". Otherwise prefer breadcrumb
    // when it looks like a folder path, to avoid wrong "Search result" from stale h3.
    const breadcrumb = getCurrentBreadcrumbPath();
    const searchInput = document.querySelector('input.mediadb-search__input');
    const hasSearchTerm = (searchInput && searchInput.value) ? String(searchInput.value).trim().length > 0 : false;
    const path = hasSearchTerm
      ? getSearchResultPath()
      : (breadcrumb && !breadcrumb.startsWith('Search result'))
        ? breadcrumb
        : (isInSearchResultsMode() ? getSearchResultPath() : breadcrumb);
    let found = 0;
    let used = 0;
    const hit = (el) => {
      const url = el && el.getAttribute && el.getAttribute('copy-to-clipboard');
      if (!url) return;
      let friendly = '';
      try {
        const row = el.closest && el.closest('tr.file-table-row');
        const nameSpan = row && row.querySelector && row.querySelector('.file-table-row span[editable-text="fileCtrl.file.name"] span[ng-hide="textBtnForm.$visible"]');
        friendly = (nameSpan && nameSpan.getAttribute && nameSpan.getAttribute('title')) ? nameSpan.getAttribute('title') : '';
      } catch (_) {}

      // Thumbnail view (or some dropdown contexts): friendly filename may be on the download action link.
      // Example: <a class="... test-download-action ..." download="BannerCopy_Banner_Mobile_FR_1.gif" ...>
      if (!friendly) {
        try {
          const scopeEl = (el && el.closest)
            ? (el.closest('tr.file-table-row') ||
              el.closest('.file-thumbnail') ||
              el.closest('.e-card') ||
              el.closest('[id^="file-"]'))
            : null;

          // Prefer the visible title in thumbnail cards when available
          const titleEl = scopeEl && scopeEl.querySelector && scopeEl.querySelector('.e-card__title');
          const titleText = titleEl && titleEl.textContent ? String(titleEl.textContent).trim() : '';
          if (titleText) friendly = titleText;

          // Otherwise, try the download attribute on the download/preview action link
          if (!friendly && scopeEl && scopeEl.querySelectorAll) {
            let urlPath = '';
            try {
              urlPath = new URL(String(url), window.location.href).pathname || '';
            } catch (_) {}

            const candidates = Array.from(scopeEl.querySelectorAll('a.test-download-action[download]'));
            let match = null;
            if (urlPath) {
              match = candidates.find((a) => {
                const hrefAttr = a && a.getAttribute && a.getAttribute('href');
                if (!hrefAttr) return false;
                try {
                  const hrefPath = new URL(String(hrefAttr), window.location.href).pathname || '';
                  return hrefPath === urlPath;
                } catch (_) {
                  return String(hrefAttr).endsWith(urlPath);
                }
              }) || null;
            }
            const dl = match || candidates[0] || null;
            const dlName = dl && dl.getAttribute && dl.getAttribute('download');
            if (dlName) friendly = String(dlName || '').trim();
          }
        } catch (_) {}
      }

      found += 1;
      const beforeSize = loggedSkips.size;
      enqueueRecentlySeen(url, path, friendly);
      // Heuristic: if it wasn't skipped as invalid/non-image, count it as used attempt.
      if (loggedSkips.size === beforeSize) used += 1;
    };

    // Collect unique hits; copy-to-clipboard nodes may appear either:
    // - inside the MediaDB file table rows, or
    // - in dropdown overlays (often outside the table row subtree) as <span> or <a>.
    const seenEls = new Set();
    const addAll = (nodeList) => {
      try {
        (nodeList || []).forEach((el) => {
          if (el && el.nodeType === Node.ELEMENT_NODE) seenEls.add(el);
        });
      } catch (_) {}
    };

    // Primary: anywhere in light DOM (covers both <span> and <a> variants)
    addAll(scope.querySelectorAll('[copy-to-clipboard]'));

    // Some Emarsys components may render dropdown content inside shadow DOM.
    scope.querySelectorAll('e-dropdown').forEach((dd) => {
      try {
        if (dd && dd.shadowRoot) {
          addAll(dd.shadowRoot.querySelectorAll('[copy-to-clipboard]'));
        }
      } catch (_) {}
    });

    seenEls.forEach(hit);

    if (isDebugEnabled() && (found > 0 || (Math.random() < 0.02))) {
      dbg(`Scan: found ${found} nodes, attempted ${used} upserts`, path ? `(path="${path}")` : '');
    }
  }

  function maybeLogCopyActionCount() {
    if (!isDebugEnabled()) return;
    if (countLogT) return;
    countLogT = setTimeout(() => {
      countLogT = null;
      try {
        const total =
          document.querySelectorAll('tr.file-table-row .test-copytoclipboard-dropdownaction').length +
          document.querySelectorAll('tr.file-table-row .test-copytoclipboard-action').length;
        if (lastCopyActionCount !== total) {
          lastCopyActionCount = total;
          dbg(`DOM count: copy-to-clipboard actions (table row scoped) = ${total}`);
        }
      } catch (_) {}
    }, 50);
  }

  function nodeMayAffectSeen(n) {
    try {
      if (!n || n.nodeType !== Node.ELEMENT_NODE) return false;
      if (
        n.matches &&
        (
          n.matches('tr.file-table-row') ||
          n.matches('[copy-to-clipboard]') ||
          n.matches('.test-copytoclipboard-dropdownaction') ||
          n.matches('.test-copytoclipboard-action')
        )
      ) return true;
      if (n.querySelector) {
        if (n.querySelector('tr.file-table-row')) return true;
        if (n.querySelector('tr.file-table-row [copy-to-clipboard]')) return true;
        if (n.querySelector('tr.file-table-row .test-copytoclipboard-dropdownaction')) return true;
        if (n.querySelector('tr.file-table-row .test-copytoclipboard-action')) return true;
        if (n.querySelector('[copy-to-clipboard]')) return true;
        const h3 = n.querySelector('h3.ng-binding');
        if (h3 && (h3.textContent || '').includes('Search results')) return true;
      }
    } catch (_) {}
    return false;
  }

  // Initial scan
  scanAndUpsert(document);

  // As user scrolls, more rows are appended and attributes may be set later.
  let pending = null;
  const scheduleScan = (node) => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      // Use full-document scan for reliability (Emarsys often reuses nodes/attrs across the table)
      scanAndUpsert(document);
    }, 50);
  };

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        let touchedCopyToClipboardNode = false;
        m.addedNodes.forEach((n) => {
          if (nodeMayAffectSeen(n)) {
            scheduleScan(n);
            try {
              if (
                (n.matches && (n.matches('tr.file-table-row .test-copytoclipboard-dropdownaction') || n.matches('tr.file-table-row .test-copytoclipboard-action'))) ||
                (n.querySelector && (n.querySelector('tr.file-table-row .test-copytoclipboard-dropdownaction') || n.querySelector('tr.file-table-row .test-copytoclipboard-action')))
              ) {
                touchedCopyToClipboardNode = true;
              }
            } catch (_) {}
          }
        });
        m.removedNodes.forEach((n) => {
          if (nodeMayAffectSeen(n)) {
            try {
              if (
                (n.matches && (n.matches('tr.file-table-row .test-copytoclipboard-dropdownaction') || n.matches('tr.file-table-row .test-copytoclipboard-action'))) ||
                (n.querySelector && (n.querySelector('tr.file-table-row .test-copytoclipboard-dropdownaction') || n.querySelector('tr.file-table-row .test-copytoclipboard-action')))
              ) {
                touchedCopyToClipboardNode = true;
              }
            } catch (_) {}
          }
        });
        if (touchedCopyToClipboardNode) maybeLogCopyActionCount();
      } else if (m.type === 'attributes') {
        const t = m.target;
        if (t && t.nodeType === Node.ELEMENT_NODE && t.getAttribute && t.getAttribute('copy-to-clipboard')) {
          scheduleScan(t);
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['copy-to-clipboard'] });
  dbg('Logger initialized. Watching DOM for [copy-to-clipboard] nodes/attr changes.');

  // One-time best-effort migration from sync → local so existing data isn't lost.
  try {
    STORE.get({ [STORAGE_KEY]: [] }, (localRes) => {
      const localList = Array.isArray(localRes && localRes[STORAGE_KEY]) ? localRes[STORAGE_KEY] : [];
      if (localList.length) return;
      chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (syncRes) => {
        const syncList = Array.isArray(syncRes && syncRes[STORAGE_KEY]) ? syncRes[STORAGE_KEY] : [];
        if (!syncList.length) return;
        STORE.set({ [STORAGE_KEY]: syncList }, () => {
          dbg(`Migrated ${syncList.length} item(s) from sync → local.`);
        });
      });
    });
  } catch (_) {}
}

// MediaDB table column visibility functionality
function initializeMediaDBColumnVisibility() {
  // (debug logs removed to avoid MediaDB popup perf issues)

  // Storage keys for column visibility
  const STORAGE_KEY = 'gemMediaDBColumnVisibility';

  // Load settings from storage and apply them
  function loadAndApplySettings() {
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
    // Find the data table
    const dataTable = document.querySelector('table.e-table.e-table-modal.e-table-condensed');

    // Find the header table
    const headerTable = document.querySelector('table.e-table.e-table-modal:not(.e-table-condensed)');

    if (!dataTable) {
      return;
    }

    // Handle colgroup in data table
    const colgroup = dataTable.querySelector('colgroup');
    if (colgroup) {
      const cols = colgroup.querySelectorAll('col');

      // Column indices in colgroup:
      // 0: File name
      // 1: Created date
      // 2: Size
      // 3: User
      // 4: Actions

      if (cols[1]) { // Created column
        cols[1].style.setProperty('display', settings.showCreated ? '' : 'none', 'important');
      }

      if (cols[2]) { // Size column
        cols[2].style.setProperty('display', settings.showSize ? '' : 'none', 'important');
      }

      if (cols[3]) { // User column
        cols[3].style.setProperty('display', settings.showUser ? '' : 'none', 'important');
      }
    }

    // Handle header table th elements
    if (headerTable) {
      const headerCells = headerTable.querySelectorAll('th');

      // Column indices in header:
      // 0: Name
      // 1: Created date
      // 2: Size
      // 3: User
      // 4: Actions

      if (headerCells[1]) { // Created header
        headerCells[1].style.setProperty('display', settings.showCreated ? '' : 'none', 'important');
      }

      if (headerCells[2]) { // Size header
        headerCells[2].style.setProperty('display', settings.showSize ? '' : 'none', 'important');
      }

      if (headerCells[3]) { // User header
        headerCells[3].style.setProperty('display', settings.showUser ? '' : 'none', 'important');
      }
    }

    // Get table rows from data table
    const rows = dataTable.querySelectorAll('tr');

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td');

      // Skip rows that are headers or special rows (colspan rows, loading rows, etc.)
      // Only process actual file/folder data rows
      const isFileRow = row.classList.contains('file-table-row');
      const isFolderRow = row.classList.contains('folder-table-row');
      if ((!isFileRow && !isFolderRow) || cells.length !== 5) return;

      // Column indices:
      // 0: File name (with icon) - always visible for file name, but can hide icon
      // 1: Created date
      // 2: Size
      // 3: User
      // 4: Actions - always visible

      // Toggle Created column (index 1)
      if (cells[1]) {
        cells[1].style.setProperty('display', settings.showCreated ? '' : 'none', 'important');
      }
      // Fallback: folder rows can sometimes still show created even when the column is hidden.
      // Hide any cell containing <e-time> when Created is disabled.
      if (!settings.showCreated) {
        cells.forEach((cell) => {
          if (cell && cell.querySelector && cell.querySelector('e-time')) {
            cell.style.setProperty('display', 'none', 'important');
          }
        });
      }

      // Toggle Size column (index 2)
      if (cells[2]) {
        cells[2].style.setProperty('display', settings.showSize ? '' : 'none', 'important');
      }

      // Toggle User column (index 3)
      if (cells[3]) {
        cells[3].style.setProperty('display', settings.showUser ? '' : 'none', 'important');
      }

      // Toggle File Icon (within column 0)
      if (cells[0] && isFileRow) {
        const icons = cells[0].querySelectorAll('e-icon[type="inline"]');
        if (!settings.showFileIcon) {
          icons.forEach(icon => {
            icon.style.setProperty('display', 'none', 'important');
          });
        } else {
          icons.forEach(icon => {
            icon.style.setProperty('display', '', 'important');
          });
        }
      }
    });
  }

  // Listen for settings changes from the settings panel
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes[STORAGE_KEY]) {
      applyColumnVisibility(changes[STORAGE_KEY].newValue);
    }
  });

  // Apply initial settings
  loadAndApplySettings();

  // Watch for file data rows being added to the table
  const handleTableMutations = (mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        let hasNewFileRows = false;

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList && (node.classList.contains('file-table-row') || node.classList.contains('folder-table-row'))) {
              hasNewFileRows = true;
            } else if (node.querySelectorAll) {
              const fileOrFolderRows = node.querySelectorAll('.file-table-row, .folder-table-row');
              if (fileOrFolderRows.length > 0) {
                hasNewFileRows = true;
              }
            }
          }
        });

        if (hasNewFileRows) {
          setTimeout(() => applyColumnVisibilityFromStorage(), 100);
        }
      }
    });
  };

  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe(handleTableMutations);
  } else {
    const tableObserver = new MutationObserver(handleTableMutations);
    tableObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeMediaDBColumnVisibility();
    initializeRecentlySeenLogger();
  });
} else {
  initializeMediaDBColumnVisibility();
  initializeRecentlySeenLogger();
}
