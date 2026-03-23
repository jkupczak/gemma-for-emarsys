// campaign-draft-data-loader.js
// Content script that injects the page-level draft interceptor and persists
// captured campaign block data to chrome.storage.local.
(function () {
  const DRAFT_KEY_PREFIX = 'gemDraft_';
  const MAX_ENTRIES = 100;
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function injectPageScript() {
    const existing = document.getElementById('gem-draft-data-script');
    if (existing) return;

    const s = document.createElement('script');
    s.id = 'gem-draft-data-script';
    s.src = chrome.runtime.getURL('campaign-draft-data.js');
    s.async = false;
    (document.documentElement || document.head || document.body).appendChild(s);
  }

  function pruneOldEntries() {
    chrome.storage.local.get(null, (all) => {
      const now = Date.now();
      const draftKeys = Object.keys(all).filter((k) => k.startsWith(DRAFT_KEY_PREFIX));
      const toRemove = [];

      // Pass 1: remove anything older than 30 days
      const surviving = [];
      for (const key of draftKeys) {
        const entry = all[key];
        const age = now - (entry && entry.saved_at || 0);
        if (age > MAX_AGE_MS) {
          toRemove.push(key);
        } else {
          surviving.push({ key, saved_at: entry.saved_at || 0 });
        }
      }

      // Pass 2: if still over the cap, drop the oldest
      if (surviving.length > MAX_ENTRIES) {
        surviving.sort((a, b) => a.saved_at - b.saved_at);
        const excess = surviving.length - MAX_ENTRIES;
        for (let i = 0; i < excess; i++) {
          toRemove.push(surviving[i].key);
        }
      }

      if (toRemove.length > 0) {
        chrome.storage.local.remove(toRemove, () => {
          console.log('[Gem][DraftData] Pruned', toRemove.length, 'old draft entries.');
        });
      }
    });
  }

  injectPageScript();

  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'gem-draft-saved') return;

    try {
      const { suiteCampaignId, updatedAt, selectedLanguage, blocksByLanguage } = e.data;
      if (!suiteCampaignId || !blocksByLanguage) return;

      const storageKey = DRAFT_KEY_PREFIX + suiteCampaignId;
      const entry = {
        updated_at: updatedAt,
        saved_at: Date.now(),
        contents: blocksByLanguage
      };

      chrome.storage.local.set({ [storageKey]: entry }, () => {
        console.log(
          '[Gem][DraftData] Stored draft for suite_campaign_id:', suiteCampaignId,
          '| selected language:', selectedLanguage,
          '| languages saved:', Object.keys(blocksByLanguage),
          '| updated_at:', updatedAt
        );
        pruneOldEntries();
      });
    } catch (_) {}
  });
})();
