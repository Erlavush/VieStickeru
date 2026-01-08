'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  className?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileSelect, className }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onFileSelect(e.dataTransfer.files[0]);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        onFileSelect(e.target.files[0]);
      }
    },
    [onFileSelect]
  );

  return (
    <div className={cn('relative w-full group cursor-pointer', className)}>
      <motion.div
        animate={{
          scale: isDragging ? 0.98 : 1,
          borderColor: isDragging ? '#8b5cf6' : '#52525b', // Violet to Zinc-600
        }}
        className={cn(
          'relative w-full h-64 rounded-xl border-2 border-dashed transition-colors duration-200 bg-zinc-900/50 backdrop-blur-sm flex flex-col items-center justify-center gap-4 overflow-hidden',
          isDragging ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30 hover:border-zinc-400'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <motion.div
          animate={{ y: isDragging ? -5 : 0 }}
          className="p-4 rounded-full bg-zinc-800 ring-1 ring-white/10 shadow-xl"
        >
          {isDragging ? (
            <Upload className="w-8 h-8 text-violet-400" />
          ) : (
            <ImageIcon className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
          )}
        </motion.div>

        <div className="text-center z-10">
          <p className="text-lg font-medium text-zinc-200">
            {isDragging ? 'Drop it like it\'s hot' : 'Click or Drag image here'}
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Supports PNG, JPG, WEBP (Max 10MB)
          </p>
        </div>
      </motion.div>
      <input
        id="file-upload"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
};
