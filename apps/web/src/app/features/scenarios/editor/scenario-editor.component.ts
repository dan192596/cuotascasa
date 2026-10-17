import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { type FieldTree, form, FormField, FormRoot, required, validate } from '@angular/forms/signals';
import type { Money, Paths, PrepaymentMode } from '@cuotascasa/domain';
import { type Scenario, type ScenarioEvent, scenarioEventSchema, type Uuid } from '@cuotascasa/schema';
import { DataError } from '../../../data/api.ts';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE, SCENARIOS_STORE } from '../../../data/tokens.ts';
import { BannerComponent } from '../../../ui/feedback/banner.component.ts';
import { formatMoney } from '../../../ui/format/format.ts';
import { LocalDatePipe } from '../../../ui/format/local-date.pipe.ts';
import { MoneyPipe } from '../../../ui/format/money.pipe.ts';
import { DateInputComponent } from '../../../ui/money-input/date-input.component.ts';
import { MoneyInputComponent } from '../../../ui/money-input/money-input.component.ts';
import { RateInputComponent } from '../../../ui/money-input/rate-input.component.ts';
import {
  type AdvanceModel,
  advanceEvent,
  amountError,
  decideApply,
  countError,
  dateError,
  describeEvent,
  domainErrorText,
  dryRun,
  duplicateName,
  type ApplyPlan,
  eventExtra,
  type EventExtra,
  hasSamePhase3Event,
  planApply,
  type RemovedEvent,
  type GoalInput,
  type GoalOutcome,
  goalPrepayment,
  installmentFor,
  type LoanFacts,
  nameError,
  type PrepaymentModel,
  prepaymentEvent,
  seekGoal,
} from './scenario-editor.logic.ts';

type Scope = 'scenarios' | 'abono' | 'advance' | 'goal';
type GoalKind = 'FINISH_BY' | 'MAX_INSTALLMENT';

interface GoalModel {
  kind: GoalKind;
  date: string;
  targetDate: string;
  targetAmount: string;
}

interface GoalState {
  readonly outcome: GoalOutcome;
  readonly input: GoalInput;
  /** The paths the result was computed on: it is only valid while they are still the current ones. */
  readonly paths: Paths;
  /** New level installment of a REDUCE_INSTALLMENT result (the `level` of the next row once applied), or null. */
  readonly level: Money | null;
}

/** An apply that waits for the user to accept removing own events that would fall after the new end. */
interface PendingApply {
  readonly plan: Extract<ApplyPlan, { kind: 'ok' }>;
}

interface EventRow {
  readonly event: ScenarioEvent;
  readonly text: string;
  readonly k: number;
  /** True when the event falls on an installment that already has real data: the engine cannot apply it. */
  readonly blocked: boolean;
  readonly extra: EventExtra | null;
}

const MODE_OPTIONS: readonly { readonly value: PrepaymentMode; readonly label: string }[] = [
  { value: 'REDUCE_TERM', label: 'Reducir el plazo (la cuota sigue igual)' },
  { value: 'REDUCE_INSTALLMENT', label: 'Reducir la cuota (el plazo sigue igual)' },
];

const DATA_CHANGED = 'Los datos cambiaron; vuelve a calcular.';
const STALE_GOAL = 'El abono calculado ya no cumple la meta con los datos actuales; vuelve a calcular.';
const SAME_DAY = 'Ya hay un abono o adelanto en esa fecha en el escenario. Elige otra fecha o quítalo primero.';

const ZERO_RATE = /^0(\.0+)?$/;

let nextInstance = 0;

function emptyAbono(): PrepaymentModel {
  return {
    date: '',
    amount: '',
    mode: 'REDUCE_TERM',
    commissionKind: 'NONE',
    commissionAmount: '',
    commissionRate: '',
  };
}

function emptyAdvance(): AdvanceModel {
  return { date: '', count: '' };
}

function emptyGoal(): GoalModel {
  return { kind: 'FINISH_BY', date: '', targetDate: '', targetAmount: '' };
}

function problem(message: string | undefined): { kind: string; message: string } | undefined {
  return message === undefined ? undefined : { kind: 'scenario-editor', message };
}

function dataErrorText(error: DataError): string {
  switch (error.code) {
    case 'NOT_FOUND':
      return 'El escenario ya no existe. Recarga la página e inténtalo de nuevo.';
    case 'VALIDATION':
      return 'Los datos del escenario no son válidos. Revisa lo que escribiste.';
    case 'STORAGE':
      return 'No se pudo guardar. Revisa el almacenamiento del navegador e inténtalo de nuevo.';
    default:
      return 'No se pudo guardar. Inténtalo de nuevo.';
  }
}

