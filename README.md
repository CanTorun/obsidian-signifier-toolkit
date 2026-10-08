# Nexa Signifier Renderer v0.1.0

An Obsidian community-plugin prototype that renders short `@` signifier tokens in Reading View while keeping the Markdown source clean.

## Syntax

- `@a` — Action →
- `@q` — Question ?
- `@d` — Decision ◆
- `@i` — Idea 💡
- `@!` — Critical !
- `@w` — Warning ⚠
- `@v` — Verified ✓
- `@u` — Uncertain ≈
- `@t` — Temporary ⌁
- `@r` — Review ↻

Example Markdown:

    @a Nexa vault operasyonlarını test et
    @q Hermes gateway neden duruyor?
    @d nexa-vault kullanılacak.
    @i Preprocessing katmanı token maliyetini azaltabilir.

The source remains exactly those `@` tokens. HTML spans are generated only at runtime.

## Current scope

v0.1 renders in Reading View using an Obsidian Markdown post-processor. Tokens inside inline code and code blocks are ignored.

Live Preview/editor rendering is deliberately left for v0.2 so the core syntax remains stable first.
