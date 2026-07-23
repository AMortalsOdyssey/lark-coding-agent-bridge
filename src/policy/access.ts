import type { ProfileConfig } from '../config/profile-schema';
export { accessPolicyDigest } from './fingerprint';

export type OwnerRefreshState = 'ok' | 'failed' | 'unknown';

export interface RuntimeControls {
  botOwnerId?: string;
  ownerRefreshState: OwnerRefreshState;
  ownerRefreshedAt?: number;
  ownerRefreshError?: string;
}

export interface AccessDecision {
  ok: boolean;
  reason:
    | 'owner'
    | 'allowed-user'
    | 'allowed-admin'
    | 'allowed-chat'
    | 'comment-mention'
    | 'denied-user'
    | 'denied-chat'
    | 'denied-admin'
    | 'owner-not-in-chat'
    | 'owner-check-failed';
}

export function isCreator(controls: RuntimeControls, senderId: string): boolean {
  if (controls.ownerRefreshState === 'unknown') return false;
  return Boolean(controls.botOwnerId) && controls.botOwnerId === senderId;
}

export function effectiveOwnerOpenId(
  profile: ProfileConfig,
  controls: RuntimeControls,
): string | undefined {
  return profile.access.ownerOpenId ?? (
    controls.ownerRefreshState === 'unknown' ? undefined : controls.botOwnerId
  );
}

export function isOwner(
  profile: ProfileConfig,
  controls: RuntimeControls,
  senderId: string,
): boolean {
  return effectiveOwnerOpenId(profile, controls) === senderId;
}

export function canUseDm(
  profile: ProfileConfig,
  controls: RuntimeControls,
  senderId: string,
): AccessDecision {
  if (isOwner(profile, controls, senderId)) return allow('owner');
  if (profile.access.allowedUsers.includes(senderId)) return allow('allowed-user');
  if (profile.access.admins.includes(senderId)) return allow('allowed-admin');
  return deny('denied-user');
}

export function canUseGroup(
  profile: ProfileConfig,
  controls: RuntimeControls,
  chatId: string,
  senderId: string,
): AccessDecision {
  if (isOwner(profile, controls, senderId)) return allow('owner');

  switch (profile.access.groupAccessMode) {
    case 'owner-only':
      return deny('denied-user');
    case 'owner-present':
      return profile.access.allowedChats.includes(chatId)
        ? allow('allowed-chat')
        : deny('denied-chat');
    case 'open':
      return allow('allowed-chat');
    case 'legacy':
      if (profile.access.admins.includes(senderId)) return allow('allowed-admin');
      if (profile.access.allowedChats.includes(chatId)) return allow('allowed-chat');
      return deny('denied-chat');
  }
}

export function canRunAdminCommand(
  profile: ProfileConfig,
  controls: RuntimeControls,
  senderId: string,
): AccessDecision {
  if (isOwner(profile, controls, senderId)) return allow('owner');
  if (profile.access.admins.includes(senderId)) return allow('allowed-admin');
  return deny('denied-admin');
}

function allow(reason: AccessDecision['reason']): AccessDecision {
  return { ok: true, reason };
}

function deny(reason: AccessDecision['reason']): AccessDecision {
  return { ok: false, reason };
}
