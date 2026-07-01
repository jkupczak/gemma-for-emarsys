console.log("[gem] recent-segments.js loaded");

(function () {
  const STORAGE_KEY = "gemRecentCombinedSegments";
  const MAX_RECENT_PER_CATEGORY = 10;
  const COMBINED_SOURCE = "registry_segmentuniversal_combined";
  const CONTAINER_CLASS = "gem-recent-segments";
  const SEGMENT_SELECT_ID = "universal_combined_registry_id";
  const SEGMENT_TABLE_ID = "table_universal_combined_segment";
  const SEGMENT_TABLE_ENABLED_CLASS = "gem-recent-segments-table";
  const SOURCE_SELECT_ID = "sourceSelect";
  const CAMPAIGN_CATEGORY_SELECT_SELECTOR = 'select[name="campaign_category"]';
  const SEGMENT_DETECT_MAX_ATTEMPTS = 40;
  const SEGMENT_DETECT_INTERVAL_MS = 250;

  /** @type {{ id: string, campaignCategory: string }[]} */
  let recentSegmentsCache = [];
  let recentSegmentsInitialized = false;
  let initialSegmentLoadLogged = false;
  let showAllRecentSegments = false;

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

  function getCampaignCategoryId() {
    const select = document.querySelector(CAMPAIGN_CATEGORY_SELECT_SELECTOR);
    return select ? String(select.value || "").trim() : "";
  }

  /** @param {unknown} entry @returns {{ id: string, campaignCategory: string } | null} */
  function parseRecentSegmentEntry(entry) {
    let id = "";
    let campaignCategory = "";
    if (typeof entry === "string" || typeof entry === "number") {
      id = String(entry).trim();
    } else if (entry && typeof entry === "object") {
      if (entry.id != null) id = String(entry.id).trim();
      if (entry.campaignCategory != null) {
        campaignCategory = String(entry.campaignCategory).trim();
      }
    }
    if (!id || id === "0") return null;
    return { id, campaignCategory };
  }

  /** @param {unknown} raw @returns {{ id: string, campaignCategory: string }[]} */
  function normalizeRecentSegments(raw) {
    if (!Array.isArray(raw)) return [];
    /** @type {Map<string, Set<string>>} */
    const seenByCategory = new Map();
    /** @type {{ id: string, campaignCategory: string }[]} */
    const out = [];
    raw.forEach((entry) => {
      const parsed = parseRecentSegmentEntry(entry);
      if (!parsed) return;
      const categoryKey = parsed.campaignCategory;
      if (!seenByCategory.has(categoryKey)) seenByCategory.set(categoryKey, new Set());
      const seen = seenByCategory.get(categoryKey);
      if (seen.has(parsed.id) || seen.size >= MAX_RECENT_PER_CATEGORY) return;
      seen.add(parsed.id);
      out.push(parsed);
    });
    return out;
  }

  function loadRecentSegments(callback) {
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
      recentSegmentsCache = normalizeRecentSegments(result[STORAGE_KEY]);
      debug("load", { count: recentSegmentsCache.length, entries: recentSegmentsCache });
      callback(recentSegmentsCache);
    });
  }

  function saveRecentSegments(entries, callback) {
    recentSegmentsCache = normalizeRecentSegments(entries);
    const area = getStorageArea();
    if (!area) {
      warn("save skipped — chrome.storage.local unavailable", recentSegmentsCache);
      if (typeof callback === "function") callback(recentSegmentsCache);
      return;
    }
    area.set({ [STORAGE_KEY]: recentSegmentsCache }, () => {
      if (chrome.runtime.lastError) {
        warn("save failed", chrome.runtime.lastError.message);
      } else {
        warn("saved to chrome.storage.local", {
          key: STORAGE_KEY,
          count: recentSegmentsCache.length,
          entries: recentSegmentsCache,
        });
        debug("save", { count: recentSegmentsCache.length, entries: recentSegmentsCache });
      }
      if (typeof callback === "function") callback(recentSegmentsCache);
    });
  }

  function prependRecentSegment(segmentId, campaignCategory, callback) {
    const id = String(segmentId || "").trim();
    const category = String(campaignCategory || "").trim();
    if (!id || id === "0" || !isRecentSegmentsAllowed()) {
      debug("prepend skipped — invalid id or segment select disabled", { segmentId, campaignCategory: category });
      if (typeof callback === "function") callback(recentSegmentsCache);
      return;
    }

    loadRecentSegments((existing) => {
      const withoutDup = existing.filter(
        (item) => !(item.id === id && item.campaignCategory === category),
      );
      const next = normalizeRecentSegments([{ id, campaignCategory: category }, ...withoutDup]);
      saveRecentSegments(next, callback);
    });
  }

  /** @param {{ id: string, campaignCategory: string }[]} entries @param {string} categoryId */
  function partitionSegmentsByCategory(entries, categoryId) {
    const matching = [];
    const other = [];
    entries.forEach((entry) => {
      if (entry.campaignCategory === categoryId) matching.push(entry);
      else other.push(entry);
    });
    return { matching, other };
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
      campaignCategory: getCampaignCategoryId(),
      storedCount: recentSegmentsCache.length,
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

  /** @param {{ id: string, campaignCategory: string }[]} entries @returns {{ id: string, name: string, campaignCategory: string }[]} */
  function buildDisplayEntries(entries) {
    const select = document.getElementById(SEGMENT_SELECT_ID);
    return entries
      .map((entry) => ({
        id: entry.id,
        campaignCategory: entry.campaignCategory,
        name: resolveSegmentNameFromSelect(select, entry.id),
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

  function createSegmentButton(segment, currentId) {
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
      debug("recent segment clicked", {
        id: segment.id,
        campaignCategory: getCampaignCategoryId(),
      });
      applyCombinedSegmentId(segment.id);
      prependRecentSegment(segment.id, getCampaignCategoryId(), (updated) => {
        renderRecentSegmentsList(updated);
      });
    });

    itemWrap.appendChild(button);
    return itemWrap;
  }

  function populateSegmentList(list, segments, currentId) {
    list.replaceChildren();
    segments.forEach((segment) => {
      list.appendChild(createSegmentButton(segment, currentId));
    });
  }

  function renderRecentSegmentsList(entries) {
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

    const campaignCategory = getCampaignCategoryId();
    const { matching, other } = partitionSegmentsByCategory(entries, campaignCategory);
    const matchingData = buildDisplayEntries(matching);
    const otherDisplayData = buildDisplayEntries(other);
    const otherData = showAllRecentSegments ? otherDisplayData : [];
    const hasHiddenOther = !showAllRecentSegments && otherDisplayData.length > 0;

    removeRecentSegmentsUI();
    if (!matchingData.length && !otherData.length && !hasHiddenOther) {
      debug("render skipped — no matching segment options for stored entries", {
        storedEntries: normalizeRecentSegments(entries),
        campaignCategory,
      });
      return;
    }

    const currentId = getSelectedCombinedSegmentId();
    const container = document.createElement("div");
    container.className = `${CONTAINER_CLASS} e-field`;

    const header = document.createElement("div");
    header.className = "gem-recent-segments__header";

    const label = document.createElement("label");
    label.className = "e-field__label gem-recent-segments__label";
    label.textContent = "Recently used segments";
    header.appendChild(label);

    if (hasHiddenOther) {
      const showAllButton = document.createElement("button");
      showAllButton.type = "button";
      showAllButton.className = "gem-recent-segments__show-all";
      showAllButton.textContent = "Show All";
      showAllButton.addEventListener("click", () => {
        showAllRecentSegments = true;
        renderRecentSegmentsList(recentSegmentsCache);
      });
      header.appendChild(showAllButton);
    }

    const list = document.createElement("ul");
    list.className = "gem-recent-segments__list";
    list.setAttribute("role", "list");
    populateSegmentList(list, matchingData, currentId);

    container.appendChild(header);
    container.appendChild(list);

    if (otherData.length) {
      const otherSection = document.createElement("div");
      otherSection.className = "gem-recent-segments__other";

      const otherLabel = document.createElement("label");
      otherLabel.className = "e-field__label gem-recent-segments__label gem-recent-segments__label--other";
      otherLabel.textContent = "Other recent segments";
      otherSection.appendChild(otherLabel);

      const otherList = document.createElement("ul");
      otherList.className = "gem-recent-segments__list gem-recent-segments__list--other";
      otherList.setAttribute("role", "list");
      populateSegmentList(otherList, otherData, currentId);
      otherSection.appendChild(otherList);

      container.appendChild(otherSection);
    }

    table.appendChild(container);
    debug("render complete", {
      matchingCount: matchingData.length,
      otherCount: otherData.length,
      campaignCategory,
      showAllRecentSegments,
      currentId,
    });
  }

  function refreshRecentSegmentsUI() {
    syncCombinedSegmentTableState();
    if (!isRecentSegmentsAllowed()) {
      removeRecentSegmentsUI();
      return;
    }
    renderRecentSegmentsList(recentSegmentsCache);
  }

  function logSegmentId(segmentId) {
    const id = String(segmentId || "").trim();
    const campaignCategory = getCampaignCategoryId();
    if (!id || id === "0" || !isRecentSegmentsAllowed()) return;

    debug("logging segment id", { id, campaignCategory });
    prependRecentSegment(id, campaignCategory, refreshRecentSegmentsUI);
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
        loadRecentSegments(refreshRecentSegmentsUI);
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
        loadRecentSegments(refreshRecentSegmentsUI);
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
      loadRecentSegments(refreshRecentSegmentsUI);
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

  function bindCampaignCategoryListener() {
    const categorySelect = document.querySelector(CAMPAIGN_CATEGORY_SELECT_SELECTOR);
    if (!categorySelect || categorySelect.dataset.gemRecentSegmentsBound === "true") return;
    categorySelect.dataset.gemRecentSegmentsBound = "true";
    categorySelect.addEventListener("change", () => {
      debug("campaign_category changed", { value: getCampaignCategoryId() });
      showAllRecentSegments = false;
      if (!isRecentSegmentsAllowed()) return;
      loadRecentSegments(refreshRecentSegmentsUI);
    });
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
      bindCampaignCategoryListener();
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
      window.gemDomWatchWaitFor(CAMPAIGN_CATEGORY_SELECT_SELECTOR, start);
    }
  }

  initRecentSegments();
})();
