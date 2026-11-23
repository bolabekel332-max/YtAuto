import React, { useEffect } from 'react';
import { getAccessInfo, registerApiHandlers } from './api/client';
import { StoreProvider, useStore } from './state/store';
import { AccessGate } from './ui/components/AccessGate';
import { AppShell } from './ui/components/AppShell';
import { Analytics } from './ui/pages/Analytics';
import { Audit } from './ui/pages/Audit';
import { Ideas } from './ui/pages/Ideas';
import { Knowledge } from './ui/pages/Knowledge';
import { ModelSettings } from './ui/pages/ModelSettings';
import { SetupChannel } from './ui/pages/SetupChannel';
import { StyleReferences } from './ui/pages/StyleReferences';
import { VideoStudio } from './ui/pages/VideoStudio';

const StudioRouter: React.FC = () => {
  const { state, dispatch } = useStore();

  useEffect(() => {
    registerApiHandlers({
      onUnauthorized: () => {
        dispatch({
          type: 'SET_SESSION',
          patch: {
            gateEnabled: true,
            authRequiredPrompt: true,
            accessCode: '',
          },
        });
      },
    });

    let cancelled = false;
    getAccessInfo()
      .then((info) => {
        if (cancelled) return;
        dispatch({
          type: 'SET_SESSION',
          patch: {
            gateEnabled: info.gateEnabled,
            authRequiredPrompt: info.gateEnabled,
            authChecked: true,
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        dispatch({
          type: 'SET_SESSION',
          patch: {
            authChecked: true,
          },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const showGate =
    state.session.gateEnabled &&
    (!state.session.accessCode || state.session.authRequiredPrompt);

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
    <>
      {showGate && (
        <AccessGate
          onVerified={(accessCode) =>
            dispatch({
              type: 'SET_SESSION',
              patch: {
                accessCode,
                authRequiredPrompt: false,
                gateEnabled: true,
                authChecked: true,
              },
            })
          }
        />
      )}
      <AppShell>{renderPage()}</AppShell>
    </>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <StudioRouter />
    </StoreProvider>
  );
}
