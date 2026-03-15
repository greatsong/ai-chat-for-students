import { create } from 'zustand';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  // 토큰이 있으면 초기에 loading 상태로 시작 (AuthGuard가 바로 /login으로 보내는 것 방지)
  isLoading: !!localStorage.getItem('token'),
  isAuthenticated: false,

  /**
   * Google OAuth 로그인
   * @param {string} credential - Google ID 토큰
   */
  loginWithGoogle: async (credential) => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      const data = await res.json();
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
    const token = get().token;
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return null;
    }

    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
        return null;
      }

      const data = await res.json();
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
      return data.user;
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      return null;
    }
  },

  /**
   * 로그아웃
   */
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
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
