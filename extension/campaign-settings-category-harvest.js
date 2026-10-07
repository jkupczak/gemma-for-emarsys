(function () {
  const LOG = '[Gem][CampaignCategoryHarvest]';

  function decodeLabelHtml(text) {
    const el = document.createElement('textarea');
    el.innerHTML = String(text || '');
    return el.value.replace(/\u00a0/g, ' ').trim();
  }

  function parseSelect2Results(root) {
    if (!root) return [];
    const labels = root.querySelectorAll('li.select2-result-selectable .select2-result-label');
    const names = [];
    labels.forEach((node) => {
      const name = decodeLabelHtml(node.textContent || '');
      if (!name) return;
      if (name === 'No category') return;
      names.push(name);
    });
    return names;
  }

  function syncCatalogFromSelect2(dropEl) {
    const cat = window.gemCampaignCategoryCatalog;
    if (!cat || typeof cat.replaceCatalog !== 'function') return;
    const names = parseSelect2Results(dropEl);
    if (names.length < 2) return;
    const unique = [...new Set(names)];
    cat.replaceCatalog(window.location.origin, unique);
    console.log(LOG, 'Synced catalog from select2:', unique.length, 'categories');
    try {
      window.dispatchEvent(new CustomEvent('gem:campaign-category-catalog-updated'));
    } catch (_) {}
  }

  let lastSyncCount = 0;
  let debounceTimer = null;

  function scheduleSyncFromDrop(dropEl) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const count = dropEl.querySelectorAll('li.select2-result-selectable').length;
      if (count <= 1 || count === lastSyncCount) return;
      lastSyncCount = count;
      syncCatalogFromSelect2(dropEl);
    }, 120);
  }

  function isCampaignSettingsPage() {
    try {
      const url = new URL(window.location.href);
      if (!(url.pathname || '').includes('campaignmanager.php')) return false;
      if ((url.searchParams.get('action') || '').toLowerCase() !== 'details') return false;
      const step = (url.searchParams.get('step') || '').toLowerCase();
      return step === 'camp3';
    } catch (_) {
      return false;
    }
  }

  if (!isCampaignSettingsPage()) return;

  console.log(LOG, 'Watching select2 category dropdown on campaign settings page');

  const observer = new MutationObserver(() => {
    const drop = document.getElementById('select2-drop');
    if (!drop) return;
    const visible =
      drop.classList.contains('select2-drop-active') ||
      (drop.style && drop.style.display && drop.style.display !== 'none');
    if (!visible) return;
    scheduleSyncFromDrop(drop);
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
})();
