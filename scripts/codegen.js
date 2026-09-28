#!/usr/bin/env node
/**
 * Regenerates src/generated/* from schema/scene-render-1.1.xsd.
 * The drift test in test/xsd-emit.test.js fails whenever they diverge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { compileSchema } from '../src/xsd/compile.js';
import { emitModelModule, emitTypes } from '../src/xsd/emit.js';

const SCHEMA = 'schema/scene-render-1.1.xsd';
const root = new URL('../', import.meta.url);
const model = compileSchema(readFileSync(new URL(SCHEMA, root), 'utf8'));
writeFileSync(new URL('src/generated/model.js', root), emitModelModule(model, SCHEMA));
writeFileSync(new URL('src/generated/types.d.ts', root), emitTypes(model));
process.stdout.write(`generated ${Object.keys(model.complexTypes).length} complex and `
  + `${Object.keys(model.simpleTypes).length} simple types\n`);
