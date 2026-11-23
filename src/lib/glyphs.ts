// Every non-ASCII char in ../rewind/rewind/*.py at 388fe45. IBM Plex Mono's fontsource subsets lack the
// arrows, box drawing, shapes and dingbats, so these route to the DejaVu Mono fallback (§5.3 glyph audit).
// shortcut: hand-collected from source, switch to scanning src/data/capture once M1 commits captures.
export const GLYPHS = '·»×—•…←↑→─│┃┈┼║▀▄█▸►▼◂◄◆◉○◌●♦⚙✎✖';

/** CSS unicode-range for the given chars, e.g. "U+2190,U+2192". */
export const unicodeRange = (chars: string) =>
  [...chars].map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(',');
