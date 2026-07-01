console.log("[gem] recent-segments.js loaded");

(function () {
  const STORAGE_KEY = "gemRecentCombinedSegments";
  const MAX_RECENT = 10;
  const COMBINED_SOURCE = "registry_segmentuniversal_combined";
  const CONTAINER_CLASS = "gem-recent-segments";
  const SEGMENT_SELECT_ID = "universal_combined_registry_id";
  const SEGMENT_TABLE_ID = "table_universal_combined_segment";
  const SEGMENT_TABLE_ENABLED_CLASS = "gem-recent-segments-table";
  const SOURCE_SELECT_ID = "sourceSelect";
  const SEGMENT_DETECT_MAX_ATTEMPTS = 40;
  const SEGMENT_DETECT_INTERVAL_MS = 250;

  /** @type {string[]} */
  let recentSegmentIdsCache = [];
  let recentSegmentsInitialized = false;
  let initialSegmentLoadLogged = false;

  function isDebugEnabled() {
    try {
      if (typeof window.gemIsDebugLoggingEnabled === "function") {
        return !!window.gemIsDebugLoggingEnabled();
      }
      if (typeof window.GEM_DEBUG === "boolean") return window.GEM_DEBUG;
    } catch (_) {}
    return false;
  }

  function debug(label, detail) {
    if (!isDebugEnabled()) return;
    if (detail === undefined) {
      console.log(`[Gem-RecentSegments] ${label}`);
      return;
    }
    console.log(`[Gem-RecentSegments] ${label}`, detail);
  }

  function warn(label, detail) {
    if (detail === undefined) {
      console.warn(`[Gem-RecentSegments] ${label}`);
      return;
    }
    console.warn(`[Gem-RecentSegments] ${label}`, detail);
  }

  function isCampaignManagerDetailsPage() {
    try {
      const url = new URL(window.location.href);
      if (!(url.pathname || "").includes("campaignmanager.php")) return false;
      const action = (url.searchParams.get("action") || "").trim();
      return (action === "details" || action === "save") &&
        !!(url.searchParams.get("camp_id") || "").trim();
    } catch (_) {
      return false;
    }
  }

  function getStorageArea() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return null;
    return chrome.storage.local;
  }

  /** @param {unknown} raw @returns {string[]} */
  function normalizeSegmentIds(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    raw.forEach((entry) => {
      let id = "";
      if (typeof entry === "string" || typeof entry === "number") {
        id = String(entry).trim();
      } else if (entry && typeof entry === "object" && entry.id != null) {
        id = String(entry.id).trim();
      }
      if (!id || id === "0" || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    return out.slice(0, MAX_RECENT);
  }

  function loadRecentSegmentIds(callback) {
    const area = getStorageArea();
    if (!area) {
      warn("load skipped — chrome.storage.local unavailable");
      callback([]);
      return;
    }
    area.get({ [STORAGE_KEY]: [] }, (result) => {
      if (chrome.runtime.lastError) {
        warn("load failed", chrome.runtime.lastError.message);
        callback([]);
        return;
      }
      recentSegmentIdsCache = normalizeSegmentIds(result[STORAGE_KEY]);
      debug("load", { count: recentSegmentIdsCache.length, ids: recentSegmentIdsCache });
      callback(recentSegmentIdsCache);
    });
  }

  function saveRecentSegmentIds(ids, callback) {
    recentSegmentIdsCache = normalizeSegmentIds(ids);
    const area = getStorageArea();
    if (!area) {
      warn("save skipped — chrome.storage.local unavailable", recentSegmentIdsCache);
      if (typeof callback === "function") callback(recentSegmentIdsCache);
      return;
    }
    area.set({ [STORAGE_KEY]: recentSegmentIdsCache }, () => {
      if (chrome.runtime.lastError) {
        warn("save failed", chrome.runtime.lastError.message);
      } else {
        warn("saved to chrome.storage.local", {
          key: STORAGE_KEY,
          count: recentSegmentIdsCache.length,
          ids: recentSegmentIdsCache,
        });
        debug("save", { count: recentSegmentIdsCache.length, ids: recentSegmentIdsCache });
      }
      if (typeof callback === "function") callback(recentSegmentIdsCache);
    });
  }

  function prependRecentSegmentId(segmentId, callback) {
    const id = String(segmentId || "").trim();
    if (!id || id === "0" || !isRecentSegmentsAllowed()) {
      debug("prepend skipped — invalid id or segment select disabled", { segmentId });
      if (typeof callback === "function") callback(recentSegmentIdsCache);
      return;
    }

    loadRecentSegmentIds((existing) => {
      const next = [id, ...existing.filter((item) => item !== id)].slice(0, MAX_RECENT);
      saveRecentSegmentIds(next, callback);
    });
  }

  function isCombinedSegmentSourceActive() {
    const sourceSelect = document.getElementById(SOURCE_SELECT_ID);
    return !!sourceSelect && sourceSelect.value === COMBINED_SOURCE;
  }

  function isCombinedSegmentSelectEnabled() {
    const select = document.getElementById(SEGMENT_SELECT_ID);
    return !!select && !select.disabled;
  }

  function isRecentSegmentsAllowed() {
    return isCombinedSegmentSourceActive() && isCombinedSegmentSelectEnabled();
  }

  function syncCombinedSegmentTableState() {
    const table = document.getElementById(SEGMENT_TABLE_ID);
    const select = document.getElementById(SEGMENT_SELECT_ID);
    if (!table || !select) return false;

    const enabled = !select.disabled;
    table.classList.toggle(SEGMENT_TABLE_ENABLED_CLASS, enabled);

    if (!enabled) {
      removeRecentSegmentsUI();
    }

    return true;
  }

  function ensureCombinedSegmentTableStateWatcher() {
    if (ensureCombinedSegmentTableStateWatcher._started) return;
    ensureCombinedSegmentTableStateWatcher._started = true;

    const sync = () => {
      syncCombinedSegmentTableState();
    };

    if (typeof window.gemDomWatchWaitFor === "function") {
      window.gemDomWatchWaitFor(`#${SEGMENT_TABLE_ID}`, sync);
      window.gemDomWatchWaitFor(`#${SEGMENT_SELECT_ID}`, sync);
    }

    if (typeof window.gemDomWatchSubscribe === "function") {
      window.gemDomWatchSubscribe((mutations) => {
        if (!window.gemDomWatchHasStructuralChange(mutations)) return;
        sync();
      });
    }
  }

  function getSelect2SegmentValue(select) {
    if (!select || typeof window.jQuery !== "function") return "";
    try {
      const $select = window.jQuery(select);
      if (!$select.data("select2")) return "";
      const val = $select.select2("val");
      if (Array.isArray(val)) return String(val[0] || "").trim();
      return String(val == null ? "" : val).trim();
    } catch (_) {
      return "";
    }
  }

  function getSelect2ChosenText() {
    const chosen = document.querySelector("#s2id_universal_combined_registry_id .select2-chosen");
    return chosen ? String(chosen.textContent || "").trim() : "";
  }

  function getSegmentDebugSnapshot() {
    const select = document.getElementById(SEGMENT_SELECT_ID);
    const sourceSelect = document.getElementById(SOURCE_SELECT_ID);
    const chosenText = getSelect2ChosenText();
    const selectValue = select ? String(select.value || "").trim() : "";
    const select2Value = select ? getSelect2SegmentValue(select) : "";
    const selectedOption = select && select.selectedIndex >= 0
      ? select.options[select.selectedIndex]
      : null;

    return {
      pageUrl: window.location.href,
      isDetailsPage: isCampaignManagerDetailsPage(),
      sourceValue: sourceSelect ? sourceSelect.value : null,
      combinedSourceActive: isCombinedSegmentSourceActive(),
      selectDisabled: select ? select.disabled : null,
      recentSegmentsAllowed: isRecentSegmentsAllowed(),
      selectFound: !!select,
      tableFound: !!document.getElementById(SEGMENT_TABLE_ID),
      selectValue,
      select2Value,
      chosenText,
      selectedOptionValue: selectedOption ? selectedOption.value : null,
      selectedOptionText: selectedOption ? String(selectedOption.textContent || "").trim() : null,
      optionCount: select ? select.options.length : 0,
      storedCount: recentSegmentIdsCache.length,
      jQueryAvailable: typeof window.jQuery === "function",
      select2Bound: !!(select && typeof window.jQuery === "function" && window.jQuery(select).data("select2")),
    };
  }

  function resolveSegmentNameFromSelect(select, id) {
    const segmentId = String(id || "").trim();
    if (!select || !segmentId) return "";

    const matchedOption = Array.from(select.options).find((opt) => opt.value === segmentId);
    if (!matchedOption) return "";

    const optionText = String(matchedOption.textContent || "").trim();
    if (!optionText || optionText.startsWith("--")) return "";
    return optionText;
  }

  function getSelectedCombinedSegmentId() {
    const select = document.getElementById(SEGMENT_SELECT_ID);
    if (!select) return "";

    let id = getSelect2SegmentValue(select);
    if (!id || id === "0") {
      id = String(select.value || "").trim();
    }

    if (!id || id === "0") {
      const chosenText = getSelect2ChosenText();
      if (chosenText && !chosenText.startsWith("--")) {
        const matchedOption = Array.from(select.options).find((opt) => {
          const text = String(opt.textContent || "").trim();
          return text && text === chosenText;
        });
        if (matchedOption && matchedOption.value && matchedOption.value !== "0") {
          id = String(matchedOption.value).trim();
        }
      }
    }

    return id && id !== "0" ? id : "";
  }

  /** @param {string[]} ids @returns {{ id: string, name: string }[]} */
  function buildDisplayEntries(ids) {
    const select = document.getElementById(SEGMENT_SELECT_ID);
    return normalizeSegmentIds(ids)
      .map((id) => ({
        id,
        name: resolveSegmentNameFromSelect(select, id),
      }))
      .filter((entry) => entry.name);
  }

  function ensureSelectOption(select, id) {
    const segmentId = String(id || "").trim();
    if (!select || !segmentId) return null;

    let option = Array.from(select.options).find((opt) => opt.value === segmentId);
    if (!option) {
      const name = resolveSegmentNameFromSelect(select, segmentId) || segmentId;
      option = document.createElement("option");
      option.value = segmentId;
      option.textContent = name;
      select.appendChild(option);
    }
    return option;
  }

  function applyCombinedSegmentId(segmentId) {
    const select = document.getElementById(SEGMENT_SELECT_ID);
    const id = String(segmentId || "").trim();
    if (!select || !id) return false;

    ensureSelectOption(select, id);
    select.value = id;

    if (typeof window.jQuery === "function") {
      const $select = window.jQuery(select);
      if ($select.data("select2")) {
        $select.select2("val", id);
      }
      $select.trigger("change");
      return true;
    }

    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (typeof window.Touch === "function") window.Touch();
    return true;
  }

  function removeRecentSegmentsUI() {
    document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((node) => node.remove());
  }

  function renderRecentSegmentsList(ids) {
    const table = document.getElementById(SEGMENT_TABLE_ID);
    if (!table || !isRecentSegmentsAllowed()) {
      removeRecentSegmentsUI();
      debug("render skipped", {
        tableFound: !!table,
        combinedSourceActive: isCombinedSegmentSourceActive(),
        selectEnabled: isCombinedSegmentSelectEnabled(),
      });
      return;
    }

    const listData = buildDisplayEntries(ids);
    removeRecentSegmentsUI();
    if (!listData.length) {
      debug("render skipped — no matching segment options for stored ids", {
        storedIds: normalizeSegmentIds(ids),
      });
      return;
    }

    const currentId = getSelectedCombinedSegmentId();
    const container = document.createElement("div");
    container.className = `${CONTAINER_CLASS} e-field`;
    container.innerHTML = `
      <label class="e-field__label gem-recent-segments__label">Recently used segments</label>
      <ul class="gem-recent-segments__list" role="list"></ul>
    `;

    const list = container.querySelector(".gem-recent-segments__list");
    listData.forEach((segment) => {
      const itemWrap = document.createElement("li");
      itemWrap.className = "gem-recent-segments__item-wrap";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "gem-recent-segments__item";
      button.textContent = segment.name;
      button.dataset.segmentId = segment.id;
      button.title = segment.name;
      if (segment.id === currentId) {
        button.classList.add("gem-recent-segments__item--active");
        button.setAttribute("aria-current", "true");
      }

      button.addEventListener("click", () => {
        if (segment.id === getSelectedCombinedSegmentId()) return;
        debug("recent segment clicked", { id: segment.id });
        applyCombinedSegmentId(segment.id);
        prependRecentSegmentId(segment.id, (updated) => {
          renderRecentSegmentsList(updated);
        });
      });

      itemWrap.appendChild(button);
      list.appendChild(itemWrap);
    });

    table.appendChild(container);
    debug("render complete", { count: listData.length, currentId });
  }

  function refreshRecentSegmentsUI() {
    syncCombinedSegmentTableState();
    if (!isRecentSegmentsAllowed()) {
      removeRecentSegmentsUI();
      return;
    }
    renderRecentSegmentsList(recentSegmentIdsCache);
  }

  function logSegmentId(segmentId) {
    const id = String(segmentId || "").trim();
    if (!id || id === "0" || !isRecentSegmentsAllowed()) return;

    debug("logging segment id", { id });
    prependRecentSegmentId(id, refreshRecentSegmentsUI);
  }

  function tryLogInitialSegmentOnce() {
    if (initialSegmentLoadLogged || !isRecentSegmentsAllowed()) return false;

    const id = getSelectedCombinedSegmentId();
    if (!id) return false;

    initialSegmentLoadLogged = true;
    logSegmentId(id);
    return true;
  }

  function waitForSegmentAndLog(attempt) {
    const nextAttempt = Number.isFinite(attempt) ? attempt + 1 : 0;

    if (tryLogInitialSegmentOnce()) return;

    if (nextAttempt === 0) {
      debug("waiting for segment value", getSegmentDebugSnapshot());
    } else if (nextAttempt % 4 === 0) {
      debug("still waiting for segment value", {
        attempt: nextAttempt,
        snapshot: getSegmentDebugSnapshot(),
      });
    }

    if (nextAttempt >= SEGMENT_DETECT_MAX_ATTEMPTS) {
      warn("segment detection gave up — nothing saved this load", getSegmentDebugSnapshot());
      if (isRecentSegmentsAllowed()) {
        loadRecentSegmentIds(refreshRecentSegmentsUI);
      } else {
        syncCombinedSegmentTableState();
      }
      return;
    }

    setTimeout(() => waitForSegmentAndLog(nextAttempt), SEGMENT_DETECT_INTERVAL_MS);
  }

  function logCurrentSegmentOnLoad() {
    syncCombinedSegmentTableState();

    if (!isCombinedSegmentSourceActive()) {
      debug("combined source not active on load", getSegmentDebugSnapshot());
      return;
    }

    if (!isCombinedSegmentSelectEnabled()) {
      debug("segment select disabled — skipping recent segments", getSegmentDebugSnapshot());
      return;
    }

    if (tryLogInitialSegmentOnce()) return;
    waitForSegmentAndLog(0);
  }

  function bindSourceSelectListener() {
    const sourceSelect = document.getElementById(SOURCE_SELECT_ID);
    if (!sourceSelect || sourceSelect.dataset.gemRecentSegmentsBound === "true") return;
    sourceSelect.dataset.gemRecentSegmentsBound = "true";
    sourceSelect.addEventListener("change", () => {
      debug("sourceSelect changed", { value: sourceSelect.value });
      syncCombinedSegmentTableState();
      if (isRecentSegmentsAllowed()) {
        loadRecentSegmentIds(refreshRecentSegmentsUI);
      } else {
        removeRecentSegmentsUI();
      }
    });
  }

  function bindSegmentSelectDisabledWatcher() {
    const segmentSelect = document.getElementById(SEGMENT_SELECT_ID);
    if (!segmentSelect || segmentSelect.dataset.gemRecentSegmentsDisabledBound === "true") return;
    segmentSelect.dataset.gemRecentSegmentsDisabledBound = "true";

    const sync = () => {
      syncCombinedSegmentTableState();
      if (!isRecentSegmentsAllowed()) return;
      loadRecentSegmentIds(refreshRecentSegmentsUI);
    };

    if (typeof window.gemDomWatchObserveAttributes === "function") {
      window.gemDomWatchObserveAttributes(segmentSelect, sync, ["disabled"]);
    } else {
      new MutationObserver(sync).observe(segmentSelect, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    }

    sync();
  }

  function bindSegmentSelectListener() {
    const segmentSelect = document.getElementById(SEGMENT_SELECT_ID);
    if (!segmentSelect || segmentSelect.dataset.gemRecentSegmentsBound === "true") return;
    segmentSelect.dataset.gemRecentSegmentsBound = "true";
    segmentSelect.addEventListener("change", () => {
      debug("segmentSelect changed", getSegmentDebugSnapshot());
      logSegmentId(getSelectedCombinedSegmentId());
    });
  }

  function initRecentSegments() {
    const onDetailsPage = isCampaignManagerDetailsPage();
    if (onDetailsPage) {
      warn("init on campaign details page", {
        href: window.location.href,
        readyState: document.readyState,
        debugLoggingEnabled: isDebugEnabled(),
      });
    }
    debug("init", {
      onDetailsPage,
      href: window.location.href,
      readyState: document.readyState,
    });

    if (!onDetailsPage) return;

    const start = () => {
      if (recentSegmentsInitialized) return;

      const sourceSelect = document.getElementById(SOURCE_SELECT_ID);
      const table = document.getElementById(SEGMENT_TABLE_ID);
      const segmentSelect = document.getElementById(SEGMENT_SELECT_ID);
      if (!sourceSelect || !table || !segmentSelect) {
        debug("start deferred — required elements missing", {
          sourceSelectFound: !!sourceSelect,
          tableFound: !!table,
          segmentSelectFound: !!segmentSelect,
        });
        return;
      }

      recentSegmentsInitialized = true;
      syncCombinedSegmentTableState();
      warn("start — DOM ready", getSegmentDebugSnapshot());
      debug("start", getSegmentDebugSnapshot());

      bindSourceSelectListener();
      bindSegmentSelectListener();
      bindSegmentSelectDisabledWatcher();
      logCurrentSegmentOnLoad();
    };

    ensureCombinedSegmentTableStateWatcher();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    if (typeof window.gemDomWatchWaitFor === "function") {
      window.gemDomWatchWaitFor(`#${SEGMENT_TABLE_ID}`, start);
      window.gemDomWatchWaitFor(`#${SOURCE_SELECT_ID}`, start);
      window.gemDomWatchWaitFor(`#${SEGMENT_SELECT_ID}`, start);
    }
  }

  initRecentSegments();
})();
