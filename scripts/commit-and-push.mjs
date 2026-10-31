import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Explicit file groups only. No force pushes, history rewriting, or empty filler commits.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const execute = process.argv.includes('--execute');
  if (process.argv.slice(2).some(arg => arg !== '--execute')) throw new Error('Use no arguments to preview, or --execute to commit and push.');
  const plan = JSON.parse(await readFile('scripts/commit-plan.json', 'utf8'));
  const staged = git('diff', '--cached', '--name-only').trim();
  if (staged) throw new Error('Existing staged changes detected. Unstage them before applying this grouping plan.');
  const changed = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean).map(record => {
    if (/[RC]/.test(record.slice(0, 2))) throw new Error('Review renames/copies before using this grouping plan.');
    return record.slice(3);
  });
  const matches = (file, prefix) => file === prefix || file.startsWith(prefix + '/');
  for (const file of changed) {
    const owners = plan.filter(group => group.paths.some(prefix => matches(file, prefix)));
    if (owners.length !== 1) throw new Error(`Expected exactly one commit group for ${file}; update the plan before continuing.`);
  }
  const groups = plan.map(group => ({ ...group, files: changed.filter(file => group.paths.some(prefix => matches(file, prefix))) })).filter(group => group.files.length);
  for (const [index, group] of groups.entries()) console.log(`${String(index + 1).padStart(2, '0')}. ${group.message} (${group.files.length} files)`);
  console.log(`${groups.length} nonempty groups; ${changed.length} changed files. Ignored local files are excluded.`);
  if (!execute) { console.log('Preview only. Run node scripts/commit-and-push.mjs --execute to create these commits and push the branch.'); process.exit(0); }
  if (git('remote', 'get-url', 'origin').trim() !== 'https://github.com/mhamzanadeem/Huefolio.git') throw new Error('Unexpected origin. Review the target repository before pushing.');
  execFileSync(process.execPath, ['scripts/release-check.mjs'], { stdio: 'inherit' });
  const current = git('branch', '--show-current').trim();
  if (!current) throw new Error('Detached HEAD: switch to the intended branch first.');
  if (current !== 'main') throw new Error('Switch to main first. This helper only commits and pushes main; it never creates another branch.');
  for (const group of groups) {
    git('add', '--', ...group.files);
    git('commit', '-m', group.message);
    console.log(`Committed: ${group.message}`);
  }
  console.log('Local grouping complete. Pushing without force. If the network fails, keep the local commits and rerun on this branch.');
  process.stdout.write(git('push', '-u', 'origin', 'HEAD:refs/heads/main'));
  console.log('Pushed main directly.');
} catch (error) {
  // Git diagnostics contain paths/refs only; do not dump arbitrary child-process output.
  console.error(error.stderr ? String(error.stderr).trim() : error.message);
  process.exitCode = 1;
}
