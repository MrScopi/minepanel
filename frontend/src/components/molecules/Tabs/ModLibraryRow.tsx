"use client";

import { FC, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { TrackedMod } from "@/services/mod-library/mod-library.service";

interface ModLibraryRowProps {
  mod: TrackedMod;
  disabled: boolean;
  actionId: string | null;
  onCheck: (mod: TrackedMod) => void;
  onStage: (mod: TrackedMod, versionId: string) => void;
  onApply: (mod: TrackedMod) => void;
  onRequestDelete: (mod: TrackedMod) => void;
  onSaveNotes: (mod: TrackedMod, notes: string, blockUpdate: boolean) => void;
}

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

export const ModLibraryRow: FC<ModLibraryRowProps> = ({ mod, disabled, actionId, onCheck, onStage, onApply, onRequestDelete, onSaveNotes }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(mod.notes ?? "");
  const [blockUpdateDraft, setBlockUpdateDraft] = useState(mod.blockUpdate ?? false);
  const [notesDirty, setNotesDirty] = useState(false);

  const isChecking = actionId === `check-${mod.id}`;
  const isStaging = actionId?.startsWith(`stage-${mod.id}`);
  const isApplying = actionId === `apply-${mod.id}`;
  const isDeleting = actionId === `delete-${mod.id}`;
  const isSavingNotes = actionId === `notes-${mod.id}`;
  const busy = disabled;

  const hasStaged = Boolean(mod.stagedFileName);
  const hasUpdateForCurrent = Boolean(mod.latestForCurrentMcVersion && mod.latestForCurrentMcVersion.versionId !== mod.installedVersionId);

  let statusLabel: string;
  let statusClass: string;
  if (mod.status === "missing") {
    statusLabel = t("modLibraryStatusMissing");
    statusClass = "border-red-500/40 bg-red-950/40 text-red-300";
  } else if (hasStaged) {
    statusLabel = t("modLibraryStatusStaged");
    statusClass = "border-amber-500/40 bg-amber-950/40 text-amber-300";
  } else if (hasUpdateForCurrent) {
    statusLabel = t("modLibraryStatusUpdateAvailable");
    statusClass = "border-cyan-500/40 bg-cyan-950/40 text-cyan-300";
  } else if (mod.installedVersionId) {
    statusLabel = t("modLibraryStatusUpToDate");
    statusClass = "border-emerald-500/40 bg-emerald-950/40 text-emerald-300";
  } else {
    statusLabel = t("modLibraryStatusStaged");
    statusClass = "border-gray-600 bg-gray-900/70 text-gray-300";
  }

  const handleSaveNotes = () => {
    onSaveNotes(mod, notesDraft, blockUpdateDraft);
    setNotesDirty(false);
  };

  return (
    <div className="rounded-xl border border-gray-700/70 bg-linear-to-br from-gray-900/65 to-slate-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors hover:border-emerald-500/25">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        {mod.iconUrl ? (
          <Image src={mod.iconUrl} alt={mod.name} width={40} height={40} className="h-10 w-10 rounded-lg object-cover shrink-0 ring-1 ring-slate-500/60" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-slate-700/60 shrink-0 flex items-center justify-center">
            <Package className="h-5 w-5 text-slate-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-100 truncate">{mod.name}</p>
            <Badge variant="outline" className="rounded-full border-cyan-500/40 bg-cyan-950/25 px-2 py-0.5 text-[10px] font-minecraft uppercase tracking-[0.12em] text-cyan-300">
              {mod.provider === "curseforge" ? "CurseForge" : "Modrinth"}
            </Badge>
            <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[10px] font-minecraft uppercase tracking-[0.12em] ${statusClass}`}>
              {statusLabel}
            </Badge>
            {mod.providerRemoved ? (
              <Badge variant="outline" className="rounded-full border-red-500/40 bg-red-950/30 px-2 py-0.5 text-[10px] text-red-300">
                <AlertTriangle className="h-3 w-3 mr-1 inline" />
                {t("modLibraryStatusMissing")}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>{t("modLibraryCurrentVersion")}: {mod.installedVersionNumber || "-"}</span>
            <span>{t("modLibraryUpdatedUpstream")}: {formatDate(mod.upstreamDateModified)}</span>
            <span>{t("modLibraryAddedOn")}: {formatDate(mod.installedAt)}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 mt-1" />}
      </button>

      {expanded ? (
        <div className="border-t border-gray-700/60 p-4 space-y-4">
          {mod.summary ? <p className="text-sm text-gray-300 leading-relaxed">{mod.summary}</p> : null}

          {mod.dependencies && mod.dependencies.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-gray-400">{t("modLibraryDependencies")}</p>
              <div className="flex flex-wrap gap-2">
                {mod.dependencies.map((dependency, index) => (
                  <Badge key={`${mod.id}-dep-${index}`} variant="outline" className="rounded-full border-gray-600/80 bg-gray-900/80 px-3 py-1 text-gray-200">
                    {dependency.name || dependency.slug || dependency.projectId || "?"} ({t(
                      dependency.dependencyType === "required"
                        ? "modLibraryDependencyRequired"
                        : dependency.dependencyType === "incompatible"
                          ? "modLibraryDependencyIncompatible"
                          : "modLibraryDependencyOptional",
                    )})
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-700/60 bg-gray-900/40 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">{t("modLibraryLatestForCurrent")}</p>
              {mod.latestForCurrentMcVersion ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-200">{mod.latestForCurrentMcVersion.versionNumber}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="minepanelOutline"
                    disabled={busy || mod.latestForCurrentMcVersion.versionId === mod.installedVersionId}
                    onClick={() => mod.latestForCurrentMcVersion && onStage(mod, mod.latestForCurrentMcVersion.versionId)}
                    className="font-minecraft text-xs"
                  >
                    {isStaging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">-</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-700/60 bg-gray-900/40 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">{t("modLibraryLatestForDesired")}</p>
              {mod.latestForDesiredMcVersion ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-200">{mod.latestForDesiredMcVersion.versionNumber}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="minepanelOutline"
                    disabled={busy || mod.latestForDesiredMcVersion.versionId === mod.installedVersionId}
                    onClick={() => mod.latestForDesiredMcVersion && onStage(mod, mod.latestForDesiredMcVersion.versionId)}
                    className="font-minecraft text-xs"
                  >
                    {isStaging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">-</p>
              )}
            </div>
          </div>

          {mod.stagedChangelog ? (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-gray-400">{t("modLibraryChangelog")}</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-700/60 bg-gray-950/60 p-3 text-xs text-gray-300">
                {mod.stagedChangelog}
              </pre>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-400">{t("modLibraryNotes")}</p>
            <Textarea
              value={notesDraft}
              onChange={(e) => {
                setNotesDraft(e.target.value);
                setNotesDirty(true);
              }}
              placeholder={t("modLibraryNotesPlaceholder")}
              className="min-h-16"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={blockUpdateDraft}
                  onCheckedChange={(checked) => {
                    setBlockUpdateDraft(checked);
                    setNotesDirty(true);
                  }}
                />
                <span className="text-sm text-gray-300">{t("modLibraryBlockUpdate")}</span>
              </div>
              <Button type="button" size="sm" variant="minepanelOutline" disabled={!notesDirty || isSavingNotes} onClick={handleSaveNotes} className="font-minecraft text-xs">
                {isSavingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("modLibrarySaveNotes")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-700/60 pt-3">
            <Button type="button" variant="minepanelOutline" onClick={() => onCheck(mod)} disabled={busy || isChecking} className="font-minecraft text-xs">
              {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t("modLibraryCheckOne")}
            </Button>
            <Button type="button" variant="minepanel" onClick={() => onApply(mod)} disabled={busy || !hasStaged || isApplying} className="font-minecraft text-xs">
              {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {t("modLibraryApply")}
            </Button>
            <Button type="button" variant="minepanelDanger" onClick={() => onRequestDelete(mod)} disabled={busy || isDeleting} className="font-minecraft text-xs">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t("modLibraryDelete")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
