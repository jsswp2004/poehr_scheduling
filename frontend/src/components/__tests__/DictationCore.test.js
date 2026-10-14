import { TextDecoder, TextEncoder } from "util";
import { crc32, decodeMessage, encodeAudioEvent, encodeMessage, readTranscriptEvent } from "../dictation/eventStream";
import { appendText, applyVoiceCommands } from "../dictation/commands";
import { CHUNK_SAMPLES, Downsampler } from "../dictation/audioCapture";

// jsdom (the test browser) does not provide these two; real browsers do.
Object.assign(global, { TextEncoder, TextDecoder });

const json = (value) => new TextEncoder().encode(JSON.stringify(value));

describe("event-stream framing", () => {
  test("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  test("an audio event round-trips with its headers and exact bytes", () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 250, 251]);
    const message = decodeMessage(encodeAudioEvent(pcm));
    expect(message.headers).toEqual({
      ":content-type": "application/octet-stream",
      ":event-type": "AudioEvent",
      ":message-type": "event",
    });
    expect(Array.from(message.payload)).toEqual([1, 2, 3, 4, 250, 251]);
  });

  test("an empty audio event (end of audio) is valid", () => {
    expect(decodeMessage(encodeAudioEvent(new Uint8Array(0))).payload.length).toBe(0);
  });

  test("a damaged message is rejected", () => {
    const bytes = encodeAudioEvent(new Uint8Array([9, 9, 9]));
    bytes[bytes.length - 6] ^= 0xff;
    expect(() => decodeMessage(bytes)).toThrow(/checksum/);
    expect(() => decodeMessage(bytes.slice(0, 10))).toThrow();
  });

  test("a transcript event is read as partial and final results", () => {
    const body = {
      Transcript: {
        Results: [
          { IsPartial: true, Alternatives: [{ Transcript: "patient reports" }] },
          { IsPartial: false, Alternatives: [{ Transcript: "Patient reports a cough." }] },
        ],
      },
    };
    const message = decodeMessage(
      encodeMessage({ ":message-type": "event", ":event-type": "TranscriptEvent", ":content-type": "application/json" }, json(body))
    );
    expect(readTranscriptEvent(message)).toEqual({
      type: "transcript",
      results: [
        { partial: true, text: "patient reports" },
        { partial: false, text: "Patient reports a cough." },
      ],
    });
  });

  test("an exception is reported with its name, and unknown events are ignored", () => {
    const failure = decodeMessage(
      encodeMessage({ ":message-type": "exception", ":exception-type": "BadRequestException" }, json({ Message: "bad audio" }))
    );
    expect(readTranscriptEvent(failure)).toEqual({ type: "error", name: "BadRequestException", message: "bad audio" });
    const other = decodeMessage(encodeMessage({ ":message-type": "event", ":event-type": "Other" }, json({})));
    expect(readTranscriptEvent(other)).toBeNull();
  });
});

describe("voice commands", () => {
  test("new paragraph and new line become line breaks", () => {
    expect(applyVoiceCommands("No chest pain new paragraph Plan is rest")).toEqual({ text: "No chest pain\n\nPlan is rest", stop: false });
    expect(applyVoiceCommands("Lungs clear. New line Heart regular.").text).toBe("Lungs clear.\nHeart regular.");
  });

  test("a command on its own is kept as a line break", () => {
    expect(applyVoiceCommands("new paragraph").text).toBe("\n\n");
  });

  test("stop dictation ends the session and is not typed", () => {
    expect(applyVoiceCommands("That is all. Stop dictation.")).toEqual({ text: "That is all", stop: true });
    expect(applyVoiceCommands("stop dictation")).toEqual({ text: "", stop: true });
  });

  test("ordinary text is untouched", () => {
    expect(applyVoiceCommands("Started azithromycin 500 mg.")).toEqual({ text: "Started azithromycin 500 mg.", stop: false });
  });

  test("appendText joins with one space, and respects line breaks", () => {
    expect(appendText("", "Hello")).toBe("Hello");
    expect(appendText("Cough", "for three days.")).toBe("Cough for three days.");
    expect(appendText("Cough.\n", "Fever.")).toBe("Cough.\nFever.");
    expect(appendText("Cough.", "\n\nFever.")).toBe("Cough.\n\nFever.");
    expect(appendText(undefined, "Hi")).toBe("Hi");
    expect(appendText("Keep", "")).toBe("Keep");
  });
});

describe("downsampling", () => {
  test("48 kHz becomes 16 kHz, keeping the level", () => {
    const down = new Downsampler(48000);
    const out = down.push(new Float32Array(4800).fill(0.5));
    expect(out.length).toBe(1600);
    expect(out.every((v) => Math.abs(v - Math.round(0.5 * 0x7fff)) <= 1)).toBe(true);
  });

  test("leftover samples carry into the next call", () => {
    const down = new Downsampler(44100);
    const total = [1000, 1000, 1000, 1000].reduce((sum, n) => sum + down.push(new Float32Array(n)).length, 0);
    expect(total).toBe(Math.floor(4000 / (44100 / 16000)));
  });

  test("clips instead of wrapping", () => {
    const out = new Downsampler(16000).push(new Float32Array([2, -2]));
    expect(Array.from(out)).toEqual([0x7fff, -0x8000]);
  });

  test("a chunk is 100 ms", () => {
    expect(CHUNK_SAMPLES).toBe(1600);
  });
});
