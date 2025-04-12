import { resolve } from 'path';
import { Synapse } from '../index';
import { tap } from 'rxjs';
import { HimalayaHistoryLoader } from '@himalaya-quant/history-loader';
import { randomUUID } from 'crypto';

const synapse = new Synapse();

async function main() {
  await synapse.spawn(resolve(__dirname, '../../py_test'), 'main.py');
  synapse.instanceLogs.pipe(tap((log) => console.log(log))).subscribe();
  const result = await synapse.call({ baz: 10 }, true);
  await synapse.dispose();
  console.log(result);
}

main().then();
