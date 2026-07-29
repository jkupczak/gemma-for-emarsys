// background.js
// ------------------------------------------------------------
// Simple background service worker for Gemma
// ------------------------------------------------------------

try { importScripts('debug-logging-gate.js'); } catch (_) {}

console.log("[Gem] Background script loading...");
let recentCampaignOpenTabsCache = { byCampaignId: {}, openCampaignUrls: {}, openCampaignKeys: {} };
/** @type {Record<string, boolean>} tab id string -> unsaved draft state */
let recentCampaignUnsavedByTabId = {};
let rcTabsRefreshTimer = null;
const RC_TABS_REFRESH_DEBOUNCE_MS = 300;
const EMARSYS_TAB_URL_PATTERN = 'https://*.emarsys.net/*';

// --- Emarsys duplicate campaign ---

async function duplicateEmarsysCampaign(sourceCampaignId, token) {
  const id = String(sourceCampaignId || '').trim();
  const bareToken = String(token || '').trim().replace(/^Bearer\s+/i, '');
  if (!id || !bareToken) return { ok: false, reason: 'missing_id_or_token' };

  const url = `https://email-campaign-list.gservice.emarsys.net/api/client/campaigns/${encodeURIComponent(id)}/duplicate`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bareToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ campaignId: id }),
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) return { ok: false, reason: 'api_error', status: res.status, data };
    if (!data || !data.success || data.data == null || data.data.campaignId == null) {
      return { ok: false, reason: 'unexpected_response', status: res.status, data };
    }
    return { ok: true, newCampaignId: data.data.campaignId };
  } catch (err) {
    return { ok: false, reason: 'fetch_error', error: err && err.message ? err.message : String(err) };
  }
}
// --- End Emarsys duplicate ---

function rcGetCampaignIdFromTabUrl(url) {
  try {
    const raw = String(url || '');
    if (!raw) return null;
    const parsed = new URL(url);

    // campaignmanager.php?action=details|save&camp_id=... (settings / save workflow)
    if ((parsed.pathname || "").includes("campaignmanager.php")) {
      const action = (parsed.searchParams.get("action") || "").trim();
      if (action === "details" || action === "save") {
        return (parsed.searchParams.get("camp_id") || "").trim() || null;
      }
      return null;
    }

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
      try { return decodeURIComponent(r || ""); } catch (_) { return String(r || ""); }
    });
    const hasCampaignRoute = normalizedRoutes.some((r) => String(r).includes("contentBlocks/campaign")) ||
      raw.includes("contentBlocks/campaign");
    if (!hasCampaignRoute) {
      if ((parsed.pathname || "").includes("bootstrap.php")) {
        const campId = (parsed.searchParams.get("camp_id") || "").trim();
        if (campId) return campId;
      }
      return null;
    }
    const idFromQuery = (parsed.searchParams.get("id") || "").trim();
    if (idFromQuery) return idFromQuery;
    const idMatch = raw.match(/[?&#]id=([^&#]+)/i);
    if (!idMatch || !idMatch[1]) return null;
    return decodeURIComponent(idMatch[1]).trim() || null;
  } catch (_) {
    return null;
  }
}

function rcIdForCanonicalCampaignQuery(id) {
  const s = String(id || "").trim();
  if (!s) return "";
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : encodeURIComponent(s);
}

function rcCollectDecodedRouteCandidates(parsed, rawStr) {
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
  return (
    normalizedRoutes.some((r) => String(r).includes("contentBlocks/campaign")) ||
    String(rawStr || "").includes("contentBlocks/campaign")
  );
}

/** Canonical campaign URL: no hash, no session_id, literal r=contentBlocks/campaign (not %2F). */
function rcCanonicalCampaignTabUrl(tabUrl) {
  try {
    const raw = String(tabUrl || "").trim();
    if (!raw) return null;
    const parsed = new URL(raw);
    if (!(parsed.pathname || "").includes("bootstrap.php")) return null;
    if (!rcCollectDecodedRouteCandidates(parsed, raw)) return null;
    const id = rcGetCampaignIdFromTabUrl(raw);
    if (!id) return null;
    const idForQuery = rcIdForCanonicalCampaignQuery(id);
    if (!idForQuery) return null;
    return `${parsed.origin}${parsed.pathname}?r=contentBlocks/campaign&id=${idForQuery}`;
  } catch (_) {
    return null;
  }
}

function rcGetNormalizedCampaignUrl(url) {
  return rcCanonicalCampaignTabUrl(url);
}

