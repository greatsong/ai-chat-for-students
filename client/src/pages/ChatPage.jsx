import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/chat/Sidebar';
import ProviderSelector from '../components/chat/ProviderSelector';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';
import WelcomeScreen from '../components/chat/WelcomeScreen';
import { apiGet } from '../lib/api';
import useChatStore from '../stores/chatStore';
import useAuthStore from '../stores/authStore';

export default function ChatPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [publicSettings, setPublicSettings] = useState({});

  // Auth store
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const settings = useAuthStore((s) => s.settings);

  // Chat store
  const conversations = useChatStore((s) => s.conversations);
  const currentConversation = useChatStore((s) => s.currentConversation);
  const activeConversationId = currentConversation?.id || null;
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const selectedProvider = useChatStore((s) => s.selectedProvider);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const createConversation = useChatStore((s) => s.createConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const generateImage = useChatStore((s) => s.generateImage);
  const speakMessage = useChatStore((s) => s.speakMessage);
  const transcribeAudio = useChatStore((s) => s.transcribeAudio);
  const setProvider = useChatStore((s) => s.setProvider);
  const setModel = useChatStore((s) => s.setModel);
  const loadConversations = useChatStore((s) => s.loadConversations);

  const enabledProviders = settings?.enabled_providers || ['claude', 'gemini', 'openai', 'solar'];
  const enabledModels = settings?.enabled_models || {};
  const availableModels = settings?.available_models || {};

  // 인증 확인
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // 공개 설정 로드 (TTS/STT 상태)
  useEffect(() => {
    apiGet('/teacher/public-settings')
      .then(setPublicSettings)
      .catch(() => {});
  }, []);

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
  const handleSelectConversation = useCallback(
    (id) => {
      selectConversation?.(id);
    },
    [selectConversation],
  );

  // 대화 삭제
  const handleDeleteConversation = useCallback(
    (id) => {
      deleteConversation?.(id);
    },
    [deleteConversation],
  );

  // 메시지 전송
  const handleSendMessage = useCallback(
    (content, attachments = []) => {
      if (!content?.trim() && attachments.length === 0) return;

      // 활성 대화가 없으면 새 대화 생성 후 전송
      if (!activeConversationId) {
        createConversation?.();
      }

      sendMessage?.(content, attachments);
    },
    [activeConversationId, createConversation, sendMessage],
  );

  // 프로바이더 변경
  const handleProviderChange = useCallback(
    (provider) => {
      setProvider?.(provider);
    },
    [setProvider],
  );

  // 모델 변경
  const handleModelChange = useCallback(
    (model) => {
      setModel?.(model);
    },
    [setModel],
  );

  // 로그아웃
  const handleLogout = useCallback(() => {
    logout?.();
    navigate('/login');
  }, [logout, navigate]);

  // 웰컴 스크린에서 추천 프롬프트 클릭
  const handleWelcomeMessage = useCallback(
    (prompt) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage],
  );

  // 이미지 생성 (교사 전용)
  const handleGenerateImage = useCallback(
    (prompt, provider) => {
      generateImage?.(prompt, provider);
    },
    [generateImage],
  );

  // TTS 음성 합성
  const handleSpeak = useCallback(
    (text) => {
      return speakMessage?.(
        text,
        publicSettings.tts_default_voice,
        publicSettings.tts_default_model,
      );
    },
    [speakMessage, publicSettings.tts_default_voice, publicSettings.tts_default_model],
  );

  // STT 음성 인식
  const handleTranscribe = useCallback(
    async (audioBase64, mimeType) => {
      return transcribeAudio?.(audioBase64, mimeType);
    },
    [transcribeAudio],
  );

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';

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
            <svg
              className="w-6 h-6 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
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
          enabledModels={enabledModels}
          availableModels={availableModels}
        />

        {/* 메시지 영역 또는 웰컴 스크린 */}
        <div className="flex-1 flex flex-col min-h-0">
          {hasActiveConversation || isStreaming ? (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              ttsEnabled={isTeacher || !!publicSettings.tts_enabled}
              onSpeak={handleSpeak}
            />
          ) : (
            <WelcomeScreen
              onSendMessage={handleWelcomeMessage}
              firstVisitMessage={settings?.first_visit_message}
              userRole={user?.role}
            />
          )}
        </div>

        {/* 메시지 입력 */}
        <MessageInput
          onSend={handleSendMessage}
          onGenerateImage={handleGenerateImage}
          onTranscribe={handleTranscribe}
          disabled={false}
          isStreaming={isStreaming}
          isTeacher={isTeacher}
          sttEnabled={false}
        />
      </main>
    </div>
  );
}
