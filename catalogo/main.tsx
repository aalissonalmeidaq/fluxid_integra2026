import React from 'react';
import ReactDOM from 'react-dom/client';
import { Catalogo } from './catalogo';
import './catalogo.css';

const raiz = document.getElementById('root');
if (raiz) {
  ReactDOM.createRoot(raiz).render(
    <React.StrictMode>
      <Catalogo />
    </React.StrictMode>,
  );
}
