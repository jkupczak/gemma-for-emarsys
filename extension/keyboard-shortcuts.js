console.log("keyboard-shortcuts.js loaded");

// Keyboard shortcuts for saving content
// CMD+S (Mac) or CTRL+S (Windows/Linux) to trigger the save button

function initializeKeyboardShortcuts() {
  console.log("[Gem] Initializing keyboard shortcuts...");

  function isTypingTarget(target) {
    if (!target) return false;
    const el = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function getRootDocument() {
    try {
      return window.top && window.top.document ? window.top.document : document;
    } catch (_) {
      return document;
    }
  }

  let languageShortcutMaskTimer = null;
  let languageShortcutObserver = null;
  let languageShortcutActive = false;

  function ensureLanguageShortcutStyle(rootDoc) {
    if (!rootDoc) return;
    if (rootDoc.getElementById('gem-lang-shortcut-style')) return;
    const style = rootDoc.createElement('style');
    style.id = 'gem-lang-shortcut-style';
    style.textContent = `
      .gem-lang-shortcut-hide-popup e-float-container .e-actionlist-popover,
      .gem-lang-shortcut-hide-popup e-float-container .e-actionlist,
      .gem-lang-shortcut-hide-popup e-float-container .e-actionlist__itemscontainer {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (rootDoc.head || rootDoc.documentElement || rootDoc.body).appendChild(style);
  }

  function hideLanguagePopovers(rootDoc) {
    if (!rootDoc) return;
    const floats = Array.from(rootDoc.querySelectorAll('e-float-container'));
    let hiddenCount = 0;
    floats.forEach((fc) => {
      try {
        if (!fc || fc.nodeType !== Node.ELEMENT_NODE) return;
        const hasActionList = fc.querySelector && fc.querySelector('e-actionlist');
        if (!hasActionList) return;
        fc.dataset.gemLangShortcutHidden = 'true';
        fc.style.visibility = 'hidden';
        fc.style.opacity = '0';
        hiddenCount += 1;
      } catch (_) {}
    });
    if (hiddenCount > 0) {
      console.log("[Gem] Language shortcut masked popovers:", hiddenCount);
    }
  }

  function clearLanguagePopoverMask(rootDoc) {
    if (!rootDoc) return;
    const floats = Array.from(rootDoc.querySelectorAll('e-float-container[data-gem-lang-shortcut-hidden="true"]'));
    floats.forEach((fc) => {
      try {
        fc.style.visibility = '';
        fc.style.opacity = '';
        delete fc.dataset.gemLangShortcutHidden;
      } catch (_) {}
    });
  }

  function setLanguageShortcutMask(enabled) {
    const rootDoc = getRootDocument();
    ensureLanguageShortcutStyle(rootDoc);
    const root = rootDoc.documentElement || rootDoc.body;
    if (!root) return;
    if (enabled) {
      root.classList.add('gem-lang-shortcut-hide-popup');
      hideLanguagePopovers(rootDoc);
    } else {
      root.classList.remove('gem-lang-shortcut-hide-popup');
      clearLanguagePopoverMask(rootDoc);
    }
  }

  function scheduleLanguageShortcutMaskClear(delayMs = 150) {
    if (languageShortcutMaskTimer) {
      clearTimeout(languageShortcutMaskTimer);
    }
    languageShortcutMaskTimer = setTimeout(() => {
      languageShortcutMaskTimer = null;
      languageShortcutActive = false;
      if (languageShortcutObserver) {
        languageShortcutObserver.disconnect();
        languageShortcutObserver = null;
      }
      setLanguageShortcutMask(false);
    }, delayMs);
  }

  function setupLanguageShortcutObserver() {
    if (languageShortcutObserver) return;
    const rootDoc = getRootDocument();
    if (!rootDoc || !rootDoc.body) return;
    languageShortcutObserver = new MutationObserver((mutations) => {
      if (!languageShortcutActive) return;
      let sawFloat = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches && node.matches('e-float-container')) {
            sawFloat = true;
          } else if (node.querySelector && node.querySelector('e-float-container')) {
            sawFloat = true;
          }
        });
      });
      if (sawFloat) {
        hideLanguagePopovers(rootDoc);
      }
    });
    languageShortcutObserver.observe(rootDoc.body, { childList: true, subtree: true });
  }

  // Function to find and click the save button
  function triggerSave() {
    const saveButton = document.querySelector('cb-draft-save-button button.e-btn');

    if (saveButton) {
      console.log("[Gem] Save button found, triggering click...");
      saveButton.click();
    } else {
      console.log("[Gem] Save button not found");
    }
  }


  // Function to toggle mobile preview visibility
  function toggleMobilePreview() {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    try {
      // Get current mobile preview visibility state
      chrome.storage.sync.get(['mobileViewVisible'], (result) => {
        // Check again if chrome APIs are still available after async call
        if (!chrome || !chrome.storage || !chrome.storage.sync) {
          console.warn("[Gem] Chrome storage API became unavailable during async call");
          return;
        }

        const currentState = result.mobileViewVisible !== false; // Default to true if undefined
        const newState = !currentState;

        console.log("[Gem] Toggling mobile preview:", currentState, "->", newState);

        // Update the setting in storage
        chrome.storage.sync.set({ mobileViewVisible: newState }, () => {
          if (chrome.runtime.lastError) {
            console.error("[Gem] Error toggling mobile preview:", chrome.runtime.lastError);
          }
        });
      });
    } catch (error) {
      console.error("[Gem] Error in toggleMobilePreview:", error);
    }
  }

  function getLanguageSelectorState() {
    const rootDoc = getRootDocument();
    const selector = rootDoc.querySelector('vce-languages-selector');
    if (!selector) return { selector: null, options: [], currentValue: null, currentIndex: -1 };

    const options = Array.from(selector.querySelectorAll('e-select-option'))
      .filter((opt) => {
        if (!opt || opt.nodeType !== Node.ELEMENT_NODE) return false;
        const disabledAttr = opt.getAttribute && opt.getAttribute('disabled');
        const ariaDisabled = opt.getAttribute && opt.getAttribute('aria-disabled');
        return !disabledAttr && ariaDisabled !== 'true';
      });

    let currentValue = null;
    try {
      const hidden = selector.querySelector('input[type="hidden"]');
      if (hidden && hidden.value) currentValue = hidden.value;
    } catch (_) {}

    let currentIndex = -1;
    if (currentValue) {
      currentIndex = options.findIndex((opt) => {
        const val = opt.getAttribute && opt.getAttribute('value');
        return val === currentValue || opt.id === currentValue;
      });
    }

    if (currentIndex < 0) {
      currentIndex = options.findIndex((opt) => {
        if (!opt) return false;
        const attr = opt.getAttribute ? opt.getAttribute('selected') : null;
        if (attr === 'true' || attr === 'selected') return true;
        if (attr === '' && opt.hasAttribute && opt.hasAttribute('selected')) return true;
        if (typeof opt.selected === 'boolean') return opt.selected;
        return false;
      });
    }

    return { selector, options, currentValue, currentIndex, rootDoc };
  }

  function normalizeOptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getActionListItems() {
    const rootDoc = getRootDocument();
    const containers = Array.from(rootDoc.querySelectorAll('e-float-container e-actionlist .e-actionlist__itemscontainer, e-actionlist .e-actionlist__itemscontainer'));
    if (containers.length) {
      console.log("[Gem] Action list containers found:", containers.length);
    } else {
      console.log("[Gem] Action list containers not found.");
    }
    return containers.map((container) => ({
      container,
      items: Array.from(container.querySelectorAll('.e-actionlist__item[role="option"]'))
    }));
  }

  function getLanguageActionList(state) {
    if (!state || !state.options || !state.options.length) return null;
    const optionTexts = state.options.map((opt) => normalizeOptionText(opt.textContent || '')).filter(Boolean);
    const optionTextSet = new Set(optionTexts);

    const containers = getActionListItems();
    if (!containers.length) return null;

    let best = null;
    containers.forEach(({ container, items }) => {
      if (!items.length) return;
      let matches = 0;
      items.forEach((item) => {
        const t = normalizeOptionText(item.textContent || '');
        if (optionTextSet.has(t)) matches += 1;
      });
      const score = matches;
      if (!best || score > best.score) {
        best = { container, items, matches, score };
      }
    });

    if (!best || best.matches === 0) {
      console.log("[Gem] No language action list matched option texts.");
      return null;
    }

    console.log("[Gem] Language action list matched items:", best.matches, "of", best.items.length);
    return best;
  }

  function openLanguageSelectorDropdown(state) {
    if (!state || !state.selector) return false;
    const trigger =
      state.selector.querySelector('.e-selectnew[role="button"]') ||
      state.selector.querySelector('.e-selectnew__wrapper [role="button"]');
    console.log("[Gem] Language selector trigger found:", !!trigger);
    if (!trigger) return false;
    try {
      languageShortcutActive = true;
      setupLanguageShortcutObserver();
      setLanguageShortcutMask(true);
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      trigger.click();
      console.log("[Gem] Language selector trigger clicked.");
      return true;
    } catch (_) {
      try {
        languageShortcutActive = true;
        setupLanguageShortcutObserver();
        setLanguageShortcutMask(true);
        trigger.click();
        console.log("[Gem] Language selector trigger clicked (fallback).");
      } catch (_) {}
    }
    return true;
  }

  function selectLanguageOption(state, targetIndex) {
    if (!state || !state.selector || !state.options.length) return false;
    const targetOption = state.options[targetIndex];
    if (!targetOption) return false;

    const targetText = normalizeOptionText(targetOption.textContent || '');
    console.log("[Gem] Target option text:", targetText, "target index:", targetIndex);
    const trySelect = () => {
      const match = getLanguageActionList(state);
      if (!match) return false;

      let targetItem = match.items.find((item) => {
        const itemText = normalizeOptionText(item.textContent || '');
        return itemText === targetText && itemText.length > 0;
      });

      if (!targetItem) {
        console.log("[Gem] Target action item not found.");
        return false;
      }
      try {
        console.log("[Gem] Clicking action list item.");
        targetItem.click();
        return true;
      } catch (_) {
        try {
          const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          targetItem.dispatchEvent(evt);
          return true;
        } catch (_) {}
      }
      return false;
    };

    if (trySelect()) {
      scheduleLanguageShortcutMaskClear();
      return true;
    }

    const opened = openLanguageSelectorDropdown(state);
    console.log("[Gem] Language selector dropdown open attempt:", opened);
    if (!opened) {
      scheduleLanguageShortcutMaskClear();
      return false;
    }

    hideLanguagePopovers(getRootDocument());

    let attempts = 0;
    const maxAttempts = 25;
    const interval = setInterval(() => {
      attempts += 1;
      if (attempts === 1) {
        console.log("[Gem] Waiting for action list... attempt", attempts);
      }
      if (trySelect()) {
        clearInterval(interval);
        console.log("[Gem] Action list selection succeeded after attempts:", attempts);
        scheduleLanguageShortcutMaskClear();
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log("[Gem] Language selector action list not found after waiting.");
        scheduleLanguageShortcutMaskClear();
      }
    }, 75);
    return true;
  }

  function cycleLanguageSelector(direction) {
    const state = getLanguageSelectorState();
    if (!state.options || state.options.length < 2) return false;

    const fromIndex = state.currentIndex >= 0 ? state.currentIndex : 0;
    const nextIndex = (fromIndex + direction + state.options.length) % state.options.length;
    if (nextIndex === fromIndex) return false;

    return selectLanguageOption(state, nextIndex);
  }

  // Function to monitor iframes and inject keyboard shortcuts
  function monitorIframesForKeyboardShortcuts() {
    console.log("[Gem] Monitoring iframes for keyboard shortcuts...");

    // Function to inject keyboard shortcuts into an iframe
    function injectIntoIframe(iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          // Check if our handler is already attached to avoid duplicates
          if (iframeDoc._gemKeyboardHandler) {
            return; // Already injected
          }

          // Add the keyboard shortcut handler to the iframe
          iframeDoc.addEventListener('keydown', handleKeyDown, true);
          iframeDoc._gemKeyboardHandler = true;

          console.log("[Gem] Injected keyboard shortcuts into iframe");
        }
      } catch (error) {
        console.log("[Gem] Could not inject into iframe (cross-origin):", error);
      }
    }

  // Function to wait for iframe to be ready and inject
  function waitForIframeReady(iframe) {
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        // Iframe is already loaded
        injectIntoIframe(iframe);
      } else {
        // Wait for iframe to load
        iframe.addEventListener('load', () => {
          // Give it a moment for content to be ready
          setTimeout(() => {
            injectIntoIframe(iframe);
          }, 100);
        });

        // Also try periodically for up to 5 seconds in case load event doesn't fire
        let attempts = 0;
        const checkReady = () => {
          attempts++;
          try {
            if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
              injectIntoIframe(iframe);
              return;
            }
            if (attempts < 50) { // Check for up to 5 seconds (50 * 100ms)
              setTimeout(checkReady, 100);
            }
          } catch (error) {
            // Cross-origin, stop checking
          }
        };
        setTimeout(checkReady, 100);
      }
    }

    // Inject into existing iframes
    const existingIframes = document.querySelectorAll('iframe');
    existingIframes.forEach(waitForIframeReady);

    // Monitor for new iframes being added
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'IFRAME') {
            waitForIframeReady(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Keyboard event handler
  function handleKeyDown(event) {
    // Check for CMD+S (Mac) or CTRL+S (Windows/Linux)
    const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key === 's';

    // Check for CMD+/ (Mac) or CTRL+/ (Windows/Linux) - Mobile Preview Toggle
    const isMobilePreviewShortcut = (event.metaKey || event.ctrlKey) && event.key === '/';

    // Check for CMD+SHIFT+F (Mac) or CTRL+SHIFT+F (Windows/Linux) - Expanded Mode Toggle
    const isExpandedModeShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      (String(event.key || '').toLowerCase() === 'f');

    const isLangPrevShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      (event.code === 'Comma' || event.key === ',' || event.key === '<');

    const isLangNextShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      (event.code === 'Period' || event.key === '.' || event.key === '>');

    if (isSaveShortcut) {
      console.log("[Gem] Save shortcut detected:", event.metaKey ? 'CMD+S' : 'CTRL+S', "in context:", event.target.ownerDocument === document ? "main" : "iframe");

      // Prevent default browser save behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Trigger save
      triggerSave();

      // Return false to ensure no further processing
      return false;
    } else if (isMobilePreviewShortcut) {
      console.log("[Gem] Mobile preview toggle shortcut detected:", event.metaKey ? 'CMD+/' : 'CTRL+/');

      // Prevent default browser search behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Toggle mobile preview visibility
      toggleMobilePreview();

      // Return false to ensure no further processing
      return false;
    } else if (isExpandedModeShortcut) {
      console.log("[Gem] Expanded mode toggle shortcut detected:", event.metaKey ? 'CMD+SHIFT+F' : 'CTRL+SHIFT+F');

      // Don't trigger while typing
      const ae = (event.target && event.target.ownerDocument ? event.target.ownerDocument.activeElement : document.activeElement);
      if (isTypingTarget(ae || event.target)) return;

      // Prevent default browser find behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Toggle expanded mode (same behavior as the expand icon)
      try {
        const rootDoc = (() => {
          try { return window.top && window.top.document ? window.top.document : document; } catch (_) { return document; }
        })();
        const body = rootDoc && rootDoc.body;
        if (!body) return false;

        const wasExpanded = body.classList.contains("gem-expanded");
        body.classList.toggle("gem-expanded");
        const isNowExpanded = body.classList.contains("gem-expanded");
        console.log("[Gem] Expanded mode toggled:", wasExpanded, "->", isNowExpanded);

        // Persist state (used by verticalnav-enhancer.js restore)
        chrome.storage.sync.set({ fullscreenActive: isNowExpanded }, () => {
          if (chrome.runtime.lastError) {
            console.error("[Gem] Error saving expanded mode state:", chrome.runtime.lastError);
          }
        });

      } catch (error) {
        console.error("[Gem] Error toggling expanded mode:", error);
      }

      return false;
    } else if (isLangPrevShortcut || isLangNextShortcut) {
      console.log("[Gem] Language cycle shortcut detected:", {
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        targetTag: event.target && event.target.tagName,
        targetContentEditable: event.target && event.target.isContentEditable
      });

      const state = getLanguageSelectorState();
      if (!state.selector) {
        console.log("[Gem] Language selector not found in DOM.");
        return;
      }

      console.log("[Gem] Language selector options found:", state.options.length);
      if (state.options.length < 2) {
        console.log("[Gem] Language selector has fewer than 2 options; skipping.");
        return;
      }

      console.log("[Gem] Current language index:", state.currentIndex, "current value:", state.currentValue);

      const didChange = cycleLanguageSelector(isLangNextShortcut ? 1 : -1);
      console.log("[Gem] Language cycle applied:", didChange);
      if (!didChange) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
  }

  // Attach event listeners to window to catch events from anywhere (including iframes)
  window.addEventListener('keydown', handleKeyDown, true); // Use capture phase

  // Also attach to document for redundancy
  document.addEventListener('keydown', handleKeyDown, true);

  // Monitor iframes and inject keyboard shortcuts into them
  monitorIframesForKeyboardShortcuts();

  console.log("[Gem] Keyboard shortcuts initialized - CMD+S / CTRL+S will trigger save, CMD+/ / CTRL+/ will toggle mobile preview");
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeKeyboardShortcuts);
} else {
  initializeKeyboardShortcuts();
}
