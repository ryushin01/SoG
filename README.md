# SoG - System of Goods

[![CI](https://github.com/ryushin01/SoG/actions/workflows/ci.yml/badge.svg)](https://github.com/ryushin01/SoG/actions/workflows/ci.yml)
![version](https://img.shields.io/badge/version-0.4.1-911a46)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![Storybook](https://img.shields.io/badge/Storybook-10-FF4785?logo=storybook&logoColor=white)

물류창고의 재고를 관리하는 백오피스와, 창고 현장에서 재고 실사·피킹을 하는 작업자용 PWA를 한 저장소에 담은 모노레포입니다. 두 사람이 같은 재고를 동시에 고쳐도, 실사 도중 물건이 들고 나도, 마지막 재고를 두 출고 지시가 동시에 잡으려 해도, 음영 지역에서 연결이 끊겨도 재고가 어긋나지 않도록 동시성 제어에 집중했습니다.

**[백오피스 보기](https://sog.ryushin01.workers.dev/)** · **[현장 실사 앱 보기](https://sog.ryushin01.workers.dev/count/)** · **[Storybook](https://sog.ryushin01.workers.dev/storybook/backoffice/)** · 데모 계정의 비밀번호는 모두 `sog-demo`입니다. 데이터는 서버(Postgres)에 있어서, 휴대폰으로 실사 앱을 열고 PC로 백오피스를 열면 센 수량과 피킹이 바로 나타납니다.

> **프로젝트 상태:** 실제 창고에 쓰지 않는 **포트폴리오 프로젝트**입니다. 운영 사이트는 Cloudflare Workers와 Neon(Postgres) 위의 실제 서버로, 개발 서버와 `pnpm preview`는 같은 코드를 브라우저 안(IndexedDB)에서 돌리는 데모 서버로 동작합니다. 품목·작업자·재고는 모두 가상 데이터이고, 매일 03:00(KST)에 처음 상태로 돌아갑니다.

## 화면

품목 사진은 이미지 파일 없이 코드(SVG)로 그렸습니다. 다른 화면은 [디자인 문서](docs/design.md#화면)에 있습니다.

| 운영 현황 | 동시 수정 충돌 |
|---|---|
| ![재고 금액·보유 수량·부족 품목·진행 중 실사·재고 정확도 수치와 14일 입고·출고 막대 차트](docs/images/backoffice-dashboard.jpg) | ![다른 관리자가 먼저 저장해 안전 재고의 내 입력 25와 최신 값 40을 나란히 보여 주는 충돌 안내](docs/images/backoffice-conflict.jpg) |

| 출고 지시 | 현장 앱 피킹 |
|---|---|
| ![한빛리테일 출고 지시의 피킹 동선 표, 위에 현장 앱의 이서준이 물티슈 앞에 있다는 접속 표시](docs/images/backoffice-order.jpg) | ![휴대폰 화면의 피킹 동선, 첫 로케이션이 펼쳐져 수량 4와 집음 확인 버튼이 보임](docs/images/count-pick.jpg) |

| 변경 이력 | 백오피스 로그인 |
|---|---|
| ![품목의 변경 이력. 박도윤이 안전 재고를 30에서 40으로 바꾼 v2 기록 위에, 김하늘의 25 입력이 버전 충돌로 막힌 기록과 이 값으로 다시 버튼](docs/images/backoffice-history.jpg) | ![김하늘·박도윤 관리자 계정 선택, 비밀번호 칸과 데모 비밀번호 sog-demo 안내가 있는 로그인 화면](docs/images/backoffice-login.jpg) |

| 현장 앱 품목 실사 | 오프라인 보낼함 |
|---|---|
| ![휴대폰 화면의 큰 품목 그림, 로케이션 스와치, 빼기·더하기 버튼이 있는 수량 입력](docs/images/count-item.jpg) | ![오프라인 모의 스위치가 켜져 있고 보내기를 기다리는 실사 기록 한 건이 있는 보낼함](docs/images/count-outbox.jpg) |

## 주요 기능

**백오피스** (`apps/backoffice`, 주소 `/`)

| 기능 | 내용 |
|---|---|
| 로그인 | 관리자만 로그인(탭마다 다른 계정으로 동시 수정 시연), 관리 기능은 서버가 역할로 막음 |
| 운영 현황 | 재고 금액·수량, 부족·품절, 진행 중 실사, 재고 정확도, 14일 입출고 차트(키보드로 값 읽기, 표 보기), 구역별 재고, 최근 활동 |
| 재고 | 품목명·코드·바코드 검색, 분류·상태·구역 필터(주소에 남음), 열 정렬, 필터 그대로 CSV 내보내기. 다른 탭에서 입출고가 일어나면 표가 바로 바뀜 |
| 품목 상세 | 기본 정보 수정, 로케이션별 재고 조정, 입고·출고·이동 등록, 이동 기록, 누가 무엇을 바꿨는지와 충돌로 막힌 시도를 보여 주는 변경 이력(그때 값 불러오기) |
| 재고 실사 | 구역 단위 작업 생성(블라인드 실사), 현장 진행 실시간 확인, 차이 검토, 재실사 요청, 승인 시 재고 반영, 차이 보고서 CSV |
| 출고 지시 | 만들 때 가용 재고를 로케이션별로 예약(동시에 같은 재고를 잡으면 한쪽만 성공), 피킹 진행 실시간 확인, 출고 확정(덜 집은 예약은 해제), 취소 |
| 창고 도면 | 구역·통로·랙·단을 실제 배치대로 펼친 격자. 칸마다 보유 수량, 부족·품절, 실사 중 표시, 칸을 고르면 보관 품목 |
| 함께 보는 사람 | 같은 품목·실사 작업을 지금 보고 있는 관리자와 작업자, 수정 중 여부, 작업자가 세고 있는 품목 |
| 활동 기록 | 입출고, 실사, 정보 수정, 막아 낸 동시 수정 충돌 |

**현장 실사 앱** (`apps/count`, 주소 `/count/`, PWA)

| 기능 | 내용 |
|---|---|
| 작업 | 작업자로 로그인하면(기기에 유지) 배정된 실사 작업이 열림. 로케이션 순서로 묶은 품목 목록 |
| 품목 실사 | 사진 갤러리, 같은 품목의 다른 로케이션, 큰 −/+ 수량 입력, 블라인드 실사, 메모. 저장하면 다음 품목으로 |
| 피킹 | 배정된 출고 지시를 로케이션 동선 순서로, 집은 수량 확인, 덜 집으면 사유 |
| 바코드 | 현장 스캐너(키보드 입력)나 카메라(BarcodeDetector 지원 기기)로 찍으면 해당 품목으로 이동, 진동으로 결과 알림 |
| 함께 세기 | 다른 작업자가 같은 품목 앞에 있으면 알려 이중 실사를 막음 |
| 오프라인 | 센 수량은 기기 보낼함에 먼저 저장, 연결되면 자동으로 보냄. 진행 중 작업은 미리 받아 둠 |
| 설치 | 서비스 워커와 앱 매니페스트로 홈 화면에 설치, 연결이 끊긴 곳에서도 열림, 새 버전 알림 |

**동시성 제어**: 서명 토큰 로그인과 역할 검사, ETag·If-Match 낙관적 잠금(412 충돌 비교), 쓰기 직렬화(브라우저는 Web Locks, 서버는 Postgres 트랜잭션 잠금), 재고 예약, 멱등 키, 실사 중 이동을 반영하는 정산 규칙, 중복 제출 잠금, BroadcastChannel 실시간 반영, 충돌 전에 알려 주는 접속 표시(presence). 자세한 내용은 [동시성 제어](docs/concurrency.md)에 있습니다.

## 기술 스택

![Angular, TypeScript, PostgreSQL, Vite, pnpm, Vitest, Cloudflare, GitHub Actions](https://skillicons.dev/icons?i=angular,ts,postgres,vite,pnpm,vitest,cloudflare,githubactions)

| 구분 | 사용 기술 |
|---|---|
| 구성 | pnpm 워크스페이스, Turborepo, Feature-Sliced Design v2.1 (Steiger로 검사) |
| 프레임워크 | Angular 22 (standalone, zoneless, signals, `@if`·`@for`, `@defer`, Signal Forms, `httpResource`), TypeScript 6 |
| PWA | @angular/service-worker(SwUpdate), Web App Manifest, BarcodeDetector, Vibration API |
| 서버·데이터 | Cloudflare Workers(정적 자산 + `/api`), Hyperdrive, Neon Postgres, node-postgres, PGlite(테스트·로컬), 브라우저 데모 서버(IndexedDB, Web Locks, BroadcastChannel) |
| 품질 | ESLint(angular-eslint, 템플릿 접근성 규칙), Prettier, husky + lint-staged, Vitest 5 + Testing Library + fake-indexeddb, Storybook 10(angular-vite) 스토리 테스트(실제 브라우저 + axe), Playwright + axe(프로덕션 빌드·배포 사이트 E2E), size-limit, Lighthouse CI |
| 모니터링 | Sentry(DSN이 있을 때만), web-vitals (`@sog/monitoring`) |
| 배포 | Cloudflare Workers(두 앱과 API를 한 주소로), GitHub Actions, Dependabot |

## 시작하기

Node.js 22 이상(`.nvmrc`)과 pnpm 12가 필요합니다.

```bash
corepack enable pnpm
pnpm install
pnpm dev    # 백오피스 http://localhost:4200 · 실사 앱 http://localhost:4200/count/
```

| 명령 | 설명 |
|---|---|
| `pnpm build` | 두 앱 프로덕션 빌드 |
| `pnpm preview` | 빌드한 두 앱을 배포 구조로 띄움(http://localhost:4300, 데모 모드) |
| `pnpm preview:api` | 실제 서버 모드로 띄움(/api를 PGlite 위의 서버가 받음, 계정·Docker 불필요) |
| `pnpm test` | 업무 서버(브라우저·Postgres), 도메인 규칙, 두 앱 컴포넌트 테스트 |
| `pnpm test:storybook` | 모든 스토리를 실제 브라우저에서 렌더링하고 접근성 검사 |
| `pnpm site` → `pnpm size` / `pnpm lhci` | 배포 구조로 합친 뒤 번들 크기 / Lighthouse 기준 검사 (먼저 `build` 필요) |
| `pnpm e2e` | 프로덕션 빌드 E2E, 데모 모드(데스크톱·모바일)와 실제 서버 모드 (`E2E_BASE_URL`을 주면 배포된 사이트 검사) |
| `pnpm typecheck` / `pnpm lint` | 타입 검사 / ESLint와 FSD 규칙 검사(Steiger) |
| `pnpm --filter @sog/backoffice storybook` | 백오피스 Storybook (`http://localhost:6006`) |

## 프로젝트 구조

```
apps/
├─ backoffice/   WMS 백오피스 (FSD: app · pages · widgets · features · entities · shared)
└─ count/        현장 재고 실사 PWA (FSD)
packages/
├─ domain/       타입, 재고 규칙, 실사 정산, 품목 그림(SVG)
├─ wms-server/   업무 서버 코드(규칙, 버전 검사, 예약). 저장소를 갈아 끼워 브라우저·서버에서 함께 씀
├─ wms-api/      실제 서버(/api): Postgres 저장소, 변경 피드, 접속 표시, Cloudflare Worker 진입점
└─ wms-client/   Angular HTTP 연결, 변경 알림, 접속 표시, 네트워크 상태, 중복 제출 잠금
e2e/             프로덕션 빌드 E2E
docs/            문서와 스크린샷
```

## 문서

| 문서 | 내용 |
|---|---|
| [실제 서버](docs/backend.md) | 두 가지 실행 모드, 로그인과 권한, Postgres 저장 구조, 변경 피드, 배포 |
| [동시성 제어](docs/concurrency.md) | 낙관적 잠금, 쓰기 직렬화, 멱등 키, 실사 정산, 접속 표시, 화면 쪽 경쟁, 오프라인 |
| [개발 가이드](docs/development.md) | 구조, Angular 사용 방식, FSD, 개발 서버, 테스트, 접근성 점검 |
| [디자인](docs/design.md) | 참고 사이트, 두 앱의 디자인 토큰, 품목 그림 |
| [CI · 배포](docs/ci-deploy.md) | GitHub Actions, Cloudflare Workers, 배포된 사이트 검사, Dependabot |
| [시퀀스 다이어그램](docs/sequence-diagrams.md) | 낙관적 잠금 충돌, 현장 실사 보낼함과 실시간 반영, 출고 지시 재고 예약, 실사 승인 정산 |
| [버전 기록](CHANGELOG.md) | 버전별 변경 내용 |
