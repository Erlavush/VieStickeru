'use client';

import { useState } from 'react';
import { StickerEditor } from '@/components/StickerEditor';
import { DropZone } from '@/components/ui/DropZone';
import { AnimatePresence, motion } from 'framer-motion';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);

  return (
    <main className="h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience - Subtle Professional Glow */}
      <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-violet-900/10 rounded-full blur-[100px] -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[100px] translate-y-1/2 pointer-events-none" />

      <div className="z-10 w-full max-w-6xl flex flex-col items-center space-y-10">
        <header className="text-center space-y-4">
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white">
            VieStickeru
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl font-normal tracking-wide">
            Professional Sticker Editor
          </p>
        </header>
        
        <div className="w-full">
           <AnimatePresence mode="wait">
             {!file ? (
               <motion.div
                 key="dropzone"
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -20 }}
                 className="max-w-xl mx-auto"
               >
                 <DropZone onFileSelect={setFile} />
               </motion.div>
             ) : (
               <motion.div
                 key="editor"
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
               >
                 <StickerEditor file={file} onBack={() => setFile(null)} />
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>

      <footer className="absolute bottom-6 text-zinc-600 text-xs uppercase tracking-widest font-medium">
        Powered by RMBG-2.0 & OpenCV
      </footer>
    </main>
  );
}
