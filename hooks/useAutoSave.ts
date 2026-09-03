"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_SAVE_CHECK_MS,
  AUTO_SAVE_INTERVAL_MS,
  formatAutoSavedAt,
} from "@/lib/autoSave";

type AutoSaveOptions = {
  /** false면 자동저장 비활성 (신규 작성·미선택 등) */
  enabled: boolean;
  /** 수동 저장 중이면 건너뜀 */
  saving?: boolean;
  /**
   * 자동 저장 실행. false/ throw 시 실패로 표시.
   * 성공 시 true 또는 void.
   */
  onSave: () => boolean | void | Promise<boolean | void>;
};

/**
 * 변경 후 5분이 지나면 자동 저장.
 * 폼 onChange/onInput에서 markDirty()를 호출하면 된다.
 */
export function useAutoSave({ enabled, saving = false, onSave }: AutoSaveOptions) {
  const dirtyRef = useRef(false);
  const dirtySinceRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const savingRef = useRef(saving);
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  onSaveRef.current = onSave;
  savingRef.current = saving;

  const markDirty = useCallback(() => {
    if (!enabled) return;
    if (!dirtyRef.current) dirtySinceRef.current = Date.now();
    dirtyRef.current = true;
    setAutoSaveLabel("변경됨 · 5분 후 자동 저장");
  }, [enabled]);

  const markClean = useCallback((opts?: { message?: string }) => {
    dirtyRef.current = false;
    dirtySinceRef.current = null;
    if (opts?.message) setAutoSaveLabel(opts.message);
  }, []);

  useEffect(() => {
    if (!enabled) {
      dirtyRef.current = false;
      dirtySinceRef.current = null;
      setAutoSaveLabel(null);
      setAutoSaving(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const tick = window.setInterval(async () => {
      if (!dirtyRef.current || dirtySinceRef.current == null) return;
      if (savingRef.current || autoSaving) return;
      if (Date.now() - dirtySinceRef.current < AUTO_SAVE_INTERVAL_MS) return;

      setAutoSaving(true);
      setAutoSaveLabel("자동 저장 중…");
      try {
        const result = await onSaveRef.current();
        if (result === false) {
          setAutoSaveLabel("자동 저장 실패 · 다시 시도합니다");
          // keep dirty so it retries after another interval from now
          dirtySinceRef.current = Date.now();
          return;
        }
        dirtyRef.current = false;
        dirtySinceRef.current = null;
        setAutoSaveLabel(`자동 저장됨 ${formatAutoSavedAt(Date.now())}`);
      } catch {
        setAutoSaveLabel("자동 저장 실패 · 다시 시도합니다");
        dirtySinceRef.current = Date.now();
      } finally {
        setAutoSaving(false);
      }
    }, AUTO_SAVE_CHECK_MS);

    return () => window.clearInterval(tick);
  }, [enabled, autoSaving]);

  return { markDirty, markClean, autoSaveLabel, autoSaving };
}
