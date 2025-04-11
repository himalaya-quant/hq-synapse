import { InstanceManger } from './modules/instance-manager.service';

const Synapse = new InstanceManger();

async function main() {
    await Synapse.spawn(
        '/Users/caiuscitiriga/Code/HQ/platform/libraries/hq-synapse/py_test',
        'main.py'
    );

    for (const msg of [
        1, 2, 3, 4, 5, 5, 6, 6436, 346, 6, 435, 435, 345, 5, 53, 53, 5, 354353,
    ]) {
        const result = await Synapse.call({ foo: 'this is an awesome call' });
        console.log(result);
    }
}

main().then();
