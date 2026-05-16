// buildFingerprint.js
//
// Pure helper that returns a deterministic SHA-1 fingerprint of a build's
// battle identity. Two builds with the same fingerprint are considered the
// same build for de-duplication purposes.
//
// Identity rules (mirrored exactly in api/shared/build_fingerprint.py):
//   - species, form, item, ability, nature, tera_type: exact string or null
//   - moves: ORDER-SENSITIVE (Showdown slot order is meaningful)
//   - evs: per-system; each system's spread sorted by stat key. Different
//          EV systems (champions vs classic) are NOT collapsed.
//   - egg_moves: SORTED (set semantics)
//   - slug is excluded (it's derived from species+form)
//
// Algorithm: build a canonical JSON string with sorted top-level keys and
// sorted nested keys, then SHA-1 the UTF-8 bytes.

const FINGERPRINT_VERSION = 2;

function sortedObject(obj) {
  if (obj == null) return null;
  if (typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    out[key] = (val && typeof val === 'object' && !Array.isArray(val))
      ? sortedObject(val)
      : val;
  }
  return out;
}

function canonicalPayload(build, eggMoves) {
  const b = build || {};
  const moves = Array.isArray(b.moves) ? b.moves.slice() : [];
  const evsIn = (b.evs && typeof b.evs === 'object') ? b.evs : {};
  const evs = {};
  for (const sys of Object.keys(evsIn).sort()) {
    evs[sys] = sortedObject(evsIn[sys] || {});
  }
  const egg = Array.isArray(eggMoves) ? eggMoves.slice().sort() : [];
  return {
    v: FINGERPRINT_VERSION,
    species: b.species || null,
    form: b.form || null,
    item: b.item || null,
    ability: b.ability || null,
    nature: b.nature || null,
    tera_type: b.tera_type || null,
    moves,
    evs,
    egg_moves: egg,
  };
}

// Stringify with sorted keys at every level.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

// Pure-JS SHA-1 (no Web Crypto; we want a synchronous helper that works
// in any context without async hoops). Implementation: standard FIPS 180-1.
function sha1Hex(str) {
  // Convert string to UTF-8 bytes
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      // surrogate pair
      i++;
      const c2 = str.charCodeAt(i);
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }

  // Pre-processing: append '1' bit, pad with zeros, append 64-bit length
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  // 64-bit big-endian length
  for (let i = 7; i >= 0; i--) {
    bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
  }

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;

  const w = new Array(80);
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunkStart + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((x << 1) | (x >>> 31)) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20)      { f = (b & c) | ((~b) & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d;            k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else             { f = b ^ c ^ d;            k = 0xca62c1d6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const toHex = n => ('00000000' + n.toString(16)).slice(-8);
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
}

function buildFingerprint(build, eggMoves) {
  const payload = canonicalPayload(build, eggMoves);
  return sha1Hex(stableStringify(payload));
}

export const BuildFingerprint = { buildFingerprint, FINGERPRINT_VERSION };
window.BuildFingerprint = BuildFingerprint;
