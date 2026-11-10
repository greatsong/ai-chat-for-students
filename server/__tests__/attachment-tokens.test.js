// 첨부 토큰 절감 (docs/DESIGN-attachment-tokens.md) 회귀 테스트
import { describe, it, expect } from 'vitest';
import {
  applyAttachmentPolicy,
  buildAttachmentSummary,
  KEEP_RECENT_USER_TURNS,
} from '../utils/attachmentPolicy.js';
import { extractPdfText, isTextRichPdf } from '../utils/pdfText.js';
import { trimHistoryByTokens } from '../utils/tokenEstimator.js';
import { withCacheBreakpoint, billableInputTokens } from '../providers/claude.js';

const image = (name = 'photo.jpg') => ({
  type: 'image',
  name,
  mimeType: 'image/jpeg',
  data: 'A'.repeat(1000),
});
const text = (name, data, summary) => ({
  type: 'text',
  name,
  mimeType: 'text/plain',
  data,
  ...(summary ? { summary } : {}),
});
const u = (content, files = []) => ({ role: 'user', content, files: JSON.stringify(files) });
const a = (content) => ({ role: 'assistant', content, files: '[]' });
const filesOf = (msg) => JSON.parse(msg.files);

describe('applyAttachmentPolicy (첨부 수명 정책)', () => {
  it(`최근 사용자 턴 ${KEEP_RECENT_USER_TURNS}개의 첨부는 원본을 유지한다`, () => {
    const history = [u('이 사진 설명해줘', [image()]), a('고양이 사진입니다.'), u('더 자세히')];
    const { history: out, summarizedCount } = applyAttachmentPolicy(history);
    expect(summarizedCount).toBe(0);
    expect(filesOf(out[0])[0].type).toBe('image');
  });

  it('그보다 오래된 이미지는 다음 AI 답변을 캡션으로 한 요약으로 바뀐다', () => {
    const history = [
      u('이 사진 설명해줘', [image()]),
      a('창가에 앉은 회색 고양이 사진입니다.'),
      u('고양이 종류는?'),
      a('러시안 블루로 보입니다.'),
      u('먹이는 뭘 주면 돼?'),
    ];
    const { history: out, summarizedCount } = applyAttachmentPolicy(history);
    expect(summarizedCount).toBe(1);
    const [f] = filesOf(out[0]);
    expect(f.type).toBe('text');
    expect(f.summarized).toBe(true);
    expect(f.data).toContain('photo.jpg');
    expect(f.data).toContain('창가에 앉은 회색 고양이');
    expect(f.data).not.toContain('AAAA');
  });

  it('업로드 때 만든 요약이 있으면 그것을 쓴다', () => {
    const history = [
      u('분석해줘', [text('scores.csv', 'a,b\n1,2', '2줄 7자. 앞부분: a,b 1,2')]),
      a('...'),
      u('다음'),
      a('...'),
      u('그다음'),
    ];
    const [f] = filesOf(applyAttachmentPolicy(history).history[0]);
    expect(f.data).toContain('2줄 7자');
  });

  it('학생이 파일 이름을 언급하면 원본을 되살린다', () => {
    const history = [
      u('', [image('실험결과.png')]),
      a('...'),
      u('다른 질문'),
      a('...'),
      u('실험결과 사진에서 세 번째 막대 값이 뭐였지?'),
    ];
    const { history: out, restoredCount, summarizedCount } = applyAttachmentPolicy(history);
    expect(restoredCount).toBe(1);
    expect(summarizedCount).toBe(0);
    expect(filesOf(out[0])[0].type).toBe('image');
  });

  it('"아까 올린 사진"처럼 이름 없이 가리키면 가장 최근의 오래된 첨부를 되살린다', () => {
    const history = [
      u('', [image('a.jpg')]),
      a('...'),
      u('', [image('b.jpg')]),
      a('...'),
      u('다른 얘기'),
      a('...'),
      u('아까 올린 사진 다시 봐줘'),
    ];
    const out = applyAttachmentPolicy(history).history;
    expect(filesOf(out[0])[0].type).toBe('text'); // a.jpg는 요약
    expect(filesOf(out[2])[0].type).toBe('image'); // b.jpg는 원본
  });

  it('DB에서 읽은 원본 배열을 바꾸지 않는다', () => {
    const history = [u('', [image()]), a('...'), u('1'), a('...'), u('2')];
    const before = history[0].files;
    applyAttachmentPolicy(history);
    expect(history[0].files).toBe(before);
  });
});

