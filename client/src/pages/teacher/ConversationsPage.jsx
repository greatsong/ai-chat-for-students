import { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useTeacherStore from "../../stores/teacherStore";

export default function ConversationsPage() {
  const {
    students,
    conversations,
    conversationMessages,
    conversationPagination,
    isLoading,
    loadStudents,
    loadConversations,
    loadConversationMessages,
    deleteConversation,
  } = useTeacherStore();

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [search, setSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    setPage(1);
    loadConversations({ userId: selectedUserId, search, page: 1 });
  }, [selectedUserId, search, loadConversations]);

  useEffect(() => {
    if (page > 1) {
      loadConversations({ userId: selectedUserId, search, page });
    }
  }, [page, selectedUserId, search, loadConversations]);

  const handleViewMessages = async (convId) => {
    setSelectedConvId(convId);
    await loadConversationMessages(convId);
    setShowMessageModal(true);
  };

  const handleDeleteConv = async (convId) => {
    if (!confirm("이 대화를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    try {
      await deleteConversation(convId);
      if (selectedConvId === convId) {
        setShowMessageModal(false);
        setSelectedConvId(null);
      }
    } catch (err) {
      alert("삭제에 실패했습니다: " + err.message);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
    );
  }, [students, studentSearch]);

  const providerColors = {
    claude: "bg-orange-100 text-orange-700",
    gemini: "bg-blue-100 text-blue-700",
    openai: "bg-green-100 text-green-700",
    solar: "bg-purple-100 text-purple-700",
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">채팅 열람</h1>

      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-12rem)]">
        {/* 왼쪽: 사용자 목록 */}
        <div className="lg:w-64 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="사용자 검색..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* 전체 보기 */}
            <button
              onClick={() => setSelectedUserId(null)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-gray-50 ${
                selectedUserId === null
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              전체 사용자
            </button>
            {filteredStudents
              .filter((s) => s.role !== "teacher")
              .map((student) => (
                <button
                  key={student.id}
                  onClick={() => setSelectedUserId(student.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-gray-50 flex items-center gap-2 ${
                    selectedUserId === student.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {student.avatar ? (
                    <img src={student.avatar} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                      {student.name?.[0] || "?"}
                    </div>
                  )}
                  <span className="truncate">{student.name || student.email}</span>
                </button>
              ))}
          </div>
        </div>

        {/* 오른쪽: 대화 목록 */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {/* 검색 */}
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="대화 제목 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* 대화 리스트 */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {isLoading && conversations.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                불러오는 중...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                대화 기록이 없습니다.
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleViewMessages(conv.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-800 truncate">
                          {conv.title || "제목 없음"}
                        </span>
                        {conv.provider && (
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                              providerColors[conv.provider] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {conv.provider}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mb-1">
                        {conv.student_name || conv.student_email} &middot;{" "}
                        {conv.message_count}개 메시지 &middot; {formatDate(conv.updated_at)}
                      </div>
                      {conv.last_message && (
                        <p className="text-xs text-gray-500 truncate">{conv.last_message}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConv(conv.id);
                      }}
                      className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0"
                      title="삭제"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 페이지네이션 */}
          {conversationPagination && conversationPagination.totalPages > 1 && (
            <div className="p-3 border-t border-gray-100 flex items-center justify-between text-sm">
              <span className="text-gray-400">
                {conversationPagination.total}개 중{" "}
                {(conversationPagination.page - 1) * conversationPagination.limit + 1}-
                {Math.min(
                  conversationPagination.page * conversationPagination.limit,
                  conversationPagination.total
                )}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  이전
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= conversationPagination.totalPages}
                  className="px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 메시지 모달 */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">대화 내용</h3>
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setSelectedConvId(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {isLoading ? (
                <div className="text-center text-gray-400 py-8">불러오는 중...</div>
              ) : conversationMessages.length === 0 ? (
                <div className="text-center text-gray-400 py-8">메시지가 없습니다.</div>
              ) : (
                conversationMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${
                      msg.role === "user" ? "ml-8" : "mr-8"
                    }`}
                  >
                    <div
                      className={`rounded-xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-blue-50 border border-blue-100"
                          : "bg-gray-50 border border-gray-100"
                      }`}
                    >
                      {/* 역할 + 메타 */}
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-xs font-semibold ${
                            msg.role === "user" ? "text-blue-600" : "text-gray-600"
                          }`}
                        >
                          {msg.role === "user" ? "학생" : "AI"}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                          {(msg.input_tokens > 0 || msg.output_tokens > 0) && (
                            <span>
                              {msg.input_tokens > 0 && `입력 ${msg.input_tokens}`}
                              {msg.input_tokens > 0 && msg.output_tokens > 0 && " / "}
                              {msg.output_tokens > 0 && `출력 ${msg.output_tokens}`}
                            </span>
                          )}
                          <span>{formatDate(msg.created_at)}</span>
                        </div>
                      </div>
                      {/* 내용 */}
                      <div className="prose prose-sm max-w-none text-sm text-gray-800 break-words [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-all">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content || ""}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
