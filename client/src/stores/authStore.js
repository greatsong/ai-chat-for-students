import { create } from 'zustand';

let _checkAuthPromise = null;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 저장된 토큰으로 세션을 복원한다.
 * 토큰을 지우는 것은 서버가 401(만료·폐기)을 돌려줄 때뿐이다. 429·5xx·네트워크 오류는 일시적인
 * 문제이므로 몇 번 다시 시도하고, 그래도 안 되면 토큰을 남긴 채 연결 오류 화면을 보여 준다.
 * (학교망에서 여러 반이 동시에 접속하거나 서버를 재배포하는 동안 학생들이 한꺼번에 로그아웃되던 문제)
 */
async function runCheckAuth(set, get) {
  const token = get().token;
  if (!token) {
    set({ isLoading: false, isAuthenticated: false, authError: null });
    return null;
  }

  set({ isLoading: true, authError: null });
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
        return null;
      }

      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, isAuthenticated: true, isLoading: false, authError: null });
        return data.user;
      }
    } catch {
      // 네트워크 오류 — 아래에서 다시 시도
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  set({
    isLoading: false,
    authError: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  });
  return null;
}

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  // 토큰이 있으면 초기에 loading 상태로 시작 (AuthGuard가 바로 /login으로 보내는 것 방지)
  isLoading: !!localStorage.getItem('token'),
  isAuthenticated: false,
  authError: null, // 일시적인 연결 오류 (토큰은 유지)

  /**
   * Google OAuth 로그인
   * @param {string} credential - Google ID 토큰
   * @param {boolean} privacyAgreed - 개인정보 제공 동의 여부
   */
  loginWithGoogle: async (credential, privacyAgreed = false) => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, privacyAgreed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      const data = await res.json();

      // 신규 사용자 — 개인정보 동의 필요
      if (data.privacy_required) {
        set({ isLoading: false });
        return { privacy_required: true };
      }

      localStorage.setItem('token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
      return data.user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  /**
   * 저장된 토큰으로 세션 복원
   */
  checkAuth: async () => {
    // AuthGuard·LoginPage가 함께 마운트되면 동시에 부른다. 요청을 하나로 묶는다.
    if (_checkAuthPromise) return _checkAuthPromise;
    _checkAuthPromise = runCheckAuth(set, get).finally(() => {
      _checkAuthPromise = null;
    });
    return _checkAuthPromise;
  },

  /**
   * 로그아웃
   */
  logout: () => {
    // 서버 세션 폐기는 실패해도 화면 로그아웃을 막지 않는다
    const token = get().token;
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
    // 공용 PC에서 다음 사용자에게 이전 대화가 보이지 않도록 전체 새로고침으로 메모리 상태를 비운다.
    // keepalive 요청은 페이지가 바뀌어도 끝까지 전송된다.
    window.location.replace('/login');
  },

  /**
   * Authorization 헤더 반환
   */
  getAuthHeader: () => {
    const token = get().token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
}));

export default useAuthStore;
