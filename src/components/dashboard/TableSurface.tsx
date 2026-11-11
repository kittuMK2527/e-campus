"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Table } from "@/components/ui/table";

export interface TableSurfaceProps {
  children: React.ReactNode;
  /** Rendered below the scroll container, so pagination never scrolls with the table. */
  footer?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  tableClassName?: string;
  stickyHeader?: boolean;
}

export function TableSurface({
  children,
  footer,
  className,
  containerClassName,
  tableClassName,
  stickyHeader = false,
}: TableSurfaceProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card dark:border-slate-800/80 dark:bg-[#131317]",
        className
      )}
    >
      <Table
        containerClassName={cn("overflow-x-auto", containerClassName)}
        className={cn(
          stickyHeader &&
            "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-sunken dark:[&_thead]:bg-[#181820]",
          tableClassName
        )}
      >
        {children}
      </Table>
      {footer}
    </div>
  );
}
