import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Network, X } from 'lucide-react';

export const TOUR_STEPS = [
  { tab: 'calculator', target: 'calculator-input', title: 'Subnet calculator input', text: 'Enter an IP and mask (for example 192.168.10.0/24) to see network, broadcast, and usable host range.' },
  { tab: 'vlsm', target: 'vlsm-input', title: 'VLSM splitter', text: 'Split a network into smaller subnets based on the number of hosts you need.' },
  { tab: 'overlaps', target: 'overlap-input', title: 'Overlap checker', text: "Add your subnets to a list and we'll flag any that overlap." },
  { tab: 'vlans', target: 'vlan-editor', title: 'VLAN table editor', text: 'Assign VLAN IDs, names, and subnets in one table.' },
  { tab: 'vlans', target: 'csv-export', title: 'Export CSV', text: 'Download your plan as a CSV.' },
];

export function shouldShowTour() {
  try { return localStorage.getItem('tour_completed') !== 'true'; }
  catch { return true; }
}

export default function Tour({ step, onStep, onFinish }) {
  const dialog = useRef(null);
  const card = useRef(null);
  const title = useRef(null);
  const [layout, setLayout] = useState(null);
  const current = TOUR_STEPS[step];
  const welcome = step === -1;
  const last = step === TOUR_STEPS.length - 1;

  useLayoutEffect(() => {
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      document.getElementById('replay-tour')?.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    title.current?.focus({ preventScroll: true });
    if (!current) { setLayout(null); return; }
    const target = document.querySelector(`[data-tour="${current.target}"]`);
    if (!target) { setLayout(null); return; }
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
    function position(align = false) {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const cardWidth = Math.min(360, viewportWidth - 24);
      const cardHeight = card.current.offsetHeight;
      let bounds = target.getBoundingClientRect();
      const fitsRight = bounds.right + cardWidth + 28 <= viewportWidth;
      const fitsLeft = bounds.left - cardWidth - 16 >= 12;
      const docked = viewportWidth <= 640 || viewportHeight < 600 || (!fitsRight && !fitsLeft);
      const cardTop = viewportHeight - cardHeight - 12;
      if (align) {
        const availableHeight = docked ? cardTop - 28 : viewportHeight - 40;
        const desiredTop = Math.max(20, (availableHeight - Math.min(bounds.height, availableHeight)) / 2);
        window.scrollBy({ top: bounds.top - desiredTop, behavior: 'instant' });
        bounds = target.getBoundingClientRect();
      }
      const top = clamp(bounds.top - 5, 8, docked ? cardTop - 20 : viewportHeight - 8);
      const bottom = clamp(bounds.bottom + 5, top, docked ? cardTop - 16 : viewportHeight - 8);
      const left = clamp(bounds.left - 5, 8, viewportWidth - 8);
      const right = clamp(bounds.right + 5, left, viewportWidth - 8);
      setLayout({
        spotlight: { top, left, width: right - left, height: bottom - top },
        tooltip: {
          width: cardWidth,
          left: docked ? (viewportWidth - cardWidth) / 2 : fitsRight ? right + 12 : left - cardWidth - 12,
          top: docked ? cardTop : clamp(top, 12, viewportHeight - cardHeight - 12),
        },
      });
    }
    position(true);
    const onScroll = () => position();
    const onResize = () => position(true);
    const observer = new ResizeObserver(onScroll);
    observer.observe(target);
    observer.observe(card.current);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [current]);

  function next() { if (last) onFinish(); else onStep(step + 1); }
  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onFinish();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (step > 0) onStep(step - 1);
    }
  }

  return <dialog className="tour-shell" ref={dialog} aria-labelledby="tour-title" aria-describedby="tour-description" onKeyDown={onKeyDown} onCancel={(event) => { event.preventDefault(); onFinish(); }}>
    {layout && !welcome ? <>
      <div className="tour-shade" style={{ inset: `0 0 auto 0`, height: layout.spotlight.top }} />
      <div className="tour-shade" style={{ top: layout.spotlight.top + layout.spotlight.height, bottom: 0, left: 0, right: 0 }} />
      <div className="tour-shade" style={{ top: layout.spotlight.top, left: 0, width: layout.spotlight.left, height: layout.spotlight.height }} />
      <div className="tour-shade" style={{ top: layout.spotlight.top, left: layout.spotlight.left + layout.spotlight.width, right: 0, height: layout.spotlight.height }} />
      <div className="tour-spotlight" style={layout.spotlight} aria-hidden="true" />
    </> : <div className="tour-shade" style={{ inset: 0 }} />}
    <section ref={card} className={`tour-card ${welcome ? 'tour-welcome' : ''}`} style={!welcome && layout ? layout.tooltip : undefined}>
      <button type="button" className="icon-button tour-close" aria-label="Close tour" title="Close tour" onClick={onFinish}><X size={18} /></button>
      {welcome ? <span className="tour-symbol"><Network size={27} /></span> : <div className="tour-progress"><span>Step {step + 1} of {TOUR_STEPS.length}</span><div aria-hidden="true">{TOUR_STEPS.map((item, index) => <i key={item.target} className={index <= step ? 'complete' : ''} />)}</div></div>}
      <h2 id="tour-title" ref={title} tabIndex={-1}>{welcome ? 'Welcome to the Subnet & VLAN Planner' : current.title}</h2>
      <p id="tour-description">{welcome ? 'Plan your IPv4 networks, check for conflicts, and organize VLANs in one local workspace. Take a quick tour of the five essentials.' : current.text}</p>
      <div className="tour-actions"><button type="button" className="tour-skip" onClick={onFinish}>Skip</button><div>{!welcome && <button type="button" className="button" disabled={step === 0} onClick={() => onStep(step - 1)}><ArrowLeft size={16} />Back</button>}<button type="button" className="button primary" onClick={next}>{last ? <Check size={16} /> : <ArrowRight size={16} />}{welcome ? 'Start tour' : last ? 'Finish' : 'Next'}</button></div></div>
    </section>
  </dialog>;
}