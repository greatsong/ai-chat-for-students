import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ChatPage from "./pages/ChatPage";
import TeacherLayout from "./pages/teacher/TeacherLayout";
import StudentsPage from "./pages/teacher/StudentsPage";
import ConversationsPage from "./pages/teacher/ConversationsPage";
import UsagePage from "./pages/teacher/UsagePage";
import SettingsPage from "./pages/teacher/SettingsPage";
import AuthGuard from "./components/AuthGuard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/login" element={<LoginPage />} />
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
          <Route index element={<Navigate to="/teacher/students" replace />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
