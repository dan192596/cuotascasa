/* global window, document */
// Injected into every frame before any page script (Playwright addInitScript). Reports CSP violation events and
// Trusted Types policy creation to the runner through the `__ccRecord` binding.
(() => {
  const send = (record) => {
    try {
      window.__ccRecord(JSON.stringify(record));
    } catch {
      // The binding is not available (yet) in this frame: nothing to report.
    }
  };
  const scrub = (value) => String(value ?? '').slice(0, 80);
  document.addEventListener(
    'securitypolicyviolation',
    (event) => {
      send({
        kind: 'violation',
        directive: event.effectiveDirective,
        blocked: scrub(event.blockedURI),
        disposition: event.disposition,
        sample: scrub(event.sample),
        line: event.lineNumber,
      });
    },
    true,
  );
  const tt = window.trustedTypes;
  send({ kind: 'support', trustedTypes: Boolean(tt), userAgentData: Boolean(navigator.userAgentData) });
  if (tt && typeof tt.createPolicy === 'function') {
    const original = tt.createPolicy.bind(tt);
    tt.createPolicy = (name, rules) => {
      try {
        const policy = original(name, rules);
        send({ kind: 'policy', name, created: true });
        return policy;
      } catch (error) {
        send({ kind: 'policy', name, created: false, error: scrub(error && error.message) });
        throw error;
      }
    };
  }
})();
