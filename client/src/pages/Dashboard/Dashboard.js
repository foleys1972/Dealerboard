import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { 
  FiUsers, 
  FiMic, 
  FiActivity, 
  FiPlus, 
  FiSearch,
  FiFilter,
  FiPlay,
  FiPause,
  FiSquare,
  FiVolume2,
  FiVolumeX,
  FiSettings,
  FiClock,
  FiUser,
  FiUserCheck,
  FiUserX,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertCircle,
  FiCheckCircle,
  FiX
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuthStore } from '../../stores/authStore';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useSocket } from '../../hooks/useSocket';
import { 
  Card, 
  Button, 
  Input, 
  Select, 
  Badge, 
  Flex, 
  Grid, 
  Spacer,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  LoadingSpinner
} from '../../styles/GlobalStyle';
import AudioVisualizer from '../../components/AudioVisualizer/AudioVisualizer';
import ParticipantList from '../../components/ParticipantList/ParticipantList';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { format, formatDistanceToNow } from 'date-fns';

const DashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.lg};
  height: 100%;
`;

const DashboardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const DashboardTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const DashboardActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const StatsGrid = styled(Grid)`
  margin-bottom: ${props => props.theme.spacing.xl};
`;

const StatCard = styled(Card)`
  text-align: center;
  padding: ${props => props.theme.spacing.lg};
  background: ${props => props.variant === 'primary' ? props.theme.colors.primary : props.theme.colors.surface};
  color: ${props => props.variant === 'primary' ? 'white' : props.theme.colors.text};
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.lg};
  }
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatIcon = styled.div`
  font-size: 2rem;
  margin-bottom: ${props => props.theme.spacing.sm};
  opacity: 0.8;
`;

const StatTrend = styled.div`
  font-size: 0.75rem;
  margin-top: ${props => props.theme.spacing.sm};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
`;

const ContentGrid = styled(Grid)`
  flex: 1;
  gap: ${props => props.theme.spacing.lg};
`;

const GroupsSection = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const SectionActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const SearchContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.lg};
  align-items: center;
`;

const FilterContainer = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
  align-items: center;
`;

const GroupsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.md};
`;

const GroupCard = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
  transition: all 0.2s ease;
  cursor: pointer;
  border: 1px solid ${props => props.theme.colors.border};

  &:hover {
    box-shadow: ${props => props.theme.shadows.md};
    transform: translateY(-2px);
  }
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${props => props.theme.spacing.md};
`;

const GroupName = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
`;

const GroupStatus = styled(Badge)`
  font-size: 0.75rem;
`;

const GroupInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const GroupDetail = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const GroupDetailIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const GroupActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.sm};
`;

const GroupActionButton = styled(Button)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};
  font-size: 0.875rem;
`;

const ActiveGroupsSection = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
`;

const ActiveGroupItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const ActiveGroupInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ActiveGroupName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.875rem;
`;

const ActiveGroupStatus = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
`;

const ActiveGroupActions = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.xs};
`;

const ActiveGroupButton = styled(Button)`
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
`;

const RecentActivitySection = styled(Card)`
  padding: ${props => props.theme.spacing.lg};
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
`;

const ActivityItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.sm};
  padding: ${props => props.theme.spacing.sm};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => props.theme.colors.background};
`;

const ActivityIcon = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.colors.accent};
`;

const ActivityContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ActivityText = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ActivityTime = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textSecondary};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.theme.spacing.xl};
  color: ${props => props.theme.colors.textSecondary};
  text-align: center;
`;

const EmptyIcon = styled.div`
  font-size: 3rem;
  margin-bottom: ${props => props.theme.spacing.md};
  opacity: 0.5;
`;

const EmptyText = styled.div`
  font-size: 0.875rem;
  margin-bottom: ${props => props.theme.spacing.sm};
`;

const EmptySubtext = styled.div`
  font-size: 0.75rem;
  opacity: 0.7;
`;

