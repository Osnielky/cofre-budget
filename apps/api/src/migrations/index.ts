// Listed explicitly (not a glob) so they are bundled by webpack. Append new
// migrations here after generating them.
import { Baseline1790610365591 } from './1790610365591-Baseline';
import { NetWorthSnapshots1790968124309 } from './1790968124309-NetWorthSnapshots';
import { InvestmentsAsSavings1791301606403 } from './1791301606403-InvestmentsAsSavings';
import { UserLastSeen1791904532417 } from './1791904532417-UserLastSeen';
import { CreditCardDetails1792090417461 } from './1792090417461-CreditCardDetails';
import { UserIsDemo1792200000000 } from './1792200000000-UserIsDemo';
import { PageViews1792590514718 } from './1792590514718-PageViews';
import { SupportTickets1792611889908 } from './1792611889908-SupportTickets';
import { VisitorProfile1792783917409 } from './1792783917409-VisitorProfile';
import { AiConversationDeletedAt1793134342276 } from './1793134342276-AiConversationDeletedAt';
import { TransactionTombstones1793199267680 } from './1793199267680-TransactionTombstones';
import { PlaidItemInvestments1793200230767 } from './1793200230767-PlaidItemInvestments';

export const MIGRATIONS = [Baseline1790610365591, NetWorthSnapshots1790968124309, InvestmentsAsSavings1791301606403, UserLastSeen1791904532417, CreditCardDetails1792090417461, UserIsDemo1792200000000, PageViews1792590514718, SupportTickets1792611889908, VisitorProfile1792783917409, AiConversationDeletedAt1793134342276, TransactionTombstones1793199267680, PlaidItemInvestments1793200230767];
