// THE ONLY ISLAND (plan §6.2): the 8-step investigation. Every value shown comes from the props, which are
// built from the capture artifacts by lib/investigation.ts.
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { renderSpans, type TermLine } from '../lib/terminal';
import { describeEvent, fmtMs, type EventInfo, type Label, type RunModel, type Step, type StepView, type TermBlock } from '../lib/investigation';
import type { diffView } from '../lib/diffview';

type Diff = ReturnType<typeof diffView>;
interface Order { id: string; items: string[]; coupon: string | null; expected: number }
interface Charge { amount: number | null; seq: number | null; request: number | null; crash: boolean }
export interface Props {
  steps: Step[]; runs: Record<Label, RunModel>; diff: Diff; patch: string;
  orders: Order[]; charged: Record<'bad' | 'fixed', Record<string, Charge>>;
}

// ---- state (§6.3) --------------------------------------------------------------------------------------

interface Ref { run: Label; seq: number }
interface State { step: number; pinned: Ref | null; hover: Ref | null; finding: Ref[] | null; request: number | null; watch: 'on' | 'off'; diffTab: 'aligned' | 'terminal' }
type Action =
  | { type: 'step'; step: number } | { type: 'pin'; ref: Ref | null } | { type: 'hover'; ref: Ref | null }
  | { type: 'finding'; refs: Ref[] | null } | { type: 'request'; request: number | null }
  | { type: 'watch'; watch: 'on' | 'off' } | { type: 'diffTab'; tab: 'aligned' | 'terminal' } | { type: 'restore'; state: State };

const defaults: State = { step: 1, pinned: null, hover: null, finding: null, request: null, watch: 'on', diffTab: 'aligned' };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'restore': return a.state;
    case 'step': return { ...s, step: a.step, pinned: null, hover: null, finding: null, request: null };
    case 'pin': return { ...s, pinned: a.ref && s.pinned && same(s.pinned, a.ref) ? null : a.ref };
    case 'hover': return { ...s, hover: a.ref };
    case 'finding': return { ...s, finding: a.refs };
    case 'request': return { ...s, request: s.request === a.request ? null : a.request };
    case 'watch': return { ...s, watch: a.watch, pinned: null, hover: null, finding: null };
    case 'diffTab': return { ...s, diffTab: a.tab };
  }
}
const same = (a: Ref | null, b: Ref | null) => !!a && !!b && a.run === b.run && a.seq === b.seq;
const key = (r: Ref) => `${r.run}:${r.seq}`;

// URL: ?step=4&seq=371&request=3&watch=off#investigate. A seq of another run than the step's is `good:159`.
function fromUrl(steps: Step[]): State {
  const s: State = { ...defaults };
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('step'));
  if (n >= 1 && n <= steps.length) s.step = n;
  if (q.get('watch') === 'off') s.watch = 'off';
  const r = Number(q.get('request'));
  if (r >= 1) s.request = r;
  const seq = /^(?:(bad|nowatch|good|fixed):)?(\d+)$/.exec(q.get('seq') ?? '');
  const run = viewOf(steps[s.step - 1], s.watch).run;
  if (seq && (seq[1] || run)) s.pinned = { run: (seq[1] ?? run) as Label, seq: Number(seq[2]) };
  return s;
}
const viewOf = (step: Step, watch: 'on' | 'off'): StepView => (watch === 'off' && step.views.off) || step.views.on;

// ---- island --------------------------------------------------------------------------------------------

