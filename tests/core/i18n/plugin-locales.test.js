import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPluginLocales } from '../../../src/core/i18n/plugin-locales.js';

/** @type {string} */
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-plugin-i18n-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadPluginLocales', () => {
  it("devrait retourner un objet vide si le dossier i18n n'existe pas", async () => {
    expect(await loadPluginLocales(dir)).toEqual({});
  });

  it('devrait charger un seul fichier de locale', async () => {
    await mkdir(join(dir, 'i18n'));
    await writeFile(join(dir, 'i18n', 'fr.json'), JSON.stringify({ greeting: 'Bonjour' }));
    expect(await loadPluginLocales(dir)).toEqual({ fr: { greeting: 'Bonjour' } });
  });

  it('devrait charger plusieurs fichiers de locale', async () => {
    await mkdir(join(dir, 'i18n'));
    await writeFile(join(dir, 'i18n', 'fr.json'), JSON.stringify({ greeting: 'Bonjour' }));
    await writeFile(join(dir, 'i18n', 'en.json'), JSON.stringify({ greeting: 'Hello' }));
    expect(await loadPluginLocales(dir)).toEqual({
      fr: { greeting: 'Bonjour' },
      en: { greeting: 'Hello' },
    });
  });

  it('devrait ignorer les fichiers non-JSON du dossier i18n', async () => {
    await mkdir(join(dir, 'i18n'));
    await writeFile(join(dir, 'i18n', 'fr.json'), JSON.stringify({ greeting: 'Bonjour' }));
    await writeFile(join(dir, 'i18n', 'README.md'), '# notes');
    expect(await loadPluginLocales(dir)).toEqual({ fr: { greeting: 'Bonjour' } });
  });

  it('devrait propager une erreur autre que dossier absent', async () => {
    // Un dossier `i18n` qui est en réalité un fichier fait échouer readdir
    // avec ENOTDIR, pas ENOENT — cette erreur-là ne doit pas être avalée.
    await writeFile(join(dir, 'i18n'), 'pas un dossier');
    await expect(loadPluginLocales(dir)).rejects.toThrow();
  });
});
