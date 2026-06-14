console.log("[gem] settings-panel.js LOADED in frame:", window.location.href);

// ------------------------------------------------------------
// Theme mode — applyGemThemeMode lives in theme-applier.js (loaded first)
// ------------------------------------------------------------
const GEM_THEME_MODE_STORAGE_KEY = "gemThemeMode";
const GEM_THEME_MODE_LOCAL_KEY = "gemThemeMode";
const GEM_RECENT_IMAGES_STORAGE_KEY = 'gemRecentImages';
const GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY = 'gemRecentlySeenImages';
const GEM_RECENTLY_SEEN_IMAGES_MAX_KEY = 'gemRecentlySeenImagesMax';
const GEM_CUSTOM_PASTE_ENABLED_KEY = "gemCustomPasteEnabled";
const GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY = "gemCustomPasteAllowBold";
const GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY = "gemCustomPasteAllowItalic";
const GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY = "gemCustomPasteAllowStrikethrough";
const GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY = "gemCustomPasteAllowUnderline";
const GEM_CUSTOM_PASTE_ALLOW_SUP_KEY = "gemCustomPasteAllowSuperscript";
const GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY = "gemCustomPasteAllowAnchor";
const GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY = "gemEmailCampaignListLoadAll";
const GEM_EXPANDED_MODE_STORAGE_KEY = "fullscreenActive";
const GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY = 'gemPreflightTotalImageWeightThresholdValue';
const GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY = 'gemPreflightTotalImageWeightThresholdUnit';
const GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY = 'gemPreflightSingularImageWeightThresholdValue';
const GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY = 'gemPreflightSingularImageWeightThresholdUnit';
const GEM_PREFLIGHT_URL_NEVER_CHECK_KEY = 'urlPreflightNeverCheck';
const GEM_PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY = 'gemPreflightEnableLiveLinkVerify';
const GEM_SHARED_LINK_AUTO_SELECT_KEY = 'gemSharedLinkAutoSelect';
const GEM_PREFLIGHT_HIDE_LINKS_SECTION_KEY = 'gemPreflightHideLinksSection';
const GEM_PREFLIGHT_ICON_PIP_TOGGLES_KEY = 'gemPreflightIconPipToggles';
const GEM_PREFLIGHT_ICON_PIP_TOGGLES_DEFAULT = {
  textAlerts: true,
  missingAlt: true,
  linkTitles: true,
  linkLint: true,
  imageWeight: true
};
const GEM_PREFLIGHT_DEFAULT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE = 3;
const GEM_PREFLIGHT_DEFAULT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE = 2;
const GEM_PREFLIGHT_DEFAULT_IMAGE_WEIGHT_THRESHOLD_UNIT = 'MB';
const GEM_FULL_BACKUP_TYPE = 'gemma-full-backup';
const GEM_FULL_BACKUP_VERSION = 1;
const GEM_SNIPPET_MAX_CHUNKS = 16;
const GEM_FAVORITE_IMAGE_MAX_CHUNKS = 16;

function normalizeGemThemeMode(value) {
  return typeof window.gemNormalizeThemeMode === "function"
    ? window.gemNormalizeThemeMode(value)
    : "gemma-amethyst";
}

// Order matches theme.css :root --token-*-default (lines 7-12)
const GEM_THEME_SWATCHES = [
  { mode: "original", label: "Sapphire (Emarsys default)", color: "var(--token-sapphire-default)" },
  { mode: "gemma-topaz", label: "Topaz", color: "var(--token-topaz-default)" },
  { mode: "gemma-carnelian", label: "Carnelian", color: "var(--token-carnelian-default)" },
  { mode: "gemma-ruby", label: "Ruby", color: "var(--token-ruby-default)" },
  { mode: "gemma-turquoise", label: "Turquoise", color: "var(--token-turquoise-default)" },
  { mode: "gemma-amethyst", label: "Amethyst", color: "var(--token-amethyst-default)" }
];

function syncThemeSwatchUI(mode) {
  const normalized = normalizeGemThemeMode(mode);
  const hidden = document.getElementById("opt-theme-mode");
  if (hidden) hidden.value = normalized;
  document.querySelectorAll("#gem-theme-swatches .gem-theme-swatch").forEach((btn) => {
    const active = btn.getAttribute("data-theme-mode") === normalized;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.classList.toggle("gem-theme-swatch--selected", active);
  });
}

function applyGemThemeMode(mode, opts) {
  if (typeof window.gemApplyThemeMode === "function") {
    window.gemApplyThemeMode(mode, opts);
  }
}

function applyExpandedMode(enabled) {
  try {
    const body = document.body;
    if (!body) return;
    body.classList.toggle("gem-expanded", !!enabled);
  } catch (_) {
    // ignore
  }
}


// ------------------------------------------------------------
// settings-panel.js
// Slide-out settings panel for your Chrome extension UI
// ------------------------------------------------------------

// Default color swatches - globally available
window.DEFAULT_COLOR_SWATCHES = ["#FE4D01", "", "", "", "", "", "", ""];

// Default highlight terms - fresh installs start with none.
window.DEFAULT_HIGHLIGHT_TERMS = {};

