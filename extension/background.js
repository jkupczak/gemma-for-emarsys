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

  if (action === 'preflightEnsureImageHostAccess') {
    chrome.permissions.contains({ origins: ['https://*/*'] }, (alreadyGranted) => {
      if (alreadyGranted) {
        sendResponse({ ok: true, granted: true, alreadyGranted: true });
        return;
      }
      chrome.permissions.request({ origins: ['https://*/*'] }, (granted) => {
        sendResponse({ ok: true, granted: !!granted, alreadyGranted: false });
      });
    });
    return true;
  }

  if (action === 'preflightCheckImageHostAccess') {
    chrome.permissions.contains({ origins: ['https://*/*'] }, (granted) => {
      sendResponse({ ok: true, granted: !!granted });
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
