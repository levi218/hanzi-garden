import type { Metadata } from "next";

import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Your streak, your activity, and how much of HSK 1-3 you are actually holding on to — measured across every game on the site.";

export const metadata: Metadata = {
  title: "Progress",
  description: DESCRIPTION,
  ...pageMetadata({
    path: "/progress",
    title: "Progress · 汉字 Garden",
    description: DESCRIPTION,
  }),
};

export default function ProgressPage() {
  return (
    <main className="px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl pt-8">
        <ProgressDashboard variant="full" />
      </div>
    </main>
  );
}
