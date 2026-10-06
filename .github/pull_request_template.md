<!-- Título: «tipo(ámbito): resumen (<ID>)», p. ej. «feat(domain): núcleo del calendario (W1-01)». Solo datos sintéticos. -->

## Tarjeta

- **Id:**
- **Rama / worktree:** `card/<ID>-<slug>` · `.worktrees/<ID>`
- **Owns** (copiados de `docs/plan/cards/<ID>.md`):

## Resumen

## Criterios de aceptación

Uno por línea, con su evidencia (paso, prueba o comando y su salida).

- [ ]

## Definición de terminado

- [ ] Pruebas primero (TDD) para toda la lógica; sin `.only`, `.skip` ni aserciones triviales.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` en verde (linaje del oráculo: `python -m pytest` y `ruff check` desde `tools/oracle`), más los checks de CI.
- [ ] `owns-check` en verde: solo rutas de `owns` y ningún archivo de `docs/plan/frozen-files.json` fuera de su `editableBy`.
- [ ] Sin dependencias nuevas: `pnpm-lock.yaml` y los `package.json` sin cambios.
- [ ] Sin datos reales: fixtures con `synthetic: true`; nada real en código, commits, este PR, logs, capturas ni artefactos, incluida la salida de `compare` y `private-compare`.
- [ ] Sin secretos.
- [ ] Cada decisión nueva tiene su ADR; las dudas se escalaron (`docs/algorithm.md` > ADR > spec > historias > tarjeta).

## Comandos de verificación y su salida

## Rutas tocadas

## Preguntas abiertas

## Solo linaje del oráculo

- Comando de checkout parcial:
- ¿Se usó `git commit --no-verify`? (sí/no)