export default function Investigation(p: Props) {
  // Hydrate with the server's default state, then restore the URL's: Preact's hydration does not patch
  // attributes that differ from the server markup, so restoring must be a real re-render.
  const [s, raw] = useReducer(reducer, null, () => defaults);
  useEffect(() => { raw({ type: 'restore', state: fromUrl(p.steps) }); }, []);
  // The URL changes only after the visitor acts here, so a plain visit to the page keeps its address.
  const touched = useRef(false);
  const dispatch = (a: Action) => { if (a.type !== 'hover' && a.type !== 'finding') touched.current = true; raw(a); };
  const step = p.steps[s.step - 1];
  const view = viewOf(step, s.watch);
  const run = view.run ? p.runs[view.run] : null;
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);

  // focus = pinned ?? hover ?? stepDefault; highlighted = focus ∪ evidence(hovered finding)
  const focus: Ref | null = s.pinned ?? s.hover ?? (view.focus.seq && view.run ? { run: view.run, seq: view.focus.seq } : null);
  const highlighted = new Set([...(focus ? [key(focus)] : []), ...(s.finding ?? []).map(key)]);
  const lanes = s.request ? [s.request] : view.focus.lanes;
  const event = focus ? p.runs[focus.run]?.events[focus.seq] ?? null : null;

  useEffect(() => {
    if (!touched.current) return;
    const q = new URLSearchParams();
    q.set('step', String(s.step));
    if (s.pinned) q.set('seq', s.pinned.run === view.run ? String(s.pinned.seq) : key(s.pinned));
    if (s.request) q.set('request', String(s.request));
    if (step.views.off) q.set('watch', s.watch);
    if (location.search !== `?${q}`) history.replaceState(history.state, '', `?${q}#investigate`);
  }, [s.step, s.pinned, s.request, s.watch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && s.pinned) dispatch({ type: 'pin', ref: null }); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [s.pinned]);

  /** Pin from a marker: bring its terminal row into view inside the pane, not the page. */
  const pinFromVisual = (ref: Ref) => {
    dispatch({ type: 'pin', ref });
    requestAnimationFrame(() => {
      const el = [...(pane.current?.querySelectorAll<HTMLElement>(`[data-ref="${key(ref)}"]`) ?? [])].find((x) => x.offsetParent);
      const box = el?.closest<HTMLElement>('pre');
      if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2, left: Math.max(0, el.offsetLeft - 24) });
    });
  };
  // Phone layout (< 640px of the island's own width, §5.5): a different design, not a smaller one.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 640));
    ro.observe(root.current!);
    return () => ro.disconnect();
  }, []);
  const act = { dispatch, pinFromVisual, highlighted, pinned: s.pinned, narrow };
  // Focus must never sit under the sticky step bar (browsers don't scroll for an element already "in view").
  useEffect(() => {
    if (!narrow) return;
    const el = root.current!;
    const onFocus = (e: FocusEvent) => {
      const bar = el.querySelector('.step-nav.bar'), t = e.target as HTMLElement;
      if (!bar || bar.contains(t)) return;
      requestAnimationFrame(() => { // after the browser's own scroll-into-view
        const over = t.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8;
        if (over > 0) window.scrollBy(0, over);
      });
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, [narrow]);

  // The inspector's request: chosen, else the step's default (why → #3, why --seq → #2), else the failing one.
  const selected = s.request ?? view.focus.lanes?.[0] ?? run?.ticks.find((t) => t.kind === 'error')?.request ?? run?.lanes[0]?.id ?? null;
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setNotice('');
    if (!narrow || !run || !s.pinned || s.pinned.run !== run.label || !selected) return;
    const ev = run.events[s.pinned.seq];
    if (ev?.request && !requestRows(run, selected).some((r) => r.seq === ev.seq)) {
      dispatch({ type: 'request', request: ev.request });
      setNotice(`Switched to request #${ev.request}: seq ${ev.seq} belongs to it.`);
    }
  }, [s.pinned, narrow]);
  const go = (n: number) => dispatch({ type: 'step', step: n });

  return (
    <div class={`inv${narrow ? ' narrow' : ''}`} ref={root}>
      <Stepper steps={p.steps} step={s.step} go={go} narrow={narrow} />
      <div class="inv-panel" role="tabpanel" id="inv-panel" aria-labelledby={`inv-tab-${s.step}`} key={s.step}>
        <div class="inv-head">
          <h3>{step.title}</h3>
          <p>{step.sentence}</p>
          {step.views.off && (
            <button type="button" class="watch" aria-pressed={s.watch === 'on'} onClick={() => dispatch({ type: 'watch', watch: s.watch === 'on' ? 'off' : 'on' })}>
              <span class="mono" translate="no">--watch currentCart</span> <span class="watch-state">{s.watch === 'on' ? 'on' : 'off'}</span>
            </button>
          )}
        </div>
        <div class="inv-stage">
          <div class="inv-visual">
            {view.mode === 'none' && <p class="inv-empty">Plain Node keeps no record: there is nothing to visualise until the run is recorded.</p>}
            {view.mode === 'lanes' && run && (narrow
              ? <Inspector run={run} selected={selected} act={act} notice={notice} />
              : <Swimlanes run={run} lanes={lanes} focus={focus} act={act} request={s.request} />)}
            {view.mode === 'diff' && <DiffView diff={p.diff} tab={s.diffTab} term={view.terminals[1]} runs={p.runs} act={act} />}
            {view.mode === 'fix' && <FixView patch={p.patch} orders={p.orders} charged={p.charged} runs={p.runs} />}
          </div>
          {view.mode !== 'none' && view.mode !== 'fix' && <EventDetail event={event} run={focus ? p.runs[focus.run] : run} pinned={!!s.pinned} side />}
        </div>
        <div class="inv-pane" ref={pane}>
          {view.terminals.filter((t) => !(view.mode === 'diff' && t.diff)).map((t) => (
            <TerminalBlock block={t} runs={p.runs} act={act} key={t.view}
              detail={s.pinned && event ? <EventDetail event={event} run={p.runs[s.pinned.run]} pinned /> : null} />
          ))}
        </div>
      </div>
      {narrow && <StepNav steps={p.steps} step={s.step} go={go} bar />}
      <div class="visually-hidden" aria-live="polite">{s.pinned && event ? `Pinned: ${describeEvent(event)}` : ''}</div>
    </div>
  );
}

