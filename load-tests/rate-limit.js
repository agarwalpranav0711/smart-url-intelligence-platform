import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

let config;
try {
  config = JSON.parse(open('./test-config.json'));
} catch (e) {
  config = {
    apiBaseUrl: 'http://host.docker.internal:3000',
    apiKey: '',
  };
}

const status201 = new Counter('status_201_success');
const status429 = new Counter('status_429_rate_limited');

export const options = {
  scenarios: {
    rate_limit_saturation: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 75,
      maxDuration: '30s',
    },
  },
};

export default function () {
  const baseUrl = config.apiBaseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  const targetUrl = `https://example.com/ratelimit-iter${__ITER}-${Date.now()}`;

  const payload = JSON.stringify({ target_url: targetUrl });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    tags: { name: 'RateLimitTest' },
  };

  const res = http.post(`${baseUrl}/api/v1/links`, payload, params);

  if (res.status === 201) {
    status201.add(1);
  } else if (res.status === 429) {
    status429.add(1);
  }

  // Check that response is either 201 (within limit) or 429 (rate-limited)
  check(res, {
    'status is 201 or 429': (r) => r.status === 201 || r.status === 429,
  });
}
