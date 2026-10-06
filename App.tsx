/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CarConfiguratorEngine } from './services/CarConfiguratorEngine';
import { Catalog, STATIC_CATALOG, fetchCatalog, paintsForCar, pickPaintForCar } from './services/catalogService';
import { nearestRimSize, rimPrice, rimSizes } from './services/pricing';
import { CarModel, PaintColor, WheelDesign, WheelFinish, CameraViewPreset } from './types';
import { BRAND, DEFAULT_REGION, Region } from './config/brand';
import { DELIVERY, TERMS } from './config/pages';
import { SavedConfiguration, configKey, loadConfiguration, saveConfiguration, submitEnquiry } from './services/journeyService';
import { downloadBrochurePdf } from './services/brochurePdf';
import { IN_APP_STATE, cameFromApp } from './services/nav';
import { controlsInset, layoutMode } from './services/layout';
import { BootLoader } from './components/journey/BootLoader';
import { WelcomeGate } from './components/journey/WelcomeGate';
import { Showroom, ShowroomBackdrop } from './components/journey/Showroom';
import { TopBar } from './components/journey/TopBar';
import { ConfigStep, Configurator, MoreOptionsModal } from './components/journey/Configurator';
import { SummaryPage } from './components/journey/SummaryPage';
import { EnquiryModal } from './components/journey/EnquiryModal';
import { Button } from './components/journey/ui';
import RenderedCarView, { RENDER_ASPECT, loadRenderManifest } from './components/journey/RenderedCarView';

