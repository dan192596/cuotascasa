/**
 * Calendarios sintéticos para las pruebas de `model/` y `csv/` (datos inventados, ninguno real). Los montos son
 * coherentes por fila (total = capital + interés + seguros + cargos fijos) pero no salen del motor.
 */
import {
  type Currency,
  type LocalDate,
  type Money,
  moneyAdd,
  moneySub,
  moneySum,
  parseLocalDate,
  parseMoney,
  type Schedule,
  type ScheduleRow,
} from '@cuotascasa/domain';

interface RowSpec {
  readonly dueDate: string;
  readonly opening: string;
  readonly capital: string;
  readonly interest: string;
  readonly insurance: string;
  readonly fixedCharges: string;
  readonly prepayment?: string;
  readonly commission?: string;
}

function makeRows(specs: readonly RowSpec[]): readonly ScheduleRow[] {
  return specs.map((spec, index): ScheduleRow => {
    const capital = parseMoney(spec.capital);
    const interest = parseMoney(spec.interest);
    const insurance = parseMoney(spec.insurance);
    const fixedCharges = parseMoney(spec.fixedCharges);
    const opening = parseMoney(spec.opening);
    const prepayment = parseMoney(spec.prepayment ?? '0.00');
    const closing = moneySub(opening, capital);
    return {
      k: index + 1,
      dueDate: parseLocalDate(spec.dueDate),
      opening,
      interest,
      insurance,
      insuranceComponents: [insurance],
      capital,
      fixedCharges,
      total: moneySum([capital, interest, insurance, fixedCharges]),
      closing,
      prepayment,
      commission: parseMoney(spec.commission ?? '0.00'),
      closingAfterPrepayment: moneySub(closing, prepayment),
      level: moneySum([capital, interest, insurance]),
      isLast: index === specs.length - 1,
      payoff: false,
      paid: index === 0,
    };
  });
}

function makeSchedule(currency: Currency, rows: readonly ScheduleRow[], endDate: LocalDate): Schedule {
  const sum = (pick: (row: ScheduleRow) => Money): Money => moneySum(rows.map(pick));
  const total = sum((row) => row.total);
  const prepayments = sum((row) => row.prepayment);
  const commissions = sum((row) => row.commission);
  return {
    currency,
    roundingProfile: 'FHA_GT_V1',
    rows,
    totals: {
      interest: sum((row) => row.interest),
      insurance: sum((row) => row.insurance),
      capital: sum((row) => row.capital),
      fixedCharges: sum((row) => row.fixedCharges),
      prepayments,
      commissions,
      total,
      totalPaid: moneyAdd(total, moneyAdd(prepayments, commissions)),
    },
    endDate,
    installmentCount: rows.length,
  };
}

/** Calendario sintético en quetzales: 4 cuotas en 2 años, con un abono y su comisión en la cuota 3. */
export function syntheticGtqSchedule(): Schedule {
  const rows = makeRows([
    {
      dueDate: '2026-11-15',
      opening: '1000.00',
      capital: '200.00',
      interest: '8.00',
      insurance: '1.50',
      fixedCharges: '5.00',
    },
    {
      dueDate: '2026-12-15',
      opening: '800.00',
      capital: '201.00',
      interest: '6.40',
      insurance: '1.20',
      fixedCharges: '5.00',
    },
    {
      dueDate: '2027-01-15',
      opening: '599.00',
      capital: '202.00',
      interest: '4.79',
      insurance: '0.90',
      fixedCharges: '5.00',
      prepayment: '100.00',
      commission: '2.00',
    },
    {
      dueDate: '2027-02-15',
      opening: '297.00',
      capital: '297.00',
      interest: '2.38',
      insurance: '0.45',
      fixedCharges: '5.00',
    },
  ]);
  return makeSchedule('GTQ', rows, parseLocalDate('2027-02-15'));
}

/** Calendario sintético en dólares: 3 cuotas en 2 años, sin abonos. */
export function syntheticUsdSchedule(): Schedule {
  const rows = makeRows([
    {
      dueDate: '2026-12-01',
      opening: '300.00',
      capital: '100.00',
      interest: '2.50',
      insurance: '0.50',
      fixedCharges: '1.00',
    },
    {
      dueDate: '2027-01-01',
      opening: '200.00',
      capital: '100.00',
      interest: '1.67',
      insurance: '0.33',
      fixedCharges: '1.00',
    },
    {
      dueDate: '2027-02-01',
      opening: '100.00',
      capital: '100.00',
      interest: '0.83',
      insurance: '0.17',
      fixedCharges: '1.00',
    },
  ]);
  return makeSchedule('USD', rows, parseLocalDate('2027-02-01'));
}
