import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');

function metadataLines(config, version, releaseBaseUrl = '') {
    const lines = [
        '// ==UserScript==',
        `// @name         ${config.name}`,
        `// @namespace    ${config.namespace}`,
        `// @version      ${version}`,
        `// @description  ${config.description}`,
        `// @author       ${config.author}`,
        `// @license      ${config.license}`,
    ];
    for (const match of config.match) lines.push(`// @match        ${match}`);
    if (releaseBaseUrl) {
        const base = releaseBaseUrl.replace(/\/+$/, '');
        lines.push(`// @updateURL    ${base}/${config.artifacts.metadata}`);
        lines.push(`// @downloadURL  ${base}/${config.artifacts.userscript}`);
    }
    lines.push(`// @run-at       ${config.runAt}`);
    for (const grant of config.grant) lines.push(`// @grant        ${grant}`);
    for (const connect of config.connect || []) lines.push(`// @connect      ${connect}`);
    lines.push('// ==/UserScript==');
    return `${lines.join('\n')}\n`;
}

export async function readReleaseInputs() {
    const [packageText, configText] = await Promise.all([
        readFile(path.join(projectRoot, 'package.json'), 'utf8'),
        readFile(path.join(projectRoot, 'release/release.config.json'), 'utf8'),
    ]);
    return { packageJson: JSON.parse(packageText), config: JSON.parse(configText) };
}

export async function buildProduction({
    outdir = path.join(projectRoot, 'dist'),
    releaseBaseUrl = process.env.VGEN_NYA_RELEASE_BASE_URL || '',
} = {}) {
    const { packageJson, config } = await readReleaseInputs();
    const header = metadataLines(config, packageJson.version, releaseBaseUrl);
    const result = await build({
        entryPoints: [path.join(projectRoot, 'src/userscript-entry.js')],
        bundle: true,
        write: false,
        format: 'iife',
        target: ['chrome120', 'firefox120'],
        charset: 'utf8',
        legalComments: 'none',
        define: {
            __VGEN_NYA_APP_VERSION__: JSON.stringify(packageJson.version),
        },
    });
    const code = result.outputFiles[0].text.replace(/\r\n/g, '\n');
    const userscript = `${header}${code.endsWith('\n') ? code : `${code}\n`}`;
    await mkdir(outdir, { recursive: true });
    await Promise.all([
        writeFile(path.join(outdir, config.artifacts.userscript), userscript, 'utf8'),
        writeFile(path.join(outdir, config.artifacts.metadata), header, 'utf8'),
    ]);
    return {
        version: packageJson.version,
        config,
        userscript,
        metadata: header,
        releaseBaseUrl,
    };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await buildProduction();
