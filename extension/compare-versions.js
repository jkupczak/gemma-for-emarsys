// compare-versions.js — multi-version side-by-side preview comparison
(function () {
  const common = window.gemComparePreviewCommon;
  if (!common) return;

  const COMPARE_MODE = 'versions';

  let activeComparisonVersions = [];
  const versionsTabToolbarRef = { current: null };
  const versionEslCaptureInFlight = new Set();
  let versionEslCaptureGeneration = 0;
  let versionEslSnapshotInFlight = false;

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
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
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

  const VERSION_ESL_CAPTURE_TIMEOUT_MS = 20000;
  const VERSION_ESL_CAPTURE_POLL_MS = 250;
  const VERSION_ESL_PREVIEW_IFRAME_SELECTOR =
    'iframe.e-contentblocks-preview__iframe-desktop, iframe.e-contentblocks-preview__iframe';

  function extractBodyHtmlFromDoc(doc) {
    if (!doc) return '';

    const container = doc.querySelector('vce-iframes-container');
    const fromAttr = container ? String(container.getAttribute('content') || '').trim() : '';
    if (fromAttr) return fromAttr;

    const previewIframe = doc.querySelector(VERSION_ESL_PREVIEW_IFRAME_SELECTOR);
    if (!previewIframe) return '';

    try {
      const previewDoc = previewIframe.contentDocument;
      if (previewDoc && previewDoc.documentElement) {
        return String(previewDoc.documentElement.outerHTML || '').trim();
      }
    } catch (_) {}

    return '';
  }

  function extractEslSourcesFromDoc(doc) {
    if (!doc) {
      return { bodyHtml: '', subjectHtml: '', preheaderText: '' };
    }

    const bodyHtml = extractBodyHtmlFromDoc(doc);
    const emailBasics = window.gemCompareEmailBasicsCapture;
    if (emailBasics && typeof emailBasics.captureEditorFieldSourcesFromDoc === 'function') {
      const { subjectHtml, preheaderText } = emailBasics.captureEditorFieldSourcesFromDoc(doc);
      return { bodyHtml, subjectHtml, preheaderText };
    }

    const subjectCm = doc.querySelector('#subject-line-input vce-codemirror');
    const subjectHtml = subjectCm ? String(subjectCm.getAttribute('html') || '') : '';
    const preheaderEl = doc.querySelector('cb-preheader textarea');
    const preheaderText = preheaderEl ? String(preheaderEl.value || '') : '';

    return { bodyHtml, subjectHtml, preheaderText };
  }

  function isVersionBodyReady(doc) {
    if (!doc) return false;

    const container = doc.querySelector('vce-iframes-container');
    const containerContent = container ? String(container.getAttribute('content') || '').trim() : '';
    if (containerContent.length > 0) return true;

    const previewIframe = doc.querySelector(VERSION_ESL_PREVIEW_IFRAME_SELECTOR);
    if (!previewIframe) return false;

    try {
      const previewDoc = previewIframe.contentDocument;
      return !!(previewDoc && previewDoc.body && String(previewDoc.body.innerHTML || '').trim().length > 0);
    } catch (_) {
      return false;
    }
  }

  function isEslSourceCaptureReady(doc) {
    if (!doc) return false;
    if (isVersionBodyReady(doc)) return true;

    const emailBasics = window.gemCompareEmailBasicsCapture;
    if (emailBasics && typeof emailBasics.hasEmailBasicsFields === 'function' && emailBasics.hasEmailBasicsFields(doc)) {
      return true;
    }

    const subjectCm = doc.querySelector('#subject-line-input vce-codemirror');
    const subjectHtml = subjectCm ? String(subjectCm.getAttribute('html') || '').trim() : '';
    if (subjectHtml) return true;

    const preheaderEl = doc.querySelector('cb-preheader textarea');
    const preheaderText = preheaderEl ? String(preheaderEl.value || '').trim() : '';
    if (preheaderText) return true;

    return false;
  }

  function waitForVersionBodyReady(doc) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      function attempt() {
        if (isVersionBodyReady(doc) || Date.now() - startedAt >= VERSION_ESL_CAPTURE_TIMEOUT_MS) {
          resolve();
          return;
        }
        setTimeout(attempt, VERSION_ESL_CAPTURE_POLL_MS);
      }

      attempt();
    });
  }

  async function captureVersionEmailBasicsFields(doc, campaignId, bodyHtml) {
    const emailBasics = window.gemCompareEmailBasicsCapture;
    const id = String(campaignId || '').trim();
    let subjectHtml = '';
    let preheaderText = '';

    if (doc) {
      try {
        const win = doc.defaultView;
        const captureApi = win && win.gemCompareEmailBasicsCapture
          ? win.gemCompareEmailBasicsCapture
          : emailBasics;
        if (captureApi && typeof captureApi.captureEmailBasicsFields === 'function') {
          const fields = await captureApi.captureEmailBasicsFields(doc, {
            stripped: true,
            restoreTab: false,
            timeoutMs: 6000,
          });
          subjectHtml = fields.subjectHtml;
          preheaderText = fields.preheaderText;
        }
      } catch (_) {}
    }

    if ((!subjectHtml && !preheaderText) && emailBasics && id
      && typeof emailBasics.captureEmailBasicsFieldsForCampaign === 'function') {
      try {
        const fields = await emailBasics.captureEmailBasicsFieldsForCampaign(id, {
          timeoutMs: 15000,
          fieldTimeoutMs: 8000,
        });
        subjectHtml = fields.subjectHtml || subjectHtml;
        preheaderText = fields.preheaderText || preheaderText;
      } catch (_) {}
    }

    if (!preheaderText && emailBasics && typeof emailBasics.extractPreheaderFromBodyHtml === 'function') {
      preheaderText = emailBasics.extractPreheaderFromBodyHtml(bodyHtml);
    }

    return { subjectHtml, preheaderText };
  }

  async function waitForVersionEslSources(doc, campaignId) {
    if (!doc) {
      return { bodyHtml: '', subjectHtml: '', preheaderText: '' };
    }

    await waitForVersionBodyReady(doc);

    const bodyHtml = extractBodyHtmlFromDoc(doc);
    const { subjectHtml, preheaderText } = await captureVersionEmailBasicsFields(doc, campaignId, bodyHtml);
    return { bodyHtml, subjectHtml, preheaderText };
  }

  function getVersionColumnIframe(modal, versionId) {
    const id = String(versionId || '').trim();
    if (!modal || !id) return null;
    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-version="${id}"]`);
    return col ? col.querySelector('iframe.gem-compare-languages-column__iframe') : null;
  }

  function syncVersionEntryEslSources(modal, entry) {
    const base = { ...entry };
    const iframe = getVersionColumnIframe(modal, base.id);

    if (!iframe) {
      return {
        ...base,
        eslSources: base.eslSources || null,
        eslPending: !base.eslSources,
      };
    }

    try {
      const doc = iframe.contentDocument;
      if (!doc) {
        return {
          ...base,
          eslSources: base.eslSources || null,
          eslPending: true,
        };
      }

      if (isEslSourceCaptureReady(doc)) {
        return {
          ...base,
          eslSources: extractEslSourcesFromDoc(doc),
          eslPending: false,
        };
      }
    } catch (_) {}

    return {
      ...base,
      eslSources: base.eslSources || null,
      eslPending: !base.eslSources,
    };
  }

  function hasEslSourceData(sources) {
    if (!sources) return false;
    return Boolean(
      String(sources.bodyHtml || '').trim()
      || String(sources.subjectHtml || '').trim()
      || String(sources.preheaderText || '').trim()
    );
  }

  function needsVersionEslCapture(modal, entry) {
    if (!entry || versionEslCaptureInFlight.has(entry.id)) return false;

    const iframe = getVersionColumnIframe(modal, entry.id);
    if (!iframe) return false;

    if (entry.eslPending) return true;

    const sources = entry.eslSources || {};
    const hasBody = Boolean(String(sources.bodyHtml || '').trim());
    const hasSubjectPreview = Boolean(
      String(sources.subjectHtml || '').trim()
      || String(sources.preheaderText || '').trim()
    );

    if (hasBody && hasSubjectPreview) return false;

    try {
      const doc = iframe.contentDocument;
      if (!doc) return !hasBody;
      if (hasBody && !hasSubjectPreview) return true;
      return !hasEslSourceData(sources) && isEslSourceCaptureReady(doc);
    } catch (_) {
      return !hasBody;
    }
  }

  function ensureVersionEslSourcesCaptured(modal) {
    if (!modal || !activeComparisonVersions.length) return;

    activeComparisonVersions.forEach((entry) => {
      if (!needsVersionEslCapture(modal, entry)) return;
      const iframe = getVersionColumnIframe(modal, entry.id);
      if (iframe) captureVersionEslSourcesFromIframe(iframe, entry, modal);
    });
  }

  function refreshCompareEslUsageIfActive(modal) {
    if (!modal) return;
    if (typeof common.getContentView === 'function' && common.getContentView() !== 'esl-usage') return;
    ensureVersionEslSourcesCaptured(modal);
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

  function updateVersionEslSources(versionId, eslSources, { pending = false } = {}) {
    const id = String(versionId || '').trim();
    if (!id) return;
    activeComparisonVersions = activeComparisonVersions.map((entry) => (
      entry.id === id
        ? { ...entry, eslSources, eslPending: pending }
        : entry
    ));

    const modal = getModalEl();
    const entry = activeComparisonVersions.find((item) => item.id === id);
    if (modal && entry) {
      refreshVersionColumnMeta(modal, entry);
    }
  }

  function refreshVersionColumnMeta(modal, entry) {
    const col = modal.querySelector(`.gem-compare-languages-column[data-gem-compare-version="${entry.id}"]`);
    if (!col) return;
    const sources = entry.eslSources || {};
    common.ensureCompareColumnMetaRow(col, {
      subjectHtml: sources.subjectHtml,
      preheaderText: sources.preheaderText,
    });
  }

  function refreshAllVersionColumnMeta(modal) {
    activeComparisonVersions.forEach((entry) => refreshVersionColumnMeta(modal, entry));
    common.syncCompareSubjectPreviewUi(modal);
  }

  function captureVersionEslSourcesFromIframe(iframe, entry, modal) {
    if (!iframe || !entry) return;

    const versionId = String(entry.id || '').trim();
    if (!versionId || versionEslCaptureInFlight.has(versionId)) return;
    versionEslCaptureInFlight.add(versionId);
    const generation = versionEslCaptureGeneration;

    updateVersionEslSources(versionId, entry.eslSources || {
      bodyHtml: '',
      subjectHtml: '',
      preheaderText: '',
    }, { pending: true });

    void (async () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          if (generation !== versionEslCaptureGeneration) return;
          updateVersionEslSources(versionId, {
            bodyHtml: '',
            subjectHtml: '',
            preheaderText: '',
          });
          return;
        }
        const eslSources = await waitForVersionEslSources(doc, versionId);
        if (generation !== versionEslCaptureGeneration) return;
        updateVersionEslSources(versionId, eslSources);
      } catch (_) {
        if (generation !== versionEslCaptureGeneration) return;
        try {
          const eslSources = extractEslSourcesFromDoc(iframe.contentDocument);
          updateVersionEslSources(versionId, eslSources);
        } catch (_) {}
      } finally {
        versionEslCaptureInFlight.delete(versionId);
        if (generation === versionEslCaptureGeneration && typeof window.gemRefreshCompareEslUsageTable === 'function') {
          window.gemRefreshCompareEslUsageTable(modal);
        }
      }
    })();
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
      captureVersionEslSourcesFromIframe(existingIframe, entry, modal);
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
      captureVersionEslSourcesFromIframe(iframe, entry, modal);
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
      empty.className = 'gem-overflow-menu-wrap gem-compare-languages-column__menu-wrap';
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

  function resolveCompareVersionEntries(options = {}) {
    const allowSingle = options.allowSingle === true;
    const versions = getCampaignVersions();
    if (versions.length || !allowSingle) return versions;

    const id = getCurrentCampaignId();
    if (!id) return [];
    return [{
      id,
      letter: '',
      label: 'Current version',
      urlBase: urlBaseFromCampaignId(id),
    }];
  }

  function removeComparisonVersionColumn(modal, versionId) {
    const id = String(versionId || '').trim();
    const inReviewScripts = typeof common.getContentView === 'function'
      && common.getContentView() === 'esl-usage';

    if (inReviewScripts && activeComparisonVersions.length <= 1) {
      return;
    }

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
    versionEslCaptureInFlight.clear();
    versionEslSnapshotInFlight = false;
    versionEslCaptureGeneration += 1;
  }

  function extractEslSourcesFromSnapshotPayload(snapshotPayload) {
    const linksData = window.gemCampaignLinksData;
    if (!linksData || typeof linksData.extractEslSourcesForLanguage !== 'function') {
      return { bodyHtml: '', subjectHtml: '', preheaderText: '' };
    }
    return linksData.extractEslSourcesForLanguage(snapshotPayload, 'current');
  }

  async function captureVersionEslSourcesFromSnapshots(modal) {
    if (!modal || versionEslSnapshotInFlight) return;
    if (typeof window.gemFetchContentBlocksSnapshot !== 'function') {
      renderComparisonResults(modal, activeComparisonVersions);
      return;
    }

    versionEslSnapshotInFlight = true;
    const generation = versionEslCaptureGeneration;

    if (!activeComparisonVersions.length) {
      activeComparisonVersions = sortComparisonVersions(
        resolveCompareVersionEntries({ allowSingle: true })
      );
    }

    activeComparisonVersions = activeComparisonVersions.map((entry) => ({
      ...entry,
      eslPending: true,
    }));
    refreshCompareEslUsageIfActive(modal);

    try {
      if (typeof window.gemPrepareFreshCampaignSnapshot === 'function') {
        await window.gemPrepareFreshCampaignSnapshot();
      }
      if (generation !== versionEslCaptureGeneration) return;

      const sessionId = getCurrentSessionId();
      if (!sessionId) {
        activeComparisonVersions = activeComparisonVersions.map((entry) => ({
          ...entry,
          eslSources: { bodyHtml: '', subjectHtml: '', preheaderText: '' },
          eslPending: false,
        }));
        return;
      }

      const results = await Promise.all(
        activeComparisonVersions.map(async (entry) => {
          const versionId = String(entry.id || '').trim();
          if (!versionId) {
            return {
              id: versionId,
              eslSources: { bodyHtml: '', subjectHtml: '', preheaderText: '' },
            };
          }

          try {
            const snapshotResult = await window.gemFetchContentBlocksSnapshot(
              versionId,
              sessionId,
              ['current'],
              { forceRefresh: true }
            );

            if (!snapshotResult.ok || !snapshotResult.campaign) {
              return {
                id: versionId,
                eslSources: { bodyHtml: '', subjectHtml: '', preheaderText: '' },
              };
            }

            const eslSources = extractEslSourcesFromSnapshotPayload(snapshotResult.campaign);
            return { id: versionId, eslSources };
          } catch (_) {
            return {
              id: versionId,
              eslSources: { bodyHtml: '', subjectHtml: '', preheaderText: '' },
            };
          }
        })
      );

      if (generation !== versionEslCaptureGeneration) return;

      const sourcesById = new Map(results.map((item) => [item.id, item.eslSources]));
      activeComparisonVersions = activeComparisonVersions.map((entry) => ({
        ...entry,
        eslSources: sourcesById.get(entry.id) || {
          bodyHtml: '',
          subjectHtml: '',
          preheaderText: '',
        },
        eslPending: false,
      }));

      common.setCompareModePanelLoaded(modal, COMPARE_MODE, true);
    } finally {
      versionEslSnapshotInFlight = false;
      if (generation === versionEslCaptureGeneration) {
        refreshCompareEslUsageIfActive(modal);
      }
    }
  }

  function closeCompareVersionsModal() {
    common.closeCompareModal();
  }

  function renderComparisonResults(modal, versions) {
    const panel = getVersionsPanel(modal);
    if (!panel) return;

    if (
      common.isCompareModePanelLoaded(modal, COMPARE_MODE)
      && common.hasCompareModePreviewColumns(modal, COMPARE_MODE)
    ) {
      ensureCompareVersionsVisible(modal);
      return;
    }

    common.closeColumnMenu();
    activeComparisonVersions = sortComparisonVersions(versions).map((entry) => ({
      ...entry,
      eslSources: entry.eslSources || null,
      eslPending: !entry.eslSources,
    }));
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

      const metaRow = common.createCompareColumnMetaRow();
      common.updateCompareColumnMetaRow(col, {
        subjectHtml: entry.eslSources?.subjectHtml,
        preheaderText: entry.eslSources?.preheaderText,
      });

      const frameWrap = document.createElement('div');
      frameWrap.className = 'gem-compare-languages-column__frame-wrap';
      renderVersionColumnFrame(frameWrap, entry, modal);

      col.appendChild(header);
      col.appendChild(metaRow);
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
    common.syncCompareSubjectPreviewUi(modal);
    ensureVersionEslSourcesCaptured(modal);
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
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
      .map((id) => {
        const base = versionsById.get(id);
        if (!base) return null;
        const existing = activeComparisonVersions.find((entry) => entry.id === id);
        return syncVersionEntryEslSources(modal, { ...base, ...(existing || {}) });
      })
      .filter(Boolean);

    ensureVersionEslSourcesCaptured(modal);
  }

  function ensureCompareVersionsVisible(modal) {
    if (!modal) return;
    if (!common.isCompareModePanelLoaded(modal, COMPARE_MODE)) return;

    restoreVersionsStateFromPanel(modal);
    if (activeComparisonVersions.length) {
      applyCompareColumnOrder(modal);
      refreshAllVersionColumnMeta(modal);
    } else {
      common.syncModalUi(modal);
    }

    if (typeof common.getContentView === 'function' && common.getContentView() === 'esl-usage') {
      ensureCompareVersionsEslUsage(modal);
      return;
    }

    ensureVersionEslSourcesCaptured(modal);
    refreshCompareEslUsageIfActive(modal);
    refreshCompareReviewLinksIfActive(modal);
  }

  function ensureCompareVersionsEslUsage(modal) {
    if (!modal) return;
    if (typeof common.getContentView === 'function' && common.getContentView() !== 'esl-usage') return;

    if (!activeComparisonVersions.length) {
      activeComparisonVersions = sortComparisonVersions(
        resolveCompareVersionEntries({ allowSingle: true })
      );
    }

    const needsCapture = activeComparisonVersions.some((entry) => (
      entry.eslPending
      || !hasEslSourceData(entry.eslSources)
    ));

    if (needsCapture) {
      void captureVersionEslSourcesFromSnapshots(modal);
      return;
    }

    refreshCompareEslUsageIfActive(modal);
  }

  function ensureCompareVersionsPreviews(modal) {
    if (!modal) return;
    if (common.hasCompareModePreviewColumns(modal, COMPARE_MODE)) return;

    if (!activeComparisonVersions.length) {
      activeComparisonVersions = sortComparisonVersions(
        resolveCompareVersionEntries({ allowSingle: true })
      );
    }

    renderComparisonResults(modal, activeComparisonVersions);
  }

  function openCompareVersionsModal(options = {}) {
    const allowSingle = options.allowSingle === true;
    const contentView = options.contentView !== undefined
      ? options.contentView
      : (typeof common.getContentView === 'function' ? common.getContentView() : 'previews');
    const isLinksView = contentView === 'links';
    const isEslUsageView = contentView === 'esl-usage';
    const versions = resolveCompareVersionEntries({ allowSingle });
    const minCount = allowSingle ? 1 : 2;

    if (versions.length < minCount) {
      if (!allowSingle && window.gemShowToast) {
        window.gemShowToast('Compare Versions requires at least two campaign versions.', { type: 'error' });
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
        ensureCompareVersionsVisible(modal);
        if (isEslUsageView) ensureCompareVersionsEslUsage(modal);
        return;
      }

      common.syncModalUi(modal);

      activeComparisonVersions = sortComparisonVersions(versions);

      if (isEslUsageView) {
        ensureCompareVersionsEslUsage(modal);
        return;
      }

      if (isLinksView) {
        common.setCompareModePanelLoaded(modal, COMPARE_MODE, true);
        refreshCompareReviewLinksIfActive(modal);
        return;
      }

      renderComparisonResults(modal, versions);
    });
    return true;
  }

  function syncComparePreviewsOverflowMenuItem() {
    if (typeof common.syncComparePreviewsOverflowMenuItem === 'function') {
      common.syncComparePreviewsOverflowMenuItem();
    }
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
    if (window.__gemCompareVersionsInitialized) return;
    window.__gemCompareVersionsInitialized = true;

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
    common.registerSubjectPreviewToggleHandler((modal) => {
      if (!modal || modal.dataset.gemCompareMode !== COMPARE_MODE) return;
      ensureVersionEslSourcesCaptured(modal);
      refreshAllVersionColumnMeta(modal);
    });
    common.loadSettings();

    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        syncComparePreviewsOverflowMenuItem();
        ensureVersionsTabToolbar();
      });
    }

    syncComparePreviewsOverflowMenuItem();
    ensureVersionsTabToolbar();
  }

  function gemSwitchCampaignVersion(targetCampaignId) {
    const id = String(targetCampaignId || '').trim();
    if (!id) return false;
    const select = document.querySelector('cb-version-selector select');
    if (!select) return false;
    const option = [...select.options].find((opt) => String(opt.value || '').trim() === id);
    if (!option) return false;
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  window.gemOpenCompareVersionsModal = openCompareVersionsModal;
  window.gemCloseCompareVersionsModal = closeCompareVersionsModal;
  window.gemCanCompareVersions = gemCanCompareVersions;
  window.gemEnsureCompareVersionsPreviews = ensureCompareVersionsPreviews;
  window.gemEnsureCompareVersionsEslUsage = ensureCompareVersionsEslUsage;
  window.gemSyncComparePreviewsOverflowMenuItem = syncComparePreviewsOverflowMenuItem;
  window.gemGetCompareVersionEntries = () => activeComparisonVersions.slice();
  window.gemGetCampaignVersions = getCampaignVersions;
  window.gemSwitchCampaignVersion = gemSwitchCampaignVersion;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareVersions);
  } else {
    initCompareVersions();
  }
})();