(function () {
  let panelEl = null;
  let isOpen = false;
  let _gemPasteUiSyncing = false;
  let _gemPasteLastAllowState = null;
  let _gemSettingsListenersAttached = false;
  let _gemSettingsBoundHandlers = null;
  const _gemColorSwatchPendingWrites = new Map();
  let _gemColorSwatchFlushTimer = null;
  let _gemColorSwatchReloadAfterFlush = false;

  // Styles are now loaded from settings-panel.css via manifest

  function normalizeRecentlySeenMax(value) {
    const n = (typeof value === 'number') ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n)) return 300;
    return Math.min(2000, Math.max(50, Math.trunc(n)));
  }

  const LAST_USED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

  function pruneRecentlySeenImagesToLimit(list, limit, nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (!Array.isArray(list) || list.length <= limit) return list;
    const next = [...list];
    function isProtectedEntry(x) {
      const lu = x && typeof x.lastUsed === 'number' ? x.lastUsed : null;
      return lu != null && (now - lu) <= LAST_USED_RETENTION_MS;
    }
    function removeOneSmallestTsUnprotected() {
      let bestIdx = -1;
      let bestTs = Infinity;
      for (let i = 0; i < next.length; i++) {
        const x = next[i];
        if (isProtectedEntry(x)) continue;
        const t = (x && typeof x.ts === 'number') ? x.ts : 0;
        if (t < bestTs) {
          bestTs = t;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        next.splice(bestIdx, 1);
        return true;
      }
      return false;
    }
    function removeOneSmallestTsAny() {
      let bestIdx = -1;
      let bestTs = Infinity;
      for (let i = 0; i < next.length; i++) {
        const x = next[i];
        const t = (x && typeof x.ts === 'number') ? x.ts : 0;
        if (t < bestTs) {
          bestTs = t;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        next.splice(bestIdx, 1);
        return true;
      }
      return false;
    }
    while (next.length > limit) {
      if (!removeOneSmallestTsUnprotected()) {
        if (!removeOneSmallestTsAny()) break;
      }
    }
    return next;
  }

  function pruneRecentlySeenToMax(max) {
    const limit = normalizeRecentlySeenMax(max);
    try {
      chrome.storage.local.get({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: [] }, (res) => {
        try {
          const list = Array.isArray(res && res[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]) ? res[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY] : [];
          if (list.length <= limit) return;
          const cleaned = list
            .map((x) => {
              const url = x && x.url;
              if (!url) return null;
              const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
              const path = (x && typeof x.path === 'string') ? x.path : '';
              const friendlyFilename = (x && typeof x.friendlyFilename === 'string') ? x.friendlyFilename : '';
              const lastUsed = (x && typeof x.lastUsed === 'number') ? x.lastUsed : undefined;
              const row = { url, ts, path, friendlyFilename };
              if (lastUsed != null) row.lastUsed = lastUsed;
              return row;
            })
            .filter(Boolean);
          cleaned.sort((a, b) => (a.ts || 0) - (b.ts || 0));
          const pruned = pruneRecentlySeenImagesToLimit(cleaned, limit, Date.now());
          chrome.storage.local.set({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: pruned });
        } catch (_) { }
      });
    } catch (_) { }
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function getGemmaLocalStorageSnapshot() {
    const snapshot = {};
    const explicitKeys = new Set([GEM_THEME_MODE_LOCAL_KEY]);
    const gemmaPrefix = /^gem/i;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!gemmaPrefix.test(key) && !explicitKeys.has(key)) continue;
        snapshot[key] = localStorage.getItem(key);
      }
    } catch (err) {
      console.warn("[gem] Failed to read localStorage for backup:", err);
    }
    return snapshot;
  }

  function clearGemmaLocalStorageKeys() {
    const keys = Object.keys(getGemmaLocalStorageSnapshot());
    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (_) {
        // ignore key-specific localStorage errors
      }
    });
  }

  function storageAreaGetAll(area) {
    return new Promise((resolve) => {
      try {
        area.get(null, (data) => resolve(data || {}));
      } catch (err) {
        console.warn("[gem] Failed reading storage area:", err);
        resolve({});
      }
    });
  }

  function storageAreaSet(area, payload) {
    return new Promise((resolve, reject) => {
      try {
        area.set(payload, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "Storage write failed"));
            return;
          }
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function storageAreaClear(area) {
    return new Promise((resolve, reject) => {
      try {
        area.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "Storage clear failed"));
            return;
          }
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  const FULL_BACKUP_EXPORT_CATEGORY_DEFS = [
    {
      id: "snippets",
      label: "Snippets",
      syncKeys: ["gemSnippets", "sm", "s_meta", ...Array.from({ length: GEM_SNIPPET_MAX_CHUNKS }, (_, i) => `s${i}`)],
      localKeys: []
    },
    {
      id: "savedSearches",
      label: "Saved Searches",
      syncKeys: ["gemSearchPills"],
      localKeys: []
    },
    {
      id: "textHighlighting",
      label: "Text Highlighting",
      syncKeys: ["highlightTerms", "enableHighlighting"],
      localKeys: []
    },
    {
      id: "blockVisibility",
      label: "Block Visibility",
      syncKeys: ["bm", "b_meta", ...Array.from({ length: 16 }, (_, i) => `b${i}`)],
      localKeys: []
    },
    {
      id: "notes",
      label: "Notes",
      syncKeys: ["gemNotes"],
      localKeys: []
    },
    {
      id: "favoriteImages",
      label: "Favorite Images",
      syncKeys: [
        "fm",
        ...Array.from({ length: GEM_FAVORITE_IMAGE_MAX_CHUNKS }, (_, i) => `f${i}`)
      ],
      localKeys: [
        "gemFavoriteImagesConsolidated",
        "gemFavoriteImages",
        "gemFavoriteImageMeta"
      ]
    },
    {
      id: "colorSwatches",
      label: "Color Swatches",
      syncKeys: ["colorSwatches"],
      localKeys: []
    },
    {
      id: "preflightUrlBlocklist",
      label: "Preflight URL Blocklist",
      syncKeys: [GEM_PREFLIGHT_URL_NEVER_CHECK_KEY],
      localKeys: []
    },
    {
      id: "settings",
      label: "Settings (all other data)",
      syncKeys: [],
      localKeys: []
    }
  ];

  const FULL_BACKUP_EXPORT_CATEGORY_MAP = FULL_BACKUP_EXPORT_CATEGORY_DEFS.reduce((acc, def) => {
    acc[def.id] = def;
    return acc;
  }, {});

  const FULL_BACKUP_ALL_CATEGORY_SYNC_KEYS = new Set();
  const FULL_BACKUP_ALL_CATEGORY_LOCAL_KEYS = new Set();
  FULL_BACKUP_EXPORT_CATEGORY_DEFS.forEach((def) => {
    if (def.id === "settings") return;
    def.syncKeys.forEach((k) => FULL_BACKUP_ALL_CATEGORY_SYNC_KEYS.add(k));
    def.localKeys.forEach((k) => FULL_BACKUP_ALL_CATEGORY_LOCAL_KEYS.add(k));
  });

  function stripFullBackupExcludedStorageKeys(source) {
    const out = {};
    if (!isPlainObject(source)) return out;
    Object.keys(source).forEach((key) => {
      if (key === "extensionVersion") return;
      if (key === "gemRecentlySeenImages") return;
      if (key === "gemPreflightAlertCount") return;
      if (key === "gemRecentlySeenImageGroupCollapse") return;
      if (String(key).startsWith("gemDraft_")) return;
      out[key] = source[key];
    });
    return out;
  }

  function pickExistingKeys(source, keys) {
    const out = {};
    if (!isPlainObject(source) || !Array.isArray(keys)) return out;
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
    });
    return out;
  }

  function pickRemainderKeys(source, excludedKeysSet) {
    const out = {};
    if (!isPlainObject(source)) return out;
    Object.keys(source).forEach((key) => {
      if (!excludedKeysSet.has(key)) out[key] = source[key];
    });
    return out;
  }

  function normalizeExportSelection(selection) {
    if (!Array.isArray(selection) || selection.length === 0) {
      return new Set(FULL_BACKUP_EXPORT_CATEGORY_DEFS.map((x) => x.id));
    }
    return new Set(
      selection
        .map((id) => String(id || "").trim())
        .filter((id) => id && FULL_BACKUP_EXPORT_CATEGORY_MAP[id])
    );
  }

  async function buildFullBackupPayload(selection = null) {
    const [rawSync, rawLocal] = await Promise.all([
      storageAreaGetAll(chrome.storage.sync),
      storageAreaGetAll(chrome.storage.local)
    ]);
    const syncData = stripFullBackupExcludedStorageKeys(rawSync);
    const localData = stripFullBackupExcludedStorageKeys(rawLocal);

    const selected = normalizeExportSelection(selection);
    const includeSettings = selected.has("settings");
    const selectedSync = {};
    const selectedLocal = {};

    FULL_BACKUP_EXPORT_CATEGORY_DEFS.forEach((def) => {
      if (def.id === "settings" || !selected.has(def.id)) return;
      Object.assign(selectedSync, pickExistingKeys(syncData, def.syncKeys));
      Object.assign(selectedLocal, pickExistingKeys(localData, def.localKeys));
    });

    if (includeSettings) {
      Object.assign(selectedSync, pickRemainderKeys(syncData, FULL_BACKUP_ALL_CATEGORY_SYNC_KEYS));
      Object.assign(selectedLocal, pickRemainderKeys(localData, FULL_BACKUP_ALL_CATEGORY_LOCAL_KEYS));
    }

    return {
      type: GEM_FULL_BACKUP_TYPE,
      version: GEM_FULL_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        sync: stripFullBackupExcludedStorageKeys(selectedSync),
        local: stripFullBackupExcludedStorageKeys(selectedLocal),
        localStorage: includeSettings ? getGemmaLocalStorageSnapshot() : {}
      }
    };
  }

  function validateFullBackupPayload(payload) {
    if (!isPlainObject(payload)) return { ok: false, message: "Backup must be a JSON object." };
    if (payload.type !== GEM_FULL_BACKUP_TYPE) return { ok: false, message: "This file is not a Gemma full backup export." };
    if (payload.version !== GEM_FULL_BACKUP_VERSION) return { ok: false, message: `Unsupported backup version: ${payload.version}` };
    if (!isPlainObject(payload.data)) return { ok: false, message: "Backup is missing data sections." };
    const { sync, local, localStorage: localStoreData } = payload.data;
    if (!isPlainObject(sync)) return { ok: false, message: "Backup sync data is invalid." };
    if (!isPlainObject(local)) return { ok: false, message: "Backup local data is invalid." };
    if (!isPlainObject(localStoreData)) return { ok: false, message: "Backup localStorage data is invalid." };
    return { ok: true };
  }

  function writeImportedLocalStorage(importedLocalStorage, replaceExisting) {
    if (replaceExisting) clearGemmaLocalStorageKeys();
    Object.entries(importedLocalStorage).forEach(([key, value]) => {
      if (!key || !/^gem/i.test(key)) return;
      try {
        localStorage.setItem(key, value == null ? "" : String(value));
      } catch (_) {
        // ignore failing key writes
      }
    });
  }

  function showFullBackupExportModal() {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 720px; width: 92%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 15px 0; color: var(--token-font-default, #333333);">Export Full Gemma Backup</h3>
        <p style="margin: 0 0 10px 0; color: var(--token-font-default, #666666); font-size: 14px;">Choose what to include, then generate JSON. If <b>Settings</b> is selected, all remaining sync/local keys and Gemma localStorage keys are included.</p>
        <div id="gem-full-backup-category-list" style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin-bottom: 14px; padding: 12px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 8px;">
          ${FULL_BACKUP_EXPORT_CATEGORY_DEFS.map((def) => `
            <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; cursor:pointer; line-height:1.3;">
              <input type="checkbox" class="gem-full-backup-category-checkbox" value="${def.id}" checked style="margin-top:2px;" />
              <span>${def.label}</span>
            </label>
          `).join("")}
        </div>
        <textarea id="gem-full-backup-export-json" class="gem-scrollable" readonly style="background:var(--token-background-faint); width: 100%; height: 240px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;" placeholder="Select one or more categories, then click Generate JSON."></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="gem-full-backup-generate-btn" class="e-btn e-btn-primary">Generate JSON</button>
          <button id="gem-full-backup-copy-btn" class="e-btn e-btn-primary">Copy to Clipboard</button>
          <button id="gem-full-backup-close-btn" class="e-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const textarea = modal.querySelector("#gem-full-backup-export-json");
    const generateBtn = modal.querySelector("#gem-full-backup-generate-btn");
    const copyBtn = modal.querySelector("#gem-full-backup-copy-btn");
    const checkboxes = Array.from(modal.querySelectorAll(".gem-full-backup-category-checkbox"));
    if (copyBtn) copyBtn.disabled = true;
    if (copyBtn) copyBtn.style.opacity = "0.6";

    const updateGenerateState = () => {
      const selectedCount = checkboxes.filter((cb) => cb.checked).length;
      if (generateBtn) generateBtn.disabled = selectedCount === 0;
      if (generateBtn) generateBtn.style.opacity = selectedCount === 0 ? "0.6" : "1";
    };
    checkboxes.forEach((cb) => cb.addEventListener("change", updateGenerateState));
    updateGenerateState();

    generateBtn?.addEventListener("click", async () => {
      const selected = checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
      if (selected.length === 0) {
        alert("Select at least one category to export.");
        return;
      }
      try {
        const payload = await buildFullBackupPayload(selected);
        if (textarea) textarea.value = JSON.stringify(payload, null, 2);
        if (copyBtn) copyBtn.disabled = false;
        if (copyBtn) copyBtn.style.opacity = "1";
      } catch (err) {
        console.error("[gem] Failed to build selective full backup payload:", err);
        alert("Failed to build full backup. Please try again.");
      }
    });

    modal.querySelector("#gem-full-backup-copy-btn")?.addEventListener("click", async () => {
      if (!textarea) return;
      if (!textarea.value.trim()) {
        alert("Generate JSON first, then copy it.");
        return;
      }
      try {
        await navigator.clipboard.writeText(textarea.value);
        const btn = modal.querySelector("#gem-full-backup-copy-btn");
        if (!btn) return;
        btn.textContent = "Copied!";
        btn.style.background = "#059669";
        setTimeout(() => {
          btn.textContent = "Copy to Clipboard";
          btn.style.background = "#10b981";
        }, 2000);
      } catch (err) {
        console.error("[gem] Failed to copy full backup:", err);
        alert("Failed to copy to clipboard. Please copy manually.");
      }
    });

    const closeModal = () => modal.remove();
    modal.querySelector("#gem-full-backup-close-btn")?.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  function showFullBackupImportModal() {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 720px; width: 92%; max-height: 86vh; display: flex; flex-direction: column;">
        <h3 style="margin: 0 0 12px 0; color: var(--token-font-default, #333333);">Import Full Gemma Backup</h3>
        <p style="margin: 0 0 12px 0; color: var(--token-font-default, #666666); font-size: 14px;">Paste a full backup JSON export. Choose whether to merge it with your current data or replace your current Gemma data entirely.</p>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom: 10px;">
          <label for="gem-full-backup-import-mode" style="font-weight:600; font-size:14px;">Import mode</label>
          <select id="gem-full-backup-import-mode" class="gem-select" style="min-width:200px;">
            <option value="merge" selected>Merge (imported values override conflicts)</option>
            <option value="replace">Replace existing Gemma data</option>
          </select>
        </div>
        <textarea id="gem-full-backup-import-json" class="gem-scrollable" placeholder="Paste backup JSON here..." style="background:var(--token-background-faint); width: 100%; height: 260px; padding: 10px; border: 1px solid var(--token-box-default-border, #e0e0e0); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; margin-bottom: 15px;"></textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="gem-full-backup-import-btn" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Import Backup</button>
          <button id="gem-full-backup-cancel-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector("#gem-full-backup-cancel-btn")?.addEventListener("click", closeModal);

    modal.querySelector("#gem-full-backup-import-btn")?.addEventListener("click", async () => {
      const textarea = modal.querySelector("#gem-full-backup-import-json");
      const modeSelect = modal.querySelector("#gem-full-backup-import-mode");
      const raw = textarea && textarea.value ? textarea.value.trim() : "";
      if (!raw) {
        alert("Please paste backup JSON to import.");
        return;
      }

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (_) {
        alert("Invalid JSON format. Please check your backup and try again.");
        return;
      }

      const validation = validateFullBackupPayload(payload);
      if (!validation.ok) {
        alert(validation.message);
        return;
      }

      const replaceExisting = !!(modeSelect && modeSelect.value === "replace");
      const importedSync = payload.data.sync;
      const importedLocal = payload.data.local;
      const importedLocalStorage = payload.data.localStorage;

      try {
        if (replaceExisting) {
          await storageAreaClear(chrome.storage.sync);
          await storageAreaClear(chrome.storage.local);
          if (Object.keys(importedSync).length) await storageAreaSet(chrome.storage.sync, importedSync);
          if (Object.keys(importedLocal).length) await storageAreaSet(chrome.storage.local, importedLocal);
          writeImportedLocalStorage(importedLocalStorage, true);
        } else {
          const [currentSync, currentLocal] = await Promise.all([
            storageAreaGetAll(chrome.storage.sync),
            storageAreaGetAll(chrome.storage.local)
          ]);
          await storageAreaSet(chrome.storage.sync, { ...currentSync, ...importedSync });
          await storageAreaSet(chrome.storage.local, { ...currentLocal, ...importedLocal });
          writeImportedLocalStorage(importedLocalStorage, false);
        }

        loadSettings();
        syncThemeSwatchUI(document.getElementById("opt-theme-mode")?.value || "gemma-amethyst");
        alert("Full backup imported successfully.");
        closeModal();
      } catch (err) {
        console.error("[gem] Failed importing full backup:", err);
        alert("Import failed. Please try again.");
      }
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // ------------------------------------------------------------
  // Create panel structure
  // ------------------------------------------------------------
  function createPanel() {
    if (panelEl) return panelEl;

    panelEl = document.createElement("div");
    panelEl.id = "gem-settings-panel";
    panelEl.innerHTML = `
      <div id="gem-settings-header">
        <span class="gem-settings-header-title">
          Gemma Settings
          <span class="gem-panel-shortcut-hint gem-panel-shortcut-hint--on-primary">${typeof window.gemPanelShortcutLabel === "function" ? window.gemPanelShortcutLabel("G") : "[ CTRL + G ]"}</span>
        </span>
        <div style="display: flex; flex-direction: row; gap: 16px; margin-left:auto">
          <div class="gem-welcome-link gem-border-hover-primary-600" style="border-radius: 8px; align-content: center; flex: 1; color: #fff; text-align: center; cursor: pointer; border: 1px solid #fff; padding: 0 12px;">
            <div style="font-size: 12px; font-weight: 600">
              Features
            </div>
          </div>

          <div style="flex: 1;">
            <button class="e-btn gem-keyboard-shortcuts-btn gem-border-hover-primary-600" type="button" style="border: 1px solid #fff; background:transparent; color: #fff; border-radius: 8px; width: 100%; text-align:center; height:auto; padding: 0 12px;">
              <div style="font-size: 12px; font-weight: 600">
                Shortcuts
              </div>
            </button>
          </div>
        </div>
        <div id="gem-settings-close">✕</div>
      </div>
      <div id="gem-settings-body" class="gem-scrollable">

        <h2>General Settings</h2>

        <div class="gem-setting-section">
          <h3>Theme</h3>
          <div class="gem-setting gem-setting-condensed">
            <div style="display: flex; flex-direction: row; gap: 12px;">
              <div>
                <label id="gem-theme-label" for="opt-theme-mode">Accent Color</label>
                <div class="sub-label">
                  Pick from these available accent colors to theme your Emarsys experience.
                </div>
              </div>
              <input type="hidden" id="opt-theme-mode" value="gemma-amethyst">
              <div id="gem-theme-swatches" class="gem-theme-swatches" role="group" aria-labelledby="gem-theme-label">
                ${GEM_THEME_SWATCHES.map(({ mode, label, color }) => {
                  const safe = String(label)
                    .replace(/&/g, "&amp;")
                    .replace(/"/g, "&quot;")
                    .replace(/</g, "&lt;");
                  return `<button type="button" class="gem-theme-swatch" data-theme-mode="${mode}" style="background-color:${color}" aria-label="${safe}" title="${safe}" aria-pressed="false"></button>`;
                }).join("")}
              </div>
            </div>

          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Account Selection for Shared Links</h3>
          <div class="gem-setting gem-setting-condensed">
            <div class="gem-e-switch-wrapper">
              <label for="opt-shared-link-auto-select">Automatically Select Account</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-shared-link-auto-select" checked>
                <label class="e-switch__toggle" for="opt-shared-link-auto-select"></label>
              </div>
            </div>
            <p class="sub-label">
              When navigating to certain Emarsys links (such as links shared by teammates), Emarsys may show a security confirmation page asking you to select your active account. When enabled, Gemma will automatically confirm this for you so you land directly on the intended page.
            </p>
          </div>
        </div>

        <h2>Email Editor Settings</h2>

        <div class="gem-setting-section">
          <h3>ALT Text Preview</h3>
          <div class="gem-setting gem-setting-condensed">
            <div class="gem-e-switch-wrapper">
              <label for="opt-alt-text-preview-enabled">Toggle ALT Text Previews</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-alt-text-preview-enabled">
                <label class="e-switch__toggle" for="opt-alt-text-preview-enabled"></label>
              </div>
            </div>
            <p class="sub-label">
              When enabled, ALT text will be displayed in a small preview box above your images. You can also toggle this from the email preview toolbar.
            </p>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <div style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-alt-text-visibility" style="flex: 1;">ALT Text Visibility</label>
              <select id="opt-alt-text-visibility" style="width: 150px;">
                <option value="always-show" selected>Always Show</option>
                <option value="show-on-hover">Show on Hover</option>
              </select>
            </div>
            <p class="sub-label">
              Decide whether to show the ALT text always or only when you hover over an image.
            </p>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Block Targeting Preview</h3>
          <div class="gem-setting gem-setting-condensed">
            <div class="gem-e-switch-wrapper">
              <label for="opt-block-targeting-preview-enabled">Toggle Block Targeting Previews</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-block-targeting-preview-enabled" checked>
                <label class="e-switch__toggle" for="opt-block-targeting-preview-enabled"></label>
              </div>
            </div>
            <p class="sub-label">
              When enabled, blocks with targeting rules show a visual preview in the email canvas. You can also toggle this from the email preview toolbar.
            </p>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <div style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-block-targeting-visibility" style="flex: 1;">Block Targeting Visibility</label>
              <select id="opt-block-targeting-visibility" style="width: 150px;">
                <option value="always-show" selected>Always Show</option>
                <option value="show-on-hover">Show on Hover</option>
              </select>
            </div>
            <p class="sub-label">
              Decide whether targeting previews are always visible or only when you hover over a block.
            </p>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Layout</h3>
          <div class="gem-setting">
            <div class="gem-e-switch-wrapper">
              <label for="opt-enable-expanded-mode">Toggle expanded mode</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-enable-expanded-mode">
                <label class="e-switch__toggle" for="opt-enable-expanded-mode"></label>
              </div>
            </div>
            <p class="sub-label">
              An alternative layout that increases the total viewable area of your email by over 40%. You can turn it on here, via the <span class="gem-e-icon">&#61658;</span> icon next to your email, or use the keyboard shortcut CMD+SHIFT+F or CTRL+SHIFT+F at any time.
            </p>
          </div>
          <div class="gem-setting">

            <div class="gem-e-switch-wrapper">
              <label for="opt-enable-mobile-preview">Toggle mobile preview pane</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-enable-mobile-preview">
                <label class="e-switch__toggle" for="opt-enable-mobile-preview"></label>
              </div>
            </div>
            <p class="sub-label">
              Keep a mobile preview of your email visible next to your desktop view while you make edits. You can turn it on here or via the <span class="gem-e-icon">&#61747;</span> icon in the left navigation.
            </p>
            <div class="gem-setting-section">
              <div class="gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
                <label for="opt-mobile-preview-width" style="flex: 1;">Width (px)</label>
                <input type="number" id="opt-mobile-preview-width" min="200" max="800" step="1" style="width: 120px;" />
              </div>
              <div class="gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
                <label for="opt-mobile-preview-scale" style="flex: 1;">Scale</label>
                <select id="opt-mobile-preview-scale" style="width: 120px;">
                  <option value="1">100%</option>
                  <option value="0.5">50%</option>
                </select>
              </div>
            </div>
          </div>

          <div class="gem-setting">
            <div class="gem-e-switch-wrapper">
              <label for="opt-show-finish-editing-btn">Show "Finish Editing" Button</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-show-finish-editing-btn" checked>
                <label class="e-switch__toggle" for="opt-show-finish-editing-btn"></label>
              </div>
            </div>
          </div>

          <div class="gem-setting">
            <div class="gem-e-switch-wrapper">
              <label for="opt-show-finish-editing-btn">Show "Recent Media" Button in Vertical Nav</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-show-finish-editing-btn">
                <label class="e-switch__toggle" for="opt-show-finish-editing-btn"></label>
              </div>
            </div>
          </div>
        </div>

        <div class="gem-setting-section gem-setting-section-content-block-toolbar">
          <h3>Content Block Toolbar</h3>
          <p class="gem-setting-info">The content block toolbar is visible when hovering over a block in your email. Most of the icons can be toggled on or off based on the preferences you set here.</p>
          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-manage-optional-content" style="flex: 1;">
            <e-icon icon="click-rate-over-time"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Manage optional content</label>
            <select id="opt-manage-optional-content" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-predict-recommendation" style="flex: 1;">
            <e-icon icon="feature-predict"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
              Predict Recommendation
            </label>
            <select id="opt-predict-recommendation" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-product-finder" style="flex: 1;">
            <e-icon icon="search"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Product Finder</label>
            <select id="opt-product-finder" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-product-source" style="flex: 1;">
            <e-icon icon="product"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Product Source</label>
            <select id="opt-product-source" style="width: 150px;">
              <option value="always-show">Always Show</option>
              <option value="hide-if-disabled" selected>Hide if Disabled</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-save-to-reuse" style="flex: 1;">
            <e-icon icon="save"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Save to reuse</label>
            <select id="opt-save-to-reuse" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-reset-block" style="flex: 1;">
            <e-icon icon="reset"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>
            Reset block</label>
            <select id="opt-reset-block" style="width: 150px;">
              <option value="always-show" selected>Always Show</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-convert-esl-to-tokens" style="flex: 1;">
            <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon"></div>
      </div>
    </gem-e-icon>
            Convert ESL to Tokens</label>
            <select id="opt-convert-esl-to-tokens" style="width: 150px;">
              <option value="always-show" selected>Show if Available</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>

          <div class="gem-setting gem-setting-condensed" style="display: flex; gap: 12px; align-items: center;">
            <label for="opt-swap-keywords" style="flex: 1;">
            <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon"></div>
      </div>
    </gem-e-icon>
            Swap Keywords</label>
            <select id="opt-swap-keywords" style="width: 150px;">
              <option value="always-show" selected>Show if Available</option>
              <option value="always-hide">Always Hide</option>
            </select>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Color Swatch Management</h3>
          <p class="gem-setting-info">These colors will appear as the first row in the color picker. Add or remove any color you want (up to 8 total).</p>
          <div id="color-swatches-list">
            <!-- Color swatches will be dynamically added here -->
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Blocks Panel</h3>

          <div class="gem-setting">
            <div style="display: flex; gap: 12px; align-items: center;">
              <label for="opt-blocks-panel-layout" style="flex: 1;">Layout</label>
              <select id="opt-blocks-panel-layout" style="width: 150px;">
                <option value="1">1 per Row</option>
                <option value="2" selected>2 per Row</option>
                <option value="3">3 per Row</option>
              </select>
            </div>
            <div class="sub-label">Choose how many blocks to display per row in the blocks panel.</div>
          </div>

          <div class="gem-setting">
            <button id="unhide-all-blocks-btn" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;">
              Unhide All Blocks
            </button>
            <div class="sub-label">Permanently unhide all blocks that have been hidden. This action cannot be undone.</div>
          </div>
        </div>

        <div class="gem-setting-section">
          <h3>Rich Paste</h3>
          <div class="gem-setting">

            <div class="gem-e-switch-wrapper">
              <label for="opt-custom-paste-enabled">Enable Gemma's Rich Paste behavior</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-custom-paste-enabled" checked>
                <label class="e-switch__toggle" for="opt-custom-paste-enabled"></label>
              </div>
            </div>
            <p class="sub-label">Emarsys's normal plain text formatting is replaced with behavior that supports pasting common styles like bold and italic.</p>
            <div class="gem-setting-group">

              <div class="gem-e-switch-wrapper">
                <label for="opt-custom-paste-bold">Allow bold formatting to be pasted</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-custom-paste-bold" checked>
                  <label class="e-switch__toggle" for="opt-custom-paste-bold"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-custom-paste-italic">Allow italic formatting to be pasted</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-custom-paste-italic" checked>
                  <label class="e-switch__toggle" for="opt-custom-paste-italic"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-custom-paste-strike">Allow strikethrough formatting to be pasted</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-custom-paste-strike" checked>
                  <label class="e-switch__toggle" for="opt-opt-custom-paste-strike"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-custom-paste-underline">Allow underline formatting to be pasted</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-custom-paste-underline" checked>
                  <label class="e-switch__toggle" for="opt-custom-paste-underline"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-custom-paste-sup">Allow superscript formatting to be pasted</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-custom-paste-sup" checked>
                  <label class="e-switch__toggle" for="opt-custom-paste-sup"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-custom-paste-anchor">Allow links to be pasted</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-custom-paste-anchor" checked>
                  <label class="e-switch__toggle" for="opt-custom-paste-anchor"></label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <h2>Preflight Settings</h2>

        <div class="gem-setting-section" id="gem-settings-preflight-settings">
          <h3>Preflight Image Alerts</h3>
          <div class="gem-setting gem-setting-condensed" style="display:flex; gap:12px; align-items:center;">
            <label for="opt-preflight-total-image-weight-threshold-value" style="flex:1;">Total Image Weight Threshold</label>
            <input type="number" id="opt-preflight-total-image-weight-threshold-value" min="0.1" step="0.1" style="width:100px;" value="3" />
            <select id="opt-preflight-total-image-weight-threshold-unit" style="width:90px;">
              <option value="KB">KB</option>
              <option value="MB" selected>MB</option>
            </select>
          </div>
          <div class="gem-setting gem-setting-condensed" style="display:flex; gap:12px; align-items:center;">
            <label for="opt-preflight-singular-image-weight-threshold-value" style="flex:1;">Singular Image Weight Threshold</label>
            <input type="number" id="opt-preflight-singular-image-weight-threshold-value" min="0.1" step="0.1" style="width:100px;" value="2" />
            <select id="opt-preflight-singular-image-weight-threshold-unit" style="width:90px;">
              <option value="KB">KB</option>
              <option value="MB" selected>MB</option>
            </select>
          </div>
          <div class="gem-setting gem-setting-condensed">
            <p class="sub-label">
              When enabled, blocks with targeting rules show a visual preview in the email canvas. You can also toggle this from the email preview toolbar.
            </p>
          </div>
        </div>
        <div class="gem-setting-section" id="gem-settings-preflight-icon-alerts">
          <h3>Preflight Icon Alerts</h3>
          <div class="gem-setting">
            <p class="sub-label">Choose which Preflight issues contribute to the badge count on the Preflight nav icon. Issues still appear in the Preflight panel regardless.</p>
            <div class="gem-setting-group">
              <div class="gem-e-switch-wrapper">
                <label for="opt-preflight-pip-text-alerts">Text alerts</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-preflight-pip-text-alerts" checked>
                  <label class="e-switch__toggle" for="opt-preflight-pip-text-alerts"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-preflight-pip-missing-alt">Linked images missing ALT text</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-preflight-pip-missing-alt" checked>
                  <label class="e-switch__toggle" for="opt-preflight-pip-missing-alt"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-preflight-pip-link-titles">Links with title attributes</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-preflight-pip-link-titles" checked>
                  <label class="e-switch__toggle" for="opt-preflight-pip-link-titles"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-preflight-pip-link-lint">Link lint issues</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-preflight-pip-link-lint" checked>
                  <label class="e-switch__toggle" for="opt-preflight-pip-link-lint"></label>
                </div>
              </div>
              <div class="gem-e-switch-wrapper">
                <label for="opt-preflight-pip-image-weight">Image weight alerts</label>
                <div class="gem-e-switch--fat e-switch">
                  <input type="checkbox" class="e-switch__input" id="opt-preflight-pip-image-weight" checked>
                  <label class="e-switch__toggle" for="opt-preflight-pip-image-weight"></label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="gem-setting-section" id="gem-settings-preflight-url-never-check">
          <h3>Preflight Link Alerts</h3>
          <div class="gem-setting">
            <button id="gem-preflight-grant-link-access-btn" class="e-btn e-btn-primary" type="button">Grant Access to Live Verify</button>
            <p class="sub-label" style="margin-top:8px;">
              Requests host access for live link verification and re-enables the Links section if it was previously hidden.
            </p>
          </div>
          <div class="gem-setting">
            <div class="gem-e-switch-wrapper">
              <label for="opt-preflight-enable-live-link-verify">Enable Live Verify</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-preflight-enable-live-link-verify">
                <label class="e-switch__toggle" for="opt-preflight-enable-live-link-verify"></label>
              </div>
            </div>
            <p class="sub-label">
              Live verify opens your links in a new tab and follows them all the way through to the destination page. When disabled, Live verify buttons and automatic Contact Preview link verification are turned off in Preflight.
            </p>
          </div>
          <div class="gem-setting">
          <div style="display: flex; justify-content: space-between; align-items: anchor-center;">
            <div style="max-width:70%;"><span style="font-weight: 600; font-size: 16px;">URL Skip List</span>
            </div><button id="gem-manage-preflight-never-check-btn" class="e-btn"type="button">Manage URLs</button></div>
            
                                  <p class="sub-label" style="margin-top:8px;">Manage a list of URLs that you would like the Preflight QA process to skip. <span id="gem-preflight-never-check-summary">No URLs are currently skipped.</span></p>
          </div>

        </div>

        <div class="gem-setting-section">
          <h3>Preflight Text Alerts</h3>
        <div class="gem-setting">
          <div class="gem-e-switch-wrapper">
            <label for="opt-enable-highlighting">Enable text highlighting overlays</label>
            <div class="gem-e-switch--fat e-switch">
              <input type="checkbox" class="e-switch__input" id="opt-enable-highlighting">
              <label class="e-switch__toggle" for="opt-enable-highlighting"></label>
            </div>
          </div>
          <p class="sub-label">
            Creates overlays to help you quickly identify and highlight specific text in your email. Upgrade your highlights to "Alerts" to get notified in the preflight panel when your email contains the highlighted text.
          </p>
        </div>
          <div id="highlight-terms-list">
            <!-- Terms will be dynamically added here -->
          </div>
          <div class="gem-add-term">
            <div class="gem-settings-input-wrap">
              <input type="text" id="new-term-text" placeholder="New term to highlight" />
              <button type="button" id="new-term-regex-toggle" class="gem-settings-regex-toggle" title="Use regular expression" aria-pressed="false">.*</button>
            </div>
            <input type="color" id="new-term-color" class="color-swatch-color" value="#ffff00" />
            <select id="new-term-mode" class="gem-highlight-term-mode" title="Choose term behavior">
              <option value="highlight" selected>Highlight</option>
              <option value="notify">Notify</option>
            </select>
            <button id="add-term-btn" class="e-btn e-btn-primary">Add</button>
          </div>
        </div>

        <h2>Media Picker Settings</h2>

        <div class="gem-setting-section">
          <h3>General</h3>
          <div class="gem-setting">
            <label style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <span>Recent Images limit</span>
              <input type="number" id="opt-recently-seen-max" min="50" max="2000" step="1" value="300" style="width:120px;" />
            </label>
            <div class="sub-label">
              Max number of images to keep in the Recent Images list (50–2000).
            </div>
          </div>
          <div class="gem-setting-group">
            <div class="gem-e-switch-wrapper">
              <label for="opt-show-created-column">Show 'Created' column in media picker</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-show-created-column" checked>
                <label class="e-switch__toggle" for="opt-show-created-column"></label>
              </div>
            </div>
            <div class="gem-e-switch-wrapper">
              <label for="opt-show-size-column">Show 'Size' column in media picker</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-show-size-column" checked>
                <label class="e-switch__toggle" for="opt-show-size-column"></label>
              </div>
            </div>
            <div class="gem-e-switch-wrapper">
              <label for="opt-show-user-column">Show 'User' column in media picker</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-show-user-column" checked>
                <label class="e-switch__toggle" for="opt-show-user-column"></label>
              </div>
            </div>
          </div>
        </div>

        <div class="gem-setting-section" id="gem-settings-saved-searches">
          <h3>Saved Searches</h3>
          <p class="gem-setting-info">Manage saved search pills for the Favorite Images and Recent Images lists.</p>
          <div id="gem-saved-searches-list"></div>
        </div>


        <h2>Email Campaign List Settings</h2>

        <div class="gem-setting-section">
          <h3>Filters</h3>
          <div class="gem-setting">
            <div class="gem-e-switch-wrapper">
              <label for="opt-email-campaign-list-load-all">Load all emails by default</label>
              <div class="gem-e-switch--fat e-switch">
                <input type="checkbox" class="e-switch__input" id="opt-email-campaign-list-load-all">
                <label class="e-switch__toggle" for="opt-email-campaign-list-load-all"></label>
              </div>
            </div>
            <p class="sub-label">
              The default 'Created' date filter is cleared automatically. Warning: This increases page load time.
            </p>
          </div>
        </div>

        <div id="gem-storage-meter-mount"></div>

        <div class="gem-setting-section" id="gem-settings-full-backup">
          <h3>Full Backup &amp; Restore</h3>
          <div class="gem-setting gem-setting-condensed">
            <p class="sub-label">
              Export or import a complete Gemma backup from one place. This includes your extension settings and data from Chrome sync storage, local extension storage, and Gemma local storage keys so you can safely share setups or recover your workspace.
            </p>
            <div class="gem-full-backup-actions">
              <button id="gem-export-full-backup-btn" class="e-btn" type="button">Export Settings</button>
              <button id="gem-import-full-backup-btn" class="e-btn" type="button">Import Settings</button>
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(panelEl);
    syncThemeSwatchUI(document.getElementById("opt-theme-mode")?.value || "gemma-amethyst");

    // Close button
    panelEl.querySelector("#gem-settings-close")
      .addEventListener("click", closePanel);

    // Welcome modal link
    const welcomeLink = panelEl.querySelector(".gem-welcome-link");
    if (welcomeLink) {
      welcomeLink.addEventListener("click", () => {
        if (window.showWelcomeModal) {
          window.showWelcomeModal();
        }
      });
    }

    // Keyboard shortcuts button
    const shortcutsBtn = panelEl.querySelector(".gem-keyboard-shortcuts-btn");
    if (shortcutsBtn) {
      shortcutsBtn.addEventListener("click", window.showGemKeyboardShortcutsModal);
    }

    return panelEl;
  }

  // ------------------------------------------------------------
  // Load settings into UI
  // ------------------------------------------------------------
  function parsePreflightNeverCheckStoredValue(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean).map((v) => String(v));
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) return [];
      if (text.startsWith("{") && text.includes('"v"')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.v === 2 && Array.isArray(parsed.p) && Array.isArray(parsed.e)) {
            const out = [];
            parsed.e.forEach((entry) => {
              if (typeof entry === "string") {
                if (entry) out.push(entry);
                return;
              }
              if (Array.isArray(entry) && entry.length === 2) {
                const idx = Number.parseInt(String(entry[0]), 10);
                const suffix = String(entry[1] || "");
                const prefix = parsed.p[idx];
                if (typeof prefix === "string") out.push(prefix + suffix);
              }
            });
            return out.filter(Boolean);
          }
        } catch (_) {}
      }
      return text.split("\n").map((v) => String(v || "").trim()).filter(Boolean);
    }
    return [];
  }

  function serializePreflightNeverCheckStoredValue(list) {
    const cleaned = Array.from(new Set((Array.isArray(list) ? list : []).map((v) => String(v || "").trim()).filter(Boolean)));
    cleaned.sort((a, b) => a.localeCompare(b));
    const baseline = cleaned.join("\n");

    const prefixCounts = new Map();
    cleaned.forEach((url) => {
      try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") return;
        const prefix = `${u.origin}/`;
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      } catch (_) {}
    });
    const prefixes = Array.from(prefixCounts.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map(([prefix]) => prefix);
    if (!prefixes.length) return baseline;

    const entries = cleaned.map((url) => {
      for (let i = 0; i < prefixes.length; i += 1) {
        const p = prefixes[i];
        if (url.startsWith(p)) return [i, url.slice(p.length)];
      }
      return url;
    });
    const packed = JSON.stringify({ v: 2, p: prefixes, e: entries });
    return packed.length < baseline.length ? packed : baseline;
  }

  function readPreflightNeverCheckList(callback) {
    chrome.storage.sync.get({ [GEM_PREFLIGHT_URL_NEVER_CHECK_KEY]: "" }, (res) => {
      const list = parsePreflightNeverCheckStoredValue(res[GEM_PREFLIGHT_URL_NEVER_CHECK_KEY]);
      callback(list.sort((a, b) => String(a).localeCompare(String(b))));
    });
  }

  function writePreflightNeverCheckList(urls, callback) {
    const serialized = serializePreflightNeverCheckStoredValue(urls);
    chrome.storage.sync.set({ [GEM_PREFLIGHT_URL_NEVER_CHECK_KEY]: serialized }, () => {
      if (typeof callback === "function") callback();
    });
  }

  function normalizePreflightIconPipToggles(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      textAlerts: src.textAlerts !== false,
      missingAlt: src.missingAlt !== false,
      linkTitles: src.linkTitles !== false,
      linkLint: src.linkLint !== false,
      imageWeight: src.imageWeight !== false
    };
  }

  function loadPreflightIconPipTogglesIntoUI(toggles) {
    const normalized = normalizePreflightIconPipToggles(toggles);
    const pairs = [
      ["opt-preflight-pip-text-alerts", "textAlerts"],
      ["opt-preflight-pip-missing-alt", "missingAlt"],
      ["opt-preflight-pip-link-titles", "linkTitles"],
      ["opt-preflight-pip-link-lint", "linkLint"],
      ["opt-preflight-pip-image-weight", "imageWeight"]
    ];
    pairs.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.checked = normalized[key];
    });
  }

  function readPreflightIconPipTogglesFromUI() {
    return normalizePreflightIconPipToggles({
      textAlerts: document.getElementById("opt-preflight-pip-text-alerts")?.checked,
      missingAlt: document.getElementById("opt-preflight-pip-missing-alt")?.checked,
      linkTitles: document.getElementById("opt-preflight-pip-link-titles")?.checked,
      linkLint: document.getElementById("opt-preflight-pip-link-lint")?.checked,
      imageWeight: document.getElementById("opt-preflight-pip-image-weight")?.checked
    });
  }

  function updatePreflightNeverCheckSummary(urls) {
    const summary = document.getElementById("gem-preflight-never-check-summary");
    if (!summary) return;
    const count = Array.isArray(urls) ? urls.length : 0;
    summary.textContent = count === 0 ? "No URLs are currently skipped." : `${count} URL${count === 1 ? "" : "s"} currently skipped.`;
  }

  function showPreflightNeverCheckModal(urls) {
    const list = Array.isArray(urls) ? urls.slice() : [];
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 10001;
      display: flex; align-items: center; justify-content: center;
    `;
    const escapedRows = list.map((url) => {
      const safe = String(url || "");
      return `<div class="gem-setting gem-setting-blocked-url">
        <button type="button" data-action="gem-preflight-never-check-remove" data-url="${safe.replace(/"/g, "&quot;")}" style="border:none; order: 2; background:transparent; color:#dc2626; cursor:pointer; font-weight:700;" aria-label="Remove URL from never-check list">✕</button>
        <div class="sub-label" style="margin:0; word-break:break-all; flex:1;">${safe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      </div>`;
    }).join("");
    modal.innerHTML = `
      <div style="background: var(--token-box-default-background, #ffffff); border-radius: 12px; padding: 20px; max-width: 820px; width: 92%; max-height: 80vh; display: flex; flex-direction: column;">
        <h3 style="margin:0 0 8px 0;">Preflight URL Never-Check List</h3>
        <p class="sub-label" style="margin:0 0 10px 0;">URLs listed here are skipped by Preflight formatting and live checks.</p>
        <div id="gem-preflight-never-check-modal-list" class="gem-scrollable" style="padding:0 8px 0 0; overflow:auto; max-height:90vh;">
          ${escapedRows || '<div class="sub-label">No URLs are currently skipped.</div>'}
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
          <button id="gem-preflight-never-check-clear-all-btn" type="button" class="e-btn">Clear all</button>
          <button id="gem-preflight-never-check-close-btn" type="button" class="e-btn e-btn-primary">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); };
    modal.querySelector("#gem-preflight-never-check-close-btn")?.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
      const removeBtn = e.target && e.target.closest ? e.target.closest('[data-action="gem-preflight-never-check-remove"]') : null;
      if (removeBtn) {
        const url = removeBtn.getAttribute("data-url") || "";
        const next = list.filter((u) => String(u) !== String(url));
        writePreflightNeverCheckList(next, () => {
          close();
          loadPreflightNeverCheckList();
          showPreflightNeverCheckModal(next);
        });
      }
    });
    modal.querySelector("#gem-preflight-never-check-clear-all-btn")?.addEventListener("click", () => {
      if (!list.length) return;
      writePreflightNeverCheckList([], () => {
        close();
        loadPreflightNeverCheckList();
      });
    });
  }

  function loadPreflightNeverCheckList() {
    readPreflightNeverCheckList((list) => updatePreflightNeverCheckSummary(list));
  }

  function loadSettings() {
    // First check if highlightTerms exists to determine if user has customized
    chrome.storage.sync.get(['highlightTerms'], (result) => {
      let highlightTerms;

      if (result.highlightTerms === undefined) {
        // First-time user: use defaults from text-highlighting.js
        console.log("[gem] Settings panel: First-time user, using default highlight terms");
        highlightTerms = window.DEFAULT_HIGHLIGHT_TERMS || {};
      } else {
        // Existing user: use their stored terms
        console.log("[gem] Settings panel: Using existing user highlight terms");
        highlightTerms = result.highlightTerms;
      }

      // Now get the other settings
      chrome.storage.sync.get({
        [GEM_THEME_MODE_STORAGE_KEY]: "gemma",
        enableHighlighting: true,
        enableMobilePreview: true,
        showFinishEditingBtn: true,
        colorSwatches: window.DEFAULT_COLOR_SWATCHES,
        blocksPanelLayout: "2",
        manageOptionalContent: "hide-if-disabled",
        predictRecommendationSettings: "hide-if-disabled",
        productFinder: "always-show",
        productSource: "hide-if-disabled",
        saveToReuse: "always-show",
        resetBlock: "always-show",
        convertEslToTokens: "always-show",
        swapKeywords: "always-show",
        mobilePreviewWidth: 414,
        mobilePreviewScale: 0.5,
        mobileViewVisible: true,
        showCreatedColumn: true,
        showSizeColumn: true,
        showUserColumn: true,
        [GEM_CUSTOM_PASTE_ENABLED_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_SUP_KEY]: true,
        [GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY]: true,
        [GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]: 300,
        [GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY]: false,
        [GEM_EXPANDED_MODE_STORAGE_KEY]: false,
        gemAltTextPreviewEnabled: true,
        gemAltTextVisibility: "always-show",
        gemBlockTargetingPreviewEnabled: true,
        gemBlockTargetingVisibility: "always-show",
        [GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY]: GEM_PREFLIGHT_DEFAULT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE,
        [GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY]: GEM_PREFLIGHT_DEFAULT_IMAGE_WEIGHT_THRESHOLD_UNIT,
        [GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY]: GEM_PREFLIGHT_DEFAULT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE,
        [GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY]: GEM_PREFLIGHT_DEFAULT_IMAGE_WEIGHT_THRESHOLD_UNIT,
        [GEM_PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY]: false,
        [GEM_SHARED_LINK_AUTO_SELECT_KEY]: true,
        [GEM_PREFLIGHT_ICON_PIP_TOGGLES_KEY]: GEM_PREFLIGHT_ICON_PIP_TOGGLES_DEFAULT
      }, (settings) => {
        syncThemeSwatchUI(settings[GEM_THEME_MODE_STORAGE_KEY]);

        document.getElementById("opt-blocks-panel-layout").value =
          settings.blocksPanelLayout;

        // Content Block Toolbar settings
        document.getElementById("opt-manage-optional-content").value =
          settings.manageOptionalContent;
        document.getElementById("opt-predict-recommendation").value =
          settings.predictRecommendationSettings;
        document.getElementById("opt-product-finder").value =
          settings.productFinder;
        document.getElementById("opt-product-source").value =
          settings.productSource;
        document.getElementById("opt-save-to-reuse").value =
          settings.saveToReuse;
        document.getElementById("opt-reset-block").value =
          settings.resetBlock;
        document.getElementById("opt-convert-esl-to-tokens").value =
          settings.convertEslToTokens;
        const swapKeywordsSelect = document.getElementById("opt-swap-keywords");
        if (swapKeywordsSelect) swapKeywordsSelect.value = settings.swapKeywords || "always-show";

        document.getElementById("opt-custom-paste-enabled").checked =
          settings[GEM_CUSTOM_PASTE_ENABLED_KEY] !== false;
        document.getElementById("opt-custom-paste-bold").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY] !== false;
        document.getElementById("opt-custom-paste-italic").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY] !== false;
        document.getElementById("opt-custom-paste-strike").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY] !== false;
        document.getElementById("opt-custom-paste-underline").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY] !== false;
        document.getElementById("opt-custom-paste-sup").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_SUP_KEY] !== false;
        document.getElementById("opt-custom-paste-anchor").checked =
          settings[GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY] !== false;

        // Apply enable/disable state for Paste Behavior controls after values are loaded
        syncPasteBehaviorUI({ fromLoad: true });

        document.getElementById("opt-enable-highlighting").checked =
          settings.enableHighlighting;

        document.getElementById("opt-enable-mobile-preview").checked =
          settings.mobileViewVisible !== undefined
            ? settings.mobileViewVisible
            : settings.enableMobilePreview;

        const expandedModeToggle = document.getElementById("opt-enable-expanded-mode");
        if (expandedModeToggle) {
          expandedModeToggle.checked = settings[GEM_EXPANDED_MODE_STORAGE_KEY] === true;
        }

        applyExpandedMode(settings[GEM_EXPANDED_MODE_STORAGE_KEY] === true);

        const altTextEnabledEl = document.getElementById("opt-alt-text-preview-enabled");
        if (altTextEnabledEl) altTextEnabledEl.checked = settings.gemAltTextPreviewEnabled !== false;

        const altTextVisibilityEl = document.getElementById("opt-alt-text-visibility");
        if (altTextVisibilityEl) altTextVisibilityEl.value = settings.gemAltTextVisibility || "always-show";

        const blockTargetingEnabledEl = document.getElementById("opt-block-targeting-preview-enabled");
        if (blockTargetingEnabledEl) blockTargetingEnabledEl.checked = settings.gemBlockTargetingPreviewEnabled !== false;

        const blockTargetingVisibilityEl = document.getElementById("opt-block-targeting-visibility");
        if (blockTargetingVisibilityEl) blockTargetingVisibilityEl.value = settings.gemBlockTargetingVisibility || "always-show";

        const preflightTotalValueEl = document.getElementById("opt-preflight-total-image-weight-threshold-value");
        if (preflightTotalValueEl) preflightTotalValueEl.value = String(settings[GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY] ?? GEM_PREFLIGHT_DEFAULT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE);
        const preflightTotalUnitEl = document.getElementById("opt-preflight-total-image-weight-threshold-unit");
        if (preflightTotalUnitEl) preflightTotalUnitEl.value = (settings[GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY] || GEM_PREFLIGHT_DEFAULT_IMAGE_WEIGHT_THRESHOLD_UNIT) === 'KB' ? 'KB' : 'MB';
        const preflightSingularValueEl = document.getElementById("opt-preflight-singular-image-weight-threshold-value");
        if (preflightSingularValueEl) preflightSingularValueEl.value = String(settings[GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY] ?? GEM_PREFLIGHT_DEFAULT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE);
        const preflightSingularUnitEl = document.getElementById("opt-preflight-singular-image-weight-threshold-unit");
        if (preflightSingularUnitEl) preflightSingularUnitEl.value = (settings[GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY] || GEM_PREFLIGHT_DEFAULT_IMAGE_WEIGHT_THRESHOLD_UNIT) === 'KB' ? 'KB' : 'MB';
        const preflightLiveVerifyEnabledEl = document.getElementById("opt-preflight-enable-live-link-verify");
        if (preflightLiveVerifyEnabledEl) preflightLiveVerifyEnabledEl.checked = settings[GEM_PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY] === true;
        loadPreflightIconPipTogglesIntoUI(settings[GEM_PREFLIGHT_ICON_PIP_TOGGLES_KEY]);

        const sharedLinkAutoSelectEl = document.getElementById("opt-shared-link-auto-select");
        if (sharedLinkAutoSelectEl) sharedLinkAutoSelectEl.checked = settings[GEM_SHARED_LINK_AUTO_SELECT_KEY] !== false;

        const widthInput = document.getElementById("opt-mobile-preview-width");
        if (widthInput) widthInput.value = settings.mobilePreviewWidth || 414;

        const scaleSelect = document.getElementById("opt-mobile-preview-scale");
        if (scaleSelect) scaleSelect.value = String(settings.mobilePreviewScale || 0.5);

        document.getElementById("opt-show-finish-editing-btn").checked =
          settings.showFinishEditingBtn;

        const emailCampaignListLoadAll = document.getElementById("opt-email-campaign-list-load-all");
        if (emailCampaignListLoadAll) {
          emailCampaignListLoadAll.checked = settings[GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY] === true;
        }

        const recentlySeenMaxInput = document.getElementById("opt-recently-seen-max");
        if (recentlySeenMaxInput) {
          recentlySeenMaxInput.value = String(normalizeRecentlySeenMax(settings[GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]));
        }

        // Load MediaDB settings
        chrome.storage.sync.get({
          gemMediaDBColumnVisibility: {
            showFileIcon: true,
            showCreated: true,
            showSize: true,
            showUser: true
          }
        }, (mediaDBResult) => {
          const mediaDBSettings = mediaDBResult.gemMediaDBColumnVisibility;
          document.getElementById("opt-show-created-column").checked = mediaDBSettings.showCreated;
          document.getElementById("opt-show-size-column").checked = mediaDBSettings.showSize;
          document.getElementById("opt-show-user-column").checked = mediaDBSettings.showUser;
        });

        // Load color swatches
        loadColorSwatches(settings.colorSwatches);

        // Load highlight terms (using the resolved highlightTerms)
        window.GemHighlightTerms.load(highlightTerms);

        // Load saved searches
        loadSavedSearches();
        loadPreflightNeverCheckList();
      });
    });
  }

  // ------------------------------------------------------------
  // Save settings when toggled
  // ------------------------------------------------------------
  function attachListeners() {
    if (_gemSettingsListenersAttached) return;

    if (!_gemSettingsBoundHandlers) {
      _gemSettingsBoundHandlers = {
        saveSettingsHandler() {
          // Keep Paste Behavior UI consistent before saving (and avoid invalid state)
          syncPasteBehaviorUI();
          const widthVal = parseInt(document.getElementById("opt-mobile-preview-width")?.value, 10);
          const safeWidth = Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 414;

          const scaleVal = parseFloat(document.getElementById("opt-mobile-preview-scale")?.value);
          const safeScale = scaleVal === 1 ? 1 : 0.5;

          const mobileVisible =
            document.getElementById("opt-enable-mobile-preview")?.checked ?? true;
          const expandedModeEnabled =
            document.getElementById("opt-enable-expanded-mode")?.checked ?? false;

          const settingsToSave = {
            [GEM_THEME_MODE_STORAGE_KEY]:
              normalizeGemThemeMode(document.getElementById("opt-theme-mode")?.value),
            blocksPanelLayout:
              document.getElementById("opt-blocks-panel-layout")?.value ?? "2",
            manageOptionalContent:
              document.getElementById("opt-manage-optional-content")?.value ?? "hide-if-disabled",
            predictRecommendationSettings:
              document.getElementById("opt-predict-recommendation")?.value ?? "hide-if-disabled",
            productFinder:
              document.getElementById("opt-product-finder")?.value ?? "always-show",
            productSource:
              document.getElementById("opt-product-source")?.value ?? "hide-if-disabled",
            saveToReuse:
              document.getElementById("opt-save-to-reuse")?.value ?? "always-show",
            resetBlock:
              document.getElementById("opt-reset-block")?.value ?? "always-show",
            convertEslToTokens:
              document.getElementById("opt-convert-esl-to-tokens")?.value ?? "always-show",
            swapKeywords:
              document.getElementById("opt-swap-keywords")?.value ?? "always-show",
            [GEM_CUSTOM_PASTE_ENABLED_KEY]:
              document.getElementById("opt-custom-paste-enabled")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY]:
              document.getElementById("opt-custom-paste-bold")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY]:
              document.getElementById("opt-custom-paste-italic")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY]:
              document.getElementById("opt-custom-paste-strike")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY]:
              document.getElementById("opt-custom-paste-underline")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_SUP_KEY]:
              document.getElementById("opt-custom-paste-sup")?.checked ?? true,
            [GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY]:
              document.getElementById("opt-custom-paste-anchor")?.checked ?? true,
            [GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]:
              normalizeRecentlySeenMax(document.getElementById("opt-recently-seen-max")?.value),
            enableHighlighting:
              document.getElementById("opt-enable-highlighting")?.checked ?? true,
            enableMobilePreview: mobileVisible,
            mobileViewVisible: mobileVisible,
            showFinishEditingBtn:
              document.getElementById("opt-show-finish-editing-btn")?.checked ?? true,
            [GEM_EMAIL_CAMPAIGN_LIST_LOAD_ALL_KEY]:
              document.getElementById("opt-email-campaign-list-load-all")?.checked ?? false,
            [GEM_EXPANDED_MODE_STORAGE_KEY]: expandedModeEnabled,
            mobilePreviewWidth: safeWidth,
            mobilePreviewScale: safeScale,
            gemAltTextPreviewEnabled:
              document.getElementById("opt-alt-text-preview-enabled")?.checked ?? true,
            gemAltTextVisibility:
              document.getElementById("opt-alt-text-visibility")?.value ?? "always-show",
            gemBlockTargetingPreviewEnabled:
              document.getElementById("opt-block-targeting-preview-enabled")?.checked ?? true,
            gemBlockTargetingVisibility:
              document.getElementById("opt-block-targeting-visibility")?.value ?? "always-show",
            [GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY]:
              Math.max(0.1, parseFloat(document.getElementById("opt-preflight-total-image-weight-threshold-value")?.value || String(GEM_PREFLIGHT_DEFAULT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE)) || GEM_PREFLIGHT_DEFAULT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE),
            [GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY]:
              (document.getElementById("opt-preflight-total-image-weight-threshold-unit")?.value === 'KB') ? 'KB' : 'MB',
            [GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY]:
              Math.max(0.1, parseFloat(document.getElementById("opt-preflight-singular-image-weight-threshold-value")?.value || String(GEM_PREFLIGHT_DEFAULT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE)) || GEM_PREFLIGHT_DEFAULT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE),
            [GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY]:
              (document.getElementById("opt-preflight-singular-image-weight-threshold-unit")?.value === 'KB') ? 'KB' : 'MB',
            [GEM_PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY]:
              document.getElementById("opt-preflight-enable-live-link-verify")?.checked ?? false,
            [GEM_PREFLIGHT_ICON_PIP_TOGGLES_KEY]: readPreflightIconPipTogglesFromUI(),
            [GEM_SHARED_LINK_AUTO_SELECT_KEY]:
              document.getElementById("opt-shared-link-auto-select")?.checked ?? true
          };

          // Apply immediately + cache synchronously for next page load
          applyGemThemeMode(settingsToSave[GEM_THEME_MODE_STORAGE_KEY], { persistLocal: true });
          applyExpandedMode(settingsToSave[GEM_EXPANDED_MODE_STORAGE_KEY]);

          chrome.storage.sync.set(settingsToSave);

          // If the limit was reduced, prune local recently seen immediately
          try { pruneRecentlySeenToMax(settingsToSave[GEM_RECENTLY_SEEN_IMAGES_MAX_KEY]); } catch (_) { }

          // Save MediaDB settings separately
          const mediaDBSettings = {
            showFileIcon: true,
            showCreated: document.getElementById("opt-show-created-column")?.checked ?? true,
            showSize: document.getElementById("opt-show-size-column")?.checked ?? true,
            showUser: document.getElementById("opt-show-user-column")?.checked ?? true
          };
          chrome.storage.sync.set({ gemMediaDBColumnVisibility: mediaDBSettings });
        },
        syncPasteBehaviorHandler() {
          syncPasteBehaviorUI();
        },
        exportFullBackupHandler() {
          showFullBackupExportModal();
        },
        importFullBackupHandler() {
          showFullBackupImportModal();
        },
        unhideAllBlocksHandler() {
          if (!confirm("Are you sure you want to unhide all blocks? This will permanently show all blocks that were previously hidden.")) return;
          const BLOCKS_META_KEY = "bm";
          const BLOCKS_CHUNK_PREFIX = "b";
          const BLOCKS_CHUNK_SIZE = 8180;
          const BLOCKS_MAX_CHUNKS = 16;
          const chunkBlockData = (text) => {
            const out = [];
            for (let i = 0; i < text.length; i += BLOCKS_CHUNK_SIZE) out.push(text.slice(i, i + BLOCKS_CHUNK_SIZE));
            return out.length ? out : [""];
          };
          const persistUnhiddenBlocks = (done) => {
            chrome.storage.sync.get(["bm", "b_meta", ...Array.from({ length: BLOCKS_MAX_CHUNKS }, (_, i) => `b${i}`)], (stored) => {
              let pinnedBlocks = [];
              try {
                const meta = stored.bm || stored.b_meta;
                if (meta && typeof meta.c === "number" && meta.c > 0) {
                  let payload = "";
                  for (let i = 0; i < Math.min(meta.c, BLOCKS_MAX_CHUNKS); i += 1) {
                    if (typeof stored[`b${i}`] !== "string") {
                      payload = "";
                      break;
                    }
                    payload += stored[`b${i}`];
                  }
                  if (payload) {
                    const decompressed = typeof LZString !== "undefined"
                      ? LZString.decompressFromBase64(payload)
                      : payload;
                    const parsed = decompressed ? JSON.parse(decompressed) : {};
                    pinnedBlocks = Array.isArray(parsed?.pinnedBlocks) ? parsed.pinnedBlocks.filter(Boolean) : [];
                  }
                }
              } catch (_) {
                pinnedBlocks = [];
              }
              const nextState = { pinnedBlocks, hiddenBlocks: [] };
              const json = JSON.stringify(nextState);
              const compressed = typeof LZString !== "undefined" ? LZString.compressToBase64(json) : json;
              const chunks = chunkBlockData(compressed || json);
              const toSet = { [BLOCKS_META_KEY]: { v: 1, c: chunks.length, enc: "b64" } };
              chunks.forEach((chunk, i) => {
                toSet[`${BLOCKS_CHUNK_PREFIX}${i}`] = chunk;
              });
              const stale = ["b_meta"];
              for (let i = chunks.length; i < BLOCKS_MAX_CHUNKS; i += 1) stale.push(`b${i}`);
              chrome.storage.sync.remove(stale, () => {
                chrome.storage.sync.set(toSet, done);
              });
            });
          };
          chrome.storage.local.set({ showHiddenBlocks: false });
          persistUnhiddenBlocks(() => {
            if (chrome.runtime.lastError) {
              console.error("[Gem] Error clearing hidden blocks:", chrome.runtime.lastError);
              alert("Failed to unhide blocks. Please try again.");
            } else {
              console.log("[Gem] All blocks have been unhidden");
              alert("All blocks have been unhidden successfully!");
            }
          });
        }
      };
    }

    const handlers = _gemSettingsBoundHandlers;
    const syncGrantLinkAccessButtonVisibility = () => {
      const btn = document.getElementById("gem-preflight-grant-link-access-btn");
      if (!btn) return;
      const wrap = btn.closest(".gem-setting");
      chrome.runtime.sendMessage({ action: 'preflightCheckLinkHostAccess' }, (res) => {
        const granted = !!(res && res.ok && res.granted);
        if (wrap) wrap.style.display = granted ? "none" : "";
        else btn.style.display = granted ? "none" : "";
      });
    };
    const grantLinkAccessBtn = document.getElementById("gem-preflight-grant-link-access-btn");
    if (grantLinkAccessBtn && grantLinkAccessBtn.dataset.gemBound !== "true") {
      grantLinkAccessBtn.dataset.gemBound = "true";
      grantLinkAccessBtn.addEventListener("click", () => {
        grantLinkAccessBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'preflightEnsureLinkHostAccess' }, (res) => {
          grantLinkAccessBtn.disabled = false;
          const granted = !!(res && res.ok && res.granted);
          if (granted) {
            chrome.storage.sync.set({ [GEM_PREFLIGHT_HIDE_LINKS_SECTION_KEY]: false });
            syncGrantLinkAccessButtonVisibility();
          }
        });
      });
    }
    syncGrantLinkAccessButtonVisibility();
    const manageNeverCheckBtn = document.getElementById("gem-manage-preflight-never-check-btn");
    if (manageNeverCheckBtn && manageNeverCheckBtn.dataset.gemBound !== "true") {
      manageNeverCheckBtn.dataset.gemBound = "true";
      manageNeverCheckBtn.addEventListener("click", () => {
        readPreflightNeverCheckList((list) => showPreflightNeverCheckModal(list));
      });
    }

    // Settings elements that trigger save
    const settingsIds = [
      "opt-theme-mode",
      "opt-blocks-panel-layout",
      "opt-manage-optional-content",
      "opt-predict-recommendation",
      "opt-product-finder",
      "opt-product-source",
      "opt-save-to-reuse",
      "opt-reset-block",
      "opt-convert-esl-to-tokens",
      "opt-swap-keywords",
      "opt-enable-highlighting",
      "opt-enable-expanded-mode",
      "opt-enable-mobile-preview",
      "opt-show-finish-editing-btn",
      "opt-email-campaign-list-load-all",
      "opt-mobile-preview-width",
      "opt-mobile-preview-scale",
      "opt-show-created-column",
      "opt-show-size-column",
      "opt-show-user-column",
      "opt-recently-seen-max",
      "opt-custom-paste-enabled",
      "opt-custom-paste-bold",
      "opt-custom-paste-italic",
      "opt-custom-paste-strike",
      "opt-custom-paste-underline",
      "opt-custom-paste-sup",
      "opt-custom-paste-anchor",
      "opt-alt-text-preview-enabled",
      "opt-alt-text-visibility",
      "opt-block-targeting-preview-enabled",
      "opt-block-targeting-visibility",
      "opt-preflight-total-image-weight-threshold-value",
      "opt-preflight-total-image-weight-threshold-unit",
      "opt-preflight-singular-image-weight-threshold-value",
      "opt-preflight-singular-image-weight-threshold-unit",
      "opt-preflight-enable-live-link-verify",
      "opt-preflight-pip-text-alerts",
      "opt-preflight-pip-missing-alt",
      "opt-preflight-pip-link-titles",
      "opt-preflight-pip-link-lint",
      "opt-preflight-pip-image-weight",
      "opt-shared-link-auto-select"
    ];

    settingsIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", handlers.saveSettingsHandler);
    });

    const themeSwatches = document.getElementById("gem-theme-swatches");
    if (themeSwatches) {
      themeSwatches.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest && e.target.closest(".gem-theme-swatch");
        if (!btn || !themeSwatches.contains(btn)) return;
        const mode = btn.getAttribute("data-theme-mode");
        if (!mode) return;
        syncThemeSwatchUI(mode);
        const hidden = document.getElementById("opt-theme-mode");
        if (hidden) hidden.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    // Paste Behavior UI rules (enable/disable + auto-toggle)
    const pasteIds = [
      "opt-custom-paste-enabled",
      "opt-custom-paste-bold",
      "opt-custom-paste-italic",
      "opt-custom-paste-strike",
      "opt-custom-paste-underline",
      "opt-custom-paste-sup",
      "opt-custom-paste-anchor"
    ];
    pasteIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", handlers.syncPasteBehaviorHandler);
    });

    const addBtn = document.getElementById("add-term-btn");
    if (addBtn) {
      addBtn.addEventListener("click", window.GemHighlightTerms.addNew);
    }

    const exportFullBackupBtn = document.getElementById("gem-export-full-backup-btn");
    if (exportFullBackupBtn) {
      exportFullBackupBtn.addEventListener("click", handlers.exportFullBackupHandler);
    }

    const importFullBackupBtn = document.getElementById("gem-import-full-backup-btn");
    if (importFullBackupBtn) {
      importFullBackupBtn.addEventListener("click", handlers.importFullBackupHandler);
    }

    const unhideBtn = document.getElementById("unhide-all-blocks-btn");
    if (unhideBtn) {
      unhideBtn.addEventListener("click", handlers.unhideAllBlocksHandler);
    }

    _gemSettingsListenersAttached = true;
  }

  function syncPasteBehaviorUI({ fromLoad = false } = {}) {
    if (_gemPasteUiSyncing) return;
    _gemPasteUiSyncing = true;
    try {
      const enabledEl = document.getElementById('opt-custom-paste-enabled');
      const allowEls = [
        document.getElementById('opt-custom-paste-bold'),
        document.getElementById('opt-custom-paste-italic'),
        document.getElementById('opt-custom-paste-strike'),
        document.getElementById('opt-custom-paste-underline'),
        document.getElementById('opt-custom-paste-sup'),
        document.getElementById('opt-custom-paste-anchor')
      ].filter(Boolean);

      if (!enabledEl || allowEls.length === 0) return;

      const prevEnabled = enabledEl.dataset.gemPrevEnabled === 'true';
      const isEnabled = !!enabledEl.checked;
      const allowGroup = allowEls[0] && allowEls[0].closest ? allowEls[0].closest('.gem-setting-group') : null;

      // If enabling, re-enable allow options first and ensure at least one is checked.
      if (isEnabled && !prevEnabled) {
        allowEls.forEach((el) => { el.disabled = false; });
        if (allowGroup) delete allowGroup.dataset.gemPasteAllowDisabled;

        const anyNow = allowEls.some((el) => !!el.checked);
        if (!anyNow) {
          if (_gemPasteLastAllowState && _gemPasteLastAllowState.length === allowEls.length) {
            allowEls.forEach((el, idx) => { el.checked = !!_gemPasteLastAllowState[idx]; });
          } else {
            // Default: enable all allow options
            allowEls.forEach((el) => { el.checked = true; });
          }
        }
        _gemPasteLastAllowState = null;
      }

      const anyAllowChecked = allowEls.some((el) => !!el.checked);

      // Rule 1: If user unchecks all "Allow…" options while enabled, disable custom paste as well.
      // (But do NOT prevent enabling; enabling restores defaults above.)
      if (isEnabled && prevEnabled && !anyAllowChecked) {
        enabledEl.checked = false;
      }

      // Rule 2: If custom paste disabled, disable/gray out allow options.
      const isEnabledFinal = !!enabledEl.checked;

      if (!isEnabledFinal) {
        // Remember state so re-enabling can restore it
        if (!fromLoad && _gemPasteLastAllowState == null) {
          _gemPasteLastAllowState = allowEls.map((el) => !!el.checked);
        }
        allowEls.forEach((el) => {
          el.disabled = true;
        });
        if (allowGroup) allowGroup.dataset.gemPasteAllowDisabled = 'true';
      } else {
        allowEls.forEach((el) => {
          el.disabled = false;
        });
        if (allowGroup) delete allowGroup.dataset.gemPasteAllowDisabled;

        // If enabling while all allow options are unchecked, restore previous state or defaults.
        const anyNow = allowEls.some((el) => !!el.checked);
        if (!anyNow) {
          if (_gemPasteLastAllowState && _gemPasteLastAllowState.length === allowEls.length) {
            allowEls.forEach((el, idx) => { el.checked = !!_gemPasteLastAllowState[idx]; });
          } else {
            // Default: enable all allow options
            allowEls.forEach((el) => { el.checked = true; });
          }
        }
        _gemPasteLastAllowState = null;
      }

      enabledEl.dataset.gemPrevEnabled = (enabledEl.checked ? 'true' : 'false');
    } finally {
      _gemPasteUiSyncing = false;
    }
  }

  // ------------------------------------------------------------
  // Saved Searches management
  // ------------------------------------------------------------
  function saveSavedSearches() {
    const container = document.getElementById("gem-saved-searches-list");
    if (!container) return;
    const pills = [];
    const activeMap = {};
    container.querySelectorAll('.gem-saved-search-item').forEach((row) => {
      const term = (row.querySelector('.gem-saved-search-text')?.value || '').trim();
      if (!term) return;
      const isRegex = !!row.querySelector('.gem-settings-regex-toggle')?.classList.contains('gem-settings-regex-toggle--active');
      const label = (row.querySelector('.gem-saved-search-label-input')?.value || '').trim();
      const source = row.querySelector('.gem-saved-search-source')?.value || 'both';
      const ctx = source === 'favorites' ? 2 : source === 'seen' ? 1 : 3;
      const mp = { t: term, c: ctx };
      if (isRegex) mp.r = 1;
      if (label) mp.l = label;
      pills.push(mp);
      const active = source === 'favorites' ? row.dataset.activeFav !== '0'
        : source === 'seen' ? row.dataset.activeSeen !== '0'
        : (row.dataset.activeFav !== '0' && row.dataset.activeSeen !== '0');
      if (!active) activeMap[`${term}:${ctx}`] = 0;
    });
    chrome.storage.sync.set({ gemSearchPills: pills });
    chrome.storage.local.set({ gemSearchPillActive: activeMap });
  }

  function createSavedSearchRow(pill) {
    const item = document.createElement('div');
    item.className = 'gem-saved-search-item';

    const sourceVal = pill.source || 'both';
    item.dataset.activeFav = pill.activeFav !== false ? '1' : '0';
    item.dataset.activeSeen = pill.activeSeen !== false ? '1' : '0';

    const labelVal = pill.label || '';

    item.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;gap:0;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="gem-settings-input-wrap">
            <input type="text" class="gem-saved-search-text" value="${pill.term.replace(/"/g, '&quot;')}" />
            <button type="button" class="gem-settings-regex-toggle ${pill.isRegex ? 'gem-settings-regex-toggle--active' : ''}" title="Use regular expression" aria-pressed="${pill.isRegex ? 'true' : 'false'}">.*</button>
          </div>
        <div class="gem-saved-search-label-row ${pill.isRegex ? 'gem-saved-search-label-row--visible' : ''}">
          <input type="text" class="gem-saved-search-label-input" placeholder="Custom pill label" value="${labelVal.replace(/"/g, '&quot;')}" />
        </div>
          <div class="gem-saved-search-controls">
            <select class="gem-saved-search-source">
              <option value="favorites" ${sourceVal === 'favorites' ? 'selected' : ''}>Favorite Images</option>
              <option value="seen" ${sourceVal === 'seen' ? 'selected' : ''}>Recent Images</option>
              <option value="both" ${sourceVal === 'both' ? 'selected' : ''}>Both</option>
            </select>
          </div>
          <button class="highlight-term-remove gem-saved-search-remove">×</button>
        </div>
      </div>
    `;

    const textInput = item.querySelector('.gem-saved-search-text');
    const regexBtn = item.querySelector('.gem-settings-regex-toggle');
    const labelRow = item.querySelector('.gem-saved-search-label-row');
    const labelInput = item.querySelector('.gem-saved-search-label-input');
    const sourceSelect = item.querySelector('.gem-saved-search-source');
    const removeBtn = item.querySelector('.gem-saved-search-remove');

    textInput.addEventListener('keyup', saveSavedSearches);
    labelInput.addEventListener('keyup', saveSavedSearches);
    regexBtn.addEventListener('click', () => {
      const nowActive = !regexBtn.classList.contains('gem-settings-regex-toggle--active');
      regexBtn.classList.toggle('gem-settings-regex-toggle--active', nowActive);
      regexBtn.setAttribute('aria-pressed', String(nowActive));
      labelRow.classList.toggle('gem-saved-search-label-row--visible', nowActive);
      if (!nowActive) labelInput.value = '';
      saveSavedSearches();
    });
    sourceSelect.addEventListener('change', saveSavedSearches);
    removeBtn.addEventListener('click', () => {
      item.remove();
      saveSavedSearches();
    });

    return item;
  }

  function loadSavedSearches() {
    const container = document.getElementById("gem-saved-searches-list");
    if (!container) return;

    chrome.storage.sync.get({ gemSearchPills: [] }, (syncResult) => {
      chrome.storage.local.get({ gemSearchPillActive: {} }, (localResult) => {
      const rawPills = Array.isArray(syncResult.gemSearchPills) ? syncResult.gemSearchPills : [];
      const activeMap = localResult.gemSearchPillActive || {};

      const merged = rawPills.map((mp) => {
        if (!mp || !mp.t) return null;
        const ctx = mp.c || 3;
        const compositeKey = `${mp.t}:${ctx}`;
        const isActive = !(compositeKey in activeMap) || !!activeMap[compositeKey];
        return {
          term: String(mp.t).trim(),
          isRegex: !!mp.r,
          label: mp.l ? String(mp.l).trim() : '',
          source: ctx === 2 ? 'favorites' : ctx === 1 ? 'seen' : 'both',
          activeFav: isActive,
          activeSeen: isActive
        };
      }).filter(Boolean);

      container.innerHTML = '';

      if (merged.length === 0) {
        container.innerHTML = '<div class="gem-saved-search-empty">No saved searches yet. Use the search inputs in Favorite Images or Recent Images to create pills.</div>';
        return;
      }

      merged.forEach((pill) => {
        container.appendChild(createSavedSearchRow(pill));
      });
      }); // local.get
    }); // sync.get
  }

  // Load highlight terms into the UI
  // Highlight terms management is now in highlight-terms-settings.js
  // (window.GemHighlightTerms.load / .addNew)

  // Load color swatches into the UI
  function loadColorSwatches(swatches) {
    const container = document.getElementById("color-swatches-list");
    if (!container) return;

    container.innerHTML = "";

    // Count how many colors are set (non-empty)
    const setColors = swatches.filter(color => color && color.trim() !== "");

    // Show all set colors
    swatches.forEach((color, index) => {
      if (color && color.trim() !== "") {
        const swatchItem = createColorSwatchItem(index + 1, color);
        container.appendChild(swatchItem);
      }
    });

    // Add one blank option if we haven't reached 8 total colors
    if (setColors.length < 8) {
      // Find the next available slot (first empty one)
      const nextIndex = swatches.findIndex(color => !color || color.trim() === "");
      const displayNumber = nextIndex >= 0 ? nextIndex + 1 : setColors.length + 1;
      const blankItem = createColorSwatchItem(displayNumber, "");
      container.appendChild(blankItem);
    }
  }

  // Create a color swatch item
  function createColorSwatchItem(number, color) {
    const item = document.createElement("div");
    item.className = "color-swatch-item";

    item.innerHTML = `
      <div class="color-swatch-number">Color ${number}:</div>
      <input type="text" class="color-swatch-input" value="${color}" placeholder="Enter hex color (e.g. #FF0000)" />
      <input type="color" data-color-swatch-color class="color-swatch-color" value="${color || '#ffffff'}" />
      <button class="color-swatch-clear">×</button>
    `;

    // Add event listeners
    const textInput = item.querySelector(".color-swatch-input");
    const colorInput = item.querySelector("[data-color-swatch-color]");
    const clearBtn = item.querySelector(".color-swatch-clear");

    const readColor = () => {
      let v = textInput.value.trim().toUpperCase();
      if (/^[0-9A-F]{6}$/.test(v)) v = `#${v}`;
      return v;
    };

    const syncColorPickerFromText = () => {
      const newColor = readColor();
      if (!newColor) {
        colorInput.value = "#ffffff";
        return;
      }
      // Only push valid hex values into the native color input.
      if (/^#([0-9A-F]{6})$/.test(newColor)) {
        colorInput.value = newColor;
      }
    };

    const commitSwatch = (delayMs = 250) => {
      const newColor = readColor();
      if (newColor && !/^#([0-9A-F]{6})$/.test(newColor)) return;
      syncColorPickerFromText();
      updateColorSwatch(number - 1, newColor, { delayMs, reload: true });
    };

    textInput.addEventListener("input", () => {
      syncColorPickerFromText();
      // Persist after typing pauses; avoids per-keystroke sync writes.
      commitSwatch(350);
    });
    textInput.addEventListener("change", () => commitSwatch(0));
    textInput.addEventListener("blur", () => commitSwatch(0));

    colorInput.addEventListener("input", () => {
      textInput.value = colorInput.value.toUpperCase();
    });
    colorInput.addEventListener("change", () => {
      textInput.value = colorInput.value.toUpperCase();
      commitSwatch(0);
    });

    clearBtn.addEventListener("click", () => {
      textInput.value = "";
      colorInput.value = "#ffffff";
      updateColorSwatch(number - 1, "", { delayMs: 0, reload: true });
    });

    return item;
  }

  function flushPendingColorSwatchUpdates() {
    const pendingEntries = Array.from(_gemColorSwatchPendingWrites.entries());
    _gemColorSwatchPendingWrites.clear();
    _gemColorSwatchFlushTimer = null;
    const shouldReload = _gemColorSwatchReloadAfterFlush;
    _gemColorSwatchReloadAfterFlush = false;
    if (pendingEntries.length === 0) return;

    chrome.storage.sync.get({ colorSwatches: window.DEFAULT_COLOR_SWATCHES }, (settings) => {
      const current = Array.isArray(settings.colorSwatches)
        ? [...settings.colorSwatches]
        : [...window.DEFAULT_COLOR_SWATCHES];

      pendingEntries.forEach(([index, color]) => {
        if (index < 0) return;
        if (index >= current.length) return;
        current[index] = color;
      });

      chrome.storage.sync.set({ colorSwatches: current }, () => {
        if (shouldReload) {
          loadColorSwatches(current);
        }
      });
    });
  }

  function queueColorSwatchUpdate(index, color, { delayMs = 250, reload = true } = {}) {
    _gemColorSwatchPendingWrites.set(index, color);
    if (reload) _gemColorSwatchReloadAfterFlush = true;
    if (_gemColorSwatchFlushTimer) {
      clearTimeout(_gemColorSwatchFlushTimer);
      _gemColorSwatchFlushTimer = null;
    }
    if (delayMs <= 0) {
      flushPendingColorSwatchUpdates();
      return;
    }
    _gemColorSwatchFlushTimer = setTimeout(flushPendingColorSwatchUpdates, delayMs);
  }

  // Update a color swatch
  function updateColorSwatch(index, color, options = {}) {
    const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 250;
    const reload = options.reload !== false;
    queueColorSwatchUpdate(index, color, { delayMs, reload });
  }

  // ------------------------------------------------------------
  // Panel open/close logic
  // ------------------------------------------------------------
  function openPanel() {
    console.log("[gem] openPanel called, isOpen was:", isOpen);
    createPanel();
    loadSettings();
    attachListeners();

    // Check if this is the first time settings panel is opened
    chrome.storage.sync.get(['settingsPanelOpened'], (result) => {
      const hasBeenOpened = result.settingsPanelOpened;

      if (!hasBeenOpened) {
        // First time opening - hide welcome link
        const welcomeLink = panelEl.querySelector(".gem-welcome-link");
        if (welcomeLink) {
          welcomeLink.style.display = "none";
        }

        // Mark as opened
        chrome.storage.sync.set({ settingsPanelOpened: true });
        console.log("[gem] First time opening settings panel - welcome link hidden");
      } else {
        // Subsequent opens - ensure welcome link is visible
        const welcomeLink = panelEl.querySelector(".gem-welcome-link");
        if (welcomeLink) {
          welcomeLink.style.display = "";
        }
        console.log("[gem] Settings panel opened before - welcome link visible");
      }
    });

    requestAnimationFrame(() => {
      panelEl.style.right = "0";
      isOpen = true;
      console.log("[gem] Panel opened, isOpen now:", isOpen);
    });
  }

  function closePanel() {
    console.log("[gem] closePanel called, isOpen was:", isOpen);
    if (!panelEl) return;
    panelEl.style.right = "-580px";
    isOpen = false;
    console.log("[gem] Panel closed, isOpen now:", isOpen);
  }

  // ------------------------------------------------------------
  // Expose function to open settings panel (for welcome modal)
  // ------------------------------------------------------------
  window.openGemmaSettings = function (scrollTo) {
    if (!isOpen) {
      openPanel();
    }
    if (scrollTo) {
      requestAnimationFrame(() => {
        const target = panelEl && panelEl.querySelector('#gem-settings-' + scrollTo);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  // ------------------------------------------------------------
  // Keyboard shortcut: ⌘+G / Ctrl+G opens the settings panel
  // ------------------------------------------------------------
  function setupOpenSettingsPanelShortcut() {
    function handleKeyDown(e) {
      // ⌘+G (macOS) / Ctrl+G (Win/Linux)
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if ((e.key || '').toLowerCase() !== 'g') return;

      // Don't trigger while typing
      const ae = e && e.target && e.target.ownerDocument
        ? e.target.ownerDocument.activeElement
        : document.activeElement;
      if (ae) {
        const tag = (ae.tagName || '').toLowerCase();
        const isTypingTarget =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select';
        if (isTypingTarget) return;
      }

      // Toggle the panel
      if (isOpen) {
        closePanel();
      } else {
        openPanel();
      }

      // Prevent browser default (and any editor bindings)
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation && e.stopImmediatePropagation();
      return false;
    }

    // Main document
    document.addEventListener('keydown', handleKeyDown, true);

    // Also attach into iframes so the shortcut works when focus is inside them
    function injectIntoIframe(iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) return;
        if (iframeDoc._gemSettingsShortcutHandler) return;
        iframeDoc.addEventListener('keydown', handleKeyDown, true);
        iframeDoc._gemSettingsShortcutHandler = true;
      } catch (_) {
        // Cross-origin iframe; ignore
      }
    }

    function bindSettingsShortcutIframeReload(iframe) {
      if (!iframe || iframe._gemSettingsShortcutIframeLoadBound) return;
      iframe._gemSettingsShortcutIframeLoadBound = true;
      iframe.addEventListener('load', () => {
        setTimeout(() => injectIntoIframe(iframe), 50);
      });
    }

    function waitForIframeReady(iframe) {
      try {
        bindSettingsShortcutIframeReload(iframe);
        // If we can access the iframe document at all, attach immediately.
        if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
          injectIntoIframe(iframe);
          return;
        }

        // Otherwise retry briefly in case load doesn't fire (SPA behaviors)
        {
          let attempts = 0;
          const tick = () => {
            attempts++;
            try {
              if (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)) {
                injectIntoIframe(iframe);
                return;
              }
            } catch (_) { }
            if (attempts < 40) setTimeout(tick, 100);
          };
          setTimeout(tick, 100);
        }
      } catch (_) { }
    }

    // Existing iframes
    document.querySelectorAll('iframe').forEach(waitForIframeReady);

    // New iframes
    const iframeObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === 'IFRAME') {
            waitForIframeReady(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('iframe').forEach(waitForIframeReady);
          }
        });
      });
    });
    // body may not exist at document_start; observe documentElement to be safe
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  setupOpenSettingsPanelShortcut();

  // ------------------------------------------------------------
  // Keep dark theme in sync with storage changes
  // ------------------------------------------------------------
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    if (changes[GEM_THEME_MODE_STORAGE_KEY]) {
      const newMode = normalizeGemThemeMode(changes[GEM_THEME_MODE_STORAGE_KEY].newValue);
      syncThemeSwatchUI(newMode);
      applyGemThemeMode(newMode, { persistLocal: true });
    }

    if (changes.blocksPanelLayout) {
      const layoutSelect = document.getElementById("opt-blocks-panel-layout");
      if (layoutSelect) {
        layoutSelect.value = changes.blocksPanelLayout.newValue;
      }
    }

    // Content Block Toolbar settings
    if (changes.manageOptionalContent) {
      const select = document.getElementById("opt-manage-optional-content");
      if (select) select.value = changes.manageOptionalContent.newValue;
    }
    if (changes.predictRecommendationSettings) {
      const select = document.getElementById("opt-predict-recommendation");
      if (select) select.value = changes.predictRecommendationSettings.newValue;
    }
    if (changes.productFinder) {
      const select = document.getElementById("opt-product-finder");
      if (select) select.value = changes.productFinder.newValue;
    }
    if (changes.productSource) {
      const select = document.getElementById("opt-product-source");
      if (select) select.value = changes.productSource.newValue;
    }
    if (changes.saveToReuse) {
      const select = document.getElementById("opt-save-to-reuse");
      if (select) select.value = changes.saveToReuse.newValue;
    }
    if (changes.resetBlock) {
      const select = document.getElementById("opt-reset-block");
      if (select) select.value = changes.resetBlock.newValue;
    }

    if (changes.convertEslToTokens) {
      const select = document.getElementById("opt-convert-esl-to-tokens");
      if (select) select.value = changes.convertEslToTokens.newValue;
    }
    if (changes.swapKeywords) {
      const select = document.getElementById("opt-swap-keywords");
      if (select) select.value = changes.swapKeywords.newValue;
    }

    // Paste behavior settings (just keep UI in sync; loader reacts via its own onChanged)
    if (changes[GEM_CUSTOM_PASTE_ENABLED_KEY]) {
      const el = document.getElementById("opt-custom-paste-enabled");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ENABLED_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY]) {
      const el = document.getElementById("opt-custom-paste-bold");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_BOLD_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY]) {
      const el = document.getElementById("opt-custom-paste-italic");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_ITALIC_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY]) {
      const el = document.getElementById("opt-custom-paste-strike");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_STRIKE_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY]) {
      const el = document.getElementById("opt-custom-paste-underline");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_UNDERLINE_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_SUP_KEY]) {
      const el = document.getElementById("opt-custom-paste-sup");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_SUP_KEY].newValue !== false;
    }
    if (changes[GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY]) {
      const el = document.getElementById("opt-custom-paste-anchor");
      if (el) el.checked = changes[GEM_CUSTOM_PASTE_ALLOW_ANCHOR_KEY].newValue !== false;
    }

    if (changes.mobilePreviewWidth) {
      const widthInput = document.getElementById("opt-mobile-preview-width");
      if (widthInput) {
        widthInput.value = changes.mobilePreviewWidth.newValue;
      }
    }

    if (changes.mobilePreviewScale) {
      const scaleSelect = document.getElementById("opt-mobile-preview-scale");
      if (scaleSelect) {
        scaleSelect.value = String(changes.mobilePreviewScale.newValue);
      }
    }

    if (changes.mobileViewVisible) {
      const mobileToggle = document.getElementById("opt-enable-mobile-preview");
      if (mobileToggle) {
        mobileToggle.checked = changes.mobileViewVisible.newValue;
      }
    }

    if (changes.gemBlockTargetingPreviewEnabled) {
      const el = document.getElementById("opt-block-targeting-preview-enabled");
      if (el) el.checked = changes.gemBlockTargetingPreviewEnabled.newValue !== false;
    }
    if (changes.gemBlockTargetingVisibility) {
      const el = document.getElementById("opt-block-targeting-visibility");
      if (el) el.value = changes.gemBlockTargetingVisibility.newValue || "always-show";
    }

    if (changes[GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY]) {
      const el = document.getElementById("opt-preflight-total-image-weight-threshold-value");
      if (el) el.value = String(changes[GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY].newValue ?? GEM_PREFLIGHT_DEFAULT_TOTAL_IMAGE_WEIGHT_THRESHOLD_VALUE);
    }
    if (changes[GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY]) {
      const el = document.getElementById("opt-preflight-total-image-weight-threshold-unit");
      if (el) el.value = (changes[GEM_PREFLIGHT_TOTAL_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY].newValue === 'KB') ? 'KB' : 'MB';
    }
    if (changes[GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY]) {
      const el = document.getElementById("opt-preflight-singular-image-weight-threshold-value");
      if (el) el.value = String(changes[GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE_KEY].newValue ?? GEM_PREFLIGHT_DEFAULT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_VALUE);
    }
    if (changes[GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY]) {
      const el = document.getElementById("opt-preflight-singular-image-weight-threshold-unit");
      if (el) el.value = (changes[GEM_PREFLIGHT_SINGULAR_IMAGE_WEIGHT_THRESHOLD_UNIT_KEY].newValue === 'KB') ? 'KB' : 'MB';
    }
    if (changes[GEM_PREFLIGHT_URL_NEVER_CHECK_KEY]) {
      loadPreflightNeverCheckList();
    }
    if (changes[GEM_PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY]) {
      const el = document.getElementById("opt-preflight-enable-live-link-verify");
      if (el) el.checked = changes[GEM_PREFLIGHT_ENABLE_LIVE_LINK_VERIFY_KEY].newValue === true;
    }
    if (changes[GEM_PREFLIGHT_ICON_PIP_TOGGLES_KEY]) {
      loadPreflightIconPipTogglesIntoUI(changes[GEM_PREFLIGHT_ICON_PIP_TOGGLES_KEY].newValue);
    }
  });

  // ------------------------------------------------------------
  // Listen for messages from background script or gear icon
  // ------------------------------------------------------------
  console.log("[gem] settings-panel.js: setting up message listener");
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[gem] settings-panel.js: RECEIVED MESSAGE:", msg, "from:", sender);
    console.log("[gem] Current isOpen state:", isOpen);

    if (msg.action === "openSettings") {
      // Toggle the panel: close if open, open if closed (from gear icon)
      console.log("[gem] Processing openSettings toggle from gear icon");
      if (isOpen) {
        console.log("[gem] Panel is open, closing it");
        closePanel();
      } else {
        console.log("[gem] Panel is closed, opening it");
        openPanel();
      }
    } else if (msg.action === "toggleSettingsPanel") {
      // Toggle the panel: close if open, open if closed (from extension icon click)
      console.log("[gem] Processing toggleSettingsPanel from extension icon");
      if (isOpen) {
        console.log("[gem] Panel is open, closing it");
        closePanel();
      } else {
        console.log("[gem] Panel is closed, opening it");
        openPanel();
      }
      sendResponse({ success: true });
    }
  });

  // Keyboard shortcuts modal is now in keyboard-shortcuts-modal.js
  // (window.showGemKeyboardShortcutsModal)

})();
