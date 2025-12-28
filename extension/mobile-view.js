console.log("mobile-view.js loaded");

const DEFAULT_MOBILE_WIDTH = 414;
const DEFAULT_MOBILE_SCALE = 0.5;
const MIN_BASE_WIDTH = 200;
const MAX_BASE_WIDTH = 800;
let mobilePreviewWidth = DEFAULT_MOBILE_WIDTH;
let mobilePreviewScale = DEFAULT_MOBILE_SCALE;
let mobilePreviewVisible = true;
let bodyClassObserver = null;

function applyMobilePreviewStyles(containerEl, iframeEl) {
  const container = containerEl || document.querySelector(".gem-iframe-wrapper");
  const clone = iframeEl || document.querySelector(".iframe-duplicate");
  if (!container || !clone) return;

  const handle = document.querySelector("#gem-frame-handle");

  if (mobilePreviewScale === 1) {
    const widthPx = `${mobilePreviewWidth}px`;
    container.style.width = widthPx;
    container.style.maxWidth = widthPx;
    container.style.minWidth = widthPx;

    clone.style.width = widthPx;
    clone.style.height = "100%";
    clone.style.transformOrigin = "";
    clone.style.transform = "";
  } else {
    const half = Math.round(mobilePreviewWidth / 2);
    const halfPx = `${half}px`;
    container.style.width = halfPx;
    container.style.maxWidth = halfPx;
    container.style.minWidth = halfPx;

    clone.style.width = `${mobilePreviewWidth}px`;
    clone.style.height = "200%";
    clone.style.transformOrigin = "top left";
    clone.style.transform = "scale(0.5)";
  }

  if (handle) {
    const expanded = document.body.classList.contains("gem-expanded");
    handle.style.left = expanded ? "-12px" : "-24px";
    handle.style.width = expanded ? "12px" : "24px";
  }
}

function ensureBodyClassObserver() {
  if (bodyClassObserver || !document.body) return;
  bodyClassObserver = new MutationObserver(() => {
    applyMobilePreviewStyles();
  });
  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function addResizeHandle(container, styleTarget, clone, originalIframe) {
  if (!container || container.querySelector("#gem-frame-handle")) return;

  const handle = document.createElement("div");
  handle.id = "gem-frame-handle";
  Object.assign(handle.style, {
    margin: "auto",
    position: "absolute",
    top: "0",
    bottom: "0",
    left: "-24px",
    width: "24px",
    height: "100%",
    cursor: "col-resize"
  });

  let dragging = false;
  let startX = 0;
  let startBaseWidth = mobilePreviewWidth;
  let prevCursor = "";
  let sizeDetailsTimeout;

  const onMouseMove = (e) => {
    if (!dragging) return;
    const deltaX = e.clientX - startX;
    const factor = mobilePreviewScale === 0.5 ? 2 : 1;
    let nextBaseWidth = startBaseWidth - deltaX * factor;

    console.log("[Gem] Mouse move - startX:", startX, "e.clientX:", e.clientX, "deltaX:", deltaX, "factor:", factor, "startBaseWidth:", startBaseWidth, "nextBaseWidth before clamp:", nextBaseWidth);

    nextBaseWidth = Math.min(Math.max(nextBaseWidth, MIN_BASE_WIDTH), MAX_BASE_WIDTH);
    mobilePreviewWidth = nextBaseWidth;

    console.log("[Gem] Final mobilePreviewWidth:", mobilePreviewWidth);

    // Update size details width display
    const sizeDetails = container.querySelector(".gem-frame-size-details");
    if (sizeDetails) {
      console.log("[Gem] Updating size details width to:", mobilePreviewWidth, "px");
      const widthDiv = sizeDetails.children[0];
      if (widthDiv) {
        widthDiv.innerHTML = `
          <label>Width</label>
          ${mobilePreviewWidth}px
        `;
        console.log("[Gem] Size details HTML updated to:", widthDiv.innerHTML);
      } else {
        console.log("[Gem] Width div not found in size details");
      }
    } else {
      console.log("[Gem] Size details element not found for width update, container:", container, "selector result:", container.querySelector(".gem-frame-size-details"));
    }

    applyMobilePreviewStyles(styleTarget, clone);
    console.log("[Gem] Applied styles to styleTarget:", styleTarget, "width:", styleTarget.style.width);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = prevCursor;
    handle.classList.remove("gem-frame-handle--active");

    // Remove the overlay immediately
    const overlay = document.getElementById("gem-resize-overlay");
    if (overlay) {
      overlay.remove();
    }

    // Hide size details after a delay with fade transition
    const sizeDetails = container.querySelector(".gem-frame-size-details");
    if (sizeDetails) {
      sizeDetailsTimeout = setTimeout(() => {
        if (sizeDetails.parentNode && sizeDetails.parentNode.contains(sizeDetails)) {
          // Start fade out transition
          sizeDetails.classList.add("gem-frame-size-details--fade-out");
          // Remove element after transition completes
          setTimeout(() => {
            if (sizeDetails.parentNode && sizeDetails.parentNode.contains(sizeDetails)) {
              sizeDetails.remove();
            }
            sizeDetailsTimeout = null; // Clear the timeout reference
          }, 500); // Match CSS transition duration
        } else {
          sizeDetailsTimeout = null; // Clear the timeout reference if element is already gone
        }
      }, 3000); // 3 seconds delay before starting fade
    }

    chrome.storage.sync.set({ mobilePreviewWidth });
  };

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startBaseWidth = mobilePreviewWidth;
    prevCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    handle.classList.add("gem-frame-handle--active");

    // Clear any existing size details timeout and remove existing elements
    if (sizeDetailsTimeout) {
      clearTimeout(sizeDetailsTimeout);
      sizeDetailsTimeout = null;
    }

    // Remove any existing size details elements
    const existingSizeDetails = container.querySelectorAll(".gem-frame-size-details");
    existingSizeDetails.forEach(element => {
      if (element.parentNode) {
        element.remove();
      }
    });

    // Create size details element
    const sizeDetails = document.createElement("div");
    sizeDetails.className = "gem-frame-size-details";
    const initialWidth = mobilePreviewWidth;
    const initialScale = mobilePreviewScale === 1 ? '100%' : '50%';
    sizeDetails.innerHTML = `
      <div class="gem-frame-size-details-item">
        <label>Width</label>
        ${initialWidth}px
      </div>
      <div class="gem-frame-size-details-item">
        <label>Zoom</label>
        ${initialScale}
      </div>
    `;
    console.log("[Gem] Creating size details element with initial width:", initialWidth, "px and scale:", initialScale);
    Object.assign(sizeDetails.style, {
      position: "absolute",
      zIndex: "9999",
      left: "0",
      right: "0",
      bottom: "24px",
      margin: "auto",
      display: "inline-block",
      minWidth: "120px",
      width: "fit-content",
      maxWidth: "100%",
      padding: "6px 3px",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      boxShadow: "0 8px 25px rgba(102, 126, 234, 0.3)",
      color: "var(--token-button-highlight-text)",
      borderRadius: "999px",
      fontWeight: "bold",
      display: "flex",
      gap: "10px",
      opacity: "1",
      alignItems: "anchor-center",
      fontSize: "18px",
      justifyContent: "center",

    });
    container.appendChild(sizeDetails);
    console.log("[Gem] Size details element created and appended:", sizeDetails);

    // Create invisible overlay to capture all mouse events during dragging
    const overlay = document.createElement("div");
    overlay.id = "gem-resize-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: "transparent",
      zIndex: "999999",
      cursor: "col-resize"
    });
    document.body.appendChild(overlay);

    dragging = true;
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
  });

  container.appendChild(handle);
}

