# 개발 가이드

## 구조

```
apps/
├─ backoffice/   WMS 백오피스 (Angular 22, 주소 /)
└─ count/        현장 재고 실사 PWA (Angular 22, 주소 /count/)
packages/
├─ domain/       타입, 재고 규칙, 실사 정산, 품목 그림(SVG)
├─ wms-server/   업무 서버(규칙, ETag, 멱등 키, 예약). 저장 계층을 갈아 끼움(IndexedDB/Postgres)
├─ wms-api/      실제 서버(/api): Postgres 저장소, 변경 피드, 접속 표시, Cloudflare Worker 진입점
└─ wms-client/   Angular 연결 (HttpClient 인터셉터, 변경 알림, 네트워크 상태, 중복 제출 잠금)
e2e/             프로덕션 빌드 E2E (Playwright + axe)
scripts/         배포 구조 조립(Cloudflare 정적 자산), 정적 서버, API 번들
```

공유 패키지는 빌드하지 않고 TypeScript 소스를 그대로 씁니다. 앱의 `tsconfig.json` `paths`가 `@sog/*`를 각 패키지의 `src/index.ts`로 연결해, Angular 컴파일러가 앱 코드와 함께 컴파일합니다(데코레이터가 있는 `wms-client`도 마찬가지). 두 앱이 함께 쓰는 컴파일러·Angular 옵션은 루트의 `tsconfig.angular.json`에 있고, 앱마다 다른 경로 별칭만 각 앱의 `tsconfig.json`에 둡니다.

## Angular 사용 방식

| 항목 | 적용 |
|---|---|
| standalone | 모든 컴포넌트·파이프가 standalone. NgModule 없음 |
| zoneless | Angular 22 기본값. `zone.js`를 설치하지 않음 |
| signals | 상태는 `signal`·`computed`·`linkedSignal`, 입력은 `input()`·`model()`, 출력은 `output()` |
| 데이터 | GET은 `httpResource`·`resource`, 쓰기는 `HttpClient` + `firstValueFrom` |
| 폼 | Signal Forms(`@angular/forms/signals`의 `form`, `[formField]`, `submit`) |
| 제어 흐름 | `@if`·`@for`·`@switch`·`@let`, `*ngIf` 없음(ESLint `prefer-control-flow`) |
| `@defer` | 대시보드 차트(`on viewport`), 활동 피드(`on idle`), 대화상자 속 폼(`when open()`) |
| PWA | `SwUpdate`로 새 버전 알림, 카메라 스캔은 `BarcodeDetector`가 있을 때만(점진적 향상) |
| 변경 감지 | 모든 컴포넌트 `OnPush`(ESLint로 강제) |
| 라우팅 | 화면마다 지연 로딩, `withComponentInputBinding`으로 경로·쿼리를 입력으로 받음 |

Angular 22에서 오류 상태인 `resource`의 `value()`를 읽으면 예외가 납니다. 값을 읽을 때는 `hasValue()`를 먼저 확인합니다.

## FSD

두 앱 모두 `src/` 아래를 Feature-Sliced Design v2.1 계층으로 나눕니다: `app` → `pages` → `widgets` → `features` → `entities` → `shared`. 슬라이스는 `index.ts`로만 가져오고, Steiger로 검사합니다(`pnpm lint`). 기능끼리 서로 가져다 쓰면 Steiger가 막으므로, 여러 기능이 쓰는 업무 개체(예: 실사 앱의 보낼함)는 `entities`에 둡니다.

## 개발 서버

```bash
pnpm dev
```

