import { useEffect, useState } from "react";
import useTeacherStore from "../../stores/teacherStore";
import { apiGet, apiPut } from "../../lib/api";

const API_KEY_PROVIDERS = [
  { id: "anthropic", name: "Anthropic (Claude)", placeholder: "sk-ant-api03-..." },
  { id: "google", name: "Google (Gemini)", placeholder: "AIzaSy..." },
  { id: "openai", name: "OpenAI (ChatGPT)", placeholder: "sk-proj-..." },
  { id: "upstage", name: "Upstage (Solar)", placeholder: "up_..." },
];

const ALL_PROVIDERS = [
  { id: "claude", name: "Claude (Anthropic)", models: ["claude-sonnet-4-6", "claude-haiku-4"] },
  { id: "gemini", name: "Gemini (Google)", models: ["gemini-3-flash-preview", "gemini-2.5-pro-preview-06-05"] },
  { id: "openai", name: "OpenAI", models: ["gpt-5.4", "gpt-4.1-mini"] },
  { id: "solar", name: "Solar (Upstage)", models: ["solar-pro3"] },
];

export default function SettingsPage() {
  const { settings, isLoading, loadSettings, updateSettings } = useTeacherStore();

  // 로컬 상태 (수정 중)
  const [enabledProviders, setEnabledProviders] = useState([]);
  const [enabledModels, setEnabledModels] = useState({});
  const [imageGenEnabled, setImageGenEnabled] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [dailyLimit, setDailyLimit] = useState(100000);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // API 키 관리 상태
  const [apiKeyStatus, setApiKeyStatus] = useState(null);
  const [apiKeyInputs, setApiKeyInputs] = useState({});
  const [apiKeySaving, setApiKeySaving] = useState({});
  const [apiKeySuccess, setApiKeySuccess] = useState({});

  useEffect(() => {
    loadSettings();
    loadApiKeyStatus();
  }, [loadSettings]);

  // 설정 로드 시 로컬 상태 동기화
  useEffect(() => {
    if (!settings) return;
    setEnabledProviders(settings.enabled_providers || []);
    setEnabledModels(settings.enabled_models || {});
    setImageGenEnabled(settings.image_generation_enabled || false);
    setSystemPrompt(settings.system_prompt || "");
    setDailyLimit(settings.default_daily_limit || 100000);
  }, [settings]);

  const loadApiKeyStatus = async () => {
    try {
      const data = await apiGet("/teacher/api-keys");
      setApiKeyStatus(data);
    } catch {
      // 권한 없거나 에러 시 무시
    }
  };

  const handleSaveApiKey = async (providerId) => {
    const key = apiKeyInputs[providerId];
    setApiKeySaving((prev) => ({ ...prev, [providerId]: true }));
    try {
      await apiPut("/teacher/api-keys", { provider: providerId, apiKey: key || "" });
      setApiKeySuccess((prev) => ({ ...prev, [providerId]: true }));
      setApiKeyInputs((prev) => ({ ...prev, [providerId]: "" }));
      await loadApiKeyStatus();
      setTimeout(() => setApiKeySuccess((prev) => ({ ...prev, [providerId]: false })), 3000);
    } catch (err) {
      alert("API 키 저장 실패: " + err.message);
    } finally {
      setApiKeySaving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleToggleProvider = (providerId) => {
    setEnabledProviders((prev) => {
      if (prev.includes(providerId)) {
        return prev.filter((p) => p !== providerId);
      }
      return [...prev, providerId];
    });
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

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings("enabled_providers", enabledProviders);
      await updateSettings("enabled_models", enabledModels);
      await updateSettings("image_generation_enabled", imageGenEnabled);
      await updateSettings("system_prompt", systemPrompt);
      await updateSettings("default_daily_limit", dailyLimit);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert("설정 저장에 실패했습니다: " + err.message);
    } finally {
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

      <div className="space-y-6">
        {/* 프로바이더 설정 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">프로바이더 설정</h2>
          <p className="text-xs text-gray-400 mb-4">
            학생들이 사용할 수 있는 AI 프로바이더와 모델을 선택합니다.
          </p>

          <div className="space-y-4">
            {ALL_PROVIDERS.map((provider) => {
              const isEnabled = enabledProviders.includes(provider.id);
              return (
                <div
                  key={provider.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    isEnabled ? "border-blue-200 bg-blue-50/30" : "border-gray-100 bg-gray-50/50"
                  }`}
                >
                  {/* 프로바이더 토글 */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleProvider(provider.id)}
                        className="sr-only"
                      />
                      <div
                        className={`w-10 h-5 rounded-full transition-colors ${
                          isEnabled ? "bg-blue-600" : "bg-gray-300"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                            isEnabled ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"
                          }`}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{provider.name}</span>
                  </label>

                  {/* 모델 선택 */}
                  {isEnabled && (
                    <div className="mt-3 ml-13 flex flex-wrap gap-2">
                      {provider.models.map((model) => {
                        const modelEnabled = (enabledModels[provider.id] || []).includes(model);
                        return (
                          <label
                            key={model}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                              modelEnabled
                                ? "bg-blue-100 border-blue-200 text-blue-700"
                                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
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
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 이미지 생성 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">이미지 생성</h2>
          <p className="text-xs text-gray-400 mb-4">
            AI 이미지 생성 기능을 활성화/비활성화합니다.
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={imageGenEnabled}
                onChange={(e) => setImageGenEnabled(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-10 h-5 rounded-full transition-colors ${
                  imageGenEnabled ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                    imageGenEnabled ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </div>
            <span className="text-sm font-medium text-gray-700">이미지 생성 허용</span>
          </label>

          {imageGenEnabled && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">
                이미지 생성은 추가 API 비용이 발생합니다. 학생당 사용량이 증가할 수 있으니 일일 한도를 적절히 설정해주세요.
              </p>
            </div>
          )}
        </section>

        {/* 시스템 프롬프트 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">시스템 프롬프트</h2>
          <p className="text-xs text-gray-400 mb-4">
            모든 AI 대화에 적용될 시스템 프롬프트를 설정합니다. 비어있으면 기본 프롬프트가 사용됩니다.
          </p>

          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="예: 당신은 친절한 교육 도우미입니다. 학생들의 학습을 돕는 것이 목표입니다..."
            rows={5}
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="text-right mt-1 text-xs text-gray-400">
            {systemPrompt.length} / 2000자
          </div>
        </section>

        {/* 기본 일일 한도 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">기본 일일 한도</h2>
          <p className="text-xs text-gray-400 mb-4">
            새로 등록하는 학생에게 적용될 기본 일일 토큰 한도입니다.
          </p>

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
            {dailyLimit >= 1000
              ? `약 ${(dailyLimit / 1000).toFixed(0)}K 토큰`
              : `${dailyLimit} 토큰`}
            {" "}(개별 학생의 한도는 학생 관리 페이지에서 변경 가능)
          </div>
        </section>

        {/* API 키 관리 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">API 키 관리</h2>
          <p className="text-xs text-gray-400 mb-4">
            AI 프로바이더의 API 키를 설정합니다. 여기서 설정한 키가 환경변수보다 우선 적용됩니다.
            비워두면 서버 환경변수의 키를 사용합니다.
          </p>

          <div className="space-y-3">
            {API_KEY_PROVIDERS.map((provider) => {
              const dbKey = apiKeyStatus?.dbKeys?.[provider.id] || "";
              const envStatus = apiKeyStatus?.envStatus?.[provider.id] || "미설정";
              return (
                <div key={provider.id} className="rounded-lg border border-gray-100 p-4 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{provider.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      dbKey ? "bg-green-100 text-green-700" : envStatus === "환경변수 설정됨" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    }`}>
                      {dbKey ? "DB 키 사용 중" : envStatus}
                    </span>
                  </div>
                  {dbKey && (
                    <div className="text-xs text-gray-400 mb-2 font-mono">{dbKey}</div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKeyInputs[provider.id] || ""}
                      onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                      placeholder={provider.placeholder}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                    <button
                      onClick={() => handleSaveApiKey(provider.id)}
                      disabled={apiKeySaving[provider.id]}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors whitespace-nowrap"
                    >
                      {apiKeySaving[provider.id] ? "..." : "저장"}
                    </button>
                    {dbKey && (
                      <button
                        onClick={async () => {
                          if (!confirm("이 API 키를 삭제하고 환경변수로 되돌리시겠습니까?")) return;
                          setApiKeySaving((prev) => ({ ...prev, [provider.id]: true }));
                          try {
                            await apiPut("/teacher/api-keys", { provider: provider.id, apiKey: "" });
                            await loadApiKeyStatus();
                          } catch (err) {
                            alert("초기화 실패: " + err.message);
                          } finally {
                            setApiKeySaving((prev) => ({ ...prev, [provider.id]: false }));
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                  {apiKeySuccess[provider.id] && (
                    <div className="mt-1 text-xs text-green-600">저장되었습니다.</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 저장 버튼 */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-colors ${
              saving
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? "저장 중..." : "설정 저장"}
          </button>
          {saveSuccess && (
            <span className="text-sm text-green-600 font-medium">
              설정이 저장되었습니다.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
