import { describe, it, expect } from 'vitest';

describe('Server', () => {
  it('환경변수 기본값이 올바르다', () => {
    // PORT 기본값 검증
    const PORT = process.env.PORT || 4022;
    expect(PORT).toBe(4022);
  });

  it('필수 모듈이 정상적으로 임포트된다', async () => {
    const express = await import('express');
    expect(express.default).toBeDefined();

    const cors = await import('cors');
    expect(cors.default).toBeDefined();

    const helmet = await import('helmet');
    expect(helmet.default).toBeDefined();
  });
});
