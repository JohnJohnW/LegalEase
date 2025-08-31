export default function LegalMeter({ value = 70 }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const hue = 140; // green-ish
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }} aria-label={`LegalMeter ${v} out of 100`}>
      <div style={{ fontSize:13, color:'var(--muted)' }}>LegalMeter</div>
      <div style={{ position:'relative', width:140, height:10, background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:999 }}>
        <div style={{ position:'absolute', inset:1, width:`${v}%`, background:`linear-gradient(90deg, hsl(${hue} 60% 40% / .9), hsl(170 60% 40% / .9))`, borderRadius:999, transition:'width .5s ease' }} />
      </div>
      <div style={{ fontSize:13, color:'var(--ink)', minWidth:28, textAlign:'right' }}>{v}</div>
    </div>
  );
}

