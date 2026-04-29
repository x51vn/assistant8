# Icons for Assistant8 Extension

This folder contains the icons used by the Assistant8 Chrome Extension.

## Icon Sizes

### icon-16.svg (16x16px)
- Used as the tiny favicon in tab bar
- Minimum size for extension visibility
- Shown in browser history

### icon-48.svg (48x48px)
- Used in the browser toolbar
- Shown in chrome://extensions page
- Most commonly seen size

### icon-128.svg (128x128px)
- Large extension icon
- Used in chrome extension store preview
- High-resolution displays

## Format

All icons are currently SVG files with a gradient design:
- **Primary Color**: #667eea (Purple Blue)
- **Secondary Color**: #764ba2 (Deep Purple)
- **Style**: Gradient background with "G" letter for ChatGPT

## Customization

You can replace these icons with your own:
1. Keep the same filenames
2. Use the specified sizes (16x16, 48x48, 128x128)
3. Use SVG for the checked-in manifest assets, or export PNG copies for Chrome Web Store upload assets
4. Ensure good visibility at all sizes
5. Reload extension after changing (chrome://extensions > Reload)

## Requirements

- Format: SVG in `src/extension/images`
- Colors: Any color scheme
- Design: Clean and recognizable
- Size: Exactly 16x16, 48x48, and 128x128 pixels

## Current Design

The current icons use:
- Gradient background (purple-blue to deep purple)
- Large "A8" monogram suggestion for Assistant8
- Simple, clean design
- Professional appearance
- Good contrast

## Icon Design Tips

For best results:
1. Use square dimensions
2. Add padding around the main element
3. Ensure good contrast
4. Test on both light and dark backgrounds
5. Make scalable (works at all sizes)

---

If you want to create custom icons:
- Use a design tool like Figma, Adobe XD, or GIMP
- Follow the size requirements
- Keep the design simple for small sizes
- Export CWS upload assets as PNG with transparency if the Developer Dashboard requires PNG

Happy customizing! 🎨
