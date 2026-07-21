console.log("[gem] notes.js loaded");

const GEM_NOTES_STORAGE_KEY = "gemNotes";
const GEM_NOTES_NAV_ID = "gem-nav-notes-item";
const GEM_NOTES_PANEL_ID = "gem-notes-panel";
const GEM_NOTES_BACKDROP_ID = "gem-notes-backdrop";
/** Dispatched so recent-campaigns.js can close before notes opens (Cmd+;). */
const GEM_CLOSE_RECENT_CAMPAIGNS_EVENT = "gem-close-recent-campaigns-panel";
/** Dispatched so notes.js can close before recent opens (Cmd+/). */
const GEM_CLOSE_NOTES_EVENT = "gem-close-notes-panel";

let notesPanel = null;
let notesBackdrop = null;
let notesSaveTimeout = null;

// ── Nav button ──────────────────────────────────────────────────────────

function buildNotesNavItem() {
  const li = document.createElement("li");
  li.className = "e-navigation__menu_list_item";
  li.id = GEM_NOTES_NAV_ID;
  li.innerHTML = `
    <button type="button" class="e-navigation__action" menu-item-id="notes">
      <e-icon class="e-navigation__action_icon" color="inherit" icon="custom">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon text-color-inherit"></div>
        </div>
      </e-icon>
      <span class="e-navigation__action_text">Notes</span>
    </button>
  `;

  li.querySelector("button").addEventListener("click", toggleNotesPanel);
  return li;
}

function injectNotesNavItem(nav) {
  if (!nav || nav.querySelector(`#${GEM_NOTES_NAV_ID}`)) return;

  const settingsItem = nav.querySelector("#gem-nav-settings-item");
  if (settingsItem) {
    nav.insertBefore(buildNotesNavItem(), settingsItem);
  }
}

function scanForNav(root = document) {
  root.querySelectorAll("nav .e-navigation__menu_list").forEach(injectNotesNavItem);
}

function observeNav() {
  window.gemDomWatchSubscribe(function (mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        if (node.id === "gem-nav-settings-item") {
          const nav = node.closest(".e-navigation__menu_list");
          if (nav) injectNotesNavItem(nav);
        } else if (node.querySelectorAll) {
          const settingsItems = node.querySelectorAll("#gem-nav-settings-item");
          settingsItems.forEach((si) => {
            const nav = si.closest(".e-navigation__menu_list");
            if (nav) injectNotesNavItem(nav);
          });
          scanForNav(node);
        }
      }
    }
  });
}

// ── Panel ───────────────────────────────────────────────────────────────

function createNotesPanel() {
  const backdrop = document.createElement("div");
  backdrop.id = GEM_NOTES_BACKDROP_ID;
  Object.assign(backdrop.style, {
    position: "fixed",
    inset: "0",
    zIndex: "99998",
    background: "rgba(0, 0, 0, 0.35)",
    opacity: "0",
    transition: "opacity 0.25s ease",
    pointerEvents: "none",
  });
  backdrop.addEventListener("click", hideNotesPanel);

  const panel = document.createElement("div");
  panel.id = GEM_NOTES_PANEL_ID;
  Object.assign(panel.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "360px",
    height: "100vh",
    zIndex: "99999",
    display: "flex",
    flexDirection: "column",
    background: "var(--token-box-default-background, #fff)",
    borderRight: "1px solid var(--token-box-default-border, #ccc)",
    boxShadow: "4px 0 24px rgba(0, 0, 0, 0.18)",
    transform: "translateX(-100%)",
    transition: "transform 0.25s ease",
    boxSizing: "border-box",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid var(--token-box-default-border, #ccc)",
    flexShrink: "0",
  });

  const titleRow = document.createElement("div");
  Object.assign(titleRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: "1",
    minWidth: "0",
  });

  const title = document.createElement("span");
  title.textContent = "Notes";
  Object.assign(title.style, {
    fontWeight: "600",
    fontSize: "15px",
    color: "var(--token-box-default-text, #333)",
  });

  const shortcutHint = document.createElement("span");
  shortcutHint.className = "gem-shortcut-hint gem-shortcut-hint--on-surface";
  shortcutHint.textContent = typeof window.gemPanelShortcutLabel === "function"
    ? window.gemPanelShortcutLabel(";")
    : "CTRL+;";
  if (typeof window.gemWireShortcutHint === "function") {
    window.gemWireShortcutHint(shortcutHint);
  }

  titleRow.appendChild(title);
  titleRow.appendChild(shortcutHint);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, {
    background: "none",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    padding: "4px 8px",
    lineHeight: "1",
    color: "var(--token-box-default-text, #666)",
    borderRadius: "4px",
  });
  closeBtn.addEventListener("click", hideNotesPanel);
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background = "var(--token-action-selected-backgroundHover, #eee)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "none";
  });

  header.appendChild(titleRow);
  header.appendChild(closeBtn);

  const textarea = document.createElement("textarea");
  textarea.id = "gem-notes-textarea";
  textarea.className = "gem-scrollable";
  textarea.placeholder = "Write your notes here…";
  textarea.maxLength = 7500;
  Object.assign(textarea.style, {
    flex: "1",
    width: "100%",
    resize: "none",
    border: "none",
    outline: "none",
    padding: "16px",
    fontSize: "14px",
    lineHeight: "1.6",
    fontFamily: "inherit",
    color: "var(--token-box-default-text, #333)",
    background: "transparent",
    boxSizing: "border-box",
  });

  const counter = document.createElement("div");
  counter.id = "gem-notes-counter";
  Object.assign(counter.style, {
    padding: "6px 16px",
    fontSize: "12px",
    color: "var(--token-box-default-text, #999)",
    opacity: "0.6",
    textAlign: "right",
    flexShrink: "0",
    borderTop: "1px solid var(--token-box-default-border, #eee)",
  });

  function updateCounter() {
    const remaining = 7500 - textarea.value.length;
    counter.textContent = `${remaining.toLocaleString()} / 7,500`;
  }
  updateCounter();

  textarea.addEventListener("input", () => {
    updateCounter();
    clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(() => {
      chrome.storage.sync.set({ [GEM_NOTES_STORAGE_KEY]: textarea.value });
    }, 400);
  });

  panel.appendChild(header);
  panel.appendChild(textarea);
  panel.appendChild(counter);
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  notesBackdrop = backdrop;
  notesPanel = panel;
  panel.dataset.gemPanelOpen = "0";
}

