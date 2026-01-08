'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Brush, Download, Check, X, Undo, Redo, ZoomIn, ZoomOut, Move, Undo2, Redo2, Eye, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import axios from 'axios';

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

  // Undo/Redo History
  const historyRef = useRef<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState(0);

  // Background Mode
  const [bgMode, setBgMode] = useState<'checkerboard' | 'white' | 'black'>('checkerboard');

  // Load and Process Image
  const [version, setVersion] = useState(0);
  const ToolTrigger = version;

  useEffect(() => {
    const processImage = async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);

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

        // Initialize History
        const initialData = mCtx.getImageData(0, 0, mCanvas.width, mCanvas.height);
        historyRef.current = [initialData];
        setHistoryStep(0);
        
        // Center initial view
        centerImage(img.width, img.height);
        
      } catch (error) {
        console.error("Error processing image:", error);
        alert("Failed to process background removal.");
        onBack();
      } finally {
        setIsProcessing(false);
      }
    };

    if (file) {
      processImage();
    }
  }, [file]);
  

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
  useEffect(() => {
    if (!originalImage || !maskCanvas || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    // Set Canvas Size to match container
    if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        
        // Only resize if significantly different to avoid constant redraws
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

    // Visual Render Strategy:
    // 1. Ghost Original (low opacity)
    ctx.globalAlpha = 0.2;
    ctx.drawImage(originalImage, 0, 0);
    ctx.globalAlpha = 1.0;
    
    // 2. Draw the Masked Result (Offscreen buffer)
    const buffer = document.createElement('canvas');
    buffer.width = originalImage.width;
    buffer.height = originalImage.height;
    const bCtx = buffer.getContext('2d')!;
    
    // Draw Mask onto buffer
    bCtx.drawImage(maskCanvas, 0, 0);
    // Keep only the opaque parts of original
    bCtx.globalCompositeOperation = 'source-in';
    bCtx.drawImage(originalImage, 0, 0);
    
    // Draw buffer to main canvas
    ctx.drawImage(buffer, 0, 0);
    
    ctx.restore();

  }, [originalImage, maskCanvas, scale, offset, ToolTrigger, brushSize, bgMode]); 

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
    // Middle mouse button for panning
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

    // We save history on Pointer UP (end of stroke), not down. 
    // OR we can save "snapshot before start" if we want instant 'undo stroke'.
    // Standard is: Current state is safe. We Modify it.
    // Actually, capturing state on UP is easiest to ensure we capture the whole stroke.

    if (tool === 'erase' || tool === 'restore') {
        paint(x, y);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y, screenX, screenY } = getLocalCoords(e);
    
    // Middle mouse panning
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
    
    // If we were dragging and using an edit tool, save history
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta, e.clientX, e.clientY);
  };
  
  const handleSave = () => {
    if (!originalImage || !maskCanvas) return;
    
    const outCanvas = document.createElement('canvas');
    outCanvas.width = originalImage.width;
    outCanvas.height = originalImage.height;
    const ctx = outCanvas.getContext('2d')!;
    
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(originalImage, 0, 0);
    
    // Use data URL to ensure filename is respected
    const dataUrl = outCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'sticker.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- History Functions ---
  const saveHistory = () => {
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;
    
    const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Slice if we are in middle of history
    const newHistory = historyRef.current.slice(0, historyStep + 1);
    newHistory.push(data);
    
    // Limit history size (optional, e.g. 50 steps)
    if (newHistory.length > 50) {
        newHistory.shift();
    }
    
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
        setVersion(v => v + 1); // Trigger Redraw
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
        // Undo: Ctrl+Z or Cmd+Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Redo: Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z
        if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z')))) {
            e.preventDefault();
            redo();
        }
        
        // Brush Size: [ and ]
        if (e.key === '[') {
            setBrushSize(s => Math.max(5, s - 5));
        }
        if (e.key === ']') {
            setBrushSize(s => Math.min(150, s + 5));
        }
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
    <div className="flex flex-row h-full w-full gap-4 relative">
        
        {/* --- Left Sidebar (Tools) --- */}
        <div className="w-16 md:w-20 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-between py-6 z-20 shrink-0 shadow-2xl ring-1 ring-white/5">
            {/* Top: Tools */}
            <div className="flex flex-col items-center space-y-6 w-full">
                {/* Back Button */}
                 <Button variant="ghost" size="icon" onClick={onBack} className="text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg mb-2">
                     <X className="w-5 h-5" />
                 </Button>

                <div className="w-8 h-px bg-zinc-800" />

                {/* Tool Groups */}
                <div className="flex flex-col items-center gap-3">
                    <Button 
                        variant={tool === 'pan' ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setTool('pan')}
                        className={cn("w-10 h-10 rounded-lg", tool === 'pan' ? "bg-white text-black hover:bg-white/90" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}
                        title="Pan Tool (Middle Click)"
                    >
                        <Move className="w-5 h-5" /> 
                    </Button>

                    <Button 
                        variant={tool === 'erase' ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setTool('erase')}
                        className={cn("w-10 h-10 rounded-lg", tool === 'erase' ? "bg-white text-black hover:bg-white/90" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}
                        title="Erase"
                    >
                        <Eraser className="w-5 h-5" /> 
                    </Button>

                    <Button 
                        variant={tool === 'restore' ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setTool('restore')}
                        className={cn("w-10 h-10 rounded-lg", tool === 'restore' ? "bg-white text-black hover:bg-white/90" : "text-zinc-400 hover:text-white hover:bg-zinc-800")}
                        title="Restore"
                    >
                        <Brush className="w-5 h-5" /> 
                    </Button>
                </div>
                
                {/* Brush Size Slider */}
                {(tool === 'erase' || tool === 'restore') && (
                     <div className="flex flex-col items-center space-y-4 pt-4 animate-in fade-in slide-in-from-left-2 duration-300 w-full relative group">
                        
                        {/* Preview Circle Indicator */}
                        <div className="absolute -right-12 top-1/2 -translate-y-1/2 w-24 h-24 flex items-center justify-start pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <div 
                                className="rounded-full border border-white/50 bg-white/20 backdrop-blur-sm"
                                style={{ width: brushSize, height: brushSize }}
                            />
                        </div>

                        <span className="text-[10px] text-zinc-500 font-mono">Size</span>
                        <div className="h-32 flex items-center justify-center p-2 bg-zinc-950 rounded-full border border-zinc-800 relative z-10">
                             <input 
                                type="range" 
                                min="5" 
                                max="150" 
                                step="5"
                                value={brushSize} 
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="w-1.5 h-full bg-zinc-800 rounded-full appearance-none cursor-pointer accent-white vertical-range"
                                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                            />
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">{brushSize}</span>
                     </div>
                )}
            </div>

            {/* Middle: Undo/Redo */}
            <div className="flex flex-col gap-2">
                 <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={undo}
                    disabled={historyStep <= 0}
                    className="text-zinc-500 hover:text-white disabled:opacity-30"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo2 className="w-5 h-5" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={redo}
                    disabled={historyStep >= historyRef.current.length - 1}
                    className="text-zinc-500 hover:text-white disabled:opacity-30"
                    title="Redo (Ctrl+Y)"
                >
                    <Redo2 className="w-5 h-5" />
                </Button>
            </div>

            {/* Bottom: Save & BG Toggle */}
            <div className="flex flex-col items-center space-y-4">
                 
                 {/* Background Toggle */}
                 <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                        if (bgMode === 'checkerboard') setBgMode('white');
                        else if (bgMode === 'white') setBgMode('black');
                        else setBgMode('checkerboard');
                    }}
                    className="text-zinc-500 hover:text-white"
                    title={`Background: ${bgMode}`}
                >
                    {bgMode === 'checkerboard' ? <Palette className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </Button>

                 <div className="flex flex-col items-center space-y-1 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                    <Button variant="ghost" size="icon" onClick={() => handleZoom(0.1)} className="h-6 w-6 text-zinc-400 hover:text-white"><ZoomIn className="w-3 h-3" /></Button>
                    <span className="text-[10px] text-zinc-500 font-mono">{Math.round(scale * 100)}%</span>
                    <Button variant="ghost" size="icon" onClick={() => handleZoom(-0.1)} className="h-6 w-6 text-zinc-400 hover:text-white"><ZoomOut className="w-3 h-3" /></Button>
                 </div>
                
                <Button 
                    variant="default"
                    size="icon"
                    onClick={handleSave} 
                    className="w-12 h-12 rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20"
                    title="Save Sticker"
                >
                    <Download className="w-5 h-5" /> 
                </Button>
            </div>
        </div>

        {/* --- Main Content Area --- */}
        <div className="flex-1 flex flex-col relative bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 shadow-2xl ring-1 ring-white/5">
            
             {/* Info Bar */}
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-zinc-900/80 backdrop-blur-md rounded-full border border-white/5 text-[10px] text-zinc-400 uppercase tracking-widest font-medium pointer-events-none">
                Scroll to Zoom • Middle-Click Pan
             </div>

            {/* Canvas */}
            <div 
                ref={containerRef} 
                className="flex-1 relative overflow-hidden cursor-crosshair touch-none z-10"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={(e) => {
                    handlePointerUp(e);
                    setIsHoveringCanvas(false);
                }}
                onMouseEnter={() => setIsHoveringCanvas(true)}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: 'none' }}
            >
                 {/* Background Grid Pattern */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.05]" 
                     style={{ 
                         backgroundImage: `
                             linear-gradient(to right, #404040 1px, transparent 1px),
                             linear-gradient(to bottom, #404040 1px, transparent 1px)
                         `, 
                         backgroundSize: '20px 20px' 
                     }} 
                />

                <canvas ref={canvasRef} className="block w-full h-full relative z-0" />
            </div>
        </div>
    </div>
  );
}

