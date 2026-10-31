import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({esbuild:{jsx:'automatic',jsxImportSource:'react'},build:{outDir:root+'dist',emptyOutDir:true,lib:{entry:{index:root+'src/index.jsx',icons:root+'src/icons.ts'},formats:['es'],fileName:(_,name)=>name+'.js'},rollupOptions:{external:id=>/^(react|react-dom|lucide-react)(\/|$)/.test(id)}}});