const Dashboard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  
  const { user } = useAuthStore();
  const { isConnected, isSpeaking, isMuted, audioLevel } = useWebRTC();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  // Fetch user's groups
  const { data: userGroups, isLoading: groupsLoading } = useQuery(
    ['user-groups', user?.id],
    async () => {
      const response = await api.get(`/api/groups?userId=${user?.id}`);
      return response.data;
    }
  );

  // Fetch all groups
  const { data: allGroups, isLoading: allGroupsLoading } = useQuery(
    ['all-groups', searchTerm, filterType],
    async () => {
      const response = await api.get('/api/groups', {
        params: { search: searchTerm, type: filterType }
      });
      return response.data;
    }
  );

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery(
    'dashboard-stats',
    async () => {
      const response = await api.get('/api/groups/stats/all');
      return response.data;
    }
  );

  // Join group mutation
  const joinGroupMutation = useMutation(
    async (groupId) => {
      const response = await api.post(`/api/groups/${groupId}/join`, {
        userId: user?.id,
        userData: user,
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('user-groups');
        toast.success(`Joined group: ${data.groupInfo.name}`);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to join group');
      }
    }
  );

  // Leave group mutation
  const leaveGroupMutation = useMutation(
    async (groupId) => {
      const response = await api.post(`/api/groups/${groupId}/leave`, {
        userId: user?.id,
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('user-groups');
        toast.success('Left group successfully');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to leave group');
      }
    }
  );

  // Create group mutation
  const createGroupMutation = useMutation(
    async (groupData) => {
      const response = await api.post('/api/groups', {
        ...groupData,
        createdBy: user?.id,
      });
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('user-groups');
        queryClient.invalidateQueries('all-groups');
        toast.success(`Group created: ${data.group.name}`);
        setShowCreateGroup(false);
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create group');
      }
    }
  );

  const handleJoinGroup = (groupId) => {
    joinGroupMutation.mutate(groupId);
  };

  const handleLeaveGroup = (groupId) => {
    leaveGroupMutation.mutate(groupId);
  };

  const handleCreateGroup = (groupData) => {
    createGroupMutation.mutate(groupData);
  };

  if (statsLoading || groupsLoading) {
    return (
      <DashboardContainer>
        <Flex justify="center" align="center" style={{ height: '400px' }}>
          <LoadingSpinner size="48px" />
        </Flex>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer>
      <DashboardHeader>
        <DashboardTitle>
          <FiActivity />
          TradeCom Dashboard
        </DashboardTitle>
        <DashboardActions>
          <Button variant="secondary" onClick={() => queryClient.invalidateQueries()}>
            <FiActivity />
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setShowCreateGroup(true)}>
            <FiPlus />
            Create Group
          </Button>
        </DashboardActions>
      </DashboardHeader>

      {/* Stats Grid */}
      <StatsGrid columns={4}>
        <StatCard variant="primary">
          <StatIcon>
            <FiUsers />
          </StatIcon>
          <StatValue>{stats?.groups?.length || 0}</StatValue>
          <StatLabel>Active Groups</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +12% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiUser />
          </StatIcon>
          <StatValue>{stats?.groups?.reduce((sum, group) => sum + group.participantCount, 0) || 0}</StatValue>
          <StatLabel>Total Participants</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +8% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiMic />
          </StatIcon>
          <StatValue>{stats?.groups?.filter(group => group.currentSpeaker).length || 0}</StatValue>
          <StatLabel>Speaking Now</StatLabel>
          <StatTrend>
            <FiTrendingDown />
            -3% this week
          </StatTrend>
        </StatCard>
        
        <StatCard>
          <StatIcon>
            <FiActivity />
          </StatIcon>
          <StatValue>{stats?.groups?.filter(group => group.hasRecording).length || 0}</StatValue>
          <StatLabel>Recording</StatLabel>
          <StatTrend>
            <FiTrendingUp />
            +5% this week
          </StatTrend>
        </StatCard>
      </StatsGrid>

      <ContentGrid columns={2}>
        {/* Groups Section */}
        <GroupsSection>
          <SectionHeader>
            <SectionTitle>
              <FiUsers />
              Available Groups
            </SectionTitle>
            <SectionActions>
              <Button variant="secondary" size="sm">
                <FiFilter />
                Filter
              </Button>
            </SectionActions>
          </SectionHeader>

          <SearchContainer>
            <Input
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1 }}
            />
            <FilterContainer>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="trading">Trading</option>
                <option value="compliance">Compliance</option>
                <option value="admin">Admin</option>
                <option value="broadcast">Broadcast</option>
              </Select>
            </FilterContainer>
          </SearchContainer>

          <GroupsList>
            {allGroupsLoading ? (
              <Flex justify="center" align="center" style={{ height: '200px' }}>
                <LoadingSpinner />
              </Flex>
            ) : allGroups?.length > 0 ? (
              allGroups.map((group) => (
                <GroupCard key={group.id}>
                  <GroupHeader>
                    <GroupName>
                      <FiUsers />
                      {group.name}
                    </GroupName>
                    <GroupStatus variant={group.isActive ? 'success' : 'warning'}>
                      {group.isActive ? 'Active' : 'Inactive'}
                    </GroupStatus>
                  </GroupHeader>

                  <GroupInfo>
                    <GroupDetail>
                      <GroupDetailIcon>
                        <FiUser />
                      </GroupDetailIcon>
                      <span>{group.participants?.length || 0} participants</span>
                    </GroupDetail>
                    
                    <GroupDetail>
                      <GroupDetailIcon>
                        <FiActivity />
                      </GroupDetailIcon>
                      <span>Type: {group.type}</span>
                    </GroupDetail>
                    
                    <GroupDetail>
                      <GroupDetailIcon>
                        <FiClock />
                      </GroupDetailIcon>
                      <span>Created {formatDistanceToNow(new Date(group.createdAt))} ago</span>
                    </GroupDetail>
                  </GroupInfo>

                  <GroupActions>
                    <GroupActionButton
                      variant="primary"
                      onClick={() => handleJoinGroup(group.id)}
                      disabled={joinGroupMutation.isLoading}
                    >
                      <FiPlay />
                      Join
                    </GroupActionButton>
                    
                    <GroupActionButton
                      variant="secondary"
                      onClick={() => setSelectedGroup(group)}
                    >
                      <FiSettings />
                      Details
                    </GroupActionButton>
                  </GroupActions>
                </GroupCard>
              ))
            ) : (
              <EmptyState>
                <EmptyIcon>
                  <FiUsers />
                </EmptyIcon>
                <EmptyText>No groups available</EmptyText>
                <EmptySubtext>Create a new group to get started</EmptySubtext>
              </EmptyState>
            )}
          </GroupsList>
        </GroupsSection>

        {/* Active Groups Section */}
        <ActiveGroupsSection>
          <SectionHeader>
            <SectionTitle>
              <FiActivity />
              My Groups
            </SectionTitle>
          </SectionHeader>

          {userGroups?.length > 0 ? (
            userGroups.map((group) => (
              <ActiveGroupItem key={group.id}>
                <ActiveGroupInfo>
                  <ActiveGroupName>{group.name}</ActiveGroupName>
                  <ActiveGroupStatus>
                    <FiUsers />
                    {group.participants?.length || 0} participants
                    {group.currentSpeaker && (
                      <>
                        <FiMic />
                        Speaking
                      </>
                    )}
                  </ActiveGroupStatus>
                </ActiveGroupInfo>
                
                <ActiveGroupActions>
                  <ActiveGroupButton
                    variant="primary"
                    onClick={() => window.location.href = `/intercom/${group.id}`}
                  >
                    <FiPlay />
                  </ActiveGroupButton>
                  
                  <ActiveGroupButton
                    variant="secondary"
                    onClick={() => handleLeaveGroup(group.id)}
                  >
                    <FiUserX />
                  </ActiveGroupButton>
                </ActiveGroupActions>
              </ActiveGroupItem>
            ))
          ) : (
            <EmptyState>
              <EmptyIcon>
                <FiUsers />
              </EmptyIcon>
              <EmptyText>No active groups</EmptyText>
              <EmptySubtext>Join a group to start communicating</EmptySubtext>
            </EmptyState>
          )}
        </ActiveGroupsSection>
      </ContentGrid>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <CreateGroupModal
          onSubmit={handleCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          isLoading={createGroupMutation.isLoading}
        />
      )}
    </DashboardContainer>
  );
};

// Create Group Modal Component
const CreateGroupModal = ({ onSubmit, onClose, isLoading }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'trading',
    isPublic: false,
    maxParticipants: 200,
    allowRecording: true,
    pushToTalk: false,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <Modal>
      <ModalContent>
        <ModalHeader>
          <h3>Create New Group</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Group Name</label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label>Description</label>
                <Input
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label>Type</label>
                <Select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                >
                  <option value="trading">Trading</option>
                  <option value="compliance">Compliance</option>
                  <option value="admin">Admin</option>
                  <option value="broadcast">Broadcast</option>
                </Select>
              </div>
              <div>
                <label>Max Participants</label>
                <Input
                  name="maxParticipants"
                  type="number"
                  value={formData.maxParticipants}
                  onChange={handleChange}
                  min="2"
                  max="500"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="isPublic"
                  checked={formData.isPublic}
                  onChange={handleChange}
                />
                <label>Public Group</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="allowRecording"
                  checked={formData.allowRecording}
                  onChange={handleChange}
                />
                <label>Allow Recording</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  name="pushToTalk"
                  checked={formData.pushToTalk}
                  onChange={handleChange}
                />
                <label>Push to Talk</label>
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner size="16px" /> : null}
            Create Group
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default Dashboard;
