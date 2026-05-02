// campaign-draft-data.js
// Page-level script that intercepts fetch and XHR responses to the Emarsys
// draft endpoint, extracts campaign block data per language, and relays it
// back to the content script via postMessage for storage.
(function () {
  const DRAFT_URL_PATTERN = /\/api\/multilanguage-campaigns\/[^/]+\/draft/;

  function getSelectedLanguage() {
    try {
      const selector = document.querySelector('vce-languages-selector');
      if (!selector) return null;
      const selected = selector.querySelector('e-select-option[selected="true"]');
      return selected ? selected.getAttribute('value') : null;
    } catch (_) {
      return null;
    }
  }

  // Only fields used from storage are _id and targeting.content.visibility
  // (see campaign-block-targeting.js applyTargeting). Omit bulky block keys.
  function slimBlockForDraftStorage(block) {
    if (!block || typeof block !== "object") return null;
    const id = block._id;
    if (id === undefined || id === null || String(id).trim() === "") return null;
    const out = { _id: id };
    if (block.targeting) {
      const visibility =
        block.targeting.content && block.targeting.content.visibility != null
          ? block.targeting.content.visibility
          : "";
      out.targeting = { content: { visibility } };
    }
    return out;
  }

  function extractBlocksByLanguage(contents) {
    const result = {};
    for (const lang of Object.keys(contents)) {
      const langEntry = contents[lang];
      if (langEntry && Array.isArray(langEntry.blocks)) {
        result[lang] = langEntry.blocks.map(slimBlockForDraftStorage).filter(Boolean);
      }
    }
    return result;
  }

  function handleDraftResponse(url, data) {
    try {
      if (!data || !data.campaign) return;
      const campaign = data.campaign;
      if (!campaign.contents || !campaign.suite_campaign_id) return;

      const suiteCampaignId = String(campaign.suite_campaign_id);
      const updatedAt = campaign.updated_at || null;
      const blocksByLanguage = extractBlocksByLanguage(campaign.contents);
      const selectedLanguage = getSelectedLanguage();

      console.log('[Gem][DraftData] Draft response captured — suite_campaign_id:', suiteCampaignId);

      window.postMessage({
        type: 'gem-draft-saved',
        suiteCampaignId,
        updatedAt,
        selectedLanguage,
        blocksByLanguage
      }, '*');
    } catch (_) {}
  }

  // --- Patch fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = (args[0] instanceof Request) ? args[0].url : String(args[0]);
      if (DRAFT_URL_PATTERN.test(url)) {
        response.clone().json()
          .then((data) => handleDraftResponse(url, data))
          .catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // --- Patch XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._gemDraftUrl = (typeof url === 'string') ? url : String(url);
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._gemDraftUrl && DRAFT_URL_PATTERN.test(this._gemDraftUrl)) {
      const url = this._gemDraftUrl;
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          handleDraftResponse(url, data);
        } catch (_) {}
      });
    }
    return originalSend.apply(this, args);
  };

  console.log('[Gem][DraftData] Fetch + XHR interceptor installed.');
})();
