import test from 'node:test';
import { cases } from './http-cases.mjs';
for (const [name, run] of cases) test(name, run);
