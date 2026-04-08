/**
 * 보안 테스트: SSRF 방지
 * - isPrivateIP: IPv4/IPv6 사설 대역 식별
 * - isInternalUrl: URL 기반 1차 필터
 * - resolvesToPrivateIP: DNS 해석 후 2차 검증
 */
import { describe, it, expect } from 'vitest';
import { isPrivateIP, isInternalUrl, resolvesToPrivateIP } from '../utils/fetchUrl.js';

// ── isPrivateIP ──

describe('isPrivateIP', () => {
  describe('IPv4 사설 대역 차단', () => {
    it.each([
      ['10.0.0.1', true],
      ['10.255.255.255', true],
      ['172.16.0.1', true],
      ['172.31.255.255', true],
      ['192.168.0.1', true],
      ['192.168.255.255', true],
      ['169.254.169.254', true], // AWS 메타데이터
      ['169.254.0.1', true],
      ['127.0.0.1', true],
      ['127.255.255.255', true],
      ['0.0.0.0', true],
    ])('%s → %s', (ip, expected) => {
      expect(isPrivateIP(ip)).toBe(expected);
    });
  });

  describe('IPv4 공인 대역 허용', () => {
    it.each([
      ['8.8.8.8', false],
      ['1.1.1.1', false],
      ['203.0.113.1', false],
      ['172.32.0.1', false], // 172.32는 공인
      ['172.15.255.255', false], // 172.15는 공인
      ['192.167.0.1', false],
    ])('%s → %s', (ip, expected) => {
      expect(isPrivateIP(ip)).toBe(expected);
    });
  });

  describe('IPv6 사설 대역 차단', () => {
    it.each([
      ['::1', true], // loopback
      ['fe80::1', true], // 링크-로컬
      ['fc00::1', true], // ULA
      ['fd12:3456:789a::1', true], // ULA
    ])('%s → %s', (ip, expected) => {
      expect(isPrivateIP(ip)).toBe(expected);
    });
  });

  describe('IPv4-mapped IPv6 차단', () => {
    it('::ffff:127.0.0.1은 사설로 판단', () => {
      expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
    });

    it('::ffff:10.0.0.1은 사설로 판단', () => {
      expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
    });

    it('::ffff:8.8.8.8은 공인으로 판단', () => {
      expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false);
    });
  });
});

// ── isInternalUrl ──

describe('isInternalUrl', () => {
  describe('차단해야 하는 URL', () => {
    it.each([
      'http://localhost/admin',
      'http://127.0.0.1:8080/secret',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://instance-data/',
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/', // AWS 메타데이터
      'file:///etc/passwd',
    ])('%s → 차단', (url) => {
      expect(isInternalUrl(url)).toBe(true);
    });
  });

  describe('허용해야 하는 URL', () => {
    it.each([
      'https://example.com',
      'https://google.com',
      'https://api.openai.com/v1/chat',
      'http://172.32.0.1/', // 공인 대역
    ])('%s → 허용', (url) => {
      expect(isInternalUrl(url)).toBe(false);
    });
  });

  it('잘못된 URL은 안전하게 차단한다', () => {
    expect(isInternalUrl('not-a-url')).toBe(true);
    expect(isInternalUrl('')).toBe(true);
  });
});

// ── resolvesToPrivateIP ──

describe('resolvesToPrivateIP', () => {
  it('IP 주소 직접 입력 시 DNS 해석 없이 사설 대역 판단', async () => {
    expect(await resolvesToPrivateIP('127.0.0.1')).toBe(true);
    expect(await resolvesToPrivateIP('10.0.0.1')).toBe(true);
    expect(await resolvesToPrivateIP('8.8.8.8')).toBe(false);
  });

  it('실존 공인 도메인은 false 반환 (google.com)', async () => {
    const result = await resolvesToPrivateIP('google.com');
    expect(result).toBe(false);
  });

  it('존재하지 않는 도메인은 안전하게 true 반환', async () => {
    const result = await resolvesToPrivateIP('this-domain-does-not-exist-xyz-12345.invalid');
    expect(result).toBe(true);
  });
});
