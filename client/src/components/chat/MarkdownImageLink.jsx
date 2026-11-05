/**
 * 마크다운 이미지를 불러오지 않고 링크로 표시한다.
 * 이미지 주소에 대화 내용을 실어 외부로 보내는 프롬프트 주입과, 관리자 열람 시 외부 요청이 나가는 것을 막는다.
 * CSP img-src도 같은 요청을 차단한다.
 */
export default function MarkdownImageLink({ src, alt }) {
  if (!src) return alt || null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800"
    >
      외부 이미지 열기{alt ? `: ${alt}` : ''}
    </a>
  );
}
