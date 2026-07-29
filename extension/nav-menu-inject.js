console.log("[Gem] nav-menu-inject.js loaded");

const ITEM_ID = "gem-nav-settings-item";
const ICON_SRC = chrome.runtime.getURL("img/icon-with-transparency.png");

function openGemmaSettings() {
  console.log("[Gem] Nav item clicked → opening settings");
  try {
    console.log("[Gem] Sending openSettings message to background...");
    chrome.runtime.sendMessage({ action: "openSettings" }, (response) => {
      console.log("[Gem] openSettings response:", response);
      if (chrome.runtime.lastError) {
        console.log("[Gem] openSettings error:", chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.log("[Gem] Error sending openSettings:", error);
  }
}

function buildLegacySettingsItem() {
  const li = document.createElement("li");
  li.className = "e-navigation__menu_list_item";
  li.id = ITEM_ID;
  li.style.marginBottom = "20px";

  li.innerHTML = `
    <button type="button" class="e-navigation__action" aria-expanded="false">
      <e-icon class="e-navigation__action_icon" color="inherit" style="margin: 10px">
        <img src="${ICON_SRC}" style="width: 36px;height: auto; filter: drop-shadow(2px 4px 6px rgb(34 26 72 / 0.35))">
      </e-icon>
      <span class="e-navigation__action_text">Gemma Settings</span>
    </button>
  `;

  const btn = li.querySelector("button");
  if (btn) btn.addEventListener("click", openGemmaSettings);
  return li;
}

function buildUi5SettingsItem(navRoot) {
  const gem = window.gemNavMenu;
  const item = gem.buildUi5ActionItem(
    {
      id: ITEM_ID,
      text: "Gemma Settings",
      // Prefer a loaded Emarsys icon; Gemma logo is patched into the shadow root.
      icon: "action-settings",
      iconFallbacks: ["sap-box", "puzzle", "curriculum", "home"],
      className: "gem-ui5-nav-item--settings",
      logoUrl: ICON_SRC,
      onActivate: openGemmaSettings,
    },
    navRoot
  );
  gem.syncUi5CollapsedAttrs(item, navRoot);
  return item;
}

function insertItem(host, flavor) {
  if (!host || host.querySelector(`#${ITEM_ID}`)) return;
  const gem = window.gemNavMenu;
  if (flavor === "ui5" && gem) {
    host.appendChild(buildUi5SettingsItem(host));
    return;
  }
  host.appendChild(buildLegacySettingsItem());
}

function scanAndInsert(root = document) {
  const gem = window.gemNavMenu;
  if (!gem) {
    document.querySelectorAll("ul.e-navigation__menu_list").forEach((nav) => insertItem(nav, "legacy"));
    return;
  }
  const { flavor, hosts } = gem.getNavHosts(root === document ? document : root);
  if (!hosts.length && root !== document) {
    const again = gem.getNavHosts(document);
    again.hosts.forEach((host) => insertItem(host, again.flavor));
    return;
  }
  hosts.forEach((host) => insertItem(host, flavor));
}

function observe() {
  window.gemDomWatchSubscribe(function (mutations) {
    let needed = false;
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        const gem = window.gemNavMenu;
        if (gem?.isNavRelatedNode(node) || node.matches?.("ul.e-navigation__menu_list, ui5-side-navigation-ds-nav, e-side-navigation, e-navigation")) {
          needed = true;
          return;
        }
        if (node.querySelectorAll && (
          node.querySelector("ul.e-navigation__menu_list") ||
          node.querySelector("ui5-side-navigation-ds-nav") ||
          node.querySelector("e-side-navigation")
        )) {
          needed = true;
        }
      });
    });
    if (needed) scanAndInsert(document);
  });
}

scanAndInsert();
observe();
