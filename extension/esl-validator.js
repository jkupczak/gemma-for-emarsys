console.log('[Gem] esl-validator.js loaded');

(function () {
  'use strict';

  if (window.__gemEslValidatorInstalled) return;
  window.__gemEslValidatorInstalled = true;

  const DEBOUNCE_MS = 400;
  const POLL_MS = 250;
  const HOST_ATTR = 'data-gem-esl-validator-host';
  const ROOT_CLASS = 'gem-esl-validator';
  const DEFAULT_TEMPLATE_NAME = 'template1';

  const ICON_SUCCESS = '';
  const ICON_ERROR = '';
  const ICON_WARNING = '';
  const LOG_PREFIX = '[Gem][ESL][inject]';

  /** @type {Map<Element, ValidatorSession>} */
  const sessions = new Map();
  const loggedFloatSkip = new WeakSet();

  function logInject() {
    const args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.log.apply(console, args);
  }

  function describeNode(el) {
    if (!el) return '(null)';
    if (el.nodeType !== Node.ELEMENT_NODE) return '(nodeType ' + el.nodeType + ')';
    const tag = String(el.tagName || '').toLowerCase();
    const id = el.id ? '#' + el.id : '';
    let cls = '';
    try {
      const raw = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
      cls = String(raw)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join('.');
    } catch (_) {}
    const connected = el.isConnected ? 'in-dom' : 'detached';
    return tag + id + (cls ? '.' + cls : '') + '[' + connected + ']';
  }

  function describeDisplay(el) {
    if (!el) return { visible: false, reason: 'null' };
    if (!el.isConnected) return { visible: false, reason: 'detached' };
    try {
      const style = window.getComputedStyle(el);
      const rects = el.getClientRects();
      const info = {
        visible: true,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        rects: rects.length,
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      };
      if (style.display === 'none') return Object.assign(info, { visible: false, reason: 'display:none' });
      if (style.visibility === 'hidden') return Object.assign(info, { visible: false, reason: 'visibility:hidden' });
      if (Number(style.opacity) === 0) return Object.assign(info, { visible: false, reason: 'opacity:0' });
      if (rects.length === 0) return Object.assign(info, { visible: false, reason: 'no-client-rects' });
      return info;
    } catch (err) {
      return { visible: !!el.isConnected, reason: 'style-error', error: err && err.message };
    }
  }

  function isCampaignEditorPage() {
    try {
      return /contentBlocks(?:\/|%2F)campaign/i.test(window.location.href);
    } catch (_) {
      return false;
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cleanEditorText(value) {
    return String(value ?? '')
      .replace(/\u200b/g, '')
      .trim();
  }

  function isDisplayed(el) {
    return !!describeDisplay(el).visible;
  }

  function hasEditorSurface(host) {
    if (!host || !host.querySelector) return false;
    return !!(
      host.querySelector('textarea') ||
      host.querySelector('.CodeMirror') ||
      host.querySelector('vce-codemirror') ||
      host.querySelector('vce-code-editor')
    );
  }

  function insertAfter(anchor, node) {
    if (!anchor || !anchor.parentNode || !node) return false;
    if (anchor.nextSibling === node) return true;
    anchor.parentNode.insertBefore(node, anchor.nextSibling);
    return true;
  }

  function resolveCodeMirror(host) {
    const vceCm = host?.querySelector?.('vce-codemirror') || null;
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : null;
    const cmInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null) ||
      cmEl?.CodeMirror ||
      null;
    return { vceCm, cmEl, cmInstance };
  }

  function readCodeMirrorLineText(cmEl) {
    if (!cmEl) return '';
    const lines = cmEl.querySelectorAll('.CodeMirror-code .CodeMirror-line');
    if (lines.length) {
      return Array.from(lines)
        .map((line) => String(line.textContent || '').replace(/\u200b/g, ''))
        .join('\n');
    }
    const pre = cmEl.querySelector('pre.CodeMirror-line');
    return pre ? String(pre.textContent || '').replace(/\u200b/g, '') : '';
  }

  function readCodeMirrorHostValue(host) {
    if (!host) return '';
    const { vceCm, cmEl, cmInstance } = resolveCodeMirror(host);

    // CodeMirror's hidden textarea only holds the in-progress keystrokes, not
    // the document. Prefer getValue / painted line text over that input.
    if (cmInstance && typeof cmInstance.getValue === 'function') {
      const fromCm = cleanEditorText(cmInstance.getValue());
      if (fromCm) return fromCm;
    }

    const fromLines = cleanEditorText(readCodeMirrorLineText(cmEl));
    if (fromLines) return fromLines;

    if (vceCm) {
      try {
        const fromAttr = cleanEditorText(vceCm.getAttribute('html') || '');
        if (fromAttr) return fromAttr;
      } catch (_) {}
    }

    const htmlEditor = host.querySelector('vce-html-editor');
    if (htmlEditor) {
      try {
        const fromHtml = cleanEditorText(htmlEditor.getAttribute('html') || '');
        if (fromHtml) return fromHtml;
      } catch (_) {}
    }

    const textareas = host.querySelectorAll('textarea');
    for (const textarea of textareas) {
      if (textarea.closest('.CodeMirror')) continue;
      const fromTextarea = cleanEditorText(textarea.value);
      if (fromTextarea) return fromTextarea;
    }

    return '';
  }

  function iconHtml(icon, color, glyph) {
    return (
      '<e-icon size="small" type="inline" icon="' +
      escapeHtml(icon) +
      '" color="' +
      escapeHtml(color) +
      '"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon e-icon-inline e-icon-small text-color-' +
      escapeHtml(color) +
      '">' +
      glyph +
      '</div></div></e-icon>'
    );
  }

  function renderValidatorHtml(state, errors) {
    let icon = '';
    let title = '';

    if (state === 'waiting') {
      icon =
        '<e-busy-indicator class="e-validator__busy_indicator gem-esl-validator__busy" active="active" size="small" inline="" inert=""></e-busy-indicator>' +
        '<span class="gem-esl-validator__spinner" aria-hidden="true"></span>';
      title = 'Waiting for ESL validation';
    } else if (state === 'pass') {
      icon = iconHtml('checkmark-circle', 'success', ICON_SUCCESS);
      title = 'ESL code validation passed';
    } else if (state === 'fail') {
      icon = iconHtml('error', 'error', ICON_ERROR);
      const items = Array.isArray(errors) ? errors.filter(Boolean) : [];
      if (items.length <= 1) {
        title =
          '<mark class="e-validator__mark e-validator__mark-default e-validator__mark-error">Invalid ESL:</mark> ' +
          escapeHtml(items[0] || '');
      } else {
        title =
          '<mark class="e-validator__mark e-validator__mark-default e-validator__mark-error">Invalid ESL:</mark>' +
          '<ul class="gem-esl-validator__errors">' +
          items
            .map(function (item) {
              return '<li>' + escapeHtml(item) + '</li>';
            })
            .join('') +
          '</ul>';
      }
    } else if (state === 'unavailable') {
      icon = iconHtml('warning', 'warning', ICON_WARNING);
      title = 'The ESL code cannot be validated right now. Try again later.';
    } else {
      return '';
    }

    return (
      '<e-validator-header>' +
      '<div class="e-validator__header">' +
      '<div class="e-validator__icon">' +
      icon +
      '</div>' +
      '<div class="e-validator__title">' +
      title +
      '</div>' +
      '</div>' +
      '</e-validator-header>'
    );
  }

  function collectFailMessages(result) {
    const fromErrors = Array.isArray(result && result.errors) ? result.errors : [];
    const fromRaw =
      result && result.raw && Array.isArray(result.raw.errors) ? result.raw.errors : [];
    const list = fromErrors.length ? fromErrors : fromRaw;
    return list
      .map((item) => (item && item.reason_text) || item)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function setButtonLocked(btn, locked) {
    if (!btn) return;
    if (locked) {
      if (btn.dataset.gemEslValLock !== '1') {
        btn.dataset.gemEslValWasDisabled = btn.disabled || btn.hasAttribute('disabled') ? '1' : '0';
        btn.dataset.gemEslValWasAria = btn.getAttribute('aria-disabled') || '';
        btn.dataset.gemEslValLock = '1';
      }
      btn.disabled = true;
      btn.setAttribute('disabled', '');
      btn.setAttribute('aria-disabled', 'true');
      return;
    }
    if (btn.dataset.gemEslValLock !== '1') return;
    const wasDisabled = btn.dataset.gemEslValWasDisabled === '1';
    const wasAria = btn.dataset.gemEslValWasAria || '';
    delete btn.dataset.gemEslValLock;
    delete btn.dataset.gemEslValWasDisabled;
    delete btn.dataset.gemEslValWasAria;
    if (wasDisabled) {
      btn.disabled = true;
      btn.setAttribute('disabled', '');
    } else {
      btn.disabled = false;
      btn.removeAttribute('disabled');
    }
    if (wasAria) btn.setAttribute('aria-disabled', wasAria);
    else btn.removeAttribute('aria-disabled');
  }

  class ValidatorSession {
    constructor(config) {
      this.id = config.id;
      this.host = config.host;
      this.getAnchor = config.getAnchor;
      this.getText = config.getText;
      this.getSubmitButtons = config.getSubmitButtons || function () { return []; };
      this.getVisibilityRoot = config.getVisibilityRoot || function () { return config.host; };
      this.templateName = config.templateName || DEFAULT_TEMPLATE_NAME;
      this.debounceMs = typeof config.debounceMs === 'number' ? config.debounceMs : DEBOUNCE_MS;

      this.root = document.createElement('div');
      this.root.className = ROOT_CLASS;
      this.root.setAttribute('data-gem-esl-validator', this.id);
      this.root.hidden = true;

      this.state = 'hidden';
      this.generation = 0;
      this.lastText = null;
      this.wasVisible = false;
      this.pendingImmediate = false;
      this.pendingImmediateSince = 0;
      this.destroyed = false;
      this.debounceTimer = null;
      this.abortController = null;
      this.cmBound = false;
      this.unsubscribers = [];

      this.host.setAttribute(HOST_ATTR, this.id);
      this.root.addEventListener('click', (event) => {
        if (this.state !== 'unavailable') return;
        event.preventDefault();
        this.validateNow(true);
      });
      this.root.addEventListener('keydown', (event) => {
        if (this.state !== 'unavailable') return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.validateNow(true);
      });
    }

    mount() {
      this.placeRoot();
      this.bindInputs();
      this.bindSubmitGuard();
      this.unsubscribers.push(
        this.startPoll(() => {
          this.placeRoot();
          this.bindCodeMirror();
          this.syncVisibility();
          this.syncTextFromPoll();
        })
      );
      this.syncVisibility(true);
    }

    placeRoot() {
      if (this.destroyed) return;
      const anchor = this.getAnchor();
      const parent = anchor && anchor.parentNode;
      const alreadyPlaced = !!(anchor && anchor.nextSibling === this.root);
      const placed = this.root.isConnected;
      const key = [
        describeNode(anchor),
        describeNode(parent),
        alreadyPlaced ? 'already' : 'move',
        placed ? 'connected' : 'loose',
      ].join('|');

      if (!anchor || !parent) {
        if (this._placeLogKey !== key) {
          this._placeLogKey = key;
          logInject(this.id, 'placeRoot FAIL: no anchor', {
            host: describeNode(this.host),
            hostConnected: this.host && this.host.isConnected,
            anchor: describeNode(anchor),
          });
        }
        return;
      }

      insertAfter(anchor, this.root);

      if (this._placeLogKey !== key) {
        this._placeLogKey = key;
        logInject(this.id, alreadyPlaced ? 'placeRoot already after anchor' : 'placeRoot INSERTED after anchor', {
          anchor: describeNode(anchor),
          parent: describeNode(parent),
          root: describeNode(this.root),
          next: describeNode(this.root.nextElementSibling),
          inDialog: !!(this.root.closest && this.root.closest('e-float-container')),
        });
      }
    }

    startPoll(fn) {
      const timer = setInterval(fn, POLL_MS);
      return function () {
        clearInterval(timer);
      };
    }

    bindInputs() {
      const host = this.host;
      const onInput = () => this.onTextMaybeChanged(false);

      host.addEventListener('input', onInput, true);
      host.addEventListener('change', onInput, true);
      this.unsubscribers.push(function () {
        host.removeEventListener('input', onInput, true);
        host.removeEventListener('change', onInput, true);
      });

      this.bindCodeMirror();
    }

    bindSubmitGuard() {
      const root = this.getVisibilityRoot();
      if (!root || typeof root.addEventListener !== 'function') return;
      const onClick = (event) => {
        if (this.state !== 'waiting') return;
        const buttons = this.getSubmitButtons() || [];
        if (!buttons.length) return;
        const target = event.target && event.target.closest
          ? event.target.closest('button, .apply, [type="submit"], e-btn')
          : null;
        if (!target) return;
        const hit = buttons.some((btn) => btn === target || (btn && btn.contains && btn.contains(target)) || (target.contains && target.contains(btn)));
        if (!hit) return;
        event.preventDefault();
        event.stopPropagation();
      };
      root.addEventListener('click', onClick, true);
      this.unsubscribers.push(function () {
        root.removeEventListener('click', onClick, true);
      });
    }

    bindCodeMirror() {
      if (this.cmBound || this.destroyed) return;
      const { cmInstance } = resolveCodeMirror(this.host);
      if (!cmInstance || typeof cmInstance.on !== 'function') return;
      const onChange = () => this.onTextMaybeChanged(false);
      cmInstance.on('change', onChange);
      this.cmBound = true;
      this.unsubscribers.push(function () {
        try {
          if (typeof cmInstance.off === 'function') cmInstance.off('change', onChange);
        } catch (_) {}
      });
    }

    syncVisibility(forceOpen) {
      const root = this.getVisibilityRoot();
      const display = describeDisplay(root);
      const visible = !!display.visible;
      if (visible && (!this.wasVisible || forceOpen)) {
        logInject(this.id, 'dialog/field became visible', {
          forceOpen: !!forceOpen,
          visRoot: describeNode(root),
          host: describeNode(this.host),
          rootPlaced: this.root.isConnected,
          display: display,
        });
        this.wasVisible = true;
        this.lastText = null;
        this.pendingImmediate = true;
        this.pendingImmediateSince = Date.now();
        this.tryImmediateOpen();
        return;
      }
      if (!visible) {
        if (this.wasVisible) {
          logInject(this.id, 'dialog/field became hidden', {
            visRoot: describeNode(root),
            display: display,
          });
          this.clearPending();
          this.setSubmitLocked(false);
        } else if (this.id === 'link-editor' && this._hiddenLogKey !== display.reason) {
          this._hiddenLogKey = display.reason;
          logInject(this.id, 'not treated as visible yet', {
            visRoot: describeNode(root),
            display: display,
            rootPlaced: this.root.isConnected,
          });
        }
        this.wasVisible = false;
        this.pendingImmediate = false;
      }
    }

    tryImmediateOpen() {
      if (!this.pendingImmediate || this.destroyed) return;
      const ready = hasEditorSurface(this.host) || cleanEditorText(this.getText());
      const timedOut = Date.now() - this.pendingImmediateSince > 2000;
      if (!ready && !timedOut) return;
      this.pendingImmediate = false;
      this.onTextMaybeChanged(true);
    }

    syncTextFromPoll() {
      if (!this.wasVisible) return;
      this.tryImmediateOpen();
      if (this.pendingImmediate) return;
      const text = cleanEditorText(this.getText());
      if (text === this.lastText) return;
      this.onTextMaybeChanged(false);
    }

    onTextMaybeChanged(immediate) {
      if (this.destroyed || !this.wasVisible) return;
      const text = cleanEditorText(this.getText());
      if (!immediate && text === this.lastText) return;

      this.lastText = text;
      this.clearDebounce();

      if (!text) {
        this.clearPending();
        this.render('hidden', []);
        return;
      }

      this.render('waiting', []);
      if (immediate) {
        this.validateNow(false);
        return;
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.validateNow(false);
      }, this.debounceMs);
    }

    validateNow(force) {
      if (this.destroyed) return;
      const text = cleanEditorText(this.getText());
      this.lastText = text;
      this.clearDebounce();

      if (!text) {
        this.clearPending();
        this.render('hidden', []);
        return;
      }

      if (force) this.lastText = text;
      this.render('waiting', []);

      const generation = ++this.generation;
      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch (_) {}
      }
      this.abortController = typeof AbortController === 'function' ? new AbortController() : null;

      const validate =
        typeof window.gemValidateEsl === 'function'
          ? window.gemValidateEsl(text, {
              name: this.templateName,
              signal: this.abortController && this.abortController.signal,
            })
          : Promise.resolve({ status: 'unavailable', errors: [] });

      validate
        .then((result) => {
          if (this.destroyed || generation !== this.generation) return;
          if (!result || result.status === 'aborted') return;
          const failMessages = collectFailMessages(result);
          if (result.status === 'fail' || failMessages.length) {
            this.render('fail', failMessages);
            return;
          }
          if (result.status === 'pass') {
            this.render('pass', []);
            return;
          }
          this.render('unavailable', []);
        })
        .catch(() => {
          if (this.destroyed || generation !== this.generation) return;
          this.render('unavailable', []);
        });
    }

    render(state, errors) {
      this.state = state;
      if (state === 'hidden') {
        this.root.hidden = true;
        this.root.innerHTML = '';
        this.root.removeAttribute('data-state');
        this.root.removeAttribute('title');
        this.root.removeAttribute('role');
        this.root.removeAttribute('tabindex');
        this.setSubmitLocked(false);
        return;
      }

      this.root.hidden = false;
      this.root.setAttribute('data-state', state);
      this.root.innerHTML = renderValidatorHtml(state, errors);
      if (state === 'unavailable') {
        this.root.setAttribute('title', 'Try again');
        this.root.setAttribute('role', 'button');
        this.root.setAttribute('tabindex', '0');
      } else {
        this.root.removeAttribute('title');
        this.root.removeAttribute('role');
        this.root.removeAttribute('tabindex');
      }
      this.setSubmitLocked(state === 'waiting');
    }

    setSubmitLocked(locked) {
      const buttons = this.getSubmitButtons() || [];
      buttons.forEach((btn) => setButtonLocked(btn, locked));
    }

    clearDebounce() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    }

    clearPending() {
      this.clearDebounce();
      this.generation += 1;
      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch (_) {}
        this.abortController = null;
      }
    }

    destroy() {
      if (this.destroyed) return;
      logInject(this.id, 'session destroyed', {
        host: describeNode(this.host),
        hostConnected: this.host && this.host.isConnected,
        rootPlaced: this.root && this.root.isConnected,
      });
      this.destroyed = true;
      this.clearPending();
      this.setSubmitLocked(false);
      this.unsubscribers.forEach((fn) => {
        try {
          fn();
        } catch (_) {}
      });
      this.unsubscribers = [];
      this.root.remove();
      if (this.host.getAttribute(HOST_ATTR) === this.id) {
        this.host.removeAttribute(HOST_ATTR);
      }
      sessions.delete(this.host);
    }
  }

  function mountSession(config) {
    if (!config || !config.host) {
      logInject((config && config.id) || 'unknown', 'mountSession skipped: no host');
      return null;
    }
    const existing = sessions.get(config.host);
    if (existing && !existing.destroyed) {
      logInject(config.id, 'mountSession reuse existing', {
        host: describeNode(config.host),
        state: existing.state,
        wasVisible: existing.wasVisible,
        rootPlaced: existing.root.isConnected,
      });
      existing.placeRoot();
      existing.syncVisibility();
      return existing;
    }
    logInject(config.id, 'mountSession NEW', { host: describeNode(config.host) });
    const session = new ValidatorSession(config);
    sessions.set(config.host, session);
    session.mount();
    return session;
  }

  function pruneDisconnectedSessions() {
    sessions.forEach((session, host) => {
      if (!host.isConnected) session.destroy();
    });
  }

  function getLinkEditorFloat(startNode) {
    let cur = startNode && startNode.nodeType === Node.ELEMENT_NODE ? startNode : null;
    while (cur) {
      if (isLinkEditorFloat(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function getNearestFloat(startNode) {
    let cur = startNode && startNode.nodeType === Node.ELEMENT_NODE ? startNode : null;
    while (cur) {
      if (String(cur.tagName || '').toLowerCase() === 'e-float-container') return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function readDialogTitle(el) {
    const title = el && el.querySelector && el.querySelector('header .e-dialog__title, .e-dialog__title');
    return String(title?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isLinkEditorFloat(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (String(el.tagName || '').toLowerCase() !== 'e-float-container') return false;
    const text = readDialogTitle(el);
    if (text === 'Link Editor') return true;
    if (!loggedFloatSkip.has(el)) {
      loggedFloatSkip.add(el);
      logInject('skip float: title is not Link Editor', {
        float: describeNode(el),
        title: text || '(empty)',
        hasUrlHost: !!el.querySelector('cb-personalizable-input-with-context.link-editor-url'),
      });
    }
    return false;
  }

  function mountLinkEditor(float, source) {
    const urlHost = float.querySelector('cb-personalizable-input-with-context.link-editor-url');
    const host =
      urlHost ||
      float.querySelector('cb-personalizable-input-with-context');
    if (!host) {
      logInject('link-editor mount skipped: no URL host yet', {
        source: source || 'unknown',
        float: describeNode(float),
        title: readDialogTitle(float) || '(empty)',
        display: describeDisplay(float),
      });
      return;
    }

    logInject('link-editor mount attempt', {
      source: source || 'unknown',
      float: describeNode(float),
      host: describeNode(host),
      usedFallbackHost: !urlHost,
      anchor:
        describeNode(
          host.querySelector('vce-code-editor') ||
            host.querySelector('vce-codemirror') ||
            host
        ),
      display: describeDisplay(float),
    });

    mountSession({
      id: 'link-editor',
      host: host,
      getVisibilityRoot: function () {
        return float;
      },
      getAnchor: function () {
        return (
          host.querySelector('vce-code-editor') ||
          host.querySelector('vce-codemirror') ||
          host
        );
      },
      getText: function () {
        return readCodeMirrorHostValue(host);
      },
      getSubmitButtons: function () {
        return Array.from(float.querySelectorAll('.apply, button.apply, .e-btn.apply'));
      },
    });
  }

  function mountSubjectLine(host) {
    mountSession({
      id: 'subject-line',
      host: host,
      getAnchor: function () {
        return host.querySelector('vce-code-editor') || host.querySelector('vce-codemirror') || host;
      },
      getText: function () {
        return readCodeMirrorHostValue(host);
      },
    });
  }

  function mountPreheader(host) {
    mountSession({
      id: 'preheader',
      host: host,
      getAnchor: function () {
        return host.querySelector('textarea') || host.querySelector('vce-code-editor') || host;
      },
      getText: function () {
        const textarea = host.querySelector('textarea');
        if (textarea) return textarea.value || '';
        return readCodeMirrorHostValue(host);
      },
    });
  }

  function mountSnippetModal(modal) {
    const codeInput = modal.querySelector('#gem-snippet-code-input');
    if (!codeInput) return;
    const field = codeInput.closest('.e-field') || codeInput.parentElement || codeInput;

    mountSession({
      id: 'snippet-modal',
      host: field,
      getVisibilityRoot: function () {
        return modal;
      },
      getAnchor: function () {
        return codeInput;
      },
      getText: function () {
        return codeInput.value || '';
      },
      getSubmitButtons: function () {
        const ok = modal.querySelector('#gem-modal-ok-btn');
        return ok ? [ok] : [];
      },
    });
  }

  function mountSubjectTokenModal(modal) {
    const codeInput = modal.querySelector('#gem-subject-line-token-code');
    if (!codeInput) return;
    const field = codeInput.closest('.e-field') || codeInput.parentElement || codeInput;

    mountSession({
      id: 'snippet-token-editor',
      host: field,
      getVisibilityRoot: function () {
        return modal;
      },
      getAnchor: function () {
        return codeInput;
      },
      getText: function () {
        return codeInput.value || '';
      },
      getSubmitButtons: function () {
        const apply = modal.querySelector('[data-gem-apply]');
        return apply ? [apply] : [];
      },
    });
  }

  function mountVariableInput(input) {
    if (!input || input.nodeType !== Node.ELEMENT_NODE) return;
    if (!input.matches || !input.matches('input[type="text"].variable-value')) return;
    if (!input.closest || !input.closest('vce-variables-editor')) return;

    const panel = input.closest('cb-campaign-variables') || input.closest('vce-variables-editor') || input;
    const rawId = String(input.id || '').replace(/^variables-editor-input-/, '').trim();
    const templateName = rawId || DEFAULT_TEMPLATE_NAME;

    mountSession({
      id: 'campaign-variable:' + (rawId || 'unnamed'),
      host: input,
      templateName: templateName,
      getVisibilityRoot: function () {
        return panel;
      },
      getAnchor: function () {
        return input;
      },
      getText: function () {
        return input.value || '';
      },
    });
  }

  function scanCampaignVariables(node) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE && node.matches?.('input[type="text"].variable-value')) {
      mountVariableInput(node);
      return;
    }

    if (typeof node.querySelector !== 'function') return;

    const panel = node.nodeType === Node.ELEMENT_NODE && node.matches?.('cb-campaign-variables')
      ? node
      : node.querySelector('cb-campaign-variables');
    const editor = panel
      ? panel.querySelector('vce-variables-editor')
      : (node.nodeType === Node.ELEMENT_NODE && node.matches?.('vce-variables-editor')
        ? node
        : node.querySelector('vce-variables-editor'));
    if (!editor) return;

    editor.querySelectorAll('input[type="text"].variable-value').forEach(mountVariableInput);
  }

  function scanForLinkEditor(node, source) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    if (isLinkEditorFloat(node)) {
      logInject('scan found Link Editor float', { source: source, node: describeNode(node) });
      mountLinkEditor(node, source);
    }

    const urlHost =
      node.matches?.('cb-personalizable-input-with-context.link-editor-url')
        ? node
        : node.querySelector?.('cb-personalizable-input-with-context.link-editor-url');
    if (urlHost) {
      const nearestFloat = getNearestFloat(urlHost);
      const float = getLinkEditorFloat(urlHost);
      logInject('scan found link-editor-url field', {
        source: source,
        host: describeNode(urlHost),
        nearestFloat: describeNode(nearestFloat),
        floatIsLinkEditor: !!float,
        title: nearestFloat ? readDialogTitle(nearestFloat) || '(empty)' : '(no parent float)',
        display: describeDisplay(nearestFloat || urlHost),
      });
      if (float) mountLinkEditor(float, source + ':url-host');
      else if (nearestFloat && nearestFloat.querySelector('cb-personalizable-input-with-context')) {
        logInject('url field found but parent float not recognized as Link Editor yet; mounting anyway', {
          source: source,
          float: describeNode(nearestFloat),
          title: readDialogTitle(nearestFloat) || '(empty)',
        });
        mountLinkEditor(nearestFloat, source + ':url-host-unverified');
      }
    }

    const titleEl =
      node.matches?.('.e-dialog__title, header .e-dialog__title')
        ? node
        : node.querySelector?.('header .e-dialog__title, .e-dialog__title');
    if (titleEl) {
      const float = getLinkEditorFloat(titleEl);
      if (float) {
        logInject('scan found dialog title on Link Editor', {
          source: source,
          title: readDialogTitle(float) || String(titleEl.textContent || '').trim(),
          float: describeNode(float),
        });
        mountLinkEditor(float, source + ':title');
      }
    }

    node.querySelectorAll?.('e-float-container').forEach((float) => {
      if (isLinkEditorFloat(float)) {
        logInject('scan found nested Link Editor float', {
          source: source,
          node: describeNode(float),
        });
        mountLinkEditor(float, source + ':nested-float');
      }
    });
  }

  function scanNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    scanForLinkEditor(node, 'mutation');
    if (node.matches?.('cb-personalizable-input-with-context#subject-line-input')) {
      mountSubjectLine(node);
    }
    if (node.matches?.('cb-preheader')) mountPreheader(node);
    if (node.id === 'gem-snippet-modal') mountSnippetModal(node);
    if (node.id === 'gem-subject-line-token-modal') mountSubjectTokenModal(node);
    const subject = node.querySelector?.('cb-personalizable-input-with-context#subject-line-input');
    if (subject) mountSubjectLine(subject);
    const preheader = node.querySelector?.('cb-preheader');
    if (preheader) mountPreheader(preheader);
    const snippetModal = node.id === 'gem-snippet-modal' ? node : node.querySelector?.('#gem-snippet-modal');
    if (snippetModal) mountSnippetModal(snippetModal);
    const tokenModal =
      node.id === 'gem-subject-line-token-modal'
        ? node
        : node.querySelector?.('#gem-subject-line-token-modal');
    if (tokenModal) mountSubjectTokenModal(tokenModal);
    scanCampaignVariables(node);
  }

  function scanDocument() {
    pruneDisconnectedSessions();
    const floats = Array.from(document.querySelectorAll('e-float-container'));
    const linkFloats = floats.filter(isLinkEditorFloat);
    logInject('scanDocument', {
      floatCount: floats.length,
      linkEditorCount: linkFloats.length,
      urlHostCount: document.querySelectorAll('cb-personalizable-input-with-context.link-editor-url').length,
    });
    floats.forEach((float) => {
      if (isLinkEditorFloat(float)) mountLinkEditor(float, 'scanDocument');
    });
    const subject = document.querySelector('cb-personalizable-input-with-context#subject-line-input');
    if (subject) mountSubjectLine(subject);
    const preheader = document.querySelector('cb-preheader');
    if (preheader) mountPreheader(preheader);
    const snippetModal = document.getElementById('gem-snippet-modal');
    if (snippetModal) mountSnippetModal(snippetModal);
    const tokenModal = document.getElementById('gem-subject-line-token-modal');
    if (tokenModal) mountSubjectTokenModal(tokenModal);
    scanCampaignVariables(document);
  }

  function init() {
    const onCampaignPage = isCampaignEditorPage();
    logInject('init', {
      href: String(window.location.href || ''),
      onCampaignPage: onCampaignPage,
      readyState: document.readyState,
      hasDomWatch: typeof gemDomWatchSubscribe === 'function',
      hasValidateApi: typeof window.gemValidateEsl === 'function',
    });
    if (!onCampaignPage) return;

    scanDocument();

    const onMutations = (mutations) => {
      pruneDisconnectedSessions();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => scanNode(node));
      });
    };

    if (typeof gemDomWatchSubscribe === 'function') {
      gemDomWatchSubscribe(onMutations);
      logInject('watching mutations via gemDomWatchSubscribe');
    } else if (document.body) {
      const observer = new MutationObserver(onMutations);
      observer.observe(document.body, { childList: true, subtree: true });
      logInject('watching mutations via fallback MutationObserver');
    } else {
      logInject('init FAIL: no mutation watcher and no document.body');
    }
  }

  window.gemMountEslValidator = mountSession;
  window.gemRenderEslValidatorHeader = renderValidatorHtml;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
