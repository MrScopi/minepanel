import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface CurseForgeModpack {
  id: number;
  gameId: number;
  name: string;
  slug: string;
  links: {
    websiteUrl: string;
  };
  summary: string;
  status: number;
  downloadCount: number;
  isFeatured: boolean;
  primaryCategoryId: number;
  categories: Array<{
    id: number;
    gameId: number;
    name: string;
    slug: string;
    url: string;
    iconUrl: string;
    dateModified: string;
    isClass: boolean;
    classId: number;
    parentCategoryId: number;
  }>;
  authors: Array<{
    id: number;
    name: string;
    url: string;
  }>;
  logo: {
    id: number;
    modId: number;
    title: string;
    description: string;
    thumbnailUrl: string;
    url: string;
  };
  screenshots: Array<{
    id: number;
    modId: number;
    title: string;
    description: string;
    thumbnailUrl: string;
    url: string;
  }>;
  mainFileId: number;
  latestFiles: Array<{
    id: number;
    gameId: number;
    modId: number;
    isAvailable: boolean;
    displayName: string;
    fileName: string;
    releaseType: number;
    fileStatus: number;
    hashes: Array<{
      value: string;
      algo: number;
    }>;
    fileDate: string;
    fileLength: number;
    downloadCount: number;
    downloadUrl: string;
    gameVersions: string[];
    sortableGameVersions: Array<{
      gameVersionName: string;
      gameVersionPadded: string;
      gameVersion: string;
      gameVersionReleaseDate: string;
      gameVersionTypeId: number;
    }>;
    dependencies: Array<{
      modId: number;
      relationType: number;
    }>;
    alternateFileId: number;
    isServerPack: boolean;
    fileFingerprint: number;
    modules: Array<{
      name: string;
      fingerprint: number;
    }>;
  }>;
  latestFilesIndexes: Array<{
    gameVersion: string;
    fileId: number;
    filename: string;
    releaseType: number;
    gameVersionTypeId: number;
    modLoader: number;
  }>;
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
  allowModDistribution: boolean;
  gamePopularityRank: number;
  isAvailable: boolean;
  thumbsUpCount: number;
}

export interface CurseForgeSearchResponse {
  data: CurseForgeModpack[];
  pagination: {
    index: number;
    pageSize: number;
    resultCount: number;
    totalCount: number;
  };
}

export interface CurseForgeModResponse {
  data: CurseForgeModpack;
}

export interface NormalizedModSearchResult {
  provider: 'curseforge' | 'modrinth';
  projectId: string;
  slug: string;
  name: string;
  summary: string;
  iconUrl?: string;
  downloads?: number;
  lastUpdated?: string;
  supportedVersions: string[];
  supportedLoaders: string[];
}

export interface NormalizedModSearchResponse {
  data: NormalizedModSearchResult[];
  pagination: {
    index: number;
    pageSize: number;
    resultCount: number;
    totalCount: number;
  };
}

export interface NormalizedModVersion {
  provider: 'modrinth' | 'curseforge';
  versionId: string;
  versionNumber: string;
  datePublished: string;
  mcVersions: string[];
  loaders: string[];
  changelog?: string;
  downloadUrl: string;
  fileName: string;
  dependencies: Array<{ projectId?: string; versionId?: string; dependencyType: string }>;
}

// CurseForge file relationType: 1=EmbeddedLibrary, 2=OptionalDependency, 3=RequiredDependency, 4=Tool, 5=Incompatible, 6=Include
const CURSEFORGE_RELATION_TYPE: Record<number, string> = {
  1: 'embedded',
  2: 'optional',
  3: 'required',
  4: 'optional',
  5: 'incompatible',
  6: 'embedded',
};

@Injectable()
export class CurseforgeService {
  private readonly apiClient: AxiosInstance;
  private readonly CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1';
  private readonly MINECRAFT_GAME_ID = 432;
  private readonly MODS_CLASS_ID = 6;
  private readonly MODPACK_CLASS_ID = 4471;

  constructor() {
    this.apiClient = axios.create({
      baseURL: this.CURSEFORGE_API_BASE,
      timeout: 10000,
    });
  }

