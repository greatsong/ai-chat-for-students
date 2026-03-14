import { useState } from 'react';

// 시간 경과 포맷
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// 프로바이더 뱃지
function ProviderBadge({ provider }) {
  const colors = {
    claude: 'bg-orange-100 text-orange-700',
    gemini: 'bg-blue-100 text-blue-700',
    openai: 'bg-green-100 text-green-700',
    solar: 'bg-purple-100 text-purple-700',
  };
  const names = { claude: 'Claude', gemini: 'Gemini', openai: 'ChatGPT', solar: 'Solar' };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full ${colors[provider] || 'bg-gray-100 text-gray-600'}`}>
      {names[provider] || provider}
    </span>
  );
}

export default function Sidebar({
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  user,
  onLogout,
  isOpen,
  onToggle,
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleDelete = (e, convId) => {
    e.stopPropagation();
    if (deleteConfirm === convId) {
      onDeleteConversation?.(convId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(convId);
      // 3초 후 확인 취소
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-[280px] flex flex-col
          bg-gray-900 text-white
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <h2 className="text-base font-semibold">AI 채팅</h2>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors lg:hidden"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 새 대화 버튼 */}
        <div className="px-3 py-3">
          <button
            onClick={() => {
              onNewConversation?.();
              onToggle?.(); // 모바일에서 사이드바 닫기
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 대화
          </button>
        </div>

        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {conversations.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              대화가 없습니다
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation?.(conv.id);
                      // 모바일에서 대화 선택 시 사이드바 닫기
                      if (window.innerWidth < 1024) onToggle?.();
                    }}
                    className={`
                      w-full text-left px-3 py-2.5 rounded-lg transition-colors group relative
                      ${isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {conv.title || '새 대화'}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <ProviderBadge provider={conv.provider} />
                          <span className="text-xs text-gray-500">
                            {timeAgo(conv.updated_at || conv.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* 삭제 버튼 */}
                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className={`
                          flex-shrink-0 p-1 rounded transition-colors
                          ${deleteConfirm === conv.id
                            ? 'text-red-400 bg-red-500/20'
                            : 'text-gray-500 opacity-0 group-hover:opacity-100 hover:text-red-400'
                          }
                        `}
                        title={deleteConfirm === conv.id ? '다시 클릭하여 삭제' : '대화 삭제'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 사용자 정보 + 로그아웃 */}
        <div className="border-t border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name || ''}
                className="w-8 h-8 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm">
                {(user?.name || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name || '사용자'}</div>
              <div className="text-xs text-gray-400 truncate">{user?.email || ''}</div>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="로그아웃"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
