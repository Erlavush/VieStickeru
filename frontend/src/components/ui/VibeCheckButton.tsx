'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VibeCheckButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const VibeCheckButton: React.FC<VibeCheckButtonProps> = ({ onClick, disabled, loading, className }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)" }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'w-full py-4 rounded-xl font-bold text-lg text-white relative overflow-hidden transition-all',
        'bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 background-animate',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale',
        className
      )}
    >
      <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300" />
      
      <div className="relative flex items-center justify-center gap-2">
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Vibing...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            <span>Vibe Check</span>
          </>
        )}
      </div>
      
      <style jsx>{`
        .background-animate {
          background-size: 200%;
          animation: gradient 3s ease infinite;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </motion.button>
  );
};
