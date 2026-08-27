// compare-email-basics-capture.js — mount Email Basics to read subject + preheader from any doc
(function () {
  const EMAIL_BASICS_TAB_ID = 'emailBasicsTab';
  const SUBJECT_SELECTOR = '#subject-line-input vce-codemirror';
  const PREHEADER_SELECTOR = 'cb-preheader textarea';
  const DEFAULT_TIMEOUT_MS = 4000;
  const DEFAULT_POLL_MS = 100;
  const STRIPPED_CAPTURE_STYLE_ID = 'gem-compare-email-basics-unstrip';
  const hiddenIframeCaptures = new Map();

  const STRIPPED_CAPTURE_STYLE = [
    'cb-vertical-tab#emailBasicsTab,',
    'cb-vertical-tab#emailBasicsTab e-verticalnav-item,',
    'cb-vertical-tab#emailBasicsTab .e-verticalnavitem,',
    'cb-email-basics-tab,',
    'cb-email-basics-tab *,',
    'cb-preheader,',
    'cb-preheader *,',
    'cb-personalizable-input-with-context#subject-line-input,',
    'cb-personalizable-input-with-context#subject-line-input *,',
    'vce-codemirror,',
    'vce-codemirror * {',
    '  display: revert !important;',
    '  visibility: visible !important;',
    '  font-size: revert !important;',
    '  line-height: revert !important;',
    '  color: revert !important;',
    '  background: revert !important;',
    '  opacity: 1 !important;',
    '  pointer-events: auto !important;',
    '}',
    'cb-email-basics-tab {',
    '  position: fixed !important;',
    '  left: -10000px !important;',
    '  top: 0 !important;',
    '  width: 640px !important;',
    '  height: auto !important;',
    '  max-height: none !important;',
    '  overflow: visible !important;',
    '  z-index: 2147483646 !important;',
    '}',
  ].join('\n');

  function isGemStrippedCampaignDoc(doc) {
    try {
      const win = doc && doc.defaultView;
      if (!win) return false;
      const url = new URL(win.location.href);
      if (url.searchParams.get('gemStripped') !== 'true') return false;
      const route = decodeURIComponent(url.searchParams.get('r') || '');
      return route.includes('contentBlocks/campaign');
    } catch (_) {
      return false;
    }
  }

  function injectStrippedCaptureStyles(doc) {
    if (!doc || doc.getElementById(STRIPPED_CAPTURE_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STRIPPED_CAPTURE_STYLE_ID;
    style.textContent = STRIPPED_CAPTURE_STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function removeStrippedCaptureStyles(doc) {
    doc?.getElementById(STRIPPED_CAPTURE_STYLE_ID)?.remove();
  }

  function getActiveVerticalNavTabId(doc) {
    if (!doc) return null;

    const activeNav = doc.querySelector('e-verticalnav-item[status="active"]');
    if (activeNav) {
      const tab = activeNav.closest('cb-vertical-tab[id]');
      return tab ? String(tab.id || tab.getAttribute('id') || '').trim() : null;
    }

    const activeDiv = doc.querySelector('.e-verticalnavitem-active');
    if (activeDiv) {
      const nav = activeDiv.closest('e-verticalnav-item');
      const tab = nav && nav.closest('cb-vertical-tab[id]');
      return tab ? String(tab.id || tab.getAttribute('id') || '').trim() : null;
    }

    return null;
  }

  function dispatchClick(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch (_) {}
    try {
      el.click();
    } catch (_) {}
  }

  function activateVerticalNavTabInDoc(doc, tabId) {
    const id = String(tabId || '').trim();
    if (!doc || !id) return false;

    const tab = doc.querySelector(`#${CSS.escape(id)}`);
    const navItem = tab && tab.querySelector('e-verticalnav-item');
    if (!navItem) return false;

    [
      navItem.querySelector('.e-svgclickfix'),
      navItem.querySelector('.e-verticalnavitem__icon'),
      navItem.querySelector('.e-verticalnavitem'),
      navItem,
    ].filter(Boolean).forEach(dispatchClick);

    return true;
  }

  function hasEmailBasicsFields(doc) {
    if (!doc) return false;
    return !!(doc.querySelector(SUBJECT_SELECTOR) || doc.querySelector(PREHEADER_SELECTOR));
  }

  function captureEditorFieldSourcesFromDoc(doc) {
    if (!doc) return { subjectHtml: '', preheaderText: '' };

    const subjectCm = doc.querySelector(SUBJECT_SELECTOR);
    const subjectHtml = subjectCm ? String(subjectCm.getAttribute('html') || '') : '';
    const preheaderEl = doc.querySelector(PREHEADER_SELECTOR);
    const preheaderText = preheaderEl ? String(preheaderEl.value || '') : '';
    return { subjectHtml, preheaderText };
  }

  function extractPreheaderFromBodyHtml(bodyHtml) {
    const raw = String(bodyHtml || '').trim();
    if (!raw) return '';

    const match = raw.match(/<div\b[^>]*\bems:preheader\b[^>]*>([\s\S]*?)<\/div>/i);
    if (!match) return '';

    try {
      const parsed = new DOMParser().parseFromString(match[1], 'text/html');
      return String(parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return String(match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function waitForElementInDoc(doc, selector, timeoutMs, pollMs) {
    const timeout = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
    const poll = Number.isFinite(pollMs) ? pollMs : DEFAULT_POLL_MS;

    return new Promise((resolve) => {
      const startedAt = Date.now();

      function attempt() {
        try {
          if (doc.querySelector(selector)) {
            resolve(true);
            return;
          }
        } catch (_) {}

        if (Date.now() - startedAt >= timeout) {
          resolve(false);
          return;
        }
        setTimeout(attempt, poll);
      }

      attempt();
    });
  }

  function waitForEmailBasicsFieldsInDoc(doc, timeoutMs, pollMs) {
    return waitForElementInDoc(
      doc,
      `${SUBJECT_SELECTOR}, ${PREHEADER_SELECTOR}`,
      timeoutMs,
      pollMs
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function idForCanonicalCampaignQuery(id) {
    const s = String(id || '').trim();
    if (!s) return '';
    return /^[a-zA-Z0-9_-]+$/.test(s) ? s : encodeURIComponent(s);
  }

  function buildCampaignEditorUrl(campaignId, { stripped = false, sessionId = '' } = {}) {
    const idForQuery = idForCanonicalCampaignQuery(campaignId);
    if (!idForQuery) return '';

    try {
      const url = new URL('/bootstrap.php', window.location.origin);
      url.searchParams.set('r', 'contentBlocks/campaign');
      url.searchParams.set('id', idForQuery);
      const sid = String(sessionId || '').trim();
      if (sid) url.searchParams.set('session_id', sid);
      if (stripped) url.searchParams.set('gemStripped', 'true');
      return typeof window.gemHrefPreserveQuerySlashes === 'function'
        ? window.gemHrefPreserveQuerySlashes(url)
        : url.toString().replace(/\?[^#]*/, (query) => query.replace(/%2F/gi, '/'));
    } catch (_) {
      return '';
    }
  }

  function getCurrentSessionIdFromPage() {
    try {
      return (new URL(window.location.href).searchParams.get('session_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function captureEmailBasicsViaHiddenIframe(campaignId, options = {}) {
    const id = String(campaignId || '').trim();
    if (!id) return Promise.resolve({ subjectHtml: '', preheaderText: '' });

    const timeoutMs = options.timeoutMs ?? 15000;
    const fieldTimeoutMs = options.fieldTimeoutMs ?? 8000;
    const sessionId = options.sessionId ?? getCurrentSessionIdFromPage();
    const url = buildCampaignEditorUrl(id, { stripped: false, sessionId });
    if (!url) return Promise.resolve({ subjectHtml: '', preheaderText: '' });

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.style.cssText = [
        'position:fixed',
        'width:0',
        'height:0',
        'border:0',
        'opacity:0',
        'pointer-events:none',
        'left:-9999px',
        'top:0',
      ].join(';');

      let settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        iframe.remove();
        resolve(result);
      }

      const timeoutHandle = setTimeout(() => {
        finish({ subjectHtml: '', preheaderText: '' });
      }, timeoutMs);

      iframe.addEventListener('load', () => {
        void (async () => {
          try {
            const doc = iframe.contentDocument;
            if (!doc) {
              finish({ subjectHtml: '', preheaderText: '' });
              return;
            }

            await waitForElementInDoc(doc, `#${EMAIL_BASICS_TAB_ID}`, fieldTimeoutMs);
            const fields = await captureEmailBasicsFields(doc, {
              timeoutMs: fieldTimeoutMs,
              restoreTab: false,
              stripped: false,
            });
            finish(fields);
          } catch (_) {
            finish({ subjectHtml: '', preheaderText: '' });
          }
        })();
      });

      iframe.addEventListener('error', () => {
        finish({ subjectHtml: '', preheaderText: '' });
      });

      iframe.src = url;
      document.body.appendChild(iframe);
    });
  }

  async function captureEmailBasicsFieldsForCampaign(campaignId, options = {}) {
    const id = String(campaignId || '').trim();
    if (!id) return { subjectHtml: '', preheaderText: '' };

    if (hiddenIframeCaptures.has(id)) {
      return hiddenIframeCaptures.get(id);
    }

    const promise = captureEmailBasicsViaHiddenIframe(id, options);
    hiddenIframeCaptures.set(id, promise);
    try {
      return await promise;
    } finally {
      hiddenIframeCaptures.delete(id);
    }
  }

  async function captureEmailBasicsFields(doc, options = {}) {
    if (!doc) return { subjectHtml: '', preheaderText: '' };

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    const restoreTab = options.restoreTab !== false;
    const stripped = options.stripped === true || isGemStrippedCampaignDoc(doc);

    if (stripped) injectStrippedCaptureStyles(doc);

    try {
      const previousTabId = restoreTab ? getActiveVerticalNavTabId(doc) : null;
      const onEmailBasics = getActiveVerticalNavTabId(doc) === EMAIL_BASICS_TAB_ID;

      if (!onEmailBasics) {
        await waitForElementInDoc(doc, `#${EMAIL_BASICS_TAB_ID}`, timeoutMs, pollMs);
        if (!activateVerticalNavTabInDoc(doc, EMAIL_BASICS_TAB_ID)) {
          return captureEditorFieldSourcesFromDoc(doc);
        }
        await delay(150);
        await waitForEmailBasicsFieldsInDoc(doc, timeoutMs, pollMs);
      } else if (!hasEmailBasicsFields(doc)) {
        await waitForEmailBasicsFieldsInDoc(doc, timeoutMs, pollMs);
      }

      const result = captureEditorFieldSourcesFromDoc(doc);

      if (restoreTab && previousTabId && previousTabId !== EMAIL_BASICS_TAB_ID) {
        activateVerticalNavTabInDoc(doc, previousTabId);
        await delay(50);
      }

      return result;
    } finally {
      if (stripped) removeStrippedCaptureStyles(doc);
    }
  }

  window.gemCompareEmailBasicsCapture = {
    EMAIL_BASICS_TAB_ID,
    SUBJECT_SELECTOR,
    PREHEADER_SELECTOR,
    isGemStrippedCampaignDoc,
    getActiveVerticalNavTabId,
    activateVerticalNavTabInDoc,
    hasEmailBasicsFields,
    captureEditorFieldSourcesFromDoc,
    extractPreheaderFromBodyHtml,
    waitForEmailBasicsFieldsInDoc,
    buildCampaignEditorUrl,
    captureEmailBasicsFields,
    captureEmailBasicsFieldsForCampaign,
  };
})();
