const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function resolveVsixPath() {
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const filename = `${packageJson.name}-${packageJson.version}.vsix`;
  const vsixPath = path.resolve(__dirname, '..', filename);

  if (!fs.existsSync(vsixPath)) {
    throw new Error(`VSIX not found at ${vsixPath}. Run npm run package:vsix first.`);
  }

  return vsixPath;
}

function main() {
  const vsixPath = resolveVsixPath();
  execFileSync('code', ['--install-extension', vsixPath, '--force'], {
    stdio: 'inherit',
  });
}

try {
  main();
} catch (error) {
  if (error.code === 'ENOENT') {
    process.stderr.write('VS Code CLI `code` was not found on PATH. Install the Shell Command: Install `code` command in PATH from VS Code, then rerun npm run install:vsix.\n');
  } else {
    process.stderr.write(`${error.message}\n`);
  }
  process.exit(1);
}