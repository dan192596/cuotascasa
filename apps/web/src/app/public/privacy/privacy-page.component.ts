import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Date of the last change to this policy, dd/mm/aaaa (docs/specs/privacy-requirements.md). Update it with the text. */
export const PRIVACY_LAST_UPDATED = '21/10/2026';

/**
 * Public privacy policy (R2). The h2 texts are frozen by docs/specs/privacy-requirements.md and verified against the
 * prerendered HTML. No scripts, storage, network or e-mail address: the contact is the public Issues URL (route data).
 */
@Component({
  selector: 'cc-privacy-page',
  template: `
    <main class="page">
      <header>
        <p class="brand"><a href="/">CuotasCasa</a></p>
        <h1>Política de privacidad</h1>
        <p class="updated" data-testid="privacy-updated">Última actualización: {{ lastUpdated }}</p>
        <p class="lead">
          CuotasCasa modela cuotas de préstamos de vivienda. Tus datos se quedan en tu dispositivo; si lo decides, una
          copia cifrada puede guardarse en tu propio Google Drive.
        </p>
      </header>

      <section aria-labelledby="s-contacto">
        <h2 id="s-contacto">Quién responde por CuotasCasa y cómo contactarnos</h2>
        <p>
          CuotasCasa es un proyecto personal de código abierto. No es un banco ni una entidad financiera, no se conecta
          a bancos y no mueve dinero.
        </p>
        @if (hasContact()) {
          <p>
            Para preguntas sobre privacidad, escribe en los
            <a data-testid="privacy-contact-link" [href]="issuesUrl()" rel="noopener noreferrer"
              >Issues públicos del repositorio</a
            >.
          </p>
        } @else {
          <p>Para preguntas sobre privacidad, usa los Issues públicos del repositorio del proyecto.</p>
        }
      </section>

      <section aria-labelledby="s-datos">
        <h2 id="s-datos">Qué datos guarda CuotasCasa</h2>
        <p>
          Solo lo que tú escribes: préstamos, eventos, saldos reportados, pagos, escenarios y ajustes. Las tablas y las
          proyecciones se calculan en tu dispositivo y nunca se guardan.
        </p>
      </section>

      <section aria-labelledby="s-donde">
        <h2 id="s-donde">Dónde se guardan tus datos</h2>
        <p>
          En el navegador (IndexedDB) de cada dispositivo. CuotasCasa no tiene servidor ni base de datos propia: nadie
          del proyecto puede ver tus datos. Las páginas públicas (inicio, simulador rápido y esta política) no guardan
          nada en tu navegador.
        </p>
      </section>

      <section aria-labelledby="s-google">
        <h2 id="s-google">Datos de Google que usa CuotasCasa</h2>
        <p>
          Solo si tú conectas Google Drive. Se pide un único alcance, <code>drive.appdata</code>, que da acceso
          únicamente a la carpeta oculta de la aplicación (<code>appDataFolder</code>), donde viven
          <code>cuotascasa.json</code> y su copia <code>cuotascasa.prev.json</code>. CuotasCasa no lee ni ve ningún otro
          archivo de tu Drive. Google solo ve un archivo cifrado e ilegible, su nombre, su tamaño y su fecha de
          modificación. El token de acceso vive solo en la memoria de la pestaña, unos 60 minutos, y no se guarda en el
          navegador. Al conectar, tu navegador carga el script de inicio de sesión de Google
          (<code>accounts.google.com</code>) y se comunica directamente con la API de Google Drive; si no conectas
          Drive, la aplicación no contacta a Google.
        </p>
      </section>

      <section aria-labelledby="s-uso">
        <h2 id="s-uso">Cómo usamos los datos de Google</h2>
        <p>
          Únicamente para guardar y leer la copia cifrada que sincroniza tus dispositivos. No se usan para publicidad,
          no se venden y no se transfieren a terceros. CuotasCasa no los lee ni los comparte. El uso de la información
          recibida de las APIs de Google se apega a la
          <a
            data-testid="privacy-google-policy-link"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer"
            >Política de Datos de Usuario de los Servicios de API de Google</a
          >, incluidos los requisitos de uso limitado.
        </p>
      </section>

      <section aria-labelledby="s-cifrado">
        <h2 id="s-cifrado">Cifrado de la copia en Google Drive</h2>
        <p>
          La copia se cifra en tu dispositivo con AES-256-GCM, con una clave derivada de una frase que solo tú conoces
          (PBKDF2-SHA256, 600,000 iteraciones). Sin la frase, la copia no se puede leer, ni siquiera por quien tenga
          acceso a tu Drive; por eso no podemos recuperarla si la olvidas. En cada dispositivo se guarda la clave
          derivada, sin posibilidad de extraerla, para no pedirte la frase cada vez. La base local del navegador no se
          cifra.
        </p>
      </section>

      <section aria-labelledby="s-analitica">
        <h2 id="s-analitica">Sin analítica, sin cookies de rastreo y sin servidores de terceros</h2>
        <p>
          No hay analítica, telemetría, cookies ni fuentes externas. El inicio y esta página no hacen peticiones a otros
          orígenes. El sitio se sirve como archivos estáticos desde Cloudflare, que puede registrar datos técnicos
          habituales de cada conexión, como la dirección IP; CuotasCasa no activa su analítica ni usa esos registros.
          Esta página no carga ningún recurso de Google ni de otros sitios.
        </p>
      </section>

      <section aria-labelledby="s-revocar">
        <h2 id="s-revocar">Cómo revocar el acceso a Google Drive</h2>
        <p>
          En Ajustes, «Desconectar Drive» revoca el token. También puedes hacerlo desde tu cuenta de Google, en
          Seguridad, en las conexiones con apps de terceros.
        </p>
      </section>

      <section aria-labelledby="s-borrar">
        <h2 id="s-borrar">Cómo borrar todos tus datos</h2>
        <p>
          Borra los datos del sitio en el navegador de cada dispositivo o con «Borrar datos de este dispositivo» en
          Ajustes. En Google Drive, entra a «Administrar aplicaciones», elige CuotasCasa y usa «Borrar datos ocultos de
          la aplicación».
        </p>
      </section>

      <section aria-labelledby="s-exportar">
        <h2 id="s-exportar">Exportaciones y respaldos</h2>
        <p>
          Los archivos Excel, CSV y PDF se generan en tu dispositivo y no van cifrados; la aplicación te lo avisa antes
          de la primera descarga de cada sesión. El respaldo JSON puede ir cifrado con la misma frase.
        </p>
      </section>

      <section aria-labelledby="s-cambios">
        <h2 id="s-cambios">Cambios a esta política</h2>
        <p>
          Cualquier cambio en el uso de los datos se publica aquí antes de aplicarse, con la fecha de la última
          actualización visible arriba.
        </p>
      </section>

      <footer><a href="/">Volver al inicio</a></footer>
    </main>
  `,
  styles: `
    :host {
      display: block;
      background: var(--cc-color-paper);
      color: var(--cc-color-ink);
    }
    .page {
      box-sizing: border-box;
      max-width: 44rem;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
      font-family: var(--cc-font-body);
      line-height: 1.6;
    }
    .brand {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-weight: 600;
    }
    h1 {
      margin: 0.5rem 0 0.25rem;
      font-size: 2rem;
      line-height: 1.2;
    }
    .updated {
      margin: 0;
      color: var(--cc-color-ink-muted);
    }
    .lead {
      margin: 1rem 0 0;
    }
    section {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--cc-color-rule);
    }
    h2 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      line-height: 1.3;
    }
    p {
      margin: 0.5rem 0;
    }
    code {
      font-family: var(--cc-font-numeric);
      font-size: 0.9em;
      overflow-wrap: anywhere;
    }
    footer {
      margin-top: 2rem;
    }
  `,
  host: { 'data-testid': 'page-privacy' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPageComponent {
  /** Route data from app.routes.ts (ISSUES_URL): the public Issues URL, '' until the deploy injects it. */
  readonly issuesUrl = input('');
  protected readonly hasContact = computed(() => this.issuesUrl() !== '');
  protected readonly lastUpdated = PRIVACY_LAST_UPDATED;
}
