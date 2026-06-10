import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FiX, FiArrowRight, FiArrowLeft, FiCheck } from 'react-icons/fi';

import { STORAGE_PREFIX } from '../../config/brand';

const STORAGE_KEY = `${STORAGE_PREFIX}-onboarding-complete`;
const LEGACY_STORAGE_KEY = 'tradepulse-onboarding-complete';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const Modal = styled.div`
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: ${props => props.theme.borderRadius.xl};
  box-shadow: ${props => props.theme.shadows.xl};
  max-width: 480px;
  width: 100%;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 1.5rem 1.5rem 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const StepIndicator = styled.div`
  display: flex;
  gap: 0.375rem;
  padding: 0 1.5rem 1rem;
`;

const Dot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$active ? props.theme.colors.accent : props.theme.colors.border};
  transition: background 0.2s;
`;

const Body = styled.div`
  padding: 0 1.5rem 1.5rem;
`;

const Icon = styled.div`
  width: 3rem;
  height: 3rem;
  border-radius: ${props => props.theme.borderRadius.lg};
  background: ${props => props.theme.colors.gradientSubtle};
  border: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin-bottom: 1rem;
`;

const Title = styled.h2`
  font-size: 1.375rem;
  font-weight: 600;
  color: ${props => props.theme.colors.text};
  margin: 0 0 0.5rem;
`;

const Description = styled.p`
  color: ${props => props.theme.colors.textSecondary};
  line-height: 1.6;
  margin: 0;
  font-size: 0.9375rem;
`;

const Footer = styled.div`
  padding: 1rem 1.5rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
`;

const SkipButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0.5rem;

  &:hover {
    color: ${props => props.theme.colors.text};
  }
`;

const NavButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1.25rem;
  border-radius: ${props => props.theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  ${props => props.$primary ? `
    background: ${props.theme.colors.gradient};
    color: white;
    border: none;
    &:hover { opacity: 0.9; }
  ` : `
    background: transparent;
    color: ${props.theme.colors.text};
    border: 1px solid ${props.theme.colors.border};
    &:hover { background: ${props.theme.colors.surfaceElevated}; }
  `}
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.textSecondary};
  cursor: pointer;
  padding: 0.25rem;
  display: flex;

  &:hover {
    color: ${props => props.theme.colors.text};
  }
`;

const STEPS = [
  {
    icon: '📟',
    title: 'Dealerboard',
    description: 'Your trading floor lives here. Line buttons show real-time status — idle, ringing, in-call, or monitored. Use the page controls to navigate between button pages.',
  },
  {
    icon: '🎙️',
    title: 'Instant Intercom',
    description: 'Connect instantly with direct contacts and group calls. Hold the PTT button to transmit, or enable latch mode for hands-free. Broadcast monitors let you listen to live feeds.',
  },
  {
    icon: '💬',
    title: 'Messaging',
    description: 'Secure Matrix-based chat for trade coordination. Search conversations, start new threads, and share files with your desk.',
  },
  {
    icon: '⚙️',
    title: 'Settings & Presence',
    description: 'Set your availability status, configure audio devices, and manage call forwarding from Quick Controls. Full preferences are in Settings via the top navigation.',
  },
];

export function isOnboardingComplete() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return true;
    // Migrate from previous product name
    if (localStorage.getItem(LEGACY_STORAGE_KEY) === 'true') {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function markOnboardingComplete() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

const OnboardingTour = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnboardingComplete()) {
      setVisible(true);
    }
  }, []);

  const finish = () => {
    markOnboardingComplete();
    setVisible(false);
    onComplete?.();
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finish();
    }
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Overlay>
      <Modal role="dialog" aria-labelledby="onboarding-title">
        <Header>
          <StepIndicator>
            {STEPS.map((_, i) => (
              <Dot key={i} $active={i === step} />
            ))}
          </StepIndicator>
          <CloseButton onClick={finish} aria-label="Skip tour">
            <FiX />
          </CloseButton>
        </Header>
        <Body>
          <Icon>{current.icon}</Icon>
          <Title id="onboarding-title">{current.title}</Title>
          <Description>{current.description}</Description>
        </Body>
        <Footer>
          <SkipButton onClick={finish}>Skip tour</SkipButton>
          <NavButtons>
            {step > 0 && (
              <Button onClick={() => setStep(step - 1)}>
                <FiArrowLeft />
                Back
              </Button>
            )}
            <Button $primary onClick={handleNext}>
              {isLast ? (
                <>
                  <FiCheck />
                  Get started
                </>
              ) : (
                <>
                  Next
                  <FiArrowRight />
                </>
              )}
            </Button>
          </NavButtons>
        </Footer>
      </Modal>
    </Overlay>
  );
};

export default OnboardingTour;