  private getApiClient(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: this.CURSEFORGE_API_BASE,
      timeout: 10000,
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });
  }

  async searchModpacks(
    apiKey: string,
    searchFilter?: string,
    pageSize: number = 20,
    index: number = 0,
    sortField: number = 2, // 1 = Featured, 2 = Popularity, 3 = LastUpdated, 4 = Name, 5 = Author, 6 = TotalDownloads
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<CurseForgeSearchResponse> {
    if (!apiKey) {
      throw new HttpException(
        'CurseForge API key not configured',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const client = this.getApiClient(apiKey);
      const response = await client.get<CurseForgeSearchResponse>('/mods/search', {
        params: {
          gameId: this.MINECRAFT_GAME_ID,
          classId: this.MODPACK_CLASS_ID,
          searchFilter,
          pageSize,
          index,
          sortField,
          sortOrder,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error searching CurseForge modpacks:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new HttpException(
            'Invalid CurseForge API key',
            HttpStatus.FORBIDDEN,
          );
        }
        throw new HttpException(
          error.response?.data?.message || 'Error searching modpacks',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Error searching modpacks',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getModpack(apiKey: string, modId: number): Promise<CurseForgeModpack> {
    if (!apiKey) {
      throw new HttpException(
        'CurseForge API key not configured',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const client = this.getApiClient(apiKey);
      const response = await client.get<CurseForgeModResponse>(`/mods/${modId}`);

      return response.data.data;
    } catch (error) {
      console.error('Error fetching CurseForge modpack:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new HttpException(
            'Invalid CurseForge API key',
            HttpStatus.FORBIDDEN,
          );
        }
        if (error.response?.status === 404) {
          throw new HttpException(
            'Modpack not found',
            HttpStatus.NOT_FOUND,
          );
        }
        throw new HttpException(
          error.response?.data?.message || 'Error fetching modpack',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Error fetching modpack',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFeaturedModpacks(apiKey: string, limit: number = 10): Promise<CurseForgeSearchResponse> {
    return this.searchModpacks(apiKey, undefined, limit, 0, 1, 'desc');
  }

  async getPopularModpacks(apiKey: string, limit: number = 10): Promise<CurseForgeSearchResponse> {
    return this.searchModpacks(apiKey, undefined, limit, 0, 2, 'desc');
  }

  async searchMods(
    apiKey: string,
    query: {
      q?: string;
      pageSize?: number;
      index?: number;
      minecraftVersion: string;
      loader?: 'forge' | 'neoforge' | 'fabric' | 'quilt';
    },
  ): Promise<NormalizedModSearchResponse> {
    if (!apiKey) {
      throw new HttpException(
        'CurseForge API key not configured',
        HttpStatus.BAD_REQUEST,
      );
    }

    const requestedPageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 50);
    const pageSize = requestedPageSize % 2 === 0
      ? requestedPageSize
      : Math.min(requestedPageSize + 1, 50);
    const index = Math.max(query.index ?? 0, 0);
    const maxBatches = 8;

    try {
      const client = this.getApiClient(apiKey);
      const normalized: NormalizedModSearchResult[] = [];
      const seen = new Set<string>();
      let totalCount = 0;
      let batchIndex = index;
      let batches = 0;

      while (normalized.length < pageSize && batches < maxBatches) {
        const response = await client.get<CurseForgeSearchResponse>('/mods/search', {
          params: {
            gameId: this.MINECRAFT_GAME_ID,
            classId: this.MODS_CLASS_ID,
            searchFilter: query.q,
            pageSize,
            index: batchIndex,
            sortField: 2,
            sortOrder: 'desc',
            gameVersion: query.minecraftVersion,
          },
        });

        totalCount = response.data.pagination.totalCount;
        const compatibleBatch = response.data.data
          .map((mod) => this.normalizeMod(mod))
          .filter((mod) => this.isCompatibleResult(mod, query.minecraftVersion, query.loader));

        for (const mod of compatibleBatch) {
          if (normalized.length >= pageSize) break;
          if (seen.has(mod.projectId)) continue;
          normalized.push(mod);
          seen.add(mod.projectId);
        }

        batchIndex += pageSize;
        batches += 1;

        if (batchIndex >= totalCount) break;
        if (response.data.data.length === 0) break;
      }

      return {
        data: normalized,
        pagination: {
          index,
          pageSize,
          resultCount: normalized.length,
          totalCount,
        },
      };
    } catch (error) {
      console.error('Error searching CurseForge mods:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new HttpException(
            'Invalid CurseForge API key',
            HttpStatus.FORBIDDEN,
          );
        }
        throw new HttpException(
          error.response?.data?.message || 'Error searching mods',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException(
        'Error searching mods',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getModFiles(apiKey: string, modId: number, params?: { gameVersion?: string }): Promise<CurseForgeModpack['latestFiles']> {
    if (!apiKey) {
      throw new HttpException('CurseForge API key not configured', HttpStatus.BAD_REQUEST);
    }

    try {
      const client = this.getApiClient(apiKey);
      const response = await client.get(`/mods/${modId}/files`, {
        params: {
          gameVersion: params?.gameVersion,
          pageSize: 50,
          index: 0,
        },
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching CurseForge mod files:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new HttpException('Invalid CurseForge API key', HttpStatus.FORBIDDEN);
        }
        if (error.response?.status === 404) {
          throw new HttpException('CurseForge mod not found', HttpStatus.NOT_FOUND);
        }
        throw new HttpException(
          error.response?.data?.message || 'Error fetching mod files',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error fetching mod files', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getFileChangelog(apiKey: string, modId: number, fileId: number): Promise<string> {
    if (!apiKey) {
      throw new HttpException('CurseForge API key not configured', HttpStatus.BAD_REQUEST);
    }

    try {
      const client = this.getApiClient(apiKey);
      const response = await client.get(`/mods/${modId}/files/${fileId}/changelog`);
      return response.data?.data ?? '';
    } catch (error) {
      console.error('Error fetching CurseForge file changelog:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return '';
        }
        throw new HttpException(
          error.response?.data?.message || 'Error fetching changelog',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error fetching changelog', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resolveVersionsForMod(apiKey: string, modId: number, gameVersion?: string): Promise<NormalizedModVersion[]> {
    const files = await this.getModFiles(apiKey, modId, { gameVersion });
    return (files ?? [])
      .map((file) => this.normalizeFile(file))
      .filter((version): version is NormalizedModVersion => version !== null);
  }

  async resolveModBySlug(apiKey: string, slug: string): Promise<CurseForgeModpack> {
    if (!apiKey) {
      throw new HttpException('CurseForge API key not configured', HttpStatus.BAD_REQUEST);
    }

    try {
      const client = this.getApiClient(apiKey);
      const response = await client.get<CurseForgeSearchResponse>('/mods/search', {
        params: {
          gameId: this.MINECRAFT_GAME_ID,
          classId: this.MODS_CLASS_ID,
          slug,
        },
      });

      const mod = response.data.data?.[0];
      if (!mod) {
        throw new HttpException('CurseForge mod not found', HttpStatus.NOT_FOUND);
      }
      return mod;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error resolving CurseForge mod by slug:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          throw new HttpException('Invalid CurseForge API key', HttpStatus.FORBIDDEN);
        }
        throw new HttpException(
          error.response?.data?.message || 'Error resolving mod',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error resolving mod', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private normalizeFile(file: CurseForgeModpack['latestFiles'][number]): NormalizedModVersion | null {
    if (!file?.downloadUrl) {
      return null;
    }

    const loaders = new Set<string>();
    for (const version of file.gameVersions ?? []) {
      this.extractLoadersFromGameVersion(version).forEach((loader) => loaders.add(loader));
    }
    const mcVersions = (file.gameVersions ?? []).filter((version) => !this.extractLoadersFromGameVersion(version).length && !/^(client|server)$/i.test(version));

    return {
      provider: 'curseforge',
      versionId: String(file.id),
      versionNumber: file.displayName ?? file.fileName,
      datePublished: file.fileDate,
      mcVersions,
      loaders: Array.from(loaders),
      downloadUrl: file.downloadUrl,
      fileName: file.fileName,
      dependencies: (file.dependencies ?? []).map((dependency) => ({
        projectId: String(dependency.modId),
        dependencyType: CURSEFORGE_RELATION_TYPE[dependency.relationType] ?? 'optional',
      })),
    };
  }

  private normalizeMod(mod: CurseForgeModpack): NormalizedModSearchResult {
    const versions = new Set<string>();
    const loaders = new Set<string>();

    for (const file of mod.latestFiles ?? []) {
      for (const version of file.gameVersions ?? []) {
        versions.add(version);
        this.extractLoadersFromGameVersion(version).forEach((loader) => loaders.add(loader));
      }
    }

    return {
      provider: 'curseforge',
      projectId: mod.id.toString(),
      slug: mod.slug,
      name: mod.name,
      summary: mod.summary ?? '',
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url,
      downloads: mod.downloadCount,
      lastUpdated: mod.dateModified,
      supportedVersions: Array.from(versions),
      supportedLoaders: Array.from(loaders),
    };
  }

  private extractLoadersFromGameVersion(version: string): string[] {
    const normalized = version.toLowerCase();
    const loaders: string[] = [];
    if (normalized.includes('neoforge')) loaders.push('neoforge');
    if (normalized.includes('forge') && !normalized.includes('neoforge')) loaders.push('forge');
    if (normalized.includes('fabric')) loaders.push('fabric');
    if (normalized.includes('quilt')) loaders.push('quilt');
    return loaders;
  }

  private isCompatibleResult(
    mod: NormalizedModSearchResult,
    minecraftVersion: string,
    loader?: 'forge' | 'neoforge' | 'fabric' | 'quilt',
  ): boolean {
    const hasVersion = mod.supportedVersions.some((version) => version === minecraftVersion);
    if (!hasVersion) return false;

    if (!loader) return true;
    if (mod.supportedLoaders.length === 0) return true;
    return mod.supportedLoaders.includes(loader);
  }
}
