import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve('production-preview-dist');
let server;
let baseUrl;

before(async () => {
  // Browser navigation and redirects must run on an HTTP origin, not file://.
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const target = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    const relativePath = relative(root, target);
    if (relativePath === '..' || relativePath.startsWith('..' + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(target);
      const type = target.endsWith('.mjs') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'content-type': type }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) await new Promise((done) => server.close(done));
});

for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  for (const scenario of ['no session', 'invalid session']) {
    test('protected preview redirects ' + scenario + ' on ' + viewport.name, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.addInitScript((invalid) => {
          window.supabase = { createClient: () => ({ auth: {
            getUser: async () => ({ data: { user: null }, error: invalid ? { message: 'Invalid synthetic session' } : null })
          } }) };
        }, scenario === 'invalid session');
        await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
        await page.goto(baseUrl + '/app/', { waitUntil: 'domcontentloaded' });
        await page.waitForURL(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 10000 });
        assert.equal(page.url(), baseUrl + '/');
        assert.equal(await page.locator('html.budget-authenticated').count(), 0);
      } finally { await browser.close(); }
    });
  }
}
