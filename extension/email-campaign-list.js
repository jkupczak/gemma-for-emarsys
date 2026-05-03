(function() {
  const LOG_PREFIX = '[Gemma email-campaign-list]';
  const STORAGE_KEY = 'gemEmailCampaignListLoadAll';
  const FILTER_BUTTON_SELECTOR = 'e-datagrid-wrapper .e-datagrid__header_left .e-datagrid__filter_button button';
  const DATETIME_CLEAR_SELECTOR = '.e-datagrid__advanced_filters .e-datagrid__filter:first-child button.e-datetime__clear';
  const LOAD_ALL_TOAST_MESSAGE = 'All emails loaded by Gemma. Adjust this in settings.';
  const LOAD_ALL_TOAST_DURATION_MS = 8400;

  function showLoadAllToast() {
    if (typeof window.gemShowToast === 'function') {
      window.gemShowToast(LOAD_ALL_TOAST_MESSAGE, { type: 'info', durationMs: LOAD_ALL_TOAST_DURATION_MS / 2 });
      return;
    }

    try {
      let container = document.getElementById('gem-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'gem-toast-container';
        container.style.position = 'fixed';
        container.style.right = '16px';
        container.style.bottom = '16px';
        container.style.zIndex = '100000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.style.pointerEvents = 'none';
      toast.style.padding = '10px 12px';
      toast.style.borderRadius = '10px';
      toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.20)';
      toast.style.border = '1px solid var(--token-box-default-border, rgba(0,0,0,0.12))';
      toast.style.borderLeft = '4px solid var(--token-blue-600, #2563eb)';
      toast.style.background = 'var(--token-box-default-background, #fff)';
      toast.style.color = 'var(--token-font-default, #111)';
      toast.style.fontSize = '13px';
      toast.style.maxWidth = '420px';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'opacity 140ms ease, transform 140ms ease';
      toast.textContent = LOAD_ALL_TOAST_MESSAGE;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => toast.remove(), 180);
      }, LOAD_ALL_TOAST_DURATION_MS);
    } catch (_) {}
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

  init();
  initOtherRecentCampaignsScraper();
})();
