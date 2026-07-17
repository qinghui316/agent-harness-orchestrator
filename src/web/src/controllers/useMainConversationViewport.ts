import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from "react";
import type { CanonicalTimelineMutation } from "../canonicalTimelineStore.js";

const BOTTOM_PIN_THRESHOLD = 140;
const LOAD_EARLIER_THRESHOLD = 260;

type ScrollAnchor = {
  scrollHeight: number;
  scrollTop: number;
  generation: number;
};

export interface MainConversationViewportInput {
  scopeKey: string | null;
  mutation: CanonicalTimelineMutation | null;
  hasMoreBefore: boolean;
  loadingEarlier: boolean;
  loadEarlier: () => Promise<void>;
}

export interface MainConversationViewportController {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showLatest: boolean;
  onUserScroll: (event: UIEvent<HTMLDivElement>) => void;
  scrollToLatest: () => void;
}

export function useMainConversationViewport({
  scopeKey,
  mutation,
  hasMoreBefore,
  loadingEarlier,
  loadEarlier,
}: MainConversationViewportInput): MainConversationViewportController {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const handledMutationRef = useRef<string | null>(null);
  const loadEarlierRef = useRef(loadEarlier);
  const loadInFlightRef = useRef(false);
  const loadTokenRef = useRef(0);
  const generationRef = useRef(0);
  const scheduledFramesRef = useRef(new Set<number>());
  const [showLatest, setShowLatest] = useState(false);

  loadEarlierRef.current = loadEarlier;

  const scheduleFrame = useCallback((callback: () => void): void => {
    const frame = requestAnimationFrame(() => {
      scheduledFramesRef.current.delete(frame);
      callback();
    });
    scheduledFramesRef.current.add(frame);
  }, []);

  const preservePrependAnchor = useCallback((anchor: ScrollAnchor): void => {
    scheduleFrame(() => {
      if (anchor.generation !== generationRef.current) return;
      const node = scrollContainerRef.current;
      if (!node) return;
      node.scrollTop = anchor.scrollTop + Math.max(0, node.scrollHeight - anchor.scrollHeight);
    });
  }, [scheduleFrame]);

  const requestEarlier = useCallback((node: HTMLDivElement): void => {
    if (!hasMoreBefore || loadingEarlier || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const loadToken = ++loadTokenRef.current;
    const anchor: ScrollAnchor = {
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
      generation: generationRef.current,
    };
    void Promise.resolve()
      .then(() => loadEarlierRef.current())
      .then(
        () => {
          if (loadToken !== loadTokenRef.current) return;
          loadInFlightRef.current = false;
          preservePrependAnchor(anchor);
        },
        () => {
          if (loadToken === loadTokenRef.current) loadInFlightRef.current = false;
        },
      );
  }, [hasMoreBefore, loadingEarlier, preservePrependAnchor]);

  const onUserScroll = useCallback((event: UIEvent<HTMLDivElement>): void => {
    const node = event.currentTarget;
    const pinned = node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_PIN_THRESHOLD;
    pinnedRef.current = pinned;
    setShowLatest(!pinned);
    if (node.scrollTop <= LOAD_EARLIER_THRESHOLD) requestEarlier(node);
  }, [requestEarlier]);

  const scrollToLatest = useCallback((): void => {
    pinnedRef.current = true;
    const node = scrollContainerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
    setShowLatest(false);
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    pinnedRef.current = true;
    handledMutationRef.current = null;
    loadTokenRef.current += 1;
    loadInFlightRef.current = false;
    setShowLatest(false);
  }, [scopeKey]);

  useEffect(() => {
    if (!mutation || mutation.scopeKey !== scopeKey) return;
    const mutationKey = `${mutation.scopeKey}:${mutation.revision}:${mutation.kind}:${mutation.addedMessageIds.join(",")}:${mutation.updatedMessageIds.join(",")}:${mutation.removedMessageIds.join(",")}`;
    if (handledMutationRef.current === mutationKey) return;
    handledMutationRef.current = mutationKey;

    if (mutation.kind === "reset") {
      generationRef.current += 1;
      pinnedRef.current = true;
      loadTokenRef.current += 1;
      loadInFlightRef.current = false;
      setShowLatest(false);
      return;
    }

    if (!pinnedRef.current || (mutation.kind !== "append-tail" && mutation.kind !== "replace-tail-growth")) return;
    const generation = generationRef.current;
    scheduleFrame(() => {
      if (generation !== generationRef.current || !pinnedRef.current) return;
      const node = scrollContainerRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
      setShowLatest(false);
    });
  }, [mutation, scheduleFrame, scopeKey]);

  useEffect(() => () => {
    for (const frame of scheduledFramesRef.current) cancelAnimationFrame(frame);
    scheduledFramesRef.current.clear();
  }, []);

  return {
    scrollContainerRef,
    showLatest,
    onUserScroll,
    scrollToLatest,
  };
}
