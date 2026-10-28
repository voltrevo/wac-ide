# The wac branch this IDE is built against

`ide-queries`: four commits on top of wac `25a34468`, not on GitHub. `wac.json5` and `wac.lock` pin its
head, `5d15f2ed6`, and `vendor/wac/` was copied from it.

| Commit | What |
|---|---|
| web: an event in a text field says where the caret is, and a program can move it | `ElementEvent.selStart`/`selEnd`, `Element.select` |
| bootstrap: say what wac-L5 refused, not only how many | the ladder printed a count and nothing else |
| wacc: queryIn — where a name is declared, and its type, for an editor | `queryIn`, `query.wac`, `probe.wac`, the checker's probe |
| web: Element.typeText types into a text field at its caret | undoable typing for Tab and Enter |

- `ide-queries.git.bundle` — the commits with their exact hashes. In a clone of wac:
  `git fetch <this>/ide-queries.git.bundle ide-queries:ide-queries`.
- `000*.patch` — the same, for reading or `git am`.

To build the IDE: check out `ide-queries` in a wac clone, `./bootstrap.sh --host nodejs`, then put the
pinned commit in wac's package cache (`wac update` cannot fetch it from GitHub):

    C=$(git -C <wac clone> rev-parse ide-queries)
    D="${WAC_HOME:-$HOME/.wac}/cache/git/https%3A%2F%2Fgithub.com%2Fvoltrevo%2Fwac/$C"
    mkdir -p "$D" && git -C <wac clone> archive "$C" | tar -x -C "$D" && touch "$D/pack.pack"

When the branch is merged, point `wac.json5` and `wac.lock` at that commit and delete this folder.
