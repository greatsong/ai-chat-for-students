import { useEffect, useState, useRef } from "react";
import useTeacherStore from "../../stores/teacherStore";
import { apiGet, apiPut } from "../../lib/api";

// 프로바이더 통합 설정 (토글 ID + API 키 ID 매핑)
const PROVIDERS = [
  {
    id: "claude", apiKeyId: "anthropic",
    name: "Claude", company: "Anthropic",
    placeholder: "sk-ant-api03-...",
    defaultModels: ["claude-sonnet-4-6", "claude-haiku-4"],
    color: "orange",
    modelsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  {
    id: "gemini", apiKeyId: "google",
    name: "Gemini", company: "Google",
    placeholder: "AIzaSy...",
    defaultModels: ["gemini-3-flash-preview", "gemini-2.5-pro-preview-06-05"],
    defaultImageModels: ["gemini-3.1-flash-image-preview"],
    color: "blue",
    modelsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
  {
    id: "openai", apiKeyId: "openai",
    name: "ChatGPT", company: "OpenAI",
    placeholder: "sk-proj-...",
    defaultModels: ["gpt-5.4", "gpt-4.1-mini"],
    defaultImageModels: ["gpt-image-1.5"],
    color: "green",
    modelsUrl: "https://platform.openai.com/docs/models",
  },
  {
    id: "solar", apiKeyId: "upstage",
    name: "Solar", company: "Upstage",
    placeholder: "up_...",
    defaultModels: ["solar-pro3"],
    color: "purple",
    modelsUrl: "https://developers.upstage.ai/docs/apis/chat",
  },
];

const COLOR_MAP = {
  orange: { border: "border-orange-200", bg: "bg-orange-50/40", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  blue: { border: "border-blue-200", bg: "bg-blue-50/40", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  green: { border: "border-green-200", bg: "bg-green-50/40", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  purple: { border: "border-purple-200", bg: "bg-purple-50/40", badge: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
};

export default function SettingsPage() {
  const { settings, isLoading, loadSettings, updateMultipleSettings } = useTeacherStore();

  const [enabledProviders, setEnabledProviders] = useState([]);
  const [enabledModels, setEnabledModels] = useState({});
  const [availableModels, setAvailableModels] = useState({});
  const [imageModels, setImageModels] = useState({});
  const [systemPrompt, setSystemPrompt] = useState("");
  const [dailyLimit, setDailyLimit] = useState(100000);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [sttEnabled, setSttEnabled] = useState(false);
  const [ttsDefaultVoice, setTtsDefaultVoice] = useState("nova");
  const [ttsDefaultModel, setTtsDefaultModel] = useState("tts-1");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // API 키
  const [apiKeyStatus, setApiKeyStatus] = useState(null);
  const [apiKeyInputs, setApiKeyInputs] = useState({});
  const [apiKeySaving, setApiKeySaving] = useState({});
  const [apiKeySuccess, setApiKeySuccess] = useState({});

  // 모델 추가 입력
  const [newModelInputs, setNewModelInputs] = useState({});
  // 이미지 모델 추가 입력
  const [newImageModelInputs, setNewImageModelInputs] = useState({});

  // 저장 중 useEffect 재실행 방지
  const isSavingRef = useRef(false);

  useEffect(() => { loadSettings(); loadApiKeyStatus(); }, [loadSettings]);

  useEffect(() => {
    if (!settings || isSavingRef.current) return;
    setEnabledProviders(settings.enabled_providers || []);
    setEnabledModels(settings.enabled_models || {});
    setSystemPrompt(settings.system_prompt || "");
    setDailyLimit(settings.default_daily_limit || 100000);
    setTtsEnabled(settings.tts_enabled || false);
    setSttEnabled(settings.stt_enabled || false);
    setTtsDefaultVoice(settings.tts_default_voice || "nova");
    setTtsDefaultModel(settings.tts_default_model || "tts-1");

    // available_models: DB 저장값 + 기본값 병합
    const saved = settings.available_models || {};
    const merged = {};
    for (const p of PROVIDERS) {
      const defaults = p.defaultModels;
      const custom = saved[p.id] || [];
      merged[p.id] = [...new Set([...defaults, ...custom])];
    }
    setAvailableModels(merged);

    // image_models: 프로바이더별 이미지 모델
    const savedImg = settings.image_models || {};
    const mergedImg = {};
    for (const p of PROVIDERS) {
      if (p.defaultImageModels) {
        const defaults = p.defaultImageModels;
        // 기존에 flat array로 저장된 경우 무시하고 기본값 사용
        const custom = (savedImg && !Array.isArray(savedImg)) ? (savedImg[p.id] || []) : [];
        mergedImg[p.id] = [...new Set([...defaults, ...custom])];
      }
    }
    setImageModels(mergedImg);
  }, [settings]);

  const loadApiKeyStatus = async () => {
    try { setApiKeyStatus(await apiGet("/teacher/api-keys")); } catch { /* 무시 */ }
  };

  const handleSaveApiKey = async (apiKeyId) => {
    const key = apiKeyInputs[apiKeyId];
    setApiKeySaving((p) => ({ ...p, [apiKeyId]: true }));
    try {
      await apiPut("/teacher/api-keys", { provider: apiKeyId, apiKey: key || "" });
      setApiKeySuccess((p) => ({ ...p, [apiKeyId]: true }));
      setApiKeyInputs((p) => ({ ...p, [apiKeyId]: "" }));
      await loadApiKeyStatus();
      setTimeout(() => setApiKeySuccess((p) => ({ ...p, [apiKeyId]: false })), 3000);
    } catch (err) {
      alert("API 키 저장 실패: " + err.message);
    } finally {
      setApiKeySaving((p) => ({ ...p, [apiKeyId]: false }));
    }
  };

  const handleResetApiKey = async (apiKeyId) => {
    if (!confirm("이 API 키를 삭제하고 환경변수로 되돌리시겠습니까?")) return;
    setApiKeySaving((p) => ({ ...p, [apiKeyId]: true }));
    try {
      await apiPut("/teacher/api-keys", { provider: apiKeyId, apiKey: "" });
      await loadApiKeyStatus();
    } catch (err) {
      alert("초기화 실패: " + err.message);
    } finally {
      setApiKeySaving((p) => ({ ...p, [apiKeyId]: false }));
    }
  };

  const handleToggleProvider = (id) => {
    setEnabledProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleToggleModel = (providerId, modelId) => {
    setEnabledModels((prev) => {
      const models = prev[providerId] || [];
      const updated = models.includes(modelId)
        ? models.filter((m) => m !== modelId)
        : [...models, modelId];
      return { ...prev, [providerId]: updated };
    });
  };

  const handleAddModel = (providerId) => {
    const modelId = (newModelInputs[providerId] || "").trim();
    if (!modelId) return;
    if ((availableModels[providerId] || []).includes(modelId)) {
      alert("이미 등록된 모델입니다.");
      return;
    }
    setAvailableModels((prev) => ({
      ...prev,
      [providerId]: [...(prev[providerId] || []), modelId],
    }));
    setEnabledModels((prev) => ({
      ...prev,
      [providerId]: [...(prev[providerId] || []), modelId],
    }));
    setNewModelInputs((prev) => ({ ...prev, [providerId]: "" }));
  };

  const handleRemoveModel = (providerId, modelId) => {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (provider?.defaultModels.includes(modelId)) {
      alert("기본 모델은 삭제할 수 없습니다. 비활성화만 가능합니다.");
      return;
    }
    if (!confirm(`"${modelId}" 모델을 삭제하시겠습니까?`)) return;
    setAvailableModels((prev) => ({
      ...prev,
      [providerId]: (prev[providerId] || []).filter((m) => m !== modelId),
    }));
    setEnabledModels((prev) => ({
      ...prev,
      [providerId]: (prev[providerId] || []).filter((m) => m !== modelId),
    }));
  };

  // 이미지 모델 관리
  const handleAddImageModel = (providerId) => {
    const modelId = (newImageModelInputs[providerId] || "").trim();
    if (!modelId) return;
    if ((imageModels[providerId] || []).includes(modelId)) {
      alert("이미 등록된 이미지 모델입니다.");
      return;
    }
    setImageModels((prev) => ({
      ...prev,
      [providerId]: [...(prev[providerId] || []), modelId],
    }));
    setNewImageModelInputs((prev) => ({ ...prev, [providerId]: "" }));
  };

  const handleRemoveImageModel = (providerId, modelId) => {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (provider?.defaultImageModels?.includes(modelId)) {
      alert("기본 이미지 모델은 삭제할 수 없습니다.");
      return;
    }
    if (!confirm(`"${modelId}" 이미지 모델을 삭제하시겠습니까?`)) return;
    setImageModels((prev) => ({
      ...prev,
      [providerId]: (prev[providerId] || []).filter((m) => m !== modelId),
    }));
  };

  // 일괄 저장 (race condition 방지)
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    isSavingRef.current = true;
    try {
      await updateMultipleSettings({
        enabled_providers: enabledProviders,
        enabled_models: enabledModels,
        available_models: availableModels,
        image_models: imageModels,
        system_prompt: systemPrompt,
        default_daily_limit: dailyLimit,
        tts_enabled: ttsEnabled,
        stt_enabled: sttEnabled,
        tts_default_voice: ttsDefaultVoice,
        tts_default_model: ttsDefaultModel,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert("설정 저장에 실패했습니다: " + err.message);
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  if (isLoading && !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">설정</h1>

      <div className="space-y-5">
        {/* ── 프로바이더 통합 카드 ── */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-1">AI 프로바이더 관리</h2>
          <p className="text-xs text-gray-400 mb-4">
            프로바이더별 활성화, 모델 관리, API 키를 한곳에서 설정합니다.
          </p>

          <div className="space-y-4">
            {PROVIDERS.map((provider) => {
              const isEnabled = enabledProviders.includes(provider.id);
              const colors = COLOR_MAP[provider.color];
              const dbKey = apiKeyStatus?.dbKeys?.[provider.apiKeyId] || "";
              const envStatus = apiKeyStatus?.envStatus?.[provider.apiKeyId] || "미설정";
              const models = availableModels[provider.id] || provider.defaultModels;
              const imgModels = imageModels[provider.id] || [];
              const hasKey = dbKey || envStatus === "환경변수 설정됨";

              return (
                <div
                  key={provider.id}
                  className={`rounded-xl border-2 transition-all ${
                    isEnabled ? `${colors.border} ${colors.bg}` : "border-gray-200 bg-gray-50/50 opacity-75"
                  }`}
                >
                  {/* 헤더: 토글 + 이름 + API 키 상태 */}
                  <div className="flex items-center justify-between p-4 pb-0">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleToggleProvider(provider.id)}
                          className="sr-only"
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors ${isEnabled ? "bg-blue-600" : "bg-gray-300"}`}>
                          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${isEnabled ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"}`} />
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-gray-800">{provider.name}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{provider.company}</span>
                      </div>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        dbKey ? "bg-green-100 text-green-700" : envStatus === "환경변수 설정됨" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                      }`}>
                        {dbKey ? "DB 키" : envStatus === "환경변수 설정됨" ? "환경변수" : "키 없음"}
                      </span>
                    </div>
                  </div>

                  {/* 본문: 모델 + API 키 (활성화된 경우만 펼침) */}
                  {isEnabled && (
                    <div className="p-4 pt-3 space-y-3">
                      {/* 채팅 모델 관리 */}
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">채팅 모델</div>
                        <div className="flex flex-wrap gap-1.5">
                          {models.map((model) => {
                            const modelEnabled = (enabledModels[provider.id] || []).includes(model);
                            const isDefault = provider.defaultModels.includes(model);
                            return (
                              <div key={model} className="group relative">
                                <label
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                                    modelEnabled
                                      ? `${colors.badge} ${colors.border}`
                                      : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={modelEnabled}
                                    onChange={() => handleToggleModel(provider.id, model)}
                                    className="w-3 h-3 rounded accent-blue-600"
                                  />
                                  {model}
                                </label>
                                {!isDefault && (
                                  <button
                                    onClick={() => handleRemoveModel(provider.id, model)}
                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center"
                                    title="모델 삭제"
                                  >
                                    &times;
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* 모델 추가 */}
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={newModelInputs[provider.id] || ""}
                            onChange={(e) => setNewModelInputs((p) => ({ ...p, [provider.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && handleAddModel(provider.id)}
                            placeholder="새 모델 ID 입력..."
                            className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                          />
                          <button
                            onClick={() => handleAddModel(provider.id)}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
                          >
                            + 추가
                          </button>
                          {provider.modelsUrl && (
                            <a
                              href={provider.modelsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                              title="모델 목록 보기"
                            >
                              모델 목록 &#x2197;
                            </a>
                          )}
                        </div>
                      </div>

                      {/* 이미지 생성 모델 (해당 프로바이더만) */}
                      {provider.defaultImageModels && (
                        <div className="border-t border-gray-200/60 pt-3">
                          <div className="text-xs font-medium text-gray-500 mb-2">
                            <span className="mr-1">🎨</span>이미지 생성 모델
                            <span className="text-gray-400 font-normal ml-2">(교사/관리자 전용)</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {imgModels.map((model) => {
                              const isDefault = provider.defaultImageModels.includes(model);
                              return (
                                <div key={model} className="group relative">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-100 text-pink-700 border border-pink-200">
                                    {model}
                                  </span>
                                  {!isDefault && (
                                    <button
                                      onClick={() => handleRemoveImageModel(provider.id, model)}
                                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center"
                                      title="이미지 모델 삭제"
                                    >
                                      &times;
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <input
                              type="text"
                              value={newImageModelInputs[provider.id] || ""}
                              onChange={(e) => setNewImageModelInputs((p) => ({ ...p, [provider.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === "Enter" && handleAddImageModel(provider.id)}
                              placeholder="새 이미지 모델 ID 입력..."
                              className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                            />
                            <button
                              onClick={() => handleAddImageModel(provider.id)}
                              className="px-2.5 py-1 text-xs font-medium text-pink-600 border border-pink-200 rounded-lg hover:bg-pink-50 transition-colors whitespace-nowrap"
                            >
                              + 추가
                            </button>
                          </div>
                        </div>
                      )}

                      {/* API 키 */}
                      <div className="border-t border-gray-200/60 pt-3">
                        <div className="text-xs font-medium text-gray-500 mb-2">API 키</div>
                        {dbKey && (
                          <div className="text-xs text-gray-400 mb-1.5 font-mono">{dbKey}</div>
                        )}
                        {!hasKey && (
                          <div className="text-xs text-red-500 mb-1.5">API 키가 설정되지 않았습니다. 이 프로바이더를 사용하려면 키가 필요합니다.</div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={apiKeyInputs[provider.apiKeyId] || ""}
                            onChange={(e) => setApiKeyInputs((p) => ({ ...p, [provider.apiKeyId]: e.target.value }))}
                            placeholder={provider.placeholder}
                            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                          />
                          <button
                            onClick={() => handleSaveApiKey(provider.apiKeyId)}
                            disabled={apiKeySaving[provider.apiKeyId]}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                          >
                            {apiKeySaving[provider.apiKeyId] ? "..." : "저장"}
                          </button>
                          {dbKey && (
                            <button
                              onClick={() => handleResetApiKey(provider.apiKeyId)}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              초기화
                            </button>
                          )}
                        </div>
                        {apiKeySuccess[provider.apiKeyId] && (
                          <div className="mt-1 text-xs text-green-600">저장되었습니다.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── TTS / STT (음성 기능) ── */}
        <section className="bg-white rounded-xl border-2 border-teal-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">TTS (음성 읽기)</h2>
          <p className="text-xs text-gray-400 mb-4">
            교사/관리자는 항상 사용 가능합니다. 아래 설정은 학생에게 허용할지 여부입니다. OpenAI API 키 필요.
          </p>

          <div className="space-y-4">
            {/* TTS 설정 */}
            <div className="flex items-start gap-4">
              <label className="flex items-center gap-3 cursor-pointer min-w-[180px]">
                <div className="relative">
                  <input type="checkbox" checked={ttsEnabled} onChange={() => setTtsEnabled(!ttsEnabled)} className="sr-only" />
                  <div className={`w-10 h-5 rounded-full transition-colors ${ttsEnabled ? "bg-teal-600" : "bg-gray-300"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${ttsEnabled ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"}`} />
                  </div>
                </div>
                <div>
                  <span className="text-sm font-bold text-gray-800">TTS</span>
                  <span className="text-xs text-gray-400 ml-1.5">학생에게 허용</span>
                </div>
              </label>

              {ttsEnabled && (
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">음성</label>
                    <select
                      value={ttsDefaultVoice}
                      onChange={(e) => setTtsDefaultVoice(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                    >
                      {["alloy", "echo", "fable", "onyx", "nova", "shimmer"].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">모델</label>
                    <select
                      value={ttsDefaultModel}
                      onChange={(e) => setTtsDefaultModel(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="tts-1">tts-1 (빠름)</option>
                      <option value="tts-1-hd">tts-1-hd (고품질)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-400 bg-teal-50 px-3 py-2 rounded-lg">
              교사/관리자는 설정과 무관하게 항상 사용 가능합니다. 비용: TTS ~3-10원/회
            </div>
          </div>
        </section>

        {/* ── 시스템 프롬프트 ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">시스템 프롬프트</h2>
          <p className="text-xs text-gray-400 mb-4">학생들의 모든 AI 대화에 적용될 시스템 프롬프트입니다. 비어있으면 기본 프롬프트가 사용됩니다.</p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="예: 당신은 친절한 교육 도우미입니다..."
            rows={4}
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="text-right mt-1 text-xs text-gray-400">{systemPrompt.length} / 2000자</div>
        </section>

        {/* ── 기본 일일 한도 ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">기본 일일 한도</h2>
          <p className="text-xs text-gray-400 mb-4">새로 등록하는 학생에게 적용될 기본 일일 토큰 한도입니다.</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
              min={0}
              step={10000}
              className="w-48 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-500">토큰</span>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {dailyLimit >= 1000 ? `약 ${(dailyLimit / 1000).toFixed(0)}K 토큰` : `${dailyLimit} 토큰`}
            {" "}(개별 학생의 한도는 학생 관리에서 변경 가능)
          </div>
        </section>

        {/* ── 저장 버튼 ── */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-colors ${
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? "저장 중..." : "설정 저장"}
          </button>
          {saveSuccess && (
            <span className="text-sm text-green-600 font-medium">설정이 저장되었습니다.</span>
          )}
        </div>
      </div>
    </div>
  );
}
