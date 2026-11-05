import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import styles from "../feedback.module.css";

export default function SuccessNotice({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.notice} role="status" aria-atomic="true"><CheckCircle2 size={21} aria-hidden="true" /><div><strong>{title}</strong>{children}</div></div>;
}