function setMobileVisibility(show) {
  mobilePreviewVisible = !!show;

  const wrapper = document.getElementById("gem-mobile-frame");
  if (!wrapper && show) {
    initializeMobileView();
  }

  const targetWrapper = wrapper || document.getElementById("gem-mobile-frame");
  if (targetWrapper) {
    targetWrapper.style.display = show ? "block" : "none";
  }

  chrome.storage.sync.set({ mobileViewVisible: mobilePreviewVisible });
}

// Check if mobile preview is enabled and initialize accordingly
chrome.storage.sync.get({
  enableMobilePreview: true,
  mobileViewVisible: true,
  mobilePreviewWidth: DEFAULT_MOBILE_WIDTH,
  mobilePreviewScale: DEFAULT_MOBILE_SCALE
}, (settings) => {
  mobilePreviewWidth = Number(settings.mobilePreviewWidth) || DEFAULT_MOBILE_WIDTH;
  mobilePreviewScale = Number(settings.mobilePreviewScale) === 1 ? 1 : DEFAULT_MOBILE_SCALE;
  mobilePreviewVisible = settings.mobileViewVisible !== false;
  if (settings.enableMobilePreview) {
    initializeMobileView();
    setMobileVisibility(mobilePreviewVisible);
  }
  ensureBodyClassObserver();
});

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enableMobilePreview) {
    const show = changes.enableMobilePreview.newValue;
    setMobileVisibility(show);
  }

  if (namespace === 'sync' && (changes.mobilePreviewWidth || changes.mobilePreviewScale)) {
    if (changes.mobilePreviewWidth) {
      mobilePreviewWidth = Number(changes.mobilePreviewWidth.newValue) || DEFAULT_MOBILE_WIDTH;
    }
    if (changes.mobilePreviewScale) {
      mobilePreviewScale = Number(changes.mobilePreviewScale.newValue) === 1 ? 1 : DEFAULT_MOBILE_SCALE;
    }
    applyMobilePreviewStyles();
  }

   if (namespace === 'sync' && changes.mobileViewVisible) {
     setMobileVisibility(changes.mobileViewVisible.newValue);
   }
});

