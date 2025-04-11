import { join } from 'path';
import { existsSync } from 'fs';
import { Subject, Subscription, tap } from 'rxjs';
import { encode, decode } from '@msgpack/msgpack';

import {
    spawn,
    spawnSync,
    ChildProcessWithoutNullStreams,
} from 'child_process';

type QueuedInput = {
    input: any;
    resolver: (value: any) => void;
};

export class InstanceManger {
    private instance!: ChildProcessWithoutNullStreams;
    private readonly inputsQueue: QueuedInput[] = [];
    private currentInputResolver!: (value: any) => void;
    private readonly instanceOutputs$ = new Subject<any>();
    private readonly instanceLogs$ = new Subject<string>();
    private readonly instanceInputs$ = new Subject<QueuedInput>();
    private readonly instanceInputStreamSubscription: Subscription;
    private readonly instanceOutputStreamSubscription: Subscription;

    constructor() {
        this.instanceInputStreamSubscription = this.instanceInputs$
            .pipe(
                tap(({ input, resolver }) => {
                    this.currentInputResolver = resolver;
                    this.packAndSend(input);
                })
            )
            .subscribe();

        this.instanceOutputStreamSubscription = this.instanceOutputs$
            .pipe(
                tap((output) => {
                    this.currentInputResolver(output);
                    // job done, no need for it anymore
                    this.inputsQueue.shift();
                    if (this.inputsQueue.length)
                        this.instanceInputs$.next(this.inputsQueue[0]);
                })
            )
            .subscribe();
    }

    call(input: any): Promise<any> {
        if (!this.instance)
            throw new Error(
                `Cannot send inputs to instance before running it.`
            );

        return new Promise((resolver) => {
            this.inputsQueue.push({ input, resolver });
            if (this.inputsQueue.length === 1)
                this.instanceInputs$.next(this.inputsQueue[0]);
        });
    }

    async spawn(directory: string, entrypoint: string): Promise<void> {
        entrypoint = this.postfixExtension(entrypoint);

        this.ensureExistsOrThrow(directory, entrypoint);

        if (!existsSync(join(directory, '.venv'))) {
            this.createVirtualEnv(directory);
            await this.installDependencies(directory);
        }

        await this.spawnInstance(directory, entrypoint);
    }

    async dispose() {
        this.instanceInputStreamSubscription.unsubscribe();
        this.instanceOutputStreamSubscription.unsubscribe();
        if (!this.instance) return;

        this.instance.stdin.end();
        this.instance.kill('SIGTERM');
        const isTerminated = await this.waitForTermination(500);

        if (!isTerminated) {
            console.log(
                'Instance did not close gracefully in 500ms. Forcing SIGKILL.'
            );
            this.instance.kill('SIGKILL');
            await this.waitForTermination(500);
        }

        if (!this.instance.killed)
            throw new Error(
                `Cannot kill instance with PID: ${this.instance.pid}`
            );
    }

    private waitForTermination(timeout: number): Promise<boolean> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(this.instance.killed);
            }, timeout);
        });
    }

    private ensureExistsOrThrow(directory: string, entrypoint: string) {
        if (!existsSync(directory))
            throw new Error(`Directory "${directory}" does not exist.`);
        if (!existsSync(join(directory, entrypoint)))
            throw new Error(`Entrypoint "${entrypoint}" does not exist.`);
        if (!existsSync(join(directory, 'requirements.txt')))
            throw new Error(`"requirements.txt" file is missing.`);
    }

    private createVirtualEnv(directory: string) {
        spawnSync('python', ['-m', 'venv', join(directory, '.venv')]);
    }

    private installDependencies(directory: string) {
        const python = this.getVirtualEnvPythonInterpreter(directory);
        const requirementsPath = join(directory, 'requirements.txt');
        const installDeps = spawn(python, [
            '-m',
            'pip',
            'install',
            '-r',
            requirementsPath,
        ]);

        return new Promise<void>((resolve) => {
            installDeps.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            installDeps.stderr.on('data', (data) => {
                console.log(`stderr: ${data}`);
            });

            installDeps.on('close', async (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    throw new Error(`Dependencies install failure: ${code}`);
                }
            });
        });
    }

    private getVirtualEnvPythonInterpreter(directory: string) {
        return join(directory, '.venv', 'bin', 'python');
    }

    private async spawnInstance(directory: string, entrypoint: string) {
        this.instance = spawn(this.getVirtualEnvPythonInterpreter(directory), [
            join(directory, entrypoint),
        ]);

        this.instance.stdout.on('data', (chunk) => {
            this.handleChunk(chunk);
        });

        // we expect all messages (logs, errors, etc) that is not the actual
        // response on the stderr stream so we don't touch the stdin encoding
        this.instance.stderr.on('data', (chunk) => {
            const msg = `🐍 Python: ${chunk.toString()}`;
            console.log(msg);
            this.instanceLogs$.next(msg);
        });
    }

    private packAndSend(message: any) {
        const payload = encode(message);
        const lengthBuffer = Buffer.alloc(4); // 4 bytes for the payload size
        lengthBuffer.writeUint32LE(payload.length, 0);

        this.instance.stdin.write(lengthBuffer);
        this.instance.stdin.write(payload);
    }

    private postfixExtension(entrypoint: string) {
        return entrypoint.endsWith('.py') ? entrypoint : `${entrypoint}.py`;
    }

    private handleChunk = (chunk: Buffer, messageBuffer = Buffer.alloc(0)) => {
        messageBuffer = Buffer.concat([messageBuffer, chunk]);

        while (messageBuffer.length >= 4) {
            const messageLength = messageBuffer.readUInt32LE(0);

            if (messageBuffer.length >= 4 + messageLength) {
                const messagePayload = messageBuffer.slice(
                    4,
                    4 + messageLength
                );
                const decoded = decode(messagePayload);
                this.instanceOutputs$.next(decoded);

                messageBuffer = messageBuffer.slice(4 + messageLength);
            } else {
                // Not enough data yet
                break;
            }
        }
    };
}
