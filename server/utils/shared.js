// AI 프로바이더 정의
export const PROVIDERS = {
  claude: {
    name: 'Claude',
    company: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'standard' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: false, codeExecution: false, imageGeneration: false },
  },
  gemini: {
    name: 'Gemini',
    company: 'Google',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', tier: 'standard' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: true, codeExecution: true, imageGeneration: true },
    imageModel: 'gemini-3.1-flash-image-preview',
  },
  openai: {
    name: 'ChatGPT',
    company: 'OpenAI',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', tier: 'standard' },
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', tier: 'advanced' },
    ],
    features: { vision: true, webSearch: true, codeExecution: false, imageGeneration: true },
    imageModel: 'gpt-image-1.5',
  },
  solar: {
    name: 'Solar',
    company: 'Upstage',
    models: [
      { id: 'solar-pro3', name: 'Solar Pro 3', tier: 'standard' },
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
  FIRST_VISIT_MESSAGE: '여러분이 바르게 AI를 사용하도록 돕고, AI를 활용하여 자기주도적으로 깊이있게 학습하고 탐구하는 모습을 칭찬하고 격려하기 위해 채팅 내용은 기록됩니다. 따라서 학습 목적 외에 AI를 활용하거나 모든 것을 AI에게 맡기는 형태로 AI를 사용하지 않길 바랍니다.',
};

// 텍스트 파일 확장자 (서버에서 텍스트로 읽을 수 있는 파일)
export const TEXT_FILE_EXTENSIONS = [
  '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h',
  '.html', '.css', '.scss', '.less',
  '.sql', '.sh', '.bash', '.zsh',
  '.env', '.ini', '.toml', '.cfg',
  '.r', '.R', '.ipynb',
  '.log', '.gitignore',
];

// 이미지 MIME 타입 (Vision API 지원)
export const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
];

// PDF MIME 타입
export const PDF_MIME_TYPE = 'application/pdf';
