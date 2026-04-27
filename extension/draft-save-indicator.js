console.log('[Gem] draft-save-indicator.js loaded');

(function initializeDraftSaveIndicator() {
  if (window.__gemDraftSaveIndicatorInitialized) return;
  window.__gemDraftSaveIndicatorInitialized = true;

  let wasSaveInProgress = false;
  let saveProgressActive = false;
  let saveProgressPct = 0;
  let saveProgressTickT = null;
  let saveProgressHideT = null;
  let syncScheduled = false;

  function ensureUi() {
    let bar = document.getElementById('gem-save-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'gem-save-progress-bar';
      bar.innerHTML = '<div class="gem-save-progress-bar__fill"></div>';
      (document.body || document.documentElement).appendChild(bar);
    }
    if (!document.getElementById('gem-save-progress-style')) {
      const style = document.createElement('style');
      style.id = 'gem-save-progress-style';
      style.textContent = `
        #gem-save-progress-bar {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          z-index: 2147483647;
          pointer-events: none;
          opacity: 0;
          transition: opacity 140ms ease;
        }
        #gem-save-progress-bar.gem-save-progress-bar--visible {
          opacity: 1;
        }
        #gem-save-progress-bar .gem-save-progress-bar__fill {
          width: 100%;
          height: 100%;
          transform-origin: left center;
          transform: scaleX(0);
          background: var(--token-button-highlight-background);
          box-shadow: 0 0 8px var(--token-button-highlight-background);
          transition: transform 180ms linear;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    return bar;
  }

  function setProgress(pct, durationMs) {
    const bar = ensureUi();
    const fill = bar.querySelector('.gem-save-progress-bar__fill');
    if (!fill) return;
    fill.style.transitionDuration = `${Math.max(0, Math.round(durationMs || 0))}ms`;
    fill.style.transform = `scaleX(${Math.min(1, Math.max(0, pct))})`;
  }

  function clearTimers() {
    if (saveProgressTickT) {
      clearInterval(saveProgressTickT);
      saveProgressTickT = null;
    }
    if (saveProgressHideT) {
      clearTimeout(saveProgressHideT);
      saveProgressHideT = null;
    }
  }

  function startProgress() {
    const bar = ensureUi();
    clearTimers();
    saveProgressActive = true;
    saveProgressPct = 0.06;
    bar.classList.add('gem-save-progress-bar--visible');
    setProgress(saveProgressPct, 120);

    saveProgressTickT = setInterval(() => {
      // Fake progress curve: move fast initially, then hover under completion.
      const remaining = 0.92 - saveProgressPct;
      if (remaining <= 0) return;
      saveProgressPct = Math.min(0.92, saveProgressPct + Math.max(0.004, remaining * 0.08));
      setProgress(saveProgressPct, 140);
    }, 140);
  }

  function finishProgress() {
    if (!saveProgressActive) return;
    const bar = ensureUi();
    clearTimers();
    saveProgressPct = 1;
    setProgress(1, 220);
    saveProgressHideT = setTimeout(() => {
      bar.classList.remove('gem-save-progress-bar--visible');
      saveProgressActive = false;
      saveProgressPct = 0;
      setProgress(0, 0);
    }, 520);
  }

  function isSaveInProgress() {
    const loading = document.querySelector('cb-draft-save-button button .e-btn__loading');
    return !!(loading && loading.classList.contains('e-btn__loading-active'));
  }

  function syncState() {
    const inProgress = isSaveInProgress();
    if (inProgress && !wasSaveInProgress) {
      startProgress();
    } else if (!inProgress && wasSaveInProgress) {
      finishProgress();
    }
    wasSaveInProgress = inProgress;
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      syncState();
    });
  }

  const root = document.body || document.documentElement;
  if (root) {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          return mutation.attributeName === 'class' || mutation.attributeName === 'disabled';
        }
        return mutation.type === 'childList' &&
          (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
      });
      if (relevant) scheduleSync();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled']
    });
  }

  scheduleSync();
  setTimeout(scheduleSync, 100);
})();
