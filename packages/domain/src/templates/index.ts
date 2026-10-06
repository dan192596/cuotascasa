import { notImplemented } from '../stub.ts';
import type { DeriveFixedChargesFn, InstantiateTemplateFn, ListTemplatesFn } from '../types/engine.ts';

/** Stubs de W2-07. W2-07 reemplaza este archivo (mismas firmas) y borra stub.spec.ts. */
export const listTemplates: ListTemplatesFn = () => notImplemented('W2-07');
export const instantiateTemplate: InstantiateTemplateFn = () => notImplemented('W2-07');
export const deriveFixedCharges: DeriveFixedChargesFn = () => notImplemented('W2-07');
