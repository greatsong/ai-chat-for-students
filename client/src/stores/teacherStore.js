import { create } from 'zustand';
import { apiGet, apiPatch, apiPost, apiPut, apiDelete } from '../lib/api.js';

const useTeacherStore = create((set, get) => ({
  // State
  students: [],
  conversations: [],
  conversationMessages: [],
  conversationPagination: null,
  usage: null,
  myUsage: null,
  settings: null,
  teachers: { dbEmails: [], envEmails: [] },
  isLoading: false,
  error: null,

  // ── 학생 관리 (관리자 전용) ──

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
        students: state.students.map((s) => (s.id === id ? { ...s, ...updated } : s)),
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

  // ── 대화 열람 (관리자 전용) ──

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
      // 메모리 보호: 최대 500개 메시지만 유지
      const messages = data.messages?.slice(-500) || [];
      set({ conversationMessages: messages, isLoading: false });
      return data;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('메시지 로드 실패:', error);
    }
  },

  clearConversationState: () => {
    set({ conversationMessages: [], conversationPagination: null });
  },

  deleteConversation: async (conversationId) => {
    try {
      await apiDelete(`/teacher/conversations/${conversationId}`);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        conversationMessages: [],
        conversationPagination: null,
      }));
    } catch (error) {
      console.error('대화 삭제 실패:', error);
      throw error;
    }
  },

  // ── 전체 사용량 (관리자 전용) ──

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

  // ── 내 사용량 (교사 + 관리자) ──

  loadMyUsage: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet('/teacher/my-usage');
      set({ myUsage: data, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('내 사용량 로드 실패:', error);
    }
  },

  // ── 교사 관리 (관리자 전용) ──

  loadTeachers: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiGet('/teacher/teachers');
      set({ teachers: data, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error.message });
      console.error('교사 목록 로드 실패:', error);
    }
  },

  addTeacher: async (email) => {
    try {
      const data = await apiPost('/teacher/teachers', { email });
      set({ teachers: { dbEmails: data.dbEmails, envEmails: data.envEmails } });
      return data;
    } catch (error) {
      console.error('교사 추가 실패:', error);
      throw error;
    }
  },

  removeTeacher: async (email) => {
    try {
      const data = await apiDelete('/teacher/teachers', { email });
      set({ teachers: { dbEmails: data.dbEmails, envEmails: data.envEmails } });
      return data;
    } catch (error) {
      console.error('교사 삭제 실패:', error);
      throw error;
    }
  },

  // ── 설정 (관리자 전용) ──

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
