#!/usr/bin/env node
import {
  runControlPlaneMigrations,
  runTenantMigrationFleet,
  closeDb,
} from '../index.js';

try {
  await runControlPlaneMigrations();
  const results = await runTenantMigrationFleet({
    statuses: ['active'],
    continueOnError: process.env.MIGRATION_CONTINUE_ON_ERROR === 'true',
  });
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ migrated: results.length - failed.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally {
  await closeDb();
}
