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

작업 전체는 40분, 단계마다 시간 제한을 둡니다. Playwright 브라우저는 버전별로 캐시하고, 설치가 멈추면 6분 뒤 끊고 최대 3번 다시 시도합니다(러너의 apt 설치가 멈춰 35분을 넘긴 일이 있었습니다).

실패하면 Playwright 보고서와 기록을 7일간 내려받을 수 있습니다.

pnpm 12는 허용하지 않은 의존성의 빌드 스크립트가 있으면 CI 설치를 실패로 끝냅니다. 빌드 스크립트가 필요한 의존성(지금은 `esbuild`)만 `pnpm-workspace.yaml`의 `allowBuilds`에 `true`로 둡니다. 의존성을 추가한 뒤 `pnpm ignored-builds`로 확인합니다.

Dependabot(`.github/dependabot.yml`)은 메이저를 뺀 업데이트를 주 1회, 출시 14일이 지난 버전만 PR로 올립니다. Angular와 Storybook 패키지는 묶어서 올립니다.

## Vercel

프로젝트 하나(`sog`)에 두 앱과 `/api` 함수를 함께 올립니다. 두 앱이 같은 출처여야 데모 모드에서 데이터를 나눠 쓰고, 실제 서버 모드에서 같은 API를 쓰기 때문입니다.

| 주소 | 내용 |
|---|---|
| https://sog-ryushin01.vercel.app/ | 백오피스 |
| https://sog-ryushin01.vercel.app/count/ | 현장 실사 앱(PWA) |
| https://sog-ryushin01.vercel.app/storybook/backoffice | 백오피스 Storybook |
| https://sog-ryushin01.vercel.app/storybook/count | 실사 앱 Storybook |

- 빌드: 두 앱과 Storybook을 빌드한 뒤 `scripts/build-vercel.mjs`가 [Build Output API](https://vercel.com/docs/build-output-api/v3) 형식(`.vercel/output`)으로 정적 사이트, `/api` 함수(Node 22, 싱가포르 `sin1`), 라우팅을 만듭니다. 라우팅과 캐시 규칙은 이 스크립트의 `config.json`에 있고, `vercel.json`에는 빌드 명령과 건너뛰기 규칙만 둡니다.
- 화면 주소: 파일이 없으면 `/count/**`는 실사 앱의 `index.html`로, 나머지는 백오피스의 `index.html`로 보냅니다.
- Storybook: 폴더 주소를 rewrite하면 상대 경로 파일을 못 찾으므로 `index.html`로 redirect합니다.
- 캐시: 서비스 워커 파일(`ngsw-worker.js`, `ngsw.json`)은 `no-cache`, 해시가 붙은 JS·CSS는 1년.
- DB: Vercel Marketplace의 Neon(무료, 싱가포르)을 **운영 환경에만** 연결했습니다. 미리보기 배포에는 `DATABASE_URL`이 없어 `/api`가 503을 돌려주고, 앱은 브라우저 안 데모 서버로 동작합니다.
- 빌드 건너뛰기: `scripts/vercel-ignore.sh`가 마지막으로 배포한 커밋(`VERCEL_GIT_PREVIOUS_SHA`)과 비교해, 문서·E2E·테스트·스토리·CI 설정만 바뀌었으면 빌드를 건너뜁니다. 무료 요금제의 하루 배포 횟수(리뷰 반영 커밋이 많았던 날 한도에 걸린 적이 있습니다)를 아끼기 위한 것입니다.

서비스 워커 범위는 `/count/`입니다. 실사 앱만 오프라인 캐시를 쓰고 백오피스에는 영향을 주지 않습니다.

## 배포된 사이트 검사

```bash
E2E_BASE_URL=https://sog-ryushin01.vercel.app pnpm --filter @sog/e2e exec playwright test
```

로컬 서버 없이 배포된 사이트(실제 서버 모드)에 같은 E2E를 돌립니다. 테스트마다 서버 데이터를 초기화하므로, 다른 사람이 쓰고 있을 때는 돌리지 않습니다.
