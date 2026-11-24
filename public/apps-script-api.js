'use strict';

const staticBackend = window.STATIC_FRONTEND;

function appsScriptError(status) {
  return Object.assign(new Error('Apps Script request failed'), {status});
}

async function readUpload(file) {
  if (file.size > 2 * 1024 * 1024) throw appsScriptError(413);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {mime: file.type, base64: dataUrl.split(',')[1]};
}

const appsScriptRequest = (() => {
  let token = '';
  const actions = {
    'GET /api/stats': 'stats',
    'POST /api/complaints': 'submit',
    'GET /api/track': 'track',
    'POST /api/login': 'login',
    'POST /api/logout': 'logout',
    'GET /api/admin/complaints': 'list',
    'PATCH /api/admin/complaints': 'update',
    'GET /api/admin/history': 'history',
    'GET /api/admin/photo': 'photo'
  };

  return async (path, {method = 'GET', body} = {}) => {
    if (path === '/api/session') return {authenticated: Boolean(token)};
    const route = new URL(path, location.origin);
    const record = /^\/api\/admin\/complaints\/([^/]+)(\/history)?$/.exec(route.pathname);
    const target = record ? '/api/admin/' + (record[2] ? 'history' : 'complaints') : route.pathname;
    const action = actions[method + ' ' + target];
    if (!action) throw appsScriptError(404);

    const endpoint = window.APPS_SCRIPT_URL;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
      throw Object.assign(appsScriptError(503), {setup: true});
    }

    const data = Object.fromEntries(route.searchParams);
    if (record) data.ticket = decodeURIComponent(record[1]);
    if (body instanceof FormData) {
      for (const [key, value] of body) data[key] = typeof value === 'string' ? value : await readUpload(value);
    } else if (typeof body === 'string') {
      Object.assign(data, JSON.parse(body));
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'follow',
        // A string body is sent as text/plain, so Apps Script does not need an OPTIONS handler.
        body: JSON.stringify({action, token, data})
      });
      if (!response.ok) throw appsScriptError(response.status);
      const result = await response.json();
      if (!result.ok) throw Object.assign(appsScriptError(result.status), {setup: result.code === 'setup_required'});
      if (action === 'login') token = result.data.token;
      return result.data;
    } finally {
      if (action === 'logout') token = '';
    }
  };
})();
