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
      // 스크립트는 있지만 아직 로드 안 됨 — 폴링으로 대기
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
      // onload 후에도 google.accounts.id가 바로 안 될 수 있음
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeGoogle();
        }
      }, 50);
      // 최대 5초 대기
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md p-10 bg-white rounded-2xl shadow-lg text-center">
        {/* 아이콘 */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
          <svg
            className="h-8 w-8 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
            />
          </svg>
        </div>

        {/* 타이틀 */}
        <h1 className="text-2xl font-bold text-gray-900">당곡고 학생을 위한 AI 채팅</h1>
        <p className="mt-1 text-gray-500">수업용 AI 채팅 도구</p>

        {/* 구분선 */}
        <div className="my-8 border-t border-gray-200" />

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
        <p className="mt-8 text-xs text-gray-400">
          @danggok.hs.kr 계정으로 로그인하면 수업용 AI 채팅을 이용할 수 있습니다.
          <br />
          학생은 교사 승인 후 사용 가능합니다.
        </p>

        <div className="mt-4">
          <Link
            to="/privacy"
            className="text-xs text-gray-400 hover:text-indigo-500 underline underline-offset-2 transition-colors"
          >
            개인정보 처리방침
          </Link>
        </div>
      </div>
    </div>
  );
}
