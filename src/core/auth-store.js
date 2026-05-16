'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OAUTH_AUTHORIZE_BASE = 'https://auth.openai.com';
const OAUTH_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
const CHATGPT_DESKTOP_AUTH_URL = 'https://chatgpt.com/codex/desktop-auth';
const CHATGPT_USAGE_ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage';
const FETCH_TIMEOUT_MS = 12000;

class HttpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function readJson(jsonPath) {
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readAuthFile(codexHome) {
  return readJson(path.join(codexHome, 'auth.json'));
}

async function writeAuthFile(codexHome, auth) {
  await fs.writeFile(
    path.join(codexHome, 'auth.json'),
    JSON.stringify(auth, null, 2),
    'utf8'
  );
}

async function fetchWithTimeout(url, options = {}, { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HttpError(`请求超时（>${timeoutMs}ms）`, 408, null);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseChatGptIdentity(auth) {
  const accessPayload = decodeJwtPayload(auth?.tokens?.access_token);
  const idPayload = decodeJwtPayload(auth?.tokens?.id_token);
  const authClaim = accessPayload?.['https://api.openai.com/auth'] ?? idPayload?.['https://api.openai.com/auth'] ?? null;
  const profileClaim = accessPayload?.['https://api.openai.com/profile'] ?? idPayload?.['https://api.openai.com/profile'] ?? null;

  return {
    accountId: auth?.tokens?.account_id ?? authClaim?.chatgpt_account_id ?? null,
    userId: authClaim?.chatgpt_user_id ?? authClaim?.user_id ?? null,
    email: profileClaim?.email ?? idPayload?.email ?? null,
    planType: authClaim?.chatgpt_plan_type ?? null,
    clientId: accessPayload?.client_id ?? DEFAULT_OAUTH_CLIENT_ID
  };
}

function getAuthIdentity(auth) {
  if (!auth) {
    return {
      identityKey: null,
      accountId: null,
      userId: null,
      email: null,
      planType: null,
      clientId: DEFAULT_OAUTH_CLIENT_ID
    };
  }

  if (auth.auth_mode === 'chatgpt') {
    const parsed = parseChatGptIdentity(auth);
    const anchor = parsed.accountId ?? parsed.userId ?? parsed.email ?? null;

    return {
      identityKey: anchor ? `chatgpt:${anchor}` : null,
      ...parsed
    };
  }

  if (auth.OPENAI_API_KEY) {
    return {
      identityKey: `apikey:${hashValue(auth.OPENAI_API_KEY)}`,
      accountId: null,
      userId: null,
      email: null,
      planType: null,
      clientId: DEFAULT_OAUTH_CLIENT_ID
    };
  }

  return {
    identityKey: null,
    accountId: null,
    userId: null,
    email: null,
    planType: null,
    clientId: DEFAULT_OAUTH_CLIENT_ID
  };
}

function maskSecret(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function buildChatGptAuthRecord(tokens) {
  const accessPayload = decodeJwtPayload(tokens.access_token);
  const accountId = tokens.account_id
    ?? accessPayload?.['https://api.openai.com/auth']?.chatgpt_account_id
    ?? null;

  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: tokens.id_token ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      account_id: accountId
    },
    last_refresh: new Date().toISOString()
  };
}

async function refreshChatGptAuth(auth, { fetchImpl = fetch } = {}) {
  if (auth?.auth_mode !== 'chatgpt' || !auth?.tokens?.refresh_token) {
    return auth;
  }

  const clientId = getAuthIdentity(auth).clientId ?? DEFAULT_OAUTH_CLIENT_ID;
  const response = await fetchWithTimeout(
    OAUTH_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: auth.tokens.refresh_token
      }).toString()
    },
    { fetchImpl }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new HttpError(
      `刷新 ChatGPT 账号令牌失败，状态码 ${response.status}`,
      response.status,
      body
    );
  }

  const data = JSON.parse(body);
  return buildChatGptAuthRecord({
    access_token: data.access_token,
    id_token: data.id_token,
    refresh_token: data.refresh_token ?? auth.tokens.refresh_token,
    account_id: auth.tokens.account_id
  });
}

async function fetchChatGptUsage(accessToken, { fetchImpl = fetch } = {}) {
  const response = await fetchWithTimeout(
    CHATGPT_USAGE_ENDPOINT,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    },
    { fetchImpl }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new HttpError(
      `读取 ChatGPT/Codex 额度失败，状态码 ${response.status}`,
      response.status,
      body
    );
  }

  return JSON.parse(body);
}

module.exports = {
  CHATGPT_DESKTOP_AUTH_URL,
  DEFAULT_OAUTH_CLIENT_ID,
  FETCH_TIMEOUT_MS,
  OAUTH_AUTHORIZE_BASE,
  OAUTH_TOKEN_ENDPOINT,
  HttpError,
  buildChatGptAuthRecord,
  decodeJwtPayload,
  fetchChatGptUsage,
  getAuthIdentity,
  maskSecret,
  parseChatGptIdentity,
  readAuthFile,
  refreshChatGptAuth,
  writeAuthFile
};
