// Writes assets/voice/src/<id>.txt from the `vo` strings in build.mjs (the script that tools/voice.py then speaks).
//   node tools/extract-vo.mjs
import fs from 'node:fs'; import path from 'node:path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const src = fs.readFileSync(path.join(root, 'build.mjs'), 'utf8');
fs.mkdirSync(path.join(root, 'assets/voice/src'), { recursive: true });
const re = /id: '([a-z]\d\d)'[\s\S]*?vo:\s*"((?:[^"\\]|\\.)*)"/g; let m, n = 0;
while ((m = re.exec(src))) { fs.writeFileSync(path.join(root, 'assets/voice/src', m[1] + '.txt'), m[2].replace(/\\"/g, '"')); n++; }
console.log(`${n} voice-over lines written`);
