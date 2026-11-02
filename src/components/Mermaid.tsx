// Mermaid — วาดไดอะแกรมจากข้อความ (โหลดไลบรารีเฉพาะตอนเปิดหน้าข้อมูล)
import React, { useEffect, useRef, useState } from 'react';

let seq = 0;
let loader: Promise<typeof import('mermaid').default> | null = null;
const loadMermaid = () => (loader ||= import('mermaid').then((m) => m.default));

const isDark = () => document.documentElement.classList.contains('dark');

const Mermaid: React.FC<{ chart: string; caption?: string }> = ({ chart, caption }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(isDark());

  // วาดใหม่เมื่อสลับโหมดมืด/สว่าง
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    loadMermaid().then(async (mermaid) => {
      const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
        fontFamily: '"IBM Plex Sans Thai", system-ui, sans-serif',
        themeVariables: brand ? { primaryBorderColor: `rgb(${brand})`, lineColor: dark ? '#94a3b8' : '#475569' } : undefined,
        sequence: { mirrorActors: false, showSequenceNumbers: true },
        flowchart: { htmlLabels: true, curve: 'basis' },
      });
      try {
        const { svg } = await mermaid.render(`mmd-${++seq}`, chart.trim());
        if (alive && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(e?.message || 'วาดไดอะแกรมไม่สำเร็จ');
      }
    });
    return () => { alive = false; };
  }, [chart, dark]);

  return (
    <figure className="my-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        {error ? <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre> : <div ref={ref} className="flex justify-center min-h-[4rem] [&_svg]:max-w-full [&_svg]:h-auto" />}
      </div>
      {caption && <figcaption className="text-xs text-slate-500 text-center mt-1.5">{caption}</figcaption>}
    </figure>
  );
};

export default Mermaid;
