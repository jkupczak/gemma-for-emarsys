(function () {
  'use strict';

  const MSG_SOURCE_EXT = 'gem-snippet-extension';
  const MSG_SOURCE_BRIDGE = 'gem-snippet-iframe-bridge';
  // Note: prefix intentionally does NOT match the debug-logging gate's
  // suppression regex (^\[Gem[\]\-\s]) so these diagnostics always print.
  const GEM_TR_LOG = '[GemTokenReplace][bridge]';

  function gemTrDescribeNode(node) {
    if (!node) return 'null';
    try {
      if (node.nodeType === Node.TEXT_NODE) {
        return '#text("' + (node.textContent || '').slice(0, 40) + '")';
      }
      const attrs = [];
      if (node.getAttribute && node.getAttribute('e-token')) attrs.push('e-token=' + node.getAttribute('e-token'));
      if (node.hasAttribute && node.hasAttribute('data-mce-selected')) attrs.push('data-mce-selected');
      if (node.hasAttribute && node.hasAttribute('data-mce-bogus')) attrs.push('data-mce-bogus');
      return '<' + (node.nodeName || '?').toLowerCase() + (attrs.length ? ' ' + attrs.join(' ') : '') + '> text="' + (node.textContent || '').slice(0, 40) + '" connected=' + node.isConnected;
    } catch (e) {
      return 'describe-error: ' + e.message;
    }
  }

  function gemTrDescribeRange(range) {
    if (!range) return 'null';
    try {
      return 'collapsed=' + range.collapsed + ' | start=' + gemTrDescribeNode(range.startContainer) + ' @' + range.startOffset + ' | end=' + gemTrDescribeNode(range.endContainer) + ' @' + range.endOffset;
    } catch (e) {
      return 'describe-error: ' + e.message;
    }
  }
  const GEM_CARET_MARKER_ATTR = 'data-gem-caret-marker';
  const patchedEditorIds = new Set();
  const caretByEditorId = new Map();

  const GEM_BODY_SYNC_LOG = '[GemBodySync][bridge]';

  function getTinyMCEFrom(win) {
    if (!win) return null;
    try {
      return win.tinymce || win.tinyMCE || null;
    } catch (_) {
      return null;
    }
  }

  function collectCandidateWindows() {
    const candidates = [window];
    try {
      if (window.parent && window.parent !== window) candidates.push(window.parent);
    } catch (_) {}
    try {
      if (window.top && window.top !== window) candidates.push(window.top);
    } catch (_) {}
    try {
      document.querySelectorAll('iframe').forEach((iframe) => {
        try {
          if (iframe.contentWindow) candidates.push(iframe.contentWindow);
        } catch (_) {}
      });
    } catch (_) {}
    return candidates;
  }

  function getTinyMCE() {
    let fallback = null;
    for (const win of collectCandidateWindows()) {
      const tm = getTinyMCEFrom(win);
      if (!tm) continue;
      if (Array.isArray(tm.editors) && tm.editors.length > 0) return tm;
      if (!fallback) fallback = tm;
    }
    return fallback;
  }

  function describeTinyMCELocation() {
    const spots = [];
    const check = (label, win) => {
      try {
        const tm = getTinyMCEFrom(win);
        if (!tm) {
          spots.push(`${label}=no`);
          return;
        }
        const count = Array.isArray(tm.editors) ? tm.editors.length : -1;
        const ids = Array.isArray(tm.editors)
          ? tm.editors
              .slice(0, 8)
              .map((ed) => (ed && ed.id) || '?')
              .join(',')
          : '';
        spots.push(`${label}=yes(count=${count}${ids ? ` ids=${ids}` : ''})`);
      } catch (_) {
        spots.push(`${label}=err`);
      }
    };
    check('self', window);
    try {
      check('parent', window.parent);
    } catch (_) {
      spots.push('parent=blocked');
    }
    try {
      check('top', window.top);
    } catch (_) {
      spots.push('top=blocked');
    }
    try {
      let iframeIdx = 0;
      document.querySelectorAll('iframe').forEach((iframe) => {
        const label = `iframe${iframeIdx++}`;
        try {
          check(label, iframe.contentWindow);
        } catch (_) {
          spots.push(`${label}=blocked`);
        }
      });
    } catch (_) {}
    return spots.join(' ');
  }

  function findEditorForElement(element) {
    if (!element) return null;
    for (const win of collectCandidateWindows()) {
      const tm = getTinyMCEFrom(win);
      if (!tm || !Array.isArray(tm.editors)) continue;
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
      try {
        const id = element.id;
        if (id && typeof tm.get === 'function') {
          const byId = tm.get(id);
          if (byId) return byId;
        }
      } catch (_) {}
    }
    return null;
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
    for (const win of collectCandidateWindows()) {
      const tm = getTinyMCEFrom(win);
      if (!tm || !Array.isArray(tm.editors)) continue;
      tm.editors.forEach((editor) => patchEditor(editor));
    }
  }

  function queryDocsForElement(fn) {
    const docs = [document];
    try {
      document.querySelectorAll('iframe').forEach((iframe) => {
        try {
          const idoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (idoc) docs.push(idoc);
        } catch (_) {}
      });
    } catch (_) {}

    for (const doc of docs) {
      try {
        const el = fn(doc);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function resolveElement(detail) {
    if (!detail) return null;

    if (detail.elementId) {
      const byId = queryDocsForElement((doc) => doc.getElementById(detail.elementId));
      if (byId) return byId;
    }

    const eEditable = detail.eEditable != null ? String(detail.eEditable) : '';
    const blockId = detail.blockId != null ? String(detail.blockId) : '';
    if (eEditable) {
      const matches = [];
      queryDocsForElement((doc) => {
        try {
          doc.querySelectorAll(`[e-editable="${eEditable}"]`).forEach((el) => matches.push(el));
        } catch (_) {}
        return null;
      });
      if (blockId) {
        const prefix = blockId.slice(0, 8);
        const byBlock = matches.find((el) => {
          try {
            const id = el.getAttribute('e-block-id') || '';
            return id === blockId || id === prefix || blockId.indexOf(id) === 0;
          } catch (_) {
            return false;
          }
        });
        if (byBlock) return byBlock;
      }
      if (matches.length === 1) return matches[0];
      if (matches.length) return matches[0];
    }

    return null;
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
      const el = resolveElement(detail) || document.getElementById(detail.elementId);
      editor = el ? findEditorForElement(el) : null;
    }

    if (!editor && detail && detail.eEditable != null) {
      const el = resolveElement(detail);
      editor = el ? findEditorForElement(el) : null;
    }

    if (!editor) {
      const tm = getTinyMCE();
      editor = tm && tm.activeEditor ? tm.activeEditor : null;
    }

    return editor;
  }

  function deepQuerySelectorAll(root, selector, out = []) {
    if (!root) return out;
    try {
      if (root.querySelectorAll) {
        root.querySelectorAll(selector).forEach((el) => out.push(el));
      }
    } catch (_) {}
    const visit = (node) => {
      if (!node) return;
      try {
        if (node.shadowRoot) deepQuerySelectorAll(node.shadowRoot, selector, out);
      } catch (_) {}
      try {
        const children = node.children || [];
        for (let i = 0; i < children.length; i += 1) visit(children[i]);
      } catch (_) {}
    };
    try {
      if (root === document) {
        visit(document.documentElement);
      } else if (root.children) {
        for (let i = 0; i < root.children.length; i += 1) visit(root.children[i]);
      }
    } catch (_) {}
    return out;
  }

  function describeEditorMeta(editor) {
    if (!editor) return null;
    const meta = {
      id: editor.id || null,
      editableId: editor.editableId || null,
      isDirty: null,
      startContentLen: null,
      contentLen: null,
      hasOnChange: false,
      settingKeys: [],
    };
    try {
      if (typeof editor.isDirty === 'function') meta.isDirty = !!editor.isDirty();
    } catch (_) {}
    try {
      if (editor.startContent != null) meta.startContentLen = String(editor.startContent).length;
    } catch (_) {}
    try {
      if (typeof editor.getContent === 'function') {
        meta.contentLen = String(editor.getContent({ format: 'raw' }) || '').length;
      }
    } catch (_) {}
    try {
      meta.hasOnChange = !!(editor.settings && typeof editor.settings.onchange === 'function');
      if (editor.settings) meta.settingKeys = Object.keys(editor.settings).slice(0, 30);
    } catch (_) {}
    try {
      if (editor.editableId == null && editor.settings && editor.settings.editableId != null) {
        meta.editableId = editor.settings.editableId;
      }
    } catch (_) {}
    return meta;
  }

  function notifyVcePluginsFromEditor(editor, el, target) {
    const fired = [];
    const html =
      target && target.html != null
        ? String(target.html)
        : editor && typeof editor.getContent === 'function'
          ? editor.getContent()
          : el
            ? String(el.innerHTML || '')
            : '';
    const editableId =
      (editor && (editor.editableId || (editor.settings && editor.settings.editableId))) ||
      (target && target.blockId && target.eEditable
        ? `${target.blockId}:${target.eEditable}`
        : null) ||
      (target && target.eEditable) ||
      (editor && editor.id) ||
      null;

    const iframeWin =
      (editor && editor.getWin && editor.getWin()) ||
      (el && el.ownerDocument && el.ownerDocument.defaultView) ||
      null;

    const detail = {
      editableId,
      data: html,
      content: html,
      value: html,
      text: el ? String(el.textContent || '') : '',
      window: iframeWin,
      blockId: target && target.blockId ? target.blockId : null,
      eEditable: target && target.eEditable != null ? target.eEditable : null,
    };

    const plugins = deepQuerySelectorAll(document, 'vce-plugin-editable-text');
    const hosts = [
      ...plugins,
      ...deepQuerySelectorAll(document, 'vce-preview'),
      ...deepQuerySelectorAll(document, 'vce-iframes-container'),
      ...deepQuerySelectorAll(document, 'cb-content-renderer'),
    ];

    hosts.forEach((host) => {
      ['change', 'continuousChange', 'update', 'input'].forEach((type) => {
        try {
          host.dispatchEvent(
            new CustomEvent(type, {
              bubbles: true,
              composed: true,
              detail,
            })
          );
          fired.push(`${(host.tagName || '?').toLowerCase()}:${type}`);
        } catch (_) {}
      });
    });

    return {
      pluginCount: plugins.length,
      hostCount: hosts.length,
      editableId,
      fired: fired.slice(0, 40),
    };
  }

  function getSelectedLanguageCode() {
    try {
      const selector = document.querySelector('vce-languages-selector');
      if (!selector) return null;
      const selected = selector.querySelector('e-select-option[selected="true"]');
      return selected ? selected.getAttribute('value') : null;
    } catch (_) {
      return null;
    }
  }

  function rememberFieldOverrides(targets) {
    const lang = getSelectedLanguageCode() || 'unknown';
    window.__gemBodyFieldOverrides = window.__gemBodyFieldOverrides || {};
    const bucket = window.__gemBodyFieldOverrides[lang] || (window.__gemBodyFieldOverrides[lang] = {});
    const remembered = [];

    (targets || []).forEach((target) => {
      if (!target || target.eEditable == null || target.html == null) return;
      const eEditable = String(target.eEditable);
      const blockId = target.blockId != null ? String(target.blockId) : '';
      const key = `${blockId}:${eEditable}`;
      bucket[key] = {
        html: String(target.html),
        eEditable,
        blockId,
        at: Date.now(),
      };
      remembered.push({ lang, key, htmlLen: String(target.html).length });
    });

    console.log(GEM_BODY_SYNC_LOG, 'overrides-remember', {
      lang,
      count: remembered.length,
      keys: remembered.map((r) => r.key),
    });
    return remembered;
  }

  function replaceEditableInnerInHtmlString(html, eEditable, newInner, blockId) {
    const source = String(html || '');
    const name = String(eEditable || '');
    if (!source || !name) return { ok: false, reason: 'missing-args', html: source };

    const marker = `e-editable="${name}"`;
    const altMarker = `e-editable='${name}'`;
    let searchFrom = 0;
    while (searchFrom < source.length) {
      let markerIdx = source.indexOf(marker, searchFrom);
      let markerLen = marker.length;
      if (markerIdx === -1) {
        markerIdx = source.indexOf(altMarker, searchFrom);
        markerLen = altMarker.length;
      }
      if (markerIdx === -1) break;

      const tagStart = source.lastIndexOf('<', markerIdx);
      if (tagStart === -1 || tagStart < searchFrom) {
        searchFrom = markerIdx + markerLen;
        continue;
      }

      const tagEnd = source.indexOf('>', markerIdx);
      if (tagEnd === -1) break;

      const openTag = source.slice(tagStart, tagEnd + 1);
      if (/\/\s*>$/.test(openTag)) {
        searchFrom = tagEnd + 1;
        continue;
      }

      const tagNameMatch = openTag.match(/^<\s*([a-zA-Z0-9:-]+)/);
      if (!tagNameMatch) {
        searchFrom = tagEnd + 1;
        continue;
      }
      const tagName = tagNameMatch[1];
      const blockPrefix = blockId ? String(blockId).slice(0, 8) : '';

      if (blockId) {
        const openHasBlock =
          openTag.indexOf(`e-block-id="${blockId}"`) !== -1 ||
          openTag.indexOf(`e-block-id='${blockId}'`) !== -1 ||
          (blockPrefix && openTag.indexOf(`e-block-id="${blockPrefix}"`) !== -1);
        if (!openHasBlock) {
          const rest = source.slice(tagEnd + 1);
          const laterWithBlock =
            (rest.indexOf(`e-editable="${name}"`) !== -1 || rest.indexOf(`e-editable='${name}'`) !== -1) &&
            (rest.indexOf(`e-block-id="${blockId}"`) !== -1 ||
              rest.indexOf(`e-block-id='${blockId}'`) !== -1 ||
              (blockPrefix && rest.indexOf(`e-block-id="${blockPrefix}"`) !== -1));
          if (laterWithBlock) {
            searchFrom = tagEnd + 1;
            continue;
          }
        }
      }

      const closeTag = `</${tagName}>`;
      const closeIdx = source.indexOf(closeTag, tagEnd + 1);
      if (closeIdx === -1) {
        searchFrom = tagEnd + 1;
        continue;
      }

      const prevInner = source.slice(tagEnd + 1, closeIdx);
      if (prevInner === newInner) {
        return { ok: true, changed: false, html: source, prevInner, nextInner: newInner };
      }

      const next = source.slice(0, tagEnd + 1) + newInner + source.slice(closeIdx);
      return { ok: true, changed: true, html: next, prevInner, nextInner: newInner };
    }

    return { ok: false, reason: 'no-match', html: source };
  }

  function applyFieldOverridesToHtml(html, lang) {
    const source = String(html || '');
    const overridesRoot = window.__gemBodyFieldOverrides || {};
    const langKey = lang || getSelectedLanguageCode() || window.__gemBodyPendingLang || null;
    const bucket = (langKey && overridesRoot[langKey]) || null;
    if (!bucket || !source) {
      return { html: source, changed: false, applied: 0, lang: langKey };
    }

    let next = source;
    let applied = 0;
    Object.keys(bucket).forEach((key) => {
      const entry = bucket[key];
      if (!entry || entry.html == null || entry.eEditable == null) return;
      const replaced = replaceEditableInnerInHtmlString(
        next,
        entry.eEditable,
        String(entry.html),
        entry.blockId || ''
      );
      if (replaced.ok && replaced.changed) {
        next = replaced.html;
        applied += 1;
      }
    });

    return { html: next, changed: applied > 0, applied, lang: langKey };
  }

  function installPreviewContentOverrideHook() {
    if (window.__gemBodyContentOverrideHookInstalled) return;
    // Only meaningful on the parent campaign page that owns vce-iframes-container.
    if (!document.querySelector && true) {
      /* keep going; query later via observer */
    }
    window.__gemBodyContentOverrideHookInstalled = true;

    document.addEventListener(
      'click',
      (event) => {
        try {
          const opt =
            event.target && event.target.closest
              ? event.target.closest('e-select-option')
              : null;
          if (!opt || !opt.closest || !opt.closest('vce-languages-selector')) return;
          const value = opt.getAttribute('value');
          if (value) window.__gemBodyPendingLang = value;
        } catch (_) {}
      },
      true
    );

    const patchContainer = (container) => {
      if (!container || container.__gemBodyContentPatched) return;
      container.__gemBodyContentPatched = true;

      const originalSetAttribute = container.setAttribute.bind(container);
      const writeContent = (value, via) => {
        if (container.__gemApplyingOverride) {
          return originalSetAttribute('content', value);
        }
        const lang = window.__gemBodyPendingLang || getSelectedLanguageCode() || null;
        const applied = applyFieldOverridesToHtml(value, lang);
        if (applied.changed) {
          console.log(
            GEM_BODY_SYNC_LOG,
            'content-override-flat',
            `via=${via} lang=${applied.lang || '-'} applied=${applied.applied} beforeLen=${String(value || '').length} afterLen=${applied.html.length}`
          );
          container.__gemApplyingOverride = true;
          try {
            return originalSetAttribute('content', applied.html);
          } finally {
            container.__gemApplyingOverride = false;
          }
        }
        return originalSetAttribute('content', value);
      };

      container.setAttribute = function (name, value) {
        if (String(name).toLowerCase() === 'content') {
          return writeContent(value, 'setAttribute');
        }
        return originalSetAttribute(name, value);
      };

      try {
        let current = null;
        try {
          current = container.getAttribute('content');
        } catch (_) {}
        Object.defineProperty(container, 'content', {
          configurable: true,
          enumerable: true,
          get() {
            try {
              return container.getAttribute('content');
            } catch (_) {
              return current;
            }
          },
          set(value) {
            writeContent(value, 'prop');
            try {
              current = container.getAttribute('content');
            } catch (_) {
              current = value;
            }
          },
        });
      } catch (_) {}

      // Fallback: Emarsys may set content via HTMLElement.prototype.setAttribute.call(...)
      try {
        new MutationObserver(() => {
          if (container.__gemApplyingOverride) return;
          try {
            const value = container.getAttribute('content');
            const lang = window.__gemBodyPendingLang || getSelectedLanguageCode() || null;
            const applied = applyFieldOverridesToHtml(value, lang);
            if (!applied.changed) return;
            console.log(
              GEM_BODY_SYNC_LOG,
              'content-override-flat',
              `via=mutation lang=${applied.lang || '-'} applied=${applied.applied} beforeLen=${String(value || '').length} afterLen=${applied.html.length}`
            );
            container.__gemApplyingOverride = true;
            try {
              originalSetAttribute('content', applied.html);
            } finally {
              container.__gemApplyingOverride = false;
            }
          } catch (_) {}
        }).observe(container, { attributes: true, attributeFilter: ['content'] });
      } catch (_) {}

      console.log(GEM_BODY_SYNC_LOG, 'content-override-hook: installed on container');
    };

    const scan = () => {
      try {
        document.querySelectorAll('vce-iframes-container').forEach(patchContainer);
      } catch (_) {}
    };

    scan();
    if (document.body) {
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', scan, { once: true });
    }
  }

  function extractCampaignFromNode(node) {
    if (!node || typeof node !== 'object') return null;
    try {
      if (node.contents && typeof node.contents === 'object' && (node.suite_campaign_id != null || node._id != null)) {
        return node;
      }
    } catch (_) {}
    try {
      if (node.campaign && node.campaign.contents) return node.campaign;
    } catch (_) {}
    try {
      if (node.data && node.data.campaign && node.data.campaign.contents) return node.data.campaign;
    } catch (_) {}
    return null;
  }

  function collectCampaignModels() {
    const found = [];
    const seen = new WeakSet();
    const push = (campaign, source) => {
      if (!campaign || typeof campaign !== 'object') return;
      try {
        if (seen.has(campaign)) return;
        seen.add(campaign);
      } catch (_) {}
      found.push({ campaign, source });
    };

    try {
      const snapshots = window.__gemContentBlocksSnapshots || {};
      Object.keys(snapshots).forEach((id) => {
        const snap = snapshots[id];
        const campaign = extractCampaignFromNode(snap);
        if (campaign) push(campaign, `snapshot:${id}`);
      });
    } catch (_) {}

    const hostSelectors = [
      'vce-preview',
      'vce-iframes-container',
      'cb-content-renderer',
      'cb-desktop-preview',
      'cb-content-preview',
      'vce-languages-selector',
    ];
    hostSelectors.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el, idx) => {
          const keys = [
            'campaign',
            'campaignData',
            'model',
            'state',
            'data',
            '__data',
            '__campaign',
            'contents',
          ];
          keys.forEach((key) => {
            try {
              const campaign = extractCampaignFromNode(el[key]);
              if (campaign) push(campaign, `${sel}[${idx}].${key}`);
            } catch (_) {}
          });
          try {
            if (el.__data) {
              Object.keys(el.__data).slice(0, 40).forEach((key) => {
                try {
                  const campaign = extractCampaignFromNode(el.__data[key]);
                  if (campaign) push(campaign, `${sel}[${idx}].__data.${key}`);
                } catch (_) {}
              });
            }
          } catch (_) {}
        });
      } catch (_) {}
    });

    // Shallow scan of window globals for a live campaign model.
    try {
      Object.keys(window)
        .filter((key) => /campaign|emarsys|contentblock|vce|store|state/i.test(key))
        .slice(0, 80)
        .forEach((key) => {
          try {
            const campaign = extractCampaignFromNode(window[key]);
            if (campaign) push(campaign, `window.${key}`);
          } catch (_) {}
        });
    } catch (_) {}

    return found;
  }

  function blockIdMatches(blockId, targetBlockId) {
    const a = String(blockId || '');
    const b = String(targetBlockId || '');
    if (!a || !b) return false;
    return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  function patchCampaignEditableValue(campaign, target, html, lang) {
    const results = [];
    if (!campaign || !campaign.contents || typeof campaign.contents !== 'object') {
      return results;
    }
    const eEditable = target && target.eEditable != null ? String(target.eEditable) : '';
    if (!eEditable) return results;

    const langs = lang ? [lang] : Object.keys(campaign.contents);
    langs.forEach((langKey) => {
      const entry = campaign.contents[langKey];
      const blocks = entry && Array.isArray(entry.blocks) ? entry.blocks : [];
      blocks.forEach((block, blockIndex) => {
        if (!block || !block.content || typeof block.content !== 'object') return;
        if (target.blockId && !blockIdMatches(block._id, target.blockId)) return;
        const field = block.content[eEditable];
        if (!field || typeof field !== 'object') return;
        const before = field.value != null ? String(field.value) : '';
        const next = html != null ? String(html) : before;
        if (before === next) {
          results.push({
            lang: langKey,
            blockId: block._id,
            eEditable,
            changed: false,
            beforeLen: before.length,
            afterLen: next.length,
            blockIndex,
          });
          return;
        }
        try {
          field.value = next;
          results.push({
            lang: langKey,
            blockId: block._id,
            eEditable,
            changed: true,
            beforeLen: before.length,
            afterLen: next.length,
            beforeSnippet: before.replace(/\s+/g, ' ').trim().slice(0, 40),
            afterSnippet: next.replace(/\s+/g, ' ').trim().slice(0, 40),
            blockIndex,
          });
        } catch (e) {
          results.push({
            lang: langKey,
            blockId: block._id,
            eEditable,
            changed: false,
            error: e && e.message ? e.message : String(e),
            blockIndex,
          });
        }
      });
    });
    return results;
  }

  function patchLiveCampaignModels(targets) {
    const lang = getSelectedLanguageCode();
    const models = collectCampaignModels();
    const report = {
      lang,
      modelCount: models.length,
      modelSources: models.map((m) => m.source),
      patches: [],
    };

    models.forEach((entry) => {
      (targets || []).forEach((target) => {
        const html = target && target.html != null ? String(target.html) : '';
        const patched = patchCampaignEditableValue(entry.campaign, target, html, lang);
        if (patched.length) {
          report.patches.push({
            source: entry.source,
            suiteCampaignId: entry.campaign.suite_campaign_id || null,
            results: patched,
          });
        }
      });
    });

    console.log(GEM_BODY_SYNC_LOG, 'campaign-model-patch', report);
    console.log(
      GEM_BODY_SYNC_LOG,
      'campaign-model-flat',
      `lang=${lang || '-'} models=${models.length} sources=${report.modelSources.join(',') || 'none'} ` +
        (report.patches.length
          ? report.patches
              .map((p) => {
                const changed = (p.results || []).filter((r) => r.changed).length;
                const total = (p.results || []).length;
                return `${p.source}:changed=${changed}/${total}`;
              })
              .join(' | ')
          : 'patched=none')
    );

    return report;
  }

  function markEditorDirty(editor, options = {}) {
    if (!editor) return { dirty: false, fired: [], meta: null };
    const fired = [];
    const forceStartMismatch = options.forceStartMismatch !== false;
    try {
      if (typeof editor.focus === 'function') {
        editor.focus(false);
        fired.push('focus');
      }
    } catch (_) {}

    // TinyMCE/Emarsys often treat "no delta vs startContent" as clean even when
    // isDirty is forced. Keep startContent intentionally stale so blur/save
    // paths see a real change.
    if (forceStartMismatch) {
      try {
        const now =
          typeof editor.getContent === 'function' ? String(editor.getContent({ format: 'raw' }) || '') : '';
        editor.startContent = `${now}<!--gem-stale-start-->`;
        fired.push('startContentMismatch');
      } catch (_) {}
    }

    try {
      if (typeof editor.nodeChanged === 'function') {
        editor.nodeChanged();
        fired.push('nodeChanged');
      }
    } catch (_) {}
    try {
      if (editor.undoManager && typeof editor.undoManager.add === 'function') {
        editor.undoManager.add();
        fired.push('undoAdd');
      }
    } catch (_) {}
    try {
      if (typeof editor.setDirty === 'function') {
        editor.setDirty(true);
        fired.push('setDirty');
      }
    } catch (_) {}
    try {
      if (typeof editor.fire === 'function') {
        editor.fire('input');
        editor.fire('change');
        editor.fire('Change');
        editor.fire('NodeChange');
        fired.push('fire:input,change,Change,NodeChange');
      }
    } catch (_) {}
    try {
      if (editor.settings && typeof editor.settings.onchange === 'function') {
        editor.settings.onchange();
        fired.push('settings.onchange');
      }
    } catch (_) {}
    try {
      if (typeof editor.save === 'function') {
        editor.save();
        fired.push('save');
      }
    } catch (_) {}
    try {
      const tm = getTinyMCE();
      if (tm && typeof tm.triggerSave === 'function') {
        tm.triggerSave();
        fired.push('triggerSave');
      }
    } catch (_) {}

    // Force dirty after save/triggerSave — those APIs often clear isNotDirty.
    try {
      editor.isNotDirty = false;
      if (typeof editor.setDirty === 'function') editor.setDirty(true);
      fired.push('forceIsNotDirtyFalse');
    } catch (_) {}

    return { dirty: true, fired, meta: describeEditorMeta(editor) };
  }

  function handleCommitEditable(event, data) {
    const targets = Array.isArray(data && data.targets) ? data.targets : [data];
    const results = [];
    const tinymceWhere = describeTinyMCELocation();
    console.log(GEM_BODY_SYNC_LOG, 'commit-editable:start', {
      targetCount: targets.length,
      tinymceWhere,
    });

    targets.forEach((target, index) => {
      const info = {
        index,
        eEditable: target && target.eEditable != null ? String(target.eEditable) : null,
        elementId: target && target.elementId ? String(target.elementId) : null,
        blockId: target && target.blockId ? String(target.blockId) : null,
        elementFound: false,
        editorFound: false,
        editorId: null,
        setContent: false,
        dirty: false,
        fired: [],
        vce: null,
        meta: null,
        error: null,
      };

      try {
        syncEditors();
        const el = resolveElement(target);
        info.elementFound = !!el;

        let editor = el ? findEditorForElement(el) : null;
        if (!editor) editor = resolveEditor(target);
        if (editor) {
          info.editorFound = true;
          info.editorId = editor.id || null;
          info.meta = describeEditorMeta(editor);
        }

        if (editor && target && target.html != null && typeof editor.setContent === 'function') {
          try {
            const nextHtml = String(target.html);
            const current =
              typeof editor.getContent === 'function' ? editor.getContent({ format: 'raw' }) : null;
            // Only setContent when TinyMCE's view differs. Avoid no-op setContent
            // which can reset startContent / dirty bookkeeping.
            if (current !== nextHtml) {
              if (editor.undoManager && typeof editor.undoManager.transact === 'function') {
                editor.undoManager.transact(() => editor.setContent(nextHtml, { format: 'raw' }));
              } else {
                editor.setContent(nextHtml, { format: 'raw' });
              }
              info.setContent = true;
            }
          } catch (e) {
            info.error = e && e.message ? e.message : String(e);
          }
        } else if (el && target && target.html != null) {
          try {
            el.innerHTML = String(target.html);
          } catch (_) {}
        }

        if (editor) {
          const marked = markEditorDirty(editor);
          info.dirty = marked.dirty;
          info.fired = marked.fired;
          info.meta = marked.meta || info.meta;
        }

        try {
          info.vce = notifyVcePluginsFromEditor(editor, el, target);
        } catch (e) {
          info.vce = { error: e && e.message ? e.message : String(e) };
        }
      } catch (e) {
        info.error = e && e.message ? e.message : String(e);
      }

      results.push(info);
    });

    let modelPatch = null;
    try {
      rememberFieldOverrides(targets);
      installPreviewContentOverrideHook();
      modelPatch = patchLiveCampaignModels(targets);
    } catch (e) {
      modelPatch = { error: e && e.message ? e.message : String(e) };
    }

    console.log(GEM_BODY_SYNC_LOG, 'commit-editable:done', {
      tinymceWhere,
      results,
      modelPatch,
    });
    console.log(
      GEM_BODY_SYNC_LOG,
      'commit-editable-flat',
      `tinymce[${tinymceWhere}] ` +
        (results
          .map((r) => {
            const vce = r.vce
              ? `vcePlugins=${r.vce.pluginCount || 0}:editableId=${r.vce.editableId || '-'}`
              : 'vce=no';
            const dirtyState =
              r.meta && r.meta.isDirty != null ? `isDirty=${r.meta.isDirty}` : 'isDirty=?';
            return `${r.eEditable || r.elementId || '?'}:el=${r.elementFound}:ed=${
              r.editorFound ? r.editorId || 'yes' : 'no'
            }:set=${r.setContent}:dirty=${r.dirty}:${dirtyState}:${vce}`;
          })
          .join(' | ') || 'none')
    );

    const modelChanged = !!(
      modelPatch &&
      Array.isArray(modelPatch.patches) &&
      modelPatch.patches.some((p) => (p.results || []).some((r) => r.changed))
    );
    const ok = results.some((r) => r.editorFound && r.dirty) || modelChanged;
    reply(event, {
      requestId: data.requestId,
      type: 'commit-editable-result',
      ok,
      tinymceWhere,
      results,
      modelPatch,
    });
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

  // Locate a node the extension flagged for replacement. Resolved here, after
  // editor.focus(), so TinyMCE's focus-time DOM churn (fake carets, off-screen
  // selection helpers) can't invalidate it the way serialized index paths can.
  function findReplaceTargetNode(editor, attr) {
    if (!attr || !/^[\w-]+$/.test(attr)) return null;
    try {
      const body = editor.getBody && editor.getBody();
      if (!body) {
        console.log(GEM_TR_LOG, 'findReplaceTargetNode: no editor body');
        return null;
      }
      const candidates = body.querySelectorAll('[' + attr + ']');
      console.log(
        GEM_TR_LOG,
        'findReplaceTargetNode: candidates =',
        candidates.length,
        Array.prototype.map.call(candidates, function (cand) {
          return gemTrDescribeNode(cand) + (cand.closest('[data-mce-bogus]') ? ' [inside bogus container]' : '');
        })
      );
      let target = null;
      candidates.forEach((cand) => {
        // TinyMCE clones selected cE=false nodes into a bogus off-screen
        // container; skip clones and only match the real node.
        if (!target && !cand.closest('[data-mce-bogus]')) {
          target = cand;
        }
        cand.removeAttribute(attr);
      });
      console.log(GEM_TR_LOG, 'findReplaceTargetNode: target =', gemTrDescribeNode(target));
      return target;
    } catch (e) {
      console.log(GEM_TR_LOG, 'findReplaceTargetNode: error:', e.message);
      return null;
    }
  }

  function restoreEditorSelection(editor, detail) {
    if (!editor || !editor.selection) return false;

    console.log(GEM_TR_LOG, 'restoreEditorSelection: detail =', {
      replaceTargetAttr: (detail && detail.replaceTargetAttr) || null,
      selectionRange: (detail && detail.selectionRange) || null,
      point: (detail && detail.point) || null,
      hasCaret: !!(detail && detail.caret),
    });
    try {
      console.log(GEM_TR_LOG, 'restoreEditorSelection: selection BEFORE focus:', gemTrDescribeRange(editor.selection.getRng()));
    } catch (_) {}

    try {
      editor.focus();
    } catch (_) {}

    try {
      console.log(GEM_TR_LOG, 'restoreEditorSelection: selection AFTER focus:', gemTrDescribeRange(editor.selection.getRng()));
    } catch (_) {}

    if (detail && detail.replaceTargetAttr) {
      const target = findReplaceTargetNode(editor, detail.replaceTargetAttr);
      if (target) {
        try {
          const range = document.createRange();
          range.selectNode(target);
          if (typeof editor.selection.setRng === 'function') {
            editor.selection.setRng(range);
            console.log(GEM_TR_LOG, 'restoreEditorSelection: used replace-target node; setRng =', gemTrDescribeRange(range), '; getRng after set =', gemTrDescribeRange(editor.selection.getRng()));
            return true;
          }
        } catch (e) {
          console.log(GEM_TR_LOG, 'restoreEditorSelection: replace-target setRng failed:', e.message);
        }
      }
    }

    if (detail && detail.selectionRange) {
      const selectionRange = restoreRangeFromSerialized(detail.selectionRange);
      console.log(GEM_TR_LOG, 'restoreEditorSelection: serialized selectionRange resolved to:', gemTrDescribeRange(selectionRange));
      if (selectionRange && typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(selectionRange);
        console.log(GEM_TR_LOG, 'restoreEditorSelection: used serialized selectionRange; getRng after set =', gemTrDescribeRange(editor.selection.getRng()));
        return true;
      }
    }

    const point = detail && detail.point;
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      const editorDoc = editor.getDoc && editor.getDoc();
      const pointRange = rangeFromPoint(editorDoc || document, point.x, point.y);
      if (pointRange && typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(pointRange);
        console.log(GEM_TR_LOG, 'restoreEditorSelection: used point fallback:', point, gemTrDescribeRange(pointRange));
        return true;
      }
    }

    const caret = (detail && detail.caret) || caretByEditorId.get(editor.id) || null;
    try {
      if (caret && caret.bookmark && typeof editor.selection.moveToBookmark === 'function') {
        editor.selection.moveToBookmark(caret.bookmark);
        console.log(GEM_TR_LOG, 'restoreEditorSelection: used caret BOOKMARK fallback; getRng =', gemTrDescribeRange(editor.selection.getRng()));
        return true;
      }
      const range = restoreRangeFromCaret(caret);
      if (range && typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(range);
        console.log(GEM_TR_LOG, 'restoreEditorSelection: used caret RANGE fallback:', gemTrDescribeRange(range));
        return true;
      }
    } catch (_) {}

    console.log(GEM_TR_LOG, 'restoreEditorSelection: NO selection restored (TinyMCE will insert at its current selection)');
    return false;
  }

  function reply(event, payload) {
    const message = {
      source: MSG_SOURCE_BRIDGE,
      ...payload,
    };
    if (event && event.source && typeof event.source.postMessage === 'function') {
      try {
        event.source.postMessage(message, event.origin || '*');
      } catch (_) {}
    }
    // Same-window callers (content script -> parent MAIN world) also listen here.
    try {
      window.postMessage(message, '*');
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('gem-body-sync-result', { detail: message }));
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

  function placeCaretAfterMarker(editor) {
    const editorDoc = (editor && editor.getDoc && editor.getDoc()) || document;
    const marker = editorDoc.querySelector(`[${GEM_CARET_MARKER_ATTR}]`);
    if (!marker || !editor || !editor.selection) return false;

    try {
      const range = editorDoc.createRange();
      range.setStartAfter(marker);
      range.collapse(true);
      marker.remove();
      editor.focus();
      if (typeof editor.selection.setRng === 'function') {
        editor.selection.setRng(range);
      }
      if (typeof editor.nodeChanged === 'function') {
        editor.nodeChanged();
      }
      return true;
    } catch (_) {
      try {
        marker.remove();
      } catch (_) {}
    }

    return false;
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

      try {
        console.log(GEM_TR_LOG, 'handleInsert: selection RIGHT BEFORE mceInsertContent:', gemTrDescribeRange(editor.selection.getRng()));
        console.log(GEM_TR_LOG, 'handleInsert: selection.getNode() =', gemTrDescribeNode(editor.selection.getNode()));
      } catch (_) {}

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

      try {
        console.log(GEM_TR_LOG, 'handleInsert: selection AFTER mceInsertContent:', gemTrDescribeRange(editor.selection.getRng()));
      } catch (_) {}

      if (typeof editor.setDirty === 'function') editor.setDirty(true);
      if (typeof editor.fire === 'function') editor.fire('change');
      placeCaretAfterMarker(editor);
      requestAnimationFrame(() => {
        placeCaretAfterMarker(editor);
      });
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
      return;
    }

    if (data.type === 'commit-editable') {
      handleCommitEditable(event, data);
      return;
    }

    if (data.type === 'probe-tinymce') {
      reply(event, {
        requestId: data.requestId,
        type: 'probe-tinymce-result',
        ok: !!getTinyMCE(),
        tinymceWhere: describeTinyMCELocation(),
      });
    }
  });

  window.addEventListener('gem-body-sync-commit', (event) => {
    const detail = event && event.detail;
    if (!detail || !detail.requestId) return;
    handleCommitEditable({ source: window }, { ...detail, source: MSG_SOURCE_EXT });
  });

  function boot() {
    syncEditors();
    try {
      installPreviewContentOverrideHook();
    } catch (_) {}
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
  try {
    console.log(GEM_BODY_SYNC_LOG, 'ready', describeTinyMCELocation());
  } catch (_) {}
})();
