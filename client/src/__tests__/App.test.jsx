import { describe, it, expect } from 'vitest';

describe('App', () => {
  it('앱 모듈이 정상적으로 임포트된다', async () => {
    // React Router의 BrowserRouter가 필요하므로 동적 임포트로 모듈 존재만 검증
    const module = await import('../App.jsx');
    expect(module).toBeDefined();
    expect(module.default).toBeDefined();
  });
});
