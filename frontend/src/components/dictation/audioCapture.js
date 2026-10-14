// Microphone capture for dictation: mono, 16 kHz, 16-bit little-endian PCM in ~100 ms chunks,
// which is what Amazon Transcribe streaming expects.

export const TARGET_RATE = 16000;
export const CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz

/** Turns the browser's native-rate float samples (usually 44.1 or 48 kHz) into 16 kHz Int16 samples. */
export class Downsampler {
  constructor(inputRate, outputRate = TARGET_RATE) {
    this.ratio = inputRate / outputRate;
    this.pending = new Float32Array(0);
  }

  push(samples) {
    const buffer = new Float32Array(this.pending.length + samples.length);
    buffer.set(this.pending, 0);
    buffer.set(samples, this.pending.length);
    const outLength = Math.floor(buffer.length / this.ratio);
    const out = new Int16Array(outLength);
    for (let i = 0; i < outLength; i += 1) {
      const from = Math.floor(i * this.ratio);
      const to = Math.max(from + 1, Math.floor((i + 1) * this.ratio));
      let sum = 0;
      for (let j = from; j < to; j += 1) sum += buffer[j];
      const value = Math.max(-1, Math.min(1, sum / (to - from)));
      out[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }
    this.pending = buffer.slice(Math.floor(outLength * this.ratio));
    return out;
  }
}

const WORKLET = `
class DictationCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("dictation-capture", DictationCapture);
`;

export function captureSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext !== false &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    !!(window.AudioContext || window.webkitAudioContext) &&
    typeof WebSocket !== "undefined"
  );
}

/**
 * Start listening. `onChunk(Uint8Array)` gets ~100 ms of PCM at a time; `onLevel(0..1)` gets a loudness reading.
 * Resolves to { stop() } once the microphone is open; rejects with the browser's error if it is not allowed.
 */
export async function startCapture({ onChunk, onLevel }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const source = context.createMediaStreamSource(stream);
  const down = new Downsampler(context.sampleRate);
  let queue = new Int16Array(0);
  let running = true;

  const handle = (floats) => {
    if (!running) return;
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < floats.length; i += 1) sum += floats[i] * floats[i];
      onLevel(Math.min(1, Math.sqrt(sum / floats.length) * 4));
    }
    const samples = down.push(floats);
    const merged = new Int16Array(queue.length + samples.length);
    merged.set(queue, 0);
    merged.set(samples, queue.length);
    let at = 0;
    while (merged.length - at >= CHUNK_SAMPLES) {
      onChunk(new Uint8Array(merged.slice(at, at + CHUNK_SAMPLES).buffer));
      at += CHUNK_SAMPLES;
    }
    queue = merged.slice(at);
  };

  let node = null;
  let url = null;
  try {
    url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await context.audioWorklet.addModule(url);
    node = new AudioWorkletNode(context, "dictation-capture");
    node.port.onmessage = (event) => handle(event.data);
  } catch (e) {
    // Older browsers, or a policy that blocks blob: worklets: fall back to the older API.
    node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => handle(new Float32Array(event.inputBuffer.getChannelData(0)));
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
  source.connect(node);
  node.connect(context.destination); // a processor must be connected to run; it outputs silence

  return {
    stop() {
      running = false;
      try {
        node.disconnect();
        source.disconnect();
      } catch (e) {
        /* already disconnected */
      }
      stream.getTracks().forEach((t) => t.stop());
      if (context.state !== "closed") context.close().catch(() => {});
    },
  };
}
