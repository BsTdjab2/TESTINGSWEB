/* MD5 over a binary string (one byte per char code).
   esptool-js uses this to verify what it wrote back off the chip, so a flash
   reports "verified" instead of just "finished". */

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Uint32Array(64);
for (let i = 0; i < 64; i += 1) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
}

function rotateLeft(value, count) {
  return (value << count) | (value >>> (32 - count));
}

function transform(state, block) {
  let [a, b, c, d] = state;

  for (let i = 0; i < 64; i += 1) {
    let f;
    let g;

    if (i < 16) {
      f = (b & c) | (~b & d);
      g = i;
    } else if (i < 32) {
      f = (d & b) | (~d & c);
      g = (5 * i + 1) % 16;
    } else if (i < 48) {
      f = b ^ c ^ d;
      g = (3 * i + 5) % 16;
    } else {
      f = c ^ (b | ~d);
      g = (7 * i) % 16;
    }

    const temp = d;
    d = c;
    c = b;
    b = (b + rotateLeft((a + f + K[i] + block[g]) >>> 0, SHIFTS[i])) >>> 0;
    a = temp;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
}

function toHex(value) {
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out += ((value >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}

export function md5(binary) {
  const state = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  const block = new Uint32Array(16);
  const length = binary.length;
  const fullBlocks = Math.floor(length / 64);

  for (let chunk = 0; chunk < fullBlocks; chunk += 1) {
    const offset = chunk * 64;
    for (let word = 0; word < 16; word += 1) {
      const p = offset + word * 4;
      block[word] =
        (binary.charCodeAt(p) & 0xff) |
        ((binary.charCodeAt(p + 1) & 0xff) << 8) |
        ((binary.charCodeAt(p + 2) & 0xff) << 16) |
        ((binary.charCodeAt(p + 3) & 0xff) << 24);
    }
    transform(state, block);
  }

  const tailStart = fullBlocks * 64;
  const tailLength = length - tailStart;
  const tail = new Uint8Array(tailLength + 9 <= 64 ? 64 : 128);

  for (let i = 0; i < tailLength; i += 1) {
    tail[i] = binary.charCodeAt(tailStart + i) & 0xff;
  }
  tail[tailLength] = 0x80;

  const bitsLow = (length << 3) >>> 0;
  const bitsHigh = Math.floor(length / 536870912) >>> 0;
  const lengthOffset = tail.length - 8;
  for (let i = 0; i < 4; i += 1) {
    tail[lengthOffset + i] = (bitsLow >>> (i * 8)) & 0xff;
    tail[lengthOffset + 4 + i] = (bitsHigh >>> (i * 8)) & 0xff;
  }

  for (let chunk = 0; chunk < tail.length / 64; chunk += 1) {
    const offset = chunk * 64;
    for (let word = 0; word < 16; word += 1) {
      const p = offset + word * 4;
      block[word] = tail[p] | (tail[p + 1] << 8) | (tail[p + 2] << 16) | (tail[p + 3] << 24);
    }
    transform(state, block);
  }

  return toHex(state[0]) + toHex(state[1]) + toHex(state[2]) + toHex(state[3]);
}
