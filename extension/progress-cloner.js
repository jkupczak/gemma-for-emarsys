console.log("progress-cloner.js loaded");

// Clone .e-steps__progress and insert after cb-header h1 with display: none

function initializeProgressCloner() {
  console.log("[Gem] Initializing progress cloner...");

  // Store references to both elements
  let progressElement = null;
  let headerTitle = null;
  let hasInsertedClone = false;

  // Function to clone and insert progress element (only when both elements are available)
  function attemptCloneAndInsert() {
    if (!progressElement || !headerTitle || hasInsertedClone) {
      return;
    }

    // Clone the progress element and all its children
    const progressClone = progressElement.cloneNode(true);

    // Add inline style to hide it
    progressClone.style.display = 'none';

    // Insert after the header title
    headerTitle.insertAdjacentElement('afterend', progressClone);

    hasInsertedClone = true;
    console.log("[Gem] Progress element cloned and inserted after cb-header h1");
  }

  // Function to handle when progress element is found
  function handleProgressElementFound(element) {
    progressElement = element;
    console.log("[Gem] Progress element found, waiting for header...");
    attemptCloneAndInsert();
  }

  // Function to handle when header title is found
  function handleHeaderTitleFound(element) {
    headerTitle = element;
    console.log("[Gem] Header title found, waiting for progress element...");
    attemptCloneAndInsert();
  }

  // Check for existing elements
  const existingProgress = document.querySelector('.e-steps__progress');
  if (existingProgress) {
    handleProgressElementFound(existingProgress);
  }

  const existingHeader = document.querySelector('cb-header h1');
  if (existingHeader) {
    handleHeaderTitleFound(existingHeader);
  }

  // Monitor for new elements being added
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for progress element
          if (node.classList && node.classList.contains('e-steps__progress')) {
            console.log("[Gem] Progress element detected in DOM");
            handleProgressElementFound(node);
          }

          // Check for header title
          if (node.tagName === 'CB-HEADER') {
            const h1 = node.querySelector('h1');
            if (h1) {
              console.log("[Gem] Header title detected in DOM");
              handleHeaderTitleFound(h1);
            }
          } else if (node.tagName === 'H1' && node.parentElement && node.parentElement.tagName === 'CB-HEADER') {
            console.log("[Gem] Header title detected in DOM");
            handleHeaderTitleFound(node);
          }

          // Also check children of added nodes
          if (node.querySelectorAll) {
            const progressElements = node.querySelectorAll('.e-steps__progress');
            progressElements.forEach(progressEl => {
              console.log("[Gem] Progress element detected in added subtree");
              handleProgressElementFound(progressEl);
            });

            const headerTitles = node.querySelectorAll('cb-header h1');
            headerTitles.forEach(headerEl => {
              console.log("[Gem] Header title detected in added subtree");
              handleHeaderTitleFound(headerEl);
            });
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log("[Gem] Progress cloner initialized and monitoring for both elements");
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProgressCloner);
} else {
  initializeProgressCloner();
}
