#!/usr/bin/env bash
# Vercel의 Ignored Build Step. 화면·서버에 영향이 없는 변경이면 빌드를 건너뜁니다(종료 코드 0이 건너뛰기, 1이 빌드).
# 무료 요금제의 하루 배포 횟수를 아끼기 위한 것입니다.
# 마지막으로 배포한 커밋(VERCEL_GIT_PREVIOUS_SHA)과 비교해, 한 번에 여러 커밋을 올려도 앞 커밋의 변경을 놓치지 않습니다.
# 비교할 커밋을 찾지 못하면 안전하게 빌드합니다.
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
git cat-file -e "$base^{commit}" 2>/dev/null || git fetch --quiet --depth=50 origin "$base" 2>/dev/null || true
git cat-file -e "$base^{commit}" 2>/dev/null || exit 1
changed=$(git diff --name-only "$base" HEAD)
[ -z "$changed" ] && exit 0
if echo "$changed" | grep -qvE '(^docs/|\.md$|^e2e/|\.spec\.ts$|\.test\.ts$|\.stories\.ts$|^\.github/|^\.husky/|^\.vscode/|^\.prettier|^\.editorconfig$)'; then
  exit 1
fi
exit 0
