document.addEventListener(‘DOMContentLoaded’, async () => {
    const video = document.getElementById(‘video’);
    const canvas = document.getElementById(‘canvas’);
    const ctx = canvas.getContext(‘2d’);
    const select = document.getElementById(‘template-select’);

    let net; // PoseNet model
    let currentTemplate = ‘none’;

    // Načtení PoseNet
    async function loadPoseNet() {
        net = await posenet.load({
            architecture: ‘MobileNetV1’,
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: 0.75
        });
        console.log(‘PoseNet loaded’);
    }

    // Přístup ke kameře
    async function setupCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert(‘Tvé zařízení nepodporuje přístup ke kameře.’);
            return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: ‘user’ } // Přední kamera
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            detectAndDraw();
        };
    }

    // Detekce póz a kreslení overlay
    async function detectAndDraw() {
        if (video.paused || video.ended || !net) return requestAnimationFrame(detectAndDraw);

        const pose = await net.estimateSinglePose(video, {
            flipHorizontal: false
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (pose.score > 0.5) {
            const leftHip = pose.keypoints.find(k => k.part === ‘leftHip’);
            const rightHip = pose.keypoints.find(k => k.part === ‘rightHip’);

            if (leftHip && rightHip && leftHip.score > 0.2 && rightHip.score > 0.2) {
                // Aproximace oblasti: mezi kyčlemi, dolů o 1/3 šířky
                const centerX = (leftHip.position.x + rightHip.position.x) / 2;
                const centerY = (leftHip.position.y + rightHip.position.y) / 2 + (Math.abs(leftHip.position.x - rightHip.position.x) / 3);
                const width = Math.abs(leftHip.position.x - rightHip.position.x) * 0.8;
                const height = width * 1.2;

                drawTemplate(ctx, currentTemplate, centerX, centerY, width, height);
            }
        }

        requestAnimationFrame(detectAndDraw);
    }

    // Funkce pro kreslení šablon (jednoduché canvas kresby)
    function drawTemplate(ctx, template, x, y, w, h) {
        ctx.fillStyle = ‘#000’; // Černá barva vlasů (lze upravit)
        ctx.strokeStyle = ‘#000’;
        ctx.lineWidth = 2;

        switch (template) {
            case ‘full’:
                // Plný obdélník s náhodnými vlasy
                ctx.fillRect(x - w/2, y - h/2, w, h);
                break;
            case ‘brazilian’:
                // Úzký proužek
                ctx.fillRect(x - w/8, y - h/2, w/4, h);
                break;
            case ‘landing-strip’:
                // Širší proužek
                ctx.fillRect(x - w/4, y - h/2, w/2, h);
                break;
            case ‘triangle’:
                // Trojúhelník
                ctx.beginPath();
                ctx.moveTo(x, y - h/2);
                ctx.lineTo(x - w/2, y + h/2);
                ctx.lineTo(x + w/2, y + h/2);
                ctx.closePath();
                ctx.fill();
                break;
            case ‘heart’:
                // Srdce
                ctx.beginPath();
                ctx.moveTo(x, y + h/4);
                ctx.bezierCurveTo(x + w/2, y - h/2, x - w/2, y - h/2, x, y + h/4);
                ctx.bezierCurveTo(x - w/2, y + h/2, x + w/2, y + h/2, x, y + h/4);
                ctx.fill();
                break;
            case ‘lightning’:
                // Blesk
                ctx.beginPath();
                ctx.moveTo(x - w/2, y - h/2);
                ctx.lineTo(x, y);
                ctx.lineTo(x - w/4, y + h/4);
                ctx.lineTo(x + w/2, y + h/2);
                ctx.lineTo(x, y + h/4);
                ctx.lineTo(x + w/4, y);
                ctx.lineTo(x - w/2, y - h/2);
                ctx.stroke();
                break;
            case ‘star’:
                // Hvězda
                const points = 5;
                const outerRadius = w/2;
                const innerRadius = outerRadius / 2;
                ctx.beginPath();
                for (let i = 0; i < points * 2; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (i * Math.PI / points) - Math.PI / 2;
                    ctx.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
                }
                ctx.closePath();
                ctx.fill();
                break;
            default:
                // Žádná
                break;
        }

        // Přidání “vlasového” efektu: náhodné čáry pro realističnost
        if (template !== ‘none’) {
            for (let i = 0; i < 50; i++) {
                const rx = x + (Math.random() - 0.5) * w;
                const ry = y + (Math.random() - 0.5) * h;
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx + (Math.random() - 0.5) * 10, ry + (Math.random() - 0.5) * 10);
                ctx.stroke();
            }
        }
    }

    // Změna šablony
    select.addEventListener(‘change’, (e) => {
        currentTemplate = e.target.value;
    });

    // Inicializace
    await loadPoseNet();
    await setupCamera();
});