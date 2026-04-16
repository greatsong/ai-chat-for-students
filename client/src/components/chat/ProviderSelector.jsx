import { useState, useRef, useEffect } from 'react';

// PROVIDERS 정의 - shared 패키지와 동일한 내용을 인라인으로 유지
// (shared 패키지가 빌드 타임에 resolve되지 않을 수 있으므로 인라인 폴백 사용)
const PROVIDERS = {
  claude: {
    name: 'Claude',
    company: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'standard' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: false, codeExecution: false, imageGeneration: false },
  },
  gemini: {
    name: 'Gemini',
    company: 'Google',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', tier: 'standard' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: true, codeExecution: true, imageGeneration: true },
  },
  openai: {
    name: 'ChatGPT',
    company: 'OpenAI',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', tier: 'standard' },
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: false, codeExecution: false, imageGeneration: false },
  },
  solar: {
    name: 'Solar',
    company: 'Upstage',
    models: [{ id: 'solar-pro3', name: 'Solar Pro 3', tier: 'standard' }],
    features: { vision: false, webSearch: false, codeExecution: false, imageGeneration: false },
  },
};

// 프로바이더 아이콘 컬러
const PROVIDER_COLORS = {
  claude: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-400',
    activeBg: 'bg-orange-500',
  },
  gemini: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-400',
    activeBg: 'bg-blue-500',
  },
  openai: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-400',
    activeBg: 'bg-green-500',
  },
  solar: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-400',
    activeBg: 'bg-purple-500',
  },
};

// 기능 뱃지 SVG 아이콘
const featureIcons = {
  webSearch: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  ),
  imageGeneration: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
      />
    </svg>
  ),
  codeExecution: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
      />
    </svg>
  ),
  vision: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const featureLabels = {
  webSearch: '검색',
  imageGeneration: '이미지',
  codeExecution: '코드',
  vision: '비전',
};

function FeatureBadges({ features }) {
  const activeFeatures = ['webSearch', 'imageGeneration', 'codeExecution', 'vision'].filter(
    (f) => features?.[f],
  );

  if (activeFeatures.length === 0) return null;

  return (
    <div className="flex gap-1.5">
      {activeFeatures.map((f) => (
        <span
          key={f}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md border border-indigo-100/60 transition-colors hover:bg-indigo-100/80"
          title={featureLabels[f]}
        >
          {featureIcons[f]}
          <span className="hidden sm:inline">{featureLabels[f]}</span>
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
  enabledModels,
  availableModels,
}) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // 활성화된 프로바이더 목록
  const availableProviders = Object.entries(PROVIDERS).filter(
    ([key]) => !enabledProviders || enabledProviders.length === 0 || enabledProviders.includes(key),
  );

  // 현재 프로바이더의 모델 목록 (커스텀 모델 + 활성화 필터 적용)
  const currentProvider = PROVIDERS[selectedProvider];
  const getProviderModels = (providerKey) => {
    const provider = PROVIDERS[providerKey];
    if (!provider) return [];
    const defaultModels = provider.models;
    const customModelIds = availableModels?.[providerKey] || [];
    const enabledModelIds = enabledModels?.[providerKey];

    // 기본 모델 + 커스텀 모델 합치기 (중복 제거)
    const allModelIds = new Set(defaultModels.map((m) => m.id));
    const allModels = [...defaultModels];
    for (const id of customModelIds) {
      if (!allModelIds.has(id)) {
        allModels.push({ id, name: id, tier: 'custom' });
        allModelIds.add(id);
      }
    }

    // enabledModels가 설정되어 있으면 필터, 없으면 전부 표시
    if (enabledModelIds && enabledModelIds.length > 0) {
      return allModels.filter((m) => enabledModelIds.includes(m.id));
    }
    return allModels;
  };

  const currentModels = getProviderModels(selectedProvider);
  const currentModel = currentModels.find((m) => m.id === selectedModel) || currentModels[0];

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
                const models = getProviderModels(key);
                const defaultModel = models[0]?.id;
                if (defaultModel) onModelChange?.(defaultModel);
              }}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${
                  isActive
                    ? `${colors.activeBg} text-white shadow-sm ring-1 ring-inset ring-white/20`
                    : `bg-gray-50 text-gray-600 hover:bg-gray-100`
                }
              `}
            >
              {getProviderIcon(key)}
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
            <svg
              className={`w-4 h-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showModelDropdown && currentModels.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              {currentModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange?.(model.id);
                    setShowModelDropdown(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 text-sm transition-colors
                    ${
                      model.id === selectedModel
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span>{model.name}</span>
                    {model.tier === 'advanced' && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                        Pro
                      </span>
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
  const dotColors = {
    claude: 'bg-orange-400',
    gemini: 'bg-blue-400',
    openai: 'bg-green-400',
    solar: 'bg-purple-400',
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColors[key] || 'bg-gray-400'}`} />
  );
}

export { PROVIDERS };
