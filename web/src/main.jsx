import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

import App from './App';
import HomePage from './pages/HomePage';
import BroadcasterPage from './pages/BroadcasterPage';
import CoHostPage from './pages/CoHostPage';
import ViewerPage from './pages/ViewerPage';
import NotFoundPage from './pages/NotFoundPage';

import { attachBroadcastHandlers } from './handlers/broadcastHandlers';
import { attachViewerHandlers } from './handlers/viewerHandlers';
import { startConnectionMonitor } from './utils/connection';

// Wire global handlers + monitors ONCE at boot.
attachBroadcastHandlers();
attachViewerHandlers();
startConnectionMonitor();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="broadcast/:id" element={<BroadcasterPage />} />
          <Route path="cohost/:id" element={<CoHostPage />} />
          <Route path="watch/:id" element={<ViewerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
