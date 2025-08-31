import { useEffect, useRef } from 'react';

function usePrefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Particles({ count = 12 }) {
  const canvasRef = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return; // respect reduced motion
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const { innerWidth:w=800, innerHeight:h=600 } = window;
      canvas.width = w * DPR; canvas.height = h * DPR;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const items = Array.from({ length: count }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 6 + Math.random() * 10,
      s: 0.3 + Math.random() * 0.6,
      a: Math.random() * Math.PI * 2
    }));

    function drawForest(w, h){
      for (const leaf of items) {
        leaf.a += 0.002 + leaf.s * 0.003;
        leaf.y += leaf.s;
        leaf.x += Math.cos(leaf.a) * 0.3;
        if (leaf.y - leaf.r > h) { leaf.y = -leaf.r; leaf.x = Math.random() * w; }
        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(Math.cos(leaf.a) * 0.2);
        const grd = ctx.createLinearGradient(-leaf.r, -leaf.r, leaf.r, leaf.r);
        grd.addColorStop(0, 'rgba(239,68,68,0.18)');
        grd.addColorStop(1, 'rgba(239,68,68,0.18)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(0, -leaf.r);
        ctx.quadraticCurveTo(leaf.r, 0, 0, leaf.r);
        ctx.quadraticCurveTo(-leaf.r, 0, 0, -leaf.r);
        ctx.fill();
        ctx.restore();
      }
    }

    function draw() {
      const { innerWidth: w, innerHeight: h } = window;
      ctx.clearRect(0, 0, w, h);
      drawForest(w, h);
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      // clear on unmount/switch to avoid ghost frames
      const { innerWidth: w, innerHeight: h } = window;
      ctx.clearRect(0, 0, w, h);
    };
  }, [count, reduced]);

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }} aria-hidden="true" />;
}
