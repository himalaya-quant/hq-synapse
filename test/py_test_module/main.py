import sys
import struct
import msgpack

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

        send_message(payload)


def send_message(message):
    payload = msgpack.packb(message)
    length = struct.pack("<I", len(payload))  # 4-byte little-endian
    sys.stdout.buffer.write(length + payload)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    print("script running", file=sys.stderr)
    main()
