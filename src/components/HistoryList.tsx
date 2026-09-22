/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { History, Play, Trash2, Clock, RotateCcw, Check } from 'lucide-react';
import { SynthesisHistoryItem } from '../types';

interface HistoryListProps {
  history: SynthesisHistoryItem[];
  currentText: string;
  onSelect: (text: string) => void;
  onPlay: (text: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClear: () => void;
}

export function HistoryList({
  history,
  currentText,
  onSelect,
  onPlay,
  onDelete,
  onClear,
}: HistoryListProps) {
  const formatRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return 'Hace unos segundos';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} d`;
  };

  return (
    <div
      id="tts-history-card"
      className="bg-white/95 backdrop-blur-md rounded-3xl border border-amber-200/80 shadow-lg shadow-amber-950/5 p-5 flex flex-col gap-4 relative overflow-hidden transition-all"
    >
      {/* Barra superior de acento morado y ámbar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-amber-400 to-rose-500" />

      {/* Cabecera del historial */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-amber-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-stone-900">
                Historial de síntesis
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                {history.length}/5 guardados
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Guardado automático local en tu navegador • Recupera cualquier texto con 1 clic
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <button
            id="clear-all-history-button"
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-xl border border-stone-200 hover:border-red-200 transition-colors font-medium"
            title="Borrar todos los textos del historial"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vaciar</span>
          </button>
        )}
      </div>

      {/* Lista de los últimos 5 textos */}
      {history.length === 0 ? (
        <div
          id="tts-history-empty"
          className="p-5 rounded-2xl bg-amber-50/40 border border-dashed border-amber-200/80 text-center flex flex-col items-center justify-center gap-2 text-stone-500"
        >
          <div className="w-9 h-9 rounded-2xl bg-amber-100/70 text-amber-800 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xs font-semibold text-stone-700">
            Aún no hay textos en el historial
          </p>
          <p className="text-[11px] text-stone-500 max-w-sm">
            Cada vez que pulses «Reproducir» o grabes un audio, el texto se guardará automáticamente aquí (hasta 5) para que puedas volver a él en cualquier momento.
          </p>
        </div>
      ) : (
        <div id="tts-history-items-list" className="flex flex-col gap-2.5">
          {history.map((item, index) => {
            const isCurrentlyActive = currentText.trim() === item.text.trim();

            return (
              <div
                key={item.id}
                id={`history-item-${item.id}`}
                onClick={() => onSelect(item.text)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(item.text);
                  }
                }}
                className={`group p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left ${
                  isCurrentlyActive
                    ? 'bg-amber-50/80 border-amber-400 shadow-xs ring-2 ring-amber-400/20'
                    : 'bg-white hover:bg-rose-50/30 border-stone-200/80 hover:border-amber-300 hover:shadow-xs'
                }`}
              >
                {/* Contenido del texto */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 h-5 rounded-lg bg-stone-100 text-stone-600 font-mono text-[10px] font-bold flex items-center justify-center">
                      #{index + 1}
                    </span>

                    {isCurrentlyActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300">
                        <Check className="w-3 h-3 text-amber-800" />
                        En el editor
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                      {item.wordCount} palabras
                    </span>

                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-500">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  <p className="text-xs text-stone-800 leading-relaxed font-normal line-clamp-2 group-hover:text-stone-950">
                    {item.text}
                  </p>
                </div>

                {/* Acciones de recuperación y reproducción */}
                <div
                  className="flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    id={`restore-history-button-${item.id}`}
                    type="button"
                    onClick={() => onSelect(item.text)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 text-xs font-semibold transition-all shadow-2xs active:scale-95"
                    title="Cargar texto en el editor"
                  >
                    <RotateCcw className="w-3 h-3 text-amber-700" />
                    <span>Recuperar</span>
                  </button>

                  <button
                    id={`play-history-button-${item.id}`}
                    type="button"
                    onClick={() => onPlay(item.text)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold transition-all shadow-2xs shadow-red-700/20 active:scale-95"
                    title="Cargar y reproducir inmediatamente"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Reproducir</span>
                  </button>

                  <button
                    id={`delete-history-button-${item.id}`}
                    type="button"
                    onClick={(e) => onDelete(item.id, e)}
                    className="p-1.5 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                    title="Eliminar este elemento del historial"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

