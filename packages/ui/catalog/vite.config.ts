import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root,plugins:[react()],resolve:{alias:{'@stardrop/ui/icons':root+'../src/icons.ts','@stardrop/ui/styles.css':root+'../src/styles.css','@stardrop/ui':root+'../src/index.jsx'},dedupe:['react','react-dom']},server:{host:'127.0.0.1'},build:{outDir:'../catalog-dist',emptyOutDir:true}});
