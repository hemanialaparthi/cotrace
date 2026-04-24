const path = require('path');
const { loadScript } = require('../helpers/load-script');

describe('background/file-detection', () => {
  const scriptPath = path.join(__dirname, '../../src/background/file-detection.js');

  test('detectGoogleFile stores active Google Doc file data', () => {
    const setMock = jest.fn();

    const context = loadScript(scriptPath, {
      window: { location: { href: 'https://docs.google.com/document/d/abc123/edit' } },
      document: { title: 'Test Doc' },
      chrome: {
        storage: {
          local: {
            set: setMock,
          },
        },
      },
    });

    context.detectGoogleFile();

    expect(setMock).toHaveBeenCalledWith({
      activeFile: { type: 'doc', id: 'abc123', title: 'Test Doc' },
    });
  });

  test('detectGoogleFile does not store when file id is missing', () => {
    const setMock = jest.fn();

    const context = loadScript(scriptPath, {
      window: { location: { href: 'https://docs.google.com/document/u/0/' } },
      document: { title: 'No Id Doc' },
      chrome: {
        storage: {
          local: {
            set: setMock,
          },
        },
      },
    });

    context.detectGoogleFile();
    expect(setMock).not.toHaveBeenCalled();
  });

  test('initFileDetection injects script only for docs.google.com tabs', () => {
    let onActivatedHandler;
    const executeScriptMock = jest.fn();

    const chromeMock = {
      tabs: {
        onActivated: {
          addListener: jest.fn((handler) => {
            onActivatedHandler = handler;
          }),
        },
        get: jest.fn((tabId, cb) => {
          cb({ id: tabId, url: 'https://docs.google.com/document/d/abc123/edit' });
        }),
      },
      scripting: {
        executeScript: executeScriptMock,
      },
    };

    const context = loadScript(scriptPath, { chrome: chromeMock });
    context.initFileDetection();

    expect(chromeMock.tabs.onActivated.addListener).toHaveBeenCalledTimes(1);
    onActivatedHandler({ tabId: 55 });

    expect(executeScriptMock).toHaveBeenCalledTimes(1);
    expect(executeScriptMock.mock.calls[0][0].target).toEqual({ tabId: 55 });
    expect(typeof executeScriptMock.mock.calls[0][0].function).toBe('function');
  });
});