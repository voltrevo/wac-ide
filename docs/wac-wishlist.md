# What the IDE would like from wac

Kept as the IDE is built: each item says what it would enable, what the IDE does instead today, and
where in wac it lives. Most important first. Measured against wac `25a34468`.

## For the editor

### 1. The caret and the selection of a text field

**Wanted:** read a textarea's selection (`selectionStart`, `selectionEnd`) — in each `input` and key event,
say — and set it.

**Would enable:** Tab and Shift+Tab indenting, Enter keeping the indent, the current line highlighted,
"line 12, column 4" in the status bar, putting the caret on a problem's line when it is clicked, and
completion and hover placed at the caret — almost everything that separates an editor from a text box.

**Instead:** Tab is swallowed (so it does not leave the editor) and does nothing; a problem clicked
scrolls its line into view and flashes it, but the caret stays where it was.

**Where:** `packages/web` — `ElementEvent` carries `value`, `x`, `y` and `mods`, and `ElementOps.prop`
sets only `value`, `checked` and `selected`.

### 2. Where an element is scrolled to

**Wanted:** a `scroll` event that reports `scrollTop`, `scrollLeft` and the visible size — or, simpler
still, an "is this element on screen" event.

**Would enable:** drawing only the lines on screen. Today every line of a file is drawn: `emit.wac`'s
23,000 lines are 461 chunks and 30,000 spans, which take 1.5 s to open and make a keystroke cost about
85 ms to show in colour.

**Instead:** the coloured text is cut into chunks of 50 lines, and only a chunk whose text or colours
change is drawn again. `Element.scrollIntoView` exists and is what jumping to a line uses.

**Where:** `packages/web` — the browser half reports a scroll event with `x` and `y` of 0.

### 3. The compiler, and the `wac` command's gathering, in the root library

**Wanted:** `wacc` (`packages/wacc/src/api.wac`) and `sources.wac` (`gatherWith`, `gatherNeeded`,
`ReadCache`, `resOf`) reachable as `import { … } from "wac"`.

**Instead:** `tools/vendor_wac.py` copies 49 files (77,000 lines) from six packages into `vendor/wac/`.
Everything sharing a type with them — `Fs` above all — has to come from there too, or it is a different
type.

**Where:** `lib.wac` at the repository root.

### 4. Answers to "what is at this position"

**Wanted:** given a file and an offset — the declaration a name refers to, the type of an expression, the
names in scope there.

**Would enable:** go to definition, hover types, completion, rename.

**Instead:** nothing; the IDE has the diagnostics wire, the token stream and exported signatures.

**Where:** `packages/wacc`.

### 5. Incremental checking

**Wanted:** a check that reuses what it learned last time for files that did not change.

**Would enable:** checking the wac command (236 files) on each pause in typing, not every few seconds.

**Instead:** the checker keeps every file's bytes between checks (the `wac` command's own `ReadCache`) and
is sent each edit, so nothing is read again — `emit.wac`'s 22 files re-check in 0.7 s, down from 1.7 s
cold — but the compiler still lowers and checks the whole graph each time.

**Where:** `packages/wacc` — `gatherNeeded` already keeps `Reads` and `Parsed` caches keyed by text across
its rounds; something like them across checks.

## For running things

### 6. A page runs a module it is given

**Wanted:** design/system/0015 (proposed upstream).

**Would enable:** Run and `wac test` in the IDE, with output in a panel.

**Instead:** Build compiles the file in front and downloads the `.wasm`.

### 7. Spawning from a page opened from a file — or at least an answer

**Wanted:** on `file://`, `spawnSelf` either works (design/system/0015's second half) or answers with an
error.

**Instead:** the browser's refusal ("Failed to construct 'Worker' … cannot be accessed from origin
'null'") is thrown inside the host and the request is never answered, so `await`ing it waits forever.
The IDE does not ask on `file://`, and runs its checker inside the page, where a long check pauses
typing.

**Where:** `packages/web/tools/build.wac`, `spawn`.

## For importing projects

### 8. Leave a file out of a dropped folder before reading it

**Wanted:** a page can say which names it wants (or not: `.git`, `node_modules`) before a folder's
files are read and sent.

**Instead:** every file of a dropped folder is read and sent, then the IDE drops what it does not want.
A repository dropped with its `.git` sends all of its history, so the IDE suggests
`git archive -o name.tar.gz HEAD`.

**Where:** `packages/web/tools/build.wac`, the folder walk.

## Bugs met

### 9. A lambda that captures a local, written inline in an awaited call, is not emitted

```wac
async i32 run(fn<void(i32)> progress) { progress(1); return 1; }

export async i32 go() {
  string name = "x";
  i32 n = await run((i32 done) => { string s = "\{name} \{done}"; });
  return n;
}
```

`wac compile` answers *cannot emit — `__wacAw0`, which is read here and is neither a local nor a module
constant this emitter can find*. The same lambda in a local first (`fn<void(i32)> f = …; await run(f)`)
compiles, and is what `ide.wac`'s `importBatch` does. A lambda that captures nothing compiles either way.

### 10. `build.wac` crashes on a page with a parse error

Building a page whose source has a parse error stops with *error: array element access out of bounds*
and nothing else; `wac check` on the same file names the error. (Met with `html.kbd`, which is not one
of `web`'s named tags, and a block string that did not start on a new line.)

### 11. `autofocus` does nothing on an element made after the page loaded

That is the browser's rule, not wac's, but `web`'s named tags offer `autofocus` as if it worked. The IDE
focuses its finder and its new-file box through a `Ref` instead.