/** A macrotask turn, so the busy state paints before the engine runs. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Scenarios editor (R6, R17; HU-13 to HU-15): create, rename, duplicate, delete and activate scenarios, list their
 * hypothetical events, and the tools «Abono único», «Adelantar cuotas» and the goal-seek on the active scenario
 * (component-contracts §5). Every event is judged by the domain before it is saved; the engine's metrics are shown as
 * they are, with their sign.
 */
@Component({
  selector: 'cc-scenario-editor',
  imports: [
    FormField,
    FormRoot,
    BannerComponent,
    DateInputComponent,
    MoneyInputComponent,
    RateInputComponent,
    MoneyPipe,
    LocalDatePipe,
  ],
  templateUrl: './scenario-editor.component.html',
  styleUrl: './scenario-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioEditorComponent {
  readonly loanId = input.required<Uuid>();

  protected readonly modeOptions = MODE_OPTIONS;

  private readonly loansStore = inject(LOANS_STORE);
  private readonly scenariosStore = inject(SCENARIOS_STORE);
  private readonly service = inject(LOAN_PROJECTION_SERVICE);
  private readonly injector = inject(Injector);
  private readonly uid = `se${++nextInstance}`;

  private readonly projection = computed(() => this.service.forLoan(this.loanId()));
  private readonly loan = computed(() => this.loansStore.loan(this.loanId())());
  private readonly scenarioList = computed(() => this.scenariosStore.listByLoan(this.loanId())());
  private readonly activeSignal = computed(() => this.scenariosStore.activeScenarioId(this.loanId()));

  protected readonly scenarios = computed(() => this.scenarioList().filter((scenario) => scenario.deletedAt === null));
  protected readonly activeId = computed(() => this.activeSignal()());
  protected readonly active = computed(
    () => this.scenarios().find((scenario) => scenario.id === this.activeId()) ?? null,
  );
  protected readonly facts = computed<LoanFacts | null>(() => {
    const loan = this.loan();
    return loan === undefined
      ? null
      : {
          firstDueDate: loan.firstDueDate,
          paymentDay: loan.paymentDay,
          disbursementDate: loan.disbursementDate,
          currency: loan.currency,
        };
  });
  protected readonly currency = computed(() => this.facts()?.currency ?? 'GTQ');
  private readonly paths = computed(() => this.projection().paths());
  protected readonly metrics = computed(() => this.projection().metrics()?.activeScenarioVsReal ?? null);
  /** The engine could not compute the active scenario (events) or the loan itself (no paths). */
  protected readonly engineNotice = computed(() => {
    const error = this.projection().error();
    if (this.active() === null || error === null) {
      return null;
    }
    return { text: domainErrorText(error), scenarioCause: this.paths() !== null };
  });
  /** The event forms need an active scenario and paths: they stay available when only the scenario errored. */
  protected readonly canEdit = computed(() => this.active() !== null && this.paths() !== null && this.facts() !== null);
  /** The goal-seek also needs a scenario the engine can compute. */
  protected readonly goalReady = computed(() => this.canEdit() && this.engineNotice() === null);
  protected readonly eventRows = computed<readonly EventRow[]>(() => {
    const active = this.active();
    const facts = this.facts();
    if (active === null || facts === null) {
      return [];
    }
    const cutoff = this.projection().cutoffK();
    const paths = this.paths();
    const live = active.events.filter((event) => event.deletedAt === null);
    return live.map((event) => {
      const k = installmentFor(facts, event.date);
      return {
        event,
        text: describeEvent(event, facts),
        k,
        blocked: k <= cutoff,
        extra: paths === null ? null : eventExtra(paths, facts, event, live),
      };
    });
  });

  /** Operation failure shown next to the section that raised it. */
  protected readonly failure = signal<{ readonly scope: Scope; readonly text: string } | null>(null);
  protected readonly renamingId = signal<Uuid | null>(null);
  protected readonly editingEventId = signal<string | null>(null);
  /** Scenario whose deletion waits for the inline confirmation. */
  protected readonly pendingDelete = signal<Scenario | null>(null);
  /** Text of the single polite live region: results are announced there, never in several regions at once. */
  protected readonly status = signal('');
  private announcements = 0;
  protected readonly goalBusy = signal(false);
  /** The last goal-seek result; it is dropped as soon as the active scenario changes. */
  protected readonly goalState = linkedSignal<Paths | null, GoalState | null>({
    source: this.paths,
    computation: () => null,
  });
  /** Own events that would be removed by an apply, waiting for the user's decision. */
  protected readonly pendingApply = linkedSignal<GoalState | null, PendingApply | null>({
    source: this.goalState,
    computation: () => null,
  });
  /** Serializes the writes to the active scenario: each one re-reads it, so none overwrites another (I2). */
  private chain: Promise<unknown> = Promise.resolve();

  protected readonly nameModel = signal({ name: '' });
  protected readonly abonoModel = signal<PrepaymentModel>(emptyAbono());
  protected readonly advanceModel = signal<AdvanceModel>(emptyAdvance());
  protected readonly goalModel = signal<GoalModel>(emptyGoal());

  private readonly focusFirstInvalid = (field: FieldTree<unknown>): void => {
    afterNextRender(() => field().errorSummary()[0]?.fieldTree().focusBoundControl(), { injector: this.injector });
  };

  protected readonly nameForm = form(
    this.nameModel,
    (path) => {
      validate(path.name, ({ value }) => problem(nameError(value())));
    },
    { submission: { action: async () => this.saveName(), onInvalid: this.focusFirstInvalid } },
  );

  protected readonly abonoForm = form(
    this.abonoModel,
    (path) => {
      validate(path.date, ({ value }) => problem(this.dateRule(value())));
      required(path.amount, { message: 'Escribe un monto.' });
      validate(path.amount, ({ value }) => (value() === '' ? undefined : problem(amountError(value()))));
      required(path.mode, { message: 'Elige si el abono reduce el plazo o la cuota.' });
      required(path.commissionAmount, {
        message: 'Escribe el monto de la comisión.',
        when: ({ valueOf }) => valueOf(path.commissionKind) === 'FLAT',
      });
      validate(path.commissionAmount, ({ value, valueOf }) =>
        valueOf(path.commissionKind) === 'FLAT' && value() !== '' ? problem(amountError(value())) : undefined,
      );
      required(path.commissionRate, {
        message: 'Escribe el porcentaje de la comisión.',
        when: ({ valueOf }) => valueOf(path.commissionKind) === 'PERCENT',
      });
      validate(path.commissionRate, ({ value, valueOf }) =>
        valueOf(path.commissionKind) === 'PERCENT' && ZERO_RATE.test(value())
          ? problem('La comisión debe ser mayor que cero.')
          : undefined,
      );
    },
    { submission: { action: async () => this.saveAbono(), onInvalid: this.focusFirstInvalid } },
  );

  protected readonly advanceForm = form(
    this.advanceModel,
    (path) => {
      validate(path.date, ({ value }) => problem(this.dateRule(value())));
      validate(path.count, ({ value }) => problem(countError(value())));
    },
    { submission: { action: async () => this.saveAdvance(), onInvalid: this.focusFirstInvalid } },
  );

  protected readonly goalForm = form(
    this.goalModel,
    (path) => {
      validate(path.date, ({ value }) => problem(this.dateRule(value())));
      validate(path.targetDate, ({ value, valueOf }) =>
        valueOf(path.kind) === 'FINISH_BY' ? problem(this.dateRule(value())) : undefined,
      );
      validate(path.targetAmount, ({ value, valueOf }) =>
        valueOf(path.kind) === 'MAX_INSTALLMENT' ? problem(amountError(value(), { allowZero: true })) : undefined,
      );
    },
    { submission: { action: async () => this.seek(), onInvalid: this.focusFirstInvalid } },
  );

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** DOM id of a control of this instance. */
  protected id(name: string): string {
    return `${this.uid}-${name}`;
  }

  protected showsErrors(field: FieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.errors().length > 0;
  }

  protected failureOf(scope: Scope): string | null {
    const current = this.failure();
    return current?.scope === scope ? current.text : null;
  }

  private dateRule(value: string): string | undefined {
    const facts = this.facts();
    return facts === null ? undefined : dateError(value, facts);
  }

  /** Polite announcement; a changing invisible suffix makes a repeated message be read again. */
  private say(message: string): void {
    this.announcements += 1;
    this.status.set(this.announcements % 2 === 0 ? message : `${message}\u00a0`);
  }

  private newId(): string {
    return globalThis.crypto.randomUUID();
  }

  private focusControl(name: string): void {
    afterNextRender(() => document.getElementById(this.id(name))?.focus(), { injector: this.injector });
  }

  /** Runs a store write: a DataError becomes a Spanish message in its section; anything else keeps propagating. */
  private async guard(scope: Scope, write: () => Promise<void>): Promise<boolean> {
    this.failure.set(null);
    try {
      await write();
      return true;
    } catch (error) {
      if (error instanceof DataError) {
        this.failure.set({ scope, text: dataErrorText(error) });
        return false;
      }
      throw error;
    }
  }

  private saveEvents(scenario: Scenario, events: readonly ScenarioEvent[]): Promise<Scenario> {
    return this.scenariosStore.update({
      id: scenario.id,
      loanId: scenario.loanId,
      name: scenario.name,
      events: [...events],
    });
  }

  /* ---------- Scenarios ---------- */

  protected async saveName(): Promise<undefined> {
    const name = this.nameModel().name.trim();
    const renaming = this.renamingId();
    const ok = await this.guard('scenarios', async () => {
      if (renaming === null) {
        const created = await this.scenariosStore.create({ loanId: this.loanId(), name, events: [] });
        this.say(`Escenario «${name}» creado.`);
        if (this.activeId() === null) {
          try {
            await this.scenariosStore.setActiveScenario(this.loanId(), created.id);
          } catch (error) {
            if (!(error instanceof DataError)) {
              throw error;
            }
            this.failure.set({
              scope: 'scenarios',
              text: `Se creó el escenario «${name}», pero no se pudo activar. Actívalo con su botón «Activar».`,
            });
          }
        }
      } else {
        // Queued, and the scenario is read when its turn comes: a removal in flight must not be overwritten.
        await this.enqueue(async () => {
          const current = this.scenarios().find((scenario) => scenario.id === renaming);
          if (current === undefined) {
            throw new DataError('NOT_FOUND');
          }
          await this.scenariosStore.update({
            id: current.id,
            loanId: current.loanId,
            name,
            events: [...current.events],
          });
        });
        this.say(`Escenario renombrado a «${name}».`);
      }
    });
    if (ok) {
      this.renamingId.set(null);
      this.nameForm().reset({ name: '' });
    }
    return undefined;
  }

  protected startRename(scenario: Scenario): void {
    this.renamingId.set(scenario.id);
    this.nameForm().reset({ name: scenario.name });
    this.focusControl('name');
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.nameForm().reset({ name: '' });
  }

  protected async activate(scenario: Scenario): Promise<void> {
    const ok = await this.guard('scenarios', async () => {
      await this.scenariosStore.setActiveScenario(this.loanId(), scenario.id);
      this.say(`Escenario «${scenario.name}» activo.`);
    });
    if (ok) {
      this.focusControl('active-title');
    }
  }

  protected async duplicate(scenario: Scenario): Promise<void> {
    await this.guard('scenarios', async () => {
      const name = duplicateName(scenario.name);
      await this.scenariosStore.create({
        loanId: scenario.loanId,
        name,
        events: scenario.events
          .filter((event) => event.deletedAt === null)
          .map((event) => ({ ...event, id: this.newId() })),
      });
      this.say(`Escenario «${name}» creado como copia.`);
    });
  }

  protected askDelete(scenario: Scenario): void {
    this.pendingDelete.set(scenario);
    this.focusControl('delete-cancel');
  }

  protected cancelDelete(): void {
    const scenario = this.pendingDelete();
    this.pendingDelete.set(null);
    if (scenario !== null) {
      afterNextRender(() => document.getElementById(this.id(`delete-${scenario.id}`))?.focus(), {
        injector: this.injector,
      });
    }
  }

  protected async confirmDelete(): Promise<void> {
    const scenario = this.pendingDelete();
    this.pendingDelete.set(null);
    if (scenario === null) {
      return;
    }
    const ok = await this.guard('scenarios', async () => {
      await this.scenariosStore.delete(scenario.id);
      this.say(`Escenario «${scenario.name}» eliminado.`);
    });
    if (ok) {
      if (this.renamingId() === scenario.id) {
        this.cancelRename();
      }
      // The delete button is gone: focus goes to the list heading.
      this.focusControl('list-title');
    }
  }

  protected liveEventCount(scenario: Scenario): number {
    return scenario.events.filter((event) => event.deletedAt === null).length;
  }

  /* ---------- Hypothetical events ---------- */

  /**
   * Saves `candidate` into the active scenario after the domain judged the result. `replacing` is the id of the event
   * it edits. The domain's typed error, in Spanish, is the rejection. Runs in the write queue: it reads the active
   * scenario and the paths when its turn comes.
   */
  private addEvent(scope: 'abono' | 'advance', candidate: ScenarioEvent, replacing: string | null): Promise<boolean> {
    return this.enqueue(async () => {
      const active = this.active();
      const paths = this.paths();
      if (active === null || paths === null) {
        return false;
      }
      if (!scenarioEventSchema.safeParse(candidate).success) {
        this.failure.set({ scope, text: 'No se pudo guardar. Revisa los datos del formulario.' });
        return false;
      }
      const live = active.events.filter((event) => event.deletedAt === null);
      if (replacing !== null && !live.some((event) => event.id === replacing)) {
        this.failure.set({ scope, text: 'El evento que editabas ya no existe en el escenario.' });
        return false;
      }
      const events =
        replacing === null ? [...live, candidate] : live.map((event) => (event.id === replacing ? candidate : event));
      const error = dryRun(paths, events);
      if (error !== null) {
        this.failure.set({ scope, text: domainErrorText(error) });
        this.focusControl(`${scope}-date`);
        return false;
      }
      return this.guard(scope, async () => {
        await this.saveEvents(active, events);
      });
    });
  }

  protected async saveAbono(): Promise<undefined> {
    this.failure.set(null);
    const editing = this.editingEventId();
    const candidate = prepaymentEvent(editing ?? this.newId(), this.abonoModel());
    if (await this.addEvent('abono', candidate, editing)) {
      const message = editing === null ? 'Abono agregado al escenario.' : 'Abono actualizado.';
      this.say(message);
      this.editingEventId.set(null);
      this.abonoForm().reset(emptyAbono());
    }
    return undefined;
  }

  protected async saveAdvance(): Promise<undefined> {
    this.failure.set(null);
    const candidate = advanceEvent(this.newId(), this.advanceModel());
    if (await this.addEvent('advance', candidate, null)) {
      this.say('Adelanto de cuotas agregado al escenario.');
      this.advanceForm().reset(emptyAdvance());
    }
    return undefined;
  }

  protected editEvent(event: ScenarioEvent): void {
    if (event.type !== 'Prepayment') {
      return;
    }
    this.failure.set(null);
    this.editingEventId.set(event.id);
    this.abonoForm().reset({
      date: event.date,
      amount: event.amount,
      mode: event.mode,
      commissionKind: event.commission?.kind ?? 'NONE',
      commissionAmount: event.commission?.kind === 'FLAT' ? event.commission.amount : '',
      commissionRate: event.commission?.kind === 'PERCENT' ? event.commission.rate : '',
    });
    this.focusControl('abono-amount');
  }

  protected cancelEditEvent(): void {
    this.editingEventId.set(null);
    this.abonoForm().reset(emptyAbono());
  }

  protected async removeEvent(row: EventRow): Promise<void> {
    const ok = await this.enqueue(async () => {
      const active = this.active();
      if (active === null) {
        return false;
      }
      return this.guard('scenarios', async () => {
        await this.saveEvents(
          active,
          active.events.filter((event) => event.deletedAt === null && event.id !== row.event.id),
        );
        this.say('Evento quitado del escenario.');
      });
    });
    if (ok) {
      if (this.editingEventId() === row.event.id) {
        this.cancelEditEvent();
      }
      this.focusControl('events-title');
    }
  }

  /* ---------- Goal-seek ---------- */

  protected async seek(): Promise<undefined> {
    const paths = this.paths();
    const active = this.active();
    const facts = this.facts();
    if (paths === null || active === null || facts === null || this.goalBusy()) {
      return undefined;
    }
    const model = this.goalModel();
    this.failure.set(null);
    this.goalState.set(null);
    // Opus C2: a same-date prepayment or advance of the scenario would sort after the applied abono.
    if (hasSamePhase3Event(active.events, model.date)) {
      this.failure.set({ scope: 'goal', text: SAME_DAY });
      return undefined;
    }
    const input: GoalInput = {
      prepaymentDate: model.date,
      goal:
        model.kind === 'FINISH_BY'
          ? { kind: 'FINISH_BY', date: model.targetDate }
          : { kind: 'MAX_INSTALLMENT', amount: model.targetAmount },
    };
    this.goalBusy.set(true);
    try {
      await nextTurn();
      // I1: the data changed while the engine was about to run: the result would describe an older scenario.
      if (this.paths() !== paths) {
        this.failure.set({ scope: 'goal', text: DATA_CHANGED });
        return undefined;
      }
      const outcome = seekGoal(paths, input);
      this.report(outcome, input, paths, facts, active);
    } finally {
      this.goalBusy.set(false);
    }
    return undefined;
  }

  private report(outcome: GoalOutcome, input: GoalInput, paths: Paths, facts: LoanFacts, active: Scenario): void {
    const currency = this.currency();
    switch (outcome.kind) {
      case 'ERROR':
        this.failure.set({ scope: 'goal', text: domainErrorText(outcome.error) });
        return;
      case 'ALREADY_MET':
        this.goalState.set({ outcome, input, paths, level: null });
        this.say('La meta ya se cumple con el escenario actual; no hace falta abonar.');
        return;
      case 'FOUND': {
        let level: Money | null = null;
        if (outcome.mode === 'REDUCE_INSTALLMENT') {
          const plan = planApply(
            paths,
            active.events,
            goalPrepayment(this.newId(), input.prepaymentDate, outcome),
            facts,
          );
          const next =
            plan.kind === 'ok'
              ? plan.candidate.scenario?.rows.find((row) => row.k === installmentFor(facts, input.prepaymentDate) + 1)
              : undefined;
          level = next?.level ?? null;
        }
        this.goalState.set({ outcome, input, paths, level });
        this.say(
          `Abono mínimo para la meta: ${formatMoney(outcome.amount, currency)}.${outcome.isPayoff ? ' Liquida el préstamo.' : ''}`,
        );
        return;
      }
      case 'INFEASIBLE':
        this.goalState.set({ outcome, input, paths, level: null });
        this.say(
          `La meta no se puede cumplir con esa fecha. Liquidar el préstamo costaría ${formatMoney(outcome.payoffAmount, currency)}.`,
        );
        return;
    }
  }

  /**
   * «Aplicar al escenario». With own events that would fall after the new end it first asks (Opus C1); `confirmed`
   * is the user's «Aplicar y quitarlos».
   */
  protected applyGoal(confirmed = false): Promise<void> {
    return this.enqueue(async () => {
      const state = this.goalState();
      const active = this.active();
      const paths = this.paths();
      const facts = this.facts();
      if (state === null || state.outcome.kind !== 'FOUND' || active === null || paths === null || facts === null) {
        return;
      }
      if (state.paths !== paths) {
        this.failure.set({ scope: 'goal', text: DATA_CHANGED });
        return;
      }
      const goalEvent = goalPrepayment(this.newId(), state.input.prepaymentDate, state.outcome);
      if (!scenarioEventSchema.safeParse(goalEvent).success) {
        this.failure.set({ scope: 'goal', text: 'No se pudo guardar. Revisa los datos del formulario.' });
        return;
      }
      const decision = decideApply(paths, active.events, goalEvent, state.input, facts, confirmed);
      if (decision.kind === 'error') {
        this.failure.set({ scope: 'goal', text: domainErrorText(decision.error) });
        return;
      }
      if (decision.kind === 'stale') {
        this.failure.set({ scope: 'goal', text: STALE_GOAL });
        return;
      }
      if (decision.kind === 'confirm') {
        this.pendingApply.set({ plan: decision.plan });
        this.focusControl('apply-confirm');
        return;
      }
      const { plan } = decision;
      this.failure.set(null);
      const ok = await this.guard('goal', async () => {
        await this.saveEvents(active, plan.events);
      });
      if (ok) {
        this.say('Abono de la meta aplicado al escenario.');
        this.focusControl('events-title');
      }
    });
  }

  protected cancelApply(): void {
    this.pendingApply.set(null);
    this.focusControl('goal-apply');
  }

  protected removedText(item: RemovedEvent): string {
    const facts = this.facts();
    return facts === null ? '' : describeEvent(item.event, facts);
  }

  protected found(state: GoalState): Extract<GoalOutcome, { kind: 'FOUND' }> | null {
    return state.outcome.kind === 'FOUND' ? state.outcome : null;
  }

  protected infeasible(state: GoalState): Extract<GoalOutcome, { kind: 'INFEASIBLE' }> | null {
    return state.outcome.kind === 'INFEASIBLE' ? state.outcome : null;
  }
}
