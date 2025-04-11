import { resolve } from 'path';
import { Synapse } from '../index';

async function main() {
    await Synapse.spawn(resolve(__dirname, '../../py_test'), 'main.py');

    let finalMessage = '';
    for (const msg of [
        { text: 'This ' },
        { text: 'is ' },
        { text: 'a ' },
        { text: 'very ' },
        { text: 'cool ' },
        { text: 'way ' },
        { text: 'of ' },
        { text: 'using ' },
        { text: 'python ' },
        { text: 'scripts ' },
        { text: 'from ' },
        { text: 'node ' },
    ]) {
        const result = await Synapse.call(msg);
        finalMessage += result.text;
    }

    await Synapse.dispose();
    console.log(finalMessage);
}

main().then();
