# ADR-0004: Algoritmo 'FHA Guatemala v1' y perfiles de redondeo

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

En los préstamos FHA de Guatemala, la cuota nivelada no se calcula solo con la tasa de interés. Estos datos son públicos:

- La prima del seguro de hipoteca FHA es del **1 % anual** sobre saldo (Reglamento FHA, art. 19 b).
- El desgravamen es del **0.26 %**. Los bancos incluyen ambos en la tasa de la cuota nivelada, como en el anuncio típico «6 % + 1 % + 0.26 % = 7.26 % variable».
- A la cuota nivelada se suman cargos fijos: IUSI y seguro de daños.
- No hay regulación pública sobre si, tras un cambio de tasa, se mantiene el plazo o la cuota.

La ingeniería inversa se hizo en privado, fuera del repo y sin publicar números:

- El perfil descrito abajo reprodujo **al centavo** todas las filas de una tabla de amortización bancaria real, incluidos los totales.
- Distintos bancos pueden redondear de forma ligeramente distinta, con diferencias de pocos centavos. Por eso el perfil de redondeo es elegible y los saldos reales deben poder re-anclar la proyección.
- El interés es mensual 30/360, sin importar el día de pago.

## Decisión

1. **Fuente única de verdad: `docs/algorithm.md`**, con reglas identificadas como `[ALG.*]`.
   - El motor TypeScript y el oráculo Python se escriben solo a partir de ese documento (ADR-0014).
   - Después de W0 solo lo modifica Opus, y cada cambio obliga a regenerar el oráculo.
2. **Tasa y cuota:**
   - el único redondeo a centavos es `HALF_UP_2`, solo donde `docs/algorithm.md` lo escribe; todo lo demás queda en el contexto de 34 dígitos con `ROUND_HALF_EVEN` (`[ALG.CONV]`);
   - `r = (i + f) / 12` sin `HALF_UP_2`, donde `f` suma los componentes porcentuales del seguro;
   - `level = HALF_UP_2(B·r / (1 − (1 + r)^(−m)))`;
   - los cargos fijos no entran en `level` ni en el saldo.
3. **Perfil `FHA_GT_V1`** (por defecto):
   - `charge = HALF_UP_2(B·r)`;
   - `interest = HALF_UP_2(charge·i/(i+f))`;
   - el seguro recibe el residuo;
   - `capital = level − charge`.

   **Perfil `SIMPLE`:** interés y cada seguro se redondean por separado. La última cuota liquida el saldo con plazo fijo o derivado (`[ALG.LAST]`).
4. **Eventos sobre una línea de tiempo**, con orden canónico por cuota (`[ALG.EVENTS.ORDER]`):
   - **Cambio de tasa**, con tres políticas: recalcular la cuota manteniendo el plazo (por defecto), mantener la cuota o usar la cuota del banco.
   - **Cambio de cargos fijos**, que reemplaza la lista completa (`[ALG.FIXEDCHANGE]`).
   - **Abono** justo después de pagar su cuota `k`, asignada por `[ALG.EVENTS.ANCHOR]` (la primera con vencimiento `≥` la fecha del abono), que reduce plazo o cuota, con comisión opcional y tope en el saldo.
   - **Adelantar N cuotas.**
   - **Saldo reportado** antes de pagar la cuota, que re-ancla el camino real.
   - **Pago real**, que en v1 solo compara.
5. **Plantillas versionadas en código:**
   - `fha-gt@1` «FHA Guatemala v1»: interés + 0.01 + 0.0026, perfil `FHA_GT_V1`, fin de mes;
   - `simple@1` «Hipotecario simple».

   El préstamo guarda una copia editable (ADR-0005). Los cargos fijos se derivan como `cuota total del banco − level`.
6. **Fuera de v1:** la Ley de Interés Preferencial, los abonos recurrentes, la mora y el asistente de calibración (fase 2).

**Ejemplo sintético.** Principal 500000.00, 240 meses, `i = 0.07`, `f = 0.0126`: `level = 4263.47`. Un abono de 20000.00 tras la cuota 12 da:
- con reducir plazo: 220 cuotas;
- con reducir cuota: nueva `level` de 4089.36.

## Alternativas consideradas

- **Solo `SIMPLE`.** No reproduce al centavo la tabla validada: redondear un cargo combinado y repartirlo da otro resultado.
- **Interés diario actual/365.** La evidencia indica 30/360 mensual.
- **Calibración empírica por banco con tolerancias.** Pospuesta a la fase 2. En v1 se usan perfiles exactos, el semáforo de validación y anclas reales.
- **Una sola política ante cambios de tasa.** Sin regulación pública, la política la elige el usuario.

## Consecuencias

**Positivas**
- La reproducción es exacta para el perfil validado, y los saldos reales corrigen la deriva del camino real.

**Negativas**
- Un banco con otro redondeo necesita un perfil nuevo: cambio en `algorithm.md`, regeneración del oráculo y un ADR.
- La validación contra datos reales no se puede reproducir públicamente.

**Riesgos**
- **Error de modo común:** que motor y oráculo interpreten mal la misma regla. Mitigación:
  - ejemplos resueltos por regla (W0-02);
  - linajes separados;
  - validación privada de Opus en W2-01, W3-01 y W4-01, solo si el dueño autoriza la carpeta privada fuera del repo.
- **Que el banco cambie su redondeo o sus primas.** Mitigación: plantillas versionadas y valores editables por préstamo.

## Verificación

- Los ejemplos de `docs/specs/algorithm-examples/` se reproducen al centavo (W1-01, W2-03, W2-04, W2-05).
- Los fixtures del oráculo pasan la conformidad (W2-13, W4-02) y `oracle:diff` en CI (W2-01).
- Invariantes con fast-check (W3-02):
  - adelantar N reduce exactamente N cuotas;
  - un abono nunca aumenta el interés total.
- Pruebas de borde de plantillas y semáforo (W2-07).

## Referencias

- `docs/algorithm.md`, `docs/glossary.md`, `docs/specs/algorithm-examples/`.
- ADR-0003, ADR-0005, ADR-0014.
- Reglamento FHA, art. 19 b.
