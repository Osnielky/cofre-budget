import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { AiConversationsService } from './ai-conversations.service';
import { AiReadToolsService } from './ai-read-tools.service';
import { AiProposeToolsService } from './ai-propose-tools.service';
import type { AiMessageWidget, SavingsTrendWidgetData, SafeToSpendWidgetData } from './ai-message.entity';
import { timed } from '../common/logging/timed';
import { buildSnapshot, composeTurn } from './ai-snapshot';

const MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 8192;
/** Earlier messages sent with each turn. The snapshot carries the current state, so old
 *  turns only matter for conversational continuity. */
const HISTORY_WINDOW = 20;

/**
 * Stable for every user and every turn — it is the cached prefix (tools render before
 * it, so the cache block on this text covers them too). Anything per-user or per-turn
 * goes in the <snapshot> block of the user message (ai-snapshot.ts), never here.
 */
const SYSTEM_PROMPT = `You are Cofre, the personal finance advisor built into the Cofre budget app. You advise one person: the user you are talking to. Everything you say is about their own money — the accounts, transactions, categories, budgets, debts, credit cards, projects and net-worth goal that Cofre holds for them. Your purpose is to help them waste less, keep more, pay less interest and reach $1,000,000 in net worth sooner.

# Scope
In scope: their spending, income, saving rate, budgets, cash flow, subscriptions and recurring charges, credit cards and interest, debts, net worth and the pace toward the goal, and how a purchase or decision they describe would affect those numbers.
Out of scope — decline in one sentence and offer the nearest thing you can do with their data: anything not about this user's finances (general knowledge, other people's money, coding, writing, trivia); picking specific stocks, funds, crypto or timing the market; tax filing, legal or insurance advice beyond general awareness; and anything that would need information Cofre does not hold. You are an educational tool, not a licensed financial, tax or legal advisor — say so when a decision is large enough to warrant a professional.

# How you answer
Every message starts with a <snapshot> block: today's date, the month the user is looking at, their accounts and balances, net worth, the month's income / spending / budgets, and their category names. Treat it as fact and answer from it directly when it already holds the number. Use "the month the user is looking at" as the period whenever they say "this month" or give no period.
Every figure you state comes from the snapshot or a tool result — never estimate, round from memory, or invent an amount, rate, fee, date or merchant. If the data is not there, say what is missing and how they can add it (connect the account, set the budget, enter the card's APR).
Pick the smallest tool call that answers: get_spending_summary for "where did my money go" / "how much on X" / "biggest expenses" (by category, merchant or month); get_budgets for budget status; get_transactions only when the user needs the individual rows (a specific merchant, categorizing, something to link). Combine calls in one turn when you need several.
Lead with the number, then the one or two insights that matter, then the single most useful next step. Be direct and specific; no generic tips, no lists of everything you could say. Keep replies short and conversational — under 120 words unless the user asks for detail. Use plain Markdown; a small table only when comparing several items.

# Money rules
Categories of type 'savings' (such as Investments) hold money the user moved into savings or investments: it is still theirs, so never count it as spending — it is progress toward the goal. Rows with a 'transfer' category, debt payments, and anything on a tracking account (investment, mortgage, other asset or liability) are not income or spending either. Brokerage buys and sells are trades, not spending.

Credit cards: get_credit_cards gives each card's APRs, limit, utilization, statement, minimum payment, due date and the user's card goals; get_transactions can filter by accountId to compare spending per card. When a card lists something under "missing", say so and point them to the Cards page. You do not know any card's rewards program or fees — never claim one card earns more unless the user gives the terms. Under 30% utilization per card and overall helps credit scores; paying the highest-APR balance first minimizes interest.

Projects and debts: the user files some transactions under a PROJECT (a side venture, flip, trading account or small business — get_projects lists each one with the categories it accepts and whether it is closed) or against a DEBT (money lent to or owed to a person — get_debts). A project row is categorized by its project and a debt payment by its debt, so neither is uncategorized. Before you categorize anything, call get_projects and get_debts: if a merchant or person plainly matches an active project, propose propose_link_to_project with the matching project category instead of a budget category; if a deposit comes from someone who owes the user, or a payment goes to someone they owe, propose propose_link_to_debt instead of calling it income or spending. Only suggest a brand-new budget category when no project, debt or existing category fits.

# Changes
You can propose changes: categorizing transactions, creating a category, setting a budget, linking transactions to a project, recording debt payments, or setting the goal's target date. A propose_* call only creates a pending proposal the user confirms in the UI — say "I've proposed…", never claim you changed something. One proposal per turn. There is no tool for moving money, paying bills or anything else — never imply you can.`;

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
  private readonly logger = new Logger(AiChatService.name);
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
    let safeToSpend: SafeToSpendWidgetData | null = null;

    const tools = [
      betaTool({
        name: 'get_transactions',
        description: 'List the user\'s transactions (each with its account, and its projectId / projectCategory / debtId when it is filed under a project or a debt), optionally filtered by date range, category, merchant, account, or uncategorized-only (rows linked to a project or a debt are not uncategorized). Brokerage buys and sells are left out unless includeTrades is true — they move money between cash and holdings inside an investment account and are never income, spending or something to categorize; deposits, dividends and interest on the same account are always included.',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
            endDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
            categoryId: { type: 'string' },
            uncategorizedOnly: { type: 'boolean' },
            merchant: { type: 'string', description: 'Case-insensitive substring match on merchant or transaction name' },
            accountId: { type: 'string', description: 'Only this account (id from get_accounts or get_credit_cards)' },
            includeTrades: { type: 'boolean', description: 'Also return brokerage buys and sells (each tagged with `trade`), e.g. when the user asks what they bought or sold' },
            limit: { type: 'number', description: 'Max results, default 100, capped at 500' },
          },
        },
        run: async (args) => JSON.stringify(await this.readTools.getTransactions(userId, args as any)),
      }),
      betaTool({
        name: 'get_spending_summary',
        description: 'Spending in a date range, grouped by category, merchant or month: each group\'s total and count plus the period total, largest first (months in calendar order), capped at 25 groups plus Other. Money out only, with transfers, savings, debt payments, trades and tracking accounts left out. Use this for "where did my money go", "how much on X", "biggest expenses", "spending by month" instead of listing transactions.',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
            endDate: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
            groupBy: { type: 'string', enum: ['category', 'merchant', 'month'] },
          },
          required: ['startDate', 'endDate', 'groupBy'],
        },
        run: async (args) => JSON.stringify(await this.readTools.getSpendingSummary(userId, args as any)),
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
        name: 'get_credit_cards',
        description: 'List the user\'s credit cards: APRs, credit limit, utilization, statement balance, minimum payment, due date, estimated monthly interest, which facts are missing, plus the user\'s card goals (goal, credit score band, monthly debt budget).',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getCreditCards(userId)),
      }),
      betaTool({
        name: 'get_debts',
        description: 'List money the user has lent or owes.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getDebts(userId)),
      }),
      betaTool({
        name: 'get_projects',
        description: 'List the user\'s projects (side ventures, flips, trading accounts, businesses) with their totals and the project categories each accepts. Closed projects are flagged and cannot take new transactions.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => JSON.stringify(await this.readTools.getProjects(userId)),
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
        name: 'get_safe_to_spend',
        description: 'Calculate how much the user can safely spend or save this month: projected income minus their planned (budgeted) spending minus a 5% safety buffer. Use this when the user asks how much they can safely spend, save, or afford something this month.',
        inputSchema: {
          type: 'object',
          properties: { month: { type: 'string', description: 'YYYY-MM, defaults to the current month' } },
        },
        run: async (args) => {
          const data = await this.readTools.getSafeToSpend(userId, args as any);
          safeToSpend = data;
          return JSON.stringify(data);
        },
      }),
      betaTool({
        name: 'propose_categorize_transactions',
        description: 'Propose categorizing one or more transactions as a given budget category. Not for rows that belong to a project or a debt — use propose_link_to_project / propose_link_to_debt for those. Requires user confirmation — does not change anything by itself.',
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
        name: 'propose_link_to_project',
        description: 'Propose filing one or more transactions under an active project, optionally with one of that project\'s categories (ids from get_projects). Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            transactionIds: { type: 'array', items: { type: 'string' } },
            projectId: { type: 'string' },
            projectCategoryId: { type: ['string', 'null'], description: 'One of the project\'s category ids, or null for the project itself' },
          },
          required: ['transactionIds', 'projectId'],
        },
        run: async (args) => {
          const result = await this.proposeTools.proposeLinkToProject(userId, conversationId, args as any);
          createdActionId = result.actionId;
          return `Proposal created (id=${result.actionId}): ${result.summary}`;
        },
      }),
      betaTool({
        name: 'propose_link_to_debt',
        description: 'Propose recording one or more transactions as payments on a debt (id from get_debts): a deposit from someone who owes the user, or a payment to someone the user owes. Requires user confirmation.',
        inputSchema: {
          type: 'object',
          properties: {
            transactionIds: { type: 'array', items: { type: 'string' } },
            debtId: { type: 'string' },
          },
          required: ['transactionIds', 'debtId'],
        },
        run: async (args) => {
          const result = await this.proposeTools.proposeLinkToDebt(userId, conversationId, args as any);
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
            type: { type: 'string', enum: ['expense', 'income', 'both', 'savings'], description: "'savings' = money the user keeps (investing, retirement, savings); not counted as spending." },
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

    // The controller stored the user's message before calling us, so the history ends
    // with it; composeTurn re-sends that last message with the fresh snapshot in front.
    const [history, snapshot] = await Promise.all([
      this.conversations.historyForModel(conversationId, userId),
      this.readTools.getSnapshot(userId, monthContext ?? null),
    ]);
    const stored = history.length && history[history.length - 1].role === 'user' ? history : [...history, { role: 'user' as const, content: userText }];
    const messages = composeTurn(stored, buildSnapshot(snapshot), HISTORY_WINDOW);

    const runner = this.client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // One breakpoint after the stable prefix (tools + this text); the snapshot and the
      // conversation come after it, so every turn and every tool round reads it from cache.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      tools,
      messages,
      stream: true,
    });

    // The whole streamed exchange, tool rounds included — slow by nature, so a
    // higher bar than other outside calls before it counts as slow.
    const finalMessage = await timed('anthropic', 'chat', async () => {
      for await (const messageStream of runner) {
        for await (const event of messageStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            onTextDelta(event.delta.text);
          }
        }
      }
      return runner.done();
    }, { slowMs: 30_000 });
    // Token counts only (never text): cache_read should be most of the input on every
    // turn after the first — zero means something is breaking the stable prefix.
    const u = finalMessage.usage;
    this.logger.log('Ask Cofre turn', {
      model: MODEL,
      inputTokens: u.input_tokens,
      cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
      outputTokens: u.output_tokens,
      stopReason: finalMessage.stop_reason,
    });
    const text = finalMessage.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // A pending action with no way to confirm/reject it is stranded forever (there's
    // no fallback surface for it), whereas a suppressed read-only widget just means
    // the user can ask again — so `proposal` always wins when multiple were produced.
    const widget: AiMessageWidget | null = createdActionId
      ? { type: 'proposal', actionId: createdActionId }
      : safeToSpend
        ? { type: 'safe_to_spend', data: safeToSpend }
        : savingsTrend
          ? { type: 'savings_trend', data: savingsTrend }
          : null;

    return { text, widget };
  }
}
