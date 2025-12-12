import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { 
  FiMessageSquare, 
  FiSearch,
  FiDownload,
  FiFilter,
  FiCalendar,
  FiUsers,
  FiUser
} from 'react-icons/fi';
import { useQuery } from 'react-query';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { format } from 'date-fns';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Controls = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  padding: 0.5rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  min-width: 250px;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const DateInput = styled.input`
  padding: 0.5rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Select = styled.select`
  padding: 0.5rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  background: white;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: ${props => props.$variant === 'primary' ? '#667eea' : '#f3f4f6'};
  color: ${props => props.$variant === 'primary' ? 'white' : '#1f2937'};
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.$variant === 'primary' ? '#5568d3' : '#e5e7eb'};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RoomList = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
  height: 600px;
`;

const RoomSidebar = styled.div`
  background: white;
  border-radius: 12px;
  padding: 1rem;
  overflow-y: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
`;

const RoomItem = styled.div`
  padding: 1rem;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 0.5rem;
  background: ${props => props.$active ? '#f0f4ff' : 'transparent'};
  border: 2px solid ${props => props.$active ? '#667eea' : 'transparent'};
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.$active ? '#f0f4ff' : '#f9fafb'};
  }
`;

const RoomName = styled.div`
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.25rem;
`;

const RoomMeta = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MessagesContainer = styled.div`
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  overflow-y: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
`;

const MessagesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e5e7eb;
`;

const MessagesList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Message = styled.div`
  padding: 1rem;
  border-radius: 8px;
  background: ${props => props.$isOwn ? '#f0f4ff' : '#f9fafb'};
  border-left: 3px solid ${props => props.$isOwn ? '#667eea' : '#9ca3af'};
`;

const MessageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const MessageSender = styled.div`
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MessageTime = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
`;

const MessageContent = styled.div`
  color: #374151;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #667eea;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => {
    if (props.$type === 'group') return '#dbeafe';
    if (props.$type === 'direct') return '#f3e8ff';
    return '#f3f4f6';
  }};
  color: ${props => {
    if (props.$type === 'group') return '#1e40af';
    if (props.$type === 'direct') return '#6b21a8';
    return '#374151';
  }};
`;

