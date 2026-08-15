import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { DockerComposeService } from 'src/docker-compose/docker-compose.service';
import { SettingsService } from 'src/users/services/settings.service';
import {
  ModrinthService,
  NormalizedModVersion as ModrinthNormalizedModVersion,
} from 'src/modrinth/modrinth.service';
import {
  CurseforgeService,
  CurseForgeModpack,
  NormalizedModVersion as CurseforgeNormalizedModVersion,
} from 'src/curseforge/curseforge.service';
import { AddTrackedModDto } from './dto/add-tracked-mod.dto';

type ModProvider = 'modrinth' | 'curseforge';
type TrackedModStatus = 'staged-only' | 'installed' | 'installed-and-staged' | 'missing';
type NormalizedModVersion = ModrinthNormalizedModVersion | CurseforgeNormalizedModVersion;

export interface TrackedModDependency {
  projectId?: string;
  slug?: string;
  name?: string;
  versionId?: string;
  dependencyType: string;
}

export interface VersionSummary {
  versionId: string;
  versionNumber: string;
  datePublished: string;
  mcVersions: string[];
}

export interface TrackedModRecord {
  id: string;
  provider: ModProvider;
  projectId: string;
  slug: string;
  name: string;
  iconUrl?: string;
  summary?: string;
  loader?: string;

  installedVersionId?: string;
  installedVersionNumber?: string;
  installedFileName?: string;
  installedAt?: string;
  installedMcVersions?: string[];

  stagedVersionId?: string;
  stagedVersionNumber?: string;
  stagedFileName?: string;
  stagedAt?: string;
  stagedMcVersions?: string[];
  stagedChangelog?: string;

  lastCheckedAt?: string;
  latestForCurrentMcVersion?: VersionSummary | null;
  latestForDesiredMcVersion?: VersionSummary | null;
  latestOverall?: VersionSummary | null;
  upstreamDateModified?: string;
  providerRemoved?: boolean;

  dependencies?: TrackedModDependency[];

  notes?: string;
  blockUpdate?: boolean;

  status: TrackedModStatus;
}

export interface ModLibraryRegistry {
  desiredMcVersion: string | null;
  mods: TrackedModRecord[];
}

export const MAX_MOD_JAR_SIZE = 128 * 1024 * 1024;

