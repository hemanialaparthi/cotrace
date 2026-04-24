/** @jest-environment jsdom */

const path = require('path');
const { loadScript } = require('../helpers/load-script');

describe('popup/auth-ui', () => {
  const scriptPath = path.join(__dirname, '../../src/popup/auth-ui.js');

  function setupDom() {
    document.body.innerHTML = `
      <button class="account-btn"></button>
      <div class="settings-menu-container">
        <button class="settings-btn"></button>
        <div class="settings-dropdown"></div>
      </div>
      <button class="sign-out-btn"></button>
      <button class="clear-chat-btn"></button>
    `;
  }

  test('updateAccountButton renders default icon when unauthenticated', () => {
    setupDom();

    const context = loadScript(scriptPath, {
      document,
      chrome: { runtime: { sendMessage: jest.fn(), lastError: null } },
      clearChatHistory: jest.fn(),
      confirm: jest.fn(() => true),
    });

    context.updateAccountButton(false);

    const accountBtn = document.querySelector('.account-btn');
    expect(accountBtn.title).toBe('Click to sign in with Google');
    expect(accountBtn.innerHTML).toContain('<svg');
  });

  test('checkAuthStatus updates in-memory auth state from CHECK_AUTH response', () => {
    setupDom();

    const sendMessage = jest.fn((payload, cb) => {
      cb({
        authenticated: true,
        user: { name: 'Ava', email: 'ava@example.com', picture: 'http://x/y.png' },
      });
    });

    const context = loadScript(scriptPath, {
      document,
      chrome: { runtime: { sendMessage, lastError: null } },
      clearChatHistory: jest.fn(),
      confirm: jest.fn(() => true),
    });

    context.checkAuthStatus();

    const status = context.getAuthStatus();
    expect(status.isAuthenticated).toBe(true);
    expect(status.currentUser).toEqual({
      name: 'Ava',
      email: 'ava@example.com',
      picture: 'http://x/y.png',
    });
  });

  test('handleSignOut sends LOGOUT and resets auth state', () => {
    setupDom();

    const sendMessage = jest.fn((payload, cb) => {
      if (payload.action === 'CHECK_AUTH') {
        cb({ authenticated: true, user: { name: 'Ava', email: 'ava@example.com' } });
        return;
      }
      cb({ success: true });
    });

    const context = loadScript(scriptPath, {
      document,
      chrome: { runtime: { sendMessage, lastError: null } },
      clearChatHistory: jest.fn(),
      confirm: jest.fn(() => true),
    });

    context.checkAuthStatus();
    expect(context.getAuthStatus().isAuthenticated).toBe(true);

    context.handleSignOut();

    expect(sendMessage).toHaveBeenCalledWith({ action: 'LOGOUT' }, expect.any(Function));
    expect(context.getAuthStatus().isAuthenticated).toBe(false);
    expect(context.getAuthStatus().currentUser).toBeNull();
  });
});