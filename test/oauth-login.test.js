'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDesktopAuthUrl,
  buildRawAuthorizeUrl
} = require('../src/core/oauth-login');

test('buildRawAuthorizeUrl creates PKCE login URL for OpenAI auth', () => {
  const url = new URL(buildRawAuthorizeUrl({
    clientId: 'client_123',
    redirectUri: 'http://localhost:1455/auth/callback',
    codeChallenge: 'challenge',
    state: 'state123'
  }));

  assert.equal(url.origin, 'https://auth.openai.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client_123');
  assert.equal(url.searchParams.get('scope'), 'openid profile email offline_access');
  assert.equal(url.searchParams.get('audience'), 'https://api.openai.com/v1');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge');
});

test('buildDesktopAuthUrl wraps authorize URL with official desktop auth page', () => {
  const wrapped = new URL(buildDesktopAuthUrl('https://auth.openai.com/oauth/authorize?x=1'));
  assert.equal(wrapped.origin, 'https://chatgpt.com');
  assert.equal(wrapped.pathname, '/codex/desktop-auth');
  assert.equal(wrapped.searchParams.get('codex_streamlined_login'), 'true');
  assert.equal(wrapped.searchParams.get('authorize_url'), 'https://auth.openai.com/oauth/authorize?x=1');
});
