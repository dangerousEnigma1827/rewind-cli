// `npm run ink`: writes the ink steps (coloured *text*, ≥ 4.5:1 on the page and terminal surfaces) into
// src/styles/tokens.css between the ink markers. tests/ink.test.ts fails if the file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { inkBlocks } from '../src/lib/ink.ts';

const file = 'src/styles/tokens.css';
const css = readFileSync(file, 'utf8');
const next = inkBlocks(css);
writeFileSync(file, next);
console.log(next === css ? 'ink: tokens.css already current' : 'ink: tokens.css updated');
