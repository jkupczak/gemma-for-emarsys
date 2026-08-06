// focus-layout.js - Handles DOM adjustments when Focus Layout is active
console.log('[Gem][FocusLayout] focus-layout.js loaded');

function getHeaderTitle() {
  return document.querySelector('h1.e-layout__title');
}

function ensureCampaignMenuColumnsWrapped(menu) {
  if (!menu) return null;
  try {
    let columns = menu.querySelector(':scope > .gem-campaign-menu-columns');
    if (columns) return columns;

    const existingColumns = Array.from(
      menu.querySelectorAll(':scope > .gem-compact-email-tools-menu-column')
    );
    if (!existingColumns.length) return null;

    columns = document.createElement('div');
    columns.className = 'gem-campaign-menu-columns';
    menu.insertBefore(columns, existingColumns[0]);
    existingColumns.forEach((col) => columns.appendChild(col));
    return columns;
  } catch (_) {
    return null;
  }
}

function placeHeaderTitleInCampaignMenu(headerTitle) {
  if (!headerTitle) return false;
  const menu = document.querySelector('.gem-campaign-menu');
  if (!menu) return false;

  const columns = ensureCampaignMenuColumnsWrapped(menu);
  if (
    headerTitle.parentElement === menu &&
    columns &&
    headerTitle.nextElementSibling === columns
  ) {
    return true;
  }

  if (columns) {
    menu.insertBefore(headerTitle, columns);
  } else {
    menu.insertBefore(headerTitle, menu.firstChild);
  }
  return true;
}

function ensureHeaderTitleInCampaignMenu(headerTitle) {
  if (!headerTitle || !isFocusLayoutActive()) return;
  if (placeHeaderTitleInCampaignMenu(headerTitle)) return;

  waitForElement('.gem-campaign-menu', () => {
    const title = getHeaderTitle();
    if (title && isFocusLayoutActive()) {
      placeHeaderTitleInCampaignMenu(title);
    }
  });
}

function getCompactVersionsInsertPoint(navSection) {
  if (!navSection) return null;
  const compactTools = navSection.querySelector('.gem-compact-email-tools');
  if (compactTools) return compactTools.nextSibling;
  return navSection.firstChild;
}

function ensureCompactVersionsPosition(navSection, compactVersionsDiv) {
  if (!navSection || !compactVersionsDiv || !navSection.contains(compactVersionsDiv)) return;
  const compactTools = navSection.querySelector('.gem-compact-email-tools');
  if (compactTools && compactVersionsDiv.previousElementSibling === compactTools) return;
  navSection.insertBefore(compactVersionsDiv, getCompactVersionsInsertPoint(navSection));
}

