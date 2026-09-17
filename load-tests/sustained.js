import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

let config;
try {
  config = JSON.parse(open('./test-config.json'));
} catch (e) {
  config = {
    apiBaseUrl: 'http://host.docker.internal:3000',
    shortCodes: ['eWCPdV'],
  };
}

const redirectLatency = new Trend('sustained_redirect_latency_ms');
const status302 = new Counter('status_302');
const status200 = new Counter('status_200');
const status5xx = new Counter('status_5xx');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    sustained_load: {
      executor: 'constant-vus',
      vus: 30,
      duration: '60s',
    },
  },
};



export default function () {
  const baseUrl = config.apiBaseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  const codes = config.shortCodes && config.shortCodes.length > 0 ? config.shortCodes : [config.primaryShortCode];
  const shortCode = codes[Math.floor(Math.random() * codes.length)];

  // 90% Redirects, 10% Health Check
  if (Math.random() < 0.9) {
    const params = {
      redirects: 0,
      tags: { name: 'Sustained_Redirect' },
    };

    const res = http.get(`${baseUrl}/s/${shortCode}`, params);
    redirectLatency.add(res.timings.duration);

    if (res.status === 302) status302.add(1);
    else if (res.status >= 500) status5xx.add(1);

    check(res, {
      'redirect status 302': (r) => r.status === 302,
    });
  } else {
    const res = http.get(`${baseUrl}/health`, { tags: { name: 'Sustained_Health' } });
    if (res.status === 200) status200.add(1);
    check(res, {
      'health status 200': (r) => r.status === 200,
    });
  }
}
