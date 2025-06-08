import React, { useEffect, useRef } from 'react';
import p5 from 'p5';

interface CanvasLoadingProps {
  onAnimationComplete?: () => void;
  className?: string;
}

const CanvasLoading: React.FC<CanvasLoadingProps> = ({ 
  onAnimationComplete,
  className = "" 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      let particles: Particle[] = [];
      let targetPositions: { x: number; y: number }[] = [];
      let phase = 'converging';
      let phaseTimer = 0;
      let stars: Star[] = [];
      let fadeAlpha = 0;

      class Particle {
        x: number;
        y: number;
        targetX: number;
        targetY: number;
        vx: number;
        vy: number;
        size: number;
        color: p5.Color;
        trail: { x: number; y: number }[];
        isForming: boolean;
        glowIntensity: number;

        constructor(x: number, y: number, targetX: number, targetY: number) {
          this.x = x;
          this.y = y;
          this.targetX = targetX;
          this.targetY = targetY;
          this.vx = 0;
          this.vy = 0;
          this.size = p.random(2, 6);
          this.color = p.color(
            p.random(150, 255),
            p.random(100, 200),
            p.random(200, 255),
            200
          );
          this.trail = [];
          this.isForming = false;
          this.glowIntensity = p.random(0.5, 1);
        }

        update() {
          if (phase === 'converging') {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 3) {
              this.vx += dx * 0.004;
              this.vy += dy * 0.004;
              this.vx += p.random(-0.1, 0.1);
              this.vy += p.random(-0.1, 0.1);
              
              this.vx *= 0.96;
              this.vy *= 0.96;
            } else {
              this.isForming = true;
              this.vx *= 0.9;
              this.vy *= 0.9;
            }
          } else if (phase === 'dissolving') {
            this.vx += p.random(-0.8, 0.8);
            this.vy += p.random(-0.8, 0.8);
            this.vx *= 1.04;
            this.vy *= 1.04;
          } else if (phase === 'starfield') {
            this.vx += p.random(-0.02, 0.02);
            this.vy += p.random(-0.02, 0.02);
            this.vx *= 0.99;
            this.vy *= 0.99;
            if (this.x < 0) this.x = p.width;
            if (this.x > p.width) this.x = 0;
            if (this.y < 0) this.y = p.height;
            if (this.y > p.height) this.y = 0;
          }

          this.x += this.vx;
          this.y += this.vy;
          this.trail.push({ x: this.x, y: this.y });
          if (this.trail.length > 5) {
            this.trail.shift();
          }
        }

        draw() {
          for (let i = 0; i < this.trail.length; i++) {
            const alpha = (i / this.trail.length) * 60;
            const size = (i / this.trail.length) * this.size * 0.5;
            p.fill(p.red(this.color), p.green(this.color), p.blue(this.color), alpha);
            p.noStroke();
            p.circle(this.trail[i].x, this.trail[i].y, size);
          }

          const glowSize = this.size * 3 * this.glowIntensity;
          p.fill(p.red(this.color), p.green(this.color), p.blue(this.color), 40);
          p.noStroke();
          p.circle(this.x, this.y, glowSize);

          p.fill(this.color);
          p.noStroke();
          p.circle(this.x, this.y, this.size);
        }
      }

      class Star {
        x: number;
        y: number;
        size: number;
        twinkle: number;
        twinkleSpeed: number;
        color: p5.Color;

        constructor() {
          this.x = p.random(p.width);
          this.y = p.random(p.height);
          this.size = p.random(0.5, 2);
          this.twinkle = p.random(p.TWO_PI);
          this.twinkleSpeed = p.random(0.03, 0.08);
          this.color = p.color(
            p.random(200, 255),
            p.random(200, 255),
            p.random(200, 255),
            p.random(100, 200)
          );
        }

        update() {
          this.twinkle += this.twinkleSpeed;
        }

        draw() {
          const alpha = p.map(p.sin(this.twinkle), -1, 1, 50, 200);
          p.fill(p.red(this.color), p.green(this.color), p.blue(this.color), alpha);
          p.noStroke();
          p.circle(this.x, this.y, this.size * p.map(p.sin(this.twinkle), -1, 1, 0.5, 1.5));
        }
      }

      const createLetterPattern = (letter: string, offsetX: number, offsetY: number, scale: number = 1) => {
        const patterns: { [key: string]: number[][] } = {
          'D': [
            [1,1,1,0],
            [1,0,0,1],
            [1,0,0,1],
            [1,0,0,1],
            [1,0,0,1],
            [1,0,0,1],
            [1,1,1,0]
          ],
          'O': [
            [0,1,1,0],
            [1,0,0,1],
            [1,0,0,1],
            [1,0,0,1],
            [1,0,0,1],
            [1,0,0,1],
            [0,1,1,0]
          ],
          'T': [
            [1,1,1,1,1],
            [0,0,1,0,0],
            [0,0,1,0,0],
            [0,0,1,0,0],
            [0,0,1,0,0],
            [0,0,1,0,0],
            [0,0,1,0,0]
          ],
          'V': [
            [1,0,0,0,1],
            [1,0,0,0,1],
            [0,1,0,1,0],
            [0,1,0,1,0],
            [0,0,1,0,0],
            [0,0,1,0,0],
            [0,0,1,0,0]
          ],
          'E': [
            [1,1,1,1],
            [1,0,0,0],
            [1,0,0,0],
            [1,1,1,0],
            [1,0,0,0],
            [1,0,0,0],
            [1,1,1,1]
          ],
          'R': [
            [1,1,1,0],
            [1,0,0,1],
            [1,0,0,1],
            [1,1,1,0],
            [1,0,1,0],
            [1,0,0,1],
            [1,0,0,1]
          ],
          'S': [
            [0,1,1,1],
            [1,0,0,0],
            [1,0,0,0],
            [0,1,1,0],
            [0,0,0,1],
            [0,0,0,1],
            [1,1,1,0]
          ]
        };

        const pattern = patterns[letter];
        const positions: { x: number; y: number }[] = [];

        if (pattern) {
          for (let row = 0; row < pattern.length; row++) {
            for (let col = 0; col < pattern[row].length; col++) {
              if (pattern[row][col] === 1) {
                positions.push({
                  x: offsetX + col * 8 * scale,
                  y: offsetY + row * 8 * scale
                });
              }
            }
          }
        }

        return positions;
      };

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.colorMode(p.RGB);

        const centerX = p.width / 2;
        const centerY = p.height / 2;
        const scale = p.width < 768 ? 0.6 : 1.0;

        const letters = ['D', 'O', 'T', 'V', 'E', 'R', 'S', 'E'];
        let currentX = centerX - (letters.length * 22 * scale);

        letters.forEach((letter, index) => {
          const letterPositions = createLetterPattern(letter, currentX, centerY - 25, scale);
          targetPositions.push(...letterPositions);
          
          if (letter === 'T') {
            currentX += 42 * scale;
          } else {
            currentX += 38 * scale; 
          }
        });

        targetPositions.forEach(target => {
          const angle = p.random(p.TWO_PI);
          const distance = p.random(200, 500);
          const startX = target.x + p.cos(angle) * distance;
          const startY = target.y + p.sin(angle) * distance;
          
          particles.push(new Particle(startX, startY, target.x, target.y));
        });

        for (let i = 0; i < 60; i++) {
          stars.push(new Star());
        }
      };

      p.draw = () => {
        p.background(5, 5, 15);

        if (phase === 'starfield') {
          stars.forEach(star => {
            star.update();
            star.draw();
          });
        }

        phaseTimer++;

        if (phase === 'converging' && phaseTimer > 90) {
          const allForming = particles.every(p => p.isForming);
          if (allForming) {
            phase = 'forming';
            phaseTimer = 0;
          }
        } else if (phase === 'forming' && phaseTimer > 60) {
          phase = 'dissolving';
          phaseTimer = 0;
        } else if (phase === 'dissolving' && phaseTimer > 30) {
          phase = 'starfield';
          phaseTimer = 0;
          fadeAlpha = 0;
        }

        particles.forEach(particle => {
          particle.update();
          particle.draw();
        });

        if (phase === 'starfield') {
          fadeAlpha += 4;
          if (fadeAlpha > 255) {
            fadeAlpha = 255;
            if (onAnimationComplete) {
              onAnimationComplete();
            }
          }
          
          p.fill(5, 5, 15, fadeAlpha);
          p.noStroke();
          p.rect(0, 0, p.width, p.height);
        }
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };
    };

    p5InstanceRef.current = new p5(sketch, containerRef.current);

    return () => {
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
  }, [onAnimationComplete]);

  return (
    <div 
      ref={containerRef} 
      className={`fixed inset-0 z-50 ${className}`}
      style={{ background: 'linear-gradient(to bottom, #050515, #0a0a20, #050515)' }}
    />
  );
};

export default CanvasLoading;