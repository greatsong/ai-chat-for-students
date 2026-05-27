import { describe, it, expect } from 'vitest';
import {
  sampleTextFile,
  sampleLargeTextFiles,
  buildSamplingNotice,
} from '../utils/largeFileSampler.js';

function makeCsv(rows, cols = 5) {
  const header = Array.from({ length: cols }, (_, i) => `col${i + 1}`).join(',');
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    lines.push(Array.from({ length: cols }, (_, c) => `${i}_${c}`).join(','));
  }
  return lines.join('\n');
}

describe('largeFileSampler', () => {
  it('작은 텍스트는 샘플링하지 않는다', () => {
    const file = { type: 'text', name: 'small.txt', data: '안녕하세요' };
    const { sampled, data } = sampleTextFile(file);
    expect(sampled).toBe(false);
    expect(data).toBe('안녕하세요');
  });

  it('큰 CSV는 헤더 + 앞뒤 행으로 샘플링한다', () => {
    const csv = makeCsv(5000, 6);
    const file = { type: 'text', name: 'big.csv', data: csv };
    const { sampled, data } = sampleTextFile(file, { maxTokens: 1000 });
    expect(sampled).toBe(true);
    expect(data).toContain('자동 샘플링됨');
    expect(data).toContain('총 데이터 행: 5,000행');
    expect(data).toContain('컬럼 수: 6개');
    expect(data).toContain('col1,col2,col3,col4,col5,col6');
    expect(data).toContain('[처음 50행]');
    expect(data).toContain('[마지막 50행]');
    // 첫 행과 마지막 행 모두 포함
    expect(data).toContain('0_0,0_1');
    expect(data).toContain('4999_0,4999_1');
    // 중간 행은 빠짐
    expect(data).not.toContain('2500_0,2500_1');
  });

  it('큰 비-구조 텍스트는 앞/뒤 문자 발췌로 샘플링한다', () => {
    const text = 'A'.repeat(200_000) + 'MIDDLE_MARKER' + 'B'.repeat(200_000);
    const file = { type: 'text', name: 'big.txt', data: text };
    const { sampled, data } = sampleTextFile(file, { maxTokens: 1000 });
    expect(sampled).toBe(true);
    expect(data).toContain('자동 샘플링됨');
    expect(data).toContain('처음');
    expect(data).toContain('마지막');
    expect(data).not.toContain('MIDDLE_MARKER');
  });

  it('이미지/PDF는 건드리지 않는다', () => {
    const files = [
      { type: 'image', name: 'a.png', data: 'base64data', mimeType: 'image/png' },
      { type: 'pdf', name: 'b.pdf', data: 'pdfbase64', mimeType: 'application/pdf' },
    ];
    const { files: out, sampledFiles } = sampleLargeTextFiles(files);
    expect(out).toEqual(files);
    expect(sampledFiles).toEqual([]);
  });

  it('여러 파일 중 큰 텍스트만 변환하고 메타데이터를 반환한다', () => {
    const files = [
      { type: 'text', name: 'small.txt', data: 'hello' },
      { type: 'text', name: 'big.csv', data: makeCsv(3000, 4) },
    ];
    const { files: out, sampledFiles } = sampleLargeTextFiles(files, { maxTokens: 500 });
    expect(out[0].data).toBe('hello');
    expect(out[1].data).toContain('자동 샘플링됨');
    expect(sampledFiles).toHaveLength(1);
    expect(sampledFiles[0].name).toBe('big.csv');
    expect(sampledFiles[0].originalChars).toBeGreaterThan(1000);
  });

  it('안내문은 코드 제공을 지시한다', () => {
    const notice = buildSamplingNotice([{ name: 'big.csv', originalChars: 3_400_000 }]);
    expect(notice).toContain('big.csv');
    expect(notice).toContain('Python');
    expect(notice).toContain('샘플링');
    // 직접 계산하지 말라는 지시 포함
    expect(notice).toMatch(/직접.*하지 마/);
  });

  it('빈 배열이면 빈 결과를 반환한다', () => {
    const { files, sampledFiles } = sampleLargeTextFiles([]);
    expect(files).toEqual([]);
    expect(sampledFiles).toEqual([]);
  });
});
