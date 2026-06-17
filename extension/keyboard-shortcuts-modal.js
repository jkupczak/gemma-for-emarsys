(function () {

  function kbd(text) {
    return `<kbd style="background: var(--token-input-background); border: 1px solid var(--token-input-border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${text}</kbd>`;
  }

  function shortcutGrid(rows) {
    return `
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
        ${rows.map(([key, desc]) => `${kbd(key)}<span>${desc}</span>`).join('\n')}
      </div>
    `;
  }

  function section(title, rows) {
    return `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px 0; color: var(--token-accent-foreground);">${title}</h3>
        ${shortcutGrid(rows)}
      </div>
    `;
  }

  function showKeyboardShortcutsModal() {
    const existing = document.getElementById('gem-keyboard-shortcuts-modal');
    if (existing) existing.remove();

    const mod = window.GEM_MOD_KEY || 'CTRL';

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
        <p style="margin: 0 0 20px 0; color: var(--token-font-muted, #666); font-size: 13px; line-height: 1.45;">
          Shortcuts work in the email editor and most Gemma panels. Opening Recent Campaigns, Notes, or Settings with a shortcut will close the other panel if it is already open.
        </p>

        ${section('Panels &amp; Navigation', [
          [`${mod}+G`, 'Open or close Gemma Settings'],
          [`${mod}+/`, 'Open or close Recent Campaigns'],
          [`${mod}+;`, 'Open or close Notes'],
          [`${mod}+Shift+F`, 'Toggle Expanded View mode (fullscreen email layout)'],
          [`${mod}+Shift+,`, 'Previous language version (when language selector is available)'],
          [`${mod}+Shift+.`, 'Next language version (when language selector is available)'],
          ['Esc', 'Close Gemma modals and panels that support it']
        ])}

        ${section('Email Editor', [
          [`${mod}+S`, 'Save the current email'],
          [`${mod}+Shift+V`, 'Paste plain text (bypass Rich Paste formatting)']
        ])}

        ${section('Image Properties Dialog', [
          ['Enter', 'Accept changes (clicks OK) — when focus is not in a text field'],
          [`${mod}+D`, 'Toggle Desktop and Mobile tabs'],
          [`${mod}+Click`, 'On an inactive Image Picker search pill — activate it exclusively and clear the search input'],
          ['Double-click', 'An editable image in the email preview to open Image Properties']
        ])}

        ${section('Block &amp; ESL Editing', [
          ['Double-click', 'An ESL token in the email preview to open the ESL snippet editor']
        ])}
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
