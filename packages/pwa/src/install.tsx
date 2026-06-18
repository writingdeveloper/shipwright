"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * @repo/pwa — install-prompt glue. The browser fires `beforeinstallprompt` when
 * the app is installable; we capture it, suppress the default mini-infobar, and
 * expose a `promptInstall()` to trigger the native prompt from a button click.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Hook exposing install availability + a `promptInstall()` trigger. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | null
  > => {
    if (!deferred) return null;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canInstall: deferred !== null, installed, promptInstall };
}

/**
 * Minimal, dependency-free install button — renders nothing until the app is
 * installable. Apps that want their design-system button can use
 * {@link useInstallPrompt} directly instead.
 */
export function InstallButton({
  className,
  label = "Install app",
}: {
  className?: string;
  label?: string;
}) {
  const { canInstall, promptInstall } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button type="button" className={className} onClick={() => void promptInstall()}>
      {label}
    </button>
  );
}
