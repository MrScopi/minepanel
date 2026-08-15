import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

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

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  game_versions: string[];
  loaders: string[];
  date_modified: string;
}

interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
}

interface ModrinthVersionDependency {
  version_id?: string;
  project_id?: string;
  dependency_type: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  changelog?: string;
  date_published: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
  dependencies: ModrinthVersionDependency[];
}

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  downloads: number;
  date_modified?: string;
  versions: string[];
  categories: string[];
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

@Injectable()
export class ModrinthService {
  private readonly apiClient: AxiosInstance;
  private readonly MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
  private readonly KNOWN_LOADERS = ['forge', 'neoforge', 'fabric', 'quilt'];

  constructor() {
    this.apiClient = axios.create({
      baseURL: this.MODRINTH_API_BASE,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  async searchMods(query: {
    q?: string;
    limit?: number;
    offset?: number;
    minecraftVersion: string;
    loader?: 'forge' | 'neoforge' | 'fabric' | 'quilt';
  }): Promise<NormalizedModSearchResponse> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const offset = Math.max(query.offset ?? 0, 0);

    const facets: string[][] = [
      ['project_type:mod'],
      [`versions:${query.minecraftVersion}`],
    ];

    if (query.loader) {
      facets.push([`categories:${query.loader}`]);
    }

    try {
      const response = await this.apiClient.get<ModrinthSearchResponse>('/search', {
        params: {
          query: query.q,
          limit,
          offset,
          index: 'relevance',
          facets: JSON.stringify(facets),
        },
      });

      const normalized = response.data.hits
        .map((hit) => this.normalizeHit(hit))
        .filter((mod) => this.isCompatibleResult(mod, query.minecraftVersion, query.loader));

      return {
        data: normalized,
        pagination: {
          index: offset,
          pageSize: limit,
          resultCount: normalized.length,
          totalCount: response.data.total_hits,
        },
      };
    } catch (error) {
      console.error('Error searching Modrinth mods:', error);

      if (axios.isAxiosError(error)) {
        throw new HttpException(
          error.response?.data?.description || 'Error searching mods',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error searching mods', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getProject(projectIdOrSlug: string): Promise<ModrinthProject> {
    try {
      const response = await this.apiClient.get<ModrinthProject>(`/project/${encodeURIComponent(projectIdOrSlug)}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching Modrinth project:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new HttpException('Modrinth project not found', HttpStatus.NOT_FOUND);
        }
        throw new HttpException(
          error.response?.data?.description || 'Error fetching Modrinth project',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error fetching Modrinth project', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getProjectVersions(
    projectIdOrSlug: string,
    params?: { gameVersions?: string[]; loaders?: string[] },
  ): Promise<ModrinthVersion[]> {
    try {
      const response = await this.apiClient.get<ModrinthVersion[]>(`/project/${encodeURIComponent(projectIdOrSlug)}/version`, {
        params: {
          game_versions: params?.gameVersions ? JSON.stringify(params.gameVersions) : undefined,
          loaders: params?.loaders ? JSON.stringify(params.loaders) : undefined,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching Modrinth project versions:', error);

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new HttpException('Modrinth project not found', HttpStatus.NOT_FOUND);
        }
        throw new HttpException(
          error.response?.data?.description || 'Error fetching Modrinth versions',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      throw new HttpException('Error fetching Modrinth versions', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async resolveVersionsForProject(
    projectIdOrSlug: string,
    params?: { gameVersions?: string[]; loaders?: string[] },
  ): Promise<NormalizedModVersion[]> {
    const versions = await this.getProjectVersions(projectIdOrSlug, params);
    return versions
      .map((version) => this.normalizeVersion(version))
      .filter((version): version is NormalizedModVersion => version !== null);
  }

  private normalizeVersion(version: ModrinthVersion): NormalizedModVersion | null {
    const primaryFile = version.files.find((file) => file.primary) ?? version.files[0];
    if (!primaryFile) {
      return null;
    }

    return {
      provider: 'modrinth',
      versionId: version.id,
      versionNumber: version.version_number,
      datePublished: version.date_published,
      mcVersions: version.game_versions ?? [],
      loaders: version.loaders ?? [],
      changelog: version.changelog,
      downloadUrl: primaryFile.url,
      fileName: primaryFile.filename,
      dependencies: (version.dependencies ?? []).map((dependency) => ({
        projectId: dependency.project_id,
        versionId: dependency.version_id,
        dependencyType: dependency.dependency_type,
      })),
    };
  }

  private normalizeHit(hit: ModrinthSearchHit): NormalizedModSearchResult {
    const supportedLoaders = (hit.categories ?? []).filter((category) =>
      this.KNOWN_LOADERS.includes(category.toLowerCase()),
    );

    return {
      provider: 'modrinth',
      projectId: hit.project_id,
      slug: hit.slug,
      name: hit.title,
      summary: hit.description ?? '',
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      lastUpdated: hit.date_modified,
      supportedVersions: hit.versions ?? [],
      supportedLoaders,
    };
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
