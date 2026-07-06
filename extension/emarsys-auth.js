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
  } catch (_) {}
})();
