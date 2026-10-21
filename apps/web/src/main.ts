import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component.ts';
import { appConfig } from './app/app.config.ts';

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  // Only the error name: the error object or its message could carry user data.
  console.error('Bootstrap failed:', error instanceof Error ? error.name : 'unknown error');
});