function initializeFocusLayout() {
  console.log('[Gem][FocusLayout] Initializing Focus Layout functionality');

  // Wait for the navigation section to appear
  waitForElement('.e-contentblocks-navigation_section', (navSection) => {
    console.log('[Gem][FocusLayout] Content blocks navigation section found, setting up Focus Layout');

    // Create the compact versions div
    const compactVersionsDiv = document.createElement('div');
    compactVersionsDiv.className = 'gem-compact-email-versions';
    compactVersionsDiv.style.display = 'none';

    // Check for header title and move it to navigation section (only in Focus Layout)
    const headerTitle = getHeaderTitle();
    const isFocusLayout = isFocusLayoutActive();

    // Handle header title movement (only when expanded)
    if (headerTitle && navSection && isFocusLayout) {
      const existingTitlePlaceholder = document.querySelector('[data-gem-header-title-placeholder]');

      if (!existingTitlePlaceholder) {
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.setAttribute('data-gem-header-title-placeholder', 'true');

        headerTitle.parentNode.insertBefore(placeholder, headerTitle);
        headerTitle.remove();
        ensureHeaderTitleInCampaignMenu(headerTitle);

        console.log('[Gem][FocusLayout] Moved header title into campaign menu (Focus Layout)');
      } else if (!document.querySelector('.gem-campaign-menu')?.contains(headerTitle)) {
        ensureHeaderTitleInCampaignMenu(headerTitle);
        console.log('[Gem][FocusLayout] Re-attached header title to campaign menu');
      } else {
        ensureHeaderTitleInCampaignMenu(headerTitle);
      }
    }

    // Check for version selector and multilanguage locale selector and move them to our compact area (only in Focus Layout)
    const versionSelector = document.querySelector('cb-version-selector');
    const localeSelector = document.querySelector('cb-multilanguage-locale-selector');

    // Handle version selector (should be first child)
    if (versionSelector) {
      if (isFocusLayout) {
        // In Focus Layout, move to compact area as first child
        const existingVersionPlaceholder = document.querySelector('[data-gem-version-selector-placeholder]');

        if (!existingVersionPlaceholder) {
          // Create a placeholder to maintain layout
          const placeholder = document.createElement('div');
          placeholder.style.display = 'none';
          placeholder.setAttribute('data-gem-version-selector-placeholder', 'true');

          // Replace original with placeholder, move original to compact area as first child
          versionSelector.parentNode.insertBefore(placeholder, versionSelector);
          versionSelector.remove();
          compactVersionsDiv.insertBefore(versionSelector, compactVersionsDiv.firstChild);

          console.log('[Gem][FocusLayout] Moved version selector to compact versions (Focus Layout)');
        } else {
          // Element is already moved, just make sure it's the first child
          if (!compactVersionsDiv.contains(versionSelector)) {
            compactVersionsDiv.insertBefore(versionSelector, compactVersionsDiv.firstChild);
            console.log('[Gem][FocusLayout] Re-attached version selector to compact versions as first child');
          }
        }

        // Show the compact versions div since we have content
        compactVersionsDiv.style.display = 'block';
      } else {
        // In normal view, ensure it's in its original location
        const placeholder = document.querySelector('[data-gem-version-selector-placeholder]');
        if (placeholder && compactVersionsDiv.contains(versionSelector)) {
          // Move back to original location
          placeholder.parentNode.insertBefore(versionSelector, placeholder);
          placeholder.remove();
          console.log('[Gem][FocusLayout] Moved version selector back to original location (normal view)');
        }
      }
    }

    // Handle multilanguage locale selector (should be after version selector)
    if (localeSelector) {
      if (isFocusLayout) {
        // In Focus Layout, move to compact area
        const existingPlaceholder = document.querySelector('[data-gem-locale-selector-placeholder]');

        if (!existingPlaceholder) {
          // Create a placeholder to maintain layout
          const placeholder = document.createElement('div');
          placeholder.style.display = 'none';
          placeholder.setAttribute('data-gem-locale-selector-placeholder', 'true');

          // Replace original with placeholder, move original to compact area
          localeSelector.parentNode.insertBefore(placeholder, localeSelector);
          localeSelector.remove();
          compactVersionsDiv.appendChild(localeSelector);

          console.log('[Gem][FocusLayout] Moved multilanguage locale selector to compact versions (Focus Layout)');
        } else {
          // Element is already moved, just make sure it's in the right place
          if (!compactVersionsDiv.contains(localeSelector)) {
            compactVersionsDiv.appendChild(localeSelector);
            console.log('[Gem][FocusLayout] Re-attached multilanguage locale selector to compact versions');
          }
        }

        // Show the compact versions div since we have content
        compactVersionsDiv.style.display = 'block';
      } else {
        // In normal view, ensure it's in its original location
        const placeholder = document.querySelector('[data-gem-locale-selector-placeholder]');
        if (placeholder && compactVersionsDiv.contains(localeSelector)) {
          // Move back to original location
          placeholder.parentNode.insertBefore(localeSelector, placeholder);
          placeholder.remove();
          console.log('[Gem][FocusLayout] Moved multilanguage locale selector back to original location (normal view)');
        }
      }
    }

    // Update active class based on initial conditions
    updateCompactVersionsActiveState(compactVersionsDiv, isFocusLayout);

    // Hide compact versions div if no content in normal view
    if (!isFocusLayout && !compactVersionsDiv.hasChildNodes()) {
      compactVersionsDiv.style.display = 'none';
    }

    if (!navSection.contains(compactVersionsDiv)) {
      navSection.insertBefore(compactVersionsDiv, getCompactVersionsInsertPoint(navSection));
    } else {
      ensureCompactVersionsPosition(navSection, compactVersionsDiv);
    }

    // Set up observers for view changes and selector visibility
    setupFocusLayoutObserver(compactVersionsDiv);
    setupLanguagesSelectorObserver(compactVersionsDiv);
    setupSideNavigationFocusAttrObserver();
    syncSideNavigationFocusAttr(isFocusLayout);

    initializeNavPanelResize(navSection);

    console.log('[Gem][FocusLayout] Focus Layout functionality initialized successfully');
  });
}

