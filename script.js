let scale = 1;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };

const canvas = document.querySelector('canvas'); // Assume a canvas element is in use
const ctx = canvas.getContext('2d');

document.getElementById('zoom-in').addEventListener('click', () => {
    scale *= 1.1; // Zoom in
    draw();
});

document.getElementById('zoom-out').addEventListener('click', () => {
    scale /= 1.1; // Zoom out
    draw();
});

document.getElementById('pan-toggle').addEventListener('click', () => {
    isPanning = !isPanning; // Toggle panning mode
    document.getElementById('pan-toggle').classList.toggle('active', isPanning);
});

canvas.addEventListener('mousedown', (e) => {
    if (isPanning) {
        panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning && e.buttons === 1) {
        panOffset = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
        draw();
    }
});

function draw() {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, panOffset.x, panOffset.y);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // ...existing drawing code...
    ctx.restore();
}