# Requisitos de la página `/privacidad`

- **Estado:** congelado por W0-05. Lo implementa W4-05; lo cambia solo una micro-tarjeta de Opus.
- **Para qué:** la pantalla de consentimiento de OAuth de Google exige, para publicarse en producción, una página de inicio pública y una política de privacidad pública en el dominio verificado (ADR-0008, decisión 2). La Política de Datos de Usuario de los Servicios de API de Google pide que la política describa de forma completa cómo la app accede a los datos de Google, los usa, los guarda y los comparte (<https://developers.google.com/terms/api-services-user-data-policy>). La spec (sección 10) y ADR-0016 agregan lo propio de CuotasCasa.
- **Cómo se verifica:** el HTML prerenderizado `dist/apps/web/browser/privacidad/index.html` contiene, como encabezado (`<h2>`), cada texto de la lista de abajo, carácter por carácter (prueba de W4-05). W4-05 lee esta lista con la expresión ``/^- `([^`]+)`/gm``: cada encabezado obligatorio es un ítem que empieza con el texto entre comillas invertidas.

## Encabezados obligatorios

- `Quién responde por CuotasCasa y cómo contactarnos`: proyecto personal de código abierto; contacto por los Issues públicos del repositorio (`ISSUES_URL`, inyectada al compilar). Sin correo ni nombre de persona.
- `Qué datos guarda CuotasCasa`: solo lo que escribe el usuario (préstamos, eventos, saldos reportados, pagos, escenarios y ajustes). Las tablas y proyecciones se calculan y nunca se guardan.
- `Dónde se guardan tus datos`: en el navegador (IndexedDB) de cada dispositivo. No hay servidor ni base de datos de CuotasCasa.
- `Datos de Google que usa CuotasCasa`: solo si el usuario conecta Google Drive: el alcance `drive.appdata`, que da acceso únicamente a la carpeta oculta de la app (`appDataFolder`), donde vive `cuotascasa.json` y su copia `cuotascasa.prev.json`. CuotasCasa no lee ni ve ningún otro archivo de Drive. El token vive solo en memoria, unos 60 minutos.
- `Cómo usamos los datos de Google`: únicamente para guardar y leer la copia cifrada que sincroniza los dispositivos del usuario. No se usan para publicidad, no se venden y no se transfieren a terceros; nadie más que el usuario los lee.
- `Cifrado de la copia en Google Drive`: AES-256-GCM con una clave derivada de una frase que solo conoce el usuario (PBKDF2-SHA256, 600,000 iteraciones). Sin la frase, la copia no se puede leer. La base local del navegador no se cifra (spec, sección 8).
- `Sin analítica, sin cookies de rastreo y sin servidores de terceros`: no hay analítica, telemetría, cookies de rastreo, CDN ni fuentes externas; `/` y `/privacidad` no hacen peticiones a otros orígenes (ADR-0016).
- `Cómo revocar el acceso a Google Drive`: «Desconectar Drive» en Ajustes revoca el token; también desde la cuenta de Google (Seguridad → conexiones con apps de terceros).
- `Cómo borrar todos tus datos`: borrar los datos del sitio en el navegador de cada dispositivo y, en Google Drive, «Administrar aplicaciones» → CuotasCasa → «Borrar datos ocultos de la aplicación» (ADR-0008, decisión 8).
- `Exportaciones y respaldos`: los archivos Excel, CSV y PDF no van cifrados y la app lo avisa antes de la primera descarga; el respaldo JSON puede ir cifrado con la misma frase.
- `Cambios a esta política`: cualquier cambio en el uso de los datos se publica aquí antes de aplicarse, con la fecha de la última actualización visible en la página.

## Reglas de contenido

- Todo en español (es-GT) y con datos sintéticos: ningún monto, nombre, correo, banco ni número de préstamo real (ADR-0015). La página no contiene ninguna dirección de correo (prueba de W4-05).
- La página muestra la fecha de la última actualización en formato `dd/mm/aaaa`.
- Ningún recurso externo: los enlaces a Google son `<a href>` que el usuario abre; la página no los carga.
