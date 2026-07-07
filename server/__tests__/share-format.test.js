import { describe, it, expect } from 'vitest';
import { hashToken } from '../utils/crypto.js';
import { buildSharedTurn, buildSharedTurns } from '../utils/shareFormat.js';

describe('hashToken', () => {
  it('동일 입력 → 동일 sha256 hex (64자리)', () => {
    const raw = 'a'.repeat(64);
    const h = hashToken(raw);
    expect(h).toBe(hashToken(raw));
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('다른 입력 → 다른 해시', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('원문이 해시에 남지 않는다(단방향)', () => {
    const raw = 'secret-raw-token';
    expect(hashToken(raw)).not.toContain(raw);
  });
});

describe('buildSharedTurn', () => {
  it('user 역할은 user 로 매핑', () => {
    const t = buildSharedTurn({ role: 'user', content: '안녕', created_at: 't1' });
    expect(t).toEqual({ role: 'user', content: '안녕', created_at: 't1' });
  });

  it('assistant 역할은 ai 로 매핑', () => {
    const t = buildSharedTurn({ role: 'assistant', content: '답변', created_at: 't2' });
    expect(t.role).toBe('ai');
  });

  it('이미지 생성 메시지는 URL 대신 마커로 표기', () => {
    const t = buildSharedTurn({
      role: 'assistant',
      content: '바다 그림',
      image_url: 'https://secret/img.png',
      created_at: 't3',
    });
    expect(t.content).toBe('[생성된 이미지] 바다 그림');
    expect(t.content).not.toContain('secret');
  });

  it('캡션 없는 이미지 메시지는 마커만', () => {
    const t = buildSharedTurn({ role: 'assistant', image_url: 'x', content: '', created_at: 't' });
    expect(t.content).toBe('[생성된 이미지]');
  });

  it('첨부 파일은 파일명만 라인으로 추가 (base64 미노출)', () => {
    const t = buildSharedTurn({
      role: 'user',
      content: '이 파일 봐줘',
      files: JSON.stringify([{ original_name: '자료.pdf', data: 'BASE64BLOB' }]),
      created_at: 't',
    });
    expect(t.content).toBe('이 파일 봐줘\n📎 첨부: 자료.pdf');
    expect(t.content).not.toContain('BASE64BLOB');
  });

  it('깨진 files JSON 은 조용히 무시', () => {
    const t = buildSharedTurn({ role: 'user', content: '본문', files: '{깨짐', created_at: 't' });
    expect(t.content).toBe('본문');
  });
});

describe('buildSharedTurns', () => {
  it('system 등 user/assistant 이외 역할은 제외', () => {
    const turns = buildSharedTurns([
      { role: 'system', content: '요약', created_at: 't0' },
      { role: 'user', content: '질문', created_at: 't1' },
      { role: 'assistant', content: '응답', created_at: 't2' },
    ]);
    expect(turns.map((t) => t.role)).toEqual(['user', 'ai']);
  });

  it('배열이 아니면 빈 배열', () => {
    expect(buildSharedTurns(null)).toEqual([]);
    expect(buildSharedTurns(undefined)).toEqual([]);
  });
});
