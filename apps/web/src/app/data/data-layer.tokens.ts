/**
 * Internal tokens of data/ (W0-05). Only data/* imports this file: the lint matrix lets features and core reach
 * data/api.ts and data/tokens.ts only. W3-10 provides them; stores (W3-11), engine (W3-12), backup (W4-08) and
 * sync (W4-09) inject them.
 */
import { InjectionToken } from '@angular/core';
import type { Clock, DataStore, IdGenerator } from '@cuotascasa/persistence';

/** The DataStore opens asynchronously (DataStoreFactory); consumers await it. */
export const DATA_STORE = new InjectionToken<Promise<DataStore>>('DataStore');
/** Injectable clock: now() stamps, today() is the asOf of spec §9. */
export const CLOCK = new InjectionToken<Clock>('Clock');
export const ID_GENERATOR = new InjectionToken<IdGenerator>('IdGenerator');
