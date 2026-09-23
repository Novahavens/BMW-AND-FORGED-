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
import { TwoDToThreeDGuideModal } from './components/TwoDToThreeDGuideModal';
import { LeadsManagerModal } from './components/LeadsManagerModal';
import { ForgedPage } from './components/ForgedPage';
import { AdminPage } from './components/admin/AdminPage';
import { Catalog, STATIC_CATALOG, fetchCatalog } from './services/catalogService';
import { 
  CarModel, 
  PaintColor, 
  WheelDesign, 
  WheelFinish, 
  CaliperColor, 
  CameraViewPreset, 
  StudioTheme, 
  BrochureLead,
  Custom2DWheelConfig 
} from './types';
import { Sparkles, Loader2 } from 'lucide-react';

type Route = 'studio' | 'forged' | 'admin';

const routeFromLocation = (): Route => {
  if (typeof window === 'undefined') return 'studio';
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  const hash = window.location.hash.toLowerCase();
  if (path === '/forged' || hash === '#/forged' || hash === '#forged') return 'forged';
  if (path === '/admin' || hash === '#/admin' || hash === '#admin') return 'admin';
  return 'studio';
};

// Car fields that change what the engine renders for the body.
const carModelKey = (car: CarModel) =>
  JSON.stringify([car.id, car.modelUrl, car.modelRotationDeg, car.modelLengthM, car.paintMeshMatch, car.hideMeshMatch, car.bodyStyle]);

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

  // Core Configuration State
  const [selectedCar, setSelectedCar] = useState<CarModel>(STATIC_CATALOG.cars[0]); // M4 Competition
  const [selectedPaint, setSelectedPaint] = useState<PaintColor>(STATIC_CATALOG.paints[0]); // Isle of Man Green
  const [selectedWheel, setSelectedWheel] = useState<WheelDesign>(STATIC_CATALOG.wheels[0]); // FW-01 Monoblock GT3
  const [selectedFinish, setSelectedFinish] = useState<WheelFinish>(STATIC_CATALOG.finishes.liquid_metal); // Liquid Metal
  const [selectedSize, setSelectedSize] = useState<string>('20"');
  const [selectedCaliper, setSelectedCaliper] = useState<CaliperColor>(STATIC_CATALOG.calipers[0]); // M Blue
  const [rideHeight, setRideHeight] = useState<number>(0);

  // Custom 2D image projection state
  const [custom2DConfig, setCustom2DConfig] = useState<Custom2DWheelConfig | null>(null);

  // UI & Drawer state
  const [isVehicleDrawerOpen, setIsVehicleDrawerOpen] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [currentCameraView, setCurrentCameraView] = useState<CameraViewPreset>('frontThreeQuarter');
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);
  const [isSpinningWheels, setIsSpinningWheels] = useState<boolean>(false);
  const [isBloomEnabled, setIsBloomEnabled] = useState<boolean>(true);
  const [studioTheme, setStudioTheme] = useState<StudioTheme>('studio_dark');

  // Modals state
  const [isBrochureModalOpen, setIsBrochureModalOpen] = useState<boolean>(false);
  const [is2DGuideModalOpen, setIs2DGuideModalOpen] = useState<boolean>(false);
  const [isLeadsModalOpen, setIsLeadsModalOpen] = useState<boolean>(false);

  // Route State: 'studio' (3D Configurator), 'forged' (Forged Monoblock Showcase Page) or 'admin'
  const [currentRoute, setCurrentRoute] = useState<Route>(routeFromLocation);

  // Keep route synced with browser back/forward buttons & URL hash/path
  useEffect(() => {
    const handlePopState = () => setCurrentRoute(routeFromLocation());

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigateTo = useCallback((route: Route) => {
    setCurrentRoute(route);
    if (typeof window !== 'undefined') {
      const targetPath = route === 'studio' ? '/' : `/${route}`;
      try {
        window.history.pushState({ route }, '', targetPath);
      } catch {
        window.location.hash = `#${targetPath}`;
      }
    }
  }, []);

  // Loading state
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);

  // Collected Brochure Leads (Stored in localStorage)
  const [leads, setLeads] = useState<BrochureLead[]>(() => {
    try {
      const saved = localStorage.getItem('apex_forged_brochure_leads');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Initialize Three.js Engine
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new CarConfiguratorEngine(containerRef.current, () => {
      setIsEngineReady(true);
    });
    engineRef.current = engine;

    // Apply initial config
    loadedCarKeyRef.current = carModelKey(selectedCar);
    engine.loadCar(selectedCar);
    engine.applyPaintColor(selectedPaint);
    engine.applyWheelDesign(selectedWheel);
    engine.applyWheelFinish(selectedFinish);
    engine.applyCaliperColor(selectedCaliper);

    const handleResize = () => {
      engine.handleResize();
    };
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
    const finish =
      (wheel.availableVariants.includes(selectedFinish.id) && catalog.finishes[selectedFinish.id]) ||
      catalog.finishes[wheel.defaultVariant] ||
      Object.values(catalog.finishes)[0];
    const caliper = catalog.calipers.find((c) => c.id === selectedCaliper.id) ?? catalog.calipers[0];
    if (!car || !paint || !wheel || !finish || !caliper) return;

    setSelectedCar(car);
    setSelectedPaint(paint);
    setSelectedWheel(wheel);
    setSelectedFinish(finish);
    setSelectedCaliper(caliper);

    const engine = engineRef.current;
    if (!engine) return;
    const key = carModelKey(car);
    if (key !== loadedCarKeyRef.current) {
      loadedCarKeyRef.current = key;
      engine.loadCar(car);
    }
    engine.applyPaintColor(paint);
    engine.applyWheelDesign(wheel, custom2DConfig || undefined);
    engine.applyWheelFinish(finish);
    engine.applyCaliperColor(caliper);
  }, [catalog]);

  // Update Paint on 3D Car
  const handleSelectPaint = useCallback((paint: PaintColor) => {
    setSelectedPaint(paint);
    engineRef.current?.applyPaintColor(paint);
  }, []);

  // Update Car Model on 3D Car
  const handleSelectCar = useCallback((car: CarModel) => {
    setSelectedCar(car);
    if (engineRef.current) {
      loadedCarKeyRef.current = carModelKey(car);
      engineRef.current.loadCar(car);
      // Re-apply paint and ride height
      engineRef.current.applyPaintColor(selectedPaint);
      engineRef.current.setRideHeight(rideHeight);
      engineRef.current.applyWheelDesign(selectedWheel, custom2DConfig || undefined);
    }
  }, [selectedPaint, rideHeight, selectedWheel, custom2DConfig]);

  // Update Wheel Model
  const handleSelectWheel = useCallback((wheel: WheelDesign) => {
    setSelectedWheel(wheel);
    // Auto select default variant if current finish not available for this wheel
    const isCurrentFinishAvailable = wheel.availableVariants.includes(selectedFinish.id);
    const newFinish = isCurrentFinishAvailable 
      ? selectedFinish 
      : (catalog.finishes[wheel.defaultVariant] || Object.values(catalog.finishes)[0]);

    setSelectedFinish(newFinish);
    setCustom2DConfig(null); // Return to 3D procedural wheel

    if (engineRef.current) {
      engineRef.current.applyWheelDesign(wheel);
      engineRef.current.applyWheelFinish(newFinish);
    }
  }, [selectedFinish, catalog]);

  // Update Finish Variant ('bronze', 'liquid metal', 'black', etc.)
  const handleSelectFinish = useCallback((finish: WheelFinish) => {
    setSelectedFinish(finish);
    engineRef.current?.applyWheelFinish(finish);
  }, []);

  // Update Caliper Color
  const handleSelectCaliper = useCallback((caliper: CaliperColor) => {
    setSelectedCaliper(caliper);
    engineRef.current?.applyCaliperColor(caliper);
  }, []);

  // Update Stance / Ride Height
  const handleSelectRideHeight = useCallback((height: number) => {
    setRideHeight(height);
    engineRef.current?.setRideHeight(height);
  }, []);

  // Camera Presets
  const handleSelectCameraView = useCallback((view: CameraViewPreset) => {
    setCurrentCameraView(view);
    engineRef.current?.setCameraPreset(view);
  }, []);

  // Focus directly onto front wheel macro
  const handleFocusWheelCamera = useCallback(() => {
    setCurrentCameraView('frontWheel');
    engineRef.current?.setCameraPreset('frontWheel');
  }, []);

  // Turntable Auto-rotate
  const handleToggleAutoRotate = useCallback(() => {
    setIsAutoRotate((prev) => {
      const next = !prev;
      engineRef.current?.setAutoRotate(next);
      return next;
    });
  }, []);

  // Spin Wheels (Dyno / Drive mode)
  const handleToggleWheelSpin = useCallback(() => {
    setIsSpinningWheels((prev) => {
      const next = !prev;
      engineRef.current?.setSpinningWheels(next, 60);
      return next;
    });
  }, []);

  // Post-Processing Bloom Pass Toggle
  const handleToggleBloom = useCallback(() => {
    setIsBloomEnabled((prev) => {
      const next = !prev;
      engineRef.current?.setBloomEnabled(next);
      return next;
    });
  }, []);

  // Studio Theme
  const handleChangeStudioTheme = useCallback((theme: StudioTheme) => {
    setStudioTheme(theme);
    engineRef.current?.setupStudioLighting(theme);
  }, []);

  // Custom 2D Wheel apply
  const handleApplyCustom2DWheel = useCallback((config: Custom2DWheelConfig | null) => {
    setCustom2DConfig(config);
    if (config && engineRef.current) {
      engineRef.current.applyWheelDesign(selectedWheel, config);
      setCurrentCameraView('frontWheel');
      engineRef.current.setCameraPreset('frontWheel');
    } else if (!config && engineRef.current) {
      engineRef.current.applyWheelDesign(selectedWheel);
    }
  }, [selectedWheel]);

  // Lead Collection
  const handleSaveLead = useCallback((newLead: BrochureLead) => {
    setLeads((prev) => {
      const updated = [newLead, ...prev];
      try {
        localStorage.setItem('apex_forged_brochure_leads', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save lead to localStorage', e);
      }
      return updated;
    });
  }, []);

  const handleClearLeads = useCallback(() => {
    setLeads([]);
    try {
      localStorage.removeItem('apex_forged_brochure_leads');
    } catch {}
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
              Loading BMW M Chassis & Photorealistic Forged Wheel Shaders...
            </p>
          </div>
        </div>
      )}

      {/* Vercel Geometric Header */}
      <ConfiguratorHeader
        car={selectedCar}
        wheel={selectedWheel}
        finish={selectedFinish}
        paint={selectedPaint}
        onOpenBrochure={() => setIsBrochureModalOpen(true)}
        onOpen2DGuide={() => setIs2DGuideModalOpen(true)}
        onNavigateToForged={() => navigateTo('forged')}
      />

      {/* Camera & Studio Controls HUD */}
      <StudioControls
        currentView={currentCameraView}
        isAutoRotate={isAutoRotate}
        isSpinningWheels={isSpinningWheels}
        studioTheme={studioTheme}
        isBloomEnabled={isBloomEnabled}
        isDrawerOpen={isVehicleDrawerOpen || isDrawerOpen}
        onSelectView={handleSelectCameraView}
        onToggleAutoRotate={handleToggleAutoRotate}
        onToggleWheelSpin={handleToggleWheelSpin}
        onChangeStudioTheme={handleChangeStudioTheme}
        onToggleBloom={handleToggleBloom}
      />

      {/* Vehicle Specification & Colour Side Drawer (Right Side) */}
      <BottomColorBar
        cars={catalog.cars}
        paints={catalog.paints}
        calipers={catalog.calipers}
        selectedCar={selectedCar}
        selectedPaint={selectedPaint}
        selectedCaliper={selectedCaliper}
        rideHeight={rideHeight}
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
        onSelectCaliper={handleSelectCaliper}
        onSelectRideHeight={handleSelectRideHeight}
        onOpenWheelDrawer={() => {
          setIsVehicleDrawerOpen(false);
          setIsDrawerOpen(true);
        }}
      />

      {/* Right-Hand Side Sliding Wheel & Variants Drawer */}
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
        onSelectSize={setSelectedSize}
        onFocusWheelCamera={handleFocusWheelCamera}
        onOpenBrochure={() => setIsBrochureModalOpen(true)}
        onOpen2DGuide={() => setIs2DGuideModalOpen(true)}
      />

      {/* Brochure Request & Lead Capture Modal */}
      <BrochureModal
        isOpen={isBrochureModalOpen}
        onClose={() => setIsBrochureModalOpen(false)}
        car={selectedCar}
        paint={selectedPaint}
        wheel={selectedWheel}
        finish={selectedFinish}
        caliper={selectedCaliper}
        wheelSize={selectedSize}
        onSaveLead={handleSaveLead}
      />

      {/* 2D to 3D Wheel Conversion Guide & Live Image Projection Modal */}
      <TwoDToThreeDGuideModal
        isOpen={is2DGuideModalOpen}
        onClose={() => setIs2DGuideModalOpen(false)}
        onApplyCustom2DWheel={handleApplyCustom2DWheel}
        activeCustomConfig={custom2DConfig}
      />

      {/* Collected Leads / Business Inquiry Records Modal */}
      <LeadsManagerModal
        isOpen={isLeadsModalOpen}
        onClose={() => setIsLeadsModalOpen(false)}
        leads={leads}
        onClearLeads={handleClearLeads}
      />

      {/* Route: Forged Page Showcase with Neon Orange Gradient Beams */}
      {currentRoute === 'forged' && (
        <div className="absolute inset-0 z-50 animate-fadeIn">
          <ForgedPage onBackToStudio={() => navigateTo('studio')} />
        </div>
      )}

      {/* Route: Admin sign-in & catalogue / asset manager */}
      {currentRoute === 'admin' && (
        <div className="absolute inset-0 z-[60] animate-fadeIn">
          <AdminPage onBack={() => navigateTo('studio')} onCatalogChanged={reloadCatalog} />
        </div>
      )}
    </div>
  );
};

export default App;
