import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VonosMaintenanceLanding } from "@/components/pages/VonosMaintenanceLanding";

export const metadata: Metadata = {
  title: "Vonos Group",
  description:
    "We are working on a new and improved experience for our customers.",
};

const appBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .trim()
  .replace(/\/+$/, "");

function opsEntryRedirect() {
  const skipAuth =
    process.env.NEXT_PUBLIC_SKIP_AUTH === "true" ||
    (process.env.NEXT_PUBLIC_SKIP_AUTH !== "false" &&
      process.env.NODE_ENV === "development");
  redirect(skipAuth ? "/VW/overview" : "/login");
}

/**
 * - No basePath: this is apex `/` → maintenance landing.
 * - basePath=/operations: this URL is `/operations` → ops entry (login), never maintenance.
 */
export default function RootPage() {
  if (appBasePath === "/operations") {
    opsEntryRedirect();
  }
  return <VonosMaintenanceLanding />;
}
