/**
 * main.js — App entry point.
 *
 * Orchestrates the complete Milestone 1 flow:
 *   Camera → Scan → AI Detection → DNA Generation → Passport Reveal
 *
 * Each module (Camera, AIService, GameState, UIRenderer, AudioManager)
 * is independent and testable. This file wires them together.
 */

import { Camera } from './camera.js';
import { AIService } from './ai-service.js';
import { GameState } from './game-state.js';
import { UIRenderer } from './ui-renderer.js';
import { AudioManager } from './audio.js';
import { getFallbackDNA } from './fallback.js';
import { Immigration } from './immigration.js';
import { World } from './world.js';
import { Shop } from './shop.js';
import { VideoManager } from './video-manager.js';

class App {
  constructor() {
    this.camera = new Camera();
    this.ai = new AIService();
    this.gameState = new GameState();
    this.audio = new AudioManager();
    this.ui = null; // Initialized after audio loads
  }

  async init() {
    console.log('🎮 ENNE KOLLAND IRIKKAN PATTO? — Initializing...');

    // Load audio (non-blocking — missing files are skipped)
    await this.audio.loadSounds();

    // Initialize UI renderer (needs audio for sound triggers)
    this.ui = new UIRenderer(this.audio);
    // Video manager
    this.videoManager = new VideoManager(this.ai, this.ui);

    // Try to start camera
    // Enable camera toggle UI and bind controls
    this.ui.enableCameraToggle();
    this._bindCameraToggle();

    const cameraOk = await this.camera.start();
    this.ui.setCameraToggleState(!!cameraOk);

    if (cameraOk) {
      this.ui.enableScanButton();
      this._bindScanButton();
    } else {
      // Camera failed — switch to manual entry
      this.ui.showCameraFailed();
      setTimeout(() => {
        this.ui.showScreen('manual');
        this._bindManualEntry();
      }, 1500);
    }

    console.log('🎮 App ready. Camera:', cameraOk ? '✓' : '✗');
  }

  // ─── Scan Flow (Camera → AI → Birth) ───────────────────────────

  _bindScanButton() {
    const btn = document.getElementById('scan-btn');
    btn.addEventListener('click', () => this._onScan());
  }

