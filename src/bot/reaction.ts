import type { LarkChannel, ResourceDescriptor } from '@larksuite/channel';
import { log } from '../core/logger';

export interface WorkingReactionContext {
  messageId: string;
  content?: string;
  rawContentType?: string;
  resources?: ResourceDescriptor[];
}

interface ReactionChoice {
  emojiType: string;
  reason: string;
}

interface TextReactionRule {
  emojiType: string;
  reason: string;
  patterns: RegExp[];
}

const FALLBACK_EMOJI = 'Typing';
const DEFAULT_EMOJI_POOL = ['Typing', 'OnIt', 'OneSecond', 'Get', 'THUMBSUP'];

const RESOURCE_REACTIONS: Partial<Record<ResourceDescriptor['type'], ReactionChoice>> = {
  image: { emojiType: 'VRHeadset', reason: 'image-attachment' },
  video: { emojiType: 'VRHeadset', reason: 'video-attachment' },
  audio: { emojiType: 'OneSecond', reason: 'audio-attachment' },
  file: { emojiType: 'Get', reason: 'file-attachment' },
  sticker: { emojiType: 'THUMBSUP', reason: 'sticker-attachment' },
};

const TEXT_RULES: TextReactionRule[] = [
  {
    emojiType: 'OnIt',
    reason: 'urgent-or-incident',
    patterns: [
      /紧急|急|马上|立即|现在|尽快|阻塞|卡住|线上|生产|故障|事故|报错|失败|崩|挂了|超时|告警/,
      /\b(urgent|asap|incident|prod|production|blocked|blocking|broken|crash|failed|failure|timeout|alert)\b/i,
    ],
  },
  {
    emojiType: 'LGTM',
    reason: 'review-or-verify',
    patterns: [
      /review|代码审查|帮我看.*代码|验证|验收|测试|回归|检查|确认一下|核对|改好了|修好了|升级好了|完成了/,
      /\b(review|verify|validate|test|regression|lgtm|done|fixed|shipped)\b/i,
    ],
  },
  {
    emojiType: 'Get',
    reason: 'lookup-or-read',
    patterns: [
      /查一下|查下|找一下|找下|搜一下|搜下|读取|拉取|看一下|看下|帮看|定位|确认|核对/,
      /\b(find|search|fetch|read|inspect|lookup|check)\b/i,
    ],
  },
  {
    emojiType: 'OneSecond',
    reason: 'question-or-analysis',
    patterns: [
      /为什么|怎么|如何|解释|分析|原因|方案|可以吗|能不能|是否|吗[？?]|[？?]/,
      /\b(why|how|what|explain|analy[sz]e|reason|plan|can|could|should)\b/i,
    ],
  },
  {
    emojiType: 'YouAreTheBest',
    reason: 'thanks-or-praise',
    patterns: [
      /谢谢|感谢|辛苦|不错|很好|太棒|赞|牛/,
      /\b(thanks|thank you|thx|nice|great|awesome)\b/i,
    ],
  },
];

/**
 * Add a lightweight working reaction to a message to give text-mode users an
 * instant "I got your message and I'm responding" cue while the agent is still
 * thinking. Card mode doesn't need this because the streaming card already
 * shows progress the moment it's posted.
 *
 * Returns the reaction id on success, undefined on any failure. Failures
 * are logged but never thrown — losing a decoration must not break the
 * actual reply flow.
 */
export async function addWorkingReaction(
  channel: LarkChannel,
  input: WorkingReactionContext | string,
): Promise<string | undefined> {
  const context = typeof input === 'string' ? { messageId: input } : input;
  const choice = selectWorkingReaction(context);
  try {
    const id = await channel.addReaction(context.messageId, choice.emojiType);
    if (id) {
      log.info('reaction', 'added', {
        messageId: context.messageId,
        reactionId: id,
        emojiType: choice.emojiType,
        reason: choice.reason,
      });
    }
    return id;
  } catch (err) {
    log.warn('reaction', 'add-failed', {
      messageId: context.messageId,
      emojiType: choice.emojiType,
      reason: choice.reason,
      err: err instanceof Error ? err.message : String(err),
    });
    if (choice.emojiType === FALLBACK_EMOJI) return undefined;
    return addFallbackReaction(channel, context.messageId, choice.emojiType);
  }
}

/** Remove a previously-added reaction. Tolerates errors silently — best
 * effort cleanup; a leftover reaction is harmless. */
export async function removeReaction(
  channel: LarkChannel,
  messageId: string,
  reactionId: string,
): Promise<void> {
  try {
    await channel.removeReaction(messageId, reactionId);
    log.info('reaction', 'removed', { messageId, reactionId });
  } catch (err) {
    log.warn('reaction', 'remove-failed', {
      messageId,
      reactionId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export function selectWorkingReaction(input: WorkingReactionContext): ReactionChoice {
  const content = input.content?.trim() ?? '';
  const resourceChoice = selectResourceReaction(input.resources);
  if (resourceChoice && !content) return resourceChoice;

  for (const rule of TEXT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(content))) {
      return { emojiType: rule.emojiType, reason: rule.reason };
    }
  }

  if (resourceChoice) return resourceChoice;

  const defaultEmoji =
    DEFAULT_EMOJI_POOL[stableIndex(`${input.messageId}\n${content}`, DEFAULT_EMOJI_POOL.length)] ??
    FALLBACK_EMOJI;
  return {
    emojiType: defaultEmoji,
    reason: 'default-pool',
  };
}

async function addFallbackReaction(
  channel: LarkChannel,
  messageId: string,
  failedEmojiType: string,
): Promise<string | undefined> {
  try {
    const id = await channel.addReaction(messageId, FALLBACK_EMOJI);
    if (id) {
      log.info('reaction', 'added-fallback', {
        messageId,
        reactionId: id,
        emojiType: FALLBACK_EMOJI,
        failedEmojiType,
      });
    }
    return id;
  } catch (fallbackErr) {
    log.warn('reaction', 'fallback-add-failed', {
      messageId,
      emojiType: FALLBACK_EMOJI,
      failedEmojiType,
      err: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
    });
    return undefined;
  }
}

function selectResourceReaction(resources: ResourceDescriptor[] | undefined): ReactionChoice | undefined {
  if (!resources?.length) return undefined;
  const priority: ResourceDescriptor['type'][] = ['image', 'video', 'audio', 'file', 'sticker'];
  for (const type of priority) {
    if (resources.some((resource) => resource.type === type)) return RESOURCE_REACTIONS[type];
  }
  return undefined;
}

function stableIndex(input: string, modulo: number): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}
