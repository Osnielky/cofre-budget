// Listed explicitly (not a glob) so they are bundled by webpack. Append new
// migrations here after generating them.
import { Baseline1790610365591 } from './1790610365591-Baseline';
import { NetWorthSnapshots1790968124309 } from './1790968124309-NetWorthSnapshots';
import { InvestmentsAsSavings1791301606403 } from './1791301606403-InvestmentsAsSavings';

export const MIGRATIONS = [Baseline1790610365591, NetWorthSnapshots1790968124309, InvestmentsAsSavings1791301606403];
