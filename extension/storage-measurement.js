console.log("[Gem] storage-measurement.js loaded");

(function () {
  const SYNC_QUOTA_BYTES = 102400;
  /** Default chrome.storage.local quota per extension (bytes) unless `unlimitedStorage` is granted. */
  const LOCAL_QUOTA_BYTES = 5242880;
  /** Typical per-origin localStorage budget (browsers do not expose exact quota). */
  const PAGE_LOCAL_QUOTA_BYTES = 5242880;
  const GEM_THEME_MODE_LOCAL_KEY = "gemThemeMode";
  const PAGE_LOCAL_POLL_MS = 2000;
  const MOUNT_ID = "gem-storage-meter-mount";
  const COMBINED_SECTION_ID = "gem-storage-meters";
  const STYLE_ID = "gem-storage-meter-style";

  const CATEGORIES = [
    {
      name: "Snippets",
      color: "var(--token-amethyst-400)",
      match: (key) =>
        key === "sm" ||
        key === "s_meta" ||
        key === "gemSnippets" ||
        key === "gemPinnedPersTokens" ||
        key === "gemManualShortcutSlots" ||
        /^s\d+$/.test(key),
    },
    {
      name: "Saved Searches",
      color: "var(--token-sapphire-400)",
      match: (key) => key === "gemSearchPills",
    },
    {
      name: "Text Highlighting",
      color: "var(--token-carnelian-400)",
      match: (key) => key === "highlightTerms" || key === "enableHighlighting",
    },
    {
      name: "Blocks",
      color: "var(--token-turquoise-400)",
      match: (key) =>
        key === "bm" ||
        key === "b_meta" ||
        /^b\d+$/.test(key),
    },
    {
      name: "Gemma Notes",
      color: "var(--token-topaz-400)",
      match: (key) => key === "gemNotes",
    },
    {
      name: "Favorite Images",
      color: "var(--token-ruby-400)",
      match: (key) => key === "fm" || /^f\d+$/.test(key),
    },
    {
      name: "Preflight Settings",
      color: "#cbe753",
      match: (key) =>
        key === "gemPreflightTotalImageWeightThresholdValue" ||
        key === "gemPreflightTotalImageWeightThresholdUnit" ||
        key === "gemPreflightSingularImageWeightThresholdValue" ||
        key === "gemPreflightSingularImageWeightThresholdUnit" ||
        key === "urlPreflightNeverCheck",
    },
    {
      name: "Custom Shortcuts",
      color: "var(--token-amethyst-300)",
      match: (key) => key === "gemUserCreatedShortcuts",
    },
    {
      name: "Settings",
      color: "#6b7280",
      match: () => true,
    },
  ];

  const LOCAL_CATEGORIES = [
    {
      name: "Recent campaigns",
      color: "var(--token-amethyst-400)",
      match: (key) =>
        key === "gemRecentCampaigns" ||
        key === "gemRecentCampaignsUiState" ||
        key === "gemOtherRecentCampaigns",
    },
    {
      name: "Campaign drafts",
      color: "var(--token-sapphire-400)",
      match: (key) => /^gemDraft_/.test(key),
    },
    {
      name: "Recently seen & image picker",
      color: "var(--token-carnelian-400)",
      match: (key) =>
        key === "gemRecentlySeenImages" ||
        key === "gemSearchPillActive" ||
        key === "gemImageSearchText" ||
        key === "gemFavoriteImageCategoryCollapse" ||
        key === "gemRecentlySeenImageGroupCollapse" ||
        key === "gemImagePickerMediaDbTabIntroShown",
    },
    {
      name: "Favorite images (local)",
      color: "var(--token-ruby-400)",
      match: (key) => key === "gemFavoriteImagesConsolidated",
    },
    {
      name: "Snippets (UI state)",
      color: "var(--token-topaz-400)",
      match: (key) =>
        key === "gemSnippetCategoryCollapseState" ||
        key === "gemSnippetContextRecent" ||
        key === "gemPersTokenRecentCache",
    },
    {
      name: "Preflight",
      color: "#cbe753",
      match: (key) => key === "gemPreflightAlertCount" || key === "gemPreflightSectionCollapseStateV1",
    },
    {
      name: "Blocks",
      color: "var(--token-turquoise-400)",
      match: (key) => key === "showHiddenBlocks",
    },
    {
      name: "Color swatches",
      color: "#8b5cf6",
      match: (key) => key === "customColors",
    },
    {
      name: "Debug",
      color: "#94a3b8",
      match: (key) => key === "gemDebugLogging",
    },
    {
      name: "Other",
      color: "#6b7280",
      match: () => true,
    },
  ];

  const PAGE_LOCAL_CATEGORIES = [
    {
      name: "Gemma",
      color: "var(--token-amethyst-400)",
      match: (key) => /^gem/i.test(key) || key === GEM_THEME_MODE_LOCAL_KEY,
    },
    {
      name: "Inbox Preview",
      color: "var(--token-sapphire-400)",
      match: (key) => key.startsWith("inbox-preview::"),
    },
    {
      name: "Test Mail",
      color: "var(--token-turquoise-400)",
      match: (key) => key.startsWith("test-mail::"),
    },
    {
      name: "Other",
      color: "#6b7280",
      match: () => true,
    },
  ];

  function byteSize(key, value) {
    return new Blob([key]).size + new Blob([JSON.stringify(value)]).size;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(1) + " KB";
  }

  function categorize(data, defs) {
    const buckets = defs.map((c) => ({ ...c, bytes: 0 }));

    for (const [key, value] of Object.entries(data)) {
      const size = byteSize(key, value);
      for (const bucket of buckets) {
        if (bucket.match(key)) {
          bucket.bytes += size;
          break;
        }
      }
    }

    return buckets;
  }

  function pageLocalEntryByteSize(key, value) {
    return new Blob([key]).size + new Blob([String(value ?? "")]).size;
  }

  function readPageLocalStorageEntries() {
    const entries = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        entries[key] = localStorage.getItem(key);
      }
    } catch (err) {
      console.warn("[Gem] storage-measurement page localStorage read error:", err);
    }
    return entries;
  }

  function categorizePageLocalStorage(entries) {
    const buckets = PAGE_LOCAL_CATEGORIES.map((c) => ({ ...c, bytes: 0 }));

    for (const [key, value] of Object.entries(entries)) {
      const size = pageLocalEntryByteSize(key, value);
      for (const bucket of buckets) {
        if (bucket.match(key)) {
          bucket.bytes += size;
          break;
        }
      }
    }

    return buckets;
  }

  // ── Styles ──────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #gem-storage-meter-mount > h2 {
        margin-top: 30px;
        margin-bottom: 10px;
        border-top: 2px solid var(--token-box-default-background);
        padding-top: 24px;
      }

      #${COMBINED_SECTION_ID} h3.gem-storage-meter-subtitle {
        margin: 0 0 8px 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--token-text-default);
      }

      #${COMBINED_SECTION_ID} h3.gem-storage-meter-subtitle--local {
        margin-top: 22px;
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-summary {
        font-size: 14px;
        font-weight: 600;
        color: var(--token-text-default);
        margin-bottom: 12px;
      }
      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-summary span {
        opacity: 0.55;
        font-weight: 400;
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-bar {
        width: 100%;
        height: 22px;
        border-radius: 6px;
        overflow: hidden;
        display: flex;
        background: var(--token-box-default-border, #e5e7eb);
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-bar-segment {
        height: 100%;
        min-width: 0;
        transition: width 0.4s ease;
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
        margin-top: 14px;
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        color: var(--token-text-default);
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-legend-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex-shrink: 0;
      }

      #${COMBINED_SECTION_ID} .gem-setting .gem-storage-legend-bytes {
        opacity: 0.55;
      }
    `;
    document.head.appendChild(style);
  }

  function appendMeterIntoSection(section, h3Text, h3ExtraClass, buckets, totalUsed, quotaBytes) {
    const h3 = document.createElement("h3");
    h3.className = "gem-storage-meter-subtitle" + (h3ExtraClass ? " " + h3ExtraClass : "");
    h3.textContent = h3Text;
    section.appendChild(h3);

    const inner = document.createElement("div");
    inner.className = "gem-setting";

    const denom = Math.max(quotaBytes, totalUsed, 1);

    const summary = document.createElement("div");
    summary.className = "gem-storage-summary";
    summary.innerHTML =
      formatBytes(totalUsed) + " <span>of " + formatBytes(quotaBytes) + " used</span>";

    const bar = document.createElement("div");
    bar.className = "gem-storage-bar";

    for (const bucket of buckets) {
      if (bucket.bytes === 0) continue;
      const seg = document.createElement("div");
      seg.className = "gem-storage-bar-segment";
      const pct = (bucket.bytes / denom) * 100;
      seg.style.width = Math.max(pct, 0.4) + "%";
      seg.style.background = bucket.color;
      seg.title = bucket.name + ": " + formatBytes(bucket.bytes);
      bar.appendChild(seg);
    }

    const legend = document.createElement("div");
    legend.className = "gem-storage-legend";

    for (const bucket of buckets) {
      if (bucket.bytes === 0) continue;
      const item = document.createElement("div");
      item.className = "gem-storage-legend-item";

      const swatch = document.createElement("div");
      swatch.className = "gem-storage-legend-swatch";
      swatch.style.background = bucket.color;

      const label = document.createElement("span");
      label.textContent = bucket.name;

      const bytes = document.createElement("span");
      bytes.className = "gem-storage-legend-bytes";
      bytes.textContent = formatBytes(bucket.bytes);

      item.appendChild(swatch);
      item.appendChild(label);
      item.appendChild(bytes);
      legend.appendChild(item);
    }

    inner.appendChild(summary);
    inner.appendChild(bar);
    inner.appendChild(legend);
    section.appendChild(inner);
  }

  function renderCombinedStorage(mount) {
    chrome.storage.sync.get(null, (syncData) => {
      if (chrome.runtime.lastError) {
        console.warn("[Gem] storage-measurement sync read error:", chrome.runtime.lastError);
        return;
      }
      chrome.storage.local.get(null, (localData) => {
        if (chrome.runtime.lastError) {
          console.warn("[Gem] storage-measurement local read error:", chrome.runtime.lastError);
          return;
        }

        const syncBuckets = categorize(syncData, CATEGORIES);
        const syncTotal = syncBuckets.reduce((sum, b) => sum + b.bytes, 0);
        const localBuckets = categorize(localData, LOCAL_CATEGORIES);
        const localTotal = localBuckets.reduce((sum, b) => sum + b.bytes, 0);
        const pageLocalEntries = readPageLocalStorageEntries();
        const pageLocalBuckets = categorizePageLocalStorage(pageLocalEntries);
        const pageLocalTotal = pageLocalBuckets.reduce((sum, b) => sum + b.bytes, 0);

        injectStyles();

        mount.innerHTML = "";

        const h2 = document.createElement("h2");
        h2.textContent = "Storage";
        mount.appendChild(h2);

        const section = document.createElement("div");
        section.className = "gem-setting-section";
        section.id = COMBINED_SECTION_ID;

        appendMeterIntoSection(
          section,
          "Extension Storage: Sync",
          "",
          syncBuckets,
          syncTotal,
          SYNC_QUOTA_BYTES
        );
        appendMeterIntoSection(
          section,
          "Extension Storage: Local",
          "gem-storage-meter-subtitle--local",
          localBuckets,
          localTotal,
          LOCAL_QUOTA_BYTES
        );
        appendMeterIntoSection(
          section,
          "Site Local Storage",
          "gem-storage-meter-subtitle--local",
          pageLocalBuckets,
          pageLocalTotal,
          PAGE_LOCAL_QUOTA_BYTES
        );

        mount.appendChild(section);
      });
    });
  }

  // ── Init ────────────────────────────────────────────────────────────

  function tryMount() {
    const mount = document.getElementById(MOUNT_ID);
    if (mount && !mount.dataset.gemStorageRendered) {
      mount.dataset.gemStorageRendered = "1";
      ensurePageLocalStorageWatch();
      renderCombinedStorage(mount);
    }
  }

  function refreshStorageMetersIfMounted() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount || !mount.dataset.gemStorageRendered) return;
    renderCombinedStorage(mount);
  }

  let pageLocalPollId = null;

  function ensurePageLocalStorageWatch() {
    if (pageLocalPollId != null) return;
    pageLocalPollId = setInterval(() => refreshStorageMetersIfMounted(), PAGE_LOCAL_POLL_MS);
  }

  try {
    chrome.storage.onChanged.addListener((_changes, namespace) => {
      if (namespace === "local" || namespace === "sync") refreshStorageMetersIfMounted();
    });
  } catch (_) {}

  try {
    window.addEventListener("storage", () => refreshStorageMetersIfMounted());
  } catch (_) {}

  try {
    window.addEventListener("gem:page-localstorage-guard", () => refreshStorageMetersIfMounted());
  } catch (_) {}

  window.gemDomWatchSubscribe(function () {
    tryMount();
  });

  tryMount();
})();