function showNotesPanel() {
  if (!notesPanel) createNotesPanel();
  notesPanel.dataset.gemPanelOpen = "1";

  const textarea = notesPanel.querySelector("#gem-notes-textarea");
  chrome.storage.sync.get(GEM_NOTES_STORAGE_KEY, (result) => {
    if (textarea) {
      textarea.value = result[GEM_NOTES_STORAGE_KEY] || "";
      const counter = notesPanel.querySelector("#gem-notes-counter");
      if (counter) {
        const remaining = 7500 - textarea.value.length;
        counter.textContent = `${remaining.toLocaleString()} / 7,500`;
      }
    }
  });

  requestAnimationFrame(() => {
    notesBackdrop.style.opacity = "1";
    notesBackdrop.style.pointerEvents = "auto";
    notesPanel.style.transform = "translateX(0)";
    if (typeof window.gemLayerRaise === "function") {
      window.gemLayerRaise(notesBackdrop, { tier: "modal" });
      window.gemLayerRaise(notesPanel, { tier: "modal" });
    }
    if (textarea) textarea.focus();
  });

  document.addEventListener("keydown", onNotesEsc);
}

function hideNotesPanel() {
  if (!notesPanel) return;
  notesPanel.dataset.gemPanelOpen = "0";
  notesPanel.style.transform = "translateX(-100%)";
  notesBackdrop.style.opacity = "0";
  notesBackdrop.style.pointerEvents = "none";
  if (typeof window.gemLayerRelease === "function") {
    window.gemLayerRelease(notesBackdrop);
    window.gemLayerRelease(notesPanel);
  }
  document.removeEventListener("keydown", onNotesEsc);
  try {
    const ae = document.activeElement;
    if (ae && notesPanel.contains(ae) && typeof ae.blur === "function") ae.blur();
  } catch (_) {}
}

function toggleNotesPanel() {
  if (!notesPanel || notesPanel.style.transform === "translateX(-100%)") {
    showNotesPanel();
  } else {
    hideNotesPanel();
  }
}

window.gemToggleNotesPanel = toggleNotesPanel;

function onNotesEsc(e) {
  if (e.key === "Escape") hideNotesPanel();
}

function notesShortcutTypingTarget() {
  const ae = document.activeElement;
  if (!ae) return false;
  if (ae.id === "gem-notes-textarea") return false;
  // Allow Cmd+; while Recent Campaigns search is focused (same pattern as recent-campaigns.js).
  if (
    ae.classList &&
    ae.classList.contains("gem-recent-campaigns-search") &&
    ae.closest &&
    ae.closest("#gem-recent-campaigns-panel")
  ) {
    return false;
  }
  const tag = (ae.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (ae.isContentEditable) return true;
  if (ae.closest && ae.closest('[contenteditable="true"]')) return true;
  return false;
}

function setupNotesPanelShortcuts() {
  function handleKeyDown(e) {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.shiftKey || e.altKey) return;
    if ((e.key || "") !== ";") return;
    if (notesShortcutTypingTarget()) return;

    const recentEl = document.getElementById("gem-recent-campaigns-panel");
    const recentOpen = !!(recentEl && recentEl.classList.contains("gem-recent-campaigns-panel--open"));
    if (recentOpen) {
      document.dispatchEvent(new CustomEvent(GEM_CLOSE_RECENT_CAMPAIGNS_EVENT, { bubbles: true }));
      showNotesPanel();
    } else {
      toggleNotesPanel();
    }
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }

  document.addEventListener("keydown", handleKeyDown, true);

  function injectIntoIframe(iframe) {
    try {
      if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
      const iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!iframeDoc) return;
      if (iframeDoc._gemNotesShortcutHandler) return;
      iframeDoc.addEventListener("keydown", handleKeyDown, true);
      iframeDoc._gemNotesShortcutHandler = true;
    } catch (_) {}
  }

  /** Same-origin iframes (e.g. Media DB in the image picker) get a new document on each navigation — reinject after `load`. */
  function bindNotesShortcutIframeReload(iframe) {
    if (!iframe || iframe._gemNotesShortcutIframeLoadBound) return;
    iframe._gemNotesShortcutIframeLoadBound = true;
    iframe.addEventListener("load", () => {
      setTimeout(() => injectIntoIframe(iframe), 50);
    });
  }

  function waitForIframeReady(iframe) {
    try {
      if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
      bindNotesShortcutIframeReload(iframe);
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

  document.addEventListener(GEM_CLOSE_NOTES_EVENT, () => {
    hideNotesPanel();
  });
}

// ── Init ────────────────────────────────────────────────────────────────

scanForNav();
observeNav();
setupNotesPanelShortcuts();
