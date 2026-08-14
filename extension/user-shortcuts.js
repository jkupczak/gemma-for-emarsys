console.log('[Gem] user-shortcuts.js loaded');

(function () {
  'use strict';

  if (window.gemLoadUserCreatedShortcuts) return;

  const STORAGE_KEY = 'gemUserCreatedShortcuts';
  const DEFAULT_PRESET_ID = 'mod-option';

  const LETTER_KEY_CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => ({
    code: `Key${letter}`,
    label: letter,
  }));

  const PUNCTUATION_KEY_CODES = [
    { code: 'Backquote', label: '`' },
    { code: 'Minus', label: '-' },
    { code: 'Equal', label: '=' },
    { code: 'BracketLeft', label: '[' },
    { code: 'BracketRight', label: ']' },
    { code: 'Backslash', label: '\\' },
    { code: 'Semicolon', label: ';' },
    { code: 'Quote', label: "'" },
    { code: 'Comma', label: ',' },
    { code: 'Period', label: '.' },
    { code: 'Slash', label: '/' },
  ];

  const ALL_KEY_CODES = [...LETTER_KEY_CODES, ...PUNCTUATION_KEY_CODES];
  const KEY_LABEL_BY_CODE = Object.fromEntries(ALL_KEY_CODES.map((entry) => [entry.code, entry.label]));

  const DIGIT_CODES = [];
  for (let i = 0; i <= 9; i += 1) {
    DIGIT_CODES.push(`Digit${i}`, `Numpad${i}`);
  }

  const MODIFIER_PRESETS = [
    {
      id: 'mod-option',
      labelMac: '⌘+Option',
      labelWin: 'CTRL+Shift',
      matches(event) {
        if (window.GEM_IS_MAC) {
          return !!(event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey);
        }
        return !!(event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey);
      },
    },
    {
      id: 'mod-control',
      labelMac: '⌘+Control',
      labelWin: 'CTRL+Alt',
      matches(event) {
        if (window.GEM_IS_MAC) {
          return !!(event.metaKey && event.ctrlKey && !event.altKey && !event.shiftKey);
        }
        return !!(event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey);
      },
    },
    {
      id: 'mod-option-shift',
      labelMac: '⌘+Option+Shift',
      labelWin: 'CTRL+Shift+Alt',
      matches(event) {
        if (window.GEM_IS_MAC) {
          return !!(event.metaKey && event.altKey && event.shiftKey && !event.ctrlKey);
        }
        return !!(event.ctrlKey && event.shiftKey && event.altKey && !event.metaKey);
      },
    },
  ];

  const PRESET_BY_ID = Object.fromEntries(MODIFIER_PRESETS.map((preset) => [preset.id, preset]));

  const GEMMA_RESERVED_BY_PRESET = {
    'mod-option': {
      mac: [...DIGIT_CODES],
      win: ['KeyF', 'KeyM', 'KeyP', 'KeyV', 'Comma', 'Period', ...DIGIT_CODES],
    },
    'mod-control': {
      mac: [],
      win: [],
    },
    'mod-option-shift': {
      mac: [],
      win: [],
    },
  };

  const OS_BROWSER_RESERVED = {
    all: ['KeyN', 'KeyT', 'KeyW'],
    mac: ['KeyC', 'KeyI', 'KeyJ'],
    win: ['KeyC', 'KeyI', 'KeyJ', 'KeyD'],
  };

  const OS_BROWSER_RESERVED_BY_PRESET = {
    'mod-option': {
      mac: OS_BROWSER_RESERVED.mac,
      win: [...OS_BROWSER_RESERVED.all, ...OS_BROWSER_RESERVED.win],
    },
    'mod-control': {
      mac: [...OS_BROWSER_RESERVED.mac, 'KeyD'],
      win: [...OS_BROWSER_RESERVED.all, ...OS_BROWSER_RESERVED.win],
    },
    'mod-option-shift': {
      mac: [],
      win: ['KeyN', 'KeyT'],
    },
  };

  let cachedBindings = [];

  function normalizePresetId(raw) {
    const id = String(raw || '').trim();
    return PRESET_BY_ID[id] ? id : DEFAULT_PRESET_ID;
  }

  function bindingComboKey(presetId, code) {
    return `${normalizePresetId(presetId)}:${String(code || '').trim()}`;
  }

  function getReservedCodesForPreset(presetId) {
    const preset = normalizePresetId(presetId);
    const platform = window.GEM_IS_MAC ? 'mac' : 'win';
    const reserved = new Set();

    (GEMMA_RESERVED_BY_PRESET[preset]?.[platform] || []).forEach((code) => reserved.add(code));
    (OS_BROWSER_RESERVED_BY_PRESET[preset]?.[platform] || []).forEach((code) => reserved.add(code));
    (OS_BROWSER_RESERVED_BY_PRESET[preset]?.all || []).forEach((code) => reserved.add(code));

    return reserved;
  }

  function isCodeAllowedForPreset(code, presetId) {
    const normalized = String(code || '').trim();
    if (!normalized || !KEY_LABEL_BY_CODE[normalized]) return false;
    return !getReservedCodesForPreset(presetId).has(normalized);
  }

  function generateBindingId() {
    return `us-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeBindings(raw) {
    if (!Array.isArray(raw)) return [];
    const seenComboKeys = new Set();
    const seenIds = new Set();
    const normalized = [];
    raw.forEach((entry) => {
      const commandId = String(entry?.commandId || '').trim();
      const presetId = normalizePresetId(entry?.presetId);
      const code = String(entry?.code || '').trim();
      if (!commandId || !code || !isCodeAllowedForPreset(code, presetId)) return;
      const comboKey = bindingComboKey(presetId, code);
      if (seenComboKeys.has(comboKey)) return;
      let id = String(entry?.id || '').trim();
      if (!id || seenIds.has(id)) {
        id = generateBindingId();
      }
      seenComboKeys.add(comboKey);
      seenIds.add(id);
      normalized.push({ id, commandId, presetId, code });
    });
    return normalized;
  }

  function loadUserShortcutSettings(callback) {
    if (!chrome?.storage?.sync) {
      cachedBindings = [];
      if (callback) callback({ bindings: cachedBindings.slice() });
      return;
    }
    chrome.storage.sync.get({ [STORAGE_KEY]: [] }, (res) => {
      cachedBindings = normalizeBindings(res?.[STORAGE_KEY]);
      if (callback) callback({ bindings: cachedBindings.slice() });
    });
  }

  function loadUserCreatedShortcuts(callback) {
    loadUserShortcutSettings((settings) => {
      if (callback) callback(settings.bindings);
    });
  }

  function saveUserCreatedShortcuts(bindings, callback) {
    cachedBindings = normalizeBindings(bindings);
    if (!chrome?.storage?.sync) {
      if (callback) callback(cachedBindings);
      return;
    }
    chrome.storage.sync.set({ [STORAGE_KEY]: cachedBindings }, () => {
      if (callback) callback(cachedBindings.slice());
    });
  }

  function getUserShortcutModifierPresets() {
    return MODIFIER_PRESETS.map((preset) => ({
      id: preset.id,
      label: window.GEM_IS_MAC ? preset.labelMac : preset.labelWin,
    }));
  }

  function getUserShortcutModifierLabel(presetId) {
    const preset = PRESET_BY_ID[normalizePresetId(presetId)];
    if (!preset) return window.GEM_MOD_KEY || 'CTRL';
    return window.GEM_IS_MAC ? preset.labelMac : preset.labelWin;
  }

  function formatUserShortcutCombo(code, presetId) {
    const keyLabel = KEY_LABEL_BY_CODE[code] || code;
    return `${getUserShortcutModifierLabel(presetId)}+${keyLabel}`;
  }

  function getUserShortcutKeyOptions(excludeCodes = [], presetId) {
    const preset = normalizePresetId(presetId);
    const excluded = new Set(excludeCodes.map((code) => String(code || '').trim()).filter(Boolean));
    const reserved = getReservedCodesForPreset(preset);
    return ALL_KEY_CODES.filter((entry) => !reserved.has(entry.code) && !excluded.has(entry.code));
  }

  function isUserShortcutChord(event, presetId) {
    if (!event || event.isComposing) return false;
    const preset = PRESET_BY_ID[normalizePresetId(presetId)];
    return preset ? preset.matches(event) : false;
  }

  function getUserShortcutCombosByCommandId(commandId) {
    const id = String(commandId || '').trim();
    if (!id) return [];
    return cachedBindings
      .filter((entry) => entry.commandId === id)
      .map((binding) => formatUserShortcutCombo(binding.code, binding.presetId));
  }

  function getUserShortcutComboByCommandId(commandId) {
    return getUserShortcutCombosByCommandId(commandId).join(', ');
  }

  function getUserShortcutBindingsMap() {
    const map = new Map();
    cachedBindings.forEach((binding) => {
      const combo = formatUserShortcutCombo(binding.code, binding.presetId);
      if (!map.has(binding.commandId)) {
        map.set(binding.commandId, combo);
        return;
      }
      map.set(binding.commandId, `${map.get(binding.commandId)}, ${combo}`);
    });
    return map;
  }

  function canRunUserShortcut(binding) {
    if (!binding || typeof window.gemIsPaletteCommandAvailableOnPage !== 'function') return false;
    const id = String(binding.commandId || '').trim();
    if (!id) return false;
    if (typeof window.gemGetAssignablePaletteCommands === 'function') {
      const assignable = window.gemGetAssignablePaletteCommands();
      if (!assignable.some((cmd) => cmd.id === id)) return false;
    }
    return window.gemIsPaletteCommandAvailableOnPage(id);
  }

  function runUserShortcut(binding) {
    if (!binding || typeof window.gemRunPaletteCommandById !== 'function') return false;
    if (!canRunUserShortcut(binding)) return false;
    return window.gemRunPaletteCommandById(binding.commandId);
  }

  function onUserShortcutKeyDown(event) {
    const code = String(event.code || '').trim();
    if (!code) return;

    for (const binding of cachedBindings) {
      if (!isUserShortcutChord(event, binding.presetId)) continue;
      if (binding.code !== code) continue;
      if (!isCodeAllowedForPreset(code, binding.presetId)) continue;
      if (!canRunUserShortcut(binding)) continue;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      runUserShortcut(binding);
      return;
    }
  }

  function bindUserShortcutToDoc(doc) {
    if (!doc || doc._gemUserShortcutHandler) return;
    doc.addEventListener('keydown', onUserShortcutKeyDown, true);
    doc._gemUserShortcutHandler = true;
  }

  function injectUserShortcutIntoIframe(iframe) {
    try {
      if (
        typeof window.gemIsGemStrippedEmbedIframe === 'function' &&
        window.gemIsGemStrippedEmbedIframe(iframe)
      ) {
        return;
      }
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;
      bindUserShortcutToDoc(iframeDoc);
    } catch (_) {}
  }

  function bindIframeShortcutWatcher() {
    const waitForIframeReady = (iframe) => {
      if (!iframe || iframe._gemUserShortcutIframeLoadBound) return;
      iframe._gemUserShortcutIframeLoadBound = true;
      iframe.addEventListener('load', () => {
        setTimeout(() => injectUserShortcutIntoIframe(iframe), 50);
      });
      injectUserShortcutIntoIframe(iframe);
    };

    document.querySelectorAll('iframe').forEach(waitForIframeReady);

    if (typeof gemDomWatchSubscribe === 'function') {
      gemDomWatchSubscribe((mutations) => {
        mutations.forEach((m) => {
          m.addedNodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
            if (node.tagName === 'IFRAME') waitForIframeReady(node);
            else if (node.querySelectorAll) node.querySelectorAll('iframe').forEach(waitForIframeReady);
          });
        });
      });
    }
  }

  function initUserShortcutDispatch() {
    bindUserShortcutToDoc(document);
    if (window !== document) {
      try {
        bindUserShortcutToDoc(window);
      } catch (_) {}
    }
    bindIframeShortcutWatcher();
  }

  function notifyUserShortcutSettingsChanged() {
    try {
      window.dispatchEvent(
        new CustomEvent('gem-user-shortcuts-changed', {
          detail: {
            bindings: cachedBindings.slice(),
          },
        })
      );
    } catch (_) {}
  }

  window.GEM_USER_CREATED_SHORTCUTS_STORAGE_KEY = STORAGE_KEY;
  window.GEM_USER_SHORTCUT_DEFAULT_PRESET_ID = DEFAULT_PRESET_ID;
  window.gemGetUserShortcutModifierPresets = getUserShortcutModifierPresets;
  window.gemGetUserShortcutKeyOptions = getUserShortcutKeyOptions;
  window.gemGetUserShortcutModifierLabel = getUserShortcutModifierLabel;
  window.gemFormatUserShortcutCombo = formatUserShortcutCombo;
  window.gemLoadUserCreatedShortcuts = loadUserCreatedShortcuts;
  window.gemLoadUserShortcutSettings = loadUserShortcutSettings;
  window.gemSaveUserCreatedShortcuts = saveUserCreatedShortcuts;
  window.gemIsUserShortcutChord = isUserShortcutChord;
  window.gemGetUserShortcutComboByCommandId = getUserShortcutComboByCommandId;
  window.gemGetUserShortcutCombosByCommandId = getUserShortcutCombosByCommandId;
  window.gemGetUserShortcutBindingsMap = getUserShortcutBindingsMap;
  window.gemNormalizeUserShortcutPresetId = normalizePresetId;
  window.gemGenerateUserShortcutBindingId = generateBindingId;

  loadUserShortcutSettings(() => {
    initUserShortcutDispatch();
    notifyUserShortcutSettingsChanged();
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[STORAGE_KEY]) return;
      cachedBindings = normalizeBindings(changes[STORAGE_KEY].newValue);
      notifyUserShortcutSettingsChanged();
    });
  }
})();
