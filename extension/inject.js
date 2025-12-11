(function() {
  function waitForStore() {
    // Emarsys attaches its Redux store to window.ngrxStore or window.__store__ or via injector
    const store =
      window.ngrxStore ||
      window.__store__ ||
      (window.__ngrx__ && window.__ngrx__.store);

    if (!store || !store.dispatch) {
      requestAnimationFrame(waitForStore);
      return;
    }

    // Wrap the dispatch method so we can intercept state changes
    const originalDispatch = store.dispatch.bind(store);

    store.dispatch = function(action) {
      const prevState = store.getState().core?.campaign;

      const result = originalDispatch(action);

      const newState = store.getState().core?.campaign;

      // Compare references: reducer always creates new objects
      if (newState && newState !== prevState) {
        window.postMessage(
          {
            type: "__CAMPAIGN_UPDATED__",
            campaign: newState
          },
          "*"
        );
      }

      return result;
    };

    console.log("[EXT] Store hooked for campaign updates");
  }

  waitForStore();
})();
