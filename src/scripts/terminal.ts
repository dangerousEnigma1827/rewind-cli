// The one script for static terminals: Copy (shown only when the clipboard exists) and the "more lines" count.
import { watchMore } from '../lib/term-more';

const live = Object.assign(document.createElement('div'), { className: 'visually-hidden' });
live.setAttribute('aria-live', 'polite');
document.body.append(live);

for (const b of document.querySelectorAll<HTMLButtonElement>('.term button[data-copy]')) {
  if (!navigator.clipboard) continue;
  b.hidden = false;
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy!);
      b.textContent = live.textContent = 'Copied';
    } catch {
      b.textContent = live.textContent = 'Copy failed';
    }
    setTimeout(() => (b.textContent = 'Copy'), 1500);
  });
}
for (const t of document.querySelectorAll<HTMLElement>('.term[data-static]')) {
  const body = t.querySelector<HTMLElement>('.term-body'), note = t.querySelector<HTMLElement>('.term-more');
  if (body && note) watchMore(body, note);
}
