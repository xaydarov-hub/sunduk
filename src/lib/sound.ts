// Qisqa signal (yangi buyurtma, bildirishnoma). Brauzer ruxsat bermasa — jim.
export function beep(frequency = 880, durationMs = 180, volume = 0.06): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    window.setTimeout(() => ctx.close(), durationMs + 250);
  } catch { /* ovoz ruxsati yo'q */ }
}

/** Ikki ohangli, e'tiborni tortadigan signal (yangi buyurtma talonchasi). */
export function chime(): void {
  beep(660, 140, 0.08);
  window.setTimeout(() => beep(880, 220, 0.08), 170);
}
