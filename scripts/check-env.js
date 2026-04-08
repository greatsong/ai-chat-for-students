/**
 * 환경변수 검증 스크립트
 *
 * 사용법:
 *   node scripts/check-env.js          # 서버 실행 전 필수 환경변수 검증
 *   node scripts/check-env.js --ci     # CI에서는 .env.example 템플릿만 검증
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REQUIRED_VARS = [
  'PORT',
  'CLIENT_URL',
  // AI API 키 — apiKeys.js ENV_KEY_MAP과 일치
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
  'UPSTAGE_API_KEY',
  // Google OAuth
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  // 인증/보안
  'JWT_SECRET',
  // 사용자 관리
  'ADMIN_EMAILS',
  'TEACHER_EMAILS',
  // Turso DB
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
];

const isCI = process.argv.includes('--ci');

if (isCI) {
  // CI 모드: .env.example에 모든 필수 변수가 정의되어 있는지 확인
  const examplePath = resolve(ROOT, '.env.example');
  if (!existsSync(examplePath)) {
    console.error('.env.example 파일이 없습니다.');
    process.exit(1);
  }

  const content = readFileSync(examplePath, 'utf-8');
  const defined = content
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => l.split('=')[0].trim());

  const missing = REQUIRED_VARS.filter((v) => !defined.includes(v));
  if (missing.length > 0) {
    console.error('.env.example에 누락된 변수:', missing.join(', '));
    process.exit(1);
  }
  console.log('.env.example 검증 통과 — 필수 변수 %d개 확인', REQUIRED_VARS.length);
} else {
  // 로컬 모드: 실제 환경변수 확인
  const envPath = resolve(ROOT, 'server', '.env');
  if (!existsSync(envPath)) {
    console.error('server/.env 파일이 없습니다. .env.example을 복사하세요.');
    process.exit(1);
  }

  // dotenv 파싱 (의존성 없이)
  const content = readFileSync(envPath, 'utf-8');
  const envVars = {};
  content.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim();
  });

  const missing = REQUIRED_VARS.filter((v) => !envVars[v] || envVars[v].startsWith('your_'));

  if (missing.length > 0) {
    console.error('server/.env에 설정이 필요한 변수:');
    missing.forEach((v) => console.error('  - %s', v));
    process.exit(1);
  }
  console.log('환경변수 검증 통과 — 필수 변수 %d개 확인', REQUIRED_VARS.length);
}
