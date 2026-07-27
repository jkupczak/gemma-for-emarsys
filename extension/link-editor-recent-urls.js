console.log('[Gem] link-editor-recent-urls.js loaded');

(function () {
  'use strict';

  const STORAGE_KEY = 'gemRecentLinkEditorUrls';
  const MAX_RECENT_URLS = 5;
  const MOUNT_ATTR = 'data-gem-recent-urls-mounted';
  const APPLY_BOUND_ATTR = 'data-gem-recent-urls-apply-bound';

  const EXTERNAL_LINK_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="m256-240-56-56 384-384H240v-80h480v480h-80v-344L256-240Z"/></svg>';

  const DELETE_LINK_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>';

  /** @type {{ url: string, usedAt: number }[]} */
  let recentUrlsCache = [];
  let storageLoaded = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeUrlEntry(raw) {
    const url = String(raw?.url ?? raw ?? '').trim();
    if (!url) return null;
    const usedAt = Number(raw?.usedAt) || Date.now();
    return { url, usedAt };
  }

  function normalizeRecentUrlsState(raw) {
    const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    return items
      .map(normalizeUrlEntry)
      .filter(Boolean)
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, MAX_RECENT_URLS);
  }

  function loadRecentUrls(callback) {
    if (!chrome?.storage?.local) {
      recentUrlsCache = [];
      storageLoaded = true;
      if (callback) callback(recentUrlsCache);
      return;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: { version: 1, items: [] } }, (res) => {
      recentUrlsCache = normalizeRecentUrlsState(res[STORAGE_KEY]);
      storageLoaded = true;
      if (callback) callback(recentUrlsCache);
    });
  }

  function persistRecentUrls(callback) {
    const payload = { version: 1, items: recentUrlsCache };
    if (!chrome?.storage?.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEY]: payload }, () => {
      if (callback) callback();
    });
  }

  function rememberRecentUrl(url) {
    const trimmed = String(url ?? '').trim();
    if (!trimmed) return;

    const now = Date.now();
    const existingIdx = recentUrlsCache.findIndex((item) => item.url === trimmed);
    if (existingIdx >= 0) {
      recentUrlsCache[existingIdx].usedAt = now;
    } else {
      recentUrlsCache.unshift({ url: trimmed, usedAt: now });
    }

    recentUrlsCache.sort((a, b) => b.usedAt - a.usedAt);
    recentUrlsCache = recentUrlsCache.slice(0, MAX_RECENT_URLS);
    persistRecentUrls();
  }

  function removeRecentUrl(url) {
    const trimmed = String(url ?? '').trim();
    if (!trimmed) return false;
    const next = recentUrlsCache.filter((item) => item.url !== trimmed);
    if (next.length === recentUrlsCache.length) return false;
    recentUrlsCache = next;
    persistRecentUrls();
    return true;
  }

  function isOpenableUrl(url) {
    const value = String(url ?? '').trim().toLowerCase();
    return value.startsWith('http') || value.startsWith('mailto:');
  }

  function isLinkEditorFloat(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (String(el.tagName || '').toLowerCase() !== 'e-float-container') return false;
    const title = el.querySelector('header .e-dialog__title, .e-dialog__title');
    const text = String(title?.textContent || '').replace(/\s+/g, ' ').trim();
    return text === 'Link Editor';
  }

  function findLinkEditorFloat(startNode) {
    let cur = startNode && startNode.nodeType === Node.ELEMENT_NODE ? startNode : null;
    while (cur) {
      if (isLinkEditorFloat(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function getLinkEditorUrlHost(float) {
    return float?.querySelector('cb-personalizable-input-with-context.link-editor-url') || null;
  }

  function resolveCodeMirror(linkEditorHost) {
    const vceCm = linkEditorHost?.querySelector('vce-codemirror');
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : null;
    const cmInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null) ||
      cmEl?.CodeMirror ||
      null;
    return { vceCm, cmEl, cmInstance };
  }

  function cleanEditorText(value) {
    return String(value ?? '')
      .replace(/\u200b/g, '')
      .trim();
  }

  function commitLinkEditorUrlField(linkEditorHost) {
    if (!linkEditorHost) return;
    try {
      const { cmEl } = resolveCodeMirror(linkEditorHost);
      const active = document.activeElement;
      if (!active) return;
      if (linkEditorHost.contains(active) || (cmEl && cmEl.contains(active))) {
        active.blur();
        if (active.tagName === 'TEXTAREA') {
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (_) {}
  }

  function getLinkEditorUrlValue(linkEditorHost) {
    if (!linkEditorHost) return '';
    const { vceCm, cmEl, cmInstance } = resolveCodeMirror(linkEditorHost);
    const candidates = [];

    if (cmInstance && typeof cmInstance.getValue === 'function') {
      candidates.push(cmInstance.getValue());
    }

    const textarea = linkEditorHost.querySelector('vce-codemirror textarea');
    if (textarea) candidates.push(textarea.value);

    if (vceCm) {
      try {
        candidates.push(vceCm.getAttribute('html') || '');
      } catch (_) {}
    }

    const htmlEditor = linkEditorHost.querySelector('vce-html-editor');
    if (htmlEditor) {
      try {
        candidates.push(htmlEditor.getAttribute('html') || '');
      } catch (_) {}
    }

    if (cmEl) {
      const lines = cmEl.querySelectorAll('.CodeMirror-code .CodeMirror-line');
      if (lines.length) {
        candidates.push(Array.from(lines).map((line) => line.textContent || '').join('\n'));
      } else {
        const pre = cmEl.querySelector('pre.CodeMirror-line');
        if (pre) candidates.push(pre.textContent || '');
      }
    }

    for (const candidate of candidates) {
      const cleaned = cleanEditorText(candidate);
      if (cleaned) return cleaned;
    }

    return '';
  }

  function setLinkEditorUrlValue(linkEditorHost, text) {
    if (!linkEditorHost) return false;
    const value = String(text ?? '');
    const { vceCm, cmEl, cmInstance } = resolveCodeMirror(linkEditorHost);

    if (vceCm) {
      try {
        vceCm.setAttribute('html', value);
      } catch (_) {}
    }

    const htmlEditor = vceCm ? vceCm.closest('vce-html-editor') : null;
    if (htmlEditor) {
      try {
        htmlEditor.setAttribute('html', value);
      } catch (_) {}
    }

    if (cmInstance && typeof cmInstance.setValue === 'function') {
      cmInstance.setValue(value);
      try {
        cmInstance.focus();
      } catch (_) {}
      return true;
    }

    const textarea = linkEditorHost.querySelector('vce-codemirror textarea');
    if (textarea) {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        textarea.focus();
      } catch (_) {}
      return true;
    }

    const pre = cmEl?.querySelector('pre.CodeMirror-line');
    if (pre) {
      pre.textContent = value;
      return true;
    }

    return false;
  }

  function renderRecentUrlsList(container) {
    if (!container) return;

    if (!recentUrlsCache.length) {
      container.innerHTML =
        '<div class="gem-link-editor-recent-urls-title">Recent links</div><div class="gem-link-editor-recent-urls-empty">No recent links yet.</div>';
      return;
    }

    const itemsHtml = recentUrlsCache
      .map((item) => {
        const url = item.url;
        const openable = isOpenableUrl(url);
        const openLink = openable
          ? `<button type="button" class="gem-link-editor-recent-urls-open" data-url="${escapeHtml(url)}" title="Open link in new tab" aria-label="Open link in new tab">${EXTERNAL_LINK_ICON}</button>`
          : '<span class="gem-link-editor-recent-urls-open-spacer" aria-hidden="true"></span>';
        return `
          <li class="gem-link-editor-recent-urls-item">
            <button type="button" class="gem-link-editor-recent-urls-insert" data-url="${escapeHtml(url)}">${escapeHtml(url)}</button>
            <span class="gem-link-editor-recent-urls-actions">
              ${openLink}
              <button type="button" class="gem-link-editor-recent-urls-delete" data-url="${escapeHtml(url)}" title="Remove from recent links" aria-label="Remove from recent links">${DELETE_LINK_ICON}</button>
            </span>
          </li>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="gem-link-editor-recent-urls-title">Recent links</div>
      <ul class="gem-link-editor-recent-urls-list">${itemsHtml}</ul>
    `;
  }

  function refreshMountedLists() {
    document.querySelectorAll('.gem-link-editor-recent-urls').forEach((container) => {
      renderRecentUrlsList(container);
    });
  }

  function getRecentUrlsContainer(linkEditorHost) {
    const containers = linkEditorHost?.querySelectorAll(':scope > .gem-link-editor-recent-urls') || [];
    if (!containers.length) return null;
    for (let i = 1; i < containers.length; i += 1) {
      containers[i].remove();
    }
    return containers[0];
  }

  function bindRecentUrlsList(container, linkEditorHost) {
    container.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest('.gem-link-editor-recent-urls-delete');
      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        const url = deleteBtn.getAttribute('data-url');
        if (url && removeRecentUrl(url)) {
          refreshMountedLists();
        }
        return;
      }

      const openBtn = event.target.closest('.gem-link-editor-recent-urls-open');
      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();
        const url = openBtn.getAttribute('data-url');
        if (url && isOpenableUrl(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      const insertBtn = event.target.closest('.gem-link-editor-recent-urls-insert');
      if (!insertBtn) return;
      const url = insertBtn.getAttribute('data-url');
      if (!url) return;
      setLinkEditorUrlValue(linkEditorHost, url);
    });
  }

  function bindApplyButton(float, linkEditorHost) {
    if (!float || float.getAttribute(APPLY_BOUND_ATTR) === 'true') return;

    const applyBtn = float.querySelector('.e-btn.apply');
    if (!applyBtn) return;

    const applyHandler = () => {
      commitLinkEditorUrlField(linkEditorHost);
      const url = getLinkEditorUrlValue(linkEditorHost);
      if (!url) return;
      rememberRecentUrl(url);
      refreshMountedLists();
    };

    applyBtn.addEventListener('click', applyHandler, true);
    float.setAttribute(APPLY_BOUND_ATTR, 'true');
  }

  function mountRecentUrlsList(float) {
    const linkEditorHost = getLinkEditorUrlHost(float);
    if (!linkEditorHost) return;

    let container = getRecentUrlsContainer(linkEditorHost);
    if (!container) {
      container = document.createElement('div');
      container.className = 'gem-link-editor-recent-urls';
      linkEditorHost.setAttribute(MOUNT_ATTR, 'true');
      linkEditorHost.appendChild(container);
      bindRecentUrlsList(container, linkEditorHost);
    }

    bindApplyButton(float, linkEditorHost);

    const render = () => renderRecentUrlsList(container);
    if (storageLoaded) render();
    else loadRecentUrls(render);
  }

  function scanForLinkEditor(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    if (isLinkEditorFloat(node)) {
      mountRecentUrlsList(node);
      return;
    }

    if (node.matches?.('cb-personalizable-input-with-context.link-editor-url')) {
      const float = findLinkEditorFloat(node);
      if (float) mountRecentUrlsList(float);
      return;
    }

    node.querySelectorAll?.('e-float-container').forEach((float) => {
      if (isLinkEditorFloat(float)) mountRecentUrlsList(float);
    });

    node.querySelectorAll?.('cb-personalizable-input-with-context.link-editor-url').forEach((host) => {
      const float = findLinkEditorFloat(host);
      if (float) mountRecentUrlsList(float);
    });
  }

  function initLinkEditorRecentUrls() {
    loadRecentUrls(() => {
      document.querySelectorAll('e-float-container').forEach((float) => {
        if (isLinkEditorFloat(float)) mountRecentUrlsList(float);
      });
    });

    const onMutations = (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => scanForLinkEditor(node));
      });
    };

    if (typeof gemDomWatchSubscribe === 'function') {
      gemDomWatchSubscribe(onMutations);
    } else {
      const observer = new MutationObserver(onMutations);
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        recentUrlsCache = normalizeRecentUrlsState(changes[STORAGE_KEY].newValue);
        refreshMountedLists();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLinkEditorRecentUrls);
  } else {
    initLinkEditorRecentUrls();
  }
})();
