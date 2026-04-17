console.log('[Gem] preflight-panel.js loaded');

function initializePreflightPanel() {
  const PREVIEW_IFRAME_SELECTOR = '.e-contentblocks-preview__iframe-desktop';
  const PRELIGHT_TAB_ID = 'gem-preflight-tab';
  const PRELIGHT_PANEL_TAG = 'gem-preflight';
  const PREFLIGHT_TOTAL_THRESHOLD_VALUE_KEY = 'gemPreflightTotalImageWeightThresholdValue';
  const PREFLIGHT_TOTAL_THRESHOLD_UNIT_KEY = 'gemPreflightTotalImageWeightThresholdUnit';
  const PREFLIGHT_SINGULAR_THRESHOLD_VALUE_KEY = 'gemPreflightSingularImageWeightThresholdValue';
  const PREFLIGHT_SINGULAR_THRESHOLD_UNIT_KEY = 'gemPreflightSingularImageWeightThresholdUnit';
  const PREFLIGHT_ALERT_COUNT_KEY = 'gemPreflightAlertCount';
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
<cb-vertical-tab id="gem-preflight-tab" value="tooltips.preflight" icon="ac-action-finish">
  <e-verticalnav-item class="gem-e-verticalnav-item gem-preflight-nav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Preflight" role="tooltip" aria-description="Preflight">
        <div class="e-verticalnavitem__icon e-svgclickfix">
          <e-icon icon="ac-action-finish"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF008;</div></div></e-icon>
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
      <div class="gem-preflight-subsection-title">
        <div class="gem-preflight-subsection-title-main">
          <span>Image Weight</span>
          <span class="gem-preflight-section-pip" data-role="imagesSectionAlertPip" style="display:none;">0</span>
        </div>
        <div class="gem-preflight-header-actions">
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
      </div>
      <div class="gem-preflight-permission-gate" data-role="permissionGate">
        <div class="gem-preflight-permission-text">
          Estimate cold-cache image download weight for this email. This requests temporary image-host access so Gemma can measure unique image resources across any domain used in your email.
        </div>
        <button type="button" class="e-btn e-btn-primary gem-preflight-enable-image-access-btn" data-role="enableImageAccessBtn">
          Analyze Image Download Weight
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
      <div class="gem-preflight-image-breakdown">
        <div class="gem-preflight-image-breakdown-title">Image Weight Details</div>
        <div class="gem-preflight-image-breakdown-table" data-role="imageBreakdownTable">
          <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
        </div>
      </div>

      <div class="gem-preflight-subsection-title gem-preflight-subsection-title--spaced">
        <div class="gem-preflight-subsection-title-main">
          <span>Accessibility</span>
          <span class="gem-preflight-section-pip" data-role="accessibilitySectionAlertPip" style="display:none;">0</span>
        </div>
      </div>
      <div class="gem-preflight-subsection-description">
        Linked images missing ALT text
      </div>
      <div class="gem-preflight-accessibility-table" data-role="accessibilityWarningsTable">
        <div class="gem-preflight-image-breakdown-empty">Scanning...</div>
      </div>
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
      accessibilityWarningsTable: panel.querySelector('[data-role="accessibilityWarningsTable"]'),
      permissionStatus: panel.querySelector('[data-metric="permissionStatus"]'),
      metrics: panel.querySelector('#gem-preflight-images-metrics'),
      imageBreakdownWrap: panel.querySelector('.gem-preflight-image-breakdown')
    };
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

  function updateImagesSectionPip(count) {
    const els = getPreflightPanelEls();
    if (!els || !els.imagesSectionPip) return;
    const safe = Math.max(0, Number.parseInt(count, 10) || 0);
    if (!safe) {
      els.imagesSectionPip.textContent = '0';
      els.imagesSectionPip.style.display = 'none';
      return;
    }
    els.imagesSectionPip.textContent = String(Math.min(99, safe));
    els.imagesSectionPip.style.display = '';
  }

  function updateAccessibilitySectionPip(count) {
    const els = getPreflightPanelEls();
    if (!els || !els.accessibilitySectionPip) return;
    const safe = Math.max(0, Number.parseInt(count, 10) || 0);
    if (!safe) {
      els.accessibilitySectionPip.textContent = '0';
      els.accessibilitySectionPip.style.display = 'none';
      return;
    }
    els.accessibilitySectionPip.textContent = String(Math.min(99, safe));
    els.accessibilitySectionPip.style.display = '';
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

  function cleanupPreflightLifecycle() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (initialScanRetryTimer) {
      clearTimeout(initialScanRetryTimer);
      initialScanRetryTimer = null;
    }
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

  function isDownloadableNetworkUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
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

  function updateImagesMetricsUI(payload) {
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
    const els = getPreflightPanelEls();
    if (!refsEl || !uniqueEl || !sizeEl || !statusEl || !networkUniqueEl || !embeddedUniqueEl || !speedEstimatesEl || !els || !els.imageBreakdownTable || !els.accessibilityWarningsTable) return;

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
      els.accessibilityWarningsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Scanning...</div>';
      updateImagesSectionPip(0);
      updateAccessibilitySectionPip(0);
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
      els.accessibilityWarningsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">Unable to load accessibility warnings.</div>';
      updateImagesSectionPip(0);
      updateAccessibilitySectionPip(0);
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

    const accessibilityRows = Array.isArray(payload.accessibilityWarningRows) ? payload.accessibilityWarningRows : [];
    if (!accessibilityRows.length) {
      els.accessibilityWarningsTable.innerHTML = '<div class="gem-preflight-image-breakdown-empty">No linked images with missing ALT text.</div>';
      return;
    }
    els.accessibilityWarningsTable.innerHTML = accessibilityRows.map((row) => `
      <div class="gem-preflight-image-breakdown-row">
        <div class="gem-preflight-image-breakdown-name" data-image-url="${escapeHtmlText(row.url || '')}">${escapeHtmlText(row.filename)}</div>
        <div class="gem-preflight-image-breakdown-size gem-preflight-image-breakdown-size--alert">Missing ALT</div>
      </div>
    `).join('');
  }

  async function scanAndRenderImageMetrics(opts = {}) {
    const includeImageWeight = opts.includeImageWeight !== false;
    const scanToken = Date.now();
    currentScanToken = scanToken;
    updateImagesMetricsUI({ state: 'loading', message: 'Scanning desktop preview...' });

    const iframe = document.querySelector(PREVIEW_IFRAME_SELECTOR);
    const doc = iframe && iframe.contentDocument ? iframe.contentDocument : null;
    if (!doc || !doc.documentElement) {
      updateImagesMetricsUI({ state: 'error', message: 'Desktop preview is not ready yet.' });
      return { ok: false, reason: 'iframe-not-ready', totalReferences: 0 };
    }

    const refs = collectImageReferencesFromPreviewDoc(doc);
    const uniqueUrls = Array.from(new Set(refs));
    const accessibilityWarnings = collectLinkedImageMissingAltWarnings(doc);
    const networkUniqueUrls = uniqueUrls.filter(isDownloadableNetworkUrl);
    const embeddedUniqueCount = uniqueUrls.length - networkUniqueUrls.length;

    const sizeData = includeImageWeight
      ? await fetchUniqueDownloadSize(uniqueUrls)
      : { ok: true, knownBytes: 0, unknownCount: 0, networkCount: networkUniqueUrls.length, unknownDetails: [], measurements: [] };
    if (!sizeData || sizeData.ok === false) {
      updateImagesMetricsUI({
        state: 'error',
        message: sizeData && sizeData.error ? `Unable to measure image sizes: ${sizeData.error}` : 'Unable to measure image sizes.'
      });
      return { ok: false, reason: 'measure-failed', totalReferences: 0 };
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
    const accessibilityAlertCount = accessibilityWarnings.length;
    const alertCount = imageAlertCount + accessibilityAlertCount;
    chrome.storage.local.set({ [PREFLIGHT_ALERT_COUNT_KEY]: alertCount });
    updateAlertPip(alertCount);

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
      updateImagesMetricsUI({
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
        imageBreakdownRows: includeImageWeight ? imageBreakdownRows : [],
        accessibilityWarningRows: accessibilityWarnings.map((row) => ({ ...row, url: row.url || '' })),
        statusText: includeImageWeight
          ? `Measured ${sizeData.networkCount - sizeData.unknownCount} of ${sizeData.networkCount} unique network image URLs${sizeData.unknownCount > 0 ? ' (missing headers/CORS/auth blocked for unknown items).' : '.'} Estimate reflects unique image payload bytes for cold cache and excludes protocol overhead/proxy behavior. Threshold alerts: total ${thresholds.totalValue} ${thresholds.totalUnit}, singular ${thresholds.singularValue} ${thresholds.singularUnit}. Accessibility warnings: ${accessibilityAlertCount} linked image(s) missing ALT text.`
          : `Image weight analysis requires permission. Accessibility warnings: ${accessibilityAlertCount} linked image(s) missing ALT text.`
      });
    }
    return { ok: true, reason: 'success', totalReferences: refs.length };
  }

  function scheduleScan(ms = 350) {
    if (!isPreflightActive()) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      scanAndRenderImageMetrics();
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
    const hasAccess = await hasImageHostAccess();
    if (!isPreflightActive()) return;
    if (!hasAccess) {
      // Accessibility checks do not require host permissions.
      scanAndRenderImageMetrics({ includeImageWeight: false });
    }
    if (hasAccess) {
      setPermissionGateVisible(false);
      scheduleScan(10);
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
    if (scanResult && scanResult.ok && scanResult.totalReferences > 0) {
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
    if (boundPreviewIframe === iframe && boundPreviewIframeLoadHandler) return true;

    if (boundPreviewIframe && boundPreviewIframeLoadHandler) {
      try {
        boundPreviewIframe.removeEventListener('load', boundPreviewIframeLoadHandler, true);
      } catch (_) {}
    }

    const runOnce = () => {
      maybeRunInitialAlertCalculation();
    };

    const onIframeLoad = () => {
      runAutomaticAlertCalculationForLoadedIframe();
    };

    iframe.addEventListener('load', onIframeLoad, true);
    boundPreviewIframe = iframe;
    boundPreviewIframeLoadHandler = onIframeLoad;

    try {
      const doc = iframe.contentDocument;
      if (doc && doc.documentElement) {
        runOnce();
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
    bindInitialCalculationToPreviewIframe();
    observeForPreviewIframeAndRunInitialCalculation();
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;
      if (
        changes[PREFLIGHT_TOTAL_THRESHOLD_VALUE_KEY] ||
        changes[PREFLIGHT_TOTAL_THRESHOLD_UNIT_KEY] ||
        changes[PREFLIGHT_SINGULAR_THRESHOLD_VALUE_KEY] ||
        changes[PREFLIGHT_SINGULAR_THRESHOLD_UNIT_KEY]
      ) {
        maybeRunInitialAlertCalculation();
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePreflightPanel);
} else {
  initializePreflightPanel();
}
