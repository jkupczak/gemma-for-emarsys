console.log("[gem] block-pinning.js loaded");

// Block pinning and hiding functionality
function initializeBlockPinning() {
  console.log("[gem] Initializing block pinning and hiding");

  // Storage keys
  const PINNED_BLOCKS_KEY = 'pinnedBlocks';
  const HIDDEN_BLOCKS_KEY = 'hiddenBlocks';
  const SHOW_HIDDEN_BLOCKS_KEY = 'showHiddenBlocks';


  // Function to get pinned blocks from storage
  function getPinnedBlocks(callback) {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      callback([]); // Return empty array as fallback
      return;
    }

    try {
      chrome.storage.sync.get({ [PINNED_BLOCKS_KEY]: [] }, (result) => {
        // Check again if chrome APIs are still available after async call
        if (!chrome || !chrome.storage || !chrome.storage.sync) {
          console.warn("[Gem] Chrome storage API became unavailable during async call");
          callback([]); // Return empty array as fallback
          return;
        }

        callback(result[PINNED_BLOCKS_KEY] || []);
      });
    } catch (error) {
      console.error("[Gem] Error in getPinnedBlocks:", error);
      callback([]); // Return empty array as fallback
    }
  }

  // Function to save pinned blocks to storage
  function savePinnedBlocks(pinnedBlocks, callback) {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      if (callback) callback();
      return;
    }

    try {
      chrome.storage.sync.set({ [PINNED_BLOCKS_KEY]: pinnedBlocks }, () => {
        // Check if there was an error
        if (chrome.runtime.lastError) {
          console.error("[Gem] Error saving pinned blocks:", chrome.runtime.lastError);
        }
        if (callback) callback();
      });
    } catch (error) {
      console.error("[Gem] Error in savePinnedBlocks:", error);
      if (callback) callback();
    }
  }

  // Function to get hidden blocks from storage
  function getHiddenBlocks(callback) {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      callback([]); // Return empty array as fallback
      return;
    }

    try {
      chrome.storage.sync.get({ [HIDDEN_BLOCKS_KEY]: [] }, (result) => {
        // Check again if chrome APIs are still available after async call
        if (!chrome || !chrome.storage || !chrome.storage.sync) {
          console.warn("[Gem] Chrome storage API became unavailable during async call");
          callback([]); // Return empty array as fallback
          return;
        }

        callback(result[HIDDEN_BLOCKS_KEY] || []);
      });
    } catch (error) {
      console.error("[Gem] Error in getHiddenBlocks:", error);
      callback([]); // Return empty array as fallback
    }
  }

  // Function to save hidden blocks to storage
  function saveHiddenBlocks(hiddenBlocks, callback) {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      if (callback) callback();
      return;
    }

    try {
      chrome.storage.sync.set({ [HIDDEN_BLOCKS_KEY]: hiddenBlocks }, () => {
        // Check if there was an error
        if (chrome.runtime.lastError) {
          console.error("[Gem] Error saving hidden blocks:", chrome.runtime.lastError);
        }
        if (callback) callback();
      });
    } catch (error) {
      console.error("[Gem] Error in saveHiddenBlocks:", error);
      if (callback) callback();
    }
  }

  // Function to get show hidden blocks setting
  function getShowHiddenBlocks(callback) {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      callback(false); // Return false as fallback
      return;
    }

    try {
      chrome.storage.local.get({ [SHOW_HIDDEN_BLOCKS_KEY]: false }, (result) => {
        // Check again if chrome APIs are still available after async call
        if (!chrome || !chrome.storage || !chrome.storage.local) {
          console.warn("[Gem] Chrome storage API became unavailable during async call");
          callback(false); // Return false as fallback
          return;
        }

        callback(result[SHOW_HIDDEN_BLOCKS_KEY] || false);
      });
    } catch (error) {
      console.error("[Gem] Error in getShowHiddenBlocks:", error);
      callback(false); // Return false as fallback
    }
  }

  // Function to save show hidden blocks setting
  function saveShowHiddenBlocks(showHidden, callback) {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      if (callback) callback();
      return;
    }

    try {
      chrome.storage.local.set({ [SHOW_HIDDEN_BLOCKS_KEY]: showHidden }, () => {
        // Check if there was an error
        if (chrome.runtime.lastError) {
          console.error("[Gem] Error saving show hidden blocks:", chrome.runtime.lastError);
        }
        if (callback) callback();
      });
    } catch (error) {
      console.error("[Gem] Error in saveShowHiddenBlocks:", error);
      if (callback) callback();
    }
  }

  // Function to get title from block element
  function getBlockTitle(blockElement) {
    const titleElement = blockElement.querySelector('.e-card__title');
    return titleElement ? titleElement.textContent.trim() : '';
  }

  // Function to add pin icon to a block template
  function addIconsToBlock(blockElement) {
    // Check if icons already exist
    if (blockElement.querySelector('.gem-pin-icon') && blockElement.querySelector('.gem-hide-icon')) {
      return;
    }

    const title = getBlockTitle(blockElement);
    if (!title) return; // Skip if no title found

    // Create pin icon (top left)
    const pinIcon = document.createElement('div');
    pinIcon.className = 'gem-pin-icon';
    pinIcon.innerHTML = '📌'; // Pin emoji
    pinIcon.style.cssText = `
      position: absolute;
      top: 4px;
      left: 4px;
      width: 20px;
      height: 20px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 12px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
      user-select: none;
      opacity: 0; /* Hidden by default */
      filter: grayscale(100%); /* Grayscale by default */
    `;

    // Create hide icon (top right)
    const hideIcon = document.createElement('div');
    hideIcon.className = 'gem-hide-icon';
    hideIcon.innerHTML = '👁️'; // Eye emoji
    hideIcon.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 12px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
      user-select: none;
      opacity: 0; /* Hidden by default */
      filter: grayscale(100%); /* Grayscale by default */
    `;

    // Add hover effects for pin icon
    pinIcon.addEventListener('mouseenter', () => {
      pinIcon.style.transform = 'scale(1.1)';
      pinIcon.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    });

    pinIcon.addEventListener('mouseleave', () => {
      pinIcon.style.transform = 'scale(1)';
      pinIcon.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    });

    // Add hover effects for hide icon
    hideIcon.addEventListener('mouseenter', () => {
      hideIcon.style.transform = 'scale(1.1)';
      hideIcon.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    });

    hideIcon.addEventListener('mouseleave', () => {
      hideIcon.style.transform = 'scale(1)';
      hideIcon.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    });

    // Add click handlers
    pinIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleBlockPin(title);
    });

    hideIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleBlockHidden(title);
    });

    // Position the block element relatively if not already
    if (getComputedStyle(blockElement).position === 'static') {
      blockElement.style.position = 'relative';
    }

    // Add the icons to the block
    blockElement.appendChild(pinIcon);
    blockElement.appendChild(hideIcon);

    // Update icon appearances based on current state
    updatePinIconAppearance(pinIcon, title);
    updateHideIconAppearance(hideIcon, title);
  }

  // Function to update pin icon appearance based on pinned state
  function updatePinIconAppearance(pinIcon, title) {
    getPinnedBlocks((pinnedBlocks) => {
      const isPinned = pinnedBlocks.includes(title);

      if (isPinned) {
        pinIcon.style.background = '#fff';
        pinIcon.style.color = 'white';
        pinIcon.style.border = '1px solid #667eea';
      } else {
        pinIcon.style.background = 'rgba(255, 255, 255, 0.9)';
        pinIcon.style.color = 'black';
        pinIcon.style.border = '1px solid rgba(0, 0, 0, 0.1)';
      }
    });
  }

  // Function to update hide icon appearance based on hidden state
  function updateHideIconAppearance(hideIcon, title) {
    getHiddenBlocks((hiddenBlocks) => {
      const isHidden = hiddenBlocks.includes(title);

      if (isHidden) {
        hideIcon.style.background = '#fff';
        hideIcon.style.color = 'white';
        hideIcon.style.border = '1px solid #dc2626';
        hideIcon.innerHTML = '🙈'; // Hidden monkey emoji
      } else {
        hideIcon.style.background = 'rgba(255, 255, 255, 0.9)';
        hideIcon.style.color = 'black';
        hideIcon.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        hideIcon.innerHTML = '👁️'; // Eye emoji
      }
    });
  }

  // Function to toggle pin state for a block
  function toggleBlockPin(title) {
    getPinnedBlocks((pinnedBlocks) => {
      const isPinned = pinnedBlocks.includes(title);
      let newPinnedBlocks;

      if (isPinned) {
        // Unpin: remove from array
        newPinnedBlocks = pinnedBlocks.filter(block => block !== title);
      } else {
        // Pin: add to array, but first check if it's hidden and remove from hidden list
        newPinnedBlocks = [...pinnedBlocks, title];

        // If item is being pinned, remove it from hidden blocks if it's there
        getHiddenBlocks((hiddenBlocks) => {
          if (hiddenBlocks.includes(title)) {
            const newHiddenBlocks = hiddenBlocks.filter(block => block !== title);
            saveHiddenBlocks(newHiddenBlocks, () => {
              console.log("[Gem] Removed hidden status from pinned block:", title);
            });
          }
        });
      }

      // Save to storage
      savePinnedBlocks(newPinnedBlocks, () => {
        // Apply CSS classes for pinning
        applyPinnedClasses();

        // Update all pin icons
        updateAllPinIcons();
      });
    });
  }

  // Function to toggle hidden state of a block
  function toggleBlockHidden(title) {
    getHiddenBlocks((hiddenBlocks) => {
      const isHidden = hiddenBlocks.includes(title);
      let newHiddenBlocks;

      if (isHidden) {
        // Unhide: remove from array
        newHiddenBlocks = hiddenBlocks.filter(block => block !== title);
      } else {
        // Hide: add to array, but first check if it's pinned and remove from pinned list
        newHiddenBlocks = [...hiddenBlocks, title];

        // If item is being hidden, remove it from pinned blocks if it's there
        getPinnedBlocks((pinnedBlocks) => {
          if (pinnedBlocks.includes(title)) {
            const newPinnedBlocks = pinnedBlocks.filter(block => block !== title);
            savePinnedBlocks(newPinnedBlocks, () => {
              console.log("[Gem] Removed pinned status from hidden block:", title);
            });
          }
        });
      }

      // Save to storage
      saveHiddenBlocks(newHiddenBlocks, () => {
        // Apply CSS classes for hiding
        applyHiddenClasses();

        // Update all hide icons
        updateAllHideIcons();
      });
    });
  }

  // Function to update all pin icons
  function updateAllPinIcons() {
    const pinIcons = document.querySelectorAll('.gem-pin-icon');
    pinIcons.forEach(pinIcon => {
      const blockElement = pinIcon.closest('.block-template, .saved-block');
      if (blockElement) {
        const title = getBlockTitle(blockElement);
        if (title) {
          updatePinIconAppearance(pinIcon, title);
        }
      }
    });
  }

  // Function to update all hide icons
  function updateAllHideIcons() {
    const hideIcons = document.querySelectorAll('.gem-hide-icon');
    hideIcons.forEach(hideIcon => {
      const blockElement = hideIcon.closest('.block-template, .saved-block');
      if (blockElement) {
        const title = getBlockTitle(blockElement);
        if (title) {
          updateHideIconAppearance(hideIcon, title);
        }
      }
    });
  }

  // Function to apply CSS classes for pinned state (using CSS grid order)
  function applyPinnedClasses() {
    const blockTemplatesContainers = document.querySelectorAll('.block-templates');

    blockTemplatesContainers.forEach(container => {
      getPinnedBlocks((pinnedBlocks) => {
        const blocks = Array.from(container.querySelectorAll('.block-template'));

        blocks.forEach(block => {
          const title = getBlockTitle(block);
          if (title) {
            if (pinnedBlocks.includes(title)) {
              block.classList.add('gem-block-pinned');
            } else {
              block.classList.remove('gem-block-pinned');
            }
          }

          // Ensure all blocks have icons
          addIconsToBlock(block);
        });
      });
    });
  }

  // Function to apply hidden classes to blocks
  function applyHiddenClasses() {
    getShowHiddenBlocks((showHidden) => {
      const blockTemplatesContainers = document.querySelectorAll('.block-templates');

      blockTemplatesContainers.forEach(container => {
        getHiddenBlocks((hiddenBlocks) => {
          const blocks = Array.from(container.querySelectorAll('.block-template'));

          blocks.forEach(block => {
            const title = getBlockTitle(block);
            if (title && hiddenBlocks.includes(title)) {
              // Block is in hiddenBlocks
              if (showHidden) {
                // Show hidden blocks with semi-transparent overlay
                block.classList.add('gem-block-hidden');
                block.classList.remove('gem-block-completely-hidden');
              } else {
                // Completely hide the block
                block.classList.add('gem-block-completely-hidden');
                block.classList.remove('gem-block-hidden');
              }
            } else {
              // Block is not in hiddenBlocks - show it normally
              block.classList.remove('gem-block-completely-hidden');
              block.classList.remove('gem-block-hidden');
            }

            // Ensure all blocks have icons
            addIconsToBlock(block);
          });
        });
      });
    });
  }

  // Function to process newly added blocks (both templates and saved blocks)
  function processNewBlocks() {
    const blockTemplates = document.querySelectorAll('.block-template');

    blockTemplates.forEach(block => {
      addIconsToBlock(block);
    });
  }

  // Initial processing
  processNewBlocks();
  applyPinnedClasses();
  applyHiddenClasses();
  updateShowHiddenToggleButton();

  // Start monitoring for DOM changes
  monitorBlockList();

  // Watch for new blocks being added to the DOM
  const observer = new MutationObserver((mutations) => {
    let hasNewBlocks = false;

    mutations.forEach((mutation) => {
      // Only process childList mutations (not attribute changes)
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if a new block template was added
            if (node.matches && node.matches('.block-template')) {
              hasNewBlocks = true;
            }

            // Check if a container with block templates was added
            if (node.matches && node.matches('.block-templates')) {
              hasNewBlocks = true;
            }

            // Check descendants
            if (node.querySelectorAll) {
              const newBlocks = node.querySelectorAll('.block-template');
              const newContainers = node.querySelectorAll('.block-templates');
              if (newBlocks.length > 0 || newContainers.length > 0) {
                hasNewBlocks = true;
              }
            }
          }
        });
      }
    });

    if (hasNewBlocks) {
      // Small delay to ensure DOM is ready, then process and apply classes
      setTimeout(() => {
        processNewBlocks();
        applyPinnedClasses();
      }, 150);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Listen for storage changes to update pin icons and classes
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        if (changes[PINNED_BLOCKS_KEY]) {
          updateAllPinIcons();
          applyPinnedClasses();
        }
        if (changes[HIDDEN_BLOCKS_KEY]) {
          updateAllHideIcons();
          applyHiddenClasses();
          updateShowHiddenToggleButton();
        }
      }
      if (namespace === 'local') {
        if (changes[SHOW_HIDDEN_BLOCKS_KEY]) {
          updateAllHideIcons();
          applyHiddenClasses();
          updateShowHiddenToggleButton();
        }
      }
    });
  } else {
    console.warn("[Gem] Chrome storage onChanged API not available - extension context may be invalidated");
  }

  // Function to add toggle button for showing hidden blocks
  function addShowHiddenToggleButton() {
    const headerElement = document.querySelector('cb-available-block-list .e-section__header');
    if (!headerElement) {
      console.log("[Gem] Header element not found");
      return;
    }

    if (headerElement.querySelector('.gem-show-hidden-toggle')) {
      console.log("[Gem] Toggle buttons already exist");
      return; // Already exists
    }

    console.log("[Gem] Header element found, adding toggle buttons");

    const toggleButton = document.createElement('button');
    toggleButton.className = 'gem-show-hidden-toggle gem-e-btn-primary';
    toggleButton.style.cssText = `
      margin-left: auto;
      padding: 4px 8px;
      border: 1px solid var(--token-button-default-border);
      border-radius: 5px;
      background: var(--token-button-default-background);
      color: var(--token-button-default-text);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    `;

    toggleButton.addEventListener('click', () => {
      getShowHiddenBlocks((currentState) => {
        const newState = !currentState;
        saveShowHiddenBlocks(newState, () => {
          updateShowHiddenToggleButton();
          applyHiddenClasses();
        });
      });
    });

    // Create layout toggle button
    const layoutButton = document.createElement('button');
    layoutButton.className = 'gem-layout-toggle-button gem-e-btn-primary';
    layoutButton.textContent = 'Toggle Grid';
    layoutButton.title = 'Toggle blocks layout (1→2→3 per row)';
    layoutButton.style.cssText = `
      margin-left: 12px;
      padding: 4px 8px;
      border: 1px solid var(--token-button-default-border);
      border-radius: 5px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      color: var(--token-button-default-text);
      background: var(--token-button-default-background);
    `;

    layoutButton.addEventListener('click', () => {
      // Get current layout setting and cycle to next
      chrome.storage.sync.get({ blocksPanelLayout: "2" }, (settings) => {
        const currentLayout = settings.blocksPanelLayout;
        let newLayout;

        if (currentLayout === "1") {
          newLayout = "2";
        } else if (currentLayout === "2") {
          newLayout = "3";
        } else if (currentLayout === "3") {
          newLayout = "1";
        } else {
          newLayout = "2"; // Default fallback
        }

        // Save new layout setting
        chrome.storage.sync.set({ blocksPanelLayout: newLayout }, () => {
          console.log(`[Gem] Layout changed from ${currentLayout} to ${newLayout} per row`);
          // Update button appearance briefly to show feedback
          layoutButton.style.transform = 'translateY(-2px) scale(1.05)';
          setTimeout(() => {
            layoutButton.style.transform = 'translateY(0px) scale(1)';
          }, 150);
        });
      });
    });

    // Set up flexbox layout for proper alignment
    headerElement.style.display = 'flex';
    headerElement.style.alignItems = 'center';
    headerElement.style.justifyContent = 'flex-start';
    headerElement.style.width = '100%';

    // Insert layout button after the title but before the toggle button
    const titleElement = headerElement.querySelector('.e-section__title');
    if (titleElement) {
      titleElement.insertAdjacentElement('afterend', layoutButton);
    } else {
      headerElement.insertBefore(layoutButton, toggleButton);
    }

    headerElement.appendChild(toggleButton);
    updateShowHiddenToggleButton();
  }

  // Function to wait for and monitor the block list element
  function monitorBlockList() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheckButtons = false;
      let shouldProcessBlocks = false;

      mutations.forEach((mutation) => {
        // Check added nodes for cb-available-block-list, block containers, or blocks
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is cb-available-block-list
            if (node.matches && node.matches('cb-available-block-list')) {
              console.log("[Gem] Block list element added, checking for buttons");
              shouldCheckButtons = true;
              return;
            }

            // Check if the added node contains cb-available-block-list
            const blockList = node.querySelector && node.querySelector('cb-available-block-list');
            if (blockList) {
              console.log("[Gem] Block list element found in added node, checking for buttons");
              shouldCheckButtons = true;
              return;
            }

            // Check if the added node is the header element
            if (node.matches && node.matches('cb-available-block-list .e-section__header')) {
              console.log("[Gem] Header element added directly, checking for buttons");
              shouldCheckButtons = true;
              return;
            }

            // Check if the added node contains the header element
            const headerElement = node.querySelector && node.querySelector('cb-available-block-list .e-section__header');
            if (headerElement) {
              console.log("[Gem] Header element found in added node, checking for buttons");
              shouldCheckButtons = true;
              return;
            }

            // Check for block containers or individual blocks
            if (node.matches && node.matches('.block-templates')) {
              console.log("[Gem] Block container added, processing blocks");
              shouldProcessBlocks = true;
              return;
            }

            if (node.matches && node.matches('.block-template')) {
              shouldProcessBlocks = true;
              return;
            }

            // Check if added node contains block containers or blocks
            const blockContainer = node.querySelector && node.querySelector('.block-templates');
            const blockElement = node.querySelector && node.querySelector('.block-template');
            if (blockContainer || blockElement) {
              console.log("[Gem] Block container or element found in added node, processing");
              shouldProcessBlocks = true;
              return;
            }
          }
        });
      });

      // If we found relevant elements, check if buttons need to be added
      if (shouldCheckButtons) {
        setTimeout(() => {
          const headerElement = document.querySelector('cb-available-block-list .e-section__header');
          if (headerElement && !headerElement.querySelector('.gem-show-hidden-toggle')) {
            console.log("[Gem] Buttons missing, adding them");
            addShowHiddenToggleButton();
          }
        }, 100); // Small delay to ensure DOM is ready
      }

      // If we found blocks, process them
      if (shouldProcessBlocks) {
        setTimeout(() => {
          processNewBlocks();
          applyPinnedClasses();
          applyHiddenClasses();
        }, 150); // Slightly longer delay for blocks
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Function to update the toggle button text and state
  function updateShowHiddenToggleButton() {
    const toggleButton = document.querySelector('.gem-show-hidden-toggle');
    if (!toggleButton) return;

    getShowHiddenBlocks((showHidden) => {
      getHiddenBlocks((hiddenBlocks) => {
        const hiddenCount = hiddenBlocks.length;

        if (hiddenCount === 0) {
          toggleButton.style.display = 'none'; // Hide button if no hidden blocks
        } else {
          toggleButton.style.display = 'inline-block';
          toggleButton.textContent = showHidden ? `Hide ${hiddenCount} Hidden` : `Show ${hiddenCount} Hidden`;
        }
      });
    });
  }

  // Add toggle button for showing hidden blocks
  addShowHiddenToggleButton();
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBlockPinning);
} else {
  initializeBlockPinning();
}
