/**
 * Covered-method registry. PORT_METHODS lists every method declared in ports.ts, per interface; the meta-test
 * (registry.spec.ts) proves at type level that each list equals the interface's method names and, at run time,
 * that the union of `covers` over CONTRACT_CASES equals all PORT_METHOD_IDS.
 */
export const PORT_METHODS = {
  Clock: ['now', 'today'],
  IdGenerator: ['newId'],
  Repository: ['get', 'list', 'create', 'update', 'delete'],
  LoanChildRepository: ['listByLoan'],
  SettingsRepository: ['getSynced', 'saveSynced', 'getDevice', 'saveDevice'],
  DataStore: [
    'transaction',
    'exportAll',
    'replaceAll',
    'createSnapshot',
    'restoreSnapshot',
    'discardSnapshot',
    'subscribe',
    'pendingChanges',
    'markSynced',
    'changesSinceBackup',
    'markBackedUp',
    'getMeta',
    'close',
  ],
} as const;

export type PortName = keyof typeof PORT_METHODS;

export type PortMethodId = {
  [P in PortName]: `${P}.${(typeof PORT_METHODS)[P][number]}`;
}[PortName];

export const PORT_METHOD_IDS: readonly PortMethodId[] = (Object.keys(PORT_METHODS) as PortName[]).flatMap((port) =>
  PORT_METHODS[port].map((method) => `${port}.${method}` as PortMethodId),
);
