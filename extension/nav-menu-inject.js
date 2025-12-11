console.log("[gem] nav-menu-inject.js loaded");

const NAV_SELECTOR = "ul.e-navigation__menu_list";
const ITEM_ID = "gem-nav-settings-item";
const ICON_SRC = chrome.runtime.getURL("img/icon-with-transparency.png");

function buildItem() {
  const li = document.createElement("li");
  li.className = "e-navigation__menu_list_item";
  li.id = ITEM_ID;
  li.style.marginTop = "auto";
  li.style.marginBottom = "20px";

  li.innerHTML = `
    <button type="button" class="e-navigation__action" aria-expanded="false">
      <e-icon class="e-navigation__action_icon" color="inherit" style="margin: 10px">
        <img src="${ICON_SRC}" style="width: 36px;height: auto;">
      </e-icon>
      <span class="e-navigation__action_text">Gemma Settings</span>
    </button>
  `;

  const btn = li.querySelector("button");
  if (btn) {
    btn.addEventListener("click", () => {
      console.log("[gem] Nav item clicked → opening settings");
      // Try direct content-script listener first
      chrome.runtime.sendMessage({ action: "openSettings" }, () => {});
      // Fallback: ask background to broadcast (handles frames that didn't get the listener)
      chrome.runtime.sendMessage({ action: "openSettingsRequest" }, () => {});
    });
  }

  return li;
}

function insertItem(nav) {
  if (!nav || nav.querySelector(`#${ITEM_ID}`)) return;
  const li = buildItem();
  nav.appendChild(li);
}

function scanAndInsert(root = document) {
  const navs = root.querySelectorAll(NAV_SELECTOR);
  navs.forEach(insertItem);
}

function observe() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(NAV_SELECTOR)) {
          insertItem(node);
        } else if (node.querySelectorAll) {
          scanAndInsert(node);
        }
      });
    });
  });

  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });
}

// Kick off as early as possible
scanAndInsert();
observe();

