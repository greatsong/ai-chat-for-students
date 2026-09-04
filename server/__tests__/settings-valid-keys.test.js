/**
 * 회귀 테스트: 관리자 설정 저장 허용 키 목록
 *
 * 버그 이력: code_execution_claude/openai/max_role 키가 PUT /teacher/settings
 * 허용목록에서 누락되어, 관리자 대시보드에서 코드 실행 토글을 켜고 저장하면
 * 400으로 거부되고 저장이 동작하지 않았다. 이 테스트는 클라이언트
 * (SettingsPage handleSave)가 보내는 모든 키가 허용목록에 있는지 보장한다.
 */
import { describe, it, expect } from 'vitest';
import { SETTINGS_VALID_KEYS } from '../utils/settingsKeys.js';

// SettingsPage.jsx handleSave가 updateMultipleSettings로 보내는 키 전체.
// 이 목록이 바뀌면 서버 허용목록(SETTINGS_VALID_KEYS)도 함께 갱신해야 한다.
const CLIENT_SAVED_KEYS = [
  'enabled_providers',
  'enabled_models',
  'available_models',
  'image_models',
  'system_prompt',
  'default_daily_limit',
  'tts_enabled',
  'stt_enabled',
  'tts_default_voice',
  'tts_default_model',
  'code_execution_claude',
  'code_execution_openai',
  'code_execution_max_role',
  'student_restricted_models',
];

describe('SETTINGS_VALID_KEYS (관리자 설정 허용목록)', () => {
  it('코드 실행 토글 키 3종을 포함한다', () => {
    expect(SETTINGS_VALID_KEYS).toContain('code_execution_claude');
    expect(SETTINGS_VALID_KEYS).toContain('code_execution_openai');
    expect(SETTINGS_VALID_KEYS).toContain('code_execution_max_role');
  });

  it('클라이언트가 저장하는 모든 키를 허용한다 (키 불일치 시 400 방지)', () => {
    const missing = CLIENT_SAVED_KEYS.filter((k) => !SETTINGS_VALID_KEYS.includes(k));
    expect(missing).toEqual([]);
  });

  it('중복 키가 없다', () => {
    expect(new Set(SETTINGS_VALID_KEYS).size).toBe(SETTINGS_VALID_KEYS.length);
  });
});
