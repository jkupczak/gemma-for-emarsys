(function() {
  const LOG_PREFIX = '[Gemma email-campaign-list]';
  const STORAGE_KEY = 'gemEmailCampaignListLoadAll';
  const FILTER_BUTTON_SELECTOR = 'e-datagrid-wrapper .e-datagrid__header_left .e-datagrid__filter_button button';
  const DATETIME_CLEAR_SELECTOR = '.e-datagrid__advanced_filters .e-datagrid__filter:first-child button.e-datetime__clear';
  const LOAD_ALL_TOAST_MESSAGE = 'All emails loaded by Gemma. Adjust this in settings.';
  const LOAD_ALL_TOAST_DURATION_MS = 8400;

  function showLoadAllToast() {
    if (typeof window.gemShowToast === "function") {
      window.gemShowToast(LOAD_ALL_TOAST_MESSAGE, { type: "info", durationMs: LOAD_ALL_TOAST_DURATION_MS / 2 });
    }
  }

  function showDuplicateCampaignError(res) {
    if (typeof window.gemShowToast !== "function") return;
    const reason = res && res.reason ? res.reason : "unknown";
    window.gemShowToast(
      reason === "no_auth_token"
        ? "Could not obtain auth token. Try refreshing the page."
        : `Duplicate failed (${reason}).`,
      { type: "error" }
    );
  }

  function querySelectorIncludingShadow(selector, root = document) {
    const el = root.querySelector(selector);
    if (el) return el;
    for (const node of root.querySelectorAll('*')) {
      if (node.shadowRoot) {
        const found = querySelectorIncludingShadow(selector, node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function waitForElement(selector, callback, options = {}) {
    const useShadow = options.pierceShadow ?? false;
    const query = useShadow ? (r) => querySelectorIncludingShadow(selector, r) : (r) => r.querySelector(selector);

    const element = query(document);
    if (element) {
      console.log(LOG_PREFIX, 'Element found immediately:', selector, useShadow ? '(shadow)' : '');
      callback(element);
      return;
    }

    console.log(LOG_PREFIX, 'Waiting for element:', selector, useShadow ? '(including shadow DOM)' : '');
    const root = document.body || document.documentElement;
    const observer = new MutationObserver(() => {
      const el = query(document);
      if (el) {
        console.log(LOG_PREFIX, 'Element appeared in DOM:', selector);
        observer.disconnect();
        callback(el);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  function waitForEnabled(selector, callback, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;

    function isEnabled(el) {
      return el && !el.hasAttribute('disabled') && !el.disabled;
    }

    const el = document.querySelector(selector);
    if (isEnabled(el)) {
      console.log(LOG_PREFIX, 'Element already enabled, no wait needed');
      callback(el);
      return;
    }

    console.log(LOG_PREFIX, 'Element is disabled, observing until enabled...');

    let settled = false;
    let timeoutId = null;
    const root = document.body || document.documentElement;

    const cleanup = () => {
      observer.disconnect();
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = (enabledEl, reason) => {
      if (settled) return;
      settled = true;
      cleanup();
      console.log(LOG_PREFIX, `Element is now enabled (${reason})`);
      callback(enabledEl);
    };

    const observer = new MutationObserver(() => {
      const current = document.querySelector(selector);
      if (isEnabled(current)) {
        finish(current, 'mutation');
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class']
    });

    timeoutId = setTimeout(() => {
      cleanup();
      console.log(LOG_PREFIX, `Timed out waiting for enabled element: ${selector}`);
    }, timeoutMs);
  }

  function gemRunEmailCampaignListLoadAll() {
    console.log(LOG_PREFIX, 'Running, document.readyState:', document.readyState);
    waitForElement(FILTER_BUTTON_SELECTOR, (el) => {
      console.log(LOG_PREFIX, 'Filter button found, disabled:', el.hasAttribute('disabled'), 'el.disabled:', el.disabled);
      waitForEnabled(FILTER_BUTTON_SELECTOR, (btn) => {
        console.log(LOG_PREFIX, 'Clicking filter button');
        btn.click();
        waitForElement(DATETIME_CLEAR_SELECTOR, (clearEl) => {
          console.log(LOG_PREFIX, 'DateTime clear button found, clicking');
          clearEl.click();
          showLoadAllToast();
          console.log(LOG_PREFIX, 'Done');
        }, { pierceShadow: true });
      });
    });
  }

  function init() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
      return;
    }
    chrome.storage.sync.get({ [STORAGE_KEY]: false }, (res) => {
      if (res && res[STORAGE_KEY] === true) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', gemRunEmailCampaignListLoadAll);
        } else {
          gemRunEmailCampaignListLoadAll();
        }
      }
    });
  }

  window.gemRunEmailCampaignListLoadAll = gemRunEmailCampaignListLoadAll;

  // ── gemOtherRecentCampaigns: scrape campaign list table for Recent Campaigns panel ──
  // Prefix avoids debug-logging-gate (which hides lines whose first arg matches ^\\[Gemma?\\s).
  const OTHER_RECENT_LOG = "[EmailListOtherRecent]";
  const OTHER_RECENT_KEY = "gemOtherRecentCampaigns";
  const OTHER_RECENT_MAX = 1000;
  /** Tried in order; main list grid often lives under #main-datagrid and fills rows after header. */
  const CAMPAIGN_TABLE_SELECTORS = [
    "#main-datagrid .e-datagrid__table_wrapper > table",
    "#main-datagrid table",
    "#campaign-list-container .e-datagrid__table",
    ".e-datagrid__table_wrapper table"
  ];
  let otherRecentScrapeTimer = null;
  let lastOtherRecentWriteFingerprint = "";
  /** Bounded follow-up scrapes while name cells still show e-skeleton (pagination / slow load). */
  let otherRecentSkeletonRescrapeCount = 0;
  const OTHER_RECENT_SKELETON_MAX_FOLLOWUPS = 48;
  let otherRecentGridMo = null;
  /** @type {Node | null} */
  let otherRecentGridMoTarget = null;
  let otherRecentPagerHookInstalled = false;
  /** Coalesce rapid MutationObserver deliveries to one rAF. */
  let otherRecentMutationRafId = 0;
  let otherRecentTableCacheRef = null;
  let otherRecentTableCacheAt = 0;
  const OTHER_RECENT_TABLE_CACHE_MS = 320;
  const OTHER_RECENT_DEFAULT_DEBOUNCE_MS = 420;
  let otherRecentPagerFollowTimer1 = null;
  let otherRecentPagerFollowTimer2 = null;

  function otherRecentDebugEnabled() {
    try {
      return typeof window.gemIsDebugLoggingEnabled !== "function" || window.gemIsDebugLoggingEnabled();
    } catch (_) {
      return true;
    }
  }

  function otherRecentDbg(...args) {
    if (!otherRecentDebugEnabled()) return;
    console.log(OTHER_RECENT_LOG, ...args);
  }

  function otherRecentMutationsRelevant(mutations) {
    function nodeTouchesGrid(n) {
      if (!n || n.nodeType !== Node.ELEMENT_NODE) return false;
      const el = n;
      const tag = el.tagName;
      if (tag === "TR" || tag === "TD" || tag === "TBODY" || tag === "THEAD") return true;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") return false;
      try {
        if (el.classList && el.classList.contains("e-skeleton")) return true;
        const c = el.firstElementChild;
        if (c && (c.tagName === "TR" || c.tagName === "TD")) return true;
        if (el.querySelector && (tag === "DIV" || tag === "SPAN" || (tag.length > 1 && tag.charAt(0) === "E"))) {
          if (el.querySelector("tr, td, .e-skeleton")) return true;
        }
      } catch (_) {}
      return false;
    }
    function attributeMutationTouchesGrid(m) {
      if (m.type !== "attributes") return false;
      const an = m.attributeName;
      if (an !== "class" && an !== "style") return false;
      const el = m.target;
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      const tag = el.tagName;
      if (an === "style" && tag === "TR") return true;
      if (an !== "class") return false;
      if (tag === "TR" || tag === "TD" || tag === "TBODY" || tag === "THEAD") return true;
      try {
        if (el.classList && el.classList.contains("e-skeleton")) return true;
      } catch (_) {}
      return false;
    }
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (attributeMutationTouchesGrid(m)) return true;
      if (m.type !== "childList") continue;
      for (const n of m.addedNodes) {
        if (nodeTouchesGrid(n)) return true;
      }
      for (const n of m.removedNodes) {
        if (nodeTouchesGrid(n)) return true;
      }
    }
    return false;
  }

  /**
   * Prefer ShadowRoot when the table lives in component shadow (required to see mutations).
   * In light DOM, prefer `.e-datagrid__table_wrapper` (tight subtree). `attributeFilter` is set
   * where Emarsys toggles loading (e.g. row opacity via style, skeleton via class) without many
   * childList churns outside the grid.
   */
  function getOtherRecentObserveConfig(table) {
    if (!table) return null;
    try {
      const r = table.getRootNode();
      if (typeof ShadowRoot !== "undefined" && r instanceof ShadowRoot) {
        return { node: r, attributeFilter: ["class"] };
      }
    } catch (_) {}
    const wrap = table.closest(".e-datagrid__table_wrapper");
    if (wrap) return { node: wrap, attributeFilter: ["class", "style"] };
    const dg = document.getElementById("main-datagrid");
    if (dg) return { node: dg, attributeFilter: null };
    const cc = document.getElementById("campaign-list-container");
    if (cc) return { node: cc, attributeFilter: null };
    try {
      return { node: table.closest("e-datagrid-wrapper") || table, attributeFilter: null };
    } catch (_) {
      return { node: table, attributeFilter: null };
    }
  }

  function invalidateOtherRecentTableCache() {
    otherRecentTableCacheRef = null;
    otherRecentTableCacheAt = 0;
  }

  function disconnectOtherRecentGridObserver() {
    if (otherRecentMutationRafId) {
      try {
        cancelAnimationFrame(otherRecentMutationRafId);
      } catch (_) {}
      otherRecentMutationRafId = 0;
    }
    if (otherRecentGridMo) {
      try {
        otherRecentGridMo.disconnect();
      } catch (_) {}
      otherRecentGridMo = null;
    }
    otherRecentGridMoTarget = null;
    invalidateOtherRecentTableCache();
  }

  function scheduleOtherRecentFromGridMutations() {
    if (otherRecentMutationRafId) return;
    otherRecentMutationRafId = requestAnimationFrame(() => {
      otherRecentMutationRafId = 0;
      scheduleOtherRecentCampaignScrape("grid-dom-mutation");
      scheduleCampaignListOverflowMenuInject(0);
      if (listPreviewOpen) syncListPreviewActiveRowIfNeeded();
    });
  }

  function ensureOtherRecentGridObserver() {
    const table = findCampaignListTableQuiet();
    if (!table) {
      disconnectOtherRecentGridObserver();
      return;
    }
    const cfg = getOtherRecentObserveConfig(table);
    if (!cfg || !cfg.node) return;
    if (otherRecentGridMo && otherRecentGridMoTarget === cfg.node) return;
    disconnectOtherRecentGridObserver();
    otherRecentGridMoTarget = cfg.node;
    const kind =
      typeof ShadowRoot !== "undefined" && cfg.node instanceof ShadowRoot ? "shadow-root" : "light-node";
    otherRecentDbg("observer: attach", {
      kind,
      tag: cfg.node.nodeName,
      id: cfg.node.id || "",
      attributeFilter: cfg.attributeFilter || null
    });
    otherRecentGridMo = new MutationObserver((records) => {
      if (!otherRecentMutationsRelevant(records)) return;
      scheduleOtherRecentFromGridMutations();
    });
    const opts = { childList: true, subtree: true };
    if (cfg.attributeFilter && cfg.attributeFilter.length) {
      opts.attributes = true;
      opts.attributeFilter = cfg.attributeFilter;
    }
    try {
      otherRecentGridMo.observe(cfg.node, opts);
    } catch (err) {
      otherRecentDbg("observer: attach failed, falling back to <table>", err);
      disconnectOtherRecentGridObserver();
      otherRecentGridMoTarget = table;
      otherRecentGridMo = new MutationObserver((records) => {
        if (!otherRecentMutationsRelevant(records)) return;
        scheduleOtherRecentFromGridMutations();
      });
      const fb = { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] };
      otherRecentGridMo.observe(table, fb);
    }
  }

  function installOtherRecentPagerClickHook() {
    if (otherRecentPagerHookInstalled) return;
    otherRecentPagerHookInstalled = true;
    document.addEventListener(
      "click",
      (ev) => {
        const el = ev.target;
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
        const path = typeof ev.composedPath === "function" ? ev.composedPath() : [el];
        const inGrid = path.some(
          (n) =>
            n &&
            n.nodeType === Node.ELEMENT_NODE &&
            (n.id === "main-datagrid" || n.id === "campaign-list-container")
        );
        if (!inGrid) return;
        let footerish = null;
        for (const n of path) {
          if (!n || n.nodeType !== Node.ELEMENT_NODE || !n.closest) continue;
          footerish =
            n.closest(".e-datagrid__footer") ||
            n.closest("[class*='datagrid__footer']") ||
            n.closest("[class*='pagination']") ||
            n.closest("[class*='pager']") ||
            (n.tagName && n.tagName.toLowerCase() === "e-pagination") ||
            n.closest("e-pagination");
          if (footerish) break;
        }
        if (!footerish) return;
        if (otherRecentPagerFollowTimer1) {
          clearTimeout(otherRecentPagerFollowTimer1);
          otherRecentPagerFollowTimer1 = null;
        }
        if (otherRecentPagerFollowTimer2) {
          clearTimeout(otherRecentPagerFollowTimer2);
          otherRecentPagerFollowTimer2 = null;
        }
        scheduleOtherRecentCampaignScrape("pager-footer-click", 90);
        scheduleCampaignListOverflowMenuInject(90);
        otherRecentPagerFollowTimer1 = setTimeout(() => {
          otherRecentPagerFollowTimer1 = null;
          runOtherRecentCampaignScrapeOnce("pager-followup-650ms");
        }, 650);
        otherRecentPagerFollowTimer2 = setTimeout(() => {
          otherRecentPagerFollowTimer2 = null;
          runOtherRecentCampaignScrapeOnce("pager-followup-1500ms");
        }, 1500);
      },
      true
    );
  }

  /** Trimmed textContent preview for logs. */
  function textContentPreview(el, maxLen = 240) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return { text: "(null)", length: 0 };
    try {
      const raw = String(el.textContent || "").replace(/\s+/g, " ").trim();
      return {
        text: raw.slice(0, maxLen) + (raw.length > maxLen ? "…" : ""),
        length: raw.length
      };
    } catch (_) {
      return { text: "(read failed)", length: 0 };
    }
  }

  /** Compact element description for logs (truncated outerHTML). */
  function elementSnapshot(el, outerHtmlMax = 200) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    try {
      const raw = String(el.outerHTML || "").replace(/\s+/g, " ").trim();
      return {
        tag: el.tagName,
        id: el.id || "",
        className: String(el.className || "").slice(0, 160),
        name: el.getAttribute("name") || "",
        href: el.tagName === "A" ? String(el.getAttribute("href") || "").slice(0, 200) : "",
        content: el.tagName === "E-TOOLTIP" ? String(el.getAttribute("content") || "") : "",
        outerHTML: raw.slice(0, outerHtmlMax) + (raw.length > outerHtmlMax ? "…" : "")
      };
    } catch (_) {
      return { tag: el.tagName, note: "snapshot failed" };
    }
  }

  function queryFirstCampaignTable() {
    for (const sel of CAMPAIGN_TABLE_SELECTORS) {
      let t = document.querySelector(sel);
      if (t) return { table: t, selector: sel, via: "light" };
      t = querySelectorIncludingShadow(sel, document);
      if (t) return { table: t, selector: sel, via: "shadow" };
    }
    return { table: null, selector: "", via: "" };
  }

  function findCampaignListTable() {
    const { table, selector, via } = queryFirstCampaignTable();
    if (table) {
      otherRecentDbg("findTable: matched", { selector, via, snap: elementSnapshot(table, 280) });
    } else {
      otherRecentDbg("findTable: no table matched any selector", CAMPAIGN_TABLE_SELECTORS);
    }
    return table;
  }

  function findCampaignListTableQuiet() {
    const now = Date.now();
    if (
      otherRecentTableCacheRef &&
      otherRecentTableCacheRef.isConnected &&
      now - otherRecentTableCacheAt < OTHER_RECENT_TABLE_CACHE_MS
    ) {
      return otherRecentTableCacheRef;
    }
    const table = queryFirstCampaignTable().table;
    otherRecentTableCacheRef = table;
    otherRecentTableCacheAt = now;
    return table;
  }

  function parseCampaignIdFromEditHref(href) {
    const raw = String(href || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, window.location.origin);
      let id = (
        u.searchParams.get("camp_id") ||
        u.searchParams.get("id") ||
        ""
      ).trim();
      if (!id && u.hash && (u.hash.includes("id=") || u.hash.includes("camp_id="))) {
        const hp = new URLSearchParams(u.hash.replace(/^#/, "").split("?")[1] || "");
        id = (hp.get("camp_id") || hp.get("id") || "").trim();
      }
      return id;
    } catch (_) {
      let m = raw.match(/[?&#]camp_id=([^&#]+)/i);
      if (!m) m = raw.match(/[?&#]id=([^&#]+)/i);
      if (!m) return "";
      try {
        return decodeURIComponent(m[1]).trim();
      } catch (_) {
        return String(m[1] || "").trim();
      }
    }
  }

  /** True while Emarsys shows loading placeholders in a cell (removed once real content loads). */
  function cellHasLoadingSkeleton(cell) {
    if (!cell || cell.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      return !!cell.querySelector(".e-skeleton, [class*='e-skeleton']");
    } catch (_) {
      return false;
    }
  }

  /** Emarsys v2 grid: hidden first column is numeric campaign ID when loaded (see campaign-table-*.txt dumps). */
  function parseCampaignIdFromHiddenIdCell(row) {
    const idCell = row.querySelector("td.e-table__col.e-hidden");
    if (!idCell || cellHasLoadingSkeleton(idCell)) return "";
    const raw = String(idCell.textContent || "").trim();
    return /^\d+$/.test(raw) ? raw : "";
  }

  function headerLabelMatchesEmailColumn(normalizedLower) {
    if (!normalizedLower) return false;
    if (normalizedLower === "email name") return true;
    if (normalizedLower === "email") return true;
    if (normalizedLower === "campaign name") return true;
    if (normalizedLower === "internal name") return true;
    if (normalizedLower === "email id") return true;
    if (normalizedLower.includes("email") && normalizedLower.includes("name")) return true;
    return false;
  }

  function scrapeCampaignListTableToRows(table) {
    const logDeep = otherRecentDebugEnabled();
    if (!table || !table.querySelector) {
      otherRecentDbg("scrape: invalid table ref");
      return { rows: [], incompleteDueToSkeleton: false };
    }
    if (logDeep) otherRecentDbg("scrape: root <table>", elementSnapshot(table, 400));

    const theadRow =
      table.querySelector("thead tr.e-table__titles") ||
      table.querySelector("thead tr.e-datagrid__row") ||
      table.querySelector("thead tr.e-table__row") ||
      table.querySelector("thead tr");
    if (!theadRow) {
      if (logDeep) {
        otherRecentDbg("scrape: no thead row (tried thead tr.e-table__titles, e-datagrid__row, e-table__row, thead tr, tr.e-table__row)", {
          hasThead: !!table.querySelector("thead"),
          tbodyTrCount: table.querySelectorAll("tbody tr").length,
          firstTbodyTr: elementSnapshot(table.querySelector("tbody tr"), 280)
        });
      }
      return { rows: [], incompleteDueToSkeleton: false };
    }
    if (logDeep) otherRecentDbg("scrape: thead row element", elementSnapshot(theadRow, 360));

    const allTh = Array.from(theadRow.querySelectorAll("th"));
    const headerCellsFiltered = Array.from(theadRow.querySelectorAll("th.e-datagrid__column_header"));
    const headerThs = allTh.length ? allTh : headerCellsFiltered;
    const headerLabels = headerThs.map((th) => {
      const titleEl = th.querySelector(".e-datagrid__column_header_title");
      return ((titleEl && titleEl.textContent) || th.textContent || "").trim().replace(/\s+/g, " ");
    });
    if (logDeep) {
      otherRecentDbg("scrape: header <th> elements (all thead th for column index alignment)", {
        thCount: headerThs.length,
        datagridColumnHeaderCount: headerCellsFiltered.length,
        labels: headerLabels.slice(0, 32),
        rawThSnapshots: headerThs.slice(0, 10).map((th, i) => {
          const titleEl = th.querySelector(".e-datagrid__column_header_title");
          const lbl = ((titleEl && titleEl.textContent) || th.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
          return { i, label: lbl || "(empty)", snap: elementSnapshot(th, 160) };
        })
      });
    }
    const emailIdx = headerThs.findIndex((th) => {
      const titleEl = th.querySelector(".e-datagrid__column_header_title");
      const txt = ((titleEl && titleEl.textContent) || th.textContent || "").trim();
      const norm = txt.toLowerCase().replace(/\s+/g, " ").trim();
      return headerLabelMatchesEmailColumn(norm);
    });
    if (emailIdx < 0) {
      if (logDeep) {
        otherRecentDbg(
          "scrape: no column matched email-name heuristics (email name, campaign name, …). See labels above."
        );
      }
      return { rows: [], incompleteDueToSkeleton: false };
    }
    if (logDeep) otherRecentDbg("scrape: email / name column index + <th> element", emailIdx, elementSnapshot(headerThs[emailIdx], 220));

    let bodyRows = table.querySelectorAll("tbody tr.e-datagrid__row");
    let bodyRowSource = "tbody tr.e-datagrid__row";
    if (!bodyRows.length) {
      bodyRows = table.querySelectorAll("tbody tr.e-table__row");
      bodyRowSource = "tbody tr.e-table__row";
    }
    if (!bodyRows.length) {
      bodyRows = table.querySelectorAll("tbody tr");
      bodyRowSource = "tbody tr";
    }
    const rowList = Array.from(bodyRows);
    if (logDeep) otherRecentDbg("scrape: body row source", { using: bodyRowSource, rowCount: rowList.length });

    const rows = [];
    let skippedNoTitle = 0;
    let skippedNoHref = 0;
    let skippedNoId = 0;
    let skippedSkeletonTitle = 0;
    const rowElementLogs = [];
    const maxRowElementLogs = 6;

    rowList.forEach((row, rowIdx) => {
      const cols = row.querySelectorAll("td.e-table__col");
      const titleCell = cols[emailIdx];
      const titleCellSkeleton = cellHasLoadingSkeleton(titleCell);
      if (titleCellSkeleton) {
        skippedSkeletonTitle++;
        if (logDeep && rowIdx < maxRowElementLogs) {
          rowElementLogs.push({
            rowIdx,
            skipped: "skeleton-in-name-column",
            emailNameColumnIndex: emailIdx,
            titleTdHasSkeleton: true,
            titleCell: elementSnapshot(titleCell, 200)
          });
        }
        return;
      }
      const title = titleCell ? String(titleCell.textContent || "").trim() : "";
      const actionsTd = row.querySelector("td.e-table__col-actions");
      const editLink =
        row.querySelector('td.e-table__col-actions a.e-datagrid__item_action[aria-label="Edit"][href]') ||
        row.querySelector('td.e-table__col-actions a[href*="campaignmanager"][href*="camp_id"]') ||
        row.querySelector('td.e-table__col-actions e-tooltip[content="Edit"] a[href]') ||
        row.querySelector('td.e-table__col-actions e-tooltip[content="edit"] a[href]') ||
        row.querySelector('td.e-table__col-actions a.e-datagrid__item_action[href*="camp_id"]') ||
        row.querySelector("td.e-table__col-actions a.e-datagrid__item_action[href]");
      const href = editLink ? String(editLink.getAttribute("href") || "").trim() : "";
      let id = parseCampaignIdFromEditHref(href);
      if (!id) id = parseCampaignIdFromHiddenIdCell(row);

      if (logDeep && rowIdx < maxRowElementLogs) {
        const tooltipsInRow = Array.from(row.querySelectorAll("td.e-table__col-actions e-tooltip")).slice(0, 8);
        const dataTdTextsByIndex = Array.from(cols).map((td, colIdx) => {
          const p = textContentPreview(td, 160);
          return { colIdx, text: p.text, length: p.length };
        });
        rowElementLogs.push({
          rowIdx,
          emailNameColumnIndex: emailIdx,
          titleTdHasSkeleton: false,
          rowTextContent: textContentPreview(row, 300),
          titleTdTextContent: textContentPreview(titleCell, 300),
          actionsTdTextContent: textContentPreview(actionsTd, 200),
          dataTdTextsByIndex,
          row: elementSnapshot(row, 220),
          titleCell: elementSnapshot(titleCell, 180),
          actionsTd: elementSnapshot(actionsTd, 220),
          editLink: elementSnapshot(editLink, 260),
          tooltips: tooltipsInRow.map((tt) => ({
            content: tt.getAttribute("content") || "",
            textContent: textContentPreview(tt, 120),
            snap: elementSnapshot(tt, 120)
          })),
          tdColCount: cols.length,
          titleTextLen: title.length,
          hrefLen: href.length,
          parsedId: id || ""
        });
      }

      if (!title) {
        skippedNoTitle++;
        return;
      }
      if (!id) {
        skippedNoId++;
        return;
      }
      if (!href) skippedNoHref++;
      rows.push({ id, title });
    });

    if (logDeep) {
      otherRecentDbg("scrape: per-row element samples (first rows)", rowElementLogs);
      otherRecentDbg("scrape: result counts", {
        parsedRows: rows.length,
        skippedSkeletonTitle,
        skippedNoTitle,
        skippedNoHref,
        skippedNoId,
        firstParsedTitles: rows.slice(0, 5).map((r) => r.title)
      });
    }

    const incompleteDueToSkeleton = skippedSkeletonTitle > 0;
    if (logDeep && rowList.length > 0 && rows.length === 0 && skippedSkeletonTitle > 0) {
      otherRecentDbg(
        "scrape: no parsed rows yet (skeleton in name column on at least one row); waiting for DOM mutations to rescrape"
      );
    }
    return { rows, incompleteDueToSkeleton };
  }

  function mergeOtherRecentCampaignRows(rows) {
    if (!rows || !rows.length) {
      otherRecentDbg("merge: skipped (0 rows from scrape) — chrome.storage.local not updated");
      return;
    }
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      console.error(OTHER_RECENT_LOG, "merge: chrome.storage.local unavailable");
      return;
    }
    chrome.storage.local.get({ [OTHER_RECENT_KEY]: { version: 1, items: [] } }, (res) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.error(OTHER_RECENT_LOG, "merge: storage.get failed", chrome.runtime.lastError.message);
        return;
      }
      const raw = res[OTHER_RECENT_KEY];
      const prev = Array.isArray(raw) ? raw : raw && Array.isArray(raw.items) ? raw.items : [];
      const map = new Map();
      prev.forEach((e) => {
        const id = String(e && e.id ? e.id : "").trim();
        if (!id) return;
        map.set(id, {
          id,
          title: String(e.title || "").trim(),
          loggedAt: Number.isFinite(e.loggedAt) ? e.loggedAt : 0
        });
      });
      const prevCount = map.size;
      const now = Date.now();
      rows.forEach((r, i) => {
        const id = String(r.id || "").trim();
        if (!id) return;
        map.set(id, {
          id,
          title: String(r.title || "").trim(),
          loggedAt: now - i
        });
      });
      const merged = Array.from(map.values())
        .sort((a, b) => (b.loggedAt || 0) - (a.loggedAt || 0))
        .slice(0, OTHER_RECENT_MAX);
      const fingerprint = merged
        .map((x) => `${String(x.id || "").trim()}\t${String(x.title || "").trim()}`)
        .join("\n");
      if (fingerprint === lastOtherRecentWriteFingerprint) {
        otherRecentDbg("merge: payload unchanged, skip chrome.storage.local.set");
        return;
      }
      chrome.storage.local.set({ [OTHER_RECENT_KEY]: { version: 1, items: merged } }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error(OTHER_RECENT_LOG, "merge: storage.set failed", chrome.runtime.lastError.message);
          return;
        }
        lastOtherRecentWriteFingerprint = fingerprint;
        otherRecentDbg("merge: wrote chrome.storage.local", {
          key: OTHER_RECENT_KEY,
          prevItemCount: prevCount,
          batchRowCount: rows.length,
          mergedItemCount: merged.length,
          sampleIds: merged.slice(0, 3).map((x) => x.id)
        });
      });
    });
  }

  function runOtherRecentCampaignScrapeOnce(reason) {
    otherRecentDbg("runScrapeOnce", { reason: reason || "unknown" });
    ensureOtherRecentGridObserver();
    const table = findCampaignListTableQuiet();
    if (!table) {
      otherRecentDbg("runScrapeOnce: aborted — table not found");
      return;
    }
    const { rows, incompleteDueToSkeleton } = scrapeCampaignListTableToRows(table);
    mergeOtherRecentCampaignRows(rows);
    if (incompleteDueToSkeleton) {
      if (otherRecentSkeletonRescrapeCount < OTHER_RECENT_SKELETON_MAX_FOLLOWUPS) {
        otherRecentSkeletonRescrapeCount += 1;
        scheduleOtherRecentCampaignScrape("skeleton-rows-incomplete", 480);
      } else {
        otherRecentDbg("runScrapeOnce: skeleton follow-up cap reached", OTHER_RECENT_SKELETON_MAX_FOLLOWUPS);
      }
    } else {
      otherRecentSkeletonRescrapeCount = 0;
    }
  }

  function scheduleOtherRecentCampaignScrape(reason, delayMs) {
    const delay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : OTHER_RECENT_DEFAULT_DEBOUNCE_MS;
    if (otherRecentScrapeTimer) clearTimeout(otherRecentScrapeTimer);
    otherRecentDbg("scheduleScrape: debouncing", `${delay}ms`, { reason: reason || "unknown" });
    otherRecentScrapeTimer = setTimeout(() => {
      otherRecentScrapeTimer = null;
      runOtherRecentCampaignScrapeOnce(reason || "debounced");
    }, delay);
  }

  function initOtherRecentCampaignsScraper() {
    installOtherRecentPagerClickHook();
    const tryBind = () => {
      const table = findCampaignListTable();
      if (!table) return false;
      otherRecentDbg("init: campaign table present; wiring grid observer + debounced scrape");
      ensureOtherRecentGridObserver();
      scheduleOtherRecentCampaignScrape("tryBind");
      scheduleCampaignListOverflowMenuInject(0);
      return true;
    };
    if (tryBind()) return;
    otherRecentDbg("init: table not ready; waiting for any campaign table selector", CAMPAIGN_TABLE_SELECTORS);
    waitForCampaignTable(() => {
      otherRecentDbg("init: waitForCampaignTable callback fired");
      tryBind();
    });
  }

  function waitForCampaignTable(callback) {
    const first = queryFirstCampaignTable();
    if (first.table) {
      otherRecentDbg("waitForCampaignTable: already present", first.selector);
      callback(first.table);
      return;
    }
    const root = document.body || document.documentElement;
    const observer = new MutationObserver(() => {
      const again = queryFirstCampaignTable();
      if (again.table) {
        observer.disconnect();
        otherRecentDbg("waitForCampaignTable: appeared", again.selector, again.via);
        callback(again.table);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  // ── Campaign list row: Edit Settings / Edit Content links (last tbody td) ──
  const EDIT_LINKS_TABLE_SELECTOR =
    "table.e-table.e-table-datagrid_overview.e-datagrid__table";
  let editLinksInjectTimer = null;
  let editLinksInjectRafId = 0;

  function findCampaignListEditLinksTable() {
    const scoped = [
      `#campaign-list-container ${EDIT_LINKS_TABLE_SELECTOR}`,
      `#main-datagrid ${EDIT_LINKS_TABLE_SELECTOR}`,
      EDIT_LINKS_TABLE_SELECTOR
    ];
    for (const sel of scoped) {
      let t = document.querySelector(sel);
      if (t) return t;
      t = querySelectorIncludingShadow(sel, document);
      if (t) return t;
    }
    return findCampaignListTableQuiet();
  }

  function getEditContentHrefFromRow(row) {
    if (!row || !row.querySelector) return "";
    const editA =
      row.querySelector('.e-tooltip[content="Edit"] a[href]') ||
      row.querySelector('e-tooltip[content="Edit"] a[href]') ||
      row.querySelector('td.e-table__col-actions .e-tooltip[content="Edit"] a[href]') ||
      row.querySelector('td.e-table__col-actions e-tooltip[content="Edit"] a[href]') ||
      row.querySelector('td.e-table__col-actions a.e-datagrid__item_action[aria-label="Edit"][href]') ||
      row.querySelector('td.e-table__col-actions a[href*="action=content"]');
    return editA ? String(editA.getAttribute("href") || "").trim() : "";
  }

  // ── Campaign list row: overflow menu ─────────────────────────────────────────
  const GEM_LIST_ROW_MENU_CLASS = "gem-campaign-list-row-menu-wrap";
  const OVERFLOW_TOGGLES_KEY = "gemEmailCampaignListOverflowToggles";
  const OVERFLOW_TOGGLES_DEFAULT = {
    editTranslations: true,
    distribute: true
  };
  let overflowMenuToggles = { ...OVERFLOW_TOGGLES_DEFAULT };
  const ROW_ACTIONS_SELECTOR = ".e-datagrid__item_actions.e-inputgroup.e-inputgroup-inline";
  const ROW_ACTIONS_SELECTOR_ALT = ".e-table__col.e-table__col.e-table__col-actions > div[class]";

  /** @type {{ wrap: HTMLElement, trigger: HTMLButtonElement, menu: HTMLElement } | null} */
  let openCampaignListRowMenu = null;
  let campaignListRowMenuListenersInstalled = false;

  function normalizeOverflowMenuToggles(toggles) {
    const src = toggles && typeof toggles === "object" ? toggles : {};
    return {
      editTranslations: src.editTranslations !== false,
      distribute: src.distribute !== false
    };
  }

  function removeCampaignListOverflowMenus() {
    document.querySelectorAll(`.${GEM_LIST_ROW_MENU_CLASS}`).forEach((el) => el.remove());
  }

  function reloadCampaignListOverflowMenus() {
    closeCampaignListRowMenu();
    removeCampaignListOverflowMenus();
    runCampaignListOverflowMenuInjectOnce();
  }

  function loadOverflowMenuToggles(done) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync) {
      overflowMenuToggles = normalizeOverflowMenuToggles(OVERFLOW_TOGGLES_DEFAULT);
      if (typeof done === "function") done();
      return;
    }
    chrome.storage.sync.get({ [OVERFLOW_TOGGLES_KEY]: OVERFLOW_TOGGLES_DEFAULT }, (res) => {
      overflowMenuToggles = normalizeOverflowMenuToggles(res && res[OVERFLOW_TOGGLES_KEY]);
      if (typeof done === "function") done();
    });
  }

  function initCampaignListOverflowMenuToggles(onReady) {
    loadOverflowMenuToggles(() => {
      if (typeof onReady === "function") onReady();
    });
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes[OVERFLOW_TOGGLES_KEY]) return;
      overflowMenuToggles = normalizeOverflowMenuToggles(changes[OVERFLOW_TOGGLES_KEY].newValue);
      reloadCampaignListOverflowMenus();
    });
  }

  function appendCampaignListRowMenuDivider(menu) {
    const divider = document.createElement("div");
    divider.className = "gem-recent-campaign-row-menu-divider";
    divider.setAttribute("role", "separator");
    menu.appendChild(divider);
  }

  function getListPageSessionId() {
    try {
      return new URL(window.location.href).searchParams.get("session_id") || "";
    } catch (_) {
      return "";
    }
  }

  function closeCampaignListRowMenu() {
    if (!openCampaignListRowMenu) return;
    const { wrap, trigger, menu } = openCampaignListRowMenu;
    menu.classList.remove(
      "gem-recent-campaign-row-menu--open",
      "gem-recent-campaign-row-menu--floating"
    );
    menu.style.removeProperty("top");
    menu.style.removeProperty("left");
    menu.style.removeProperty("visibility");
    trigger.setAttribute("aria-expanded", "false");
    // Return menu from body back to its wrap
    if (menu.parentNode !== wrap) {
      try { wrap.appendChild(menu); } catch (_) {}
    }
    openCampaignListRowMenu = null;
  }

  function positionCampaignListRowMenu(trigger, menu) {
    menu.classList.add("gem-recent-campaign-row-menu--floating");
    menu.style.visibility = "hidden";
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 4;
    let top = triggerRect.bottom + gap;
    let left = triggerRect.right - menuRect.width;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = triggerRect.top - menuRect.height - gap;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - menuRect.height - 8));
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.visibility = "";
  }

  function openCampaignListRowMenuAt(wrap) {
    closeCampaignListRowMenu();
    const trigger = wrap.querySelector(".gem-recent-campaign-row-menu-trigger");
    const menu = wrap.querySelector(".gem-recent-campaign-row-menu");
    if (!trigger || !menu) return;
    // Teleport menu to body to escape table stacking contexts
    document.body.appendChild(menu);
    menu.classList.add("gem-recent-campaign-row-menu--open");
    trigger.setAttribute("aria-expanded", "true");
    positionCampaignListRowMenu(trigger, menu);
    openCampaignListRowMenu = { wrap, trigger, menu };
  }

  function ensureCampaignListRowMenuListeners() {
    if (campaignListRowMenuListenersInstalled) return;
    campaignListRowMenuListenersInstalled = true;
    document.addEventListener(
      "click",
      (e) => {
        if (!openCampaignListRowMenu) return;
        if (openCampaignListRowMenu.wrap.contains(e.target)) return;
        closeCampaignListRowMenu();
      },
      true
    );
    window.addEventListener("scroll", closeCampaignListRowMenu, true);
    window.addEventListener("resize", closeCampaignListRowMenu);
  }

  function rowHasEditContentAction(actionsEl) {
    if (!actionsEl || !actionsEl.querySelector) return false;
    const editA =
      actionsEl.querySelector('e-tooltip[content="Edit"] > a[href]') ||
      actionsEl.querySelector('.e-tooltip[content="Edit"] > a[href]');
    const href = editA ? String(editA.getAttribute("href") || "") : "";
    return href.includes("action=content");
  }

  function getGoToReportingLinkFromRow(row) {
    if (!row || !row.querySelector) return null;
    return (
      row.querySelector('e-tooltip[content="Go to Reporting"] a.e-datagrid__item_action[href]') ||
      row.querySelector('e-tooltip[content="Go to Reporting"] a[href]')
    );
  }

  function getRowTooltipButtonFromRow(row, tooltipContent) {
    if (!row || !row.querySelector) return null;
    const content = String(tooltipContent || "").trim();
    if (!content) return null;
    return row.querySelector(`e-tooltip[content="${content}"] button`);
  }

  function getDeleteButtonFromRow(row) {
    return (
      getRowTooltipButtonFromRow(row, "Delete") ||
      (row && row.querySelector('button.e-datagrid__item_action[aria-label="Delete"]'))
    );
  }

  function triggerRowTooltipAction(row, tooltipContent, actionLabel) {
    closeCampaignListRowMenu();
    const btn = getRowTooltipButtonFromRow(row, tooltipContent);
    if (btn) {
      btn.click();
      return true;
    }
    console.warn(
      `[Gemma email-campaign-list] ${actionLabel} menu item: native button not found for row`,
      tooltipContent
    );
    return false;
  }

  function buildCampaignListRowOverflowMenu(campaignId, menuOpts) {
    const opts = menuOpts && typeof menuOpts === "object" ? menuOpts : {};
    const showEditContent = opts.showEditContent === true;
    const row = opts.row || null;
    const wrap = document.createElement("div");
    wrap.className = GEM_LIST_ROW_MENU_CLASS;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "gem-recent-campaign-row-menu-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `Options for campaign ${campaignId}`);

    const menu = document.createElement("div");
    menu.className = "gem-recent-campaign-row-menu";
    menu.setAttribute("role", "menu");

    function makeMenuItem(label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gem-recent-campaign-row-menu-item";
      btn.setAttribute("role", "menuitem");
      btn.textContent = label;
      return btn;
    }

    function buildContentUrl() {
      const sid = getListPageSessionId();
      const url = new URL("/bootstrap.php", window.location.origin);
      url.searchParams.set("r", "contentBlocks/campaign");
      url.searchParams.set("id", campaignId);
      if (sid) url.searchParams.set("session_id", sid);
      return url.toString();
    }

    function buildSettingsUrl() {
      const sid = getListPageSessionId();
      const url = new URL("/campaignmanager.php", window.location.origin);
      if (sid) url.searchParams.set("session_id", sid);
      url.searchParams.set("action", "details");
      url.searchParams.set("camp_id", campaignId);
      url.searchParams.set("step", "camp3");
      url.searchParams.set("sec", String(Date.now()));
      return url.toString();
    }

    function navigateCampaignUrl(url, e) {
      closeCampaignListRowMenu();
      if (e && (e.ctrlKey || e.metaKey)) {
        try {
          chrome.runtime.sendMessage({ action: "openInNewTab", url, active: false });
        } catch (_) {
          window.open(url, "_blank");
        }
        return;
      }
      window.location.assign(url);
    }

    if (getGoToReportingLinkFromRow(row)) {
      const reportingItem = makeMenuItem("Reporting");
      reportingItem.addEventListener("click", (e) => {
        e.stopPropagation();
        const link = getGoToReportingLinkFromRow(row);
        const href = link ? String(link.getAttribute("href") || "").trim() : "";
        if (!href) {
          console.warn("[Gemma email-campaign-list] Reporting menu item: native link not found for row");
          return;
        }
        navigateCampaignUrl(new URL(href, window.location.origin).toString(), e);
      });
      menu.appendChild(reportingItem);
    }

    const switchItem = makeMenuItem("Switch to tab");
    switchItem.classList.add("gem-recent-campaign-row-menu-item--hidden");
    switchItem.addEventListener("click", (e) => {
      e.stopPropagation();
      closeCampaignListRowMenu();
      chrome.runtime.sendMessage({
        action: "focusCampaignTab",
        campaignId: String(campaignId)
      });
    });
    menu.appendChild(switchItem);

    const editSettingsItem = makeMenuItem("Edit Settings");
    editSettingsItem.addEventListener("click", (e) => {
      e.stopPropagation();
      navigateCampaignUrl(buildSettingsUrl(), e);
    });
    menu.appendChild(editSettingsItem);

    if (showEditContent) {
      const editContentItem = makeMenuItem("Edit Content");
      editContentItem.addEventListener("click", (e) => {
        e.stopPropagation();
        navigateCampaignUrl(buildContentUrl(), e);
      });
      menu.appendChild(editContentItem);
    }

    if (overflowMenuToggles.editTranslations) {
      const translationsItem = makeMenuItem("Edit Translations");
      translationsItem.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerRowTooltipAction(row, "Edit Translations", "Edit Translations");
      });
      menu.appendChild(translationsItem);
    }

    const showDistribute = overflowMenuToggles.distribute;

    appendCampaignListRowMenuDivider(menu);

    const duplicateItem = document.createElement("button");
    duplicateItem.type = "button";
    duplicateItem.className = "gem-recent-campaign-row-menu-item";
    duplicateItem.setAttribute("role", "menuitem");

    const dupLabel = document.createElement("span");
    dupLabel.textContent = "Duplicate";

    const dupSpinner = document.createElement("span");
    dupSpinner.className = "gem-recent-campaign-duplicate-spinner";
    dupSpinner.setAttribute("aria-hidden", "true");
    dupSpinner.hidden = true;

    duplicateItem.appendChild(dupLabel);
    duplicateItem.appendChild(dupSpinner);

    duplicateItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (duplicateItem.disabled || duplicateItem.dataset.gemState === "busy") return;
      if (typeof window.gemDuplicateCampaign !== "function") return;

      duplicateItem.disabled = true;
      duplicateItem.dataset.gemState = "busy";
      dupSpinner.hidden = false;

      const sessionId = getListPageSessionId();
      window.gemDuplicateCampaign(campaignId, sessionId).then((res) => {
        if (!res || !res.ok || res.newCampaignId == null) {
          duplicateItem.disabled = false;
          delete duplicateItem.dataset.gemState;
          dupSpinner.hidden = true;
          showDuplicateCampaignError(res);
          return;
        }
        const newUrl = new URL("/campaignmanager.php", window.location.origin);
        if (sessionId) newUrl.searchParams.set("session_id", sessionId);
        newUrl.searchParams.set("action", "details");
        newUrl.searchParams.set("camp_id", String(res.newCampaignId));
        newUrl.searchParams.set("step", "camp3");
        newUrl.searchParams.set("sec", String(Date.now()));
        window.location.assign(newUrl.toString());
      });
    });
    menu.appendChild(duplicateItem);

    appendCampaignListRowMenuDivider(menu);

    if (showDistribute) {
      const distributeItem = makeMenuItem("Distribute");
      distributeItem.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerRowTooltipAction(row, "Distribute a copy to another account", "Distribute");
      });
      menu.appendChild(distributeItem);
    }

    const deleteItem = makeMenuItem("Delete");
    deleteItem.classList.add("gem-campaign-list-row-menu-item--danger");
    deleteItem.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerRowTooltipAction(row, "Delete", "Delete");
    });
    menu.appendChild(deleteItem);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (openCampaignListRowMenu && openCampaignListRowMenu.wrap === wrap) {
        closeCampaignListRowMenu();
      } else {
        ensureCampaignListRowMenuListeners();
        chrome.runtime.sendMessage(
          { action: "isCampaignTabOpen", campaignId: String(campaignId) },
          (res) => {
            if (chrome.runtime.lastError) {
              switchItem.classList.add("gem-recent-campaign-row-menu-item--hidden");
            } else if (res && res.ok && res.open) {
              switchItem.classList.remove("gem-recent-campaign-row-menu-item--hidden");
            } else {
              switchItem.classList.add("gem-recent-campaign-row-menu-item--hidden");
            }
            openCampaignListRowMenuAt(wrap);
          }
        );
      }
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    return wrap;
  }

  function injectCampaignListOverflowMenus(table) {
    if (!table || !table.querySelectorAll) return;
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const actionsEl =
        row.querySelector(ROW_ACTIONS_SELECTOR) ||
        row.querySelector(ROW_ACTIONS_SELECTOR_ALT);
      if (!actionsEl) return;
      if (actionsEl.querySelector(`.${GEM_LIST_ROW_MENU_CLASS}`)) return;

      const contentHref = getEditContentHrefFromRow(row);
      let campaignId = parseCampaignIdFromEditHref(contentHref);
      if (!campaignId) campaignId = parseCampaignIdFromHiddenIdCell(row);
      if (!campaignId) return;

      actionsEl.appendChild(buildCampaignListRowOverflowMenu(campaignId, {
        showEditContent: rowHasEditContentAction(actionsEl),
        row
      }));
    });
  }

  function runCampaignListOverflowMenuInjectOnce() {
    const table = findCampaignListEditLinksTable();
    if (!table) return;
    injectCampaignListOverflowMenus(table);
  }

  function scheduleCampaignListOverflowMenuInject(delayMs) {
    const delay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 80;
    if (editLinksInjectTimer) clearTimeout(editLinksInjectTimer);
    editLinksInjectTimer = setTimeout(() => {
      editLinksInjectTimer = null;
      if (editLinksInjectRafId) return;
      editLinksInjectRafId = requestAnimationFrame(() => {
        editLinksInjectRafId = 0;
        runCampaignListOverflowMenuInjectOnce();
      });
    }, delay);
  }

  function initCampaignListOverflowMenus() {
    const tryInject = () => {
      const table = findCampaignListEditLinksTable();
      if (!table) return false;
      ensureOtherRecentGridObserver();
      scheduleCampaignListOverflowMenuInject(0);
      return true;
    };
    if (tryInject()) return;
    waitForCampaignTable(() => {
      tryInject();
    });
  }

  function getCampaignListTableHeaderRow(table) {
    if (!table || !table.querySelector) return null;
    return (
      table.querySelector("thead tr.e-table__titles") ||
      table.querySelector("thead tr.e-datagrid__row") ||
      table.querySelector("thead tr.e-table__row") ||
      table.querySelector("thead tr")
    );
  }

  function getCampaignListTableEmailColumnIndex(table) {
    const theadRow = getCampaignListTableHeaderRow(table);
    if (!theadRow) return -1;
    const allTh = Array.from(theadRow.querySelectorAll("th"));
    const headerCellsFiltered = Array.from(theadRow.querySelectorAll("th.e-datagrid__column_header"));
    const headerThs = allTh.length ? allTh : headerCellsFiltered;
    return headerThs.findIndex((th) => {
      const titleEl = th.querySelector(".e-datagrid__column_header_title");
      const txt = ((titleEl && titleEl.textContent) || th.textContent || "").trim();
      const norm = txt.toLowerCase().replace(/\s+/g, " ").trim();
      return headerLabelMatchesEmailColumn(norm);
    });
  }

  function getCampaignListBodyRows(table) {
    if (!table || !table.querySelectorAll) return [];
    let bodyRows = table.querySelectorAll("tbody tr.e-datagrid__row");
    if (!bodyRows.length) bodyRows = table.querySelectorAll("tbody tr.e-table__row");
    if (!bodyRows.length) bodyRows = table.querySelectorAll("tbody tr");
    return Array.from(bodyRows);
  }

  function getCampaignIdFromRow(row) {
    if (!row) return "";
    let id = parseCampaignIdFromEditHref(getEditContentHrefFromRow(row));
    if (!id) id = parseCampaignIdFromHiddenIdCell(row);
    return String(id || "").trim();
  }

  function getEmailNameFromRow(row, emailIdx) {
    if (!row || emailIdx < 0) return "";
    const cols = row.querySelectorAll("td.e-table__col");
    const titleCell = cols[emailIdx];
    if (!titleCell || cellHasLoadingSkeleton(titleCell)) return "";
    return String(titleCell.textContent || "").trim();
  }

  function getCampaignFromPreviewButton(btn) {
    const row = btn && btn.closest ? btn.closest("tr") : null;
    if (!row) return { id: "", title: "" };
    const table = row.closest("table");
    const emailIdx = table ? getCampaignListTableEmailColumnIndex(table) : -1;
    const id = getCampaignIdFromRow(row);
    const title = getEmailNameFromRow(row, emailIdx);
    return { id, title };
  }

  const CAMPAIGN_LIST_ROOT_SELECTOR = '#email-campaign-list';
  const CAMPAIGN_LIST_PREVIEW_PANEL_ID = 'gem-campaign-list-preview-panel';
  const LIST_PREVIEW_ACTIVE_ROW_CLASS = 'gem-campaign-list-row--preview-active';
  const LIST_PREVIEW_HTML_OPEN_CLASS = 'gem-email-campaign-list-preview-open';
  const PREVIEW_BUTTON_SELECTOR = 'button[aria-label="Preview"]';
  const PREVIEW_TOOLTIP_SELECTOR = 'e-tooltip[content="Preview"]';
  const PREVIEW_PANEL_LOG = '[Gemma email-campaign-list][preview-panel]';
  const LIST_PREVIEW_LOADING_TIMEOUT_MS = 45000;
  const LIST_PREVIEW_SWAP_FLASH_MS = 180;
  const LIST_PREVIEW_POOL_SIZE = 5;
  const LIST_PREVIEW_ROW_HOVER_MS = 1000;
  const LIST_PREVIEW_PRIORITY_ACTIVE = 0;
  const LIST_PREVIEW_PRIORITY_ADJACENT = 1;
  const LIST_PREVIEW_PRIORITY_PREDICTIVE_HIGH = 2;
  const LIST_PREVIEW_PRIORITY_PREDICTIVE = 3;
  const PREVIEW_FS_IFRAME_MESSAGE_SOURCE = "gem-preview-fs-iframe";
  const LIST_PREVIEW_TEMPLATING_ERROR_MSG =
    "This preview could not be loaded. The campaign may have a templating issue.";

  let previewPanelClickHookInstalled = false;
  let previewPanelPrefetchInstalled = false;
  let previewPanelKeyboardInstalled = false;
  let previewPanelMessageInstalled = false;
  let listPreviewOpen = false;
  let listPreviewCampaignId = "";
  /** @type {ReturnType<typeof setTimeout> | null} */
  let listPreviewLoadingTimer = null;
  /** @type {HTMLIFrameElement[]} */
  let listPreviewPoolIframes = [];
  /** @type {Map<string, { iframe: HTMLIFrameElement, campId: string, ready: boolean, lastUsed: number, slotRole: string, loadToken: number, loadError?: string }>} */
  const listPreviewCacheByCampId = new Map();
  /** @type {Map<string, string>} */
  const listPreviewLoadErrorByCampId = new Map();
  /** @type {Map<HTMLIFrameElement, string>} */
  const listPreviewIframeToCampId = new Map();
  /** @type {{ iframe: HTMLIFrameElement, campId: string, priority: number, loadToken: number } | null} */
  let listPreviewBackgroundLoad = null;
  /** @type {{ campId: string, priority: number, slotRole: string }[]} */
  let listPreviewLoadQueue = [];
  let listPreviewLoadTokenSeq = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let listPreviewRowHoverTimer = null;
  /** @type {HTMLElement | null} */
  let listPreviewRowHoverRow = null;

  function previewPanelDbg(...args) {
    console.log(PREVIEW_PANEL_LOG, ...args);
  }

  function listPreviewPriorityLabel(priority) {
    switch (priority) {
      case LIST_PREVIEW_PRIORITY_ACTIVE:
        return "active";
      case LIST_PREVIEW_PRIORITY_ADJACENT:
        return "adjacent";
      case LIST_PREVIEW_PRIORITY_PREDICTIVE_HIGH:
        return "predictive-high";
      case LIST_PREVIEW_PRIORITY_PREDICTIVE:
        return "predictive";
      default:
        return String(priority);
    }
  }

  function listPreviewPreloadDbg(action, data) {
    previewPanelDbg(`[preload:${action}]`, data);
  }

  function listPreviewPreloadSkip(reason, campId, extra) {
    listPreviewPreloadDbg("skip", { reason, campId: campId || "", ...(extra || {}) });
  }

  function findCampaignListRoot() {
    return (
      document.querySelector(CAMPAIGN_LIST_ROOT_SELECTOR) ||
      querySelectorIncludingShadow(CAMPAIGN_LIST_ROOT_SELECTOR)
    );
  }

  function getEventComposedPath(ev) {
    if (ev && typeof ev.composedPath === "function") {
      return ev.composedPath();
    }
    const out = [];
    let node = ev && ev.target;
    while (node) {
      out.push(node);
      node = node.parentElement || (node.parentNode && node.parentNode.host) || null;
    }
    return out;
  }

  function isCampaignListGridEvent(ev) {
    return getEventComposedPath(ev).some(
      (node) =>
        node &&
        node.nodeType === Node.ELEMENT_NODE &&
        (node.id === "email-campaign-list" ||
          node.id === "campaign-list-container" ||
          node.id === "main-datagrid" ||
          (node.matches && node.matches(CAMPAIGN_LIST_ROOT_SELECTOR)))
    );
  }

  function findPreviewButtonInEventPath(ev) {
    for (const node of getEventComposedPath(ev)) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.matches) continue;
      if (node.matches(PREVIEW_BUTTON_SELECTOR)) return node;
      const btn = node.closest && node.closest(PREVIEW_BUTTON_SELECTOR);
      if (btn) return btn;
    }
    return null;
  }

  function findPreviewTooltipInEventPath(ev) {
    for (const node of getEventComposedPath(ev)) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.matches) continue;
      if (node.matches(PREVIEW_TOOLTIP_SELECTOR)) return node;
      const tip = node.closest && node.closest(PREVIEW_TOOLTIP_SELECTOR);
      if (tip) return tip;
    }
    return null;
  }

  function getCampaignListBodyRowFromEvent(ev) {
    if (!isCampaignListGridEvent(ev)) return null;
    for (const node of getEventComposedPath(ev)) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = (node.tagName || "").toLowerCase();
      if (tag !== "tr") continue;
      if (!node.closest || !node.closest("tbody")) continue;
      if (
        node.classList.contains("e-datagrid__row") ||
        node.classList.contains("e-table__row") ||
        node.querySelector("td.e-table__col")
      ) {
        return node;
      }
    }
    return null;
  }

  function getPreviewButtonFromEventTarget(target, ev) {
    const fromPath = ev ? findPreviewButtonInEventPath(ev) : null;
    if (fromPath) return fromPath;
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
    return target.closest(PREVIEW_BUTTON_SELECTOR);
  }

  function getPreviewTooltipFromEventTarget(target, ev) {
    const fromPath = ev ? findPreviewTooltipInEventPath(ev) : null;
    if (fromPath) return fromPath;
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
    return target.closest(PREVIEW_TOOLTIP_SELECTOR);
  }

  function getListPreviewPanel() {
    return document.getElementById(CAMPAIGN_LIST_PREVIEW_PANEL_ID);
  }

  function buildListPreviewIframeUrl(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return "";
    const url = new URL("/preview_fs_iframe.php", window.location.origin);
    const sid = getListPageSessionId();
    if (sid) url.searchParams.set("session_id", sid);
    url.searchParams.set("camp_id", id);
    return url.toString();
  }

  function getOrderedListCampaignIds() {
    const table = findCampaignListEditLinksTable() || findCampaignListTableQuiet();
    if (!table) return [];
    return getCampaignListBodyRows(table)
      .map(getCampaignIdFromRow)
      .filter(Boolean);
  }

  function getListPreviewPriorityCampIds(activeId) {
    const id = String(activeId || "").trim();
    if (!id) return [];
    const ids = getOrderedListCampaignIds();
    const idx = ids.indexOf(id);
    if (idx < 0) return [id];

    const priority = [id];
    const used = new Set([id]);

    if (idx + 1 < ids.length) {
      priority.push(ids[idx + 1]);
      used.add(ids[idx + 1]);
    }
    if (idx - 1 >= 0) {
      priority.push(ids[idx - 1]);
      used.add(ids[idx - 1]);
    }

    if (priority.length < 3) {
      const missingNext = idx + 1 >= ids.length;
      const missingPrev = idx - 1 < 0;

      if (missingNext && !missingPrev) {
        for (let i = idx - 2; i >= 0 && priority.length < 3; i--) {
          if (!used.has(ids[i])) {
            priority.push(ids[i]);
            used.add(ids[i]);
          }
        }
      } else if (missingPrev && !missingNext) {
        for (let i = idx + 2; i < ids.length && priority.length < 3; i++) {
          if (!used.has(ids[i])) {
            priority.push(ids[i]);
            used.add(ids[i]);
          }
        }
      } else {
        for (let o = 2; priority.length < 3 && (idx + o < ids.length || idx - o >= 0); o++) {
          if (idx + o < ids.length && !used.has(ids[idx + o])) {
            priority.push(ids[idx + o]);
            used.add(ids[idx + o]);
          }
          if (priority.length >= 3) break;
          if (idx - o >= 0 && !used.has(ids[idx - o])) {
            priority.push(ids[idx - o]);
            used.add(ids[idx - o]);
          }
        }
      }
    }

    return priority;
  }

  function findCampaignListRowByCampaignId(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return null;
    const table = findCampaignListEditLinksTable() || findCampaignListTableQuiet();
    if (!table) return null;
    for (const row of getCampaignListBodyRows(table)) {
      if (getCampaignIdFromRow(row) === id) return row;
    }
    return null;
  }

  function getCampaignListScrollContainer(row) {
    if (!row) return null;
    const wrapper = row.closest(".e-datagrid__table_wrapper");
    if (wrapper) return wrapper;

    let el = row.parentElement;
    while (el) {
      if (el.matches && el.matches(CAMPAIGN_LIST_ROOT_SELECTOR)) break;
      try {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight
        ) {
          return el;
        }
      } catch (_) {}
      el = el.parentElement;
    }
    return null;
  }

  function scrollListPreviewActiveRowIntoView() {
    if (!listPreviewOpen || !listPreviewCampaignId) return;
    if (typeof window.gemScrollIntoViewIfNeeded !== "function") return;

    requestAnimationFrame(() => {
      const row = findCampaignListRowByCampaignId(listPreviewCampaignId);
      if (!row) return;
      const scrollRoot = getCampaignListScrollContainer(row);
      if (!scrollRoot) return;
      window.gemScrollIntoViewIfNeeded(row, { scrollRoot, padding: 8 });
    });
  }

  function getListPreviewCacheEntry(campaignId) {
    return listPreviewCacheByCampId.get(String(campaignId || "").trim()) || null;
  }

  function isListPreviewCachedReady(campaignId) {
    const entry = getListPreviewCacheEntry(campaignId);
    return !!(entry && entry.ready && entry.campId === String(campaignId || "").trim());
  }

  function isListPreviewLoadError(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return false;
    if (listPreviewLoadErrorByCampId.has(id)) return true;
    const entry = getListPreviewCacheEntry(id);
    return !!(entry && entry.loadError);
  }

  function clearListPreviewLoadError(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return;
    listPreviewLoadErrorByCampId.delete(id);
    const entry = getListPreviewCacheEntry(id);
    if (entry) delete entry.loadError;
  }

  function markListPreviewLoadError(campaignId, reason) {
    const id = String(campaignId || "").trim();
    if (!id) return;
    const errorReason = reason || "templating";
    listPreviewLoadErrorByCampId.set(id, errorReason);
    const entry = getListPreviewCacheEntry(id);
    if (entry) entry.loadError = errorReason;
    if (listPreviewOpen && listPreviewCampaignId === id) {
      setListPreviewOverlay("error", { message: LIST_PREVIEW_TEMPLATING_ERROR_MSG });
    }
  }

  function applyListPreviewPendingLoadError(campaignId, entry) {
    const id = String(campaignId || "").trim();
    if (!id || !entry) return;
    if (listPreviewLoadErrorByCampId.has(id)) {
      entry.loadError = listPreviewLoadErrorByCampId.get(id);
    }
  }

  function syncListPreviewOverlayForActiveCampId(campaignId) {
    const id = String(campaignId || "").trim();
    if (!listPreviewOpen || listPreviewCampaignId !== id) return;
    if (isListPreviewLoadError(id)) {
      setListPreviewOverlay("error", { message: LIST_PREVIEW_TEMPLATING_ERROR_MSG });
    } else if (isListPreviewCachedReady(id)) {
      setListPreviewOverlay("none");
    }
  }

  function removeListPreviewCacheEntry(campId, reason) {
    const id = String(campId || "").trim();
    const entry = listPreviewCacheByCampId.get(id);
    if (!entry) return;

    if (reason) {
      listPreviewPreloadDbg(reason, {
        campId: id,
        slotRole: entry.slotRole,
        wasReady: entry.ready,
        cacheSizeAfter: listPreviewCacheByCampId.size - 1,
      });
    }

    listPreviewCacheByCampId.delete(id);
    listPreviewLoadErrorByCampId.delete(id);
    listPreviewIframeToCampId.delete(entry.iframe);
    entry.iframe.classList.remove(
      "gem-campaign-list-preview-iframe--active",
      "gem-campaign-list-preview-iframe--cached"
    );
    delete entry.iframe.dataset.gemPreviewCampId;
  }

  function clearListPreviewIframeEntry(iframe, reason) {
    const campId = listPreviewIframeToCampId.get(iframe);
    if (campId) removeListPreviewCacheEntry(campId, reason);
    iframe.removeAttribute("src");
    iframe.classList.remove(
      "gem-campaign-list-preview-iframe--active",
      "gem-campaign-list-preview-iframe--cached"
    );
    delete iframe.dataset.gemPreviewCampId;
  }

  function evictLruListPreviewSlot(excludeCampId) {
    const exclude = String(excludeCampId || "").trim();
    let oldest = null;
    let oldestTime = Infinity;

    listPreviewCacheByCampId.forEach((entry, campId) => {
      if (campId === exclude) return;
      if (campId === listPreviewCampaignId) return;
      if (
        listPreviewBackgroundLoad &&
        listPreviewBackgroundLoad.campId === campId
      ) {
        return;
      }
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldest = entry;
      }
    });

    if (!oldest) return null;
    const evictedId = oldest.campId;
    oldest.iframe.setAttribute("src", "about:blank");
    removeListPreviewCacheEntry(evictedId, "evicted");
    return oldest.iframe;
  }

  function getFreeListPreviewIframe(preferredCampId) {
    for (const iframe of listPreviewPoolIframes) {
      if (!listPreviewIframeToCampId.has(iframe)) return iframe;
    }
    return evictLruListPreviewSlot(preferredCampId);
  }

  function bindListPreviewIframeLoad(iframe, campId, loadToken, startedAt) {
    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      const entry = listPreviewCacheByCampId.get(campId);
      if (!entry || entry.loadToken !== loadToken) {
        listPreviewPreloadDbg("finished-stale", {
          campId,
          loadToken,
          hasEntry: !!entry,
          entryToken: entry ? entry.loadToken : null,
        });
        return;
      }

      entry.ready = true;
      entry.lastUsed = Date.now();
      applyListPreviewPendingLoadError(campId, entry);

      listPreviewPreloadDbg("finished", {
        campId,
        slotRole: entry.slotRole,
        loadToken,
        elapsedMs: startedAt ? Date.now() - startedAt : null,
        cacheSize: listPreviewCacheByCampId.size,
        isActiveTarget: listPreviewOpen && campId === listPreviewCampaignId,
      });

      if (
        listPreviewBackgroundLoad &&
        listPreviewBackgroundLoad.campId === campId &&
        listPreviewBackgroundLoad.loadToken === loadToken
      ) {
        listPreviewBackgroundLoad = null;
      }

      if (listPreviewOpen && campId === listPreviewCampaignId) {
        swapActivePreviewIframe(campId);
        if (entry.loadError) {
          setListPreviewOverlay("error", { message: LIST_PREVIEW_TEMPLATING_ERROR_MSG });
        } else {
          setListPreviewOverlay("none");
        }
        enqueueListPreviewAdjacentLoads(campId);
        scrollListPreviewActiveRowIntoView();
      }

      drainListPreviewLoadQueue();
    };
    iframe.addEventListener("load", onLoad);
  }

  function startListPreviewIframeLoad(campaignId, slotRole, priority) {
    const campId = String(campaignId || "").trim();
    if (!campId) return false;

    clearListPreviewLoadError(campId);

    const existing = getListPreviewCacheEntry(campId);
    if (existing && existing.ready) {
      existing.lastUsed = Date.now();
      existing.slotRole = slotRole;
      return true;
    }
    if (existing && !existing.ready) {
      existing.slotRole = slotRole;
      return true;
    }

    const nextSrc = buildListPreviewIframeUrl(campId);
    if (!nextSrc) return false;

    let iframe = getFreeListPreviewIframe(campId);
    if (!iframe) return false;

    const prevCampId = listPreviewIframeToCampId.get(iframe);
    if (prevCampId && prevCampId !== campId) {
      removeListPreviewCacheEntry(prevCampId, "replaced");
    }

    const loadToken = ++listPreviewLoadTokenSeq;
    const startedAt = Date.now();
    const entry = {
      iframe,
      campId,
      ready: false,
      lastUsed: startedAt,
      slotRole,
      loadToken,
      startedAt,
    };

    listPreviewCacheByCampId.set(campId, entry);
    listPreviewIframeToCampId.set(iframe, campId);
    iframe.dataset.gemPreviewCampId = campId;
    iframe.classList.add("gem-campaign-list-preview-iframe--cached");
    iframe.classList.remove("gem-campaign-list-preview-iframe--active");

    listPreviewBackgroundLoad = { iframe, campId, priority, loadToken };
    bindListPreviewIframeLoad(iframe, campId, loadToken, startedAt);
    iframe.setAttribute("src", nextSrc);

    listPreviewPreloadDbg("started", {
      campId,
      slotRole,
      priority: listPreviewPriorityLabel(priority),
      loadToken,
      cacheSize: listPreviewCacheByCampId.size,
      url: nextSrc,
    });
    return true;
  }

  function cancelListPreviewBackgroundLoad(reason) {
    if (!listPreviewBackgroundLoad) return;
    const { iframe, campId, priority, loadToken } = listPreviewBackgroundLoad;
    listPreviewBackgroundLoad = null;
    const entry = getListPreviewCacheEntry(campId);
    if (entry && !entry.ready && entry.iframe === iframe) {
      listPreviewPreloadDbg("cancelled", {
        campId,
        reason: reason || "unknown",
        priority: listPreviewPriorityLabel(priority),
        loadToken,
        elapsedMs: entry.startedAt ? Date.now() - entry.startedAt : null,
      });
      iframe.setAttribute("src", "about:blank");
      removeListPreviewCacheEntry(campId);
    }
  }

  function scheduleListPreviewBackgroundLoad(campaignId, priority, slotRole) {
    const campId = String(campaignId || "").trim();
    if (!campId) return;
    if (campId === listPreviewCampaignId && isListPreviewCachedReady(campId)) {
      listPreviewPreloadSkip("already-active-ready", campId);
      return;
    }
    if (isListPreviewCachedReady(campId)) {
      listPreviewPreloadSkip("already-cached-ready", campId);
      return;
    }

    const existingEntry = getListPreviewCacheEntry(campId);
    if (existingEntry && !existingEntry.ready) {
      if (
        listPreviewBackgroundLoad &&
        listPreviewBackgroundLoad.campId === campId
      ) {
        listPreviewPreloadSkip("already-loading", campId, {
          loadToken: existingEntry.loadToken,
        });
        return;
      }
    }

    if (listPreviewBackgroundLoad) {
      if (priority < listPreviewBackgroundLoad.priority) {
        cancelListPreviewBackgroundLoad("preempted-by-higher-priority");
      } else if (listPreviewBackgroundLoad.campId === campId) {
        return;
      } else {
        const queued = listPreviewLoadQueue.some((item) => item.campId === campId);
        if (!queued) {
          listPreviewLoadQueue.push({ campId, priority, slotRole });
          listPreviewLoadQueue.sort((a, b) => a.priority - b.priority);
          listPreviewPreloadDbg("queued", {
            campId,
            slotRole,
            priority: listPreviewPriorityLabel(priority),
            queueLength: listPreviewLoadQueue.length,
            blockedBy: listPreviewBackgroundLoad.campId,
          });
        }
        return;
      }
    }

    if (!startListPreviewIframeLoad(campId, slotRole, priority)) {
      const queued = listPreviewLoadQueue.some((item) => item.campId === campId);
      if (!queued) {
        listPreviewLoadQueue.push({ campId, priority, slotRole });
        listPreviewLoadQueue.sort((a, b) => a.priority - b.priority);
        listPreviewPreloadDbg("queued", {
          campId,
          slotRole,
          priority: listPreviewPriorityLabel(priority),
          queueLength: listPreviewLoadQueue.length,
          reason: "no-free-iframe",
        });
      }
    }
  }

  function drainListPreviewLoadQueue() {
    if (listPreviewBackgroundLoad) return;

    while (listPreviewLoadQueue.length) {
      const next = listPreviewLoadQueue.shift();
      if (!next) break;
      if (isListPreviewCachedReady(next.campId)) continue;
      if (startListPreviewIframeLoad(next.campId, next.slotRole, next.priority)) {
        break;
      }
    }
  }

  function enqueueListPreviewAdjacentLoads(activeCampId) {
    const priorityIds = getListPreviewPriorityCampIds(activeCampId);
    const roles = ["adjacentNext", "adjacentPrev"];
    for (let i = 1; i < priorityIds.length && i <= 2; i++) {
      scheduleListPreviewBackgroundLoad(
        priorityIds[i],
        LIST_PREVIEW_PRIORITY_ADJACENT,
        roles[i - 1] || "adjacentNext"
      );
    }
  }

  function prefetchListPreviewCampaign(campaignId, priority, slotRole, trigger) {
    if (!campaignId) return;
    listPreviewPreloadDbg("trigger", {
      campId: String(campaignId),
      priority: listPreviewPriorityLabel(priority),
      slotRole: slotRole || "predictive",
      trigger: trigger || "unknown",
    });
    ensureListPreviewPoolInitialized();
    scheduleListPreviewBackgroundLoad(campaignId, priority, slotRole || "predictive");
  }

  function swapActivePreviewIframe(campaignId) {
    const campId = String(campaignId || "").trim();
    if (!campId) return false;

    const entry = getListPreviewCacheEntry(campId);
    if (!entry || !entry.ready) return false;

    listPreviewPoolIframes.forEach((iframe) => {
      iframe.classList.remove("gem-campaign-list-preview-iframe--active");
      iframe.classList.add("gem-campaign-list-preview-iframe--cached");
      const cachedEntry = getListPreviewCacheEntry(listPreviewIframeToCampId.get(iframe) || "");
      if (cachedEntry) cachedEntry.slotRole = cachedEntry.slotRole === "active" ? "predictive" : cachedEntry.slotRole;
    });

    entry.iframe.classList.remove("gem-campaign-list-preview-iframe--cached");
    entry.iframe.classList.add("gem-campaign-list-preview-iframe--active");
    entry.slotRole = "active";
    entry.lastUsed = Date.now();
    return true;
  }

  function ensureListPreviewOverlayMessage(overlay) {
    if (!overlay) return null;
    let messageEl = overlay.querySelector(".gem-campaign-list-preview-loading-message");
    if (!messageEl) {
      messageEl = document.createElement("div");
      messageEl.className = "gem-campaign-list-preview-loading-message";
      messageEl.setAttribute("role", "alert");
      overlay.appendChild(messageEl);
    }
    return messageEl;
  }

  function setListPreviewOverlay(mode, options) {
    const opts = options && typeof options === "object" ? options : {};
    const panel = getListPreviewPanel();
    if (!panel) return;
    const overlay = panel.querySelector(".gem-campaign-list-preview-loading");
    if (!overlay) return;
    const spinner = overlay.querySelector(".gem-campaign-list-preview-loading-spinner");
    const messageEl = ensureListPreviewOverlayMessage(overlay);

    overlay.classList.remove(
      "gem-campaign-list-preview-loading--dimmed",
      "gem-campaign-list-preview-loading--spinner",
      "gem-campaign-list-preview-loading--flash",
      "gem-campaign-list-preview-loading--error"
    );

    if (listPreviewLoadingTimer) {
      clearTimeout(listPreviewLoadingTimer);
      listPreviewLoadingTimer = null;
    }

    if (mode === "none") {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      if (spinner) spinner.hidden = false;
      if (messageEl) messageEl.hidden = true;
      return;
    }

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");

    if (mode === "error") {
      overlay.classList.add("gem-campaign-list-preview-loading--error");
      if (spinner) spinner.hidden = true;
      if (messageEl) {
        messageEl.textContent = opts.message || LIST_PREVIEW_TEMPLATING_ERROR_MSG;
        messageEl.hidden = false;
      }
      return;
    }

    if (spinner) spinner.hidden = false;
    if (messageEl) messageEl.hidden = true;

    if (mode === "dimmed") {
      overlay.classList.add("gem-campaign-list-preview-loading--dimmed");
    } else if (mode === "spinner") {
      overlay.classList.add("gem-campaign-list-preview-loading--spinner");
    } else if (mode === "flash") {
      overlay.classList.add("gem-campaign-list-preview-loading--flash");
      overlay.classList.add("gem-campaign-list-preview-loading--spinner");
    }

    const autoHideMs =
      opts.autoHideMs !== undefined
        ? opts.autoHideMs
        : LIST_PREVIEW_LOADING_TIMEOUT_MS;

    if (autoHideMs > 0) {
      listPreviewLoadingTimer = setTimeout(() => setListPreviewOverlay("none"), autoHideMs);
    }
  }

  function playListPreviewSwapTransition() {
    setListPreviewOverlay("flash", { autoHideMs: LIST_PREVIEW_SWAP_FLASH_MS });
  }

  function listPreviewActiveRowIsSynced(scope) {
    const root = scope || findCampaignListRoot() || document;
    const marked = root.querySelectorAll(`tr.${LIST_PREVIEW_ACTIVE_ROW_CLASS}`);

    if (!listPreviewOpen || !listPreviewCampaignId) {
      return marked.length === 0;
    }

    const row = findCampaignListRowByCampaignId(listPreviewCampaignId);
    if (!row) return marked.length === 0;
    return marked.length === 1 && marked[0] === row;
  }

  function syncListPreviewActiveRowIfNeeded() {
    const scope = findCampaignListRoot() || document;
    if (listPreviewActiveRowIsSynced(scope)) return;
    syncListPreviewActiveRow();
  }

  function syncListPreviewActiveRow() {
    const scope = findCampaignListRoot() || document;

    if (!listPreviewOpen || !listPreviewCampaignId) {
      scope.querySelectorAll(`tr.${LIST_PREVIEW_ACTIVE_ROW_CLASS}`).forEach((row) => {
        row.classList.remove(LIST_PREVIEW_ACTIVE_ROW_CLASS);
      });
      return;
    }

    const row = findCampaignListRowByCampaignId(listPreviewCampaignId);
    const marked = scope.querySelectorAll(`tr.${LIST_PREVIEW_ACTIVE_ROW_CLASS}`);

    if (row && marked.length === 1 && marked[0] === row) {
      scrollListPreviewActiveRowIntoView();
      return;
    }

    marked.forEach((activeRow) => {
      if (activeRow !== row) activeRow.classList.remove(LIST_PREVIEW_ACTIVE_ROW_CLASS);
    });

    if (row && !row.classList.contains(LIST_PREVIEW_ACTIVE_ROW_CLASS)) {
      row.classList.add(LIST_PREVIEW_ACTIVE_ROW_CLASS);
    }

    scrollListPreviewActiveRowIntoView();
  }

  function syncListPreviewPanelChrome() {
    const panel = getListPreviewPanel();
    const listRoot = findCampaignListRoot();
    if (!panel) return;

    panel.classList.toggle("gem-campaign-list-preview-panel--open", listPreviewOpen);
    document.documentElement.classList.toggle(LIST_PREVIEW_HTML_OPEN_CLASS, listPreviewOpen);
    if (listRoot) {
      listRoot.classList.toggle(LIST_PREVIEW_HTML_OPEN_CLASS, listPreviewOpen);
    }
    syncListPreviewActiveRow();
  }

  function showListPreview(campaignId) {
    const campId = String(campaignId || "").trim();
    if (!campId) return false;

    ensureListPreviewPoolInitialized();

    if (isListPreviewCachedReady(campId)) {
      swapActivePreviewIframe(campId);
      if (isListPreviewLoadError(campId)) {
        setListPreviewOverlay("error", { message: LIST_PREVIEW_TEMPLATING_ERROR_MSG });
      } else {
        playListPreviewSwapTransition();
      }
      enqueueListPreviewAdjacentLoads(campId);
      scrollListPreviewActiveRowIntoView();
      return true;
    }

    const hasVisibleActive =
      listPreviewCampaignId &&
      isListPreviewCachedReady(listPreviewCampaignId) &&
      listPreviewCampaignId !== campId;

    const pendingEntry = getListPreviewCacheEntry(campId);
    if (pendingEntry && !pendingEntry.ready) {
      if (hasVisibleActive) {
        setListPreviewOverlay("dimmed");
      } else {
        setListPreviewOverlay("spinner");
      }
      return true;
    }

    if (hasVisibleActive) {
      setListPreviewOverlay("dimmed");
    } else {
      setListPreviewOverlay("spinner");
    }

    cancelListPreviewBackgroundLoad("active-selection");
    listPreviewLoadQueue = listPreviewLoadQueue.filter((item) => item.campId !== campId);
    startListPreviewIframeLoad(campId, "active", LIST_PREVIEW_PRIORITY_ACTIVE);
    return true;
  }

  function openListPreview(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return false;
    listPreviewOpen = true;
    listPreviewCampaignId = id;
    syncListPreviewPanelChrome();
    showListPreview(id);
    return true;
  }

  function closeListPreview() {
    if (!listPreviewOpen) return false;
    listPreviewOpen = false;
    listPreviewCampaignId = "";
    setListPreviewOverlay("none");
    syncListPreviewPanelChrome();
    return true;
  }

  function getLaunchMonitoringFromEventTarget(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
    return target.closest('e-tooltip[content="Launch Monitoring"]');
  }

  function handleLaunchMonitoringClick(ev) {
    if (!listPreviewOpen) return;
    if (!getLaunchMonitoringFromEventTarget(ev.target)) return;
    closeListPreview();
  }

  function ensureListPreviewPoolInitialized() {
    const listRoot = findCampaignListRoot();
    if (listRoot) ensureCampaignListPreviewPanel(listRoot);
  }

  function ensureListPreviewPanelChrome(panel) {
    if (!panel) return;

    panel.querySelector(".gem-campaign-list-preview-toolbar")?.remove();

    let wrap = panel.querySelector(".gem-campaign-list-preview-iframe-wrap");
    if (!wrap) {
      panel.innerHTML = `
        <div class="gem-campaign-list-preview-iframe-wrap">
          <div class="gem-campaign-list-preview-iframe-stack"></div>
          <div class="gem-campaign-list-preview-loading" hidden aria-hidden="true">
            <div class="gem-campaign-list-preview-loading-spinner" aria-hidden="true"></div>
            <div class="gem-campaign-list-preview-loading-message" role="alert" hidden></div>
          </div>
        </div>
      `.trim();
      wrap = panel.querySelector(".gem-campaign-list-preview-iframe-wrap");
    }

    let stack = wrap && wrap.querySelector(".gem-campaign-list-preview-iframe-stack");
    if (!stack) {
      wrap.innerHTML = `
        <div class="gem-campaign-list-preview-iframe-stack"></div>
        <div class="gem-campaign-list-preview-loading" hidden aria-hidden="true">
          <div class="gem-campaign-list-preview-loading-spinner" aria-hidden="true"></div>
          <div class="gem-campaign-list-preview-loading-message" role="alert" hidden></div>
        </div>
      `.trim();
      stack = wrap.querySelector(".gem-campaign-list-preview-iframe-stack");
      listPreviewPoolIframes = [];
      listPreviewCacheByCampId.clear();
      listPreviewLoadErrorByCampId.clear();
      listPreviewIframeToCampId.clear();
    }

    if (!stack) return;

    if (listPreviewPoolIframes.length >= LIST_PREVIEW_POOL_SIZE) return;

    stack.innerHTML = "";
    listPreviewPoolIframes = [];

    for (let i = 0; i < LIST_PREVIEW_POOL_SIZE; i++) {
      const iframe = document.createElement("iframe");
      iframe.className = "gem-campaign-list-preview-iframe gem-campaign-list-preview-iframe--cached";
      iframe.title = "Campaign preview";
      iframe.dataset.gemPoolIndex = String(i);
      stack.appendChild(iframe);
      listPreviewPoolIframes.push(iframe);
    }
  }

  function ensureCampaignListPreviewPanel(listRoot) {
    if (!listRoot) return null;

    let panel = getListPreviewPanel();
    if (panel) {
      if (!listRoot.contains(panel)) listRoot.appendChild(panel);
      ensureListPreviewPanelChrome(panel);
      return panel;
    }

    panel = document.createElement("div");
    panel.id = CAMPAIGN_LIST_PREVIEW_PANEL_ID;
    listRoot.appendChild(panel);
    ensureListPreviewPanelChrome(panel);
    return panel;
  }

  function handlePreviewButtonClick(ev, btn) {
    ev.preventDefault();
    ev.stopPropagation();

    const { id } = getCampaignFromPreviewButton(btn);
    if (!id) {
      previewPanelDbg("Preview clicked but campaign ID could not be resolved from row");
      return;
    }

    const listRoot = findCampaignListRoot();
    if (!listRoot) {
      previewPanelDbg("Preview clicked but #email-campaign-list was not found");
      return;
    }

    ensureCampaignListPreviewPanel(listRoot);
    openListPreview(id);
  }

  function shouldIgnorePreviewRowClick(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return true;
    if (target.closest(`.${GEM_LIST_ROW_MENU_CLASS}, .gem-recent-campaign-row-menu`)) return true;
    if (target.closest("button, a")) return true;
    return false;
  }

  function getCampaignListRowFromTarget(target, ev) {
    const fromEvent = ev ? getCampaignListBodyRowFromEvent(ev) : null;
    if (fromEvent) return fromEvent;
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
    const row = target.closest("tr");
    if (!row || !row.closest("tbody")) return null;
    if (row.closest(CAMPAIGN_LIST_ROOT_SELECTOR)) return row;
    return null;
  }

  function clearListPreviewRowHoverTimer() {
    if (listPreviewRowHoverTimer) {
      clearTimeout(listPreviewRowHoverTimer);
      listPreviewRowHoverTimer = null;
    }
    listPreviewRowHoverRow = null;
  }

  function handleListPreviewRowMouseOver(ev) {
    if (!isCampaignListGridEvent(ev)) return;
    const row = getCampaignListBodyRowFromEvent(ev);
    if (!row) return;
    const related = ev.relatedTarget;
    if (related && row.contains(related)) return;
    if (findPreviewButtonInEventPath(ev) || findPreviewTooltipInEventPath(ev)) return;

    clearListPreviewRowHoverTimer();
    listPreviewRowHoverRow = row;
    listPreviewRowHoverTimer = setTimeout(() => {
      listPreviewRowHoverTimer = null;
      if (listPreviewRowHoverRow !== row) return;
      const id = getCampaignIdFromRow(row);
      if (!id || id === listPreviewCampaignId) return;
      prefetchListPreviewCampaign(id, LIST_PREVIEW_PRIORITY_PREDICTIVE, "predictive", "row-hover");
    }, LIST_PREVIEW_ROW_HOVER_MS);
  }

  function handleListPreviewRowMouseOut(ev) {
    if (!isCampaignListGridEvent(ev)) return;
    const row = getCampaignListBodyRowFromEvent(ev);
    if (!row) return;
    const related = ev.relatedTarget;
    if (related && row.contains(related)) return;
    if (listPreviewRowHoverRow !== row) return;
    clearListPreviewRowHoverTimer();
  }

  function handleListPreviewPreviewTargetMouseOver(ev) {
    if (!isCampaignListGridEvent(ev)) return;
    const btn = findPreviewButtonInEventPath(ev);
    const tooltip = findPreviewTooltipInEventPath(ev);
    if (!btn && !tooltip) return;

    const row = (btn || tooltip).closest("tr");
    if (!row) return;
    const id = getCampaignIdFromRow(row);
    if (!id) {
      listPreviewPreloadSkip("preview-hover-no-campaign-id", "", {
        hasBtn: !!btn,
        hasTooltip: !!tooltip,
      });
      return;
    }
    if (id === listPreviewCampaignId) {
      listPreviewPreloadSkip("preview-hover-is-active", id);
      return;
    }
    prefetchListPreviewCampaign(id, LIST_PREVIEW_PRIORITY_PREDICTIVE_HIGH, "predictive", "preview-hover");
  }

  function handleListPreviewRowPointerDown(ev) {
    if (!isCampaignListGridEvent(ev)) return;
    if (shouldIgnorePreviewRowClick(ev.target)) return;
    const row = getCampaignListBodyRowFromEvent(ev);
    if (!row) return;
    const id = getCampaignIdFromRow(row);
    if (!id || id === listPreviewCampaignId) return;
    prefetchListPreviewCampaign(id, LIST_PREVIEW_PRIORITY_PREDICTIVE_HIGH, "predictive", "row-pointerdown");
  }

  function getListPreviewSiblingCampaignId(offset) {
    const ids = getOrderedListCampaignIds();
    const idx = ids.indexOf(listPreviewCampaignId);
    if (idx < 0) return "";
    const nextIdx = idx + offset;
    if (nextIdx < 0 || nextIdx >= ids.length) return "";
    return ids[nextIdx];
  }

  function isListPreviewKeyboardTypingTarget(target) {
    if (!target) return false;
    const el = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function handleListPreviewKeyDown(ev) {
    if (!listPreviewOpen || !listPreviewCampaignId) return;
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
    if (ev.isComposing) return;

    const activeEl = document.activeElement;
    if (isListPreviewKeyboardTypingTarget(activeEl || ev.target)) return;

    const offset = ev.key === "ArrowLeft" ? -1 : 1;
    const nextId = getListPreviewSiblingCampaignId(offset);
    if (!nextId || nextId === listPreviewCampaignId) return;

    ev.preventDefault();
    ev.stopPropagation();
    openListPreview(nextId);
  }

  function initCampaignListPreviewKeyboard() {
    if (previewPanelKeyboardInstalled) return;
    previewPanelKeyboardInstalled = true;
    document.addEventListener("keydown", handleListPreviewKeyDown, true);
  }

  function handleCampaignListRowPreviewClick(ev) {
    if (!listPreviewOpen) return;
    if (shouldIgnorePreviewRowClick(ev.target)) return;

    const row = getCampaignListRowFromTarget(ev.target, ev);
    if (!row) return;

    const id = getCampaignIdFromRow(row);
    if (!id || id === listPreviewCampaignId) return;

    openListPreview(id);
  }

  function handlePreviewFsIframeMessage(ev) {
    if (!ev || ev.origin !== window.location.origin) return;
    const data = ev.data;
    if (!data || data.source !== PREVIEW_FS_IFRAME_MESSAGE_SOURCE) return;
    const campId = String(data.campId || "").trim();
    if (!campId) return;
    markListPreviewLoadError(campId, data.reason || "templating");
    listPreviewPreloadDbg("templating-error", { campId, reason: data.reason || "templating" });
  }

  function initCampaignListPreviewMessageListener() {
    if (previewPanelMessageInstalled) return;
    previewPanelMessageInstalled = true;
    window.addEventListener("message", handlePreviewFsIframeMessage);
  }

  function initCampaignListPreviewPanel() {
    if (previewPanelClickHookInstalled) return;
    previewPanelClickHookInstalled = true;
    initCampaignListPreviewMessageListener();
    document.addEventListener(
      "click",
      (ev) => {
        const btn = getPreviewButtonFromEventTarget(ev.target, ev);
        if (!btn) return;
        handlePreviewButtonClick(ev, btn);
      },
      true
    );
    document.addEventListener("click", handleCampaignListRowPreviewClick);
    document.addEventListener("click", handleLaunchMonitoringClick);
  }

  function initCampaignListPreviewPrefetch() {
    if (previewPanelPrefetchInstalled) return;
    previewPanelPrefetchInstalled = true;

    document.addEventListener("mouseover", handleListPreviewPreviewTargetMouseOver, true);
    document.addEventListener("mouseover", handleListPreviewRowMouseOver, true);
    document.addEventListener("mouseout", handleListPreviewRowMouseOut, true);
    document.addEventListener("pointerdown", handleListPreviewRowPointerDown, true);
    listPreviewPreloadDbg("listeners-attached", { target: "document", usesComposedPath: true });
  }

  window.gemDebugCampaignListPreviewPanel = function gemDebugCampaignListPreviewPanel() {
    const listRoot = findCampaignListRoot();
    if (!listRoot) {
      return { ok: false, reason: "list-root-not-found" };
    }
    const panel = ensureCampaignListPreviewPanel(listRoot);
    if (listPreviewCampaignId) openListPreview(listPreviewCampaignId);
    return {
      ok: !!panel,
      listRootId: listRoot.id,
      panelPresent: !!getListPreviewPanel(),
      listPreviewOpen,
      listPreviewCampaignId,
      poolSize: listPreviewPoolIframes.length,
      cache: Array.from(listPreviewCacheByCampId.entries()).map(([campId, entry]) => ({
        campId,
        ready: entry.ready,
        slotRole: entry.slotRole,
        lastUsed: entry.lastUsed,
      })),
      backgroundLoad: listPreviewBackgroundLoad
        ? {
            campId: listPreviewBackgroundLoad.campId,
            priority: listPreviewBackgroundLoad.priority,
          }
        : null,
      queue: listPreviewLoadQueue.slice(),
      priorityTargets: listPreviewCampaignId
        ? getListPreviewPriorityCampIds(listPreviewCampaignId)
        : [],
    };
  };

  init();
  initOtherRecentCampaignsScraper();
  initCampaignListOverflowMenuToggles(() => {
    initCampaignListOverflowMenus();
  });
  initCampaignListPreviewPanel();
  initCampaignListPreviewPrefetch();
  initCampaignListPreviewKeyboard();
})();
