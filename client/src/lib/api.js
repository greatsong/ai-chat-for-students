const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * 인증 토큰 가져오기
 */
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 401 응답 처리 (토큰 만료 등)
 */
function handleUnauthorized() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * 응답 처리 공통 로직
 */
async function handleResponse(response) {
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `요청 실패 (${response.status})`);
  }

  return response.json();
}

/**
 * GET 요청
 * @param {string} path - API 경로 (예: '/conversations')
 */
export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  });
  return handleResponse(response);
}

/**
 * POST 요청
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 */
export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

/**
 * PATCH 요청
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 */
export async function apiPatch(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

/**
 * PUT 요청
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 */
export async function apiPut(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

/**
 * DELETE 요청
 * @param {string} path - API 경로
 * @param {object} [body] - 선택적 요청 본문
 */
export async function apiDelete(path, body) {
  const options = {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  };

  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  return handleResponse(response);
}

/**
 * 파일 업로드 (FormData)
 * @param {File} file - 브라우저 File 객체
 * @returns {Promise<{id, name, size, mimeType, type, content}>}
 */
export async function apiUploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  return handleResponse(response);
}

/**
 * SSE 버퍼에서 완성된 data 라인을 파싱하여 콜백 호출
 * @param {string} raw - 파싱할 텍스트
 * @param {function} onChunk - 콜백
 * @returns {string} 누적된 텍스트 content
 */
function parseSSELines(raw, onChunk) {
  let text = '';
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(line.slice(6));
      if (parsed.type === 'text') {
        text += parsed.content;
      }
      onChunk(parsed);
    } catch {
      // JSON 파싱 실패 시 무시
    }
  }
  return text;
}

/**
 * POST 요청 + SSE 스트리밍 응답 처리
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 * @param {function} onChunk - 각 SSE 이벤트에 대한 콜백 ({type, content, usage, message, conversationId})
 * @param {object} [options] - 추가 옵션
 * @param {number} [options.timeoutMs=30000] - 요청 타임아웃 (ms)
 * @param {function} [options.onError] - 스트림 에러 복구 콜백
 * @returns {Promise<string>} 전체 누적 텍스트
 */
export async function apiStreamPost(path, body, onChunk, options = {}) {
  const { timeoutMs = 30000, onError } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let reader;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `요청 실패 (${response.status})`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 완성된 이벤트 블록(\n\n)까지만 파싱, 나머지는 버퍼에 유지
      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline === -1) continue;

      const complete = buffer.slice(0, lastDoubleNewline);
      buffer = buffer.slice(lastDoubleNewline + 2);

      fullText += parseSSELines(complete, onChunk);
    }

    // 남은 버퍼 처리
    if (buffer.trim()) {
      fullText += parseSSELines(buffer, onChunk);
    }

    return fullText;
  } catch (error) {
    clearTimeout(timeoutId);
    // 스트림 리더 정리
    if (reader) {
      try {
        reader.cancel();
      } catch {
        // 이미 닫힌 경우 무시
      }
    }
    if (onError) onError(error);
    throw error;
  }
}
