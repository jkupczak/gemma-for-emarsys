// gem-dom-watch.js
// Single shared MutationObserver for document-tree changes. Subscribers run once per rAF.
(function () {
  try {
    if (window.__gemDomWatchInstalled) return;
    window.__gemDomWatchInstalled = true;

    /** @type {Map<number, { fn: Function, filter: ((m: MutationRecord[]) => MutationRecord[]) | null }>} */
    const subscribers = new Map();
    let nextId = 1;
    /** @type {MutationObserver | null} */
    let rootObserver = null;
    let rafScheduled = false;
    /** @type {MutationRecord[]} */
    let pendingMutations = [];

    function scheduleFlush() {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(function () {
        rafScheduled = false;
        const batch = pendingMutations;
        pendingMutations = [];
        if (!batch.length) return;
        subscribers.forEach(function (entry) {
          try {
            const slice = entry.filter ? entry.filter(batch) : batch;
            if (slice.length) entry.fn(slice, batch);
          } catch (_) {}
        });
      });
    }

    function ensureRootObserver() {
      if (rootObserver) return;
      const root = document.documentElement || document.body;
      if (!root) {
        document.addEventListener("DOMContentLoaded", ensureRootObserver, { once: true });
        return;
      }
      rootObserver = new MutationObserver(function (mutations) {
        if (mutations.length) pendingMutations.push.apply(pendingMutations, mutations);
        scheduleFlush();
      });
      rootObserver.observe(root, { childList: true, subtree: true });
    }

    function maybeTeardownRootObserver() {
      if (subscribers.size > 0 || rootObserver == null) return;
      rootObserver.disconnect();
      rootObserver = null;
      pendingMutations = [];
      rafScheduled = false;
    }

    /**
     * Subscribe to batched document-tree mutations (one callback per animation frame).
     * @param {function(MutationRecord[], MutationRecord[]): void} fn
     * @param {{ filter?: function(MutationRecord[]): MutationRecord[] }} [options]
     * @returns {function(): void} unsubscribe
     */
    window.gemDomWatchSubscribe = function gemDomWatchSubscribe(fn, options) {
      if (typeof fn !== "function") return function () {};
      const id = nextId++;
      const filter = options && typeof options.filter === "function" ? options.filter : null;
      subscribers.set(id, { fn: fn, filter: filter });
      ensureRootObserver();
      return function unsubscribe() {
        subscribers.delete(id);
        maybeTeardownRootObserver();
      };
    };

    /**
     * Run callback once when selector matches; uses shared observer until found.
     * @param {string} selector
     * @param {function(Element): void} callback
     * @param {{ root?: ParentNode }} [options]
     * @returns {function(): void} cancel (no-op after match)
     */
    window.gemDomWatchWaitFor = function gemDomWatchWaitFor(selector, callback, options) {
      const root = (options && options.root) || document;
      const sel = String(selector || "").trim();
      if (!sel || typeof callback !== "function") return function () {};

      function query() {
        try {
          return root.querySelector(sel);
        } catch (_) {
          return null;
        }
      }

      const existing = query();
      if (existing) {
        callback(existing);
        return function () {};
      }

      let cancelled = false;
      const unsub = window.gemDomWatchSubscribe(function () {
        if (cancelled) return;
        const el = query();
        if (!el) return;
        cancelled = true;
        unsub();
        callback(el);
      });

      return function cancel() {
        cancelled = true;
        unsub();
      };
    };

    /**
     * Narrow attribute observer on a specific element (not shared — cheap when targeted).
     * @param {Element} target
     * @param {function(MutationRecord[]): void} callback
     * @param {string[]} [attributeFilter]
     * @returns {function(): void} disconnect
     */
    window.gemDomWatchObserveAttributes = function gemDomWatchObserveAttributes(
      target,
      callback,
      attributeFilter
    ) {
      if (!target || typeof callback !== "function") return function () {};
      const obs = new MutationObserver(function (mutations) {
        callback(mutations);
      });
      const opts = { attributes: true, attributeOldValue: true };
      if (Array.isArray(attributeFilter) && attributeFilter.length) {
        opts.attributeFilter = attributeFilter;
      }
      obs.observe(target, opts);
      return function () {
        obs.disconnect();
      };
    };

    /**
     * Filter helper: true when mutation batch includes structural DOM changes.
     * @param {MutationRecord[]} mutations
     * @returns {boolean}
     */
    window.gemDomWatchHasStructuralChange = function gemDomWatchHasStructuralChange(mutations) {
      return mutations.some(function (m) {
        return (
          m.type === "childList" &&
          (m.addedNodes.length > 0 || m.removedNodes.length > 0)
        );
      });
    };
  } catch (_) {}
})();
