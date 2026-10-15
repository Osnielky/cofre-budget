import type { CardGoal, ScoreBand } from './types';

export const GOAL_LABELS: Record<CardGoal, string> = {
  pay_off_debt: 'Pay off debt',
  cashback: 'Earn cash back',
  travel: 'Earn travel points',
  build_credit: 'Build my credit',
};

export const SCORE_BANDS: { value: ScoreBand; label: string }[] = [
  { value: '<580', label: 'Under 580' },
  { value: '580-669', label: '580–669 (fair)' },
  { value: '670-739', label: '670–739 (good)' },
  { value: '740-799', label: '740–799 (very good)' },
  { value: '800+', label: '800+ (excellent)' },
];
