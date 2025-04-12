import { join } from 'path';
import { existsSync } from 'fs';
import { encode, decode } from '@msgpack/msgpack';
import { Subject, Subscription, tap } from 'rxjs';

import {
  spawn,
  spawnSync,
  ChildProcessWithoutNullStreams,
} from 'child_process';

type QueuedInput = {
  input: any;
  parse?: boolean;
  resolver: (value: any) => void;
};

export class InstanceManger {
  private readonly inputsQueue: QueuedInput[] = [];
  private readonly instanceOutputs$ = new Subject<any>();
  private readonly instanceLogs$ = new Subject<string>();
  private readonly instanceInputs$ = new Subject<QueuedInput>();

  private messageBuffer = Buffer.alloc(0);
  private instance!: ChildProcessWithoutNullStreams;
  private currentInputResolver!: (value: any) => void;
  private instanceInputStreamSubscription!: Subscription;
  private instanceOutputStreamSubscription!: Subscription;

  /**
   * Subscription to the instance logs.
   * If you want your script logs to be seen by Synapse, in your python script
   * always print to the stderr like:
   *
   * ```py
   * import sys
   *
   * print("my log", file=sys.stderr)
   * ```
   *
   * every log written this way will pass through this stream.
   *
   * @returns {Observable} The observable to which you can subscribe to access
   * the logs stream.
   */
  get instanceLogs() {
    return this.instanceLogs$.asObservable();
  }

  /**
   * Calls the spawned python instance with the given input.
   * Throws if the instance has not been spawned first.
   *
   * @param input Any simple JSON structure will be accepted.
   * For more details see: https://msgpack.org/
   * @param forceJSONParse Forcefully tries to parse the result. If it
   * fails, will return the payload as it is.
   *
   * @returns The result returned from your python script.
   * @throws {Error} If the instance has not been spawned.
   */
  call<ResultType = any>(
    input: any,
    forceJSONParse = false
  ): Promise<ResultType> {
    if (!this.instance)
      throw new Error(`Cannot send inputs to instance before spawning it.`);

    return new Promise((resolver) => {
      this.inputsQueue.push({ input, resolver, parse: forceJSONParse });
      if (this.inputsQueue.length === 1)
        this.instanceInputs$.next(this.inputsQueue[0]);
    });
  }

  /**
   * Spawns a new python script instance and keeps it alive until dispose is
   * called. After the spawning you can safely start sending messages to it.
   * Throws if there's an error during the spawning process.
   *
   * What it does:
   * - Postfixes the extension .py to the entrypoint if missing
   * - Ensures that the paths are correct and the requirements.txt exists
   * - Creates a dedicated Python virtual environment
   * - Installs dependencies via requirements.txt
   * - Spawns Python script as subprocess
   * - Reuses instance until explicit disposal avoiding spawn overhead
   *
   * @param directory The path pointing to the python module directory.
   * @param entrypoint The entrypoint file name.
   *
   * @returns A promise that resolves once the spawn completes.
   * @throws {Error} If there's an error during the spawning process.
   */
  async spawn(directory: string, entrypoint: string): Promise<void> {
    entrypoint = this.postfixExtension(entrypoint);

    this.ensureExistsOrThrow(directory, entrypoint);

    if (!existsSync(join(directory, '.venv'))) {
      this.createVirtualEnv(directory);
      await this.installDependencies(directory);
    }

    await this.spawnInstance(directory, entrypoint);
    this.openSubscriptions();
  }

  /**
   * Disposes the instance, closing the stdin stream, all the subscriptions
   * and tries to kill the instance.
   * Manages graceful and forceful termination, first tries with a SIGTERM, if
   * after 500ms is not killed, will force a SIGKILL.
   * Throws if after the SIGKILL the instance is still alive.
   *
   * After dispose has been called, you will have to call spawn again. Trying
   * to send any messages after dispose, will result in an error.
   *
   * @returns Resolves once the dispose has been done.
   * @throws {Error} If after forceful termination the instance is still alive
   */
  async dispose() {
    this.instanceInputStreamSubscription?.unsubscribe();
    this.instanceOutputStreamSubscription?.unsubscribe();

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
      throw new Error(`Cannot kill instance with PID: ${this.instance.pid}`);
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

  private handleChunk = (chunk: Buffer) => {
    this.messageBuffer = Buffer.concat([this.messageBuffer, chunk]);

    while (this.messageBuffer.length >= 4) {
      const messageLength = this.messageBuffer.readUInt32LE(0);

      if (this.messageBuffer.length >= 4 + messageLength) {
        const messagePayload = this.messageBuffer.subarray(
          4,
          4 + messageLength
        );
        const decoded = decode(messagePayload);
        this.instanceOutputs$.next(decoded);

        this.messageBuffer = this.messageBuffer.subarray(4 + messageLength);
      } else {
        // Not enough data yet
        break;
      }
    }
  };

  private openSubscriptions() {
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
          const { parse, resolver } = this.inputsQueue.shift()!;
          let result = this.extractResult(parse, output);

          resolver(result);

          if (this.inputsQueue.length)
            this.instanceInputs$.next(this.inputsQueue[0]);
        })
      )
      .subscribe();
  }

  private extractResult(parse: boolean | undefined, output: any) {
    if (!parse) return output;

    let result: any;
    try {
      console.log(output);
      result = JSON.parse(output);
    } catch (e) {
      let msg = `[ERROR] forced parsing failed. Expected parsable str from py: `;
      msg += e instanceof Error ? e.message : JSON.stringify(e);
      this.instanceLogs$.next(msg);
      result = output;
    }

    return result;
  }
}
