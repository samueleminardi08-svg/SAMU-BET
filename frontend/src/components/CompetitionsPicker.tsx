import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Trophy,
  Calendar,
  Check,
  AlertCircle
} from 'lucide-react';
import { CompetitionItem, CompetitionType, TimeWindowKey } from '../config/riskConfig';

interface CompetitionsPickerProps {
  isOpen: boolean;
  onClose: () => void;
  competitions?: CompetitionItem[];
  selectedCompetitionIds?: string[];
  onChangeSelected: (ids: string[]) => void;
  calendarUpdatedTimestamp?: string;
  timeWindow: TimeWindowKey;
}

export const CompetitionsPicker: React.FC<CompetitionsPickerProps> = ({
  isOpen,
  onClose,
  competitions = [],
  selectedCompetitionIds = [],
  onChangeSelected,
  calendarUpdatedTimestamp,
  timeWindow
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'league' | 'cup' | 'other'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const safeComps = Array.isArray(competitions) ? competitions : [];
  const safeSelectedIds = Array.isArray(selectedCompetitionIds) ? selectedCompetitionIds : [];

  const isNoneSelected = safeSelectedIds.includes('__none__');
  const isAllSelected =
    !isNoneSelected && (safeSelectedIds.length === 0 || safeSelectedIds.length === safeComps.length);

  const isCompSelected = (id: string): boolean => {
    if (isNoneSelected) return false;
    if (safeSelectedIds.length === 0) return true;
    return safeSelectedIds.includes(id);
  };

  const countActiveSelected = isNoneSelected
    ? 0
    : safeSelectedIds.length === 0
    ? safeComps.length
    : safeSelectedIds.length;

  // Filtro per tab e query di ricerca (Hook eseguito SEMPRE incondizionatamente)
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return safeComps.filter((c) => {
      if (activeTab !== 'all' && c.type !== activeTab) return false;
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.country || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q)
      );
    });
  }, [safeComps, activeTab, searchQuery]);

  // Raggruppamento per nazione (Hook eseguito SEMPRE incondizionatamente)
  const groupedByCountry = useMemo(() => {
    const map = new Map<string, CompetitionItem[]>();
    for (const c of filtered) {
      const countryKey = c.country || 'Internazionale';
      const list = map.get(countryKey) || [];
      list.push(c);
      map.set(countryKey, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Europa') return -1;
      if (b === 'Europa') return 1;
      if (a === 'Italia') return -1;
      if (b === 'Italia') return 1;
      return (a || '').localeCompare(b || '');
    });
  }, [filtered]);

  // Early return DOPO tutti gli Hook di React (rispetta le Rules of Hooks)
  if (!isOpen) return null;

  const toggleCompetition = (id: string) => {
    setNoticeMessage(null);
    if (isNoneSelected) {
      // Da nessuno selezionato -> seleziona questo singolo
      onChangeSelected([id]);
      return;
    }

    if (safeSelectedIds.length === 0) {
      // Da tutti selezionati -> deseleziona solo questo elemento
      const allExceptThis = safeComps.map((c) => c.id).filter((x) => x !== id);
      onChangeSelected(allExceptThis);
      return;
    }

    if (safeSelectedIds.includes(id)) {
      // Deseleziona questo elemento
      const next = safeSelectedIds.filter((x) => x !== id);
      if (next.length === 0) {
        onChangeSelected(['__none__']);
      } else {
        onChangeSelected(next);
      }
    } else {
      // Seleziona questo elemento
      const next = [...safeSelectedIds, id];
      if (next.length === safeComps.length) {
        onChangeSelected([]); // Normalizza a tutti
      } else {
        onChangeSelected(next);
      }
    }
  };

  const handleSelectAll = () => {
    setNoticeMessage(null);
    onChangeSelected([]);
  };

  const handleDeselectAll = () => {
    setNoticeMessage(null);
    onChangeSelected(['__none__']);
  };

  const handleSelectOnlyItaly = () => {
    const italyComps = safeComps.filter((c) => c.country === 'Italia');
    if (italyComps.length === 0) {
      setNoticeMessage(
        `Nessuna partita di Serie A o coppa italiana nelle prossime ${
          timeWindow === 'today' ? '24 ore' : timeWindow === 'hours48' ? '48 ore' : 'giornate'
        }. Il turno di Serie A si gioca nel weekend (seleziona '7 giorni' o '14 giorni' per includerla).`
      );
    } else {
      setNoticeMessage(null);
      onChangeSelected(italyComps.map((c) => c.id));
    }
  };

  const countForTab = (t: 'all' | CompetitionType) => {
    if (t === 'all') return safeComps.length;
    return safeComps.filter((c) => c.type === t).length;
  };

  const totalMatchesInWindow = safeComps.reduce((acc, c) => acc + (c.eventsCount || 0), 0);

  return (
    <div className="cp-backdrop" role="dialog" aria-modal="true" aria-label="Selettore Competizioni e Coppe">
      <div className="cp-dialog">
        {/* Header Modal */}
        <div className="cp-header">
          <div>
            <div className="cp-header-title">
              <Trophy size={18} />
              <span>Competizioni &amp; Coppe</span>
            </div>
            <p className="cp-header-sub">
              Scegli i tornei su cui costruire la schedina ({totalMatchesInWindow} partite disponibili nella finestra {timeWindow})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cp-close-btn"
            title="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        {/* Barra di ricerca e Azioni rapide */}
        <div className="cp-search-bar">
          <div className="cp-input-wrap">
            <Search size={16} className="cp-input-icon" />
            <input
              type="text"
              placeholder="Cerca campionato, coppa o paese (es. Champions, Premier, Spagna)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cp-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="cp-input-clear"
                title="Cancella"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="cp-actions-row">
            <div className="cp-actions-group">
              <button
                type="button"
                onClick={handleSelectAll}
                className={`cp-action-chip ${isAllSelected ? 'active-chip' : ''}`}
              >
                Seleziona tutti ({safeComps.length})
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className={`cp-action-chip ${isNoneSelected ? 'active-chip' : ''}`}
              >
                Deseleziona tutti
              </button>
              <button
                type="button"
                onClick={handleSelectOnlyItaly}
                className="cp-action-chip italy"
                title="Filtra solo partite italiane (Serie A, Serie B, Coppa Italia)"
              >
                🇮🇹 Solo Italia
              </button>
            </div>
            <span className="cp-active-count">
              {isNoneSelected
                ? 'Nessuno attivo'
                : isAllSelected
                ? `Tutti attivi (${safeComps.length})`
                : `${countActiveSelected}/${safeComps.length} attivi`}
            </span>
          </div>

          {noticeMessage && (
            <div className="cp-notice-banner" role="alert">
              <AlertCircle size={15} />
              <span>{noticeMessage}</span>
            </div>
          )}
        </div>

        {/* Tab Selector: Tutti, Campionati, Coppe, Altro */}
        <div className="cp-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`cp-tab-btn ${activeTab === 'all' ? 'active-all' : ''}`}
          >
            <span>Tutti</span>
            <span className="cp-tab-badge">
              {countForTab('all')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('league')}
            className={`cp-tab-btn ${activeTab === 'league' ? 'active-league' : ''}`}
          >
            <span>Campionati</span>
            <span className="cp-tab-badge">
              {countForTab('league')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cup')}
            className={`cp-tab-btn ${activeTab === 'cup' ? 'active-cup' : ''}`}
          >
            <span>Coppe</span>
            <span className="cp-tab-badge">
              {countForTab('cup')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('other')}
            className={`cp-tab-btn ${activeTab === 'other' ? 'active-other' : ''}`}
          >
            <span>Altro</span>
            <span className="cp-tab-badge">
              {countForTab('other')}
            </span>
          </button>
        </div>

        {/* Lista Competizioni raggruppata */}
        <div className="cp-body">
          {groupedByCountry.length === 0 ? (
            <div className="cp-empty">
              Nessuna competizione trovata per i criteri cercati.
            </div>
          ) : (
            groupedByCountry.map(([country, comps]) => (
              <div key={country} className="cp-group">
                <div className="cp-group-header">
                  <span>{country}</span>
                  <span className="cp-group-count">
                    {comps.reduce((a, b) => a + (b.eventsCount || 0), 0)} partite
                  </span>
                </div>
                <div className="cp-cards-grid">
                  {comps.map((c) => {
                    const isSelected = isCompSelected(c.id);

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCompetition(c.id)}
                        className={`cp-card-btn ${isSelected ? 'selected' : ''}`}
                      >
                        <div className="cp-card-left">
                          <div className="cp-custom-checkbox">
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span className="cp-card-name">{c.name}</span>
                        </div>
                        <span className="cp-card-events">
                          {c.eventsCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Modal con Timestamp e Bottone Conferma */}
        <div className="cp-footer">
          <div className="cp-footer-info">
            <Calendar size={14} />
            <span>
              Calendario aggiornato al:{' '}
              <strong>
                {calendarUpdatedTimestamp || 'Oggi (fuso Roma)'}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cp-apply-btn"
          >
            Applica Filtri ({isNoneSelected ? 'Nessuno' : isAllSelected ? 'Tutti' : countActiveSelected})
          </button>
        </div>
      </div>
    </div>
  );
};
