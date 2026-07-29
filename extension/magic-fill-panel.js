console.log('[Gem] magic-fill-panel.js loaded');

(function () {
  'use strict';

  const frDom = () => window.gemFindReplaceDom;
  const mfDom = () => window.gemMagicFillDom;

  const TAB_ID = 'gem-magic-fill-tab';
  const PANEL_TAG = 'gem-magic-fill';
  const SESSION_STATE_KEY = 'gemMagicFillPanelStateV1';

  const MAGIC_FILL_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--token-icon-default-text)" aria-hidden="true"><path d="M480-240 63-467l84-46 333 182 333-182 84 46-417 227Zm0 160L63-307l84-46 333 182 333-182 84 46L480-80Zm0-320L40-640l440-240 40 22v178h327l73 40-440 240Zm0-91 200-109H440v-167L207-640l273 149Zm-40-109Z"/></svg>';

  let pendingPlan = null;
  let lastScanResult = null;
  let persistPanelStateTimer = null;
  let globalTabHandlerBound = false;
  let panelHandlersBound = false;
  let operationInFlight = false;

  // Gated by debug-logging-gate.js when "Enable debug logging" is off.
  const MF_LOG = '[Gem][MagicFill]';

  function mfLog(...args) {
    try {
      console.log(MF_LOG, ...args);
    } catch (_) {}
  }

  function mfWarn(...args) {
    try {
      console.warn(MF_LOG, ...args);
    } catch (_) {}
  }

  function mfSnippet(value, max = 120) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  }

  function mfHash(value) {
    const text = String(value ?? '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
  }

  function mfDescribeNode(node) {
    if (!node) return 'null';
    try {
      const tag = (node.tagName || node.nodeName || '?').toLowerCase();
      const id = node.id ? `#${node.id}` : '';
      const editable = node.getAttribute?.('contenteditable') === 'true' ? '[contenteditable]' : '';
      const eEditable = node.hasAttribute?.('e-editable') ? '[e-editable]' : '';
      return `<${tag}${id}${editable}${eEditable}>`;
    } catch (e) {
      return `describe-error: ${e.message}`;
    }
  }

  function captureEditorSnapshot(label) {
    const subjectInput = getSubjectLineInput();
    const previewTextarea = document.querySelector('cb-preheader textarea');
    const previewDoc = getPreviewDocument();
    const selectedLang =
      (typeof window.gemGetSelectedLanguageValue === 'function'
        ? window.gemGetSelectedLanguageValue()
        : mfDom()?.getSelectedLanguageValue?.()) || null;

    let subjectText = '';
    let previewText = '';
    let bodyText = '';
    let bodyHtmlLen = 0;
    let editableCount = 0;
    let containerContent = '';

    try {
      subjectText = subjectInput ? getSubjectLineText(subjectInput) : '';
    } catch (_) {}
    try {
      previewText = previewTextarea ? String(previewTextarea.value || '') : '';
    } catch (_) {}
    try {
      if (previewDoc) {
        bodyText = String(previewDoc.body?.textContent || '');
        bodyHtmlLen = String(previewDoc.body?.innerHTML || '').length;
        editableCount = previewDoc.querySelectorAll('[contenteditable="true"], [e-editable]').length;
      }
    } catch (_) {}
    try {
      if (typeof window.gemGetEditorPreviewContent === 'function') {
        containerContent = String(window.gemGetEditorPreviewContent() || '');
      }
    } catch (_) {}

    const snapshot = {
      label,
      selectedLang,
      subject: {
        present: !!subjectInput,
        hash: mfHash(subjectText),
        snippet: mfSnippet(subjectText),
      },
      preview: {
        present: !!previewTextarea,
        hash: mfHash(previewText),
        snippet: mfSnippet(previewText),
      },
      body: {
        previewDocPresent: !!previewDoc,
        editableCount,
        textHash: mfHash(bodyText),
        htmlLen: bodyHtmlLen,
        textSnippet: mfSnippet(bodyText),
      },
      containerContent: {
        hash: mfHash(containerContent),
        len: containerContent.length,
        snippet: mfSnippet(containerContent),
      },
      dirtyHelpers: {
        markTextControl: typeof window.gemMarkEmarsysTextControlDirty === 'function',
        markDraftDirty: typeof window.gemMarkEmarsysDraftDirty === 'function',
        nudgeFocus: typeof window.gemNudgeEmarsysDirtyDetectionViaFocus === 'function',
        markEmailBodyDirty: typeof frDom()?.markEmailBodyDirty === 'function',
      },
    };

    mfLog('snapshot:', snapshot);
    return snapshot;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPreviewDocument() {
    return frDom()?.getPreviewDocument?.() || null;
  }

  function getSubjectHelpers() {
    return window.gemFindReplaceSubjectField || null;
  }

  function getSubjectLineInput() {
    const helpers = getSubjectHelpers();
    if (helpers?.getSubjectLineInput) return helpers.getSubjectLineInput();
    return document.querySelector('cb-personalizable-input-with-context#subject-line-input');
  }

  function getSubjectLineText(subjectInput) {
    const helpers = getSubjectHelpers();
    if (helpers?.getText) return helpers.getText(subjectInput);
    return '';
  }

  function setSubjectLineContent(subjectInput, text) {
    const helpers = getSubjectHelpers();
    if (helpers?.setText) return helpers.setText(subjectInput, text);
    return false;
  }

  function hideNonRouterOutletChildren(navContent) {
    Array.from(navContent.children).forEach((child) => {
      if (child.tagName === 'ROUTER-OUTLET') return;
      if (child.tagName === 'GEM-MAGIC-FILL') return;
      if (child.dataset && child.dataset.gemHiddenByMagicFill === 'true') return;
      if (child.dataset) {
        child.dataset.gemHiddenByMagicFill = 'true';
        child.dataset.gemMagicFillPrevDisplay = child.style.display || '';
      }
      child.style.display = 'none';
    });
  }

  function restoreHiddenNavChildren(navContent) {
    navContent.querySelectorAll('[data-gem-hidden-by-magic-fill="true"]').forEach((el) => {
      const prev = el.dataset ? el.dataset.gemMagicFillPrevDisplay || '' : '';
      el.style.display = prev;
      if (el.dataset) {
        delete el.dataset.gemHiddenByMagicFill;
        delete el.dataset.gemMagicFillPrevDisplay;
      }
    });
  }

  function isMagicFillActive() {
    return !!document.querySelector(PANEL_TAG);
  }

  function createMagicFillTabHTML() {
    return `
<cb-vertical-tab id="${TAB_ID}" value="tooltips.magicFill" icon="magic-fill">
  <e-verticalnav-item class="gem-e-verticalnav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Magic Fill" role="tooltip" aria-description="Magic Fill">
        <div class="e-verticalnavitem__icon e-svgclickfix">
          <gem-e-icon icon="gem-magic-fill">
            <div aria-hidden="true" class="e-icon-wrapper">
              <div class="e-icon">${MAGIC_FILL_ICON_SVG}</div>
            </div>
          </gem-e-icon>
        </div>
      </e-tooltip>
      <div class="e-verticalnavitem__value">Magic Fill</div>
    </div>
  </e-verticalnav-item>
</cb-vertical-tab>
    `.trim();
  }

  function createMagicFillPanelHTML() {
    return `
<${PANEL_TAG} class="scrollable gem-magic-fill-panel">
  <div class="e-section">
    <div class="e-section__header">
      <div class="e-section__title">Gemma Magic Fill</div>
    </div>
    <div class="e-section__content">
      <p class="gem-magic-fill-help">
        Paste a JSON object whose keys match <code>[[placeholders]]</code> in the subject line, preview text, and email body.
        Language-nested JSON (e.g. <code>{"en-US": {...}, "pt-BR": {...}}</code>) is applied across matching campaign languages.
      </p>
      <div class="gem-magic-fill-field e-margin-bottom-s">
        <label class="gem-magic-fill-label" for="gem-magic-fill-json">JSON</label>
        <textarea
          id="gem-magic-fill-json"
          class="e-input gem-magic-fill-json"
          rows="12"
          spellcheck="false"
          autocomplete="off"
          placeholder='{\n  "subject": "Lorem ipsum",\n  "preview_text": "abc",\n  "title": "this is the title"\n}'
        ></textarea>
        <div class="gem-magic-fill-json-status" data-role="jsonStatus" hidden aria-live="polite"></div>
      </div>
      <div class="gem-magic-fill-progress" data-role="progress" hidden></div>
      <button type="button" class="e-btn gem-magic-fill-scan" data-role="scanBtn" disabled>Scan Placeholders</button>
      <div class="gem-magic-fill-results" data-role="results" hidden></div>
      <button type="button" class="e-btn e-btn-primary gem-magic-fill-apply e-margin-top-s" data-role="applyBtn" hidden disabled>Apply Magic Fill</button>
      <div class="gem-magic-fill-confirm" data-role="confirmBox" hidden>
        <div class="gem-magic-fill-confirm-summary" data-role="confirmSummary"></div>
        <div class="gem-magic-fill-confirm-actions">
          <button type="button" class="e-btn e-btn-primary" data-role="confirmBtn">Apply anyway</button>
          <button type="button" class="e-btn" data-role="cancelConfirmBtn">Cancel</button>
        </div>
      </div>
      <div class="gem-magic-fill-actions e-margin-top-s">
        <button type="button" class="e-btn gem-magic-fill-clear" data-role="clearBtn">Clear</button>
      </div>
    </div>
  </div>
</${PANEL_TAG}>
    `.trim();
  }

  function getPanelRoot() {
    return document.querySelector(PANEL_TAG);
  }

  function getFormElements() {
    const panel = getPanelRoot();
    if (!panel) return null;
    return {
      panel,
      jsonInput: panel.querySelector('#gem-magic-fill-json'),
      jsonStatus: panel.querySelector('[data-role="jsonStatus"]'),
      progress: panel.querySelector('[data-role="progress"]'),
      scanBtn: panel.querySelector('[data-role="scanBtn"]'),
      results: panel.querySelector('[data-role="results"]'),
      applyBtn: panel.querySelector('[data-role="applyBtn"]'),
      confirmBox: panel.querySelector('[data-role="confirmBox"]'),
      confirmSummary: panel.querySelector('[data-role="confirmSummary"]'),
      confirmBtn: panel.querySelector('[data-role="confirmBtn"]'),
      cancelConfirmBtn: panel.querySelector('[data-role="cancelConfirmBtn"]'),
      clearBtn: panel.querySelector('[data-role="clearBtn"]'),
    };
  }

  function validateJsonText(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
      return { state: 'empty', message: '' };
    }
    try {
      JSON.parse(text);
      return { state: 'valid', message: 'Valid JSON' };
    } catch (e) {
      const detail = e && e.message ? String(e.message) : 'Invalid JSON';
      return { state: 'invalid', message: detail };
    }
  }

  function updateJsonStatus() {
    const els = getFormElements();
    if (!els?.jsonStatus) return;

    const result = validateJsonText(readJsonText());
    els.jsonStatus.classList.remove(
      'gem-magic-fill-json-status--valid',
      'gem-magic-fill-json-status--invalid'
    );

    if (result.state === 'empty') {
      els.jsonStatus.hidden = true;
      els.jsonStatus.innerHTML = '';
      return;
    }

    els.jsonStatus.hidden = false;
    if (result.state === 'valid') {
      els.jsonStatus.classList.add('gem-magic-fill-json-status--valid');
      els.jsonStatus.innerHTML =
        '<span class="gem-magic-fill-json-status-icon" aria-hidden="true">✓</span>' +
        `<span class="gem-magic-fill-json-status-text">${escapeHtml(result.message)}</span>`;
      return;
    }

    els.jsonStatus.classList.add('gem-magic-fill-json-status--invalid');
    els.jsonStatus.innerHTML =
      '<span class="gem-magic-fill-json-status-icon" aria-hidden="true">✕</span>' +
      `<span class="gem-magic-fill-json-status-text">${escapeHtml(result.message)}</span>`;
  }

  function readJsonText() {
    const els = getFormElements();
    return String(els?.jsonInput?.value || '');
  }

  function setBusy(busy, message = '') {
    operationInFlight = !!busy;
    const els = getFormElements();
    if (!els) return;
    if (els.progress) {
      if (busy && message) {
        els.progress.textContent = message;
        els.progress.hidden = false;
      } else {
        els.progress.textContent = '';
        els.progress.hidden = true;
      }
    }
    if (els.jsonInput) els.jsonInput.disabled = busy;
    if (els.scanBtn) {
      const validation = validateJsonText(readJsonText());
      els.scanBtn.disabled = busy || validation.state !== 'valid';
    }
    if (els.applyBtn) els.applyBtn.disabled = busy || !pendingPlan || pendingPlan.totalReplacements <= 0;
    if (els.clearBtn) els.clearBtn.disabled = busy;
    if (els.confirmBtn) els.confirmBtn.disabled = busy;
    if (els.cancelConfirmBtn) els.cancelConfirmBtn.disabled = busy;
  }

  function syncActionButtonState() {
    const els = getFormElements();
    if (!els) return;
    const validation = validateJsonText(readJsonText());
    const canScan = validation.state === 'valid';
    if (els.scanBtn) els.scanBtn.disabled = operationInFlight || !canScan;
  }

  function clearResults() {
    const els = getFormElements();
    if (!els) return;
    if (els.results) {
      els.results.innerHTML = '';
      els.results.hidden = true;
    }
    if (els.applyBtn) {
      els.applyBtn.hidden = true;
      els.applyBtn.disabled = true;
    }
    hideConfirmBox();
    pendingPlan = null;
    lastScanResult = null;
  }

  function hideConfirmBox() {
    const els = getFormElements();
    if (!els?.confirmBox) return;
    els.confirmBox.hidden = true;
    if (els.confirmSummary) els.confirmSummary.innerHTML = '';
    if (els.applyBtn && lastScanResult) {
      els.applyBtn.hidden = false;
    }
  }

  function readStoredPanelState() {
    try {
      const raw = sessionStorage.getItem(SESSION_STATE_KEY);
      if (!raw) {
        // Migrate prior Merge Fields session key if present.
        const legacy = sessionStorage.getItem('gemMergeFieldsPanelStateV1');
        if (!legacy) return null;
        const parsedLegacy = JSON.parse(legacy);
        return { json: String(parsedLegacy?.json ?? '') };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return { json: String(parsed.json ?? '') };
    } catch (_) {
      return null;
    }
  }

  function persistPanelState() {
    if (!isMagicFillActive()) return;
    try {
      sessionStorage.setItem(
        SESSION_STATE_KEY,
        JSON.stringify({ version: 1, json: readJsonText() })
      );
    } catch (_) {}
  }

  function persistPanelStateDebounced() {
    clearTimeout(persistPanelStateTimer);
    persistPanelStateTimer = setTimeout(persistPanelState, 250);
  }

  function clearStoredPanelState() {
    try {
      sessionStorage.removeItem(SESSION_STATE_KEY);
      sessionStorage.removeItem('gemMergeFieldsPanelStateV1');
    } catch (_) {}
  }

  function restorePanelStateFromStorage() {
    const stored = readStoredPanelState();
    const els = getFormElements();
    if (stored && els?.jsonInput) {
      els.jsonInput.value = stored.json;
    }
    updateJsonStatus();
    syncActionButtonState();
  }

  function resetFormState() {
    const els = getFormElements();
    if (els?.jsonInput) els.jsonInput.value = '';
    clearResults();
    clearStoredPanelState();
    updateJsonStatus();
    syncActionButtonState();
  }

  function countMatchesInScope(text, matcher, utils) {
    if (!matcher || matcher.error) return 0;
    return utils.countMatchesInString(String(text ?? ''), matcher);
  }

  function scanKeyAcrossCampaign(key, value, utils, subjectInput, previewTextarea, previewDoc) {
    const matcher = mfDom().buildMagicFillMatcher(key);
    if (!matcher || matcher.error) {
      return {
        key,
        value,
        counts: { subject: 0, preview: 0, body: 0 },
        total: 0,
        error: matcher?.error || 'Could not build matcher.',
      };
    }

    const counts = { subject: 0, preview: 0, body: 0 };

    if (subjectInput) {
      counts.subject = countMatchesInScope(getSubjectLineText(subjectInput), matcher, utils);
    }
    if (previewTextarea) {
      counts.preview = countMatchesInScope(previewTextarea.value, matcher, utils);
    }
    if (previewDoc) {
      const bodyResult = utils.scanEmailBody(previewDoc, matcher, { simulateOnly: true });
      counts.body = bodyResult.count || 0;
    }

    return {
      key,
      value,
      counts,
      total: counts.subject + counts.preview + counts.body,
    };
  }

  async function switchToLanguage(campaignValue) {
    const value = String(campaignValue || '').trim();
    mfLog('switchToLanguage: requested', value);
    if (!value) return { ok: false, error: 'Missing language value.' };

    const current =
      (typeof window.gemGetSelectedLanguageValue === 'function'
        ? window.gemGetSelectedLanguageValue()
        : mfDom()?.getSelectedLanguageValue?.()) || null;

    mfLog('switchToLanguage: current selected =', current);

    if (String(current || '') === value) {
      mfLog('switchToLanguage: already on target, no switch');
      captureEditorSnapshot(`already-on:${value}`);
      return { ok: true, switched: false };
    }

    if (typeof window.gemSelectLanguageByValue !== 'function') {
      mfWarn('switchToLanguage: gemSelectLanguageByValue unavailable');
      return { ok: false, error: 'Language switching is unavailable on this page.' };
    }

    const beforeSnap = captureEditorSnapshot(`before-switch-from:${current}-to:${value}`);
    const previousContent =
      typeof window.gemGetEditorPreviewContent === 'function'
        ? window.gemGetEditorPreviewContent()
        : '';

    mfLog('switchToLanguage: calling gemSelectLanguageByValue', {
      value,
      previousContentHash: mfHash(previousContent),
      previousContentLen: String(previousContent || '').length,
    });

    const selected = await window.gemSelectLanguageByValue(value);
    mfLog('switchToLanguage: gemSelectLanguageByValue returned', selected);
    if (!selected) {
      return { ok: false, error: `Could not switch to language "${value}".` };
    }

    const afterSelectLang =
      (typeof window.gemGetSelectedLanguageValue === 'function'
        ? window.gemGetSelectedLanguageValue()
        : null) || null;
    mfLog('switchToLanguage: selected language after select call =', afterSelectLang);

    if (typeof window.gemWaitForEditorPreviewReady === 'function') {
      try {
        mfLog('switchToLanguage: waiting for preview ready…');
        await window.gemWaitForEditorPreviewReady(value, previousContent, true);
        mfLog('switchToLanguage: preview ready resolved');
      } catch (e) {
        // Timed out / identical settle — still attempt scan/apply on whatever loaded.
        mfWarn('switchToLanguage: preview settle warning:', e && e.message ? e.message : e);
      }
    } else {
      mfWarn('switchToLanguage: gemWaitForEditorPreviewReady unavailable; sleeping 600ms');
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    const afterSnap = captureEditorSnapshot(`after-switch-to:${value}`);
    mfLog('switchToLanguage: content changed?', {
      subjectChanged: beforeSnap.subject.hash !== afterSnap.subject.hash,
      previewChanged: beforeSnap.preview.hash !== afterSnap.preview.hash,
      bodyChanged: beforeSnap.body.textHash !== afterSnap.body.textHash,
      containerChanged: beforeSnap.containerContent.hash !== afterSnap.containerContent.hash,
    });

    return { ok: true, switched: true };
  }

  function scanJobOnCurrentEditor(job) {
    const utils = frDom();
    const subjectInput = getSubjectLineInput();
    const previewTextarea = document.querySelector('cb-preheader textarea');
    const previewDoc = getPreviewDocument();

    const subjectText = subjectInput ? getSubjectLineText(subjectInput) : '';
    const previewText = previewTextarea ? previewTextarea.value : '';

    const placeholders = mfDom().collectPlaceholdersInScopes({
      subjectText,
      previewText,
      previewDoc,
    });

    const perKey = [];
    Object.keys(job.fields || {}).forEach((key) => {
      perKey.push(
        scanKeyAcrossCampaign(key, job.fields[key], utils, subjectInput, previewTextarea, previewDoc)
      );
    });

    const matchedKeys = perKey.filter((item) => item.total > 0);
    const unmatchedJsonKeys = perKey.filter((item) => item.total === 0).map((item) => item.key);
    const orphanPlaceholders = [];
    placeholders.forEach((displayKey, lower) => {
      if (!job.byLower.has(lower)) orphanPlaceholders.push(displayKey);
    });

    const totalReplacements = matchedKeys.reduce((sum, item) => sum + item.total, 0);

    return {
      jsonKey: job.jsonKey,
      campaignValue: job.campaignValue,
      label: job.label,
      perKey,
      matchedKeys,
      unmatchedJsonKeys,
      orphanPlaceholders,
      totalReplacements,
      skipped: job.skipped || [],
      duplicateKeys: job.duplicateKeys || [],
      availability: {
        subject: subjectInput ? 'ok' : 'missing',
        preview: previewTextarea ? 'ok' : 'missing',
        body: previewDoc ? 'ok' : 'unavailable',
      },
      error: null,
    };
  }

  async function buildScanPlan(payload) {
    const utils = frDom();
    if (!utils || !mfDom()) {
      return { ok: false, error: 'Magic Fill helpers are not loaded.' };
    }

    const originalLanguage =
      (typeof window.gemGetSelectedLanguageValue === 'function'
        ? window.gemGetSelectedLanguageValue()
        : mfDom().getSelectedLanguageValue()) || null;

    const languageResults = [];
    const jobs = payload.jobs || [];

    try {
      for (let i = 0; i < jobs.length; i += 1) {
        const job = jobs[i];
        const label = job.label || job.campaignValue || job.jsonKey || 'language';
        setBusy(true, `Scanning ${label} (${i + 1}/${jobs.length})…`);

        if (payload.isNested && job.campaignValue) {
          const switched = await switchToLanguage(job.campaignValue);
          if (!switched.ok) {
            languageResults.push({
              jsonKey: job.jsonKey,
              campaignValue: job.campaignValue,
              label,
              perKey: [],
              matchedKeys: [],
              unmatchedJsonKeys: Object.keys(job.fields || {}),
              orphanPlaceholders: [],
              totalReplacements: 0,
              skipped: job.skipped || [],
              duplicateKeys: job.duplicateKeys || [],
              availability: { subject: 'unavailable', preview: 'unavailable', body: 'unavailable' },
              error: switched.error,
            });
            continue;
          }
        }

        languageResults.push(scanJobOnCurrentEditor(job));
      }
    } finally {
      if (payload.isNested && originalLanguage) {
        setBusy(true, 'Restoring original language…');
        await switchToLanguage(originalLanguage);
      }
    }

    const totalReplacements = languageResults.reduce((sum, lang) => sum + (lang.totalReplacements || 0), 0);
    const languagesWithMatches = languageResults.filter((lang) => lang.totalReplacements > 0);
    const languagesWithZeroMatches = languageResults.filter(
      (lang) => !lang.error && lang.totalReplacements === 0
    );
    const languagesWithErrors = languageResults.filter((lang) => !!lang.error);

    const hasFieldMismatches = languageResults.some(
      (lang) => lang.unmatchedJsonKeys.length > 0 || lang.orphanPlaceholders.length > 0
    );
    const hasMismatches =
      hasFieldMismatches ||
      (payload.unmatchedJsonLanguages || []).length > 0 ||
      languagesWithZeroMatches.length > 0 ||
      languagesWithErrors.length > 0;

    return {
      ok: true,
      payload,
      isNested: payload.isNested,
      unmatchedJsonLanguages: payload.unmatchedJsonLanguages || [],
      languageResults,
      languagesWithMatches,
      languagesWithZeroMatches,
      languagesWithErrors,
      totalReplacements,
      hasMismatches,
      originalLanguage,
    };
  }

  // Apply one find/replace matcher using the same subject/preview/body + dirty
  // sequence as find-replace-panel.js scanCampaign(..., { mode: 'apply' }).
  async function applyMatcherLikeFindReplace(utils, matcher, replacement, options = {}) {
    if (!utils || !matcher || matcher.error) {
      return { total: 0, writeLog: [], touchedBody: [] };
    }

    const { skipBodyPrime = false } = options;

    let total = 0;
    const writeLog = [];
    const touchedBody = [];

    const subjectInput = document.querySelector(
      'cb-personalizable-input-with-context#subject-line-input'
    );
    if (subjectInput) {
      const current = getSubjectLineText(subjectInput);
      const result = utils.processHtmlOrTextContent(current, matcher, {
        replacement,
        context: 'Subject line',
      });
      mfLog('applyMatcherLikeFindReplace: subject', {
        matchCount: result.count,
        beforeSnippet: mfSnippet(current),
        afterSnippet: mfSnippet(result.text),
      });
      if (result.count > 0) {
        setSubjectLineContent(subjectInput, result.text);
        total += result.count;
        const cmEl = subjectInput.querySelector('vce-codemirror .CodeMirror');
        if (typeof window.gemMarkEmarsysTextControlDirty === 'function') {
          const textarea = cmEl?.querySelector('textarea');
          if (textarea) {
            window.gemMarkEmarsysTextControlDirty(textarea);
            writeLog.push({ scope: 'subject', dirty: 'gemMarkEmarsysTextControlDirty' });
          }
        }
      }
    }

    const previewTextarea = document.querySelector('cb-preheader textarea');
    if (previewTextarea) {
      const result = utils.processHtmlOrTextContent(previewTextarea.value, matcher, {
        replacement,
        context: 'Preview text',
      });
      mfLog('applyMatcherLikeFindReplace: preview', {
        matchCount: result.count,
        beforeSnippet: mfSnippet(previewTextarea.value),
        afterSnippet: mfSnippet(result.text),
      });
      if (result.count > 0) {
        previewTextarea.value = result.text;
        total += result.count;
        if (typeof window.gemMarkEmarsysTextControlDirty === 'function') {
          window.gemMarkEmarsysTextControlDirty(previewTextarea);
          writeLog.push({ scope: 'preview', dirty: 'gemMarkEmarsysTextControlDirty' });
        } else {
          previewTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          previewTextarea.dispatchEvent(new Event('change', { bubbles: true }));
          writeLog.push({ scope: 'preview', dirty: 'native-input-change' });
        }
      }
    }

    const previewDoc = getPreviewDocument();
    if (previewDoc) {
      if (!skipBodyPrime && typeof utils.primeEmarsysEditablesInDoc === 'function') {
        try {
          const primeResult = await utils.primeEmarsysEditablesInDoc(previewDoc, {
            filter: (el) => String(el.textContent || '').trim().length > 0,
            release: false,
          });
          mfLog('applyMatcherLikeFindReplace: primed editables', primeResult);
        } catch (e) {
          mfWarn(
            'applyMatcherLikeFindReplace: prime failed',
            e && e.message ? e.message : e
          );
        }
      }

      const result = utils.scanEmailBody(previewDoc, matcher, { replacement });
      mfLog('applyMatcherLikeFindReplace: body', {
        matchCount: result.count,
        touched: (result.touched || []).map(mfDescribeNode),
      });
      if (result.count > 0) {
        total += result.count;
        (result.touched || []).forEach((el) => touchedBody.push(el));
        // Same as Find & Replace: mark dirty immediately after this matcher’s body writes.
        utils.markEmailBodyDirty(previewDoc, result.touched);
        writeLog.push({
          scope: 'body',
          dirty: 'markEmailBodyDirty',
          touched: (result.touched || []).map(mfDescribeNode),
        });
      }
    } else {
      mfWarn('applyMatcherLikeFindReplace: previewDoc unavailable');
    }

    return { total, writeLog, touchedBody };
  }

  async function applyJobOnCurrentEditor(job) {
    const utils = frDom();
    if (!utils || !job?.fields) {
      mfWarn('applyJobOnCurrentEditor: missing utils or fields', {
        hasUtils: !!utils,
        job,
      });
      return { total: 0 };
    }

    const label = job.label || job.campaignValue || job.jsonKey || 'language';
    mfLog('applyJobOnCurrentEditor: start (Find & Replace–aligned path)', {
      label,
      campaignValue: job.campaignValue,
      jsonKey: job.jsonKey,
      fieldKeys: Object.keys(job.fields),
    });

    const beforeSnap = captureEditorSnapshot(`apply-before:${label}`);
    let total = 0;
    const writeLog = [];

    // Prime once for the whole job (all [[keys]]), then apply each matcher.
    const previewDoc = getPreviewDocument();
    if (previewDoc && typeof utils.primeEmarsysEditablesInDoc === 'function') {
      try {
        const primeResult = await utils.primeEmarsysEditablesInDoc(previewDoc, {
          filter: (el) => String(el.textContent || '').trim().length > 0,
          release: false,
        });
        mfLog('applyJobOnCurrentEditor: primed editables', primeResult);
      } catch (e) {
        mfWarn(
          'applyJobOnCurrentEditor: prime failed',
          e && e.message ? e.message : e
        );
      }
    }

    for (const key of Object.keys(job.fields)) {
      const value = job.fields[key];
      const matcher = mfDom().buildMagicFillMatcher(key);
      if (!matcher || matcher.error) {
        mfWarn('applyJobOnCurrentEditor: matcher failed for key', key, matcher?.error);
        continue;
      }

      mfLog('applyJobOnCurrentEditor: applying key like Find & Replace', {
        key,
        placeholder: `[[${key}]]`,
        valueSnippet: mfSnippet(value),
      });

      const applied = await applyMatcherLikeFindReplace(utils, matcher, value, {
        skipBodyPrime: true,
      });
      total += applied.total || 0;
      (applied.writeLog || []).forEach((entry) => {
        writeLog.push({ key, ...entry });
      });
    }

    const afterSnap = captureEditorSnapshot(`apply-after:${label}`);
    mfLog('applyJobOnCurrentEditor: done', {
      label,
      total,
      writeLog,
      subjectChanged: beforeSnap.subject.hash !== afterSnap.subject.hash,
      previewChanged: beforeSnap.preview.hash !== afterSnap.preview.hash,
      bodyChanged: beforeSnap.body.textHash !== afterSnap.body.textHash,
      containerChanged: beforeSnap.containerContent.hash !== afterSnap.containerContent.hash,
    });

    return { total, writeLog, beforeSnap, afterSnap };
  }

  // Focused rewrite + blur + release + surgical sync takes ~120ms+.
  function waitForDirtyNudgeToSettle() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 280);
      });
    });
  }

  async function applyPlan(plan) {
    const payload = plan?.payload;
    if (!payload?.jobs?.length) {
      mfWarn('applyPlan: no jobs');
      return { total: 0, languageTotals: [] };
    }

    const originalLanguage =
      plan.originalLanguage ||
      (typeof window.gemGetSelectedLanguageValue === 'function'
        ? window.gemGetSelectedLanguageValue()
        : mfDom().getSelectedLanguageValue()) ||
      null;

    mfLog('applyPlan: start', {
      isNested: payload.isNested,
      originalLanguage,
      jobCount: payload.jobs.length,
      jobs: payload.jobs.map((j) => ({
        jsonKey: j.jsonKey,
        campaignValue: j.campaignValue,
        label: j.label,
        fieldKeys: Object.keys(j.fields || {}),
      })),
    });
    captureEditorSnapshot('applyPlan-start');

    let total = 0;
    const languageTotals = [];

    try {
      for (let i = 0; i < payload.jobs.length; i += 1) {
        const job = payload.jobs[i];
        const label = job.label || job.campaignValue || job.jsonKey || 'language';
        setBusy(true, `Applying ${label} (${i + 1}/${payload.jobs.length})…`);
        mfLog(`applyPlan: job ${i + 1}/${payload.jobs.length}`, {
          label,
          campaignValue: job.campaignValue,
        });

        if (payload.isNested && job.campaignValue) {
          const switched = await switchToLanguage(job.campaignValue);
          mfLog('applyPlan: switch result', switched);
          if (!switched.ok) {
            languageTotals.push({
              label,
              campaignValue: job.campaignValue,
              total: 0,
              error: switched.error,
            });
            continue;
          }
        }

        const applied = await applyJobOnCurrentEditor(job);
        total += applied.total || 0;
        languageTotals.push({
          label,
          campaignValue: job.campaignValue,
          total: applied.total || 0,
          error: null,
          writeLog: applied.writeLog || [],
        });

        mfLog('applyPlan: waiting for Find & Replace–style dirty nudge to settle');
        await waitForDirtyNudgeToSettle();
      }
    } finally {
      if (payload.isNested && originalLanguage) {
        setBusy(true, 'Restoring original language…');
        mfLog('applyPlan: restoring original language', originalLanguage);
        // Extra settle so the last language’s dirty nudge isn’t cut off by the switch.
        await waitForDirtyNudgeToSettle();
        const restore = await switchToLanguage(originalLanguage);
        mfLog('applyPlan: restore result', restore);
        captureEditorSnapshot('applyPlan-after-restore');
      } else {
        captureEditorSnapshot('applyPlan-end-no-restore');
      }
    }

    mfLog('applyPlan: complete', { total, languageTotals });
    return { total, languageTotals };
  }

  function renderScanResults(plan) {
    const els = getFormElements();
    if (!els?.results || !plan) return;

    let html = '';

    if (plan.isNested) {
      html += `<div class="gem-magic-fill-meta">Language-nested JSON — scanned <strong>${plan.languageResults.length}</strong> matching campaign language${plan.languageResults.length === 1 ? '' : 's'}.</div>`;
    }

    if ((plan.unmatchedJsonLanguages || []).length) {
      html += '<div class="gem-magic-fill-section-title gem-magic-fill-section-title--warn">JSON languages not on this campaign</div><ul class="gem-magic-fill-list">';
      plan.unmatchedJsonLanguages.forEach((key) => {
        html += `<li><code>${escapeHtml(key)}</code></li>`;
      });
      html += '</ul>';
    }

    html += `<div class="gem-magic-fill-summary">Found <strong>${plan.totalReplacements}</strong> placeholder replacement${plan.totalReplacements === 1 ? '' : 's'} across <strong>${plan.languagesWithMatches.length}</strong> language${plan.languagesWithMatches.length === 1 ? '' : 's'}.</div>`;

    plan.languageResults.forEach((lang) => {
      const title = lang.label || lang.campaignValue || lang.jsonKey || 'Language';
      html += `<div class="gem-magic-fill-lang-block">`;
      html += `<div class="gem-magic-fill-section-title">${escapeHtml(title)}${lang.jsonKey && lang.jsonKey !== lang.campaignValue ? ` <span class="gem-magic-fill-muted">(${escapeHtml(lang.jsonKey)})</span>` : ''}</div>`;

      if (lang.error) {
        html += `<div class="gem-magic-fill-warn">${escapeHtml(lang.error)}</div></div>`;
        return;
      }

      if (lang.availability.subject === 'missing') {
        html += '<div class="gem-magic-fill-warn">Subject line field not found.</div>';
      }
      if (lang.availability.preview === 'missing') {
        html += '<div class="gem-magic-fill-warn">Preview text field not found.</div>';
      }
      if (lang.availability.body === 'unavailable') {
        html += '<div class="gem-magic-fill-warn">Email body — preview not loaded.</div>';
      }

      if (lang.skipped.length) {
        html += `<div class="gem-magic-fill-warn">Skipped non-text keys: ${lang.skipped.map((k) => `<code>${escapeHtml(k)}</code>`).join(', ')}</div>`;
      }
      if (lang.duplicateKeys.length) {
        html += `<div class="gem-magic-fill-warn">Ignored case-duplicate keys: ${lang.duplicateKeys.map((k) => `<code>${escapeHtml(k)}</code>`).join(', ')}</div>`;
      }

      html += `<div class="gem-magic-fill-muted">${lang.totalReplacements} replacement${lang.totalReplacements === 1 ? '' : 's'}</div>`;

      if (lang.matchedKeys.length) {
        html += '<ul class="gem-magic-fill-list">';
        lang.matchedKeys.forEach((item) => {
          const parts = [];
          if (item.counts.subject) parts.push(`${item.counts.subject} in subject`);
          if (item.counts.preview) parts.push(`${item.counts.preview} in preview`);
          if (item.counts.body) parts.push(`${item.counts.body} in body`);
          html += `<li><code>[[${escapeHtml(item.key)}]]</code> → ${escapeHtml(item.value)} <span class="gem-magic-fill-muted">(${parts.join(', ')})</span></li>`;
        });
        html += '</ul>';
      }

      if (lang.unmatchedJsonKeys.length) {
        html += '<div class="gem-magic-fill-warn">JSON keys with no matching placeholder:</div><ul class="gem-magic-fill-list">';
        lang.unmatchedJsonKeys.forEach((key) => {
          html += `<li><code>[[${escapeHtml(key)}]]</code></li>`;
        });
        html += '</ul>';
      }

      if (lang.orphanPlaceholders.length) {
        html += '<div class="gem-magic-fill-warn">Placeholders in email with no JSON key:</div><ul class="gem-magic-fill-list">';
        lang.orphanPlaceholders.forEach((key) => {
          html += `<li><code>[[${escapeHtml(key)}]]</code></li>`;
        });
        html += '</ul>';
      }

      if (!lang.matchedKeys.length && !lang.unmatchedJsonKeys.length && !lang.orphanPlaceholders.length) {
        html += '<div class="gem-magic-fill-warn">No matching placeholders for this language.</div>';
      }

      html += '</div>';
    });

    if (plan.hasMismatches) {
      html += '<div class="gem-magic-fill-warn gem-magic-fill-warn--block">Mismatches found. Review above, then confirm to apply anyway.</div>';
    }

    els.results.innerHTML = html;
    els.results.hidden = false;

    if (els.applyBtn) {
      const canApply = plan.totalReplacements > 0;
      els.applyBtn.hidden = !canApply;
      els.applyBtn.disabled = !canApply;
      els.applyBtn.textContent = plan.hasMismatches
        ? `Review & apply ${plan.totalReplacements} replacement${plan.totalReplacements === 1 ? '' : 's'}`
        : `Apply ${plan.totalReplacements} replacement${plan.totalReplacements === 1 ? '' : 's'}`;
    }

    lastScanResult = plan;
    pendingPlan = plan;
  }

  async function runScan() {
    if (operationInFlight) return;
    hideConfirmBox();
    clearResults();

    const resolved = mfDom()?.resolvePayload(readJsonText());
    if (!resolved || !resolved.ok) {
      window.gemShowToast &&
        window.gemShowToast(resolved?.error || 'Could not parse JSON.', {
          type: 'error',
          duration: 3500,
        });
      return;
    }

    setBusy(true, resolved.isNested ? 'Preparing language scan…' : 'Scanning…');
    try {
      const plan = await buildScanPlan(resolved);
      if (!plan.ok) {
        window.gemShowToast &&
          window.gemShowToast(plan.error || 'Scan failed.', { type: 'error', duration: 3500 });
        return;
      }

      renderScanResults(plan);
      persistPanelState();

      if (plan.totalReplacements === 0) {
        window.gemShowToast &&
          window.gemShowToast('No matching [[placeholders]] found for these keys.', {
            type: 'info',
            duration: 3000,
          });
      }
    } finally {
      setBusy(false);
      syncActionButtonState();
    }
  }

  function showConfirmIfNeeded() {
    if (!pendingPlan || operationInFlight) return;
    const plan = pendingPlan;

    if (!plan.hasMismatches) {
      void runApply();
      return;
    }

    const els = getFormElements();
    if (!els?.confirmBox) return;

    const parts = [];
    if ((plan.unmatchedJsonLanguages || []).length) {
      parts.push(
        `${plan.unmatchedJsonLanguages.length} JSON language${plan.unmatchedJsonLanguages.length === 1 ? '' : 's'} not on this campaign`
      );
    }
    if (plan.languagesWithZeroMatches.length) {
      parts.push(
        `${plan.languagesWithZeroMatches.length} language${plan.languagesWithZeroMatches.length === 1 ? '' : 's'} with no matching placeholders`
      );
    }
    if (plan.languagesWithErrors.length) {
      parts.push(
        `${plan.languagesWithErrors.length} language${plan.languagesWithErrors.length === 1 ? '' : 's'} failed to load`
      );
    }
    const fieldMismatchLangs = plan.languageResults.filter(
      (lang) => lang.unmatchedJsonKeys.length || lang.orphanPlaceholders.length
    ).length;
    if (fieldMismatchLangs) {
      parts.push(`${fieldMismatchLangs} language${fieldMismatchLangs === 1 ? '' : 's'} with key/placeholder mismatches`);
    }

    els.confirmSummary.innerHTML = `Apply ${plan.totalReplacements} replacement${plan.totalReplacements === 1 ? '' : 's'} anyway? (${parts.join('; ')}.)`;
    els.confirmBox.hidden = false;
    if (els.applyBtn) els.applyBtn.hidden = true;
  }

  async function runApply() {
    if (!pendingPlan || pendingPlan.totalReplacements <= 0 || operationInFlight) return;

    setBusy(true, pendingPlan.isNested ? 'Applying across languages…' : 'Applying…');
    try {
      const applied = await applyPlan(pendingPlan);
      const total = applied.total || 0;
      hideConfirmBox();
      clearResults();

      window.gemShowToast &&
        window.gemShowToast(`Applied ${total} Magic Fill replacement${total === 1 ? '' : 's'}.`, {
          type: 'success',
          duration: 3000,
        });
      persistPanelState();
    } finally {
      setBusy(false);
      syncActionButtonState();
    }
  }

  function bindPanelHandlers() {
    const els = getFormElements();
    if (!els || panelHandlersBound) return;
    panelHandlersBound = true;

    els.jsonInput.addEventListener('input', () => {
      clearResults();
      updateJsonStatus();
      syncActionButtonState();
      persistPanelStateDebounced();
    });

    els.scanBtn.addEventListener('click', () => {
      void runScan();
    });
    els.applyBtn.addEventListener('click', showConfirmIfNeeded);
    els.confirmBtn.addEventListener('click', () => {
      void runApply();
    });
    els.cancelConfirmBtn.addEventListener('click', hideConfirmBox);
    els.clearBtn.addEventListener('click', resetFormState);
  }

  function deactivateSiblingGemPanels() {
    if (typeof window.gemDeactivateFindReplacePanel === 'function' && window.gemIsFindReplaceActive?.()) {
      window.gemDeactivateFindReplacePanel();
    }
  }

  function activateMagicFillPanel() {
    const navContent = document.querySelector('.e-verticalnav__content');
    const navItem = document.querySelector(`#${TAB_ID} e-verticalnav-item`);
    if (!navContent || !navItem) return;

    deactivateSiblingGemPanels();

    navItem.setAttribute('status', 'active');
    const navItemDiv = navItem.querySelector('.e-verticalnavitem');
    if (navItemDiv) navItemDiv.classList.add('e-verticalnavitem-active');

    hideNonRouterOutletChildren(navContent);

    const existing = navContent.querySelector(PANEL_TAG);
    if (existing) existing.remove();

    navContent.insertAdjacentHTML('afterbegin', createMagicFillPanelHTML());
    panelHandlersBound = false;
    bindPanelHandlers();
    restorePanelStateFromStorage();

    requestAnimationFrame(() => {
      const els = getFormElements();
      els?.jsonInput?.focus();
    });
  }

  function deactivateMagicFillPanel() {
    persistPanelState();

    const navItem = document.querySelector(`#${TAB_ID} e-verticalnav-item`);
    if (navItem) {
      navItem.removeAttribute('status');
      const navItemDiv = navItem.querySelector('.e-verticalnavitem');
      if (navItemDiv) navItemDiv.classList.remove('e-verticalnavitem-active');
    }

    const panel = document.querySelector(PANEL_TAG);
    if (panel) panel.remove();

    const navContent = document.querySelector('.e-verticalnav__content');
    if (navContent) restoreHiddenNavChildren(navContent);

    panelHandlersBound = false;
    pendingPlan = null;
    lastScanResult = null;
    operationInFlight = false;
  }

  function handleMagicFillTabClick(event) {
    event.preventDefault();
    activateMagicFillPanel();
  }

  function setupGlobalTabClickHandler() {
    if (globalTabHandlerBound) return;
    const verticalNav = document.querySelector('e-verticalnav-menu');
    if (!verticalNav) return;

    globalTabHandlerBound = true;
    verticalNav.addEventListener('click', (event) => {
      const clickedTab = event.target.closest('cb-vertical-tab');
      if (!clickedTab) return;
      if (clickedTab.id === TAB_ID) return;
      if (isMagicFillActive()) deactivateMagicFillPanel();
    });
  }

  function addMagicFillTab() {
    const findReplaceTab = document.querySelector('#gem-find-replace-tab');
    const snippetsTab = document.querySelector('#gem-snippets-tab');
    const anchor = findReplaceTab || snippetsTab;
    if (!anchor) return false;

    let tab = document.querySelector(`#${TAB_ID}`);
    if (tab) {
      if (anchor.nextElementSibling !== tab) {
        anchor.insertAdjacentElement('afterend', tab);
      }
      return true;
    }

    // Remove legacy Merge Fields tab if an older build left it behind.
    document.querySelector('#gem-merge-fields-tab')?.remove();

    anchor.insertAdjacentHTML('afterend', createMagicFillTabHTML());
    tab = document.querySelector(`#${TAB_ID}`);
    if (!tab) return false;

    const navItem = tab.querySelector('e-verticalnav-item');
    if (navItem) navItem.addEventListener('click', handleMagicFillTabClick);
    setupGlobalTabClickHandler();
    return true;
  }

  function waitForVerticalNav() {
    if (addMagicFillTab()) return;
    if (typeof gemDomWatchSubscribe === 'function') {
      const unsub = gemDomWatchSubscribe(() => {
        if (addMagicFillTab()) unsub();
      });
    } else {
      const observer = new MutationObserver(() => {
        if (addMagicFillTab()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function initMagicFillPanel() {
    if (!window.gemFindReplaceDom) {
      console.warn('[Gem] magic-fill-panel.js requires find-replace-dom-utils.js');
    }
    if (!window.gemMagicFillDom) {
      console.warn('[Gem] magic-fill-panel.js requires magic-fill-dom-utils.js');
    }

    waitForVerticalNav();

    window.addEventListener('pagehide', () => {
      if (isMagicFillActive()) persistPanelState();
    });
  }

  window.gemDeactivateMagicFillPanel = deactivateMagicFillPanel;
  window.gemActivateMagicFillPanel = activateMagicFillPanel;
  window.gemIsMagicFillActive = isMagicFillActive;
  // Temporary aliases for callers still using the Merge Fields names.
  window.gemDeactivateMergeFieldsPanel = deactivateMagicFillPanel;
  window.gemActivateMergeFieldsPanel = activateMagicFillPanel;
  window.gemIsMergeFieldsActive = isMagicFillActive;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMagicFillPanel);
  } else {
    initMagicFillPanel();
  }
})();
