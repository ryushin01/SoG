# SoG(System of Goods) 에이전트 안내

## 1. 프로젝트 개요

물류창고 재고를 관리하는 백오피스와 창고 현장에서 재고 실사·피킹을 하는 작업자용 PWA를 담은 모노레포입니다. 동시 수정·실사 중 입출고·마지막 재고 경쟁·오프라인에서도 재고가 어긋나지 않게 하는 동시성 제어가 핵심입니다.

- 화면 축: 백오피스(웹, `apps/backoffice`, 주소 `/`) · 창고 실사 앱(작업자용 PWA, `apps/count`, 주소 `/count/`)
- 운영: 백오피스 https://sog.ryushin01.workers.dev/ · 실사 앱 https://sog.ryushin01.workers.dev/count/ · Storybook https://sog.ryushin01.workers.dev/storybook/backoffice/, `/storybook/count/`
- 데모 계정 비밀번호는 모두 `sog-demo`(관리자는 백오피스, 작업자는 실사 앱). 데이터는 매일 03:00(KST) 처음 상태로 돌아갑니다.
- 자세한 내용: `docs/development.md`, `docs/backend.md`, `docs/ci-deploy.md`, `docs/concurrency.md`, `docs/design.md`

## 2. 기술 스택과 구조

- pnpm + Turborepo. Angular 22(standalone, zoneless, signals, `httpResource`, Signal Forms, `@if`·`@for` 제어 흐름, 모든 컴포넌트 `OnPush`), Cloudflare Workers + Hyperdrive + Neon Postgres, 로컬·테스트는 PGlite·IndexedDB
- `apps/backoffice`, `apps/count` / `packages/domain`(타입·재고 규칙·zod 스키마), `packages/wms-server`(업무 서버: 규칙·ETag·멱등 키·예약, 저장 계층 교체), `packages/wms-api`(실제 서버 `/api`, Worker 진입점 `cloudflare.ts`), `packages/wms-client`(Angular 연결), `packages/monitoring`(Sentry) / `e2e`(Playwright + axe) / `scripts`(배포 구조 조립)
- 공유 패키지는 빌드하지 않고 소스를 씁니다(앱 `tsconfig.json`의 `paths`가 `@sog/*`를 `src/index.ts`로 연결). 공통 컴파일러 옵션은 루트 `tsconfig.angular.json`.
- FSD v2.1: 두 앱 모두 `src/` 아래 `app` → `pages` → `widgets` → `features` → `entities` → `shared`. 슬라이스는 `index.ts`로만 가져오고 Steiger로 검사합니다(`pnpm lint`). 여러 기능이 쓰는 업무 개체는 `entities`에 둡니다.
- 업무 서버의 새 라우트는 `packages/wms-server/src/routes/*.ts` 표에 더하고, 쓰기는 `mutate(ctx, 멱등 범위, 처리기)`로 감쌉니다.

## 3. 설치·개발 명령

- 패키지 매니저: pnpm(`packageManager`), Node.js 22(`.nvmrc`)

```bash
pnpm install
pnpm dev             # 백오피스 http://localhost:4200, 실사 앱 http://localhost:4200/count/ (데모 모드)
pnpm preview         # 빌드 뒤 배포 구조로 http://localhost:4300 (데모 모드, 서비스 워커 확인)
pnpm preview:api     # 실제 서버 모드(/api를 PGlite 위 서버가 받음)
pnpm fonts           # 화면 글자를 바꾸면 한글 글꼴 조각 다시 만들기
```

- 환경 변수·비밀(이름만): `SENTRY_DSN`(빌드 때, 선택), Worker Secret `AUTH_SECRET`·`CRON_SECRET`, `wrangler.jsonc`의 `vars.DEMO_RESET`, 저장소 Secret `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`
- 개발 서버와 `pnpm preview`는 브라우저 안 데모 서버(IndexedDB), 운영은 실제 서버 모드입니다. 시드 구성을 바꾸면 `server.ts`의 `SEED_VERSION`을 올립니다.

## 4. 검사·테스트 명령

CI(`.github/workflows/ci.yml`)는 이 순서로 돕니다. 커밋 때 husky가 lint-staged(ESLint·Prettier)와 `pnpm typecheck`를 돌립니다.

```bash
pnpm install --frozen-lockfile
pnpm lint                # ESLint(angular-eslint, 템플릿 접근성) + Steiger
pnpm format:check        # Prettier
pnpm typecheck
pnpm test                # Vitest: 업무 서버·실제 서버(PGlite)·도메인·두 앱 컴포넌트
pnpm --filter @sog/e2e exec playwright install --with-deps chromium
pnpm test:storybook      # 모든 스토리를 Chromium에서 렌더링 + axe(a11y.test: 'error')
pnpm build
pnpm e2e                 # 프로덕션 빌드를 / · /count/로 합쳐 데모 모드(데스크톱·모바일) + 실제 서버 모드
pnpm site && pnpm size && pnpm lhci   # 번들 예산(.size-limit.json), Lighthouse(성능 90·접근성 100)
```

