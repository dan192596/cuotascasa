# ADR-0009: Cifrado con frase (AES-256-GCM + PBKDF2) y clave no exportable por dispositivo

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

La copia sincronizada vive en el Google Drive del usuario (ADR-0008) y contiene datos financieros. Sin cifrado, la leerían el proveedor y quien comprometa la cuenta. Restricciones:

- **Sin backend** que custodie claves.
- **Sin dependencias criptográficas de terceros** (ADR-0016).
- **Poca fricción:** no pedir una frase en cada sincronización.

El dueño eligió la opción de cifrar con una frase propia.

## Decisión

1. **Solo WebCrypto:**
   - clave derivada con **PBKDF2-SHA256, 600 000 iteraciones** y sal aleatoria;
   - cifrado **AES-256-GCM** con un IV aleatorio de 96 bits por cada cifrado.
2. **Sobre versionado v1:**

   ```text
   { format: 'cuotascasa-enc', v: 1,
     kdf: { name, iterations, salt },
     cipher: { name, iv },
     ct }
   ```

   - Los campos binarios van en base64url.
   - La cabecera se liga como datos adicionales autenticados (AAD): alterar cualquier parámetro invalida el descifrado.
   - El sobre no tiene campo `synthetic` ni ningún otro fuera de los de arriba. Por eso **los sobres cifrados no se versionan como fixtures**: las pruebas (W1-07, W4-08 y los e2e de W5-07 y W6-01) los generan en tiempo de ejecución, cifrando un respaldo sintético (`backup-v1-*.json`, ADR-0015) con una frase de prueba. Así la marca `synthetic: true` que exigen los directorios de fixtures nunca toca la AAD, y ningún sobre real puede pasar por fixture: el hook de W1-10 rechazaría un JSON sin la marca.
3. **Rechazo antes de descifrar:** sobres con `iterations < 600000` o con una versión desconocida. Esto impide degradar el KDF.
4. **Errores tipados** sin texto en claro en los mensajes: `WrongPassphraseOrTamper`, `UnsupportedVersion`, `WeakParams` y `KeyMismatch` (la sal no coincide).
5. **Clave por dispositivo.** La clave derivada se guarda en IndexedDB como `CryptoKey` **no exportable** (`extractable: false`, usos `encrypt` y `decrypt`), junto a un identificador de sal. **La frase nunca se guarda.** Se pide una vez por dispositivo.
6. **Cambiar la frase** se puede desde cualquier dispositivo que tenga la clave:
   - se genera una sal nueva, se deriva la nueva clave y se vuelve a cifrar;
   - los demás dispositivos detectan `KeyMismatch` y piden la frase nueva.
7. **Si se olvida la frase**, se pierden datos solo si se pierden **todos** los dispositivos con la clave. Cualquiera de ellos puede definir una frase nueva. La app recomienda guardarla en un gestor de contraseñas.
8. **El mismo sobre sirve para el respaldo JSON cifrado** (ADR-0007), con la misma frase u otra.
9. **IndexedDB local no se cifra:** no protegería contra XSS (la app usa la clave en el mismo origen); el robo del equipo lo cubre el cifrado de disco (FileVault).
10. **Implementación de Opus** (W1-07), por ser crítica; un agente Sonnet la revisa contra los criterios.

## Alternativas consideradas

- **Sin cifrado en Drive.** Los datos financieros quedarían legibles para quien acceda a la cuenta de Google.
- **Clave aleatoria como archivo de recuperación.** Otro archivo que custodiar y perder.
- **Argon2id en WASM.** Resiste mejor ataques con GPU, pero agrega una dependencia y exige `wasm-unsafe-eval` en la CSP. PBKDF2 viene nativo en WebCrypto y 600 000 iteraciones es la recomendación de OWASP para PBKDF2-HMAC-SHA256.
- **Pedir la frase en cada sincronización.** Fricción que empuja a frases débiles.
- **Guardar la frase o una clave exportable.** Un XSS las expondría.
- **Cifrar también IndexedDB.** Complejidad sin proteger contra XSS.

