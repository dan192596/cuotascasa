import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PwaUpdateService } from './pwa-update.service.ts';

/** Spanish snackbar offering the waiting version (R20). Hosted once in the app shell (docs/specs/component-contracts.md). */
@Component({
  selector: 'cc-update-prompt',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdatePromptComponent {
  private readonly updates = inject(PwaUpdateService);
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    effect(() => {
      if (!this.updates.updateReady()) return;
      this.snackBar
        .open('Hay una versión nueva de CuotasCasa.', 'Actualizar')
        .onAction()
        .subscribe(() => {
          void this.updates.activateAndReload();
        });
    });
  }
}
