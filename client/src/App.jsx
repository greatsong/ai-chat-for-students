import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ChatPage from "./pages/ChatPage";
import TeacherLayout from "./pages/teacher/TeacherLayout";
import StudentsPage from "./pages/teacher/StudentsPage";
import TeachersPage from "./pages/teacher/TeachersPage";
import ConversationsPage from "./pages/teacher/ConversationsPage";
import UsagePage from "./pages/teacher/UsagePage";
import MyUsagePage from "./pages/teacher/MyUsagePage";
import SettingsPage from "./pages/teacher/SettingsPage";
import PrivacyPage from "./pages/PrivacyPage";
import AuthGuard from "./components/AuthGuard";
import RoleRedirect from "./components/RoleRedirect";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="/chat"
          element={
            <AuthGuard>
              <ChatPage />
            </AuthGuard>
          }
        />
        <Route
          path="/teacher"
          element={
            <AuthGuard requireTeacher>
              <TeacherLayout />
            </AuthGuard>
          }
        >
          {/* 역할에 따라 기본 페이지 리다이렉트 */}
          <Route index element={<RoleRedirect />} />
          {/* 관리자 전용 */}
          <Route path="students" element={<StudentsPage />} />
          <Route path="teachers" element={<TeachersPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* 교사 + 관리자 공용 */}
          <Route path="my-usage" element={<MyUsagePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
