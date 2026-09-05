// subject-line-wrap.js
// MAIN world: CodeMirror's instance lives on the page (.CodeMirror.CodeMirror),
// so isolated-world content scripts cannot call setOption('lineWrapping').
(function enableSubjectLineWrapping() {
  'use strict';

  if (window !== window.top) return;
  if (window.__gemSubjectLineWrapInstalled) return;
  window.__gemSubjectLineWrapInstalled = true;

  const SUBJECT_VCE_SELECTOR = '#subject-line-input vce-codemirror';
  const SUBJECT_HOST_SELECTOR = '#subject-line-input';
  const COUNT_CLASS = 'gem-subject-char-count';
  const TOKEN_BLOCK_RE =
    /\{# (?:pers-token:1|cond-token:1) [^#]+ #\}[\s\S]*?\{# (?:pers-token:1|cond-token:1) #\}/g;
  const MUSTACHE_RE = /\{\{[\s\S]*?\}\}/g;
  const SCRIPT_TAG_RE = /\{%[\s\S]*?%\}/g;

  function resolveSubjectLineCodeMirror(vceCm) {
    if (!vceCm) return null;
    const cmEl = vceCm.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.setOption === 'function') {
      return cmEl.CodeMirror;
    }
    return null;
  }

  function bindResizeRefresh(vceCm) {
    if (!vceCm || vceCm._gemSubjectWrapResize) return;
    if (typeof ResizeObserver !== 'function') return;

    let lastWidth = -1;
    const observer = new ResizeObserver(function (entries) {
      const width = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0;
      if (Math.abs(width - lastWidth) < 0.5) return;
      lastWidth = width;
      const cm = resolveSubjectLineCodeMirror(vceCm);
      if (cm && typeof cm.refresh === 'function') cm.refresh();
    });
    observer.observe(vceCm);
    vceCm._gemSubjectWrapResize = observer;
  }

  function stripScripts(source) {
    let variable = false;
    let text = String(source || '');

    function strip(re) {
      const next = text.replace(re, '');
      if (next.length !== text.length) variable = true;
      text = next;
    }

    strip(TOKEN_BLOCK_RE);
    strip(MUSTACHE_RE);
    strip(SCRIPT_TAG_RE);
    text = text.replace(/[\u200b\u200c\u200d\ufeff]/g, '');
    text = text.replace(/\r\n|\r|\n/g, '');
    return { text: text, variable: variable };
  }

  function readPaintedStaticText(cmEl) {
    let variable = false;
    let text = '';

    function walk(node) {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        text += String(node.nodeValue || '');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('CodeMirror-widget')) {
        variable = true;
        return;
      }
      node.childNodes.forEach(walk);
    }

    if (!cmEl) return { text: text, variable: variable };
    const lines = cmEl.querySelectorAll('.CodeMirror-code .CodeMirror-line, pre.CodeMirror-line');
    lines.forEach(walk);
    return { text: text, variable: variable };
  }

  function measureSubjectLine(vceCm) {
    if (!vceCm) return { count: 0, variable: false };

    const cmEl = vceCm.querySelector('.CodeMirror');
    const painted = readPaintedStaticText(cmEl);
    let source = painted.text;
    let variable = painted.variable;

    if (!source && !variable) {
      const html = (vceCm.getAttribute('html') || '').trim();
      const htmlEditor = vceCm.closest('vce-html-editor');
      const editorHtml = htmlEditor ? (htmlEditor.getAttribute('html') || '').trim() : '';
      const cm = resolveSubjectLineCodeMirror(vceCm);
      let cmValue = '';
      try {
        cmValue = cm && typeof cm.getValue === 'function' ? cm.getValue() : '';
      } catch (_) {}
      source = html || editorHtml || cmValue || '';
    }

    const stripped = stripScripts(source);
    return {
      count: stripped.text.length,
      variable: variable || stripped.variable,
    };
  }

  function ensureCharCountEl(subjectInput) {
    if (!subjectInput) return null;
    const toolbar = subjectInput.querySelector('vce-code-editor-toolbar');
    if (!toolbar) return null;

    let el = toolbar.querySelector('strong.' + COUNT_CLASS);
    if (!el) {
      el = document.createElement('strong');
      el.className = 'float-right ' + COUNT_CLASS;
      toolbar.appendChild(el);
    }
    return el;
  }

  function updateSubjectLineCharCount(vceCm) {
    const subjectInput = (vceCm && vceCm.closest && vceCm.closest(SUBJECT_HOST_SELECTOR))
      || document.querySelector(SUBJECT_HOST_SELECTOR);
    if (!subjectInput) return;

    const countEl = ensureCharCountEl(subjectInput);
    if (!countEl) return;

    const editor = vceCm || subjectInput.querySelector('vce-codemirror');
    const measured = measureSubjectLine(editor);
    countEl.textContent = String(measured.count) + (measured.variable ? '*' : '');
    countEl.title = measured.variable
      ? 'Character count excludes tokens and scripts'
      : 'Character count';
  }

  function bindHtmlAttributeWatch(vceCm) {
    if (!vceCm || vceCm._gemSubjectCharCountAttrWatch) return;
    vceCm._gemSubjectCharCountAttrWatch = true;
    new MutationObserver(function () {
      updateSubjectLineCharCount(vceCm);
    }).observe(vceCm, { attributes: true, attributeFilter: ['html'] });
  }

  function applyWrapping(cm, vceCm) {
    if (!cm || typeof cm.setOption !== 'function') return;

    const alreadyWrapped = cm.getOption && cm.getOption('lineWrapping') === true;
    if (!alreadyWrapped) {
      cm.setOption('lineWrapping', true);
      if (typeof cm.setSize === 'function') cm.setSize(null, 'auto');
    }

    if (!cm._gemSubjectLineWrapBound) {
      cm._gemSubjectLineWrapBound = true;
      cm.on('changes', function () {
        if (cm.getOption && cm.getOption('lineWrapping') !== true) {
          cm.setOption('lineWrapping', true);
          if (typeof cm.setSize === 'function') cm.setSize(null, 'auto');
        }
        updateSubjectLineCharCount(vceCm);
      });
    }

    if (!alreadyWrapped && typeof cm.refresh === 'function') {
      requestAnimationFrame(function () { cm.refresh(); });
    }
  }

  function ensureWrapping(vceCm, attemptsLeft) {
    if (!vceCm || !vceCm.isConnected) return;
    bindResizeRefresh(vceCm);
    bindHtmlAttributeWatch(vceCm);
    updateSubjectLineCharCount(vceCm);

    const cm = resolveSubjectLineCodeMirror(vceCm);
    if (cm) {
      applyWrapping(cm, vceCm);
      return;
    }

    const left = attemptsLeft == null ? 40 : attemptsLeft;
    if (left <= 0) return;
    setTimeout(function () {
      ensureWrapping(vceCm, left - 1);
    }, 100);
  }

  function watchEditor(vceCm) {
    if (!vceCm) return;
    if (!vceCm._gemSubjectWrapWatch) {
      vceCm._gemSubjectWrapWatch = true;
      const observer = new MutationObserver(function () {
        ensureWrapping(vceCm);
      });
      observer.observe(vceCm, { childList: true, subtree: true });
    }
    ensureWrapping(vceCm);
  }

  function collectEditors(root) {
    const editors = [];
    const seen = new Set();

    function add(el) {
      if (!el || seen.has(el)) return;
      seen.add(el);
      editors.push(el);
    }

    if (!root || root.nodeType !== 1) {
      document.querySelectorAll(SUBJECT_VCE_SELECTOR).forEach(add);
      return editors;
    }

    if (root.matches && root.matches(SUBJECT_VCE_SELECTOR)) add(root);
    if (root.matches && root.matches(SUBJECT_HOST_SELECTOR)) {
      root.querySelectorAll('vce-codemirror').forEach(add);
    }
    if (root.closest) {
      const host = root.closest(SUBJECT_VCE_SELECTOR);
      if (host) add(host);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(SUBJECT_VCE_SELECTOR).forEach(add);
    }

    return editors;
  }

  function scan(root) {
    collectEditors(root).forEach(watchEditor);
    const subjectInput = document.querySelector(SUBJECT_HOST_SELECTOR);
    if (subjectInput) updateSubjectLineCharCount(subjectInput.querySelector('vce-codemirror'));
  }

  function start() {
    scan(document);

    const root = document.documentElement || document.body;
    if (!root) return;
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          scan(node);
        });
      });
    }).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
