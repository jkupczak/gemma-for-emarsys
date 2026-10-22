console.log("[Gem][KeywordSwap] keyword-swap.js loaded");

// Keyword swap functionality for both content block toolbar and preheader textarea
function initializeKeywordSwap() {
  if (window.__gemKeywordSwapInitialized) return;
  window.__gemKeywordSwapInitialized = true;

  console.log("[Gem][KeywordSwap] Initializing keyword swap functionality - function called!");

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

    console.log("[Gem][KeywordSwap] Preheader keyword swap handler initialized");
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

    console.log("[Gem][KeywordSwap] Preheader keyword swap button added");
  }

  function performPreheaderKeywordSwap(preheader) {
    const textarea = preheader.querySelector('textarea');
    if (!textarea) {
      console.log("[Gem][KeywordSwap] No textarea found in preheader");
      return;
    }

    const textContent = textarea.value;
    console.log("[Gem][KeywordSwap] Preheader textarea content:", textContent);

    if (!textContent.trim()) {
      window.gemShowToast && window.gemShowToast('Preheader text is empty.', { type: 'info', duration: 4000 });
      return;
    }

    // Get all snippets that have keyword swap rules
    getSnippets((snippets) => {
      console.log("[Gem][KeywordSwap] Retrieved snippets for preheader swap:", snippets.length);
      const swappableSnippets = snippets.filter((snippet) => {
        const rules = normalizeSwapKeywordsFromSnippet(snippet);
        const hasRules = rules.some((r) => swapRuleRunsIn(r, 'preheader'));
        console.log(`[Gem][KeywordSwap] Snippet "${snippet.name}" has swappable rules:`, hasRules, rules);
        return hasRules;
      });

      console.log("[Gem][KeywordSwap] Found swappable snippets:", swappableSnippets.length);

      if (!swappableSnippets.length) {
        window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 4000 });
        return;
      }

      // Preheader is a plain textarea, so swaps insert the snippet's ESL content (not a token).
      const swapRules = [];
      swappableSnippets.forEach((snippet) => {
        normalizeSwapKeywordsFromSnippet(snippet)
          .filter((r) => swapRuleRunsIn(r, 'preheader'))
          .forEach((rule) => {
            swapRules.push({
              keyword: rule.keyword,
              matchRule: rule.matchRule,
              replacement: window.gemSnippetVariants.contentFor(snippet, 'preheader') || snippet.name,
            });
          });
      });

      const { text: modifiedText, count: totalSwaps } = replaceKeywordsInOnePass(textContent, swapRules);

      console.log(`[Gem][KeywordSwap] Total swaps performed: ${totalSwaps}`);

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

  // Subject, preheader and conditional inputs only take "Anywhere" rules; Panel/Toolbar are body-only.
  function swapRuleRunsIn(rule, location) {
    return !!(rule && rule.keyword && rule.initiateFrom === 'anywhere' && window.gemSwapLocations.allows(rule, location));
  }

  function normalizeSwapKeywordsFromSnippet(snippet) {
    if (!snippet) return [];

    // New format: [{ keyword, mode }]
    if (Array.isArray(snippet.swapKeywords)) {
      const cleaned = snippet.swapKeywords
        .map((k) => ({
          keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
          mode: normalizeSwapMode(k && k.mode),
          matchRule: normalizeSwapMatchRule(k && k.matchRule),
          initiateFrom: normalizeSwapInitiateFrom(k && k.initiateFrom),
          locations: window.gemSwapLocations.normalize(k && k.locations)
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

  /**
   * Apply every rule against the original text in one pass. Inserted snippet content is never
   * re-scanned, so a later keyword (e.g. `hello`) can't match inside an earlier replacement.
   * Overlaps go to the earliest match, then the longest, then the earlier rule.
   * @param {string} text
   * @param {{ keyword: string, matchRule: string, replacement: string }[]} rules
   * @returns {{ text: string, count: number }}
   */
  function replaceKeywordsInOnePass(text, rules) {
    const source = String(text ?? '');
    const candidates = [];
    rules.forEach((rule, priority) => {
      if (!rule || !rule.keyword || !rule.replacement) return;
      const regex = createKeywordRegex(rule.keyword, rule.matchRule);
      let m;
      while ((m = regex.exec(source)) !== null) {
        if (!m[0].length) {
          regex.lastIndex += 1;
          continue;
        }
        candidates.push({ start: m.index, end: m.index + m[0].length, priority, replacement: rule.replacement });
      }
    });
    if (!candidates.length) return { text: source, count: 0 };

    candidates.sort((a, b) =>
      a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.priority - b.priority
    );
    let out = '';
    let cursor = 0;
    let count = 0;
    candidates.forEach((c) => {
      if (c.start < cursor) return;
      out += source.slice(cursor, c.start) + c.replacement;
      cursor = c.end;
      count += 1;
    });
    out += source.slice(cursor);
    return { text: out, count };
  }

  const CM_TOKEN_BLOCK_RE =
    /\{# (?:pers-token:1|cond-token:1) [^#]+ #\}[\s\S]*?\{# (?:pers-token:1|cond-token:1) #\}/g;

  function splitPersonalizableHtmlSegments(html) {
    const source = String(html ?? '');
    const segments = [];
    const re = new RegExp(CM_TOKEN_BLOCK_RE.source, 'g');
    let last = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      if (match.index > last) {
        segments.push({ type: 'text', text: source.slice(last, match.index) });
      }
      segments.push({ type: 'token', text: match[0] });
      last = match.index + match[0].length;
    }
    if (last < source.length) {
      segments.push({ type: 'text', text: source.slice(last) });
    }
    if (!segments.length) segments.push({ type: 'text', text: source });
    return segments;
  }

  function buildKeywordSwapReplacement(snippet, mode, location = 'subject') {
    const slot = window.gemSnippetSource?.slotForLocation(snippet, location);
    if (slot && slot.contentSource === 'personalization') {
      const token = window.gemSnippetSource.findPersTokenById(slot.persTokenId);
      if (!token) return '';
      const preview =
        typeof window.gemBuildPersonalizationPreview === 'function'
          ? window.gemBuildPersonalizationPreview(token)
          : '';
      if (mode === 'token' && typeof window.gemBuildPersonalizationCodeMirrorToken === 'function') {
        return window.gemBuildPersonalizationCodeMirrorToken(token) || preview;
      }
      return preview;
    }
    const content = window.gemSnippetVariants.contentFor(snippet, location);
    if (mode === 'token' && typeof window.gemBuildGemmaCodeMirrorToken === 'function') {
      const token = window.gemBuildGemmaCodeMirrorToken(snippet.name, content);
      if (token) return token;
    }
    return content;
  }

  function collectSubjectLineSwapRules(snippets) {
    const rules = [];
    const seenKeyword = new Set();
    (Array.isArray(snippets) ? snippets : []).forEach((snippet) => {
      normalizeSwapKeywordsFromSnippet(snippet).forEach((rule) => {
        if (!swapRuleRunsIn(rule, 'subject')) return;
        if (seenKeyword.has(rule.keyword)) return;
        seenKeyword.add(rule.keyword);
        rules.push({
          keyword: rule.keyword,
          mode: rule.mode,
          matchRule: rule.matchRule,
          snippet,
        });
      });
    });
    rules.sort((a, b) => b.keyword.length - a.keyword.length);
    return rules;
  }

  function applyKeywordSwapsOutsideTokens(html, rules) {
    const segments = splitPersonalizableHtmlSegments(html);
    const resolvedRules = rules.map((rule) => ({
      keyword: rule.keyword,
      matchRule: rule.matchRule,
      replacement: buildKeywordSwapReplacement(rule.snippet, rule.mode),
    }));
    let totalSwaps = 0;
    const next = segments.map((segment) => {
      if (segment.type !== 'text') return segment.text;
      const result = replaceKeywordsInOnePass(segment.text, resolvedRules);
      totalSwaps += result.count;
      return result.text;
    });
    return { text: next.join(''), totalSwaps };
  }

  function normalizeSwapInitiateFrom(initiateFrom) {
    if (typeof initiateFrom === 'string') {
      const m = initiateFrom.toLowerCase().trim();
      if (['anywhere', 'toolbar', 'panel'].includes(m)) return m;
    }
    return 'anywhere'; // default
  }

  function generateSnippetHTML(snippet, options = {}) {
    const content = snippet.content || '';
    if (typeof window.gemGenerateSnippetHTML === 'function') {
      return window.gemGenerateSnippetHTML(snippet.name, content);
    }
    if (window.gemCustEslToken && typeof window.gemCustEslToken.generateSnippetHTML === 'function') {
      return window.gemCustEslToken.generateSnippetHTML(snippet.name, content);
    }
    return `<span e-token="cust_esl" class="cbNonEditable" contenteditable="false">${snippet.name}</span>`;
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

    console.log("[Gem][KeywordSwap] Conditional editor keyword swap handler initialized");
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

    console.log("[Gem][KeywordSwap] Conditional editor keyword swap buttons added");
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

    console.log("[Gem][KeywordSwap] Conditional input keyword swap button added");
  }

  function performConditionalInputKeywordSwap(personalizableInput) {
    const input = personalizableInput.querySelector('input.e-input');
    if (!input) {
      console.log("[Gem][KeywordSwap] No input element found in conditional personalizable input");
      window.gemShowToast && window.gemShowToast('Unable to access input content.', { type: 'error', duration: 4000 });
      return;
    }

    const textContent = input.value;
    console.log("[Gem][KeywordSwap] Conditional input content:", textContent);

    if (!textContent.trim()) {
      window.gemShowToast && window.gemShowToast('Input is empty.', { type: 'info', duration: 4000 });
      return;
    }

    // Get snippets from storage
    if (typeof window.getSnippets !== 'function') {
      console.log("[Gem][KeywordSwap] getSnippets function not available");
      window.gemShowToast && window.gemShowToast('Snippet functionality not available.', { type: 'error', duration: 4000 });
      return;
    }

    window.getSnippets((snippets) => {
      console.log("[Gem][KeywordSwap] Retrieved snippets:", snippets.length);

      // Find snippets with keyword swap rules (excluding panel-only keywords)
      const swappableSnippets = snippets.filter(snippet =>
        normalizeSwapKeywordsFromSnippet(snippet).some(rule => swapRuleRunsIn(rule, 'conditions'))
      );

      console.log("[Gem][KeywordSwap] Swappable snippets found:", swappableSnippets.length);

      if (swappableSnippets.length === 0) {
        window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 4000 });
        return;
      }

      // Conditional inputs are plain text fields, so swaps insert the snippet's ESL content.
      const swapRules = [];
      swappableSnippets.forEach(snippet => {
        normalizeSwapKeywordsFromSnippet(snippet).forEach(rule => {
          if (!swapRuleRunsIn(rule, 'conditions')) return;
          swapRules.push({
            keyword: rule.keyword,
            matchRule: rule.matchRule,
            replacement: window.gemSnippetVariants.contentFor(snippet, 'conditions'),
          });
        });
      });

      const { text: modifiedText, count: totalSwaps } = replaceKeywordsInOnePass(textContent, swapRules);

      console.log(`[Gem][KeywordSwap] Total swaps performed: ${totalSwaps}`);

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
    trySetupSubjectLineKeywordSwap();

    window.gemDomWatchSubscribe(function () {
      trySetupSubjectLineKeywordSwap();
    });

    console.log("[Gem][KeywordSwap] Subject line keyword swap handler initialized");
  }

  function trySetupSubjectLineKeywordSwap() {
    const subjectInput = document.querySelector('cb-personalizable-input-with-context#subject-line-input');
    if (subjectInput) setupSubjectLineKeywordSwap(subjectInput);
  }

  function findSubjectLineGeneratorTooltip(subjectInput) {
    const generatorButton = subjectInput.querySelector('button[aria-label="Subject Line Generator"]');
    if (!generatorButton) return null;
    return generatorButton.closest('e-tooltip') || generatorButton;
  }

  function setupSubjectLineKeywordSwap(subjectInput) {
    if (subjectInput._gemSubjectKeywordSwapInitialized) return;
    if (subjectInput.querySelector('.gem-subject-swap-keywords-btn')) {
      subjectInput._gemSubjectKeywordSwapInitialized = true;
      return;
    }

    const generatorTooltip = findSubjectLineGeneratorTooltip(subjectInput);
    if (!generatorTooltip || !generatorTooltip.parentNode) return;

    subjectInput._gemSubjectKeywordSwapInitialized = true;

    // Create the keyword swap button using the same style as other toolbar buttons
    const swapButton = document.createElement('e-tooltip');
    swapButton.setAttribute('content', 'Swap Keywords');
    swapButton.setAttribute('role', 'tooltip');
    swapButton.setAttribute('aria-description', 'Swap Keywords');
    swapButton.className = 'gem-subject-swap-keywords-btn';

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

    buttonWrapper.addEventListener('click', () => {
      performSubjectLineKeywordSwap(subjectInput);
    });

    swapButton.appendChild(buttonWrapper);
    generatorTooltip.parentNode.insertBefore(swapButton, generatorTooltip);

    console.log("[Gem][KeywordSwap] Subject line keyword swap button added");
  }

  function applySubjectLineHtml(vceCm, html) {
    if (!vceCm) return;
    try {
      vceCm.setAttribute('html', html);
    } catch (_) {}
    const htmlEditor = vceCm.closest('vce-html-editor');
    if (!htmlEditor) return;
    try {
      htmlEditor.setAttribute('html', html);
    } catch (_) {}
  }

  function markSubjectLineDirty(cmEl) {
    const textarea = cmEl ? cmEl.querySelector('textarea') : null;
    if (textarea && typeof window.gemMarkEmarsysTextControlDirty === 'function') {
      window.gemMarkEmarsysTextControlDirty(textarea);
      return;
    }
    if (!cmEl) return;
    cmEl.dispatchEvent(new Event('input', { bubbles: true }));
    cmEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSubjectLineContentWithRetry(text, cmInstance, cmEl, attempts = 5, delayMs = 100) {
    const vceCm = cmEl ? cmEl.closest('vce-codemirror') : null;
    const hasTokens =
      String(text).includes('pers-token:1') || String(text).includes('cond-token:1');

    if (hasTokens && vceCm) {
      let hadAutoRefresh = null;
      try {
        hadAutoRefresh = vceCm.getAttribute('auto-refresh');
        vceCm.setAttribute('auto-refresh', 'false');
        applySubjectLineHtml(vceCm, '');
      } catch (_) {}

      requestAnimationFrame(() => {
        applySubjectLineHtml(vceCm, text);
        try {
          if (hadAutoRefresh != null) vceCm.setAttribute('auto-refresh', hadAutoRefresh);
          else vceCm.setAttribute('auto-refresh', 'true');
        } catch (_) {}
        try {
          vceCm.dispatchEvent(new Event('input', { bubbles: true }));
          vceCm.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        markSubjectLineDirty(cmEl);
      });
      return true;
    }

    applySubjectLineHtml(vceCm, text);

    if (cmInstance && typeof cmInstance.setValue === 'function') {
      cmInstance.setValue(text);
      try {
        cmInstance.focus && cmInstance.focus();
        setTimeout(() => {
          try {
            cmInstance.getInputField && cmInstance.getInputField().blur();
          } catch (_) {}
        }, 10);
      } catch (_) {}
      markSubjectLineDirty(cmEl);
      return true;
    }

    const textarea = cmEl ? cmEl.querySelector('textarea') : null;
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      markSubjectLineDirty(cmEl);
      return true;
    }

    const pre = cmEl ? cmEl.querySelector('pre.CodeMirror-line') : null;
    if (pre) {
      pre.textContent = text;
      return true;
    }

    if (attempts > 1) {
      setTimeout(() => {
        const resolved =
          (typeof window.gemResolveCodeMirrorInstance === 'function'
            ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
            : null) ||
          (cmEl ? cmEl.CodeMirror || null : null);
        setSubjectLineContentWithRetry(text, resolved, cmEl, attempts - 1, delayMs);
      }, delayMs);
    }

    return false;
  }

  function getSubjectLineSourceHtml(subjectInput, vceCm, cmInstance, cmEl) {
    const attrHtml = vceCm ? vceCm.getAttribute('html') : null;
    let cmValue = '';
    try {
      cmValue =
        cmInstance && typeof cmInstance.getValue === 'function' ? cmInstance.getValue() : '';
    } catch (_) {}

    if (attrHtml != null && (attrHtml.includes('pers-token:1') || attrHtml.includes('cond-token:1'))) {
      return attrHtml;
    }
    if (cmValue.includes('pers-token:1') || cmValue.includes('cond-token:1')) {
      return cmValue;
    }
    if (attrHtml != null && attrHtml !== '') return attrHtml;
    if (cmValue) return cmValue;

    const pre = cmEl ? cmEl.querySelector('pre.CodeMirror-line') : null;
    return pre ? pre.textContent || '' : '';
  }

  function performSubjectLineKeywordSwap(subjectInput) {
    const vceCm = subjectInput.querySelector('vce-codemirror');
    const cmEl = vceCm ? vceCm.querySelector('.CodeMirror') : null;
    const cmInstance =
      (typeof window.gemResolveCodeMirrorInstance === 'function'
        ? window.gemResolveCodeMirrorInstance(cmEl, vceCm, null)
        : null) ||
      (cmEl ? cmEl.CodeMirror || null : null);

    const textContent = getSubjectLineSourceHtml(subjectInput, vceCm, cmInstance, cmEl);
    console.log("[Gem][KeywordSwap] Subject line source:", textContent);

    if (!textContent && !cmEl) {
      window.gemShowToast && window.gemShowToast('Unable to access subject line content.', { type: 'error', duration: 4000 });
      return;
    }

    if (!String(textContent).trim()) {
      window.gemShowToast && window.gemShowToast('Subject line is empty.', { type: 'info', duration: 4000 });
      return;
    }

    if (typeof window.getSnippets !== 'function') {
      window.gemShowToast && window.gemShowToast('Snippet functionality not available.', { type: 'error', duration: 4000 });
      return;
    }

    window.getSnippets((snippets) => {
      const rules = collectSubjectLineSwapRules(snippets);
      if (!rules.length) {
        window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 4000 });
        return;
      }

      const { text: modifiedText, totalSwaps } = applyKeywordSwapsOutsideTokens(textContent, rules);
      console.log("[Gem][KeywordSwap] Subject line swaps:", totalSwaps);

      if (totalSwaps > 0) {
        setSubjectLineContentWithRetry(modifiedText, cmInstance, cmEl);
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

  console.log("[Gem][KeywordSwap] Keyword swap functionality initialized");
}

// Make the keyword swap functionality available globally
console.log("[Gem][KeywordSwap] Assigning initializeKeywordSwap to window");
window.initializeKeywordSwap = initializeKeywordSwap;
console.log("[Gem][KeywordSwap] window.initializeKeywordSwap assigned:", typeof window.initializeKeywordSwap);
try {
  window.dispatchEvent(new CustomEvent('gem:keyword-swap-ready'));
} catch (_) {}

// Check if overlay-panel-controls has already been initialized and try to initialize immediately
// This handles the case where keyword-swap.js loads after overlay-panel-controls.js
if (window.initializeOverlayPanelControls && document.readyState !== 'loading') {
  console.log("[Gem][KeywordSwap] overlay-panel-controls appears to be loaded, initializing immediately");
  initializeKeywordSwap();
}
