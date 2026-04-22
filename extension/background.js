// background.js
// ------------------------------------------------------------
// Simple background service worker for Gemma
// ------------------------------------------------------------

try { importScripts('debug-logging-gate.js'); } catch (_) {}

console.log("[Gem] Background script loading...");

function bgLog(...args) {
  try { console.log("[Gem] BG]", ...args); } catch (e) {}
}

// Send a message to content scripts in a tab
function sendToTab(tabId, msg) {
  console.log("[Gem] BG: Sending to tab:", tabId, "msg:", msg);
  chrome.tabs.sendMessage(tabId, msg, (response) => {
    console.log("[Gem] BG: tabs.sendMessage response:", response);
    if (chrome.runtime.lastError) {
      console.log("[Gem] BG: tabs.sendMessage error:", chrome.runtime.lastError.message);
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

  const PREFLIGHT_NETWORK_ORIGINS = ['https://*/*', 'http://*/*'];

  function hasAllPreflightNetworkOrigins(callback) {
    let pending = PREFLIGHT_NETWORK_ORIGINS.length;
    let allGranted = true;
    PREFLIGHT_NETWORK_ORIGINS.forEach((origin) => {
      chrome.permissions.contains({ origins: [origin] }, (ok) => {
        if (!ok) allGranted = false;
        pending -= 1;
        if (pending === 0) callback(allGranted);
      });
    });
  }

  function requestAllPreflightNetworkOrigins(callback) {
    chrome.permissions.request({ origins: PREFLIGHT_NETWORK_ORIGINS.slice() }, (granted) => {
      callback(!!granted);
    });
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
