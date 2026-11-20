"use client";

import { PostDetail } from "./post-detail";
import { PostForm } from "./post-form";
import { WithRoutePost } from "./post-loader";

export const RoutePostDetail = () => (
  <WithRoutePost render={(post) => <PostDetail post={post} />} />
);

export const RoutePostEditForm = () => (
  // Remount when the post changes so a preserved form never shows stale values.
  <WithRoutePost
    render={(post) => (
      <PostForm key={`${post.id}-${post.updatedAt}`} post={post} />
    )}
  />
);
