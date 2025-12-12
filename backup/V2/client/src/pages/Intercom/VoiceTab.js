import React from 'react';
import styled from 'styled-components';
import UserIntercom from '../UserIntercom/UserIntercom';

// Hide the header from UserIntercom when used in tab
const VoiceTabContainer = styled.div`
  height: 100%;
  overflow: hidden;
  
  /* Hide UserIntercom header when in tab mode */
  > div > header:first-child {
    display: none;
  }
`;

const VoiceTab = () => {
  return (
    <VoiceTabContainer>
      <UserIntercom />
    </VoiceTabContainer>
  );
};

export default VoiceTab;

