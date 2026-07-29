#!/usr/bin/env node
/**
 * Apply control-plane migrations.
 * Usage: node src/scripts/migrate-control.js
 */
import { runControlPlaneMigrations, closeDb } from '../migrations/index.js';

const result = await runControlPlaneMigrations();
console.log(JSON.stringify({ ok: true, ...result }));
await closeDb();
