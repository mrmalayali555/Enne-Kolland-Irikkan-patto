/**
 * camera.js — Webcam access, live preview, and frame capture.
 *
 * Handles the entire camera lifecycle:
 * - Request permission
 * - Display live feed
 * - Capture a single frame as base64 JPEG
 * - Graceful failure if camera is unavailable
 */

export class Camera {
  constructor() {
    this.videoEl = document.getElementById('camera-feed');
    this.canvasEl = document.getElementById('capture-canvas');
    this.stream = null;
    this.isReady = false;
  }

  /**
   * Start the webcam stream and display in the video element.
   * @returns {Promise<boolean>} true if camera started, false if unavailable
   */
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer rear camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      this.videoEl.srcObject = this.stream;

      // Wait for video to actually start playing
      await new Promise((resolve, reject) => {
        this.videoEl.onloadedmetadata = () => {
          this.videoEl.play().then(resolve).catch(reject);
        };
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Camera timeout')), 5000);
      });

      this.isReady = true;
      console.log('[CAMERA] Started:', this.videoEl.videoWidth, 'x', this.videoEl.videoHeight);

      // Clear any camera hint text if present
      try {
        const hint = document.getElementById('camera-hint');
        if (hint) {
          hint.textContent = 'Hold an object in front of the camera and press SCAN';
          hint.style.color = '';
        }
      } catch {}
      return true;

    } catch (err) {
      console.warn('[CAMERA] Failed to start:', err.message);
      this.isReady = false;
      try {
        const hint = document.getElementById('camera-hint');
        if (hint) {
          hint.textContent = `Camera error: ${err.message} — check browser permissions or use a secure (localhost) connection.`;
          hint.style.color = '#e74c3c';
        }
      } catch {}
      return false;
    }
  }

  /**
   * Capture the current frame as a base64 JPEG string.
   * @returns {string|null} Base64 data URI or null if camera isn't ready
   */
  capture() {
    if (!this.isReady || !this.videoEl.videoWidth) {
      console.warn('[CAMERA] Not ready for capture');
      return null;
    }

    const ctx = this.canvasEl.getContext('2d');
    this.canvasEl.width = this.videoEl.videoWidth;
    this.canvasEl.height = this.videoEl.videoHeight;

    // Draw the current video frame (mirrored to match display)
    ctx.save();
    ctx.translate(this.canvasEl.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.videoEl, 0, 0);
    ctx.restore();

    // Convert to JPEG at 85% quality (good balance of size vs quality)
    const dataUrl = this.canvasEl.toDataURL('image/jpeg', 0.85);
    console.log('[CAMERA] Frame captured, size:', Math.round(dataUrl.length / 1024), 'KB');
    return dataUrl;
  }

  /**
   * Stop the webcam stream and release resources.
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isReady = false;
    console.log('[CAMERA] Stopped');
  }
}
