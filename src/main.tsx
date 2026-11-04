import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import NeonAuthPreview from './NeonAuthPreview';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NeonAuthPreview />
  </StrictMode>
);
