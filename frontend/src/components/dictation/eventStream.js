// AWS event-stream framing, the binary message format Amazon Transcribe streaming speaks over
// its WebSocket. We write it by hand (about 100 lines) so the app needs no extra dependency.
//
// Message layout (all integers big-endian):
//   total length (4) | headers length (4) | CRC32 of those 8 bytes (4) | headers | payload | CRC32 of everything before it (4)
// A header is: name length (1) | name | value type (1) | value (a string is: length (2) | bytes).

// Created on first use, so importing this file never needs TextEncoder (old test environments lack it).
let encoder = null;
let decoder = null;
const utf8 = { encode: (text) => (encoder || (encoder = new TextEncoder())).encode(text) };
const utf8Decoder = { decode: (bytes) => (decoder || (decoder = new TextDecoder())).decode(bytes) };

let table = null;
function crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

/** Standard CRC-32 (the one zlib and PNG use), as an unsigned number. */
export function crc32(bytes, start = 0, end = bytes.length) {
  const t = crcTable();
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function stringHeader(name, value) {
  const n = utf8.encode(name);
  const v = utf8.encode(value);
  const out = new Uint8Array(1 + n.length + 1 + 2 + v.length);
  const view = new DataView(out.buffer);
  out[0] = n.length;
  out.set(n, 1);
  out[1 + n.length] = 7; // string
  view.setUint16(2 + n.length, v.length);
  out.set(v, 4 + n.length);
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  parts.forEach((p) => {
    out.set(p, at);
    at += p.length;
  });
  return out;
}

/** Frame a message from string headers (an object of name: value) and a payload. */
export function encodeMessage(headerValues, payload) {
  const headers = concat(Object.entries(headerValues).map(([name, value]) => stringHeader(name, value)));
  const total = 12 + headers.length + payload.length + 4;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, total);
  view.setUint32(4, headers.length);
  view.setUint32(8, crc32(out, 0, 8));
  out.set(headers, 12);
  out.set(payload, 12 + headers.length);
  view.setUint32(total - 4, crc32(out, 0, total - 4));
  return out;
}

/** Wrap raw 16-bit PCM bytes as an AudioEvent message. An empty payload tells Transcribe the audio has ended. */
export function encodeAudioEvent(pcmBytes) {
  return encodeMessage(
    { ":content-type": "application/octet-stream", ":event-type": "AudioEvent", ":message-type": "event" },
    pcmBytes
  );
}

const FIXED_SIZE = { 2: 1, 3: 2, 4: 4, 5: 8, 8: 8, 9: 16 };

/** Parse one message. Throws if the lengths or checksums do not add up. Returns { headers, payload }. */
export function decodeMessage(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 16) throw new Error("event-stream message too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const total = view.getUint32(0);
  const headersLength = view.getUint32(4);
  if (total !== bytes.length || 12 + headersLength > total - 4) throw new Error("event-stream length mismatch");
  if (view.getUint32(8) !== crc32(bytes, 0, 8)) throw new Error("event-stream prelude checksum mismatch");
  if (view.getUint32(total - 4) !== crc32(bytes, 0, total - 4)) throw new Error("event-stream checksum mismatch");

  const headers = {};
  let at = 12;
  const headersEnd = 12 + headersLength;
  while (at < headersEnd) {
    const nameLength = bytes[at];
    const name = utf8Decoder.decode(bytes.subarray(at + 1, at + 1 + nameLength));
    at += 1 + nameLength;
    const type = bytes[at];
    at += 1;
    if (type === 0 || type === 1) {
      headers[name] = type === 0;
    } else if (type === 6 || type === 7) {
      const length = view.getUint16(at);
      const raw = bytes.subarray(at + 2, at + 2 + length);
      headers[name] = type === 7 ? utf8Decoder.decode(raw) : raw;
      at += 2 + length;
    } else if (FIXED_SIZE[type]) {
      at += FIXED_SIZE[type];
    } else {
      throw new Error("unknown event-stream header type");
    }
  }
  return { headers, payload: bytes.subarray(headersEnd, total - 4) };
}

/**
 * Turn a decoded message into what the dictation code cares about:
 *   { type: "transcript", results: [{ partial, text }] }
 *   { type: "error", name, message }
 *   null for anything else.
 */
export function readTranscriptEvent(message) {
  const kind = message.headers[":message-type"];
  let body = null;
  try {
    body = message.payload.length ? JSON.parse(utf8Decoder.decode(message.payload)) : null;
  } catch (e) {
    body = null;
  }
  if (kind === "exception") {
    return { type: "error", name: message.headers[":exception-type"] || "Exception", message: (body && body.Message) || "" };
  }
  if (kind === "event" && message.headers[":event-type"] === "TranscriptEvent" && body && body.Transcript) {
    const results = (body.Transcript.Results || []).map((r) => ({
      partial: !!r.IsPartial,
      text: (r.Alternatives && r.Alternatives[0] && r.Alternatives[0].Transcript) || "",
    }));
    return { type: "transcript", results };
  }
  return null;
}

/**
 * A short, plain-language reason for an exception event from the speech service.
 * Contains only the service's own error name and message (never any dictated words).
 */
export function describeStreamError(event) {
  const name = (event && event.name) || "Exception";
  const message = ((event && event.message) || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (/no new audio|timed out/i.test(message)) return "Dictation stopped: no sound reached the speech service. Check that the right microphone is selected and not muted.";
  if (name === "LimitExceededException") return "Dictation stopped: too many dictation sessions are open for this AWS account. Try again in a moment.";
  if (/AccessDenied|NotAuthorized|Forbidden|signature|credential|security token|expired/i.test(name + " " + message)) {
    return `Dictation stopped: the speech service refused the request (${name}${message ? `: ${message}` : ""}). Ask an administrator to check the AWS permissions for dictation.`;
  }
  return `Dictation stopped: the speech service reported a problem (${name}${message ? `: ${message}` : ""}).`;
}
