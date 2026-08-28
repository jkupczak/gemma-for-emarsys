console.log('[Gem] campaign-details-overlay.js loaded');

(function () {
  const OVERLAY_ID = 'gem-campaign-details-overlay';
  const HOLD_MS = 500;
  const IFRAME_FLAG = '_gemCampaignDetailsOverlayHandler';
  const DRAFT_KEY_PREFIX = 'gemDraft_';
  const FROM_NAME_LABEL = /from\s*name|sender\s*name/i;
  const FROM_ADDRESS_LABEL = /from\s*(email|address)|sender\s*(email|address)/i;

  let holdTimer = null;
  let holdActive = false;
  let overlayVisible = false;
  let stickyMode = false;
  let iframeWatchBound = false;
  let escapeUnsub = null;
  let lastSavedAt = null;
  let wasUnsaved = null;
  let saveWatchBound = false;

  const identityCache = {
    lang: '',
    subject: '',
    preheader: '',
    fromName: '',
    fromAddress: '',
  };

  function isDetailsModifierKey(event) {
    return event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight'
      || event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight';
  }

  function isDetailsCombo(event) {
    return !!(event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey);
  }

  function detailsKeyLabel() {
    return window.GEM_IS_MAC ? 'Control+Option' : 'Ctrl+Alt';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function collapseText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stripHtml(value) {
    const raw = String(value || '');
    if (!raw) return '';
    if (raw.indexOf('<') === -1) return collapseText(raw);
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      return collapseText(doc.body.textContent || '');
    } catch (_) {
      return collapseText(raw.replace(/<[^>]+>/g, ' '));
    }
  }

  function textOf(selector) {
    const el = document.querySelector(selector);
    return el ? collapseText(el.textContent) : '';
  }

  function getCampaignIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      return (url.searchParams.get('id') || url.searchParams.get('camp_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getSelectedLanguageValue() {
    if (typeof window.gemGetSelectedLanguageValue === 'function') {
      return String(window.gemGetSelectedLanguageValue() || '').trim();
    }
    const selector = document.querySelector('vce-languages-selector');
    if (!selector) return '';
    const selected = selector.querySelector('e-select-option[selected="true"], e-select-option[selected="selected"]')
      || selector.querySelector('e-select-option[selected]');
    return selected ? String(selected.getAttribute('value') || '').trim() : '';
  }

  function getCampaignTitle() {
    return textOf('cb-campaign-name span') || textOf('cb-campaign-name') || 'Untitled campaign';
  }

  function getLanguageChips() {
    const selector = document.querySelector('vce-languages-selector');
    if (!selector) return [];
    const chips = [];
    const seen = new Set();
    selector.querySelectorAll('e-select-option').forEach((opt) => {
      const name = collapseText(opt.textContent);
      if (!name || seen.has(name)) return;
      seen.add(name);
      const selected = opt.getAttribute('selected') === 'true'
        || opt.getAttribute('selected') === 'selected'
        || (opt.hasAttribute('selected') && opt.getAttribute('selected') !== 'false');
      chips.push({ label: name, active: selected });
    });
    return chips;
  }

  function parseVersionLetter(text) {
    const match = String(text || '').match(/#\s*([a-z])/i)
      || String(text || '').match(/version\s*#?\s*([a-z])/i);
    return match && match[1] ? match[1].toUpperCase() : '';
  }

  function getVersionChips() {
    const select = document.querySelector('cb-version-selector select');
    if (!select) return [];
    return Array.from(select.options)
      .map((opt) => {
        const id = String(opt.value || '').trim();
        if (!id) return null;
        const rawLabel = String(opt.textContent || '').trim();
        const letter = parseVersionLetter(rawLabel);
        return {
          label: letter ? `Version ${letter}` : (rawLabel || id),
          active: !!opt.selected,
        };
      })
      .filter(Boolean);
  }

  function getCachedSnapshot() {
    if (typeof window.gemGetCachedContentBlocksSnapshot !== 'function') return null;
    const urlId = getCampaignIdFromUrl();
    if (!urlId) return null;
    try {
      return window.gemGetCachedContentBlocksSnapshot(urlId) || null;
    } catch (_) {
      return null;
    }
  }

  function getEmailBasicsFromSnapshot(snapshot) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const contents = campaign && campaign.contents;
    if (!contents || typeof contents !== 'object') return {};
    const lang = getSelectedLanguageValue();
    const keys = lang ? [lang, lang.toLowerCase(), lang.toUpperCase()] : [];
    for (let i = 0; i < keys.length; i += 1) {
      const entry = contents[keys[i]];
      if (entry && entry.email_basics && typeof entry.email_basics === 'object') {
        return entry.email_basics;
      }
    }
    const firstKey = Object.keys(contents)[0];
    const first = firstKey ? contents[firstKey] : null;
    return first && first.email_basics && typeof first.email_basics === 'object' ? first.email_basics : {};
  }

  function tokenChipHtml(label) {
    const text = collapseText(label);
    if (!text) return '';
    return `<span class="e-label e-label-primary gem-campaign-details-overlay__token">${escapeHtml(text)}</span>`;
  }

  function tokenLabelFromMeta(meta) {
    if (!meta || typeof meta !== 'object') return '';
    return collapseText(
      meta.tokenName || meta.token?.displayName || meta.token?.name || meta.name || ''
    );
  }

  function decodePersTokenMeta(encoded) {
    const raw = String(encoded || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch (_) {
      try {
        return JSON.parse(atob(raw));
      } catch (err) {
        return null;
      }
    }
  }

  function formatPersTokenSourceToDisplayHtml(source) {
    const raw = String(source || '');
    if (!raw.trim()) return '';
    if (!raw.includes('pers-token:1') && !raw.includes('cond-token:1')) {
      return escapeHtml(stripHtml(raw));
    }

    const parsed = typeof window.gemParsePersTokensInHtml === 'function'
      ? window.gemParsePersTokensInHtml(raw)
      : [];
    if (parsed.length) {
      const parts = [];
      let last = 0;
      parsed.forEach((token) => {
        if (token.start > last) {
          const before = stripHtml(raw.slice(last, token.start));
          if (before) parts.push(escapeHtml(before));
        }
        const label = tokenLabelFromMeta(token.meta) || collapseText(token.preview);
        parts.push(tokenChipHtml(label) || escapeHtml(stripHtml(token.full || '')));
        last = token.end;
      });
      if (last < raw.length) {
        const tail = formatPersTokenSourceToDisplayHtml(raw.slice(last));
        if (tail) parts.push(tail);
      }
      return parts.join('');
    }

    const looseRe = /\{# (?:pers-token:1|cond-token:1) ([^#]+) #\}([\s\S]*?)(?:\{# (?:pers-token:1|cond-token:1) #\}|$)/g;
    let html = '';
    let last = 0;
    let match;
    while ((match = looseRe.exec(raw)) !== null) {
      if (match.index > last) {
        const before = stripHtml(raw.slice(last, match.index));
        if (before) html += escapeHtml(before);
      }
      const label = tokenLabelFromMeta(decodePersTokenMeta(match[1])) || collapseText(match[2]);
      html += tokenChipHtml(label) || escapeHtml(stripHtml(match[0]));
      last = match.index + match[0].length;
    }
    if (!html) return escapeHtml(stripHtml(raw));
    if (last < raw.length) {
      const tail = stripHtml(raw.slice(last));
      if (tail) html += escapeHtml(tail);
    }
    return html;
  }

  function readPaintedSubjectHtml(cmEl) {
    if (!cmEl) return '';
    const lines = cmEl.querySelectorAll('.CodeMirror-code .CodeMirror-line, pre.CodeMirror-line');
    if (!lines.length) return '';
    const hasWidgets = !!cmEl.querySelector('.CodeMirror-widget');
    let html = '';
    function walk(node) {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = String(node.nodeValue || '').replace(/\u200b/g, '');
        if (text) html += escapeHtml(text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('CodeMirror-widget')) {
        html += tokenChipHtml(node.textContent);
        return;
      }
      node.childNodes.forEach(walk);
    }
    lines.forEach(walk);
    const compact = html.replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.includes('pers-token:1') || compact.includes('cond-token:1')) return '';
    if (!hasWidgets && compact.includes('{#')) return '';
    return compact;
  }

  function readRawSubjectSource(host) {
    if (!host) return '';
    const vceCm = host.querySelector('vce-codemirror');
    if (vceCm) {
      const fromAttr = vceCm.getAttribute('html') || '';
      if (fromAttr.trim()) return fromAttr;
    }
    const htmlEditor = host.querySelector('vce-html-editor');
    if (htmlEditor) {
      const fromHtml = htmlEditor.getAttribute('html') || '';
      if (fromHtml.trim()) return fromHtml;
    }
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : host.querySelector('.CodeMirror');
    const cmInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null)
      || (cmEl && cmEl.CodeMirror)
      || null;
    if (cmInstance && typeof cmInstance.getValue === 'function') {
      return cmInstance.getValue() || '';
    }
    return '';
  }

  function readLiveSubject() {
    const host = document.querySelector('cb-personalizable-input-with-context#subject-line-input')
      || document.querySelector('#subject-line-input');
    if (!host) return '';
    const vceCm = host.querySelector('vce-codemirror');
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : host.querySelector('.CodeMirror');
    const painted = readPaintedSubjectHtml(cmEl);
    if (painted) return painted;
    return formatPersTokenSourceToDisplayHtml(readRawSubjectSource(host));
  }

  function readLivePreheader() {
    const textarea = document.querySelector('cb-preheader textarea');
    if (textarea) return collapseText(textarea.value);
    const host = document.querySelector('cb-preheader');
    return host ? collapseText(host.textContent) : '';
  }

  function controlValue(el) {
    if (!el) return '';
    if (el.matches('input, textarea, select')) return collapseText(el.value);
    const nested = el.querySelector('input, textarea, select');
    if (nested) return collapseText(nested.value);
    const selected = el.querySelector('e-select-option[selected="true"], e-select-option[selected], option[selected], .e-selectnew__value, .e-select__value');
    if (selected) return collapseText(selected.textContent);
    return collapseText(el.textContent);
  }

  function fieldValueNearLabel(pattern) {
    const labels = document.querySelectorAll('label, .e-field__label');
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      if (label.closest('#gem-campaign-details-overlay')) continue;
      const text = collapseText(label.textContent);
      if (!pattern.test(text)) continue;
      const forId = label.getAttribute('for');
      if (forId) {
        const byId = document.getElementById(forId);
        const value = controlValue(byId);
        if (value) return value;
      }
      const field = label.closest('.e-field, .e-form-group, .e-grid') || label.parentElement;
      const control = field && field.querySelector('input, textarea, select, e-select, .e-selectnew');
      const value = controlValue(control);
      if (value) return value;
    }
    return '';
  }

  function pickNamedFromField(namePattern) {
    const nodes = document.querySelectorAll('input, textarea, select, e-select');
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const hay = `${el.id || ''} ${el.getAttribute('name') || ''} ${el.getAttribute('formcontrolname') || ''}`;
      if (!namePattern.test(hay)) continue;
      const value = controlValue(el);
      if (value) return value;
    }
    return '';
  }

  function readLiveFromFields() {
    const name = fieldValueNearLabel(FROM_NAME_LABEL)
      || pickNamedFromField(/from[_-]?name|sender[_-]?name/i);
    const address = fieldValueNearLabel(FROM_ADDRESS_LABEL)
      || pickNamedFromField(/from[_-]?(email|address)|sender[_-]?(email|address)/i);
    return { name, address };
  }

  function pickFromObject(obj) {
    if (!obj || typeof obj !== 'object') return { name: '', address: '' };
    const name = collapseText(
      obj.from_name || obj.fromName || obj.sender_name || obj.senderName || obj.sender || ''
    );
    const address = collapseText(
      obj.from_email || obj.fromEmail || obj.sender_email || obj.senderEmail || obj.from_address || obj.fromAddress || ''
    );
    return { name, address };
  }

  function getFromFieldsFromSnapshot(snapshot) {
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const basics = getEmailBasicsFromSnapshot(snapshot);
    const sources = [
      basics,
      campaign,
      campaign && campaign.settings,
      campaign && campaign.email_settings,
      campaign && campaign.sender,
    ];
    for (let i = 0; i < sources.length; i += 1) {
      const picked = pickFromObject(sources[i]);
      if (picked.name || picked.address) return picked;
    }
    return { name: '', address: '' };
  }

  function rememberIdentity(partial) {
    const lang = getSelectedLanguageValue();
    if (identityCache.lang && lang && identityCache.lang !== lang) {
      identityCache.subject = '';
      identityCache.preheader = '';
    }
    if (lang) identityCache.lang = lang;
    if (partial.subject) identityCache.subject = partial.subject;
    if (partial.preheader) identityCache.preheader = partial.preheader;
    if (partial.fromName) identityCache.fromName = partial.fromName;
    if (partial.fromAddress) identityCache.fromAddress = partial.fromAddress;
  }

  function harvestIdentityCache() {
    const liveFrom = readLiveFromFields();
    rememberIdentity({
      subject: readLiveSubject(),
      preheader: readLivePreheader(),
      fromName: liveFrom.name,
      fromAddress: liveFrom.address,
    });
  }

  function getIdentityFields() {
    harvestIdentityCache();
    const snapshot = getCachedSnapshot();
    const basics = getEmailBasicsFromSnapshot(snapshot);
    const snapshotFrom = getFromFieldsFromSnapshot(snapshot);
    const subject = identityCache.subject || formatPersTokenSourceToDisplayHtml(basics.subject || '');
    const preheader = identityCache.preheader || collapseText(basics.preheader || '');
    const fromName = identityCache.fromName || snapshotFrom.name;
    const fromAddress = identityCache.fromAddress || snapshotFrom.address;
    return { subject, preheader, fromName, fromAddress };
  }

  function isUnsavedDraft() {
    const saveButton = document.querySelector('cb-draft-save-button button');
    if (!saveButton) return false;
    return !saveButton.hasAttribute('disabled');
  }

  function formatRelativeTime(ts) {
    const n = Number.parseInt(String(ts), 10) || 0;
    if (!n) return '';
    const diffMs = Date.now() - n;
    if (diffMs < 45000) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function getSaveStatus() {
    if (isUnsavedDraft()) {
      return { unsaved: true, label: 'Unsaved changes' };
    }
    const relative = formatRelativeTime(lastSavedAt);
    if (relative) return { unsaved: false, label: `Saved ${relative}` };
    return { unsaved: false, label: 'All changes saved' };
  }

  function getPreflightSnapshot() {
    if (typeof window.gemGetPreflightLanguageSnapshot === 'function') {
      try {
        return window.gemGetPreflightLanguageSnapshot();
      } catch (_) {}
    }
    return { languages: [], current: null, total: 0 };
  }

  function getEslHealth() {
    const roots = document.querySelectorAll('.gem-esl-validator');
    const counts = { fail: 0, pass: 0, unavailable: 0, waiting: 0 };
    roots.forEach((el) => {
      if (el.hasAttribute('hidden')) return;
      const state = String(el.getAttribute('data-state') || '').trim();
      if (state && Object.prototype.hasOwnProperty.call(counts, state)) {
        counts[state] += 1;
      }
    });
    counts.checked = counts.fail + counts.pass + counts.unavailable + counts.waiting;
    return counts;
  }

  function renderChips(items) {
    if (!items.length) return '';
    const highlightActive = items.length > 1;
    return `<div class="gem-campaign-details-overlay__chips">${
      items.map((item) => {
        const activeClass = highlightActive && item.active ? ' gem-campaign-details-overlay__chip--active' : '';
        return `<span class="gem-campaign-details-overlay__chip${activeClass}">${escapeHtml(item.label)}</span>`;
      }).join('')
    }</div>`;
  }

  function displayTextFromHtml(value) {
    return collapseText(String(value || '').replace(/<[^>]+>/g, ' '));
  }

  function renderIdentityRow(label, value, { html = false } = {}) {
    const text = html ? displayTextFromHtml(value) : collapseText(value);
    if (!text) return '';
    const content = html ? String(value || '') : escapeHtml(text);
    return `<div class="gem-campaign-details-overlay__row">
      <div class="gem-campaign-details-overlay__label">${escapeHtml(label)}</div>
      <div class="gem-campaign-details-overlay__value">${content}</div>
    </div>`;
  }

  function formatFromLine(name, address) {
    if (name && address) return `${name} · ${address}`;
    return name || address || '';
  }

  function renderIdentityBand(identity) {
    const fromLine = formatFromLine(identity.fromName, identity.fromAddress);
    const html = [
      renderIdentityRow('Subject', identity.subject, { html: true }),
      renderIdentityRow('Preheader', identity.preheader),
      renderIdentityRow('From', fromLine),
    ].join('');
    return html;
  }

  function renderPreflightValue(snapshot) {
    const total = Math.max(0, Number.parseInt(String(snapshot && snapshot.total), 10) || 0);
    const current = snapshot && snapshot.current;
    const languages = Array.isArray(snapshot && snapshot.languages) ? snapshot.languages : [];
    if (!languages.length && !total) return 'No scan yet';
    if (total <= 0) return 'No issues';
    const currentName = current && current.text ? current.text : 'this language';
    const currentCount = current ? current.count : 0;
    const otherCount = Math.max(0, total - currentCount);
    if (languages.length <= 1) {
      return `${total} issue${total === 1 ? '' : 's'}`;
    }
    return `${total} issue${total === 1 ? '' : 's'} · ${currentCount} in ${currentName}, ${otherCount} in others`;
  }

  function renderEslValue(health) {
    if (!health.checked) return 'No checks yet';
    const parts = [];
    if (health.fail) parts.push(`${health.fail} failing`);
    if (health.unavailable) parts.push(`${health.unavailable} unavailable`);
    if (health.waiting) parts.push(`${health.waiting} checking`);
    if (health.pass) parts.push(`${health.pass} passing`);
    if (!health.fail && !health.unavailable && !health.waiting) return 'All passing';
    return parts.join(' · ');
  }

  function renderHealthBand() {
    const save = getSaveStatus();
    const preflight = getPreflightSnapshot();
    const esl = getEslHealth();
    const saveClass = save.unsaved
      ? ' gem-campaign-details-overlay__value--alert'
      : '';
    const preflightClass = preflight.total > 0
      ? ' gem-campaign-details-overlay__value--alert'
      : '';
    const eslClass = esl.fail > 0 || esl.unavailable > 0
      ? ' gem-campaign-details-overlay__value--alert'
      : '';
    return `
      <div class="gem-campaign-details-overlay__row">
        <div class="gem-campaign-details-overlay__label">Draft</div>
        <div class="gem-campaign-details-overlay__value${saveClass}">${escapeHtml(save.label)}</div>
      </div>
      <div class="gem-campaign-details-overlay__row">
        <div class="gem-campaign-details-overlay__label">Preflight</div>
        <div class="gem-campaign-details-overlay__value${preflightClass}">${escapeHtml(renderPreflightValue(preflight))}</div>
      </div>
      <div class="gem-campaign-details-overlay__row">
        <div class="gem-campaign-details-overlay__label">ESL</div>
        <div class="gem-campaign-details-overlay__value${eslClass}">${escapeHtml(renderEslValue(esl))}</div>
      </div>
    `;
  }

  function bindOverlayEvents(overlay) {
    if (overlay._gemDetailsBound) return;
    overlay._gemDetailsBound = true;
    const closeBtn = overlay.querySelector('[data-role="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideOverlay();
      });
    }
    overlay.addEventListener('click', (event) => {
      if (!stickyMode) return;
      if (event.target === overlay) hideOverlay();
    });
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      bindOverlayEvents(overlay);
      return overlay;
    }
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'gem-campaign-details-overlay gem-layer-modal';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <button type="button" class="gem-campaign-details-overlay__close" data-role="close" aria-label="Close campaign details">✕</button>
      <div class="gem-campaign-details-overlay__inner">
        <div class="gem-campaign-details-overlay__title" data-role="title"></div>
        <div class="gem-campaign-details-overlay__groups" data-role="groups"></div>
        <div class="gem-campaign-details-overlay__band" data-role="identity" hidden></div>
        <div class="gem-campaign-details-overlay__band gem-campaign-details-overlay__band--health" data-role="health"></div>
        <p class="gem-campaign-details-overlay__hint" data-role="hint"></p>
      </div>
    `;
    (document.body || document.documentElement).appendChild(overlay);
    bindOverlayEvents(overlay);
    return overlay;
  }

  function fillOverlay(overlay) {
    const titleEl = overlay.querySelector('[data-role="title"]');
    const groupsEl = overlay.querySelector('[data-role="groups"]');
    const identityEl = overlay.querySelector('[data-role="identity"]');
    const healthEl = overlay.querySelector('[data-role="health"]');
    const hintEl = overlay.querySelector('[data-role="hint"]');
    if (titleEl) titleEl.textContent = getCampaignTitle();
    if (groupsEl) {
      groupsEl.innerHTML = `${renderChips(getLanguageChips())}${renderChips(getVersionChips())}`;
    }
    if (identityEl) {
      const identityHtml = renderIdentityBand(getIdentityFields());
      identityEl.innerHTML = identityHtml;
      identityEl.hidden = !identityHtml;
    }
    if (healthEl) healthEl.innerHTML = renderHealthBand();
    if (hintEl) {
      hintEl.textContent = stickyMode
        ? 'Press Esc to close'
        : `Release ${detailsKeyLabel()} to close`;
    }
  }

  function bindEscape() {
    if (escapeUnsub || typeof window.gemLayerBindEscape !== 'function') return;
    escapeUnsub = window.gemLayerBindEscape((event) => {
      if (!overlayVisible) return;
      hideOverlay();
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, {
      whileConnected: () => overlayVisible,
    });
  }

  function showOverlay(options) {
    if (options && options.sticky) stickyMode = true;
    const overlay = ensureOverlay();
    fillOverlay(overlay);
    overlay.classList.toggle('gem-campaign-details-overlay--sticky', stickyMode);
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    overlayVisible = true;
    bindEscape();
    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(overlay, { tier: 'modal' });
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    overlayVisible = false;
    stickyMode = false;
    cancelHold();
    if (!overlay) return;
    overlay.classList.remove('is-visible', 'gem-campaign-details-overlay--sticky');
    overlay.setAttribute('aria-hidden', 'true');
    if (typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(overlay);
    }
  }

  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    holdActive = false;
  }

  function onKeyDown(event) {
    if ((event.key === 'Escape' || event.code === 'Escape') && overlayVisible) {
      event.preventDefault();
      event.stopPropagation();
      hideOverlay();
      return;
    }
    if (isDetailsCombo(event)) {
      if (overlayVisible) return;
      if (!isDetailsModifierKey(event)) {
        if (holdActive && !overlayVisible) cancelHold();
        return;
      }
      if (event.repeat || holdActive) return;
      holdActive = true;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!holdActive) return;
        stickyMode = false;
        showOverlay();
      }, HOLD_MS);
      return;
    }
    if (holdActive && !overlayVisible) cancelHold();
  }

  function onKeyUp(event) {
    if (!isDetailsModifierKey(event)) return;
    cancelHold();
    if (overlayVisible && !stickyMode) {
      event.preventDefault();
      event.stopPropagation();
      hideOverlay();
    }
  }

  function injectIntoIframe(iframe) {
    try {
      if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) {
        return;
      }
      const iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!iframeDoc || iframeDoc[IFRAME_FLAG]) return;
      iframeDoc.addEventListener('keydown', onKeyDown, true);
      iframeDoc.addEventListener('keyup', onKeyUp, true);
      iframeDoc[IFRAME_FLAG] = true;
    } catch (_) {}
  }

  function bindIframe(iframe) {
    if (!iframe || iframe._gemCampaignDetailsOverlayLoadBound) return;
    iframe._gemCampaignDetailsOverlayLoadBound = true;
    iframe.addEventListener('load', () => injectIntoIframe(iframe));
    injectIntoIframe(iframe);
  }

  function scanIframes() {
    document.querySelectorAll('iframe').forEach(bindIframe);
  }

  function syncSaveState() {
    const unsaved = isUnsavedDraft();
    if (wasUnsaved === true && unsaved === false) {
      lastSavedAt = Date.now();
    }
    wasUnsaved = unsaved;
  }

  function bindSaveWatch() {
    if (saveWatchBound) return;
    saveWatchBound = true;
    const sync = () => syncSaveState();
    const bindButton = (button) => {
      if (!button || button._gemDetailsSaveWatch) return;
      button._gemDetailsSaveWatch = true;
      if (typeof gemDomWatchObserveAttributes === 'function') {
        gemDomWatchObserveAttributes(button, sync, ['disabled']);
      }
      sync();
    };
    const existing = document.querySelector('cb-draft-save-button button');
    if (existing) bindButton(existing);
    if (typeof window.gemDomWatchSubscribe === 'function') {
      window.gemDomWatchSubscribe(() => {
        harvestIdentityCache();
        const button = document.querySelector('cb-draft-save-button button');
        if (button) bindButton(button);
      });
    }
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'gem-draft-saved') return;
      lastSavedAt = Date.now();
      wasUnsaved = false;
    });
  }

  function seedLastSavedFromDraftStorage() {
    const campaignId = getCampaignIdFromUrl();
    if (!campaignId || !chrome || !chrome.storage || !chrome.storage.local) return;
    const snapshot = getCachedSnapshot();
    const campaign = snapshot && (snapshot.campaign || snapshot);
    const suiteId = campaign && campaign.suite_campaign_id != null
      ? String(campaign.suite_campaign_id)
      : '';
    const keys = [`${DRAFT_KEY_PREFIX}${campaignId}`];
    if (suiteId && suiteId !== campaignId) keys.push(`${DRAFT_KEY_PREFIX}${suiteId}`);
    chrome.storage.local.get(keys, (res) => {
      if (lastSavedAt) return;
      for (let i = 0; i < keys.length; i += 1) {
        const entry = res && res[keys[i]];
        const ts = entry && (entry.saved_at || 0);
        if (ts) {
          lastSavedAt = ts;
          return;
        }
      }
    });
  }

  window.gemShowCampaignDetailsOverlay = function gemShowCampaignDetailsOverlay(options) {
    cancelHold();
    stickyMode = !!(options && options.sticky);
    showOverlay({ sticky: stickyMode });
  };

  window.gemHideCampaignDetailsOverlay = hideOverlay;

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', () => {
    cancelHold();
    if (!stickyMode) hideOverlay();
  }, true);

  scanIframes();
  bindSaveWatch();
  seedLastSavedFromDraftStorage();
  if (!iframeWatchBound && typeof window.gemDomWatchSubscribe === 'function') {
    iframeWatchBound = true;
    window.gemDomWatchSubscribe(() => scanIframes());
  }
})();
