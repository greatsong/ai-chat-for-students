import { describe, it, expect } from 'vitest';
import { convertToResponsesInput, extractCodeInterpreterOutput } from '../providers/openai.js';

describe('openai convertToResponsesInput', () => {
  it('문자열 콘텐츠는 그대로 유지', () => {
    const out = convertToResponsesInput([{ role: 'user', content: '안녕' }]);
    expect(out).toEqual([{ role: 'user', content: '안녕' }]);
  });

  it('text 파트는 input_text로 변환', () => {
    const out = convertToResponsesInput([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ]);
    expect(out[0].content).toEqual([{ type: 'input_text', text: 'hello' }]);
  });

  it('image_url 파트는 input_image로 변환 (url 직접 전달)', () => {
    const out = convertToResponsesInput([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }],
      },
    ]);
    expect(out[0].content).toEqual([
      { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'auto' },
    ]);
  });

  it('text + image 혼합도 순서 유지', () => {
    const out = convertToResponsesInput([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:x' } },
          { type: 'text', text: '뭐가 보여?' },
        ],
      },
    ]);
    expect(out[0].content).toHaveLength(2);
    expect(out[0].content[0].type).toBe('input_image');
    expect(out[0].content[1].type).toBe('input_text');
  });

  it('content가 배열도 문자열도 아니면 빈 문자열로 안전 처리', () => {
    const out = convertToResponsesInput([{ role: 'user', content: undefined }]);
    expect(out[0].content).toBe('');
  });
});

describe('openai extractCodeInterpreterOutput', () => {
  it('빈 배열이면 빈 문자열', () => {
    expect(extractCodeInterpreterOutput([])).toBe('');
    expect(extractCodeInterpreterOutput(null)).toBe('');
    expect(extractCodeInterpreterOutput(undefined)).toBe('');
  });

  it('code_interpreter_call이 없으면 빈 문자열 (메시지 아이템 무시)', () => {
    const out = extractCodeInterpreterOutput([
      { type: 'message', content: [{ type: 'output_text', text: '안녕' }] },
    ]);
    expect(out).toBe('');
  });

  it('code와 logs를 마크다운 펜스로 합친다', () => {
    const out = extractCodeInterpreterOutput([
      {
        type: 'code_interpreter_call',
        code: 'import pandas as pd\nprint("hi")',
        outputs: [{ type: 'logs', logs: 'hi\n' }],
      },
    ]);
    expect(out).toContain('실행한 코드');
    expect(out).toContain('```python');
    expect(out).toContain('import pandas as pd');
    expect(out).toContain('실행 결과');
    expect(out).toContain('hi');
  });

  it('logs가 비어 있으면 "(출력 없음)" 표시', () => {
    const out = extractCodeInterpreterOutput([
      {
        type: 'code_interpreter_call',
        code: 'pass',
        outputs: [{ type: 'logs', logs: '' }],
      },
    ]);
    expect(out).toContain('(출력 없음)');
  });

  it('image output은 file_id 안내로 표시', () => {
    const out = extractCodeInterpreterOutput([
      {
        type: 'code_interpreter_call',
        code: 'plt.savefig(...)',
        outputs: [{ type: 'image', file_id: 'file-abc' }],
      },
    ]);
    expect(out).toContain('file-abc');
  });

  it('여러 code_interpreter_call 호출도 순서대로 합친다', () => {
    const out = extractCodeInterpreterOutput([
      {
        type: 'code_interpreter_call',
        code: 'x = 1',
        outputs: [{ type: 'logs', logs: '' }],
      },
      {
        type: 'code_interpreter_call',
        code: 'print(x + 1)',
        outputs: [{ type: 'logs', logs: '2\n' }],
      },
    ]);
    const firstCodeIdx = out.indexOf('x = 1');
    const secondCodeIdx = out.indexOf('print(x + 1)');
    expect(firstCodeIdx).toBeGreaterThan(-1);
    expect(secondCodeIdx).toBeGreaterThan(firstCodeIdx);
    expect(out).toContain('2');
  });
});
