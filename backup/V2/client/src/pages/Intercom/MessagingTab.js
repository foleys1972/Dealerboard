import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { 
  FiMessageSquare, 
  FiUsers,
  FiUser,
  FiSearch,
  FiSend,
  FiPaperclip,
  FiMoreVertical,
  FiChevronRight,
  FiPlus,
  FiX,
  FiCheckCircle,
  FiEdit2,
  FiTrash2,
  FiSmile,
  FiImage
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useSocket } from '../../hooks/useSocket';
import api from '../../utils/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';

const Container = styled.div`
  display: flex;
  height: 100%;
  background: ${props => props.theme.colors.background};
`;

const Sidebar = styled.div`
  width: 300px;
  border-right: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SidebarHeader = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const CreateChatButton = styled.button`
  padding: 0.5rem;
  background: ${props => props.theme.colors.accent};
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  
  &:hover {
    opacity: 0.9;
    transform: scale(1.05);
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: 12px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
`;

const CloseButton = styled.button`
  padding: 0.5rem;
  background: transparent;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 0.2s;
  
  &:hover {
    color: ${props => props.theme.colors.text};
  }
`;

const ChatTypeSelector = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
`;

const ChatTypeButton = styled.button`
  flex: 1;
  padding: 0.75rem;
  background: ${props => props.$active ? props.theme.colors.accent : props.theme.colors.surfaceElevated};
  color: ${props => props.$active ? 'white' : props.theme.colors.text};
  border: 1px solid ${props => props.$active ? props.theme.colors.accent : props.theme.colors.border};
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  
  &:hover {
    opacity: 0.9;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.5rem;
`;

const FormInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const UserList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  padding: 0.5rem;
`;

const UserItem = styled.div`
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: ${props => props.$selected ? props.theme.colors.accent + '20' : 'transparent'};
  border: 1px solid ${props => props.$selected ? props.theme.colors.accent : 'transparent'};
  margin-bottom: 0.5rem;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
`;

const UserAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
`;

const UserInfo = styled.div`
  flex: 1;
`;

const UserName = styled.div`
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
`;

const UserEmail = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const SelectedMembers = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const MemberTag = styled.div`
  padding: 0.375rem 0.75rem;
  background: ${props => props.theme.colors.accent};
  color: white;
  border-radius: 20px;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const RemoveMemberButton = styled.button`
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  
  &:hover {
    opacity: 0.8;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
`;

const ActionButton = styled.button`
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  
  &.primary {
    background: ${props => props.theme.colors.accent};
    color: white;
    
    &:hover:not(:disabled) {
      opacity: 0.9;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  
  &.secondary {
    background: ${props => props.theme.colors.surfaceElevated};
    color: ${props => props.theme.colors.text};
    
    &:hover {
      background: ${props => props.theme.colors.border};
    }
  }
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 0.5rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.textSecondary};
  }
`;

const ChatList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
`;

const ChatItem = styled.div`
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: ${props => props.$active ? props.theme.colors.surfaceElevated : 'transparent'};
  border: 1px solid ${props => props.$active ? props.theme.colors.accent : 'transparent'};
  
  &:hover {
    background: ${props => props.theme.colors.surfaceElevated};
  }
`;

const ChatAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.theme.colors.gradient};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
`;

const ChatInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ChatName = styled.div`
  font-weight: 600;
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChatPreview = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChatMeta = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
`;

const ChatTime = styled.div`
  font-size: 0.625rem;
  color: ${props => props.theme.colors.textTertiary};
`;

const UnreadBadge = styled.div`
  background: ${props => props.theme.colors.accent};
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
`;

const ChatArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${props => props.theme.colors.background};
`;

const ChatHeader = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ChatTitle = styled.div`
  font-weight: 600;
  font-size: 1rem;
  color: ${props => props.theme.colors.text};
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Message = styled.div`
  display: flex;
  gap: 0.75rem;
  align-self: ${props => props.$isOwn ? 'flex-end' : 'flex-start'};
  max-width: 70%;
  flex-direction: ${props => props.$isOwn ? 'row-reverse' : 'row'};
`;

const MessageAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${props => props.$isOwn ? props.theme.colors.accent : props.theme.colors.gradient};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 0.75rem;
  flex-shrink: 0;
`;

const MessageContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MessageBubble = styled.div`
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: ${props => props.$isOwn 
    ? props.theme.colors.gradient 
    : props.theme.colors.surface};
  color: ${props => props.$isOwn ? 'white' : props.theme.colors.text};
  font-size: 0.875rem;
  line-height: 1.4;
  word-wrap: break-word;
`;

const MessageSender = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary};
  padding: 0 0.5rem;
`;

const ReadReceiptIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  margin-left: 0.25rem;
`;

const MessageTime = styled.div`
  font-size: 0.625rem;
  color: ${props => props.theme.colors.textTertiary};
  padding: 0 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const TypingIndicator = styled.div`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-style: italic;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MessageActions = styled.div`
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.2s;
  
  ${Message}:hover & {
    opacity: 1;
  }
`;

