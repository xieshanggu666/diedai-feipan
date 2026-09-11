import { Howl, Howler } from 'howler';

function renderWave(kind: 'sine' | 'triangle' | 'noise', frequency: number, duration: number, volume = 0.18): string {
  const sampleRate = 22050;
  const length = Math.floor(sampleRate * duration);
  const data = new Uint8Array(44 + length);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0x52494646, false); // RIFF
  view.setUint32(4, 36 + length, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, length, true);

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.pow(1 - t / duration, 2.2);
    let value = 0;
    if (kind === 'noise') {
      value = (Math.random() * 2 - 1) * Math.exp(-t * 18);
    } else if (kind === 'triangle') {
      const phase = (t * frequency) % 1;
      value = (4 * Math.abs(phase - 0.5) - 1) * 0.55;
    } else {
      value = Math.sin(Math.PI * 2 * frequency * t) * 0.72 + Math.sin(Math.PI * 2 * frequency * 1.98 * t) * 0.18;
    }
    data[44 + i] = Math.max(0, Math.min(255, 128 + value * envelope * volume * 127));
  }

  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const sources = {
  click: renderWave('sine', 620, 0.055, 0.12),
  snap: renderWave('triangle', 880, 0.12, 0.2),
  catch: renderWave('sine', 360, 0.08, 0.16),
  throw: renderWave('noise', 0, 0.11, 0.12),
  error: renderWave('triangle', 160, 0.22, 0.2),
  score: renderWave('sine', 740, 0.32, 0.22),
  wind: renderWave('noise', 0, 0.5, 0.045)
};

const sounds: Record<string, Howl> = {};

export function unlockAudio(): void {
  if (!sounds.click) {
    for (const [name, src] of Object.entries(sources)) {
      sounds[name] = new Howl({ src: [src], format: 'wav', volume: name === 'wind' ? 0.55 : 0.8 });
    }
  }
}

export function setMuted(muted: boolean): void {
  unlockAudio();
  Howler.mute(muted);
}

export function playSfx(name: keyof typeof sources): void {
  unlockAudio();
  const sound = sounds[name];
  if (sound) sound.play();
}
