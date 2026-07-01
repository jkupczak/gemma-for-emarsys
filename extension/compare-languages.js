// compare-languages.js — multi-language side-by-side preview comparison
(function () {
  const common = window.gemComparePreviewCommon;
  if (!common) return;

  const COMPARE_MODE = 'languages';
  const PREVIEW_READY_TIMEOUT_MS = 4000;
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

  let activeComparisonCaptures = [];
  let captureAbort = false;
  const localesTabToolbarRef = { current: null };

  function getModalEl() {
    return common.getCompareModal();
  }

  function getLanguagesPanel(modal) {
    return common.getCompareModePanel(modal, COMPARE_MODE);
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

  function createCompareColumnOverflowMenu(entry, modal, {
    isActiveLanguage,
    isPinned,
    pinnedKey,
  } = {}) {
    const items = [];
    const onLayoutChange = (nextModal) => {
      applyCompareColumnOrder(nextModal);
    };

    items.push(common.buildComparePinMenuItem(
      entry.value,
      isActiveLanguage,
      COMPARE_MODE,
      modal,
      onLayoutChange,
      { isPinned }
    ));

    if (!isActiveLanguage) {
      items.push({
        label: 'Edit',
        onClick: () => {
          closeCompareLanguagesModal();
          void selectLanguageByValue(entry.value);
        },
      });
    }

    items.push({
      label: 'Hide',
      onClick: () => removeComparisonColumn(modal, entry.value),
    });

    return common.createColumnOverflowMenu(entry.label, items);
  }

  function rebuildLanguagesOverflowMenu(entryKey, isPinned, pinnedKey) {
    const entry = activeComparisonCaptures.find((item) => item.value === entryKey);
    if (!entry) {
      const empty = document.createElement('div');
      empty.className = 'gem-recent-campaign-row-menu-wrap gem-compare-languages-column__menu-wrap';
      return empty;
    }
    const activeLanguageValue = String(getSelectedLanguageValue() || '').trim();
    return createCompareColumnOverflowMenu(entry, getModalEl(), {
      isActiveLanguage: !!activeLanguageValue && entry.value === activeLanguageValue,
      isPinned,
      pinnedKey,
    });
  }

  function refreshLanguagesColumnPinUi(modal) {
    common.refreshCompareColumnPinUi(modal, COMPARE_MODE, {
      datasetKey: 'gemCompareLanguage',
      getActiveEntryKey: getSelectedLanguageValue,
      rebuildOverflowMenu: rebuildLanguagesOverflowMenu,
    });
  }

  function removeComparisonColumn(modal, langValue) {
    const value = String(langValue || '').trim();
    const activeLanguageValue = String(getSelectedLanguageValue() || '').trim();
    const pinnedKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeLanguageValue);
    if (pinnedKey === value) {
      common.unpinCompareEntry(COMPARE_MODE, modal);
    }
    activeComparisonCaptures = activeComparisonCaptures.filter((entry) => entry.value !== value);
    if (activeComparisonCaptures.length <= 1) {
      closeCompareLanguagesModal();
      return;
    }

    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-language="${value}"]`);
    if (col) {
      col.remove();
      applyCompareColumnOrder(modal);
      return;
    }

    renderComparisonResults(modal, activeComparisonCaptures);
  }

  function closeCompareLanguagesModal() {
    common.closeCompareModal();
  }

  function resetLanguagesCompareState() {
    captureAbort = true;
    activeComparisonCaptures = [];
  }

  function createPendingLanguageCaptures(languages) {
    return languages.map((lang) => ({
      ...lang,
      html: '',
      error: '',
      pending: true,
    }));
  }

  function updateComparisonColumnCapture(modal, entry) {
    const value = String(entry.value || '').trim();
    if (!value) return;

    activeComparisonCaptures = activeComparisonCaptures.map((item) => (
      item.value === value ? { ...item, ...entry, pending: false } : item
    ));

    const captured = activeComparisonCaptures.find((item) => item.value === value) || entry;
    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-language="${value}"]`);
    const frameWrap = col && col.querySelector('.gem-compare-languages-column__frame-wrap');
    if (frameWrap) {
      renderComparisonColumnFrame(frameWrap, captured, modal);
    }
  }

  function markPendingLanguageCaptures(modal, languages, errorMessage) {
    languages.forEach((lang) => {
      const existing = activeComparisonCaptures.find((entry) => entry.value === lang.value);
      if (existing && !existing.pending) return;
      updateComparisonColumnCapture(modal, {
        ...lang,
        ...(existing || {}),
        html: '',
        error: errorMessage,
        pending: false,
      });
    });
  }

  function sortComparisonCaptures(captures) {
    const activeValue = String(getSelectedLanguageValue() || '').trim();
    const pinnedEntryKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeValue);
    return common.sortEntries(captures, {
      pinnedEntryKey,
      getEntryKey: (entry) => entry.value,
      getSortLabel: (entry) => entry.label || '',
    });
  }

  function applyCompareColumnOrder(modal) {
    if (!modal || !activeComparisonCaptures.length) return;
    activeComparisonCaptures = sortComparisonCaptures(activeComparisonCaptures);
    const activeLanguageValue = String(getSelectedLanguageValue() || '').trim();
    const pinnedEntryKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeLanguageValue);
    common.applyColumnsLayout(modal, activeComparisonCaptures, {
      compareMode: COMPARE_MODE,
      datasetKey: 'gemCompareLanguage',
      getEntryKey: (entry) => entry.value,
      pinnedEntryKey,
    });
    refreshLanguagesColumnPinUi(modal);
  }

  function renderComparisonColumnFrame(frameWrap, entry, modal) {
    if (!frameWrap) return;

    if (entry.pending || (!entry.html && !entry.error)) {
      common.setColumnLoading(frameWrap);
      return;
    }

    if (entry.error || !entry.html) {
      frameWrap.innerHTML = '';
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

    const existingIframe = frameWrap.querySelector('iframe.gem-compare-languages-column__iframe');
    if (existingIframe && existingIframe.srcdoc === entry.html) return;

    frameWrap.innerHTML = '';

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
    common.setColumnLoading(frameWrap);

    const originalLanguage = getSelectedLanguageValue();
    try {
      const result = await captureLanguagePreview(modal, lang);
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
    const panel = getLanguagesPanel(modal);
    if (!panel) return;

    if (common.isCompareModePanelLoaded(modal, COMPARE_MODE)) {
      ensureCompareLanguagesVisible(modal);
      return;
    }

    common.closeColumnMenu();
    activeComparisonCaptures = sortComparisonCaptures(captures);
    const activeLanguageValue = String(getSelectedLanguageValue() || '').trim();
    const pinnedEntryKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeLanguageValue);
    const columnsByKey = new Map();

    activeComparisonCaptures.forEach((entry) => {
      const isActiveLanguage = !!activeLanguageValue && entry.value === activeLanguageValue;
      const isPinned = !!pinnedEntryKey && entry.value === pinnedEntryKey;
      const col = document.createElement('div');
      col.className = 'gem-compare-languages-column' + (isActiveLanguage ? ' gem-compare-languages-column--active' : '');
      col.dataset.gemCompareLanguage = entry.value;

      const header = document.createElement('div');
      header.className = 'gem-compare-languages-column__header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'gem-compare-languages-column__header-title-wrap';

      const pinBtn = common.createCompareColumnPinButton(() => {
        common.unpinCompareEntry(COMPARE_MODE, modal, (nextModal) => {
          applyCompareColumnOrder(nextModal);
        });
      });
      pinBtn.hidden = !isPinned;
      titleWrap.appendChild(pinBtn);

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
      header.appendChild(createCompareColumnOverflowMenu(entry, modal, {
        isActiveLanguage,
        isPinned,
        pinnedKey: pinnedEntryKey,
      }));

      const frameWrap = document.createElement('div');
      frameWrap.className = 'gem-compare-languages-column__frame-wrap';
      renderComparisonColumnFrame(frameWrap, entry, modal);

      col.appendChild(header);
      col.appendChild(frameWrap);
      columnsByKey.set(entry.value, col);
    });

    common.mountComparisonColumns(panel, activeComparisonCaptures, {
      datasetKey: 'gemCompareLanguage',
      getEntryKey: (entry) => entry.value,
      pinnedEntryKey,
      columnsByKey,
      modal,
    });
    common.setCompareModePanelLoaded(modal, COMPARE_MODE, true);
    common.syncModalUi(modal);
    refreshLanguagesColumnPinUi(modal);
  }

  function restoreLanguagesStateFromPanel(modal) {
    if (activeComparisonCaptures.length) return;
    const panel = getLanguagesPanel(modal);
    if (!panel || !common.isCompareModePanelLoaded(modal, COMPARE_MODE)) return;

    const values = [...panel.querySelectorAll('.gem-compare-languages-column[data-gem-compare-language]')]
      .map((col) => String(col.dataset.gemCompareLanguage || '').trim())
      .filter(Boolean);
    if (!values.length) return;

    const capturesByValue = new Map(getCampaignLanguages().map((entry) => [entry.value, entry]));
    activeComparisonCaptures = values
      .map((value) => capturesByValue.get(value))
      .filter(Boolean);
  }

  function ensureCompareLanguagesVisible(modal) {
    if (!modal) return;
    if (!common.isCompareModePanelLoaded(modal, COMPARE_MODE)) return;

    restoreLanguagesStateFromPanel(modal);
    if (activeComparisonCaptures.length) {
      applyCompareColumnOrder(modal);
    } else {
      common.syncModalUi(modal);
    }
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

  async function captureLanguagePreview(modal, lang, options = {}) {
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
    const otherLanguages = languages.filter((entry) => entry.value !== originalLanguage);
    const originalEntry = languages.find((entry) => entry.value === originalLanguage);

    try {
      for (let i = 0; i < otherLanguages.length; i += 1) {
        if (captureAbort) break;

        const lang = otherLanguages[i];
        const entry = await captureLanguagePreview(modal, lang);
        if (!entry) break;

        updateComparisonColumnCapture(modal, entry);
        if (entry.error === 'Cancelled') break;
      }

      if (!captureAbort && originalEntry && originalLanguage) {
        const entry = await captureLanguagePreview(modal, originalEntry);
        if (entry) updateComparisonColumnCapture(modal, entry);
      }

      if (captureAbort) {
        markPendingLanguageCaptures(modal, languages, 'Cancelled');
      }
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

    common.loadSettings(() => {
      captureAbort = false;

      const modal = common.ensureCompareModal({
        compareMode: COMPARE_MODE,
      });
      common.switchCompareMode(modal, COMPARE_MODE);

      if (common.isCompareModePanelLoaded(modal, COMPARE_MODE)) {
        ensureCompareLanguagesVisible(modal);
        return;
      }

      common.syncModalUi(modal);

      const languages = getCampaignLanguages();
      activeComparisonCaptures = sortComparisonCaptures(createPendingLanguageCaptures(languages));
      renderComparisonResults(modal, activeComparisonCaptures);
      void runLanguageComparisonCapture(modal);
    });
  }

  function gemCanCompareLanguages() {
    return getCampaignLanguages().length >= 2;
  }

  function syncCompareLanguagesOverflowMenuItem() {
    common.syncOverflowMenuItem({
      menuSelector: '[data-gem-compare-languages-menu]',
      canShow: gemCanCompareLanguages,
    });
  }

  function ensureLocalesTabToolbar() {
    common.ensureTabToolbar({
      tabSelector: 'cb-locales-tab .e-section__content',
      toolbarClass: common.TOOLBAR_CLASS,
      buttonText: 'Compare Languages',
      canShow: gemCanCompareLanguages,
      onClick: () => openCompareLanguagesModal(),
      toolbarRef: localesTabToolbarRef,
    });
  }

  function initCompareLanguages() {
    common.ensureSettingsListener();
    common.registerCompareModeHandler(COMPARE_MODE, {
      onActivate: ensureCompareLanguagesVisible,
      onLayoutChange: applyCompareColumnOrder,
      onClose: resetLanguagesCompareState,
    });
    common.registerLayoutRefreshHandler((modal) => {
      if (!modal || modal.dataset.gemCompareMode !== COMPARE_MODE) return;
      if (!activeComparisonCaptures.length) return;
      applyCompareColumnOrder(modal);
    });
    common.loadSettings();

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
  window.gemCloseCompareLanguagesModal = closeCompareLanguagesModal;
  window.gemCanCompareLanguages = gemCanCompareLanguages;
  window.gemSyncCompareLanguagesOverflowMenuItem = syncCompareLanguagesOverflowMenuItem;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareLanguages);
  } else {
    initCompareLanguages();
  }
})();
