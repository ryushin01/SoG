# CI · 배포

## GitHub Actions (`.github/workflows/ci.yml`)

`main` 푸시와 PR마다 실행합니다.

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (angular-eslint, 템플릿 접근성 규칙, Steiger FSD 규칙), `pnpm format:check`
3. `pnpm typecheck`
4. `pnpm test` (데모 서버, 도메인, 두 앱 컴포넌트)
5. Chromium 설치 후 `pnpm test:storybook` (모든 스토리 렌더링 + axe)
6. `pnpm build`
7. `pnpm e2e` (두 앱을 `/`·`/count/`로 합친 프로덕션 빌드, 데스크톱·모바일)

실패하면 Playwright 보고서와 기록을 7일간 내려받을 수 있습니다.

pnpm 12는 허용하지 않은 의존성의 빌드 스크립트가 있으면 CI 설치를 실패로 끝냅니다. 빌드 스크립트가 필요한 의존성(지금은 `esbuild`)만 `pnpm-workspace.yaml`의 `allowBuilds`에 `true`로 둡니다. 의존성을 추가한 뒤 `pnpm ignored-builds`로 확인합니다.

Dependabot(`.github/dependabot.yml`)은 메이저를 뺀 업데이트를 주 1회, 출시 14일이 지난 버전만 PR로 올립니다. Angular와 Storybook 패키지는 묶어서 올립니다.

## Vercel

프로젝트 하나(`sog`)에 두 앱을 함께 올립니다. 두 앱이 같은 출처여야 브라우저 안 데모 서버(IndexedDB)와 변경 알림(BroadcastChannel)을 나눠 쓰기 때문입니다.

| 주소 | 내용 |
|---|---|
| https://sog-pi.vercel.app/ | 백오피스 |
| https://sog-pi.vercel.app/count/ | 현장 실사 앱(PWA) |
| https://sog-pi.vercel.app/storybook/backoffice | 백오피스 Storybook |
| https://sog-pi.vercel.app/storybook/count | 실사 앱 Storybook |

설정은 `vercel.json`에 있습니다.

- 빌드: 두 앱과 Storybook을 빌드한 뒤 `scripts/assemble-site.mjs`가 `site/`로 합칩니다.
- 화면 주소: 파일이 없으면 `/count/**`는 실사 앱의 `index.html`로, 나머지는 백오피스의 `index.html`로 보냅니다.
- Storybook: 폴더 주소를 rewrite하면 상대 경로 파일을 못 찾으므로 `index.html`로 redirect합니다.
- 캐시: 서비스 워커 파일(`ngsw-worker.js`, `ngsw.json`)은 `no-cache`, 해시가 붙은 JS·CSS는 1년.

서비스 워커 범위는 `/count/`입니다. 실사 앱만 오프라인 캐시를 쓰고 백오피스에는 영향을 주지 않습니다.

## 배포된 사이트 검사

```bash
E2E_BASE_URL=https://sog-pi.vercel.app pnpm --filter @sog/e2e exec playwright test
```

로컬 서버 없이 배포된 사이트에 같은 E2E를 돌립니다.
