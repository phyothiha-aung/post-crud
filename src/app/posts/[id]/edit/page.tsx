import { Suspense } from "react";
import { RoutePostEditForm } from "@/components/post-pages";
import { BackLink, Skeleton } from "@/components/ui";

export const metadata = { title: "Edit post" };

export default function EditPostPage() {
  return (
    <div className="space-y-6">
      <BackLink href="/">All posts</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">Edit post</h1>
      <Suspense fallback={<Skeleton rows={1} />}>
        <RoutePostEditForm />
      </Suspense>
    </div>
  );
}
