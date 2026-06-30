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
    expect(out).toContain('```');
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

  // ── 현재 도구 버전(_20250825 / _20260120 / _20260521) 블록 타입 ──
  // 공식 응답 포맷: server_tool_use(name: bash_code_execution, input.command)
  //               + bash_code_execution_tool_result(content.type: bash_code_execution_result)

  it('현재 버전: bash_code_execution server_tool_use의 command를 표시', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'server_tool_use',
        name: 'bash_code_execution',
        input: { command: 'python -c "print(2+2)"' },
      },
    ]);
    expect(out).toContain('실행한 코드');
    expect(out).toContain('python -c');
  });

  it('현재 버전: bash_code_execution_tool_result의 stdout/return_code를 표시', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'bash_code_execution_tool_result',
        content: {
          type: 'bash_code_execution_result',
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

  it('현재 버전: bash 에러 결과(content.type *_error)를 표시', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'bash_code_execution_tool_result',
        content: { type: 'bash_code_execution_tool_result_error', error_code: 'detection_timeout' },
      },
    ]);
    expect(out).toContain('실행 오류');
    expect(out).toContain('detection_timeout');
  });

  it('현재 버전: text_editor 파일 내용 블록을 표시', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'text_editor_code_execution_tool_result',
        content: { type: 'text_editor_code_execution_result', content: '{"a":1}' },
      },
    ]);
    expect(out).toContain('파일 내용');
    expect(out).toContain('{"a":1}');
  });

  it('현재 버전: bash 실행 + 결과를 순서대로 합친다', () => {
    const out = extractCodeExecutionOutput([
      {
        type: 'server_tool_use',
        name: 'bash_code_execution',
        input: { command: 'echo hi' },
      },
      {
        type: 'bash_code_execution_tool_result',
        content: { type: 'bash_code_execution_result', stdout: 'hi', stderr: '', return_code: 0 },
      },
    ]);
    const codeIdx = out.indexOf('echo hi');
    const resultIdx = out.indexOf('실행 결과');
    expect(codeIdx).toBeGreaterThan(-1);
    expect(resultIdx).toBeGreaterThan(codeIdx);
  });
});
