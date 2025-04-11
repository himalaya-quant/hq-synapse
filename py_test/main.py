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
