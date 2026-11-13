import type { User } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { AuthSession, provideWmsClient } from '@/shared/api';
import { LoginForm } from './login-form';

const accounts: User[] = [
  { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
  { id: 'u-park', name: '박도윤', role: 'manager', team: '센터장' },
];

async function setup() {
  sessionStorage.clear();
  const signedIn = vi.fn();
  const view = await render(LoginForm, {
    inputs: { accounts },
    on: { signedIn },
    providers: [provideWmsClient({ dbName: `login-${crypto.randomUUID()}`, latency: [0, 0] })],
  });
  return { signedIn, auth: view.fixture.debugElement.injector.get(AuthSession) };
}

describe('LoginForm', () => {
  it('공개 데모 비밀번호로 로그인하고, 토큰을 이 탭에 남긴다', async () => {
    const { signedIn, auth } = await setup();
    await userEvent.click(screen.getByRole('radio', { name: /박도윤/ }));
    await userEvent.type(screen.getByLabelText('비밀번호'), 'sog-demo');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    await vi.waitFor(() => expect(signedIn).toHaveBeenCalled(), { timeout: 3000 });
    expect(auth.user()?.id).toBe('u-park');
    expect(sessionStorage.getItem('sog:auth')).toContain('u-park');
  });

  it('비밀번호가 틀리면 알리고 다시 시도할 수 있다', async () => {
    const { signedIn } = await setup();
    await userEvent.click(screen.getByRole('radio', { name: /김하늘/ }));
    await userEvent.type(screen.getByLabelText('비밀번호'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent).toContain(
      '계정이나 비밀번호가 맞지 않습니다.',
    );
    expect(signedIn).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('계정을 고르지 않으면 안내한다', async () => {
    await setup();
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('계정을 골라 주세요.')).toBeTruthy();
  });
});
