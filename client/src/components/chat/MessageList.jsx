import { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 코드 블록 컴포넌트
function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg">
      {/* 언어 라벨 + 복사 버튼 — 항상 코드 블록 상단에 고정 */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-t-lg">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
            copied ? 'text-green-400 bg-green-900/30' : 'hover:text-white hover:bg-gray-700'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              복사됨
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              복사
            </>
          )}
        </button>
      </div>
      {/* 코드 영역 — 긴 코드는 스크롤, 헤더(복사 버튼)는 항상 위에 보임 */}
      <div className="max-h-[60vh] overflow-auto rounded-b-lg">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: '0.8125rem',
          }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Markdown 렌더러 컴포넌트 설정
const markdownComponents = {
  // react-markdown v10: 코드 블록(```code```)은 pre > code 구조로 렌더링됨
  // pre 컴포넌트에서 CodeBlock을 렌더링하여 모든 언어에서 복사 버튼 표시
  pre({ children }) {
    // children이 code 엘리먼트인지 확인
    if (children?.type === 'code' || children?.props?.className) {
      const className = children?.props?.className || '';
      const match = /language-(\w+)/.exec(className);
      const code = children?.props?.children || '';
      return <CodeBlock language={match?.[1]}>{code}</CodeBlock>;
    }
    return <pre>{children}</pre>;
  },
  code({ className, children, ...props }) {
    // pre 안의 code는 위의 pre 핸들러가 처리 → 여기는 인라인 코드만
    const match = /language-(\w+)/.exec(className || '');
    const isBlock = match || String(children).includes('\n');
    if (isBlock) {
      // pre 핸들러를 거치지 않고 직접 온 코드 블록 (fallback)
      return <CodeBlock language={match?.[1]}>{children}</CodeBlock>;
    }
    return (
      <code
        className="px-1.5 py-0.5 bg-gray-100 text-pink-600 text-sm rounded font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-gray-200 text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-gray-200 px-3 py-1.5 bg-gray-50 font-semibold text-left">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-gray-200 px-3 py-1.5">{children}</td>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-gray-300 pl-4 my-2 text-gray-600 italic">
        {children}
      </blockquote>
    );
  },
  p({ children }) {
    return <p className="my-1.5 leading-relaxed">{children}</p>;
  },
  h1({ children }) {
    return <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-base font-bold mt-3 mb-1">{children}</h3>;
  },
};

// 메모이제이션된 Markdown 렌더러 — content가 변경될 때만 재렌더링
const MemoizedMarkdown = memo(function MemoizedMarkdown({ content }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content || ''}
    </ReactMarkdown>
  );
});

// 타이핑 인디케이터
function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
        <span className="text-white text-sm">AI</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"
            style={{ animationDelay: '200ms' }}
          />
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"
            style={{ animationDelay: '400ms' }}
          />
        </div>
      </div>
    </div>
  );
}

// 파일 첨부 표시
function FileAttachments({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file, index) => {
        const isImage = file.mime_type?.startsWith('image/') || file.type?.startsWith('image/');
        return (
          <div key={index}>
            {isImage && file.url ? (
              <img
                src={file.url}
                alt={file.original_name || file.name || 'image'}
                className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-gray-200"
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 border border-gray-200 rounded-lg text-xs">
                <span>📎</span>
                <span className="text-gray-700 max-w-[150px] truncate">
                  {file.original_name || file.name || '파일'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// TTS 스피커 버튼
function TtsButton({ text, onSpeak }) {
  const [state, setState] = useState('idle'); // idle | loading | playing
  const audioRef = useRef(null);

  // 언마운트 시 오디오 리소스 정리 및 blob URL 해제
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(audioRef.current.src);
        }
        audioRef.current = null;
      }
    };
  }, []);

  const cleanupAudio = () => {
    if (audioRef.current) {
      if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current = null;
    }
  };

  const handleClick = async () => {
    if (state === 'playing') {
      audioRef.current?.pause();
      cleanupAudio();
      setState('idle');
      return;
    }

    setState('loading');
    try {
      const audio = await onSpeak(text);
      audioRef.current = audio;
      setState('playing');
      audio.onended = () => {
        cleanupAudio();
        setState('idle');
      };
      audio.onerror = () => {
        cleanupAudio();
        setState('idle');
      };
    } catch {
      setState('idle');
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`p-1 rounded-md transition-colors ${
        state === 'playing'
          ? 'text-blue-600 bg-blue-100'
          : state === 'loading'
            ? 'text-gray-400 animate-pulse'
            : 'text-gray-400 hover:text-blue-600 hover:bg-gray-200'
      }`}
      title={state === 'playing' ? '정지' : '읽어주기'}
    >
      {state === 'loading' ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : state === 'playing' ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z"
          />
        </svg>
      )}
    </button>
  );
}

