import React from 'react';
import styled from 'styled-components';
import UserIntercom from '../UserIntercom/UserIntercom';

const VoiceTabContainer = styled.div`
  height: 100%;
  overflow: hidden;
`;

const VoiceTab = () => {
  return (
    <VoiceTabContainer>
      <UserIntercom embedded />
    </VoiceTabContainer>
  );
};

export default VoiceTab;