//----------------------------------------------------------
// Wait until a specific iframe appears in the DOM
//----------------------------------------------------------
function waitForIframe(selector, callback) {
  const iframe = document.querySelector(selector);
  if (iframe) return callback(iframe);

  const obs = new MutationObserver(() => {
    const iframeNow = document.querySelector(selector);
    if (iframeNow) {
      obs.disconnect();
      callback(iframeNow);
    }
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

//----------------------------------------------------------
// Run after DOM is ready
//----------------------------------------------------------
function onReady(fn) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(fn, 0);
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

//----------------------------------------------------------
// This function builds + syncs the clone for ONE iframe instance
//----------------------------------------------------------
function setupClonedIframe(originalIframe) {

  const LONG_WORD_THRESHOLD = 20;

  // Set up observers to handle e-blocks-container lifecycle and content changes
  function setupBlocksContainerObservers() {
    const originalDoc = originalIframe.contentDocument;
    if (!originalDoc) return;

    // --- Cached content hash to avoid unnecessary syncs ---
    let lastContentHash = "";
    let currentContentObserver = null;

    // Lightweight content hashing
    function quickHash(str) {
      let h = 0, i = 0, len = str.length;
      while (i < len) h = (h << 5) - h + str.charCodeAt(i++) | 0;
      return h;
    }

    // Function to set up content observer on a specific blocks container element
    function setupContentObserver(blocksContainer) {
      // Clean up any existing content observer
      if (currentContentObserver) {
        currentContentObserver.disconnect();
      }

      currentContentObserver = new MutationObserver((mutations) => {
        const cloneDoc = cloneIframe.contentDocument;

        // --- EXCEPTION: clone empty → force initial sync ---
        const cloneIsEmpty =
          !cloneDoc ||
          !cloneDoc.documentElement ||
          cloneDoc.documentElement.innerHTML.trim() === "" ||
          cloneDoc.body.innerHTML.trim() === "";

        if (cloneIsEmpty) {
          console.log("Clone empty → forcing initial sync");
          syncIframe();
          return;
        }

        // --- Check if mutations only involve mce-edit-focus class changes ---
        let onlyFocusClassChanges = true;

        for (const mutation of mutations) {
          // Only check attribute mutations (class changes)
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            const oldClasses = mutation.oldValue ? mutation.oldValue.split(' ') : [];
            const newClasses = target.className ? target.className.split(' ') : [];

            // Find what changed
            const addedClasses = newClasses.filter(cls => !oldClasses.includes(cls));
            const removedClasses = oldClasses.filter(cls => !newClasses.includes(cls));

            // Check if the only changes are adding/removing "mce-edit-focus"
            const onlyFocusChanges = (addedClasses.length === 1 && addedClasses[0] === 'mce-edit-focus') ||
                                   (removedClasses.length === 1 && removedClasses[0] === 'mce-edit-focus') ||
                                   (addedClasses.length === 0 && removedClasses.length === 0);

            if (!onlyFocusChanges) {
              onlyFocusClassChanges = false;
              break;
            }
          } else {
            // Any other type of mutation (childList, characterData, etc.) is not just focus changes
            onlyFocusClassChanges = false;
            break;
          }
        }

        // If mutations only involve mce-edit-focus class changes, skip sync
        if (onlyFocusClassChanges) {
          console.log("Skip sync: only mce-edit-focus class changes detected");
          return;
        }

        // --- Batch execution: one sync per rAF ---
        if (!currentContentObserver.pendingSync) {
          currentContentObserver.pendingSync = true;

          requestAnimationFrame(() => {
            currentContentObserver.pendingSync = false;

            const originalDoc = originalIframe.contentDocument;
            if (!originalDoc) return;

            // Hash the content of the blocks container only
            const currentContainer = originalDoc.querySelector('div[e-blocks-container="true"]');
            if (!currentContainer) return;

            const snapshot = currentContainer.innerHTML.trim();
            const hash = quickHash(snapshot);

            if (hash === lastContentHash) {
              console.log("Skip sync: blocks container content hash unchanged.");
              return;
            }

            lastContentHash = hash;

            syncIframe();
          });
        }
      });

      // Observe the e-blocks-container for any changes to its children or attributes
      currentContentObserver.observe(blocksContainer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });

      console.log("[Gem] Set up content observer on e-blocks-container");
    }

    // Function to handle when e-blocks-container is added or removed
    function handleBlocksContainerChange() {
      const blocksContainer = originalDoc.querySelector('div[e-blocks-container="true"]');

      if (blocksContainer && !currentContentObserver) {
        // Element was added - set up content observer
        console.log("[Gem] e-blocks-container added, setting up content observer");
        setupContentObserver(blocksContainer);
        // Force initial sync when container is re-added
        lastContentHash = "";
        syncIframe();
      } else if (!blocksContainer && currentContentObserver) {
        // Element was removed - clean up content observer
        console.log("[Gem] e-blocks-container removed, cleaning up content observer");
        currentContentObserver.disconnect();
        currentContentObserver = null;
      }
    }

    // Set up document-level observer to watch for e-blocks-container additions/removals
    const containerLifecycleObserver = new MutationObserver((mutations) => {
      let containerChanged = false;

      for (const mutation of mutations) {
        // Check if any added/removed nodes contain or are the e-blocks-container
        const checkNodes = (nodes) => {
          for (const node of nodes) {
            if (node.nodeType === 1) { // Element node
              if (node.matches && node.matches('div[e-blocks-container="true"]')) {
                containerChanged = true;
                return true;
              }
              // Check descendants
              if (node.querySelector && node.querySelector('div[e-blocks-container="true"]')) {
                containerChanged = true;
                return true;
              }
            }
          }
          return false;
        };

        if (checkNodes(mutation.addedNodes) || checkNodes(mutation.removedNodes)) {
          containerChanged = true;
          break;
        }
      }

      if (containerChanged) {
        handleBlocksContainerChange();
      }
    });

    // Start observing the document for container lifecycle changes
    containerLifecycleObserver.observe(originalDoc, {
      childList: true,
      subtree: true,
    });

    // Initial check - set up observer if container already exists
    handleBlocksContainerChange();
  }

  //----------------------------------------------------------
// Check if mobile frame already exists - if so, clear it and recreate
//----------------------------------------------------------
  const existingWrapper = document.getElementById("gem-mobile-frame");
  if (existingWrapper) {
    console.log("[Gem] Mobile frame already exists, clearing and recreating");
    // Clear existing content
    existingWrapper.innerHTML = '';
    // Reuse the existing wrapper instead of creating a new one
    var wrapperDiv = existingWrapper;
  } else {
    // Create new wrapper if it doesn't exist
    var wrapperDiv = document.createElement("div");
    wrapperDiv.id = "gem-mobile-frame";
  }

  // Create wrapper, container & clone
  //----------------------------------------------------------

  const containerDiv = document.createElement("div");
  containerDiv.className = "gem-iframe-wrapper";

  Object.assign(containerDiv.style, {

    zIndex: "9"
  });

  const cloneIframe = document.createElement("iframe");
  cloneIframe.className = "iframe-duplicate";

  Object.assign(cloneIframe.style, {
    maxWidth: "unset",
    position: "absolute",
    overflow: "hidden",
    top: "0",
    left: "0"
  });

  containerDiv.appendChild(cloneIframe);
  addResizeHandle(wrapperDiv, containerDiv, cloneIframe, originalIframe);
  applyMobilePreviewStyles(containerDiv, cloneIframe);
  setMobileVisibility(mobilePreviewVisible);

  // Add both handle and container to the wrapper
  wrapperDiv.appendChild(containerDiv);

  Object.assign(originalIframe.style, {
    position: "static",
  });


  // Only insert if this is a newly created wrapper
  if (!existingWrapper) {
    document.querySelector("section.e-layout__section.e-contentblocks-preview_section").insertAdjacentElement("afterend", wrapperDiv);
  }

  containerDiv.insertAdjacentHTML(
    "afterend",
    `<style id="gem-styles">
      cb-device-preview .e-section .e-section__content { padding:0 !important }
      vce-iframe { display: flex; height:100%; }
      cb-content-preview, cb-content-preview > div { display: block; height:100%; }
    .e-layout__section.e-contentblocks-preview_section { display:flex; }
    cb-campaign-preview { width: 100% }
    .e-contentblocks-preview { position:static; height:100%; z-index: unset; top: unset; }
    cb-device-preview > .e-section > .e-section__content { overflow: hidden }
    #gem-frame-handle:before { content: ""; display: block; background: var(--token-box-default-border); position:absolute; top: 0; bottom: 0; left: 0; right: 0; width: 33%; max-width:6px; height: 66%; border-radius: 999px; margin: auto; }
    #gem-frame-handle:hover:before { background: var(--token-ai-500); }
    #gem-frame-handle.gem-frame-handle--active:before { background: var(--token-ai-800); }
    .gem-frame-size-details-item { width: auto; font-size:16px; line-height:20px }
    .gem-frame-size-details-item label { display:block; font-size: 10px; line-height: 14px; text-transform: uppercase; }
    </style>`
  );


  //----------------------------------------------------------
  // Break long words inside the clone
  //----------------------------------------------------------
  function breakLongWords(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodes = [];
    let n;

    while ((n = walker.nextNode())) {
      nodes.push(n);
    }

    for (const textNode of nodes) {
      const text = textNode.nodeValue;
      const parts = text.split(/(\s+)/);

      let needsReplacement = false;

      const processed = parts.map((part) => {
        if (/\s/.test(part)) return part;

        if (part.length > LONG_WORD_THRESHOLD) {
          needsReplacement = true;
          const regex = new RegExp(`.{1,${LONG_WORD_THRESHOLD}}`, "g");
          return part.match(regex).join("<wbr>");
        }

        return part;
      });

      if (needsReplacement) {
        const span = textNode.ownerDocument.createElement("span");
        span.innerHTML = processed.join("");
        textNode.parentNode.replaceChild(span, textNode);
      }
    }
  }

//----------------------------------------------------------
// Custom Overlay Scrollbars
//----------------------------------------------------------
function setupCustomScrollbars(iframe, container) {
  if (!iframe || !container) return;

  // Clean up any existing scrollbars first
  const existingScrollbars = container.querySelectorAll('.gem-custom-scrollbar');
  existingScrollbars.forEach(scrollbar => scrollbar.remove());

  // Clean up any existing scrollbar references
  if (iframe._gemScrollbar) {
    console.log('[Gem] Cleaning up existing scrollbar reference');
    if (iframe._gemScrollbar.destroy) {
      iframe._gemScrollbar.destroy();
    }
    delete iframe._gemScrollbar;
  }

  let vIsDragging = false;
  let vDragStartY = 0;
  let vThumbStartTop = 0;
  let hIsDragging = false;
  let hDragStartX = 0;
  let hThumbStartLeft = 0;
  let scrollTimeout;
  let iframeDoc;

  // Get iframe document
  function getIframeDoc() {
    if (!iframeDoc) {
      iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    }
    return iframeDoc;
  }

  // Update scrollbar visibility
  function showScrollbar() {
    const needsVertical = checkVerticalScrollNeeded();
    const needsHorizontal = checkHorizontalScrollNeeded();

    if (needsVertical) {
      vScrollbarContainer.style.opacity = '1';
    }
    if (needsHorizontal) {
      hScrollbarContainer.style.opacity = '1';
    }

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (!vIsDragging && !hIsDragging &&
          !container.matches(':hover') &&
          !vScrollbarContainer.matches(':hover') &&
          !hScrollbarContainer.matches(':hover')) {
        vScrollbarContainer.style.opacity = checkVerticalScrollNeeded() ? '0' : '0';
        hScrollbarContainer.style.opacity = checkHorizontalScrollNeeded() ? '0' : '0';
      }
    }, 1000);
  }

  // Check if vertical scrolling is needed
  function checkVerticalScrollNeeded() {
    const doc = getIframeDoc();
    if (!doc || !doc.documentElement) return false;
    const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
    const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
    return scrollHeight > clientHeight;
  }

  // Check if horizontal scrolling is needed
  function checkHorizontalScrollNeeded() {
    const doc = getIframeDoc();
    if (!doc || !doc.documentElement) return false;
    const scrollWidth = doc.documentElement.scrollWidth || doc.body.scrollWidth;
    const clientWidth = doc.documentElement.clientWidth || doc.body.clientWidth;
    return scrollWidth > clientWidth;
  }

  // Calculate and update scrollbar positions
  function updateScrollbar() {
    const doc = getIframeDoc();
    if (!doc || !doc.documentElement) return;

    const needsVertical = checkVerticalScrollNeeded();
    const needsHorizontal = checkHorizontalScrollNeeded();

    // Update vertical scrollbar
    const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
    const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
    const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;

    if (needsVertical) {
      vScrollbarContainer.style.display = 'block';

      // Adjust track height if horizontal scrollbar is also present (leave 12px gap)
      // The container height uses calc() and doesn't need to be overridden
      const containerHeight = container.offsetHeight;
      const adjustedHeight = needsHorizontal ? containerHeight - 16 : containerHeight - 8; // Account for 4px top/bottom margins

      vScrollbarTrack.style.height = `${adjustedHeight}px`;

      const trackHeight = vScrollbarTrack.offsetHeight;
      const thumbHeight = Math.max(40, (clientHeight / scrollHeight) * trackHeight);
      const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * (trackHeight - thumbHeight);

      vScrollbarThumb.style.height = `${thumbHeight}px`;
      vScrollbarThumb.style.top = `${thumbTop}px`;
    } else {
      vScrollbarContainer.style.display = 'none';
    }

    // Update horizontal scrollbar
    const scrollLeft = doc.documentElement.scrollLeft || doc.body.scrollLeft;
    const scrollWidth = doc.documentElement.scrollWidth || doc.body.scrollWidth;
    const clientWidth = doc.documentElement.clientWidth || doc.body.clientWidth;

    if (needsHorizontal) {
      hScrollbarContainer.style.display = 'block';

      // Adjust track width if vertical scrollbar is also present (leave 12px gap)
      // The container width uses calc() and doesn't need to be overridden
      const containerWidth = container.offsetWidth;
      const adjustedWidth = needsVertical ? containerWidth - 16 : containerWidth - 8; // Account for 4px left/right margins

      hScrollbarTrack.style.width = `${adjustedWidth}px`;

      const trackWidth = hScrollbarTrack.offsetWidth;
      const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * trackWidth);
      const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * (trackWidth - thumbWidth);

      hScrollbarThumb.style.width = `${thumbWidth}px`;
      hScrollbarThumb.style.left = `${thumbLeft}px`;
    } else {
      hScrollbarContainer.style.display = 'none';
    }
  }

  // Handle iframe scroll
  function handleIframeScroll() {
    updateScrollbar();
    showScrollbar();
  }

  // Handle mouse wheel on scrollbar area
  function handleWheel(e) {
    e.preventDefault();
    const doc = getIframeDoc();
    if (!doc) return;

    const deltaY = e.deltaY || e.detail || (e.wheelDelta * -1);
    const deltaX = e.deltaX || 0;

    // Handle vertical scrolling
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      const scrollAmount = deltaY > 0 ? 100 : -100;
      doc.documentElement.scrollTop += scrollAmount;
      doc.body.scrollTop += scrollAmount;
    } else {
      // Handle horizontal scrolling
      const scrollAmount = deltaX > 0 ? 100 : -100;
      doc.documentElement.scrollLeft += scrollAmount;
      doc.body.scrollLeft += scrollAmount;
    }

    updateScrollbar();
    showScrollbar();
  }

  // Handle vertical thumb drag
  function handleVerticalThumbMouseDown(e) {
    e.preventDefault();
    vIsDragging = true;
    vDragStartY = e.clientY;
    vThumbStartTop = parseFloat(vScrollbarThumb.style.top) || 0;

    vScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

    function handleMouseMove(e) {
      if (!vIsDragging) return;

      const deltaY = e.clientY - vDragStartY;
      const trackHeight = vScrollbarTrack.offsetHeight;
      const thumbHeight = vScrollbarThumb.offsetHeight;
      const newTop = Math.max(0, Math.min(trackHeight - thumbHeight, vThumbStartTop + deltaY));

      vScrollbarThumb.style.top = `${newTop}px`;

      // Update iframe scroll position
      const doc = getIframeDoc();
      if (doc) {
        const scrollRatio = newTop / (trackHeight - thumbHeight);
        const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
        const scrollTop = scrollRatio * (scrollHeight - clientHeight);

        doc.documentElement.scrollTop = scrollTop;
        doc.body.scrollTop = scrollTop;
      }
    }

    function handleMouseUp() {
      vIsDragging = false;
      vScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // Handle horizontal thumb drag
  function handleHorizontalThumbMouseDown(e) {
    e.preventDefault();
    hIsDragging = true;
    hDragStartX = e.clientX;
    hThumbStartLeft = parseFloat(hScrollbarThumb.style.left) || 0;

    hScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

    function handleMouseMove(e) {
      if (!hIsDragging) return;

      const deltaX = e.clientX - hDragStartX;
      const trackWidth = hScrollbarTrack.offsetWidth;
      const thumbWidth = hScrollbarThumb.offsetWidth;
      const newLeft = Math.max(0, Math.min(trackWidth - thumbWidth, hThumbStartLeft + deltaX));

      hScrollbarThumb.style.left = `${newLeft}px`;

      // Update iframe scroll position
      const doc = getIframeDoc();
      if (doc) {
        const scrollRatio = newLeft / (trackWidth - thumbWidth);
        const scrollWidth = doc.documentElement.scrollWidth || doc.body.scrollWidth;
        const clientWidth = doc.documentElement.clientWidth || doc.body.clientWidth;
        const scrollLeft = scrollRatio * (scrollWidth - clientWidth);

        doc.documentElement.scrollLeft = scrollLeft;
        doc.body.scrollLeft = scrollLeft;
      }
    }

    function handleMouseUp() {
      hIsDragging = false;
      hScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  // Create vertical scrollbar
  const vScrollbarContainer = document.createElement('div');
  vScrollbarContainer.className = 'gem-custom-scrollbar gem-custom-scrollbar-vertical';
  Object.assign(vScrollbarContainer.style, {
    position: 'absolute',
    top: '4px',
    right: '2px',
    width: '12px',
    height: 'calc(100% - 8px)',
    background: 'transparent',
    zIndex: '10',
    opacity: '0',
    transition: 'opacity 0.2s ease',
    pointerEvents: 'auto'
  });

  const vScrollbarTrack = document.createElement('div');
  vScrollbarTrack.className = 'gem-scrollbar-track gem-scrollbar-track-vertical';
  Object.assign(vScrollbarTrack.style, {
    position: 'absolute',
    top: '0',
    right: '2px',
    width: '8px',
    height: '100%',
    background: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '4px',
    pointerEvents: 'auto'
  });

  const vScrollbarThumb = document.createElement('div');
  vScrollbarThumb.className = 'gem-scrollbar-thumb gem-scrollbar-thumb-vertical';
  Object.assign(vScrollbarThumb.style, {
    position: 'absolute',
    top: '0',
    right: '0',
    width: '8px',
    height: '40px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
    pointerEvents: 'auto',
    transition: 'background-color 0.2s ease'
  });

  vScrollbarTrack.appendChild(vScrollbarThumb);
  vScrollbarContainer.appendChild(vScrollbarTrack);
  container.appendChild(vScrollbarContainer);

  // Create horizontal scrollbar
  const hScrollbarContainer = document.createElement('div');
  hScrollbarContainer.className = 'gem-custom-scrollbar gem-custom-scrollbar-horizontal';
  Object.assign(hScrollbarContainer.style, {
    position: 'absolute',
    bottom: '2px',
    left: '4px',
    height: '12px',
    width: 'calc(100% - 8px)',
    background: 'transparent',
    zIndex: '10',
    opacity: '0',
    transition: 'opacity 0.2s ease',
    pointerEvents: 'auto'
  });

  const hScrollbarTrack = document.createElement('div');
  hScrollbarTrack.className = 'gem-scrollbar-track gem-scrollbar-track-horizontal';
  Object.assign(hScrollbarTrack.style, {
    position: 'absolute',
    bottom: '2px',
    left: '0',
    height: '8px',
    width: '100%',
    background: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '4px',
    pointerEvents: 'auto'
  });

  const hScrollbarThumb = document.createElement('div');
  hScrollbarThumb.className = 'gem-scrollbar-thumb gem-scrollbar-thumb-horizontal';
  Object.assign(hScrollbarThumb.style, {
    position: 'absolute',
    bottom: '0',
    left: '0',
    height: '8px',
    width: '40px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
    pointerEvents: 'auto',
    transition: 'background-color 0.2s ease'
  });

  hScrollbarTrack.appendChild(hScrollbarThumb);
  hScrollbarContainer.appendChild(hScrollbarTrack);
  container.appendChild(hScrollbarContainer);

  // Set up event listeners
  const doc = getIframeDoc();
  if (doc) {
    doc.addEventListener('scroll', handleIframeScroll, { passive: true });

    // Update scrollbar when content changes
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateScrollbar, 100); // Debounce for performance
    });
    resizeObserver.observe(doc.documentElement);
  }

  // Add event listeners for vertical scrollbar
  vScrollbarContainer.addEventListener('wheel', handleWheel);
  vScrollbarThumb.addEventListener('mousedown', handleVerticalThumbMouseDown);

  // Add event listeners for horizontal scrollbar
  hScrollbarContainer.addEventListener('wheel', handleWheel);
  hScrollbarThumb.addEventListener('mousedown', handleHorizontalThumbMouseDown);

  // Add hover listeners to the container (iframe wrapper) to show scrollbars
  container.addEventListener('mouseenter', showScrollbar);
  container.addEventListener('mouseleave', () => {
    if (!vIsDragging && !hIsDragging) {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!container.matches(':hover') &&
            !vScrollbarContainer.matches(':hover') &&
            !hScrollbarContainer.matches(':hover')) {
          vScrollbarContainer.style.opacity = checkVerticalScrollNeeded() ? '0' : '0';
          hScrollbarContainer.style.opacity = checkHorizontalScrollNeeded() ? '0' : '0';
        }
      }, 200);
    }
  });

  // Initial update
  updateScrollbar();

  // Store references for cleanup if needed
  iframe._gemScrollbar = {
    vContainer: vScrollbarContainer,
    hContainer: hScrollbarContainer,
    destroy: function() {
      if (doc) {
        doc.removeEventListener('scroll', handleIframeScroll);
      }
      vScrollbarContainer.remove();
      hScrollbarContainer.remove();
    }
  };
}

