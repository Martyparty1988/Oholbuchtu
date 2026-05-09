import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

const MIN_POSE_SCORE = 0.35;
const MIN_HIP_SCORE = 0.2;
const DETECTION_INTERVAL_MS = 120;
const BASE_URL = import.meta.env.BASE_URL || '/';
const FUN_TEMPLATES = ['full', 'brazilian', 'landing-strip', 'triangle', 'heart', 'lightning', 'star'];
const DEFAULT_STENCIL = { scale: 1, offsetX: 0, offsetY: 0, opacity: 0.82 };

class PubicARApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.select = document.getElementById('template-select');
        this.loadingEl = document.getElementById('loading');
        this.statusEl = document.getElementById('status');
        this.emptyState = document.getElementById('empty-state');
        this.videoContainer = document.getElementById('video-container');
        this.startButton = document.getElementById('start-camera');
        this.stopButton = document.getElementById('stop-camera');
        this.switchButton = document.getElementById('switch-camera');
        this.randomButton = document.getElementById('random-template');
        this.boostButton = document.getElementById('boost-vibe');
        this.chaosButton = document.getElementById('chaos-mode');
        this.mirrorToggle = document.getElementById('mirror-toggle');
        this.templateLabel = document.getElementById('template-label');
        this.vibeEl = document.getElementById('template-vibe');
        this.vibeFill = document.getElementById('vibe-fill');
        this.jokeEl = document.getElementById('template-joke');
        this.shapeCards = [...document.querySelectorAll('[data-template]')];
        this.adjustButtons = [...document.querySelectorAll('[data-adjust]')];

        this.detector = null;
        this.stream = null;
        this.currentTemplate = this.select?.value || 'none';
        this.facingMode = 'user';
        this.lastDetectionTime = 0;
        this.animationFrameId = null;
        this.chaosTimeoutId = null;
        this.isRunning = false;
        this.isChaosMode = false;
        this.lastStencilAnchor = null;
        this.stencil = { ...DEFAULT_STENCIL };

        this.templateMeta = {
            none: { label: 'Bez šablony', score: 0, joke: 'Vyber tvar dole. Uvidíš obrys přímo v kameře.', status: 'Bez šablony. Vyber konkrétní tvar.' },
            full: { label: 'Full', score: 8, joke: 'Plná šablona. Přilož obrys, zarovnej a máš vodítko.', status: 'Full šablona zapnutá. Zarovnej obrys na sebe.' },
            brazilian: { label: 'Brazilian', score: 9, joke: 'Úzký středový tvar. Hodí se pro přesné vedení.', status: 'Brazilian šablona. Použij +/− a šipky pro doladění.' },
            'landing-strip': { label: 'Landing Strip', score: 7, joke: 'Rovný pruh jako jasné vodítko na holení.', status: 'Landing Strip zapnutý. Drž se obrysu.' },
            triangle: { label: 'Triangle', score: 8, joke: 'Trojúhelník s čistou hranou pro snadné zarovnání.', status: 'Triangle šablona. Zarovnej špičku a hrany.' },
            heart: { label: 'Heart', score: 10, joke: 'Srdce. Trochu sranda, trochu challenge.', status: 'Heart šablona. Bude chtít přesnější ruku.' },
            lightning: { label: 'Lightning', score: 9, joke: 'Blesk je výrazný tvar. Hlavně nespěchat.', status: 'Lightning šablona. Řiď se světlým obrysem.' },
            star: { label: 'Star', score: 10, joke: 'Hvězda jako party stencil. Neber to moc vážně.', status: 'Star šablona. Pro odvážné a pevnou ruku.' }
        };

        this.roastPool = [
            'Obrys zvýrazněný. Teď už je to skoro technický výkres.',
            'Šablona svítí jak runway. Stačí zarovnat a jet podle hran.',
            'Vodítko je připravené. Ruka pevná, ego ještě pevnější.',
            'Zvýrazněno. Tohle už nepřehlédne ani ospalé zrcadlo.',
            'Obrys má stage presence. Teď jen nepodlehnout chaosu.'
        ];
    }

    init() {
        this.setupEventListeners();
        this.updateFunPanel(this.currentTemplate);
        this.updateShapeCards();
        this.updateCameraButton();
        this.syncMirrorState();
        this.setStatus('Vyber viditelnou šablonu dole. Pak ji můžeš posunout a zvětšit.');
    }

    setupEventListeners() {
        this.startButton?.addEventListener('click', () => this.start());
        this.stopButton?.addEventListener('click', () => this.stop());
        this.switchButton?.addEventListener('click', () => this.switchCamera());
        this.randomButton?.addEventListener('click', () => this.pickRandomTemplate());
        this.boostButton?.addEventListener('click', () => this.boostVibe());
        this.chaosButton?.addEventListener('click', () => this.toggleChaosMode());
        this.shapeCards.forEach((button) => button.addEventListener('click', () => this.applyTemplate(button.dataset.template)));
        this.adjustButtons.forEach((button) => button.addEventListener('click', () => this.adjustStencil(button.dataset.adjust)));
        this.select?.addEventListener('change', (event) => this.applyTemplate(event.target.value));
        this.mirrorToggle?.addEventListener('change', () => this.syncMirrorState());
        window.addEventListener('resize', () => this.resizeCanvasToVideo());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.stop(false);
        });
    }

    pickRandomTemplate() {
        const randomTemplate = FUN_TEMPLATES[Math.floor(Math.random() * FUN_TEMPLATES.length)];
        this.applyTemplate(randomTemplate);
        this.pulsePartyMode(900);
        this.setStatus(`Random vybral: ${this.templateMeta[randomTemplate]?.label}.`);
    }

    boostVibe() {
        if (this.currentTemplate === 'none') {
            this.setStatus('Nejdřív vyber tvar šablony. Bez tvaru není co zvýraznit.');
            this.pulsePartyMode(600);
            return;
        }

        this.stencil.opacity = this.stencil.opacity >= 0.96 ? 0.74 : Math.min(1, this.stencil.opacity + 0.14);
        const meta = this.templateMeta[this.currentTemplate] || this.templateMeta.none;
        const boostedScore = Math.min(10, meta.score + 1);
        const joke = this.roastPool[Math.floor(Math.random() * this.roastPool.length)];
        this.renderFunPanel(meta.label, boostedScore, joke);
        this.drawLastStencil();
        this.pulsePartyMode(1000);
        this.setStatus(`Obrys zvýrazněný. Krytí ${Math.round(this.stencil.opacity * 100)} %.`);
    }

    toggleChaosMode() {
        this.isChaosMode = !this.isChaosMode;
        document.body.classList.toggle('chaos-mode', this.isChaosMode);

        if (this.isChaosMode) {
            this.chaosButton.textContent = '🪩 ON';
            this.setStatus('Chaos ON. Šablony se budou měnit samy.');
            this.startChaosLoop();
            return;
        }

        this.chaosButton.textContent = '🪩 Chaos';
        this.setStatus('Chaos OFF. Zůstává aktuální šablona.');
        this.stopChaosLoop();
    }

    startChaosLoop() {
        this.stopChaosLoop();
        this.chaosTimeoutId = window.setInterval(() => {
            if (!this.isChaosMode) return;
            this.applyTemplate(FUN_TEMPLATES[Math.floor(Math.random() * FUN_TEMPLATES.length)], false);
            this.pulsePartyMode(420);
        }, 1800);
    }

    stopChaosLoop() {
        if (!this.chaosTimeoutId) return;
        window.clearInterval(this.chaosTimeoutId);
        this.chaosTimeoutId = null;
    }

    applyTemplate(template, announce = true) {
        this.currentTemplate = template;
        if (this.select) this.select.value = template;
        this.updateFunPanel(template);
        this.updateShapeCards();
        this.drawLastStencil();
        if (announce) this.setStatus(this.templateMeta[template]?.status || 'Šablona vybraná.');
    }

    adjustStencil(action) {
        const steps = {
            up: () => { this.stencil.offsetY -= 12; },
            down: () => { this.stencil.offsetY += 12; },
            bigger: () => { this.stencil.scale = Math.min(1.8, this.stencil.scale + 0.08); },
            smaller: () => { this.stencil.scale = Math.max(0.45, this.stencil.scale - 0.08); },
            reset: () => { this.stencil = { ...DEFAULT_STENCIL }; }
        };

        steps[action]?.();
        this.drawLastStencil();
        this.setStatus(`Doladění: velikost ${Math.round(this.stencil.scale * 100)} %, posun Y ${this.stencil.offsetY}px.`);
    }

    updateShapeCards() {
        this.shapeCards.forEach((button) => {
            button.classList.toggle('active', button.dataset.template === this.currentTemplate);
        });
    }

    updateFunPanel(template) {
        const meta = this.templateMeta[template] || this.templateMeta.none;
        this.renderFunPanel(meta.label, meta.score, meta.joke);
    }

    renderFunPanel(label, score, joke) {
        if (this.templateLabel) this.templateLabel.textContent = label;
        if (this.vibeEl) this.vibeEl.textContent = `Vodítko ${score}/10`;
        if (this.vibeFill) this.vibeFill.style.width = `${score * 10}%`;
        if (this.jokeEl) this.jokeEl.textContent = joke;
    }

    pulsePartyMode(duration = 1000) {
        document.body.classList.add('party-mode');
        window.setTimeout(() => {
            if (!this.isChaosMode) document.body.classList.remove('party-mode');
        }, duration);
    }

    async start() {
        if (this.isRunning) return;

        try {
            this.setControlsDisabled(true);
            this.showLoading('Načítám AR model…');
            await this.loadDetector();
            this.showLoading(`Spouštím ${this.facingMode === 'user' ? 'selfie' : 'zadní'} kameru…`);
            await this.setupCamera();

            this.hideLoading();
            this.isRunning = true;
            this.emptyState?.classList.add('hidden');
            this.startButton.disabled = true;
            this.stopButton.disabled = false;
            this.switchButton.disabled = false;
            this.updateCameraButton();
            this.setStatus(`Kamera běží. Šablonu můžeš posouvat šipkami a měnit +/−.`);
            this.detectAndDraw();
        } catch (error) {
            console.error('Start error:', error);
            this.stop(false);
            this.showError(error.message || 'Nepodařilo se spustit kameru.');
        } finally {
            this.hideLoading();
            this.setControlsDisabled(false);
            this.updateCameraButton();
        }
    }

    stop(updateStatus = true) {
        this.isRunning = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }

        this.video.srcObject = null;
        this.lastStencilAnchor = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.emptyState?.classList.remove('hidden');
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.switchButton.disabled = false;
        this.updateCameraButton();

        if (updateStatus) this.setStatus('Kamera zastavená. Šablona zůstává vybraná.');
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        this.updateCameraButton();
        this.syncMirrorState();

        if (!this.isRunning) {
            this.setStatus(`Vybraná kamera: ${this.facingMode === 'user' ? 'selfie' : 'zadní'}. Dej Start.`);
            return;
        }

        this.setStatus(`Přepínám na ${this.facingMode === 'user' ? 'selfie' : 'zadní'} kameru…`);
        this.stop(false);
        await this.start();
    }

    updateCameraButton() {
        if (!this.switchButton) return;
        const nextCameraLabel = this.facingMode === 'user' ? 'Zadní kamera' : 'Selfie kamera';
        this.switchButton.textContent = nextCameraLabel;
        this.switchButton.title = `Přepnout na ${nextCameraLabel.toLowerCase()}`;
        this.switchButton.setAttribute('aria-label', `Přepnout na ${nextCameraLabel.toLowerCase()}`);
        this.switchButton.classList.toggle('active-camera', this.facingMode === 'environment');
    }

    setControlsDisabled(disabled) {
        if (this.startButton && !this.isRunning) this.startButton.disabled = disabled;
        if (this.switchButton) this.switchButton.disabled = disabled;
        if (this.select) this.select.disabled = disabled;
    }

    syncMirrorState() {
        const shouldMirror = this.facingMode === 'user' && Boolean(this.mirrorToggle?.checked);
        this.videoContainer?.classList.toggle('mirrored', shouldMirror);
        if (this.mirrorToggle) {
            this.mirrorToggle.disabled = this.facingMode !== 'user';
            this.mirrorToggle.closest('.toggle')?.classList.toggle('muted', this.facingMode !== 'user');
        }
    }

    showLoading(message) {
        if (!this.loadingEl) return;
        this.loadingEl.textContent = message;
        this.loadingEl.classList.remove('hidden');
        this.loadingEl.setAttribute('aria-hidden', 'false');
    }

    hideLoading() {
        if (!this.loadingEl) return;
        this.loadingEl.classList.add('hidden');
        this.loadingEl.setAttribute('aria-hidden', 'true');
    }

    setStatus(message) {
        if (this.statusEl) this.statusEl.textContent = message;
    }

    showError(message) {
        this.setStatus(message);
    }

    async loadDetector() {
        if (this.detector) return;

        try {
            await tf.setBackend('webgl');
            await tf.ready();
        } catch (error) {
            console.warn('WebGL backend unavailable, falling back to default backend.', error);
            await tf.ready();
        }

        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                enableSmoothing: true
            }
        );
    }

    async setupCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Tvoje zařízení nepodporuje přístup ke kameře.');
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(this.getCameraConstraints(true));
        } catch (exactError) {
            console.warn('Exact camera mode failed, trying ideal mode.', exactError);
            stream = await navigator.mediaDevices.getUserMedia(this.getCameraConstraints(false));
        }

        this.stream = stream;
        const actualFacingMode = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
        if (actualFacingMode === 'user' || actualFacingMode === 'environment') {
            this.facingMode = actualFacingMode;
        }

        this.video.srcObject = stream;
        await new Promise((resolve, reject) => {
            this.video.onloadedmetadata = resolve;
            this.video.onerror = reject;
        });
        await this.video.play();
        this.updateCameraButton();
        this.syncMirrorState();
        this.resizeCanvasToVideo();
    }

    getCameraConstraints(useExactFacingMode) {
        return {
            audio: false,
            video: {
                facingMode: useExactFacingMode ? { exact: this.facingMode } : { ideal: this.facingMode },
                width: { ideal: 960 },
                height: { ideal: 1280 }
            }
        };
    }

    resizeCanvasToVideo() {
        const width = this.video.videoWidth;
        const height = this.video.videoHeight;
        if (!width || !height) return;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }

    async detectAndDraw() {
        if (!this.isRunning) return;

        const now = performance.now();
        if (now - this.lastDetectionTime < DETECTION_INTERVAL_MS) {
            this.animationFrameId = requestAnimationFrame(() => this.detectAndDraw());
            return;
        }
        this.lastDetectionTime = now;

        if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !this.detector) {
            this.animationFrameId = requestAnimationFrame(() => this.detectAndDraw());
            return;
        }

        try {
            this.resizeCanvasToVideo();
            const poses = await this.detector.estimatePoses(this.video, { maxPoses: 1, flipHorizontal: false });
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            const pose = poses[0];
            if (pose?.score > MIN_POSE_SCORE) {
                this.drawPoseOverlay(pose);
            } else {
                this.drawFallbackStencil();
                if (this.currentTemplate !== 'none') this.setStatus('Nevidím boky. Zobrazuju šablonu doprostřed ručně.');
            }
        } catch (error) {
            console.error('Pose detection error:', error);
            this.drawFallbackStencil();
            this.setStatus('Detekce se zasekla. Šablona je aspoň ručně uprostřed.');
        }

        await tf.nextFrame();
        this.animationFrameId = requestAnimationFrame(() => this.detectAndDraw());
    }

    drawPoseOverlay(pose) {
        if (this.currentTemplate === 'none') return;

        const leftHip = pose.keypoints.find((keypoint) => keypoint.name === 'left_hip');
        const rightHip = pose.keypoints.find((keypoint) => keypoint.name === 'right_hip');
        if (!leftHip || !rightHip || leftHip.score < MIN_HIP_SCORE || rightHip.score < MIN_HIP_SCORE) {
            this.drawFallbackStencil();
            return;
        }

        const hipDistance = Math.abs(leftHip.x - rightHip.x);
        const anchor = {
            x: (leftHip.x + rightHip.x) / 2,
            y: (leftHip.y + rightHip.y) / 2 + hipDistance * 0.35,
            width: Math.max(hipDistance * 0.82, 44)
        };
        this.lastStencilAnchor = anchor;
        this.drawStencil(anchor);
    }

    drawFallbackStencil() {
        if (this.currentTemplate === 'none' || !this.canvas.width || !this.canvas.height) return;
        const anchor = this.lastStencilAnchor || {
            x: this.canvas.width / 2,
            y: this.canvas.height * 0.62,
            width: Math.min(this.canvas.width * 0.34, 180)
        };
        this.drawStencil(anchor);
    }

    drawLastStencil() {
        if (!this.ctx || !this.canvas.width || !this.canvas.height) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawFallbackStencil();
    }

    drawStencil(anchor) {
        if (this.currentTemplate === 'none') return;

        const width = anchor.width * this.stencil.scale;
        const height = width * 1.12;
        const x = anchor.x + this.stencil.offsetX;
        const y = anchor.y + this.stencil.offsetY;
        const hue = this.getTemplateHue();

        this.ctx.save();
        this.ctx.globalAlpha = this.stencil.opacity;
        this.ctx.fillStyle = `hsla(${hue}, 88%, 48%, 0.3)`;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
        this.ctx.lineWidth = Math.max(width * 0.038, 3);
        this.ctx.setLineDash([12, 8]);
        this.ctx.shadowColor = `hsla(${hue}, 92%, 58%, 0.75)`;
        this.ctx.shadowBlur = this.isChaosMode ? 28 : 18;
        this.createTemplatePath(x, y, width, height);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.globalAlpha = Math.min(1, this.stencil.opacity + 0.1);
        this.drawCenterGuide(x, y, width, height);
        this.ctx.restore();
    }

    drawCenterGuide(x, y, width, height) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        this.ctx.lineWidth = Math.max(width * 0.012, 1.2);
        this.ctx.setLineDash([5, 7]);
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - height * 0.62);
        this.ctx.lineTo(x, y + height * 0.62);
        this.ctx.stroke();
        this.ctx.restore();
    }

    getTemplateHue() {
        return {
            full: 265,
            brazilian: 326,
            'landing-strip': 194,
            triangle: 156,
            heart: 345,
            lightning: 42,
            star: 280
        }[this.currentTemplate] || 222;
    }

    createTemplatePath(x, y, width, height) {
        const halfW = width / 2;
        const halfH = height / 2;
        this.ctx.beginPath();

        switch (this.currentTemplate) {
            case 'full':
                this.roundedRect(x - halfW, y - halfH, width, height, width * 0.2);
                break;
            case 'brazilian':
                this.roundedRect(x - width / 9, y - halfH, width / 4.5, height, width * 0.08);
                break;
            case 'landing-strip':
                this.roundedRect(x - width / 4.5, y - halfH, width / 2.25, height, width * 0.08);
                break;
            case 'triangle':
                this.ctx.moveTo(x, y - halfH);
                this.ctx.lineTo(x - halfW, y + halfH);
                this.ctx.lineTo(x + halfW, y + halfH);
                this.ctx.closePath();
                break;
            case 'heart':
                this.drawHeartPath(x, y, width, height);
                break;
            case 'lightning':
                this.ctx.moveTo(x - width * 0.18, y - halfH);
                this.ctx.lineTo(x + width * 0.08, y - height * 0.09);
                this.ctx.lineTo(x - width * 0.07, y - height * 0.09);
                this.ctx.lineTo(x + width * 0.22, y + halfH);
                this.ctx.lineTo(x - width * 0.15, y + height * 0.1);
                this.ctx.lineTo(x + width * 0.04, y + height * 0.1);
                this.ctx.closePath();
                break;
            case 'star':
                this.drawStarPath(x, y, width * 0.46, width * 0.2);
                break;
            default:
                break;
        }
    }

    roundedRect(x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        this.ctx.moveTo(x + safeRadius, y);
        this.ctx.lineTo(x + width - safeRadius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        this.ctx.lineTo(x + width, y + height - safeRadius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        this.ctx.lineTo(x + safeRadius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        this.ctx.lineTo(x, y + safeRadius);
        this.ctx.quadraticCurveTo(x, y, x + safeRadius, y);
        this.ctx.closePath();
    }

    drawHeartPath(x, y, width, height) {
        const top = y - height * 0.25;
        this.ctx.moveTo(x, y + height * 0.42);
        this.ctx.bezierCurveTo(x - width * 0.62, y + height * 0.04, x - width * 0.48, top, x, y - height * 0.03);
        this.ctx.bezierCurveTo(x + width * 0.48, top, x + width * 0.62, y + height * 0.04, x, y + height * 0.42);
        this.ctx.closePath();
    }

    drawStarPath(x, y, outerRadius, innerRadius) {
        for (let index = 0; index < 10; index += 1) {
            const radius = index % 2 === 0 ? outerRadius : innerRadius;
            const angle = (index * Math.PI / 5) - Math.PI / 2;
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            if (index === 0) this.ctx.moveTo(px, py);
            else this.ctx.lineTo(px, py);
        }
        this.ctx.closePath();
    }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${BASE_URL}sw.js`)
            .catch((error) => console.warn('Service Worker registration failed:', error));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new PubicARApp();
    app.init();
});
