// gem-campaign-category-catalog.js — per-origin email campaign category catalog (localStorage).
(function () {
  const STORAGE_PREFIX = 'gemEmailCampaignCategoriesV1:';
  const SESSION_FILTER_KEY = 'gemCampaignListCategoryFilterV1';
  const REMEMBER_FILTER_PREFIX = 'gemCampaignListCategoryRememberV1:';
  const SKIP_CATALOG_NAMES = new Set(['No category']);

  function storageKeyForOrigin(origin) {
    return STORAGE_PREFIX + String(origin || window.location.origin || '').trim();
  }

  function rememberKeyForOrigin(origin) {
    return REMEMBER_FILTER_PREFIX + String(origin || window.location.origin || '').trim();
  }

  function normalizeCategoryName(raw) {
    const text = String(raw || '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!text) return '';
    if (SKIP_CATALOG_NAMES.has(text)) return '';
    return text;
  }

  function sortNames(names) {
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function readStore(origin) {
    try {
      const raw = localStorage.getItem(storageKeyForOrigin(origin));
      if (!raw) return { catalog: [], catalogUpdatedAt: 0, seen: [] };
      const parsed = JSON.parse(raw);
      const catalog = Array.isArray(parsed.catalog)
        ? sortNames(parsed.catalog.map(normalizeCategoryName).filter(Boolean))
        : [];
      const seen = Array.isArray(parsed.seen)
        ? sortNames(parsed.seen.map(normalizeCategoryName).filter(Boolean))
        : [];
      return {
        catalog,
        catalogUpdatedAt: Number(parsed.catalogUpdatedAt) || 0,
        seen,
      };
    } catch (_) {
      return { catalog: [], catalogUpdatedAt: 0, seen: [] };
    }
  }

  function writeStore(origin, store) {
    try {
      const catalog = sortNames((store.catalog || []).map(normalizeCategoryName).filter(Boolean));
      const seen = sortNames((store.seen || []).map(normalizeCategoryName).filter(Boolean));
      localStorage.setItem(
        storageKeyForOrigin(origin),
        JSON.stringify({
          catalog,
          catalogUpdatedAt: Number(store.catalogUpdatedAt) || 0,
          seen,
        })
      );
    } catch (_) {}
  }

  function getCategoryOptions(origin) {
    const store = readStore(origin);
    if (store.catalog.length) return store.catalog;
    return store.seen;
  }

  function isCatalogReady(origin) {
    return getCategoryOptions(origin).length > 0;
  }

  function mergeNamesIntoCatalog(origin, names, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const store = readStore(origin);
    const merged = new Set(store.catalog);
    let added = false;
    (names || []).forEach((raw) => {
      const name = normalizeCategoryName(raw);
      if (!name) return;
      if (!merged.has(name)) added = true;
      merged.add(name);
    });
    if (!added) return false;
    writeStore(origin, {
      catalog: sortNames([...merged]),
      catalogUpdatedAt: opts.touchTimestamp ? Date.now() : store.catalogUpdatedAt,
      seen: store.seen,
    });
    return true;
  }

  function replaceCatalog(origin, names) {
    const catalog = sortNames(
      (names || []).map(normalizeCategoryName).filter(Boolean)
    );
    writeStore(origin, {
      catalog,
      catalogUpdatedAt: Date.now(),
      seen: [],
    });
    return catalog;
  }

  function mergeFromApiResponse(origin, apiData) {
    const content =
      apiData &&
      apiData.data &&
      Array.isArray(apiData.data.content)
        ? apiData.data.content
        : [];
    if (!content.length) return false;

    const store = readStore(origin);
    const catalog = new Set(store.catalog);
    const seen = new Set(store.seen);
    let changed = false;

    content.forEach((row) => {
      const name = normalizeCategoryName(row && row.category);
      if (!name) return;
      if (!seen.has(name)) {
        seen.add(name);
        changed = true;
      }
      if (!catalog.has(name)) {
        catalog.add(name);
        changed = true;
      }
    });

    if (!changed) return false;
    writeStore(origin, {
      catalog: sortNames([...catalog]),
      catalogUpdatedAt: store.catalog.length ? store.catalogUpdatedAt : Date.now(),
      seen: sortNames([...seen]),
    });
    return true;
  }

  function getActiveCategoryFilter() {
    try {
      return normalizeCategoryName(sessionStorage.getItem(SESSION_FILTER_KEY) || '');
    } catch (_) {
      return '';
    }
  }

  function setActiveCategoryFilter(value) {
    const name = normalizeCategoryName(value);
    try {
      if (name) sessionStorage.setItem(SESSION_FILTER_KEY, name);
      else sessionStorage.removeItem(SESSION_FILTER_KEY);
    } catch (_) {}
    return name;
  }

  function getRememberedCategoryFilter(origin) {
    try {
      return normalizeCategoryName(localStorage.getItem(rememberKeyForOrigin(origin)) || '');
    } catch (_) {
      return '';
    }
  }

  function setRememberedCategoryFilter(origin, value) {
    const name = normalizeCategoryName(value);
    try {
      if (name) localStorage.setItem(rememberKeyForOrigin(origin), name);
      else localStorage.removeItem(rememberKeyForOrigin(origin));
    } catch (_) {}
  }

  function mergeCategoryIntoFilterValues(filterValuesObj, categoryName) {
    const filters =
      filterValuesObj && typeof filterValuesObj === 'object' && !Array.isArray(filterValuesObj)
        ? { ...filterValuesObj }
        : {};
    const name = normalizeCategoryName(categoryName);
    if (name) {
      filters.category = { type: 'select', value: name };
    } else {
      delete filters.category;
    }
    return filters;
  }

  function rewriteCampaignsListUrl(rawUrl, categoryName) {
    const urlStr = String(rawUrl || '').trim();
    if (!urlStr) return urlStr;
    try {
      const url = new URL(urlStr, window.location.href);
      const filterRaw = url.searchParams.get('filterValues');
      let filters = {};
      if (filterRaw) {
        try {
          filters = JSON.parse(filterRaw);
        } catch (_) {
          filters = {};
        }
      }
      filters = mergeCategoryIntoFilterValues(filters, categoryName);
      url.searchParams.set('filterValues', JSON.stringify(filters));

      const pairs = [];
      url.searchParams.forEach((value, key) => {
        pairs.push([key, value]);
      });
      const query = pairs
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
    } catch (_) {
      return urlStr;
    }
  }

  function isCampaignListCampaignsUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ''), window.location.href);
      if (!/\.gservice\.emarsys\.net$/i.test(url.hostname)) return false;
      if (!/^\/api\/client\/campaigns\/?$/i.test(url.pathname)) return false;
      return url.searchParams.has('filterValues');
    } catch (_) {
      return false;
    }
  }

  const api = {
    STORAGE_PREFIX,
    SESSION_FILTER_KEY,
    storageKeyForOrigin,
    getCategoryOptions,
    isCatalogReady,
    mergeNamesIntoCatalog,
    replaceCatalog,
    mergeFromApiResponse,
    getActiveCategoryFilter,
    setActiveCategoryFilter,
    getRememberedCategoryFilter,
    setRememberedCategoryFilter,
    mergeCategoryIntoFilterValues,
    rewriteCampaignsListUrl,
    isCampaignListCampaignsUrl,
    normalizeCategoryName,
  };

  window.gemCampaignCategoryCatalog = api;

  function dispatchCatalogUpdated() {
    try {
      document.dispatchEvent(new CustomEvent('gem:campaign-category-catalog-updated'));
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('gem:campaign-category-catalog-updated'));
    } catch (_) {}
  }

  function namesFromCampaignCategoriesList(list) {
    if (!Array.isArray(list) || !list.length) return [];
    const names = [];
    list.forEach((entry) => {
      if (entry == null) return;
      if (typeof entry === 'string') {
        const name = normalizeCategoryName(entry);
        if (name) names.push(name);
        return;
      }
      if (typeof entry === 'object') {
        const name = normalizeCategoryName(
          entry.name || entry.label || entry.text || entry.title || entry.value
        );
        if (name) names.push(name);
      }
    });
    return sortNames([...new Set(names)]);
  }

  function readPageCampaignCategories() {
    try {
      const roots = [window.e, window.global && window.global.e];
      for (let i = 0; i < roots.length; i++) {
        const list =
          roots[i] &&
          roots[i].emailCampaignList &&
          roots[i].emailCampaignList.campaignCategories;
        const names = namesFromCampaignCategoriesList(list);
        if (names.length) return names;
      }
    } catch (_) {}
    return readCampaignCategoriesFromInlineScripts();
  }

  function readCampaignCategoriesFromInlineScripts() {
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || '';
        if (!text.includes('campaignCategories')) continue;
        const marker = 'campaignCategories';
        const idx = text.indexOf(marker);
        if (idx === -1) continue;
        const slice = text.slice(idx, idx + 120000);
        const arrayStart = slice.indexOf('[');
        if (arrayStart === -1) continue;
        let depth = 0;
        let end = -1;
        for (let j = arrayStart; j < slice.length; j++) {
          const ch = slice[j];
          if (ch === '[') depth += 1;
          else if (ch === ']') {
            depth -= 1;
            if (depth === 0) {
              end = j;
              break;
            }
          }
        }
        if (end === -1) continue;
        const jsonText = slice.slice(arrayStart, end + 1);
        try {
          const parsed = JSON.parse(jsonText);
          const names = namesFromCampaignCategoriesList(parsed);
          if (names.length) return names;
        } catch (_) {
          const names = [];
          const re = /"name"\s*:\s*"((?:\\.|[^"\\])*)"/g;
          let match;
          while ((match = re.exec(slice))) {
            const raw = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const name = normalizeCategoryName(raw);
            if (name) names.push(name);
          }
          if (names.length) return sortNames([...new Set(names)]);
        }
      }
    } catch (_) {}
    return [];
  }

  function isEmailCampaignListRoute() {
    if (typeof window.gemIsEmailCampaignListRoute === 'function') {
      return window.gemIsEmailCampaignListRoute();
    }
    try {
      const url = new URL(window.location.href);
      const route = decodeURIComponent(url.searchParams.get('r') || '').trim();
      return route.toLowerCase() === 'emailcampaignlist/index';
    } catch (_) {
      return /emailcampaignlist/i.test(String(window.location.href || ''));
    }
  }

  function harvestEmailCampaignListPageCategories() {
    if (!isEmailCampaignListRoute()) return false;
    const names = readPageCampaignCategories();
    if (names.length < 2) return false;

    const origin = window.location.origin;
    const store = readStore(origin);
    let changed = false;
    if (!store.catalog.length) {
      replaceCatalog(origin, names);
      changed = true;
    } else {
      changed = mergeNamesIntoCatalog(origin, names, { touchTimestamp: true });
    }
    if (changed) dispatchCatalogUpdated();
    return changed;
  }

  (function scheduleEmailCampaignListCategoryHarvest() {
    if (harvestEmailCampaignListPageCategories()) return;
    let attempts = 0;
    const maxAttempts = 150;
    const timer = setInterval(() => {
      attempts += 1;
      if (harvestEmailCampaignListPageCategories() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 200);
  })();
})();