// Pages off the main journey load on demand
const ForgedPage = lazy(() => import('./components/ForgedPage').then((m) => ({ default: m.ForgedPage })));
const RimDetailPage = lazy(() => import('./components/RimDetailPage').then((m) => ({ default: m.RimDetailPage })));
const InfoPage = lazy(() => import('./components/InfoPage').then((m) => ({ default: m.InfoPage })));
const AdminPage = lazy(() => import('./components/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

// Journey: welcome -> showroom (choose the car) -> configure (paint, wheel design, size, finish) -> summary.
// One 3D studio lives behind every stage; the camera moves between them instead of the page changing.

type Route =
  | { name: 'welcome' }
  | { name: 'showroom' }
  | { name: 'configure' }
  | { name: 'summary' }
  | { name: 'forged' }
  | { name: 'admin' }
  | { name: 'terms' }
  | { name: 'delivery' }
  | { name: 'rim'; rimId: string };

const routeFromLocation = (): Route => {
  if (typeof window === 'undefined') return { name: 'welcome' };
  const hash = window.location.hash.replace(/^#/, '');
  const path = (hash.startsWith('/') ? hash : window.location.pathname).toLowerCase().replace(/\/+$/, '');
  if (path === '/models') return { name: 'showroom' };
  if (path === '/configure') return { name: 'configure' };
  if (path === '/summary') return { name: 'configure' }; // stills are captured on the way in
  if (path === '/forged' || hash === 'forged') return { name: 'forged' };
  if (path === '/admin' || hash === 'admin') return { name: 'admin' };
  if (path === '/terms') return { name: 'terms' };
  if (path === '/delivery') return { name: 'delivery' };
  const rim = path.match(/^\/rims\/([^/]+)$/);
  if (rim) return { name: 'rim', rimId: decodeURIComponent(rim[1]) };
  return { name: 'welcome' };
};

const routePath = (route: Route) =>
  ({
    welcome: '/',
    showroom: '/models',
    configure: '/configure',
    summary: '/summary',
    forged: '/forged',
    admin: '/admin',
    terms: '/terms',
    delivery: '/delivery',
    rim: route.name === 'rim' ? `/rims/${encodeURIComponent(route.rimId)}` : '/'
  })[route.name];

// Car fields that change what the engine renders for the body.
const carModelKey = (car: CarModel) =>
  JSON.stringify([car.id, car.modelUrl, car.modelRotationDeg, car.modelLengthM, car.paintMeshMatch, car.hideMeshMatch, car.bodyStyle]);

const pickFinish = (catalog: Catalog, wheel: WheelDesign, current?: WheelFinish) =>
  (current && wheel.availableVariants.includes(current.id) && catalog.finishes[current.id]) ||
  catalog.finishes[wheel.defaultVariant] ||
  Object.values(catalog.finishes)[0];

/** Cars with a real 3D body make the showroom; the simple procedural bodies are only a fallback. */
const showroomCars = (cars: CarModel[]) => {
  const withModels = cars.filter((c) => c.modelUrl);
  return withModels.length ? withModels : cars;
};

/** First-visit paint when the car offers it (otherwise the car's first factory paint). */
const DEFAULT_PAINT_ID = 'isle_of_man_green';


/** Fades the pre-rendered stage's edges that stop short of the space around it (8 % of its size). */
const stageEdgeFade = (st: { left: number; top: number }): React.CSSProperties => {
  const v = st.top > 0.5 ? 'linear-gradient(to bottom, transparent, #000 8%, #000 92%, transparent)' : 'linear-gradient(#000, #000)';
  const h = st.left > 0.5 ? 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)' : 'linear-gradient(#000, #000)';
  const mask = `${v}, ${h}`;
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' };
};

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CarConfiguratorEngine | null>(null);
  const loadedCarKeyRef = useRef<string | null>(null);

  // Catalogue: bundled first, replaced by Supabase once it loads
  const [catalog, setCatalog] = useState<Catalog>(STATIC_CATALOG);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const reloadCatalog = useCallback(() => {
    fetchCatalog().then(({ catalog: next }) => {
      setCatalog(next);
      setCatalogLoaded(true);
    });
  }, []);
  useEffect(() => {
    reloadCatalog();
  }, [reloadCatalog]);

  const cars = useMemo(() => showroomCars(catalog.cars), [catalog.cars]);

  // The five choices
  const [selectedCar, setSelectedCar] = useState<CarModel>(() => showroomCars(STATIC_CATALOG.cars)[0]);
  const [selectedPaint, setSelectedPaint] = useState<PaintColor>(
    () => pickPaintForCar(STATIC_CATALOG.paints, showroomCars(STATIC_CATALOG.cars)[0], DEFAULT_PAINT_ID)!
  );
  const [selectedWheel, setSelectedWheel] = useState<WheelDesign>(STATIC_CATALOG.wheels[0]);
  const [selectedFinish, setSelectedFinish] = useState<WheelFinish>(STATIC_CATALOG.finishes.liquid_metal);
  const [selectedSize, setSelectedSize] = useState<string>('20"');
  const [region, setRegion] = useState<Region>(() => {
    try {
      return BRAND.regions.find((r) => r.id === localStorage.getItem('forged_region')) ?? DEFAULT_REGION;
    } catch {
      return DEFAULT_REGION;
    }
  });

  // Journey UI
  const [route, setRoute] = useState<Route>(routeFromLocation);
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0.08);
  const [driving, setDriving] = useState(false);
  const [step, setStep] = useState<ConfigStep>('overview');
  const [cameraView, setCameraView] = useState<CameraViewPreset>('frontThreeQuarter');
  // Cars with pre-rendered (Blender) bodies show those in the configurator; see RenderedCarView
  const [renderedCars, setRenderedCars] = useState<Record<string, string[]>>({});
  useEffect(() => {
    loadRenderManifest().then(setRenderedCars);
  }, []);
  const [stage, setStage] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [summaryImages, setSummaryImages] = useState<string[]>([]);
  // shared: undefined while the copy every device can open is being written, false if it could not be
  const [configCode, setConfigCode] = useState<{ key: string; code: string; shared?: boolean } | null>(null);
  const saveToken = useRef(0);

  const carIndex = Math.max(0, cars.findIndex((c) => c.id === selectedCar.id));

  // ----------------------------------------------------
  // Routing
  // ----------------------------------------------------
  useEffect(() => {
    // /summary opens the configurator (its stills are captured on the way in): the address bar says so
    const fixSummaryUrl = () => {
      if (window.location.pathname.toLowerCase().replace(/\/+$/, '') !== '/summary') return;
      try {
        window.history.replaceState(window.history.state, '', '/configure' + window.location.search + window.location.hash);
      } catch {
        /* the configurator shows either way */
      }
    };
    fixSummaryUrl();
    const onPop = () => {
      // Back to the summary (e.g. from the terms linked in its footer) shows it again, with fresh stills
      if (window.location.pathname.toLowerCase().replace(/\/+$/, '') === '/summary' && reenterSummaryRef.current()) return setRoute({ name: 'summary' });
      fixSummaryUrl();
      setRoute(routeFromLocation());
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const navigateTo = useCallback((next: Route, replace = false) => {
    setRoute(next);
    const path = routePath(next);
    try {
      if (replace) window.history.replaceState(window.history.state, '', path);
      else window.history.pushState(IN_APP_STATE, '', path);
    } catch {
      window.location.hash = `#${path}`;
    }
  }, []);

  /** Back on a page reached from anywhere: the previous page when it is part of the app, else the welcome page. */
  const goBack = useCallback(() => (cameFromApp() ? window.history.back() : navigateTo({ name: 'welcome' })), [navigateTo]);

  // The rim page returns to the page that opened it (the configurator or the collection), not to the
  // rim before it when the visitor stepped through the designs; a direct link returns to the configurator
  const lastRouteRef = useRef<Route | null>(null);
  const rimReturnRef = useRef<Route>({ name: 'configure' });
  // (during render, so the rim page's first render already knows where Back goes; repeat renders are no-ops)
  if (lastRouteRef.current !== route) {
    const prev = lastRouteRef.current;
    if (route.name === 'rim' && prev && prev.name !== 'rim') rimReturnRef.current = prev;
    lastRouteRef.current = route;
  }

  // ----------------------------------------------------
  // Engine
  // ----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new CarConfiguratorEngine(containerRef.current, () => setBootProgress((p) => Math.max(p, 0.3)));
    engineRef.current = engine;
    loadedCarKeyRef.current = carModelKey(selectedCar);
    engine.applyPaintColor(selectedPaint);
    engine.applyWheelDesign(selectedWheel);
    engine.applyWheelFinish(selectedFinish);
    engine.setRimSize(selectedSize);
    engine.setCameraPreset('hero', { instant: true });

    const started = performance.now();
    const tick = setInterval(() => setBootProgress((p) => Math.min(0.9, p + 0.05)), 250);
    engine.loadCar(selectedCar).finally(() => {
      clearInterval(tick);
      setBootProgress(1);
      // Let the loader's line drawing finish; it reads as intentional rather than a spinner
      setTimeout(() => setBooted(true), Math.max(0, 1500 - (performance.now() - started)));
    });

    // Rotating a phone or resizing a window can change the layout (sheet <-> panel) or the aspect: the
    // camera's inset and framing follow, instead of keeping the previous orientation's composition
    let shape = `${layoutMode()}|${window.innerWidth > window.innerHeight}`;
    let reframe: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      engine.handleResize();
      applyInsetRef.current();
      const now = `${layoutMode()}|${window.innerWidth > window.innerHeight}`;
      if (now !== shape) {
        shape = now;
        clearTimeout(reframe);
        reframe = setTimeout(() => applyCameraRef.current(), 120);
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(tick);
      window.removeEventListener('resize', onResize);
      engine.cleanup();
      engineRef.current = null;
    };
  }, []);

  // After a catalogue load or admin edit, point selections at the fresh rows and push them to the engine.
  useEffect(() => {
    const car = catalog.cars.find((c) => c.id === selectedCar.id) ?? showroomCars(catalog.cars)[0];
    const paint = pickPaintForCar(catalog.paints, car, selectedPaint.id);
    const wheel = catalog.wheels.find((w) => w.id === selectedWheel.id) ?? catalog.wheels[0];
    if (!car || !paint || !wheel) return;
    const finish = pickFinish(catalog, wheel, selectedFinish);
    if (!finish) return;
    const size = nearestRimSize(wheel, selectedSize);
    setSelectedCar(car);
    setSelectedPaint(paint);
    setSelectedWheel(wheel);
    setSelectedFinish(finish);
    setSelectedSize(size);
    const engine = engineRef.current;
    if (!engine) return;
    const key = carModelKey(car);
    if (key !== loadedCarKeyRef.current) {
      loadedCarKeyRef.current = key;
      engine.loadCar(car);
    }
    engine.applyPaintColor(paint);
    engine.applyWheelDesign(wheel);
    engine.applyWheelFinish(finish);
    engine.setRimSize(size);
  }, [catalog]);

  // Warm the neighbouring cars so showroom changes don't wait on downloads
  useEffect(() => {
    if (!booted || cars.length < 2) return;
    const engine = engineRef.current;
    engine?.preloadCar(cars[(carIndex + 1) % cars.length]);
    engine?.preloadCar(cars[(carIndex - 1 + cars.length) % cars.length]);
  }, [booted, cars, carIndex]);

  // Picking a wheel should only swap meshes: once the customer reaches the wheels step, every
  // wheel's 3D spokes (nearest in the list first) and the tyres for the other sizes are prepared
  // in the background, in idle time (not on the welcome page, and never ahead of a pick)
  useEffect(() => {
    if (route.name !== 'configure' || step !== 'wheels' || !catalogLoaded) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.preloadWheels(catalog.wheels, selectedWheel.id);
    engine.preloadRimSizes([...new Set(catalog.wheels.flatMap(rimSizes))]);
  }, [route.name, step, catalogLoaded, catalog.wheels]);

  // Pre-rendered mode: a fixed-aspect stage, centred in the space the controls leave. Where it doesn't
  // reach the edges of that space (4:3 and portrait tablets), its studio backdrop stopped in a hard line
  // above and below the car: those edges fade into the page instead (stageEdgeFade)
  const rendered = route.name === 'configure' && (renderedCars[selectedCar.id]?.includes(cameraView) ?? false);
  const renderedRef = useRef(rendered);
  renderedRef.current = rendered;
  const computeStage = useCallback(() => {
    const inset = controlsInset();
    const aw = window.innerWidth - Math.max(0, inset.right);
    const ah = window.innerHeight - inset.bottom;
    const width = Math.min(aw, ah * RENDER_ASPECT);
    const height = width / RENDER_ASPECT;
    return { left: (aw - width) / 2, top: Math.max(0, (ah - height) / 2), width, height };
  }, []);
  useEffect(() => {
    if (!rendered) return setStage(null);
    const update = () => setStage(computeStage());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [rendered, computeStage]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setRenderedBody(rendered);
    engine.handleResize();
    applyInsetRef.current();
    if (route.name === 'configure') engine.setCameraPreset(cameraView, { instant: rendered });
  }, [rendered, stage]);

  // Keep the car centred in the space the panel leaves
  const applyInsetRef = useRef<() => void>(() => {});
  applyInsetRef.current = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (renderedRef.current) {
      engine.setViewInset(0, 0);
    } else if (route.name === 'configure') {
      // the same sheet/panel rule and sizes as the CSS (services/layout.ts)
      const inset = controlsInset();
      engine.setViewInset(inset.right, inset.bottom);
    } else if (route.name === 'welcome') {
      // Car to the right of the welcome copy (above it when the copy sits underneath)
      if (layoutMode() === 'sheet') engine.setViewInset(0, window.innerHeight * 0.42);
      else engine.setViewInset(-window.innerWidth * 0.34, 0);
    } else if (route.name === 'showroom' && window.innerHeight < 520) {
      // a phone on its side: the model card takes the lower third, the car sits above it
      engine.setViewInset(0, window.innerHeight * 0.32);
    } else engine.setViewInset(0, 0);
  };
  // The current stage's camera preset (re-applied when the layout changes)
  const applyCameraRef = useRef<() => void>(() => {});
  applyCameraRef.current = () => {
    const engine = engineRef.current;
    if (!engine || !booted) return;
    if (route.name === 'welcome') engine.setCameraPreset('hero');
    else if (route.name === 'showroom') engine.setCameraPreset('showroom');
    else if (route.name === 'configure') engine.setCameraPreset(cameraView);
  };

  // Camera choreography per stage
  const revealedRef = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !booted) return;
    engine.setPaused(!['welcome', 'showroom', 'configure'].includes(route.name));
    applyInsetRef.current();
    if (route.name === 'welcome') {
      engine.setCameraPreset('hero');
      engine.setAutoRotate(true);
      if (!revealedRef.current) engine.playReveal();
    } else if (route.name === 'showroom') {
      engine.setAutoRotate(false);
      engine.setCameraPreset('showroom');
      if (!revealedRef.current) engine.playReveal();
    } else if (route.name === 'configure') {
      engine.setAutoRotate(autoRotate);
      engine.setCameraPreset(cameraView);
      if (!revealedRef.current) engine.playReveal();
    }
    revealedRef.current = true;
  }, [route.name, booted]);

  const selectView = useCallback((view: CameraViewPreset) => {
    setCameraView(view);
    engineRef.current?.setCameraPreset(view);
  }, []);

  // ----------------------------------------------------
  // Choices
  // ----------------------------------------------------
  /** Each car offers only its own factory paints: keep the paint if it has it, else take its first. */
  const mountCar = useCallback(
    (car: CarModel) => {
      setSelectedCar(car);
      loadedCarKeyRef.current = carModelKey(car);
      const paint = pickPaintForCar(catalog.paints, car, selectedPaint.id);
      if (paint && paint.id !== selectedPaint.id) {
        setSelectedPaint(paint);
        engineRef.current?.applyPaintColor(paint);
      }
    },
    [catalog.paints, selectedPaint.id]
  );

  const stepCar = useCallback(
    async (direction: 1 | -1, target?: number) => {
      if (driving || cars.length < 2) return;
      const next = cars[target ?? (carIndex + direction + cars.length) % cars.length];
      if (!next || next.id === selectedCar.id) return;
      setDriving(true);
      mountCar(next);
      try {
        await engineRef.current?.driveToCar(next, direction);
      } finally {
        setDriving(false);
      }
    },
    [driving, cars, carIndex, selectedCar.id, mountCar]
  );

  const choosePaint = useCallback(
    (paint: PaintColor) => {
      setSelectedPaint(paint);
      engineRef.current?.applyPaintColor(paint);
      if (cameraView === 'frontWheel' || cameraView === 'rearWheel') selectView('frontThreeQuarter');
    },
    [cameraView, selectView]
  );

  /** Rim design, colour and size together; keeps the colour/size when the new rim offers them. */
  const applyRim = useCallback(
    (wheel: WheelDesign, finish?: WheelFinish, size?: string) => {
      const nextFinish = finish ?? pickFinish(catalog, wheel, selectedFinish);
      const nextSize = nearestRimSize(wheel, size ?? selectedSize);
      setSelectedWheel(wheel);
      setSelectedFinish(nextFinish);
      setSelectedSize(nextSize);
      const engine = engineRef.current;
      if (engine) {
        engine.applyWheelDesign(wheel);
        engine.applyWheelFinish(nextFinish);
        engine.setRimSize(nextSize);
      }
    },
    [catalog, selectedFinish, selectedSize]
  );

  // Wheel choices cut to a close-up of the wheel on the car
  const focusWheel = useCallback(() => {
    if (cameraView !== 'frontWheel') selectView('frontWheel');
    if (autoRotate) {
      setAutoRotate(false);
      engineRef.current?.setAutoRotate(false);
    }
  }, [cameraView, selectView, autoRotate]);

  const chooseWheel = useCallback((wheel: WheelDesign) => {
    applyRim(wheel);
    focusWheel();
  }, [applyRim, focusWheel]);

  const chooseSize = useCallback((size: string) => {
    setSelectedSize(size);
    engineRef.current?.setRimSize(size);
    focusWheel();
  }, [focusWheel]);

  const chooseFinish = useCallback((finish: WheelFinish) => {
    setSelectedFinish(finish);
    engineRef.current?.applyWheelFinish(finish);
    focusWheel();
  }, [focusWheel]);

  const changeStep = useCallback(
    (next: ConfigStep) => {
      setStep(next);
      if (next === 'paint' && (cameraView === 'frontWheel' || cameraView === 'rearWheel')) selectView('frontThreeQuarter');
      if (next === 'wheels' || next === 'size' || next === 'finish') focusWheel();
    },
    [cameraView, selectView, focusWheel]
  );

  const toggleRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      engineRef.current?.setAutoRotate(next);
      if (next && (cameraView === 'frontWheel' || cameraView === 'rearWheel')) selectView('frontThreeQuarter');
      return next;
    });
  }, [cameraView, selectView]);

  const changeRegion = useCallback((r: Region) => {
    setRegion(r);
    try {
      localStorage.setItem('forged_region', r.id);
    } catch {
      /* not persisted */
    }
  }, []);

  // ----------------------------------------------------
  // Saved configurations
  // ----------------------------------------------------
  const currentConfig = (): SavedConfiguration => ({
    carId: selectedCar.id,
    paintId: selectedPaint.id,
    wheelId: selectedWheel.id,
    finishId: selectedFinish.id,
    size: selectedSize,
    regionId: region.id
  });

  const applyConfig = useCallback(
    (cfg: SavedConfiguration) => {
      const car = catalog.cars.find((c) => c.id === cfg.carId);
      // A saved paint the car no longer offers (or that was retired) falls back to its first factory paint
      const paint = car && pickPaintForCar(catalog.paints, car, cfg.paintId);
      // A saved wheel that was retired falls back to the first wheel in the collection
      const wheel = catalog.wheels.find((w) => w.id === cfg.wheelId) ?? catalog.wheels[0];
      if (!car || !paint || !wheel) return false;
      const finish = wheel.availableVariants.includes(cfg.finishId) ? catalog.finishes[cfg.finishId] : undefined;
      const engine = engineRef.current;
      if (carModelKey(car) !== loadedCarKeyRef.current) {
        loadedCarKeyRef.current = carModelKey(car);
        engine?.loadCar(car);
      }
      setSelectedCar(car);
      choosePaint(paint);
      applyRim(wheel, finish, cfg.size);
      const r = BRAND.regions.find((x) => x.id === cfg.regionId);
      if (r) changeRegion(r);
      return true;
    },
    [catalog, choosePaint, applyRim, changeRegion]
  );

  const loadCode = useCallback(
    async (code: string) => {
      const cfg = await loadConfiguration(code);
      if (!cfg || !applyConfig(cfg)) return false;
      setConfigCode({ key: configKey(cfg), code: code.toUpperCase().replace(/[^A-Z0-9]/g, '') });
      setStep('overview');
      navigateTo({ name: 'configure' });
      return true;
    },
    [applyConfig, navigateTo]
  );

  // ?config=CODE opens that configuration once the studio and catalogue are ready
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!booted || !catalogLoaded || deepLinkDone.current) return;
    deepLinkDone.current = true;
    const code = new URLSearchParams(window.location.search).get('config');
    if (code) loadCode(code);
  }, [booted, catalogLoaded, loadCode]);

  /** The summary's stills and configuration code, taken whenever the summary opens. */
  const enterSummary = useCallback(() => {
    // The three stills are a few hundred ms of rendering and JPEG encoding on a phone: taken on the
    // next frame, after the summary page has painted, so the tap responds at once and the images
    // drop in (the page shows their frames meanwhile)
    const engine = engineRef.current;
    if (engine) requestAnimationFrame(() => setSummaryImages(engine.captureViews(['frontThreeQuarter', 'side', 'frontWheel'])));
    const cfg = currentConfig();
    const key = configKey(cfg);
    if (configCode?.key !== key) {
      // The code is usable at once; only the shared copy is awaited, and a save started for an
      // earlier configuration can no longer overwrite this one
      const token = ++saveToken.current;
      const saved = saveConfiguration(cfg);
      setConfigCode({ key, code: saved.code });
      saved.shared.then((shared) => {
        if (token === saveToken.current) setConfigCode((c) => (c && c.code === saved.code ? { ...c, shared } : c));
      });
    }
  }, [configCode, selectedCar, selectedPaint, selectedWheel, selectedFinish, selectedSize, region]);
  // (popstate: only once the studio is up, else the configurator opens as on a direct visit)
  const reenterSummaryRef = useRef<() => boolean>(() => false);
  reenterSummaryRef.current = () => {
    if (!booted || !engineRef.current) return false;
    enterSummary();
    return true;
  };

  const openSummary = useCallback(() => {
    navigateTo({ name: 'summary' });
    enterSummary();
  }, [navigateTo, enterSummary]);

  const price = rimPrice(selectedWheel, selectedSize);
  const carPaints = useMemo(() => paintsForCar(catalog.paints, selectedCar), [catalog.paints, selectedCar]);

  const menuLinks = [
    { label: 'Home', onClick: () => navigateTo({ name: 'welcome' }) },
    { label: 'Models', onClick: () => navigateTo({ name: 'showroom' }) },
    { label: 'Configure', onClick: () => navigateTo({ name: 'configure' }) },
    { label: 'The wheels', onClick: () => navigateTo({ name: 'forged' }) },
    { label: 'Enquire', onClick: () => setEnquiryOpen(true) },
    { label: 'Delivery & fitment', onClick: () => navigateTo({ name: 'delivery' }) },
    { label: 'Terms & conditions', onClick: () => navigateTo({ name: 'terms' }) }
  ];

  const enquirySummary = `${selectedCar.name} · ${selectedPaint.name} · ${selectedWheel.name} ${selectedSize} in ${selectedFinish.name}`;
  const onJourney = ['welcome', 'showroom', 'configure'].includes(route.name);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-stage select-none">
      <ShowroomBackdrop car={selectedCar} visible={booted && route.name === 'showroom'} />

      {rendered && stage && (
        <div className="absolute z-[5] pointer-events-none" style={{ ...stage, ...stageEdgeFade(stage) }}>
          <RenderedCarView carId={selectedCar.id} view={cameraView} paint={selectedPaint} />
        </div>
      )}

      {/* The studio: transparent WebGL canvas over the backdrop (only the wheels in rendered mode) */}
      <div
        ref={containerRef}
        style={rendered && stage ? stage : undefined}
        className={`absolute ${rendered && stage ? '' : 'inset-0'} z-10 transition-opacity duration-700 ${route.name === 'configure' ? 'cursor-grab active:cursor-grabbing' : ''} ${onJourney ? 'opacity-100' : 'opacity-0'}`}
      />

      {booted && route.name === 'welcome' && (
        <WelcomeGate region={region} onRegionChange={changeRegion} onEnter={() => navigateTo({ name: 'showroom' })} onOpenForged={() => navigateTo({ name: 'forged' })} />
      )}

      {booted && route.name === 'showroom' && (
        <>
          <TopBar
            links={menuLinks}
            onLogo={() => navigateTo({ name: 'welcome' })}
            actions={
              <>
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigateTo({ name: 'configure' })}>
                  Configure
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEnquiryOpen(true)}>
                  Enquire
                </Button>
              </>
            }
          />
          <Showroom
            cars={cars}
            index={carIndex}
            busy={driving}
            onStep={(d) => stepCar(d)}
            onJump={(i) => stepCar(i > carIndex ? 1 : -1, i)}
            onBuild={() => {
              setStep('overview');
              setCameraView('frontThreeQuarter');
              navigateTo({ name: 'configure' });
            }}
          />
        </>
      )}

      {booted && route.name === 'configure' && (
        <Configurator
          car={selectedCar}
          paints={carPaints}
          wheels={catalog.wheels}
          finishes={catalog.finishes}
          paint={selectedPaint}
          wheel={selectedWheel}
          finish={selectedFinish}
          size={selectedSize}
          region={region}
          step={step}
          onStep={changeStep}
          cameraView={cameraView}
          autoRotate={autoRotate}
          onCamera={selectView}
          onToggleRotate={toggleRotate}
          onPaint={choosePaint}
          onWheel={chooseWheel}
          onSize={chooseSize}
          onFinish={chooseFinish}
          onChangeModel={() => navigateTo({ name: 'showroom' })}
          onSummary={openSummary}
          onOpen360={(w) => navigateTo({ name: 'rim', rimId: w.id })}
          onOpenMore={() => setMoreOpen(true)}
        />
      )}

      {route.name === 'summary' && (
        <SummaryPage
          car={selectedCar}
          paint={selectedPaint}
          wheel={selectedWheel}
          finish={selectedFinish}
          size={selectedSize}
          price={price}
          region={region}
          images={summaryImages}
          code={configCode?.code ?? null}
          codeShared={configCode?.shared}
          onBack={() => navigateTo({ name: 'configure' })}
          onEnquire={() => setEnquiryOpen(true)}
          onDownloadPdf={async (contact) => {
            // Saved as a lead first (never blocks the PDF: submitEnquiry keeps a local copy if offline;
            // only a refusal from the server, e.g. the rate limit, stops it and is shown)
            const lead = await submitEnquiry({
              ...contact,
              consultation: false,
              source: 'pdf',
              configCode: configCode?.code,
              configuration: {
                car: selectedCar.name,
                paint: selectedPaint.name,
                wheel: selectedWheel.name,
                size: selectedSize,
                finish: selectedFinish.name,
                carId: selectedCar.id,
                paintId: selectedPaint.id,
                wheelId: selectedWheel.id,
                finishId: selectedFinish.id
              },
              region: region.id
            });
            if (lead.status === 'rejected') throw new Error(lead.message);
            await downloadBrochurePdf({
              car: selectedCar,
              paint: selectedPaint,
              wheel: selectedWheel,
              finish: selectedFinish,
              size: selectedSize,
              price,
              region,
              code: configCode?.code ?? '',
              images: summaryImages
            });
          }}
        />
      )}

      <MoreOptionsModal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        region={region}
        onRegion={changeRegion}
        onLoadCode={loadCode}
        onRestart={() => navigateTo({ name: 'welcome' })}
      />

      <EnquiryModal
        open={enquiryOpen}
        onClose={() => setEnquiryOpen(false)}
        summary={enquirySummary}
        context={{
          configCode: configCode?.code,
          configuration: {
            car: selectedCar.name,
            paint: selectedPaint.name,
            wheel: selectedWheel.name,
            size: selectedSize,
            finish: selectedFinish.name,
            // Ids too: some paint names are shared by two BMW codes, so the lead email looks these up
            carId: selectedCar.id,
            paintId: selectedPaint.id,
            wheelId: selectedWheel.id,
            finishId: selectedFinish.id
          },
          region: region.id
        }}
      />

      <Suspense fallback={null}>
      {route.name === 'forged' && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <ForgedPage
            wheels={catalog.wheels}
            finishes={catalog.finishes}
            region={region}
            onBack={goBack}
            onOpenRim={(rimId) => navigateTo({ name: 'rim', rimId })}
            onConfigure={(wheel) => {
              applyRim(wheel);
              setStep('wheels');
              setCameraView('frontWheel');
              navigateTo({ name: 'configure' });
            }}
          />
        </div>
      )}

      {route.name === 'rim' && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <RimDetailPage
            key={route.rimId}
            wheels={catalog.wheels}
            finishes={catalog.finishes}
            wheelId={route.rimId}
            loading={!catalogLoaded}
            initialFinishId={selectedFinish.id}
            initialSize={selectedSize}
            region={region}
            backLabel={rimReturnRef.current.name === 'configure' ? 'Back to your build' : 'Back'}
            onBack={() => navigateTo(rimReturnRef.current)}
            onOpenRim={(rimId) => navigateTo({ name: 'rim', rimId })}
            onConfigure={(wheel, finish, size) => {
              applyRim(wheel, finish, size);
              setStep('wheels');
              setCameraView('frontWheel');
              navigateTo({ name: 'configure' });
            }}
          />
        </div>
      )}

      {(route.name === 'terms' || route.name === 'delivery') && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <InfoPage
            key={route.name}
            content={route.name === 'terms' ? TERMS : DELIVERY}
            onBack={goBack}
            onEnquire={() => setEnquiryOpen(true)}
          />
        </div>
      )}

      {route.name === 'admin' && (
        <div className="absolute inset-0 z-[60] animate-fadeIn">
          <AdminPage onBack={() => navigateTo({ name: 'welcome' })} onCatalogChanged={reloadCatalog} />
        </div>
      )}
      </Suspense>

      {onJourney && <BootLoader progress={bootProgress} ready={booted} />}
    </div>
  );
};

export default App;
