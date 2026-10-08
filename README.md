# Signifier Toolkit

Add semantic markers like `(!)`, `(?)` or `(d)` to the start of a line and see them as clean, colored icons in Live Preview and Reading View. Inspired by the signifiers of bullet journaling.

```markdown
(s) Quarterly goals
- [ ] (!) Submit the report
- (?) Does the new template work on mobile?
> (i) Try the same layout with a sidebar
## (d) Tax declaration
```

Each signifier is just plain text in your note, so your files stay portable and searchable. The plugin only changes how it is displayed.

## Features

- **Live Preview and Reading View.** `(key)` is replaced by an icon. In Live Preview the raw text comes back when your cursor is on it, so editing stays natural. Source mode always shows the raw text.
- **Works where you write.** Paragraphs, bullet and numbered lists, task items, blockquotes and headings.
- **Fully configurable.** Add, rename, disable or delete signifiers. Choose your own symbol, label and color.
- **Flexible symbols.** Plain text, emoji, inline `<svg>`, SVG data URIs, or SVG files from a URL or CDN.
- **Theme-aware colors.** Follow your theme, pick one of its color variables, type your own CSS variable, or use a fixed color.
- **Code is left alone.** Fenced code blocks and inline code are never touched.

## Default signifiers

| Key | Label | Color |
|-----|-------|-------|
| `(s)` | Important | Auto (theme) |
| `(!)` | Critical | `--color-red` |
| `(i)` | Inspiration | `--color-orange` |
| `(?)` | Question | `--color-green` |
| `(d)` | Due | `--color-purple` |

You can change or remove all of them in the settings.

## Usage

Type the key in parentheses at the **start** of a line or block, followed by a space or the end of the line:

```markdown
(!) This works
- (?) This works too
- [ ] (d) And this
Not at the start (!) does nothing
```

Keys are case-sensitive and cannot contain spaces or parentheses. If several keys could match, the longest one wins.

## Settings

Every signifier has its own card:

- **Shortcut:** the text between the parentheses. Edit it and press Enter or the check button (the pencil icon in the header jumps to it).
- **Symbol:** see [Symbols](#symbols).
- **Label:** shown as a tooltip and used for accessibility.
- **Color:** see [Colors](#colors).
- **Enable / delete:** the toggle and trash icon in the header.

At the bottom: **Add signifier**, **Clear SVG cache** and **Restore defaults** (this replaces all your signifiers with the defaults above).

### Symbols

The symbol field accepts:

| Type | Example |
|------|---------|
| Text / emoji | `→`, `💡` |
| Inline SVG | `<svg viewBox="0 0 24 24"><path d="..."/></svg>` |
| SVG data URI | `data:image/svg+xml,%3csvg ...` |
| SVG URL (HTTPS) | `https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/check.svg` |
| npm shorthand | `npm:lucide-static@latest/icons/check.svg` |
| GitHub shorthand | `gh:user/repo@main/icon.svg` |

The `npm:` and `gh:` shorthands are resolved through [jsDelivr](https://www.jsdelivr.com/).

SVGs are drawn as CSS masks, so they take the signifier color. Their own colors are ignored, and only the shape (alpha) is used. All SVG sources are sanitized: scripts, `<style>`, `<foreignObject>`, event handlers and external references are removed.

### Colors

| Mode | What it does |
|------|--------------|
| **Auto** | Follows your theme. |
| **Theme** | Pick one of your theme's variables from a list (for example `--color-pink`). |
| **Free** | Type any CSS variable name, such as `--my-accent`. `--x`, `x` and `var(--x)` are all accepted. |
| **Fixed** | Pick an exact color. |

If a theme variable is not defined by your theme, the accent color is used instead.

## Commands

| Command | Description |
|---------|-------------|
| Copy debug info | Copies a short summary for bug reports to the clipboard. |
| Toggle debug logging | Turns console logging on or off. |

## Network use

By default the plugin makes **no network requests**.

Requests happen only if you set a signifier's symbol to an HTTPS URL, or to an `npm:` / `gh:` shorthand (which uses `cdn.jsdelivr.net`). In that case the plugin downloads that single SVG file. It sends no data from your vault, and there is no telemetry or analytics.

Downloaded SVGs are limited to 200 KB, sanitized, and cached in the plugin's `data.json`, so they keep working offline. Use **Clear SVG cache** to remove them.

## Styling with CSS

Each rendered signifier carries a `data-signifier` attribute, so you can restyle it with a CSS snippet:

```css
.signifier[data-signifier="s"],
.cm-signifier[data-signifier="s"] {
    color: gold;
}
```

Classes: `.signifier` (Reading View), `.cm-signifier` (Live Preview). The color is exposed as the `--signifier-color` variable.

## Debugging

Turn on **Debug logging** in the settings, then open the developer console (`Ctrl/Cmd + Shift + I`). Messages are prefixed with `[Signifier]`. When reporting a bug, please include the output of **Copy debug info**. It contains no note content.

## Known limitations

- A signifier is only recognized at the start of a line or block.
- Tables are not processed in Reading View.
- Indented (4 spaces) code blocks and fenced blocks inside blockquotes are not detected as code in Live Preview.
- Key order in the settings follows insertion order, except that purely numeric keys (like `1`) are sorted first by JavaScript.

## Installation

### Manual

1. Download `main.js`, `manifest.json` and `styles.css`.
2. Copy them to `<your vault>/.obsidian/plugins/signifier-toolkit/`.
3. Reload Obsidian and enable **Signifier Toolkit** under *Settings → Community plugins*.

## License

MIT