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

  let shortcutsModalEscapeUnsub = null;

  function unbindShortcutsModalEscape() {
    if (typeof shortcutsModalEscapeUnsub === 'function') {
      shortcutsModalEscapeUnsub();
    }
    shortcutsModalEscapeUnsub = null;
  }

  const SNIPPET_CONTEXT_MENU_TRIGGER_KEY = 'gemSnippetContextMenuTrigger';
  const SNIPPET_CONTEXT_MENU_REQUIRE_MOD_KEY = 'gemSnippetContextMenuRequireMod';

  function resolveSnippetContextMenuRequireMod(res) {
    const trigger = res?.[SNIPPET_CONTEXT_MENU_TRIGGER_KEY];
    if (trigger === 'mod-right-click') return true;
    if (trigger === 'right-click') return false;
    return res?.[SNIPPET_CONTEXT_MENU_REQUIRE_MOD_KEY] === true;
  }

  function getSnippetContextMenuShortcutRows(mod, requireMod) {
    const quickInsert = window.GEM_IS_MAC
      ? `${mod}+Option+1/2/3`
      : `${mod}+Shift+1/2/3`;
    const shared = [
      [`${mod}+Shift+M`, 'Open token menu at the caret (campaign editor; when focused in an insertable field)'],
      [quickInsert, 'Insert 1st/2nd/3rd most recently used token at the caret'],
      ['1 / 2 / 3', 'While token menu is open — insert that recent token (not while typing in search)'],
    ];
    if (requireMod) {
      return [
        [`${mod} + right-click`, 'Open snippet menu in editable fields (campaign editor)'],
        ['Right-click', 'Open the browser context menu instead of the snippet menu'],
        ...shared,
      ];
    }
    return [
      ['Right-click', 'Open snippet menu in editable fields (campaign editor)'],
      [`${mod} + right-click`, 'Open the browser context menu instead of the snippet menu'],
      ...shared,
    ];
  }

  function renderKeyboardShortcutsModal(requireMod) {
    const existing = document.getElementById('gem-keyboard-shortcuts-modal');
    if (existing) existing.remove();
    unbindShortcutsModalEscape();

    const mod = window.GEM_MOD_KEY || 'CTRL';

    const modal = document.createElement('div');
    modal.id = 'gem-keyboard-shortcuts-modal';
    modal.className = 'gem-welcome-modal gem-layer-modal';
    modal.innerHTML = `
    <div class="gem-welcome-modal__panel" role="dialog" aria-modal="true" aria-labelledby="gem-keyboard-shortcuts-modal-title">
      <div class="gem-welcome-modal__header">
        <div id="gem-keyboard-shortcuts-modal-title" style="font-weight:600;">Gemma Keyboard Shortcuts</div>
        <button class="e-btn e-btn-borderless e-btn-onlyicon gem-welcome-modal__close" type="button" aria-label="Close">
          ✕
        </button>
      </div>
      <div class="gem-welcome-modal__body gem-scrollable" style="max-height: 70vh; overflow-y: auto;">
        <p style="margin: 0 0 20px 0; color: var(--token-font-muted, #666); font-size: 13px; line-height: 1.45;">
          Shortcuts work in the email editor and most Gemma panels. Opening Recent Campaigns, Notes, or Settings with a shortcut will close the other panel if it is already open.
        </p>

        ${section('Panels &amp; Navigation', [
          [`${mod}+G`, 'Open or close Gemma Settings'],
          [`${mod}+/`, 'Open or close Recent Campaigns'],
          [`${mod}+;`, 'Open or close Notes'],
          [`${mod}+P`, 'Open or close Command Palette'],
          [`${mod}+Shift+P`, 'Open or close Command Palette'],
          [`${mod}+Shift+F`, 'Toggle between Standard Layout and Focus Layout'],
          [`${mod}+Shift+M`, 'Toggle Mobile Sidepanel'],
          [`${mod}+Shift+,`, 'Previous language version (when language selector is available)'],
          [`${mod}+Shift+.`, 'Next language version (when language selector is available)'],
          ['Esc', 'Close Gemma modals and panels that support it']
        ])}

        ${section('Email Editor', [
          [`${mod}+S`, 'Save the current email'],
          [`${mod}+Shift+V`, 'Paste plain text (bypass Rich Paste formatting)'],
          ...getSnippetContextMenuShortcutRows(mod, requireMod)
        ])}

        ${section('Image Properties Dialog', [
          ['Enter', 'Accept changes (clicks OK)'],
          [`${mod}+D`, 'Toggle Desktop and Mobile tabs'],
          [`Hold ${window.GEM_IS_MAC ? 'Option' : 'Alt'}`, 'Temporarily hide the dialog to peek at the editor behind it'],
          [`${mod}+Click`, 'On an inactive Image Picker search pill — activate it exclusively and clear the search input'],
          ['Double-click', 'An editable image in the email preview to open Image Properties']
        ])}

        ${section('Block &amp; ESL Editing', [
          ['Double-click', 'An ESL token in the email preview to open the ESL snippet editor'],
          ['Double-click', 'A personalization token in the email preview to open the Personalization editor']
        ])}

        ${section('Email Campaign List', [
          ['←', 'Previous campaign in the side preview (when preview is open; not while typing in a field)'],
          ['→', 'Next campaign in the side preview (when preview is open; not while typing in a field)']
        ])}
      </div>
      <div class="gem-welcome-modal__footer">
        <button class="e-btn e-btn-primary gem-keyboard-shortcuts-close" type="button">Close</button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    if (typeof window.gemLayerRaise === 'function') {
      window.gemLayerRaise(modal, { tier: 'modal' });
    }

    modal.tabIndex = -1;

    const closeModal = () => {
      unbindShortcutsModalEscape();
      if (typeof window.gemLayerRelease === 'function') {
        window.gemLayerRelease(modal);
      }
      modal.remove();
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('gem-welcome-modal__close') || e.target.classList.contains('gem-keyboard-shortcuts-close')) {
        closeModal();
      }
    });

    if (typeof window.gemLayerBindEscape === 'function') {
      shortcutsModalEscapeUnsub = window.gemLayerBindEscape(closeModal, {
        whileConnected: () => !!document.getElementById('gem-keyboard-shortcuts-modal')
      });
    } else {
      const onEscape = (e) => {
        if (e.key !== 'Escape' && e.code !== 'Escape') return;
        if (!document.getElementById('gem-keyboard-shortcuts-modal')) {
          unbindShortcutsModalEscape();
          return;
        }
        closeModal();
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('keydown', onEscape, true);
      shortcutsModalEscapeUnsub = () => document.removeEventListener('keydown', onEscape, true);
    }

    requestAnimationFrame(() => {
      try {
        modal.focus({ preventScroll: true });
      } catch (_) {
        try { modal.focus(); } catch (_) {}
      }
    });
  }

  function showKeyboardShortcutsModal() {
    const finish = (requireMod) => renderKeyboardShortcutsModal(!!requireMod);
    if (!chrome?.storage?.sync) {
      finish(false);
      return;
    }
    chrome.storage.sync.get({
      [SNIPPET_CONTEXT_MENU_TRIGGER_KEY]: 'right-click',
      [SNIPPET_CONTEXT_MENU_REQUIRE_MOD_KEY]: false,
    }, (res) => {
      finish(resolveSnippetContextMenuRequireMod(res));
    });
  }

  window.showGemKeyboardShortcutsModal = showKeyboardShortcutsModal;

  function closeGemKeyboardShortcutsModal() {
    const modal = document.getElementById('gem-keyboard-shortcuts-modal');
    if (!modal) {
      unbindShortcutsModalEscape();
      return;
    }
    unbindShortcutsModalEscape();
    if (typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(modal);
    }
    modal.remove();
  }

  window.closeGemKeyboardShortcutsModal = closeGemKeyboardShortcutsModal;

  function gemWireShortcutHint(el) {
    if (!el || el._gemShortcutHintWired) return el;
    el._gemShortcutHintWired = true;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('title', 'View keyboard shortcuts');
    el.setAttribute('aria-label', 'View keyboard shortcuts');
    const open = () => {
      if (typeof window.showGemKeyboardShortcutsModal === 'function') {
        window.showGemKeyboardShortcutsModal();
      }
    };
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      open();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        open();
      }
    });
    return el;
  }

  window.gemWireShortcutHint = gemWireShortcutHint;

})();
