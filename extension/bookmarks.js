console.log("[Gem] bookmarks.js loaded");

(function () {
  const GEM_BOOKMARKS_STORAGE_KEY = "gemBookmarks";
  const BOOKMARKS_SCHEMA_VERSION = 1;
  const BOOKMARKS_NAV_ID = "gem-nav-bookmarks-item";
  const BOOKMARKS_PANEL_ID = "gem-bookmarks-panel";
  const BOOKMARKS_BACKDROP_ID = "gem-bookmarks-backdrop";
  const MAX_BOOKMARKS = 40;
  const UNDO_DELETE_MS = 8000;

  const panelEvents = () => window.gemPanelEvents || {};

  let bookmarksPanel = null;
  let bookmarksBackdrop = null;
  let editingBookmarkId = null;
  let activeSearchQuery = "";
  let currentPageHrefNormalized = "";
  let pendingDeleteUndo = null;
  let dragSourceId = null;
  let bookmarkPaletteCache = { schemaVersion: BOOKMARKS_SCHEMA_VERSION, items: [] };

  function syncPaletteCache(state) {
    bookmarkPaletteCache = {
      schemaVersion: BOOKMARKS_SCHEMA_VERSION,
      items: dedupeBookmarkItems(state.items),
    };
  }

  function generateBookmarkId() {
    return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeBookmarkHref(raw) {
    const stable =
      typeof window.gemStableEmarsysHref === "function"
        ? window.gemStableEmarsysHref(raw)
        : String(raw || "").trim();
    if (typeof window.gemCanonicalCampaignUrlFromHref === "function") {
      const canonical = window.gemCanonicalCampaignUrlFromHref(stable);
      if (canonical) {
        return typeof window.gemStableEmarsysHref === "function"
          ? window.gemStableEmarsysHref(canonical)
          : canonical;
      }
    }
    return stable;
  }

  function resolveBookmarkNavigateHref(storedHref) {
    let href =
      typeof window.gemWithCurrentSessionId === "function"
        ? window.gemWithCurrentSessionId(storedHref)
        : storedHref;
    if (typeof window.gemWithEmailBasicsHash === "function") {
      href = window.gemWithEmailBasicsHash(href);
    }
    return href;
  }

  function navigateToBookmarkHref(storedHref, options) {
    const opts = options && typeof options === "object" ? options : {};
    const href = resolveBookmarkNavigateHref(storedHref);
    if (opts.newTab) {
      try {
        window.open(href, "_blank", "noopener,noreferrer");
      } catch (_) {
        window.open(href, "_blank");
      }
      return;
    }
    try {
      window.location.assign(href);
    } catch (_) {
      window.location.href = href;
    }
  }

  function dedupeBookmarkItems(items) {
    const seen = new Map();
    const out = [];
    (Array.isArray(items) ? items : []).forEach((raw) => {
      const href = String(raw.href || "").trim();
      if (!href) return;
      const existing = seen.get(href);
      const entry = {
        id: String(raw.id || "").trim() || generateBookmarkId(),
        title: String(raw.title || "").trim(),
        href,
        createdAt: Number(raw.createdAt) || Date.now(),
        pinned: !!raw.pinned,
      };
      if (!existing) {
        seen.set(href, entry);
        out.push(entry);
        return;
      }
      if (!existing.title && entry.title) existing.title = entry.title;
      if (entry.pinned) existing.pinned = true;
      if (entry.createdAt < existing.createdAt) existing.createdAt = entry.createdAt;
    });
    return out;
  }

  function parseBookmarksState(raw) {
    if (Array.isArray(raw)) {
      return {
        schemaVersion: BOOKMARKS_SCHEMA_VERSION,
        items: dedupeBookmarkItems(raw),
      };
    }
    if (raw && typeof raw === "object") {
      const version = Number(raw.schemaVersion) || BOOKMARKS_SCHEMA_VERSION;
      return {
        schemaVersion: version,
        items: dedupeBookmarkItems(raw.items),
      };
    }
    return { schemaVersion: BOOKMARKS_SCHEMA_VERSION, items: [] };
  }

  function sortItemsForDisplay(items) {
    const pinned = [];
    const unpinned = [];
    (items || []).forEach((item) => {
      if (item.pinned) pinned.push(item);
      else unpinned.push(item);
    });
    return [...pinned, ...unpinned];
  }

  function loadBookmarks(callback) {
    chrome.storage.sync.get(GEM_BOOKMARKS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        showBookmarkToast(chrome.runtime.lastError.message || "Could not load bookmarks.", "error");
        callback({ schemaVersion: BOOKMARKS_SCHEMA_VERSION, items: [] });
        return;
      }
      const state = parseBookmarksState(result[GEM_BOOKMARKS_STORAGE_KEY]);
      const deduped = dedupeBookmarkItems(state.items);
      const normalized = {
        schemaVersion: BOOKMARKS_SCHEMA_VERSION,
        items: deduped,
      };
      const rawStored = result[GEM_BOOKMARKS_STORAGE_KEY];
      const needsPersist =
        Array.isArray(rawStored) ||
        deduped.length !== (state.items || []).length ||
        (rawStored &&
          typeof rawStored === "object" &&
          Number(rawStored.schemaVersion) !== BOOKMARKS_SCHEMA_VERSION);
      if (needsPersist) {
        saveBookmarksState(normalized, null, { silent: true });
      }
      syncPaletteCache(normalized);
      callback(normalized);
    });
  }

  function notifyBookmarksChanged(state) {
    try {
      window.dispatchEvent(
        new CustomEvent("gem-bookmarks-changed", {
          bubbles: true,
          detail: { state },
        })
      );
    } catch (_) {}
  }

  function saveBookmarksState(state, callback, options) {
    const opts = options && typeof options === "object" ? options : {};
    const payload = {
      schemaVersion: BOOKMARKS_SCHEMA_VERSION,
      items: dedupeBookmarkItems(state.items),
    };
    chrome.storage.sync.set({ [GEM_BOOKMARKS_STORAGE_KEY]: payload }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        if (!opts.silent) {
          showBookmarkToast(err.message || "Could not save bookmarks.", "error");
        }
        if (typeof callback === "function") callback(false);
        return;
      }
      syncPaletteCache(payload);
      notifyBookmarksChanged(payload);
      if (typeof callback === "function") callback(true);
    });
  }

  function showBookmarkToast(message, type, action) {
    if (typeof window.gemShowToast !== "function") return;
    const opts = { type: type || "info" };
    if (action && action.label && typeof action.onClick === "function") {
      opts.action = action;
    }
    window.gemShowToast(message, opts);
  }

  function bookmarkHrefHint(href) {
    try {
      const url = new URL(href, window.location.origin);
      const route = (url.searchParams.get("r") || "").trim();
      const id = (url.searchParams.get("id") || url.searchParams.get("camp_id") || "").trim();
      const parts = [url.pathname.replace(/^\//, "")];
      if (route) parts.push(`r=${route}`);
      if (id) parts.push(`id=${id}`);
      if (url.hash) parts.push(url.hash);
      return parts.join(" · ");
    } catch (_) {
      return String(href || "").trim();
    }
  }

  function bookmarkMatchesQuery(bookmark, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const title = String(bookmark.title || "").toLowerCase();
    const hint = bookmarkHrefHint(bookmark.href).toLowerCase();
    const href = String(bookmark.href || "").toLowerCase();
    return title.includes(q) || hint.includes(q) || href.includes(q);
  }

  function dispatchCloseNotes() {
    const name = panelEvents().CLOSE_NOTES;
    if (name) document.dispatchEvent(new CustomEvent(name, { bubbles: true }));
  }

  function dispatchCloseRecent() {
    const name = panelEvents().CLOSE_RECENT_CAMPAIGNS;
    if (name) document.dispatchEvent(new CustomEvent(name, { bubbles: true }));
  }

  function findBookmarkIndexForCurrentPage(items) {
    currentPageHrefNormalized = normalizeBookmarkHref(window.location.href);
    return items.findIndex((b) => b.href === currentPageHrefNormalized);
  }

  function updateAddButtonUi(items) {
    if (!bookmarksPanel) return;
    const addBtn = bookmarksPanel.querySelector(".gem-bookmarks-add-btn");
    const updateBtn = bookmarksPanel.querySelector(".gem-bookmarks-update-title-btn");
    if (!addBtn) return;
    const idx = findBookmarkIndexForCurrentPage(items);
    const onPage = idx >= 0;
    addBtn.disabled = onPage;
    addBtn.classList.toggle("gem-bookmarks-add-btn--on-page", onPage);
    addBtn.textContent = onPage ? "Already bookmarked" : "Bookmark this page";
    if (updateBtn) {
      updateBtn.hidden = !onPage;
      updateBtn.disabled = !onPage;
    }
  }

  // ── Nav ─────────────────────────────────────────────────────────────────

  function buildBookmarksNavItem(navRoot) {
    const gem = window.gemNavMenu;
    const item = gem.buildUi5ActionItem(
      {
        id: BOOKMARKS_NAV_ID,
        text: "Gemma Bookmarks",
        icon: "bookmark-2",
        iconFallbacks: ["bookmark", "curriculum", "email", "home"],
        className: "gem-ui5-nav-item--bookmarks",
        svgHtml: gem.GEM_NAV_ICON_SVGS && gem.GEM_NAV_ICON_SVGS.bookmarks,
        onActivate: toggleBookmarksPanel,
      },
      navRoot
    );
    gem.syncUi5CollapsedAttrs(item, navRoot);
    return item;
  }

  function injectBookmarksNavItem(host) {
    if (!host || host.querySelector(`#${BOOKMARKS_NAV_ID}`)) return;
    const gem = window.gemNavMenu;
    if (!gem) return;
    const item = buildBookmarksNavItem(host);
    const recentItem = host.querySelector("#gem-nav-recent-campaigns-item");
    if (recentItem) {
      host.insertBefore(item, recentItem);
      return;
    }
    const notesItem = host.querySelector("#gem-nav-notes-item");
    if (notesItem) {
      notesItem.insertAdjacentElement("afterend", item);
      return;
    }
    gem.insertBeforeCommandsOrSettings(host, item, "gem-nav-commands-item", "gem-nav-settings-item");
  }

  function scanForNav(root = document) {
    const gem = window.gemNavMenu;
    if (!gem) return;
    const { hosts } = gem.getNavHosts(root);
    hosts.forEach((host) => injectBookmarksNavItem(host));
  }

  function observeNav() {
    window.gemDomWatchSubscribe(function (mutations) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches("ui5-side-navigation-ds-nav")) {
            injectBookmarksNavItem(node);
            continue;
          }
          if (node.id === "gem-nav-settings-item") {
            const host = node.closest?.("ui5-side-navigation-ds-nav");
            if (host) injectBookmarksNavItem(host);
            else scanForNav(document);
          } else if (node.querySelectorAll) {
            node.querySelectorAll("#gem-nav-settings-item").forEach((si) => {
              const host = si.closest("ui5-side-navigation-ds-nav");
              if (host) injectBookmarksNavItem(host);
            });
            scanForNav(node);
            if (window.gemNavMenu?.isNavRelatedNode(node)) scanForNav(document);
          }
        }
      }
    });
  }

  // ── Panel ───────────────────────────────────────────────────────────────

  function getBookmarksShortcutLabel() {
    return typeof window.gemPanelShortcutLabel === "function"
      ? window.gemPanelShortcutLabel("'")
      : "CTRL+'";
  }

  function isBookmarksShortcutKey(e) {
    const key = e.key || "";
    if (key === "'" || key === "\u2019") return true;
    const code = e.code || "";
    return code === "Quote" || code === "Apostrophe";
  }

  function createBookmarksPanel() {
    if (bookmarksPanel && bookmarksBackdrop) return;

    const backdrop = document.createElement("div");
    backdrop.id = BOOKMARKS_BACKDROP_ID;
    backdrop.className = "gem-bookmarks-backdrop";
    backdrop.dataset.gemPanelOpen = "0";
    backdrop.addEventListener("click", hideBookmarksPanel);

    const panel = document.createElement("div");
    panel.id = BOOKMARKS_PANEL_ID;
    panel.className = "gem-bookmarks-panel";
    panel.dataset.gemPanelOpen = "0";
    panel.innerHTML = `
      <div class="gem-bookmarks-panel-header">
        <span class="gem-bookmarks-panel-title">
          Gemma Bookmarks
          <span class="gem-shortcut-hint gem-shortcut-hint--on-surface">${getBookmarksShortcutLabel()}</span>
        </span>
        <button type="button" class="gem-bookmarks-panel-close" aria-label="Close Gemma Bookmarks panel">✕</button>
      </div>
      <div class="gem-bookmarks-panel-toolbar">
        <input type="search" class="gem-bookmarks-search" placeholder="Search bookmarks" aria-label="Search bookmarks" />
        <div class="gem-bookmarks-toolbar-actions">
          <button type="button" class="gem-bookmarks-add-btn">Bookmark this page</button>
          <button type="button" class="gem-bookmarks-update-title-btn" hidden>Update title</button>
        </div>
      </div>
      <div class="gem-bookmarks-panel-content gem-scrollable">
        <div class="gem-bookmarks-list"></div>
        <p class="gem-bookmarks-empty" hidden>No bookmarks yet. Use “Bookmark this page” to save the current URL.</p>
        <p class="gem-bookmarks-no-results" hidden>No bookmarks match your search.</p>
      </div>
    `;

    panel.querySelector(".gem-bookmarks-panel-close")?.addEventListener("click", hideBookmarksPanel);
    panel.querySelector(".gem-bookmarks-add-btn")?.addEventListener("click", addCurrentPageBookmark);
    panel.querySelector(".gem-bookmarks-update-title-btn")?.addEventListener("click", updateCurrentPageBookmarkTitle);
    const searchInput = panel.querySelector(".gem-bookmarks-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        activeSearchQuery = String(searchInput.value || "").trim();
        loadBookmarks((state) => renderBookmarksList(state.items));
      });
    }
    const shortcutHint = panel.querySelector(".gem-shortcut-hint");
    if (shortcutHint && typeof window.gemWireShortcutHint === "function") {
      window.gemWireShortcutHint(shortcutHint);
    }

    const mountTarget = document.body || document.documentElement;
    if (!mountTarget) return;
    mountTarget.appendChild(backdrop);
    mountTarget.appendChild(panel);
    bookmarksBackdrop = backdrop;
    bookmarksPanel = panel;
  }

  function isBookmarksPanelOpen() {
    return !!(bookmarksPanel && bookmarksPanel.dataset.gemPanelOpen === "1");
  }

  function moveBookmarkInList(items, fromId, toId) {
    const list = items.slice();
    const fromIdx = list.findIndex((b) => b.id === fromId);
    const toIdx = list.findIndex((b) => b.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
    const fromItem = list[fromIdx];
    const toItem = list[toIdx];
    if (!!fromItem.pinned !== !!toItem.pinned) return list;
    list.splice(fromIdx, 1);
    const insertAt = list.findIndex((b) => b.id === toId);
    list.splice(insertAt, 0, fromItem);
    return list;
  }

  function toggleBookmarkPinned(items, id) {
    const list = items.slice();
    const idx = list.findIndex((b) => b.id === id);
    if (idx < 0) return list;
    const item = { ...list[idx], pinned: !list[idx].pinned };
    list.splice(idx, 1);
    if (item.pinned) {
      let lastPinned = -1;
      list.forEach((b, i) => {
        if (b.pinned) lastPinned = i;
      });
      list.splice(lastPinned + 1, 0, item);
    } else {
      const firstUnpinned = list.findIndex((b) => !b.pinned);
      const insertAt = firstUnpinned >= 0 ? firstUnpinned : list.length;
      list.splice(insertAt, 0, item);
    }
    return list;
  }

  function renderBookmarksList(items) {
    if (!bookmarksPanel) return;
    const listEl = bookmarksPanel.querySelector(".gem-bookmarks-list");
    const emptyEl = bookmarksPanel.querySelector(".gem-bookmarks-empty");
    const noResultsEl = bookmarksPanel.querySelector(".gem-bookmarks-no-results");
    if (!listEl || !emptyEl || !noResultsEl) return;

    updateAddButtonUi(items);

    const sorted = sortItemsForDisplay(items);
    const filtered = sorted.filter((b) => bookmarkMatchesQuery(b, activeSearchQuery));
    const currentIdx = findBookmarkIndexForCurrentPage(items);
    const currentId = currentIdx >= 0 ? items[currentIdx].id : "";

    listEl.innerHTML = "";
    if (!items.length) {
      emptyEl.hidden = false;
      noResultsEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    if (!filtered.length) {
      noResultsEl.hidden = false;
      return;
    }
    noResultsEl.hidden = true;

    let prevBookmark = null;
    filtered.forEach((bookmark) => {
      const showPinnedHeader = bookmark.pinned && (!prevBookmark || !prevBookmark.pinned);
      const showAllHeader = !bookmark.pinned && (!prevBookmark || prevBookmark.pinned);
      if (showPinnedHeader || showAllHeader) {
        const header = document.createElement("div");
        header.className = "gem-bookmarks-section-header";
        header.textContent = bookmark.pinned ? "Pinned" : "All bookmarks";
        listEl.appendChild(header);
      }
      prevBookmark = bookmark;

      const row = document.createElement("div");
      row.className = "gem-bookmarks-row";
      row.dataset.gemBookmarkId = bookmark.id;
      row.draggable = true;
      if (bookmark.id === currentId) row.classList.add("gem-bookmarks-row--current");

      row.addEventListener("dragstart", (e) => {
        dragSourceId = bookmark.id;
        row.classList.add("gem-bookmarks-row--dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", bookmark.id);
        }
      });
      row.addEventListener("dragend", () => {
        dragSourceId = null;
        row.classList.remove("gem-bookmarks-row--dragging");
        listEl.querySelectorAll(".gem-bookmarks-row--drop-target").forEach((el) => {
          el.classList.remove("gem-bookmarks-row--drop-target");
        });
      });
      row.addEventListener("dragover", (e) => {
        if (!dragSourceId || dragSourceId === bookmark.id) return;
        e.preventDefault();
        row.classList.add("gem-bookmarks-row--drop-target");
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("gem-bookmarks-row--drop-target");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("gem-bookmarks-row--drop-target");
        const fromId = dragSourceId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
        if (!fromId || fromId === bookmark.id) return;
        loadBookmarks((state) => {
          const nextItems = moveBookmarkInList(state.items, fromId, bookmark.id);
          saveBookmarksState({ items: nextItems }, () => renderBookmarksList(nextItems));
        });
      });

      const grip = document.createElement("span");
      grip.className = "gem-bookmarks-drag-handle";
      grip.setAttribute("aria-hidden", "true");
      grip.textContent = "⋮⋮";

      const main = document.createElement("div");
      main.className = "gem-bookmarks-row-main";

      if (editingBookmarkId === bookmark.id) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "gem-bookmarks-title-input";
        input.value = bookmark.title;
        input.maxLength = 200;
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") input.blur();
          if (e.key === "Escape") {
            editingBookmarkId = null;
            loadBookmarks((state) => renderBookmarksList(state.items));
          }
        });
        input.addEventListener("blur", () => {
          const nextTitle = String(input.value || "").trim() || bookmark.title;
          editingBookmarkId = null;
          loadBookmarks((state) => {
            const idx = state.items.findIndex((b) => b.id === bookmark.id);
            if (idx >= 0) {
              const next = state.items.slice();
              next[idx] = { ...next[idx], title: nextTitle };
              saveBookmarksState({ items: next }, () => renderBookmarksList(next));
            } else {
              renderBookmarksList(state.items);
            }
          });
        });
        main.appendChild(input);
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      } else {
        const titleBtn = document.createElement("button");
        titleBtn.type = "button";
        titleBtn.className = "gem-bookmarks-title-btn";
        titleBtn.textContent = bookmark.title || bookmark.href;
        titleBtn.title = bookmark.href;
        let titleClickTimer = null;
        titleBtn.addEventListener("click", (e) => {
          if (e.metaKey || e.ctrlKey) {
            navigateToBookmarkHref(bookmark.href, { newTab: true });
            return;
          }
          if (titleClickTimer) clearTimeout(titleClickTimer);
          titleClickTimer = setTimeout(() => {
            titleClickTimer = null;
            navigateToBookmarkHref(bookmark.href);
          }, 250);
        });
        titleBtn.addEventListener("dblclick", (e) => {
          e.preventDefault();
          if (titleClickTimer) clearTimeout(titleClickTimer);
          titleClickTimer = null;
          editingBookmarkId = bookmark.id;
          loadBookmarks((state) => renderBookmarksList(state.items));
        });
        const subtitle = document.createElement("span");
        subtitle.className = "gem-bookmarks-subtitle";
        subtitle.textContent = bookmarkHrefHint(bookmark.href);
        main.appendChild(titleBtn);
        main.appendChild(subtitle);
      }

      const actions = document.createElement("div");
      actions.className = "gem-bookmarks-row-actions";

      const pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.className = "gem-bookmarks-pin-btn";
      pinBtn.setAttribute("aria-label", bookmark.pinned ? "Unpin bookmark" : "Pin bookmark");
      pinBtn.classList.toggle("gem-bookmarks-pin-btn--active", !!bookmark.pinned);
      pinBtn.textContent = bookmark.pinned ? "★" : "☆";
      pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        loadBookmarks((state) => {
          const next = toggleBookmarkPinned(state.items, bookmark.id);
          saveBookmarksState({ items: next }, () => renderBookmarksList(next));
        });
      });

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "gem-bookmarks-rename-btn";
      renameBtn.setAttribute("aria-label", "Rename bookmark");
      renameBtn.textContent = "✎";
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editingBookmarkId = bookmark.id;
        loadBookmarks((state) => renderBookmarksList(state.items));
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "gem-bookmarks-delete-btn";
      deleteBtn.setAttribute("aria-label", "Delete bookmark");
      deleteBtn.textContent = "✕";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeBookmarkWithUndo(bookmark);
      });

      actions.appendChild(pinBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(grip);
      row.appendChild(main);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  function clearPendingDeleteUndo() {
    if (pendingDeleteUndo && pendingDeleteUndo.timer) clearTimeout(pendingDeleteUndo.timer);
    pendingDeleteUndo = null;
  }

  function removeBookmarkWithUndo(bookmark) {
    clearPendingDeleteUndo();
    loadBookmarks((state) => {
      const idx = state.items.findIndex((b) => b.id === bookmark.id);
      if (idx < 0) return;
      const next = state.items.slice();
      const removed = next.splice(idx, 1)[0];
      saveBookmarksState({ items: next }, (ok) => {
        if (!ok) return;
        renderBookmarksList(next);
        const removedAt = idx;
        pendingDeleteUndo = {
          item: removed,
          index: removedAt,
          timer: setTimeout(() => {
            pendingDeleteUndo = null;
          }, UNDO_DELETE_MS),
        };
        showBookmarkToast("Bookmark removed.", "success", {
          label: "Undo",
          onClick: () => {
            if (!pendingDeleteUndo || pendingDeleteUndo.item.id !== removed.id) return;
            const restoreIndex = pendingDeleteUndo.index;
            clearPendingDeleteUndo();
            loadBookmarks((fresh) => {
              const restored = fresh.items.slice();
              const insertAt = Math.min(Math.max(restoreIndex, 0), restored.length);
              restored.splice(insertAt, 0, removed);
              saveBookmarksState({ items: restored }, () => renderBookmarksList(restored));
            });
          },
        });
      });
    });
  }

  function refreshBookmarksPanel() {
    loadBookmarks((state) => renderBookmarksList(state.items));
  }

  function addCurrentPageBookmark() {
    const href = normalizeBookmarkHref(window.location.href);
    const title = (document.title || "").trim() || href;
    loadBookmarks((state) => {
      const existingIdx = state.items.findIndex((b) => b.href === href);
      if (existingIdx >= 0) {
        showBookmarkToast("This page is already bookmarked.", "info");
        refreshBookmarksPanel();
        return;
      }
      if (state.items.length >= MAX_BOOKMARKS) {
        showBookmarkToast(`Bookmark limit reached (${MAX_BOOKMARKS}). Remove one to add another.`, "error");
        return;
      }
      const entry = {
        id: generateBookmarkId(),
        title,
        href,
        createdAt: Date.now(),
        pinned: false,
      };
      const pinnedCount = state.items.filter((b) => b.pinned).length;
      const next = state.items.slice();
      next.splice(pinnedCount, 0, entry);
      saveBookmarksState({ items: next }, (ok) => {
        if (!ok) return;
        showBookmarkToast("Page bookmarked.", "success");
        refreshBookmarksPanel();
      });
    });
  }

  function updateCurrentPageBookmarkTitle() {
    const href = normalizeBookmarkHref(window.location.href);
    const title = (document.title || "").trim();
    if (!title) {
      showBookmarkToast("No page title to apply.", "info");
      return;
    }
    loadBookmarks((state) => {
      const idx = state.items.findIndex((b) => b.href === href);
      if (idx < 0) {
        showBookmarkToast("Bookmark this page first.", "info");
        return;
      }
      const next = state.items.slice();
      next[idx] = { ...next[idx], title };
      saveBookmarksState({ items: next }, (ok) => {
        if (!ok) return;
        showBookmarkToast("Bookmark title updated.", "success");
        refreshBookmarksPanel();
      });
    });
  }

  function showBookmarksPanel() {
    dispatchCloseNotes();
    dispatchCloseRecent();
    if (!bookmarksPanel || !bookmarksBackdrop) createBookmarksPanel();
    if (!bookmarksPanel || !bookmarksBackdrop) return;
    bookmarksPanel.dataset.gemPanelOpen = "1";
    bookmarksBackdrop.dataset.gemPanelOpen = "1";
    activeSearchQuery = "";
    const searchInput = bookmarksPanel.querySelector(".gem-bookmarks-search");
    if (searchInput) searchInput.value = "";
    refreshBookmarksPanel();
    requestAnimationFrame(() => {
      bookmarksBackdrop.classList.add("gem-bookmarks-backdrop--open");
      bookmarksPanel.classList.add("gem-bookmarks-panel--open");
      if (typeof window.gemLayerRaise === "function") {
        window.gemLayerRaise(bookmarksBackdrop, { tier: "modal" });
        window.gemLayerRaise(bookmarksPanel, { tier: "modal" });
      }
      if (searchInput) searchInput.focus();
    });
    document.addEventListener("keydown", onBookmarksEsc);
  }

  function hideBookmarksPanel() {
    if (!bookmarksPanel || !bookmarksBackdrop) return;
    editingBookmarkId = null;
    bookmarksPanel.dataset.gemPanelOpen = "0";
    bookmarksBackdrop.dataset.gemPanelOpen = "0";
    bookmarksPanel.classList.remove("gem-bookmarks-panel--open");
    bookmarksBackdrop.classList.remove("gem-bookmarks-backdrop--open");
    if (typeof window.gemLayerRelease === "function") {
      window.gemLayerRelease(bookmarksBackdrop);
      window.gemLayerRelease(bookmarksPanel);
    }
    document.removeEventListener("keydown", onBookmarksEsc);
    try {
      const ae = document.activeElement;
      if (ae && bookmarksPanel.contains(ae) && typeof ae.blur === "function") ae.blur();
    } catch (_) {}
  }

  function toggleBookmarksPanel() {
    if (!isBookmarksPanelOpen()) showBookmarksPanel();
    else hideBookmarksPanel();
  }

  function onBookmarksEsc(e) {
    if (e.key === "Escape") hideBookmarksPanel();
  }

  function bookmarksShortcutTypingTarget() {
    const ae = document.activeElement;
    if (!ae) return false;
    if (ae.classList && ae.classList.contains("gem-bookmarks-search") && ae.closest?.("#gem-bookmarks-panel")) {
      return false;
    }
    if (ae.classList && ae.classList.contains("gem-bookmarks-title-input")) return true;
    const tag = (ae.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (ae.isContentEditable) return true;
    if (ae.closest && ae.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function setupBookmarksPanelShortcuts() {
    function handleKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (!isBookmarksShortcutKey(e)) return;
      if (bookmarksShortcutTypingTarget()) return;

      if (isBookmarksPanelOpen()) hideBookmarksPanel();
      else showBookmarksPanel();
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    document.addEventListener("keydown", handleKeyDown, true);

    function injectIntoIframe(iframe) {
      try {
        if (typeof window.gemIsGemStrippedEmbedIframe === "function" && window.gemIsGemStrippedEmbedIframe(iframe)) return;
        const iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (!iframeDoc) return;
        if (iframeDoc._gemBookmarksShortcutHandler) return;
        iframeDoc.addEventListener("keydown", handleKeyDown, true);
        iframeDoc._gemBookmarksShortcutHandler = true;
      } catch (_) {}
    }

    function bindIframeReload(iframe) {
      if (!iframe || iframe._gemBookmarksShortcutIframeLoadBound) return;
      iframe._gemBookmarksShortcutIframeLoadBound = true;
      iframe.addEventListener("load", () => setTimeout(() => injectIntoIframe(iframe), 50));
    }

    function waitForIframeReady(iframe) {
      try {
        bindIframeReload(iframe);
        if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
          injectIntoIframe(iframe);
          return;
        }
        let attempts = 0;
        const tick = () => {
          attempts++;
          try {
            if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
              injectIntoIframe(iframe);
              return;
            }
          } catch (_) {}
          if (attempts < 40) setTimeout(tick, 100);
        };
        setTimeout(tick, 100);
      } catch (_) {}
    }

    document.querySelectorAll("iframe").forEach(waitForIframeReady);
    window.gemDomWatchSubscribe(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === "IFRAME") waitForIframeReady(node);
          else if (node.querySelectorAll) node.querySelectorAll("iframe").forEach(waitForIframeReady);
        });
      });
    });
  }

  window.gemToggleBookmarksPanel = toggleBookmarksPanel;
  window.gemNavigateBookmarkHref = navigateToBookmarkHref;
  window.gemParseBookmarksState = parseBookmarksState;
  window.gemNormalizeBookmarkHref = normalizeBookmarkHref;
  window.gemGetBookmarkPaletteEntries = function gemGetBookmarkPaletteEntries() {
    return sortItemsForDisplay(bookmarkPaletteCache.items).map((b) => ({
      id: b.id,
      title: b.title || b.href,
      href: b.href,
      pinned: !!b.pinned,
    }));
  };

  function initBookmarksFeature() {
    loadBookmarks(() => {});
    scanForNav();
    observeNav();
    createBookmarksPanel();
    setupBookmarksPanelShortcuts();
    const closeEvt = panelEvents().CLOSE_BOOKMARKS;
    if (closeEvt) {
      document.addEventListener(closeEvt, () => hideBookmarksPanel());
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes[GEM_BOOKMARKS_STORAGE_KEY]) return;
      if (isBookmarksPanelOpen()) refreshBookmarksPanel();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBookmarksFeature, { once: true });
  } else {
    initBookmarksFeature();
  }
})();
