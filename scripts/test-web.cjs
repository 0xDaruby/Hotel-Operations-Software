const { readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const web = join(root, 'apps', 'web');
function tests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? tests(path) : /\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
const files = tests(join(web, 'src'));
if (!files.length) throw new Error('No web tests found.');
const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), '--test', ...files], {
  cwd: web, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
