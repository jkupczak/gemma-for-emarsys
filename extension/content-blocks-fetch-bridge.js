// content-blocks-fetch-bridge.js
// Page-context bridge for Review Links: resolve campaign snapshots and return
// extracted link rows (small postMessage payloads).
(function () {
  'use strict';

  if (window.__gemContentBlocksFetchBridgeInstalled) return;
  window.__gemContentBlocksFetchBridgeInstalled = true;

  const REQUEST_SOURCE = 'gem-content-blocks-snapshot-request';
  const RESPONSE_SOURCE = 'gem-content-blocks-snapshot-response';
  const READY_SOURCE = 'gem-content-blocks-bridge-ready';
  const HANDSHAKE_URL_PATTERN = /\/api\/handshake\/token\/campaigns\/([^/?#]+)/;
  const nativeFetch = window.fetch.bind(window);

  window.__gemContentBlocksSnapshots = window.__gemContentBlocksSnapshots || {};
  window.__gemContentBlocksAuthToken = window.__gemContentBlocksAuthToken || '';

  let activeRequestId = '';
  let linksExtractorPromise = null;

  function markReady() {
    try {
      window.postMessage({ source: READY_SOURCE, ready: true }, '*');
    } catch (_) {}
    if (document.documentElement) {
      document.documentElement.setAttribute('data-gem-content-blocks-bridge', '1');
    }
  }

  function ensureLinksExtractor() {
    if (window.gemCampaignLinksData) return Promise.resolve();
    if (linksExtractorPromise) return linksExtractorPromise;

    linksExtractorPromise = new Promise(function (resolve, reject) {
      const deadline = Date.now() + 5000;

      (function poll() {
        if (window.gemCampaignLinksData) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('campaign-links-data.js not available in page context'));
          return;
        }
        setTimeout(poll, 50);
      })();
    });

    return linksExtractorPromise;
  }

  function parseTokenPayload(data) {
    if (data == null) return null;
    if (typeof data === 'string') return data.trim() || null;
    if (data && data.data && typeof data.data.token === 'string') {
      return data.data.token.trim() || null;
    }
    if (data && typeof data.token === 'string') {
      return data.token.trim() || null;
    }
    return null;
  }

  function getFlippersHeader() {
    try {
      const flippers =
        (window.e && window.e.config && window.e.config.flippers) ||
        (window.contentBlocks && window.contentBlocks.config && window.contentBlocks.config.flippers);
      if (Array.isArray(flippers) && flippers.length) {
        return flippers.join(',');
      }
    } catch (_) {}
    return '';
  }

  function readAuthHeaderFromFetchArgs(args) {
    try {
      const init = args[1] || {};
      if (args[0] instanceof Request) {
        const auth = args[0].headers.get('authorization') || args[0].headers.get('Authorization');
        return auth ? String(auth).replace(/^Bearer\s+/i, '').trim() : '';
      }

      const headers = init.headers || {};
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        const auth = headers.get('authorization') || headers.get('Authorization');
        return auth ? String(auth).replace(/^Bearer\s+/i, '').trim() : '';
      }

      const auth = headers.authorization || headers.Authorization;
      return auth ? String(auth).replace(/^Bearer\s+/i, '').trim() : '';
    } catch (_) {
      return '';
    }
  }

  function cacheSnapshot(campaignId, data) {
    const id = String(campaignId || '').trim();
    if (!id || !data) return;
    window.__gemContentBlocksSnapshots[id] = data;
  }

  function getCachedSnapshot(campaignId) {
    const id = String(campaignId || '').trim();
    if (!id) return null;
    return window.__gemContentBlocksSnapshots[id] || null;
  }

  function parseSnapshotPayload(data) {
    if (!data || typeof data !== 'object') {
      return { ok: false, reason: 'invalid_shape', data: data };
    }

    let campaign = data.campaign || (data.data && data.data.campaign) || data;
    if (!campaign || typeof campaign !== 'object') {
      return { ok: false, reason: 'invalid_shape', data: data };
    }

    if (!campaign.contents || typeof campaign.contents !== 'object') {
      return { ok: false, reason: 'missing_contents', data: data };
    }

    return { ok: true, snapshot: data, campaign: campaign };
  }

  async function fetchGserviceToken(sessionId, integration) {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;

    const origin = window.location.origin;
    const integrationParam = integration
      ? '&integration=' + encodeURIComponent(integration)
      : '';
    const url =
      origin +
      '/bootstrap.php?r=frontendAuthentication/getToken&session_id=' +
      encodeURIComponent(sid) +
      integrationParam;

    const res = await nativeFetch(url, { credentials: 'include' });
    if (!res.ok) return null;

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      return null;
    }

    return parseTokenPayload(data);
  }

  async function resolveContentBlocksToken(sessionId) {
    const cached = String(window.__gemContentBlocksAuthToken || '').trim();
    if (cached) return cached.replace(/^Bearer\s+/i, '');

    const uiKitIntegrations = ['content-blocks', 'contentBlocks'];
    if (window.uiKit && typeof window.uiKit.getAuthenticationToken === 'function') {
      for (let i = 0; i < uiKitIntegrations.length; i += 1) {
        try {
          const token = await window.uiKit.getAuthenticationToken(uiKitIntegrations[i]);
          if (token) {
            return String(token).replace(/^Bearer\s+/i, '').trim();
          }
        } catch (_) {}
      }
    }

    const integrations = ['content-blocks', 'contentBlocks', ''];
    for (let i = 0; i < integrations.length; i += 1) {
      try {
        const token = await fetchGserviceToken(sessionId, integrations[i] || null);
        if (token) return token.replace(/^Bearer\s+/i, '');
      } catch (_) {}
    }

    return null;
  }

  function fetchHandshakeViaXHR(url, headers) {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.withCredentials = true;

      Object.keys(headers || {}).forEach(function (key) {
        xhr.setRequestHeader(key, headers[key]);
      });

      xhr.onload = function () {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {}

        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data: data,
        });
      };

      xhr.onerror = function () {
        reject(new Error('XHR network error'));
      };

      xhr.send();
    });
  }

  async function fetchSnapshotFromNetwork(campaignId, sessionId) {
    const id = String(campaignId || '').trim();
    const sid = String(sessionId || '').trim();
    if (!id || !sid) {
      return { ok: false, reason: 'missing_campaign_or_session' };
    }

    const token = await resolveContentBlocksToken(sid);
    if (!token) {
      return { ok: false, reason: 'no_auth_token' };
    }

    const url =
      'https://content-blocks.gservice.emarsys.net/api/handshake/token/campaigns/' +
      encodeURIComponent(id);

    const headers = {
      accept: 'application/json, text/plain, */*',
      authorization: 'Bearer ' + token,
      'x-auth': token,
    };
    const flippers = getFlippersHeader();
    if (flippers) {
      headers.flippers = flippers;
    }

    let res = null;
    try {
      res = await nativeFetch(url, {
        method: 'GET',
        headers: headers,
        credentials: 'include',
      });
    } catch (fetchErr) {
      try {
        const xhrResult = await fetchHandshakeViaXHR(url, headers);
        if (!xhrResult.ok) {
          return {
            ok: false,
            reason: 'api_error',
            status: xhrResult.status,
            data: xhrResult.data,
            error: 'HTTP ' + xhrResult.status,
          };
        }
        if (xhrResult.data) {
          cacheSnapshot(id, xhrResult.data);
        }
        return parseSnapshotPayload(xhrResult.data);
      } catch (xhrErr) {
        return {
          ok: false,
          reason: 'fetch_error',
          error: (fetchErr && fetchErr.message) || (xhrErr && xhrErr.message) || 'fetch failed',
        };
      }
    }

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {}

    if (!res.ok) {
      return {
        ok: false,
        reason: 'api_error',
        status: res.status,
        data: data,
        error: 'HTTP ' + res.status,
      };
    }

    if (data) {
      cacheSnapshot(id, data);
    }

    return parseSnapshotPayload(data);
  }

  async function resolveSnapshot(campaignId, sessionId) {
    const cached = getCachedSnapshot(campaignId);
    if (cached) {
      const parsed = parseSnapshotPayload(cached);
      if (parsed.ok) return parsed;
    }

    return fetchSnapshotFromNetwork(campaignId, sessionId);
  }

  function buildLinksByLanguage(snapshot, languageKeys) {
    const linksData = window.gemCampaignLinksData;
    if (!linksData) {
      return { ok: false, reason: 'missing_links_extractor' };
    }

    const requested = Array.isArray(languageKeys)
      ? languageKeys.map(function (key) { return String(key || '').trim(); }).filter(Boolean)
      : [];

    const resolvedKeys = requested.length
      ? linksData.resolveLanguageKeys(snapshot, requested)
      : Object.keys((snapshot && (snapshot.campaign || snapshot) && (snapshot.campaign || snapshot).contents) || {});

    const linksByLanguage = {};
    const uniqueKeys = requested.length ? requested : resolvedKeys;

    uniqueKeys.forEach(function (requestedKey, index) {
      const resolved = linksData.resolveLanguageKeys(snapshot, [requestedKey]);
      const langKey = resolved[0] || resolvedKeys[index] || requestedKey;
      linksByLanguage[requestedKey] = linksData.extractLinksForLanguage(snapshot, langKey);
    });

    return { ok: true, linksByLanguage: linksByLanguage };
  }

  function postResponse(requestId, result) {
    const response = Object.assign({ source: RESPONSE_SOURCE, requestId: requestId }, result);
    try {
      window.postMessage(response, '*');
    } catch (err) {
      postResponse(requestId, {
        ok: false,
        reason: 'fetch_error',
        error: err && err.message ? err.message : 'failed to post response',
      });
    }
  }

  async function handleRequest(payload) {
    if (!payload || !payload.requestId) return;
    if (payload.requestId === activeRequestId) return;

    activeRequestId = payload.requestId;

    try {
      await ensureLinksExtractor();

      const snapshotResult = await resolveSnapshot(payload.campaignId, payload.sessionId);
      if (!snapshotResult.ok) {
        postResponse(payload.requestId, snapshotResult);
        return;
      }

      const linksResult = buildLinksByLanguage(snapshotResult.snapshot, payload.languageKeys);
      if (!linksResult.ok) {
        postResponse(payload.requestId, linksResult);
        return;
      }

      postResponse(payload.requestId, {
        ok: true,
        linksByLanguage: linksResult.linksByLanguage,
        campaign: snapshotResult.campaign,
      });
    } catch (err) {
      postResponse(payload.requestId, {
        ok: false,
        reason: 'fetch_error',
        error: err && err.message ? err.message : String(err),
      });
    } finally {
      activeRequestId = '';
    }
  }

  function installFetchInterceptor() {
    if (window.__gemContentBlocksFetchInterceptorInstalled) return;
    window.__gemContentBlocksFetchInterceptorInstalled = true;

    function attachSharedJson(response, data) {
      if (!response || !data) return response;
      try {
        response.json = async function () {
          return data;
        };
        const originalClone = typeof response.clone === 'function' ? response.clone.bind(response) : null;
        if (originalClone) {
          response.clone = function () {
            const cloned = originalClone();
            return attachSharedJson(cloned, data);
          };
        }
      } catch (_) {}
      return response;
    }

    window.fetch = async function (...args) {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);

      if (HANDSHAKE_URL_PATTERN.test(url)) {
        const auth = readAuthHeaderFromFetchArgs(args);
        if (auth) {
          window.__gemContentBlocksAuthToken = auth;
        }
      }

      const response = await nativeFetch.apply(this, args);

      try {
        if (HANDSHAKE_URL_PATTERN.test(url)) {
          const match = url.match(HANDSHAKE_URL_PATTERN);
          try {
            const data = await response.clone().json();
            if (match) cacheSnapshot(match[1], data);
            return attachSharedJson(response, data);
          } catch (_) {
            return response;
          }
        }
      } catch (_) {}

      return response;
    };
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== REQUEST_SOURCE) return;
    handleRequest(data);
  });

  installFetchInterceptor();
  markReady();
  console.log('[Gem][ContentBlocksBridge] Page bridge installed.');
})();
