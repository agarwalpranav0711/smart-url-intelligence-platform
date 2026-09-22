import React, { useState } from 'react';

export type OperationKey =
  | 'create_link'
  | 'list_links'
  | 'update_link'
  | 'delete_link'
  | 'link_analytics'
  | 'analytics_summary'
  | 'create_api_key';

export type LanguageKey = 'curl' | 'javascript' | 'python' | 'go';

export interface CodeGeneratorProps {
  initialOperation?: OperationKey;
  shortCode?: string;
  hideOperationSelector?: boolean;
}

interface OperationMeta {
  key: OperationKey;
  label: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
}

const OPERATIONS: OperationMeta[] = [
  { key: 'create_link', label: 'Create Link', method: 'POST', endpoint: '/api/v1/links' },
  { key: 'list_links', label: 'List Links', method: 'GET', endpoint: '/api/v1/links' },
  { key: 'update_link', label: 'Update Link', method: 'PATCH', endpoint: '/api/v1/links/{code}' },
  { key: 'delete_link', label: 'Delete Link', method: 'DELETE', endpoint: '/api/v1/links/{code}' },
  { key: 'link_analytics', label: 'Link Analytics', method: 'GET', endpoint: '/api/v1/links/{code}/analytics' },
  { key: 'analytics_summary', label: 'Analytics Summary', method: 'GET', endpoint: '/api/v1/analytics/summary' },
  { key: 'create_api_key', label: 'Create API Key', method: 'POST', endpoint: '/api/v1/api-keys' },
];

const LANGUAGES: { key: LanguageKey; label: string }[] = [
  { key: 'curl', label: 'cURL' },
  { key: 'javascript', label: 'JavaScript' },
  { key: 'python', label: 'Python' },
  { key: 'go', label: 'Go' },
];

function generateSnippet(operation: OperationKey, language: LanguageKey, shortCode?: string): string {
  const baseUrl = 'http://localhost:3000';
  const codeParam = shortCode ? shortCode : '<SHORT_CODE>';

  switch (operation) {
    case 'create_link': {
      if (language === 'curl') {
        return `curl -X POST "${baseUrl}/api/v1/links" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "target_url": "https://example.com/docs"
  }'`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/links', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    target_url: 'https://example.com/docs'
  })
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/links"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
payload = {
    "target_url": "https://example.com/docs"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/links"
	payload := []byte(\`{"target_url":"https://example.com/docs"}\`)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }

    case 'list_links': {
      if (language === 'curl') {
        return `curl -X GET "${baseUrl}/api/v1/links?limit=20&offset=0" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/links?limit=20&offset=0', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/links"
headers = {
    "Authorization": "Bearer YOUR_API_KEY"
}
params = {
    "limit": 20,
    "offset": 0
}

response = requests.get(url, headers=headers, params=params)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/links?limit=20&offset=0"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }

    case 'update_link': {
      if (language === 'curl') {
        return `curl -X PATCH "${baseUrl}/api/v1/links/${codeParam}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "target_url": "https://example.com/updated-docs"
  }'`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/links/${codeParam}', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    target_url: 'https://example.com/updated-docs'
  })
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/links/${codeParam}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
payload = {
    "target_url": "https://example.com/updated-docs"
}

response = requests.patch(url, json=payload, headers=headers)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/links/${codeParam}"
	payload := []byte(\`{"target_url":"https://example.com/updated-docs"}\`)

	req, err := http.NewRequest("PATCH", url, bytes.NewBuffer(payload))
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }

    case 'delete_link': {
      if (language === 'curl') {
        return `curl -X DELETE "${baseUrl}/api/v1/links/${codeParam}" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/links/${codeParam}', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/links/${codeParam}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY"
}

response = requests.delete(url, headers=headers)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/links/${codeParam}"

	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }

    case 'link_analytics': {
      if (language === 'curl') {
        return `curl -X GET "${baseUrl}/api/v1/links/${codeParam}/analytics?interval=day" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/links/${codeParam}/analytics?interval=day', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/links/${codeParam}/analytics"
headers = {
    "Authorization": "Bearer YOUR_API_KEY"
}
params = {
    "interval": "day"
}

response = requests.get(url, headers=headers, params=params)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/links/${codeParam}/analytics?interval=day"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }

    case 'analytics_summary': {
      if (language === 'curl') {
        return `curl -X GET "${baseUrl}/api/v1/analytics/summary?limit=10" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/analytics/summary?limit=10', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/analytics/summary"
headers = {
    "Authorization": "Bearer YOUR_API_KEY"
}
params = {
    "limit": 10
}

response = requests.get(url, headers=headers, params=params)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/analytics/summary?limit=10"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }

    case 'create_api_key': {
      if (language === 'curl') {
        return `curl -X POST "${baseUrl}/api/v1/api-keys" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Secondary Key"
  }'`;
      }
      if (language === 'javascript') {
        return `const response = await fetch('${baseUrl}/api/v1/api-keys', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Secondary Key'
  })
});

const data = await response.json();
console.log(data);`;
      }
      if (language === 'python') {
        return `import requests

url = "${baseUrl}/api/v1/api-keys"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
payload = {
    "name": "Secondary Key"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`;
      }
      if (language === 'go') {
        return `package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	url := "${baseUrl}/api/v1/api-keys"
	payload := []byte(\`{"name":"Secondary Key"}\`)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		panic(err)
	}

	req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;
      }
      break;
    }
  }

  return '';
}

export const CodeGenerator: React.FC<CodeGeneratorProps> = ({
  initialOperation = 'create_link',
  shortCode,
  hideOperationSelector = false,
}) => {
  const [selectedOperation, setSelectedOperation] = useState<OperationKey>(initialOperation);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageKey>('curl');
  const [copied, setCopied] = useState(false);

  const activeSnippet = generateSnippet(selectedOperation, selectedLanguage, shortCode);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(activeSnippet);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = activeSnippet;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-5">
      {/* Header & Authentication Explanation */}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          Code Generator
        </h3>
        <p className="text-xs text-slate-400">
          Programmatic API clients use Bearer API keys.
          <span className="font-mono text-slate-300 ml-1">Example: Authorization: Bearer YOUR_API_KEY</span>
        </p>
      </div>

      {/* Operation Selector */}
      {!hideOperationSelector && (
        <div>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Operation
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="API Operations">
            {OPERATIONS.map((op) => {
              const isSelected = op.key === selectedOperation;
              return (
                <button
                  key={op.key}
                  type="button"
                  onClick={() => setSelectedOperation(op.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-transparent'
                  }`}
                >
                  <span className={`text-[10px] font-mono mr-1.5 px-1 py-0.5 rounded ${
                    op.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' :
                    op.method === 'POST' ? 'bg-sky-500/20 text-sky-400' :
                    op.method === 'PATCH' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {op.method}
                  </span>
                  {op.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Language Tabs & Snippet Container */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex space-x-1" role="tablist" aria-label="Target Programming Languages">
            {LANGUAGES.map((lang) => {
              const isActive = lang.key === selectedLanguage;
              return (
                <button
                  key={lang.key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setSelectedLanguage(lang.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-all active:scale-95"
            aria-label="Copy code to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Code Display Box */}
        <div className="relative group">
          <pre className="bg-slate-950 border border-slate-800/80 rounded-lg p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed select-all">
            <code>{activeSnippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
