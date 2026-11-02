import './index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { store } from './lib/store';

store.loadConfig();

createRoot(document.getElementById('root')!).render(<App />);
