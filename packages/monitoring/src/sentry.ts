// 쓰는 함수만 다시 내보내야 리플레이·피드백 같은 기능이 번들에 들어가지 않습니다.
export { captureException, captureMessage, init, withScope } from '@sentry/browser';