function moveSelectorsBasedOnView(compactVersionsDiv, isFocusLayout) {
  const headerTitle = getHeaderTitle();
  const navSection = document.querySelector('main .e-contentblocks-navigation_section');
  const versionSelector = document.querySelector('cb-version-selector');
  const localeSelector = document.querySelector('cb-multilanguage-locale-selector');

  // Handle header title
  if (headerTitle && navSection) {
    if (isFocusLayout) {
      const existingPlaceholder = document.querySelector('[data-gem-header-title-placeholder]');

      if (!existingPlaceholder) {
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.setAttribute('data-gem-header-title-placeholder', 'true');

        headerTitle.parentNode.insertBefore(placeholder, headerTitle);
        headerTitle.remove();
        ensureHeaderTitleInCampaignMenu(headerTitle);

        console.log('[Gem][FocusLayout] Moved header title into campaign menu (view change)');
      }

      ensureHeaderTitleInCampaignMenu(headerTitle);
    } else {
      // Move back to original location
      const placeholder = document.querySelector('[data-gem-header-title-placeholder]');
      if (placeholder) {
        // Check if h1 is not in its original location (not immediately before the placeholder)
        if (headerTitle.nextSibling !== placeholder) {
          // Move back to original location
          placeholder.parentNode.insertBefore(headerTitle, placeholder);
          placeholder.remove();
          console.log('[Gem][FocusLayout] Moved header title back to original location (view change)');
        }
      }
    }
  }

  // Handle version selector (should be first child)
  if (versionSelector) {
    if (isFocusLayout) {
      // Move to compact area as first child
      const existingPlaceholder = document.querySelector('[data-gem-version-selector-placeholder]');

      if (!existingPlaceholder) {
        // Create a placeholder to maintain layout
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.setAttribute('data-gem-version-selector-placeholder', 'true');

        // Replace original with placeholder
        versionSelector.parentNode.insertBefore(placeholder, versionSelector);
        versionSelector.remove();
        compactVersionsDiv.insertBefore(versionSelector, compactVersionsDiv.firstChild);

        console.log('[Gem][FocusLayout] Moved version selector to compact versions (view change)');
      }

      // Show the compact versions div
      compactVersionsDiv.style.display = 'block';
    } else {
      // Move back to original location
      const placeholder = document.querySelector('[data-gem-version-selector-placeholder]');
      if (placeholder && compactVersionsDiv.contains(versionSelector)) {
        // Move back to original location
        placeholder.parentNode.insertBefore(versionSelector, placeholder);
        placeholder.remove();
        console.log('[Gem][FocusLayout] Moved version selector back to original location (view change)');
      }
    }
  }

  // Handle multilanguage locale selector
  if (localeSelector) {
    if (isFocusLayout) {
      // Move to compact area
      const existingPlaceholder = document.querySelector('[data-gem-locale-selector-placeholder]');

      if (!existingPlaceholder) {
        // Create a placeholder to maintain layout
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.setAttribute('data-gem-locale-selector-placeholder', 'true');

        // Replace original with placeholder
        localeSelector.parentNode.insertBefore(placeholder, localeSelector);
        localeSelector.remove();
        compactVersionsDiv.appendChild(localeSelector);

        console.log('[Gem][FocusLayout] Moved multilanguage locale selector to compact versions (view change)');
      }

      // Show the compact versions div
      compactVersionsDiv.style.display = 'block';
    } else {
      // Move back to original location
      const placeholder = document.querySelector('[data-gem-locale-selector-placeholder]');
      if (placeholder && compactVersionsDiv.contains(localeSelector)) {
        // Move back to original location
        placeholder.parentNode.insertBefore(localeSelector, placeholder);
        placeholder.remove();
        console.log('[Gem][FocusLayout] Moved multilanguage locale selector back to original location (view change)');
      }
    }
  }

  // Update active class based on conditions
  updateCompactVersionsActiveState(compactVersionsDiv, isFocusLayout);

  // Hide compact versions div if no content in normal view
  if (!isFocusLayout && !compactVersionsDiv.hasChildNodes()) {
    compactVersionsDiv.style.display = 'none';
  }

  if (isFocusLayout && navSection) {
    ensureCompactVersionsPosition(navSection, compactVersionsDiv);
  }
}

