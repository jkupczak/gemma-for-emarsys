console.log("[gem] recent-campaigns.js loaded");

(function () {
  const RECENT_STORAGE_KEY = "gemRecentCampaigns";
  const OTHER_RECENT_STORAGE_KEY = "gemOtherRecentCampaigns";
  const RECENT_UI_STATE_KEY = "gemRecentCampaignsUiState";
  /** Language filter chip selection resets after this idle period since last change. Search is session-only (not persisted). */
  const RECENT_UI_STATE_STALE_MS = 8 * 60 * 60 * 1000;
  const RECENT_SCHEMA_VERSION = 1;
  const RECENT_NAV_ID = "gem-nav-recent-campaigns-item";
  const NOTES_NAV_ID = "gem-nav-notes-item";
  const SETTINGS_NAV_ID = "gem-nav-settings-item";
  const RECENT_PANEL_ID = "gem-recent-campaigns-panel";
  const RECENT_BACKDROP_ID = "gem-recent-campaigns-backdrop";
  /** Must match notes.js — notes dispatches so we close before notes opens (Cmd+;). */
  const GEM_CLOSE_RECENT_CAMPAIGNS_EVENT = "gem-close-recent-campaigns-panel";
  /** Must match notes.js — we dispatch so notes closes before recent opens (Cmd+/). */
  const GEM_CLOSE_NOTES_EVENT = "gem-close-notes-panel";
  const MAX_RECENT = 200;
  const CAMPAIGN_ROUTE = "contentBlocks/campaign";
  const MIN_LAST_VIEWED_UPDATE_MS = 60 * 1000;
  const PREVIEW_IFRAME_SELECTOR = "iframe.e-contentblocks-preview__iframe-desktop";
  const PREVIEW_IMAGE_MIN_CLIENT_WIDTH = 200;
  /** Same heuristic as page-title-updater.js: enabled save button means unsaved draft. */
  const DRAFT_SAVE_BUTTON_SELECTOR = "cb-draft-save-button button";
  const OPEN_GROUP_LIST_ID = "gem-recent-open-group-list";
  const DRAWER_PREVIEW_ACTIVE_ROW_CLASS = "gem-recent-campaign-row--preview-active";
  const PREFLIGHT_LANGUAGE_ALERTS_KEY = "gemPreflightLanguageAlertsByCampaignV1";

  let lastRecentPreviewCaptureLogKey = "";

  function isRecentPreviewImageDebugEnabled() {
    try {
      if (typeof window.gemIsDebugLoggingEnabled === "function") return !!window.gemIsDebugLoggingEnabled();
      if (typeof window.GEM_DEBUG === "boolean") return window.GEM_DEBUG;
    } catch (_) {}
    return false;
  }

  function logRecentPreviewCapture(info) {
    if (!isRecentPreviewImageDebugEnabled()) return;
    try {
      const cid = String(info.campaignId || "");
      const dedupeKey = [
        cid,
        info.phase || "",
        info.status || "",
        info.reason || "",
        String(info.url || "").slice(0, 200),
        String(info.imgTotal ?? ""),
        String(info.belowWidth ?? ""),
        String(info.noResolvedUrl ?? ""),
        String(info.badRatio ?? ""),
        String(info.candidateCount ?? "")
      ].join("|");
      if (dedupeKey === lastRecentPreviewCaptureLogKey) return;
      lastRecentPreviewCaptureLogKey = dedupeKey;
      console.log("[Gem-RecentPreview]", info);
    } catch (_) {}
  }

  let openCampaignTabIds = {};
  let openCampaignUrlTabs = {};
  let openCampaignKeys = {};
  /** Map tab id (string) -> whether that tab's draft save UI shows unsaved changes. */
  let openCampaignTabUnsaved = {};
  let recentOpenTabsPollTimer = null;
  let activeTabUnsavedPollTimer = null;
  let lastActiveTabUnsavedDom = null;
  let activeLanguageFilter = "";
  let activeSearchQuery = "";
  let pinnedCampaignKeys = new Set();
  let recentPanel = null;
  let recentBackdrop = null;
  let stableOrderIds = null;
  /** When unchanged vs last render, "Already open" list DOM may be preserved. */
  let lastAlreadyOpenFingerprint = null;
  let lastListFilterKey = "";
  let previewOpen = false;
  let previewCampaignId = "";
  let previewNavCampaignIds = [];
  let previewCampaignTitleById = {};
  const DRAWER_PREVIEW_LOADING_TIMEOUT_MS = 45000;
  const DRAWER_PREVIEW_SWAP_FLASH_MS = 180;
  const DRAWER_PREVIEW_POOL_SIZE = 4;
  const DRAWER_PREVIEW_PRIORITY_ACTIVE = 0;
  const DRAWER_PREVIEW_PRIORITY_ADJACENT = 1;
  const DRAWER_PREVIEW_PRIORITY_MENU_HOVER = 2;
  const DRAWER_PREVIEW_DEBUG = false;
  const PREVIEW_FS_IFRAME_MESSAGE_SOURCE = "gem-preview-fs-iframe";
  const DRAWER_PREVIEW_TEMPLATING_ERROR_MSG =
    "This preview could not be loaded. The campaign may have a templating issue.";
  let drawerPreviewFsMessageInstalled = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let drawerPreviewLoadingTimer = null;
  /** @type {HTMLIFrameElement[]} */
  let drawerPreviewPoolIframes = [];
  /** @type {Map<string, { iframe: HTMLIFrameElement, campId: string, ready: boolean, lastUsed: number, slotRole: string, loadToken: number, startedAt?: number, loadError?: string }>} */
  const drawerPreviewCacheByCampId = new Map();
  /** @type {Map<string, string>} */
  const drawerPreviewLoadErrorByCampId = new Map();
  /** @type {Map<HTMLIFrameElement, string>} */
  const drawerPreviewIframeToCampId = new Map();
  /** @type {{ iframe: HTMLIFrameElement, campId: string, priority: number, loadToken: number } | null} */
  let drawerPreviewBackgroundLoad = null;
  /** @type {{ campId: string, priority: number, slotRole: string }[]} */
  let drawerPreviewLoadQueue = [];
  let drawerPreviewLoadTokenSeq = 0;

  function jsonStableStringKeyMap(obj) {
    const o = obj && typeof obj === "object" ? obj : {};
    const keys = Object.keys(o).sort();
    const sorted = {};
    keys.forEach((k) => {
      sorted[k] = o[k];
    });
    return JSON.stringify(sorted);
  }

  function buildAlreadyOpenSectionFingerprint(openList, baseGroupTotals, filtersNarrowing) {
    const narrow = filtersNarrowing ? "1" : "0";
    const header = [
      String((Array.isArray(openList) ? openList : []).length),
      String(baseGroupTotals && Number.isFinite(baseGroupTotals.open) ? baseGroupTotals.open : 0),
      narrow
    ].join("\t");
    const rows = (Array.isArray(openList) ? openList : [])
      .map((entry) => {
        const item = getRecentDisplayEntryPrimaryItem(entry) || {};
        const ub = getRecentDisplayEntryKey(entry) || String(item.urlBase || "").trim();
        const tid = getOpenTabIdForItem(item);
        const uns =
          entry && entry.type === "group"
            ? entry.siblings.some((sibling) => isOpenTabUnsavedForItem(sibling))
              ? "1"
              : "0"
            : isOpenTabUnsavedForItem(item)
              ? "1"
              : "0";
        const pin = isRecentDisplayEntryPinned(entry) ? "1" : "0";
        const title = String(item.title || "").trim();
        const subject = String(item.subject || "").trim();
        return [ub, tid == null ? "" : String(tid), uns, pin, title, subject].join("\t");
      })
      .join("\n");
    return `${header}\n---\n${rows}`;
  }

  function getCurrentUrl() {
    try {
      return new URL(window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isCampaignPage() {
    const url = getCurrentUrl();
    if (!url) return false;
    if (!(url.pathname || "").includes("bootstrap.php")) return false;
    const r = (url.searchParams.get("r") || "").trim();
    return r === CAMPAIGN_ROUTE;
  }

  function isCampaignManagerDetailsPage() {
    const url = getCurrentUrl();
    if (!url) return false;
    const action = (url.searchParams.get("action") || "").trim();
    return (url.pathname || "").includes("campaignmanager.php") &&
      (action === "details" || action === "save") &&
      !!(url.searchParams.get("camp_id") || "").trim();
  }

  /**
   * Returns true for bootstrap.php pages that are campaign-related but are NOT the
   * main email editor (contentBlocks/campaign). These pages identify the campaign
   * via camp_id rather than id (e.g. campaign/scheduling, deliveryAdvisor/index).
   */
  function isBootstrapCampaignSiblingPage() {
    const url = getCurrentUrl();
    if (!url) return false;
    if (!(url.pathname || "").includes("bootstrap.php")) return false;
    const r = (url.searchParams.get("r") || "").trim();
    if (!r || r === CAMPAIGN_ROUTE) return false;
    return !!(url.searchParams.get("camp_id") || "").trim();
  }

  /** Returns the camp_id query param from the current URL, used by sibling and details pages. */
  function getCampIdParam() {
    const url = getCurrentUrl();
    if (!url) return null;
    return (url.searchParams.get("camp_id") || "").trim() || null;
  }

  function getCampaignManagerCampId() {
    return getCampIdParam();
  }

  function getCampaignIdFromUrl() {
    const url = getCurrentUrl();
    if (!url) return null;
    const id = (url.searchParams.get("id") || "").trim();
    return id || null;
  }

  function getCurrentSessionId() {
    const url = getCurrentUrl();
    if (!url) return "";
    return (url.searchParams.get("session_id") || "").trim();
  }

  function idForCanonicalCampaignQuery(id) {
    const s = String(id || "").trim();
    if (!s) return "";
    return /^[a-zA-Z0-9_-]+$/.test(s) ? s : encodeURIComponent(s);
  }

  function collectDecodedRouteCandidates(parsed, rawStr) {
    const routeCandidates = [];
    const routeFromQuery = parsed.searchParams.get("r");
    if (routeFromQuery) routeCandidates.push(routeFromQuery);
    const hash = parsed.hash || "";
    if (hash.includes("?")) {
      const hashQuery = hash.slice(hash.indexOf("?") + 1);
      const hashParams = new URLSearchParams(hashQuery);
      const hashRoute = hashParams.get("r");
      if (hashRoute) routeCandidates.push(hashRoute);
    }
    const normalizedRoutes = routeCandidates.map((r) => {
      try {
        return decodeURIComponent(r || "");
      } catch (_) {
        return String(r || "");
      }
    });
    const hasCampaignRoute =
      normalizedRoutes.some((r) => String(r).includes("contentBlocks/campaign")) ||
      String(rawStr || "").includes("contentBlocks/campaign");
    return hasCampaignRoute;
  }

  function getCampaignIdFromHref(rawStr, parsed) {
    let id = (parsed.searchParams.get("id") || "").trim();
    if (!id) {
      const idMatch = String(rawStr || "").match(/[?&#]id=([^&#]+)/i);
      if (idMatch && idMatch[1]) {
        try {
          id = decodeURIComponent(idMatch[1]).trim();
        } catch (_) {
          id = idMatch[1].trim();
        }
      }
    }
    return id || "";
  }

  /**
   * Single canonical campaign URL: no hash, no session_id, r=contentBlocks/campaign with literal slash (not %2F).
   */
  function urlBaseFromCampaignId(id) {
    const idForQuery = idForCanonicalCampaignQuery(String(id || "").trim());
    if (!idForQuery) return "";
    try {
      const u = new URL(window.location.href);
      return `${u.origin}/bootstrap.php?r=contentBlocks/campaign&id=${idForQuery}`;
    } catch (_) {
      return "";
    }
  }

  function canonicalCampaignUrlFromHref(raw) {
    try {
      const rawStr = String(raw || "").trim();
      if (!rawStr) return "";
      const parsed = new URL(rawStr, window.location.origin);
      if (!(parsed.pathname || "").includes("bootstrap.php")) return "";
      if (!collectDecodedRouteCandidates(parsed, rawStr)) return "";
      const id = getCampaignIdFromHref(rawStr, parsed);
      if (!id) return "";
      const idForQuery = idForCanonicalCampaignQuery(id);
      if (!idForQuery) return "";
      return `${parsed.origin}${parsed.pathname}?r=contentBlocks/campaign&id=${idForQuery}`;
    } catch (_) {
      return "";
    }
  }

  function withCurrentSessionId(rawUrl) {
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      const sid = getCurrentSessionId();
      if (sid) parsed.searchParams.set("session_id", sid);
      return parsed.toString();
    } catch (_) {
      return rawUrl;
    }
  }

  function getOpenMatchDetails(item) {
    const canonical = String(item && item.urlBase ? item.urlBase : "").trim();
    const byId = !!openCampaignTabIds[String(item && item.id ? item.id : "").trim()];
    const byUrl = !!openCampaignUrlTabs[canonical];
    const byKey = !!openCampaignKeys[canonical];
    return {
      isOpen: byId || byUrl || byKey,
      byId,
      byUrl,
      byKey,
      normalizedItemUrl: canonical,
      matchKey: canonical
    };
  }

  function getOpenTabIdForItem(item) {
    const id = String(item && item.id ? item.id : "").trim();
    const canonical = String(item && item.urlBase ? item.urlBase : "").trim();
    if (id && openCampaignTabIds[id] != null) return openCampaignTabIds[id];
    if (canonical && openCampaignUrlTabs[canonical] != null) return openCampaignUrlTabs[canonical];
    if (canonical && openCampaignKeys[canonical] != null) return openCampaignKeys[canonical];
    return null;
  }

  function readDraftSaveButtonUnsavedFromDom() {
    try {
      const saveButton = document.querySelector(DRAFT_SAVE_BUTTON_SELECTOR);
      const isDisabled = saveButton && saveButton.hasAttribute("disabled");
      return !isDisabled;
    } catch (_) {
      return false;
    }
  }

  function isOpenTabUnsavedForItem(item) {
    const tid = getOpenTabIdForItem(item);
    if (tid == null) return false;
    return !!openCampaignTabUnsaved[String(tid)];
  }

  function getLanguageAlertCountFromStorage(raw) {
    if (raw == null) return 0;
    if (typeof raw === "number") return Math.max(0, raw);
    if (typeof raw === "object") return Math.max(0, Number.parseInt(String(raw.count), 10) || 0);
    return 0;
  }

  function getCampaignPreflightIssueSummary(campaignMap) {
    if (!campaignMap || typeof campaignMap !== "object") return null;
    let total = 0;
    let languagesWithIssues = 0;
    Object.values(campaignMap).forEach((entry) => {
      const count = getLanguageAlertCountFromStorage(entry);
      if (count > 0) {
        total += count;
        languagesWithIssues += 1;
      }
    });
    if (total <= 0) return null;
    return { total, languagesWithIssues };
  }

  function buildCampaignStatusNoticesRow(options) {
    const opts = options && typeof options === "object" ? options : {};
    const row = document.createElement("div");
    row.className = "gem-recent-campaign-status-notices";

    if (opts.activeUnsavedSlot) {
      const notice = document.createElement("div");
      notice.id = "gem-recent-active-unsaved-slot";
      notice.className = "gem-recent-campaign-unsaved-notice";
      if (!opts.showUnsavedNotice) notice.classList.add("gem-recent-campaign-unsaved-notice--hidden");
      notice.setAttribute("role", "status");
      notice.textContent = opts.showUnsavedNotice ? "Unsaved changes" : "";
      notice.setAttribute("aria-hidden", opts.showUnsavedNotice ? "false" : "true");
      row.appendChild(notice);
    } else if (opts.showUnsavedNotice) {
      const notice = document.createElement("div");
      notice.className = "gem-recent-campaign-unsaved-notice";
      notice.setAttribute("role", "status");
      notice.textContent = "Unsaved changes";
      row.appendChild(notice);
    }

    const preflight = opts.preflightSummary;
    if (preflight && preflight.total > 0) {
      const langSuffix =
        preflight.languagesWithIssues > 1
          ? ` across ${preflight.languagesWithIssues} languages`
          : "";
      const notice = document.createElement("div");
      notice.className = "gem-recent-campaign-preflight-notice";
      notice.setAttribute("role", "status");
      notice.textContent = `Preflight: ${preflight.total} issue${preflight.total === 1 ? "" : "s"}${langSuffix}`;
      row.appendChild(notice);
    }

    if (opts.activeUnsavedSlot) return row;
    return row.children.length ? row : null;
  }

  function buildCampaignRowStatusNotices(options, versionTarget) {
    const opts = options && typeof options === "object" ? options : {};
    let noticesRow = buildCampaignStatusNoticesRow(opts);
    if (!noticesRow) {
      noticesRow = document.createElement("div");
      noticesRow.className = "gem-recent-campaign-status-notices";
    }

    if (versionTarget && versionTarget.type === "group") {
      appendVersionGroupChips(noticesRow, versionTarget.siblings);
    } else if (versionTarget && versionTarget.item) {
      appendCampaignVersionChip(noticesRow, versionTarget.item);
    }

    if (opts.activeUnsavedSlot) return noticesRow;
    return noticesRow.children.length ? noticesRow : null;
  }

  function appendCampaignStatusNotices(main, options) {
    const row = buildCampaignStatusNoticesRow(options);
    if (row) main.appendChild(row);
  }

  function stopActiveTabUnsavedPoll() {
    if (activeTabUnsavedPollTimer) {
      clearInterval(activeTabUnsavedPollTimer);
      activeTabUnsavedPollTimer = null;
    }
    lastActiveTabUnsavedDom = null;
  }

  function patchActiveTabUnsavedChip(unsaved) {
    const el = document.getElementById("gem-recent-active-unsaved-slot");
    if (!el) return;
    const show = !!unsaved;
    el.classList.toggle("gem-recent-campaign-unsaved-notice--hidden", !show);
    el.textContent = show ? "Unsaved changes" : "";
    el.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function tickActiveTabUnsavedFromDom() {
    if (!recentPanel || !recentPanel.classList.contains("gem-recent-campaigns-panel--open")) return;
    if (!isCampaignPage()) return;
    const next = readDraftSaveButtonUnsavedFromDom();
    if (next === lastActiveTabUnsavedDom) return;
    lastActiveTabUnsavedDom = next;
    patchActiveTabUnsavedChip(next);
  }

  function startActiveTabUnsavedPoll() {
    stopActiveTabUnsavedPoll();
    if (!recentPanel || !recentPanel.classList.contains("gem-recent-campaigns-panel--open")) return;
    if (!isCampaignPage()) return;
    lastActiveTabUnsavedDom = readDraftSaveButtonUnsavedFromDom();
    patchActiveTabUnsavedChip(lastActiveTabUnsavedDom);
    activeTabUnsavedPollTimer = setInterval(tickActiveTabUnsavedFromDom, 400);
  }

  function textOf(selector) {
    try {
      const el = document.querySelector(selector);
      if (!el) return "";
      return (el.textContent || "").trim();
    } catch (_) {
      return "";
    }
  }

  function firstTextOf(selectors) {
    for (const sel of selectors) {
      const txt = textOf(sel);
      if (txt) return txt;
    }
    return "";
  }

  function parseTitleFromDocumentTitle() {
    try {
      const raw = (document.title || "").trim();
      if (!raw) return "";
      const generic = /^(sap\s+engagement\s+cloud|emarsys)$/i;
      const parts = raw.split(/\s*[|\u2013\u2014-]\s*/).map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (!generic.test(part)) return part;
      }
      return parts[0] || "";
    } catch (_) {
      return "";
    }
  }

  function isCampIdCampaignPage() {
    return isCampaignManagerDetailsPage() || isBootstrapCampaignSiblingPage();
  }

  /**
   * Display names from the language selector. Single-language campaigns are stored as `null`
   * because Emarsys does not reliably reflect the real locale when only one option exists.
   */
  function getLanguages() {
    const selector = document.querySelector("vce-languages-selector");
    if (!selector) return [];
    const options = Array.from(selector.querySelectorAll("e-select-option"));
    const names = options
      .map((opt) => {
        const nameEl = opt.querySelector("vce-language-name");
        return (nameEl && nameEl.textContent ? nameEl.textContent : "").trim();
      })
      .filter(Boolean);
    if (names.length === 1) return null;
    return names;
  }

  function getTodayDateLabel() {
    try {
      return new Date().toLocaleDateString();
    } catch (_) {
      return "";
    }
  }

  function resolvePreviewImgAbsoluteUrl(img, baseHref) {
    try {
      const raw = String((img.currentSrc || img.getAttribute("src") || "")).trim();
      if (!raw) return "";
      return new URL(raw, baseHref || window.location.href).href;
    } catch (_) {
      return "";
    }
  }

  function previewImageOneToOneDistance(img) {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (!(w > 0 && h > 0)) {
      w = img.clientWidth;
      h = img.clientHeight;
    }
    if (!(w > 0 && h > 0)) return Number.POSITIVE_INFINITY;
    const ratio = w / h;
    return Math.abs(Math.log(ratio));
  }

  function pickDesktopPreviewGraphicUrl(campaignId) {
    const cid = String(campaignId || "").trim();
    const baseLog = { phase: "capture_preview_image", campaignId: cid };
    try {
      const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
      if (!iframe) {
        logRecentPreviewCapture({
          ...baseLog,
          status: "fail",
          reason: "no_iframe",
          selector: PREVIEW_IFRAME_SELECTOR
        });
        return "";
      }
      const doc = iframe.contentDocument;
      if (!doc) {
        logRecentPreviewCapture({
          ...baseLog,
          status: "fail",
          reason: "no_content_document",
          iframeSrc: String(iframe.src || "").slice(0, 200)
        });
        return "";
      }
      const baseHref = doc.baseURI || iframe.src || window.location.href;
      const imgs = doc.querySelectorAll("img");
      const imgTotal = imgs.length;
      let belowWidth = 0;
      let noResolvedUrl = 0;
      let badRatio = 0;
      const sampleSizes = [];
      const candidates = [];
      let idx = 0;
      imgs.forEach((img) => {
        const i = idx++;
        const cw = img.clientWidth;
        const ch = img.clientHeight;
        if (sampleSizes.length < 6) {
          sampleSizes.push({
            cw,
            ch,
            nw: img.naturalWidth,
            nh: img.naturalHeight,
            src: String((img.currentSrc || img.getAttribute("src") || "")).slice(0, 80)
          });
        }
        if (cw < PREVIEW_IMAGE_MIN_CLIENT_WIDTH) {
          belowWidth++;
          return;
        }
        const url = resolvePreviewImgAbsoluteUrl(img, baseHref);
        if (!url) {
          noResolvedUrl++;
          return;
        }
        const dist = previewImageOneToOneDistance(img);
        if (!Number.isFinite(dist)) {
          badRatio++;
          return;
        }
        candidates.push({ url, dist, i });
      });
      if (!candidates.length) {
        logRecentPreviewCapture({
          ...baseLog,
          status: "fail",
          reason: "no_qualifying_images",
          imgTotal,
          belowWidth,
          noResolvedUrl,
          badRatio,
          minClientWidth: PREVIEW_IMAGE_MIN_CLIENT_WIDTH,
          sampleSizes,
          docBaseHref: String(baseHref || "").slice(0, 200)
        });
        return "";
      }
      candidates.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.i - b.i));
      const best = candidates[0];
      logRecentPreviewCapture({
        ...baseLog,
        status: "ok",
        url: best.url,
        candidateCount: candidates.length,
        ratioDistance: best.dist
      });
      return best.url;
    } catch (err) {
      logRecentPreviewCapture({
        ...baseLog,
        status: "error",
        reason: "exception",
        message: err && err.message ? String(err.message) : String(err)
      });
      return "";
    }
  }

  function extractCampaignPayload() {
    const id = getCampaignIdFromUrl();
    if (!id) return null;
    const title = textOf("cb-campaign-name span") || textOf("cb-campaign-name");
    if (!title) return null;
    const versionInfo = extractCampaignVersionInfo();
    const versionLetter = getVersionLetterForCampaignId(versionInfo, id);
    const versionGroupId =
      versionInfo.isVersioned && versionInfo.versions[0] && versionInfo.versions[0].id
        ? String(versionInfo.versions[0].id).trim()
        : "";
    return {
      id,
      title,
      subject: firstTextOf([
        'label[for="testmail-subject"] span',
        'label[attr\\.for="testmail-subject"] span',
        '[attr.for="testmail-subject"] span'
      ]),
      languages: getLanguages(),
      urlBase: canonicalCampaignUrlFromHref(window.location.href),
      lastViewedDate: getTodayDateLabel(),
      lastViewedAt: Date.now(),
      previewImageUrl: pickDesktopPreviewGraphicUrl(id),
      versionLetter,
      versionGroupId,
      versionBackfilled: false,
      _versionInfo: versionInfo
    };
  }

  /** Editor uses ?id=; campaignmanager / sibling bootstrap pages use ?camp_id=. */
  function extractCampIdCampaignPayload() {
    if (!isCampIdCampaignPage()) return null;
    const id = getCampIdParam();
    if (!id) return null;
    const urlBase = urlBaseFromCampaignId(id);
    if (!urlBase) return null;
    const title =
      firstTextOf([
        "cb-campaign-name span",
        "cb-campaign-name",
        'input[name="camp_name"]',
        "#camp_name",
        '[name="campaign_name"]',
        ".e-page-header__title",
        ".e-page-header h1",
        "h1"
      ]) ||
      parseTitleFromDocumentTitle() ||
      `Campaign ${id}`;
    return {
      id,
      title,
      subject: firstTextOf([
        'label[for="testmail-subject"] span',
        'label[attr\\.for="testmail-subject"] span',
        '[attr.for="testmail-subject"] span'
      ]),
      languages: getLanguages(),
      urlBase,
      lastViewedDate: getTodayDateLabel(),
      lastViewedAt: Date.now(),
      previewImageUrl: pickDesktopPreviewGraphicUrl(id)
    };
  }

  function extractActiveCampaignPayload() {
    return extractCampaignPayload() || extractCampIdCampaignPayload();
  }

  // See extension/campaign-versioning.md
  function parseVersionLetter(optionText) {
    const text = String(optionText || "").trim();
    const match = text.match(/#\s*([a-z])/i) || text.match(/version\s*#?\s*([a-z])/i);
    return match && match[1] ? match[1].toUpperCase() : "";
  }

  function extractCampaignVersionInfo() {
    const select = document.querySelector("cb-version-selector select");
    if (!select) {
      return { isVersioned: false, versions: [], selectorPresent: false, remainingIds: [] };
    }
    const options = [...select.options].filter((opt) => {
      const id = String(opt.value || "").trim();
      const label = String(opt.textContent || "").trim();
      return id && label;
    });
    const remainingIds = options.map((opt) => String(opt.value).trim()).filter(Boolean);
    if (options.length <= 1) {
      return { isVersioned: false, versions: [], selectorPresent: true, remainingIds };
    }
    return {
      isVersioned: true,
      versions: options.map((opt) => ({
        id: String(opt.value).trim(),
        letter: parseVersionLetter(opt.textContent),
        urlBase: urlBaseFromCampaignId(opt.value)
      })),
      selectorPresent: true,
      remainingIds
    };
  }

  function getVersionLetterForCampaignId(versionInfo, campaignId) {
    if (!versionInfo || !versionInfo.isVersioned) return "";
    const id = String(campaignId || "").trim();
    const match = (versionInfo.versions || []).find((v) => v.id === id);
    return match && match.letter ? match.letter : "";
  }

  function clearRecentItemVersionFields(item) {
    return normalizeEntry({
      ...item,
      versionLetter: "",
      versionGroupId: "",
      versionBackfilled: false
    });
  }

  function pruneRemovedCampaignVersions(items, normalized, versionInfo, existingBeforeUpdate) {
    const list = Array.isArray(items) ? items.slice() : [];
    const currentId = String(normalized && normalized.id ? normalized.id : "").trim();
    if (!versionInfo || versionInfo.isVersioned || !versionInfo.selectorPresent || !currentId) {
      return list;
    }

    const remainingIds = new Set(
      (versionInfo.remainingIds || []).map((id) => String(id).trim()).filter(Boolean)
    );
    if (!remainingIds.size) return list;

    const oldGroupId = String(
      (existingBeforeUpdate && existingBeforeUpdate.versionGroupId) ||
        list.find((item) => String(item.id || "").trim() === currentId)?.versionGroupId ||
        ""
    ).trim();

    if (!oldGroupId) {
      return list.map((item) =>
        String(item.id || "").trim() === currentId ? clearRecentItemVersionFields(item) : item
      );
    }

    const next = [];
    list.forEach((item) => {
      const id = String(item.id || "").trim();
      const groupId = String(item.versionGroupId || "").trim();

      if (groupId !== oldGroupId) {
        if (id === currentId) next.push(clearRecentItemVersionFields(item));
        else next.push(item);
        return;
      }

      if (remainingIds.has(id)) {
        next.push(clearRecentItemVersionFields(item));
        return;
      }

      if (item.versionBackfilled) return;
      next.push(clearRecentItemVersionFields(item));
    });
    return next;
  }

  function applyVersionInfoToRecentItems(list, normalized, versionInfo, existingBeforeUpdate) {
    const items = Array.isArray(list) ? list.slice() : [];
    const currentId = String(normalized && normalized.id ? normalized.id : "").trim();
    if (!versionInfo || !versionInfo.isVersioned) {
      return pruneRemovedCampaignVersions(items, normalized, versionInfo, existingBeforeUpdate);
    }

    const versions = versionInfo.versions || [];
    const versionGroupId =
      versions[0] && versions[0].id ? String(versions[0].id).trim() : "";
    if (!versionGroupId) return items;

    const indexById = new Map(
      items.map((item, index) => [String(item.id || "").trim(), index])
    );

    versions.forEach((version) => {
      const vid = String(version.id || "").trim();
      if (!vid) return;
      const letter = String(version.letter || "").trim();
      const urlBase = String(version.urlBase || urlBaseFromCampaignId(vid)).trim();
      const isCurrent = vid === currentId;
      const existingIndex = indexById.get(vid);

      if (existingIndex != null) {
        const existing = items[existingIndex];
        items[existingIndex] = normalizeEntry({
          ...existing,
          title: normalized.title || existing.title,
          subject: normalized.subject || existing.subject,
          languages: normalized.languages != null ? normalized.languages : existing.languages,
          urlBase: urlBase || existing.urlBase,
          versionLetter: letter,
          versionGroupId,
          versionBackfilled: isCurrent ? false : !!existing.versionBackfilled,
          previewImageUrl: isCurrent
            ? normalized.previewImageUrl || existing.previewImageUrl
            : existing.previewImageUrl,
          lastViewedAt: isCurrent ? normalized.lastViewedAt : existing.lastViewedAt,
          lastViewedDate: isCurrent ? normalized.lastViewedDate : existing.lastViewedDate
        });
        return;
      }

      items.push(
        normalizeEntry({
          id: vid,
          title: normalized.title,
          subject: normalized.subject,
          languages: normalized.languages,
          urlBase,
          versionLetter: letter,
          versionGroupId,
          versionBackfilled: !isCurrent,
          previewImageUrl: isCurrent ? normalized.previewImageUrl : "",
          lastViewedAt: isCurrent ? normalized.lastViewedAt : 0,
          lastViewedDate: isCurrent ? normalized.lastViewedDate : ""
        })
      );
      indexById.set(vid, items.length - 1);
    });

    return items;
  }

  function getVersionGroupPrimaryItem(siblings) {
    const list = Array.isArray(siblings) ? siblings.slice() : [];
    if (!list.length) return null;
    list.sort((a, b) => {
      const aBackfilled = a.versionBackfilled ? 1 : 0;
      const bBackfilled = b.versionBackfilled ? 1 : 0;
      if (aBackfilled !== bBackfilled) return aBackfilled - bBackfilled;
      return (b.lastViewedAt || 0) - (a.lastViewedAt || 0);
    });
    return list[0];
  }

  function groupVersionedRecentItems(items) {
    const byGroup = new Map();
    const standalone = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const groupId = String(item.versionGroupId || "").trim();
      const letter = String(item.versionLetter || "").trim();
      if (groupId && letter) {
        if (!byGroup.has(groupId)) byGroup.set(groupId, []);
        byGroup.get(groupId).push(item);
        return;
      }
      standalone.push({ type: "single", item });
    });
    byGroup.forEach((siblings, versionGroupId) => {
      if (siblings.length >= 2) {
        standalone.push({
          type: "group",
          versionGroupId,
          siblings: siblings.slice().sort((a, b) =>
            String(a.versionLetter || "").localeCompare(String(b.versionLetter || ""), undefined, {
              sensitivity: "base"
            })
          )
        });
      } else if (siblings.length === 1) {
        standalone.push({ type: "single", item: siblings[0] });
      }
    });
    return standalone;
  }

  function getRecentDisplayEntryKey(entry) {
    if (!entry || entry.type === "group") {
      return `group:${String(entry && entry.versionGroupId ? entry.versionGroupId : "").trim()}`;
    }
    return String(entry.item && entry.item.urlBase ? entry.item.urlBase : "").trim();
  }

  function getRecentDisplayEntryLastViewedAt(entry) {
    if (!entry) return 0;
    if (entry.type === "group") {
      return Math.max(...entry.siblings.map((item) => item.lastViewedAt || 0), 0);
    }
    return entry.item.lastViewedAt || 0;
  }

  function getRecentDisplayEntryPrimaryItem(entry) {
    if (!entry) return null;
    if (entry.type === "group") return getVersionGroupPrimaryItem(entry.siblings);
    return entry.item;
  }

  function isRecentDisplayEntryOpen(entry) {
    if (!entry) return false;
    if (entry.type === "group") {
      return entry.siblings.some((item) => getOpenMatchDetails(item).isOpen);
    }
    return getOpenMatchDetails(entry.item).isOpen;
  }

  function isRecentDisplayEntryPinned(entry) {
    if (!entry) return false;
    if (entry.type === "group") {
      return entry.siblings.some((item) => pinnedCampaignKeys.has(String(item.urlBase || "").trim()));
    }
    return pinnedCampaignKeys.has(String(entry.item.urlBase || "").trim());
  }

  function recentDisplayEntryMatchesSearch(entry, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    function matchesSearch(item) {
      const phrases = [];
      let remainder = q.replace(/"([^"]+)"/g, (_, p1) => {
        const phrase = String(p1 || "").trim();
        if (phrase) phrases.push(phrase);
        return " ";
      });
      const terms = remainder.split(/\s+/).map((v) => v.trim()).filter(Boolean);
      const haystack = `${item.title} ${item.subject} ${(item.languages || []).join(" ")} ${item.id} ${item.versionLetter || ""}`.toLowerCase();
      return phrases.every((p) => haystack.includes(p)) && terms.every((t) => haystack.includes(t));
    }
    if (entry.type === "group") {
      return entry.siblings.some((item) => matchesSearch(item));
    }
    return matchesSearch(entry.item);
  }

  function buildRecentDisplayRowOpts(entry, baseRowOpts) {
    if (!entry || entry.type !== "group") {
      return baseRowOpts(getRecentDisplayEntryPrimaryItem(entry));
    }
    const primary = getVersionGroupPrimaryItem(entry.siblings);
    const opts = primary ? baseRowOpts(primary) : baseRowOpts(getRecentDisplayEntryPrimaryItem(entry));
    const showUnsavedNotice = entry.siblings.some((item) => isOpenTabUnsavedForItem(item));
    let preflightSummary = null;
    entry.siblings.forEach((item) => {
      const summary = baseRowOpts(item).preflightSummary;
      if (!summary || summary.total <= 0) return;
      if (!preflightSummary) {
        preflightSummary = { total: summary.total, languagesWithIssues: summary.languagesWithIssues };
        return;
      }
      preflightSummary.total += summary.total;
      preflightSummary.languagesWithIssues = Math.max(
        preflightSummary.languagesWithIssues,
        summary.languagesWithIssues
      );
    });
    return {
      ...opts,
      showUnsavedNotice,
      preflightSummary
    };
  }

  function getCampaignOpenAriaLabel(title, versionLetter) {
    const campaignTitle = String(title || "").trim();
    const letter = String(versionLetter || "").trim();
    if (letter) return `Open campaign ${campaignTitle} (Version ${letter})`;
    return `Open campaign ${campaignTitle}`;
  }

  function appendCampaignVersionChip(noticesRow, item) {
    const letter = String(item && item.versionLetter ? item.versionLetter : "").trim();
    if (!letter || !noticesRow) return;
    const chip = document.createElement("span");
    chip.className = "gem-recent-campaign-version-chip";
    chip.textContent = letter;
    chip.setAttribute("aria-label", `Version ${letter}`);
    noticesRow.appendChild(chip);
  }

  function appendVersionGroupChips(noticesRow, siblings) {
    if (!noticesRow) return;
    const wrap = document.createElement("div");
    wrap.className = "gem-recent-campaign-version-chips";
    (Array.isArray(siblings) ? siblings : []).forEach((sibling) => {
      const letter = String(sibling.versionLetter || "").trim();
      if (!letter) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "gem-recent-campaign-version-chip gem-recent-campaign-version-chip--link";
      if (sibling.versionBackfilled) {
        chip.classList.add("gem-recent-campaign-version-chip--backfilled");
      }
      if (getOpenMatchDetails(sibling).isOpen) {
        chip.classList.add("gem-recent-campaign-version-chip--open");
      }
      chip.textContent = letter;
      chip.setAttribute("aria-label", `Open Version ${letter}`);
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          action: "focusOrOpenCampaignTab",
          campaignId: sibling.id,
          targetUrl: withCurrentSessionId(sibling.urlBase)
        });
      });
      wrap.appendChild(chip);
    });
    if (!wrap.childElementCount) return;
    noticesRow.appendChild(wrap);
  }

  function getCurrentCampaignExclusion() {
    if (isCampaignPage()) {
      const id = getCampaignIdFromUrl();
      if (!id) return null;
      const urlBase = canonicalCampaignUrlFromHref(window.location.href);
      return { id: String(id).trim(), urlBase: String(urlBase || "").trim() };
    }
    if (isCampaignManagerDetailsPage() || isBootstrapCampaignSiblingPage()) {
      const id = getCampIdParam();
      if (!id) return null;
      return { id: String(id).trim(), urlBase: "" };
    }
    return null;
  }

  function normalizeEntry(entry) {
    const e = entry && typeof entry === "object" ? entry : {};
    const mergedHref = String(e.urlBase || e.campaignKey || "").trim();
    const urlBase = canonicalCampaignUrlFromHref(mergedHref);
    const normalized = {
      id: String(e.id || "").trim(),
      title: String(e.title || "").trim(),
      subject: String(e.subject || "").trim(),
      languages: (() => {
        if (e && e.languages === null) return null;
        return Array.isArray(e.languages)
          ? e.languages.filter(Boolean).map((v) => String(v).trim()).filter(Boolean)
          : [];
      })(),
      urlBase: String(urlBase || "").trim(),
      lastViewedDate: String(e.lastViewedDate || "").trim(),
      lastViewedAt: Number.isFinite(e.lastViewedAt) ? e.lastViewedAt : 0,
      previewImageUrl: String(e.previewImageUrl || "").trim(),
      versionLetter: String(e.versionLetter || "").trim(),
      versionGroupId: String(e.versionGroupId || "").trim(),
      versionBackfilled: e.versionBackfilled === true
    };
    return normalized;
  }

  function sanitizeRecentItems(items) {
    const normalized = (Array.isArray(items) ? items : [])
      .map(normalizeEntry)
      .filter((e) => e.id && e.title && e.urlBase);
    const dedup = new Map();
    normalized.forEach((item) => {
      const existing = dedup.get(item.urlBase);
      if (!existing || (item.lastViewedAt || 0) > (existing.lastViewedAt || 0)) {
        dedup.set(item.urlBase, item);
      }
    });
    return Array.from(dedup.values())
      .sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0))
      .slice(0, MAX_RECENT);
  }

  function sanitizePinnedKeys(pinnedKeys, items) {
    const allowed = new Set((Array.isArray(items) ? items : []).map((it) => String(it.urlBase || "").trim()).filter(Boolean));
    return (Array.isArray(pinnedKeys) ? pinnedKeys : [])
      .map((v) => canonicalCampaignUrlFromHref(String(v || "").trim()) || String(v || "").trim())
      .filter((v) => v && allowed.has(v));
  }

  function readRecentState(callback) {
    chrome.storage.local.get({ [RECENT_STORAGE_KEY]: { version: RECENT_SCHEMA_VERSION, items: [] } }, (res) => {
      const raw = res[RECENT_STORAGE_KEY];
      if (Array.isArray(raw)) {
        const migratedItems = sanitizeRecentItems(raw);
        const migrated = { version: RECENT_SCHEMA_VERSION, items: migratedItems, pinnedKeys: [] };
        chrome.storage.local.set({ [RECENT_STORAGE_KEY]: migrated }, () => callback(migrated));
        return;
      }
      const version = raw && Number.isFinite(raw.version) ? raw.version : RECENT_SCHEMA_VERSION;
      const rawItemsSnapshot = Array.isArray(raw.items) ? raw.items : [];
      const hadLegacyCampaignKey = rawItemsSnapshot.some(
        (it) => it && typeof it === "object" && Object.prototype.hasOwnProperty.call(it, "campaignKey")
      );
      const pinsBefore = Array.isArray(raw.pinnedKeys) ? raw.pinnedKeys.slice() : [];
      const items = sanitizeRecentItems(rawItemsSnapshot);
      const pinnedKeys = sanitizePinnedKeys(raw.pinnedKeys, items);
      const pinsMigrated = JSON.stringify(pinsBefore) !== JSON.stringify(pinnedKeys);
      const urlNeedsCanonical = rawItemsSnapshot.some((it) => {
        if (!it || typeof it !== "object") return false;
        const u = String(it.urlBase || "");
        return u.includes("#") || u.includes("contentBlocks%2Fcampaign");
      });
      const normalizedState = { version, items, pinnedKeys };
      if (hadLegacyCampaignKey || pinsMigrated || urlNeedsCanonical) {
        chrome.storage.local.set({ [RECENT_STORAGE_KEY]: normalizedState }, () => callback(normalizedState));
        return;
      }
      callback(normalizedState);
    });
  }

  function writeRecentState(state, callback) {
    const items = sanitizeRecentItems(state && Array.isArray(state.items) ? state.items : []);
    const pinnedKeys = sanitizePinnedKeys(state && state.pinnedKeys, items);
    const next = {
      version: RECENT_SCHEMA_VERSION,
      items,
      pinnedKeys
    };
    chrome.storage.local.set({ [RECENT_STORAGE_KEY]: next }, () => {
      if (callback) callback();
    });
  }

  function readRecentItems(callback) {
    readRecentState((state) => callback({
      items: Array.isArray(state.items) ? state.items : [],
      pinnedKeys: Array.isArray(state.pinnedKeys) ? state.pinnedKeys : []
    }));
  }

  function readOtherRecentItems(callback) {
    if (!(chrome && chrome.storage && chrome.storage.local)) {
      callback([]);
      return;
    }
    chrome.storage.local.get({ [OTHER_RECENT_STORAGE_KEY]: { version: 1, items: [] } }, (res) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        callback([]);
        return;
      }
      const raw = res[OTHER_RECENT_STORAGE_KEY];
      const arr = Array.isArray(raw) ? raw : raw && Array.isArray(raw.items) ? raw.items : [];
      const byId = new Map();
      arr.forEach((e) => {
        if (!e || typeof e !== "object") return;
        const id = String(e.id || "").trim();
        if (!id) return;
        const title = String(e.title || "").trim();
        const loggedAt = Number.isFinite(e.loggedAt) ? e.loggedAt : 0;
        const prev = byId.get(id);
        if (!prev || loggedAt >= (prev.loggedAt || 0)) {
          byId.set(id, { id, title, loggedAt });
        }
      });
      callback(
        Array.from(byId.values()).sort((a, b) => (b.loggedAt || 0) - (a.loggedAt || 0))
      );
    });
  }

  function buildMainRecentOverlapSet(items) {
    const s = new Set();
    (Array.isArray(items) ? items : []).forEach((it) => {
      const id = String(it && it.id ? it.id : "").trim();
      const ub = String(canonicalCampaignUrlFromHref(it && it.urlBase ? it.urlBase : "") || (it && it.urlBase) || "").trim();
      if (id) s.add(`id:${id}`);
      if (ub) s.add(`ub:${ub}`);
    });
    return s;
  }

  function otherEntryOverlapsMainRecent(overlap, id, urlBase) {
    const idStr = String(id || "").trim();
    const ub = String(urlBase || "").trim();
    if (idStr && overlap.has(`id:${idStr}`)) return true;
    if (ub && overlap.has(`ub:${ub}`)) return true;
    return false;
  }

  function matchesSearchOtherTitle(title, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const phrases = [];
    let remainder = q.replace(/"([^"]+)"/g, (_, p1) => {
      const phrase = String(p1 || "").trim();
      if (phrase) phrases.push(phrase);
      return " ";
    });
    const terms = remainder.split(/\s+/).map((v) => v.trim()).filter(Boolean);
    const haystack = String(title || "").toLowerCase();
    return phrases.every((p) => haystack.includes(p)) && terms.every((t) => haystack.includes(t));
  }

  function loadUiState(callback) {
    chrome.storage.local.get({ [RECENT_UI_STATE_KEY]: { language: "", savedAt: 0 } }, (res) => {
      const raw = res[RECENT_UI_STATE_KEY] || {};
      const language = String(raw.language || "").trim();
      let savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
      const hadSavedAtKey = raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "savedAt");

      function applyAndCallback() {
        if (savedAt > 0 && Date.now() - savedAt > RECENT_UI_STATE_STALE_MS) {
          activeLanguageFilter = "";
          chrome.storage.local.set(
            { [RECENT_UI_STATE_KEY]: { language: "", savedAt: Date.now() } },
            () => {
              if (callback) callback({ language: "" });
            }
          );
          return;
        }
        activeLanguageFilter = language;
        if (callback) callback({ language });
      }

      if (!hadSavedAtKey) {
        savedAt = Date.now();
        chrome.storage.local.set(
          {
            [RECENT_UI_STATE_KEY]: {
              language,
              savedAt
            }
          },
          () => applyAndCallback()
        );
        return;
      }

      applyAndCallback();
    });
  }

  function saveUiState() {
    chrome.storage.local.set({
      [RECENT_UI_STATE_KEY]: {
        language: activeLanguageFilter,
        savedAt: Date.now()
      }
    });
  }

  function recentItemsEqual(a, b) {
    return JSON.stringify(sanitizeRecentItems(a)) === JSON.stringify(sanitizeRecentItems(b));
  }

  function upsertRecent(payload) {
    const hasEditorVersionInfo = !!(payload && typeof payload._versionInfo === "object");
    const versionInfo = hasEditorVersionInfo ? payload._versionInfo : null;
    const normalized = normalizeEntry(payload);
    if (!normalized.id || !normalized.title || !normalized.urlBase) return;
    readRecentItems(({ items, pinnedKeys }) => {
      let list = items.slice();
      const idx = list.findIndex((e) => e.urlBase === normalized.urlBase || e.id === normalized.id);
      let existingBeforeUpdate = null;
      if (idx >= 0) {
        const existing = list[idx];
        existingBeforeUpdate = existing;
        const nowTs = Date.now();
        const lastViewedAt = Number.isFinite(existing.lastViewedAt) ? existing.lastViewedAt : 0;
        const fieldsChanged =
          existing.title !== normalized.title ||
          existing.subject !== normalized.subject ||
          existing.urlBase !== normalized.urlBase ||
          (hasEditorVersionInfo &&
            (String(existing.versionLetter || "") !== String(normalized.versionLetter || "") ||
              String(existing.versionGroupId || "") !== String(normalized.versionGroupId || "") ||
              !!existing.versionBackfilled !== !!normalized.versionBackfilled)) ||
          JSON.stringify(
            existing.languages === null ? null : Array.isArray(existing.languages) ? existing.languages : []
          ) !==
            JSON.stringify(
              normalized.languages === null ? null : Array.isArray(normalized.languages) ? normalized.languages : []
            ) ||
          String(existing.previewImageUrl || "") !== String(normalized.previewImageUrl || "");
        const shouldRefreshLastViewed = (nowTs - lastViewedAt) >= MIN_LAST_VIEWED_UPDATE_MS;
        if (!fieldsChanged && !shouldRefreshLastViewed) {
          if (versionInfo) {
            const patched = applyVersionInfoToRecentItems(list, normalized, versionInfo, existingBeforeUpdate);
            if (recentItemsEqual(items, patched)) return;
            writeRecentState({ items: patched, pinnedKeys });
          }
          return;
        }
        const prevPreview = String(existing.previewImageUrl || "");
        const nextPreview = String(normalized.previewImageUrl || "");
        if (prevPreview !== nextPreview && isRecentPreviewImageDebugEnabled()) {
          console.log("[Gem-RecentPreview]", {
            phase: "persist_preview_url",
            campaignId: normalized.id,
            cleared: !nextPreview && !!prevPreview,
            set: !!nextPreview,
            prevPreview: prevPreview ? prevPreview.slice(0, 120) : "",
            nextPreview: nextPreview ? nextPreview.slice(0, 120) : ""
          });
        }
        list[idx] = {
          ...existing,
          ...normalized,
          ...(hasEditorVersionInfo
            ? {}
            : {
                versionLetter: existing.versionLetter,
                versionGroupId: existing.versionGroupId,
                versionBackfilled: existing.versionBackfilled
              }),
          lastViewedAt: shouldRefreshLastViewed ? normalized.lastViewedAt : existing.lastViewedAt,
          lastViewedDate: shouldRefreshLastViewed ? normalized.lastViewedDate : existing.lastViewedDate
        };
      } else {
        if (normalized.previewImageUrl && isRecentPreviewImageDebugEnabled()) {
          console.log("[Gem-RecentPreview]", {
            phase: "persist_preview_url",
            campaignId: normalized.id,
            newRow: true,
            nextPreview: String(normalized.previewImageUrl || "").slice(0, 120)
          });
        }
        list.push(normalized);
      }
      if (versionInfo) {
        list = applyVersionInfoToRecentItems(list, normalized, versionInfo, existingBeforeUpdate);
      }
      if (recentItemsEqual(items, list)) return;
      writeRecentState({ items: list, pinnedKeys });
    });
  }

  function togglePinnedCampaign(canonicalUrl) {
    const key = String(canonicalUrl || "").trim();
    if (!key) return;
    readRecentItems(({ items, pinnedKeys }) => {
      const set = new Set((Array.isArray(pinnedKeys) ? pinnedKeys : []).map((v) => String(v || "").trim()).filter(Boolean));
      if (set.has(key)) set.delete(key);
      else set.add(key);
      pinnedCampaignKeys = set;
      writeRecentState({ items, pinnedKeys: Array.from(set) });
    });
  }

  /** @type {{ wrap: HTMLElement, trigger: HTMLButtonElement, menu: HTMLElement } | null} */
  let openRecentCampaignRowMenu = null;
  let recentCampaignRowMenuListenersInstalled = false;
  let reopenRecentCampaignRowMenuForId = null;
  let renderRecentListTimer = null;
  let recentCampaignRowMenuIgnoreScrollUntil = 0;

  function closeRecentCampaignRowMenu() {
    if (!openRecentCampaignRowMenu) return;
    const { wrap, trigger, menu } = openRecentCampaignRowMenu;
    menu.classList.remove("gem-overflow-menu--open", "gem-overflow-menu--floating");
    menu.style.removeProperty("top");
    menu.style.removeProperty("left");
    menu.style.removeProperty("visibility");
    trigger.setAttribute("aria-expanded", "false");
    if (menu.parentNode !== wrap) {
      try { wrap.appendChild(menu); } catch (_) {}
    }
    openRecentCampaignRowMenu = null;
  }

  function positionRecentCampaignRowMenu(wrap, menu) {
    const trigger = wrap.querySelector(".gem-overflow-menu-trigger");
    if (!trigger) return;
    menu.classList.add("gem-overflow-menu--floating");
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

  function openRecentCampaignRowMenuAt(wrap) {
    closeRecentCampaignRowMenu();
    const trigger = wrap.querySelector(".gem-overflow-menu-trigger");
    const menu = wrap.querySelector(".gem-overflow-menu");
    if (!trigger || !menu) return;
    document.body.appendChild(menu);
    menu.classList.add("gem-overflow-menu--open");
    trigger.setAttribute("aria-expanded", "true");
    positionRecentCampaignRowMenu(wrap, menu);
    openRecentCampaignRowMenu = { wrap, trigger, menu };
    recentCampaignRowMenuIgnoreScrollUntil = Date.now() + 150;
  }

  function escapeRecentCampaignShareHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function copyRichTextCampaignLinkForItem(item) {
    const url = withCurrentSessionId(String(item && item.urlBase ? item.urlBase : "").trim());
    if (!url) {
      if (window.gemShowToast) window.gemShowToast("Missing campaign URL — cannot share.", { type: "error" });
      return false;
    }
    const name = String(item && item.title ? item.title : "").trim() || "Campaign";
    const plain = name ? `${name} - ${url}` : url;
    const html = `<a href="${escapeRecentCampaignShareHtml(url)}">${escapeRecentCampaignShareHtml(name)}</a>`;

    try {
      if (navigator.clipboard && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" })
          })
        ]);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(plain);
      } else {
        throw new Error("clipboard_unavailable");
      }
      if (window.gemShowToast) window.gemShowToast("Link copied to clipboard.", { type: "success" });
      return true;
    } catch (err) {
      console.warn("[Gem] Recent campaigns: failed to copy rich text link", err);
      if (window.gemShowToast) window.gemShowToast("Failed to copy link to clipboard.", { type: "error" });
      return false;
    }
  }

  function duplicateRecentCampaign(item, duplicateBtn, clickEvent) {
    if (duplicateBtn.disabled || duplicateBtn.dataset.gemDuplicateState === "busy") return;

    const campaignId = String(item && item.id ? item.id : "").trim();
    if (!campaignId) {
      console.warn("[Gem] Duplicate: missing campaign ID on item", item);
      if (window.gemShowToast) window.gemShowToast("Missing campaign ID — cannot duplicate.", { type: "error" });
      return;
    }

    const openInBackground = !!(clickEvent && (clickEvent.ctrlKey || clickEvent.metaKey));
    const openInNewForegroundTab = !openInBackground && isCampaignPage();
    const sessionId = getCurrentSessionId();
    console.log("[Gem] duplicateRecentCampaign: campaignId =", campaignId, "| sessionId =", sessionId, "| pageUrl =", location.href);

    duplicateBtn.disabled = true;
    duplicateBtn.dataset.gemDuplicateState = "busy";
    duplicateBtn.classList.add("gem-overflow-menu-item--duplicating");
    duplicateBtn.setAttribute("aria-busy", "true");
    const spinner = duplicateBtn.querySelector(".gem-recent-campaign-duplicate-spinner");
    if (spinner) spinner.hidden = false;

    function resetBtn() {
      duplicateBtn.disabled = false;
      delete duplicateBtn.dataset.gemDuplicateState;
      duplicateBtn.classList.remove("gem-overflow-menu-item--duplicating");
      duplicateBtn.removeAttribute("aria-busy");
      if (spinner) spinner.hidden = true;
    }

    window.gemDuplicateCampaign(campaignId, sessionId).then((res) => {
      if (!res || !res.ok || res.newCampaignId == null) {
        resetBtn();
        const reason = res && res.reason ? res.reason : "unknown";
        console.warn("[Gem] Duplicate campaign failed:", reason, res);
        if (window.gemShowToast) {
          window.gemShowToast(
            reason === "no_auth_token"
              ? "Could not obtain auth token. Try refreshing the page."
              : `Duplicate failed (${reason}).`,
            { type: "error" }
          );
        }
        return;
      }

      try {
        const url = new URL("/campaignmanager.php", window.location.origin);
        if (sessionId) url.searchParams.set("session_id", sessionId);
        url.searchParams.set("action", "details");
        url.searchParams.set("camp_id", String(res.newCampaignId));
        const urlString = url.toString();

        if (openInBackground) {
          resetBtn();
          closeRecentCampaignRowMenu();
          try {
            chrome.runtime.sendMessage({ action: "openInNewTab", url: urlString, active: false });
          } catch (_) {
            window.open(urlString, "_blank");
          }
          return;
        }

        if (openInNewForegroundTab) {
          resetBtn();
          closeRecentCampaignRowMenu();
          try {
            chrome.runtime.sendMessage({ action: "openInNewTab", url: urlString, active: true });
          } catch (_) {
            window.open(urlString, "_blank");
          }
          return;
        }

        // Success: keep spinner and disabled state, then navigate.
        window.location.assign(urlString);
      } catch (_) {
        resetBtn();
        if (window.gemShowToast) window.gemShowToast("Duplicate succeeded but navigation failed.", { type: "error" });
      }
    });
  }

  function createCampaignRowOverflowMenu(item, opts) {
    const menuOpts = opts && typeof opts === "object" ? opts : {};
    const isPinned = pinnedCampaignKeys.has(item.urlBase);
    const wrap = document.createElement("div");
    wrap.className = "gem-overflow-menu-wrap gem-overflow-menu-wrap--hover-only";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "gem-overflow-menu-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `Options for ${item.title}`);

    const menu = document.createElement("div");
    menu.className = "gem-overflow-menu";
    menu.setAttribute("role", "menu");

    function makeNavMenuItem(label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gem-overflow-menu-item";
      btn.setAttribute("role", "menuitem");
      btn.textContent = label;
      return btn;
    }

    function openCampaignUrl(targetUrl, clickEvent) {
      const openInBackground = !!(clickEvent && (clickEvent.ctrlKey || clickEvent.metaKey));
      if (menuOpts.navigateInCurrentTab && !openInBackground) {
        window.location.assign(targetUrl);
      } else if (openInBackground) {
        try {
          chrome.runtime.sendMessage({ action: "openInNewTab", url: targetUrl, active: false });
        } catch (_) {
          window.open(targetUrl, "_blank");
        }
      } else {
        chrome.runtime.sendMessage({
          action: "focusOrOpenCampaignTab",
          campaignId: String(item.id || ""),
          targetUrl
        });
      }
      closeRecentCampaignRowMenu();
    }

    function appendDivider() {
      const divider = document.createElement("div");
      divider.className = "gem-overflow-menu-divider";
      divider.setAttribute("role", "separator");
      menu.appendChild(divider);
    }

    if (!menuOpts.hidePreview) {
      const previewItem = makeNavMenuItem("Preview");
      const previewCampId = String(item.id || "").trim();
      previewItem.addEventListener("mouseenter", () => {
        prefetchDrawerPreviewCampaign(
          previewCampId,
          DRAWER_PREVIEW_PRIORITY_MENU_HOVER,
          "menu-preview-hover"
        );
      });
      previewItem.addEventListener("pointerdown", () => {
        prefetchDrawerPreviewCampaign(
          previewCampId,
          DRAWER_PREVIEW_PRIORITY_MENU_HOVER,
          "menu-preview-pointerdown"
        );
      });
      previewItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeRecentCampaignRowMenu();
        openCampaignPreview(previewCampId, String(item.title || "").trim());
      });
      menu.appendChild(previewItem);
    }

    if (menuOpts.showSwitchToTab) {
      const switchItem = makeNavMenuItem("Switch to tab");
      switchItem.addEventListener("click", (e) => {
        e.stopPropagation();
        openCampaignUrl(withCurrentSessionId(item.urlBase));
      });
      menu.appendChild(switchItem);
    }

    if (!menuOpts.hideEditSettings) {
      const editSettingsItem = makeNavMenuItem("Edit Settings");
      editSettingsItem.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = new URL("/campaignmanager.php", window.location.origin);
        const sid = getCurrentSessionId();
        if (sid) url.searchParams.set("session_id", sid);
        url.searchParams.set("action", "details");
        url.searchParams.set("camp_id", String(item.id || ""));
        url.searchParams.set("step", "camp3");
        url.searchParams.set("sec", String(Date.now()));
        openCampaignUrl(url.toString(), e);
      });
      menu.appendChild(editSettingsItem);
    }

    if (!menuOpts.hideEditContent) {
      const editContentItem = makeNavMenuItem("Edit Content");
      editContentItem.addEventListener("click", (e) => {
        e.stopPropagation();
        openCampaignUrl(withCurrentSessionId(item.urlBase), e);
      });
      menu.appendChild(editContentItem);
    }

    const shareItem = makeNavMenuItem("Share");
    shareItem.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRecentCampaignRowMenu();
      void copyRichTextCampaignLinkForItem(item);
    });
    menu.appendChild(shareItem);

    appendDivider();

    const pinItem = document.createElement("button");
    pinItem.type = "button";
    pinItem.className = "gem-overflow-menu-item";
    pinItem.setAttribute("role", "menuitem");
    pinItem.textContent = isPinned ? "Unpin" : "Pin";
    pinItem.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePinnedCampaign(item.urlBase);
      closeRecentCampaignRowMenu();
    });
    menu.appendChild(pinItem);

    const duplicateItem = document.createElement("button");
    duplicateItem.type = "button";
    duplicateItem.className = "gem-overflow-menu-item";
    duplicateItem.setAttribute("role", "menuitem");

    const duplicateLabel = document.createElement("span");
    duplicateLabel.textContent = "Duplicate";

    const duplicateSpinner = document.createElement("span");
    duplicateSpinner.className = "gem-recent-campaign-duplicate-spinner";
    duplicateSpinner.setAttribute("aria-hidden", "true");
    duplicateSpinner.hidden = true;

    duplicateItem.appendChild(duplicateLabel);
    duplicateItem.appendChild(duplicateSpinner);

    duplicateItem.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateRecentCampaign(item, duplicateItem, e);
    });
    menu.appendChild(duplicateItem);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu.classList.contains("gem-overflow-menu--open")) {
        closeRecentCampaignRowMenu();
      } else {
        openRecentCampaignRowMenuAt(wrap);
      }
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    return wrap;
  }

  function ensureRecentCampaignRowMenuListeners() {
    if (recentCampaignRowMenuListenersInstalled) return;
    recentCampaignRowMenuListenersInstalled = true;
    document.addEventListener(
      "click",
      (e) => {
        if (!openRecentCampaignRowMenu) return;
        const { wrap, menu } = openRecentCampaignRowMenu;
        if (wrap.contains(e.target) || menu.contains(e.target)) return;
        closeRecentCampaignRowMenu();
      },
      true
    );
    window.addEventListener(
      "scroll",
      () => {
        if (!openRecentCampaignRowMenu) return;
        if (Date.now() < recentCampaignRowMenuIgnoreScrollUntil) return;
        closeRecentCampaignRowMenu();
      },
      true
    );
    window.addEventListener("resize", closeRecentCampaignRowMenu);
  }

  function drawerPreviewDbg(...args) {
    if (DRAWER_PREVIEW_DEBUG) console.log("[Gemma recent-campaigns][preview]", ...args);
  }

  function drawerPreviewPriorityLabel(priority) {
    switch (priority) {
      case DRAWER_PREVIEW_PRIORITY_ACTIVE:
        return "active";
      case DRAWER_PREVIEW_PRIORITY_ADJACENT:
        return "adjacent";
      case DRAWER_PREVIEW_PRIORITY_MENU_HOVER:
        return "menu-hover";
      default:
        return String(priority);
    }
  }

  function buildPreviewIframeUrl(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return "";
    const url = new URL("/preview_fs_iframe.php", window.location.origin);
    const sid = getCurrentSessionId();
    if (sid) url.searchParams.set("session_id", sid);
    url.searchParams.set("camp_id", id);
    return url.toString();
  }

  function collectPreviewNavCampaignIds(activeItem, openCampaigns, pinnedCampaigns, recentlyEditedCampaigns, listOtherForSection) {
    const ids = [];
    const titles = {};
    const previousTitles = previewCampaignTitleById;
    const activeTabId = activeItem ? String(activeItem.id || "").trim() : "";
    const seen = new Set();
    function pushItem(item) {
      const id = String(item && item.id ? item.id : "").trim();
      if (!id || seen.has(id)) return;
      if (activeTabId && id === activeTabId) return;
      seen.add(id);
      ids.push(id);
      titles[id] = String(item && item.title ? item.title : id).trim() || id;
    }
    function pushDisplayEntry(entry) {
      const primary = getRecentDisplayEntryPrimaryItem(entry);
      if (primary) pushItem(primary);
    }
    (Array.isArray(openCampaigns) ? openCampaigns : []).forEach(pushDisplayEntry);
    (Array.isArray(pinnedCampaigns) ? pinnedCampaigns : []).forEach(pushDisplayEntry);
    (Array.isArray(recentlyEditedCampaigns) ? recentlyEditedCampaigns : []).forEach(pushDisplayEntry);
    (Array.isArray(listOtherForSection) ? listOtherForSection : []).forEach(pushItem);
    if (previewOpen && previewCampaignId && previousTitles[previewCampaignId]) {
      titles[previewCampaignId] = previousTitles[previewCampaignId];
    }
    previewCampaignTitleById = titles;
    return ids;
  }

  function getPreviewCampaignTitle(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return "";
    return previewCampaignTitleById[id] || id;
  }

  function getDrawerPreviewNeighborIds(activeId) {
    const id = String(activeId || "").trim();
    if (!id) return [];
    const idx = previewNavCampaignIds.indexOf(id);
    if (idx < 0) return [id];
    const result = [id];
    if (idx > 0) result.push(previewNavCampaignIds[idx - 1]);
    if (idx + 1 < previewNavCampaignIds.length) result.push(previewNavCampaignIds[idx + 1]);
    return result;
  }

  function getDrawerPreviewCacheEntry(campaignId) {
    return drawerPreviewCacheByCampId.get(String(campaignId || "").trim()) || null;
  }

  function isDrawerPreviewCachedReady(campaignId) {
    const entry = getDrawerPreviewCacheEntry(campaignId);
    return !!(entry && entry.ready && entry.campId === String(campaignId || "").trim());
  }

  function isDrawerPreviewLoadError(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return false;
    if (drawerPreviewLoadErrorByCampId.has(id)) return true;
    const entry = getDrawerPreviewCacheEntry(id);
    return !!(entry && entry.loadError);
  }

  function clearDrawerPreviewLoadError(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return;
    drawerPreviewLoadErrorByCampId.delete(id);
    const entry = getDrawerPreviewCacheEntry(id);
    if (entry) delete entry.loadError;
  }

  function markDrawerPreviewLoadError(campaignId, reason) {
    const id = String(campaignId || "").trim();
    if (!id) return;
    const errorReason = reason || "templating";
    drawerPreviewLoadErrorByCampId.set(id, errorReason);
    const entry = getDrawerPreviewCacheEntry(id);
    if (entry) entry.loadError = errorReason;
    if (previewOpen && previewCampaignId === id) {
      setDrawerPreviewOverlay("error", { message: DRAWER_PREVIEW_TEMPLATING_ERROR_MSG });
    }
  }

  function applyDrawerPreviewPendingLoadError(campaignId, entry) {
    const id = String(campaignId || "").trim();
    if (!id || !entry) return;
    if (drawerPreviewLoadErrorByCampId.has(id)) {
      entry.loadError = drawerPreviewLoadErrorByCampId.get(id);
    }
  }

  function removeDrawerPreviewCacheEntry(campId, reason) {
    const id = String(campId || "").trim();
    const entry = drawerPreviewCacheByCampId.get(id);
    if (!entry) return;

    if (reason && DRAWER_PREVIEW_DEBUG) {
      drawerPreviewDbg(`[preload:${reason}]`, {
        campId: id,
        slotRole: entry.slotRole,
        wasReady: entry.ready,
      });
    }

    drawerPreviewCacheByCampId.delete(id);
    drawerPreviewLoadErrorByCampId.delete(id);
    drawerPreviewIframeToCampId.delete(entry.iframe);
    entry.iframe.classList.remove(
      "gem-recent-campaigns-preview-iframe--active",
      "gem-recent-campaigns-preview-iframe--cached"
    );
    delete entry.iframe.dataset.gemPreviewCampId;
  }

  function evictLruDrawerPreviewSlot(excludeCampId) {
    const exclude = String(excludeCampId || "").trim();
    let oldest = null;
    let oldestTime = Infinity;

    drawerPreviewCacheByCampId.forEach((entry, campId) => {
      if (campId === exclude) return;
      if (campId === previewCampaignId) return;
      if (drawerPreviewBackgroundLoad && drawerPreviewBackgroundLoad.campId === campId) return;
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldest = entry;
      }
    });

    if (!oldest) return null;
    oldest.iframe.setAttribute("src", "about:blank");
    removeDrawerPreviewCacheEntry(oldest.campId, "evicted");
    return oldest.iframe;
  }

  function getFreeDrawerPreviewIframe(preferredCampId) {
    for (const iframe of drawerPreviewPoolIframes) {
      if (!drawerPreviewIframeToCampId.has(iframe)) return iframe;
    }
    return evictLruDrawerPreviewSlot(preferredCampId);
  }

  function bindDrawerPreviewIframeLoad(iframe, campId, loadToken, startedAt) {
    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      const entry = drawerPreviewCacheByCampId.get(campId);
      if (!entry || entry.loadToken !== loadToken) return;

      entry.ready = true;
      entry.lastUsed = Date.now();
      applyDrawerPreviewPendingLoadError(campId, entry);

      if (DRAWER_PREVIEW_DEBUG) {
        drawerPreviewDbg("[preload:finished]", {
          campId,
          slotRole: entry.slotRole,
          loadToken,
          elapsedMs: startedAt ? Date.now() - startedAt : null,
        });
      }

      if (
        drawerPreviewBackgroundLoad &&
        drawerPreviewBackgroundLoad.campId === campId &&
        drawerPreviewBackgroundLoad.loadToken === loadToken
      ) {
        drawerPreviewBackgroundLoad = null;
      }

      if (previewOpen && campId === previewCampaignId) {
        swapActiveDrawerPreviewIframe(campId);
        if (entry.loadError) {
          setDrawerPreviewOverlay("error", { message: DRAWER_PREVIEW_TEMPLATING_ERROR_MSG });
        } else {
          setDrawerPreviewOverlay("none");
        }
        enqueueDrawerPreviewAdjacentLoads(campId);
        scrollDrawerPreviewActiveRowIntoView();
      }

      drainDrawerPreviewLoadQueue();
    };
    iframe.addEventListener("load", onLoad);
  }

  function startDrawerPreviewIframeLoad(campaignId, slotRole, priority) {
    const campId = String(campaignId || "").trim();
    if (!campId) return false;

    clearDrawerPreviewLoadError(campId);

    const existing = getDrawerPreviewCacheEntry(campId);
    if (existing && existing.ready) {
      existing.lastUsed = Date.now();
      existing.slotRole = slotRole;
      return true;
    }
    if (existing && !existing.ready) {
      existing.slotRole = slotRole;
      return true;
    }

    const nextSrc = buildPreviewIframeUrl(campId);
    if (!nextSrc) return false;

    let iframe = getFreeDrawerPreviewIframe(campId);
    if (!iframe) return false;

    const prevCampId = drawerPreviewIframeToCampId.get(iframe);
    if (prevCampId && prevCampId !== campId) {
      removeDrawerPreviewCacheEntry(prevCampId, "replaced");
    }

    const loadToken = ++drawerPreviewLoadTokenSeq;
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

    drawerPreviewCacheByCampId.set(campId, entry);
    drawerPreviewIframeToCampId.set(iframe, campId);
    iframe.dataset.gemPreviewCampId = campId;
    iframe.classList.add("gem-recent-campaigns-preview-iframe--cached");
    iframe.classList.remove("gem-recent-campaigns-preview-iframe--active");

    drawerPreviewBackgroundLoad = { iframe, campId, priority, loadToken };
    bindDrawerPreviewIframeLoad(iframe, campId, loadToken, startedAt);
    iframe.setAttribute("src", nextSrc);

    if (DRAWER_PREVIEW_DEBUG) {
      drawerPreviewDbg("[preload:started]", {
        campId,
        slotRole,
        priority: drawerPreviewPriorityLabel(priority),
        loadToken,
      });
    }
    return true;
  }

  function cancelDrawerPreviewBackgroundLoad(reason) {
    if (!drawerPreviewBackgroundLoad) return;
    const { iframe, campId, loadToken } = drawerPreviewBackgroundLoad;
    drawerPreviewBackgroundLoad = null;
    const entry = getDrawerPreviewCacheEntry(campId);
    if (entry && !entry.ready && entry.iframe === iframe) {
      if (DRAWER_PREVIEW_DEBUG) {
        drawerPreviewDbg("[preload:cancelled]", { campId, reason: reason || "unknown", loadToken });
      }
      iframe.setAttribute("src", "about:blank");
      removeDrawerPreviewCacheEntry(campId);
    }
  }

  function scheduleDrawerPreviewBackgroundLoad(campaignId, priority, slotRole) {
    const campId = String(campaignId || "").trim();
    if (!campId) return;
    if (campId === previewCampaignId && isDrawerPreviewCachedReady(campId)) return;
    if (isDrawerPreviewCachedReady(campId)) return;

    const existingEntry = getDrawerPreviewCacheEntry(campId);
    if (existingEntry && !existingEntry.ready) {
      if (drawerPreviewBackgroundLoad && drawerPreviewBackgroundLoad.campId === campId) return;
    }

    if (drawerPreviewBackgroundLoad) {
      if (priority < drawerPreviewBackgroundLoad.priority) {
        cancelDrawerPreviewBackgroundLoad("preempted-by-higher-priority");
      } else if (drawerPreviewBackgroundLoad.campId === campId) {
        return;
      } else {
        const queued = drawerPreviewLoadQueue.some((item) => item.campId === campId);
        if (!queued) {
          drawerPreviewLoadQueue.push({ campId, priority, slotRole });
          drawerPreviewLoadQueue.sort((a, b) => a.priority - b.priority);
        }
        return;
      }
    }

    if (!startDrawerPreviewIframeLoad(campId, slotRole, priority)) {
      const queued = drawerPreviewLoadQueue.some((item) => item.campId === campId);
      if (!queued) {
        drawerPreviewLoadQueue.push({ campId, priority, slotRole });
        drawerPreviewLoadQueue.sort((a, b) => a.priority - b.priority);
      }
    }
  }

  function drainDrawerPreviewLoadQueue() {
    if (drawerPreviewBackgroundLoad) return;

    while (drawerPreviewLoadQueue.length) {
      const next = drawerPreviewLoadQueue.shift();
      if (!next) break;
      if (isDrawerPreviewCachedReady(next.campId)) continue;
      if (startDrawerPreviewIframeLoad(next.campId, next.slotRole, next.priority)) {
        break;
      }
    }
  }

  function enqueueDrawerPreviewAdjacentLoads(activeCampId) {
    const neighbors = getDrawerPreviewNeighborIds(activeCampId);
    const roles = ["adjacentPrev", "adjacentNext"];
    for (let i = 1; i < neighbors.length; i++) {
      scheduleDrawerPreviewBackgroundLoad(
        neighbors[i],
        DRAWER_PREVIEW_PRIORITY_ADJACENT,
        roles[i - 1] || "adjacentNext"
      );
    }
  }

  function prefetchDrawerPreviewCampaign(campaignId, priority, trigger) {
    const campId = String(campaignId || "").trim();
    if (!campId) return;
    if (DRAWER_PREVIEW_DEBUG) {
      drawerPreviewDbg("[preload:trigger]", {
        campId,
        priority: drawerPreviewPriorityLabel(priority),
        trigger: trigger || "unknown",
      });
    }
    ensureDrawerPreviewPoolInitialized();
    scheduleDrawerPreviewBackgroundLoad(campId, priority, "menu-hover");
  }

  function swapActiveDrawerPreviewIframe(campaignId) {
    const campId = String(campaignId || "").trim();
    if (!campId) return false;

    const entry = getDrawerPreviewCacheEntry(campId);
    if (!entry || !entry.ready) return false;

    drawerPreviewPoolIframes.forEach((iframe) => {
      iframe.classList.remove("gem-recent-campaigns-preview-iframe--active");
      iframe.classList.add("gem-recent-campaigns-preview-iframe--cached");
      const cachedEntry = getDrawerPreviewCacheEntry(drawerPreviewIframeToCampId.get(iframe) || "");
      if (cachedEntry && cachedEntry.slotRole === "active") cachedEntry.slotRole = "predictive";
    });

    entry.iframe.classList.remove("gem-recent-campaigns-preview-iframe--cached");
    entry.iframe.classList.add("gem-recent-campaigns-preview-iframe--active");
    entry.slotRole = "active";
    entry.lastUsed = Date.now();
    return true;
  }

  function ensureDrawerPreviewOverlayMessage(overlay) {
    if (!overlay) return null;
    let messageEl = overlay.querySelector(".gem-recent-campaigns-preview-loading-message");
    if (!messageEl) {
      messageEl = document.createElement("div");
      messageEl.className = "gem-recent-campaigns-preview-loading-message";
      messageEl.setAttribute("role", "alert");
      overlay.appendChild(messageEl);
    }
    return messageEl;
  }

  function setDrawerPreviewOverlay(mode, options) {
    if (!recentPanel) return;
    const opts = options && typeof options === "object" ? options : {};
    const overlay = recentPanel.querySelector(".gem-recent-campaigns-preview-loading");
    if (!overlay) return;
    const spinner = overlay.querySelector(".gem-recent-campaigns-preview-loading-spinner");
    const messageEl = ensureDrawerPreviewOverlayMessage(overlay);

    overlay.classList.remove(
      "gem-recent-campaigns-preview-loading--dimmed",
      "gem-recent-campaigns-preview-loading--spinner",
      "gem-recent-campaigns-preview-loading--flash",
      "gem-recent-campaigns-preview-loading--error"
    );

    if (drawerPreviewLoadingTimer) {
      clearTimeout(drawerPreviewLoadingTimer);
      drawerPreviewLoadingTimer = null;
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
      overlay.classList.add("gem-recent-campaigns-preview-loading--error");
      if (spinner) spinner.hidden = true;
      if (messageEl) {
        messageEl.textContent = opts.message || DRAWER_PREVIEW_TEMPLATING_ERROR_MSG;
        messageEl.hidden = false;
      }
      return;
    }

    if (spinner) spinner.hidden = false;
    if (messageEl) messageEl.hidden = true;

    if (mode === "dimmed") {
      overlay.classList.add("gem-recent-campaigns-preview-loading--dimmed");
    } else if (mode === "spinner") {
      overlay.classList.add("gem-recent-campaigns-preview-loading--spinner");
    } else if (mode === "flash") {
      overlay.classList.add("gem-recent-campaigns-preview-loading--flash");
      overlay.classList.add("gem-recent-campaigns-preview-loading--spinner");
    }

    const autoHideMs =
      opts.autoHideMs !== undefined ? opts.autoHideMs : DRAWER_PREVIEW_LOADING_TIMEOUT_MS;

    if (autoHideMs > 0) {
      drawerPreviewLoadingTimer = setTimeout(() => setDrawerPreviewOverlay("none"), autoHideMs);
    }
  }

  function playDrawerPreviewSwapTransition() {
    setDrawerPreviewOverlay("flash", { autoHideMs: DRAWER_PREVIEW_SWAP_FLASH_MS });
  }

  function ensureDrawerPreviewPoolInitialized() {
    if (!recentPanel) return;
    const wrap = recentPanel.querySelector(".gem-recent-campaigns-preview-iframe-wrap");
    if (!wrap) return;

    let stack = wrap.querySelector(".gem-recent-campaigns-preview-iframe-stack");
    if (!stack) {
      wrap.innerHTML = `
        <div class="gem-recent-campaigns-preview-iframe-stack"></div>
        <div class="gem-recent-campaigns-preview-loading" hidden aria-hidden="true">
          <div class="gem-recent-campaigns-preview-loading-spinner" aria-hidden="true"></div>
          <div class="gem-recent-campaigns-preview-loading-message" role="alert" hidden></div>
        </div>
      `.trim();
      stack = wrap.querySelector(".gem-recent-campaigns-preview-iframe-stack");
      drawerPreviewPoolIframes = [];
      drawerPreviewCacheByCampId.clear();
      drawerPreviewLoadErrorByCampId.clear();
      drawerPreviewIframeToCampId.clear();
    }

    if (!stack || drawerPreviewPoolIframes.length >= DRAWER_PREVIEW_POOL_SIZE) return;

    stack.innerHTML = "";
    drawerPreviewPoolIframes = [];

    for (let i = 0; i < DRAWER_PREVIEW_POOL_SIZE; i++) {
      const iframe = document.createElement("iframe");
      iframe.className = "gem-recent-campaigns-preview-iframe gem-recent-campaigns-preview-iframe--cached";
      iframe.title = "Campaign preview";
      iframe.dataset.gemPoolIndex = String(i);
      stack.appendChild(iframe);
      drawerPreviewPoolIframes.push(iframe);
    }
  }

  function tearDownDrawerPreviewPool() {
    cancelDrawerPreviewBackgroundLoad("drawer-closed");
    drawerPreviewLoadQueue = [];
    drawerPreviewPoolIframes.forEach((iframe) => {
      iframe.setAttribute("src", "about:blank");
      iframe.classList.remove(
        "gem-recent-campaigns-preview-iframe--active",
        "gem-recent-campaigns-preview-iframe--cached"
      );
      delete iframe.dataset.gemPreviewCampId;
    });
    drawerPreviewCacheByCampId.clear();
    drawerPreviewLoadErrorByCampId.clear();
    drawerPreviewIframeToCampId.clear();
    drawerPreviewPoolIframes = [];
    setDrawerPreviewOverlay("none");
  }

  function showDrawerPreview(campaignId) {
    const campId = String(campaignId || "").trim();
    if (!campId) return false;

    ensureDrawerPreviewPoolInitialized();

    if (isDrawerPreviewCachedReady(campId)) {
      swapActiveDrawerPreviewIframe(campId);
      if (isDrawerPreviewLoadError(campId)) {
        setDrawerPreviewOverlay("error", { message: DRAWER_PREVIEW_TEMPLATING_ERROR_MSG });
      } else {
        playDrawerPreviewSwapTransition();
      }
      enqueueDrawerPreviewAdjacentLoads(campId);
      scrollDrawerPreviewActiveRowIntoView();
      return true;
    }

    const hasVisibleActive =
      previewCampaignId &&
      isDrawerPreviewCachedReady(previewCampaignId) &&
      previewCampaignId !== campId;

    const pendingEntry = getDrawerPreviewCacheEntry(campId);
    if (pendingEntry && !pendingEntry.ready) {
      setDrawerPreviewOverlay(hasVisibleActive ? "dimmed" : "spinner");
      return true;
    }

    setDrawerPreviewOverlay(hasVisibleActive ? "dimmed" : "spinner");
    cancelDrawerPreviewBackgroundLoad("active-selection");
    drawerPreviewLoadQueue = drawerPreviewLoadQueue.filter((item) => item.campId !== campId);
    startDrawerPreviewIframeLoad(campId, "active", DRAWER_PREVIEW_PRIORITY_ACTIVE);
    return true;
  }

  function findDrawerCampaignRowByCampaignId(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id || !recentPanel) return null;
    const scopes = [
      recentPanel.querySelector(".gem-recent-campaigns-list"),
      recentPanel.querySelector(".gem-recent-campaigns-active-tab-slot"),
    ].filter(Boolean);
    for (const scope of scopes) {
      const rows = scope.querySelectorAll(".gem-recent-campaign-row[data-gem-campaign-id]");
      for (const row of rows) {
        if (String(row.dataset.gemCampaignId || "").trim() === id) return row;
      }
    }
    return null;
  }

  function scrollDrawerPreviewActiveRowIntoView() {
    if (!previewOpen || !previewCampaignId || !recentPanel) return;
    if (typeof window.gemScrollIntoViewIfNeeded !== "function") return;

    requestAnimationFrame(() => {
      const row = findDrawerCampaignRowByCampaignId(previewCampaignId);
      const scrollRoot = recentPanel.querySelector(".gem-recent-campaigns-panel-content");
      if (!row || !scrollRoot) return;
      window.gemScrollIntoViewIfNeeded(row, { scrollRoot, padding: 8 });
    });
  }

  function syncDrawerPreviewActiveRow() {
    if (!recentPanel) return;
    const scopes = [
      recentPanel.querySelector(".gem-recent-campaigns-list"),
      recentPanel.querySelector(".gem-recent-campaigns-active-tab-slot"),
    ].filter(Boolean);

    if (!previewOpen || !previewCampaignId) {
      scopes.forEach((scope) => {
        scope.querySelectorAll(`.gem-recent-campaign-row.${DRAWER_PREVIEW_ACTIVE_ROW_CLASS}`).forEach((row) => {
          row.classList.remove(DRAWER_PREVIEW_ACTIVE_ROW_CLASS);
        });
      });
      return;
    }

    const row = findDrawerCampaignRowByCampaignId(previewCampaignId);
    scopes.forEach((scope) => {
      scope.querySelectorAll(`.gem-recent-campaign-row.${DRAWER_PREVIEW_ACTIVE_ROW_CLASS}`).forEach((activeRow) => {
        if (activeRow !== row) activeRow.classList.remove(DRAWER_PREVIEW_ACTIVE_ROW_CLASS);
      });
    });

    if (row && !row.classList.contains(DRAWER_PREVIEW_ACTIVE_ROW_CLASS)) {
      row.classList.add(DRAWER_PREVIEW_ACTIVE_ROW_CLASS);
    }

    scrollDrawerPreviewActiveRowIntoView();
  }

  function syncPreviewUi() {
    if (!recentPanel) return;
    const prevBtn = recentPanel.querySelector(".gem-recent-campaigns-preview-prev");
    const nextBtn = recentPanel.querySelector(".gem-recent-campaigns-preview-next");
    const titleEl = recentPanel.querySelector(".gem-recent-campaigns-preview-title");

    recentPanel.classList.toggle("gem-recent-campaigns-panel--preview-open", previewOpen);
    syncDrawerPreviewActiveRow();
    if (!previewOpen) return;

    const idx = previewNavCampaignIds.indexOf(previewCampaignId);
    if (idx < 0) {
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = !previewNavCampaignIds.length;
    } else {
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.disabled = idx >= previewNavCampaignIds.length - 1;
    }
    if (titleEl) titleEl.textContent = getPreviewCampaignTitle(previewCampaignId);
  }

  function openCampaignPreview(campaignId, campaignTitle) {
    const id = String(campaignId || "").trim();
    if (!id) return;
    if (!recentPanel) createRecentPanel();
    const title = String(campaignTitle || "").trim();
    if (title) previewCampaignTitleById[id] = title;
    previewOpen = true;
    previewCampaignId = id;
    if (previewNavCampaignIds.length && !previewNavCampaignIds.includes(id)) {
      previewNavCampaignIds = [id, ...previewNavCampaignIds];
    }
    syncPreviewUi();
    showDrawerPreview(id);
  }

  function closeCampaignPreview() {
    previewOpen = false;
    previewCampaignId = "";
    setDrawerPreviewOverlay("none");
    syncPreviewUi();
  }

  function navigatePreview(delta) {
    if (!previewOpen || !previewNavCampaignIds.length) return;
    const idx = previewNavCampaignIds.indexOf(previewCampaignId);
    if (idx < 0) {
      if (Number(delta) > 0) {
        previewCampaignId = previewNavCampaignIds[0];
        syncPreviewUi();
        showDrawerPreview(previewCampaignId);
      }
      return;
    }
    const nextIdx = idx + Number(delta);
    if (nextIdx < 0 || nextIdx >= previewNavCampaignIds.length) return;
    previewCampaignId = previewNavCampaignIds[nextIdx];
    syncPreviewUi();
    showDrawerPreview(previewCampaignId);
  }

  function syncPreviewAfterRender(activeItem, openCampaigns, pinnedCampaigns, recentlyEditedCampaigns, listOtherForSection) {
    previewNavCampaignIds = collectPreviewNavCampaignIds(
      activeItem,
      openCampaigns,
      pinnedCampaigns,
      recentlyEditedCampaigns,
      listOtherForSection
    );
    if (!previewOpen) return;
    syncPreviewUi();
    enqueueDrawerPreviewAdjacentLoads(previewCampaignId);
  }

  function getRecentCampaignsShortcutLabel() {
    return typeof window.gemPanelShortcutLabel === "function"
      ? window.gemPanelShortcutLabel("/")
      : "CTRL+/";
  }

  function buildRecentNavItem() {
    const li = document.createElement("li");
    li.className = "e-navigation__menu_list_item";
    li.id = RECENT_NAV_ID;
    li.innerHTML = `
      <button type="button" class="e-navigation__action" aria-haspopup="true" aria-expanded="false" menu-item-id="recent_campaigns_new_main" tracking-id="recent_campaigns_new_main" aria-label="Recent Campaigns">
        <e-icon class="e-navigation__action_icon" color="inherit" icon="ac-action-timer">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon text-color-inherit">&#xF021;</div>
          </div>
        </e-icon>
        <span class="e-navigation__action_text">Recent Campaigns</span>
      </button>
    `;

    const button = li.querySelector(".e-navigation__action");
    button.addEventListener("click", () => {
      toggleRecentPanel();
    });
    return li;
  }

  function createRecentPanel() {
    if (recentPanel && recentBackdrop) return;

    const backdrop = document.createElement("div");
    backdrop.id = RECENT_BACKDROP_ID;
    backdrop.className = "gem-recent-campaigns-backdrop";
    backdrop.addEventListener("click", hideRecentPanel);

    const panel = document.createElement("div");
    panel.id = RECENT_PANEL_ID;
    panel.className = "gem-recent-campaigns-panel";

    panel.innerHTML = `
      <div class="gem-recent-campaigns-panel-main">
        <div class="gem-recent-campaigns-panel-header">
          <span class="gem-recent-campaigns-panel-title">
            Recent Campaigns
            <span class="gem-shortcut-hint gem-shortcut-hint--on-surface">${getRecentCampaignsShortcutLabel()}</span>
          </span>
          <button type="button" class="gem-recent-campaigns-panel-close" aria-label="Close Recent Campaigns panel">✕</button>
        </div>
        <div class="gem-recent-campaigns-panel-content gem-scrollable">
          <div class="gem-recent-campaigns-active-tab-slot"></div>
          <div class="gem-recent-campaigns-controls">
            <input type="text" class="gem-recent-campaigns-search" placeholder="Search campaigns" aria-label="Search recent campaigns" />
          </div>
          <div class="gem-recent-campaign-language-filters"></div>
          <div class="gem-recent-campaigns-list"></div>
        </div>
      </div>
      <aside class="gem-recent-campaigns-preview-column">
        <div class="gem-recent-campaigns-preview-toolbar">
          <button type="button" class="gem-recent-campaigns-preview-prev" aria-label="Previous campaign preview">&lt;</button>
          <button type="button" class="gem-recent-campaigns-preview-next" aria-label="Next campaign preview">&gt;</button>
          <span class="gem-recent-campaigns-preview-title"></span>
          <button type="button" class="gem-recent-campaigns-preview-close" aria-label="Close campaign preview">✕</button>
        </div>
        <div class="gem-recent-campaigns-preview-iframe-wrap">
          <div class="gem-recent-campaigns-preview-iframe-stack"></div>
          <div class="gem-recent-campaigns-preview-loading" hidden aria-hidden="true">
            <div class="gem-recent-campaigns-preview-loading-spinner" aria-hidden="true"></div>
            <div class="gem-recent-campaigns-preview-loading-message" role="alert" hidden></div>
          </div>
        </div>
      </aside>
    `;

    const closeBtn = panel.querySelector(".gem-recent-campaigns-panel-close");
    if (closeBtn) closeBtn.addEventListener("click", hideRecentPanel);
    const shortcutHint = panel.querySelector(".gem-shortcut-hint");
    if (shortcutHint && typeof window.gemWireShortcutHint === "function") {
      window.gemWireShortcutHint(shortcutHint);
    }
    const previewPrevBtn = panel.querySelector(".gem-recent-campaigns-preview-prev");
    const previewNextBtn = panel.querySelector(".gem-recent-campaigns-preview-next");
    const previewCloseBtn = panel.querySelector(".gem-recent-campaigns-preview-close");
    if (previewPrevBtn) previewPrevBtn.addEventListener("click", () => navigatePreview(-1));
    if (previewNextBtn) previewNextBtn.addEventListener("click", () => navigatePreview(1));
    if (previewCloseBtn) previewCloseBtn.addEventListener("click", closeCampaignPreview);
    ensureDrawerPreviewPoolInitialized();
    const searchInput = panel.querySelector(".gem-recent-campaigns-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        activeSearchQuery = String(searchInput.value || "").trim().toLowerCase();
        renderRecentList();
      });
    }

    const mountTarget = document.body || document.documentElement;
    if (!mountTarget) return;
    mountTarget.appendChild(backdrop);
    mountTarget.appendChild(panel);
    recentBackdrop = backdrop;
    recentPanel = panel;
  }

  function showRecentPanel() {
    if (!recentPanel || !recentBackdrop) createRecentPanel();
    if (!recentPanel || !recentBackdrop) return;
    loadUiState(() => {
      renderRecentList();
      requestAnimationFrame(() => {
        recentBackdrop.classList.add("gem-recent-campaigns-backdrop--open");
        recentPanel.classList.add("gem-recent-campaigns-panel--open");
        if (typeof window.gemLayerRaise === "function") {
          window.gemLayerRaise(recentBackdrop, { tier: "modal" });
          window.gemLayerRaise(recentPanel, { tier: "modal" });
        }
        const searchInput = recentPanel.querySelector(".gem-recent-campaigns-search");
        if (searchInput) searchInput.focus();
        startActiveTabUnsavedPoll();
      });
    });
    stableOrderIds = null;
    document.addEventListener("keydown", onRecentPanelKeydown);
    if (recentOpenTabsPollTimer) clearInterval(recentOpenTabsPollTimer);
    refreshOpenCampaignTabs();
    recentOpenTabsPollTimer = setInterval(() => refreshOpenCampaignTabs(), 2500);
  }

  function hideRecentPanel() {
    if (!recentPanel || !recentBackdrop) return;
    closeRecentCampaignRowMenu();
    closeCampaignPreview();
    tearDownDrawerPreviewPool();
    stopActiveTabUnsavedPoll();
    if (recentOpenTabsPollTimer) {
      clearInterval(recentOpenTabsPollTimer);
      recentOpenTabsPollTimer = null;
    }
    lastAlreadyOpenFingerprint = null;
    lastListFilterKey = "";
    recentPanel.classList.remove("gem-recent-campaigns-panel--open");
    recentBackdrop.classList.remove("gem-recent-campaigns-backdrop--open");
    if (typeof window.gemLayerRelease === "function") {
      window.gemLayerRelease(recentBackdrop);
      window.gemLayerRelease(recentPanel);
    }
    stableOrderIds = null;
    document.removeEventListener("keydown", onRecentPanelKeydown);
    try {
      const ae = document.activeElement;
      if (ae && recentPanel.contains(ae) && typeof ae.blur === "function") ae.blur();
    } catch (_) {}
  }

  function toggleRecentPanel() {
    if (!recentPanel || !recentPanel.classList.contains("gem-recent-campaigns-panel--open")) showRecentPanel();
    else hideRecentPanel();
  }

  window.gemToggleRecentCampaignsPanel = toggleRecentPanel;

  function onRecentPanelKeydown(e) {
    if (
      previewOpen &&
      recentPanel &&
      recentPanel.classList.contains("gem-recent-campaigns-panel--open") &&
      !recentCampaignsShortcutTypingTarget({ includeSearch: true })
    ) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePreview(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigatePreview(1);
        return;
      }
    }

    if (e.key !== "Escape") return;
    if (openRecentCampaignRowMenu) {
      closeRecentCampaignRowMenu();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (previewOpen) {
      closeCampaignPreview();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    hideRecentPanel();
  }

  function recentCampaignsShortcutTypingTarget(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const includeSearch = options.includeSearch === true;
    const ae = document.activeElement;
    if (!ae) return false;
    // Allow Cmd+/ to toggle while search is focused unless includeSearch is set.
    if (
      !includeSearch &&
      ae.classList &&
      ae.classList.contains("gem-recent-campaigns-search") &&
      ae.closest &&
      ae.closest(`#${RECENT_PANEL_ID}`)
    ) {
      return false;
    }
    if (ae.id === "gem-notes-textarea") return false;
    const tag = (ae.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (ae.isContentEditable) return true;
    if (ae.closest && ae.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function setupRecentCampaignsPanelShortcuts() {
    function handleKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      const k = e.key || "";
      if (k !== "/") return;
      if (recentCampaignsShortcutTypingTarget()) return;

      const notesEl = document.getElementById("gem-notes-panel");
      const notesOpen = !!(notesEl && notesEl.dataset.gemPanelOpen === "1");
      if (notesOpen) {
        document.dispatchEvent(new CustomEvent(GEM_CLOSE_NOTES_EVENT, { bubbles: true }));
        showRecentPanel();
      } else {
        toggleRecentPanel();
      }
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    document.addEventListener("keydown", handleKeyDown, true);

    function injectIntoIframe(iframe) {
      try {
        if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
        const iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (!iframeDoc) return;
        if (iframeDoc._gemRecentCampaignsShortcutHandler) return;
        iframeDoc.addEventListener("keydown", handleKeyDown, true);
        iframeDoc._gemRecentCampaignsShortcutHandler = true;
      } catch (_) {}
    }

    function bindRecentShortcutIframeReload(iframe) {
      if (!iframe || iframe._gemRecentCampaignsShortcutIframeLoadBound) return;
      iframe._gemRecentCampaignsShortcutIframeLoadBound = true;
      iframe.addEventListener("load", () => {
        setTimeout(() => injectIntoIframe(iframe), 50);
      });
    }

    function waitForIframeReady(iframe) {
      try {
        if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
        bindRecentShortcutIframeReload(iframe);
        if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
          injectIntoIframe(iframe);
          return;
        }
        let attempts = 0;
        const tick = () => {
          attempts++;
          try {
            if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
              injectIntoIframe(iframe);
              return;
            }
          } catch (_) {}
          if (attempts < 40) setTimeout(tick, 100);
        };
        setTimeout(tick, 100);
      } catch (_) {}
    }

    document.querySelectorAll("iframe").forEach(waitForIframeReady);
    window.gemDomWatchSubscribe(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === "IFRAME") waitForIframeReady(node);
          else if (node.querySelectorAll) node.querySelectorAll("iframe").forEach(waitForIframeReady);
        });
      });
    });

    document.addEventListener(GEM_CLOSE_RECENT_CAMPAIGNS_EVENT, () => {
      hideRecentPanel();
    });
  }

  function insertRecentNavItem(nav) {
    if (!nav || nav.querySelector(`#${RECENT_NAV_ID}`)) return;
    const notesItem = nav.querySelector(`#${NOTES_NAV_ID}`);
    const settingsItem = nav.querySelector(`#${SETTINGS_NAV_ID}`);
    const recentItem = buildRecentNavItem();

    if (notesItem && settingsItem && notesItem.nextSibling === settingsItem) {
      nav.insertBefore(recentItem, settingsItem);
    } else if (settingsItem) {
      nav.insertBefore(recentItem, settingsItem);
    } else {
      nav.appendChild(recentItem);
    }
  }

  function buildRecentDisplayRow(entry, opts) {
    if (entry && entry.type === "group") return buildVersionGroupRow(entry, opts);
    return buildCampaignRow(entry.item, opts);
  }

  function buildVersionGroupRow(group, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const siblings = Array.isArray(group.siblings) ? group.siblings : [];
    const primary = getVersionGroupPrimaryItem(siblings) || siblings[0];
    if (!primary) return document.createElement("div");

    const row = document.createElement("div");
    row.className = "gem-recent-campaign-row gem-recent-campaign-row--version-group";
    if (group.versionGroupId) row.dataset.gemVersionGroupId = group.versionGroupId;
    if (primary.id) row.dataset.gemCampaignId = primary.id;

    const previewSibling =
      siblings
        .slice()
        .sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0))
        .find((item) => String(item.previewImageUrl || "").trim()) || primary;
    if (
      previewOpen &&
      previewCampaignId &&
      siblings.some((item) => String(item.id || "").trim() === previewCampaignId)
    ) {
      row.classList.add(DRAWER_PREVIEW_ACTIVE_ROW_CLASS);
    }

    const openPrimary = () => {
      chrome.runtime.sendMessage({
        action: "focusOrOpenCampaignTab",
        campaignId: primary.id,
        targetUrl: withCurrentSessionId(primary.urlBase)
      });
    };

    const inner = document.createElement("div");
    inner.className = "gem-recent-campaign-row-inner";

    const previewUrl = String(previewSibling.previewImageUrl || "").trim();
    let thumb;
    if (previewUrl) {
      thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "gem-recent-campaign-thumb gem-recent-campaign-thumb--open";
      thumb.setAttribute("aria-label", getCampaignOpenAriaLabel(primary.title, primary.versionLetter));
      thumb.addEventListener("click", openPrimary);
      const imgEl = document.createElement("img");
      imgEl.className = "gem-recent-campaign-thumb-img";
      imgEl.src = previewUrl;
      imgEl.alt = "";
      imgEl.setAttribute("aria-hidden", "true");
      imgEl.loading = "lazy";
      imgEl.addEventListener("error", () => {
        try {
          imgEl.remove();
        } catch (_) {}
      });
      thumb.appendChild(imgEl);
    } else {
      thumb = document.createElement("div");
      thumb.className = "gem-recent-campaign-thumb";
      thumb.setAttribute("aria-hidden", "true");
    }

    const main = document.createElement("div");
    main.className = "gem-recent-campaign-row-main";

    const titleRow = document.createElement("div");
    titleRow.className = "gem-recent-campaign-title-row";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "gem-recent-campaign-title gem-recent-campaign-title-link";
    title.setAttribute("aria-label", getCampaignOpenAriaLabel(primary.title, primary.versionLetter));
    title.textContent = primary.title;
    title.addEventListener("click", openPrimary);
    titleRow.appendChild(title);
    titleRow.appendChild(createCampaignRowOverflowMenu(primary, options));

    const subject = document.createElement("div");
    subject.className = "gem-recent-campaign-subject";
    subject.textContent = primary.subject || "No subject";

    const langs = document.createElement("div");
    langs.className = "gem-recent-campaign-languages";
    const seenLangs = new Set();
    siblings.forEach((item) => {
      (Array.isArray(item.languages) ? item.languages : []).forEach((lang) => {
        const text = String(lang || "").trim();
        if (!text || seenLangs.has(text)) return;
        seenLangs.add(text);
        const chip = document.createElement("span");
        chip.className = "gem-recent-campaign-lang-chip";
        chip.textContent = text;
        langs.appendChild(chip);
      });
    });

    const noticesRow = buildCampaignRowStatusNotices(options, { type: "group", siblings });
    if (noticesRow) main.appendChild(noticesRow);

    main.appendChild(titleRow);
    main.appendChild(subject);
    if (langs.childElementCount) main.appendChild(langs);
    inner.appendChild(thumb);
    inner.appendChild(main);
    row.appendChild(inner);
    return row;
  }

  function buildCampaignRow(item, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const row = document.createElement("div");
    row.className = "gem-recent-campaign-row";
    const campaignId = String(item && item.id ? item.id : "").trim();
    if (campaignId) row.dataset.gemCampaignId = campaignId;
    if (previewOpen && previewCampaignId && campaignId === previewCampaignId) {
      row.classList.add(DRAWER_PREVIEW_ACTIVE_ROW_CLASS);
    }
    const openCampaign = () => {
      const targetUrl = withCurrentSessionId(item.urlBase);
      chrome.runtime.sendMessage({
        action: "focusOrOpenCampaignTab",
        campaignId: item.id,
        targetUrl
      });
    };

    const inner = document.createElement("div");
    inner.className = "gem-recent-campaign-row-inner";

    const previewUrl = String(item.previewImageUrl || "").trim();
    let thumb;
    if (previewUrl) {
      thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "gem-recent-campaign-thumb gem-recent-campaign-thumb--open";
      thumb.setAttribute("aria-label", `Open campaign ${item.title}`);
      thumb.addEventListener("click", openCampaign);
      const imgEl = document.createElement("img");
      imgEl.className = "gem-recent-campaign-thumb-img";
      imgEl.src = previewUrl;
      imgEl.alt = "";
      imgEl.setAttribute("aria-hidden", "true");
      imgEl.loading = "lazy";
      imgEl.addEventListener("error", () => {
        try {
          imgEl.remove();
        } catch (_) {}
      });
      thumb.appendChild(imgEl);
    } else {
      thumb = document.createElement("div");
      thumb.className = "gem-recent-campaign-thumb";
      thumb.setAttribute("aria-hidden", "true");
    }

    const main = document.createElement("div");
    main.className = "gem-recent-campaign-row-main";

    const titleRow = document.createElement("div");
    titleRow.className = "gem-recent-campaign-title-row";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "gem-recent-campaign-title gem-recent-campaign-title-link";
    title.setAttribute("aria-label", getCampaignOpenAriaLabel(item.title, item.versionLetter));
    title.textContent = item.title;

    title.addEventListener("click", openCampaign);
    titleRow.appendChild(title);
    titleRow.appendChild(createCampaignRowOverflowMenu(item, options));

    const subject = document.createElement("div");
    subject.className = "gem-recent-campaign-subject";
    subject.textContent = item.subject || "No subject";

    const langs = document.createElement("div");
    langs.className = "gem-recent-campaign-languages";
    const langsList = Array.isArray(item.languages) ? item.languages : [];
    langsList.forEach((lang) => {
      const chip = document.createElement("span");
      chip.className = "gem-recent-campaign-lang-chip";
      chip.textContent = lang;
      langs.appendChild(chip);
    });

    const noticesRow = buildCampaignRowStatusNotices(options, { item });
    if (noticesRow) main.appendChild(noticesRow);

    main.appendChild(titleRow);
    main.appendChild(subject);
    main.appendChild(langs);
    inner.appendChild(thumb);
    inner.appendChild(main);
    row.appendChild(inner);
    return row;
  }

  function buildListSourceCampaignRow(item, opts) {
    const row = document.createElement("div");
    row.className = "gem-recent-campaign-row gem-recent-campaign-row--list-source";
    const campaignId = String(item && item.id ? item.id : "").trim();
    if (campaignId) row.dataset.gemCampaignId = campaignId;
    if (previewOpen && previewCampaignId && campaignId === previewCampaignId) {
      row.classList.add(DRAWER_PREVIEW_ACTIVE_ROW_CLASS);
    }
    const openCampaign = () => {
      const targetUrl = withCurrentSessionId(item.urlBase);
      chrome.runtime.sendMessage({
        action: "focusOrOpenCampaignTab",
        campaignId: item.id,
        targetUrl
      });
    };

    const inner = document.createElement("div");
    inner.className = "gem-recent-campaign-row-inner gem-recent-campaign-row-inner--no-thumb";

    const main = document.createElement("div");
    main.className = "gem-recent-campaign-row-main";

    const titleRow = document.createElement("div");
    titleRow.className = "gem-recent-campaign-title-row";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "gem-recent-campaign-title gem-recent-campaign-title-link";
    title.setAttribute("aria-label", getCampaignOpenAriaLabel(item.title, item.versionLetter));
    title.textContent = item.title;
    title.addEventListener("click", openCampaign);
    titleRow.appendChild(title);
    titleRow.appendChild(createCampaignRowOverflowMenu(item));

    const noticesRow = buildCampaignRowStatusNotices(opts || {}, { item });
    if (noticesRow) main.appendChild(noticesRow);
    main.appendChild(titleRow);
    inner.appendChild(main);
    row.appendChild(inner);
    return row;
  }

  function appendActiveTabSection(container, item, statusOpts) {
    const group = document.createElement("div");
    group.className = "gem-recent-campaign-group gem-recent-campaign-group--active-tab";
    const header = document.createElement("div");
    header.className = "gem-recent-campaign-group-header";
    const chip = document.createElement("span");
    chip.className = "gem-recent-campaign-active-tab-chip";
    chip.textContent = "Active tab";
    header.appendChild(chip);
    group.appendChild(header);
    const list = document.createElement("div");
    list.className = "gem-recent-campaign-group-list";
    list.appendChild(
      buildCampaignRow(item, {
        activeUnsavedSlot: true,
        showUnsavedNotice: readDraftSaveButtonUnsavedFromDom(),
        preflightSummary: statusOpts && statusOpts.preflightSummary,
        hidePreview: true,
        hideEditContent: isCampaignPage(),
        hideEditSettings: isCampaignManagerDetailsPage(),
        navigateInCurrentTab: true
      })
    );
    group.appendChild(list);
    container.appendChild(group);
  }

  function countRecentGroupSizes(displayEntries) {
    const open = displayEntries.filter((entry) => isRecentDisplayEntryOpen(entry)).length;
    const pinned = displayEntries.filter((entry) => isRecentDisplayEntryPinned(entry)).length;
    const recentlyEdited = displayEntries.filter((entry) => {
      return !isRecentDisplayEntryOpen(entry) && !isRecentDisplayEntryPinned(entry);
    }).length;
    return { open, pinned, recentlyEdited };
  }

  function renderRecentListNow() {
    if (openRecentCampaignRowMenu) {
      const row = openRecentCampaignRowMenu.wrap.closest(".gem-recent-campaign-row");
      reopenRecentCampaignRowMenuForId = row
        ? String(row.dataset.gemCampaignId || "").trim()
        : null;
    }
    closeRecentCampaignRowMenu();
    const panel = recentPanel || document.getElementById(RECENT_PANEL_ID);
    if (!panel) return;
    if (panel.classList.contains("gem-recent-campaigns-panel--open") && isCampaignPage()) {
      lastActiveTabUnsavedDom = readDraftSaveButtonUnsavedFromDom();
    }
    const filtersContainer = panel.querySelector(".gem-recent-campaign-language-filters");
    const container = panel.querySelector(".gem-recent-campaigns-list");
    const activeTabSlot = panel.querySelector(".gem-recent-campaigns-active-tab-slot");
    const searchInput = panel.querySelector(".gem-recent-campaigns-search");
    if (!container || !filtersContainer) return;
    if (searchInput && searchInput.value !== activeSearchQuery) {
      searchInput.value = activeSearchQuery;
    }
    const excludeCurrent = getCurrentCampaignExclusion();
    const editorPayload = extractCampaignPayload();
    let activeItem =
      editorPayload && editorPayload.id && editorPayload.title && editorPayload.urlBase
        ? normalizeEntry(editorPayload)
        : null;
    readRecentItems(({ items, pinnedKeys }) => {
      if (!activeItem && isCampIdCampaignPage()) {
        const campId = getCampIdParam();
        if (campId) {
          const storedMatch = (Array.isArray(items) ? items : []).find(
            (item) => String(item.id || "").trim() === campId
          );
          if (storedMatch) {
            activeItem = storedMatch;
          } else {
            const pagePayload = extractCampIdCampaignPayload();
            if (pagePayload) activeItem = normalizeEntry(pagePayload);
          }
        }
      }
      readOtherRecentItems((otherRaw) => {
        chrome.storage.local.get({ [PREFLIGHT_LANGUAGE_ALERTS_KEY]: {} }, (prefRes) => {
        const preflightByCampaign = prefRes[PREFLIGHT_LANGUAGE_ALERTS_KEY] || {};
        const rowOpts = (item) => ({
          showUnsavedNotice: isOpenTabUnsavedForItem(item),
          preflightSummary: getCampaignPreflightIssueSummary(preflightByCampaign[String(item.id || "").trim()])
        });
        pinnedCampaignKeys = new Set((Array.isArray(pinnedKeys) ? pinnedKeys : []).map((v) => String(v || "").trim()).filter(Boolean));
        const filterKey = `${activeLanguageFilter}\n${activeSearchQuery}`;
        if (filterKey !== lastListFilterKey) {
          lastAlreadyOpenFingerprint = null;
          lastListFilterKey = filterKey;
        }
        const filteredPinned = new Set(Array.from(pinnedCampaignKeys).filter(Boolean));
        pinnedCampaignKeys = filteredPinned;
        const overlapMain = buildMainRecentOverlapSet(items);
        const excludeVersionGroupId = excludeCurrent
          ? String(
              (
                items.find((item) => {
                  const iid = String(item.id || "").trim();
                  const iurl = String(item.urlBase || "").trim();
                  return (
                    (excludeCurrent.id && iid && iid === excludeCurrent.id) ||
                    (excludeCurrent.urlBase && iurl && iurl === excludeCurrent.urlBase)
                  );
                }) || {}
              ).versionGroupId || ""
            ).trim()
          : "";
        const baseList = excludeCurrent
          ? items.filter((item) => {
              const iid = String(item.id || "").trim();
              const iurl = String(item.urlBase || "").trim();
              const igroup = String(item.versionGroupId || "").trim();
              if (excludeVersionGroupId && igroup && igroup === excludeVersionGroupId) return false;
              if (excludeCurrent.urlBase && iurl && iurl === excludeCurrent.urlBase) return false;
              if (excludeCurrent.id && iid && iid === excludeCurrent.id) return false;
              return true;
            })
          : items.slice();
        const baseDisplayEntries = groupVersionedRecentItems(baseList);
        const baseGroupTotals = countRecentGroupSizes(baseDisplayEntries);
        const uniqueLanguages = [];
        const seenLangs = new Set();
        baseList.forEach((item) => {
          (Array.isArray(item.languages) ? item.languages : []).forEach((lang) => {
            const text = String(lang || "").trim();
            if (!text || seenLangs.has(text)) return;
            seenLangs.add(text);
            uniqueLanguages.push(text);
          });
        });
        if (activeItem) {
          (Array.isArray(activeItem.languages) ? activeItem.languages : []).forEach((lang) => {
            const text = String(lang || "").trim();
            if (!text || seenLangs.has(text)) return;
            seenLangs.add(text);
            uniqueLanguages.push(text);
          });
        }

        if (activeLanguageFilter && !seenLangs.has(activeLanguageFilter)) {
          activeLanguageFilter = "";
        }

        const mountLanguageFilterChips = () => {
          if (uniqueLanguages.length) {
            uniqueLanguages.forEach((lang) => {
              const chip = document.createElement("button");
              chip.type = "button";
              chip.className = "gem-recent-campaign-filter-chip";
              if (activeLanguageFilter === lang) chip.classList.add("gem-recent-campaign-filter-chip--active");
              chip.textContent = lang;
              chip.setAttribute("aria-pressed", activeLanguageFilter === lang ? "true" : "false");
              chip.addEventListener("click", () => {
                activeLanguageFilter = activeLanguageFilter === lang ? "" : lang;
                saveUiState();
                renderRecentList();
              });
              filtersContainer.appendChild(chip);
            });
          }
        };

        const visibleList = activeLanguageFilter
          ? baseList.filter((item) => (Array.isArray(item.languages) ? item.languages : []).includes(activeLanguageFilter))
          : baseList;
        function matchesSearch(item, query) {
          const q = String(query || "").trim().toLowerCase();
          if (!q) return true;
          const phrases = [];
          let remainder = q.replace(/"([^"]+)"/g, (_, p1) => {
            const phrase = String(p1 || "").trim();
            if (phrase) phrases.push(phrase);
            return " ";
          });
          const terms = remainder.split(/\s+/).map((v) => v.trim()).filter(Boolean);
          const haystack = `${item.title} ${item.subject} ${(item.languages || []).join(" ")} ${item.id}`.toLowerCase();
          return phrases.every((p) => haystack.includes(p)) && terms.every((t) => haystack.includes(t));
        }
        const searchFilteredMain = activeSearchQuery
          ? visibleList.filter((item) => matchesSearch(item, activeSearchQuery))
          : visibleList;
        const displayEntries = groupVersionedRecentItems(searchFilteredMain);

        const otherEnriched = (Array.isArray(otherRaw) ? otherRaw : [])
          .map((e) => {
            const id = String(e && e.id ? e.id : "").trim();
            const title = String(e && e.title ? e.title : "").trim();
            const urlBase = urlBaseFromCampaignId(id);
            const mainMatch = baseList.find((item) => String(item.id || "").trim() === id);
            const versionLetter = mainMatch ? String(mainMatch.versionLetter || "").trim() : "";
            return {
              id,
              title,
              urlBase,
              loggedAt: Number.isFinite(e.loggedAt) ? e.loggedAt : 0,
              subject: "",
              languages: [],
              previewImageUrl: "",
              versionLetter
            };
          })
          .filter((o) => o.id && o.title && o.urlBase);

        const otherAfterDedupe = otherEnriched.filter(
          (o) => !otherEntryOverlapsMainRecent(overlapMain, o.id, o.urlBase)
        );

        const otherFilteredBySearch = activeSearchQuery
          ? otherAfterDedupe.filter((o) => matchesSearchOtherTitle(o.title, activeSearchQuery))
          : otherAfterDedupe;

        const listOtherForSection = activeLanguageFilter ? [] : otherFilteredBySearch;

        const hasMainRows = displayEntries.length > 0;
        const hasListOtherSection = listOtherForSection.length > 0;
        const hasActiveTabSection = !!activeItem;

        let openCampaigns = [];
        let pinnedCampaigns = [];
        let recentlyEditedCampaigns = [];

        if (hasMainRows) {
          let sortedVisible = displayEntries
            .slice()
            .sort(
              (a, b) => getRecentDisplayEntryLastViewedAt(b) - getRecentDisplayEntryLastViewedAt(a)
            );
          if (recentPanel && recentPanel.classList.contains("gem-recent-campaigns-panel--open")) {
            if (!stableOrderIds) {
              stableOrderIds = sortedVisible.map((entry) => getRecentDisplayEntryKey(entry));
            } else {
              const indexMap = new Map(stableOrderIds.map((id, idx) => [id, idx]));
              sortedVisible = sortedVisible.sort((a, b) => {
                const aKey = getRecentDisplayEntryKey(a);
                const bKey = getRecentDisplayEntryKey(b);
                const ai = indexMap.has(aKey) ? indexMap.get(aKey) : Number.MAX_SAFE_INTEGER;
                const bi = indexMap.has(bKey) ? indexMap.get(bKey) : Number.MAX_SAFE_INTEGER;
                if (ai !== bi) return ai - bi;
                return getRecentDisplayEntryLastViewedAt(b) - getRecentDisplayEntryLastViewedAt(a);
              });
            }
          }

          const inFlow = sortedVisible.filter((entry) => isRecentDisplayEntryOpen(entry));
          openCampaigns = [
            ...inFlow.filter((entry) => isRecentDisplayEntryPinned(entry)),
            ...inFlow.filter((entry) => !isRecentDisplayEntryPinned(entry))
          ];
          pinnedCampaigns = sortedVisible.filter((entry) => isRecentDisplayEntryPinned(entry));
          recentlyEditedCampaigns = sortedVisible.filter((entry) => {
            return !isRecentDisplayEntryOpen(entry) && !isRecentDisplayEntryPinned(entry);
          });
        }

        if (!hasMainRows && !hasListOtherSection && !hasActiveTabSection) {
          lastAlreadyOpenFingerprint = null;
          container.innerHTML = "";
          if (activeTabSlot) activeTabSlot.innerHTML = "";
          filtersContainer.innerHTML = "";
          mountLanguageFilterChips();
          const empty = document.createElement("div");
          empty.className = "gem-recent-campaigns-empty";
          if (!items.length && !otherEnriched.length) {
            empty.textContent = "No recent campaigns yet";
          } else if (activeLanguageFilter && activeSearchQuery) {
            empty.textContent = "No campaigns match the selected language and search";
          } else if (activeLanguageFilter) {
            empty.textContent = "No campaigns match this language filter";
          } else {
            empty.textContent = "No campaigns match your search";
          }
          container.appendChild(empty);
          syncPreviewAfterRender(activeItem, [], [], [], []);
          return;
        }

        const filtersNarrowing = !!(activeLanguageFilter || String(activeSearchQuery || "").trim());
        const alreadyOpenFingerprint = buildAlreadyOpenSectionFingerprint(
          openCampaigns,
          baseGroupTotals,
          filtersNarrowing
        );
        let preservedOpenListEl = null;
        if (openCampaigns.length && alreadyOpenFingerprint === lastAlreadyOpenFingerprint) {
          const existing = container.querySelector(`#${OPEN_GROUP_LIST_ID}`);
          if (existing) {
            preservedOpenListEl = existing;
            existing.remove();
          }
        }

        container.innerHTML = "";
        if (activeTabSlot) activeTabSlot.innerHTML = "";
        filtersContainer.innerHTML = "";
        mountLanguageFilterChips();

        if (activeItem && activeTabSlot) {
          appendActiveTabSection(activeTabSlot, activeItem, rowOpts(activeItem));
        }

        function groupCountLabel(visible, total) {
          if (!filtersNarrowing || visible === total) return String(visible);
          return `${visible} of ${total}`;
        }

        if (!openCampaigns.length) {
          lastAlreadyOpenFingerprint = null;
        }

        if (openCampaigns.length) {
          const openGroup = document.createElement("div");
          openGroup.className = "gem-recent-campaign-group gem-recent-campaign-group--open";

          const openGroupHeader = document.createElement("div");
          openGroupHeader.className = "gem-recent-campaign-group-header";

          const openChip = document.createElement("span");
          openChip.className = "gem-recent-campaign-open-chip";
          openChip.textContent = `Already open (${groupCountLabel(openCampaigns.length, baseGroupTotals.open)})`;
          openChip.title = "This campaign is already open in another browser tab.";
          openGroupHeader.appendChild(openChip);
          openGroup.appendChild(openGroupHeader);

          if (preservedOpenListEl) {
            openGroup.appendChild(preservedOpenListEl);
          } else {
            const openGroupList = document.createElement("div");
            openGroupList.id = OPEN_GROUP_LIST_ID;
            openGroupList.className = "gem-recent-campaign-group-list";
            openCampaigns.forEach((entry) =>
              openGroupList.appendChild(
                buildRecentDisplayRow(entry, {
                  ...buildRecentDisplayRowOpts(entry, rowOpts),
                  showSwitchToTab: true
                })
              )
            );
            openGroup.appendChild(openGroupList);
            lastAlreadyOpenFingerprint = alreadyOpenFingerprint;
          }
          container.appendChild(openGroup);
        }

        if (pinnedCampaigns.length) {
          const pinnedGroup = document.createElement("div");
          pinnedGroup.className = "gem-recent-campaign-group gem-recent-campaign-group--pinned";
          const pinnedHeader = document.createElement("div");
          pinnedHeader.className = "gem-recent-campaign-group-header";
          pinnedHeader.textContent = `Pinned favorites (${groupCountLabel(pinnedCampaigns.length, baseGroupTotals.pinned)})`;
          pinnedGroup.appendChild(pinnedHeader);
          pinnedCampaigns.forEach((entry) =>
            pinnedGroup.appendChild(
              buildRecentDisplayRow(entry, buildRecentDisplayRowOpts(entry, rowOpts))
            )
          );
          container.appendChild(pinnedGroup);
        }

        if (recentlyEditedCampaigns.length) {
          const editedGroup = document.createElement("div");
          editedGroup.className = "gem-recent-campaign-group gem-recent-campaign-group--other";
          const editedHeader = document.createElement("div");
          editedHeader.className = "gem-recent-campaign-group-header";
          editedHeader.textContent = `Recently edited (${groupCountLabel(
            recentlyEditedCampaigns.length,
            baseGroupTotals.recentlyEdited
          )})`;
          editedGroup.appendChild(editedHeader);
          recentlyEditedCampaigns.forEach((entry) =>
            editedGroup.appendChild(
              buildRecentDisplayRow(entry, buildRecentDisplayRowOpts(entry, rowOpts))
            )
          );
          container.appendChild(editedGroup);
        }

        if (hasListOtherSection) {
          const listOtherGroup = document.createElement("div");
          listOtherGroup.className = "gem-recent-campaign-group gem-recent-campaign-group--list-other";
          const listOtherHeader = document.createElement("div");
          listOtherHeader.className = "gem-recent-campaign-group-header";
          const otherSearchNarrowing = !!String(activeSearchQuery || "").trim();
          const otherTotal = otherAfterDedupe.length;
          const otherVisible = listOtherForSection.length;
          const otherLabel =
            otherSearchNarrowing && otherVisible !== otherTotal
              ? `${otherVisible} of ${otherTotal}`
              : String(otherVisible);
          listOtherHeader.textContent = `Other campaigns (${otherLabel})`;
          listOtherGroup.appendChild(listOtherHeader);
          const listOtherRowsWrap = document.createElement("div");
          listOtherRowsWrap.className =
            "gem-recent-campaign-group-list gem-recent-campaign-group-list--list-source";
          listOtherForSection.forEach((item) => listOtherRowsWrap.appendChild(buildListSourceCampaignRow(item, rowOpts(item))));
          listOtherGroup.appendChild(listOtherRowsWrap);
          container.appendChild(listOtherGroup);
        }

        syncPreviewAfterRender(
          activeItem,
          openCampaigns,
          pinnedCampaigns,
          recentlyEditedCampaigns,
          listOtherForSection
        );
        restoreRecentCampaignRowMenuIfNeeded();
        });
      });
    });
  }

  function restoreRecentCampaignRowMenuIfNeeded() {
    const campaignId = String(reopenRecentCampaignRowMenuForId || "").trim();
    reopenRecentCampaignRowMenuForId = null;
    if (!campaignId) return;

    requestAnimationFrame(() => {
      const row = findDrawerCampaignRowByCampaignId(campaignId);
      const wrap = row && row.querySelector(".gem-overflow-menu-wrap");
      if (wrap) openRecentCampaignRowMenuAt(wrap);
    });
  }

  function renderRecentList() {
    if (renderRecentListTimer) clearTimeout(renderRecentListTimer);
    renderRecentListTimer = setTimeout(() => {
      renderRecentListTimer = null;
      renderRecentListNow();
    }, 32);
  }

  function scanForNav(root = document) {
    root.querySelectorAll("nav .e-navigation__menu_list").forEach((nav) => {
      insertRecentNavItem(nav);
      renderRecentList();
    });
  }

  function observeNav() {
    window.gemDomWatchSubscribe(function (mutations) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches("nav .e-navigation__menu_list")) {
            insertRecentNavItem(node);
            renderRecentList();
            continue;
          }
          if (node.querySelectorAll) {
            scanForNav(node);
          }
        }
      }
    });
  }

  function observeRecentStorage() {
    if (!(chrome && chrome.storage && chrome.storage.onChanged)) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[RECENT_STORAGE_KEY]) {
        stableOrderIds = null;
        renderRecentList();
      } else if (area === "local" && changes[OTHER_RECENT_STORAGE_KEY]) {
        stableOrderIds = null;
        renderRecentList();
      } else if (area === "local" && changes[RECENT_UI_STATE_KEY]) {
        loadUiState(() => renderRecentList());
      } else if (area === "local" && changes[PREFLIGHT_LANGUAGE_ALERTS_KEY]) {
        renderRecentList();
      }
    });
  }

  function refreshOpenCampaignTabs() {
    chrome.runtime.sendMessage({ action: "getOpenCampaignTabs" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (!res || !res.ok || !res.byCampaignId || typeof res.byCampaignId !== "object") return;
      const nextById = res.byCampaignId;
      const nextUrls = res.openCampaignUrls && typeof res.openCampaignUrls === "object" ? res.openCampaignUrls : {};
      const nextKeys = res.openCampaignKeys && typeof res.openCampaignKeys === "object" ? res.openCampaignKeys : {};
      const nextUnsaved = res.tabUnsaved && typeof res.tabUnsaved === "object" ? res.tabUnsaved : {};
      const unchanged =
        jsonStableStringKeyMap(openCampaignTabIds) === jsonStableStringKeyMap(nextById) &&
        jsonStableStringKeyMap(openCampaignUrlTabs) === jsonStableStringKeyMap(nextUrls) &&
        jsonStableStringKeyMap(openCampaignKeys) === jsonStableStringKeyMap(nextKeys) &&
        jsonStableStringKeyMap(openCampaignTabUnsaved) === jsonStableStringKeyMap(nextUnsaved);
      if (unchanged) return;
      openCampaignTabIds = nextById;
      openCampaignUrlTabs = nextUrls;
      openCampaignKeys = nextKeys;
      openCampaignTabUnsaved = nextUnsaved;
      renderRecentList();
    });
  }

  function startOpenTabsTracking() {
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === "recentCampaignOpenTabsUpdated") {
          if (recentPanel && recentPanel.classList.contains("gem-recent-campaigns-panel--open")) {
            refreshOpenCampaignTabs();
          }
        }
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      // Background tabs pause rAF-based DOM watch flushes; rescan when focused.
      scanForNav();
      if (isCampaignPage() || isCampIdCampaignPage()) {
        const payload = extractActiveCampaignPayload();
        if (payload) upsertRecent(payload);
      }
      if (!recentPanel || !recentPanel.classList.contains("gem-recent-campaigns-panel--open")) return;
      refreshOpenCampaignTabs();
      loadUiState(() => {
        renderRecentList();
      });
    });
  }

  function initCampaignTracking() {
    if (!isCampaignPage() && !isCampIdCampaignPage()) return;
    let timer = null;
    const scheduleCapture = () => {
      if (typeof window.gemIsCommandPaletteOpen === "function" && window.gemIsCommandPaletteOpen()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (typeof window.gemIsCommandPaletteOpen === "function" && window.gemIsCommandPaletteOpen()) return;
        const payload = extractActiveCampaignPayload();
        if (payload) upsertRecent(payload);
      }, 250);
    };
    const mutationTouchesCommandPalette = (mutation) => {
      const check = (node) => {
        if (!(node instanceof Element)) return false;
        return node.id === "gem-command-palette" || !!node.closest("#gem-command-palette");
      };
      if (check(mutation.target)) return true;
      for (const node of mutation.addedNodes) {
        if (check(node)) return true;
      }
      for (const node of mutation.removedNodes) {
        if (check(node)) return true;
      }
      return false;
    };
    const bindVersionSelector = (el) => {
      const select = el && el.querySelector ? el.querySelector("select") : null;
      if (!select || select._gemVersionWatchBound) return;
      select._gemVersionWatchBound = true;
      select.addEventListener("change", scheduleCapture);
    };
    scheduleCapture();
    window.gemDomWatchSubscribe((mutations) => {
      if (typeof window.gemIsCommandPaletteOpen === "function" && window.gemIsCommandPaletteOpen()) return;
      if (mutations.every(mutationTouchesCommandPalette)) return;
      scheduleCapture();
    });
    if (isCampaignPage() && typeof window.gemDomWatchWaitFor === "function") {
      window.gemDomWatchWaitFor("cb-version-selector", bindVersionSelector);
    }
  }

  function handleDrawerPreviewFsIframeMessage(ev) {
    if (!ev || ev.origin !== window.location.origin) return;
    const data = ev.data;
    if (!data || data.source !== PREVIEW_FS_IFRAME_MESSAGE_SOURCE) return;
    const campId = String(data.campId || "").trim();
    if (!campId) return;
    markDrawerPreviewLoadError(campId, data.reason || "templating");
  }

  function initDrawerPreviewFsIframeMessageListener() {
    if (drawerPreviewFsMessageInstalled) return;
    drawerPreviewFsMessageInstalled = true;
    window.addEventListener("message", handleDrawerPreviewFsIframeMessage);
  }

  function initRecentCampaignsFeature() {
    loadUiState();
    initDrawerPreviewFsIframeMessageListener();
    ensureRecentCampaignRowMenuListeners();
    scanForNav();
    observeNav();
    createRecentPanel();
    observeRecentStorage();
    startOpenTabsTracking();
    initCampaignTracking();
    setupRecentCampaignsPanelShortcuts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRecentCampaignsFeature, { once: true });
  } else {
    initRecentCampaignsFeature();
  }
})();
