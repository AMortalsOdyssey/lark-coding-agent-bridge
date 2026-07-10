import { describe, expect, it } from 'vitest';
import type { LarkChannel } from '@larksuite/channel';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import { canUseGroupWithOwnerPresence } from '../../../src/policy/group-owner';
import type { RuntimeControls } from '../../../src/policy/access';

const controls: RuntimeControls = {
  botOwnerId: 'ou_owner',
  ownerRefreshState: 'ok',
};

describe('group owner presence access gate', () => {
  it('allows non-owner use of an allowed group when owner is still a member', async () => {
    const profile = profileWithOwnerRequired();
    const channel = fakeChannel([{ member_id: 'ou_owner' }]);

    await expect(
      canUseGroupWithOwnerPresence(profile, controls, channel, 'oc_allowed', 'ou_member'),
    ).resolves.toEqual({ ok: true, reason: 'allowed-chat' });
  });

  it('denies non-owner use of an allowed group when owner is not a member', async () => {
    const profile = profileWithOwnerRequired();
    const channel = fakeChannel([{ member_id: 'ou_someone_else' }]);

    await expect(
      canUseGroupWithOwnerPresence(profile, controls, channel, 'oc_allowed', 'ou_member'),
    ).resolves.toEqual({ ok: false, reason: 'owner-not-in-chat' });
  });

  it('fails closed when owner membership cannot be verified', async () => {
    const profile = profileWithOwnerRequired();
    const channel = { rawClient: {} } as LarkChannel;

    await expect(
      canUseGroupWithOwnerPresence(profile, controls, channel, 'oc_allowed', 'ou_member'),
    ).resolves.toEqual({ ok: false, reason: 'owner-check-failed' });
  });

  it('does not require a member-list call for the owner themself', async () => {
    const profile = profileWithOwnerRequired();
    const channel = { rawClient: {} } as LarkChannel;

    await expect(
      canUseGroupWithOwnerPresence(profile, controls, channel, 'oc_any', 'ou_owner'),
    ).resolves.toEqual({ ok: true, reason: 'owner' });
  });
});

function profileWithOwnerRequired() {
  return createDefaultProfileConfig({
    agentKind: 'claude',
    accounts: {
      app: {
        id: 'cli_test',
        secret: '${APP_SECRET}',
        tenant: 'feishu',
      },
    },
    access: {
      allowedChats: ['oc_allowed'],
      ownerRequiredInGroups: true,
    },
  });
}

function fakeChannel(items: Array<Record<string, string>>): LarkChannel {
  return {
    rawClient: {
      im: {
        v1: {
          chatMembers: {
            async get() {
              return {
                data: {
                  items,
                  has_more: false,
                },
              };
            },
          },
        },
      },
    },
  } as unknown as LarkChannel;
}
