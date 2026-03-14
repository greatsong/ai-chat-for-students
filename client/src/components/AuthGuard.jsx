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

  // 로딩 중
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <svg
            className="mx-auto h-8 w-8 animate-spin text-indigo-500"
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
          <p className="mt-3 text-sm text-gray-500">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  // 미인증
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // 교사 권한 체크
  if (requireTeacher && user.role !== "teacher") {
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
