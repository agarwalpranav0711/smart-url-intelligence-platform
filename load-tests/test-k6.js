import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 5,
  duration: '3s',
};

export default function () {
  const res = http.get('http://host.docker.internal:3000/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
