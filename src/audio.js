/**
 * audio.js — Sound effect loader and player.
 *
 * Manages audio playback for game events.
 * Gracefully handles missing files (plays nothing instead of crashing).
 *
 * The user will provide 2 signature MP3s which should be placed in public/sounds/.
 * Additional SFX can be added as needed.
 */

export class AudioManager {
  constructor() {
    this.sounds = {};
    this.isLoaded = false;
    this.isMuted = false;
  }

  /**
   * Preload all sound effects.
   * Sounds are loaded from /sounds/ directory.
   * Missing files are silently skipped.
   */
  async loadSounds() {
    const soundMap = {
      // Signature project sounds (user will provide these MP3s)
      signature1: '/sounds/signature1.mp3',
      signature2: '/sounds/signature2.mp3',

      // UI sounds (we'll add these later with free SFX)
      stamp: '/sounds/stamp.mp3',
      scan: '/sounds/scan.mp3',
      reveal: '/sounds/reveal.mp3',
      click: '/sounds/click.mp3',
      death: '/sounds/death.mp3',
      // Project-provided assets (preferred location)
      v: '/assets/audio/v.mp3',
      chath: '/assets/audio/chath.mp3',
      // life-summary tune (project root fallback)
      lst: '/lst.mp3',
    };

    const loadPromises = Object.entries(soundMap).map(async ([name, path]) => {
      try {
        const audio = new Audio(path);
        // Try to load — if file doesn't exist, this will fail silently
        await new Promise((resolve, reject) => {
          audio.addEventListener('canplaythrough', resolve, { once: true });
          audio.addEventListener('error', reject, { once: true });
          audio.load();
        });
        this.sounds[name] = audio;
      } catch {
        // File doesn't exist yet — that's fine, we'll skip it
        console.log(`[AUDIO] Skipped (not found): ${name}`);
      }
    });

    await Promise.allSettled(loadPromises);
    this.isLoaded = true;

    const loaded = Object.keys(this.sounds);
    console.log(`[AUDIO] Loaded ${loaded.length} sounds:`, loaded);
  }

  /**
   * Play the supplied intro voice 'v' if loaded.
   */
  playIntroVoice() {
    if (this.isMuted) return null;
    const a = this.sounds.v;
    if (!a) return null;
    const clone = a.cloneNode();
    clone.play().catch(() => {});
    return clone;
  }

  /**
   * Play the chath death sound exactly once per invocation.
   * Prevents duplicate replay during repeated renders.
   */
  playDeathSound() {
    if (this.isMuted) return;
    if (this._deathPlaying) return; // already playing
    const a = this.sounds.chath || this.sounds.death;
    if (!a) return;
    this._deathPlaying = true;
    const clone = a.cloneNode();
    clone.addEventListener('ended', () => { this._deathPlaying = false; });
    clone.play().catch(() => { this._deathPlaying = false; });
  }

  /**
   * Reset death-play flag (call when starting a new life/game)
   */
  resetDeathFlag() {
    this._deathPlaying = false;
  }

  /**
   * Play a sound effect by name.
   * @param {string} name - Sound name (e.g., 'stamp', 'signature1')
   * @param {number} volume - Volume 0-1 (default 0.7)
   */
  play(name, volume = 0.7) {
    if (this.isMuted) return;

    const sound = this.sounds[name];
    if (!sound) return; // Sound not loaded, skip silently

    // Clone for overlapping plays
    const clone = sound.cloneNode();
    clone.volume = Math.max(0, Math.min(1, volume));
    clone.play().catch(() => {
      // Autoplay blocked — ignore
    });
  }

  /** Toggle mute */
  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }
}
