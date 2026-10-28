# wac IDE

An IDE for [wac](https://github.com/voltrevo/wac) that runs in a browser tab, with wac's own compiler
checking your code as you type. Built for real projects, up to the wac repository itself.

- **Projects** live in the browser's storage. Drop a folder, or a `.zip` or `.tar.gz` of one — a whole
  repository is fine: `git archive -o wac.tar.gz HEAD` makes one without its history. Or start a new one.
- **The editor** colours wac with the compiler's own lexer, so a keyword, a number or an interpolated
  string is coloured exactly as the compiler reads it. Edits save themselves a moment after typing stops.
- **Checking** runs on the file in front and everything it imports, in a process of its own, so typing
  never waits for it. Problems show in a panel, in the status, on the file in the tree and its tab, and on
  the line itself — underlined, with the message at the end of the line. Click one to go to it.
- **What a name is**: rest the caret on a name and a card under it shows its type, its declaration as
  written, its doc comment and where it is declared. **F12** or **Ctrl+click** goes there — across files,
  through imports, to a field or a method by the type of what it is on.
- **Typing**: Tab indents and Enter keeps the indent (one more after `{`, `(` or `[`), both undoable with
  Ctrl+Z; the status bar says where the caret is. Clicking a problem puts the caret on it.
- **Build** compiles the file in front and downloads the `.wasm` module.
- **Ctrl+P** goes to any file by name; **+** makes a new file in the selected folder.

## Trying it

    wac update           # fetch the pinned wac packages, once
    wac task build       # src/ide.wac -> dist/index.html
    wac task serve       # http://localhost:8080
    wac task test        # the parts that need no browser
    wac task test:ide    # the IDE in Chromium, as a person uses it (needs Playwright)

Serve it: over http the browser gives it storage, and the checker its own process. Opened straight from
disk (`file://`) it still works, but keeps nothing after the tab closes, and checks inside the page, so
typing can pause during a long check.

**Everything is pinned to one wac commit** — the `wac` command should be bootstrapped from it, `wac.json5`
names it as every wac dependency's `ref`, `wac.lock` agrees, and `vendor/wac/` was copied from it. That
commit is the head of `ide-queries`, a branch of wac **not yet on GitHub**: four commits on top of wac
`25a34468` that the IDE needs (the caret in `web`, and `queryIn` in the compiler). They travel with this
project as `wac-patches/` — see there to build it.

## How fast, on the wac repository

Measured in headless Chromium (`tools/ide_scale.js`):

| | |
|---|---|
| Import the repository (4,032 files, from a 10 MB `.tar.gz`) | 5.8 s, once |
| Open `emit.wac` — 23,000 lines, 30,000 coloured spans | 1.5 s |
| A keystroke in it, until it shows in colour | about 85 ms |
| Check `json.wac` (8 files) | 0.2 s |
| Check `emit.wac` (22 files): first, then after an edit | 1.7 s, then 0.7 s |
| Check `wac.wac`, the `wac` command (236 files), first time | about 6 s |
| What the name at the caret in `emit.wac` is, or F12 from it into `asynclower.wac` | about 1.2 s |

## How it is put together

| | |
|---|---|
| `src/ide.wac` | the page: projects, the tree, tabs, problems, the finder, saving, checking, building; and `checker`, the export the checker's process runs |
| `src/checker.wac` | the checker: the compiler and the `wac` command's gathering, with every file kept between checks; the messages between it and the page; the same engine run in the page where there is no process |
| `src/editor.wac` | the editor: a transparent textarea over the coloured text, in chunks of 50 lines; diagnostics on their lines |
| `src/highlight.wac` | colours, from the compiler's lexer |
| `src/diag.wac` | diagnostics, read from the compiler's wire |
| `src/store.wac` | projects in the browser's storage: importing, listing, reading, writing |
| `src/archive.wac`, `src/sniff.wac`, `src/bytes.wac` | zip, tar, gzip and zstd — from the desktop project |
| `src/style.wac` | the look, light and dark; icons as SVG masks |
| `vendor/wac/` | wac's compiler and the `wac` command's source gathering, copied by `tools/vendor_wac.py` until wac's root library exports them |
| `docs/wac-wishlist.md` | what the IDE would like from wac, and the bugs met building it |

- **The editor never scrolls anything itself.** A page cannot read or set a scroll position, so the
  textarea and the coloured text behind it are both as big as the whole file, inside one container that
  scrolls — they cannot drift apart. The textarea is a margin bigger than its text, because it scrolls
  inside itself to keep its caret in view, however its overflow is set.
- **The checker is a copy of the page** (`--spawn checker`), spoken to over its standard input and output:
  the page sends each edited file's contents as it saves them, and asks for a check or a build; the
  checker answers with the compiler's diagnostics wire or a module. It keeps every file it has read, so
  after the first check nothing is read from storage again, and what it checks is what is on screen.
- **Keys** reach the app's handler only from inside it, so the app keeps the focus: the editor in front
  takes it when it comes forward, and the app's root when nothing else has it.

## Not yet

Run and test (they need wac to run a module in a page), completion, find references and rename (they
build on `queryIn`), hover with the mouse rather than the caret (a page cannot tell which column the
pointer is over), find and replace across files, renaming and deleting files, git. `docs/wac-wishlist.md` says what each would need from wac.
