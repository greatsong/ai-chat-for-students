import { useState, useRef, useEffect, useCallback } from 'react';

const MAX_ROWS = 6;
const LINE_HEIGHT = 24; // approximate line height in px

export default function MessageInput({
  onSend,
  onGenerateImage,
  disabled = false,
  isStreaming = false,
  isTeacher = false,
}) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageProvider, setImageProvider] = useState('gemini');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // 자동 리사이즈
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  }, [message]);

  // 포커스
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled || isStreaming) return;

    onSend?.(trimmed, attachments);
    setMessage('');
    setAttachments([]);

    // 리사이즈 초기화
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 0);
  }, [message, attachments, disabled, isStreaming, onSend]);

  const handleKeyDown = (e) => {
    // 한글 IME 조합 중에는 무시 (한글 1글자 남는 문제 방지)
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 파일 선택
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    // 같은 파일 재선택 가능하도록 초기화
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (files) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles = files.filter((f) => {
      if (f.size > maxSize) {
        alert(`${f.name}은(는) 10MB를 초과하여 첨부할 수 없습니다.`);
        return false;
      }
      return true;
    });

    setAttachments((prev) => [...prev, ...validFiles]);
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // 드래그 앤 드롭
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
  };

  // 클립보드 붙여넣기 (이미지)
  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  };

  const canSend = (message.trim().length > 0 || attachments.length > 0) && !disabled && !isStreaming;

  // 파일 아이콘
  const getFileIcon = (file) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type === 'application/pdf') return '📄';
    if (file.type.includes('text') || file.name.match(/\.(js|jsx|ts|tsx|py|java|c|cpp|h|css|html|json|md|txt|csv)$/i)) return '📝';
    return '📎';
  };

  // 파일 사이즈 포맷
  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      className={`
        border-t border-gray-200 bg-white px-4 py-3
        ${isDragOver ? 'ring-2 ring-blue-400 ring-inset bg-blue-50' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 안내 */}
      {isDragOver && (
        <div className="flex items-center justify-center gap-2 mb-2 py-3 text-sm text-blue-600 bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg">
          <span className="text-lg">📂</span>
          파일을 여기에 놓으세요
        </div>
      )}

      {/* 첨부 파일 목록 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {attachments.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm group"
            >
              {/* 이미지 프리뷰 */}
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-8 h-8 rounded object-cover"
                />
              ) : (
                <span>{getFileIcon(file)}</span>
              )}
              <span className="text-gray-700 max-w-[120px] truncate">{file.name}</span>
              <span className="text-gray-400 text-xs">{formatSize(file.size)}</span>
              <button
                onClick={() => removeAttachment(index)}
                className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                title="첨부 제거"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 이미지 생성 패널 (교사 전용) */}
      {showImageGen && isTeacher && (
        <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-purple-800">🎨 이미지 생성</span>
            <select
              value={imageProvider}
              onChange={(e) => setImageProvider(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border border-purple-300 bg-white text-purple-700"
            >
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
            <button
              onClick={() => setShowImageGen(false)}
              className="ml-auto text-purple-400 hover:text-purple-600 text-xs"
            >
              닫기
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (imagePrompt.trim() && !isStreaming) {
                    onGenerateImage?.(imagePrompt.trim(), imageProvider);
                    setImagePrompt('');
                    setShowImageGen(false);
                  }
                }
              }}
              placeholder="생성할 이미지를 설명하세요..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isStreaming}
            />
            <button
              onClick={() => {
                if (imagePrompt.trim() && !isStreaming) {
                  onGenerateImage?.(imagePrompt.trim(), imageProvider);
                  setImagePrompt('');
                  setShowImageGen(false);
                }
              }}
              disabled={!imagePrompt.trim() || isStreaming}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              생성
            </button>
          </div>
        </div>
      )}

      {/* 입력 영역 */}
      <div className="flex items-end gap-2">
        {/* 파일 첨부 버튼 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="파일 첨부"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* 이미지 생성 버튼 (교사 전용) */}
        {isTeacher && (
          <button
            onClick={() => setShowImageGen(!showImageGen)}
            disabled={disabled}
            className={`flex-shrink-0 p-2.5 rounded-lg transition-colors disabled:opacity-50 ${
              showImageGen
                ? 'text-purple-600 bg-purple-100'
                : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
            }`}
            title="이미지 생성"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.html,.css,.scss,.sql,.sh,.ipynb"
        />

        {/* 텍스트 입력 */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={isStreaming ? 'AI가 응답 중...' : '메시지를 입력하세요...'}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          style={{ lineHeight: LINE_HEIGHT + 'px' }}
        />

        {/* 전송 버튼 */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`
            flex-shrink-0 p-3 rounded-xl transition-all
            ${canSend
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
          `}
          title="전송 (Enter)"
        >
          {isStreaming ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>

      {/* 안내 */}
      <p className="mt-1.5 text-xs text-gray-400 text-center">
        Enter로 전송 · Shift+Enter로 줄바꿈
      </p>
    </div>
  );
}