function setupFocusLayoutObserver(compactVersionsDiv) {
  console.log('[Gem][FocusLayout] Setting up Focus Layout observer for locale selector');

  const root = document.documentElement;
  if (!root) return;

  // Watch for changes to the <html> class (Focus Layout lives on documentElement).
  if (typeof gemDomWatchObserveAttributes === 'function') {
    gemDomWatchObserveAttributes(root, (mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const wasFocusLayout = mutation.oldValue && mutation.oldValue.includes('gem-focus-layout');
          const isFocusLayout = root.classList.contains('gem-focus-layout');

          if (wasFocusLayout !== isFocusLayout) {
            console.log(`[Gem][FocusLayout] Focus Layout changed: ${wasFocusLayout} -> ${isFocusLayout}`);
            moveSelectorsBasedOnView(compactVersionsDiv, isFocusLayout);
            onNavPanelLayoutChanged();
          }
        }
      });
    }, ['class']);
  } else {
    const rootObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const wasFocusLayout = mutation.oldValue && mutation.oldValue.includes('gem-focus-layout');
          const isFocusLayout = root.classList.contains('gem-focus-layout');

          if (wasFocusLayout !== isFocusLayout) {
            console.log(`[Gem][FocusLayout] Focus Layout changed: ${wasFocusLayout} -> ${isFocusLayout}`);
            moveSelectorsBasedOnView(compactVersionsDiv, isFocusLayout);
            onNavPanelLayoutChanged();
          }
        }
      });
    });

    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true
    });
  }

  console.log('[Gem][FocusLayout] Focus Layout observer set up');
}

function setupLanguagesSelectorObserver(compactVersionsDiv) {
  console.log('[Gem][FocusLayout] Setting up languages selector observer');

  // Watch for changes to vce-languages-selector class
  const languagesObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const isFocusLayout = isFocusLayoutActive();
        updateCompactVersionsActiveState(compactVersionsDiv, isFocusLayout);
      }
    });
  });

  // Also watch for vce-languages-selector being added/removed from DOM
  const handleLanguagesSelectorDomChange = (mutations) => {
    let needsUpdate = false;
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.matches && node.matches('vce-languages-selector') ||
               node.querySelector && node.querySelector('vce-languages-selector'))) {
            needsUpdate = true;
          }
        });
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.matches && node.matches('vce-languages-selector') ||
               node.querySelector && node.querySelector('vce-languages-selector'))) {
            needsUpdate = true;
          }
        });
      }
    });

    if (needsUpdate) {
      const isFocusLayout = isFocusLayoutActive();
      updateCompactVersionsActiveState(compactVersionsDiv, isFocusLayout);
    }
  };

  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe(handleLanguagesSelectorDomChange);
  } else {
    const containerObserver = new MutationObserver(handleLanguagesSelectorDomChange);
    containerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  const languagesSelector = document.querySelector('vce-languages-selector');
  if (languagesSelector) {
    languagesObserver.observe(languagesSelector, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  console.log('[Gem][FocusLayout] Languages selector observer set up');
}

function updateCompactVersionsActiveState(compactVersionsDiv, isFocusLayout) {
  const languagesSelector = document.querySelector('vce-languages-selector');
  const versionSelector = document.querySelector('cb-version-selector');

  // Check conditions for active class
  const shouldBeActive = isFocusLayout && (
    (languagesSelector && !languagesSelector.classList.contains('e-hidden')) ||
    versionSelector
  );

  if (shouldBeActive) {
    compactVersionsDiv.classList.add('active');
    console.log('[Gem][FocusLayout] Added active class to compact versions');
  } else {
    compactVersionsDiv.classList.remove('active');
    console.log('[Gem][FocusLayout] Removed active class from compact versions');
  }
}

const NAV_PANEL_STORAGE_KEY = 'gemNavPanelWidth';
const NAV_PANEL_REFERENCE_VIEWPORT_KEY = 'gemNavPanelReferenceViewport';
const NAV_LAYOUT_WIDTH_OFFSET = 24;
const NAV_STANDARD_DEFAULT = 530;
const NAV_STANDARD_MIN = 500;
const NAV_STANDARD_MAX = 996;
const NAV_FOCUS_MIN = 500;
const NAV_FOCUS_MAX = 1020;
// Focus display = stored + offset, so stored must be allowed below STANDARD_MIN
// or Focus Layout cannot shrink to NAV_FOCUS_MIN (510+24 was locking at 534).
const NAV_STORED_MIN = NAV_FOCUS_MIN - NAV_LAYOUT_WIDTH_OFFSET;
const NAV_PANEL_RESIZE_DEBOUNCE_MS = 100;

const NAV_RESIZABLE_TAB_SELECTORS = [
  'cb-campaign-variables',
  'gem-snippets',
  'gem-preflight',
  'cb-email-basics-tab',
  'cb-versions',
  'cb-locales-tab',
  'cb-custom-tab',
  'cb-campaign-latest-media',
  'cb-available-block-list',
];

let storedNavPanelStandardWidth = NAV_STANDARD_DEFAULT;
let storedNavPanelReferenceViewport = 0;
let navPanelResizeInitialized = false;
let navPanelNavSection = null;

function clampNavStoredWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NAV_STANDARD_DEFAULT;
  return Math.min(Math.max(Math.round(n), NAV_STORED_MIN), NAV_STANDARD_MAX);
}

function clampNavStandardWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NAV_STANDARD_DEFAULT;
  return Math.min(Math.max(Math.round(n), NAV_STANDARD_MIN), NAV_STANDARD_MAX);
}

