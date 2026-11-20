import { Suspense } from "react";
import { PostList } from "@/components/post-list";
import { ButtonLink, Skeleton } from "@/components/ui";

export default function Home() {
  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
        <ButtonLink href="/posts/new">+ New post</ButtonLink>
      </div>
      <Suspense fallback={<Skeleton />}>
        <PostList />
      </Suspense>
    </>
  );
}
