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
        return new Promise(function (resolve) {
          try {
            console.log("[Gem][Auth] gemDuplicateCampaign: sending duplicateEmarsysCampaign to background");
            chrome.runtime.sendMessage(
              { action: "duplicateEmarsysCampaign", campaignId: String(campaignId), token },
              function (res) {
                if (chrome.runtime.lastError) {
                  console.warn("[Gem][Auth] gemDuplicateCampaign: runtime error:", chrome.runtime.lastError.message);
                  resolve({ ok: false, reason: "runtime_error" });
                  return;
                }
                console.log("[Gem][Auth] gemDuplicateCampaign: background response:", res);
                resolve(res && typeof res === "object" ? res : { ok: false, reason: "empty_response" });
              }
            );
          } catch (err) {
            console.warn("[Gem][Auth] gemDuplicateCampaign: sendMessage threw:", err && err.message ? err.message : String(err));
            resolve({ ok: false, reason: "send_message_error" });
          }
        });
      });
    };
  } catch (_) {}
})();
