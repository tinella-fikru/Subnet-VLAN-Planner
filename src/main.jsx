import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Network, Calculator, GitBranch, ScanLine, Rows3, Upload, Download, Plus,
  Trash2, Copy, Check, CheckCircle2, AlertTriangle, ArrowRight, ArrowUpRight,
  ShieldCheck, HardDrive, FileJson, FileSpreadsheet, X, RotateCcw, CircleHelp,
} from 'lucide-react';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';
import { subnet, parseCIDR, prefixToMask, maskToPrefix, allocateVLSM, findOverlaps, validateVLANs, formatNumber } from './network.js';
import { createProject, importProject, exportProject, exportCSV } from './project.js';
import Tour, { TOUR_STEPS, shouldShowTour } from './Tour.jsx';

const STORAGE_KEY = 'subnet-vlan-planner-v1';
const tabs = [
  { id: 'calculator', name: 'Calculator', icon: Calculator },
  { id: 'vlsm', name: 'VLSM splitter', icon: GitBranch },
  { id: 'overlaps', name: 'Overlaps', icon: ScanLine },
  { id: 'vlans', name: 'VLAN table', icon: Rows3 },
];
const attempt = (operation) => {
  try { return { value: operation() }; } catch (error) { return { error: error.message }; }
};
const key = () => crypto.randomUUID();

function loadSession() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { project: importProject(saved), persist: true } : { project: createProject(), persist: false };
  } catch {
    return { project: createProject(), persist: false, error: 'Saved session could not be loaded. Local saving is off; your original stored data has not been overwritten.' };
  }
}

function IconButton({ icon: Icon, label, className = '', ...props }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={17} /></button>;
}

function Button({ icon: Icon, children, className = '', ...props }) {
  return <button type="button" className={`button ${className}`} {...props}>{Icon && <Icon size={16} />}<span>{children}</span></button>;
}

function Badge({ children, tone = 'neutral', icon: Icon }) {
  return <span className={`badge ${tone}`}>{Icon && <Icon size={13} />}{children}</span>;
}