type Act = { dispatch: (a: Action) => void; pinFromVisual: (r: Ref) => void; highlighted: Set<string>; pinned: Ref | null; narrow: boolean };

// ---- stepper (tablist) ---------------------------------------------------------------------------------

function Stepper({ steps, step, go, narrow }: { steps: Step[]; step: number; go: (n: number) => void; narrow: boolean }) {
  const tabs = useRef<HTMLDivElement>(null);
  const move = (n: number) => {
    go(n);
    requestAnimationFrame(() => document.getElementById(`inv-tab-${n}`)?.focus());
  };
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowRight: step + 1, ArrowLeft: step - 1, Home: 1, End: steps.length }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    move(Math.min(steps.length, Math.max(1, to)));
  };
  return (
    <div class="stepper">
      <div class="steps" role="tablist" aria-label="Investigation steps" ref={tabs} onKeyDown={onKey}>
        {steps.map((x) => (
          <button type="button" role="tab" id={`inv-tab-${x.n}`} aria-selected={x.n === step} aria-controls="inv-panel"
            tabIndex={x.n === step ? 0 : -1} onClick={() => go(x.n)} key={x.n}>
            <span class="num">{x.n}</span> <span class="lbl">{x.title}</span>
          </button>
        ))}
      </div>
      {!narrow && <StepNav steps={steps} step={step} go={go} />}
    </div>
  );
}

/** Prev/Next. On phones it is the bottom step bar, sticky within the section (§5.5). */
function StepNav({ steps, step, go, bar }: { steps: Step[]; step: number; go: (n: number) => void; bar?: boolean }) {
  const to = (n: number) => { go(n); if (bar) document.getElementById('inv-panel')?.scrollIntoView({ block: 'start' }); };
  return (
    <div class={`step-nav${bar ? ' bar' : ''}`}>
      <button type="button" onClick={() => to(step - 1)} disabled={step === 1}>← Prev</button>
      <span class="step-of">Step {step} of {steps.length} · {steps[step - 1].key}</span>
      <button type="button" onClick={() => to(step + 1)} disabled={step === steps.length}>Next →</button>
    </div>
  );
}

// ---- terminal pane ---------------------------------------------------------------------------------------

function TerminalBlock({ block, runs, act, detail }: { block: TermBlock; runs: Record<Label, RunModel>; act: Act; detail: ComponentChildren }) {
  const variants = useMemo(() => Object.entries(block.ansi).map(([w, a]) => [Number(w), renderSpans(a, { diff: block.diff })] as const)
    .sort((a, b) => b[0] - a[0]), [block]);
  const [copied, setCopied] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(block.command); setCopied('Copied'); } catch { setCopied('Copy failed'); }
    setTimeout(() => setCopied(''), 1500);
  };
  return (
    <figure class="term" aria-label={`Output of ${block.command}`}>
      <div class="term-cmd">
        <span class="prompt" aria-hidden="true">$</span>
        <code translate="no">{block.command}</code>
        <button class="copy" type="button" onClick={copy}>{copied || 'Copy'}</button>
        <span class="visually-hidden" aria-live="polite">{copied}</span>
      </div>
      {variants.map(([w, lines]) => <TermLines key={w} w={w} lines={lines} block={block} runs={runs} act={act} />)}
      {detail && act.pinned && block.runs.includes(act.pinned.run) && variants[0][1].some((l) => l.segs.some((x) => x.hot?.seq === act.pinned!.seq))
        && <div class="detail-inline">{detail}</div>}
    </figure>
  );
}

