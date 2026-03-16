import { useEffect, useState } from "react";
import useTeacherStore from "../../stores/teacherStore";

export default function StudentsPage() {
  const { students, isLoading, loadStudents, updateStudent, bulkActivateStudents } =
    useTeacherStore();
  const [search, setSearch] = useState("");
  const [editingLimit, setEditingLimit] = useState(null); // { id, value }

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // 필터링
  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });

  const teacherCount = students.filter((s) => s.role === 'teacher').length;
  const studentCount = students.filter((s) => s.role !== 'teacher').length;
  const activeCount = students.filter((s) => s.is_active).length;
  const pendingCount = students.filter((s) => !s.is_active && s.role !== 'teacher').length;

  // 비활성(대기) 학생 ID 목록 (교사 제외)
  const pendingIds = students.filter((s) => !s.is_active && s.role !== 'teacher').map((s) => s.id);

  const handleToggleActive = async (student) => {
    try {
      await updateStudent(student.id, { is_active: !student.is_active });
    } catch (err) {
      alert("상태 변경에 실패했습니다: " + err.message);
    }
  };

  const handleBulkActivate = async () => {
    if (pendingIds.length === 0) return;
    if (!confirm(`대기 중인 학생 ${pendingIds.length}명을 모두 승인하시겠습니까?`)) return;
    try {
      await bulkActivateStudents(pendingIds);
    } catch (err) {
      alert("일괄 승인에 실패했습니다: " + err.message);
    }
  };

  const handleLimitSave = async (id) => {
    if (!editingLimit) return;
    const val = parseInt(editingLimit.value);
    if (isNaN(val) || val < 0) {
      alert("유효한 숫자를 입력하세요.");
      return;
    }
    try {
      await updateStudent(id, { daily_limit: val });
      setEditingLimit(null);
    } catch (err) {
      alert("한도 변경에 실패했습니다: " + err.message);
    }
  };

  const formatTokens = (n) => {
    if (!n || n === 0) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  };

  if (isLoading && students.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">사용자 관리</h1>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span className="text-indigo-600">교사 {teacherCount}명</span>
            <span>학생 {studentCount}명</span>
            <span className="text-green-600">활성 {activeCount}명</span>
            {pendingCount > 0 && <span className="text-yellow-600">대기 {pendingCount}명</span>}
          </div>
        </div>

        <div className="flex gap-2">
          {pendingCount > 0 && (
            <button
              onClick={handleBulkActivate}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              전체 승인 ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {/* 검색 */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="이름 또는 이메일로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* 데스크톱 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">이름</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">이메일</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">일일 한도</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">오늘 사용량</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">대화 수</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-400">
                  {search ? "검색 결과가 없습니다." : "등록된 학생이 없습니다."}
                </td>
              </tr>
            ) : (
              filtered.map((student) => (
                <tr
                  key={student.id}
                  className={`${!student.is_active ? "bg-yellow-50/50" : "hover:bg-gray-50"} transition-colors`}
                >
                  {/* 이름 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {student.avatar ? (
                        <img
                          src={student.avatar}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                          {student.name?.[0] || "?"}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">
                          {student.name || "(이름 없음)"}
                        </span>
                        {student.role === 'teacher' && (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">
                            교사
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 이메일 */}
                  <td className="px-4 py-3 text-sm text-gray-500">{student.email}</td>

                  {/* 상태 */}
                  <td className="px-4 py-3 text-center">
                    {student.is_active ? (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        활성
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                        대기
                      </span>
                    )}
                  </td>

                  {/* 일일 한도 */}
                  <td className="px-4 py-3 text-center">
                    {editingLimit && editingLimit.id === student.id ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={editingLimit.value}
                          onChange={(e) =>
                            setEditingLimit({ id: student.id, value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleLimitSave(student.id);
                            if (e.key === "Escape") setEditingLimit(null);
                          }}
                          className="w-24 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleLimitSave(student.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingLimit(null)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setEditingLimit({ id: student.id, value: String(student.daily_limit) })
                        }
                        className="text-sm text-gray-700 hover:text-blue-600 hover:underline cursor-pointer"
                        title="클릭하여 수정"
                      >
                        {formatTokens(student.daily_limit)}
                      </button>
                    )}
                  </td>

                  {/* 오늘 사용량 */}
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    <div>{formatTokens(student.today_input_tokens + student.today_output_tokens)} 토큰</div>
                    <div className="text-xs text-gray-400">{student.today_requests}회 요청</div>
                  </td>

                  {/* 대화 수 */}
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {student.total_conversations}
                  </td>

                  {/* 관리 */}
                  <td className="px-4 py-3 text-center">
                    {student.role !== 'teacher' ? (
                      <button
                        onClick={() => handleToggleActive(student)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                          student.is_active
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-green-50 text-green-600 hover:bg-green-100"
                        }`}
                      >
                        {student.is_active ? "비활성화" : "활성화"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {search ? "검색 결과가 없습니다." : "등록된 학생이 없습니다."}
          </div>
        ) : (
          filtered.map((student) => (
            <div
              key={student.id}
              className={`bg-white rounded-xl border p-4 ${
                !student.is_active ? "border-yellow-200 bg-yellow-50/30" : "border-gray-200"
              }`}
            >
              {/* 상단: 이름 + 상태 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {student.avatar ? (
                    <img src={student.avatar} alt="" className="w-9 h-9 rounded-full" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500">
                      {student.name?.[0] || "?"}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm">{student.name || "(이름 없음)"}</span>
                      {student.role === 'teacher' && (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">교사</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{student.email}</div>
                  </div>
                </div>
                {student.is_active ? (
                  <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">활성</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">대기</span>
                )}
              </div>

              {/* 정보 행 */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500 mb-3">
                <div>
                  <div className="text-gray-800 font-medium">{formatTokens(student.daily_limit)}</div>
                  <div>일일 한도</div>
                </div>
                <div>
                  <div className="text-gray-800 font-medium">
                    {formatTokens(student.today_input_tokens + student.today_output_tokens)}
                  </div>
                  <div>오늘 사용</div>
                </div>
                <div>
                  <div className="text-gray-800 font-medium">{student.total_conversations}</div>
                  <div>대화 수</div>
                </div>
              </div>

              {/* 하단 버튼 */}
              {student.role !== 'teacher' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(student)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      student.is_active
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-green-50 text-green-600 hover:bg-green-100"
                    }`}
                  >
                    {student.is_active ? "비활성화" : "활성화"}
                  </button>
                  <button
                    onClick={() =>
                      setEditingLimit({ id: student.id, value: String(student.daily_limit) })
                    }
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    한도 수정
                  </button>
                </div>
              )}

              {/* 한도 수정 인라인 */}
              {editingLimit && editingLimit.id === student.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    value={editingLimit.value}
                    onChange={(e) => setEditingLimit({ id: student.id, value: e.target.value })}
                    className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleLimitSave(student.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingLimit(null)}
                    className="px-3 py-1.5 text-xs text-gray-500"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
