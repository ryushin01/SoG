# CI · 배포

## GitHub Actions (`.github/workflows/ci.yml`)

`main` 푸시와 PR마다 실행합니다.

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (angular-eslint, 템플릿 접근성 규칙, Steiger FSD 규칙), `pnpm format:check`
3. `pnpm typecheck`
4. `pnpm test` (데모 서버, 도메인, 두 앱 컴포넌트)
5. Chromium 설치 후 `pnpm test:storybook` (모든 스토리 렌더링 + axe)
6. `pnpm build`
7. `pnpm e2e` (두 앱을 `/`·`/count/`로 합친 프로덕션 빌드. 데모 모드 데스크톱·모바일 + 실제 서버 모드)
8. `main`이면 `deploy` 작업이 Cloudflare Workers에 배포합니다(아래).

작업 전체는 40분, 단계마다 시간 제한을 둡니다. Playwright 브라우저는 버전별로 캐시하고, 설치가 멈추면 6분 뒤 끊고 최대 3번 다시 시도합니다(러너의 apt 설치가 멈춰 35분을 넘긴 일이 있었습니다).

실패하면 Playwright 보고서와 기록을 7일간 내려받을 수 있습니다.

pnpm 12는 허용하지 않은 의존성의 빌드 스크립트가 있으면 CI 설치를 실패로 끝냅니다. 빌드 스크립트가 필요한 의존성(지금은 `esbuild`)만 `pnpm-workspace.yaml`의 `allowBuilds`에 `true`로 둡니다. 의존성을 추가한 뒤 `pnpm ignored-builds`로 확인합니다.

Dependabot(`.github/dependabot.yml`)은 메이저를 뺀 업데이트를 주 1회, 출시 14일이 지난 버전만 PR로 올립니다. Angular와 Storybook 패키지는 묶어서 올립니다.

## Cloudflare Workers

Worker 하나(`sog`)에 두 앱의 정적 파일과 `/api`를 함께 올립니다. 두 앱이 같은 출처여야 데모 모드에서 데이터를 나눠 쓰고, 실제 서버 모드에서 같은 API를 쓰기 때문입니다. 설정은 `wrangler.jsonc`에 있습니다.

| 주소 | 내용 |
|---|---|
| https://sog.ryushin01.workers.dev/ | 백오피스 |
| https://sog.ryushin01.workers.dev/count/ | 현장 실사 앱(PWA) |
| https://sog.ryushin01.workers.dev/storybook/backoffice | 백오피스 Storybook |
| https://sog.ryushin01.workers.dev/storybook/count | 실사 앱 Storybook |

- 배포: `main`에 머지하면 CI의 `deploy` 작업이 두 앱과 Storybook을 빌드하고, `scripts/build-cloudflare.mjs`로 `site/`를 만든 뒤 `wrangler deploy`로 올립니다. Actions에서 CI를 직접 실행해도(workflow_dispatch) 다시 배포합니다. 저장소 Secret `CLOUDFLARE_API_TOKEN`(Workers 편집 권한, Hyperdrive 편집 권한)과 `CLOUDFLARE_ACCOUNT_ID`가 필요하고, 토큰이 없으면 경고만 남기고 배포를 건너뜁니다(그때는 `npx wrangler deploy`로 직접 배포).
- 배포 건너뛰기: 직전 푸시와 비교해 문서·E2E·테스트·스토리·CI 설정만 바뀌었으면 배포하지 않습니다.
- 라우팅: Worker는 `/api/*`와 실사 앱의 화면 주소(`/count/` 아래 점 없는 주소)만 받고, 나머지 파일은 Cloudflare가 바로 내보냅니다(`assets.run_worker_first`). 실사 앱 화면 주소는 실사 앱의 `index.html`로, 그 밖의 없는 주소는 백오피스의 `index.html`로 답합니다.
- Storybook: 폴더 주소로 열면 상대 경로 파일을 못 찾으므로 `index.html`로 redirect합니다(`site/_redirects`).
- 캐시: 서비스 워커 파일(`ngsw-worker.js`, `ngsw.json`)은 `no-cache`, 해시가 붙은 JS·CSS는 1년입니다(`site/_headers`).
- DB: Neon(무료, 싱가포르)에 Hyperdrive 설정 `sog-db`로 연결합니다. Hyperdrive가 연결을 DB 가까이에 모아 두어 요청마다 새로 연결해도 빠릅니다. 쿼리 결과 캐시는 꺼서 변경 피드·접속 표시가 늦게 보이지 않게 했습니다. Neon 프로젝트는 처음에 Vercel Marketplace 연동으로 만들어 Vercel 프로젝트 `sog`에 묶여 있으므로, 그 Vercel 프로젝트는 지우지 않습니다(배포만 끊었습니다).
- 비밀 값: `AUTH_SECRET`(로그인 토큰 서명)과 `CRON_SECRET`(매일 초기화)은 Worker Secret입니다(`npx wrangler secret put AUTH_SECRET`).
- 예약 작업: 매일 03:00(KST) Cron Trigger가 데모 데이터를 처음 상태로 되돌립니다(`triggers.crons`).
- 무료 요금제 한도: Worker 요청 하루 10만 건, Hyperdrive 쿼리 하루 10만 건입니다. 정적 파일은 한도를 쓰지 않습니다. 화면을 열어 둔 탭은 변경 피드(2.5초)와 접속 표시(3초)를 폴링하므로, 여러 탭을 하루 종일 열어 두면 한도에 다가갑니다.
- 로그: Cloudflare 대시보드의 Workers 로그나 `npx wrangler tail sog`로 봅니다.

서비스 워커 범위는 `/count/`입니다. 실사 앱만 오프라인 캐시를 쓰고 백오피스에는 영향을 주지 않습니다.

## 배포된 사이트 검사

```bash
E2E_BASE_URL=https://sog.ryushin01.workers.dev pnpm --filter @sog/e2e exec playwright test
```

로컬 서버 없이 배포된 사이트(실제 서버 모드)에 같은 E2E를 돌립니다. 테스트마다 서버 데이터를 초기화하므로, 다른 사람이 쓰고 있을 때는 돌리지 않습니다.

## 미리보기 배포

PR 미리보기 배포는 만들지 않습니다. PR에서는 CI 검사만 돌고, `main`에 머지할 때만 운영으로 배포합니다. 배포 전 화면은 `pnpm preview`(데모 모드)나 `pnpm preview:api`(실제 서버 모드)로 확인합니다.
