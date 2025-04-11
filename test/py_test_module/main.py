# from binance import fetch_ohlcv
# from denoised_trend import hpt_denoised_trend

# data = fetch_ohlcv(since_year="2022", since_month="01", since_day="01")
# denoised_trend_df = hpt_denoised_trend(data)
# print(denoised_trend_df.head())
import sys
import json
import msgpack

packer = msgpack.Packer()

def main():
    while True:
        # Read the size of the incoming message (4 bytes for the length)
        length_data = sys.stdin.buffer.read(4)
        if not length_data:
            return

        # Get the length of the payload
        payload_size = int.from_bytes(length_data, byteorder='little')
        # print("📥 Got payload size:", payload_size, file=sys.stderr)

        # Now read the actual message with the size we just got
        payload = sys.stdin.buffer.read(payload_size)
        # print("📥 Got full payload", file=sys.stderr)

        if payload:
            # Deserialize the message (if it's msgpack)
            message = msgpack.unpackb(payload)
            # print("📥 Got unpacked message:", message, file=sys.stderr)

            # TODO: Do something with the message

            # Write encoded response to stdout and flush it
            sys.stdout.buffer.write(packer.pack(message))
            sys.stdout.flush()  # SUPER IMPORTANT

            # print("📤 Sent response", file=sys.stderr)

if __name__ == "__main__":
    print("Running", file=sys.stderr)
    main()
