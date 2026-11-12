#!/usr/bin/env node
/**
 * Keeps the shared wheel viewer one thing across two repos.
 *
 * The viewer lives in the FORGED website repo (src/wheel-viewer/) and is copied, file for file, into the
 * BMW configurator (shared/wheel-viewer/). The same script sits in both repos (it is itself part of the
 * contract: change it in the website and copy it over).
 *
 *   node scripts/wheel-viewer-sync.mjs stamp            website: record the folder's content hash in VERSION.json
 *   node scripts/wheel-viewer-sync.mjs verify           both:    fail if the folder was edited without a new stamp
 *   node scripts/wheel-viewer-sync.mjs pull [site-dir]  BMW:     copy the viewer from a checkout of the website
 *   node scripts/wheel-viewer-sync.mjs status [site-dir] BMW:    say whether the copy matches the website's
 *
 * `verify` is cheap and needs only this repo, so it runs with the type check. In the configurator it
 * catches an edit made to the copy; in the website it catches an edit nobody stamped. `status` and `pull`
 * need the website checked out next to this repo (default ../Forgedwebsite).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_DIR = 'src/wheel-viewer';
const COPY_DIR = 'shared/wheel-viewer';
const MANIFEST = 'VERSION.json';

const localDir = existsSync(join(root, WEBSITE_DIR)) ? join(root, WEBSITE_DIR) : join(root, COPY_DIR);
const isWebsite = localDir === join(root, WEBSITE_DIR);

/** Every file under `dir` except the manifest, as sorted relative paths. */
function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== MANIFEST) out.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** The text of a file with line endings normalised, so a checkout on Windows hashes the same. */
const text = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function hashOf(dir) {
  const files = listFiles(dir);
  const h = createHash('sha256');
  for (const f of files) h.update(`${f}\n${text(join(dir, f))}\n--\n`);
  return { files, sha256: h.digest('hex') };
}

function readManifest(dir) {
  const file = join(dir, MANIFEST);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

function verify(dir, label) {
  const manifest = readManifest(dir);
  const now = hashOf(dir);
  if (!manifest) throw new Error(`${label}: ${MANIFEST} is missing. ${isWebsite ? 'Run: node scripts/wheel-viewer-sync.mjs stamp' : 'Run: node scripts/wheel-viewer-sync.mjs pull'}`);
  if (manifest.sha256 !== now.sha256) {
    throw new Error(
      isWebsite
        ? `${label} changed since it was stamped. Run: node scripts/wheel-viewer-sync.mjs stamp, then pull it into the configurator.`
        : `${label} was edited here. The viewer is edited in the website repo (src/wheel-viewer/); undo the change, make it there, and run: node scripts/wheel-viewer-sync.mjs pull`
    );
  }
  return now;
}

const [command, siteArg] = process.argv.slice(2);

try {
  if (command === 'stamp') {
    if (!isWebsite) throw new Error('stamp is for the website repo: the viewer is edited there.');
    const { files, sha256 } = hashOf(localDir);
    writeFileSync(join(localDir, MANIFEST), JSON.stringify({ sha256, files }, null, 2) + '\n');
    console.log(`stamped ${files.length} files, ${sha256.slice(0, 12)}`);
  } else if (command === 'verify') {
    const { files, sha256 } = verify(localDir, relative(root, localDir));
    console.log(`wheel viewer ok: ${files.length} files, ${sha256.slice(0, 12)}`);
  } else if (command === 'pull' || command === 'status') {
    if (isWebsite) throw new Error(`${command} is for the configurator: it copies from the website.`);
    const site = resolve(root, siteArg ?? '../Forgedwebsite');
    const from = join(site, WEBSITE_DIR);
    if (!existsSync(from)) throw new Error(`no ${WEBSITE_DIR} in ${site}. Pass the website checkout: node scripts/wheel-viewer-sync.mjs ${command} <path>`);
    verify(from, `the website's ${WEBSITE_DIR}`); // never copy an unstamped viewer
    const source = hashOf(from);
    if (command === 'status') {
      const mine = readManifest(localDir);
      const same = mine && mine.sha256 === source.sha256;
      console.log(same ? 'the copy matches the website' : 'the copy is behind (or differs from) the website: run pull');
      process.exit(same ? 0 : 1);
    }
    rmSync(localDir, { recursive: true, force: true });
    for (const f of [...source.files, MANIFEST]) {
      mkdirSync(dirname(join(localDir, f)), { recursive: true });
      copyFileSync(join(from, f), join(localDir, f));
    }
    verify(localDir, relative(root, localDir));
    console.log(`pulled ${source.files.length} files, ${source.sha256.slice(0, 12)}`);
  } else {
    console.error('usage: wheel-viewer-sync.mjs stamp | verify | pull [site-dir] | status [site-dir]');
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
