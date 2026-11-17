// Generates the app icons from one SVG design: npm run icons
// Writes the favicon SVG and the PNGs in web/static (rendered with Playwright's Chromium).
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const FROM = '#191112';
const TO = '#000000';
const INK = '#ff8a65';
const LIGHT = '#f5a3c7';

// A coral day ring, open at the top like a clock face that hasn't come round yet, with a tick
// inside, on a 512×512 canvas. Everything stays inside the maskable safe zone (a circle of
// radius 204 around the centre).
const RING = 'M 256 106 A 150 150 0 1 1 150 150';
const TICK = 'M 190 262 L 238 310 L 330 210';

const DEFS = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/></linearGradient>`;

/** rounded: transparent corners (favicon, manifest "any"); otherwise a full square (iOS, maskable). */
function svg(rounded) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>${DEFS}</defs>
<rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="url(#bg)"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="${RING}" stroke="${INK}" stroke-width="40"/>
  <circle cx="203" cy="117" r="20" fill="${LIGHT}" stroke="none"/>
  <path d="${TICK}" stroke="${LIGHT}" stroke-width="44"/>
</g>
</svg>
`;
}

const outputs = [
	{ file: 'web/static/icon-192.png', size: 192, rounded: true },
	{ file: 'web/static/icon-512.png', size: 512, rounded: true },
	{ file: 'web/static/icon-maskable-512.png', size: 512, rounded: false },
	{ file: 'web/static/apple-touch-icon.png', size: 180, rounded: false }
];

writeFileSync('web/src/lib/assets/favicon.svg', svg(true));

const browser = await chromium.launch();
try {
	for (const { file, size, rounded } of outputs) {
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		const img = svg(rounded).replace('<svg ', `<svg width="${size}" height="${size}" `);
		await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${img}`);
		await page.screenshot({ path: file, omitBackground: rounded });
		await page.close();
		console.log(`wrote ${file}`);
	}
} finally {
	await browser.close();
}
