import { useEffect, useState, useMemo } from 'react';
import useTeacherStore from '../../stores/teacherStore';

export default function StudentsPage() {
  const { students, isLoading, loadStudents, updateStudent, bulkActivateStudents } =
    useTeacherStore();
  const [search, setSearch] = useState('');
  const [editingLimit, setEditingLimit] = useState(null); // { id, value }
  const [roleFilter, setRoleFilter] = useState('all'); // all, admin, teacher, student
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, pending
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return ' ↕';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  // 필터링 + 정렬
  const filtered = useMemo(() => {
    let list = students;

    // 역할 필터
    if (roleFilter !== 'all') {
      list = list.filter((s) => s.role === roleFilter);
    }

    // 상태 필터
    if (statusFilter === 'active') {
      list = list.filter((s) => s.is_active);
    } else if (statusFilter === 'pending') {
      list = list.filter((s) => !s.is_active);
    }

    // 검색
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)),
      );
    }

    // 정렬
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') {
          cmp = (a.name || '').localeCompare(b.name || '', 'ko');
        } else if (sortKey === 'email') {
          cmp = (a.email || '').localeCompare(b.email || '');
        } else if (sortKey === 'status') {
          cmp = (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0);
        } else if (sortKey === 'mode') {
          const modeA = a.role === 'student' ? a.chat_mode || 'learning' : 'teacher';
          const modeB = b.role === 'student' ? b.chat_mode || 'learning' : 'teacher';
          cmp = modeA.localeCompare(modeB);
        } else if (sortKey === 'daily_limit') {
          cmp = (a.daily_limit || 0) - (b.daily_limit || 0);
        } else if (sortKey === 'today_usage') {
          cmp =
            a.today_input_tokens +
            a.today_output_tokens -
            (b.today_input_tokens + b.today_output_tokens);
        } else if (sortKey === 'total_tokens') {
          cmp = (a.total_tokens || 0) - (b.total_tokens || 0);
        } else if (sortKey === 'total_conversations') {
          cmp = (a.total_conversations || 0) - (b.total_conversations || 0);
        } else if (sortKey === 'created_at') {
          cmp = (a.created_at || '').localeCompare(b.created_at || '');
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [students, search, roleFilter, statusFilter, sortKey, sortOrder]);

  const adminCount = students.filter((s) => s.role === 'admin').length;
  const teacherCount = students.filter((s) => s.role === 'teacher').length;
  const studentCount = students.filter((s) => s.role === 'student').length;
  const activeCount = students.filter((s) => s.is_active).length;
  const pendingCount = students.filter((s) => !s.is_active && s.role === 'student').length;
  const projectModeCount = students.filter(
    (s) => s.role === 'student' && s.chat_mode === 'project',
  ).length;

  // 비활성(대기) 학생 ID 목록 (교사/관리자 제외)
  const pendingIds = students.filter((s) => !s.is_active && s.role === 'student').map((s) => s.id);

  const handleToggleMode = async (student) => {
    const newMode = student.chat_mode === 'project' ? 'learning' : 'project';
    try {
      await updateStudent(student.id, { chat_mode: newMode });
    } catch (err) {
      alert('모드 변경에 실패했습니다: ' + err.message);
    }
  };

  const handleToggleActive = async (student) => {
    try {
      await updateStudent(student.id, { is_active: !student.is_active });
    } catch (err) {
      alert('상태 변경에 실패했습니다: ' + err.message);
    }
  };

  const handleBulkActivate = async () => {
    if (pendingIds.length === 0) return;
    if (!confirm(`대기 중인 학생 ${pendingIds.length}명을 모두 승인하시겠습니까?`)) return;
    try {
      await bulkActivateStudents(pendingIds);
    } catch (err) {
      alert('일괄 승인에 실패했습니다: ' + err.message);
    }
  };

  const handleLimitSave = async (id) => {
    if (!editingLimit) return;
    const val = parseInt(editingLimit.value);
    if (isNaN(val) || val < 0) {
      alert('유효한 숫자를 입력하세요.');
      return;
    }
    try {
      await updateStudent(id, { daily_limit: val });
      setEditingLimit(null);
    } catch (err) {
      alert('한도 변경에 실패했습니다: ' + err.message);
    }
  };

  const formatTokens = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">사용자 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            전체 {students.length}명
            {projectModeCount > 0 && ` · 프로젝트 모드 ${projectModeCount}명`}
          </p>
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

      {/* 필터 + 검색 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* 역할 필터 */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            {
              key: 'all',
              label: '전체',
              count: students.length,
              style: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            },
            ...(adminCount > 0
              ? [
                  {
                    key: 'admin',
                    label: '관리자',
                    count: adminCount,
                    style: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
                  },
                ]
              : []),
            {
              key: 'teacher',
              label: '교사',
              count: teacherCount,
              style: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
            },
            {
              key: 'student',
              label: '학생',
              count: studentCount,
              style: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            },
          ].map(({ key, label, count, style }) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                roleFilter === key ? 'bg-gray-800 text-white' : style
              }`}
            >
              {label} {count}
            </button>
          ))}
        </div>

        {/* 상태 필터 */}
        <div className="flex gap-1.5">
          {[
            { key: 'all', label: '전체 상태' },
            { key: 'active', label: '활성', count: activeCount },
            { key: 'pending', label: '대기', count: pendingCount },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === key
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
              {count !== undefined ? ` ${count}` : ''}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="이름 또는 이메일로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 필터 결과 수 */}
      {(roleFilter !== 'all' || statusFilter !== 'all' || search) && (
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
          <span>검색 결과: {filtered.length}명</span>
          <button
            onClick={() => {
              setRoleFilter('all');
              setStatusFilter('all');
              setSearch('');
            }}
            className="text-blue-600 hover:text-blue-800 text-xs"
          >
            필터 초기화
          </button>
        </div>
      )}

      {/* 데스크톱 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('name')}
              >
                이름{sortIcon('name')}
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('email')}
              >
                이메일{sortIcon('email')}
              </th>
              <th
                className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('status')}
              >
                상태{sortIcon('status')}
              </th>
              <th
                className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('mode')}
              >
                모드{sortIcon('mode')}
              </th>
              <th
                className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('daily_limit')}
              >
                일일 한도{sortIcon('daily_limit')}
              </th>
              <th
                className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('today_usage')}
              >
                오늘 사용량{sortIcon('today_usage')}
              </th>
              <th
                className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('total_tokens')}
              >
                누적 사용량{sortIcon('total_tokens')}
              </th>
              <th
                className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort('total_conversations')}
              >
                대화 수{sortIcon('total_conversations')}
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                관리
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  {search ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}
                </td>
              </tr>
            ) : (
              filtered.map((student) => (
                <tr
                  key={student.id}
                  className={`${!student.is_active ? 'bg-yellow-50/50' : 'hover:bg-gray-50'} transition-colors`}
                >
                  {/* 이름 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {student.avatar ? (
                        <img src={student.avatar} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                          {student.name?.[0] || '?'}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">
                          {student.name || '(이름 없음)'}
                        </span>
                        {student.role === 'admin' && (
                          <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded">
                            관리자
                          </span>
                        )}
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

                  {/* 모드 */}
                  <td className="px-4 py-3 text-center">
                    {student.role === 'student' ? (
                      <button
                        onClick={() => handleToggleMode(student)}
                        className={`px-2.5 py-0.5 text-xs font-medium rounded-full transition-colors ${
                          student.chat_mode === 'project'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                        title="클릭하여 모드 전환"
                      >
                        {student.chat_mode === 'project' ? '프로젝트' : '학습'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">교사</span>
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
                            if (e.key === 'Enter') handleLimitSave(student.id);
                            if (e.key === 'Escape') setEditingLimit(null);
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
                    <div>
                      {formatTokens(student.today_input_tokens + student.today_output_tokens)} 토큰
                    </div>
                    <div className="text-xs text-gray-400">{student.today_requests}회 요청</div>
                  </td>

                  {/* 누적 사용량 */}
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {formatTokens(student.total_tokens || 0)} 토큰
                  </td>

                  {/* 대화 수 */}
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {student.total_conversations}
                  </td>

                  {/* 관리 */}
                  <td className="px-4 py-3 text-center">
                    {student.role === 'student' ? (
                      <button
                        onClick={() => handleToggleActive(student)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                          student.is_active
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {student.is_active ? '비활성화' : '활성화'}
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
            {search ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}
          </div>
        ) : (
          filtered.map((student) => (
            <div
              key={student.id}
              className={`bg-white rounded-xl border p-4 ${
                !student.is_active ? 'border-yellow-200 bg-yellow-50/30' : 'border-gray-200'
              }`}
            >
              {/* 상단: 이름 + 상태 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {student.avatar ? (
                    <img src={student.avatar} alt="" className="w-9 h-9 rounded-full" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500">
                      {student.name?.[0] || '?'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm">
                        {student.name || '(이름 없음)'}
                      </span>
                      {student.role === 'teacher' && (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">
                          교사
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{student.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {student.role === 'student' && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                        student.chat_mode === 'project'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {student.chat_mode === 'project' ? '프로젝트' : '학습'}
                    </span>
                  )}
                  {student.is_active ? (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      활성
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                      대기
                    </span>
                  )}
                </div>
              </div>

              {/* 정보 행 */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs text-gray-500 mb-3">
                <div>
                  <div className="text-gray-800 font-medium">
                    {formatTokens(student.daily_limit)}
                  </div>
                  <div>일일 한도</div>
                </div>
                <div>
                  <div className="text-gray-800 font-medium">
                    {formatTokens(student.today_input_tokens + student.today_output_tokens)}
                  </div>
                  <div>오늘 사용</div>
                </div>
                <div>
                  <div className="text-gray-800 font-medium">
                    {formatTokens(student.total_tokens || 0)}
                  </div>
                  <div>누적 사용</div>
                </div>
                <div>
                  <div className="text-gray-800 font-medium">{student.total_conversations}</div>
                  <div>대화 수</div>
                </div>
              </div>

              {/* 하단 버튼 */}
              {student.role === 'student' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(student)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      student.is_active
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-green-50 text-green-600 hover:bg-green-100'
                    }`}
                  >
                    {student.is_active ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => handleToggleMode(student)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      student.chat_mode === 'project'
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    {student.chat_mode === 'project' ? '학습 모드로' : '프로젝트 모드로'}
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
