import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REFERENCE_FIXTURES = Object.freeze({
  'pokedex.json': {
    bulbasaur: {
      num: 1,
      name: 'Bulbasaur',
      types: ['Grass', 'Poison'],
      baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
      abilities: { 0: 'Overgrow', H: 'Chlorophyll' },
    },
    pikachu: {
      num: 25,
      name: 'Pikachu',
      types: ['Electric'],
      baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
      abilities: { 0: 'Static', H: 'Lightning Rod' },
    },
  },
  'moves.json': {
    thunderbolt: {
      num: 85,
      name: 'Thunderbolt',
      type: 'Electric',
      category: 'Special',
      basePower: 90,
    },
  },
  'items.json': {
    lightball: { num: 236, name: 'Light Ball' },
  },
  'abilities.json': {
    static: { num: 9, name: 'Static' },
    lightningrod: { num: 31, name: 'Lightning Rod' },
  },
  'natures.json': {
    timid: { name: 'Timid', plus: 'spe', minus: 'atk' },
  },
  'legends_arceus_pokemon.json': { pokemon: [] },
  'legends_za_pokemon.json': { pokemon: [] },
  'learnsets.json': {},
  'bss-factory-sets.json': {},
});

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function ensureReferenceFixtures(repoRoot) {
  const referenceDir = path.join(repoRoot, 'data', 'reference');
  await mkdir(referenceDir, { recursive: true });
  const created = [];

  for (const [filename, data] of Object.entries(REFERENCE_FIXTURES)) {
    const filePath = path.join(referenceDir, filename);
    try {
      await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      created.push(filePath);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  return async () => {
    await Promise.all(created.map((filePath) => rm(filePath, { force: true })));
  };
}

async function waitForServer(url, process, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode != null) {
      throw new Error(`Development server exited with code ${process.exitCode}\n${output.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Development server did not become ready\n${output.join('')}`);
}

export async function startDevServer(repoRoot) {
  const port = await getAvailablePort();
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'pokedex-e2e-'));
  const removeFixtures = await ensureReferenceFixtures(repoRoot);
  const output = [];
  const { stdout: pythonPath } = await execFileAsync('uv', ['python', 'find'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const process = spawn(pythonPath.trim(), ['serve.py', '--port', String(port)], {
    cwd: repoRoot,
    env: {
      ...globalThis.process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
      USERDATA_DIR: userDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  process.stdout.on('data', (chunk) => output.push(chunk.toString()));
  process.stderr.on('data', (chunk) => output.push(chunk.toString()));

  const url = `http://127.0.0.1:${port}/`;
  try {
    await waitForServer(url, process, output);
  } catch (error) {
    process.kill();
    await removeFixtures();
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }

  return {
    url,
    output,
    async stop() {
      if (process.exitCode == null) {
        process.kill();
        await new Promise((resolve) => {
          process.once('exit', resolve);
          setTimeout(resolve, 2_000);
        });
      }
      await removeFixtures();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}
