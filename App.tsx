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
import { CREDITS, DELIVERY, TERMS } from './config/pages';
import { SavedConfiguration, accountColumnsMissing, configKey, findConfiguration, isConfigurationShared, saveConfiguration, submitEnquiry } from './services/journeyService';
import { Profile, getMyProfile, peekOAuthError, signInWithGoogle, useAuthUser } from './services/authService';
import { downloadBrochurePdf } from './services/brochurePdf';
import { IN_APP_STATE, cameFromApp } from './services/nav';
import { controlsInset, layoutMode } from './services/layout';
import { BootLoader } from './components/journey/BootLoader';
import { WelcomeGate } from './components/journey/WelcomeGate';
import { HERO_SLIDES } from './components/journey/HeroStage';
import { ConfigStep, Configurator, MoreOptionsModal } from './components/journey/Configurator';
import { SummaryPage } from './components/journey/SummaryPage';
import { EnquiryModal } from './components/journey/EnquiryModal';
import { AccountSheet } from './components/journey/AccountSheet';
import { Button, IconButton } from './components/journey/ui';
import { UserRound } from 'lucide-react';
import RenderedCarView, { RENDER_ASPECT, loadRenderManifest } from './components/journey/RenderedCarView';
import { backdropCss, hasBodies, loadFramesCars, loadStillsManifest, renderedStills, type FramesLayout } from './services/renderedBody';

