/* The two decisions that can brick somebody's board: which chip we think is
   connected, and which address we write to. Both get exhaustive cases. */

import { chipFamily, chipMatches, parseOffset, manifestOffset } from '../assets/js/hardware.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function throws(fn, label) {
  try { fn(); } catch (error) { return; }
  throw new Error(`${label}: expected a throw, got none`);
}

test('chipFamily collapses reported names to a family', () => {
  eq(chipFamily('ESP32'), 'ESP32', 'plain');
  eq(chipFamily('ESP32-S3'), 'ESP32-S3', 's3');
  eq(chipFamily('ESP32-S2'), 'ESP32-S2', 's2');
  eq(chipFamily('ESP32-C3'), 'ESP32-C3', 'c3');
  eq(chipFamily('ESP32-C6'), 'ESP32-C6', 'c6');
  eq(chipFamily('ESP32-H2'), 'ESP32-H2', 'h2');
  eq(chipFamily('ESP32-D0WD-V3 (revision v3.1)'), 'ESP32', 'classic module variant');
  eq(chipFamily('ESP32-PICO-D4'), 'ESP32', 'pico is still a classic');
  eq(chipFamily('esp32-s3'), 'ESP32-S3', 'lowercase');
  eq(chipFamily('  ESP32-S3  '), 'ESP32-S3', 'padded');
  eq(chipFamily('ESP8266EX'), 'ESP8266EX', 'unrelated chip passes through');
  eq(chipFamily(''), '', 'empty');
  eq(chipFamily(null), '', 'null');
});

test('a variant never satisfies a plain ESP32 selection', () => {
  assert(!chipMatches('esp32', 'ESP32-S3'), 'S3 matched a plain ESP32 selection');
  assert(!chipMatches('esp32', 'ESP32-S2'), 'S2 matched');
  assert(!chipMatches('esp32', 'ESP32-C3'), 'C3 matched');
  assert(!chipMatches('esp32', 'ESP32-C6'), 'C6 matched');
  assert(!chipMatches('esp32', 'ESP32-H2'), 'H2 matched');
});

test('the right board still matches', () => {
  assert(chipMatches('esp32', 'ESP32'), 'plain ESP32 rejected');
  assert(chipMatches('esp32', 'ESP32-D0WD-V3 (revision v3.1)'), 'classic module rejected');
  assert(chipMatches('esp32s3', 'ESP32-S3'), 'S3 rejected');
  assert(chipMatches('esp32s2', 'ESP32-S2'), 'S2 rejected');
  assert(chipMatches('esp32c3', 'ESP32-C3'), 'C3 rejected');
});

test('cross-variant mismatches are caught both ways', () => {
  assert(!chipMatches('esp32s3', 'ESP32'), 'plain matched an S3 selection');
  assert(!chipMatches('esp32s3', 'ESP32-S2'), 'S2 matched an S3 selection');
  assert(!chipMatches('esp32c3', 'ESP32-C6'), 'C6 matched a C3 selection');
});

test('the ESP8266 answers to all three of its reported names', () => {
  assert(chipMatches('esp8266', 'ESP8266'), 'CHIP_NAME form rejected');
  assert(chipMatches('esp8266', 'ESP8266EX'), 'description form rejected');
  assert(chipMatches('esp8266', 'ESP8285'), 'ESP8285 rejected');
});

test('the ESP8266 aliases do not leak into the ESP32 selections', () => {
  assert(!chipMatches('esp32', 'ESP8266'), 'ESP8266 matched an ESP32 selection');
  assert(!chipMatches('esp8266', 'ESP32'), 'ESP32 matched an ESP8266 selection');
  assert(!chipMatches('esp8266', 'ESP32-S3'), 'S3 matched an ESP8266 selection');
});

test('ESP32-C6 is exact like every other variant', () => {
  assert(chipMatches('esp32c6', 'ESP32-C6'), 'C6 rejected');
  assert(!chipMatches('esp32c6', 'ESP32-C3'), 'C3 matched a C6 selection');
  assert(!chipMatches('esp32c6', 'ESP32-C61'), 'C61 matched a C6 selection');
});

test('an unknown selection or unread chip does not block', () => {
  assert(chipMatches('mystery', 'ESP32-S3'), 'unknown selector should not block');
  assert(chipMatches('esp32', ''), 'unread chip should not block');
  assert(chipMatches('esp32', null), 'null chip should not block');
});

test('parseOffset accepts the real forms', () => {
  eq(parseOffset('0x0'), 0, 'hex zero');
  eq(parseOffset('0x1000'), 4096, 'hex 0x1000');
  eq(parseOffset('0x10000'), 65536, 'hex 0x10000');
  eq(parseOffset('0X10000'), 65536, 'uppercase prefix');
  eq(parseOffset('65536'), 65536, 'decimal');
  eq(parseOffset('0'), 0, 'decimal zero');
  eq(parseOffset('  0x1000  '), 4096, 'padded');
  eq(parseOffset(''), 0, 'empty defaults to 0');
  eq(parseOffset(null), 0, 'null defaults to 0');
  eq(parseOffset(4096), 4096, 'number input');
});

test('parseOffset refuses the forms parseInt would silently mangle', () => {
  throws(() => parseOffset('+0x1000'), '+0x1000');
  throws(() => parseOffset('-0x1000'), '-0x1000');
  throws(() => parseOffset('0b1000'), '0b1000');
  throws(() => parseOffset('0x1000zz'), 'trailing garbage');
  throws(() => parseOffset('12 34'), 'embedded space');
  throws(() => parseOffset('1e6'), 'exponent');
  throws(() => parseOffset('1_000'), 'underscore');
  throws(() => parseOffset('0x'), 'bare prefix');
  throws(() => parseOffset('0xGG'), 'non-hex digits');
  throws(() => parseOffset('nonsense'), 'words');
  throws(() => parseOffset('0x1000.5'), 'fractional');
});

test('parseOffset bounds the address', () => {
  throws(() => parseOffset('0xFFFFFFFFFFFF'), 'past any flash');
  eq(parseOffset('0x4000000'), 67108864, 'the maximum is allowed');
  throws(() => parseOffset('0x4000001'), 'one past the maximum');
});

test('manifest offsets are validated, not coerced', () => {
  eq(manifestOffset(0, 'X'), 0, 'zero');
  eq(manifestOffset(65536, 'X'), 65536, 'number');
  eq(manifestOffset('0x10000', 'X'), 65536, 'hex string');
  eq(manifestOffset(undefined, 'X'), 0, 'absent defaults to 0');
  eq(manifestOffset(null, 'X'), 0, 'null defaults to 0');
  throws(() => manifestOffset('abc', 'Bruce'), 'a typo must not become 0');
  throws(() => manifestOffset(-1, 'Bruce'), 'negative must not pass through');
  throws(() => manifestOffset('0x1000 ish', 'Bruce'), 'trailing words');
});

test('a manifest error names the firmware it came from', () => {
  try {
    manifestOffset('abc', 'Marauder');
    throw new Error('expected a throw');
  } catch (error) {
    assert(error.message.includes('Marauder'), `message lacks the name: ${error.message}`);
    assert(error.message.includes('firmware.json'), `message lacks the file: ${error.message}`);
  }
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
