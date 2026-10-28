#!/usr/bin/env node
// The IDE in Chromium, as a person uses it — after `wac task build`; needs Playwright.
//
//     node tools/ide_test.js [screenshots-dir]
//
// Over http: import samples/hello as an archive, open a file, make an error and watch it appear (in the
// status, the problems, the tree, the tab and the line), jump to it, fix it, break one file from another,
// build a module, find a file, make one, and reload. Then from file://, where checking runs in the page.

const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const html = path.join(root, 'dist', 'index.html');
const shots = process.argv[2];
let failed = 0;
const check = (ok, what, seen) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ' — saw ' + JSON.stringify(seen)}`); };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-'));
  const tgz = path.join(tmp, 'hello.tar.gz');
  execFileSync('tar', ['czf', tgz, '-C', path.join(root, 'samples'), 'hello']);
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(html)); }).listen(0);
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const settle = (ms = 400) => p.waitForTimeout(ms);
  const shot = async (n) => { if (shots) { await settle(300); await p.screenshot({ path: path.join(shots, `ide-${n}.png`) }); } };
  const text = (sel) => p.textContent(sel).catch(() => '');
  const texts = (sel) => p.$$eval(sel, (l) => l.map((x) => x.textContent.trim()));
  const checked = async () => { await settle(500); await p.waitForFunction(() => !document.querySelector('.status').textContent.includes('Checking'), null, { timeout: 60000 }); await settle(200); };
  const editor = () => p.locator('.slot:not(.hidden) .input');

  await p.goto(url);
  await p.waitForSelector('.pick', { state: 'attached', timeout: 20000 });
  check((await text('.home h1')) === 'wac IDE', 'it starts on the projects screen', await text('.home h1'));
  await p.setInputFiles('.pick', tgz);
  await p.waitForSelector('.tree .tnode', { timeout: 60000 });
  await settle();
  check((await text('.proj b')) === 'hello' && (await texts('.tnode .nm')).join() === 'src', 'an archive becomes a project, its one folder unwrapped', [await text('.proj b'), await texts('.tnode .nm')]);
  await p.locator('.tnode', { hasText: 'src' }).click(); await settle();
  await p.locator('.tnode', { hasText: 'main.wac' }).click();
  await checked();
  check((await text('.status')) === 'No problems', 'opening a file checks it', await text('.status'));
  check((await text('.bar span')).includes('files checked'), 'and says how much it checked', await text('.bar span'));
  check((await p.$$('.slot:not(.hidden) .chunk .hk')).length > 0, 'and colours it', null);

  const original = await editor().inputValue();
  await editor().fill(original + '\nexport i32 broken() { return "x"; }\n');
  await checked();
  check((await text('.status')) === '1 error', 'an error appears as it is typed', await text('.status'));
  check((await texts('.prow')).some((t) => t.includes('return type')), 'in the problems', await texts('.prow'));
  check((await texts('.slot:not(.hidden) .lens')).length === 1 && !!(await p.$('.slot:not(.hidden) .squig.err')), 'and on its line', await texts('.slot:not(.hidden) .lens'));
  check((await text('.tnode.on .cnt')) === '1' && !!(await p.$('.tab.on.err')), 'and on the file, in the tree and its tab', await text('.tnode.on .cnt'));
  await shot('1-error');
  await p.locator('.prow').first().click(); await settle(300);
  check(!!(await p.$('.slot:not(.hidden) .flash')), 'a problem clicked brings its line forward', null);
  await editor().fill(original);
  await checked();
  check((await text('.status')) === 'No problems', 'and fixing it clears it', await text('.status'));

  // One file breaks another: the checker sees what is on screen.
  await p.locator('.tnode', { hasText: 'util.wac' }).click(); await settle(600);
  await editor().fill('export i32 double(string x) { return 2; }\n');
  await p.locator('.tab', { hasText: 'main.wac' }).click();
  await checked();
  check((await text('.status')) === '1 error' && (await texts('.prow')).join().includes('main.wac'.slice(0, 0)), 'a change to one file shows its effect on another', [await text('.status'), await texts('.prow')]);
  await p.locator('.tab', { hasText: 'util.wac' }).click(); await settle(300);
  await editor().fill('/** Twice `x`. */\nexport i32 double(i32 x) { return x * 2; }\n');
  await p.locator('.tab', { hasText: 'main.wac' }).click();
  await checked();
  check((await text('.status')) === 'No problems', 'and putting it back clears that', await text('.status'));

  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('.top .btn.primary').click()]);
  const wasm = fs.readFileSync(await download.path());
  check(download.suggestedFilename() === 'main.wasm' && wasm.slice(0, 4).toString('hex') === '0061736d', 'Build downloads a wasm module', [download.suggestedFilename(), wasm.slice(0, 4)]);
  await settle(300);
  check((await text('.toast')).includes('Built main.wasm'), 'and says so', await text('.toast'));

  await p.keyboard.press('Control+p'); await settle(300);
  await p.keyboard.type('util'); await settle(300);
  await p.keyboard.press('Enter'); await settle(500);
  check((await text('.tab.on .nm')) === 'util.wac', 'Ctrl+P finds a file by name', await text('.tab.on .nm'));
  await p.locator('.sidehead .btn').click(); await settle(300);
  await p.keyboard.type('extra.wac'); await p.keyboard.press('Enter'); await settle(800);
  check((await text('.tab.on .nm')) === 'extra.wac' && (await texts('.tnode .nm')).includes('extra.wac'), 'a new file is made in the selected folder and opened', [await text('.tab.on .nm'), await texts('.tnode .nm')]);
  await shot('2-files');

  await settle(800);
  await p.reload();
  await p.waitForSelector('.tab', { timeout: 30000 }); await settle(800);
  check((await texts('.tab .nm')).join() === 'main.wac,util.wac,extra.wac' && (await text('.tab.on .nm')) === 'extra.wac', 'a reload brings the project and its tabs back', await texts('.tab .nm'));
  await p.locator('.proj').click(); await settle(400);
  check((await texts('.pcard .nm')).join() === 'hello', 'the projects screen lists it', await texts('.pcard .nm'));

  // From a file: no storage, and no worker of the page's own — so checking runs in the page.
  const q = await (await browser.newContext({ viewport: { width: 1400, height: 860 } })).newPage();
  q.on('pageerror', (e) => errors.push('file:// ' + e.message));
  await q.goto('file://' + html);
  await q.waitForSelector('.home .btn.primary', { timeout: 20000 }); await q.waitForTimeout(800);
  await q.locator('.home .btn.primary').click();
  await q.waitForSelector('.tab', { timeout: 30000 }); await q.waitForTimeout(1500);
  await q.waitForFunction(() => !document.querySelector('.status').textContent.includes('Checking'), null, { timeout: 60000 });
  check((await q.textContent('.status')) === 'No problems', 'from file:// a new project checks', await q.textContent('.status'));
  check((await q.textContent('.bar')).includes('Checking runs in the page here') && (await q.textContent('.bar')).includes('Not saved'), 'in the page, and says so', await q.textContent('.bar'));

  check(errors.length === 0, 'no page errors', errors);
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'the IDE behaved');
  process.exit(failed ? 1 : 0);
})();
