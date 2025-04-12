import { resolve } from 'path';
import { Synapse } from '../index';
import { tap } from 'rxjs';
import { HimalayaHistoryLoader } from '@himalaya-quant/history-loader';
import { randomUUID } from 'crypto';

const synapse = new Synapse();

async function main() {
  await synapse.spawn(resolve(__dirname, '../../py_test'), 'main.py');
  synapse.instanceLogs.pipe(tap((log) => console.log(log))).subscribe();

  const historicData = await HimalayaHistoryLoader.loadHistory({
    timeFrame: '1h',
    symbol: 'BTC/USDT',
    exchangeMarket: 'binance_spot',
    // toDate: '2025-01-02T00:00:00Z',
    toDate: new Date(),
    requestId: randomUUID(),
    fromDate: new Date(Date.parse('2020-01-01T00:00:00Z')),
  });

  const result = await synapse.call(historicData.history);
  await synapse.dispose();
  console.log(result);
}

main().then();