  _bindCameraToggle() {
    const btn = document.getElementById('camera-toggle');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      // If camera running, stop it; otherwise start
      if (this.camera && this.camera.isReady) {
        try {
          this.camera.stop();
          this.ui.setCameraToggleState(false);
          const scanBtn = document.getElementById('scan-btn'); if (scanBtn) scanBtn.disabled = true;
        } catch (e) { console.error('[CAM TOGGLE] stop error', e); }
        return;
      }

      // Start camera
      try {
        const ok = await this.camera.start();
        this.ui.setCameraToggleState(!!ok);
        if (ok) {
          this.ui.enableScanButton();
          this._bindScanButton();
        }
      } catch (e) {
        console.error('[CAM TOGGLE] start error', e);
        this.ui.showCameraFailed();
      }
    });
  }

  async _onScan() {
    const btn = document.getElementById('scan-btn');
    btn.disabled = true;

    // 1. Capture frame
    const imageData = this.camera.capture();
    if (!imageData) {
      console.error('[SCAN] Failed to capture frame');
      btn.disabled = false;
      return;
    }

    // 2. Show scanning animation with captured image
    this.ui.showScanning(imageData);
    this.audio.play('scan');

    // 3. Call AI for birth (with timeout + fallback)
    let dna;
    try {
      dna = await this._callBirthWithTimeout(imageData, 45000);
    } catch (err) {
      console.warn('[SCAN] AI birth failed, using fallback:', err.message);
      this.ui.updateScanningText('USING BACKUP RECORDS...');
      await this._delay(800);
      dna = getFallbackDNA('');
    }

    // 4. Update scanning text
    this.ui.updateScanningText(`★ ${dna.name.toUpperCase()} IDENTIFIED ★`);
    await this._delay(600);

    // 5. Initialize game state
    this.gameState.initFromBirth(dna, imageData);

    // 5.5 Start background life script generation
    this.ai.generateLifeScript(dna)
      .then(script => {
        console.log('[APP] Pre-generated life script ready');
        this.gameState.setLifeScript(script);
      })
      .catch(err => {
        console.error('[APP] Pre-generated life script failed', err);
      });

    // 6. Stop camera (free resources)
    this.camera.stop();

    // 7. Show birth/passport reveal
    await this.ui.showBirthReveal(dna, imageData);

    // 8. Bind the "Begin Life" button (will be used in Milestone 2)
    this._bindBeginLife();
  }

  // ─── Manual Entry Flow ──────────────────────────────────────────

  _bindManualEntry() {
    const btn = document.getElementById('manual-submit');
    const input = document.getElementById('manual-input');

    const submit = async () => {
      const name = input.value.trim();
      if (!name) return;

      btn.disabled = true;

      // Show scanning animation (no image for manual entry)
      const img = document.getElementById('captured-image');
      img.style.display = 'none';
      this.ui.showScreen('scanning');
      document.getElementById('scanning-text').innerHTML =
        `GENERATING IDENTITY FOR: ${name.toUpperCase()}<span class="dots"></span>`;

      // Try AI birth from name
      let dna;
      try {
        dna = await this._callManualBirthWithTimeout(name, 45000);
      } catch (err) {
        console.warn('[MANUAL] AI birth failed, using fallback:', err.message);
        dna = getFallbackDNA(name);
      }

      // Initialize state (no image)
      this.gameState.initFromBirth(dna, null);

      // Start background life script generation
      this.ai.generateLifeScript(dna)
        .then(script => {
          console.log('[APP] Pre-generated life script ready');
          this.gameState.setLifeScript(script);
        })
        .catch(err => {
          console.error('[APP] Pre-generated life script failed', err);
        });

      // Show birth reveal
      this.ui.updateScanningText(`★ ${dna.name.toUpperCase()} IDENTIFIED ★`);
      await this._delay(600);
      await this.ui.showBirthReveal(dna, null);

      this._bindBeginLife();
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  // ─── Begin Life (Milestone 2 hook) ──────────────────────────────

  _bindBeginLife() {
    const btn = document.getElementById('btn-begin-life');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      this.audio.play('click');
      btn.disabled = true;
      btn.textContent = 'PREPARING YOUR NEW LIFE...';

      // Run immigration mini-game first (live AI answers)
      try {
        const immigration = new Immigration(this.ai, this.ui, this.gameState, this.audio);
        const allowed = await immigration.run();
        if (!allowed) {
          // Rejected — show message and reset to scan
          alert('VISA REJECTED — You are asked to leave the airport.');
          this._resetGame();
          return;
        }
        // On approval, transition to the small world for exploration
        await this._enterWorld();
      } catch (err) {
        console.error('[IMMIGRATION] Error:', err);
        // On error, allow the life to continue (fail-open)
      }

      // Start the life loop (pre-generated script continues in background)
      await this._runLifeLoop();
    });
  }

  async _runLifeLoop() {
    try {
      // Wait for background script to finish generating
      while (!this.gameState.lifeScript) {
        await this._delay(500);
      }

      // Loop: pull pre-generated encounters for chapters 1-4
      while (!this.gameState.isFinalChapter) {
        const chapterData = this.gameState.lifeScript.chapters[this.gameState.chapter - 1];
        if (!chapterData) {
          console.error('[LIFE LOOP] Missing chapter data in pre-generated script');
          break;
        }

        const encounter = {
          scene: chapterData.scene,
          choiceA: { label: chapterData.choiceA.label, emoji: chapterData.choiceA.emoji },
          choiceB: { label: chapterData.choiceB.label, emoji: chapterData.choiceB.emoji }
        };

        // 2. Show encounter & get choice
        const choice = await this.ui.showEncounter(
          encounter,
          this.gameState.chapter,
          this.gameState.totalChapters,
          this.gameState.currentState,
          this.gameState.objectDNA,
          this.gameState.objectImage
        );

        // 3. Resolve choice locally
        const result = choice === 'A' ? chapterData.choiceA : chapterData.choiceB;

        // 4. Update state
        this.gameState.applyConsequence(result);

        // 5. Show consequence overlay & wait for continue
        await this.ui.showConsequence(result, this.gameState.currentState);

        // 6. Advance to next chapter
        this.gameState.advanceChapter();
      }

      // Natural loop end — trigger death using pre-generated death scene
      await this._handleDeath(this.gameState.lifeScript.death);

    } catch (err) {
      console.error('[LIFE LOOP ERROR]', err);
      alert('Error during life simulation: ' + err.message);
      this.ui.showScreen('birth'); // fallback to passport
    }
  }

  async _handleDeath(deathData) {
    this.gameState.recordDeath(deathData.deathCause);

    // Show death screen
    await this.ui.showDeath(
      deathData,
      this.gameState.objectDNA,
      this.gameState.objectImage
    );

    // Wait for user to click "View Life Summary"
    const viewBtn = document.getElementById('btn-view-life');
    if (viewBtn) {
      await new Promise(resolve => {
        viewBtn.addEventListener('click', () => {
          this.audio.play('click');
          resolve();
        }, { once: true });
      });
    }

    // Pass eulogy string to the final state context
    this.gameState.deathData = deathData;

    // Show summary screen
    await this.ui.showLifeSummary(this.gameState.toEulogyContext());

    // User clicked "Scan Another Object" (the showLifeSummary promise resolves)
    this._resetGame();
  }

  _resetGame() {
    this.gameState.reset();
    this.ui.resetUI();
    this.ui.showScreen('scan');
    // Restart camera
    this.camera.start().then(ok => {
      if (ok) {
        this.ui.enableScanButton();
      }
    });
  }

  // ─── World / shop integration (vertical slice) ─────────────────
  async _enterWorld() {
    // Initialize world and shop modules
    this.world = new World(this.ui, this.gameState, this.audio);
    this.shop = new Shop(this.ai, this.ui, this.gameState, this.audio, this.videoManager);

    // When entering shop trigger, stop world loop and run shop interaction
    this.world.start(async () => {
      // Pause world
      this.world.stop();
      await this.shop.interact();
      // After shop returns, allow re-entering shop by re-assigning callback
      this.world.onEnterShop = async () => {
        this.world.stop();
        await this.shop.interact();
      };
      // resume world
      this.world.running = true;
      this.world.lastTime = performance.now();
      this.world._loop(this.world.lastTime);
    });
  }

  // ─── AI Call Helpers ────────────────────────────────────────────

  /**
   * Call AI birth with a timeout. Falls back on timeout.
   */
  async _callBirthWithTimeout(imageData, timeoutMs) {
    return Promise.race([
      this.ai.detectAndBirth(imageData),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI timeout')), timeoutMs)
      ),
    ]);
  }

  async _callManualBirthWithTimeout(name, timeoutMs) {
    return Promise.race([
      this.ai.birthFromName(name),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI timeout')), timeoutMs)
      ),
    ]);
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Boot ─────────────────────────────────────────────────────────

const app = new App();
app.init().catch(err => {
  console.error('💀 Fatal init error:', err);
});
