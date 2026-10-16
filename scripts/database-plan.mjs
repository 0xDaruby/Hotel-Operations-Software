// Read-only migration inventory; optional export never connects to a database.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = resolve(import.meta.dirname, '..');
// Git's Windows checkout may use CRLF; hash canonical UTF-8 SQL text across hosts.
const hash = value => createHash('sha256').update(value.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');

export async function buildPlan(root = repository) {
  const names = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort();
  const steps = [{ id: 'foundation', file: 'supabase/bootstrap/foundation.sql' }];
  const versions = new Set();
  for (const name of names) {
    const version = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name)?.[1];
    if (!version) throw new Error(`Unrecognized migration name: ${name}`);
    if (versions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    versions.add(version);
    const historicalFile = `supabase/migrations/${name}`;
    steps.push(version === '0004'
      ? { id: version, file: 'supabase/bootstrap/repair-scheduler.sql', historicalFile }
      : { id: version, file: historicalFile });
  }
  for (const step of steps) {
    step.sha256 = hash(await readFile(resolve(root, step.file)));
    if (step.historicalFile) step.historicalSha256 = hash(await readFile(resolve(root, step.historicalFile)));
  }
  return { format: 1, hashEncoding: 'utf8-lf', purpose: 'clean-disposable-supabase-only', steps };
}

export function verifyPlan(saved, current) {
  if (JSON.stringify(saved) !== JSON.stringify(current)) {
    throw new Error('Migration plan changed. Review added/removed files and SQL hashes before updating the manifest.');
  }
  return true;
}

export async function writeBootstrap(root, plan, output) {
  // Recheck immediately before export so a stale reviewed plan cannot be exported.
  verifyPlan(plan, await buildPlan(root));
  const chunks = ['-- CLEAN DISPOSABLE SUPABASE PROJECT ONLY. Never apply to an existing hotel database.',
    '-- Requires Supabase Auth roles/schema and pg_cron support. Historical 0004 is replaced.'];
  for (const step of plan.steps) chunks.push(`\n-- ${step.id}: ${step.file}; sha256=${step.sha256}\n${await readFile(resolve(root, step.file), 'utf8')}`);
  // Exclusive create protects both existing output and SQL source files from overwrite.
  await writeFile(output, `${chunks.join('\n')}\n`, { flag: 'wx' });
}

async function main(args) {
  const plan = await buildPlan();
  if (!args.length) return console.log(JSON.stringify(plan, null, 2));
  if (args[0] === '--check' && args.length === 1) {
    verifyPlan(JSON.parse(await readFile(resolve(repository, 'supabase/bootstrap/migration-manifest.json'), 'utf8')), plan);
    return console.log(`PASS migration manifest (${plan.steps.length} steps; no database connection)`);
  }
  if (args[0] === '--write-bootstrap' && args.length === 2) {
    verifyPlan(JSON.parse(await readFile(resolve(repository, 'supabase/bootstrap/migration-manifest.json'), 'utf8')), plan);
    await writeBootstrap(repository, plan, resolve(args[1]));
    return console.log('Clean-project SQL bundle created. No database was contacted or changed.');
  }
  throw new Error('Usage: node scripts/database-plan.mjs [--check | --write-bootstrap NEW_FILE]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