//----------------------------------------------------------
  // Sync clone with original
  //----------------------------------------------------------
  function syncIframe() {
    try {
      const originalDoc = originalIframe.contentDocument;
      const cloneDoc = cloneIframe.contentDocument;
      if (!originalDoc || !cloneDoc) return;

      // Serialize the original HTML to a string
      const originalHTML = originalDoc.documentElement.outerHTML;

      // Parse it into a temporary DOM so we can remove scripts and clean content
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(originalHTML, "text/html");

      // Remove all <script> tags from the temp document
      tempDoc.querySelectorAll("script").forEach(script => script.remove());

      // Remove all <e-vce-borderer> tags from the temp document
      tempDoc.querySelectorAll("e-vce-borderer").forEach(item => item.remove());
      tempDoc.querySelectorAll("e-vce-borderer-element").forEach(item => item.remove());
      tempDoc.querySelectorAll("e-vce-dropline").forEach(item => item.remove());


      // Remove all .gem-text-highlight tags from the temp document
      tempDoc.querySelectorAll(".gem-text-highlight").forEach(item => item.remove());

      // Remove spellcheck attribute from body element if present
      const body = tempDoc.querySelector("body");
      if (body && body.hasAttribute("spellcheck")) {
        body.removeAttribute("spellcheck");
      }

      cloneDoc.open();
      cloneDoc.write(tempDoc.documentElement.outerHTML);
      cloneDoc.close();

      // Inject CSS to hide scrollbars while maintaining scrollability
      const scrollbarStyle = cloneDoc.createElement('style');
      scrollbarStyle.textContent = `
        html, body {
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Hide scrollbars in Webkit browsers (Chrome, Safari, Edge) */
        ::-webkit-scrollbar:vertical {
          display: none !important;
        }
        /* Hide scrollbars in Firefox */
        * {
          scrollbar-width: none !important;
        }
      `;
      if (cloneDoc.head) {
        cloneDoc.head.appendChild(scrollbarStyle);
      }

      breakLongWords(cloneDoc.body);

      // Set up custom overlay scrollbars
      setupCustomScrollbars(cloneIframe, wrapperDiv);

      console.log("Succesfully duplicated iframe");

    } catch (err) {
      console.error("Error syncing iframe:", err);
    }
  }

  // Set up observers to handle e-blocks-container lifecycle and content changes
  function setupBlocksContainerObservers() {
    const originalDoc = originalIframe.contentDocument;
    if (!originalDoc) return;

    // --- Cached content hash to avoid unnecessary syncs ---
    let lastContentHash = "";
    let currentContentObserver = null;

    // Lightweight content hashing
    function quickHash(str) {
      let h = 0, i = 0, len = str.length;
      while (i < len) h = (h << 5) - h + str.charCodeAt(i++) | 0;
      return h;
    }

    // Function to set up content observer on a specific blocks container element
    function setupContentObserver(blocksContainer) {
      // Clean up any existing content observer
      if (currentContentObserver) {
        currentContentObserver.disconnect();
      }

      currentContentObserver = new MutationObserver((mutations) => {
        const cloneDoc = cloneIframe.contentDocument;

        // --- EXCEPTION: clone empty → force initial sync ---
        const cloneIsEmpty =
          !cloneDoc ||
          !cloneDoc.documentElement ||
          cloneDoc.documentElement.innerHTML.trim() === "" ||
          cloneDoc.body.innerHTML.trim() === "";

        if (cloneIsEmpty) {
          console.log("Clone empty → forcing initial sync");
          syncIframe();
          return;
        }

        // --- Check if mutations only involve mce-edit-focus class changes ---
        let onlyFocusClassChanges = true;

        for (const mutation of mutations) {
          // Only check attribute mutations (class changes)
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            const oldClasses = mutation.oldValue ? mutation.oldValue.split(' ') : [];
            const newClasses = target.className ? target.className.split(' ') : [];

            // Find what changed
            const addedClasses = newClasses.filter(cls => !oldClasses.includes(cls));
            const removedClasses = oldClasses.filter(cls => !newClasses.includes(cls));

            // Check if the only changes are adding/removing "mce-edit-focus"
            const onlyFocusChanges = (addedClasses.length === 1 && addedClasses[0] === 'mce-edit-focus') ||
                                   (removedClasses.length === 1 && removedClasses[0] === 'mce-edit-focus') ||
                                   (addedClasses.length === 0 && removedClasses.length === 0);

            if (!onlyFocusChanges) {
              onlyFocusClassChanges = false;
              break;
            }
          } else {
            // Any other type of mutation (childList, characterData, etc.) is not just focus changes
            onlyFocusClassChanges = false;
            break;
          }
        }

        // If mutations only involve mce-edit-focus class changes, skip sync
        if (onlyFocusClassChanges) {
          console.log("Skip sync: only mce-edit-focus class changes detected");
          return;
        }

        // --- Batch execution: one sync per rAF ---
        if (!currentContentObserver.pendingSync) {
          currentContentObserver.pendingSync = true;

          requestAnimationFrame(() => {
            currentContentObserver.pendingSync = false;

            const originalDoc = originalIframe.contentDocument;
            if (!originalDoc) return;

            // Hash the content of the blocks container only
            const currentContainer = originalDoc.querySelector('div[e-blocks-container="true"]');
            if (!currentContainer) return;

            const snapshot = currentContainer.innerHTML.trim();
            const hash = quickHash(snapshot);

            if (hash === lastContentHash) {
              console.log("Skip sync: blocks container content hash unchanged.");
              return;
            }

            lastContentHash = hash;

            syncIframe();
          });
        }
      });

      // Observe the e-blocks-container for any changes to its children or attributes
      currentContentObserver.observe(blocksContainer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });

      console.log("[Gem] Set up content observer on e-blocks-container");
    }

    // Function to handle when e-blocks-container is added or removed
    function handleBlocksContainerChange() {
      const blocksContainer = originalDoc.querySelector('div[e-blocks-container="true"]');

      if (blocksContainer && !currentContentObserver) {
        // Element was added - set up content observer
        console.log("[Gem] e-blocks-container added, setting up content observer");
        setupContentObserver(blocksContainer);
        // Force initial sync when container is re-added
        lastContentHash = "";
        syncIframe();
      } else if (!blocksContainer && currentContentObserver) {
        // Element was removed - clean up content observer
        console.log("[Gem] e-blocks-container removed, cleaning up content observer");
        currentContentObserver.disconnect();
        currentContentObserver = null;
      }
    }

    // Set up document-level observer to watch for e-blocks-container additions/removals
    const containerLifecycleObserver = new MutationObserver((mutations) => {
      let containerChanged = false;

      for (const mutation of mutations) {
        // Check if any added/removed nodes contain or are the e-blocks-container
        const checkNodes = (nodes) => {
          for (const node of nodes) {
            if (node.nodeType === 1) { // Element node
              if (node.matches && node.matches('div[e-blocks-container="true"]')) {
                containerChanged = true;
                return true;
              }
              // Check descendants
              if (node.querySelector && node.querySelector('div[e-blocks-container="true"]')) {
                containerChanged = true;
                return true;
              }
            }
          }
          return false;
        };

        if (checkNodes(mutation.addedNodes) || checkNodes(mutation.removedNodes)) {
          containerChanged = true;
          break;
        }
      }

      if (containerChanged) {
        handleBlocksContainerChange();
      }
    });

    // Start observing the document for container lifecycle changes
    containerLifecycleObserver.observe(originalDoc, {
      childList: true,
      subtree: true,
    });

    // Initial check - set up observer if container already exists
    handleBlocksContainerChange();
  }

  setupBlocksContainerObservers();

  console.log("Duplicate iframe active with long-word breaking.");
}

