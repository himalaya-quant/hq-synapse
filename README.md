# 🧬 Synapse

A lightweight TypeScript utility to **spawn and interact with Python modules** from Node.js with a native, message-based protocol over stdin/stdout.

It creates isolated Python environments on the fly, manages their lifecycle, and communicates using efficient [MessagePack](https://msgpack.org/index.html) serialization — ideal for ML/data pipelines, custom logic, or tight Python↔Node integrations.

---

## ✨ Features

- 🔄 Spawns Python scripts as subprocesses
- ⚡️ Reuses instances until explicit disposal avoiding spawn overhead
- 🐍 Creates a dedicated Python `venv` automatically
- 📦 Installs dependencies via `requirements.txt`
- 📡 Communicates using binary MessagePack over stdin/stdout
- ✅ Handles sequential and parallel message flows with queuing
- 🧹 Manages graceful and forceful termination with dispose

---

## 📦 Installation

```bash
npm install @himalaya-quant/synapse
```

> Make sure `python` (>= 3.6) is available in your system path.

## 🚀 Usage (Node.js)

```ts
import { Synapse } from '@himalaya-quant/synapse';

const synapseInstance = new Synapse();
await synapseInstance.spawn('./py_test_module', 'main');

const result = await synapseInstance.call({ foo: 'bar' });
console.log('🟢 Python response:', result);

await synapseInstance.dispose();
```

---

## 🧪 Example: Python module

This file serves as a reference entry point (main.py) for your Python module used with Synapse. It contains the minimal logic required to receive and process messages from Synapse.

You can either:

- Use it as-is as your default entrypoint
- Or adapt it to your needs — just make sure to preserve the same message-handling structure.
  _Failing to do so may result in your Python process not receiving any input from Synapse_

**💡 Tip**: If you’re unsure or just getting started, simply copy this example as it is.
Replace the call to `my_custom_script(payload)` with your own function, and remove the sample `my_custom_script` definition.

### `main.py`

```python
import sys
import struct
import msgpack

################################################################################
# This function is just an example of what could be your script entrypoint
# You can create as many files you want and import them. They'll just work.
# This function should be deleted, and this file should be kept as minimal as
# possible. Just create your own script file, import it in this one, and call
# the entry point where this "my_custom_script" is called now.
################################################################################
def my_custom_script(payload):
    # Do something with the payload:
    # for example you can interpret it as a command caller
    # or just data to feed to your script
    # anything that is JSON"ish" will work
    print("Do something with the payload")

    # You can return any dict here, but remember
    # to map the correct keys on node
    return {"data": f"Processing result from py of payload: {payload}"}


def main():
    while True:
        length_data = sys.stdin.buffer.read(4)
        if not length_data:
            return

        payload_size = int.from_bytes(length_data, byteorder='little')
        raw_payload = sys.stdin.buffer.read(payload_size)

        if raw_payload:
            payload = msgpack.unpackb(raw_payload)
        else:
            sys.stdout.buffer.write(msgpack.packb("empty payload received"))
            return

        ########################################################################
        #                    PLACE YOUR SCRIPT LOGIC HERE
        ########################################################################
        result = my_custom_script(payload)
        ########################################################################

        send_message(result)


def send_message(message):
    payload = msgpack.packb(message)
    length = struct.pack("<I", len(payload))  # 4-byte little-endian
    sys.stdout.buffer.write(length + payload)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
```

---

## 📁 Python module requirements

Each Python module directory should include:

- A Python script that serves as entry point (e.g., `main.py`), containing the
  message processing logic, and which calls your own script with each new message.
- A `requirements.txt` that contains at least the `msgpack==1.1.0` dependency
  and all your other dependencies
- Any other Python scripts files that you want to include and import

When calling `.spawn()`, the following happens:

1. If `.venv/` doesn’t exist, it gets created via `python -m venv`
2. Dependencies are installed from `requirements.txt`
3. The module is launched in the virtual environment

---

## 📕 Note on dependencies installation

To speed up the instantiation process, Synapse checks if a `.venv` directory is
already present. If so, it assumes that the dependencies are already installed,
skipping the virtual environment creation process, and the dependencies install.

Be sure to have no `.venv` directory present in the python module if you want
the dependencies installation process to run.

## 📚 API

#### `spawn(directory: string, entrypoint: string): Promise<void>`

- Starts a Python process from the specified entrypoint script inside the given directory.
- Automatically sets up `.venv` and installs dependencies.

#### `call(input: any): Promise<any>`

- Sends a serialized MessagePack message to Python and waits for a response.
- Handles both sequential and parallel calls safely.

#### `dispose(): Promise<void>`

- Gracefully terminates the process.
- If it doesn’t exit within 500ms, it’s force-killed.

---

## ✅ Test Coverage (Jest)

The included test suite ensures:

- ✔️ Correct responses from Python (`echo`-style)
- ⟲ Sequential message handling
- ⚡ Parallel calls work as expected (with queueing)
- ❌ Error handling:
    - Calling before spawn
    - Missing directories, scripts, or requirements.txt

---

## 🔑 Design Notes

- Uses `msgpack` for compact and fast I/O.
- Stdin communication starts with a 4-byte payload length (Little Endian), followed by the packed data.
- All stderr logs are passed through to a dedicated stream for debugging.
- Output is routed to a stream so the consumer can listen to responses or logs if needed.

---

## 🔮 Future Improvements

- [ ] Timeout per `.call()`
- [ ] Auto-restart on crash

---

## 📜 License

MIT — Free for personal and commercial use.

<br/>
<br/>
<p align="center">Developed with ❤️ by Caius Citiriga</p>
