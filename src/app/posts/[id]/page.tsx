import { Suspense } from "react";
import { RoutePostDetail } from "@/components/post-pages";
import { BackLink, Skeleton } from "@/components/ui";

export default function PostPage() {
  return (
    <div className="space-y-6">
      <BackLink href="/">All posts</BackLink>
      <Suspense fallback={<Skeleton rows={1} />}>
        <RoutePostDetail />
      </Suspense>
    </div>
  );
}
