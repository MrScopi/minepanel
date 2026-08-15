"use client";

import axios from "axios";
import { FC, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Compass, Loader2, Package, RefreshCw, Save, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { mcToast } from "@/lib/utils/minecraft-toast";
import { ServerConfig } from "@/lib/types/types";
import { ModProvider } from "@/services/mods/mods-browser.service";
import { modLibraryService, ModLibraryRegistry, TrackedMod } from "@/services/mod-library/mod-library.service";
import { ModLibraryBrowseDialog } from "../mods/ModLibraryBrowseDialog";
import { ModLibraryRow } from "./ModLibraryRow";

interface ModLibraryTabProps {
  serverId: string;
  config: ServerConfig;
  refreshToken?: number;
}

export const ModLibraryTab: FC<ModLibraryTabProps> = ({ serverId, config, refreshToken = 0 }) => {
  const { t } = useLanguage();
  const [registry, setRegistry] = useState<ModLibraryRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [desiredVersionDraft, setDesiredVersionDraft] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseProvider, setBrowseProvider] = useState<ModProvider>("modrinth");
  const [modPendingDelete, setModPendingDelete] = useState<TrackedMod | null>(null);
  const [removeFromDiskOnDelete, setRemoveFromDiskOnDelete] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);

  const minecraftVersion = config.minecraftVersion || "";
  const busy = actionId !== null || checkingAll || applyingAll;

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message ?? error.response?.data?.error;
      if (Array.isArray(message)) return message.join("\n");
      if (typeof message === "string" && message.trim()) return message;
    }
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  }, []);

  const loadRegistry = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const data = await modLibraryService.list(serverId);
      setRegistry(data);
      setDesiredVersionDraft(data.desiredMcVersion ?? "");
    } catch (error) {
      console.error("Error loading mod library:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorSearch")));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [serverId, getErrorMessage, t]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry, refreshToken]);

  const isTracked = useCallback(
    (mod: { provider: ModProvider; projectId: string }) =>
      (registry?.mods ?? []).some((tracked) => tracked.provider === mod.provider && tracked.projectId === mod.projectId),
    [registry],
  );

  const handleSaveDesiredVersion = async () => {
    setActionId("desired-version");
    try {
      const data = await modLibraryService.setDesiredMcVersion(serverId, desiredVersionDraft.trim() || null);
      setRegistry(data);
      mcToast.success(t("modLibrarySaveNotes"));
    } catch (error) {
      console.error("Error saving desired MC version:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorSearch")));
    } finally {
      setActionId(null);
    }
  };

  const handleAddFromBrowse = async (mod: { provider: ModProvider; projectId: string; slug: string; name: string; iconUrl?: string; summary?: string; supportedLoaders?: string[] }) => {
    await modLibraryService.addTrackedMod(serverId, {
      provider: mod.provider,
      projectId: mod.projectId,
      slug: mod.slug,
      name: mod.name,
      iconUrl: mod.iconUrl,
      summary: mod.summary,
      loader: mod.supportedLoaders?.[0],
    });
    await loadRegistry({ silent: true });
  };

  const handleResolveUrl = async (url: string) => {
    return modLibraryService.resolveUrl(serverId, url);
  };

  const handleCheck = async (mod: TrackedMod) => {
    setActionId(`check-${mod.id}`);
    try {
      await modLibraryService.checkModForUpdates(serverId, mod.id);
      await loadRegistry({ silent: true });
    } catch (error) {
      console.error("Error checking mod for updates:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorCheck")));
    } finally {
      setActionId(null);
    }
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      await modLibraryService.checkAllModsForUpdates(serverId);
      await loadRegistry({ silent: true });
      mcToast.success(t("modLibraryCheckAll"));
    } catch (error) {
      console.error("Error checking mods for updates:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorCheck")));
    } finally {
      setCheckingAll(false);
    }
  };

  const handleStage = async (mod: TrackedMod, versionId: string) => {
    setActionId(`stage-${mod.id}-${versionId}`);
    try {
      await modLibraryService.stageModDownload(serverId, mod.id, versionId);
      await loadRegistry({ silent: true });
      mcToast.success(t("modLibraryStage"));
    } catch (error) {
      console.error("Error staging mod download:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorStage")));
    } finally {
      setActionId(null);
    }
  };

  const handleApply = async (mod: TrackedMod) => {
    setActionId(`apply-${mod.id}`);
    try {
      await modLibraryService.applyStagedMod(serverId, mod.id);
      await loadRegistry({ silent: true });
      mcToast.success(t("modLibraryApply"));
    } catch (error) {
      console.error("Error applying staged mod:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorApply")));
    } finally {
      setActionId(null);
    }
  };

  const handleApplyAll = async () => {
    setApplyingAll(true);
    try {
      const result = await modLibraryService.applyAllStagedMods(serverId);
      await loadRegistry({ silent: true });
      if (result.failed.length > 0) {
        mcToast.error(`${t("modLibraryErrorApply")}: ${result.failed.map((f) => f.error).join(", ")}`);
      } else {
        mcToast.success(t("modLibraryApplyAll"));
      }
    } catch (error) {
      console.error("Error applying all staged mods:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorApply")));
    } finally {
      setApplyingAll(false);
    }
  };

  const handleSaveNotes = async (mod: TrackedMod, notes: string, blockUpdate: boolean) => {
    setActionId(`notes-${mod.id}`);
    try {
      await modLibraryService.updateNotes(serverId, mod.id, { notes, blockUpdate });
      await loadRegistry({ silent: true });
    } catch (error) {
      console.error("Error saving mod notes:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorSearch")));
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async () => {
    if (!modPendingDelete) return;
    const mod = modPendingDelete;
    setModPendingDelete(null);
    setActionId(`delete-${mod.id}`);
    try {
      await modLibraryService.deleteTrackedMod(serverId, mod.id, removeFromDiskOnDelete);
      await loadRegistry({ silent: true });
      mcToast.success(t("modLibraryDelete"));
    } catch (error) {
      console.error("Error deleting tracked mod:", error);
      mcToast.error(getErrorMessage(error, t("modLibraryErrorSearch")));
    } finally {
      setActionId(null);
      setRemoveFromDiskOnDelete(false);
    }
  };

  const mods = registry?.mods ?? [];
  const hasPendingApply = mods.some((mod) => mod.stagedFileName);

  return (
    <Card className="relative overflow-hidden bg-gray-900/60 border-gray-700/50 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-green-400 font-minecraft flex items-center gap-2">
          <Package className="h-6 w-6" />
          {t("modLibrary")}
        </CardTitle>
        <CardDescription className="text-gray-300">{t("modLibraryEmptyDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-xs leading-relaxed text-amber-200/90">{t("modLibraryWarningCombine")}</p>
        </div>

        <div className="rounded-xl border border-gray-700/60 bg-gray-800/35 p-4 space-y-3">
          <p className="text-sm font-minecraft text-green-400">{t("modLibraryDesiredVersion")}</p>
          <p className="text-xs text-gray-400">{t("modLibraryDesiredVersionHelp")}</p>
          <div className="flex gap-2">
            <Input
              value={desiredVersionDraft}
              onChange={(e) => setDesiredVersionDraft(e.target.value)}
              placeholder={config.minecraftVersion || "1.22"}
              className="h-10 bg-gray-900/70 border-gray-700/80 text-gray-100"
            />
            <Button type="button" variant="minepanelOutline" onClick={handleSaveDesiredVersion} disabled={busy} className="h-10 font-minecraft">
              {actionId === "desired-version" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="minepanelOutline" onClick={() => { setBrowseProvider("modrinth"); setBrowseOpen(true); }} disabled={busy || !minecraftVersion} className="font-minecraft">
            <Compass className="h-4 w-4" />
            {t("modLibraryBrowseMods")} (Modrinth)
          </Button>
          <Button type="button" variant="minepanelOutline" onClick={() => { setBrowseProvider("curseforge"); setBrowseOpen(true); }} disabled={busy || !minecraftVersion} className="font-minecraft">
            <Compass className="h-4 w-4" />
            {t("modLibraryBrowseMods")} (CurseForge)
          </Button>
          <Button type="button" variant="minepanelOutline" onClick={handleCheckAll} disabled={busy || mods.length === 0} className="font-minecraft">
            {checkingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("modLibraryCheckAll")}
          </Button>
          <Button type="button" variant="minepanel" onClick={handleApplyAll} disabled={busy || !hasPendingApply} className="font-minecraft">
            {applyingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("modLibraryApplyAll")}
          </Button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            </div>
          ) : mods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <Image src="/images/barrier.webp" alt="No mods tracked" width={50} height={50} className="opacity-60 mb-4" />
              <p className="font-minecraft text-sm">{t("modLibraryEmptyTitle")}</p>
            </div>
          ) : (
            mods.map((mod) => (
              <ModLibraryRow
                key={mod.id}
                mod={mod}
                disabled={busy}
                actionId={actionId}
                onCheck={handleCheck}
                onStage={handleStage}
                onApply={handleApply}
                onRequestDelete={setModPendingDelete}
                onSaveNotes={handleSaveNotes}
              />
            ))
          )}
        </div>
      </CardContent>

      <ModLibraryBrowseDialog
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        provider={browseProvider}
        minecraftVersion={minecraftVersion}
        isTracked={isTracked}
        onAdd={handleAddFromBrowse}
        onResolveUrl={handleResolveUrl}
      />

      <AlertDialog open={modPendingDelete !== null} onOpenChange={(open) => !open && setModPendingDelete(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400 font-minecraft">{t("modLibraryDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {modPendingDelete ? `${t("modLibraryDeleteConfirmDesc")} ${modPendingDelete.name}?` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-6 pb-2">
            <Switch checked={removeFromDiskOnDelete} onCheckedChange={setRemoveFromDiskOnDelete} />
            <span className="text-sm text-gray-300">{t("modLibraryRemoveFromDisk")}</span>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-700 hover:bg-red-800 text-white border-red-900/50 font-minecraft">
              {t("modLibraryDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