## Consecuencias

**Positivas**
- Google y quien comprometa la cuenta solo ven texto cifrado, y las alteraciones se detectan.
- La frase se pide una vez por dispositivo, sin dependencias nuevas.

**Negativas**
- Si se olvida la frase y se pierden todos los dispositivos, la copia en Drive es irrecuperable.
- La primera derivación en cada dispositivo tarda de forma perceptible.
- PBKDF2 no es resistente en memoria: si se filtra el archivo, una frase corta cae por fuerza bruta. Se recomiendan frases largas.

**Riesgos**
- **Un XSS activo puede usar la clave** mientras la página está comprometida, aunque no puede extraerla. Mitigación: CSP por ruta y Trusted Types (ADR-0016, ADR-0021).
- **Reutilizar un IV** sería catastrófico en GCM. Mitigación: IV aleatorio por mensaje y prueba de unicidad.
- **Diferencias de WebCrypto entre motores.** Mitigación: pruebas en modo navegador en Chromium y WebKit.

## Verificación

Criterios de W1-07:
- Ida y vuelta con cargas UTF-8 arbitrarias (iteraciones reducidas solo en pruebas); el valor de producción es exactamente 600000.
- Una frase incorrecta da el error tipado, igual que alterar cualquier byte de `ct`, `iv`, sal o cabecera. Ningún mensaje contiene texto en claro.
- Los sobres débiles o de versión desconocida se rechazan sin intentar descifrar.
- 10 000 cifrados producen 10 000 IV distintos de 12 bytes.
- La clave tiene `extractable === false`, AES-GCM de 256 bits y usos exactos. El KeyStore se prueba en Chromium y WebKit.
- Una inspección de IndexedDB prueba que no se persiste la frase ni bytes de la clave.

Además: W2-08 (nunca sube texto en claro), W4-08 (respaldo cifrado de ida y vuelta, con el sobre generado en la prueba) y W1-10 (ningún sobre cifrado queda bajo un directorio de fixtures, porque no lleva `synthetic: true`).

## Adenda (2026-10-09, W1-07)

Decisiones que fijó la implementación y aceptó Opus tras la revisión de seguridad:

- **Frase en NFC.** La frase se normaliza a NFC antes de PBKDF2, para que una «ñ» compuesta y una descompuesta deriven la misma clave en todos los dispositivos. Es permanente: cambiarla cambiaría todas las claves derivadas.
- **Topes.** `PBKDF2_ITERATIONS` es 600000 y el piso de `decrypt`. El techo es `MAX_PBKDF2_ITERATIONS = 10 000 000`: un sobre que declare más se rechaza con `WeakParams` antes de cualquier llamada a `subtle`, y las funciones de derivación rechazan más con un `RangeError` fijo, para que un archivo hostil de Drive no cuelgue la pestaña (W4-09 lee las iteraciones del sobre). La sal mide al menos 16 bytes y, codificada, a lo sumo 64 caracteres.
- **Códigos.** Lo que no es un sobre da `InvalidRemote` (código ya existente en `ports.ts`). Un `v` distinto de 1 o un nombre de KDF o cifrado desconocido dan `UnsupportedVersion`. Un sobre v1 mal formado da `WrongPassphraseOrTamper`. Iteraciones fuera de rango o una sal corta dan `WeakParams`. Una sal distinta de la de la clave da `KeyMismatch`. Todo se revisa antes de descifrar, y cada mensaje es el código, sin causa ni datos.
- **AAD.** Cubre la cabecera completa en JSON canónico: formato, versión, KDF (nombre, iteraciones, sal) y cifrado (nombre, IV).

## Referencias

- ADR-0007, ADR-0008, ADR-0015, ADR-0016, ADR-0021 (reservado).
- Tarjetas W1-07, W2-08, W4-08, W4-09 y W5-08.
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
