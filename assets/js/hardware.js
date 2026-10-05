/* Pure helpers for the flasher. Kept separate from flasher.js so they can be
   unit tested without a browser or a board, because both of these decide
   whether a write lands somewhere that bricks the device. */

/* Chip family selector value -> the family esptool reports. */
export const CHIP_NAMES = {
  esp32: 'ESP32',
  esp32s3: 'ESP32-S3',
  esp32s2: 'ESP32-S2',
  esp32c3: 'ESP32-C3',
  esp32c6: 'ESP32-C6',
  esp8266: 'ESP8266',
};

/* The ESP8266 is the one part that answers to more than one name: esptool's
   CHIP_NAME is "ESP8266" but its description reads "ESP8266EX" or "ESP8285"
   depending on an efuse. All three are the same selection, so all three are
   accepted. Every ESP32 entry stays a single exact name on purpose. */
const FAMILY_ALIASES = {
  esp8266: ['ESP8266', 'ESP8266EX', 'ESP8285'],
};

/* The largest flash any ESP32 variant takes, used as an upper bound so a
   fat-fingered offset is refused rather than passed to the bootloader. */
export const MAX_FLASH_OFFSET = 0x4000000;

/* esptool reports names like "ESP32-S3", and descriptions like
   "ESP32-D0WD-V3 (revision v3.1)". Both have to collapse to a family so that
   an ESP32-S3 never counts as a plain ESP32. */
export function chipFamily(reported) {
  const token = String(reported || '')
    .toUpperCase()
    .trim()
    .split(/[\s(]/)[0];

  if (!token) return '';

  const variant = /^ESP32-([SCHP]\d+)\b/.exec(token);
  if (variant) return `ESP32-${variant[1]}`;
  if (/^ESP32\b/.test(token) || /^ESP32-/.test(token)) return 'ESP32';
  return token;
}

/* Exact family comparison. A prefix test would let every ESP32-xx variant
   satisfy a plain "ESP32" selection, which is the default, and flashing an
   ESP32 image to an S3 needs manual recovery. */
export function chipMatches(selectedKey, reported) {
  const expected = CHIP_NAMES[selectedKey];
  if (!expected || !reported) return true;

  const accepted = FAMILY_ALIASES[selectedKey] || [expected];
  return accepted.includes(chipFamily(reported));
}

/* Strict. parseInt would read "+0x1000" as 0 and flash the image over the
   bootloader without saying anything. */
export function parseOffset(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return 0;

  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) {
    throw new Error(`"${raw}" is not a valid flash offset. Use 0x0, 0x10000 or a plain number.`);
  }

  const value = /^0x/i.test(text) ? parseInt(text.slice(2), 16) : parseInt(text, 10);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`"${raw}" is not a valid flash offset.`);
  }
  if (value > MAX_FLASH_OFFSET) {
    throw new Error(`Offset ${text} is past the end of any ESP32 flash.`);
  }
  return value;
}

/* Offsets from firmware.json get the same treatment. Coercing a typo to 0
   would write a bare app image over the bootloader. */
export function manifestOffset(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  try {
    return parseOffset(value);
  } catch (error) {
    throw new Error(`${label} has an invalid offset in firmware.json: ${error.message}`);
  }
}

export function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
