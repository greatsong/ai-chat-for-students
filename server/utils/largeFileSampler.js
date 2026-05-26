import { estimateTokens } from './tokenEstimator.js';

// 단일 텍스트 첨부의 최대 토큰 (초과 시 샘플링)
// 1M 컨텍스트 모델 기준, 파일 외 대화 여유분을 충분히 남김
const DEFAULT_MAX_TOKENS_PER_FILE = 80_000;

// CSV/TSV 샘플링 시 앞/뒤 보존 행 수
const HEAD_ROWS = 50;
const TAIL_ROWS = 50;

// 비-구조 텍스트 샘플링 시 앞/뒤 보존 문자 수
const HEAD_CHARS = 60_000;
const TAIL_CHARS = 20_000;

function detectDelimiter(text) {
  // 처음 4KB만 보고 콤마/탭 빈도로 판별
  const head = text.slice(0, 4096);
  const firstLines = head.split(/\r?\n/).slice(0, 5).filter(Boolean);
  if (firstLines.length < 2) return null;

  const counts = (delim) =>
    firstLines.map(
      (line) => (line.match(new RegExp(delim === '\t' ? '\\t' : delim, 'g')) || []).length,
    );

  const commaCounts = counts(',');
  const tabCounts = counts('\t');

  const isConsistent = (arr) => arr[0] > 0 && arr.every((n) => n === arr[0]);

  if (isConsistent(tabCounts)) return '\t';
  if (isConsistent(commaCounts)) return ',';
  return null;
}

function sampleStructured(text, delimiter) {
  const lines = text.split(/\r?\n/);
  // 마지막 공백 줄 제거
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const header = lines[0] || '';
  const dataLines = lines.slice(1);
  const totalRows = dataLines.length;
  const columns = header ? header.split(delimiter).map((c) => c.trim()) : [];

  if (totalRows <= HEAD_ROWS + TAIL_ROWS) {
    return null; // 샘플링 불필요
  }

  const headRows = dataLines.slice(0, HEAD_ROWS);
  const tailRows = dataLines.slice(-TAIL_ROWS);
  const skipped = totalRows - HEAD_ROWS - TAIL_ROWS;

  const delimLabel = delimiter === '\t' ? 'TSV' : 'CSV';
  return [
    `[자동 샘플링됨 — 원본 ${delimLabel} 파일이 너무 커서 일부만 발췌해 전달합니다.]`,
    `- 원본 크기: ${text.length.toLocaleString()}자`,
    `- 총 데이터 행: ${totalRows.toLocaleString()}행`,
    `- 컬럼 수: ${columns.length}개 (${columns.slice(0, 12).join(', ')}${columns.length > 12 ? ', ...' : ''})`,
    `- 표시 범위: 헤더 + 처음 ${HEAD_ROWS}행 + 마지막 ${TAIL_ROWS}행 (중간 ${skipped.toLocaleString()}행 생략)`,
    '',
    '[헤더]',
    header,
    '',
    `[처음 ${HEAD_ROWS}행]`,
    headRows.join('\n'),
    '',
    `[중간 ${skipped.toLocaleString()}행 생략]`,
    '',
    `[마지막 ${TAIL_ROWS}행]`,
    tailRows.join('\n'),
  ].join('\n');
}

function sampleUnstructured(text) {
  if (text.length <= HEAD_CHARS + TAIL_CHARS) return null;
  const head = text.slice(0, HEAD_CHARS);
  const tail = text.slice(-TAIL_CHARS);
  const skipped = text.length - HEAD_CHARS - TAIL_CHARS;

  return [
    '[자동 샘플링됨 — 원본 텍스트 파일이 너무 커서 일부만 발췌해 전달합니다.]',
    `- 원본 크기: ${text.length.toLocaleString()}자`,
    `- 표시 범위: 처음 ${HEAD_CHARS.toLocaleString()}자 + 마지막 ${TAIL_CHARS.toLocaleString()}자 (중간 ${skipped.toLocaleString()}자 생략)`,
    '',
    `[처음 ${HEAD_CHARS.toLocaleString()}자]`,
    head,
    '',
    `[중간 ${skipped.toLocaleString()}자 생략]`,
    '',
    `[마지막 ${TAIL_CHARS.toLocaleString()}자]`,
    tail,
  ].join('\n');
}

/**
 * 텍스트 파일 한 개를 필요 시 샘플링
 * @returns {{ sampled: boolean, data: string }}
 */
export function sampleTextFile(file, { maxTokens = DEFAULT_MAX_TOKENS_PER_FILE } = {}) {
  const text = file.data || '';
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) {
    return { sampled: false, data: text };
  }

  const delimiter = detectDelimiter(text);
  const sampled = delimiter ? sampleStructured(text, delimiter) : sampleUnstructured(text);

  if (!sampled) {
    return { sampled: false, data: text };
  }

  return { sampled: true, data: sampled };
}

/**
 * 첨부 파일 배열 전체를 검사해 큰 텍스트 파일은 샘플링으로 대체
 * @param {Array} files - [{type, data, mimeType, name}]
 * @param {object} options
 * @returns {{ files: Array, sampledFiles: Array<{name: string, originalChars: number}> }}
 */
export function sampleLargeTextFiles(files, options = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    return { files: files || [], sampledFiles: [] };
  }

  const sampledFiles = [];
  const newFiles = files.map((f) => {
    if (f.type !== 'text') return f;
    const { sampled, data } = sampleTextFile(f, options);
    if (!sampled) return f;
    sampledFiles.push({ name: f.name, originalChars: (f.data || '').length });
    return { ...f, data };
  });

  return { files: newFiles, sampledFiles };
}

/**
 * 샘플링된 파일 안내문(시스템 프롬프트에 덧붙일 용도)
 */
export function buildSamplingNotice(sampledFiles) {
  if (!sampledFiles || sampledFiles.length === 0) return '';
  const list = sampledFiles
    .map((f) => `- ${f.name} (원본 ${f.originalChars.toLocaleString()}자)`)
    .join('\n');
  return [
    '[중요 안내 — 첨부 파일 일부가 자동 샘플링되었습니다]',
    list,
    '',
    '위 파일들은 한 번에 처리할 수 있는 분량을 초과하여, 헤더 + 앞뒤 일부 행만 전달되었습니다.',
    '',
    '응답 지침:',
    '1. 전체 데이터를 직접 합산·평균·필터링하지 마세요. 전달된 일부만 봤기 때문에 결과가 정확하지 않습니다.',
    '2. 사용자가 "분석해줘"라고 했다면, 직접 답을 내려 하지 말고 **사용자가 본인 컴퓨터에서 실행할 수 있는 Python(권장) 또는 JavaScript 코드**를 제공하세요.',
    '3. 코드는 원본 파일 경로/이름을 그대로 읽도록 작성하고, 무엇을 하는 코드인지 한국어로 짧게 설명해 주세요.',
    '4. 샘플로 받은 데이터에서 컬럼 구조·자료형은 자유롭게 설명해도 됩니다.',
  ].join('\n');
}
