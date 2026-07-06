(function () {
  'use strict';

  const MSG_SOURCE_EXT = 'gem-snippet-extension';
  const MSG_SOURCE_BRIDGE = 'gem-snippet-iframe-bridge';
  const patchedEditorIds = new Set();
  const caretByEditorId = new Map();

  function getTinyMCE() {
    return window.tinymce || window.tinyMCE || null;
  }

  function findEditorForElement(element) {
    const tm = getTinyMCE();
    if (!tm || !Array.isArray(tm.editors) || !element) return null;
    for (const editor of tm.editors) {
      if (!editor) continue;
      try {
        const target = editor.targetElm;
        if (target && (target === element || target.contains(element) || element.contains(target))) {
          return editor;
        }
        const body = editor.getBody && editor.getBody();
        if (body && (body === element || body.contains(element) || element.contains(body))) {
          return editor;
        }
      } catch (_) {}
    }
    return tm.activeEditor || null;
  }

  function getNodePath(node) {
    const path = [];
    let current = node;
    while (current && current !== document) {
      const parent = current.parentNode;
      if (!parent) break;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return path;
  }

  function resolveNodePath(path) {
    if (!Array.isArray(path) || !path.length) return null;
    let node = document;
    for (const index of path) {
      if (!node || !node.childNodes || !node.childNodes[index]) return null;
      node = node.childNodes[index];
    }
    return node;
  }

  function restoreRangeFromCaret(caret) {
    if (!caret) return null;
    try {
      if (caret.rangeStartPath && caret.rangeStartPath.length) {
        const startContainer = resolveNodePath(caret.rangeStartPath);
        const endContainer = resolveNodePath(caret.rangeEndPath || caret.rangeStartPath);
        if (startContainer && endContainer) {
          const range = document.createRange();
          range.setStart(startContainer, caret.rangeStartOffset || 0);
          range.setEnd(endContainer, caret.rangeEndOffset || caret.rangeStartOffset || 0);
          return range;
        }
      }
    } catch (_) {}
    return null;
  }

  function rangeFromPoint(doc, x, y) {
    if (!doc || typeof x !== 'number' || typeof y !== 'number') return null;
    try {
      if (typeof doc.caretRangeFromPoint === 'function') {
        return doc.caretRangeFromPoint(x, y);
      }
      if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode) {
          const range = doc.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
          return range;
        }
      }
    } catch (_) {}
    return null;
  }

  function saveCaretFromEditor(editor) {
    if (!editor || !editor.initialized || !editor.selection) return;
    try {
      const bookmark =
        typeof editor.selection.getBookmark === 'function'
          ? editor.selection.getBookmark(2, true)
          : null;
      let range = null;
      if (typeof editor.selection.getRng === 'function') {
        range = editor.selection.getRng();
      }
      caretByEditorId.set(editor.id, {
        editorId: editor.id,
        bookmark,
        rangeStartPath: range ? getNodePath(range.startContainer) : null,
        rangeStartOffset: range ? range.startOffset : null,
        rangeEndPath: range ? getNodePath(range.endContainer) : null,
        rangeEndOffset: range ? range.endOffset : null,
        at: Date.now(),
      });
    } catch (_) {}
  }

  function patchEditor(editor) {
    if (!editor || !editor.id || patchedEditorIds.has(editor.id)) return;

    const attach = () => {
      if (!editor.initialized) return;
      const body = editor.getBody && editor.getBody();
      if (!body) return;

      patchedEditorIds.add(editor.id);
      const save = () => saveCaretFromEditor(editor);

      body.addEventListener('keyup', save, false);
      body.addEventListener('mouseup', save, false);
      body.addEventListener('input', save, false);
      body.addEventListener('focus', save, false);

      if (typeof editor.on === 'function') {
        editor.on('keyup', save);
        editor.on('mouseup', save);
        editor.on('NodeChange', save);
        editor.on('SetContent', save);
      }

      save();
    };

    if (editor.initialized) {
      attach();
    } else if (typeof editor.on === 'function') {
      editor.on('init', attach);
    }
  }

  function syncEditors() {
    const tm = getTinyMCE();
    if (!tm || !Array.isArray(tm.editors)) return;
    tm.editors.forEach((editor) => patchEditor(editor));
  }

  function resolveEditor(detail) {
    syncEditors();
    let editor = null;

    if (detail && detail.editorId) {
      const tm = getTinyMCE();
      editor =
        tm && Array.isArray(tm.editors)
          ? tm.editors.find((ed) => ed && ed.id === detail.editorId)
          : null;
    }

    if (!editor && detail && detail.elementId) {
      const el = document.getElementById(detail.elementId);
      editor = el ? findEditorForElement(el) : null;
    }

    if (!editor) {
      const tm = getTinyMCE();
      editor = tm && tm.activeEditor ? tm.activeEditor : null;
    }

    return editor;
  }

  function restoreRangeFromSerialized(serialized) {
    if (!serialized || !serialized.startPath || !serialized.startPath.length) return null;
    try {
      const startContainer = resolveNodePath(serialized.startPath);
      const endContainer = resolveNodePath(serialized.endPath || serialized.startPath);
      if (startContainer && endContainer) {
        const range = document.createRange();
        range.setStart(startContainer, serialized.startOffset || 0);
        range.setEnd(endContainer, serialized.endOffset != null ? serialized.endOffset : serialized.startOffset || 0);
        return range;
      }
    } catch (_) {}
    return null;
  }

  function restoreEditorSelection(editor, detail) {
    if (!editor || !editor.selection) return false;

    try {
      editor.focus();
    } catch (_) {}

    if (detail && detail.selectionRange) {
      const selectionRange = restoreRangeFromSerialized(detail.selectionRange);
      if (selectionRange && typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(selectionRange);
        return true;
      }
    }

    const point = detail && detail.point;
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      const editorDoc = editor.getDoc && editor.getDoc();
      const pointRange = rangeFromPoint(editorDoc || document, point.x, point.y);
      if (pointRange && typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(pointRange);
        return true;
      }
    }

    const caret = (detail && detail.caret) || caretByEditorId.get(editor.id) || null;
    try {
      if (caret && caret.bookmark && typeof editor.selection.moveToBookmark === 'function') {
        editor.selection.moveToBookmark(caret.bookmark);
        return true;
      }
      const range = restoreRangeFromCaret(caret);
      if (range && typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(range);
        return true;
      }
    } catch (_) {}

    return false;
  }

  function reply(event, payload) {
    if (!event || !event.source || typeof event.source.postMessage !== 'function') return;
    try {
      event.source.postMessage(
        {
          source: MSG_SOURCE_BRIDGE,
          ...payload,
        },
        event.origin || '*'
      );
    } catch (_) {}
  }

  function handleGetCaret(event, data) {
    const editor = resolveEditor(data);
    if (editor) {
      saveCaretFromEditor(editor);
    }
    const caret = editor ? caretByEditorId.get(editor.id) : null;
    reply(event, {
      requestId: data.requestId,
      type: 'caret',
      ok: !!caret,
      editorId: editor ? editor.id : null,
      caret,
    });
  }

  function handleInsert(event, data) {
    let ok = false;
    let error = null;

    try {
      const editor = resolveEditor(data);
      if (!editor) {
        throw new Error('TinyMCE editor not found');
      }

      restoreEditorSelection(editor, data);

      const html = data.html != null ? String(data.html) : '';
      const insert = () => {
        if (typeof editor.execCommand === 'function') {
          editor.execCommand('mceInsertContent', false, html);
        } else if (typeof editor.insertContent === 'function') {
          editor.insertContent(html);
        } else {
          throw new Error('TinyMCE insert API unavailable');
        }
        if (typeof editor.nodeChanged === 'function') {
          editor.nodeChanged();
        }
      };

      if (editor.undoManager && typeof editor.undoManager.transact === 'function') {
        editor.undoManager.transact(insert);
      } else {
        insert();
        if (editor.undoManager && typeof editor.undoManager.add === 'function') {
          editor.undoManager.add();
        }
      }

      if (typeof editor.setDirty === 'function') editor.setDirty(true);
      if (typeof editor.fire === 'function') editor.fire('change');
      ok = true;
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }

    reply(event, {
      requestId: data.requestId,
      type: 'insert-result',
      ok,
      error,
    });
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== MSG_SOURCE_EXT || !data.requestId) return;

    if (data.type === 'get-caret') {
      handleGetCaret(event, data);
      return;
    }

    if (data.type === 'insert') {
      handleInsert(event, data);
    }
  });

  function boot() {
    syncEditors();
    if (document.body) {
      new MutationObserver(syncEditors).observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    }
  }

  boot();
  window.__gemSnippetBridgeReady = true;
})();
