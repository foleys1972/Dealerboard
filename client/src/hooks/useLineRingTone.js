import { useEffect, useRef } from 'react';

function isRingToneEnabled() {
  try {
    const saved = localStorage.getItem('intercom-settings');
    if (!saved) return true;
    const parsed = JSON.parse(saved);
    return parsed.lineRingTone !== false;
  } catch {
    return true;
  }
}

/**
 * Plays a classic dual-tone telephone ring (ring-ring cadence) while `active`
 * is true. Respects the user's "lineRingTone" setting (Settings → Notifications),
 * re-checked on every cadence cycle so toggling it silences an in-progress ring.
 */
export function useLineRingTone(active) {
  const ctxRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const playBurst = (ctx, startAt) => {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      // Two short rings per cadence: 400ms on, 200ms off, 400ms on
      [0, 0.6].forEach((offset) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        osc1.connect(gain);
        osc2.connect(gain);
        gain.gain.setValueAtTime(0.18, startAt + offset);
        gain.gain.setValueAtTime(0.18, startAt + offset + 0.38);
        gain.gain.linearRampToValueAtTime(0.0001, startAt + offset + 0.4);
        osc1.start(startAt + offset);
        osc2.start(startAt + offset);
        osc1.stop(startAt + offset + 0.4);
        osc2.stop(startAt + offset + 0.4);
      });
    };

    const tick = () => {
      if (!isRingToneEnabled()) return;
      try {
        if (!ctxRef.current) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          ctxRef.current = new AudioCtx();
        }
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        playBurst(ctx, ctx.currentTime);
      } catch {
        // Audio may be blocked until first user gesture; retry next cycle.
      }
    };

    tick();
    timerRef.current = setInterval(tick, 3000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active]);

  useEffect(() => () => {
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);
}

export default useLineRingTone;
