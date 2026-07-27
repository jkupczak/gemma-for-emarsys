console.log("[Gem] keyboard-shortcuts.js loaded");

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

  function isAltPeekKey(event) {
    return event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight';
  }

  let gemModalPeekActive = false;

  function gemGetOpenCompareModal() {
    try {
      return getRootDocument().getElementById('gem-compare-modal');
    } catch (_) {
      return null;
    }
  }

  function gemGetModalPeekTarget() {
    return gemGetOpenCompareModal() || gemGetOpenEnhancedImagePropertiesDialog();
  }

  function gemClearModalPeekClasses(rootDoc) {
    if (!rootDoc) return;
    rootDoc.querySelectorAll('.gem-modal-peek-through, .gem-image-picker-peek-through').forEach((el) => {
      el.classList.remove('gem-modal-peek-through', 'gem-image-picker-peek-through');
    });
  }

  function gemSetModalPeek(active) {
    const target = gemGetModalPeekTarget();
    if (!active) {
      gemModalPeekActive = false;
      try {
        gemClearModalPeekClasses(getRootDocument());
      } catch (_) {}
      return;
    }
    if (!target) return;
    gemModalPeekActive = true;
    target.classList.add('gem-modal-peek-through');
    if (target.classList.contains('gem-enhanced-image-properties-dialog')) {
      target.classList.add('gem-image-picker-peek-through');
    }
  }

  function gemClearModalPeekIfStale() {
    if (!gemModalPeekActive) return;
    if (!gemGetModalPeekTarget()) {
      gemSetModalPeek(false);
    }
  }

  function handleModalPeekKeyDown(event) {
    // Hold Alt/Option to peek — avoids typing Space into focused inputs.
    if (!isAltPeekKey(event) || event.metaKey || event.ctrlKey || event.shiftKey) return;

    gemClearModalPeekIfStale();
    if (!gemGetModalPeekTarget()) return;

    if (event.repeat) {
      if (gemModalPeekActive) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    gemSetModalPeek(true);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleModalPeekKeyUp(event) {
    if (!isAltPeekKey(event)) return;
    if (!gemModalPeekActive) return;
    gemSetModalPeek(false);
    event.preventDefault();
    event.stopPropagation();
  }

  function gemGetOpenEnhancedImagePropertiesDialog() {
    const rootDoc = getRootDocument();
    if (!rootDoc) return null;
    const dialogs = rootDoc.querySelectorAll('.gem-enhanced-image-properties-dialog');
    for (let i = dialogs.length - 1; i >= 0; i--) {
      if (dialogs[i].isConnected) return dialogs[i];
    }
    return null;
  }

  function gemGetActiveElementForKeyboardEvent(event) {
    try {
      const doc = event.view && event.view.document;
      if (doc && doc.activeElement) return doc.activeElement;
    } catch (_) {}
    try {
      return getRootDocument().activeElement;
    } catch (_) {
      return document.activeElement;
    }
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

  /** Image picker embeds Media DB in an iframe with this class (see overlay-panel-controls.js). */
  function gemGetMediaDbPickerIframeFromEvent(event) {
    try {
      const fe = event.view && event.view.frameElement;
      if (!fe || !fe.classList || !fe.classList.contains('gem-media-db-iframe')) return null;
      return fe;
    } catch (_) {
      return null;
    }
  }

  function gemGetImagePropertiesDialogFromIframeEvent(event) {
    const fe = gemGetMediaDbPickerIframeFromEvent(event);
    if (!fe) return null;
    try {
      return fe.closest('.e-dialog.e-dialog-active') || fe.closest('.e-dialog-active');
    } catch (_) {
      return null;
    }
  }

  function gemToggleImagePickerDesktopMobileTab(event) {
    const modal = gemGetImagePropertiesDialogFromIframeEvent(event);
    if (!modal) return false;
    const mobile = modal.querySelector('.e-tabs__title[data-tab="mobile"]');
    const desktop = modal.querySelector('.e-tabs__title[data-tab="desktop"]');
    if (!mobile || !desktop) return false;
    const active = modal.querySelector(
      '.e-tabs__title.e-tabs__title-active[data-tab="mobile"], .e-tabs__title.e-tabs__title-active[data-tab="desktop"]'
    );
    const onMobile = active && active.getAttribute('data-tab') === 'mobile';
    (onMobile ? desktop : mobile).click();
    return true;
  }

  /** Match content-block-toolbar: commit before OK; skip Gem / Emarsys search fields. */
  function gemShouldCommitImagePickerInputField(el) {
    if (!el || !el.matches) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
    if (el.matches('input[type="search"]')) return false;
    if (
      el.classList.contains('e-input-search') ||
      el.classList.contains('gem-favorite-images-search') ||
      el.classList.contains('gem-seen-images-search')
    ) {
      return false;
    }
    return true;
  }

  function gemBlurImagePickerCommitFields(modal, event) {
    if (!modal) return;
    try {
      const od = modal.ownerDocument;
      if (od) {
        const ae = od.activeElement;
        if (ae && modal.contains(ae) && gemShouldCommitImagePickerInputField(ae)) {
          ae.blur();
          ae.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      const w = event && event.view;
      const fe = w && w.frameElement;
      if (fe && modal.contains(fe) && w.document) {
        const ae2 = w.document.activeElement;
        if (ae2 && gemShouldCommitImagePickerInputField(ae2)) {
          ae2.blur();
          ae2.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (_) {}
  }

  function gemClickImagePickerOkButton(event) {
    const modal = gemGetImagePropertiesDialogFromIframeEvent(event);
    if (!modal) return false;
    gemBlurImagePickerCommitFields(modal, event);
    const ok =
      modal.querySelector('.e-dialog__container button.ok-btn') ||
      modal.querySelector('button.ok-btn');
    if (!ok) return false;
    ok.click();
    return true;
  }

  function gemGetOpenLinkEditorFloatContainer(rootDoc) {
    if (!rootDoc) return null;
    for (const float of rootDoc.querySelectorAll('e-float-container')) {
      const title = float.querySelector('.e-dialog__title');
      if (!title) continue;
      const text = String(title.textContent || '').replace(/\s+/g, ' ').trim();
      if (text !== 'Link Editor') continue;
      if (!float.querySelector('.apply')) continue;
      return float;
    }
    return null;
  }

  function gemBlurLinkEditorCommitFields(float, event) {
    if (!float) return;
    try {
      const rootDoc = getRootDocument();
      const ae = rootDoc.activeElement;
      if (ae && float.contains(ae) && gemShouldCommitImagePickerInputField(ae)) {
        ae.blur();
        ae.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const w = event && event.view;
      const d = w && w.document;
      if (d && d !== rootDoc) {
        const ae2 = d.activeElement;
        if (ae2 && float.contains(ae2) && gemShouldCommitImagePickerInputField(ae2)) {
          ae2.blur();
          ae2.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (_) {}
  }

  function gemClickLinkEditorOkButton(event) {
    const rootDoc = getRootDocument();
    const float = gemGetOpenLinkEditorFloatContainer(rootDoc);
    if (!float) return false;

    gemBlurLinkEditorCommitFields(float, event);

    const ok = float.querySelector('.apply');
    if (!ok || ok.disabled || ok.getAttribute('aria-disabled') === 'true') return false;

    ok.click();
    return true;
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

  function getActionListItemLabelText(item) {
    if (!item || item.nodeType !== Node.ELEMENT_NODE) return '';
    if (!item.querySelector('.gem-lang-preflight-badge')) {
      return normalizeOptionText(item.textContent || '');
    }
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.gem-lang-preflight-badge').forEach((el) => el.remove());
    return normalizeOptionText(clone.textContent || '');
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
        const t = getActionListItemLabelText(item);
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
        const itemText = getActionListItemLabelText(item);
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
        if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          // Check if our handler is already attached to avoid duplicates
          if (iframeDoc._gemKeyboardHandler) {
            return; // Already injected
          }

          // Add the keyboard shortcut handler to the iframe
          iframeDoc.addEventListener('keydown', handleKeyDown, true);
          iframeDoc.addEventListener('keyup', handleModalPeekKeyUp, true);
          iframeDoc._gemKeyboardHandler = true;

          console.log("[Gem] Injected keyboard shortcuts into iframe");
        }
      } catch (error) {
        console.log("[Gem] Could not inject into iframe (cross-origin):", error);
      }
    }

    function bindKeyboardShortcutIframeReload(iframe) {
      if (!iframe || iframe._gemKeyboardShortcutIframeLoadBound) return;
      iframe._gemKeyboardShortcutIframeLoadBound = true;
      iframe.addEventListener('load', () => {
        setTimeout(() => injectIntoIframe(iframe), 50);
      });
    }

  // Function to wait for iframe to be ready and inject
  function waitForIframeReady(iframe) {
      if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
      bindKeyboardShortcutIframeReload(iframe);
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        // Iframe is already loaded
        injectIntoIframe(iframe);
      } else {
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

    // Monitor for new iframes being added (including nested, e.g. Media DB in image picker)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === 'IFRAME') {
            waitForIframeReady(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('iframe').forEach(waitForIframeReady);
          }
        });
      });
    });

    const obsRoot = document.body || document.documentElement;
    observer.observe(obsRoot, {
      childList: true,
      subtree: true
    });
  }

  // Keyboard event handler
  function handleKeyDown(event) {
    // Check for CMD+S (Mac) or CTRL+S (Windows/Linux)
    const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key === 's';

    // Check for CMD+SHIFT+F (Mac) or CTRL+SHIFT+F (Windows/Linux) - Focus Layout toggle
    const isFocusLayoutShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      (String(event.key || '').toLowerCase() === 'f');

    const isMobilePreviewShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      String(event.key || '').toLowerCase() === 'm';

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

    const isDesktopMobileToggleShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      String(event.key || '').toLowerCase() === 'd';

    const isEnterKey = event.key === 'Enter' && !event.isComposing;

    const fromGemMediaDbIframe = !!gemGetMediaDbPickerIframeFromEvent(event);
    let iframeActiveEl = null;
    if (fromGemMediaDbIframe) {
      try {
        iframeActiveEl = event.view && event.view.document ? event.view.document.activeElement : null;
      } catch (_) {
        iframeActiveEl = null;
      }
    }
    const iframeTyping = fromGemMediaDbIframe && isTypingTarget(iframeActiveEl);

    // In the Media DB iframe we only wire save, OK (Enter), and Desktop/Mobile (⌘D). Other Gem shortcuts stay inert.
    if (fromGemMediaDbIframe) {
      if (isFocusLayoutShortcut || isMobilePreviewShortcut || isLangPrevShortcut || isLangNextShortcut) {
        return;
      }
    }

    if (
      isEnterKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      gemClickLinkEditorOkButton(event)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }

    if (isEnterKey && fromGemMediaDbIframe && !iframeTyping) {
      if (gemClickImagePickerOkButton(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
    }

    if (isDesktopMobileToggleShortcut && fromGemMediaDbIframe) {
      if (gemToggleImagePickerDesktopMobileTab(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
    }

    if (isSaveShortcut) {
      if (fromGemMediaDbIframe && iframeTyping) {
        return;
      }
      console.log("[Gem] Save shortcut detected:", event.metaKey ? 'CMD+S' : 'CTRL+S', "in context:", event.target.ownerDocument === document ? "main" : "iframe");

      // Prevent default browser save behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Trigger save
      triggerSave();

      // Return false to ensure no further processing
      return false;
    } else if (isFocusLayoutShortcut) {
      console.log("[Gem] Expanded mode toggle shortcut detected:", event.metaKey ? 'CMD+SHIFT+F' : 'CTRL+SHIFT+F');

      // Don't trigger while typing
      const ae = (event.target && event.target.ownerDocument ? event.target.ownerDocument.activeElement : document.activeElement);
      if (isTypingTarget(ae || event.target)) return;

      // Prevent default browser find behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Toggle Focus Layout (same behavior as the expand icon)
      try {
        const rootDoc = (() => {
          try { return window.top && window.top.document ? window.top.document : document; } catch (_) { return document; }
        })();
        const root = rootDoc && rootDoc.documentElement;
        if (!root) return false;

        if (root.classList.contains("gem-expanded")) {
          root.classList.remove("gem-expanded");
        }
        try {
          if (rootDoc.body) {
            rootDoc.body.classList.remove("gem-expanded");
            rootDoc.body.classList.remove("gem-focus-layout");
          }
        } catch (_) {}

        const wasFocusLayout = root.classList.contains("gem-focus-layout");
        root.classList.toggle("gem-focus-layout");
        const isNowFocusLayout = root.classList.contains("gem-focus-layout");
        console.log("[Gem] Focus Layout toggled:", wasFocusLayout, "->", isNowFocusLayout);

        // Persist state (used by focus-layout boot / verticalnav restore)
        chrome.storage.sync.set({ fullscreenActive: isNowFocusLayout }, () => {
          if (chrome.runtime.lastError) {
            console.error("[Gem] Error saving Focus Layout state:", chrome.runtime.lastError);
          }
        });

      } catch (error) {
        console.error("[Gem] Error toggling Focus Layout:", error);
      }

      return false;
    } else if (isMobilePreviewShortcut) {
      console.log("[Gem] Mobile preview toggle shortcut detected:", event.metaKey ? 'CMD+SHIFT+M' : 'CTRL+SHIFT+M');

      const ae = (event.target && event.target.ownerDocument ? event.target.ownerDocument.activeElement : document.activeElement);
      if (isTypingTarget(ae || event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (typeof window.gemToggleMobilePreview === 'function') {
        if (!window.gemToggleMobilePreview()) {
          console.log("[Gem] Mobile preview shortcut ignored — Inbox Preview is active");
        }
      }

      return false;
    } else if (isLangPrevShortcut || isLangNextShortcut) {
      if (document.getElementById('gem-compare-modal')) {
        return;
      }

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

    handleModalPeekKeyDown(event);
  }

  function handleKeyUp(event) {
    handleModalPeekKeyUp(event);
  }

  // Attach event listeners to window to catch events from anywhere (including iframes)
  window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
  window.addEventListener('keyup', handleKeyUp, true);

  // Also attach to document for redundancy
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);

  window.addEventListener('blur', () => gemSetModalPeek(false), true);

  // Monitor iframes and inject keyboard shortcuts into them
  monitorIframesForKeyboardShortcuts();

  window.gemSetModalPeek = gemSetModalPeek;

  console.log("[Gem] Keyboard shortcuts initialized - CMD+S / CTRL+S will trigger save");
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeKeyboardShortcuts);
} else {
  initializeKeyboardShortcuts();
}
