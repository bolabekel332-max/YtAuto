import React, { Suspense, lazy } from 'react';
import { StoreProvider, useStore } from './state/store';
import { AppShell } from './ui/components/AppShell';

const Analytics = lazy(() =>
  import('./ui/pages/Analytics').then((m) => ({ default: m.Analytics }))
);
const Audit = lazy(() => import('./ui/pages/Audit').then((m) => ({ default: m.Audit })));
const Ideas = lazy(() => import('./ui/pages/Ideas').then((m) => ({ default: m.Ideas })));
const Knowledge = lazy(() =>
  import('./ui/pages/Knowledge').then((m) => ({ default: m.Knowledge }))
);
const ModelSettings = lazy(() =>
  import('./ui/pages/ModelSettings').then((m) => ({ default: m.ModelSettings }))
);
const SetupChannel = lazy(() =>
  import('./ui/pages/SetupChannel').then((m) => ({ default: m.SetupChannel }))
);
const StyleReferences = lazy(() =>
  import('./ui/pages/StyleReferences').then((m) => ({ default: m.StyleReferences }))
);
const VideoStudio = lazy(() =>
  import('./ui/pages/VideoStudio').then((m) => ({ default: m.VideoStudio }))
);

const StudioRouter: React.FC = () => {
  const { state } = useStore();

  const renderPage = () => {
    switch (state.currentScreen) {
      case 'setup':
        return <SetupChannel />;
      case 'style':
        return <StyleReferences />;
      case 'ideas':
        return <Ideas />;
      case 'studio':
        return <VideoStudio />;
      case 'audit':
        return <Audit />;
      case 'analytics':
        return <Analytics />;
      case 'knowledge':
        return <Knowledge />;
      case 'models':
        return <ModelSettings />;
    }
  };

  return (
    <AppShell>
      <Suspense
        fallback={
          <div role="status" className="p-6 text-xs text-slate-400">
            Memuat halaman...
          </div>
        }
      >
        {renderPage()}
      </Suspense>
    </AppShell>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <StudioRouter />
    </StoreProvider>
  );
}
