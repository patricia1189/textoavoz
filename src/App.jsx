import React, { useState, useEffect } from 'react';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';

export default function App() {
  const {
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    speaking,
    paused,
    speak,
    pause,
    stop,
    langFilter,
    setLangFilter
  } = useSpeechSynthesis();

  const [text, setText] = useState('');
  const [playlist, setPlaylist] = useState(() => {
    const saved = localStorage.getItem('tts_playlist');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentIndex, setCurrentIndex] = useState(null);

  useEffect(() => {
    localStorage.setItem('tts_playlist', JSON.stringify(playlist));
  }, [playlist]);

  const handleAddToPlaylist = () => {
    if (!text.trim()) return;
    const newItem = {
      id: Date.now(),
      title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
      content: text,
      createdAt: new Date().toLocaleDateString()
    };
    setPlaylist([...playlist, newItem]);
    setText('');
  };

  const handlePlayItem = (index) => {
    setCurrentIndex(index);
    speak(playlist[index].content, () => {
      // Reproducción secuencial automática
      if (index + 1 < playlist.length) {
        handlePlayItem(index + 1);
      } else {
        setCurrentIndex(null);
      }
    });
  };

  const handlePlayCurrentText = () => {
    if (text.trim()) {
      speak(text);
    } else if (currentIndex !== null && playlist[currentIndex]) {
      speak(playlist[currentIndex].content);
    }
  };

  const handleDeleteItem = (id) => {
    setPlaylist(playlist.filter(item => item.id !== id));
    if (currentIndex !== null && playlist[currentIndex]?.id === id) {
      stop();
      setCurrentIndex(null);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>🗣️ Convertidor Texto a Voz (ES / EN)</h1>
        <p>100% Gratuito y Funcional sin Servidor</p>
      </header>

      <main style={styles.main}>
        {/* Panel de Configuración de Voz */}
        <section style={styles.card}>
          <h3>Ajustes de Voz</h3>
          <div style={styles.row}>
            <label>Filtrar Idioma: </label>
            <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} style={styles.input}>
              <option value="all">Todos (Español e Inglés)</option>
              <option value="es">Español 🇪🇸/🇲🇽</option>
              <option value="en">Inglés 🇺🇸/🇬🇧</option>
            </select>
          </div>

          <div style={styles.row}>
            <label>Voz: </label>
            <select 
              value={selectedVoice?.name || ''} 
              onChange={(e) => setSelectedVoice(voices.find(v => v.name === e.target.value))}
              style={styles.input}
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.row}>
            <label>Velocidad: {rate}x</label>
            <input 
              type="range" 
              min="0.5" 
              max="2" 
              step="0.1" 
              value={rate} 
              onChange={(e) => setRate(parseFloat(e.target.value))} 
            />
          </div>
        </section>

        {/* Panel de Texto */}
        <section style={styles.card}>
          <h3>Escribir o Pegar Texto</h3>
          <textarea 
            style={styles.textarea} 
            value={text} 
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe aquí tu texto en español o inglés..."
            rows={5}
          />
          <div style={styles.buttonGroup}>
            {!speaking ? (
              <button onClick={handlePlayCurrentText} style={styles.btnPrimary}>▶️ Reproducir</button>
            ) : (
              <button onClick={pause} style={styles.btnSecondary}>⏸️ Pausar</button>
            )}
            <button onClick={stop} style={styles.btnDanger}>⏹️ Detener</button>
            <button onClick={handleAddToPlaylist} style={styles.btnSuccess}>➕ Guardar en Playlist</button>
          </div>
        </section>

        {/* Playlist / Guardados */}
        <section style={styles.card}>
          <h3>Mi Playlist de Textos ({playlist.length})</h3>
          {playlist.length === 0 ? (
            <p>No tienes textos guardados.</p>
          ) : (
            <ul style={styles.list}>
              {playlist.map((item, idx) => (
                <li key={item.id} style={{
                  ...styles.listItem,
                  backgroundColor: currentIndex === idx ? '#e3f2fd' : '#fff'
                }}>
                  <div>
                    <strong>{item.title}</strong>
                    <br/>
                    <small style={{color: '#666'}}>{item.createdAt}</small>
                  </div>
                  <div>
                    <button onClick={() => handlePlayItem(idx)} style={styles.btnSmall}>▶️</button>
                    <button onClick={() => handleDeleteItem(item.id)} style={styles.btnSmallDanger}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = {
  container: { maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' },
  header: { textAlign: 'center', marginBottom: '20px' },
  main: { display: 'flex', flexDirection: 'column', gap: '20px' },
  card: { padding: '20px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: '#fafafa' },
  row: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' },
  input: { flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' },
  textarea: { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' },
  buttonGroup: { display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' },
  btnPrimary: { padding: '10px 15px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  btnSecondary: { padding: '10px 15px', backgroundColor: '#f5a623', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  btnDanger: { padding: '10px 15px', backgroundColor: '#e00', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  btnSuccess: { padding: '10px 15px', backgroundColor: '#17c964', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  list: { listStyle: 'none', padding: 0 },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee', borderRadius: '4px', marginBottom: '5px' },
  btnSmall: { padding: '5px 10px', marginRight: '5px', cursor: 'pointer' },
  btnSmallDanger: { padding: '5px 10px', cursor: 'pointer', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', color: '#c62828' }
};
