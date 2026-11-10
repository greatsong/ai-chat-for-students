import { create } from 'zustand';
import { apiGet, apiPost, apiDelete, apiStreamPost, apiUploadFile } from '../lib/api.js';

let _tempIdCounter = 0;
let _loadConversationsPromise = null;

// 화면에 반영할 스트림. 답변 생성 중에 다른 대화로 옮기면 0으로 바꿔, 이전 스트림의 글자가
// 새로 연 대화의 말풍선에 붙지 않게 한다. 서버는 원래 대화에 답변을 끝까지 저장한다.
let _streamSeq = 0;
let _activeStreamId = 0;
// 대화를 열 때 응답 순서가 뒤바뀌어도 마지막으로 누른 대화만 표시한다.
let _selectSeq = 0;
// 답변 생성 중에 삭제한 대화가 스트림이 끝난 뒤 사이드바에 다시 생기지 않게 한다.
const _deletedConversationIds = new Set();

// 오류 문구를 그대로 보여 줄지 판단한다. 서버의 4xx 응답은 학생이 할 일을 알려 주는 한국어 문구다.
function isActionableError(error) {
  const status = error?.status;
  if (status >= 400 && status < 500) return true;
  const raw = error?.message || '';
  return ['사용량', '인증', '한도', '413'].some((k) => raw.includes(k));
}

