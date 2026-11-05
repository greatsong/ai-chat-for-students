import multer from 'multer';

/**
 * 마지막 오류 처리기
 * - 응답: 스택·내부 메시지 없이 JSON만 돌려준다.
 * - 로그: 4xx는 남기지 않는다. body-parser의 JSON 구문 오류 메시지에는 요청 본문 일부가 들어 있다.
 */
export function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? '파일 크기가 허용 한도를 넘었습니다.'
        : '파일 업로드 요청이 올바르지 않습니다.',
    });
  }

  if (err.publicMessage) {
    return res.status(err.status || 400).json({ error: err.publicMessage });
  }

  const status = err.status || err.statusCode || 500;
  if (status === 413) {
    return res.status(413).json({ error: '요청 크기가 허용 한도를 넘었습니다.' });
  }
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: '요청 형식이 올바르지 않습니다.' });
  }

  console.error(`[error] ${req.method} ${req.path}`, err);
  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
}
