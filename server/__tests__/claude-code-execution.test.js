import { describe, it, expect } from 'vitest';
import { extractCodeExecutionOutput } from '../providers/claude.js';

describe('claude extractCodeExecutionOutput', () => {
  it('블록 없으면 빈 문자열', () => {
    expect(extractCodeExecutionOutput([])).toBe('');
    expect(extractCodeExecutionOutput([{ type: 'text', text: '안녕' }])).toBe('');
  });

  it('server_tool_use는 실행한 코드를 마크다운 펜스로 감싼다', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'server_tool_use',
        name: 'code_execution',
        input: { code: 'import pandas as pd\nprint("hi")' },
      },
    ]);
    expect(out).toContain('실행한 코드');
    expect(out).toContain('```python');
    expect(out).toContain('import pandas as pd');
  });

  it('code_execution_result는 stdout과 return code를 포함', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'code_execution_tool_result',
        content: {
          type: 'code_execution_result',
          stdout: '평균: 42.5',
          stderr: '',
          return_code: 0,
        },
      },
    ]);
    expect(out).toContain('실행 결과');
    expect(out).toContain('return code: 0');
    expect(out).toContain('평균: 42.5');
  });

  it('stderr이 있으면 [stderr] 라벨로 포함', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'code_execution_tool_result',
        content: {
          type: 'code_execution_result',
          stdout: '결과',
          stderr: 'DeprecationWarning: ...',
          return_code: 0,
        },
      },
    ]);
    expect(out).toContain('결과');
    expect(out).toContain('[stderr] DeprecationWarning');
  });

  it('빈 출력이면 "(출력 없음)" 표시', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'code_execution_tool_result',
        content: { type: 'code_execution_result', stdout: '', stderr: '', return_code: 0 },
      },
    ]);
    expect(out).toContain('(출력 없음)');
  });

  it('error 결과는 error_code를 표시', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'code_execution_tool_result',
        content: {
          type: 'code_execution_tool_result_error',
          error_code: 'execution_time_exceeded',
        },
      },
    ]);
    expect(out).toContain('실행 오류');
    expect(out).toContain('execution_time_exceeded');
  });

  it('실행 + 결과 블록 다수도 순서대로 합친다', () => {
    const out = extractCodeExecutionOutput([
      { type: 'text', text: '계산해볼게요.' },
      {
        type: 'server_tool_use',
        name: 'code_execution',
        input: { code: 'print(1+1)' },
      },
      {
        type: 'code_execution_tool_result',
        content: { type: 'code_execution_result', stdout: '2', stderr: '', return_code: 0 },
      },
    ]);
    const codeIdx = out.indexOf('print(1+1)');
    const resultIdx = out.indexOf('실행 결과');
    expect(codeIdx).toBeGreaterThan(-1);
    expect(resultIdx).toBeGreaterThan(codeIdx);
  });

  it('null/undefined 블록은 안전하게 무시', () => {
    expect(() =>
      extractCodeExecutionOutput([null, undefined, { type: 'text', text: 'x' }]),
    ).not.toThrow();
  });
});
