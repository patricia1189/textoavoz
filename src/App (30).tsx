/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  RotateCcw, 
  Sliders, 
  Sparkles, 
  AlertCircle,
  FileText,
  Volume1,
  Wand2,
  Disc,
  Download,
  Radio,
  CheckCircle2,
  Info,
  ExternalLink,
  Mic,
  Monitor,
  History
} from 'lucide-react';
import { convertBlobToWav, getSupportedMimeType } from './utils/audioRecorder';
import { HistoryList } from './components/HistoryList';
import { SynthesisHistoryItem } from './types';

export default function App() {
  const [text, setText] = useState<string>(
    'Bienvenido al sintetizador de texto a voz. Puedes escribir o pegar cualquier texto aquí, ajustar la voz, velocidad y tono, y pulsar «Reproducir» para escucharlo en voz alta.'
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [volume, setVolume] = useState<number>(1);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentWord, setCurrentWord] = useState<string>('');
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Historial local de los últimos 5 textos sintetizados guardados en localStorage
  const [history, setHistory] = useState<SynthesisHistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('tts_synthesis_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 5);
        }
      }
    } catch (err) {
      console.warn('Error al leer historial desde localStorage:', err);
    }
    return [];
  });

  // Detectar si la aplicación se está ejecutando dentro de un iframe (visor embebido)
  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Estados para la funcionalidad de captura con MediaRecorder (usamos 'user' por defecto por compatibilidad de permisos)
  const [showRecorder, setShowRecorder] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [captureMode, setCaptureMode] = useState<'display' | 'user'>('user');
  const [targetFormat, setTargetFormat] = useState<'wav' | 'webm'>('wav');
  const [isProcessingAudio, setIsProcessingAudio] = useState<boolean>(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedFormat, setRecordedFormat] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Estados para la síntesis directa de audio WAV (sin requerir micrófono ni hardware)
  const [recorderActiveTab, setRecorderActiveTab] = useState<'studio' | 'local'>('studio');
  const [isGeneratingWav, setIsGeneratingWav] = useState<boolean>(false);
  const [directWavUrl, setDirectWavUrl] = useState<string | null>(null);
  const [directWavBlob, setDirectWavBlob] = useState<Blob | null>(null);
  const [directWavInfo, setDirectWavInfo] = useState<{ voice: string; duration: number; bytes: number; fileName: string } | null>(null);
  const [selectedStudioVoice, setSelectedStudioVoice] = useState<'Kore' | 'Puck' | 'Fenrir' | 'Zephyr' | 'Charon'>('Kore');

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Inicializar síntesis de voz y cargar voces disponibles
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }

    const loadVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices && availableVoices.length > 0) {
          setVoices(availableVoices);
          setSelectedVoiceURI((prev) => {
            if (prev && availableVoices.some((v) => v.voiceURI === prev)) {
              return prev;
            }
            const defaultVoice = availableVoices.find((v) => v.default) || availableVoices[0];
            return defaultVoice ? defaultVoice.voiceURI : '';
          });
        }
      } catch (err) {
        console.warn('No se pudieron obtener las voces de síntesis:', err);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Comprobación periódica para mantener sincronizada la interfaz
  useEffect(() => {
    if (!isSpeaking) return;

    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWord('');
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isSpeaking]);

  // Cálculo de métricas y duración estimada
  const wordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [text]);

  const charCount = text.length;
  const estimatedSeconds = useMemo(() => {
    if (wordCount === 0) return 0;
    const baseMinutes = wordCount / (140 * rate);
    return Math.ceil(baseMinutes * 60);
  }, [wordCount, rate]);

  // Gestión de historial local (últimos 5 textos)
  const addToHistory = (textToSave: string) => {
    const trimmed = textToSave.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      // Filtrar el mismo texto si ya existía para colocarlo en primer lugar
      const filtered = prev.filter((item) => item.text.trim() !== trimmed);
      const newItem: SynthesisHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        text: trimmed,
        timestamp: Date.now(),
        wordCount: trimmed.split(/\s+/).length,
      };
      const updated = [newItem, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('tts_synthesis_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('Error al guardar historial en localStorage:', e);
      }
      return updated;
    });
  };

  const handleSelectHistoryItem = (itemText: string) => {
    setText(itemText);
    setErrorMessage(null);
  };

  const handlePlayHistoryItem = (itemText: string) => {
    setText(itemText);
    addToHistory(itemText);
    setErrorMessage(null);

    if (!isSupported || typeof window === 'undefined' || !window.speechSynthesis) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setTimeout(() => {
      try {
        window.speechSynthesis.resume();
        const utterance = new SpeechSynthesisUtterance(itemText);
        utteranceRef.current = utterance;

        if (selectedVoiceURI) {
          const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
          if (voice) utterance.voice = voice;
        }

        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;

        utterance.onstart = () => {
          setIsSpeaking(true);
          setIsPaused(false);
          setErrorMessage(null);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWord('');
        };

        utterance.onerror = (e) => {
          console.warn('Speech synthesis utterance error:', e);
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWord('');
        };

        utterance.onboundary = (event) => {
          if (event.name === 'word') {
            const spokenWord = itemText.substring(event.charIndex, event.charIndex + (event.charLength || 10)).split(/\s+/)[0];
            setCurrentWord(spokenWord);
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Error al reproducir texto del historial:', err);
      }
    }, 40);
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('tts_synthesis_history', JSON.stringify(updated));
      } catch (err) {
        console.warn('Error al eliminar elemento de localStorage:', err);
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('tts_synthesis_history');
    } catch (err) {
      console.warn('Error al vaciar historial de localStorage:', err);
    }
  };

  const handlePlay = () => {
    if (!isSupported || typeof window === 'undefined' || !window.speechSynthesis) return;

    if (!text.trim()) return;

    setErrorMessage(null);

    // Guardar automáticamente en el historial local (últimos 5 textos)
    addToHistory(text);

    // Si está en pausa, reanudar directamente
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
      return;
    }

    const wasSpeaking = window.speechSynthesis.speaking;
    if (wasSpeaking) {
      window.speechSynthesis.cancel();
    }

    const delay = wasSpeaking ? 40 : 0;

    setTimeout(() => {
      try {
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        if (selectedVoiceURI) {
          const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
          if (voice) utterance.voice = voice;
        }

        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;

        utterance.onstart = () => {
          setIsSpeaking(true);
          setIsPaused(false);
          setErrorMessage(null);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWord('');
        };

        utterance.onerror = (e) => {
          if (e.error === 'canceled' || e.error === 'interrupted') {
            setIsSpeaking(false);
            setIsPaused(false);
            setCurrentWord('');
            return;
          }

          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentWord('');

          if (e.error === 'not-allowed') {
            setErrorMessage('La reproducción fue bloqueada por permisos del navegador. Haz clic en la página e inténtalo de nuevo.');
          } else if (e.error === 'audio-busy') {
            setErrorMessage('El dispositivo de audio está ocupado. Espera un momento y reintenta.');
          } else if (e.error && e.error !== 'synthesis-unavailable') {
            setErrorMessage(`Aviso de síntesis: ${e.error}`);
          }
        };

        utterance.onpause = () => {
          setIsPaused(true);
        };

        utterance.onresume = () => {
          setIsPaused(false);
        };

        utterance.onboundary = (event) => {
          if (event.name === 'word') {
            const spokenWord = text.substring(event.charIndex, event.charIndex + (event.charLength || 10)).split(/\s+/)[0];
            setCurrentWord(spokenWord);
          }
        };

        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
        setIsPaused(false);
      } catch (err) {
        console.error('Error al iniciar síntesis:', err);
        setErrorMessage('No se pudo iniciar la síntesis de voz en esta sesión.');
        setIsSpeaking(false);
        setIsPaused(false);
      }
    }, delay);
  };

  const handlePause = () => {
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.speaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentWord('');
  };

  const handleClear = () => {
    handleStop();
    setText('');
  };

  const handleSampleText = (sample: string) => {
    handleStop();
    setText(sample);
  };

  // Temporizador para la grabación experimental
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  // Limpieza de recursos al desmontar
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Generación directa de audio WAV con voz de estudio (sin depender de micrófono ni permisos)
  const generateDirectWav = async (voiceOverride?: 'Kore' | 'Puck' | 'Fenrir' | 'Zephyr' | 'Charon') => {
    if (!text.trim()) return;
    const activeVoice = voiceOverride || selectedStudioVoice;
    setIsGeneratingWav(true);
    setRecordError(null);
    addToHistory(text);

    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice: activeVoice }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor (${res.status})`);
      }

      const data = await res.json();
      if (!data.audioBase64) {
        throw new Error('No se devolvieron datos de audio.');
      }

      // Convertir base64 a Blob WAV estándar
      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      if (directWavUrl) {
        URL.revokeObjectURL(directWavUrl);
      }

      setDirectWavUrl(url);
      setDirectWavBlob(blob);
      setDirectWavInfo({
        voice: data.voice || activeVoice,
        duration: data.durationSeconds || +(bytes.length / (24000 * 2)).toFixed(1),
        bytes: data.bytes || bytes.length,
        fileName: data.fileName || `voz_${activeVoice.toLowerCase()}.wav`,
      });
      setShowRecorder(true);
      setRecorderActiveTab('studio');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error al generar audio directo:', err);
      setRecordError(`Error en generación de audio WAV: ${msg}`);
    } finally {
      setIsGeneratingWav(false);
    }
  };

  const handleDownloadDirectWav = () => {
    if (!directWavUrl || !directWavBlob) return;
    const a = document.createElement('a');
    a.href = directWavUrl;
    a.download = directWavInfo?.fileName || `voz_${selectedStudioVoice.toLowerCase()}_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const stopExperimentalRecording = () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentWord('');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error al detener MediaRecorder:', err);
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const startExperimentalRecording = async (overrideMode?: 'display' | 'user') => {
    if (!text.trim()) return;
    const activeMode = overrideMode || captureMode;
    if (overrideMode && overrideMode !== captureMode) {
      setCaptureMode(overrideMode);
    }

    addToHistory(text);
    setRecordError(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }

    let stream: MediaStream;
    try {
      if (activeMode === 'display') {
        if (isInsideIframe) {
          throw new Error(
            'POLITICA_IFRAME: El navegador bloquea la selección de pantalla/pestaña dentro del visor embebido (iframe). Usa el modo «Micrófono / Entrada» o abre la aplicación en una pestaña nueva.'
          );
        }

        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error(
            'Tu navegador o entorno no permite «getDisplayMedia». Puedes usar el modo «Micrófono / Entrada» o abrir la aplicación en una pestaña nueva.'
          );
        }

        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error(
            'No se detectó pista de audio. Recuerda marcar la casilla «Compartir audio de la pestaña» en la ventana emergente del navegador.'
          );
        }
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Tu navegador no permite la API «getUserMedia» para acceder a la entrada de audio.');
        }

        // getUserMedia siempre abre el diálogo de permisos del navegador ("¿Permitir usar micrófono?")
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      console.warn('Error en captura de audio:', err);

      if (
        errStr.includes('Requested device not found') ||
        errStr.includes('NotFoundError') ||
        errStr.includes('DevicesNotFoundError')
      ) {
        setRecordError(
          'No se encontró ningún micrófono o dispositivo de entrada conectado en tu equipo (Requested device not found). Los ordenadores o monitores sin micrófono físico no pueden capturar audio por esta vía. Puedes utilizar la pestaña «Generación Directa WAV» a continuación para generar y descargar el archivo de audio directamente sin necesidad de micrófono.'
        );
      } else if (errStr.includes('POLITICA_IFRAME') || errStr.includes('display-capture') || errStr.includes('permissions policy')) {
        setRecordError(
          'La captura de pantalla/pestaña no está permitida dentro del visor embebido (iframe) por directiva de seguridad del navegador. Usa la opción «Generación Directa WAV» (que no requiere permisos) o abre la app en una nueva pestaña.'
        );
      } else if (errStr.includes('NotAllowedError') || errStr.includes('Permission denied')) {
        setRecordError(
          'Permiso de audio no concedido o cancelado en el diálogo del navegador. Puedes reintentar pulsando «Permitir» o usar «Generación Directa WAV» sin permisos requeridos.'
        );
      } else {
        setRecordError(errStr || 'No se pudo iniciar la captura de audio.');
      }
      return;
    }

    mediaStreamRef.current = stream;

    // Si el usuario detiene la captura desde la barra flotante nativa del navegador
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopExperimentalRecording();
        }
      };
    });

    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : undefined;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch (err) {
      console.warn('Fallo al inicializar MediaRecorder con opciones, usando fallback:', err);
      recorder = new MediaRecorder(stream);
    }
    mediaRecorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      setIsRecording(false);
      setIsProcessingAudio(true);
      try {
        const rawBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        let finalBlob = rawBlob;
        let finalExt = 'webm';

        if (targetFormat === 'wav') {
          try {
            finalBlob = await convertBlobToWav(rawBlob);
            finalExt = 'wav';
          } catch (convErr) {
            console.warn('Conversión a WAV fallida, conservando WebM nativo:', convErr);
            finalBlob = rawBlob;
            finalExt = 'webm';
          }
        }

        const url = URL.createObjectURL(finalBlob);
        setRecordedBlob(finalBlob);
        setRecordedUrl(url);
        setRecordedFormat(finalExt);
      } catch (err) {
        console.error('Error al procesar el audio:', err);
        setRecordError('Ocurrió un error al procesar el archivo de audio capturado.');
      } finally {
        setIsProcessingAudio(false);
      }
    };

    recorder.start(100);
    setIsRecording(true);

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setTimeout(() => {
      try {
        window.speechSynthesis.resume();
        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        if (selectedVoiceURI) {
          const voice = voices.find((v) => v.voiceURI === selectedVoiceURI);
          if (voice) utterance.voice = voice;
        }
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;

        utterance.onstart = () => {
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          // 400ms de margen para que la última sílaba quede guardada
          setTimeout(() => {
            stopExperimentalRecording();
          }, 400);
        };

        utterance.onerror = (e) => {
          console.warn('Speech synthesis utterance error durante grabación:', e);
          setIsSpeaking(false);
          stopExperimentalRecording();
        };

        utterance.onboundary = (event) => {
          if (event.name === 'word') {
            const spokenWord = text.substring(event.charIndex, event.charIndex + (event.charLength || 10)).split(/\s+/)[0];
            setCurrentWord(spokenWord);
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Error al emitir síntesis en grabación:', err);
        stopExperimentalRecording();
      }
    }, 50);
  };

  const handleDownload = () => {
    if (!recordedBlob || !recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    const dateStr = new Date().toISOString().slice(0, 10);
    const ext = recordedFormat || targetFormat;
    a.download = `sintesis-voz-${dateStr}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div id="tts-root-container" className="min-h-screen bg-gradient-to-br from-amber-50/70 via-rose-50/40 to-purple-50/60 text-stone-900 flex flex-col justify-between relative overflow-hidden">
      {/* Elementos ambientales de iluminación / brillo suave en fondo */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-400/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-80 h-80 bg-amber-300/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Cabecera con identidad estilizada */}
      <header id="tts-header" className="border-b border-amber-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-20 shadow-xs">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {/* Logo distintivo con gradiente rojo-ámbar y toque morado */}
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-500 to-amber-400 text-white flex items-center justify-center shadow-md shadow-red-500/25 ring-2 ring-white">
              <Volume2 className="w-5 h-5 drop-shadow-xs" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  Texto a Voz
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200/80 shadow-2xs">
                  Web Speech API
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Síntesis de voz viva en navegador • Sin conexión
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isInsideIframe && (
              <button
                id="open-external-tab-button"
                type="button"
                onClick={() => window.open(window.location.href, '_blank')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition-colors"
                title="Abrir en pestaña independiente para habilitar todos los diálogos y permisos del navegador"
              >
                <ExternalLink className="w-3.5 h-3.5 text-stone-600" />
                <span>Pestaña nueva</span>
              </button>
            )}

            <button
              id="toggle-recorder-button"
              type="button"
              onClick={() => setShowRecorder(!showRecorder)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 shadow-xs ${
                showRecorder || isRecording
                  ? 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white border-red-700 shadow-md shadow-red-600/20'
                  : 'bg-white text-stone-700 border-amber-200 hover:bg-rose-50 hover:text-red-700 hover:border-red-300'
              }`}
            >
              <Disc className={`w-3.5 h-3.5 ${isRecording ? 'text-amber-200 animate-spin' : showRecorder ? 'text-white' : 'text-red-600'}`} />
              <span>{isRecording ? `Grabando (${formatSeconds(recordingSeconds)})` : 'Descargar / Grabar'}</span>
              <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-extrabold ${
                showRecorder || isRecording ? 'bg-black/20 text-white' : 'bg-amber-100 text-amber-900 border border-amber-200'
              }`}>
                WAV
              </span>
            </button>

            <button
              id="toggle-controls-button"
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                showSettings 
                  ? 'bg-gradient-to-r from-purple-700 to-violet-800 text-white border-purple-800 shadow-md shadow-purple-900/20' 
                  : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50 hover:border-purple-300 shadow-xs'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-current" />
              <span>Ajustes de voz</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main id="tts-main-content" className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Aviso de compatibilidad */}
        {!isSupported && (
          <div id="tts-unsupported-warning" className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-red-50 border border-amber-300 text-amber-900 flex items-start gap-3 text-sm shadow-sm">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">API Web Speech no compatible</p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Tu navegador o entorno no es compatible con la interfaz <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">window.speechSynthesis</code>. Por favor, pruébalo en Chrome, Edge, Safari o Firefox.
              </p>
            </div>
          </div>
        )}

        {/* Notificación dinámica de error */}
        {errorMessage && (
          <div id="tts-error-alert" className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-red-50 border border-red-300 text-red-900 flex items-center justify-between gap-3 text-sm shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-medium text-xs sm:text-sm">{errorMessage}</span>
            </div>
            <button
              id="dismiss-error-button"
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs text-red-700 hover:text-red-900 font-semibold px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 transition-colors"
            >
              Descartar
            </button>
          </div>
        )}

        {/* Tarjeta de entrada de texto */}
        <div id="tts-editor-card" className="bg-white/90 backdrop-blur-xs rounded-3xl border border-amber-200/80 shadow-lg shadow-amber-950/5 relative overflow-hidden transition-all flex flex-col">
          {/* Barra decorativa superior tricolor (rojo - amarillo - morado) */}
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-amber-400 to-purple-600" />

          <div className="p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-100 text-red-700">
                  <FileText className="w-4 h-4" />
                </div>
                <label htmlFor="tts-text-input" className="text-xs font-bold tracking-wider uppercase text-stone-700">
                  Texto a sintetizar
                </label>
              </div>

              {/* Estadísticas de texto con formato de etiquetas con color */}
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-medium bg-amber-50 text-amber-900 border border-amber-200">
                  {charCount} caracteres
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-medium bg-rose-50 text-rose-900 border border-rose-200">
                  {wordCount} palabras
                </span>
                {estimatedSeconds > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-medium bg-purple-50 text-purple-900 border border-purple-200">
                    ~{estimatedSeconds}s de audio
                  </span>
                )}
                {history.length > 0 && (
                  <a
                    href="#tts-history-card"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-medium bg-gradient-to-r from-purple-50 to-amber-50 text-purple-950 border border-purple-200/90 hover:border-purple-300 hover:bg-purple-100 transition-colors"
                    title="Ir al historial de textos sintetizados"
                  >
                    <History className="w-3 h-3 text-purple-600" />
                    <span>{history.length} en historial</span>
                  </a>
                )}
              </div>
            </div>

            <div className="relative">
              <textarea
                id="tts-text-input"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe o pega el texto que deseas escuchar..."
                className="w-full resize-y text-stone-800 placeholder-stone-400 text-base leading-relaxed p-4 rounded-2xl border border-amber-200/80 bg-amber-50/15 focus:bg-white focus:outline-none focus:ring-3 focus:ring-red-500/20 focus:border-red-500 transition-all font-normal shadow-inner-xs"
              />

              {text && (
                <button
                  id="clear-text-button"
                  type="button"
                  onClick={handleClear}
                  className="absolute top-3 right-3 text-stone-500 hover:text-red-700 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/90 border border-stone-200 hover:border-red-300 hover:bg-red-50 transition-colors shadow-xs"
                  title="Limpiar texto"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Ejemplos predefinidos con tarjetas coloreadas */}
            <div className="flex items-center flex-wrap gap-2 pt-1">
              <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5 mr-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" /> Ejemplos:
              </span>
              <button
                id="sample-greeting-button"
                type="button"
                onClick={() => handleSampleText('¡Hola! Esta es una demostración en tiempo real de conversión de texto a voz ejecutada directamente en tu navegador mediante la Web Speech API.')}
                className="text-xs px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-50 to-rose-50 text-red-900 border border-red-200/80 hover:bg-red-100 hover:border-red-300 font-medium transition-all shadow-2xs"
              >
                Saludo
              </button>
              <button
                id="sample-quote-button"
                type="button"
                onClick={() => handleSampleText('La arquitectura de software no consiste en hacer las cosas complejas, sino en diseñar sistemas simples, mantenibles y resistentes.')}
                className="text-xs px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-950 border border-amber-200/80 hover:bg-amber-100 hover:border-amber-300 font-medium transition-all shadow-2xs"
              >
                Cita de arquitectura
              </button>
              <button
                id="sample-speed-button"
                type="button"
                onClick={() => handleSampleText('El veloz murciélago hindú comía feliz cardillo y kiwi. Observa cómo al cambiar la velocidad y el tono se modifica la cadencia y entonación de la locución.')}
                className="text-xs px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 text-purple-950 border border-purple-200/80 hover:bg-purple-100 hover:border-purple-300 font-medium transition-all shadow-2xs"
              >
                Prueba fonética
              </button>
            </div>
          </div>
        </div>

        {/* Historial local con persistencia en localStorage (últimos 5 textos) */}
        <HistoryList
          history={history}
          currentText={text}
          onSelect={handleSelectHistoryItem}
          onPlay={handlePlayHistoryItem}
          onDelete={handleDeleteHistoryItem}
          onClear={handleClearHistory}
        />

        {/* Panel desplegable de parámetros y modulación */}
        {showSettings && (
          <div id="tts-voice-settings-card" className="bg-white/95 backdrop-blur-xs rounded-3xl border border-purple-200/80 shadow-xl shadow-purple-950/5 p-6 flex flex-col gap-6 animate-fadeIn relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-purple-300/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between pb-3 border-b border-purple-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                  <Sliders className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-stone-900">
                  Parámetros de voz y modulación
                </h2>
              </div>
              <button
                id="reset-settings-button"
                type="button"
                onClick={() => {
                  setRate(1);
                  setPitch(1);
                  setVolume(1);
                }}
                className="text-xs text-purple-700 hover:text-red-600 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restablecer
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Selector de voz */}
              <div className="flex flex-col gap-2 md:col-span-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="voice-select" className="text-xs font-bold text-stone-800">
                    Voz del sistema detectada
                  </label>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    {voices.length} disponibles
                  </span>
                </div>
                <select
                  id="voice-select"
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="w-full text-sm rounded-xl border border-purple-200 p-3 bg-purple-50/20 text-stone-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600 font-medium"
                >
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}) {v.default ? '— Predeterminada' : ''}
                    </option>
                  ))}
                  {voices.length === 0 && (
                    <option value="">Voz predeterminada del navegador</option>
                  )}
                </select>
              </div>

              {/* Control de velocidad (Rojo) */}
              <div className="flex flex-col gap-2.5 bg-red-50/40 p-4 rounded-2xl border border-red-200/60">
                <div className="flex justify-between items-center">
                  <label htmlFor="rate-slider" className="text-xs font-bold text-red-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                    Velocidad:
                  </label>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-red-200 text-red-700">
                    {rate.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="rate-slider"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full accent-red-600 cursor-pointer h-2 bg-red-200 rounded-lg"
                />
                <div className="flex justify-between text-[10px] font-medium text-red-800/80">
                  <span>0.5x (Lenta)</span>
                  <span>1.0x</span>
                  <span>2.0x (Rápida)</span>
                </div>
              </div>

              {/* Control de tono / Pitch (Amarillo / Ámbar) */}
              <div className="flex flex-col gap-2.5 bg-amber-50/50 p-4 rounded-2xl border border-amber-200/70">
                <div className="flex justify-between items-center">
                  <label htmlFor="pitch-slider" className="text-xs font-bold text-amber-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    Tono (Pitch):
                  </label>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-800">
                    {pitch.toFixed(2)}
                  </span>
                </div>
                <input
                  id="pitch-slider"
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-2 bg-amber-200 rounded-lg"
                />
                <div className="flex justify-between text-[10px] font-medium text-amber-800/80">
                  <span>0.5 (Grave)</span>
                  <span>1.0</span>
                  <span>1.5 (Agudo)</span>
                </div>
              </div>

              {/* Control de volumen (Morado) */}
              <div className="flex flex-col gap-2.5 bg-purple-50/50 p-4 rounded-2xl border border-purple-200/70">
                <div className="flex justify-between items-center">
                  <label htmlFor="volume-slider" className="text-xs font-bold text-purple-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
                    Volumen:
                  </label>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-800">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <input
                  id="volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer h-2 bg-purple-200 rounded-lg"
                />
                <div className="flex justify-between text-[10px] font-medium text-purple-800/80">
                  <span>Silencio</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Panel experimental de Grabación con MediaRecorder */}
        {(showRecorder || isRecording || recordedUrl) && (
          <div
            id="tts-recorder-panel"
            className="bg-white/95 backdrop-blur-md rounded-3xl border border-red-200/90 shadow-xl shadow-red-950/10 p-6 flex flex-col gap-5 transition-all duration-300 relative overflow-hidden"
          >
            {/* Cinta decorativa superior tricolor */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-purple-600" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md ${
                  isRecording 
                    ? 'bg-red-600 ring-4 ring-red-200 animate-pulse' 
                    : 'bg-gradient-to-br from-red-600 to-rose-700'
                }`}>
                  <Disc className={`w-5 h-5 ${isRecording ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-stone-900">
                      Exportar y Grabar Audio
                    </h3>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                      WAV / WebM
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    Genera archivos de audio WAV descargables o captura la locución en vivo
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  id="close-recorder-panel-button"
                  type="button"
                  onClick={() => setShowRecorder(false)}
                  className="text-stone-400 hover:text-stone-700 text-xs px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  Ocultar
                </button>
              </div>
            </div>

            {/* Pestañas de método de obtención de audio */}
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-200/80 pb-3">
              <button
                id="tab-studio-wav-button"
                type="button"
                onClick={() => setRecorderActiveTab('studio')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  recorderActiveTab === 'studio'
                    ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-red-600 text-white shadow-sm ring-2 ring-amber-400/30'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Generación Directa WAV (Estudio • Sin Micrófono)</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${
                  recorderActiveTab === 'studio' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}>
                  Recomendado
                </span>
              </button>

              <button
                id="tab-local-media-button"
                type="button"
                onClick={() => setRecorderActiveTab('local')}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  recorderActiveTab === 'local'
                    ? 'bg-stone-800 text-white shadow-sm ring-2 ring-stone-400/30'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <Disc className="w-3.5 h-3.5 text-red-500" />
                <span>Captura en Vivo (MediaRecorder)</span>
              </button>
            </div>

            {/* Explicación técnica clara y aviso si estamos en visor embebido (solo en captura local) */}
            {recorderActiveTab === 'local' && isInsideIframe && (
              <div className="bg-purple-50/90 border border-purple-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-purple-950 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-purple-900">
                      Entorno de Visor Embebido (Iframe)
                    </p>
                    <p className="text-purple-800/90 text-[11px] leading-relaxed">
                      Dentro de marcos iframe los navegadores bloquean la selección de pestaña por directiva de seguridad. Si tu equipo no cuenta con micrófono o falla el permiso, te recomendamos usar la pestaña <strong>«Generación Directa WAV»</strong> que funciona sin permisos ni hardware.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[11px] transition-all shadow-2xs"
                  title="Abrir en pestaña independiente"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir en pestaña nueva</span>
                </button>
              </div>
            )}

            {/* Error si ocurrió en la grabación con botones de resolución rápida */}
            {recordError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800 flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-bold">Aviso de captura de audio:</p>
                    <p className="leading-relaxed">{recordError}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Botón de solución directa para generar el audio sin micrófono */}
                  <button
                    id="solve-error-with-studio-wav-button"
                    type="button"
                    disabled={isGeneratingWav || !text.trim()}
                    onClick={() => {
                      setRecordError(null);
                      setRecorderActiveTab('studio');
                      generateDirectWav();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>{isGeneratingWav ? 'Generando...' : '⚡ Generar Audio WAV Directo (Sin Micrófono)'}</span>
                  </button>

                  <button
                    id="retry-with-mic-button"
                    type="button"
                    onClick={() => {
                      setRecordError(null);
                      startExperimentalRecording('user');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-red-300 text-red-800 hover:bg-red-50 font-semibold text-xs shadow-2xs transition-all active:scale-95"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Reintentar con micrófono</span>
                  </button>

                  {isInsideIframe && (
                    <button
                      id="error-open-tab-button"
                      type="button"
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 font-semibold text-xs transition-all shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir en pestaña nueva</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* CONTENIDO DE PESTAÑA: GENERACIÓN DIRECTA WAV DE ESTUDIO */}
            {recorderActiveTab === 'studio' && (
              <div className="flex flex-col gap-4">
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-950">
                  <div className="space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-900">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      Síntesis Directa a Archivo de Audio WAV
                    </p>
                    <p className="text-[11px] text-amber-800/90 leading-relaxed">
                      Sintetiza el texto del editor directamente a un archivo de audio WAV (PCM 16-bit, 24.000 Hz sin pérdidas). No requiere micrófono conectado, no solicita diálogos de permisos del navegador y es 100% compatible con cualquier dispositivo.
                    </p>
                  </div>
                </div>

                {/* Selector de Voz de Estudio */}
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 flex flex-col gap-2">
                  <label className="text-xs font-bold text-stone-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5 text-amber-600" />
                      Voz de Estudio:
                    </span>
                    <span className="text-[11px] font-normal text-stone-500">Audio natural y nítido</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-1">
                    {[
                      { id: 'Kore', name: 'Kore', desc: 'Femenina cálida' },
                      { id: 'Puck', name: 'Puck', desc: 'Expresiva y ágil' },
                      { id: 'Fenrir', name: 'Fenrir', desc: 'Masculina profunda' },
                      { id: 'Zephyr', name: 'Zephyr', desc: 'Suave y serena' },
                      { id: 'Charon', name: 'Charon', desc: 'Neutra y equilibrada' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        id={`studio-voice-${v.id.toLowerCase()}-button`}
                        type="button"
                        disabled={isGeneratingWav}
                        onClick={() => setSelectedStudioVoice(v.id as 'Kore' | 'Puck' | 'Fenrir' | 'Zephyr' | 'Charon')}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-0.5 text-center transition-all ${
                          selectedStudioVoice === v.id
                            ? 'bg-white border-amber-500 text-amber-950 shadow-sm ring-2 ring-amber-400/30'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                        } ${isGeneratingWav ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <span className="font-bold">{v.name}</span>
                        <span className="text-[9px] font-normal text-stone-500">{v.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reproductor de audio WAV si ya fue generado */}
                {directWavUrl && !isGeneratingWav && (
                  <div className="bg-emerald-50/90 border border-emerald-300/80 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-900 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>¡Audio WAV generado con éxito!</span>
                      </div>
                      {directWavInfo && (
                        <span className="text-[10px] font-mono text-emerald-700 font-semibold uppercase bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                          Voz: {directWavInfo.voice} • {directWavInfo.duration}s • {Math.round(directWavInfo.bytes / 1024)} KB
                        </span>
                      )}
                    </div>

                    <div className="w-full bg-white p-2 rounded-xl border border-emerald-200 shadow-2xs">
                      <audio controls src={directWavUrl} className="w-full h-9 rounded" />
                    </div>

                    <div className="flex items-center flex-wrap gap-2.5 pt-1">
                      <button
                        id="download-direct-wav-button"
                        type="button"
                        onClick={handleDownloadDirectWav}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-700/20 active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Descargar Archivo WAV (.wav)</span>
                      </button>

                      <button
                        id="regenerate-direct-wav-button"
                        type="button"
                        onClick={() => generateDirectWav()}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-all shadow-2xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Regenerar con voz {selectedStudioVoice}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Estado de generación o botón de disparo */}
                {isGeneratingWav ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-center gap-3 text-amber-950 text-xs font-bold">
                    <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    <span>Sintetizando audio de estudio a WAV con voz {selectedStudioVoice}...</span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-stone-600">
                      Transforma el texto en archivo WAV. No requiere micrófono ni permisos de navegador.
                    </p>
                    <button
                      id="start-direct-wav-button"
                      type="button"
                      disabled={!text.trim() || isGeneratingWav}
                      onClick={() => generateDirectWav()}
                      className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md shrink-0 ${
                        !text.trim() || isGeneratingWav
                          ? 'bg-stone-300 cursor-not-allowed text-stone-500 shadow-none'
                          : 'bg-gradient-to-r from-amber-600 via-rose-600 to-red-600 hover:from-amber-500 hover:via-rose-500 hover:to-red-500 shadow-amber-600/25 active:scale-95'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-amber-200" />
                      <span>{directWavUrl ? 'Generar de Nuevo en WAV' : 'Generar Archivo WAV'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CONTENIDO DE PESTAÑA: CAPTURA LOCAL CON MEDIARECORDER */}
            {recorderActiveTab === 'local' && (
              <div className="flex flex-col gap-4">
                <div className="bg-amber-50/80 border border-amber-200/70 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p>
                      <strong>Captura local:</strong> Graba el audio emitido en tiempo real mediante la <code>MediaRecorder API</code>. Requiere un micrófono conectado al ordenador o permiso de captura de audio del navegador.
                    </p>
                  </div>
                </div>

                {/* Opciones de captura y formato (solo editables cuando no se está grabando) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Selector de modo de captura */}
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 flex flex-col gap-2">
                    <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-stone-600" />
                      Origen de la captura:
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        id="capture-mode-user-button"
                        type="button"
                        disabled={isRecording}
                        onClick={() => setCaptureMode('user')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 text-center transition-all ${
                          captureMode === 'user'
                            ? 'bg-white border-purple-500 text-purple-700 shadow-sm ring-1 ring-purple-400/30'
                            : 'bg-stone-100 border-stone-200 text-stone-600 hover:bg-stone-200/60'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="flex items-center gap-1">
                          <Mic className="w-3.5 h-3.5 text-purple-600" /> Micrófono / Entrada
                        </span>
                        <span className="text-[9px] font-semibold text-purple-700">Abre diálogo del navegador</span>
                      </button>

                      <button
                        id="capture-mode-display-button"
                        type="button"
                        disabled={isRecording}
                        onClick={() => {
                          if (isInsideIframe) {
                            setRecordError(
                              'La captura directa de pantalla/pestaña está restringida por la directiva de seguridad del navegador dentro de marcos iframe. Abre la app en una pestaña nueva para usar este modo, o usa «Generación Directa WAV».'
                            );
                          }
                          setCaptureMode('display');
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 text-center transition-all ${
                          captureMode === 'display'
                            ? 'bg-white border-red-500 text-red-700 shadow-sm ring-1 ring-red-400/30'
                            : 'bg-stone-100 border-stone-200 text-stone-600 hover:bg-stone-200/60'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="flex items-center gap-1">
                          <Monitor className="w-3.5 h-3.5" /> Pestaña / Sistema
                        </span>
                        <span className="text-[9px] font-normal text-stone-500">
                          {isInsideIframe ? 'Solo en pestaña nueva' : 'Audio de pestaña'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Selector de formato de archivo */}
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 flex flex-col gap-2">
                    <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-stone-600" />
                      Formato de salida:
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        id="target-format-wav-button"
                        type="button"
                        disabled={isRecording}
                        onClick={() => setTargetFormat('wav')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 text-center transition-all ${
                          targetFormat === 'wav'
                            ? 'bg-white border-amber-500 text-amber-900 shadow-sm ring-1 ring-amber-400/30'
                            : 'bg-stone-100 border-stone-200 text-stone-600 hover:bg-stone-200/60'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="flex items-center gap-1">
                          .WAV PCM (16-bit)
                        </span>
                        <span className="text-[9px] font-semibold text-amber-700">Sin pérdidas • Universal</span>
                      </button>

                      <button
                        id="target-format-webm-button"
                        type="button"
                        disabled={isRecording}
                        onClick={() => setTargetFormat('webm')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 text-center transition-all ${
                          targetFormat === 'webm'
                            ? 'bg-white border-purple-500 text-purple-900 shadow-sm ring-1 ring-purple-400/30'
                            : 'bg-stone-100 border-stone-200 text-stone-600 hover:bg-stone-200/60'
                        } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="flex items-center gap-1">
                          .WEBM (Opus)
                        </span>
                        <span className="text-[9px] font-normal text-stone-500">Comprimido ligero</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Estado de grabación activo */}
                {isRecording && (
                  <div className="bg-red-50/90 border border-red-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full bg-red-600 animate-ping inline-block" />
                      <div className="flex flex-col">
                        <span className="text-xs font-extrabold text-red-900 uppercase tracking-wider">
                          Grabando locución en curso...
                        </span>
                        <span className="text-xs font-mono font-bold text-red-700">
                          Tiempo: {formatSeconds(recordingSeconds)}
                        </span>
                      </div>
                    </div>

                    <button
                      id="stop-recording-button"
                      type="button"
                      onClick={stopExperimentalRecording}
                      className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Detener y procesar audio</span>
                    </button>
                  </div>
                )}

                {/* Procesando audio */}
                {isProcessingAudio && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-center gap-3 text-purple-900 text-xs font-bold">
                    <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <span>Codificando y procesando archivo de audio ({targetFormat.toUpperCase()})...</span>
                  </div>
                )}

                {/* Resultado de audio grabado listo para escuchar y descargar */}
                {recordedUrl && !isRecording && !isProcessingAudio && (
                  <div className="bg-emerald-50/90 border border-emerald-300/80 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-900 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>¡Audio grabado y listo para descargar!</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold uppercase bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                        Formato: .{recordedFormat} • {recordedBlob ? `${Math.round(recordedBlob.size / 1024)} KB` : ''}
                      </span>
                    </div>

                    {/* Reproductor de audio HTML5 para escuchar la toma */}
                    <div className="w-full bg-white p-2 rounded-xl border border-emerald-200 shadow-2xs">
                      <audio controls src={recordedUrl} className="w-full h-9 rounded" />
                    </div>

                    <div className="flex items-center flex-wrap gap-2.5 pt-1">
                      <button
                        id="download-recorded-audio-button"
                        type="button"
                        onClick={handleDownload}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-700/20 active:scale-95"
                      >
                        <Download className="w-4 h-4" />
                        <span>Descargar archivo .{recordedFormat?.toUpperCase()}</span>
                      </button>

                      <button
                        id="record-again-button"
                        type="button"
                        onClick={() => startExperimentalRecording()}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-all shadow-2xs"
                      >
                        <Disc className="w-3.5 h-3.5 text-red-600" />
                        <span>Grabar otra toma</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Botón para iniciar la grabación si no está grabando ni procesando */}
                {!isRecording && !isProcessingAudio && !recordedUrl && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-stone-600">
                      {captureMode === 'display' 
                        ? 'Al pulsar, se abrirá el diálogo del navegador. Selecciona la pestaña y activa «Compartir audio».'
                        : 'Al pulsar, el navegador solicitará acceso a la entrada de audio (micrófono). Pulsa «Permitir» para grabar la locución.'}
                    </p>
                    <button
                      id="start-recording-action-button"
                      type="button"
                      disabled={!text.trim() || !isSupported}
                      onClick={() => startExperimentalRecording()}
                      className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md shrink-0 ${
                        !text.trim() || !isSupported
                          ? 'bg-stone-300 cursor-not-allowed text-stone-500 shadow-none'
                          : 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:via-rose-500 hover:to-amber-500 shadow-red-600/25 active:scale-95'
                      }`}
                    >
                      <Disc className="w-4 h-4 fill-current text-amber-200" />
                      <span>Iniciar Grabación y Locución</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Barra de control y reproducción viva */}
        <div id="tts-controls-bar" className="bg-white/95 backdrop-blur-md rounded-3xl border border-amber-200/80 shadow-xl shadow-amber-950/10 p-5 flex flex-col md:flex-row items-center justify-between gap-5 relative">
          {/* Indicador de estado, ecualizador animado y palabra activa */}
          <div className="flex items-center gap-3.5 w-full md:w-auto">
            {/* Indicador visual de estado */}
            <div className={`w-4 h-4 rounded-full shrink-0 transition-all duration-300 ${
              isSpeaking && !isPaused 
                ? 'bg-red-500 ring-4 ring-red-200 shadow-md shadow-red-500/50 animate-pulse' 
                : isPaused
                ? 'bg-amber-400 ring-4 ring-amber-200'
                : 'bg-purple-300 ring-4 ring-purple-100'
            }`} />

            {/* Ecualizador dinámico que vibra en rojo, amarillo y morado cuando hay voz */}
            <div className="flex items-end gap-1 h-6 px-1.5 py-0.5 bg-stone-100/80 rounded-lg border border-stone-200/60" title={isSpeaking && !isPaused ? 'Sintetizando audio' : 'En reposo'}>
              <span className={`w-1 rounded-full transition-all ${isSpeaking && !isPaused ? 'bg-red-500 animate-wave-1' : 'bg-red-300 h-1.5'}`} />
              <span className={`w-1 rounded-full transition-all ${isSpeaking && !isPaused ? 'bg-amber-400 animate-wave-2' : 'bg-amber-300 h-2'}`} />
              <span className={`w-1 rounded-full transition-all ${isSpeaking && !isPaused ? 'bg-purple-600 animate-wave-3' : 'bg-purple-300 h-1'}`} />
              <span className={`w-1 rounded-full transition-all ${isSpeaking && !isPaused ? 'bg-rose-500 animate-wave-4' : 'bg-rose-300 h-2.5'}`} />
              <span className={`w-1 rounded-full transition-all ${isSpeaking && !isPaused ? 'bg-yellow-400 animate-wave-5' : 'bg-yellow-300 h-1.5'}`} />
              <span className={`w-1 rounded-full transition-all ${isSpeaking && !isPaused ? 'bg-violet-600 animate-wave-6' : 'bg-violet-300 h-2'}`} />
            </div>
            
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-stone-800">
                {isSpeaking && !isPaused 
                  ? 'Locución en curso...' 
                  : isPaused 
                  ? 'Locución en pausa' 
                  : 'Listo para sintetizar'}
              </span>
              {currentWord && isSpeaking && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">Palabra:</span>
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-yellow-200/90 text-amber-950 border border-amber-300 shadow-2xs truncate">
                    «{currentWord}»
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center flex-wrap gap-2.5 w-full md:w-auto justify-end">
            {/* Pausa / Reanudar */}
            {isSpeaking && (
              <button
                id="pause-speech-button"
                type="button"
                onClick={isPaused ? handlePlay : handlePause}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-all shadow-xs"
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{isPaused ? 'Reanudar' : 'Pausa'}</span>
              </button>
            )}

            {/* Detener */}
            {isSpeaking && (
              <button
                id="stop-speech-button"
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-red-300 bg-rose-50 text-red-700 hover:bg-red-100 hover:border-red-400 transition-all shadow-xs"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Detener</span>
              </button>
            )}

            {/* Botón rápido para Generar y Descargar WAV directo */}
            <button
              id="quick-download-wav-button"
              type="button"
              disabled={!text.trim() || isGeneratingWav}
              onClick={() => {
                setShowRecorder(true);
                setRecorderActiveTab('studio');
                setTimeout(() => {
                  const el = document.getElementById('tts-recorder-panel');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 60);
                if (!directWavUrl) {
                  generateDirectWav();
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 hover:border-amber-400 transition-all shadow-xs"
              title="Generar y descargar audio WAV de estudio sin necesidad de micrófono"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-600 ${isGeneratingWav ? 'animate-spin' : ''}`} />
              <span>{isGeneratingWav ? 'Generando WAV...' : 'Descargar WAV'}</span>
            </button>

            {/* Botón rápido para abrir grabador */}
            <button
              id="quick-record-toggle-button"
              type="button"
              onClick={() => {
                if (isRecording) {
                  stopExperimentalRecording();
                } else {
                  setShowRecorder(true);
                  setTimeout(() => {
                    const el = document.getElementById('tts-recorder-panel');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }, 60);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all shadow-xs ${
                showRecorder || isRecording
                  ? 'bg-red-50 text-red-700 border-red-300 ring-2 ring-red-400/20'
                  : 'bg-white text-stone-700 border-amber-300 hover:bg-rose-50 hover:text-red-700 hover:border-red-300'
              }`}
            >
              <Disc className={`w-3.5 h-3.5 text-red-600 ${isRecording ? 'animate-spin' : ''}`} />
              <span>{isRecording ? `Grabando (${formatSeconds(recordingSeconds)})` : 'Grabar audio'}</span>
            </button>

            {/* Botón principal de Reproducción (Rojo y Amarillo con energía) */}
            <button
              id="play-speech-button"
              type="button"
              disabled={!text.trim() || !isSupported}
              onClick={handlePlay}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold text-white transition-all duration-200 shadow-md ${
                !text.trim() || !isSupported
                  ? 'bg-stone-300 cursor-not-allowed text-stone-500 shadow-none'
                  : 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:from-red-500 hover:via-rose-500 hover:to-amber-400 active:scale-95 shadow-red-600/30 hover:shadow-red-600/40 border border-red-500/80 ring-2 ring-red-400/20'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isPaused ? 'Reanudar' : isSpeaking ? 'Reiniciar' : 'Reproducir'}</span>
            </button>
          </div>
        </div>
      </main>

      {/* Pie de página enriquecido */}
      <footer id="tts-footer" className="border-t border-amber-200/50 bg-white/70 backdrop-blur-xs text-stone-500 text-xs py-4 px-6 text-center">
        <div className="flex items-center justify-center gap-2 flex-wrap font-medium">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span>Síntesis 100% en el cliente</span>
          <span className="text-amber-500">•</span>
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
          <span>Sin consumo de nube</span>
          <span className="text-purple-500">•</span>
          <span className="inline-block w-2 h-2 rounded-full bg-purple-600" />
          <span>Totalmente sin conexión</span>
        </div>
      </footer>
    </div>
  );
}

