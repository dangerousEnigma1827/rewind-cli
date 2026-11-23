// DiffView model (plan §4.3 step 7), from `diff()`'s own tokens and opcodes. Rows are side by side; equal runs
// collapse like render.diff does; connectors join a step that occurs in both runs at different positions.
import diff from '../data/capture/findings/diff-good-bad.json';

export interface Tok { token: string; seq: number }
export type Row =
  | { kind: 'equal'; a: Tok; b: Tok }
  | { kind: 'collapsed'; count: number }
  | { kind: 'divergence' }
  | { kind: 'change'; a: Tok | null; b: Tok | null };
/** Explanatory aid (◇): identical token text in an A-only row and a B-only row. */
export interface Connector { from: number; to: number; token: string }

export function diffView(context = 2) {
  const rows: Row[] = [];
  const aRow = new Map<number, number>(), bRow = new Map<number, number>(); // token index -> row index
  const ops = diff.opcodes as [string, number, number, number, number][];
  const first = ops.findIndex((o) => o[0] !== 'equal');
  ops.forEach(([tag, i1, i2, j1, j2], n) => {
    if (tag === 'equal') {
      const idx = Array.from({ length: i2 - i1 }, (_, k) => k);
      const head = n ? idx.slice(0, context) : [];
      const tail = n < ops.length - 1 ? idx.slice(-context) : [];
      const shown = idx.length > head.length + tail.length ? [...head, -1, ...tail] : idx;
      for (const k of shown) {
        if (k === -1) rows.push({ kind: 'collapsed', count: idx.length - head.length - tail.length });
        else { aRow.set(i1 + k, rows.length); bRow.set(j1 + k, rows.length); rows.push({ kind: 'equal', a: diff.a[i1 + k], b: diff.b[j1 + k] }); }
      }
      return;
    }
    if (n === first) rows.push({ kind: 'divergence' });
    for (let k = 0; k < Math.max(i2 - i1, j2 - j1); k++) {
      const a = i1 + k < i2 ? diff.a[i1 + k] : null, b = j1 + k < j2 ? diff.b[j1 + k] : null;
      if (a) aRow.set(i1 + k, rows.length);
      if (b) bRow.set(j1 + k, rows.length);
      rows.push({ kind: 'change', a, b });
    }
  });
  // moved = Counter(A-only) & Counter(B-only), as analysis.diff counts it; pair occurrences in order
  const only = (side: 'a' | 'b') => ops.filter((o) => o[0] !== 'equal').flatMap(([, i1, i2, j1, j2]) =>
    side === 'a' ? range(i1, i2) : range(j1, j2));
  const bOnly = only('b');
  const connectors: Connector[] = [];
  const used = new Set<number>();
  for (const i of only('a')) {
    const j = bOnly.find((j) => !used.has(j) && diff.b[j].token === diff.a[i].token);
    if (j === undefined) continue;
    used.add(j);
    connectors.push({ from: aRow.get(i)!, to: bRow.get(j)!, token: diff.a[i].token });
  }
  return { rows, connectors, findings: diff.findings, first: ops[first] };
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);
