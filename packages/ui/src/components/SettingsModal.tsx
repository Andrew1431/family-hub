import type { ReactNode } from "react";
import { Modal } from "@hub/components";

/**
 * Settings dialog chrome — a thin skin over the shared Modal so every module's
 * settings pane gets identical framing without touching portals or backdrops.
 */
export function SettingsModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal title={title} subtitle="Settings" onClose={onClose}>
      {children}
    </Modal>
  );
}
