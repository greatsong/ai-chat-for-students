import { describe, it, expect, vi, beforeEach } from 'vitest';

// OpenAI SDK와 API 키 조회를 모킹해 실제 네트워크 없이 STT 호출 파라미터만 검증한다.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('openai', () => ({
  default: class OpenAIMock {
    constructor() {
      this.audio = { transcriptions: { create: createMock } };
    }
  },
}));

vi.mock('../utils/apiKeys.js', () => ({
  getApiKey: vi.fn(async () => 'test-key'),
}));

const { transcribeAudio, STT_MODEL, STT_LANGUAGE_HINTS } = await import('../providers/openai.js');

describe('openai transcribeAudio (STT)', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ text: '안녕하세요' });
  });

  it('whisper-1 대신 gpt-transcribe를 사용한다 (whisper-1은 2027-02-26 셧다운)', async () => {
    await transcribeAudio({ audioBuffer: Buffer.from('abc'), mimeType: 'audio/webm' });
    expect(createMock).toHaveBeenCalledTimes(1);
    const params = createMock.mock.calls[0][0];
    expect(STT_MODEL).toBe('gpt-transcribe');
    expect(params.model).toBe('gpt-transcribe');
    expect(params.model).not.toBe('whisper-1');
  });

  it('언어 힌트는 복수형 languages 배열로 전달한다 (단수 language 미사용)', async () => {
    await transcribeAudio({ audioBuffer: Buffer.from('abc'), mimeType: 'audio/webm' });
    const params = createMock.mock.calls[0][0];
    expect(params.languages).toEqual(STT_LANGUAGE_HINTS);
    expect(params.languages).toContain('ko');
    expect(params).not.toHaveProperty('language');
  });

  it('mimeType에 따라 파일 확장자를 정하고 텍스트만 반환한다', async () => {
    const result = await transcribeAudio({
      audioBuffer: Buffer.from('abc'),
      mimeType: 'audio/mp4',
    });
    const params = createMock.mock.calls[0][0];
    expect(params.file.name).toBe('recording.mp4');
    expect(params.file.type).toBe('audio/mp4');
    expect(result).toEqual({ text: '안녕하세요' });
  });
});
