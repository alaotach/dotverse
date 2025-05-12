import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/supabaseClient"; // Import supabase client

const GRID_SIZE = 100;
const COOLDOWN_SECONDS = 5;
const PIXELS_TABLE = "pixels"; // Define table name

const generateInitialGrid = () => {
  return Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill("#ffffff"));
};

interface Pixel {
  x: number;
  y: number;
  color: string;
}

export default function Canvas() {
  const [grid, setGrid] = useState<string[][]>(generateInitialGrid);
  const [lastPlaced, setLastPlaced] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState<string>("#000000");
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);


  // Fetch initial grid data from Supabase
  useEffect(() => {
    const fetchGrid = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from(PIXELS_TABLE)
        .select("x, y, color");

      if (error) {
        console.error("Error fetching grid:", error);
        // Keep the default generated grid or handle error appropriately
      } else if (data) {
        const newGrid = generateInitialGrid(); // Start with a fresh white grid
        data.forEach((pixel: Pixel) => {
          if (pixel.x >= 0 && pixel.x < GRID_SIZE && pixel.y >= 0 && pixel.y < GRID_SIZE) {
            newGrid[pixel.y][pixel.x] = pixel.color;
          }
        });
        setGrid(newGrid);
      }
      setIsLoading(false);
    };

    fetchGrid();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${PIXELS_TABLE}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: PIXELS_TABLE },
        (payload) => {
          const newPixel = payload.new as Pixel;
          if (newPixel && newPixel.x !== undefined && newPixel.y !== undefined && newPixel.color !== undefined) {
            setGrid((prevGrid) => {
              const updatedGrid = prevGrid.map(row => [...row]);
              if (newPixel.x >= 0 && newPixel.x < GRID_SIZE && newPixel.y >= 0 && newPixel.y < GRID_SIZE) {
                updatedGrid[newPixel.y][newPixel.x] = newPixel.color;
              }
              return updatedGrid;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const canPlacePixel = useCallback(() => {
    return Date.now() - lastPlaced > COOLDOWN_SECONDS * 1000;
  }, [lastPlaced]);

  // Renamed to reflect it updates Supabase
  const updatePixelInSupabase = async (x: number, y: number, color: string) => {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
      return false;
    }
    // Optimistic UI update can be done here if desired, but real-time will catch it
    // For now, we rely on real-time to update the grid state

    const { error } = await supabase
      .from(PIXELS_TABLE)
      .upsert({ x, y, color, updated_at: new Date().toISOString() }, { onConflict: 'x,y' });

    if (error) {
      console.error("Error updating pixel:", error);
      return false;
    }
    return true;
  };


  const handleMouseDown = useCallback(async (x: number, y: number) => {
    setIsMouseDown(true);
    if (canPlacePixel()) {
      if (await updatePixelInSupabase(x, y, selectedColor)) {
        setLastPlaced(Date.now());
      }
      lastPaintedCellRef.current = { x, y };
    } else {
      lastPaintedCellRef.current = null;
    }
  }, [canPlacePixel, selectedColor, updatePixelInSupabase]);

  const handleMouseEnter = useCallback(async (x: number, y: number) => {
    if (!isMouseDown) return;

    const startCell = lastPaintedCellRef.current;
    const endCell = { x, y };

    if (!startCell) {
        if (canPlacePixel()) {
            if (await updatePixelInSupabase(endCell.x, endCell.y, selectedColor)) {
                setLastPlaced(Date.now());
            }
        }
        lastPaintedCellRef.current = endCell;
        return;
    }

    if (startCell.x === endCell.x && startCell.y === endCell.y) {
      return;
    }
    
    if (!canPlacePixel() && COOLDOWN_SECONDS > 0) {
        lastPaintedCellRef.current = endCell;
        return;
    }

    let pixelsChangedThisLine = false;
    let currentLinePlacementTime = Date.now(); 

    let x0 = startCell.x;
    let y0 = startCell.y;
    const x1 = endCell.x;
    const y1 = endCell.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    // Temporary grid for local optimistic line drawing before sending to Supabase
    // This part is tricky with Supabase updates per pixel.
    // For simplicity, we'll update Supabase for each pixel in the line.
    // This could be optimized by batching updates if performance becomes an issue.

    while (true) {
      if (COOLDOWN_SECONDS === 0 || Date.now() - (pixelsChangedThisLine ? currentLinePlacementTime : lastPlaced) > COOLDOWN_SECONDS * 1000) {
        if (await updatePixelInSupabase(x0, y0, selectedColor)) {
          pixelsChangedThisLine = true;
          currentLinePlacementTime = Date.now(); 
        }
      }

      if (x0 === x1 && y0 === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    if (pixelsChangedThisLine) {
      setLastPlaced(currentLinePlacementTime);
    }
    lastPaintedCellRef.current = endCell;
  }, [isMouseDown, canPlacePixel, selectedColor, updatePixelInSupabase, lastPlaced]);

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
    lastPaintedCellRef.current = null;
  }, []);

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedColor(event.target.value);
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseUp]);

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading Canvas...</div>;
  }

  return (
    <div className="flex flex-col items-center" 
         onMouseLeave={isMouseDown ? handleMouseUp : undefined}
    >
      <div className="mb-4">
        <label htmlFor="colorPicker" className="mr-2">Choose a color:</label>
        <input
          type="color"
          id="colorPicker"
          value={selectedColor}
          onChange={handleColorChange}
          className="h-8 w-14"
        />
      </div>
      <div 
        className="grid cursor-pointer border border-gray-300" // Added border to grid container
        style={{ 
          gridTemplateColumns: `repeat(${GRID_SIZE}, 10px)`,
          width: `${GRID_SIZE * 10}px`, // Explicit width
          height: `${GRID_SIZE * 10}px`, // Explicit height
         }}
        onMouseUp={handleMouseUp}
      >
        {grid.flatMap((row, y) =>
          row.map((color, x) => (
            <div
              key={`${x}-${y}`}
              onMouseDown={() => handleMouseDown(x, y)}
              onMouseEnter={() => handleMouseEnter(x, y)}
              className="w-[10px] h-[10px] border-r border-b border-gray-200" // Cell borders
              style={{ backgroundColor: color, boxSizing: 'border-box' }} // Ensure border is inside
            />
          ))
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        {COOLDOWN_SECONDS === 0 || canPlacePixel()
          ? "You can place a pixel"
          : `Wait ${Math.ceil(
              (COOLDOWN_SECONDS * 1000 - (Date.now() - lastPlaced)) / 1000
            )}s`}
      </div>
    </div>
  );
}