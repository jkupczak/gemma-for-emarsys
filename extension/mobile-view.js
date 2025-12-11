console.log("mobile-view.js loaded");

// Check if mobile preview is enabled and initialize accordingly
chrome.storage.sync.get({ enableMobilePreview: true }, (settings) => {
  if (settings.enableMobilePreview) {
    initializeMobileView();
  }
});

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enableMobilePreview) {
    if (changes.enableMobilePreview.newValue) {
      initializeMobileView();
    } else {
      disableMobileView();
    }
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
  // Create container & clone
  //----------------------------------------------------------
  const containerDiv = document.createElement("div");
  containerDiv.className = "gem-iframe-wrapper";

  Object.assign(containerDiv.style, {
    width: "207px",
    maxWidth: "207px",
    minWidth: "207px",
    position: "relative",
    background: "#d5dadd",
    borderRadius: "5px",
    overflow: "hidden",
    zIndex: "9"
  });

  const cloneIframe = document.createElement("iframe");
  cloneIframe.className = "iframe-duplicate";

  Object.assign(cloneIframe.style, {
    maxWidth: "unset",
    height: "200%",
    transformOrigin: "top left",
    transform: "scale(0.5)",
    width: "414px",
    position: "absolute",
    top: "0",
    left: "0",
    boxShadow: "2px 2px 10px rgba(0, 0, 0, 0.125)"
  });

  containerDiv.appendChild(cloneIframe);

  Object.assign(originalIframe.style, {
    position: "static",
  });


  document.querySelector("section.e-layout__section.e-contentblocks-preview_section").insertAdjacentElement("afterend", containerDiv);

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

  // Delete existing clone + container
  const oldClone = document.querySelector(".iframe-duplicate");
  const oldContainer = oldClone?.parentElement;
  if (oldContainer) oldContainer.remove();

  // Remove injected styles
  const styles = document.getElementById("gem-styles");
  if (styles) styles.remove();
}

//----------------------------------------------------------
// MAIN AUTO-RESPAWN LOGIC (now wrapped in initializeMobileView)
//----------------------------------------------------------