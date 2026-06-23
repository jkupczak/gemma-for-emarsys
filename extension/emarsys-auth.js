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
  } catch (_) {}
})();
