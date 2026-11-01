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
  echo "== check ==" && "$WAC" check src/ide.wac || exit 1
  echo "== test ==" && "$WAC" task test || exit 1
  echo "== build ==" && "$WAC" task build || exit 1
  echo "== test:ide ==" && node tools/ide_test.js || exit 1
  if git push -u origin "$branch"; then exit 0; fi
  echo "== push refused: merging what landed and going again ($attempt) =="
done
exit 1
