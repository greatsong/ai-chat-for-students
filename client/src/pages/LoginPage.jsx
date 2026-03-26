import { useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import useAuthStore from "../stores/authStore";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const { loginWithGoogle, isAuthenticated, isLoading } = useAuthStore();

  // 이미 인증된 상태면 /chat으로 이동
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleCredentialResponse = useCallback(
    async (response) => {
      try {
        await loginWithGoogle(response.credential);
        navigate("/chat", { replace: true });
      } catch (err) {
        console.error("로그인 실패:", err);
        alert(err.message || "로그인에 실패했습니다.");
      }
    },
    [loginWithGoogle, navigate]
  );

  // Google Identity Services 스크립트 로드
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.error("VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.");
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
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 320,
      });
    }

    // 이미 로드된 경우
    if (window.google?.accounts?.id) {
      initializeGoogle();
      return () => { cancelled = true; };
    }

    // 스크립트 태그가 이미 존재하는지 확인 (중복 방지)
    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
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
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 relative overflow-hidden">
      {/* 배경 장식 */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-100/20 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-72 h-72 bg-blue-100/20 rounded-full translate-x-1/3 translate-y-1/3 blur-3xl" />

      <div className="w-full max-w-lg mx-4 relative z-10">
        {/* 메인 카드 */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-white/50 p-8 sm:p-10">
          {/* 학교 로고 */}
          <div className="flex justify-center mb-6">
            <img
              src="/danggok-logo.jpeg"
              alt="당곡고등학교 로고"
              className="h-24 sm:h-28 object-contain"
            />
          </div>

          {/* 타이틀 */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            &#x2B50; AI 학습 도우미 &#x2B50;
          </h1>
          <p className="mt-2 text-center text-gray-500 text-sm">
            &#x1F680; 우주최강 당곡고등학교 학생들의 학습을 위한 AI 학습 도우미
          </p>

          {/* AI 모델 뱃지 */}
          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            <span className="px-2.5 py-1 text-xs font-medium bg-orange-50 text-orange-600 rounded-full border border-orange-100">Claude</span>
            <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full border border-blue-100">Gemini</span>
            <span className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-600 rounded-full border border-green-100">ChatGPT</span>
            <span className="px-2.5 py-1 text-xs font-medium bg-purple-50 text-purple-600 rounded-full border border-purple-100">Solar</span>
          </div>

          {/* 구분선 */}
          <div className="my-7 border-t border-gray-200/80" />

          {/* Google 로그인 버튼 */}
          <div className="flex justify-center">
            {isLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
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
          <div className="mt-7 bg-gray-50 rounded-xl p-4">
            <div className="flex items-start gap-2.5">
              <span className="text-base mt-0.5">&#x1F393;</span>
              <div className="text-xs text-gray-500 leading-relaxed">
                <p><strong className="text-gray-700">@danggok.hs.kr</strong> 또는 교사 등록된 계정으로 로그인하세요.</p>
                <p className="mt-1">학생은 교사 승인 후 사용할 수 있습니다.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 링크 */}
        <div className="text-center mt-4">
          <Link
            to="/privacy"
            className="text-xs text-gray-400 hover:text-emerald-600 underline underline-offset-2 transition-colors"
          >
            개인정보 처리방침
          </Link>
        </div>
      </div>
    </div>
  );
}
