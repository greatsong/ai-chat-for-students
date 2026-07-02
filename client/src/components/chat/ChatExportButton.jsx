import { useEffect, useRef, useState } from 'react';
import { downloadChatHistory } from '../../lib/exportChat';

/**
 * 현재 대화 기록을 Markdown / 텍스트 파일로 저장하는 버튼.
 * 클릭하면 형식 선택 메뉴(.md / .txt)가 열린다.
 */
export default function ChatExportButton({ messages = [], userName, title, provider, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // 바깥 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const exportable = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const isDisabled = disabled || exportable.length === 0;

  const handleDownload = (format) => {
    downloadChatHistory(messages, { userName, title, provider, format });
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isDisabled}
        title="이 대화 기록을 파일로 저장"
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        기록 저장
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          <button
            onClick={() => handleDownload('md')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              MD
            </span>
            Markdown (.md)
          </button>
          <button
            onClick={() => handleDownload('txt')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              TXT
            </span>
            텍스트 (.txt)
          </button>
        </div>
      )}
    </div>
  );
}
