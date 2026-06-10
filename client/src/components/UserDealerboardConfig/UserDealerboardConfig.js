import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { FiX, FiSave, FiGrid, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Select, Input } from '../../styles/GlobalStyle';
import {
  getAssignmentType,
  getAssignmentTypeMeta,
} from '../../utils/dealerboardAssignment';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  margin-bottom: 1rem;
`;

const Tab = styled.button`
  padding: 0.75rem 1.5rem;
  background: ${props => props.$active ? props.theme.colors.surfaceElevated : 'transparent'};
  border: none;
  border-bottom: 2px solid ${props => props.$active ? props.theme.colors.accent : 'transparent'};
  color: ${props => props.$active ? props.theme.colors.accent : props.theme.colors.textSecondary};
  font-weight: ${props => props.$active ? '600' : '400'};
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    color: ${props => props.theme.colors.accent};
  }
`;

const PageSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const ButtonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const ButtonSlot = styled.div`
  aspect-ratio: 1;
  border: 2px solid ${props => {
    if (props.$assigned) return props.$typeBorder || props.theme.colors.accent;
    return props.theme.colors.border;
  }};
  border-left-width: ${props => (props.$assigned && props.$typeBorder ? '4px' : '2px')};
  border-radius: ${props => props.theme.borderRadius.md};
  background: ${props => {
    if (props.$assigned) return props.$typeBg || `${props.theme.colors.accent}15`;
    return props.theme.colors.surfaceElevated;
  }};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0.5rem;
  position: relative;
  
  &:hover {
    border-color: ${props => props.theme.colors.accent};
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.md};
  }
`;

const ButtonNumber = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${props => props.theme.colors.textSecondary};
  margin-bottom: 0.25rem;
`;

const ButtonLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const ButtonType = styled.div`
  font-size: 0.65rem;
  font-weight: 700;
  color: ${props => props.$color || props.theme.colors.textTertiary};
  margin-top: 0.25rem;
  text-transform: uppercase;
`;

const AssignmentModal = styled.div`
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

const AssignmentModalContent = styled.div`
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadius.lg};
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
`;

const FormGroup = styled.div`
  margin-bottom: 1rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.5rem;
`;

const SpeedDialForm = styled.div`
  background: ${props => props.theme.colors.surfaceElevated};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
  padding: 1rem;
  margin-bottom: 1rem;
`;

const SpeedDialList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
`;

const SpeedDialItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.md};
`;

const UserDealerboardConfig = ({ userId, userName, onClose }) => {
  const [activeTab, setActiveTab] = useState('assignments');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedButton, setSelectedButton] = useState(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentType, setAssignmentType] = useState('privateWire');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedSpeedDialId, setSelectedSpeedDialId] = useState('');
  const [newSpeedDial, setNewSpeedDial] = useState({ name: '', number: '', description: '' });
  const [showCreateSpeedDialForm, setShowCreateSpeedDialForm] = useState(false);
  
  const queryClient = useQueryClient();

  // Fetch button assignments
  const { data: assignmentsData } = useQuery(
    ['dealerboard-assignments', userId],
    async () => {
      const res = await api.get(`/api/dealerboard/config/${userId}`);
      return res.data;
    },
    { enabled: !!userId }
  );

  // Fetch available lines
  const { data: privateWiresData } = useQuery(
    'private-wires-available',
    async () => {
      const res = await api.get('/api/dealerboard/private-wires');
      return res.data;
    }
  );

  const { data: ddiLinesData } = useQuery(
    'ddi-lines-available',
    async () => {
      const res = await api.get('/api/dealerboard/ddi-lines');
      return res.data;
    }
  );

  // Fetch user's speed dials
  // Note: API uses token user, so for admin access we need to pass userId in query or modify API
  const { data: speedDialsData } = useQuery(
    ['speed-dials', userId],
    async () => {
      const res = await api.get(`/api/dealerboard/speed-dials?userId=${userId}`);
      return res.data;
    },
    { enabled: !!userId }
  );

  // Convert assignments from nested object to flat array
  const assignments = useMemo(() => {
    if (!assignmentsData?.assignments) return [];
    const flat = [];
    Object.keys(assignmentsData.assignments).forEach(pageNum => {
      Object.keys(assignmentsData.assignments[pageNum]).forEach(buttonNum => {
        flat.push({
          pageNumber: parseInt(pageNum),
          buttonNumber: parseInt(buttonNum),
          ...assignmentsData.assignments[pageNum][buttonNum]
        });
      });
    });
    return flat;
  }, [assignmentsData]);
  const privateWires = privateWiresData?.wires || [];
  const ddiLines = ddiLinesData?.lines || [];
  const speedDials = speedDialsData?.speedDials || [];

  // Create/Update assignment mutation
  const saveAssignmentMutation = useMutation(
    async ({ pageNumber, buttonNumber, assignmentType, lineId, ddiLineId, speedDialId }) => {
      const res = await api.post('/api/dealerboard/assignments', {
        pageNumber,
        buttonNumber,
        assignmentType,
        lineId,
        ddiLineId,
        speedDialId,
        targetUserId: userId // Pass userId for admin access
      });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['dealerboard-assignments', userId]);
        setShowAssignmentModal(false);
        setSelectedButton(null);
        toast.success('Button assignment saved');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to save assignment');
      }
    }
  );

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation(
    async ({ pageNumber, buttonNumber }) => {
      await api.delete(`/api/dealerboard/assignments/${pageNumber}/${buttonNumber}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['dealerboard-assignments', userId]);
        toast.success('Assignment removed');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to remove assignment');
      }
    }
  );

  // Create speed dial mutation
  const createSpeedDialMutation = useMutation(
    async (speedDialData) => {
      const res = await api.post('/api/dealerboard/speed-dials', {
        ...speedDialData,
        userId // Pass userId for admin access
      });
      return res.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries(['speed-dials', userId]);
        const newSpeedDialId = data.speedDial?.id || data.id;
        
        // If creating from assignment modal, auto-select the new speed dial
        if (showAssignmentModal && showCreateSpeedDialForm && newSpeedDialId) {
          setSelectedSpeedDialId(newSpeedDialId);
          setShowCreateSpeedDialForm(false);
        }
        
        setNewSpeedDial({ name: '', number: '', description: '' });
        toast.success('Speed dial created');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to create speed dial');
      }
    }
  );

  // Delete speed dial mutation
  const deleteSpeedDialMutation = useMutation(
    async (speedDialId) => {
      await api.delete(`/api/dealerboard/speed-dials/${speedDialId}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['speed-dials', userId]);
        toast.success('Speed dial deleted');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to delete speed dial');
      }
    }
  );

  const getButtonAssignment = (pageNumber, buttonNumber) => {
    return assignments.find(a => a.pageNumber === pageNumber && a.buttonNumber === buttonNumber);
  };

  const handleButtonClick = (buttonNumber) => {
    setSelectedButton({ page: currentPage, button: buttonNumber });
    setShowAssignmentModal(true);
    setShowCreateSpeedDialForm(false);
    const existing = getButtonAssignment(currentPage, buttonNumber);
    if (existing) {
      setAssignmentType(existing.assignmentType);
      setSelectedLineId(existing.lineId || existing.ddiLineId || '');
      setSelectedSpeedDialId(existing.speedDialId || '');
    } else {
      setAssignmentType('privateWire');
      setSelectedLineId('');
      setSelectedSpeedDialId('');
    }
  };

  const handleSaveAssignment = () => {
    if (assignmentType === 'speedDial' && !selectedSpeedDialId) {
      toast.error('Please select a speed dial');
      return;
    }
    if (assignmentType === 'privateWire' && !selectedLineId) {
      toast.error('Please select a private wire');
      return;
    }
    if (assignmentType === 'ddiLine' && !selectedLineId) {
      toast.error('Please select a DDI line');
      return;
    }

    saveAssignmentMutation.mutate({
      pageNumber: currentPage,
      buttonNumber: selectedButton.button,
      assignmentType,
      lineId: assignmentType === 'privateWire' ? selectedLineId : null,
      ddiLineId: assignmentType === 'ddiLine' ? selectedLineId : null,
      speedDialId: assignmentType === 'speedDial' ? selectedSpeedDialId : null
    });
  };

  const handleRemoveAssignment = (pageNumber, buttonNumber) => {
    if (window.confirm('Remove assignment from this button?')) {
      deleteAssignmentMutation.mutate({ pageNumber, buttonNumber });
    }
  };

  const handleCreateSpeedDial = () => {
    if (!newSpeedDial.name || !newSpeedDial.number) {
      toast.error('Name and number are required');
      return;
    }
    createSpeedDialMutation.mutate(newSpeedDial);
  };

  const getAssignmentDisplay = (assignment) => {
    if (!assignment) return { label: '', meta: null };
    const type = getAssignmentType(assignment);
    const meta = getAssignmentTypeMeta(assignment);
    let label = '';
    if (type === 'privateWire') {
      label = privateWires.find(w => w.id === assignment.lineId)?.lineLabel || 'Private Wire';
    } else if (type === 'ddiLine') {
      label = ddiLines.find(l => l.id === assignment.ddiLineId)?.lineName || 'DDI Line';
    } else if (type === 'speedDial') {
      label = assignment.metadata?.label
        || speedDials.find(s => s.id === assignment.speedDialId)?.name
        || 'Speed Dial';
    }
    return { label, meta };
  };

  const renderButtonGrid = () => {
    const buttons = [];
    for (let i = 1; i <= 28; i++) {
      const assignment = getButtonAssignment(currentPage, i);
      const { label, meta } = getAssignmentDisplay(assignment);
      buttons.push(
        <ButtonSlot
          key={i}
          $assigned={!!assignment}
          $typeBorder={meta?.border}
          $typeBg={meta?.bg}
          onClick={() => handleButtonClick(i)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (assignment) {
              handleRemoveAssignment(currentPage, i);
            }
          }}
        >
          <ButtonNumber>#{i}</ButtonNumber>
          {assignment ? (
            <>
              <ButtonLabel>{label}</ButtonLabel>
              {meta && (
                <ButtonType $color={meta.color}>{meta.short}</ButtonType>
              )}
            </>
          ) : (
            <ButtonLabel style={{ color: '#999', fontStyle: 'italic' }}>Empty</ButtonLabel>
          )}
        </ButtonSlot>
      );
    }
    return buttons;
  };

  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '1200px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ModalHeader>
          <h3>Dealerboard Configuration - {userName}</h3>
          <Button variant="secondary" onClick={onClose}>
            <FiX />
          </Button>
        </ModalHeader>
        <ModalBody style={{ flex: 1, overflow: 'auto' }}>
          <Container>
            <TabsContainer>
              <Tab $active={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')}>
                <FiGrid />
                Button Assignments
              </Tab>
              <Tab $active={activeTab === 'speedDials'} onClick={() => setActiveTab('speedDials')}>
                Speed Dials
              </Tab>
            </TabsContainer>

            {activeTab === 'assignments' && (
              <>
                <PageSelector>
                  <Label>Page:</Label>
                  <Select
                    value={currentPage}
                    onChange={(e) => setCurrentPage(parseInt(e.target.value))}
                    style={{ width: '100px' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => (
                      <option key={p} value={p}>Page {p}</option>
                    ))}
                  </Select>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    Click a button to assign, right-click to remove
                  </div>
                </PageSelector>

                <ButtonGrid>
                  {renderButtonGrid()}
                </ButtonGrid>
              </>
            )}

            {activeTab === 'speedDials' && (
              <>
                <SpeedDialForm>
                  <h4 style={{ marginTop: 0 }}>Create Speed Dial</h4>
                  <FormGroup>
                    <Label>Name *</Label>
                    <Input
                      value={newSpeedDial.name}
                      onChange={(e) => setNewSpeedDial({ ...newSpeedDial, name: e.target.value })}
                      placeholder="Contact Name"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Number *</Label>
                    <Input
                      value={newSpeedDial.number}
                      onChange={(e) => setNewSpeedDial({ ...newSpeedDial, number: e.target.value })}
                      placeholder="Phone Number"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Description</Label>
                    <Input
                      value={newSpeedDial.description}
                      onChange={(e) => setNewSpeedDial({ ...newSpeedDial, description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </FormGroup>
                  <Button variant="primary" onClick={handleCreateSpeedDial}>
                    <FiPlus />
                    Create Speed Dial
                  </Button>
                </SpeedDialForm>

                <SpeedDialList>
                  {speedDials.map(sd => (
                    <SpeedDialItem key={sd.id}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{sd.name}</div>
                        <div style={{ fontSize: '0.875rem', color: '#666' }}>{sd.number}</div>
                        {sd.description && (
                          <div style={{ fontSize: '0.75rem', color: '#999' }}>{sd.description}</div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => deleteSpeedDialMutation.mutate(sd.id)}
                      >
                        <FiTrash2 />
                      </Button>
                    </SpeedDialItem>
                  ))}
                </SpeedDialList>
              </>
            )}
          </Container>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>

      {/* Assignment Modal */}
      {showAssignmentModal && selectedButton && (
        <AssignmentModal onClick={() => setShowAssignmentModal(false)}>
          <AssignmentModalContent onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4>Assign Button #{selectedButton.button} (Page {currentPage})</h4>
              <Button variant="secondary" size="sm" onClick={() => setShowAssignmentModal(false)}>
                <FiX />
              </Button>
            </div>

            <FormGroup>
              <Label>Assignment Type</Label>
              <Select
                value={assignmentType}
                onChange={(e) => {
                  setAssignmentType(e.target.value);
                  setSelectedLineId('');
                  setSelectedSpeedDialId('');
                  setShowCreateSpeedDialForm(false);
                  setNewSpeedDial({ name: '', number: '', description: '' });
                }}
              >
                <option value="privateWire">Private Wire</option>
                <option value="ddiLine">DDI Line</option>
                <option value="speedDial">Speed Dial</option>
              </Select>
            </FormGroup>

            {assignmentType === 'privateWire' && (
              <FormGroup>
                <Label>Private Wire</Label>
                <Select
                  value={selectedLineId}
                  onChange={(e) => setSelectedLineId(e.target.value)}
                >
                  <option value="">Select a private wire...</option>
                  {privateWires.filter(w => w.isActive).map(wire => (
                    <option key={wire.id} value={wire.id}>
                      {wire.lineLabel} ({wire.mode})
                    </option>
                  ))}
                </Select>
              </FormGroup>
            )}

            {assignmentType === 'ddiLine' && (
              <FormGroup>
                <Label>DDI Line</Label>
                <Select
                  value={selectedLineId}
                  onChange={(e) => setSelectedLineId(e.target.value)}
                >
                  <option value="">Select a DDI line...</option>
                  {ddiLines.filter(l => l.isActive).map(line => (
                    <option key={line.id} value={line.id}>
                      {line.lineName} ({line.lineNumber})
                    </option>
                  ))}
                </Select>
              </FormGroup>
            )}

            {assignmentType === 'speedDial' && (
              <>
                {!showCreateSpeedDialForm ? (
                  <FormGroup>
                    <Label>Speed Dial</Label>
                    <Select
                      value={selectedSpeedDialId}
                      onChange={(e) => {
                        if (e.target.value === 'create-new') {
                          setShowCreateSpeedDialForm(true);
                          setSelectedSpeedDialId('');
                        } else {
                          setSelectedSpeedDialId(e.target.value);
                        }
                      }}
                    >
                      <option value="">Select a speed dial...</option>
                      <option value="create-new">➕ Create New Speed Dial</option>
                      {speedDials.map(sd => (
                        <option key={sd.id} value={sd.id}>
                          {sd.name} ({sd.number})
                        </option>
                      ))}
                    </Select>
                  </FormGroup>
                ) : (
                  <FormGroup>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <Label>Create New Speed Dial</Label>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setShowCreateSpeedDialForm(false);
                          setNewSpeedDial({ name: '', number: '', description: '' });
                        }}
                      >
                        <FiX /> Cancel
                      </Button>
                    </div>
                    <FormGroup>
                      <Label>Name *</Label>
                      <Input
                        value={newSpeedDial.name}
                        onChange={(e) => setNewSpeedDial({ ...newSpeedDial, name: e.target.value })}
                        placeholder="Contact Name"
                        autoFocus
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Number *</Label>
                      <Input
                        value={newSpeedDial.number}
                        onChange={(e) => setNewSpeedDial({ ...newSpeedDial, number: e.target.value })}
                        placeholder="Phone Number"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Description</Label>
                      <Input
                        value={newSpeedDial.description}
                        onChange={(e) => setNewSpeedDial({ ...newSpeedDial, description: e.target.value })}
                        placeholder="Optional description"
                      />
                    </FormGroup>
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (!newSpeedDial.name || !newSpeedDial.number) {
                          toast.error('Name and number are required');
                          return;
                        }
                        createSpeedDialMutation.mutate(newSpeedDial);
                      }}
                      disabled={createSpeedDialMutation.isLoading}
                    >
                      <FiPlus />
                      {createSpeedDialMutation.isLoading ? 'Creating...' : 'Create & Select'}
                    </Button>
                  </FormGroup>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setShowAssignmentModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveAssignment}>
                <FiSave />
                Save Assignment
              </Button>
            </div>
          </AssignmentModalContent>
        </AssignmentModal>
      )}
    </Modal>
  );
};

export default UserDealerboardConfig;

