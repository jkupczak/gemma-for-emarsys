// campaign-draft-data.js
// Page-level script that intercepts fetch and XHR responses to the Emarsys
// draft endpoint, extracts campaign block data per language, and relays it
// back to the content script via postMessage for storage.
(function () {
  const DRAFT_URL_PATTERN = /\/api\/multilanguage-campaigns\/[^/]+\/draft/;
  const HANDSHAKE_URL_PATTERN = /\/api\/handshake\/token\/campaigns\/([^/?#]+)/;

  window.__gemContentBlocksSnapshots = window.__gemContentBlocksSnapshots || {};
  window.__gemContentBlocksAuthToken = window.__gemContentBlocksAuthToken || '';

  function cacheCampaignSnapshot(campaignId, data) {
    const id = String(campaignId || '').trim();
    if (!id || !data) return;
    window.__gemContentBlocksSnapshots[id] = data;
    notifySnapshotCached(id, data);
  }

  function notifySnapshotCached(campaignId, data) {
    try {
      window.postMessage({
        source: 'gem-content-blocks-snapshot-cached',
        campaignId: String(campaignId),
        snapshot: data,
      }, '*');
    } catch (_) {}
  }

  function cacheSnapshotFromCampaignPayload(data) {
    try {
      if (!data || !data.campaign) return;
      const campaign = data.campaign;
      if (!campaign.contents) return;

      const suiteCampaignId = campaign.suite_campaign_id != null
        ? String(campaign.suite_campaign_id)
        : '';
      if (suiteCampaignId) {
        cacheCampaignSnapshot(suiteCampaignId, data);
      }
    } catch (_) {}
  }

  function cacheHandshakeResponse(url, data) {
    try {
      const match = String(url || '').match(HANDSHAKE_URL_PATTERN);
      if (!match) return;
      cacheCampaignSnapshot(match[1], data);
    } catch (_) {}
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
      const campaignId = campaign.id != null ? String(campaign.id) : '';
      const updatedAt = campaign.updated_at || null;
      const blocksByLanguage = extractBlocksByLanguage(campaign.contents);
      const selectedLanguage = getSelectedLanguage();

      console.log('[Gem][DraftData] Draft response captured — suite_campaign_id:', suiteCampaignId);

      cacheSnapshotFromCampaignPayload(data);

      window.postMessage({
        type: 'gem-draft-saved',
        suiteCampaignId,
        campaignId,
        updatedAt,
        selectedLanguage,
        blocksByLanguage
      }, '*');
    } catch (_) {}
  }

  // --- Patch fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = (args[0] instanceof Request) ? args[0].url : String(args[0]);

    if (HANDSHAKE_URL_PATTERN.test(url)) {
      const auth = readAuthHeaderFromFetchArgs(args);
      if (auth) {
        window.__gemContentBlocksAuthToken = auth;
      }
    }

    const response = await originalFetch.apply(this, args);
    try {
      if (DRAFT_URL_PATTERN.test(url)) {
        response.clone().json()
          .then((data) => handleDraftResponse(url, data))
          .catch(() => {});
      } else if (HANDSHAKE_URL_PATTERN.test(url)) {
        response.clone().json()
          .then((data) => cacheHandshakeResponse(url, data))
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
    this._gemRequestHeaders = {};
    return originalOpen.call(this, method, url, ...rest);
  };

  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this._gemRequestHeaders = this._gemRequestHeaders || {};
    this._gemRequestHeaders[String(name || '').toLowerCase()] = value;
    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this._gemDraftUrl || '';

    if (HANDSHAKE_URL_PATTERN.test(url)) {
      const auth = this._gemRequestHeaders && this._gemRequestHeaders.authorization;
      if (auth) {
        window.__gemContentBlocksAuthToken = String(auth).replace(/^Bearer\s+/i, '').trim();
      }

      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          cacheHandshakeResponse(url, data);
        } catch (_) {}
      });
    }

    if (url && DRAFT_URL_PATTERN.test(url)) {
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
