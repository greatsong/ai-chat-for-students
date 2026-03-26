import { useState } from "react";
import { Link } from "react-router-dom";

const sections = [
  {
    id: "purpose",
    title: "제1조 (개인정보의 수집 및 이용 목적)",
    content: `당곡고 학생을 위한 AI 채팅(이하 '서비스')은 다음의 목적을 위해 개인정보를 수집·이용합니다.

• 회원 관리: Google OAuth 로그인, 본인 확인, 서비스 이용 자격 관리
• AI 채팅 서비스 제공: 4종 AI(Claude, Gemini, ChatGPT, Solar)를 활용한 수업용 채팅
• 교사 관리 기능: 학생 승인, 사용량 모니터링, 대화 내역 관리
• 서비스 개선: 이용 통계 분석 및 서비스 품질 향상

수집된 개인정보는 위 목적 이외의 용도로 사용되지 않으며, 목적이 변경될 경우 별도의 동의를 받겠습니다.`,
  },
  {
    id: "items",
    title: "제2조 (수집하는 개인정보 항목)",
    content: `[Google OAuth 로그인 시 자동 수집]
• 이메일 주소 (@danggok.hs.kr)
• 이름 (Google 계정 표시 이름)
• 프로필 사진 (Google 계정 프로필 이미지 URL)

[서비스 이용 중 자동 생성]
• AI 채팅 대화 기록 (질문·답변 내용)
• 일일 토큰 사용량
• 로그인 기록

위 항목 외의 개인정보는 수집하지 않습니다.`,
  },
  {
    id: "retention",
    title: "제3조 (개인정보의 보유 및 이용 기간)",
    content: `개인정보는 수집 목적이 달성된 후 지체 없이 파기합니다.

• 회원 정보 및 대화 기록: 해당 학년도 종료 후 파기
• 서비스 이용 기록: 해당 학년도 종료 후 파기

단, 관계 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.
• 통신비밀보호법: 로그인 기록 3개월`,
  },
  {
    id: "destruction",
    title: "제4조 (개인정보의 파기 절차 및 방법)",
    content: `[파기 절차]
이용 목적이 달성된 개인정보는 내부 방침 및 관련 법령에 따라 일정 기간 저장된 후 파기됩니다.

[파기 방법]
• 전자적 파일: 복구 불가능한 방법으로 영구 삭제
• 데이터베이스 기록: Turso(libSQL Cloud)에서 완전 삭제`,
  },
  {
    id: "security",
    title: "제5조 (개인정보의 안전성 확보 조치)",
    content: `서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.

• HTTPS 암호화 통신: 모든 데이터 전송 구간에 TLS 암호화 적용
• Google OAuth 2.0 인증: 안전한 제3자 인증 방식 사용
• JWT 토큰 기반 세션 관리: 서버 측 토큰 검증으로 인증 보안 확보
• 학교 이메일 도메인 제한: @danggok.hs.kr 도메인만 로그인 허용
• 교사 승인제: 학생 계정은 교사 승인 후에만 서비스 이용 가능
• 일일 토큰 사용량 제한: AI API 과도한 사용 방지`,
  },
  {
    id: "delegation",
    title: "제6조 (개인정보 처리 위탁)",
    content: `서비스는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하고 있습니다.

| 수탁자 | 위탁 업무 | 보유 기간 |
|--------|----------|----------|
| Turso (libSQL Cloud) | 데이터베이스 호스팅 | 위탁 계약 종료 시 |
| Google LLC | OAuth 인증 제공 | 위탁 계약 종료 시 |

수탁자는 위탁받은 업무 범위를 초과하여 개인정보를 이용하거나 제3자에게 제공하지 않습니다.`,
  },
  {
    id: "thirdparty",
    title: "제7조 (개인정보의 제3자 제공 및 AI API 이용)",
    content: `서비스는 원칙적으로 정보주체의 개인정보를 제3자에게 제공하지 않습니다.

다만, AI 채팅 기능 이용 시 다음과 같이 대화 내용이 AI 서비스 제공자에게 기술적으로 전송됩니다.

| AI 서비스 | 제공자 | 전송 데이터 | 식별정보 전송 |
|-----------|--------|------------|-------------|
| Claude | Anthropic | 채팅 텍스트, 파일 | 미전송 |
| Gemini | Google | 채팅 텍스트, 파일 | 미전송 |
| ChatGPT | OpenAI | 채팅 텍스트 | 미전송 |
| Solar | Upstage | 채팅 텍스트 | 미전송 |

전송되는 데이터에는 개인 식별 정보(이름, 이메일 등)가 포함되지 않으며, 채팅 내용만 AI 응답 생성 목적으로 전달됩니다.

그 외 다음의 경우에는 예외로 제3자 제공이 가능합니다.
• 정보주체가 사전에 동의한 경우
• 법률에 특별한 규정이 있거나 법령상 의무를 준수하기 위해 불가피한 경우`,
  },
  {
    id: "rights",
    title: "제8조 (정보주체의 권리·의무)",
    content: `사용자(정보주체)는 다음과 같은 권리를 행사할 수 있습니다.

• 개인정보 열람 요구
• 오류 등이 있을 경우 정정 요구
• 삭제 요구
• 처리 정지 요구

[권리 행사 방법]
위 권리는 개인정보 보호책임자에게 이메일(greatsong21@gmail.com)로 요청하실 수 있습니다.
요청 접수 후 10일 이내에 처리 결과를 안내드립니다.

학생 및 법정대리인의 권리:
• 학생의 데이터는 교사가 교육 목적으로 관리하며, 학생 또는 법정대리인은 해당 교사 또는 개인정보 보호책임자에게 열람·정정·삭제를 요구할 수 있습니다.
• 14세 미만 아동의 개인정보 수집 시 개인정보보호법 제22조의2에 따릅니다.`,
  },
  {
    id: "officer",
    title: "제9조 (개인정보 보호책임자)",
    content: `서비스의 개인정보 보호책임자는 다음과 같습니다.

• 성명: 석리송
• 직위: 정보과 교사 (당곡고등학교)
• 이메일: greatsong21@gmail.com

개인정보 관련 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 담당자에게 문의하실 수 있습니다.

기타 개인정보 침해에 대한 신고나 상담은 아래 기관에 문의하실 수 있습니다.
• 개인정보침해 신고센터 (privacy.kisa.or.kr / 118)
• 개인정보 분쟁조정위원회 (kopico.go.kr / 1833-6972)
• 대검찰청 사이버수사과 (spo.go.kr / 1301)
• 경찰청 사이버안전국 (cyberbureau.police.go.kr / 182)`,
  },
  {
    id: "changes",
    title: "제10조 (개인정보 처리방침의 변경)",
    content: `이 개인정보 처리방침은 2026년 3월 18일부터 적용됩니다.

개인정보 처리방침이 변경되는 경우, 변경 사항을 서비스 내 공지사항을 통해 고지하겠습니다.

• 공고일자: 2026년 3월 18일
• 시행일자: 2026년 3월 18일`,
  },
];

