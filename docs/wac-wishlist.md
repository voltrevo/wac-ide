# What the IDE would like from wac

Kept as the IDE is built: each item says what it would enable, what the IDE does instead today, and
where in wac it lives. Most important first. Measured against wac `25a34468`.

**Items 1, 3, 4, 6 and 7 are in wac now** (2026-11-01): the IDE is built against wac master and `web` at
git.voltrevo.com, and `wac-patches/` is gone. Item 4 went in as `factsAt`, which answers from the checker itself
rather than from a second resolver over the syntax.

## For the editor

### 1. The caret and the selection of a text field — *done, in `web`*

**Done as:** `ElementEvent.selStart` and `selEnd` on every event from an `<input>` or `<textarea>` (-1
elsewhere); `Element.select(start, end)`, which like a rendered value does not land over typing the
program has not seen; and `Element.typeText(text)`, which types at the caret as the browser would — so
it is undoable — with the same guard. The IDE uses them for Tab, Enter's indent, line:column, and putting
the caret on a problem or a definition.

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

### 3. The compiler, and the `wac` command's gathering, in the root library — *done*

**Done as:** `wacc` and `wac` in wac's root entry (`import { wacc.factsAt, wac.gatherWith } from "wac"`), and
`vendor/` is gone. What follows is what it was.

**Wanted:** `wacc` (`packages/wacc/src/api.wac`) and `sources.wac` (`gatherWith`, `gatherNeeded`,
`ReadCache`, `resOf`) reachable as `import { … } from "wac"`.

**Instead:** `tools/vendor_wac.py` copies 49 files (77,000 lines) from six packages into `vendor/wac/`.
Everything sharing a type with them — `Fs` above all — has to come from there too, or it is a different
type.

**Where:** `lib.wac` at the repository root.

### 4. Answers to "what is at this position" — *done, as `factsAt`*

**Done as:** `wacc.factsAt(paths, sources, res, file, offset)`, a `PositionFacts`, which the checker answers from
what it resolved while checking. The checker's process writes it as the lines `info.wac` reads. What follows is
what the IDE's own proposal was.

**Done as:** `queryIn(paths, sources, res, file, offset)` in `packages/wacc/src/api.wac`, answering the
token's type, where it is declared, that line, and its doc comment. Definitions are found by reading
(`query.wac`: scopes, the file's top level, imports through export lists, members through the receiver's
type); types come from a probe in the checker (`probe.wac`, `C.probeTok`) that records the type of the
expression keyed by the token as the statement holding it is checked. Completion, find references and
rename would build on the same two halves.

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

### 4a. Which character the pointer is over

**Wanted:** in a pointer event over a text field, the text offset under the pointer — or a way to measure
an element, so a program can work it out from `x`, `y` and the width of a character.

**Would enable:** hover with the mouse. **Instead:** the card follows the caret, and Ctrl+click works
because a click moves the caret first.

### 4b. Faster answers about a position

**Wanted:** `factsAt` without re-checking the file's whole closure — the checker's per-function work
kept between queries, say, or a query that checks only the function holding the token.

**Instead:** a query costs what checking the file does: about 0.2 s for a small file, 1–2 s in
`emit.wac`. The IDE asks only once the caret has rested, and only on a name.

## For running things

### 6. A page runs a module it is given — *done, and used: Run and Test*

**Wanted:** design/system/0015 (proposed upstream).

**Would enable:** Run and `wac test` in the IDE, with output in a panel.

**Instead:** Build compiles the file in front and downloads the `.wasm`.

### 7. Spawning from a page opened from a file — or at least an answer — *done in wac, not used here yet*

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

### 12. A function held in a field, called through the field, is not emitted

**Seen:** `a.redraw()`, where `redraw` is a `fn<void()>` field of `App`, checks clean and then refuses the build:
*"a call to `.redraw`, which this expression is emitted as and which is not in the program"* — the emitter treats it
as a method call. **Instead:** `fn<void()> f = a.redraw; f();` (`redraw` in `src/ide.wac`).

