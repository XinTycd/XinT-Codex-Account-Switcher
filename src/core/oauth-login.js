'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const {
  CHATGPT_DESKTOP_AUTH_URL,
  DEFAULT_OAUTH_CLIENT_ID,
  OAUTH_AUTHORIZE_BASE
} = require('./auth-store');

const CALLBACK_HOST = 'localhost';
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = '/auth/callback';
const OAUTH_TIMEOUT_MS = 10 * 60 * 1000;

function createCancelledError(message = '网页登录已取消。') {
  const error = new Error(message);
  error.code = 'OAUTH_CANCELLED';
  return error;
}

function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  return {
    codeVerifier,
    codeChallenge
  };
}

function createOAuthState() {
  return crypto.randomBytes(16).toString('base64url');
}

function buildRawAuthorizeUrl({
  clientId = DEFAULT_OAUTH_CLIENT_ID,
  redirectUri,
  codeChallenge,
  state,
  originator = 'Codex Desktop'
}) {
  const url = new URL('/oauth/authorize', OAUTH_AUTHORIZE_BASE);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    audience: 'https://api.openai.com/v1',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    originator,
    prompt: 'login',
    max_age: '0',
    codex_cli_simplified_flow: 'true'
  }).toString();

  return url.toString();
}

function buildDesktopAuthUrl(rawAuthorizeUrl) {
  const url = new URL(CHATGPT_DESKTOP_AUTH_URL);
  url.searchParams.set('authorize_url', rawAuthorizeUrl);
  url.searchParams.set('codex_streamlined_login', 'true');
  return url.toString();
}

function waitForAuthorizationCode({
  state,
  timeoutMs = OAUTH_TIMEOUT_MS,
  host = CALLBACK_HOST,
  port = CALLBACK_PORT,
  callbackPath = CALLBACK_PATH
}) {
  let settled = false;
  let rejectPending;
  let resolvePending;
  let timeoutHandle;

  const settle = (fn) => {
    if (settled) {
      return;
    }

    settled = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    fn();
  };

  const authorizationCode = new Promise((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
    timeoutHandle = setTimeout(() => {
      settle(() => reject(new Error('网页 OAuth 登录超时，请重试。')));
    }, timeoutMs);
  });

  const server = http.createServer((req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      const url = new URL(req.url, `http://${host}:${port}`);
      if (url.pathname !== callbackPath) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      if (url.searchParams.get('state') !== state) {
        res.writeHead(400);
        res.end('State mismatch');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        const description = url.searchParams.get('error_description');
        res.writeHead(400);
        res.end('OAuth failed');
        settle(() => rejectPending(new Error(description || error)));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('Missing authorization code');
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>Codex 账号授权完成，可以回到切换器。</body></html>');
      settle(() => resolvePending(code));
    } catch (error) {
      res.writeHead(400);
      res.end('Bad Request');
      settle(() => rejectPending(error));
    }
  });

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  return {
    redirectUri: `http://${host}:${port}${callbackPath}`,
    authorizationCode,
    async start() {
      await listening;
    },
    close({ settlePending = true, reason = '网页登录已取消。' } = {}) {
      server.close();
      if (settlePending) {
        settle(() => rejectPending(createCancelledError(reason)));
      }
    }
  };
}

async function exchangeAuthorizationCode({
  code,
  codeVerifier,
  redirectUri,
  clientId = DEFAULT_OAUTH_CLIENT_ID,
  fetchImpl = fetch
}) {
  const tokenEndpoint = new URL('/oauth/token', OAUTH_AUTHORIZE_BASE).toString();
  const response = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier
    }).toString()
  });

  const body = await response.text();
  if (!response.ok) {
    const detail = body ? `，响应：${body.slice(0, 200)}` : '';
    throw new Error(`OAuth 令牌交换失败，状态码 ${response.status}${detail}`);
  }

  return JSON.parse(body);
}

function createDesktopOAuthFlow({
  clientId = DEFAULT_OAUTH_CLIENT_ID,
  openExternal,
  fetchImpl = fetch,
  timeoutMs = OAUTH_TIMEOUT_MS
}) {
  const pkce = createPkcePair();
  const state = createOAuthState();
  const callback = waitForAuthorizationCode({
    state,
    timeoutMs
  });

  return {
    cancel() {
      callback.close();
    },
    promise: (async () => {
      await callback.start();

      const rawAuthorizeUrl = buildRawAuthorizeUrl({
        clientId,
        redirectUri: callback.redirectUri,
        codeChallenge: pkce.codeChallenge,
        state
      });
      const desktopAuthUrl = buildDesktopAuthUrl(rawAuthorizeUrl);

      try {
        await openExternal(desktopAuthUrl);
        const code = await callback.authorizationCode;
        return exchangeAuthorizationCode({
          code,
          codeVerifier: pkce.codeVerifier,
          redirectUri: callback.redirectUri,
          clientId,
          fetchImpl
        });
      } finally {
        callback.close({ settlePending: false });
      }
    })()
  };
}

async function runDesktopOAuthFlow(options) {
  const flow = createDesktopOAuthFlow(options);
  return flow.promise;
}

module.exports = {
  CALLBACK_PATH,
  CALLBACK_PORT,
  buildDesktopAuthUrl,
  buildRawAuthorizeUrl,
  createDesktopOAuthFlow,
  createCancelledError,
  runDesktopOAuthFlow
};
