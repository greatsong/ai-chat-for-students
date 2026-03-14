import { create } from 'zustand';
import { apiGet, apiPatch, apiPost, apiPut, apiDelete } from '../lib/api.js';

const useTeacherStore = create((set, get) => ({
  // State
  students: [],
  conversations: [],
  conversationMessages: [],
  conversationPagination: null,
  usage: null,
  settings: null,
  isLoading: false,
  error: null,

  // ── 학생 관리 ──

  loadStudents: async () => {
    set({ isLoading: true, error: null });
    try {
      const students = await apiGet('/teacher/students');
      set({ students, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('학생 목록 로드 실패:', error);
    }
  },

  updateStudent: async (id, data) => {
    try {
      const updated = await apiPatch(`/teacher/students/${id}`, data);
      set((state) => ({
        students: state.students.map((s) =>
          s.id === id ? { ...s, ...updated } : s
        ),
      }));
      return updated;
    } catch (error) {
      console.error('학생 정보 수정 실패:', error);
      throw error;
    }
  },

  bulkActivateStudents: async (ids) => {
    try {
      await apiPost('/teacher/students/bulk-activate', { studentIds: ids });
      // 학생 목록 새로고침
      await get().loadStudents();
    } catch (error) {
      console.error('일괄 활성화 실패:', error);
      throw error;
    }
  },

  // ── 대화 열람 ──

  loadConversations: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.search) params.set('search', filters.search);
      if (filters.page) params.set('page', filters.page);
      if (filters.limit) params.set('limit', filters.limit);

      const query = params.toString();
      const data = await apiGet(`/teacher/conversations${query ? '?' + query : ''}`);
      set({
        conversations: data.conversations,
        conversationPagination: data.pagination,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('대화 목록 로드 실패:', error);
    }
  },

  loadConversationMessages: async (conversationId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet(`/teacher/conversations/${conversationId}/messages`);
      set({ conversationMessages: data.messages, isLoading: false });
      return data;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('메시지 로드 실패:', error);
    }
  },

  deleteConversation: async (conversationId) => {
    try {
      await apiDelete(`/teacher/conversations/${conversationId}`);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        conversationMessages: [],
      }));
    } catch (error) {
      console.error('대화 삭제 실패:', error);
      throw error;
    }
  },

  // ── 사용량 ──

  loadUsage: async (period = 'today') => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet(`/teacher/usage?period=${period}`);
      set({ usage: data, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('사용량 로드 실패:', error);
    }
  },

  // ── 설정 ──

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await apiGet('/teacher/settings');
      set({ settings, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('설정 로드 실패:', error);
    }
  },

  updateSettings: async (key, value) => {
    try {
      const updated = await apiPut('/teacher/settings', { key, value });
      set({ settings: updated });
      return updated;
    } catch (error) {
      console.error('설정 변경 실패:', error);
      throw error;
    }
  },

  updateMultipleSettings: async (settings) => {
    try {
      const updated = await apiPut('/teacher/settings', { settings });
      set({ settings: updated });
      return updated;
    } catch (error) {
      console.error('설정 변경 실패:', error);
      throw error;
    }
  },
}));

export default useTeacherStore;