function rcGetCampaignMatchKey(url, knownId) {
  try {
    const raw = String(url || "").trim();
    if (!raw) return null;
    const parsed = new URL(raw);
    if (!(parsed.pathname || "").includes("bootstrap.php")) return null;
    if (!rcCollectDecodedRouteCandidates(parsed, raw)) return null;
    const id = String(knownId || rcGetCampaignIdFromTabUrl(raw) || "").trim();
    if (!id) return null;
    const idForQuery = rcIdForCanonicalCampaignQuery(id);
    if (!idForQuery) return null;
    return `${parsed.origin}${parsed.pathname}?r=contentBlocks/campaign&id=${idForQuery}`;
  } catch (_) {
    return null;
  }
}

function bgLog(...args) {
  try { console.log("[Gem][BG]", ...args); } catch (e) {}
}

/** Ask each campaign editor tab whether the draft save button shows unsaved work (see page-title-updater.js). */
function queryTabsUnsavedDraftState(tabIds, callback) {
  const tabUnsaved = {};
  const unique = Array.from(
    new Set(
      (Array.isArray(tabIds) ? tabIds : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  if (!unique.length) {
    callback({});
    return;
  }
  let pending = unique.length;
  unique.forEach((tabId) => {
    chrome.tabs.sendMessage(tabId, { action: "gemQueryUnsavedDraft" }, (res) => {
      if (chrome.runtime.lastError) {
        tabUnsaved[String(tabId)] = false;
      } else {
        tabUnsaved[String(tabId)] = !!(res && res.ok && res.unsaved);
      }
      pending -= 1;
      if (pending <= 0) callback(tabUnsaved);
    });
  });
}

// Send a message to content scripts in a tab
function sendToTab(tabId, msg) {
  console.log("[Gem][BG] Sending to tab:", tabId, "msg:", msg);
  chrome.tabs.sendMessage(tabId, msg, (response) => {
    console.log("[Gem][BG] tabs.sendMessage response:", response);
    if (chrome.runtime.lastError) {
      console.log("[Gem][BG] tabs.sendMessage error:", chrome.runtime.lastError.message);
    }
  });
}

bgLog("Setting up message listener...");
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  bgLog("MESSAGE RECEIVED:", msg, "from:", sender ? sender.url : 'unknown');

  const { action } = msg;

  function parseContentLengthHeader(headers) {
    const len = headers && headers.get ? headers.get('content-length') : null;
    if (!len) return null;
    const parsed = Number.parseInt(len, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function parseContentRangeTotal(headers) {
    const range = headers && headers.get ? headers.get('content-range') : null;
    if (!range) return null;
    const match = /\/(\d+)\s*$/i.exec(range);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function isDownloadableNetworkUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  async function fetchResourceSizeBytes(url) {
    const requestInitBase = {
      cache: 'no-store',
      credentials: 'include'
    };
    const attempts = [];

    try {
      const headRes = await fetch(url, { ...requestInitBase, method: 'HEAD' });
      if (headRes && headRes.ok) {
        const headLen = parseContentLengthHeader(headRes.headers);
        if (headLen !== null) return { bytes: headLen, attempts };
        attempts.push(`HEAD ok (${headRes.status}) no content-length`);
      } else {
        attempts.push(`HEAD non-ok (${headRes ? headRes.status : 'no-response'})`);
      }
    } catch (err) {
      attempts.push(`HEAD error (${err && err.name ? err.name : 'error'})`);
    }

    try {
      const rangeRes = await fetch(url, {
        ...requestInitBase,
        method: 'GET',
        headers: { Range: 'bytes=0-0' }
      });
      if (rangeRes && rangeRes.ok) {
        const rangeTotal = parseContentRangeTotal(rangeRes.headers);
        if (rangeTotal !== null) return { bytes: rangeTotal, attempts };
        attempts.push(`RANGE ok (${rangeRes.status}) no content-range total`);
      } else {
        attempts.push(`RANGE non-ok (${rangeRes ? rangeRes.status : 'no-response'})`);
      }
    } catch (err) {
      attempts.push(`RANGE error (${err && err.name ? err.name : 'error'})`);
    }

    try {
      const fullRes = await fetch(url, { ...requestInitBase, method: 'GET' });
      if (fullRes && fullRes.ok) {
        const fullLen = parseContentLengthHeader(fullRes.headers);
        if (fullLen !== null) return { bytes: fullLen, attempts };
        const blob = await fullRes.blob();
        if (blob && Number.isFinite(blob.size)) return { bytes: blob.size, attempts };
        attempts.push(`GET_BLOB ok (${fullRes.status}) no measurable blob size`);
      } else {
        attempts.push(`GET_BLOB non-ok (${fullRes ? fullRes.status : 'no-response'})`);
      }
    } catch (err) {
      attempts.push(`GET_BLOB error (${err && err.name ? err.name : 'error'})`);
    }

    return { bytes: null, attempts };
  }

  async function fetchUniqueDownloadSize(urls) {
    const uniqueUrls = Array.from(new Set((Array.isArray(urls) ? urls : []).filter(Boolean)));
    const networkUrls = uniqueUrls.filter(isDownloadableNetworkUrl);
    const concurrency = 6;
    let index = 0;
    let knownBytes = 0;
    let unknownCount = 0;
    const unknownDetails = [];
    const measurements = [];

    async function worker() {
      while (index < networkUrls.length) {
        const url = networkUrls[index];
        index += 1;
        const result = await fetchResourceSizeBytes(url);
        if (!result || result.bytes === null) {
          unknownCount += 1;
          const attempts = result && Array.isArray(result.attempts) ? result.attempts : [];
          unknownDetails.push({ url, attempts });
          measurements.push({ url, bytes: null, attempts });
        } else {
          knownBytes += result.bytes;
          measurements.push({ url, bytes: result.bytes, attempts: result.attempts || [] });
        }
      }
    }

    const workers = [];
    const workerCount = Math.min(concurrency, networkUrls.length);
    for (let i = 0; i < workerCount; i += 1) workers.push(worker());
    await Promise.all(workers);
    return { knownBytes, unknownCount, networkCount: networkUrls.length, unknownDetails, measurements };
  }

  // Handle settings panel requests
  if (action === "openSettings" || action === "openSettingsRequest") {
    if (sender.tab && sender.tab.id != null) {
      sendToTab(sender.tab.id, { action: "openSettings" });
    }
    return;
  }

  function getCampaignIdFromTabUrl(url) {
    try {
      const raw = String(url || '');
      if (!raw) return null;
      const parsed = new URL(url);
      const routeCandidates = [];
      const routeFromQuery = parsed.searchParams.get("r");
      if (routeFromQuery) routeCandidates.push(routeFromQuery);

      // Some variants carry route-like params in hash fragments.
      const hash = parsed.hash || "";
      if (hash.includes("?")) {
        const hashQuery = hash.slice(hash.indexOf("?") + 1);
        const hashParams = new URLSearchParams(hashQuery);
        const hashRoute = hashParams.get("r");
        if (hashRoute) routeCandidates.push(hashRoute);
      }

      const normalizedRoutes = routeCandidates.map((r) => {
        try { return decodeURIComponent(r || ""); } catch (_) { return String(r || ""); }
      });
      const hasCampaignRoute = normalizedRoutes.some((r) => String(r).includes("contentBlocks/campaign")) ||
        raw.includes("contentBlocks/campaign");
      if (!hasCampaignRoute) return null;

      const idFromQuery = (parsed.searchParams.get("id") || "").trim();
      if (idFromQuery) return idFromQuery;

      // Fallback for unusual URL encodings/orderings.
      const idMatch = raw.match(/[?&#]id=([^&#]+)/i);
      if (!idMatch || !idMatch[1]) return null;
      return decodeURIComponent(idMatch[1]).trim() || null;
    } catch (_) {
      const raw = String(url || '');
      if (!raw || !raw.includes("contentBlocks/campaign")) return null;
      const idMatch = raw.match(/[?&#]id=([^&#]+)/i);
      if (!idMatch || !idMatch[1]) return null;
      try { return decodeURIComponent(idMatch[1]).trim() || null; } catch (_) { return idMatch[1].trim() || null; }
    }
  }

  function getNormalizedCampaignUrl(url) {
    return rcGetNormalizedCampaignUrl(url);
  }

  function getCampaignMatchKey(url, knownId) {
    return rcGetCampaignMatchKey(url, knownId);
  }

  if (action === "getOpenCampaignTabs") {
    const byCampaignId = { ...(recentCampaignOpenTabsCache.byCampaignId || {}) };
    const openCampaignUrls = { ...(recentCampaignOpenTabsCache.openCampaignUrls || {}) };
    const openCampaignKeys = { ...(recentCampaignOpenTabsCache.openCampaignKeys || {}) };
    const tabIdSet = new Set();
    Object.values(byCampaignId).forEach((tid) => {
      if (tid != null) tabIdSet.add(tid);
    });
    Object.values(openCampaignUrls).forEach((tid) => {
      if (tid != null) tabIdSet.add(tid);
    });
    Object.values(openCampaignKeys).forEach((tid) => {
      if (tid != null) tabIdSet.add(tid);
    });
    const tabIds = Array.from(tabIdSet);
    const tabUnsaved = {};
    const missingTabIds = [];
    tabIds.forEach((tid) => {
      const key = String(tid);
      if (Object.prototype.hasOwnProperty.call(recentCampaignUnsavedByTabId, key)) {
        tabUnsaved[key] = !!recentCampaignUnsavedByTabId[key];
      } else {
        missingTabIds.push(tid);
      }
    });
    if (!missingTabIds.length) {
      sendResponse({
        ok: true,
        byCampaignId,
        openCampaignUrls,
        openCampaignKeys,
        tabUnsaved
      });
      return;
    }
    queryTabsUnsavedDraftState(missingTabIds, (queried) => {
      Object.assign(tabUnsaved, queried);
      Object.keys(queried).forEach((key) => {
        recentCampaignUnsavedByTabId[key] = !!queried[key];
      });
      sendResponse({
        ok: true,
        byCampaignId,
        openCampaignUrls,
        openCampaignKeys,
        tabUnsaved
      });
    });
    return true;
  }

  if (action === "gemReportUnsavedDraft") {
    const tabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
    if (tabId != null) {
      recentCampaignUnsavedByTabId[String(tabId)] = !!msg.unsaved;
    }
    return;
  }

  if (action === "focusOrOpenCampaignTab") {
    const campaignId = String(msg.campaignId || "").trim();
    const targetUrl = String(msg.targetUrl || "").trim();
    if (!campaignId || !targetUrl) {
      sendResponse({ ok: false, reason: "missing_campaign_id_or_url" });
      return;
    }
    chrome.tabs.query({}, (tabs) => {
      const emarsysTabs = (Array.isArray(tabs) ? tabs : []).filter((tab) => {
        const tabUrl = String(tab && tab.url ? tab.url : '');
        return !!tabUrl && /https?:\/\/([^/]+\.)?emarsys\.net\//i.test(tabUrl);
      });
      const existing = emarsysTabs.find((tab) => {
        const id = String(rcGetCampaignIdFromTabUrl(tab && tab.url) || "").trim();
        return id === campaignId && tab.id != null;
      });
      if (existing && existing.id != null) {
        chrome.tabs.update(existing.id, { active: true }, () => {
          const windowId = existing.windowId;
          if (windowId != null) chrome.windows.update(windowId, { focused: true }, () => {});
          sendResponse({ ok: true, mode: "focused", tabId: existing.id });
        });
        return;
      }
      const targetKey = getCampaignMatchKey(targetUrl, campaignId);
      if (targetKey) {
        const byUrl = emarsysTabs.find((tab) => {
          const key = getCampaignMatchKey(tab && tab.url);
          return key && key === targetKey && tab.id != null;
        });
        if (byUrl && byUrl.id != null) {
          chrome.tabs.update(byUrl.id, { active: true }, () => {
            const windowId = byUrl.windowId;
            if (windowId != null) chrome.windows.update(windowId, { focused: true }, () => {});
            sendResponse({ ok: true, mode: "focused", tabId: byUrl.id });
          });
          return;
        }
      }
      chrome.tabs.create({ url: targetUrl, active: true }, (tab) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, reason: chrome.runtime.lastError.message || "create_failed" });
          return;
        }
        sendResponse({ ok: true, mode: "opened", tabId: tab && tab.id != null ? tab.id : null });
      });
    });
    return true;
  }

  if (action === "focusCampaignTab") {
    const campaignId = String(msg.campaignId || "").trim();
    if (!campaignId) {
      sendResponse({ ok: false, reason: "missing_campaign_id" });
      return;
    }
    const currentTabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;

    function focusTabById(tabId, callback) {
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          callback({ ok: false, reason: chrome.runtime.lastError.message || "focus_failed" });
          return;
        }
        chrome.tabs.get(tabId, (tab) => {
          if (tab && tab.windowId != null) {
            chrome.windows.update(tab.windowId, { focused: true }, () => {});
          }
          callback({ ok: true, mode: "focused", tabId });
        });
      });
    }

    const cachedTabId = recentCampaignOpenTabsCache.byCampaignId[campaignId];
    if (cachedTabId != null && cachedTabId !== currentTabId) {
      focusTabById(cachedTabId, sendResponse);
      return true;
    }

    chrome.tabs.query({}, (tabs) => {
      const match = (Array.isArray(tabs) ? tabs : []).find((tab) => {
        if (currentTabId != null && tab.id === currentTabId) return false;
        const id = String(rcGetCampaignIdFromTabUrl(tab && tab.url) || "").trim();
        return id === campaignId && tab.id != null;
      });
      if (!match || match.id == null) {
        sendResponse({ ok: false, reason: "no_matching_tab" });
        return;
      }
      focusTabById(match.id, sendResponse);
    });
    return true;
  }

  if (action === 'isCampaignTabOpen') {
    const campaignId = String(msg.campaignId || '').trim();
    if (!campaignId) { sendResponse({ ok: true, open: false }); return; }
    const currentTabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
    const cachedTabId = recentCampaignOpenTabsCache.byCampaignId[campaignId];
    if (cachedTabId != null && cachedTabId !== currentTabId) {
      sendResponse({ ok: true, open: true });
      return;
    }
    chrome.tabs.query({}, (tabs) => {
      const open = (Array.isArray(tabs) ? tabs : []).some((tab) => {
        if (currentTabId != null && tab.id === currentTabId) return false;
        const id = String(rcGetCampaignIdFromTabUrl(tab && tab.url) || '').trim();
        return id === campaignId;
      });
      sendResponse({ ok: true, open });
    });
    return true;
  }

  const PREFLIGHT_NETWORK_ORIGINS = ['https://*/*', 'http://*/*'];

  function hasAllPreflightNetworkOrigins(callback) {
    let pending = PREFLIGHT_NETWORK_ORIGINS.length;
    let allGranted = true;
    let settled = false;
    const finish = (granted) => {
      if (settled) return;
      settled = true;
      callback(!!granted);
    };
    const timer = setTimeout(() => finish(false), 4000);
    if (!pending) {
      clearTimeout(timer);
      finish(true);
      return;
    }
    PREFLIGHT_NETWORK_ORIGINS.forEach((origin) => {
      try {
        chrome.permissions.contains({ origins: [origin] }, (ok) => {
          if (!ok) allGranted = false;
          pending -= 1;
          if (pending === 0) {
            clearTimeout(timer);
            finish(allGranted);
          }
        });
      } catch (_) {
        pending -= 1;
        allGranted = false;
        if (pending === 0) {
          clearTimeout(timer);
          finish(false);
        }
      }
    });
  }

  function requestAllPreflightNetworkOrigins(callback) {
    let settled = false;
    const finish = (granted) => {
      if (settled) return;
      settled = true;
      callback(!!granted);
    };
    const timer = setTimeout(() => finish(false), 5000);
    try {
      chrome.permissions.request({ origins: PREFLIGHT_NETWORK_ORIGINS.slice() }, (granted) => {
        clearTimeout(timer);
        finish(granted);
      });
    } catch (_) {
      clearTimeout(timer);
      finish(false);
    }
  }

  if (action === 'preflightEnsureImageHostAccess') {
    hasAllPreflightNetworkOrigins((alreadyGranted) => {
      if (alreadyGranted) {
        sendResponse({ ok: true, granted: true, alreadyGranted: true });
        return;
      }
      requestAllPreflightNetworkOrigins((granted) => {
        sendResponse({ ok: true, granted: !!granted, alreadyGranted: false });
      });
    });
    return true;
  }

  if (action === 'preflightCheckImageHostAccess') {
    hasAllPreflightNetworkOrigins((granted) => {
      sendResponse({ ok: true, granted: !!granted });
    });
    return true;
  }

  if (action === 'preflightEnsureLinkHostAccess') {
    hasAllPreflightNetworkOrigins((alreadyGranted) => {
      if (alreadyGranted) {
        sendResponse({ ok: true, granted: true, alreadyGranted: true });
        return;
      }
      requestAllPreflightNetworkOrigins((granted) => {
        sendResponse({ ok: true, granted: !!granted, alreadyGranted: false });
      });
    });
    return true;
  }

  if (action === 'preflightCheckLinkHostAccess') {
    hasAllPreflightNetworkOrigins((granted) => {
      sendResponse({ ok: true, granted: !!granted });
    });
    return true;
  }

  if (action === 'gemFetchScreenshotAsset') {
    const url = String(msg.url || '').trim();
    if (!url) {
      sendResponse({ ok: false, reason: 'missing_url' });
      return true;
    }

    function inferScreenshotAssetMime(assetUrl, blobType) {
      if (blobType && blobType !== 'application/octet-stream') return blobType;
      try {
        const path = new URL(assetUrl).pathname.toLowerCase();
        if (path.endsWith('.svg')) return 'image/svg+xml';
        if (path.endsWith('.png')) return 'image/png';
        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
        if (path.endsWith('.gif')) return 'image/gif';
        if (path.endsWith('.webp')) return 'image/webp';
      } catch (_) {}
      return blobType || 'application/octet-stream';
    }

    fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
        return res.blob();
      })
      .then(async (blob) => {
        const mime = inferScreenshotAssetMime(url, blob.type);
        if (mime === 'image/svg+xml') {
          const text = await blob.text();
          sendResponse({ ok: true, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` });
          return;
        }
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        sendResponse({ ok: true, dataUrl: `data:${mime};base64,${btoa(binary)}` });
      })
      .catch((err) => {
        bgLog('gemFetchScreenshotAsset failed', err?.message || err, { url });
        sendResponse({ ok: false, reason: err?.message || 'fetch_error' });
      });
    return true;
  }

  async function verifyHttpLinkUrl(url) {
    const attempts = [];
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const baseInit = {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow'
    };
    let lastStage = 'HEAD';

    const finish = (out) => {
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      return { ...out, durationMs: Math.round(t1 - t0), attempts };
    };

    async function tryHead() {
      const res = await fetch(url, { ...baseInit, method: 'HEAD' });
      attempts.push(`HEAD ${res.status}${res.type ? ` (${res.type})` : ''}`);
      return res;
    }

    async function tryGetRange() {
      const res = await fetch(url, {
        ...baseInit,
        method: 'GET',
        headers: { Range: 'bytes=0-0' }
      });
      attempts.push(`GET_RANGE ${res.status}${res.type ? ` (${res.type})` : ''}`);
      return res;
    }

    async function tryGetSmall() {
      const res = await fetch(url, { ...baseInit, method: 'GET' });
      attempts.push(`GET ${res.status}${res.type ? ` (${res.type})` : ''}`);
      return res;
    }

    try {
      lastStage = 'HEAD';
      let res = await tryHead();
      if (res.type === 'opaque') {
        return finish({
          ok: false,
          category: 'blocked',
          status: 0,
          finalUrl: url,
          errorName: 'OpaqueResponse'
        });
      }
      if (res.ok) {
        return finish({
          ok: true,
          category: 'ok',
          status: res.status,
          finalUrl: res.url || url,
          errorName: null
        });
      }
      if (res.status === 405 || res.status === 501 || res.status === 403) {
        lastStage = 'GET_RANGE_AFTER_HEAD_FALLBACK';
        res = await tryGetRange();
        if (res.type === 'opaque') {
          return finish({
            ok: false,
            category: 'blocked',
            status: 0,
            finalUrl: url,
            errorName: 'OpaqueResponse'
          });
        }
        if (res.ok || (res.status >= 200 && res.status < 400)) {
          return finish({
            ok: res.ok,
            category: res.ok ? 'ok' : 'clientError',
            status: res.status,
            finalUrl: res.url || url,
            errorName: res.ok ? null : `HTTP ${res.status}`
          });
        }
      }
      if (!res.ok && res.status >= 400) {
        return finish({
          ok: false,
          category: res.status >= 500 ? 'serverError' : 'clientError',
          status: res.status,
          finalUrl: res.url || url,
          errorName: `HTTP ${res.status}`
        });
      }
      lastStage = 'GET_RANGE';
      res = await tryGetRange();
      if (res.type === 'opaque') {
        return finish({
          ok: false,
          category: 'blocked',
          status: 0,
          finalUrl: url,
          errorName: 'OpaqueResponse'
        });
      }
      if (res.ok || (res.status >= 200 && res.status < 400)) {
        return finish({
          ok: res.ok,
          category: res.ok ? 'ok' : 'redirect',
          status: res.status,
          finalUrl: res.url || url,
          errorName: res.ok ? null : `HTTP ${res.status}`
        });
      }
      lastStage = 'GET';
      res = await tryGetSmall();
      if (res.type === 'opaque') {
        return finish({
          ok: false,
          category: 'blocked',
          status: 0,
          finalUrl: url,
          errorName: 'OpaqueResponse'
        });
      }
      return finish({
        ok: res.ok,
        category: res.ok ? 'ok' : (res.status >= 500 ? 'serverError' : 'clientError'),
        status: res.status,
        finalUrl: res.url || url,
        errorName: res.ok ? null : `HTTP ${res.status}`
      });
    } catch (err) {
      return finish({
        ok: false,
        category: 'networkError',
        status: 0,
        finalUrl: url,
        errorName: err && err.name ? err.name : 'FetchError',
        failStage: lastStage
      });
    }
  }

  async function verifyTopLevelNavigation(url) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const navEvents = [];
    let tabId = null;
    let committedCount = 0;
    let finalUrl = url;

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId = null;

      function finish(out) {
        if (settled) return;
        settled = true;
        const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        try {
          chrome.webNavigation.onCommitted.removeListener(onCommitted);
          chrome.webNavigation.onCompleted.removeListener(onCompleted);
          chrome.webNavigation.onErrorOccurred.removeListener(onErrorOccurred);
        } catch (_) {}
        if (timeoutId) clearTimeout(timeoutId);
        if (tabId !== null) {
          try {
            chrome.tabs.remove(tabId, () => {});
          } catch (_) {}
        }
        resolve({
          ...out,
          finalUrl: out.finalUrl || finalUrl || url,
          redirectCount: Math.max(0, committedCount - 1),
          durationMs: Math.round(t1 - t0),
          events: navEvents
        });
      }

      function onCommitted(details) {
        if (details.tabId !== tabId || details.frameId !== 0) return;
        committedCount += 1;
        finalUrl = details.url || finalUrl;
        navEvents.push(`COMMITTED ${details.transitionType || 'unknown'} ${details.url || ''}`.trim());
      }

      function onCompleted(details) {
        if (details.tabId !== tabId || details.frameId !== 0) return;
        finalUrl = details.url || finalUrl;
        navEvents.push(`COMPLETED ${details.url || ''}`.trim());
        finish({ ok: true, category: 'navigationOk' });
      }

      function onErrorOccurred(details) {
        if (details.tabId !== tabId || details.frameId !== 0) return;
        finalUrl = details.url || finalUrl;
        navEvents.push(`ERROR ${details.error || 'UnknownError'} ${details.url || ''}`.trim());
        finish({
          ok: false,
          category: 'navigationError',
          errorName: details.error || 'NavigationError'
        });
      }

      chrome.tabs.create({ url, active: false }, (tab) => {
        if (!tab || tab.id == null || chrome.runtime.lastError) {
          finish({
            ok: false,
            category: 'navigationError',
            errorName: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'TabCreateFailed'
          });
          return;
        }
        tabId = tab.id;
        try {
          chrome.webNavigation.onCommitted.addListener(onCommitted);
          chrome.webNavigation.onCompleted.addListener(onCompleted);
          chrome.webNavigation.onErrorOccurred.addListener(onErrorOccurred);
        } catch (_) {
          finish({
            ok: false,
            category: 'navigationError',
            errorName: 'WebNavigationUnavailable'
          });
          return;
        }
        timeoutId = setTimeout(() => {
          finish({
            ok: false,
            category: 'navigationError',
            errorName: 'NavigationTimeout'
          });
        }, 15000);
      });
    });
  }

  async function verifyUniqueLinkUrls(urls) {
    const uniqueUrls = Array.from(new Set((Array.isArray(urls) ? urls : []).filter(Boolean)));
    const networkUrls = uniqueUrls.filter(isDownloadableNetworkUrl);
    const concurrency = 3;
    let index = 0;
    const results = [];

    async function worker() {
      while (index < networkUrls.length) {
        const u = networkUrls[index];
        index += 1;
        const probe = await verifyHttpLinkUrl(u);
        const nav = await verifyTopLevelNavigation(u);
        if (nav && nav.ok) {
          results.push({
            url: u,
            ok: true,
            category: 'navigationOk',
            status: probe.status || 0,
            finalUrl: nav.finalUrl || probe.finalUrl || u,
            errorName: null,
            attempts: probe.attempts || [],
            failStage: probe.failStage || null,
            probe,
            navigation: nav
          });
        } else {
          results.push({
            url: u,
            ok: false,
            category: 'navigationError',
            status: probe.status || 0,
            finalUrl: (nav && nav.finalUrl) || probe.finalUrl || u,
            errorName: (nav && nav.errorName) || probe.errorName || 'NavigationError',
            attempts: probe.attempts || [],
            failStage: probe.failStage || null,
            probe,
            navigation: nav
          });
        }
      }
    }

    const workers = [];
    const workerCount = Math.min(concurrency, networkUrls.length);
    for (let i = 0; i < workerCount; i += 1) workers.push(worker());
    await Promise.all(workers);
    return { ok: true, results };
  }

  if (action === 'preflightVerifyLinkUrls') {
    verifyUniqueLinkUrls(msg.urls)
      .then((data) => sendResponse(data))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : 'Link verification failed.',
          results: []
        });
      });
    return true;
  }

  if (action === 'preflightMeasureImageUrls') {
    fetchUniqueDownloadSize(msg.urls)
      .then((sizeData) => {
        sendResponse({ ok: true, ...sizeData });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : 'Failed to measure image sizes.'
        });
      });
    return true;
  }

  if (action === 'ecPreviewCampaignChanged') {
    const campaignId = String(msg.campaignId || '').trim();
    if (campaignId && sender && sender.tab && sender.tab.id != null) {
      chrome.tabs.sendMessage(
        sender.tab.id,
        { action: 'ecPreviewCampaignChanged', campaignId },
        { frameId: 0 },
        () => {}
      );
    }
    return;
  }

  if (action === 'openInNewTab') {
    const url = String(msg.url || '').trim();
    if (url) {
      const active = msg.active !== false;
      chrome.tabs.create({ url, active });
    }
    return;
  }

  if (action === 'duplicateEmarsysCampaign') {
    const campaignId = String(msg.campaignId || '').trim();
    const token = String(msg.token || '').trim();
    if (!campaignId || !token) {
      sendResponse({ ok: false, reason: 'missing_campaign_id_or_token' });
      return;
    }
    duplicateEmarsysCampaign(campaignId, token)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, reason: 'fetch_error' }));
    return true;
  }

  bgLog("Unknown action:", action);
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log("[Gem] Extension icon clicked");

  try {
    // Check if we're on an Emarsys page
    if (tab.url && tab.url.includes('emarsys.net')) {
      console.log("[Gem] On Emarsys page, toggling settings panel");

      // Send message to content script to toggle settings panel
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleSettingsPanel'
      }).catch((error) => {
        console.log("[Gem] Could not communicate with content script:", error);
      });
    } else {
      console.log("[Gem] Not on Emarsys page, no action taken");
    }
  } catch (error) {
    console.log("[Gem] Error handling extension click:", error);
  }
});

bgLog("Background service worker initialized");

function broadcastRecentCampaignOpenTabsUpdated() {
  chrome.tabs.query({ url: EMARSYS_TAB_URL_PATTERN }, (tabs) => {
    (Array.isArray(tabs) ? tabs : []).forEach((tab) => {
      if (tab && tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { action: "recentCampaignOpenTabsUpdated" }, () => {});
      }
    });
  });
}

function refreshRecentCampaignOpenTabsCache() {
  chrome.tabs.query({}, (tabs) => {
    const byCampaignId = {};
    const openCampaignUrls = {};
    const openCampaignKeys = {};
    (Array.isArray(tabs) ? tabs : []).forEach((tab) => {
      const tabUrl = String(tab && tab.url ? tab.url : '');
      if (!tabUrl || !/https?:\/\/([^/]+\.)?emarsys\.net\//i.test(tabUrl)) return;
      const id = rcGetCampaignIdFromTabUrl(tabUrl);
      const normalizedUrl = rcGetNormalizedCampaignUrl(tabUrl);
      const matchKey = rcGetCampaignMatchKey(tabUrl, id);
      if (tab.id == null) return;
      if (id && !byCampaignId[id]) byCampaignId[id] = tab.id;
      if (normalizedUrl) openCampaignUrls[normalizedUrl] = tab.id;
      if (matchKey) openCampaignKeys[matchKey] = tab.id;
    });
    const next = { byCampaignId, openCampaignUrls, openCampaignKeys };
    const prev = JSON.stringify(recentCampaignOpenTabsCache || {});
    const curr = JSON.stringify(next);
    recentCampaignOpenTabsCache = next;
    if (prev !== curr) broadcastRecentCampaignOpenTabsUpdated();
  });
}

function scheduleRefreshRecentCampaignOpenTabsCache() {
  if (rcTabsRefreshTimer) clearTimeout(rcTabsRefreshTimer);
  rcTabsRefreshTimer = setTimeout(() => {
    rcTabsRefreshTimer = null;
    refreshRecentCampaignOpenTabsCache();
  }, RC_TABS_REFRESH_DEBOUNCE_MS);
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    scheduleRefreshRecentCampaignOpenTabsCache();
  }
});
chrome.tabs.onActivated.addListener(() => scheduleRefreshRecentCampaignOpenTabsCache());
chrome.windows.onFocusChanged.addListener(() => scheduleRefreshRecentCampaignOpenTabsCache());
scheduleRefreshRecentCampaignOpenTabsCache();

chrome.tabs.onRemoved.addListener((tabId) => {
  delete recentCampaignUnsavedByTabId[String(tabId)];
  scheduleRefreshRecentCampaignOpenTabsCache();
});
