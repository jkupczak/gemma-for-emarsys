// email-campaign-list-fetch-patch.js — MAIN world: merge Gemma category filter into list API fetches.
(function initGemEmailCampaignListFetchPatch() {
  if (window.__gemEmailCampaignListFetchPatchInstalled) return;
  window.__gemEmailCampaignListFetchPatchInstalled = true;

  const cat = window.gemCampaignCategoryCatalog;
  if (!cat || typeof cat.isCampaignListCampaignsUrl !== 'function') {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function gemPatchedFetch(input, init) {
    let requestUrl = '';
    let requestInit = init;
    try {
      if (typeof input === 'string') {
        requestUrl = input;
      } else if (input && typeof input.url === 'string') {
        requestUrl = input.url;
      }
    } catch (_) {}

    if (cat.isCampaignListCampaignsUrl(requestUrl)) {
      const active = cat.getActiveCategoryFilter();
      const rewritten = cat.rewriteCampaignsListUrl(requestUrl, active);
      if (rewritten) {
        requestUrl = rewritten;
        if (typeof input === 'string') {
          input = rewritten;
        } else if (typeof Request !== 'undefined') {
          try {
            input = new Request(rewritten, input);
          } catch (_) {
            input = rewritten;
          }
        }
      }
    }

    const promise = nativeFetch(input, requestInit);
    if (!cat.isCampaignListCampaignsUrl(requestUrl)) {
      return promise;
    }

    return promise.then(function (response) {
      try {
        const clone = response.clone();
        clone
          .json()
          .then(function (data) {
            if (data && data.success) {
              const merged = cat.mergeFromApiResponse(window.location.origin, data);
              if (merged) {
                try {
                  document.dispatchEvent(new CustomEvent('gem:campaign-category-catalog-updated'));
                  window.dispatchEvent(new CustomEvent('gem:campaign-category-catalog-updated'));
                } catch (_) {}
              }
            }
          })
          .catch(function () {});
      } catch (_) {}
      return response;
    });
  };
})();
