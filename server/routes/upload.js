import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { TEXT_FILE_EXTENSIONS, IMAGE_MIME_TYPES, PDF_MIME_TYPE, DEFAULTS } from '../utils/shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

// uploads 디렉토리 생성
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// multer 설정 — disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// 허용된 MIME 타입 화이트리스트
const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  PDF_MIME_TYPE,
  'text/plain', 'text/csv', 'text/markdown',
  'application/json', 'application/xml',
  'text/html', 'text/css', 'text/javascript',
  'application/x-yaml',
];

const upload = multer({
  storage,
  limits: {
    fileSize: DEFAULTS.MAX_FILE_SIZE, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // MIME 타입 검사
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    // 텍스트 파일은 확장자로도 허용
    const ext = extname(file.originalname).toLowerCase();
    if (TEXT_FILE_EXTENSIONS.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('허용되지 않는 파일 형식입니다.'));
  },
});

const router = Router();

/**
 * 파일 타입 판별
 * @param {string} mimeType
 * @param {string} originalName
 * @returns {'image' | 'pdf' | 'text' | 'binary'}
 */
function getFileType(mimeType, originalName) {
  if (IMAGE_MIME_TYPES.includes(mimeType)) {
    return 'image';
  }
  if (mimeType === PDF_MIME_TYPE) {
    return 'pdf';
  }

  const ext = extname(originalName).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.includes(ext)) {
    return 'text';
  }

  return 'binary';
}

// POST /api/upload
router.post('/', authenticate, (req, res, next) => {
  // 비활성 학생 차단
  if (!req.user.is_active && req.user.role === 'student') {
    return res.status(403).json({ error: '계정이 비활성 상태입니다. 교사에게 활성화를 요청하세요.' });
  }
  next();
}, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const { originalname, mimetype, size, path: filePath } = req.file;
    const fileType = getFileType(mimetype, originalname);

    let content = null;
    let responseType = fileType;

    try {
      if (fileType === 'image' || fileType === 'pdf') {
        // 이미지와 PDF는 base64로 변환
        const fileBuffer = readFileSync(filePath);
        content = fileBuffer.toString('base64');
      } else if (fileType === 'text') {
        // 텍스트 파일은 UTF-8로 읽기
        content = readFileSync(filePath, 'utf-8');
      } else {
        // 바이너리 파일은 지원하지 않음
        responseType = 'unsupported';
        content = null;
      }
    } catch (readError) {
      console.error('파일 읽기 오류:', readError);
      responseType = 'unsupported';
      content = null;
    }

    // 업로드된 파일 삭제 (콘텐츠만 필요)
    try {
      unlinkSync(filePath);
    } catch {
      // 삭제 실패는 무시
    }

    res.json({
      id: crypto.randomUUID(),
      name: originalname,
      size,
      mimeType: mimetype,
      type: responseType,
      content,
    });
  } catch (error) {
    console.error('파일 업로드 오류:', error);

    // 에러 시에도 업로드된 파일 정리
    if (req.file?.path) {
      try {
        unlinkSync(req.file.path);
      } catch {
        // 삭제 실패는 무시
      }
    }

    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

export default router;
