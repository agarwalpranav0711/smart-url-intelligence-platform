import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Load test configuration
let config;
try {
  config = JSON.parse(open('./test-config.json'));
} catch (e) {
  config = {
    apiBaseUrl: 'http://host.docker.internal:3000',
    apiKey: '',
  };
}

const status201 = new Counter('status_201');
const status429 = new Counter('status_429');
const status5xx = new Counter('status_5xx');
const createLatency = new Trend('create_latency_ms');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    create_load: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 5 },
        { duration: '15s', target: 10 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // 5xx errors should be 0 (429 is expected system behavior under load)
    'http_req_failed{status:500}': ['rate==0'],
  },
};


export default function () {
  const baseUrl = config.apiBaseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  const targetUrl = `https://example.com/loadtest-vu${__VU}-iter${__ITER}-${Date.now()}`;

  const payload = JSON.stringify({ target_url: targetUrl });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    tags: { name: 'CreateEndpoint' },
  };

  const res = http.post(`${baseUrl}/api/v1/links`, payload, params);

  createLatency.add(res.timings.duration);

  if (res.status === 201) {
    status201.add(1);
  } else if (res.status === 429) {
    status429.add(1);
  } else if (res.status >= 500) {
    status5xx.add(1);
  }

  check(res, {
    'status is 201 or 429 (rate-limited)': (r) => r.status === 201 || r.status === 429,
  });
}
