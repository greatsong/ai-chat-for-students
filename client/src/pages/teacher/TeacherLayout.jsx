import { useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";

const navItems = [
  { to: "/teacher/students", label: "학생 관리", icon: "\u{1F465}" },
  { to: "/teacher/conversations", label: "채팅 열람", icon: "\u{1F4CB}" },
  { to: "/teacher/usage", label: "사용량", icon: "\u{1F4CA}" },
  { to: "/teacher/settings", label: "설정", icon: "\u2699\uFE0F" },
];

export default function TeacherLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-white border-r border-gray-200
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          flex flex-col
        `}
      >
        {/* 헤더 */}
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">교사 대시보드</h2>
          <p className="text-xs text-gray-400 mt-1">학생 관리 및 모니터링</p>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 하단 링크 */}
        <div className="p-3 border-t border-gray-100">
          <Link
            to="/chat"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span className="text-lg">{"\u{1F4AC}"}</span>
            채팅으로 돌아가기
          </Link>
        </div>
      </aside>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 헤더 */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="메뉴 열기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-base font-bold text-gray-800">교사 대시보드</h1>
        </header>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
