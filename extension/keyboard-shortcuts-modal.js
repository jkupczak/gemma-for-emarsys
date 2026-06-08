(function () {

  function showKeyboardShortcutsModal() {
    const existing = document.getElementById('gem-keyboard-shortcuts-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gem-keyboard-shortcuts-modal';
    modal.className = 'gem-welcome-modal';
    modal.innerHTML = `
    <div class="gem-welcome-modal__panel" role="dialog" aria-modal="true">
      <div class="gem-welcome-modal__header">
        <div style="font-weight:600;">Gemma Keyboard Shortcuts</div>
        <button class="e-btn e-btn-borderless e-btn-onlyicon gem-welcome-modal__close" type="button" aria-label="Close">
          ✕
        </button>
      </div>
      <div class="gem-welcome-modal__body gem-scrollable" style="max-height: 60vh; overflow-y: auto;">
        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">General Shortcuts</h3>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+G</kbd>
            <span>Open/Close Gemma Settings Panel</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+/</kbd>
            <span>Open/Close Recent Campaigns panel</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+;</kbd>
            <span>Open/Close Notes panel</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+SHIFT+F</kbd>
            <span>Toggle Expanded View Mode</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+S</kbd>
            <span>Save the current email</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+SHIFT+,</kbd>
            <span>Cycle to the previous language version (when language selector is available)</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+SHIFT+.</kbd>
            <span>Cycle to the next language version (when language selector is available)</span>
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">Image Properties Dialog</h3>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Enter</kbd>
            <span>Accept changes (clicks the OK button)</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+D</kbd>
            <span>Toggle between Desktop and Mobile tabs</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+Click</kbd>
            <span>On an inactive search pill in the Image Picker — activates it exclusively, deactivates all other pills, and clears the search input</span>
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">Block Editing</h3>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${window.GEM_MOD_KEY}+SHIFT+V</kbd>
            <span>Paste plain text from the clipboard (without Rich Paste formatting)</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Double-click</kbd>
            <span>on an editable image to open the Image Properties dialog</span>

            <kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Double-click</kbd>
            <span>on an ESL token to open the ESL snippet dialog</span>
          </div>
        </div>

      </div>
      <div class="gem-welcome-modal__footer">
        <button class="e-btn e-btn-primary gem-keyboard-shortcuts-close" type="button">Close</button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('gem-welcome-modal__close') || e.target.classList.contains('gem-keyboard-shortcuts-close')) {
        closeModal();
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  window.showGemKeyboardShortcutsModal = showKeyboardShortcutsModal;

})();
