import { useState, useEffect } from 'react';

const DEFAULT_FIRST_VISIT_MESSAGE =
  '여러분이 바르게 AI를 사용하도록 돕고, AI를 활용하여 자기주도적으로 깊이있게 학습하고 탐구하는 모습을 칭찬하고 격려하기 위해 채팅 내용은 기록됩니다. 따라서 학습 목적 외에 AI를 활용하거나 모든 것을 AI에게 맡기는 형태로 AI를 사용하지 않길 바랍니다.';

// 추천 프롬프트
const SUGGESTED_PROMPTS = [
  {
    icon: '📝',
    title: '글쓰기 도움',
    prompt: '에세이 작성을 도와줘. 주제는...',
  },
  {
    icon: '🧮',
    title: '수학 문제 풀이',
    prompt: '이 수학 문제를 단계별로 설명해줘:',
  },
  {
    icon: '🔬',
    title: '과학 개념 탐구',
    prompt: '다음 과학 개념을 쉽게 설명해줘:',
  },
  {
    icon: '🌍',
    title: '역사/사회 탐구',
    prompt: '이 역사적 사건에 대해 알려줘:',
  },
  {
    icon: '💡',
    title: '아이디어 브레인스토밍',
    prompt: '프로젝트 아이디어를 같이 정리해줘. 주제는...',
  },
  {
    icon: '📖',
    title: '독서 토론',
    prompt: '이 책에 대해 토론해보자:',
  },
];

export default function WelcomeScreen({ onSendMessage, firstVisitMessage, userRole }) {
  const [showFirstVisit, setShowFirstVisit] = useState(false);
  const isTeacherOrAdmin = userRole === 'teacher' || userRole === 'admin';

  useEffect(() => {
    // 교사/관리자는 첫 방문 안내 표시 안 함
    if (isTeacherOrAdmin) return;
    const seen = localStorage.getItem('first_visit_seen');
    if (!seen) {
      setShowFirstVisit(true);
    }
  }, [isTeacherOrAdmin]);

  const dismissFirstVisit = () => {
    localStorage.setItem('first_visit_seen', 'true');
    setShowFirstVisit(false);
  };

  const handlePromptClick = (prompt) => {
    onSendMessage?.(prompt);
  };

  // 교사/관리자용 간단한 웰컴 화면
  if (isTeacherOrAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 py-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
            <span className="text-3xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            AI 채팅
          </h1>
          <p className="text-gray-500 text-sm">
            자유롭게 대화를 시작하세요. 시스템 프롬프트 없이 AI를 사용할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 overflow-y-auto">
      {/* 첫 방문 메시지 모달 */}
      {showFirstVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl p-6 animate-in fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                <span className="text-xl">📢</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">안내 사항</h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-6">
              {firstVisitMessage || DEFAULT_FIRST_VISIT_MESSAGE}
            </p>
            <button
              onClick={dismissFirstVisit}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}

      {/* 메인 웰컴 콘텐츠 */}
      <div className="w-full max-w-2xl">
        {/* 타이틀 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg">
            <span className="text-3xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            당곡고 학생 여러분!
          </h1>
          <p className="text-gray-500 text-sm">
            AI와 학습과 관련된 대화를 시작하세요! 아래 추천 주제를 눌러 바로 시작할 수도 있습니다.
          </p>
        </div>

        {/* 추천 프롬프트 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTED_PROMPTS.map((item) => (
            <button
              key={item.title}
              onClick={() => handlePromptClick(item.prompt)}
              className="flex items-start gap-3 p-4 text-left bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <span className="text-2xl mt-0.5 group-hover:scale-110 transition-transform">
                {item.icon}
              </span>
              <div>
                <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.prompt}</div>
              </div>
            </button>
          ))}
        </div>

        {/* 팁 */}
        <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">
            💡 효과적인 AI 활용 팁
          </h3>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• 구체적인 질문을 하면 더 좋은 답변을 받을 수 있어요</li>
            <li>• 답변이 이해되지 않으면 "더 쉽게 설명해줘"라고 요청해보세요</li>
            <li>• 파일을 첨부하여 내용에 대해 질문할 수 있어요</li>
            <li>• 여러 AI 모델을 비교해보세요 - 각각 다른 강점이 있어요</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
