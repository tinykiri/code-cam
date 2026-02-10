class CodeCam {
  constructor() {
    this.video = document.getElementById('webcam');
    this.canvas = document.getElementById('shader-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.loadingState = document.getElementById('loading-state');
    this.startBtn = document.getElementById('start-camera');
    this.captureBtn = document.getElementById('capture-btn');
    this.flash = document.getElementById('flash');
    this.styleBtns = document.querySelectorAll('.style-btn');
    this.timerBtns = document.querySelectorAll('.timer-btn');
    this.countdownOverlay = document.getElementById('countdown');
    this.countdownNumber = this.countdownOverlay.querySelector('.countdown-number');
    this.credit = document.getElementById('credit');


    this.currentStyle = 'binary';
    this.isRunning = false;
    this.animationId = null;
    this.timerDelay = 0;
    this.isCountingDown = false;

    this.charWidth = 7;
    this.charHeight = 10;

    this.tempCanvas = document.createElement('canvas');
    this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });

    this.colorCache = {};

    this.frameTime = 0;

    this.chars = {
      binary: ['0', '1'],
      regex: [
        '/\\d+/', '/\\w+/', '/.*?/', '/[a-z]/', '/\\s*/',
        '/^$/', '/\\b/', '/[0-9]/', '/\\S+/', '/[A-Z]/',
        '/.+/', '/\\D/', '/\\W/', '/[^a]/', '/a|b/'
      ],
      source: [
        'if', 'else', 'const', 'let', 'var', 'function',
        'return', 'for', 'while', '=>', '{}', '[]', '()',
        '===', '!==', '&&', '||', '++', '--', '+=',
        'class', 'new', 'this', 'async', 'await', 'try',
        'catch', 'throw', 'import', 'export', 'void',
        'int', 'char', 'bool', 'float', 'double', 'nullptr'
      ]
    };

    this.colors = {
      binary: '#a6e22e',
      regex: '#f92672',
      source: '#66d9ef'
    };

    this.precomputeColors();

    this.init();
  }

  precomputeColors() {
    const allColors = [
      ...Object.values(this.colors),
      '#a6e22e', '#f92672', '#e6db74', '#ae81ff'
    ];

    allColors.forEach(hex => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      for (let a = 1; a <= 20; a++) {
        const alpha = a / 20;
        const key = `${hex}_${a}`;
        this.colorCache[key] = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
      }
    });
  }

  getCachedColor(hex, alpha) {
    const alphaStep = Math.max(1, Math.min(20, Math.round(alpha * 20)));
    return this.colorCache[`${hex}_${alphaStep}`] || this.hexToRgba(hex, alpha);
  }

  init() {
    this.startBtn.addEventListener('click', () => this.startCamera());
    this.captureBtn.addEventListener('click', () => this.handleCapture());

    this.styleBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchStyle(btn.dataset.style));
    });

    this.timerBtns.forEach(btn => {
      btn.addEventListener('click', () => this.setTimer(parseInt(btn.dataset.timer, 10)));
    });

    window.addEventListener('resize', () => {
      if (this.isRunning) {
        this.setupCanvas();
      }
    });
  }

  setTimer(seconds) {
    this.timerDelay = seconds;

    this.timerBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.timer, 10) === seconds);
    });
  }

  async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      this.video.srcObject = stream;

      this.video.onloadedmetadata = () => {
        this.video.play();
        this.setupCanvas();
        this.loadingState.classList.add('hidden');
        this.credit.classList.remove('hidden');
        this.isRunning = true;
        this.render();
      };

    } catch (err) {
      console.error('Camera access denied:', err);
      this.showError('Camera access denied. Please allow camera permissions.');
    }
  }

  setupCanvas() {
    const aspectRatio = this.video.videoWidth / this.video.videoHeight;
    const maxWidth = (window.innerWidth * 0.9 - 20) / 2;
    const maxHeight = window.innerHeight - 140;

    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    this.cols = Math.floor(width / this.charWidth);
    this.rows = Math.floor(height / this.charHeight);

    this.tempCanvas.width = this.cols;
    this.tempCanvas.height = this.rows;
  }

  switchStyle(style) {
    this.currentStyle = style;

    this.styleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === style);
    });
  }

  render() {
    if (!this.isRunning) return;

    this.frameTime = Date.now();

    this.ctx.fillStyle = '#0d0d0d';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.tempCtx.setTransform(1, 0, 0, 1, 0, 0);

    this.tempCtx.translate(this.tempCanvas.width, 0);
    this.tempCtx.scale(-1, 1);
    this.tempCtx.drawImage(this.video, 0, 0, this.cols, this.rows);

    const imageData = this.tempCtx.getImageData(0, 0, this.cols, this.rows);
    const pixels = imageData.data;

    this.ctx.shadowBlur = 0;

    switch (this.currentStyle) {
      case 'binary':
        this.renderBinary(pixels);
        break;
      case 'regex':
        this.renderRegex(pixels);
        break;
      case 'source':
        this.renderSource(pixels);
        break;
    }

    this.animationId = requestAnimationFrame(() => this.render());
  }

  getBrightness(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  renderBinary(pixels) {
    const chars = this.chars.binary;
    const baseColor = this.colors.binary;
    const timeOffset = Math.floor(this.frameTime / 100);

    this.ctx.font = `${this.charHeight}px 'JetBrains Mono', monospace`;
    this.ctx.textBaseline = 'top';

    let lastAlphaStep = -1;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = (y * this.cols + x) * 4;
        const brightness = this.getBrightness(pixels[i], pixels[i + 1], pixels[i + 2]);

        if (brightness > 0.05) {
          const charIndex = (x + y + timeOffset) % 2;
          const char = chars[charIndex];

          const alpha = Math.min(1, brightness * 1.5);
          const alphaStep = Math.max(1, Math.min(20, Math.round(alpha * 20)));

          if (alphaStep !== lastAlphaStep) {
            this.ctx.fillStyle = this.getCachedColor(baseColor, alpha);
            lastAlphaStep = alphaStep;
          }

          this.ctx.fillText(char, x * this.charWidth, y * this.charHeight);
        }
      }
    }
  }

  renderRegex(pixels) {
    const patterns = this.chars.regex;
    const baseColor = this.colors.regex;
    const timeOffset = Math.floor(this.frameTime / 200);

    this.ctx.font = `${this.charHeight}px 'JetBrains Mono', monospace`;
    this.ctx.textBaseline = 'top';

    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        const i = (y * this.cols + x) * 4;
        const brightness = this.getBrightness(pixels[i], pixels[i + 1], pixels[i + 2]);

        if (brightness > 0.08) {
          const patternIndex = (x * 7 + y * 13 + timeOffset) % patterns.length;
          const pattern = patterns[patternIndex];

          const alpha = Math.min(1, brightness * 1.3);
          this.ctx.fillStyle = this.getCachedColor(baseColor, alpha);
          this.ctx.fillText(pattern, x * this.charWidth, y * this.charHeight);

          x += Math.ceil(pattern.length * 0.6);
        } else {
          x++;
        }
      }
    }
  }

  renderSource(pixels) {
    const snippets = this.chars.source;
    const baseColor = this.colors.source;
    const secondaryColors = ['#a6e22e', '#f92672', '#e6db74', '#ae81ff'];
    const timeOffset = Math.floor(this.frameTime / 500);

    this.ctx.font = `${this.charHeight}px 'JetBrains Mono', monospace`;
    this.ctx.textBaseline = 'top';

    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        const i = (y * this.cols + x) * 4;
        const brightness = this.getBrightness(pixels[i], pixels[i + 1], pixels[i + 2]);

        if (brightness > 0.1) {
          const snippetIndex = (x * 7 + y * 13 + timeOffset) % snippets.length;
          const snippet = snippets[snippetIndex];

          const alpha = Math.min(1, brightness * 1.4);

          const colorIndex = snippetIndex % secondaryColors.length;
          const color = brightness > 0.5 ? baseColor : secondaryColors[colorIndex];

          this.ctx.fillStyle = this.getCachedColor(color, alpha);
          this.ctx.fillText(snippet, x * this.charWidth, y * this.charHeight);

          x += Math.ceil(snippet.length * 0.5);
        } else {
          x++;
        }
      }
    }
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  handleCapture() {
    if (this.isCountingDown) return;

    if (this.timerDelay === 0) {
      this.captureImage();
    } else {
      this.startCountdown(this.timerDelay);
    }
  }

  startCountdown(seconds) {
    this.isCountingDown = true;
    this.countdownOverlay.classList.remove('hidden');

    let remaining = seconds;

    const tick = () => {
      if (remaining > 0) {
        this.countdownNumber.textContent = remaining;
        this.countdownNumber.style.animation = 'none';
        void this.countdownNumber.offsetWidth;
        this.countdownNumber.style.animation = 'countdown-pulse 1s ease-in-out';

        remaining--;
        setTimeout(tick, 1000);
      } else {
        this.countdownOverlay.classList.add('hidden');
        this.isCountingDown = false;
        this.captureImage();
      }
    };

    tick();
  }

  captureImage() {
    this.flash.classList.add('active');
    setTimeout(() => this.flash.classList.remove('active'), 300);

    const link = document.getElementById('download-link');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `codecam-${this.currentStyle}-${timestamp}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  showError(message) {
    const prompt = this.loadingState.querySelector('.terminal-prompt');
    prompt.innerHTML = `
      <span class="prompt-symbol" style="color: #f92672;">!</span>
      <span class="prompt-text" style="color: #f92672;">${message}</span>
    `;
    this.startBtn.textContent = 'Try Again';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CodeCam();
});
