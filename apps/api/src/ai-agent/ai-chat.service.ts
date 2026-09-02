import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { AiConversationsService } from './ai-conversations.service';
import { AiReadToolsService } from './ai-read-tools.service';
import { AiProposeToolsService } from './ai-propose-tools.service';
import type { AiMessageWidget, SavingsTrendWidgetData } from './ai-message.entity';

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `You are Cofre's financial assistant. You can see the user's transactions, categories, budgets, accounts, debts, and net-worth goal, and answer questions about them using your tools — never guess numbers, always look them up.

You can also propose changes: categorizing transactions, creating a category, setting a budget, or setting the net-worth goal's target date. You never make these changes directly — calling a propose_* tool only creates a pending proposal that the user must explicitly confirm in the UI. Say so plainly ("I've proposed..."), never claim to have made a change yourself.

There is no tool for moving money, paying bills, or anything outside what's listed above — don't imply you can.

Keep answers concise and conversational.`;

export interface SendMessageParams {
  userId: string;
  conversationId: string;
  userText: string;
  monthContext?: string | null;
  onTextDelta: (text: string) => void;
}

export interface SendMessageResult {
  text: string;
  widget: AiMessageWidget | null;
}

@Injectable()
export class AiChatService {
  private client = new Anthropic();

  constructor(
    private conversations: AiConversationsService,
    private readTools: AiReadToolsService,
    private proposeTools: AiProposeToolsService,
  ) {}

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { userId, conversationId, userText, monthContext, onTextDelta } = params;

    let createdActionId: string | null = null;
    let savingsTrend: SavingsTrendWidgetData | null = null;

    const tools = [
      betaTool({
        name: 'get_transactions',
        description: 'List the user\'s transactions, optionally filtered by date range, category, merchant, or uncategorized-only.',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
            endDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
            categoryId: { type: 'string' },
            uncategorizedOnly: { type: 'boolean' },
            merchant: { type: 'string', description: 'Case-insensitive substring match on merchant or transaction name' },
            limit: { type: 'number', description: 'Max results, default 100, capped at 500' },
          },
        },
        run: async (args) => JSON.stringify(await this.readTools.getTransactions(userId, args as any)),
      }),
      betaTool({
        name: 'get_categories',
        description: 'List all of the user\'s categories.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getCategories(userId)),
      }),
      betaTool({
        name: 'get_budgets',
        description: 'List the user\'s budgets and spend-vs-target for a given month.',
        inputSchema: {
          type: 'object',
          properties: { month: { type: 'string', description: 'YYYY-MM, defaults to the current month' } },
        },
        run: async (args) => JSON.stringify(await this.readTools.getBudgets(userId, args as any)),
      }),
      betaTool({
        name: 'get_net_worth_summary',
        description: 'Get the user\'s current net worth and progress toward the $1,000,000 goal.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getNetWorthSummary(userId)),
      }),
      betaTool({
        name: 'get_accounts',
        description: 'List the user\'s bank accounts and balances.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getAccounts(userId)),
      }),
      betaTool({
        name: 'get_debts',
        description: 'List money the user has lent or owes.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getDebts(userId)),
      }),
      betaTool({
        name: 'get_savings_trend',
        description: 'Get the last 6 months of net savings, a projection for the current month, and the 6-month average. Use this when the user asks how much they are saving or whether their saving pace changed.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => {
          const data = await this.readTools.getSavingsTrend(userId);
          savingsTrend = data;
          return JSON.stringify(data);
        },
      }),
      betaTool({
        name: 'propose_categorize_transactions',
        description: 'Propose categorizing one or more transactions as a given category. Requires user confirmation — does not change anything by itself.',
        inputSchema: {
          type: 'object',
          properties: {
            transactionIds: { type: 'array', items: { type: 'string' } },
            categoryId: { type: 'string' },
          },
          required: ['transactionIds', 'categoryId'],
        },
        run: async (args) => {
          const result = await this.proposeTools.proposeCategorizeTransactions(userId, conversationId, args as any);
          createdActionId = result.actionId;
          return `Proposal created (id=${result.actionId}): ${result.summary}`;
        },
      }),
      betaTool({
        name: 'propose_create_category',
        description: 'Propose creating a new category. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['expense', 'income', 'both'] },
            wantNeed: { type: 'string', enum: ['want', 'need'] },
            icon: { type: 'string' },
            color: { type: 'string' },
          },
          required: ['name'],
        },
        run: async (args) => {
          const result = await this.proposeTools.proposeCreateCategory(userId, conversationId, args as any);
          createdActionId = result.actionId;
          return `Proposal created (id=${result.actionId}): ${result.summary}`;
        },
      }),
      betaTool({
        name: 'propose_set_budget',
        description: 'Propose creating or updating a category budget for a given month. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            categoryId: { type: 'string' },
            month: { type: 'string', description: 'YYYY-MM' },
            amount: { type: 'number' },
          },
          required: ['categoryId', 'month', 'amount'],
        },
        run: async (args) => {
          const result = await this.proposeTools.proposeSetBudget(userId, conversationId, args as any);
          createdActionId = result.actionId;
          return `Proposal created (id=${result.actionId}): ${result.summary}`;
        },
      }),
      betaTool({
        name: 'propose_set_net_worth_target_date',
        description: 'Propose setting or clearing the target date for the $1,000,000 net-worth goal. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: { targetDate: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null to clear' } },
          required: ['targetDate'],
        },
        run: async (args) => {
          const result = await this.proposeTools.proposeSetNetWorthTargetDate(userId, conversationId, args as any);
          createdActionId = result.actionId;
          return `Proposal created (id=${result.actionId}): ${result.summary}`;
        },
      }),
    ];

    const history = await this.conversations.historyForModel(conversationId, userId);
    const monthNote = monthContext ? `[The user is currently focused on ${monthContext}.] ` : '';
    const messages = [...history.slice(0, -1), { role: 'user' as const, content: `${monthNote}${userText}` }];

    const runner = this.client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      tools,
      messages,
      stream: true,
    });

    for await (const messageStream of runner) {
      for await (const event of messageStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          onTextDelta(event.delta.text);
        }
      }
    }

    const finalMessage = await runner.done();
    const text = finalMessage.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const widget: AiMessageWidget | null = savingsTrend
      ? { type: 'savings_trend', data: savingsTrend }
      : createdActionId
        ? { type: 'proposal', actionId: createdActionId }
        : null;

    return { text, widget };
  }
}