function describeFile(file) {
  if (file.type?.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  return 'text';
}

const useChatStore = create((set, get) => ({
  // State
  conversations: [],
  currentConversation: null,
  messages: [],
  isStreaming: false,
  selectedProvider: 'claude',
  selectedModel: 'claude-sonnet-5-5',
  contextTrimmed: null, // { trimmedCount, totalMessages, usedMessages }
  fileNotice: null, // { kind: 'sampled', files: [{name, originalChars}] }

  // Actions

  /**
   * 대화 목록 조회 (중복 요청 방지)
   */
  loadConversations: async () => {
    if (_loadConversationsPromise) return _loadConversationsPromise;
    _loadConversationsPromise = apiGet('/conversations')
      .then((conversations) => set({ conversations }))
      .catch((error) => console.error('대화 목록 로드 실패:', error))
      .finally(() => {
        _loadConversationsPromise = null;
      });
    return _loadConversationsPromise;
  },

  /**
   * 특정 대화 선택 및 메시지 로드
   */
  selectConversation: async (id) => {
    // 진행 중인 스트림은 화면에서만 떼어 낸다 (서버는 원래 대화에 계속 저장)
    _activeStreamId = 0;
    const seq = ++_selectSeq;
    if (!id) {
      set({ currentConversation: null, messages: [], isStreaming: false });
      return;
    }

    try {
      const data = await apiGet(`/conversations/${id}`);
      if (seq !== _selectSeq) return;
      set({
        isStreaming: false,
        contextTrimmed: null,
        fileNotice: null,
        currentConversation: data.conversation,
        messages: data.messages,
        selectedProvider: data.conversation.provider || 'claude',
        selectedModel: data.conversation.model || 'claude-sonnet-5-5',
      });
    } catch (error) {
      console.error('대화 로드 실패:', error);
    }
  },

  /**
   * 새 대화 시작 (UI에서 초기화만, 실제 생성은 첫 메시지 전송 시)
   */
  createConversation: (provider, model) => {
    const { selectedProvider, selectedModel } = get();
    _activeStreamId = 0;
    ++_selectSeq;
    set({
      currentConversation: null,
      messages: [],
      isStreaming: false,
      contextTrimmed: null,
      fileNotice: null,
      selectedProvider: provider || selectedProvider || 'claude',
      selectedModel: model || selectedModel || 'claude-sonnet-5-5',
    });
  },

  /**
   * 메시지 전송 (스트리밍)
   */
  sendMessage: async (content, rawFiles = []) => {
    const { currentConversation, selectedProvider, selectedModel } = get();
    const streamId = ++_streamSeq;
    _activeStreamId = streamId;
    const isActive = () => _activeStreamId === streamId;

    // 1. 사용자 메시지와 빈 답변을 바로 보여 주고 입력을 잠근다.
    //    업로드가 끝난 뒤에 그리면 그사이 학생이 전송이 안 된 줄 알고 다시 보낸다.
    const userMessage = {
      id: `temp-user-${++_tempIdCounter}`,
      role: 'user',
      content,
      files: rawFiles.map((f) => ({ name: f.name, type: describeFile(f), size: f.size })),
      created_at: new Date().toISOString(),
    };
    const assistantMessage = {
      id: `temp-assistant-${++_tempIdCounter}`,
      role: 'assistant',
      content: '',
      input_tokens: 0,
      output_tokens: 0,
      created_at: new Date().toISOString(),
    };

    set({
      messages: [...get().messages, userMessage, assistantMessage],
      isStreaming: true,
      contextTrimmed: null,
      fileNotice: null,
    });

    // 이 스트림의 답변 말풍선만 고친다 (마지막 메시지를 고치면 대화를 옮겼을 때 엉뚱한 말풍선이 바뀐다)
    const patchAssistant = (patch) => {
      if (!isActive()) return;
      set({
        messages: get().messages.map((m) =>
          m.id === assistantMessage.id ? { ...m, ...patch(m) } : m,
        ),
      });
    };
    const finish = () => {
      if (isActive()) {
        _activeStreamId = 0;
        set({ isStreaming: false });
      }
    };

    // 2. 파일 업로드 — 하나가 실패해도 나머지는 보낸다. 실패한 파일은 안내한다.
    let uploadedFiles = [];
    if (rawFiles.length > 0) {
      const results = await Promise.allSettled(rawFiles.map((file) => apiUploadFile(file)));
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.content && r.value.type !== 'unsupported') {
          uploadedFiles.push({
            name: r.value.name,
            type: r.value.type,
            mimeType: r.value.mimeType,
            data: r.value.content,
            size: r.value.size,
          });
        } else {
          failed.push(rawFiles[i].name);
        }
      });
      if (failed.length > 0 && isActive()) {
        set({ fileNotice: { kind: 'upload_failed', files: failed.map((name) => ({ name })) } });
      }
      if (isActive()) {
        set({
          messages: get().messages.map((m) =>
            m.id === userMessage.id
              ? {
                  ...m,
                  files: uploadedFiles.map((f) => ({ name: f.name, type: f.type, size: f.size })),
                }
              : m,
          ),
        });
      }
      if (uploadedFiles.length === 0 && !content?.trim()) {
        patchAssistant(() => ({
          content:
            '첨부 파일을 올리지 못했어요. 파일 형식과 크기(10MB 이하)를 확인한 뒤 다시 보내 주세요.',
          isFriendlyError: true,
        }));
        finish();
        return;
      }
    }

    let conversationId = currentConversation?.id || null;
    let ended = false; // done 또는 error 이벤트를 받았는가

    try {
      // 3. SSE 스트리밍 요청
      await apiStreamPost(
        '/chat',
        {
          conversationId,
          message: content,
          provider: selectedProvider,
          model: selectedModel,
          files: uploadedFiles,
          web_search: true,
          code_execution: true,
        },
        (chunk) => {
          if (chunk.type === 'conversationId') {
            // 새 대화 생성 시 ID 수신 — 화면이 이 스트림을 보고 있을 때만 현재 대화로 삼는다
            conversationId = chunk.conversationId;
            if (isActive()) {
              set({
                currentConversation: {
                  ...(get().currentConversation || {}),
                  id: chunk.conversationId,
                  title: get().currentConversation?.title || (content || '').slice(0, 50),
                  provider: selectedProvider,
                  model: selectedModel,
                },
              });
            }
            return;
          }
          if (!isActive()) return;

          if (chunk.type === 'context_trimmed') {
            set({ contextTrimmed: chunk });
          } else if (chunk.type === 'text') {
            patchAssistant((m) => ({ content: m.content + chunk.content }));
          } else if (chunk.type === 'done') {
            ended = true;
            patchAssistant(() => ({
              input_tokens: chunk.usage?.input || 0,
              output_tokens: chunk.usage?.output || 0,
            }));
            finish();
          } else if (chunk.type === 'files_sampled') {
            // 큰 텍스트 파일이 자동 샘플링됨 — 학생에게 친근한 안내 배너
            set({ fileNotice: { kind: 'sampled', files: chunk.files || [] } });
          } else if (chunk.type === 'error') {
            // AI가 이미 답변을 일부라도 보냈으면 그 내용을 보존하고 보조 안내만 덧붙인다
            ended = true;
            patchAssistant((m) =>
              m.content.trim().length > 0
                ? { errorNote: '응답 도중 연결이 끊겨 일부가 누락됐을 수 있어요.' }
                : {
                    content:
                      '답변을 만드는 중에 잠깐 막혔어요. 같은 메시지를 한 번 더 보내볼까요? 🙏',
                    isFriendlyError: true,
                  },
            );
            finish();
          }
        },
      );

      // 스트림이 done·error 없이 닫혔다 (프록시가 연결을 끊은 경우 등). 입력창이 잠긴 채 남지 않게 한다.
      if (!ended) {
        patchAssistant((m) =>
          m.content.trim().length > 0
            ? { errorNote: '응답 도중 연결이 끊겨 일부가 누락됐을 수 있어요.' }
            : {
                content: '응답이 중간에 끊겼어요. 같은 메시지를 한 번 더 보내 주세요.',
                isFriendlyError: true,
              },
        );
        finish();
      }

      // 4. 대화 목록에 현재 대화 반영 (전체 리페치 대신 로컬 업데이트)
      if (conversationId && !_deletedConversationIds.has(conversationId)) {
        const { conversations } = get();
        const label = content || uploadedFiles[0]?.name || '새 대화';
        const title = label.slice(0, 30) + (label.length > 30 ? '...' : '');
        const existing = conversations.find((c) => c.id === conversationId);
        if (existing) {
          set({
            conversations: conversations.map((c) =>
              c.id === conversationId ? { ...c, updated_at: new Date().toISOString() } : c,
            ),
          });
        } else {
          set({
            conversations: [
              {
                id: conversationId,
                title,
                provider: selectedProvider,
                model: selectedModel,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              ...conversations,
            ],
          });
        }
      }
    } catch (error) {
      console.error('메시지 전송 실패:', error);

      // 한도 초과·비활성 프로바이더·제한 모델 등 서버가 알려 준 사유는 그대로 보여 준다.
      const actionable = isActionableError(error);
      const raw = error?.message || '';
      patchAssistant((m) =>
        m.content.trim().length > 0
          ? { errorNote: actionable ? raw : '응답 도중 연결이 끊겨 일부가 누락됐을 수 있어요.' }
          : {
              content: actionable
                ? raw
                : '답변을 만드는 중에 잠깐 막혔어요. 같은 메시지를 한 번 더 보내볼까요? 🙏',
              isFriendlyError: !actionable,
            },
      );
      finish();
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
    const { currentConversation, messages, selectedProvider, selectedModel } = get();

    // 사용자 요청 메시지 추가
    const userMessage = {
      id: `temp-user-${++_tempIdCounter}`,
      role: 'user',
      content: `🎨 이미지 생성: ${prompt}`,
      created_at: new Date().toISOString(),
    };

    // 로딩 어시스턴트 메시지 추가
    const assistantMessage = {
      id: `temp-assistant-${++_tempIdCounter}`,
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

      // 이미지 생성 완료 — 이 요청의 어시스턴트 메시지만 업데이트
      set({
        messages: get().messages.map((m) =>
          m.id === assistantMessage.id
            ? {
                ...m,
                content: result.content || '이미지가 생성되었습니다.',
                image_url: result.imageUrl,
              }
            : m,
        ),
        isStreaming: false,
      });

      // 빈 채팅에서 바로 생성한 경우, 서버가 새로 만든 대화를 채택 (새로고침해도 유지)
      if (result.conversationId && !currentConversation) {
        set({
          currentConversation: {
            id: result.conversationId,
            provider: selectedProvider,
            model: selectedModel,
          },
        });
        get().loadConversations();
      }
    } catch (error) {
      console.error('이미지 생성 실패:', error);
      set({
        messages: get().messages.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: `이미지 생성 오류: ${error.message}` }
            : m,
        ),
        isStreaming: false,
      });
    }
  },

  /**
   * 대화 삭제
   */
  deleteConversation: async (id) => {
    try {
      await apiDelete(`/conversations/${id}`);
      _deletedConversationIds.add(id);

      const { currentConversation } = get();

      // 현재 보고 있는 대화가 삭제되면 초기화
      if (currentConversation?.id === id) {
        _activeStreamId = 0;
        set({ currentConversation: null, messages: [], isStreaming: false });
      }

      // 목록 새로고침
      get().loadConversations();
    } catch (error) {
      console.error('대화 삭제 실패:', error);
    }
  },
}));

export default useChatStore;
