// 업로드 전 이미지 축소. 설계: docs/DESIGN-attachment-tokens.md 3-3
//
// 휴대폰 사진을 원본 그대로 올리면 요청 본문과 DB가 커지고(운영 평균 base64 1.3MB),
// 5MB를 넘는 사진은 Claude가 400으로 거부해 그 대화가 막힌다. Claude는 긴 변 1,568px까지만 보므로
// 그 크기로 줄여도 AI가 보는 내용은 같다.

export const MAX_IMAGE_EDGE = 1568;
const JPEG_QUALITY = 0.85;
// 이보다 작고 이미 충분히 작은 사진은 그대로 둔다
const SKIP_BELOW_BYTES = 300 * 1024;

/**
 * 이미지 파일을 긴 변 1,568px 이하 JPEG로 줄인다. 줄일 필요가 없거나 실패하면 원본을 돌려준다.
 * GIF는 움직임이 사라지므로 건드리지 않는다.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function resizeImageForUpload(file) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    const longEdge = Math.max(width, height);
    if (longEdge <= MAX_IMAGE_EDGE && file.size <= SKIP_BELOW_BYTES) return file;

    const scale = Math.min(1, MAX_IMAGE_EDGE / longEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    // 투명 PNG가 JPEG로 바뀔 때 검게 나오지 않도록 흰 바탕을 깐다
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
