import { useState, useRef, useEffect } from 'react';

// PROVIDERS 정의 - shared 패키지와 동일한 내용을 인라인으로 유지
// (shared 패키지가 빌드 타임에 resolve되지 않을 수 있으므로 인라인 폴백 사용)
const PROVIDERS = {
  claude: {
    name: 'Claude', company: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'standard' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: false, codeExecution: false, imageGeneration: false },
  },
  gemini: {
    name: 'Gemini', company: 'Google',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', tier: 'standard' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: true, codeExecution: true, imageGeneration: true },
  },
  openai: {
    name: 'ChatGPT', company: 'OpenAI',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', tier: 'standard' },
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: true, codeExecution: false, imageGeneration: true },
  },
  solar: {
    name: 'Solar', company: 'Upstage',
    models: [{ id: 'solar-pro3', name: 'Solar Pro 3', tier: 'standard' }],
    features: { vision: false, webSearch: false, codeExecution: false, imageGeneration: false },
  },
};

// 프로바이더 아이콘 컬러
const PROVIDER_COLORS = {
  claude: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400', activeBg: 'bg-orange-500' },
  gemini: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-400', activeBg: 'bg-blue-500' },
  openai: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-400', activeBg: 'bg-green-500' },
  solar: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-400', activeBg: 'bg-purple-500' },
};

// 기능 뱃지
function FeatureBadges({ features }) {
  const badges = [];
  if (features?.webSearch) badges.push({ icon: '🔍', label: '검색' });
  if (features?.imageGeneration) badges.push({ icon: '🖼️', label: '이미지' });
  if (features?.codeExecution) badges.push({ icon: '💻', label: '코드' });
  if (features?.vision) badges.push({ icon: '👁️', label: '비전' });

  if (badges.length === 0) return null;

  return (
    <div className="flex gap-1 mt-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
          title={b.label}
        >
          {b.icon}
          <span className="hidden sm:inline">{b.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function ProviderSelector({
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  enabledProviders,
}) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // 활성화된 프로바이더 목록
  const availableProviders = Object.entries(PROVIDERS).filter(
    ([key]) => !enabledProviders || enabledProviders.length === 0 || enabledProviders.includes(key)
  );

  const currentProvider = PROVIDERS[selectedProvider];
  const currentModel = currentProvider?.models?.find((m) => m.id === selectedModel) || currentProvider?.models?.[0];

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 bg-white border-b border-gray-200">
      {/* 프로바이더 탭 */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {availableProviders.map(([key, provider]) => {
          const isActive = selectedProvider === key;
          const colors = PROVIDER_COLORS[key] || PROVIDER_COLORS.claude;
          return (
            <button
              key={key}
              onClick={() => {
                onProviderChange?.(key);
                const defaultModel = provider.models[0]?.id;
                if (defaultModel) onModelChange?.(defaultModel);
              }}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${isActive
                  ? `${colors.activeBg} text-white shadow-sm`
                  : `${colors.bg} ${colors.text} hover:opacity-80`
                }
              `}
            >
              <span className="text-base">{getProviderIcon(key)}</span>
              <span>{provider.name}</span>
            </button>
          );
        })}
      </div>

      {/* 모델 선택 + 기능 뱃지 */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span>{currentModel?.name || '모델 선택'}</span>
            <svg className={`w-4 h-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showModelDropdown && currentProvider?.models && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {currentProvider.models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange?.(model.id);
                    setShowModelDropdown(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 text-sm transition-colors
                    ${model.id === selectedModel
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span>{model.name}</span>
                    {model.tier === 'advanced' && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Pro</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <FeatureBadges features={currentProvider?.features} />
      </div>
    </div>
  );
}

function getProviderIcon(key) {
  switch (key) {
    case 'claude': return '🟠';
    case 'gemini': return '🔵';
    case 'openai': return '🟢';
    case 'solar': return '🟣';
    default: return '⚪';
  }
}

export { PROVIDERS };
