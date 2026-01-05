console.log("[gem] content-block-toolbar.js loaded");

// Content Block Toolbar management - CSS-only approach
function initializeContentBlockToolbar() {
  console.log("[gem] Initializing content block toolbar management");

  // Apply initial settings as CSS classes on body
  applyToolbarSettingsAsClasses();

  // Watch for setting changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    // Check if chrome APIs are still available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    // Check if any toolbar settings changed
    const toolbarSettings = [
      'manageOptionalContent',
      'predictRecommendationSettings',
      'productFinder',
      'productSource',
      'saveToReuse',
      'resetBlock',
      'convertEslToTokens'
    ];

    const hasToolbarChange = toolbarSettings.some(setting =>
      changes.hasOwnProperty(setting)
    );

    if (hasToolbarChange) {
      console.log("[gem] Toolbar settings changed, reapplying CSS classes");
      applyToolbarSettingsAsClasses();
    }
  });

  // Inject extra toolbar actions when the toolbar appears
  setupToolbarInjectionObserver();
}

function applyToolbarSettingsAsClasses() {
  chrome.storage.sync.get({
    manageOptionalContent: "hide-if-disabled",
    predictRecommendationSettings: "hide-if-disabled",
    productFinder: "always-show",
    productSource: "hide-if-disabled",
    saveToReuse: "always-show",
    resetBlock: "always-show",
    convertEslToTokens: "always-show"
  }, (settings) => {
    console.log("[gem] Applying toolbar settings as CSS classes:", settings);

    // Remove all existing toolbar classes
    document.body.classList.forEach(className => {
      if (className.startsWith('gem-toolbar-')) {
        document.body.classList.remove(className);
      }
    });

    // Add classes based on settings
    Object.entries(settings).forEach(([setting, value]) => {
      document.body.classList.add(`gem-toolbar-${setting}-${value}`);
    });
  });
}

// ------------------------------------------------------------
// Convert ESL → Tokens toolbar button
// ------------------------------------------------------------

const GEM_TOOLBAR_SELECTOR = '.toolbar.e-contentblocks-toolbar';
const GEM_TOOLBAR_ACTIONS_SELECTOR = '.toolbar.e-contentblocks-toolbar .e-contentblocks-toolbar__actions';
const GEM_REORDER_BTN_SELECTOR = '[e-button-id="reorder-block"] > .e-btn';
const GEM_TARGET_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe';

const GEM_CONVERT_BTN_ID = 'gem-convert-esl-to-tokens';
const GEM_CONVERT_BTN_CLASS = 'gemConvertESLToTokens';

const GEM_ESL_TOKEN_NAME = 'ESL snippet';
// Match ESL variable-ish strings like {{ something }} but avoid curly-quote noise.
const GEM_ESL_REGEX = /\{\{[^”“‘’}]+\}\}/g;
const GEM_ESL_RDS_PREFIX_REGEX = /^\{\{\s*rds\./;
const GEM_ESL_RDS_NAME_REGEX = /\]\.[^\s\|]+/;
const GEM_ESL_CONTACT_NAME_REGEX = /contact\.\d+/;

let gemToolbarObserver = null;

function setupToolbarInjectionObserver() {
  if (gemToolbarObserver) return;

  const injectIfPresent = () => {
    const toolbar = document.querySelector(GEM_TOOLBAR_SELECTOR);
    if (!toolbar) return;
    injectConvertButtonIntoToolbar(toolbar);
  };

  gemToolbarObserver = new MutationObserver(() => injectIfPresent());
  gemToolbarObserver.observe(document.body, { childList: true, subtree: true });

  // Also try once immediately
  injectIfPresent();
}

function injectConvertButtonIntoToolbar(toolbarEl) {
  const actions = toolbarEl.querySelector(GEM_TOOLBAR_ACTIONS_SELECTOR);
  if (!actions) return;

  // Avoid duplicates per toolbar instance
  if (actions.querySelector(`[block-toolbar-button="${GEM_CONVERT_BTN_ID}"]`)) return;

  const reorderBtn = toolbarEl.querySelector(GEM_REORDER_BTN_SELECTOR);
  if (!reorderBtn) return;

  const eBlockId = reorderBtn.getAttribute('e-block-id') || '';
  const blockTemplateName = reorderBtn.getAttribute('blocktemplatename') || '';
  const blockPosition = reorderBtn.getAttribute('blockposition') || '';

  const tooltip = document.createElement('e-tooltip');
  tooltip.setAttribute('content', 'Convert ESL to Tokens');
  tooltip.setAttribute('e-button-id', GEM_CONVERT_BTN_ID);
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-description', 'Convert ESL to Tokens');

  // Inner button (matches Emarsys structure closely)
  const btn = document.createElement('div');
  btn.className = `e-btn e-btn-onlyicon e-btn-on_overlay e-svgclickfix ${GEM_CONVERT_BTN_CLASS}`;
  btn.setAttribute('block-toolbar-button', GEM_CONVERT_BTN_ID);
  if (eBlockId) btn.setAttribute('e-block-id', eBlockId);
  if (blockTemplateName) btn.setAttribute('blocktemplatename', blockTemplateName);
  if (blockPosition) btn.setAttribute('blockposition', blockPosition);

  btn.innerHTML = `
    <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon">&#xF199;</div>
      </div>
    </gem-e-icon>
  `.trim();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const id = btn.getAttribute('e-block-id');
    if (!id) return;
    convertEslToTokensForBlock(id);
  });

  tooltip.appendChild(btn);
  // Insert as the second child (index 1). If there is no second child, append.
  const secondChild = actions.children && actions.children.length > 1 ? actions.children[1] : null;
  if (secondChild) {
    actions.insertBefore(tooltip, secondChild);
  } else {
    actions.appendChild(tooltip);
  }
}