// 개별 메시지 컴포넌트 — React.memo로 불필요한 재렌더링 방지
const MessageBubble = memo(
  function MessageBubble({ message, ttsEnabled, onSpeak }) {
    const isUser = message.role === 'user';
    const timeStr = message.created_at
      ? new Date(message.created_at).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return (
      <div
        className={`flex items-start gap-3 px-4 py-3 min-w-0 ${isUser ? 'flex-row-reverse animate-slide-in-right' : 'animate-slide-in-left'}`}
      >
        {/* 아바타 */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gradient-to-br from-purple-500 to-blue-600 text-white'
          }`}
        >
          {isUser ? '나' : 'AI'}
        </div>

        {/* 메시지 본문 — min-w-0이 flex 자식 콘텐츠 강제 확장을 막는 핵심.
            긴 코드 라인이 max-w-[75%]를 무시하고 메시지를 화면 밖으로 밀어내는 문제 방지. */}
        <div
          className={`max-w-[75%] min-w-0 flex-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}
        >
          <div
            className={`min-w-0 max-w-full rounded-2xl px-4 py-2.5 text-sm ${
              isUser
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : 'bg-gray-100 text-gray-800 rounded-tl-sm'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <div className="prose prose-sm max-w-full min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto">
                <MemoizedMarkdown content={message.content} />
              </div>
            )}

            {/* 생성된 이미지 표시 */}
            {message.image_url && (
              <div className="mt-2">
                <img
                  src={message.image_url}
                  alt="생성된 이미지"
                  className="max-w-full rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(message.image_url, '_blank')}
                />
              </div>
            )}

            {/* 파일 첨부 */}
            <FileAttachments files={message.files} />
          </div>

          {/* 부분 응답 후 끊겼을 때 보조 안내 (답변 내용은 보존됨) */}
          {!isUser && message.errorNote && (
            <div className="mt-1 px-2 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md inline-flex items-center gap-1">
              <span>⚠️</span>
              <span>{message.errorNote}</span>
            </div>
          )}

          {/* 시간 + TTS 버튼 */}
          <div className={`flex items-center gap-2 mt-1 ${isUser ? 'flex-row-reverse' : ''}`}>
            {timeStr && <span className="text-xs text-gray-400">{timeStr}</span>}
            {!isUser && ttsEnabled && onSpeak && message.content?.trim() && (
              <TtsButton text={message.content} onSpeak={onSpeak} />
            )}
          </div>
        </div>
      </div>
    );
  },
  function areEqual(prevProps, nextProps) {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.role === nextProps.message.role &&
      prevProps.message.errorNote === nextProps.message.errorNote &&
      prevProps.ttsEnabled === nextProps.ttsEnabled &&
      prevProps.onSpeak === nextProps.onSpeak
    );
  },
);

export default function MessageList({
  messages = [],
  isStreaming = false,
  streamingContent = '',
  ttsEnabled = false,
  onSpeak,
}) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  // 사용자가 위로 스크롤하면 자동 스크롤을 일시 중단. 다시 바닥 근처로 오면 재개.
  const [autoScroll, setAutoScroll] = useState(true);
  const messageCount = messages.length;
  const prevMessageCountRef = useRef(messageCount);

  // 스크롤 위치 감지 — 바닥에서 80px 이상 떨어지면 autoScroll 끔
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    setAutoScroll(atBottom);
  };

  // 새 메시지가 추가되면 (사용자가 메시지를 보내면) 자동 스크롤 복귀
  useEffect(() => {
    if (messageCount > prevMessageCountRef.current) {
      setAutoScroll(true);
    }
    prevMessageCountRef.current = messageCount;
  }, [messageCount]);

  // 자동 스크롤 — autoScroll이 켜져 있을 때만
  useEffect(() => {
    if (!autoScroll) return;
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, streamingContent, autoScroll]);

  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative">
      <div className="max-w-5xl mx-auto py-4">
        {messages.map((msg, index) => (
          <MessageBubble
            key={msg.id || msg.temp_id || `msg-${index}`}
            message={msg}
            ttsEnabled={ttsEnabled}
            onSpeak={onSpeak}
          />
        ))}

        {/* 스트리밍 중인 응답 */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              role: 'assistant',
              content: streamingContent,
              id: '__streaming__',
            }}
          />
        )}

        {/* 타이핑 인디케이터 */}
        {isStreaming && !streamingContent && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* 자동 스크롤 일시 중단 시 — 바닥으로 돌아가는 버튼 */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-full shadow-md text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          title="최신 응답으로 이동"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
          최신 응답 보기
        </button>
      )}
    </div>
  );
}
