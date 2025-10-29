import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';

class PubicARApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.select = document.getElementById('template-select');
        this.loadingEl = document.getElementById('loading');

        this.detector = null;
        this.currentTemplate = 'none';
        this.lastDetectionTime = 0;
        this.detectionInterval = 200; // 200ms interval for CPU optimization
        this.isRunning = false;
    }

    async init() {
        try {
            this.showLoading('Načítám model...');
            await this.loadDetector();

            this.showLoading('Spouštím kameru...');
            await this.setupCamera();

            this.hideLoading();
            this.setupEventListeners();
            this.startDetection();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Nepodařilo se spustit aplikaci. Zkontroluj konzoli pro více informací.');
        }
    }

    showLoading(message) {
        if (this.loadingEl) {
            this.loadingEl.textContent = message;
            this.loadingEl.classList.remove('hidden');
        }
    }

    hideLoading() {
        if (this.loadingEl) {
            this.loadingEl.classList.add('hidden');
        }
    }

    showError(message) {
        this.hideLoading();
        alert(message);
    }

    async loadDetector() {
        try {
            const detectorConfig = {
                modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
            };
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                detectorConfig
            );
            console.log('MoveNet model loaded successfully');
        } catch (error) {
            console.error('Error loading pose detection model:', error);
            throw new Error('Nepodařilo se načíst model pro detekci póz');
        }
    }

    async setupCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Tvé zařízení nepodporuje přístup ke kameře');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });

            this.video.srcObject = stream;

            return new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.video.play()
                        .then(() => {
                            this.canvas.width = this.video.videoWidth;
                            this.canvas.height = this.video.videoHeight;
                            resolve();
                        })
                        .catch(reject);
                };
                this.video.onerror = reject;
            });
        } catch (error) {
            console.error('Camera access error:', error);
            throw new Error('Nepodařilo se získat přístup ke kameře. Povol prosím přístup.');
        }
    }

    setupEventListeners() {
        this.select.addEventListener('change', (e) => {
            this.currentTemplate = e.target.value;
        });
    }

    startDetection() {
        this.isRunning = true;
        this.detectAndDraw();
    }

    stopDetection() {
        this.isRunning = false;
    }

    async detectAndDraw() {
        if (!this.isRunning) return;

        const now = Date.now();
        if (now - this.lastDetectionTime < this.detectionInterval) {
            requestAnimationFrame(() => this.detectAndDraw());
            return;
        }
        this.lastDetectionTime = now;

        if (this.video.paused || this.video.ended || !this.detector) {
            requestAnimationFrame(() => this.detectAndDraw());
            return;
        }

        try {
            const poses = await this.detector.estimatePoses(this.video);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (poses.length > 0 && poses[0].score > 0.5) {
                this.drawPoseOverlay(poses[0]);
            }
        } catch (error) {
            console.error('Pose detection error:', error);
        }

        await tf.nextFrame();
        requestAnimationFrame(() => this.detectAndDraw());
    }

    drawPoseOverlay(pose) {
        const leftHip = pose.keypoints.find(k => k.name === 'left_hip');
        const rightHip = pose.keypoints.find(k => k.name === 'right_hip');

        if (leftHip && rightHip && leftHip.score > 0.2 && rightHip.score > 0.2) {
            const centerX = (leftHip.x + rightHip.x) / 2;
            const centerY = (leftHip.y + rightHip.y) / 2 + (Math.abs(leftHip.x - rightHip.x) / 3);
            const width = Math.abs(leftHip.x - rightHip.x) * 0.8;
            const height = width * 1.2;

            this.drawTemplate(centerX, centerY, width, height);
        }
    }

    drawTemplate(x, y, w, h) {
        this.ctx.fillStyle = '#000';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;

        switch (this.currentTemplate) {
            case 'full':
                this.ctx.fillRect(x - w / 2, y - h / 2, w, h);
                break;

            case 'brazilian':
                this.ctx.fillRect(x - w / 8, y - h / 2, w / 4, h);
                break;

            case 'landing-strip':
                this.ctx.fillRect(x - w / 4, y - h / 2, w / 2, h);
                break;

            case 'triangle':
                this.ctx.beginPath();
                this.ctx.moveTo(x, y - h / 2);
                this.ctx.lineTo(x - w / 2, y + h / 2);
                this.ctx.lineTo(x + w / 2, y + h / 2);
                this.ctx.closePath();
                this.ctx.fill();
                break;

            case 'heart':
                this.ctx.beginPath();
                this.ctx.moveTo(x, y + h / 4);
                this.ctx.bezierCurveTo(x + w / 2, y - h / 2, x - w / 2, y - h / 2, x, y + h / 4);
                this.ctx.bezierCurveTo(x - w / 2, y + h / 2, x + w / 2, y + h / 2, x, y + h / 4);
                this.ctx.fill();
                break;

            case 'lightning':
                this.ctx.beginPath();
                this.ctx.moveTo(x - w / 2, y - h / 2);
                this.ctx.lineTo(x, y);
                this.ctx.lineTo(x - w / 4, y + h / 4);
                this.ctx.lineTo(x + w / 2, y + h / 2);
                this.ctx.lineTo(x, y + h / 4);
                this.ctx.lineTo(x + w / 4, y);
                this.ctx.closePath();
                this.ctx.fill();
                break;

            case 'star':
                const points = 5;
                const outerRadius = w / 2;
                const innerRadius = outerRadius / 2;
                this.ctx.beginPath();
                for (let i = 0; i < points * 2; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (i * Math.PI / points) - Math.PI / 2;
                    const px = x + radius * Math.cos(angle);
                    const py = y + radius * Math.sin(angle);
                    if (i === 0) {
                        this.ctx.moveTo(px, py);
                    } else {
                        this.ctx.lineTo(px, py);
                    }
                }
                this.ctx.closePath();
                this.ctx.fill();
                break;

            default:
                return;
        }

        // Add hair texture
        if (this.currentTemplate !== 'none') {
            this.drawHairTexture(x, y, w, h);
        }
    }

    drawHairTexture(x, y, w, h) {
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.lineWidth = 1;

        for (let i = 0; i < 50; i++) {
            const rx = x + (Math.random() - 0.5) * w;
            const ry = y + (Math.random() - 0.5) * h;
            this.ctx.beginPath();
            this.ctx.moveTo(rx, ry);
            this.ctx.lineTo(rx + (Math.random() - 0.5) * 10, ry + (Math.random() - 0.5) * 10);
            this.ctx.stroke();
        }
    }
}

// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new PubicARApp();
    app.init();
});
