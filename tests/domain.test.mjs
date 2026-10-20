import test from 'node:test';
import { cases } from './domain-cases.mjs';
for (const [name, run] of cases) test(name, run);
