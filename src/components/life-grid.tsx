'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { completedYears, formatMonth, generateLifeMonths, MONTH_NAMES } from '@/domain/dates.mjs';
import type { Snapshot, Profile } from '@/domain/types';
import { Icon } from './icons';
import { HelpLabel } from './help-tip';
import { MapFullscreen } from './map-fullscreen';
import { MonthTooltip, useMonthTooltip } from './month-tooltip';
type LifeGridProps = {
  state: Snapshot & {
    profile: Profile;
  };
  selectedMonth: string | null;
  onSelect: (key: string) => void;
  query: string;
  onSearch: (query: string) => void;
};
export function LifeGrid({ state, selectedMonth, onSelect, query, onSearch }: LifeGridProps) {
  const { profile, today, monthCounts } = state;
  const [searchInput, setSearchInput] = useState(query);
  const [fullscreen, setFullscreen] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  const showMemoriesAfterFullscreen = useRef(false);
  const searching = Boolean(query.trim());
  const search = state.search?.query === query.trim() ? state.search : undefined;
  const highlightedCounts = searching ? search?.monthCounts ?? {} : monthCounts;
  const months = useMemo(() => generateLifeMonths(profile.birthDate, today, profile.horizonYears), [profile.birthDate, today, profile.horizonYears]);
  const horizonYears = months.length / 12;
  const decades = Array.from({ length: Math.ceil(horizonYears / 10) }, (_, index) => index * 10);
  const currentIndex = months.findIndex(month => month.state === 'current');
  const [focusedIndex, setFocusedIndex] = useState(Math.max(0, currentIndex));
  const grid = useRef<HTMLDivElement>(null);
  const { tooltip, show: showTooltip, hide: hideTooltip } = useMonthTooltip();
  const lived = months.filter(month => month.state !== 'future').length;
  const remaining = months.length - lived;
  const percentage = Math.round(lived / months.length * 100);
  const columns = months.slice(0, 12).map(month => MONTH_NAMES[month.month - 1].slice(0, 1).toUpperCase());
  useEffect(() => {
    if (!fullscreen && wasFullscreen.current) {
      toggle.current?.focus({ preventScroll: true });
      if (showMemoriesAfterFullscreen.current) {
        showMemoriesAfterFullscreen.current = false;
        scrollToMemories();
      }
    }
    wasFullscreen.current = fullscreen;
  }, [fullscreen]);
  function closeFullscreen() {
    hideTooltip();
    setFullscreen(false);
  }
  function scrollToMemories() {
    document.getElementById('selected-month')?.scrollIntoView({ block: 'start' });
  }
  function selectMonth(key: string) {
    if (key !== selectedMonth) {
      onSelect(key);
      return;
    }
    if (fullscreen) {
      showMemoriesAfterFullscreen.current = true;
      closeFullscreen();
    } else {
      scrollToMemories();
    }
  }
  function jumpCurrent() {
    const key = today.slice(0, 7);
    onSelect(key);
    const currentMonth = grid.current?.querySelector<HTMLButtonElement>(`[data-month="${key}"]`);
    currentMonth?.focus({ preventScroll: true });
    currentMonth?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -12, ArrowDown: 12 };
    let next = index;
    if (event.key in delta)
      next += delta[event.key];
    else if (event.key === 'Home')
      next = Math.floor(index / 12) * 12;
    else if (event.key === 'End')
      next = Math.min(Math.floor(index / 12) * 12 + 11, lived - 1);
    else
      return;
    event.preventDefault();
    next = Math.max(0, Math.min(lived - 1, next));
    setFocusedIndex(next);
    grid.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  }
  const map = (<>
    <div className="card-heading">
      <div>
        <Icon name="grid" size={18} />
        <h2 id="life-map-title">El mapa de tu vida</h2>
      </div>
      <button
        ref={toggle}
        type="button"
        className="button secondary grid-view-toggle"
        aria-expanded={fullscreen}
        aria-controls="life-month-grid"
        aria-haspopup={fullscreen ? undefined : 'dialog'}
        onClick={() => {
          hideTooltip();
          setFullscreen(value => !value);
        }}
      >
        <Icon name={fullscreen ? 'collapse' : 'expand'} size={17} />
        {fullscreen ? 'Cerrar' : 'Pantalla completa'}
      </button>
    </div>
    <form
      className="memory-search"
      role="search"
      aria-label="Buscar recuerdos"
      onSubmit={event => {
        event.preventDefault();
        onSearch(searchInput.trim());
      }}
    >
      <HelpLabel htmlFor="memory-search" label="Buscar recuerdos" hintId="memory-search-help" hint="Busca por título, texto o etiqueta." />
      <div className="search-controls">
        <div className="search-input">
          <Icon name="search" size={18} className="search-symbol" />
          <input
            ref={searchField}
            id="memory-search"
            type="search"
            enterKeyHint="search"
            placeholder="Busca por título, texto o etiqueta…"
            value={searchInput}
            onChange={event => {
              const value = event.target.value;
              setSearchInput(value);
              if (!value.trim())
                onSearch('');
            }}
            aria-describedby="memory-search-help memory-search-status"
          />
          {searchInput && <button
            type="button"
            className="icon-button search-clear"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setSearchInput('');
              onSearch('');
              searchField.current?.focus();
            }}
          >
            <Icon name="close" size={16} />
          </button>}
        </div>
        <button type="submit" className="button secondary">Buscar</button>
      </div>
      <p id="memory-search-status" className={`field-hint${searching ? '' : ' visually-hidden'}`} role="status">
        {searching ? !search ? 'Buscando recuerdos…' : `${search.memoryCount} ${search.memoryCount === 1 ? 'recuerdo encontrado' : 'recuerdos encontrados'} en ${Object.keys(search.monthCounts).length} ${Object.keys(search.monthCounts).length === 1 ? 'mes' : 'meses'}. Solo las coincidencias se pintan de verde.` : ''}
      </p>
    </form>
    <div className="legend">
      <span><i className="legend-past" />Vivido</span>
      <span><i className="legend-current" />Este mes</span>
      <span><i className="legend-future" />Por vivir</span>
      <span>
        <i className="legend-memory" />
        {searching ? 'Con coincidencias' : 'Con recuerdos'}
      </span>
      <span><i className="legend-selected" />Seleccionado</span>
    </div>
    <div
      id="life-month-grid"
      className="life-decades"
      ref={grid}
      tabIndex={-1}
      aria-label={`${horizonYears} años agrupados en décadas. Usa las flechas para moverte entre meses.`}
      onPointerOverCapture={event => {
        if (event.pointerType !== 'touch')
          showTooltip(event.target);
      }}
      onPointerLeave={hideTooltip}
      onFocusCapture={event => showTooltip(event.target)}
      onBlurCapture={hideTooltip}
      onClickCapture={hideTooltip}
      onKeyDownCapture={event => {
        if (event.key === 'Escape')
          hideTooltip();
      }}
    >
      {decades.map(start => (<section
        className="life-decade"
        key={start}
        aria-label={`De ${start} a ${Math.min(start + 9, horizonYears - 1)} años`}
      >
        <h3>{start}–{Math.min(start + 9, horizonYears - 1)} <span>años</span></h3>
        <div className="month-columns" aria-hidden="true">
          <span />
          {columns.map((name, index) => <span key={index}>
            {name}
          </span>)}
        </div>
        <div className="life-rows">
          {Array.from({ length: Math.min(10, horizonYears - start) }, (_, offset) => {
            const row = start + offset;
            return (<div className="life-row" key={row}>
              <span className={`year-label${row % 5 === 0 ? ' milestone' : ''}`} title={`${months[row * 12].year}–${months[row * 12 + 11].year}`}>
                {row}
              </span>
              {months.slice(row * 12, row * 12 + 12).map(month => {
                const count = monthCounts[month.key] ?? 0;
                const highlighted = highlightedCounts[month.key] ?? 0;
                // Preserve the existing color, search and selection rules.
                const blue = highlighted > 0 && (month.state !== 'current' || searching);
                const label = `${formatMonth(month.key)}${month.state === 'current' ? ', mes actual' : ''}${month.state === 'future' ? ', futuro' : ''}${count ? `, ${count} ${count === 1 ? 'recuerdo' : 'recuerdos'}` : ''}${searching ? `, ${highlighted} ${highlighted === 1 ? 'coincidencia' : 'coincidencias'}` : ''}`;
                return <button
                  key={month.key}
                  data-month={month.key}
                  data-index={month.index}
                  data-current={month.state === 'current'}
                  className={`month-cell ${month.state} ${blue ? 'has-memories' : ''}${selectedMonth === month.key ? ' selected' : ''}`}
                  aria-label={label}
                  aria-describedby={tooltip?.month === month.key ? 'life-month-tooltip' : undefined}
                  aria-pressed={selectedMonth === month.key}
                  aria-current={month.state === 'current' ? 'date' : undefined}
                  disabled={month.state === 'future'}
                  tabIndex={month.index === Math.min(focusedIndex, lived - 1) ? 0 : -1}
                  onFocus={() => setFocusedIndex(month.index)}
                  onKeyDown={event => keyboard(event, month.index)}
                  onClick={() => selectMonth(month.key)}
                />;
              })}
            </div>);
          })}
        </div>
      </section>))}
    </div>
    <MonthTooltip
      tooltip={tooltip}
      birthDate={profile.birthDate}
      today={today}
      monthCounts={monthCounts}
      portal={!fullscreen}
    />
  </>);
  return <>
    <section className="page-heading dashboard-heading">
      <div>
        <h1>Tu vida, <em>mes a mes.</em></h1>
        <p>Cada cuadro es un mes. Ya viviste {lived} de {months.length}.</p>
      </div>
      <div className="overview-tools">
        <dl className="life-summary" aria-label="Resumen de tu vida">
          <div>
            <dt>Edad</dt>
            <dd>{completedYears(profile.birthDate, today)} <span>años</span></dd>
          </div>
          <div>
            <dt>Recuerdos guardados</dt>
            <dd>
              {state.memoryCount}
            </dd>
          </div>
          <div>
            <dt>Fotos guardadas</dt>
            <dd>
              {state.photoCount}
            </dd>
          </div>
        </dl>
        <button className="button secondary" onClick={jumpCurrent}><Icon name="calendar" size={18} />Ir a hoy</button>
      </div>
    </section>
    <section className="life-progress" aria-label="El tiempo en tu mapa">
      <div
        className="life-progress-track"
        role="progressbar"
        aria-label="Meses vividos"
        aria-valuemin={0}
        aria-valuemax={months.length}
        aria-valuenow={lived}
        aria-valuetext={`${lived} de ${months.length} meses`}
      >
        <span className="life-progress-fill" style={{ width: `${lived / months.length * 100}%` }} />
      </div>
      <div className="life-progress-caption">
        <span><strong>{percentage} % vivido</strong> · {lived} de {months.length} meses</span>
        <span>Quedan {remaining} meses hasta los {horizonYears}, unos {Math.round(remaining / 12)} años</span>
      </div>
    </section>
    <section className="life-card" aria-label="Cuadrícula de vida">
      {!fullscreen && map}
    </section>
    {fullscreen && <MapFullscreen onClose={closeFullscreen}>
      {map}
    </MapFullscreen>}
  </>;
}
