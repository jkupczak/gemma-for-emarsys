console.log("[gem] recent-campaigns.js loaded");

(function () {
  const RECENT_STORAGE_KEY = "gemRecentCampaigns";
  const RECENT_UI_STATE_KEY = "gemRecentCampaignsUiState";
  const RECENT_SCHEMA_VERSION = 1;
  const RECENT_NAV_ID = "gem-nav-recent-campaigns-item";
  const NOTES_NAV_ID = "gem-nav-notes-item";
  const SETTINGS_NAV_ID = "gem-nav-settings-item";
  const RECENT_PANEL_ID = "gem-recent-campaigns-panel";
  const RECENT_BACKDROP_ID = "gem-recent-campaigns-backdrop";
  const MAX_RECENT = 200;
  const CAMPAIGN_ROUTE = "contentBlocks/campaign";
  const MIN_LAST_VIEWED_UPDATE_MS = 60 * 1000;
  const PREVIEW_IFRAME_SELECTOR = "iframe.e-contentblocks-preview__iframe-desktop";
  const PREVIEW_IMAGE_MIN_CLIENT_WIDTH = 300;

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
  let activeLanguageFilter = "";
  let activeSearchQuery = "";
  let pinnedCampaignKeys = new Set();
  let recentPanel = null;
  let recentBackdrop = null;
  let stableOrderIds = null;

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

  function getLanguages() {
    const selector = document.querySelector("vce-languages-selector");
    if (!selector) return [];
    const options = Array.from(selector.querySelectorAll("e-select-option"));
    return options
      .map((opt) => {
        const nameEl = opt.querySelector("vce-language-name");
        return (nameEl && nameEl.textContent ? nameEl.textContent : "").trim();
      })
      .filter(Boolean);
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
    if (!isCampaignPage()) return null;
    const id = getCampaignIdFromUrl();
    if (!id) return null;
    const urlBase = canonicalCampaignUrlFromHref(window.location.href);
    return { id: String(id).trim(), urlBase: String(urlBase || "").trim() };
  }

  function normalizeEntry(entry) {
    const e = entry && typeof entry === "object" ? entry : {};
    const mergedHref = String(e.urlBase || e.campaignKey || "").trim();
    const urlBase = canonicalCampaignUrlFromHref(mergedHref);
    const normalized = {
      id: String(e.id || "").trim(),
      title: String(e.title || "").trim(),
      subject: String(e.subject || "").trim(),
      languages: Array.isArray(e.languages) ? e.languages.filter(Boolean).map((v) => String(v).trim()).filter(Boolean) : [],
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

  function loadUiState(callback) {
    chrome.storage.local.get({ [RECENT_UI_STATE_KEY]: { language: "", search: "" } }, (res) => {
      const raw = res[RECENT_UI_STATE_KEY] || {};
      const language = String(raw.language || "").trim();
      const search = String(raw.search || "").trim().toLowerCase();
      callback({ language, search });
    });
  }

  function saveUiState() {
    chrome.storage.local.set({
      [RECENT_UI_STATE_KEY]: {
        language: activeLanguageFilter,
        search: activeSearchQuery
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
          JSON.stringify(existing.languages || []) !== JSON.stringify(normalized.languages || []) ||
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

  function buildRecentNavItem() {
    const li = document.createElement("li");
    li.className = "e-navigation__menu_list_item";
    li.id = RECENT_NAV_ID;
    const mod = typeof window.GEM_MOD_KEY === "string" ? window.GEM_MOD_KEY : "CTRL";
    li.innerHTML = `
      <e-tooltip placement="right" content="${mod}+." role="tooltip" aria-description="Recent Campaigns" style="width: 100%;">
        <button type="button" class="e-navigation__action" aria-haspopup="true" aria-expanded="false" menu-item-id="recent_campaigns_new_main" tracking-id="recent_campaigns_new_main" aria-label="Recent Campaigns">
          <e-icon class="e-navigation__action_icon" color="inherit" icon="ac-action-timer">
            <div aria-hidden="true" class="e-icon-wrapper">
              <div class="e-icon text-color-inherit">&#xF021;</div>
            </div>
          </e-icon>
          <span class="e-navigation__action_text">Recent Campaigns</span>
        </button>
      </e-tooltip>
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
      <div class="gem-recent-campaigns-panel-header">
        <span class="gem-recent-campaigns-panel-title">Recent Campaigns</span>
        <button type="button" class="gem-recent-campaigns-panel-close" aria-label="Close Recent Campaigns panel">✕</button>
      </div>
      <div class="gem-recent-campaigns-panel-content gem-scrollable">
        <div class="gem-recent-campaigns-controls">
          <input type="text" class="gem-recent-campaigns-search" placeholder="Search campaigns" aria-label="Search recent campaigns" />
        </div>
        <div class="gem-recent-campaign-language-filters"></div>
        <div class="gem-recent-campaigns-list"></div>
      </div>
    `;

    const closeBtn = panel.querySelector(".gem-recent-campaigns-panel-close");
    if (closeBtn) closeBtn.addEventListener("click", hideRecentPanel);
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
    renderRecentList();
    requestAnimationFrame(() => {
      recentBackdrop.classList.add("gem-recent-campaigns-backdrop--open");
      recentPanel.classList.add("gem-recent-campaigns-panel--open");
      const searchInput = recentPanel.querySelector(".gem-recent-campaigns-search");
      if (searchInput) searchInput.focus();
    });
    stableOrderIds = null;
    document.addEventListener("keydown", onRecentEsc);
  }

  function hideRecentPanel() {
    if (!recentPanel || !recentBackdrop) return;
    recentPanel.classList.remove("gem-recent-campaigns-panel--open");
    recentBackdrop.classList.remove("gem-recent-campaigns-backdrop--open");
    stableOrderIds = null;
    document.removeEventListener("keydown", onRecentEsc);
    try {
      const ae = document.activeElement;
      if (ae && recentPanel.contains(ae) && typeof ae.blur === "function") ae.blur();
    } catch (_) {}
  }

  function toggleRecentPanel() {
    if (!recentPanel || !recentPanel.classList.contains("gem-recent-campaigns-panel--open")) showRecentPanel();
    else hideRecentPanel();
  }

  function onRecentEsc(e) {
    if (e.key === "Escape") hideRecentPanel();
  }

  function recentCampaignsShortcutTypingTarget() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = (ae.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (ae.isContentEditable) return true;
    if (ae.closest && ae.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function setupRecentCampaignsPanelShortcuts() {
    if (!isCampaignPage()) return;

    function handleKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      const k = e.key || "";
      if (k !== ".") return;
      if (recentCampaignsShortcutTypingTarget()) return;

      toggleRecentPanel();
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

    function waitForIframeReady(iframe) {
      try {
        if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
          injectIntoIframe(iframe);
          return;
        }
        iframe.addEventListener("load", () => setTimeout(() => injectIntoIframe(iframe), 50));
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

  function buildCampaignRow(item) {
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
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    const isPinned = pinnedCampaignKeys.has(item.urlBase);
    pinBtn.className = isPinned
      ? "gem-recent-campaign-pin gem-recent-campaign-pin--unpin"
      : "gem-recent-campaign-pin gem-recent-campaign-pin--hover-only";
    pinBtn.textContent = isPinned ? "Unpin" : "Pin";
    pinBtn.setAttribute("aria-label", `${isPinned ? "Unpin" : "Pin"} campaign ${item.title}`);
    pinBtn.addEventListener("click", () => togglePinnedCampaign(item.urlBase));
    titleRow.appendChild(pinBtn);

    const subject = document.createElement("div");
    subject.className = "gem-recent-campaign-subject";
    subject.textContent = item.subject || "No subject";

    const langs = document.createElement("div");
    langs.className = "gem-recent-campaign-languages";
    const langsList = Array.isArray(item.languages) ? item.languages : [];
    if (langsList.length) {
      langsList.forEach((lang) => {
        const chip = document.createElement("span");
        chip.className = "gem-recent-campaign-lang-chip";
        chip.textContent = lang;
        langs.appendChild(chip);
      });
    } else {
      const emptyLang = document.createElement("span");
      emptyLang.className = "gem-recent-campaign-lang-chip gem-recent-campaign-lang-chip--empty";
      emptyLang.textContent = "No languages";
      langs.appendChild(emptyLang);
    }

    main.appendChild(titleRow);
    main.appendChild(subject);
    main.appendChild(langs);
    inner.appendChild(thumb);
    inner.appendChild(main);
    row.appendChild(inner);
    return row;
  }

  function countRecentGroupSizes(list) {
    const open = list.filter((item) => getOpenMatchDetails(item).isOpen).length;
    const pinned = list.filter((item) => pinnedCampaignKeys.has(String(item.urlBase || "").trim())).length;
    const other = list.filter((item) => {
      const openMatch = getOpenMatchDetails(item);
      const isPinned = pinnedCampaignKeys.has(String(item.urlBase || "").trim());
      return !openMatch.isOpen && !isPinned;
    }).length;
    return { open, pinned, other };
  }

  function renderRecentList() {
    const panel = recentPanel || document.getElementById(RECENT_PANEL_ID);
    if (!panel) return;
    const filtersContainer = panel.querySelector(".gem-recent-campaign-language-filters");
    const container = panel.querySelector(".gem-recent-campaigns-list");
    const searchInput = panel.querySelector(".gem-recent-campaigns-search");
    if (!container || !filtersContainer) return;
    if (searchInput && searchInput.value !== activeSearchQuery) {
      searchInput.value = activeSearchQuery;
    }
    const excludeCurrent = getCurrentCampaignExclusion();
    readRecentItems(({ items, pinnedKeys }) => {
      pinnedCampaignKeys = new Set((Array.isArray(pinnedKeys) ? pinnedKeys : []).map((v) => String(v || "").trim()).filter(Boolean));
      container.innerHTML = "";
      filtersContainer.innerHTML = "";
      const filteredPinned = new Set(Array.from(pinnedCampaignKeys).filter(Boolean));
      pinnedCampaignKeys = filteredPinned;
      const baseList = excludeCurrent
        ? items.filter((item) => {
            const iid = String(item.id || "").trim();
            const iurl = String(item.urlBase || "").trim();
            if (excludeCurrent.urlBase && iurl && iurl === excludeCurrent.urlBase) return false;
            if (excludeCurrent.id && iid && iid === excludeCurrent.id) return false;
            return true;
          })
        : items.slice();
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

      if (activeLanguageFilter && !seenLangs.has(activeLanguageFilter)) {
        activeLanguageFilter = "";
      }

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
      const searchFiltered = activeSearchQuery
        ? visibleList.filter((item) => matchesSearch(item, activeSearchQuery))
        : visibleList;

      if (!searchFiltered.length) {
        const empty = document.createElement("div");
        empty.className = "gem-recent-campaigns-empty";
        if (!baseList.length) {
          empty.textContent = "No recent campaigns yet";
        } else if (activeLanguageFilter && activeSearchQuery) {
          empty.textContent = "No campaigns match the selected language and search";
        } else if (activeLanguageFilter) {
          empty.textContent = "No campaigns match this language filter";
        } else {
          empty.textContent = "No campaigns match your search";
        }
        container.appendChild(empty);
        return;
      }
      let sortedVisible = searchFiltered
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

      const openCampaigns = sortedVisible
        .filter((item) => getOpenMatchDetails(item).isOpen)
        .sort((a, b) => {
          const aPin = pinnedCampaignKeys.has(String(a.urlBase || "").trim());
          const bPin = pinnedCampaignKeys.has(String(b.urlBase || "").trim());
          if (aPin !== bPin) return aPin ? -1 : 1;
          return (b.lastViewedAt || 0) - (a.lastViewedAt || 0);
        });
      const pinnedCampaigns = sortedVisible.filter((item) => pinnedCampaignKeys.has(item.urlBase));
      const otherCampaigns = sortedVisible.filter((item) => {
        const openMatch = getOpenMatchDetails(item);
        const isPinned = pinnedCampaignKeys.has(item.urlBase);
        return !openMatch.isOpen && !isPinned;
      });

      const baseGroupTotals = countRecentGroupSizes(baseList);
      const filtersNarrowing = !!(activeLanguageFilter || String(activeSearchQuery || "").trim());
      function groupCountLabel(visible, total) {
        if (!filtersNarrowing || visible === total) return String(visible);
        return `${visible} of ${total}`;
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

        const openGroupList = document.createElement("div");
        openGroupList.className = "gem-recent-campaign-group-list";
        openCampaigns.forEach((item) => openGroupList.appendChild(buildCampaignRow(item)));
        openGroup.appendChild(openGroupList);
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

      if (otherCampaigns.length) {
        const otherGroup = document.createElement("div");
        otherGroup.className = "gem-recent-campaign-group gem-recent-campaign-group--other";
        const otherHeader = document.createElement("div");
        otherHeader.className = "gem-recent-campaign-group-header";
        otherHeader.textContent = `Other campaigns (${groupCountLabel(otherCampaigns.length, baseGroupTotals.other)})`;
        otherGroup.appendChild(otherHeader);
        otherCampaigns.forEach((item) => otherGroup.appendChild(buildCampaignRow(item)));
        container.appendChild(otherGroup);
      }
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
      } else if (area === "local" && changes[RECENT_UI_STATE_KEY]) {
        loadUiState((state) => {
          activeLanguageFilter = state.language;
          activeSearchQuery = state.search;
          renderRecentList();
        });
      }
    });
  }

  function refreshOpenCampaignTabs() {
    chrome.runtime.sendMessage({ action: "getOpenCampaignTabs" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (!res || !res.ok || !res.byCampaignId || typeof res.byCampaignId !== "object") return;
      openCampaignTabIds = res.byCampaignId;
      openCampaignUrlTabs = (res.openCampaignUrls && typeof res.openCampaignUrls === "object")
        ? res.openCampaignUrls
        : {};
      openCampaignKeys = (res.openCampaignKeys && typeof res.openCampaignKeys === "object")
        ? res.openCampaignKeys
        : {};
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
      if (!document.hidden) refreshOpenCampaignTabs();
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
    loadUiState((state) => {
      activeLanguageFilter = state.language;
      activeSearchQuery = state.search;
    });
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
