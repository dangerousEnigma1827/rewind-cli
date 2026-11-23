// Non-ASCII glyphs Rewind prints: every one in the captures (tests/glyphs.test.ts enforces it), plus the rest of
// ../rewind/rewind/*.py's output glyphs at the captured sha. Those IBM Plex Mono's fontsource subsets lack
// (arrows, box drawing, shapes, dingbats) route to the DejaVu Mono fallback via this list's unicode-range (§5.3).
export const GLYPHS = '·»×—•…←↑→─│┃┈└├┼║▀▄█▸►▼◂◄◆◉○◌●♦⚙✎✖';

/** CSS unicode-range for the given chars, e.g. "U+2190,U+2192". */
export const unicodeRange = (chars: string) =>
  [...chars].map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(',');
