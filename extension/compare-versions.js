// compare-versions.js — multi-version side-by-side preview comparison
(function () {
  const common = window.gemComparePreviewCommon;
  if (!common) return;

  const COMPARE_MODE = 'versions';

  let activeComparisonVersions = [];
  const versionsTabToolbarRef = { current: null };

  function getModalEl() {
    return common.getCompareModal();
  }

  function getVersionsPanel(modal) {
    return common.getCompareModePanel(modal, COMPARE_MODE);
  }

  function parseVersionLetter(text) {
    const match = String(text || '').match(/#\s*([a-z])/i)
      || String(text || '').match(/version\s*#?\s*([a-z])/i);
    return match && match[1] ? match[1].toUpperCase() : '';
  }

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

  function idForCanonicalCampaignQuery(id) {
    const s = String(id || '').trim();
    if (!s) return '';
    return /^[a-zA-Z0-9_-]+$/.test(s) ? s : encodeURIComponent(s);
  }

  function urlBaseFromCampaignId(id) {
    const idForQuery = idForCanonicalCampaignQuery(String(id || '').trim());
    if (!idForQuery) return '';
    try {
      const u = new URL(window.location.href);
      return `${u.origin}/bootstrap.php?r=contentBlocks/campaign&id=${idForQuery}`;
    } catch (_) {
      return '';
    }
  }

  function buildPreviewIframeUrl(campaignId) {
    const idForQuery = idForCanonicalCampaignQuery(String(campaignId || '').trim());
    if (!idForQuery) return '';
    try {
      const url = new URL('/bootstrap.php', window.location.origin);
      url.searchParams.set('r', 'contentBlocks/campaign');
      url.searchParams.set('id', idForQuery);
      const sid = getCurrentSessionId();
      if (sid) url.searchParams.set('session_id', sid);
      url.searchParams.set('gemStripped', 'true');
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  function getCampaignVersions() {
    const select = document.querySelector('cb-version-selector select');
    if (!select) return [];

    return [...select.options]
      .map((opt) => {
        const id = String(opt.value || '').trim();
        const rawLabel = String(opt.textContent || '').trim();
        const letter = parseVersionLetter(rawLabel);
        const label = letter ? `Version ${letter}` : (rawLabel || id);
        return { id, letter, label, urlBase: urlBaseFromCampaignId(id) };
      })
      .filter((entry) => entry.id);
  }

  function gemCanCompareVersions() {
    return getCampaignVersions().length >= 2;
  }

  function sortComparisonVersions(versions) {
    const activeId = getCurrentCampaignId();
    const pinnedEntryKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeId);
    return common.sortEntries(versions, {
      pinnedEntryKey,
      getEntryKey: (entry) => entry.id,
      getSortLabel: (entry) => entry.letter || entry.label || '',
    });
  }

  function applyCompareColumnOrder(modal) {
    if (!modal || !activeComparisonVersions.length) return;
    activeComparisonVersions = sortComparisonVersions(activeComparisonVersions);
    const activeVersionId = getCurrentCampaignId();
    const pinnedEntryKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeVersionId);
    common.applyColumnsLayout(modal, activeComparisonVersions, {
      compareMode: COMPARE_MODE,
      datasetKey: 'gemCompareVersion',
      getEntryKey: (entry) => entry.id,
      pinnedEntryKey,
    });
    refreshVersionsColumnPinUi(modal);
  }

  function renderVersionColumnError(frameWrap, entry, modal) {
    if (!frameWrap) return;
    frameWrap.innerHTML = '';

    const err = document.createElement('div');
    err.className = 'gem-compare-languages-column__error';

    const message = document.createElement('p');
    message.className = 'gem-compare-languages-column__error-message';
    message.textContent = entry.error || 'Preview failed to load';
    err.appendChild(message);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'e-btn e-btn-primary gem-compare-languages-column__retry-btn';
    retryBtn.textContent = 'Try again';
    retryBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      renderVersionColumnFrame(frameWrap, entry, modal);
    });
    err.appendChild(retryBtn);
    frameWrap.appendChild(err);
  }

  function renderVersionColumnFrame(frameWrap, entry, modal) {
    if (!frameWrap) return;

    const previewUrl = buildPreviewIframeUrl(entry.id);
    if (!previewUrl) {
      renderVersionColumnError(frameWrap, { ...entry, error: 'Preview URL unavailable' }, modal);
      return;
    }

    const existingIframe = frameWrap.querySelector('iframe.gem-compare-languages-column__iframe');
    if (existingIframe && existingIframe.getAttribute('src') === previewUrl) {
      const loading = frameWrap.querySelector('.gem-compare-languages-column__loading');
      if (loading) loading.remove();
      return;
    }

    common.setColumnLoading(frameWrap);

    const iframe = document.createElement('iframe');
    iframe.className = 'gem-compare-languages-column__iframe';
    iframe.title = `Preview: ${entry.label}`;
    iframe.addEventListener('load', () => {
      if (iframe.dataset.gemLoadFailed === 'true') return;
      const loading = frameWrap.querySelector('.gem-compare-languages-column__loading');
      if (loading) loading.remove();
    });
    iframe.addEventListener('error', () => {
      iframe.dataset.gemLoadFailed = 'true';
      renderVersionColumnError(frameWrap, { ...entry, error: 'Preview failed to load' }, modal);
    });

    frameWrap.appendChild(iframe);
    iframe.setAttribute('src', previewUrl);
  }

  function createCompareVersionColumnOverflowMenu(entry, modal, {
    isActiveVersion,
    isPinned,
    pinnedKey,
  } = {}) {
    const items = [];
    const onLayoutChange = (nextModal) => {
      applyCompareColumnOrder(nextModal);
    };

    items.push(common.buildComparePinMenuItem(
      entry.id,
      isActiveVersion,
      COMPARE_MODE,
      modal,
      onLayoutChange,
      { isPinned }
    ));

    if (!isActiveVersion && entry.urlBase) {
      items.push({
        label: 'Switch to version',
        onClick: () => {
          closeCompareVersionsModal();
          window.location.assign(entry.urlBase);
        },
      });
    }

    items.push({
      label: 'Hide',
      onClick: () => removeComparisonVersionColumn(modal, entry.id),
    });

    return common.createColumnOverflowMenu(entry.label, items);
  }

  function rebuildVersionsOverflowMenu(entryKey, isPinned, pinnedKey) {
    const entry = activeComparisonVersions.find((item) => item.id === entryKey);
    if (!entry) {
      const empty = document.createElement('div');
      empty.className = 'gem-recent-campaign-row-menu-wrap gem-compare-languages-column__menu-wrap';
      return empty;
    }
    const activeVersionId = getCurrentCampaignId();
    return createCompareVersionColumnOverflowMenu(entry, getModalEl(), {
      isActiveVersion: !!activeVersionId && entry.id === activeVersionId,
      isPinned,
      pinnedKey,
    });
  }

  function refreshVersionsColumnPinUi(modal) {
    common.refreshCompareColumnPinUi(modal, COMPARE_MODE, {
      datasetKey: 'gemCompareVersion',
      getActiveEntryKey: getCurrentCampaignId,
      rebuildOverflowMenu: rebuildVersionsOverflowMenu,
    });
  }

  function removeComparisonVersionColumn(modal, versionId) {
    const id = String(versionId || '').trim();
    const activeVersionId = getCurrentCampaignId();
    const pinnedKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeVersionId);
    if (pinnedKey === id) {
      common.unpinCompareEntry(COMPARE_MODE, modal);
    }
    activeComparisonVersions = activeComparisonVersions.filter((entry) => entry.id !== id);
    if (activeComparisonVersions.length <= 1) {
      closeCompareVersionsModal();
      return;
    }

    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-version="${id}"]`);
    if (col) {
      col.querySelectorAll('iframe').forEach((iframe) => {
        iframe.setAttribute('src', 'about:blank');
      });
      col.remove();
      applyCompareColumnOrder(modal);
      return;
    }

    renderComparisonResults(modal, activeComparisonVersions);
  }

  function resetVersionsCompareState() {
    activeComparisonVersions = [];
  }

  function closeCompareVersionsModal() {
    common.closeCompareModal();
  }

  function renderComparisonResults(modal, versions) {
    const panel = getVersionsPanel(modal);
    if (!panel) return;

    if (common.isCompareModePanelLoaded(modal, COMPARE_MODE)) {
      ensureCompareVersionsVisible(modal);
      return;
    }

    common.closeColumnMenu();
    activeComparisonVersions = sortComparisonVersions(versions);
    const activeVersionId = getCurrentCampaignId();
    const pinnedEntryKey = common.resolvePinnedEntryKey(COMPARE_MODE, activeVersionId);
    const columnsByKey = new Map();

    activeComparisonVersions.forEach((entry) => {
      const isActiveVersion = !!activeVersionId && entry.id === activeVersionId;
      const isPinned = !!pinnedEntryKey && entry.id === pinnedEntryKey;
      const col = document.createElement('div');
      col.className = 'gem-compare-languages-column' + (isActiveVersion ? ' gem-compare-languages-column--active' : '');
      col.dataset.gemCompareVersion = entry.id;

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

      if (isActiveVersion) {
        const chip = document.createElement('span');
        chip.className = 'gem-compare-languages-column__active-chip';
        chip.textContent = 'Active';
        titleWrap.appendChild(chip);
      }

      const title = document.createElement('div');
      title.className = 'gem-compare-languages-column__header-title';
      title.textContent = entry.label;
      titleWrap.appendChild(title);

      header.appendChild(titleWrap);
      header.appendChild(createCompareVersionColumnOverflowMenu(entry, modal, {
        isActiveVersion,
        isPinned,
        pinnedKey: pinnedEntryKey,
      }));

      const frameWrap = document.createElement('div');
      frameWrap.className = 'gem-compare-languages-column__frame-wrap';
      renderVersionColumnFrame(frameWrap, entry, modal);

      col.appendChild(header);
      col.appendChild(frameWrap);
      columnsByKey.set(entry.id, col);
    });

    common.mountComparisonColumns(panel, activeComparisonVersions, {
      datasetKey: 'gemCompareVersion',
      getEntryKey: (entry) => entry.id,
      pinnedEntryKey,
      columnsByKey,
      modal,
    });
    common.setCompareModePanelLoaded(modal, COMPARE_MODE, true);
    common.syncModalUi(modal);
    refreshVersionsColumnPinUi(modal);
  }

  function restoreVersionsStateFromPanel(modal) {
    if (activeComparisonVersions.length) return;
    const panel = getVersionsPanel(modal);
    if (!panel || !common.isCompareModePanelLoaded(modal, COMPARE_MODE)) return;

    const ids = [...panel.querySelectorAll('.gem-compare-languages-column[data-gem-compare-version]')]
      .map((col) => String(col.dataset.gemCompareVersion || '').trim())
      .filter(Boolean);
    if (!ids.length) return;

    const versionsById = new Map(getCampaignVersions().map((entry) => [entry.id, entry]));
    activeComparisonVersions = ids
      .map((id) => versionsById.get(id))
      .filter(Boolean);
  }

  function ensureCompareVersionsVisible(modal) {
    if (!modal) return;
    if (!common.isCompareModePanelLoaded(modal, COMPARE_MODE)) return;

    restoreVersionsStateFromPanel(modal);
    if (activeComparisonVersions.length) {
      applyCompareColumnOrder(modal);
    } else {
      common.syncModalUi(modal);
    }
  }

  function openCompareVersionsModal() {
    const versions = getCampaignVersions();
    if (versions.length < 2) {
      if (window.gemShowToast) {
        window.gemShowToast('Compare Versions requires at least two campaign versions.', { type: 'error' });
      }
      return;
    }

    common.loadSettings(() => {
      const modal = common.ensureCompareModal({
        compareMode: COMPARE_MODE,
      });
      common.switchCompareMode(modal, COMPARE_MODE);

      if (common.isCompareModePanelLoaded(modal, COMPARE_MODE)) {
        ensureCompareVersionsVisible(modal);
        return;
      }

      common.syncModalUi(modal);
      renderComparisonResults(modal, versions);
    });
  }

  function syncCompareVersionsOverflowMenuItem() {
    common.syncOverflowMenuItem({
      menuSelector: '[data-gem-compare-versions-menu]',
      canShow: gemCanCompareVersions,
    });
  }

  function ensureVersionsTabToolbar() {
    common.ensureTabToolbar({
      tabSelector: 'cb-versions .e-section__content',
      toolbarClass: common.TOOLBAR_CLASS,
      buttonText: 'Compare Versions',
      canShow: gemCanCompareVersions,
      onClick: () => openCompareVersionsModal(),
      toolbarRef: versionsTabToolbarRef,
    });
  }

  function initCompareVersions() {
    common.ensureSettingsListener();
    common.registerCompareModeHandler(COMPARE_MODE, {
      onActivate: ensureCompareVersionsVisible,
      onLayoutChange: applyCompareColumnOrder,
      onClose: resetVersionsCompareState,
    });
    common.registerLayoutRefreshHandler((modal) => {
      if (!modal || modal.dataset.gemCompareMode !== COMPARE_MODE) return;
      if (!activeComparisonVersions.length) return;
      applyCompareColumnOrder(modal);
    });
    common.loadSettings();

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        syncCompareVersionsOverflowMenuItem();
        ensureVersionsTabToolbar();
      });
    }

    syncCompareVersionsOverflowMenuItem();
    ensureVersionsTabToolbar();
  }

  window.gemOpenCompareVersionsModal = openCompareVersionsModal;
  window.gemCloseCompareVersionsModal = closeCompareVersionsModal;
  window.gemCanCompareVersions = gemCanCompareVersions;
  window.gemSyncCompareVersionsOverflowMenuItem = syncCompareVersionsOverflowMenuItem;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareVersions);
  } else {
    initCompareVersions();
  }
})();
