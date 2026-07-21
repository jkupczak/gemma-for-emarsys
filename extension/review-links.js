// review-links.js — Review Links dialog (Side-by-Side) via content-blocks snapshots
(function () {
  'use strict';

  const common = window.gemComparePreviewCommon;
  const linksData = window.gemCampaignLinksData;
  if (!common || !linksData) return;

  const DRAFT_SAVE_TIMEOUT_MS = 20000;
  const REVIEW_LINKS_PREFS_KEY = 'gemReviewLinksToolbarPrefs';
  const DEFAULT_REVIEW_LINKS_PREFS = {
    combineDuplicateLinks: false,
    editabilityFilter: 'all',
    trackingFilter: 'all',
    showTrackedStatus: true,
    showAssociatedText: false,
    showTotals: true,
    showFrequency: false,
  };

  const SVG_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"/></svg>';
  const SVG_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/></svg>';
  const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M280-160v-520H80v-120h520v120H400v520H280Zm360 0v-320H520v-120h360v120H760v320H640Z"/></svg>';

  let linksFetchGeneration = 0;
  let linksFetchInFlight = false;
  let combineDuplicateLinks = false;
  let editabilityFilter = 'all';
  let trackingFilter = 'all';
  let showTrackedStatus = true;
  let showAssociatedText = false;
  let showTotals = true;
  let showFrequency = false;
  let lastReviewLinksColumns = null;
  let lastReviewLinksModal = null;
  let lastReviewLinksPanel = null;
  let reviewLinksPrefsLoaded = false;
  let reviewLinksPrefsLoadPromise = null;
  let reviewLinksPrefsStorageListenerBound = false;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeEditabilityFilter(value) {
    if (value === 'editable' || value === 'locked') return value;
    return 'all';
  }

  function normalizeTrackingFilter(value) {
    if (value === 'tracked' || value === 'untracked') return value;
    return 'all';
  }

  function normalizeReviewLinksPrefs(raw) {
    const prefs = raw && typeof raw === 'object' ? raw : {};
    return {
      combineDuplicateLinks: !!prefs.combineDuplicateLinks,
      editabilityFilter: normalizeEditabilityFilter(prefs.editabilityFilter),
      trackingFilter: normalizeTrackingFilter(prefs.trackingFilter),
      showTrackedStatus: prefs.showTrackedStatus !== false,
      showAssociatedText: !!prefs.showAssociatedText,
      showTotals: prefs.showTotals !== false,
      showFrequency: !!prefs.showFrequency,
    };
  }

  function getReviewLinksPrefsSnapshot() {
    return normalizeReviewLinksPrefs({
      combineDuplicateLinks,
      editabilityFilter,
      trackingFilter,
      showTrackedStatus,
      showAssociatedText,
      showTotals,
      showFrequency,
    });
  }

  function reviewLinksPrefsEqual(a, b) {
    const left = normalizeReviewLinksPrefs(a);
    const right = normalizeReviewLinksPrefs(b);
    return left.combineDuplicateLinks === right.combineDuplicateLinks
      && left.editabilityFilter === right.editabilityFilter
      && left.trackingFilter === right.trackingFilter
      && left.showTrackedStatus === right.showTrackedStatus
      && left.showAssociatedText === right.showAssociatedText
      && left.showTotals === right.showTotals
      && left.showFrequency === right.showFrequency;
  }

  function applyReviewLinksPrefs(raw) {
    const prefs = normalizeReviewLinksPrefs(raw);
    combineDuplicateLinks = prefs.combineDuplicateLinks;
    editabilityFilter = prefs.editabilityFilter;
    trackingFilter = prefs.trackingFilter;
    showTrackedStatus = prefs.showTrackedStatus;
    showAssociatedText = prefs.showAssociatedText;
    showTotals = prefs.showTotals;
    showFrequency = prefs.showFrequency;
  }

  function persistReviewLinksPrefs() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.set({ [REVIEW_LINKS_PREFS_KEY]: getReviewLinksPrefsSnapshot() });
  }

  function loadReviewLinksPrefs(callback) {
    if (!chrome?.storage?.local) {
      applyReviewLinksPrefs(DEFAULT_REVIEW_LINKS_PREFS);
      if (callback) callback();
      return;
    }

    chrome.storage.local.get({ [REVIEW_LINKS_PREFS_KEY]: DEFAULT_REVIEW_LINKS_PREFS }, (res) => {
      applyReviewLinksPrefs(res[REVIEW_LINKS_PREFS_KEY]);
      if (callback) callback();
    });
  }

  function ensureReviewLinksPrefsLoaded() {
    if (reviewLinksPrefsLoaded) return Promise.resolve();
    if (!reviewLinksPrefsLoadPromise) {
      reviewLinksPrefsLoadPromise = new Promise((resolve) => {
        loadReviewLinksPrefs(() => {
          reviewLinksPrefsLoaded = true;
          resolve();
        });
      });
    }
    return reviewLinksPrefsLoadPromise;
  }

  function ensureReviewLinksPrefsStorageListener() {
    if (reviewLinksPrefsStorageListenerBound || !chrome?.storage?.onChanged) return;
    reviewLinksPrefsStorageListenerBound = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[REVIEW_LINKS_PREFS_KEY]) return;

      const previous = getReviewLinksPrefsSnapshot();
      applyReviewLinksPrefs(changes[REVIEW_LINKS_PREFS_KEY].newValue);
      const modal = common.getCompareModal();
      syncReviewLinksToolbarUi(modal);

      if (reviewLinksPrefsEqual(previous, getReviewLinksPrefsSnapshot())) return;

      if (typeof common.getContentView === 'function' && common.getContentView() === 'links') {
        refreshReviewLinksView();
      }
    });
  }

  function linkMatchesEditabilityFilter(link) {
    if (editabilityFilter === 'editable') return !link.locked;
    if (editabilityFilter === 'locked') return !!link.locked;
    return true;
  }

  function linkMatchesTrackingFilter(link) {
    if (trackingFilter === 'tracked') return !!link.tracked;
    if (trackingFilter === 'untracked') return !link.tracked;
    return true;
  }

  function filterLinksForDisplay(links) {
    return (Array.isArray(links) ? links : []).filter((link) => (
      linkMatchesEditabilityFilter(link) && linkMatchesTrackingFilter(link)
    ));
  }

  function shouldShowMetaColumn() {
    return showTrackedStatus || showFrequency;
  }

  function shouldShowFrequencyInRows() {
    return showFrequency;
  }

  function annotateHrefFrequencies(links) {
    const list = Array.isArray(links) ? links : [];
    const counts = new Map();

    list.forEach((link) => {
      const href = String(link && link.href || '').trim();
      if (!href) return;
      counts.set(href, (counts.get(href) || 0) + 1);
    });

    return list.map((link) => {
      const href = String(link && link.href || '').trim();
      return {
        ...link,
        frequency: counts.get(href) || 1,
      };
    });
  }

  function prepareLinksForDisplay(links) {
    const filtered = filterLinksForDisplay(links);
    if (!combineDuplicateLinks) return annotateHrefFrequencies(filtered);
    return linksData.aggregateLinks(filtered);
  }

  function refreshReviewLinksView() {
    if (lastReviewLinksColumns && lastReviewLinksModal && lastReviewLinksPanel) {
      renderReviewLinksColumns(lastReviewLinksModal, lastReviewLinksPanel, lastReviewLinksColumns);
    }
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

  function getDraftSaveButton() {
    return document.querySelector('cb-draft-save-button button');
  }

  function isDraftSaveInProgress() {
    const loading = document.querySelector('cb-draft-save-button button .e-btn__loading');
    return !!(loading && loading.classList.contains('e-btn__loading-active'));
  }

  function isDraftSaveNeeded() {
    const btn = getDraftSaveButton();
    return !!(btn && !btn.disabled);
  }

  function clearReviewLinksCachedState() {
    linksFetchGeneration += 1;
    linksFetchInFlight = false;
    lastReviewLinksColumns = null;
    lastReviewLinksModal = null;
    lastReviewLinksPanel = null;
  }

  function ensureDraftSaveComplete(timeoutMs = DRAFT_SAVE_TIMEOUT_MS) {
    const btn = getDraftSaveButton();
    if (!btn || btn.disabled) {
      return Promise.resolve({ triggered: false, completed: true });
    }

    const campaignId = getCurrentCampaignId();
    btn.click();

    return new Promise((resolve) => {
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        window.removeEventListener('message', onDraftSaved);
        resolve(result);
      };

      const onDraftSaved = (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== 'gem-draft-saved') return;
        // URL id is often a version id; draft posts suite_campaign_id and campaign.id.
        const savedSuiteId = String(data.suiteCampaignId || '').trim();
        const savedCampaignId = String(data.campaignId || data.id || '').trim();
        if (campaignId && savedSuiteId && savedCampaignId) {
          if (savedSuiteId !== campaignId && savedCampaignId !== campaignId) return;
        } else if (campaignId && savedSuiteId && savedSuiteId !== campaignId && !savedCampaignId) {
          return;
        } else if (campaignId && savedCampaignId && savedCampaignId !== campaignId && !savedSuiteId) {
          return;
        }
        finish({ triggered: true, completed: true });
      };

      window.addEventListener('message', onDraftSaved);

      const observer = new MutationObserver(() => {
        if (btn.disabled && !isDraftSaveInProgress()) {
          finish({ triggered: true, completed: true });
        }
      });

      observer.observe(btn, {
        attributes: true,
        attributeFilter: ['disabled'],
      });

      const timer = setTimeout(() => {
        finish({ triggered: true, completed: false });
      }, timeoutMs);

      if (btn.disabled && !isDraftSaveInProgress()) {
        finish({ triggered: true, completed: true });
      }
    });
  }

  function getActiveCompareEntryKey(modal) {
    const mode = String(modal?.dataset?.gemCompareMode || '').trim();
    if (mode === 'languages' && typeof window.gemGetSelectedLanguageValue === 'function') {
      return String(window.gemGetSelectedLanguageValue() || '').trim();
    }
    if (mode === 'versions') {
      return getCurrentCampaignId();
    }
    return '';
  }

  function isActiveReviewLinksColumn(modal, columnKey) {
    const activeKey = getActiveCompareEntryKey(modal);
    const key = String(columnKey || '').trim();
    return !!activeKey && activeKey === key;
  }

  function getActiveCompareEntries(modal) {
    const mode = String(modal?.dataset?.gemCompareMode || '').trim();

    if (mode === 'languages' && typeof window.gemGetCompareLanguageCaptures === 'function') {
      return {
        mode,
        entries: window.gemGetCompareLanguageCaptures(),
        getEntryKey: (entry) => entry.value,
        getEntryLabel: (entry) => {
          const label = String(entry.label || '').trim();
          return entry.isMaster ? `${label} (master)` : label;
        },
        getSortLabel: (entry) => String(entry.label || entry.value || ''),
      };
    }

    if (mode === 'versions' && typeof window.gemGetCompareVersionEntries === 'function') {
      return {
        mode,
        entries: window.gemGetCompareVersionEntries(),
        getEntryKey: (entry) => entry.id,
        getEntryLabel: (entry) => entry.label || entry.letter || entry.id,
        getSortLabel: (entry) => entry.letter || entry.label || entry.id,
      };
    }

    return null;
  }

  async function fetchSnapshotForCampaign(campaignId, sessionId, languageKeys, options = {}) {
    if (typeof window.gemFetchContentBlocksSnapshot !== 'function') {
      return { ok: false, reason: 'missing_fetch_helper' };
    }
    return window.gemFetchContentBlocksSnapshot(campaignId, sessionId, null, languageKeys, options);
  }

  async function prepareFreshLinkData(onStatus) {
    if (isDraftSaveNeeded()) {
      if (typeof onStatus === 'function') {
        onStatus('Saving draft…');
      }
      const saveResult = await ensureDraftSaveComplete();
      if (!saveResult.completed && window.gemShowToast) {
        window.gemShowToast(
          'Draft save did not confirm in time — loading the latest saved link data.',
          { type: 'warning' }
        );
      }
    }

    if (typeof onStatus === 'function') {
      onStatus('Loading link data…');
    }
  }

  async function loadLinksDataForEntries(active) {
    const sessionId = getCurrentSessionId();
    const currentCampaignId = getCurrentCampaignId();

    if (!sessionId) {
      return { ok: false, reason: 'missing_session', error: 'No session_id in URL', columns: [] };
    }

    const columns = [];

    if (active.mode === 'languages') {
      const campaignId = currentCampaignId;
      if (!campaignId) {
        return { ok: false, reason: 'missing_campaign', error: 'No campaign id in URL', columns: [] };
      }

      const languageKeys = active.entries.map((entry) => String(active.getEntryKey(entry) || '').trim()).filter(Boolean);
      const snapshotResult = await fetchSnapshotForCampaign(campaignId, sessionId, languageKeys, {
        forceRefresh: true,
      });
      if (!snapshotResult.ok) {
        return {
          ok: false,
          reason: snapshotResult.reason || 'fetch_failed',
          error: snapshotResult.error || '',
          status: snapshotResult.status,
          columns: [],
        };
      }

      const linksByLanguage = snapshotResult.linksByLanguage || {};
      active.entries.forEach((entry) => {
        const entryKey = String(active.getEntryKey(entry) || '').trim();

        columns.push({
          key: entryKey,
          label: active.getEntryLabel(entry),
          links: linksByLanguage[entryKey] || [],
          error: '',
          loading: false,
        });
      });

      return { ok: true, columns };
    }

    const fetchTargets = active.entries.map((entry) => ({
      key: String(active.getEntryKey(entry) || '').trim(),
      label: active.getEntryLabel(entry),
      campaignId: String(active.getEntryKey(entry) || '').trim(),
      isCurrent: String(active.getEntryKey(entry) || '').trim() === currentCampaignId,
    })).filter((target) => target.campaignId);

    const results = await Promise.all(
      fetchTargets.map(async (target) => {
        const snapshotResult = await fetchSnapshotForCampaign(
          target.campaignId,
          sessionId,
          ['current'],
          { forceRefresh: true }
        );

        if (!snapshotResult.ok) {
          return {
            key: target.key,
            label: target.label,
            links: [],
            error: 'Failed to load link data.',
            loading: false,
          };
        }

        const links = (snapshotResult.linksByLanguage && snapshotResult.linksByLanguage.current)
          || Object.values(snapshotResult.linksByLanguage || {})[0]
          || [];

        return {
          key: target.key,
          label: target.label,
          links,
          error: '',
          loading: false,
        };
      })
    );

    return { ok: true, columns: results };
  }

  function computeColumnLinkStats(links) {
    const list = Array.isArray(links) ? links : [];
    let totalTracked = 0;
    let totalUntracked = 0;
    const uniqueKeys = new Set();

    list.forEach((link) => {
      const href = String(link && link.href || '').trim();
      if (!href) return;

      const tracked = !!(link && link.tracked);
      if (tracked) totalTracked += 1;
      else totalUntracked += 1;

      uniqueKeys.add(`${href}\0${tracked ? '1' : '0'}`);
    });

    return {
      totalLinks: totalTracked + totalUntracked,
      totalTracked,
      totalUntracked,
      totalUnique: uniqueKeys.size,
    };
  }

  function renderColumnStatsSummary(links) {
    const stats = computeColumnLinkStats(links);
    const items = [
      { label: 'Total Links', value: stats.totalLinks },
      { label: 'Total Tracked Links', value: stats.totalTracked },
      { label: 'Total Untracked Links', value: stats.totalUntracked },
      { label: 'Total Unique Links', value: stats.totalUnique },
    ];

    const rows = items.map((item) => `
      <div class="gem-review-links-column__stat">
        <span class="gem-review-links-column__stat-label">${escapeHtml(item.label)}</span>
        <span class="gem-review-links-column__stat-value">${item.value}</span>
      </div>
    `.trim()).join('');

    return `<div class="gem-review-links-column__stats">${rows}</div>`;
  }

  function renderAssociatedTextHtml(link) {
    if (!showAssociatedText) return '';

    const kind = link.associatedTextKind;
    if (kind !== 'image' && kind !== 'text') return '';

    const icon = kind === 'image' ? SVG_IMAGE : SVG_TEXT;
    const text = String(link.associatedText || '').trim();
    const labelClass = text
      ? 'gem-review-links__associated-label'
      : 'gem-review-links__associated-label gem-review-links__associated-label--empty';

    return `
      <div class="gem-review-links__associated-text gem-review-links__associated-text--${kind}">
        <span class="gem-review-links__associated-icon">${icon}</span>
        <span class="${labelClass}">${escapeHtml(text)}</span>
      </div>
    `.trim();
  }

  function renderLinksTable(links) {
    if (!links.length) {
      return '<div class="gem-review-links__empty">No links found.</div>';
    }

    const showMeta = shouldShowMetaColumn();
    const showFrequencyInRows = shouldShowFrequencyInRows();
    const metaFrequencyOnly = showMeta && showFrequencyInRows && !showTrackedStatus;
    let tableClass = 'gem-review-links__table';
    if (!showMeta) {
      tableClass += ' gem-review-links__table--no-meta';
    } else if (metaFrequencyOnly) {
      tableClass += ' gem-review-links__table--meta-frequency-only';
    }

    const rows = links.map((link) => {
      const frequencyLabel = link.frequency === 1 ? '1×' : `${link.frequency}×`;
      const statusChip = link.tracked
        ? '<span class="gem-review-links__chip gem-review-links__chip--tracked">Tracked</span>'
        : '<span class="gem-review-links__chip gem-review-links__chip--untracked">Untracked</span>';
      const frequencyHtml = showFrequencyInRows
        ? `<span class="gem-review-links__frequency">${frequencyLabel}</span>`
        : '';
      const statusHtml = showTrackedStatus ? statusChip : '';
      const rowClass = link.locked ? 'gem-review-links__row gem-review-links__row--locked' : 'gem-review-links__row';
      const lockHtml = link.locked
        ? `<span class="gem-review-links__lock-icon">${SVG_LOCK}</span>`
        : '';
      const associatedHtml = renderAssociatedTextHtml(link);
      const metaCell = showMeta
        ? `
        <td class="gem-review-links__cell gem-review-links__cell--meta">
          <div class="gem-review-links__meta">
            ${statusHtml}
            ${frequencyHtml}
          </div>
        </td>`
        : '';

      return `
      <tr class="${rowClass}" data-gem-review-links-href="${escapeHtml(link.href)}">
        ${metaCell}
        <td class="gem-review-links__cell gem-review-links__cell--link">
          ${associatedHtml}
          <div class="gem-review-links__url-line">
            ${lockHtml}
            <span class="gem-review-links__url">${escapeHtml(link.href)}</span>
          </div>
        </td>
      </tr>
    `.trim();
    }).join('');

    return `
      <table class="${tableClass}">
        <tbody>${rows}</tbody>
      </table>
    `.trim();
  }

  function clearReviewLinksUrlHighlight(wrap) {
    if (!wrap) return;
    wrap.querySelectorAll('.gem-review-links__row--url-match').forEach((row) => {
      row.classList.remove('gem-review-links__row--url-match');
    });
  }

  function highlightReviewLinksByHref(wrap, href) {
    if (!wrap || !href) return;
    const normalized = String(href).trim();
    if (!normalized) return;

    wrap.querySelectorAll('.gem-review-links__row').forEach((row) => {
      const rowHref = String(row.getAttribute('data-gem-review-links-href') || '').trim();
      row.classList.toggle('gem-review-links__row--url-match', rowHref === normalized);
    });
  }

  function bindReviewLinksRowHover(wrap) {
    if (!wrap || wrap.dataset.gemReviewLinksRowHoverBound === 'true') return;
    wrap.dataset.gemReviewLinksRowHoverBound = 'true';

    wrap.addEventListener('mouseover', (event) => {
      const row = event.target && event.target.closest('.gem-review-links__row');
      if (!row || !wrap.contains(row)) {
        clearReviewLinksUrlHighlight(wrap);
        return;
      }

      const href = row.getAttribute('data-gem-review-links-href');
      if (!href) {
        clearReviewLinksUrlHighlight(wrap);
        return;
      }

      highlightReviewLinksByHref(wrap, href);
    });

    wrap.addEventListener('mouseleave', () => {
      clearReviewLinksUrlHighlight(wrap);
    });
  }

  function renderReviewLinksColumns(modal, panel, columns, options = {}) {
    const { loading = false, message = '' } = options;

    let wrap = panel.querySelector('.gem-review-links');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'gem-review-links gem-scrollable';
      wrap.hidden = true;
      panel.appendChild(wrap);
    }

    if (loading) {
      wrap.innerHTML = `
        <div class="gem-review-links__loading">
          <div class="gem-compare-languages-modal__spinner" aria-hidden="true"></div>
          <p class="gem-review-links__loading-text">${escapeHtml(message || 'Loading link data…')}</p>
        </div>
      `.trim();
      common.syncPanelContentView(modal);
      return;
    }

    if (!columns.length) {
      wrap.innerHTML = `<div class="gem-review-links__empty">${escapeHtml(message || 'No link data available.')}</div>`;
      common.syncPanelContentView(modal);
      return;
    }

    const columnHtml = columns.map((column) => {
      const filteredLinks = column.error ? [] : filterLinksForDisplay(column.links || []);
      const displayLinks = column.error ? [] : prepareLinksForDisplay(column.links || []);
      const statsHtml = showTotals
        ? (column.error
          ? renderColumnStatsSummary([])
          : renderColumnStatsSummary(filteredLinks))
        : '';
      const body = column.error
        ? `<div class="gem-review-links__error">${escapeHtml(column.error)}</div>`
        : renderLinksTable(displayLinks);
      const isActive = isActiveReviewLinksColumn(modal, column.key);
      const activeChipHtml = isActive
        ? '<span class="gem-compare-languages-column__active-chip">Active</span>'
        : '';
      const columnClass = isActive
        ? 'gem-review-links-column gem-review-links-column--active'
        : 'gem-review-links-column';

      return `
        <div class="${columnClass}" data-gem-review-links-key="${escapeHtml(column.key)}">
          <div class="gem-review-links-column__header">
            <div class="gem-review-links-column__title-wrap">
              ${activeChipHtml}
              <div class="gem-review-links-column__title">${escapeHtml(column.label)}</div>
            </div>
            ${statsHtml}
          </div>
          <div class="gem-review-links-column__body">${body}</div>
        </div>
      `.trim();
    }).join('');

    wrap.innerHTML = `<div class="gem-review-links-columns">${columnHtml}</div>`;
    bindReviewLinksRowHover(wrap);
    common.syncPanelContentView(modal);
  }

  function buildReviewLinksToolbarHtml() {
    return `
      <div class="gem-compare-languages-modal__links-toolbar-inner">
        <select class="gem-select gem-compare-languages-modal__links-toolbar-select" data-gem-review-links-combine aria-label="Combine identical URLs">
          <option value="separate">Separate Identical URLs</option>
          <option value="combine">Combine Identical URLs</option>
        </select>
        <select class="gem-select gem-compare-languages-modal__links-toolbar-select" data-gem-review-links-editability aria-label="Filter links by editability">
          <option value="all">Show Editable &amp; Locked</option>
          <option value="editable">Show Only Editable</option>
          <option value="locked">Show Only Locked</option>
        </select>
        <select class="gem-select gem-compare-languages-modal__links-toolbar-select" data-gem-review-links-tracking aria-label="Filter links by tracked status">
          <option value="all">Show Tracked &amp; Untracked</option>
          <option value="tracked">Show Only Tracked</option>
          <option value="untracked">Show Only Untracked</option>
        </select>
        <label class="gem-compare-languages-modal__links-toolbar-checkbox">
          <input type="checkbox" data-gem-review-links-show-tracked checked />
          Show Tracked Status
        </label>
        <label class="gem-compare-languages-modal__links-toolbar-checkbox">
          <input type="checkbox" data-gem-review-links-show-frequency />
          Show Frequency
        </label>
        <label class="gem-compare-languages-modal__links-toolbar-checkbox">
          <input type="checkbox" data-gem-review-links-show-associated-text />
          Show Associated Text
        </label>
        <label class="gem-compare-languages-modal__links-toolbar-checkbox">
          <input type="checkbox" data-gem-review-links-show-totals checked />
          Show Totals
        </label>
      </div>
    `.trim();
  }

  function syncReviewLinksToolbarUi(modal) {
    const toolbar = modal && modal.querySelector('.gem-compare-languages-modal__links-toolbar');
    if (!toolbar) return;

    const combineSelect = toolbar.querySelector('[data-gem-review-links-combine]');
    if (combineSelect) {
      combineSelect.value = combineDuplicateLinks ? 'combine' : 'separate';
    }

    const editabilitySelect = toolbar.querySelector('[data-gem-review-links-editability]');
    if (editabilitySelect) {
      editabilitySelect.value = editabilityFilter;
    }

    const trackingSelect = toolbar.querySelector('[data-gem-review-links-tracking]');
    if (trackingSelect) {
      trackingSelect.value = trackingFilter;
    }

    const trackedCheckbox = toolbar.querySelector('[data-gem-review-links-show-tracked]');
    if (trackedCheckbox) {
      trackedCheckbox.checked = showTrackedStatus;
    }

    const frequencyCheckbox = toolbar.querySelector('[data-gem-review-links-show-frequency]');
    if (frequencyCheckbox) {
      frequencyCheckbox.checked = showFrequency;
    }

    const associatedCheckbox = toolbar.querySelector('[data-gem-review-links-show-associated-text]');
    if (associatedCheckbox) {
      associatedCheckbox.checked = showAssociatedText;
    }

    const totalsCheckbox = toolbar.querySelector('[data-gem-review-links-show-totals]');
    if (totalsCheckbox) {
      totalsCheckbox.checked = showTotals;
    }
  }

  function bindReviewLinksToolbar(modal) {
    if (!modal || modal.dataset.gemReviewLinksToolbarBound === 'true') return;

    const toolbar = modal.querySelector('.gem-compare-languages-modal__links-toolbar');
    if (!toolbar) return;

    modal.dataset.gemReviewLinksToolbarBound = 'true';

    toolbar.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || !toolbar.contains(target)) return;

      if (target.matches('[data-gem-review-links-combine]')) {
        const wasSeparate = !combineDuplicateLinks;
        const nextCombine = target.value === 'combine';
        if (nextCombine && wasSeparate && !showFrequency) {
          showFrequency = true;
        }
        combineDuplicateLinks = nextCombine;
        persistReviewLinksPrefs();
        refreshReviewLinksView();
        syncReviewLinksToolbarUi(modal);
        return;
      }

      if (target.matches('[data-gem-review-links-editability]')) {
        editabilityFilter = normalizeEditabilityFilter(target.value);
        persistReviewLinksPrefs();
        refreshReviewLinksView();
        return;
      }

      if (target.matches('[data-gem-review-links-tracking]')) {
        trackingFilter = normalizeTrackingFilter(target.value);
        persistReviewLinksPrefs();
        refreshReviewLinksView();
        return;
      }

      if (target.matches('[data-gem-review-links-show-tracked]')) {
        showTrackedStatus = !!target.checked;
        persistReviewLinksPrefs();
        refreshReviewLinksView();
        return;
      }

      if (target.matches('[data-gem-review-links-show-frequency]')) {
        showFrequency = !!target.checked;
        persistReviewLinksPrefs();
        refreshReviewLinksView();
        return;
      }

      if (target.matches('[data-gem-review-links-show-associated-text]')) {
        showAssociatedText = !!target.checked;
        persistReviewLinksPrefs();
        refreshReviewLinksView();
        return;
      }

      if (target.matches('[data-gem-review-links-show-totals]')) {
        showTotals = !!target.checked;
        persistReviewLinksPrefs();
        refreshReviewLinksView();
      }
    });
  }

  function ensureReviewLinksToolbar(modal) {
    const targetModal = modal || common.getCompareModal();
    if (!targetModal) return;

    ensureReviewLinksPrefsLoaded().then(() => {
      let toolbar = targetModal.querySelector('.gem-compare-languages-modal__links-toolbar');
      if (!toolbar) return;

      if (!toolbar.dataset.gemReviewLinksToolbarReady
        || !toolbar.querySelector('[data-gem-review-links-tracking]')
        || !toolbar.querySelector('[data-gem-review-links-show-totals]')
        || !toolbar.querySelector('[data-gem-review-links-show-frequency]')) {
        toolbar.innerHTML = buildReviewLinksToolbarHtml();
        toolbar.dataset.gemReviewLinksToolbarReady = 'true';
        bindReviewLinksToolbar(targetModal);
      }

      syncReviewLinksToolbarUi(targetModal);
    });
  }

  async function refreshCompareReviewLinksTable(modal, options = {}) {
    const targetModal = modal || common.getCompareModal();
    if (!targetModal) return;

    if (typeof common.getContentView === 'function' && common.getContentView() !== 'links') {
      common.syncPanelContentView(targetModal);
      return;
    }

    await ensureReviewLinksPrefsLoaded();
    ensureReviewLinksToolbar(targetModal);

    const active = getActiveCompareEntries(targetModal);
    if (!active || !active.entries.length) return;

    const panel = common.getCompareModePanel(targetModal, active.mode);
    if (!panel) return;

    const sortedEntries = common.sortEntries(active.entries, {
      pinnedEntryKey: null,
      getEntryKey: active.getEntryKey,
      getSortLabel: active.getSortLabel,
    });

    const generation = ++linksFetchGeneration;
    linksFetchInFlight = true;

    renderReviewLinksColumns(targetModal, panel, sortedEntries.map((entry) => ({
      key: active.getEntryKey(entry),
      label: active.getEntryLabel(entry),
      links: [],
      error: '',
      loading: true,
    })), {
      loading: true,
      message: 'Preparing link data…',
    });

    try {
      await prepareFreshLinkData((message) => {
        if (generation !== linksFetchGeneration) return;
        renderReviewLinksColumns(targetModal, panel, sortedEntries.map((entry) => ({
          key: active.getEntryKey(entry),
          label: active.getEntryLabel(entry),
          links: [],
          error: '',
          loading: true,
        })), {
          loading: true,
          message,
        });
      });

      if (generation !== linksFetchGeneration) return;

      const result = await loadLinksDataForEntries(
        { ...active, entries: sortedEntries }
      );

      if (generation !== linksFetchGeneration) return;

      if (!result.ok) {
        console.error(
          '[Gem][Review Links] Snapshot fetch failed:',
          result.reason || 'unknown',
          result.error || '',
          result.status || ''
        );
        renderReviewLinksColumns(targetModal, panel, [], {
          loading: false,
          message: 'Unable to load link data for this campaign.',
        });
        if (window.gemShowToast) {
          window.gemShowToast('Unable to load link data for Review Links.', { type: 'error' });
        }
        return;
      }

      const columnsByKey = new Map(result.columns.map((column) => [column.key, column]));
      const orderedColumns = sortedEntries.map((entry) => {
        const key = String(active.getEntryKey(entry) || '').trim();
        return columnsByKey.get(key) || {
          key,
          label: active.getEntryLabel(entry),
          links: [],
          error: 'No link data.',
          loading: false,
        };
      });

      renderReviewLinksColumns(targetModal, panel, orderedColumns);
      lastReviewLinksColumns = orderedColumns;
      lastReviewLinksModal = targetModal;
      lastReviewLinksPanel = panel;
    } finally {
      if (generation === linksFetchGeneration) {
        linksFetchInFlight = false;
      }
    }
  }

  function initCompareReviewLinks() {
    if (window.__gemCompareReviewLinksInitialized) return;
    window.__gemCompareReviewLinksInitialized = true;

    ensureReviewLinksPrefsStorageListener();
    ensureReviewLinksPrefsLoaded().then(() => {
      const modal = common.getCompareModal();
      if (!modal) return;
      syncReviewLinksToolbarUi(modal);
      if (typeof common.getContentView === 'function' && common.getContentView() === 'links') {
        refreshReviewLinksView();
      }
    });

    common.registerLayoutRefreshHandler((modal) => {
      if (typeof common.getContentView === 'function' && common.getContentView() !== 'links') return;
      refreshCompareReviewLinksTable(modal);
    });
  }

  function openReviewLinksModal() {
    const opts = { contentView: 'links', allowSingle: true };

    if (typeof window.gemOpenCompareModal === 'function') {
      if (window.gemOpenCompareModal(opts)) return true;
    }

    if (window.gemShowToast) {
      window.gemShowToast('Unable to open Review Links for this campaign.', { type: 'error' });
    }
    return false;
  }

  window.gemRefreshCompareReviewLinksTable = refreshCompareReviewLinksTable;
  window.gemClearCompareReviewLinksState = clearReviewLinksCachedState;
  window.gemOpenReviewLinksModal = openReviewLinksModal;
  window.gemEnsureReviewLinksToolbar = ensureReviewLinksToolbar;
  window.gemPrepareFreshCampaignSnapshot = prepareFreshLinkData;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompareReviewLinks);
  } else {
    initCompareReviewLinks();
  }
})();
