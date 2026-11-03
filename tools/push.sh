#!/usr/bin/env bash
# Check, test and test in Chromium, then push only if all of it passed. Merge and go again if someone got there
# first.
#
# The whole gate, and small on purpose: the IDE's own tests are what a change here can break. wac's and web's
# gates are theirs; moving a pin here is how a change there arrives, and this gate is what says it still works.
#
# Usage: tools/push.sh        (`$WAC` names the `wac` to run, the one on PATH otherwise; needs Playwright)
set -uo pipefail
cd "$(dirname "$0")/.."
WAC="${WAC:-wac}"

# A dirty tree is refused: the tests would pass against the working copy and the push would carry the
# last commit, reporting success for work that never left the machine.
if [ -n "$(git status --porcelain)" ]; then
  echo "== uncommitted changes: commit them first, or the push will not include them =="
  git status --short
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
for attempt in 1 2 3; do
  git fetch -q origin "$branch" 2>/dev/null && { git merge -q --no-edit "origin/$branch" || exit 1; }
  sh tools/fill-cache.sh || exit 1
  # **check and test run beside build and test:ide**, which is the long half: test:ide is about 95s and needs only
  # dist/, and check and test read the sources and write nothing either of the others reads. Measured on 4 cores,
  # 2026-11-03: the four in a row were about 138s, and this is about the build plus test:ide.
  out="$(mktemp -d)"
  "$WAC" check src/ide.wac > "$out/check" 2>&1 & checkPid=$!
  "$WAC" task test > "$out/test" 2>&1 & testPid=$!
  echo "== build ==" && "$WAC" task build && echo "== test:ide ==" && node tools/ide_test.js; long=$?
  wait "$checkPid"; check=$?
  wait "$testPid"; tested=$?
  echo "== check ==" && cat "$out/check"
  echo "== test ==" && cat "$out/test"
  rm -rf "$out"
  [ "$check" -eq 0 ] && [ "$tested" -eq 0 ] && [ "$long" -eq 0 ] || exit 1
  if git push -u origin "$branch"; then exit 0; fi
  echo "== push refused: merging what landed and going again ($attempt) =="
done
exit 1
