// Seq references in captured terminal text (plan §6.2). Columns are those of the plain line.

export interface Hotspot {
  line: number;
  start: number; // [start, end) of the seq digits
  end: number;
  seq: number;
  /** Which run of the view the seq belongs to: index into the view's `runs` (diff: 0 = A, 1 = B). */
  run: 0 | 1;
  /** row: timeline seq column · diff: aligned-steps seq column · evidence: findings' right-hand column · text: inside a sentence */
  where: 'row' | 'diff' | 'evidence' | 'text';
}

const ROW = /^ +(\d+) +\d+\.\d +[│┃] /; // render.timeline: seq, ms, rail
const DIFF = /^  ([ +-]) +(\d+)  \S/; // render._diff_line: mark, seq (A, or B on + lines), token
const REF = /\b(?:([AB]) )?seq (\d+(?:, \d+)*)/g; // "seq 446", "seq 254, 387, 446", "A seq 156"

/** `diff` selects the diff view's aligned-steps layout, which a timeline row would otherwise also match. */
export function findHotspots(lines: string[], { diff = false } = {}): Hotspot[] {
  const out: Hotspot[] = [];
  lines.forEach((text, line) => {
    const row = diff ? null : ROW.exec(text);
    const d = diff ? DIFF.exec(text) : null;
    if (row) out.push(at(line, row[1], text.indexOf(row[1]), 0, 'row'));
    if (d) out.push(at(line, d[2], text.indexOf(d[2], 3), d[1] === '+' ? 1 : 0, 'diff'));
    for (const m of text.matchAll(REF)) {
      const run = m[1] === 'B' ? 1 : 0;
      const where = text.slice(m.index! + m[0].length).trim() === '' ? 'evidence' : 'text';
      let from = m.index! + m[0].length - m[2].length;
      for (const n of m[2].split(', ')) {
        const start = text.indexOf(n, from);
        out.push(at(line, n, start, run, where));
        from = start + n.length;
      }
    }
  });
  return out;
}

const at = (line: number, n: string, start: number, run: 0 | 1, where: Hotspot['where']): Hotspot =>
  ({ line, start, end: start + n.length, seq: Number(n), run, where });
