import { build } from 'esbuild';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const header = `// ==UserScript==
// @name         VGenToolNya Legacy Import
// @namespace    https://vgen.co/
// @version      0.1.0
// @description  VGenToolNya Iteration 1：预览、确认并安全导入两个旧脚本的本地迁移 JSON。
// @author       @Nekori_Net
// @license      MIT
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==`;

await build({
    entryPoints: [path.join(projectRoot, 'src/migration/importer-userscript-entry.js')],
    outfile: path.join(projectRoot, 'migration/importer/VGenToolNya-Legacy-Importer.user.js'),
    bundle: true,
    format: 'iife',
    target: ['chrome120', 'firefox120'],
    legalComments: 'none',
    banner: { js: header },
});
