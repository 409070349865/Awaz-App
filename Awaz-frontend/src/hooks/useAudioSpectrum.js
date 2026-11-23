import { useCallback, useEffect, useRef, useState } from 'react';

const BAR_COUNT = 32;
const EMPTY_SPECTRUM = () => Array(BAR_COUNT).fill(0);
const EMPTY_SNAPSHOT = () => ({ spectrum: EMPTY_SPECTRUM(), peakHz: null, level: 0, active: false, error: '' });

function permissionMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Allow microphone access to show the live frequency meter.';
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'No microphone is available for the frequency meter.';
  return 'The live frequency meter is unavailable in this browser.';
}

export function useAudioSpectrum() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const frameRef = useRef(null);

  const releaseResources = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (contextRef.current && contextRef.current.state !== 'closed') contextRef.current.close().catch(() => {});
    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
  }, []);

  const stop = useCallback(() => {
    releaseResources();
    if (mountedRef.current) setSnapshot(EMPTY_SNAPSHOT());
  }, [releaseResources]);

  const start = useCallback(async () => {
    if (streamRef.current) return true;
    releaseResources();
    const generation = generationRef.current;
    if (mountedRef.current) setSnapshot(EMPTY_SNAPSHOT());

    if (!navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current) setSnapshot({ ...EMPTY_SNAPSHOT(), error: 'Microphone spectrum access is not supported by this browser.' });
      return false;
    }

    let stream;
    try {
      const streamRequest = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
      stream = await streamRequest;
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) throw new Error('Web Audio API is not supported.');
      const context = new AudioContextType();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      await context.resume();
      if (generation !== generationRef.current) {
        source.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        context.close().catch(() => {});
        return false;
      }

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);
      const binHz = context.sampleRate / analyser.fftSize;
      const highHz = Math.min(8_000, context.sampleRate / 2);
      let lastUpdate = 0;

      const sample = (timestamp) => {
        if (generation !== generationRef.current || analyserRef.current !== analyser) return;
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeData);

        let squareSum = 0;
        for (const sampleValue of timeData) {
          const normalized = (sampleValue - 128) / 128;
          squareSum += normalized * normalized;
        }
        const level = Math.sqrt(squareSum / timeData.length);
        const spectrum = [];
        const minHz = 70;
        const ratio = highHz / minHz;
        for (let band = 0; band < BAR_COUNT; band += 1) {
          const lowHz = minHz * (ratio ** (band / BAR_COUNT));
          const upperHz = minHz * (ratio ** ((band + 1) / BAR_COUNT));
          const lowBin = Math.max(1, Math.floor(lowHz / binHz));
          const upperBin = Math.min(frequencyData.length - 1, Math.ceil(upperHz / binHz));
          let peak = 0;
          for (let bin = lowBin; bin <= upperBin; bin += 1) peak = Math.max(peak, frequencyData[bin]);
          spectrum.push(Math.min(1, peak / 200));
        }

        let peakBin = 0;
        let peakValue = 0;
        for (let bin = Math.max(1, Math.floor(minHz / binHz)); bin < Math.min(frequencyData.length, Math.ceil(4_000 / binHz)); bin += 1) {
          if (frequencyData[bin] > peakValue) { peakValue = frequencyData[bin]; peakBin = bin; }
        }
        const peakHz = level > 0.006 && peakValue > 7 ? Math.round(peakBin * binHz) : null;
        if (timestamp - lastUpdate >= 55 && mountedRef.current) {
          lastUpdate = timestamp;
          setSnapshot({ spectrum, peakHz, level: Math.min(1, level * 3), active: true, error: '' });
        }
        frameRef.current = requestAnimationFrame(sample);
      };
      frameRef.current = requestAnimationFrame(sample);
      return true;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (generation === generationRef.current && mountedRef.current) {
        releaseResources();
        setSnapshot({ ...EMPTY_SNAPSHOT(), error: permissionMessage(error) });
      }
      return false;
    }
  }, [releaseResources]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseResources();
    };
  }, [releaseResources]);

  return { ...snapshot, start, stop };
}
