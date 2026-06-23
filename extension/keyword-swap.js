console.log("[Gem-Keyword-Swap] keyword-swap.js loaded");

// Keyword swap functionality for both content block toolbar and preheader textarea
function initializeKeywordSwap() {
  console.log("[Gem-Keyword-Swap] Initializing keyword swap functionality - function called!");

  // ------------------------------------------------------------
  // Preheader Keyword Swap functionality
  // ------------------------------------------------------------

  function initializePreheaderKeywordSwap() {
    // Watch for cb-preheader elements to appear
    // Also check for existing preheader elements
    const existingPreheader = document.querySelector('cb-preheader');
    if (existingPreheader && !existingPreheader._gemKeywordSwapInitialized) {
      setupPreheaderKeywordSwap(existingPreheader);
    }

    window.gemDomWatchSubscribe(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const preheader = node.matches && node.matches('cb-preheader') ? node :
                             node.querySelector && node.querySelector('cb-preheader');

            if (preheader && !preheader._gemKeywordSwapInitialized) {
              setupPreheaderKeywordSwap(preheader);
            }
          }
        });
      });
    });

    console.log("[Gem-Keyword-Swap] Preheader keyword swap handler initialized");
  }

  function setupPreheaderKeywordSwap(preheader) {
    if (preheader._gemKeywordSwapInitialized) return;
    preheader._gemKeywordSwapInitialized = true;

    const actionsContainer = preheader.querySelector('.e-toolbox__actions');
    if (!actionsContainer) return;

    // Create the keyword swap button using the same style as the snippets panel
    const swapButton = document.createElement('button');
    swapButton.className = 'e-btn e-btn-sm gem-preheader-swap-keywords-btn';
    swapButton.type = 'button';
    swapButton.title = 'Swap Keywords';
    swapButton.setAttribute('aria-label', 'Swap Keywords');
    swapButton.style.minWidth = 'unset';
    swapButton.style.padding = '0 2px 0 10px';

    swapButton.innerHTML = `
      <gem-e-icon icon="style" color="inherit">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon text-color-inherit">&#xF0DE;</div>
        </div>
      </gem-e-icon>
    `;

    // Add click handler
    swapButton.addEventListener('click', () => {
      performPreheaderKeywordSwap(preheader);
    });

    // Add as the last child of the actions container
    actionsContainer.appendChild(swapButton);

    console.log("[Gem-Keyword-Swap] Preheader keyword swap button added");
  }

  function performPreheaderKeywordSwap(preheader) {
    const textarea = preheader.querySelector('textarea');
    if (!textarea) {
      console.log("[Gem-Keyword-Swap] No textarea found in preheader");
      return;
    }

    const textContent = textarea.value;
    console.log("[Gem-Keyword-Swap] Preheader textarea content:", textContent);

    if (!textContent.trim()) {
      window.gemShowToast && window.gemShowToast('Preheader text is empty.', { type: 'info', duration: 4000 });
      return;
    }

    // Get all snippets that have keyword swap rules
    getSnippets((snippets) => {
      console.log("[Gem-Keyword-Swap] Retrieved snippets for preheader swap:", snippets.length);
      const swappableSnippets = snippets.filter((snippet) => {
        const rules = normalizeSwapKeywordsFromSnippet(snippet);
        const hasRules = rules.some((r) => r && r.keyword && r.initiateFrom !== 'toolbar' && r.initiateFrom !== 'panel');
        console.log(`[Gem-Keyword-Swap] Snippet "${snippet.name}" has swappable rules:`, hasRules, rules);
        return hasRules;
      });

      console.log("[Gem-Keyword-Swap] Found swappable snippets:", swappableSnippets.length);

      if (!swappableSnippets.length) {
        window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 4000 });
        return;
      }

      let totalSwaps = 0;
      let modifiedText = textContent;

      // Process each snippet's swap rules
      swappableSnippets.forEach((snippet) => {
        const rules = normalizeSwapKeywordsFromSnippet(snippet).filter((r) => r && r.keyword && r.initiateFrom !== 'toolbar' && r.initiateFrom !== 'panel');

        rules.forEach((rule) => {
          const { keyword, mode, matchRule } = rule;
          console.log(`[Gem-Keyword-Swap] Processing keyword "${keyword}" with mode "${mode}" and matchRule "${matchRule}"`);

          // Generate the replacement content (HTML token for contenteditable, plain text for textarea)
          const isTextareaContext = true; // We're always in textarea context for preheader
          let replacementContent;
          if (isTextareaContext) {
            // For textarea, use plain text (the snippet's ESL content)
            replacementContent = snippet.content || snippet.name;
          } else {
            // For contenteditable, use HTML token
            replacementContent = generateSnippetHTML(snippet, {
              keywordSwapMode: mode,
              keywordSwapKeyword: keyword
            });
          }

          // Match Rules control whether we use word boundaries (\b) or not.
          const regex = createKeywordRegex(keyword, matchRule);
          console.log(`[Gem-Keyword-Swap] Testing regex: ${regex} against: "${modifiedText}"`);
          const matches = modifiedText.match(regex);
          if (matches) {
            console.log(`[Gem-Keyword-Swap] Found ${matches.length} matches for "${keyword}":`, matches);
            totalSwaps += matches.length;
            modifiedText = modifiedText.replace(regex, replacementContent);
          } else {
            console.log(`[Gem-Keyword-Swap] No matches found for "${keyword}"`);
          }
        });
      });

      console.log(`[Gem-Keyword-Swap] Total swaps performed: ${totalSwaps}`);

      if (totalSwaps > 0) {
        textarea.value = modifiedText;

        // Trigger multiple events to ensure Emarsys detects the change
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        // Additional events that might trigger Emarsys change detection
        textarea.dispatchEvent(new Event('keydown', { bubbles: true }));
        textarea.dispatchEvent(new Event('keyup', { bubbles: true }));
        textarea.dispatchEvent(new Event('keypress', { bubbles: true }));

        // Try focusing and blurring to trigger change detection
        const wasFocused = document.activeElement === textarea;
        if (!wasFocused) {
          textarea.focus();
          textarea.blur();
        }

        window.gemShowToast && window.gemShowToast(`Performed ${totalSwaps} keyword swap${totalSwaps === 1 ? '' : 's'}.`, { type: 'success', duration: 4000 });
      } else {
        window.gemShowToast && window.gemShowToast('No matching keywords found to swap.', { type: 'info', duration: 4000 });
      }
    });
  }

  // Utility functions for keyword swapping
  function normalizeSwapKeywordsFromSnippet(snippet) {
    if (!snippet) return [];

    // New format: [{ keyword, mode }]
    if (Array.isArray(snippet.swapKeywords)) {
      const cleaned = snippet.swapKeywords
        .map((k) => ({
          keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
          mode: normalizeSwapMode(k && k.mode),
          matchRule: normalizeSwapMatchRule(k && k.matchRule),
          initiateFrom: normalizeSwapInitiateFrom(k && k.initiateFrom)
        }))
        .filter((k) => !!k.keyword);

      // Deduplicate within snippet (case-sensitive)
      const seen = new Set();
      const unique = [];
      cleaned.forEach((k) => {
        if (seen.has(k.keyword)) return;
        seen.add(k.keyword);
        unique.push(k);
      });
      return unique;
    }

    // Legacy format: swapKeyword/swapMode
    const legacyKeyword = (snippet.swapKeyword && typeof snippet.swapKeyword === 'string') ? snippet.swapKeyword.trim() : '';
    if (!legacyKeyword) return [];
    return [{ keyword: legacyKeyword, mode: normalizeSwapMode(snippet.swapMode), matchRule: 'partial', initiateFrom: 'anywhere' }];
  }

  function normalizeSwapMode(mode) {
    // token | plain (how we insert the snippet content)
    if (typeof mode === 'string') {
      const m = mode.toLowerCase().trim();
      if (m === 'plain') return 'plain';
    }
    return 'token'; // default
  }

  function normalizeSwapMatchRule(v) {
    // partial | whole
    if (typeof v === 'string') {
      const m = v.toLowerCase().trim();
      if (m === 'whole' || m === 'wholeword' || m === 'whole_word') return 'whole';
      if (m === 'partial' || m === 'partialword' || m === 'partial_word') return 'partial';
      // Back-compat guesses
      if (m === 'word') return 'whole';
      if (m === 'contains') return 'partial';
    }
    return 'partial';
  }

  function createKeywordRegex(keyword, matchRule) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mr = normalizeSwapMatchRule(matchRule);
    // Whole Word uses \b boundaries, Partial Word does not.
    return mr === 'whole'
      ? new RegExp(`\\b${escapedKeyword}\\b`, 'g')
      : new RegExp(escapedKeyword, 'g');
  }

  function normalizeSwapInitiateFrom(initiateFrom) {
    if (typeof initiateFrom === 'string') {
      const m = initiateFrom.toLowerCase().trim();
      if (['anywhere', 'toolbar', 'panel'].includes(m)) return m;
    }
    return 'anywhere'; // default
  }

  function generateSnippetHTML(snippet, options = {}) {
    const { keywordSwapMode, keywordSwapKeyword } = options;

    // This is a simplified version - we need the full token generation logic
    const tokenName = snippet.name;
    const fullSnippetHTML = snippet.content || '';

    // Create a token that represents the snippet insertion
    const tokenTemplate = `{{snippet:${snippet.id}}}`;
    const tokenContent = fullSnippetHTML;
    const tokenMeta = JSON.stringify({
      id: snippet.id,
      name: snippet.name,
      keywordSwap: keywordSwapKeyword ? {
        keyword: keywordSwapKeyword,
        mode: keywordSwapMode
      } : null
    });

    // Encode for HTML attributes
    const encodedTokenTemplate = tokenTemplate
      .replace(/%/g, '%25')
      .replace(/&/g, '&amp;')
      .replace(/ /g, '%20')
      .replace(/\{/g, '%7B')
      .replace(/\|/g, '%7C')
      .replace(/\}/g, '%7D')
      .replace(/\\/g, '%5C')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/"/g, '%22')
      .replace(/'/g, '%27')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E');

    const encodedTokenContent = tokenContent
      .replace(/%/g, '%25')
      .replace(/&/g, '&amp;')
      .replace(/ /g, '%20')
      .replace(/\{/g, '%7B')
      .replace(/\|/g, '%7C')
      .replace(/\}/g, '%7D')
      .replace(/\\/g, '%5C')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/"/g, '%22')
      .replace(/'/g, '%27')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E');

    const encodedTokenMeta = tokenMeta
      .replace(/%/g, '%25')
      .replace(/&/g, '&amp;')
      .replace(/ /g, '%20')
      .replace(/\{/g, '%7B')
      .replace(/\|/g, '%7C')
      .replace(/\}/g, '%7D')
      .replace(/\\/g, '%5C')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/"/g, '%22')
      .replace(/'/g, '%27')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E');

    // Return the token HTML that will be inserted
    return `<span e-token="cust_esl" token-template="${encodedTokenTemplate}" token-content="${encodedTokenContent}" token-meta="${encodedTokenMeta}" class="cbNonEditable" contenteditable="false">${tokenName}</span>`;
  }

  // ------------------------------------------------------------
  // Conditional Editor Input Keyword Swap functionality
  // ------------------------------------------------------------

  function initializeConditionalEditorKeywordSwap() {
    const existingConditionalEditors = document.querySelectorAll('cb-conditional-editor');
    existingConditionalEditors.forEach(function (editor) {
      if (!editor._gemConditionalKeywordSwapInitialized) {
        setupConditionalEditorKeywordSwap(editor);
      }
    });

    window.gemDomWatchSubscribe(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const conditionalEditor = node.matches && node.matches('cb-conditional-editor') ? node :
                                    node.querySelector && node.querySelector('cb-conditional-editor');

            if (conditionalEditor && !conditionalEditor._gemConditionalKeywordSwapInitialized) {
              setupConditionalEditorKeywordSwap(conditionalEditor);
            }
          }
        });
      });
    });

    console.log("[Gem-Keyword-Swap] Conditional editor keyword swap handler initialized");
  }

  function setupConditionalEditorKeywordSwap(conditionalEditor) {
    if (conditionalEditor._gemConditionalKeywordSwapInitialized) return;
    conditionalEditor._gemConditionalKeywordSwapInitialized = true;

    // Find all cb-personalizable-input elements within this conditional editor
    const personalizableInputs = conditionalEditor.querySelectorAll('cb-personalizable-input');
    personalizableInputs.forEach(input => {
      if (!input._gemKeywordSwapButtonAdded) {
        addKeywordSwapButtonToPersonalizableInput(input);
      }
    });

    console.log("[Gem-Keyword-Swap] Conditional editor keyword swap buttons added");
  }

  function addKeywordSwapButtonToPersonalizableInput(personalizableInput) {
    if (personalizableInput._gemKeywordSwapButtonAdded) return;
    personalizableInput._gemKeywordSwapButtonAdded = true;

    const inputGroup = personalizableInput.querySelector('.e-inputgroup');
    if (!inputGroup) return;

    const dropdown = inputGroup.querySelector('e-dropdown');
    if (!dropdown) return;

    // Create the keyword swap button using the same style as other toolbar buttons
    const swapButton = document.createElement('button');
    swapButton.className = 'e-btn e-btn-onlyicon e-inputgroup__item';
    swapButton.type = 'button';
    swapButton.setAttribute('aria-label', 'Swap Keywords');

    swapButton.innerHTML = `
      <gem-e-icon icon="style">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon">&#xF0DE;</div>
        </div>
      </gem-e-icon>
    `;

    // Add click handler
    swapButton.addEventListener('click', () => {
      performConditionalInputKeywordSwap(personalizableInput);
    });

    // Insert the button before the dropdown
    inputGroup.insertBefore(swapButton, dropdown);

    console.log("[Gem-Keyword-Swap] Conditional input keyword swap button added");
  }

  function performConditionalInputKeywordSwap(personalizableInput) {
    const input = personalizableInput.querySelector('input.e-input');
    if (!input) {
      console.log("[Gem-Keyword-Swap] No input element found in conditional personalizable input");
      window.gemShowToast && window.gemShowToast('Unable to access input content.', { type: 'error', duration: 4000 });
      return;
    }

    const textContent = input.value;
    console.log("[Gem-Keyword-Swap] Conditional input content:", textContent);

    if (!textContent.trim()) {
      window.gemShowToast && window.gemShowToast('Input is empty.', { type: 'info', duration: 4000 });
      return;
    }

    // Get snippets from storage
    if (typeof window.getSnippets !== 'function') {
      console.log("[Gem-Keyword-Swap] getSnippets function not available");
      window.gemShowToast && window.gemShowToast('Snippet functionality not available.', { type: 'error', duration: 4000 });
      return;
    }

    window.getSnippets((snippets) => {
      console.log("[Gem-Keyword-Swap] Retrieved snippets:", snippets.length);

      // Find snippets with keyword swap rules (excluding panel-only keywords)
      const swappableSnippets = snippets.filter(snippet => {
        if (!snippet.swapKeywords || !Array.isArray(snippet.swapKeywords)) return false;
        return snippet.swapKeywords.some(rule => rule.keyword && rule.keyword.trim() && rule.initiateFrom !== 'panel');
      });

      console.log("[Gem-Keyword-Swap] Swappable snippets found:", swappableSnippets.length);

      if (swappableSnippets.length === 0) {
        window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 4000 });
        return;
      }

      let modifiedText = textContent;
      let totalSwaps = 0;

      // Process each swappable snippet
      swappableSnippets.forEach(snippet => {
        snippet.swapKeywords.forEach(rule => {
          if (!rule.keyword || !rule.keyword.trim() || rule.initiateFrom === 'panel') return;

          const keyword = rule.keyword.trim();
          const mode = normalizeSwapMode(rule.swapMode || 'exact');
          const regex = createKeywordRegex(keyword, mode);

          console.log(`[Gem-Keyword-Swap] Testing snippet "${snippet.name}" keyword "${keyword}" mode "${mode}" regex:`, regex.source);

          // For conditional inputs, always use plain text content
          const replacementContent = snippet.content || '';

          if (replacementContent) {
            console.log(`[Gem-Keyword-Swap] Before replacement - text: "${modifiedText}", looking for: "${keyword}"`);
            const beforeText = modifiedText;
            modifiedText = modifiedText.replace(regex, replacementContent);
            const swaps = (beforeText.match(regex) || []).length - (modifiedText.match(regex) || []).length;
            if (swaps > 0) {
              totalSwaps += swaps;
              console.log(`[Gem-Keyword-Swap] Replaced ${swaps} occurrence(s) of "${keyword}" with "${replacementContent}"`);
              console.log(`[Gem-Keyword-Swap] After replacement - text: "${modifiedText}"`);
            } else {
              console.log(`[Gem-Keyword-Swap] No matches found for "${keyword}" in text`);
            }
          } else {
            console.log(`[Gem-Keyword-Swap] No replacement content for snippet "${snippet.name}"`);
          }
        });
      });

      console.log(`[Gem-Keyword-Swap] Total swaps performed: ${totalSwaps}`);

      if (totalSwaps > 0) {
        // Update the input value
        input.value = modifiedText;

        // Dispatch events to ensure Emarsys detects the change
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        window.gemShowToast && window.gemShowToast(`Performed ${totalSwaps} keyword swap${totalSwaps === 1 ? '' : 's'} in conditional input.`, { type: 'success', duration: 4000 });
      } else {
        window.gemShowToast && window.gemShowToast('No matching keywords found to swap in conditional input.', { type: 'info', duration: 4000 });
      }
    });
  }

  // ------------------------------------------------------------
  // Subject Line Keyword Swap functionality
  // ------------------------------------------------------------

  function initializeSubjectLineKeywordSwap() {
    const existingSubjectInput = document.querySelector('cb-personalizable-input-with-context#subject-line-input');
    if (existingSubjectInput && !existingSubjectInput._gemSubjectKeywordSwapInitialized) {
      setupSubjectLineKeywordSwap(existingSubjectInput);
    }

    window.gemDomWatchSubscribe(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const subjectInput = node.matches && node.matches('cb-personalizable-input-with-context#subject-line-input') ? node :
                                node.querySelector && node.querySelector('cb-personalizable-input-with-context#subject-line-input');

            if (subjectInput && !subjectInput._gemSubjectKeywordSwapInitialized) {
              setupSubjectLineKeywordSwap(subjectInput);
            }
          }
        });
      });
    });

    console.log("[Gem-Keyword-Swap] Subject line keyword swap handler initialized");
  }

  function setupSubjectLineKeywordSwap(subjectInput) {
    if (subjectInput._gemSubjectKeywordSwapInitialized) return;
    subjectInput._gemSubjectKeywordSwapInitialized = true;

    const toolbar = subjectInput.querySelector('vce-code-editor-toolbar');
    if (!toolbar) return;

    // Create the keyword swap button using the same style as other toolbar buttons
    const swapButton = document.createElement('e-tooltip');
    swapButton.setAttribute('content', 'Swap Keywords');
    swapButton.setAttribute('role', 'tooltip');
    swapButton.setAttribute('aria-description', 'Swap Keywords');

    const buttonWrapper = document.createElement('button');
    buttonWrapper.className = 'e-btn e-btn-onlyicon e-inputgroup__item';
    buttonWrapper.type = 'button';
    buttonWrapper.setAttribute('aria-label', 'Swap Keywords');

    buttonWrapper.innerHTML = `
      <gem-e-icon icon="style">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon">&#xF0DE;</div>
        </div>
      </gem-e-icon>
    `;

    // Add click handler
    buttonWrapper.addEventListener('click', () => {
      performSubjectLineKeywordSwap(subjectInput);
    });

    // Add the button to the tooltip
    swapButton.appendChild(buttonWrapper);

    // Add as the first child of the toolbar
    toolbar.insertBefore(swapButton, toolbar.firstChild);

    console.log("[Gem-Keyword-Swap] Subject line keyword swap button added");
  }

  function setSubjectLineContentWithRetry(text, cmInstance, cmEl, attempts = 5, delayMs = 100) {
    // Find the vce-codemirror element to update its html attribute
    const vceCm = cmEl ? cmEl.closest('vce-codemirror') : null;
    if (vceCm) {
      try {
        vceCm.setAttribute('html', text);
        console.log("[Gem-Keyword-Swap] Updated vce-codemirror html attribute");
      } catch (e) {
        console.log("[Gem-Keyword-Swap] Failed to update vce-codemirror html attribute:", e);
      }
    }

    // Also try to update the parent html editor if it exists
    const htmlEditor = vceCm ? vceCm.closest('vce-html-editor') : null;
    if (htmlEditor) {
      try {
        htmlEditor.setAttribute('html', text);
        console.log("[Gem-Keyword-Swap] Updated vce-html-editor html attribute");
      } catch (e) {
        console.log("[Gem-Keyword-Swap] Failed to update vce-html-editor html attribute:", e);
      }
    }

    // First try to use CodeMirror instance if available
    if (cmInstance && typeof cmInstance.setValue === 'function') {
      console.log("[Gem-Keyword-Swap] Setting content via CodeMirror instance");
      cmInstance.setValue(text);

      // Try focusing and blurring the CodeMirror to trigger change detection
      try {
        cmInstance.focus && cmInstance.focus();
        setTimeout(() => {
          try {
            cmInstance.getInputField && cmInstance.getInputField().blur();
          } catch (_) {}
        }, 10);
      } catch (_) {}
      return true;
    }

    // If CodeMirror instance not available, try DOM manipulation
    console.log("[Gem-Keyword-Swap] Using DOM fallback to set subject line content");

    // Try to find and update the textarea that CodeMirror uses
    const textarea = cmEl ? cmEl.querySelector('textarea') : null;
    if (textarea) {
      textarea.value = text;
      console.log("[Gem-Keyword-Swap] Set content in CodeMirror textarea");

      // Dispatch input and change events on the textarea
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      // Try to trigger CodeMirror's internal sync with textarea
      if (cmInstance) {
        // Some CodeMirror versions have a setValueFromTextArea method
        if (typeof cmInstance.setValueFromTextArea === 'function') {
          cmInstance.setValueFromTextArea();
          console.log("[Gem-Keyword-Swap] Called setValueFromTextArea");
        }
        // Try refresh to update display
        if (typeof cmInstance.refresh === 'function') {
          cmInstance.refresh();
          console.log("[Gem-Keyword-Swap] Called CodeMirror refresh");
        }
      }
      return true;
    }

    // Last resort: update the visual pre element
    const pre = cmEl ? cmEl.querySelector('pre.CodeMirror-line') : null;
    if (pre) {
      pre.textContent = text;
      console.log("[Gem-Keyword-Swap] Set content in DOM pre element (fallback)");
      return true;
    }

    console.log("[Gem-Keyword-Swap] Could not find textarea or pre element for DOM fallback");

    // Retry if attempts remain
    if (attempts > 1) {
      setTimeout(() => {
        // Re-check for CodeMirror instance
        const newCmInstance = cmEl ? (cmEl.CodeMirror || null) : null;
        setSubjectLineContentWithRetry(text, newCmInstance, cmEl, attempts - 1, delayMs);
      }, delayMs);
    }

    return false;
  }

  function performSubjectLineKeywordSwap(subjectInput) {
    // Find the CodeMirror element within the subject line input
    const vceCm = subjectInput.querySelector('vce-codemirror');
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : null;
    const cmInstance = cmEl ? (cmEl.CodeMirror || null) : null;

    console.log("[Gem-Keyword-Swap] Subject line CodeMirror debug:", {
      vceCm: !!vceCm,
      cmEl: !!cmEl,
      cmInstance: !!cmInstance,
      hasGetValue: cmInstance && typeof cmInstance.getValue === 'function'
    });

    // Get the text content, with fallback methods
    let textContent = '';
    if (cmInstance && typeof cmInstance.getValue === 'function') {
      textContent = cmInstance.getValue();
      console.log("[Gem-Keyword-Swap] Got content via CodeMirror instance:", textContent);
    } else if (cmEl) {
      // Fallback: get content from the DOM
      const pre = cmEl.querySelector('pre.CodeMirror-line');
      textContent = pre ? (pre.textContent || '') : '';
      console.log("[Gem-Keyword-Swap] Got content via DOM fallback:", textContent, "pre element found:", !!pre);
    }

    if (!textContent && !cmEl) {
      console.log("[Gem-Keyword-Swap] No CodeMirror element found in subject line");
      window.gemShowToast && window.gemShowToast('Unable to access subject line content.', { type: 'error', duration: 4000 });
      return;
    }
    console.log("[Gem-Keyword-Swap] Subject line content:", textContent);

    if (!textContent.trim()) {
      window.gemShowToast && window.gemShowToast('Subject line is empty.', { type: 'info', duration: 4000 });
      return;
    }

    // Get snippets from storage
    if (typeof window.getSnippets !== 'function') {
      console.log("[Gem-Keyword-Swap] getSnippets function not available");
      window.gemShowToast && window.gemShowToast('Snippet functionality not available.', { type: 'error', duration: 4000 });
      return;
    }

    window.getSnippets((snippets) => {
      console.log("[Gem-Keyword-Swap] Retrieved snippets:", snippets.length);

      // Find snippets with keyword swap rules (excluding panel-only keywords)
      const swappableSnippets = snippets.filter(snippet => {
        if (!snippet.swapKeywords || !Array.isArray(snippet.swapKeywords)) return false;
        return snippet.swapKeywords.some(rule => rule.keyword && rule.keyword.trim() && rule.initiateFrom !== 'panel');
      });

      console.log("[Gem-Keyword-Swap] Swappable snippets found:", swappableSnippets.length);

      if (swappableSnippets.length === 0) {
        window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 4000 });
        return;
      }

      let modifiedText = textContent;
      let totalSwaps = 0;

      // Process each swappable snippet
      swappableSnippets.forEach(snippet => {
        snippet.swapKeywords.forEach(rule => {
          if (!rule.keyword || !rule.keyword.trim() || rule.initiateFrom === 'panel') return;

          const keyword = rule.keyword.trim();
          const mode = normalizeSwapMode(rule.swapMode || 'exact');
          const regex = createKeywordRegex(keyword, mode);

          console.log(`[Gem-Keyword-Swap] Testing snippet "${snippet.name}" keyword "${keyword}" mode "${mode}" regex:`, regex.source);

          // For subject line, always use plain text content
          const replacementContent = snippet.content || '';

          if (replacementContent) {
            console.log(`[Gem-Keyword-Swap] Before replacement - text: "${modifiedText}", looking for: "${keyword}"`);
            const beforeText = modifiedText;
            modifiedText = modifiedText.replace(regex, replacementContent);
            const swaps = (beforeText.match(regex) || []).length - (modifiedText.match(regex) || []).length;
            if (swaps > 0) {
              totalSwaps += swaps;
              console.log(`[Gem-Keyword-Swap] Replaced ${swaps} occurrence(s) of "${keyword}" with "${replacementContent}"`);
              console.log(`[Gem-Keyword-Swap] After replacement - text: "${modifiedText}"`);
            } else {
              console.log(`[Gem-Keyword-Swap] No matches found for "${keyword}" in text`);
            }
          } else {
            console.log(`[Gem-Keyword-Swap] No replacement content for snippet "${snippet.name}"`);
          }
        });
      });

      console.log(`[Gem-Keyword-Swap] Total swaps performed: ${totalSwaps}`);

      if (totalSwaps > 0) {
        // Set the modified text back to CodeMirror with retry mechanism
        setSubjectLineContentWithRetry(modifiedText, cmInstance, cmEl);

        // Trigger events to ensure Emarsys detects the change (similar to preheader)
        if (cmEl) {
          cmEl.dispatchEvent(new Event('input', { bubbles: true }));
          cmEl.dispatchEvent(new Event('change', { bubbles: true }));
          cmEl.dispatchEvent(new Event('keydown', { bubbles: true }));
          cmEl.dispatchEvent(new Event('keyup', { bubbles: true }));
          cmEl.dispatchEvent(new Event('keypress', { bubbles: true }));
        }

        window.gemShowToast && window.gemShowToast(`Performed ${totalSwaps} keyword swap${totalSwaps === 1 ? '' : 's'} in subject line.`, { type: 'success', duration: 4000 });
      } else {
        window.gemShowToast && window.gemShowToast('No matching keywords found to swap in subject line.', { type: 'info', duration: 4000 });
      }
    });
  }

  // Initialize all keyword swap functionalities
  initializePreheaderKeywordSwap();
  initializeConditionalEditorKeywordSwap();
  initializeSubjectLineKeywordSwap();

  console.log("[Gem-Keyword-Swap] Keyword swap functionality initialized");
}

// Make the keyword swap functionality available globally
console.log("[Gem-Keyword-Swap] Assigning initializeKeywordSwap to window");
window.initializeKeywordSwap = initializeKeywordSwap;
console.log("[Gem-Keyword-Swap] window.initializeKeywordSwap assigned:", typeof window.initializeKeywordSwap);
try {
  window.dispatchEvent(new CustomEvent('gem:keyword-swap-ready'));
} catch (_) {}

// Check if overlay-panel-controls has already been initialized and try to initialize immediately
// This handles the case where keyword-swap.js loads after overlay-panel-controls.js
if (window.initializeOverlayPanelControls && document.readyState !== 'loading') {
  console.log("[Gem-Keyword-Swap] overlay-panel-controls appears to be loaded, initializing immediately");
  initializeKeywordSwap();
}
