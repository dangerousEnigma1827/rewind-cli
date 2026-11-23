// SGR parser for captured Rewind output (plan §6.2). One parser for the static Terminal and the island.
import render from '../data/capture/source/render.json';

export type Token = keyof typeof render.PALETTE;

export interface Span {
  text: string;
  token: Token | null; // null = the terminal's default foreground
  bold: boolean;
  italic: boolean;
  dim: boolean;
}

/** Truecolor "r;g;b" -> palette token, built from the captured render.PALETTE (no second copy of the hex). */
const BY_RGB = new Map<string, Token>(
  (Object.entries(render.PALETTE) as [Token, string][]).map(([token, hex]) => [
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(';'),
    token,
  ]),
);

// Every CSI sequence. Only SGR (`m`) styles text; others (e.g. Rich's cursor hide/show around a spinner) print nothing.
const CSI = /\x1b\[([0-9;?]*)([A-Za-z])/g;

/** Parses captured ANSI text into lines of styled spans. Throws on any SGR it does not understand. */
export function parseAnsi(src: string): Span[][] {
  const lines: Span[][] = [[]];
  let style = { token: null as Token | null, bold: false, italic: false, dim: false };
  const push = (text: string) => {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, ...style });
    });
  };
  let last = 0;
  for (const m of src.matchAll(CSI)) {
    push(src.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[2] !== 'm') continue;
    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) style = { token: null, bold: false, italic: false, dim: false };
      else if (c === 1) style.bold = true;
      else if (c === 2) style.dim = true;
      else if (c === 3) style.italic = true;
      else if (c === 22) style.bold = style.dim = false;
      else if (c === 23) style.italic = false;
      else if (c === 39) style.token = null;
      else if (c === 38 && codes[i + 1] === 2) {
        const rgb = codes.slice(i + 2, i + 5).join(';');
        const token = BY_RGB.get(rgb);
        if (!token) throw new Error(`ansi: colour ${rgb} is not in render.PALETTE`);
        style.token = token;
        i += 4;
      } else throw new Error(`ansi: unsupported SGR ${c} in "${m[0].slice(1)}"`);
    }
  }
  push(src.slice(last));
  return lines;
}

/** The text a terminal shows: spans joined, styles dropped. */
export const plainText = (lines: Span[][]) => lines.map((l) => l.map((s) => s.text).join('')).join('\n');
