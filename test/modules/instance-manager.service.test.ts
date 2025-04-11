import { renameSync, rmSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from '@jest/globals';
import { InstanceManger } from '../../src/modules/instance-manager.service';

describe('InstanceManager', () => {
    let instanceManager: InstanceManger;
    const pythonTestModule = resolve(__dirname, '../py_test_module');

    beforeEach(() => {
        instanceManager = new InstanceManger();
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await instanceManager.dispose();
    });

    it('successfully process an input', async () => {
        rmSync(resolve(pythonTestModule, '.venv'), { recursive: true });
        await instanceManager.spawn(pythonTestModule, 'main');
        const result = await instanceManager.call({ foo: 'bar' });
        expect(result).toBeDefined();
        expect(result.foo).toBe('bar');
    });

    it('successfully process an input sequence sequentially', async () => {
        await instanceManager.spawn(pythonTestModule, 'main');
        const result1 = await instanceManager.call({ foo: 'bar1' });
        const result2 = await instanceManager.call({ foo: 'bar2' });
        const result3 = await instanceManager.call({ foo: 'bar3' });

        expect(result1).toBeDefined();
        expect(result1.foo).toBe('bar1');

        expect(result2).toBeDefined();
        expect(result2.foo).toBe('bar2');

        expect(result3).toBeDefined();
        expect(result3.foo).toBe('bar3');
    });

    it('successfully process an input sequence in parallel', async () => {
        await instanceManager.spawn(pythonTestModule, 'main');
        const results = await Promise.all([
            instanceManager.call({ foo: 'bar1' }),
            instanceManager.call({ foo: 'bar2' }),
            instanceManager.call({ foo: 'bar3' }),
        ]);

        expect(results[0]).toBeDefined();
        expect(results[0].foo).toBe('bar1');

        expect(results[1]).toBeDefined();
        expect(results[1].foo).toBe('bar2');

        expect(results[2]).toBeDefined();
        expect(results[2].foo).toBe('bar3');
    });

    it('throws if trying to process input before spawning', async () => {
        try {
            await instanceManager.call({ foo: 'bar' });
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe(
                'Cannot send inputs to instance before running it.'
            );
        }
    });

    it('throws if invalid python module directory', async () => {
        try {
            await instanceManager.spawn('invalid-directory', 'main');
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe(
                `Directory "invalid-directory" does not exist.`
            );
        }
    });

    it('throws if invalid python module entrypoint', async () => {
        try {
            await instanceManager.spawn(pythonTestModule, 'invalid-entrypoint');
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe(
                `Entrypoint "invalid-entrypoint.py" does not exist.`
            );
        }
    });

    it('throws if missing requirements.txt', async () => {
        try {
            renameSync(
                resolve(pythonTestModule, 'requirements.txt'),
                resolve(pythonTestModule, '_requirements.txt')
            );
            await instanceManager.spawn(pythonTestModule, 'main');
        } catch (e) {
            renameSync(
                resolve(pythonTestModule, '_requirements.txt'),
                resolve(pythonTestModule, 'requirements.txt')
            );
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toBe(
                `"requirements.txt" file is missing.`
            );
        }
    });
});
