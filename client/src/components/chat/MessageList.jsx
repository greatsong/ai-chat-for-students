import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 코드 블록 컴포넌트
function CodeBlock({ language, children }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden">
      {/* 언어 라벨 + 복사 버튼 */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800 text-gray-400 text-xs">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:text-white hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          복사
        </button>
      </div>
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
  );
}

// Markdown 렌더러 컴포넌트 설정
const markdownComponents = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && !String(children).includes('\n');
    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 bg-gray-100 text-pink-600 text-sm rounded font-mono" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock language={match?.[1]}>{children}</CodeBlock>;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-gray-200 text-sm">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border border-gray-200 px-3 py-1.5 bg-gray-50 font-semibold text-left">{children}</th>;
  },
  td({ children }) {
    return <td className="border border-gray-200 px-3 py-1.5">{children}</td>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
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
    return <blockquote className="border-l-4 border-gray-300 pl-4 my-2 text-gray-600 italic">{children}</blockquote>;
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

// 타이핑 인디케이터
function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
        <span className="text-white text-sm">AI</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

// 개별 메시지 컴포넌트
function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const timeStr = message.created_at
    ? new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : ''}`}>
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

      {/* 메시지 본문 */}
      <div className={`max-w-[75%] min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-100 text-gray-800 rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content || ''}
              </ReactMarkdown>
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

        {/* 시간 */}
        {timeStr && (
          <span className={`text-xs text-gray-400 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
            {timeStr}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MessageList({ messages = [], isStreaming = false, streamingContent = '' }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  // 자동 스크롤
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id || msg.temp_id || Math.random()} message={msg} />
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
    </div>
  );
}
