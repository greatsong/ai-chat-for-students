/**
 * CSV 셀 변환. 학생이 정한 대화 제목 같은 값이 엑셀에서 수식으로 실행되지 않도록
 * =, +, -, @, 탭, CR로 시작하는 값 앞에 작은따옴표를 붙인다.
 */
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
