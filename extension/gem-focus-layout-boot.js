// gem-focus-layout-boot.js
// document_start: apply Focus Layout class to <html> as early as possible.
(function () {
  'use strict';

  const CLASS_NAME = 'gem-focus-layout';
  const TYPE_CLASS_FULL = 'gem-focus-layout:full';
  const LEGACY_CLASS = 'gem-expanded';
  const STORAGE_KEY = 'fullscreenActive';
  const TYPE_STORAGE_KEY = 'gemFocusLayoutType';
  const TYPE_DEFAULT = 'full';

  let cachedType = TYPE_DEFAULT;

  function getRoot() {
    return document.documentElement || null;
  }

  function normalizeFocusLayoutType(value) {
    return value === 'normal' ? 'normal' : 'full';
  }

  function migrateLegacyClasses(root) {
    if (!root) return;
    try {
      if (root.classList.contains(LEGACY_CLASS)) {
        root.classList.remove(LEGACY_CLASS);
        root.classList.add(CLASS_NAME);
      }
    } catch (_) {}

    // One-time cleanup if an older build left the class on <body>.
    try {
      const body = document.body;
      if (!body) return;
      if (body.classList.contains(LEGACY_CLASS)) {
        body.classList.remove(LEGACY_CLASS);
      }
      if (body.classList.contains(CLASS_NAME)) {
        body.classList.remove(CLASS_NAME);
        root.classList.add(CLASS_NAME);
      }
      if (body.classList.contains(TYPE_CLASS_FULL)) {
        body.classList.remove(TYPE_CLASS_FULL);
      }
    } catch (_) {}
  }

  function syncTypeClass(root, enabled, type) {
    if (!root) return;
    const normalized = normalizeFocusLayoutType(type);
    if (enabled && normalized === 'full') {
      root.classList.add(TYPE_CLASS_FULL);
    } else {
      root.classList.remove(TYPE_CLASS_FULL);
    }
  }

  function setFocusLayoutType(type) {
    cachedType = normalizeFocusLayoutType(type);
    const root = getRoot();
    if (!root) return cachedType;
    migrateLegacyClasses(root);
    syncTypeClass(root, root.classList.contains(CLASS_NAME), cachedType);
    return cachedType;
  }

  function getFocusLayoutType() {
    return cachedType;
  }

  function setFocusLayoutActive(enabled) {
    const root = getRoot();
    if (!root) return false;
    migrateLegacyClasses(root);
    root.classList.toggle(CLASS_NAME, !!enabled);
    syncTypeClass(root, !!enabled, cachedType);
    try {
      if (document.body) {
        document.body.classList.remove(CLASS_NAME);
        document.body.classList.remove(LEGACY_CLASS);
        document.body.classList.remove(TYPE_CLASS_FULL);
      }
    } catch (_) {}
    return root.classList.contains(CLASS_NAME);
  }

  function isFocusLayoutActive() {
    try {
      const root = getRoot();
      if (root && root.classList.contains(CLASS_NAME)) return true;
      // Fallback during migration window.
      if (document.body && document.body.classList.contains(CLASS_NAME)) return true;
    } catch (_) {}
    return false;
  }

  window.gemFocusLayout = {
    CLASS_NAME,
    TYPE_CLASS_FULL,
    STORAGE_KEY,
    TYPE_STORAGE_KEY,
    TYPE_DEFAULT,
    isActive: isFocusLayoutActive,
    setActive: setFocusLayoutActive,
    getType: getFocusLayoutType,
    setType: setFocusLayoutType,
    normalizeType: normalizeFocusLayoutType,
    migrate: migrateLegacyClasses,
  };

  function bootFromStorage() {
    try {
      chrome.storage.sync.get(
        {
          [STORAGE_KEY]: false,
          [TYPE_STORAGE_KEY]: TYPE_DEFAULT,
        },
        (settings) => {
          if (chrome.runtime.lastError) return;
          cachedType = normalizeFocusLayoutType(
            settings && settings[TYPE_STORAGE_KEY]
          );
          if (settings && settings[STORAGE_KEY]) {
            setFocusLayoutActive(true);
          } else {
            const root = getRoot();
            migrateLegacyClasses(root);
            syncTypeClass(root, false, cachedType);
          }
        }
      );
    } catch (_) {}
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes) return;
      if (changes[TYPE_STORAGE_KEY]) {
        setFocusLayoutType(changes[TYPE_STORAGE_KEY].newValue);
      }
      if (changes[STORAGE_KEY]) {
        setFocusLayoutActive(!!changes[STORAGE_KEY].newValue);
      }
    });
  } catch (_) {}

  bootFromStorage();
})();
