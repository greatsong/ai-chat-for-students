import { useEffect, useState, useMemo } from "react";
import useTeacherStore from "../../stores/teacherStore";

const PERIODS = [
  { value: "today", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
];

export default function UsagePage() {
  const { usage, isLoading, loadUsage } = useTeacherStore();
  const [period, setPeriod] = useState("today");
  const [sortBy, setSortBy] = useState("total"); // total, input, output, requests

  useEffect(() => {
    loadUsage(period);
  }, [period, loadUsage]);

  const formatTokens = (n) => {
    if (!n || n === 0) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  };

  const sortedStudents = useMemo(() => {
    if (!usage?.byStudent) return [];
    return [...usage.byStudent].sort((a, b) => {
      if (sortBy === "input") return b.inputTokens - a.inputTokens;
      if (sortBy === "output") return b.outputTokens - a.outputTokens;
      if (sortBy === "requests") return b.requests - a.requests;
      return (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens);
    });
  }, [usage?.byStudent, sortBy]);

  // 차트용 — 일별 데이터의 최대값 계산
  const dailyMax = useMemo(() => {
    if (!usage?.daily || usage.daily.length === 0) return 1;
    return Math.max(...usage.daily.map((d) => d.inputTokens + d.outputTokens), 1);
  }, [usage?.daily]);

  const providerColors = {
    claude: { bg: "bg-orange-100", text: "text-orange-700", bar: "bg-orange-400" },
    gemini: { bg: "bg-blue-100", text: "text-blue-700", bar: "bg-blue-400" },
    openai: { bg: "bg-green-100", text: "text-green-700", bar: "bg-green-400" },
    solar: { bg: "bg-purple-100", text: "text-purple-700", bar: "bg-purple-400" },
  };

  if (isLoading && !usage) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  const summary = usage?.summary || {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalRequests: 0,
    totalImages: 0,
    activeStudents: 0,
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">사용량</h1>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p.value
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">총 토큰</div>
          <div className="text-2xl font-bold text-gray-800">
            {formatTokens(summary.totalInputTokens + summary.totalOutputTokens)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            입력 {formatTokens(summary.totalInputTokens)} / 출력 {formatTokens(summary.totalOutputTokens)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">총 요청</div>
          <div className="text-2xl font-bold text-gray-800">
            {summary.totalRequests.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400 mt-1">회</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">활성 학생</div>
          <div className="text-2xl font-bold text-gray-800">{summary.activeStudents}</div>
          <div className="text-xs text-gray-400 mt-1">명</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">이미지 생성</div>
          <div className="text-2xl font-bold text-gray-800">{summary.totalImages}</div>
          <div className="text-xs text-gray-400 mt-1">장</div>
        </div>
      </div>

      {/* 일별 사용량 차트 */}
      {usage?.daily && usage.daily.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">일별 사용량 (최근 30일)</h2>
          <div className="flex items-end gap-1 h-40 overflow-x-auto">
            {usage.daily.map((day) => {
              const total = day.inputTokens + day.outputTokens;
              const heightPercent = (total / dailyMax) * 100;
              const inputPercent = total > 0 ? (day.inputTokens / total) * heightPercent : 0;
              const outputPercent = total > 0 ? (day.outputTokens / total) * heightPercent : 0;
              const dateLabel = day.date.slice(5); // MM-DD
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center flex-shrink-0 group"
                  style={{ width: "calc(100% / 30)", minWidth: "18px" }}
                >
                  {/* 툴팁 */}
                  <div className="relative mb-1">
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {day.date}: {formatTokens(total)}
                    </div>
                  </div>
                  {/* 바 */}
                  <div className="w-full flex flex-col justify-end" style={{ height: "128px" }}>
                    <div
                      className="w-full bg-blue-400 rounded-t-sm"
                      style={{ height: `${outputPercent}%`, minHeight: total > 0 ? "2px" : "0" }}
                    />
                    <div
                      className="w-full bg-blue-200"
                      style={{ height: `${inputPercent}%`, minHeight: total > 0 ? "1px" : "0" }}
                    />
                  </div>
                  {/* 날짜 */}
                  <div className="text-[9px] text-gray-400 mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                    {dateLabel}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-blue-200 rounded-sm inline-block" /> 입력 토큰
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-blue-400 rounded-sm inline-block" /> 출력 토큰
            </span>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* 학생별 사용량 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">학생별 사용량</h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="total">총 토큰순</option>
              <option value="input">입력 토큰순</option>
              <option value="output">출력 토큰순</option>
              <option value="requests">요청 횟수순</option>
            </select>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {sortedStudents.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">사용 데이터가 없습니다.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2">학생</th>
                    <th className="text-right px-4 py-2">입력</th>
                    <th className="text-right px-4 py-2">출력</th>
                    <th className="text-right px-4 py-2">요청</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedStudents.map((s) => (
                    <tr key={s.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-800">
                        <div className="font-medium">{s.name || "(이름 없음)"}</div>
                        <div className="text-xs text-gray-400">{s.email}</div>
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {formatTokens(s.inputTokens)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {formatTokens(s.outputTokens)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">
                        {s.requests}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 프로바이더별 사용량 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">프로바이더별</h2>
          </div>
          <div className="p-4 space-y-4">
            {!usage?.byProvider || usage.byProvider.length === 0 ? (
              <div className="py-4 text-center text-gray-400 text-sm">데이터가 없습니다.</div>
            ) : (
              usage.byProvider.map((p) => {
                const totalAll = usage.byProvider.reduce(
                  (sum, pp) => sum + pp.inputTokens + pp.outputTokens,
                  0
                );
                const thisTotal = p.inputTokens + p.outputTokens;
                const percent = totalAll > 0 ? ((thisTotal / totalAll) * 100).toFixed(1) : 0;
                const colors = providerColors[p.provider] || {
                  bg: "bg-gray-100",
                  text: "text-gray-700",
                  bar: "bg-gray-400",
                };

                return (
                  <div key={p.provider}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.bg} ${colors.text}`}>
                        {p.provider}
                      </span>
                      <span className="text-xs text-gray-500">{percent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                      <div
                        className={`${colors.bar} h-2 rounded-full transition-all`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatTokens(thisTotal)} 토큰 &middot; {p.requests}회
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
