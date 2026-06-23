// compare-languages.js — multi-language side-by-side preview comparison
(function () {
  const MODAL_ID = 'gem-compare-languages-modal';
  const TOOLBAR_CLASS = 'gem-compare-languages-toolbar';
  const PREVIEW_READY_TIMEOUT_MS = 4000;
  const GEM_COMPARE_LANGUAGES_DESKTOP_WIDTH_KEY = 'gemCompareLanguagesDesktopWidth';
  const GEM_COMPARE_LANGUAGES_MOBILE_WIDTH_KEY = 'gemCompareLanguagesMobileWidth';
  const GEM_COMPARE_LANGUAGES_ZOOM_KEY = 'gemCompareLanguagesZoom';
  const DEFAULT_COMPARE_LANGUAGES_DESKTOP_WIDTH = 620;
  const DEFAULT_COMPARE_LANGUAGES_MOBILE_WIDTH = 414;
  const DEFAULT_COMPARE_LANGUAGES_ZOOM = '50';
  const COMPARE_COLUMNS_ZOOM_50_CLASS = 'gem-compare-languages-modal__columns--zoom-50';
  const COMPARE_WIDTH_LIMITS = {
    desktop: { min: 200, max: 1200, fallback: DEFAULT_COMPARE_LANGUAGES_DESKTOP_WIDTH },
    mobile: { min: 200, max: 800, fallback: DEFAULT_COMPARE_LANGUAGES_MOBILE_WIDTH },
  };

  let compareDeviceMode = 'desktop';
  let compareZoomLevel = DEFAULT_COMPARE_LANGUAGES_ZOOM;
  let compareWidthSettings = {
    desktop: DEFAULT_COMPARE_LANGUAGES_DESKTOP_WIDTH,
    mobile: DEFAULT_COMPARE_LANGUAGES_MOBILE_WIDTH,
  };
  let compareSettingsListenerBound = false;
  let activeComparisonCaptures = [];
  let openCompareColumnMenu = null;
  let compareColumnMenuListenersInstalled = false;
  const PREVIEW_DEBOUNCE_MS = 200;
  const IDENTICAL_CONTENT_SETTLE_MS = 400;
  const SELECT_POLL_MS = 75;
  const SELECT_MAX_ATTEMPTS = 25;
  const PREVIEW_SANITIZE_SELECTORS = [
    'e-vce-positioner-block',
    'div.dnd_insert_dropzone',
    'div.e-contentblocks-dragview',
    'div.dnd_reorder_dropzone',
    'e-vce-positioner-editable',
    'div.vce-drag-and-drop-auto-scroll-layer',
    'e-vce-dropline',
    'div.two_click_insert_dropzone',
    'e-vce-borderer',
  ];

  let escapeUnsub = null;
  let captureAbort = false;
  let localesTabToolbarEl = null;

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
      ? GEM_COMPARE_LANGUAGES_MOBILE_WIDTH_KEY
      : GEM_COMPARE_LANGUAGES_DESKTOP_WIDTH_KEY;
  }

  function persistCompareWidthForDevice(mode, width) {
    const next = normalizeCompareWidthForDevice(width, mode);
    if (mode === 'mobile') {
      compareWidthSettings.mobile = next;
    } else {
      compareWidthSettings.desktop = next;
    }
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [getActiveCompareWidthStorageKey(mode)]: next });
  }

  function applyActiveCompareWidth(modal, width, { persist } = {}) {
    const next = normalizeCompareWidthForDevice(width, compareDeviceMode);
    if (compareDeviceMode === 'mobile') {
      compareWidthSettings.mobile = next;
    } else {
      compareWidthSettings.desktop = next;
    }
    if (modal) {
      modal.style.setProperty('--gem-compare-column-width', `${next}px`);
    }
    if (persist) persistCompareWidthForDevice(compareDeviceMode, next);
    return next;
  }

  function applyCompareWidthSettings(settings) {
    compareWidthSettings = {
      desktop: normalizeCompareWidth(
        settings && settings[GEM_COMPARE_LANGUAGES_DESKTOP_WIDTH_KEY],
        DEFAULT_COMPARE_LANGUAGES_DESKTOP_WIDTH
      ),
      mobile: normalizeCompareWidth(
        settings && settings[GEM_COMPARE_LANGUAGES_MOBILE_WIDTH_KEY],
        DEFAULT_COMPARE_LANGUAGES_MOBILE_WIDTH
      ),
    };
  }

  function normalizeCompareZoom(value) {
    return String(value) === '100' ? '100' : DEFAULT_COMPARE_LANGUAGES_ZOOM;
  }

  function applyCompareLanguagesSettings(settings) {
    applyCompareWidthSettings(settings);
    compareZoomLevel = normalizeCompareZoom(settings && settings[GEM_COMPARE_LANGUAGES_ZOOM_KEY]);
  }

  function loadCompareLanguagesSettings(callback) {
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      applyCompareLanguagesSettings(null);
      if (callback) callback();
      return;
    }

    chrome.storage.sync.get({
      [GEM_COMPARE_LANGUAGES_DESKTOP_WIDTH_KEY]: DEFAULT_COMPARE_LANGUAGES_DESKTOP_WIDTH,
      [GEM_COMPARE_LANGUAGES_MOBILE_WIDTH_KEY]: DEFAULT_COMPARE_LANGUAGES_MOBILE_WIDTH,
      [GEM_COMPARE_LANGUAGES_ZOOM_KEY]: DEFAULT_COMPARE_LANGUAGES_ZOOM,
    }, (res) => {
      applyCompareLanguagesSettings(res || {});
      if (callback) callback();
    });
  }

  function persistCompareZoomLevel(level) {
    const next = normalizeCompareZoom(level);
    compareZoomLevel = next;
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ [GEM_COMPARE_LANGUAGES_ZOOM_KEY]: next });
  }

  function getActiveCompareColumnWidth() {
    return compareDeviceMode === 'mobile'
      ? compareWidthSettings.mobile
      : compareWidthSettings.desktop;
  }

  function syncCompareZoomUi(modal) {
    if (!modal) return;
    modal.dataset.gemCompareZoom = compareZoomLevel;
    modal.querySelectorAll('[data-gem-compare-zoom]').forEach((btn) => {
      const active = btn.getAttribute('data-gem-compare-zoom') === compareZoomLevel;
      btn.classList.toggle('gem-compare-languages-modal__zoom-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    modal.querySelectorAll('.gem-compare-languages-modal__columns').forEach((row) => {
      row.classList.toggle(COMPARE_COLUMNS_ZOOM_50_CLASS, compareZoomLevel === '50');
    });
  }

  function syncCompareModalUi(modal) {
    syncCompareDeviceToggleUi(modal);
    syncCompareZoomUi(modal);
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

  function setCompareDeviceMode(modal, mode) {
    const next = mode === 'mobile' ? 'mobile' : 'desktop';
    if (compareDeviceMode === next) {
      syncCompareDeviceToggleUi(modal);
      return;
    }
    compareDeviceMode = next;
    syncCompareDeviceToggleUi(modal);
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

  function ensureCompareSettingsListener() {
    if (compareSettingsListenerBound || !chrome || !chrome.storage || !chrome.storage.onChanged) return;
    compareSettingsListenerBound = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      const desktopChange = changes[GEM_COMPARE_LANGUAGES_DESKTOP_WIDTH_KEY];
      const mobileChange = changes[GEM_COMPARE_LANGUAGES_MOBILE_WIDTH_KEY];
      const zoomChange = changes[GEM_COMPARE_LANGUAGES_ZOOM_KEY];
      if (!desktopChange && !mobileChange && !zoomChange) return;

      applyCompareLanguagesSettings({
        [GEM_COMPARE_LANGUAGES_DESKTOP_WIDTH_KEY]: desktopChange
          ? desktopChange.newValue
          : compareWidthSettings.desktop,
        [GEM_COMPARE_LANGUAGES_MOBILE_WIDTH_KEY]: mobileChange
          ? mobileChange.newValue
          : compareWidthSettings.mobile,
        [GEM_COMPARE_LANGUAGES_ZOOM_KEY]: zoomChange
          ? zoomChange.newValue
          : compareZoomLevel,
      });

      const modal = getModalEl();
      if (modal) syncCompareModalUi(modal);
    });
  }

  function getRootDocument() {
    try {
      return window.top && window.top.document ? window.top.document : document;
    } catch (_) {
      return document;
    }
  }

  function normalizeOptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getLanguageLabelFromOption(opt) {
    if (!opt) return '';
    const nameEl = opt.querySelector('vce-language-name');
    let label = nameEl ? String(nameEl.textContent || '').trim() : normalizeOptionText(opt.textContent || '');
    label = label.replace(/\s*-\s*master\s*$/i, '').trim();
    return label || normalizeOptionText(opt.textContent || '');
  }

  function isOptionSelected(opt) {
    if (!opt) return false;
    const attr = opt.getAttribute && opt.getAttribute('selected');
    if (attr === 'true' || attr === 'selected') return true;
    if (attr === '' && opt.hasAttribute && opt.hasAttribute('selected')) return true;
    if (typeof opt.selected === 'boolean' && opt.selected) return true;
    return false;
  }

  function getLanguageSelectorState() {
    const rootDoc = getRootDocument();
    const selector = rootDoc.querySelector('vce-languages-selector');
    if (!selector) return { selector: null, options: [], currentValue: null };

    const options = Array.from(selector.querySelectorAll('e-select-option')).filter((opt) => {
      if (!opt || opt.nodeType !== Node.ELEMENT_NODE) return false;
      const disabledAttr = opt.getAttribute && opt.getAttribute('disabled');
      const ariaDisabled = opt.getAttribute && opt.getAttribute('aria-disabled');
      return !disabledAttr && ariaDisabled !== 'true';
    });

    let currentValue = null;
    try {
      const hidden = selector.querySelector('input[type="hidden"]');
      if (hidden && hidden.value) currentValue = hidden.value;
    } catch (_) {}

    if (!currentValue) {
      const selectedOpt = options.find(isOptionSelected);
      if (selectedOpt) {
        currentValue = selectedOpt.getAttribute('value') || selectedOpt.id || null;
      }
    }

    return { selector, options, currentValue, rootDoc };
  }

  function getCampaignLanguages() {
    const { options } = getLanguageSelectorState();
    return options.map((opt) => {
      const value = String(opt.getAttribute('value') || opt.id || '').trim();
      const text = normalizeOptionText(opt.textContent || '');
      return {
        value,
        label: getLanguageLabelFromOption(opt),
        isMaster: /\s-\s*master\s*$/i.test(text),
      };
    }).filter((entry) => entry.value);
  }

  function getSelectedLanguageValue() {
    return getLanguageSelectorState().currentValue;
  }

  function getPreviewContainer() {
    return getRootDocument().querySelector('vce-iframes-container');
  }

  function getPreviewContent() {
    const container = getPreviewContainer();
    if (!container) return '';
    return String(container.getAttribute('content') || '').trim();
  }

  function sanitizePreviewHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';

    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      PREVIEW_SANITIZE_SELECTORS.forEach((selector) => {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      });
      return doc.documentElement.outerHTML;
    } catch (_) {
      return raw;
    }
  }

  function captureSanitizedPreviewHtml() {
    return sanitizePreviewHtml(getPreviewContent());
  }

  function getActionListItemLabelText(item) {
    if (!item || item.nodeType !== Node.ELEMENT_NODE) return '';
    if (!item.querySelector('.gem-lang-preflight-badge')) {
      return normalizeOptionText(item.textContent || '');
    }
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.gem-lang-preflight-badge').forEach((el) => el.remove());
    return normalizeOptionText(clone.textContent || '');
  }

  function getLanguageActionList(state) {
    if (!state || !state.options || !state.options.length) return null;
    const optionTexts = state.options.map((opt) => normalizeOptionText(opt.textContent || '')).filter(Boolean);
    const optionTextSet = new Set(optionTexts);
    const rootDoc = state.rootDoc || getRootDocument();
    const containers = Array.from(
      rootDoc.querySelectorAll(
        'e-float-container e-actionlist .e-actionlist__itemscontainer, e-actionlist .e-actionlist__itemscontainer'
      )
    ).map((container) => ({
      container,
      items: Array.from(container.querySelectorAll('.e-actionlist__item[role="option"]')),
    }));

    let best = null;
    containers.forEach(({ container, items }) => {
      if (!items.length) return;
      let matches = 0;
      items.forEach((item) => {
        if (optionTextSet.has(getActionListItemLabelText(item))) matches += 1;
      });
      if (!best || matches > best.matches) {
        best = { container, items, matches };
      }
    });

    if (!best || best.matches === 0) return null;
    return best;
  }

  function openLanguageSelectorDropdown(state) {
    if (!state || !state.selector) return false;
    const trigger =
      state.selector.querySelector('.e-selectnew[role="button"]') ||
      state.selector.querySelector('.e-selectnew__wrapper [role="button"]');
    if (!trigger) return false;
    try {
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      trigger.click();
      return true;
    } catch (_) {
      try {
        trigger.click();
        return true;
      } catch (_) {}
    }
    return false;
  }

  function trySelectLanguageOption(state, targetOption) {
    const targetText = normalizeOptionText(targetOption.textContent || '');
    const match = getLanguageActionList(state);
    if (!match) return false;

    const targetItem = match.items.find((item) => {
      const itemText = getActionListItemLabelText(item);
      return itemText === targetText && itemText.length > 0;
    });
    if (!targetItem) return false;

    try {
      targetItem.click();
      return true;
    } catch (_) {
      try {
        targetItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      } catch (_) {}
    }
    return false;
  }

  function selectLanguageByValue(targetValue) {
    const value = String(targetValue || '').trim();
    if (!value) return Promise.resolve(false);

    return new Promise((resolve) => {
      const state = getLanguageSelectorState();
      const targetOption = state.options.find((opt) => {
        const optVal = String(opt.getAttribute('value') || opt.id || '').trim();
        return optVal === value;
      });
      if (!targetOption) {
        resolve(false);
        return;
      }

      if (getSelectedLanguageValue() === value) {
        resolve(true);
        return;
      }

      if (trySelectLanguageOption(state, targetOption)) {
        resolve(true);
        return;
      }

      if (!openLanguageSelectorDropdown(state)) {
        resolve(false);
        return;
      }

      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        const freshState = getLanguageSelectorState();
        const opt =
          freshState.options.find((o) => String(o.getAttribute('value') || o.id || '').trim() === value) ||
          targetOption;
        if (trySelectLanguageOption(freshState, opt)) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (attempts >= SELECT_MAX_ATTEMPTS) {
          clearInterval(interval);
          resolve(false);
        }
      }, SELECT_POLL_MS);
    });
  }

  function waitForEditorPreviewReady(targetValue, previousContent, requireContentChange) {
    const target = String(targetValue || '').trim();
    const prev = String(previousContent || '');

    return new Promise((resolve, reject) => {
      const container = getPreviewContainer();
      if (!container) {
        reject(new Error('no-preview-container'));
        return;
      }

      let debounceTimer = null;
      let settled = false;
      let observer = null;
      let previewIframe = null;
      let sawPreviewIframeLoad = false;
      let selectionMatchedAt = null;
      let identicalSettleTimer = null;

      function cleanup() {
        if (observer) observer.disconnect();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (identicalSettleTimer) clearTimeout(identicalSettleTimer);
        if (previewIframe) previewIframe.removeEventListener('load', onPreviewIframeLoad);
        clearTimeout(timeoutId);
      }

      function finish(err) {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve();
      }

      function clearIdenticalSettleTimer() {
        if (!identicalSettleTimer) return;
        clearTimeout(identicalSettleTimer);
        identicalSettleTimer = null;
      }

      function armIdenticalSettleTimer() {
        if (identicalSettleTimer || !requireContentChange) return;
        identicalSettleTimer = setTimeout(() => {
          identicalSettleTimer = null;
          scheduleResolve();
        }, IDENTICAL_CONTENT_SETTLE_MS);
      }

      function noteTargetSelection() {
        if (getSelectedLanguageValue() !== target) {
          selectionMatchedAt = null;
          clearIdenticalSettleTimer();
          return;
        }

        const content = getPreviewContent();
        if (!content) return;

        if (requireContentChange && content !== prev) {
          clearIdenticalSettleTimer();
          return;
        }

        if (!selectionMatchedAt) {
          selectionMatchedAt = Date.now();
          armIdenticalSettleTimer();
        }
      }

      function onPreviewIframeLoad() {
        sawPreviewIframeLoad = true;
        clearIdenticalSettleTimer();
        scheduleResolve();
      }

      function isReady() {
        if (getSelectedLanguageValue() !== target) return false;
        const content = getPreviewContent();
        if (!content) return false;
        if (!requireContentChange) return true;
        if (content !== prev) return true;
        if (sawPreviewIframeLoad) return true;
        // In-memory locales with identical HTML may not update the content attribute.
        return !!selectionMatchedAt && Date.now() - selectionMatchedAt >= IDENTICAL_CONTENT_SETTLE_MS;
      }

      function onPreviewStateChange() {
        if (captureAbort) {
          finish(new Error('aborted'));
          return;
        }
        noteTargetSelection();
        if (isReady()) scheduleResolve();
      }

      function scheduleResolve() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (isReady()) finish(null);
        }, PREVIEW_DEBOUNCE_MS);
      }

      const timeoutId = setTimeout(() => {
        if (
          requireContentChange &&
          getSelectedLanguageValue() === target &&
          getPreviewContent()
        ) {
          finish(null);
          return;
        }
        finish(new Error('timeout'));
      }, PREVIEW_READY_TIMEOUT_MS);

      if (isReady()) {
        scheduleResolve();
        return;
      }

      noteTargetSelection();

      observer = new MutationObserver(() => {
        onPreviewStateChange();
      });

      observer.observe(container, { attributes: true, attributeFilter: ['content'] });

      if (requireContentChange) {
        try {
          previewIframe = getRootDocument().querySelector('iframe.e-contentblocks-preview__iframe-desktop');
          if (previewIframe) {
            previewIframe.addEventListener('load', onPreviewIframeLoad);
          }
        } catch (_) {}
      }

      const langSelector = getLanguageSelectorState().selector;
      if (langSelector) {
        observer.observe(langSelector, {
          attributes: true,
          subtree: true,
          attributeFilter: ['selected', 'value'],
        });
        langSelector.querySelectorAll('e-select-option').forEach((opt) => {
          observer.observe(opt, { attributes: true, attributeFilter: ['selected'] });
        });
      }
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

  function makeCompareColumnMenuItem(label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gem-recent-campaign-row-menu-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = label;
    return btn;
  }

  function createCompareColumnOverflowMenu(entry, modal, { isActiveLanguage } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'gem-recent-campaign-row-menu-wrap gem-compare-languages-column__menu-wrap';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gem-recent-campaign-row-menu-trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', `Options for ${entry.label}`);

    const menu = document.createElement('div');
    menu.className = 'gem-recent-campaign-row-menu';
    menu.setAttribute('role', 'menu');

    if (!isActiveLanguage) {
      const editItem = makeCompareColumnMenuItem('Edit');
      editItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCompareColumnMenu();
        closeCompareLanguagesModal();
        void selectLanguageByValue(entry.value);
      });
      menu.appendChild(editItem);
    }

    const closeItem = makeCompareColumnMenuItem('Hide');
    closeItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCompareColumnMenu();
      removeComparisonColumn(modal, entry.value);
    });
    menu.appendChild(closeItem);

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

  function removeComparisonColumn(modal, langValue) {
    const value = String(langValue || '').trim();
    activeComparisonCaptures = activeComparisonCaptures.filter((entry) => entry.value !== value);
    if (activeComparisonCaptures.length <= 1) {
      closeCompareLanguagesModal();
      return;
    }

    const row = modal.querySelector('.gem-compare-languages-modal__columns');
    const col = row
      ? Array.from(row.querySelectorAll('.gem-compare-languages-column')).find(
          (el) => el.dataset.gemCompareLanguage === value
        )
      : null;
    if (col) {
      col.remove();
      return;
    }

    renderComparisonResults(modal, activeComparisonCaptures);
  }

  function unbindModalEscape() {
    if (typeof escapeUnsub === 'function') escapeUnsub();
    escapeUnsub = null;
  }

  function getModalEl() {
    return document.getElementById(MODAL_ID);
  }

  function closeCompareLanguagesModal() {
    captureAbort = true;
    compareDeviceMode = 'desktop';
    activeComparisonCaptures = [];
    closeCompareColumnMenu();
    unbindModalEscape();
    const modal = getModalEl();
    if (modal) {
      if (typeof window.gemLayerRelease === 'function') window.gemLayerRelease(modal);
      modal.remove();
    }
  }

  function setModalLoading(modal, message) {
    const body = modal.querySelector('.gem-compare-languages-modal__body');
    if (!body) return;
    body.innerHTML = `
      <div class="gem-compare-languages-modal__loading">
        <div class="gem-compare-languages-modal__spinner" aria-hidden="true"></div>
        <p class="gem-compare-languages-modal__status">${message || 'Preparing…'}</p>
        <button type="button" class="e-btn gem-compare-languages-modal__cancel">Cancel</button>
      </div>
    `.trim();
    body.querySelector('.gem-compare-languages-modal__cancel')?.addEventListener('click', () => {
      closeCompareLanguagesModal();
    });
  }

  function sortComparisonCaptures(captures) {
    const activeValue = String(getSelectedLanguageValue() || '').trim();
    return captures.slice().sort((a, b) => {
      const aActive = activeValue && a.value === activeValue;
      const bActive = activeValue && b.value === activeValue;
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' });
    });
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

  function setColumnFrameLoading(frameWrap) {
    if (!frameWrap) return;
    frameWrap.innerHTML = `
      <div class="gem-compare-languages-column__loading">
        <div class="gem-compare-languages-modal__spinner gem-compare-languages-column__spinner" aria-hidden="true"></div>
        <p class="gem-compare-languages-column__loading-text">Loading preview…</p>
      </div>
    `.trim();
  }

  function renderComparisonColumnFrame(frameWrap, entry, modal) {
    if (!frameWrap) return;
    frameWrap.innerHTML = '';

    if (entry.error || !entry.html) {
      const err = document.createElement('div');
      err.className = 'gem-compare-languages-column__error';

      const message = document.createElement('p');
      message.className = 'gem-compare-languages-column__error-message';
      message.textContent = entry.error || 'Preview failed to load';
      err.appendChild(message);

      if (entry.error !== 'Cancelled') {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'e-btn e-btn-primary gem-compare-languages-column__retry-btn';
        retryBtn.textContent = 'Try again';
        retryBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          void retryComparisonColumnCapture(modal, entry.value);
        });
        err.appendChild(retryBtn);
      }

      frameWrap.appendChild(err);
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.className = 'gem-compare-languages-column__iframe';
    iframe.title = `Preview: ${entry.label}`;
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.srcdoc = entry.html;
    iframe.addEventListener('error', () => {
      renderComparisonColumnFrame(frameWrap, {
        ...entry,
        html: '',
        error: 'Preview failed to load',
      }, modal);
    });
    frameWrap.appendChild(iframe);
  }

  async function retryComparisonColumnCapture(modal, langValue) {
    const value = String(langValue || '').trim();
    const lang = activeComparisonCaptures.find((entry) => entry.value === value);
    if (!lang || !modal) return;

    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-language="${value}"]`);
    const frameWrap = col && col.querySelector('.gem-compare-languages-column__frame-wrap');
    setColumnFrameLoading(frameWrap);

    const originalLanguage = getSelectedLanguageValue();
    try {
      const result = await captureLanguagePreview(
        modal,
        lang,
        `Retrying ${lang.label}…`,
        { showModalLoading: false }
      );
      if (!result) return;

      const nextEntry = { ...lang, ...result };
      activeComparisonCaptures = activeComparisonCaptures.map((entry) => (
        entry.value === value ? nextEntry : entry
      ));

      if (frameWrap) {
        renderComparisonColumnFrame(frameWrap, nextEntry, modal);
      } else {
        renderComparisonResults(modal, activeComparisonCaptures);
      }
    } finally {
      await restoreLanguageIfNeeded(originalLanguage, getSelectedLanguageValue());
    }
  }

  function renderComparisonResults(modal, captures) {
    const body = modal.querySelector('.gem-compare-languages-modal__body');
    if (!body) return;

    closeCompareColumnMenu();
    const existingRow = body.querySelector('.gem-compare-languages-modal__columns');
    const savedScrollLeft = existingRow ? existingRow.scrollLeft : 0;
    activeComparisonCaptures = sortComparisonCaptures(captures);
    const activeLanguageValue = String(getSelectedLanguageValue() || '').trim();

    const row = document.createElement('div');
    row.className = 'gem-compare-languages-modal__columns';

    activeComparisonCaptures.forEach((entry) => {
      const isActiveLanguage = !!activeLanguageValue && entry.value === activeLanguageValue;
      const col = document.createElement('div');
      col.className = 'gem-compare-languages-column' + (isActiveLanguage ? ' gem-compare-languages-column--active' : '');
      col.dataset.gemCompareLanguage = entry.value;

      const header = document.createElement('div');
      header.className = 'gem-compare-languages-column__header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'gem-compare-languages-column__header-title-wrap';

      const title = document.createElement('div');
      title.className = 'gem-compare-languages-column__header-title';
      title.textContent = entry.label + (entry.isMaster ? ' (master)' : '');

      if (isActiveLanguage) {
        const chip = document.createElement('span');
        chip.className = 'gem-compare-languages-column__active-chip';
        chip.textContent = 'Active';
        titleWrap.appendChild(chip);
      }

      titleWrap.appendChild(title);

      header.appendChild(titleWrap);
      header.appendChild(createCompareColumnOverflowMenu(entry, modal, { isActiveLanguage }));

      const frameWrap = document.createElement('div');
      frameWrap.className = 'gem-compare-languages-column__frame-wrap';
      renderComparisonColumnFrame(frameWrap, entry, modal);

      col.appendChild(header);
      col.appendChild(frameWrap);
      row.appendChild(col);
    });

    body.innerHTML = '';
    body.appendChild(row);
    restoreColumnsScrollLeft(row, savedScrollLeft);
    syncCompareModalUi(modal);
  }

  function ensureModalShell() {
    let modal = getModalEl();
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'gem-compare-languages-modal gem-layer-modal';
    modal.innerHTML = `
      <div class="gem-compare-languages-modal__panel" role="dialog" aria-modal="true" aria-labelledby="gem-compare-languages-modal-title">
        <div class="gem-compare-languages-modal__header">
          <div id="gem-compare-languages-modal-title" class="gem-compare-languages-modal__title">Language Comparison</div>
          <div class="gem-compare-languages-modal__header-actions">
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
        <div class="gem-compare-languages-modal__body"></div>
      </div>
    `.trim();

    modal.querySelector('.gem-compare-languages-modal__close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCompareLanguagesModal();
    });

    bindCompareDeviceToggle(modal);
    bindCompareWidthInput(modal);
    bindCompareZoomToggle(modal);
    syncCompareModalUi(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal.querySelector('.gem-compare-languages-modal__close')) return;
      // No backdrop dismiss — avoid accidental close during capture
    });

    document.body.appendChild(modal);

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(modal, { tier: 'modal' });
    }

    unbindModalEscape();
    if (typeof window.gemLayerBindEscape === 'function') {
      escapeUnsub = window.gemLayerBindEscape(closeCompareLanguagesModal, {
        whileConnected: () => !!getModalEl(),
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

  async function restoreLanguageIfNeeded(originalValue, currentAfterCapture) {
    const original = String(originalValue || '').trim();
    if (!original) return;
    const current = String(currentAfterCapture || getSelectedLanguageValue() || '').trim();
    if (!current || current === original) return;
    await selectLanguageByValue(original);
    try {
      await waitForEditorPreviewReady(original, getPreviewContent(), false);
    } catch (_) {}
  }

  async function captureLanguagePreview(modal, lang, statusMessage, options = {}) {
    const showModalLoading = options.showModalLoading !== false;
    if (showModalLoading) {
      setModalLoading(modal, statusMessage);
    }

    const previousContent = getPreviewContent();
    const wasSelected = getSelectedLanguageValue() === lang.value;

    if (!wasSelected) {
      const selected = await selectLanguageByValue(lang.value);
      if (!selected) {
        return { ...lang, html: '', error: 'Could not switch to this language' };
      }
    }

    try {
      await waitForEditorPreviewReady(lang.value, previousContent, !wasSelected);
    } catch (err) {
      return {
        ...lang,
        html: '',
        error: err && err.message === 'aborted' ? 'Cancelled' : 'Preview timed out',
      };
    }

    if (captureAbort) return null;

    const html = captureSanitizedPreviewHtml();
    return {
      ...lang,
      html,
      error: html ? '' : 'Preview failed to load',
    };
  }

  async function runLanguageComparisonCapture(modal) {
    const languages = getCampaignLanguages();
    if (languages.length < 2) {
      if (window.gemShowToast) {
        window.gemShowToast('This campaign does not have multiple languages.', { type: 'error' });
      }
      closeCompareLanguagesModal();
      return;
    }

    const originalLanguage = getSelectedLanguageValue();
    captureAbort = false;
    const capturesByValue = new Map();
    const otherLanguages = languages.filter((entry) => entry.value !== originalLanguage);
    const originalEntry = languages.find((entry) => entry.value === originalLanguage);

    try {
      for (let i = 0; i < otherLanguages.length; i += 1) {
        if (captureAbort) break;

        const lang = otherLanguages[i];
        const entry = await captureLanguagePreview(
          modal,
          lang,
          `Capturing ${lang.label}… ${i + 1} of ${languages.length}`
        );
        if (!entry) break;

        capturesByValue.set(lang.value, entry);
        if (entry.error === 'Cancelled') break;
      }

      if (!captureAbort && originalEntry && originalLanguage) {
        const entry = await captureLanguagePreview(
          modal,
          originalEntry,
          `Capturing ${originalEntry.label}… (current language)`
        );
        if (entry) capturesByValue.set(originalLanguage, entry);
      }

      if (captureAbort) return;

      const captures = languages.map((lang) => (
        capturesByValue.get(lang.value) || { ...lang, html: '', error: 'Not captured' }
      ));

      renderComparisonResults(modal, captures);
    } finally {
      await restoreLanguageIfNeeded(originalLanguage, getSelectedLanguageValue());
    }
  }

  function openCompareLanguagesModal() {
    if (getCampaignLanguages().length < 2) {
      if (window.gemShowToast) {
        window.gemShowToast('Compare Languages requires at least two language versions.', { type: 'error' });
      }
      return;
    }

    loadCompareLanguagesSettings(() => {
      closeCompareLanguagesModal();
      captureAbort = false;

      const modal = ensureModalShell();
      syncCompareModalUi(modal);
      setModalLoading(modal, 'Preparing language comparison…');
      void runLanguageComparisonCapture(modal);
    });
  }

  function gemCanCompareLanguages() {
    return getCampaignLanguages().length >= 2;
  }

  function syncCompareLanguagesOverflowMenuItem() {
    const item = document.querySelector('[data-gem-compare-languages-menu]');
    if (!item) return;
    const show = gemCanCompareLanguages();
    item.hidden = !show;
    item.style.display = show ? '' : 'none';
  }

  function ensureLocalesTabToolbar() {
    const content = document.querySelector('cb-locales-tab .e-section__content');
    if (!content || !gemCanCompareLanguages()) {
      if (localesTabToolbarEl && localesTabToolbarEl.isConnected) {
        localesTabToolbarEl.remove();
      }
      localesTabToolbarEl = null;
      return;
    }

    if (localesTabToolbarEl && content.contains(localesTabToolbarEl)) return;

    if (localesTabToolbarEl) localesTabToolbarEl.remove();

    const toolbar = document.createElement('div');
    toolbar.className = TOOLBAR_CLASS;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'e-btn e-btn-primary gem-compare-languages-toolbar__btn';
    btn.textContent = 'Compare Languages';
    btn.addEventListener('click', () => openCompareLanguagesModal());
    toolbar.appendChild(btn);
    content.insertBefore(toolbar, content.firstChild);
    localesTabToolbarEl = toolbar;
  }

  function initCompareLanguages() {
    ensureCompareSettingsListener();
    loadCompareLanguagesSettings();

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        syncCompareLanguagesOverflowMenuItem();
        ensureLocalesTabToolbar();
      });
    }

    syncCompareLanguagesOverflowMenuItem();
    ensureLocalesTabToolbar();
  }

  window.gemOpenCompareLanguagesModal = openCompareLanguagesModal;
  window.gemCanCompareLanguages = gemCanCompareLanguages;
  window.gemSyncCompareLanguagesOverflowMenuItem = syncCompareLanguagesOverflowMenuItem;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareLanguages);
  } else {
    initCompareLanguages();
  }
})();