function isFocusLayoutActive() {
  if (window.gemFocusLayout && typeof window.gemFocusLayout.isActive === 'function') {
    return !!window.gemFocusLayout.isActive();
  }
  return !!(document.documentElement && document.documentElement.classList.contains('gem-focus-layout'));
}

/**
 * New Emarsys UI5 nav (<e-side-navigation>) needs `collapsed` while Focus
 * Layout is active. Do not touch the attribute when leaving Focus Layout /
 * loading in Standard — leave Emarsys's own collapsed state alone.
 */
function syncSideNavigationFocusAttr(isFocusLayout = isFocusLayoutActive()) {
  if (!isFocusLayout) return;
  try {
    document.querySelectorAll('e-side-navigation').forEach((el) => {
      if (!el.hasAttribute('collapsed')) {
        el.setAttribute('collapsed', '');
      }
    });
  } catch (_) {}
}

function setupSideNavigationFocusAttrObserver() {
  if (window._gemSideNavFocusAttrObserved) return;
  window._gemSideNavFocusAttrObserved = true;

  const scanNode = (node) => {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.matches?.('e-side-navigation')) return true;
      return !!node.querySelector?.('e-side-navigation');
    } catch (_) {
      return false;
    }
  };

  const maybeSync = (mutations) => {
    if (!mutations.some((m) => [...m.addedNodes].some(scanNode))) return;
    syncSideNavigationFocusAttr();
  };

  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe(maybeSync);
  }
}

function getNavPanelDisplayLimits(expanded) {
  if (expanded) {
    return { min: NAV_FOCUS_MIN, max: NAV_FOCUS_MAX };
  }
  return { min: NAV_STANDARD_MIN, max: NAV_STANDARD_MAX };
}

function getNavPanelDisplayWidth(storedStandardWidth, expanded) {
  const stored = clampNavStoredWidth(storedStandardWidth);
  const display = expanded ? stored + NAV_LAYOUT_WIDTH_OFFSET : stored;
  const limits = getNavPanelDisplayLimits(expanded);
  return Math.min(Math.max(display, limits.min), limits.max);
}

function toStoredNavPanelWidth(displayWidth, expanded) {
  const limits = getNavPanelDisplayLimits(expanded);
  const clampedDisplay = Math.min(Math.max(Math.round(displayWidth), limits.min), limits.max);
  const stored = expanded ? clampedDisplay - NAV_LAYOUT_WIDTH_OFFSET : clampedDisplay;
  return clampNavStoredWidth(stored);
}

