import type { ReactNode } from "react";
import { uiText } from "../../i18n/uiText";
import { ResizableThreadSidebar as SharedThreadSidebar } from "../../../../../shared/chat/ResizableThreadSidebar";
import styles from "./styles.module.less";

export function ResizableThreadSidebar({ children, className = "", layoutSelector = `.${styles.page}` }: {
  children: ReactNode; className?: string; layoutSelector?: string;
}) {
  return <SharedThreadSidebar className={`${styles.sidebar} ${className}`} layoutSelector={layoutSelector}
    resizeLabel={uiText("client.chat.resizeChatList")}>
    {children}
  </SharedThreadSidebar>;
}