function TermLines({ w, lines, block, runs, act }: { w: number; lines: TermLine[]; block: TermBlock; runs: Record<Label, RunModel>; act: Act }) {
  const refOf = (run: 0 | 1, seq: number): Ref => ({ run: block.runs[run] as Label, seq });
  const label = (ref: Ref) => {
    const ev = runs[ref.run]?.events[ref.seq];
    return ev ? `${block.runs.length > 1 ? `run ${ref.run}, ` : ''}${describeEvent(ev)}` : `seq ${ref.seq}`;
  };
  // a finding's refs: every hotspot on its lines
  const byFinding = new Map<number, Ref[]>();
  lines.forEach((l) => l.finding !== undefined && byFinding.set(l.finding, [...(byFinding.get(l.finding) ?? []),
    ...l.segs.filter((x) => x.hot).map((x) => refOf(x.hot!.run, x.hot!.seq))]));
  return (
    <pre class={`w${w}`} translate="no" tabIndex={-1}>
      {lines.map((l, i) => (
        <span class={`tl${l.finding !== undefined ? ' fd' : ''}`} key={i}
          onMouseEnter={l.finding !== undefined ? () => act.dispatch({ type: 'finding', refs: byFinding.get(l.finding!)! }) : undefined}
          onMouseLeave={l.finding !== undefined ? () => act.dispatch({ type: 'finding', refs: null }) : undefined}>
          {l.segs.map((x, j) => {
            if (!x.hot || !block.runs.length) return x.cls ? <span class={x.cls} key={j}>{x.text}</span> : x.text;
            const ref = refOf(x.hot.run, x.hot.seq);
            const cls = `seq ${x.cls}${act.highlighted.has(key(ref)) ? ' hl' : ''}${same(ref, act.pinned) ? ' pin' : ''}`;
            // phones: the seq stays marked in the text; its touch target is the chip row under the line
            if (act.narrow) return <span class={cls} key={j}>{x.text}</span>;
            return <SeqButton key={j} cls={cls} r={ref} text={x.text} label={label(ref)} act={act} />;
          })}
          {'\n'}
          {act.narrow && block.runs.length > 0 && l.segs.some((x) => x.hot) && (
            <span class="chips">{l.segs.filter((x) => x.hot).map((x, j) => {
              const ref = refOf(x.hot!.run, x.hot!.seq);
              return <SeqButton key={j} cls={`chip${act.highlighted.has(key(ref)) ? ' hl' : ''}${same(ref, act.pinned) ? ' pin' : ''}`}
                r={ref} text={`${block.runs.length > 1 ? (x.hot!.run ? 'B ' : 'A ') : ''}seq ${ref.seq}`} label={label(ref)} act={act} />;
            })}</span>
          )}
        </span>
      ))}
    </pre>
  );
}

function SeqButton({ cls, r, text, label, act }: { cls: string; r: Ref; text: string; label: string; act: Act }) {
  return (
    <button type="button" class={cls} data-ref={key(r)} aria-pressed={same(r, act.pinned)} aria-label={label}
      onMouseEnter={() => act.dispatch({ type: 'hover', ref: r })} onMouseLeave={() => act.dispatch({ type: 'hover', ref: null })}
      onFocus={() => act.dispatch({ type: 'hover', ref: r })} onBlur={() => act.dispatch({ type: 'hover', ref: null })}
      onClick={() => act.dispatch({ type: 'pin', ref: r })}>{text}</button>
  );
}

// ---- phone: request inspector (§5.5) ---------------------------------------------------------------------

interface Row { seq: number; foreign: boolean }
/** A request's events, plus other requests' writes to the watched variable while it was in flight, in seq order
 *  (Rewind's own "story of request #N + other requests' writes"). */
function requestRows(run: RunModel, id: number): Row[] {
  const lane = run.lanes.find((l) => l.id === id);
  if (!lane) return [];
  const own = lane.markers.map((m) => ({ seq: m.seq, foreign: false }));
  const first = lane.markers[0]?.seq ?? 0, last = lane.markers[lane.markers.length - 1]?.seq ?? 0;
  const foreign = run.holders.filter((h) => h.writer !== id && h.seq > first && h.seq < last).map((h) => ({ seq: h.seq, foreign: true }));
  return [...own, ...foreign].sort((a, b) => a.seq - b.seq);
}

