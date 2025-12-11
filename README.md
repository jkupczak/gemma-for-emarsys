# Gemma for Emarsys

Chrome extension for the Emarsys email builder: mobile preview, text highlighting, custom color swatches, condensed blocks panel, and an in-app settings panel with a nav entry.

## Features

- **Gemma Settings nav entry**: Injected into `ul.e-navigation__menu_list`; opens the settings panel.  
- **Mobile Preview**: Cloned mobile view with toggle and persisted visibility.  
- **Text Highlighting**: User-configurable terms/colors (regex supported) with live updates.  
- **Color Swatches**: Up to 8 custom colors injected into the TinyMCE picker.  
- **Condensed Blocks Panel**: Optional compact block template list.  
- **Other tweaks**: Keyboard shortcuts, textarea expand, progress clone, page title updater, toggle page elements.  
- **Persistence**: Uses `chrome.storage.sync` for settings/state.

## Installation

1) Clone this repo.  
2) Open `chrome://extensions/` in Chrome.  
3) Enable **Developer mode**.  
4) Click **Load unpacked** and select the `extension/` folder.  

## Usage

- Click **Gemma Settings** in the nav to open the settings panel.  
- Configure highlighting terms/colors, mobile preview defaults, condensed blocks panel, and color swatches.  
- States persist across sessions via `chrome.storage.sync`.

## Key Files (extension/)
```
manifest.json            # MV3 manifest
background.js            # Service worker, settings defaults, messaging
settings-panel.js        # Settings UI and storage wiring
nav-menu-inject.js       # Injects Gemma Settings nav item
verticalnav-enhancer.js  # Nav expand/mobile controls
mobile-view.js           # Mobile preview cloning
text-highlighting.js     # Highlight terms/regex
color-swatch-manager.js  # TinyMCE color swatch integration
condensed-blocks-panel.js# Condensed blocks feature
textarea-expand.js       # Auto-grow textareas
keyboard-shortcuts.js    # Editor shortcuts
progress-cloner.js       # Progress bar duplicator
page-title-updater.js    # Tab title tweaks
toggle-page-elements.js  # Show/hide elements
styles.css / theme.css / global-styles.css # Styling
e-panel--links.css / e-panels.css          # Panel styles
```

## Development Notes

- Messaging: settings panel listens for `{ action: "openSettings" }`; nav menu sends both direct and background-broadcast messages.  
- Storage: Defaults in `background.js`; persisted in `chrome.storage.sync`.  
- DOM readiness: Mutation observers ensure late-loading nav and block lists get enhancements.

## Contributing

1. Fork → branch → commit.  
2. Test via “Load unpacked” on `extension/`.  
3. Open a PR.
