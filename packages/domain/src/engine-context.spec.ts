import { describe, expect, it } from 'vitest';
import { createEngineContext } from './engine-context.ts';
import { eventHandlers } from './events/registry.ts';
import { levelPayment, projectCapital, remainingTerm } from './schedule/index.ts';
import type { EngineContext, EventHandlerRegistry, HandlerResult } from './types/engine.ts';

describe('createEngineContext', () => {
  it('defaults to the frozen registry and the schedule/ helpers', () => {
    const ctx = createEngineContext();
    expect(ctx.registry).toBe(eventHandlers);
    expect(ctx.levelPayment).toBe(levelPayment);
    expect(ctx.remainingTerm).toBe(remainingTerm);
    expect(ctx.projectCapital).toBe(projectCapital);
  });

  it('injects test handlers and helpers through overrides', () => {
    const prepayment = (input: Parameters<EventHandlerRegistry['Prepayment']>[0]): HandlerResult => ({
      state: input.state,
    });
    const registry: EventHandlerRegistry = { ...eventHandlers, Prepayment: prepayment };
    const remaining: EngineContext['remainingTerm'] = () => 208;
    const ctx = createEngineContext({ registry, remainingTerm: remaining });
    expect(ctx.registry.Prepayment).toBe(prepayment);
    expect(ctx.registry.RateChange).toBe(eventHandlers.RateChange);
    expect(ctx.remainingTerm).toBe(remaining);
    expect(ctx.levelPayment).toBe(levelPayment);
  });
});
