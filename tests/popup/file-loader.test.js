const path = require('path');
const { loadScript } = require('../helpers/load-script');

describe('popup/file-loader', () => {
  const scriptPath = path.join(__dirname, '../../src/popup/file-loader.js');

  test('loadActiveFile resolves true and stores active file', async () => {
    const chromeMock = {
      storage: {
        local: {
          get: jest.fn((keys, cb) => {
            cb({ activeFile: { id: 'file-1', title: 'My Doc', type: 'doc' } });
          }),
        },
      },
      runtime: {
        sendMessage: jest.fn(),
      },
    };

    const context = loadScript(scriptPath, {
      chrome: chromeMock,
      addSystemMessage: jest.fn(),
    });

    const result = await context.loadActiveFile();

    expect(result).toBe(true);
    expect(context.getActiveFile()).toEqual({ id: 'file-1', title: 'My Doc', type: 'doc' });
  });

  test('showFileLoadedMessage uses fallback when no active file exists', () => {
    const addSystemMessage = jest.fn();
    const chromeMock = {
      storage: {
        local: {
          get: jest.fn((keys, cb) => cb({})),
        },
      },
      runtime: {
        sendMessage: jest.fn(),
      },
    };

    const context = loadScript(scriptPath, {
      chrome: chromeMock,
      addSystemMessage,
    });

    context.showFileLoadedMessage();
    expect(addSystemMessage).toHaveBeenCalledWith(
      'No document detected. Please open a Google Doc, Sheet, or Slide to use CoTrace.'
    );
  });

  test('fetchFileMetadata resolves false when there is no active file', async () => {
    const chromeMock = {
      storage: {
        local: {
          get: jest.fn((keys, cb) => cb({})),
        },
      },
      runtime: {
        sendMessage: jest.fn(),
      },
    };

    const context = loadScript(scriptPath, {
      chrome: chromeMock,
      addSystemMessage: jest.fn(),
    });

    const result = await context.fetchFileMetadata();

    expect(result).toBe(false);
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('fetchFileMetadata stores metadata and revisions when response is valid', async () => {
    const chromeMock = {
      storage: {
        local: {
          get: jest.fn((keys, cb) => {
            cb({ activeFile: { id: 'file-xyz', title: 'Doc', type: 'doc' } });
          }),
        },
      },
      runtime: {
        lastError: null,
        sendMessage: jest.fn((payload, cb) => {
          cb({
            meta: { id: 'file-xyz', name: 'Doc' },
            revisions: { revisions: [{ id: '1' }, { id: '2' }] },
          });
        }),
      },
    };

    const context = loadScript(scriptPath, {
      chrome: chromeMock,
      addSystemMessage: jest.fn(),
    });

    await context.loadActiveFile();
    const result = await context.fetchFileMetadata();

    expect(result).toBe(true);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'FETCH_DATA', fileId: 'file-xyz' },
      expect.any(Function)
    );
    expect(context.getFileMetadata()).toEqual({ id: 'file-xyz', name: 'Doc' });
    expect(context.getRevisionHistory()).toEqual({ revisions: [{ id: '1' }, { id: '2' }] });
  });
});