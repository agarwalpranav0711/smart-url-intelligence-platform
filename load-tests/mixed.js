import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

let config;
try {
  config = JSON.parse(open('./test-config.json'));
} catch (e) {
  config = {
    apiBaseUrl: 'http://host.docker.internal:3000',
    apiKey: '',
    shortCodes: ['eWCPdV'],
  };
}

const redirectLatency = new Trend('redirect_latency_ms');
const createLatency = new Trend('create_latency_ms');
const status302 = new Counter('status_302');
const status201 = new Counter('status_201');
const status429 = new Counter('status_429');
const status5xx = new Counter('status_5xx');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    mixed_workload: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '5s', target: 25 },
        { duration: '20s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
};


export default function () {
  const baseUrl = config.apiBaseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');

  // Workload distribution: ~99% Redirect (100:1 ratio)
  const isCreate = Math.random() < 0.01;

  if (isCreate) {
    // 1% Link Creation (POST /api/v1/links)
    const targetUrl = `https://example.com/mixed-vu${__VU}-iter${__ITER}-${Date.now()}`;
    const payload = JSON.stringify({ target_url: targetUrl });
    const params = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      tags: { name: 'Mixed_Create' },
    };

    const res = http.post(`${baseUrl}/api/v1/links`, payload, params);
    createLatency.add(res.timings.duration);

    if (res.status === 201) status201.add(1);
    else if (res.status === 429) status429.add(1);
    else if (res.status >= 500) status5xx.add(1);

    check(res, {
      'create status 201 or 429': (r) => r.status === 201 || r.status === 429,
    });
  } else {
    // 99% Redirect Read (GET /s/:code)
    const codes = config.shortCodes && config.shortCodes.length > 0 ? config.shortCodes : [config.primaryShortCode];
    const shortCode = codes[Math.floor(Math.random() * codes.length)];
    const params = {
      redirects: 0,
      tags: { name: 'Mixed_Redirect' },
    };

    const res = http.get(`${baseUrl}/s/${shortCode}`, params);
    redirectLatency.add(res.timings.duration);

    if (res.status === 302) status302.add(1);
    else if (res.status >= 500) status5xx.add(1);

    check(res, {
      'redirect status 302': (r) => r.status === 302,
    });
  }
}
