import { Navigate } from "react-router-dom";
import useAuthStore from "../stores/authStore";

/**
 * 역할에 따른 대시보드 기본 페이지 리다이렉트
 * - admin: /teacher/students (사용자 관리)
 * - teacher: /teacher/my-usage (내 사용량)
 */
export default function RoleRedirect() {
  const { user } = useAuthStore();

  if (user?.role === "admin") {
    return <Navigate to="/teacher/students" replace />;
  }

  // 교사는 내 사용량 페이지로
  return <Navigate to="/teacher/my-usage" replace />;
}
