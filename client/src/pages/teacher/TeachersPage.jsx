import { useEffect, useState } from "react";
import useTeacherStore from "../../stores/teacherStore";

export default function TeachersPage() {
  const { teachers, isLoading, loadTeachers, addTeacher, removeTeacher } =
    useTeacherStore();
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setError("이메일 주소를 입력하세요.");
      return;
    }

    // 간단한 이메일 형식 검증
    if (!email.includes("@")) {
      setError("유효한 이메일 주소를 입력하세요.");
      return;
    }

    try {
      const result = await addTeacher(email);
      setSuccess(result.message);
      setNewEmail("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (email) => {
    if (!confirm(`${email} 교사 권한을 해제하시겠습니까?`)) return;
    setError("");
    setSuccess("");

    try {
      const result = await removeTeacher(email);
      setSuccess(result.message);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (isLoading && !teachers.dbEmails.length && !teachers.envEmails.length) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  const allEmails = [
    ...teachers.envEmails.map((e) => ({ email: e, source: "env" })),
    ...teachers.dbEmails.map((e) => ({ email: e, source: "db" })),
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">교사 관리</h1>
      <p className="text-sm text-gray-500 mb-6">
        교사 이메일을 추가하면 해당 이메일로 로그인 시 자동으로 교사 권한이 부여됩니다.
      </p>

      {/* 교사 추가 폼 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">교사 추가</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="교사 이메일 주소 입력..."
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            추가
          </button>
        </form>

        {/* 에러/성공 메시지 */}
        {error && (
          <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
            {success}
          </div>
        )}
      </div>

      {/* 교사 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            등록된 교사 ({allEmails.length}명)
          </h2>
        </div>

        {allEmails.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            등록된 교사가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {allEmails.map(({ email, source }) => (
              <div
                key={email}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700">
                    {email[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{email}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {source === "env" ? (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">
                          환경변수
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-600 rounded">
                          UI 추가
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {source === "db" ? (
                  <button
                    onClick={() => handleRemove(email)}
                    className="px-3 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    삭제
                  </button>
                ) : (
                  <span className="text-xs text-gray-400" title="환경변수로 등록된 교사는 서버 설정에서만 변경 가능">
                    삭제 불가
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">안내</h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• <strong>환경변수</strong> 교사는 서버의 <code className="bg-blue-100 px-1 rounded">TEACHER_EMAILS</code> 환경변수에서 관리됩니다.</li>
          <li>• <strong>UI 추가</strong> 교사는 이 페이지에서 추가/삭제할 수 있습니다.</li>
          <li>• 이미 가입한 학생의 이메일을 교사로 추가하면 자동으로 교사 권한이 부여됩니다.</li>
          <li>• 교사 권한을 해제하면 해당 사용자는 학생으로 돌아갑니다.</li>
        </ul>
      </div>
    </div>
  );
}
