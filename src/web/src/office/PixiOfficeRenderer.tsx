import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from "react";
import type { AnimatedSprite, Application, Container, Graphics } from "pixi.js";
import { ChoreographyEngine } from "./choreographyEngine.js";
import { OfficeDirector } from "./officeDirector.js";
import { OfficeRuntimeAssets, type OfficeScreenProfile, type ParsedOfficeAtlas } from "./officeRuntimeAssets.js";
import type { OfficeAtlasHandle } from "./officeAssetLoader.js";
import { addCalibratedShadow, addOfficeActorLabel, createCalibratedWorkstationLayers, drawCalibratedChair } from "./officePixiComposition.js";
import { type OfficeActor, type OfficeActorStatus, type OfficeSceneModel, type OfficeSceneStation } from "./officeScene.js";
import { OFFICE_RUNTIME_CALIBRATION } from "./officeRuntimeCalibration.generated.js";
import { officeActorStatusLocalPosition } from "./officeActorLabel.js";
import { OfficeLoadingScreen } from "./OfficeLoadingScreen.js";
import { removeOfficeTickerIfCurrent } from "./officeRendererLifecycle.js";
import { commitLatestOfficeRender } from "./officeRenderGeneration.js";
import { officeRouteFrameAt } from "./officeRouteInterpolation.js";
import { officeActionPlaybackRate, officeActorOffsetForAction, officeActorScaleForAction, type OfficeActionId, type OfficePoint } from "./officeSceneCalibration.js";

type PixiModule = typeof import("pixi.js");
type Camera = { x: number; y: number; zoom: number };
type RendererState = "loading" | "ready" | "fallback";
type ActorVisual = {
  actor: OfficeActor;
  actionId: OfficeActionId;
  group: Container;
  sprite: AnimatedSprite;
  statusIndicator: Graphics;
  actionHandle: OfficeAtlasHandle<ParsedOfficeAtlas>;
};
type StationVisual = {
  station: OfficeSceneStation;
  screen: AnimatedSprite;
  screenHandle: OfficeAtlasHandle<ParsedOfficeAtlas>;
  screenProfile: OfficeScreenProfile;
  screenWidth: number;
  screenHeight: number;
};
type StaticWorld = {
  root: Container;
  personLayer: Container;
  effectLayer: Container;
  stations: Map<string, StationVisual>;
  propsHandle: OfficeAtlasHandle<ParsedOfficeAtlas>;
  coffeeEffectHandle: OfficeAtlasHandle<ParsedOfficeAtlas>;
  coffeeEffect: AnimatedSprite;
  coffeeEffectOwner: string | null;
};
type LoaderVisual = { container: Container; handle: OfficeAtlasHandle<ParsedOfficeAtlas> };

const STATUS_COLORS: Record<OfficeActorStatus, number> = {
  idle: 0x8a8f98,
  queued: 0x7a667f,
  working: 0x3b6ea8,
  completed: 0x2f7d68,
  blocked: 0xb8872f,
  failed: 0xb84b45,
  attention: 0xc9823c,
  interrupted: 0x747981,
};

