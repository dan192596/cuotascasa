import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component.ts';
import { serverConfig } from './app/app.config.server.ts';

export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(AppComponent, serverConfig, context);
}
