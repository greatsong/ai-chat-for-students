import { create } from 'zustand';
import { apiGet, apiPost, apiDelete, apiStreamPost, apiUploadFile } from '../lib/api.js';

const useChatStore = create((set, get) => ({
  // State
  conversations: [],
  currentConversation: null,
  messages: [],
  isStreaming: false,
  selectedProvider: 'claude',
  selectedModel: 'claude-sonnet-4-6',

  // Actions

  /**
   * 대화 목록 조회
   */
  loadConversations: async () => {
    try {
      const conversations = await apiGet('/conversations');
      set({ conversations });
    } catch (error) {
      console.error('대화 목록 로드 실패:', error);
    }
  },

  /**
   * 특정 대화 선택 및 메시지 로드
   */
  selectConversation: async (id) => {
    if (!id) {
      set({ currentConversation: null, messages: [] });
      return;
    }

    try {
      const data = await apiGet(`/conversations/${id}`);
      set({
        currentConversation: data.conversation,
        messages: data.messages,
        selectedProvider: data.conversation.provider || 'claude',
        selectedModel: data.conversation.model || 'claude-sonnet-4-6',
      });
    } catch (error) {
      console.error('대화 로드 실패:', error);
    }
  },

  /**
   * 새 대화 시작 (UI에서 초기화만, 실제 생성은 첫 메시지 전송 시)
   */
  createConversation: (provider, model) => {
    set({
      currentConversation: null,
      messages: [],
      selectedProvider: provider || 'claude',
      selectedModel: model || 'claude-sonnet-4-6',
    });
  },

  /**
   * 메시지 전송 (스트리밍)
   */
  sendMessage: async (content, rawFiles = []) => {
    const { currentConversation, messages, selectedProvider, selectedModel } = get();

    // 0. 파일 업로드 처리 (raw File 객체 → 서버 업로드 → 처리된 데이터)
    let uploadedFiles = [];
    if (rawFiles.length > 0) {
      try {
        const uploadPromises = rawFiles.map((file) => apiUploadFile(file));
        const results = await Promise.all(uploadPromises);
        uploadedFiles = results.map((r) => ({
          name: r.name,
          type: r.type,
          mimeType: r.mimeType,
          data: r.content,
          size: r.size,
        }));
      } catch (error) {
        console.error('파일 업로드 실패:', error);
      }
    }

    // 1. 사용자 메시지 즉시 추가
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      files: uploadedFiles,
      created_at: new Date().toISOString(),
    };

    // 2. 빈 어시스턴트 메시지 추가
    const assistantMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      input_tokens: 0,
      output_tokens: 0,
      created_at: new Date().toISOString(),
    };

    set({
      messages: [...messages, userMessage, assistantMessage],
      isStreaming: true,
    });

    try {
      // 3. SSE 스트리밍 요청
      let conversationId = currentConversation?.id || null;

      await apiStreamPost(
        '/chat',
        {
          conversationId,
          message: content,
          provider: selectedProvider,
          model: selectedModel,
          files: uploadedFiles,
        },
        (chunk) => {
          const currentMessages = get().messages;
          const lastIdx = currentMessages.length - 1;

          if (chunk.type === 'conversationId') {
            // 새 대화 생성 시 ID 수신
            conversationId = chunk.conversationId;
            set({
              currentConversation: {
                id: chunk.conversationId,
                provider: selectedProvider,
                model: selectedModel,
              },
            });
          } else if (chunk.type === 'text') {
            // 텍스트 청크 수신 — 어시스턴트 메시지 업데이트
            const updated = [...currentMessages];
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + chunk.content,
            };
            set({ messages: updated });
          } else if (chunk.type === 'done') {
            // 완료 — 사용량 정보 업데이트
            const updated = [...currentMessages];
            updated[lastIdx] = {
              ...updated[lastIdx],
              input_tokens: chunk.usage?.input || 0,
              output_tokens: chunk.usage?.output || 0,
            };
            set({ messages: updated, isStreaming: false });
          } else if (chunk.type === 'error') {
            // 에러
            const updated = [...currentMessages];
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: `오류: ${chunk.message}`,
            };
            set({ messages: updated, isStreaming: false });
          }
        }
      );

      // 4. 대화 목록 새로고침
      get().loadConversations();
    } catch (error) {
      console.error('메시지 전송 실패:', error);

      // 에러 시 어시스턴트 메시지에 에러 표시
      const currentMessages = get().messages;
      const lastIdx = currentMessages.length - 1;
      const updated = [...currentMessages];
      updated[lastIdx] = {
        ...updated[lastIdx],
        content: `오류: ${error.message}`,
      };
      set({ messages: updated, isStreaming: false });
    }
  },

  /**
   * 프로바이더 변경
   */
  setProvider: (provider) => {
    set({ selectedProvider: provider });
  },

  /**
   * 모델 변경
   */
  setModel: (model) => {
    set({ selectedModel: model });
  },

  /**
   * 이미지 생성 (교사 전용)
   */
  generateImage: async (prompt, provider = 'gemini') => {
    const { currentConversation, messages } = get();

    // 사용자 요청 메시지 추가
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: `🎨 이미지 생성: ${prompt}`,
      created_at: new Date().toISOString(),
    };

    // 로딩 어시스턴트 메시지 추가
    const assistantMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '이미지를 생성하고 있습니다...',
      created_at: new Date().toISOString(),
    };

    set({
      messages: [...messages, userMessage, assistantMessage],
      isStreaming: true,
    });

    try {
      const result = await apiPost('/image/generate', {
        prompt,
        provider,
        conversationId: currentConversation?.id || null,
      });

      // 이미지 생성 완료 — 어시스턴트 메시지 업데이트
      const currentMessages = get().messages;
      const lastIdx = currentMessages.length - 1;
      const updated = [...currentMessages];
      updated[lastIdx] = {
        ...updated[lastIdx],
        content: '이미지가 생성되었습니다.',
        image_url: result.imageUrl,
      };
      set({ messages: updated, isStreaming: false });

      // 대화 목록 새로고침
      get().loadConversations();
    } catch (error) {
      console.error('이미지 생성 실패:', error);
      const currentMessages = get().messages;
      const lastIdx = currentMessages.length - 1;
      const updated = [...currentMessages];
      updated[lastIdx] = {
        ...updated[lastIdx],
        content: `이미지 생성 오류: ${error.message}`,
      };
      set({ messages: updated, isStreaming: false });
    }
  },

  /**
   * 대화 삭제
   */
  deleteConversation: async (id) => {
    try {
      await apiDelete(`/conversations/${id}`);

      const { currentConversation } = get();

      // 현재 보고 있는 대화가 삭제되면 초기화
      if (currentConversation?.id === id) {
        set({ currentConversation: null, messages: [] });
      }

      // 목록 새로고침
      get().loadConversations();
    } catch (error) {
      console.error('대화 삭제 실패:', error);
    }
  },
}));

export default useChatStore;
