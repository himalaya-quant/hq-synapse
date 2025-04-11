import { resolve } from 'path';
import { Synapse } from '../index';
const synapse = new Synapse();

async function main() {
    await synapse.spawn(resolve(__dirname, '../../py_test'), 'main.py');

    let finalMessage = '';
    for (const msg of [
        { text: 'This is an example payload' },
        { cmd: 'run_function_x', params: { foo: 'bar', baz: 10 } },
        [[Date.now(), 12.5, 12.9, 12.3, 12.6, 345]],
    ]) {
        const result = await synapse.call(msg);
        finalMessage += `${result.data}\n`;
    }

    await synapse.dispose();
    console.log(finalMessage);
}

main().then();
