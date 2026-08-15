import api from "../axios.service";
import { ModProvider } from "@/services/mods/mods-browser.service";

export type TrackedModStatus = "staged-only" | "installed" | "installed-and-staged" | "missing";

export interface VersionSummary {
  versionId: string;
  versionNumber: string;
  datePublished: string;
  mcVersions: string[];
}

export interface TrackedModDependency {
  projectId?: string;
  slug?: string;
  name?: string;
  versionId?: string;
  dependencyType: string;
}

export interface TrackedMod {
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
  mods: TrackedMod[];
}

export interface ResolvedModPreview {
  provider: ModProvider;
  projectId: string;
  slug: string;
  name: string;
  summary: string;
  iconUrl?: string;
  supportedVersions: string[];
  supportedLoaders: string[];
}

export interface AddTrackedModPayload {
  provider: ModProvider;
  projectId: string;
  slug: string;
  name: string;
  iconUrl?: string;
  summary?: string;
  loader?: string;
}

export interface ApplyAllStagedResult {
  applied: string[];
  failed: Array<{ id: string; error: string }>;
}

export const modLibraryService = {
  async list(serverId: string): Promise<ModLibraryRegistry> {
    const { data } = await api.get(`/mod-library/${serverId}`);
    return data;
  },

  async search(serverId: string, provider: ModProvider, params: { q?: string; pageSize?: number; index?: number }) {
    const { data } = await api.get(`/mod-library/${serverId}/search`, {
      params: { provider, ...params },
    });
    return data;
  },

  async resolveUrl(serverId: string, url: string): Promise<ResolvedModPreview> {
    const { data } = await api.get(`/mod-library/${serverId}/resolve-url`, {
      params: { url },
    });
    return data;
  },

  async addTrackedMod(serverId: string, payload: AddTrackedModPayload): Promise<TrackedMod> {
    const { data } = await api.post(`/mod-library/${serverId}/mods`, payload);
    return data;
  },

  async checkModForUpdates(serverId: string, modId: string): Promise<TrackedMod> {
    const { data } = await api.post(`/mod-library/${serverId}/mods/${modId}/check`);
    return data;
  },

  async checkAllModsForUpdates(serverId: string): Promise<ModLibraryRegistry> {
    const { data } = await api.post(`/mod-library/${serverId}/check-all`);
    return data;
  },

  async stageModDownload(serverId: string, modId: string, versionId: string): Promise<TrackedMod> {
    const { data } = await api.post(`/mod-library/${serverId}/mods/${modId}/stage`, { versionId });
    return data;
  },

  async applyStagedMod(serverId: string, modId: string): Promise<TrackedMod> {
    const { data } = await api.post(`/mod-library/${serverId}/mods/${modId}/apply`);
    return data;
  },

  async applyAllStagedMods(serverId: string): Promise<ApplyAllStagedResult> {
    const { data } = await api.post(`/mod-library/${serverId}/apply-all`);
    return data;
  },

  async updateNotes(serverId: string, modId: string, payload: { notes?: string; blockUpdate?: boolean }): Promise<TrackedMod> {
    const { data } = await api.patch(`/mod-library/${serverId}/mods/${modId}/notes`, payload);
    return data;
  },

  async setDesiredMcVersion(serverId: string, desiredMcVersion: string | null): Promise<ModLibraryRegistry> {
    const { data } = await api.put(`/mod-library/${serverId}/desired-version`, { desiredMcVersion });
    return data;
  },

  async deleteTrackedMod(serverId: string, modId: string, removeFromDisk: boolean): Promise<void> {
    await api.delete(`/mod-library/${serverId}/mods/${modId}`, {
      params: { removeFromDisk: removeFromDisk ? "true" : "false" },
    });
  },
};
