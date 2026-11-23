// Test helper: the committed capture artifacts, read from disk (no Rewind or Python needed).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DIR = 'src/data/capture';
export const read = (p: string) => readFileSync(join(DIR, p), 'utf8');
export const json = (p: string) => JSON.parse(read(p));
export const list = (sub: string) => readdirSync(join(DIR, sub)).map((f) => `${sub}/${f}`);

export const manifest = json('manifest.json');
export const labels = Object.keys(manifest.runs) as string[];
export const runs: Record<string, any> = Object.fromEntries(labels.map((l) => [l, json(`runs/${l}.json`)]));

/** Every terminal capture: view name, width, ANSI text and its plain twin. */
export const captures = Object.entries(manifest.views as Record<string, { command: string; runs: string[] }>).flatMap(
  ([view, v]) =>
    (manifest.widths as number[]).map((w) => ({
      view, width: w, runs: v.runs, command: v.command,
      ansi: read(`terminal/${view}.${w}.ansi`), txt: read(`terminal/${view}.${w}.txt`),
    })),
);

/** Seqs of one run's exported events. */
export const seqsOf = (label: string) => new Set<number>(runs[label].events.map((e: any) => e.seq));
