import { create } from 'zustand';

const useWebRTCStore = create((set, get) => ({
  // State
  isInitialized: false,
  device: null,
  router: null,
  transport: null,
  producer: null,
  consumers: new Map(),
  isConnected: false,
  isSpeaking: false,
  isMuted: false,
  volume: 1.0,
  audioLevel: 0,
  participants: new Map(),
  currentRoom: null,
  error: null,
  loading: false,

  // Actions
  initializeWebRTC: async () => {
    set({ loading: true, error: null });
    
    try {
      // This will be implemented in the useWebRTC hook
      set({ isInitialized: true, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  setIsInitialized: (isInitialized) => {
    set({ isInitialized });
  },

  setDevice: (device) => {
    set({ device });
  },

  setRouter: (router) => {
    set({ router });
  },

  setTransport: (transport) => {
    set({ transport });
  },

  setProducer: (producer) => {
    set({ producer });
  },

  addConsumer: (consumerId, consumer) => {
    set((state) => {
      const newConsumers = new Map(state.consumers);
      newConsumers.set(consumerId, consumer);
      return { consumers: newConsumers };
    });
  },

  removeConsumer: (consumerId) => {
    set((state) => {
      const newConsumers = new Map(state.consumers);
      newConsumers.delete(consumerId);
      return { consumers: newConsumers };
    });
  },

  setConnectionStatus: (isConnected) => {
    set({ isConnected });
  },

  setSpeaking: (isSpeaking) => {
    set({ isSpeaking });
  },

  setMuted: (isMuted) => {
    set({ isMuted });
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)) });
  },

  setAudioLevel: (level) => {
    set({ audioLevel: Math.max(0, Math.min(1, level)) });
  },

  addParticipant: (userId, participant) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      newParticipants.set(userId, {
        ...participant,
        userId,
        isSpeaking: false,
        isMuted: false,
        audioLevel: 0,
        joinedAt: new Date(),
      });
      return { participants: newParticipants };
    });
  },

  updateParticipant: (userId, updates) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      const participant = newParticipants.get(userId);
      if (participant) {
        newParticipants.set(userId, { ...participant, ...updates });
      }
      return { participants: newParticipants };
    });
  },

  removeParticipant: (userId) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      newParticipants.delete(userId);
      return { participants: newParticipants };
    });
  },

  setCurrentRoom: (room) => {
    set({ currentRoom: room });
  },

  clearError: () => {
    set({ error: null });
  },

  // Getters
  getParticipant: (userId) => {
    const { participants } = get();
    return participants.get(userId);
  },

  getParticipants: () => {
    const { participants } = get();
    return Array.from(participants.values());
  },

  getSpeakingParticipants: () => {
    const { participants } = get();
    return Array.from(participants.values()).filter(p => p.isSpeaking);
  },

  getMutedParticipants: () => {
    const { participants } = get();
    return Array.from(participants.values()).filter(p => p.isMuted);
  },

  // Reset state
  reset: () => {
    set({
      isInitialized: false,
      device: null,
      router: null,
      transport: null,
      producer: null,
      consumers: new Map(),
      isConnected: false,
      isSpeaking: false,
      isMuted: false,
      volume: 1.0,
      audioLevel: 0,
      participants: new Map(),
      currentRoom: null,
      error: null,
      loading: false,
    });
  },

  // Cleanup
  cleanup: () => {
    const { producer, transport, consumers } = get();
    
    // Close producer
    if (producer) {
      producer.close();
    }
    
    // Close transport
    if (transport) {
      transport.close();
    }
    
    // Close all consumers
    consumers.forEach(consumer => {
      if (consumer) {
        consumer.close();
      }
    });
    
    // Reset state
    get().reset();
  },
}));

export { useWebRTCStore };
