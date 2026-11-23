// The one terminal renderer (plan §6.2): capture → lines of styled segments, with seq hotspots split out.
// The static <Terminal> ignores `hot`; the island turns hot segments into buttons.
import { parseAnsi, type Span } from './ansi';
import { findHotspots, type Hotspot } from './hotspots';

export interface Seg {
  text: string;
  cls: string; // t-<token> b i d
  hot?: Pick<Hotspot, 'seq' | 'run' | 'where'>;
}
export interface TermLine {
  segs: Seg[];
  /** Index of the finding this line belongs to (findings block only), for "hover a finding → its seqs". */
  finding?: number;
}

const cls = (s: Span) =>
  [s.token && `t-${s.token.replace('.', '-')}`, s.bold && 'b', s.italic && 'i', s.dim && 'd'].filter(Boolean).join(' ');

export function renderSpans(ansi: string, { diff = false } = {}): TermLine[] {
  const lines = parseAnsi(ansi);
  const plain = lines.map((l) => l.map((s) => s.text).join(''));
  const spots = findHotspots(plain, { diff });
  const groups = findingGroups(plain);
  return lines.map((spans, i) => {
    const cuts = spots.filter((h) => h.line === i);
    const segs: Seg[] = [];
    let col = 0;
    for (const s of spans) {
      const end = col + s.text.length;
      let at = col;
      for (const h of cuts.filter((h) => h.start >= col && h.end <= end)) {
        if (h.start > at) segs.push({ text: s.text.slice(at - col, h.start - col), cls: cls(s) });
        segs.push({ text: s.text.slice(h.start - col, h.end - col), cls: cls(s), hot: { seq: h.seq, run: h.run, where: h.where } });
        at = h.end;
      }
      if (at < end) segs.push({ text: s.text.slice(at - col), cls: cls(s) });
      col = end;
    }
    return groups[i] === undefined ? { segs } : { segs, finding: groups[i] };
  });
}

/** Lines of the `findings ┈┈` block: a finding starts at its level glyph (● ◆ ?) and runs until the next one. */
function findingGroups(plain: string[]): Record<number, number> {
  const out: Record<number, number> = {};
  let inBlock = false, n = -1;
  plain.forEach((t, i) => {
    if (/^ {2}findings ┈/.test(t)) { inBlock = true; return; }
    if (!inBlock) return;
    if (t.trim() === '') { inBlock = n < 0; return; } // a wrapped legend can precede the first finding
    if (/^ {2}[●◆?] /.test(t)) n++;
    if (n >= 0) out[i] = n;
  });
  return out;
}