- **Testing Library 원칙:** 구현 세부가 아니라 사용자가 보는 동작을 검사하고, 요소는 역할·이름(`getByRole`)이나 레이블(`getByLabelText`)로 찾습니다. 도구는 단위·컴포넌트 Vitest + `@testing-library/angular`(+ `user-event`, jsdom, fake-indexeddb), 화면 흐름 Playwright E2E, 접근성 `@axe-core/playwright`와 Storybook `addon-a11y`입니다.
- 컴포넌트 테스트는 가짜 HTTP 대신 진짜 데모 서버를 fake-indexeddb 위에 띄웁니다. 로그인이 필요하면 `seedTestSession(user)`를 씁니다.
- 배포된 사이트 검사: `E2E_BASE_URL=https://sog.ryushin01.workers.dev pnpm --filter @sog/e2e exec playwright test`(서버 데이터를 초기화하므로 다른 사람이 쓸 때는 돌리지 않음)

## 5. 코드 스타일

- **TypeScript strict**(`tsconfig.base.json`, `tsconfig.angular.json`의 `"strict": true`)를 유지하고 `any`·`as` 단언·`@ts-ignore`는 피합니다. 외부 입력(요청 본문, 기기 저장값, 로그인 응답)은 zod 스키마(`@sog/domain`)로 확인합니다.
- **Prettier**(`.prettierrc.json`: `printWidth: 100`, `singleQuote`, `semi`, `trailingComma: all`, HTML은 `angular` 파서)와 `.editorconfig`, ESLint(`--max-warnings 0`, `simple-import-sort`)를 따릅니다. Biome는 쓰지 않습니다.
- Angular 규칙: NgModule·`*ngIf` 없음, 상태는 `signal`·`computed`, 입력은 `input()`·`model()`, 출력은 `output()`, 모든 컴포넌트 `OnPush`. 오류 상태인 `resource`는 `hasValue()`를 먼저 확인합니다.
- 브라우저 안 데모 서버(`@sog/wms-server`)는 앱 코드에서 정적으로 가져오지 않습니다(`import()`로만, 테스트 제외).
- 접근성(**WCAG 2.2·KWCAG 2.2**): axe 통과만으로 끝내지 않고 `docs/development.md`의 KWCAG 점검표를 지킵니다. 네이티브 요소(`<dialog>`, `<button>`) 우선, 글자 대비 4.5:1 이상, 키보드 조작과 초점 표시, 화면 전환 시 제목으로 초점 이동, 조작 크기 백오피스 40px·실사 앱 48px 이상(최소 24px), 모든 입력에 보이는 `label`, 오류는 `aria-invalid`·`aria-describedby`, 화면 전환 없는 안내는 `role="status"`, 본문 바로가기, 화면마다 고유 제목. 자동 검사는 angular-eslint `templateAccessibility`(React용 eslint-plugin-jsx-a11y 대신), Storybook·Playwright의 axe, Lighthouse 접근성 100점 하한입니다.
- 버그를 고치면 고치기 전에 실패하는 테스트를 함께 넣습니다.

## 6. Git·PR

- **흐름: GitHub Flow.** `main`에 직접 커밋·푸시하지 않고, 최신 `main`에서 브랜치를 만들어 PR로만 병합합니다.
- **브랜치 이름:** `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `test/…`, `chore/…`, `release/…`. 이 저장소는 버전을 브랜치에도 넣습니다(예: `feat/v1.4.0-labels-alerts`, `perf/v1.1.1-batch-reads`).
- **커밋 메시지: Conventional Commits.** `<타입>: <한국어 요약>`, 타입은 `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `style`, `chore`, `ci`, `build`. 이 저장소는 버전을 끝의 `(x.y.z)` 대신 앞에 `v`와 줄표로 붙입니다(표준과 다른 점). 예: `feat: v1.4.0 — 바코드 라벨 인쇄와 안전 재고 알림`, `perf: v1.1.1 — 같은 순간에 읽는 여러 저장소를 쿼리 하나로 묶기`. PR 안의 후속 커밋은 버전 없이 씁니다(`fix: 두 앱 의존성에 zod 명시 — …`). 호환이 깨지면 본문에 `BREAKING CHANGE:`.
- 본문은 한국어 목록으로 적습니다.
- **작성자:** 커밋 작성자는 항상 ryushin01(`ryushin0 <141554987+ryushin01@users.noreply.github.com>`)입니다(기여자는 ryushin01만 남김). 백엔드 코드가 있는 저장소라 공동 작성자 줄은 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 하나만 넣습니다.
- GitHub Actions가 커밋하는 워크플로는 작성자를 ryushin01로 설정합니다(`github-actions[bot]` 금지). Dependabot PR은 그대로 병합하지 말고 같은 변경을 ryushin01 커밋으로 다시 만들어 병합합니다.
- **버전: Semantic Versioning.** 모든 앱·패키지의 `package.json` `version`(`apps/*`, `packages/*`, 지금 1.4.0)과 README 버전 배지를 한 번에 맞춥니다(루트 `package.json`에는 버전이 없음).
- **변경 기록: Keep a Changelog 기반.** `CHANGELOG.md`(제목 `# 버전 기록`)에 최신 버전을 위에 두고 `## x.y.z - YYYY-MM-DD` 아래 요약 한 줄과 `- 주제: 내용` 목록으로 적습니다. `[Unreleased]` 절과 추가·변경·수정·제거 소제목은 쓰지 않습니다(표준과 다른 점).
- **병합:** merge commit(`Merge pull request #번호 …`)입니다. CI가 통과하면 바로 병합하고 CodeRabbit 리뷰는 기다리지 않습니다. 이미 달린 맞는 지적은 반영한 뒤 병합합니다.
- 의존성 빌드 스크립트는 `pnpm-workspace.yaml`의 `allowBuilds`에 허용한 것만 돕니다(새 의존성 뒤 `pnpm ignored-builds`로 확인).

