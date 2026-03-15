import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/chat/Sidebar';
import ProviderSelector from '../components/chat/ProviderSelector';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';
import WelcomeScreen from '../components/chat/WelcomeScreen';

// Store imports - 병렬 개발 중이므로 안전하게 가져오기
// 스토어 파일이 아직 없으면 null 유지
let useChatStore = null;
let useAuthStore = null;
let storesLoaded = false;

function loadStores() {
  if (storesLoaded) return;
  storesLoaded = true;
  try {
    // Vite의 import.meta.glob으로 동적 임포트 (빌드 타임 에러 방지)
    const chatStoreModules = import.meta.glob('../stores/chatStore.js', { eager: true });
    const chatModule = Object.values(chatStoreModules)[0];
    if (chatModule) useChatStore = chatModule.default || chatModule.useChatStore;
  } catch {
    // chatStore가 아직 없음
  }
  try {
    const authStoreModules = import.meta.glob('../stores/authStore.js', { eager: true });
    const authModule = Object.values(authStoreModules)[0];
    if (authModule) useAuthStore = authModule.default || authModule.useAuthStore;
  } catch {
    // authStore가 아직 없음
  }
}

// 기본 상태
const DEFAULT_CHAT_STATE = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  selectedProvider: 'claude',
  selectedModel: 'claude-sonnet-4-6',
  enabledProviders: ['claude', 'gemini', 'openai', 'solar'],
  setActiveConversation: () => {},
  createConversation: () => {},
  deleteConversation: () => {},
  sendMessage: () => {},
  setProvider: () => {},
  setModel: () => {},
  loadConversations: () => {},
  loadMessages: () => {},
};

const DEFAULT_AUTH_STATE = {
  user: { name: '테스트 사용자', email: 'test@example.com' },
  isAuthenticated: true,
  logout: () => {},
  settings: { enabled_providers: ['claude', 'gemini', 'openai', 'solar'] },
};

// 스토어 폴백 훅 - 스토어가 아직 없으면 기본값 반환
function useSafeChatStore(selector) {
  if (useChatStore) {
    try {
      return useChatStore(selector);
    } catch {
      return selector(DEFAULT_CHAT_STATE);
    }
  }
  return selector(DEFAULT_CHAT_STATE);
}

function useSafeAuthStore(selector) {
  if (useAuthStore) {
    try {
      return useAuthStore(selector);
    } catch {
      return selector(DEFAULT_AUTH_STATE);
    }
  }
  return selector(DEFAULT_AUTH_STATE);
}

export default function ChatPage() {
  // 스토어 로드 시도 (한 번만)
  loadStores();

  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth store
  const user = useSafeAuthStore((s) => s.user);
  const isAuthenticated = useSafeAuthStore((s) => s.isAuthenticated);
  const logout = useSafeAuthStore((s) => s.logout);
  const settings = useSafeAuthStore((s) => s.settings);

  // Chat store
  const conversations = useSafeChatStore((s) => s.conversations);
  const currentConversation = useSafeChatStore((s) => s.currentConversation);
  const activeConversationId = currentConversation?.id || null;
  const messages = useSafeChatStore((s) => s.messages);
  const isStreaming = useSafeChatStore((s) => s.isStreaming);
  const selectedProvider = useSafeChatStore((s) => s.selectedProvider);
  const selectedModel = useSafeChatStore((s) => s.selectedModel);
  const selectConversation = useSafeChatStore((s) => s.selectConversation);
  const createConversation = useSafeChatStore((s) => s.createConversation);
  const deleteConversation = useSafeChatStore((s) => s.deleteConversation);
  const sendMessage = useSafeChatStore((s) => s.sendMessage);
  const setProvider = useSafeChatStore((s) => s.setProvider);
  const setModel = useSafeChatStore((s) => s.setModel);
  const loadConversations = useSafeChatStore((s) => s.loadConversations);

  const enabledProviders = settings?.enabled_providers || ['claude', 'gemini', 'openai', 'solar'];

  // 인증 확인
  useEffect(() => {
    if (useAuthStore && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // 대화 목록 로드
  const loadConversationsRef = useRef(loadConversations);
  loadConversationsRef.current = loadConversations;
  useEffect(() => {
    loadConversationsRef.current?.();
  }, []);

  // 새 대화 생성
  const handleNewConversation = useCallback(() => {
    createConversation?.();
  }, [createConversation]);

  // 대화 선택 (메시지도 함께 로드됨)
  const handleSelectConversation = useCallback((id) => {
    selectConversation?.(id);
  }, [selectConversation]);

  // 대화 삭제
  const handleDeleteConversation = useCallback((id) => {
    deleteConversation?.(id);
  }, [deleteConversation]);

  // 메시지 전송
  const handleSendMessage = useCallback((content, attachments = []) => {
    if (!content?.trim() && attachments.length === 0) return;

    // 활성 대화가 없으면 새 대화 생성 후 전송
    if (!activeConversationId) {
      createConversation?.();
    }

    sendMessage?.(content, attachments);
  }, [activeConversationId, createConversation, sendMessage]);

  // 프로바이더 변경
  const handleProviderChange = useCallback((provider) => {
    setProvider?.(provider);
  }, [setProvider]);

  // 모델 변경
  const handleModelChange = useCallback((model) => {
    setModel?.(model);
  }, [setModel]);

  // 로그아웃
  const handleLogout = useCallback(() => {
    logout?.();
    navigate('/login');
  }, [logout, navigate]);

  // 웰컴 스크린에서 추천 프롬프트 클릭
  const handleWelcomeMessage = useCallback((prompt) => {
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  const hasActiveConversation = !!activeConversationId && messages.length > 0;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 사이드바 */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        user={user}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* 메인 채팅 영역 */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 모바일 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1
            className="text-base font-semibold text-gray-800 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={handleNewConversation}
          >
            당곡고 학생을 위한 AI 채팅
          </h1>
        </div>

        {/* 프로바이더 선택기 */}
        <ProviderSelector
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          enabledProviders={enabledProviders}
        />

        {/* 메시지 영역 또는 웰컴 스크린 */}
        <div className="flex-1 flex flex-col min-h-0">
          {hasActiveConversation || isStreaming ? (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
            />
          ) : (
            <WelcomeScreen
              onSendMessage={handleWelcomeMessage}
              firstVisitMessage={settings?.first_visit_message}
            />
          )}
        </div>

        {/* 메시지 입력 */}
        <MessageInput
          onSend={handleSendMessage}
          disabled={false}
          isStreaming={isStreaming}
        />
      </main>
    </div>
  );
}
