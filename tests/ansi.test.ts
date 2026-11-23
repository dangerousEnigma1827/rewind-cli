import { describe, expect, it } from 'vitest';
import { parseAnsi, plainText } from '../src/lib/ansi';
import { captures } from './capture';

describe('parseAnsi', () => {
  it('maps truecolor to palette tokens and tracks bold/italic', () => {
    const [line] = parseAnsi('\x1b[1;38;2;127;90;240m◂◂\x1b[0m why \x1b[3;38;2;126;126;140m? x\x1b[0m');
    expect(line).toEqual([
      { text: '◂◂', token: 'uv', bold: true, italic: false, dim: false },
      { text: ' why ', token: null, bold: false, italic: false, dim: false },
      { text: '? x', token: 'mute', bold: false, italic: true, dim: false },
    ]);
  });

  it('keeps styles across newlines and splits lines', () => {
    const lines = parseAnsi('\x1b[38;2;229;72;77ma\nb\x1b[0m\nc');
    expect(lines.map((l) => l.map((s) => [s.text, s.token]))).toEqual([[['a', 'err']], [['b', 'err']], [['c', null]]]);
  });

  it('drops non-SGR CSI (cursor hide/show) without output', () => {
    expect(plainText(parseAnsi('\x1b[?25l\x1b[?25h  ok'))).toBe('  ok');
  });

  it('refuses colours outside render.PALETTE', () => {
    expect(() => parseAnsi('\x1b[38;2;1;2;3mx')).toThrow(/not in render.PALETTE/);
  });
});

describe('(a) the parser is lossless on every capture', () => {
  it.each(captures.map((c) => [`${c.view}.${c.width}`, c] as const))('%s', (_, c) => {
    expect(plainText(parseAnsi(c.ansi))).toBe(c.txt);
  });
});
