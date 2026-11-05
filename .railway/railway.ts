import { defineRailway, project, service } from 'railway/iac';

// 서비스에 소스 연결이 없어 이 값들이 Railway 서비스 설정의 기준이다.
// 환경변수는 Railway에서 직접 관리한다(variables.managed: false).
// 파일에서 서비스를 빼고 apply하면 그 서비스가 삭제될 수 있다.
export default defineRailway(() => {
  const talentedCompassion = service('talented-compassion', {
    build: { builder: 'NIXPACKS' },
    start: 'node index.js',
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
    },
    replicas: { 'asia-southeast1-eqsg3a': 1 },
  });

  return project('danggok-ai', {
    variables: { managed: false },
    resources: [talentedCompassion],
  });
});
