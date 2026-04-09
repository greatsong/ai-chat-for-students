import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const { loginWithGoogle, isAuthenticated, isLoading, checkAuth } = useAuthStore();

  // 신규 사용자 동의 모달 상태
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [pendingCredential, setPendingCredential] = useState(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  // 로그인 버튼 클릭 후의 로딩 상태 (store의 isLoading과 분리)
  const [loginInProgress, setLoginInProgress] = useState(false);

  // 기존 토큰이 있으면 세션 복원 시도 → 인증 성공 시 /chat으로 이동
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleCredentialResponse = useCallback(
    async (response) => {
      setLoginInProgress(true);
      try {
        const result = await loginWithGoogle(response.credential);

        // 신규 사용자 → 개인정보 동의 필요
        if (result?.privacy_required) {
          setPendingCredential(response.credential);
          setShowPrivacyModal(true);
          setLoginInProgress(false);
          return;
        }

        navigate('/chat', { replace: true });
      } catch (err) {
        setLoginInProgress(false);
        console.error('로그인 실패:', err);
        alert(err.message || '로그인에 실패했습니다.');
      }
    },
    [loginWithGoogle, navigate],
  );

  // 동의 후 가입 완료
  const handlePrivacyAgree = async () => {
    if (!pendingCredential) return;
    setLoginInProgress(true);
    try {
      await loginWithGoogle(pendingCredential, true);
      setShowPrivacyModal(false);
      setPendingCredential(null);
      navigate('/chat', { replace: true });
    } catch (err) {
      setLoginInProgress(false);
      console.error('가입 실패:', err);
      alert(err.message || '가입에 실패했습니다.');
    }
  };

  const handlePrivacyCancel = () => {
    setShowPrivacyModal(false);
    setPendingCredential(null);
    setPrivacyAgreed(false);
  };

  // Google Identity Services 스크립트 로드
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.error('VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.');
      return;
    }

    let cancelled = false;

    function initializeGoogle() {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 320,
      });
    }

    // 이미 로드된 경우
    if (window.google?.accounts?.id) {
      initializeGoogle();
      return () => {
        cancelled = true;
      };
    }

    // 스크립트 태그가 이미 존재하는지 확인 (중복 방지)
    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    if (existingScript) {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeGoogle();
        }
      }, 100);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    // 새로 스크립트 로드
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeGoogle();
        }
      }, 50);
      setTimeout(() => clearInterval(interval), 5000);
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [handleCredentialResponse]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
          <p className="text-red-500 font-medium">
            VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            .env 파일에 VITE_GOOGLE_CLIENT_ID를 추가해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 relative overflow-hidden">
      {/* 메쉬 그라데이션 배경 오브 */}
      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] bg-violet-300/30 rounded-full blur-[120px] animate-float" />
      <div className="absolute top-[30%] right-[-15%] w-[400px] h-[400px] bg-blue-300/25 rounded-full blur-[100px] animate-float-delayed" />
      <div
        className="absolute bottom-[-10%] left-[25%] w-[450px] h-[450px] bg-pink-200/20 rounded-full blur-[110px] animate-float"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="absolute top-[60%] left-[10%] w-[300px] h-[300px] bg-cyan-200/20 rounded-full blur-[80px] animate-float-delayed"
        style={{ animationDelay: '1s' }}
      />

      {/* 미세한 도트 패턴 */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.8) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-lg mx-4 relative z-10">
        {/* 메인 글래스 카드 */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-indigo-100/50 border border-white/80 p-8 sm:p-10 hover:shadow-2xl hover:shadow-indigo-100/60 transition-all duration-500">
          {/* 학교 로고 */}
          <div className="flex justify-center mb-6 animate-fade-in-up">
            <div className="bg-white rounded-2xl px-5 py-3 shadow-md shadow-indigo-100/40 border border-indigo-50">
              <img
                src="/danggok-logo.jpeg"
                alt="당곡고등학교 로고"
                className="h-16 sm:h-20 object-contain"
              />
            </div>
          </div>

          {/* 타이틀 */}
          <h1
            className="text-2xl sm:text-3xl font-bold text-center text-gray-900 shimmer-text animate-fade-in-up"
            style={{ animationDelay: '100ms' }}
          >
            ✨ 유료 AI 4종 세트 for 당곡고
          </h1>
          <p
            className="mt-3 text-center text-gray-400 text-sm animate-fade-in-up"
            style={{ animationDelay: '200ms' }}
          >
            🚀 우주최강 당곡고등학교 학생들의 학습을 위한 AI 학습 도우미
          </p>

          {/* AI 모델 뱃지 */}
          <div
            className="flex justify-center gap-2.5 mt-5 flex-wrap animate-fade-in-up"
            style={{ animationDelay: '300ms' }}
          >
            <span className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-orange-50 to-orange-100 text-orange-600 rounded-full border border-orange-200/60 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md hover:shadow-orange-100 cursor-default">
              Claude
            </span>
            <span className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-50 to-blue-100 text-blue-600 rounded-full border border-blue-200/60 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md hover:shadow-blue-100 cursor-default">
              Gemini
            </span>
            <span className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-green-50 to-green-100 text-green-600 rounded-full border border-green-200/60 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md hover:shadow-green-100 cursor-default">
              ChatGPT
            </span>
            <span className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-50 to-purple-100 text-purple-600 rounded-full border border-purple-200/60 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md hover:shadow-purple-100 cursor-default">
              Solar
            </span>
          </div>

          {/* 구분선 */}
          <div className="my-8 border-t border-gray-200/60" />

          {/* Google 로그인 버튼 — 항상 활성화 */}
          <div className="flex justify-center relative">
            {loginInProgress ? (
              <div className="flex items-center gap-2 text-gray-500">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                로그인 중...
              </div>
            ) : (
              <div ref={buttonRef} />
            )}
          </div>

          {/* 안내 문구 */}
          <div className="mt-8 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 rounded-xl p-4 border border-indigo-100/60">
            <div className="flex items-start gap-2.5">
              <span className="text-base mt-0.5">🎓</span>
              <div className="text-xs text-gray-500 leading-relaxed">
                <p>
                  <strong className="text-gray-700">@danggok.hs.kr</strong> 또는 교사 등록된
                  계정으로 로그인하세요.
                </p>
                <p className="mt-1 text-gray-400">학생은 교사 승인 후 사용할 수 있습니다.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 링크 */}
        <div className="text-center mt-4">
          <Link
            to="/privacy"
            className="text-xs text-gray-400 hover:text-indigo-500 underline underline-offset-2 transition-colors"
          >
            개인정보 처리방침
          </Link>
        </div>
      </div>

      {/* 개인정보 동의 모달 — 신규 사용자만 */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 sm:p-8 animate-fade-in-up">
            <h2 className="text-lg font-bold text-gray-900 mb-2">개인정보 제공 동의</h2>
            <p className="text-sm text-gray-500 mb-5">서비스 이용을 위해 아래 동의가 필요합니다.</p>

            <label className="flex items-start gap-2.5 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={privacyAgreed}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 leading-relaxed select-none">
                <Link
                  to="/privacy"
                  target="_blank"
                  className="text-indigo-600 font-medium underline underline-offset-2 hover:text-indigo-800 transition-colors"
                >
                  개인정보 처리방침
                </Link>
                에 동의하며, AI 학습 도우미 이용을 위한 개인정보(이름, 이메일, 프로필 사진) 제공에
                동의합니다.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={handlePrivacyCancel}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handlePrivacyAgree}
                disabled={!privacyAgreed || loginInProgress}
                className="flex-1 px-4 py-2.5 text-sm text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loginInProgress ? '처리 중...' : '동의하고 시작하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
