---
name: "Pokémon HOME Tracker"
description: "Bill's PC for a focused, nostalgic, and precise collection workflow."
colors:
  night-canvas: "#0f1923"
  deep-shell: "#162231"
  box-surface: "#1e2d3d"
  slate-header: "#2a3f55"
  slate-hover: "#2a4060"
  detail-surface: "#1a2838"
  ink-primary: "#e8edf2"
  ink-secondary: "#8899aa"
  ink-muted: "#9aa9b8"
  control-ink: "#07131f"
  danger-control-ink: "#210909"
  pc-blue: "#4a9eff"
  pc-blue-hover: "#72b3ff"
  completion-gold: "#f0c040"
  ready-green: "#4ade80"
  warning-red: "#f87171"
  warning-red-hover: "#ff9595"
  gen3-parchment: "#DED5B4"
  gen3-menu-gray: "#D5D5CD"
  gen3-panel-lavender: "#D5CDD5"
  gen3-slate: "#52629C"
  gen3-cream: "#FFFFDE"
  gen3-ink: "#000000"
  gen3-muted-ink: "#514A3F"
  gen3-cobalt: "#3152CD"
  gen3-teal: "#52CDB4"
  gen3-yellow: "#FFD520"
  gen3-cursor-red: "#E60808"
  gen3-cursor-red-hover: "#B50606"
  gen3-frame: "#293131"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
  pixel-display:
    fontFamily: "'Press Start 2P', monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
  pixel-body:
    fontFamily: "'VT323', 'Courier New', monospace"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  none: "0px"
  sm: "4px"
  control: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.pc-blue}"
    textColor: "{colors.control-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 14px"
  button-secondary:
    backgroundColor: "{colors.slate-header}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 14px"
  input:
    backgroundColor: "{colors.box-surface}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  navigation-tab:
    backgroundColor: "{colors.box-surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  navigation-tab-active:
    backgroundColor: "{colors.pc-blue}"
    textColor: "{colors.control-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  box-container:
    backgroundColor: "{colors.box-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    width: "290px"
  dialog:
    backgroundColor: "{colors.box-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "20px 24px"
---

# Design System: Pokémon HOME Tracker

## Overview

**Creative North Star: "Bill's PC"**

The interface is a modern collection workstation viewed through the memory of a Pokémon storage terminal. It is focused, nostalgic, and precise: Pokémon sprites and box positions lead, while the application chrome stays compact enough to disappear into the workflow.

The default theme is a dark PokéPC workspace for sustained scanning. The optional Gen III theme is an authentic alternate skin built from FireRed and LeafGreen-era colors, pixel typography, hard frames, and instant interactions. Both themes preserve the same information hierarchy and component behavior. The system explicitly rejects the feel of a sterile enterprise administration tool.

**Key Characteristics:**
- Dense, spatial collection views with Pokémon as the dominant visual material.
- Compact controls whose active, hover, selected, and invalid states are unmistakable.
- Flat-at-rest surfaces; elevation appears only when content genuinely changes layer.
- Semantic color channels for ownership, readiness, warnings, games, types, and stats.
- A responsive shell that preserves scanning and editing workflows on narrow screens.

## Colors

The default palette is a cool, low-luminance PC cabinet punctuated by bright game-state colors; the Gen III palette translates the same roles into a warm cartridge-era screen.

### Primary
- **Link Cable Blue:** The principal interactive color for active tabs, focus, links, and primary actions.
- **Completion Gold:** Reserved for progress, box titles, unowned search matches, and completion-oriented emphasis.

### Secondary
- **Battle-Ready Green:** Confirms readiness, correct placement, successful copy actions, and positive state.
- **Warning Red:** Marks destructive actions, blocked states, mismatches, and the Gen III selection cursor.

### Tertiary
- **Gen III Cobalt and Teal:** Carry the alternate theme's active controls, framed panels, and secondary accents without changing semantic meaning.
- **Pokémon Type Palette:** Type colors remain data, not decoration. Use the committed per-type tokens for badges and matchup context.

### Neutral
- **PC Night:** The default page canvas.
- **Deep Cabinet:** The default shell and elevated menu layer.
- **Box Interior:** The default working surface for boxes, controls, and cards.
- **Header Slate:** Separates headers and secondary controls from their parent surface.
- **Primary, Secondary, and Muted LCD Text:** Establish a strict three-level text hierarchy.
- **Gen III Parchment, Menu Gray, Panel Lavender, and Cream:** Form the alternate theme's canvas, controls, dialogs, and detail surface.
- **Gen III Frame:** The dark outline used for authentic pixel framing.

### Named Rules

**The Semantic Channel Rule.** Blue means interaction, gold means completion, green means ready or correct, and red means danger or mismatch. Never reuse these colors as arbitrary decoration.

**The Theme Parity Rule.** A theme may change material, typography, and rendering style; it must never change the meaning or visibility of a state.

## Typography

**Display Font:** System UI stack, with `Press Start 2P` in the Gen III theme
**Body Font:** System UI stack, with `VT323` in the Gen III theme
**Label/Mono Font:** The body stack by default; `VT323` for Gen III data and controls

**Character:** The default typography is compact and neutral so collection data stays legible at scale. Gen III typography adds explicit nostalgia: `Press Start 2P` is limited to short headings and labels, while `VT323` carries body data at a minimum readable size.

