import { z } from 'zod';

/**
 * Zod 스키마 기반 요청 검증 미들웨어 팩토리
 * @param {z.ZodSchema} schema
 * @param {'body'|'query'|'params'} source - 검증 대상
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error?.errors?.map((e) => `${e.path.join('.')}: ${e.message}`) || [
        '유효하지 않은 요청',
      ];
      return res.status(400).json({ error: '입력값이 유효하지 않습니다.', details: errors });
    }
    req[source] = result.data; // 정제된 데이터로 교체
    next();
  };
}

// ── 공통 스키마 ──

// 채팅 요청
export const chatSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  message: z.string().min(1).max(50000),
  provider: z.enum(['claude', 'gemini', 'openai', 'solar']).default('claude'),
  model: z.string().max(100).optional().nullable(),
  files: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(500),
        type: z.enum(['image', 'pdf', 'text', 'unsupported']),
        mimeType: z.string().max(200),
        content: z.string().optional().nullable(),
        data: z.string().optional().nullable(),
      }),
    )
    .max(10)
    .optional()
    .nullable(),
  web_search: z.boolean().default(false),
  code_execution: z.boolean().default(false),
});

// 학생 업데이트
export const studentUpdateSchema = z.object({
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  daily_limit: z.number().int().min(0).max(10000000).optional(),
});

// 설정 업데이트
export const settingsUpdateSchema = z
  .object({
    key: z
      .enum([
        'enabled_providers',
        'enabled_models',
        'image_generation_enabled',
        'system_prompt',
        'default_daily_limit',
      ])
      .optional(),
    value: z.unknown().optional(),
  })
  .passthrough();

// API 키 업데이트
export const apiKeyUpdateSchema = z.object({
  provider: z.enum(['anthropic', 'google', 'openai', 'upstage']),
  apiKey: z.string().max(2000),
});

// 교사 이메일
export const teacherEmailSchema = z.object({
  email: z.string().email().max(200),
});

// 대화 목록 쿼리
export const conversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  student_id: z.string().uuid().optional(),
});

// Google 로그인
export const googleAuthSchema = z.object({
  credential: z.string().min(1).max(10000),
});
