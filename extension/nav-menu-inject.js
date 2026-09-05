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

function buildLegacyCommandsItem() {
  const li = document.createElement("li");
  li.className = "e-navigation__menu_list_item";
  li.id = COMMANDS_ITEM_ID;

  li.innerHTML = `
    <button type="button" class="e-navigation__action" aria-expanded="false">
      <e-icon class="e-navigation__action_icon" color="inherit" icon="custom">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon text-color-inherit gem-nav-custom-svg"></div>
        </div>
      </e-icon>
      <span class="e-navigation__action_text">Gemma Commands</span>
    </button>
  `;
  if (window.gemNavMenu) {
    window.gemNavMenu.applyLegacyNavSvg(li, window.gemNavMenu.GEM_NAV_ICON_SVGS.commands);
  }

  const btn = li.querySelector("button");
  if (btn) btn.addEventListener("click", toggleCommandPaletteFromNav);
  li._gemCommandsNavWired = true;
  return li;
}

function buildLegacySettingsItem() {
  const li = document.createElement("li");
  li.className = "e-navigation__menu_list_item";
  li.id = SETTINGS_ITEM_ID;
  li.style.marginBottom = "20px";

  li.innerHTML = `
    <button type="button" class="e-navigation__action" aria-expanded="false">
      <e-icon class="e-navigation__action_icon" color="inherit" icon="custom">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon text-color-inherit gem-nav-custom-svg"></div>
        </div>
      </e-icon>
      <span class="e-navigation__action_text">Gemma Settings</span>
    </button>
  `;
  if (window.gemNavMenu) {
    window.gemNavMenu.applyLegacyNavSvg(li, window.gemNavMenu.GEM_NAV_ICON_SVGS.settings);
  }

  const btn = li.querySelector("button");
  if (btn) btn.addEventListener("click", toggleGemmaSettingsFromNav);
  li._gemSettingsNavWired = true;
  return li;
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

function wireCommandsItem(host, flavor) {
  const el = host.querySelector(`#${COMMANDS_ITEM_ID}`);
  if (!el || el._gemCommandsNavWired) return;
  el._gemCommandsNavWired = true;
  if (flavor === "ui5") {
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
    return;
  }
  const btn = el.querySelector("button");
  if (btn) btn.addEventListener("click", toggleCommandPaletteFromNav);
}

function wireSettingsItem(host, flavor) {
  const el = host.querySelector(`#${SETTINGS_ITEM_ID}`);
  if (!el || el._gemSettingsNavWired) return;
  el._gemSettingsNavWired = true;
  if (flavor === "ui5") {
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
    return;
  }
  const btn = el.querySelector("button");
  if (btn) btn.addEventListener("click", toggleGemmaSettingsFromNav);
}

function insertSettingsItem(host, flavor) {
  if (!host || host.querySelector(`#${SETTINGS_ITEM_ID}`)) return;
  const gem = window.gemNavMenu;
  const item =
    flavor === "ui5" && gem ? buildUi5SettingsItem(host) : buildLegacySettingsItem();
  host.appendChild(item);
}

function insertCommandsItem(host, flavor) {
  if (!host || host.querySelector(`#${COMMANDS_ITEM_ID}`)) return;
  const settingsItem = host.querySelector(`#${SETTINGS_ITEM_ID}`);
  if (!settingsItem) return;

  const gem = window.gemNavMenu;
  const item =
    flavor === "ui5" && gem ? buildUi5CommandsItem(host) : buildLegacyCommandsItem();

  if (gem) {
    gem.insertRelativeToSettings(host, item, SETTINGS_ITEM_ID);
  } else {
    host.insertBefore(item, settingsItem);
  }
}

function insertItems(host, flavor) {
  insertSettingsItem(host, flavor);
  insertCommandsItem(host, flavor);
  wireSettingsItem(host, flavor);
  wireCommandsItem(host, flavor);
}

function scanAndInsert(root = document) {
  const gem = window.gemNavMenu;
  if (!gem) {
    document.querySelectorAll("ul.e-navigation__menu_list").forEach((nav) => insertItems(nav, "legacy"));
    return;
  }
  const { flavor, hosts } = gem.getNavHosts(root === document ? document : root);
  if (!hosts.length && root !== document) {
    const again = gem.getNavHosts(document);
    again.hosts.forEach((host) => insertItems(host, again.flavor));
    return;
  }
  hosts.forEach((host) => insertItems(host, flavor));
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
          node.matches?.("ul.e-navigation__menu_list, ui5-side-navigation-ds-nav, e-side-navigation, e-navigation")
        ) {
          needed = true;
          return;
        }
        if (
          node.querySelectorAll &&
          (node.querySelector("ul.e-navigation__menu_list") ||
            node.querySelector("ui5-side-navigation-ds-nav") ||
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