### Hierarchy
- **Headline** (700, 1rem, 1.3): Dialog titles, major surface headings, and compact hierarchy anchors.
- **Title** (600, 0.95rem, 1.4): Pokémon names, box headings, card titles, and editor section titles.
- **Body** (400, 0.9rem, 1.5): Descriptions, form content, metadata, and explanatory text.
- **Label** (600, 0.75rem, 1.3): Tabs, filters, badges, table labels, and compact actions.
- **Pixel Display** (400, 0.75rem, 1.5): Gen III headings and short labels only.
- **Pixel Body** (400, 18px, 1.3): Gen III data, inputs, tables, and controls.

### Named Rules

**The Sprite-First Rule.** Type must identify and explain Pokémon; it must not compete with sprites through oversized display treatment.

**The Pixel Legibility Rule.** Never render `VT323` below 16px, and never use `Press Start 2P` for paragraphs, dense tables, or long control labels.

## Elevation

The system is flat at rest. Tonal surfaces, full borders, headers, and spacing establish hierarchy across boxes, cards, filters, and tables. Shadows are reserved for content that genuinely occupies another layer: autocomplete panels, dialogs, toasts, and the detail viewer. The Gen III theme uses hard offset shadows as pixel framing, not as a license to lift every repeated item.

### Shadow Vocabulary
- **Popover:** `0 4px 12px var(--shadow)` for autocomplete and picker panels.
- **Dialog:** `0 8px 32px rgb(0, 0, 0, 0.5)` for blocking modal content.
- **Viewer Overlay:** `0 20px 60px var(--shadow)` for the centered detail viewer.
- **Gen III Frame:** Inset top-left and bottom-right highlights plus a `4px 4px` hard drop for major framed surfaces.
- **Gen III Control Press:** A `3px 3px` hard shadow at rest that disappears when the control translates on active press.

### Named Rules

**The Flat-at-Rest Rule.** Repeated collection content is never raised merely to look clickable. Elevation signals layering, not decoration.

## Components

Components are compact and unmistakable. They use restrained dimensions, explicit borders, and semantic state changes so the user can scan first and inspect second.

### Buttons
- **Shape:** Compact controls use gently curved edges in the default theme and pixel-sharp corners in Gen III.
- **Primary:** Link Cable Blue with dark high-contrast control text in the default theme and cream-white control text in Gen III.
- **Hover / Focus:** Hover deepens or brightens the assigned role; keyboard focus uses the interactive blue border or ring.
- **Secondary / Danger:** Secondary actions use Header Slate and a visible border. Destructive actions use Warning Red only when the consequence is genuinely destructive.
- **Gen III Press:** Hard shadows and a three-pixel active translation create an instant, physical menu-button response.

### Chips
- **Style:** Small, high-density labels use a solid semantic or type background, compact horizontal padding, and uppercase only where the category is short.

### Box State Key
- **Disclosure:** Keep the state key compact at rest and keyboard/touch accessible. On narrow screens it opens as a viewport-contained bottom panel.
- **Explanation without clutter:** The key renders miniature `.slot` elements with the same production classes and `data-*` attributes as the grid, so its backgrounds, borders, and sprite glows cannot drift. Individual slots do not gain extra glyphs or labels.
- **Accessibility:** Slot descriptions expose placement, documentation, and training meaning without adding visual noise to the six-column PC grid.
- **State:** Selected filters must change both fill and border or iconography. Type badges retain their committed Pokémon type colors.

### Cards / Containers
- **Corner Style:** Default boxes and dialogs use the shared radius scale; Gen III surfaces are square.
- **Background:** Box Interior and Deep Cabinet provide tonal separation without decorative gradients.
- **Shadow Strategy:** Collection cards and boxes stay flat. Only overlays and true popovers use ambient shadow.
- **Border:** A full one-pixel Slate border is standard; Gen III major panels use the three-layer framed treatment.
- **Internal Padding:** Dense content generally uses 8–16px, with 20–24px reserved for dialogs and detail content.

### Inputs / Fields
- **Style:** Box Interior background, visible full border, compact padding, and Primary LCD Text.
- **Focus:** Link Cable Blue changes the border; Gen III adds a restrained cobalt ring.
- **Error / Disabled:** Errors use Warning Red and explicit text. Disabled or dimmed content must remain spatially stable.

### Navigation
- The sticky header groups the primary routes as compact tabs beside global search.
- Active navigation changes fill and text contrast. Gen III additionally uses a blinking gold cursor without shifting layout.
- At narrow widths, controls wrap and expand to maintain tap targets rather than collapsing into an unrelated navigation model.

### Box Grid

The 290px box is the signature component: six 44px slots per row, compact gaps, a distinct title strip, pixel-rendered sprites, and layered state channels. Search, selection, placement, training, and game badges must coexist without moving the grid or obscuring the Pokémon.

## Do's and Don'ts

### Do:
- **Do** keep Pokémon sprites, forms, box positions, Builds, and Teams visually dominant.
- **Do** preserve the shared semantic color meanings across both themes.
- **Do** use full borders, tonal surfaces, and spacing before adding elevation.
- **Do** keep controls compact and unmistakable, with explicit active and focus states.
- **Do** keep unknown, mismatched, and blocked states visibly distinct from confirmed states.
- **Do** preserve mobile wrapping and touch-target behavior whenever dense desktop controls change.

### Don't:
- **Don't** make the product resemble a sterile enterprise administration tool.
- **Don't** introduce generic corporate dashboard cards, oversized KPI treatments, or detached business terminology.
- **Don't** raise every box, row, or card with a shadow; collection surfaces are flat at rest.
- **Don't** use blue, gold, green, or red as arbitrary decoration that weakens their semantic roles.
- **Don't** add nostalgia that slows scanning, hides data, or replaces familiar controls with game imitation.
- **Don't** let an unknown form, placement, or training state appear confirmed.
