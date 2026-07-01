#!/usr/bin/env node
'use strict';

/**
 * Branding editions for the VS Code extension.
 *
 * One engine, two skins. A profile in /branding/<edition>.json drives the only
 * fields that differ between editions — publisher, display name, description,
 * licence, and the (publisher-derived) chat-participant id. Everything else
 * (the engine, tests, SECURITY.md, the @cetoken name) is shared.
 *
 *   node scripts/apply-branding.cjs personal     # stamp the personal edition
 *   node scripts/apply-branding.cjs certance     # stamp the Certance edition
 *   node scripts/apply-branding.cjs personal --check   # verify, exit 1 on drift
 *
 * `package:personal` / `package:certance` apply a profile then build its VSIX.
 * CI runs `--check` against the committed default so main never drifts.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const extRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(extRoot, 'package.json');
const participantPath = path.join(extRoot, 'src', 'chat-participant.cjs');
const licensePath = path.join(extRoot, 'LICENSE.txt');

function loadProfile(edition) {
  const profilePath = path.join(repoRoot, 'branding', `${edition}.json`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Unknown edition "${edition}" — no branding/${edition}.json`);
  }
  return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
}

function participantId(profile) {
  return `${profile.publisher}.cetoken`;
}

function licenseText(profile) {
  const year = new Date().getFullYear();
  if (profile.license === 'MIT') {
    return `MIT License

Copyright (c) ${year} ${profile.owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  }
  return `This extension package is UNLICENSED.

All rights reserved by ${profile.owner}.
No permission is granted to use, copy, modify, distribute, or sublicense this software except by explicit written agreement from the owner.
`;
}

/** The desired state of every branded file for a given profile. */
function desiredState(profile) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.publisher = profile.publisher;
  pkg.displayName = profile.displayName;
  pkg.description = profile.description;
  pkg.license = profile.license;
  pkg.contributes.chatParticipants[0].id = participantId(profile);
  if (pkg.contributes.chatParticipants[1]) {
    // The concise participant id is derived from the base id (see CONCISE_PARTICIPANT_ID).
    pkg.contributes.chatParticipants[1].id = `${participantId(profile)}-concise`;
  }

  const participant = fs.readFileSync(participantPath, 'utf8')
    .replace(/const PARTICIPANT_ID = '[^']*';/, `const PARTICIPANT_ID = '${participantId(profile)}';`);

  return {
    [pkgPath]: JSON.stringify(pkg, null, 2) + '\n',
    [participantPath]: participant,
    [licensePath]: licenseText(profile),
  };
}

function run(edition, check) {
  const profile = loadProfile(edition);
  const state = desiredState(profile);
  const drift = [];

  for (const [file, content] of Object.entries(state)) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current !== content) {
      drift.push(path.relative(extRoot, file));
      if (!check) {
        fs.writeFileSync(file, content);
      }
    }
  }

  if (check) {
    if (drift.length > 0) {
      console.error(`[apply-branding] files do not match the "${edition}" edition:`);
      for (const f of drift) console.error(`  ${f}`);
      console.error(`\nFix: run \`npm run brand:${edition}\` and commit.`);
      process.exit(1);
    }
    console.log(`[apply-branding] in sync with the "${edition}" edition (publisher ${profile.publisher})`);
    return;
  }

  console.log(`[apply-branding] applied the "${edition}" edition: publisher ${profile.publisher}, license ${profile.license}, participant ${participantId(profile)}`);
}

const args = process.argv.slice(2);
const edition = args.find(a => !a.startsWith('--'));
if (!edition) {
  console.error('Usage: apply-branding.cjs <personal|certance> [--check]');
  process.exit(1);
}
run(edition, args.includes('--check'));
