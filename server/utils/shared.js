// AI 프로바이더 정의
export const PROVIDERS = {
  claude: {
    name: 'Claude',
    company: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'standard' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', tier: 'standard' },
      { id: 'claude-opus-5', name: 'Claude Opus 5', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: false, codeExecution: true, imageGeneration: false },
  },
  gemini: {
    name: 'Gemini',
    company: 'Google',
    models: [
      { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', tier: 'standard' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', tier: 'standard' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: true, codeExecution: true, imageGeneration: true },
    imageModel: 'gemini-3.1-flash-image',
  },
  openai: {
    name: 'ChatGPT',
    company: 'OpenAI',
    // gpt-5.5-pro(추론 모델)는 첫 토큰까지 ~3분 침묵해 스트리밍 연결이 끊기므로 미노출.
    // gpt-5.6 계열은 서버에서 reasoning을 none/low로 강제해 지연을 줄인다(openai.js 참고).
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5', tier: 'standard' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna (빠름·저비용)', tier: 'standard' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra (균형)', tier: 'standard' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol (고성능·추론off)', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: false, codeExecution: true, imageGeneration: true },
    imageModel: 'gpt-image-2',
  },
  solar: {
    name: 'Solar',
    company: 'Upstage',
    // solar-open2는 추론 모델이라 첫 토큰까지 침묵이 길다(수십초~2분). 한국어 품질은 최상급이나
    // 실시간 채팅에선 응답이 느리게 시작될 수 있음 — 옵션으로만 제공(기본값 아님).
    models: [
      { id: 'solar-pro4', name: 'Solar Pro 4', tier: 'standard' },
      { id: 'solar-open2', name: 'Solar Open2 (한국어 특화·느림)', tier: 'standard' },
    ],
    features: { vision: false, webSearch: false, codeExecution: false, imageGeneration: false },
  },
};

// 역할
export const ROLES = { STUDENT: 'student', TEACHER: 'teacher' };

// 메시지 역할
export const MESSAGE_ROLES = { USER: 'user', ASSISTANT: 'assistant' };

// 기본 설정
export const DEFAULTS = {
  DAILY_LIMIT: 100000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  FIRST_VISIT_MESSAGE:
    '여러분이 바르게 AI를 사용하도록 돕고, AI를 활용하여 자기주도적으로 깊이있게 학습하고 탐구하는 모습을 칭찬하고 격려하기 위해 채팅 내용은 기록됩니다. 따라서 학습 목적 외에 AI를 활용하거나 모든 것을 AI에게 맡기는 형태로 AI를 사용하지 않길 바랍니다.',
};

// 텍스트 파일 확장자 (서버에서 텍스트로 읽을 수 있는 파일)
export const TEXT_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.env',
  '.ini',
  '.toml',
  '.cfg',
  '.r',
  '.R',
  '.ipynb',
  '.log',
  '.gitignore',
];

// 이미지 MIME 타입 (Vision API 지원)
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// PDF MIME 타입
export const PDF_MIME_TYPE = 'application/pdf';
