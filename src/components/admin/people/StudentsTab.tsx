"use client";

import React from "react";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StudentDirectory } from "@/components/kam/students/StudentDirectory";

export const StudentsTab: React.FC = () => {
  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={GraduationCap}
        title="Student Directory"
      />

      <StudentDirectory />
    </div>
  );
};