function getNavPanelMainRow(navSection) {
  return navSection?.closest('main.e-layout__content') ?? null;
}

function isNavPanelLayoutChildVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getNavPanelViewportBudget(navSection) {
  const main = getNavPanelMainRow(navSection);
  if (!main) return NAV_FOCUS_MAX;

  let budget = main.clientWidth;

  const mobile = document.getElementById('gem-mobile-frame');
  if (mobile && isNavPanelLayoutChildVisible(mobile)) {
    budget -= mobile.offsetWidth;
  }

  const children = [...main.children].filter(isNavPanelLayoutChildVisible);
  const gap = parseFloat(getComputedStyle(main).columnGap || getComputedStyle(main).gap) || 10;
  if (children.length > 1) {
    budget -= gap * (children.length - 1);
  }

  return Math.max(0, budget);
}

function resolveNavPanelAppliedWidths(storedStandard, navSection) {
  const expanded = isFocusLayoutActive();
  const preferredDisplay = getNavPanelDisplayWidth(storedStandard, expanded);
  const limits = getNavPanelDisplayLimits(expanded);

  const main = getNavPanelMainRow(navSection);
  const currentMainWidth = main?.clientWidth ?? window.innerWidth;
  const referenceWidth =
    storedNavPanelReferenceViewport > 0 ? storedNavPanelReferenceViewport : currentMainWidth;

  const ratio = referenceWidth > 0 ? currentMainWidth / referenceWidth : 1;
  const budget = getNavPanelViewportBudget(navSection);

  let scaledDisplay = Math.round(preferredDisplay * ratio);
  scaledDisplay = Math.min(scaledDisplay, budget, limits.max);
  scaledDisplay = Math.max(scaledDisplay, limits.min);

  const appliedStored = expanded
    ? clampNavStoredWidth(scaledDisplay - NAV_LAYOUT_WIDTH_OFFSET)
    : clampNavStoredWidth(scaledDisplay);
  const appliedStandard = clampNavStandardWidth(appliedStored);
  const appliedFocus = Math.min(
    Math.max(appliedStored + NAV_LAYOUT_WIDTH_OFFSET, NAV_FOCUS_MIN),
    NAV_FOCUS_MAX
  );

  return { standard: appliedStandard, focus: appliedFocus };
}

function getNavPanelAppliedDisplayWidth(navSection) {
  const { standard, focus } = resolveNavPanelAppliedWidths(storedNavPanelStandardWidth, navSection);
  return isFocusLayoutActive() ? focus : standard;
}

function applyNavPanelWidth(storedStandardWidth, options = {}) {
  const stored = clampNavStoredWidth(storedStandardWidth);
  storedNavPanelStandardWidth = stored;
  const root = document.documentElement;
  if (!root) return;

  let standard;
  let focus;
  if (options.skipViewportScale) {
    standard = clampNavStandardWidth(stored);
    focus = Math.min(
      Math.max(stored + NAV_LAYOUT_WIDTH_OFFSET, NAV_FOCUS_MIN),
      NAV_FOCUS_MAX
    );
  } else {
    ({ standard, focus } = resolveNavPanelAppliedWidths(stored, navPanelNavSection));
  }

  root.style.setProperty('--gem-nav-width', `${standard}px`);
  root.style.setProperty('--gem-focus-nav-width', `${focus}px`);
}

function loadNavPanelWidth(callback) {
  if (!chrome?.storage?.local) {
    applyNavPanelWidth(NAV_STANDARD_DEFAULT);
    if (callback) callback(storedNavPanelStandardWidth);
    return;
  }
  chrome.storage.local.get(
    {
      [NAV_PANEL_STORAGE_KEY]: NAV_STANDARD_DEFAULT,
      [NAV_PANEL_REFERENCE_VIEWPORT_KEY]: 0,
    },
    (res) => {
      storedNavPanelReferenceViewport = Number(res[NAV_PANEL_REFERENCE_VIEWPORT_KEY]) || 0;
      applyNavPanelWidth(res[NAV_PANEL_STORAGE_KEY]);
      if (callback) callback(storedNavPanelStandardWidth);
    }
  );
}

