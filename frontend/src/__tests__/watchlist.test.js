import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src');
const readSource = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('watchlist UI is an explicit route and does not include seed records', () => {
  const app = readSource('App.tsx');
  const sidebar = readSource('components/Sidebar.tsx');
  const page = readSource('components/Watchlist/WatchlistPage.tsx');

  assert.match(app, /currentPage === 'watchlist'/);
  assert.match(sidebar, /Watchlist references/);
  assert.match(page, /No active references/);
  assert.match(page, /reference-only/i);
});

test('watchlist client uses site-scoped authenticated endpoints and multipart upload', () => {
  const api = readSource('services/api.ts');

  assert.match(api, /\/api\/sites/);
  assert.match(api, /\/watchlist/);
  assert.match(api, /new FormData\(\)/);
  assert.match(api, /Authorization/);
  assert.match(api, /method: 'PATCH'/);
});

test('dashboard avoids illustrative sample and demo-only claims in normal UI copy', () => {
  const dashboard = readSource('components/Dashboard/DashboardHome.tsx');
  assert.doesNotMatch(dashboard, /Illustrative sample records/);
  assert.doesNotMatch(dashboard, /Demo dashboard value/);
  assert.match(dashboard, /Records returned by the API/);
});

test('feature controls are a real site-scoped admin route', () => {
  const app = readSource('App.tsx');
  const sidebar = readSource('components/Sidebar.tsx');
  const page = readSource('components/FeatureControls/FeatureControlsPage.tsx');
  const api = readSource('services/api.ts');

  assert.match(app, /currentPage === 'features'/);
  assert.match(sidebar, /Feature controls/);
  assert.match(page, /role="switch"/);
  assert.match(page, /Administrator permission/);
  assert.match(api, /feature-flags/);
  assert.match(api, /updateFeatureFlag/);
});

test('protected API features have a visible sign-in flow', () => {
  const topbar = readSource('components/Topbar.tsx');
  const context = readSource('context/AppContext.tsx');

  assert.match(topbar, /Sign in to IBVAP/);
  assert.match(topbar, /autoComplete="current-password"/);
  assert.match(topbar, /await login\(loginUsername\.trim\(\), loginPassword\)/);
  assert.match(context, /api\.login\(username, password\)/);
});
