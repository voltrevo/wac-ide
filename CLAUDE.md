# Notes for whoever works on this next

README.md says what this is and how it is put together; `docs/wac-wishlist.md` is the running list of
what it would like from wac — keep it current, it is how this project talks to wac's maintainers.

## Working agreements

- **The remote is `https://git.voltrevo.com/wac-ide.git`, `master`** (the server's default branch, `main`, is
  empty). Push finished work through `tools/push.sh`, which checks and tests first; nothing goes to GitHub
  unless the owner says so.
- When wac lacks something: work around it here, and add an entry to `docs/wac-wishlist.md` saying what
  it would enable, what the workaround is, and where in wac it lives. Bugs get a minimal reproduction.
- Comments explain *why*, in full sentences. Match the surrounding style.

## Building and testing

wac and `web` are pinned in `wac.json5` and `wac.lock` (change them together), and the `wac` command should be
built from the wac commit. `wac update` cannot fetch from git.voltrevo.com; `tools/fill-cache.sh` does, with `git`.

    sh tools/fill-cache.sh && wac task build && wac task test && wac task test:ide

- `test:ide` drives Chromium with Playwright against `dist/` — build first. It covers http and `file://`.
- `tools/ide_scale.js` is the measurement against the wac repository (see its header); README's table
  came from it. Run it after anything that touches the editor or the checker.
- Run unit tests through `wac task test`; `wac test` on one file loses the project's context.
- **When a build fails with only "array element access out of bounds"**, run `wac check src/ide.wac`:
  it is a parse error the page builder does not report (wishlist 10).
- **"cannot emit … `__wacAwN`"** is wishlist 9: move a capturing lambda out of an `await`ed call into a
  local.

## Things that bite

- The page's program runs in a worker: the DOM changes a moment after each event, so browser tests wait.
- `autofocus` does nothing on an element made after load; focus through a `Ref`.
- `f64` has only `floor`, `ceil`, `round`, `trunc`. Escapes are the usual few. A block string starts on a
  new line after `"""`.
