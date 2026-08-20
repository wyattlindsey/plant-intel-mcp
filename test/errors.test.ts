import { describe, expect, it } from 'vitest';

import { ToolError, toToolResult } from '../src/errors.js';

describe('ToolError', () => {
  it('renders the message and remedy without a stack trace', () => {
    const error = new ToolError('missing_credentials', 'PERENUAL_API_KEY is not set.', {
      remedy: 'Get a free key at https://perenual.com/docs/api.',
    });

    const rendered = error.render();

    expect(rendered).toBe(
      'PERENUAL_API_KEY is not set.\nRemedy: Get a free key at https://perenual.com/docs/api.',
    );
    expect(rendered).not.toMatch(/\n\s+at /);
    expect(rendered).not.toContain('.ts:');
  });

  it('renders the message alone when there is no remedy', () => {
    const error = new ToolError('upstream_error', 'Perenual returned HTTP 503.');

    expect(error.render()).toBe('Perenual returned HTTP 503.');
  });

  it('carries a machine-readable code', () => {
    expect(new ToolError('not_found', 'no match').code).toBe('not_found');
  });
});

describe('toToolResult', () => {
  it('converts a ToolError into an MCP error result carrying the remedy', () => {
    const result = toToolResult(
      new ToolError('quota_exhausted', 'Daily quota spent.', { remedy: 'Resets at 00:00 UTC.' }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'Daily quota spent.\nRemedy: Resets at 00:00 UTC.' },
    ]);
  });

  it('never leaks a stack trace from an unexpected error', () => {
    const result = toToolResult(new TypeError('cannot read properties of undefined'));
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

    expect(result.isError).toBe(true);
    expect(text).toContain('cannot read properties of undefined');
    expect(text).not.toContain('.ts:');
    expect(text).not.toMatch(/\n\s+at /);
  });

  it('describes a non-Error throw without crashing', () => {
    const result = toToolResult('something odd');
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

    expect(result.isError).toBe(true);
    expect(text).toBe('plant-intel hit an unexpected failure: something odd');
  });
});
