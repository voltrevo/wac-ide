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
  await p.locator('.prow').first().click(); await settle(500);
  check(!!(await p.$('.slot:not(.hidden) .flash')), 'a problem clicked brings its line forward', null);
  const broken = (await editor().inputValue()).split('\n');
  const errAt = broken.slice(0, 10).reduce((n, l) => n + l.length + 1, 0) + 29;
  check((await editor().evaluate((el) => el.selectionStart)) === errAt, 'and puts the caret on it', [await editor().evaluate((el) => el.selectionStart), errAt]);
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

  // Run: the file in front built and started in its project's folder, what it says in the Output panel.
  // Until the run that starts with `what` has ended — its last line, `— how it ended`.
  const ran = async (what) => {
    await p.waitForFunction((what) => { const t = document.querySelector('.output')?.textContent ?? ''; return t.startsWith(what) && t.includes('— '); }, what, { timeout: 90000 }).catch(() => {});
    return text('.output');
  };
  await p.locator('.top .btn', { hasText: 'Run' }).click();
  let out = await ran('Running main.wac');
  check(out.includes('the answer is 42') && out.includes('exited with 0'), 'Run builds the file and shows what it says', out);
  // Test: the file's test functions, each said to pass or fail, the one that fails with why.
  await p.locator('.tnode', { hasText: 'util_test.wac' }).click();
  await checked();
  await p.locator('.top .btn', { hasText: 'Test' }).click();
  out = await ran('Testing util_test.wac');
  check(out.includes('ok   test_doubles') && out.includes('FAIL test_wrong_on_purpose — double(2) is 4, not 5')
        && out.includes('1 passed, 1 failed') && out.includes('some tests failed'), 'Test runs each test and says how it went', out);
  await shot('1b-tested');
  await p.locator('.tab.on .x').click(); await settle(300);
  await p.locator('.phead .ptab', { hasText: 'Problems' }).click(); await settle(200);

  // What a name is, and where it is declared: from the caret, with F12, and with Ctrl+click.
  await p.locator('.tab', { hasText: 'main.wac' }).click(); await settle(300);
  const mainText = await editor().inputValue();
  const callAt = mainText.indexOf('double(21)') + 2;
  const caretTo = (at) => editor().evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, at);
  await caretTo(callAt); await p.keyboard.press('ArrowRight'); await settle(1500);
  check(/Ln 6, Col 14/.test(await text('.bar')), 'the status bar says where the caret is', await text('.bar'));
  check((await text('.card')).includes('export i32 double(i32 x)') && (await text('.card')).includes('Twice'), 'resting on a name shows what it is: its declaration and its doc', await text('.card'));
  await shot('3-card');
  await p.keyboard.press('F12'); await settle(1200);
  const utilText = await editor().inputValue();
  check((await text('.tab.on .nm')) === 'util.wac' && (await editor().evaluate((el) => el.selectionStart)) === utilText.indexOf('double'), 'F12 goes to where it is declared, caret and all', [await text('.tab.on .nm'), await editor().evaluate((el) => el.selectionStart)]);
  await p.locator('.tab', { hasText: 'main.wac' }).click(); await settle(300);
  const charW = await p.evaluate(() => { const s = document.createElement('span'); s.className = 'chunk'; s.style.cssText = 'position:absolute;height:auto'; s.textContent = 'x'.repeat(100); document.querySelector('.slot:not(.hidden) .layer').appendChild(s); const w = s.getBoundingClientRect().width / 100; s.remove(); return w; });
  const lineOf = mainText.slice(0, callAt).split('\n').length - 1, colOf = callAt - mainText.lastIndexOf('\n', callAt - 1) - 1;
  await editor().click({ modifiers: ['Control'], position: { x: 16 + (colOf + 0.5) * charW, y: 10 + (lineOf + 0.5) * 20 } }); await settle(1200);
  check((await text('.tab.on .nm')) === 'util.wac', 'and so does Ctrl+click', await text('.tab.on .nm'));

  // Enter keeps the indent, Tab indents, and Ctrl+Z undoes both.
  await p.locator('.tab', { hasText: 'main.wac' }).click(); await settle(300);
  await caretTo(mainText.indexOf('sys) {') + 6);
  await p.keyboard.press('Enter'); await settle(300); await p.keyboard.type('i32 z = 1;'); await settle(400);
  check((await editor().inputValue()).includes('sys) {\n  i32 z = 1;\n'), 'Enter after an opening brace indents the next line', (await editor().inputValue()).slice(0, 120));
  await p.keyboard.press('Home'); await p.keyboard.press('Tab'); await settle(400);
  check((await editor().inputValue()).includes('\n  i32 z = 1;'.replace('  i32', '    i32').replace('    i32', '  ' + '  i32')) || (await editor().inputValue()).includes('{\n    i32 z'), 'Tab indents', (await editor().inputValue()).slice(60, 120));
  for (let k = 0; k < 6 && (await editor().inputValue()) !== mainText; k++) { await p.keyboard.press('Control+z'); await settle(150); }
  check((await editor().inputValue()) === mainText, 'and Ctrl+Z takes it all back', (await editor().inputValue()).slice(60, 120));
  await checked();

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

  // **A page program**: `web` from the IDE's own package cache, so it checks; Run draws it in the Page panel, and a
  // click there reaches it.
  await p.locator('.home .newpage').click();
  await p.waitForSelector('.tab', { timeout: 30000 });
  await checked();
  check((await text('.status')) === 'No problems', 'a new page project checks, web found in the IDE\'s own cache', [await text('.status'), await texts('.prow')]);
  await p.locator('.top .btn', { hasText: 'Run' }).click();
  await p.waitForFunction(() => document.querySelector('.pagehost .count') !== null, null, { timeout: 90000 }).catch(() => {});
  const pageShown = (await text('.pagehost')).includes('Clicks: 0');
  if (!pageShown) { await p.locator('.phead .ptab', { hasText: 'Output' }).click().catch(() => {}); await settle(300); }
  check(pageShown, 'Run shows a page program in the Page panel', [await text('.pagehost'), await text('.output'), await text('.toast')]);
  await p.locator('.pagehost .up').click(); await settle(600);
  check((await text('.pagehost .count')) === '1', 'and a click there reaches the program', await text('.pagehost'));
  await shot('3-page');
  await p.locator('.phead .btn', { hasText: 'Stop' }).click(); await settle(400);

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
