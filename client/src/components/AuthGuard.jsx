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

  // 로딩 중 — 우주 워프 컨셉
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-indigo-950 to-gray-900 relative overflow-hidden">
        <style>{`
          @keyframes starStream {
            from { transform: translateY(-5vh); }
            to { transform: translateY(110vh); }
          }
          @keyframes starStreak {
            from { transform: translateY(-5vh) scaleY(1); opacity: 0.3; }
            50% { opacity: 1; }
            to { transform: translateY(110vh) scaleY(4); opacity: 0; }
          }
          @keyframes rocketVibrate {
            0%, 100% { transform: translate(0, 0) rotate(-15deg); }
            20% { transform: translate(1.5px, -1px) rotate(-14deg); }
            40% { transform: translate(-1px, 1.5px) rotate(-16deg); }
            60% { transform: translate(1px, 0.5px) rotate(-15.5deg); }
            80% { transform: translate(-0.5px, -1px) rotate(-14.5deg); }
          }
          @keyframes speedLine {
            0% { transform: translateX(80px); opacity: 0; width: 20px; }
            30% { opacity: 0.5; }
            100% { transform: translateX(-250px); opacity: 0; width: 60px; }
          }
          @keyframes warpGlow {
            0%, 100% { opacity: 0.15; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(1.1); }
          }
        `}</style>

        {/* 워프 글로우 배경 */}
        <div
          className="absolute rounded-full"
          style={{
            width: "300px", height: "300px",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)",
            animation: "warpGlow 2s ease-in-out infinite",
          }}
        />

        {/* 빠르게 쏟아지는 별들 */}
        <div className="absolute inset-0">
          {[...Array(80)].map((_, i) => {
            const size = 1 + (i % 3);
            const isStreak = i % 4 === 0;
            return (
              <div
                key={i}
                className="absolute bg-white rounded-full"
                style={{
                  left: `${(i * 13 + 7) % 100}%`,
                  width: `${size}px`,
                  height: isStreak ? `${size * 6}px` : `${size}px`,
                  background: isStreak
                    ? "linear-gradient(to bottom, transparent, white, transparent)"
                    : "white",
                  animation: `${isStreak ? "starStreak" : "starStream"} ${0.5 + (i % 6) * 0.25}s linear infinite`,
                  animationDelay: `${(i * 0.07) % 2}s`,
                  opacity: 0.3 + (i % 4) * 0.2,
                }}
              />
            );
          })}
        </div>


        {/* 로켓 */}
        <div className="text-center relative z-10">
          <div
            className="text-6xl inline-block"
            style={{ animation: "rocketVibrate 0.1s ease-in-out infinite" }}
          >
            &#x1F680;
          </div>

          {/* 스피드 라인 */}
          <div className="absolute -left-32 -right-32 top-0 bottom-0 pointer-events-none">
            {[...Array(10)].map((_, i) => (
              <div
                key={`speed-${i}`}
                className="absolute bg-white/25 rounded-full"
                style={{
                  top: `${5 + i * 10}%`,
                  right: "-40px",
                  height: "1px",
                  animation: `speedLine ${0.25 + (i % 4) * 0.07}s linear infinite`,
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>

          <p className="text-lg font-bold text-white/80 mt-8">우주최강 당곡고 접속 중...</p>
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
