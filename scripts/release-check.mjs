import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProduction, readReleaseInputs } from './build.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const publishMode = process.argv.includes('--publish');
const failures = [];
const checks = [];

function check(condition, message) {
    if (condition) checks.push(message);
    else failures.push(message);
}

function metadataValues(text) {
    const values = new Map();
    const block = text.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==$/m)?.[0];
    if (!block) return { block: '', values };
    for (const line of block.split('\n')) {
        const match = line.match(/^\/\/ @([^\s]+)\s+(.+)$/);
        if (!match) continue;
        const existing = values.get(match[1]) || [];
        existing.push(match[2].trim());
        values.set(match[1], existing);
    }
    return { block, values };
}

function one(values, key) {
    return values.get(key)?.[0] || '';
}

function normalizedPath(value) {
    return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function allowedPublicFile(file, policy) {
    const normalized = normalizedPath(file);
    return policy.allowedFiles.includes(normalized)
        || policy.allowedRoots.some((root) => normalized.startsWith(root));
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'vgen-nya-release-check-'));
try {
    const [{ packageJson, config }, publicPolicy] = await Promise.all([
        readReleaseInputs(),
        readFile(path.join(projectRoot, 'release/public-files.json'), 'utf8').then(JSON.parse),
    ]);
    const releaseBaseUrl = process.env.VGEN_NYA_RELEASE_BASE_URL || '';
    const first = await buildProduction({ outdir: path.join(temporaryRoot, 'first'), releaseBaseUrl });
    const second = await buildProduction({ outdir: path.join(temporaryRoot, 'second'), releaseBaseUrl });
    check(first.userscript === second.userscript && first.metadata === second.metadata,
        'deterministic build produces byte-identical artifacts');

    const distUserPath = path.join(projectRoot, 'dist', config.artifacts.userscript);
    const distMetaPath = path.join(projectRoot, 'dist', config.artifacts.metadata);
    const [distUser, distMeta] = await Promise.all([
        readFile(distUserPath, 'utf8'),
        readFile(distMetaPath, 'utf8'),
    ]);
    check(distUser === first.userscript && distMeta === first.metadata,
        'dist artifacts match a clean deterministic build');

    const userMetadata = metadataValues(distUser);
    const metaMetadata = metadataValues(distMeta);
    const required = ['name', 'namespace', 'version', 'description', 'author', 'license', 'match', 'run-at', 'grant'];
    for (const key of required) {
        check(userMetadata.values.has(key) && metaMetadata.values.has(key), `metadata contains @${key}`);
    }
    check(distMeta.trim() === metaMetadata.block.trim(), 'metadata artifact contains only the userscript block');
    check(one(userMetadata.values, 'version') === packageJson.version
        && one(metaMetadata.values, 'version') === packageJson.version,
    'package.json is the single APP_VERSION source for both artifacts');
    check(JSON.stringify(userMetadata.values.get('grant')) === JSON.stringify(config.grant)
        && JSON.stringify(metaMetadata.values.get('grant')) === JSON.stringify(config.grant),
    'userscript grants match the reviewed release configuration');
    const referencedCapabilities = [...new Set([
        ...(distUser.match(/\bGM_[A-Za-z0-9_]+\b/g) || []),
        ...(distUser.match(/\bunsafeWindow\b/g) || []),
    ])].sort();
    check(JSON.stringify(referencedCapabilities) === JSON.stringify([...config.grant].sort()),
        `metadata grants cover exactly the userscript capabilities referenced by the bundle (${referencedCapabilities.join(', ')})`);

    const updateUrl = one(userMetadata.values, 'updateURL');
    const downloadUrl = one(userMetadata.values, 'downloadURL');
    check(Boolean(updateUrl) === Boolean(downloadUrl), 'updateURL and downloadURL are configured together');
    if (releaseBaseUrl) {
        const base = releaseBaseUrl.replace(/\/+$/, '');
        check(updateUrl === `${base}/${config.artifacts.metadata}`, 'updateURL points to the stable metadata asset');
        check(downloadUrl === `${base}/${config.artifacts.userscript}`, 'downloadURL points to the stable userscript asset');
        check(base === config.stableChannel.targetBaseUrl,
            'configured release URL matches the frozen GitHub repository stable target');
        check(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/latest\/download$/.test(base),
            'stable base URL uses GitHub Release latest/download assets');
    } else {
        check(!publishMode, 'publish check requires VGEN_NYA_RELEASE_BASE_URL');
        checks.push('update URLs intentionally omitted from the local, unpublished build');
    }
    check(!/\/(?:heads\/)?main(?:\/|$)/i.test(`${updateUrl}\n${downloadUrl}`),
        'automatic update URLs never follow main');

    const artifactText = `${distMeta}\n${distUser}`;
    check(!/(?:[A-Z]:[\\/]|\/Users\/|F:\\|G:\\)/.test(artifactText),
        'artifacts contain no local absolute paths');
    check(!/(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,})/.test(artifactText),
        'artifacts contain no recognized API key or access-token shape');
    check(!/(?:Research[\\/]|ProjectDocs[\\/]evidence|tampermonkey-profile|deployment-l2-report)/i.test(artifactText),
        'artifacts contain no Research, evidence, or test-profile material');
    check(!/(?:VGen-Tag-Quick-Legacy-Export-Bridge|VGen-Toolkit-Legacy-Export-Bridge|vgen-nya-quick-tag-legacy-export|vgen-nya-toolkit-legacy-export)/.test(distUser),
        'Legacy Export Bridges are not bundled into the main userscript');
    const executable = distUser.slice(userMetadata.block.length);
    try {
        new Function(executable);
        checks.push('userscript artifact parses as JavaScript');
    } catch {
        failures.push('userscript artifact parses as JavaScript');
    }

    let candidateFiles = [];
    try {
        candidateFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
            cwd: projectRoot,
            encoding: 'utf8',
        }).split(/\r?\n/).filter(Boolean).map(normalizedPath);
    } catch {
        failures.push('local Git repository is initialized and candidate files can be audited');
    }
    const forbidden = candidateFiles.filter((file) => publicPolicy.forbiddenRoots.some((root) => file.startsWith(root)));
    const outsideAllowlist = candidateFiles.filter((file) => !allowedPublicFile(file, publicPolicy));
    check(forbidden.length === 0, `public candidate set excludes forbidden roots${forbidden.length ? `: ${forbidden.join(', ')}` : ''}`);
    check(outsideAllowlist.length === 0,
        `every public candidate is allowlisted${outsideAllowlist.length ? `: ${outsideAllowlist.join(', ')}` : ''}`);

    if (failures.length) {
        process.stderr.write(`Release check failed (${failures.length}):\n- ${failures.join('\n- ')}\n`);
        process.exitCode = 1;
    } else {
        process.stdout.write(`Release check PASS (${checks.length} checks, APP_VERSION ${packageJson.version}, mode ${publishMode ? 'publish' : 'local'}).\n`);
    }
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}
