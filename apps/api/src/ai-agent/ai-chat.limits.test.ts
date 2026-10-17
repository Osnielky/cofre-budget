import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AiChatController } from './ai-chat.controller';

/** Minimal stand-ins: a conversations store that reports `sentToday`, a chat that replies "ok". */
function setup(sentToday: number) {
  const appended: string[] = [];
  const conversations = {
    countUserMessagesToday: async () => sentToday + appended.length,
    appendUserMessage: async (_id: string, _u: string, text: string) => { appended.push(text); },
    appendAssistantMessage: async (_id: string, text: string) => ({ id: 'm1', role: 'assistant', text }),
  };
  const chat = { sendMessage: async () => ({ text: 'ok', widget: null }) };
  const controller = new AiChatController(chat as any, conversations as any);
  const written: string[] = [];
  const res = { writeHead: () => undefined, write: (s: string) => { written.push(s); }, end: () => undefined };
  const send = (plan: string) => controller.sendMessage('c1', { user: { id: 'u1', plan } }, { content: 'hi' }, res as any);
  const events = () => written.map((w) => JSON.parse(w.replace(/^data: /, '')));
  return { send, events, appended };
}

describe('Ask Cofre daily limits', () => {
  it('stops a Pro user at 25 messages', async () => {
    const { send, appended } = setup(25);
    await expect(send('pro')).rejects.toBeInstanceOf(ForbiddenException);
    expect(appended).toEqual([]);
  });

  it('lets an Elite user keep going past 25', async () => {
    const { send, events } = setup(25);
    await send('elite');
    expect(events().at(-1)).toMatchObject({ type: 'done' });
  });

  it('stops an Elite user at 50', async () => {
    const { send } = setup(50);
    await expect(send('elite')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('includes the updated usage with each reply', async () => {
    const { send, events } = setup(7);
    await send('pro');
    expect(events().at(-1).usage).toMatchObject({ limit: 25, used: 8, remaining: 17 });
  });
});
