import { useState, useEffect, useRef, useCallback } from 'react';

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [pitch, setPitch] = useState(1);
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [langFilter, setLangFilter] = useState('all'); // 'all', 'es', 'en'

  const synthRef = useRef(window.speechSynthesis);

  // Cargar voces del sistema/navegador
  const updateVoices = useCallback(() => {
    if (!synthRef.current) return;
    const availableVoices = synthRef.current.getVoices();
    setVoices(availableVoices);

    // Seleccionar una voz por defecto si no hay ninguna
    if (availableVoices.length > 0 && !selectedVoice) {
      const defaultVoice = availableVoices.find(v => v.lang.startsWith('es')) || 
                           availableVoices.find(v => v.lang.startsWith('en')) || 
                           availableVoices[0];
      setSelectedVoice(defaultVoice);
    }
  }, [selectedVoice]);

  useEffect(() => {
    updateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, [updateVoices]);

  // Filtrar voces por idioma seleccionado
  const filteredVoices = voices.filter(voice => {
    if (langFilter === 'es') return voice.lang.toLowerCase().startsWith('es');
    if (langFilter === 'en') return voice.lang.toLowerCase().startsWith('en');
    return voice.lang.toLowerCase().startsWith('es') || voice.lang.toLowerCase().startsWith('en');
  });

  const speak = (text, onEndCallback) => {
    if (!synthRef.current) return;

    if (synthRef.current.paused) {
      synthRef.current.resume();
      setPaused(false);
      setSpeaking(true);
      return;
    }

    synthRef.current.cancel(); // Detener lecturas anteriores

    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.pitch = pitch;
    utterance.rate = rate;

    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      if (onEndCallback) onEndCallback();
    };

    utterance.onerror = (e) => {
      console.error("Error en lectura TTS:", e);
      setSpeaking(false);
      setPaused(false);
    };

    synthRef.current.speak(utterance);
    setSpeaking(true);
    setPaused(false);
  };

  const pause = () => {
    if (synthRef.current && speaking) {
      synthRef.current.pause();
      setPaused(true);
      setSpeaking(false);
    }
  };

  const stop = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setSpeaking(false);
      setPaused(false);
    }
  };

  return {
    voices: filteredVoices,
    selectedVoice,
    setSelectedVoice,
    pitch,
    setPitch,
    rate,
    setRate,
    speaking,
    paused,
    speak,
    pause,
    stop,
    langFilter,
    setLangFilter
  };
}
