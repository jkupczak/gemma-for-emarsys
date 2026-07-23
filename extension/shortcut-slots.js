console.log('[Gem] shortcut-slots.js loaded');

// Shared storage + assignment logic for manually-assigned quick-insert shortcuts (1-9).
// Slot 0 is reserved for "most recently used" and is intentionally NOT managed here
// (see snippet-context-menu.js), since it is automatic rather than user-assigned.
//
// Used by: snippet-context-menu.js (assign from a token row + insert via keyboard),
// snippets-tab.js (assign from the snippet edit dialogs), and settings-panel.js
// (centralized overview + clear).
(function () {
  'use strict';

  if (window.gemAssignShortcutSlot) return;

  const STORAGE_KEY = 'gemManualShortcutSlots';
  const MIN_SLOT = 1;
  const MAX_SLOT = 9;

  function isValidSlot(slot) {
    const n = Number(slot);
    return Number.isInteger(n) && n >= MIN_SLOT && n <= MAX_SLOT;
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const key = String(entry.key || '').trim();
    if (!key) return null;
    return {
      key,
      name: String(entry.name || '').trim() || key,
      kind: entry.kind === 'personalization' ? 'personalization' : 'gemma',
    };
  }

  function normalizeSlotMap(raw) {
    const map = {};
    if (!raw || typeof raw !== 'object') return map;
    for (let slot = MIN_SLOT; slot <= MAX_SLOT; slot++) {
      const normalized = normalizeEntry(raw[String(slot)]);
      if (normalized) map[String(slot)] = normalized;
    }
    return map;
  }

  function loadShortcutSlots(callback) {
    if (!chrome?.storage?.sync) {
      callback({});
      return;
    }
    chrome.storage.sync.get({ [STORAGE_KEY]: {} }, (res) => {
      callback(normalizeSlotMap(res[STORAGE_KEY]));
    });
  }

  function saveShortcutSlots(map, callback) {
    if (!chrome?.storage?.sync) {
      if (callback) callback();
      return;
    }
    chrome.storage.sync.set({ [STORAGE_KEY]: normalizeSlotMap(map) }, () => {
      if (callback) callback();
    });
  }

  // Assigns `entry` ({ key, name, kind }) to `slot` (1-9). If `entry.key` already
  // occupies a different slot, it is moved (removed from the old slot). If `slot`
  // was already occupied by a different key, that entry is displaced (unassigned).
  // callback receives { ok, slot, displaced, previousSlot, map }.
  function assignShortcutSlot(slot, entry, callback) {
    if (!isValidSlot(slot)) {
      if (callback) callback({ ok: false, reason: 'invalid-slot' });
      return;
    }
    const normalized = normalizeEntry(entry);
    if (!normalized) {
      if (callback) callback({ ok: false, reason: 'invalid-entry' });
      return;
    }
    const slotStr = String(Number(slot));

    loadShortcutSlots((map) => {
      const displaced =
        map[slotStr] && map[slotStr].key !== normalized.key ? map[slotStr] : null;
      let previousSlot = null;
      Object.keys(map).forEach((s) => {
        if (s !== slotStr && map[s] && map[s].key === normalized.key) {
          previousSlot = Number(s);
          delete map[s];
        }
      });
      map[slotStr] = normalized;
      saveShortcutSlots(map, () => {
        if (callback) {
          callback({ ok: true, slot: Number(slotStr), displaced, previousSlot, map });
        }
      });
    });
  }

  function unassignShortcutSlot(slot, callback) {
    if (!isValidSlot(slot)) {
      if (callback) callback({ ok: false, reason: 'invalid-slot' });
      return;
    }
    const slotStr = String(Number(slot));
    loadShortcutSlots((map) => {
      const removed = map[slotStr] || null;
      if (!removed) {
        if (callback) callback({ ok: true, removed: null, map });
        return;
      }
      delete map[slotStr];
      saveShortcutSlots(map, () => {
        if (callback) callback({ ok: true, removed, map });
      });
    });
  }

  // Removes `key` from whichever slot (if any) it currently occupies.
  function unassignShortcutSlotByKey(key, callback) {
    const k = String(key || '').trim();
    if (!k) {
      if (callback) callback({ ok: false, reason: 'invalid-key' });
      return;
    }
    loadShortcutSlots((map) => {
      let removedSlot = null;
      Object.keys(map).forEach((s) => {
        if (map[s] && map[s].key === k) {
          removedSlot = Number(s);
          delete map[s];
        }
      });
      if (removedSlot === null) {
        if (callback) callback({ ok: true, removedSlot: null, map });
        return;
      }
      saveShortcutSlots(map, () => {
        if (callback) callback({ ok: true, removedSlot, map });
      });
    });
  }

  // Given an already-loaded slot map, returns the slot number (1-9) that `key`
  // occupies, or 0 if unassigned.
  function getShortcutSlotForKey(map, key) {
    const k = String(key || '').trim();
    if (!k || !map) return 0;
    for (let slot = MIN_SLOT; slot <= MAX_SLOT; slot++) {
      const entry = map[String(slot)];
      if (entry && entry.key === k) return slot;
    }
    return 0;
  }

  window.gemLoadShortcutSlots = loadShortcutSlots;
  window.gemAssignShortcutSlot = assignShortcutSlot;
  window.gemUnassignShortcutSlot = unassignShortcutSlot;
  window.gemUnassignShortcutSlotByKey = unassignShortcutSlotByKey;
  window.gemGetShortcutSlotForKey = getShortcutSlotForKey;
  window.GEM_SHORTCUT_SLOTS_MIN = MIN_SLOT;
  window.GEM_SHORTCUT_SLOTS_MAX = MAX_SLOT;
  window.GEM_SHORTCUT_SLOTS_STORAGE_KEY = STORAGE_KEY;
})();
