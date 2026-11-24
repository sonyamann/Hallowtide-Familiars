# Fonts

Every font the renderer uses is in this folder. It never looks at system fonts.
`SHA256SUMS` records the exact files.

| Files | Family | Used for | License | Source |
| --- | --- | --- | --- | --- |
| `wondertype-regular.ttf` | WonderType, by Clémence Fontaine | Familiars Edition: titles and numerals | SIL Open Font License 1.1 (`OFL-WonderType.txt`) | usemodify.com/fonts/wontertype |
| `toren-proportional.ttf`, `toren-rotalic.ttf`, `toren-mono.ttf` | Toren, by Eli Heuer | Familiars Edition: body text, italics, and the user's own words | SIL Open Font License 1.1 (`OFL-Toren.txt`) | usemodify.com/fonts/toren; license from github.com/eliheuer/tenpo |
| `fifteentwenty-demi.ttf`, `fifteentwenty-bold.ttf` | FifteenTwenty, by Stewart C. Russell | Familiars Edition: handle, labels, strip, and stamp | CC0 1.0 / WTFPL (public domain; no license text required) | usemodify.com/fonts/fifteentwenty |
| `IMFeEN*.ttf`, `SpaceMono-*.ttf`, `UnifrakturMaguntia-Book.ttf` | IM Fell English, Space Mono, UnifrakturMaguntia | The Rabbit folio test | SIL Open Font License 1.1 (texts in this folder) | github.com/google/fonts |

## One change made to the files

The three Toren files shared a single "typographic family" name, which made
them indistinguishable to the renderer. That name (name-table entries 16 and
17) was removed from our copies, leaving each file its own family name. The
glyphs are untouched.

## Notes on the licenses

- **Toren** declares no Reserved Font Name, so the renamed copies above are within its license.
- **WonderType** is used unmodified. Its designer's site has no separate license file, so `OFL-WonderType.txt` pairs the copyright notice embedded in the font file with the standard license text.
