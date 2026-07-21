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
  let captureGeneration = 0;
  let captureInFlight = false;
  let languageEslSnapshotInFlight = false;
  const localesTabToolbarRef = { current: null };

  function getCurrentCampaignId() {
    try {
      return (new URL(window.location.href).searchParams.get('id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getCurrentSessionId() {
    try {
      return (new URL(window.location.href).searchParams.get('session_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function beginCaptureGeneration() {
    captureAbort = false;
    captureGeneration += 1;
    return captureGeneration;
  }

  function isCurrentCaptureGeneration(generation) {
    return !captureAbort && generation === captureGeneration;
  }

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

  function getLanguageTagFromLocalesRow(row) {
    if (!row) return '';
    const cols = row.querySelectorAll('td.e-table__col');
    if (cols.length < 2) return '';
    const tagCell = cols[1].querySelector('.e-datagrid__column_content') || cols[1];
    return normalizeOptionText(tagCell.textContent || '');
  }

  function getLanguageNameFromLocalesRow(row) {
    if (!row) return '';
    const cols = row.querySelectorAll('td.e-table__col');
    if (!cols.length) return '';
    const nameCell = cols[0].querySelector('.e-datagrid__column_content') || cols[0];
    const clone = nameCell.cloneNode(true);
    clone.querySelectorAll('.text-color-shade').forEach((el) => el.remove());
    return normalizeOptionText(clone.textContent || '');
  }

  function resolveLanguageValueFromLocalesRow(row, languages) {
    const entries = Array.isArray(languages) ? languages : [];
    const tag = getLanguageTagFromLocalesRow(row);
    if (tag && entries.some((entry) => entry.value === tag)) return tag;

    const name = getLanguageNameFromLocalesRow(row);
    if (!name) return tag;

    const exactLabel = entries.find((entry) => (
      normalizeOptionText(entry.label) === name
    ));
    if (exactLabel) return exactLabel.value;

    const partialLabel = entries.find((entry) => {
      const label = normalizeOptionText(entry.label);
      return label && (name.includes(label) || label.includes(name));
    });
    return partialLabel ? partialLabel.value : tag;
  }

  function isInboxPreviewActive() {
    const inbox = document.querySelector('cb-campaign-inbox-preview');
    return !!(inbox && !inbox.hasAttribute('hidden'));
  }

  function ensureLiveEditorView() {
    if (!isInboxPreviewActive()) return true;
    const btn = document.querySelector('button[aria-label="Live Preview"]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  function activateBlocksNavTab() {
    const tab = document.querySelector('#blocksTab e-verticalnav-item');
    if (!tab) return false;
    tab.click();
    return true;
  }

  async function openLanguageForEditing(languageValue) {
    const value = String(languageValue || '').trim();
    if (!value) return false;

    const languages = getCampaignLanguages();
    if (!languages.some((entry) => entry.value === value)) {
      if (window.gemShowToast) {
        window.gemShowToast('Could not find that language on this campaign.', { type: 'error' });
      }
      return false;
    }

    if (!ensureLiveEditorView()) {
      if (window.gemShowToast) {
        window.gemShowToast('Could not switch to Live Editor.', { type: 'error' });
      }
      return false;
    }

    const selected = await selectLanguageByValue(value);
    if (!selected) {
      if (window.gemShowToast) {
        window.gemShowToast('Could not switch to that language.', { type: 'error' });
      }
      return false;
    }

    activateBlocksNavTab();
    return true;
  }

  function createLocalesTabOpenControl(languageValue) {
    const tooltip = document.createElement('e-tooltip');
    tooltip.setAttribute('content', 'Open');

    const link = document.createElement('a');
    link.className = 'e-datagrid__item_action e-btn e-btn-onlyicon e-btn-borderless e-inputgroup__item e-inputgroup__item-first gem-locales-tab-open-link';
    link.setAttribute('href', '#');
    link.setAttribute('aria-label', 'Open');
    link.setAttribute('aria-description', '');
    link.dataset.gemLocalesLanguageValue = languageValue;
    link.innerHTML = (
      '<e-icon icon="edit" type="table">' +
      '<div aria-hidden="true" class="e-icon-wrapper">' +
      '<div class="e-icon e-icon-table">\uF0CE</div>' +
      '</div></e-icon>'
    );

    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openLanguageForEditing(languageValue);
    });

    tooltip.appendChild(link);
    return tooltip;
  }

  function ensureLocalesTabOpenLinks() {
    const list = document.querySelector('cb-locales-tab vce-languages-list');
    if (!list) return;

    const languages = getCampaignLanguages();
    if (!languages.length) return;

    const currentLanguageValue = String(getSelectedLanguageValue() || '').trim();

    list.querySelectorAll('tbody tr.e-datagrid__row').forEach((row) => {
      const languageValue = resolveLanguageValueFromLocalesRow(row, languages);
      if (!languageValue || !languages.some((entry) => entry.value === languageValue)) return;

      const actionsCell = row.querySelector('td.e-table__col-actions');
      if (!actionsCell) return;

      const legacyBtn = actionsCell.querySelector('.gem-locales-tab-edit-btn');
      if (legacyBtn) {
        legacyBtn.closest('e-tooltip')?.remove();
      }

      const existingLink = actionsCell.querySelector('.gem-locales-tab-open-link');
      const isCurrentLanguage = !!currentLanguageValue && languageValue === currentLanguageValue;

      if (isCurrentLanguage) {
        if (existingLink) existingLink.closest('e-tooltip')?.remove();
        return;
      }

      if (existingLink) {
        existingLink.dataset.gemLocalesLanguageValue = languageValue;
        return;
      }

      const actionsWrap = actionsCell.querySelector(':scope > div') || actionsCell;
      actionsWrap.insertBefore(createLocalesTabOpenControl(languageValue), actionsWrap.firstChild);
    });
  }

  function ensureLocalesTabOpenLinksWatcher() {
    if (ensureLocalesTabOpenLinksWatcher.bound) return;
    ensureLocalesTabOpenLinksWatcher.bound = true;

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (!target.closest('vce-languages-selector')) return;
      window.setTimeout(() => ensureLocalesTabOpenLinks(), 0);
    }, true);

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        const selector = document.querySelector('vce-languages-selector');
        if (!selector) return;
        ensureLocalesTabOpenLinks();
      });
    }
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

  function captureEditorFieldSources() {
    const emailBasics = window.gemCompareEmailBasicsCapture;
    if (emailBasics && typeof emailBasics.captureEditorFieldSourcesFromDoc === 'function') {
      return emailBasics.captureEditorFieldSourcesFromDoc(getRootDocument());
    }

    const rootDoc = getRootDocument();
    const subjectCm = rootDoc.querySelector('#subject-line-input vce-codemirror');
    const subjectHtml = subjectCm ? String(subjectCm.getAttribute('html') || '') : '';
    const preheaderEl = rootDoc.querySelector('cb-preheader textarea');
    const preheaderText = preheaderEl ? String(preheaderEl.value || '') : '';
    return { subjectHtml, preheaderText };
  }

  async function captureEditorFieldSourcesWithEmailBasics() {
    const emailBasics = window.gemCompareEmailBasicsCapture;
    if (emailBasics && typeof emailBasics.captureEmailBasicsFields === 'function') {
      return emailBasics.captureEmailBasicsFields(getRootDocument());
    }
    return captureEditorFieldSources();
  }

  function refreshCompareEslUsageIfActive(modal) {
    if (!modal) return;
    if (typeof common.getContentView === 'function' && common.getContentView() !== 'esl-usage') return;
    if (typeof window.gemRefreshCompareEslUsageTable === 'function') {
      window.gemRefreshCompareEslUsageTable(modal);
    }
  }

  function refreshCompareReviewLinksIfActive(modal) {
    if (!modal) return;
    if (typeof common.getContentView === 'function' && common.getContentView() !== 'links') return;
    if (typeof window.gemRefreshCompareReviewLinksTable === 'function') {
      window.gemRefreshCompareReviewLinksTable(modal);
    }
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
        noteTargetSelection();
        scheduleResolve();
      }

      function isReady() {
        if (getSelectedLanguageValue() !== target) return false;
        const content = getPreviewContent();
        if (!content) return false;
        if (!requireContentChange) return true;
        if (content !== prev) return true;
        // Identical HTML: wait for settle — do not treat iframe load alone as ready
        // (load often fires while the previous language is still showing).
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
          if (captureAbort) {
            finish(new Error('aborted'));
            return;
          }
          if (isReady()) finish(null);
        }, PREVIEW_DEBOUNCE_MS);
      }

      const timeoutId = setTimeout(() => {
        if (captureAbort) {
          finish(new Error('aborted'));
          return;
        }
        if (getSelectedLanguageValue() !== target) {
          finish(new Error('timeout'));
          return;
        }
        const content = getPreviewContent();
        if (!content) {
          finish(new Error('timeout'));
          return;
        }
        if (!requireContentChange) {
          finish(null);
          return;
        }
        if (content !== prev) {
          finish(null);
          return;
        }
        if (selectionMatchedAt && Date.now() - selectionMatchedAt >= IDENTICAL_CONTENT_SETTLE_MS) {
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
      empty.className = 'gem-overflow-menu-wrap gem-compare-languages-column__menu-wrap';
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
    const inReviewScripts = typeof common.getContentView === 'function'
      && common.getContentView() === 'esl-usage';

    if (inReviewScripts && activeComparisonCaptures.length <= 1) {
      return;
    }

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
    captureGeneration += 1;
    captureInFlight = false;
    languageEslSnapshotInFlight = false;
    activeComparisonCaptures = [];
  }

  function createPendingLanguageCaptures(languages) {
    return languages.map((lang) => ({
      ...lang,
      html: '',
      bodyHtml: '',
      subjectHtml: '',
      preheaderText: '',
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
    if (col) {
      common.ensureCompareColumnMetaRow(col, {
        subjectHtml: captured.subjectHtml,
        preheaderText: captured.preheaderText,
      });
      common.syncCompareSubjectPreviewUi(modal);
    }
    if (frameWrap) {
      renderComparisonColumnFrame(frameWrap, captured, modal);
    }
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
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
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
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
    if (captureInFlight) {
      if (window.gemShowToast) {
        window.gemShowToast('Wait for the comparison capture to finish before retrying.', { type: 'warning' });
      }
      return;
    }

    const value = String(langValue || '').trim();
    const lang = activeComparisonCaptures.find((entry) => entry.value === value);
    if (!lang || !modal) return;

    const generation = beginCaptureGeneration();
    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-language="${value}"]`);
    const frameWrap = col && col.querySelector('.gem-compare-languages-column__frame-wrap');
    common.setColumnLoading(frameWrap);

    const originalLanguage = getSelectedLanguageValue();
    captureInFlight = true;
    try {
      const result = await captureLanguagePreview(modal, lang, { generation });
      if (!isCurrentCaptureGeneration(generation) || !result) return;

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
      captureInFlight = false;
      if (isCurrentCaptureGeneration(generation)) {
        await restoreLanguageIfNeeded(originalLanguage, getSelectedLanguageValue());
      }
    }
  }

  function renderComparisonResults(modal, captures) {
    const panel = getLanguagesPanel(modal);
    if (!panel) return;

    if (
      common.isCompareModePanelLoaded(modal, COMPARE_MODE)
      && common.hasCompareModePreviewColumns(modal, COMPARE_MODE)
    ) {
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

      const metaRow = common.createCompareColumnMetaRow();
      common.updateCompareColumnMetaRow(col, {
        subjectHtml: entry.subjectHtml,
        preheaderText: entry.preheaderText,
      });

      const frameWrap = document.createElement('div');
      frameWrap.className = 'gem-compare-languages-column__frame-wrap';
      renderComparisonColumnFrame(frameWrap, entry, modal);

      col.appendChild(header);
      col.appendChild(metaRow);
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
    common.syncCompareSubjectPreviewUi(modal);
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
  }

  function refreshLanguageColumnMeta(modal, entry) {
    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-language="${entry.value}"]`);
    if (!col) return;
    common.ensureCompareColumnMetaRow(col, {
      subjectHtml: entry.subjectHtml,
      preheaderText: entry.preheaderText,
    });
  }

  function refreshAllLanguageColumnMeta(modal) {
    activeComparisonCaptures.forEach((entry) => refreshLanguageColumnMeta(modal, entry));
    common.syncCompareSubjectPreviewUi(modal);
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
      refreshAllLanguageColumnMeta(modal);
    } else {
      common.syncModalUi(modal);
    }
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
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
    const generation = typeof options.generation === 'number' ? options.generation : captureGeneration;
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

    if (!isCurrentCaptureGeneration(generation)) return null;

    const bodyHtml = captureSanitizedPreviewHtml();
    let { subjectHtml, preheaderText } = await captureEditorFieldSourcesWithEmailBasics();
    if (!isCurrentCaptureGeneration(generation)) return null;

    if (!preheaderText) {
      const emailBasics = window.gemCompareEmailBasicsCapture;
      if (emailBasics && typeof emailBasics.extractPreheaderFromBodyHtml === 'function') {
        preheaderText = emailBasics.extractPreheaderFromBodyHtml(bodyHtml);
      }
    }

    return {
      ...lang,
      html: bodyHtml,
      bodyHtml,
      subjectHtml,
      preheaderText,
      error: bodyHtml ? '' : 'Preview failed to load',
    };
  }

  async function captureCurrentEditorPreview(modal, options = {}) {
    const generation = typeof options.generation === 'number' ? options.generation : captureGeneration;
    const bodyHtml = captureSanitizedPreviewHtml();
    let { subjectHtml, preheaderText } = await captureEditorFieldSourcesWithEmailBasics();
    if (!isCurrentCaptureGeneration(generation)) return null;

    if (!preheaderText) {
      const emailBasics = window.gemCompareEmailBasicsCapture;
      if (emailBasics && typeof emailBasics.extractPreheaderFromBodyHtml === 'function') {
        preheaderText = emailBasics.extractPreheaderFromBodyHtml(bodyHtml);
      }
    }

    const selectedValue = String(getSelectedLanguageValue() || '').trim();
    return {
      value: selectedValue || 'current',
      label: 'Email',
      html: bodyHtml,
      bodyHtml,
      subjectHtml,
      preheaderText,
      error: bodyHtml ? '' : 'Preview failed to load',
    };
  }

  async function runLanguageComparisonCapture(modal, options = {}) {
    if (captureInFlight) return;
    const allowSingle = options.allowSingle === true;
    const languages = getCampaignLanguages();
    const generation = beginCaptureGeneration();
    captureInFlight = true;

    try {
      if (languages.length < 2) {
        if (!allowSingle) {
          if (window.gemShowToast) {
            window.gemShowToast('This campaign does not have multiple languages.', { type: 'error' });
          }
          closeCompareLanguagesModal();
          return;
        }

        if (languages.length === 1) {
          const entry = languages[0].value === 'current'
            ? await captureCurrentEditorPreview(modal, { generation })
            : await captureLanguagePreview(modal, languages[0], { generation });
          if (entry && isCurrentCaptureGeneration(generation)) {
            updateComparisonColumnCapture(modal, entry);
          }
          return;
        }

        const entry = await captureCurrentEditorPreview(modal, { generation });
        if (entry && isCurrentCaptureGeneration(generation)) {
          updateComparisonColumnCapture(modal, entry);
        }
        return;
      }

      const originalLanguage = getSelectedLanguageValue();
      const otherLanguages = languages.filter((entry) => entry.value !== originalLanguage);
      const originalEntry = languages.find((entry) => entry.value === originalLanguage);

      try {
        for (let i = 0; i < otherLanguages.length; i += 1) {
          if (!isCurrentCaptureGeneration(generation)) break;

          const lang = otherLanguages[i];
          const entry = await captureLanguagePreview(modal, lang, { generation });
          if (!entry || !isCurrentCaptureGeneration(generation)) break;

          updateComparisonColumnCapture(modal, entry);
          if (entry.error === 'Cancelled') break;
        }

        if (isCurrentCaptureGeneration(generation) && originalEntry && originalLanguage) {
          const entry = await captureLanguagePreview(modal, originalEntry, { generation });
          if (entry && isCurrentCaptureGeneration(generation)) {
            updateComparisonColumnCapture(modal, entry);
          }
        }

        if (!isCurrentCaptureGeneration(generation)) {
          markPendingLanguageCaptures(modal, languages, 'Cancelled');
        }
      } finally {
        if (isCurrentCaptureGeneration(generation)) {
          await restoreLanguageIfNeeded(originalLanguage, getSelectedLanguageValue());
        }
      }
    } finally {
      if (generation === captureGeneration) {
        captureInFlight = false;
      }
    }
  }

  function resolveCompareLanguageEntries(options = {}) {
    const allowSingle = options.allowSingle === true;
    const languages = getCampaignLanguages();
    if (languages.length || !allowSingle) return languages;
    return [{ value: 'current', label: 'Email', isMaster: false }];
  }

  async function captureLanguageEslSourcesFromSnapshots(modal) {
    if (!modal || languageEslSnapshotInFlight) return;
    if (typeof window.gemFetchContentBlocksSnapshot !== 'function') {
      refreshCompareEslUsageIfActive(modal);
      void runLanguageComparisonCapture(modal, { allowSingle: true });
      return;
    }

    languageEslSnapshotInFlight = true;
    const generation = beginCaptureGeneration();

    if (!activeComparisonCaptures.length) {
      activeComparisonCaptures = sortComparisonCaptures(
        createPendingLanguageCaptures(resolveCompareLanguageEntries({ allowSingle: true }))
      );
    }

    activeComparisonCaptures = activeComparisonCaptures.map((entry) => ({
      ...entry,
      pending: true,
    }));
    refreshCompareEslUsageIfActive(modal);

    try {
      if (typeof window.gemPrepareFreshCampaignSnapshot === 'function') {
        await window.gemPrepareFreshCampaignSnapshot();
      }
      if (!isCurrentCaptureGeneration(generation)) return;

      const sessionId = getCurrentSessionId();
      const campaignId = getCurrentCampaignId();
      if (!sessionId || !campaignId) {
        markPendingLanguageCaptures(modal, activeComparisonCaptures, 'Unable to load script data.');
        return;
      }

      const languageKeys = activeComparisonCaptures
        .map((entry) => String(entry.value || '').trim())
        .filter(Boolean);

      const snapshotResult = await window.gemFetchContentBlocksSnapshot(
        campaignId,
        sessionId,
        languageKeys,
        { forceRefresh: true }
      );

      if (!isCurrentCaptureGeneration(generation)) return;

      if (!snapshotResult.ok || !snapshotResult.campaign) {
        markPendingLanguageCaptures(modal, activeComparisonCaptures, 'Failed to load script data.');
        return;
      }

      const linksData = window.gemCampaignLinksData;
      const eslByLanguage = linksData && typeof linksData.extractEslSourcesByLanguage === 'function'
        ? linksData.extractEslSourcesByLanguage(snapshotResult.campaign, languageKeys)
        : {};

      activeComparisonCaptures = activeComparisonCaptures.map((entry) => {
        const key = String(entry.value || '').trim();
        const eslSources = eslByLanguage[key] || {
          bodyHtml: '',
          subjectHtml: '',
          preheaderText: '',
        };
        return {
          ...entry,
          bodyHtml: eslSources.bodyHtml,
          subjectHtml: eslSources.subjectHtml,
          preheaderText: eslSources.preheaderText,
          html: eslSources.bodyHtml,
          error: eslSources.bodyHtml || eslSources.subjectHtml || eslSources.preheaderText
            ? ''
            : 'No script data found',
          pending: false,
        };
      });

      common.setCompareModePanelLoaded(modal, COMPARE_MODE, true);
    } catch (_) {
      if (isCurrentCaptureGeneration(generation)) {
        markPendingLanguageCaptures(modal, activeComparisonCaptures, 'Failed to load script data.');
      }
    } finally {
      languageEslSnapshotInFlight = false;
      if (isCurrentCaptureGeneration(generation)) {
        refreshCompareEslUsageIfActive(modal);
      }
    }
  }

  function ensureCompareLanguagesEslUsage(modal) {
    if (!modal) return;
    if (typeof common.getContentView === 'function' && common.getContentView() !== 'esl-usage') return;

    if (!activeComparisonCaptures.length) {
      activeComparisonCaptures = sortComparisonCaptures(
        createPendingLanguageCaptures(resolveCompareLanguageEntries({ allowSingle: true }))
      );
    }

    const needsCapture = activeComparisonCaptures.some((entry) => (
      entry.pending || !String(entry.bodyHtml || entry.html || '').trim()
    ));

    if (needsCapture) {
      void captureLanguageEslSourcesFromSnapshots(modal);
      return;
    }

    refreshCompareEslUsageIfActive(modal);
  }

  function ensureCompareLanguagesPreviews(modal) {
    if (!modal) return;
    if (common.hasCompareModePreviewColumns(modal, COMPARE_MODE)) return;

    if (!activeComparisonCaptures.length) {
      activeComparisonCaptures = sortComparisonCaptures(
        createPendingLanguageCaptures(resolveCompareLanguageEntries({ allowSingle: true }))
      );
    }

    renderComparisonResults(modal, activeComparisonCaptures);
    void runLanguageComparisonCapture(modal, { allowSingle: true });
  }

  function openCompareLanguagesModal(options = {}) {
    const allowSingle = options.allowSingle === true;
    const contentView = options.contentView !== undefined
      ? options.contentView
      : (typeof common.getContentView === 'function' ? common.getContentView() : undefined);
    const isLinksView = contentView === 'links';
    const isEslUsageView = contentView === 'esl-usage';
    const languages = resolveCompareLanguageEntries({ allowSingle });
    const minCount = allowSingle ? 1 : 2;

    if (languages.length < minCount) {
      if (!allowSingle && window.gemShowToast) {
        window.gemShowToast('Compare Languages requires at least two language versions.', { type: 'error' });
      }
      return false;
    }

    common.loadSettings(() => {
      const modal = common.ensureCompareModal({
        compareMode: COMPARE_MODE,
      });
      common.switchCompareMode(modal, COMPARE_MODE);
      if (contentView && typeof common.setContentView === 'function') {
        common.setContentView(modal, contentView);
      }

      if (common.isCompareModePanelLoaded(modal, COMPARE_MODE)) {
        ensureCompareLanguagesVisible(modal);
        if (isEslUsageView) ensureCompareLanguagesEslUsage(modal);
        return;
      }

      common.syncModalUi(modal);

      activeComparisonCaptures = sortComparisonCaptures(createPendingLanguageCaptures(languages));

      if (isLinksView || isEslUsageView) {
        common.setCompareModePanelLoaded(modal, COMPARE_MODE, true);
        if (isEslUsageView) {
          ensureCompareLanguagesEslUsage(modal);
        } else {
          refreshCompareReviewLinksIfActive(modal);
        }
        return;
      }

      renderComparisonResults(modal, activeComparisonCaptures);
      void runLanguageComparisonCapture(modal, { allowSingle });
    });
    return true;
  }

  function gemCanCompareLanguages() {
    return getCampaignLanguages().length >= 2;
  }

  function syncComparePreviewsOverflowMenuItem() {
    if (typeof common.syncComparePreviewsOverflowMenuItem === 'function') {
      common.syncComparePreviewsOverflowMenuItem();
    }
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
    if (window.__gemCompareLanguagesInitialized) return;
    window.__gemCompareLanguagesInitialized = true;

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
        syncComparePreviewsOverflowMenuItem();
        ensureLocalesTabToolbar();
        ensureLocalesTabOpenLinks();
      });
    }

    syncComparePreviewsOverflowMenuItem();
    ensureLocalesTabToolbar();
    ensureLocalesTabOpenLinksWatcher();
    ensureLocalesTabOpenLinks();
  }

  window.gemOpenCompareLanguagesModal = openCompareLanguagesModal;
  window.gemCloseCompareLanguagesModal = closeCompareLanguagesModal;
  window.gemCanCompareLanguages = gemCanCompareLanguages;
  window.gemEnsureCompareLanguagesPreviews = ensureCompareLanguagesPreviews;
  window.gemEnsureCompareLanguagesEslUsage = ensureCompareLanguagesEslUsage;
  window.gemGetCompareLanguageCaptures = () => activeComparisonCaptures.slice();
  window.gemSyncComparePreviewsOverflowMenuItem = syncComparePreviewsOverflowMenuItem;
  window.gemGetCampaignLanguages = getCampaignLanguages;
  window.gemGetSelectedLanguageValue = getSelectedLanguageValue;
  window.gemSelectLanguageByValue = selectLanguageByValue;
  window.gemOpenLanguageForEditing = openLanguageForEditing;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareLanguages);
  } else {
    initCompareLanguages();
  }
})();
