import { useEffect, useState } from 'react';

export default function TopProgress({ active }){
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!active) { setWidth(0); return; }
    let t;
    function tick(){ setWidth(w => (w >= 90 ? w : w + Math.random()*5 + 2)); t = setTimeout(tick, 300); }
    tick();
    return () => { clearTimeout(t); setWidth(0); };
  }, [active]);
  return (
    <div aria-hidden="true" style={{ position:'fixed', left:0, right:0, top:0, height:3, zIndex:70, pointerEvents:'none', background:'transparent' }}>
      <div style={{ width: active ? width+'%' : 0, height:'100%', background:'linear-gradient(90deg, var(--accent), rgba(255,255,255,0.6))', boxShadow:'0 0 12px rgba(239,68,68,0.6)', transition:'width .25s ease' }} />
    </div>
  );
}


