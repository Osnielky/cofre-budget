import { SetMetadata } from '@nestjs/common';

export const PLAN_KEY = 'requiredPlan';
export const RequiresPlan = (...plans: string[]) => SetMetadata(PLAN_KEY, plans);
