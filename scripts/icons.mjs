// Generates the app icons from one SVG design: npm run icons
// Writes the favicon SVG and the PNGs in web/static (rendered with Playwright's Chromium).
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

// A sun rising over three timeline bars on a dusk sky, centered on both axes
// (x 136–376, y 101–411). Maskable icons keep the mark inside the central 80% safe circle.
const DEFS = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffa27f"/><stop offset="1" stop-color="#b64b7a"/></linearGradient>`;

/** rounded: transparent corners (favicon, manifest "any"); otherwise a full square (iOS, maskable). */
function svg(rounded, maskable = false) {
	const scale = maskable ? 0.9 : 1;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>${DEFS}</defs>
<rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="url(#bg)"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
<path d="M 136 221 A 120 120 0 0 1 376 221 Z" fill="#ffd166"/>
<rect x="136" y="251" width="240" height="40" rx="20" fill="#ff8a65"/>
<rect x="136" y="311" width="164" height="40" rx="20" fill="#f5a3c7"/>
<rect x="136" y="371" width="204" height="40" rx="20" fill="#f1e8dc"/>
</g>
</svg>
`;
}

// New artwork gets new URLs, including the icon Safari saves during installation.
const hash = createHash('sha256')
	.update(svg(false) + svg(false, true))
	.digest('hex')
	.slice(0, 12);
const directory = 'web/static/icons';
mkdirSync(directory, { recursive: true });
for (const file of readdirSync(directory)) {
	if (/^(favicon|apple-touch-icon|icon-192|icon-512|icon-maskable-512)-[a-f0-9]{12}\.(png|svg)$/.test(file)) {
		unlinkSync(`${directory}/${file}`);
	}
}
const name = (base, extension = 'png') => `${base}-${hash}.${extension}`;
const outputs = [
	{ file: `${directory}/${name('favicon')}`, size: 32, rounded: true },
	{ file: `${directory}/${name('icon-192')}`, size: 192, rounded: true },
	{ file: `${directory}/${name('icon-512')}`, size: 512, rounded: true },
	{ file: `${directory}/${name('icon-maskable-512')}`, size: 512, rounded: false, maskable: true },
	{ file: `${directory}/${name('apple-touch-icon')}`, size: 180, rounded: false }
];

writeFileSync(`${directory}/${name('favicon', 'svg')}`, svg(true));
const app = 'web/src/app.html';
const links = [
	['rel="icon"', 'type="image/png"', 'sizes="32x32"', `href="%sveltekit.assets%/icons/${name('favicon')}"`],
	[
		'rel="icon"',
		'type="image/svg+xml"',
		'sizes="any"',
		`href="%sveltekit.assets%/icons/${name('favicon', 'svg')}"`
	],
	['rel="apple-touch-icon"', 'sizes="180x180"', `href="%sveltekit.assets%/icons/${name('apple-touch-icon')}"`]
]
	.map((attributes) => `<link\n\t\t\t${attributes.join('\n\t\t\t')}\n\t\t/>`)
	.join('\n\t\t');
writeFileSync(
	app,
	readFileSync(app, 'utf8').replace(
		/\t\t<!-- App icons -->[\s\S]*?\t\t<!-- End app icons -->/,
		`\t\t<!-- App icons -->\n\t\t${links}\n\t\t<!-- End app icons -->`
	)
);
const manifestPath = 'web/static/manifest.webmanifest';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.icons = [
	{ src: `/icons/${name('icon-192')}`, sizes: '192x192', type: 'image/png' },
	{ src: `/icons/${name('icon-512')}`, sizes: '512x512', type: 'image/png' },
	{ src: `/icons/${name('icon-maskable-512')}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
];
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

const browser = await chromium.launch();
try {
	for (const { file, size, rounded, maskable } of outputs) {
		const page = await browser.newPage({
			viewport: { width: size, height: size }
		});
		const img = svg(rounded, maskable).replace('<svg ', `<svg width="${size}" height="${size}" `);
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
