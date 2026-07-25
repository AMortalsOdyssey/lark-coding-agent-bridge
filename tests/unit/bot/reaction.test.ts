import type { LarkChannel, ResourceDescriptor } from '@larksuite/channel';
import { describe, expect, it, vi } from 'vitest';
import { addWorkingReaction, selectWorkingReaction } from '../../../src/bot/reaction.js';

describe('working reaction selection', () => {
  it('selects an urgent reaction for incident-like messages', () => {
    expect(
      selectWorkingReaction({
        messageId: 'om_incident',
        content: '线上故障，马上帮我查一下',
      }),
    ).toMatchObject({ emojiType: 'OnIt', reason: 'urgent-or-incident' });
  });

  it('selects an attachment-aware reaction when there is no text', () => {
    expect(
      selectWorkingReaction({
        messageId: 'om_image',
        content: '',
        resources: [{ type: 'image', fileKey: 'img_1' } as ResourceDescriptor],
      }),
    ).toMatchObject({ emojiType: 'VRHeadset', reason: 'image-attachment' });
  });

  it('lets text intent win over attachment type when both are present', () => {
    expect(
      selectWorkingReaction({
        messageId: 'om_review',
        content: '帮我 review 一下这张截图里的代码',
        resources: [{ type: 'image', fileKey: 'img_1' } as ResourceDescriptor],
      }),
    ).toMatchObject({ emojiType: 'LGTM', reason: 'review-or-verify' });
  });

  it('keeps the default reaction deterministic for the same message', () => {
    const input = {
      messageId: 'om_default',
      content: '收到这个普通消息',
    };

    const first = selectWorkingReaction(input);
    const second = selectWorkingReaction(input);

    expect(second).toEqual(first);
    expect(['Typing', 'OnIt', 'OneSecond', 'Get', 'THUMBSUP']).toContain(first.emojiType);
    expect(first.emojiType).not.toBe('SMILE');
    expect(first.reason).toBe('default-pool');
  });

  it('uses a thumbs-up instead of a smile for sticker-only messages', () => {
    expect(
      selectWorkingReaction({
        messageId: 'om_sticker',
        content: '',
        resources: [{ type: 'sticker', fileKey: 'sticker_1' } as ResourceDescriptor],
      }),
    ).toMatchObject({ emojiType: 'THUMBSUP', reason: 'sticker-attachment' });
  });

  it('falls back to Typing when the selected reaction is rejected by Lark', async () => {
    const addReaction = vi
      .fn(async (_messageId: string, _emojiType: string): Promise<string> => '')
      .mockRejectedValueOnce(new Error('invalid emoji'))
      .mockResolvedValueOnce('reaction_fallback');
    const channel = { addReaction } as unknown as LarkChannel;

    await expect(
      addWorkingReaction(channel, {
        messageId: 'om_incident',
        content: '紧急故障',
      }),
    ).resolves.toBe('reaction_fallback');

    expect(addReaction).toHaveBeenNthCalledWith(1, 'om_incident', 'OnIt');
    expect(addReaction).toHaveBeenNthCalledWith(2, 'om_incident', 'Typing');
  });
});