describe('buildAttachmentSummary', () => {
  it('텍스트는 줄 수·글자 수·앞부분을 담는다', () => {
    const s = buildAttachmentSummary(text('notes.txt', '첫 줄\n둘째 줄\n셋째 줄'));
    expect(s).toContain('3줄');
    expect(s).toContain('첫 줄');
  });

  it('긴 텍스트도 요약은 짧다', () => {
    const s = buildAttachmentSummary(text('big.txt', '가'.repeat(100000)));
    expect(s.length).toBeLessThan(700);
  });
});

// 손으로 만든 최소 PDF (Helvetica 텍스트 한 쪽). 페이지 밖 글자는 추출되지 않으므로 줄마다 나눠 쓴다.
function makePdf(lines) {
  const body = []
    .concat(lines)
    .map((line) => `(${line}) Tj 0 -14 Td`)
    .join(' ');
  const stream = `BT /F1 12 Tf 72 720 Td ${body} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

describe('PDF 텍스트 우선', () => {
  it('글자가 충분한 PDF는 텍스트 위주로 판정한다', async () => {
    const lines = Array(6).fill('Photosynthesis converts light energy into chemical energy.');
    const extracted = await extractPdfText(makePdf(lines));
    expect(extracted.pages).toBe(1);
    expect(extracted.text).toContain('Photosynthesis');
    expect(isTextRichPdf(extracted)).toBe(true);
  });

  it('글자가 거의 없으면 원본(스캔본)으로 판정한다', async () => {
    const extracted = await extractPdfText(makePdf('Fig. 1'));
    expect(isTextRichPdf(extracted)).toBe(false);
  });
});

describe('학생 입력 상한', () => {
  it('maxInputTokens를 넘으면 오래된 메시지를 잘라낸다', () => {
    const long = '가'.repeat(4000); // 약 6,000 토큰
    const history = [u(long), a(long), u(long), a(long), u('질문')];
    const free = trimHistoryByTokens(history, 'claude', 'claude-sonnet-5-5');
    expect(free.trimmedCount).toBe(0);
    const capped = trimHistoryByTokens(history, 'claude', 'claude-sonnet-5-5', {
      maxInputTokens: 10000,
    });
    expect(capped.trimmedCount).toBeGreaterThan(0);
    expect(capped.trimmedHistory.at(-1).content).toBe('질문');
  });
});

describe('Claude 프롬프트 캐싱', () => {
  it('마지막 메시지의 마지막 블록에만 cache_control을 붙이고 원본은 바꾸지 않는다', () => {
    const messages = [
      { role: 'user', content: '첫 질문' },
      { role: 'assistant', content: '답' },
      {
        role: 'user',
        content: [
          { type: 'image', source: {} },
          { type: 'text', text: '이건?' },
        ],
      },
    ];
    const out = withCacheBreakpoint(messages);
    expect(out[2].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(out[2].content[0].cache_control).toBeUndefined();
    expect(out[0]).toBe(messages[0]);
    expect(messages[2].content[1].cache_control).toBeUndefined();
  });

  it('문자열 메시지는 텍스트 블록으로 바꿔 붙인다', () => {
    const out = withCacheBreakpoint([{ role: 'user', content: '안녕' }]);
    expect(out[0].content).toEqual([
      { type: 'text', text: '안녕', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('캐시 쓰기 1.25배·읽기 0.1배로 입력 토큰을 환산한다', () => {
    expect(
      billableInputTokens({
        input_tokens: 100,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 10000,
      }),
    ).toBe(100 + 1250 + 1000);
  });
});