const MessageActionButton = styled.button`
  padding: 0.25rem 0.5rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  cursor: pointer;
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surface};
    color: ${props => props.theme.colors.text};
  }
`;

const ReactionButton = styled.button`
  padding: 0.125rem 0.375rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 12px;
  cursor: pointer;
  font-size: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0.125rem;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.surface};
    transform: scale(1.05);
  }
`;

const ReactionsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.25rem;
  padding: 0 0.5rem;
`;

const SearchBar = styled.div`
  padding: 0.5rem 1rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: ${props => props.theme.colors.surface};
`;

const MessageSearchInput = styled.input`
  flex: 1;
  padding: 0.5rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
`;

const FilePreview = styled.div`
  padding: 0.5rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`;

const FileIcon = styled.div`
  font-size: 1.5rem;
`;

const FileInfo = styled.div`
  flex: 1;
  font-size: 0.875rem;
`;

const FileName = styled.div`
  font-weight: 500;
  color: ${props => props.theme.colors.text};
`;

const FileSize = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const InputArea = styled.div`
  padding: 1rem;
  border-top: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.surface};
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
`;

const MessageInput = styled.textarea`
  flex: 1;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 8px;
  color: ${props => props.theme.colors.text};
  font-size: 0.875rem;
  font-family: inherit;
  resize: none;
  min-height: 40px;
  max-height: 120px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent};
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.textSecondary};
  }
`;

const SendButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: ${props => props.theme.colors.gradient};
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
  
  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.colors.textSecondary};
  padding: 2rem;
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
`;

