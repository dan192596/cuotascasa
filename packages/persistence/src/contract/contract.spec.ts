import { runDataStoreContract } from './run.ts';
import { createReferenceDataStore } from './reference-fake.ts';

runDataStoreContract('reference-fake', createReferenceDataStore);
