console.log("[gem] recent-campaigns.js loaded");

(function () {
  const RECENT_STORAGE_KEY = "gemRecentCampaigns";
  const OTHER_RECENT_STORAGE_KEY = "gemOtherRecentCampaigns";
  const RECENT_UI_STATE_KEY = "gemRecentCampaignsUiState";
  /** Search and language filter chips reset after this idle period since last change. */
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
  let previewLoadingHideTimer = null;

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
      .map((item) => {
        const ub = String(item.urlBase || "").trim();
        const tid = getOpenTabIdForItem(item);
        const uns = isOpenTabUnsavedForItem(item) ? "1" : "0";
        const pin = pinnedCampaignKeys.has(String(item.urlBase || "").trim()) ? "1" : "0";
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
    return (url.pathname || "").includes("campaignmanager.php") &&
      url.searchParams.get("action") === "details" &&
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
      return `${u.origin}${u.pathname}?r=contentBlocks/campaign&id=${idForQuery}`;
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
      previewImageUrl: pickDesktopPreviewGraphicUrl(id)
    };
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
      previewImageUrl: String(e.previewImageUrl || "").trim()
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
    chrome.storage.local.get({ [RECENT_UI_STATE_KEY]: { language: "", search: "", savedAt: 0 } }, (res) => {
      const raw = res[RECENT_UI_STATE_KEY] || {};
      const language = String(raw.language || "").trim();
      const search = String(raw.search || "").trim().toLowerCase();
      let savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
      const hadSavedAtKey = raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "savedAt");

      function applyAndCallback() {
        if (savedAt > 0 && Date.now() - savedAt > RECENT_UI_STATE_STALE_MS) {
          activeLanguageFilter = "";
          activeSearchQuery = "";
          chrome.storage.local.set(
            { [RECENT_UI_STATE_KEY]: { language: "", search: "", savedAt: Date.now() } },
            () => {
              if (callback) callback({ language: "", search: "" });
            }
          );
          return;
        }
        activeLanguageFilter = language;
        activeSearchQuery = search;
        if (callback) callback({ language, search });
      }

      if (!hadSavedAtKey) {
        savedAt = Date.now();
        chrome.storage.local.set(
          {
            [RECENT_UI_STATE_KEY]: {
              language,
              search,
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
        search: activeSearchQuery,
        savedAt: Date.now()
      }
    });
  }

  function upsertRecent(payload) {
    const normalized = normalizeEntry(payload);
    if (!normalized.id || !normalized.title || !normalized.urlBase) return;
    readRecentItems(({ items, pinnedKeys }) => {
      const list = items.slice();
      const idx = list.findIndex((e) => e.urlBase === normalized.urlBase || e.id === normalized.id);
      if (idx >= 0) {
        const existing = list[idx];
        const nowTs = Date.now();
        const lastViewedAt = Number.isFinite(existing.lastViewedAt) ? existing.lastViewedAt : 0;
        const fieldsChanged =
          existing.title !== normalized.title ||
          existing.subject !== normalized.subject ||
          existing.urlBase !== normalized.urlBase ||
          JSON.stringify(
            existing.languages === null ? null : Array.isArray(existing.languages) ? existing.languages : []
          ) !==
            JSON.stringify(
              normalized.languages === null ? null : Array.isArray(normalized.languages) ? normalized.languages : []
            ) ||
          String(existing.previewImageUrl || "") !== String(normalized.previewImageUrl || "");
        const shouldRefreshLastViewed = (nowTs - lastViewedAt) >= MIN_LAST_VIEWED_UPDATE_MS;
        // Avoid reordering churn from frequent DOM mutations on the same campaign page.
        if (!fieldsChanged && !shouldRefreshLastViewed) return;
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

  function closeRecentCampaignRowMenu() {
    if (!openRecentCampaignRowMenu) return;
    const { trigger, menu } = openRecentCampaignRowMenu;
    menu.classList.remove("gem-recent-campaign-row-menu--open", "gem-recent-campaign-row-menu--floating");
    menu.style.removeProperty("top");
    menu.style.removeProperty("left");
    menu.style.removeProperty("visibility");
    trigger.setAttribute("aria-expanded", "false");
    openRecentCampaignRowMenu = null;
  }

  function positionRecentCampaignRowMenu(wrap, menu) {
    const trigger = wrap.querySelector(".gem-recent-campaign-row-menu-trigger");
    if (!trigger) return;
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

  function openRecentCampaignRowMenuAt(wrap) {
    closeRecentCampaignRowMenu();
    const trigger = wrap.querySelector(".gem-recent-campaign-row-menu-trigger");
    const menu = wrap.querySelector(".gem-recent-campaign-row-menu");
    if (!trigger || !menu) return;
    menu.classList.add("gem-recent-campaign-row-menu--open");
    trigger.setAttribute("aria-expanded", "true");
    positionRecentCampaignRowMenu(wrap, menu);
    openRecentCampaignRowMenu = { wrap, trigger, menu };
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
    const sessionId = getCurrentSessionId();
    console.log("[Gem] duplicateRecentCampaign: campaignId =", campaignId, "| sessionId =", sessionId, "| pageUrl =", location.href);

    duplicateBtn.disabled = true;
    duplicateBtn.dataset.gemDuplicateState = "busy";
    duplicateBtn.classList.add("gem-recent-campaign-row-menu-item--duplicating");
    duplicateBtn.setAttribute("aria-busy", "true");
    const spinner = duplicateBtn.querySelector(".gem-recent-campaign-duplicate-spinner");
    if (spinner) spinner.hidden = false;

    function resetBtn() {
      duplicateBtn.disabled = false;
      delete duplicateBtn.dataset.gemDuplicateState;
      duplicateBtn.classList.remove("gem-recent-campaign-row-menu-item--duplicating");
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
    wrap.className = "gem-recent-campaign-row-menu-wrap gem-recent-campaign-row-menu-wrap--hover-only";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "gem-recent-campaign-row-menu-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `Options for ${item.title}`);

    const menu = document.createElement("div");
    menu.className = "gem-recent-campaign-row-menu";
    menu.setAttribute("role", "menu");

    function makeNavMenuItem(label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gem-recent-campaign-row-menu-item";
      btn.setAttribute("role", "menuitem");
      btn.textContent = label;
      return btn;
    }

    function openCampaignUrl(targetUrl) {
      if (menuOpts.navigateInCurrentTab) {
        window.location.assign(targetUrl);
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
      divider.className = "gem-recent-campaign-row-menu-divider";
      divider.setAttribute("role", "separator");
      menu.appendChild(divider);
    }

    if (!menuOpts.hidePreview) {
      const previewItem = makeNavMenuItem("Preview");
      previewItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeRecentCampaignRowMenu();
        openCampaignPreview(String(item.id || "").trim(), String(item.title || "").trim());
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
        openCampaignUrl(url.toString());
      });
      menu.appendChild(editSettingsItem);
    }

    if (!menuOpts.hideEditContent) {
      const editContentItem = makeNavMenuItem("Edit Content");
      editContentItem.addEventListener("click", (e) => {
        e.stopPropagation();
        openCampaignUrl(withCurrentSessionId(item.urlBase));
      });
      menu.appendChild(editContentItem);
    }

    appendDivider();

    const pinItem = document.createElement("button");
    pinItem.type = "button";
    pinItem.className = "gem-recent-campaign-row-menu-item";
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
    duplicateItem.className = "gem-recent-campaign-row-menu-item";
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
      if (menu.classList.contains("gem-recent-campaign-row-menu--open")) {
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
        if (openRecentCampaignRowMenu.wrap.contains(e.target)) return;
        closeRecentCampaignRowMenu();
      },
      true
    );
    window.addEventListener("scroll", closeRecentCampaignRowMenu, true);
    window.addEventListener("resize", closeRecentCampaignRowMenu);
  }

  function buildPreviewIframeUrl(campaignId) {
    const id = String(campaignId || "").trim();
    if (!id) return "";
    const url = new URL("/preview_fs.php", window.location.origin);
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
    (Array.isArray(openCampaigns) ? openCampaigns : []).forEach(pushItem);
    (Array.isArray(pinnedCampaigns) ? pinnedCampaigns : []).forEach(pushItem);
    (Array.isArray(recentlyEditedCampaigns) ? recentlyEditedCampaigns : []).forEach(pushItem);
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

  function showPreviewLoadingOverlay() {
    if (!recentPanel) return;
    const overlay = recentPanel.querySelector(".gem-recent-campaigns-preview-loading");
    if (overlay) overlay.hidden = false;
    if (previewLoadingHideTimer) clearTimeout(previewLoadingHideTimer);
    previewLoadingHideTimer = setTimeout(hidePreviewLoadingOverlay, 45000);
  }

  function hidePreviewLoadingOverlay() {
    if (previewLoadingHideTimer) {
      clearTimeout(previewLoadingHideTimer);
      previewLoadingHideTimer = null;
    }
    if (!recentPanel) return;
    const overlay = recentPanel.querySelector(".gem-recent-campaigns-preview-loading");
    if (overlay) overlay.hidden = true;
  }

  function syncPreviewUi() {
    if (!recentPanel) return;
    const iframe = recentPanel.querySelector(".gem-recent-campaigns-preview-iframe");
    const prevBtn = recentPanel.querySelector(".gem-recent-campaigns-preview-prev");
    const nextBtn = recentPanel.querySelector(".gem-recent-campaigns-preview-next");
    const titleEl = recentPanel.querySelector(".gem-recent-campaigns-preview-title");

    recentPanel.classList.toggle("gem-recent-campaigns-panel--preview-open", previewOpen);
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

    if (iframe && previewCampaignId) {
      const nextSrc = buildPreviewIframeUrl(previewCampaignId);
      if (iframe.getAttribute("src") !== nextSrc) {
        showPreviewLoadingOverlay();
        iframe.setAttribute("src", nextSrc);
      }
    }
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
  }

  function closeCampaignPreview() {
    previewOpen = false;
    previewCampaignId = "";
    hidePreviewLoadingOverlay();
    syncPreviewUi();
  }

  function navigatePreview(delta) {
    if (!previewOpen || !previewNavCampaignIds.length) return;
    const idx = previewNavCampaignIds.indexOf(previewCampaignId);
    if (idx < 0) {
      if (Number(delta) > 0) {
        previewCampaignId = previewNavCampaignIds[0];
        syncPreviewUi();
      }
      return;
    }
    const nextIdx = idx + Number(delta);
    if (nextIdx < 0 || nextIdx >= previewNavCampaignIds.length) return;
    previewCampaignId = previewNavCampaignIds[nextIdx];
    syncPreviewUi();
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
  }

  function getRecentCampaignsShortcutLabel() {
    return typeof window.gemPanelShortcutLabel === "function"
      ? window.gemPanelShortcutLabel("/")
      : "[ CTRL + / ]";
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
            <span class="gem-panel-shortcut-hint">${getRecentCampaignsShortcutLabel()}</span>
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
          <iframe class="gem-recent-campaigns-preview-iframe" title="Campaign preview"></iframe>
          <div class="gem-recent-campaigns-preview-loading" hidden aria-hidden="true">
            <div class="gem-recent-campaigns-preview-loading-spinner" aria-hidden="true"></div>
          </div>
        </div>
      </aside>
    `;

    const closeBtn = panel.querySelector(".gem-recent-campaigns-panel-close");
    if (closeBtn) closeBtn.addEventListener("click", hideRecentPanel);
    const previewPrevBtn = panel.querySelector(".gem-recent-campaigns-preview-prev");
    const previewNextBtn = panel.querySelector(".gem-recent-campaigns-preview-next");
    const previewCloseBtn = panel.querySelector(".gem-recent-campaigns-preview-close");
    if (previewPrevBtn) previewPrevBtn.addEventListener("click", () => navigatePreview(-1));
    if (previewNextBtn) previewNextBtn.addEventListener("click", () => navigatePreview(1));
    if (previewCloseBtn) previewCloseBtn.addEventListener("click", closeCampaignPreview);
    const previewIframe = panel.querySelector(".gem-recent-campaigns-preview-iframe");
    if (previewIframe) {
      previewIframe.addEventListener("load", hidePreviewLoadingOverlay);
    }
    const searchInput = panel.querySelector(".gem-recent-campaigns-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        activeSearchQuery = String(searchInput.value || "").trim().toLowerCase();
        saveUiState();
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
        const searchInput = recentPanel.querySelector(".gem-recent-campaigns-search");
        if (searchInput) searchInput.focus();
        startActiveTabUnsavedPoll();
      });
    });
    stableOrderIds = null;
    document.addEventListener("keydown", onRecentPanelKeydown);
    if (recentOpenTabsPollTimer) clearInterval(recentOpenTabsPollTimer);
    recentOpenTabsPollTimer = setInterval(() => refreshOpenCampaignTabs(), 2500);
  }

  function hideRecentPanel() {
    if (!recentPanel || !recentBackdrop) return;
    closeRecentCampaignRowMenu();
    closeCampaignPreview();
    stopActiveTabUnsavedPoll();
    if (recentOpenTabsPollTimer) {
      clearInterval(recentOpenTabsPollTimer);
      recentOpenTabsPollTimer = null;
    }
    lastAlreadyOpenFingerprint = null;
    lastListFilterKey = "";
    recentPanel.classList.remove("gem-recent-campaigns-panel--open");
    recentBackdrop.classList.remove("gem-recent-campaigns-backdrop--open");
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
    const iframeObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === "IFRAME") waitForIframeReady(node);
          else if (node.querySelectorAll) node.querySelectorAll("iframe").forEach(waitForIframeReady);
        });
      });
    });
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });

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

  function buildCampaignRow(item, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const row = document.createElement("div");
    row.className = "gem-recent-campaign-row";
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
    title.setAttribute("aria-label", `Open campaign ${item.title}`);
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

    if (options.activeUnsavedSlot) {
      const notice = document.createElement("div");
      notice.id = "gem-recent-active-unsaved-slot";
      notice.className = "gem-recent-campaign-unsaved-notice";
      if (!options.showUnsavedNotice) notice.classList.add("gem-recent-campaign-unsaved-notice--hidden");
      notice.setAttribute("role", "status");
      notice.textContent = options.showUnsavedNotice ? "Unsaved changes" : "";
      notice.setAttribute("aria-hidden", options.showUnsavedNotice ? "false" : "true");
      main.appendChild(notice);
    } else if (options.showUnsavedNotice) {
      const notice = document.createElement("div");
      notice.className = "gem-recent-campaign-unsaved-notice";
      notice.setAttribute("role", "status");
      notice.textContent = "Unsaved changes";
      notice.setAttribute("aria-hidden", "false");
      main.appendChild(notice);
    }

    main.appendChild(titleRow);
    main.appendChild(subject);
    main.appendChild(langs);
    inner.appendChild(thumb);
    inner.appendChild(main);
    row.appendChild(inner);
    return row;
  }

  function buildListSourceCampaignRow(item) {
    const row = document.createElement("div");
    row.className = "gem-recent-campaign-row gem-recent-campaign-row--list-source";
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
    title.setAttribute("aria-label", `Open campaign ${item.title}`);
    title.textContent = item.title;
    title.addEventListener("click", openCampaign);
    titleRow.appendChild(title);
    titleRow.appendChild(createCampaignRowOverflowMenu(item));

    main.appendChild(titleRow);
    inner.appendChild(main);
    row.appendChild(inner);
    return row;
  }

  function appendActiveTabSection(container, item) {
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
        hidePreview: true,
        hideEditContent: isCampaignPage(),
        hideEditSettings: isCampaignManagerDetailsPage(),
        navigateInCurrentTab: true
      })
    );
    group.appendChild(list);
    container.appendChild(group);
  }

  function countRecentGroupSizes(list) {
    const open = list.filter((item) => getOpenMatchDetails(item).isOpen).length;
    const pinned = list.filter((item) => pinnedCampaignKeys.has(String(item.urlBase || "").trim())).length;
    const recentlyEdited = list.filter((item) => {
      const openMatch = getOpenMatchDetails(item);
      const isPinned = pinnedCampaignKeys.has(String(item.urlBase || "").trim());
      return !openMatch.isOpen && !isPinned;
    }).length;
    return { open, pinned, recentlyEdited };
  }

  function renderRecentList() {
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
    const activePayload = extractCampaignPayload();
    let activeItem =
      activePayload && activePayload.id && activePayload.title && activePayload.urlBase
        ? normalizeEntry(activePayload)
        : null;
    readRecentItems(({ items, pinnedKeys }) => {
      if (!activeItem && (isCampaignManagerDetailsPage() || isBootstrapCampaignSiblingPage())) {
        const campId = getCampIdParam();
        if (campId) {
          const storedMatch = (Array.isArray(items) ? items : []).find(
            (item) => String(item.id || "").trim() === campId
          );
          if (storedMatch) activeItem = storedMatch;
        }
      }
      readOtherRecentItems((otherRaw) => {
        pinnedCampaignKeys = new Set((Array.isArray(pinnedKeys) ? pinnedKeys : []).map((v) => String(v || "").trim()).filter(Boolean));
        const filterKey = `${activeLanguageFilter}\n${activeSearchQuery}`;
        if (filterKey !== lastListFilterKey) {
          lastAlreadyOpenFingerprint = null;
          lastListFilterKey = filterKey;
        }
        const filteredPinned = new Set(Array.from(pinnedCampaignKeys).filter(Boolean));
        pinnedCampaignKeys = filteredPinned;
        const overlapMain = buildMainRecentOverlapSet(items);
        const baseList = excludeCurrent
          ? items.filter((item) => {
              const iid = String(item.id || "").trim();
              const iurl = String(item.urlBase || "").trim();
              if (excludeCurrent.urlBase && iurl && iurl === excludeCurrent.urlBase) return false;
              if (excludeCurrent.id && iid && iid === excludeCurrent.id) return false;
              return true;
            })
          : items.slice();
        const baseGroupTotals = countRecentGroupSizes(baseList);
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

        const otherEnriched = (Array.isArray(otherRaw) ? otherRaw : [])
          .map((e) => {
            const id = String(e && e.id ? e.id : "").trim();
            const title = String(e && e.title ? e.title : "").trim();
            const urlBase = urlBaseFromCampaignId(id);
            return {
              id,
              title,
              urlBase,
              loggedAt: Number.isFinite(e.loggedAt) ? e.loggedAt : 0,
              subject: "",
              languages: [],
              previewImageUrl: ""
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

        const hasMainRows = searchFilteredMain.length > 0;
        const hasListOtherSection = listOtherForSection.length > 0;
        const hasActiveTabSection = !!activeItem;

        let openCampaigns = [];
        let pinnedCampaigns = [];
        let recentlyEditedCampaigns = [];

        if (hasMainRows) {
          let sortedVisible = searchFilteredMain
            .slice()
            .sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0));
          if (recentPanel && recentPanel.classList.contains("gem-recent-campaigns-panel--open")) {
            if (!stableOrderIds) {
              stableOrderIds = sortedVisible.map((item) => item.urlBase);
            } else {
              const indexMap = new Map(stableOrderIds.map((id, idx) => [id, idx]));
              sortedVisible = sortedVisible.sort((a, b) => {
                const ai = indexMap.has(a.urlBase) ? indexMap.get(a.urlBase) : Number.MAX_SAFE_INTEGER;
                const bi = indexMap.has(b.urlBase) ? indexMap.get(b.urlBase) : Number.MAX_SAFE_INTEGER;
                if (ai !== bi) return ai - bi;
                return (b.lastViewedAt || 0) - (a.lastViewedAt || 0);
              });
            }
          }

          const inFlow = sortedVisible.filter((item) => getOpenMatchDetails(item).isOpen);
          openCampaigns = [
            ...inFlow.filter((item) => pinnedCampaignKeys.has(String(item.urlBase || "").trim())),
            ...inFlow.filter((item) => !pinnedCampaignKeys.has(String(item.urlBase || "").trim()))
          ];
          pinnedCampaigns = sortedVisible.filter((item) => pinnedCampaignKeys.has(item.urlBase));
          recentlyEditedCampaigns = sortedVisible.filter((item) => {
            const openMatch = getOpenMatchDetails(item);
            const isPinned = pinnedCampaignKeys.has(item.urlBase);
            return !openMatch.isOpen && !isPinned;
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
          appendActiveTabSection(activeTabSlot, activeItem);
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
            openCampaigns.forEach((item) =>
              openGroupList.appendChild(
                buildCampaignRow(item, { showUnsavedNotice: isOpenTabUnsavedForItem(item), showSwitchToTab: true })
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
          pinnedCampaigns.forEach((item) => pinnedGroup.appendChild(buildCampaignRow(item)));
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
          recentlyEditedCampaigns.forEach((item) => editedGroup.appendChild(buildCampaignRow(item)));
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
          listOtherForSection.forEach((item) => listOtherRowsWrap.appendChild(buildListSourceCampaignRow(item)));
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
      });
    });
  }

  function scanForNav(root = document) {
    root.querySelectorAll("nav .e-navigation__menu_list").forEach((nav) => {
      insertRecentNavItem(nav);
      renderRecentList();
    });
  }

  function observeNav() {
    const observer = new MutationObserver((mutations) => {
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
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
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
    refreshOpenCampaignTabs();
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === "recentCampaignOpenTabsUpdated") {
          refreshOpenCampaignTabs();
        }
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      refreshOpenCampaignTabs();
      loadUiState(() => {
        if (recentPanel && recentPanel.classList.contains("gem-recent-campaigns-panel--open")) {
          renderRecentList();
        }
      });
    });
  }

  function initCampaignTracking() {
    if (!isCampaignPage()) return;
    let timer = null;
    const scheduleCapture = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const payload = extractCampaignPayload();
        if (payload) upsertRecent(payload);
      }, 250);
    };
    scheduleCapture();
    const observer = new MutationObserver(scheduleCapture);
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function initRecentCampaignsFeature() {
    loadUiState();
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