const MessagingTab = () => {
  const { user } = useAuthStore();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [selectedChat, setSelectedChat] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const [showCreateChatModal, setShowCreateChatModal] = useState(false);
  const [createChatType, setCreateChatType] = useState('direct'); // 'direct' or 'group'
  const [createChatName, setCreateChatName] = useState('');
  const [createChatMembers, setCreateChatMembers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  
  // User settings for file sharing and message access
  const [userSettings, setUserSettings] = useState({
    allowFileSharing: false,
    allowMessageAccess: true
  });
  
  // Load user settings
  useEffect(() => {
    const loadUserSettings = async () => {
      if (user?.id || user?.userId) {
        try {
          const response = await api.get(`/api/auth/users/${user.id || user.userId}`);
          if (response.data?.user?.settings) {
            setUserSettings({
              allowFileSharing: response.data.user.settings.allowFileSharing || false,
              allowMessageAccess: response.data.user.settings.allowMessageAccess !== false
            });
          }
        } catch (error) {
          console.error('Failed to load user settings:', error);
        }
      }
    };
    
    loadUserSettings();
  }, [user]);

  // Fetch Matrix status (needed for user ID matching)
  const { data: matrixStatus } = useQuery(
    'matrix-status',
    async () => {
      try {
        const response = await api.get('/api/matrix/status');
        return response.data;
      } catch (error) {
        console.error('Failed to fetch Matrix status:', error);
        return null;
      }
    },
    { refetchInterval: 60000 }
  );

  // Fetch available users for creating chats
  const { data: usersData } = useQuery(
    'users-for-chat',
    async () => {
      try {
        const response = await api.get('/api/auth/users');
        return response.data?.users || [];
      } catch (error) {
        console.error('Failed to fetch users:', error);
        return [];
      }
    },
    { enabled: showCreateChatModal }
  );

  // Update available users when usersData changes
  useEffect(() => {
    if (usersData) {
      // Filter out current user
      const filtered = usersData.filter(u => (u.id || u.userId) !== (user?.id || user?.userId));
      setAvailableUsers(filtered);
    }
  }, [usersData, user]);

  // Fetch groups (for Matrix rooms)
  const { data: groupsData } = useQuery(
    'groups-for-messaging',
    async () => {
      const response = await api.get('/api/groups');
      return response.data?.groups || [];
    },
    { refetchInterval: 30000 }
  );

  // Fetch direct contacts
  const { data: contactsData } = useQuery(
    'direct-contacts-for-messaging',
    async () => {
      const response = await api.get('/api/direct-contacts');
      return response.data?.contacts || [];
    },
    { refetchInterval: 30000 }
  );

  // Fetch Matrix rooms (for groups)
  const { data: matrixRooms } = useQuery(
    'matrix-rooms',
    async () => {
      try {
        const response = await api.get('/api/matrix/rooms');
        return response.data?.rooms || [];
      } catch (error) {
        console.error('Failed to fetch Matrix rooms:', error);
        return [];
      }
    },
    { refetchInterval: 30000, enabled: true }
  );

  // Fetch standalone chat rooms
  const { data: standaloneChatRooms } = useQuery(
    'standalone-chat-rooms',
    async () => {
      try {
        const response = await api.get('/api/matrix/chat/rooms?includeArchived=false');
        return response.data?.rooms || [];
      } catch (error) {
        console.error('Failed to fetch standalone chat rooms:', error);
        return [];
      }
    },
    { refetchInterval: 30000, enabled: true }
  );

  // Get room ID for a group
  const getGroupRoomId = useCallback(async (groupId) => {
    try {
      const response = await api.get(`/api/matrix/group/${groupId}/room`);
      return response.data?.roomId;
    } catch (error) {
      // Room might not exist yet - this is expected if room hasn't been created
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Failed to get group room ID:', error);
      return null;
    }
  }, []);

  // Create or get Matrix room for group
  const ensureGroupRoom = useCallback(async (group) => {
    try {
      // Try to get existing room
      const roomId = await getGroupRoomId(group.id);
      if (roomId) return roomId;

      // Create new room
      const response = await api.post('/api/matrix/room', {
        groupId: group.id,
        groupData: {
          name: group.name,
          description: group.description,
          members: group.participants || []
        }
      });
      return response.data?.roomId;
    } catch (error) {
      console.error('Failed to create/get Matrix room:', error);
      toast.error('Failed to create chat room');
      return null;
    }
  }, [getGroupRoomId]);

  // Fetch messages for a room (fetches all messages, no limit)
  const { data: messagesData, refetch: refetchMessages } = useQuery(
    ['matrix-messages', selectedChat?.roomId],
    async () => {
      if (!selectedChat?.roomId) return { messages: [] };
      try {
        // Fetch all messages - no limit parameter
        const response = await api.get(`/api/matrix/room/${selectedChat.roomId}/messages`);
        const data = response.data || { messages: [] };
        
        // Log for debugging
        console.log(`📨 Fetched ${data.messages?.length || 0} messages for room ${selectedChat.roomId}`);
        
        return data;
      } catch (error) {
        console.error('Failed to fetch messages:', error);
        // If room doesn't exist or not joined, return empty
        if (error.response?.status === 404 || error.response?.status === 403) {
          return { messages: [] };
        }
        toast.error('Failed to load messages');
        return { messages: [] };
      }
    },
    { enabled: !!selectedChat?.roomId, refetchInterval: false } // Disable polling, use real-time updates instead
  );

  const [messages, setMessages] = useState([]);

  // Initialize messages from query data
  useEffect(() => {
    if (messagesData?.messages) {
      setMessages(messagesData.messages);
    }
  }, [messagesData]);

  // Track read receipts for messages
  const [readReceipts, setReadReceipts] = useState(new Map()); // eventId -> Set of userIds who read it
  const [typingUsers, setTypingUsers] = useState(new Set()); // Set of userIds currently typing
  const [editingMessage, setEditingMessage] = useState(null); // { eventId, content }
  const [messageSearchQuery, setMessageSearchQuery] = useState(''); // For message search in chat
  const [searchResults, setSearchResults] = useState([]); // Search results
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredMessage, setHoveredMessage] = useState(null); // Track which message is hovered
  const fileInputRef = useRef(null);

  // Listen for real-time Matrix message updates
  useEffect(() => {
    if (!socket || !selectedChat?.roomId) return;

    const handleMatrixMessage = (messageData) => {
      // Only add message if it's for the currently selected room
      if (messageData.roomId === selectedChat.roomId) {
        setMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const exists = prev.some(msg => msg.eventId === messageData.eventId);
          if (exists) {
            return prev;
          }
          // Add new message and sort by timestamp
          const updated = [...prev, messageData].sort((a, b) => a.timestamp - b.timestamp);
          return updated;
        });
        
        // Scroll to bottom when new message arrives
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };

    const handleReadReceipt = (receiptData) => {
      // Update read receipts for the room
      if (receiptData.roomId === selectedChat?.roomId) {
        setReadReceipts(prev => {
          const updated = new Map(prev);
          receiptData.receipts.forEach(receipt => {
            if (!updated.has(receipt.eventId)) {
              updated.set(receipt.eventId, new Set());
            }
            updated.get(receipt.eventId).add(receipt.userId);
          });
          return updated;
        });
      }
    };

    socket.on('matrix-message', handleMatrixMessage);
    socket.on('matrix-read-receipt', handleReadReceipt);

    return () => {
      socket.off('matrix-message', handleMatrixMessage);
      socket.off('matrix-read-receipt', handleReadReceipt);
    };
  }, [socket, selectedChat?.roomId]);

  // Mark messages as read when viewing the room
  useEffect(() => {
    if (!selectedChat?.roomId || messages.length === 0) return;

    // Mark the latest message as read when room is viewed (debounce to avoid too many calls)
    const timeoutId = setTimeout(() => {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage) {
        // Mark room as read (marks all messages up to the latest)
        api.post(`/api/matrix/room/${selectedChat.roomId}/read`, {
          eventId: latestMessage.eventId
        }).catch(err => {
          console.error('Failed to mark room as read:', err);
        });
      }
    }, 1000); // Wait 1 second after messages load

    return () => clearTimeout(timeoutId);
  }, [selectedChat?.roomId, messages.length]);

  // Send message mutation
  const sendMessageMutation = useMutation(
    async ({ roomId, message }) => {
      const response = await api.post(`/api/matrix/room/${roomId}/message`, {
        message,
        messageType: 'm.text'
      });
      return response.data;
    },
    {
      onSuccess: () => {
        setMessageText('');
        // Message will appear via real-time update, but refetch to ensure consistency
        refetchMessages();
        queryClient.invalidateQueries(['matrix-messages', selectedChat?.roomId]);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to send message');
      }
    }
  );

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || !selectedChat?.roomId) return;
    
    // Stop typing indicator
    if (selectedChat.roomId) {
      try {
        await api.post(`/api/matrix/room/${selectedChat.roomId}/typing`, { isTyping: false });
      } catch (error) {
        // Ignore typing errors
      }
    }
    
    sendMessageMutation.mutate({
      roomId: selectedChat.roomId,
      message: messageText.trim()
    });
    
    setMessageText('');
  }, [messageText, selectedChat, sendMessageMutation]);

  // Handle file upload
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat?.roomId) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('messageText', messageText || '');

      const response = await api.post(
        `/api/matrix/room/${selectedChat.roomId}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data.success) {
        toast.success('File uploaded successfully');
        setMessageText('');
        refetchMessages();
        queryClient.invalidateQueries(['matrix-messages', selectedChat.roomId]);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload file');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedChat, messageText, refetchMessages, queryClient]);

  // Handle typing indicator
  useEffect(() => {
    if (!selectedChat?.roomId || !messageText.trim()) {
      // Stop typing when message is cleared or chat changes
      if (selectedChat?.roomId) {
        api.post(`/api/matrix/room/${selectedChat.roomId}/typing`, { isTyping: false }).catch(() => {});
      }
      return;
    }

    // Send typing indicator
    const typingTimeout = setTimeout(() => {
      api.post(`/api/matrix/room/${selectedChat.roomId}/typing`, { isTyping: true }).catch(() => {});
    }, 500); // Debounce typing indicator

    return () => {
      clearTimeout(typingTimeout);
    };
  }, [messageText, selectedChat]);

  // Listen for typing indicators
  useEffect(() => {
    if (!socket || !selectedChat?.roomId) return;

    const handleTyping = (data) => {
      if (data.roomId === selectedChat.roomId) {
        setTypingUsers(prev => {
          const updated = new Set(prev);
          if (data.isTyping) {
            updated.add(data.userId);
            // Auto-remove typing indicator after 5 seconds
            setTimeout(() => {
              setTypingUsers(prevSet => {
                const newSet = new Set(prevSet);
                newSet.delete(data.userId);
                return newSet;
              });
            }, 5000);
          } else {
            updated.delete(data.userId);
          }
          return updated;
        });
      }
    };

    socket.on('matrix-typing', handleTyping);

    return () => {
      socket.off('matrix-typing', handleTyping);
    };
  }, [socket, selectedChat]);

  // Message edit mutation
  const editMessageMutation = useMutation(
    async ({ roomId, eventId, content }) => {
      const response = await api.put(`/api/matrix/room/${roomId}/message/${eventId}`, { content });
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Message edited');
        setEditingMessage(null);
        refetchMessages();
        queryClient.invalidateQueries(['matrix-messages', selectedChat?.roomId]);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to edit message');
      }
    }
  );

  // Message delete mutation
  const deleteMessageMutation = useMutation(
    async ({ roomId, eventId }) => {
      const response = await api.delete(`/api/matrix/room/${roomId}/message/${eventId}`);
      return response.data;
    },
    {
      onSuccess: () => {
        toast.success('Message deleted');
        refetchMessages();
        queryClient.invalidateQueries(['matrix-messages', selectedChat?.roomId]);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete message');
      }
    }
  );

  // Add reaction mutation
  const addReactionMutation = useMutation(
    async ({ roomId, eventId, key }) => {
      const response = await api.post(`/api/matrix/room/${roomId}/message/${eventId}/reaction`, { key });
      return response.data;
    },
    {
      onSuccess: () => {
        refetchMessages();
        queryClient.invalidateQueries(['matrix-messages', selectedChat?.roomId]);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to add reaction');
      }
    }
  );

  // Search messages
  const searchMessagesMutation = useMutation(
    async ({ roomId, query }) => {
      const response = await api.get(`/api/matrix/room/${roomId}/search`, {
        params: { q: query, limit: 50 }
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        setSearchResults(data.results || []);
        setIsSearching(true);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to search messages');
      }
    }
  );

  const handleEditMessage = (message) => {
    setEditingMessage({
      eventId: message.eventId,
      content: message.content
    });
    setMessageText(message.content);
  };

  const handleSaveEdit = () => {
    if (!editingMessage || !selectedChat?.roomId) return;
    
    editMessageMutation.mutate({
      roomId: selectedChat.roomId,
      eventId: editingMessage.eventId,
      content: messageText.trim()
    });
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setMessageText('');
  };

  const handleDeleteMessage = (eventId) => {
    if (!selectedChat?.roomId || !window.confirm('Are you sure you want to delete this message?')) return;
    
    deleteMessageMutation.mutate({
      roomId: selectedChat.roomId,
      eventId
    });
  };

  const handleAddReaction = (eventId, emoji = '👍') => {
    if (!selectedChat?.roomId) return;
    
    addReactionMutation.mutate({
      roomId: selectedChat.roomId,
      eventId,
      key: emoji
    });
  };

  const handleSearchMessages = () => {
    if (!selectedChat?.roomId || !messageSearchQuery.trim()) return;
    
    searchMessagesMutation.mutate({
      roomId: selectedChat.roomId,
      query: messageSearchQuery.trim()
    });
  };

  const handleClearSearch = () => {
    setMessageSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  // Common emoji reactions
  const commonReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const handleSelectGroup = useCallback(async (group) => {
    const roomId = await ensureGroupRoom(group);
    if (roomId) {
      setSelectedChat({
        type: 'group',
        id: group.id,
        name: group.name,
        roomId: roomId
      });
    }
  }, [ensureGroupRoom]);

  const handleSelectContact = useCallback(async (contact) => {
    try {
      // Get or create direct message room
      const response = await api.get(`/api/matrix/direct/${contact.id}/room`);
      
      if (response.data?.roomId) {
        setSelectedChat({
          type: 'direct',
          id: contact.id,
          name: contact.displayName,
          roomId: response.data.roomId
        });
      } else {
        toast.error('Failed to create direct message room');
      }
    } catch (error) {
      console.error('Failed to get/create direct room:', error);
      const errorMessage = error.response?.data?.error || 'Failed to create direct message room';
      toast.error(errorMessage);
      
      // Still set the chat so user can see the error
      setSelectedChat({
        type: 'direct',
        id: contact.id,
        name: contact.displayName,
        roomId: null
      });
    }
  }, []);

  // Create new chat room
  const createChatMutation = useMutation(
    async (chatData) => {
      const response = await api.post('/api/matrix/chat/create', chatData);
      return response.data;
    },
    {
      onSuccess: (data) => {
        toast.success('Chat room created successfully');
        setShowCreateChatModal(false);
        setCreateChatName('');
        setCreateChatMembers([]);
        setUserSearchQuery('');
        
        // Select the newly created chat
        if (data.roomId) {
          setSelectedChat({
            type: createChatType,
            id: data.chatRoomId,
            name: data.name,
            roomId: data.roomId
          });
        }
        
        // Invalidate queries to refresh chat list
        queryClient.invalidateQueries('matrix-rooms');
        queryClient.invalidateQueries('matrix-messages');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create chat room');
      }
    }
  );

  const handleCreateChat = () => {
    if (createChatType === 'direct') {
      if (createChatMembers.length !== 1) {
        toast.error('Please select exactly one user for a direct chat');
        return;
      }
    } else {
      if (!createChatName.trim()) {
        toast.error('Please enter a name for the group chat');
        return;
      }
      if (createChatMembers.length === 0) {
        toast.error('Please select at least one member for the group chat');
        return;
      }
    }

    createChatMutation.mutate({
      name: createChatType === 'direct' 
        ? `${user?.displayName || user?.username || 'You'} & ${createChatMembers[0].displayName || createChatMembers[0].username}`
        : createChatName.trim(),
      type: createChatType,
      members: createChatMembers.map(m => m.id || m.userId)
    });
  };

  const toggleMember = (userToToggle) => {
    if (createChatType === 'direct') {
      // For direct chat, only allow one member
      setCreateChatMembers([userToToggle]);
    } else {
      // For group chat, allow multiple members
      const isSelected = createChatMembers.some(m => (m.id || m.userId) === (userToToggle.id || userToToggle.userId));
      if (isSelected) {
        setCreateChatMembers(createChatMembers.filter(m => (m.id || m.userId) !== (userToToggle.id || userToToggle.userId)));
      } else {
        setCreateChatMembers([...createChatMembers, userToToggle]);
      }
    }
  };

  // Combine groups, contacts, and standalone chat rooms into chat list
  const chatList = React.useMemo(() => {
    const chats = [];
    
    // Add groups
    if (groupsData) {
      groupsData.forEach(group => {
        const matrixRoom = matrixRooms?.find(r => r.groupId === group.id);
        chats.push({
          type: 'group',
          id: group.id,
          name: group.name,
          preview: 'Group chat',
          roomId: matrixRoom?.roomId,
          unread: 0,
          lastMessage: null
        });
      });
    }
    
    // Add direct contacts
    if (contactsData) {
      contactsData.forEach(contact => {
        // Try to find existing Matrix room for this contact
        // We'll fetch it when the contact is selected, but for now set to null
        chats.push({
          type: 'direct',
          id: contact.id,
          name: contact.displayName,
          preview: 'Direct message',
          roomId: null, // Will be fetched when selected
          unread: 0,
          lastMessage: null,
          contactUserId: contact.contactUserId,
          uri: contact.uri
        });
      });
    }
    
    // Add standalone chat rooms (created via create chat feature)
    if (standaloneChatRooms) {
      standaloneChatRooms.forEach(room => {
        // Skip if already added as a group or direct contact
        const isDuplicate = chats.some(chat => chat.roomId === room.roomId);
        if (!isDuplicate) {
          chats.push({
            type: room.type,
            id: room.id,
            name: room.name,
            preview: room.type === 'direct' ? 'Direct message' : 'Group chat',
            roomId: room.roomId,
            unread: 0,
            lastMessage: null,
            isStandalone: true
          });
        }
      });
    }
    
    // Sort by last activity (most recent first)
    chats.sort((a, b) => {
      // For now, prioritize groups and contacts over standalone rooms
      // In the future, we can sort by actual last message time
      return 0;
    });
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return chats.filter(chat => 
        chat.name.toLowerCase().includes(query)
      );
    }
    
    return chats;
  }, [groupsData, contactsData, matrixRooms, standaloneChatRooms, searchQuery]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredChatList = chatList;

  // Check if user has message access (after all hooks are called)
  if (userSettings.allowMessageAccess === false) {
    return (
      <EmptyState>
        <EmptyIcon>🔒</EmptyIcon>
        <div style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Message Access Restricted
        </div>
        <div style={{ color: '#6b7280' }}>
          You do not have permission to access messaging. Please contact your administrator.
        </div>
      </EmptyState>
    );
  }

  return (
    <Container>
      <Sidebar>
        <SidebarHeader>
          <FiSearch />
          <SearchInput
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <CreateChatButton
            onClick={() => setShowCreateChatModal(true)}
            title="Create new chat"
          >
            <FiPlus />
          </CreateChatButton>
        </SidebarHeader>
        <ChatList>
          {filteredChatList.map(chat => (
            <ChatItem
              key={`${chat.type}-${chat.id}-${chat.roomId || 'no-room'}`}
              $active={selectedChat?.id === chat.id && selectedChat?.type === chat.type}
              onClick={() => {
                if (chat.isStandalone && chat.roomId) {
                  // Standalone chat room - select directly
                  setSelectedChat({
                    type: chat.type,
                    id: chat.id,
                    name: chat.name,
                    roomId: chat.roomId
                  });
                } else if (chat.type === 'group') {
                  handleSelectGroup(groupsData.find(g => g.id === chat.id));
                } else {
                  handleSelectContact(contactsData.find(c => c.id === chat.id));
                }
              }}
            >
              <ChatAvatar>
                {chat.type === 'group' ? <FiUsers /> : <FiUser />}
              </ChatAvatar>
              <ChatInfo>
                <ChatName>{chat.name}</ChatName>
                <ChatPreview>{chat.preview}</ChatPreview>
              </ChatInfo>
              <ChatMeta>
                {chat.unread > 0 && <UnreadBadge>{chat.unread}</UnreadBadge>}
                {chat.lastMessage && <ChatTime>{chat.lastMessage}</ChatTime>}
              </ChatMeta>
            </ChatItem>
          ))}
          {filteredChatList.length === 0 && (
            <EmptyState>
              <EmptyIcon>💬</EmptyIcon>
              <div>No chats found</div>
            </EmptyState>
          )}
        </ChatList>
      </Sidebar>

      <ChatArea>
        {selectedChat ? (
          <>
            <ChatHeader>
              <ChatTitle>{selectedChat.name}</ChatTitle>
            </ChatHeader>
            {isSearching && (
              <SearchBar>
                <FiSearch />
                <MessageSearchInput
                  placeholder="Search in messages..."
                  value={messageSearchQuery}
                  onChange={(e) => setMessageSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchMessages();
                    }
                  }}
                />
                <MessageActionButton onClick={handleSearchMessages}>Search</MessageActionButton>
                <MessageActionButton onClick={handleClearSearch}>Clear</MessageActionButton>
              </SearchBar>
            )}
            {!isSearching && (
              <SearchBar>
                <FiSearch style={{ cursor: 'pointer' }} onClick={() => setIsSearching(true)} />
                <MessageSearchInput
                  placeholder="Search messages... (click to search)"
                  readOnly
                  onClick={() => setIsSearching(true)}
                />
              </SearchBar>
            )}
            <MessagesContainer>
              {isSearching && searchResults.length > 0 ? (
                <div style={{ padding: '0.5rem', fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Found {searchResults.length} result(s)
                </div>
              ) : null}
              {(isSearching ? searchResults : messages) && (isSearching ? searchResults : messages).length > 0 ? (
                (isSearching ? searchResults : messages).map((message, idx) => {
                  // Check if message is from current user
                  const currentUserId = user?.id || user?.userId;
                  const senderId = message.sender;
                  // Matrix user IDs are in format @user:domain, so we need to check if it matches
                  const isOwn = senderId && currentUserId && (
                    senderId.includes(currentUserId) || 
                    senderId === currentUserId ||
                    senderId === `@${currentUserId}` ||
                    senderId === `@${currentUserId}:${matrixStatus?.config?.serverName || ''}`
                  );
                  
                  const isEditing = editingMessage?.eventId === message.eventId;
                  const isHovered = hoveredMessage === message.eventId;
                  
                  return (
                    <Message 
                      key={message.eventId || idx} 
                      $isOwn={isOwn}
                      onMouseEnter={() => setHoveredMessage(message.eventId)}
                      onMouseLeave={() => setHoveredMessage(null)}
                    >
                      <MessageAvatar $isOwn={isOwn}>
                        {message.senderName?.[0]?.toUpperCase() || message.sender?.[1]?.toUpperCase() || 'U'}
                      </MessageAvatar>
                      <MessageContent>
                        {!isOwn && (
                          <MessageSender>{message.senderName || message.sender || 'Unknown'}</MessageSender>
                        )}
                        <MessageBubble $isOwn={isOwn}>
                          {message.content}
                          {message.url && (
                            <div style={{ marginTop: '0.5rem' }}>
                              {message.msgtype === 'm.image' ? (
                                <img 
                                  src={message.url} 
                                  alt={message.body || 'Image'} 
                                  style={{ maxWidth: '100%', borderRadius: '8px' }}
                                />
                              ) : (
                                <FilePreview>
                                  <FileIcon><FiImage /></FileIcon>
                                  <FileInfo>
                                    <FileName>{message.body || 'File'}</FileName>
                                    {message.info?.size && (
                                      <FileSize>{(message.info.size / 1024).toFixed(2)} KB</FileSize>
                                    )}
                                  </FileInfo>
                                  <MessageActionButton onClick={() => window.open(message.url, '_blank')}>
                                    Download
                                  </MessageActionButton>
                                </FilePreview>
                              )}
                            </div>
                          )}
                        </MessageBubble>
                        {isHovered && isOwn && message.eventId && (
                          <MessageActions>
                            <MessageActionButton 
                              onClick={() => handleEditMessage(message)}
                              title="Edit message"
                            >
                              <FiEdit2 />
                            </MessageActionButton>
                            <MessageActionButton 
                              onClick={() => handleDeleteMessage(message.eventId)}
                              title="Delete message"
                            >
                              <FiTrash2 />
                            </MessageActionButton>
                            <MessageActionButton 
                              onClick={() => {
                                const emoji = prompt('Enter emoji reaction:', '👍');
                                if (emoji) handleAddReaction(message.eventId, emoji);
                              }}
                              title="Add reaction"
                            >
                              <FiSmile />
                            </MessageActionButton>
                          </MessageActions>
                        )}
                        {!isOwn && message.eventId && (
                          <MessageActions>
                            <MessageActionButton 
                              onClick={() => {
                                const emoji = prompt('Enter emoji reaction:', '👍');
                                if (emoji) handleAddReaction(message.eventId, emoji);
                              }}
                              title="Add reaction"
                            >
                              <FiSmile />
                            </MessageActionButton>
                          </MessageActions>
                        )}
                        <MessageTime>
                          {message.timestamp 
                            ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : message.formattedTime 
                              ? new Date(message.formattedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ''}
                          {isOwn && message.eventId && (
                            <ReadReceiptIndicator>
                              {readReceipts.has(message.eventId) && readReceipts.get(message.eventId).size > 0 ? (
                                <span style={{ color: '#10b981', marginLeft: '0.25rem' }}>✓✓</span>
                              ) : (
                                <span style={{ color: '#9ca3af', marginLeft: '0.25rem' }}>✓</span>
                              )}
                            </ReadReceiptIndicator>
                          )}
                        </MessageTime>
                      </MessageContent>
                    </Message>
                  );
                })
              ) : (
                <EmptyState>
                  <EmptyIcon>💬</EmptyIcon>
                  <div>{isSearching ? 'No search results' : 'No messages yet'}</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', opacity: 0.7 }}>
                    {isSearching ? 'Try a different search term' : 'Start the conversation!'}
                  </div>
                </EmptyState>
              )}
              {typingUsers.size > 0 && (
                <TypingIndicator>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <div style={{ width: '8px', height: '8px', background: '#6b7280', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
                    <div style={{ width: '8px', height: '8px', background: '#6b7280', borderRadius: '50%', animation: 'pulse 1s infinite 0.2s' }} />
                    <div style={{ width: '8px', height: '8px', background: '#6b7280', borderRadius: '50%', animation: 'pulse 1s infinite 0.4s' }} />
                  </div>
                  <span>{Array.from(typingUsers).length} {Array.from(typingUsers).length === 1 ? 'person is' : 'people are'} typing...</span>
                </TypingIndicator>
              )}
              <div ref={messagesEndRef} />
            </MessagesContainer>
            <InputArea>
              {editingMessage ? (
                <>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', padding: '0 0.5rem' }}>
                    Editing message...
                  </div>
                  <MessageInput
                    placeholder="Edit message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit();
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    rows={1}
                    autoFocus
                  />
                  <MessageActionButton onClick={handleSaveEdit} style={{ background: '#10b981', color: 'white', border: 'none' }}>
                    <FiCheckCircle /> Save
                  </MessageActionButton>
                  <MessageActionButton onClick={handleCancelEdit} style={{ background: '#ef4444', color: 'white', border: 'none' }}>
                    <FiX /> Cancel
                  </MessageActionButton>
                </>
              ) : (
                <MessageInput
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                />
              )}
              {userSettings.allowFileSharing && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                    multiple={false}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '0.75rem',
                      background: 'transparent',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#6b7280',
                      transition: 'all 0.2s'
                    }}
                    title="Attach file"
                  >
                    <FiPaperclip />
                  </button>
                </>
              )}
              <SendButton
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sendMessageMutation.isLoading}
              >
                <FiSend />
                Send
              </SendButton>
            </InputArea>
          </>
        ) : (
          <EmptyState>
            <EmptyIcon>💬</EmptyIcon>
            <div>Select a chat to start messaging</div>
          </EmptyState>
        )}
      </ChatArea>

      {/* Create Chat Modal */}
      {showCreateChatModal && (
        <ModalOverlay onClick={() => setShowCreateChatModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Create New Chat</ModalTitle>
              <CloseButton onClick={() => setShowCreateChatModal(false)}>
                <FiX />
              </CloseButton>
            </ModalHeader>

            <ChatTypeSelector>
              <ChatTypeButton
                $active={createChatType === 'direct'}
                onClick={() => {
                  setCreateChatType('direct');
                  setCreateChatMembers([]);
                  setCreateChatName('');
                }}
              >
                <FiUser style={{ marginRight: '0.5rem' }} />
                1:1 Chat
              </ChatTypeButton>
              <ChatTypeButton
                $active={createChatType === 'group'}
                onClick={() => {
                  setCreateChatType('group');
                  setCreateChatMembers([]);
                  setCreateChatName('');
                }}
              >
                <FiUsers style={{ marginRight: '0.5rem' }} />
                Group Chat
              </ChatTypeButton>
            </ChatTypeSelector>

            {createChatType === 'group' && (
              <FormGroup>
                <FormLabel>Group Name</FormLabel>
                <FormInput
                  type="text"
                  placeholder="Enter group name..."
                  value={createChatName}
                  onChange={(e) => setCreateChatName(e.target.value)}
                />
              </FormGroup>
            )}

            <FormGroup>
              <FormLabel>
                {createChatType === 'direct' ? 'Select User' : 'Select Members'}
              </FormLabel>
              <FormInput
                type="text"
                placeholder="Search users..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                style={{ marginBottom: '0.75rem' }}
              />
              <UserList>
                {availableUsers
                  .filter(user => {
                    const query = userSearchQuery.toLowerCase();
                    const name = (user.displayName || user.username || '').toLowerCase();
                    const email = (user.email || '').toLowerCase();
                    return name.includes(query) || email.includes(query);
                  })
                  .map(user => {
                    const isSelected = createChatMembers.some(m => (m.id || m.userId) === (user.id || user.userId));
                    return (
                      <UserItem
                        key={user.id || user.userId}
                        $selected={isSelected}
                        onClick={() => toggleMember(user)}
                      >
                        <UserAvatar>
                          {(user.displayName || user.username || 'U')[0].toUpperCase()}
                        </UserAvatar>
                        <UserInfo>
                          <UserName>{user.displayName || user.username || 'Unknown'}</UserName>
                          {user.email && <UserEmail>{user.email}</UserEmail>}
                        </UserInfo>
                        {isSelected && <FiCheckCircle style={{ color: '#10b981' }} />}
                      </UserItem>
                    );
                  })}
              </UserList>
            </FormGroup>

            {createChatMembers.length > 0 && (
              <FormGroup>
                <FormLabel>Selected {createChatType === 'direct' ? 'User' : 'Members'}</FormLabel>
                <SelectedMembers>
                  {createChatMembers.map(member => (
                    <MemberTag key={member.id || member.userId}>
                      {member.displayName || member.username || 'Unknown'}
                      <RemoveMemberButton
                        onClick={() => {
                          setCreateChatMembers(createChatMembers.filter(m => (m.id || m.userId) !== (member.id || member.userId)));
                        }}
                      >
                        <FiX size={14} />
                      </RemoveMemberButton>
                    </MemberTag>
                  ))}
                </SelectedMembers>
              </FormGroup>
            )}

            <ModalActions>
              <ActionButton
                className="secondary"
                onClick={() => {
                  setShowCreateChatModal(false);
                  setCreateChatName('');
                  setCreateChatMembers([]);
                  setUserSearchQuery('');
                }}
              >
                Cancel
              </ActionButton>
              <ActionButton
                className="primary"
                onClick={handleCreateChat}
                disabled={
                  createChatMutation.isLoading ||
                  (createChatType === 'direct' && createChatMembers.length !== 1) ||
                  (createChatType === 'group' && (!createChatName.trim() || createChatMembers.length === 0))
                }
              >
                {createChatMutation.isLoading ? 'Creating...' : 'Create Chat'}
              </ActionButton>
            </ModalActions>
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default MessagingTab;

