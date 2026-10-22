// campaign-variable-wrap.js
// Campaign variable text inputs (Email Basics > Variables) show long values on one hidden line.
// Each one gets a wrapping, auto-growing textarea in front of it. The native input stays in the
// DOM (hidden) as the source of truth: Emarsys and the ESL validator keep reading/listening to it.
(function () {
  'use strict';

  if (window.__gemCampaignVariableWrapInstalled) return;
  window.__gemCampaignVariableWrapInstalled = true;

  const INPUT_SELECTOR = 'vce-variables-editor input[type="text"].variable-value';
  const WRAPPED_ATTR = 'data-gem-variable-wrap';
  const TEXTAREA_CLASS = 'gem-variable-wrap-textarea';
  const LINE_BREAKS_RE = /[\r\n]+/g;

  const textareas = new Set();

  function stripLineBreaks(value) {
    return String(value == null ? '' : value).replace(LINE_BREAKS_RE, '');
  }

  function wrapInput(input) {
    if (input.hasAttribute(WRAPPED_ATTR)) return;
    input.setAttribute(WRAPPED_ATTR, '1');

    const textarea = document.createElement('textarea');
    textarea.className = `e-input ${TEXTAREA_CLASS}`;
    textarea.rows = 1;
    textarea.spellcheck = false;
    if (input.placeholder) textarea.placeholder = input.placeholder;
    textarea.value = stripLineBreaks(input.value);
    textarea._gemVariableInput = input;
    input._gemVariableTextarea = textarea;
    input.tabIndex = -1;

    // Before the input: the ESL validator re-inserts its badge directly after the input.
    input.before(textarea);
    textareas.add(textarea);

    function syncState() {
      textarea.disabled = input.disabled;
      textarea.readOnly = input.readOnly;
    }

    function pullFromInput() {
      const next = stripLineBreaks(input.value);
      if (textarea.value !== next) textarea.value = next;
      syncState();
    }

    function pushToInput() {
      const raw = textarea.value;
      const clean = stripLineBreaks(raw);
      if (clean !== raw) {
        const caret = stripLineBreaks(raw.slice(0, textarea.selectionStart)).length;
        textarea.value = clean;
        textarea.setSelectionRange(caret, caret);
      }
      if (input.value === clean) return;
      input.value = clean;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
    textarea.addEventListener('input', pushToInput);
    textarea.addEventListener('change', () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    textarea.addEventListener('focus', pullFromInput);
    textarea.addEventListener('blur', () => {
      input.dispatchEvent(new FocusEvent('blur'));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    // Value written by something other than the textarea (Gemma tools, Emarsys handlers).
    input.addEventListener('input', pullFromInput);
    input.addEventListener('change', pullFromInput);
    new MutationObserver(pullFromInput).observe(input, {
      attributes: true,
      attributeFilter: ['value', 'disabled', 'readonly'],
    });
    input._gemVariablePull = pullFromInput;
    syncState();
  }

  function removeOrphans() {
    textareas.forEach((textarea) => {
      const input = textarea._gemVariableInput;
      if (textarea.isConnected && input && input.isConnected) return;
      textareas.delete(textarea);
      if (textarea.isConnected) textarea.remove();
    });
  }

  function scan() {
    if (textareas.size) removeOrphans();
    if (!document.querySelector('vce-variables-editor')) return;
    document.querySelectorAll(`${INPUT_SELECTOR}:not([${WRAPPED_ATTR}])`).forEach(wrapInput);
  }

  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  // Reset sets the input value from Emarsys code without firing an input event.
  document.addEventListener(
    'click',
    (e) => {
      const reset = e.target && e.target.closest && e.target.closest('.variables-editor-reset');
      if (!reset) return;
      const row = reset.closest('.variable-editor-row');
      const input = row && row.querySelector(`input[${WRAPPED_ATTR}]`);
      if (!input || typeof input._gemVariablePull !== 'function') return;
      requestAnimationFrame(input._gemVariablePull);
      setTimeout(input._gemVariablePull, 100);
    },
    true
  );

  scan();
  if (typeof window.gemDomWatchSubscribe === 'function') {
    window.gemDomWatchSubscribe(function (mutations) {
      if (window.gemDomWatchHasStructuralChange(mutations)) scheduleScan();
    });
  }
})();
