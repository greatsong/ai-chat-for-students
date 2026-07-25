import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from '../utils/apiKeys.js';
import { withRetry } from '../utils/retry.js';

let cachedKey = null;
let anthropic = null;

async function getClient() {
  const key = await getApiKey('anthropic');
  if (!anthropic || key !== cachedKey) {
    cachedKey = key;
    anthropic = new Anthropic({ apiKey: key });
  }
  return anthropic;
}

/**
 * 파일을 Anthropic 콘텐츠 블록으로 변환
 * @param {Array} files - [{type, data, mimeType, name}]
 * @returns {Array} Anthropic content blocks
 */
function filesToContentBlocks(files) {
  if (!files || files.length === 0) return [];

  const blocks = [];

  for (const f of files) {
    if (f.type === 'image') {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: f.mimeType,
          data: f.data,
        },
      });
    } else if (f.type === 'pdf') {
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: f.data,
        },
      });
    } else if (f.type === 'text') {
      blocks.push({
        type: 'text',
        text: `[파일: ${f.name}]\n${f.data}`,
      });
    }
  }

  return blocks;
}

/**
 * 대화 기록에서 Anthropic 메시지 배열 생성
 * @param {Array} history - DB에서 조회한 메시지 배열
 * @returns {Array} Anthropic messages format
 */
export function buildMessages(history) {
  return history.map((msg) => {
    if (msg.role === 'user' && msg.files) {
      let files = [];
      try {
        files = typeof msg.files === 'string' ? JSON.parse(msg.files) : msg.files;
      } catch {
        // 파싱 실패 시 빈 배열
      }

      if (files.length > 0) {
        console.log(
          `[claude.buildMessages] 파일 ${files.length}개:`,
          files.map((f) => ({
            type: f.type,
            mimeType: f.mimeType,
            name: f.name,
            dataLen: f.data?.length || 0,
          })),
        );
        const contentBlocks = filesToContentBlocks(files);
        console.log(`[claude.buildMessages] 콘텐츠 블록 ${contentBlocks.length}개 생성`);
        // 빈 텍스트 블록은 Claude API가 거부하므로, 내용이 있을 때만 추가
        if (msg.content && msg.content.trim()) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        return { role: 'user', content: contentBlocks };
      }
    }

    // 빈 content는 Claude API가 거부하므로 기본값 제공
    return { role: msg.role, content: msg.content || ' ' };
  });
}

// 코드 실행 server_tool_use 블록 이름 (버전별)
//   - 현재(_20250825+): bash_code_execution, text_editor_code_execution
//   - 레거시(_20250522): code_execution
const CODE_TOOL_NAMES = ['code_execution', 'bash_code_execution', 'text_editor_code_execution'];

/**
 * 최종 메시지 content 블록에서 코드 실행 도구 사용/결과를 사람이 읽을 텍스트로 변환
 *
 * 도구 버전별로 결과 블록 타입이 다르므로 둘 다 처리한다:
 *   - 현재(_20250825 이상, _20260120/_20260521 포함):
 *       bash_code_execution_tool_result / text_editor_code_execution_tool_result
 *       (content.type: bash_code_execution_result 등, stdout/stderr/return_code)
 *   - 레거시(_20250522, Python 전용):
 *       code_execution_tool_result (content.type: code_execution_result)
 *
 * @param {Array} contentBlocks - finalMessage.content
 * @returns {string} 마크다운 형식 텍스트 (실행 코드 + 결과)
 */
export function extractCodeExecutionOutput(contentBlocks) {
  const parts = [];

  for (const block of contentBlocks) {
    const type = block?.type;

    // 1) 실행한 코드/명령
    if (type === 'server_tool_use' && CODE_TOOL_NAMES.includes(block.name)) {
      const code = block.input?.code ?? block.input?.command ?? '';
      if (code) {
        parts.push(`\n\n**실행한 코드:**\n\`\`\`\n${code}\n\`\`\``);
      }
      continue;
    }

    // 2) 실행 결과 — bash(현재) + 레거시 둘 다
    if (type === 'bash_code_execution_tool_result' || type === 'code_execution_tool_result') {
      const content = block.content;
      // 에러 형태 (content.type이 *_error 이거나 error_code 보유)
      if (content?.type?.endsWith('_error') || content?.error_code) {
        parts.push(`\n\n**실행 오류:** ${content.error_code || content.type || 'unknown'}`);
        continue;
      }
      const stdout = content?.stdout || '';
      const stderr = content?.stderr || '';
      const rc = content?.return_code;
      let body = stdout;
      if (stderr) body += (body ? '\n' : '') + `[stderr] ${stderr}`;
      if (!body) body = '(출력 없음)';
      const rcText = rc !== undefined && rc !== null ? ` (return code: ${rc})` : '';
      parts.push(`\n\n**실행 결과**${rcText}:\n\`\`\`\n${body}\n\`\`\``);
      continue;
    }

    // 3) 파일 작업 결과 (현재 버전 text_editor)
    if (type === 'text_editor_code_execution_tool_result') {
      const content = block.content;
      if (content?.type?.endsWith('_error') || content?.error_code) {
        parts.push(`\n\n**파일 작업 오류:** ${content.error_code || 'unknown'}`);
        continue;
      }
      const fileContent = content?.content;
      if (typeof fileContent === 'string' && fileContent) {
        parts.push(`\n\n**파일 내용:**\n\`\`\`\n${fileContent}\n\`\`\``);
      }
      continue;
    }
  }

  return parts.join('');
}

