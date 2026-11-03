import type { FeatureContent } from './types';
import part1 from './features-ru1';
import part2 from './features-ru2';
import part3 from './features-ru3';
import part4 from './features-ru4';
export const ruFeatures: Record<string, { imageAlt: string } & FeatureContent> = { ...part1, ...part2, ...part3, ...part4 };
