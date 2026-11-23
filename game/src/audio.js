// Synthesized sound effects: every sound the game makes is built from oscillators and
// filtered noise in the Web Audio API, so the game ships no audio files. The context is
// created on the first user gesture; in screenshot mode it is never created at all.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      const length = context.sampleRate * 1;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  /** Call from any user gesture so the context is allowed to start. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ensure()) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + dur + 0.02);
  }

  const sounds = {
    shot() {
      noise(0.12, 0.5, 1800, 'highpass');
      tone(180, 0.1, 'square', 0.25, 60);
    },
    punch() {
      noise(0.08, 0.4, 900);
    },
    crash() {
      noise(0.25, 0.5, 500);
      tone(90, 0.2, 'sine', 0.4, 40);
    },
    explosion() {
      noise(0.8, 0.7, 300);
      tone(120, 0.7, 'sine', 0.5, 30);
    },
    cash() {
      tone(880, 0.09, 'sine', 0.3);
      setTimeout(() => tone(1320, 0.12, 'sine', 0.3), 90);
    },
    health() {
      tone(520, 0.12, 'sine', 0.3, 780);
    },
    steal() {
      tone(300, 0.15, 'square', 0.2, 200);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.3), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sine', 0.3), i * 140));
    },
    busted() {
      tone(220, 0.5, 'sawtooth', 0.3, 110);
    },
    wasted() {
      [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.25), i * 180));
    },
    siren() {
      // A short two-tone whoop, played when a police car first appears.
      tone(700, 0.28, 'sine', 0.22, 950);
      setTimeout(() => tone(950, 0.28, 'sine', 0.22, 700), 280);
    },
  };

  /** A continuous engine hum whose pitch follows the car's speed (0..1). */
  function setEngine(speed01) {
    if (!ensure()) return;
    if (!engineOsc) {
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    const target = speed01 > 0.02 ? 0.05 + speed01 * 0.06 : 0;
    engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 140, context.currentTime, 0.1);
  }

  /** A looping two-tone siren while the player is wanted; off otherwise. */
  function setSiren(on) {
    if (!ensure()) return;
    if (on && !sirenOsc) {
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 800;
      sirenLfo = context.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = context.createGain();
      sirenGain.gain.value = 0.045;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } else if (!on && sirenOsc) {
      try {
        sirenOsc.stop();
        sirenLfo.stop();
      } catch {
        // Already stopped.
      }
      sirenOsc = null;
      sirenLfo = null;
      sirenGain = null;
    }
  }

  function play(name) {
    if (sounds[name]) sounds[name]();
  }

  return { unlock, play, setEngine, setSiren };
}