function saveNavPanelWidth(storedStandardWidth) {
  const stored = clampNavStoredWidth(storedStandardWidth);
  storedNavPanelStandardWidth = stored;

  const main = getNavPanelMainRow(navPanelNavSection);
  const referenceWidth = main?.clientWidth ?? window.innerWidth;
  storedNavPanelReferenceViewport = referenceWidth;

  applyNavPanelWidth(stored);
  if (chrome?.storage?.local) {
    chrome.storage.local.set({
      [NAV_PANEL_STORAGE_KEY]: stored,
      [NAV_PANEL_REFERENCE_VIEWPORT_KEY]: referenceWidth,
    });
  }
}

function isNavPanelResizable(navSection) {
  if (!navSection) return false;
  const content = navSection.querySelector('.e-verticalnav__content');
  if (!content) return false;
  return NAV_RESIZABLE_TAB_SELECTORS.some((selector) => content.querySelector(selector));
}

function syncNavPanelHandle(navSection) {
  if (!navSection) return;
  const handle = navSection.querySelector('#gem-nav-handle');
  const resizable = isNavPanelResizable(navSection);
  if (!resizable) {
    if (handle) handle.style.display = 'none';
    return;
  }
  if (handle) {
    handle.style.display = '';
  }
}

function onNavPanelLayoutChanged() {
  applyNavPanelWidth(storedNavPanelStandardWidth);
  syncNavPanelHandle(navPanelNavSection);
  syncSideNavigationFocusAttr();
}

function ensureNavResizeHandle(navSection) {
  if (!navSection || navSection.querySelector('#gem-nav-handle')) return;

  const handle = document.createElement('div');
  handle.id = 'gem-nav-handle';
  handle.className = 'gem-resize-handle';

  let dragging = false;
  let startX = 0;
  let startDisplayWidth = NAV_STANDARD_DEFAULT;
  let prevCursor = '';
  let sizeDetailsTimeout = null;

  const getCurrentDisplayWidth = () =>
    getNavPanelDisplayWidth(storedNavPanelStandardWidth, isFocusLayoutActive());

  const onMouseMove = (e) => {
    if (!dragging) return;
    const expanded = isFocusLayoutActive();
    const deltaX = e.clientX - startX;
    const limits = getNavPanelDisplayLimits(expanded);
    const budget = getNavPanelViewportBudget(navSection);
    let nextDisplayWidth = startDisplayWidth + deltaX;
    nextDisplayWidth = Math.min(nextDisplayWidth, limits.max, budget);
    nextDisplayWidth = Math.max(nextDisplayWidth, limits.min);
    applyNavPanelWidth(toStoredNavPanelWidth(nextDisplayWidth, expanded), {
      skipViewportScale: true,
    });

    const sizeDetails = navSection.querySelector('.gem-nav-size-details');
    if (sizeDetails) {
      const widthDiv = sizeDetails.children[0];
      if (widthDiv) {
        widthDiv.innerHTML = `<label>Width</label>${nextDisplayWidth}px`;
      }
    }
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = prevCursor;
    handle.classList.remove('gem-resize-handle--active');

    const overlay = document.getElementById('gem-nav-resize-overlay');
    if (overlay) overlay.remove();

    const expanded = isFocusLayoutActive();
    const displayWidth = getCurrentDisplayWidth();
    saveNavPanelWidth(toStoredNavPanelWidth(displayWidth, expanded));

    const sizeDetails = navSection.querySelector('.gem-nav-size-details');
    if (sizeDetails) {
      sizeDetailsTimeout = setTimeout(() => {
        sizeDetails.classList.add('gem-frame-size-details--fade-out');
        setTimeout(() => {
          if (sizeDetails.parentNode) sizeDetails.remove();
          sizeDetailsTimeout = null;
        }, 500);
      }, 3000);
    }
  };

  handle.addEventListener('mousedown', (e) => {
    if (!isNavPanelResizable(navSection)) return;
    e.preventDefault();
    startX = e.clientX;
    startDisplayWidth = getNavPanelAppliedDisplayWidth(navSection);
    prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    handle.classList.add('gem-resize-handle--active');

    if (sizeDetailsTimeout) {
      clearTimeout(sizeDetailsTimeout);
      sizeDetailsTimeout = null;
    }
    navSection.querySelectorAll('.gem-nav-size-details').forEach((el) => el.remove());

    const sizeDetails = document.createElement('div');
    sizeDetails.className = 'gem-frame-size-details gem-nav-size-details';
    sizeDetails.innerHTML = `
      <div class="gem-frame-size-details-item">
        <label>Width</label>
        ${startDisplayWidth}px
      </div>
    `;
    Object.assign(sizeDetails.style, {
      position: 'absolute',
      zIndex: '9999',
      left: '0',
      right: '0',
      bottom: '24px',
      margin: 'auto',
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'fit-content',
      maxWidth: '100%',
      padding: '6px 12px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      boxShadow: '0 8px 25px rgba(102, 126, 234, 0.3)',
      color: 'var(--token-button-highlight-text)',
      borderRadius: '999px',
      fontWeight: 'bold',
      fontSize: '18px',
    });
    navSection.appendChild(sizeDetails);

    const overlay = document.createElement('div');
    overlay.id = 'gem-nav-resize-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'transparent',
      zIndex: '999999',
      cursor: 'col-resize',
    });
    document.body.appendChild(overlay);

    dragging = true;
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
  });

  navSection.appendChild(handle);
}

