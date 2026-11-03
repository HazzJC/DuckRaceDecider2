import type { Sfx } from "../audio/sfx";
import type { Mixer } from "../audio/mixer";

export interface Voice {
  pitch: number;
  rate: number;
  /** 0 smooth .. 1.4 very raspy */
  rasp?: number;
}

export interface Spoken {
  duration: number;
  /** syllable windows relative to start, for beak sync and caption reveal */
  syllables: { start: number; end: number; charEnd: number }[];
}

const MAX_SYLLABLES = 22;

/** Count vowel groups as a rough syllable count. */
function syllablesIn(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, Math.min(4, groups ? groups.length : 1));
}

/**
 * Quack-speak: every syllable of a caption becomes a short formant quack. Pitch follows the caster,
 * excitement and punctuation (questions rise, exclamations punch). ALL-CAPS words are louder and faster.
 */
export class QuackSpeak {
  constructor(private mixer: Mixer, private sfx: Sfx) {}

  say(text: string, voice: Voice, excitement: number, silent = false): Spoken {
    const ctx = this.mixer.ctx;
    const start = ctx.currentTime + 0.03;
    const words = [...text.matchAll(/\S+/g)];
    const shout = text.trim().endsWith("!");
    const question = text.trim().endsWith("?");

    // squeeze long lines so captions don't drag
    let total = words.reduce((a, w) => a + syllablesIn(w[0]), 0);
    const squeeze = total > MAX_SYLLABLES ? MAX_SYLLABLES / total : 1;
    total = Math.min(total, MAX_SYLLABLES);

    const syllables: Spoken["syllables"] = [];
    let t = 0;
    let n = 0;
    for (const w of words) {
      const word = w[0];
      const caps = word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
      const count = Math.max(1, Math.round(syllablesIn(word) * squeeze));
      const vowels = word.toLowerCase().match(/[aeiouy]+/g) ?? ["a"];
      const sylDur = (caps ? 0.13 : 0.15) / voice.rate;
      for (let i = 0; i < count; i++) {
        const k = n / Math.max(1, total - 1);
        let inflect = 1 + Math.sin(n * 1.7) * 0.06;
        if (question) inflect *= 1 + k * k * 0.35;
        if (shout) inflect *= 1 + (k > 0.8 ? 0.2 : 0);
        const pitch = voice.pitch * (1 + excitement * 0.22) * inflect * (0.94 + Math.random() * 0.12);
        if (!silent)
          this.sfx.quack({
            pitch,
            dur: sylDur * 0.88,
            vol: (caps ? 0.45 : 0.32) * (0.85 + excitement * 0.3),
            bus: "casters",
            when: start + t,
            bright: 1 + excitement * 0.12,
            vowel: vowels[Math.min(i, vowels.length - 1)][0],
            rasp: (voice.rasp ?? 1) * (caps ? 1.2 : 1),
          });
        // reveal the caption proportionally through the word
        const charEnd = w.index! + Math.ceil((word.length * (i + 1)) / count);
        syllables.push({ start: t, end: t + sylDur * 0.9, charEnd });
        t += sylDur;
        n++;
      }
      t += 0.05 / voice.rate;
      if (/[,.!?]$/.test(word)) t += 0.12;
    }
    return { duration: t + 0.35, syllables };
  }
}
