import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { FiArrowLeft, FiHome } from 'react-icons/fi';
import { useAuthStore } from '../../stores/authStore';
import { getDefaultHomePath } from '../../utils/navigation';

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.theme.colors.background};
  padding: 2rem;
`;

const Card = styled.div`
  text-align: center;
  max-width: 420px;
  padding: 3rem 2rem;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.xl};
  box-shadow: ${props => props.theme.shadows.lg};
`;

const Code = styled.div`
  font-size: 4rem;
  font-weight: 700;
  background: ${props => props.theme.colors.gradient};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin-bottom: 1rem;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin-bottom: 0.5rem;
`;

const Message = styled.p`
  color: ${props => props.theme.colors.textSecondary};
  margin-bottom: 2rem;
  line-height: 1.5;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: center;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  ${props => props.$primary ? `
    background: ${props.theme.colors.gradient};
    color: white;
    border: none;
    &:hover { opacity: 0.9; transform: translateY(-1px); }
  ` : `
    background: transparent;
    color: ${props.theme.colors.text};
    border: 1px solid ${props.theme.colors.border};
    &:hover { background: ${props.theme.colors.surfaceElevated}; }
  `}
`;

const NotFound = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  return (
    <Container>
      <Card>
        <Code>404</Code>
        <Title>Page not found</Title>
        <Message>
          The page you're looking for doesn't exist or has been moved.
        </Message>
        <Actions>
          <Button onClick={() => navigate(-1)}>
            <FiArrowLeft />
            Go back
          </Button>
          <Button $primary onClick={() => navigate(getDefaultHomePath(user))}>
            <FiHome />
            Home
          </Button>
        </Actions>
      </Card>
    </Container>
  );
};

export default NotFound;
