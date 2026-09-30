import 'dotenv/config';
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const body = JSON.stringify({
  model: 'kokoro',
  input: 'Hallo Voice Desk',
  voice: 'alloy',
});
writeFileSync('scripts/tts-body.json', body);
const key = process.env.MGA_API_KEY;
const out = spawnSync(
  'curl.exe',
  [
    '-s',
    '-m',
    '45',
    '-D',
    'scripts/tts-headers.txt',
    '-o',
    'scripts/tts-out.bin',
    '-X',
    'POST',
    'https://chat.int.bayer.com/api/v3/audio/speech',
    '-H',
    `Authorization: Bearer ${key}`,
    '-H',
    'Content-Type: application/json',
    '--data-binary',
    '@scripts/tts-body.json',
  ],
  { encoding: 'utf8' }
);
console.log('curl status', out.status, out.stderr || '');
console.log(readFileSync('scripts/tts-headers.txt', 'utf8').split('\n').slice(0, 14).join('\n'));
console.log('bytes', statSync('scripts/tts-out.bin').size);
if (statSync('scripts/tts-out.bin').size < 300) {
  console.log(readFileSync('scripts/tts-out.bin', 'utf8'));
}
