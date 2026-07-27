// gem-focus-layout-boot.js
// document_start: apply Focus Layout class to <html> as early as possible.
(function () {
  'use strict';

  const CLASS_NAME = 'gem-focus-layout';
  const LEGACY_CLASS = 'gem-expanded';
  const STORAGE_KEY = 'fullscreenActive';

  function getRoot() {
    return document.documentElement || null;
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
    } catch (_) {}
  }

  function setFocusLayoutActive(enabled) {
    const root = getRoot();
    if (!root) return false;
    migrateLegacyClasses(root);
    root.classList.toggle(CLASS_NAME, !!enabled);
    try {
      if (document.body) {
        document.body.classList.remove(CLASS_NAME);
        document.body.classList.remove(LEGACY_CLASS);
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
    STORAGE_KEY,
    isActive: isFocusLayoutActive,
    setActive: setFocusLayoutActive,
    migrate: migrateLegacyClasses,
  };

  function bootFromStorage() {
    try {
      chrome.storage.sync.get({ [STORAGE_KEY]: false }, (settings) => {
        if (chrome.runtime.lastError) return;
        if (settings && settings[STORAGE_KEY]) {
          setFocusLayoutActive(true);
        } else {
          migrateLegacyClasses(getRoot());
        }
      });
    } catch (_) {}
  }

  bootFromStorage();
})();