function Notice({ children, tone = 'error' }) {
  return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{tone === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<span>{children}</span></div>;
}

function Field({ label, error, className = '', ...props }) {
  const id = React.useId();
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />{error && <span className="field-error" id={`${id}-error`}>{error}</span>}</div>;
}

function Metric({ label, value, detail, tone = '' }) {
  return <div className={`metric ${tone}`}><span className="small-label">{label}</span><strong>{value}</strong>{detail && <span className="muted">{detail}</span>}</div>;
}

function BitView({ result }) {
  return <section className="bit-view" aria-label="IPv4 address in binary">
    <div className="section-title"><h3>Address structure</h3><span className="mono muted">32 bits</span></div>
    <div className="octets">{[0, 1, 2, 3].map((octet) => <div className="octet" key={octet}>
      <div className="bit-cells">{result.bits.slice(octet * 8, octet * 8 + 8).split('').map((bit, index) => <span key={index} className={octet * 8 + index < result.prefix ? 'network-bit' : 'host-bit'}>{bit}</span>)}</div>
      <span className="octet-value">{Number.parseInt(result.bits.slice(octet * 8, octet * 8 + 8), 2)}</span>
    </div>)}</div>
    <div className="legend"><span><i className="network-swatch" />Network <b>{result.prefix} bits</b></span><span><i className="host-swatch" />Host <b>{32 - result.prefix} bits</b></span></div>
  </section>;
}

function CalculatorView({ data, update, addOverlap, addVLAN, notify }) {
  const calculation = attempt(() => subnet(data.ip, data.mode === 'mask' ? maskToPrefix(data.mask) : data.prefix));
  const result = calculation.value;
  function change(field, value) {
    const next = { ...data, [field]: value };
    if (field === 'prefix') {
      const converted = attempt(() => prefixToMask(value));
      if (converted.value !== undefined) next.mask = converted.value;
    }
    if (field === 'mask') {
      const converted = attempt(() => maskToPrefix(value));
      if (converted.value !== undefined) next.prefix = String(converted.value);
    }
    update(next);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${result.cidr}\nMask: ${result.mask}\nHost range: ${result.first} - ${result.last}\nBroadcast: ${result.prefix >= 31 ? 'Not applicable' : result.broadcast}\nUsable hosts: ${result.usable}`);
      notify('Subnet details copied.');
    } catch { notify('Clipboard is unavailable in this browser context. You can select and copy the result text.', 'error'); }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">IPv4 WORKSPACE</div><h1>Subnet calculator</h1></div><Badge tone="success" icon={CheckCircle2}>Live calculation</Badge></div>
    <div className="calculator-layout">
      <section className="input-pane" aria-labelledby="network-input-heading">
        <div className="section-title"><h2 id="network-input-heading">Network input</h2><IconButton icon={RotateCcw} label="Reset calculator" onClick={() => update(createProject().calculator)} /></div>
        <Field data-tour="calculator-input" label="IP address" className="mono-input" value={data.ip} spellCheck={false} autoComplete="off" onChange={(event) => change('ip', event.target.value)} placeholder="192.168.10.24" />
        <fieldset className="mode-control"><legend>Subnet format</legend><div className="segmented">{['cidr', 'mask'].map((mode) => <button key={mode} type="button" aria-pressed={data.mode === mode} className={data.mode === mode ? 'selected' : ''} onClick={() => change('mode', mode)}>{mode === 'cidr' ? 'CIDR prefix' : 'Subnet mask'}</button>)}</div></fieldset>
        {data.mode === 'cidr' ? <div className="prefix-field"><Field label="Prefix length" className="mono-input" type="number" min="0" max="32" value={data.prefix} onChange={(event) => change('prefix', event.target.value)} /><span className="prefix-slash">/</span></div> : <Field label="Subnet mask" className="mono-input" value={data.mask} spellCheck={false} onChange={(event) => change('mask', event.target.value)} placeholder="255.255.255.0" />}
        <div className="conversion"><span>{data.mode === 'cidr' ? 'Subnet mask' : 'CIDR prefix'}</span><code>{result ? (data.mode === 'cidr' ? result.mask : `/${result.prefix}`) : '--'}</code></div>
        {calculation.error && <Notice>{calculation.error}</Notice>}
        <div className="input-divider" />
        <div className="small-label">NETWORK ACTIONS</div>
        <Button icon={Plus} className="primary full-width" disabled={!result} onClick={() => addVLAN(result.cidr)}>Add to VLAN table</Button>
        <Button icon={ScanLine} className="full-width" disabled={!result} onClick={() => addOverlap([{ name: 'Calculated subnet', cidr: result.cidr }])}>Check for overlaps</Button>
        <div className="local-caption"><ShieldCheck size={15} /><span>Calculated on this device</span></div>
      </section>
      <section className="result-pane" aria-label="Subnet results" aria-live="polite">
        {result ? <>
          <div className="result-header"><div><div className="small-label">NETWORK ADDRESS</div><div className="network-address">{result.network}<span>/{result.prefix}</span></div></div><IconButton icon={Copy} label="Copy subnet details" onClick={copy} /></div>
          <div className="result-badges"><Badge tone={result.scope === 'Private' ? 'success' : result.scope === 'Public' ? 'blue' : 'warning'} icon={ShieldCheck}>{result.scope} address</Badge><Badge>Class {result.ipClass}</Badge>{result.prefix >= 31 && <Badge tone="warning">{result.prefix === 31 ? 'Point-to-point' : 'Host route'}</Badge>}</div>
          <div className="metrics"><Metric label="USABLE HOSTS" value={formatNumber(result.usable)} detail={result.prefix >= 31 ? 'No reserved endpoints' : 'Excludes network & broadcast'} tone="green" /><Metric label="TOTAL ADDRESSES" value={formatNumber(result.total)} detail={`/${result.prefix} address block`} /><Metric label="SUBNET MASK" value={result.mask} detail={`Wildcard ${result.wildcard}`} tone="address-metric" /></div>
          <dl className="address-details"><div><dt>First usable host</dt><dd>{result.first}</dd></div><div><dt>Last usable host</dt><dd>{result.last}</dd></div><div><dt>Broadcast address</dt><dd>{result.prefix >= 31 ? 'Not applicable' : result.broadcast}</dd></div><div><dt>Wildcard mask</dt><dd>{result.wildcard}</dd></div></dl>
          <BitView result={result} />
          <div className="result-footnote"><CheckCircle2 size={15} /><span>{result.prefix === 31 ? 'RFC 3021: both addresses are usable on point-to-point links.' : result.prefix === 32 ? 'Single-address host route. No broadcast address.' : `${result.cidr} contains ${formatNumber(result.usable)} usable host addresses.`}</span></div>
        </> : <div className="empty-state"><Calculator size={36} /><h2>No valid subnet</h2><p>Check the IP address and subnet format.</p></div>}
      </section>
    </div>
    <section className="reference-strip"><div><Network size={20} /><h3>Private address space</h3></div><span><code>10.0.0.0/8</code><small>Class A</small></span><span><code>172.16.0.0/12</code><small>Class B range</small></span><span><code>192.168.0.0/16</code><small>Class C range</small></span><Badge>RFC 1918</Badge></section>
  </>;
}

function VLSMView({ data, update, addOverlap }) {
  const result = attempt(() => allocateVLSM(data.parent, data.requests));
  const allocation = result.value;
  function updateRow(rowKey, field, value) {
    update({ ...data, requests: data.requests.map((row) => row.key === rowKey ? { ...row, [field]: value } : row) });
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">ADDRESS ALLOCATION</div><h1>VLSM splitter</h1></div><Badge>Largest first</Badge></div>
    <div className="splitter-layout">
      <section className="input-pane"><h2>Subnet requirements</h2><Field data-tour="vlsm-input" label="Parent network" className="mono-input" value={data.parent} onChange={(event) => update({ ...data, parent: event.target.value })} spellCheck={false} />
        <div className="request-labels"><span>Subnet name</span><span>Hosts needed</span></div>
        <div className="request-list">{data.requests.map((row, index) => <div className="request-row" key={row.key}>
          <input aria-label={`Subnet ${index + 1} name`} value={row.name} maxLength={2000} onChange={(event) => updateRow(row.key, 'name', event.target.value)} placeholder={`Subnet ${index + 1}`} />
          <input aria-label={`Subnet ${index + 1} hosts`} type="number" min="1" max="4294967294" value={row.hosts} onChange={(event) => updateRow(row.key, 'hosts', event.target.value)} />
          <IconButton icon={Trash2} label={`Delete requirement ${index + 1}`} className="danger-quiet" onClick={() => update({ ...data, requests: data.requests.filter((item) => item.key !== row.key) })} />
        </div>)}</div>
        <Button icon={Plus} className="full-width" disabled={data.requests.length >= 256} onClick={() => update({ ...data, requests: [...data.requests, { key: key(), name: '', hosts: '30' }] })}>Add requirement</Button>
        <div className="note"><CircleHelp size={16} /><span>Standard LAN allocation: network and broadcast reserved. Minimum block: /30.</span></div>
      </section>
      <section className="allocation-pane" aria-live="polite"><div className="section-title"><h2>Allocation summary</h2>{allocation && <Badge tone="success" icon={Check}>All subnets fit</Badge>}</div>
        {result.error ? <Notice>{result.error}</Notice> : <>
          <div className="parent-address mono">{allocation.parent.cidr}</div>
          <div className="metrics"><Metric label="ALLOCATED" value={formatNumber(allocation.used)} detail="addresses" /><Metric label="AVAILABLE" value={formatNumber(allocation.remaining)} detail="addresses remaining" tone="green" /><Metric label="UTILIZATION" value={`${Math.round(allocation.used / allocation.parent.total * 100)}%`} detail={`${allocation.allocations.length} subnets`} /></div>
          <div className="allocation-bar" aria-label={`${allocation.used} allocated of ${allocation.parent.total} addresses`}>{allocation.allocations.map((row, index) => <div key={row.key} className={`allocation-color color-${index % 4}`} style={{ flexGrow: row.total }} title={`${row.name || 'Subnet'}: ${row.cidr} (${row.total} addresses)`} />)}{allocation.remaining > 0 && <div className="unallocated" style={{ flexGrow: allocation.remaining }} title={`${allocation.remaining} available addresses`} />}</div>
          <div className="allocation-legend">{allocation.allocations.map((row, index) => <span key={row.key}><i className={`color-${index % 4}`} />{row.name || `Subnet ${row.index + 1}`}<code>{row.cidr}</code></span>)}<span><i className="unallocated" />Available<code>{formatNumber(allocation.remaining)}</code></span></div>
        </>}
      </section>
    </div>
    {allocation && <section className="table-section"><div className="section-title"><h2>Allocated subnets <span className="count">{allocation.allocations.length}</span></h2><Button icon={ScanLine} onClick={() => addOverlap(allocation.allocations.map((row) => ({ name: row.name || `Subnet ${row.index + 1}`, cidr: row.cidr })))}>Check for overlaps<ArrowUpRight size={14} /></Button></div>
      <div className="table-scroll"><table><thead><tr><th>Subnet</th><th>Network / CIDR</th><th>Subnet mask</th><th>Usable host range</th><th>Broadcast</th><th className="right">Hosts</th></tr></thead><tbody>{allocation.allocations.map((row) => <tr key={row.key}><td className="strong">{row.name || `Subnet ${row.index + 1}`}</td><td className="mono green-text">{row.cidr}</td><td className="mono">{row.mask}</td><td className="mono range-cell">{row.first}<br /><span className="muted">to {row.last}</span></td><td className="mono">{row.broadcast}</td><td className="right mono">{formatNumber(row.hosts)}<span className="muted"> / {formatNumber(row.usable)}</span></td></tr>)}</tbody></table></div>
    </section>}
  </>;
}

function OverlapsView({ rows, update }) {
  const { parsed, conflicts } = findOverlaps(rows);
  const errors = parsed.filter((row) => row.error).length;
  const conflictIndexes = new Set(conflicts.flatMap((conflict) => [conflict.left, conflict.right]));
  function change(rowKey, field, value) { update(rows.map((row) => row.key === rowKey ? { ...row, [field]: value } : row)); }
  return <>
    <div className="page-heading"><div><div className="eyebrow">NETWORK VALIDATION</div><h1>Overlap checker</h1></div><Button data-tour="overlap-input" icon={Plus} className="primary" disabled={rows.length >= 256} onClick={() => update([...rows, { key: key(), name: '', cidr: '' }])}>Add subnet</Button></div>
    <div className="summary-strip"><Metric label="SUBNETS" value={rows.length} /><Metric label="OVERLAPPING PAIRS" value={conflicts.length} tone={conflicts.length ? 'red' : 'green'} /><Metric label="INVALID ENTRIES" value={errors} tone={errors ? 'amber' : ''} /></div>
    {!rows.length ? <div className="empty-state"><ScanLine size={36} /><h2>No subnets yet</h2><Button icon={Plus} onClick={() => update([{ key: key(), name: '', cidr: '' }])}>Add subnet</Button></div> : <>
      <div className="table-scroll"><table className="overlap-table"><thead><tr><th>Subnet name</th><th>Network / CIDR</th><th>Normalized network</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{parsed.map((row, index) => <tr key={row.key} className={conflictIndexes.has(index) ? 'conflict-row' : ''}>
        <td><input aria-label={`Subnet ${index + 1} name`} value={row.name} maxLength={2000} onChange={(event) => change(row.key, 'name', event.target.value)} placeholder={`Subnet ${index + 1}`} /></td>
        <td><input className="mono" aria-label={`Subnet ${index + 1} CIDR`} aria-invalid={Boolean(row.error)} value={row.cidr} onChange={(event) => change(row.key, 'cidr', event.target.value)} placeholder="10.0.0.0/24" spellCheck={false} />{row.error && <span className="field-error">{row.error}</span>}</td>
        <td className="mono">{row.subnet?.cidr || '--'}</td><td><Badge tone={row.error ? 'warning' : conflictIndexes.has(index) ? 'error' : 'success'} icon={row.error || conflictIndexes.has(index) ? AlertTriangle : CheckCircle2}>{row.error ? 'Invalid' : conflictIndexes.has(index) ? 'Overlap' : 'Clear'}</Badge></td>
        <td><IconButton icon={Trash2} label={`Delete subnet ${index + 1}`} className="danger-quiet" onClick={() => update(rows.filter((item) => item.key !== row.key))} /></td>
      </tr>)}</tbody></table></div>
      <section className="conflict-section"><div className="section-title"><h2>Conflict report</h2><span className="muted">{formatNumber(rows.length * (rows.length - 1) / 2)} pairs checked</span></div>
        {errors > 0 && <Notice tone="warning">{errors} invalid {errors === 1 ? 'entry was' : 'entries were'} excluded from overlap checks.</Notice>}
        {conflicts.length ? <div className="conflict-list">{conflicts.map((conflict) => <div className="conflict-item" key={`${conflict.left}-${conflict.right}`}><AlertTriangle size={20} /><div><h3>{rows[conflict.left].name || `Subnet ${conflict.left + 1}`}<span className="muted"> overlaps </span>{rows[conflict.right].name || `Subnet ${conflict.right + 1}`}</h3><p><code>{conflict.first} - {conflict.last}</code></p></div><Badge tone="error">{formatNumber(conflict.count)} shared addresses</Badge></div>)}</div> : !errors && <Notice tone="success">No overlapping subnets. All {rows.length} networks are clear.</Notice>}
      </section>
    </>}
  </>;
}

function VLANView({ rows, update, downloadCSV, addVLAN, notify }) {
  const errors = validateVLANs(rows);
  const invalid = errors.filter((error) => Object.keys(error).length).length;
  const overlaps = findOverlaps(rows).conflicts;
  const [query, setQuery] = useState('');
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => `${row.vlanId} ${row.name} ${row.cidr} ${row.description}`.toLowerCase().includes(query.toLowerCase()));
  function change(rowKey, field, value) { update(rows.map((row) => row.key === rowKey ? { ...row, [field]: value } : row)); }
  function remove(row) {
    update(rows.filter((item) => item.key !== row.key));
    notify(`VLAN ${row.vlanId || '(draft)'} deleted.`, 'success', () => update((current) => current.length >= 512 || current.some((item) => item.key === row.key) ? current : [...current, row]));
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">SEGMENTATION INVENTORY</div><h1>VLAN table</h1></div><div className="actions"><Button data-tour="csv-export" icon={FileSpreadsheet} disabled={Boolean(invalid) || !rows.length} onClick={downloadCSV}>Export CSV</Button><Button icon={Plus} className="primary" disabled={rows.length >= 512} onClick={() => { setQuery(''); addVLAN(''); }}>Add VLAN</Button></div></div>
    <div className="summary-strip"><Metric label="TOTAL VLANS" value={rows.length} /><Metric label="ACTIVE" value={rows.filter((row) => row.active).length} tone="green" /><Metric label="NEEDS ATTENTION" value={invalid} tone={invalid ? 'amber' : ''} /></div>
    <div className="table-toolbar"><div className="search-field"><input type="search" aria-label="Search VLANs" placeholder="Search VLANs..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="muted">{visible.length} of {rows.length} VLANs</span></div>
    {invalid > 0 && <Notice tone="warning">{invalid} {invalid === 1 ? 'row needs' : 'rows need'} attention before CSV export. JSON backups retain unfinished rows.</Notice>}
    {overlaps.length > 0 && <Notice tone="warning">{overlaps.length} overlapping VLAN subnet {overlaps.length === 1 ? 'pair' : 'pairs'} detected, including inactive VLANs.</Notice>}
    <div className="table-scroll" data-tour="vlan-editor"><table className="vlan-table"><thead><tr><th>VLAN ID</th><th>Name</th><th>Subnet / CIDR</th><th>Description</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(({ row, index }) => <tr key={row.key}>
      <td><input aria-label={`VLAN ${index + 1} ID`} type="number" min="1" max="4094" className="mono" value={row.vlanId} aria-invalid={Boolean(errors[index].vlanId)} onChange={(event) => change(row.key, 'vlanId', event.target.value)} />{errors[index].vlanId && <span className="field-error">{errors[index].vlanId}</span>}</td>
      <td><input aria-label={`VLAN ${index + 1} name`} value={row.name} maxLength={2000} aria-invalid={Boolean(errors[index].name)} onChange={(event) => change(row.key, 'name', event.target.value)} placeholder="VLAN name" />{errors[index].name && <span className="field-error">{errors[index].name}</span>}</td>
      <td><input aria-label={`VLAN ${index + 1} subnet`} className="mono" value={row.cidr} aria-invalid={Boolean(errors[index].cidr)} onChange={(event) => change(row.key, 'cidr', event.target.value)} spellCheck={false} placeholder="10.0.0.0/24" />{errors[index].cidr ? <span className="field-error">{errors[index].cidr}</span> : parseCIDR(row.cidr).cidr !== row.cidr.trim() && <span className="field-hint">Network: {parseCIDR(row.cidr).cidr}</span>}</td>
      <td><input aria-label={`VLAN ${index + 1} description`} value={row.description} maxLength={2000} onChange={(event) => change(row.key, 'description', event.target.value)} placeholder="Description" /></td>
      <td><label className="switch-label"><input type="checkbox" role="switch" aria-label={`VLAN ${index + 1} active`} checked={row.active} onChange={(event) => change(row.key, 'active', event.target.checked)} /><span className="switch-track" /><span>{row.active ? 'Active' : 'Inactive'}</span></label></td>
      <td><IconButton icon={Trash2} label={`Delete VLAN ${index + 1}`} className="danger-quiet" onClick={() => remove(row)} /></td>
    </tr>)}</tbody></table></div>
    {!visible.length && <div className="empty-state"><Rows3 size={32} /><h2>{rows.length ? 'No matching VLANs' : 'No VLANs yet'}</h2>{rows.length ? <Button onClick={() => setQuery('')}>Clear search</Button> : <Button icon={Plus} onClick={() => addVLAN('')}>Add VLAN</Button>}</div>}
    <div className="table-bottom"><ShieldCheck size={15} /><span>VLAN range: 1-4094. Reserved: 1, 1002-1005.</span><span className="push-right">Changes stay in this project</span></div>
  </>;
}

function App() {
  const [initial] = useState(loadSession);
  const [project, setProject] = useState(initial.project);
  const [persist, setPersist] = useState(initial.persist);
  const [storageStatus, setStorageStatus] = useState(initial.persist ? 'Saved locally' : 'Session only');
  const [tab, setTab] = useState(() => tabs.some((item) => item.id === location.hash.slice(1)) ? location.hash.slice(1) : 'calculator');
  const [notification, setNotification] = useState(initial.error ? { message: initial.error, tone: 'error' } : null);
  const fileInput = useRef(null);
  const confirmation = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [tourStep, setTourStep] = useState(() => shouldShowTour() ? -1 : null);
  const [loadingExample, setLoadingExample] = useState(false);
  const notify = (message, tone = 'success', undo) => setNotification({ message, tone, undo });

  useEffect(() => {
    if (!persist) return;
    try { localStorage.setItem(STORAGE_KEY, exportProject(project)); setStorageStatus('Saved locally'); }
    catch { setStorageStatus('Local save failed'); }
  }, [project, persist]);

  useEffect(() => {
    const onHashChange = () => {
      const next = location.hash.slice(1);
      if (tabs.some((item) => item.id === next)) setTab(next);
    };
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  function selectTab(next) { setTab(next); history.replaceState(null, '', `#${next}`); }
  function navigateTour(step) {
    selectTab(TOUR_STEPS[step].tab);
    setTourStep(step);
  }
  function finishTour() {
    setTourStep(null);
    try { localStorage.setItem('tour_completed', 'true'); }
    catch { notify('Tour closed. Your browser blocked saving the tour preference, so it may appear again on reload.', 'error'); }
  }
  function loadExample() {
    setLoadingExample(true);
    setPendingImport(createProject());
    confirmation.current.showModal();
  }
  function updateSection(section, value) {
    setProject((current) => ({ ...current, [section]: typeof value === 'function' ? value(current[section]) : value }));
  }
  function togglePersist(value) {
    if (!value) {
      try { localStorage.removeItem(STORAGE_KEY); setStorageStatus('Session only'); }
      catch { setStorageStatus('Local save unavailable'); notify('Could not remove the saved session. Clear this site\'s browser storage to remove it.', 'error'); }
    }
    setPersist(value);
  }
  function addOverlap(items) {
    const existing = new Set(project.overlaps.map((row) => attempt(() => parseCIDR(row.cidr)).value?.cidr));
    const additions = items.filter((item) => {
      if (existing.has(item.cidr)) return false;
      existing.add(item.cidr);
      return true;
    }).map((item) => ({ ...item, key: key() }));
    if (project.overlaps.length + additions.length > 256) return notify('The overlap checker supports up to 256 subnets. Remove entries before adding more.', 'error');
    updateSection('overlaps', [...project.overlaps, ...additions]);
    selectTab('overlaps');
    notify(additions.length ? `${additions.length} subnet${additions.length === 1 ? '' : 's'} added to the overlap checker.` : 'These subnets are already in the overlap checker.');
  }
  function addVLAN(cidr) {
    if (project.vlans.length >= 512) return notify('The table supports up to 512 VLANs.', 'error');
    let vlanId = 10;
    const used = new Set(project.vlans.map((row) => Number(row.vlanId)));
    while (used.has(vlanId) || (vlanId >= 1002 && vlanId <= 1005)) vlanId++;
    updateSection('vlans', [...project.vlans, { key: key(), vlanId: String(vlanId), name: `VLAN ${vlanId}`, cidr, description: '', active: true }]);
    selectTab('vlans');
    notify(`VLAN ${vlanId} added${cidr ? ` with ${cidr}` : ''}.`);
  }
  function download(contents, extension, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-') || 'network-project'}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`${extension.toUpperCase()} export downloaded.`);
  }
  function saveJSON() {
    try { download(exportProject(project), 'json', 'application/json'); }
    catch { notify('The project contains values that exceed the supported limits.', 'error'); }
  }
  async function readImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Project file exceeds the 2 MB limit.');
      const imported = importProject(await file.text());
      setLoadingExample(false);
      setPendingImport(imported);
      confirmation.current.showModal();
    } catch (error) { notify(error.message, 'error'); }
  }
  function onTabKey(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`).focus();
  }
  return <>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href="#calculator" onClick={() => selectTab('calculator')} aria-label="Subnet VLAN Planner home"><span className="brand-symbol"><Network size={23} /></span><span>subnet<span className="brand-divider">/</span><span className="brand-light">planner</span></span><span className="version-label">IPv4</span></a><div className="header-actions"><div className="header-status"><span className="status-dot" />Local workspace</div><Button icon={Network} onClick={loadExample}>Load example</Button><Button id="replay-tour" icon={CircleHelp} onClick={() => setTourStep(-1)}>Take the tour again</Button></div></div></header>
    <div className="app-shell">
      <div className="project-bar"><div className="project-identity"><div className="project-icon"><Network size={18} /></div><div><label className="small-label" htmlFor="project-name">PROJECT</label><input id="project-name" aria-label="Project name" className="project-name" value={project.name} maxLength={100} onChange={(event) => setProject({ ...project, name: event.target.value })} onBlur={() => { if (!project.name.trim()) setProject({ ...project, name: 'Untitled network' }); }} /></div></div><div className="actions"><Button icon={Upload} onClick={() => fileInput.current.click()}>Import project</Button><Button icon={Download} onClick={saveJSON}>Export JSON</Button><input className="sr-only" type="file" accept=".json,application/json" aria-label="Import project file" ref={fileInput} onChange={readImport} tabIndex={-1} /></div></div>
      <nav className="tab-bar" role="tablist" aria-label="Network planning tools">{tabs.map(({ id, name, icon: Icon }, index) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="workspace" tabIndex={tab === id ? 0 : -1} onClick={() => selectTab(id)} onKeyDown={(event) => onTabKey(event, index)} className={tab === id ? 'active' : ''}><Icon size={18} /><span>{name}</span>{id === 'vlans' && <span className="tab-count">{project.vlans.length}</span>}</button>)}</nav>
      <main id="workspace" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === 'calculator' && <CalculatorView data={project.calculator} update={(value) => updateSection('calculator', value)} addOverlap={addOverlap} addVLAN={addVLAN} notify={notify} />}
        {tab === 'vlsm' && <VLSMView data={project.vlsm} update={(value) => updateSection('vlsm', value)} addOverlap={addOverlap} />}
        {tab === 'overlaps' && <OverlapsView rows={project.overlaps} update={(value) => updateSection('overlaps', value)} />}
        {tab === 'vlans' && <VLANView rows={project.vlans} update={(value) => updateSection('vlans', value)} addVLAN={addVLAN} notify={notify} downloadCSV={() => { try { download(exportCSV(project.vlans), 'csv', 'text/csv;charset=utf-8'); } catch (error) { notify(error.message, 'error'); } }} />}
      </main>
      <footer><div className="footer-status"><HardDrive size={15} /><span>{storageStatus}</span>{storageStatus === 'Local save failed' && <span className="red-text">Export JSON to keep a backup.</span>}</div><label className="switch-label"><span>Save on this device</span><input type="checkbox" role="switch" checked={persist} onChange={(event) => togglePersist(event.target.checked)} /><span className="switch-track" /></label><span className="footer-version">SUBNET / VLAN PLANNER<span>v1.0</span></span></footer>
    </div>
    <div className="notification-region" aria-live="polite">{notification && <div className={`toast ${notification.tone}`}>{notification.tone === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}<span>{notification.message}</span>{notification.undo && <Button icon={RotateCcw} onClick={() => { notification.undo(); setNotification(null); }}>Undo</Button>}<IconButton icon={X} label="Dismiss notification" onClick={() => setNotification(null)} /></div>}</div>
    <dialog ref={confirmation} aria-labelledby="import-dialog-title" onCancel={() => setPendingImport(null)}><div className="dialog-heading"><FileJson size={24} /><h2 id="import-dialog-title">{loadingExample ? 'Load example project?' : 'Replace current project?'}</h2></div><p>{loadingExample ? 'Loading the office network example' : <>Importing <strong>{pendingImport?.name}</strong></>} replaces your current inputs, subnets, and VLANs. Export a backup first to keep your current project.</p><div className="dialog-actions"><Button onClick={() => { confirmation.current.close(); setPendingImport(null); }}>Cancel</Button><Button icon={Download} onClick={saveJSON}>Back up current</Button><Button className="primary" icon={Upload} onClick={() => { if (pendingImport) { setProject(pendingImport); if (loadingExample) selectTab('calculator'); notify(loadingExample ? 'Office network example loaded.' : `Imported ${pendingImport.name}.`); } confirmation.current.close(); setPendingImport(null); }}>{loadingExample ? 'Load example' : 'Replace project'}</Button></div></dialog>
    {tourStep !== null && <Tour step={tourStep} onStep={navigateTour} onFinish={finishTour} />}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);