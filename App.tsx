/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CarConfiguratorEngine } from './services/CarConfiguratorEngine';
import { ConfiguratorHeader } from './components/ConfiguratorHeader';
import { WheelDrawer } from './components/WheelDrawer';
import { BottomColorBar } from './components/BottomColorBar';
import { StudioControls } from './components/StudioControls';
import { BrochureModal } from './components/BrochureModal';
import { ForgedPage } from './components/ForgedPage';
import { RimDetailPage } from './components/RimDetailPage';
import { AdminPage } from './components/admin/AdminPage';
import { Catalog, STATIC_CATALOG, fetchCatalog } from './services/catalogService';
import { nearestRimSize, rimPrice } from './services/pricing';
import {
  CarModel,
  PaintColor,
  WheelDesign,
  WheelFinish,
  CameraViewPreset,
  BrochureLead
} from './types';
import { Sparkles, Loader2 } from 'lucide-react';

// The configurator offers five choices: car, paint, rim design, rim size, rim colour (finish).

type Route =
  | { name: 'studio' }
  | { name: 'forged' }
  | { name: 'admin' }
  | { name: 'rim'; rimId: string };

const routeFromLocation = (): Route => {
  if (typeof window === 'undefined') return { name: 'studio' };
  const hash = window.location.hash.replace(/^#/, '');
  const path = (hash.startsWith('/') ? hash : window.location.pathname).toLowerCase().replace(/\/+$/, '');
  if (path === '/forged' || hash === 'forged') return { name: 'forged' };
  if (path === '/admin' || hash === 'admin') return { name: 'admin' };
  const rim = path.match(/^\/rims\/([^/]+)$/);
  if (rim) return { name: 'rim', rimId: decodeURIComponent(rim[1]) };
  return { name: 'studio' };
};

const routePath = (route: Route) =>
  route.name === 'studio' ? '/' : route.name === 'rim' ? `/rims/${encodeURIComponent(route.rimId)}` : `/${route.name}`;

// Car fields that change what the engine renders for the body.
const carModelKey = (car: CarModel) =>
  JSON.stringify([car.id, car.modelUrl, car.modelRotationDeg, car.modelLengthM, car.paintMeshMatch, car.hideMeshMatch, car.bodyStyle]);

const pickFinish = (catalog: Catalog, wheel: WheelDesign, current?: WheelFinish) =>
  (current && wheel.availableVariants.includes(current.id) && catalog.finishes[current.id]) ||
  catalog.finishes[wheel.defaultVariant] ||
  Object.values(catalog.finishes)[0];

export const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CarConfiguratorEngine | null>(null);
  const loadedCarKeyRef = useRef<string | null>(null);

  // Catalogue: bundled data first, replaced by the Supabase catalogue once it loads
  const [catalog, setCatalog] = useState<Catalog>(STATIC_CATALOG);
  const reloadCatalog = useCallback(() => {
    fetchCatalog().then(({ catalog: next }) => setCatalog(next));
  }, []);
  useEffect(() => { reloadCatalog(); }, [reloadCatalog]);

  // The five configuration choices
  const [selectedCar, setSelectedCar] = useState<CarModel>(STATIC_CATALOG.cars[0]);
  const [selectedPaint, setSelectedPaint] = useState<PaintColor>(STATIC_CATALOG.paints[0]);
  const [selectedWheel, setSelectedWheel] = useState<WheelDesign>(STATIC_CATALOG.wheels[0]);
  const [selectedFinish, setSelectedFinish] = useState<WheelFinish>(STATIC_CATALOG.finishes.liquid_metal);
  const [selectedSize, setSelectedSize] = useState<string>('20"');

  // UI & Drawer state
  const [isVehicleDrawerOpen, setIsVehicleDrawerOpen] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [currentCameraView, setCurrentCameraView] = useState<CameraViewPreset>('frontThreeQuarter');
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);
  const [isBrochureModalOpen, setIsBrochureModalOpen] = useState<boolean>(false);
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);

  // Routing: studio (/), /forged, /admin, /rims/:id
  const [route, setRoute] = useState<Route>(routeFromLocation);

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigateTo = useCallback((next: Route) => {
    setRoute(next);
    const path = routePath(next);
    try {
      window.history.pushState({}, '', path);
    } catch {
      window.location.hash = `#${path}`;
    }
  }, []);

  // Pause the studio render loop while another page covers it (the rim page runs its own 3D view)
  useEffect(() => {
    engineRef.current?.setPaused(route.name !== 'studio');
  }, [route]);

  // Initialize Three.js Engine
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new CarConfiguratorEngine(containerRef.current, () => {
      setIsEngineReady(true);
    });
    engineRef.current = engine;

    loadedCarKeyRef.current = carModelKey(selectedCar);
    engine.loadCar(selectedCar);
    engine.applyPaintColor(selectedPaint);
    engine.applyWheelDesign(selectedWheel);
    engine.applyWheelFinish(selectedFinish);
    engine.setRimSize(selectedSize);
    engine.setPaused(route.name !== 'studio');

    const handleResize = () => engine.handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.cleanup();
      engineRef.current = null;
    };
  }, []);

  // After a catalogue load or admin edit, point selections at the fresh rows (prices, assets)
  // and push them to the engine. Runs on catalogue changes only; reads the current selections.
  useEffect(() => {
    const car = catalog.cars.find((c) => c.id === selectedCar.id) ?? catalog.cars[0];
    const paint = catalog.paints.find((p) => p.id === selectedPaint.id) ?? catalog.paints[0];
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

  const handleSelectCar = useCallback((car: CarModel) => {
    setSelectedCar(car);
    loadedCarKeyRef.current = carModelKey(car);
    engineRef.current?.loadCar(car);
  }, []);

  const handleSelectPaint = useCallback((paint: PaintColor) => {
    setSelectedPaint(paint);
    engineRef.current?.applyPaintColor(paint);
  }, []);

  /** Rim design, colour and size together; keeps the colour/size when the new rim offers them. */
  const applyRim = useCallback((wheel: WheelDesign, finish?: WheelFinish, size?: string) => {
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
  }, [catalog, selectedFinish, selectedSize]);

  const handleSelectWheel = useCallback((wheel: WheelDesign) => applyRim(wheel), [applyRim]);

  const handleSelectFinish = useCallback((finish: WheelFinish) => {
    setSelectedFinish(finish);
    engineRef.current?.applyWheelFinish(finish);
  }, []);

  const handleSelectSize = useCallback((size: string) => {
    setSelectedSize(size);
    engineRef.current?.setRimSize(size);
  }, []);

  const handleSelectCameraView = useCallback((view: CameraViewPreset) => {
    setCurrentCameraView(view);
    engineRef.current?.setCameraPreset(view);
  }, []);

  const handleFocusWheelCamera = useCallback(() => handleSelectCameraView('frontWheel'), [handleSelectCameraView]);

  const handleToggleAutoRotate = useCallback(() => {
    setIsAutoRotate((prev) => {
      const next = !prev;
      engineRef.current?.setAutoRotate(next);
      return next;
    });
  }, []);

  // From a rim detail page: put that rim on the car and show it up close
  const handleConfigureFromRimPage = useCallback((wheel: WheelDesign, finish: WheelFinish, size: string) => {
    applyRim(wheel, finish, size);
    navigateTo({ name: 'studio' });
    setIsVehicleDrawerOpen(false);
    setIsDrawerOpen(true);
    handleSelectCameraView('frontWheel');
  }, [applyRim, navigateTo, handleSelectCameraView]);

  // Brochure leads are kept in this browser only (see docs/HANDOVER.md)
  const handleSaveLead = useCallback((newLead: BrochureLead) => {
    try {
      const saved = JSON.parse(localStorage.getItem('apex_forged_brochure_leads') || '[]');
      localStorage.setItem('apex_forged_brochure_leads', JSON.stringify([newLead, ...saved]));
    } catch (e) {
      console.error('Failed to save lead to localStorage', e);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0b0d] select-none">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Loading Overlay */}
      {!isEngineReady && (
        <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <Loader2 className="w-10 h-10 text-[#FF5500] animate-spin" />
            <Sparkles className="w-4 h-4 text-[#FF5500] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="text-center">
            <div className="text-white font-extrabold tracking-widest text-sm uppercase font-mono">
              APEX FORGED 3D STUDIO
            </div>
            <p className="text-neutral-500 text-xs mt-1 font-mono">
              Loading your car and forged wheels...
            </p>
          </div>
        </div>
      )}

      <ConfiguratorHeader
        car={selectedCar}
        wheel={selectedWheel}
        finish={selectedFinish}
        paint={selectedPaint}
        onOpenBrochure={() => setIsBrochureModalOpen(true)}
        onNavigateToForged={() => navigateTo({ name: 'forged' })}
      />

      {/* Camera views & turntable */}
      <StudioControls
        currentView={currentCameraView}
        isAutoRotate={isAutoRotate}
        isDrawerOpen={isVehicleDrawerOpen || isDrawerOpen}
        onSelectView={handleSelectCameraView}
        onToggleAutoRotate={handleToggleAutoRotate}
      />

      {/* Car & paint drawer */}
      <BottomColorBar
        cars={catalog.cars}
        paints={catalog.paints}
        selectedCar={selectedCar}
        selectedPaint={selectedPaint}
        isOpen={isVehicleDrawerOpen}
        onToggleOpen={() => {
          setIsVehicleDrawerOpen((prev) => {
            const next = !prev;
            if (next) setIsDrawerOpen(false);
            return next;
          });
        }}
        onSelectCar={handleSelectCar}
        onSelectPaint={handleSelectPaint}
        onOpenWheelDrawer={() => {
          setIsVehicleDrawerOpen(false);
          setIsDrawerOpen(true);
        }}
      />

      {/* Rim design, size & colour drawer */}
      <WheelDrawer
        wheels={catalog.wheels}
        finishes={catalog.finishes}
        selectedWheel={selectedWheel}
        selectedFinish={selectedFinish}
        selectedSize={selectedSize}
        car={selectedCar}
        isOpen={isDrawerOpen}
        onToggleOpen={() => {
          setIsDrawerOpen((prev) => {
            const next = !prev;
            if (next) setIsVehicleDrawerOpen(false);
            return next;
          });
        }}
        onSelectWheel={handleSelectWheel}
        onSelectFinish={handleSelectFinish}
        onSelectSize={handleSelectSize}
        onFocusWheelCamera={handleFocusWheelCamera}
        onOpenBrochure={() => setIsBrochureModalOpen(true)}
        onViewRim={(wheel) => navigateTo({ name: 'rim', rimId: wheel.id })}
      />

      <BrochureModal
        isOpen={isBrochureModalOpen}
        onClose={() => setIsBrochureModalOpen(false)}
        car={selectedCar}
        paint={selectedPaint}
        wheel={selectedWheel}
        finish={selectedFinish}
        wheelSize={selectedSize}
        price={rimPrice(selectedWheel, selectedSize)}
        onSaveLead={handleSaveLead}
      />

      {route.name === 'forged' && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <ForgedPage onBackToStudio={() => navigateTo({ name: 'studio' })} />
        </div>
      )}

      {route.name === 'rim' && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <RimDetailPage
            key={route.rimId}
            wheels={catalog.wheels}
            finishes={catalog.finishes}
            wheelId={route.rimId}
            initialFinishId={selectedFinish.id}
            initialSize={selectedSize}
            onBack={() => navigateTo({ name: 'studio' })}
            onOpenRim={(rimId) => navigateTo({ name: 'rim', rimId })}
            onConfigure={handleConfigureFromRimPage}
          />
        </div>
      )}

      {route.name === 'admin' && (
        <div className="absolute inset-0 z-[60] animate-fadeIn">
          <AdminPage onBack={() => navigateTo({ name: 'studio' })} onCatalogChanged={reloadCatalog} />
        </div>
      )}
    </div>
  );
};

export default App;
