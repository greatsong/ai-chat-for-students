import { describe, it, expect, vi, beforeEach } from 'vitest';

// OpenAI SDK와 API 키 조회를 모킹해 실제 네트워크 없이 이미지 생성 파라미터만 검증한다.
const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock('openai', () => ({
  default: class OpenAIMock {
    constructor() {
      this.images = { generate: generateMock };
    }
  },
}));

vi.mock('../utils/apiKeys.js', () => ({
  getApiKey: vi.fn(async () => 'test-key'),
}));

const { generateImage, IMAGE_MODEL, IMAGE_MODEL_FALLBACK, isOrgVerificationError } =
  await import('../providers/openai.js');

/** OpenAI가 조직 미인증 계정에 반환하는 403 에러 재현 */
function verificationError(model) {
  const err = new Error(`Your organization must be verified to use the model \`${model}\``);
  err.status = 403;
  return err;
}

const okResponse = { data: [{ b64_json: 'aW1hZ2U=' }] };

describe('openai generateImage (이미지 생성)', () => {
  beforeEach(() => {
    generateMock.mockReset();
    generateMock.mockResolvedValue(okResponse);
  });

  it('기본 모델로 gpt-image-2.5-flare를 사용한다', async () => {
    const result = await generateImage({ prompt: '태양계 삽화' });

    expect(IMAGE_MODEL).toBe('gpt-image-2.5-flare');
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0][0].model).toBe('gpt-image-2.5-flare');
    expect(result.model).toBe('gpt-image-2.5-flare');
    expect(result.mimeType).toBe('image/png');
  });

  it('조직 미인증 403이면 gpt-image-2로 폴백하고 실제 사용 모델을 반환한다', async () => {
    generateMock
      .mockRejectedValueOnce(verificationError(IMAGE_MODEL))
      .mockResolvedValueOnce(okResponse);

    const result = await generateImage({ prompt: '태양계 삽화' });

    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(generateMock.mock.calls[1][0].model).toBe(IMAGE_MODEL_FALLBACK);
    expect(result.model).toBe(IMAGE_MODEL_FALLBACK);
  });

  it('폴백 시 gpt-image-2가 지원하지 않는 xhigh 품질은 high로 낮춘다', async () => {
    generateMock
      .mockRejectedValueOnce(verificationError(IMAGE_MODEL))
      .mockResolvedValueOnce(okResponse);

    await generateImage({ prompt: '태양계 삽화', quality: 'xhigh' });

    expect(generateMock.mock.calls[0][0].quality).toBe('xhigh');
    expect(generateMock.mock.calls[1][0].quality).toBe('high');
  });

  it('인증과 무관한 에러는 폴백하지 않고 그대로 전파한다', async () => {
    const err = new Error('Invalid prompt');
    err.status = 400;
    generateMock.mockRejectedValueOnce(err);

    await expect(generateImage({ prompt: 'x' })).rejects.toThrow('Invalid prompt');
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('isOrgVerificationError는 403 + 인증 문구일 때만 참이다', () => {
    expect(isOrgVerificationError(verificationError(IMAGE_MODEL))).toBe(true);

    const forbidden = new Error('Country not supported');
    forbidden.status = 403;
    expect(isOrgVerificationError(forbidden)).toBe(false);

    const rateLimited = new Error('must be verified');
    rateLimited.status = 429;
    expect(isOrgVerificationError(rateLimited)).toBe(false);
  });
});
