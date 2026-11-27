import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(testsDir, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');

test('production auth has no automatic hardcoded credential login', () => {
  const context = readSource('context/AppContext.tsx');
  const alertsLog = readSource('components/AlertsLog/AlertsLog.tsx');

  assert.doesNotMatch(context, /api\.login\(['"]admin['"]|admin123|supervisor123|operator123/);
  assert.doesNotMatch(alertsLog, /api\.login\(['"]admin['"]|admin123/);
  assert.match(context, /VITE_DEMO_MODE/);
  assert.match(context, /return DEMO_MODE \? \{ username: 'operator'/);
});

test('media and WebSocket URL helpers do not append bearer tokens', () => {
  const api = readSource('services/api.ts');

  assert.match(api, /getStreamUrl\(camId: string, mediaGrant\?: string\)/);
  assert.match(api, /getWsUrl\(grant\?: string\)/);
  assert.match(api, /getSingleFrameUrl\(camId: string, _token\?: string\)/);
  assert.doesNotMatch(api, /\?token=\$\{encodeURIComponent\(token\)\}/);
  assert.doesNotMatch(api, /params\.set\(['"]token['"], token\)/);
  assert.match(api, /issueCameraMediaGrant/);
  assert.match(api, /issueWebSocketGrant/);
  assert.match(api, /params\.set\('grant', mediaGrant\)/);
});
