import { useState, useEffect } from 'react';

export function useUserIntercomMediaDevices() {
  const [availableDevices, setAvailableDevices] = useState({
    microphones: [],
    speakers: [],
    cameras: [],
  });
  const [selectedDevices, setSelectedDevices] = useState({
    microphoneId: '',
    speakerId: '',
    cameraId: '',
  });

  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter((device) => device.kind === 'audioinput');
        const speakers = devices.filter((device) => device.kind === 'audiooutput');
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        setAvailableDevices({ microphones, speakers, cameras });
        setSelectedDevices((prev) => ({
          microphoneId: prev.microphoneId || microphones[0]?.deviceId || '',
          speakerId: prev.speakerId || speakers[0]?.deviceId || '',
          cameraId: prev.cameraId || cameras[0]?.deviceId || '',
        }));
      } catch (error) {
        console.error('Failed to enumerate audio devices:', error);
      }
    };

    enumerateDevices();
  }, []);

  return {
    availableDevices,
    setAvailableDevices,
    selectedDevices,
    setSelectedDevices,
  };
}
