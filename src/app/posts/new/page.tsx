import { PostForm } from "@/components/post-form";
import { BackLink } from "@/components/ui";

export const metadata = { title: "New post" };

export default function NewPostPage() {
  return (
    <div className="space-y-6">
      <BackLink href="/">All posts</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">New post</h1>
      <PostForm />
    </div>
  );
}
