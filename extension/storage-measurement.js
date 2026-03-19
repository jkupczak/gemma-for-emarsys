console.log("[gem] storage-measurement.js loaded");

(function () {
  const SYNC_QUOTA_BYTES = 102400;
  const MOUNT_ID = "gem-storage-meter-mount";
  const STYLE_ID = "gem-storage-meter-style";

  const CATEGORIES = [
    {
      name: "Snippets",
      color: "var(--token-amethyst-400)",
      match: (key) =>
        key === "sm" ||
        key === "s_meta" ||
        key === "gemSnippets" ||
        key === "gemSnippetCategoryCollapseState" ||
        /^s\d+$/.test(key),
    },
    {
      name: "Saved Searches",
      color: "var(--token-sapphire-400)",
      match: (key) =>
        key === "gemImagePropertiesSearchPillsFavorites" ||
        key === "gemImagePropertiesSearchPillsSeen" ||
        key === "gemImagePropertiesSearch",
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
        key === "pinnedBlocks" ||
        key === "hiddenBlocks" ||
        key === "showHiddenBlocks",
    },
    {
      name: "Notes",
      color: "var(--token-topaz-400)",
      match: (key) => key === "gemNotes",
    },
    {
      name: "Favorite Images",
      color: "var(--token-ruby-400)",
      match: (key) => key === "fm" || /^f\d+$/.test(key),
    },
    {
      name: "Settings",
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

  function categorize(data) {
    const buckets = CATEGORIES.map((c) => ({ ...c, bytes: 0 }));

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

  // ── Styles ──────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #gem-storage-meter-mount h2 {
        margin-top: 30px;
        margin-bottom: 10px;
        border-top: 2px solid var(--token-box-default-background);
        padding-top: 24px;
      }

      #gem-storage-meter .gem-storage-summary {
        font-size: 14px;
        font-weight: 600;
        color: var(--token-text-default);
        margin-bottom: 12px;
      }
      #gem-storage-meter .gem-storage-summary span {
        opacity: 0.55;
        font-weight: 400;
      }

      #gem-storage-meter .gem-storage-bar {
        width: 100%;
        height: 22px;
        border-radius: 6px;
        overflow: hidden;
        display: flex;
        background: var(--token-box-default-border, #e5e7eb);
      }

      #gem-storage-meter .gem-storage-bar-segment {
        height: 100%;
        min-width: 0;
        transition: width 0.4s ease;
      }

      #gem-storage-meter .gem-storage-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
        margin-top: 14px;
      }

      #gem-storage-meter .gem-storage-legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        color: var(--token-text-default);
      }

      #gem-storage-meter .gem-storage-legend-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex-shrink: 0;
      }

      #gem-storage-meter .gem-storage-legend-bytes {
        opacity: 0.55;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Render ──────────────────────────────────────────────────────────

  function render(mount) {
    chrome.storage.sync.get(null, (data) => {
      if (chrome.runtime.lastError) {
        console.warn("[gem] storage-measurement read error:", chrome.runtime.lastError);
        return;
      }

      const buckets = categorize(data);
      const totalUsed = buckets.reduce((sum, b) => sum + b.bytes, 0);

      injectStyles();

      mount.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Storage";
      mount.appendChild(heading);

      const section = document.createElement("div");
      section.className = "gem-setting-section";
      section.id = "gem-storage-meter";

      const inner = document.createElement("div");
      inner.className = "gem-setting";

      // Summary
      const summary = document.createElement("div");
      summary.className = "gem-storage-summary";
      summary.innerHTML =
        formatBytes(totalUsed) +
        " <span>of " +
        formatBytes(SYNC_QUOTA_BYTES) +
        " used</span>";

      // Bar
      const bar = document.createElement("div");
      bar.className = "gem-storage-bar";

      for (const bucket of buckets) {
        if (bucket.bytes === 0) continue;
        const seg = document.createElement("div");
        seg.className = "gem-storage-bar-segment";
        const pct = (bucket.bytes / SYNC_QUOTA_BYTES) * 100;
        seg.style.width = Math.max(pct, 0.4) + "%";
        seg.style.background = bucket.color;
        seg.title = bucket.name + ": " + formatBytes(bucket.bytes);
        bar.appendChild(seg);
      }

      // Legend
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
      mount.appendChild(section);
    });
  }

  // ── Init ────────────────────────────────────────────────────────────

  function tryMount() {
    const mount = document.getElementById(MOUNT_ID);
    if (mount && !mount.dataset.gemRendered) {
      mount.dataset.gemRendered = "1";
      render(mount);
    }
  }

  const observer = new MutationObserver(() => tryMount());
  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });

  tryMount();
})();
