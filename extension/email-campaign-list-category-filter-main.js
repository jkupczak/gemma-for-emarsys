// MAIN world: inject Gemma category filter on email campaign list (same DOM realm as the datagrid).
(function initGemEmailCampaignListCategoryFilterMain() {
  if (window.__gemEmailCampaignListCategoryFilterMain) return;
  window.__gemEmailCampaignListCategoryFilterMain = true;

  const LOG = '[Gem][CampaignListCategoryFilter][MAIN]';
  const ANY_LABEL = 'Any category';
  const LOADING_LABEL = 'Loading categories…';
  const WRAP_CLASS = 'gem-campaign-list-category-filter';
  const TRIGGER_CLASS = 'gem-campaign-list-category-trigger';
  const PANEL_CLASS = 'gem-campaign-list-category-panel';
  const SEARCH_CLASS = 'gem-campaign-list-category-search';
  const VALUE_CLASS = 'gem-campaign-list-category-value';
  const LIST_CLASS = 'gem-campaign-list-category-list';
  const MAIN_DATAGRID_ID = 'main-datagrid';
  const LAUNCH_DATAGRID_ID = 'launch-monitoring-datagrid';
  const FILTER_PANEL = '.e-datagrid__advanced_filters';
  const LIST_ROOT_ID = 'email-campaign-list';
  const MAX_LIST_RESULTS = 80;

  const filterBadgeState = { applying: false, nativeCount: 0 };

  if (
    typeof window.gemIsEmailCampaignListRoute === 'function'
      ? !window.gemIsEmailCampaignListRoute()
      : !/emailcampaignlist/i.test(String(window.location.href || ''))
  ) {
    return;
  }

  function getCatalog() {
    return window.gemCampaignCategoryCatalog;
  }

  function isCatalogReadyForUi() {
    const cat = getCatalog();
    if (!cat) return false;
    if (typeof cat.isCatalogReady === 'function') {
      return cat.isCatalogReady(window.location.origin);
    }
    return cat.getCategoryOptions(window.location.origin).length > 0;
  }

  function updateComboboxLoadingState(wrap) {
    if (!wrap) return;
    const trigger = wrap.querySelector(`.${TRIGGER_CLASS}`);
    if (!trigger) return;
    const ready = isCatalogReadyForUi();
    trigger.disabled = !ready;
    wrap.classList.toggle('gem-campaign-list-category-loading', !ready);
    if (!ready) {
      closeCategoryDropdown(wrap);
      updateTriggerDisplay(wrap, { loading: true });
    } else {
      updateTriggerDisplay(wrap);
    }
  }

  function queryAllIncludingShadow(selector, root) {
    const out = [];
    const seen = new Set();
    function collect(start) {
      if (!start) return;
      try {
        start.querySelectorAll(selector).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        });
      } catch (_) {}
      start.querySelectorAll('*').forEach((node) => {
        if (node.shadowRoot) collect(node.shadowRoot);
      });
    }
    collect(root || document);
    return out;
  }

  function getNearestDatagridId(node) {
    let n = node;
    while (n) {
      if (n.nodeType === Node.ELEMENT_NODE && n.id) {
        if (n.id === MAIN_DATAGRID_ID) return MAIN_DATAGRID_ID;
        if (n.id === LAUNCH_DATAGRID_ID) return LAUNCH_DATAGRID_ID;
      }
      const parent = n.parentElement || n.parentNode;
      if (parent) {
        n = parent;
        continue;
      }
      const root = typeof n.getRootNode === 'function' ? n.getRootNode() : null;
      if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host) {
        n = root.host;
        continue;
      }
      break;
    }
    return '';
  }

  function getMainDatagrid() {
    return document.getElementById(MAIN_DATAGRID_ID);
  }

  function getListSearchRoots() {
    const roots = [];
    const main = getMainDatagrid();
    if (main) roots.push(main);
    const list = document.getElementById(LIST_ROOT_ID);
    if (list && roots.indexOf(list) === -1) roots.push(list);
    if (!roots.length) roots.push(document.documentElement);
    return roots;
  }

  function isMainDatagridPanel(panel) {
    if (!panel) return false;
    const dg = getNearestDatagridId(panel);
    if (dg === LAUNCH_DATAGRID_ID) return false;
    if (dg === MAIN_DATAGRID_ID) return true;
    const main = getMainDatagrid();
    if (!main) return true;
    return queryAllIncludingShadow(FILTER_PANEL, main).indexOf(panel) !== -1;
  }

  function getMainFilterPanels() {
    const panels = [];
    const seen = new Set();
    getListSearchRoots().forEach((root) => {
      queryAllIncludingShadow(FILTER_PANEL, root).forEach((panel) => {
        if (seen.has(panel)) return;
        if (!isMainDatagridPanel(panel)) return;
        seen.add(panel);
        panels.push(panel);
      });
    });
    return panels;
  }

  function getMainFilterPanel() {
    const panels = getMainFilterPanels();
    if (!panels.length) return null;
    return panels.find((p) => !p.classList.contains('e-hidden')) || panels[0];
  }

  function isCategoryFilterLabel(labelEl) {
    const text = (labelEl && labelEl.textContent ? labelEl.textContent : '')
      .replace(/\s+/g, ' ')
      .trim();
    return /^category(\s*\(via gemma\))?$/i.test(text);
  }

  function findCategoryFilterRow() {
    const panels = getMainFilterPanels();
    for (let p = 0; p < panels.length; p++) {
      const rows = panels[p].querySelectorAll('.e-datagrid__filter');
      for (let i = 0; i < rows.length; i++) {
        const label = rows[i].querySelector('.e-datagrid__filter_label label');
        if (isCategoryFilterLabel(label)) return rows[i];
      }
    }
    return null;
  }

  function getCategoryCombobox(row) {
    const scope = row || findCategoryFilterRow();
    return scope ? scope.querySelector(`.${WRAP_CLASS}`) : null;
  }

  /** True only when the native Emarsys control is disabled — we never replace a working native select. */
  function isNativeCategoryDisabled(row) {
    if (!row) return false;
    const select = row.querySelector('e-select');
    if (!select) return false;
    if (select.hasAttribute('disabled')) return true;
    return !!row.querySelector('.e-selectnew-disabled, [aria-disabled="true"]');
  }

  function applyGemmaCategoryLabel(row) {
    const labelEl = row && row.querySelector('.e-datagrid__filter_label label');
    if (!labelEl || labelEl.classList.contains('gem-campaign-list-category-label')) return;

    labelEl.classList.add('gem-campaign-list-category-label');
    labelEl.textContent = '';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    icon.setAttribute('viewBox', '0 -960 960 960');
    icon.setAttribute('class', 'gem-campaign-list-category-label-icon');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M480-120 80-600l120-240h560l120 240-400 480Zm-95-520h190l-60-120h-70l-60 120Zm55 347v-267H218l222 267Zm80 0 222-267H520v267Zm144-347h106l-60-120H604l60 120Zm-474 0h106l60-120H250l-60 120Z'
    );
    icon.appendChild(path);

    labelEl.appendChild(icon);
    labelEl.appendChild(document.createTextNode('Category (via Gemma)'));
  }

  function hideNativeCategoryControl(row) {
    const select = row.querySelector('e-select');
    if (select) select.classList.add('gem-campaign-list-category-native-hidden');
  }

  function normalizeQuery(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightMatchHtml(label, query) {
    const safe = escapeHtml(label);
    const q = normalizeQuery(query);
    if (!q) return safe;
    const lower = normalizeQuery(label);
    const idx = lower.indexOf(q);
    if (idx === -1) return safe;
    const before = escapeHtml(label.slice(0, idx));
    const match = escapeHtml(label.slice(idx, idx + q.length));
    const after = escapeHtml(label.slice(idx + q.length));
    return `${before}<span class="gem-campaign-list-category-match">${match}</span>${after}`;
  }

  function updateTriggerDisplay(wrap, { loading } = {}) {
    const valueEl = wrap && wrap.querySelector(`.${VALUE_CLASS}`);
    const trigger = wrap && wrap.querySelector(`.${TRIGGER_CLASS}`);
    if (!valueEl || !trigger) return;
    if (loading) {
      valueEl.textContent = LOADING_LABEL;
      valueEl.classList.add('is-placeholder');
      return;
    }
    const resolved = getComboboxValue(wrap);
    if (resolved) {
      valueEl.textContent = resolved;
      valueEl.classList.remove('is-placeholder');
      trigger.setAttribute('aria-label', `Category (via Gemma): ${resolved}`);
    } else {
      valueEl.textContent = ANY_LABEL;
      valueEl.classList.add('is-placeholder');
      trigger.setAttribute('aria-label', 'Category (via Gemma)');
    }
  }

  function closeCategoryDropdown(wrap) {
    if (!wrap) return;
    wrap.classList.remove('is-open');
    const trigger = wrap.querySelector(`.${TRIGGER_CLASS}`);
    const search = wrap.querySelector(`.${SEARCH_CLASS}`);
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (search) search.value = '';
    const list = wrap.querySelector(`.${LIST_CLASS}`);
    if (list) {
      list.classList.remove('is-open');
      list.innerHTML = '';
    }
    if (wrap._gemDocCloseHandler) {
      document.removeEventListener('mousedown', wrap._gemDocCloseHandler, true);
      wrap._gemDocCloseHandler = null;
    }
  }

  function openCategoryDropdown(wrap) {
    if (!wrap || wrap.classList.contains('gem-campaign-list-category-loading')) return;
    const trigger = wrap.querySelector(`.${TRIGGER_CLASS}`);
    if (!trigger || trigger.disabled) return;
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    renderComboboxOptions(wrap, '');
    const search = wrap.querySelector(`.${SEARCH_CLASS}`);
    if (search) {
      search.value = '';
      setTimeout(() => search.focus(), 0);
    }
    if (!wrap._gemDocCloseHandler) {
      wrap._gemDocCloseHandler = (event) => {
        if (wrap.contains(event.target)) return;
        closeCategoryDropdown(wrap);
      };
      document.addEventListener('mousedown', wrap._gemDocCloseHandler, true);
    }
  }

  function getComboboxNames(wrap) {
    if (!wrap || !wrap._gemCategoryNames) return [];
    return wrap._gemCategoryNames;
  }

  function setComboboxNames(wrap, names) {
    if (!wrap) return;
    wrap._gemCategoryNames = names.slice();
  }

  function getComboboxValue(wrap) {
    return wrap && wrap._gemCategoryValue ? wrap._gemCategoryValue : '';
  }

  function setComboboxDisplay(wrap, value) {
    if (!wrap) return;
    const names = getComboboxNames(wrap);
    const name = String(value || '').trim();
    const resolved = name && names.includes(name) ? name : '';
    wrap._gemCategoryValue = resolved;
    updateTriggerDisplay(wrap);
    closeCategoryDropdown(wrap);
  }

  function renderComboboxOptions(wrap, query) {
    const list = wrap.querySelector(`.${LIST_CLASS}`);
    const search = wrap.querySelector(`.${SEARCH_CLASS}`);
    if (!list || !search) return;

    const names = getComboboxNames(wrap);
    const q = normalizeQuery(query != null ? query : search.value);
    let matches = names;
    if (q) {
      matches = names.filter((name) => normalizeQuery(name).includes(q));
    }
    matches = matches.slice(0, MAX_LIST_RESULTS);

    list.innerHTML = '';
    if (!q) {
      const anyBtn = document.createElement('button');
      anyBtn.type = 'button';
      anyBtn.className = 'gem-campaign-list-category-option';
      anyBtn.setAttribute('role', 'option');
      anyBtn.textContent = ANY_LABEL;
      anyBtn.dataset.value = '';
      list.appendChild(anyBtn);
    }
    matches.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gem-campaign-list-category-option';
      btn.setAttribute('role', 'option');
      btn.innerHTML = highlightMatchHtml(name, q);
      btn.dataset.value = name;
      list.appendChild(btn);
    });

    if (!list.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'gem-campaign-list-category-empty';
      empty.textContent = 'No matching categories';
      list.appendChild(empty);
    }

    list.classList.add('is-open');
  }

  function selectComboboxValue(wrap, value, { persistRemember, refetch } = {}) {
    if (!wrap) return;
    const prior = getComboboxValue(wrap);
    const names = getComboboxNames(wrap);
    const name = String(value || '').trim();
    const resolved = name && names.includes(name) ? name : '';
    if (resolved === prior) {
      closeCategoryDropdown(wrap);
      return;
    }
    setComboboxDisplay(wrap, resolved);
    applyCategorySelection(resolved, { persistRemember: persistRemember !== false });
    if (refetch !== false) nudgeCampaignListRefetch();
    scheduleFilterBadgeSync();
  }

  function buildCategoryCombobox(names, initialValue) {
    const wrap = document.createElement('div');
    wrap.className = WRAP_CLASS;
    setComboboxNames(wrap, names);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = `e-input e-input-large ${TRIGGER_CLASS}`;
    trigger.setAttribute('aria-label', 'Category (via Gemma)');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const valueEl = document.createElement('span');
    valueEl.className = VALUE_CLASS;
    const chevron = document.createElement('span');
    chevron.className = 'gem-campaign-list-category-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.appendChild(valueEl);
    trigger.appendChild(chevron);

    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;

    const searchWrap = document.createElement('div');
    searchWrap.className = 'gem-campaign-list-category-search-wrap';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'gem-campaign-list-category-search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');

    const search = document.createElement('input');
    search.type = 'search';
    search.className = `e-input e-input-large ${SEARCH_CLASS}`;
    search.setAttribute('aria-label', 'Search categories');
    search.setAttribute('autocomplete', 'off');
    search.placeholder = 'Search…';

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(search);

    const list = document.createElement('div');
    list.className = LIST_CLASS;
    list.setAttribute('role', 'listbox');

    panel.appendChild(searchWrap);
    panel.appendChild(list);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    const initial = String(initialValue || '').trim();
    wrap._gemCategoryValue =
      initial && names.includes(initial) ? initial : '';
    updateTriggerDisplay(wrap);

    trigger.addEventListener('click', () => {
      if (trigger.disabled) return;
      if (wrap.classList.contains('is-open')) {
        closeCategoryDropdown(wrap);
      } else {
        openCategoryDropdown(wrap);
      }
    });

    search.addEventListener('input', () => {
      renderComboboxOptions(wrap, search.value);
    });

    search.addEventListener('keydown', (event) => {
      const options = [...list.querySelectorAll('.gem-campaign-list-category-option')];
      let index = options.findIndex((el) => el.classList.contains('is-active'));
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCategoryDropdown(wrap);
        trigger.focus();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!options.length) return;
        index = index < options.length - 1 ? index + 1 : 0;
        options.forEach((el, i) => el.classList.toggle('is-active', i === index));
        options[index].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!options.length) return;
        index = index > 0 ? index - 1 : options.length - 1;
        options.forEach((el, i) => el.classList.toggle('is-active', i === index));
        options[index].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const active = list.querySelector('.gem-campaign-list-category-option.is-active');
        const pick = active || list.querySelector('.gem-campaign-list-category-option');
        if (pick) selectComboboxValue(wrap, pick.dataset.value || '');
        trigger.focus();
      }
    });

    list.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    list.addEventListener('click', (event) => {
      const opt = event.target.closest('.gem-campaign-list-category-option');
      if (!opt) return;
      selectComboboxValue(wrap, opt.dataset.value || '');
      trigger.focus();
    });

    updateComboboxLoadingState(wrap);
    return wrap;
  }

  function refreshComboboxOptions(wrap) {
    if (!wrap || !getCatalog()) return;
    const names = getCatalog().getCategoryOptions(window.location.origin);
    const current = getComboboxValue(wrap);
    const wasLoading = wrap.classList.contains('gem-campaign-list-category-loading');
    setComboboxNames(wrap, names);
    setComboboxDisplay(wrap, current && names.includes(current) ? current : '');
    updateComboboxLoadingState(wrap);
    if (wasLoading && isCatalogReadyForUi()) {
      const remembered =
        getCatalog().getRememberedCategoryFilter(window.location.origin) ||
        getCatalog().getActiveCategoryFilter();
      if (remembered && names.includes(remembered)) {
        setComboboxDisplay(wrap, remembered);
      }
    }
  }

  function resetCategoryCombobox({ persistRemember, refetch } = {}) {
    const wrap = getCategoryCombobox();
    if (wrap) setComboboxDisplay(wrap, '');
    applyCategorySelection('', { persistRemember: persistRemember !== false });
    if (refetch !== false) nudgeCampaignListRefetch();
    scheduleFilterBadgeSync();
  }

  function rememberSettingsEnabled() {
    const panel = getMainFilterPanel();
    const scope = panel || document;
    const sw = scope.querySelector('e-switch[test-name="rememberSettings"] input.e-switch__input');
    return !!(sw && sw.checked);
  }

  function applyCategorySelection(value, { persistRemember } = {}) {
    const cat = getCatalog();
    if (!cat) return;
    const name = cat.setActiveCategoryFilter(value);
    if (persistRemember && rememberSettingsEnabled()) {
      cat.setRememberedCategoryFilter(window.location.origin, name);
    }
  }

  function nudgeCampaignListRefetch() {
    const panel = getMainFilterPanel();
    if (!panel) return;
    const switchInput = panel.querySelector(
      'e-switch.e-datagrid__filter__switch input.e-switch__input'
    );
    if (switchInput) {
      const prior = !!switchInput.checked;
      switchInput.checked = !prior;
      switchInput.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => {
        switchInput.checked = prior;
        switchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }, 60);
      return;
    }
    const hidden = panel.querySelector('e-select:not([disabled]) input[type="hidden"]');
    if (hidden) hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getMainFilterBadge() {
    const main = getMainDatagrid();
    if (!main) return null;
    const badges = queryAllIncludingShadow('.e-datagrid__filter_button_badge', main);
    return badges.length ? badges[0] : null;
  }

  function readBadgeValue(badge) {
    if (!badge) return 0;
    const raw = badge.getAttribute('value');
    if (raw != null && String(raw).trim() !== '') {
      const n = parseInt(String(raw).trim(), 10);
      if (Number.isFinite(n)) return n;
    }
    const text = (badge.textContent || '').replace(/\s+/g, '').trim();
    const n = parseInt(text, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function writeBadgeValue(badge, count) {
    if (!badge) return;
    const next = Math.max(0, count);
    if (readBadgeValue(badge) === next) return;
    const value = String(next);
    filterBadgeState.applying = true;
    badge.setAttribute('value', value);
    badge.textContent = value;
    requestAnimationFrame(() => {
      filterBadgeState.applying = false;
    });
  }

  function isGemmaCategoryFilterActive() {
    const cat = getCatalog();
    return !!(cat && cat.getActiveCategoryFilter());
  }

  function syncFilterBadge() {
    if (filterBadgeState.applying) return;
    const badge = getMainFilterBadge();
    if (!badge) return;

    const displayed = readBadgeValue(badge);
    const categoryActive = isGemmaCategoryFilterActive();

    if (!categoryActive) {
      filterBadgeState.nativeCount = displayed;
      return;
    }

    const desired = filterBadgeState.nativeCount + 1;
    if (displayed === desired) return;

    if (displayed < desired) {
      filterBadgeState.nativeCount = displayed;
      writeBadgeValue(badge, filterBadgeState.nativeCount + 1);
      return;
    }

    if (displayed > desired) {
      filterBadgeState.nativeCount = displayed - 1;
      if (readBadgeValue(badge) !== filterBadgeState.nativeCount + 1) {
        writeBadgeValue(badge, filterBadgeState.nativeCount + 1);
      }
    }
  }

  let badgeSyncTimer = null;

  function scheduleFilterBadgeSync() {
    if (badgeSyncTimer) return;
    badgeSyncTimer = setTimeout(() => {
      badgeSyncTimer = null;
      syncFilterBadge();
    }, 80);
  }

  function wireNativeFilterChangeBadgeSync() {
    getMainFilterPanels().forEach((panel) => {
      if (panel._gemNativeFilterBadgeWired) return;
      panel._gemNativeFilterBadgeWired = true;
      panel.addEventListener(
        'change',
        () => {
          if (!isGemmaCategoryFilterActive()) return;
          const badge = getMainFilterBadge();
          if (!badge) return;
          const emarsysNative = readBadgeValue(badge);
          if (emarsysNative >= filterBadgeState.nativeCount) {
            filterBadgeState.nativeCount = emarsysNative;
          }
          scheduleFilterBadgeSync();
        },
        true
      );
    });
  }

  const badgeObserverTargets = new WeakSet();

  function attachFilterBadgeObserver() {
    const badge = getMainFilterBadge();
    if (!badge || badgeObserverTargets.has(badge)) return;
    badgeObserverTargets.add(badge);
    const observer = new MutationObserver(() => scheduleFilterBadgeSync());
    observer.observe(badge, {
      attributes: true,
      attributeFilter: ['value'],
      childList: true,
      subtree: true,
      characterData: true,
    });
    scheduleFilterBadgeSync();
  }

  function isClearFiltersButton(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    if (btn.querySelector('e-translation[key="components.datagrid.clearFiltersButton"]')) return true;
    return /clear\s+filters/i.test(btn.textContent || '');
  }

  function handleClearFiltersClick(event) {
    const path =
      event && typeof event.composedPath === 'function'
        ? event.composedPath()
        : [event && event.target].filter(Boolean);

    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
      if (getNearestDatagridId(node) !== MAIN_DATAGRID_ID) continue;
      const btn = node.closest && node.closest('button');
      if (!btn || !isClearFiltersButton(btn)) continue;
      resetCategoryCombobox({
        persistRemember: rememberSettingsEnabled(),
        refetch: true,
      });
      return;
    }
  }

  function needsCategoryReinject(row) {
    if (!row || !isNativeCategoryDisabled(row)) return false;
    return !row.querySelector(`.${WRAP_CLASS}`);
  }

  function shouldRestoreGemmaCategoryLabel(row) {
    if (!row || !isNativeCategoryDisabled(row)) return false;
    const label = row.querySelector('.e-datagrid__filter_label label');
    return !!(label && !label.classList.contains('gem-campaign-list-category-label'));
  }

  function injectGemmaCategoryFilter(row) {
    if (!row || row.querySelector(`.${WRAP_CLASS}`)) return false;
    if (!isNativeCategoryDisabled(row)) return false;

    const cat = getCatalog();
    const origin = window.location.origin;
    const names = cat ? cat.getCategoryOptions(origin) : [];
    const remembered =
      cat && typeof cat.getRememberedCategoryFilter === 'function'
        ? cat.getRememberedCategoryFilter(origin)
        : '';
    const active =
      cat && typeof cat.getActiveCategoryFilter === 'function'
        ? cat.getActiveCategoryFilter()
        : '';
    const initial = active || remembered || '';

    hideNativeCategoryControl(row);
    applyGemmaCategoryLabel(row);
    const combobox = buildCategoryCombobox(names, names.includes(initial) ? initial : '');

    const native = row.querySelector('e-select');
    if (native && native.parentElement === row) {
      native.insertAdjacentElement('afterend', combobox);
    } else {
      row.appendChild(combobox);
    }

    if (initial && names.includes(initial) && rememberSettingsEnabled()) {
      applyCategorySelection(initial, { persistRemember: false });
    }

    updateComboboxLoadingState(combobox);
    console.log(LOG, 'Injected Gemma category filter');
    scheduleFilterBadgeSync();
    return true;
  }

  function tryInject() {
    const row = findCategoryFilterRow();
    if (!row) return { ok: false, reason: 'category-row-not-found' };
    if (!getCatalog()) return { ok: false, reason: 'catalog-missing' };

    if (shouldRestoreGemmaCategoryLabel(row)) {
      applyGemmaCategoryLabel(row);
    }

    const reinject = needsCategoryReinject(row);
    const injected = reinject ? injectGemmaCategoryFilter(row) : false;
    const wrap = row.querySelector(`.${WRAP_CLASS}`);
    if (wrap) updateComboboxLoadingState(wrap);

    return {
      ok: injected || !!wrap,
      reason: injected ? 'injected' : reinject ? 'inject-skipped' : 'present',
      hasCombobox: !!wrap,
      needsReinject: reinject,
    };
  }

  function scheduleTryInjectBurst() {
    tryInject();
    [50, 200, 600, 1200].forEach((ms) => setTimeout(tryInject, ms));
  }

  let domMaintTimer = null;
  let domMaintLastRun = 0;
  const DOM_MAINT_MIN_MS = 200;
  let listRootObserver = null;

  function attachNewShadowRootObservers() {
    const root = document.getElementById(LIST_ROOT_ID) || getMainDatagrid();
    if (!root) return;
    root.querySelectorAll('*').forEach((node) => {
      if (!node.shadowRoot || node.shadowRoot._gemListShadowObserved) return;
      node.shadowRoot._gemListShadowObserved = true;
      const shadowMo = new MutationObserver(() => scheduleDomMaintenance());
      shadowMo.observe(node.shadowRoot, { childList: true, subtree: false });
    });
  }

  function runDomMaintenance() {
    domMaintLastRun = Date.now();
    ensureListRootObserver();
    attachNewShadowRootObservers();
    wireNativeFilterChangeBadgeSync();
    ensureFilterPanelObservers();
    attachFilterBadgeObserver();

    const row = findCategoryFilterRow();
    if (!row) return;

    if (needsCategoryReinject(row) || shouldRestoreGemmaCategoryLabel(row)) {
      tryInject();
      return;
    }

    const wrap = row.querySelector(`.${WRAP_CLASS}`);
    if (wrap) updateComboboxLoadingState(wrap);
  }

  function scheduleDomMaintenance() {
    const elapsed = Date.now() - domMaintLastRun;
    const delay = elapsed >= DOM_MAINT_MIN_MS ? 0 : DOM_MAINT_MIN_MS - elapsed;
    if (domMaintTimer) return;
    domMaintTimer = setTimeout(() => {
      domMaintTimer = null;
      runDomMaintenance();
    }, delay);
  }

  function ensureFilterPanelObservers() {
    getMainFilterPanels().forEach((panel) => {
      if (panel._gemCategoryPanelMaintObserved) return;
      panel._gemCategoryPanelMaintObserved = true;
      const observer = new MutationObserver(() => scheduleDomMaintenance());
      observer.observe(panel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    });
  }

  function ensureListRootObserver() {
    if (listRootObserver) return;
    const root = document.getElementById(LIST_ROOT_ID) || getMainDatagrid();
    if (!root) return;
    listRootObserver = new MutationObserver(() => scheduleDomMaintenance());
    listRootObserver.observe(root, { childList: true, subtree: false });
    root.querySelectorAll('*').forEach((node) => {
      if (!node.shadowRoot || node.shadowRoot._gemListShadowObserved) return;
      node.shadowRoot._gemListShadowObserved = true;
      const shadowMo = new MutationObserver(() => scheduleDomMaintenance());
      shadowMo.observe(node.shadowRoot, { childList: true, subtree: false });
    });
  }

  function ensureObservers() {
    ensureListRootObserver();
    ensureFilterPanelObservers();
    attachFilterBadgeObserver();
  }

  let booted = false;

  function boot() {
    if (booted) return true;
    if (!getCatalog()) {
      console.warn(LOG, 'Waiting for gemCampaignCategoryCatalog');
      return false;
    }
    booted = true;
    ensureObservers();
    wireNativeFilterChangeBadgeSync();
    scheduleTryInjectBurst();
    scheduleDomMaintenance();
    document.addEventListener('click', handleClearFiltersClick, true);
    document.addEventListener(
      'click',
      (event) => {
        if (isMainDatagridFilterToggle(event)) scheduleTryInjectBurst();
      },
      true
    );
    document.addEventListener('gem:campaign-category-catalog-updated', () => {
      tryInject();
      const wrap = getCategoryCombobox();
      refreshComboboxOptions(wrap);
    });
    scheduleFilterBadgeSync();
    return true;
  }

  function isMainDatagridFilterToggle(event) {
    const path =
      event && typeof event.composedPath === 'function'
        ? event.composedPath()
        : [event && event.target].filter(Boolean);
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
      if (getNearestDatagridId(node) !== MAIN_DATAGRID_ID) continue;
      if (node.closest && node.closest('.e-datagrid__filter_button')) return true;
    }
    return false;
  }

  window.gemDebugCampaignListCategoryFilter = function gemDebugCampaignListCategoryFilter() {
    const panels = getMainFilterPanels();
    const row = findCategoryFilterRow();
    const badge = getMainFilterBadge();
    return {
      page:
        typeof window.gemIsEmailCampaignListRoute === 'function'
          ? window.gemIsEmailCampaignListRoute()
          : true,
      catalogReady: isCatalogReadyForUi(),
      catalog: !!getCatalog(),
      mainDatagrid: !!getMainDatagrid(),
      panelCount: panels.length,
      categoryRow: !!row,
      nativeDisabled: row ? isNativeCategoryDisabled(row) : null,
      hasCombobox: !!document.querySelector(`.${WRAP_CLASS}`),
      activeCategory: getCatalog() ? getCatalog().getActiveCategoryFilter() : '',
      badge: badge ? readBadgeValue(badge) : null,
      badgeNativeEstimate: filterBadgeState.nativeCount,
      tryInject: tryInject(),
      categoryOptionCount: getCatalog()
        ? getCatalog().getCategoryOptions(window.location.origin).length
        : 0,
    };
  };

  function bootWhenReady() {
    if (boot()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (boot() || attempts > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWhenReady);
  } else {
    bootWhenReady();
  }
})();