/**
 * Claude 스트리밍 채팅
 * @param {Object} params
 * @param {Array} params.messages - Anthropic 포맷 메시지 배열
 * @param {string} params.systemPrompt - 시스템 프롬프트
 * @param {string} params.model - 모델 ID
 * @param {Function} params.onText - 텍스트 청크 콜백
 * @param {Function} params.onDone - 완료 콜백 ({ fullContent, inputTokens, outputTokens })
 * @param {Function} params.onError - 에러 콜백
 * @param {Object} [params.options] - { codeExecution: boolean }
 */
export async function streamChat({
  messages,
  systemPrompt,
  model,
  onText,
  onDone,
  onError,
  options = {},
}) {
  try {
    // 디버그: 메시지 구조 확인 (base64 데이터는 길이만 표시)
    const debugMessages = messages.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map((block) => {
            if (block.type === 'image') {
              return {
                type: 'image',
                media_type: block.source?.media_type,
                dataLen: block.source?.data?.length || 0,
              };
            }
            if (block.type === 'document') {
              return {
                type: 'document',
                media_type: block.source?.media_type,
                dataLen: block.source?.data?.length || 0,
              };
            }
            return { type: block.type, textLen: block.text?.length || 0 };
          }),
        };
      }
      return { role: m.role, contentLen: (m.content || '').length };
    });
    console.log('[claude.streamChat] 메시지 구조:', JSON.stringify(debugMessages));

    const streamParams = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: 16384,
      messages,
    };

    // Sonnet 5·Opus 5는 thinking 파라미터를 생략하면 adaptive thinking이 켜져
    // 첫 토큰까지 지연이 커진다 → Vercel 120초 프록시에서 SSE 502 위험
    // (gpt-5.5-pro 추론 모델과 동일한 실패 패턴). 다른 모델(4.6)처럼
    // 빠른 스트리밍 응답을 보장하기 위해 thinking을 명시적으로 끈다.
    // 주의: Opus 5는 disabled + effort xhigh/max 조합이 400 에러 —
    // effort를 별도 지정하지 않으므로(기본 high) 현재 조합은 유효하다.
    if ((model || '').startsWith('claude-sonnet-5') || (model || '').startsWith('claude-opus-5')) {
      streamParams.thinking = { type: 'disabled' };
    }

    if (systemPrompt) {
      streamParams.system = systemPrompt;
    }

    // 코드 실행 도구 (선택) — Claude가 샌드박스에서 코드를 실행해 데이터 분석.
    // _20260521: 최신 버전(_20260120과 동일 런타임 + 셀당 90초 제한을 모델에 노출).
    // 결과는 bash_code_execution_tool_result 블록으로 옴 → extractCodeExecutionOutput 참고.
    if (options.codeExecution) {
      streamParams.tools = [{ type: 'code_execution_20260521', name: 'code_execution' }];
      console.log('[claude.streamChat] 코드 실행 도구 활성화');
    }

    const client = await getClient();
    const stream = client.messages.stream(streamParams);

    let fullContent = '';

    stream.on('text', (text) => {
      fullContent += text;
      onText(text);
    });

    stream.on('finalMessage', (message) => {
      // 코드 실행 결과 블록은 text 이벤트로 안 옴 — 최종 메시지에서 직접 추출해 추가
      if (options.codeExecution) {
        const toolOutput = extractCodeExecutionOutput(message.content || []);
        if (toolOutput) {
          fullContent += toolOutput;
          onText(toolOutput);
        }
      }
      const inputTokens = message.usage?.input_tokens || 0;
      const outputTokens = message.usage?.output_tokens || 0;
      onDone({ fullContent, inputTokens, outputTokens });
    });

    stream.on('error', (error) => {
      stream.abort();
      onError(error);
    });

    // 스트림 완료 대기
    await stream.finalMessage();
  } catch (error) {
    onError(error);
  }
}
