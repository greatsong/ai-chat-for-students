import { useState } from 'react';
import { apiPost } from '../../lib/api';

// 평가 앱 주소 (proof-of-process). 배포 시 VITE_EVALUATOR_URL 로 주입.
const EVALUATOR_URL = import.meta.env.VITE_EVALUATOR_URL || 'https://pro-of-ai.vercel.app';

/**
 * 현재 대화를 외부 평가 앱으로 넘기는 "평가받기" 버튼.
 * 서버에서 일회용 공유 토큰을 발급받아 평가 앱을 #import=<토큰> 프래그먼트로 연다.
 * (토큰은 쿼리스트링이 아닌 프래그먼트로 전달 — 서버 로그/Referer 에 남지 않음)
 */
export default function SendToEvaluatorButton({ conversationId, messages = [], disabled }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const exportable = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  // 서버에 저장된 대화 id 가 있어야 공유 가능 (스트리밍 중/새 대화는 id 없음)
  const isDisabled = disabled || loading || !conversationId || exportable.length === 0;

  const handleClick = async () => {
    if (isDisabled) return;
    setError('');

    // 팝업 차단 회피: 사용자 클릭 제스처 안에서 먼저 빈 탭을 연다.
    const win = window.open('about:blank', '_blank');
    // 역탭내빙 방지: 새 탭이 이 페이지(window.opener)에 접근하지 못하게 차단
    if (win) win.opener = null;

    setLoading(true);
    try {
      const { token } = await apiPost('/share', { conversationId });
      const target = `${EVALUATOR_URL}/#import=${token}`;
      if (win) {
        win.location.replace(target);
      } else {
        // 팝업이 막힌 경우: 현재 탭에서 이동
        window.location.href = target;
      }
    } catch (err) {
      if (win) win.close();
      setError(err.message || '평가 앱으로 보내지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        title={
          !conversationId
            ? '대화를 시작한 뒤에 평가받을 수 있어요'
            : '이 대화를 AI 채팅 평가 앱으로 보내기'
        }
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        평가받기
      </button>

      {error && (
        <div className="absolute right-0 mt-1 w-56 px-3 py-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg shadow-sm z-20">
          {error}
        </div>
      )}
    </div>
  );
}
