// 학년도 종료 후 학생 대화를 파기한다. 기본은 건수만 보여 주고 아무것도 지우지 않는다.
//
//   cd server
//   node --env-file=.env scripts/purge-school-year.mjs --before=2027-03-01
//   node --env-file=.env scripts/purge-school-year.mjs --before=2027-03-01 --delete-students
//   node --env-file=.env scripts/purge-school-year.mjs --before=2027-03-01 --execute
//
// --execute 없이는 쓰기 문장을 보내지 않는다. 실행 전에 Turso 백업 시점을 확인한다.
import { createClient } from '@libsql/client';
import { planPurge, executePurge } from '../utils/retention.js';

const args = process.argv.slice(2);
const before = args.find((a) => a.startsWith('--before='))?.split('=')[1];
const options = { deleteStudents: args.includes('--delete-students') };

if (!before) {
  console.error('--before=YYYY-MM-DD 가 필요합니다.');
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
await db.execute('PRAGMA foreign_keys = ON');

const plan = await planPurge(db, before, options);
console.log(`기준일 ${before} 이전 파기 대상`, plan);

if (!args.includes('--execute')) {
  console.log('--execute 를 붙이지 않아 아무것도 지우지 않았습니다.');
  process.exit(0);
}

await executePurge(db, before, options);
console.log('파기 완료', await planPurge(db, before, options));
