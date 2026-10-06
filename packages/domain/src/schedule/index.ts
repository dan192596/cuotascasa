import { notImplemented } from '../stub.ts';
import type {
  BuildScheduleFn,
  LevelPaymentFn,
  ProjectCapitalFn,
  RemainingTermFn,
  RunScheduleFn,
  YearlySubtotalsFn,
} from '../types/engine.ts';

/** Stubs de W1-01. W1-01 reemplaza este archivo (mismas firmas) y borra stub.spec.ts. */
export const runSchedule: RunScheduleFn = () => notImplemented('W1-01');
export const buildSchedule: BuildScheduleFn = () => notImplemented('W1-01');
export const levelPayment: LevelPaymentFn = () => notImplemented('W1-01');
export const remainingTerm: RemainingTermFn = () => notImplemented('W1-01');
export const projectCapital: ProjectCapitalFn = () => notImplemented('W1-01');
export const yearlySubtotals: YearlySubtotalsFn = () => notImplemented('W1-01');
