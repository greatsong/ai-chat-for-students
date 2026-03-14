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
 */
export async function apiDelete(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });
  return handleResponse(response);
}

/**
 * POST 요청 + SSE 스트리밍 응답 처리
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 * @param {function} onChunk - 각 SSE 이벤트에 대한 콜백 ({type, content, usage, message, conversationId})
 * @returns {Promise<string>} 전체 누적 텍스트
 */
export async function apiStreamPost(path, body, onChunk) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `요청 실패 (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE 이벤트 파싱: "data: {...}\n\n"
    const lines = buffer.split('\n');
    buffer = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 마지막 줄이 완전하지 않을 수 있음
      if (i === lines.length - 1 && !buffer.endsWith('\n')) {
        buffer = line;
        continue;
      }

      if (!line.startsWith('data: ')) continue;

      try {
        const jsonStr = line.slice(6); // "data: " 제거
        const parsed = JSON.parse(jsonStr);

        if (parsed.type === 'text') {
          fullText += parsed.content;
        }

        onChunk(parsed);
      } catch {
        // JSON 파싱 실패 시 무시
      }
    }
  }

  // 남은 버퍼 처리
  if (buffer) {
    const remainingLines = buffer.split('\n');
    for (const line of remainingLines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'text') {
          fullText += parsed.content;
        }
        onChunk(parsed);
      } catch {
        // 무시
      }
    }
  }

  return fullText;
}
