// All sound is synthesized with WebAudio — no audio files, no network. The context is created
// lazily on the first user gesture (browsers block audio before one) and every effect is a short
// oscillator/noise envelope, so the game stays silent until the player starts it.
let context = null;
let master = null;
let muted = false;

function ensure() {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return true;
  }
  try {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return false;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
    return true;
  } catch {
    return false;
  }
}

function tone({ type = 'sine', from = 440, to = null, seconds = 0.12, gain = 0.5, when = 0 }) {
  if (!ensure() || muted) return;
  const start = context.currentTime + when;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
  osc.connect(amp);
  amp.connect(master);
  osc.start(start);
  osc.stop(start + seconds + 0.02);
}

function noise({ seconds = 0.25, gain = 0.5, from = 1200, to = 120 }) {
  if (!ensure() || muted) return;
  const start = context.currentTime;
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
  const amp = context.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
  source.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  source.start(start);
}

export const sfx = {
  unlock() {
    ensure();
  },
  shoot() {
    tone({ type: 'square', from: 880, to: 320, seconds: 0.07, gain: 0.16 });
  },
  explode() {
    noise({ seconds: 0.3, gain: 0.5, from: 1600, to: 90 });
    tone({ type: 'sine', from: 160, to: 40, seconds: 0.28, gain: 0.4 });
  },
  hit() {
    tone({ type: 'sawtooth', from: 220, to: 70, seconds: 0.22, gain: 0.45 });
    noise({ seconds: 0.18, gain: 0.35, from: 900, to: 100 });
  },
  pickup() {
    tone({ type: 'sine', from: 660, to: 990, seconds: 0.09, gain: 0.22 });
  },
  shard() {
    tone({ type: 'sine', from: 1180, to: 1560, seconds: 0.08, gain: 0.14 });
  },
  wave() {
    tone({ type: 'triangle', from: 392, to: 392, seconds: 0.16, gain: 0.3 });
    tone({ type: 'triangle', from: 523, to: 523, seconds: 0.22, gain: 0.3, when: 0.14 });
  },
  boss() {
    tone({ type: 'sawtooth', from: 110, to: 110, seconds: 0.3, gain: 0.35 });
    tone({ type: 'sawtooth', from: 165, to: 165, seconds: 0.3, gain: 0.3, when: 0.25 });
  },
  upgrade() {
    tone({ type: 'triangle', from: 523, seconds: 0.1, gain: 0.28 });
    tone({ type: 'triangle', from: 659, seconds: 0.1, gain: 0.28, when: 0.09 });
    tone({ type: 'triangle', from: 784, seconds: 0.16, gain: 0.28, when: 0.18 });
  },
  bomb() {
    noise({ seconds: 0.6, gain: 0.6, from: 2400, to: 60 });
    tone({ type: 'sine', from: 90, to: 28, seconds: 0.55, gain: 0.5 });
  },
  victory() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone({ type: 'triangle', from: freq, seconds: 0.22, gain: 0.3, when: i * 0.13 });
    });
  },
  toggleMute() {
    muted = !muted;
    return muted;
  },
  isMuted() {
    return muted;
  },
};
