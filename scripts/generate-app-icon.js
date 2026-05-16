'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

const rootDir = path.resolve(__dirname, '..');
const assetDir = path.join(rootDir, 'assets');
const outputPngPath = path.join(assetDir, 'app-icon.png');
const outputIcoPath = path.join(assetDir, 'app-icon.ico');
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

async function renderSvgToPng() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 1024px;
        height: 1024px;
        background: transparent;
        overflow: hidden;
      }
    </style>
  </head>
  <body></body>
</html>`;

  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const dataUrl = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1024;
          canvas.height = 1024;
          const ctx = canvas.getContext('2d');
          const size = 1024;
          const centerX = size / 2;
          const centerY = 488;
          const discRadius = 368;

          const drawPolygon = (points, fillStyle) => {
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let index = 1; index < points.length; index += 1) {
              ctx.lineTo(points[index][0], points[index][1]);
            }
            ctx.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill();
          };

          const drawTriangle = (points, fillStyle) => {
            ctx.save();
            ctx.lineJoin = 'round';
            drawPolygon(points, fillStyle);
            ctx.restore();
          };

          ctx.clearRect(0, 0, size, size);

          ctx.save();
          ctx.shadowColor = 'rgba(5, 16, 33, 0.28)';
          ctx.shadowBlur = 36;
          ctx.shadowOffsetY = 24;
          ctx.beginPath();
          ctx.arc(centerX, centerY, discRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#102844';
          ctx.fill();
          ctx.restore();

          const discGradient = ctx.createLinearGradient(196, 164, 828, 870);
          discGradient.addColorStop(0, '#163A63');
          discGradient.addColorStop(0.56, '#0D2643');
          discGradient.addColorStop(1, '#091728');
          ctx.beginPath();
          ctx.arc(centerX, centerY, discRadius, 0, Math.PI * 2);
          ctx.fillStyle = discGradient;
          ctx.fill();

          const orangeGlow = ctx.createRadialGradient(782, 206, 0, 782, 206, 286);
          orangeGlow.addColorStop(0, 'rgba(242,147,24,0.54)');
          orangeGlow.addColorStop(1, 'rgba(242,147,24,0)');
          ctx.beginPath();
          ctx.arc(centerX, centerY, discRadius, 0, Math.PI * 2);
          ctx.fillStyle = orangeGlow;
          ctx.fill();

          const blueGlow = ctx.createRadialGradient(210, 822, 0, 210, 822, 352);
          blueGlow.addColorStop(0, 'rgba(103,178,255,0.34)');
          blueGlow.addColorStop(1, 'rgba(103,178,255,0)');
          ctx.beginPath();
          ctx.arc(centerX, centerY, discRadius, 0, Math.PI * 2);
          ctx.fillStyle = blueGlow;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(centerX, centerY, 340, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.025)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.stroke();

          ctx.lineCap = 'round';
          ctx.lineWidth = 48;

          const blueArcGradient = ctx.createLinearGradient(240, 770, 776, 324);
          blueArcGradient.addColorStop(0, '#80C0FF');
          blueArcGradient.addColorStop(1, '#2C6EB7');
          ctx.strokeStyle = blueArcGradient;
          ctx.beginPath();
          ctx.arc(centerX + 10, centerY + 8, 332, Math.PI * 0.36, Math.PI * 1.74, true);
          ctx.stroke();

          drawTriangle([
            [685, 243],
            [770, 184],
            [758, 287]
          ], '#2C6EB7');

          const orangeArcGradient = ctx.createLinearGradient(736, 240, 366, 688);
          orangeArcGradient.addColorStop(0, '#FFC062');
          orangeArcGradient.addColorStop(1, '#F29318');
          ctx.strokeStyle = orangeArcGradient;
          ctx.beginPath();
          ctx.arc(centerX + 10, centerY + 8, 332, Math.PI * 0.04, Math.PI * 1.12, false);
          ctx.stroke();

          drawTriangle([
            [258, 828],
            [344, 772],
            [331, 875]
          ], '#F29318');

          ctx.save();
          ctx.translate(318, 330);
          ctx.scale(1.94, 1.94);
          ctx.globalAlpha = 0.22;
          ctx.translate(16, 18);
          drawPolygon([
            [28.32, 25.61], [73.05, 25.45], [120.18, 83.88], [123.33, 123.9], [205.56, 225.85], [164.02, 225.85], [101.93, 148.86], [97.26, 110.95]
          ], '#08121F');
          drawPolygon([
            [138.3, 106.35], [207.54, 25.61], [129.98, 25.61], [129.94, 45.74], [152.48, 45.74]
          ], '#08121F');
          drawPolygon([
            [0, 225.78], [35.95, 225.78], [94.19, 157.88], [76.3, 135.7]
          ], '#08121F');
          drawPolygon([
            [108.22, 25.61], [129.98, 25.61], [129.94, 45.74], [108.22, 45.74]
          ], '#08121F');
          ctx.restore();

          ctx.save();
          ctx.translate(302, 296);
          ctx.scale(1.94, 1.94);
          drawPolygon([
            [28.32, 25.61], [73.05, 25.45], [120.18, 83.88], [123.33, 123.9], [205.56, 225.85], [164.02, 225.85], [101.93, 148.86], [97.26, 110.95]
          ], '#F29318');
          drawPolygon([
            [138.3, 106.35], [207.54, 25.61], [129.98, 25.61], [129.94, 45.74], [152.48, 45.74]
          ], '#2C6EB7');
          drawPolygon([
            [0, 225.78], [35.95, 225.78], [94.19, 157.88], [76.3, 135.7]
          ], '#76B6FF');
          drawPolygon([
            [108.22, 25.61], [129.98, 25.61], [129.94, 45.74], [108.22, 45.74]
          ], '#EEF4FB');
          ctx.restore();

          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      });
    `);

    const pngBuffer = Buffer.from(dataUrl.replace(/^data:image\\/png;base64,/, ''), 'base64');
    await fs.writeFile(outputPngPath, pngBuffer);
  } finally {
    window.destroy();
  }
}

function createIcoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const base = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.buffer.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.buffer.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.buffer)]);
}

async function generate() {
  await renderSvgToPng();

  const source = nativeImage.createFromPath(outputPngPath);
  if (source.isEmpty()) {
    throw new Error(`无法从 ${outputPngPath} 加载已渲染的 PNG 图标`);
  }

  const icoBuffers = iconSizes.map((size) => ({
    size,
    buffer: source.resize({
      width: size,
      height: size,
      quality: 'best'
    }).toPNG()
  }));

  await fs.writeFile(outputIcoPath, createIcoFromPngs(icoBuffers));
}

app.whenReady()
  .then(generate)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
