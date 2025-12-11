# Emarsys Mobile Previewer

A Chrome extension that enhances the Emarsys email campaign builder with mobile preview capabilities and advanced text highlighting features.

## Features

### 🖥️ **Mobile Preview**
- Automatically creates mobile-sized previews of email campaigns
- Side-by-side desktop and mobile views
- Toggle mobile preview visibility with persistent state

### 🎨 **Advanced Text Highlighting**
- Highlight specific text patterns in email content
- User-configurable highlight terms and colors
- Real-time highlighting as content changes

### 🎨 **Color Swatch Management**
- User-defined color palette for TinyMCE editor
- First row in color picker dedicated to custom colors
- Up to 8 user-selectable colors with persistence

### ⚙️ **Settings Panel**
- Comprehensive settings for all features
- Accessible via gear icon in navigation
- Persistent preferences across sessions

### 🔄 **Persistent State**
- All settings and states saved across page loads
- Cross-tab synchronization
- Seamless user experience

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select this folder
5. The extension will be loaded and active

## Usage

### Navigation Icons
- **⚙️ Gear**: Opens settings panel
- **⛶ Expand**: Toggles fullscreen mode
- **📱 Mobile**: Shows/hides mobile preview pane

### Settings Panel
- **Text Highlighting**: Enable/disable text highlighting and manage highlight terms
- **Mobile Preview**: Control mobile preview pane behavior
- **Color Swatches**: Manage your custom color palette

### Color Picker Integration
- First row shows your custom colors
- Bottom rows show recently used colors
- Custom colors persist across all content blocks

## Development

### File Structure
```
├── manifest.json          # Extension manifest
├── background.js          # Background service worker
├── settings-panel.js      # Settings panel UI and logic
├── verticalnav-enhancer.js # Navigation icons and controls
├── mobile-view.js         # Mobile preview functionality
├── text-highlighting.js   # Text highlighting system
├── color-swatch-manager.js # Color picker integration
├── styles.css            # Extension styles
└── *.css                 # Additional CSS files
```

### Key Features Implementation

- **Settings Persistence**: Uses `chrome.storage.sync` for cross-device sync
- **DOM Manipulation**: Safe element detection with mutation observers
- **TinyMCE Integration**: Hooks into existing color picker modals
- **Real-time Updates**: Immediate UI updates without page refresh

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in Chrome
5. Submit a pull request

## License

This project is part of the Emarsys email platform enhancement suite.
