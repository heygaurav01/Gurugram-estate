/**
 * Homepage sound, synthesized with the Web Audio API (no audio files).
 * Off until the visitor turns it on; browsers only allow audio after a tap.
 * The on/off choice is a per-visitor convenience kept in localStorage.
 */
const KEY = "ge-sound";
// A major pentatonic, so random taps always sound in tune.
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export type Sound = {
  readonly on: boolean;
  toggle: () => boolean;
  tap: () => void;
  whoosh: () => void;
  ding: () => void;
};

export function createSound(): Sound {
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let on = false;

  const ensure = () => {
    if (ctx) return ctx;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    startAmbience(ctx, master);
    return ctx;
  };

  const set = (next: boolean) => {
    on = next;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* storage blocked: the toggle still works for this visit */
    }
    if (!on && !ctx) return;
    const c = ensure();
    if (on) void c.resume();
    master!.gain.cancelScheduledValues(c.currentTime);
    master!.gain.setTargetAtTime(on ? 1 : 0, c.currentTime, on ? 0.6 : 0.15);
  };

  const voice = (fn: (c: AudioContext, out: GainNode) => void) => {
    if (!on || !ctx || !master) return;
    fn(ctx, master);
  };

  return {
    get on() {
      return on;
    },
    toggle: () => {
      set(!on);
      return on;
    },
    tap: () =>
      voice((c, out) => {
        const t = c.currentTime;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.value = NOTES[Math.floor(Math.random() * NOTES.length)]!;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.5);
      }),
    whoosh: () =>
      voice((c, out) => {
        const t = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = noise(c, 1.6);
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
        bp.frequency.exponentialRampToValueAtTime(500, t + 1.5);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        src.connect(bp).connect(g).connect(out);
        src.start(t);
      }),
    ding: () =>
      voice((c, out) => {
        // Two-tone lift chime.
        [1318.5, 1046.5].forEach((f, i) => {
          const t = c.currentTime + i * 0.32;
          for (const [mult, amp] of [
            [1, 0.08],
            [2.76, 0.015],
          ] as const) {
            const o = c.createOscillator();
            const g = c.createGain();
            o.frequency.value = f * mult;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
            o.connect(g).connect(out);
            o.start(t);
            o.stop(t + 1.5);
          }
        });
      }),
  };
}

/** Whether the visitor turned sound on during an earlier visit. */
export function soundWasOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function noise(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** A soft, slowly breathing pad: three detuned voices through a moving filter. */
function startAmbience(c: AudioContext, out: GainNode) {
  const pad = c.createGain();
  pad.gain.value = 0.035;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700;
  lp.Q.value = 0.6;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 320;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();
  for (const [f, type] of [
    [110, "sine"],
    [164.81, "triangle"],
    [246.94, "sine"],
    [277.18, "sine"],
  ] as const) {
    for (const detune of [-6, 6]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start();
    }
  }
  lp.connect(pad).connect(out);
}
