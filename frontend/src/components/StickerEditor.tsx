'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

import { Eraser, Brush, Download, X, Undo2, Redo2, Eye, Palette, Image as ImageIcon, ImageOff, Move, ZoomIn, ZoomOut, Sparkles, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';

interface StickerEditorProps {
  file: File;
  onBack: () => void;
}

export function StickerEditor({ file, onBack }: StickerEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [isProcessing, setIsProcessing] = useState(true);
  const [isHoveringCanvas, setIsHoveringCanvas] = useState(false);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'erase' | 'restore' | 'pan'>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState(false);
  
  // Image Adjustments
  const [adjustments, setAdjustments] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  });

  // Border Settings
  // Border Settings
  const [borderSize, setBorderSize] = useState(0);
  const [borderColor, setBorderColor] = useState('#FFFFFF');
  const [smoothness, setSmoothness] = useState(0);


  // Export Settings
  const [exportFormat, setExportFormat] = useState<'png' | 'webp'>('png');

  // Header Visibility
  const [showHeader, setShowHeader] = useState(false);

  // View Control
  const [showReference, setShowReference] = useState(true);

  // Undo/Redo History
  const historyRef = useRef<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState(0);

  // Background Mode
  const [bgMode, setBgMode] = useState<'checkerboard' | 'white' | 'black'>('checkerboard');

  // Connection Status
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Load and Process Image
  const [version, setVersion] = useState(0);
  const ToolTrigger = version;

  useEffect(() => {
    // Check Backend Health
    const checkBackend = async () => {
      try {
        await axios.get('http://127.0.0.1:8000/health', { timeout: 2000 });
        setBackendStatus('connected');
      } catch (error) {
        console.error("Backend health check failed:", error);
        setBackendStatus('error');
      }
    };
    checkBackend();
  }, []);

  useEffect(() => {
    const processImage = async () => {
      if (backendStatus === 'error') return; // Don't try if we know it's down
      
      try {
        const formData = new FormData();
        formData.append('file', file);

        // Uses the new RMBG-2.0 Endpoint
        const response = await axios.post('http://127.0.0.1:8000/api/remove-bg', formData, {
          responseType: 'blob',
        });

        // Load Original
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((resolve) => (img.onload = resolve));
        setOriginalImage(img);

        // Load Processed (Alpha Mask)
        const processedBlob = response.data;
        const processedImg = new Image();
        processedImg.src = URL.createObjectURL(processedBlob);
        await new Promise((resolve) => (processedImg.onload = resolve));

        // Create Mask Canvas (Offscreen)
        const mCanvas = document.createElement('canvas');
        mCanvas.width = img.width;
        mCanvas.height = img.height;
        const mCtx = mCanvas.getContext('2d')!;
        
        mCtx.drawImage(processedImg, 0, 0);
        setMaskCanvas(mCanvas);

        // Initialize History (Limit to 20 steps to save memory)
        const initialData = mCtx.getImageData(0, 0, mCanvas.width, mCanvas.height);
        historyRef.current = [initialData];
        setHistoryStep(0);
        
        // Center initial view
        centerImage(img.width, img.height);
        
      } catch (error) {
        console.error("Error processing image:", error);
        // Don't alert immediately, let the status indicator show the issue
      } finally {
        setIsProcessing(false);
      }
    };

    if (file && backendStatus !== 'connecting') {
        if (backendStatus === 'connected') {
             processImage();
        } else {
            setIsProcessing(false); // Stop spinner if backend is error
        }
    }
  }, [file, backendStatus]);
  

  const centerImage = (w: number, h: number) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    
    // Fit to screen
    const scaleW = (cw - 40) / w;
    const scaleH = (ch - 40) / h;
    const newScale = Math.min(scaleW, scaleH, 1);
    
    setScale(newScale);
    setOffset({
        x: (cw - w * newScale) / 2,
        y: (ch - h * newScale) / 2
    });
  };

  // Rendering Loop
  const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    if (!originalImage || !maskCanvas || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    // Set Canvas Size to match container
    if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        
        if (Math.abs(canvas.width - newWidth) > 10 || Math.abs(canvas.height - newHeight) > 10) {
            canvas.width = newWidth;
            canvas.height = newHeight;
        }
    }

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Background
    if (bgMode === 'checkerboard') {
        drawCheckerboard(ctx, canvas.width, canvas.height);
    } else if (bgMode === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgMode === 'black') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    // Apply Transform
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Filter String
    const filterStr = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;

    // 1. Ghost Original (low opacity)
    if (showReference) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.filter = filterStr;
        ctx.drawImage(originalImage, 0, 0);
        ctx.restore();
    }
    
    // 2. Prepare Buffer (Masked Image)
    const buffer = document.createElement('canvas');
    buffer.width = originalImage.width;
    buffer.height = originalImage.height;
    const bCtx = buffer.getContext('2d')!;
    
    // Draw Mask with Smoothing (Blur then threshold if needed, for now just blur alpha)
    if (smoothness > 0) {
        bCtx.filter = `blur(${smoothness}px)`;
    }
    bCtx.drawImage(maskCanvas, 0, 0);
    bCtx.filter = 'none'; // Reset filter

    // Keep only opaque parts
    bCtx.globalCompositeOperation = 'source-in';
    bCtx.filter = filterStr;
    bCtx.drawImage(originalImage, 0, 0);
    
    // 3. Draw Buffer to Main Canvas with Effects
    if (borderSize > 0) {
        // Apply Sticker Border using SVG Filter
        // We use the ID defined in the JSX below
        ctx.filter = 'url(#sticker-border-effect)';
    } else {
        ctx.filter = 'none';
    }
    
    ctx.drawImage(buffer, 0, 0);

    // Reset filter for cursor
    ctx.filter = 'none';

    // 4. Draw Brush Cursor
    if (cursorPos && (tool === 'erase' || tool === 'restore')) {
        ctx.beginPath();
        ctx.arc(cursorPos.x, cursorPos.y, brushSize / 2, 0, Math.PI * 2);
        ctx.lineWidth = 2 / scale; 
        ctx.strokeStyle = 'white';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(cursorPos.x, cursorPos.y, brushSize / 2, 0, Math.PI * 2);
        ctx.lineWidth = 1 / scale; 
        ctx.strokeStyle = 'black';
        ctx.stroke();
    }
    
    ctx.restore();

  }, [originalImage, maskCanvas, scale, offset, ToolTrigger, brushSize, bgMode, showReference, adjustments, cursorPos, tool, borderSize, borderColor]); 

  // Helper: Draw Checkerboard
  const drawCheckerboard = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const size = 20;
    ctx.fillStyle = '#18181b'; // zinc-950
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#27272a'; // zinc-800
    for (let y = 0; y < h; y += size) {
        for (let x = 0; x < w; x += size) {
            if ((x / size + y / size) % 2 === 0) {
                ctx.fillRect(x, y, size, size);
            }
        }
    }
  };

  // Mouse Handlers
  const getLocalCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0, screenX: 0, screenY: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    let cx, cy;
    if ('touches' in e) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
    } else {
        cx = (e as React.MouseEvent).clientX;
        cy = (e as React.MouseEvent).clientY;
    }
    
    // Screen coords relative to canvas top-left
    const screenX = cx - rect.left;
    const screenY = cy - rect.top;
    
    // Transform to Image local coords
    const localX = (screenX - offset.x) / scale;
    const localY = (screenY - offset.y) / scale;
    
    return { x: localX, y: localY, screenX, screenY };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button === 1) {
        e.preventDefault();
        setIsMiddleMouseDown(true);
        const { screenX, screenY } = getLocalCoords(e);
        setLastPos({ x: screenX, y: screenY });
        return;
    }
    
    const { x, y, screenX, screenY } = getLocalCoords(e);
    setIsDragging(true);
    setLastPos({ x: screenX, y: screenY });

    if (tool === 'erase' || tool === 'restore') {
        paint(x, y);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y, screenX, screenY } = getLocalCoords(e);
    setCursorPos({ x, y });
    
    if (isMiddleMouseDown) {
        e.preventDefault();
        const dx = screenX - lastPos.x;
        const dy = screenY - lastPos.y;
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPos({ x: screenX, y: screenY });
        return;
    }
    
    if (!isDragging) return;

    if (tool === 'pan') {
        const dx = screenX - lastPos.x;
        const dy = screenY - lastPos.y;
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPos({ x: screenX, y: screenY });
    } else {
        paint(x, y);
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button === 1) {
        setIsMiddleMouseDown(false);
    }
    
    if (isDragging && (tool === 'erase' || tool === 'restore')) {
        saveHistory();
    }
    setIsDragging(false);
  };

  const paint = (x: number, y: number) => {
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    if (tool === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
    } else if (tool === 'restore') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.fill();
    }
    setVersion(v => v + 1);
  };

  // Zoom Helpers
  const handleZoom = (delta: number, mouseX?: number, mouseY?: number) => {
    if (!canvasRef.current) return;
    const newScale = Math.max(0.1, Math.min(5, scale + delta));
    
    if (mouseX !== undefined && mouseY !== undefined) {
      const rect = canvasRef.current.getBoundingClientRect();
      const canvasX = mouseX - rect.left;
      const canvasY = mouseY - rect.top;
      
      const imageX = (canvasX - offset.x) / scale;
      const imageY = (canvasY - offset.y) / scale;
      
      const newOffsetX = canvasX - imageX * newScale;
      const newOffsetY = canvasY - imageY * newScale;
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
    setScale(newScale);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        handleZoom(delta, e.clientX, e.clientY);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [scale, offset]); 
  
  const handleSave = async (copyToClipboard = false) => {
    if (!originalImage || !maskCanvas) return;
    
    const outCanvas = document.createElement('canvas');
    // Add extra padding to canvas for border
    const padding = (borderSize * 2) + 20; // 20px extra safety
    
    outCanvas.width = originalImage.width + padding;
    outCanvas.height = originalImage.height + padding;
    const ctx = outCanvas.getContext('2d')!;
    
    const buffer = document.createElement('canvas');
    buffer.width = originalImage.width;
    buffer.height = originalImage.height;
    const bCtx = buffer.getContext('2d')!;
    
    // Apply smoothing to mask
    if (smoothness > 0) {
        bCtx.filter = `blur(${smoothness}px)`;
    }
    bCtx.drawImage(maskCanvas, 0, 0);
    bCtx.filter = 'none';

    bCtx.globalCompositeOperation = 'source-in';
    bCtx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
    bCtx.drawImage(originalImage, 0, 0);


    if (borderSize > 0) {
        ctx.filter = 'url(#sticker-border-effect)';
    }

    // Center image in output with padding
    const drawX = padding / 2;
    const drawY = padding / 2;
    ctx.drawImage(buffer, drawX, drawY);
    

    const finalCanvas = outCanvas;

    if (copyToClipboard) {
        finalCanvas.toBlob(async (blob) => {
            if (!blob) return;
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);
                // Could add a toast here
                alert("Sticker copied to clipboard!");
            } catch (err) {
                 console.error("Failed to copy", err);
                 alert("Failed to copy to clipboard.");
            }
        }, 'image/png'); // Clipboard API mostly supports PNG
    } else {
        const mimeType = exportFormat === 'webp' ? 'image/webp' : 'image/png';
        const dataUrl = finalCanvas.toDataURL(mimeType);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `sticker.${exportFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
  };


  // --- History Functions ---
  const saveHistory = () => {
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const newHistory = historyRef.current.slice(0, historyStep + 1);
    newHistory.push(data);
    if (newHistory.length > 20) newHistory.shift(); // Optimized Limit
    historyRef.current = newHistory;
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep <= 0 || !maskCanvas) return;
    const newStep = historyStep - 1;
    const data = historyRef.current[newStep];
    const ctx = maskCanvas.getContext('2d');
    if (ctx && data) {
        ctx.putImageData(data, 0, 0);
        setHistoryStep(newStep);
        setVersion(v => v + 1);
    }
  };

  const redo = () => {
    if (historyStep >= historyRef.current.length - 1 || !maskCanvas) return;
    const newStep = historyStep + 1;
    const data = historyRef.current[newStep];
    const ctx = maskCanvas.getContext('2d');
    if (ctx && data) {
        ctx.putImageData(data, 0, 0);
        setHistoryStep(newStep);
        setVersion(v => v + 1);
    }
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z')))) { e.preventDefault(); redo(); }
        if (e.key === '[') setBrushSize(s => Math.max(5, s - 5));
        if (e.key === ']') setBrushSize(s => Math.min(150, s + 5));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyStep, maskCanvas]);

  if (isProcessing) {
    return (
        <div className="h-[80vh] w-full bg-zinc-950 rounded-xl flex flex-col items-center justify-center text-white border border-zinc-800">
            <div className="w-12 h-12 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <p className="mt-4 text-zinc-500 text-sm animate-pulse">Processing Image...</p>
        </div>
    );
  }

  return (
    <div className="flex flex-col h-[85vh] w-full relative bg-black overflow-hidden selection:bg-violet-500/30 rounded-3xl ring-1 ring-zinc-800 shadow-2xl my-8">
        
        {/* SVG Filter Definition for Border */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
                <filter id="sticker-border-effect">
                    {/* Dilate Alpha Channel */}
                    <feMorphology in="SourceAlpha" operator="dilate" radius={borderSize} result="dilated" />
                    {/* Color the dilated result */}
                    <feFlood floodColor={borderColor} result="color" />
                    <feComposite in="color" in2="dilated" operator="in" result="outline" />
                    {/* Merge Outline and Original */}
                    <feMerge>
                        <feMergeNode in="outline" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
        </svg>

        {/* --- Auto-Hide Header --- */}
        {/* --- Auto-Hide Header --- */}
        <div className="absolute top-0 left-0 right-0 h-20 z-50 flex justify-center pointer-events-none">
             <div className="absolute top-0 left-0 right-0 h-8 pointer-events-auto" onMouseEnter={() => setShowHeader(true)} />
             <motion.div 
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: showHeader ? 0 : -100, opacity: showHeader ? 1 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="mt-4 px-6 py-2.5 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-full shadow-2xl flex items-center gap-4 pointer-events-auto"
                onMouseLeave={() => setShowHeader(false)}
             >
                 <Button variant="ghost" size="icon" onClick={onBack} className="w-8 h-8 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full"><X className="w-4 h-4" /></Button>
                 <div className="flex items-center gap-2">
                    <span className="font-bold text-white tracking-tight">Sticker Studio</span>
                    <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-bold tracking-wider border border-violet-500/20">BETA</span>
                 </div>
                 <div className="w-px h-4 bg-zinc-800" />
                 {backendStatus === 'connected' ? (
                     <div className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-medium bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Online</div>
                 ) : (
                    <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-medium bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20"><AlertCircle className="w-3 h-3" /> Offline</div>
                 )}
             </motion.div>
        </div>

        <div className="flex-1 flex flex-row h-full w-full overflow-hidden relative">
            {/* --- Left Sidebar (Tools) --- */}
            <div className="w-20 bg-zinc-950 border-r border-zinc-900 flex flex-col items-center py-6 z-20 shrink-0 gap-6 relative shadow-xl">
                <div className="flex flex-col items-center gap-3 w-full px-3">
                    {[
                        { id: 'pan', icon: Move, label: 'Pan' },
                        { id: 'erase', icon: Eraser, label: 'Erase' },
                        { id: 'restore', icon: Brush, label: 'Restore' }
                    ].map((item) => (
                        <div key={item.id} className="relative group w-full aspect-square">
                            <button
                                onClick={() => setTool(item.id as any)}
                                className={cn(
                                    "w-full h-full rounded-xl flex items-center justify-center transition-all duration-200 relative overflow-hidden",
                                    tool === item.id 
                                        ? "bg-violet-600 text-white shadow-lg shadow-violet-900/20 scale-100" 
                                        : "bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 hover:scale-105"
                                )}
                            >
                                <item.icon className="w-5 h-5 relative z-10" />
                                {tool === item.id && <motion.div layoutId="activeTool" className="absolute inset-0 bg-violet-600 z-0" />}
                            </button>
                            {/* Tooltip */}
                           <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                {item.label}
                           </div>
                        </div>
                    ))}
                </div>

                <div className="w-10 h-px bg-zinc-900" />
                
                {(tool === 'erase' || tool === 'restore') && (
                        <div className="flex flex-col items-center space-y-4 w-full px-2 animate-in fade-in slide-in-from-left-4 duration-300">
                             <div className="relative group w-full flex justify-center">
                                {/* Brush Preview Hover */}
                                <div className="absolute left-14 top-1/2 -translate-y-1/2 w-32 h-32 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
                                    <div className="bg-zinc-950/90 backdrop-blur-md p-4 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col items-center gap-2">
                                        <div className="w-20 h-20 flex items-center justify-center bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                                            <div className="rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-75" style={{ width: Math.min(80, brushSize), height: Math.min(80, brushSize) }} />
                                        </div>
                                        <div className="text-[10px] text-zinc-400 font-mono">Size: {brushSize}px</div>
                                    </div>
                                </div>
                                
                                <div className="h-40 w-10 flex items-center justify-center bg-zinc-900/30 rounded-full border border-zinc-800 relative overflow-hidden group hover:border-zinc-700 transition-colors">
                                        <div className="absolute bottom-0 w-full bg-violet-500/20 transition-all duration-75 group-hover:bg-violet-500/30" style={{ height: `${(brushSize / 150) * 100}%` }} />
                                        <input type="range" min="5" max="150" step="5" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-full opacity-0 cursor-pointer absolute inset-0 z-20 vertical-range" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} />
                                    <div className="pointer-events-none z-0 w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
                                </div>
                             </div>
                        </div>
                )}
                
                <div className="flex-1" />
                
                <div className="flex flex-col gap-3 pb-2 w-full px-3">
                     <Button variant="ghost" size="icon" onClick={undo} disabled={historyStep <= 0} className="w-full aspect-square rounded-xl bg-zinc-900/30 text-zinc-600 hover:text-white hover:bg-zinc-800 disabled:opacity-20"><Undo2 className="w-5 h-5" /></Button>
                     <Button variant="ghost" size="icon" onClick={redo} disabled={historyStep >= historyRef.current.length - 1} className="w-full aspect-square rounded-xl bg-zinc-900/30 text-zinc-600 hover:text-white hover:bg-zinc-800 disabled:opacity-20"><Redo2 className="w-5 h-5" /></Button>
                </div>
            </div>

            {/* --- Main Content Area --- */}
            <div className="flex-1 relative bg-zinc-950 overflow-hidden">
                <div ref={containerRef} className={cn("w-full h-full relative z-10 touch-none", (tool === 'erase' || tool === 'restore') ? 'cursor-none' : 'cursor-crosshair')} onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={(e) => { handlePointerUp(e); setIsHoveringCanvas(false); setCursorPos(null); }} onMouseEnter={() => setIsHoveringCanvas(true)} onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp} onContextMenu={(e) => e.preventDefault()} style={{ touchAction: 'none' }}>
                     <div className="absolute inset-0 pointer-events-none opacity-[0.05]" style={{ backgroundImage: `linear-gradient(to right, #404040 1px, transparent 1px), linear-gradient(to bottom, #404040 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
                    <canvas ref={canvasRef} className="block w-full h-full" />
                </div>
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-zinc-900/80 backdrop-blur-md rounded-full border border-white/5 text-[10px] text-zinc-400 uppercase tracking-widest font-medium pointer-events-none">Scroll to Zoom • Middle-Click Pan</div>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center bg-black/50 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl p-1 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleZoom(-0.1)} className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ZoomOut className="w-4 h-4" /></Button>
                    <div className="w-12 text-center text-[10px] font-mono font-medium text-zinc-300">{Math.round(scale * 100)}%</div>
                    <Button variant="ghost" size="icon" onClick={() => handleZoom(0.1)} className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all"><ZoomIn className="w-4 h-4" /></Button>
                    
                    <div className="w-px h-4 bg-white/10 mx-2" />
                    
                    <Button variant="ghost" size="icon" onClick={() => setShowReference(!showReference)} className={cn("h-8 w-8 rounded-full transition-all", showReference ? "text-violet-400 bg-violet-500/20 hover:bg-violet-500/30" : "text-zinc-500 hover:bg-white/10 hover:text-zinc-300")} title="Toggle Original Image Ghost">{showReference ? <ImageIcon className="w-4 h-4" /> : <ImageOff className="w-4 h-4" />}</Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (bgMode === 'checkerboard') setBgMode('white'); else if (bgMode === 'white') setBgMode('black'); else setBgMode('checkerboard'); }} className="h-8 w-8 rounded-full transition-all text-zinc-500 hover:bg-white/10 hover:text-zinc-300" title="Change Background">{bgMode === 'checkerboard' ? <Palette className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
                </div>
            </div>

            {/* --- Right Sidebar (Adjustments) --- */}
            <div className="w-80 bg-zinc-950 border-l border-zinc-900 flex flex-col z-20 shrink-0">
                <div className="p-6 border-b border-zinc-900">
                    <h3 className="text-white font-bold text-lg">Adjustments</h3>
                    <p className="text-zinc-500 text-xs mt-1">Refine your sticker look</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                     
                     {/* Sticker Border Section */}
                     <div className="space-y-4 pt-2">
                        <label className="text-xs font-medium text-white uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Sticker Outline
                        </label>
                        <div className="bg-zinc-900/50 p-4 rounded-xl space-y-4 border border-zinc-800">
                             {/* Size */}
                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-zinc-400">Width</span>
                                    <span className="text-zinc-500 font-mono">{borderSize}px</span>
                                </div>
                                <input type="range" min="0" max="50" step="1" value={borderSize} onChange={(e) => setBorderSize(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500" />
                             </div>
                             
                              {/* Smoothness */}
                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-zinc-400">Smoothness</span>
                                    <span className="text-zinc-500 font-mono">{smoothness}</span>
                                </div>
                                <input type="range" min="0" max="10" step="0.5" value={smoothness} onChange={(e) => setSmoothness(Number(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500" />
                             </div>

                             {/* Color */}
                             <div className="space-y-2">
                                <span className="text-xs text-zinc-400">Color</span>
                                <div className="flex flex-wrap gap-2">
                                    {['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#000000'].map((c) => (
                                    <button key={c} onClick={() => setBorderColor(c)} className={cn("w-6 h-6 rounded-full border border-white/10 transition-transform hover:scale-110", borderColor === c ? "ring-2 ring-violet-500 scale-110" : "")} style={{ backgroundColor: c }} />
                                    ))}
                                    <div className="relative w-6 h-6 rounded-full overflow-hidden border border-white/10">
                                        <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 p-0 border-0 cursor-pointer" />
                                    </div>
                                </div>
                             </div>

                        </div>
                     </div>
                     

                    <div className="w-full h-px bg-zinc-900" />

                    {/* Image Controls */}
                    <div className="space-y-4">
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Image Filter</label>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-xs text-zinc-400">Brightness</span><span className="text-xs text-zinc-600 font-mono">{adjustments.brightness}%</span></div>
                                <input type="range" min="0" max="200" value={adjustments.brightness} onChange={(e) => setAdjustments(prev => ({ ...prev, brightness: Number(e.target.value) }))} className="w-full accent-zinc-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-xs text-zinc-400">Contrast</span><span className="text-xs text-zinc-600 font-mono">{adjustments.contrast}%</span></div>
                                <input type="range" min="0" max="200" value={adjustments.contrast} onChange={(e) => setAdjustments(prev => ({ ...prev, contrast: Number(e.target.value) }))} className="w-full accent-zinc-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-xs text-zinc-400">Saturation</span><span className="text-xs text-zinc-600 font-mono">{adjustments.saturation}%</span></div>
                                <input type="range" min="0" max="200" value={adjustments.saturation} onChange={(e) => setAdjustments(prev => ({ ...prev, saturation: Number(e.target.value) }))} className="w-full accent-zinc-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-6 border-t border-zinc-900 bg-zinc-950/50 space-y-3">
                    {/* Export Settings */}
                    <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                        <span />
                        <div className="flex bg-zinc-900 rounded-lg p-0.5">
                            <button onClick={() => setExportFormat('png')} className={cn("px-2 py-0.5 rounded-md text-[10px] font-medium transition-all", exportFormat === 'png' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>PNG</button>
                            <button onClick={() => setExportFormat('webp')} className={cn("px-2 py-0.5 rounded-md text-[10px] font-medium transition-all", exportFormat === 'webp' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>WEBP</button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={() => handleSave(false)} className="flex-1 h-12 bg-white text-black hover:bg-zinc-200 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-white/5 active:scale-95 group"><Download className="w-4 h-4 group-hover:scale-110 transition-transform" /> Save</Button>
                        <Button onClick={() => handleSave(true)} variant="outline" className="h-12 w-12 rounded-xl border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 p-0 flex items-center justify-center" title="Copy to Clipboard"><Copy className="w-4 h-4" /></Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
