"use client";

import React, { useState } from "react";
import { Megaphone, Plus, Trash2, Loader2, Copy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { formatDate } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";
import { College, useApp } from "@/context/AppContext";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { AnnouncementDialog } from "@/components/admin/dialogs/AnnouncementDialog";
import { AnnouncementFormState } from "@/components/admin/types";
import { useToast } from "@/context/ToastContext";

export interface Announcement {
  id: string;
  title: string;
  description: string;
  target_role: string;
  college_id?: string;
  created_at: string;
}

export interface AnnouncementsTabProps {
  announcements?: Announcement[];
  isLoading?: boolean;
  colleges?: College[];
  onOpenCompose?: () => void;
  onDeleteAnnouncement?: (id: string) => Promise<void>;
  loadingActions?: Record<string, boolean>;
}

export const AnnouncementsTab: React.FC<AnnouncementsTabProps> = ({
  announcements: propAnnouncements,
  isLoading: propIsLoading,
  colleges: propColleges,
  onOpenCompose: propOnOpenCompose,
  onDeleteAnnouncement: propOnDeleteAnnouncement,
  loadingActions: propLoadingActions
}) => {
  const app = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const colleges = propColleges ?? app.colleges ?? [];

  const annQuery = useQuery({
    queryKey: qk.announcements("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/announcements");
      return (data?.announcements || []) as Announcement[];
    },
    enabled: !propAnnouncements
  });

  const announcements = propAnnouncements ?? annQuery.data ?? [];
  const isLoading = propIsLoading ?? annQuery.isLoading;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localLoading, setLocalLoading] = useState<Record<string, boolean>>({});
  const loadingActions = propLoadingActions ?? localLoading;

  const [form, setForm] = useState<AnnouncementFormState>({
    title: "",
    description: "",
    target_role: "all",
    college_id: ""
  });

  const handleOpenCompose = () => {
    if (propOnOpenCompose) {
      propOnOpenCompose();
    } else {
      setForm({
        title: "",
        description: "",
        target_role: "all",
        college_id: ""
      });
      setDialogOpen(true);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description) {
      toast("Please fill in title and description.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        toast("Announcement published successfully.", "success");
        setDialogOpen(false);
        annQuery.refetch();
        app.notifyDataChanged("announcements");
      } else {
        toast(data.message || "Failed to publish announcement.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error creating announcement.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (propOnDeleteAnnouncement) return propOnDeleteAnnouncement(id);
    const ok = await showConfirm({
      message: "Delete this announcement? Everyone who can see it will lose access.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`announcement_${id}`]: true }));
    try {
      const res = await fetch(`/api/announcements?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast("Announcement deleted successfully.", "success");
        annQuery.refetch();
        app.notifyDataChanged("announcements");
      } else {
        toast(data.message || "Failed to delete announcement.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error deleting announcement.", "error");
    } finally {
      setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`announcement_${id}`]: false }));
    }
  };
  const pagination = usePagination(announcements, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50]
  });

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Megaphone}
        title="Campus Announcements"
        actions={
          <Button
            variant="ghost"
            onClick={handleOpenCompose}
            className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Compose Announcement
          </Button>
        }
      />

      {isLoading && announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          <p className="text-sm font-semibold">Loading announcements…</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
          <Megaphone className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">No announcements published yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pagination.pageItems.map((ann) => {
              const targetCampus = colleges.find(c => c.id === ann.college_id)?.name || "All Campuses";
              return (
                <div
                  key={ann.id}
                  className="p-5 bg-white border border-slate-100 rounded-2xl shadow-card hover:shadow-card-lg hover:border-indigo-100 transition-all relative flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="text-sm font-bold text-gray-900 leading-snug">{ann.title}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <ActionDropdownButton size="sm" title="Announcement Options" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Announcement</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(`${ann.title}\n\n${ann.description}`);
                              toast("Announcement text copied to clipboard!", "success");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                            Copy Text
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                            onClick={() => handleDeleteAnnouncement(ann.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-xs text-gray-600 font-semibold leading-relaxed whitespace-pre-line">{ann.description}</p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap justify-between items-center text-[10px] text-gray-500 gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-pink-50 border border-pink-100 text-pink-700 font-bold">
                        Role: {ann.target_role}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold">
                        Campus: {targetCampus}
                      </span>
                    </div>
                    <span className="font-semibold">{formatDate(ann.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            className="rounded-xl border border-gray-200"
            ariaLabel="Announcements pagination"
            currentPage={pagination.page}
            totalItems={announcements.length}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
          />
        </>
      )}

      {dialogOpen && (
        <AnnouncementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          onFormChange={setForm}
          onSubmit={handleCreateAnnouncement}
          colleges={colleges}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
};
