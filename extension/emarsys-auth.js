// emarsys-auth.js
// Runs at document_start on every Emarsys page.
// Exposes shared helpers for Emarsys API access to all content scripts.
(function () {
  try {
    if (window.__gemEmarsysAuthInstalled) return;
    window.__gemEmarsysAuthInstalled = true;

    /**
     * Fetches a fresh short-lived JWT from Emarsys's token endpoint.
     * Must be called from a content script running on the Emarsys page
     * (same-origin fetch — no CORS, session cookies sent automatically).
     *
     * @param {string} sessionId - The session_id from the current page URL.
     * @param {string} [integration] - The gservice integration name. Defaults to "email-campaign-list".
     * @returns {Promise<string|null>} The raw JWT string, or null on failure.
     */
    window.gemFetchGserviceToken = function gemFetchGserviceToken(sessionId, integration) {
      const integ = integration || "email-campaign-list";
      const origin = window.location.origin;
      const url = `${origin}/bootstrap.php?r=frontendAuthentication/getToken&session_id=${encodeURIComponent(sessionId)}&integration=${encodeURIComponent(integ)}`;
      console.log("[Gem][Auth] fetchGserviceToken: requesting", url, "| sessionId present:", !!sessionId);
      return fetch(url, { credentials: "include" })
        .then(function (res) {
          console.log("[Gem][Auth] fetchGserviceToken: HTTP", res.status, res.ok ? "ok" : "not ok");
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (data) {
          console.log("[Gem][Auth] fetchGserviceToken: response data type:", typeof data, "| value preview:", JSON.stringify(data) && JSON.stringify(data).slice(0, 120));
          if (data == null) return null;
          if (typeof data === "string") return data.trim() || null;
          if (data && data.data && typeof data.data.token === "string") return data.data.token.trim() || null;
          if (data && typeof data.token === "string") return data.token.trim() || null;
          return null;
        })
        .catch(function (err) {
          console.warn("[Gem][Auth] fetchGserviceToken: fetch threw:", err && err.message ? err.message : String(err));
          return null;
        });
    };

    /**
     * Calls the Emarsys gservice duplicate endpoint from the page context so the
     * request Origin matches the JWT allowedOrigins (emarsys.net). Background fetches
     * get 403 because they do not carry an Emarsys origin.
     *
     * @param {string} campaignId
     * @param {string} token - Raw JWT from gemFetchGserviceToken.
     * @returns {Promise<{ok: boolean, newCampaignId?: number|string, reason?: string}>}
     */
    window.gemCallGserviceDuplicate = function gemCallGserviceDuplicate(campaignId, token) {
      const id = String(campaignId || "").trim();
      const bareToken = String(token || "").trim().replace(/^Bearer\s+/i, "");
      if (!id || !bareToken) {
        return Promise.resolve({ ok: false, reason: "missing_id_or_token" });
      }

      const url =
        "https://email-campaign-list.gservice.emarsys.net/api/client/campaigns/" +
        encodeURIComponent(id) +
        "/duplicate";
      console.log("[Gem][Auth] gemCallGserviceDuplicate: POST", url);

      return fetch(url, {
        method: "POST",
        headers: {
          authorization: "Bearer " + bareToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ campaignId: id }),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (data) {
              console.log(
                "[Gem][Auth] gemCallGserviceDuplicate: HTTP",
                res.status,
                res.ok ? "ok" : "not ok"
              );
              if (!res.ok) return { ok: false, reason: "api_error", status: res.status, data: data };
              if (!data || !data.success || data.data == null || data.data.campaignId == null) {
                return { ok: false, reason: "unexpected_response", status: res.status, data: data };
              }
              return { ok: true, newCampaignId: data.data.campaignId };
            });
        })
        .catch(function (err) {
          console.warn(
            "[Gem][Auth] gemCallGserviceDuplicate: fetch threw:",
            err && err.message ? err.message : String(err)
          );
          return {
            ok: false,
            reason: "fetch_error",
            error: err && err.message ? err.message : String(err),
          };
        });
    };

    /**
     * Duplicates a campaign via the Emarsys gservice API.
     * Handles token acquisition internally.
     *
     * @param {string} campaignId - The ID of the campaign to duplicate.
     * @param {string} sessionId  - The session_id from the current page URL (used to get a fresh token).
     * @returns {Promise<{ok: boolean, newCampaignId?: number|string, reason?: string}>}
     */
    window.gemDuplicateCampaign = function gemDuplicateCampaign(campaignId, sessionId) {
      console.log("[Gem][Auth] gemDuplicateCampaign: campaignId =", campaignId, "| sessionId =", sessionId);
      return window.gemFetchGserviceToken(sessionId).then(function (token) {
        console.log("[Gem][Auth] gemDuplicateCampaign: token obtained =", !!token);
        if (!token) {
          return { ok: false, reason: "no_auth_token" };
        }
        return window.gemCallGserviceDuplicate(campaignId, token).then(function (res) {
          console.log("[Gem][Auth] gemDuplicateCampaign: gservice response:", res);
          return res;
        });
      });
    };

    /**
     * Performs a gservice fetch from the page's main JS world so the request carries
     * the Emarsys page Origin (matches devtools / native Emarsys fetch behavior).
     */
    function gemFetchGserviceFromPageContext(url, options) {
      return new Promise(function (resolve, reject) {
        const requestId = "gem-gfetch-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        let settled = false;

        function finish(result, isError) {
          if (settled) return;
          settled = true;
          window.removeEventListener("message", onMessage);
          clearTimeout(timer);
          if (isError) reject(result);
          else resolve(result);
        }

        function onMessage(event) {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.source !== "gem-gservice-page-fetch" || data.requestId !== requestId) {
            return;
          }
          finish(data, false);
        }

        window.addEventListener("message", onMessage);
        const timer = setTimeout(function () {
          finish(new Error("page context fetch timeout"), true);
        }, 20000);

        const script = document.createElement("script");
        script.textContent =
          "(function(){var u=" +
          JSON.stringify(url) +
          ";var h=" +
          JSON.stringify((options && options.headers) || {}) +
          ";var m=" +
          JSON.stringify((options && options.method) || "GET") +
          ";fetch(u,{method:m,headers:h,credentials:'include'})" +
          ".then(function(r){return r.text().then(function(t){var d=null;try{d=JSON.parse(t);}catch(e){}return{ok:r.ok,status:r.status,data:d};});})" +
          ".then(function(r){window.postMessage({source:'gem-gservice-page-fetch',requestId:" +
          JSON.stringify(requestId) +
          ",ok:r.ok,status:r.status,data:r.data},'*');})" +
          ".catch(function(e){window.postMessage({source:'gem-gservice-page-fetch',requestId:" +
          JSON.stringify(requestId) +
          ",ok:false,error:e&&e.message?e.message:String(e)},'*');});})();";
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();
      });
    }

    function parsePersonalizationGserviceListResponse(res, data) {
      if (!res.ok) {
        return { ok: false, reason: "api_error", status: res.status, data: data };
      }
      const results = data && Array.isArray(data.results) ? data.results : [];
      return { ok: true, results: results };
    }

    function fetchPersonalizationGserviceListFromPage(url, headers) {
      console.log("[Gem][Auth] personalization gservice: retrying via page context", url);
      return gemFetchGserviceFromPageContext(url, { method: "GET", headers: headers })
        .then(function (pageRes) {
          if (pageRes.error) {
            return { ok: false, reason: "fetch_error", error: pageRes.error };
          }
          return parsePersonalizationGserviceListResponse(
            { ok: pageRes.ok, status: pageRes.status },
            pageRes.data
          );
        })
        .catch(function (err) {
          return {
            ok: false,
            reason: "fetch_error",
            error: err && err.message ? err.message : String(err),
          };
        });
    }

    function gemFetchPersonalizationEditorList(customerId, sessionId, existingToken, resourcePath, logLabel) {
      const cid = String(customerId || "").trim();
      const sid = String(sessionId || "").trim();
      const path = String(resourcePath || "").trim().replace(/^\/+/, "");
      if (!cid || !sid || !path) {
        return Promise.resolve({ ok: false, reason: "missing_customer_session_or_path" });
      }

      const bareExisting = String(existingToken || "").trim().replace(/^Bearer\s+/i, "");
      const fetchToken =
        bareExisting
          ? Promise.resolve(bareExisting)
          : window.gemFetchGserviceToken(sid, "personalization-editor");

      return fetchToken.then(function (token) {
        if (!token) {
          return { ok: false, reason: "no_auth_token" };
        }

        const bareToken = String(token).trim().replace(/^Bearer\s+/i, "");
        const url =
          "https://personalization-editor.gservice.emarsys.net/customer/" +
          encodeURIComponent(cid) +
          "/" +
          path;
        const headers = {
          accept: "application/json, text/plain, */*",
          authorization: "Bearer " + bareToken,
        };

        console.log("[Gem][Auth]", logLabel || path, ": GET", url);

        return fetch(url, {
          method: "GET",
          headers: headers,
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return null;
              })
              .then(function (data) {
                return parsePersonalizationGserviceListResponse(res, data);
              });
          })
          .catch(function (err) {
            console.warn(
              "[Gem][Auth]",
              logLabel || path,
              "content-script fetch failed:",
              err && err.message ? err.message : String(err)
            );
            return fetchPersonalizationGserviceListFromPage(url, headers);
          });
      });
    }

    /**
     * Fetches the team's saved personalization tokens from the personalization-editor gservice.
     *
     * @param {string|number} customerId
     * @param {string} sessionId
     * @param {string} [existingToken] - Optional JWT already fetched for personalization-editor.
     * @returns {Promise<{ok: boolean, results?: object[], reason?: string}>}
     */
    window.gemFetchPersonalizationTokenList = function gemFetchPersonalizationTokenList(
      customerId,
      sessionId,
      existingToken
    ) {
      return gemFetchPersonalizationEditorList(
        customerId,
        sessionId,
        existingToken,
        "token/list",
        "token/list"
      );
    };

    /**
     * Fetches RDS preset definitions used to build RDS personalization token Twig code.
     *
     * @param {string|number} customerId
     * @param {string} sessionId
     * @param {string} [existingToken] - Optional JWT already fetched for personalization-editor.
     * @returns {Promise<{ok: boolean, results?: object[], reason?: string}>}
     */
    window.gemFetchRdsPresetList = function gemFetchRdsPresetList(customerId, sessionId, existingToken) {
      return gemFetchPersonalizationEditorList(
        customerId,
        sessionId,
        existingToken,
        "rds-preset/list",
        "rds-preset/list"
      );
    };

    function parseContactSourcesResponse(res, data) {
      if (!res.ok) {
        return { ok: false, reason: "api_error", status: res.status, data: data };
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { ok: false, reason: "invalid_shape", data: data };
      }
      return { ok: true, sources: data };
    }

    function fetchContactSourcesFromPage(url, headers) {
      console.log("[Gem][Auth] contact sources: retrying via page context", url);
      return gemFetchGserviceFromPageContext(url, { method: "GET", headers: headers })
        .then(function (pageRes) {
          if (pageRes.error) {
            return { ok: false, reason: "fetch_error", error: pageRes.error };
          }
          return parseContactSourcesResponse(
            { ok: pageRes.ok, status: pageRes.status },
            pageRes.data
          );
        })
        .catch(function (err) {
          return {
            ok: false,
            reason: "fetch_error",
            error: err && err.message ? err.message : String(err),
          };
        });
    }

    function gemFetchPersonalizationEditorJson(
      customerId,
      sessionId,
      existingToken,
      resourcePath,
      logLabel,
      parseResponse
    ) {
      const cid = String(customerId || "").trim();
      const sid = String(sessionId || "").trim();
      const path = String(resourcePath || "").trim().replace(/^\/+/, "");
      if (!cid || !sid || !path) {
        return Promise.resolve({ ok: false, reason: "missing_customer_session_or_path" });
      }

      const bareExisting = String(existingToken || "").trim().replace(/^Bearer\s+/i, "");
      const fetchToken =
        bareExisting
          ? Promise.resolve(bareExisting)
          : window.gemFetchGserviceToken(sid, "personalization-editor");

      return fetchToken.then(function (token) {
        if (!token) {
          return { ok: false, reason: "no_auth_token" };
        }

        const bareToken = String(token).trim().replace(/^Bearer\s+/i, "");
        const url =
          "https://personalization-editor.gservice.emarsys.net/customer/" +
          encodeURIComponent(cid) +
          "/" +
          path;
        const headers = {
          accept: "application/json, text/plain, */*",
          authorization: "Bearer " + bareToken,
        };

        console.log("[Gem][Auth]", logLabel || path, ": GET", url);

        return fetch(url, {
          method: "GET",
          headers: headers,
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return null;
              })
              .then(function (data) {
                return parseResponse(res, data);
              });
          })
          .catch(function (err) {
            console.warn(
              "[Gem][Auth]",
              logLabel || path,
              "content-script fetch failed:",
              err && err.message ? err.message : String(err)
            );
            return fetchContactSourcesFromPage(url, headers);
          });
      });
    }

    /**
     * Fetches predefined contact-field tokens grouped by category (general, personal, etc.).
     *
     * @param {string|number} customerId
     * @param {string} sessionId
     * @param {string} [existingToken] - Optional JWT already fetched for personalization-editor.
     * @returns {Promise<{ok: boolean, sources?: object, reason?: string}>}
     */
    window.gemFetchContactSourceList = function gemFetchContactSourceList(
      customerId,
      sessionId,
      existingToken
    ) {
      return gemFetchPersonalizationEditorJson(
        customerId,
        sessionId,
        existingToken,
        "sources/contact",
        "sources/contact",
        parseContactSourcesResponse
      );
    };

    const CONTENT_BLOCKS_BRIDGE_READY_ATTR = "data-gem-content-blocks-bridge";
    const CONTENT_BLOCKS_SNAPSHOT_CACHED_SOURCE = "gem-content-blocks-snapshot-cached";
    const CONTENT_BLOCKS_SNAPSHOT_CACHE_MAX = 8;
    const contentBlocksSnapshotCache = new Map();

    function rememberContentBlocksSnapshot(campaignId, snapshot) {
      const id = String(campaignId || "").trim();
      if (!id || !snapshot) return;
      if (contentBlocksSnapshotCache.has(id)) contentBlocksSnapshotCache.delete(id);
      contentBlocksSnapshotCache.set(id, snapshot);
      while (contentBlocksSnapshotCache.size > CONTENT_BLOCKS_SNAPSHOT_CACHE_MAX) {
        const oldestKey = contentBlocksSnapshotCache.keys().next().value;
        contentBlocksSnapshotCache.delete(oldestKey);
      }
    }

    window.addEventListener("message", function (event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== CONTENT_BLOCKS_SNAPSHOT_CACHED_SOURCE) return;
      const campaignId = String(data.campaignId || "").trim();
      if (!campaignId || !data.snapshot) return;
      rememberContentBlocksSnapshot(campaignId, data.snapshot);
    });

    window.gemGetCachedContentBlocksSnapshot = function gemGetCachedContentBlocksSnapshot(campaignId) {
      const id = String(campaignId || "").trim();
      if (!id) return null;
      return contentBlocksSnapshotCache.get(id) || null;
    };

    window.gemClearCachedContentBlocksSnapshot = function gemClearCachedContentBlocksSnapshot(campaignId) {
      const id = String(campaignId || "").trim();
      if (!id) return;
      contentBlocksSnapshotCache.delete(id);
      try {
        if (window.__gemContentBlocksSnapshots) {
          delete window.__gemContentBlocksSnapshots[id];
        }
      } catch (_) {}
    };

    window.gemWaitForContentBlocksSnapshot = function gemWaitForContentBlocksSnapshot(
      campaignId,
      timeoutMs
    ) {
      const id = String(campaignId || "").trim();
      const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 5000;
      if (!id) return Promise.resolve(null);

      const cached = contentBlocksSnapshotCache.get(id);
      if (cached) return Promise.resolve(cached);

      return new Promise(function (resolve) {
        const deadline = Date.now() + timeout;

        function onMessage(event) {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.source !== CONTENT_BLOCKS_SNAPSHOT_CACHED_SOURCE) return;
          if (String(data.campaignId || "").trim() !== id) return;
          cleanup();
          resolve(data.snapshot || contentBlocksSnapshotCache.get(id) || null);
        }

        function cleanup() {
          window.removeEventListener("message", onMessage);
          clearInterval(pollTimer);
        }

        const pollTimer = setInterval(function () {
          const snapshot = contentBlocksSnapshotCache.get(id);
          if (snapshot) {
            cleanup();
            resolve(snapshot);
            return;
          }
          if (Date.now() >= deadline) {
            cleanup();
            resolve(null);
          }
        }, 100);

        window.addEventListener("message", onMessage);
      });
    };

    function buildLinksByLanguageFromSnapshot(snapshot, languageKeys) {
      const linksData = window.gemCampaignLinksData;
      if (!linksData) {
        return { ok: false, reason: "missing_links_extractor" };
      }

      const requested = Array.isArray(languageKeys)
        ? languageKeys.map(function (key) {
            return String(key || "").trim();
          }).filter(Boolean)
        : [];

      const campaign = snapshot && (snapshot.campaign || snapshot);
      const contents = campaign && campaign.contents;
      const resolvedKeys = requested.length
        ? linksData.resolveLanguageKeys(snapshot, requested)
        : Object.keys(contents || {});

      const linksByLanguage = {};
      const uniqueKeys = requested.length ? requested : resolvedKeys;

      uniqueKeys.forEach(function (requestedKey, index) {
        const resolved = linksData.resolveLanguageKeys(snapshot, [requestedKey]);
        const langKey = resolved[0] || resolvedKeys[index] || requestedKey;
        linksByLanguage[requestedKey] = linksData.extractLinksForLanguage(snapshot, langKey);
      });

      return { ok: true, linksByLanguage: linksByLanguage };
    }

    function resolveLinksResult(snapshot, languageKeys) {
      if (!snapshot || typeof snapshot !== "object") {
        return { ok: false, reason: "cache_miss", error: "No cached campaign snapshot available." };
      }

      const linksResult = buildLinksByLanguageFromSnapshot(snapshot, languageKeys);
      if (!linksResult.ok) return linksResult;

      const campaign = snapshot.campaign || snapshot;
      return {
        ok: true,
        linksByLanguage: linksResult.linksByLanguage,
        campaign: campaign,
      };
    }

    function fetchContentBlocksSnapshotViaContentScript(campaignId, sessionId) {
      const integrations = ["content-blocks", "contentBlocks", "email-campaign-list", ""];

      function tryIntegration(index) {
        if (index >= integrations.length) {
          return Promise.resolve({ ok: false, reason: "no_auth_token" });
        }

        const integration = integrations[index];
        return window
          .gemFetchGserviceToken(sessionId, integration || undefined)
          .then(function (token) {
            if (!token) return tryIntegration(index + 1);

            const bareToken = String(token).replace(/^Bearer\s+/i, "");
            const url =
              "https://content-blocks.gservice.emarsys.net/api/handshake/token/campaigns/" +
              encodeURIComponent(campaignId);

            console.log("[Gem][Auth] content-blocks snapshot: content-script fetch", url);

            return fetch(url, {
              method: "GET",
              headers: {
                accept: "application/json, text/plain, */*",
                authorization: "Bearer " + bareToken,
                "x-auth": bareToken,
              },
            })
              .then(function (res) {
                return res.text().then(function (text) {
                  let data = null;
                  try {
                    data = JSON.parse(text);
                  } catch (_) {}

                  if (!res.ok) {
                    return {
                      ok: false,
                      reason: "api_error",
                      status: res.status,
                      error: "HTTP " + res.status,
                      data: data,
                    };
                  }

                  return { ok: true, snapshot: data };
                });
              })
              .catch(function (err) {
                return {
                  ok: false,
                  reason: "fetch_error",
                  error: err && err.message ? err.message : String(err),
                };
              });
          });
      }

      return tryIntegration(0);
    }

    function injectCampaignPageScript(scriptId, filename) {
      const existing = document.getElementById(scriptId);
      if (existing) return;

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = chrome.runtime.getURL(filename);
      script.async = false;
      (document.documentElement || document.head || document.body).appendChild(script);
    }

    const CONTENT_BLOCKS_REQUEST_SOURCE = "gem-content-blocks-snapshot-request";
    const CONTENT_BLOCKS_RESPONSE_SOURCE = "gem-content-blocks-snapshot-response";
    const CONTENT_BLOCKS_READY_SOURCE = "gem-content-blocks-bridge-ready";
    let contentBlocksBridgeReadyPromise = null;

    function isContentBlocksFetchBridgeReady() {
      return !!(
        document.documentElement
        && document.documentElement.getAttribute(CONTENT_BLOCKS_BRIDGE_READY_ATTR) === "1"
      );
    }

    function ensureContentBlocksFetchBridge() {
      if (isContentBlocksFetchBridgeReady()) {
        return Promise.resolve();
      }

      if (contentBlocksBridgeReadyPromise) {
        return contentBlocksBridgeReadyPromise;
      }

      contentBlocksBridgeReadyPromise = new Promise(function (resolve) {
        let settled = false;

        function finish() {
          if (settled) return;
          settled = true;
          domObserver.disconnect();
          clearInterval(pollTimer);
          clearTimeout(timeoutTimer);
          window.removeEventListener("message", onReadyMessage);
          resolve();
        }

        function checkReady() {
          if (isContentBlocksFetchBridgeReady()) {
            finish();
          }
        }

        function onReadyMessage(event) {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.source !== CONTENT_BLOCKS_READY_SOURCE || !data.ready) return;
          finish();
        }

        window.addEventListener("message", onReadyMessage);

        const domObserver = new MutationObserver(checkReady);
        if (document.documentElement) {
          domObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [CONTENT_BLOCKS_BRIDGE_READY_ATTR],
          });
        }

        const pollTimer = setInterval(checkReady, 50);
        const timeoutTimer = setTimeout(function () {
          if (!isContentBlocksFetchBridgeReady()) {
            console.error("[Gem][Auth] content-blocks page bridge did not become ready in time.");
          }
          finish();
        }, 10000);

        const existingBridge = document.getElementById("gem-content-blocks-fetch-bridge");
        const existingLinksData = document.getElementById("gem-campaign-links-data-page");

        if (!existingLinksData) {
          const linksScript = document.createElement("script");
          linksScript.id = "gem-campaign-links-data-page";
          linksScript.src = chrome.runtime.getURL("campaign-links-data.js");
          linksScript.async = false;
          (document.documentElement || document.head || document.body).appendChild(linksScript);
        }

        if (!existingBridge) {
          const script = document.createElement("script");
          script.id = "gem-content-blocks-fetch-bridge";
          script.src = chrome.runtime.getURL("content-blocks-fetch-bridge.js");
          script.async = false;
          script.addEventListener("load", checkReady, { once: true });
          script.addEventListener("error", function () {
            console.error("[Gem][Auth] content-blocks page bridge script failed to load.");
            finish();
          }, { once: true });
          (document.documentElement || document.head || document.body).appendChild(script);
        } else {
          checkReady();
        }
      });

      return contentBlocksBridgeReadyPromise;
    }

    function fetchContentBlocksLinks(campaignId, sessionId, languageKeys, options) {
      const id = String(campaignId || "").trim();
      const sid = String(sessionId || "").trim();
      const forceRefresh = !!(options && options.forceRefresh);

      injectCampaignPageScript("gem-draft-data-script", "campaign-draft-data.js");

      if (forceRefresh) {
        window.gemClearCachedContentBlocksSnapshot(id);
        return fetchContentBlocksSnapshotViaContentScript(id, sid).then(function (fetchResult) {
          if (fetchResult.ok) {
            if (fetchResult.snapshot) {
              rememberContentBlocksSnapshot(id, fetchResult.snapshot);
            }
            return resolveLinksResult(fetchResult.snapshot, languageKeys);
          }

          return window.gemWaitForContentBlocksSnapshot(id, 3000).then(function (snapshot) {
            if (snapshot) {
              return resolveLinksResult(snapshot, languageKeys);
            }
            return fetchResult;
          });
        });
      }

      function readCachedSnapshot() {
        return window.gemGetCachedContentBlocksSnapshot(id);
      }

      function waitForSnapshot() {
        const cached = readCachedSnapshot();
        if (cached) return Promise.resolve(cached);
        return window.gemWaitForContentBlocksSnapshot(id, 2000);
      }

      return waitForSnapshot().then(function (snapshot) {
        if (snapshot) {
          const cachedResult = resolveLinksResult(snapshot, languageKeys);
          if (cachedResult.ok) {
            console.log("[Gem][Auth] content-blocks snapshot: using intercepted cache for campaign", id);
            return cachedResult;
          }
        }

        return fetchContentBlocksSnapshotViaContentScript(id, sid).then(function (fetchResult) {
          if (!fetchResult.ok) return fetchResult;

          if (fetchResult.snapshot) {
            rememberContentBlocksSnapshot(id, fetchResult.snapshot);
          }

          return resolveLinksResult(fetchResult.snapshot, languageKeys);
        });
      });
    }

    /**
     * Fetches link rows for a campaign from intercepted snapshots, with a
     * content-script gservice fetch fallback.
     *
     * @param {string|number} campaignId
     * @param {string} sessionId
     * @param {string} [existingToken] - ignored
     * @param {string[]} [languageKeys] - language keys to extract links for
     * @param {{ forceRefresh?: boolean }} [options] - force a fresh handshake fetch
     * @returns {Promise<{ok: boolean, linksByLanguage?: object, campaign?: object, reason?: string}>}
     */
    window.gemFetchContentBlocksSnapshot = function gemFetchContentBlocksSnapshot(
      campaignId,
      sessionId,
      existingToken,
      languageKeys,
      options
    ) {
      const id = String(campaignId || "").trim();
      const sid = String(sessionId || "").trim();
      if (!id || !sid) {
        return Promise.resolve({ ok: false, reason: "missing_campaign_or_session" });
      }

      return fetchContentBlocksLinks(id, sid, languageKeys, options);
    };

    window.gemEnsureContentBlocksFetchBridge = ensureContentBlocksFetchBridge;

    (function preloadCampaignInterceptorsOnEditor() {
      try {
        if (!/contentBlocks(?:\/|%2F)campaign/i.test(window.location.href)) return;
        const start = function () {
          injectCampaignPageScript("gem-draft-data-script", "campaign-draft-data.js");
        };
        if (document.documentElement) {
          start();
        } else {
          document.addEventListener("DOMContentLoaded", start, { once: true });
        }
      } catch (_) {}
    })();
  } catch (_) {}
})();
