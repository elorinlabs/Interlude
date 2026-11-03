import { uiText } from "../../i18n/uiText";
import { FileSearch } from "lucide-react";
import { MessageLink } from "./MessageLink";
import type { ReviewComment } from "./messageDirectives";
import styles from "./CodeReviewComment.module.less";

export function CodeReviewComment({ comment }: { comment: ReviewComment }) {
  const location = comment.start ? `${comment.file}:${comment.start}` : comment.file;
  const end = comment.end && comment.start && comment.end > comment.start ? `–${comment.end}` : "";
  return <aside className={styles.comment} aria-label={uiText("client.mobile.codeReviewComments")}>
    <strong><FileSearch size={16} />{comment.title}</strong>
    <p>{comment.body}</p>
    <MessageLink href={location}>{comment.file}
      {comment.start ? uiText("client.mobile.lines", { value1: comment.start, value2: end }) : ""}
    </MessageLink>
  </aside>;
}