function setupNavPanelTabObserver(navSection) {
  const content = navSection?.querySelector('.e-verticalnav__content');
  if (!content || content._gemNavPanelTabObserver) return;

  const observer = new MutationObserver(() => {
    syncNavPanelHandle(navSection);
  });
  observer.observe(content, { childList: true, subtree: true });
  content._gemNavPanelTabObserver = observer;
}

function setupNavPanelStorageSync() {
  if (!chrome?.storage?.onChanged || window._gemNavPanelStorageSync) return;
  window._gemNavPanelStorageSync = true;
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let needsApply = false;
      if (changes[NAV_PANEL_REFERENCE_VIEWPORT_KEY]) {
        storedNavPanelReferenceViewport =
          Number(changes[NAV_PANEL_REFERENCE_VIEWPORT_KEY].newValue) || 0;
        needsApply = true;
      }
      if (changes[NAV_PANEL_STORAGE_KEY]) {
        storedNavPanelStandardWidth = clampNavStandardWidth(
          changes[NAV_PANEL_STORAGE_KEY].newValue
        );
        needsApply = true;
      }
      if (needsApply) {
        applyNavPanelWidth(storedNavPanelStandardWidth);
        syncNavPanelHandle(navPanelNavSection);
      }
    }
    if (namespace === 'sync' && changes.mobilePreviewWidth) {
      applyNavPanelWidth(storedNavPanelStandardWidth);
    }
  });
}

function setupNavPanelViewportResizeListener() {
  if (window._gemNavPanelViewportResizeListener) return;
  window._gemNavPanelViewportResizeListener = true;
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyNavPanelWidth(storedNavPanelStandardWidth);
    }, NAV_PANEL_RESIZE_DEBOUNCE_MS);
  });
}

function initializeNavPanelResize(navSection) {
  if (!navSection || navPanelResizeInitialized) return;
  navPanelResizeInitialized = true;
  navPanelNavSection = navSection;

  setupNavPanelStorageSync();
  setupNavPanelViewportResizeListener();
  ensureNavResizeHandle(navSection);
  setupNavPanelTabObserver(navSection);

  loadNavPanelWidth(() => {
    syncNavPanelHandle(navSection);
  });
}


window.gemSyncFocusLayoutCampaignMenuTitle = function gemSyncFocusLayoutCampaignMenuTitle() {
  if (!isFocusLayoutActive()) return;
  const headerTitle = getHeaderTitle();
  if (!headerTitle) return;

  const existingPlaceholder = document.querySelector('[data-gem-header-title-placeholder]');
  if (!existingPlaceholder && headerTitle.parentNode) {
    const placeholder = document.createElement('div');
    placeholder.style.display = 'none';
    placeholder.setAttribute('data-gem-header-title-placeholder', 'true');
    headerTitle.parentNode.insertBefore(placeholder, headerTitle);
  }

  ensureHeaderTitleInCampaignMenu(headerTitle);
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFocusLayout);
} else {
  initializeFocusLayout();
}