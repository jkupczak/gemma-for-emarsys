// compare-preview-common.js — shared settings, modal shell, column layout, and menus
(function () {
  if (window.__gemComparePreviewCommonInstalled) return;
  window.__gemComparePreviewCommonInstalled = true;
  const COMPARE_MODAL_ID = 'gem-compare-modal';
  const GEM_COMPARE_DESKTOP_WIDTH_KEY = 'gemCompareLanguagesDesktopWidth';
  const GEM_COMPARE_MOBILE_WIDTH_KEY = 'gemCompareLanguagesMobileWidth';
  const GEM_COMPARE_ZOOM_KEY = 'gemCompareLanguagesZoom';
  const GEM_COMPARE_PREVIEW_SORT_KEY = 'gemComparePreviewSortOrder';
  const GEM_COMPARE_PIN_ACTIVE_KEY = 'gemComparePinActivePreview';
  const GEM_COMPARE_CONTENT_VIEW_KEY = 'gemCompareContentView';
  const GEM_COMPARE_SHOW_SUBJECT_PREVIEW_KEY = 'gemCompareShowSubjectPreview';
  const GEM_COMPARE_MODE_KEY = 'gemCompareLastMode';
  const DEFAULT_DESKTOP_WIDTH = 620;
  const DEFAULT_MOBILE_WIDTH = 414;
  const DEFAULT_ZOOM = '50';
  const DEFAULT_PREVIEW_SORT = 'picker';
  const DEFAULT_PIN_ACTIVE_EMAIL = true;
  const DEFAULT_CONTENT_VIEW = 'previews';
  const DEFAULT_SHOW_SUBJECT_PREVIEW = false;
  const DEFAULT_COMPARE_MODE = 'languages';
  const COMPARE_WIDTH_LIMITS = {
    desktop: { min: 200, max: 1200, fallback: DEFAULT_DESKTOP_WIDTH },
    mobile: { min: 200, max: 800, fallback: DEFAULT_MOBILE_WIDTH },
  };
  const PIN_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" class="gem-compare-languages-column__pin-icon" aria-hidden="true"><path d="m685-527 85 84v137H548v248L480 9l-68-67v-248H190v-137l85-84v-253h-41v-136h492v136h-41v253Zm-304 85h198l-30-29v-309H411v309l-30 29Zm99 0Z"/></svg>';

  let compareDeviceMode = 'desktop';
  let compareContentView = 'previews';
  let compareZoomLevel = DEFAULT_ZOOM;
  let compareWidthSettings = {
    desktop: DEFAULT_DESKTOP_WIDTH,
    mobile: DEFAULT_MOBILE_WIDTH,
  };
  let comparePreviewSortOrder = DEFAULT_PREVIEW_SORT;
  let compareSyncPinActiveEmail = DEFAULT_PIN_ACTIVE_EMAIL;
  let compareShowSubjectPreview = DEFAULT_SHOW_SUBJECT_PREVIEW;
  let lastCompareMode = DEFAULT_COMPARE_MODE;
  let sessionPinnedEntryKey = null;
  let sessionPinnedMode = null;
  let compareSettingsListenerBound = false;
  let compareModalEscapeUnsub = null;
  const layoutRefreshHandlers = [];
  const subjectPreviewToggleHandlers = [];
  const compareModeHandlers = {
    languages: null,
    versions: null,
  };

  let openCompareColumnMenu = null;
  let compareColumnMenuListenersInstalled = false;

  function getCompareModal() {
    return document.getElementById(COMPARE_MODAL_ID);
  }

  function normalizeCompareMode(value) {
    return value === 'versions' ? 'versions' : 'languages';
  }

  function hasCompareModePreviewColumns(modal, mode) {
    const panel = getCompareModePanel(modal, mode);
    return !!(
      panel
      && panel.querySelector('.gem-compare-languages-modal__columns-wrap .gem-compare-languages-column')
    );
  }

  function ensureComparePreviewsLoaded(modal) {
    if (!modal) return;
    const mode = String(modal.dataset.gemCompareMode || '').trim();
    if (hasCompareModePreviewColumns(modal, mode)) return;

    if (mode === 'languages' && typeof window.gemEnsureCompareLanguagesPreviews === 'function') {
      window.gemEnsureCompareLanguagesPreviews(modal);
    } else if (mode === 'versions' && typeof window.gemEnsureCompareVersionsPreviews === 'function') {
      window.gemEnsureCompareVersionsPreviews(modal);
    }
  }

  function ensureCompareEslUsageLoaded(modal) {
    if (!modal) return;
    const mode = String(modal.dataset.gemCompareMode || '').trim();

    if (mode === 'languages' && typeof window.gemEnsureCompareLanguagesEslUsage === 'function') {
      window.gemEnsureCompareLanguagesEslUsage(modal);
    } else if (mode === 'versions' && typeof window.gemEnsureCompareVersionsEslUsage === 'function') {
      window.gemEnsureCompareVersionsEslUsage(modal);
    }
  }

  function canCompareLanguages() {
    return typeof window.gemCanCompareLanguages === 'function' && window.gemCanCompareLanguages();
  }

  function canCompareVersions() {
    return typeof window.gemCanCompareVersions === 'function' && window.gemCanCompareVersions();
  }

  function canComparePreviews() {
    return canCompareLanguages() || canCompareVersions();
  }

  function resolveCompareMode(options = {}) {
    if (options.preferPreviewsDefault === true) {
      if (canCompareLanguages()) return 'languages';
      if (canCompareVersions()) return 'versions';
      return 'languages';
    }

    const remembered = normalizeCompareMode(lastCompareMode);
    if (remembered === 'languages' && canCompareLanguages()) return 'languages';
    if (remembered === 'versions' && canCompareVersions()) return 'versions';
    if (canCompareLanguages()) return 'languages';
    if (canCompareVersions()) return 'versions';
    return 'languages';
  }

  function persistCompareMode(mode) {
    const next = normalizeCompareMode(mode);
    lastCompareMode = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [GEM_COMPARE_MODE_KEY]: next });
  }

  function openCompareModalWithResolvedMode(options = {}) {
    const mode = resolveCompareMode(options);
    const opts = { ...options };
    delete opts.preferPreviewsDefault;

    if (mode === 'languages' && typeof window.gemOpenCompareLanguagesModal === 'function') {
      return window.gemOpenCompareLanguagesModal(opts);
    }
    if (mode === 'versions' && typeof window.gemOpenCompareVersionsModal === 'function') {
      return window.gemOpenCompareVersionsModal(opts);
    }
    if (typeof window.gemOpenCompareLanguagesModal === 'function') {
      return window.gemOpenCompareLanguagesModal(opts);
    }
    if (typeof window.gemOpenCompareVersionsModal === 'function') {
      return window.gemOpenCompareVersionsModal(opts);
    }
    return false;
  }

  function openComparePreviewsModal() {
    if (!canComparePreviews()) {
      if (window.gemShowToast) {
        window.gemShowToast('Compare Previews requires at least two languages or versions.', { type: 'error' });
      }
      return false;
    }
    return openCompareModalWithResolvedMode({
      contentView: 'previews',
      preferPreviewsDefault: true,
    });
  }

  function syncComparePreviewsOverflowMenuItem() {
    syncCompareOverflowMenuItem({
      menuSelector: '[data-gem-compare-previews-menu]',
      canShow: canComparePreviews,
    });
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
    const v = String(value || '').trim();
    if (v === 'picker' || v === 'asc' || v === 'desc') return v;
    return DEFAULT_PREVIEW_SORT;
  }

  function normalizeCompareSyncPinActiveEmail(value) {
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return DEFAULT_PIN_ACTIVE_EMAIL;
  }

  function normalizeCompareContentView(value) {
    if (value === 'esl-usage') return 'esl-usage';
    if (value === 'links') return 'links';
    if (value === 'previews') {
      return canComparePreviews() ? 'previews' : 'esl-usage';
    }
    return canComparePreviews() ? DEFAULT_CONTENT_VIEW : 'esl-usage';
  }

  function ensureValidCompareContentView(modal) {
    if (canComparePreviews() || compareContentView !== 'previews') return;

    compareContentView = 'esl-usage';
    persistCompareContentView('esl-usage');
    ensureCompareEslUsageLoaded(modal);
    if (typeof window.gemRefreshCompareEslUsageTable === 'function') {
      window.gemRefreshCompareEslUsageTable(modal);
    }
  }

  function normalizeCompareShowSubjectPreview(value) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    return DEFAULT_SHOW_SUBJECT_PREVIEW;
  }

  function compareHtmlToPlainText(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      return String(doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function compareSubjectSegmentToPlainText(html) {
    const raw = String(html ?? '');
    if (!raw) return '';
    if (!raw.includes('<')) return raw;
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      return String(doc.body.textContent || '');
    } catch (_) {
      return raw.replace(/<[^>]+>/g, '');
    }
  }

  function isGemmaPersTokenMeta(meta) {
    if (!meta || typeof meta !== 'object') return false;
    if (meta.type === 'cust_esl') return true;
    if (meta.token && meta.token.type === 'cust_esl') return true;
    return false;
  }

  function escapeCompareSubjectHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getCompareSubjectTokenLabel(token) {
    if (!token) return '';

    const meta = token.meta;
    if (isGemmaPersTokenMeta(meta)) {
      return String(meta.tokenName || meta.token?.name || '').trim();
    }

    const tokenObj = meta?.token;
    return String(
      tokenObj?.displayName
      || tokenObj?.name
      || meta?.tokenName
      || meta?.name
      || ''
    ).trim();
  }

  function buildCompareSubjectTokenChipHtml(token) {
    const label = getCompareSubjectTokenLabel(token);
    if (!label) return '';

    return (
      `<span class="e-label e-label-primary" title="${escapeCompareSubjectHtml(label)}">` +
      `${escapeCompareSubjectHtml(label)}` +
      '</span>'
    );
  }

  function buildCompareSubjectDisplayHtml(html) {
    const source = String(html || '').trim();
    if (!source) return '';

    if (!source.includes('pers-token:1')) {
      return escapeCompareSubjectHtml(compareHtmlToPlainText(source));
    }

    if (typeof window.gemParsePersTokensInHtml !== 'function') {
      return escapeCompareSubjectHtml(compareHtmlToPlainText(source));
    }

    const tokens = window.gemParsePersTokensInHtml(source);
    if (!tokens.length) {
      return escapeCompareSubjectHtml(compareHtmlToPlainText(source));
    }

    const parts = [];
    let last = 0;

    tokens.forEach((token) => {
      if (token.start > last) {
        const segmentText = compareSubjectSegmentToPlainText(source.slice(last, token.start));
        if (segmentText) parts.push(escapeCompareSubjectHtml(segmentText));
      }

      const tokenHtml = buildCompareSubjectTokenChipHtml(token);
      if (tokenHtml) parts.push(tokenHtml);

      last = token.end;
    });

    if (last < source.length) {
      const tailText = compareSubjectSegmentToPlainText(source.slice(last));
      if (tailText) parts.push(escapeCompareSubjectHtml(tailText));
    }

    return parts.join('');
  }

  function compareSubjectHtmlToDisplayText(html) {
    const displayHtml = buildCompareSubjectDisplayHtml(html);
    if (!displayHtml) return '';
    return displayHtml
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function createCompareColumnMetaRow() {
    const meta = document.createElement('div');
    meta.className = 'gem-compare-languages-column__meta';
    meta.hidden = true;

    const subject = document.createElement('div');
    subject.className = 'gem-compare-languages-column__meta-subject';

    const preview = document.createElement('div');
    preview.className = 'gem-compare-languages-column__meta-preview';

    meta.appendChild(subject);
    meta.appendChild(preview);
    return meta;
  }

  function ensureCompareColumnMetaRow(columnEl, { subjectHtml, preheaderText } = {}) {
    if (!columnEl) return;
    let meta = columnEl.querySelector('.gem-compare-languages-column__meta');
    if (!meta) {
      meta = createCompareColumnMetaRow();
      const frameWrap = columnEl.querySelector('.gem-compare-languages-column__frame-wrap');
      if (frameWrap) columnEl.insertBefore(meta, frameWrap);
      else columnEl.appendChild(meta);
    }
    updateCompareColumnMetaRow(columnEl, { subjectHtml, preheaderText });
  }

  function updateCompareColumnMetaRow(columnEl, { subjectHtml, preheaderText } = {}) {
    if (!columnEl) return;
    const meta = columnEl.querySelector('.gem-compare-languages-column__meta');
    if (!meta) return;

    const subjectEl = meta.querySelector('.gem-compare-languages-column__meta-subject');
    const previewEl = meta.querySelector('.gem-compare-languages-column__meta-preview');
    const subjectDisplayHtml = buildCompareSubjectDisplayHtml(subjectHtml);
    const subjectText = compareSubjectHtmlToDisplayText(subjectHtml);
    const previewText = String(preheaderText || '').trim();

    if (subjectEl) {
      if (subjectDisplayHtml.includes('e-label e-label-primary')) {
        subjectEl.innerHTML = subjectDisplayHtml || '\u00a0';
      } else {
        subjectEl.textContent = subjectText || '\u00a0';
      }
      subjectEl.hidden = false;
      subjectEl.dataset.gemEmpty = subjectText ? 'false' : 'true';
    }
    if (previewEl) {
      previewEl.textContent = previewText || '\u00a0';
      previewEl.hidden = false;
      previewEl.dataset.gemEmpty = previewText ? 'false' : 'true';
    }
  }

  function syncCompareSubjectPreviewUi(modal) {
    const target = modal || getCompareModal();
    if (!target) return;

    const show = compareShowSubjectPreview && compareContentView === 'previews';
    target.dataset.gemCompareSubjectPreview = show ? 'on' : 'off';

    const toggleBtn = target.querySelector('[data-gem-compare-subject-preview-toggle]');
    if (toggleBtn) {
      toggleBtn.classList.toggle('gem-compare-languages-modal__subject-preview-btn--active', compareShowSubjectPreview);
      toggleBtn.setAttribute('aria-pressed', compareShowSubjectPreview ? 'true' : 'false');
    }

    target.querySelectorAll('.gem-compare-languages-column__meta').forEach((metaEl) => {
      metaEl.hidden = !show;
    });
  }

  function setCompareShowSubjectPreview(modal, enabled, { persist = true } = {}) {
    const next = !!enabled;
    if (compareShowSubjectPreview === next && !persist) {
      syncCompareSubjectPreviewUi(modal);
      return;
    }
    compareShowSubjectPreview = next;
    syncCompareSubjectPreviewUi(modal);
    notifySubjectPreviewToggleHandlers(modal);
    if (persist && chrome?.storage?.local) {
      chrome.storage.local.set({ [GEM_COMPARE_SHOW_SUBJECT_PREVIEW_KEY]: next });
    }
  }

  function loadCompareLocalSettings(callback) {
    if (!chrome?.storage?.local) {
      compareShowSubjectPreview = DEFAULT_SHOW_SUBJECT_PREVIEW;
      if (callback) callback();
      return;
    }

    chrome.storage.local.get({
      [GEM_COMPARE_SHOW_SUBJECT_PREVIEW_KEY]: DEFAULT_SHOW_SUBJECT_PREVIEW,
    }, (res) => {
      compareShowSubjectPreview = normalizeCompareShowSubjectPreview(
        res[GEM_COMPARE_SHOW_SUBJECT_PREVIEW_KEY]
      );
      if (callback) callback();
    });
  }

  function bindCompareSubjectPreviewToggle(modal) {
    if (!modal || modal.dataset.gemCompareSubjectPreviewToggleBound === 'true') return;
    const btn = modal.querySelector('[data-gem-compare-subject-preview-toggle]');
    if (!btn) return;

    modal.dataset.gemCompareSubjectPreviewToggleBound = 'true';
    btn.addEventListener('click', () => {
      setCompareShowSubjectPreview(modal, !compareShowSubjectPreview);
    });
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
    compareContentView = normalizeCompareContentView(
      settings && settings[GEM_COMPARE_CONTENT_VIEW_KEY]
    );
    lastCompareMode = normalizeCompareMode(settings && settings[GEM_COMPARE_MODE_KEY]);
  }

  function loadComparePreviewSettings(callback) {
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      applyComparePreviewSettings(null);
      loadCompareLocalSettings(callback);
      return;
    }

    chrome.storage.sync.get({
      [GEM_COMPARE_DESKTOP_WIDTH_KEY]: DEFAULT_DESKTOP_WIDTH,
      [GEM_COMPARE_MOBILE_WIDTH_KEY]: DEFAULT_MOBILE_WIDTH,
      [GEM_COMPARE_ZOOM_KEY]: DEFAULT_ZOOM,
      [GEM_COMPARE_PREVIEW_SORT_KEY]: DEFAULT_PREVIEW_SORT,
      [GEM_COMPARE_PIN_ACTIVE_KEY]: DEFAULT_PIN_ACTIVE_EMAIL,
      [GEM_COMPARE_CONTENT_VIEW_KEY]: DEFAULT_CONTENT_VIEW,
      [GEM_COMPARE_MODE_KEY]: DEFAULT_COMPARE_MODE,
    }, (res) => {
      applyComparePreviewSettings(res || {});
      loadCompareLocalSettings(callback);
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

  function persistCompareContentView(view) {
    const next = normalizeCompareContentView(view);
    compareContentView = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [GEM_COMPARE_CONTENT_VIEW_KEY]: next });
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

  function registerSubjectPreviewToggleHandler(handler) {
    if (typeof handler === 'function') subjectPreviewToggleHandlers.push(handler);
  }

  function notifySubjectPreviewToggleHandlers(modal) {
    subjectPreviewToggleHandlers.forEach((handler) => {
      try {
        handler(modal);
      } catch (_) {}
    });
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
      if (areaName === 'local' && changes[GEM_COMPARE_SHOW_SUBJECT_PREVIEW_KEY]) {
        compareShowSubjectPreview = normalizeCompareShowSubjectPreview(
          changes[GEM_COMPARE_SHOW_SUBJECT_PREVIEW_KEY].newValue
        );
        syncOpenCompareModalsUi();
        return;
      }

      if (areaName !== 'sync') return;
      const desktopChange = changes[GEM_COMPARE_DESKTOP_WIDTH_KEY];
      const mobileChange = changes[GEM_COMPARE_MOBILE_WIDTH_KEY];
      const zoomChange = changes[GEM_COMPARE_ZOOM_KEY];
      const sortChange = changes[GEM_COMPARE_PREVIEW_SORT_KEY];
      const pinChange = changes[GEM_COMPARE_PIN_ACTIVE_KEY];
      const contentViewChange = changes[GEM_COMPARE_CONTENT_VIEW_KEY];
      const modeChange = changes[GEM_COMPARE_MODE_KEY];
      if (!desktopChange && !mobileChange && !zoomChange && !sortChange && !pinChange && !contentViewChange && !modeChange) return;

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
        [GEM_COMPARE_CONTENT_VIEW_KEY]: contentViewChange
          ? contentViewChange.newValue
          : compareContentView,
        [GEM_COMPARE_MODE_KEY]: modeChange
          ? modeChange.newValue
          : lastCompareMode,
      });

      syncOpenCompareModalsUi();
      if (sortChange || pinChange) notifyLayoutRefresh();
      if (contentViewChange) {
        const modal = getCompareModal();
        if (modal && compareContentView === 'esl-usage' && typeof window.gemRefreshCompareEslUsageTable === 'function') {
          window.gemRefreshCompareEslUsageTable(modal);
        }
        if (modal && compareContentView === 'links' && typeof window.gemRefreshCompareReviewLinksTable === 'function') {
          window.gemRefreshCompareReviewLinksTable(modal);
        }
      }
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
    if (!sortSelect) return;
    const pickerOpt = sortSelect.querySelector('option[value="picker"]');
    if (pickerOpt) {
      const mode = String(modal.dataset.gemCompareMode || '').trim();
      pickerOpt.textContent = mode === 'versions' ? 'Version order' : 'Language order';
    }
    sortSelect.value = comparePreviewSortOrder;
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

  function syncCompareContentViewUi(modal) {
    if (!modal) return;
    ensureValidCompareContentView(modal);
    modal.dataset.gemCompareContentView = compareContentView;

    const toggle = modal.querySelector('.gem-compare-languages-modal__content-view-toggle');
    const showPreviewsTab = canComparePreviews();
    const previewsBtn = toggle?.querySelector('[data-gem-compare-content-view="previews"]');
    if (previewsBtn) {
      previewsBtn.hidden = !showPreviewsTab;
      previewsBtn.style.display = showPreviewsTab ? '' : 'none';
    }

    toggle?.querySelectorAll('[data-gem-compare-content-view]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-content-view') === compareContentView;
      btn.classList.toggle('gem-compare-languages-modal__content-view-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const isEslUsage = compareContentView === 'esl-usage';
    const isLinksView = compareContentView === 'links';
    const hidePreviewControls = isEslUsage || isLinksView;
    modal.querySelectorAll(
      '.gem-compare-languages-modal__header-control-group--device, .gem-compare-languages-modal__header-control-group--zoom, .gem-compare-languages-modal__header-control-group--subject-preview'
    ).forEach((group) => {
      group.hidden = hidePreviewControls;
      group.style.display = hidePreviewControls ? 'none' : '';
    });

    const editabilityGroup = modal.querySelector(
      '.gem-compare-languages-modal__header-control-group--esl-editability'
    );
    if (editabilityGroup) {
      editabilityGroup.hidden = !isEslUsage;
      editabilityGroup.style.display = isEslUsage ? '' : 'none';
    }

    const groupingGroup = modal.querySelector(
      '.gem-compare-languages-modal__header-control-group--esl-grouping'
    );
    if (groupingGroup) {
      groupingGroup.hidden = !isEslUsage;
      groupingGroup.style.display = isEslUsage ? '' : 'none';
    }

    const linksToolbar = modal.querySelector('.gem-compare-languages-modal__links-toolbar');
    if (linksToolbar) {
      linksToolbar.hidden = !isLinksView;
      linksToolbar.style.display = isLinksView ? '' : 'none';
    }
    if (isLinksView && typeof window.gemEnsureReviewLinksToolbar === 'function') {
      window.gemEnsureReviewLinksToolbar(modal);
    }

    syncPanelContentView(modal);
    syncCompareSubjectPreviewUi(modal);
  }

  function syncPanelContentView(modal) {
    if (!modal) return;
    const isEslUsage = compareContentView === 'esl-usage';
    const isLinksView = compareContentView === 'links';
    const mode = String(modal.dataset.gemCompareMode || '').trim();

    modal.querySelectorAll('[data-gem-compare-mode-panel]').forEach((panel) => {
      const isActivePanel = panel.dataset.gemCompareModePanel === mode;
      const columnsWrap = panel.querySelector('.gem-compare-languages-modal__columns-wrap');
      const eslTable = panel.querySelector('.gem-compare-esl-usage');
      const linksWrap = panel.querySelector('.gem-review-links');

      if (!isActivePanel) return;

      if (columnsWrap) {
        columnsWrap.hidden = isEslUsage || isLinksView;
        columnsWrap.style.display = (isEslUsage || isLinksView) ? 'none' : '';
      }
      if (eslTable) {
        eslTable.hidden = !isEslUsage;
        eslTable.style.display = isEslUsage ? '' : 'none';
      }
      if (linksWrap) {
        linksWrap.hidden = !isLinksView;
        linksWrap.style.display = isLinksView ? '' : 'none';
      }
    });
  }

  function setCompareContentView(modal, view) {
    const next = normalizeCompareContentView(view);
    if (compareContentView === next) {
      syncCompareContentViewUi(modal);
      if (next === 'previews') ensureComparePreviewsLoaded(modal);
      if (next === 'esl-usage') ensureCompareEslUsageLoaded(modal);
      if (next === 'links' && typeof window.gemRefreshCompareReviewLinksTable === 'function') {
        window.gemRefreshCompareReviewLinksTable(modal);
      }
      return;
    }
    compareContentView = next;
    persistCompareContentView(next);
    syncCompareContentViewUi(modal);
    if (next === 'esl-usage') {
      ensureCompareEslUsageLoaded(modal);
      if (typeof window.gemRefreshCompareEslUsageTable === 'function') {
        window.gemRefreshCompareEslUsageTable(modal);
      }
    }
    if (next === 'links' && typeof window.gemRefreshCompareReviewLinksTable === 'function') {
      window.gemRefreshCompareReviewLinksTable(modal);
    }
    if (next === 'previews') {
      ensureComparePreviewsLoaded(modal);
    }
  }

  function getCompareContentView() {
    return compareContentView;
  }

  function syncCompareModalUi(modal) {
    syncCompareLayoutControlsUi(modal);
    syncCompareDeviceToggleUi(modal);
    syncCompareZoomUi(modal);
    syncCompareModeToggleUi(modal);
    syncCompareContentViewUi(modal);
    syncCompareSubjectPreviewUi(modal);
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

    if (compareContentView === 'esl-usage' && typeof window.gemRefreshCompareEslUsageTable === 'function') {
      window.gemRefreshCompareEslUsageTable(modal);
    }
    if (compareContentView === 'links' && typeof window.gemRefreshCompareReviewLinksTable === 'function') {
      window.gemRefreshCompareReviewLinksTable(modal);
    }
  }

  function bindCompareContentViewToggle(modal) {
    if (!modal || modal.dataset.gemCompareContentViewToggleBound === 'true') return;
    modal.dataset.gemCompareContentViewToggleBound = 'true';

    const toggle = modal.querySelector('.gem-compare-languages-modal__content-view-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest('[data-gem-compare-content-view]');
      if (!btn || !toggle.contains(btn)) return;
      setCompareContentView(modal, btn.getAttribute('data-gem-compare-content-view'));
    });
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

      const modeSwitchOptions = typeof getCompareContentView === 'function'
        ? { contentView: getCompareContentView() }
        : {};

      if (targetMode === 'languages' && typeof window.gemOpenCompareLanguagesModal === 'function') {
        window.gemOpenCompareLanguagesModal(modeSwitchOptions);
      } else if (targetMode === 'versions' && typeof window.gemOpenCompareVersionsModal === 'function') {
        window.gemOpenCompareVersionsModal(modeSwitchOptions);
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
    bindCompareContentViewToggle(modal);
    bindCompareSubjectPreviewToggle(modal);
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
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--content-view">
              <div class="e-buttongroup gem-compare-languages-modal__content-view-toggle" role="group" aria-label="Compare content view">
                <button type="button" class="e-btn gem-compare-languages-modal__content-view-btn gem-compare-languages-modal__content-view-btn--active" data-gem-compare-content-view="previews" aria-pressed="true">Previews</button>
                <button type="button" class="e-btn gem-compare-languages-modal__content-view-btn" data-gem-compare-content-view="esl-usage" aria-pressed="false">Scripts</button>
                <button type="button" class="e-btn gem-compare-languages-modal__content-view-btn" data-gem-compare-content-view="links" aria-pressed="false">Links</button>
              </div>
            </div>
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--esl-grouping" hidden>
              <div class="e-buttongroup gem-compare-languages-modal__esl-grouping-toggle" role="group" aria-label="Group scripts by location">
                <button type="button" class="e-btn gem-compare-languages-modal__esl-grouping-btn" data-gem-compare-esl-grouping="none" aria-pressed="false">No grouping</button>
                <button type="button" class="e-btn gem-compare-languages-modal__esl-grouping-btn gem-compare-languages-modal__esl-grouping-btn--active" data-gem-compare-esl-grouping="by-location" aria-pressed="true">By location</button>
                <button type="button" class="e-btn gem-compare-languages-modal__esl-grouping-btn" data-gem-compare-esl-grouping="cell-breakdown" aria-pressed="false">In cells</button>
              </div>
            </div>
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--esl-editability" hidden>
              <div class="e-buttongroup gem-compare-languages-modal__esl-editability-toggle" role="group" aria-label="Filter scripts by editability">
                <button type="button" class="e-btn gem-compare-languages-modal__esl-editability-btn" data-gem-compare-esl-editability="all" aria-pressed="false">All</button>
                <button type="button" class="e-btn gem-compare-languages-modal__esl-editability-btn gem-compare-languages-modal__esl-editability-btn--active" data-gem-compare-esl-editability="editable" aria-pressed="true">Editable</button>
                <button type="button" class="e-btn gem-compare-languages-modal__esl-editability-btn" data-gem-compare-esl-editability="non-editable" aria-pressed="false">Non-editable</button>
              </div>
            </div>
          </div>
          <div class="gem-compare-languages-modal__header-actions">
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--layout">
              <label class="gem-compare-languages-modal__sort-field">
                <span class="gem-compare-languages-modal__sort-label">Sort</span>
                <select class="gem-compare-languages-modal__sort-select" aria-label="Sort previews">
                  <option value="picker">Language order</option>
                  <option value="asc">A → Z</option>
                  <option value="desc">Z → A</option>
                </select>
              </label>
            </div>
            <div class="gem-compare-languages-modal__header-control-group gem-compare-languages-modal__header-control-group--subject-preview">
              <button type="button" class="e-btn gem-compare-languages-modal__subject-preview-btn" data-gem-compare-subject-preview-toggle aria-pressed="false">Subject &amp; Preview</button>
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
        <div class="gem-compare-languages-modal__links-toolbar" hidden></div>
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
      const mode = String(modal.dataset.gemCompareMode || '').trim();
      if (mode === 'languages' || mode === 'versions') {
        persistCompareMode(mode);
      }

      clearCompareModePanel(modal, 'languages', { blankIframes: true });
      clearCompareModePanel(modal, 'versions', { blankIframes: true });
      if (typeof window.gemClearCompareReviewLinksState === 'function') {
        window.gemClearCompareReviewLinksState();
      }
      if (typeof window.gemLayerRelease === 'function') window.gemLayerRelease(modal);
      modal.remove();
    }

    if (typeof compareModalEscapeUnsub === 'function') compareModalEscapeUnsub();
    compareModalEscapeUnsub = null;
  }

  function sortCompareEntries(entries, { pinnedEntryKey, getEntryKey, getSortLabel, getSourceIndex }) {
    const sortOrder = comparePreviewSortOrder;
    const pinnedKey = String(pinnedEntryKey || '').trim();
    const indexed = entries.map((entry, index) => ({
      entry,
      index: typeof getSourceIndex === 'function' ? Number(getSourceIndex(entry, index)) : index,
    }));

    indexed.sort((a, b) => {
      if (pinnedKey) {
        const aKey = String(getEntryKey(a.entry) || '').trim();
        const bKey = String(getEntryKey(b.entry) || '').trim();
        if (aKey === pinnedKey && bKey !== pinnedKey) return -1;
        if (aKey !== pinnedKey && bKey === pinnedKey) return 1;
      }
      if (sortOrder === 'picker') {
        const aIdx = Number.isFinite(a.index) ? a.index : Number.MAX_SAFE_INTEGER;
        const bIdx = Number.isFinite(b.index) ? b.index : Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      }
      const cmp = String(getSortLabel(a.entry)).localeCompare(
        String(getSortLabel(b.entry)),
        undefined,
        { sensitivity: 'base' }
      );
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return indexed.map((item) => item.entry);
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
    menu.classList.remove('gem-overflow-menu--open', 'gem-overflow-menu--floating');
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
    menu.classList.add('gem-overflow-menu--floating');
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
    const trigger = wrap.querySelector('.gem-overflow-menu-trigger');
    const menu = wrap.querySelector('.gem-overflow-menu');
    if (!trigger || !menu) return;
    document.body.appendChild(menu);
    menu.classList.add('gem-overflow-menu--open');
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
    btn.className = 'gem-overflow-menu-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = label;
    if (disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    }
    return btn;
  }

  function createCompareColumnOverflowMenu(entryLabel, menuItems, { wrapClassName } = {}) {
    const wrap = document.createElement('div');
    wrap.className = wrapClassName || 'gem-overflow-menu-wrap gem-compare-languages-column__menu-wrap';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gem-overflow-menu-trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', `Options for ${entryLabel}`);

    const menu = document.createElement('div');
    menu.className = 'gem-overflow-menu';
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
    registerSubjectPreviewToggleHandler,
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
    createCompareColumnMetaRow,
    ensureCompareColumnMetaRow,
    updateCompareColumnMetaRow,
    ensureTabToolbar: ensureCompareTabToolbar,
    syncOverflowMenuItem: syncCompareOverflowMenuItem,
    resetDeviceMode: resetCompareDeviceMode,
    getContentView: getCompareContentView,
    setContentView: setCompareContentView,
    syncPanelContentView,
    syncCompareSubjectPreviewUi,
    hasCompareModePreviewColumns,
    ensureComparePreviewsLoaded,
    ensureCompareEslUsageLoaded,
    resolveCompareMode,
    openCompareModalWithResolvedMode,
    openComparePreviewsModal,
    syncComparePreviewsOverflowMenuItem,
    canComparePreviews,
  };

  window.gemCanComparePreviews = canComparePreviews;
  window.gemOpenComparePreviewsModal = openComparePreviewsModal;
  window.gemOpenCompareModal = openCompareModalWithResolvedMode;
  window.gemSyncComparePreviewsOverflowMenuItem = syncComparePreviewsOverflowMenuItem;
})();
