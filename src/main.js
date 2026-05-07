import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

const MIN_POSE_SCORE = 0.35;
const MIN_HIP_SCORE = 0.2;
const DETECTION_INTERVAL_MS = 120;
const BASE_URL = import.meta.env.BASE_URL || '/';

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
        this.mirrorToggle = document.getElementById('mirror-toggle');

        this.detector = null;
        this.stream = null;
        this.currentTemplate = this.select?.value || 'none';
        this.facingMode = 'user';
        this.lastDetectionTime = 0;
        this.animationFrameId = null;
        this.isRunning = false;
    }

    init() {
        this.setupEventListeners();
        this.setStatus('Připraveno. Kamera se spustí až po tvém klepnutí.');
        this.syncMirrorState();
    }

    setupEventListeners() {
        this.startButton?.addEventListener('click', () => this.start());
        this.stopButton?.addEventListener('click', () => this.stop());
        this.switchButton?.addEventListener('click', () => this.switchCamera());

        this.select?.addEventListener('change', (event) => {
            this.currentTemplate = event.target.value;
            this.setStatus(this.currentTemplate === 'none'
                ? 'Šablona vypnutá. Kamera může běžet dál bez překryvu.'
                : `Vybraná šablona: ${event.target.options[event.target.selectedIndex].text}`);
        });

        this.mirrorToggle?.addEventListener('change', () => this.syncMirrorState());
        window.addEventListener('resize', () => this.resizeCanvasToVideo());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop(false);
            }
        });
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
            this.setStatus('Kamera běží. Postav se tak, aby byly vidět boky.');
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
            this.setStatus('Kamera zastavená. Soukromí v cajku.');
        }
    }

    async switchCamera() {
        if (!this.isRunning) return;

        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        this.setStatus('Přepínám kameru…');
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
                this.setStatus('Nevidím dobře postavu. Zkus odstoupit nebo přidat světlo.');
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
            this.setStatus('Šablonu nemám kam přesně položit. Potřebuju lépe vidět boky.');
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
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = Math.max(width * 0.025, 1.5);
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        this.ctx.shadowBlur = 12;
        this.ctx.shadowOffsetY = 4;

        this.createTemplatePath(x, y, width, height);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.clip();
        this.drawHairTexture(x, y, width, height);
        this.ctx.restore();
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
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
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