export function PixiOfficeRenderer({ scene, selectedActorId, onSelectActor, onViewportInteraction }: {
  scene: OfficeSceneModel;
  selectedActorId: string | null;
  onSelectActor: (actorId: string, anchor: { x: number; y: number }) => void;
  onViewportInteraction?: () => void;
}): ReactElement {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const pixiRef = useRef<PixiModule | null>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const worldRef = useRef<StaticWorld | null>(null);
  const actorsRef = useRef(new Map<string, ActorVisual>());
  const assetsRef = useRef<OfficeRuntimeAssets | null>(null);
  const engineRef = useRef(new ChoreographyEngine());
  const directorRef = useRef(new OfficeDirector(engineRef.current));
  const hydratedContextRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const tickerRef = useRef<((ticker: { lastTime: number }) => void) | null>(null);
  const reducedMotionRef = useRef(false);
  const [rendererState, setRendererState] = useState<RendererState>("loading");
  const [loadProgress, setLoadProgress] = useState(10);
  const [retryVersion, setRetryVersion] = useState(0);
  const [camera, setCamera] = useState<Camera>({ x: 24, y: 24, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, cameraX: 0, cameraY: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number; centerX: number; centerY: number; cameraX: number; cameraY: number } | null>(null);
  const cameraTouchedRef = useRef(false);
  const firstRenderCompleteRef = useRef(false);
  const loadingFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadingVisible, setLoadingVisible] = useState(true);
  reducedMotionRef.current = reducedMotion;

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const zoom = clamp(Math.min((viewport.clientWidth - 48) / scene.width, (viewport.clientHeight - 48) / scene.height), 0.28, 1.35);
    setCamera({ zoom, x: Math.round((viewport.clientWidth - scene.width * zoom) / 2), y: Math.round((viewport.clientHeight - scene.height * zoom) / 2) });
  }, [scene.height, scene.width]);

  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    if (globalThis.navigator?.userAgent.includes("jsdom")) {
      setRendererState("fallback");
      return;
    }
    let disposed = false;
    let canvas: HTMLCanvasElement | null = null;
    setRendererState("loading");
    firstRenderCompleteRef.current = false;
    setLoadingVisible(true);
    setLoadProgress(24);
    void import("pixi.js").then(async (pixi) => {
      const app = new pixi.Application();
      await app.init({ background: "#faf9f7", antialias: true, autoDensity: true, resolution: Math.min(2, globalThis.devicePixelRatio || 1), resizeTo: host, preference: "webgl" });
      if (disposed) return app.destroy(true, { children: true });
      const root = new pixi.Container();
      app.stage.addChild(root);
      host.replaceChildren(app.canvas);
      canvas = app.canvas;
      const onLost = (event: Event) => { event.preventDefault(); setRendererState("fallback"); };
      canvas.addEventListener("webglcontextlost", onLost);
      appRef.current = app;
      pixiRef.current = pixi;
      sceneRootRef.current = root;
      assetsRef.current = new OfficeRuntimeAssets(pixi, chooseResolution(host));
      setLoadProgress(40);
      setRendererState("ready");
      return () => canvas?.removeEventListener("webglcontextlost", onLost);
    }).catch(() => { if (!disposed) setRendererState("fallback"); });
    return () => {
      disposed = true;
      if (loadingFadeTimerRef.current) globalThis.clearTimeout(loadingFadeTimerRef.current);
      generationRef.current += 1;
      engineRef.current.resetScope();
      hydratedContextRef.current = null;
      destroyActors(actorsRef.current);
      actorsRef.current.clear();
      destroyStaticWorld(worldRef.current);
      worldRef.current = null;
      assetsRef.current?.dispose();
      assetsRef.current = null;
      const app = appRef.current;
      if (app && tickerRef.current) app.ticker.remove(tickerRef.current);
      appRef.current = null;
      pixiRef.current = null;
      sceneRootRef.current = null;
      tickerRef.current = null;
      app?.destroy(false, { children: true });
      host.replaceChildren();
      canvas = null;
    };
  }, [retryVersion]);

  useEffect(() => engineRef.current.subscribe((command, signal) => {
    const pixi = pixiRef.current;
    const assets = assetsRef.current;
    const world = worldRef.current;
    if (!pixi || !assets || !world) return;
    if (command.kind === "playAction") return applyAction(assets, actorsRef.current, command, signal, reducedMotionRef.current);
    if (command.kind === "followRoute") return followRoute(actorsRef.current.get(command.participantId)?.group, command.points, command.durationMs, signal, reducedMotionRef.current);
    if (command.kind === "setScreen") return setOfficeStationScreen(assets, world.stations.get(command.stationId), command.profile, signal, command.phase, reducedMotionRef.current);
    if (command.kind === "setEffect") return setActorEffect(command.participantId, actorsRef.current.get(command.participantId), world, command.effect, reducedMotionRef.current);
    const visual = actorsRef.current.get(command.participantId);
    if (visual) visual.group.visible = command.kind === "showParticipant";
  }), []);

  useEffect(() => {
    if (rendererState !== "ready" || !pixiRef.current || !sceneRootRef.current || !assetsRef.current) return;
    let cancelled = false;
    const generation = ++generationRef.current;
    const prepare = async () => {
      let world = worldRef.current;
      if (!world) {
        const loader = await createLoaderVisual(pixiRef.current!, assetsRef.current!, reducedMotion).catch(() => null);
        if (loader) sceneRootRef.current!.addChild(loader.container);
        if (!firstRenderCompleteRef.current) setLoadProgress(55);
        try {
          world = await buildStaticWorld(pixiRef.current!, assetsRef.current!, scene, reducedMotion);
        } finally {
          if (loader) {
            loader.container.removeFromParent();
            loader.container.destroy({ children: true });
            loader.handle.release();
          }
        }
        if (cancelled || generation !== generationRef.current) return destroyStaticWorld(world);
        sceneRootRef.current!.addChild(world.root);
        worldRef.current = world;
        if (!firstRenderCompleteRef.current) setLoadProgress(75);
      }
      await reconcileOfficeParticipants(
        pixiRef.current!,
        assetsRef.current!,
        world,
        actorsRef.current,
        scene,
        reducedMotion,
        generation,
        () => generationRef.current,
      );
      if (cancelled || generation !== generationRef.current) return;
      if (!firstRenderCompleteRef.current) setLoadProgress(92);
      if (hydratedContextRef.current === null) {
        directorRef.current.hydrate(sceneSnapshot(scene), reducedMotion);
      } else {
        directorRef.current.sync(sceneSnapshot(scene), scene.events, reducedMotion);
      }
      hydratedContextRef.current = scene.graphScopeId;
      if (!firstRenderCompleteRef.current) {
        firstRenderCompleteRef.current = true;
        setLoadProgress(100);
        loadingFadeTimerRef.current = globalThis.setTimeout(() => {
          if (!cancelled) setLoadingVisible(false);
        }, 160);
      }
    };
    void prepare().catch((error: unknown) => {
      if (!cancelled && (!(error instanceof DOMException) || error.name !== "AbortError")) setRendererState("fallback");
    });
    const app = appRef.current!;
    if (tickerRef.current) app.ticker.remove(tickerRef.current);
    const ticker = () => {
      if (document.hidden) return;
      for (const actor of scene.actors) {
        const visual = actorsRef.current.get(actor.actorId);
        const hitbox = viewportRef.current?.querySelector<HTMLElement>(`[data-office-actor="${CSS.escape(actor.actorId)}"]`);
        if (visual && hitbox) {
          hitbox.style.left = `${visual.group.x - 68}px`;
          hitbox.style.top = `${visual.group.y - 170}px`;
        }
      }
    };
    tickerRef.current = ticker;
    app.ticker.add(ticker);
    return () => {
      cancelled = true;
      if (generationRef.current === generation) generationRef.current += 1;
      removeOfficeTickerIfCurrent(app, appRef.current, ticker, tickerRef.current);
    };
  }, [reducedMotion, rendererState, scene]);

  useEffect(() => {
    if (!sceneRootRef.current) return;
    sceneRootRef.current.position.set(camera.x, camera.y);
    sceneRootRef.current.scale.set(camera.zoom);
  }, [camera, rendererState]);

  useEffect(() => { cameraTouchedRef.current = false; fitToView(); }, [fitToView, scene.graphScopeId]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (!cameraTouchedRef.current) fitToView(); });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToView]);
  useEffect(() => {
    const onVisibility = () => directorRef.current.visibilityChanged(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => () => directorRef.current.dispose(), []);

  const overlayTransform = useMemo(() => `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, [camera]);
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    onViewportInteraction?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(second!.x - first!.x, second!.y - first!.y), zoom: camera.zoom, centerX: (first!.x + second!.x) / 2, centerY: (first!.y + second!.y) / 2, cameraX: camera.x, cameraY: camera.y };
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
    setDragging(true);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [first, second] = [...pointersRef.current.values()];
      const centerX = (first!.x + second!.x) / 2;
      const centerY = (first!.y + second!.y) / 2;
      const zoom = clamp(pinchRef.current.zoom * Math.hypot(second!.x - first!.x, second!.y - first!.y) / Math.max(1, pinchRef.current.distance), 0.28, 2);
      const ratio = zoom / pinchRef.current.zoom;
      setCamera({ zoom, x: centerX - (pinchRef.current.centerX - pinchRef.current.cameraX) * ratio, y: centerY - (pinchRef.current.centerY - pinchRef.current.cameraY) * ratio });
      return;
    }
    if (dragging) setCamera((value) => ({ ...value, x: dragRef.current.cameraX + event.clientX - dragRef.current.x, y: dragRef.current.cameraY + event.clientY - dragRef.current.y }));
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    setDragging(false);
  };
  const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    onViewportInteraction?.();
    cameraTouchedRef.current = true;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setCamera((value) => {
      const zoom = clamp(value.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.28, 2);
      const ratio = zoom / value.zoom;
      return { zoom, x: x - (x - value.x) * ratio, y: y - (y - value.y) * ratio };
    });
  };

  return <div className={`office-viewport${dragging ? " dragging" : ""}`} data-testid="agent-office" ref={viewportRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
    <div className="office-controls" data-office-control>
      <button type="button" aria-label="放大办公室" onClick={() => { onViewportInteraction?.(); setCamera((value) => ({ ...value, zoom: clamp(value.zoom + 0.12, 0.28, 2) })); }}><Plus size={15} /></button>
      <button type="button" aria-label="缩小办公室" onClick={() => { onViewportInteraction?.(); setCamera((value) => ({ ...value, zoom: clamp(value.zoom - 0.12, 0.28, 2) })); }}><Minus size={15} /></button>
      <button type="button" aria-label="适应办公室" onClick={() => { onViewportInteraction?.(); cameraTouchedRef.current = false; fitToView(); }}><Maximize2 size={15} /></button>
    </div>
    <div className="office-canvas-host" ref={canvasHostRef} aria-hidden="true" />
    {rendererState !== "fallback" && loadingVisible ? <OfficeLoadingScreen progress={loadProgress} complete={loadProgress >= 100} /> : null}
    {rendererState === "fallback" ? <div className="office-fallback" role="group" aria-label="Agent 办公室列表">
      <div className="office-fallback-heading"><span>动画画布暂不可用</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}><RotateCcw size={14} />重试</button></div>
      <OfficeAgentList actors={scene.actors} selectedActorId={selectedActorId} onSelectActor={onSelectActor} />
    </div> : <div className="office-agent-overlay" style={{ width: scene.width, height: scene.height, transform: overlayTransform }}>
      {scene.actors.map((actor) => <button key={actor.actorId} type="button" className={`office-agent-hitbox ${actor.status}${selectedActorId === actor.actorId ? " selected" : ""}`} style={{ left: actor.anchors.seat.x - 68, top: actor.anchors.seat.y - 170 }} aria-label={`${actor.label}，${statusLabel(actor.status)}`} aria-pressed={selectedActorId === actor.actorId} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onSelectActor(actor.actorId, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); }} data-office-actor={actor.actorId} data-testid={actor.kind === "main-agent" ? "agent-office-main-agent" : `agent-office-${actor.roleId}`}><span className="sr-only">{actor.label}</span></button>)}
    </div>}
  </div>;
}

function OfficeAgentList({ actors, selectedActorId, onSelectActor }: { actors: OfficeActor[]; selectedActorId: string | null; onSelectActor: (actorId: string, anchor: { x: number; y: number }) => void }): ReactElement {
  return <div className="office-agent-list">{actors.map((actor) => <button key={actor.actorId} type="button" aria-pressed={selectedActorId === actor.actorId} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onSelectActor(actor.actorId, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); }} data-testid={actor.kind === "main-agent" ? "agent-office-main-agent" : `agent-office-${actor.roleId}`}><span className={`office-agent-list-status ${actor.status}`} aria-hidden="true" /><strong>{actor.label}</strong><span>{statusLabel(actor.status)}</span></button>)}</div>;
}

async function createLoaderVisual(pixi: PixiModule, assets: OfficeRuntimeAssets, reducedMotion: boolean): Promise<LoaderVisual> {
  const handle = await assets.acquireAction("walk-vertical", "main", "office-loader", "bootstrap");
  const frames = handle.asset.animationId ? handle.asset.sheet.animations[handle.asset.animationId] ?? [] : [];
  if (frames.length === 0) {
    handle.release();
    throw new Error("Office loader action has no frames.");
  }
  const container = new pixi.Container();
  container.position.set(OFFICE_RUNTIME_CALIBRATION.world.width / 2, OFFICE_RUNTIME_CALIBRATION.world.height / 2 - 20);
  const sprite = new pixi.AnimatedSprite(frames);
  applyActionVisual(sprite, handle.asset, "walk-vertical", false, reducedMotion, 0, true);
  container.addChild(sprite);
  return { container, handle };
}

async function buildStaticWorld(pixi: PixiModule, assets: OfficeRuntimeAssets, scene: OfficeSceneModel, reducedMotion: boolean): Promise<StaticWorld> {
  const owner = `world:${OFFICE_RUNTIME_CALIBRATION.normalizedHash}`;
  const [propsHandle, coffeeEffectHandle] = await Promise.all([assets.acquireProps(owner), assets.acquireEffect("coffee-cup", `${owner}:coffee`)]);
  const root = new pixi.Container();
  const scenery = new pixi.Container();
  const shadowLayer = new pixi.Container();
  const workstationLayer = new pixi.Container();
  const personLayer = new pixi.Container();
  const chairLayer = new pixi.Container();
  const effectLayer = new pixi.Container();
  root.addChild(shadowLayer, scenery, workstationLayer, personLayer, chairLayer, effectLayer);
  drawFacilities(pixi, shadowLayer, scenery, chairLayer, propsHandle.asset);
  const stations = new Map<string, StationVisual>();
  for (const station of scene.stations) {
    const screenHandle = await assets.acquireScreen("orchestration", `station:${station.stationId}:screen`);
    const calibration = OFFICE_RUNTIME_CALIBRATION.workstations[station.workstationKind];
    const workGroup = new pixi.Container();
    workGroup.position.set(station.origin.x, station.origin.y);
    const stationShadow = new pixi.Container();
    stationShadow.position.set(station.origin.x, station.origin.y);
    const layers = createCalibratedWorkstationLayers(pixi, propsHandle.asset, screenHandle.asset, calibration, "idle", true);
    stationShadow.addChild(layers.shadow);
    workGroup.addChild(layers.desk, layers.screenLayer);
    shadowLayer.addChild(stationShadow);
    const screen = layers.screen;
    screen.visible = false;
    workstationLayer.addChild(workGroup);
    const chair = new pixi.Container();
    chair.position.set(station.origin.x, station.origin.y);
    drawCalibratedChair(pixi, chair, propsHandle.asset, calibration);
    chairLayer.addChild(chair);
    stations.set(station.stationId, { station, screen, screenHandle, screenProfile: "orchestration", screenWidth: calibration.screen.width, screenHeight: calibration.screen.height });
  }
  const coffeeFrames = coffeeEffectHandle.asset.animationId ? coffeeEffectHandle.asset.sheet.animations[coffeeEffectHandle.asset.animationId] ?? [] : [];
  const coffeeEffect = new pixi.AnimatedSprite(coffeeFrames);
  const coffee = OFFICE_RUNTIME_CALIBRATION.facilities.coffeeCup;
  coffeeEffect.position.set(coffee.origin.x, coffee.origin.y);
  coffeeEffect.scale.set(coffee.scale);
  coffeeEffect.animationSpeed = Math.max(0.03, coffeeEffectHandle.asset.animation.fps / 60);
  coffeeEffect.loop = true;
  coffeeEffect.visible = false;
  if (reducedMotion) coffeeEffect.gotoAndStop(0);
  effectLayer.addChild(coffeeEffect);
  return { root, personLayer, effectLayer, stations, propsHandle, coffeeEffectHandle, coffeeEffect, coffeeEffectOwner: null };
}

export async function reconcileOfficeParticipants(
  pixi: PixiModule,
  assets: OfficeRuntimeAssets,
  world: StaticWorld,
  visuals: Map<string, ActorVisual>,
  scene: OfficeSceneModel,
  reducedMotion: boolean,
  generation: number,
  currentGeneration: () => number,
): Promise<void> {
  const prepared: ActorVisual[] = [];
  try {
    for (const actor of scene.actors) {
      if (visuals.has(actor.actorId)) continue;
      const actionId = actor.status === "working" ? "working" : "standby";
      const handle = await assets.acquireAction(actionId, actor.scarf, `actor:${actor.actorId}`, actor.status === "working" ? "semantic" : "bootstrap");
      if (generation !== currentGeneration()) {
        handle.release();
        destroyPreparedActors(prepared);
        return;
      }
      const frames = handle.asset.animationId ? handle.asset.sheet.animations[handle.asset.animationId] ?? [] : [];
      if (frames.length === 0) {
        handle.release();
        throw new Error(`Office action ${actionId} has no frames.`);
      }
      const group = new pixi.Container();
      group.position.set(actor.anchors.seat.x, actor.anchors.seat.y);
      const sprite = new pixi.AnimatedSprite(frames);
      applyActionVisual(sprite, handle.asset, actionId, false, reducedMotion, 0);
      group.addChild(sprite);
      const calibration = OFFICE_RUNTIME_CALIBRATION.workstations[actor.kind === "main-agent" ? "main" : "standard"];
      const label = addOfficeActorLabel(pixi, group, actor.label, actor.kind === "main-agent" ? "main" : "standard", calibration, officeActorScaleForAction(actor.kind === "main-agent" ? "working" : "standby", OFFICE_RUNTIME_CALIBRATION));
      const indicator = new pixi.Graphics();
      const indicatorPosition = label
        ? officeActorStatusLocalPosition({ x: label.x, y: label.y }, label.width, label.height)
        : { x: 56, y: -128 };
      indicator.position.set(indicatorPosition.x, indicatorPosition.y);
      drawStatusIndicator(indicator, actor.status);
      group.addChild(indicator);
      prepared.push({ actor, actionId, group, sprite, statusIndicator: indicator, actionHandle: handle });
    }
  } catch (error) {
    destroyPreparedActors(prepared);
    throw error;
  }

  commitLatestOfficeRender(generation, currentGeneration(), prepared, (current) => {
    const nextIds = new Set(scene.actors.map((actor) => actor.actorId));
    for (const [actorId, visual] of visuals) {
      if (nextIds.has(actorId)) continue;
      visual.actionHandle.release();
      visual.group.destroy({ children: true });
      visuals.delete(actorId);
    }
    for (const actor of scene.actors) {
      const existing = visuals.get(actor.actorId);
      if (!existing) continue;
      existing.actor = actor;
      drawStatusIndicator(existing.statusIndicator, actor.status);
    }
    for (const visual of current) {
      world.personLayer.addChild(visual.group);
      visuals.set(visual.actor.actorId, visual);
    }
  }, destroyPreparedActors);
}

async function applyAction(assets: OfficeRuntimeAssets, visuals: Map<string, ActorVisual>, command: Extract<import("./officeRuntimeCalibration.js").OfficeRuntimeVisualCommand, { kind: "playAction" }>, signal: AbortSignal, reducedMotion: boolean): Promise<void> {
  const visual = visuals.get(command.participantId);
  if (!visual) return;
  const handle = await assets.acquireAction(command.actionId, visual.actor.scarf, `runtime:${visual.actor.actorId}`, "semantic");
  if (signal.aborted) return handle.release();
  const frames = handle.asset.animationId ? handle.asset.sheet.animations[handle.asset.animationId] ?? [] : [];
  if (frames.length === 0) { handle.release(); return; }
  const previous = visual.actionHandle;
  visual.actionHandle = handle;
  visual.sprite.textures = command.reverse ? [...frames].reverse() : frames;
  applyActionVisual(visual.sprite, handle.asset, command.actionId, command.flipX ?? false, reducedMotion, command.phase ?? 0, command.loop, command.durationMs != null);
  visual.actionId = command.actionId;
  previous.release();
}

function applyActionVisual(sprite: AnimatedSprite, atlas: ParsedOfficeAtlas, actionId: OfficeActionId, flipX: boolean, reducedMotion: boolean, phase: number, loop = atlas.animation.loop, timed = false): void {
  applyActionVisualAnchor(sprite, atlas);
  const offset = officeActorOffsetForAction(actionId, OFFICE_RUNTIME_CALIBRATION);
  const scale = officeActorScaleForAction(actionId, OFFICE_RUNTIME_CALIBRATION);
  sprite.position.set(offset.x, offset.y);
  sprite.scale.set((flipX ? -1 : 1) * scale, scale);
  sprite.animationSpeed = Math.max(0.03, atlas.animation.fps / 60) * officeActionPlaybackRate(actionId);
  sprite.loop = loop;
  const frame = Math.min(sprite.totalFrames - 1, Math.floor(phase * sprite.totalFrames));
  if (reducedMotion || (!loop && !timed)) sprite.gotoAndStop(frame); else sprite.gotoAndPlay(frame);
}

export async function setOfficeStationScreen(assets: OfficeRuntimeAssets, station: StationVisual | undefined, profile: "off" | "static" | OfficeScreenProfile, signal: AbortSignal, phase = 0, reducedMotion = false): Promise<void> {
  if (!station) return;
  if (signal.aborted) return;
  if (profile === "off") { station.screen.visible = false; station.screen.stop(); return; }
  const requested: OfficeScreenProfile = profile === "static" ? "orchestration" : profile;
  if (requested !== station.screenProfile) {
    const handle = await assets.acquireScreen(requested, `station:${station.station.stationId}:screen`, requested === "orchestration" ? "semantic" : "ambient");
    if (signal.aborted) return handle.release();
    const frames = handle.asset.animationId ? handle.asset.sheet.animations[handle.asset.animationId] ?? [] : [];
    if (frames.length === 0) return handle.release();
    if (station.screenHandle !== handle) station.screenHandle.release();
    station.screenHandle = handle;
    station.screenProfile = requested;
    station.screen.textures = frames;
    station.screen.animationSpeed = Math.max(0.03, handle.asset.animation.fps / 60);
    station.screen.width = station.screenWidth;
    station.screen.height = station.screenHeight;
  }
  station.screen.visible = true;
  const frame = Math.min(station.screen.totalFrames - 1, Math.floor(phase * station.screen.totalFrames));
  if (reducedMotion || profile === "static") station.screen.gotoAndStop(frame); else station.screen.gotoAndPlay(frame);
}

function setActorEffect(participantId: string, visual: ActorVisual | undefined, world: StaticWorld, effect: string, reducedMotion: boolean): void {
  if (visual) visual.statusIndicator.visible = effect !== "none" && effect !== "coffee-cup";
  if (effect === "coffee-cup") {
    world.coffeeEffectOwner = participantId;
    world.coffeeEffect.visible = true;
    if (!reducedMotion) world.coffeeEffect.gotoAndPlay(0); else world.coffeeEffect.gotoAndStop(0);
  } else if (world.coffeeEffectOwner === participantId) {
    world.coffeeEffectOwner = null;
    world.coffeeEffect.visible = false;
    world.coffeeEffect.stop();
  }
}

function followRoute(group: Container | undefined, points: readonly OfficePoint[], durationMs: number, signal: AbortSignal, reducedMotion: boolean): Promise<void> {
  if (!group || points.length === 0) return Promise.resolve();
  if (reducedMotion || durationMs <= 0 || points.length === 1) { group.position.set(points.at(-1)!.x, points.at(-1)!.y); return Promise.resolve(); }
  return new Promise((resolve) => {
    const started = performance.now();
    const step = (now: number) => {
      if (signal.aborted) return resolve();
      const frame = officeRouteFrameAt(points, now - started, durationMs);
      if (!frame) return resolve();
      group.position.set(frame.position.x, frame.position.y);
      if (frame.progress < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

function drawFacilities(pixi: PixiModule, shadowLayer: Container, scenery: Container, foreground: Container, props: ParsedOfficeAtlas): void {
  const { coffee, treadmill, toilet, toiletPaper, toiletTailOccluder } = OFFICE_RUNTIME_CALIBRATION.facilities;
  for (const facility of [coffee, treadmill]) {
    if (!facility.visible) continue;
    if (facility.shadow?.visible) {
      const group = new pixi.Container();
      group.position.set(facility.origin.x, facility.origin.y);
      addCalibratedShadow(pixi, group, props, facility.shadow);
      shadowLayer.addChild(group);
    }
    addProp(pixi, scenery, props, `${facility.propId}.png`, facility.origin, facility.scale);
  }
  if (toilet.visible) addProp(pixi, scenery, props, `${toilet.propId}.png`, toilet.origin, toilet.scale);
  if (toiletPaper.visible) addProp(pixi, scenery, props, `${toiletPaper.propId}.png`, toiletPaper.origin, toiletPaper.scale);
  if (toiletTailOccluder.visible) addProp(pixi, foreground, props, `${toiletTailOccluder.propId}.png`, toiletTailOccluder.origin, toiletTailOccluder.scale);
}

function addProp(pixi: PixiModule, layer: Container, props: ParsedOfficeAtlas, frame: string, point: OfficePoint, scale: number): void {
  const texture = props.sheet.textures[frame];
  if (!texture) throw new Error(`Office prop ${frame} is missing.`);
  const sprite = new pixi.Sprite(texture);
  sprite.position.set(point.x, point.y);
  sprite.scale.set(scale);
  layer.addChild(sprite);
}

function sceneSnapshot(scene: OfficeSceneModel) {
  return {
    contextId: scene.graphScopeId,
    revision: scene.projectionHash,
    lifecycle: scene.scopeStatus,
    stations: scene.stations,
    participants: scene.actors.map((actor) => ({ participantId: actor.actorId, navigationId: actor.agentSurfaceId, stationId: actor.seatId, kind: actor.kind === "main-agent" ? "main" as const : "child" as const, label: actor.label, roleId: actor.roleId, parentParticipantId: actor.parentActorId, state: actor.status, createdAt: actor.createdAt, scarf: actor.scarf, ambientPreferences: actor.ambientPreferences.map((preference) => ({ ...preference })) })),
    diagnostics: scene.diagnostics,
  };
}

function applyActionVisualAnchor(sprite: AnimatedSprite, action: ParsedOfficeAtlas): void {
  if (action.visualAnchor) sprite.anchor.set(action.visualAnchor.x / sprite.texture.orig.width, action.visualAnchor.y / sprite.texture.orig.height);
  else sprite.anchor.set(0.5, 1);
  sprite.pivot.set(0, 0);
}
function drawStatusIndicator(graphics: Graphics, status: OfficeActorStatus): void { graphics.clear().circle(0, 0, 6).fill(STATUS_COLORS[status]).stroke({ color: 0xfaf9f7, width: 2 }); graphics.visible = status === "attention" || status === "blocked" || status === "failed" || status === "interrupted"; }
function destroyActors(actors: Map<string, ActorVisual>): void { for (const visual of actors.values()) { visual.actionHandle.release(); visual.group.destroy({ children: true }); } }
function destroyPreparedActors(actors: ActorVisual[]): void { for (const visual of actors) { visual.actionHandle.release(); visual.group.destroy({ children: true }); } }
function destroyStaticWorld(world: StaticWorld | null): void { if (!world) return; const handles = new Set([world.propsHandle, world.coffeeEffectHandle, ...[...world.stations.values()].map((station) => station.screenHandle)]); for (const handle of handles) handle.release(); world.root.destroy({ children: true }); }
function chooseResolution(host: HTMLElement): "1x" | "2x" { return host.clientWidth < 720 || (globalThis.devicePixelRatio || 1) < 1.5 ? "1x" : "2x"; }
function statusLabel(status: OfficeActorStatus): string { return ({ idle: "空闲", queued: "排队中", working: "正在工作", completed: "已完成", blocked: "需要修改", failed: "失败", attention: "需要你回答", interrupted: "已中断" } as const)[status]; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