export default function PrivacyPage() {
  const [openSections, setOpenSections] = useState(new Set(["purpose"]));

  const toggleSection = (id) => {
    const next = new Set(openSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenSections(next);
  };

  const expandAll = () => setOpenSections(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  return (
    <div className="min-h-screen py-8 px-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl shadow-lg border border-gray-200 p-8 mb-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <Link
              to="/login"
              className="flex items-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              돌아가기
            </Link>
            <div className="flex gap-2 text-xs">
              <button
                onClick={expandAll}
                className="text-indigo-600 hover:underline"
              >
                모두 펼치기
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={collapseAll}
                className="text-indigo-600 hover:underline"
              >
                모두 접기
              </button>
            </div>
          </div>

          <div className="flex items-center mb-4">
            <div className="p-3 bg-indigo-100 rounded-xl mr-4">
              <svg
                className="w-7 h-7 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                개인정보 처리방침
              </h1>
              <p className="text-sm mt-1 text-gray-400">
                당곡고 학생을 위한 AI 채팅 | 시행일: 2026년 3월 18일
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-gray-500">
            당곡고 학생을 위한 AI 채팅(이하 '서비스')은 「개인정보 보호법」
            제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을
            신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보
            처리방침을 수립·공개합니다.
          </p>
        </div>

        {/* Accordion Sections */}
        <div className="space-y-3">
          {sections.map((section) => {
            const isOpen = openSections.has(section.id);
            return (
              <div
                key={section.id}
                className="rounded-xl shadow-sm border border-gray-200 overflow-hidden bg-white"
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <h2 className="font-semibold text-sm md:text-base text-gray-900">
                    {section.title}
                  </h2>
                  <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-2 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19.5 8.25-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-gray-100">
                    <div className="pt-4 text-sm leading-relaxed whitespace-pre-line text-gray-600">
                      {section.content}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs pb-8 text-gray-400">
          <p>&copy; 2026 당곡고 학생을 위한 AI 채팅. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
