// 사용량 집계와 일일 한도의 날짜 기준. 학교가 한국에 있으므로 한국 시간 자정에 하루가 바뀐다.
// toISOString()은 UTC라서 그대로 쓰면 한국 시간 오전 9시에 날짜가 바뀐다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 한국 시간 기준 날짜 문자열 (YYYY-MM-DD)
 * @param {Date} [now]
 * @returns {string}
 */
export function kstDate(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 한국 시간 기준으로 n일 전 날짜 문자열 (YYYY-MM-DD)
 * @param {number} days
 * @param {Date} [now]
 * @returns {string}
 */
export function kstDateDaysAgo(days, now = new Date()) {
  return kstDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}
