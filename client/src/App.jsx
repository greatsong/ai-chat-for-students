import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import PrivacyPage from './pages/PrivacyPage';
import AuthGuard from './components/AuthGuard';
import RoleRedirect from './components/RoleRedirect';

// 교사 페이지는 학생에게 불필요 — 별도 청크로 분리
const TeacherLayout = lazy(() => import('./pages/teacher/TeacherLayout'));
const StudentsPage = lazy(() => import('./pages/teacher/StudentsPage'));
const TeachersPage = lazy(() => import('./pages/teacher/TeachersPage'));
const ConversationsPage = lazy(() => import('./pages/teacher/ConversationsPage'));
const UsagePage = lazy(() => import('./pages/teacher/UsagePage'));
const MyUsagePage = lazy(() => import('./pages/teacher/MyUsagePage'));
const SettingsPage = lazy(() => import('./pages/teacher/SettingsPage'));

function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

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
              <Suspense fallback={<LoadingFallback />}>
                <TeacherLayout />
              </Suspense>
            </AuthGuard>
          }
        >
          {/* 역할에 따라 기본 페이지 리다이렉트 */}
          <Route index element={<RoleRedirect />} />
          {/* 관리자 전용 */}
          <Route
            path="students"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <StudentsPage />
              </Suspense>
            }
          />
          <Route
            path="teachers"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <TeachersPage />
              </Suspense>
            }
          />
          <Route
            path="conversations"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <ConversationsPage />
              </Suspense>
            }
          />
          <Route
            path="usage"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <UsagePage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
          {/* 교사 + 관리자 공용 */}
          <Route
            path="my-usage"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <MyUsagePage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