// Global state for cleanup
let currentRemovalObserver = null;
let isMobileViewActive = false;

//----------------------------------------------------------
// Initialize mobile view functionality
//----------------------------------------------------------
function initializeMobileView() {
  if (isMobileViewActive) return; // Already active
  isMobileViewActive = true;

  console.log("Initializing mobile view...");

  function startForNewIframe(iframe) {
    // Build clone for this iframe instance
    setupClonedIframe(iframe);

    // Watch for this iframe being removed
    currentRemovalObserver = new MutationObserver(() => {
      if (!document.contains(iframe)) {
        if (currentRemovalObserver) {
          currentRemovalObserver.disconnect();
          currentRemovalObserver = null;
        }
        console.log("Original iframe removed. Cleaning up clone...");

        // Delete clone + container
        const oldClone = document.querySelector(".iframe-duplicate");
        const oldContainer = oldClone?.parentElement;
        if (oldContainer) oldContainer.remove();

        // Only respawn if mobile view is still active
        if (isMobileViewActive) {
          // Wait for next iframe
          waitForIframe("iframe.e-contentblocks-preview__iframe-desktop", (newIframe) => {
            console.log("New original iframe detected — rebuilding clone.");
            startForNewIframe(newIframe);
          });
        }
      }
    });

    currentRemovalObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // Begin first cycle
  waitForIframe("iframe.e-contentblocks-preview__iframe-desktop", startForNewIframe);
}

//----------------------------------------------------------
// Disable mobile view functionality
//----------------------------------------------------------
function disableMobileView() {
  if (!isMobileViewActive) return; // Already disabled
  isMobileViewActive = false;

  console.log("Disabling mobile view...");

  // Disconnect removal observer
  if (currentRemovalObserver) {
    currentRemovalObserver.disconnect();
    currentRemovalObserver = null;
  }

  // Delete existing wrapper (contains both handle and container)
  const oldWrapper = document.getElementById("gem-mobile-frame");
  if (oldWrapper) oldWrapper.remove();

  // Remove injected styles
  const styles = document.getElementById("gem-styles");
  if (styles) styles.remove();
}

//----------------------------------------------------------
// MAIN AUTO-RESPAWN LOGIC (now wrapped in initializeMobileView)
//----------------------------------------------------------