@Injectable()
export class ModLibraryService {
  private readonly logger = new Logger(ModLibraryService.name);
  private readonly SERVERS_DIR: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly dockerComposeService: DockerComposeService,
    private readonly modrinthService: ModrinthService,
    private readonly curseforgeService: CurseforgeService,
  ) {
    this.SERVERS_DIR = this.configService.get<string>('serversDir');
    fs.ensureDirSync(this.SERVERS_DIR);
  }

  async listTracked(serverId: string) {
    await this.ensureServerDirectories(serverId);
    return this.readRegistry(serverId);
  }

  async setDesiredMcVersion(serverId: string, desiredMcVersion: string | null | undefined) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    registry.desiredMcVersion = desiredMcVersion || null;
    await this.writeRegistry(serverId, registry);
    return registry;
  }

  async searchProviderMods(
    userId: number,
    serverId: string,
    provider: ModProvider,
    query: { q?: string; pageSize?: number; index?: number },
  ) {
    const config = await this.ensureServerDirectories(serverId);
    if (!config.minecraftVersion) {
      throw new BadRequestException('Set this server\'s Minecraft version before browsing mods');
    }

    if (provider === 'modrinth') {
      return this.modrinthService.searchMods({
        q: query.q,
        limit: query.pageSize,
        offset: query.index,
        minecraftVersion: config.minecraftVersion,
      });
    }

    const apiKey = await this.getCurseForgeApiKey(userId);
    return this.curseforgeService.searchMods(apiKey, {
      q: query.q,
      pageSize: query.pageSize,
      index: query.index,
      minecraftVersion: config.minecraftVersion,
    });
  }

  async resolveModByUrl(userId: number, serverId: string, url: string) {
    await this.ensureServerDirectories(serverId);
    const parsed = this.parseModUrl(url);

    if (parsed.provider === 'modrinth') {
      const project = await this.modrinthService.getProject(parsed.slug);
      return {
        provider: 'modrinth' as const,
        projectId: project.id,
        slug: project.slug,
        name: project.title,
        summary: project.description ?? '',
        iconUrl: project.icon_url,
        supportedVersions: project.game_versions ?? [],
        supportedLoaders: project.loaders ?? [],
      };
    }

    const apiKey = await this.getCurseForgeApiKey(userId);
    const mod = await this.curseforgeService.resolveModBySlug(apiKey, parsed.slug);
    return this.normalizeCurseForgeMod(mod);
  }

  async addTrackedMod(serverId: string, dto: AddTrackedModDto) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);

    const existing = registry.mods.find((mod) => mod.provider === dto.provider && mod.projectId === dto.projectId);
    if (existing) {
      throw new BadRequestException('This mod is already tracked for this server');
    }

    const mod: TrackedModRecord = {
      id: this.createTrackedModId(),
      provider: dto.provider,
      projectId: dto.projectId,
      slug: dto.slug,
      name: dto.name,
      iconUrl: dto.iconUrl,
      summary: dto.summary,
      loader: dto.loader,
      status: 'staged-only',
    };

    registry.mods.push(mod);
    await this.writeRegistry(serverId, registry);
    return mod;
  }

  async updateNotes(serverId: string, modId: string, dto: { notes?: string; blockUpdate?: boolean }) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const mod = this.getModOrThrow(registry, modId);

    if (dto.notes !== undefined) mod.notes = dto.notes;
    if (dto.blockUpdate !== undefined) mod.blockUpdate = dto.blockUpdate;

    await this.writeRegistry(serverId, registry);
    return mod;
  }

  async deleteTrackedMod(serverId: string, modId: string, removeFromDisk: boolean) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const mod = this.getModOrThrow(registry, modId);

    if (removeFromDisk) {
      if (mod.installedFileName) {
        await this.safeRemove(this.getMcDataModsPath(serverId), mod.installedFileName);
      }
      if (mod.stagedFileName) {
        await this.safeRemove(this.getDownloadsPath(serverId), mod.stagedFileName);
      }
    }

    registry.mods = registry.mods.filter((item) => item.id !== modId);
    await this.writeRegistry(serverId, registry);
    return { success: true };
  }

  async checkForUpdates(userId: number, serverId: string, modId?: string) {
    const config = await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const targets = modId ? [this.getModOrThrow(registry, modId)] : registry.mods;

    for (const mod of targets) {
      await this.refreshModVersions(userId, mod, config.minecraftVersion, registry.desiredMcVersion);
    }

    await this.writeRegistry(serverId, registry);
    return modId ? this.getModOrThrow(registry, modId) : registry;
  }

  async stageDownload(userId: number, serverId: string, modId: string, versionId: string) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const mod = this.getModOrThrow(registry, modId);

    const apiKey = mod.provider === 'curseforge' ? await this.getCurseForgeApiKey(userId) : undefined;
    const versions = await this.fetchVersions(mod, apiKey);
    const target = versions.find((version) => version.versionId === versionId);
    if (!target) {
      throw new NotFoundException('Version not found for this mod');
    }

    const changelog = await this.buildChangelog(mod, versions, target, apiKey);

    const downloadsDir = this.getDownloadsPath(serverId);
    const safeFileName = await this.resolveAvailableFileName(downloadsDir, this.sanitizeFileName(target.fileName));
    const destinationPath = path.join(downloadsDir, safeFileName);

    const response = await axios.get(target.downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
      maxContentLength: MAX_MOD_JAR_SIZE,
      maxBodyLength: MAX_MOD_JAR_SIZE,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    await fs.writeFile(destinationPath, response.data);

    mod.stagedVersionId = target.versionId;
    mod.stagedVersionNumber = target.versionNumber;
    mod.stagedFileName = safeFileName;
    mod.stagedAt = new Date().toISOString();
    mod.stagedMcVersions = target.mcVersions;
    mod.stagedChangelog = changelog;
    mod.status = mod.installedFileName ? 'installed-and-staged' : 'staged-only';

    await this.writeRegistry(serverId, registry);
    return mod;
  }

  async applyStagedMod(serverId: string, modId: string) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const mod = this.getModOrThrow(registry, modId);
    await this.applyStagedInternal(serverId, registry, mod);
    await this.writeRegistry(serverId, registry);
    return mod;
  }

  async applyAllStaged(serverId: string) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const applied: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const mod of registry.mods) {
      if (!mod.stagedFileName) continue;
      try {
        await this.applyStagedInternal(serverId, registry, mod);
        applied.push(mod.id);
      } catch (error) {
        failed.push({ id: mod.id, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    await this.writeRegistry(serverId, registry);
    return { applied, failed };
  }

  async reconcileWithDisk(serverId: string) {
    await this.ensureServerDirectories(serverId);
    const registry = await this.readRegistry(serverId);
    const modsDir = this.getMcDataModsPath(serverId);
    let changed = false;

    for (const mod of registry.mods) {
      if (!mod.installedFileName) continue;
      const exists = await fs.pathExists(path.join(modsDir, mod.installedFileName));
      const isMarkedMissing = mod.status === 'missing';

      if (!exists && !isMarkedMissing) {
        mod.status = 'missing';
        changed = true;
      } else if (exists && isMarkedMissing) {
        mod.status = mod.stagedFileName ? 'installed-and-staged' : 'installed';
        changed = true;
      }
    }

    if (changed) {
      await this.writeRegistry(serverId, registry);
    }

    return registry;
  }

  // --- internal helpers ---

  private async applyStagedInternal(serverId: string, registry: ModLibraryRegistry, mod: TrackedModRecord) {
    if (!mod.stagedFileName || !mod.stagedVersionId) {
      throw new BadRequestException('No staged version to apply for this mod');
    }

    const modsDir = this.getMcDataModsPath(serverId);
    await fs.ensureDir(modsDir);
    const targetPath = path.join(modsDir, mod.stagedFileName);

    if (mod.stagedFileName !== mod.installedFileName) {
      const conflictOwner = registry.mods.find((other) => other.id !== mod.id && other.installedFileName === mod.stagedFileName);
      if (conflictOwner) {
        throw new BadRequestException(`Another tracked mod ("${conflictOwner.name}") already installs a file named "${mod.stagedFileName}"`);
      }
      if (await fs.pathExists(targetPath)) {
        throw new BadRequestException(`A file named "${mod.stagedFileName}" already exists in mods/ and is not tracked by this entry`);
      }
    }

    const sourcePath = path.join(this.getDownloadsPath(serverId), mod.stagedFileName);
    if (!await fs.pathExists(sourcePath)) {
      throw new NotFoundException('Staged mod file is missing from the library; re-stage it before applying');
    }

    if (mod.installedFileName && mod.installedFileName !== mod.stagedFileName) {
      await fs.remove(path.join(modsDir, mod.installedFileName));
    }

    await fs.copy(sourcePath, targetPath, { overwrite: true });

    mod.installedVersionId = mod.stagedVersionId;
    mod.installedVersionNumber = mod.stagedVersionNumber;
    mod.installedFileName = mod.stagedFileName;
    mod.installedAt = new Date().toISOString();
    mod.installedMcVersions = mod.stagedMcVersions;
    mod.stagedVersionId = undefined;
    mod.stagedVersionNumber = undefined;
    mod.stagedFileName = undefined;
    mod.stagedAt = undefined;
    mod.stagedMcVersions = undefined;
    mod.stagedChangelog = undefined;
    mod.status = 'installed';
  }

  private async refreshModVersions(
    userId: number,
    mod: TrackedModRecord,
    serverMcVersion: string | undefined,
    desiredMcVersion: string | null,
  ) {
    try {
      const apiKey = mod.provider === 'curseforge' ? await this.getCurseForgeApiKey(userId) : undefined;
      const versions = await this.fetchVersions(mod, apiKey);

      const sorted = [...versions].sort((a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime());
      mod.latestOverall = sorted[0] ? this.toVersionSummary(sorted[0]) : null;
      mod.upstreamDateModified = sorted[0]?.datePublished;

      mod.latestForCurrentMcVersion = serverMcVersion ? this.pickLatestForVersion(sorted, serverMcVersion) : null;
      mod.latestForDesiredMcVersion = desiredMcVersion ? this.pickLatestForVersion(sorted, desiredMcVersion) : null;

      if (sorted[0]?.dependencies?.length) {
        mod.dependencies = sorted[0].dependencies.map((dependency) => ({
          projectId: dependency.projectId,
          versionId: dependency.versionId,
          dependencyType: dependency.dependencyType,
        }));
      }

      mod.providerRemoved = false;
      mod.lastCheckedAt = new Date().toISOString();
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        mod.providerRemoved = true;
        mod.lastCheckedAt = new Date().toISOString();
        return;
      }
      throw error;
    }
  }

  private pickLatestForVersion(sortedVersions: NormalizedModVersion[], mcVersion: string): VersionSummary | null {
    const match = sortedVersions.find((version) => version.mcVersions.includes(mcVersion));
    return match ? this.toVersionSummary(match) : null;
  }

  private toVersionSummary(version: NormalizedModVersion): VersionSummary {
    return {
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      datePublished: version.datePublished,
      mcVersions: version.mcVersions,
    };
  }

  private async fetchVersions(mod: TrackedModRecord, apiKey?: string): Promise<NormalizedModVersion[]> {
    if (mod.provider === 'modrinth') {
      return this.modrinthService.resolveVersionsForProject(mod.projectId);
    }
    return this.curseforgeService.resolveVersionsForMod(this.requireApiKey(apiKey), Number.parseInt(mod.projectId, 10));
  }

  private async buildChangelog(
    mod: TrackedModRecord,
    versions: NormalizedModVersion[],
    target: NormalizedModVersion,
    apiKey?: string,
  ): Promise<string> {
    if (mod.provider === 'curseforge') {
      const changelog = await this.curseforgeService.getFileChangelog(
        this.requireApiKey(apiKey),
        Number.parseInt(mod.projectId, 10),
        Number.parseInt(target.versionId, 10),
      );
      return changelog || '';
    }

    const targetDate = new Date(target.datePublished).getTime();
    const installedDate = mod.installedVersionId
      ? versions.find((version) => version.versionId === mod.installedVersionId)?.datePublished
      : undefined;
    const lowerBound = installedDate ? new Date(installedDate).getTime() : -Infinity;

    const inRange = versions
      .filter((version) => {
        const date = new Date(version.datePublished).getTime();
        return date > lowerBound && date <= targetDate;
      })
      .sort((a, b) => new Date(a.datePublished).getTime() - new Date(b.datePublished).getTime());

    return inRange
      .map((version) => `## ${version.versionNumber} (${version.datePublished})\n${version.changelog ?? ''}`.trim())
      .join('\n\n');
  }

  private normalizeCurseForgeMod(mod: CurseForgeModpack) {
    const versions = new Set<string>();
    for (const file of mod.latestFiles ?? []) {
      for (const version of file.gameVersions ?? []) {
        versions.add(version);
      }
    }

    return {
      provider: 'curseforge' as const,
      projectId: mod.id.toString(),
      slug: mod.slug,
      name: mod.name,
      summary: mod.summary ?? '',
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url,
      supportedVersions: Array.from(versions),
      supportedLoaders: [] as string[],
    };
  }

  private parseModUrl(url: string): { provider: ModProvider; slug: string } {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const segments = parsed.pathname.split('/').filter(Boolean);

    if (host === 'modrinth.com') {
      const slug = segments[segments.length - 1];
      if (!slug || !['mod', 'plugin', 'datapack'].includes(segments[0])) {
        throw new BadRequestException('Unrecognized Modrinth mod URL');
      }
      return { provider: 'modrinth', slug };
    }

    if (host === 'curseforge.com') {
      const slug = segments[segments.length - 1];
      if (!slug || segments[0] !== 'minecraft' || segments[1] !== 'mc-mods') {
        throw new BadRequestException('Unrecognized CurseForge mod URL');
      }
      return { provider: 'curseforge', slug };
    }

    throw new BadRequestException('URL must be a Modrinth or CurseForge mod page');
  }

  private getModOrThrow(registry: ModLibraryRegistry, modId: string): TrackedModRecord {
    const mod = registry.mods.find((item) => item.id === modId);
    if (!mod) {
      throw new NotFoundException('Tracked mod not found');
    }
    return mod;
  }

  private createTrackedModId() {
    return `tm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private requireApiKey(apiKey: string | undefined): string {
    if (!apiKey) {
      throw new BadRequestException('CurseForge API key not configured. Please add it in settings.');
    }
    return apiKey;
  }

  private async getCurseForgeApiKey(userId: number) {
    const cfApiKey = await this.settingsService.getCfApiKey(userId);
    return this.requireApiKey(cfApiKey);
  }

  private async safeRemove(baseDir: string, fileName: string) {
    const target = path.resolve(baseDir, fileName);
    if (target.startsWith(baseDir + path.sep)) {
      await fs.remove(target);
    } else {
      this.logger.warn(`Skipping unsafe mod file path: ${fileName}`);
    }
  }

  private async readRegistry(serverId: string): Promise<ModLibraryRegistry> {
    const registryPath = this.getRegistryPath(serverId);
    if (!await fs.pathExists(registryPath)) {
      return { desiredMcVersion: null, mods: [] };
    }

    try {
      const content = await fs.readJson(registryPath);
      if (!Array.isArray(content?.mods)) {
        return { desiredMcVersion: null, mods: [] };
      }
      return { desiredMcVersion: content.desiredMcVersion ?? null, mods: content.mods };
    } catch {
      return { desiredMcVersion: null, mods: [] };
    }
  }

  private async writeRegistry(serverId: string, registry: ModLibraryRegistry) {
    await fs.writeJson(this.getRegistryPath(serverId), registry, { spaces: 2 });
  }

  private async ensureServerDirectories(serverId: string) {
    this.validateServerId(serverId);
    const config = await this.dockerComposeService.getServerConfig(serverId);

    if (!config) {
      throw new NotFoundException('Server not found');
    }

    if (config.edition === 'BEDROCK') {
      throw new BadRequestException('The mod library is only available for Java servers');
    }

    await fs.ensureDir(this.getModLibraryPath(serverId));
    await fs.ensureDir(this.getDownloadsPath(serverId));
    await fs.ensureDir(this.getMcDataModsPath(serverId));

    return config;
  }

  private validateServerId(serverId: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(serverId)) {
      throw new BadRequestException('Invalid server ID');
    }
  }

  private sanitizeFileName(fileName: string) {
    const sanitized = fileName.replaceAll(/[^a-zA-Z0-9._-]/g, '-');
    return sanitized || 'mod.jar';
  }

  private async resolveAvailableFileName(dirPath: string, fileName: string) {
    const parsed = path.parse(fileName);
    let candidate = `${parsed.name}${parsed.ext}`;
    let counter = 1;

    while (await fs.pathExists(path.join(dirPath, candidate))) {
      candidate = `${parsed.name}-${counter}${parsed.ext}`;
      counter += 1;
    }

    return candidate;
  }

  private getServerPath(serverId: string) {
    return path.join(this.SERVERS_DIR, serverId);
  }

  private getModLibraryPath(serverId: string) {
    return path.join(this.getServerPath(serverId), 'mod-library');
  }

  private getDownloadsPath(serverId: string) {
    return path.join(this.getModLibraryPath(serverId), 'downloads');
  }

  private getRegistryPath(serverId: string) {
    return path.join(this.getModLibraryPath(serverId), 'registry.json');
  }

  private getMcDataModsPath(serverId: string) {
    return path.join(this.getServerPath(serverId), 'mc-data', 'mods');
  }
}
