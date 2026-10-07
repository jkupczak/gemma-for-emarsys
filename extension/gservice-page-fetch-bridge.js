// gservice-page-fetch-bridge.js — MAIN world fetch proxy for Emarsys gservice APIs.
// Content scripts cannot use inline script (CSP); this bridge runs via manifest world: MAIN.
(function initGemGservicePageFetchBridge() {
  if (window.__gemGservicePageFetchBridgeInstalled) return;
  window.__gemGservicePageFetchBridgeInstalled = true;

  const REQUEST_SOURCE = 'gem-gservice-fetch-request';
  const RESPONSE_SOURCE = 'gem-gservice-page-fetch';

  function isAllowedGserviceUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ''), window.location.href);
      if (url.protocol !== 'https:') return false;
      return /\.gservice\.emarsys\.net$/i.test(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function postResponse(requestId, payload) {
    try {
      window.postMessage(
        Object.assign({ source: RESPONSE_SOURCE, requestId: requestId }, payload),
        '*'
      );
    } catch (_) {}
  }

  window.addEventListener('message', function onGserviceFetchRequest(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== REQUEST_SOURCE || !data.requestId) return;

    const requestId = data.requestId;
    const url = String(data.url || '').trim();
    const method = String(data.method || 'GET').toUpperCase();
    const headers = data.headers && typeof data.headers === 'object' ? data.headers : {};

    if (!url || !isAllowedGserviceUrl(url)) {
      postResponse(requestId, { ok: false, error: 'disallowed_url' });
      return;
    }

    fetch(url, { method: method, headers: headers })
      .then(function (res) {
        return res.text().then(function (text) {
          var parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (_) {
            parsed = null;
          }
          postResponse(requestId, {
            ok: res.ok,
            status: res.status,
            data: parsed,
            raw: parsed == null && text ? text : undefined,
          });
        });
      })
      .catch(function (err) {
        postResponse(requestId, {
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      });
  });
})();
