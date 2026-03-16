import { useEffect, useMemo } from "react";
import useTeacherStore from "../../stores/teacherStore";

export default function MyUsagePage() {
  const { myUsage, isLoading, loadMyUsage } = useTeacherStore();

  useEffect(() => {
    loadMyUsage();
  }, [loadMyUsage]);

  const formatTokens = (n) => {
    if (!n || n === 0) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  };

  // 일별 데이터를 날짜별로 그룹화
  const dailyGrouped = useMemo(() => {
    if (!myUsage?.daily) return [];
    const grouped = {};
    for (const d of myUsage.daily) {
      if (!grouped[d.date]) {
        grouped[d.date] = { date: d.date, inputTokens: 0, outputTokens: 0, requests: 0, images: 0, providers: [] };
      }
      grouped[d.date].inputTokens += d.inputTokens;
      grouped[d.date].outputTokens += d.outputTokens;
      grouped[d.date].requests += d.requests;
      grouped[d.date].images += d.images;
      if (d.provider) {
        grouped[d.date].providers.push({
          provider: d.provider,
          inputTokens: d.inputTokens,
          outputTokens: d.outputTokens,
          requests: d.requests,
        });
      }
    }
    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [myUsage?.daily]);

  const dailyMax = useMemo(() => {
    if (dailyGrouped.length === 0) return 1;
    return Math.max(...dailyGrouped.map((d) => d.inputTokens + d.outputTokens), 1);
  }, [dailyGrouped]);

  const providerColors = {
    claude: "bg-orange-100 text-orange-700",
    gemini: "bg-blue-100 text-blue-700",
    openai: "bg-green-100 text-green-700",
    solar: "bg-purple-100 text-purple-700",
  };

  if (isLoading && !myUsage) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  const summary = myUsage?.summary || {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    totalImages: 0,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">내 사용량</h1>
        <p className="text-sm text-gray-500 mt-1">내 AI 채팅 사용 현황을 확인합니다.</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">총 토큰</div>
          <div className="text-2xl font-bold text-gray-800">
            {formatTokens(summary.totalInputTokens + summary.totalOutputTokens)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            입력 {formatTokens(summary.totalInputTokens)} / 출력{" "}
            {formatTokens(summary.totalOutputTokens)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">총 요청</div>
          <div className="text-2xl font-bold text-gray-800">
            {(summary.totalRequests || 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">회</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">이미지 생성</div>
          <div className="text-2xl font-bold text-gray-800">{summary.totalImages || 0}</div>
          <div className="text-xs text-gray-400 mt-1">장</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">활동 기간</div>
          <div className="text-2xl font-bold text-gray-800">{dailyGrouped.length}</div>
          <div className="text-xs text-gray-400 mt-1">일</div>
        </div>
      </div>

      {/* 일별 사용량 차트 */}
      {dailyGrouped.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            일별 사용량 (최근 30일)
          </h2>
          <div className="flex items-end gap-1 h-40 overflow-x-auto">
            {[...dailyGrouped].reverse().map((day) => {
              const total = day.inputTokens + day.outputTokens;
              const heightPercent = (total / dailyMax) * 100;
              const dateLabel = day.date.slice(5);
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center flex-shrink-0 group"
                  style={{ width: "calc(100% / 30)", minWidth: "18px" }}
                >
                  <div className="relative mb-1">
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {day.date}: {formatTokens(total)} ({day.requests}회)
                    </div>
                  </div>
                  <div
                    className="w-full flex flex-col justify-end"
                    style={{ height: "128px" }}
                  >
                    <div
                      className="w-full bg-indigo-400 rounded-t-sm"
                      style={{
                        height: `${heightPercent}%`,
                        minHeight: total > 0 ? "2px" : "0",
                      }}
                    />
                  </div>
                  <div className="text-[9px] text-gray-400 mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                    {dateLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 일별 상세 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">일별 상세</h2>
        </div>

        {dailyGrouped.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            사용 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-2">날짜</th>
                  <th className="text-right px-4 py-2">입력 토큰</th>
                  <th className="text-right px-4 py-2">출력 토큰</th>
                  <th className="text-right px-4 py-2">총 토큰</th>
                  <th className="text-right px-4 py-2">요청</th>
                  <th className="text-left px-4 py-2">프로바이더</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dailyGrouped.map((day) => (
                  <tr key={day.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-800 font-medium">
                      {day.date}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-600">
                      {formatTokens(day.inputTokens)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-600">
                      {formatTokens(day.outputTokens)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-gray-800">
                      {formatTokens(day.inputTokens + day.outputTokens)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-600">
                      {day.requests}회
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {day.providers.map((p) => (
                          <span
                            key={p.provider}
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                              providerColors[p.provider] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {p.provider} ({formatTokens(p.inputTokens + p.outputTokens)})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
