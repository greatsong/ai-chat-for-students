/**
 * 관리자 설정(PUT /api/teacher/settings)에서 저장을 허용하는 키 목록.
 *
 * 클라이언트(SettingsPage handleSave)가 보내는 키와 정확히 일치해야 한다.
 * 여기서 누락된 키는 서버가 400("유효하지 않은 설정 키")으로 거부하여
 * 해당 설정 토글이 저장되지 않는다(과거 code_execution_* 키 누락 사례).
 */
export const SETTINGS_VALID_KEYS = [
  'enabled_providers',
  'enabled_models',
  'available_models',
  'image_generation_enabled',
  'image_models',
  'system_prompt',
  'default_daily_limit',
  'tts_enabled',
  'stt_enabled',
  'tts_default_voice',
  'tts_default_model',
  // 코드 실행 도구 — codeExecutionGate가 읽고 database.js에 기본값이 정의된 키.
  'code_execution_claude',
  'code_execution_openai',
  'code_execution_max_role',
  // 학생 제한 모델 — modelAccess.js가 읽는 키. 교사·관리자와 premium_models 예외 학생만 사용 가능.
  'student_restricted_models',
];
