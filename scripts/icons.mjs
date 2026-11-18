// Generates the app icons from one SVG design: npm run icons
// Writes the favicon SVG and the PNGs in web/static (rendered with Playwright's Chromium).
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// An open day arc around three aligned timeline bars. The mark fits inside the
// maskable safe zone (a circle of radius 204 centred on the 512px canvas).
const DEFS = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#211619"/><stop offset="1" stop-color="#080607"/></linearGradient>
<linearGradient id="frame" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="#ffb18c"/><stop offset="1" stop-color="#ff8a65"/></linearGradient>`;

/** rounded: transparent corners (favicon, manifest "any"); otherwise a full square (iOS, maskable). */
function svg(rounded) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>${DEFS}</defs>
<rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="url(#bg)"/>
<path d="M 149.934 358.066 A 150 150 0 0 1 106.091 257.235 M 151.801 144.099 A 150 150 0 0 1 362.066 358.066"
  fill="none" stroke="url(#frame)" stroke-width="30" stroke-linecap="round"/>
<circle cx="116.923" cy="195.809" r="28" fill="#ffd166"/>
<g fill="none" stroke="#f5a3c7" stroke-linecap="round" stroke-width="30">
  <path d="M 206 232 H 294"/>
  <path d="M 206 295.033 H 270"/>
  <path d="M 206 358.066 H 306"/>
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
		const page = await browser.newPage({
			viewport: { width: size, height: size }
		});
		const img = svg(rounded).replace('<svg ', `<svg width="${size}" height="${size}" `);
		await page.setContent(
			`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${img}`
		);
		await page.screenshot({ path: file, omitBackground: rounded });
		await page.close();
		console.log(`wrote ${file}`);
	}
} finally {
	await browser.close();
}
