import { isRate, moneyIsNegative, moneySub, parseRate } from '../money/index.ts';
import type { DeriveFixedChargesFn, InstantiateTemplateFn, ListTemplatesFn } from '../types/engine.ts';
import { type Template, TEMPLATE_IDS, type TemplateInstance, type TemplateRef } from '../types/loan.ts';
import {
  END_OF_MONTH,
  InvalidInputError,
  type PaymentDay,
  RATE_TYPES,
  ROUNDING_PROFILES,
} from '../types/primitives.ts';

/**
 * [ALG.TEMPLATES] Plantillas versionadas en código. Valores genéricos de producto: ningún dato de un préstamo real.
 * Para cambiar una plantilla se agrega una versión nueva; los préstamos guardan una copia ([ALG.TEMPLATES]).
 */
const TEMPLATE_DEFINITIONS: readonly Template[] = [
  {
    id: 'fha-gt',
    version: 1,
    name: 'FHA Guatemala v1',
    values: {
      insuranceRates: [
        { kind: 'mortgageInsurance', rate: parseRate('0.01') },
        { kind: 'lifeInsurance', rate: parseRate('0.0026') },
      ],
      roundingProfile: 'FHA_GT_V1',
      paymentDay: END_OF_MONTH,
      rateType: 'VARIABLE',
      fixedCharges: [],
    },
  },
  {
    id: 'simple',
    version: 1,
    name: 'Hipotecario simple',
    values: { insuranceRates: [], roundingProfile: 'SIMPLE', paymentDay: null, rateType: null, fixedCharges: [] },
  },
];

function isValidPaymentDay(value: PaymentDay | null): boolean {
  return value === null || value === END_OF_MONTH || (Number.isInteger(value) && value >= 1 && value <= 31);
}

/** Valida una plantilla al cargar el módulo: una definición mal formada es un error de programación. */
function assertTemplateValid(template: Template): void {
  const { values } = template;
  const valid =
    TEMPLATE_IDS.includes(template.id) &&
    Number.isInteger(template.version) &&
    template.version >= 1 &&
    template.name.length > 0 &&
    values.insuranceRates.every((insurance) => isRate(insurance.rate)) &&
    ROUNDING_PROFILES.includes(values.roundingProfile) &&
    isValidPaymentDay(values.paymentDay) &&
    (values.rateType === null || RATE_TYPES.includes(values.rateType));
  if (!valid) {
    throw new InvalidInputError('INVALID_TERMS', `Template ${template.id}@${String(template.version)} is malformed`);
  }
}

export function assertCatalogValid(templates: readonly Template[]): void {
  const keys = new Set<string>();
  for (const template of templates) {
    assertTemplateValid(template);
    keys.add(`${template.id}@${String(template.version)}`);
  }
  if (keys.size !== templates.length) {
    throw new InvalidInputError('INVALID_TERMS', 'Duplicate template id and version');
  }
}

assertCatalogValid(TEMPLATE_DEFINITIONS);

function cloneTemplate(template: Template): Template {
  const { values } = template;
  return {
    id: template.id,
    version: template.version,
    name: template.name,
    values: {
      insuranceRates: values.insuranceRates.map((insurance) => ({ ...insurance })),
      roundingProfile: values.roundingProfile,
      paymentDay: values.paymentDay,
      rateType: values.rateType,
      fixedCharges: values.fixedCharges.map((charge) => ({ ...charge })),
    },
  };
}

/** [ALG.TEMPLATES] Las plantillas disponibles. Cada llamada devuelve copias: mutarlas no altera el catálogo. */
export const listTemplates: ListTemplatesFn = () => TEMPLATE_DEFINITIONS.map(cloneTemplate);

/** [ALG.TEMPLATES] Copia profunda y mutable de los valores de una plantilla; desconocida: `UNKNOWN_TEMPLATE`. */
export const instantiateTemplate: InstantiateTemplateFn = (ref: TemplateRef): TemplateInstance => {
  const template = TEMPLATE_DEFINITIONS.find((item) => item.id === ref.id && item.version === ref.version);
  if (template === undefined) {
    throw new InvalidInputError('UNKNOWN_TEMPLATE', 'Unknown template', { id: String(ref.id), version: ref.version });
  }
  const copy = cloneTemplate(template);
  return {
    templateRef: { id: copy.id, version: copy.version },
    insuranceRates: [...copy.values.insuranceRates],
    roundingProfile: copy.values.roundingProfile,
    paymentDay: copy.values.paymentDay,
    rateType: copy.values.rateType,
    fixedCharges: [...copy.values.fixedCharges],
  };
};

/** [ALG.TEMPLATES.FIXED] Cargos fijos = cuota total del banco − level; un negativo lanza `NEGATIVE_FIXED_CHARGES`. */
export const deriveFixedCharges: DeriveFixedChargesFn = (bankTotal, level) => {
  const difference = moneySub(bankTotal, level);
  if (moneyIsNegative(difference)) {
    throw new InvalidInputError('NEGATIVE_FIXED_CHARGES', 'The bank total is lower than the level installment');
  }
  return difference;
};
