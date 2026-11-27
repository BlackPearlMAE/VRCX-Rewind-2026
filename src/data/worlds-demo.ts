import { recordedWorldsDemo } from './recorded-worlds-demo';
import type { WorldsPageData } from './worlds-data';

/** Synthetic public aggregates with real world IDs for the existing opt-in artwork lookup. */
export function savedWorldsDemo(): WorldsPageData[] {
  return structuredClone(recordedWorldsDemo.pages);
}