## 7. 배포·릴리스

- Cloudflare Workers(`wrangler.jsonc`, Worker `sog`): `main`에 병합하면 CI의 `deploy` 작업이 두 앱과 Storybook을 빌드하고 `scripts/build-cloudflare.mjs`로 `site/`를 만든 뒤 `wrangler deploy`로 올립니다. 문서·E2E·테스트·스토리·CI 설정만 바뀌면 배포를 건너뜁니다. PR 미리보기 배포는 없습니다.
- 토큰이 없어 배포가 건너뛰어지면 `npx wrangler deploy`로 직접 배포합니다. 로그는 `npx wrangler tail sog`.
- 운영이 곧 공개 데모입니다(`DEMO_RESET=on`, 매일 03:00 Cron이 초기화). 옛 Vercel 프로젝트 `sog`는 Neon 연동과 308 이동 때문에 지우지 않습니다.
- 릴리스: 병합 뒤 `v1.4.0` 형식 태그로 GitHub 릴리스(대상은 병합 커밋 전체 SHA, 본문은 CHANGELOG 해당 절)를 만들고 `bash ~/Documents/Archive/Backup/backup.sh`로 백업합니다.
- 진행 기록: Obsidian 보관함 `SoG v1.0.0 고도화 계획.md`. 소개가 크게 바뀌면 프로필 저장소 `ryushin01/ryushin01` README 표를 고칩니다.

## 8. 보안·주의사항

- 비밀값과 `.env`는 커밋하지 않습니다. `AUTH_SECRET`·`CRON_SECRET`은 Worker Secret, Cloudflare 토큰은 저장소 Secret입니다.
- DB 스키마는 별도 마이그레이션 없이 첫 요청에서 `create table if not exists`로 만들고, 시드는 `meta` 문서가 없을 때만 넣습니다. 실제 서버는 시드 버전이 바뀌어도 다시 채우지 않으므로(`reseedOnVersionChange`) 운영 데이터는 배포 뒤 "데모 초기화"나 03:00 예약 작업으로 바뀝니다.
- 보안 헤더 값은 `packages/wms-api/src/security-headers.json` 한 곳에 두고 `site/_headers`·`cloudflare.ts`·`serve-site.mjs`가 같은 값을 씁니다. 전체 스크립트 CSP는 넣지 않았습니다(Angular 실행 중 스타일 때문).
- 무료 한도: Worker 요청·Hyperdrive 쿼리 각각 하루 10만 건. `/api/live` 폴링 간격을 줄이지 않습니다.
- 데모라 비밀번호를 공개합니다. 실제 서비스로 바꿀 때 필요한 것은 `docs/backend.md`의 `알려 둘 점`에 있습니다.
- 배포 구조의 라우팅(`not_found_handling: none`, `run_worker_first`)과 Storybook 넘김 규칙은 이유가 있어 둔 것이니 `docs/ci-deploy.md`를 읽고 고칩니다.

## 9. 공통 규칙

공통 규칙은 `~/Documents/GitHub/CLAUDE.md`에 있습니다(이 저장소 문서가 우선). 핵심:

- 답변·커밋·PR·문서·주석은 한국어로 씁니다.
- 허락을 묻지 않고 끝까지 진행한 뒤 한 번에 보고합니다(비용·비밀값·디자인 결정·되돌릴 수 없는 공개 행동은 보고만).
- 사용자의 진행 중 작업을 보호합니다. 커밋하지 않은 변경이 있으면 `git worktree add`로 따로 작업하고 끝나면 지웁니다.
- 다른 세션 공지는 ryushin01 그룹 세션에만 보냅니다.
