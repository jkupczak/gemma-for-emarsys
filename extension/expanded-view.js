// expanded-view.js - Handles repositioning of elements in expanded view view
console.log('[Gem-Expanded-View] expanded-view.js loaded');

function getHeaderTitle() {
  return document.querySelector('h1.e-layout__title');
}

function placeHeaderTitleAfterCompactTools(navSection, headerTitle) {
  if (!navSection || !headerTitle) return;
  const compactTools = navSection.querySelector('.gem-compact-email-tools');
  if (compactTools) {
    navSection.insertBefore(headerTitle, compactTools.nextSibling);
  } else {
    navSection.insertBefore(headerTitle, navSection.firstChild);
  }
}

function ensureHeaderTitleAfterCompactTools(navSection, headerTitle) {
  if (!navSection || !headerTitle || !navSection.contains(headerTitle)) return;
  const compactTools = navSection.querySelector('.gem-compact-email-tools');
  if (compactTools && headerTitle.previousElementSibling === compactTools) return;
  placeHeaderTitleAfterCompactTools(navSection, headerTitle);
}

function getCompactVersionsInsertPoint(navSection) {
  if (!navSection) return null;
  const headerTitle = navSection.querySelector('h1.e-layout__title');
  if (headerTitle) return headerTitle.nextSibling;
  const compactTools = navSection.querySelector('.gem-compact-email-tools');
  if (compactTools) return compactTools.nextSibling;
  return navSection.firstChild;
}

function ensureCompactVersionsPosition(navSection, compactVersionsDiv) {
  if (!navSection || !compactVersionsDiv || !navSection.contains(compactVersionsDiv)) return;
  const anchor =
    navSection.querySelector('h1.e-layout__title') ||
    navSection.querySelector('.gem-compact-email-tools');
  if (anchor && compactVersionsDiv.previousElementSibling === anchor) return;
  navSection.insertBefore(compactVersionsDiv, getCompactVersionsInsertPoint(navSection));
}

function initializeExpandedView() {
  console.log('[Gem-Expanded-View] Initializing expanded view functionality');

  // Wait for the navigation section to appear
  waitForElement('.e-contentblocks-navigation_section', (navSection) => {
    console.log('[Gem-Expanded-View] Content blocks navigation section found, setting up expanded view');

    // Create the compact versions div
    const compactVersionsDiv = document.createElement('div');
    compactVersionsDiv.className = 'gem-compact-email-versions';
    compactVersionsDiv.style.display = 'none';

    // Check for header title and move it to navigation section (only in expanded view)
    const headerTitle = getHeaderTitle();
    const isExpandedView = document.body.classList.contains('gem-expanded');

    // Handle header title movement (only when expanded)
    if (headerTitle && navSection && isExpandedView) {
      const existingTitlePlaceholder = document.querySelector('[data-gem-header-title-placeholder]');

      if (!existingTitlePlaceholder) {
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.setAttribute('data-gem-header-title-placeholder', 'true');

        headerTitle.parentNode.insertBefore(placeholder, headerTitle);
        headerTitle.remove();
        placeHeaderTitleAfterCompactTools(navSection, headerTitle);

        console.log('[Gem-Expanded-View] Moved header title to navigation section (expanded view)');
      } else if (!navSection.contains(headerTitle)) {
        placeHeaderTitleAfterCompactTools(navSection, headerTitle);
        console.log('[Gem-Expanded-View] Re-attached header title to navigation section');
      } else {
        ensureHeaderTitleAfterCompactTools(navSection, headerTitle);
      }
    }

    // Check for version selector and multilanguage locale selector and move them to our compact area (only in expanded view)
    const versionSelector = document.querySelector('cb-version-selector');
    const localeSelector = document.querySelector('cb-multilanguage-locale-selector');

    // Handle version selector (should be first child)
    if (versionSelector) {
      if (isExpandedView) {
        // In expanded view, move to compact area as first child
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

          console.log('[Gem-Expanded-View] Moved version selector to compact versions (expanded view)');
        } else {
          // Element is already moved, just make sure it's the first child
          if (!compactVersionsDiv.contains(versionSelector)) {
            compactVersionsDiv.insertBefore(versionSelector, compactVersionsDiv.firstChild);
            console.log('[Gem-Expanded-View] Re-attached version selector to compact versions as first child');
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
          console.log('[Gem-Expanded-View] Moved version selector back to original location (normal view)');
        }
      }
    }

    // Handle multilanguage locale selector (should be after version selector)
    if (localeSelector) {
      if (isExpandedView) {
        // In expanded view, move to compact area
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

          console.log('[Gem-Expanded-View] Moved multilanguage locale selector to compact versions (expanded view)');
        } else {
          // Element is already moved, just make sure it's in the right place
          if (!compactVersionsDiv.contains(localeSelector)) {
            compactVersionsDiv.appendChild(localeSelector);
            console.log('[Gem-Expanded-View] Re-attached multilanguage locale selector to compact versions');
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
          console.log('[Gem-Expanded-View] Moved multilanguage locale selector back to original location (normal view)');
        }
      }
    }

    // Update active class based on initial conditions
    updateCompactVersionsActiveState(compactVersionsDiv, isExpandedView);

    // Hide compact versions div if no content in normal view
    if (!isExpandedView && !compactVersionsDiv.hasChildNodes()) {
      compactVersionsDiv.style.display = 'none';
    }

    if (!navSection.contains(compactVersionsDiv)) {
      navSection.insertBefore(compactVersionsDiv, getCompactVersionsInsertPoint(navSection));
    } else {
      ensureCompactVersionsPosition(navSection, compactVersionsDiv);
    }

    // Set up observers for view changes and selector visibility
    setupExpandedViewObserver(compactVersionsDiv);
    setupLanguagesSelectorObserver(compactVersionsDiv);

    console.log('[Gem-Expanded-View] Expanded view functionality initialized successfully');
  });
}

