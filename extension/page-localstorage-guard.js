console.log("[Gem] page-localstorage-guard.js loaded");

(function () {
  const PAGE_LOCAL_QUOTA_BYTES = 5242880;
  const THRESHOLD_RATIO = 0.75;
  const TARGET_BYTES = Math.floor(PAGE_LOCAL_QUOTA_BYTES * THRESHOLD_RATIO);
  const INBOX_PREFIX = "inbox-preview::";
  const TEST_MAIL_PREFIX = "test-mail::";
  const CHECK_INTERVAL_MS = 30000;
  const STORAGE_EVENT_DEBOUNCE_MS = 1000;

  function entryByteSize(key, value) {
    return new Blob([key]).size + new Blob([String(value ?? "")]).size;
  }

  function getTotalLocalStorageBytes() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        total += entryByteSize(key, localStorage.getItem(key));
      }
    } catch (_) {}
    return total;
  }

  function collectKeysByPrefix(prefix) {
    const results = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const value = localStorage.getItem(key);
        results.push({ key, bytes: entryByteSize(key, value) });
      }
    } catch (_) {}
    results.sort((a, b) => b.bytes - a.bytes);
    return results;
  }

  function purgeLargestUntilUnderThreshold(prefix, currentTotal) {
    const keys = collectKeysByPrefix(prefix);
    let removedCount = 0;
    let freedBytes = 0;
    let running = currentTotal;

    for (const entry of keys) {
      if (running <= TARGET_BYTES) break;
      try {
        localStorage.removeItem(entry.key);
        running -= entry.bytes;
        freedBytes += entry.bytes;
        removedCount++;
      } catch (_) {}
    }

    return { removedCount, freedBytes, runningTotal: running };
  }

  function runPageLocalStorageGuard() {
    try {
      const initialTotal = getTotalLocalStorageBytes();
      if (initialTotal <= TARGET_BYTES) return;

      let totalFreed = 0;
      let totalRemoved = 0;

      const inboxResult = purgeLargestUntilUnderThreshold(INBOX_PREFIX, initialTotal);
      totalFreed += inboxResult.freedBytes;
      totalRemoved += inboxResult.removedCount;

      if (inboxResult.runningTotal > TARGET_BYTES) {
        const testMailResult = purgeLargestUntilUnderThreshold(TEST_MAIL_PREFIX, inboxResult.runningTotal);
        totalFreed += testMailResult.freedBytes;
        totalRemoved += testMailResult.removedCount;

        if (testMailResult.runningTotal > TARGET_BYTES) {
          console.warn(
            "[Gem] page localStorage still above 75% after Emarsys cache purge; other keys may need manual review.",
            "current:", Math.round(testMailResult.runningTotal / 1024) + " KB",
            "target:", Math.round(TARGET_BYTES / 1024) + " KB"
          );
        }
      }

      if (totalRemoved > 0) {
        console.log(
          "[Gem] Pruned Emarsys localStorage cache:",
          totalRemoved + " keys removed,",
          Math.round(totalFreed / 1024) + " KB freed.",
          "Was:", Math.round(initialTotal / 1024) + " KB,",
          "now:", Math.round(getTotalLocalStorageBytes() / 1024) + " KB"
        );
        try {
          window.dispatchEvent(new CustomEvent("gem:page-localstorage-guard"));
        } catch (_) {}
      }
    } catch (_) {}
  }

  runPageLocalStorageGuard();

  setInterval(runPageLocalStorageGuard, CHECK_INTERVAL_MS);

  let debounceId = null;
  try {
    window.addEventListener("storage", () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(runPageLocalStorageGuard, STORAGE_EVENT_DEBOUNCE_MS);
    });
  } catch (_) {}
})();
