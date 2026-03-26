import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import useAuthStore from "../stores/authStore";

/**
 * 인증 라우트 가드
 * - 미인증: /login으로 리다이렉트
 * - 인증 + 비활성: 승인 대기 화면
 * - 인증 + 활성: children 렌더링
 * - requireTeacher: 교사 권한 필요 시
 */
export default function AuthGuard({ children, requireTeacher = false }) {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 로딩 중 — 우주 컨셉
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-indigo-950 to-gray-900 relative overflow-hidden">
        <style>{`
          @keyframes drift { 0% { transform: translateY(0) translateX(0); } 50% { transform: translateY(-20px) translateX(10px); } 100% { transform: translateY(0) translateX(0); } }
          @keyframes twinkle { 0%, 100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
          @keyframes shootingStar { 0% { transform: translateX(0) translateY(0); opacity: 1; } 100% { transform: translateX(300px) translateY(200px); opacity: 0; } }
          @keyframes float { 0%, 100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-15px) rotate(5deg); } }
        `}</style>

        {/* 별 배경 — 천천히 떠다니는 별들 */}
        <div className="absolute inset-0">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-white rounded-full"
              style={{
                top: `${Math.sin(i * 7.3) * 50 + 50}%`,
                left: `${Math.cos(i * 5.1) * 50 + 50}%`,
                width: `${1 + (i % 3)}px`,
                height: `${1 + (i % 3)}px`,
                animation: `drift ${6 + (i % 5) * 2}s ease-in-out infinite, twinkle ${2 + (i % 4)}s ease-in-out infinite`,
                animationDelay: `${(i * 0.3) % 4}s`,
              }}
            />
          ))}
        </div>

        {/* 유성 */}
        <div
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            top: "15%", left: "10%",
            boxShadow: "0 0 4px 2px rgba(255,255,255,0.3)",
            animation: "shootingStar 3s ease-in infinite",
            animationDelay: "1s",
          }}
        />
        <div
          className="absolute w-0.5 h-0.5 bg-white rounded-full"
          style={{
            top: "30%", left: "60%",
            boxShadow: "0 0 3px 1px rgba(255,255,255,0.2)",
            animation: "shootingStar 4s ease-in infinite",
            animationDelay: "3s",
          }}
        />

        <div className="text-center relative z-10">
          <div className="text-6xl mb-5" style={{ animation: "float 3s ease-in-out infinite" }}>&#x1F680;</div>
          <p className="text-lg font-bold text-white/80">우주최강 당곡고 접속 중...</p>
          <div className="mt-3 flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 미인증
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // 교사 권한 체크 (admin도 교사 권한 포함)
  if (requireTeacher && user.role !== "teacher" && user.role !== "admin") {
    return <Navigate to="/chat" replace />;
  }

  // 비활성 사용자 (학생 승인 대기)
  if (!user.is_active) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-7 w-7 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">승인 대기 중</h2>
          <p className="mt-2 text-sm text-gray-500">
            교사의 승인을 기다리는 중입니다.
            <br />
            승인 후 이 페이지를 새로고침해주세요.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => checkAuth()}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              새로고침
            </button>
            <button
              onClick={() => {
                useAuthStore.getState().logout();
                window.location.href = "/login";
              }}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
