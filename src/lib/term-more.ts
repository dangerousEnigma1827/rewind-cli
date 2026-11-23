// Terminal "more lines" affordance (plan §5.5): long output is never silently clipped. Shared by the static
// terminals' script and the island. Returns a cleanup function.

/** Keeps `note` saying how many lines of the visible capture variant lie below the fold, or hides it. */
export function watchMore(body: HTMLElement, note: HTMLElement): () => void {
  const update = () => {
    const pre = [...body.querySelectorAll<HTMLElement>('pre')].find((p) => p.offsetParent !== null);
    if (!pre) return void (note.hidden = true);
    const line = parseFloat(getComputedStyle(pre).lineHeight) || 18;
    const below = Math.round((pre.scrollHeight - pre.clientHeight - pre.scrollTop) / line);
    note.hidden = below < 1;
    if (below >= 1) note.textContent = `↓ ${below} more line${below === 1 ? '' : 's'} — scroll the output`;
  };
  const pres = [...body.querySelectorAll<HTMLElement>('pre')];
  pres.forEach((p) => p.addEventListener('scroll', update, { passive: true }));
  const ro = new ResizeObserver(update);
  ro.observe(body);
  update();
  return () => { pres.forEach((p) => p.removeEventListener('scroll', update)); ro.disconnect(); };
}
