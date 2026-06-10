import React from 'react';
import styled from 'styled-components';
import AppSwitcher from '../AppSwitcher/AppSwitcher';
import { PRODUCT_NAME } from '../../config/brand';

const Wrapper = styled.div`
  min-height: 100vh;
  background: ${props => props.theme.colors.background};
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: rgba(21, 21, 32, 0.8);
  backdrop-filter: blur(10px);
  gap: 1rem;
  flex-wrap: wrap;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    padding: 0.75rem 1rem;
  }
`;

const Logo = styled.div`
  font-size: 1.25rem;
  font-weight: 700;
  background: ${props => props.theme.colors.gradient};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex-shrink: 0;
`;

const Content = styled.main`
  flex: 1;
  padding: 2rem;
  overflow-y: auto;

  @media (max-width: ${props => props.theme.breakpoints.md}) {
    padding: 1rem;
  }
`;

const PageShell = ({ title, children }) => (
  <Wrapper>
    <TopBar>
      <Logo>{title || PRODUCT_NAME}</Logo>
      <AppSwitcher />
    </TopBar>
    <Content>{children}</Content>
  </Wrapper>
);

export default PageShell;