function moveSelectorsBasedOnView(compactVersionsDiv, isExpanded) {
  const headerTitle = getHeaderTitle();
  const navSection = document.querySelector('main .e-contentblocks-navigation_section');
  const versionSelector = document.querySelector('cb-version-selector');
  const localeSelector = document.querySelector('cb-multilanguage-locale-selector');

  // Handle header title
  if (headerTitle && navSection) {
    if (isExpanded) {
      const existingPlaceholder = document.querySelector('[data-gem-header-title-placeholder]');

      if (!existingPlaceholder) {
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.setAttribute('data-gem-header-title-placeholder', 'true');

        headerTitle.parentNode.insertBefore(placeholder, headerTitle);
        headerTitle.remove();
        placeHeaderTitleAfterCompactTools(navSection, headerTitle);

        console.log('[Gem-Expanded-View] Moved header title to navigation section (view change)');
      }

      ensureHeaderTitleAfterCompactTools(navSection, headerTitle);
    } else {
      // Move back to original location
      const placeholder = document.querySelector('[data-gem-header-title-placeholder]');
      if (placeholder) {
        // Check if h1 is not in its original location (not immediately before the placeholder)
        if (headerTitle.nextSibling !== placeholder) {
          // Move back to original location
          placeholder.parentNode.insertBefore(headerTitle, placeholder);
          placeholder.remove();
          console.log('[Gem-Expanded-View] Moved header title back to original location (view change)');
        }
      }
    }
  }

  // Handle version selector (should be first child)
  if (versionSelector) {
    if (isExpanded) {
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

        console.log('[Gem-Expanded-View] Moved version selector to compact versions (view change)');
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
        console.log('[Gem-Expanded-View] Moved version selector back to original location (view change)');
      }
    }
  }

  // Handle multilanguage locale selector
  if (localeSelector) {
    if (isExpanded) {
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

        console.log('[Gem-Expanded-View] Moved multilanguage locale selector to compact versions (view change)');
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
        console.log('[Gem-Expanded-View] Moved multilanguage locale selector back to original location (view change)');
      }
    }
  }

  // Update active class based on conditions
  updateCompactVersionsActiveState(compactVersionsDiv, isExpanded);

  // Hide compact versions div if no content in normal view
  if (!isExpanded && !compactVersionsDiv.hasChildNodes()) {
    compactVersionsDiv.style.display = 'none';
  }

  if (isExpanded && navSection) {
    ensureCompactVersionsPosition(navSection, compactVersionsDiv);
  }
}

function setupExpandedViewObserver(compactVersionsDiv) {
  console.log('[Gem-Expanded-View] Setting up expanded view observer for locale selector');

  // Watch for changes to the body class
  const bodyObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const wasExpanded = mutation.oldValue && mutation.oldValue.includes('gem-expanded');
        const isExpanded = document.body.classList.contains('gem-expanded');

        // Only act if the expanded state actually changed
        if (wasExpanded !== isExpanded) {
          console.log(`[Gem-Expanded-View] Expanded view changed: ${wasExpanded} -> ${isExpanded}`);
          moveSelectorsBasedOnView(compactVersionsDiv, isExpanded);
        }
      }
    });
  });

  bodyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true
  });

  console.log('[Gem-Expanded-View] Expanded view observer set up');
}

function setupLanguagesSelectorObserver(compactVersionsDiv) {
  console.log('[Gem-Expanded-View] Setting up languages selector observer');

  // Watch for changes to vce-languages-selector class
  const languagesObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const isExpanded = document.body.classList.contains('gem-expanded');
        updateCompactVersionsActiveState(compactVersionsDiv, isExpanded);
      }
    });
  });

  // Also watch for vce-languages-selector being added/removed from DOM
  const containerObserver = new MutationObserver((mutations) => {
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
      const isExpanded = document.body.classList.contains('gem-expanded');
      updateCompactVersionsActiveState(compactVersionsDiv, isExpanded);
    }
  });

  // Observe existing languages selector
  const languagesSelector = document.querySelector('vce-languages-selector');
  if (languagesSelector) {
    languagesObserver.observe(languagesSelector, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Observe document body for languages selector being added/removed
  containerObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[Gem-Expanded-View] Languages selector observer set up');
}

function updateCompactVersionsActiveState(compactVersionsDiv, isExpanded) {
  const languagesSelector = document.querySelector('vce-languages-selector');
  const versionSelector = document.querySelector('cb-version-selector');

  // Check conditions for active class
  const shouldBeActive = isExpanded && (
    (languagesSelector && !languagesSelector.classList.contains('e-hidden')) ||
    versionSelector
  );

  if (shouldBeActive) {
    compactVersionsDiv.classList.add('active');
    console.log('[Gem-Expanded-View] Added active class to compact versions');
  } else {
    compactVersionsDiv.classList.remove('active');
    console.log('[Gem-Expanded-View] Removed active class from compact versions');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExpandedView);
} else {
  initializeExpandedView();
}