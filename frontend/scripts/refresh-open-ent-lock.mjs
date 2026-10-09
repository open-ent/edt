// Purge les résolutions @open-ent/* de pnpm-lock.yaml avant l'install en CI.
//
// POURQUOI : les paquets @open-ent/* sont publiés sur un tag MOBILE (ex.
// 2.5.30-patched). Le fork openent-frontend-framework republie la MÊME version
// avec un contenu différent (workflow publish-packages.yml, `force: true` =>
// delete puis republish). Or le lock fige l'URL du tarball avec le SHA du blob
// d'alors :
//
//   tarball: https://npm.pkg.github.com/download/@open-ent/react/2.5.30-patched/0875e8a6...
//
// Une fois la version republiée, ce SHA n'est plus celui attaché à la version :
// GitHub Packages répond alors 409 Conflict (ERR_PNPM_FETCH_409) et l'install
// échoue. On retire donc ces entrées du lock pour forcer pnpm à re-résoudre
// @open-ent/* contre le registre (y compris les paquets transitifs comme
// @open-ent/tiptap-extensions, que `pnpm update` ne toucherait pas).
//
// Les sections `overrides:` et `importers:` sont laissées intactes : elles
// portent les versions voulues, pas les URLs périmées.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LOCKFILE = 'pnpm-lock.yaml';
const PURGED_SECTIONS = new Set(['packages', 'snapshots']);

if (!existsSync(LOCKFILE)) {
  console.log(`${LOCKFILE} absent : rien à purger.`);
  process.exit(0);
}

// Le lock est en LF sur les runners Linux mais en CRLF sur un checkout Windows
// (core.autocrlf) : on découpe sur les deux et on restitue la fin de ligne d'origine.
const raw = readFileSync(LOCKFILE, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);
const kept = [];
const removed = [];
let section = null;
let skipping = false;

for (const line of lines) {
  if (/^\S/.test(line)) {
    // Nouvelle section de 1er niveau (packages:, snapshots:, importers:...)
    section = line.replace(/:.*$/, '');
    skipping = false;
  } else if (/^ {2}\S/.test(line)) {
    // Nouvelle entrée de la section courante : elle décide si on saute le bloc
    skipping = PURGED_SECTIONS.has(section) && /^ {2}'@open-ent\//.test(line);
    if (skipping) removed.push(`${section} > ${line.trim().replace(/:$/, '')}`);
  }

  if (!skipping) kept.push(line);
}

if (removed.length === 0) {
  console.log('Aucune résolution @open-ent dans le lock : rien à faire.');
  process.exit(0);
}

writeFileSync(LOCKFILE, kept.join(eol));
console.log(`Résolutions @open-ent purgées du lock (${removed.length}) :`);
for (const entry of removed) console.log(`  - ${entry}`);
