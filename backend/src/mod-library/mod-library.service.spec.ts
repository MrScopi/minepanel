import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { ModLibraryService, TrackedModRecord } from './mod-library.service';

jest.mock('axios');

describe('ModLibraryService', () => {
  let tempDir: string;
  let service: ModLibraryService;
  let modrinthService: { getProject: jest.Mock; getProjectVersions: jest.Mock; resolveVersionsForProject: jest.Mock };
  let curseforgeService: { resolveVersionsForMod: jest.Mock; getFileChangelog: jest.Mock; resolveModBySlug: jest.Mock };
  let settingsService: { getCfApiKey: jest.Mock };
  let dockerComposeService: { getServerConfig: jest.Mock };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'minepanel-mod-library-'));
    (axios.get as jest.Mock).mockReset();

    modrinthService = {
      getProject: jest.fn(),
      getProjectVersions: jest.fn(),
      resolveVersionsForProject: jest.fn(),
    };
    curseforgeService = {
      resolveVersionsForMod: jest.fn(),
      getFileChangelog: jest.fn(),
      resolveModBySlug: jest.fn(),
    };
    settingsService = {
      getCfApiKey: jest.fn().mockResolvedValue('cf-key'),
    };
    dockerComposeService = {
      getServerConfig: jest.fn().mockResolvedValue({ id: 'fab', edition: 'JAVA', serverType: 'FABRIC', minecraftVersion: '1.21.4' }),
    };

    service = new ModLibraryService(
      {
        get: jest.fn((key: string) => (key === 'serversDir' ? tempDir : undefined)),
      } as any,
      settingsService as any,
      dockerComposeService as any,
      modrinthService as any,
      curseforgeService as any,
    );
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  function serverDir(serverId = 'fab') {
    return path.join(tempDir, serverId);
  }

  async function addMod(overrides: Partial<{ provider: 'modrinth' | 'curseforge'; projectId: string; slug: string; name: string }> = {}) {
    return service.addTrackedMod('fab', {
      provider: 'modrinth',
      projectId: 'sodium',
      slug: 'sodium',
      name: 'Sodium',
      ...overrides,
    } as any);
  }

  it('addTrackedMod should create a staged-only registry entry', async () => {
    const mod = await addMod();

    expect(mod.status).toBe('staged-only');
    const registry = await fs.readJson(path.join(serverDir(), 'mod-library', 'registry.json'));
    expect(registry.mods).toHaveLength(1);
    expect(registry.mods[0].name).toBe('Sodium');
  });

  it('addTrackedMod should reject duplicates for the same provider/project', async () => {
    await addMod();
    await expect(addMod()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ensureServerDirectories should reject Bedrock servers', async () => {
    dockerComposeService.getServerConfig.mockResolvedValue({ id: 'bed', edition: 'BEDROCK' });
    await expect(service.listTracked('fab')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stage -> apply happy path installs the jar into mc-data/mods', async () => {
    const mod = await addMod();

    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        changelog: 'Initial release',
        downloadUrl: 'https://example.com/sodium-1.0.0.jar',
        fileName: 'sodium-1.0.0.jar',
        dependencies: [],
      },
    ]);
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake jar bytes') });

    const staged = await service.stageDownload(1, 'fab', mod.id, 'v1');
    expect(staged.status).toBe('staged-only');
    expect(staged.stagedFileName).toBe('sodium-1.0.0.jar');
    expect(await fs.pathExists(path.join(serverDir(), 'mod-library', 'downloads', 'sodium-1.0.0.jar'))).toBe(true);

    const applied = await service.applyStagedMod('fab', mod.id);
    expect(applied.status).toBe('installed');
    expect(applied.installedFileName).toBe('sodium-1.0.0.jar');
    expect(applied.stagedFileName).toBeUndefined();
    expect(await fs.pathExists(path.join(serverDir(), 'mc-data', 'mods', 'sodium-1.0.0.jar'))).toBe(true);
  });

  it('applyStagedMod should remove the superseded jar when the filename changes', async () => {
    const mod = await addMod();
    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-1.0.0.jar',
        fileName: 'sodium-1.0.0.jar',
        dependencies: [],
      },
      {
        provider: 'modrinth',
        versionId: 'v2',
        versionNumber: '2.0.0',
        datePublished: '2026-02-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-2.0.0.jar',
        fileName: 'sodium-2.0.0.jar',
        dependencies: [],
      },
    ]);
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake jar bytes') });

    await service.stageDownload(1, 'fab', mod.id, 'v1');
    await service.applyStagedMod('fab', mod.id);

    await service.stageDownload(1, 'fab', mod.id, 'v2');
    await service.applyStagedMod('fab', mod.id);

    const modsDir = path.join(serverDir(), 'mc-data', 'mods');
    expect(await fs.pathExists(path.join(modsDir, 'sodium-1.0.0.jar'))).toBe(false);
    expect(await fs.pathExists(path.join(modsDir, 'sodium-2.0.0.jar'))).toBe(true);
  });

  it('applyStagedMod should refuse to overwrite an untracked file with the same name', async () => {
    const mod = await addMod();
    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-1.0.0.jar',
        fileName: 'sodium-1.0.0.jar',
        dependencies: [],
      },
    ]);
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake jar bytes') });

    await service.stageDownload(1, 'fab', mod.id, 'v1');
    await fs.outputFile(path.join(serverDir(), 'mc-data', 'mods', 'sodium-1.0.0.jar'), 'not managed by us');

    await expect(service.applyStagedMod('fab', mod.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkForUpdates should pick latest versions for current and desired MC versions', async () => {
    const mod = await addMod();
    await service.setDesiredMcVersion('fab', '1.22');

    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-1.0.0.jar',
        fileName: 'sodium-1.0.0.jar',
        dependencies: [],
      },
      {
        provider: 'modrinth',
        versionId: 'v2-beta',
        versionNumber: '2.0.0-beta',
        datePublished: '2026-03-01T00:00:00Z',
        mcVersions: ['1.22'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-2.0.0-beta.jar',
        fileName: 'sodium-2.0.0-beta.jar',
        dependencies: [],
      },
    ]);

    const updated = (await service.checkForUpdates(1, 'fab', mod.id)) as TrackedModRecord;

    expect(updated.latestForCurrentMcVersion).toMatchObject({ versionId: 'v1' });
    expect(updated.latestForDesiredMcVersion).toMatchObject({ versionId: 'v2-beta' });
    expect(updated.latestOverall).toMatchObject({ versionId: 'v2-beta' });
    expect(updated.lastCheckedAt).toBeDefined();
  });

  it('checkForUpdates should flag providerRemoved on a 404 instead of throwing', async () => {
    const mod = await addMod();
    modrinthService.resolveVersionsForProject.mockRejectedValue(new HttpException('not found', HttpStatus.NOT_FOUND));

    const updated = (await service.checkForUpdates(1, 'fab', mod.id)) as TrackedModRecord;

    expect(updated.providerRemoved).toBe(true);
  });

  it('reconcileWithDisk should flag a missing jar without deleting the registry entry', async () => {
    const mod = await addMod();
    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-1.0.0.jar',
        fileName: 'sodium-1.0.0.jar',
        dependencies: [],
      },
    ]);
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake jar bytes') });

    await service.stageDownload(1, 'fab', mod.id, 'v1');
    await service.applyStagedMod('fab', mod.id);
    await fs.remove(path.join(serverDir(), 'mc-data', 'mods', 'sodium-1.0.0.jar'));

    const registry = await service.reconcileWithDisk('fab');
    expect(registry.mods[0].status).toBe('missing');
    expect(registry.mods).toHaveLength(1);
  });

  it('deleteTrackedMod should remove files only when removeFromDisk is true', async () => {
    const mod = await addMod();
    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/sodium-1.0.0.jar',
        fileName: 'sodium-1.0.0.jar',
        dependencies: [],
      },
    ]);
    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake jar bytes') });

    await service.stageDownload(1, 'fab', mod.id, 'v1');
    await service.applyStagedMod('fab', mod.id);

    await service.deleteTrackedMod('fab', mod.id, false);
    expect(await fs.pathExists(path.join(serverDir(), 'mc-data', 'mods', 'sodium-1.0.0.jar'))).toBe(true);

    const mod2 = await addMod({ projectId: 'lithium', slug: 'lithium', name: 'Lithium' });
    modrinthService.resolveVersionsForProject.mockResolvedValue([
      {
        provider: 'modrinth',
        versionId: 'v1',
        versionNumber: '1.0.0',
        datePublished: '2026-01-01T00:00:00Z',
        mcVersions: ['1.21.4'],
        loaders: ['fabric'],
        downloadUrl: 'https://example.com/lithium-1.0.0.jar',
        fileName: 'lithium-1.0.0.jar',
        dependencies: [],
      },
    ]);
    await service.stageDownload(1, 'fab', mod2.id, 'v1');
    await service.applyStagedMod('fab', mod2.id);

    await service.deleteTrackedMod('fab', mod2.id, true);
    expect(await fs.pathExists(path.join(serverDir(), 'mc-data', 'mods', 'lithium-1.0.0.jar'))).toBe(false);
  });

  it('deleteTrackedMod should 404 for an unknown mod id', async () => {
    await addMod();
    await expect(service.deleteTrackedMod('fab', 'ghost', false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolveModByUrl should parse a Modrinth mod URL and fetch the project', async () => {
    modrinthService.getProject.mockResolvedValue({
      id: 'AANobbMI',
      slug: 'sodium',
      title: 'Sodium',
      description: 'Rendering optimization',
      icon_url: 'https://example.com/sodium.png',
      game_versions: ['1.21.4'],
      loaders: ['fabric'],
      date_modified: '2026-01-01T00:00:00Z',
    });

    const result = await service.resolveModByUrl(1, 'fab', 'https://modrinth.com/mod/sodium');

    expect(modrinthService.getProject).toHaveBeenCalledWith('sodium');
    expect(result).toMatchObject({ provider: 'modrinth', slug: 'sodium', name: 'Sodium' });
  });

  it('resolveModByUrl should parse a CurseForge mod URL and fetch the mod', async () => {
    curseforgeService.resolveModBySlug.mockResolvedValue({
      id: 100,
      slug: 'fabric-api',
      name: 'Fabric API',
      summary: 'Core library',
      logo: { thumbnailUrl: 'https://example.com/fabric.png' },
      latestFiles: [{ gameVersions: ['1.21.4'] }],
    });

    const result = await service.resolveModByUrl(1, 'fab', 'https://www.curseforge.com/minecraft/mc-mods/fabric-api');

    expect(curseforgeService.resolveModBySlug).toHaveBeenCalledWith('cf-key', 'fabric-api');
    expect(result).toMatchObject({ provider: 'curseforge', slug: 'fabric-api', name: 'Fabric API' });
  });

  it('resolveModByUrl should reject an unrecognized host', async () => {
    await expect(service.resolveModByUrl(1, 'fab', 'https://example.com/mod/sodium')).rejects.toBeInstanceOf(BadRequestException);
  });
});
