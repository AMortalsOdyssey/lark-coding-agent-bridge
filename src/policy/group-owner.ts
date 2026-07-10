import type { LarkChannel } from '@larksuite/channel';
import type { ProfileConfig } from '../config/profile-schema';
import { canUseGroup, isCreator, type AccessDecision, type RuntimeControls } from './access';

type ChatMembersGet = (args: {
  path: { chat_id: string };
  params?: {
    member_id_type?: 'open_id';
    page_size?: number;
    page_token?: string;
  };
}) => Promise<unknown>;

interface ChatMemberRecord {
  member_id?: unknown;
  memberId?: unknown;
  open_id?: unknown;
  openId?: unknown;
  user_id?: unknown;
  id?: unknown;
}

export async function canUseGroupWithOwnerPresence(
  profile: ProfileConfig,
  controls: RuntimeControls,
  channel: LarkChannel,
  chatId: string,
  senderId: string,
): Promise<AccessDecision> {
  const decision = canUseGroup(profile, controls, chatId, senderId);
  if (!decision.ok) return decision;
  if (!profile.access.ownerRequiredInGroups) return decision;
  if (isCreator(controls, senderId)) return decision;

  const ownerId = controls.botOwnerId;
  if (!ownerId) return deny('owner-check-failed');

  const ownerPresent = await isOwnerInChat(channel, chatId, ownerId);
  if (ownerPresent === true) return decision;
  if (ownerPresent === false) return deny('owner-not-in-chat');
  return deny('owner-check-failed');
}

async function isOwnerInChat(
  channel: LarkChannel,
  chatId: string,
  ownerId: string,
): Promise<boolean | undefined> {
  const chatMembers = rawChatMembersGet(channel);
  if (!chatMembers) return undefined;

  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await chatMembers({
      path: { chat_id: chatId },
      params: {
        member_id_type: 'open_id',
        page_size: 100,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
    });
    const data = responseData(response);
    const items = arrayValue((data as { items?: unknown })?.items);
    if (items.some((item) => memberMatchesOwner(item, ownerId))) return true;

    const hasMore = (data as { has_more?: unknown })?.has_more === true;
    const next = (data as { page_token?: unknown })?.page_token;
    pageToken = typeof next === 'string' && next ? next : undefined;
    if (!hasMore || !pageToken) return false;
  }
  return undefined;
}

function rawChatMembersGet(channel: LarkChannel): ChatMembersGet | undefined {
  const rawClient = channel.rawClient as unknown as {
    im?: { v1?: { chatMembers?: { get?: ChatMembersGet } } };
  };
  const chatMembers = rawClient.im?.v1?.chatMembers;
  return typeof chatMembers?.get === 'function'
    ? chatMembers.get.bind(chatMembers)
    : undefined;
}

function responseData(response: unknown): unknown {
  if (!response || typeof response !== 'object') return {};
  const top = response as { data?: unknown };
  if (top.data && typeof top.data === 'object') return top.data;
  return response;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function memberMatchesOwner(item: unknown, ownerId: string): boolean {
  if (!item || typeof item !== 'object') return false;
  const member = item as ChatMemberRecord;
  return [member.member_id, member.memberId, member.open_id, member.openId, member.user_id, member.id]
    .some((value) => value === ownerId);
}

function deny(reason: AccessDecision['reason']): AccessDecision {
  return { ok: false, reason };
}
