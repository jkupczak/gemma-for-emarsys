console.log('[Gem] find-replace-panel.js loaded');

(function () {
  'use strict';

  const dom = () => window.gemFindReplaceDom;
  const TAB_ID = 'gem-find-replace-tab';
  const PANEL_TAG = 'gem-find-replace';
  const STORAGE_KEY = 'gemFindReplacePresets';
  const SESSION_STATE_KEY = 'gemFindReplacePanelStateV2';
  const MAX_DISPLAY_LOCATIONS = 40;

  const FIND_REPLACE_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--token-icon-default-text)" aria-hidden="true"><path d="M164-560q14-103 91.5-171.5T440-800q59 0 110.5 22.5T640-716v-84h80v240H480v-80h120q-29-36-69.5-58T440-720q-72 0-127 45.5T244-560h-80Zm620 440L608-296q-36 27-78.5 41.5T440-240q-59 0-110.5-22.5T240-324v84h-80v-240h240v80H280q29 36 69.5 58t90.5 22q72 0 127-45.5T636-480h80q-5 36-18 67.5T664-352l176 176-56 56Z"/></svg>';

  const SCOPE_LABELS = {
    subject: 'the subject line',
    preview: 'the preview text',
    body: 'the email body',
    alt: 'image ALT text',
  };

  const SCOPE_UNAVAILABLE = {
    subject: 'Subject line field not found.',
    preview: 'Preview text field not found.',
    body: 'Email body — preview not loaded.',
    alt: 'Image ALT text — preview not loaded.',
  };

  let savedPresets = [];
  let loadedPresetId = null;
  let lastMatchResults = null;
  let pendingReplacePlan = null;
  let persistPanelStateTimer = null;
  let globalTabHandlerBound = false;
  let panelHandlersBound = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function defaultScopes() {
    return { subject: true, preview: true, body: true, alt: true };
  }

  function normalizeScopes(scopes) {
    const src = scopes && typeof scopes === 'object' ? scopes : {};
    return {
      subject: src.subject !== false,
      preview: src.preview !== false,
      body: src.body !== false,
      alt: src.alt !== false,
    };
  }

  function normalizePreset(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const find = String(raw.find ?? '').trim();
    if (!find) return null;
    return {
      id: String(raw.id || '').trim() || `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      find,
      replace: String(raw.replace ?? ''),
      isRegex: !!raw.isRegex,
      matchCase: !!raw.matchCase,
      wholeWord: !!raw.wholeWord,
      scopes: normalizeScopes(raw.scopes),
    };
  }

  function normalizePresetState(raw) {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    return {
      version: 1,
      items: items.map(normalizePreset).filter(Boolean),
    };
  }

  function normalizeMatchResultsSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const counts = raw.counts;
    if (!counts || typeof counts !== 'object') return null;
    return {
      counts: {
        subject: Number(counts.subject) || 0,
        preview: Number(counts.preview) || 0,
        body: Number(counts.body) || 0,
        alt: Number(counts.alt) || 0,
      },
      availability: normalizeAvailability(raw.availability),
      locations: Array.isArray(raw.locations) ? raw.locations.slice(0, MAX_DISPLAY_LOCATIONS) : [],
      scopes: normalizeScopes(raw.scopes),
    };
  }

  function normalizeAvailability(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      subject: src.subject || 'ok',
      preview: src.preview || 'ok',
      body: src.body || 'ok',
      alt: src.alt || 'ok',
    };
  }

  function normalizeStoredPanelState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      find: String(raw.find ?? ''),
      replace: String(raw.replace ?? ''),
      isRegex: !!raw.isRegex,
      matchCase: !!raw.matchCase,
      wholeWord: !!raw.wholeWord,
      scopes: normalizeScopes(raw.scopes),
      loadedPresetId: raw.loadedPresetId ? String(raw.loadedPresetId) : null,
      matchResults: normalizeMatchResultsSnapshot(raw.matchResults),
    };
  }

  function readStoredPanelState() {
    try {
      const raw = sessionStorage.getItem(SESSION_STATE_KEY);
      if (!raw) return null;
      return normalizeStoredPanelState(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function serializePanelState() {
    const state = readFormState();
    if (!state) return null;
    return {
      version: 2,
      find: state.find,
      replace: state.replace,
      isRegex: state.isRegex,
      matchCase: state.matchCase,
      wholeWord: state.wholeWord,
      scopes: normalizeScopes(state.scopes),
      loadedPresetId: loadedPresetId || null,
      matchResults: lastMatchResults,
    };
  }

  function persistPanelState() {
    if (!isFindReplaceActive()) return;
    const payload = serializePanelState();
    if (!payload) return;
    try {
      sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function persistPanelStateDebounced() {
    clearTimeout(persistPanelStateTimer);
    persistPanelStateTimer = setTimeout(persistPanelState, 250);
  }

  function clearStoredPanelState() {
    try {
      sessionStorage.removeItem(SESSION_STATE_KEY);
    } catch (_) {}
  }

  function restorePanelStateFromStorage() {
    const stored = readStoredPanelState();
    if (!stored) {
      syncActionButtonState();
      return;
    }

    writeFormState(
      {
        find: stored.find,
        replace: stored.replace,
        isRegex: stored.isRegex,
        matchCase: stored.matchCase,
        wholeWord: stored.wholeWord,
        scopes: stored.scopes,
      },
      stored.loadedPresetId
    );

    if (stored.matchResults) {
      renderMatchResults(stored.matchResults);
    }
  }

  function generatePresetId() {
    return `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getPreviewDocument() {
    return dom()?.getPreviewDocument?.() || null;
  }

  function hideNonRouterOutletChildren(navContent) {
    Array.from(navContent.children).forEach((child) => {
      if (child.tagName === 'ROUTER-OUTLET') return;
      if (child.tagName === 'GEM-FIND-REPLACE') return;
      if (child.dataset && child.dataset.gemHiddenByFindReplace === 'true') return;
      if (child.dataset) {
        child.dataset.gemHiddenByFindReplace = 'true';
        child.dataset.gemFindReplacePrevDisplay = child.style.display || '';
      }
      child.style.display = 'none';
    });
  }

  function restoreHiddenNavChildren(navContent) {
    navContent.querySelectorAll('[data-gem-hidden-by-find-replace="true"]').forEach((el) => {
      const prev = el.dataset ? el.dataset.gemFindReplacePrevDisplay || '' : '';
      el.style.display = prev;
      if (el.dataset) {
        delete el.dataset.gemHiddenByFindReplace;
        delete el.dataset.gemFindReplacePrevDisplay;
      }
    });
  }

  function isFindReplaceActive() {
    return !!document.querySelector(PANEL_TAG);
  }

  function createFindReplaceTabHTML() {
    return `
<cb-vertical-tab id="${TAB_ID}" value="tooltips.findReplace" icon="find-replace">
  <e-verticalnav-item class="gem-e-verticalnav-item">
    <div class="e-verticalnavitem">
      <e-tooltip placement="right" content="Find and Replace" role="tooltip" aria-description="Find and Replace">
        <div class="e-verticalnavitem__icon e-svgclickfix">
          <gem-e-icon icon="gem-find-replace">
            <div aria-hidden="true" class="e-icon-wrapper">
              <div class="e-icon">${FIND_REPLACE_ICON_SVG}</div>
            </div>
          </gem-e-icon>
        </div>
      </e-tooltip>
      <div class="e-verticalnavitem__value">Find and Replace</div>
    </div>
  </e-verticalnav-item>
</cb-vertical-tab>
    `.trim();
  }

  function createFindReplacePanelHTML() {
    return `
<${PANEL_TAG} class="scrollable gem-find-replace-panel">
  <div class="e-section">
    <div class="e-section__header">
      <div class="e-section__title">Find and Replace</div>
    </div>
    <div class="e-section__content">
      <div class="gem-find-replace-field e-margin-bottom-s">
        <label class="gem-find-replace-label" for="gem-find-replace-find">Find</label>
        <div class="gem-settings-input-wrap">
          <input id="gem-find-replace-find" class="e-input gem-find-replace-find" type="text" autocomplete="off" spellcheck="false" />
        </div>
        <div class="gem-find-replace-options">
          <button type="button" class="gem-find-replace-option-toggle" data-role="findRegexToggle" aria-pressed="false">
            <span class="gem-find-replace-option-icon" aria-hidden="true">.*</span>
            <span class="gem-find-replace-option-label">Regular expression</span>
          </button>
          <button type="button" class="gem-find-replace-option-toggle" data-role="matchCaseToggle" aria-pressed="false">
            <span class="gem-find-replace-option-icon" aria-hidden="true">Aa</span>
            <span class="gem-find-replace-option-label">Match case</span>
          </button>
          <button type="button" class="gem-find-replace-option-toggle" data-role="wholeWordToggle" aria-pressed="false">
            <span class="gem-find-replace-option-icon" aria-hidden="true">ab</span>
            <span class="gem-find-replace-option-label">Whole word</span>
          </button>
        </div>
      </div>
      <div class="gem-find-replace-field e-margin-bottom-s">
        <label class="gem-find-replace-label" for="gem-find-replace-replace">Replace with</label>
        <input id="gem-find-replace-replace" class="e-input gem-find-replace-replace" type="text" autocomplete="off" spellcheck="false" />
      </div>
      <fieldset class="gem-find-replace-scopes e-margin-bottom-s">
        <legend class="gem-find-replace-label">Search in</legend>
        <label class="gem-find-replace-scope"><input type="checkbox" data-scope="subject" checked /> Subject Line</label>
        <label class="gem-find-replace-scope"><input type="checkbox" data-scope="preview" checked /> Preview Text</label>
        <label class="gem-find-replace-scope"><input type="checkbox" data-scope="body" checked /> Email Body</label>
        <label class="gem-find-replace-scope"><input type="checkbox" data-scope="alt" checked /> Image ALT Text</label>
      </fieldset>
      <button type="button" class="e-btn gem-find-replace-find-matches" data-role="findMatchesBtn" disabled>Find Matches</button>
      <div class="gem-find-replace-match-results" data-role="matchResults" hidden></div>
      <button type="button" class="e-btn e-btn-primary gem-find-replace-apply e-margin-top-s" data-role="applyBtn" disabled>Find and Replace</button>
      <div class="gem-find-replace-replace-preview" data-role="replacePreview" hidden>
        <div class="gem-find-replace-label gem-find-replace-replace-preview-title">Replace preview</div>
        <div class="gem-find-replace-replace-preview-list" data-role="replacePreviewList"></div>
        <div class="gem-find-replace-replace-preview-actions">
          <button type="button" class="e-btn e-btn-primary gem-find-replace-confirm-replace" data-role="confirmReplaceBtn">Replace</button>
          <button type="button" class="e-btn gem-find-replace-cancel-replace" data-role="cancelReplaceBtn">Cancel</button>
        </div>
      </div>
      <div class="gem-find-replace-actions e-margin-top-s">
        <button type="button" class="e-btn gem-find-replace-save" data-role="saveBtn">Save</button>
        <button type="button" class="e-btn gem-find-replace-clear" data-role="clearBtn">Clear</button>
      </div>
      <div class="gem-find-replace-saved-section e-margin-top-m">
        <div class="gem-find-replace-label gem-find-replace-saved-title">Saved</div>
        <div class="gem-find-replace-saved-list" data-role="savedList">
          <div class="gem-find-replace-saved-empty">No saved find and replace presets yet.</div>
        </div>
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
      findInput: panel.querySelector('#gem-find-replace-find'),
      replaceInput: panel.querySelector('#gem-find-replace-replace'),
      regexToggle: panel.querySelector('[data-role="findRegexToggle"]'),
      matchCaseToggle: panel.querySelector('[data-role="matchCaseToggle"]'),
      wholeWordToggle: panel.querySelector('[data-role="wholeWordToggle"]'),
      scopeInputs: panel.querySelectorAll('[data-scope]'),
      findMatchesBtn: panel.querySelector('[data-role="findMatchesBtn"]'),
      matchResults: panel.querySelector('[data-role="matchResults"]'),
      applyBtn: panel.querySelector('[data-role="applyBtn"]'),
      replacePreview: panel.querySelector('[data-role="replacePreview"]'),
      replacePreviewList: panel.querySelector('[data-role="replacePreviewList"]'),
      confirmReplaceBtn: panel.querySelector('[data-role="confirmReplaceBtn"]'),
      cancelReplaceBtn: panel.querySelector('[data-role="cancelReplaceBtn"]'),
      saveBtn: panel.querySelector('[data-role="saveBtn"]'),
      clearBtn: panel.querySelector('[data-role="clearBtn"]'),
      savedList: panel.querySelector('[data-role="savedList"]'),
    };
  }

  function readFormState() {
    const els = getFormElements();
    if (!els) return null;
    const scopes = defaultScopes();
    els.scopeInputs.forEach((input) => {
      const key = input.getAttribute('data-scope');
      if (key && Object.prototype.hasOwnProperty.call(scopes, key)) {
        scopes[key] = !!input.checked;
      }
    });
    return {
      find: String(els.findInput.value || ''),
      replace: String(els.replaceInput.value || ''),
      isRegex: els.regexToggle.classList.contains('gem-find-replace-option-toggle--active'),
      matchCase: els.matchCaseToggle.classList.contains('gem-find-replace-option-toggle--active'),
      wholeWord: els.wholeWordToggle.classList.contains('gem-find-replace-option-toggle--active'),
      scopes,
    };
  }

  function setOptionToggleState(button, active) {
    if (!button) return;
    button.classList.toggle('gem-find-replace-option-toggle--active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function writeFormState(state, presetId = null) {
    const els = getFormElements();
    if (!els || !state) return;
    els.findInput.value = state.find ?? '';
    els.replaceInput.value = state.replace ?? '';
    setOptionToggleState(els.regexToggle, !!state.isRegex);
    setOptionToggleState(els.matchCaseToggle, !!state.matchCase);
    setOptionToggleState(els.wholeWordToggle, !!state.wholeWord);
    const scopes = normalizeScopes(state.scopes);
    els.scopeInputs.forEach((input) => {
      const key = input.getAttribute('data-scope');
      if (key && Object.prototype.hasOwnProperty.call(scopes, key)) {
        input.checked = scopes[key];
      }
    });
    loadedPresetId = presetId;
    syncWholeWordState();
    syncActionButtonState();
    renderSavedPresetsList();
  }

  function syncWholeWordState() {
    const els = getFormElements();
    if (!els?.wholeWordToggle) return;
    const isRegex = els.regexToggle.classList.contains('gem-find-replace-option-toggle--active');
    els.wholeWordToggle.disabled = isRegex;
    if (isRegex) {
      els.wholeWordToggle.classList.remove('gem-find-replace-option-toggle--active');
      els.wholeWordToggle.setAttribute('aria-pressed', 'false');
    }
  }

  function resetFormState() {
    clearMatchResults();
    hideReplacePreview();
    loadedPresetId = null;
    writeFormState(
      {
        find: '',
        replace: '',
        isRegex: false,
        matchCase: false,
        wholeWord: false,
        scopes: defaultScopes(),
      },
      null
    );
    clearStoredPanelState();
  }

  function syncActionButtonState() {
    const els = getFormElements();
    if (!els) return;
    const state = readFormState();
    const hasFind = String(state?.find || '').trim().length > 0;
    const enabledScopes = state ? Object.keys(SCOPE_LABELS).filter((key) => state.scopes[key]) : [];
    const hasScope = enabledScopes.length > 0;
    const disabled = !hasFind || !hasScope;
    if (els.applyBtn) els.applyBtn.disabled = disabled;
    if (els.findMatchesBtn) els.findMatchesBtn.disabled = disabled;
  }

  function clearMatchResults() {
    const els = getFormElements();
    if (!els?.matchResults) return;
    els.matchResults.innerHTML = '';
    els.matchResults.hidden = true;
    lastMatchResults = null;
  }

  function hideReplacePreview() {
    pendingReplacePlan = null;
    const els = getFormElements();
    if (!els?.replacePreview) return;
    els.replacePreview.hidden = true;
    if (els.replacePreviewList) els.replacePreviewList.innerHTML = '';
    if (els.applyBtn) els.applyBtn.hidden = false;
  }

  function formatMatchCount(count) {
    const n = Number(count) || 0;
    return `${n} match${n === 1 ? '' : 'es'}`;
  }

  function renderSnippetHtml(snippet) {
    if (!snippet) return '';
    return `${escapeHtml(snippet.before)}<mark class="gem-find-replace-highlight">${escapeHtml(snippet.match)}</mark>${escapeHtml(snippet.after)}`;
  }

  function renderMatchResults(result) {
    const els = getFormElements();
    if (!els?.matchResults || !result) return;

    const scopes = normalizeScopes(result.scopes);
    const counts = result.counts || {};
    const availability = normalizeAvailability(result.availability);
    const enabledKeys = Object.keys(SCOPE_LABELS).filter((key) => scopes[key]);
    const total = enabledKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);

    let html = `<div class="gem-find-replace-match-results-total">Found ${total} total match${total === 1 ? '' : 'es'}.</div>`;

    if (enabledKeys.length > 1) {
      enabledKeys.forEach((key) => {
        if (availability[key] === 'missing' || availability[key] === 'unavailable') {
          html += `<div class="gem-find-replace-match-results-unavailable">${escapeHtml(SCOPE_UNAVAILABLE[key])}</div>`;
          return;
        }
        const count = counts[key] || 0;
        html += `<div class="gem-find-replace-match-results-scope">Found ${formatMatchCount(count)} in ${SCOPE_LABELS[key]}.</div>`;
      });
    } else if (enabledKeys.length === 1) {
      const key = enabledKeys[0];
      if (availability[key] === 'missing' || availability[key] === 'unavailable') {
        html += `<div class="gem-find-replace-match-results-unavailable">${escapeHtml(SCOPE_UNAVAILABLE[key])}</div>`;
      }
    }

    const locations = Array.isArray(result.locations) ? result.locations : [];
    if (locations.length) {
      html += '<div class="gem-find-replace-match-locations">';
      locations.forEach((loc) => {
        html += `
          <div class="gem-find-replace-match-location">
            <div class="gem-find-replace-match-location-context">${escapeHtml(loc.context || 'Match')}</div>
            <div class="gem-find-replace-match-location-snippet">${renderSnippetHtml(loc.snippet)}</div>
          </div>
        `;
      });
      if (result.hiddenLocationCount > 0) {
        html += `<div class="gem-find-replace-match-location-more">…and ${result.hiddenLocationCount} more.</div>`;
      }
      html += '</div>';
    }

    els.matchResults.innerHTML = html;
    els.matchResults.hidden = false;
    lastMatchResults = {
      counts: { ...counts },
      availability: { ...availability },
      locations: locations.slice(0, MAX_DISPLAY_LOCATIONS),
      hiddenLocationCount: result.hiddenLocationCount || 0,
      scopes,
    };
  }

  function buildMatcherFromState(state) {
    const findTrimmed = state.find.trim();
    if (!findTrimmed) return null;
    return dom().buildMatcher({
      findText: findTrimmed,
      isRegex: state.isRegex,
      matchCase: state.matchCase,
      wholeWord: state.wholeWord && !state.isRegex,
    });
  }

  function getSubjectLineText(subjectInput) {
    const vceCm = subjectInput.querySelector('vce-codemirror');
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : null;
    const cmInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null) ||
      cmEl?.CodeMirror ||
      null;

    if (cmInstance && typeof cmInstance.getValue === 'function') {
      return cmInstance.getValue();
    }
    if (cmEl) {
      const pre = cmEl.querySelector('pre.CodeMirror-line');
      return pre ? pre.textContent || '' : '';
    }
    return '';
  }

  function setSubjectLineContent(subjectInput, text) {
    const vceCm = subjectInput.querySelector('vce-codemirror');
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : null;
    const cmInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null) ||
      cmEl?.CodeMirror ||
      null;

    if (vceCm) {
      try {
        vceCm.setAttribute('html', text);
      } catch (_) {}
    }

    const htmlEditor = vceCm ? vceCm.closest('vce-html-editor') : null;
    if (htmlEditor) {
      try {
        htmlEditor.setAttribute('html', text);
      } catch (_) {}
    }

    if (cmInstance && typeof cmInstance.setValue === 'function') {
      cmInstance.setValue(text);
      try {
        cmInstance.focus();
        cmInstance.display?.input?.blur?.();
      } catch (_) {}
      return true;
    }

    const textarea = cmEl?.querySelector('textarea');
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const pre = cmEl?.querySelector('pre.CodeMirror-line');
    if (pre) {
      pre.textContent = text;
      return true;
    }

    return false;
  }

  function scanCampaign(state, matcher, options = {}) {
    const { mode = 'find' } = options;
    const isPreview = mode === 'preview';
    const isApply = mode === 'apply';
    const replacement = isPreview || isApply ? state.replace : undefined;
    const collectChanges = isPreview;
    const simulateOnly = isPreview;

    const counts = { subject: 0, preview: 0, body: 0, alt: 0 };
    const availability = {
      subject: 'disabled',
      preview: 'disabled',
      body: 'disabled',
      alt: 'disabled',
    };
    const locations = [];
    const changes = [];

    const maxLocations = MAX_DISPLAY_LOCATIONS;
    const utils = dom();

    if (state.scopes.subject) {
      availability.subject = 'missing';
      const subjectInput = document.querySelector('cb-personalizable-input-with-context#subject-line-input');
      if (subjectInput) {
        availability.subject = 'ok';
        const current = getSubjectLineText(subjectInput);
        const result = utils.processHtmlOrTextContent(current, matcher, {
          replacement,
          maxLocations: maxLocations - locations.length,
          context: 'Subject line',
          collectChanges,
          simulateOnly,
        });
        counts.subject = result.count;
        locations.push(...result.locations);
        if (collectChanges) changes.push(...result.changes);
        if (isApply && result.count > 0) {
          setSubjectLineContent(subjectInput, result.text);
          const cmEl = subjectInput.querySelector('vce-codemirror .CodeMirror');
          if (typeof window.gemMarkEmarsysTextControlDirty === 'function') {
            const textarea = cmEl?.querySelector('textarea');
            if (textarea) window.gemMarkEmarsysTextControlDirty(textarea);
          }
        }
      }
    }

    if (state.scopes.preview) {
      availability.preview = 'missing';
      const textarea = document.querySelector('cb-preheader textarea');
      if (textarea) {
        availability.preview = 'ok';
        const result = utils.processHtmlOrTextContent(textarea.value, matcher, {
          replacement,
          maxLocations: maxLocations - locations.length,
          context: 'Preview text',
          collectChanges,
          simulateOnly,
        });
        counts.preview = result.count;
        locations.push(...result.locations);
        if (collectChanges) changes.push(...result.changes);
        if (isApply && result.count > 0) {
          textarea.value = result.text;
          if (typeof window.gemMarkEmarsysTextControlDirty === 'function') {
            window.gemMarkEmarsysTextControlDirty(textarea);
          } else {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    }

    const previewDoc = getPreviewDocument();
    if (state.scopes.body) {
      availability.body = previewDoc ? 'ok' : 'unavailable';
      if (previewDoc) {
        const result = utils.scanEmailBody(previewDoc, matcher, {
          replacement,
          maxLocations: maxLocations - locations.length,
          collectChanges,
          simulateOnly,
        });
        counts.body = result.count;
        locations.push(...result.locations);
        if (collectChanges) changes.push(...result.changes);
        if (isApply && result.count > 0) {
          utils.markEmailBodyDirty(previewDoc, result.touched);
        }
      }
    }

    if (state.scopes.alt) {
      availability.alt = previewDoc ? 'ok' : 'unavailable';
      if (previewDoc) {
        const result = utils.scanImageAlts(previewDoc, matcher, {
          replacement,
          maxLocations: maxLocations - locations.length,
          collectChanges,
          simulateOnly,
        });
        counts.alt = result.count;
        locations.push(...result.locations);
        if (collectChanges) changes.push(...result.changes);
        if (isApply && result.count > 0) {
          utils.markImageAltsDirty(result.touched);
        }
      }
    }

    const totalLocations = locations.length;
    let hiddenLocationCount = 0;
    if (isPreview) {
      hiddenLocationCount = Math.max(0, changes.length - MAX_DISPLAY_LOCATIONS);
    } else {
      const allLocationCount =
        counts.subject + counts.preview + counts.body + counts.alt;
      hiddenLocationCount = Math.max(0, allLocationCount - totalLocations);
    }

    return {
      counts,
      availability,
      locations: locations.slice(0, MAX_DISPLAY_LOCATIONS),
      changes: changes.slice(0, MAX_DISPLAY_LOCATIONS),
      hiddenLocationCount,
      total:
        (state.scopes.subject ? counts.subject : 0) +
        (state.scopes.preview ? counts.preview : 0) +
        (state.scopes.body ? counts.body : 0) +
        (state.scopes.alt ? counts.alt : 0),
      scopes: normalizeScopes(state.scopes),
    };
  }

  function findMatches() {
    hideReplacePreview();
    const state = readFormState();
    if (!state) return;

    const findTrimmed = state.find.trim();
    if (!findTrimmed) return;

    const matcher = buildMatcherFromState(state);
    if (matcher?.error) {
      window.gemShowToast && window.gemShowToast(matcher.error, { type: 'error', duration: 3000 });
      return;
    }

    const result = scanCampaign(state, matcher);
    renderMatchResults(result);
    persistPanelState();
  }

  function showReplacePreview(plan) {
    const els = getFormElements();
    if (!els?.replacePreview || !els.replacePreviewList) return;

    const total = plan.total || 0;
    if (total <= 0) {
      window.gemShowToast && window.gemShowToast('No matches to replace.', { type: 'info', duration: 2500 });
      return;
    }

    pendingReplacePlan = plan;

    let html = `<div class="gem-find-replace-replace-preview-summary">Review ${total} replacement${total === 1 ? '' : 's'} before applying.</div>`;

    const enabledKeys = Object.keys(SCOPE_LABELS).filter((key) => plan.scopes[key]);
    if (enabledKeys.length > 1) {
      enabledKeys.forEach((key) => {
        if (plan.availability[key] === 'missing' || plan.availability[key] === 'unavailable') {
          html += `<div class="gem-find-replace-match-results-unavailable">${escapeHtml(SCOPE_UNAVAILABLE[key])}</div>`;
        } else {
          html += `<div class="gem-find-replace-match-results-scope">${formatMatchCount(plan.counts[key] || 0)} in ${SCOPE_LABELS[key]}.</div>`;
        }
      });
    }

    plan.changes.forEach((change) => {
      html += `
        <div class="gem-find-replace-replace-preview-item">
          <div class="gem-find-replace-match-location-context">${escapeHtml(change.context || 'Change')}</div>
          <div class="gem-find-replace-replace-preview-before">${escapeHtml(change.before)}</div>
          <div class="gem-find-replace-replace-preview-arrow">→</div>
          <div class="gem-find-replace-replace-preview-after">${escapeHtml(change.after)}</div>
        </div>
      `;
    });

    if (plan.hiddenLocationCount > 0) {
      html += `<div class="gem-find-replace-match-location-more">…and ${plan.hiddenLocationCount} more change${plan.hiddenLocationCount === 1 ? '' : 's'}.</div>`;
    }

    els.replacePreviewList.innerHTML = html;
    els.replacePreview.hidden = false;
    if (els.applyBtn) els.applyBtn.hidden = true;
    if (els.confirmReplaceBtn) {
      els.confirmReplaceBtn.textContent = `Replace ${total} occurrence${total === 1 ? '' : 's'}`;
    }
  }

  function prepareFindReplace() {
    clearMatchResults();
    hideReplacePreview();

    const state = readFormState();
    if (!state) return;

    const findTrimmed = state.find.trim();
    if (!findTrimmed) return;

    const matcher = buildMatcherFromState(state);
    if (matcher?.error) {
      window.gemShowToast && window.gemShowToast(matcher.error, { type: 'error', duration: 3000 });
      return;
    }

    const plan = scanCampaign(state, matcher, { mode: 'preview' });

    showReplacePreview(plan);
  }

  function confirmFindReplace() {
    if (!pendingReplacePlan) return;

    const state = readFormState();
    if (!state) return;

    const matcher = buildMatcherFromState(state);
    if (matcher?.error) return;

    const applied = scanCampaign(state, matcher, { mode: 'apply' });
    const total = applied.total || 0;
    hideReplacePreview();
    clearMatchResults();

    window.gemShowToast &&
      window.gemShowToast(`Replaced ${total} occurrence${total === 1 ? '' : 's'}.`, {
        type: 'success',
        duration: 3000,
      });
    persistPanelState();
  }

  function loadPresetsFromStorage(callback) {
    if (!chrome?.storage?.sync) {
      savedPresets = [];
      if (callback) callback(savedPresets);
      return;
    }
    chrome.storage.sync.get({ [STORAGE_KEY]: { version: 1, items: [] } }, (res) => {
      const normalized = normalizePresetState(res[STORAGE_KEY]);
      savedPresets = normalized.items;
      if (callback) callback(savedPresets);
    });
  }

  function persistPresets(callback) {
    const payload = { version: 1, items: savedPresets };
    if (!chrome?.storage?.sync) {
      if (callback) callback();
      return;
    }
    chrome.storage.sync.set({ [STORAGE_KEY]: payload }, () => {
      if (callback) callback();
    });
  }

  function deletePreset(presetId) {
    const idx = savedPresets.findIndex((item) => item.id === presetId);
    if (idx < 0) return;
    savedPresets.splice(idx, 1);
    if (loadedPresetId === presetId) loadedPresetId = null;
    persistPresets(() => {
      renderSavedPresetsList();
      persistPanelState();
    });
  }

  function renderSavedPresetsList() {
    const els = getFormElements();
    if (!els || !els.savedList) return;

    if (!savedPresets.length) {
      els.savedList.innerHTML = '<div class="gem-find-replace-saved-empty">No saved find and replace presets yet.</div>';
      return;
    }

    els.savedList.innerHTML = savedPresets
      .map((preset) => {
        const activeClass =
          loadedPresetId && preset.id === loadedPresetId ? ' gem-find-replace-saved-item--active' : '';
        const regexBadge = preset.isRegex ? '<span class="gem-find-replace-saved-regex">.*</span>' : '';
        const caseBadge = preset.matchCase ? '<span class="gem-find-replace-saved-regex">Aa</span>' : '';
        const wordBadge = preset.wholeWord ? '<span class="gem-find-replace-saved-regex">ab</span>' : '';
        const findLabel = escapeHtml(preset.find);
        const replaceLabel = escapeHtml(preset.replace || '(empty)');
        return `
          <div class="gem-find-replace-saved-row">
            <button type="button" class="gem-find-replace-saved-item${activeClass}" data-preset-id="${escapeHtml(preset.id)}">
              <span class="gem-find-replace-saved-item-text">${findLabel} → ${replaceLabel}${regexBadge}${caseBadge}${wordBadge}</span>
            </button>
            <button type="button" class="gem-find-replace-saved-delete" data-delete-preset-id="${escapeHtml(preset.id)}" title="Delete preset" aria-label="Delete preset">×</button>
          </div>
        `;
      })
      .join('');
  }

  function saveCurrentPreset() {
    const state = readFormState();
    if (!state) return;
    const findTrimmed = state.find.trim();
    if (!findTrimmed) {
      window.gemShowToast && window.gemShowToast('Enter text to find before saving.', { type: 'warn', duration: 2500 });
      return;
    }

    const preset = {
      id: loadedPresetId || generatePresetId(),
      find: findTrimmed,
      replace: state.replace,
      isRegex: state.isRegex,
      matchCase: state.matchCase,
      wholeWord: state.wholeWord,
      scopes: normalizeScopes(state.scopes),
    };

    const idx = savedPresets.findIndex((item) => item.id === preset.id);
    if (idx >= 0) savedPresets[idx] = preset;
    else savedPresets.push(preset);

    loadedPresetId = preset.id;
    persistPresets(() => {
      renderSavedPresetsList();
      persistPanelState();
      window.gemShowToast && window.gemShowToast('Find and replace preset saved.', { type: 'success', duration: 2200 });
    });
  }

  function bindPanelHandlers() {
    const els = getFormElements();
    if (!els || panelHandlersBound) return;
    panelHandlersBound = true;

    const onFormChange = () => {
      clearMatchResults();
      hideReplacePreview();
      syncActionButtonState();
      persistPanelStateDebounced();
    };

    els.findInput.addEventListener('input', onFormChange);
    els.replaceInput.addEventListener('input', onFormChange);

    els.scopeInputs.forEach((input) => {
      input.addEventListener('change', onFormChange);
    });

    els.regexToggle.addEventListener('click', () => {
      const nowActive = !els.regexToggle.classList.contains('gem-find-replace-option-toggle--active');
      setOptionToggleState(els.regexToggle, nowActive);
      syncWholeWordState();
      onFormChange();
    });

    els.matchCaseToggle.addEventListener('click', () => {
      const nowActive = !els.matchCaseToggle.classList.contains('gem-find-replace-option-toggle--active');
      setOptionToggleState(els.matchCaseToggle, nowActive);
      onFormChange();
    });

    els.wholeWordToggle.addEventListener('click', () => {
      if (els.wholeWordToggle.disabled) return;
      const nowActive = !els.wholeWordToggle.classList.contains('gem-find-replace-option-toggle--active');
      setOptionToggleState(els.wholeWordToggle, nowActive);
      onFormChange();
    });

    els.findMatchesBtn.addEventListener('click', findMatches);
    els.applyBtn.addEventListener('click', prepareFindReplace);
    els.confirmReplaceBtn.addEventListener('click', confirmFindReplace);
    els.cancelReplaceBtn.addEventListener('click', hideReplacePreview);
    els.saveBtn.addEventListener('click', saveCurrentPreset);
    els.clearBtn.addEventListener('click', resetFormState);

    els.savedList.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest('[data-delete-preset-id]');
      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        deletePreset(deleteBtn.getAttribute('data-delete-preset-id'));
        return;
      }

      const btn = event.target.closest('[data-preset-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-preset-id');
      const preset = savedPresets.find((item) => item.id === id);
      if (!preset) return;
      writeFormState(preset, preset.id);
      clearMatchResults();
      hideReplacePreview();
      persistPanelState();
    });
  }

  function activateFindReplacePanel() {
    const navContent = document.querySelector('.e-verticalnav__content');
    const navItem = document.querySelector(`#${TAB_ID} e-verticalnav-item`);
    if (!navContent || !navItem) return;

    navItem.setAttribute('status', 'active');
    const navItemDiv = navItem.querySelector('.e-verticalnavitem');
    if (navItemDiv) navItemDiv.classList.add('e-verticalnavitem-active');

    hideNonRouterOutletChildren(navContent);

    const existing = navContent.querySelector(PANEL_TAG);
    if (existing) existing.remove();

    navContent.insertAdjacentHTML('afterbegin', createFindReplacePanelHTML());
    panelHandlersBound = false;
    bindPanelHandlers();

    loadPresetsFromStorage(() => {
      restorePanelStateFromStorage();
      renderSavedPresetsList();
      syncWholeWordState();
      requestAnimationFrame(() => {
        const els = getFormElements();
        els?.findInput?.focus();
      });
    });
  }

  function deactivateFindReplacePanel() {
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
    pendingReplacePlan = null;
  }

  function handleFindReplaceTabClick(event) {
    event.preventDefault();
    activateFindReplacePanel();
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
      if (isFindReplaceActive()) deactivateFindReplacePanel();
    });
  }

  function addFindReplaceTab() {
    const snippetsTab = document.querySelector('#gem-snippets-tab');
    if (!snippetsTab) return false;

    let tab = document.querySelector(`#${TAB_ID}`);
    if (tab) {
      if (snippetsTab.nextElementSibling !== tab) {
        snippetsTab.insertAdjacentElement('afterend', tab);
      }
      return true;
    }

    snippetsTab.insertAdjacentHTML('afterend', createFindReplaceTabHTML());
    tab = document.querySelector(`#${TAB_ID}`);
    if (!tab) return false;

    const navItem = tab.querySelector('e-verticalnav-item');
    if (navItem) navItem.addEventListener('click', handleFindReplaceTabClick);
    setupGlobalTabClickHandler();
    return true;
  }

  function waitForVerticalNav() {
    if (addFindReplaceTab()) return;
    if (typeof gemDomWatchSubscribe === 'function') {
      const unsub = gemDomWatchSubscribe(() => {
        if (addFindReplaceTab()) unsub();
      });
    } else {
      const observer = new MutationObserver(() => {
        if (addFindReplaceTab()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function initFindReplacePanel() {
    if (!window.gemFindReplaceDom) {
      console.warn('[Gem] find-replace-panel.js requires find-replace-dom-utils.js');
    }

    waitForVerticalNav();

    window.addEventListener('pagehide', () => {
      if (isFindReplaceActive()) persistPanelState();
    });

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[STORAGE_KEY]) return;
        savedPresets = normalizePresetState(changes[STORAGE_KEY].newValue).items;
        if (isFindReplaceActive()) renderSavedPresetsList();
      });
    }
  }

  window.gemDeactivateFindReplacePanel = deactivateFindReplacePanel;
  window.gemActivateFindReplacePanel = activateFindReplacePanel;
  window.gemIsFindReplaceActive = isFindReplaceActive;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFindReplacePanel);
  } else {
    initFindReplacePanel();
  }
})();
