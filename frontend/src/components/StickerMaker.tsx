'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, Sliders } from 'lucide-react';
import { DropZone } from './ui/DropZone';
import { VibeCheckButton } from './ui/VibeCheckButton';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export const StickerMaker = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Settings
  const [borderSize, setBorderSize] = useState(15);
  const [borderColor, setBorderColor] = useState('#FFFFFF');

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreview(objectUrl);
    setResult(null);
  };

  const handleProcess = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('border_size', borderSize.toString());
      formData.append('border_color_hex', borderColor);

      const response = await axios.post('http://localhost:8000/api/stickerize', formData, {
        responseType: 'blob',
      });

      const resultUrl = URL.createObjectURL(response.data);
      setResult(resultUrl);
    } catch (error) {
      console.error('Error processing sticker:', error);
      alert('Failed to vibe check the image. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-8">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <DropZone onFileSelect={handleFileSelect} />
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900/50 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-violet-500" />
                Customize Vibe
              </h2>
              <button 
                onClick={handleReset}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Image Preview */}
              <div className="relative aspect-square rounded-xl overflow-hidden bg-checkerboard border border-zinc-700/50 group">
                <Image
                  src={result || preview!}
                  alt="Preview"
                  fill
                  className="object-contain p-4 transition-transform duration-500 hover:scale-105"
                />
                {result && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={result} 
                      download="sticker_vibe.png"
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition-colors"
                    >
                      <Download className="w-4 h-4" /> Save Sticker
                    </a>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Border Size ({borderSize}px)
                  </label>
                  <input 
                    type="range" 
                    min="5" 
                    max="50" 
                    value={borderSize} 
                    onChange={(e) => setBorderSize(Number(e.target.value))}
                    className="w-full accent-violet-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Border Color</label>
                  <div className="flex flex-wrap gap-2">
                    {['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setBorderColor(c)}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-all",
                          borderColor === c ? "border-white scale-110" : "border-transparent opacity-50 hover:opacity-100"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input 
                      type="color" 
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="w-8 h-8 rounded-full overflow-hidden border-none p-0 bg-transparent cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  {!result ? (
                     <VibeCheckButton onClick={handleProcess} loading={loading} />
                  ) : (
                    <motion.div
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       className="text-center"
                    >
                      <p className="text-violet-400 font-medium mb-2">✨ Vibe Checked!</p>
                      <button 
                        onClick={() => setResult(null)}
                        className="text-sm text-zinc-500 hover:text-white underline"
                      >
                        Adjust Settings
                      </button>
                    </motion.div>
                  )}
                 
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
