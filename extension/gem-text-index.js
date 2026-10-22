// gem-text-index.js
// Shared text index for matching phrases that Emarsys/TinyMCE split across inline
// formatting tags, e.g. `ins (</span><span style="font-weight:bold">LearnLangAll)`.
//
// A "run" is a stretch of text that reads as continuous: consecutive text nodes joined
// across transparent inline tags (span, b, em, …). Links, <br>, block elements, ESL
// tokens and permanently hidden elements end a run, so matches never cross them.
(function () {
  'use strict';

  if (window.gemTextIndex) return;

  const TRANSPARENT_INLINE_TAGS = new Set([
    'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUP', 'SUB',
    'FONT', 'SMALL', 'BIG', 'MARK', 'ABBR', 'CITE', 'CODE', 'Q', 'TT', 'KBD', 'SAMP',
    'VAR', 'DFN', 'BDI', 'BDO', 'TIME', 'DATA', 'WBR',
  ]);

  const NEVER_TRAVERSE_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'TITLE']);

  function isEslToken(el) {
    return !!(
      el.matches &&
      (el.matches('span[e-token]') ||
        el.classList.contains('cbNonEditable') ||
        el.getAttribute('contenteditable') === 'false')
    );
  }

  /**
   * Permanently hidden via markup (inline display:none, mso-hide:all, or [hidden]).
   * Deliberately not getComputedStyle: responsive classes hide desktop/mobile variants
   * depending on the preview width, and that content must stay searchable.
   */
  function isPermanentlyHidden(el) {
    if (el.hasAttribute && el.hasAttribute('hidden')) return true;
    const style = el.getAttribute ? el.getAttribute('style') : '';
    if (!style) return false;
    return /(^|;)\s*display\s*:\s*none\b/i.test(style) || /mso-hide\s*:\s*all/i.test(style);
  }

  function isTransparentInline(el) {
    return TRANSPARENT_INLINE_TAGS.has(el.tagName) && !isEslToken(el);
  }

  /**
   * Collect text runs under `root`.
   *
   * Options:
   * - tokens: 'skip' (default) leaves ESL token text out entirely; 'isolate' keeps it as its own run.
   * - skipElement(el): extra predicate; true = do not traverse and end the current run.
   *
   * Returns [{ text, pieces: [{ node, start, end }] }] where start/end are offsets in run.text.
   */
  function collectTextRuns(root, options = {}) {
    const runs = [];
    if (!root) return runs;
    const tokenMode = options.tokens === 'isolate' ? 'isolate' : 'skip';
    const extraSkip = typeof options.skipElement === 'function' ? options.skipElement : null;

    let current = null;
    const flush = () => {
      if (current && current.text) runs.push(current);
      current = null;
    };

    const visit = (node) => {
      if (node.nodeType === 3) {
        const value = node.nodeValue;
        if (!value) return;
        if (!current) current = { text: '', pieces: [] };
        const start = current.text.length;
        current.text += value;
        current.pieces.push({ node, start, end: current.text.length });
        return;
      }
      if (node.nodeType !== 1) return;

      const el = node;
      if (NEVER_TRAVERSE_TAGS.has(el.tagName) || isPermanentlyHidden(el) || (extraSkip && extraSkip(el))) {
        flush();
        return;
      }
      if (isEslToken(el)) {
        flush();
        if (tokenMode === 'isolate') {
          el.childNodes.forEach(visit);
          flush();
        }
        return;
      }

      const transparent = isTransparentInline(el);
      if (!transparent) flush();
      el.childNodes.forEach(visit);
      if (!transparent) flush();
    };

    root.childNodes.forEach(visit);
    flush();
    return runs;
  }

  /** Map run offsets [start, end) to DOM boundary points. */
  function locate(run, start, end) {
    if (!run || !run.pieces.length || end <= start) return null;
    let startPiece = null;
    let endPiece = null;
    for (let i = 0; i < run.pieces.length; i++) {
      const p = run.pieces[i];
      if (!startPiece && start >= p.start && start < p.end) startPiece = p;
      if (end > p.start && end <= p.end) {
        endPiece = p;
        break;
      }
    }
    if (!startPiece || !endPiece) return null;
    return {
      startNode: startPiece.node,
      startOffset: start - startPiece.start,
      endNode: endPiece.node,
      endOffset: end - endPiece.start,
      crossesNodes: startPiece !== endPiece,
    };
  }

  function createRange(doc, run, start, end) {
    const loc = locate(run, start, end);
    if (!loc) return null;
    const range = doc.createRange();
    range.setStart(loc.startNode, loc.startOffset);
    range.setEnd(loc.endNode, loc.endOffset);
    return range;
  }

  function removeEmptyInlineAncestors(node, stopAt) {
    let cur = node;
    while (cur && cur !== stopAt && cur.parentNode) {
      const parent = cur.parentNode;
      const isEmptyText = cur.nodeType === 3 && cur.nodeValue === '';
      const isEmptyInline =
        cur.nodeType === 1 && isTransparentInline(cur) && cur.tagName !== 'WBR' && !cur.firstChild;
      if (!isEmptyText && !isEmptyInline) break;
      parent.removeChild(cur);
      cur = parent;
    }
  }

  /**
   * Replace run text [start, end) with `replacement` (Node or DocumentFragment).
   * The replacement is inserted where the match starts, so it inherits that position's
   * formatting (like typing over a selection). Inline wrappers emptied by the delete
   * are removed. Apply multiple matches in the same run from last to first.
   */
  function replaceRange(doc, run, start, end, replacement, { root } = {}) {
    const loc = locate(run, start, end);
    if (!loc) return false;

    const range = doc.createRange();
    range.setStart(loc.startNode, loc.startOffset);
    range.setEnd(loc.endNode, loc.endOffset);
    range.deleteContents();

    // deleteContents collapses to a point outside the start node's inline wrappers when the
    // range crosses elements; insert at the original start point to keep its formatting.
    const insertAt = doc.createRange();
    if (loc.startNode.parentNode) {
      insertAt.setStart(loc.startNode, Math.min(loc.startOffset, loc.startNode.nodeValue.length));
    } else {
      insertAt.setStart(range.startContainer, range.startOffset);
    }
    insertAt.collapse(true);
    const lastInserted = replacement.nodeType === 11 ? replacement.lastChild : replacement;
    insertAt.insertNode(replacement);

    const trailing = lastInserted && lastInserted.nextSibling;
    if (trailing && trailing.nodeType === 3 && trailing.nodeValue === '') {
      trailing.parentNode.removeChild(trailing);
    }
    if (loc.crossesNodes && loc.endNode !== loc.startNode) {
      removeEmptyInlineAncestors(loc.endNode, root || null);
    }
    if (loc.startNode.parentNode && loc.startNode.nodeValue === '') {
      loc.startNode.parentNode.removeChild(loc.startNode);
    }
    return true;
  }

  window.gemTextIndex = {
    collectTextRuns,
    locate,
    createRange,
    replaceRange,
    isEslToken,
    isPermanentlyHidden,
  };
})();
