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
    clone.style.borderRadius = "8px";
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
    left: "-26px",
    width: "26px",
    height: "100%",
    cursor: "col-resize"
  });

  let dragging = false;
  let startX = 0;
  let startBaseWidth = mobilePreviewWidth;
  let prevCursor = "";

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
      setTimeout(() => {
        if (sizeDetails.parentNode) {
          // Start fade out transition
          sizeDetails.classList.add("gem-frame-size-details--fade-out");
          // Remove element after transition completes
          setTimeout(() => {
            if (sizeDetails.parentNode) {
              sizeDetails.remove();
            }
          }, 500); // Match CSS transition duration
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
      bottom: "-8px",
      margin: "auto",
      display: "inline-block",
      minWidth: "120px",
      width: "fit-content",
      maxWidth: "100%",
      padding: "6px 3px",
      background: "var(--token-highlight-600)",
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

  //----------------------------------------------------------
// Create wrapper, container & clone
//----------------------------------------------------------
  const wrapperDiv = document.createElement("div");
  wrapperDiv.id = "gem-mobile-frame";

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


  document.querySelector("section.e-layout__section.e-contentblocks-preview_section").insertAdjacentElement("afterend", wrapperDiv);

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
    #gem-frame-handle:before { content: ""; display: block; background: var(--token-box-default-border); position:absolute; top: 0; bottom: 0; left: 0; right: 0; width: 25%; height: 66%; border-radius: 999px; margin: auto; }
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
  // Sync clone with original
  //----------------------------------------------------------
  function syncIframe() {
    try {
      const originalDoc = originalIframe.contentDocument;
      const cloneDoc = cloneIframe.contentDocument;
      if (!originalDoc || !cloneDoc) return;

      // Serialize the original HTML to a string
      const originalHTML = originalDoc.documentElement.outerHTML;

      // Parse it into a temporary DOM so we can remove scripts
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

      console.log("Succesfully duplicated iframe");

    } catch (err) {
      console.error("Error syncing iframe:", err);
    }
  }

  const originalDoc = originalIframe.contentDocument;
  if (originalDoc) {

    // --- Cached content hash to avoid unnecessary syncs ---
    let lastContentHash = "";

    // Lightweight content hashing
    function quickHash(str) {
      let h = 0, i = 0, len = str.length;
      while (i < len) h = (h << 5) - h + str.charCodeAt(i++) | 0;
      return h;
    }

    const contentObserver = new MutationObserver((mutations) => {

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

      let meaningfulChange = false;

      mutationLoop:
      for (const mutation of mutations) {

        const target = mutation.target;

        // ❌ Ignore ANY mutation happening inside highlight or borderer elements
        if (
          target.closest?.(".gem-text-highlight") ||
          target.closest?.("e-vce-borderer") ||
          target.closest?.("e-vce-borderer-element")
        ) {
          continue;
        }

        // ❌ Ignore attribute changes on <e-vce-dropline>
        if (
          mutation.type === "attributes" &&
          target.tagName === "E-VCE-DROPLINE"
        ) {
          // Known noisy mutation → skip
          continue;
        }

        // ---------------------------
        // Check added nodes
        // ---------------------------
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          const tag = node.tagName;

          // Skip known noisy nodes
          if (
            node.classList?.contains("gem-text-highlight") ||
            tag === "E-VCE-BORDERER" ||
            tag === "E-VCE-BORDERER-ELEMENT" ||
            tag === "E-VCE-DROPLINE" // Droplines are noisy too
          ) {
            continue;
          }

          // Found meaningful added content
          meaningfulChange = true;
          break mutationLoop;
        }

        // ---------------------------
        // Check removed nodes
        // ---------------------------
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== 1) continue;

          const tag = node.tagName;

          if (
            node.classList?.contains("gem-text-highlight") ||
            tag === "E-VCE-BORDERER" ||
            tag === "E-VCE-BORDERER-ELEMENT" ||
            tag === "E-VCE-DROPLINE"
          ) {
            continue;
          }

          meaningfulChange = true;
          break mutationLoop;
        }

        // ---------------------------
        // Character data edits
        // ---------------------------
        if (
          mutation.type === "characterData" &&
          !target.closest(".gem-text-highlight") &&
          !target.closest("e-vce-borderer") &&
          !target.closest("e-vce-borderer-element") &&
          target.tagName !== "E-VCE-DROPLINE"
        ) {
          meaningfulChange = true;
          break;
        }
      }

      // No meaningful change → skip
      if (!meaningfulChange) return;

      // --- Batch execution: one sync per rAF ---
      if (!contentObserver.pendingSync) {
        contentObserver.pendingSync = true;

        requestAnimationFrame(() => {
          contentObserver.pendingSync = false;

          const originalDoc = originalIframe.contentDocument;
          if (!originalDoc) return;

          // Hash visible content only
          const snapshot = originalDoc.body.innerText.trim();
          const hash = quickHash(snapshot);

          if (hash === lastContentHash) {
            console.log("Skip sync: content hash unchanged.");
            return;
          }

          lastContentHash = hash;

          syncIframe();
        });
      }
    });




    contentObserver.observe(originalDoc, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

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