console.log('[Gem] preflight-panel.js loaded');

function initializePreflightPanel() {
  const PREVIEW_IFRAME_SELECTOR = '.e-contentblocks-preview__iframe-desktop';
  const PRELIGHT_TAB_ID = 'gem-preflight-tab';
  const PRELIGHT_PANEL_TAG = 'gem-preflight';
  const PREFLIGHT_TOTAL_THRESHOLD_VALUE_KEY = 'gemPreflightTotalImageWeightThresholdValue';
  const PREFLIGHT_TOTAL_THRESHOLD_UNIT_KEY = 'gemPreflightTotalImageWeightThresholdUnit';
  const PREFLIGHT_SINGULAR_THRESHOLD_VALUE_KEY = 'gemPreflightSingularImageWeightThresholdValue';
  const PREFLIGHT_SINGULAR_THRESHOLD_UNIT_KEY = 'gemPreflightSingularImageWeightThresholdUnit';
  const PREFLIGHT_URL_NEVER_CHECK_KEY = 'urlPreflightNeverCheck';
  const PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY = 'gemPreflightEnableLiveLinkVerify';
  const PREFLIGHT_HIDE_LINKS_SECTION_KEY = 'gemPreflightHideLinksSection';
  const PREFLIGHT_ICON_PIP_TOGGLES_KEY = 'gemPreflightIconPipToggles';
  const PREFLIGHT_ALERT_COUNT_KEY = 'gemPreflightAlertCount';
  const PREFLIGHT_LANGUAGE_ALERTS_KEY = 'gemPreflightLanguageAlertsByCampaignV1';
  const PREFLIGHT_SECTION_COLLAPSE_STATE_KEY = 'gemPreflightSectionCollapseStateV1';
  const PREFLIGHT_ICON_PIP_TOGGLES_DEFAULT = {
    textAlerts: true,
    missingAlt: true,
    linkTitles: true,
    linkLint: true,
    imageWeight: true
  };
  const GEM_TEXT_HIGHLIGHTS_RENDERED_EVENT = 'gem:text-highlights-rendered';
  const PREFLIGHT_DEFAULT_TOTAL_THRESHOLD_VALUE = 3;
  const PREFLIGHT_DEFAULT_SINGULAR_THRESHOLD_VALUE = 2;
  const PREFLIGHT_DEFAULT_THRESHOLD_UNIT = 'MB';

  let globalTabHandlerBound = false;
  let refreshTimer = null;
  let currentScanToken = 0;
  let initialScanTriggered = false;
  let initialIframeObserver = null;
  let initialScanAttemptCount = 0;
  let initialScanRetryTimer = null;
  let boundPreviewIframe = null;
  let boundPreviewIframeLoadHandler = null;
  let imageHoverTooltipEl = null;
  let highlightDrivenTextRefreshTimer = null;
  let latestImageAlertCount = 0;
  let latestAccessibilityMissingAltCount = 0;
  let latestLinkTitlesAlertCount = 0;
  let latestLinksAlertCount = 0;
  let latestNotifyAlertCount = 0;
  let latestTextAnalysisSnapshot = null;
  let cachedPreflightIconPipToggles = { ...PREFLIGHT_ICON_PIP_TOGGLES_DEFAULT };
  let cachedLanguageAlertMap = {};
  let languagePreflightBadgeRefreshTimer = null;
  const CONTACT_PREVIEW_IFRAME_SELECTOR = '.cp-contact_preview__preview vce-iframes-container iframe';
  const CONTACT_PREVIEW_LINK_VERIFY_DEBOUNCE_MS = 550;

  /** @type {Map<string, object>} */
  const linkLiveState = new Map();
  /** @type {{ totalAnchors: number, uniqueCount: number, linksAlertCount: number, rows: any[], anchorRowKeysInOrder: string[] } | null} */
  let cachedLinksAnalysis = null;
  let contactPreviewObserver = null;
  let contactPreviewDebounceTimer = null;
  let contactPreviewBoundIframe = null;
  let contactPreviewLoadHandler = null;
  /** Live updates for Accessibility > linked images missing ALT (desktop preview iframe only). */
  let previewDocAccessibilityObserver = null;
  let previewDocAccessibilityObserverDoc = null;
  let accessibilityLiveRefreshTimer = null;
  /** Last linked-image missing-ALT rows from live iframe observer (used when skipping scan on panel open). */
  let cachedAccessibilityMissingAltRows = [];
  /** Last "links with title" rows from live iframe observer or full scan (used when skipping scan on panel open). */
  let cachedLinkTitleRows = [];
  let preflightLiveLinkVerifyEnabled = false;
  let preflightHideLinksSection = false;
  let editorLinkLiveVerifyAllInFlight = false;
  /** Editor `rowKey` → synthetic row shown after Contact Preview renders personalization (cleared on editor rescan). */
  const contactPreviewRenderedRowByEditorKey = new Map();
  /** Canonical URL strings configured in sync storage to skip all preflight URL checks. */
  const preflightNeverCheckUrls = new Set();
  /** Rows skipped because they matched `preflightNeverCheckUrls`. */
  let cachedSkippedLinkRows = [];
  let openLinkRowMenuKey = '';

  const GEM_PREFLIGHT_LIVE_SESSION_KEY = 'gemPreflightLinkLiveSessionV1';
  let preflightLiveSessionSaveTimer = null;
  let linkRowMenuAlignRaf = null;

  function isChromeStorageSessionAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session;
  }

  function hashString32(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function fingerprintForLinksAnalysis(analysis) {
    if (!analysis) return '';
    const order = Array.isArray(analysis.anchorRowKeysInOrder) ? analysis.anchorRowKeysInOrder.join('\x1e') : '';
    const n = Number.parseInt(String(analysis.totalAnchors), 10) || 0;
    const u = Number.parseInt(String(analysis.uniqueCount), 10) || 0;
    return `${n}|${u}|${hashString32(order)}`;
  }

  function readPreflightLiveSessionPayload() {
    return new Promise((resolve) => {
      if (!isChromeStorageSessionAvailable()) {
        resolve(null);
        return;
      }
      try {
        chrome.storage.session.get(GEM_PREFLIGHT_LIVE_SESSION_KEY, (res) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(res[GEM_PREFLIGHT_LIVE_SESSION_KEY] || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function writePreflightLiveSessionPayload(payload) {
    return new Promise((resolve) => {
      if (!isChromeStorageSessionAvailable()) {
        resolve();
        return;
      }
      try {
        chrome.storage.session.set({ [GEM_PREFLIGHT_LIVE_SESSION_KEY]: payload }, () => {
          if (chrome.runtime.lastError) {
            /* ignore quota / session API errors */
          }
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  function removePreflightLiveSessionPayload() {
    return new Promise((resolve) => {
      if (!isChromeStorageSessionAvailable()) {
        resolve();
        return;
      }
      try {
        chrome.storage.session.remove(GEM_PREFLIGHT_LIVE_SESSION_KEY, () => {
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  function serializeLinkLiveStateForSession() {
    const out = {};
    linkLiveState.forEach((v, k) => {
      if (!v || typeof v !== 'object') return;
      if (v.phase === 'checking') return;
      out[k] = { ...v };
    });
    return out;
  }

  async function persistPreflightLiveSessionNow() {
    if (!isChromeStorageSessionAvailable() || !cachedLinksAnalysis) return;
    const fingerprint = fingerprintForLinksAnalysis(cachedLinksAnalysis);
    await writePreflightLiveSessionPayload({
      fingerprint,
      linkLiveState: serializeLinkLiveStateForSession(),
      contactPreviewRendered: Object.fromEntries(contactPreviewRenderedRowByEditorKey)
    });
  }

  function schedulePersistPreflightLiveSession() {
    if (!isChromeStorageSessionAvailable()) return;
    if (preflightLiveSessionSaveTimer) clearTimeout(preflightLiveSessionSaveTimer);
    preflightLiveSessionSaveTimer = setTimeout(() => {
      preflightLiveSessionSaveTimer = null;
      void persistPreflightLiveSessionNow();
    }, 400);
  }

  async function hydratePreflightLiveFromSession(analysis) {
    linkLiveState.clear();
    contactPreviewRenderedRowByEditorKey.clear();
    if (!analysis || !isChromeStorageSessionAvailable()) return;
    const fp = fingerprintForLinksAnalysis(analysis);
    const stored = await readPreflightLiveSessionPayload();
    if (!stored || stored.fingerprint !== fp) {
      if (stored) await removePreflightLiveSessionPayload();
      return;
    }
    const rows = Array.isArray(analysis.rows) ? analysis.rows : [];
    const allowedEditorKeys = new Set(rows.map((r) => r && r.rowKey).filter(Boolean));

    const live = stored.linkLiveState && typeof stored.linkLiveState === 'object' ? stored.linkLiveState : {};
    Object.keys(live).forEach((k) => {
      const v = live[k];
      if (!v || typeof v !== 'object') return;
      if (k.startsWith('__cp_rendered__:')) {
        const suffix = k.slice('__cp_rendered__:'.length);
        let parentKey = '';
        try {
          parentKey = decodeURIComponent(suffix);
        } catch (_) {
          return;
        }
        if (!allowedEditorKeys.has(parentKey)) return;
      } else if (!allowedEditorKeys.has(k)) return;
      linkLiveState.set(k, v);
    });

    const cp = stored.contactPreviewRendered && typeof stored.contactPreviewRendered === 'object' ? stored.contactPreviewRendered : {};
    Object.keys(cp).forEach((editorKey) => {
      if (!allowedEditorKeys.has(editorKey)) return;
      const syn = cp[editorKey];
      if (!syn || typeof syn !== 'object' || !syn.isContactPreviewRenderedRow || !syn.rowKey) return;
      contactPreviewRenderedRowByEditorKey.set(editorKey, syn);
    });
  }

  function hideNonRouterOutletChildren(navContent) {
    const children = Array.from(navContent.children);
    children.forEach((child) => {
      if (child.tagName === 'ROUTER-OUTLET') return;
      if (child.tagName === 'GEM-PREFLIGHT') return;
      if (child.dataset && child.dataset.gemHiddenByPreflight === 'true') return;
      if (child.dataset) {
        child.dataset.gemHiddenByPreflight = 'true';
        child.dataset.gemPreflightPrevDisplay = child.style.display || '';
      }
      child.style.display = 'none';
    });
  }

  function restoreHiddenNavChildren(navContent) {
    const hidden = navContent.querySelectorAll('[data-gem-hidden-by-preflight="true"]');
    hidden.forEach((el) => {
      const prev = el.dataset ? (el.dataset.gemPreflightPrevDisplay || '') : '';
      el.style.display = prev;
      if (el.dataset) {
        delete el.dataset.gemHiddenByPreflight;
        delete el.dataset.gemPreflightPrevDisplay;
      }
    });
  }

  function createPreflightTabHTML() {
    return `
<cb-vertical-tab id="gem-preflight-tab" value="tooltips.preflight" icon="rocket">
  <e-verticalnav-item class="gem-e-verticalnav-item gem-preflight-nav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Preflight" role="tooltip" aria-description="Preflight">
        <div class="e-verticalnavitem__icon e-svgclickfix">
          <e-icon icon="rocket"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF168;</div></div></e-icon>
        </div>
      </e-tooltip>
      <span class="gem-preflight-alert-pip" data-role="preflightAlertPip" style="display:none;">0</span>
      <div class="e-verticalnavitem__value">Preflight</div>
    </div>
  </e-verticalnav-item>
</cb-vertical-tab>
    `.trim();
  }

  function createPreflightPanelHTML() {
    return `
<gem-preflight class="scrollable">
  <div class="e-section gem-preflight-section">
    <div class="e-section__header">
      <div class="e-section__title">Preflight</div>
    </div>
    <div class="e-section__content">
      <div class="gem-preflight-collapsible-section" data-role="languageOverviewSection">
        <div class="gem-preflight-subsection-title">
          <div class="gem-preflight-subsection-title-main">
            <span>Languages</span>
          </div>
          <div class="gem-preflight-header-actions">
            <button type="button" class="gem-preflight-section-toggle" data-role="toggleSectionBtn" data-section-key="languageOverview" aria-expanded="true" title="Collapse Languages overview" aria-label="Collapse Languages overview">
              <span class="gem-preflight-section-toggle-arrow" aria-hidden="true">▾</span>
            </button>
          </div>
        </div>
        <div class="gem-preflight-collapsible-body" data-role="languageOverviewSectionBody">
          <div class="gem-preflight-subsection-description">
            Preflight issue counts remembered per language for this campaign. Switch languages to scan each version.
          </div>
          <div class="gem-preflight-accessibility-table gem-preflight-language-overview-table" data-role="languageOverviewTable">
            <div class="gem-preflight-image-breakdown-empty">No languages found.</div>
          </div>
        </div>
      </div>
      <div class="gem-preflight-section-divider" aria-hidden="true"></div>
      <div class="gem-preflight-collapsible-section" data-role="textAnalysisSection">
        <div class="gem-preflight-subsection-title">
          <div class="gem-preflight-subsection-title-main">
            <span>Text</span>
            <span class="gem-preflight-section-pip gem-preflight-section-pip--muted" data-role="textAnalysisSectionAlertPip">0</span>
          </div>
          <div class="gem-preflight-header-actions">
            <button type="button" class="gem-preflight-section-toggle" data-role="toggleSectionBtn" data-section-key="textAnalysis" aria-expanded="true" title="Collapse Text Analysis" aria-label="Collapse Text Analysis">
              <span class="gem-preflight-section-toggle-arrow" aria-hidden="true">▾</span>
            </button>
          </div>
        </div>
        <div class="gem-preflight-collapsible-body" data-role="textAnalysisSectionBody">
          <div class="gem-preflight-subsection-description" data-role="textAnalysisInfo" style="display:none;"></div>
          <div data-role="textAnalysisResultsWrap">
            <div class="gem-preflight-metrics gem-preflight-links-metrics">
              <div class="gem-preflight-metric-row">
                <div class="gem-preflight-metric-label">Total text matches</div>
                <div class="gem-preflight-metric-value" data-metric="textMatchesTotal">Scanning...</div>
              </div>
              <div class="gem-preflight-metric-row">
                <div class="gem-preflight-metric-label">Total "Notify" matches</div>
                <div class="gem-preflight-metric-value" data-metric="textNotifyMatchesTotal">Scanning...</div>
              </div>
            </div>
            <div data-role="notifyMatchesWrap">
              <div class="gem-preflight-subsection-description">
                Unique "Notify" matches
              </div>
              <div class="gem-preflight-accessibility-table" data-role="notifyMatchesTable">
                <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="gem-preflight-section-divider" aria-hidden="true"></div>
      <div class="gem-preflight-collapsible-section" data-role="accessibilitySection">
        <div class="gem-preflight-subsection-title gem-preflight-subsection-title--spaced">
          <div class="gem-preflight-subsection-title-main">
            <span>Accessibility</span>
            <span class="gem-preflight-section-pip gem-preflight-section-pip--muted" data-role="accessibilitySectionAlertPip">0</span>
          </div>
          <div class="gem-preflight-header-actions">
            <button type="button" class="gem-preflight-section-toggle" data-role="toggleSectionBtn" data-section-key="accessibility" aria-expanded="true" title="Collapse Accessibility" aria-label="Collapse Accessibility">
              <span class="gem-preflight-section-toggle-arrow" aria-hidden="true">▾</span>
            </button>
          </div>
        </div>
        <div class="gem-preflight-collapsible-body" data-role="accessibilitySectionBody">
          <div class="gem-preflight-subsection-description">
            Linked images missing ALT text
          </div>
          <div class="gem-preflight-accessibility-table" data-role="accessibilityWarningsTable">
            <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
          </div>
          <div class="gem-preflight-subsection-description gem-preflight-subsection-description--with-help">
            <span>Links with titles</span>
            <e-tooltip
              placement="top"
              content="Title attributes aren’t reliably accessible—many screen readers ignore them, and they don’t work on touch or keyboard navigation."
              role="tooltip"
              aria-description="Title attributes aren’t reliably accessible—many screen readers ignore them, and they don’t work on touch or keyboard navigation."
            >
              <span class="gem-preflight-subsection-help-icon" tabindex="0" aria-label="Why links with titles are flagged"></span>
            </e-tooltip>
          </div>
          <div class="gem-preflight-accessibility-table" data-role="linkTitlesTable">
            <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
          </div>
        </div>
      </div>
      <div class="gem-preflight-section-divider" aria-hidden="true" data-role="linksSectionDivider"></div>
      <div class="gem-preflight-collapsible-section" data-role="linksSection">
        <div class="gem-preflight-subsection-title gem-preflight-subsection-title--spaced">
          <div class="gem-preflight-subsection-title-main">
            <span>Links</span>
            <span class="gem-preflight-section-pip gem-preflight-section-pip--muted" data-role="linksSectionAlertPip">0</span>
          </div>
          <div class="gem-preflight-header-actions gem-preflight-links-header-actions">
            <button type="button" class="gem-preflight-section-toggle" data-role="toggleSectionBtn" data-section-key="links" aria-expanded="true" title="Collapse Links" aria-label="Collapse Links">
              <span class="gem-preflight-section-toggle-arrow" aria-hidden="true">▾</span>
            </button>
          </div>
        </div>
        <div class="gem-preflight-collapsible-body" data-role="linksSectionBody">
          <div class="gem-preflight-metrics gem-preflight-links-metrics">
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Total links</div>
              <div class="gem-preflight-metric-value" data-metric="linksTotal">Scanning...</div>
            </div>
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Total unique links</div>
              <div class="gem-preflight-metric-value" data-metric="linksUnique">Scanning...</div>
            </div>
          </div>
          <div class="gem-preflight-live-link-footnote" data-role="liveLinkFootnote" style="display:none;"></div>
          <div class="gem-preflight-accessibility-table" data-role="linksTable">
            <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
          </div>
          <div class="gem-preflight-image-breakdown gem-preflight-skipped-urls" data-role="skippedUrlsWrap">
            <div class="gem-preflight-image-breakdown-header">
              <div class="gem-preflight-image-breakdown-title">Skipped URLs</div>
              <button type="button" class="gem-preflight-image-breakdown-toggle" data-role="skippedUrlsToggle" aria-expanded="false" title="Show or hide skipped URL list" aria-label="Show or hide skipped URL list">
                <span class="gem-preflight-image-breakdown-toggle-arrow" aria-hidden="true">▸</span>
              </button>
            </div>
            <div class="gem-preflight-image-breakdown-body" data-role="skippedUrlsBody">
              <div class="gem-preflight-accessibility-table gem-preflight-links-table" data-role="skippedUrlsTable">
                <div class="gem-preflight-image-breakdown-empty">No skipped URLs.</div>
              </div>
            </div>
          </div>
          <div class="gem-preflight-links-permission-actions" data-role="linksPermissionActions" style="display:none;">
            <button type="button" class="e-btn e-btn-primary" data-role="grantLinkAccessBtn">Grant Access to Live Verify</button>
            <button type="button" class="e-btn" data-role="denyLinksSectionBtn">Deny Access</button>
          </div>
        </div>
      </div>
      <div class="gem-preflight-section-divider" aria-hidden="true"></div>
      <div class="gem-preflight-collapsible-section" data-role="imagesSection">
        <div class="gem-preflight-subsection-title gem-preflight-subsection-title--spaced">
          <div class="gem-preflight-subsection-title-main">
            <span>Images</span>
            <span class="gem-preflight-section-pip gem-preflight-section-pip--muted" data-role="imagesSectionAlertPip">0</span>
          </div>
          <div class="gem-preflight-header-actions">
            <div class="gem-preflight-section-actions">
              <button type="button" class="e-datagrid__item_action gem-borderless-btn gem-preflight-refresh-btn" data-role="refreshMetricsBtn" title="Recalculate image metrics" aria-label="Recalculate image metrics">
                <gem-e-icon icon="refresh" color="inherit">
                  <div aria-hidden="true" class="e-icon-wrapper">
                    <div class="e-icon e-icon-table text-color-inherit">&#xF160;</div>
                  </div>
                </gem-e-icon>
              </button>
              <button type="button" class="e-datagrid__item_action gem-borderless-btn gem-preflight-settings-btn" data-role="openPreflightSettingsBtn" title="Open Preflight settings" aria-label="Open Preflight settings">
                <gem-e-icon icon="settings" color="inherit">
                  <div aria-hidden="true" class="e-icon-wrapper">
                    <div class="e-icon e-icon-table text-color-inherit">&#xF16C;</div>
                  </div>
                </gem-e-icon>
              </button>
            </div>
            <button type="button" class="gem-preflight-section-toggle" data-role="toggleSectionBtn" data-section-key="images" aria-expanded="true" title="Collapse Images" aria-label="Collapse Images">
              <span class="gem-preflight-section-toggle-arrow" aria-hidden="true">▾</span>
            </button>
          </div>
        </div>
        <div class="gem-preflight-collapsible-body" data-role="imagesSectionBody">
          <div class="gem-preflight-permission-gate" data-role="permissionGate">
            <div class="gem-preflight-permission-text">
              Estimate cold-cache image download weight for this email. This requests temporary image-host access so Gemma can measure unique image resources across any domain used in your email.
            </div>
            <button type="button" class="e-btn e-btn-primary gem-preflight-enable-image-access-btn" data-role="enableImageAccessBtn">
              Grant Access to Analyze Images
            </button>
            <div class="gem-preflight-footnote" data-metric="permissionStatus"></div>
          </div>
          <div class="gem-preflight-metrics" id="gem-preflight-images-metrics">
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Total image references</div>
              <div class="gem-preflight-metric-value" data-metric="totalRefs">Scanning...</div>
            </div>
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Unique image URLs</div>
              <div class="gem-preflight-metric-value" data-metric="uniqueUrls">Scanning...</div>
            </div>
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Estimated image download (cold cache)</div>
              <div class="gem-preflight-metric-value" data-metric="totalSize" data-alertable="totalSize">Scanning...</div>
            </div>
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Unique network image URLs</div>
              <div class="gem-preflight-metric-value" data-metric="networkUniqueUrls">Scanning...</div>
            </div>
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Unique embedded/non-network URLs</div>
              <div class="gem-preflight-metric-value" data-metric="embeddedUniqueUrls">Scanning...</div>
            </div>
            <div class="gem-preflight-metric-row">
              <div class="gem-preflight-metric-label">Estimated download time</div>
              <div class="gem-preflight-metric-value gem-preflight-metric-value--times" data-metric="speedEstimates">Scanning...</div>
            </div>
          </div>
          <div class="gem-preflight-image-breakdown" data-role="imageBreakdownWrap">
            <div class="gem-preflight-image-breakdown-header">
              <div class="gem-preflight-image-breakdown-title">Image Details</div>
              <button type="button" class="gem-preflight-image-breakdown-toggle" data-role="imageDetailsToggle" aria-expanded="true" title="Show or hide image list" aria-label="Show or hide image list">
                <span class="gem-preflight-image-breakdown-toggle-arrow" aria-hidden="true">▾</span>
              </button>
            </div>
            <div class="gem-preflight-image-breakdown-body" data-role="imageBreakdownBody">
              <div class="gem-preflight-image-breakdown-table" data-role="imageBreakdownTable">
                <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="gem-preflight-section-divider" aria-hidden="true"></div>
      <div class="gem-preflight-footnote" data-metric="statusText"></div>
    </div>
  </div>
</gem-preflight>
    `.trim();
  }

  function isPreflightActive() {
    const navItem = document.querySelector(`#${PRELIGHT_TAB_ID} e-verticalnav-item`);
    return !!(navItem && navItem.getAttribute('status') === 'active');
  }

  function getPreflightPanelEls() {
    const panel = document.querySelector(PRELIGHT_PANEL_TAG);
    if (!panel) return null;
    return {
      panel,
      permissionGate: panel.querySelector('[data-role="permissionGate"]'),
      enableBtn: panel.querySelector('[data-role="enableImageAccessBtn"]'),
      refreshBtn: panel.querySelector('[data-role="refreshMetricsBtn"]'),
      openSettingsBtn: panel.querySelector('[data-role="openPreflightSettingsBtn"]'),
      imagesSectionPip: panel.querySelector('[data-role="imagesSectionAlertPip"]'),
      accessibilitySectionPip: panel.querySelector('[data-role="accessibilitySectionAlertPip"]'),
      imageBreakdownTable: panel.querySelector('[data-role="imageBreakdownTable"]'),
      linksTable: panel.querySelector('[data-role="linksTable"]'),
      notifyMatchesTable: panel.querySelector('[data-role="notifyMatchesTable"]'),
      notifyMatchesWrap: panel.querySelector('[data-role="notifyMatchesWrap"]'),
      textAnalysisResultsWrap: panel.querySelector('[data-role="textAnalysisResultsWrap"]'),
      textAnalysisInfo: panel.querySelector('[data-role="textAnalysisInfo"]'),
      skippedUrlsWrap: panel.querySelector('[data-role="skippedUrlsWrap"]'),
      linksSection: panel.querySelector('[data-role="linksSection"]'),
      linksSectionDivider: panel.querySelector('[data-role="linksSectionDivider"]'),
      skippedUrlsToggle: panel.querySelector('[data-role="skippedUrlsToggle"]'),
      skippedUrlsTable: panel.querySelector('[data-role="skippedUrlsTable"]'),
      liveVerifyAllLinksBtn: panel.querySelector('[data-role="liveVerifyAllLinksBtn"]'),
      liveLinkFootnote: panel.querySelector('[data-role="liveLinkFootnote"]'),
      linksPermissionActions: panel.querySelector('[data-role="linksPermissionActions"]'),
      grantLinkAccessBtn: panel.querySelector('[data-role="grantLinkAccessBtn"]'),
      denyLinksSectionBtn: panel.querySelector('[data-role="denyLinksSectionBtn"]'),
      accessibilityWarningsTable: panel.querySelector('[data-role="accessibilityWarningsTable"]'),
      linkTitlesTable: panel.querySelector('[data-role="linkTitlesTable"]'),
      linksSectionPip: panel.querySelector('[data-role="linksSectionAlertPip"]'),
      textAnalysisSectionPip: panel.querySelector('[data-role="textAnalysisSectionAlertPip"]'),
      permissionStatus: panel.querySelector('[data-metric="permissionStatus"]'),
      metrics: panel.querySelector('#gem-preflight-images-metrics'),
      imageBreakdownWrap: panel.querySelector('[data-role="imageBreakdownWrap"]'),
      languageOverviewTable: panel.querySelector('[data-role="languageOverviewTable"]')
    };
  }

  function getLanguageAlertEntry(map, langValue) {
    const raw = map && langValue != null ? map[langValue] : null;
    if (raw == null) return { count: 0, updatedAt: 0 };
    if (typeof raw === 'number') return { count: Math.max(0, raw), updatedAt: 0 };
    if (typeof raw === 'object') {
      return {
        count: Math.max(0, Number.parseInt(String(raw.count), 10) || 0),
        updatedAt: Number.parseInt(String(raw.updatedAt), 10) || 0
      };
    }
    return { count: 0, updatedAt: 0 };
  }

  function formatPreflightRelativeTime(ts) {
    const n = Number.parseInt(String(ts), 10) || 0;
    if (!n) return '—';
    const diffMs = Date.now() - n;
    if (diffMs < 45000) return 'Just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function renderLanguageOverviewPanel() {
    const els = getPreflightPanelEls();
    if (!els || !els.languageOverviewTable) return;
    const campaignId = getCampaignIdFromUrl();
    const meta = getLanguageOptionMeta();
    const currentLang = getSelectedLanguageValue();

    if (!campaignId || !meta.length) {
      els.languageOverviewTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No languages found for this campaign.</div>';
      return;
    }

    chrome.storage.local.get({ [PREFLIGHT_LANGUAGE_ALERTS_KEY]: {} }, (res) => {
      const map = ((res[PREFLIGHT_LANGUAGE_ALERTS_KEY] || {})[campaignId]) || {};
      const rows = meta.map(({ value, text }) => {
        const entry = getLanguageAlertEntry(map, value);
        const isCurrent = value === currentLang;
        const countLabel = entry.count > 0 ? String(Math.min(99, entry.count)) : '0';
        const scannedLabel = entry.updatedAt ? formatPreflightRelativeTime(entry.updatedAt) : (entry.count > 0 ? '—' : 'Not scanned');
        return `
          <div class="gem-preflight-language-overview-row${isCurrent ? ' gem-preflight-language-overview-row--current' : ''}${entry.count > 0 ? ' gem-preflight-language-overview-row--alert' : ''}" data-lang-value="${String(value).replace(/"/g, '&quot;')}">
            <div class="gem-preflight-language-overview-cell gem-preflight-language-overview-cell--name">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}${isCurrent ? ' <span class="gem-preflight-language-overview-current">Current</span>' : ''}</div>
            <div class="gem-preflight-language-overview-cell gem-preflight-language-overview-cell--count">${countLabel}</div>
            <div class="gem-preflight-language-overview-cell gem-preflight-language-overview-cell--time">${scannedLabel}</div>
          </div>
        `.trim();
      }).join('');

      els.languageOverviewTable.innerHTML = `
        <div class="gem-preflight-language-overview-head">
          <div class="gem-preflight-language-overview-cell gem-preflight-language-overview-cell--name">Language</div>
          <div class="gem-preflight-language-overview-cell gem-preflight-language-overview-cell--count">Issues</div>
          <div class="gem-preflight-language-overview-cell gem-preflight-language-overview-cell--time">Last scanned</div>
        </div>
        ${rows}
      `.trim();
    });
  }

  function getCampaignIdFromUrl() {
    try {
      const match = window.location.search.match(/[?&]id=(\d+)/);
      return match ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function getSelectedLanguageValue() {
    try {
      const selector = document.querySelector('vce-languages-selector');
      if (!selector) return null;
      const selected = selector.querySelector('e-select-option[selected="true"], e-select-option[selected="selected"]');
      if (selected) return selected.getAttribute('value') || selected.id || null;
      const hidden = selector.querySelector('input[type="hidden"]');
      if (hidden && hidden.value) return hidden.value;
      return null;
    } catch (_) {
      return null;
    }
  }

  function normalizeLanguageOptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getLanguageOptionMeta() {
    const selector = document.querySelector('vce-languages-selector');
    if (!selector) return [];
    return Array.from(selector.querySelectorAll('e-select-option'))
      .map((opt) => ({
        value: opt.getAttribute('value') || opt.id || '',
        text: normalizeLanguageOptionText(opt.textContent || '')
      }))
      .filter((entry) => entry.value && entry.text);
  }

  function applyLanguagePickerPreflightBadges(campaignMap) {
    const map = campaignMap && typeof campaignMap === 'object' ? campaignMap : {};
    const meta = getLanguageOptionMeta();
    const textToCount = {};
    meta.forEach(({ value, text }) => {
      const entry = getLanguageAlertEntry(map, value);
      const count = entry.count;
      if (count > 0) textToCount[text] = count;
    });

    const selector = document.querySelector('vce-languages-selector');
    if (selector) {
      selector.querySelectorAll('e-select-option').forEach((opt) => {
        const val = opt.getAttribute('value') || opt.id || '';
        const count = getLanguageAlertEntry(map, val).count;
        if (count > 0) {
          opt.setAttribute('data-gem-preflight-alerts', String(Math.min(99, count)));
        } else {
          opt.removeAttribute('data-gem-preflight-alerts');
        }
      });

      const trigger = selector.querySelector('.e-selectnew[role="button"]');
      if (trigger) {
        let triggerPip = trigger.querySelector('.gem-lang-preflight-badge--trigger');
        const currentLang = getSelectedLanguageValue();
        const otherIssueCount = meta.reduce((sum, { value }) => {
          if (value === currentLang) return sum;
          return sum + (getLanguageAlertEntry(map, value).count > 0 ? 1 : 0);
        }, 0);
        if (otherIssueCount > 0) {
          if (!triggerPip) {
            triggerPip = document.createElement('span');
            triggerPip.className = 'gem-lang-preflight-badge gem-lang-preflight-badge--trigger';
            triggerPip.setAttribute('aria-hidden', 'true');
            trigger.appendChild(triggerPip);
          }
          triggerPip.textContent = String(Math.min(99, otherIssueCount));
          triggerPip.style.display = '';
        } else if (triggerPip) {
          triggerPip.remove();
        }
      }
    }

    document.querySelectorAll('.e-actionlist__item[role="option"]').forEach((item) => {
      item.querySelector('.gem-lang-preflight-badge')?.remove();
    });
    meta.forEach(({ value, text }) => {
      const count = getLanguageAlertEntry(map, value).count;
      if (count <= 0) return;
      const items = document.querySelectorAll('.e-actionlist__item[role="option"]');
      for (const item of items) {
        const itemText = normalizeLanguageOptionText(item.textContent || '');
        if (itemText !== text) continue;
        const badge = document.createElement('span');
        badge.className = 'gem-lang-preflight-badge';
        badge.textContent = String(Math.min(99, count));
        badge.setAttribute('aria-label', `${count} preflight issue${count === 1 ? '' : 's'}`);
        item.appendChild(badge);
        break;
      }
    });
  }

  function refreshLanguagePickerPreflightBadges() {
    const campaignId = getCampaignIdFromUrl();
    if (!campaignId) {
      applyLanguagePickerPreflightBadges({});
      renderLanguageOverviewPanel();
      return;
    }
    chrome.storage.local.get({ [PREFLIGHT_LANGUAGE_ALERTS_KEY]: {} }, (res) => {
      const all = res[PREFLIGHT_LANGUAGE_ALERTS_KEY] && typeof res[PREFLIGHT_LANGUAGE_ALERTS_KEY] === 'object'
        ? res[PREFLIGHT_LANGUAGE_ALERTS_KEY]
        : {};
      cachedLanguageAlertMap = all[campaignId] || {};
      applyLanguagePickerPreflightBadges(cachedLanguageAlertMap);
      renderLanguageOverviewPanel();
    });
  }

  function scheduleLanguagePickerPreflightBadges() {
    if (languagePreflightBadgeRefreshTimer) clearTimeout(languagePreflightBadgeRefreshTimer);
    languagePreflightBadgeRefreshTimer = setTimeout(() => {
      languagePreflightBadgeRefreshTimer = null;
      refreshLanguagePickerPreflightBadges();
    }, 60);
  }

  function persistLanguagePreflightAlertCount(alertCount) {
    const campaignId = getCampaignIdFromUrl();
    const lang = getSelectedLanguageValue();
    if (!campaignId || !lang) return;
    const safe = Math.max(0, Number.parseInt(String(alertCount), 10) || 0);
    chrome.storage.local.get({ [PREFLIGHT_LANGUAGE_ALERTS_KEY]: {} }, (res) => {
      const all = res[PREFLIGHT_LANGUAGE_ALERTS_KEY] && typeof res[PREFLIGHT_LANGUAGE_ALERTS_KEY] === 'object'
        ? { ...res[PREFLIGHT_LANGUAGE_ALERTS_KEY] }
        : {};
      const campaignMap = { ...(all[campaignId] || {}) };
      if (safe > 0) {
        campaignMap[lang] = { count: safe, updatedAt: Date.now() };
      } else {
        delete campaignMap[lang];
      }
      if (Object.keys(campaignMap).length === 0) {
        delete all[campaignId];
        cachedLanguageAlertMap = {};
      } else {
        all[campaignId] = campaignMap;
        cachedLanguageAlertMap = campaignMap;
      }
      chrome.storage.local.set({ [PREFLIGHT_LANGUAGE_ALERTS_KEY]: all }, () => {
        applyLanguagePickerPreflightBadges(cachedLanguageAlertMap);
        renderLanguageOverviewPanel();
      });
    });
  }

  function setupLanguagePreflightBadgeSync() {
    if (setupLanguagePreflightBadgeSync._bound) return;
    setupLanguagePreflightBadgeSync._bound = true;

    refreshLanguagePickerPreflightBadges();
    renderLanguageOverviewPanel();

    const observer = new MutationObserver(() => scheduleLanguagePickerPreflightBadges());
    observer.observe(document.body, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[PREFLIGHT_LANGUAGE_ALERTS_KEY]) return;
      const campaignId = getCampaignIdFromUrl();
      if (!campaignId) return;
      const all = changes[PREFLIGHT_LANGUAGE_ALERTS_KEY].newValue || {};
      cachedLanguageAlertMap = all[campaignId] || {};
      applyLanguagePickerPreflightBadges(cachedLanguageAlertMap);
      renderLanguageOverviewPanel();
    });
  }

  function getAlertPipEl() {
    return document.querySelector(`#${PRELIGHT_TAB_ID} [data-role="preflightAlertPip"]`);
  }

  function updateAlertPip(count) {
    const pip = getAlertPipEl();
    if (!pip) return;
    const safe = Math.max(0, Number.parseInt(count, 10) || 0);
    if (!safe) {
      pip.textContent = '0';
      pip.style.display = 'none';
      return;
    }
    pip.textContent = String(Math.min(99, safe));
    pip.style.display = '';
  }

  function persistAndUpdateOverallAlertPip() {
    const toggles = cachedPreflightIconPipToggles;
    const alertCount = Math.max(
      0,
      (toggles.imageWeight ? (Number.parseInt(String(latestImageAlertCount), 10) || 0) : 0) +
      (toggles.missingAlt ? (Number.parseInt(String(latestAccessibilityMissingAltCount), 10) || 0) : 0) +
      (toggles.linkTitles ? (Number.parseInt(String(latestLinkTitlesAlertCount), 10) || 0) : 0) +
      (toggles.linkLint ? (Number.parseInt(String(latestLinksAlertCount), 10) || 0) : 0) +
      (toggles.textAlerts ? (Number.parseInt(String(latestNotifyAlertCount), 10) || 0) : 0)
    );
    chrome.storage.local.set({ [PREFLIGHT_ALERT_COUNT_KEY]: alertCount });
    updateAlertPip(alertCount);
    persistLanguagePreflightAlertCount(alertCount);
  }

  function updateSectionPip(pipEl, count) {
    if (!pipEl) return;
    const safe = Math.max(0, Number.parseInt(count, 10) || 0);
    pipEl.textContent = String(Math.min(99, safe));
    pipEl.style.display = '';
    pipEl.classList.toggle('gem-preflight-section-pip--muted', safe <= 0);
  }

  function updateImagesSectionPip(count) {
    const els = getPreflightPanelEls();
    if (!els || !els.imagesSectionPip) return;
    updateSectionPip(els.imagesSectionPip, count);
  }

  function updateAccessibilitySectionPip(count) {
    const els = getPreflightPanelEls();
    if (!els || !els.accessibilitySectionPip) return;
    updateSectionPip(els.accessibilitySectionPip, count);
  }

  function updateLinksSectionPip(count) {
    const els = getPreflightPanelEls();
    if (!els || !els.linksSectionPip) return;
    updateSectionPip(els.linksSectionPip, count);
  }

  function updateTextAnalysisSectionPip(count) {
    const els = getPreflightPanelEls();
    if (!els || !els.textAnalysisSectionPip) return;
    updateSectionPip(els.textAnalysisSectionPip, count);
  }

  const LINK_HREF_MAX_LENGTH = 2000;
  const EMARSYS_FULL_URL_TOKEN = '#HTML_BROWSE_HREF#';
  const EMARSYS_TOKEN_PLACEHOLDER_URL = 'https://emarsys-token.invalid/';
  const LIVE_VERIFY_HELP_TEXT = 'Live verify only runs when the href begins with http:// or https://. mailto:, tel:, fragments, templated-only hrefs, and other schemes are skipped - use Contact Preview for personalized links.';
  const LINK_ISSUE_LABELS = {
    MISSING_HREF: 'Missing href',
    EMPTY_HREF: 'Empty href',
    JAVASCRIPT_HREF: 'javascript: URL',
    FRAGMENT_ONLY: 'Fragment-only URL',
    RELATIVE_HREF: 'Relative or non-absolute URL',
    HTTP_NOT_HTTPS: 'http:// (not HTTPS)',
    HREF_WHITESPACE: 'Href contains spaces or line breaks',
    HREF_TOO_LONG: 'Very long href'
  };

  function extractUnescapedTemplateRanges(rawHref) {
    const text = String(rawHref || '');
    const ranges = [];
    let idx = 0;
    while (idx < text.length - 1) {
      const start = text.indexOf('{{', idx);
      if (start === -1) break;
      const startEscaped = start > 0 && text[start - 1] === '\\';
      if (startEscaped) {
        idx = start + 2;
        continue;
      }
      let end = start + 2;
      let foundEnd = -1;
      while (end < text.length - 1) {
        const close = text.indexOf('}}', end);
        if (close === -1) break;
        const closeEscaped = close > 0 && text[close - 1] === '\\';
        if (!closeEscaped) {
          foundEnd = close + 2;
          break;
        }
        end = close + 2;
      }
      if (foundEnd === -1) break;
      ranges.push({ start, end: foundEnd });
      idx = foundEnd;
    }
    return ranges;
  }

  function sanitizeHrefForValidation(rawHref) {
    const text = String(rawHref || '');
    const ranges = extractUnescapedTemplateRanges(text);
    if (!ranges.length) {
      return { sanitized: text, hasTemplateTokens: false };
    }
    let cursor = 0;
    const parts = [];
    ranges.forEach((range) => {
      if (range.start > cursor) {
        parts.push(text.slice(cursor, range.start));
      }
      parts.push(EMARSYS_TOKEN_PLACEHOLDER_URL);
      cursor = range.end;
    });
    if (cursor < text.length) {
      parts.push(text.slice(cursor));
    }
    return { sanitized: parts.join(''), hasTemplateTokens: true };
  }

  function isEmarsysFullUrlToken(rawHref) {
    return String(rawHref || '').trim() === EMARSYS_FULL_URL_TOKEN;
  }

  function getLinkIssueCodesForAnchor(anchor) {
    const codes = [];
    if (!anchor.hasAttribute('href')) {
      return ['MISSING_HREF'];
    }
    const raw = anchor.getAttribute('href');
    if (raw === null) {
      return ['MISSING_HREF'];
    }
    const trimmed = raw.trim();
    if (trimmed === '') {
      codes.push('EMPTY_HREF');
      return codes;
    }
    if (isEmarsysFullUrlToken(trimmed)) {
      return [];
    }

    const sanitizedData = sanitizeHrefForValidation(trimmed);
    if (sanitizedData.hasTemplateTokens && !/^https?:\/\//i.test(trimmed)) {
      return [];
    }
    const rawForChecks = trimmed;
    const sanitizedTrimmed = sanitizedData.sanitized.trim();

    if (sanitizedTrimmed.length > LINK_HREF_MAX_LENGTH) {
      codes.push('HREF_TOO_LONG');
    }
    if (/[\s\n\r]/.test(sanitizedData.sanitized)) {
      codes.push('HREF_WHITESPACE');
    }
    const lower = rawForChecks.toLowerCase();
    if (lower.startsWith('javascript:')) {
      codes.push('JAVASCRIPT_HREF');
    }
    if (rawForChecks.startsWith('#')) {
      codes.push('FRAGMENT_ONLY');
    }
    const allowedWithoutRelativeFlag =
      /^https?:\/\//i.test(sanitizedTrimmed) ||
      /^mailto:/i.test(sanitizedTrimmed) ||
      /^tel:/i.test(sanitizedTrimmed) ||
      /^\/\//.test(sanitizedTrimmed) ||
      /^#/i.test(sanitizedTrimmed) ||
      /^cid:/i.test(sanitizedTrimmed) ||
      /^sms:/i.test(sanitizedTrimmed);
    if (!allowedWithoutRelativeFlag) {
      codes.push('RELATIVE_HREF');
    }
    if (/^http:\/\//i.test(sanitizedTrimmed)) {
      codes.push('HTTP_NOT_HTTPS');
    }
    return codes;
  }

  function linkGroupingKey(anchor) {
    if (!anchor.hasAttribute('href')) return '__missing__';
    const raw = anchor.getAttribute('href');
    if (raw === null) return '__missing__';
    if (raw.trim() === '') return '__empty__';
    return `__raw__:${raw}`;
  }

  function linkDisplayHref(anchor) {
    if (!anchor.hasAttribute('href')) return '(no href)';
    const raw = anchor.getAttribute('href');
    if (raw === null) return '(no href)';
    if (raw.trim() === '') return '(empty href)';
    return raw;
  }

  function computeLinkFetchMetadata(anchor, doc) {
    if (!anchor || !anchor.hasAttribute('href')) {
      return { hasTemplateTokens: false, fetchCandidateUrl: null };
    }
    const raw = anchor.getAttribute('href');
    if (raw === null) {
      return { hasTemplateTokens: false, fetchCandidateUrl: null };
    }
    const trimmed = raw.trim();
    if (!trimmed || isEmarsysFullUrlToken(trimmed)) {
      return { hasTemplateTokens: false, fetchCandidateUrl: null };
    }
    const sanitizedData = sanitizeHrefForValidation(trimmed);
    // Pure (or leading) template hrefs sanitize to https://emarsys-token.invalid/ — do not treat as a real fetch target.
    if (sanitizedData.hasTemplateTokens && !/^https?:\/\//i.test(trimmed)) {
      return { hasTemplateTokens: true, fetchCandidateUrl: null };
    }
    const base = doc && doc.baseURI ? doc.baseURI : window.location.href;
    const sanitizedTrimmed = sanitizedData.sanitized.trim();
    try {
      const u = new URL(sanitizedTrimmed, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { hasTemplateTokens: !!sanitizedData.hasTemplateTokens, fetchCandidateUrl: null };
      }
      if ((u.hostname || '').toLowerCase() === 'emarsys-token.invalid') {
        return { hasTemplateTokens: !!sanitizedData.hasTemplateTokens, fetchCandidateUrl: null };
      }
      return { hasTemplateTokens: !!sanitizedData.hasTemplateTokens, fetchCandidateUrl: u.href };
    } catch (_) {
      return { hasTemplateTokens: !!sanitizedData.hasTemplateTokens, fetchCandidateUrl: null };
    }
  }

  function analyzeLinksInPreviewDoc(doc) {
    const anchors = Array.from(doc.querySelectorAll('a'));
    const anchorRowKeysInOrder = anchors.map((a) => linkGroupingKey(a));
    const groups = new Map();

    anchors.forEach((anchor) => {
      const codes = getLinkIssueCodesForAnchor(anchor);
      const key = linkGroupingKey(anchor);
      const display = linkDisplayHref(anchor);
      let g = groups.get(key);
      if (!g) {
        g = { key, displayHref: display, referenceCount: 0, issueCodes: new Set(), representativeAnchor: anchor };
        groups.set(key, g);
      }
      g.referenceCount += 1;
      codes.forEach((c) => g.issueCodes.add(c));
      if (key !== '__missing__' && key !== '__empty__') {
        g.displayHref = display;
      }
    });

    const allRows = Array.from(groups.values())
      .map((g) => {
        const labels = Array.from(g.issueCodes)
          .map((c) => LINK_ISSUE_LABELS[c] || c)
          .sort((a, b) => a.localeCompare(b));
        const meta = computeLinkFetchMetadata(g.representativeAnchor, doc);
        const neverCheckUrlKey = normalizePreflightNeverCheckUrl(
          meta.hasTemplateTokens ? g.displayHref : (meta.fetchCandidateUrl || g.displayHref),
          doc && doc.baseURI
        );
        return {
          rowKey: g.key,
          displayHref: g.displayHref,
          referenceCount: g.referenceCount,
          issueLabels: labels,
          hasIssues: labels.length > 0,
          hasTemplateTokens: !!meta.hasTemplateTokens,
          fetchCandidateUrl: meta.fetchCandidateUrl,
          neverCheckUrlKey
        };
      })
      .sort((a, b) => {
        if (a.hasIssues !== b.hasIssues) return a.hasIssues ? -1 : 1;
        return (b.referenceCount || 0) - (a.referenceCount || 0);
      });

    const skippedRows = allRows
      .filter((row) => row.neverCheckUrlKey && preflightNeverCheckUrls.has(row.neverCheckUrlKey))
      .map((row) => ({
        ...row,
        issueLabels: [],
        hasIssues: false
      }));
    const rows = allRows.filter((row) => !(row.neverCheckUrlKey && preflightNeverCheckUrls.has(row.neverCheckUrlKey)));
    const linksAlertCount = rows.reduce((sum, row) => sum + (Array.isArray(row.issueLabels) ? row.issueLabels.length : 0), 0);

    return {
      totalAnchors: anchors.length,
      uniqueCount: rows.length,
      linksAlertCount,
      rows,
      skippedRows,
      anchorRowKeysInOrder: anchorRowKeysInOrder.filter((rk) => rows.some((r) => r.rowKey === rk))
    };
  }

  function ensureImageHoverTooltipEl() {
    if (imageHoverTooltipEl && imageHoverTooltipEl.isConnected) return imageHoverTooltipEl;
    const el = document.createElement('div');
    el.className = 'gem-preflight-image-tooltip';
    el.innerHTML = `
      <div class="gem-preflight-image-tooltip-inner">
        <img data-role="tooltipImage" alt="Image preview" />
      </div>
    `.trim();
    document.body.appendChild(el);
    imageHoverTooltipEl = el;
    return el;
  }

  function positionImageHoverTooltip(clientX, clientY) {
    const tip = ensureImageHoverTooltipEl();
    const pad = 14;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = tip.getBoundingClientRect();
    let left = clientX + pad;
    let top = clientY + pad;
    if (left + rect.width > vw - 8) left = Math.max(8, clientX - rect.width - pad);
    if (top + rect.height > vh - 8) top = Math.max(8, clientY - rect.height - pad);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hideImageHoverTooltip() {
    if (!imageHoverTooltipEl) return;
    imageHoverTooltipEl.classList.remove('gem-preflight-image-tooltip--visible');
  }

  function showImageHoverTooltip(url, clientX, clientY) {
    const tip = ensureImageHoverTooltipEl();
    const img = tip.querySelector('[data-role="tooltipImage"]');
    if (!img) return;
    if (img.getAttribute('src') !== url) {
      img.setAttribute('src', url);
    }
    tip.classList.add('gem-preflight-image-tooltip--visible');
    positionImageHoverTooltip(clientX, clientY);
  }

  function setupImageRowHoverTooltip() {
    const els = getPreflightPanelEls();
    if (!els || !els.panel || els.panel.dataset.gemTooltipBound === 'true') return;
    els.panel.dataset.gemTooltipBound = 'true';

    els.panel.addEventListener('mousemove', (e) => {
      const target = e.target && e.target.closest ? e.target.closest('.gem-preflight-image-breakdown-name[data-image-url]') : null;
      if (!target || !els.panel.contains(target)) {
        hideImageHoverTooltip();
        return;
      }
      const url = target.getAttribute('data-image-url');
      if (!url) {
        hideImageHoverTooltip();
        return;
      }
      showImageHoverTooltip(url, e.clientX, e.clientY);
    });

    els.panel.addEventListener('mouseleave', () => {
      hideImageHoverTooltip();
    });
  }

  function syncImageWeightDetailsCollapseUI(wrap, collapsed) {
    if (!wrap) return;
    wrap.classList.toggle('gem-preflight-image-breakdown--collapsed', !!collapsed);
    const btn = wrap.querySelector('[data-role="imageDetailsToggle"]');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const arrow = btn.querySelector('.gem-preflight-image-breakdown-toggle-arrow');
      if (arrow) arrow.textContent = collapsed ? '▸' : '▾';
    }
  }

  function setupImageWeightDetailsToggle() {
    const els = getPreflightPanelEls();
    if (!els || !els.panel || els.panel.dataset.gemImageDetailsToggleBound === 'true') return;
    els.panel.dataset.gemImageDetailsToggleBound = 'true';
    els.panel.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-role="imageDetailsToggle"]') : null;
      if (!btn || !els.panel.contains(btn)) return;
      const wrap = els.imageBreakdownWrap;
      if (!wrap) return;
      const nextCollapsed = !wrap.classList.contains('gem-preflight-image-breakdown--collapsed');
      syncImageWeightDetailsCollapseUI(wrap, nextCollapsed);
    });
  }

  function syncSkippedUrlsCollapseUI(wrap, collapsed) {
    if (!wrap) return;
    wrap.classList.toggle('gem-preflight-image-breakdown--collapsed', !!collapsed);
    const btn = wrap.querySelector('[data-role="skippedUrlsToggle"]');
    if (!btn) return;
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const arrow = btn.querySelector('.gem-preflight-image-breakdown-toggle-arrow');
    if (arrow) arrow.textContent = collapsed ? '▸' : '▾';
  }

  function setupSkippedUrlsToggle() {
    const els = getPreflightPanelEls();
    if (!els || !els.panel || els.panel.dataset.gemSkippedUrlsToggleBound === 'true') return;
    els.panel.dataset.gemSkippedUrlsToggleBound = 'true';
    els.panel.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-role="skippedUrlsToggle"]') : null;
      if (!btn || !els.panel.contains(btn)) return;
      const wrap = els.skippedUrlsWrap;
      if (!wrap) return;
      const nextCollapsed = !wrap.classList.contains('gem-preflight-image-breakdown--collapsed');
      syncSkippedUrlsCollapseUI(wrap, nextCollapsed);
    });
  }

  function normalizeSectionCollapseStateObject(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      languageOverview: !!src.languageOverview,
      textAnalysis: !!src.textAnalysis,
      accessibility: !!src.accessibility,
      links: !!src.links,
      images: !!src.images
    };
  }

  function readSectionCollapseState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ [PREFLIGHT_SECTION_COLLAPSE_STATE_KEY]: {} }, (res) => {
          if (chrome.runtime.lastError) {
            resolve(normalizeSectionCollapseStateObject({}));
            return;
          }
          resolve(normalizeSectionCollapseStateObject(res[PREFLIGHT_SECTION_COLLAPSE_STATE_KEY]));
        });
      } catch (_) {
        resolve(normalizeSectionCollapseStateObject({}));
      }
    });
  }

  function writeSectionCollapseState(state) {
    return new Promise((resolve) => {
      const safe = normalizeSectionCollapseStateObject(state);
      try {
        chrome.storage.local.set({ [PREFLIGHT_SECTION_COLLAPSE_STATE_KEY]: safe }, () => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  function syncPreflightSectionCollapseUI(panel, sectionKey, collapsed) {
    if (!panel || !sectionKey) return;
    const sectionWrap = panel.querySelector(`[data-role="${sectionKey}Section"]`);
    const body = panel.querySelector(`[data-role="${sectionKey}SectionBody"]`);
    const btn = panel.querySelector(`[data-role="toggleSectionBtn"][data-section-key="${sectionKey}"]`);
    if (sectionWrap) sectionWrap.classList.toggle('gem-preflight-collapsible-section--collapsed', !!collapsed);
    if (body) body.style.display = collapsed ? 'none' : '';
    if (!btn) return;
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const arrow = btn.querySelector('.gem-preflight-section-toggle-arrow');
    if (arrow) arrow.textContent = collapsed ? '▸' : '▾';
    btn.setAttribute('title', `${collapsed ? 'Expand' : 'Collapse'} ${getPreflightSectionLabel(sectionKey)}`);
    btn.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${getPreflightSectionLabel(sectionKey)}`);
  }

  function getPreflightSectionLabel(sectionKey) {
    const labels = {
      languageOverview: 'Languages overview',
      textAnalysis: 'Text Analysis',
      accessibility: 'Accessibility',
      links: 'Links',
      images: 'Images'
    };
    return labels[sectionKey] || String(sectionKey || '');
  }

  function setupSectionCollapseToggles() {
    const els = getPreflightPanelEls();
    if (!els || !els.panel || els.panel.dataset.gemSectionCollapseToggleBound === 'true') return;
    const panel = els.panel;
    panel.dataset.gemSectionCollapseToggleBound = 'true';
    panel.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-role="toggleSectionBtn"]') : null;
      if (!btn || !panel.contains(btn)) return;
      const sectionKey = btn.getAttribute('data-section-key');
      if (!sectionKey) return;
      const isExpanded = btn.getAttribute('aria-expanded') !== 'false';
      const nextCollapsed = isExpanded;
      syncPreflightSectionCollapseUI(panel, sectionKey, nextCollapsed);
      void readSectionCollapseState().then((state) => {
        state[sectionKey] = nextCollapsed;
        return writeSectionCollapseState(state);
      });
    });
  }

  function toBytes(value, unit) {
    const n = Number.parseFloat(String(value));
    if (!Number.isFinite(n) || n <= 0) return 0;
    const u = String(unit || '').toUpperCase() === 'KB' ? 'KB' : 'MB';
    return Math.round(n * (u === 'KB' ? 1024 : 1024 * 1024));
  }

  async function getPreflightThresholdSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        [PREFLIGHT_TOTAL_THRESHOLD_VALUE_KEY]: PREFLIGHT_DEFAULT_TOTAL_THRESHOLD_VALUE,
        [PREFLIGHT_TOTAL_THRESHOLD_UNIT_KEY]: PREFLIGHT_DEFAULT_THRESHOLD_UNIT,
        [PREFLIGHT_SINGULAR_THRESHOLD_VALUE_KEY]: PREFLIGHT_DEFAULT_SINGULAR_THRESHOLD_VALUE,
        [PREFLIGHT_SINGULAR_THRESHOLD_UNIT_KEY]: PREFLIGHT_DEFAULT_THRESHOLD_UNIT
      }, (res) => {
        resolve({
          totalValue: Number.parseFloat(String(res[PREFLIGHT_TOTAL_THRESHOLD_VALUE_KEY])) || PREFLIGHT_DEFAULT_TOTAL_THRESHOLD_VALUE,
          totalUnit: String(res[PREFLIGHT_TOTAL_THRESHOLD_UNIT_KEY] || PREFLIGHT_DEFAULT_THRESHOLD_UNIT).toUpperCase() === 'KB' ? 'KB' : 'MB',
          singularValue: Number.parseFloat(String(res[PREFLIGHT_SINGULAR_THRESHOLD_VALUE_KEY])) || PREFLIGHT_DEFAULT_SINGULAR_THRESHOLD_VALUE,
          singularUnit: String(res[PREFLIGHT_SINGULAR_THRESHOLD_UNIT_KEY] || PREFLIGHT_DEFAULT_THRESHOLD_UNIT).toUpperCase() === 'KB' ? 'KB' : 'MB'
        });
      });
    });
  }

  function normalizePreflightIconPipToggles(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      textAlerts: src.textAlerts !== false,
      missingAlt: src.missingAlt !== false,
      linkTitles: src.linkTitles !== false,
      linkLint: src.linkLint !== false,
      imageWeight: src.imageWeight !== false
    };
  }

  function loadPreflightIconPipTogglesSetting() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        [PREFLIGHT_ICON_PIP_TOGGLES_KEY]: PREFLIGHT_ICON_PIP_TOGGLES_DEFAULT
      }, (res) => {
        cachedPreflightIconPipToggles = normalizePreflightIconPipToggles(res[PREFLIGHT_ICON_PIP_TOGGLES_KEY]);
        resolve(cachedPreflightIconPipToggles);
      });
    });
  }

  function disconnectPreviewDocAccessibilityObserver() {
    if (previewDocAccessibilityObserver) {
      try {
        previewDocAccessibilityObserver.disconnect();
      } catch (_) {}
      previewDocAccessibilityObserver = null;
    }
    previewDocAccessibilityObserverDoc = null;
  }

  function renderAccessibilityWarningsIntoTable(tableEl, warnings) {
    if (!tableEl) return;
    const rows = Array.isArray(warnings) ? warnings : [];
    if (!rows.length) {
      tableEl.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No linked images with missing ALT text.</div>';
      return;
    }
    tableEl.innerHTML = rows.map((row) => `
      <div class="gem-preflight-image-breakdown-row">
        <div class="gem-preflight-image-breakdown-name" data-image-url="${escapeHtmlText(row.url || '')}">${escapeHtmlText(row.filename)}</div>
        <div class="gem-preflight-image-breakdown-size gem-preflight-image-breakdown-size--alert">Missing ALT</div>
      </div>
    `).join('');
  }

  function renderLinkTitlesTable(tableEl, warnings) {
    if (!tableEl) return;
    const rows = Array.isArray(warnings) ? warnings : [];
    if (!rows.length) {
      tableEl.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No links with title attributes.</div>';
      return;
    }
    tableEl.innerHTML = rows.map((row) => {
      const nameCell = row.kind === 'image' && row.imageUrl
        ? `<div class="gem-preflight-image-breakdown-name" data-image-url="${escapeHtmlText(row.imageUrl)}">${escapeHtmlText(row.displayName)}</div>`
        : `<div class="gem-preflight-image-breakdown-name">${escapeHtmlText(row.displayName)}</div>`;
      return `<div class="gem-preflight-image-breakdown-row">${nameCell}<div class="gem-preflight-image-breakdown-size gem-preflight-image-breakdown-size--alert">Remove Title</div></div>`;
    }).join('');
  }

  function getAccessibilityCombinedAlertCount() {
    return (
      (Number.parseInt(String(latestAccessibilityMissingAltCount), 10) || 0) +
      (Number.parseInt(String(latestLinkTitlesAlertCount), 10) || 0)
    );
  }

  function refreshLinkedImageMissingAltFromPreview() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    const doc = iframe && iframe.contentDocument;
    if (!doc || !doc.documentElement) return;
    const warnings = collectLinkedImageMissingAltWarnings(doc);
    cachedAccessibilityMissingAltRows = warnings.map((w) => ({
      url: w.url || '',
      filename: w.filename || ''
    }));
    latestAccessibilityMissingAltCount = warnings.length || 0;
    persistAndUpdateOverallAlertPip();
    if (!isPreflightActive()) return;
    const els = getPreflightPanelEls();
    if (!els || !els.accessibilityWarningsTable) return;
    renderAccessibilityWarningsIntoTable(els.accessibilityWarningsTable, warnings);
    updateAccessibilitySectionPip(getAccessibilityCombinedAlertCount());
  }

  function refreshLinkTitlesFromPreview() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    const doc = iframe && iframe.contentDocument;
    if (!doc || !doc.documentElement) return;
    const warnings = collectLinksWithTitleWarnings(doc);
    cachedLinkTitleRows = warnings.map((w) => ({
      kind: w.kind,
      displayName: w.displayName || '',
      imageUrl: w.imageUrl || ''
    }));
    latestLinkTitlesAlertCount = warnings.length || 0;
    persistAndUpdateOverallAlertPip();
    if (!isPreflightActive()) return;
    const els = getPreflightPanelEls();
    if (!els || !els.linkTitlesTable) return;
    renderLinkTitlesTable(els.linkTitlesTable, warnings);
    updateAccessibilitySectionPip(getAccessibilityCombinedAlertCount());
  }

  function scheduleAccessibilitySectionLiveRefresh() {
    if (accessibilityLiveRefreshTimer) clearTimeout(accessibilityLiveRefreshTimer);
    accessibilityLiveRefreshTimer = setTimeout(() => {
      accessibilityLiveRefreshTimer = null;
      try {
        refreshLinkedImageMissingAltFromPreview();
        refreshLinkTitlesFromPreview();
      } catch (_) {}
    }, 200);
  }

  /**
   * Watches the desktop preview iframe document for DOM / attribute changes that can affect
   * `a[href] img` missing-alt warnings, without re-running the full image-weight scan.
   */
  function setupPreviewDocAccessibilityObserver(iframe) {
    if (!iframe) return;
    let doc = null;
    try {
      doc = iframe.contentDocument;
    } catch (_) {
      doc = null;
    }
    const root = doc && (doc.documentElement || doc.body);
    if (!root) return;
    if (previewDocAccessibilityObserver && previewDocAccessibilityObserverDoc === doc) return;

    disconnectPreviewDocAccessibilityObserver();
    previewDocAccessibilityObserverDoc = doc;
    previewDocAccessibilityObserver = new MutationObserver(() => {
      scheduleAccessibilitySectionLiveRefresh();
    });
    try {
      previewDocAccessibilityObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['alt', 'src', 'srcset', 'href', 'class', 'style', 'title']
      });
    } catch (_) {
      disconnectPreviewDocAccessibilityObserver();
    }
  }

  function cleanupPreflightLifecycle() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (initialScanRetryTimer) {
      clearTimeout(initialScanRetryTimer);
      initialScanRetryTimer = null;
    }
    if (highlightDrivenTextRefreshTimer) {
      clearTimeout(highlightDrivenTextRefreshTimer);
      highlightDrivenTextRefreshTimer = null;
    }
    if (accessibilityLiveRefreshTimer) {
      clearTimeout(accessibilityLiveRefreshTimer);
      accessibilityLiveRefreshTimer = null;
    }
    if (linkRowMenuAlignRaf) {
      try {
        cancelAnimationFrame(linkRowMenuAlignRaf);
      } catch (_) {}
      linkRowMenuAlignRaf = null;
    }
    disconnectContactPreviewObserver();
    if (preflightLiveSessionSaveTimer) {
      clearTimeout(preflightLiveSessionSaveTimer);
      preflightLiveSessionSaveTimer = null;
    }
    cachedLinksAnalysis = null;
    cachedSkippedLinkRows = [];
    openLinkRowMenuKey = '';
    contactPreviewRenderedRowByEditorKey.clear();
    linkLiveState.clear();
    setLiveLinkFootnoteText('', false);
  }

  function parseCssBackgroundImageUrls(backgroundImageValue) {
    if (!backgroundImageValue || backgroundImageValue === 'none') return [];
    const urls = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let match = null;
    while ((match = re.exec(backgroundImageValue)) !== null) {
      if (match[2]) urls.push(match[2]);
    }
    return urls;
  }

  function normalizeUrl(rawUrl, baseUrl) {
    if (!rawUrl) return null;
    const trimmed = String(rawUrl).trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:image/')) return trimmed;
    if (trimmed.startsWith('blob:')) return trimmed;
    if (trimmed.startsWith('cid:')) return trimmed;
    try {
      const url = new URL(trimmed, baseUrl);
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function isImageLikeUrl(url) {
    if (!url) return false;
    if (url.startsWith('data:image/')) return true;
    if (url.startsWith('blob:')) return true;
    if (url.startsWith('cid:')) return true;
    try {
      const parsed = new URL(url);
      const pathname = (parsed.pathname || '').toLowerCase();
      if (/\.(avif|bmp|gif|ico|jpeg|jpg|png|svg|webp)(?:$|\?)/.test(pathname)) return true;
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function isIgnoredImageUrl(url) {
    if (!url) return false;
    const raw = String(url).trim().toLowerCase();
    if (!raw) return false;
    if (raw.startsWith('//assets.emarsys.net/')) return true;
    try {
      const parsed = new URL(url, window.location.href);
      return (parsed.hostname || '').toLowerCase() === 'assets.emarsys.net';
    } catch (_) {
      return false;
    }
  }

  function collectImageReferencesFromPreviewDoc(doc) {
    const refs = [];
    const base = doc.baseURI || window.location.href;

    doc.querySelectorAll('img').forEach((imgEl) => {
      const src = imgEl.getAttribute('src') || imgEl.currentSrc || '';
      const normalized = normalizeUrl(src, base);
      if (normalized && isImageLikeUrl(normalized) && !isIgnoredImageUrl(normalized)) {
        refs.push(normalized);
      }
    });

    doc.querySelectorAll('*').forEach((el) => {
      try {
        const style = doc.defaultView ? doc.defaultView.getComputedStyle(el) : null;
        if (!style) return;
        const bgUrls = parseCssBackgroundImageUrls(style.backgroundImage);
        bgUrls.forEach((u) => {
          const normalized = normalizeUrl(u, base);
          if (normalized && isImageLikeUrl(normalized) && !isIgnoredImageUrl(normalized)) {
            refs.push(normalized);
          }
        });
      } catch (_) {}
    });

    return refs;
  }

  function collectLinkedImageMissingAltWarnings(doc) {
    const warnings = [];
    const base = doc.baseURI || window.location.href;
    const seen = new Set();

    doc.querySelectorAll('a[href] img').forEach((imgEl) => {
      try {
        const altRaw = imgEl.getAttribute('alt');
        const hasAlt = typeof altRaw === 'string' && altRaw.trim().length > 0;
        if (hasAlt) return;
        const src = imgEl.getAttribute('src') || imgEl.currentSrc || '';
        const normalized = normalizeUrl(src, base);
        if (!normalized) return;
        const key = `${normalized}::${imgEl.getAttribute('alt') || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        warnings.push({
          url: normalized,
          filename: extractFilename(normalized)
        });
      } catch (_) {}
    });

    return warnings;
  }

  function truncateBreakdownLabelForPreflight(text, maxLen = 40) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (t.length <= maxLen) return t;
    return `${t.slice(0, maxLen - 1)}…`;
  }

  function getAnchorVisibleTextSummary(anchorEl, doc) {
    const owner = doc || (anchorEl && anchorEl.ownerDocument);
    if (!owner || !anchorEl) return '';
    try {
      const walker = owner.createTreeWalker(anchorEl, NodeFilter.SHOW_TEXT, null);
      const parts = [];
      let n;
      while ((n = walker.nextNode())) {
        const t = String(n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      }
      return parts.join(' ').trim();
    } catch (_) {
      return String(anchorEl.textContent || '').replace(/\s+/g, ' ').trim();
    }
  }

  function collectLinksWithTitleWarnings(doc) {
    const rows = [];
    const base = doc.baseURI || window.location.href;
    doc.querySelectorAll('a[href]').forEach((a) => {
      try {
        const titleAttr = a.getAttribute('title');
        if (typeof titleAttr !== 'string' || titleAttr.trim().length === 0) return;
        const textSummary = getAnchorVisibleTextSummary(a, doc);
        if (textSummary.length > 0) {
          rows.push({
            kind: 'text',
            displayName: truncateBreakdownLabelForPreflight(textSummary)
          });
          return;
        }
        const img = a.querySelector('img');
        if (img) {
          const src = img.getAttribute('src') || img.currentSrc || '';
          const normalized = normalizeUrl(src, base);
          if (!normalized) return;
          rows.push({
            kind: 'image',
            displayName: extractFilename(normalized),
            imageUrl: normalized
          });
          return;
        }
        const href = (a.getAttribute('href') || '').trim();
        const fallback = href || '(empty link)';
        rows.push({
          kind: 'text',
          displayName: truncateBreakdownLabelForPreflight(fallback)
        });
      } catch (_) {}
    });
    return rows;
  }

  function isDownloadableNetworkUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function normalizePreflightNeverCheckUrl(rawUrl, baseUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '';
    // Preserve tokenized/template URLs exactly as shown in Preflight.
    // Parsing can inject placeholder hosts or encode braces.
    if (trimmed.includes('{{') || trimmed.includes('}}') || /\$[^$]+\$/i.test(trimmed)) return trimmed;
    // Keep non-HTTP hrefs exactly as the user sees them in Preflight (e.g. raw template tokens).
    // Resolving against base URL would incorrectly prefix/encode values like "{{ ... }}".
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;
    try {
      const u = new URL(trimmed, baseUrl || window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (_) {}
    return trimmed;
  }

  function parsePreflightNeverCheckStoredValue(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean).map((v) => String(v));
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (!text) return [];
      if (text.startsWith('{') && text.includes('"v"')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.v === 2 && Array.isArray(parsed.p) && Array.isArray(parsed.e)) {
            const out = [];
            parsed.e.forEach((entry) => {
              if (typeof entry === 'string') {
                if (entry) out.push(entry);
                return;
              }
              if (Array.isArray(entry) && entry.length === 2) {
                const idx = Number.parseInt(String(entry[0]), 10);
                const suffix = String(entry[1] || '');
                const prefix = parsed.p[idx];
                if (typeof prefix === 'string') out.push(prefix + suffix);
              }
            });
            return out.filter(Boolean);
          }
        } catch (_) {}
      }
      return text.split('\n').map((v) => v.trim()).filter(Boolean);
    }
    return [];
  }

  function serializePreflightNeverCheckStoredValue(list) {
    const cleaned = Array.from(new Set((Array.isArray(list) ? list : []).map((v) => String(v || '').trim()).filter(Boolean)));
    cleaned.sort((a, b) => a.localeCompare(b));
    const baseline = cleaned.join('\n');

    const prefixCounts = new Map();
    cleaned.forEach((url) => {
      try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
        const prefix = `${u.origin}/`;
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      } catch (_) {}
    });
    const prefixes = Array.from(prefixCounts.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map(([prefix]) => prefix);
    if (!prefixes.length) return baseline;

    const entries = cleaned.map((url) => {
      for (let i = 0; i < prefixes.length; i += 1) {
        const p = prefixes[i];
        if (url.startsWith(p)) return [i, url.slice(p.length)];
      }
      return url;
    });
    const packed = JSON.stringify({ v: 2, p: prefixes, e: entries });
    return packed.length < baseline.length ? packed : baseline;
  }

  async function loadPreflightNeverCheckUrls() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ [PREFLIGHT_URL_NEVER_CHECK_KEY]: '' }, (res) => {
        const arr = parsePreflightNeverCheckStoredValue(res[PREFLIGHT_URL_NEVER_CHECK_KEY]);
        preflightNeverCheckUrls.clear();
        arr.forEach((u) => {
          const n = normalizePreflightNeverCheckUrl(u);
          if (n) preflightNeverCheckUrls.add(n);
        });
        resolve();
      });
    });
  }

  async function savePreflightNeverCheckUrls() {
    const serialized = serializePreflightNeverCheckStoredValue(Array.from(preflightNeverCheckUrls.values()));
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [PREFLIGHT_URL_NEVER_CHECK_KEY]: serialized }, () => resolve());
    });
  }

  async function setUrlPreflightNeverCheck(url, shouldSkip) {
    const normalized = normalizePreflightNeverCheckUrl(url);
    if (!normalized) return false;
    if (shouldSkip) preflightNeverCheckUrls.add(normalized);
    else preflightNeverCheckUrls.delete(normalized);
    await savePreflightNeverCheckUrls();
    return true;
  }

  /** True only for absolute URLs whose string form begins with http:// or https:// (case-insensitive). */
  function isHttpOrHttpsPreflightLink(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  }

  function displayHrefBeginsWithHttpOrHttps(displayHref) {
    return /^https?:\/\//i.test(String(displayHref || '').trim());
  }

  function rowEligibleForPreflightLiveVerify(row) {
    return !!(
      row &&
      !row.hasTemplateTokens &&
      row.fetchCandidateUrl &&
      isHttpOrHttpsPreflightLink(row.fetchCandidateUrl) &&
      displayHrefBeginsWithHttpOrHttps(row.displayHref)
    );
  }

  function getRenderedCompanionRowForEditorRow(row) {
    if (!row || row.isContactPreviewRenderedRow) return null;
    return contactPreviewRenderedRowByEditorKey.get(row.rowKey) || null;
  }

  function getPreferredLiveVerifyRow(row) {
    const companion = getRenderedCompanionRowForEditorRow(row);
    if (companion && rowEligibleForPreflightLiveVerify(companion)) return companion;
    return row;
  }

  function shouldCreateContactPreviewRenderedCompanion(editorRow, previewAnchor, previewDoc) {
    if (!editorRow || !previewAnchor || !previewDoc) return false;
    const meta = computeLinkFetchMetadata(previewAnchor, previewDoc);
    if (!meta.fetchCandidateUrl || !isHttpOrHttpsPreflightLink(meta.fetchCandidateUrl)) return false;
    const prevText = String(linkDisplayHref(previewAnchor)).trim();
    if (!displayHrefBeginsWithHttpOrHttps(prevText)) return false;
    if (editorRow.hasTemplateTokens) return true;
    if (!displayHrefBeginsWithHttpOrHttps(editorRow.displayHref)) return true;
    if (prevText !== String(editorRow.displayHref || '').trim()) return true;
    return false;
  }

  function buildSyntheticContactPreviewRow(editorRow, previewAnchor, previewDoc) {
    const codes = getLinkIssueCodesForAnchor(previewAnchor);
    const labels = codes.map((c) => LINK_ISSUE_LABELS[c] || c).sort((a, b) => a.localeCompare(b));
    const meta = computeLinkFetchMetadata(previewAnchor, previewDoc);
    return {
      rowKey: `__cp_rendered__:${encodeURIComponent(editorRow.rowKey)}`,
      parentEditorRowKey: editorRow.rowKey,
      isContactPreviewRenderedRow: true,
      displayHref: linkDisplayHref(previewAnchor),
      referenceCount: 1,
      issueLabels: labels,
      hasIssues: labels.length > 0,
      hasTemplateTokens: false,
      fetchCandidateUrl: meta.fetchCandidateUrl
    };
  }

  function clearContactPreviewRenderedRows() {
    contactPreviewRenderedRowByEditorKey.clear();
  }

  /**
   * Contact Preview can resolve the same editor link to a new rendered href or URL on a later pass.
   * If we keep the prior synthetic row's live-verify state, `lastPreviewResolvedUrl` can match the new
   * fetch URL and incorrectly skip a refetch while the logged companion row should reflect the latest preview.
   */
  function invalidateContactPreviewSyntheticLiveStateIfIdentityChanged(prevSyn, nextSyn) {
    if (!nextSyn || !nextSyn.rowKey) return;
    if (!prevSyn || typeof prevSyn !== 'object' || !prevSyn.rowKey) return;
    if (String(prevSyn.rowKey) !== String(nextSyn.rowKey)) return;
    const prevDisp = String(prevSyn.displayHref || '').trim();
    const nextDisp = String(nextSyn.displayHref || '').trim();
    const prevFetch = prevSyn.fetchCandidateUrl || null;
    const nextFetch = nextSyn.fetchCandidateUrl || null;
    if (prevFetch !== nextFetch || prevDisp !== nextDisp) {
      linkLiveState.delete(nextSyn.rowKey);
    }
  }

  function mergeEditorRowsWithContactPreviewRendered(baseRows, opts = {}) {
    const includeRenderedRows = !!opts.includeRenderedRows;
    if (!includeRenderedRows) return Array.isArray(baseRows) ? baseRows.slice() : [];
    const out = [];
    (baseRows || []).forEach((row) => {
      out.push(row);
      const syn = contactPreviewRenderedRowByEditorKey.get(row.rowKey);
      if (syn) out.push(syn);
    });
    return out;
  }

  function findLinkRowByRowKey(rowKey) {
    if (!rowKey || !cachedLinksAnalysis) return null;
    const base = cachedLinksAnalysis.rows || [];
    const hit = base.find((r) => r.rowKey === rowKey);
    if (hit) return hit;
    let found = null;
    contactPreviewRenderedRowByEditorKey.forEach((syn) => {
      if (syn && syn.rowKey === rowKey) found = syn;
    });
    return found;
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || 'Runtime message failed.' });
            return;
          }
          resolve(response || { ok: false, error: 'No response from background.' });
        });
      } catch (error) {
        resolve({ ok: false, error: error && error.message ? error.message : 'Runtime message failed.' });
      }
    });
  }

  async function fetchUniqueDownloadSize(uniqueUrls) {
    const networkUrls = uniqueUrls.filter(isDownloadableNetworkUrl);
    if (!networkUrls.length) {
      return { ok: true, knownBytes: 0, unknownCount: 0, networkCount: 0, unknownDetails: [] };
    }
    return sendRuntimeMessage({
      action: 'preflightMeasureImageUrls',
      urls: networkUrls
    });
  }

  async function ensureImageHostAccess() {
    const response = await sendRuntimeMessage({ action: 'preflightEnsureImageHostAccess' });
    return !!(response && response.ok && response.granted);
  }

  async function hasImageHostAccess() {
    const response = await sendRuntimeMessage({ action: 'preflightCheckImageHostAccess' });
    return !!(response && response.ok && response.granted);
  }

  async function ensureLinkHostAccess() {
    const response = await sendRuntimeMessage({ action: 'preflightEnsureLinkHostAccess' });
    return !!(response && response.ok && response.granted);
  }

  async function hasLinkHostAccess() {
    const response = await sendRuntimeMessage({ action: 'preflightCheckLinkHostAccess' });
    return !!(response && response.ok && response.granted);
  }

  function pruneLinkLiveStateForRows(rows) {
    const allowed = new Set((rows || []).map((r) => r && r.rowKey).filter(Boolean));
    contactPreviewRenderedRowByEditorKey.forEach((syn, editorKey) => {
      if (allowed.has(editorKey) && syn && syn.rowKey) allowed.add(syn.rowKey);
    });
    Array.from(linkLiveState.keys()).forEach((k) => {
      if (!allowed.has(k)) linkLiveState.delete(k);
    });
  }

  function setLiveLinkFootnoteText(text, visible) {
    const els = getPreflightPanelEls();
    if (!els || !els.liveLinkFootnote) return;
    els.liveLinkFootnote.style.display = visible ? '' : 'none';
    els.liveLinkFootnote.textContent = visible ? String(text || '') : '';
  }

  function isDesktopPreviewDocReady() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    const doc = iframe && iframe.contentDocument;
    return !!(doc && doc.documentElement);
  }

  function buildNetworkErrorHintText(errorName, failStage) {
    const name = String(errorName || '').trim();
    const stage = String(failStage || '').trim();
    const stageText = stage ? ` Failure stage: ${stage}.` : '';
    if (!name) return 'Request failed before an HTTP response arrived.';
    if (name === 'TypeError') {
      return `Browser/network fetch failed before an HTTP response (DNS/TLS/connectivity/policy/ad-blocker).${stageText}`;
    }
    return `${name}: request failed before an HTTP response arrived.${stageText}`;
  }

  function buildLinkProbeDiagnosticsText(r) {
    const probe = r && r.probe && typeof r.probe === 'object' ? r.probe : null;
    const nav = r && r.navigation && typeof r.navigation === 'object' ? r.navigation : null;
    const parts = [];
    if (nav) {
      const navMain = nav.ok
        ? `Top-level navigation landed successfully at ${nav.finalUrl || '(unknown URL)'}`
        : `Top-level navigation failed (${nav.errorName || 'NavigationError'})`;
      const navMeta = [
        Number.isFinite(nav.redirectCount) ? `${nav.redirectCount} redirect(s)` : '',
        Number.isFinite(nav.durationMs) ? `${nav.durationMs} ms` : ''
      ]
        .filter(Boolean)
        .join(', ');
      parts.push(navMeta ? `${navMain}. ${navMeta}.` : `${navMain}.`);
      if (Array.isArray(nav.events) && nav.events.length) {
        parts.push(`Navigation trace: ${nav.events.join(' · ')}`);
      }
    }
    if (probe) {
      const probeMain = `HTTP probe: ${probe.ok ? 'ok' : 'not-ok'} ${Number.isFinite(probe.status) ? `(status ${probe.status})` : ''}`.trim();
      parts.push(probeMain);
      const attempts = Array.isArray(probe.attempts) ? probe.attempts.join(' · ') : '';
      if (attempts) parts.push(`Probe attempts: ${attempts}`);
      if (probe.failStage) parts.push(`Probe failure stage: ${probe.failStage}`);
    } else {
      const attempts = Array.isArray(r && r.attempts) ? r.attempts.join(' · ') : '';
      if (attempts) parts.push(`Probe attempts: ${attempts}`);
    }
    return parts.join(' ');
  }

  function summarizeVerifyResult(r) {
    const attempts = Array.isArray(r.attempts) ? r.attempts.join(' · ') : '';
    if (r && r.category === 'navigationOk') {
      return {
        summary: 'Landed successfully',
        category: 'ok',
        detailText: buildLinkProbeDiagnosticsText(r)
      };
    }
    if (r && r.category === 'navigationError') {
      const detail = buildLinkProbeDiagnosticsText(r);
      return {
        summary: 'Navigation failed',
        category: 'networkError',
        detailText: detail
      };
    }
    if (r && r.ok) {
      return { summary: `OK ${r.status}`, category: 'ok', detailText: attempts };
    }
    if (r && r.category === 'networkError') {
      const hint = buildNetworkErrorHintText(r.errorName, r.failStage);
      const detail = [hint, attempts].filter(Boolean).join(' ');
      return { summary: 'Network fetch failed', category: 'networkError', detailText: detail };
    }
    if (r && r.category === 'blocked') {
      return {
        summary: 'Blocked',
        category: 'blocked',
        detailText: r.errorName || attempts || 'Cross-origin or opaque response.'
      };
    }
    if (r && Number.isFinite(r.status) && r.status > 0) {
      const cat = r.status >= 500 ? 'serverError' : 'clientError';
      return { summary: `HTTP ${r.status}`, category: cat, detailText: attempts || r.errorName || '' };
    }
    return {
      summary: (r && r.errorName) || 'Failed',
      category: (r && r.category) || 'clientError',
      detailText: attempts
    };
  }

  function buildLiveStatusPresentation(row) {
    const targetRow = getPreferredLiveVerifyRow(row);
    const statusRowKey = (targetRow && targetRow.rowKey) || (row && row.rowKey);
    const st = linkLiveState.get(statusRowKey);
    const stDetail = String((st && (st.detailText || st.detail)) || '').trim();
    if (!rowEligibleForPreflightLiveVerify(targetRow)) {
      return {
        className: 'gem-preflight-live-chip--skipped',
        label: 'Skipped',
        detailText: ''
      };
    }
    if (!st || st.phase === 'idle') {
      return { className: 'gem-preflight-live-chip--neutral', label: 'Not checked', detailText: '' };
    }
    if (st.phase === 'checking') {
      return { className: 'gem-preflight-live-chip--pending', label: 'Checking…', detailText: '' };
    }
    if (st.phase === 'error') {
      return {
        className: 'gem-preflight-live-chip--error',
        label: st.summary || 'Error',
        detailText: [stDetail, st.finalUrl].filter(Boolean).join(' ')
      };
    }
    const label = st.summary || 'Done';
    let chipClass = 'gem-preflight-live-chip--neutral';
    if (st.category === 'ok') chipClass = 'gem-preflight-live-chip--ok';
    else if (st.category === 'blocked' || st.category === 'clientError') chipClass = 'gem-preflight-live-chip--warn';
    else if (st.category === 'serverError' || st.category === 'networkError') chipClass = 'gem-preflight-live-chip--error';
    const detailParts = [
      stDetail,
      st.finalUrl && targetRow && targetRow.fetchCandidateUrl && st.finalUrl !== targetRow.fetchCandidateUrl ? `Final: ${st.finalUrl}` : ''
    ].filter(Boolean);
    return { className: chipClass, label, detailText: detailParts.join(' ') };
  }

  function buildPreflightLinkRowMenuHtml(row, opts) {
    if (!row || row.isContactPreviewRenderedRow) return '';
    const neverKey = row.neverCheckUrlKey || normalizePreflightNeverCheckUrl(row.fetchCandidateUrl || row.displayHref);
    if (!neverKey) return '';
    const inSkippedSection = !!(opts && opts.isSkippedSection);
    const isSkipped = preflightNeverCheckUrls.has(neverKey);
    const menuKey = `${inSkippedSection ? 'skipped' : 'main'}:${row.rowKey}`;
    const isOpen = openLinkRowMenuKey === menuKey;
    const neverItem = !isSkipped && !inSkippedSection
      ? '<button type="button" class="gem-preflight-links-row-menu-item" data-action="gem-url-never-check">Always skip</button>'
      : '';
    const alwaysItem = isSkipped
      ? '<button type="button" class="gem-preflight-links-row-menu-item" data-action="gem-url-always-check">Never Skip</button>'
      : '';
    const menuItems = `${neverItem}${alwaysItem}`;
    if (!menuItems) return '';
    return `<div class="gem-preflight-links-row-menu-wrap">
      <button type="button" class="gem-preflight-live-links-row-btn gem-preflight-live-links-row-btn--secondary" data-action="gem-open-row-menu" data-gem-link-row-key="${encodeURIComponent(row.rowKey || '')}" data-gem-link-menu-context="${inSkippedSection ? 'skipped' : 'main'}" title="URL check options" aria-label="URL check options">⚙</button>
      <div class="gem-preflight-links-row-menu${isOpen ? ' gem-preflight-links-row-menu--open' : ''}" data-gem-link-row-key="${encodeURIComponent(row.rowKey || '')}" data-gem-link-menu-context="${inSkippedSection ? 'skipped' : 'main'}">
        ${menuItems}
      </div>
    </div>`;
  }

  function scheduleOpenLinkRowMenuAlignment() {
    if (linkRowMenuAlignRaf) {
      try {
        cancelAnimationFrame(linkRowMenuAlignRaf);
      } catch (_) {}
      linkRowMenuAlignRaf = null;
    }
    linkRowMenuAlignRaf = requestAnimationFrame(() => {
      linkRowMenuAlignRaf = null;
      const panel = document.querySelector(PRELIGHT_PANEL_TAG);
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const menus = Array.from(panel.querySelectorAll('.gem-preflight-links-row-menu.gem-preflight-links-row-menu--open'));
      if (!menus.length) return;
      const pad = 8;
      menus.forEach((menu) => {
        if (!menu || !menu.classList) return;
        menu.classList.remove('gem-preflight-links-row-menu--align-left', 'gem-preflight-links-row-menu--align-right');
        menu.classList.add('gem-preflight-links-row-menu--align-right');
        let rect = menu.getBoundingClientRect();
        if (rect.left < (panelRect.left + pad)) {
          menu.classList.remove('gem-preflight-links-row-menu--align-right');
          menu.classList.add('gem-preflight-links-row-menu--align-left');
          rect = menu.getBoundingClientRect();
        }
        if (rect.right > (panelRect.right - pad)) {
          menu.classList.remove('gem-preflight-links-row-menu--align-left');
          menu.classList.add('gem-preflight-links-row-menu--align-right');
        }
      });
    });
  }

  function renderLinksTableHtml(lrows, opts = {}) {
    const inSkippedSection = !!opts.isSkippedSection;
    if (inSkippedSection) {
      return lrows
        .map((row) => {
          const rk = encodeURIComponent(row.rowKey || '');
          const live = {
            className: 'gem-preflight-live-chip--skipped',
            label: 'Skipped by setting',
            detailText: 'This URL is listed in the Skip List and is excluded from formatting and live checks.'
          };
          const cpBadge = row.isContactPreviewRenderedRow
            ? '<div class="gem-preflight-links-row-cp-badge">Contact Preview - rendered URL</div>'
            : '';
          const menuBtn = buildPreflightLinkRowMenuHtml(row, { isSkippedSection: true });
          const liveDetail = String(live.detailText || '').trim();
          const liveDetailBlock = liveDetail
            ? `<div class="gem-preflight-live-debug">${escapeHtmlText(liveDetail)}</div>`
            : '';
          const issueLabels = Array.isArray(row.issueLabels) ? row.issueLabels : [];
          const issueCount = issueLabels.length;
          const lintSummaryTitle = issueCount > 0 ? escapeHtmlText(issueLabels.join(', ')) : '';
          const lintCell = issueCount > 0
            ? `<span class="gem-preflight-links-lint-pip" title="${lintSummaryTitle}" aria-label="${issueCount} link issue${issueCount === 1 ? '' : 's'}">${String(Math.min(99, issueCount))}</span>`
            : `<span class="gem-preflight-links-lint-ok" title="No static link issues" aria-label="No link issues"><span aria-hidden="true">&#10003;</span></span>`;
          const issuesBlock =
            issueCount > 0
              ? `<div class="gem-preflight-links-row-line3" role="region" aria-label="Link issues">
            <ul class="gem-preflight-links-issue-list">
              ${issueLabels.map((lab) => `<li>${escapeHtmlText(lab)}</li>`).join('')}
            </ul>
          </div>`
              : '';
          return `
        <div class="gem-preflight-links-row">
          <div class="gem-preflight-links-row-line1">
            <div class="gem-preflight-links-row-main">
              ${cpBadge}
              <div class="gem-preflight-image-breakdown-name gem-preflight-link-href" title="${escapeHtmlText(row.displayHref)}">${escapeHtmlText(row.displayHref)}${row.referenceCount > 1 ? ` (${row.referenceCount}x)` : ''}</div>
            </div>
            <div class="gem-preflight-links-row-lint">${lintCell}</div>
          </div>
          ${issuesBlock}
          <div class="gem-preflight-links-row-line2">
            <div class="gem-preflight-links-row-live">
              <span class="gem-preflight-live-chip ${live.className}">${escapeHtmlText(live.label)}</span>
              ${liveDetailBlock}
            </div>
            <div class="gem-preflight-links-row-actions">${menuBtn}</div>
          </div>
        </div>`;
        })
        .join('');
    }
    return lrows
      .map((row) => {
        const rk = encodeURIComponent(row.rowKey || '');
        if (row.isContactPreviewRenderedRow) return '';
        const renderedCompanion = contactPreviewRenderedRowByEditorKey.get(row.rowKey) || null;
        const renderedDisplayHref = renderedCompanion ? String(renderedCompanion.displayHref || '').trim() : '';
        const originalDisplayHref = String(row.displayHref || '').trim();
        const showRenderedHref = !!(renderedDisplayHref && renderedDisplayHref !== originalDisplayHref);
        const live = buildLiveStatusPresentation(row);
        const preferredLiveRow = getPreferredLiveVerifyRow(row);
        const canCheck = rowEligibleForPreflightLiveVerify(preferredLiveRow);
        const liveState = linkLiveState.get((preferredLiveRow && preferredLiveRow.rowKey) || row.rowKey);
        const hasLiveResultState = !!(liveState && liveState.phase && liveState.phase !== 'idle');
        const showLiveSection = preflightLiveLinkVerifyEnabled === true;
        const needsContactPreviewForLiveVerify = !rowEligibleForPreflightLiveVerify(row) && !!row.hasTemplateTokens && !renderedCompanion;
        const showVerifyContactPreviewChip =
          showLiveSection &&
          live.className === 'gem-preflight-live-chip--skipped' &&
          needsContactPreviewForLiveVerify;
        const liveValueHtml = !showLiveSection
          ? ''
          : canCheck && !hasLiveResultState
            ? `<button type="button" class="gem-preflight-live-check-link" data-action="gem-live-verify-one" data-gem-link-row-key="${rk}" title="Live verify this URL" aria-label="Live verify this link">Check</button>`
            : `<span class="gem-preflight-live-chip ${live.className}">${escapeHtmlText(live.label)}</span>${showVerifyContactPreviewChip ? '<button type="button" class="gem-preflight-live-chip gem-preflight-live-chip-btn gem-preflight-live-chip--neutral" data-action="gem-open-contact-preview" title="Open Emarsys Contact Preview to render URL" aria-label="Open Contact Preview">Verify</button>' : ''}`;
        const liveDetail = showLiveSection ? String(live.detailText || '').trim() : '';
        const liveDetailBlock = liveDetail
          ? `<div class="gem-preflight-live-debug gem-preflight-links-stacked-subtext">${escapeHtmlText(liveDetail)}</div>`
          : '';
        const menuBtn = buildPreflightLinkRowMenuHtml(row, { isSkippedSection: false });
        const issueLabels = Array.isArray(row.issueLabels) ? row.issueLabels : [];
        const issueCount = issueLabels.length;
        const formattingStatus = issueCount > 0
          ? `<span class="gem-preflight-links-format-count" aria-label="${issueCount} formatting issue${issueCount === 1 ? '' : 's'}">${String(Math.min(99, issueCount))}</span>`
          : '<span class="gem-preflight-live-chip gem-preflight-live-chip--ok" aria-label="No formatting issues">Passed</span>';
        const formattingIssuesBlock = issueCount > 0
          ? `<div class="gem-preflight-links-stacked-subtext" role="region" aria-label="Formatting issues">
              <ul class="gem-preflight-links-issue-list">
                ${issueLabels.map((lab) => `<li>${escapeHtmlText(lab)}</li>`).join('')}
              </ul>
            </div>`
          : '';
        return `
        <div class="gem-preflight-links-table">
        <div class="gem-preflight-links-row gem-preflight-links-row--stacked">
          <div class="gem-preflight-links-stacked-url-row">
            <div class="gem-preflight-image-breakdown-name gem-preflight-link-href" title="${escapeHtmlText(row.displayHref)}">${escapeHtmlText(row.displayHref)}${row.referenceCount > 1 ? ` (${row.referenceCount}x)` : ''}</div>
            ${menuBtn ? `<div class="gem-preflight-links-row-actions">${menuBtn}</div>` : ''}
          </div>
          ${showRenderedHref
            ? `<div class="gem-preflight-links-stacked-subtext"><span class="gem-preflight-links-stacked-label-inline">Rendered URL:</span> ${escapeHtmlText(renderedDisplayHref)}</div>`
            : ''
          }
          ${showLiveSection
            ? `<div class="gem-preflight-links-stacked-kv-row">
              <div class="gem-preflight-links-stacked-kv-label gem-preflight-links-stacked-kv-label--with-help">
                <span>Live Verify</span>
                <e-tooltip
                  placement="top"
                  content="${escapeHtmlText(LIVE_VERIFY_HELP_TEXT)}"
                  role="tooltip"
                  aria-description="${escapeHtmlText(LIVE_VERIFY_HELP_TEXT)}"
                >
                  <span class="gem-preflight-subsection-help-icon gem-preflight-links-help-icon" tabindex="0" aria-label="About Live Verify checks"></span>
                </e-tooltip>
              </div>
              <div class="gem-preflight-links-stacked-kv-value">${liveValueHtml}</div>
            </div>
            ${liveDetailBlock}`
            : ''
          }
          <div class="gem-preflight-links-stacked-kv-row">
            <div class="gem-preflight-links-stacked-kv-label">Formatting</div>
            <div class="gem-preflight-links-stacked-kv-value">${formattingStatus}</div>
          </div>
          ${formattingIssuesBlock}
        </div>
        </div>`;
      })
      .filter(Boolean)
      .join('');
  }

  function renderLinksTableIntoEl(linksTableEl, lrows, emptyMessage) {
    if (!linksTableEl) return;
    if (!lrows.length) {
      linksTableEl.innerHTML = `<div class="gem-preflight-image-breakdown-empty">${emptyMessage}</div>`;
      syncLiveVerifyAllButtonState();
      return;
    }
    const merged = mergeEditorRowsWithContactPreviewRendered(lrows, { includeRenderedRows: false });
    linksTableEl.innerHTML = renderLinksTableHtml(merged, { isSkippedSection: false });
    syncLiveVerifyAllButtonState();
    scheduleOpenLinkRowMenuAlignment();
  }

  function renderSkippedUrlsSection() {
    const els = getPreflightPanelEls();
    if (!els || !els.skippedUrlsTable || !els.skippedUrlsWrap) return;
    const rows = Array.isArray(cachedSkippedLinkRows) ? cachedSkippedLinkRows : [];
    if (!rows.length) {
      els.skippedUrlsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No skipped URLs.</div>';
      els.skippedUrlsWrap.style.display = 'none';
      return;
    }
    els.skippedUrlsWrap.style.display = '';
    els.skippedUrlsTable.innerHTML = renderLinksTableHtml(rows, { isSkippedSection: true });
    scheduleOpenLinkRowMenuAlignment();
  }

  function syncLiveVerifyAllButtonState() {
    const els = getPreflightPanelEls();
    if (!els || !els.liveVerifyAllLinksBtn) return;
    const lrows = (cachedLinksAnalysis && cachedLinksAnalysis.rows) || [];
    const ready = isDesktopPreviewDocReady() && lrows.length > 0;
    const enabled = preflightLiveLinkVerifyEnabled === true;
    els.liveVerifyAllLinksBtn.disabled = !enabled || !ready || editorLinkLiveVerifyAllInFlight;
    if (!enabled) {
      els.liveVerifyAllLinksBtn.title = 'Enable Live Verify in Settings > Link Alerts';
      els.liveVerifyAllLinksBtn.setAttribute('aria-label', 'Enable Live Verify in Settings > Link Alerts');
    } else {
      els.liveVerifyAllLinksBtn.title = 'Live HTTP(S) check for all eligible links (requests host access)';
      els.liveVerifyAllLinksBtn.setAttribute('aria-label', 'Live verify all links');
    }
  }

  function refreshLinksTableFromCache() {
    const els = getPreflightPanelEls();
    if (!els || !els.linksTable || !cachedLinksAnalysis) return;
    const lrows = cachedLinksAnalysis.rows || [];
    renderLinksTableIntoEl(els.linksTable, lrows, 'No links found.');
  }

  function collectRowKeysFromUrlMap(urlToRowKeys) {
    const out = new Set();
    urlToRowKeys.forEach((set) => {
      set.forEach((rk) => out.add(rk));
    });
    return Array.from(out);
  }

  function collectUrlConflictsForRowKeys(urlToRowKeys) {
    const rowKeyToUrls = new Map();
    urlToRowKeys.forEach((rowKeys, url) => {
      rowKeys.forEach((rk) => {
        if (!rowKeyToUrls.has(rk)) rowKeyToUrls.set(rk, new Set());
        rowKeyToUrls.get(rk).add(url);
      });
    });
    let n = 0;
    rowKeyToUrls.forEach((urls) => {
      if (urls.size > 1) n += 1;
    });
    return n;
  }

  function applyVerifyResultsToState(urlToRowKeys, results, source, mappingMode) {
    const byUrl = new Map();
    (results || []).forEach((r) => {
      if (r && r.url) byUrl.set(r.url, r);
    });
    urlToRowKeys.forEach((rowKeys, url) => {
      const r = byUrl.get(url);
      rowKeys.forEach((rowKey) => {
        if (!r) {
          linkLiveState.set(rowKey, {
            phase: 'error',
            checkedAt: Date.now(),
            source,
            summary: 'No result',
            category: 'networkError',
            detail: '',
            lastMappingMode: mappingMode || null,
            lastPreviewResolvedUrl: url
          });
          return;
        }
        const sum = summarizeVerifyResult(r);
        linkLiveState.set(rowKey, {
          phase: 'done',
          checkedAt: Date.now(),
          source,
          ...sum,
          ok: !!r.ok,
          status: r.status,
          finalUrl: r.finalUrl,
          errorName: r.errorName,
          lastPreviewResolvedUrl: url,
          lastMappingMode: mappingMode || null
        });
      });
    });
    refreshLinksTableFromCache();
    schedulePersistPreflightLiveSession();
  }

  function urlRowKeysNeedLiveNetworkFetch(url, rowKeys, opts) {
    if (opts && opts.forceNetworkFetch) return true;
    const keys = Array.from(rowKeys);
    return keys.some((rk) => {
      const st = linkLiveState.get(rk);
      if (!st || st.phase !== 'done') return true;
      if (st.lastPreviewResolvedUrl && st.lastPreviewResolvedUrl !== url) return true;
      return false;
    });
  }

  async function executeLiveVerifyFromUrlMap(urlToRowKeys, source, meta) {
    const fetchOpts = meta && typeof meta === 'object' ? meta : null;
    const filteredUrlToRowKeys = new Map();
    urlToRowKeys.forEach((rowKeys, url) => {
      if (!url) return;
      if (urlRowKeysNeedLiveNetworkFetch(url, rowKeys, fetchOpts)) filteredUrlToRowKeys.set(url, rowKeys);
    });
    const urls = [...filteredUrlToRowKeys.keys()].filter(Boolean);
    const rowKeys = collectRowKeysFromUrlMap(filteredUrlToRowKeys);
    if (!urls.length) {
      refreshLinksTableFromCache();
      schedulePersistPreflightLiveSession();
      return;
    }
    rowKeys.forEach((rk) => {
      linkLiveState.set(rk, { phase: 'checking', checkedAt: Date.now(), source });
    });
    refreshLinksTableFromCache();

    if (source === 'editor') {
      const granted = await ensureLinkHostAccess();
      if (!isPreflightActive()) return;
      if (!granted) {
        rowKeys.forEach((rk) => {
          linkLiveState.set(rk, {
            phase: 'error',
            checkedAt: Date.now(),
            source,
            summary: 'Host access denied',
            category: 'blocked',
            detail: 'Grant https/http host access when prompted to run live link checks.'
          });
        });
        refreshLinksTableFromCache();
        schedulePersistPreflightLiveSession();
        return;
      }
    } else if (source === 'contact-preview') {
      const ok = await hasLinkHostAccess();
      if (!isPreflightActive()) return;
      if (!ok) {
        rowKeys.forEach((rk) => {
          linkLiveState.set(rk, {
            phase: 'error',
            checkedAt: Date.now(),
            source,
            summary: 'No host access',
            category: 'blocked',
            detail: 'Use “Live verify all” once to grant access.'
          });
        });
        refreshLinksTableFromCache();
        schedulePersistPreflightLiveSession();
        return;
      }
    }

    const response = await sendRuntimeMessage({ action: 'preflightVerifyLinkUrls', urls });
    if (!isPreflightActive()) return;
    if (!response || !response.ok) {
      rowKeys.forEach((rk) => {
        linkLiveState.set(rk, {
          phase: 'error',
          checkedAt: Date.now(),
          source,
          summary: 'Verify failed',
          category: 'networkError',
          detail: (response && response.error) || 'Unknown error'
        });
      });
      refreshLinksTableFromCache();
      schedulePersistPreflightLiveSession();
      return;
    }
    applyVerifyResultsToState(filteredUrlToRowKeys, response.results || [], source, meta && meta.mappingMode);
  }

  async function runLiveVerifyAllLinks() {
    if (!preflightLiveLinkVerifyEnabled) return;
    if (!cachedLinksAnalysis || editorLinkLiveVerifyAllInFlight) return;
    const rows = mergeEditorRowsWithContactPreviewRendered(cachedLinksAnalysis.rows || []).filter((r) =>
      rowEligibleForPreflightLiveVerify(r)
    );
    const urlToRowKeys = new Map();
    rows.forEach((row) => {
      const url = row.fetchCandidateUrl;
      if (!urlToRowKeys.has(url)) urlToRowKeys.set(url, new Set());
      urlToRowKeys.get(url).add(row.rowKey);
    });
    if (urlToRowKeys.size === 0) return;
    editorLinkLiveVerifyAllInFlight = true;
    syncLiveVerifyAllButtonState();
    try {
      await executeLiveVerifyFromUrlMap(urlToRowKeys, 'editor', { mappingMode: 'editor-bulk' });
    } finally {
      editorLinkLiveVerifyAllInFlight = false;
      syncLiveVerifyAllButtonState();
    }
  }

  async function runLiveVerifyOneRow(rowKey) {
    if (!preflightLiveLinkVerifyEnabled) return;
    if (!cachedLinksAnalysis || !rowKey) return;
    const row = findLinkRowByRowKey(rowKey);
    if (!row) return;
    const preferredRow = getPreferredLiveVerifyRow(row);
    if (!preferredRow || preferredRow.hasTemplateTokens || !rowEligibleForPreflightLiveVerify(preferredRow)) return;
    const m = new Map();
    m.set(preferredRow.fetchCandidateUrl, new Set([preferredRow.rowKey]));
    await executeLiveVerifyFromUrlMap(m, 'editor', { mappingMode: 'editor-row', forceNetworkFetch: true });
  }

  function sortLinkRowsForDisplay(rows) {
    return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
      if (!!a.hasIssues !== !!b.hasIssues) return a.hasIssues ? -1 : 1;
      return (b.referenceCount || 0) - (a.referenceCount || 0);
    });
  }

  function refreshLinkMetricsFromCache() {
    const panel = document.querySelector(PRELIGHT_PANEL_TAG);
    if (!panel) return;
    const linksTotalEl = panel.querySelector('[data-metric="linksTotal"]');
    const linksUniqueEl = panel.querySelector('[data-metric="linksUnique"]');
    const activeRows = (cachedLinksAnalysis && Array.isArray(cachedLinksAnalysis.rows)) ? cachedLinksAnalysis.rows : [];
    const skippedRows = Array.isArray(cachedSkippedLinkRows) ? cachedSkippedLinkRows : [];
    const totalAnchors = activeRows.concat(skippedRows).reduce((sum, row) => sum + (row && row.referenceCount ? row.referenceCount : 0), 0);
    const totalUniqueLinks = activeRows.length + skippedRows.length;
    const linksAlertCount = activeRows.reduce((sum, row) => sum + (Array.isArray(row.issueLabels) ? row.issueLabels.length : 0), 0);
    if (linksTotalEl) linksTotalEl.textContent = String(totalAnchors);
    if (linksUniqueEl) linksUniqueEl.textContent = String(totalUniqueLinks);
    updateLinksSectionPip(linksAlertCount);
    if (cachedLinksAnalysis) {
      cachedLinksAnalysis.totalAnchors = totalAnchors;
      cachedLinksAnalysis.uniqueCount = totalUniqueLinks;
      cachedLinksAnalysis.linksAlertCount = linksAlertCount;
    }
  }

  function applyNeverCheckToCurrentRows(targetUrl, shouldSkip) {
    if (!cachedLinksAnalysis) return;
    const normalizedTarget = normalizePreflightNeverCheckUrl(targetUrl);
    if (!normalizedTarget) return;
    const active = Array.isArray(cachedLinksAnalysis.rows) ? cachedLinksAnalysis.rows.slice() : [];
    const skipped = Array.isArray(cachedSkippedLinkRows) ? cachedSkippedLinkRows.slice() : [];

    if (shouldSkip) {
      const keep = [];
      active.forEach((row) => {
        const key = normalizePreflightNeverCheckUrl(row && (row.neverCheckUrlKey || row.fetchCandidateUrl || row.displayHref));
        if (key && key === normalizedTarget) {
          skipped.push({ ...row, issueLabels: [], hasIssues: false });
          if (row && row.rowKey) {
            linkLiveState.delete(row.rowKey);
            const syn = contactPreviewRenderedRowByEditorKey.get(row.rowKey);
            if (syn && syn.rowKey) linkLiveState.delete(syn.rowKey);
            contactPreviewRenderedRowByEditorKey.delete(row.rowKey);
          }
        } else {
          keep.push(row);
        }
      });
      cachedLinksAnalysis.rows = sortLinkRowsForDisplay(keep);
      cachedSkippedLinkRows = sortLinkRowsForDisplay(skipped);
      cachedLinksAnalysis.anchorRowKeysInOrder = (cachedLinksAnalysis.anchorRowKeysInOrder || []).filter((rk) =>
        cachedLinksAnalysis.rows.some((r) => r && r.rowKey === rk)
      );
    } else {
      const stillSkipped = [];
      const movedBack = [];
      skipped.forEach((row) => {
        const key = normalizePreflightNeverCheckUrl(row && (row.neverCheckUrlKey || row.fetchCandidateUrl || row.displayHref));
        if (key && key === normalizedTarget) movedBack.push(row);
        else stillSkipped.push(row);
      });
      if (movedBack.length) {
        const restored = movedBack.map((row) => ({ ...row, hasIssues: Array.isArray(row.issueLabels) && row.issueLabels.length > 0 }));
        cachedLinksAnalysis.rows = sortLinkRowsForDisplay(active.concat(restored));
        cachedSkippedLinkRows = sortLinkRowsForDisplay(stillSkipped);
        const existing = new Set(cachedLinksAnalysis.anchorRowKeysInOrder || []);
        restored.forEach((row) => {
          if (row && row.rowKey && !existing.has(row.rowKey)) {
            cachedLinksAnalysis.anchorRowKeysInOrder = (cachedLinksAnalysis.anchorRowKeysInOrder || []).concat([row.rowKey]);
            existing.add(row.rowKey);
          }
        });
      }
    }

    pruneLinkLiveStateForRows(cachedLinksAnalysis.rows || []);
    refreshLinksTableFromCache();
    renderSkippedUrlsSection();
    refreshLinkMetricsFromCache();
    schedulePersistPreflightLiveSession();
  }

  async function reapplyNeverCheckSetToCachedRows() {
    if (!cachedLinksAnalysis) return;
    await loadPreflightNeverCheckUrls();
    const active = Array.isArray(cachedLinksAnalysis.rows) ? cachedLinksAnalysis.rows.slice() : [];
    const skipped = Array.isArray(cachedSkippedLinkRows) ? cachedSkippedLinkRows.slice() : [];
    const allRows = active.concat(skipped);
    const nextActive = [];
    const nextSkipped = [];
    allRows.forEach((row) => {
      const key = normalizePreflightNeverCheckUrl(row && (row.neverCheckUrlKey || row.fetchCandidateUrl || row.displayHref));
      if (key && preflightNeverCheckUrls.has(key)) nextSkipped.push({ ...row, issueLabels: [], hasIssues: false });
      else nextActive.push({ ...row, hasIssues: Array.isArray(row.issueLabels) && row.issueLabels.length > 0 });
    });
    cachedLinksAnalysis.rows = sortLinkRowsForDisplay(nextActive);
    cachedSkippedLinkRows = sortLinkRowsForDisplay(nextSkipped);
    cachedLinksAnalysis.anchorRowKeysInOrder = (cachedLinksAnalysis.anchorRowKeysInOrder || []).filter((rk) =>
      cachedLinksAnalysis.rows.some((r) => r && r.rowKey === rk)
    );
    pruneLinkLiveStateForRows(cachedLinksAnalysis.rows || []);
    refreshLinksTableFromCache();
    renderSkippedUrlsSection();
    refreshLinkMetricsFromCache();
    schedulePersistPreflightLiveSession();
  }

  function truncateForPreflightNote(text, maxLen) {
    const cap = Number.isFinite(maxLen) && maxLen > 8 ? maxLen : 96;
    const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (s.length <= cap) return s;
    return `${s.slice(0, cap - 1)}…`;
  }

  function describeContactPreviewMixedSchemePair(ctx) {
    const { pairIndex1, url, verifyRowKey, editorRowKey, editorRow, previewAn, previewDoc } = ctx;
    const idx = `Ordered pair #${pairIndex1}`;
    const editorHint = editorRow
      ? `Editor row shows: ${truncateForPreflightNote(editorRow.displayHref, 88)}.`
      : editorRowKey
        ? 'Editor list has a row key at this index but the row was not found in the current analysis.'
        : 'No editor link row at this index (preview has more anchors than the editor list, or a gap).';

    if (!verifyRowKey) {
      const pv = previewAn ? truncateForPreflightNote(linkDisplayHref(previewAn), 88) : 'no preview anchor';
      const urlBit = url ? ` Preview resolved fetch URL: ${truncateForPreflightNote(url, 72)}.` : '';
      return `${idx}: nothing to attach live verify to (preview ${pv}; ${editorHint})${urlBit}`;
    }

    if (!url) {
      const raw = previewAn && previewAn.getAttribute('href') != null ? String(previewAn.getAttribute('href')).trim() : '';
      const lower = raw.toLowerCase();
      let why = 'preview href does not yield an http(s) URL for live verify';
      if (!previewAn) why = 'missing preview anchor element';
      else if (!raw) why = 'empty href attribute';
      else if (lower.startsWith('mailto:')) why = 'mailto: is not an http(s) live-verify target';
      else if (lower.startsWith('tel:') || lower.startsWith('sms:')) why = 'tel:/sms: are not http(s) live-verify targets';
      else if (lower.startsWith('javascript:')) why = 'javascript: hrefs are not live-verified';
      else if (lower.startsWith('data:')) why = 'data: URLs are not http(s) live-verify targets';
      else if (lower === '#' || /^#[^/]/i.test(raw)) why = 'fragment-only / hash href has no standalone http(s) fetch target here';
      else {
        const meta = computeLinkFetchMetadata(previewAn, previewDoc);
        if (meta.hasTemplateTokens && !meta.fetchCandidateUrl) {
          why =
            'href is still templated or sanitized in a way that does not resolve to a real http(s) host for fetching';
        } else if (!/^https?:\/\//i.test(raw)) {
          why = `href does not start with http(s) after pairing (${truncateForPreflightNote(raw, 64)})`;
        } else {
          why =
            'http(s)-looking href could not be used as a fetch target (for example emarsys placeholder host or unsupported URL after sanitization)';
        }
      }
      const pv = previewAn ? truncateForPreflightNote(linkDisplayHref(previewAn), 88) : '';
      return `${idx}: ${why} Preview href attribute: ${truncateForPreflightNote(raw || pv || '(none)', 88)}. ${editorHint}`;
    }

    return `${idx}: could not join preview and editor into one verify mapping (${editorHint} Fetch URL was ${truncateForPreflightNote(url, 88)}.)`;
  }

  function buildContactPreviewUrlRowKeyMapping(previewDoc) {
    if (!cachedLinksAnalysis || !previewDoc) {
      return { urlToRowKeys: new Map(), footnote: '', mappingMode: 'none' };
    }
    const prevContactPreviewRenderedByEditor = new Map(contactPreviewRenderedRowByEditorKey);
    clearContactPreviewRenderedRows();
    const editorKeysInOrder = Array.isArray(cachedLinksAnalysis.anchorRowKeysInOrder)
      ? cachedLinksAnalysis.anchorRowKeysInOrder
      : [];
    const editorRows = Array.isArray(cachedLinksAnalysis.rows) ? cachedLinksAnalysis.rows : [];
    const rowsByKey = new Map(editorRows.map((r) => [r.rowKey, r]));
    const previewAnchors = Array.from(previewDoc.querySelectorAll('a'));
    const previewUrls = previewAnchors.map((a) => computeLinkFetchMetadata(a, previewDoc).fetchCandidateUrl);

    const urlToRowKeys = new Map();
    const add = (url, rowKey) => {
      if (!url || !rowKey) return;
      let s = urlToRowKeys.get(url);
      if (!s) {
        s = new Set();
        urlToRowKeys.set(url, s);
      }
      s.add(rowKey);
    };

    const pairCount = Math.min(previewAnchors.length, editorKeysInOrder.length);
    let mappingMode =
      previewAnchors.length === editorKeysInOrder.length && previewAnchors.length > 0
        ? 'order'
        : 'order-partial';
    const mixedSchemePairNotes = [];
    for (let i = 0; i < pairCount; i += 1) {
      const url = previewUrls[i];
      const editorRowKey = editorKeysInOrder[i];
      const editorRow = rowsByKey.get(editorRowKey);
      const previewAn = previewAnchors[i];
      let verifyRowKey = editorRowKey;
      if (url && editorRow && previewAn && shouldCreateContactPreviewRenderedCompanion(editorRow, previewAn, previewDoc)) {
        const syn = buildSyntheticContactPreviewRow(editorRow, previewAn, previewDoc);
        const prevSyn = prevContactPreviewRenderedByEditor.get(editorRow.rowKey);
        invalidateContactPreviewSyntheticLiveStateIfIdentityChanged(prevSyn, syn);
        contactPreviewRenderedRowByEditorKey.set(editorRow.rowKey, syn);
        verifyRowKey = syn.rowKey;
      }
      if (url && verifyRowKey) add(url, verifyRowKey);
      else if (url || editorRowKey) {
        mixedSchemePairNotes.push(
          describeContactPreviewMixedSchemePair({
            pairIndex1: i + 1,
            url,
            verifyRowKey,
            editorRowKey,
            editorRow,
            previewAn,
            previewDoc
          })
        );
      }
    }

    const urlToEditorRowKeys = new Map();
    editorRows.forEach((r) => {
      if (!r.fetchCandidateUrl) return;
      if (!urlToEditorRowKeys.has(r.fetchCandidateUrl)) urlToEditorRowKeys.set(r.fetchCandidateUrl, []);
      urlToEditorRowKeys.get(r.fetchCandidateUrl).push(r.rowKey);
    });

    let ambiguous = 0;
    let unmapped = 0;
    if (previewAnchors.length > pairCount) {
      mappingMode = 'order-partial+url';
      for (let i = pairCount; i < previewAnchors.length; i += 1) {
        const url = previewUrls[i];
        if (!url) continue;
        const list = urlToEditorRowKeys.get(url) || [];
        if (list.length === 1) add(url, list[0]);
        else if (!list.length) unmapped += 1;
        else ambiguous += 1;
      }
    }

    const footnoteParts = [];
    if (previewAnchors.length !== editorKeysInOrder.length) {
      footnoteParts.push(
        `Contact Preview has ${previewAnchors.length} link anchor(s) vs ${editorKeysInOrder.length} in the editor preview; the first ${pairCount} were paired by document order (so templated editor hrefs can match rendered http(s) URLs).`
      );
    }
    if (mixedSchemePairNotes.length > 0) {
      const maxNotes = 6;
      const shown = mixedSchemePairNotes.slice(0, maxNotes);
      const overflow = mixedSchemePairNotes.length - shown.length;
      const detail = `${shown.join(' ')}${overflow > 0 ? ` (+${overflow} more)` : ''}`;
      footnoteParts.push(
        `Some paired anchors could not both map to an http(s) verify URL and an editor row (mixed schemes). ${detail}`
      );
    }
    if (ambiguous || unmapped) {
      footnoteParts.push(
        `${unmapped ? `${unmapped} trailing preview URL(s) had no unique editor fetch match` : ''}${unmapped && ambiguous ? '; ' : ''}${ambiguous ? `${ambiguous} ambiguous trailing URL(s)` : ''}.`
      );
    }

    let footnote = footnoteParts.join(' ');

    const conflicts = collectUrlConflictsForRowKeys(urlToRowKeys);
    if (conflicts > 0) {
      const cmsg = `${conflicts} editor link group(s) mapped to multiple preview URLs; last write applies per URL batch.`;
      footnote = footnote ? `${footnote} ${cmsg}` : cmsg;
    }

    prevContactPreviewRenderedByEditor.forEach((prevSyn, editorKey) => {
      if (!contactPreviewRenderedRowByEditorKey.has(editorKey) && prevSyn && prevSyn.rowKey) {
        linkLiveState.delete(prevSyn.rowKey);
      }
    });

    return { urlToRowKeys, footnote: footnote.trim(), mappingMode };
  }

  let contactPreviewVerifyInFlight = false;

  function disconnectContactPreviewObserver() {
    if (contactPreviewObserver) {
      try {
        contactPreviewObserver.disconnect();
      } catch (_) {}
      contactPreviewObserver = null;
    }
    if (contactPreviewDebounceTimer) {
      clearTimeout(contactPreviewDebounceTimer);
      contactPreviewDebounceTimer = null;
    }
    if (contactPreviewBoundIframe && contactPreviewLoadHandler) {
      try {
        contactPreviewBoundIframe.removeEventListener('load', contactPreviewLoadHandler, true);
      } catch (_) {}
    }
    contactPreviewBoundIframe = null;
    contactPreviewLoadHandler = null;
  }

  function bindContactPreviewIframe(iframe) {
    if (!iframe) return;
    if (contactPreviewBoundIframe === iframe && contactPreviewLoadHandler) return;
    if (contactPreviewBoundIframe && contactPreviewLoadHandler) {
      try {
        contactPreviewBoundIframe.removeEventListener('load', contactPreviewLoadHandler, true);
      } catch (_) {}
    }
    contactPreviewLoadHandler = () => {
      scheduleContactPreviewLinkVerify();
    };
    iframe.addEventListener('load', contactPreviewLoadHandler, true);
    contactPreviewBoundIframe = iframe;
  }

  function scheduleContactPreviewLinkVerify() {
    if (!isPreflightActive()) return;
    if (contactPreviewDebounceTimer) clearTimeout(contactPreviewDebounceTimer);
    contactPreviewDebounceTimer = setTimeout(() => {
      contactPreviewDebounceTimer = null;
      runContactPreviewLinkLiveVerifyPass();
    }, CONTACT_PREVIEW_LINK_VERIFY_DEBOUNCE_MS);
  }

  async function runContactPreviewLinkLiveVerifyPass() {
    if (!isPreflightActive() || contactPreviewVerifyInFlight) return;
    if (!preflightLiveLinkVerifyEnabled) {
      setLiveLinkFootnoteText('Live verify is disabled in Settings > Link Alerts.', true);
      return;
    }
    if (!cachedLinksAnalysis) return;
    const iframe = document.querySelector(CONTACT_PREVIEW_IFRAME_SELECTOR);
    if (!iframe) {
      return;
    }
    bindContactPreviewIframe(iframe);
    let previewDoc = null;
    try {
      previewDoc = iframe.contentDocument;
    } catch (_) {}
    if (!previewDoc || !previewDoc.documentElement) return;

    const hasAccess = await hasLinkHostAccess();
    if (!isPreflightActive()) return;
    if (!hasAccess) {
      const hasAnchors = previewDoc.querySelector('a');
      if (hasAnchors) {
        setLiveLinkFootnoteText(
          'Contact Preview can auto-verify links after you grant host access once via “Live verify all”.',
          true
        );
      }
      return;
    }

    setLiveLinkFootnoteText('', false);
    const { urlToRowKeys, footnote, mappingMode } = buildContactPreviewUrlRowKeyMapping(previewDoc);
    refreshLinksTableFromCache();
    schedulePersistPreflightLiveSession();
    const verifyUrls = [...urlToRowKeys.keys()].filter(Boolean);
    if (footnote) {
      setLiveLinkFootnoteText(footnote, true);
    } else if (!verifyUrls.length) {
      setLiveLinkFootnoteText('', false);
    }

    if (!verifyUrls.length) return;

    contactPreviewVerifyInFlight = true;
    try {
      await executeLiveVerifyFromUrlMap(urlToRowKeys, 'contact-preview', { mappingMode });
    } finally {
      contactPreviewVerifyInFlight = false;
      schedulePersistPreflightLiveSession();
    }
  }

  function observeContactPreviewIframe() {
    disconnectContactPreviewObserver();
    const root = document.body || document.documentElement;
    if (!root) return;
    contactPreviewObserver = new MutationObserver(() => {
      scheduleContactPreviewLinkVerify();
    });
    contactPreviewObserver.observe(root, { childList: true, subtree: true });
    scheduleContactPreviewLinkVerify();
  }

  function setupLinksLiveVerifyInteractions() {
    const els = getPreflightPanelEls();
    if (!els || !els.panel || els.panel.dataset.gemLinksLiveUiBound === 'true') return;
    els.panel.dataset.gemLinksLiveUiBound = 'true';
    els.panel.addEventListener('click', (event) => {
      const menuToggle = event.target.closest('[data-action="gem-open-row-menu"]');
      if (menuToggle) {
        event.preventDefault();
        const rowKey = decodeURIComponent(menuToggle.getAttribute('data-gem-link-row-key') || '');
        const ctx = menuToggle.getAttribute('data-gem-link-menu-context') || 'main';
        const mk = `${ctx}:${rowKey}`;
        openLinkRowMenuKey = openLinkRowMenuKey === mk ? '' : mk;
        refreshLinksTableFromCache();
        renderSkippedUrlsSection();
        return;
      }
      const menuItem = event.target.closest('.gem-preflight-links-row-menu-item');
      if (menuItem) {
        event.preventDefault();
        const menu = menuItem.closest('.gem-preflight-links-row-menu');
        const rowKey = decodeURIComponent((menu && menu.getAttribute('data-gem-link-row-key')) || '');
        const row = findLinkRowByRowKey(rowKey) || (cachedSkippedLinkRows || []).find((r) => r && r.rowKey === rowKey);
        const targetUrl = row && (row.neverCheckUrlKey || row.fetchCandidateUrl || row.displayHref);
        if (!targetUrl) return;
        if (menuItem.getAttribute('data-action') === 'gem-url-never-check') {
          setUrlPreflightNeverCheck(targetUrl, true).then((ok) => {
            if (ok) applyNeverCheckToCurrentRows(targetUrl, true);
          });
        } else if (menuItem.getAttribute('data-action') === 'gem-url-always-check') {
          setUrlPreflightNeverCheck(targetUrl, false).then((ok) => {
            if (ok) applyNeverCheckToCurrentRows(targetUrl, false);
          });
        }
        openLinkRowMenuKey = '';
        return;
      }
      if (openLinkRowMenuKey) {
        openLinkRowMenuKey = '';
        refreshLinksTableFromCache();
        renderSkippedUrlsSection();
      }
      const openCp = event.target.closest('[data-action="gem-open-contact-preview"]');
      if (openCp) {
        event.preventDefault();
        const btn = document.querySelector('[data-test-id="contact-preview-button"]');
        if (btn && typeof btn.click === 'function') btn.click();
        return;
      }
      const one = event.target.closest('[data-action="gem-live-verify-one"]');
      if (one) {
        event.preventDefault();
        const enc = one.getAttribute('data-gem-link-row-key');
        const rowKey = enc ? decodeURIComponent(enc) : '';
        runLiveVerifyOneRow(rowKey);
        return;
      }
    });
    if (els.liveVerifyAllLinksBtn && els.liveVerifyAllLinksBtn.dataset.gemBound !== 'true') {
      els.liveVerifyAllLinksBtn.dataset.gemBound = 'true';
      els.liveVerifyAllLinksBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isPreflightActive()) return;
        runLiveVerifyAllLinks();
      });
    }
  }

  function applyLiveVerifyEnabledState(enabled) {
    preflightLiveLinkVerifyEnabled = enabled === true;
    if (isPreflightActive()) {
      refreshLinksTableFromCache();
      renderSkippedUrlsSection();
      syncLiveVerifyAllButtonState();
      if (!preflightLiveLinkVerifyEnabled) {
        setLiveLinkFootnoteText('Live verify is disabled in Settings > Link Alerts.', true);
      } else {
        setLiveLinkFootnoteText('', false);
        scheduleContactPreviewLinkVerify();
      }
    }
  }

  function applyLinksSectionVisibilityState(hidden) {
    preflightHideLinksSection = hidden === true;
    const els = getPreflightPanelEls();
    if (els && els.linksSection) els.linksSection.style.display = preflightHideLinksSection ? 'none' : '';
    if (els && els.linksSectionDivider) els.linksSectionDivider.style.display = preflightHideLinksSection ? 'none' : '';
    if (preflightHideLinksSection) {
      latestLinksAlertCount = 0;
      persistAndUpdateOverallAlertPip();
      updateLinksSectionPip(0);
    }
  }

  function saveLinksSectionHiddenSetting(hidden) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set({ [PREFLIGHT_HIDE_LINKS_SECTION_KEY]: hidden === true }, () => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  function loadLinksSectionHiddenSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ [PREFLIGHT_HIDE_LINKS_SECTION_KEY]: false }, (res) => {
          applyLinksSectionVisibilityState(!!(res && res[PREFLIGHT_HIDE_LINKS_SECTION_KEY]));
          resolve(preflightHideLinksSection);
        });
      } catch (_) {
        applyLinksSectionVisibilityState(false);
        resolve(false);
      }
    });
  }

  async function refreshLinksPermissionActionsUI() {
    const els = getPreflightPanelEls();
    if (!els || !els.linksPermissionActions || preflightHideLinksSection) return;
    const hasAccess = await hasLinkHostAccess();
    if (!isPreflightActive()) return;
    els.linksPermissionActions.style.display = hasAccess ? 'none' : '';
  }

  function setupLinksPermissionActions() {
    const els = getPreflightPanelEls();
    if (!els) return;
    if (els.grantLinkAccessBtn && els.grantLinkAccessBtn.dataset.gemBound !== 'true') {
      els.grantLinkAccessBtn.dataset.gemBound = 'true';
      els.grantLinkAccessBtn.addEventListener('click', async () => {
        els.grantLinkAccessBtn.disabled = true;
        const granted = await ensureLinkHostAccess();
        els.grantLinkAccessBtn.disabled = false;
        if (!isPreflightActive()) return;
        if (granted) {
          await saveLinksSectionHiddenSetting(false);
          applyLinksSectionVisibilityState(false);
          setLiveLinkFootnoteText('', false);
          refreshLinksTableFromCache();
          renderSkippedUrlsSection();
          scheduleContactPreviewLinkVerify();
        }
        void refreshLinksPermissionActionsUI();
      });
    }
    if (els.denyLinksSectionBtn && els.denyLinksSectionBtn.dataset.gemBound !== 'true') {
      els.denyLinksSectionBtn.dataset.gemBound = 'true';
      els.denyLinksSectionBtn.addEventListener('click', async () => {
        await saveLinksSectionHiddenSetting(true);
        applyLinksSectionVisibilityState(true);
      });
    }
    void refreshLinksPermissionActionsUI();
  }

  function loadLiveVerifyEnabledSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ [PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY]: false }, (res) => {
          applyLiveVerifyEnabledState(!!(res && res[PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY]));
          resolve(preflightLiveLinkVerifyEnabled);
        });
      } catch (_) {
        applyLiveVerifyEnabledState(false);
        resolve(false);
      }
    });
  }

  function setPermissionGateVisible(isVisible, message = '') {
    const els = getPreflightPanelEls();
    if (!els || !els.permissionGate || !els.metrics) return;
    els.permissionGate.style.display = isVisible ? '' : 'none';
    els.metrics.style.display = isVisible ? 'none' : '';
    if (els.imageBreakdownWrap) els.imageBreakdownWrap.style.display = isVisible ? 'none' : '';
    if (els.refreshBtn) els.refreshBtn.disabled = !!isVisible;
    if (els.permissionStatus) els.permissionStatus.textContent = message;
  }

  function formatDurationSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '< 1s';
    if (seconds < 1) return '< 1s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  function buildSpeedEstimateText(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '--';
    const overheadMultiplier = 1.15;
    const bits = bytes * 8 * overheadMultiplier;
    const profiles = [
      { label: '1 Mbps', bps: 1_000_000 },
      { label: '5 Mbps', bps: 5_000_000 },
      { label: '10 Mbps', bps: 10_000_000 }
    ];
    return profiles
      .map((p) => `${p.label}: ${formatDurationSeconds(bits / p.bps)}`)
      .join(' | ');
  }

  function extractFilename(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname || '';
      const filename = pathname.split('/').filter(Boolean).pop() || parsed.hostname || url;
      return decodeURIComponent(filename);
    } catch (_) {
      const raw = String(url || '');
      const clean = raw.split('?')[0];
      return clean.split('/').filter(Boolean).pop() || raw;
    }
  }

  function formatImageWeightForRow(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(kb >= 10 ? 1 : 2)} KB`;
  }

  function escapeHtmlText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeHighlightTermData(termData) {
    if (typeof termData === 'string') {
      return {
        isRegex: false,
        mode: 'highlight'
      };
    }
    const data = termData && typeof termData === 'object' ? termData : {};
    return {
      isRegex: !!data.isRegex,
      mode: data.mode === 'notify' ? 'notify' : 'highlight'
    };
  }

  function loadHighlightTermsFromStorage() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ highlightTerms: {} }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve((res && res.highlightTerms) || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function loadTextHighlightingUsageState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ highlightTerms: {}, enableHighlighting: true }, (res) => {
          const terms = (res && res.highlightTerms && typeof res.highlightTerms === 'object') ? res.highlightTerms : {};
          resolve({
            enabled: !!res.enableHighlighting,
            totalRules: Object.keys(terms).length
          });
        });
      } catch (_) {
        resolve({ enabled: true, totalRules: 0 });
      }
    });
  }

  function renderTextAnalysisGuidance(els, usage) {
    if (!els || !els.textAnalysisInfo) return;
    const infoEl = els.textAnalysisInfo;
    if (!usage.enabled) {
      infoEl.textContent = 'Text analysis is paused because "Enable text highlighting overlays" is off. Turn it on in Settings > Text Highlighting Configuration.';
      infoEl.style.display = '';
      return;
    }
    if (!usage.totalRules) {
      infoEl.textContent = 'Add at least one text highlighting rule in Settings > Text Highlighting Configuration to start tracking text analysis matches.';
      infoEl.style.display = '';
      return;
    }
    infoEl.textContent = '';
    infoEl.style.display = 'none';
  }

  function renderTextAnalysisPayloadToUi(panel, els, payload) {
    if (!panel || !els || !payload) return;
    const textMatchesTotalEl = panel.querySelector('[data-metric="textMatchesTotal"]');
    const textNotifyMatchesTotalEl = panel.querySelector('[data-metric="textNotifyMatchesTotal"]');
    if (!textMatchesTotalEl || !textNotifyMatchesTotalEl || !els.notifyMatchesWrap || !els.notifyMatchesTable) return;
    textMatchesTotalEl.textContent = String(payload.totalMatches || 0);
    textNotifyMatchesTotalEl.textContent = String(payload.totalNotifyMatches || 0);
    const notifyRows = Array.isArray(payload.notifyRows) ? payload.notifyRows : [];
    if (!notifyRows.length) {
      els.notifyMatchesWrap.style.display = 'none';
      els.notifyMatchesTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No "Notify" text matches found.</div>';
    } else {
      els.notifyMatchesWrap.style.display = '';
      els.notifyMatchesTable.innerHTML = notifyRows.map((row) => `
        <div class="gem-preflight-image-breakdown-row">
          <div class="gem-preflight-image-breakdown-name" title="${escapeHtmlText(row.label || '')}">${escapeHtmlText(row.label || '')}</div>
          <div class="gem-preflight-image-breakdown-size">${String(row.count || 0)}</div>
        </div>
      `).join('');
    }
    updateTextAnalysisSectionPip(payload.totalNotifyMatches || 0);
  }

  async function initializeTextAnalysisSectionState() {
    const els = getPreflightPanelEls();
    if (!els || !els.panel) return;
    const panel = els.panel;
    const textMatchesTotalEl = panel.querySelector('[data-metric="textMatchesTotal"]');
    const textNotifyMatchesTotalEl = panel.querySelector('[data-metric="textNotifyMatchesTotal"]');
    if (!textMatchesTotalEl || !textNotifyMatchesTotalEl || !els.notifyMatchesWrap || !els.textAnalysisResultsWrap) return;
    const usage = await loadTextHighlightingUsageState();
    renderTextAnalysisGuidance(els, usage);

    if (!usage.enabled || !usage.totalRules) {
      els.textAnalysisResultsWrap.style.display = usage.enabled ? '' : 'none';
      textMatchesTotalEl.textContent = '0';
      textNotifyMatchesTotalEl.textContent = '0';
      els.notifyMatchesWrap.style.display = 'none';
      updateTextAnalysisSectionPip(0);
      latestNotifyAlertCount = 0;
      latestTextAnalysisSnapshot = { totalMatches: 0, totalNotifyMatches: 0, notifyRows: [] };
      persistAndUpdateOverallAlertPip();
      syncPreflightSectionCollapseUI(panel, 'textAnalysis', true);
      return;
    }

    els.textAnalysisResultsWrap.style.display = '';
    if (latestTextAnalysisSnapshot) {
      renderTextAnalysisPayloadToUi(panel, els, latestTextAnalysisSnapshot);
      return;
    }

    textMatchesTotalEl.textContent = '--';
    textNotifyMatchesTotalEl.textContent = '--';
    els.notifyMatchesWrap.style.display = 'none';
  }

  function compileHighlightRegex(pattern) {
    try {
      return new RegExp(pattern, 'gi');
    } catch (_) {
      return null;
    }
  }

  async function analyzeTextInPreviewDoc(doc) {
    if (!doc || !doc.body) {
      return { totalMatches: 0, totalNotifyMatches: 0, notifyRows: [] };
    }
    const highlightTerms = await loadHighlightTermsFromStorage();
    const normalizedTerms = Object.entries(highlightTerms).map(([term, termData]) => {
      const normalized = normalizeHighlightTermData(termData);
      return {
        term,
        isRegex: normalized.isRegex,
        mode: normalized.mode,
        termLower: normalized.isRegex ? null : String(term || '').toLowerCase(),
        regex: normalized.isRegex ? compileHighlightRegex(term) : null
      };
    });
    if (!normalizedTerms.length) {
      return { totalMatches: 0, totalNotifyMatches: 0, notifyRows: [] };
    }

    const notifyCountsByNormalized = new Map();
    let totalMatches = 0;
    let totalNotifyMatches = 0;
    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parentTag = node.parentElement && node.parentElement.tagName
            ? node.parentElement.tagName.toUpperCase()
            : '';
          if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
      const raw = String(textNode.nodeValue || '');
      if (!raw) continue;
      const lowerRaw = raw.toLowerCase();
      normalizedTerms.forEach((entry) => {
        if (entry.isRegex) {
          if (!entry.regex) return;
          entry.regex.lastIndex = 0;
          let match;
          while ((match = entry.regex.exec(raw)) !== null) {
            const found = String(match[0] || '');
            if (!found) {
              if (entry.regex.lastIndex === match.index) entry.regex.lastIndex += 1;
              continue;
            }
            totalMatches += 1;
            if (entry.mode === 'notify') {
              totalNotifyMatches += 1;
              const norm = found.toLowerCase();
              const current = notifyCountsByNormalized.get(norm) || { label: found, count: 0 };
              current.count += 1;
              notifyCountsByNormalized.set(norm, current);
            }
            if (found.length === 0 && entry.regex.lastIndex === match.index) entry.regex.lastIndex += 1;
          }
          entry.regex.lastIndex = 0;
          return;
        }

        const termLower = entry.termLower || '';
        if (!termLower) return;
        let startIndex = 0;
        while (true) {
          const index = lowerRaw.indexOf(termLower, startIndex);
          if (index === -1) break;
          totalMatches += 1;
          if (entry.mode === 'notify') {
            totalNotifyMatches += 1;
            const found = raw.slice(index, index + termLower.length);
            const norm = found.toLowerCase();
            const current = notifyCountsByNormalized.get(norm) || { label: found, count: 0 };
            current.count += 1;
            notifyCountsByNormalized.set(norm, current);
          }
          startIndex = index + termLower.length;
        }
      });
    }

    const notifyRows = Array.from(notifyCountsByNormalized.values())
      .sort((a, b) => {
        if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
    return { totalMatches, totalNotifyMatches, notifyRows };
  }

  async function refreshTextAnalysisFromCurrentPreview(options = {}) {
    const usage = await loadTextHighlightingUsageState();
    latestNotifyAlertCount = 0;
    persistAndUpdateOverallAlertPip();

    if (options.updatePanelUi && isPreflightActive()) {
      const els = getPreflightPanelEls();
      if (els && els.panel) {
        renderTextAnalysisGuidance(els, usage);
        if (els.textAnalysisResultsWrap) {
          els.textAnalysisResultsWrap.style.display = usage.enabled ? '' : 'none';
        }
        if (!usage.enabled || !usage.totalRules) {
          const textMatchesTotalEl = els.panel.querySelector('[data-metric="textMatchesTotal"]');
          const textNotifyMatchesTotalEl = els.panel.querySelector('[data-metric="textNotifyMatchesTotal"]');
          if (textMatchesTotalEl) textMatchesTotalEl.textContent = '0';
          if (textNotifyMatchesTotalEl) textNotifyMatchesTotalEl.textContent = '0';
          if (els.notifyMatchesWrap) els.notifyMatchesWrap.style.display = 'none';
          updateTextAnalysisSectionPip(0);
          syncPreflightSectionCollapseUI(els.panel, 'textAnalysis', true);
          return;
        }
      }
    }

    if (!usage.enabled || !usage.totalRules) return;

    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    const doc = iframe && iframe.contentDocument ? iframe.contentDocument : null;
    if (!doc || !doc.documentElement) return;
    const textAnalysis = await analyzeTextInPreviewDoc(doc);
    latestTextAnalysisSnapshot = textAnalysis;
    latestNotifyAlertCount = textAnalysis.totalNotifyMatches || 0;
    persistAndUpdateOverallAlertPip();

    if (!options.updatePanelUi || !isPreflightActive()) return;
    const panel = document.querySelector(PRELIGHT_PANEL_TAG);
    if (!panel) return;
    const els = getPreflightPanelEls();
    if (!els || !els.notifyMatchesTable || !els.notifyMatchesWrap) return;
    renderTextAnalysisPayloadToUi(panel, els, textAnalysis);
  }

  function scheduleTextAnalysisRefreshFromHighlightEvent() {
    if (highlightDrivenTextRefreshTimer) clearTimeout(highlightDrivenTextRefreshTimer);
    highlightDrivenTextRefreshTimer = setTimeout(() => {
      highlightDrivenTextRefreshTimer = null;
      void refreshTextAnalysisFromCurrentPreview({ updatePanelUi: true });
    }, 140);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIdx = 0;
    while (value >= 1024 && unitIdx < units.length - 1) {
      value /= 1024;
      unitIdx += 1;
    }
    const fixed = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(fixed)} ${units[unitIdx]}`;
  }

  async function updateImagesMetricsUI(payload) {
    const panel = document.querySelector(PRELIGHT_PANEL_TAG);
    if (!panel) return;

    const refsEl = panel.querySelector('[data-metric="totalRefs"]');
    const uniqueEl = panel.querySelector('[data-metric="uniqueUrls"]');
    const sizeEl = panel.querySelector('[data-metric="totalSize"]');
    const networkUniqueEl = panel.querySelector('[data-metric="networkUniqueUrls"]');
    const networkUniqueRowEl = networkUniqueEl ? networkUniqueEl.closest('.gem-preflight-metric-row') : null;
    const embeddedUniqueEl = panel.querySelector('[data-metric="embeddedUniqueUrls"]');
    const embeddedUniqueRowEl = embeddedUniqueEl ? embeddedUniqueEl.closest('.gem-preflight-metric-row') : null;
    const speedEstimatesEl = panel.querySelector('[data-metric="speedEstimates"]');
    const totalSizeAlertableEl = panel.querySelector('[data-alertable="totalSize"]');
    const statusEl = panel.querySelector('[data-metric="statusText"]');
    const linksTotalEl = panel.querySelector('[data-metric="linksTotal"]');
    const linksUniqueEl = panel.querySelector('[data-metric="linksUnique"]');
    const els = getPreflightPanelEls();
    if (!refsEl || !uniqueEl || !sizeEl || !statusEl || !networkUniqueEl || !embeddedUniqueEl || !speedEstimatesEl || !els || !els.imageBreakdownTable || !els.linksTable || !els.accessibilityWarningsTable || !els.linkTitlesTable) return;

    if (payload.state === 'loading') {
      refsEl.textContent = 'Scanning...';
      uniqueEl.textContent = 'Scanning...';
      sizeEl.textContent = 'Scanning...';
      networkUniqueEl.textContent = 'Scanning...';
      embeddedUniqueEl.textContent = 'Scanning...';
      if (networkUniqueRowEl) networkUniqueRowEl.style.display = '';
      if (embeddedUniqueRowEl) embeddedUniqueRowEl.style.display = '';
      speedEstimatesEl.textContent = 'Scanning...';
      statusEl.textContent = payload.message || '';
      if (totalSizeAlertableEl) totalSizeAlertableEl.classList.remove('gem-preflight-metric-value--alert');
      els.imageBreakdownTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Scanning...</div>';
      const preserveA11y = !!payload.preserveAccessibilityUi;
      if (!preserveA11y) {
        els.accessibilityWarningsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Scanning...</div>';
        els.linkTitlesTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Scanning...</div>';
      }
      syncImageWeightDetailsCollapseUI(els.imageBreakdownWrap, false);
      updateImagesSectionPip(0);
      if (!preserveA11y) {
        updateAccessibilitySectionPip(0);
      }
      if (linksTotalEl) linksTotalEl.textContent = 'Scanning...';
      if (linksUniqueEl) linksUniqueEl.textContent = 'Scanning...';
      cachedLinksAnalysis = null;
      cachedSkippedLinkRows = [];
      clearContactPreviewRenderedRows();
      linkLiveState.clear();
      setLiveLinkFootnoteText('', false);
      els.linksTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Scanning...</div>';
      renderSkippedUrlsSection();
      syncLiveVerifyAllButtonState();
      updateLinksSectionPip(0);
      return;
    }

    if (payload.state === 'error') {
      refsEl.textContent = '--';
      uniqueEl.textContent = '--';
      sizeEl.textContent = '--';
      networkUniqueEl.textContent = '--';
      embeddedUniqueEl.textContent = '--';
      if (networkUniqueRowEl) networkUniqueRowEl.style.display = '';
      if (embeddedUniqueRowEl) embeddedUniqueRowEl.style.display = '';
      speedEstimatesEl.textContent = '--';
      statusEl.textContent = payload.message || 'Unable to scan preview iframe.';
      if (totalSizeAlertableEl) totalSizeAlertableEl.classList.remove('gem-preflight-metric-value--alert');
      els.imageBreakdownTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Unable to load image details.</div>';
      if (!payload.preserveAccessibilityUi) {
        els.accessibilityWarningsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Unable to load accessibility warnings.</div>';
        els.linkTitlesTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Unable to load accessibility warnings.</div>';
      }
      syncImageWeightDetailsCollapseUI(els.imageBreakdownWrap, false);
      updateImagesSectionPip(0);
      if (!payload.preserveAccessibilityUi) {
        updateAccessibilitySectionPip(0);
      }
      if (payload.linksPayload) {
        const skippedCount = Array.isArray(payload.linksPayload.skippedRows) ? payload.linksPayload.skippedRows.length : 0;
        if (linksTotalEl) linksTotalEl.textContent = String(payload.linksPayload.totalAnchors);
        if (linksUniqueEl) linksUniqueEl.textContent = String((payload.linksPayload.uniqueCount || 0) + skippedCount);
        updateLinksSectionPip(payload.linksPayload.linksAlertCount || 0);
        const lrows = Array.isArray(payload.linksPayload.rows) ? payload.linksPayload.rows : [];
        cachedSkippedLinkRows = Array.isArray(payload.linksPayload.skippedRows) ? payload.linksPayload.skippedRows : [];
        if (lrows.length) {
          cachedLinksAnalysis = {
            totalAnchors: payload.linksPayload.totalAnchors,
            uniqueCount: payload.linksPayload.uniqueCount,
            linksAlertCount: payload.linksPayload.linksAlertCount || 0,
            rows: lrows,
            anchorRowKeysInOrder: payload.linksPayload.anchorRowKeysInOrder || []
          };
          await hydratePreflightLiveFromSession(cachedLinksAnalysis);
          pruneLinkLiveStateForRows(lrows);
        } else {
          cachedLinksAnalysis = null;
          cachedSkippedLinkRows = Array.isArray(payload.linksPayload.skippedRows) ? payload.linksPayload.skippedRows : [];
          clearContactPreviewRenderedRows();
          linkLiveState.clear();
          await removePreflightLiveSessionPayload();
        }
        renderLinksTableIntoEl(els.linksTable, lrows, 'No links found.');
        renderSkippedUrlsSection();
        setupLinksLiveVerifyInteractions();
      } else {
        if (linksTotalEl) linksTotalEl.textContent = '--';
        if (linksUniqueEl) linksUniqueEl.textContent = '--';
        cachedLinksAnalysis = null;
        cachedSkippedLinkRows = [];
        clearContactPreviewRenderedRows();
        linkLiveState.clear();
        await removePreflightLiveSessionPayload();
        els.linksTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Unable to scan links.</div>';
        renderSkippedUrlsSection();
        syncLiveVerifyAllButtonState();
        updateLinksSectionPip(0);
      }
      return;
    }

    refsEl.textContent = String(payload.totalReferences);
    uniqueEl.textContent = String(payload.uniqueCount);
    sizeEl.textContent = payload.totalSizeText;
    networkUniqueEl.textContent = String(payload.networkUniqueCount);
    embeddedUniqueEl.textContent = String(payload.embeddedUniqueCount);
    const showSplitRows = payload.embeddedUniqueCount > 0;
    if (networkUniqueRowEl) networkUniqueRowEl.style.display = showSplitRows ? '' : 'none';
    if (embeddedUniqueRowEl) embeddedUniqueRowEl.style.display = showSplitRows ? '' : 'none';
    speedEstimatesEl.textContent = payload.speedEstimatesText || '--';
    statusEl.textContent = payload.statusText || '';
    if (totalSizeAlertableEl) {
      totalSizeAlertableEl.classList.toggle('gem-preflight-metric-value--alert', !!payload.totalThresholdExceeded);
    }
    updateImagesSectionPip(payload.imagesAlertCount || 0);
    updateAccessibilitySectionPip(payload.accessibilityAlertCount || 0);

    const linksPayload = payload.links;
    if (linksPayload && linksTotalEl && linksUniqueEl) {
      const skippedCount = Array.isArray(linksPayload.skippedRows) ? linksPayload.skippedRows.length : 0;
      linksTotalEl.textContent = String(linksPayload.totalAnchors);
      linksUniqueEl.textContent = String((linksPayload.uniqueCount || 0) + skippedCount);
      updateLinksSectionPip(linksPayload.linksAlertCount || 0);
      const lrows = Array.isArray(linksPayload.rows) ? linksPayload.rows : [];
      cachedSkippedLinkRows = Array.isArray(linksPayload.skippedRows) ? linksPayload.skippedRows : [];
      if (lrows.length) {
        cachedLinksAnalysis = {
          totalAnchors: linksPayload.totalAnchors,
          uniqueCount: linksPayload.uniqueCount,
          linksAlertCount: linksPayload.linksAlertCount || 0,
          rows: lrows,
          anchorRowKeysInOrder: linksPayload.anchorRowKeysInOrder || []
        };
        await hydratePreflightLiveFromSession(cachedLinksAnalysis);
        pruneLinkLiveStateForRows(lrows);
      } else {
        cachedLinksAnalysis = null;
        cachedSkippedLinkRows = Array.isArray(linksPayload.skippedRows) ? linksPayload.skippedRows : [];
        clearContactPreviewRenderedRows();
        linkLiveState.clear();
        await removePreflightLiveSessionPayload();
      }
      renderLinksTableIntoEl(els.linksTable, lrows, 'No links found.');
      renderSkippedUrlsSection();
      setupLinksLiveVerifyInteractions();
    }

    const rows = Array.isArray(payload.imageBreakdownRows) ? payload.imageBreakdownRows : [];
    if (!rows.length) {
      els.imageBreakdownTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No network image URLs found.</div>';
    } else {
      els.imageBreakdownTable.innerHTML = rows.map((row) => `
        <div class="gem-preflight-image-breakdown-row">
          <div class="gem-preflight-image-breakdown-name" data-image-url="${escapeHtmlText(row.url || '')}">${escapeHtmlText(row.name)}</div>
          <div class="gem-preflight-image-breakdown-size ${row.isSingularAlert ? 'gem-preflight-image-breakdown-size--alert' : ''}">${escapeHtmlText(row.sizeText)}</div>
        </div>
      `).join('');
    }
    const hasSingularImageAlert = rows.some((row) => row.isSingularAlert);
    syncImageWeightDetailsCollapseUI(els.imageBreakdownWrap, !hasSingularImageAlert);

    const accessibilityRows = Array.isArray(payload.accessibilityWarningRows) ? payload.accessibilityWarningRows : [];
    if (!accessibilityRows.length) {
      els.accessibilityWarningsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No linked images with missing ALT text.</div>';
    } else {
      els.accessibilityWarningsTable.innerHTML = accessibilityRows.map((row) => `
      <div class="gem-preflight-image-breakdown-row">
        <div class="gem-preflight-image-breakdown-name" data-image-url="${escapeHtmlText(row.url || '')}">${escapeHtmlText(row.filename)}</div>
        <div class="gem-preflight-image-breakdown-size gem-preflight-image-breakdown-size--alert">Missing ALT</div>
      </div>
    `).join('');
    }

    const linkTitleRows = Array.isArray(payload.linkTitleRows) ? payload.linkTitleRows : [];
    renderLinkTitlesTable(els.linkTitlesTable, linkTitleRows);
  }

  async function scanAndRenderImageMetrics(opts = {}) {
    const includeImageWeight = opts.includeImageWeight !== false;
    const skipAccessibilityScan = opts.skipAccessibilityScan === true;
    const scanToken = Date.now();
    currentScanToken = scanToken;
    await updateImagesMetricsUI({
      state: 'loading',
      message: 'Scanning desktop preview...',
      preserveAccessibilityUi: skipAccessibilityScan
    });

    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    const doc = iframe && iframe.contentDocument ? iframe.contentDocument : null;
    if (!doc || !doc.documentElement) {
      await updateImagesMetricsUI({ state: 'error', message: 'Desktop preview is not ready yet.' });
      return { ok: false, reason: 'iframe-not-ready', totalReferences: 0, totalLinkAnchors: 0 };
    }

    const refs = collectImageReferencesFromPreviewDoc(doc);
    const uniqueUrls = Array.from(new Set(refs));
    const accessibilityWarnings = skipAccessibilityScan
      ? cachedAccessibilityMissingAltRows.map((r) => ({ url: r.url || '', filename: r.filename || '' }))
      : collectLinkedImageMissingAltWarnings(doc);
    const linkTitleWarnings = skipAccessibilityScan
      ? cachedLinkTitleRows.map((r) => ({
        kind: r.kind === 'image' ? 'image' : 'text',
        displayName: r.displayName || '',
        imageUrl: r.imageUrl || ''
      }))
      : collectLinksWithTitleWarnings(doc);
    await loadPreflightNeverCheckUrls();
    const linkAnalysis = analyzeLinksInPreviewDoc(doc);
    const linksPayload = {
      totalAnchors: linkAnalysis.totalAnchors,
      uniqueCount: linkAnalysis.uniqueCount,
      rows: linkAnalysis.rows,
      skippedRows: linkAnalysis.skippedRows,
      linksAlertCount: preflightHideLinksSection ? 0 : (linkAnalysis.linksAlertCount || 0),
      anchorRowKeysInOrder: linkAnalysis.anchorRowKeysInOrder
    };
    const networkUniqueUrls = uniqueUrls.filter(isDownloadableNetworkUrl);
    const embeddedUniqueCount = uniqueUrls.length - networkUniqueUrls.length;

    const sizeData = includeImageWeight
      ? await fetchUniqueDownloadSize(uniqueUrls)
      : { ok: true, knownBytes: 0, unknownCount: 0, networkCount: networkUniqueUrls.length, unknownDetails: [], measurements: [] };
    if (!sizeData || sizeData.ok === false) {
      latestImageAlertCount = 0;
      if (!skipAccessibilityScan) {
        latestAccessibilityMissingAltCount = accessibilityWarnings.length || 0;
        latestLinkTitlesAlertCount = linkTitleWarnings.length || 0;
      }
      latestLinksAlertCount = preflightHideLinksSection ? 0 : (linkAnalysis.linksAlertCount || 0);
      latestNotifyAlertCount = latestNotifyAlertCount || 0;
      persistAndUpdateOverallAlertPip();
      await updateImagesMetricsUI({
        state: 'error',
        message: sizeData && sizeData.error ? `Unable to measure image sizes: ${sizeData.error}` : 'Unable to measure image sizes.',
        linksPayload,
        preserveAccessibilityUi: skipAccessibilityScan
      });
      return { ok: false, reason: 'measure-failed', totalReferences: 0, totalLinkAnchors: linkAnalysis.totalAnchors };
    }
    if (currentScanToken !== scanToken) return { ok: false, reason: 'stale-scan', totalReferences: 0 };

    if (sizeData.unknownCount > 0) {
      console.groupCollapsed(`[Gem][Preflight] Unknown image sizes: ${sizeData.unknownCount}/${sizeData.networkCount}`);
      sizeData.unknownDetails.forEach((entry, idx) => {
        const reason = entry.attempts && entry.attempts.length ? entry.attempts.join(' | ') : 'No diagnostics';
        console.log(`${idx + 1}. ${entry.url}`);
        console.log(`   ${reason}`);
      });
      console.groupEnd();
    }

    const thresholds = await getPreflightThresholdSettings();
    const totalThresholdBytes = toBytes(thresholds.totalValue, thresholds.totalUnit);
    const singularThresholdBytes = toBytes(thresholds.singularValue, thresholds.singularUnit);
    const knownMeasurements = Array.isArray(sizeData.measurements)
      ? sizeData.measurements.filter((m) => Number.isFinite(m && m.bytes))
      : [];
    const allMeasurements = Array.isArray(sizeData.measurements) ? sizeData.measurements : [];
    const maxSingleImageBytes = knownMeasurements.reduce((max, row) => Math.max(max, row.bytes || 0), 0);
    const totalExceeded = includeImageWeight && totalThresholdBytes > 0 && sizeData.knownBytes >= totalThresholdBytes;
    const singularExceededCount = includeImageWeight && singularThresholdBytes > 0
      ? knownMeasurements.filter((row) => (row.bytes || 0) >= singularThresholdBytes).length
      : 0;
    const singularExceeded = singularExceededCount > 0 || (includeImageWeight && singularThresholdBytes > 0 && maxSingleImageBytes >= singularThresholdBytes);
    const imageAlertCount = (totalExceeded ? 1 : 0) + singularExceededCount;
    const missingAltCount = accessibilityWarnings.length;
    const linkTitlesCount = linkTitleWarnings.length;
    const accessibilityAlertCount = missingAltCount + linkTitlesCount;
    const linksAlertCount = preflightHideLinksSection ? 0 : (linkAnalysis.linksAlertCount || 0);
    const notifyAlertCount = latestNotifyAlertCount || 0;
    latestImageAlertCount = imageAlertCount;
    latestAccessibilityMissingAltCount = missingAltCount;
    latestLinkTitlesAlertCount = linkTitlesCount;
    if (!skipAccessibilityScan) {
      cachedAccessibilityMissingAltRows = accessibilityWarnings.map((w) => ({
        url: w.url || '',
        filename: w.filename || ''
      }));
      cachedLinkTitleRows = linkTitleWarnings.map((w) => ({
        kind: w.kind === 'image' ? 'image' : 'text',
        displayName: w.displayName || '',
        imageUrl: w.imageUrl || ''
      }));
    }
    latestLinksAlertCount = linksAlertCount;
    latestNotifyAlertCount = notifyAlertCount;
    persistAndUpdateOverallAlertPip();

    const unknownSuffix = sizeData.unknownCount > 0 ? ` (+ ${sizeData.unknownCount} unknown)` : '';
    if (isPreflightActive()) {
      const imageBreakdownRows = allMeasurements.map((m) => {
        const bytes = Number.isFinite(m && m.bytes) ? m.bytes : null;
        return {
          name: extractFilename(m && m.url),
          url: (m && m.url) || '',
          sizeText: formatImageWeightForRow(bytes),
          sortBytes: bytes === null ? -1 : bytes,
          isSingularAlert: bytes !== null && singularThresholdBytes > 0 && bytes >= singularThresholdBytes
        };
      }).sort((a, b) => {
        return (b.sortBytes || 0) - (a.sortBytes || 0);
      });
      await updateImagesMetricsUI({
        state: 'ready',
        totalReferences: refs.length,
        uniqueCount: uniqueUrls.length,
        networkUniqueCount: networkUniqueUrls.length,
        embeddedUniqueCount,
        totalSizeText: includeImageWeight ? `${formatBytes(sizeData.knownBytes)}${unknownSuffix}` : '--',
        speedEstimatesText: includeImageWeight ? buildSpeedEstimateText(sizeData.knownBytes) : '--',
        totalThresholdExceeded: includeImageWeight && totalExceeded,
        imagesAlertCount: imageAlertCount,
        accessibilityAlertCount,
        links: linksPayload,
        imageBreakdownRows: includeImageWeight ? imageBreakdownRows : [],
        accessibilityWarningRows: accessibilityWarnings.map((row) => ({ ...row, url: row.url || '' })),
        linkTitleRows: linkTitleWarnings.map((row) => ({
          kind: row.kind === 'image' ? 'image' : 'text',
          displayName: row.displayName || '',
          imageUrl: row.imageUrl || ''
        })),
        statusText: includeImageWeight
          ? `Measured ${sizeData.networkCount - sizeData.unknownCount} of ${sizeData.networkCount} unique network image URLs${sizeData.unknownCount > 0 ? ' (missing headers/CORS/auth blocked for unknown items).' : '.'} Estimate reflects unique image payload bytes for cold cache and excludes protocol overhead/proxy behavior. Threshold alerts: total ${thresholds.totalValue} ${thresholds.totalUnit}, singular ${thresholds.singularValue} ${thresholds.singularUnit}. Link checks: ${linksAlertCount} issue(s). Accessibility: ${missingAltCount} linked image(s) missing ALT; ${linkTitlesCount} link(s) with title attributes. Text "Notify" matches: ${notifyAlertCount}.`
          : `Image weight analysis requires permission. Link checks: ${linksAlertCount} issue(s). Accessibility: ${missingAltCount} linked image(s) missing ALT; ${linkTitlesCount} link(s) with title attributes. Text "Notify" matches: ${notifyAlertCount}.`
      });
    }
    return { ok: true, reason: 'success', totalReferences: refs.length, totalLinkAnchors: linkAnalysis.totalAnchors };
  }

  function scheduleScan(ms = 350, scanOpts = {}) {
    if (!isPreflightActive()) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      scanAndRenderImageMetrics(scanOpts);
    }, ms);
  }

  function activatePreflightPanel() {
    const navContent = document.querySelector('.e-verticalnav__content');
    const navItem = document.querySelector(`#${PRELIGHT_TAB_ID} e-verticalnav-item`);
    if (!navContent || !navItem) return;

    navItem.setAttribute('status', 'active');
    const navItemDiv = navItem.querySelector('.e-verticalnavitem');
    if (navItemDiv) navItemDiv.classList.add('e-verticalnavitem-active');

    hideNonRouterOutletChildren(navContent);

    const existingPanel = navContent.querySelector(PRELIGHT_PANEL_TAG);
    if (existingPanel) existingPanel.remove();
    navContent.insertAdjacentHTML('afterbegin', createPreflightPanelHTML());
    setupImageRowHoverTooltip();
    setupImageWeightDetailsToggle();
    setupSkippedUrlsToggle();
    setupSectionCollapseToggles();
    setupLinksLiveVerifyInteractions();
    setupLinksPermissionActions();
    observeContactPreviewIframe();
    const els = getPreflightPanelEls();
    if (els && els.skippedUrlsWrap) syncSkippedUrlsCollapseUI(els.skippedUrlsWrap, true);
    if (els && els.panel) {
      updateTextAnalysisSectionPip(0);
      updateAccessibilitySectionPip(getAccessibilityCombinedAlertCount());
      if (els.accessibilityWarningsTable) {
        renderAccessibilityWarningsIntoTable(els.accessibilityWarningsTable, cachedAccessibilityMissingAltRows);
      }
      if (els.linkTitlesTable) {
        renderLinkTitlesTable(els.linkTitlesTable, cachedLinkTitleRows);
      }
      updateLinksSectionPip(0);
      updateImagesSectionPip(0);
      void readSectionCollapseState().then((state) => {
        ['languageOverview', 'textAnalysis', 'accessibility', 'links', 'images'].forEach((key) => {
          syncPreflightSectionCollapseUI(els.panel, key, !!state[key]);
        });
      });
    }
    void initializeTextAnalysisSectionState();

    void loadLinksSectionHiddenSetting();
    setPermissionGateVisible(true);
    initializePermissionGateState();
  }

  function deactivatePreflightPanel() {
    const navItem = document.querySelector(`#${PRELIGHT_TAB_ID} e-verticalnav-item`);
    if (navItem) {
      navItem.removeAttribute('status');
      const navItemDiv = navItem.querySelector('.e-verticalnavitem');
      if (navItemDiv) navItemDiv.classList.remove('e-verticalnavitem-active');
    }

    const panel = document.querySelector(PRELIGHT_PANEL_TAG);
    if (panel) panel.remove();

    const navContent = document.querySelector('.e-verticalnav__content');
    if (navContent) restoreHiddenNavChildren(navContent);
    cleanupPreflightLifecycle();
  }

  async function handlePreflightTabClick(event) {
    event.preventDefault();
    activatePreflightPanel();
  }

  async function initializePermissionGateState() {
    setupOpenSettingsButton();
    await loadLinksSectionHiddenSetting();
    setupLinksPermissionActions();
    const hasAccess = await hasImageHostAccess();
    if (!isPreflightActive()) return;
    if (!hasAccess) {
      // Accessibility is driven by the preview iframe observer; do not re-scan on panel open.
      scanAndRenderImageMetrics({ includeImageWeight: false, skipAccessibilityScan: true });
    }
    if (hasAccess) {
      setPermissionGateVisible(false);
      scheduleScan(10, { skipAccessibilityScan: true });
      setupManualRefreshButton();
      return;
    }

    setPermissionGateVisible(true, '');
    const els = getPreflightPanelEls();
    if (!els || !els.enableBtn || els.enableBtn.dataset.gemBound === 'true') return;
    els.enableBtn.dataset.gemBound = 'true';
    els.enableBtn.addEventListener('click', async () => {
      els.enableBtn.disabled = true;
      if (els.permissionStatus) {
        els.permissionStatus.textContent = 'Waiting for permission prompt...';
      }
      const granted = await ensureImageHostAccess();
      els.enableBtn.disabled = false;
      if (!isPreflightActive()) return;
      if (!granted) {
        setPermissionGateVisible(true, 'Permission was not granted. Image size analysis is unavailable until access is allowed.');
        return;
      }
      setPermissionGateVisible(false);
      scheduleScan(10);
      setupManualRefreshButton();
    });
  }

  function setupManualRefreshButton() {
    const els = getPreflightPanelEls();
    if (!els || !els.refreshBtn || els.refreshBtn.dataset.gemBound === 'true') return;
    els.refreshBtn.dataset.gemBound = 'true';
    els.refreshBtn.addEventListener('click', () => {
      if (!isPreflightActive()) return;
      scheduleScan(10);
    });
  }

  function setupOpenSettingsButton() {
    const els = getPreflightPanelEls();
    if (!els || !els.openSettingsBtn || els.openSettingsBtn.dataset.gemBound === 'true') return;
    els.openSettingsBtn.dataset.gemBound = 'true';
    els.openSettingsBtn.addEventListener('click', () => {
      if (typeof window.openGemmaSettings === 'function') {
        window.openGemmaSettings('preflight-settings');
        return;
      }
      chrome.runtime.sendMessage({ action: 'openSettings' });
    });
  }

  async function maybeRunInitialAlertCalculation() {
    if (initialScanTriggered) return;
    const hasAccess = await hasImageHostAccess();
    // Calculate once on page load so nav badge can alert before panel open.
    const scanResult = await scanAndRenderImageMetrics({ includeImageWeight: !!hasAccess });
    if (scanResult && scanResult.ok && (scanResult.totalReferences > 0 || (scanResult.totalLinkAnchors || 0) > 0)) {
      initialScanTriggered = true;
      return;
    }

    initialScanAttemptCount += 1;
    const maxAttempts = 6;
    if (initialScanAttemptCount >= maxAttempts) {
      if (scanResult && scanResult.ok) {
        // Allow image-less emails to settle after retries.
        initialScanTriggered = true;
      }
      return;
    }

    const retryDelaysMs = [300, 600, 1000, 1500, 2000, 2500];
    const delay = retryDelaysMs[Math.min(initialScanAttemptCount - 1, retryDelaysMs.length - 1)];
    if (initialScanRetryTimer) clearTimeout(initialScanRetryTimer);
    initialScanRetryTimer = setTimeout(() => {
      initialScanRetryTimer = null;
      maybeRunInitialAlertCalculation();
    }, delay);
  }

  function observeForPreviewIframeAndRunInitialCalculation() {
    if (initialIframeObserver) return;
    initialIframeObserver = new MutationObserver(() => {
      bindInitialCalculationToPreviewIframe();
    });
    initialIframeObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  async function runAutomaticAlertCalculationForLoadedIframe() {
    const hasAccess = await hasImageHostAccess();
    await scanAndRenderImageMetrics({ includeImageWeight: !!hasAccess });
  }

  function bindInitialCalculationToPreviewIframe() {
    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    if (!iframe) return false;

    if (boundPreviewIframe && boundPreviewIframe !== iframe) {
      disconnectPreviewDocAccessibilityObserver();
    }

    if (boundPreviewIframe === iframe && boundPreviewIframeLoadHandler) {
      setupPreviewDocAccessibilityObserver(iframe);
      return true;
    }

    if (boundPreviewIframe && boundPreviewIframeLoadHandler) {
      try {
        boundPreviewIframe.removeEventListener('load', boundPreviewIframeLoadHandler, true);
      } catch (_) {}
    }

    const runOnce = () => {
      maybeRunInitialAlertCalculation();
    };

    const onIframeLoad = () => {
      void runAutomaticAlertCalculationForLoadedIframe();
      setupPreviewDocAccessibilityObserver(iframe);
    };

    iframe.addEventListener('load', onIframeLoad, true);
    boundPreviewIframe = iframe;
    boundPreviewIframeLoadHandler = onIframeLoad;

    try {
      const doc = iframe.contentDocument;
      if (doc && doc.documentElement) {
        runOnce();
        setupPreviewDocAccessibilityObserver(iframe);
      }
    } catch (_) {}

    return true;
  }

  function setupGlobalTabClickHandler() {
    if (globalTabHandlerBound) return;
    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (!verticalNav) return;

    globalTabHandlerBound = true;
    verticalNav.addEventListener('click', (event) => {
      const clickedTab = event.target.closest('cb-vertical-tab');
      if (!clickedTab) return;
      if (clickedTab.id === PRELIGHT_TAB_ID) return;
      if (isPreflightActive()) deactivatePreflightPanel();
    });
  }

  function addPreflightTab() {
    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (!snippetsTab) return false;
    if (document.querySelector(`#${PRELIGHT_TAB_ID}`)) return true;

    snippetsTab.insertAdjacentHTML('afterend', createPreflightTabHTML());
    const preflightTab = document.querySelector(`#${PRELIGHT_TAB_ID}`);
    if (!preflightTab) return false;

    const navItem = preflightTab.querySelector('e-verticalnav-item');
    if (navItem) navItem.addEventListener('click', handlePreflightTabClick);
    setupGlobalTabClickHandler();
    chrome.storage.local.get({ [PREFLIGHT_ALERT_COUNT_KEY]: 0 }, (res) => {
      updateAlertPip(res[PREFLIGHT_ALERT_COUNT_KEY] || 0);
    });
    void loadPreflightIconPipTogglesSetting();
    void loadLiveVerifyEnabledSetting();
    window.addEventListener(GEM_TEXT_HIGHLIGHTS_RENDERED_EVENT, scheduleTextAnalysisRefreshFromHighlightEvent);
    bindInitialCalculationToPreviewIframe();
    observeForPreviewIframeAndRunInitialCalculation();
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;
      if (changes[PREFLIGHT_URL_NEVER_CHECK_KEY]) {
        if (isPreflightActive()) {
          reapplyNeverCheckSetToCachedRows();
        }
        return;
      }
      if (changes[PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY]) {
        applyLiveVerifyEnabledState(changes[PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY].newValue === true);
        return;
      }
      if (changes[PREFLIGHT_HIDE_LINKS_SECTION_KEY]) {
        applyLinksSectionVisibilityState(changes[PREFLIGHT_HIDE_LINKS_SECTION_KEY].newValue === true);
        if (isPreflightActive()) void refreshLinksPermissionActionsUI();
        return;
      }
      if (changes[PREFLIGHT_ICON_PIP_TOGGLES_KEY]) {
        cachedPreflightIconPipToggles = normalizePreflightIconPipToggles(changes[PREFLIGHT_ICON_PIP_TOGGLES_KEY].newValue);
        persistAndUpdateOverallAlertPip();
        return;
      }
      if (
        changes[PREFLIGHT_TOTAL_THRESHOLD_VALUE_KEY] ||
        changes[PREFLIGHT_TOTAL_THRESHOLD_UNIT_KEY] ||
        changes[PREFLIGHT_SINGULAR_THRESHOLD_VALUE_KEY] ||
        changes[PREFLIGHT_SINGULAR_THRESHOLD_UNIT_KEY]
      ) {
        maybeRunInitialAlertCalculation();
        if (isPreflightActive()) scheduleScan(10);
      }
      if (changes.enableHighlighting || changes.highlightTerms) {
        if (isPreflightActive()) void initializeTextAnalysisSectionState();
      }
    });
    return true;
  }

  function waitForVerticalNav() {
    if (addPreflightTab()) return;
    const observer = new MutationObserver(() => {
      if (addPreflightTab()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  waitForVerticalNav();
  setupLanguagePreflightBadgeSync();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePreflightPanel);
} else {
  initializePreflightPanel();
}
