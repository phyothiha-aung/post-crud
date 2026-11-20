"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getPost, type ApiError, type Post } from "@/lib/api";
import { Message, Skeleton } from "./ui";

type State = { id: string; post?: Post; error?: string };

/** Loads the post for the current `[id]` route. */
function useRoutePost() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPost(id)
      .then((post) => !cancelled && setState({ id, post }))
      .catch(
        (e: ApiError) =>
          !cancelled &&
          setState({
            id,
            error:
              e.status === 404 || e.status === 400
                ? "Post not found."
                : e.message,
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state?.id === id ? state : null;
}

/** Client-side wrapper: shows a skeleton / error, then renders `render(post)`. */
export function WithRoutePost({
  render,
}: {
  render: (post: Post) => React.ReactNode;
}) {
  const state = useRoutePost();
  if (!state) return <Skeleton rows={1} />;
  if (state.error) return <Message tone="error">{state.error}</Message>;
  return render(state.post!);
}
