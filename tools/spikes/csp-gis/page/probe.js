/* global window, document */
// Part (a): lazily loads Google Identity Services, initialises a token client with a placeholder client id, opens
// the consent popup (the runner clicks #connect), calls Drive v3 without a token and revokes a placeholder token.
// The loading option comes from the `load` query parameter: direct | policy | default | static.
(() => {
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const PLACEHOLDER_CLIENT_ID = '000000000000-placeholder.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const option = new URL(window.location.href).searchParams.get('load') ?? 'direct';
  const result = { option, steps: {}, done: false };
  window.__probe = result;

  const step = async (name, action) => {
    try {
      result.steps[name] = { ok: true, detail: await action() };
    } catch (error) {
      result.steps[name] = { ok: false, detail: String((error && error.message) || error).slice(0, 200) };
    }
  };

  const loadScript = () =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.onload = () => resolve('loaded');
      script.onerror = () => reject(new Error('script load error'));
      let url = GIS_URL;
      if (option === 'policy' || option === 'default') {
        const name = option === 'default' ? 'default' : 'cc-gis-loader';
        const policy = window.trustedTypes.createPolicy(name, {
          createScriptURL: (value) => {
            if (value !== GIS_URL) throw new TypeError('script URL not allowed');
            return value;
          },
        });
        url = policy.createScriptURL(GIS_URL);
      }
      script.src = url;
      document.head.appendChild(script);
    });

  const run = async () => {
    if (option === 'static') {
      const present = document.querySelector('script[src="' + GIS_URL + '"]');
      await step(
        'load',
        () =>
          new Promise((resolve, reject) => {
            if (window.google && window.google.accounts) return resolve('already loaded');
            if (!present) return reject(new Error('no static tag'));
            present.addEventListener('load', () => resolve('loaded'));
            present.addEventListener('error', () => reject(new Error('script load error')));
          }),
      );
    } else {
      await step('load', loadScript);
    }
    let client = null;
    await step('init', () => {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: PLACEHOLDER_CLIENT_ID,
        scope: SCOPE,
        callback: () => {},
        error_callback: (error) => {
          result.popupError = String((error && error.type) || 'unknown');
        },
      });
      return 'token client created';
    });
    document.getElementById('connect').addEventListener('click', () => {
      result.connectClicked = true;
      try {
        client.requestAccessToken();
        result.requestAccessToken = 'called';
      } catch (error) {
        result.requestAccessToken = 'threw: ' + String((error && error.message) || error).slice(0, 120);
      }
    });
    result.ready = true;
  };

  const finish = async () => {
    await step('drive', async () => {
      const response = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1');
      return 'status ' + response.status;
    });
    await step(
      'revoke',
      () =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('revoke callback timeout')), 8000);
          try {
            window.google.accounts.oauth2.revoke('placeholder-token', () => {
              clearTimeout(timer);
              resolve('callback called');
            });
          } catch (error) {
            clearTimeout(timer);
            reject(error);
          }
        }),
    );
    result.done = true;
  };

  window.__probeFinish = finish;
  run().catch((error) => {
    result.fatal = String((error && error.message) || error).slice(0, 200);
    result.ready = true;
  });
})();
