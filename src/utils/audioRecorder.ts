/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codifica un AudioBuffer de la Web Audio API en un archivo .WAV PCM de 16 bits.
 * Compatible con cualquier reproductor estándar sin necesidad de librerías externas.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const numSamples = buffer.length * numChannels;
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // 1. Cabecera RIFF
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // 2. Sub-chunk "fmt "
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Tamaño de este sub-chunk (16 para PCM)
  view.setUint16(20, format, true); // Audio format 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // 3. Sub-chunk "data"
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 4. Muestras PCM interpoladas
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Convierte un Blob de audio (ej: audio/webm grabado con MediaRecorder) a .WAV
 * decodificando las muestras de audio mediante el AudioContext del navegador.
 */
export async function convertBlobToWav(sourceBlob: Blob): Promise<Blob> {
  const arrayBuffer = await sourceBlob.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  try {
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBufferToWav(decodedBuffer);
  } finally {
    if (audioCtx.state !== 'closed') {
      await audioCtx.close();
    }
  }
}

/**
 * Determina el mejor tipo MIME soportado por el navegador para MediaRecorder.
 */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) {
      return t;
    }
