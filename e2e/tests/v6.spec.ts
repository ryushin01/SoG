import { expect, test } from '@playwright/test';

test('정적 화면·현장 앱 화면 주소·API 모두 보안 헤더를 붙인다', async ({ request }) => {
  for (const path of ['/', '/count/', '/count/tasks/ct-003', '/api/health']) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers['x-frame-options'], path).toBe('SAMEORIGIN');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'self'");
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    // 현장 앱은 바코드 카메라를 쓰므로 같은 출처의 카메라만 허용합니다.
    expect(headers['permissions-policy'], path).toContain('camera=(self)');
  }
});