- 백오피스 http://localhost:4200, 실사 앱 http://localhost:4200/count/
- 백오피스 개발 서버가 `/count/`를 실사 앱 개발 서버(4201)로 넘겨(`apps/backoffice/proxy.conf.json`), 두 앱이 같은 출처에서 데이터를 공유합니다.
- 실사 앱의 서비스 워커는 프로덕션 빌드에서만 켜집니다. 확인하려면 `pnpm preview`(빌드 후 http://localhost:4300).

개발 서버는 데모 모드(브라우저 안 데모 서버)로 동작합니다. 실제 서버 모드는 `pnpm preview:api`로 확인합니다([실제 서버](backend.md)).

데모 데이터는 백오피스 머리글의 "데모 초기화"로 처음 상태로 되돌립니다. 시드는 고정 난수로 만들어 언제 초기화해도 구성이 같고, 날짜만 초기화 시점을 기준으로 합니다.

## 테스트

| 명령 | 내용 |
|---|---|
| `pnpm test` | 업무 서버(동시 출고, 멱등 재전송, 재실사 충돌, 승인 정산, 출고 지시 경쟁·피킹·출고, 탭 간 알림, 로그인·역할, 변경 이력), 실제 서버(PGlite 위에서 트랜잭션 잠금, 변경 피드, 접속 표시, 재시드 방지), 도메인 규칙, 두 앱 컴포넌트(Vitest + Testing Library, jsdom + fake-indexeddb) |
| `pnpm test:storybook` | 모든 스토리를 Chromium에서 렌더링하고 axe 검사(`@storybook/addon-vitest`, `a11y.test: 'error'`) |
| `pnpm e2e` | 두 앱 프로덕션 빌드를 `/`·`/count/`로 합쳐 데모 모드(데스크톱·모바일)와 실제 서버 모드(PGlite)에서 로그인·역할, 변경 이력, 출고 지시·피킹, 업무 흐름, 동시 수정 충돌, 접속 표시, 창고 도면, CSV 내려받기, 오프라인 동기화, 서비스 워커, axe, 가로 넘침 검사 |

컴포넌트 테스트는 가짜 HTTP 대신 진짜 데모 서버를 fake-indexeddb 위에 띄웁니다. 같은 DB를 여는 서버를 하나 더 만들면 "다른 탭의 사용자"가 되어 충돌을 재현할 수 있습니다. 로그인이 필요한 컴포넌트와 스토리는 `seedTestSession(user)`로 데모 서명 키의 토큰을 미리 넣고 시작합니다.

데모 계정의 비밀번호는 모두 `sog-demo`입니다. 백오피스는 관리자(김하늘·박도윤), 현장 앱은 작업자(이서준·최민아·정우진)로 로그인합니다.

## 접근성 점검 (KWCAG 2.2)

axe 통과만으로 끝내지 않고 아래 항목을 직접 점검했습니다.

| 항목 | 적용 |
|---|---|
| 5.1.1 대체 텍스트 | 품목 그림은 이름과 시점을 대체 텍스트로, 이름이 옆에 있는 목록 썸네일은 빈 대체 텍스트 |
| 5.3.1 표 구성 | 표마다 `caption` 또는 이름 있는 영역, 열 제목 `th scope`, 정렬 상태 `aria-sort` |
| 5.4.1 색 무관 인식 | 재고·실사·동기화 상태는 색과 글자를 함께. 차트는 범례·합계·표 보기 |
| 5.4.3 명도 대비 | 글자 4.5:1 이상(토큰을 계산해 고름), 차트 색은 팔레트 검증 스크립트로 확인 |
| 6.1.1 키보드 | 차트는 초점을 받고 좌우 화살표·Home·End·Esc로 날짜별 값을 읽음. 창고 도면의 칸은 버튼(`aria-pressed`)이고 이름에 수량·상태를 담음 |
| 6.1.2 초점 | 화면을 바꾸면 새 화면 제목으로 초점 이동, 대화상자는 네이티브 `dialog` |
| 6.1.3 조작 크기 | 백오피스 40px, 실사 앱 48px 이상(장갑 낀 손) |
| 6.2.1 응답시간 | 알림은 6초 뒤 사라지지만 포인터·초점이 올라가면 멈추고 닫기 버튼 제공 |
| 6.4.1 건너뛰기 | 두 앱 모두 본문 바로가기 |
| 6.4.2 제목 | 화면마다 "화면 이름 · 앱 이름", 상세는 품목·작업 이름 |
| 6.5.3 레이블과 네임 | 숨김 설명을 붙인 버튼은 보이는 글자로 시작하는 `aria-label` |
| 7.1.1 기본 언어 | `lang="ko"` |
| 7.3.1 오류 정정 | 칸마다 오류 문구를 `aria-describedby`로 연결하고 `aria-invalid` 표시 |
| 7.3.2 레이블 | 모든 입력에 보이는 `label` |

## 품질 예산

- **번들 크기:** `pnpm size`가 백오피스 JS 255 kB·CSS 3 kB, 현장 앱 JS 230 kB·CSS 2 kB(gzip, 화면별 조각 포함)를 넘으면 실패합니다. 기준은 `.size-limit.json`에 있습니다.
- **Lighthouse:** `pnpm site` 뒤에 `pnpm lhci`가 배포와 같은 구조(`scripts/serve-site.mjs`, 데모 모드)로 두 앱의 첫 화면(백오피스 로그인, 현장 앱 로그인)을 데스크톱 기준 3번씩 재서 성능 90·접근성 100·권장 사항 95·SEO 90점, LCP 2.5초·TBT 200ms·CLS 0.1 이하인지 확인합니다. 데모 모드는 시작할 때 `/api/health`가 404인 것을 보고 정하므로, 콘솔의 404 한 건은 의도한 것입니다. 로그인 뒤 화면은 재지 않습니다. 백오피스 토큰은 탭마다 따로인 `sessionStorage`에 있어 Lighthouse가 여는 새 탭에 넘길 수 없기 때문입니다. 로그인 뒤 화면의 접근성(axe)과 가로 넘침은 E2E가 검사합니다.
- **템플릿 접근성:** `angular-eslint`의 `templateAccessibility` 규칙을 이미 씁니다.

## 모니터링

두 앱은 `packages/monitoring`(`@sog/monitoring`)의 `provideMonitoring(앱 이름, SENTRY_DSN)`을 앱 설정에 넣습니다.

| 환경 변수 | 내용 |
| --- | --- |
| `SENTRY_DSN` | 빌드할 때 있으면(`ng build --define`) 처리하지 못한 오류, Angular `ErrorHandler`가 받은 오류, 나쁜(poor) Web Vitals를 Sentry로 보냅니다. 없으면 Sentry를 불러오지 않고, 개발 모드에서 Web Vitals를 콘솔에만 찍습니다 |

- Angular CLI(application 빌더)는 `import.meta.env`를 쓰지 않으므로 각 앱의 `build` 스크립트가 `--define "SENTRY_DSN='$SENTRY_DSN'"`로 넣습니다. Turbo가 이 값을 빌드에 넘기도록 `turbo.json`의 `build.env`에 등록했습니다.
- Sentry는 페이지를 다 받은 뒤(load) 브라우저가 한가할 때 받고, load가 10초 안에 오지 않으면 그때 바로 받습니다.
- Sentry에는 오류 내용만 보내고 사용자 정보·쿠키·헤더·쿼리 문자열, 방문 기록(세션), 이동·클릭 기록(브레드크럼), 콘솔 기록, 콜백 인수, Error가 아닌 일반 객체로 거부된 Promise의 필드 값(`extra.__serialized__`)은 모으지 않습니다. Sentry를 받기 전에 난 오류는 최대 20개까지 모아 두었다가 처리되지 않은 오류로 보냅니다.
- 쓰는 함수만 `sentry.ts`에서 다시 내보내 약 28 kB(gzip)로 받습니다.
- 서버(Cloudflare Worker) 오류는 Cloudflare 대시보드의 Workers 로그나 `npx wrangler tail sog`로 확인합니다.