// Pages off the main journey load on demand
const ForgedPage = lazy(() => import('./components/ForgedPage').then((m) => ({ default: m.ForgedPage })));
const RimDetailPage = lazy(() => import('./components/RimDetailPage').then((m) => ({ default: m.RimDetailPage })));
const InfoPage = lazy(() => import('./components/InfoPage').then((m) => ({ default: m.InfoPage })));
const DealerPage = lazy(() => import('./components/dealer/DealerPage').then((m) => ({ default: m.DealerPage })));
const AdminPage = lazy(() => import('./components/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

// Journey: welcome (choose the car on the carousel) -> configure (paint, wheel design, size, finish) -> summary.
// One 3D studio lives behind every stage; the camera moves between them instead of the page changing.

type Route =
  | { name: 'welcome' }
  | { name: 'configure' }
  | { name: 'summary' }
  | { name: 'forged' }
  | { name: 'admin' }
  | { name: 'dealer' }
  | { name: 'terms' }
  | { name: 'credits' }
  | { name: 'delivery' }
  | { name: 'rim'; rimId: string };

const routeFromLocation = (): Route => {
  if (typeof window === 'undefined') return { name: 'welcome' };
  const hash = window.location.hash.replace(/^#/, '');
  const path = (hash.startsWith('/') ? hash : window.location.pathname).toLowerCase().replace(/\/+$/, '');
  if (path === '/models') return { name: 'welcome' }; // the old model picker: its cars are on the welcome carousel now
  if (path === '/configure') return { name: 'configure' };
  if (path === '/summary') return { name: 'configure' }; // stills are captured on the way in
  if (path === '/forged' || hash === 'forged') return { name: 'forged' };
  if (path === '/admin' || hash === 'admin') return { name: 'admin' };
  if (path === '/dealer') return { name: 'dealer' };
  if (path === '/terms') return { name: 'terms' };
  if (path === '/delivery') return { name: 'delivery' };
  if (path === '/credits') return { name: 'credits' };
  const rim = path.match(/^\/rims\/([^/]+)$/);
  if (rim) return { name: 'rim', rimId: decodeURIComponent(rim[1]) };
  return { name: 'welcome' };
};

const routePath = (route: Route) =>
  ({
    welcome: '/',
    configure: '/configure',
    summary: '/summary',
    forged: '/forged',
    admin: '/admin',
    dealer: '/dealer',
    terms: '/terms',
    delivery: '/delivery',
    credits: '/credits',
    rim: route.name === 'rim' ? `/rims/${encodeURIComponent(route.rimId)}` : '/'
  })[route.name];

// Car fields that change what the engine renders for the body.
const carModelKey = (car: CarModel) =>
  JSON.stringify([car.id, car.modelUrl, car.modelRotationDeg, car.modelLengthM, car.paintMeshMatch, car.hideMeshMatch, car.bodyStyle]);

const pickFinish = (catalog: Catalog, wheel: WheelDesign, current?: WheelFinish) =>
  (current && wheel.availableVariants.includes(current.id) && catalog.finishes[current.id]) ||
  catalog.finishes[wheel.defaultVariant] ||
  Object.values(catalog.finishes)[0];

/**
 * Cars with a real body make the line-up: a 3D model, or Blender frames only (frames-only cars have no GLB by
 * licence, see renderedBody.ts FramesLayout); the simple procedural bodies are only a fallback.
 */
const lineUpCars = (cars: CarModel[], framesCars: Record<string, FramesLayout> = {}) => {
  const active = cars.filter((c) => c.active !== false);
  const withModels = active.filter((c) => c.modelUrl || framesCars[c.id]);
  return withModels.length ? withModels : active.length ? active : cars;
};

/**
 * The car and paint a first visit starts on: the welcome carousel's first slide, so the engine has that car ready
 * behind the still and Enter has nothing to load. The paint is the still's when the car offers it (otherwise the
 * car's first factory paint).
 */
const firstCar = (cars: CarModel[]) => {
  const lineUp = lineUpCars(cars);
  return lineUp.find((c) => c.id === HERO_SLIDES[0].carId) ?? lineUp[0];
};

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

  // Frames-only cars (no GLB): known once renders/manifest.json is in, before the first car is mounted
  const [framesCars, setFramesCars] = useState<Record<string, FramesLayout>>({});
  const cars = useMemo(() => lineUpCars(catalog.cars, framesCars), [catalog.cars, framesCars]);
  /** The cars on offer, for the welcome carousel (it leaves out the slide of a car that is hidden). */
  const carIds = useMemo(() => cars.map((c) => c.id), [cars]);

  // The five choices
  const [selectedCar, setSelectedCar] = useState<CarModel>(() => firstCar(STATIC_CATALOG.cars));
  const [selectedPaint, setSelectedPaint] = useState<PaintColor>(
    () => pickPaintForCar(STATIC_CATALOG.paints, firstCar(STATIC_CATALOG.cars), HERO_SLIDES[0].paintId)!
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
  /** A car chosen on the welcome is still loading: the stage stays dark until it is in. */
  const [arriving, setArriving] = useState(false);
  const [step, setStep] = useState<ConfigStep>('overview');
  const [cameraView, setCameraView] = useState<CameraViewPreset>('frontThreeQuarter');
  // Cars with pre-rendered (Blender) bodies show those in the configurator; see RenderedCarView
  const [renderedCars, setRenderedCars] = useState<Record<string, string[]>>({});
  // Cars whose summary and PDF stills are Blender renders: those above, plus the ones that only have stills (renders/stills.json)
  const [stillCars, setStillCars] = useState<Record<string, string[]>>({});
  useEffect(() => {
    loadRenderManifest().then(setRenderedCars);
    loadStillsManifest().then(setStillCars);
  }, []);
  const [stage, setStage] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [summaryImages, setSummaryImages] = useState<string[]>([]);
  // The latest stills, for the PDF: it can be asked for before they are taken (they take a moment, and the gate has a form)
  const summaryImagesRef = useRef<string[]>([]);
  summaryImagesRef.current = summaryImages;
  /** The summary's three stills once they are there (the PDF prints exactly these), or whatever there is after 30 s. */
  const stillsForPdf = async () => {
    for (let waited = 0; summaryImagesRef.current.length < 3 && waited < 30000; waited += 200) await new Promise((r) => setTimeout(r, 200));
    return summaryImagesRef.current;
  };
  // shared: undefined while the copy every device can open is being written, false if it could not be
  const [configCode, setConfigCode] = useState<{ key: string; code: string; shared?: boolean } | null>(null);
  const saveToken = useRef(0);
  // the latest save's shared-copy promise, awaited before a build is put in the garage
  const pendingShared = useRef<{ code: string; shared: Promise<boolean> } | null>(null);

  // Customer account (Google sign-in through Supabase): the profile prefills the enquiry and PDF forms
  const user = useAuthUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let live = true;
    getMyProfile().then((p) => live && setProfile(p));
    return () => {
      live = false;
    };
  }, [user?.id]);
  const [accountOpen, setAccountOpen] = useState(false);
  // A sign-in that came back with an error (the visitor cancelled on Google's consent screen) opens the
  // account sheet, which reads and shows the message itself (takeOAuthError). Not on /admin: an expired
  // "set your password" link lands there with the same error parameters, and that is the admin's business
  useEffect(() => {
    if (routeFromLocation().name !== 'admin' && peekOAuthError() !== null) setAccountOpen(true);
  }, []);
  const [garageVersion, setGarageVersion] = useState(0);
  const contactPrefill = useMemo(
    () => (user ? { name: profile?.displayName ?? (user.user_metadata?.full_name as string | undefined) ?? '', email: profile?.email ?? user.email ?? '', phone: profile?.phone ?? '' } : undefined),
    [user, profile]
  );
  const avatarUrl = profile?.avatarUrl ?? (user?.user_metadata?.avatar_url as string | undefined) ?? (user?.user_metadata?.picture as string | undefined) ?? null;

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
    // The manifest first: a frames-only car mounted before it is known would get the placeholder body
    loadFramesCars()
      .then((frames) => {
        engine.setFramesCars(frames);
        setFramesCars(frames);
        return engine.loadCar(selectedCar);
      })
      .finally(() => {
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
    const car = catalog.cars.find((c) => c.id === selectedCar.id) ?? lineUpCars(catalog.cars, framesCars)[0];
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

  // Warm the neighbouring cars so car changes don't wait on downloads
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

  // Pre-rendered mode: a fixed-aspect stage, centred in the space the controls leave. The dark studio
  // backdrop is painted over the whole screen, sized to the stage, so it carries on past the stage's edges
  // (4:3 and portrait tablets) instead of stopping in a line above and below the car (backdropCss); the car
  // itself (the wheel close-up fills its frame) fades out at the edges that stop short (stageEdgeFade)
  // The frames are fixed views, so the turntable (Auto-rotate) shows the live model; a view chip goes back to its frame
  // A frames-only car is always its frame (it has no live body for the turntable to show)
  const framesCar = !!framesCars[selectedCar.id];
  const rendered = route.name === 'configure' && (framesCar || !autoRotate) && (renderedCars[selectedCar.id]?.includes(cameraView) ?? false);
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
  // the backdrop keeps the last stage's size while it fades out
  const [backdropFrame, setBackdropFrame] = useState<typeof stage>(null);
  useEffect(() => {
    if (stage) setBackdropFrame(stage);
  }, [stage]);
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
    // The configurator screen is the Cycles stills' stage (black backdrop, a pool of light on the floor) for cars
    // drawn live. The welcome's stills cover the canvas, so the stage is built there already, out of sight: its
    // reflections and shaders are ready when Enter shows it
    engine.setLook((route.name === 'configure' || route.name === 'welcome') && !rendered ? 'stage' : 'studio');
    engine.setRenderedBody(rendered);
    if (route.name === 'configure') engine.setAutoRotate(autoRotate); // the engine refuses to turn while a frame is showing
    engine.handleResize();
    applyInsetRef.current();
    if (route.name === 'configure') engine.setCameraPreset(cameraView, { instant: rendered });
  }, [rendered, stage, route.name]);

  // Keep the car centred in the space the panel leaves
  const applyInsetRef = useRef<() => void>(() => {});
  applyInsetRef.current = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (renderedRef.current) {
      engine.setViewInset(0, 0);
    } else if (route.name === 'configure' || route.name === 'welcome') {
      // the same sheet/panel rule and sizes as the CSS (services/layout.ts); the welcome's hidden canvas is
      // framed as the configurator, so Enter shows the car where it will stay
      const inset = controlsInset();
      engine.setViewInset(inset.right, inset.bottom);
    } else engine.setViewInset(0, 0);
  };
  // The current stage's camera preset (re-applied when the layout changes)
  const applyCameraRef = useRef<() => void>(() => {});
  applyCameraRef.current = () => {
    const engine = engineRef.current;
    if (!engine || !booted) return;
    if (route.name === 'welcome' || route.name === 'configure') engine.setCameraPreset(cameraView);
  };

  // Camera choreography per stage
  const revealedRef = useRef(false);
  /** The visitor has been in the configurator: their paint is theirs, and Enter on the same car keeps it. */
  const configuredRef = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !booted) return;
    engine.setPaused(!['welcome', 'configure'].includes(route.name));
    applyInsetRef.current();
    if (route.name === 'welcome') {
      // The stills cover the canvas: the engine stands ready in the configurator's framing and draws only when
      // something changes (no turntable behind the still)
      engine.setAutoRotate(false);
      engine.setCameraPreset(cameraView, { instant: true });
    } else if (route.name === 'configure') {
      configuredRef.current = true;
      engine.setAutoRotate(autoRotate);
      engine.setCameraPreset(cameraView);
      if (!revealedRef.current) engine.playReveal(); // the first time the stage is seen
      revealedRef.current = true;
    }
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
      // Cars are looked up in the line-up (active, with a body), the same with the bundled catalogue
      // (whose cars are not filtered) and Supabase's (which are): a saved car that was hidden falls back to
      // the first car on offer, like a retired wheel, so the car drawn is always one the panel can show
      let car = cars.find((c) => c.id === cfg.carId);
      if (!car && cars.length) {
        console.warn(`Configuration for car ${cfg.carId}, which is no longer offered: showing ${cars[0].id} instead`);
        car = cars[0];
      }
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
    [catalog, cars, choosePaint, applyRim, changeRegion]
  );

  const loadCode = useCallback(
    async (code: string) => {
      const found = await findConfiguration(code);
      if (!found || !applyConfig(found.config)) return false;
      const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const key = configKey(found.config);
      if (found.source === 'server') {
        setConfigCode({ key, code: clean, shared: true }); // the shared copy is where it came from
      } else {
        // Made in this browser: its save may still be running (pendingShared) or may have failed in an
        // earlier visit, so the server is asked (meanwhile the summary says the build is being saved)
        setConfigCode({ key, code: clean });
        const pending = pendingShared.current;
        (pending?.code === clean ? pending.shared : isConfigurationShared(clean)).then((shared) =>
          setConfigCode((c) => (c && c.code === clean ? { ...c, shared } : c))
        );
      }
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

  /**
   * Saves the current build under a fresh code and shows it at once; only the shared copy is awaited
   * (configCode.shared follows), and a save started for an earlier configuration can no longer overwrite this one.
   */
  const saveCurrent = (cfg: SavedConfiguration, key: string) => {
    const token = ++saveToken.current;
    const saved = saveConfiguration(cfg);
    pendingShared.current = { code: saved.code, shared: saved.shared };
    setConfigCode({ key, code: saved.code });
    saved.shared.then((shared) => {
      if (token === saveToken.current) setConfigCode((c) => (c && c.code === saved.code ? { ...c, shared } : c));
    });
    return saved;
  };

  /**
   * Resolves once nothing is in flight in the studio (a drive between cars, a wheel swap or a size change
   * still being prepared), when the engine can say so (settle); capped so the stills always land.
   */
  const settled = (engine: CarConfiguratorEngine): Promise<void> => {
    const settle = (engine as unknown as { settle?: () => Promise<void> }).settle;
    if (typeof settle !== 'function') return Promise.resolve();
    return Promise.race([settle.call(engine).catch(() => undefined), new Promise<void>((r) => setTimeout(r, 4000))]);
  };

  /** The summary's stills and configuration code, taken whenever the summary opens. */
  const stillsToken = useRef(0); // the latest request wins when stills finish out of order
  const stillsKey = useRef<string | null>(null); // the build the stills on screen were taken of
  const enterSummary = useCallback(() => {
    const cfg = currentConfig();
    const key = configKey(cfg);
    // The three stills are a few hundred ms of rendering and JPEG encoding on a phone: taken on the
    // next frame, after the summary page has painted, so the tap responds at once and the images
    // drop in (the page shows their frames meanwhile)
    const engine = engineRef.current;
    if (engine) {
      const views: CameraViewPreset[] = ['frontThreeQuarter', 'side', 'frontWheel'];
      const token = ++stillsToken.current;
      // Another build than the one in the stills on screen: show the empty frames, not the last build's
      // photos under this build's title (and never in its PDF)
      if (stillsKey.current !== key) setSummaryImages([]);
      stillsKey.current = key;
      const live = () => token === stillsToken.current && setSummaryImages(engine.captureViews(views));
      const take = () => {
        if (token !== stillsToken.current) return;
        // Cars with pre-rendered bodies get stills made the way the configurator draws them (same body, tone curve and
        // backdrop, live wheels on top); the others, or if that fails, the live 3D car
        if (!hasBodies(stillCars, selectedCar.id, views)) return live();
        renderedStills(engine, selectedCar.id, selectedPaint, views)
          .then((imgs) => (imgs.length === views.length ? token === stillsToken.current && setSummaryImages(imgs) : live()))
          .catch(live);
      };
      // A drive, wheel swap or size change the visitor just started finishes first, else the stills show a
      // half-way car or the previous wheel next to the new wheel's name and price
      settled(engine).then(() => requestAnimationFrame(take));
    }
    if (configCode?.key !== key) saveCurrent(cfg, key);
  }, [configCode, stillCars, selectedCar, selectedPaint, selectedWheel, selectedFinish, selectedSize, region]);
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

  // ----------------------------------------------------
  // Account and garage
  // ----------------------------------------------------
  /** The shared copy of the current code, once written (false when it could not be). */
  const awaitShared = async (code: string, maxMs?: number) => {
    const pending = pendingShared.current;
    if (!pending || pending.code !== code) return true; // a loaded code: already on the server
    return maxMs === undefined ? pending.shared : Promise.race([pending.shared, new Promise<boolean>((r) => setTimeout(() => r(true), maxMs))]);
  };
  /**
   * Google sign-in. The round trip reloads the page, so a build in progress (configurator, summary) is
   * kept under its configuration code and reopened through the /?config= link; from any other page the
   * visitor simply comes back to it.
   */
  const signIn = async (): Promise<string | null> => {
    let returnTo: string | undefined;
    if (route.name === 'configure' || route.name === 'summary') {
      const cfg = currentConfig();
      const key = configKey(cfg);
      const code = configCode?.key === key ? configCode.code : saveCurrent(cfg, key).code;
      await awaitShared(code, 4000); // give the shared copy a moment; the local copy opens it here regardless
      returnTo = `/?config=${code}`;
    }
    return signInWithGoogle(returnTo);
  };
  /**
   * "Save to garage" on the summary: always saves a NEW copy of the build under a fresh code owned by
   * the signed-in customer (saveConfiguration stamps the id and the name itself), which the summary
   * then shows. The code already on screen is never taken over: a share code opens a build, it is not
   * proof of authorship, so a build reached through someone else's link stays theirs (and their link
   * keeps working). True when it is in the garage; otherwise the message for the customer: the shared
   * copy could not be written, or it was written without the owner (the live database has not had the
   * accounts migration, so the row would never show in the garage).
   */
  const NOT_SHARED = 'This build is not on the server yet (saved on this device only). Check your connection and try again.';
  const NO_GARAGE = 'Saving to a garage is not switched on for this site yet. Your build is kept under its code: copy the link to come back to it.';
  const saveToGarage = async (name: string): Promise<true | string> => {
    if (accountColumnsMissing()) return NO_GARAGE; // an earlier write already found the columns missing: no row to waste
    const cfg = currentConfig();
    const token = ++saveToken.current;
    const { code, shared, stamped } = saveConfiguration(cfg, name);
    pendingShared.current = { code, shared };
    if (!(await shared)) return NOT_SHARED;
    if (!(await stamped)) return NO_GARAGE;
    if (token === saveToken.current) setConfigCode({ key: configKey(cfg), code, shared: true });
    setGarageVersion((v) => v + 1);
    return true;
  };

  const price = rimPrice(selectedWheel, selectedSize, selectedFinish.id);
  const carPaints = useMemo(() => paintsForCar(catalog.paints, selectedCar), [catalog.paints, selectedCar]);

  // The site's other pages and the enquiry, in the configurator's "More options" dialog (they were the
  // showroom's menu until the showroom went; "Start again" there is the way back to the welcome)
  const menuLinks = [
    { label: 'The wheels', onClick: () => navigateTo({ name: 'forged' }) },
    { label: 'Enquire', onClick: () => setEnquiryOpen(true) },
    { label: 'Delivery & fitment', onClick: () => navigateTo({ name: 'delivery' }) },
    { label: 'Terms & conditions', onClick: () => navigateTo({ name: 'terms' }) },
    { label: 'Credits', onClick: () => navigateTo({ name: 'credits' }) }
  ];

  const enquirySummary = `${selectedCar.name} · ${selectedPaint.name} · ${selectedWheel.name} ${selectedSize} in ${selectedFinish.name}`;
  const onJourney = ['welcome', 'configure'].includes(route.name);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-stage select-none">
      {/* The dark studio behind the pre-rendered car: charcoal, with the floor's pool of light under the car */}
      <div
        aria-hidden
        className="absolute inset-0 z-[4] pointer-events-none transition-opacity duration-500"
        style={{ background: backdropFrame ? backdropCss(backdropFrame, cameraView) : undefined, opacity: rendered && stage ? 1 : 0 }}
      />

      {rendered && stage && (
        <div className="absolute z-[5] pointer-events-none" style={{ ...stage, ...stageEdgeFade(stage) }}>
          <RenderedCarView carId={selectedCar.id} view={cameraView} paint={selectedPaint} />
        </div>
      )}

      {/* The studio: transparent WebGL canvas over the backdrop (only the wheels in rendered mode) */}
      <div
        ref={containerRef}
        style={rendered && stage ? stage : undefined}
        className={`absolute ${rendered && stage ? '' : 'inset-0'} z-10 transition-opacity duration-700 ${route.name === 'configure' ? 'cursor-grab active:cursor-grabbing' : ''} ${onJourney && !arriving ? 'opacity-100' : 'opacity-0'}`}
      />

      {booted && route.name === 'welcome' && (
        <WelcomeGate
          region={region}
          onRegionChange={changeRegion}
          startCarId={selectedCar.id}
          carIds={carIds}
          onSlide={(carId) => {
            // Fetch and parse the car on stage now, so Enter only has to mount it
            const car = cars.find((c) => c.id === carId);
            if (car && car.id !== selectedCar.id) engineRef.current?.preloadCar(car);
          }}
          onEnter={(carId, paintId) => {
            // Straight into the configurator on the car that was on stage, when it is in the line-up
            const car = cars.find((c) => c.id === carId) ?? selectedCar;
            const carChanged = car.id !== selectedCar.id;
            if (carChanged) {
              mountCar(car);
              // The stage stays dark until the new car is in (never the previous car for a moment). A failed
              // load keeps the current car; it must not surface as an unhandled rejection
              const engine = engineRef.current;
              if (engine) {
                setArriving(true);
                engine
                  .loadCar(car)
                  .catch((e) => console.warn('Could not open that car:', e))
                  .finally(() => setArriving(false));
              }
            }
            // The car arrives as it stood on the welcome stage: in the still's paint, when the car offers it.
            // A build already made on this car keeps its paint
            if (carChanged || !configuredRef.current) {
              const paint = paintsForCar(catalog.paints, car).find((x) => x.id === paintId);
              if (paint) {
                setSelectedPaint(paint);
                engineRef.current?.applyPaintColor(paint);
              }
            }
            setStep('overview');
            setCameraView('frontThreeQuarter');
            navigateTo({ name: 'configure' });
          }}
          onOpenForged={() => navigateTo({ name: 'forged' })}
        />
      )}

      {booted && route.name === 'configure' && (
        <Configurator
          car={selectedCar}
          cars={cars}
          onSelectCar={(car) => {
            const i = cars.findIndex((c) => c.id === car.id);
            if (i >= 0) stepCar(i > carIndex ? 1 : -1, i);
          }}
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
          onCamera={(view) => {
            // a view with a pre-rendered frame stops the turntable, so the frame shows
            if (autoRotate && renderedCars[selectedCar.id]?.includes(view)) {
              setAutoRotate(false);
              engineRef.current?.setAutoRotate(false);
            }
            selectView(view);
          }}
          onToggleRotate={framesCar ? undefined : toggleRotate}
          onPaint={choosePaint}
          onWheel={chooseWheel}
          onSize={chooseSize}
          onFinish={chooseFinish}
          onChangeModel={() => navigateTo({ name: 'welcome' })}
          onSummary={openSummary}
          onOpen360={(w) => navigateTo({ name: 'rim', rimId: w.id })}
          onOpenMore={() => setMoreOpen(true)}
        />
      )}
      {booted && route.name === 'configure' && (
        /* Account and garage, in the stage's top corner next to the panel (top-right above the sheet on phones) */
        <div className="absolute z-30 top-4 right-[calc(var(--panel-w)+8px)] sheet:right-4 animate-fade">
          <IconButton label="Account" onClick={() => setAccountOpen(true)} className="bg-surface/70 ring-1 ring-line backdrop-blur hover:bg-surface">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <UserRound className="h-[18px] w-[18px]" strokeWidth={1.6} />
            )}
          </IconButton>
        </div>
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
          signedIn={!!user}
          onSaveToGarage={saveToGarage}
          onSignIn={() => setAccountOpen(true)}
          contactPrefill={contactPrefill}
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
              images: await stillsForPdf()
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
        onOpenAccount={() => setAccountOpen(true)}
        links={menuLinks}
      />

      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        stageCarId={selectedCar.id}
        user={user}
        profile={profile}
        onProfile={setProfile}
        onSignIn={signIn}
        onOpenBuild={async (code) => {
          const ok = await loadCode(code);
          if (ok) setAccountOpen(false);
          return ok;
        }}
        onDeleted={(code) => {
          // The summary must not keep showing a code whose shared copy is gone: while it is open, the build on
          // screen gets a fresh code as on the way in (Share, PDF and Save to garage keep working); elsewhere the
          // code is dropped and the summary makes one when it opens
          if (configCode?.code !== code) return;
          if (route.name !== 'summary') return setConfigCode(null);
          const cfg = currentConfig();
          saveCurrent(cfg, configKey(cfg));
        }}
        cars={catalog.cars}
        paints={catalog.paints}
        wheels={catalog.wheels}
        finishes={catalog.finishes}
        garageVersion={garageVersion}
      />

      <EnquiryModal
        open={enquiryOpen}
        onClose={() => setEnquiryOpen(false)}
        summary={enquirySummary}
        prefill={contactPrefill}
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
            // the enquiry form sends the current build, so the rim on this page goes onto it first
            onEnquire={(wheel, finish, size) => {
              applyRim(wheel, finish, size);
              setEnquiryOpen(true);
            }}
          />
        </div>
      )}

      {(route.name === 'terms' || route.name === 'delivery' || route.name === 'credits') && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <InfoPage
            key={route.name}
            content={route.name === 'terms' ? TERMS : route.name === 'delivery' ? DELIVERY : CREDITS}
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
      {route.name === 'dealer' && (
        <div className="absolute inset-0 z-[60] animate-fadeIn">
          <DealerPage onBack={() => navigateTo({ name: 'welcome' })} />
        </div>
      )}
      </Suspense>

      {onJourney && <BootLoader progress={bootProgress} ready={booted} />}
    </div>
  );
};

export default App;