const MatrixMessagesPanel = () => {
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);

  // Fetch compliance status (room list)
  const { data: complianceStatus, isLoading: statusLoading } = useQuery(
    'matrix-compliance-status',
    async () => {
      const response = await api.get('/api/matrix/compliance/status');
      return response.data;
    },
    { refetchInterval: 30000 }
  );

  // Fetch Matrix status for user ID matching
  const { data: matrixStatus } = useQuery(
    'matrix-status',
    async () => {
      const response = await api.get('/api/matrix/status');
      return response.data;
    }
  );

  // Get current user
  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await api.get('/api/auth/me');
        if (response.data?.user) {
          // Construct Matrix user ID
          const username = response.data.user.username;
          const serverName = matrixStatus?.serverName || 'trading-intercom.local';
          setCurrentUserId(`@${username}:${serverName}`);
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
    if (matrixStatus) {
      loadUser();
    }
  }, [matrixStatus]);

  // Fetch messages for selected room
  const { data: messagesData, isLoading: messagesLoading } = useQuery(
    ['matrix-messages', selectedRoomId],
    async () => {
      if (!selectedRoomId) return { messages: [] };
      const response = await api.get(`/api/matrix/room/${selectedRoomId}/messages`);
      return response.data;
    },
    { enabled: !!selectedRoomId, refetchInterval: 10000 }
  );

  // Filter rooms by search query
  const filteredRooms = useMemo(() => {
    if (!complianceStatus?.rooms) return [];
    const rooms = complianceStatus.rooms;
    if (!searchQuery) return rooms;
    return rooms.filter(room => 
      room.roomName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.roomId?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [complianceStatus?.rooms, searchQuery]);

  // Filter messages by date
  const filteredMessages = useMemo(() => {
    if (!messagesData?.messages) return [];
    let messages = messagesData.messages;
    
    const now = new Date();
    let start = null;
    let end = now;

    if (dateFilter === 'today') {
      start = new Date(now.setHours(0, 0, 0, 0));
    } else if (dateFilter === 'week') {
      start = new Date(now.setDate(now.getDate() - 7));
    } else if (dateFilter === 'month') {
      start = new Date(now.setMonth(now.getMonth() - 1));
    } else if (dateFilter === 'custom') {
      if (startDate) start = new Date(startDate);
      if (endDate) end = new Date(endDate);
    }

    if (start) {
      messages = messages.filter(msg => {
        const msgTime = msg.timestamp || 0;
        return msgTime >= start.getTime() && msgTime <= end.getTime();
      });
    }

    return messages;
  }, [messagesData?.messages, dateFilter, startDate, endDate]);

  // Handle export
  const handleExport = async (format = 'json') => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      
      if (dateFilter === 'custom' && startDate) {
        params.append('startDate', startDate);
      }
      if (dateFilter === 'custom' && endDate) {
        params.append('endDate', endDate);
      }
      if (selectedRoomId) {
        params.append('roomIds', selectedRoomId);
      }

      const response = await api.get(`/api/matrix/compliance/export?${params.toString()}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matrix-messages-export-${Date.now()}.${format === 'csv' ? 'csv' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Messages exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export messages');
    }
  };

  // Select first room by default
  React.useEffect(() => {
    if (!selectedRoomId && filteredRooms.length > 0) {
      setSelectedRoomId(filteredRooms[0].roomId);
    }
  }, [filteredRooms, selectedRoomId]);

  const selectedRoom = filteredRooms.find(r => r.roomId === selectedRoomId);

  return (
    <Container>
      <Header>
        <Title>
          <FiMessageSquare />
          Matrix Messages
        </Title>
        <Controls>
          <Button onClick={() => handleExport('json')} disabled={!selectedRoomId}>
            <FiDownload />
            Export JSON
          </Button>
          <Button onClick={() => handleExport('csv')} disabled={!selectedRoomId}>
            <FiDownload />
            Export CSV
          </Button>
        </Controls>
      </Header>

      <Controls>
        <SearchInput
          type="text"
          placeholder="Search rooms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </Select>
        {dateFilter === 'custom' && (
          <>
            <DateInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start Date"
            />
            <DateInput
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End Date"
            />
          </>
        )}
      </Controls>

      <RoomList>
        <RoomSidebar>
          {statusLoading ? (
            <LoadingSpinner>Loading rooms...</LoadingSpinner>
          ) : filteredRooms.length === 0 ? (
            <EmptyState>No rooms found</EmptyState>
          ) : (
            filteredRooms.map(room => (
              <RoomItem
                key={room.roomId}
                $active={room.roomId === selectedRoomId}
                onClick={() => setSelectedRoomId(room.roomId)}
              >
                <RoomName>{room.roomName || 'Unnamed Room'}</RoomName>
                <RoomMeta>
                  <Badge $type={room.roomType}>
                    {room.roomType === 'group' ? <FiUsers size={12} /> : <FiUser size={12} />}
                    {room.roomType}
                  </Badge>
                  <span>{room.messageCount || 0} messages</span>
                </RoomMeta>
              </RoomItem>
            ))
          )}
        </RoomSidebar>

        <MessagesContainer>
          {!selectedRoomId ? (
            <EmptyState>
              <FiMessageSquare size={48} />
              <p>Select a room to view messages</p>
            </EmptyState>
          ) : messagesLoading ? (
            <LoadingSpinner>Loading messages...</LoadingSpinner>
          ) : filteredMessages.length === 0 ? (
            <EmptyState>
              <FiMessageSquare size={48} />
              <p>No messages found</p>
            </EmptyState>
          ) : (
            <>
              <MessagesHeader>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1.125rem', color: '#1f2937' }}>
                    {selectedRoom?.roomName || 'Unnamed Room'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </MessagesHeader>
              <MessagesList>
                {filteredMessages.map((message) => {
                  const isOwn = currentUserId && (
                    message.sender === currentUserId ||
                    message.sender?.includes(currentUserId.split(':')[0])
                  );
                  
                  return (
                    <Message key={message.eventId} $isOwn={isOwn}>
                      <MessageHeader>
                        <MessageSender>
                          {isOwn ? 'You' : (message.senderName || message.sender || 'Unknown')}
                        </MessageSender>
                        <MessageTime>
                          {message.formattedTime 
                            ? format(new Date(message.formattedTime), 'MMM d, yyyy HH:mm:ss')
                            : message.timestamp 
                            ? format(new Date(message.timestamp), 'MMM d, yyyy HH:mm:ss')
                            : 'Unknown time'}
                        </MessageTime>
                      </MessageHeader>
                      <MessageContent>{message.content || '(No content)'}</MessageContent>
                    </Message>
                  );
                })}
              </MessagesList>
            </>
          )}
        </MessagesContainer>
      </RoomList>
    </Container>
  );
};

export default MatrixMessagesPanel;