function Inspector({ run, selected, act, notice }: { run: RunModel; selected: number | null; act: Act; notice: string }) {
  const ref = (seq: number): Ref => ({ run: run.label, seq });
  const lo = run.startMs, hi = run.endMs, x = (m: number) => ((m - lo) / (hi - lo || 1)) * 100;
  const rows = selected ? requestRows(run, selected) : [];
  const band = [...run.holders.map((h) => ({ seq: h.seq, holder: h })), ...run.ticks.map((t) => ({ seq: t.seq, tick: t }))].sort((a, b) => a.seq - b.seq);
  const row = (seq: number, body: ComponentChildren, extra = '') => {
    const r = ref(seq), open = same(r, act.pinned);
    return (
      <li key={seq} class={`irow${extra}${act.highlighted.has(key(r)) ? ' hl' : ''}`}>
        <button type="button" aria-expanded={open} data-ref={key(r)} aria-label={describeEvent(run.events[seq])}
          onClick={() => act.dispatch({ type: 'pin', ref: r })}>{body}</button>
        {open && <EventDetail event={run.events[seq]} run={run} pinned />}
      </li>
    );
  };
  return (
    <figure class="inspector" aria-label={`Requests of run ${run.id} (${run.label})`}>
      <div class="overview" role="group" aria-label="Choose a request">
        {run.lanes.map((l) => (
          <button type="button" class={`orow r${l.id}`} aria-pressed={selected === l.id} key={l.id}
            onClick={() => selected !== l.id && act.dispatch({ type: 'request', request: l.id })}>
            <span class="olabel" translate="no"><span class="swatch" aria-hidden="true" /> #{l.id} {l.name}</span>
            <span class="otrack" aria-hidden="true">
              <span class="span" style={{ left: `${x(l.inMs)}%`, width: `${Math.max(1, x(l.endMs) - x(l.inMs))}%` }} />
              {l.markers.filter((m) => m.kind === 'mutation' || m.kind.startsWith('error.')).map((m) => (
                <span class={`omk k-${m.kind.replace('.', '-')}`} style={{ left: `${x(m.ms)}%` }} key={m.seq}>{m.glyph}</span>
              ))}
            </span>
          </button>
        ))}
      </div>
      {notice && <p class="notice" role="status">{notice}</p>}
      {selected && (
        <>
          <h4 class="ihead">Request #{selected} <span class="mono">{run.lanes.find((l) => l.id === selected)?.name}</span></h4>
          <ol class="ilist">
            {rows.map((r) => {
              const e = run.events[r.seq];
              return row(r.seq, <>
                <span class="num iseq">{e.seq}</span><span class="num ims">{fmtMs(e.ms)}</span>
                <span class={`ig k-${e.kind.replace('.', '-')}`} aria-hidden="true">{e.glyph}</span>
                <span class="itext" translate="no">{e.text}</span>
                {r.foreign && <span class="foreign">foreign · #{e.request}</span>}
              </>, r.foreign ? ' is-foreign' : '');
            })}
          </ol>
        </>
      )}
      {run.watch.length > 0 ? (
        <>
          <h4 class="ihead"><span class="mono" translate="no">{run.watch[0]}</span> holders</h4>
          {band.length === 0 && <p class="band-none-p">no writes recorded</p>}
          <ol class="ilist">
            {band.map((b) => b.holder
              ? row(b.seq, <><span class={`swatch w${b.holder.writer}`} aria-hidden="true" /><span class="itext"><b translate="no">{b.holder.owner}</b> written by #{b.holder.writer}</span><span class="num iseq">seq {b.seq}</span></>)
              : row(b.seq, <><span class="ig used-g" aria-hidden="true">┆</span><span class="itext">used here: {b.tick!.kind} by #{b.tick!.request}</span><span class="num iseq">seq {b.seq}</span></>, ' is-used'))}
          </ol>
        </>
      ) : <p class="band-none-p">Writes not recorded: run without --watch.</p>}
      <figcaption class="prov">
        run <span translate="no">{run.id} ({run.label})</span> · ● events and times · ◆ request membership
        {run.holders.length > 0 && <> · ◆ holders (site, from ● writes) · ┆ log/crash time; reads are not recorded</>}
      </figcaption>
    </figure>
  );
}

// ---- run view: swimlanes + cart band ---------------------------------------------------------------------

function Swimlanes({ run, lanes, focus, act, request }: { run: RunModel; lanes: number[] | null; focus: Ref | null; act: Act; request: number | null }) {
  const pad = (run.endMs - run.startMs) * 0.04;
  const d0 = run.startMs - pad, d1 = run.endMs + pad;
  const x = (m: number) => ((m - d0) / (d1 - d0)) * 100;
  const step = d1 - d0 > 400 ? 100 : 50;
  const ticks = Array.from({ length: Math.floor(d1 / step) - Math.ceil(d0 / step) + 1 }, (_, i) => (Math.ceil(d0 / step) + i) * step);
  const focusEv = focus && focus.run === run.label ? run.events[focus.seq] : null;
  const ref = (seq: number): Ref => ({ run: run.label, seq });
  const mark = (seq: number) => `${act.highlighted.has(key(ref(seq))) ? ' hl' : ''}${same(ref(seq), act.pinned) ? ' pin' : ''}`;
  const hoverProps = (seq: number) => ({
    onMouseEnter: () => act.dispatch({ type: 'hover', ref: ref(seq) }), onMouseLeave: () => act.dispatch({ type: 'hover', ref: null }),
    onFocus: () => act.dispatch({ type: 'hover', ref: ref(seq) }), onBlur: () => act.dispatch({ type: 'hover', ref: null }),
    onClick: () => act.pinFromVisual(ref(seq)), 'aria-pressed': same(ref(seq), act.pinned),
  });
  return (
    <figure class="lanes" aria-label={`Requests of run ${run.id} (${run.label}) on a millisecond axis`}>
      <div class="lane-grid">
        {run.lanes.map((l) => {
          const rows = stagger(l.markers.map((m) => x(m.ms)));
          return (
            <div class={`lane r${l.id}${lanes && !lanes.includes(l.id) ? ' dim' : ''}`} key={l.id}>
              <button type="button" class="lane-label" aria-pressed={request === l.id} onClick={() => act.dispatch({ type: 'request', request: l.id })}>
                <span class="swatch" aria-hidden="true" /> <span translate="no">#{l.id} {l.name}</span>
              </button>
              <div class="track">
                <div class={`span end-${l.end}`} style={{ left: `${x(l.inMs)}%`, width: `${Math.max(0.3, x(l.endMs) - x(l.inMs))}%` }} />
                {l.markers.map((m, i) => (
                  <button type="button" class={`mk k-${m.kind.replace('.', '-')} row${rows[i]}${mark(m.seq)}`} key={m.seq}
                    style={{ left: `${x(m.ms)}%` }} aria-label={m.label} data-ref={key(ref(m.seq))} {...hoverProps(m.seq)}>
                    <span aria-hidden="true">{m.glyph}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div class="lane axis" aria-hidden="true">
          <span class="lane-label">ms</span>
          <div class="track">{ticks.map((t) => <span class="tick" style={{ left: `${x(t)}%` }} key={t}>{t}</span>)}</div>
        </div>
        {run.watch.length > 0 && (
          <div class="lane band">
            <span class="lane-label" translate="no">{run.watch[0]}</span>
            <div class="track">
              {run.holders.length === 0 && <span class="band-none">no writes recorded</span>}
              {run.holders.map((h) => (
                <button type="button" class={`seg w${h.writer}${mark(h.seq)}`} key={h.seq}
                  style={{ left: `${x(h.fromMs)}%`, width: `${x(h.toMs) - x(h.fromMs)}%` }}
                  aria-label={`${h.owner}'s cart, written by request #${h.writer} at seq ${h.seq}, ${fmtMs(h.fromMs)} ms`}
                  data-ref={key(ref(h.seq))} {...hoverProps(h.seq)}>
                  <span class="seg-label">{h.owner}</span>
                </button>
              ))}
              {run.ticks.map((t) => (
                <button type="button" class={`used ${t.kind}${mark(t.seq)}`} key={t.seq} style={{ left: `${x(t.ms)}%` }}
                  aria-label={`${describeEvent(run.events[t.seq])}. Used here: ${t.kind} time; reads are not recorded`}
                  data-ref={key(ref(t.seq))} {...hoverProps(t.seq)} />
              ))}
            </div>
          </div>
        )}
        {run.watch.length === 0 && (
          <div class="lane band">
            <span class="lane-label">writes</span>
            <div class="track"><span class="band-none">not recorded: run without --watch</span></div>
          </div>
        )}
        <div class="playhead-wrap" aria-hidden="true">
          <div class="playhead" style={{ transform: `translateX(${focusEv ? x(focusEv.ms) : -10}%)`, opacity: focusEv ? 1 : 0 }} />
        </div>
      </div>
      <figcaption class="prov">
        run <span translate="no">{run.id} ({run.label})</span> · ● events and times · ◆ lane membership
        {run.holders.length > 0 && <> · ◆ cart holders (site, from ● writes) · ┆ log/crash time; reads are not recorded</>}
      </figcaption>
    </figure>
  );
}

/** Two marker rows per lane: a marker that would touch the previous one in its row takes the other row. */
function stagger(xs: number[], gap = 2.2): number[] {
  const last = [-Infinity, -Infinity];
  return xs.map((v) => {
    const row = v - last[0] >= gap ? 0 : v - last[1] >= gap ? 1 : last[0] <= last[1] ? 0 : 1;
    last[row] = v;
    return row;
  });
}

// ---- event detail ----------------------------------------------------------------------------------------

function EventDetail({ event, run, pinned, side }: { event: EventInfo | null; run: RunModel | null; pinned: boolean; side?: boolean }) {
  if (!event) return side ? <aside class="detail side"><p class="hint">Hover, focus or click a seq or a marker to see the recorded event. Esc unpins.</p></aside> : null;
  return (
    <aside class={`detail${side ? ' side' : ''}`} aria-label={`Event seq ${event.seq}`}>
      <p class="detail-head"><span class="mono">{event.glyph}</span> seq <span class="num">{event.seq}</span> {pinned && <span class="pinned">pinned</span>}</p>
      <dl>
        <dt>● kind</dt><dd class="mono">{event.kind}</dd>
        <dt>● time</dt><dd class="num">{fmtMs(event.ms)} ms</dd>
        <dt>◆ request</dt><dd>{event.request ? `#${event.request}` : 'none (process)'}</dd>
        <dt>● event</dt><dd class="mono" translate="no">{event.text}</dd>
        {event.loc && <><dt>● location</dt><dd class="mono" translate="no">{event.loc}</dd></>}
        {event.before !== undefined && <><dt>● before</dt><dd class="mono val" translate="no">{event.before}</dd></>}
        {event.after !== undefined && <><dt>● after</dt><dd class="mono val" translate="no">{event.after}</dd></>}
      </dl>
      {run && <p class="prov">run <span translate="no">{run.id} ({run.label})</span> · ● recorded · ◆ derived</p>}
    </aside>
  );
}

// ---- step 7: DiffView ------------------------------------------------------------------------------------

function DiffView({ diff, tab, term, runs, act }: { diff: Diff; tab: 'aligned' | 'terminal'; term: TermBlock; runs: Record<Label, RunModel>; act: Act }) {
  const grid = useRef<HTMLDivElement>(null);
  const [ys, setYs] = useState<number[]>([]);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setYs([...el.querySelectorAll<HTMLElement>('.drow')].map((r) => r.offsetTop + r.offsetHeight / 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);
  const [A, B] = term.runs as Label[];
  const cell = (t: { token: string; seq: number } | null, run: Label, side: string) => {
    if (!t) return <><span class={`dseq ${side}`} /><span class={`dtok ${side}`} /></>;
    const ref = { run, seq: t.seq };
    return (
      <>
        <span class={`dseq ${side}`}>
          <button type="button" class={`seq${act.highlighted.has(key(ref)) ? ' hl' : ''}${same(ref, act.pinned) ? ' pin' : ''}`}
            aria-label={`run ${run}, ${describeEvent(runs[run].events[t.seq])}`} aria-pressed={same(ref, act.pinned)} data-ref={key(ref)}
            onMouseEnter={() => act.dispatch({ type: 'hover', ref })} onMouseLeave={() => act.dispatch({ type: 'hover', ref: null })}
            onFocus={() => act.dispatch({ type: 'hover', ref })} onBlur={() => act.dispatch({ type: 'hover', ref: null })}
            onClick={() => act.dispatch({ type: 'pin', ref })}>{t.seq}</button>
        </span>
        <span class={`dtok ${side}`} translate="no">{t.token}</span>
      </>
    );
  };
  return (
    <figure class="diffview" aria-label="Aligned steps of the good and bad runs">
      <div class="dtabs" role="tablist" aria-label="Diff view">
        {(['aligned', 'terminal'] as const).map((t) => (
          <button type="button" role="tab" aria-selected={tab === t} key={t} onClick={() => act.dispatch({ type: 'diffTab', tab: t })}>
            {t === 'aligned' ? 'Aligned steps' : 'Terminal view'}
          </button>
        ))}
      </div>
      {tab === 'terminal' ? <TerminalBlock block={term} runs={runs} act={act} detail={null} /> : act.narrow ? (
        <ol class="dlist">
          {diff.rows.flatMap((r, i) =>
            r.kind === 'collapsed' ? [<li class="dl-note" key={i}>····· {r.count} identical steps</li>]
            : r.kind === 'divergence' ? [<li class="dl-div" key={i}>▼ first divergence</li>]
            : r.kind === 'equal' ? [<li class="dl-row equal" key={i}><span class="dl-side">A·B</span>{cell(r.a, A, 'a')}</li>]
            : [r.a && <li class="dl-row a" key={`${i}a`}><span class="dl-side">A −</span>{cell(r.a, A, 'a')}</li>,
               r.b && <li class="dl-row b" key={`${i}b`}><span class="dl-side">B +</span>{cell(r.b, B, 'b')}</li>])}
        </ol>
      ) : (
        <div class="dgrid" ref={grid}>
          <div class="dhead"><span>A</span><span translate="no">{runs[A].id} ({A})</span><span /><span>B</span><span translate="no">{runs[B].id} ({B})</span></div>
          {diff.rows.map((r, i) => (
            r.kind === 'collapsed' ? <div class="drow collapsed" key={i}><span>····· {r.count} identical steps</span></div>
            : r.kind === 'divergence' ? <div class="drow divergence" key={i}><span>▼ first divergence</span></div>
            : <div class={`drow ${r.kind}`} key={i}>
                {cell(r.a, A, 'a')}<span class="gut" />{cell(r.b, B, 'b')}
              </div>
          ))}
          <svg class="connectors" aria-hidden="true">
            {ys.length > 0 && diff.connectors.map((c, i) => (
              <path key={i} d={`M 0 ${ys[c.from]} C 50 ${ys[c.from]}, 50 ${ys[c.to]}, 100 ${ys[c.to]}`} />
            ))}
          </svg>
        </div>
      )}
      <figcaption class="prov">◆ tokens and alignment: Rewind's diff (ids and times normalised away) · ◇ connectors join identical steps at different positions (explanatory)</figcaption>
    </figure>
  );
}

// ---- step 8: fix ----------------------------------------------------------------------------------------

function FixView({ patch, orders, charged, runs }: Pick<Props, 'patch' | 'orders' | 'charged' | 'runs'>) {
  const cell = (c: Charge, exp: number, label: 'bad' | 'fixed') =>
    c.crash ? <td class="t-err">✖ crashed <span class="seqref">seq {c.seq}</span></td>
    : <td class={c.amount === exp ? 't-ok' : 't-err'}>${c.amount} {c.amount === exp ? '✓' : '✗'} <span class="seqref">#{c.request} · seq {c.seq}</span>
        <span class="visually-hidden"> in run {runs[label].id}</span></td>;
  return (
    <div class="fixview">
      <figure class="patch">
        <pre translate="no">{patch.split('\n').filter((l) => !/^(diff|index) /.test(l)).map((l, i) => (
          <span key={i} class={l.startsWith('+') && !l.startsWith('+++') ? 't-ok' : l.startsWith('-') && !l.startsWith('---') ? 't-err' : l.startsWith('@@') ? 't-mute' : ''}>{l}{'\n'}</span>
        ))}</pre>
        <figcaption class="prov">demo/fix.patch, verbatim at the captured commit</figcaption>
      </figure>
      <figure>
        <table class="totals">
          <thead><tr><th scope="col">order</th><th scope="col">◇ expected</th><th scope="col">● concurrent run</th><th scope="col">● fixed run</th></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}><th scope="row" translate="no">{o.id}</th><td>${o.expected}</td>{cell(charged.bad[o.id], o.expected, 'bad')}{cell(charged.fixed[o.id], o.expected, 'fixed')}</tr>
          ))}</tbody>
        </table>
        <figcaption class="prov">◇ expected: prices.json summed, coupon applied as checkout.js does · ● charged: the runs' own log lines (runs {runs.bad.id}, {runs.fixed.id})</figcaption>
      </figure>
    </div>
  );
}
