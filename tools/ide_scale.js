#!/usr/bin/env node
// How the IDE copes with a big project: import the wac repository, open a small file and the biggest one,
// type, and check — timing each. After `wac task build`; needs Playwright and an archive of wac:
//
//     git -C /path/to/wac archive -o /tmp/wac.tar.gz HEAD
//     node tools/ide_scale.js /tmp /tmp/wac.tar.gz      # screenshots into the first, the archive second
//
const { chromium } = require('playwright'); const fs = require('fs'), http = require('http'), path = require('path');
(async () => {
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'))); }).listen(0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${server.address().port}/`); await p.waitForSelector('.pick', { state: 'attached', timeout: 20000 });
  let t = Date.now();
  await p.setInputFiles('.pick', process.argv[3]);
  await p.waitForSelector('.tree .tnode', { timeout: 300000 }); console.log('import', Date.now() - t, 'ms');
  const open = async (q) => {
    await p.keyboard.press('Control+p'); await p.waitForSelector('.findq'); await p.keyboard.type(q); await p.waitForTimeout(300);
    t = Date.now(); await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelectorAll('.slot:not(.hidden) .chunk').length > 0, null, { timeout: 120000 });
    console.log('open', q, Date.now() - t, 'ms; chunks', await p.$$eval('.slot:not(.hidden) .chunk', l => l.length), 'spans', await p.$$eval('.slot:not(.hidden) .chunk span', l => l.length));
    t = Date.now();
    await p.waitForFunction(() => !document.querySelector('.status').textContent.includes('Checking'), null, { timeout: 120000 });
    await p.waitForTimeout(200);
    console.log('  status', await p.textContent('.status'), '|', await p.textContent('.bar .spacer ~ span, .bar span'), '| waited', Date.now() - t);
  };
  await open('json/src/json.wac');
  await open('wac/src/wac.wac');
  await open('wacc/src/emit.wac');
  // a keystroke at the very top of emit.wac: how long until its colours show it
  await p.locator('.slot:not(.hidden) .input').click({ position: { x: 30, y: 15 } });
  await p.keyboard.press('Control+Home');
  t = Date.now(); await p.keyboard.type('X');
  await p.waitForFunction(() => document.querySelector('.slot:not(.hidden) .chunk').textContent.startsWith('X'), null, { timeout: 60000 });
  console.log('keystroke shown after', Date.now() - t, 'ms');
  for (const ch of 'yz') { t = Date.now(); await p.keyboard.type(ch); await p.waitForFunction((c) => document.querySelector('.slot:not(.hidden) .chunk').textContent.includes('X' + 'yz'.slice(0, 'yz'.indexOf(c) + 1)), ch, { timeout: 60000 }); console.log('next', Date.now() - t, 'ms'); }
  await p.waitForTimeout(500);
  await p.waitForFunction(() => !document.querySelector('.status').textContent.includes('Checking'), null, { timeout: 120000 });
  await p.waitForTimeout(300);
  console.log('after edit:', await p.textContent('.status'), '|', await p.textContent('.bar span'));
  console.log('problems', (await p.$$eval('.prow', l => l.map(x => x.textContent))).slice(0, 3));
  await p.screenshot({ path: process.argv[2] + '/ide-emit.png' });
  console.log('errors', errs); await b.close(); server.close();
})();
