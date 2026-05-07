import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

const MIN_POSE_SCORE = 0.35;
const MIN_HIP_SCORE = 0.2;
const DETECTION_INTERVAL_MS = 120;
const BASE_URL = import.meta.env.BASE_URL || '/';
const FUN_TEMPLATES = ['full', 'brazilian', 'landing-strip', 'triangle', 'heart', 'lightning', 'star'];

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

        this.detector = null;
        this.stream = null;
        this.currentTemplate = this.select?.value || 'none';
        this.facingMode = 'user';
        this.lastDetectionTime = 0;
        this.animationFrameId = null;
        this.chaosTimeoutId = null;
        this.isRunning = false;
        this.isChaosMode = false;

        this.templateMeta = {
            none: {
                label: 'Decent mód',
                score: 0,
                joke: 'Zatím hraješ safe. Nuda, ale bezpečná nuda.',
                status: 'Šablona vypnutá. Zatím decent mód, žádná divočina.'
            },
            full: {
                label: 'Lesní království',
                score: 8,
                joke: 'Oldschool boss mode. Tohle nepotřebuje vysvětlení, jen respekt.',
                status: 'Full mód zapnutý. Příroda se hlásí o slovo.'
            },
            brazilian: {
                label: 'Aero mód',
                score: 9,
                joke: 'Maximum aerodynamika. Větrný tunel by zatleskal.',
                status: 'Brazilian vybrán. Rychlost, elegance a lehká drzost.'
            },
            'landing-strip': {
                label: 'Runway ready',
                score: 7,
                joke: 'Minimalismus s navigací zdarma. Let může začít.',
                status: 'Landing Strip vybrán. Prosíme připoutejte se.'
            },
            triangle: {
                label: 'Geometrická odvaha',
                score: 8,
                joke: 'Trojúhelník, co má víc sebedůvěry než maturant s tahákem.',
                status: 'Triangle mód. Matika konečně našla smysl.'
            },
            heart: {
                label: 'Romantický chaos',
                score: 10,
                joke: 'Cupid approved. Trochu sladké, trochu nebezpečné.',
                status: 'Heart vybrán. Láska, drama, estetický risk.'
            },
            lightning: {
                label: 'Pojistky ven',
                score: 9,
                joke: 'Tahle energie může vyhodit jističe i sebevědomí sousedům.',
                status: 'Lightning mód. Elektrikář by brečel, ale styl máš.'
            },
            star: {
                label: 'Main character',
                score: 10,
                joke: 'Main character energy detected. Netflix už volá.',
                status: 'Star vybrán. Tady se nechodí, tady se nastupuje na scénu.'
            }
        };

        this.roastPool = [
            'Tohle už není styl, to je událost.',
            'Nebezpečně vysoká aura. Dej tomu helmu.',
            'Tohle má větší charisma než půlka Instagramu.',
            'Lehce šílené, ale přesně proto to funguje.',
            'Estetický risk, který překvapivě nepodklouzl.',
            'Tady někdo omylem odemkl premium sebevědomí.',
            'Vibe je tak silný, že by si zasloužil vlastní playlist.'
        ];
    }

    init() {
        this.setupEventListeners();
        this.updateFunPanel(this.currentTemplate);
        this.setStatus('Připraveno. Vyber šablonu, hoď random nebo rovnou zapni kameru.');
        this.syncMirrorState();
    }

    setupEventListeners() {
        this.startButton?.addEventListener('click', () => this.start());
        this.stopButton?.addEventListener('click', () => this.stop());
        this.switchButton?.addEventListener('click', () => this.switchCamera());
        this.randomButton?.addEventListener('click', () => this.pickRandomTemplate());
        this.boostButton?.addEventListener('click', () => this.boostVibe());
        this.chaosButton?.addEventListener('click', () => this.toggleChaosMode());

        this.select?.addEventListener('change', (event) => {
            this.currentTemplate = event.target.value;
            this.updateFunPanel(this.currentTemplate);
            this.setStatus(this.templateMeta[this.currentTemplate]?.status || 'Šablona vybraná.');
        });

        this.mirrorToggle?.addEventListener('change', () => this.syncMirrorState());
        window.addEventListener('resize', () => this.resizeCanvasToVideo());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop(false);
            }
        });
    }

    pickRandomTemplate() {
        const randomTemplate = FUN_TEMPLATES[Math.floor(Math.random() * FUN_TEMPLATES.length)];
        this.applyTemplate(randomTemplate);
        this.pulsePartyMode(900);
        this.setStatus(`Náhodná buchta vybrala: ${this.getSelectedTemplateText()}`);
    }

    boostVibe() {
        if (this.currentTemplate === 'none') {
            this.setStatus('Nejdřív vyber nějakou šablonu, ať je co boostit. Ani turbo nenafoukne nicotu.');
            this.pulsePartyMode(600);
            return;
        }

        const meta = this.templateMeta[this.currentTemplate] || this.templateMeta.none;
        const boostedScore = Math.min(10, meta.score + 1 + Math.floor(Math.random() * 2));
        const joke = this.roastPool[Math.floor(Math.random() * this.roastPool.length)];

        this.renderFunPanel(meta.label, boostedScore, joke);
        this.pulsePartyMode(1400);
        this.setStatus(`Vibe boostnutý na ${boostedScore}/10. Tohle už začíná být nebezpečně ikonické.`);
    }

    toggleChaosMode() {
        this.isChaosMode = !this.isChaosMode;
        document.body.classList.toggle('chaos-mode', this.isChaosMode);

        if (this.isChaosMode) {
            this.chaosButton.textContent = '🪩 Chaos ON';
            this.setStatus('Chaos mód zapnutý. Aplikace si teď myslí, že je diskokoule.');
            this.startChaosLoop();
            return;
        }

        this.chaosButton.textContent = '🪩 Chaos';
        this.setStatus('Chaos mód vypnutý. Zase se tváříme jako slušná aplikace.');
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
        if (this.chaosTimeoutId) {
            window.clearInterval(this.chaosTimeoutId);
            this.chaosTimeoutId = null;
        }
    }

    applyTemplate(template, announce = true) {
        this.currentTemplate = template;
        if (this.select) {
            this.select.value = template;
        }
        this.updateFunPanel(template);

        if (announce) {
            this.setStatus(this.templateMeta[template]?.status || 'Šablona vybraná.');
        }
    }

    updateFunPanel(template) {
        const meta = this.templateMeta[template] || this.templateMeta.none;
        this.renderFunPanel(meta.label, meta.score, meta.joke);
    }

    renderFunPanel(label, score, joke) {
        if (this.templateLabel) this.templateLabel.textContent = label;
        if (this.vibeEl) this.vibeEl.textContent = `Vibe ${score}/10`;
        if (this.vibeFill) this.vibeFill.style.width = `${score * 10}%`;
        if (this.jokeEl) this.jokeEl.textContent = joke;
    }

    getSelectedTemplateText() {
        return this.select?.options[this.select.selectedIndex]?.text || 'neznámá šablona';
    }

    pulsePartyMode(duration = 1000) {
        document.body.classList.add('party-mode');
        window.setTimeout(() => {
            if (!this.isChaosMode) {
                document.body.classList.remove('party-mode');
            }
        }, duration);
    }

    async start() {
        if (this.isRunning) return;

        try {
            this.setControlsDisabled(true);
            this.showLoading('Načítám AR model…');
            await this.loadDetector();

            this.showLoading('Spouštím kameru…');
            await this.setupCamera();

            this.hideLoading();
            this.isRunning = true;
            this.emptyState?.classList.add('hidden');
            this.stopButton.disabled = false;
            this.switchButton.disabled = false;
            this.startButton.disabled = true;
            this.setStatus('Kamera běží. Postav se tak, aby byly vidět boky. Appka se bude tvářit, že je profesionál.');
            this.detectAndDraw();
        } catch (error) {
            console.error('Start error:', error);
            this.stop(false);
            this.showError(error.message || 'Nepodařilo se spustit kameru.');
        } finally {
            this.hideLoading();
            this.setControlsDisabled(false);
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.emptyState?.classList.remove('hidden');
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.switchButton.disabled = true;

        if (updateStatus) {
            this.setStatus('Kamera zastavená. Soukromí v cajku, ostuda nikam neodešla.');
        }
    }

    async switchCamera() {
        if (!this.isRunning) return;

        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        this.setStatus('Přepínám kameru… malý technický break, žádná panika.');
        this.stop(false);
        await this.start();
    }

    setControlsDisabled(disabled) {
        if (this.startButton && !this.isRunning) this.startButton.disabled = disabled;
        if (this.switchButton) this.switchButton.disabled = disabled || !this.isRunning;
        if (this.select) this.select.disabled = disabled;
    }

    syncMirrorState() {
        const shouldMirror = Boolean(this.mirrorToggle?.checked);
        this.videoContainer?.classList.toggle('mirrored', shouldMirror);
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
        if (this.statusEl) {
            this.statusEl.textContent = message;
        }
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
            console.warn('WebGL backend unavailable, falling back to TensorFlow default backend.', error);
            await tf.ready();
        }

        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true
        };

        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            detectorConfig
        );
    }

    async setupCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Tvoje zařízení nepodporuje přístup ke kameře.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: this.facingMode },
                width: { ideal: 960 },
                height: { ideal: 1280 }
            }
        });

        this.stream = stream;
        this.video.srcObject = stream;

        await new Promise((resolve, reject) => {
            this.video.onloadedmetadata = resolve;
            this.video.onerror = reject;
        });

        await this.video.play();
        this.resizeCanvasToVideo();
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
            } else if (this.currentTemplate !== 'none') {
                this.setStatus('Nevidím dobře postavu. Zkus odstoupit nebo přidat světlo. AI si vzala brýle z Lidlu.');
            }
        } catch (error) {
            console.error('Pose detection error:', error);
            this.setStatus('Detekce se zasekla. Zkus kameru zastavit a znovu spustit.');
        }

        await tf.nextFrame();
        this.animationFrameId = requestAnimationFrame(() => this.detectAndDraw());
    }

    drawPoseOverlay(pose) {
        if (this.currentTemplate === 'none') return;

        const leftHip = pose.keypoints.find((keypoint) => keypoint.name === 'left_hip');
        const rightHip = pose.keypoints.find((keypoint) => keypoint.name === 'right_hip');

        if (!leftHip || !rightHip || leftHip.score < MIN_HIP_SCORE || rightHip.score < MIN_HIP_SCORE) {
            this.setStatus('Šablonu nemám kam přesně položit. Potřebuju lépe vidět boky, nejsem věštkyně.');
            return;
        }

        const hipDistance = Math.abs(leftHip.x - rightHip.x);
        const centerX = (leftHip.x + rightHip.x) / 2;
        const centerY = (leftHip.y + rightHip.y) / 2 + hipDistance * 0.35;
        const width = Math.max(hipDistance * 0.78, 32);
        const height = width * 1.12;

        this.drawTemplate(centerX, centerY, width, height);
    }

    drawTemplate(x, y, width, height) {
        const hue = this.getTemplateHue();

        this.ctx.save();
        this.ctx.fillStyle = `hsla(${hue}, 88%, 42%, 0.92)`;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        this.ctx.lineWidth = Math.max(width * 0.025, 1.5);
        this.ctx.shadowColor = `hsla(${hue}, 90%, 55%, 0.55)`;
        this.ctx.shadowBlur = this.isChaosMode ? 26 : 12;
        this.ctx.shadowOffsetY = 4;

        this.createTemplatePath(x, y, width, height);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.clip();
        this.drawHairTexture(x, y, width, height);
        this.ctx.restore();
    }

    getTemplateHue() {
        const hueMap = {
            full: 265,
            brazilian: 326,
            'landing-strip': 194,
            triangle: 156,
            heart: 345,
            lightning: 42,
            star: 280
        };

        return hueMap[this.currentTemplate] || 222;
    }

    createTemplatePath(x, y, width, height) {
        const halfW = width / 2;
        const halfH = height / 2;

        this.ctx.beginPath();

        switch (this.currentTemplate) {
            case 'full':
                this.roundedRect(x - halfW, y - halfH, width, height, width * 0.18);
                break;
            case 'brazilian':
                this.roundedRect(x - width / 10, y - halfH, width / 5, height, width * 0.08);
                break;
            case 'landing-strip':
                this.roundedRect(x - width / 5, y - halfH, width / 2.5, height, width * 0.08);
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
                this.ctx.moveTo(x - width * 0.25, y - halfH);
                this.ctx.lineTo(x + width * 0.08, y - height * 0.08);
                this.ctx.lineTo(x - width * 0.06, y - height * 0.08);
                this.ctx.lineTo(x + width * 0.24, y + halfH);
                this.ctx.lineTo(x - width * 0.13, y + height * 0.1);
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

            if (index === 0) {
                this.ctx.moveTo(px, py);
            } else {
                this.ctx.lineTo(px, py);
            }
        }
        this.ctx.closePath();
    }

    drawHairTexture(x, y, width, height) {
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        this.ctx.lineWidth = Math.max(width * 0.01, 1);

        for (let index = 0; index < 42; index += 1) {
            const rx = x + (this.seededRandom(index, 1) - 0.5) * width * 0.9;
            const ry = y + (this.seededRandom(index, 2) - 0.5) * height * 0.9;
            const length = 4 + this.seededRandom(index, 3) * 10;
            const angle = this.seededRandom(index, 4) * Math.PI;

            this.ctx.beginPath();
            this.ctx.moveTo(rx, ry);
            this.ctx.lineTo(rx + Math.cos(angle) * length, ry + Math.sin(angle) * length);
            this.ctx.stroke();
        }
    }

    seededRandom(index, salt) {
        const value = Math.sin(index * 12.9898 + salt * 78.233 + this.currentTemplate.length * 37.719) * 43758.5453;
        return value - Math.floor(value);
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
