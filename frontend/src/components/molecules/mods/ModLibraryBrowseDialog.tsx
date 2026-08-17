"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Search, Loader2, Plus, Filter, Link2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/hooks/useLanguage";
import { mcToast } from "@/lib/utils/minecraft-toast";
import { ModProvider, ModSearchItem, searchModsByProvider } from "@/services/mods/mods-browser.service";
import { ResolvedModPreview } from "@/services/mod-library/mod-library.service";

type BrowsableMod = ModSearchItem | ResolvedModPreview;

interface ModLibraryBrowseDialogProps {
  open: boolean;
  onClose: () => void;
  provider: ModProvider;
  minecraftVersion: string;
  isTracked: (mod: BrowsableMod) => boolean;
  onAdd: (mod: BrowsableMod) => Promise<void>;
  onResolveUrl: (url: string) => Promise<ResolvedModPreview>;
}

const SEARCH_PAGE_SIZE = 6;

const formatDownloads = (count?: number): string => {
  if (!count) return "";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return `${count}`;
};

export function ModLibraryBrowseDialog({
  open,
  onClose,
  provider,
  minecraftVersion,
  isTracked,
  onAdd,
  onResolveUrl,
}: Readonly<ModLibraryBrowseDialogProps>) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<ModSearchItem[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedMod, setResolvedMod] = useState<ResolvedModPreview | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pageSize = SEARCH_PAGE_SIZE;

  const providerLabel = useMemo(() => (provider === "curseforge" ? "CurseForge" : "Modrinth"), [provider]);

  const fetchPage = useCallback(
    async (nextPageIndex: number, reset: boolean = false) => {
      if (!open || !minecraftVersion) return;

      if (reset) {
        setIsLoadingInitial(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await searchModsByProvider(provider, {
          q: query.trim() || undefined,
          minecraftVersion,
          pageSize,
          index: nextPageIndex * pageSize,
          limit: pageSize,
          offset: nextPageIndex * pageSize,
        });

        setResults((prev) => {
          const incoming = response.data;
          if (reset) return incoming;

          const seen = new Set(prev.map((item) => `${item.provider}:${item.projectId}`));
          const merged = [...prev];
          for (const item of incoming) {
            const key = `${item.provider}:${item.projectId}`;
            if (!seen.has(key)) {
              merged.push(item);
              seen.add(key);
            }
          }
          return merged;
        });

        const newCount = response.data.length;
        const fetchedSoFar = (nextPageIndex + 1) * pageSize;
        const more = newCount > 0 && fetchedSoFar < response.pagination.totalCount;
        setHasMore(more);
        setPageIndex(nextPageIndex);
      } catch (error) {
        console.error("Error searching mods:", error);
        mcToast.error(t("modLibraryErrorSearch"));
      } finally {
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
      }
    },
    [open, minecraftVersion, provider, query, pageSize, t],
  );

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      setPageIndex(0);
      setHasMore(true);
      fetchPage(0, true);
    }, 350);

    return () => clearTimeout(timeout);
  }, [open, query, provider, minecraftVersion, fetchPage]);

  useEffect(() => {
    if (!open) {
      setUrlInput("");
      setResolvedMod(null);
    }
  }, [open]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !open || !hasMore || isLoadingInitial || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasMore && !isLoadingMore) {
          void fetchPage(pageIndex + 1, false);
        }
      },
      { root: null, rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [open, hasMore, isLoadingInitial, isLoadingMore, pageIndex, fetchPage]);

  const handleResolveUrl = async () => {
    if (!urlInput.trim()) return;
    setResolving(true);
    try {
      const mod = await onResolveUrl(urlInput.trim());
      setResolvedMod(mod);
    } catch (error) {
      console.error("Error resolving mod URL:", error);
      mcToast.error(t("modLibraryErrorResolveUrl"));
      setResolvedMod(null);
    } finally {
      setResolving(false);
    }
  };

  const handleAdd = async (mod: BrowsableMod) => {
    const key = `${mod.provider}:${mod.projectId}`;
    setAddingKey(key);
    try {
      await onAdd(mod);
      mcToast.success(`${t("modLibraryAddToLibrary")}: ${mod.name}`);
    } catch (error) {
      console.error("Error adding tracked mod:", error);
      mcToast.error(t("modLibraryErrorSearch"));
    } finally {
      setAddingKey(null);
    }
  };

  const renderCard = (mod: BrowsableMod) => {
    const key = `${mod.provider}:${mod.projectId}`;
    const tracked = isTracked(mod);
    const downloads = "downloads" in mod ? formatDownloads(mod.downloads) : "";

    return (
      <div
        key={key}
        className="rounded-xl border border-slate-600/60 bg-linear-to-b from-slate-800/60 to-slate-900/60 p-4 min-h-56 flex flex-col"
      >
        <div className="flex gap-3 items-start">
          {mod.iconUrl ? (
            <Image src={mod.iconUrl} alt={mod.name} width={52} height={52} className="rounded-lg h-12 w-12 object-cover shrink-0 ring-1 ring-slate-500/60" />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-slate-700/60 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-minecraft text-base text-white truncate">{mod.name}</h4>
            <p className="text-sm text-slate-300/90 line-clamp-3 mt-1 leading-relaxed min-h-18">{mod.summary || "-"}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {downloads ? (
            <Badge variant="secondary" className="text-xs bg-blue-900/40 text-blue-300">
              {downloads}
            </Badge>
          ) : null}
          {(mod.supportedLoaders || []).slice(0, 3).map((modLoader) => (
            <Badge key={`${key}-${modLoader}`} variant="secondary" className="text-xs bg-emerald-900/40 text-emerald-300">
              {modLoader}
            </Badge>
          ))}
        </div>
        <div className="mt-auto pt-4">
          {tracked ? (
            <Button type="button" size="sm" disabled className="w-full bg-slate-700 text-slate-300">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {t("modLibraryAlreadyTracked")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => handleAdd(mod)}
              disabled={addingKey === key}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {addingKey === key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t("modLibraryAddToLibrary")}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] max-h-[85vh] overflow-hidden bg-gray-900 border border-gray-700 text-white p-0 flex flex-col">
        <div className="shrink-0 border-b border-gray-700 bg-gray-900 px-6 py-4 space-y-3">
          <DialogTitle className="text-xl font-minecraft text-emerald-400 flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t("modLibraryBrowseMods")} - {providerLabel}
          </DialogTitle>
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("modLibraryBrowseMods")}
              className="h-12 text-lg pl-11 bg-gray-800 border-gray-600/80 text-white font-minecraft tracking-wide focus:border-emerald-500/60"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleResolveUrl()}
                placeholder={t("modLibraryPasteLink")}
                className="h-10 pl-9 bg-gray-800 border-gray-600/80 text-gray-200"
              />
            </div>
            <Button type="button" variant="minepanelOutline" onClick={handleResolveUrl} disabled={resolving || !urlInput.trim()} className="h-10">
              {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-300">
            <Filter className="h-3.5 w-3.5" />
            {t("compatibilityFiltered")} {minecraftVersion}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {resolvedMod ? (
            <div className="mb-6">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">{t("modLibraryPasteLink")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{renderCard(resolvedMod)}</div>
            </div>
          ) : null}

          {isLoadingInitial ? (
            <div className="flex flex-col items-center justify-center py-14">
              <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
              <p className="text-sm text-gray-400 mt-2">{t("loading")}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <Image src="/images/barrier.webp" alt="No results" width={50} height={50} className="opacity-60 mb-4" />
              <p className="font-minecraft text-sm">{t("noCompatibleModsFound")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((mod) => renderCard(mod))}
              <div ref={loadMoreRef} className="h-10 col-span-full flex items-center justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-2 text-slate-300 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("loading")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
