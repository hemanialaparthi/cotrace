/** @jest-environment jsdom */

const path = require('path');
const { loadScript } = require('../helpers/load-script');

describe('popup/contributions', () => {
  const scriptPath = path.join(__dirname, '../../src/popup/contributions.js');

  test('populateContributions groups revisions by user and renders counts', () => {
    document.body.innerHTML = '<div id="contrib-list"></div>';

    const getRevisionHistory = jest.fn(() => ({
      revisions: [
        {
          modifiedTime: '2026-01-01T10:00:00Z',
          lastModifyingUser: { displayName: 'Alice' },
        },
        {
          modifiedTime: '2026-01-02T10:00:00Z',
          lastModifyingUser: { displayName: 'Alice' },
        },
        {
          modifiedTime: '2026-01-03T10:00:00Z',
          lastModifyingUser: { displayName: 'Bob' },
        },
      ],
    }));

    const context = loadScript(scriptPath, {
      document,
      getRevisionHistory,
      getActiveFile: jest.fn(() => ({ id: 'f1' })),
      fetchFileMetadata: jest.fn(async () => true),
    });

    context.populateContributions();

    const text = document.getElementById('contrib-list').textContent;
    expect(text).toContain('Alice (2 changes)');
    expect(text).toContain('Bob (1 changes)');
  });

  test('handleContributionsTab shows no-document message when active file is missing', () => {
    document.body.innerHTML = '<div id="contrib-list"></div>';

    const context = loadScript(scriptPath, {
      document,
      getActiveFile: jest.fn(() => null),
      getRevisionHistory: jest.fn(() => null),
      fetchFileMetadata: jest.fn(async () => true),
    });

    context.handleContributionsTab();

    expect(document.getElementById('contrib-list').textContent).toContain('No document detected');
  });

  test('handleContributionsTab uses cached history without fetch', () => {
    document.body.innerHTML = '<div id="contrib-list"></div>';

    const fetchFileMetadata = jest.fn(async () => true);
    const context = loadScript(scriptPath, {
      document,
      getActiveFile: jest.fn(() => ({ id: 'f1' })),
      getRevisionHistory: jest.fn(() => ({
        revisions: [
          {
            modifiedTime: '2026-01-01T10:00:00Z',
            lastModifyingUser: { displayName: 'Alice' },
          },
        ],
      })),
      fetchFileMetadata,
    });

    context.handleContributionsTab();

    expect(fetchFileMetadata).not.toHaveBeenCalled();
    expect(document.getElementById('contrib-list').textContent).toContain('Alice (1 changes)');
  });
});