function escapeTokenContentForAttribute(value) {
  // Must match snippets-tab.js "escapeHtmlAttribute" behavior used for token-content.
  return String(value)
    .replace(/%/g, '%25')
    .replace(/&/g, '&amp;')
    .replace(/ /g, '%20')
    .replace(/\{/g, '%7B')
    .replace(/\|/g, '%7C')
    .replace(/\}/g, '%7D')
    .replace(/\\/g, '%5C')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, '%22');
}

function createEslTokenSpan(doc, name, script) {
  const tokenContent = JSON.stringify({ script });
  const encodedTokenContent = escapeTokenContentForAttribute(tokenContent);
  const encodedTokenTemplate = '%22%3C%25=%20script%20%25%3E%22';
  const encodedTokenMeta = '%7B%7D';

  const span = doc.createElement('span');
  span.setAttribute('e-token', 'cust_esl');
  span.setAttribute('token-template', encodedTokenTemplate);
  span.setAttribute('token-content', encodedTokenContent);
  span.setAttribute('token-meta', encodedTokenMeta);
  span.setAttribute('contenteditable', 'false');
  span.className = 'cbNonEditable';
  span.style.backgroundColor = '#6597cf';
  span.style.borderRadius = '.3em';
  span.style.boxShadow = '0 0 0 0.2em #6597cf';
  span.style.color = '#fff';
  span.textContent = name;
  return span;
}

function deriveTokenNameFromMatch(raw) {
  const s = String(raw || '');

  // If starts with {{ rds.
  if (GEM_ESL_RDS_PREFIX_REGEX.test(s)) {
    const m = s.match(GEM_ESL_RDS_NAME_REGEX);
    if (m && m[0]) {
      // Strip leading "]."
      return m[0].startsWith('].') ? m[0].slice(2) : m[0];
    }
    return GEM_ESL_TOKEN_NAME;
  }

  // Else, if contains contact.<digits>
  const c = s.match(GEM_ESL_CONTACT_NAME_REGEX);
  if (c && c[0]) return c[0];

  return GEM_ESL_TOKEN_NAME;
}

function convertEslToTokensForBlock(eBlockId) {
  const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
  if (!iframe) return;

  let doc;
  try {
    doc = iframe.contentDocument || iframe.contentWindow?.document;
  } catch (e) {
    return;
  }
  if (!doc) return;

  const blockEls = Array.from(doc.querySelectorAll(`[e-block-id="${CSS.escape(eBlockId)}"]`));
  if (!blockEls.length) return;

  const isInsideExistingToken = (node) => {
    let cur = node;
    while (cur) {
      if (cur.nodeType === 1) {
        const el = cur;
        if (el.matches && (el.matches('span[e-token="cust_esl"]') || el.classList.contains('cbNonEditable'))) {
          return true;
        }
      }
      cur = cur.parentNode;
    }
    return false;
  };

  let didChange = false;

  blockEls.forEach((blockEl) => {
    const editables = Array.from(blockEl.querySelectorAll('[contenteditable="true"]'));
    editables.forEach((editable) => {
      const walker = doc.createTreeWalker(
        editable,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            // reset regex state due to global flag usage
            GEM_ESL_REGEX.lastIndex = 0;
            if (!GEM_ESL_REGEX.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
            GEM_ESL_REGEX.lastIndex = 0;
            if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);

      nodes.forEach((textNode) => {
        const text = textNode.nodeValue;
        GEM_ESL_REGEX.lastIndex = 0;

        const frag = doc.createDocumentFragment();
        let lastIdx = 0;
        let match;

        while ((match = GEM_ESL_REGEX.exec(text)) !== null) {
          const start = match.index;
          const end = start + match[0].length;

          // text before
          if (start > lastIdx) {
            frag.appendChild(doc.createTextNode(text.slice(lastIdx, start)));
          }

          // token
          frag.appendChild(createEslTokenSpan(doc, deriveTokenNameFromMatch(match[0]), match[0]));
          didChange = true;

          lastIdx = end;
        }

        // trailing text
        if (lastIdx < text.length) {
          frag.appendChild(doc.createTextNode(text.slice(lastIdx)));
        }

        if (textNode.parentNode) {
          textNode.parentNode.replaceChild(frag, textNode);
        }
      });

      if (didChange) {
        // Notify editor
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        editable.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentBlockToolbar);
} else {
  initializeContentBlockToolbar();
}
