console.log('[Gem] command-palette.js loaded');

(function () {
  'use strict';

  const PALETTE_ID = 'gem-command-palette';
  const PINNED_STORAGE_KEY = 'gemCommandPalettePinned';
  const RECENT_STORAGE_KEY = 'gemRecentCampaigns';
  const OTHER_RECENT_STORAGE_KEY = 'gemOtherRecentCampaigns';
  const CAMPAIGN_ROUTE = 'contentBlocks/campaign';

  const PIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f" aria-hidden="true"><path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z"/></svg>';

  const CAMPAIGN_OVERFLOW_DEFS = [
    { id: 'campaign:email-settings', label: 'Email Settings', sectionId: 'campaign-campaign', sectionTitle: 'Campaign Navigation' },
    { id: 'campaign:campaign-check', label: 'Campaign Check', sectionId: 'campaign-campaign', sectionTitle: 'Campaign Navigation' },
    { id: 'campaign:scheduling', label: 'Scheduling', sectionId: 'campaign-campaign', sectionTitle: 'Campaign Navigation' },
    { id: 'campaign:duplicate', label: 'Duplicate', sectionId: 'campaign-campaign', sectionTitle: 'Campaign Navigation' },
    { id: 'campaign:live-editor', label: 'Live Editor', sectionId: 'campaign-views', sectionTitle: 'Campaign Views' },
    { id: 'campaign:inbox-preview', label: 'Inbox Preview', sectionId: 'campaign-views', sectionTitle: 'Campaign Views' },
    { id: 'campaign:contact-preview', label: 'Contact Preview', sectionId: 'campaign-views', sectionTitle: 'Campaign Views' },
    { id: 'campaign:review-links', label: 'Review Links', sectionId: 'campaign-views', sectionTitle: 'Campaign Views' },
    { id: 'campaign:review-scripts', label: 'Review Scripts', sectionId: 'campaign-views', sectionTitle: 'Campaign Views' },
    { id: 'campaign:compare-previews', label: 'Compare Previews', sectionId: 'campaign-views', sectionTitle: 'Campaign Views' },
    { id: 'campaign:standard-layout', label: 'Standard Layout', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:focus-layout', label: 'Focus Layout', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:mobile-sidepanel', label: 'Mobile Sidepanel', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:highlight-links', label: 'Highlight Links', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:highlight-alt-text', label: 'Highlight ALT Text', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:highlight-targeting', label: 'Highlight Targeting', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:highlight-editables', label: 'Highlight Editables', sectionId: 'campaign-editor', sectionTitle: 'Campaign Editor' },
    { id: 'campaign:send-a-test', label: 'Send a Test', sectionId: 'campaign-collaborate', sectionTitle: 'Collaborate' },
    { id: 'campaign:share-link', label: 'Share Campaign Link', sectionId: 'campaign-collaborate', sectionTitle: 'Collaborate' },
    { id: 'campaign:share-screenshot', label: 'Share Campaign Screenshot', sectionId: 'campaign-collaborate', sectionTitle: 'Collaborate' },
  ];

  const GEMMA_FUNCTION_DEFS = [
    { id: 'gemma:notes', label: 'Gemma Notes', sectionId: 'gemma-functions', sectionTitle: 'Gemma Functions' },
    { id: 'gemma:recent-campaigns', label: 'Gemma Recent Campaigns', sectionId: 'gemma-functions', sectionTitle: 'Gemma Functions' },
    { id: 'gemma:settings', label: 'Gemma Settings', sectionId: 'gemma-functions', sectionTitle: 'Gemma Functions' },
  ];

  const PANEL_TABS = [
    { tabId: 'emailBasicsTab', label: 'Email Basics' },
    { tabId: 'blocksTab', label: 'Blocks' },
    { tabId: 'linksTab', label: 'Links' },
    { tabId: 'latestMediaTab', label: 'Recent Media' },
    { tabId: 'variablesEditorTab', label: 'Style Settings' },
    { tabId: 'versionsTab', label: 'Versions' },
    { tabId: 'localesTab', label: 'Languages' },
    { tabId: 'customTab_personaliztation', label: 'Personalization' },
    { tabId: 'gem-snippets-tab', label: 'Gemma Snippets' },
    { tabId: 'gem-find-replace-tab', label: 'Gemma Find and Replace' },
    { tabId: 'gem-magic-fill-tab', label: 'Gemma Magic Fill' },
    { tabId: 'gem-preflight-tab', label: 'Gemma Preflight' },
  ];

  let paletteEl = null;
  let paletteOpen = false;
  let escapeUnsub = null;
  let pinnedIds = [];
  const searchByPageUrl = new Map();
  let allCommands = [];
  let renderedCommands = [];
  let openTabsByCampaignId = {};
  let openCampaignUrlTabs = {};
  let recentCampaignItems = [];
  let recentCampaignPinnedKeys = new Set();
  let otherRecentItems = [];
  let lastRenderedHtml = '';
  let refreshRenderScheduled = false;
  let openTabsFingerprint = '';

  function isCampaignPage() {
    try {
      const url = new URL(window.location.href);
      if (!(url.pathname || '').includes('bootstrap.php')) return false;
      return (url.searchParams.get('r') || '').trim() === CAMPAIGN_ROUTE;
    } catch (_) {
      return false;
    }
  }

  function getPageSearchKey() {
    try {
      const url = new URL(window.location.href);
      url.hash = '';
      return url.href;
    } catch (_) {
      return window.location.href.split('#')[0];
    }
  }

  function getCurrentCampaignId() {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get('id') || url.searchParams.get('camp_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeSearchText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function commandMatchesQuery(cmd, query) {
    if (!query) return true;
    const hay = normalizeSearchText(cmd.label);
    const terms = query.split(/\s+/).filter(Boolean);
    return terms.every((term) => hay.includes(term));
  }

  function loadPinnedIds(callback) {
    if (!chrome?.storage?.sync) {
      pinnedIds = [];
      if (callback) callback(pinnedIds);
      return;
    }
    chrome.storage.sync.get({ [PINNED_STORAGE_KEY]: [] }, (res) => {
      const raw = res[PINNED_STORAGE_KEY];
      pinnedIds = Array.isArray(raw)
        ? raw.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (callback) callback(pinnedIds);
    });
  }

  function savePinnedIds() {
    if (!chrome?.storage?.sync) return;
    chrome.storage.sync.set({ [PINNED_STORAGE_KEY]: pinnedIds });
  }

  function loadRecentCampaignCaches(callback) {
    if (!chrome?.storage?.local) {
      recentCampaignItems = [];
      recentCampaignPinnedKeys = new Set();
      otherRecentItems = [];
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(
      {
        [RECENT_STORAGE_KEY]: { version: 1, items: [] },
        [OTHER_RECENT_STORAGE_KEY]: { version: 1, items: [] },
      },
      (res) => {
        const recentRaw = res[RECENT_STORAGE_KEY];
        recentCampaignItems = Array.isArray(recentRaw?.items) ? recentRaw.items : [];
        recentCampaignPinnedKeys = new Set(
          (Array.isArray(recentRaw?.pinnedKeys) ? recentRaw.pinnedKeys : [])
            .map((key) => String(key || '').trim())
            .filter(Boolean)
        );
        const otherRaw = res[OTHER_RECENT_STORAGE_KEY];
        otherRecentItems = Array.isArray(otherRaw?.items) ? otherRaw.items : [];
        if (callback) callback();
      }
    );
  }

  function computeOpenTabsFingerprint(byCampaignId, openCampaignUrls) {
    return JSON.stringify({ byCampaignId: byCampaignId || {}, openCampaignUrls: openCampaignUrls || {} });
  }

  function fetchOpenCampaignTabs(callback) {
    if (!chrome?.runtime?.sendMessage) {
      openTabsByCampaignId = {};
      openCampaignUrlTabs = {};
      openTabsFingerprint = computeOpenTabsFingerprint(openTabsByCampaignId, openCampaignUrlTabs);
      if (callback) callback(false);
      return;
    }
    chrome.runtime.sendMessage({ action: 'getOpenCampaignTabs' }, (res) => {
      const nextByCampaignId =
        res && res.ok && res.byCampaignId && typeof res.byCampaignId === 'object'
          ? res.byCampaignId
          : {};
      const nextOpenCampaignUrls =
        res && res.ok && res.openCampaignUrls && typeof res.openCampaignUrls === 'object'
          ? res.openCampaignUrls
          : {};
      const nextFingerprint = computeOpenTabsFingerprint(nextByCampaignId, nextOpenCampaignUrls);
      const changed = nextFingerprint !== openTabsFingerprint;
      openTabsByCampaignId = nextByCampaignId;
      openCampaignUrlTabs = nextOpenCampaignUrls;
      openTabsFingerprint = nextFingerprint;
      if (callback) callback(changed);
    });
  }

  function isCampaignOpenInAnotherTab(item) {
    const id = String(item?.id || '').trim();
    const urlBase = String(item?.urlBase || '').trim();
    const currentId = getCurrentCampaignId();
    if (id && id === currentId) return false;
    if (id && openTabsByCampaignId[id] != null) return true;
    if (urlBase && openCampaignUrlTabs[urlBase] != null) return true;
    return false;
  }

  function isRecentCampaignPinned(item) {
    const urlBase = String(item?.urlBase || '').trim();
    return urlBase && recentCampaignPinnedKeys.has(urlBase);
  }

  function resolveCampaignTitle(campaignId) {
    const id = String(campaignId || '').trim();
    if (!id) return 'Untitled campaign';
    const fromRecent = recentCampaignItems.find((item) => String(item.id || '').trim() === id);
    if (fromRecent && fromRecent.title) return String(fromRecent.title).trim();
    const fromOther = otherRecentItems.find((item) => String(item.id || '').trim() === id);
    if (fromOther && fromOther.title) return String(fromOther.title).trim();
    return `Campaign ${id}`;
  }

  function resolveCampaignUrlBase(campaignId) {
    const id = String(campaignId || '').trim();
    const fromRecent = recentCampaignItems.find((item) => String(item.id || '').trim() === id);
    if (fromRecent && fromRecent.urlBase) return String(fromRecent.urlBase).trim();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('r', CAMPAIGN_ROUTE);
      url.searchParams.set('id', id);
      url.hash = '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function withCurrentSessionId(href) {
    try {
      const current = new URL(window.location.href);
      const sessionId = (current.searchParams.get('session_id') || '').trim();
      if (!sessionId) return href;
      const target = new URL(href, window.location.origin);
      if (!target.searchParams.get('session_id')) {
        target.searchParams.set('session_id', sessionId);
      }
      return target.href;
    } catch (_) {
      return href;
    }
  }

  function focusOrOpenCampaign(campaignId, targetUrl) {
    if (!chrome?.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({
      action: 'focusOrOpenCampaignTab',
      campaignId: String(campaignId || '').trim(),
      targetUrl: withCurrentSessionId(targetUrl || resolveCampaignUrlBase(campaignId)),
    });
  }

  function activateVerticalNavTab(tabId) {
    const tab = document.querySelector(`#${tabId}`);
    if (!tab) return false;
    const navItem = tab.querySelector('e-verticalnav-item');
    if (navItem) {
      navItem.click();
      return true;
    }
    return false;
  }

  function makeCommand({ id, sectionId, sectionTitle, label, run, pinnable = true }) {
    return { id, sectionId, sectionTitle, label, run, pinnable };
  }

  function buildCampaignOverflowCommands() {
    if (!isCampaignPage()) return [];

    const inboxActive =
      typeof window.gemIsInboxPreviewActive === 'function'
        ? window.gemIsInboxPreviewActive()
        : !!(document.querySelector('cb-campaign-inbox-preview') && !document.querySelector('cb-campaign-inbox-preview').hasAttribute('hidden'));
    const liveActive = !inboxActive;
    const focusActive = document.documentElement.classList.contains('gem-focus-layout');
    const standardActive = !focusActive;

    const defs = CAMPAIGN_OVERFLOW_DEFS.map((def) => {
      if (def.id === 'campaign:live-editor') return { ...def, exclude: liveActive };
      if (def.id === 'campaign:inbox-preview') return { ...def, exclude: inboxActive };
      if (def.id === 'campaign:compare-previews') {
        return {
          ...def,
          exclude: !(typeof window.gemCanComparePreviews === 'function' && window.gemCanComparePreviews()),
        };
      }
      if (def.id === 'campaign:standard-layout') return { ...def, exclude: standardActive };
      if (def.id === 'campaign:focus-layout') return { ...def, exclude: focusActive };
      return def;
    });

    return defs
      .filter((def) => !def.exclude)
      .map((def) =>
        makeCommand({
          id: def.id,
          sectionId: def.sectionId,
          sectionTitle: def.sectionTitle,
          label: def.label,
          run: () => {
            if (typeof window.gemRunCampaignMenuCommand === 'function') {
              window.gemRunCampaignMenuCommand(def.id);
            }
          },
        })
      );
  }

  function buildLanguageCommands() {
    if (!isCampaignPage()) return [];
    if (typeof window.gemGetCampaignLanguages !== 'function') return [];
    const languages = window.gemGetCampaignLanguages();
    if (!Array.isArray(languages) || languages.length <= 1) return [];

    const current =
      typeof window.gemGetSelectedLanguageValue === 'function'
        ? String(window.gemGetSelectedLanguageValue() || '').trim()
        : '';

    return languages
      .filter((lang) => lang.value && lang.value !== current)
      .map((lang) =>
        makeCommand({
          id: `language:${lang.value}`,
          sectionId: 'languages',
          sectionTitle: 'Languages',
          label: lang.label || lang.value,
          run: () => {
            if (typeof window.gemSelectLanguageByValue === 'function') {
              void window.gemSelectLanguageByValue(lang.value);
            }
          },
        })
      );
  }

  function buildVersionCommands() {
    if (!isCampaignPage()) return [];
    if (typeof window.gemGetCampaignVersions !== 'function') return [];
    const versions = window.gemGetCampaignVersions();
    if (!Array.isArray(versions) || versions.length <= 1) return [];

    const currentId = getCurrentCampaignId();
    return versions
      .filter((entry) => entry.id && entry.id !== currentId)
      .map((entry) =>
        makeCommand({
          id: `version:${entry.id}`,
          sectionId: 'versions',
          sectionTitle: 'Versions',
          label: entry.label || entry.id,
          run: () => {
            if (typeof window.gemSwitchCampaignVersion === 'function') {
              window.gemSwitchCampaignVersion(entry.id);
            }
          },
        })
      );
  }

  function buildPanelCommands() {
    if (!isCampaignPage()) return [];
    return PANEL_TABS.map((tab) =>
      makeCommand({
        id: `panel:${tab.tabId}`,
        sectionId: 'panels',
        sectionTitle: 'Campaign Panels',
        label: tab.label,
        run: () => {
          activateVerticalNavTab(tab.tabId);
        },
      })
    );
  }

  function buildCampaignPageOpenCommands() {
    if (!isCampaignPage()) return [];

    const currentId = getCurrentCampaignId();
    const itemsById = new Map();

    recentCampaignItems.forEach((item) => {
      if (!isCampaignOpenInAnotherTab(item)) return;
      const id = String(item.id || '').trim();
      if (!id) return;
      itemsById.set(id, item);
    });

    Object.keys(openTabsByCampaignId || {}).forEach((campaignId) => {
      const id = String(campaignId || '').trim();
      if (!id || id === currentId || itemsById.has(id)) return;
      itemsById.set(id, {
        id,
        title: resolveCampaignTitle(id),
        urlBase: resolveCampaignUrlBase(id),
        lastViewedAt: 0,
      });
    });

    const sorted = Array.from(itemsById.values()).sort((a, b) => {
      const aPinned = isRecentCampaignPinned(a);
      const bPinned = isRecentCampaignPinned(b);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return (b.lastViewedAt || 0) - (a.lastViewedAt || 0);
    });

    return sorted.map((item) =>
      makeCommand({
        id: `open-campaign:${item.id}`,
        sectionId: 'campaign-open-campaigns',
        sectionTitle: 'Open Campaigns',
        label: String(item.title || resolveCampaignTitle(item.id)).trim(),
        run: () => {
          focusOrOpenCampaign(item.id, item.urlBase || resolveCampaignUrlBase(item.id));
        },
      })
    );
  }

  function buildOpenCampaignCommands() {
    const currentId = getCurrentCampaignId();
    const ids = Object.keys(openTabsByCampaignId || {}).filter((id) => id && id !== currentId);
    return ids.map((campaignId) =>
      makeCommand({
        id: `open-campaign:${campaignId}`,
        sectionId: 'open-campaigns',
        sectionTitle: 'Open campaigns',
        label: resolveCampaignTitle(campaignId),
        run: () => {
          focusOrOpenCampaign(campaignId, resolveCampaignUrlBase(campaignId));
        },
      })
    );
  }

  function buildGemmaFunctionCommands() {
    return GEMMA_FUNCTION_DEFS.map((def) =>
      makeCommand({
        id: def.id,
        sectionId: def.sectionId,
        sectionTitle: def.sectionTitle,
        label: def.label,
        run: () => {
          if (def.id === 'gemma:notes' && typeof window.gemToggleNotesPanel === 'function') {
            window.gemToggleNotesPanel();
          } else if (
            def.id === 'gemma:recent-campaigns' &&
            typeof window.gemToggleRecentCampaignsPanel === 'function'
          ) {
            window.gemToggleRecentCampaignsPanel();
          } else if (def.id === 'gemma:settings' && typeof window.openGemmaSettings === 'function') {
            window.openGemmaSettings();
          }
        },
      })
    );
  }

  function getAssignablePaletteCommands() {
    const panelDefs = PANEL_TABS.map((tab) => ({
      id: `panel:${tab.tabId}`,
      label: tab.label,
      sectionId: 'panels',
      sectionTitle: 'Campaign Panels',
    }));
    return [...CAMPAIGN_OVERFLOW_DEFS, ...panelDefs, ...GEMMA_FUNCTION_DEFS].map((def) => ({
      id: def.id,
      label: def.label,
      sectionId: def.sectionId,
      sectionTitle: def.sectionTitle,
    }));
  }

  function gemIsPaletteCommandAvailableOnPage(commandId) {
    const id = String(commandId || '').trim();
    if (!id) return false;
    const commands = buildAllCommands();
    return commands.some((entry) => entry.id === id);
  }

  function gemRunPaletteCommandById(commandId) {
    const id = String(commandId || '').trim();
    if (!id) return false;
    const commands = buildAllCommands();
    const cmd = commands.find((entry) => entry.id === id);
    if (!cmd || typeof cmd.run !== 'function') return false;
    try {
      cmd.run();
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildEmarsysNavCommands() {
    const commands = [];
    let links =
      typeof window.gemNavMenu?.collectEmarsysNavLinks === "function"
        ? window.gemNavMenu.collectEmarsysNavLinks()
        : [];

    if (!links.length) {
      // Fallback: legacy menu only (utils not loaded yet / nav not ready).
      links = [];
      document.querySelectorAll('.e-navigation__menu_list > li').forEach((li) => {
        const titleEl = li.querySelector('.e-navigation__action_text');
        const sectionTitle = titleEl ? String(titleEl.textContent || '').trim() : '';
        if (!sectionTitle) return;
        li.querySelectorAll('.e-navigation__submenu a.e-navigation__submenu_action').forEach((link) => {
          const label = String(link.textContent || '').replace(/\s+/g, ' ').trim();
          const href = String(link.getAttribute('href') || link.href || '').trim();
          if (!label || !href || /^javascript:/i.test(href)) return;
          links.push({ sectionTitle, label, href });
        });
      });
    }

    links.forEach(({ sectionTitle, label, href }) => {
      let absoluteUrl = href;
      try {
        absoluteUrl = new URL(href, window.location.origin).href;
      } catch (_) {
        return;
      }
      const sectionId = `emarsys-nav-${slugify(sectionTitle)}`;
      commands.push(
        makeCommand({
          id: `nav:${absoluteUrl}`,
          sectionId,
          sectionTitle,
          label,
          run: () => {
            window.location.assign(absoluteUrl);
          },
        })
      );
    });
    return commands;
  }

  function buildRecentCampaignSearchCommands(query) {
    if (!query) return [];
    const seen = new Set();
    const results = [];

    const consider = (item, label) => {
      const id = String(item?.id || '').trim();
      const title = String(label || item?.title || '').trim();
      if (!id || !title || seen.has(id)) return;
      if (!commandMatchesQuery({ label: title }, query)) return;
      seen.add(id);
      results.push(
        makeCommand({
          id: `recent-search:${id}`,
          sectionId: 'recent-campaigns-search',
          sectionTitle: 'Recent Campaigns',
          label: title,
          pinnable: false,
          run: () => {
            const urlBase = item.urlBase ? String(item.urlBase).trim() : resolveCampaignUrlBase(id);
            focusOrOpenCampaign(id, urlBase);
          },
        })
      );
    };

    recentCampaignItems.forEach((item) => consider(item, item.title));
    otherRecentItems.forEach((item) => consider(item, item.title));
    return results;
  }

  function buildAllCommands() {
    const commands = [
      ...buildCampaignOverflowCommands(),
      ...buildLanguageCommands(),
      ...buildVersionCommands(),
      ...buildCampaignPageOpenCommands(),
      ...buildPanelCommands(),
      ...(isCampaignPage() ? [] : buildOpenCampaignCommands()),
      ...buildGemmaFunctionCommands(),
      ...buildEmarsysNavCommands(),
    ];
    allCommands = commands;
    return commands;
  }

  function getCommandById(id) {
    return renderedCommands.find((cmd) => cmd.id === id) || allCommands.find((cmd) => cmd.id === id) || null;
  }

  function buildPinnedCommands(commands) {
    const byId = new Map(commands.map((cmd) => [cmd.id, cmd]));
    return pinnedIds.map((id) => byId.get(id)).filter(Boolean);
  }

  function groupCommands(commands, options = {}) {
    const searchMode = !!options.searchMode;
    const query = normalizeSearchText(options.query || '');
    const groups = new Map();

    const addToGroup = (cmd) => {
      if (!groups.has(cmd.sectionId)) {
        groups.set(cmd.sectionId, { sectionId: cmd.sectionId, sectionTitle: cmd.sectionTitle, commands: [] });
      }
      groups.get(cmd.sectionId).commands.push(cmd);
    };

    if (searchMode && query) {
      commands.filter((cmd) => commandMatchesQuery(cmd, query)).forEach(addToGroup);
      buildRecentCampaignSearchCommands(query).forEach(addToGroup);
    } else {
      const pinned = buildPinnedCommands(commands);
      if (pinned.length) {
        groups.set('pinned', {
          sectionId: 'pinned',
          sectionTitle: 'Pinned Commands',
          commands: pinned,
        });
      }
      commands.forEach(addToGroup);
    }

    return Array.from(groups.values());
  }

  function getCommandRowLabelHtml(cmd, groupSectionId) {
    const label = String(cmd.label || '').trim();
    const sectionTitle = String(cmd.sectionTitle || '').trim();
    if (groupSectionId === 'pinned' && sectionTitle) {
      return `<span class="gem-command-palette__row-label-prefix">${escapeHtml(sectionTitle)} / </span>${escapeHtml(label)}`;
    }
    return escapeHtml(label);
  }

  const USER_SHORTCUT_DISPLAY_LIMIT = 2;

  function getCommandShortcutHtml(commandId) {
    const combos =
      typeof window.gemGetUserShortcutCombosByCommandId === 'function'
        ? window.gemGetUserShortcutCombosByCommandId(commandId)
        : [];
    if (!combos.length) return '';
    const visible = combos.slice(0, USER_SHORTCUT_DISPLAY_LIMIT);
    const overflowCount = combos.length - visible.length;
    const badges = visible
      .map((combo) => `<kbd class="gem-command-palette__row-shortcut">${escapeHtml(combo)}</kbd>`)
      .join('');
    const overflowBadge =
      overflowCount > 0
        ? `<span class="gem-command-palette__row-shortcut-overflow" title="${escapeHtml(combos.join(', '))}">+${overflowCount}</span>`
        : '';
    return `<span class="gem-command-palette__row-shortcuts">${badges}${overflowBadge}</span>`;
  }

  function renderCommandList() {
    if (!paletteEl) return;
    const listEl = paletteEl.querySelector('.gem-command-palette__list');
    const searchInput = paletteEl.querySelector('.gem-command-palette__search');
    const query = normalizeSearchText(searchInput ? searchInput.value : '');
    const searchMode = !!query;

    const groups = groupCommands(allCommands, { searchMode, query });
    renderedCommands = [];
    groups.forEach((group) => {
      renderedCommands.push(...group.commands);
    });

    if (!groups.length) {
      const emptyHtml = `<div class="gem-command-palette__empty">${searchMode ? 'No matching commands.' : 'No commands available.'}</div>`;
      if (emptyHtml === lastRenderedHtml) return;
      lastRenderedHtml = emptyHtml;
      listEl.innerHTML = emptyHtml;
      return;
    }

    let html = '';
    groups.forEach((group) => {
      html += `
        <section class="gem-command-palette__section" data-section-id="${escapeHtml(group.sectionId)}">
          <div class="gem-command-palette__section-header">
            <span class="gem-command-palette__section-header-label">${escapeHtml(group.sectionTitle)}</span>
          </div>
          <div class="gem-command-palette__rows">
            ${group.commands
              .map((cmd) => {
                const pinned = pinnedIds.includes(cmd.id);
                const pinClass = pinned ? ' gem-command-palette__pin--active' : '';
                const pinBtn =
                  cmd.pinnable === false
                    ? ''
                    : `<button type="button" class="gem-command-palette__pin${pinClass}" data-action="pin" data-command-id="${escapeHtml(cmd.id)}" aria-label="${pinned ? 'Unpin command' : 'Pin command'}">${PIN_SVG}</button>`;
                return `
                  <div class="gem-command-palette__row" data-command-id="${escapeHtml(cmd.id)}">
                    <button type="button" class="gem-command-palette__row-btn" data-action="run">
                      <span class="gem-command-palette__row-label">${getCommandRowLabelHtml(cmd, group.sectionId)}</span>
                      ${getCommandShortcutHtml(cmd.id)}
                    </button>
                    ${pinBtn}
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>
      `;
    });

    if (html === lastRenderedHtml) return;
    lastRenderedHtml = html;
    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-action="run"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const row = e.currentTarget.closest('.gem-command-palette__row');
        const commandId = row && row.getAttribute('data-command-id');
        const cmd = getCommandById(commandId);
        if (!cmd) return;
        closePalette();
        try {
          cmd.run();
        } catch (err) {
          console.error('[Gem] Command palette run failed:', err);
        }
      });
    });

    listEl.querySelectorAll('[data-action="pin"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commandId = btn.getAttribute('data-command-id');
        if (!commandId) return;
        togglePin(commandId);
      });
    });
  }

  function togglePin(commandId) {
    const id = String(commandId || '').trim();
    if (!id) return;
    if (pinnedIds.includes(id)) {
      pinnedIds = pinnedIds.filter((x) => x !== id);
    } else {
      pinnedIds = [id, ...pinnedIds.filter((x) => x !== id)];
    }
    savePinnedIds();
    renderCommandList();
  }

  function ensurePalette() {
    if (paletteEl) return paletteEl;

    paletteEl = document.createElement('div');
    paletteEl.id = PALETTE_ID;
    paletteEl.className = 'gem-welcome-modal gem-layer-modal';
    paletteEl.innerHTML = `
      <div class="gem-welcome-modal__panel gem-command-palette__panel" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="gem-command-palette__search-wrap">
          <input type="search" class="gem-command-palette__search" placeholder="Search commands…" autocomplete="off" spellcheck="false" />
        </div>
        <div class="gem-command-palette__list gem-scrollable"></div>
      </div>
    `;

    paletteEl.addEventListener('click', (e) => {
      if (e.target === paletteEl) closePalette();
    });

    const searchInput = paletteEl.querySelector('.gem-command-palette__search');
    searchInput.addEventListener('input', () => {
      searchByPageUrl.set(getPageSearchKey(), searchInput.value);
      renderCommandList();
    });

    document.body.appendChild(paletteEl);
    return paletteEl;
  }

  function closePalette() {
    if (!paletteEl || !paletteOpen) return;
    paletteOpen = false;
    lastRenderedHtml = '';
    refreshRenderScheduled = false;
    if (escapeUnsub) {
      escapeUnsub();
      escapeUnsub = null;
    }
    if (typeof window.gemLayerRelease === 'function') {
      window.gemLayerRelease(paletteEl);
    }
    paletteEl.remove();
    paletteEl = null;
  }

  function openPalette() {
    ensurePalette();
    paletteOpen = true;

    const searchInput = paletteEl.querySelector('.gem-command-palette__search');
    const savedQuery = searchByPageUrl.get(getPageSearchKey()) || '';
    searchInput.value = savedQuery;

    const finishOpen = () => {
      buildAllCommands();
      renderCommandList();

      if (typeof window.gemLayerRaise === 'function') {
        window.gemLayerRaise(paletteEl, { tier: 'modal' });
      }

      if (typeof window.gemLayerBindEscape === 'function') {
        escapeUnsub = window.gemLayerBindEscape(closePalette, {
          whileConnected: () => paletteOpen,
        });
      }

      requestAnimationFrame(() => {
        searchInput.focus();
        searchInput.select();
      });
    };

    fetchOpenCampaignTabs(() => {
      loadRecentCampaignCaches(finishOpen);
    });
  }

  function togglePalette() {
    if (paletteOpen) closePalette();
    else openPalette();
  }

  function refreshAndRenderIfOpen() {
    if (!paletteOpen || refreshRenderScheduled) return;
    refreshRenderScheduled = true;
    requestAnimationFrame(() => {
      refreshRenderScheduled = false;
      if (!paletteOpen) return;
      buildAllCommands();
      renderCommandList();
    });
  }

  function isPaletteShortcut(event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
    const key = event.key;
    if (key === 'p' || key === 'P') return true;
    return event.shiftKey && (event.code === 'KeyP' || key === 'P');
  }

  function onPaletteKeyDown(event) {
    if (!isPaletteShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    togglePalette();
  }

  function bindPaletteShortcutToDoc(doc) {
    if (!doc || doc._gemCommandPaletteShortcutHandler) return;
    doc.addEventListener('keydown', onPaletteKeyDown, true);
    doc._gemCommandPaletteShortcutHandler = true;
  }

  function injectPaletteShortcutIntoIframe(iframe) {
    try {
      if (
        typeof window.gemIsGemStrippedEmbedIframe === 'function' &&
        window.gemIsGemStrippedEmbedIframe(iframe)
      ) {
        return;
      }
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;
      bindPaletteShortcutToDoc(iframeDoc);
    } catch (_) {}
  }

  function bindIframeShortcutWatcher() {
    const waitForIframeReady = (iframe) => {
      if (!iframe || iframe._gemCommandPaletteIframeLoadBound) return;
      iframe._gemCommandPaletteIframeLoadBound = true;
      iframe.addEventListener('load', () => {
        setTimeout(() => injectPaletteShortcutIntoIframe(iframe), 50);
      });
      injectPaletteShortcutIntoIframe(iframe);
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

  function init() {
    loadPinnedIds();
    loadRecentCampaignCaches();
    fetchOpenCampaignTabs();

    bindPaletteShortcutToDoc(document);
    bindIframeShortcutWatcher();

    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === 'recentCampaignOpenTabsUpdated') {
          fetchOpenCampaignTabs((changed) => {
            if (changed) refreshAndRenderIfOpen();
          });
        }
      });
    }

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[PINNED_STORAGE_KEY]) {
          const raw = changes[PINNED_STORAGE_KEY].newValue;
          pinnedIds = Array.isArray(raw)
            ? raw.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
          refreshAndRenderIfOpen();
        }
        if (area === 'sync') {
          const shortcutStorageKey = window.GEM_USER_CREATED_SHORTCUTS_STORAGE_KEY || 'gemUserCreatedShortcuts';
          if (changes[shortcutStorageKey]) {
            refreshAndRenderIfOpen();
          }
        }
        if (area === 'local') {
          if (changes[RECENT_STORAGE_KEY] || changes[OTHER_RECENT_STORAGE_KEY]) {
            loadRecentCampaignCaches(refreshAndRenderIfOpen);
          }
        }
      });
    }

    window.addEventListener('gem-user-shortcuts-changed', () => {
      refreshAndRenderIfOpen();
    });
  }

  window.gemIsCommandPaletteOpen = function gemIsCommandPaletteOpen() {
    return paletteOpen;
  };

  window.gemGetAssignablePaletteCommands = getAssignablePaletteCommands;
  window.gemIsPaletteCommandAvailableOnPage = gemIsPaletteCommandAvailableOnPage;
  window.gemRunPaletteCommandById = gemRunPaletteCommandById;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
