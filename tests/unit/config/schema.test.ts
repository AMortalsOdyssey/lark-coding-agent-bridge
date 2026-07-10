import { describe, expect, it } from 'vitest';
import { getShowToolCalls, type AppConfig } from '../../../src/config/schema';

const baseConfig: AppConfig = {
  accounts: {
    app: {
      id: 'cli_test',
      secret: '${APP_SECRET}',
      tenant: 'feishu',
    },
  },
};

describe('config preference resolvers', () => {
  it('hides tool call blocks by default', () => {
    expect(getShowToolCalls(baseConfig)).toBe(false);
  });
});
