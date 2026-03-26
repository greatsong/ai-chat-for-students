import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('환경변수 템플릿', () => {
  it('.env.example에 모든 필수 변수가 정의되어 있다', () => {
    const REQUIRED = [
      'PORT',
      'CLIENT_URL',
      'ANTHROPIC_API_KEY',
      'GOOGLE_AI_API_KEY',
      'OPENAI_API_KEY',
      'UPSTAGE_API_KEY',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'JWT_SECRET',
      'TEACHER_EMAILS',
    ];

    const content = readFileSync(resolve(__dirname, '../../.env.example'), 'utf-8');
    const defined = content
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => l.split('=')[0].trim());

    REQUIRED.forEach((v) => {
      expect(defined).toContain(v);
    });
  });
});
