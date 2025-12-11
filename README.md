# Gemma for Emarsys

A Chrome extension that enhances the Emarsys email campaign builder with mobile preview, advanced text highlighting, custom color swatches, and a built-in settings experience.

## Features

- **Mobile Preview**: Auto-cloned mobile view with toggle and persisted visibility.
- **Text Highlighting**: User-configurable terms/colors with real-time updates.
- **Color Swatches**: Up to 8 custom colors injected into the TinyMCE picker.
- **Settings Entry in Nav**: “Gemma Settings” menu item injected into `ul.e-navigation__menu_list` to open the settings panel.
- **Condensed Blocks Panel**: Optional compact view for block templates.
- **Persistent State**: Uses `chrome.storage.sync` to keep preferences across sessions/tabs.

## Installation

1) Clone this repo.  
2) In Chrome, open `chrome://extensions/`.  
3) Enable “Developer mode”.  
4) Click “Load unpacked” and select the `extension/` folder.  

## Usage

- Click the **Gemma Settings** nav item to open the settings panel.  
- Configure highlighting terms/colors, mobile preview defaults, condensed blocks panel, and color swatches.  
- Mobile preview toggle and condensed panel state persist via `chrome.storage.sync`.

## Structure (extension/)
```
manifest.json           # Extension manifest (MV3)
background.js           # Service worker for messaging/settings
settings-panel.js       # Settings UI and storage wiring
nav-menu-inject.js      # Injects Gemma Settings nav item
verticalnav-enhancer.js # Nav enhancers (expand/mobile controls)
mobile-view.js          # Mobile preview logic
text-highlighting.js    # Highlight terms/regex
color-swatch-manager.js # TinyMCE color swatch integration
condensed-blocks-panel.js # Condensed blocks feature
theme.css / styles.css  # Styling
global-styles.css       # Global tweaks
iframe-theme-injector.js # Theme injection for iframes
```

## Development Notes

- Messaging: settings panel listens for `{ action: "openSettings" }` from nav-menu-inject or other scripts.  
- Storage: `chrome.storage.sync` for settings/state; defaults in `background.js`.  
- DOM readiness: mutation observers ensure late-loading nav/iframes receive injections.

## Contributing

1. Fork → branch → commit.  
2. Test in Chrome via “Load unpacked” on `extension/`.  
3. Submit a PR.  

## License

Provided as-is for enhancing Emarsys workflows.***
