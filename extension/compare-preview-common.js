// compare-preview-common.js — shared settings, modal shell, column layout, and menus
(function () {
  const COMPARE_MODAL_ID = 'gem-compare-modal';
  const GEM_COMPARE_DESKTOP_WIDTH_KEY = 'gemCompareLanguagesDesktopWidth';
  const GEM_COMPARE_MOBILE_WIDTH_KEY = 'gemCompareLanguagesMobileWidth';
  const GEM_COMPARE_ZOOM_KEY = 'gemCompareLanguagesZoom';
  const GEM_COMPARE_PREVIEW_SORT_KEY = 'gemComparePreviewSortOrder';
  const GEM_COMPARE_PIN_ACTIVE_KEY = 'gemComparePinActivePreview';
  const DEFAULT_DESKTOP_WIDTH = 620;
  const DEFAULT_MOBILE_WIDTH = 414;
  const DEFAULT_ZOOM = '50';
  const DEFAULT_PREVIEW_SORT = 'asc';
  const DEFAULT_PIN_ACTIVE_EMAIL = true;
  const COMPARE_WIDTH_LIMITS = {
    desktop: { min: 200, max: 1200, fallback: DEFAULT_DESKTOP_WIDTH },
    mobile: { min: 200, max: 800, fallback: DEFAULT_MOBILE_WIDTH },
  };
  const PIN_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" class="gem-compare-languages-column__pin-icon" aria-hidden="true"><path d="m685-527 85 84v137H548v248L480 9l-68-67v-248H190v-137l85-84v-253h-41v-136h492v136h-41v253Zm-304 85h198l-30-29v-309H411v309l-30 29Zm99 0Z"/></svg>';

  let compareDeviceMode = 'desktop';
  let compareZoomLevel = DEFAULT_ZOOM;
  let compareWidthSettings = {
    desktop: DEFAULT_DESKTOP_WIDTH,
    mobile: DEFAULT_MOBILE_WIDTH,
  };
  let comparePreviewSortOrder = DEFAULT_PREVIEW_SORT;
  let compareSyncPinActiveEmail = DEFAULT_PIN_ACTIVE_EMAIL;
  let sessionPinnedEntryKey = null;
  let sessionPinnedMode = null;
  let compareSettingsListenerBound = false;
  let compareModalEscapeUnsub = null;
  const layoutRefreshHandlers = [];
  const compareModeHandlers = {
    languages: null,
    versions: null,
  };

  let openCompareColumnMenu = null;
  let compareColumnMenuListenersInstalled = false;

  function getCompareModal() {
    return document.getElementById(COMPARE_MODAL_ID);
  }

  function getCompareModePanel(modal, mode) {
    if (!modal || !mode) return null;
    return modal.querySelector(`[data-gem-compare-mode-panel="${mode}"]`);
  }

  function isCompareModePanelLoaded(modal, mode) {
    const panel = getCompareModePanel(modal, mode);
    return !!(panel && panel.dataset.gemCompareLoaded === 'true');
  }

  function setCompareModePanelLoaded(modal, mode, loaded) {
    const panel = getCompareModePanel(modal, mode);
    if (!panel) return;
    if (loaded) panel.dataset.gemCompareLoaded = 'true';
    else delete panel.dataset.gemCompareLoaded;
  }

  function registerCompareModeHandler(mode, handler) {
    if (mode === 'languages' || mode === 'versions') {
      compareModeHandlers[mode] = handler || null;
    }
  }

  function getCompareWidthLimits(mode) {
    return mode === 'mobile' ? COMPARE_WIDTH_LIMITS.mobile : COMPARE_WIDTH_LIMITS.desktop;
  }

  function normalizeCompareWidth(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function normalizeCompareWidthForDevice(value, mode) {
    const limits = getCompareWidthLimits(mode);
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return limits.fallback;
    return Math.min(limits.max, Math.max(limits.min, parsed));
  }

  function getActiveCompareWidthStorageKey(mode) {
    return (mode || compareDeviceMode) === 'mobile'
      ? GEM_COMPARE_MOBILE_WIDTH_KEY
      : GEM_COMPARE_DESKTOP_WIDTH_KEY;
  }

  function persistCompareWidthForDevice(mode, width) {
    const next = normalizeCompareWidthForDevice(width, mode);
    if (mode === 'mobile') compareWidthSettings.mobile = next;
    else compareWidthSettings.desktop = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [getActiveCompareWidthStorageKey(mode)]: next });
  }

  function applyActiveCompareWidth(modal, width, { persist } = {}) {
    const next = normalizeCompareWidthForDevice(width, compareDeviceMode);
    if (compareDeviceMode === 'mobile') compareWidthSettings.mobile = next;
    else compareWidthSettings.desktop = next;
    if (modal) modal.style.setProperty('--gem-compare-column-width', `${next}px`);
    if (persist) persistCompareWidthForDevice(compareDeviceMode, next);
    return next;
  }

  function applyCompareWidthSettings(settings) {
    compareWidthSettings = {
      desktop: normalizeCompareWidth(
        settings && settings[GEM_COMPARE_DESKTOP_WIDTH_KEY],
        DEFAULT_DESKTOP_WIDTH
      ),
      mobile: normalizeCompareWidth(
        settings && settings[GEM_COMPARE_MOBILE_WIDTH_KEY],
        DEFAULT_MOBILE_WIDTH
      ),
    };
  }

  function normalizeCompareZoom(value) {
    return String(value) === '100' ? '100' : DEFAULT_ZOOM;
  }

  function normalizeComparePreviewSort(value) {
    return String(value) === 'desc' ? 'desc' : DEFAULT_PREVIEW_SORT;
  }

  function normalizeCompareSyncPinActiveEmail(value) {
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return DEFAULT_PIN_ACTIVE_EMAIL;
  }

  function applyComparePreviewSettings(settings) {
    applyCompareWidthSettings(settings);
    compareZoomLevel = normalizeCompareZoom(settings && settings[GEM_COMPARE_ZOOM_KEY]);
    comparePreviewSortOrder = normalizeComparePreviewSort(
      settings && settings[GEM_COMPARE_PREVIEW_SORT_KEY]
    );
    compareSyncPinActiveEmail = normalizeCompareSyncPinActiveEmail(
      settings && settings[GEM_COMPARE_PIN_ACTIVE_KEY]
    );
  }

  function loadComparePreviewSettings(callback) {
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      applyComparePreviewSettings(null);
      if (callback) callback();
      return;
    }

    chrome.storage.sync.get({
      [GEM_COMPARE_DESKTOP_WIDTH_KEY]: DEFAULT_DESKTOP_WIDTH,
      [GEM_COMPARE_MOBILE_WIDTH_KEY]: DEFAULT_MOBILE_WIDTH,
      [GEM_COMPARE_ZOOM_KEY]: DEFAULT_ZOOM,
      [GEM_COMPARE_PREVIEW_SORT_KEY]: DEFAULT_PREVIEW_SORT,
      [GEM_COMPARE_PIN_ACTIVE_KEY]: DEFAULT_PIN_ACTIVE_EMAIL,
    }, (res) => {
      applyComparePreviewSettings(res || {});
      if (callback) callback();
    });
  }

  function persistComparePreviewSortOrder(order) {
    const next = normalizeComparePreviewSort(order);
    comparePreviewSortOrder = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [GEM_COMPARE_PREVIEW_SORT_KEY]: next });
  }

  function persistCompareSyncPinActiveEmail(enabled) {
    const next = !!enabled;
    compareSyncPinActiveEmail = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [GEM_COMPARE_PIN_ACTIVE_KEY]: next });
  }

  function persistCompareZoomLevel(level) {
    const next = normalizeCompareZoom(level);
    compareZoomLevel = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [GEM_COMPARE_ZOOM_KEY]: next });
  }

  function getActiveCompareColumnWidth() {
    return compareDeviceMode === 'mobile'
      ? compareWidthSettings.mobile
      : compareWidthSettings.desktop;
  }

  function resolvePinnedEntryKey(compareMode, activeEntryKey) {
    const activeKey = String(activeEntryKey || '').trim();
    const mode = String(compareMode || '').trim();
    if (sessionPinnedMode === mode && sessionPinnedEntryKey) {
      return sessionPinnedEntryKey;
    }
    if (compareSyncPinActiveEmail && activeKey) return activeKey;
    return null;
  }

  function pinCompareEntry(compareMode, entryKey, isActiveEntry, modal, onLayoutChange) {
    const key = String(entryKey || '').trim();
    const mode = String(compareMode || '').trim();
    if (!key || !mode) return;

    if (isActiveEntry) {
      sessionPinnedEntryKey = null;
      sessionPinnedMode = null;
      persistCompareSyncPinActiveEmail(true);
    } else {
      sessionPinnedEntryKey = key;
      sessionPinnedMode = mode;
    }

    if (onLayoutChange) onLayoutChange(modal);
  }

  function unpinCompareEntry(compareMode, modal, onLayoutChange) {
    const mode = String(compareMode || '').trim();
    if (sessionPinnedMode === mode) {
      sessionPinnedEntryKey = null;
      sessionPinnedMode = null;
    }
    persistCompareSyncPinActiveEmail(false);
    if (onLayoutChange) onLayoutChange(modal);
  }

  function registerLayoutRefreshHandler(handler) {
    if (typeof handler === 'function') layoutRefreshHandlers.push(handler);
  }

  function notifyLayoutRefresh() {
    const modal = getCompareModal();
    layoutRefreshHandlers.forEach((handler) => {
      try {
        handler(modal);
      } catch (_) {}
    });
  }

  function syncOpenCompareModalsUi() {
    const modal = getCompareModal();
    if (modal) syncCompareModalUi(modal);
  }

  function ensureComparePreviewSettingsListener() {
    if (compareSettingsListenerBound || !chrome || !chrome.storage || !chrome.storage.onChanged) return;
    compareSettingsListenerBound = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      const desktopChange = changes[GEM_COMPARE_DESKTOP_WIDTH_KEY];
      const mobileChange = changes[GEM_COMPARE_MOBILE_WIDTH_KEY];
      const zoomChange = changes[GEM_COMPARE_ZOOM_KEY];
      const sortChange = changes[GEM_COMPARE_PREVIEW_SORT_KEY];
      const pinChange = changes[GEM_COMPARE_PIN_ACTIVE_KEY];
      if (!desktopChange && !mobileChange && !zoomChange && !sortChange && !pinChange) return;

      applyComparePreviewSettings({
        [GEM_COMPARE_DESKTOP_WIDTH_KEY]: desktopChange
          ? desktopChange.newValue
          : compareWidthSettings.desktop,
        [GEM_COMPARE_MOBILE_WIDTH_KEY]: mobileChange
          ? mobileChange.newValue
          : compareWidthSettings.mobile,
        [GEM_COMPARE_ZOOM_KEY]: zoomChange ? zoomChange.newValue : compareZoomLevel,
        [GEM_COMPARE_PREVIEW_SORT_KEY]: sortChange
          ? sortChange.newValue
          : comparePreviewSortOrder,
        [GEM_COMPARE_PIN_ACTIVE_KEY]: pinChange
          ? pinChange.newValue
          : compareSyncPinActiveEmail,
      });

      syncOpenCompareModalsUi();
      if (sortChange || pinChange) notifyLayoutRefresh();
    });
  }

  function syncCompareZoomUi(modal) {
    if (!modal) return;
    modal.dataset.gemCompareZoom = compareZoomLevel;
    modal.querySelectorAll('[data-gem-compare-zoom]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-zoom') === compareZoomLevel;
      btn.classList.toggle('gem-compare-languages-modal__zoom-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function syncCompareLayoutControlsUi(modal) {
    if (!modal) return;
    const sortSelect = modal.querySelector('.gem-compare-languages-modal__sort-select');
    if (sortSelect) sortSelect.value = comparePreviewSortOrder;
  }

  function syncCompareDeviceWidthInput(modal) {
    if (!modal) return;
    const input = modal.querySelector('.gem-compare-languages-modal__width-input');
    if (!input) return;
    const limits = getCompareWidthLimits(compareDeviceMode);
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.value = String(getActiveCompareColumnWidth());
    input.setAttribute(
      'aria-label',
      `${compareDeviceMode === 'mobile' ? 'Mobile' : 'Desktop'} preview width in pixels`
    );
  }

  function syncCompareDeviceToggleUi(modal) {
    if (!modal) return;
    modal.dataset.gemCompareDevice = compareDeviceMode;
    modal.style.setProperty('--gem-compare-column-width', `${getActiveCompareColumnWidth()}px`);
    modal.querySelectorAll('[data-gem-compare-device]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-device') === compareDeviceMode;
      btn.classList.toggle('gem-compare-languages-modal__device-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    syncCompareDeviceWidthInput(modal);
  }

  function syncCompareModalUi(modal) {
    syncCompareLayoutControlsUi(modal);
    syncCompareDeviceToggleUi(modal);
    syncCompareZoomUi(modal);
    syncCompareModeToggleUi(modal);
  }

  function canShowCompareModeToggle() {
    return (
      typeof window.gemCanCompareLanguages === 'function'
      && typeof window.gemCanCompareVersions === 'function'
      && window.gemCanCompareLanguages()
      && window.gemCanCompareVersions()
    );
  }

  function syncCompareModeToggleUi(modal) {
    if (!modal) return;
    const group = modal.querySelector('.gem-compare-languages-modal__header-control-group--mode');
    const toggle = modal.querySelector('.gem-compare-languages-modal__mode-toggle');
    if (!group || !toggle) return;

    const show = canShowCompareModeToggle();
    group.hidden = !show;
    group.style.display = show ? '' : 'none';

    const mode = String(modal.dataset.gemCompareMode || '').trim();
    toggle.querySelectorAll('[data-gem-compare-mode]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-mode') === mode;
      btn.classList.toggle('gem-compare-languages-modal__mode-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function switchCompareMode(modal, targetMode) {
    if (!modal || !targetMode) return;
    modal.dataset.gemCompareMode = targetMode;
    modal.querySelectorAll('[data-gem-compare-mode-panel]').forEach((panel) => {
      const isActive = panel.dataset.gemCompareModePanel === targetMode;
      panel.hidden = !isActive;
      panel.style.display = isActive ? '' : 'none';
    });
    syncCompareModeToggleUi(modal);
    syncCompareModalUi(modal);

    const handler = compareModeHandlers[targetMode];
    if (handler && typeof handler.onActivate === 'function') {
      handler.onActivate(modal);
    }
  }

  function bindCompareModeToggle(modal) {
    if (!modal || modal.dataset.gemCompareModeToggleBound === 'true') return;
    modal.dataset.gemCompareModeToggleBound = 'true';

    const toggle = modal.querySelector('.gem-compare-languages-modal__mode-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest('[data-gem-compare-mode]');
      if (!btn || !toggle.contains(btn)) return;
      const targetMode = btn.getAttribute('data-gem-compare-mode');
      const currentMode = String(modal.dataset.gemCompareMode || '').trim();
      if (!targetMode || targetMode === currentMode) return;

      if (targetMode === 'languages' && typeof window.gemOpenCompareLanguagesModal === 'function') {
        window.gemOpenCompareLanguagesModal();
      } else if (targetMode === 'versions' && typeof window.gemOpenCompareVersionsModal === 'function') {
        window.gemOpenCompareVersionsModal();
      }
    });
  }

  function setCompareZoomLevel(modal, level) {
    const next = normalizeCompareZoom(level);
    if (compareZoomLevel === next) {
      syncCompareZoomUi(modal);
      return;
    }
    persistCompareZoomLevel(next);
    syncCompareZoomUi(modal);
  }

  function setCompareDeviceMode(modal, mode) {
    const next = mode === 'mobile' ? 'mobile' : 'desktop';
    if (compareDeviceMode === next) {
      syncCompareDeviceToggleUi(modal);
      return;
    }
    compareDeviceMode = next;
    syncCompareDeviceToggleUi(modal);
  }

  function getActiveLayoutChangeHandler(modal) {
    const mode = String(modal && modal.dataset.gemCompareMode || '').trim();
    const handler = compareModeHandlers[mode];
    return handler && handler.onLayoutChange;
  }

  function bindCompareLayoutControls(modal) {
    if (!modal || modal.dataset.gemCompareLayoutControlsBound === 'true') return;
    modal.dataset.gemCompareLayoutControlsBound = 'true';

    const sortSelect = modal.querySelector('.gem-compare-languages-modal__sort-select');

    sortSelect?.addEventListener('change', () => {
      persistComparePreviewSortOrder(sortSelect.value);
      syncCompareLayoutControlsUi(modal);
      const onLayoutChange = getActiveLayoutChangeHandler(modal);
      if (onLayoutChange) onLayoutChange(modal);
    });
  }

  function bindCompareZoomToggle(modal) {
    if (!modal || modal.dataset.gemCompareZoomToggleBound === 'true') return;
    modal.dataset.gemCompareZoomToggleBound = 'true';

    const toggle = modal.querySelector('.gem-compare-languages-modal__zoom-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest('[data-gem-compare-zoom]');
      if (!btn || !toggle.contains(btn)) return;
      setCompareZoomLevel(modal, btn.getAttribute('data-gem-compare-zoom'));
    });
  }

  function bindCompareWidthInput(modal) {
    if (!modal || modal.dataset.gemCompareWidthInputBound === 'true') return;
    modal.dataset.gemCompareWidthInputBound = 'true';

    const input = modal.querySelector('.gem-compare-languages-modal__width-input');
    if (!input) return;

    function previewWidthFromInput() {
      const limits = getCompareWidthLimits(compareDeviceMode);
      const parsed = parseInt(input.value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      modal.style.setProperty(
        '--gem-compare-column-width',
        `${Math.min(limits.max, Math.max(limits.min, parsed))}px`
      );
    }

    function commitWidthFromInput(persist) {
      const next = applyActiveCompareWidth(modal, input.value, { persist: !!persist });
      input.value = String(next);
    }

    input.addEventListener('input', previewWidthFromInput);
    input.addEventListener('change', () => commitWidthFromInput(true));
    input.addEventListener('blur', () => commitWidthFromInput(true));
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitWidthFromInput(true);
      input.blur();
    });
  }

  function bindCompareDeviceToggle(modal) {
    if (!modal || modal.dataset.gemCompareDeviceToggleBound === 'true') return;
    modal.dataset.gemCompareDeviceToggleBound = 'true';

    const toggle = modal.querySelector('.gem-compare-languages-modal__device-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest('[data-gem-compare-device]');
      if (!btn || !toggle.contains(btn)) return;
      setCompareDeviceMode(modal, btn.getAttribute('data-gem-compare-device'));
    });
  }

  function bindCompareModalControls(modal) {
    bindCompareLayoutControls(modal);
    bindCompareDeviceToggle(modal);
    bindCompareWidthInput(modal);
    bindCompareZoomToggle(modal);
    bindCompareModeToggle(modal);
    syncCompareModalUi(modal);
  }

  function buildCompareModalShellHtml() {
    return `
      <div class="gem-compare-languages-modal__panel" role="dialog" aria-modal="true" aria-label="Compare previews">
        <div class="gem-compare-languages-modal__header">
          <div class="gem-compare-languages-modal__header-start">
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--mode" hidden>
              <div class="e-buttongroup gem-compare-languages-modal__mode-toggle" role="group" aria-label="Compare mode">
                <button type="button" class="e-btn gem-compare-languages-modal__mode-btn" data-gem-compare-mode="languages" aria-pressed="false">Languages</button>
                <button type="button" class="e-btn gem-compare-languages-modal__mode-btn" data-gem-compare-mode="versions" aria-pressed="false">Versions</button>
              </div>
            </div>
          </div>
          <div class="gem-compare-languages-modal__header-actions">
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--layout">
              <label class="gem-compare-languages-modal__sort-field">
                <span class="gem-compare-languages-modal__sort-label">Sort</span>
                <select class="gem-compare-languages-modal__sort-select" aria-label="Sort previews">
                  <option value="asc">A → Z</option>
                  <option value="desc">Z → A</option>
                </select>
              </label>
            </div>
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--device">
              <div class="e-buttongroup gem-compare-languages-modal__device-toggle" role="group" aria-label="Preview device">
                <button type="button" class="e-btn gem-compare-languages-modal__device-btn gem-compare-languages-modal__device-btn--active" data-gem-compare-device="desktop" aria-pressed="true">Desktop</button>
                <button type="button" class="e-btn gem-compare-languages-modal__device-btn" data-gem-compare-device="mobile" aria-pressed="false">Mobile</button>
              </div>
              <label class="gem-compare-languages-modal__width-field">
                <input
                  type="number"
                  class="gem-compare-languages-modal__width-input"
                  min="200"
                  max="1200"
                  step="1"
                  value="620"
                  aria-label="Desktop preview width in pixels"
                />
              </label>
            </div>
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--zoom">
              <div class="e-buttongroup gem-compare-languages-modal__zoom-toggle" role="group" aria-label="Preview zoom">
                <button type="button" class="e-btn gem-compare-languages-modal__zoom-btn" data-gem-compare-zoom="100" aria-pressed="false">100%</button>
                <button type="button" class="e-btn gem-compare-languages-modal__zoom-btn gem-compare-languages-modal__zoom-btn--active" data-gem-compare-zoom="50" aria-pressed="true">50%</button>
              </div>
            </div>
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--close">
              <button type="button" class="e-btn e-btn-borderless e-btn-onlyicon gem-compare-languages-modal__close" aria-label="Close">✕</button>
            </div>
          </div>
        </div>
        <div class="gem-compare-languages-modal__body">
          <div class="gem-compare-modal__mode-panel" data-gem-compare-mode-panel="languages" hidden></div>
          <div class="gem-compare-modal__mode-panel" data-gem-compare-mode-panel="versions" hidden></div>
        </div>
      </div>
    `.trim();
  }

  function ensureCompareModal({ compareMode } = {}) {
    let modal = getCompareModal();
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = COMPARE_MODAL_ID;
    modal.className = 'gem-compare-languages-modal gem-layer-modal';
    modal.dataset.gemCompareMode = compareMode || '';
    modal.innerHTML = buildCompareModalShellHtml();

    modal.querySelector('.gem-compare-languages-modal__close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCompareModal();
    });

    bindCompareModalControls(modal);

    document.body.appendChild(modal);

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(modal, { tier: 'modal' });
    }

    if (typeof window.gemLayerBindEscape === 'function') {
      if (typeof compareModalEscapeUnsub === 'function') compareModalEscapeUnsub();
      compareModalEscapeUnsub = window.gemLayerBindEscape(closeCompareModal, {
        whileConnected: () => !!document.getElementById(COMPARE_MODAL_ID),
      });
    }

    modal.tabIndex = -1;
    requestAnimationFrame(() => {
      try {
        modal.focus({ preventScroll: true });
      } catch (_) {}
    });

    return modal;
  }

  function clearCompareModePanel(modal, mode, { blankIframes } = {}) {
    const panel = getCompareModePanel(modal, mode);
    if (!panel) return;
    if (blankIframes) {
      panel.querySelectorAll('iframe').forEach((iframe) => {
        iframe.setAttribute('src', 'about:blank');
      });
    }
    panel.innerHTML = '';
    setCompareModePanelLoaded(modal, mode, false);
  }

  function closeCompareModal() {
    if (typeof window.gemSetModalPeek === 'function') {
      window.gemSetModalPeek(false);
    }
    const modal = getCompareModal();
    closeCompareColumnMenu();
    resetCompareDeviceMode();

    if (compareModeHandlers.languages && typeof compareModeHandlers.languages.onClose === 'function') {
      compareModeHandlers.languages.onClose();
    }
    if (compareModeHandlers.versions && typeof compareModeHandlers.versions.onClose === 'function') {
      compareModeHandlers.versions.onClose();
    }

    if (modal) {
      clearCompareModePanel(modal, 'languages');
      clearCompareModePanel(modal, 'versions', { blankIframes: true });
      if (typeof window.gemLayerRelease === 'function') window.gemLayerRelease(modal);
      modal.remove();
    }

    if (typeof compareModalEscapeUnsub === 'function') compareModalEscapeUnsub();
    compareModalEscapeUnsub = null;
  }

  function sortCompareEntries(entries, { pinnedEntryKey, getEntryKey, getSortLabel }) {
    const sortOrder = comparePreviewSortOrder;
    const pinnedKey = String(pinnedEntryKey || '').trim();

    return entries.slice().sort((a, b) => {
      if (pinnedKey) {
        const aKey = String(getEntryKey(a) || '').trim();
        const bKey = String(getEntryKey(b) || '').trim();
        if (aKey === pinnedKey && bKey !== pinnedKey) return -1;
        if (aKey !== pinnedKey && bKey === pinnedKey) return 1;
      }
      const cmp = String(getSortLabel(a)).localeCompare(
        String(getSortLabel(b)),
        undefined,
        { sensitivity: 'base' }
      );
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }

  function getScrollColumnsEl(root) {
    if (!root) return null;
    return (
      root.querySelector('.gem-compare-languages-modal__columns--scroll')
      || root.querySelector('.gem-compare-languages-modal__columns')
    );
  }

  function columnsLayoutMatches(panel, sortedEntries, options) {
    const wrap = panel && panel.querySelector('.gem-compare-languages-modal__columns-wrap');
    if (!wrap || !sortedEntries.length) return false;

    const { pinnedEntryKey, getEntryKey, datasetKey } = options;
    const pinnedKey = String(pinnedEntryKey || '').trim();
    const shouldPin = !!pinnedKey && sortedEntries.some(
      (entry) => String(getEntryKey(entry) || '').trim() === pinnedKey
    );
    const hasPinnedLayout = wrap.classList.contains('gem-compare-languages-modal__columns-wrap--pinned');
    if (hasPinnedLayout !== shouldPin) return false;

    if (shouldPin) {
      const pinnedCol = wrap.querySelector('.gem-compare-languages-column--pinned');
      const pinnedDomKey = pinnedCol
        ? String(pinnedCol.dataset[datasetKey] || '').trim()
        : '';
      if (pinnedDomKey !== pinnedKey) return false;
    }

    const scroll = getScrollColumnsEl(wrap);
    if (!scroll) return false;

    if (String(wrap.dataset.gemCompareSortOrder || '') !== comparePreviewSortOrder) return false;

    const expectedScrollKeys = sortedEntries
      .map((entry) => String(getEntryKey(entry) || '').trim())
      .filter((key) => key && key !== pinnedKey);
    const actualScrollKeys = [...scroll.querySelectorAll('.gem-compare-languages-column')]
      .map((col) => String(col.dataset[datasetKey] || '').trim())
      .filter(Boolean);

    if (expectedScrollKeys.length !== actualScrollKeys.length) return false;

    const expectedKeySet = new Set(expectedScrollKeys);
    return actualScrollKeys.every((key) => expectedKeySet.has(key));
  }

  function mountComparisonColumns(panel, sortedEntries, options) {
    const {
      datasetKey,
      getEntryKey,
      pinnedEntryKey,
      columnsByKey,
      modal,
    } = options;

    if (!panel || !sortedEntries.length || !columnsByKey) return null;

    const existingWrap = panel.querySelector('.gem-compare-languages-modal__columns-wrap');
    const savedScrollLeft = getScrollColumnsEl(existingWrap || panel)?.scrollLeft || 0;

    const pinnedKey = String(pinnedEntryKey || '').trim();
    const pinnedEntry = pinnedKey
      ? sortedEntries.find((entry) => String(getEntryKey(entry) || '').trim() === pinnedKey)
      : null;
    const scrollEntries = pinnedEntry
      ? sortedEntries.filter((entry) => String(getEntryKey(entry) || '').trim() !== pinnedKey)
      : sortedEntries;

    const wrap = document.createElement('div');
    wrap.className = 'gem-compare-languages-modal__columns-wrap';
    if (pinnedEntry) wrap.classList.add('gem-compare-languages-modal__columns-wrap--pinned');

    if (pinnedEntry) {
      const pinnedSlot = document.createElement('div');
      pinnedSlot.className = 'gem-compare-languages-modal__pinned-slot';
      const pinnedCol = columnsByKey.get(String(getEntryKey(pinnedEntry)));
      if (pinnedCol) {
        pinnedCol.classList.add('gem-compare-languages-column--pinned');
        pinnedCol.style.order = '';
        pinnedSlot.appendChild(pinnedCol);
      }
      wrap.appendChild(pinnedSlot);
    }

    const scroll = document.createElement('div');
    scroll.className = 'gem-compare-languages-modal__columns'
      + (pinnedEntry ? ' gem-compare-languages-modal__columns--scroll' : '');

    scrollEntries.forEach((entry, index) => {
      const key = String(getEntryKey(entry) || '').trim();
      const col = columnsByKey.get(key);
      if (!col) return;
      col.classList.remove('gem-compare-languages-column--pinned');
      col.style.order = String(index);
      scroll.appendChild(col);
    });

    wrap.appendChild(scroll);
    wrap.dataset.gemCompareSortOrder = comparePreviewSortOrder;
    const oldWrap = panel.querySelector('.gem-compare-languages-modal__columns-wrap');
    if (oldWrap) {
      oldWrap.replaceWith(wrap);
    } else {
      panel.querySelector('.gem-compare-languages-modal__loading')?.remove();
      panel.appendChild(wrap);
    }
    restoreColumnsScrollLeft(scroll, savedScrollLeft);
    if (modal) syncCompareZoomUi(modal);
    return wrap;
  }

  function collectColumnsByKey(wrap, datasetKey) {
    const columnsByKey = new Map();
    if (!wrap) return columnsByKey;
    wrap.querySelectorAll('.gem-compare-languages-column').forEach((col) => {
      const key = String(col.dataset[datasetKey] || '').trim();
      if (key) columnsByKey.set(key, col);
    });
    return columnsByKey;
  }

  function ensureColumnsScrollContainer(wrap) {
    let scroll = wrap.querySelector('.gem-compare-languages-modal__columns--scroll')
      || wrap.querySelector('.gem-compare-languages-modal__columns');
    if (!scroll) {
      scroll = document.createElement('div');
      scroll.className = 'gem-compare-languages-modal__columns';
      wrap.appendChild(scroll);
    }
    return scroll;
  }

  function reorganizeColumnsLayoutInPlace(wrap, sortedEntries, options) {
    const { pinnedEntryKey, getEntryKey, datasetKey, modal } = options;
    const columnsByKey = collectColumnsByKey(wrap, datasetKey);
    const savedScrollLeft = getScrollColumnsEl(wrap)?.scrollLeft || 0;

    const pinnedKey = String(pinnedEntryKey || '').trim();
    const pinnedEntry = pinnedKey
      ? sortedEntries.find((entry) => String(getEntryKey(entry) || '').trim() === pinnedKey)
      : null;
    const scrollEntries = pinnedEntry
      ? sortedEntries.filter((entry) => String(getEntryKey(entry) || '').trim() !== pinnedKey)
      : sortedEntries;

    const scroll = ensureColumnsScrollContainer(wrap);
    wrap.classList.toggle('gem-compare-languages-modal__columns-wrap--pinned', !!pinnedEntry);

    if (pinnedEntry) {
      let pinnedSlot = wrap.querySelector('.gem-compare-languages-modal__pinned-slot');
      if (!pinnedSlot) {
        pinnedSlot = document.createElement('div');
        pinnedSlot.className = 'gem-compare-languages-modal__pinned-slot';
        wrap.insertBefore(pinnedSlot, scroll);
      }
      scroll.classList.add('gem-compare-languages-modal__columns--scroll');

      const pinnedColKey = String(getEntryKey(pinnedEntry) || '').trim();

      wrap.querySelectorAll('.gem-compare-languages-column--pinned').forEach((col) => {
        const colKey = String(col.dataset[datasetKey] || '').trim();
        if (colKey !== pinnedColKey) {
          col.classList.remove('gem-compare-languages-column--pinned');
          col.style.order = '';
          scroll.appendChild(col);
        }
      });

      const pinnedCol = columnsByKey.get(pinnedColKey);
      if (pinnedCol) {
        pinnedCol.classList.add('gem-compare-languages-column--pinned');
        pinnedCol.style.order = '';
        if (pinnedCol.parentElement !== pinnedSlot) {
          pinnedSlot.appendChild(pinnedCol);
        }
      }
    } else {
      const pinnedSlot = wrap.querySelector('.gem-compare-languages-modal__pinned-slot');
      if (pinnedSlot) {
        [...pinnedSlot.children].forEach((node) => {
          if (!node.classList || !node.classList.contains('gem-compare-languages-column')) return;
          node.classList.remove('gem-compare-languages-column--pinned');
          node.style.order = '';
          scroll.appendChild(node);
        });
        pinnedSlot.remove();
      }
      wrap.querySelectorAll('.gem-compare-languages-column--pinned').forEach((col) => {
        col.classList.remove('gem-compare-languages-column--pinned');
        col.style.order = '';
        if (col.parentElement !== scroll) {
          scroll.appendChild(col);
        }
      });
      scroll.classList.remove('gem-compare-languages-modal__columns--scroll');
    }

    scrollEntries.forEach((entry, index) => {
      const key = String(getEntryKey(entry) || '').trim();
      const col = columnsByKey.get(key);
      if (!col) return;
      col.classList.remove('gem-compare-languages-column--pinned');
      col.style.order = String(index);
      if (col.parentElement !== scroll) {
        scroll.appendChild(col);
      }
    });

    wrap.dataset.gemCompareSortOrder = comparePreviewSortOrder;
    restoreColumnsScrollLeft(scroll, savedScrollLeft);
    if (modal) syncCompareZoomUi(modal);
  }

  function applyColumnsLayout(modal, sortedEntries, options) {
    const panel = getCompareModePanel(modal, options.compareMode);
    const wrap = panel && panel.querySelector('.gem-compare-languages-modal__columns-wrap');
    if (!panel || !wrap || !sortedEntries.length) return;

    if (columnsLayoutMatches(panel, sortedEntries, options)) {
      if (modal) syncCompareZoomUi(modal);
      return;
    }

    reorganizeColumnsLayoutInPlace(wrap, sortedEntries, { ...options, modal });
  }

  function reorderComparisonColumns(modal, sortedEntries, options) {
    if (!modal || !sortedEntries.length) return;
    applyColumnsLayout(modal, sortedEntries, options);
  }

  function restoreColumnsScrollLeft(row, scrollLeft) {
    if (!row || !Number.isFinite(scrollLeft) || scrollLeft <= 0) return;
    const apply = () => {
      const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
      row.scrollLeft = Math.min(scrollLeft, maxScroll);
    };
    apply();
    requestAnimationFrame(apply);
  }

  function createCompareColumnPinButton(onUnpin) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gem-compare-languages-column__pin-btn';
    btn.hidden = true;
    btn.setAttribute('aria-label', 'Unpin preview');
    btn.innerHTML = `<gem-e-icon icon="pin"><div aria-hidden="true" class="e-icon-wrapper">${PIN_ICON_SVG}</div></gem-e-icon>`;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (onUnpin) onUnpin();
    });
    return btn;
  }

  function refreshCompareColumnPinUi(modal, compareMode, {
    datasetKey,
    getActiveEntryKey,
    rebuildOverflowMenu,
  }) {
    if (!modal || typeof rebuildOverflowMenu !== 'function') return;
    const panel = getCompareModePanel(modal, compareMode);
    if (!panel) return;

    const activeKey = String(getActiveEntryKey() || '').trim();
    const pinnedKey = resolvePinnedEntryKey(compareMode, activeKey);

    panel.querySelectorAll('.gem-compare-languages-column').forEach((col) => {
      const entryKey = String(col.dataset[datasetKey] || '').trim();
      const isPinned = !!pinnedKey && entryKey === pinnedKey;
      const pinBtn = col.querySelector('.gem-compare-languages-column__pin-btn');
      if (pinBtn) pinBtn.hidden = !isPinned;

      const menuWrap = col.querySelector('.gem-compare-languages-column__menu-wrap');
      if (menuWrap) {
        const nextMenu = rebuildOverflowMenu(entryKey, isPinned, pinnedKey);
        menuWrap.replaceWith(nextMenu);
      }
    });
  }

  function setColumnFrameLoading(frameWrap) {
    if (!frameWrap) return;
    frameWrap.innerHTML = `
      <div class="gem-compare-languages-column__loading">
        <div class="gem-compare-languages-modal__spinner gem-compare-languages-column__spinner" aria-hidden="true"></div>
        <p class="gem-compare-languages-column__loading-text">Loading preview…</p>
      </div>
    `.trim();
  }

  function setCompareModePanelLoading(modal, mode, message, onCancel) {
    const panel = getCompareModePanel(modal, mode);
    if (!panel) return;
    panel.innerHTML = `
      <div class="gem-compare-languages-modal__loading">
        <div class="gem-compare-languages-modal__spinner" aria-hidden="true"></div>
        <p class="gem-compare-languages-modal__status">${message || 'Preparing…'}</p>
        <button type="button" class="e-btn gem-compare-languages-modal__cancel">Cancel</button>
      </div>
    `.trim();
    panel.querySelector('.gem-compare-languages-modal__cancel')?.addEventListener('click', () => {
      if (onCancel) onCancel();
    });
  }

  function closeCompareColumnMenu() {
    if (!openCompareColumnMenu) return;
    const { wrap, trigger, menu } = openCompareColumnMenu;
    menu.classList.remove('gem-recent-campaign-row-menu--open', 'gem-recent-campaign-row-menu--floating');
    menu.style.removeProperty('top');
    menu.style.removeProperty('left');
    menu.style.removeProperty('visibility');
    trigger.setAttribute('aria-expanded', 'false');
    if (menu.parentNode !== wrap) {
      try {
        wrap.appendChild(menu);
      } catch (_) {}
    }
    openCompareColumnMenu = null;
  }

  function positionCompareColumnMenu(trigger, menu) {
    menu.classList.add('gem-recent-campaign-row-menu--floating');
    menu.style.visibility = 'hidden';
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 4;
    let top = triggerRect.bottom + gap;
    let left = triggerRect.right - menuRect.width;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = triggerRect.top - menuRect.height - gap;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - menuRect.height - 8));
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.visibility = '';
  }

  function openCompareColumnMenuAt(wrap) {
    closeCompareColumnMenu();
    const trigger = wrap.querySelector('.gem-recent-campaign-row-menu-trigger');
    const menu = wrap.querySelector('.gem-recent-campaign-row-menu');
    if (!trigger || !menu) return;
    document.body.appendChild(menu);
    menu.classList.add('gem-recent-campaign-row-menu--open');
    trigger.setAttribute('aria-expanded', 'true');
    positionCompareColumnMenu(trigger, menu);
    openCompareColumnMenu = { wrap, trigger, menu };
  }

  function ensureCompareColumnMenuListeners() {
    if (compareColumnMenuListenersInstalled) return;
    compareColumnMenuListenersInstalled = true;

    document.addEventListener(
      'click',
      (e) => {
        if (!openCompareColumnMenu) return;
        if (openCompareColumnMenu.wrap.contains(e.target)) return;
        if (openCompareColumnMenu.menu.contains(e.target)) return;
        closeCompareColumnMenu();
      },
      true
    );
    window.addEventListener('scroll', closeCompareColumnMenu, true);
    window.addEventListener('resize', closeCompareColumnMenu);
  }

  function makeCompareColumnMenuItem(label, { disabled } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gem-recent-campaign-row-menu-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = label;
    if (disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    }
    return btn;
  }

  function createCompareColumnOverflowMenu(entryLabel, menuItems) {
    const wrap = document.createElement('div');
    wrap.className = 'gem-recent-campaign-row-menu-wrap gem-compare-languages-column__menu-wrap';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gem-recent-campaign-row-menu-trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', `Options for ${entryLabel}`);

    const menu = document.createElement('div');
    menu.className = 'gem-recent-campaign-row-menu';
    menu.setAttribute('role', 'menu');

    (menuItems || []).forEach((item) => {
      if (!item) return;
      const btn = makeCompareColumnMenuItem(item.label, { disabled: !!item.disabled });
      if (!item.disabled) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeCompareColumnMenu();
          item.onClick();
        });
      }
      menu.appendChild(btn);
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openCompareColumnMenu && openCompareColumnMenu.wrap === wrap) {
        closeCompareColumnMenu();
      } else {
        ensureCompareColumnMenuListeners();
        openCompareColumnMenuAt(wrap);
      }
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    return wrap;
  }

  function buildComparePinMenuItem(entryKey, isActiveEntry, compareMode, modal, onLayoutChange, {
    isPinned,
  }) {
    return {
      label: isPinned ? 'Unpin' : 'Pin',
      onClick: () => {
        if (isPinned) {
          unpinCompareEntry(compareMode, modal, onLayoutChange);
        } else {
          pinCompareEntry(compareMode, String(entryKey || '').trim(), isActiveEntry, modal, onLayoutChange);
        }
      },
    };
  }

  function ensureCompareTabToolbar({ tabSelector, toolbarClass, buttonText, canShow, onClick, toolbarRef }) {
    const content = document.querySelector(tabSelector);
    if (!content || !canShow()) {
      if (toolbarRef.current && toolbarRef.current.isConnected) toolbarRef.current.remove();
      toolbarRef.current = null;
      return;
    }

    if (toolbarRef.current && content.contains(toolbarRef.current)) return;
    if (toolbarRef.current) toolbarRef.current.remove();

    const toolbar = document.createElement('div');
    toolbar.className = toolbarClass;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'e-btn e-btn-primary gem-compare-languages-toolbar__btn';
    btn.textContent = buttonText;
    btn.addEventListener('click', onClick);
    toolbar.appendChild(btn);
    content.insertBefore(toolbar, content.firstChild);
    toolbarRef.current = toolbar;
  }

  function syncCompareOverflowMenuItem({ menuSelector, canShow }) {
    const item = document.querySelector(menuSelector);
    if (!item) return;
    const show = canShow();
    item.hidden = !show;
    item.style.display = show ? '' : 'none';
  }

  function resetCompareDeviceMode() {
    compareDeviceMode = 'desktop';
  }

  window.gemComparePreviewCommon = {
    COMPARE_MODAL_ID,
    TOOLBAR_CLASS: 'gem-compare-languages-toolbar',
    loadSettings: loadComparePreviewSettings,
    ensureSettingsListener: ensureComparePreviewSettingsListener,
    registerLayoutRefreshHandler,
    registerCompareModeHandler,
    syncModalUi: syncCompareModalUi,
    ensureCompareModal,
    getCompareModal,
    getCompareModePanel,
    switchCompareMode,
    closeCompareModal,
    isCompareModePanelLoaded,
    setCompareModePanelLoaded,
    setCompareModePanelLoading,
    bindModalControls: bindCompareModalControls,
    sortEntries: sortCompareEntries,
    mountComparisonColumns,
    applyColumnsLayout,
    reorderColumns: reorderComparisonColumns,
    restoreScroll: restoreColumnsScrollLeft,
    resolvePinnedEntryKey,
    pinCompareEntry,
    unpinCompareEntry,
    buildComparePinMenuItem,
    createCompareColumnPinButton,
    refreshCompareColumnPinUi,
    setColumnLoading: setColumnFrameLoading,
    closeColumnMenu: closeCompareColumnMenu,
    createColumnOverflowMenu: createCompareColumnOverflowMenu,
    ensureTabToolbar: ensureCompareTabToolbar,
    syncOverflowMenuItem: syncCompareOverflowMenuItem,
    resetDeviceMode: resetCompareDeviceMode,
  };
})();
