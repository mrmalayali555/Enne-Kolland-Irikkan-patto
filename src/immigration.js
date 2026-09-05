/**
 * immigration.js — Mini-game for airport immigration.
 *
 * Presents short officer prompts (4 questions), supports quick choices
 * and typed answers. Typed answers are sent to the server via
 * AIService. Returns a Promise that resolves to true (approved)
 * or false (rejected).
 */

export class Immigration {
  constructor(ai, ui, gameState, audio) {
    this.ai = ai;
    this.ui = ui;
    this.gameState = gameState;
    this.audio = audio;
    this.container = document.getElementById('screen-immigration');
    this.promptEl = document.getElementById('imm-officer-prompt');
    this.quickChoicesEl = document.getElementById('imm-quick-choices');
    this.inputEl = document.getElementById('imm-input');
    this.submitBtn = document.getElementById('imm-submit');
    this.faceEl = document.getElementById('imm-officer-face');
    this.speechEl = document.getElementById('imm-officer-speech');
    this.langSelect = document.getElementById('imm-lang-select');
    this.replyEl = document.getElementById('imm-reply');
    this.appealsLeft = 1;
    // Expand to 6 short Qs so player must answer multiple times (5-8 as requested)
    this.questions = [
      // Show passport thumbnail
      this._renderPassportPreview();

      // Collect answers for all questions (require completing sequence)
      const answers = [];
      for (let i = 0; i < this.questions.length; i++) {
        const q = this.questions[i];
        // set scenario based on question (fun visual)
        this._setScenarioForQuestion(q);
        const decision = await this._askQuestion(q, i + 1);

        // Retrieve last persisted answer (saved by _persistAnswer)
        const cur = JSON.parse(localStorage.getItem('imm_answers_v1') || '[]');
        const last = cur.length ? cur[cur.length - 1] : null;
        const answerText = last ? (last.text || '') : '';
        const replyText = this.speechEl ? this.speechEl.textContent : this.replyEl.textContent;

        answers.push({ question: q, answer: answerText, reply: replyText, decision });

        // brief pacing before next question
        await new Promise(r => setTimeout(r, 700));
      }

      // After all Qs, ask server for a final aggregated decision
      this._showReply('Officer finalizing...');
      try {
        const res = await this.ai.immigrationQuery({ dna: this.gameState.objectDNA, answers, final: true });
        if (res && res.decision === 'approve') return true;
        return false;
      } catch (err) {
        console.error('[IMMIGRATION] final decision error', err);
        return true; // fail-open
      }
            // After all Qs, ask server for a final aggregated decision
            this._showReply('Officer finalizing...');
            try {
              const res = await this.ai.immigrationQuery({ dna: this.gameState.objectDNA, answers, final: true });
              if (res && res.decision === 'approve') return true;
              return false;
            } catch (err) {
              console.error('[IMMIGRATION] final decision error', err);
              return true; // fail-open
            }
    this.replyEl.textContent = '';
    this.inputEl.value = '';
    this.quickChoicesEl.innerHTML = '';
    // ensure language selector has a default
    if (this.langSelect && !this.langSelect.value) this.langSelect.value = 'manglish';

    // Populate a few quick answers
    const quicks = this._suggestedAnswersFor(question);
    quicks.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'btn-quick';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        // optimistic UI: show quick answer, animate officer talking, and keep UI active
        this.inputEl.value = text;
        this._animateTalking(true);
        this._showReply(`${text} `);
        this._onAnswer(text);
      });
      this.quickChoicesEl.appendChild(btn);
    });

    // Special interactive challenges if officer asks for proof
    if (/Prove you are NOT/i.test(question) || /Prove you are NOT a human/i.test(question)) {
      // add playful challenge buttons
      const challenges = [
        'Cluck like a hen 🐔',
        'Show passport',
        'Tell a Manglish joke',
        'Make a weird noise'
      ];
      challenges.forEach(ch => {
        const b = document.createElement('button');
        b.className = 'btn-quick';
        b.textContent = ch;
        b.addEventListener('click', () => {
          this.inputEl.value = ch;
          this._animateTalking(true);
          this._showReply(`${ch}`);
          this._onAnswer(ch);
        });
        this.quickChoicesEl.appendChild(b);
      });
    }

    const answerPromise = new Promise((resolve) => {
      const onSubmit = async () => {
        const text = this.inputEl.value.trim();
        if (!text) return;
        // non-blocking: show thinking indicator but keep input usable
        const prev = this.replyEl.textContent;
        this._showReply('Officer is thinking...');
        this._animateTalking(true);

        // include selected language in payload
        const lang = this.langSelect ? this.langSelect.value : 'manglish';
        const decision = await this._sendToAI(question, text, lang).catch(err => {
          console.error(err);
          return 'ask_more';
        });

        // persist answer locally for introduction/session restore
        try { this._persistAnswer({ question, text, lang, decision }); } catch {}

        // stop talking animation (AI reply already displayed by _sendToAI)
        this._animateTalking(false);
        resolve(decision);
      };

      this.submitBtn.addEventListener('click', onSubmit, { once: true });
      this.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSubmit(); }, { once: false });

      // quick choice resolution will call resolve directly via _onAnswer
      this._resolveAnswer = resolve;
    });

    return answerPromise;
  }

  _onAnswer(text) {
    // user clicked quick answer — send to AI and resolve
    const q = this.promptEl ? this.promptEl.textContent : '';
    const lang = this.langSelect ? this.langSelect.value : 'manglish';
    this._sendToAI(q, text, lang).then(decision => {
      try { this._persistAnswer({ question: q, text, lang, decision }); } catch (e) { /* ignore */ }
      if (this._resolveAnswer) this._resolveAnswer(decision);
    }).catch(err => {
      console.error('[IMMIGRATION] quick answer error', err);
      try { this._persistAnswer({ question: q, text, lang, decision: 'ask_more' }); } catch (e) {}
      if (this._resolveAnswer) this._resolveAnswer('ask_more');
    });
  }

  _suggestedAnswersFor(question) {
    // Use Manglish-flavored quick answers
    if (/enter/i.test(question) || /enter here/i.test(question) || /Why you enter/i.test(question)) {
      return ['Holiday aanu', 'Work aanu bro', 'Owner visit aanu', 'Ketta mistake ayi'];
    }
    if (/Who is your owner/i.test(question) || /Who owns/i.test(question)) {
      return ['Appu aanu', 'Owner: Ammachi', 'Njan oru product, no owner', 'Family item'];
    }
    if (/What do you do|occupation|work/i.test(question)) {
      return ['For sale', 'Edible aanu', 'Personal item', 'Tool — help cheyyum'];
    }
    if (/NOT a human|NOT a human|Prove you are NOT/i.test(question)) {
      return ['Njan breath illa, fruit aanu', 'Metal aanu, bones illa', 'Njan innu party-il undayirunnu', 'Ithoru prop aanu'];
    }
    return ['I am harmless', 'I prefer not to answer'];
  }

  async _sendToAI(question, answer, lang = 'manglish') {
    // show a polite thinking message (non-blocking)
    this._showReply('Officer is thinking...');
    const payload = { dna: this.gameState.objectDNA, question, answer, lang };

    // timeout wrapper — fail-open after 8s but keep UI responsive
    const timeoutMs = 8000;
    const timer = new Promise((resolve) => setTimeout(() => resolve({ _timedOut: true }), timeoutMs));

    try {
      const res = await Promise.race([this.ai.immigrationQuery(payload), timer]);
      if (res && res._timedOut) {
        this._showReply('Officer is taking a looong time... try Manglish or pick a quick option.');
        this._animateTalking(false);
        this._setFace('doubt');
        return 'ask_more';
      }
      if (!res) {
        this._animateTalking(false);
        this._setFace('doubt');
        return 'ask_more';
      }
      if (res.reply) {
        this._showReply(res.reply);
        this.speechEl.textContent = res.reply;
      }
      if (res.decision) {
        // set face based on decision
        if (res.decision === 'approve') this._setFace('happy');
        else if (res.decision === 'reject') this._setFace('stare');
        else this._setFace('doubt');
        this._animateTalking(false);
        return res.decision;
      }
      this._animateTalking(false);
      this._setFace('doubt');
      return 'ask_more';
    } catch (err) {
      console.error('[IMMIGRATION] AI error', err);
      this._showReply('System is busy. Officer waves you through.');
      this._animateTalking(false);
      this._setFace('happy');
      return 'approve'; // fail-open
    }
  }

  _setFace(kind) {
    if (!this.faceEl) return;
    if (kind === 'happy') this.faceEl.src = '/happy.png';
    else if (kind === 'doubt') this.faceEl.src = '/doubt.png';
    else this.faceEl.src = '/stare.png';
  }

  _animateTalking(on = true) {
    if (!this.container) return;
    const el = this.container.querySelector('.imm-officer-visual');
    if (!el) return;
    if (on) el.classList.add('talking'); else el.classList.remove('talking');
  }

  _setScenarioForQuestion(question) {
    // Add a small scene class to the immigration screen for flavor
    const root = document.getElementById('screen-immigration');
    root.classList.remove('scenario-stare', 'scenario-happy', 'scenario-doubt');
    if (/Prove you are NOT/i.test(question)) root.classList.add('scenario-doubt');
    else if (/Why you enter/i.test(question)) root.classList.add('scenario-stare');
    else root.classList.add('scenario-happy');
  }

  _persistAnswer(entry) {
    const key = 'imm_answers_v1';
    const cur = JSON.parse(localStorage.getItem(key) || '[]');
    cur.push(Object.assign({ ts: Date.now() }, entry));
    localStorage.setItem(key, JSON.stringify(cur.slice(-50))); // keep last 50
  }

  _showReply(text) {
    this.replyEl.textContent = text;
  }

  _showScreen() {
    // Use ui's showScreen if available
    if (this.ui && typeof this.ui.showScreen === 'function') {
      this.ui.showScreen('immigration');
    } else {
      // otherwise toggle directly
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      this.container.classList.add('active');
    }
  }
}
