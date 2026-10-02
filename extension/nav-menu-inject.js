console.log("[Gem] nav-menu-inject.js loaded");

const SETTINGS_ITEM_ID = "gem-nav-settings-item";
const COMMANDS_ITEM_ID = "gem-nav-commands-item";

function clearUi5NavSelection(item) {
  if (!item) return;
  try {
    item.removeAttribute("selected");
    if ("selected" in item) item.selected = false;
  } catch (_) {}
}

function toggleGemmaSettingsFromNav() {
  if (typeof window.toggleGemmaSettings === "function") {
    window.toggleGemmaSettings();
    return;
  }
  if (typeof window.openGemmaSettings === "function") {
    window.openGemmaSettings();
  }
}

function toggleCommandPaletteFromNav() {
  if (typeof window.gemToggleCommandPalette === "function") {
    window.gemToggleCommandPalette();
  }
}

function buildUi5CommandsItem(navRoot) {
  const gem = window.gemNavMenu;
  const item = gem.buildUi5ActionItem(
    {
      id: COMMANDS_ITEM_ID,
      text: "Gemma Commands",
      icon: "list",
      iconFallbacks: ["menu", "curriculum", "home"],
      className: "gem-ui5-nav-item--commands",
      svgHtml: gem.GEM_NAV_ICON_SVGS && gem.GEM_NAV_ICON_SVGS.commands,
      onActivate: (event) => {
        clearUi5NavSelection(event && event.currentTarget);
        toggleCommandPaletteFromNav();
      },
    },
    navRoot
  );
  gem.syncUi5CollapsedAttrs(item, navRoot);
  item._gemCommandsNavWired = true;
  return item;
}

function buildUi5SettingsItem(navRoot) {
  const gem = window.gemNavMenu;
  const item = gem.buildUi5ActionItem(
    {
      id: SETTINGS_ITEM_ID,
      text: "Gemma Settings",
      icon: "action-settings",
      iconFallbacks: ["sap-box", "puzzle", "curriculum", "home"],
      className: "gem-ui5-nav-item--settings",
      svgHtml: gem.GEM_NAV_ICON_SVGS && gem.GEM_NAV_ICON_SVGS.settings,
      onActivate: (event) => {
        clearUi5NavSelection(event && event.currentTarget);
        toggleGemmaSettingsFromNav();
      },
    },
    navRoot
  );
  gem.syncUi5CollapsedAttrs(item, navRoot);
  item._gemSettingsNavWired = true;
  return item;
}

function wireCommandsItem(host) {
  const el = host.querySelector(`#${COMMANDS_ITEM_ID}`);
  if (!el || el._gemCommandsNavWired) return;
  el._gemCommandsNavWired = true;
  const gem = window.gemNavMenu;
  const activate = (event) => {
    clearUi5NavSelection(event && event.currentTarget);
    toggleCommandPaletteFromNav();
  };
  if (gem && typeof gem.bindUi5NavActivate === "function") {
    gem.bindUi5NavActivate(el, activate);
  } else {
    el.addEventListener("click", activate);
    el.addEventListener("ui5-click", activate);
  }
}

function wireSettingsItem(host) {
  const el = host.querySelector(`#${SETTINGS_ITEM_ID}`);
  if (!el || el._gemSettingsNavWired) return;
  el._gemSettingsNavWired = true;
  const gem = window.gemNavMenu;
  const activate = (event) => {
    clearUi5NavSelection(event && event.currentTarget);
    toggleGemmaSettingsFromNav();
  };
  if (gem && typeof gem.bindUi5NavActivate === "function") {
    gem.bindUi5NavActivate(el, activate);
  } else {
    el.addEventListener("click", activate);
    el.addEventListener("ui5-click", activate);
  }
}

function insertSettingsItem(host) {
  if (!host || host.querySelector(`#${SETTINGS_ITEM_ID}`)) return;
  const gem = window.gemNavMenu;
  if (!gem) return;
  host.appendChild(buildUi5SettingsItem(host));
}

function insertCommandsItem(host) {
  if (!host || host.querySelector(`#${COMMANDS_ITEM_ID}`)) return;
  const settingsItem = host.querySelector(`#${SETTINGS_ITEM_ID}`);
  if (!settingsItem) return;

  const gem = window.gemNavMenu;
  if (!gem) return;
  const item = buildUi5CommandsItem(host);
  gem.insertRelativeToSettings(host, item, SETTINGS_ITEM_ID);
}

function insertItems(host) {
  insertSettingsItem(host);
  insertCommandsItem(host);
  wireSettingsItem(host);
  wireCommandsItem(host);
}

function scanAndInsert(root = document) {
  const gem = window.gemNavMenu;
  if (!gem) return;
  const { hosts } = gem.getNavHosts(root === document ? document : root);
  if (!hosts.length && root !== document) {
    const again = gem.getNavHosts(document);
    again.hosts.forEach((host) => insertItems(host));
    return;
  }
  hosts.forEach((host) => insertItems(host));
}

function observe() {
  window.gemDomWatchSubscribe(function (mutations) {
    let needed = false;
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        const gem = window.gemNavMenu;
        if (
          node.id === SETTINGS_ITEM_ID ||
          node.id === COMMANDS_ITEM_ID ||
          gem?.isNavRelatedNode(node) ||
          node.matches?.("ui5-side-navigation-ds-nav, e-side-navigation")
        ) {
          needed = true;
          return;
        }
        if (
          node.querySelectorAll &&
          (node.querySelector("ui5-side-navigation-ds-nav") ||
            node.querySelector("e-side-navigation") ||
            node.querySelector(`#${SETTINGS_ITEM_ID}`))
        ) {
          needed = true;
        }
      });
    });
    if (needed) scanAndInsert(document);
  });
}

scanAndInsert();
observe();
